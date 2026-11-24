// Style/Documentation (AllowedConstants: [], no project index; Exclude:
// spec/**/*, test/**/*; detection only: no correction).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_NAME, NT_BEGIN, NT_CASGN, NT_CLASS, NT_CONST, NT_MODULE, NT_SEND, NT_STR, NT_SYM, V_NIL } from "../ast";
import { add32, atI32, sub32 } from "../../core/arr";
import { fault } from "../../core/fault";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ScnAssoc, scnIsDirective } from "./style_cond_help";
import { ssxDescendants, ssxFE, ssxFS, ssxIs, ssxIsSpace, ssxIsWord, ssxMeth } from "./style_syntax_help";

/** The text's line starts (`^` positions). */
const rbDocLineStarts = (t: string): i32[] => {
  const out: i32[] = [0];
  for (let i = 0; i < toI32(t.length); i++) {
    if (t.charCodeAt(i) === 10) {
      out.push(i + 1);
    }
  }
  return out;
};

/** The index after `\s*` from i. */
const rbDocWs = (t: string, i0: i32): i32 => {
  let i = i0;
  // Every caller passes a position in t.
  if (i < 0) {
    fault();
    return i;
  }
  while (i >= 0 && i < t.length && ssxIsSpace(t.charCodeAt(i))) {
    i++;
  }
  return i;
};

/** ASCII upcase of a byte. */
const rbDocUp = (c: i32): i32 => (c >= 97 && c <= 122 ? c - 32 : c);

/** A word character for `\b` (non-ASCII bytes count as word characters). */
const rbDocWordByte = (c: i32): boolean => c >= 0x80 || ssxIsWord(c);

/**
 * AnnotationComment#annotation? with Style/CommentAnnotation's default
 * keywords: /^(# ?)(\bKW\b)(\s*:)?(\s+)?(\S+)?/i at its first match, a keyword
 * followed by a colon or a space, and not a capitalized word starting a sentence.
 */
export const rbDocAnnotation = (t: string): boolean => {
  const kws = ["OPTIMIZE", "REVIEW", "FIXME", "TODO", "HACK", "NOTE"];
  const k = toI32(t.length);
  for (const st of rbDocLineStarts(t)) {
    // Line starts are positions in t.
    if (st < 0) {
      fault();
      return false;
    }
    if (st >= t.length || t.charCodeAt(st) !== 35) {
      continue;
    }
    const starts: i32[] = [];
    if (st + 1 < t.length && t.charCodeAt(st + 1) === 32) {
      starts.push(st + 2);
    }
    starts.push(st + 1);
    for (const p of starts) {
      if (p < 0) {
        fault();
        return false;
      }
      for (const kw of kws) {
        const kl = toI32(kw.length);
        if (p > k - kl) {
          continue;
        }
        let ok = true;
        // q runs over p .. p + kl - 1, inside t after the test above.
        let q0 = p;
        for (let i = 0; i < kl; i++) {
          if (q0 < 0 || q0 >= t.length) {
            fault();
            return false;
          }
          if (rbDocUp(t.charCodeAt(q0)) !== kw.charCodeAt(i)) {
            ok = false;
            break;
          }
          q0++;
        }
        const pk = add32(p, kl);
        if (!ok || (pk < k && pk >= 0 && pk < t.length && rbDocWordByte(t.charCodeAt(pk)))) {
          continue;
        }
        // The first match: keyword, (\s*:)?, (\s+)?, (\S+)?
        const word = t.substring(p, pk);
        let q = pk;
        // rbDocWs answers a position no less than the one it was given.
        const r = rbDocWs(t, q);
        let colon = false;
        if (r >= 0 && r < k && r < t.length && t.charCodeAt(r) === 58) {
          colon = true;
          q = r + 1;
        }
        const sp = rbDocWs(t, q);
        const space = sp > q;
        const note = sp >= 0 && sp < k && sp < t.length && !ssxIsSpace(t.charCodeAt(sp));
        if (!colon && !space) {
          return false;
        }
        // just_keyword_of_sentence?: keyword == keyword.capitalize
        let cap = word.length > 0 && word.charCodeAt(0) >= 65 && word.charCodeAt(0) <= 90;
        for (let i = 1; i < kl && i < word.length; i++) {
          const c = word.charCodeAt(i);
          if (c >= 65 && c <= 90) {
            cap = false;
          }
        }
        return !(cap && !colon && space && note);
      }
    }
  }
  return false;
};

