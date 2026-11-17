// Style/ExplicitBlockArgument.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_BEGIN,
  F_DOT,
  F_END,
  F_NAME,
  F_SELECTOR,
  NT_ARG,
  NT_ARGS,
  NT_BLOCK,
  NT_BLOCK_PASS,
  NT_BLOCKARG,
  NT_CSEND,
  NT_DEF,
  NT_DEFS,
  NT_FORWARD_ARG,
  NT_KWARG,
  NT_KWOPTARG,
  NT_KWRESTARG,
  NT_LVASGN,
  NT_MLHS,
  NT_OPTARG,
  NT_RESTARG,
  NT_SEND,
  NT_SHADOWARG,
  NT_SUPER,
  NT_YIELD,
  NT_ZSUPER,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";
import { sbhMethodName } from "./style_body_help";
import { ssxAstEqual } from "./style_syntax_reparse";
import { ssxDefArgs, ssxDescendants, ssxFE, ssxFS, ssxHas, ssxParenthesized } from "./style_syntax_help";

const sbhEbIs = (src: RbSource, n: i32, t: i32): boolean => src.a.isNode(n) && src.a.type(n) === t;

/** Whether a node is of the :argument group. */
const sbhEbArgument = (t: i32): boolean =>
  t === NT_ARG ||
  t === NT_OPTARG ||
  t === NT_RESTARG ||
  t === NT_KWARG ||
  t === NT_KWOPTARG ||
  t === NT_KWRESTARG ||
  t === NT_BLOCKARG ||
  t === NT_FORWARD_ARG ||
  t === NT_SHADOWARG;

/** The name (first child) of an argument or lvasgn as a string ("" for nil). */
const sbhEbName = (src: RbSource, n: i32): string => {
  if (src.a.nKid(n) === 0) {
    return "";
  }
  const c = src.a.kid(n, 0);
  return c === V_NIL || src.a.isNode(c) ? "" : src.a.text(c);
};

/** The arguments of a def (its args node's children), send/csend (children from 2) or super. */
const sbhEbArgs = (src: RbSource, n: i32): i32[] => {
  const a = src.a;
  const out: i32[] = [];
  const t = a.type(n);
  if (t === NT_DEF || t === NT_DEFS) {
    const args = ssxDefArgs(src, n);
    for (let i = 0; i < a.nKid(args); i++) {
      out.push(a.kid(args, i));
    }
  } else if (t === NT_SEND || t === NT_CSEND) {
    for (let i = 2; i < a.nKid(n); i++) {
      out.push(a.kid(n, i));
    }
  } else if (t === NT_SUPER || t === NT_YIELD) {
    for (let i = 0; i < a.nKid(n); i++) {
      out.push(a.kid(n, i));
    }
  }
  return out;
};

/** Style/ExplicitBlockArgument. */
export class CopStyleExplicitBlockArgument {
  c: RbCop;
  defs: Set<i32>;

  constructor() {
    this.c = new RbCop("Style/ExplicitBlockArgument");
    this.defs = new Set<i32>();
  }

