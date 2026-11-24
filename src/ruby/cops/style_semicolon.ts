// Style/Semicolon (AllowAsExpressionSeparator: false).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_KEYWORD,
  F_SELECTOR,
  NT_BEGIN,
  NT_CSEND,
  NT_DSTR,
  NT_ERANGE,
  NT_IRANGE,
  NT_PAIR,
  NT_SEND,
  NT_STR,
  NT_SUPER,
  NT_XSTR,
  NT_YIELD,
  V_NIL,
} from "../ast";
import { add32, atI32, sub32 } from "../../core/arr";
import { fault } from "../../core/fault";
import { RbCop } from "../cop";
import { RbRewriter } from "../rewriter";
import { rnHeredoc } from "../node";
import { RbSource } from "../source";
import {
  TK_tDOT2,
  TK_tDOT3,
  TK_tLABEL,
  TK_tLAMBEG,
  TK_tLCURLY,
  TK_tRCURLY,
  TK_tSEMI,
  TK_tSTRING_DBEG,
  TK_tSTRING_DEND,
} from "../tables";
import { ssxFE } from "./style_syntax_help";

/** The type of tokens[i] with Ruby's negative indexing (-999 for nil). */
const sbhSemiTokType = (src: RbSource, toks: i32[], i0: i32): i32 => {
  const k = toI32(toks.length);
  const i = i0 < 0 ? i0 + k : i0;
  if (i < 0 || i >= k) {
    return -999;
  }
  return atI32(src.tokT, toks[i]);
};

/** The token index tokens[i] with Ruby's negative indexing (-1 for nil). */
const sbhSemiTok = (toks: i32[], i0: i32): i32 => {
  const k = toI32(toks.length);
  const i = i0 < 0 ? i0 + k : i0;
  if (i < 0 || i >= k) {
    return -1;
  }
  return toks[i];
};

/** semicolon_position (999 for none). */
const sbhSemiPosition = (src: RbSource, toks: i32[]): i32 => {
  if (sbhSemiTokType(src, toks, -1) === TK_tSEMI) {
    return -1;
  }
  if (sbhSemiTokType(src, toks, 0) === TK_tSEMI) {
    return 0;
  }
  if (sbhSemiTokType(src, toks, -2) === TK_tRCURLY && sbhSemiTokType(src, toks, -3) === TK_tSEMI) {
    return -3;
  }
  if (
    ((sbhSemiTokType(src, toks, 1) === TK_tLCURLY || sbhSemiTokType(src, toks, 1) === TK_tLAMBEG) &&
      sbhSemiTokType(src, toks, 2) === TK_tSEMI) ||
    (sbhSemiTokType(src, toks, 1) === TK_tSTRING_DBEG && sbhSemiTokType(src, toks, 2) === TK_tSEMI)
  ) {
    return 2;
  }
  if (sbhSemiTokType(src, toks, 2) === TK_tLAMBEG && sbhSemiTokType(src, toks, 3) === TK_tSEMI) {
    return 3;
  }
  if (sbhSemiTokType(src, toks, -3) === TK_tSTRING_DEND && sbhSemiTokType(src, toks, -4) === TK_tSEMI) {
    return -4;
  }
  return 999;
};

/** Range#overlaps? */
const sbhSemiOverlaps = (s1: i32, e1: i32, s2: i32, e2: i32): boolean => {
  if (s1 === e1 && s2 === e2) {
    return s1 === s2;
  }
  return !(s1 >= e2 || s2 >= e1);
};

