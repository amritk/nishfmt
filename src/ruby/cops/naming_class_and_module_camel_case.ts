// Naming/ClassAndModuleCamelCase (detection only; AllowedNames:
// [module_parent]).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { faulted } from "../../core/fault";
import { add32 } from "../../core/arr";
import { F_NAME, NT_CLASS, NT_MODULE } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS } from "./style_syntax_help";

/** `name.gsub(/module_parent/, '')`. */
const nccRemoveAllowed = (s: string): string => {
  const out: string[] = [];
  let i = 0;
  const n = toI32(s.length);
  while (i < n) {
    const j = s.indexOf("module_parent", i);
    if (j < 0) {
      out.push(s.substring(i, n));
      break;
    }
    out.push(s.substring(i, j));
    i = add32(j, 13);
    if (faulted()) {
      return "";
    }
  }
  return out.join("");
};

export class CopNamingClassAndModuleCamelCase {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Naming/ClassAndModuleCamelCase");
  }
  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    for (const n of src.pre) {
      const t = src.a.type(n);
      if (t !== NT_CLASS && t !== NT_MODULE) {
        continue;
      }
      const s = ssxFS(src, n, F_NAME);
      const e = ssxFE(src, n, F_NAME);
      const name = src.src(s, e);
      if (name.indexOf("_") < 0 || nccRemoveAllowed(name).indexOf("_") < 0) {
        continue;
      }
      this.c.offense(s, e);
    }
  }
}
