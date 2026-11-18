// Lint/EmptyFile (AllowComments: true): an offense for an empty buffer.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { RbCop } from "../cop";
import { RbSource } from "../source";

export class CopLintEmptyFile {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/EmptyFile");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    if (src.n === 0) {
      // add_global_offense: Offense::NO_LOCATION, the empty range at 0 (the
      // JSON formatter prints its last column 0 as 1).
      this.c.offense(0, 0);
    }
  }
}
