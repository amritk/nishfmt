// Layout/LineLength, with the CheckLineBreakable mixin and the parts of
// LineLengthHelp its defaults use (Max 120, AllowHeredoc, AllowURI with the
// http/https schemes, AllowQualifiedName, AllowCopDirectives; SplitStrings
// off, so strings are never split).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_ASSIGNMENT,
  F_BEGIN,
  F_END,
  F_HEREDOC_BODY,
  F_KEYWORD,
  F_NAME,
  NT_ARRAY,
  NT_BLOCK,
  NT_CSEND,
  NT_DEF,
  NT_DEFS,
  NT_HASH,
  NT_LAMBDA,
  NT_NUMBLOCK,
  NT_SEND,
  V_NIL,
} from "../ast";
import { add32, sub32 } from "../../core/arr";
import { fault } from "../../core/fault";
import { RbCop } from "../cop";
import { rnE, rnHas, rnHeredoc, rnS } from "../node";
import { RbSource } from "../source";
import { TK_tSEMI } from "../tables";
import { RbLayLines, rbLayCommentAtLine, rbLayDirectiveMode, rbLayRxSpace, rbLayStripWs } from "./layout_empty_help";
import { rmlIsBlock, rmlIsCall, rmlIsDef, rmlIsStr, rmlKids, rmlSingleLine } from "./layout_multiline_help";
import { rbLitUWord } from "./lit_unicode";
import { ssxDefArgs, ssxDefBody, ssxDefName, ssxMeth } from "./style_syntax_help";

const RB_LL_MAX: i32 = 120;
// Layout/IndentationWidth's Width (IndentationStyle has no IndentationWidth).
const RB_LL_INDENT: i32 = 2;

/** The 0-based line index of a position (its line number is at least 1). */
const rbLlLineIdx = (src: RbSource, pos: i32): i32 => {
  const l = src.line(pos);
  if (l < 1) {
    fault();
    return 0;
  }
  return l - 1;
};

/** The end of the run of rbLayRxSpace from `q0` before `e`. */
const rbLlSpaceRun = (src: RbSource, q0: i32, e: i32): i32 => {
  const pts = src.pts;
  let q = q0;
  while (q < e) {
    if (q < 0 || q >= pts.length) {
      fault();
      return q;
    }
    if (!rbLayRxSpace(pts[q])) {
      break;
    }
    q++;
  }
  return q;
};

// ---- Nodes (CheckLineBreakable) -------------------------------------------------------

const rbLlType = (src: RbSource, n: i32, t: i32): boolean => src.a.isNode(n) && src.a.type(n) === t;

const rbLlFirstLine = (src: RbSource, n: i32): i32 => src.line(src.a.exS(n));

const rbLlLastLine = (src: RbSource, n: i32): i32 => src.line(src.a.exE(n));

/** Node#receiver as chained_to_heredoc? follows it (V_NIL for none). */
const rbLlReceiver = (src: RbSource, n: i32): i32 => {
  const a = src.a;
  if (!a.isNode(n)) {
    return V_NIL;
  }
  const t = a.type(n);
  if (t === NT_SEND || t === NT_CSEND || t === NT_DEFS) {
    return a.kid(n, 0);
  }
  if (t === NT_BLOCK || t === NT_NUMBLOCK) {
    const s = a.kid(n, 0);
    return rmlIsCall(src, s) ? a.kid(s, 0) : V_NIL;
  }
  return V_NIL;
};

/** StrNode#heredoc? on any node (false for the others). */
const rbLlHeredoc = (src: RbSource, n: i32): boolean => rmlIsStr(src, n) && rnHeredoc(src, n);

/** CheckLineBreakable#chained_to_heredoc? */
const rbLlChainedToHeredoc = (src: RbSource, n0: i32): boolean => {
  let n = rbLlReceiver(src, n0);
  while (n !== V_NIL) {
    if (rbLlHeredoc(src, n)) {
      return true;
    }
    n = rbLlReceiver(src, n);
  }
  return false;
};

/** HashNode#braces? */
const rbLlBraces = (src: RbSource, n: i32): boolean => rnHas(src, n, F_END) && src.at(rnS(src, n, F_END)) === 125;

/** The arguments of a call. */
const rbLlCallArgs = (src: RbSource, n: i32): i32[] => {
  const out: i32[] = [];
  for (let i = 2; i < src.a.nKid(n); i++) {
    out.push(src.a.kid(n, i));
  }
  return out;
};

/** CheckLineBreakable#process_args: a trailing brace-less hash counts as its pairs. */
const rbLlProcessArgs = (src: RbSource, n: i32): i32[] => {
  const args = rbLlCallArgs(src, n);
  const k = toI32(args.length);
  if (k === 0) {
    return args;
  }
  const last = args[k - 1];
  if (!rbLlType(src, last, NT_HASH) || rbLlBraces(src, last)) {
    return args;
  }
  const out: i32[] = [];
  for (let i = 0; i < k - 1 && i < args.length; i++) {
    out.push(args[i]);
  }
  for (const c of rmlKids(src, last)) {
    out.push(c);
  }
  return out;
};

/** CheckLineBreakable#breakable_collection? */
const rbLlBreakableCollection = (src: RbSource, n: i32, count: i32): boolean => {
  const bracket = !rbLlType(src, n, NT_HASH) || rnHas(src, n, F_BEGIN);
  return bracket && count >= 2;
};

/** compute_children_could_be_broken_up? */
const rbLlCouldBeBrokenUp = (src: RbSource, kids: i32[]): boolean => {
  const kl = toI32(kids.length) - 1;
  if (kl < 0 || kl >= kids.length || !(kids.length > 0)) {
    return false;
  }
  const first = kids[0];
  const last = kids[kl];
  if (rbLlFirstLine(src, first) === rbLlLastLine(src, last)) {
    return false;
  }
  let lastSeen = -1;
  for (const c of kids) {
    if (lastSeen >= rbLlFirstLine(src, c)) {
      return true;
    }
    lastSeen = rbLlLastLine(src, c);
  }
  return false;
};

