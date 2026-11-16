// The Rust lexer: rustc_lexer's tokens, glued into rustc_ast's compound
// punctuation the way rustc_parse's lexer does, kept as parallel arrays of
// kinds and byte spans. Whitespace and ordinary comments are dropped (rustfmt
// reads them back from the source text); doc comments are kept as tokens,
// since rustc turns them into attributes.
//
// Ported from rustc_lexer and rustc_parse (MIT OR Apache-2.0, Copyright The
// Rust Project Developers), for rustfmt 1.9.0 (MIT OR Apache-2.0, Copyright
// The Rust Project Developers).

import { growI32 } from "../core/arr";

export const T_EOF: i32 = 0;
export const T_IDENT: i32 = 1;
export const T_LIFETIME: i32 = 2;
export const T_INT: i32 = 3;
export const T_FLOAT: i32 = 4;
export const T_CHAR: i32 = 5;
export const T_BYTE: i32 = 6;
export const T_STR: i32 = 7;
export const T_BSTR: i32 = 8;
export const T_CSTR: i32 = 9;
export const T_RSTR: i32 = 10;
export const T_RBSTR: i32 = 11;
export const T_RCSTR: i32 = 12;
export const T_DOC_LINE_OUTER: i32 = 13;
export const T_DOC_LINE_INNER: i32 = 14;
export const T_DOC_BLOCK_OUTER: i32 = 15;
export const T_DOC_BLOCK_INNER: i32 = 16;
export const T_SEMI: i32 = 20;
export const T_COMMA: i32 = 21;
export const T_DOT: i32 = 22;
export const T_DOTDOT: i32 = 23;
export const T_DOTDOTDOT: i32 = 24;
export const T_DOTDOTEQ: i32 = 25;
export const T_LPAREN: i32 = 26;
export const T_RPAREN: i32 = 27;
export const T_LBRACE: i32 = 28;
export const T_RBRACE: i32 = 29;
export const T_LBRACKET: i32 = 30;
export const T_RBRACKET: i32 = 31;
export const T_AT: i32 = 32;
export const T_POUND: i32 = 33;
export const T_TILDE: i32 = 34;
export const T_QUESTION: i32 = 35;
export const T_COLON: i32 = 36;
export const T_COLONCOLON: i32 = 37;
export const T_DOLLAR: i32 = 38;
export const T_EQ: i32 = 39;
export const T_EQEQ: i32 = 40;
export const T_NE: i32 = 41;
export const T_NOT: i32 = 42;
export const T_LT: i32 = 43;
export const T_LE: i32 = 44;
export const T_SHL: i32 = 45;
export const T_SHLEQ: i32 = 46;
export const T_GT: i32 = 47;
export const T_GE: i32 = 48;
export const T_SHR: i32 = 49;
export const T_SHREQ: i32 = 50;
export const T_MINUS: i32 = 51;
export const T_MINUSEQ: i32 = 52;
export const T_RARROW: i32 = 53;
export const T_FATARROW: i32 = 54;
export const T_AND: i32 = 55;
export const T_ANDAND: i32 = 56;
export const T_ANDEQ: i32 = 57;
export const T_OR: i32 = 58;
export const T_OROR: i32 = 59;
export const T_OREQ: i32 = 60;
export const T_PLUS: i32 = 61;
export const T_PLUSEQ: i32 = 62;
export const T_STAR: i32 = 63;
export const T_STAREQ: i32 = 64;
export const T_SLASH: i32 = 65;
export const T_SLASHEQ: i32 = 66;
export const T_CARET: i32 = 67;
export const T_CARETEQ: i32 = 68;
export const T_PERCENT: i32 = 69;
export const T_PERCENTEQ: i32 = 70;
export const T_UNKNOWN: i32 = 71;

