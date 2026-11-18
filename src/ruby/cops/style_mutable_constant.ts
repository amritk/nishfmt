// Style/MutableConstant (EnforcedStyle: literals, Recursive: false; its
// correction is unsafe: detection only).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  M_HEREDOC,
  NT_ARRAY,
  NT_BEGIN,
  NT_CASGN,
  NT_CVAR,
  NT_DSTR,
  NT_GVAR,
  NT_HASH,
  NT_IVAR,
  NT_OR_ASGN,
  NT_STR,
  NT_XSTR,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { rbLitChars } from "./lit_help";
import { RbMagicComment } from "./lit_magic";
import { rbLitUAlnum } from "./lit_unicode";
import { rbLitFrozenStringLiterals } from "./style_redundant_freeze";
import { ssxDescendants, ssxIs, ssxIsSpace } from "./style_syntax_help";

/** `shareable[_-]constant[_-]value` at i (case-insensitive when ci): the index after it, or -1. */
const rbMcoKeyword = (cs: i32[], i0: i32, ci: boolean): i32 => {
  const parts = ["shareable", "constant", "value"];
  let i = i0;
  for (let p = 0; p < 3; p++) {
    if (p > 0) {
      if (i >= toI32(cs.length) || (cs[i] !== 95 && cs[i] !== 45)) {
        return -1;
      }
      i++;
    }
    const w = parts[p];
    for (let j = 0; j < toI32(w.length); j++) {
      if (i >= toI32(cs.length)) {
        return -1;
      }
      let c = cs[i];
      if (ci && c >= 65 && c <= 90) {
        c += 32;
      }
      if (c !== w.charCodeAt(j)) {
        return -1;
      }
      i++;
    }
  }
  return i;
};

/** The index after `\s*` from i. */
const rbMcoWs = (cs: i32[], i0: i32): i32 => {
  let i = i0;
  while (i < toI32(cs.length) && ssxIsSpace(cs[i])) {
    i++;
  }
  return i;
};

/** TOKEN ([[:alnum:]\-_]+) at i: its end, or -1. */
const rbMcoToken = (cs: i32[], i0: i32): i32 => {
  let i = i0;
  while (i < toI32(cs.length) && (rbLitUAlnum(cs[i]) || cs[i] === 45 || cs[i] === 95)) {
    i++;
  }
  return i > i0 ? i : -1;
};

/** Code points [s, e) as a string (ASCII only; the values compared are ASCII). */
const rbMcoStr = (cs: i32[], s: i32, e: i32): string => {
  const out: string[] = [];
  for (let i = s; i < e; i++) {
    out.push(cs[i] < 128 ? String.fromCharCode(cs[i]) : "?");
  }
  return out.join("");
};

/** MagicComment#shareable_constant_value of a line ("" when none). */
export const rbShareableConstantValue = (line: string): string => {
  const mc = new RbMagicComment(line);
  if (mc.kind === 2) {
    // Vim comments cannot set it.
    return "";
  }
  if (mc.kind === 1) {
    // EditorComment#match: /\AKW\s*:\s*TOKEN\z/ on a token, downcased.
    for (const t of mc.tokens) {
      const cs = rbLitChars(t);
      let i = rbMcoKeyword(cs, 0, false);
      if (i < 0) {
        continue;
      }
      i = rbMcoWs(cs, i);
      if (i >= toI32(cs.length) || cs[i] !== 58) {
        continue;
      }
      i = rbMcoWs(cs, i + 1);
      const e = rbMcoToken(cs, i);
      if (e < 0 || e !== toI32(cs.length)) {
        continue;
      }
      const v: i32[] = [];
      for (let j = i; j < e; j++) {
        v.push(cs[j] >= 65 && cs[j] <= 90 ? cs[j] + 32 : cs[j]);
      }
      return rbMcoStr(v, 0, toI32(v.length));
    }
    return "";
  }
  // SimpleComment: /\A\s*#\s*KW:\s*TOKEN\s*\z/io
  const cs = mc.cs;
  let i = rbMcoWs(cs, 0);
  if (i >= toI32(cs.length) || cs[i] !== 35) {
    return "";
  }
  i = rbMcoKeyword(cs, rbMcoWs(cs, i + 1), true);
  if (i < 0 || i >= toI32(cs.length) || cs[i] !== 58) {
    return "";
  }
  i = rbMcoWs(cs, i + 1);
  const e = rbMcoToken(cs, i);
  if (e < 0 || rbMcoWs(cs, e) !== toI32(cs.length)) {
    return "";
  }
  return rbMcoStr(cs, i, e);
};