/** contained_by_breakable_collection_on_same_line? */
const rbLlContainedSameLine = (src: RbSource, n: i32): boolean => {
  const fl = rbLlFirstLine(src, n);
  let p = src.parent(n);
  while (p !== V_NIL) {
    if (rbLlFirstLine(src, p) !== fl) {
      return false;
    }
    let count = -1;
    if (rbLlType(src, p, NT_HASH) || rbLlType(src, p, NT_ARRAY)) {
      count = src.a.nKid(p);
    } else if (rmlIsCall(src, p)) {
      count = toI32(rbLlProcessArgs(src, p).length);
    }
    if (count >= 0 && rbLlBreakableCollection(src, p, count)) {
      return true;
    }
    p = src.parent(p);
  }
  return false;
};

/** contained_by_multiline_collection_that_could_be_broken_up? */
const rbLlContainedMultiline = (src: RbSource, n: i32): boolean => {
  let p = src.parent(n);
  while (p !== V_NIL) {
    if (rbLlType(src, p, NT_HASH) || rbLlType(src, p, NT_ARRAY)) {
      const kids = rmlKids(src, p);
      if (rbLlBreakableCollection(src, p, toI32(kids.length))) {
        return rbLlCouldBeBrokenUp(src, kids);
      }
    }
    if (rmlIsCall(src, p)) {
      const args = rbLlProcessArgs(src, p);
      if (rbLlBreakableCollection(src, p, toI32(args.length))) {
        return rbLlCouldBeBrokenUp(src, args);
      }
    }
    p = src.parent(p);
  }
  return false;
};

/** The first heredoc string at or under `n` in pre-order (V_NIL for none). */
const rbLlFirstHeredoc = (src: RbSource, n: i32): i32 => {
  if (!src.a.isNode(n)) {
    return V_NIL;
  }
  if (rbLlHeredoc(src, n)) {
    return n;
  }
  for (let i = 0; i < src.a.nKid(n); i++) {
    const r = rbLlFirstHeredoc(src, src.a.kid(n, i));
    if (r !== V_NIL) {
      return r;
    }
  }
  return V_NIL;
};

/** CheckLineBreakable#heredoc_begin_position (-1 for nil). */
const rbLlHeredocBegin = (src: RbSource, n: i32): i32 => {
  const kids = rmlIsCall(src, n) ? rbLlCallArgs(src, n) : rmlKids(src, n);
  for (const c of kids) {
    const h = rbLlFirstHeredoc(src, c);
    if (h !== V_NIL) {
      return src.a.exS(h);
    }
  }
  return -1;
};

/** CheckLineBreakable#first_element_movable? */
const rbLlFirstMovable = (src: RbSource, n: i32): boolean => {
  if (rmlIsDef(src, n)) {
    return rnHas(src, ssxDefArgs(src, n), F_BEGIN);
  }
  if (!rmlIsCall(src, n)) {
    return true;
  }
  if (
    rnHas(src, n, F_END) &&
    src.at(rnS(src, n, F_END)) === 41 &&
    toI64(rnE(src, n, F_END)) === toI64(rnS(src, n, F_END)) + toI64(1)
  ) {
    return true;
  }
  return src.a.nKid(n) > 2 && rbLlHeredoc(src, src.a.kid(n, 2));
};

// ---- URIs and qualified names (LineLengthHelp) ------------------------------------------

const rbLlAlpha = (c: i32): boolean => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);

const rbLlDigit = (c: i32): boolean => c >= 48 && c <= 57;

const rbLlHex = (c: i32): boolean => rbLlDigit(c) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);

/** [\-_.!~*'()a-zA-Z\d] (RFC 2396 unreserved). */
const rbLlUnreserved = (c: i32): boolean =>
  rbLlAlpha(c) ||
  rbLlDigit(c) ||
  c === 45 ||
  c === 95 ||
  c === 46 ||
  c === 33 ||
  c === 126 ||
  c === 42 ||
  c === 39 ||
  c === 40 ||
  c === 41;

/** Whether `chars` holds code point `c`. */
const rbLlIn = (chars: string, c: i32): boolean => {
  for (let i = 0; i < toI32(chars.length); i++) {
    if (chars.charCodeAt(i) === c) {
      return true;
    }
  }
  return false;
};

/**
 * Matches `(?:[set]|%[a-fA-F\d]{2})` at `p`: the position after it, or -1.
 * The set is the unreserved characters plus `extra`. Every position the URI
 * scan reads is within its line, so the guards that fault cannot fail.
 */
const rbLlUriChar = (src: RbSource, p: i32, lim: i32, extra: string): i32 => {
  if (p >= lim) {
    return -1;
  }
  const pts = src.pts;
  if (p < 0 || p >= pts.length) {
    fault();
    return -1;
  }
  const c = pts[p];
  if (rbLlUnreserved(c) || rbLlIn(extra, c)) {
    return p + 1;
  }
  if (c === 37 && toI64(p) + toI64(3) <= toI64(lim)) {
    const p1 = p + 1;
    if (p1 >= pts.length) {
      fault();
      return -1;
    }
    const p2 = p1 + 1;
    if (p2 >= pts.length) {
      fault();
      return -1;
    }
    const h1 = pts[p1];
    const h2 = pts[p2];
    if (rbLlHex(h1) && rbLlHex(h2)) {
      return p2 + 1;
    }
  }
  return -1;
};

/** The greedy run of rbLlUriChar from `p`. */
const rbLlUriRun = (src: RbSource, p0: i32, lim: i32, extra: string): i32 => {
  let p = p0;
  for (;;) {
    const q = rbLlUriChar(src, p, lim, extra);
    if (q < 0) {
      return p;
    }
    p = q;
  }
};

