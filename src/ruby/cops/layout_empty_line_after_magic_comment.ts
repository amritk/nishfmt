// Layout/EmptyLineAfterMagicComment (NumberOfEmptyLines: 1), with
// RuboCop::MagicComment#any? for the comments before the code.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { V_NIL } from "../ast";
import { add32, atI32 } from "../../core/arr";
import { fault } from "../../core/fault";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { RbLayLines, rbLayHasAt, rbLayRxSpace } from "./layout_empty_help";

const rbMagicLower = (c: i32): i32 => (c >= 65 && c <= 90 ? c + 32 : c);

/** MagicComment::TOKEN's characters: [[:alnum:]\-_] (a non-ASCII byte counts as alphanumeric). */
const rbMagicTokenChar = (c: i32): boolean =>
  c === 45 || c === 95 || (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c >= 128;

/**
 * The length of keyword `key` at byte `p` of `text`, or -1. In `key`, `?`
 * stands for [_-]; `ci` ignores ASCII case.
 */
const rbMagicKey = (text: string, p: i32, key: string, ci: boolean): i32 => {
  const k = toI32(key.length);
  if (p > toI32(text.length) - k) {
    return -1;
  }
  let j = p;
  for (let i = 0; i < k; i++) {
    // p + i, below text's length after the test above.
    if (j < 0 || j >= text.length) {
      fault();
      return -1;
    }
    const want = key.charCodeAt(i);
    const c = text.charCodeAt(j);
    j++;
    if (want === 63) {
      if (c !== 95 && c !== 45) {
        return -1;
      }
    } else if (ci ? rbMagicLower(c) !== rbMagicLower(want) : c !== want) {
      return -1;
    }
  }
  return k;
};

const rbMagicSkipSpace = (text: string, p0: i32): i32 => {
  let p = p0;
  // Every caller passes a position in the text.
  if (p < 0) {
    fault();
    return p;
  }
  while (p >= 0 && p < toI32(text.length) && rbLayRxSpace(text.charCodeAt(p))) {
    p++;
  }
  return p;
};

const rbMagicSkipToken = (text: string, p0: i32): i32 => {
  let p = p0;
  // Every caller passes a position in the text.
  if (p < 0) {
    fault();
    return p;
  }
  while (p >= 0 && p < toI32(text.length) && rbMagicTokenChar(text.charCodeAt(p))) {
    p++;
  }
  return p;
};

/** SimpleComment's /\A\s*#\s*KEY:\s*TOKEN\s*\z/io: the token, or null. */
const rbMagicSimple = (text: string, key: string): string | null => {
  const k = toI32(text.length);
  // rbMagicSkipSpace answers a position no less than the one it was given.
  let p = rbMagicSkipSpace(text, 0);
  if (p < 0 || p >= k || text.charCodeAt(p) !== 35) {
    return null;
  }
  p = rbMagicSkipSpace(text, p + 1);
  const m = rbMagicKey(text, p, key, true);
  if (m < 0) {
    return null;
  }
  p = add32(p, m);
  if (p < 0 || p >= k || text.charCodeAt(p) !== 58) {
    return null;
  }
  p = rbMagicSkipSpace(text, p + 1);
  const t = rbMagicSkipToken(text, p);
  if (t === p) {
    return null;
  }
  return rbMagicSkipSpace(text, t) === k ? text.substring(p, t) : null;
};

/** SimpleComment#encoding: /\A\s*\#\s*(frozen_string_literal:\s*(true|false))?\s*(?:en)?coding: (TOKEN)/io. */
const rbMagicSimpleEncoding = (text: string): boolean => {
  const k = toI32(text.length);
  let p = rbMagicSkipSpace(text, 0);
  if (p < 0 || p >= k || text.charCodeAt(p) !== 35) {
    return false;
  }
  p = rbMagicSkipSpace(text, p + 1);
  const starts: i32[] = [p];
  const f = rbMagicKey(text, p, "frozen_string_literal:", true);
  if (f >= 0) {
    const q = rbMagicSkipSpace(text, add32(p, f));
    const tf = rbMagicKey(text, q, "true", true) >= 0 ? 4 : rbMagicKey(text, q, "false", true) >= 0 ? 5 : -1;
    if (tf > 0) {
      starts.push(add32(q, tf));
    }
  }
  for (const s0 of starts) {
    let s = rbMagicSkipSpace(text, s0);
    if (rbMagicKey(text, s, "en", true) >= 0 && rbMagicKey(text, add32(s, 2), "coding: ", true) >= 0) {
      s = add32(s, 2);
    }
    const s8 = add32(s, 8);
    if (rbMagicKey(text, s, "coding: ", true) >= 0 && rbMagicTokenChar(s8 >= 0 && s8 < k ? text.charCodeAt(s8) : -1)) {
      return true;
    }
  }
  return false;
};

/** EditorComment#match's /\AKEY\s*OP\s*TOKEN\z/ on one stripped token. */
const rbMagicEditorToken = (tok: string, key: string, op: i32): boolean => {
  const k = toI32(tok.length);
  const m = rbMagicKey(tok, 0, key, false);
  if (m < 0) {
    return false;
  }
  let p = rbMagicSkipSpace(tok, m);
  if (p < 0 || p >= k || tok.charCodeAt(p) !== op) {
    return false;
  }
  p = rbMagicSkipSpace(tok, p + 1);
  const t = rbMagicSkipToken(tok, p);
  return t > p && t === k;
};

/** String#strip. */
const rbMagicStrip = (s: string): string => {
  let b = 0;
  let e = toI32(s.length);
  while (b < e && (s.charCodeAt(b) === 0 || rbLayRxSpace(s.charCodeAt(b)))) {
    b++;
  }
  while (e > b && e > 0 && e <= s.length) {
    const c = s.charCodeAt(e - 1);
    if (!(c === 0 || rbLayRxSpace(c))) {
      break;
    }
    e--;
  }
  return s.substring(b, e);
};

/** `s.split(sep).map(&:strip)` (trailing empty fields dropped). */
const rbMagicSplit = (s: string, sep: string): string[] => {
  const out: string[] = [];
  const k = toI32(s.length);
  const w = toI32(sep.length);
  let from = 0;
  let i = 0;
  while (i <= k - w) {
    if (rbLayHasAt(s, i, sep)) {
      out.push(s.substring(from, i));
      // A separator is never empty, so i moves on.
      const ni = add32(i, w);
      if (ni <= i) {
        fault();
        break;
      }
      i = ni;
      from = i;
    } else {
      // Every separator is a non-empty string, so i < k here.
      if (i >= k) {
        fault();
        break;
      }
      i++;
    }
  }
  out.push(s.substring(from, k));
  let n = toI32(out.length);
  while (n > 0 && n <= out.length && out[n - 1].length === 0) {
    if (out.length > 0) {
      out.pop();
    }
    n = toI32(out.length);
  }
  const r: string[] = [];
  for (const f of out) {
    r.push(rbMagicStrip(f));
  }
  return r;
};

/** EmacsComment::REGEXP /-\*-(?<token>.+)-\*-/: the token, or null. */
const rbMagicEmacs = (text: string): string | null => {
  const k = toI32(text.length);
  for (let i = 0; i <= k - 3; i++) {
    if (!rbLayHasAt(text, i, "-*-")) {
      continue;
    }
    let best = -1;
    for (let j = add32(i, 4); j >= 1 && j <= k - 3; j++) {
      if (text.charCodeAt(j - 1) === 10) {
        break;
      }
      if (rbLayHasAt(text, j, "-*-")) {
        best = j;
      }
    }
    if (best >= 0) {
      // A match at best lies past i + 3.
      if (i < 0 || i + 3 >= k) {
        fault();
        return null;
      }
      if (text.charCodeAt(i + 3) !== 10) {
        return text.substring(i + 3, best);
      }
    }
  }
  return null;
};

/** VimComment::REGEXP /#\s*vim:\s*(?<token>.+)/: the token, or null. */
const rbMagicVim = (text: string): string | null => {
  const k = toI32(text.length);
  for (let i = 0; i < k; i++) {
    if (text.charCodeAt(i) !== 35) {
      continue;
    }
    const p = rbMagicSkipSpace(text, i + 1);
    if (!rbLayHasAt(text, p, "vim:")) {
      continue;
    }
    const q = rbMagicSkipSpace(text, add32(p, 4));
    if (q < 0) {
      fault();
      return null;
    }
    let e = q;
    while (e >= 0 && e < k && text.charCodeAt(e) !== 10) {
      e++;
    }
    if (e > q) {
      return text.substring(q, e);
    }
  }
  return null;
};

/** MagicComment.parse(text).any? */
export const rbMagicAny = (text: string): boolean => {
  const emacs = rbMagicEmacs(text);
  if (emacs !== null) {
    for (const t of rbMagicSplit(emacs, ";")) {
      if (
        rbMagicEditorToken(t, "frozen?string?literal", 58) ||
        rbMagicEditorToken(t, "encoding", 58) ||
        rbMagicEditorToken(t, "coding", 58) ||
        rbMagicEditorToken(t, "warn?indent", 58) ||
        rbMagicEditorToken(t, "shareable?constant?value", 58)
      ) {
        return true;
      }
    }
    return false;
  }
  const vim = rbMagicVim(text);
  if (vim !== null) {
    const toks = rbMagicSplit(vim, ", ");
    if (toks.length <= 1) {
      return false;
    }
    for (const t of toks) {
      if (rbMagicEditorToken(t, "fileencoding", 61)) {
        return true;
      }
    }
    return false;
  }
  if (rbMagicSimple(text, "frozen?string?literal") !== null || rbMagicSimpleEncoding(text)) {
    return true;
  }
  const rbs = rbMagicSimple(text, "rbs_inline");
  if (rbs !== null && (rbs === "enabled" || rbs === "disabled")) {
    return true;
  }
  return (
    rbMagicSimple(text, "warn?indent") !== null ||
    rbMagicSimple(text, "shareable?constant?value") !== null ||
    rbMagicSimple(text, "typed") !== null
  );
};

export class CopLayoutEmptyLineAfterMagicComment {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/EmptyLineAfterMagicComment");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    // comments_before_code, last to first.
    const commS = src.commS;
    const commE = src.commE;
    const nc = toI32(commS.length);
    let upto = nc;
    if (src.root !== V_NIL) {
      const astLine = src.line(src.a.exS(src.root));
      upto = 0;
      while (upto < nc && upto < commS.length && src.line(commS[upto]) < astLine) {
        upto++;
      }
    }
    let last = -1;
    for (let i = upto - 1; i >= 0; i--) {
      if (rbMagicAny(src.src(atI32(commS, i), atI32(commE, i)))) {
        last = i;
        break;
      }
    }
    if (last < 0) {
      return;
    }
    const L = new RbLayLines(src);
    const line = src.line(atI32(commS, last));
    let actual = 0;
    while (L.has(add32(line, actual)) && L.blank(add32(line, actual))) {
      // Each step passes a line of the source.
      if (actual >= 2147483646) {
        fault();
        return;
      }
      actual++;
    }
    if (!L.has(add32(line, actual)) || actual >= 1) {
      return;
    }
    const s = L.start(add32(line, 1));
    const s1 = add32(s, 1);
    const k = this.c.offense(s, s1);
    if (k !== null) {
      k.insertBefore(s, s1, "\n");
      this.c.commit(k);
    }
  }
}
