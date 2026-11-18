// Style/RescueModifier.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, F_END, F_HEREDOC_END, NT_ARRAY, NT_DSTR, NT_RESBODY, NT_STR, NT_XSTR, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { rnHeredoc } from "../node";
import { RbSource } from "../source";
import { rmlSpaces } from "./layout_multiline_help";
import { sbhRpCorrect } from "./style_redundant_parentheses";
import { ssxDescendants, ssxFS, ssxHas, ssxLocIs, ssxRescueModifier } from "./style_syntax_help";

/** heredoc_end: the end of the last-ending heredoc among the node and its descendants (-1 for none). */
const sbhRmHeredocEnd = (src: RbSource, n: i32): i32 => {
  const a = src.a;
  const all: i32[] = [n];
  for (const d of ssxDescendants(src, n)) {
    all.push(d);
  }
  let best = -1;
  for (const s of all) {
    const t = a.type(s);
    if ((t === NT_STR || t === NT_DSTR || t === NT_XSTR) && rnHeredoc(src, s)) {
      const e = a.fE(a.map(s), F_HEREDOC_END);
      if (e > best) {
        best = e;
      }
    }
  }
  return best;
};

/** Style/RescueModifier. */
export class CopStyleRescueModifier {
  c: RbCop;
  ignored: Set<i32>;

  constructor() {
    this.c = new RbCop("Style/RescueModifier");
    this.ignored = new Set<i32>();
  }

  run(src: RbSource): void {
    this.c.begin(src);
    this.ignored = new Set<i32>();
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_RESBODY || !ssxRescueModifier(src, n)) {
        continue;
      }
      const r = src.parent(n);
      const k = this.c.offense(a.exS(r), a.exE(r));
      if (k === null) {
        continue;
      }
      if (sbhRmHeredocEnd(src, n) >= 0 || this.insideCorrected(src, r)) {
        this.c.commit(k);
        continue;
      }
      const p = src.parent(r);
      const parenthesized = p !== V_NIL && ssxLocIs(src, p, F_END, ")");
      // correct_rescue_block
      const op = a.kid(r, 0);
      const col = src.column(a.exS(r));
      let ind = rmlSpaces(col + 2);
      let off = rmlSpaces(col);
      if (parenthesized) {
        ind = rmlSpaces(col + 1);
        off = rmlSpaces(col > 0 ? col - 1 : 0);
      }
      if (
        a.type(op) === NT_ARRAY &&
        !ssxLocIs(src, op, F_BEGIN, "[") &&
        !(ssxHas(src, op, F_BEGIN) && src.at(ssxFS(src, op, F_BEGIN)) === 37)
      ) {
        k.wrap(a.exS(op), a.exE(op), "[", "]");
      }
      k.remove(a.exE(op), a.exE(r));
      k.insertBefore(a.exS(op), a.exE(op), `begin\n${ind}`);
      const he = sbhRmHeredocEnd(src, op);
      const body = a.kid(n, 2);
      const text = `\n${off}rescue\n${ind}${body === V_NIL ? "" : src.nodeSrc(body)}\n${off}end`;
      if (he >= 0) {
        // the heredoc_end range of the heredoc ending last
        k.insertAfter(this.heredocEndStart(src, op, he), he, text);
      } else {
        k.insertAfter(a.exS(op), a.exE(op), text);
      }
      if (parenthesized) {
        sbhRpCorrect(src, k, p);
      }
      this.ignored.add(r);
      this.c.commit(k);
    }
  }

  /** The start of the heredoc_end range that ends at `he`. */
  private heredocEndStart(src: RbSource, n: i32, he: i32): i32 {
    const a = src.a;
    const all: i32[] = [n];
    for (const d of ssxDescendants(src, n)) {
      all.push(d);
    }
    for (const s of all) {
      const t = a.type(s);
      if (
        (t === NT_STR || t === NT_DSTR || t === NT_XSTR) &&
        rnHeredoc(src, s) &&
        a.fE(a.map(s), F_HEREDOC_END) === he
      ) {
        return a.fS(a.map(s), F_HEREDOC_END);
      }
    }
    return he;
  }

  /** inside_corrected_rescue_body? */
  private insideCorrected(src: RbSource, r: i32): boolean {
    let p = src.parent(r);
    while (p !== V_NIL) {
      if (src.a.type(p) === NT_RESBODY && this.ignored.has(src.parent(p))) {
        return true;
      }
      p = src.parent(p);
    }
    return false;
  }
}
