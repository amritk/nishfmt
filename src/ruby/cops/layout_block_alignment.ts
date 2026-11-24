// Layout/BlockAlignment (EnforcedStyleAlignWith: either).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { add32, sub32 } from "../../core/arr";
import {
  F_BEGIN,
  F_END,
  F_KEYWORD,
  F_SELECTOR,
  NT_AND,
  NT_BLOCK,
  NT_CSEND,
  NT_MASGN,
  NT_OP_ASGN,
  NT_OR,
  NT_SEND,
  NT_SPLAT,
  NT_SUPER,
  NT_YIELD,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { rnE, rnHas, rnMethod, rnS } from "../node";
import { RbSource } from "../source";
import { TK_tLBRACK, TK_tLBRACK2, TK_tLPAREN, TK_tLPAREN2, TK_tRBRACK, TK_tRPAREN } from "../tables";
import {
  rmlBeginsItsLine,
  rmlFirstNonWs,
  rmlIsAssignment,
  rmlIsBlock,
  rmlIsDef,
  rmlSpaces,
} from "./layout_multiline_help";

/** block_end_align_target?(parent, current). */
const rmlBaTargetPattern = (src: RbSource, parent: i32, cur: i32): boolean => {
  const a = src.a;
  if (rmlIsAssignment(src, parent) || rmlIsDef(src, parent)) {
    return true;
  }
  const t = a.type(parent);
  if (t === NT_SPLAT || t === NT_AND || t === NT_OR) {
    return true;
  }
  if (t === NT_SEND) {
    const m = rnMethod(src, parent);
    if (m === "<<") {
      return true;
    }
    return a.kid(parent, 0) === cur && m !== "[]";
  }
  return false;
};

/** find_lhs_node. */
const rmlBaLhs = (src: RbSource, n0: i32): i32 => {
  let n = n0;
  while (src.a.type(n) === NT_OP_ASGN || src.a.type(n) === NT_MASGN) {
    n = src.a.kid(n, 0);
  }
  return n;
};

/** start_for_block_node. */
export const rmlBaStartForBlock = (src: RbSource, blk: i32): i32 => {
  // block_end_align_target
  let cur = blk;
  let target = V_NIL;
  while (true) {
    const p = src.parent(cur);
    if (p === V_NIL) {
      target = cur;
      break;
    }
    const disq = src.line(src.a.exS(p)) !== src.line(src.a.exS(cur)) && src.a.type(p) !== NT_MASGN;
    if (disq || !rmlBaTargetPattern(src, p, cur)) {
      target = cur;
      break;
    }
    cur = p;
  }
  return rmlBaLhs(src, target);
};

/** start_for_line_node. */
export const rmlBaStartForLine = (src: RbSource, blk: i32): i32 => {
  const start = rmlBaStartForBlock(src, blk);
  const line = src.line(src.a.exS(start));
  let found = V_NIL;
  let p = src.parent(start);
  while (p !== V_NIL) {
    if (src.line(src.a.exS(p)) === line) {
      found = p;
    }
    p = src.parent(p);
  }
  return rmlBaLhs(src, found === V_NIL ? start : found);
};

export class CopLayoutBlockAlignment {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/BlockAlignment");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    for (const n of src.pre) {
      if (!rmlIsBlock(src, n)) {
        continue;
      }
      const start = rmlBaStartForBlock(src, n);
      const es = rnS(src, n, F_END);
      if (!rmlBeginsItsLine(src, es)) {
        continue;
      }
      const ecol = src.column(es);
      if (src.column(src.a.exS(start)) === ecol) {
        continue;
      }
      // compute_do_source_line_column
      const ds = rnS(src, n, F_BEGIN);
      const anchor = this.anchor(src, n, ds);
      const p1 = rmlFirstNonWs(src, src.line(anchor));
      const p2 = rmlFirstNonWs(src, src.line(ds));
      if ((p1 >= 0 && src.column(p1) === ecol) || (p2 >= 0 && src.column(p2) === ecol)) {
        continue;
      }
      const k = this.c.offense(es, rnE(src, n, F_END));
      if (k === null) {
        continue;
      }
      // shift_end_to_start_col
      const anc = rmlBaStartForLine(src, n);
      const delta = sub32(src.column(src.a.exS(anc)), ecol);
      if (delta > 0) {
        k.insertBefore(es, rnE(src, n, F_END), rmlSpaces(delta));
      } else if (delta < 0) {
        k.remove(add32(es, delta), es);
      }
      this.c.commit(k);
    }
  }

  /** do_line_anchor_loc: the start of the range the do line is measured from. */
  private anchor(src: RbSource, n: i32, ds: i32): i32 {
    const a = src.a;
    const l = src.line(ds);
    const fc = rmlFirstNonWs(src, l);
    if (fc < 0) {
      return ds;
    }
    // inside_parentheses?
    let opens = 0;
    let closes = 0;
    const s = a.exS(n);
    const tokT = src.tokT;
    const tokS = src.tokS;
    for (let i = 0; i < tokT.length && i < tokS.length; i++) {
      const ts = tokS[i];
      if (ts < s || ts >= fc) {
        continue;
      }
      const t = tokT[i];
      if (t === TK_tLPAREN || t === TK_tLPAREN2 || t === TK_tLBRACK || t === TK_tLBRACK2) {
        opens = add32(opens, 1);
      } else if (t === TK_tRPAREN || t === TK_tRBRACK) {
        closes = add32(closes, 1);
      }
    }
    if (opens <= closes) {
      return ds;
    }
    const sn = a.kid(n, 0);
    const args: i32[] = [];
    const st = a.type(sn);
    if (st === NT_SEND || st === NT_CSEND) {
      for (let i = 2; i < a.nKid(sn); i++) {
        args.push(a.kid(sn, i));
      }
    } else if (st === NT_SUPER || st === NT_YIELD) {
      for (let i = 0; i < a.nKid(sn); i++) {
        args.push(a.kid(sn, i));
      }
    }
    if (a.type(n) === NT_BLOCK) {
      const ba = a.kid(n, 1);
      for (let i = 0; i < a.nKid(ba); i++) {
        args.push(a.kid(ba, i));
      }
    }
    let inside = false;
    for (const x of args) {
      if (a.isNode(x) && a.exS(x) <= fc && fc < a.exE(x)) {
        inside = true;
        break;
      }
    }
    if (!inside) {
      return ds;
    }
    if (rnHas(src, sn, F_KEYWORD)) {
      return rnS(src, sn, F_KEYWORD);
    }
    if (rnHas(src, sn, F_SELECTOR)) {
      return rnS(src, sn, F_SELECTOR);
    }
    return a.exS(sn);
  }
}
