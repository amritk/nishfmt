// Lint/InterpolationCheck. Its correction is unsafe, so it only detects; the
// interpolated source is still reparsed (valid_syntax?).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, F_END, M_HEREDOC, NT_DSTR, NT_REGEXP, NT_STR, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { lbhSiblingIndex } from "./lint_batch_help";
import { ssxFE, ssxFS, ssxHas, ssxIs } from "./style_syntax_help";

export class CopLintInterpolationCheck {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/InterpolationCheck");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_STR) {
        this.check(src, n);
      } else if (t === NT_DSTR) {
        if (this.heredoc(src, n)) {
          continue;
        }
        if (this.beginIs(src, n, 39)) {
          this.check(src, n);
        }
      }
    }
  }

  /** loc.begin is the one character c. */
  private beginIs(src: RbSource, n: i32, c: i32): boolean {
    if (!ssxHas(src, n, F_BEGIN)) {
      return false;
    }
    const s = ssxFS(src, n, F_BEGIN);
    return ssxFE(src, n, F_BEGIN) === s + 1 && src.at(s) === c;
  }

  /** The node or an ancestor has a heredoc map. */
  private heredoc(src: RbSource, n: i32): boolean {
    let p = n;
    while (p !== V_NIL) {
      if (src.a.mapKind(src.a.map(p)) === M_HEREDOC) {
        return true;
      }
      p = src.parent(p);
    }
    return false;
  }

  /** /(?<!\\)#\{.*\}/ on the node's source. */
  private looksInterpolated(src: RbSource, n: i32): boolean {
    const s = src.a.exS(n);
    const e = src.a.exE(n);
    for (let i = s; i + 1 < e; i++) {
      if (src.at(i) !== 35 || src.at(i + 1) !== 123 || (i > s && src.at(i - 1) === 92)) {
        continue;
      }
      for (let j = i + 2; j < e && src.at(j) !== 10; j++) {
        if (src.at(j) === 125) {
          return true;
        }
      }
    }
    return false;
  }

  private check(src: RbSource, n: i32): void {
    const a = src.a;
    const p = src.parent(n);
    if (p !== V_NIL && a.type(p) === NT_REGEXP) {
      return;
    }
    if (!this.looksInterpolated(src, n) || this.heredoc(src, n)) {
      return;
    }
    if (!this.beginIs(src, n, 39) || !ssxHas(src, n, F_END)) {
      return;
    }
    const rs = new RbSource(this.interpolated(src, n), src.p.st.path);
    if (!rs.valid || rs.root === V_NIL || !ssxIs(rs, rs.root, NT_DSTR)) {
      return;
    }
    this.c.offense(a.exS(n), a.exE(n));
  }

  /** interpolated_source. */
  private interpolated(src: RbSource, n: i32): i32[] {
    const a = src.a;
    const s = a.exS(n) + 1;
    const e = a.exE(n) - 1;
    const out: i32[] = [];
    let hasQuote = false;
    for (let i = s; i < e; i++) {
      if (src.at(i) === 34) {
        hasQuote = true;
      }
    }
    if (!hasQuote) {
      out.push(34);
      for (let i = s; i < e; i++) {
        out.push(src.at(i));
      }
      out.push(34);
      return out;
    }
    const p = src.parent(n);
    const continued = p !== V_NIL && a.type(p) === NT_DSTR && lbhSiblingIndex(src, n) > 0;
    if (!continued) {
      out.push(37);
      out.push(123);
      for (let i = s; i < e; i++) {
        out.push(src.at(i));
      }
      out.push(125);
      return out;
    }
    // %("#{content.gsub(/\\.|"/) { |m| m == '"' ? '\"' : m }}")
    out.push(34);
    let i = s;
    while (i < e) {
      const c = src.at(i);
      if (c === 92 && i + 1 < e && src.at(i + 1) !== 10) {
        out.push(c);
        out.push(src.at(i + 1));
        i += 2;
        continue;
      }
      if (c === 34) {
        out.push(92);
      }
      out.push(c);
      i++;
    }
    out.push(34);
    return out;
  }
}
