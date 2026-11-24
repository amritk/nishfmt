// Lint/UnusedMethodArgument (AllowUnusedKeywordArguments: false,
// IgnoreEmptyMethods: true, IgnoreNotImplementedMethods: true,
// NotImplementedExceptions: [NotImplementedError]), on the VariableForce.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { fault } from "../../core/fault";
import { F_NAME, NT_BLOCKARG, NT_CBASE, NT_CONST, NT_SEND, NT_YIELD, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { VfForce, vfUnusedArgCorrect } from "./lint_variable_force";
import { ssxDefBody, ssxFE, ssxFS, ssxIs, ssxMeth } from "./style_syntax_help";

/** not_implemented?: `raise NotImplementedError ...` or `fail ...`. */
const lumaNotImplemented = (src: RbSource, body: i32): boolean => {
  const a = src.a;
  if (!ssxIs(src, body, NT_SEND) || a.kid(body, 0) !== V_NIL) {
    return false;
  }
  const m = ssxMeth(src, body);
  if (m === "fail") {
    return true;
  }
  if (m !== "raise") {
    return false;
  }
  const c = a.kid(body, 2);
  if (!ssxIs(src, c, NT_CONST)) {
    return false;
  }
  // const_name === "NotImplementedError": no namespace, or a cbase.
  const ns = a.kid(c, 0);
  return (ns === V_NIL || ssxIs(src, ns, NT_CBASE)) && a.text(a.kid(c, 1)) === "NotImplementedError";
};

export class CopLintUnusedMethodArgument {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/UnusedMethodArgument");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const f = new VfForce(src);
    f.run();
    const a = src.a;
    for (const si of f.popped) {
      if (si < 0 || si >= f.scopes.length) {
        fault();
        return;
      }
      for (const vi of f.scopes[si].vars) {
        if (vi < 0 || vi >= f.vars.length) {
          fault();
          return;
        }
        const v = f.vars[vi];
        if (!f.isMethodArgument(vi)) {
          continue;
        }
        const vs = v.scope;
        if (vs < 0 || vs >= f.scopes.length) {
          fault();
          return;
        }
        const body = ssxDefBody(src, f.scopes[vs].node);
        if (body === V_NIL || lumaNotImplemented(src, body)) {
          continue;
        }
        // block_argument_with_yield?
        if (a.type(v.decl) === NT_BLOCKARG) {
          let y = ssxIs(src, body, NT_YIELD);
          if (!y) {
            for (const d of f.descendants(body)) {
              if (a.type(d) === NT_YIELD) {
                y = true;
                break;
              }
            }
          }
          if (y) {
            continue;
          }
        }
        if (v.name.startsWith("_") || v.nref > 0) {
          continue;
        }
        const k = this.c.offense(ssxFS(src, v.decl, F_NAME), ssxFE(src, v.decl, F_NAME));
        if (k !== null) {
          vfUnusedArgCorrect(src, k, v.decl);
          this.c.commit(k);
        }
      }
    }
  }
}
