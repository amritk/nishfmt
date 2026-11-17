// Metrics/ClassLength (detection only; CountComments: false, Max: 100,
// CountAsOne: []).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  NT_AND_ASGN,
  NT_BLOCK,
  NT_CASGN,
  NT_CLASS,
  NT_CVASGN,
  NT_GVASGN,
  NT_IVASGN,
  NT_LVASGN,
  NT_MASGN,
  NT_NUMBLOCK,
  NT_OP_ASGN,
  NT_OR_ASGN,
  NT_SCLASS,
  NT_SEND,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { rnHasAncestor } from "../node";
import { RbSource } from "../source";
import { RbLayLines } from "./layout_empty_help";
import { mtxCheckCodeLength } from "./metrics_help";
import { ssxGlobalConst } from "./style_syntax_help";

/** The `expression` of an assignment node (Node#assignment? types), or V_NIL. */
const mclAsgnExpression = (src: RbSource, n: i32): i32 => {
  const t = src.a.type(n);
  if (t === NT_CASGN) {
    return src.a.kid(n, 2);
  }
  if (t === NT_LVASGN || t === NT_IVASGN || t === NT_CVASGN || t === NT_GVASGN || t === NT_MASGN) {
    return src.a.kid(n, 1);
  }
  if (t === NT_OP_ASGN || t === NT_OR_ASGN || t === NT_AND_ASGN) {
    return src.a.kid(n, -1);
  }
  return V_NIL;
};

/** Node#assignment? (also SendNode#assignment?, a setter). */
const mclAssignment = (src: RbSource, n: i32): boolean => {
  const t = src.a.type(n);
  return (
    t === NT_CASGN ||
    t === NT_LVASGN ||
    t === NT_IVASGN ||
    t === NT_CVASGN ||
    t === NT_GVASGN ||
    t === NT_MASGN ||
    t === NT_OP_ASGN ||
    t === NT_OR_ASGN ||
    t === NT_AND_ASGN
  );
};

/** find_expression_within_parent. */
const mclFromParent = (src: RbSource, parent: i32): i32 => {
  if (parent === V_NIL) {
    return V_NIL;
  }
  if (mclAssignment(src, parent)) {
    return mclAsgnExpression(src, parent);
  }
  const pp = src.parent(parent);
  if (pp !== V_NIL && src.a.type(pp) === NT_MASGN) {
    return src.a.kid(pp, 1);
  }
  return V_NIL;
};

/** Node#class_definition?: a class, an sclass, or a block on `Struct.new`/`Class.new`. */
const mclClassDefinition = (src: RbSource, n: i32): boolean => {
  if (!src.a.isNode(n)) {
    return false;
  }
  const t = src.a.type(n);
  if (t === NT_CLASS || t === NT_SCLASS) {
    return true;
  }
  if (t !== NT_BLOCK && t !== NT_NUMBLOCK) {
    return false;
  }
  const s = src.a.kid(n, 0);
  if (!src.a.isNode(s) || src.a.type(s) !== NT_SEND || src.a.text(src.a.kid(s, 1)) !== "new") {
    return false;
  }
  const r = src.a.kid(s, 0);
  return ssxGlobalConst(src, r, "Struct") || ssxGlobalConst(src, r, "Class");
};

export class CopMetricsClassLength {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Metrics/ClassLength");
  }
  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const L = new RbLayLines(src);
    for (const n of src.pre) {
      const t = src.a.type(n);
      if (t === NT_CLASS) {
        mtxCheckCodeLength(this.c, src, L, n, 100);
      } else if (t === NT_SCLASS) {
        if (!rnHasAncestor(src, n, NT_CLASS)) {
          mtxCheckCodeLength(this.c, src, L, n, 100);
        }
      } else if (t === NT_CASGN) {
        let b = src.a.kid(n, 2);
        if (b === V_NIL) {
          b = mclFromParent(src, src.parent(n));
        }
        if (mclClassDefinition(src, b)) {
          mtxCheckCodeLength(this.c, src, L, b, 100);
        }
      }
    }
  }
}
