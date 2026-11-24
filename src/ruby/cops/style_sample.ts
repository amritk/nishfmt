// Style/Sample.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { rbNKid } from "../node";
import { F_SELECTOR, NT_ERANGE, NT_INT, NT_IRANGE, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxAdd64, ssxFS, ssxIntValue, ssxIs, ssxIsCall, ssxMeth } from "./style_syntax_help";

/** sample_size as text: "" for nil, "?" for :unknown, else the size. */
const ssxSampleSize = (src: RbSource, n: i32): string => {
  const a = src.a;
  const k = rbNKid(src, n) - 2;
  if (k === 1) {
    const arg = a.kid(n, 2);
    if (ssxIs(src, arg, NT_IRANGE) || ssxIs(src, arg, NT_ERANGE)) {
      const low = a.kid(arg, 0);
      const high = a.kid(arg, 1);
      const lowOk = low === V_NIL || (ssxIs(src, low, NT_INT) && ssxIntValue(src, low) === 0);
      if (!lowOk || !ssxIs(src, high, NT_INT) || ssxIntValue(src, high) < 0) {
        return "?";
      }
      const hv = ssxIntValue(src, high);
      return a.type(arg) === NT_ERANGE ? `${hv}` : `${ssxAdd64(hv, toI64(1))}`;
    }
    if (ssxIs(src, arg, NT_INT)) {
      const v = ssxIntValue(src, arg);
      return v === 0 || v === -1 ? "" : "?";
    }
    return "?";
  }
  if (k === 2) {
    const f = a.kid(n, 2);
    const s = a.kid(n, 3);
    if (!ssxIs(src, f, NT_INT) || ssxIntValue(src, f) !== 0) {
      return "?";
    }
    return ssxIs(src, s, NT_INT) ? `${ssxIntValue(src, s)}` : "?";
  }
  return "";
};

export class CopStyleSample {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/Sample");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIsCall(src, n)) {
        continue;
      }
      const m = ssxMeth(src, n);
      if (m !== "first" && m !== "last" && m !== "[]" && m !== "at" && m !== "slice") {
        continue;
      }
      const sh = a.kid(n, 0);
      if (!ssxIsCall(src, sh) || ssxMeth(src, sh) !== "shuffle") {
        continue;
      }
      let sampleArg = "";
      if (m === "first" || m === "last") {
        if (a.nKid(n) > 2) {
          sampleArg = src.nodeSrc(a.kid(n, 2));
        }
      } else {
        const size = ssxSampleSize(src, n);
        if (size === "?") {
          continue;
        }
        if (m !== "at") {
          sampleArg = size;
        }
      }
      const s = ssxFS(src, sh, F_SELECTOR);
      const e = a.exE(n);
      const k = this.c.offense(s, e);
      if (k === null) {
        continue;
      }
      if (a.nKid(sh) > 2) {
        continue;
      }
      k.replace(s, e, sampleArg.length === 0 ? "sample" : `sample(${sampleArg})`);
      this.c.commit(k);
    }
  }
}
