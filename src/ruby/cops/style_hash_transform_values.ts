// Style/HashTransformValues (unsafe: detection only).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { RbCop } from "../cop";
import { RbSource } from "../source";
import { rbHtmRun } from "./style_hash_transform_help";

export class CopStyleHashTransformValues {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/HashTransformValues");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    rbHtmRun(src, this.c, false);
  }
}
