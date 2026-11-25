// Style/SymbolArray (EnforcedStyle: percent, MinSize: 2).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { fault } from "../../core/fault";
import { F_BEGIN, NT_ARRAY, NT_DSYM, NT_SYM } from "../ast";
import { RbCop } from "../cop";
import { rnE, rnHas, rnS } from "../node";
import { RbSource } from "../source";
import { rbByteAt, rbToStringLiteral } from "../util";
import {
  rbLitAllowedBracketArray,
  rbLitBracketed,
  rbLitBracketedArrayOf,
  rbLitInterpolatedLiteral,
  rbLitPercentCorrect,
  rbLitSpaceC,
  rbLitWordC,
} from "./lit_help";

/** The content without `[...]`/`(...)` pairs that hold no space or bracket of their kind. */
const rbSaWithoutPairs = (s: string): string => {
  const parts: string[] = [];
  const n = toI32(s.length);
  let i = 0;
  let from = 0;
  while (i >= 0 && i < n) {
    const c = s.charCodeAt(i);
    if (c === 91 || c === 40) {
      const close = c === 91 ? 93 : 41;
      let j = i + 1;
      while (j >= 0 && j < n) {
        const d = s.charCodeAt(j);
        if (rbLitSpaceC(d) || d === c || d === close) {
          break;
        }
        j++;
      }
      if (j >= 0 && j < n && s.charCodeAt(j) === close) {
        parts.push(s.substring(from, i));
        from = j + 1;
        i = j + 1;
        continue;
      }
    }
    i++;
  }
  parts.push(s.substring(from, n));
  return parts.join("");
};

const rbSaIsDelim = (s: string): boolean => s === "[" || s === "]" || s === "(" || s === ")";

/** SymbolArray#complex_content? */
const rbSaComplex = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  for (let i = 0; i < a.nKid(n); i++) {
    const sym = a.kid(n, i);
    if (rbSaIsDelim(src.nodeSrc(sym))) {
      return false;
    }
    const parts: string[] = [];
    for (let j = 0; j < a.nKid(sym); j++) {
      const c = a.kid(sym, j);
      parts.push(a.isNode(c) ? src.nodeSrc(c) : a.text(c));
    }
    const content = parts.join("");
    if (content.indexOf(" ") >= 0) {
      return true;
    }
    const w = rbSaWithoutPairs(content);
    if (w.indexOf("[") >= 0 || w.indexOf("]") >= 0 || w.indexOf("(") >= 0 || w.indexOf(")") >= 0) {
      return true;
    }
  }
  return false;
};

const RB_SA_SPECIAL: string =
  " $! $\" $$ $& $' $* $+ $, $/ $; $: $. $< $= $> $? $@ $\\ $_ $` $~ $0 $-0 $-F $-I $-K $-W $-a $-d $-i $-l $-p $-v $-w ";
const RB_SA_OPERATORS: string = " | ^ & <=> == === =~ > >= < <= << >> + - * / % ** ~ +@ -@ [] []= ` ! != !~ ";

const rbSaAlpha = (c: i32): boolean => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;

/** `\A` then `from` ... `\w*` to the end. */
const rbSaWordsFrom = (s: string, from: i32, end: i32): boolean => {
  if (from < end && (from < 0 || end > s.length)) {
    fault();
    return false;
  }
  for (let i = from; i >= 0 && i < end && i < s.length; i++) {
    if (!rbLitWordC(s.charCodeAt(i))) {
      return false;
    }
  }
  return true;
};

/** SymbolArray#symbol_without_quote? */
const rbSaWithoutQuote = (s: string): boolean => {
  const n = toI32(s.length);
  if (n > 0 && rbSaAlpha(rbByteAt(s, 0))) {
    // /\A[a-zA-Z_]\w*[!?]?\z/
    const l = s.charCodeAt(n - 1);
    if (rbSaWordsFrom(s, 1, n) || ((l === 33 || l === 63) && rbSaWordsFrom(s, 1, n - 1))) {
      return true;
    }
  }
  if (n > 0 && rbByteAt(s, 0) === 64) {
    // /\A@@?[a-zA-Z_]\w*\z/
    let st = 1;
    if (n > 1 && rbByteAt(s, 1) === 64) {
      st = 2;
    }
    if (st < n && rbSaAlpha(rbByteAt(s, st)) && rbSaWordsFrom(s, st + 1, n)) {
      return true;
    }
  }
  if (n > 1 && rbByteAt(s, 0) === 36) {
    const c1 = rbByteAt(s, 1);
    if (c1 >= 49 && c1 <= 57) {
      let all = true;
      for (let i = 2; i < n; i++) {
        const c = s.charCodeAt(i);
        if (c < 48 || c > 57) {
          all = false;
        }
      }
      if (all) {
        return true;
      }
    }
    if (rbSaAlpha(c1) && rbSaWordsFrom(s, 2, n)) {
      return true;
    }
  }
  if (s.indexOf(" ") < 0 && n > 0) {
    if (RB_SA_SPECIAL.indexOf(` ${s} `) >= 0 || RB_SA_OPERATORS.indexOf(` ${s} `) >= 0) {
      return true;
    }
  }
  return false;
};

/** SymbolArray#to_symbol_literal */
const rbSaSymbolLiteral = (s: string): string => {
  if (rbSaWithoutQuote(s)) {
    return `:${s}`;
  }
  return `:${rbToStringLiteral(s)}`;
};

export class CopStyleSymbolArray {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/SymbolArray");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_ARRAY) {
        continue;
      }
      if (rbLitBracketedArrayOf(src, n, NT_SYM)) {
        if (rbSaComplex(src, n)) {
          continue;
        }
        // check_bracketed_array
        if (rbLitAllowedBracketArray(src, n)) {
          continue;
        }
        const k = this.c.offense(a.exS(n), a.exE(n));
        if (k !== null) {
          k.replace(a.exS(n), a.exE(n), rbLitPercentCorrect(src, n, "i", true));
          this.c.commit(k);
        }
      } else if (rnHas(src, n, F_BEGIN)) {
        const b = src.src(rnS(src, n, F_BEGIN), rnE(src, n, F_BEGIN));
        if (!(b.startsWith("%i") || b.startsWith("%I"))) {
          continue;
        }
        // check_percent_array: brackets only when the contents require them.
        if (!rbSaComplex(src, n)) {
          continue;
        }
        let out = "[]";
        if (a.nKid(n) > 0) {
          const syms: string[] = [];
          for (let i = 0; i < a.nKid(n); i++) {
            const c = a.kid(n, i);
            if (a.type(c) === NT_DSYM) {
              syms.push(`:${rbLitInterpolatedLiteral(src, c)}`);
            } else {
              syms.push(rbSaSymbolLiteral(a.text(a.kid(c, 0))));
            }
          }
          out = rbLitBracketed(src, n, syms);
        }
        const k = this.c.offense(a.exS(n), a.exE(n));
        if (k !== null) {
          k.replace(a.exS(n), a.exE(n), out);
          this.c.commit(k);
        }
      }
    }
  }
}
