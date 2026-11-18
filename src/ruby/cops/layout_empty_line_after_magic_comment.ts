// Layout/EmptyLineAfterMagicComment (NumberOfEmptyLines: 1), with
// RuboCop::MagicComment#any? for the comments before the code.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { V_NIL } from "../ast";
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
  if (p + k > toI32(text.length)) {
    return -1;
  }
  for (let i = 0; i < k; i++) {
    const want = key.charCodeAt(i);
    const c = text.charCodeAt(p + i);
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
  while (p < toI32(text.length) && rbLayRxSpace(text.charCodeAt(p))) {
    p++;
  }
  return p;
};

const rbMagicSkipToken = (text: string, p0: i32): i32 => {
  let p = p0;
  while (p < toI32(text.length) && rbMagicTokenChar(text.charCodeAt(p))) {
    p++;
  }
  return p;
};

/** SimpleComment's /\A\s*#\s*KEY:\s*TOKEN\s*\z/io: the token, or null. */
const rbMagicSimple = (text: string, key: string): string | null => {
  const k = toI32(text.length);
  let p = rbMagicSkipSpace(text, 0);
  if (p >= k || text.charCodeAt(p) !== 35) {
    return null;
  }
  p = rbMagicSkipSpace(text, p + 1);
  const m = rbMagicKey(text, p, key, true);
  if (m < 0) {
    return null;
  }
  p += m;
  if (p >= k || text.charCodeAt(p) !== 58) {
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
  if (p >= k || text.charCodeAt(p) !== 35) {
    return false;
  }
  p = rbMagicSkipSpace(text, p + 1);
  const starts: i32[] = [p];
  const f = rbMagicKey(text, p, "frozen_string_literal:", true);
  if (f >= 0) {
    const q = rbMagicSkipSpace(text, p + f);
    const tf = rbMagicKey(text, q, "true", true) >= 0 ? 4 : rbMagicKey(text, q, "false", true) >= 0 ? 5 : -1;
    if (tf > 0) {
      starts.push(q + tf);
    }
  }
  for (const s0 of starts) {
    let s = rbMagicSkipSpace(text, s0);
    if (rbMagicKey(text, s, "en", true) >= 0 && rbMagicKey(text, s + 2, "coding: ", true) >= 0) {
      s += 2;
    }
    if (rbMagicKey(text, s, "coding: ", true) >= 0 && rbMagicTokenChar(s + 8 < k ? text.charCodeAt(s + 8) : -1)) {
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
  if (p >= k || tok.charCodeAt(p) !== op) {
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
  while (e > b && (s.charCodeAt(e - 1) === 0 || rbLayRxSpace(s.charCodeAt(e - 1)))) {
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
  while (i + w <= k) {
    if (rbLayHasAt(s, i, sep)) {
      out.push(s.substring(from, i));
      i += w;
      from = i;
    } else {
      i++;
    }
  }
  out.push(s.substring(from, k));
  while (out.length > 0 && out[out.length - 1].length === 0) {
    out.pop();
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
  for (let i = 0; i + 3 <= k; i++) {
    if (!rbLayHasAt(text, i, "-*-")) {
      continue;
    }
    let best = -1;
    for (let j = i + 4; j + 3 <= k; j++) {
      if (text.charCodeAt(j - 1) === 10) {
        break;
      }
      if (rbLayHasAt(text, j, "-*-")) {
        best = j;
      }
    }
    if (best >= 0 && text.charCodeAt(i + 3) !== 10) {
      return text.substring(i + 3, best);
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
    const q = rbMagicSkipSpace(text, p + 4);
    let e = q;
    while (e < k && text.charCodeAt(e) !== 10) {
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
    const nc = toI32(src.commS.length);
    let upto = nc;
    if (src.root !== V_NIL) {
      const astLine = src.line(src.a.exS(src.root));
      upto = 0;
      while (upto < nc && src.line(src.commS[upto]) < astLine) {
        upto++;
      }
    }
    let last = -1;
    for (let i = upto - 1; i >= 0; i--) {
      if (rbMagicAny(src.src(src.commS[i], src.commE[i]))) {
        last = i;
        break;
      }
    }
    if (last < 0) {
      return;
    }
    const L = new RbLayLines(src);
    const line = src.line(src.commS[last]);
    let actual = 0;
    while (L.has(line + actual) && L.blank(line + actual)) {
      actual++;
    }
    if (!L.has(line + actual) || actual >= 1) {
      return;
    }
    const s = L.start(line + 1);
    const k = this.c.offense(s, s + 1);
    if (k !== null) {
      k.insertBefore(s, s + 1, "\n");
      this.c.commit(k);
    }
  }
}
