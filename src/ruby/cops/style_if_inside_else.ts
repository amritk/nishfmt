// Style/IfInsideElse (AllowIfModifier: false), with the IfThenCorrector.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_ELSE, F_END, F_KEYWORD, NT_IF, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";
import { LalIgnored, lalBeginsItsLine } from "./layout_align_help";
import {
  ScnAssoc,
  scnElseBranch,
  scnElsif,
  scnIfBranch,
  scnIfKw,
  scnKeyword,
  scnModifier,
  scnRangeWithComments,
  scnSpaces,
  scnTernary,
  scnThen,
  scnUnless,
  scnWholeE,
  scnWholeS,
} from "./style_cond_help";
import { ssxFE, ssxFS, ssxHas, ssxIsSpace } from "./style_syntax_help";

/** IfThenCorrector#replacement. */
export const siieIfThenReplacement = (src: RbSource, n: i32, ind0: string | null, bodyInd: string): string => {
  const ind = ind0 === null ? scnSpaces(src.column(src.a.exS(n))) : ind0;
  const ib = scnIfBranch(src, n);
  const ibs = ib === V_NIL ? "nil" : src.nodeSrc(ib);
  const ei = scnElsif(src, n) ? ind : "";
  const head = `${ei}${scnKeyword(src, n)} ${src.nodeSrc(src.a.kid(n, 0))}\n${ind}${bodyInd}${ibs}\n`;
  const eb = scnElseBranch(src, n);
  let tail = "";
  if (eb === V_NIL) {
    tail = "end";
  } else if (src.a.type(eb) === NT_IF && scnElsif(src, eb)) {
    tail = siieIfThenReplacement(src, eb, ind, bodyInd);
  } else {
    tail = `${ind}else\n${ind}${bodyInd}${src.nodeSrc(eb)}\n${ind}end`;
  }
  return `${head}${tail}`;
};

export class CopStyleIfInsideElse {
  c: RbCop;
  ign: LalIgnored;
  as: ScnAssoc;

  constructor() {
    this.c = new RbCop("Style/IfInsideElse");
    this.ign = new LalIgnored();
    this.as = new ScnAssoc();
  }

  run(src: RbSource): void {
    this.c.begin(src);
    this.ign.reset();
    let built = false;
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_IF || scnTernary(src, n) || scnUnless(src, n)) {
        continue;
      }
      const eb = scnElseBranch(src, n);
      if (eb === V_NIL || a.type(eb) !== NT_IF || !scnIfKw(src, eb)) {
        continue;
      }
      if (!scnModifier(src, eb)) {
        const ee = ssxFE(src, n, F_ELSE);
        const ib = ssxFS(src, eb, F_KEYWORD);
        let between = false;
        for (let i = 0; i < toI32(src.commS.length); i++) {
          if (src.commS[i] > ee && src.commS[i] < ib) {
            between = true;
          }
        }
        if (between) {
          continue;
        }
      }
      const k = this.c.offense(ssxFS(src, eb, F_KEYWORD), ssxFE(src, eb, F_KEYWORD));
      if (k === null) {
        continue;
      }
      if (!built) {
        this.as.build(src);
        built = true;
      }
      if (this.ign.partOf(src, n) || this.sharesLines(src, eb)) {
        continue;
      }
      this.autocorrect(src, eb, k);
      this.c.commit(k);
      this.ign.add(n);
    }
  }

  /** shares_lines_with_other_code? */
  private sharesLines(src: RbSource, n: i32): boolean {
    const a = src.a;
    if (scnThen(src, n)) {
      return false;
    }
    if (scnModifier(src, n)) {
      return !lalBeginsItsLine(src, a.exS(n));
    }
    const rs: i32[] = [ssxFS(src, n, F_KEYWORD), a.exE(a.kid(n, 0))];
    const er = this.findEndRange(src, n);
    rs.push(er[0]);
    rs.push(er[1]);
    const ib = scnIfBranch(src, n);
    if (ib !== V_NIL) {
      const r = scnRangeWithComments(src, this.as, ib);
      rs.push(r[0]);
      rs.push(r[1]);
    }
    for (let i = 0; i < toI32(rs.length); i += 2) {
      if (!lalBeginsItsLine(src, rs[i]) || !this.endsItsLine(src, rs[i + 1])) {
        return true;
      }
    }
    return false;
  }

  /** ends_its_line?: /\A\s*(#|\z)/ on the rest of the line. */
  private endsItsLine(src: RbSource, e: i32): boolean {
    const le = src.lineEnd(src.line(e));
    let p = e;
    while (p < le && ssxIsSpace(src.at(p))) {
      p++;
    }
    return p >= le || src.at(p) === 35;
  }

  /** find_end_range: [s, e] of the node's `end` or its nearest ancestor's. */
  private findEndRange(src: RbSource, n0: i32): i32[] {
    let n = n0;
    while (n !== V_NIL && !ssxHas(src, n, F_END)) {
      n = src.parent(n);
    }
    const r: i32[] = [ssxFS(src, n, F_END), ssxFE(src, n, F_END)];
    return r;
  }

  private autocorrect(src: RbSource, n: i32, k: RbRewriter): void {
    const a = src.a;
    const p = src.parent(n);
    const cond = a.kid(n, 0);
    if (scnThen(src, n)) {
      k.replace(a.exS(n), a.exE(n), siieIfThenReplacement(src, n, null, ""));
      return;
    }
    if (scnModifier(src, n)) {
      k.replace(ssxFS(src, p, F_ELSE), ssxFE(src, p, F_ELSE), `elsif ${src.nodeSrc(cond)}`);
      k.remove(a.exE(scnIfBranch(src, n)), a.exE(cond));
      return;
    }
    k.replace(ssxFS(src, p, F_ELSE), ssxFE(src, p, F_ELSE), `elsif ${src.nodeSrc(cond)}`);
    const cs = ssxFS(src, n, F_KEYWORD);
    const ce = a.exE(cond);
    const ib = scnIfBranch(src, n);
    if (ib !== V_NIL) {
      const r = scnRangeWithComments(src, this.as, ib);
      k.replace(cs, ce, src.src(r[0], r[1]));
      k.remove(scnWholeS(src, r[0]), scnWholeE(src, r[1], true));
    } else {
      k.remove(scnWholeS(src, cs), scnWholeE(src, ce, true));
    }
    k.remove(a.exS(cond), a.exE(cond));
    const er = this.findEndRange(src, n);
    k.remove(scnWholeS(src, er[0]), scnWholeE(src, er[1], true));
  }
}