/** Whether `s` is a run of 1 to `max` hex digits. */
const rbLlHexRun = (src: RbSource, s: i32, e: i32, max: i32): boolean => {
  if (e <= s || toI64(e) - toI64(s) > toI64(max)) {
    return false;
  }
  const pts = src.pts;
  for (let i = s; i < e; i++) {
    if (i < 0 || i >= pts.length) {
      fault();
      return false;
    }
    if (!rbLlHex(pts[i])) {
      return false;
    }
  }
  return true;
};

/** `[s, e)` split at its colons. */
const rbLlColonParts = (src: RbSource, s: i32, e: i32): i32[] => {
  const out: i32[] = [s];
  const pts = src.pts;
  for (let i = s; i < e; i++) {
    if (i < 0 || i >= pts.length) {
      fault();
      break;
    }
    if (pts[i] === 58) {
      out.push(i);
      out.push(i + 1);
    }
  }
  out.push(e);
  return out;
};

/** \d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3} (RFC 2396), or dec-octets (RFC 3986). */
const rbLlIpv4 = (src: RbSource, s: i32, e: i32, strict: boolean): boolean => {
  const pts = src.pts;
  let p = s;
  for (let k = 0; k < 4; k++) {
    if (k > 0) {
      if (p >= e) {
        return false;
      }
      if (p < 0 || p >= pts.length) {
        fault();
        return false;
      }
      if (pts[p] !== 46) {
        return false;
      }
      p++;
    }
    // The digit run: its length (4 stands for any more than 3) and first three digits.
    let m = 0;
    let d0 = 0;
    let d1 = 0;
    let d2 = 0;
    while (p < e) {
      if (p < 0 || p >= pts.length) {
        fault();
        return false;
      }
      const c = pts[p];
      if (c < 48 || c > 57) {
        break;
      }
      if (m === 0) {
        d0 = c - 48;
      } else if (m === 1) {
        d1 = c - 48;
      } else if (m === 2) {
        d2 = c - 48;
      }
      if (m < 4) {
        m++;
      }
      p++;
    }
    if (m < 1 || m > 3) {
      return false;
    }
    if (strict) {
      if (m > 1 && d0 === 0) {
        return false;
      }
      // Each is a digit, which the masks keep.
      const e0 = d0 & 15;
      const e1 = d1 & 15;
      const e2 = d2 & 15;
      let v = e0;
      if (m === 2) {
        v = e0 * 10 + e1;
      } else if (m === 3) {
        v = e0 * 100 + e1 * 10 + e2;
      }
      if (v > 255) {
        return false;
      }
    }
  }
  return p === e;
};

/** RFC 2396's `(?:hex4:)*(?:hex4|IPv4addr)` over all of `[s, e)`. */
const rbLlIpv6Tail2396 = (src: RbSource, s: i32, e: i32): boolean => {
  const parts = rbLlColonParts(src, s, e);
  const k = toI32(parts.length) / 2;
  for (let i = 0; i >= 0 && i < k; i++) {
    const a = 2 * i;
    const b = a + 1;
    if (a >= parts.length || b >= parts.length) {
      fault();
      return false;
    }
    const ps = parts[a];
    const pe = parts[b];
    if (i + 1 < k) {
      if (!rbLlHexRun(src, ps, pe, 4)) {
        return false;
      }
    } else if (!rbLlHexRun(src, ps, pe, 4) && !rbLlIpv4(src, ps, pe, false)) {
      return false;
    }
  }
  return true;
};

/** Whether `[s, e)` is a colon-separated list of hex4 (empty counts). */
const rbLlHexList = (src: RbSource, s: i32, e: i32): i32 => {
  if (s === e) {
    return 0;
  }
  const parts = rbLlColonParts(src, s, e);
  const k = toI32(parts.length) / 2;
  for (let i = 0; i >= 0 && i < k; i++) {
    const a = 2 * i;
    const b = a + 1;
    if (a >= parts.length || b >= parts.length) {
      fault();
      return -1;
    }
    if (!rbLlHexRun(src, parts[a], parts[b], 4)) {
      return -1;
    }
  }
  return k;
};

/** The first `::` in `[s, e)`: its position, or -1. */
const rbLlDoubleColon = (src: RbSource, s: i32, e: i32): i32 => {
  const pts = src.pts;
  for (let i = s; i < e; i++) {
    const j = i + 1;
    if (j >= e) {
      break;
    }
    if (i < 0 || i >= pts.length || j < 0 || j >= pts.length) {
      fault();
      return -1;
    }
    if (pts[i] === 58 && pts[j] === 58) {
      return i;
    }
  }
  return -1;
};

/** The bracketed IPv6reference content of RFC 2396's regexp. */
const rbLlIpv6Ok2396 = (src: RbSource, s: i32, e: i32): boolean => {
  if (rbLlIpv6Tail2396(src, s, e)) {
    return true;
  }
  const pts = src.pts;
  for (let i = s; i < e; i++) {
    const j = i + 1;
    if (j >= e) {
      break;
    }
    if (i < 0 || i >= pts.length || j < 0 || j >= pts.length) {
      fault();
      return false;
    }
    if (pts[i] === 58 && pts[j] === 58) {
      // `j < e`, so `j + 1` is at most `e`.
      const t = j + 1;
      if (rbLlHexList(src, s, i) >= 0 && (t === e || rbLlIpv6Tail2396(src, t, e))) {
        return true;
      }
    }
  }
  return false;
};