/** /^#\s*(frozen_string_literal|encoding):/ */
const rbDocInterpreterDirective = (t: string): boolean => {
  for (const st of rbDocLineStarts(t)) {
    // Line starts are positions in t.
    if (st < 0) {
      fault();
      return false;
    }
    if (st >= t.length || t.charCodeAt(st) !== 35) {
      continue;
    }
    const p = rbDocWs(t, st + 1);
    if (t.substring(p, add32(p, 22)) === "frozen_string_literal:" || t.substring(p, add32(p, 9)) === "encoding:") {
      return true;
    }
  }
  return false;
};

/** nodoc?: /^#\s*:nodoc:/, or with require_all /^#\s*:nodoc:\s+all\s*$/. */
const rbDocNodocText = (t: string, all: boolean): boolean => {
  const k = toI32(t.length);
  for (const st of rbDocLineStarts(t)) {
    // Line starts are positions in t.
    if (st < 0) {
      fault();
      return false;
    }
    if (st >= t.length || t.charCodeAt(st) !== 35) {
      continue;
    }
    let p = rbDocWs(t, st + 1);
    const p7 = add32(p, 7);
    if (t.substring(p, p7) !== ":nodoc:") {
      continue;
    }
    if (!all) {
      return true;
    }
    p = p7;
    // \s+all\s*$
    const q = rbDocWs(t, p);
    const q3 = add32(q, 3);
    if (q === p || t.substring(q, q3) !== "all") {
      continue;
    }
    let e = q3;
    while (e >= 0 && e < k && e < t.length && t.charCodeAt(e) !== 10 && ssxIsSpace(t.charCodeAt(e))) {
      e++;
    }
    // e >= q + 3 > 0.
    if (e >= k || (e >= 0 && e < t.length && t.charCodeAt(e) === 10)) {
      return true;
    }
  }
  return false;
};

export class CopStyleDocumentation {
  c: RbCop;
  as: ScnAssoc;

  constructor() {
    this.c = new RbCop("Style/Documentation");
    this.as = new ScnAssoc();
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    let path = src.p.st.path;
    while (path.startsWith("./")) {
      path = path.substring(2, toI32(path.length));
    }
    if (path.startsWith("spec/") || path.startsWith("test/")) {
      return;
    }
    let built = false;
    const a = src.a;
    for (const n of src.pre) {
      if (!a.isNode(n)) {
        continue;
      }
      const t = a.type(n);
      if (t !== NT_CLASS && t !== NT_MODULE) {
        continue;
      }
      const body = a.kid(n, -1);
      if (t === NT_CLASS && body === V_NIL) {
        continue;
      }
      if (this.namespace(src, body)) {
        continue;
      }
      if (!built) {
        this.as.build(src);
        built = true;
      }
      if (this.documentationComment(src, n)) {
        continue;
      }
      if (this.nodocComment(src, n, false)) {
        continue;
      }
      if (src.src(ssxFS(src, n, F_NAME), ssxFE(src, n, F_NAME)).indexOf("::", 0) >= 0) {
        let outer = V_NIL;
        const all: i32[] = [n];
        for (const d of ssxDescendants(src, n)) {
          all.push(d);
        }
        for (const d of all) {
          if (ssxIs(src, d, NT_CONST) && ssxIs(src, a.kid(d, 0), NT_CONST) && a.kid(a.kid(d, 0), 0) === V_NIL) {
            outer = d;
            break;
          }
        }
        if (this.nodocComment(src, outer, false)) {
          continue;
        }
      }
      if (this.includeOnly(src, body)) {
        continue;
      }
      this.c.offense(a.exS(n), ssxFE(src, n, F_NAME));
    }
  }

