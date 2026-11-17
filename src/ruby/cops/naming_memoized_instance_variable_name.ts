// Naming/MemoizedInstanceVariableName (detection only: Safe: false;
// EnforcedStyleForLeadingUnderscores: disallowed).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_NAME,
  NT_BEGIN,
  NT_BLOCK,
  NT_DEF,
  NT_DEFINED_P,
  NT_DEFS,
  NT_IF,
  NT_IVAR,
  NT_IVASGN,
  NT_OR_ASGN,
  NT_RETURN,
  NT_SEND,
  NT_STR,
  NT_SYM,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { vfSameNode } from "./lint_variable_force";
import { ssxFE, ssxFS, ssxIsWord } from "./style_syntax_help";

/** find_definition's result: the method node (V_NIL for none) and its name. */
class NmivDef {
  node: i32;
  name: string;

  constructor(node: i32, name: string) {
    this.node = node;
    this.name = name;
  }
}

/** method_definition? over the def/defs/block ancestors, nearest first. */
const nmivFind = (src: RbSource, n: i32): NmivDef => {
  const a = src.a;
  let p = src.parent(n);
  while (p !== V_NIL) {
    const t = a.type(p);
    if (t === NT_DEF) {
      return new NmivDef(p, a.text(a.kid(p, 0)));
    }
    if (t === NT_DEFS) {
      return new NmivDef(p, a.text(a.kid(p, 1)));
    }
    if (t === NT_BLOCK) {
      const s = a.kid(p, 0);
      if (a.isNode(s) && a.type(s) === NT_SEND && a.nKid(s) === 3) {
        const m = a.text(a.kid(s, 1));
        const arg = a.kid(s, 2);
        if (
          (m === "define_method" || m === "define_singleton_method") &&
          a.isNode(arg) &&
          (a.type(arg) === NT_SYM || a.type(arg) === NT_STR)
        ) {
          return new NmivDef(p, a.text(a.kid(arg, 0)));
        }
      }
    }
    p = src.parent(p);
  }
  return new NmivDef(V_NIL, "");
};

/** `name.delete('!?=')`. */
const nmivStrip = (s: string): string => {
  const out: string[] = [];
  for (let i = 0; i < toI32(s.length); i++) {
    const c = s.charCodeAt(i);
    if (c !== 33 && c !== 63 && c !== 61) {
      out.push(s.substring(i, i + 1));
    }
  }
  return out.join("");
};

/** nameable_method?: `/\A[a-zA-Z_]\w*\z/` without `!?=`. */
const nmivNameable = (name: string): boolean => {
  const s = nmivStrip(name);
  if (s.length === 0) {
    return false;
  }
  const c0 = s.charCodeAt(0);
  if (!((c0 >= 65 && c0 <= 90) || (c0 >= 97 && c0 <= 122) || c0 === 95)) {
    return false;
  }
  for (let i = 1; i < toI32(s.length); i++) {
    if (!ssxIsWord(s.charCodeAt(i))) {
      return false;
    }
  }
  return true;
};

/** matches?: the variable is one of the method name's candidates (or the method initializes). */
const nmivMatches = (method: string, ivar: string): boolean => {
  if (
    method === "initialize" ||
    method === "initialize_clone" ||
    method === "initialize_copy" ||
    method === "initialize_dup"
  ) {
    return true;
  }
  const m = nmivStrip(method);
  const at = ivar.indexOf("@");
  const v = at >= 0 ? `${ivar.substring(0, at)}${ivar.substring(at + 1, toI32(ivar.length))}` : ivar;
  const noUnderscore = m.startsWith("_") ? m.substring(1, toI32(m.length)) : m;
  return v === m || v === noUnderscore;
};

/** The body of a def, defs or block. */
const nmivBody = (src: RbSource, n: i32): i32 => (src.a.type(n) === NT_DEFS ? src.a.kid(n, 3) : src.a.kid(n, 2));

/** An `(ivar name)` node. */
const nmivIvar = (src: RbSource, n: i32, name: string): boolean =>
  src.a.isNode(n) && src.a.type(n) === NT_IVAR && src.a.text(src.a.kid(n, 0)) === name;

export class CopNamingMemoizedInstanceVariableName {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Naming/MemoizedInstanceVariableName");
  }
  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    for (const n of src.pre) {
      const t = src.a.type(n);
      if (t === NT_OR_ASGN) {
        this.onOrAsgn(src, n);
      } else if (t === NT_DEFINED_P) {
        this.onDefined(src, n);
      }
    }
  }

  private onOrAsgn(src: RbSource, n: i32): void {
    const a = src.a;
    const lhs = a.kid(n, 0);
    if (!a.isNode(lhs) || a.type(lhs) !== NT_IVASGN) {
      return;
    }
    const d = nmivFind(src, n);
    if (d.node === V_NIL || !nmivNameable(d.name)) {
      return;
    }
    const body = nmivBody(src, d.node);
    if (!a.isNode(body)) {
      return;
    }
    if (!vfSameNode(src, body, n) && !(a.nKid(body) > 0 && vfSameNode(src, a.kid(body, -1), n))) {
      return;
    }
    if (nmivMatches(d.name, a.text(a.kid(lhs, 0)))) {
      return;
    }
    this.c.offense(a.exS(lhs), a.exE(lhs));
  }

  private onDefined(src: RbSource, n: i32): void {
    const a = src.a;
    const arg = a.kid(n, 0);
    if (!a.isNode(arg) || a.type(arg) !== NT_IVAR) {
      return;
    }
    const name = a.text(a.kid(arg, 0));
    const d = nmivFind(src, n);
    if (d.node === V_NIL || !nmivNameable(d.name)) {
      return;
    }
    // defined_memoized?: (begin (if (defined? (ivar)) (return (ivar)) nil) ... (ivasgn name _))
    const body = nmivBody(src, d.node);
    if (!a.isNode(body) || a.type(body) !== NT_BEGIN || a.nKid(body) < 2) {
      return;
    }
    const first = a.kid(body, 0);
    const last = a.kid(body, -1);
    if (!a.isNode(first) || a.type(first) !== NT_IF || a.kid(first, 2) !== V_NIL) {
      return;
    }
    const cond = a.kid(first, 0);
    const ret = a.kid(first, 1);
    if (
      !a.isNode(cond) ||
      a.type(cond) !== NT_DEFINED_P ||
      a.nKid(cond) !== 1 ||
      !nmivIvar(src, a.kid(cond, 0), name)
    ) {
      return;
    }
    if (!a.isNode(ret) || a.type(ret) !== NT_RETURN || a.nKid(ret) !== 1 || !nmivIvar(src, a.kid(ret, 0), name)) {
      return;
    }
    if (!a.isNode(last) || a.type(last) !== NT_IVASGN || a.nKid(last) !== 2 || a.text(a.kid(last, 0)) !== name) {
      return;
    }
    if (nmivMatches(d.name, name)) {
      return;
    }
    const di = a.kid(cond, 0);
    const ri = a.kid(ret, 0);
    this.c.offense(a.exS(di), a.exE(di));
    this.c.offense(a.exS(ri), a.exE(ri));
    this.c.offense(ssxFS(src, last, F_NAME), ssxFE(src, last, F_NAME));
  }
}
