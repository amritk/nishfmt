// Style/HashAsLastArrayItem (EnforcedStyle: braces).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, NT_ARRAY, NT_HASH, NT_KWSPLAT, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxBeginIs, ssxHas, ssxIs, ssxSingleLine } from "./style_syntax_help";

export class CopStyleHashAsLastArrayItem {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/HashAsLastArrayItem");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_HASH || ssxIs(src, a.kid(n, 0), NT_KWSPLAT)) {
        continue;
      }
      const arr = src.parent(n);
      if (arr === V_NIL || a.type(arr) !== NT_ARRAY) {
        continue;
      }
      // expected_braced_last_array_item?
      let allBraced = true;
      for (let i = 0; i < a.nKid(arr); i++) {
        const v = a.kid(arr, i);
        if (!ssxIs(src, v, NT_HASH) || !ssxHas(src, v, F_BEGIN)) {
          allBraced = false;
          break;
        }
      }
      if (allBraced) {
        continue;
      }
      const k0 = a.nKid(arr);
      if ((k0 >= 2 && ssxIs(src, a.kid(arr, k0 - 2), NT_HASH)) || a.kid(arr, -1) !== n) {
        continue;
      }
      if (!ssxBeginIs(src, arr, "[")) {
        continue;
      }
      // check_braces
      if (ssxHas(src, n, F_BEGIN)) {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k === null) {
        continue;
      }
      if (ssxSingleLine(src, n) || src.line(a.exS(n)) === src.line(a.exS(arr))) {
        k.wrap(a.exS(n), a.exE(n), "{", "}");
      } else {
        const ind: string[] = [];
        for (let i = 0; i < src.column(a.exS(n)); i++) {
          ind.push(" ");
        }
        const indent = ind.join("");
        k.wrap(a.exS(n), a.exE(n), `{\n${indent}`, `\n${indent}}`);
      }
      this.c.commit(k);
    }
  }
}
