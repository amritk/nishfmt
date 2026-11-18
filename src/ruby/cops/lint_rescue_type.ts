// Lint/RescueType.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_KEYWORD,
  NT_ARRAY,
  NT_COMPLEX,
  NT_DSTR,
  NT_FALSE,
  NT_FLOAT,
  NT_HASH,
  NT_INT,
  NT_NIL,
  NT_RATIONAL,
  NT_RESBODY,
  NT_STR,
  NT_SYM,
  NT_TRUE,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS } from "./style_syntax_help";

/** INVALID_TYPES. */
const lrtInvalid = (src: RbSource, n: i32): boolean => {
  if (!src.a.isNode(n)) {
    return false;
  }
  const t = src.a.type(n);
  return (
    t === NT_ARRAY ||
    t === NT_COMPLEX ||
    t === NT_DSTR ||
    t === NT_FALSE ||
    t === NT_FLOAT ||
    t === NT_HASH ||
    t === NT_NIL ||
    t === NT_INT ||
    t === NT_RATIONAL ||
    t === NT_STR ||
    t === NT_SYM ||
    t === NT_TRUE
  );
};

export class CopLintRescueType {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/RescueType");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_RESBODY) {
        continue;
      }
      const ex = a.kid(n, 0);
      if (ex === V_NIL) {
        continue;
      }
      // ResbodyNode#exceptions: the array's values, or the one node.
      const list: i32[] = [];
      if (a.type(ex) === NT_ARRAY) {
        for (let i = 0; i < a.nKid(ex); i++) {
          list.push(a.kid(ex, i));
        }
      } else {
        list.push(ex);
      }
      let bad = false;
      for (const x of list) {
        if (lrtInvalid(src, x)) {
          bad = true;
        }
      }
      if (!bad) {
        continue;
      }
      const k = this.c.offense(ssxFS(src, n, F_KEYWORD), a.exE(ex));
      if (k === null) {
        continue;
      }
      // correction(*rescued): the children of the exceptions node.
      const good: string[] = [];
      for (let i = 0; i < a.nKid(ex); i++) {
        const x = a.kid(ex, i);
        if (a.isNode(x) && !lrtInvalid(src, x)) {
          good.push(src.nodeSrc(x));
        }
      }
      const corr = good.length > 0 ? ` ${good.join(", ")}` : "";
      k.replace(ssxFE(src, n, F_KEYWORD), a.exE(ex), corr);
      this.c.commit(k);
    }
  }
}