/** RFC 3986's IPv6address over `[s, e)`. */
const rbLlIpv6Ok3986 = (src: RbSource, s: i32, e: i32): boolean => {
  // The groups after `::` (or all of them): the last may be an IPv4 address (two groups).
  const dc = rbLlDoubleColon(src, s, e);
  let rs = s;
  if (dc >= 0) {
    // `dc + 1 < e`, so `dc + 2` is at most `e`.
    rs = add32(dc, 2);
  }
  let right = 0;
  if (rs < e) {
    const parts = rbLlColonParts(src, rs, e);
    const k = toI32(parts.length) / 2;
    for (let i = 0; i >= 0 && i < k; i++) {
      // More groups than this can never make 8 or fit in 7.
      if (right > 100) {
        return false;
      }
      const a = 2 * i;
      const b = a + 1;
      if (a >= parts.length || b >= parts.length) {
        fault();
        return false;
      }
      const ps = parts[a];
      const pe = parts[b];
      if (rbLlHexRun(src, ps, pe, 4)) {
        right++;
      } else if (i + 1 === k && rbLlIpv4(src, ps, pe, true)) {
        right += 2;
      } else {
        return false;
      }
    }
  }
  if (dc < 0) {
    return right === 8;
  }
  const left = rbLlHexList(src, s, dc);
  if (left < 0) {
    return false;
  }
  // `h16::ipv4` style ls32 needs two groups' room; a lone h16 after `::` needs one.
  return toI64(left) + toI64(right) <= toI64(7);
};

/** The RFC 2396 host at `p`: the position after it, or -1 (no host). */
const rbLlUriHost = (src: RbSource, p: i32, lim: i32, ipv6: i32[]): i32 => {
  const pts = src.pts;
  let q = p;
  for (;;) {
    if (q >= lim) {
      break;
    }
    if (q < 0 || q >= pts.length) {
      fault();
      return -1;
    }
    const c = pts[q];
    if (rbLlAlpha(c) || rbLlDigit(c) || c === 45 || c === 46) {
      q++;
      continue;
    }
    if (c === 37 && toI64(q) + toI64(2) < toI64(lim)) {
      const q1 = q + 1;
      if (q1 >= pts.length) {
        fault();
        return -1;
      }
      const q2 = q1 + 1;
      if (q2 >= pts.length) {
        fault();
        return -1;
      }
      const h1 = pts[q1];
      const h2 = pts[q2];
      if (rbLlHex(h1) && rbLlHex(h2)) {
        q = q2 + 1;
        continue;
      }
    }
    break;
  }
  if (q > p) {
    return q;
  }
  if (p < lim) {
    if (p < 0 || p >= pts.length) {
      fault();
      return -1;
    }
    if (pts[p] === 91) {
      const b = p + 1;
      let c = b;
      while (c < lim) {
        if (c < 0 || c >= pts.length) {
          fault();
          return -1;
        }
        if (pts[c] === 93) {
          break;
        }
        c++;
      }
      if (c < lim && rbLlIpv6Ok2396(src, b, c)) {
        ipv6.push(b);
        ipv6.push(c);
        return c + 1;
      }
    }
  }
  return -1;
};

/** `(?::(\d*))?` after a host. */
const rbLlUriPort = (src: RbSource, p: i32, lim: i32): i32 => {
  if (p >= lim) {
    return p;
  }
  const pts = src.pts;
  if (p < 0 || p >= pts.length) {
    fault();
    return p;
  }
  if (pts[p] === 58) {
    let q = p + 1;
    while (q < lim) {
      if (q < 0 || q >= pts.length) {
        fault();
        return q;
      }
      if (!rbLlDigit(pts[q])) {
        break;
      }
      q++;
    }
    return q;
  }
  return p;
};

/** Whether the code points at `p` (before `lim`) spell ASCII `w`. */
const rbLlHasAt = (src: RbSource, p: i32, lim: i32, w: string): boolean => {
  const k = toI32(w.length);
  if (toI64(p) + toI64(k) > toI64(lim)) {
    return false;
  }
  const pts = src.pts;
  let j = p;
  for (let i = 0; i < k; i++) {
    if (j < 0 || j >= pts.length) {
      fault();
      return false;
    }
    if (pts[j] !== w.charCodeAt(i)) {
      return false;
    }
    j++;
  }
  return true;
};

/** valid[0] = false, for the URI scan's one-slot result. */
const rbLlInvalid = (valid: boolean[]): void => {
  if (valid.length > 0) {
    valid[0] = false;
  } else {
    fault();
  }
};

/** The code point at `q` when `q < lim` (and it is in the source), or -1. */
const rbLlPtBefore = (src: RbSource, q: i32, lim: i32): i32 => {
  if (q >= lim) {
    return -1;
  }
  const pts = src.pts;
  if (q < 0 || q >= pts.length) {
    fault();
    return -1;
  }
  return pts[q];
};

/** Whether `[f, e)` holds a `[` or a `]`. */
const rbLlHasBracket = (src: RbSource, f: i32, e: i32): boolean => {
  const pts = src.pts;
  for (let i = f; i < e; i++) {
    if (i < 0 || i >= pts.length) {
      fault();
      return false;
    }
    const c = pts[i];
    if (c === 91 || c === 93) {
      return true;
    }
  }
  return false;
};

/**
 * The match of LineLengthHelp#uri_regexp (RFC 2396's absolute URI behind an
 * exact `http:`/`https:`) at `p`: its end, or -1; and whether URI.parse
 * (RFC 3986) takes it, in `valid[0]`.
 */