/** Style/Semicolon. */
export class CopStyleSemicolon {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/Semicolon");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    if (src.root === V_NIL) {
      return;
    }
    let hasSemi = false;
    const pts = src.pts;
    const n0 = src.n;
    for (let i = 0; i < n0; i++) {
      // n counts the code points.
      if (i >= pts.length) {
        fault();
        return;
      }
      if (pts[i] === 59) {
        hasSemi = true;
        break;
      }
    }
    if (!hasSemi) {
      return;
    }
    this.lineTerminators(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_BEGIN) {
        continue;
      }
      let inSrc = false;
      for (let p = a.exS(n); p < a.exE(n); p++) {
        // A node lies in the source.
        if (p < 0 || p >= pts.length) {
          fault();
          return;
        }
        if (pts[p] === 59) {
          inSrc = true;
          break;
        }
      }
      if (!inSrc || a.nKid(n) < 2) {
        continue;
      }
      // expressions_per_line: the last lines of the children, in first-seen order.
      const lines: i32[] = [];
      const counts: i32[] = [];
      for (let i = 0; i < a.nKid(n); i++) {
        const l = src.line(a.exE(a.kid(n, i)));
        let found = false;
        for (let j = 0; j < toI32(lines.length); j++) {
          if (lines[j] === l) {
            // lines and counts grow together.
            if (j >= counts.length) {
              fault();
              return;
            }
            counts[j] = add32(counts[j], 1);
            found = true;
            break;
          }
        }
        if (!found) {
          lines.push(l);
          counts.push(1);
        }
      }
      for (let j = 0; j < toI32(lines.length); j++) {
        const lj = lines[j];
        if (atI32(counts, j) < 2) {
          continue;
        }
        for (let t = 0; t < toI32(src.tokT.length); t++) {
          if (src.tokT[t] === TK_tSEMI && src.line(atI32(src.tokS, t)) === lj) {
            this.register(src, atI32(src.tokS, t), true, -1);
          }
        }
      }
    }
  }

  /** check_for_line_terminator_or_opener. */
  private lineTerminators(src: RbSource): void {
    const lines: i32[] = [];
    const groups: i32[][] = [];
    const idx = new Map<i32, i32>();
    for (let t = 0; t < toI32(src.tokT.length); t++) {
      const l = src.line(atI32(src.tokS, t));
      const g = idx.get(l);
      if (g === undefined) {
        idx.set(l, toI32(lines.length));
        lines.push(l);
        const fresh: i32[] = [t];
        groups.push(fresh);
      } else {
        // idx maps a line to its group.
        const gi: i32 = g;
        if (gi < 0 || gi >= groups.length) {
          fault();
          return;
        }
        groups[gi].push(t);
      }
    }
    for (let j = 0; j < toI32(lines.length); j++) {
      // lines and groups grow together.
      if (j >= groups.length) {
        fault();
        return;
      }
      const toks = groups[j];
      const pos = sbhSemiPosition(src, toks);
      if (pos === 999) {
        continue;
      }
      const after = pos === -1 ? -2 : pos;
      this.register(src, atI32(src.tokS, sbhSemiTok(toks, pos)), false, sbhSemiTok(toks, after));
    }
  }

  /** register_semicolon at the one-character range starting at `s`. */
  private register(src: RbSource, s: i32, afterExpression: boolean, before: i32): void {
    const s1 = add32(s, 1);
    const k = this.c.offense(s, s1);
    if (k === null) {
      return;
    }
    if (afterExpression) {
      if (!this.heredocBefore(src, s)) {
        k.replace(s, s1, "\n");
      }
      this.c.commit(k);
      return;
    }
    if (before >= 0) {
      const bt = atI32(src.tokT, before);
      if (bt === TK_tDOT2 || bt === TK_tDOT3) {
        const r = this.findNode(src, before, true);
        if (r !== V_NIL) {
          k.wrap(src.a.exS(r), src.a.exE(r), "(", ")");
        }
      } else if (bt === TK_tLABEL) {
        const pair = this.findNode(src, before, false);
        if (pair !== V_NIL) {
          this.parenthesize(src, k, src.parent(pair));
        }
      }
    }
    k.remove(s, s1);
    this.c.commit(k);
  }

  /** heredoc_opened_before_semicolon? */
  private heredocBefore(src: RbSource, s: i32): boolean {
    const a = src.a;
    const l = src.line(s);
    for (const n of src.pre) {
      if (n === src.root) {
        continue;
      }
      const t = a.type(n);
      if ((t === NT_STR || t === NT_DSTR || t === NT_XSTR) && rnHeredoc(src, n)) {
        if (src.line(a.exS(n)) === l && a.exE(n) <= s) {
          return true;
        }
      }
    }
    return false;
  }

  /** find_node over range_nodes (ranges) or value_omission_pair_nodes: the first overlapping the token. */
  private findNode(src: RbSource, tok: i32, ranges: boolean): i32 {
    const a = src.a;
    const ts = atI32(src.tokS, tok);
    const te = atI32(src.tokE, tok);
    for (const n of src.pre) {
      const t = a.type(n);
      if (ranges) {
        if (t !== NT_IRANGE && t !== NT_ERANGE) {
          continue;
        }
      } else {
        if (n === src.root || t !== NT_PAIR || src.at(sub32(a.exE(n), 1)) !== 58) {
          continue;
        }
      }
      if (sbhSemiOverlaps(a.exS(n), a.exE(n), ts, te)) {
        return n;
      }
    }
    return V_NIL;
  }

  /** parenthesize_arguments. */
  private parenthesize(src: RbSource, k: RbRewriter, hash: i32): void {
    if (hash === V_NIL) {
      return;
    }
    const a = src.a;
    const call = src.parent(hash);
    if (call === V_NIL) {
      return;
    }
    const ct = a.type(call);
    if (ct !== NT_SEND && ct !== NT_CSEND && ct !== NT_SUPER && ct !== NT_YIELD) {
      return;
    }
    const selE = ct === NT_SUPER || ct === NT_YIELD ? ssxFE(src, call, F_KEYWORD) : ssxFE(src, call, F_SELECTOR);
    const first = ct === NT_SUPER || ct === NT_YIELD ? a.kid(call, 0) : a.kid(call, 2);
    k.replace(selE, a.exS(first), "(");
    const last = a.kid(call, -1);
    k.insertAfter(a.exS(last), a.exE(last), ")");
  }
}
