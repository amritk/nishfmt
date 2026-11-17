// Style/LineEndConcatenation (its correction is unsafe: detection only).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

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
  const t = src.tokT[i];
  if (t === TK_tSTRING) {
    return true;
  }
  if (t === TK_tSTRING_BEG || t === TK_tSTRING_END) {
    return src.tokV[i] === "'" || src.tokV[i] === '"';
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
    const nt = toI32(src.tokT.length);
    for (let i = 0; i + 2 < nt; i++) {
      const op = i + 1;
      const succ = i + 2;
      if (
        !rbLecStandard(src, succ) ||
        (src.tokT[op] !== TK_tPLUS && src.tokT[op] !== TK_tLSHFT) ||
        !rbLecStandard(src, i)
      ) {
        continue;
      }
      if (src.line(src.tokS[op]) === src.line(src.tokS[succ])) {
        continue;
      }
      // token_after_last_string
      let j = i + 3;
      if (src.tokT[succ] === TK_tSTRING_BEG) {
        let ends = 1;
        while (ends > 0 && j < nt) {
          if (src.tokT[j] === TK_tSTRING_BEG) {
            ends++;
          } else if (src.tokT[j] === TK_tSTRING_END) {
            ends--;
          }
          j++;
        }
      }
      if (j < nt) {
        const t = src.tokT[j];
        if (t === TK_tSTAR2 || t === TK_tPERCENT || t === TK_tDOT || t === TK_tLBRACK2) {
          continue;
        }
      }
      this.c.offense(src.tokS[op], src.tokE[op]);
    }
  }
}
