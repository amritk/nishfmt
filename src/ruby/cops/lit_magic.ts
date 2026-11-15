// RuboCop::MagicComment: the `# frozen_string_literal: true`, `# encoding:
// utf-8`, `# -*- coding: utf-8 -*-` and `# vim: fileencoding=utf-8` comments
// of a line, as far as Style/Encoding and FrozenStringLiteral read them.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { rbLitChars, rbLitSpaceC } from "./lit_help";
import { rbLitUAlnum } from "./lit_unicode";

// Comment kinds (MagicComment.parse).
const RB_MC_SIMPLE: i32 = 0;
const RB_MC_EMACS: i32 = 1;
const RB_MC_VIM: i32 = 2;

/** ASCII lower case of a code point. */
const rbMcLower = (c: i32): i32 => (c >= 65 && c <= 90 ? c + 32 : c);

/** A string's code points as a string again (UTF-8). */
const rbMcStr = (cs: i32[], s: i32, e: i32): string => {
  const out: string[] = [];
  for (let i = s; i < e; i++) {
    const c = cs[i];
    if (c < 0x80) {
      out.push(String.fromCharCode(c));
    } else if (c < 0x800) {
      out.push(String.fromCharCode(0xc0 | (c >> 6)));
      out.push(String.fromCharCode(0x80 | (c & 0x3f)));
    } else if (c < 0x10000) {
      out.push(String.fromCharCode(0xe0 | (c >> 12)));
      out.push(String.fromCharCode(0x80 | ((c >> 6) & 0x3f)));
      out.push(String.fromCharCode(0x80 | (c & 0x3f)));
    } else {
      out.push(String.fromCharCode(0xf0 | (c >> 18)));
      out.push(String.fromCharCode(0x80 | ((c >> 12) & 0x3f)));
      out.push(String.fromCharCode(0x80 | ((c >> 6) & 0x3f)));
      out.push(String.fromCharCode(0x80 | (c & 0x3f)));
    }
  }
  return out.join("");
};

/** `w` (ASCII) at `i` (case-insensitively with `ci`): its end, or -1. */
const rbMcLit = (cs: i32[], i: i32, w: string, ci: boolean): i32 => {
  const n = toI32(cs.length);
  const k = toI32(w.length);
  if (i + k > n) {
    return -1;
  }
  for (let j = 0; j < k; j++) {
    const c = cs[i + j];
    const d = w.charCodeAt(j);
    if (ci ? rbMcLower(c) !== rbMcLower(d) : c !== d) {
      return -1;
    }
  }
  return i + k;
};

/** A keyword pattern at `i`: its end, or -1. Keywords: "encoding" `(?:en)?coding`, others `a[_-]b[_-]c`. */
const rbMcKw = (cs: i32[], i: i32, kw: string, ci: boolean): i32 => {
  if (kw === "encoding") {
    const e = rbMcLit(cs, i, "en", ci);
    if (e >= 0) {
      const f = rbMcLit(cs, e, "coding", ci);
      if (f >= 0) {
        return f;
      }
    }
    return rbMcLit(cs, i, "coding", ci);
  }
  // words separated by `-` in kw stand for [_-]
  let p = i;
  let from = 0;
  const k = toI32(kw.length);
  for (let j = 0; j <= k; j++) {
    if (j === k || kw.charCodeAt(j) === 45) {
      p = rbMcLit(cs, p, kw.substring(from, j), ci);
      if (p < 0) {
        return -1;
      }
      if (j < k) {
        if (p >= toI32(cs.length) || (cs[p] !== 95 && cs[p] !== 45)) {
          return -1;
        }
        p++;
      }
      from = j + 1;
    }
  }
  return p;
};

const rbMcWs = (cs: i32[], i0: i32): i32 => {
  let i = i0;
  while (i < toI32(cs.length) && rbLitSpaceC(cs[i])) {
    i++;
  }
  return i;
};

const rbMcTokenC = (c: i32): boolean => rbLitUAlnum(c) || c === 45 || c === 95;

/** TOKEN at `i`: its end (maximal), or -1 when empty. */
const rbMcToken = (cs: i32[], i0: i32): i32 => {
  let i = i0;
  while (i < toI32(cs.length) && rbMcTokenC(cs[i])) {
    i++;
  }
  return i > i0 ? i : -1;
};