const rbLlUriAt = (src: RbSource, p: i32, lim: i32, valid: boolean[]): i32 => {
  let q = -1;
  // rbLlHasAt holds `p + 5` (or 6) at most `lim`, so add32 never faults.
  if (rbLlHasAt(src, p, lim, "http:")) {
    q = add32(p, 5);
  } else if (rbLlHasAt(src, p, lim, "https:")) {
    q = add32(p, 6);
  } else {
    return -1;
  }
  if (valid.length > 0) {
    valid[0] = true;
  } else {
    fault();
  }
  const op = rbLlUriChar(src, q, lim, ";?:@&=+$,");
  const pts = src.pts;
  if (op >= 0) {
    // opaque_part: RFC 3986 takes `[` and `]` only in its query.
    const e = rbLlUriRun(src, op, lim, ";/?:@&=+$,[]");
    let inQuery = false;
    for (let i = q; i < e; i++) {
      if (i < 0 || i >= pts.length) {
        fault();
        return -1;
      }
      const c = pts[i];
      if (c === 63) {
        inQuery = true;
      } else if ((c === 91 || c === 93) && !inQuery) {
        rbLlInvalid(valid);
      }
    }
    q = e;
  } else {
    if (q < lim && toI64(q) + toI64(1) < toI64(lim)) {
      if (q < 0 || q >= pts.length || q + 1 >= pts.length) {
        fault();
        return -1;
      }
      if (pts[q] === 47 && pts[q + 1] === 47) {
        q += 2;
        const ipv6: i32[] = [];
        const u = rbLlUriRun(src, q, lim, ";:&=+$,");
        let h = -1;
        if (rbLlPtBefore(src, u, lim) === 64) {
          // `u < lim`.
          h = rbLlUriHost(src, add32(u, 1), lim, ipv6);
        }
        if (h < 0) {
          h = rbLlUriHost(src, q, lim, ipv6);
        }
        if (h >= 0) {
          q = rbLlUriPort(src, h, lim);
          // The pair rbLlUriHost pushed: [begin, end).
          const i1 = toI32(ipv6.length) - 1;
          if (i1 >= 0) {
            const i0 = i1 - 1;
            if (i0 < 0 || i1 >= ipv6.length) {
              fault();
              return -1;
            }
            if (!rbLlIpv6Ok3986(src, ipv6[i0], ipv6[i1])) {
              rbLlInvalid(valid);
            }
          }
        }
      }
    }
    // `q < lim` whenever the code point is not -1.
    if (rbLlPtBefore(src, q, lim) === 47) {
      q = rbLlUriRun(src, add32(q, 1), lim, ":@&=+$,;/");
    }
    if (rbLlPtBefore(src, q, lim) === 63) {
      q = rbLlUriRun(src, add32(q, 1), lim, ";/?:@&=+$,[]");
    }
  }
  if (rbLlPtBefore(src, q, lim) === 35) {
    const f = add32(q, 1);
    q = rbLlUriRun(src, f, lim, ";/?:@&=+$,[]");
    if (rbLlHasBracket(src, f, q)) {
      rbLlInvalid(valid);
    }
  }
  return q;
};

/** \w as \b sees it (Unicode Word). */
const rbLlWord = (src: RbSource, p: i32, s: i32, e: i32): boolean => {
  if (!(p >= s && p < e)) {
    return false;
  }
  const pts = src.pts;
  if (p < 0 || p >= pts.length) {
    fault();
    return false;
  }
  return rbLitUWord(pts[p]);
};

/** [A-Za-z0-9_] */
const rbLlIdent = (c: i32): boolean => rbLlAlpha(c) || rbLlDigit(c) || c === 95;

/** The end of the run of rbLlIdent from `r` before `e`. */
const rbLlIdentRun = (src: RbSource, r0: i32, e: i32): i32 => {
  const pts = src.pts;
  let r = r0;
  while (r < e) {
    if (r < 0 || r >= pts.length) {
      fault();
      return r;
    }
    if (!rbLlIdent(pts[r])) {
      break;
    }
    r++;
  }
  return r;
};

/** qualified_name_regexp at `p` (a word boundary): its end, or -1. */
const rbLlQualifiedAt = (src: RbSource, p: i32, s: i32, e: i32): i32 => {
  // rbLlWord answers false before `s`, and positions are not negative.
  if (p > 0 && p > s && rbLlWord(src, p - 1, s, e)) {
    return -1;
  }
  const pts = src.pts;
  let q = p;
  // The segment count: only 0, 1 and "2 or more" matter.
  let k = 0;
  let prev = -1;
  while (q < e) {
    if (q < 0 || q >= pts.length) {
      fault();
      return -1;
    }
    const c = pts[q];
    if (!(c >= 65 && c <= 90)) {
      break;
    }
    const r = rbLlIdentRun(src, q + 1, e);
    if (r < e && r + 1 < e) {
      if (r < 0 || r + 1 >= pts.length) {
        fault();
        return -1;
      }
      if (pts[r] === 58 && pts[r + 1] === 58) {
        if (k < 2) {
          k++;
        }
        prev = r;
        q = r + 2;
        continue;
      }
    }
    break;
  }
  if (k === 0) {
    return -1;
  }
  if (q < e) {
    if (q < 0 || q >= pts.length) {
      fault();
      return -1;
    }
    const c = pts[q];
    if (rbLlAlpha(c) || c === 95) {
      const r = rbLlIdentRun(src, q + 1, e);
      if (!rbLlWord(src, r, s, e)) {
        return r;
      }
    }
  }
  // One segment fewer: the last segment's name is the final name.
  return k >= 2 ? prev : -1;
};

// ---- The cop --------------------------------------------------------------------------

export class CopLayoutLineLength {
  c: RbCop;
  // Breakable ranges by 0-based line index.
  brkS: Map<i32, i32>;
  brkE: Map<i32, i32>;
  endless: Map<i32, i32>;
  // Heredoc openers (line, begin_pos) and bodies (first line, last line).
  hoLine: i32[];
  hoPos: i32[];
  hbFirst: i32[];
  hbLast: i32[];
  commentLines: Set<i32>;

  constructor() {
    this.c = new RbCop("Layout/LineLength");
    this.brkS = new Map<i32, i32>();
    this.brkE = new Map<i32, i32>();
    this.endless = new Map<i32, i32>();
    this.hoLine = [];
    this.hoPos = [];
    this.hbFirst = [];
    this.hbLast = [];
    this.commentLines = new Set<i32>();
  }

