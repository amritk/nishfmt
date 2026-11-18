// Style/HashEachMethods (AllowedReceivers: Thread.current; unsafe: detection
// only).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_SELECTOR,
  NT_ARGS,
  NT_ARRAY,
  NT_BLOCK,
  NT_BLOCK_PASS,
  NT_COMPLEX,
  NT_CONST,
  NT_DSTR,
  NT_DSYM,
  NT_ERANGE,
  NT_FALSE,
  NT_FLOAT,
  NT_HASH,
  NT_INT,
  NT_IRANGE,
  NT_LVAR,
  NT_MLHS,
  NT_NIL,
  NT_NUMBLOCK,
  NT_RATIONAL,
  NT_REGEXP,
  NT_REGOPT,
  NT_RESTARG,
  NT_ARG,
  NT_SEND,
  NT_STR,
  NT_SYM,
  NT_TRUE,
  NT_XSTR,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { vfSameNode } from "./lint_variable_force";
import { rbNodeReceiver } from "./style_float_division";
import { ssxDescendants, ssxFE, ssxFS, ssxIs, ssxIsAnyBlock, ssxIsCall, ssxMeth } from "./style_syntax_help";

/** Node#literal?. */
export const rbNodeLiteral = (src: RbSource, n: i32): boolean => {
  if (!src.a.isNode(n)) {
    return false;
  }
  const t = src.a.type(n);
  return (
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
    t === NT_NIL
  );
};

/** The method name of a call or of a block's call. */
const rbHemMethodName = (src: RbSource, n: i32): string => {
  if (ssxIsCall(src, n)) {
    return ssxMeth(src, n);
  }
  if (ssxIsAnyBlock(src, n) && ssxIsCall(src, src.a.kid(n, 0))) {
    return ssxMeth(src, src.a.kid(n, 0));
  }
  return "";
};

/** AllowedReceivers#receiver_name. */
export const rbReceiverName = (src: RbSource, n: i32): string => {
  const a = src.a;
  const r = rbNodeReceiver(src, n);
  if (r !== V_NIL && !ssxIs(src, r, NT_CONST)) {
    return rbReceiverName(src, r);
  }
  if (ssxIs(src, n, NT_SEND)) {
    if (r !== V_NIL) {
      return `${rbReceiverName(src, r)}.${ssxMeth(src, n)}`;
    }
    return ssxMeth(src, n);
  }
  return src.src(a.exS(n), a.exE(n));
};

/** (call (call _ {:keys :values}) :each), no arguments: the keys/values call, or V_NIL. */
const rbHemKvEach = (src: RbSource, s: i32, args: i32): i32 => {
  const a = src.a;
  if (!ssxIsCall(src, s) || ssxMeth(src, s) !== "each" || a.nKid(s) !== 2 + args) {
    return V_NIL;
  }
  const kv = a.kid(s, 0);
  if (!ssxIsCall(src, kv) || a.nKid(kv) !== 2) {
    return V_NIL;
  }
  const m = ssxMeth(src, kv);
  return m === "keys" || m === "values" ? kv : V_NIL;
};

export class CopStyleHashEachMethods {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/HashEachMethods");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (ssxIs(src, n, NT_BLOCK) || ssxIs(src, n, NT_NUMBLOCK)) {
        this.onBlock(src, n);
      } else if (ssxIs(src, n, NT_BLOCK_PASS)) {
        const p = src.parent(n);
        if (rbHemKvEach(src, p, 1) === V_NIL || a.kid(p, 2) !== n || !ssxIs(src, a.kid(n, 0), NT_SYM)) {
          continue;
        }
        const kv = a.kid(p, 0);
        const pr = a.kid(kv, 0);
        if (pr === V_NIL || rbReceiverName(src, pr) === "Thread.current") {
          continue;
        }
        this.c.note(ssxFS(src, kv, F_SELECTOR), ssxFE(src, p, F_SELECTOR));
      }
    }
  }

  private onBlock(src: RbSource, n: i32): void {
    const a = src.a;
    const send = a.kid(n, 0);
    // handleable?
    const pre = a.kid(send, 0);
    if (pre !== V_NIL && (ssxIsCall(src, pre) || ssxIsAnyBlock(src, pre))) {
      const m = rbHemMethodName(src, pre);
      if (
        m === "assoc" ||
        m === "chunk" ||
        m === "flatten" ||
        m === "rassoc" ||
        m === "sort" ||
        m === "sort_by" ||
        m === "to_a"
      ) {
        return;
      }
    }
    let root = rbNodeReceiver(src, n);
    if (root === V_NIL) {
      return;
    }
    while (rbNodeReceiver(src, root) !== V_NIL) {
      root = rbNodeReceiver(src, root);
    }
    const all: i32[] = [n];
    for (const d of ssxDescendants(src, n)) {
      all.push(d);
    }
    for (const d of all) {
      if (ssxIs(src, d, NT_SEND) && ssxMeth(src, d) === "[]=" && vfSameNode(src, a.kid(d, 0), root)) {
        return;
      }
    }
    if (rbNodeLiteral(src, root) && !ssxIs(src, root, NT_HASH)) {
      return;
    }
    const kv = rbHemKvEach(src, send, 0);
    if (kv !== V_NIL) {
      const pr = a.kid(kv, 0);
      if (pr !== V_NIL && rbReceiverName(src, pr) !== "Thread.current") {
        if (this.c.note(ssxFS(src, kv, F_SELECTOR), ssxFE(src, send, F_SELECTOR))) {
          return;
        }
      }
    }
    // each_arguments: (block (call _ :each) (args $_key $_value) ...)
    if (!ssxIs(src, n, NT_BLOCK) || !ssxIsCall(src, send) || ssxMeth(src, send) !== "each" || a.nKid(send) !== 2) {
      return;
    }
    const args = a.kid(n, 1);
    if (!ssxIs(src, args, NT_ARGS) || a.nKid(args) !== 2) {
      return;
    }
    const body = a.kid(n, 2);
    if (body === V_NIL) {
      return;
    }
    const lvars: string[] = [];
    for (const d of ssxDescendants(src, body)) {
      if (a.type(d) === NT_LVAR) {
        lvars.push(src.nodeSrc(d));
      }
    }
    const valueUnused = this.unused(src, a.kid(args, 1), lvars);
    const keyUnused = this.unused(src, a.kid(args, 0), lvars);
    if ((valueUnused && keyUnused) || (!valueUnused && !keyUnused)) {
      return;
    }
    this.c.note(a.exS(n), a.exE(n));
  }

  /** unused_block_arg_exist?. */
  private unused(src: RbSource, arg: i32, lvars: string[]): boolean {
    const a = src.a;
    const names: string[] = [];
    if (ssxIs(src, arg, NT_MLHS)) {
      for (const d of ssxDescendants(src, arg)) {
        if (a.type(d) === NT_ARG || a.type(d) === NT_RESTARG) {
          names.push(src.nodeSrc(d));
        }
      }
    } else {
      names.push(src.nodeSrc(arg));
    }
    for (const nm0 of names) {
      const nm = nm0.startsWith("*") ? nm0.substring(1, toI32(nm0.length)) : nm0;
      for (const l of lvars) {
        if (l === nm) {
          return false;
        }
      }
    }
    return true;
  }
}
