// Style/RedundantException.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_HEREDOC_END,
  NT_ARRAY,
  NT_BEGIN,
  NT_CONST,
  NT_CVAR,
  NT_DSTR,
  NT_GVAR,
  NT_IVAR,
  NT_LVAR,
  NT_NIL,
  NT_SELF,
  NT_SEND,
  NT_STR,
  NT_XSTR,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { rnHeredoc } from "../node";
import { RbSource } from "../source";
import { sbhMethodName, sbhOperatorMethod } from "./style_body_help";
import { ssxBasicLiteral, ssxDescendants, ssxGlobalConst, ssxIsCall, ssxParenthesized } from "./style_syntax_help";

const sbhReIs = (src: RbSource, n: i32, t: i32): boolean => src.a.isNode(n) && src.a.type(n) === t;

/** message_source. */
const sbhReMessageSource = (src: RbSource, m: i32): string => {
  const a = src.a;
  const t = a.type(m);
  const s = src.nodeSrc(m);
  if (t === NT_STR || t === NT_DSTR || t === NT_XSTR) {
    return s;
  }
  // require_parentheses?
  let req = false;
  if (ssxIsCall(src, m)) {
    req = sbhMethodName(src, m) !== "[]" && (sbhOperatorMethod(src, m) || (a.nKid(m) > 2 && !ssxParenthesized(src, m)));
  } else {
    req = !(
      ssxBasicLiteral(src, m) ||
      sbhReVariable(t) ||
      t === NT_CONST ||
      t === NT_SELF ||
      t === NT_BEGIN ||
      t === NT_ARRAY
    );
  }
  return req ? `(${s}).to_s` : `${s}.to_s`;
};

/** Node#variable? */
const sbhReVariable = (t: i32): boolean => t === NT_LVAR || t === NT_IVAR || t === NT_CVAR || t === NT_GVAR;

/** Style/RedundantException. */
export class CopStyleRedundantException {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/RedundantException");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND || a.kid(n, 0) !== V_NIL) {
        continue;
      }
      const m = sbhMethodName(src, n);
      if (m !== "raise" && m !== "fail") {
        continue;
      }
      if (a.nKid(n) === 4 && ssxGlobalConst(src, a.kid(n, 2), "RuntimeError")) {
        // exploded?
        const exc = a.kid(n, 2);
        const msg = a.kid(n, 3);
        if (sbhReIs(src, msg, NT_NIL)) {
          continue;
        }
        const k = this.c.offense(a.exS(n), a.exE(n));
        if (k !== null) {
          k.remove(a.exS(exc), a.exS(msg));
          k.replace(a.exS(msg), a.exE(msg), sbhReMessageSource(src, msg));
          this.c.commit(k);
        }
        continue;
      }
      if (a.nKid(n) !== 3) {
        continue;
      }
      // compact?
      const nc = a.kid(n, 2);
      if (
        !sbhReIs(src, nc, NT_SEND) ||
        a.nKid(nc) !== 3 ||
        sbhMethodName(src, nc) !== "new" ||
        !ssxGlobalConst(src, a.kid(nc, 0), "RuntimeError")
      ) {
        continue;
      }
      const msg = a.kid(nc, 2);
      if (sbhReIs(src, msg, NT_NIL)) {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k === null) {
        continue;
      }
      // heredoc_body_inside?
      let inside = false;
      const all: i32[] = [msg];
      for (const d of ssxDescendants(src, msg)) {
        all.push(d);
      }
      for (const s of all) {
        const t = a.type(s);
        if (
          (t === NT_STR || t === NT_DSTR || t === NT_XSTR) &&
          rnHeredoc(src, s) &&
          a.fE(a.map(s), F_HEREDOC_END) < a.exE(nc)
        ) {
          inside = true;
        }
      }
      if (!inside) {
        k.replace(a.exS(nc), a.exE(nc), sbhReMessageSource(src, msg));
      }
      this.c.commit(k);
    }
  }
}
