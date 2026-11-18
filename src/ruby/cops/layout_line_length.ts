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
  F_OPERATOR,
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
  for (let i = 0; i + 1 < k; i++) {
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
  const k = toI32(kids.length);
  if (k === 0 || rbLlFirstLine(src, kids[0]) === rbLlLastLine(src, kids[k - 1])) {
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
  if (rnHas(src, n, F_END) && src.at(rnS(src, n, F_END)) === 41 && rnE(src, n, F_END) === rnS(src, n, F_END) + 1) {
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
 * The set is the unreserved characters plus `extra`.
 */
const rbLlUriChar = (src: RbSource, p: i32, lim: i32, extra: string): i32 => {
  if (p >= lim) {
    return -1;
  }
  const c = src.pts[p];
  if (rbLlUnreserved(c) || rbLlIn(extra, c)) {
    return p + 1;
  }
  if (c === 37 && p + 3 <= lim && rbLlHex(src.pts[p + 1]) && rbLlHex(src.pts[p + 2])) {
    return p + 3;
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
  if (e <= s || e - s > max) {
    return false;
  }
  for (let i = s; i < e; i++) {
    if (!rbLlHex(src.pts[i])) {
      return false;
    }
  }
  return true;
};

/** `[s, e)` split at its colons. */
const rbLlColonParts = (src: RbSource, s: i32, e: i32): i32[] => {
  const out: i32[] = [s];
  for (let i = s; i < e; i++) {
    if (src.pts[i] === 58) {
      out.push(i);
      out.push(i + 1);
    }
  }
  out.push(e);
  return out;
};

/** \d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3} (RFC 2396), or dec-octets (RFC 3986). */
const rbLlIpv4 = (src: RbSource, s: i32, e: i32, strict: boolean): boolean => {
  let p = s;
  for (let k = 0; k < 4; k++) {
    if (k > 0) {
      if (p >= e || src.pts[p] !== 46) {
        return false;
      }
      p++;
    }
    const q = p;
    while (p < e && rbLlDigit(src.pts[p])) {
      p++;
    }
    const m = p - q;
    if (m < 1 || m > 3) {
      return false;
    }
    if (strict) {
      if (m > 1 && src.pts[q] === 48) {
        return false;
      }
      const v =
        (src.pts[q] - 48) * (m === 3 ? 100 : m === 2 ? 10 : 1) +
        (m >= 2 ? (src.pts[q + 1] - 48) * (m === 3 ? 10 : 1) : 0) +
        (m === 3 ? src.pts[q + 2] - 48 : 0);
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
  for (let i = 0; i < k; i++) {
    const ps = parts[2 * i];
    const pe = parts[2 * i + 1];
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
  for (let i = 0; i < k; i++) {
    if (!rbLlHexRun(src, parts[2 * i], parts[2 * i + 1], 4)) {
      return -1;
    }
  }
  return k;
};

/** The bracketed IPv6reference content of RFC 2396's regexp. */
const rbLlIpv6Ok2396 = (src: RbSource, s: i32, e: i32): boolean => {
  if (rbLlIpv6Tail2396(src, s, e)) {
    return true;
  }
  for (let i = s; i + 1 < e; i++) {
    if (src.pts[i] === 58 && src.pts[i + 1] === 58) {
      if (rbLlHexList(src, s, i) >= 0 && (i + 2 === e || rbLlIpv6Tail2396(src, i + 2, e))) {
        return true;
      }
    }
  }
  return false;
};

/** RFC 3986's IPv6address over `[s, e)`. */
const rbLlIpv6Ok3986 = (src: RbSource, s: i32, e: i32): boolean => {
  // The groups after `::` (or all of them): the last may be an IPv4 address (two groups).
  let dc = -1;
  for (let i = s; i + 1 < e; i++) {
    if (src.pts[i] === 58 && src.pts[i + 1] === 58) {
      dc = i;
      break;
    }
  }
  const rs = dc < 0 ? s : dc + 2;
  let right = 0;
  if (rs < e) {
    const parts = rbLlColonParts(src, rs, e);
    const k = toI32(parts.length) / 2;
    for (let i = 0; i < k; i++) {
      const ps = parts[2 * i];
      const pe = parts[2 * i + 1];
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
  return left + right <= 7;
};

/** The RFC 2396 host at `p`: the position after it, or -1 (no host). */
const rbLlUriHost = (src: RbSource, p: i32, lim: i32, ipv6: i32[]): i32 => {
  let q = p;
  for (;;) {
    if (q < lim && (rbLlAlpha(src.pts[q]) || rbLlDigit(src.pts[q]) || src.pts[q] === 45 || src.pts[q] === 46)) {
      q++;
    } else if (q + 2 < lim && src.pts[q] === 37 && rbLlHex(src.pts[q + 1]) && rbLlHex(src.pts[q + 2])) {
      q += 3;
    } else {
      break;
    }
  }
  if (q > p) {
    return q;
  }
  if (p < lim && src.pts[p] === 91) {
    let c = p + 1;
    while (c < lim && src.pts[c] !== 93) {
      c++;
    }
    if (c < lim && rbLlIpv6Ok2396(src, p + 1, c)) {
      ipv6.push(p + 1);
      ipv6.push(c);
      return c + 1;
    }
  }
  return -1;
};

/** `(?::(\d*))?` after a host. */
const rbLlUriPort = (src: RbSource, p: i32, lim: i32): i32 => {
  if (p < lim && src.pts[p] === 58) {
    let q = p + 1;
    while (q < lim && rbLlDigit(src.pts[q])) {
      q++;
    }
    return q;
  }
  return p;
};

/** Whether the code points at `p` (before `lim`) spell ASCII `w`. */
const rbLlHasAt = (src: RbSource, p: i32, lim: i32, w: string): boolean => {
  const k = toI32(w.length);
  if (p + k > lim) {
    return false;
  }
  for (let i = 0; i < k; i++) {
    if (src.pts[p + i] !== w.charCodeAt(i)) {
      return false;
    }
  }
  return true;
};

/**
 * The match of LineLengthHelp#uri_regexp (RFC 2396's absolute URI behind an
 * exact `http:`/`https:`) at `p`: its end, or -1; and whether URI.parse
 * (RFC 3986) takes it, in `valid[0]`.
 */
const rbLlUriAt = (src: RbSource, p: i32, lim: i32, valid: boolean[]): i32 => {
  let q = -1;
  if (rbLlHasAt(src, p, lim, "http:")) {
    q = p + 5;
  } else if (rbLlHasAt(src, p, lim, "https:")) {
    q = p + 6;
  } else {
    return -1;
  }
  valid[0] = true;
  const op = rbLlUriChar(src, q, lim, ";?:@&=+$,");
  if (op >= 0) {
    // opaque_part: RFC 3986 takes `[` and `]` only in its query.
    const e = rbLlUriRun(src, op, lim, ";/?:@&=+$,[]");
    let inQuery = false;
    for (let i = q; i < e; i++) {
      const c = src.pts[i];
      if (c === 63) {
        inQuery = true;
      } else if ((c === 91 || c === 93) && !inQuery) {
        valid[0] = false;
      }
    }
    q = e;
  } else {
    if (q + 1 < lim && src.pts[q] === 47 && src.pts[q + 1] === 47) {
      q += 2;
      const ipv6: i32[] = [];
      const u = rbLlUriRun(src, q, lim, ";:&=+$,");
      let h = -1;
      if (u < lim && src.pts[u] === 64) {
        h = rbLlUriHost(src, u + 1, lim, ipv6);
      }
      if (h < 0) {
        h = rbLlUriHost(src, q, lim, ipv6);
      }
      if (h >= 0) {
        q = rbLlUriPort(src, h, lim);
        if (ipv6.length > 0 && !rbLlIpv6Ok3986(src, ipv6[ipv6.length - 2], ipv6[ipv6.length - 1])) {
          valid[0] = false;
        }
      }
    }
    if (q < lim && src.pts[q] === 47) {
      q = rbLlUriRun(src, q + 1, lim, ":@&=+$,;/");
    }
    if (q < lim && src.pts[q] === 63) {
      q = rbLlUriRun(src, q + 1, lim, ";/?:@&=+$,[]");
    }
  }
  if (q < lim && src.pts[q] === 35) {
    const f = q + 1;
    q = rbLlUriRun(src, f, lim, ";/?:@&=+$,[]");
    for (let i = f; i < q; i++) {
      if (src.pts[i] === 91 || src.pts[i] === 93) {
        valid[0] = false;
      }
    }
  }
  return q;
};

/** \w as \b sees it (Unicode Word). */
const rbLlWord = (src: RbSource, p: i32, s: i32, e: i32): boolean => p >= s && p < e && rbLitUWord(src.pts[p]);

/** [A-Za-z0-9_] */
const rbLlIdent = (c: i32): boolean => rbLlAlpha(c) || rbLlDigit(c) || c === 95;

/** qualified_name_regexp at `p` (a word boundary): its end, or -1. */
const rbLlQualifiedAt = (src: RbSource, p: i32, s: i32, e: i32): i32 => {
  if (rbLlWord(src, p - 1, s, e)) {
    return -1;
  }
  let q = p;
  let k = 0;
  let prev = -1;
  while (q < e && src.pts[q] >= 65 && src.pts[q] <= 90) {
    let r = q + 1;
    while (r < e && rbLlIdent(src.pts[r])) {
      r++;
    }
    if (r + 1 < e && src.pts[r] === 58 && src.pts[r + 1] === 58) {
      k++;
      prev = r;
      q = r + 2;
    } else {
      break;
    }
  }
  if (k === 0) {
    return -1;
  }
  if (q < e && (rbLlAlpha(src.pts[q]) || src.pts[q] === 95)) {
    let r = q + 1;
    while (r < e && rbLlIdent(src.pts[r])) {
      r++;
    }
    if (!rbLlWord(src, r, s, e)) {
      return r;
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
    for (let i = 0; i < src.commentCount(); i++) {
      this.commentLines.add(src.line(src.commS[i]));
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
          this.endless.set(rbLlFirstLine(src, n) - 1, n);
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
    for (let i = 0; i < toI32(this.hoLine.length); i++) {
      if (this.hoLine[i] === l && this.hoPos[i] < pos) {
        return true;
      }
    }
    return false;
  }

  /** check_for_breakable_semicolons */
  private semicolons(src: RbSource): void {
    for (let i = toI32(src.tokT.length) - 1; i >= 0; i--) {
      if (src.tokT[i] !== TK_tSEMI) {
        continue;
      }
      const e = src.tokE[i];
      if (src.line(e) !== src.line(src.tokS[i])) {
        continue;
      }
      const c = src.at(e);
      if (c === 10 || c === 13 || c === 59) {
        continue;
      }
      if (this.afterHeredocOpener(src, e)) {
        continue;
      }
      const li = src.line(e) - 1;
      this.brkS.set(li, e);
      this.brkE.set(li, e + 1);
    }
  }

  /** check_for_breakable_block */
  private block(src: RbSource, n: i32): void {
    if (!rmlSingleLine(src, n)) {
      return;
    }
    const a = src.a;
    const li = rbLlFirstLine(src, n) - 1;
    const send = a.kid(n, 0);
    const lambda = rbLlType(src, send, NT_LAMBDA) || (rmlIsCall(src, send) && ssxMeth(src, send) === "lambda");
    let rs = 0;
    const args = a.type(n) === NT_BLOCK ? a.kid(n, 1) : V_NIL;
    if (args !== V_NIL && a.isNode(args) && a.nKid(args) > 0 && !lambda && rnHas(src, args, F_END)) {
      rs = rnS(src, args, F_END);
    } else if (src.at(rnS(src, n, F_END)) === 125) {
      rs = rnS(src, n, F_BEGIN);
    } else {
      rs = rnS(src, n, F_BEGIN) + 1;
    }
    const pos = rs + 1;
    if (this.afterHeredocOpener(src, pos)) {
      return;
    }
    this.brkS.set(li, pos);
    this.brkE.set(li, pos + 1);
  }

  /** check_for_breakable_node */
  private breakableNode(src: RbSource, L: RbLayLines, n: i32): void {
    const b = this.extract(src, L, n);
    if (b === V_NIL) {
      return;
    }
    const li = rbLlFirstLine(src, b) - 1;
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
    const li = L.idx(fl - 1);
    if (li >= 0 && L.e[li] - L.s[li] <= RB_LL_MAX) {
      return V_NIL;
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
    while (i < k && src.column(src.a.exS(els[i])) <= RB_LL_MAX && src.line(src.a.exS(els[i])) === fl) {
      i++;
    }
    // shift_elements_for_heredoc_arg
    const t = src.a.type(n);
    if (rmlIsCall(src, n) || t === NT_ARRAY || t === NT_HASH) {
      const hp = rbLlHeredocBegin(src, n);
      if (hp >= 0) {
        let lastSafe = -1;
        for (let j = k - 1; j >= 0; j--) {
          if (src.a.exS(els[j]) <= hp) {
            lastSafe = j;
            break;
          }
        }
        if (lastSafe < 0 || (lastSafe === 0 && src.a.exE(els[0]) > hp)) {
          return V_NIL;
        }
        if (lastSafe + 1 < i) {
          i = lastSafe + 1;
        }
      }
    }
    if (k === 0) {
      return V_NIL;
    }
    return i === 0 ? els[0] : els[i - 1];
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
    if (s === e || src.pts[s] !== 9) {
      return 0;
    }
    let p = s;
    while (p < e && src.pts[p] === 9) {
      p++;
    }
    return p === e ? 0 : (p - s) * (RB_LL_INDENT - 1);
  }

  /** line_in_permitted_heredoc? */
  private inHeredoc(l: i32): boolean {
    for (let i = 0; i < toI32(this.hbFirst.length); i++) {
      if (this.hbFirst[i] <= l && l < this.hbLast[i]) {
        return true;
      }
    }
    return false;
  }

  /** check_line */
  private checkLine(src: RbSource, L: RbLayLines, i: i32): void {
    const s = L.s[i];
    const e = L.e[i];
    const len = e - s + this.indentDiff(src, s, e);
    if (len <= RB_LL_MAX) {
      return;
    }
    if (i === 0 && e - s >= 2 && src.pts[s] === 35 && src.pts[s + 1] === 33) {
      return;
    }
    if (this.inHeredoc(i + 1)) {
      return;
    }
    const hl = RB_LL_MAX - this.indentDiff(src, s, e);
    const highlight = hl > 0 ? hl : 0;
    const node = this.endless.get(i) ?? V_NIL;
    if (node !== V_NIL) {
      this.endlessOffense(src, s, highlight, len, node);
      return;
    }
    const ci = rbLayCommentAtLine(src, i + 1);
    if (ci >= 0 && rbLayDirectiveMode(src.src(src.commS[ci], src.commE[ci])).length > 0) {
      this.directiveLine(src, i, s, e);
      return;
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
    const from = r.length > 0 && r[0] < RB_LL_MAX ? r[1] : highlight;
    this.register(src, i, s + from, s + from + (len > from ? len - from : 0));
  }

  /** allowed_position? */
  private allowedPosition(r: i32[], len: i32): boolean {
    return r[0] < RB_LL_MAX && r[1] === len;
  }

  /** find_excessive_range: [begin, end) columns, or empty for nil. */
  private excessive(src: RbSource, s: i32, e: i32, len: i32, uri: boolean): i32[] {
    let mb = -1;
    let me = -1;
    let p = s;
    const valid: boolean[] = [true];
    while (p < e) {
      let m = -1;
      if (uri) {
        valid[0] = true;
        m = rbLlUriAt(src, p, e, valid);
      } else {
        m = rbLlQualifiedAt(src, p, s, e);
      }
      if (m < 0) {
        p++;
        continue;
      }
      if (valid[0]) {
        mb = p - s;
        me = m - s;
      }
      p = m;
    }
    const none: i32[] = [];
    if (mb < 0) {
      return none;
    }
    let end = me;
    const n = e - s;
    // A YARD `{<uri> <title>}` link: up to the line's closing brace.
    if (n > 0 && src.pts[e - 1] === 125) {
      let open = false;
      for (let j = s; j < e - 1; j++) {
        if (src.pts[j] === 123) {
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
      let q = s + end;
      while (q < e && !rbLayRxSpace(src.pts[q])) {
        q++;
      }
      end = q - s;
    }
    const d = this.indentDiff(src, s, e);
    const b = mb + d;
    end += d;
    if (b < RB_LL_MAX && end < RB_LL_MAX) {
      return none;
    }
    return [b, end];
  }

  /** check_directive_line */
  private directiveLine(src: RbSource, i: i32, s: i32, e: i32): void {
    const p = this.directiveStart(src, s, e);
    let b = p < 0 ? e : p;
    while (b > s && rbLayStripWs(src.pts[b - 1])) {
      b--;
    }
    const lw = b - s;
    if (lw <= RB_LL_MAX) {
      return;
    }
    this.register(src, i, s + RB_LL_MAX, s + lw);
  }

  /** The first `# rubocop : <mode>\b` in the line (DirectiveComment.before_comment's split), or -1. */
  private directiveStart(src: RbSource, s: i32, e: i32): i32 {
    const modes = ["disable-next", "enable-next", "todo-next", "disable", "enable", "push", "pop", "todo", "next"];
    for (let p = s; p < e; p++) {
      if (src.pts[p] !== 35) {
        continue;
      }
      let q = p + 1;
      while (q < e && rbLayRxSpace(src.pts[q])) {
        q++;
      }
      if (!rbLlHasAt(src, q, e, "rubocop")) {
        continue;
      }
      q += 7;
      while (q < e && rbLayRxSpace(src.pts[q])) {
        q++;
      }
      if (q >= e || src.pts[q] !== 58) {
        continue;
      }
      q++;
      while (q < e && rbLayRxSpace(src.pts[q])) {
        q++;
      }
      for (const m of modes) {
        const ml = toI32(m.length);
        if (rbLlHasAt(src, q, e, m) && !rbLlWord(src, q + ml, s, e)) {
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
    const k = this.c.offense(s + from, s + from + (len > from ? len - from : 0));
    if (k === null) {
      return;
    }
    const a = src.a;
    const parts: string[] = ["def "];
    if (a.type(node) === NT_DEFS) {
      parts.push(src.nodeSrc(a.kid(node, 0)));
      parts.push(src.src(rnS(src, node, F_OPERATOR), rnE(src, node, F_OPERATOR)));
    }
    parts.push(ssxDefName(src, node));
    const args = ssxDefArgs(src, node);
    if (a.isNode(args) && a.nKid(args) > 0) {
      parts.push(src.nodeSrc(args));
    }
    const col = src.column(a.exS(node));
    parts.push("\n");
    for (let j = 0; j < col + RB_LL_INDENT; j++) {
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
