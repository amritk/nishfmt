// Naming/RescuedExceptionsVariableName (PreferredName: e).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_OPERATOR,
  NT_CASGN,
  NT_CVASGN,
  NT_GVASGN,
  NT_IVASGN,
  NT_KWBEGIN,
  NT_LVAR,
  NT_LVASGN,
  NT_MASGN,
  NT_PAIR,
  NT_RESBODY,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";
import { ssxDescendants, ssxFE, ssxFS, ssxIsCall } from "./style_syntax_help";

/** The name of an assignment node (AsgnNode#name / CasgnNode#name), or "" when it has none. */
const nrevName = (src: RbSource, n: i32): string => {
  const a = src.a;
  if (!a.isNode(n)) {
    return "";
  }
  const t = a.type(n);
  if (t === NT_LVASGN || t === NT_IVASGN || t === NT_CVASGN || t === NT_GVASGN || t === NT_LVAR) {
    return a.text(a.kid(n, 0));
  }
  if (t === NT_CASGN) {
    return a.text(a.kid(n, 1));
  }
  return "";
};

/** variable_name_matches?. */
const nrevMatches = (src: RbSource, n: i32, name: string): boolean => {
  if (src.a.type(n) === NT_MASGN) {
    for (const d of ssxDescendants(src, n)) {
      if (src.a.type(d) === NT_LVASGN && nrevName(src, d) === name) {
        return true;
      }
    }
    return false;
  }
  return nrevName(src, n) === name;
};

export class CopNamingRescuedExceptionsVariableName {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Naming/RescuedExceptionsVariableName");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) === NT_RESBODY) {
        this.onResbody(src, n);
      }
    }
  }

  private onResbody(src: RbSource, n: i32): void {
    const a = src.a;
    const ev = a.kid(n, 1);
    const t = a.isNode(ev) ? a.type(ev) : -1;
    if (!(t === NT_LVASGN || t === NT_IVASGN || t === NT_CVASGN || t === NT_GVASGN || t === NT_CASGN)) {
      return;
    }
    const bad = nrevName(src, ev);
    let p = src.parent(n);
    while (p !== V_NIL) {
      if (a.type(p) === NT_RESBODY) {
        return;
      }
      p = src.parent(p);
    }
    const preferred = bad.startsWith("_") ? "_e" : "e";
    if (preferred === bad) {
      return;
    }
    // shadowed_variable_name?
    for (const d of ssxDescendants(src, n)) {
      if (a.type(d) === NT_LVAR && a.text(a.kid(d, 0)) === "e") {
        return;
      }
    }
    const k = this.c.offense(a.exS(ev), a.exE(ev));
    if (k === null) {
      return;
    }
    let kw = src.parent(src.parent(n));
    while (kw !== V_NIL && a.type(kw) !== NT_KWBEGIN) {
      kw = src.parent(kw);
    }
    // a `begin` that is the receiver or an argument of a call is left alone
    if (kw !== V_NIL && ssxIsCall(src, src.parent(kw))) {
      return;
    }
    k.replace(a.exS(ev), a.exE(ev), preferred);
    if (this.correctNode(src, k, a.kid(n, 2), bad, preferred) === V_NIL) {
      if (kw !== V_NIL) {
        const kp = src.parent(kw);
        if (kp !== V_NIL) {
          let after = false;
          for (let i = 0; i < a.nKid(kp); i++) {
            const c = a.kid(kp, i);
            if (after) {
              // right_siblings.grep(AST::Node)
              if (!a.isNode(c)) {
                continue;
              }
              if (this.correctNode(src, k, c, bad, preferred) !== V_NIL) {
                break;
              }
            } else if (c === kw) {
              after = true;
            }
          }
        }
      }
    }
    this.c.commit(k);
  }

  /** correct_node: the lvasgn/masgn that reassigns the name (V_NIL for none). */
  private correctNode(src: RbSource, k: RbRewriter, node: i32, bad: string, preferred: string): i32 {
    const a = src.a;
    if (node === V_NIL) {
      return V_NIL;
    }
    const nodes: i32[] = [node];
    for (const d of ssxDescendants(src, node)) {
      nodes.push(d);
    }
    for (const c of nodes) {
      const t = a.type(c);
      if (t !== NT_LVAR && t !== NT_LVASGN && t !== NT_MASGN) {
        continue;
      }
      if (!nrevMatches(src, c, bad)) {
        continue;
      }
      if (t === NT_LVAR) {
        const p = src.parent(c);
        // PairNode#value_omission?
        if (p !== V_NIL && a.type(p) === NT_PAIR && src.nodeSrc(p).endsWith(":")) {
          k.replace(ssxFS(src, p, F_OPERATOR), ssxFE(src, p, F_OPERATOR), `: ${preferred}`);
        } else {
          k.replace(a.exS(c), a.exE(c), preferred);
        }
        continue;
      }
      this.correctNode(src, k, a.kid(c, 1), bad, preferred);
      return c;
    }
    return V_NIL;
  }
}
