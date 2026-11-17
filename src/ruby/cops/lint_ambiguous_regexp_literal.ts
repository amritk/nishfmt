// Lint/AmbiguousRegexpLiteral.
//
// The parser's :ambiguous_regexp warning is recomputed from the tokens: the
// lexer warns when, in the expr_arg state (after a method name, a constant or
// yield/super/not/defined?), whitespace is followed by a `/` that it then
// lexes as the start of a regexp.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_BEGIN,
  F_KEYWORD,
  F_SELECTOR,
  NT_CSEND,
  NT_HASH,
  NT_PAIR,
  NT_REGEXP,
  NT_SEND,
  NT_SUPER,
  NT_YIELD,
  NT_ZSUPER,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { rnE, rnHas } from "../node";
import { RbRewriter } from "../rewriter";
import { RbSource, TK_COMMENT } from "../source";
import {
  TK_kDEFINED,
  TK_kNOT,
  TK_kSUPER,
  TK_kYIELD,
  TK_tCONSTANT,
  TK_tFID,
  TK_tIDENTIFIER,
  TK_tREGEXP_BEG,
} from "../tables";

const rbArlIs = (src: RbSource, n: i32, t: i32): boolean => n !== V_NIL && src.a.isNode(n) && src.a.type(n) === t;

/** Node#receiver: of a send/csend, or of a block's send. */
const rbArlReceiver = (src: RbSource, n: i32): i32 => {
  const a = src.a;
  if (rbArlIs(src, n, NT_SEND) || rbArlIs(src, n, NT_CSEND)) {
    return a.kid(n, 0);
  }
  return V_NIL;
};

export class CopLintAmbiguousRegexpLiteral {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/AmbiguousRegexpLiteral");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const nt = toI32(src.tokT.length);
    for (let i = 0; i < nt; i++) {
      if (src.tokT[i] !== TK_tREGEXP_BEG) {
        continue;
      }
      const tm = src.tokS[i];
      if (src.at(tm) !== 47) {
        continue;
      }
      // w_space+ right before the slash
      let p = tm;
      while (p > 0) {
        const c = src.at(p - 1);
        if (c === 32 || c === 9 || c === 12 || c === 11 || c === 13) {
          p--;
        } else if (c === 10 && src.at(p - 2) === 92) {
          p -= 2;
        } else {
          break;
        }
      }
      if (p === tm) {
        continue;
      }
      // the token that ends there
      let prev = -1;
      for (let j = 0; j < nt; j++) {
        if (src.tokT[j] !== TK_COMMENT && src.tokE[j] === p && src.tokS[j] < p) {
          prev = j;
        }
      }
      if (prev < 0) {
        continue;
      }
      const pt = src.tokT[prev];
      if (
        pt !== TK_tIDENTIFIER &&
        pt !== TK_tFID &&
        pt !== TK_tCONSTANT &&
        pt !== TK_kYIELD &&
        pt !== TK_kSUPER &&
        pt !== TK_kNOT &&
        pt !== TK_kDEFINED
      ) {
        continue;
      }
      this.diagnostic(src, tm);
    }
  }

  private diagnostic(src: RbSource, tm: i32): void {
    const a = src.a;
    let re = V_NIL;
    for (const n of src.pre) {
      if (a.type(n) === NT_REGEXP && a.exS(n) === tm) {
        re = n;
        break;
      }
    }
    if (re === V_NIL) {
      return;
    }
    const k = this.c.offense(tm, tm + 1);
    if (k === null) {
      return;
    }
    const node = this.findOffenseNode(src, src.parent(re), re);
    this.addParentheses(src, node, k);
    this.c.commit(k);
  }

  private findOffenseNode(src: RbSource, node: i32, rr: i32): i32 {
    const a = src.a;
    const par = src.parent(node);
    // first_argument_is_regexp?
    if ((rbArlIs(src, node, NT_SEND) && rbArlIs(src, a.kid(node, 2), NT_REGEXP)) || par === V_NIL) {
      return node;
    }
    let up = rbArlIs(src, par, NT_SEND) && rbArlReceiver(src, node) !== V_NIL;
    if (!up) {
      // method_chain_to_regexp_receiver?
      const pr = rbArlReceiver(src, par);
      up = pr !== V_NIL && src.parent(par) !== V_NIL && rbArlReceiver(src, pr) === rr;
    }
    if (!up) {
      // part_of_hash_argument?
      up =
        rbArlIs(src, node, NT_PAIR) ||
        rbArlIs(src, par, NT_PAIR) ||
        (rbArlIs(src, node, NT_HASH) && !rnHas(src, node, F_BEGIN));
    }
    if (up) {
      return this.findOffenseNode(src, par, rr);
    }
    return node;
  }

  /** Util#add_parentheses */
  private addParentheses(src: RbSource, node: i32, k: RbRewriter): void {
    const a = src.a;
    const t = a.type(node);
    const call = t === NT_SEND || t === NT_CSEND || t === NT_SUPER || t === NT_YIELD || t === NT_ZSUPER;
    if (!call) {
      k.wrap(a.exS(node), a.exE(node), "(", ")");
      return;
    }
    const first = t === NT_SEND || t === NT_CSEND ? 2 : 0;
    if (a.nKid(node) <= first) {
      k.insertAfter(a.exS(node), a.exE(node), "()");
      return;
    }
    const f = t === NT_SEND || t === NT_CSEND ? F_SELECTOR : F_KEYWORD;
    const b = rnE(src, node, f);
    k.remove(b, b + 1);
    k.insertBefore(b, b + 1, "(");
    k.insertAfter(a.exE(node), a.exE(node), ")");
  }
}
