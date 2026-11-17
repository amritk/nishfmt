// Lint/OutOfRangeRegexpRef (unsafe; detection only): `$n` beyond the capture
// count of the regexp last matched, tracked along the Commissioner's walk
// (on_* on the way down, after_send on the way up).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  NT_CSEND,
  NT_IN_PATTERN,
  NT_MATCH_WITH_LVASGN,
  NT_NTH_REF,
  NT_REGEXP,
  NT_SEND,
  NT_STR,
  NT_WHEN,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ldhCaptures, ldhInterpolation, ldhType } from "./lint_detect_help";
import { ssxBasicLiteral, ssxDescendants, ssxInList, ssxMeth } from "./style_syntax_help";

const LOORR_RECEIVER: string = " =~ === match ";
const LOORR_ARGUMENT: string =
  " =~ match grep gsub gsub! sub sub! [] slice slice! index rindex scan partition rpartition start_with? end_with? ";

export class CopLintOutOfRangeRegexpRef {
  c: RbCop;
  // @valid_ref; -1 for nil
  valid: i32 = 0;

  constructor() {
    this.c = new RbCop("Lint/OutOfRangeRegexpRef");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    this.valid = 0;
    if (src.root !== V_NIL && src.a.isNode(src.root)) {
      this.walk(src, src.root);
    }
  }

  /** check_regexp: the capture count it sets, or -1 (an interpolated regexp sets nothing). */
  private check(src: RbSource, n: i32): i32 {
    if (ldhInterpolation(src, n)) {
      return -1;
    }
    const caps = ldhCaptures(src, n);
    this.valid = caps[0] > 0 ? caps[0] : caps[1];
    return this.valid;
  }

  /** The max of check_regexp over the regexps (filter_map(...).max), -1 for none. */
  private checkAll(src: RbSource, res: i32[]): void {
    let mx = -1;
    for (const r of res) {
      const v = this.check(src, r);
      if (v > mx) {
        mx = v;
      }
    }
    this.valid = mx;
  }

  private walk(src: RbSource, n: i32): void {
    const a = src.a;
    const t = a.type(n);
    if (t === NT_MATCH_WITH_LVASGN) {
      this.check(src, a.kid(n, 0));
    } else if (t === NT_WHEN) {
      const res: i32[] = [];
      for (let i = 0; i < a.nKid(n) - 1; i++) {
        if (ldhType(src, a.kid(n, i)) === NT_REGEXP) {
          res.push(a.kid(n, i));
        }
      }
      this.checkAll(src, res);
    } else if (t === NT_IN_PATTERN) {
      const pat = a.kid(n, 0);
      const res: i32[] = [];
      if (ldhType(src, pat) === NT_REGEXP) {
        res.push(pat);
      } else if (a.isNode(pat)) {
        for (const d of ssxDescendants(src, pat)) {
          if (a.type(d) === NT_REGEXP) {
            res.push(d);
          }
        }
      }
      this.checkAll(src, res);
    } else if (t === NT_NTH_REF) {
      const backref = parseInt(a.text(a.kid(n, 0)));
      if (this.valid >= 0 && backref > this.valid) {
        this.c.offense(a.exS(n), a.exE(n));
      }
    }
    for (let i = 0; i < a.nKid(n); i++) {
      const k = a.kid(n, i);
      if (a.isNode(k)) {
        this.walk(src, k);
      }
    }
    if (t === NT_SEND || t === NT_CSEND) {
      this.afterSend(src, n);
    }
  }

  private afterSend(src: RbSource, n: i32): void {
    const a = src.a;
    const m = ssxMeth(src, n);
    if (!ssxInList(LOORR_RECEIVER, m) && !ssxInList(LOORR_ARGUMENT, m)) {
      return;
    }
    const first = a.nKid(n) > 2 ? a.kid(n, 2) : V_NIL;
    const regexpReceiver = ldhType(src, a.kid(n, 0)) === NT_REGEXP;
    // backrefs_unaffected?
    if (ssxBasicLiteral(src, first) && a.type(first) !== NT_STR && !regexpReceiver) {
      return;
    }
    this.valid = -1;
    if (ldhType(src, first) === NT_REGEXP && ssxInList(LOORR_ARGUMENT, m)) {
      this.check(src, first);
    } else if (regexpReceiver) {
      this.check(src, a.kid(n, 0));
    }
  }
}
