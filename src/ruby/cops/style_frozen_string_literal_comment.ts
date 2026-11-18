// Style/FrozenStringLiteralComment (EnforcedStyle: always; its correction
// is unsafe: detection only).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { RbCop } from "../cop";
import { RbSource } from "../source";
import { rbLitLeadingCommentLines } from "./lit_help";
import { RbMagicComment } from "./lit_magic";

export class CopStyleFrozenStringLiteralComment {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/FrozenStringLiteralComment");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    if (src.tokT.length === 0 || src.p.st.path.endsWith(".arb")) {
      return;
    }
    // frozen_string_literal_comment_exists?: a leading comment line with a valid value.
    for (const line of rbLitLeadingCommentLines(src)) {
      const v = new RbMagicComment(line).frozenStringLiteral();
      if (v !== null && (v === "true" || v === "false")) {
        return;
      }
    }
    // source_range(buffer, 0, 0): one character long.
    this.c.offense(0, 1);
  }
}
