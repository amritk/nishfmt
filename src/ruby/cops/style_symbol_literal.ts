// Style/SymbolLiteral.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { rbByteAt } from "../util";
import { NT_SYM } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { rbLitWordC } from "./lit_help";

/** /\A:["'][A-Za-z_]\w*["']\z/ */
const rbSlWordLike = (s: string): boolean => {
  const n = toI32(s.length);
  if (n < 4 || rbByteAt(s, 0) !== 58) {
    return false;
  }
  const q0 = rbByteAt(s, 1);
  const q1 = s.charCodeAt(n - 1);
  if ((q0 !== 34 && q0 !== 39) || (q1 !== 34 && q1 !== 39)) {
    return false;
  }
  const c = rbByteAt(s, 2);
  if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95)) {
    return false;
  }
  for (let i = 3; i < n - 1; i++) {
    if (!rbLitWordC(s.charCodeAt(i))) {
      return false;
    }
  }
  return true;
};

export class CopStyleSymbolLiteral {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/SymbolLiteral");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SYM) {
        continue;
      }
      const source = src.nodeSrc(n);
      if (!rbSlWordLike(source)) {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k !== null) {
        // source.delete(%q('")): the source is ASCII here.
        const parts: string[] = [];
        for (let i = 0; i < toI32(source.length); i++) {
          const ch = source.charCodeAt(i);
          if (ch !== 34 && ch !== 39) {
            parts.push(String.fromCharCode(ch));
          }
        }
        k.replace(a.exS(n), a.exE(n), parts.join(""));
        this.c.commit(k);
      }
    }
  }
}
