// Lint/ErbNewArguments.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_HASH, NT_PAIR, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxGlobalConst, ssxIs, ssxMeth } from "./style_syntax_help";

export class CopLintErbNewArguments {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/ErbNewArguments");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIs(src, n, NT_SEND) || ssxMeth(src, n) !== "new" || !ssxGlobalConst(src, a.kid(n, 0), "ERB")) {
        continue;
      }
      const args: i32[] = [];
      for (let i = 2; i < a.nKid(n); i++) {
        args.push(a.kid(n, i));
      }
      const m = toI32(args.length);
      if (m === 0 || m === 1 || (m === 2 && ssxIs(src, args[1], NT_HASH))) {
        continue;
      }
      for (let i = 1; i <= 3 && i < m; i++) {
        const arg = args[i];
        if (ssxIs(src, arg, NT_HASH)) {
          continue;
        }
        const k = this.c.offense(a.exS(arg), a.exE(arg));
        if (k !== null) {
          k.replace(a.exS(args[0]), a.exE(args[m - 1]), this.goodArgs(src, args));
          this.c.commit(k);
        }
      }
    }
  }

  /** The corrected argument list: the string, then trim_mode: and eoutvar: keywords. */
  private goodArgs(src: RbSource, args: i32[]): string {
    const a = src.a;
    const m = toI32(args.length);
    let trim = "";
    let eout = "";
    const last = args[m - 1];
    if (ssxIs(src, last, NT_HASH)) {
      for (let i = 0; i < a.nKid(last); i++) {
        const p = a.kid(last, i);
        if (!ssxIs(src, p, NT_PAIR)) {
          continue;
        }
        const key = src.nodeSrc(a.kid(p, 0));
        if (key === "trim_mode") {
          trim = `trim_mode: ${src.nodeSrc(a.kid(p, 1))}`;
        } else if (key === "eoutvar") {
          eout = `eoutvar: ${src.nodeSrc(a.kid(p, 1))}`;
        }
      }
    }
    if (m > 2 && !ssxIs(src, args[2], NT_HASH)) {
      trim = `trim_mode: ${src.nodeSrc(args[2])}`;
    }
    if (m > 3 && !ssxIs(src, args[3], NT_HASH)) {
      eout = `eoutvar: ${src.nodeSrc(args[3])}`;
    }
    const parts: string[] = [src.nodeSrc(args[0])];
    if (trim.length > 0) {
      parts.push(trim);
    }
    if (eout.length > 0) {
      parts.push(eout);
    }
    return parts.join(", ");
  }
}