  run(src: RbSource): void {
    this.c.begin(src);
    this.brkS = new Map<i32, i32>();
    this.brkE = new Map<i32, i32>();
    this.endless = new Map<i32, i32>();
    this.hoLine = [];
    this.hoPos = [];
    this.hbFirst = [];
    this.hbLast = [];
    this.commentLines = new Set<i32>();
    const commS = src.commS;
    // commentCount() is commS.length.
    for (let i = 0; i < commS.length; i++) {
      this.commentLines.add(src.line(commS[i]));
    }
    for (const n of src.pre) {
      if (rbLlHeredoc(src, n)) {
        this.hoLine.push(src.line(src.a.exS(n)));
        this.hoPos.push(src.a.exS(n));
        this.hbFirst.push(src.line(rnS(src, n, F_HEREDOC_BODY)));
        this.hbLast.push(src.line(rnE(src, n, F_HEREDOC_BODY)));
      }
    }
    const L = new RbLayLines(src);
    this.semicolons(src);
    for (const n of src.pre) {
      const t = src.a.type(n);
      if (t === NT_BLOCK || t === NT_NUMBLOCK) {
        this.block(src, n);
      } else if (t === NT_ARRAY || t === NT_HASH || t === NT_SEND || t === NT_CSEND) {
        this.breakableNode(src, L, n);
      } else if (t === NT_DEF || t === NT_DEFS) {
        if (rnHas(src, n, F_ASSIGNMENT)) {
          this.endless.set(rbLlLineIdx(src, src.a.exS(n)), n);
        } else {
          this.breakableNode(src, L, n);
        }
      }
    }
    for (let i = 0; i < L.n; i++) {
      this.checkLine(src, L, i);
    }
  }

  /** after_heredoc_opener? for a range starting at `pos`. */
  private afterHeredocOpener(src: RbSource, pos: i32): boolean {
    const l = src.line(pos);
    const hoLine = this.hoLine;
    const hoPos = this.hoPos;
    // The two grow together.
    for (let i = 0; i < hoLine.length && i < hoPos.length; i++) {
      if (hoLine[i] === l && hoPos[i] < pos) {
        return true;
      }
    }
    return false;
  }

  /** check_for_breakable_semicolons */
  private semicolons(src: RbSource): void {
    const tokT = src.tokT;
    const tokS = src.tokS;
    const tokE = src.tokE;
    let i = toI32(tokT.length);
    while (i > 0) {
      i--;
      if (i >= tokT.length) {
        fault();
        return;
      }
      if (tokT[i] !== TK_tSEMI) {
        continue;
      }
      if (i >= tokS.length || i >= tokE.length) {
        fault();
        return;
      }
      const e = tokE[i];
      const ts = tokS[i];
      if (src.line(e) !== src.line(ts)) {
        continue;
      }
      const c = src.at(e);
      if (c === 10 || c === 13 || c === 59) {
        continue;
      }
      if (this.afterHeredocOpener(src, e)) {
        continue;
      }
      const li = rbLlLineIdx(src, e);
      this.brkS.set(li, e);
      this.brkE.set(li, add32(e, 1));
    }
  }

  /** check_for_breakable_block */
  private block(src: RbSource, n: i32): void {
    if (!rmlSingleLine(src, n)) {
      return;
    }
    const a = src.a;
    const li = rbLlLineIdx(src, a.exS(n));
    const send = a.kid(n, 0);
    const lambda = rbLlType(src, send, NT_LAMBDA) || (rmlIsCall(src, send) && ssxMeth(src, send) === "lambda");
    let rs = 0;
    const args = a.type(n) === NT_BLOCK ? a.kid(n, 1) : V_NIL;
    if (args !== V_NIL && a.isNode(args) && a.nKid(args) > 0 && !lambda && rnHas(src, args, F_END)) {
      rs = rnS(src, args, F_END);
    } else if (src.at(rnS(src, n, F_END)) === 125) {
      rs = rnS(src, n, F_BEGIN);
    } else {
      rs = add32(rnS(src, n, F_BEGIN), 1);
    }
    const pos = add32(rs, 1);
    if (this.afterHeredocOpener(src, pos)) {
      return;
    }
    this.brkS.set(li, pos);
    this.brkE.set(li, add32(pos, 1));
  }

  /** check_for_breakable_node */
  private breakableNode(src: RbSource, L: RbLayLines, n: i32): void {
    const b = this.extract(src, L, n);
    if (b === V_NIL) {
      return;
    }
    const li = rbLlLineIdx(src, src.a.exS(b));
    if (this.brkS.has(li) || this.afterHeredocOpener(src, src.a.exS(b))) {
      return;
    }
    this.brkS.set(li, src.a.exS(b));
    this.brkE.set(li, src.a.exE(b));
  }

  /** extract_breakable_node (V_NIL for nil). */
  private extract(src: RbSource, L: RbLayLines, n: i32): i32 {
    if (rmlIsCall(src, n)) {
      if (rbLlChainedToHeredoc(src, n)) {
        return V_NIL;
      }
      return this.fromElements(src, L, n, rbLlProcessArgs(src, n));
    }
    if (rmlIsDef(src, n)) {
      return this.fromElements(src, L, n, rmlKids(src, ssxDefArgs(src, n)));
    }
    return this.fromElements(src, L, n, rmlKids(src, n));
  }

