// The Security cops (detection only): Eval, JSONLoad (SafeAutoCorrect:
// false), MarshalLoad, Open (Safe: false) and YAMLLoad (maximum target Ruby
// 3.0, so it never runs under TargetRubyVersion 3.3).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_SELECTOR,
  NT_AND,
  NT_ARRAY,
  NT_BEGIN,
  NT_DSTR,
  NT_DSYM,
  NT_ERANGE,
  NT_HASH,
  NT_IRANGE,
  NT_OR,
  NT_PAIR,
  NT_REGEXP,
  NT_SEND,
  NT_STR,
  NT_SYM,
  NT_XSTR,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { mcxLiteral } from "./metrics_complexity_help";
import { ssxFE, ssxFS, ssxGlobalConst } from "./style_syntax_help";

/** Node#recursive_literal? */
export const secRecursiveLiteral = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  if (!a.isNode(n)) {
    return false;
  }
  const t = a.type(n);
  if (t === NT_SEND) {
    const m = a.text(a.kid(n, 1));
    const ops = m === "==" || m === "===" || m === "!=" || m === "<=" || m === ">=" || m === ">" || m === "<" || m === "*" || m === "!" || m === "<=>";
    if (!ops || !secRecursiveLiteral(src, a.kid(n, 0))) {
      return false;
    }
    for (let i = 2; i < a.nKid(n); i++) {
      if (!secRecursiveLiteral(src, a.kid(n, i))) {
        return false;
      }
    }
    return true;
  }
  if (
    t === NT_AND ||
    t === NT_OR ||
    t === NT_DSTR ||
    t === NT_XSTR ||
    t === NT_DSYM ||
    t === NT_ARRAY ||
    t === NT_HASH ||
    t === NT_IRANGE ||
    t === NT_ERANGE ||
    t === NT_REGEXP ||
    t === NT_BEGIN ||
    t === NT_PAIR
  ) {
    for (let i = 0; i < a.nKid(n); i++) {
      const k = a.kid(n, i);
      if (k !== V_NIL && !secRecursiveLiteral(src, k)) {
        return false;
      }
    }
    return true;
  }
  return mcxLiteral(t);
};

/** A send to `name` with the given method on a global constant. */
const secConstCall = (src: RbSource, n: i32, cname: string): boolean => ssxGlobalConst(src, src.a.kid(n, 0), cname);

/** The selector's range as an offense. */
const secSelector = (c: RbCop, src: RbSource, n: i32): void => {
  c.offense(ssxFS(src, n, F_SELECTOR), ssxFE(src, n, F_SELECTOR));
};

export class CopSecurityEval {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Security/Eval");
  }
  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND || a.text(a.kid(n, 1)) !== "eval" || a.nKid(n) < 3) {
        continue;
      }
      // {nil? (send nil? :binding) (const {cbase nil?} :Kernel)}
      const r = a.kid(n, 0);
      const binding = a.isNode(r) && a.type(r) === NT_SEND && a.kid(r, 0) === V_NIL && a.nKid(r) === 2 && a.text(a.kid(r, 1)) === "binding";
      if (r !== V_NIL && !binding && !secConstCall(src, n, "Kernel")) {
        continue;
      }
      const code = a.kid(n, 2);
      if (a.type(code) === NT_STR || (a.type(code) === NT_DSTR && secRecursiveLiteral(src, code))) {
        continue;
      }
      secSelector(this.c, src, n);
    }
  }
}

/** `` `(pair (sym :create_additions) _) ``: n or a descendant is such a pair. */
const secCreateAdditions = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  if (!a.isNode(n)) {
    return false;
  }
  if (a.type(n) === NT_PAIR && a.nKid(n) === 2) {
    const k = a.kid(n, 0);
    if (a.isNode(k) && a.type(k) === NT_SYM && a.text(a.kid(k, 0)) === "create_additions") {
      return true;
    }
  }
  for (let i = 0; i < a.nKid(n); i++) {
    if (secCreateAdditions(src, a.kid(n, i))) {
      return true;
    }
  }
  return false;
};

export class CopSecurityJSONLoad {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Security/JSONLoad");
  }
  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND || !secConstCall(src, n, "JSON")) {
        continue;
      }
      const m = a.text(a.kid(n, 1));
      if (m !== "load" && m !== "restore") {
        continue;
      }
      const argc = a.nKid(n) - 2;
      // {_ hash | ... !`(pair (sym :create_additions) _)}
      const hashSecond = argc === 2 && a.isNode(a.kid(n, 3)) && a.type(a.kid(n, 3)) === NT_HASH;
      const noAdditions = argc >= 1 && !secCreateAdditions(src, a.kid(n, -1));
      if (hashSecond || noAdditions) {
        secSelector(this.c, src, n);
      }
    }
  }
}

export class CopSecurityMarshalLoad {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Security/MarshalLoad");
  }
  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND || !secConstCall(src, n, "Marshal")) {
        continue;
      }
      const m = a.text(a.kid(n, 1));
      const argc = a.nKid(n) - 2;
      if ((m !== "load" && m !== "restore") || argc < 1 || argc > 2) {
        continue;
      }
      // !(send (const {nil? cbase} :Marshal) :dump ...)
      const x = a.kid(n, 2);
      if (a.isNode(x) && a.type(x) === NT_SEND && a.text(a.kid(x, 1)) === "dump" && secConstCall(src, x, "Marshal")) {
        continue;
      }
      secSelector(this.c, src, n);
    }
  }
}

/** Open#safe? */
const secOpenSafe = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  if (!a.isNode(n)) {
    return false;
  }
  const t = a.type(n);
  if (t === NT_STR) {
    const s = a.text(a.kid(n, 0));
    return s.length > 0 && !s.startsWith("|");
  }
  if (t === NT_DSTR) {
    // safe?(node.children.first); none (an empty heredoc) raises: no offense.
    return a.nKid(n) === 0 || secOpenSafe(src, a.kid(n, 0));
  }
  if (t === NT_SEND && a.text(a.kid(n, 1)) === "+") {
    const r = a.kid(n, 0);
    if (a.isNode(r) && a.type(r) === NT_STR) {
      return secOpenSafe(src, r);
    }
  }
  return false;
};

export class CopSecurityOpen {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Security/Open");
  }
  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND || a.text(a.kid(n, 1)) !== "open" || a.nKid(n) < 3) {
        continue;
      }
      const r = a.kid(n, 0);
      if (r !== V_NIL && !secConstCall(src, n, "URI")) {
        continue;
      }
      if (!secOpenSafe(src, a.kid(n, 2))) {
        secSelector(this.c, src, n);
      }
    }
  }
}

export class CopSecurityYAMLLoad {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Security/YAMLLoad");
  }
  // nishfmt: detect-only

  /** maximum_target_ruby_version 3.0: no offense under TargetRubyVersion 3.3. */
  run(src: RbSource): void {
    this.c.begin(src);
  }
}
