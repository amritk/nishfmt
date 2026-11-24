// Lint/FormatParameterMismatch (no correction), with
// RuboCop::Cop::Utils::FormatString read through Style/FormatStringToken's
// SEQUENCE matcher.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { rbNKid } from "../node";
import { rbAtOff } from "../help";
import { fault } from "../../core/fault";
import { add32 } from "../../core/arr";
import { F_SELECTOR, NT_ARRAY, NT_CONST, NT_DSTR, NT_SEND, NT_SPLAT, NT_STR, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { SbhFstMatcher, SbhFstSeq } from "./style_format_string_token";
import { ssxFE, ssxFS, ssxIs, ssxMeth } from "./style_syntax_help";

/** The code points of a node's source. */
const lfpmPoints = (src: RbSource, n: i32): i32[] => {
  const out: i32[] = [];
  const s = src.a.exS(n);
  const e = src.a.exE(n);
  const pts = src.pts;
  if (s < e && (s < 0 || e > pts.length)) {
    fault();
    return out;
  }
  for (let i = s; i >= 0 && i < e && i < pts.length; i++) {
    out.push(pts[i]);
  }
  return out;
};

/** FormatSequence#max_digit_dollar_num (-1: nil). */
const lfpmMaxDollar = (m: SbhFstMatcher, q: SbhFstSeq): i32 => {
  let best = -1;
  let i = q.s;
  while (i < q.e) {
    if (m.isDigit(i)) {
      let j = i;
      let v = 0;
      while (j < q.e && m.isDigit(j)) {
        if (v >= 0 && v < 100000000) {
          // m.isDigit(j): a byte in 0-9.
          v = v * 10 + ((m.at(j) & 0xff) - 48);
        }
        j++;
      }
      if (j < q.e && m.at(j) === 36 && v > best) {
        best = v;
      }
      i = j;
    } else {
      i++;
    }
  }
  return best;
};

/** FormatString over a source string's code points. */
class LfpmFormat {
  m: SbhFstMatcher;
  seqs: SbhFstSeq[];

  constructor(pts: i32[]) {
    this.m = new SbhFstMatcher(pts);
    this.seqs = this.m.scan();
  }

  /** valid?: not mixing named, numbered and unnumbered sequences. */
  valid(): boolean {
    let kinds = 0;
    for (const q of this.seqs) {
      if (q.percent) {
        continue;
      }
      if (q.nameS >= 0) {
        kinds = kinds | 1;
      } else if (lfpmMaxDollar(this.m, q) >= 0) {
        kinds = kinds | 2;
      } else {
        kinds = kinds | 4;
      }
    }
    return kinds === 0 || kinds === 1 || kinds === 2 || kinds === 4;
  }

  named(): boolean {
    for (const q of this.seqs) {
      if (q.nameS >= 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * max_digit_dollar_num over every sequence: -1 for nil, -2 when nil and an
   * integer mix (Array#max raises, so the cop errors on the node).
   */
  maxDollar(): i32 {
    let best = -1;
    let sawNil = false;
    let sawNum = false;
    for (const q of this.seqs) {
      const v = lfpmMaxDollar(this.m, q);
      if (v < 0) {
        sawNil = true;
      } else {
        sawNum = true;
        if (v > best) {
          best = v;
        }
      }
    }
    if (sawNil && sawNum) {
      return -2;
    }
    return best;
  }

  /** The arity sum of the non-percent sequences. */
  arity(): i32 {
    let k = 0;
    for (const q of this.seqs) {
      if (q.percent) {
        continue;
      }
      k = add32(k, 1);
      for (let i = q.s; i < q.e; i++) {
        if (this.m.at(i) === 42) {
          k = add32(k, 1);
        }
      }
    }
    return k;
  }
}

const lfpmStringType = (src: RbSource, n: i32): boolean => ssxIs(src, n, NT_STR) || ssxIs(src, n, NT_DSTR);

export class CopLintFormatParameterMismatch {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/FormatParameterMismatch");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND) {
        continue;
      }
      const m = ssxMeth(src, n);
      if (m !== "format" && m !== "sprintf" && m !== "%") {
        continue;
      }
      if (
        !this.calledOnString(src, n) ||
        !(this.formatMethod(src, n, "sprintf") || this.formatMethod(src, n, "format") || this.percent(src, n))
      ) {
        continue;
      }
      const fmtCall = this.formatMethod(src, n, "sprintf") || this.formatMethod(src, n, "format");
      const strNode = fmtCall ? a.kid(n, 2) : a.kid(n, 0);
      const fs = new LfpmFormat(lfpmPoints(src, strNode));
      if (!fs.valid()) {
        this.c.offense(ssxFS(src, n, F_SELECTOR), ssxFE(src, n, F_SELECTOR));
        continue;
      }
      if (this.offending(src, n)) {
        this.c.offense(ssxFS(src, n, F_SELECTOR), ssxFE(src, n, F_SELECTOR));
      }
    }
  }

  /** called_on_string?. */
  private calledOnString(src: RbSource, n: i32): boolean {
    const a = src.a;
    const r = a.kid(n, 0);
    if (r === V_NIL || ssxIs(src, r, NT_CONST)) {
      return a.nKid(n) > 2 && lfpmStringType(src, a.kid(n, 2));
    }
    return lfpmStringType(src, r);
  }

  private heredoc(src: RbSource, n: i32): boolean {
    const f = src.a.kid(n, 2);
    return (
      toI64(src.a.exE(f)) - toI64(src.a.exS(f)) >= toI64(2) &&
      src.at(src.a.exS(f)) === 60 &&
      rbAtOff(src, src.a.exS(f), 1) === 60
    );
  }

  /** format_method?(name, node). */
  private formatMethod(src: RbSource, n: i32, name: string): boolean {
    const a = src.a;
    const r = a.kid(n, 0);
    if (ssxIs(src, r, NT_CONST) && a.text(a.kid(r, 1)) !== "Kernel") {
      return false;
    }
    if (ssxMeth(src, n) !== name) {
      return false;
    }
    return a.nKid(n) > 3 && lfpmStringType(src, a.kid(n, 2));
  }

  /** percent?. */
  private percent(src: RbSource, n: i32): boolean {
    const a = src.a;
    if (ssxMeth(src, n) !== "%") {
      return false;
    }
    const r = a.kid(n, 0);
    const strRecv = r !== V_NIL && lfpmStringType(src, r);
    const pct = strRecv || ssxIs(src, a.kid(n, 2), NT_ARRAY);
    if (pct && strRecv && this.heredoc(src, n)) {
      return false;
    }
    return pct;
  }

  private offending(src: RbSource, n: i32): boolean {
    const a = src.a;
    const isPct = this.percent(src, n);
    if (!isPct) {
      for (let i = 3; i < a.nKid(n); i++) {
        if (ssxIs(src, a.kid(n, i), NT_SPLAT)) {
          return false;
        }
      }
    }
    let passed = 0;
    let expected = 0;
    const fmtCall = this.formatMethod(src, n, "sprintf") || this.formatMethod(src, n, "format");
    if (fmtCall && !this.heredoc(src, n)) {
      passed = rbNKid(src, n) - 3;
      expected = this.expectedFields(src, a.kid(n, 2));
    } else if (isPct && ssxIs(src, a.kid(n, 2), NT_ARRAY)) {
      const arr = a.kid(n, 2);
      for (let i = 0; i < a.nKid(arr); i++) {
        if (a.isNode(a.kid(arr, i))) {
          passed = add32(passed, 1);
        }
      }
      expected = this.expectedFields(src, a.kid(n, 0));
    } else {
      return false;
    }
    if (expected === -2) {
      // max_digit_dollar_num raised: the cop errors on this node.
      return false;
    }
    const first = a.kid(n, 2);
    if (expected === 0 && (ssxIs(src, first, NT_DSTR) || ssxIs(src, first, NT_ARRAY))) {
      return false;
    }
    return expected !== passed;
  }

  /** expected_fields_count (-2: the count raises). */
  private expectedFields(src: RbSource, n: i32): i32 {
    const fs = new LfpmFormat(lfpmPoints(src, n));
    if (fs.named()) {
      return 1;
    }
    const md = fs.maxDollar();
    if (md === -2) {
      return -2;
    }
    if (md > 0) {
      return md;
    }
    return fs.arity();
  }
}
