// Lint/AmbiguousBlockAssociation (AllowedMethods: [], AllowedPatterns: []).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_SELECTOR, NT_BLOCK, NT_NUMBLOCK, NT_SEND, NT_SUPER, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import {
  ssxArgc,
  ssxAssignment,
  ssxBeginIs,
  ssxDescendants,
  ssxFE,
  ssxGlobalConst,
  ssxInList,
  ssxIs,
  ssxIsAnyBlock,
  ssxIsCall,
  ssxMeth,
  ssxOperatorName,
  ssxParenthesized,
} from "./style_syntax_help";

const LABA_BLOCK_METHODS: string =
  " map collect flat_map collect_concat select filter find_all reject find detect each each_with_object each_with_index reduce inject sort_by min_by max_by group_by filter_map ";

/** Node#lambda_or_proc?: a block whose send is `lambda`, a `proc` block, or `Proc.new` (with or without a block). */
export const labaLambdaOrProc = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  if (ssxIsAnyBlock(src, n)) {
    const s = a.kid(n, 0);
    // BlockNode#lambda?: send_node.method?(:lambda)
    if (ssxIsCall(src, s) && ssxMeth(src, s) === "lambda") {
      return true;
    }
  }
  if (ssxIs(src, n, NT_BLOCK)) {
    const s = a.kid(n, 0);
    if (ssxIs(src, s, NT_SEND) && a.kid(s, 0) === V_NIL && ssxMeth(src, s) === "proc" && a.nKid(s) === 2) {
      return true;
    }
    if (ssxIs(src, s, NT_SEND) && ssxGlobalConst(src, a.kid(s, 0), "Proc") && ssxMeth(src, s) === "new" && a.nKid(s) === 2) {
      return true;
    }
  }
  return ssxIs(src, n, NT_SEND) && ssxGlobalConst(src, a.kid(n, 0), "Proc") && ssxMeth(src, n) === "new" && a.nKid(n) === 2;
};

/** The call's arguments? (a lambda/send/csend with arguments). */
const labaHasArgs = (src: RbSource, n: i32): boolean => (ssxIsCall(src, n) && ssxArgc(src, n) > 0) || (ssxIs(src, n, NT_SUPER) && src.a.nKid(n) > 0);

export class CopLintAmbiguousBlockAssociation {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/AmbiguousBlockAssociation");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (ssxIsCall(src, n)) {
        this.onSend(src, n);
      } else if (t === NT_BLOCK || t === NT_NUMBLOCK) {
        this.onBlock(src, n);
      }
    }
  }

  private onSend(src: RbSource, n: i32): void {
    const a = src.a;
    if (ssxArgc(src, n) <= 0) {
      return;
    }
    const last = a.kid(n, -1);
    if (!ssxIsAnyBlock(src, last) || labaHasArgs(src, a.kid(last, 0))) {
      return;
    }
    if (ssxParenthesized(src, n) || labaLambdaOrProc(src, last)) {
      return;
    }
    if (ssxAssignment(src, n) || ssxOperatorName(ssxMeth(src, n))) {
      return;
    }
    const k = this.c.offense(a.exS(n), a.exE(n));
    if (k !== null) {
      const s = ssxFE(src, n, F_SELECTOR);
      const e = a.exS(a.kid(n, 2));
      k.remove(s, e);
      k.insertBefore(s, e, "(");
      k.insertAfter(a.exS(last), a.exE(last), ")");
      this.c.commit(k);
    }
  }

  private onBlock(src: RbSource, n: i32): void {
    const a = src.a;
    if (ssxBeginIs(src, n, "{")) {
      return;
    }
    const sn = a.kid(n, 0);
    if (!ssxIs(src, sn, NT_SEND) || ssxArgc(src, sn) <= 0 || ssxParenthesized(src, sn)) {
      return;
    }
    // find_block_method_arg: last_argument.each_node(:call)
    const last = a.kid(sn, -1);
    const end = a.exE(sn);
    const cands: i32[] = [last];
    for (const d of ssxDescendants(src, last)) {
      cands.push(d);
    }
    for (const c of cands) {
      if (ssxIsCall(src, c) && a.exE(c) === end && ssxInList(LABA_BLOCK_METHODS, ssxMeth(src, c)) && ssxArgc(src, c) === 0) {
        this.c.offense(a.exS(c), a.exE(c));
        return;
      }
    }
  }
}