  /** extract_breakable_node_from_elements */
  private fromElements(src: RbSource, L: RbLayLines, n: i32, els0: i32[]): i32 {
    if (!rbLlBreakableCollection(src, n, toI32(els0.length))) {
      return V_NIL;
    }
    const fl = rbLlFirstLine(src, n);
    // A line number is at least 1.
    if (fl < 1) {
      fault();
      return V_NIL;
    }
    const li = L.idx(fl - 1);
    if (li >= 0) {
      const Ls = L.s;
      const Le = L.e;
      if (li >= Ls.length || li >= Le.length) {
        fault();
        return V_NIL;
      }
      if (toI64(Le[li]) - toI64(Ls[li]) <= toI64(RB_LL_MAX)) {
        return V_NIL;
      }
    }
    if (this.commentLines.has(fl)) {
      return V_NIL;
    }
    if (this.safeToIgnore(src, n)) {
      return V_NIL;
    }
    // extract_first_element_over_column_limit
    let els = els0;
    if (!rbLlFirstMovable(src, n)) {
      const rest: i32[] = [];
      for (let i = 1; i < toI32(els0.length); i++) {
        rest.push(els0[i]);
      }
      els = rest;
    }
    const k = toI32(els.length);
    let i = 0;
    while (i >= 0 && i < k && i < els.length) {
      const es = src.a.exS(els[i]);
      if (!(src.column(es) <= RB_LL_MAX && src.line(es) === fl)) {
        break;
      }
      i++;
    }
    // shift_elements_for_heredoc_arg
    const t = src.a.type(n);
    if (rmlIsCall(src, n) || t === NT_ARRAY || t === NT_HASH) {
      const hp = rbLlHeredocBegin(src, n);
      if (hp >= 0) {
        let lastSafe = -1;
        let j = k;
        while (j > 0) {
          j--;
          if (j >= els.length) {
            fault();
            return V_NIL;
          }
          if (src.a.exS(els[j]) <= hp) {
            lastSafe = j;
            break;
          }
        }
        if (lastSafe < 0) {
          return V_NIL;
        }
        if (lastSafe === 0) {
          if (!(els.length > 0)) {
            fault();
            return V_NIL;
          }
          if (src.a.exE(els[0]) > hp) {
            return V_NIL;
          }
        }
        // `lastSafe + 1 < i`, which `i` (at least 0) keeps in i32.
        if (lastSafe < i - 1) {
          i = lastSafe + 1;
        }
      }
    }
    if (k === 0) {
      return V_NIL;
    }
    if (i > 0) {
      const im = i - 1;
      if (im < els.length) {
        return els[im];
      }
    } else if (els.length > 0) {
      return els[0];
    }
    fault();
    return V_NIL;
  }

  /** safe_to_ignore? */
  private safeToIgnore(src: RbSource, n: i32): boolean {
    if (rmlIsDef(src, n)) {
      const args = ssxDefArgs(src, n);
      if (rbLlFirstLine(src, n) !== rbLlLastLine(src, src.a.kid(args, -1))) {
        return true;
      }
    } else if (rbLlFirstLine(src, n) !== rbLlLastLine(src, n)) {
      return true;
    }
    return rbLlContainedSameLine(src, n) || rbLlContainedMultiline(src, n);
  }

  // ---- Lines -----------------------------------------------------------------------------

  /** LineLengthHelp#indentation_difference (tab width 2). */
  private indentDiff(src: RbSource, s: i32, e: i32): i32 {
    if (s === e) {
      return 0;
    }
    const pts = src.pts;
    // A line lies within the source.
    if (s < 0 || e > pts.length) {
      fault();
      return 0;
    }
    if (s >= pts.length || pts[s] !== 9) {
      return 0;
    }
    let p = s;
    while (p >= 0 && p < e && p < pts.length && pts[p] === 9) {
      p++;
    }
    // (RB_LL_INDENT - 1) is 1; `p >= s >= 0`.
    return p === e ? 0 : p - s;
  }

  /** line_in_permitted_heredoc? */
  private inHeredoc(l: i32): boolean {
    const hbFirst = this.hbFirst;
    const hbLast = this.hbLast;
    // The two grow together.
    for (let i = 0; i < hbFirst.length && i < hbLast.length; i++) {
      if (hbFirst[i] <= l && l < hbLast[i]) {
        return true;
      }
    }
    return false;
  }

  /** check_line */
  private checkLine(src: RbSource, L: RbLayLines, i: i32): void {
    const Ls = L.s;
    const Le = L.e;
    const pts = src.pts;
    if (i < 0 || i >= Ls.length || i >= Le.length) {
      fault();
      return;
    }
    const s = Ls[i];
    const e = Le[i];
    // A line [s, e) lies within the source.
    if (s < 0 || e < 0 || e < s || e > pts.length) {
      fault();
      return;
    }
    const d = this.indentDiff(src, s, e);
    if (d < 0) {
      fault();
      return;
    }
    const len = add32(e - s, d);
    if (len <= RB_LL_MAX) {
      return;
    }
    if (i === 0 && s < e && s + 1 < e && s + 1 < pts.length && pts[s] === 35 && pts[s + 1] === 33) {
      return;
    }
    if (this.inHeredoc(i + 1)) {
      return;
    }
    // RB_LL_MAX is 120.
    const hl = 120 - d;
    let highlight = 0;
    if (hl > 0) {
      highlight = hl;
    }
    const node = this.endless.get(i) ?? V_NIL;
    if (node !== V_NIL) {
      this.endlessOffense(src, s, highlight, len, node);
      return;
    }
    const ci = rbLayCommentAtLine(src, i + 1);
    if (ci >= 0) {
      const commS = src.commS;
      const commE = src.commE;
      if (ci >= commS.length || ci >= commE.length) {
        fault();
        return;
      }
      if (rbLayDirectiveMode(src.src(commS[ci], commE[ci])).length > 0) {
        this.directiveLine(src, i, s, e);
        return;
      }
    }
    // check_line_for_exemptions
    const uri = this.excessive(src, s, e, len, true);
    const qn = this.excessive(src, s, e, len, false);
    let allowed = false;
    if (uri.length > 0 && qn.length > 0) {
      allowed = this.allowedPosition(uri, len) && this.allowedPosition(qn, len);
    } else if (uri.length > 0) {
      allowed = this.allowedPosition(uri, len);
    } else if (qn.length > 0) {
      allowed = this.allowedPosition(qn, len);
    }
    if (allowed) {
      return;
    }
    const r = uri.length > 0 ? uri : qn;
    // A range is empty or [begin, end).
    let from = highlight;
    if (r.length > 1 && r[0] < RB_LL_MAX) {
      from = r[1];
    }
    const os = add32(s, from);
    let oe = os;
    if (len > from) {
      oe = add32(os, sub32(len, from));
    }
    this.register(src, i, os, oe);
  }

  /** allowed_position? */
  private allowedPosition(r: i32[], len: i32): boolean {
    // `r` is [begin, end) here.
    if (!(r.length > 1)) {
      fault();
      return false;
    }
    return r[0] < RB_LL_MAX && r[1] === len;
  }