  run(src: RbSource): void {
    this.c.begin(src);
    this.defs = new Set<i32>();
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) === NT_YIELD) {
        this.onYield(src, n);
      }
    }
  }

  private onYield(src: RbSource, y: i32): void {
    const a = src.a;
    const b = src.parent(y);
    // (block $_ (args $...) (yield $...))
    if (b === V_NIL || a.type(b) !== NT_BLOCK || a.kid(b, 2) !== y || !sbhEbIs(src, a.kid(b, 1), NT_ARGS)) {
      return;
    }
    const sendNode = a.kid(b, 0);
    const bargs = a.kid(b, 1);
    // yielding_arguments?
    const ny = a.nKid(y);
    const nb = a.nKid(bargs);
    if (ny > nb) {
      return;
    }
    for (let i = 0; i < nb; i++) {
      if (i >= ny) {
        return;
      }
      const ya = a.kid(y, i);
      const ba = a.kid(bargs, i);
      const y0 = a.nKid(ya) > 0 ? a.kid(ya, 0) : V_NIL;
      const b0 = a.nKid(ba) > 0 ? a.kid(ba, 0) : V_NIL;
      if (!ssxAstEqual(a, y0, a, b0)) {
        return;
      }
    }
    let def = src.parent(b);
    while (def !== V_NIL && a.type(def) !== NT_DEF && a.type(def) !== NT_DEFS) {
      def = src.parent(def);
    }
    if (def === V_NIL) {
      return;
    }
    const dargs = sbhEbArgs(src, def);
    for (const x of dargs) {
      if (sbhEbIs(src, x, NT_FORWARD_ARG)) {
        return;
      }
    }
    const last = dargs.length > 0 ? dargs[dargs.length - 1] : V_NIL;
    const hasBlockArg = last !== V_NIL && (sbhEbIs(src, last, NT_BLOCK_PASS) || sbhEbIs(src, last, NT_BLOCKARG));
    const name = hasBlockArg ? sbhEbName(src, last) : "block";
    const k = this.c.offense(a.exS(b), a.exE(b));
    if (k === null) {
      return;
    }
    // can_add_block_argument?
    if (!hasBlockArg) {
      for (const d of ssxDescendants(src, def)) {
        const t = a.type(d);
        if ((sbhEbArgument(t) || t === NT_LVASGN) && sbhEbName(src, d) === name) {
          this.c.commit(k);
          return;
        }
      }
    }
    if (a.type(sendNode) === NT_ZSUPER) {
      for (const x of dargs) {
        if (sbhEbIs(src, x, NT_MLHS)) {
          this.c.commit(k);
          return;
        }
      }
    }
    if (!this.blockArgumentAddable(src, sendNode)) {
      // add_block_argument raises (a lambda's map has no name): nothing is corrected.
      return;
    }
    k.remove(a.exE(sendNode), ssxFE(src, b, F_END));
    this.addBlockArgument(src, k, sendNode, name);
    if (!this.defs.has(def)) {
      this.defs.add(def);
      this.addBlockArgument(src, k, def, name);
    }
    this.c.commit(k);
  }

  /** Whether add_block_argument reaches a branch that works for this node. */
  private blockArgumentAddable(src: RbSource, n: i32): boolean {
    const t = src.a.type(n);
    return t === NT_SEND || t === NT_CSEND || t === NT_SUPER || t === NT_ZSUPER || t === NT_DEF || t === NT_DEFS;
  }

  /** add_block_argument. */
  private addBlockArgument(src: RbSource, k: RbRewriter, n: i32, name: string): void {
    const a = src.a;
    const t = a.type(n);
    const args = sbhEbArgs(src, n);
    if (args.length > 0) {
      // insert_argument
      const last = args[args.length - 1];
      let e = a.exE(last);
      while (src.at(e) === 44) {
        e++;
      }
      let rep = ` &${name}`;
      if (src.at(e - 1) !== 44) {
        rep = `,${rep}`;
      }
      if (!sbhEbIs(src, last, NT_BLOCKARG)) {
        k.insertAfter(a.exS(last), e, rep);
      }
      return;
    }
    if (t === NT_DEF || t === NT_DEFS) {
      const da = ssxDefArgs(src, n);
      if (ssxHas(src, da, F_BEGIN)) {
        k.replace(a.exS(da), a.exE(da), `(&${name})`);
        return;
      }
      k.insertAfter(ssxFS(src, n, F_NAME), ssxFE(src, n, F_NAME), `(&${name})`);
      return;
    }
    if (t === NT_SEND && sbhMethodName(src, n) === "[]" && !ssxHas(src, n, F_DOT)) {
      k.replace(ssxFS(src, n, F_SELECTOR), ssxFE(src, n, F_SELECTOR), `[&${name}]`);
      return;
    }
    // correct_call_node
    let newArgs = `&${name}`;
    if (t === NT_ZSUPER) {
      const parts: string[] = [];
      let def = src.parent(n);
      while (def !== V_NIL && a.type(def) !== NT_DEF && a.type(def) !== NT_DEFS) {
        def = src.parent(def);
      }
      if (def !== V_NIL) {
        for (const x of sbhEbArgs(src, def)) {
          const xt = a.type(x);
          if (xt === NT_ARG || xt === NT_OPTARG) {
            parts.push(sbhEbName(src, x));
          } else if (xt === NT_KWARG || xt === NT_KWOPTARG) {
            parts.push(`${sbhEbName(src, x)}: ${sbhEbName(src, x)}`);
          } else if (xt === NT_RESTARG || xt === NT_KWRESTARG) {
            parts.push(src.nodeSrc(x));
          }
        }
      }
      parts.push(`&${name}`);
      newArgs = parts.join(", ");
    }
    if (ssxParenthesized(src, n)) {
      k.replace(ssxFS(src, n, F_BEGIN), ssxFE(src, n, F_END), `(${newArgs})`);
    } else {
      k.insertAfter(a.exS(n), a.exE(n), `(${newArgs})`);
    }
  }
}