/** FrozenStringLiteral#frozen_string_literal? (Ruby >= 3.0). */
export const rbFrozenStringLiteral = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  let frozen = ssxIs(src, n, NT_STR);
  if (!frozen && ssxIs(src, n, NT_DSTR)) {
    frozen = true;
    for (const d of ssxDescendants(src, n)) {
      const t = a.type(d);
      if (t === NT_BEGIN || t === NT_IVAR || t === NT_CVAR || t === NT_GVAR) {
        frozen = false;
      }
    }
    if (!frozen && a.mapKind(a.map(n)) === M_HEREDOC) {
      frozen = true;
      for (let i = 0; i < a.nKid(n); i++) {
        if (!ssxIs(src, a.kid(n, i), NT_STR)) {
          frozen = false;
        }
      }
    }
  }
  return frozen && rbLitFrozenStringLiterals(src);
};

/** Whether a line mentions `shareable` in any case (a magic comment setting it must). */
const rbMcoMentions = (line: string): boolean => {
  const k = toI32(line.length);
  const w = "shareable";
  for (let i = 0; i + 9 <= k; i++) {
    let ok = true;
    for (let j = 0; j < 9; j++) {
      let c = line.charCodeAt(i + j);
      if (c >= 65 && c <= 90) {
        c += 32;
      }
      if (c !== w.charCodeAt(j)) {
        ok = false;
        break;
      }
    }
    if (ok) {
      return true;
    }
  }
  return false;
};

export class CopStyleMutableConstant {
  c: RbCop;
  // The lines holding a valid shareable_constant_value magic comment, and their values.
  scLines: i32[];
  scValues: string[];

  constructor() {
    this.c = new RbCop("Style/MutableConstant");
    this.scLines = [];
    this.scValues = [];
  }

  /** ShareableConstantValue#recent_shareable_value?: the last valid setting up to the node's last line. */
  private shareable(src: RbSource, n: i32): boolean {
    const last = src.line(src.a.exE(n));
    for (let i = toI32(this.scLines.length) - 1; i >= 0; i--) {
      if (this.scLines[i] <= last) {
        return this.scValues[i] !== "none";
      }
    }
    return false;
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    this.scLines = [];
    this.scValues = [];
    for (let l = 1; l <= src.lineCount(); l++) {
      const text = src.lineText(l);
      if (!rbMcoMentions(text)) {
        continue;
      }
      const v = rbShareableConstantValue(text);
      if (v === "none" || v === "literal" || v === "experimental_everything" || v === "experimental_copy") {
        this.scLines.push(l);
        this.scValues.push(v);
      }
    }
    for (const n of src.pre) {
      if (!ssxIs(src, n, NT_CASGN)) {
        continue;
      }
      let value = a.kid(n, 2);
      if (value === V_NIL) {
        const p = src.parent(n);
        if (!ssxIs(src, p, NT_OR_ASGN)) {
          continue;
        }
        value = a.kid(p, -1);
      }
      // literal_check: a mutable literal (regexps and ranges are frozen on Ruby 3)
      if (!a.isNode(value)) {
        continue;
      }
      const t = a.type(value);
      if (t !== NT_STR && t !== NT_DSTR && t !== NT_XSTR && t !== NT_ARRAY && t !== NT_HASH) {
        continue;
      }
      if (rbFrozenStringLiteral(src, value) || this.shareable(src, value)) {
        continue;
      }
      this.c.offense(a.exS(value), a.exE(value));
    }
  }
}
