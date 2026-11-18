// Style/FormatString (EnforcedStyle: format).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_SELECTOR,
  NT_ARRAY,
  NT_COMPLEX,
  NT_DSTR,
  NT_DSYM,
  NT_ERANGE,
  NT_FALSE,
  NT_FLOAT,
  NT_HASH,
  NT_INT,
  NT_IRANGE,
  NT_NIL,
  NT_RATIONAL,
  NT_REGEXP,
  NT_REGOPT,
  NT_SEND,
  NT_STR,
  NT_SYM,
  NT_TRUE,
  NT_XSTR,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { sbhMethodName } from "./style_body_help";
import { ssxFE, ssxFS, ssxIsCall } from "./style_syntax_help";

/** Node#literal? */
const sbhFsLiteral = (t: i32): boolean =>
  t === NT_STR ||
  t === NT_DSTR ||
  t === NT_XSTR ||
  t === NT_INT ||
  t === NT_FLOAT ||
  t === NT_SYM ||
  t === NT_DSYM ||
  t === NT_ARRAY ||
  t === NT_HASH ||
  t === NT_REGEXP ||
  t === NT_TRUE ||
  t === NT_IRANGE ||
  t === NT_ERANGE ||
  t === NT_COMPLEX ||
  t === NT_RATIONAL ||
  t === NT_REGOPT ||
  t === NT_FALSE ||
  t === NT_NIL;

/** autocorrectable?: a literal, or a call to a conversion method that returns no array. */
const sbhFsAutocorrectable = (src: RbSource, n: i32): boolean => {
  if (!src.a.isNode(n)) {
    return false;
  }
  if (sbhFsLiteral(src.a.type(n))) {
    return true;
  }
  if (!ssxIsCall(src, n)) {
    return false;
  }
  const m = sbhMethodName(src, n);
  return m === "to_d" || m === "to_f" || m === "to_h" || m === "to_i" || m === "to_r" || m === "to_s" || m === "to_sym";
};

/** Style/FormatString. */
export class CopStyleFormatString {
  c: RbCop;
  // @corrected_ranges
  corrS: i32[];
  corrE: i32[];

  constructor() {
    this.c = new RbCop("Style/FormatString");
    this.corrS = [];
    this.corrE = [];
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const none1: i32[] = [];
    const none2: i32[] = [];
    this.corrS = none1;
    this.corrE = none2;
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND) {
        continue;
      }
      const m = sbhMethodName(src, n);
      const recv = a.kid(n, 0);
      const k0 = a.nKid(n);
      let selector = "";
      if ((m === "sprintf" || m === "format") && recv === V_NIL && k0 >= 4) {
        selector = m;
      } else if (m === "%" && a.isNode(recv) && (a.type(recv) === NT_STR || a.type(recv) === NT_DSTR)) {
        selector = "%";
      } else if (
        m === "%" &&
        recv !== V_NIL &&
        k0 === 3 &&
        a.isNode(a.kid(n, 2)) &&
        (a.type(a.kid(n, 2)) === NT_ARRAY || a.type(a.kid(n, 2)) === NT_HASH)
      ) {
        selector = "%";
      }
      if (selector.length === 0 || selector === "format") {
        continue;
      }
      const ss = ssxFS(src, n, F_SELECTOR);
      const se = ssxFE(src, n, F_SELECTOR);
      const k = this.c.offense(ss, se);
      if (k === null) {
        continue;
      }
      // variable_argument?: (send {str dstr} :% !#autocorrectable?)
      const variable =
        m === "%" &&
        a.isNode(recv) &&
        (a.type(recv) === NT_STR || a.type(recv) === NT_DSTR) &&
        k0 === 3 &&
        !sbhFsAutocorrectable(src, a.kid(n, 2));
      let within = false;
      for (let i = 0; i < toI32(this.corrS.length); i++) {
        if (this.corrS[i] <= a.exS(n) && a.exE(n) <= this.corrE[i]) {
          within = true;
        }
      }
      if (variable || within) {
        this.c.commit(k);
        continue;
      }
      this.corrS.push(a.exS(n));
      this.corrE.push(a.exE(n));
      if (m === "%" && k0 === 2) {
        // `"..".%` without an argument: autocorrect_from_percent raises, and the offense is lost.
        continue;
      }
      if (m === "%") {
        // autocorrect_from_percent
        const rhs = a.kid(n, 2);
        let args = "";
        if (rhs !== V_NIL && a.isNode(rhs) && (a.type(rhs) === NT_ARRAY || a.type(rhs) === NT_HASH)) {
          const parts: string[] = [];
          for (let i = 0; i < a.nKid(rhs); i++) {
            parts.push(src.nodeSrc(a.kid(rhs, i)));
          }
          args = parts.join(", ");
        } else if (rhs !== V_NIL) {
          args = src.nodeSrc(rhs);
        }
        k.replace(a.exS(n), a.exE(n), `format(${src.nodeSrc(recv)}, ${args})`);
      } else {
        k.replace(ss, se, "format");
      }
      this.c.commit(k);
    }
  }
}