/** SimpleComment: /\A\s*#\s*KW:\s*TOKEN\s*\z/io's token, or null. */
const rbMcSimpleExtract = (cs: i32[], kw: string): string | null => {
  let i = rbMcWs(cs, 0);
  if (i >= toI32(cs.length) || cs[i] !== 35) {
    return null;
  }
  i = rbMcWs(cs, i + 1);
  i = rbMcKw(cs, i, kw, true);
  if (i < 0 || i >= toI32(cs.length) || cs[i] !== 58) {
    return null;
  }
  i = rbMcWs(cs, i + 1);
  const e = rbMcToken(cs, i);
  if (e < 0 || rbMcWs(cs, e) !== toI32(cs.length)) {
    return null;
  }
  return rbMcStr(cs, i, e);
};

/** SimpleComment#encoding: /\A\s*\#\s*(frozen_string_literal:\s*(true|false))?\s*(?:en)?coding: (TOKEN)/io. */
const rbMcSimpleEncoding = (cs: i32[]): string | null => {
  let i = rbMcWs(cs, 0);
  if (i >= toI32(cs.length) || cs[i] !== 35) {
    return null;
  }
  i = rbMcWs(cs, i + 1);
  // with the frozen_string_literal group, then without
  for (let pass = 0; pass < 2; pass++) {
    let p = i;
    if (pass === 0) {
      p = rbMcLit(cs, p, "frozen_string_literal:", true);
      if (p < 0) {
        continue;
      }
      p = rbMcWs(cs, p);
      const t = rbMcLit(cs, p, "true", true);
      const f = rbMcLit(cs, p, "false", true);
      p = t >= 0 ? t : f;
      if (p < 0) {
        continue;
      }
    }
    p = rbMcWs(cs, p);
    p = rbMcKw(cs, p, "encoding", true);
    if (p < 0) {
      continue;
    }
    p = rbMcLit(cs, p, ": ", false);
    if (p < 0) {
      continue;
    }
    const e = rbMcToken(cs, p);
    if (e < 0) {
      continue;
    }
    return rbMcStr(cs, p, e);
  }
  return null;
};

/** The parsed magic comment of one line. */
export class RbMagicComment {
  line: string;
  cs: i32[];
  kind: i32 = 0;
  // EditorComment#tokens (Emacs and Vim comments).
  tokens: string[];

  constructor(line: string) {
    this.line = line;
    this.cs = rbLitChars(line);
    this.tokens = [];
    const emacs = this.emacsToken();
    if (emacs !== null) {
      this.kind = RB_MC_EMACS;
      this.tokens = rbMcSplitStrip(emacs, ";");
      return;
    }
    const vim = this.vimToken();
    if (vim !== null) {
      this.kind = RB_MC_VIM;
      this.tokens = rbMcSplitStrip(vim, ", ");
    }
  }

  /** EmacsComment::REGEXP /-\*-(?<token>.+)-\*-/: the token, or null. */
  private emacsToken(): string | null {
    const cs = this.cs;
    const n = toI32(cs.length);
    for (let s = 0; s + 2 < n; s++) {
      if (!(cs[s] === 45 && cs[s + 1] === 42 && cs[s + 2] === 45)) {
        continue;
      }
      // the last `-*-` at least one character past the first
      for (let q = n - 3; q >= s + 4; q--) {
        if (cs[q] === 45 && cs[q + 1] === 42 && cs[q + 2] === 45) {
          let nl = false;
          for (let j = s + 3; j < q; j++) {
            if (cs[j] === 10) {
              nl = true;
            }
          }
          if (!nl) {
            return rbMcStr(cs, s + 3, q);
          }
        }
      }
    }
    return null;
  }

  /** VimComment::REGEXP /#\s*vim:\s*(?<token>.+)/: the token, or null. */
  private vimToken(): string | null {
    const cs = this.cs;
    const n = toI32(cs.length);
    for (let s = 0; s < n; s++) {
      if (cs[s] !== 35) {
        continue;
      }
      let i = rbMcWs(cs, s + 1);
      i = rbMcLit(cs, i, "vim:", false);
      if (i < 0) {
        continue;
      }
      let j = rbMcWs(cs, i);
      if (j >= n) {
        // \s* gives back one character for .+
        j = n - 1;
        if (j < i) {
          continue;
        }
      }
      return rbMcStr(cs, j, n);
    }
    return null;
  }

  /** EditorComment#match: the first token /\AKW\s*OP\s*TOKEN\z/'s value, downcased. */
  private match(kw: string): string | null {
    const op = this.kind === RB_MC_EMACS ? 58 : 61;
    for (const t of this.tokens) {
      const cs = rbLitChars(t);
      let i = rbMcKw(cs, 0, kw, false);
      if (i < 0) {
        continue;
      }
      i = rbMcWs(cs, i);
      if (i >= toI32(cs.length) || cs[i] !== op) {
        continue;
      }
      i = rbMcWs(cs, i + 1);
      const e = rbMcToken(cs, i);
      if (e < 0 || e !== toI32(cs.length)) {
        continue;
      }
      const v: i32[] = [];
      for (let j = i; j < e; j++) {
        v.push(rbMcLower(cs[j]));
      }
      return rbMcStr(v, 0, toI32(v.length));
    }
    return null;
  }

