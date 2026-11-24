// Layout/InitialIndentation: indentation of the first non-comment token.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { atI32 } from "../../core/arr";
import { RbCop } from "../cop";
import { RbSource, TK_COMMENT } from "../source";

export class CopLayoutInitialIndentation {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/InitialIndentation");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    // first_token: the first token that is not a comment.
    let t = -1;
    const tokT = src.tokT;
    for (let i = 0; i < toI32(src.tokS.length) && i < tokT.length; i++) {
      if (tokT[i] !== TK_COMMENT) {
        t = i;
        break;
      }
    }
    if (t < 0) {
      return;
    }
    const s = atI32(src.tokS, t);
    if (src.column(s) === 0) {
      return;
    }
    // range_with_surrounding_space(side: :left, newlines: false)
    let b = s;
    while (b > 0 && (src.at(b - 1) === 32 || src.at(b - 1) === 9)) {
      b--;
    }
    if (b === s) {
      return;
    }
    const k = this.c.offense(s, atI32(src.tokE, t));
    if (k !== null) {
      k.remove(b, s);
      this.c.commit(k);
    }
  }
}
