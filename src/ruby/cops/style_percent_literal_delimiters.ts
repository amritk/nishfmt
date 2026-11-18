// Style/PercentLiteralDelimiters (PreferredDelimiters: the default ones).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, F_END, NT_ARRAY, NT_DSTR, NT_REGEXP, NT_STR, NT_SYM, NT_XSTR, VT_STR, VT_SYM, vTag } from "../ast";
import { RbCop } from "../cop";
import { rnE, rnS } from "../node";
import { RbSource } from "../source";
import {
  rbLitBeginLast,
  rbLitContainsAny,
  rbLitIsPercent,
  rbLitMatchpairs,
  rbLitPctType,
  rbLitPreferred,
} from "./lit_help";

/** contains_delimiter?: a child string (a value, or a str/sym child's source) holds one of `ds`. */
const rbPldContainsDelimiter = (src: RbSource, n: i32, ds: string[]): boolean => {
  const a = src.a;
  for (let i = 0; i < a.nKid(n); i++) {
    const c = a.kid(n, i);
    const t = vTag(c);
    let s: string | null = null;
    if (t === VT_STR || t === VT_SYM) {
      s = a.text(c);
    } else if (a.isNode(c) && (a.type(c) === NT_STR || a.type(c) === NT_SYM)) {
      s = src.nodeSrc(c);
    }
    if (s !== null && rbLitContainsAny(s, ds)) {
      return true;
    }
  }
  return false;
};

/** contains_escaped_delimiter?: a `\.` escape of the body (scanned left to right) escapes one of `ds`. */
const rbPldContainsEscapedDelimiter = (src: RbSource, n: i32, ds: string[]): boolean => {
  let i = rnE(src, n, F_BEGIN);
  const e = rnS(src, n, F_END);
  while (i < e) {
    if (src.at(i) === 92 && i + 1 < e) {
      const ch = src.src(i + 1, i + 2);
      for (const d of ds) {
        if (d === ch) {
          return true;
        }
      }
      i += 2;
      continue;
    }
    i++;
  }
  return false;
};

export class CopStylePercentLiteralDelimiters {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/PercentLiteralDelimiters");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      let types = "";
      if (t === NT_ARRAY) {
        types = ",%w,%W,%i,%I,";
      } else if (t === NT_REGEXP) {
        types = ",%r,";
      } else if (t === NT_STR || t === NT_DSTR) {
        types = ",%,%Q,%q,";
      } else if (t === NT_SYM) {
        types = ",%s,";
      } else if (t === NT_XSTR) {
        types = ",%x,";
      } else {
        continue;
      }
      if (!rbLitIsPercent(src, n)) {
        continue;
      }
      const type = rbLitPctType(src, n);
      if (types.indexOf(`,${type},`) < 0) {
        continue;
      }
      this.onPercentLiteral(src, n, type);
    }
  }

  private onPercentLiteral(src: RbSource, n: i32, type: string): void {
    const pref = rbLitPreferred(type);
    const open = pref.substring(0, 1);
    const close = pref.substring(1, 2);
    const last = rbLitBeginLast(src, n);
    // uses_preferred_delimiter?
    if (open === last) {
      return;
    }
    // contains_preferred_delimiter?
    if (rbPldContainsDelimiter(src, n, [open, close])) {
      return;
    }
    // include_same_character_as_used_for_delimiter?
    const used = rbLitMatchpairs(last);
    if (type === "%w" || type === "%i") {
      if (rbPldContainsDelimiter(src, n, used)) {
        return;
      }
    } else if (type === "%q" || type === "%s" || type === "%r") {
      if (rbPldContainsEscapedDelimiter(src, n, used)) {
        return;
      }
    }
    const k = this.c.offense(src.a.exS(n), src.a.exE(n));
    if (k !== null) {
      k.replace(rnS(src, n, F_BEGIN), rnE(src, n, F_BEGIN), `${type}${open}`);
      k.replace(rnS(src, n, F_END), rnE(src, n, F_END), close);
      this.c.commit(k);
    }
  }
}
