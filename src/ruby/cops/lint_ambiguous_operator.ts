// Lint/AmbiguousOperator.
//
// RuboCop reads the parser's :ambiguous_prefix warnings, which our lexer does
// not keep. The lexer warns when, in the argument state (after a method
// name, a constant, `super` or `yield`), whitespace is followed by one of
// `+ - * & **` that starts an operand rather than a binary operator; in the
// AST that is an unparenthesized call whose first argument starts right
// after the blank run that follows the name, with one of those characters.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { faulted } from "../../core/fault";
import { stableSort } from "../../core/sort";
import { rbAtOff } from "../help";
import { add32 } from "../../core/arr";
import {
  F_KEYWORD,
  F_OPERATOR,
  F_SELECTOR,
  NT_BLOCK_PASS,
  NT_CSEND,
  NT_HASH,
  NT_KWSPLAT,
  NT_SEND,
  NT_SPLAT,
  NT_SUPER,
  NT_YIELD,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxHas, ssxIs, ssxMeth, ssxOperatorName, ssxParenthesized } from "./style_syntax_help";

/** The diagnostic start of a call, or -1: its first argument begins with an ambiguous prefix. */
const laoDiagPos = (src: RbSource, n: i32): i32 => {
  const a = src.a;
  const t = a.type(n);
  let nameE = -1;
  let first = V_NIL;
  if (t === NT_SEND || t === NT_CSEND) {
    if (
      a.nKid(n) < 3 ||
      !ssxHas(src, n, F_SELECTOR) ||
      ssxHas(src, n, F_OPERATOR) ||
      ssxOperatorName(ssxMeth(src, n))
    ) {
      return -1;
    }
    nameE = ssxFE(src, n, F_SELECTOR);
    first = a.kid(n, 2);
  } else if (t === NT_SUPER || t === NT_YIELD) {
    if (a.nKid(n) < 1 || !ssxHas(src, n, F_KEYWORD)) {
      return -1;
    }
    nameE = ssxFE(src, n, F_KEYWORD);
    first = a.kid(n, 0);
  } else {
    return -1;
  }
  if (ssxParenthesized(src, n) || !a.isNode(first)) {
    return -1;
  }
  const p = a.exS(first);
  if (p <= nameE) {
    return -1;
  }
  // The gap: blanks and line continuations only.
  let i = nameE;
  while (i < p) {
    const c = src.at(i);
    if (c === 32 || c === 9) {
      i++;
    } else if (c === 92 && rbAtOff(src, i, 1) === 10) {
      i = add32(i, 2);
      if (faulted()) {
        return -1;
      }
    } else {
      return -1;
    }
  }
  if (i !== p) {
    return -1;
  }
  const c = src.at(p);
  // Prism does not warn about `&:sym` (a symbol block argument).
  if (c === 38 && rbAtOff(src, p, 1) === 58) {
    return -1;
  }
  if (c === 42 || c === 38 || c === 43) {
    return p;
  }
  if (c === 45 && rbAtOff(src, p, 1) !== 62) {
    return p;
  }
  return -1;
};

export class CopLintAmbiguousOperator {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/AmbiguousOperator");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    const pos: i32[] = [];
    for (const n of src.pre) {
      const p = laoDiagPos(src, n);
      if (p >= 0) {
        pos.push(p);
      }
    }
    // Diagnostics come in source order.
    stableSort(pos, (x: i32, y: i32): i32 => (x < y ? -1 : x > y ? 1 : 0));
    for (let j = 0; j < toI32(pos.length); j++) {
      const p = pos[j];
      if (j > 0 && pos[j - 1] === p) {
        continue;
      }
      const pe = src.at(p) === 42 && rbAtOff(src, p, 1) === 42 ? add32(p, 2) : add32(p, 1);
      const prefix = src.src(p, pe);
      const node = this.offenseNode(src, p, prefix);
      if (node === V_NIL) {
        continue;
      }
      const k = this.c.offense(p, pe);
      if (k === null) {
        continue;
      }
      // add_parentheses
      const t = a.type(node);
      const se = t === NT_SUPER || t === NT_YIELD ? ssxFE(src, node, F_KEYWORD) : ssxFE(src, node, F_SELECTOR);
      const se1 = add32(se, 1);
      k.remove(se, se1);
      k.insertBefore(se, se1, "(");
      k.insertAfter(a.exE(node), a.exE(node), ")");
      this.c.commit(k);
    }
  }

  /** find_offense_node_by. */
  private offenseNode(src: RbSource, p: i32, prefix: string): i32 {
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if ((t === NT_SPLAT || t === NT_BLOCK_PASS || t === NT_KWSPLAT) && a.exS(n) === p) {
        const q = src.parent(n);
        return t === NT_KWSPLAT ? src.parent(q) : q;
      }
    }
    for (const n of src.pre) {
      if (ssxIs(src, n, NT_SEND) && a.nKid(n) > 2) {
        const f = a.kid(n, 2);
        if (a.exS(f) === p && src.nodeSrc(f).startsWith(prefix)) {
          return n;
        }
      }
    }
    return V_NIL;
  }
}
