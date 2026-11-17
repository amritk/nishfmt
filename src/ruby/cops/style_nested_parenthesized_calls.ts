// Style/NestedParenthesizedCalls (AllowedMethods: the RSpec matchers of the
// default configuration).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { RbCop } from "../cop";
import { rbSpaceBegin } from "../help";
import { RbSource } from "../source";
import {
  ssxArgc,
  ssxArgs,
  ssxInList,
  ssxIsCall,
  ssxMeth,
  ssxOperatorName,
  ssxParenthesized,
  ssxSetter,
} from "./style_syntax_help";

const SSX_NPC_ALLOWED: string =
  " be be_a be_an be_between be_falsey be_kind_of be_instance_of be_truthy be_within eq eql end_with include match raise_error respond_to start_with ";

export class CopStyleNestedParenthesizedCalls {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/NestedParenthesizedCalls");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIsCall(src, n) || !ssxParenthesized(src, n)) {
        continue;
      }
      for (let i = 0; i < a.nKid(n); i++) {
        const nested = a.kid(n, i);
        if (!ssxIsCall(src, nested)) {
          continue;
        }
        // allowed_omission?
        if (
          ssxArgc(src, nested) === 0 ||
          ssxParenthesized(src, nested) ||
          ssxSetter(src, nested) ||
          ssxOperatorName(ssxMeth(src, nested))
        ) {
          continue;
        }
        if (ssxArgc(src, n) === 1 && ssxInList(SSX_NPC_ALLOWED, ssxMeth(src, nested)) && ssxArgc(src, nested) === 1) {
          continue;
        }
        const k = this.c.offense(a.exS(nested), a.exE(nested));
        if (k === null) {
          continue;
        }
        const args = ssxArgs(src, nested);
        const fs = a.exS(args[0]);
        const le = a.exE(args[args.length - 1]);
        k.replace(rbSpaceBegin(src, fs, 1, true, true, true), fs, "(");
        k.insertAfter(le, le, ")");
        this.c.commit(k);
      }
    }
  }
}
