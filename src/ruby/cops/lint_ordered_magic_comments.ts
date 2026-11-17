// Lint/OrderedMagicComments (its correction is unsafe; detection only): an
// encoding magic comment after another magic comment, among the leading
// comment lines.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { RbCop } from "../cop";
import { RbSource } from "../source";
import { rbLitLeadingCommentLines } from "./lit_help";
import { RbMagicComment } from "./lit_magic";

export class CopLintOrderedMagicComments {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/OrderedMagicComments");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    if (src.n === 0) {
      return;
    }
    // magic_comment_lines
    let enc = -1;
    let other = -1;
    const lines = rbLitLeadingCommentLines(src);
    for (let i = 0; i < toI32(lines.length); i++) {
      const mc = new RbMagicComment(lines[i]);
      if (mc.encoding() !== null) {
        enc = i;
      } else if (mc.valid()) {
        other = i;
      }
      if (enc >= 0 && other >= 0) {
        break;
      }
    }
    if (enc < 0 || other < 0 || enc < other) {
      return;
    }
    this.c.offense(src.lineStart(enc + 1), src.lineEnd(enc + 1));
  }
}
