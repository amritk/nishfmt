// Style/LineEndConcatenation (its correction is unsafe: detection only).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { fault } from "../../core/fault";
import { add32, atI32 } from "../../core/arr";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import {
  TK_tDOT,
  TK_tLBRACK2,
  TK_tLSHFT,
  TK_tPERCENT,
  TK_tPLUS,
  TK_tSTAR2,
  TK_tSTRING,
  TK_tSTRING_BEG,
  TK_tSTRING_END,
} from "../tables";

/** standard_string_literal?. */
const rbLecStandard = (src: RbSource, i: i32): boolean => {
  const t = atI32(src.tokT, i);
  if (t === TK_tSTRING) {
    return true;
  }
  if (t === TK_tSTRING_BEG || t === TK_tSTRING_END) {
    const tokV = src.tokV;
    if (i < 0 || i >= tokV.length) {
      fault();
      return false;
    }
    return tokV[i] === "'" || tokV[i] === '"';
  }
  return false;
};

export class CopStyleLineEndConcatenation {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/LineEndConcatenation");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const tokT = src.tokT;
    const nt = toI32(tokT.length);
    for (let i = 0; i < nt - 2; i++) {
      const op = i + 1;
      const succ = add32(i, 2);
      if (
        !rbLecStandard(src, succ) ||
        (atI32(tokT, op) !== TK_tPLUS && atI32(tokT, op) !== TK_tLSHFT) ||
        !rbLecStandard(src, i)
      ) {
        continue;
      }
      if (src.line(atI32(src.tokS, op)) === src.line(atI32(src.tokS, succ))) {
        continue;
      }
      // token_after_last_string
      let j = add32(i, 3);
      if (atI32(tokT, succ) === TK_tSTRING_BEG) {
        let ends = 1;
        while (ends > 0 && j >= 0 && j < nt && j < tokT.length) {
          if (tokT[j] === TK_tSTRING_BEG) {
            ends = add32(ends, 1);
          } else if (tokT[j] === TK_tSTRING_END) {
            ends--;
          }
          j++;
        }
      }
      if (j < nt) {
        const t = atI32(tokT, j);
        if (t === TK_tSTAR2 || t === TK_tPERCENT || t === TK_tDOT || t === TK_tLBRACK2) {
          continue;
        }
      }
      this.c.offense(atI32(src.tokS, op), atI32(src.tokE, op));
    }
  }
}
