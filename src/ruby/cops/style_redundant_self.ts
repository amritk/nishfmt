// Style/RedundantSelf.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_DOT,
  F_SELECTOR,
  NT_AND_ASGN,
  NT_ARGS,
  NT_BLOCK,
  NT_BLOCKARG,
  NT_DEF,
  NT_DEFS,
  NT_IF,
  NT_IN_PATTERN,
  NT_LVASGN,
  NT_MASGN,
  NT_MATCH_VAR,
  NT_MLHS,
  NT_NUMBLOCK,
  NT_OP_ASGN,
  NT_OR_ASGN,
  NT_RESBODY,
  NT_SELF,
  NT_SEND,
  NT_SPLAT,
  NT_UNTIL,
  NT_WHILE,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import {
  ssxArgc,
  ssxFE,
  ssxFS,
  ssxHas,
  ssxInList,
  ssxIs,
  ssxMeth,
  ssxOperatorName,
  ssxSetter,
  ssxSymText,
} from "./style_syntax_help";

const SSX_RS_KERNEL: string =
  " Array Complex Float Hash Integer Pathname Rational String URI __callee__ __dir__ __method__ ` abort at_exit autoload autoload? binding block_given? caller caller_locations catch eval exec exit exit! fail fork format gets global_variables iterator? lambda load local_variables loop open p print printf proc putc puts raise rand readline readlines require require_relative select set_trace_func sleep spawn sprintf srand syscall system test throw trace_var trap untrace_var warn ";

const SSX_RS_KEYWORDS: string =
  " alias and begin break case class def defined? do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield __FILE__ __LINE__ __ENCODING__ ";

/** The cop's per-file state: @allowed_send_nodes and @local_variables_scopes (arrays shared by identity). */
class SsxRsState {
  allowed: Set<i32>;
  arrOf: Map<i32, i32>;
  arrs: string[];

  constructor() {
    this.allowed = new Set<i32>();
    this.arrOf = new Map<i32, i32>();
    this.arrs = [];
  }

  /** @local_variables_scopes[node]: its array id (a fresh one on first use). */
  get(n: i32): i32 {
    const id = this.arrOf.get(n);
    if (id !== undefined) {
      return id;
    }
    const k = toI32(this.arrs.length);
    this.arrs.push(" ");
    this.arrOf.set(n, k);
    return k;
  }

  /** A new array no node holds yet (add_scope's default `[]`). */
  fresh(): i32 {
    this.arrs.push(" ");
    return toI32(this.arrs.length) - 1;
  }

  add(n: i32, name: string): void {
    const id = this.get(n);
    this.arrs[id] = `${this.arrs[id]}${name} `;
  }

  includes(n: i32, name: string): boolean {
    return ssxInList(this.arrs[this.get(n)], name);
  }

  /** add_scope: every descendant shares one array. */
  addScope(src: RbSource, n: i32, id: i32): void {
    const stack: i32[] = [];
    for (let i = 0; i < src.a.nKid(n); i++) {
      if (src.a.isNode(src.a.kid(n, i))) {
        stack.push(src.a.kid(n, i));
      }
    }
    while (stack.length > 0) {
      const c = stack[stack.length - 1];
      stack.pop();
      this.arrOf.set(c, id);
      for (let i = 0; i < src.a.nKid(c); i++) {
        if (src.a.isNode(src.a.kid(c, i))) {
          stack.push(src.a.kid(c, i));
        }
      }
    }
  }

  /** add_lhs_to_local_variables_scopes (name "" for a non-symbol lhs). */
  addLhs(src: RbSource, rhs: i32, name: string): void {
    if (rhs === V_NIL) {
      return;
    }
    if (ssxIs(src, rhs, NT_SEND) && ssxArgc(src, rhs) > 0) {
      for (let i = 2; i < src.a.nKid(rhs); i++) {
        this.add(src.a.kid(rhs, i), name);
      }
    } else {
      this.add(rhs, name);
    }
  }

  /** add_masgn_lhs_variables. */
  addMasgn(src: RbSource, rhs: i32, mlhs: i32): void {
    for (let i = 0; i < src.a.nKid(mlhs); i++) {
      const child = src.a.kid(mlhs, i);
      this.addLhs(src, rhs, ssxSymText(src, src.a.kid(child, 0)));
    }
  }

  /** on_argument. */
  onArgument(src: RbSource, n: i32): void {
    if (ssxIs(src, n, NT_MLHS)) {
      this.onArgs(src, n);
    } else {
      this.add(n, ssxSymText(src, src.a.kid(n, 0)));
    }
  }

  onArgs(src: RbSource, n: i32): void {
    for (let i = 0; i < src.a.nKid(n); i++) {
      this.onArgument(src, src.a.kid(n, i));
    }
  }
}

