// Style/TrivialAccessors (ExactNameMatch, AllowPredicates, AllowDSLWriters:
// true; IgnoreClassMethods: false; AllowedMethods: the to_* conversions).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_KEYWORD, NT_ARG, NT_ARGS, NT_CLASS, NT_DEF, NT_DEFS, NT_IVAR, NT_IVASGN, NT_LVAR, NT_MODULE, NT_SCLASS, NT_SELF, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxDefArgs, ssxDefBody, ssxDefName, ssxFE, ssxFS, ssxInList, ssxIs, ssxIsAnyBlock, ssxMeth, ssxSymText } from "./style_syntax_help";

const SSX_TA_ALLOWED: string = " to_ary to_a to_c to_enum to_h to_hash to_i to_int to_io to_open to_path to_proc to_r to_regexp to_str to_s to_sym initialize ";

/** MethodIdentifierPredicates#assignment_method? */
const ssxTaAssignmentMethod = (m: string): boolean => !ssxInList(" == === != <= >= > < ", m) && m.endsWith("=");

/** names_match?: the name without a final `=` or `?` is the ivar's name without `@`. */
const ssxTaNamesMatch = (src: RbSource, n: i32): boolean => {
  const body = ssxDefBody(src, n);
  const iv = ssxSymText(src, src.a.kid(body, 0));
  let m = ssxDefName(src, n);
  if (m.endsWith("=") || m.endsWith("?")) {
    m = m.substring(0, toI32(m.length) - 1);
  }
  return iv.length > 0 && m === iv.substring(1, toI32(iv.length));
};

const ssxTaAllowedName = (src: RbSource, n: i32): boolean => ssxInList(SSX_TA_ALLOWED, ssxDefName(src, n)) || !ssxTaNamesMatch(src, n);

const ssxTaReader = (src: RbSource, n: i32): boolean => {
  const args = ssxDefArgs(src, n);
  const body = ssxDefBody(src, n);
  return src.a.nKid(args) === 0 && ssxIs(src, body, NT_IVAR) && !ssxTaAllowedName(src, n) && !ssxDefName(src, n).endsWith("?");
};

const ssxTaWriter = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  const args = ssxDefArgs(src, n);
  const body = ssxDefBody(src, n);
  if (!ssxIs(src, args, NT_ARGS) || a.nKid(args) !== 1 || !ssxIs(src, a.kid(args, 0), NT_ARG)) {
    return false;
  }
  if (!ssxIs(src, body, NT_IVASGN) || !ssxIs(src, a.kid(body, 1), NT_LVAR)) {
    return false;
  }
  return !ssxTaAllowedName(src, n) && ssxTaAssignmentMethod(ssxDefName(src, n));
};

export class CopStyleTrivialAccessors {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/TrivialAccessors");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_DEF && t !== NT_DEFS) {
        continue;
      }
      const par = src.parent(n);
      if (par === V_NIL) {
        continue;
      }
      // in_module_or_instance_eval?
      let skip = false;
      let p = par;
      while (p !== V_NIL) {
        const pt = a.type(p);
        if (pt === NT_CLASS || pt === NT_SCLASS) {
          break;
        }
        if (pt === NT_MODULE) {
          skip = true;
          break;
        }
        if (ssxIsAnyBlock(src, p) && ssxMeth(src, a.kid(p, 0)) === "instance_eval") {
          skip = true;
          break;
        }
        p = src.parent(p);
      }
      if (skip) {
        continue;
      }
      const reader = ssxTaReader(src, n);
      const writer = !reader && ssxTaWriter(src, n);
      if (!reader && !writer) {
        continue;
      }
      const k = this.c.offense(ssxFS(src, n, F_KEYWORD), ssxFE(src, n, F_KEYWORD));
      if (k === null) {
        continue;
      }
      if (a.type(par) === NT_SEND) {
        continue;
      }
      if (t === NT_DEFS && !ssxIs(src, a.kid(n, 0), NT_SELF)) {
        continue;
      }
      // trivial_accessor_kind (a trivial writer is never a DSL writer here)
      const kind = writer ? "writer" : "reader";
      const name = ssxDefName(src, n);
      if (!ssxTaNamesMatch(src, n) || name.endsWith("?")) {
        continue;
      }
      const acc = `attr_${kind} :${name.endsWith("=") ? name.substring(0, toI32(name.length) - 1) : name}`;
      if (t === NT_DEF) {
        k.replace(a.exS(n), a.exE(n), acc);
      } else {
        const ind: string[] = [];
        for (let i = 0; i < src.column(a.exS(n)); i++) {
          ind.push(" ");
        }
        const indent = ind.join("");
        k.replace(a.exS(n), a.exE(n), `class << self\n${indent}  ${acc}\n${indent}end`);
      }
      this.c.commit(k);
    }
  }
}
