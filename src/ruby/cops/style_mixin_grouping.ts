// Style/MixinGrouping (EnforcedStyle: separated).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_BEGIN, NT_CLASS, NT_MODULE, NT_SEND } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { rmlSpaces } from "./layout_multiline_help";
import { sbhMethodName } from "./style_body_help";
import { ssxMacro, ssxParenthesized } from "./style_syntax_help";

/** Style/MixinGrouping. */
export class CopStyleMixinGrouping {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/MixinGrouping");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_CLASS && t !== NT_MODULE) {
        continue;
      }
      // node.child_nodes.find(&:begin_type?) || node
      let holder = n;
      for (let i = 0; i < a.nKid(n); i++) {
        const c = a.kid(n, i);
        if (a.isNode(c) && a.type(c) === NT_BEGIN) {
          holder = c;
          break;
        }
      }
      for (let i = 0; i < a.nKid(holder); i++) {
        const m = a.kid(holder, i);
        if (!a.isNode(m) || a.type(m) !== NT_SEND || !ssxMacro(src, m)) {
          continue;
        }
        const name = sbhMethodName(src, m);
        if ((name !== "extend" && name !== "include" && name !== "prepend") || a.nKid(m) <= 2) {
          continue;
        }
        // check_separated_style
        if (a.nKid(m) === 3) {
          continue;
        }
        const k = this.c.offense(a.exS(m), a.exE(m));
        if (k === null) {
          continue;
        }
        const paren = ssxParenthesized(src, m);
        const parts: string[] = [];
        const ind = rmlSpaces(src.column(a.exS(m)));
        for (let j = a.nKid(m) - 1; j >= 2; j--) {
          const as = src.nodeSrc(a.kid(m, j));
          const call = paren ? `${name}(${as})` : `${name} ${as}`;
          parts.push(j === a.nKid(m) - 1 ? call : `${ind}${call}`);
        }
        k.replace(a.exS(m), a.exE(m), parts.join("\n"));
        this.c.commit(k);
      }
    }
  }
}