  /** #encoding */
  encoding(): string | null {
    if (this.kind === RB_MC_EMACS) {
      return this.match("encoding");
    }
    if (this.kind === RB_MC_VIM) {
      return this.tokens.length > 1 ? this.match("fileencoding") : null;
    }
    return rbMcSimpleEncoding(this.cs);
  }

  /** extract_frozen_string_literal (the raw setting). */
  private frozenSetting(): string | null {
    if (this.kind === RB_MC_EMACS) {
      return this.match("frozen-string-literal");
    }
    if (this.kind === RB_MC_VIM) {
      return null;
    }
    return rbMcSimpleExtract(this.cs, "frozen-string-literal");
  }

  /** #frozen_string_literal: "true", "false", another setting, or null. */
  frozenStringLiteral(): string | null {
    const s = this.frozenSetting();
    if (s === null) {
      return null;
    }
    const d = rbMcStr(rbMcLowerAll(rbLitChars(s)), 0, toI32(rbLitChars(s).length));
    if (d === "true" || d === "false") {
      return d;
    }
    return s;
  }

  /** #any? */
  private any(): boolean {
    if (this.frozenStringLiteral() !== null || this.encoding() !== null) {
      return true;
    }
    if (this.kind === RB_MC_SIMPLE) {
      const r = rbMcSimpleExtract(this.cs, "rbs_inline");
      if (r !== null && (r === "enabled" || r === "disabled")) {
        return true;
      }
      if (rbMcSimpleExtract(this.cs, "warn-indent") !== null) {
        return true;
      }
      if (rbMcSimpleExtract(this.cs, "shareable-constant-value") !== null) {
        return true;
      }
      return rbMcSimpleExtract(this.cs, "typed") !== null;
    }
    if (this.kind === RB_MC_EMACS) {
      return this.match("warn-indent") !== null || this.match("shareable-constant-value") !== null;
    }
    return false;
  }

  /** #valid? */
  valid(): boolean {
    return this.line.startsWith("#") && this.any();
  }

  /** #without(:encoding) */
  withoutEncoding(): string {
    if (this.kind === RB_MC_SIMPLE) {
      // /\A#\s*(?:en)?coding/io
      const cs = this.cs;
      if (toI32(cs.length) > 0 && cs[0] === 35 && rbMcKw(cs, rbMcWs(cs, 1), "encoding", true) >= 0) {
        return "";
      }
      return this.line;
    }
    const kw = this.kind === RB_MC_EMACS ? "encoding" : "fileencoding";
    const rest: string[] = [];
    for (const t of this.tokens) {
      if (rbMcKw(rbLitChars(t), 0, kw, false) < 0) {
        rest.push(t);
      }
    }
    if (rest.length === 0) {
      return "";
    }
    if (this.kind === RB_MC_EMACS) {
      return `# -*- ${rest.join(";")} -*-`;
    }
    return `# vim: ${rest.join(", ")}`;
  }
}

const rbMcLowerAll = (cs: i32[]): i32[] => {
  const out: i32[] = [];
  for (const c of cs) {
    out.push(rbMcLower(c));
  }
  return out;
};

/** Whether a code point is whitespace or NUL (String#strip). */
const rbMcStripC = (c: i32): boolean => c === 0 || rbLitSpaceC(c);

/** `s.split(sep).map(&:strip)` (trailing empty fields dropped before the strip). */
const rbMcSplitStrip = (s: string, sep: string): string[] => {
  const fields: string[] = [];
  let from = 0;
  const n = toI32(s.length);
  const k = toI32(sep.length);
  let i = 0;
  while (i <= n - k) {
    if (s.substring(i, i + k) === sep) {
      fields.push(s.substring(from, i));
      from = i + k;
      i += k;
      continue;
    }
    i++;
  }
  fields.push(s.substring(from, n));
  while (fields.length > 0 && fields[fields.length - 1].length === 0) {
    fields.pop();
  }
  const out: string[] = [];
  for (const f of fields) {
    let a = 0;
    let b = toI32(f.length);
    while (a < b && rbMcStripC(f.charCodeAt(a))) {
      a++;
    }
    while (b > a && rbMcStripC(f.charCodeAt(b - 1))) {
      b--;
    }
    out.push(f.substring(a, b));
  }
  return out;
};
