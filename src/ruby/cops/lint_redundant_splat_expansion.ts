// Lint/RedundantSplatExpansion (AllowPercentLiteralArrayArgument: true).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_BEGIN,
  F_END,
  F_OPERATOR,
  NT_ARRAY,
  NT_BLOCK,
  NT_CASGN,
  NT_CVASGN,
  NT_DSTR,
  NT_FLOAT,
  NT_GVASGN,
  NT_INT,
  NT_IVASGN,
  NT_LVASGN,
  NT_RESBODY,
  NT_SEND,
  NT_SPLAT,
  NT_STR,
  NT_WHEN,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS, ssxGlobalConst, ssxHas, ssxIs, ssxIsCall, ssxMeth } from "./style_syntax_help";

/** (send (const {nil? cbase} :Array) :new ...). */
const lrseArrayNewSend = (src: RbSource, n: i32): boolean => ssxIs(src, n, NT_SEND) && ssxMeth(src, n) === "new" && ssxGlobalConst(src, src.a.kid(n, 0), "Array");

/** array_new?: the send, or a block on it. */
const lrseArrayNew = (src: RbSource, n: i32): boolean => lrseArrayNewSend(src, n) || (ssxIs(src, n, NT_BLOCK) && lrseArrayNewSend(src, src.a.kid(n, 0)));

/** The array literal's opening (loc.begin source), or "". */
const lrseBegin = (src: RbSource, n: i32): string => (ssxHas(src, n, F_BEGIN) ? src.src(ssxFS(src, n, F_BEGIN), ssxFE(src, n, F_BEGIN)) : "");

export class CopLintRedundantSplatExpansion {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/RedundantSplatExpansion");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SPLAT) {
        continue;
      }
      const v = a.kid(n, 0);
      if (!a.isNode(v)) {
        continue;
      }
      // literal_expansion
      const vt = a.type(v);
      let item = V_NIL;
      if (vt === NT_STR || vt === NT_DSTR || vt === NT_INT || vt === NT_FLOAT || vt === NT_ARRAY) {
        item = v;
      } else if (vt === NT_BLOCK && lrseArrayNewSend(src, a.kid(v, 0))) {
        item = a.kid(v, 0);
      } else if (lrseArrayNew(src, v)) {
        item = v;
      }
      if (item === V_NIL) {
        continue;
      }
      const p = src.parent(n);
      if (a.type(item) === NT_SEND) {
        // redundant_array_new_splat?
        if (!ssxIs(src, p, NT_ARRAY)) {
          continue;
        }
        const ig = src.parent(src.parent(item));
        if (ig !== V_NIL && a.type(ig) === NT_ARRAY && a.nKid(ig) > 1) {
          continue;
        }
        const gp = src.parent(p);
        if (gp !== V_NIL) {
          const gt = a.type(gp);
          if (!(gt === NT_LVASGN || gt === NT_IVASGN || gt === NT_CVASGN || gt === NT_GVASGN || gt === NT_CASGN)) {
            continue;
          }
        }
      } else if (a.type(item) === NT_ARRAY && a.nKid(item) === 0) {
        continue;
      }
      const methodArg = ssxIsCall(src, p);
      const partOfArray = ssxIs(src, p, NT_ARRAY) && ssxHas(src, p, F_BEGIN) && ssxHas(src, p, F_END);
      if (vt === NT_ARRAY && (methodArg || partOfArray)) {
        const b = lrseBegin(src, v);
        if (methodArg && (b.startsWith("%w") || b.startsWith("%W") || b.startsWith("%i") || b.startsWith("%I"))) {
          continue;
        }
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k === null) {
        continue;
      }
      // replacement_range_and_content
      if (lrseArrayNew(src, v)) {
        const r = ssxIs(src, p, NT_ARRAY) ? p : n;
        k.replace(a.exS(r), a.exE(r), src.nodeSrc(v));
      } else if (vt !== NT_ARRAY) {
        let repl = src.nodeSrc(v);
        if (ssxIs(src, p, NT_ARRAY) && !ssxHas(src, p, F_BEGIN)) {
          repl = `[${repl}]`;
        }
        k.replace(a.exS(n), a.exE(n), repl);
      } else if (ssxIs(src, p, NT_WHEN) || methodArg || partOfArray || ssxIs(src, src.parent(p), NT_RESBODY)) {
        k.replace(a.exS(n), a.exE(n), this.removeBrackets(src, v));
      } else {
        k.replace(ssxFS(src, n, F_OPERATOR), ssxFE(src, n, F_OPERATOR), "");
      }
      this.c.commit(k);
    }
  }

  /** remove_brackets. */
  private removeBrackets(src: RbSource, arr: i32): string {
    const a = src.a;
    const b = lrseBegin(src, arr);
    const els: string[] = [];
    for (let i = 0; i < a.nKid(arr); i++) {
      els.push(src.nodeSrc(a.kid(arr, i)));
    }
    if (b.startsWith("%w")) {
      return `'${els.join("', '")}'`;
    }
    if (b.startsWith("%W")) {
      return `"${els.join('", "')}"`;
    }
    if (b.startsWith("%i")) {
      return `:${els.join(", :")}`;
    }
    if (b.startsWith("%I")) {
      return `:"${els.join('", :"')}"`;
    }
    return els.join(", ");
  }
}