// Keyword ids of identifier tokens (0: not a keyword, or a raw identifier).
export const KW_AS: i32 = 1;
export const KW_ASYNC: i32 = 2;
export const KW_AWAIT: i32 = 3;
export const KW_BREAK: i32 = 4;
export const KW_CONST: i32 = 5;
export const KW_CONTINUE: i32 = 6;
export const KW_CRATE: i32 = 7;
export const KW_DYN: i32 = 8;
export const KW_ELSE: i32 = 9;
export const KW_ENUM: i32 = 10;
export const KW_EXTERN: i32 = 11;
export const KW_FALSE: i32 = 12;
export const KW_FN: i32 = 13;
export const KW_FOR: i32 = 14;
export const KW_IF: i32 = 15;
export const KW_IMPL: i32 = 16;
export const KW_IN: i32 = 17;
export const KW_LET: i32 = 18;
export const KW_LOOP: i32 = 19;
export const KW_MATCH: i32 = 20;
export const KW_MOD: i32 = 21;
export const KW_MOVE: i32 = 22;
export const KW_MUT: i32 = 23;
export const KW_PUB: i32 = 24;
export const KW_REF: i32 = 25;
export const KW_RETURN: i32 = 26;
export const KW_SELF: i32 = 27;
export const KW_SELF_TY: i32 = 28;
export const KW_STATIC: i32 = 29;
export const KW_STRUCT: i32 = 30;
export const KW_SUPER: i32 = 31;
export const KW_TRAIT: i32 = 32;
export const KW_TRUE: i32 = 33;
export const KW_TYPE: i32 = 34;
export const KW_UNSAFE: i32 = 35;
export const KW_USE: i32 = 36;
export const KW_WHERE: i32 = 37;
export const KW_WHILE: i32 = 38;
export const KW_YIELD: i32 = 39;
export const KW_UNDERSCORE: i32 = 40;
// Reserved words: never identifiers.
export const KW_ABSTRACT: i32 = 41;
export const KW_BECOME: i32 = 42;
export const KW_BOX: i32 = 43;
export const KW_DO: i32 = 44;
export const KW_FINAL: i32 = 45;
export const KW_MACRO: i32 = 46;
export const KW_OVERRIDE: i32 = 47;
export const KW_PRIV: i32 = 48;
export const KW_TYPEOF: i32 = 49;
export const KW_UNSIZED: i32 = 50;
export const KW_VIRTUAL: i32 = 51;
export const KW_TRY: i32 = 52;
// Weak keywords: identifiers that some positions read as keywords.
export const KW_UNION: i32 = 60;
export const KW_DEFAULT: i32 = 61;
export const KW_MACRO_RULES: i32 = 62;
export const KW_AUTO: i32 = 63;
export const KW_RAW: i32 = 64;
export const KW_SAFE: i32 = 65;
export const KW_STATIC_LT: i32 = 66; // the lifetime 'static
export const KW_UNDERSCORE_LT: i32 = 67; // the lifetime '_
export const KW_GEN: i32 = 68;

/** Whether keyword id `k` is a strict or reserved keyword (never a plain identifier). */
export const rsIsReserved = (k: i32): boolean => k > 0 && k < 60;

