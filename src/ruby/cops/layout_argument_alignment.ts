// Layout/ArgumentAlignment (EnforcedStyle: with_first_argument).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_DOT, NT_CSEND, NT_HASH, NT_SEND } from "../ast";
import { RbCop } from "../cop";
import { rnBraces, rnHas, rnPairs } from "../node";
import { RbSource } from "../source";
import { LalAligner, lalArgs, lalBinaryOperation, lalIsType, lalMethod } from "./layout_align_help";

export class CopLayoutArgumentAlignment {
  c: RbCop;
  al: LalAligner;

  constructor() {
    this.c = new RbCop("Layout/ArgumentAlignment");
    this.al = new LalAligner();
  }

  run(src: RbSource): void {
    this.c.begin(src);
    this.al.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_SEND && t !== NT_CSEND) {
        continue;
      }
      const args = lalArgs(src, n);
      // multiple_arguments?
      let multiple = args.length >= 2;
      if (!multiple && args.length === 1 && lalIsType(src, args[0], NT_HASH) && rnPairs(src, args[0]).length >= 2) {
        multiple = true;
      }
      if (!multiple) {
        continue;
      }
      const m = lalMethod(src, n);
      if (m === "[]=") {
        continue;
      }
      // binary_operator_call?
      if (lalBinaryOperation(src, n) && m !== "[]" && !rnHas(src, n, F_DOT)) {
        continue;
      }
      // arguments_or_first_arg_pairs
      let items = args;
      if (lalIsType(src, args[0], NT_HASH) && !rnBraces(src, args[0])) {
        items = rnPairs(src, args[0]);
      }
      this.al.check(this.c, src, items, 0, false);
    }
  }
}
