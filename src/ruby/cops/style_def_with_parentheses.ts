// Style/DefWithParentheses.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_ASSIGNMENT, NT_DEF, NT_DEFS } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxDefArgs, ssxEndless, ssxFS, ssxSingleLine } from "./style_syntax_help";

/** spaces_before_assignment?: /\A(?:[ \t]|\\\n)+\z/ matches the source from s to e. */
const sdpSpacesBeforeAssignment = (src: RbSource, s: i32, e: i32): boolean => {
  if (e <= s) {
    return false;
  }
  let p = s;
  while (p < e) {
    const c = src.at(p);
    if (c === 32 || c === 9) {
      p++;
    } else if (c === 92 && p + 1 < e && src.at(p + 1) === 10) {
      p += 2;
    } else {
      return false;
    }
  }
  return true;
};

export class CopStyleDefWithParentheses {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/DefWithParentheses");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_DEF && t !== NT_DEFS) {
        continue;
      }
      const args = ssxDefArgs(src, n);
      if (a.nKid(args) !== 0 || a.exS(args) < 0) {
        continue;
      }
      const s = a.exS(args);
      const e = a.exE(args);
      // parentheses_required?
      const after = src.at(e);
      if (after !== 59) {
        if (!ssxEndless(src, n)) {
          if (ssxSingleLine(src, n)) {
            continue;
          }
        } else if (!sdpSpacesBeforeAssignment(src, e, ssxFS(src, n, F_ASSIGNMENT))) {
          continue;
        }
      }
      const k = this.c.offense(s, e);
      if (k !== null) {
        k.remove(s, e);
        this.c.commit(k);
      }
    }
  }
}
