// Style/EmptyLiteral (Style/StringLiterals: single_quotes).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_END, NT_ARRAY, NT_BLOCK, NT_NUMBLOCK, NT_SEND, NT_SUPER, NT_ZSUPER, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource, TK_COMMENT } from "../source";
import { ssxGlobalConst, ssxIs, ssxIsSpace, ssxLocIs, ssxMeth } from "./style_syntax_help";

/** (send (const {nil? cbase} :C) :m) with no arguments. */
const ssxElConstCall = (src: RbSource, n: i32, c: string, m: string): boolean =>
  ssxIs(src, n, NT_SEND) && src.a.nKid(n) === 2 && ssxMeth(src, n) === m && ssxGlobalConst(src, src.a.kid(n, 0), c);

/** {(block (send (const C) :new) args _) (numblock (send (const C) :new) ...)} */
const ssxElWithBlock = (src: RbSource, p: i32, c: string): boolean =>
  p !== V_NIL &&
  (src.a.type(p) === NT_BLOCK || src.a.type(p) === NT_NUMBLOCK) &&
  ssxElConstCall(src, src.a.kid(p, 0), c, "new");

/** `C.new`, `C.new([])` (Array only) not given a block, `C[]` or `C([])`. */
const ssxElOffense = (src: RbSource, n: i32, c: string): boolean => {
  const a = src.a;
  if (ssxIs(src, n, NT_SEND) && ssxMeth(src, n) === "new" && ssxGlobalConst(src, a.kid(n, 0), c)) {
    let ok = a.nKid(n) === 2;
    if (c === "Array" && a.nKid(n) === 3) {
      const arg = a.kid(n, 2);
      ok = ssxIs(src, arg, NT_ARRAY) && a.nKid(arg) === 0;
    }
    if (ok && !ssxElWithBlock(src, src.parent(n), c)) {
      return true;
    }
  }
  if (ssxElConstCall(src, n, c, "[]")) {
    return true;
  }
  if (ssxIs(src, n, NT_SEND) && a.kid(n, 0) === V_NIL && ssxMeth(src, n) === c && a.nKid(n) === 3) {
    const arg = a.kid(n, 2);
    return ssxIs(src, arg, NT_ARRAY) && a.nKid(arg) === 0;
  }
  return false;
};