export const rsIsIdStart = (c: i32): boolean =>
  (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 95 || c >= 128;

export const rsIsIdContinue = (c: i32): boolean =>
  (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 95 || (c >= 48 && c <= 57) || c >= 128;

export const rsIsWs = (c: i32): boolean => c === 32 || c === 9 || c === 10 || c === 13 || c === 11 || c === 12;

/** The keyword id of the identifier `src[a, b)`. */
export const rsKeywordOf = (src: u8[], a: i32, b: i32): i32 => {
  const n = b - a;
  if (n < 2 || n > 12) {
    if (n === 1 && toI32(src[a]) === 95) {
      return KW_UNDERSCORE;
    }
    return 0;
  }
  const c0 = toI32(src[a]);
  const c1 = toI32(src[a + 1]);
  if (n === 2) {
    if (c0 === 97 && c1 === 115) return KW_AS;
    if (c0 === 100 && c1 === 111) return KW_DO;
    if (c0 === 102 && c1 === 110) return KW_FN;
    if (c0 === 105 && c1 === 102) return KW_IF;
    if (c0 === 105 && c1 === 110) return KW_IN;
    return 0;
  }
  if (rsEq(src, a, b, "async")) return KW_ASYNC;
  if (rsEq(src, a, b, "await")) return KW_AWAIT;
  if (rsEq(src, a, b, "break")) return KW_BREAK;
  if (rsEq(src, a, b, "const")) return KW_CONST;
  if (rsEq(src, a, b, "continue")) return KW_CONTINUE;
  if (rsEq(src, a, b, "crate")) return KW_CRATE;
  if (rsEq(src, a, b, "dyn")) return KW_DYN;
  if (rsEq(src, a, b, "else")) return KW_ELSE;
  if (rsEq(src, a, b, "enum")) return KW_ENUM;
  if (rsEq(src, a, b, "extern")) return KW_EXTERN;
  if (rsEq(src, a, b, "false")) return KW_FALSE;
  if (rsEq(src, a, b, "for")) return KW_FOR;
  if (rsEq(src, a, b, "impl")) return KW_IMPL;
  if (rsEq(src, a, b, "let")) return KW_LET;
  if (rsEq(src, a, b, "loop")) return KW_LOOP;
  if (rsEq(src, a, b, "match")) return KW_MATCH;
  if (rsEq(src, a, b, "mod")) return KW_MOD;
  if (rsEq(src, a, b, "move")) return KW_MOVE;
  if (rsEq(src, a, b, "mut")) return KW_MUT;
  if (rsEq(src, a, b, "pub")) return KW_PUB;
  if (rsEq(src, a, b, "ref")) return KW_REF;
  if (rsEq(src, a, b, "return")) return KW_RETURN;
  if (rsEq(src, a, b, "self")) return KW_SELF;
  if (rsEq(src, a, b, "Self")) return KW_SELF_TY;
  if (rsEq(src, a, b, "static")) return KW_STATIC;
  if (rsEq(src, a, b, "struct")) return KW_STRUCT;
  if (rsEq(src, a, b, "super")) return KW_SUPER;
  if (rsEq(src, a, b, "trait")) return KW_TRAIT;
  if (rsEq(src, a, b, "true")) return KW_TRUE;
  if (rsEq(src, a, b, "type")) return KW_TYPE;
  if (rsEq(src, a, b, "unsafe")) return KW_UNSAFE;
  if (rsEq(src, a, b, "use")) return KW_USE;
  if (rsEq(src, a, b, "where")) return KW_WHERE;
  if (rsEq(src, a, b, "while")) return KW_WHILE;
  if (rsEq(src, a, b, "yield")) return KW_YIELD;
  if (rsEq(src, a, b, "abstract")) return KW_ABSTRACT;
  if (rsEq(src, a, b, "become")) return KW_BECOME;
  if (rsEq(src, a, b, "box")) return KW_BOX;
  if (rsEq(src, a, b, "final")) return KW_FINAL;
  if (rsEq(src, a, b, "macro")) return KW_MACRO;
  if (rsEq(src, a, b, "override")) return KW_OVERRIDE;
  if (rsEq(src, a, b, "priv")) return KW_PRIV;
  if (rsEq(src, a, b, "typeof")) return KW_TYPEOF;
  if (rsEq(src, a, b, "unsized")) return KW_UNSIZED;
  if (rsEq(src, a, b, "virtual")) return KW_VIRTUAL;
  if (rsEq(src, a, b, "try")) return KW_TRY;
  if (rsEq(src, a, b, "union")) return KW_UNION;
  if (rsEq(src, a, b, "default")) return KW_DEFAULT;
  if (rsEq(src, a, b, "macro_rules")) return KW_MACRO_RULES;
  if (rsEq(src, a, b, "auto")) return KW_AUTO;
  if (rsEq(src, a, b, "raw")) return KW_RAW;
  if (rsEq(src, a, b, "safe")) return KW_SAFE;
  if (rsEq(src, a, b, "gen")) return KW_GEN;
  return 0;
};

/** Whether `src[a, b)` is the string `s`. */
export const rsEq = (src: u8[], a: i32, b: i32, s: string): boolean => {
  const n = toI32(s.length);
  if (b - a !== n) {
    return false;
  }
  for (let i = 0; i < n; i++) {
    if (toI32(src[a + i]) !== s.charCodeAt(i)) {
      return false;
    }
  }
  return true;
};

export class RsTokens {
  src: u8[];
  n: i32 = 0; // source length
  nt: i32 = 0;
  kind: i32[];
  lo: i32[];
  hi: i32[];
  kw: i32[];
  // Index of the matching delimiter for ( [ { and ) ] }, else -1.
  match: i32[];
  // Byte offset where a literal's suffix starts (hi when it has none).
  suf: i32[];
  failed: boolean = false;
  // The end of a shebang line (0 when there is none).
  shebang: i32 = 0;

  constructor(src: u8[], n: i32) {
    this.src = src;
    this.n = n;
    const c = n / 3 + 16;
    this.kind = new Array<i32>(c);
    this.lo = new Array<i32>(c);
    this.hi = new Array<i32>(c);
    this.kw = new Array<i32>(c);
    this.match = new Array<i32>(c);
    this.suf = new Array<i32>(c);
  }

  add(k: i32, a: i32, b: i32, kw: i32, suf: i32): void {
    const i = this.nt;
    if (i >= toI32(this.kind.length)) {
      const c = i * 2 + 16;
      this.kind = growI32(this.kind, c);
      this.lo = growI32(this.lo, c);
      this.hi = growI32(this.hi, c);
      this.kw = growI32(this.kw, c);
      this.match = growI32(this.match, c);
      this.suf = growI32(this.suf, c);
    }
    this.kind[i] = k;
    this.lo[i] = a;
    this.hi[i] = b;
    this.kw[i] = kw;
    this.match[i] = -1;
    this.suf[i] = suf;
    this.nt = i + 1;
  }
}

const at = (src: u8[], n: i32, i: i32): i32 => (i < n ? toI32(src[i]) : 0);

const eatDigits = (src: u8[], n: i32, i0: i32, hex: boolean): i32 => {
  let i = i0;
  while (i < n) {
    const c = toI32(src[i]);
    if (c === 95 || (c >= 48 && c <= 57) || (hex && ((c >= 97 && c <= 102) || (c >= 65 && c <= 70)))) {
      i++;
    } else {
      break;
    }
  }
  return i;
};

const eatIdent = (src: u8[], n: i32, i0: i32): i32 => {
  let i = i0;
  while (i < n && rsIsIdContinue(toI32(src[i]))) {
    i++;
  }
  return i;
};

// Eats a double-quoted string body after its opening quote; answers the offset after the closing quote, or -1.
const eatDq = (src: u8[], n: i32, i0: i32): i32 => {
  let i = i0;
  while (i < n) {
    const c = toI32(src[i]);
    i++;
    if (c === 34) {
      return i;
    }
    if (c === 92 && i < n) {
      const d = toI32(src[i]);
      if (d === 92 || d === 34) {
        i++;
      }
    }
  }
  return -1;
};

// Eats a raw string starting at the first `#` or `"` after the prefix; answers the end or -1.
const eatRaw = (src: u8[], n: i32, i0: i32): i32 => {
  let i = i0;
  let h = 0;
  while (i < n && toI32(src[i]) === 35) {
    h++;
    i++;
  }
  if (at(src, n, i) !== 34) {
    return -1;
  }
  i++;
  while (i < n) {
    if (toI32(src[i]) === 34) {
      i++;
      let e = 0;
      while (e < h && i < n && toI32(src[i]) === 35) {
        e++;
        i++;
      }
      if (e === h) {
        return i;
      }
    } else {
      i++;
    }
  }
  return -1;
};

// Eats a single-quoted literal body after its opening quote; answers the end or -1.
const eatSq = (src: u8[], n: i32, i0: i32): i32 => {
  let i = i0;
  if (at(src, n, i + 1) === 39 && at(src, n, i) !== 92) {
    return i + 2;
  }
  while (i < n) {
    const c = toI32(src[i]);
    if (c === 39) {
      return i + 1;
    }
    if (c === 47) {
      return -1;
    }
    if (c === 10 && at(src, n, i + 1) !== 39) {
      return -1;
    }
    if (c === 92) {
      i += 2;
    } else {
      i++;
    }
  }
  return -1;
};

const suffixEnd = (src: u8[], n: i32, i: i32): i32 => {
  if (i < n && rsIsIdStart(toI32(src[i]))) {
    return eatIdent(src, n, i + 1);
  }
  return i;
};

const isHorizontalWs = (c: i32): boolean => c === 32 || c === 9;

/**
 * A frontmatter (`---` fenced block) at the start of the file, after the
 * shebang and whitespace: skipped like whitespace. One rustc would report an
 * error for (bad opening, infostring or closing) fails the lex.
 */
const skipFrontmatter = (t: RsTokens, src: u8[], n: i32, i0: i32): i32 => {
  let j = i0;
  while (j < n && rsIsWs(toI32(src[j]))) {
    j++;
  }
  if (!(j + 2 < n && toI32(src[j]) === 45 && toI32(src[j + 1]) === 45 && toI32(src[j + 2]) === 45)) {
    return i0;
  }
  if (j > i0 && toI32(src[j - 1]) !== 10) {
    t.failed = true; // whitespace before the opening that is not a newline
    return i0;
  }
  let k = j;
  while (k < n && toI32(src[k]) === 45) {
    k++;
  }
  const len = k - j;
  if (len > 255) {
    t.failed = true;
    return i0;
  }
  while (k < n && isHorizontalWs(toI32(src[k]))) {
    k++;
  }
  if (k < n && rsIsIdStart(toI32(src[k]))) {
    k++;
    while (k < n && (rsIsIdContinue(toI32(src[k])) || toI32(src[k]) === 45 || toI32(src[k]) === 46)) {
      k++;
    }
  }
  while (k < n && isHorizontalWs(toI32(src[k]))) {
    k++;
  }
  if (k >= n || toI32(src[k]) !== 10) {
    t.failed = true; // an invalid infostring
    return i0;
  }
  // The closing fence: a line starting with `len` dashes.
  let p = k;
  for (;;) {
    while (p < n && toI32(src[p]) !== 10) {
      p++;
    }
    if (p >= n) {
      t.failed = true; // unclosed
      return i0;
    }
    let d = 0;
    while (p + 1 + d < n && toI32(src[p + 1 + d]) === 45) {
      d++;
    }
    if (d >= len) {
      break;
    }
    p++;
  }
  for (let q = k; q < p; q++) {
    if (toI32(src[q]) === 13) {
      t.failed = true; // a bare CR in the content
      return i0;
    }
  }
  let e = p + 1;
  let d = 0;
  while (e < n && toI32(src[e]) === 45) {
    e++;
    d++;
  }
  if (d !== len) {
    t.failed = true; // the closing fence's length differs
    return i0;
  }
  while (e < n && toI32(src[e]) !== 10) {
    if (!isHorizontalWs(toI32(src[e]))) {
      t.failed = true; // characters after the closing fence
      return i0;
    }
    e++;
  }
  return e;
};

/** Lexes `src[0, n)`; a lexing error sets `failed`. */
export const rsLex = (t: RsTokens): void => {
  const src = t.src;
  const n = t.n;
  let i = 0;
  // A byte order mark.
  if (n >= 3 && toI32(src[0]) === 0xef && toI32(src[1]) === 0xbb && toI32(src[2]) === 0xbf) {
    i = 3;
  }
  // Shebang: `#!` not followed (after whitespace and comments) by `[`.
  if (at(src, n, i) === 35 && at(src, n, i + 1) === 33) {
    let j = i + 2;
    let isAttr = false;
    while (j < n) {
      const c = toI32(src[j]);
      if (rsIsWs(c)) {
        j++;
      } else if (c === 47 && at(src, n, j + 1) === 47) {
        while (j < n && toI32(src[j]) !== 10) {
          j++;
        }
      } else if (c === 47 && at(src, n, j + 1) === 42) {
        j = skipBlockComment(src, n, j);
        if (j < 0) {
          break;
        }
      } else {
        isAttr = c === 91;
        break;
      }
    }
    if (!isAttr) {
      while (i < n && toI32(src[i]) !== 10) {
        i++;
      }
      t.shebang = i;
    }
  }
  i = skipFrontmatter(t, src, n, i);
  if (t.failed) {
    return;
  }
  let stack = new Array<i32>(64);
  let sp = 0;
  while (i < n) {
    const c = toI32(src[i]);
    const a = i;
    if (rsIsWs(c)) {
      i++;
      continue;
    }
    if (c === 47) {
      const d = at(src, n, i + 1);
      if (d === 47) {
        // Line comment.
        const e = at(src, n, i + 2);
        let k = 0;
        if (e === 33) {
          k = T_DOC_LINE_INNER;
        } else if (e === 47 && at(src, n, i + 3) !== 47) {
          k = T_DOC_LINE_OUTER;
        }
        while (i < n && toI32(src[i]) !== 10) {
          i++;
        }
        if (k !== 0) {
          // A doc comment's span excludes a trailing \r.
          let b = i;
          if (b > a && toI32(src[b - 1]) === 13) {
            b--;
          }
          t.add(k, a, b, 0, b);
        }
        continue;
      }
      if (d === 42) {
        const e = at(src, n, i + 2);
        let k = 0;
        if (e === 33) {
          k = T_DOC_BLOCK_INNER;
        } else if (e === 42) {
          const f = at(src, n, i + 3);
          if (f !== 42 && f !== 47) {
            k = T_DOC_BLOCK_OUTER;
          }
        }
        const b = skipBlockComment(src, n, i);
        if (b < 0) {
          t.failed = true;
          return;
        }
        i = b;
        if (k !== 0) {
          t.add(k, a, b, 0, b);
        }
        continue;
      }
      if (d === 61) {
        t.add(T_SLASHEQ, a, a + 2, 0, a + 2);
        i += 2;
        continue;
      }
      t.add(T_SLASH, a, a + 1, 0, a + 1);
      i++;
      continue;
    }
    if (rsIsIdStart(c)) {
      const d = at(src, n, i + 1);
      // Raw identifiers and string prefixes.
      if (c === 114 && d === 35 && rsIsIdStart(at(src, n, i + 2))) {
        const b = eatIdent(src, n, i + 2);
        t.add(T_IDENT, a, b, 0, b);
        i = b;
        continue;
      }
      if (c === 114 && (d === 35 || d === 34)) {
        const b = eatRaw(src, n, i + 1);
        if (b < 0) {
          t.failed = true;
          return;
        }
        const s = suffixEnd(src, n, b);
        t.add(T_RSTR, a, s, 0, b);
        i = s;
        continue;
      }
      if (c === 98 || c === 99) {
        if (c === 98 && d === 39) {
          const b = eatSq(src, n, i + 2);
          if (b < 0) {
            t.failed = true;
            return;
          }
          const s = suffixEnd(src, n, b);
          t.add(T_BYTE, a, s, 0, b);
          i = s;
          continue;
        }
        if (d === 34) {
          const b = eatDq(src, n, i + 2);
          if (b < 0) {
            t.failed = true;
            return;
          }
          const s = suffixEnd(src, n, b);
          t.add(c === 98 ? T_BSTR : T_CSTR, a, s, 0, b);
          i = s;
          continue;
        }
        if (d === 114) {
          const e = at(src, n, i + 2);
          if (e === 34 || e === 35) {
            const b = eatRaw(src, n, i + 2);
            if (b < 0) {
              t.failed = true;
              return;
            }
            const s = suffixEnd(src, n, b);
            t.add(c === 98 ? T_RBSTR : T_RCSTR, a, s, 0, b);
            i = s;
            continue;
          }
        }
      }
      const b = eatIdent(src, n, i + 1);
      const e = at(src, n, b);
      if (e === 35 || e === 34 || e === 39) {
        // An unknown prefix: reserved syntax in edition 2021.
        t.failed = true;
        return;
      }
      t.add(T_IDENT, a, b, rsKeywordOf(src, a, b), b);
      i = b;
      continue;
    }
    if (c >= 48 && c <= 57) {
      let j = i + 1;
      let isFloat = false;
      let hex = false;
      const d = at(src, n, j);
      if (c === 48 && (d === 98 || d === 111 || d === 120)) {
        hex = d === 120;
        j = eatDigits(src, n, j + 1, hex);
      } else {
        j = eatDigits(src, n, j, false);
      }
      const e = at(src, n, j);
      if (e === 46 && at(src, n, j + 1) !== 46 && !rsIsIdStart(at(src, n, j + 1))) {
        isFloat = true;
        j++;
        const f = at(src, n, j);
        if (f >= 48 && f <= 57) {
          j = eatDigits(src, n, j, false);
          const g = at(src, n, j);
          if (g === 101 || g === 69) {
            j = eatExponent(src, n, j + 1);
          }
        }
      } else if (!hex && (e === 101 || e === 69)) {
        // `1e10`; but `1else` would be odd: rustc eats it and errors.
        const f = at(src, n, j + 1);
        if ((f >= 48 && f <= 57) || f === 95 || f === 43 || f === 45) {
          isFloat = true;
          j = eatExponent(src, n, j + 1);
        }
      }
      const s = suffixEnd(src, n, j);
      t.add(isFloat ? T_FLOAT : T_INT, a, s, 0, j);
      i = s;
      continue;
    }
    if (c === 39) {
      // Lifetime or character literal.
      const d = at(src, n, i + 1);
      const canBeLifetime = at(src, n, i + 2) !== 39 && (rsIsIdStart(d) || (d >= 48 && d <= 57));
      if (!canBeLifetime) {
        const b = eatSq(src, n, i + 1);
        if (b < 0) {
          t.failed = true;
          return;
        }
        const s = suffixEnd(src, n, b);
        t.add(T_CHAR, a, s, 0, b);
        i = s;
        continue;
      }
      if (d === 114 && at(src, n, i + 2) === 35 && rsIsIdStart(at(src, n, i + 3))) {
        const b = eatIdent(src, n, i + 3);
        t.add(T_LIFETIME, a, b, 0, b);
        i = b;
        continue;
      }
      const b = eatIdent(src, n, i + 2);
      if (at(src, n, b) === 39) {
        const s = suffixEnd(src, n, b + 1);
        t.add(T_CHAR, a, s, 0, b + 1);
        i = s;
        continue;
      }
      let k = 0;
      if (rsEq(src, a, b, "'static")) {
        k = KW_STATIC_LT;
      } else if (rsEq(src, a, b, "'_")) {
        k = KW_UNDERSCORE_LT;
      }
      t.add(T_LIFETIME, a, b, k, b);
      i = b;
      continue;
    }
    if (c === 34) {
      const b = eatDq(src, n, i + 1);
      if (b < 0) {
        t.failed = true;
        return;
      }
      const s = suffixEnd(src, n, b);
      t.add(T_STR, a, s, 0, b);
      i = s;
      continue;
    }
    // Punctuation, glued as rustc_ast's tokens are.
    const d = at(src, n, i + 1);
    const e = at(src, n, i + 2);
    let k = T_UNKNOWN;
    let len = 1;
    if (c === 59) {
      k = T_SEMI;
    } else if (c === 44) {
      k = T_COMMA;
    } else if (c === 46) {
      if (d === 46) {
        if (e === 46) {
          k = T_DOTDOTDOT;
          len = 3;
        } else if (e === 61) {
          k = T_DOTDOTEQ;
          len = 3;
        } else {
          k = T_DOTDOT;
          len = 2;
        }
      } else {
        k = T_DOT;
      }
    } else if (c === 40) {
      k = T_LPAREN;
    } else if (c === 41) {
      k = T_RPAREN;
    } else if (c === 123) {
      k = T_LBRACE;
    } else if (c === 125) {
      k = T_RBRACE;
    } else if (c === 91) {
      k = T_LBRACKET;
    } else if (c === 93) {
      k = T_RBRACKET;
    } else if (c === 64) {
      k = T_AT;
    } else if (c === 35) {
      k = T_POUND;
    } else if (c === 126) {
      k = T_TILDE;
    } else if (c === 63) {
      k = T_QUESTION;
    } else if (c === 58) {
      if (d === 58) {
        k = T_COLONCOLON;
        len = 2;
      } else {
        k = T_COLON;
      }
    } else if (c === 36) {
      k = T_DOLLAR;
    } else if (c === 61) {
      if (d === 61) {
        k = T_EQEQ;
        len = 2;
      } else if (d === 62) {
        k = T_FATARROW;
        len = 2;
      } else {
        k = T_EQ;
      }
    } else if (c === 33) {
      if (d === 61) {
        k = T_NE;
        len = 2;
      } else {
        k = T_NOT;
      }
    } else if (c === 60) {
      if (d === 61) {
        k = T_LE;
        len = 2;
      } else if (d === 60) {
        if (e === 61) {
          k = T_SHLEQ;
          len = 3;
        } else {
          k = T_SHL;
          len = 2;
        }
      } else {
        k = T_LT;
      }
    } else if (c === 62) {
      if (d === 61) {
        k = T_GE;
        len = 2;
      } else if (d === 62) {
        if (e === 61) {
          k = T_SHREQ;
          len = 3;
        } else {
          k = T_SHR;
          len = 2;
        }
      } else {
        k = T_GT;
      }
    } else if (c === 45) {
      if (d === 61) {
        k = T_MINUSEQ;
        len = 2;
      } else if (d === 62) {
        k = T_RARROW;
        len = 2;
      } else {
        k = T_MINUS;
      }
    } else if (c === 38) {
      if (d === 38) {
        k = T_ANDAND;
        len = 2;
      } else if (d === 61) {
        k = T_ANDEQ;
        len = 2;
      } else {
        k = T_AND;
      }
    } else if (c === 124) {
      if (d === 124) {
        k = T_OROR;
        len = 2;
      } else if (d === 61) {
        k = T_OREQ;
        len = 2;
      } else {
        k = T_OR;
      }
    } else if (c === 43) {
      if (d === 61) {
        k = T_PLUSEQ;
        len = 2;
      } else {
        k = T_PLUS;
      }
    } else if (c === 42) {
      if (d === 61) {
        k = T_STAREQ;
        len = 2;
      } else {
        k = T_STAR;
      }
    } else if (c === 94) {
      if (d === 61) {
        k = T_CARETEQ;
        len = 2;
      } else {
        k = T_CARET;
      }
    } else if (c === 37) {
      if (d === 61) {
        k = T_PERCENTEQ;
        len = 2;
      } else {
        k = T_PERCENT;
      }
    }
    if (k === T_UNKNOWN) {
      t.failed = true;
      return;
    }
    const ti = t.nt;
    t.add(k, a, a + len, 0, a + len);
    i = a + len;
    // Delimiter matching.
    if (k === T_LPAREN || k === T_LBRACE || k === T_LBRACKET) {
      stack = growI32(stack, sp + 1);
      stack[sp] = ti;
      sp++;
    } else if (k === T_RPAREN || k === T_RBRACE || k === T_RBRACKET) {
      if (sp === 0) {
        t.failed = true;
        return;
      }
      sp--;
      const o = stack[sp];
      const ok = t.kind[o];
      if ((k === T_RPAREN && ok !== T_LPAREN) || (k === T_RBRACE && ok !== T_LBRACE) || (k === T_RBRACKET && ok !== T_LBRACKET)) {
        t.failed = true;
        return;
      }
      t.match[o] = ti;
      t.match[ti] = o;
    }
  }
  if (sp !== 0) {
    t.failed = true;
    return;
  }
  t.add(T_EOF, n, n, 0, n);
};

const eatExponent = (src: u8[], n: i32, i0: i32): i32 => {
  let i = i0;
  const c = at(src, n, i);
  if (c === 43 || c === 45) {
    i++;
  }
  return eatDigits(src, n, i, false);
};

/** The end of the (nested) block comment that starts at `i`, or -1 when it is not closed. */
export const skipBlockComment = (src: u8[], n: i32, i0: i32): i32 => {
  let i = i0 + 2;
  let depth = 1;
  while (i < n) {
    const c = toI32(src[i]);
    if (c === 47 && at(src, n, i + 1) === 42) {
      depth++;
      i += 2;
    } else if (c === 42 && at(src, n, i + 1) === 47) {
      depth--;
      i += 2;
      if (depth === 0) {
        return i;
      }
    } else {
      i++;
    }
  }
  return -1;
};
