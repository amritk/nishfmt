// Lint/EnsureReturn (no correction).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_BLOCK, NT_DEF, NT_DEFS, NT_ENSURE, NT_NUMBLOCK, NT_RETURN, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { lbhBlockIsLambda } from "./lint_batch_help";
import { ssxDescendants } from "./style_syntax_help";

export class CopLintEnsureReturn {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/EnsureReturn");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_ENSURE) {
        continue;
      }
      const br = a.kid(n, -1);
      if (br === V_NIL || !a.isNode(br)) {
        continue;
      }
      // each_node(:return): the branch itself, then its descendants.
      const nodes: i32[] = [br];
      for (const d of ssxDescendants(src, br)) {
        nodes.push(d);
      }
      for (const r of nodes) {
        if (a.type(r) !== NT_RETURN || this.innerScope(src, r, n)) {
          continue;
        }
        this.c.offense(a.exS(r), a.exE(r));
      }
    }
  }

  private innerScope(src: RbSource, r: i32, ens: i32): boolean {
    let p = src.parent(r);
    while (p !== V_NIL && p !== ens) {
      const t = src.a.type(p);
      if (t === NT_DEF || t === NT_DEFS) {
        return true;
      }
      if ((t === NT_BLOCK || t === NT_NUMBLOCK) && lbhBlockIsLambda(src, p)) {
        return true;
      }
      p = src.parent(p);
    }
    return false;
  }
}
