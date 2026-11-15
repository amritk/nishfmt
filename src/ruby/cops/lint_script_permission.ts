// Lint/ScriptPermission (detection only: its correction is a chmod, which
// changes no source text): a file that starts with `#!` but that its user
// cannot execute. The offense is the shebang comment.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { RbCop } from "../cop";
import { RbSource } from "../source";

export class CopLintScriptPermission {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/ScriptPermission");
  }

  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    if (src.at(0) !== 35 || src.at(1) !== 33 || src.commS.length === 0) {
      return;
    }
    // executable?: File.stat(path).executable? (as root: any execute bit). A
    // path that is not there (stdin) counts as executable.
    const path = src.p.st.path;
    if (path.length === 0 || realpathSync(path) === null || isExecutableSync(path)) {
      return;
    }
    this.c.offense(src.commS[0], src.commE[0]);
  }
}