  /** constant_definition? / constant_visibility_declaration?. */
  private constantDeclaration(src: RbSource, n: i32): boolean {
    const a = src.a;
    if (ssxIs(src, n, NT_CLASS) || ssxIs(src, n, NT_MODULE) || ssxIs(src, n, NT_CASGN)) {
      return true;
    }
    if (!ssxIs(src, n, NT_SEND) || a.kid(n, 0) !== V_NIL || a.nKid(n) !== 3) {
      return false;
    }
    const m = ssxMeth(src, n);
    const arg = a.kid(n, 2);
    return (
      (m === "public_constant" || m === "private_constant") &&
      (ssxIs(src, arg, NT_SYM) || ssxIs(src, arg, NT_STR)) &&
      a.nKid(arg) === 1
    );
  }

  /** namespace?. */
  private namespace(src: RbSource, body: i32): boolean {
    const a = src.a;
    if (!a.isNode(body)) {
      return false;
    }
    if (a.type(body) === NT_BEGIN) {
      for (let i = 0; i < a.nKid(body); i++) {
        if (!this.constantDeclaration(src, a.kid(body, i))) {
          return false;
        }
      }
      return true;
    }
    const t = a.type(body);
    return t === NT_CLASS || t === NT_MODULE || t === NT_CASGN;
  }

  /** include_statement_only?. */
  private includeOnly(src: RbSource, n: i32): boolean {
    const a = src.a;
    if (!a.isNode(n)) {
      return false;
    }
    if (ssxIs(src, n, NT_SEND) && a.kid(n, 0) === V_NIL && a.nKid(n) === 3 && ssxIs(src, a.kid(n, 2), NT_CONST)) {
      const m = ssxMeth(src, n);
      if (m === "include" || m === "extend" || m === "prepend") {
        return true;
      }
    }
    for (let i = 0; i < a.nKid(n); i++) {
      if (!this.includeOnly(src, a.kid(n, i))) {
        return false;
      }
    }
    return true;
  }

  /** DocumentationComment#documentation_comment?. */
  private documentationComment(src: RbSource, n: i32): boolean {
    const line = src.line(src.a.exS(n));
    const pre: i32[] = [];
    for (const ci of this.as.of(n)) {
      if (src.line(atI32(src.commS, ci)) < line) {
        pre.push(ci);
      }
    }
    const np = toI32(pre.length);
    if (np <= 0) {
      return false;
    }
    const last = pre[np - 1];
    if (sub32(line, src.line(atI32(src.commS, last))) !== 1) {
      return false;
    }
    // comment_line?(source): /^\s*#/
    const lt = src.src(atI32(src.commS, last), atI32(src.commE, last));
    let commentLine = false;
    for (const st of rbDocLineStarts(lt)) {
      // rbDocWs answers a position no less than the one it was given.
      const p = rbDocWs(lt, st);
      if (p >= 0 && p < lt.length && lt.charCodeAt(p) === 35) {
        commentLine = true;
      }
    }
    if (!commentLine) {
      return false;
    }
    for (const ci of pre) {
      const t = src.src(atI32(src.commS, ci), atI32(src.commE, ci));
      if (!rbDocAnnotation(t) && !rbDocInterpreterDirective(t) && !scnIsDirective(t)) {
        return true;
      }
    }
    return false;
  }

  /** nodoc_comment?. */
  private nodocComment(src: RbSource, n0: i32, all0: boolean): boolean {
    const a = src.a;
    let n = n0;
    let all = all0;
    while (n !== V_NIL) {
      const first = a.kid(n, 0);
      if (first === V_NIL) {
        return false;
      }
      if (a.isNode(first)) {
        const cs = this.as.of(first);
        if (cs.length > 0) {
          const ci = cs[0];
          if (
            src.line(atI32(src.commS, ci)) === src.line(a.exS(n)) &&
            rbDocNodocText(src.src(atI32(src.commS, ci), atI32(src.commE, ci)), all)
          ) {
            return true;
          }
        }
      }
      n = src.parent(n);
      all = true;
    }
    return false;
  }
}
