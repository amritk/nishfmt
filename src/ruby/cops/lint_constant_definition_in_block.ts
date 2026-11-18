// Lint/ConstantDefinitionInBlock (AllowedMethods: enums; no correction).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_BEGIN, NT_BLOCK, NT_CASGN, NT_CLASS, NT_MODULE, NT_NUMBLOCK, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { sbhMethodName } from "./style_body_help";
import { ssxIsAnyBlock } from "./style_syntax_help";

export class CopLintConstantDefinitionInBlock {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/ConstantDefinitionInBlock");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_CASGN) {
        if (a.kid(n, 0) !== V_NIL) {
          continue;
        }
      } else if (t !== NT_CLASS && t !== NT_MODULE) {
        continue;
      }
      // {^any_block [^begin ^^any_block]}
      const p = src.parent(n);
      if (p === V_NIL) {
        continue;
      }
      const inBlock = ssxIsAnyBlock(src, p) || (a.type(p) === NT_BEGIN && ssxIsAnyBlock(src, src.parent(p)));
      if (!inBlock) {
        continue;
      }
      if (this.methodName(src, n) === "enums") {
        continue;
      }
      this.c.offense(a.exS(n), a.exE(n));
    }
  }

  /** The method name of the nearest block ancestor. */
  private methodName(src: RbSource, n: i32): string {
    let p = src.parent(n);
    while (p !== V_NIL) {
      const t = src.a.type(p);
      if (t === NT_BLOCK || t === NT_NUMBLOCK) {
        return sbhMethodName(src, src.a.kid(p, 0));
      }
      p = src.parent(p);
    }
    return "";
  }
}