/** /\A[[:alnum:]\-_]+\z/ over [s, e) of a line. */
const ssxMcToken = (t: string): boolean => {
  if (t.length === 0) {
    return false;
  }
  for (let i = 0; i < toI32(t.length); i++) {
    const c = t.charCodeAt(i);
    if (!((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 45 || c === 95)) {
      return false;
    }
  }
  return true;
};

/** ASCII downcase. */
export const ssxDowncase = (s: string): string => {
  const out: string[] = [];
  for (let i = 0; i < toI32(s.length); i++) {
    const c = s.charCodeAt(i);
    out.push(c >= 65 && c <= 90 ? String.fromCharCode(c + 32) : s.substring(i, i + 1));
  }
  return out.join("");
};

/** Strip ASCII whitespace from both ends. */
const ssxMcStrip = (s: string): string => {
  let i = 0;
  let j = toI32(s.length);
  while (i < j && (ssxIsSpace(s.charCodeAt(i)) || s.charCodeAt(i) === 0)) {
    i++;
  }
  while (j > i && (ssxIsSpace(s.charCodeAt(j - 1)) || s.charCodeAt(j - 1) === 0)) {
    j--;
  }
  return s.substring(i, j);
};

/** `frozen[_-]string[_-]literal` at the start of s (case per `ci`): its length, or -1. */
const ssxMcKeyword = (s: string, ci: boolean): i32 => {
  const kw = "frozen_string_literal";
  const k = toI32(kw.length);
  if (toI32(s.length) < k) {
    return -1;
  }
  for (let i = 0; i < k; i++) {
    let c = s.charCodeAt(i);
    const w = kw.charCodeAt(i);
    if (ci && c >= 65 && c <= 90) {
      c += 32;
    }
    if (w === 95 ? c !== 95 && c !== 45 : c !== w) {
      return -1;
    }
  }
  return k;
};

/** MagicComment.parse(line).frozen_string_literal == false. */
export const ssxMagicFrozenFalse = (line: string): boolean => {
  const k = toI32(line.length);
  // EmacsComment: /-\*-(?<token>.+)-\*-/ (greedy).
  const e1 = line.indexOf("-*-");
  let e2 = -1;
  if (e1 >= 0) {
    let from = e1 + 3;
    let at = line.substring(from, k).indexOf("-*-");
    while (at >= 0) {
      e2 = from + at;
      from = e2 + 1;
      at = line.substring(from, k).indexOf("-*-");
    }
  }
  if (e1 >= 0 && e2 >= e1 + 4) {
    const body = line.substring(e1 + 3, e2);
    let st = 0;
    const bk = toI32(body.length);
    for (let i = 0; i <= bk; i++) {
      if (i === bk || body.charCodeAt(i) === 59) {
        const tok = ssxMcStrip(body.substring(st, i));
        st = i + 1;
        const kl = ssxMcKeyword(tok, false);
        if (kl < 0) {
          continue;
        }
        let p = kl;
        const tk = toI32(tok.length);
        while (p < tk && ssxIsSpace(tok.charCodeAt(p))) {
          p++;
        }
        if (p >= tk || tok.charCodeAt(p) !== 58) {
          continue;
        }
        p++;
        while (p < tk && ssxIsSpace(tok.charCodeAt(p))) {
          p++;
        }
        const v = tok.substring(p, tk);
        if (ssxMcToken(v)) {
          return ssxDowncase(v) === "false";
        }
      }
    }
    return false;
  }
  // VimComment: no frozen_string_literal.
  const vi = line.indexOf("vim:");
  if (vi >= 0) {
    let j = vi - 1;
    while (j >= 0 && ssxIsSpace(line.charCodeAt(j))) {
      j--;
    }
    let q = vi + 4;
    while (q < k && ssxIsSpace(line.charCodeAt(q))) {
      q++;
    }
    if (j >= 0 && line.charCodeAt(j) === 35 && q < k) {
      return false;
    }
  }
  // SimpleComment: /\A\s*#\s*frozen[_-]string[_-]literal:\s*TOKEN\s*\z/i
  let p = 0;
  while (p < k && ssxIsSpace(line.charCodeAt(p))) {
    p++;
  }
  if (p >= k || line.charCodeAt(p) !== 35) {
    return false;
  }
  p++;
  while (p < k && ssxIsSpace(line.charCodeAt(p))) {
    p++;
  }
  const kl = ssxMcKeyword(line.substring(p, k), true);
  if (kl < 0) {
    return false;
  }
  p += kl;
  if (p >= k || line.charCodeAt(p) !== 58) {
    return false;
  }
  p++;
  const v = ssxMcStrip(line.substring(p, k));
  return ssxMcToken(v) && ssxDowncase(v) === "false";
};

/** FrozenStringLiteral#leading_comment_lines: the 1-based last line of them. */
export const ssxLeadingCommentLinesEnd = (src: RbSource): i32 => {
  for (let i = 0; i < toI32(src.tokT.length); i++) {
    if (src.tokT[i] !== TK_COMMENT) {
      return src.line(src.tokS[i]) - 1;
    }
  }
  return src.lineCount();
};

export class CopStyleEmptyLiteral {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/EmptyLiteral");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    let frozenKnown = false;
    let frozen = true;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND) {
        continue;
      }
      const isArr = ssxElOffense(src, n, "Array");
      const isHash = !isArr && ssxElOffense(src, n, "Hash");
      let isStr = false;
      if (!isArr && !isHash && ssxElConstCall(src, n, "String", "new")) {
        if (!frozenKnown) {
          frozenKnown = true;
          const last = ssxLeadingCommentLinesEnd(src);
          for (let l = 1; l <= last; l++) {
            if (ssxMagicFrozenFalse(src.lineText(l))) {
              frozen = false;
            }
          }
        }
        isStr = !frozen;
      }
      if (!isArr && !isHash && !isStr) {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k === null) {
        continue;
      }
      if (isArr) {
        k.replace(a.exS(n), a.exE(n), "[]");
      } else if (isStr) {
        k.replace(a.exS(n), a.exE(n), "''");
      } else {
        // first_argument_unparenthesized?
        const p = src.parent(n);
        let unpar = false;
        if (p !== V_NIL) {
          const pt = a.type(p);
          const first = pt === NT_SEND ? a.kid(p, 2) : a.kid(p, 0);
          unpar =
            (pt === NT_SEND || pt === NT_SUPER || pt === NT_ZSUPER) && first === n && !ssxLocIs(src, p, F_END, ")");
        }
        if (unpar) {
          const from = ssxElArg0(src, p);
          const parts: string[] = ["{}"];
          for (let i = from + 1; i < a.nKid(p); i++) {
            parts.push(src.nodeSrc(a.kid(p, i)));
          }
          k.replace(a.exS(a.kid(p, from)) - 1, a.exE(a.kid(p, -1)), `(${parts.join(", ")})`);
        } else {
          k.replace(a.exS(n), a.exE(n), "{}");
        }
      }
      this.c.commit(k);
    }
  }
}

/** The index of the first argument among a send's (2) or super's (0) children. */
const ssxElArg0 = (src: RbSource, p: i32): i32 => (src.a.type(p) === NT_SEND ? 2 : 0);
