// Naming/BinaryOperatorParameterName.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_NAME, NT_ARG, NT_BLOCK, NT_DEF, NT_LVAR, NT_LVASGN, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { vfArgType } from "./lint_variable_force";
import { ssxDescendants, ssxFE, ssxFS, ssxInList, ssxIsWord } from "./style_syntax_help";

/** An ArgNode (arg, optarg, restarg, kwarg, ...) with a name. */
const nbopNamedArg = (src: RbSource, x: i32): boolean => vfArgType(src.a.type(x)) && src.a.kid(x, 0) !== V_NIL;

/** op_method?: an operator name (not starting with a word character) or eql?/equal?, not excluded. */
const nbopOpMethod = (name: string): boolean => {
  if (ssxInList(" +@ -@ [] []= << === ` =~ ", name)) {
    return false;
  }
  if (name === "eql?" || name === "equal?") {
    return true;
  }
  if (name.length === 0) {
    return false;
  }
  const c = name.charCodeAt(0);
  // [[:word:]]: also every non-ASCII letter.
  return !(ssxIsWord(c) || c >= 128);
};

export class CopNamingBinaryOperatorParameterName {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Naming/BinaryOperatorParameterName");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_DEF) {
        continue;
      }
      const name = a.text(a.kid(n, 0));
      const args = a.kid(n, 1);
      if (!nbopOpMethod(name) || a.nKid(args) !== 1) {
        continue;
      }
      const arg = a.kid(args, 0);
      if (a.type(arg) !== NT_ARG) {
        continue;
      }
      const an = a.text(a.kid(arg, 0));
      if (an === "other" || an === "_other") {
        continue;
      }
      const k = this.c.offense(a.exS(arg), a.exE(arg));
      if (k === null) {
        continue;
      }
      k.replace(a.exS(arg), a.exE(arg), "other");
      const asrc = src.nodeSrc(arg);
      for (const d of ssxDescendants(src, n)) {
        const t = a.type(d);
        if (t !== NT_LVAR && t !== NT_LVASGN) {
          continue;
        }
        const ns = ssxFS(src, d, F_NAME);
        const ne = ssxFE(src, d, F_NAME);
        if (src.src(ns, ne) !== asrc || this.shadowed(src, d, asrc, n)) {
          continue;
        }
        k.replace(ns, ne, "other");
      }
      this.c.commit(k);
    }
  }

  /** shadowed?: a block within the def redeclares the name. */
  private shadowed(src: RbSource, node: i32, name: string, def: i32): boolean {
    const a = src.a;
    let p = src.parent(node);
    while (p !== V_NIL) {
      if (a.type(p) === NT_BLOCK && a.exS(def) <= a.exS(p) && a.exE(p) <= a.exE(def)) {
        const args = a.kid(p, 1);
        for (let i = 0; i < a.nKid(args); i++) {
          const x = a.kid(args, i);
          // respond_to?(:name): the argument nodes (not mlhs)
          if (a.isNode(x) && nbopNamedArg(src, x) && a.text(a.kid(x, 0)) === name) {
            return true;
          }
        }
      }
      p = src.parent(p);
    }
    return false;
  }
}
