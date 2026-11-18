// Style/RedundantSelfAssignment (unsafe: detection only).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_OPERATOR,
  NT_CVAR,
  NT_CVASGN,
  NT_GVAR,
  NT_GVASGN,
  NT_IVAR,
  NT_IVASGN,
  NT_LVAR,
  NT_LVASGN,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { vfSameNode } from "./lint_variable_force";
import { rbNodeReceiver } from "./style_float_division";
import { sbhAssignmentMethod } from "./style_body_help";
import { ssxFE, ssxFS, ssxInList, ssxIsAnyBlock, ssxIsCall, ssxIs, ssxMeth } from "./style_syntax_help";

// METHODS_RETURNING_SELF.
const RB_RSA_METHODS: string =
  " append clear collect! compare_by_identity concat delete_if fill initialize_copy insert keep_if map! merge!" +
  " prepend push rehash replace reverse! rotate! shuffle! sort! sort_by! transform_keys! transform_values! unshift update ";

export class CopStyleRedundantSelfAssignment {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/RedundantSelfAssignment");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!a.isNode(n)) {
        continue;
      }
      const t = a.type(n);
      let rt = -1;
      if (t === NT_LVASGN) {
        rt = NT_LVAR;
      } else if (t === NT_IVASGN) {
        rt = NT_IVAR;
      } else if (t === NT_CVASGN) {
        rt = NT_CVAR;
      } else if (t === NT_GVASGN) {
        rt = NT_GVAR;
      }
      if (rt >= 0) {
        const rhs = a.kid(n, 1);
        if (rhs === V_NIL || !(ssxIsAnyBlock(src, rhs) || ssxIsCall(src, rhs))) {
          continue;
        }
        const m = ssxIsCall(src, rhs)
          ? ssxMeth(src, rhs)
          : ssxIsCall(src, a.kid(rhs, 0))
            ? ssxMeth(src, a.kid(rhs, 0))
            : "";
        if (!ssxInList(RB_RSA_METHODS, m)) {
          continue;
        }
        const r = rbNodeReceiver(src, rhs);
        if (r === V_NIL || !ssxIs(src, r, rt) || a.text(a.kid(r, 0)) !== a.text(a.kid(n, 0))) {
          continue;
        }
        this.c.offense(ssxFS(src, n, F_OPERATOR), ssxFE(src, n, F_OPERATOR));
        continue;
      }
      if (!ssxIsCall(src, n) || !sbhAssignmentMethod(ssxMeth(src, n))) {
        continue;
      }
      // (call %1 _ (call (call %1 %2) #method_returning_self? ...))
      const recv = a.kid(n, 0);
      const mn = ssxMeth(src, n);
      const name = mn.substring(0, toI32(mn.length) - 1);
      if (a.nKid(n) !== 3) {
        continue;
      }
      const arg = a.kid(n, 2);
      if (!ssxIsCall(src, arg) || !ssxInList(RB_RSA_METHODS, ssxMeth(src, arg))) {
        continue;
      }
      const inner = a.kid(arg, 0);
      if (
        !ssxIsCall(src, inner) ||
        a.nKid(inner) !== 2 ||
        ssxMeth(src, inner) !== name ||
        !vfSameNode(src, a.kid(inner, 0), recv)
      ) {
        continue;
      }
      this.c.offense(ssxFS(src, n, F_OPERATOR), ssxFE(src, n, F_OPERATOR));
    }
  }
}
