// Style/EmptyMethod (EnforcedStyle: compact; Layout/LineLength Max: 120).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_END, NT_DEF, NT_DEFS } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxCharLen, ssxCommentsInLines, ssxDefArgs, ssxDefBody, ssxDefName, ssxLocIs, ssxMultiline, ssxSingleLine } from "./style_syntax_help";

export class CopStyleEmptyMethod {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/EmptyMethod");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_DEF && t !== NT_DEFS) {
        continue;
      }
      if (ssxDefBody(src, n) !== 0 || ssxCommentsInLines(src, src.line(a.exS(n)), src.line(a.exE(n)))) {
        continue;
      }
      const args = ssxDefArgs(src, n);
      // compact?
      if (ssxSingleLine(src, n)) {
        continue;
      }
      let anyMulti = false;
      for (let i = 0; i < a.nKid(args); i++) {
        if (ssxMultiline(src, a.kid(args, i))) {
          anyMulti = true;
        }
      }
      if (anyMulti) {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k === null) {
        continue;
      }
      const scope = t === NT_DEFS ? `${src.nodeSrc(a.kid(n, 0))}.` : "";
      let argStr = "";
      if (a.nKid(args) > 0) {
        const parts: string[] = [];
        for (let i = 0; i < a.nKid(args); i++) {
          parts.push(src.nodeSrc(a.kid(args, i)));
        }
        const joined = parts.join(", ");
        argStr = ssxLocIs(src, args, F_END, ")") ? `(${joined})` : ` ${joined}`;
      }
      const correction = `def ${scope}${ssxDefName(src, n)}${argStr}; end`;
      if (ssxCharLen(correction) > 120) {
        continue;
      }
      k.replace(a.exS(n), a.exE(n), correction);
      this.c.commit(k);
    }
  }
}