  /** find_excessive_range: [begin, end) columns, or empty for nil. */
  private excessive(src: RbSource, s: i32, e: i32, len: i32, uri: boolean): i32[] {
    let mb = -1;
    let me = -1;
    const none: i32[] = [];
    const pts = src.pts;
    // A line [s, e) lies within the source (checkLine).
    if (s < 0 || e < 0 || e < s || e > pts.length) {
      fault();
      return none;
    }
    let p = s;
    const valid: boolean[] = [true];
    // `p` starts at `s` and only grows.
    while (p >= 0 && p < e) {
      let m = -1;
      if (uri) {
        if (valid.length > 0) {
          valid[0] = true;
        }
        m = rbLlUriAt(src, p, e, valid);
      } else {
        m = rbLlQualifiedAt(src, p, s, e);
      }
      if (m < 0) {
        p++;
        continue;
      }
      if (!(valid.length > 0)) {
        fault();
        return none;
      }
      if (valid[0]) {
        mb = p - s;
        me = m - s;
      }
      p = m;
    }
    if (mb < 0) {
      return none;
    }
    let end = me;
    const n = e - s;
    // A YARD `{<uri> <title>}` link: up to the line's closing brace.
    const el = e - 1;
    if (n > 0 && el >= 0 && el < pts.length && pts[el] === 125) {
      let open = false;
      for (let j = s; j >= 0 && j < el && j < pts.length; j++) {
        if (pts[j] === 123) {
          open = true;
          break;
        }
      }
      if (open && end <= n) {
        end = n;
      }
    }
    // Up to the start of the next word.
    if (end < n) {
      let q = add32(s, end);
      while (q >= 0 && q < e && q < pts.length && !rbLayRxSpace(pts[q])) {
        q++;
      }
      end = sub32(q, s);
    }
    const d = this.indentDiff(src, s, e);
    const b = add32(mb, d);
    end = add32(end, d);
    if (b < RB_LL_MAX && end < RB_LL_MAX) {
      return none;
    }
    return [b, end];
  }

  /** check_directive_line */
  private directiveLine(src: RbSource, i: i32, s: i32, e: i32): void {
    const p = this.directiveStart(src, s, e);
    let b = p < 0 ? e : p;
    const pts = src.pts;
    while (b > s && b > 0) {
      const bp = b - 1;
      if (bp >= pts.length) {
        fault();
        return;
      }
      if (!rbLayStripWs(pts[bp])) {
        break;
      }
      b = bp;
    }
    const lw = sub32(b, s);
    if (lw <= RB_LL_MAX) {
      return;
    }
    this.register(src, i, add32(s, RB_LL_MAX), add32(s, lw));
  }

  /** The first `# rubocop : <mode>\b` in the line (DirectiveComment.before_comment's split), or -1. */
  private directiveStart(src: RbSource, s: i32, e: i32): i32 {
    const modes = ["disable-next", "enable-next", "todo-next", "disable", "enable", "push", "pop", "todo", "next"];
    const pts = src.pts;
    // A line [s, e) lies within the source.
    if (s < 0 || e > pts.length) {
      fault();
      return -1;
    }
    for (let p = s; p >= 0 && p < e && p < pts.length; p++) {
      if (pts[p] !== 35) {
        continue;
      }
      let q = rbLlSpaceRun(src, p + 1, e);
      if (!rbLlHasAt(src, q, e, "rubocop")) {
        continue;
      }
      // rbLlHasAt holds `q + 7 <= e`.
      q = rbLlSpaceRun(src, add32(q, 7), e);
      if (q >= e) {
        continue;
      }
      if (q < 0 || q >= pts.length) {
        fault();
        return -1;
      }
      if (pts[q] !== 58) {
        continue;
      }
      q = rbLlSpaceRun(src, q + 1, e);
      for (const m of modes) {
        const ml = toI32(m.length);
        if (rbLlHasAt(src, q, e, m) && !rbLlWord(src, add32(q, ml), s, e)) {
          return p;
        }
      }
    }
    return -1;
  }

  /** register_offense: a line break at the line's breakable range. */
  private register(src: RbSource, i: i32, os: i32, oe: i32): void {
    const k = this.c.offense(os, oe);
    if (k === null) {
      return;
    }
    const bs = this.brkS.get(i) ?? -1;
    const be = this.brkE.get(i) ?? -1;
    if (bs < 0) {
      return;
    }
    k.insertBefore(bs, be > src.n ? src.n : be, "\n");
    this.c.commit(k);
  }

  /** register_endless_method_offense with EndlessMethodRewriter#correct_to_multiline. */
  private endlessOffense(src: RbSource, s: i32, from: i32, len: i32, node: i32): void {
    const os = add32(s, from);
    let oe = os;
    if (len > from) {
      oe = add32(os, sub32(len, from));
    }
    const k = this.c.offense(os, oe);
    if (k === null) {
      return;
    }
    const a = src.a;
    const parts: string[] = ["def "];
    if (a.type(node) === NT_DEFS) {
      // node.loc.keyword.end.join(node.loc.name.begin).source.lstrip
      let rs = rnE(src, node, F_KEYWORD);
      const re = rnS(src, node, F_NAME);
      while (rs < re && rbLayStripWs(src.at(rs))) {
        rs++;
      }
      parts.push(src.src(rs, re));
    }
    parts.push(ssxDefName(src, node));
    const args = ssxDefArgs(src, node);
    if (a.isNode(args) && a.nKid(args) > 0) {
      parts.push(src.nodeSrc(args));
    }
    const col = src.column(a.exS(node));
    parts.push("\n");
    const indent = add32(col, RB_LL_INDENT);
    for (let j = 0; j < indent; j++) {
      parts.push(" ");
    }
    parts.push(src.nodeSrc(ssxDefBody(src, node)));
    parts.push("\n");
    for (let j = 0; j < col; j++) {
      parts.push(" ");
    }
    parts.push("end");
    k.replace(a.exS(node), a.exE(node), parts.join(""));
    this.c.commit(k);
  }
}
