// Style/Dir.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_SEND, NT_STR } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxGlobalConst, ssxIs, ssxMeth } from "./style_syntax_help";

/** (send (const {nil? cbase} :File) :m arg) with exactly one argument: the argument (0 when not). */
const ssxDirFileCall = (src: RbSource, n: i32, m: string): i32 => {
  if (
    !ssxIs(src, n, NT_SEND) ||
    src.a.nKid(n) !== 3 ||
    ssxMeth(src, n) !== m ||
    !ssxGlobalConst(src, src.a.kid(n, 0), "File")
  ) {
    return 0;
  }
  return src.a.kid(n, 2);
};

export class CopStyleDir {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/Dir");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND) {
        continue;
      }
      let inner = ssxDirFileCall(src, n, "expand_path");
      let arg = inner === 0 ? 0 : ssxDirFileCall(src, inner, "dirname");
      if (arg === 0) {
        inner = ssxDirFileCall(src, n, "dirname");
        arg = inner === 0 ? 0 : ssxDirFileCall(src, inner, "realpath");
      }
      if (arg === 0 || !ssxIs(src, arg, NT_STR) || src.nodeSrc(arg) !== "__FILE__") {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k !== null) {
        k.replace(a.exS(n), a.exE(n), "__dir__");
        this.c.commit(k);
      }
    }
  }
}