/** Every descendant of n (pre-order). */
const ssxRsDescendants = (src: RbSource, n: i32): i32[] => {
  const out: i32[] = [];
  const stack: i32[] = [];
  for (let i = src.a.nKid(n) - 1; i >= 0; i--) {
    if (src.a.isNode(src.a.kid(n, i))) {
      stack.push(src.a.kid(n, i));
    }
  }
  while (stack.length > 0) {
    const c = stack[stack.length - 1];
    stack.pop();
    out.push(c);
    for (let i = src.a.nKid(c) - 1; i >= 0; i--) {
      if (src.a.isNode(src.a.kid(c, i))) {
        stack.push(src.a.kid(c, i));
      }
    }
  }
  return out;
};

export class CopStyleRedundantSelf {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/RedundantSelf");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    const st = new SsxRsState();
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_OR_ASGN || t === NT_AND_ASGN) {
        const lhs = a.kid(n, 0);
        this.allowSelf(src, st, lhs);
        const name = ssxIs(src, lhs, NT_LVASGN) ? ssxSymText(src, a.kid(lhs, 0)) : "";
        st.addLhs(src, a.kid(n, 1), name);
      } else if (t === NT_OP_ASGN) {
        this.allowSelf(src, st, a.kid(n, 0));
      } else if (t === NT_DEF || t === NT_DEFS) {
        st.addScope(src, n, st.fresh());
      } else if (t === NT_ARGS) {
        st.onArgs(src, n);
      } else if (t === NT_BLOCKARG) {
        st.onArgument(src, n);
      } else if (t === NT_MASGN) {
        st.addMasgn(src, a.kid(n, 1), a.kid(n, 0));
      } else if (t === NT_LVASGN) {
        st.addLhs(src, a.kid(n, 1), ssxSymText(src, a.kid(n, 0)));
      } else if (t === NT_RESBODY) {
        const ev = a.kid(n, 1);
        if (ssxIs(src, ev, NT_LVASGN)) {
          st.add(n, ssxSymText(src, a.kid(ev, 0)));
        }
      } else if (t === NT_IN_PATTERN) {
        for (const d of ssxRsDescendants(src, n)) {
          if (a.type(d) === NT_MATCH_VAR) {
            st.add(n, ssxSymText(src, a.kid(d, 0)));
          }
        }
      } else if (t === NT_SEND) {
        this.onSend(src, st, n);
      } else if (t === NT_BLOCK || t === NT_NUMBLOCK) {
        st.addScope(src, n, st.get(n));
      } else if (t === NT_IF || t === NT_WHILE || t === NT_UNTIL) {
        const cond = a.kid(n, 0);
        for (const d of ssxRsDescendants(src, n)) {
          if (a.type(d) === NT_LVASGN) {
            st.addLhs(src, cond, ssxSymText(src, a.kid(d, 0)));
          } else if (a.type(d) === NT_MASGN) {
            st.addMasgn(src, cond, a.kid(d, 0));
          }
        }
      }
    }
  }

  private allowSelf(src: RbSource, st: SsxRsState, n: i32): void {
    if (ssxIs(src, n, NT_SEND) && ssxIs(src, src.a.kid(n, 0), NT_SELF)) {
      st.allowed.add(n);
    }
  }

  private onSend(src: RbSource, st: SsxRsState, n: i32): void {
    const a = src.a;
    const recv = a.kid(n, 0);
    if (!ssxIs(src, recv, NT_SELF)) {
      return;
    }
    const m = ssxMeth(src, n);
    // regular_method_call?
    const c0 = m.charCodeAt(0);
    if (ssxOperatorName(m) || ssxInList(SSX_RS_KEYWORDS, m) || (c0 >= 65 && c0 <= 90) || ssxSetter(src, n)) {
      return;
    }
    if (m === "call" && !ssxHas(src, n, F_SELECTOR)) {
      return;
    }
    // multiple_assignment_target?
    let par = src.parent(n);
    if (par !== V_NIL) {
      if (ssxIs(src, par, NT_SPLAT)) {
        par = src.parent(par);
      }
      if (ssxIs(src, par, NT_MLHS)) {
        return;
      }
    }
    // allowed_send_node?
    if (st.allowed.has(n) || st.includes(n, m)) {
      return;
    }
    let p = src.parent(n);
    while (p !== V_NIL) {
      if (st.includes(p, m)) {
        return;
      }
      p = src.parent(p);
    }
    if (ssxInList(SSX_RS_KERNEL, m)) {
      return;
    }
    // it_method_in_block?
    if (m === "it") {
      let b = src.parent(n);
      while (b !== V_NIL && a.type(b) !== NT_BLOCK) {
        b = src.parent(b);
      }
      if (b !== V_NIL && a.exS(a.kid(b, 1)) < 0 && ssxArgc(src, n) === 0) {
        const bp = src.parent(n);
        const literal = bp !== V_NIL && (a.type(bp) === NT_BLOCK || a.type(bp) === NT_NUMBLOCK) && a.kid(bp, 0) === n;
        if (!literal) {
          return;
        }
      }
    }
    const k = this.c.offense(a.exS(recv), a.exE(recv));
    if (k !== null) {
      k.remove(a.exS(recv), a.exE(recv));
      k.remove(ssxFS(src, n, F_DOT), ssxFE(src, n, F_DOT));
      this.c.commit(k);
    }
  }
}
