// SwiftFormat's tokenize(): source bytes to tokens, with its fix-ups for
// generics, operators, regex literals, string interpolation and comments.
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import {
  SW_COMMENT,
  SW_DELIM,
  SW_END,
  SW_ERROR,
  SW_IDENT,
  SW_KEYWORD,
  SW_LINEBREAK,
  SW_NUMBER,
  SW_NUM_BINARY,
  SW_NUM_DECIMAL,
  SW_NUM_HEX,
  SW_NUM_INTEGER,
  SW_NUM_OCTAL,
  SW_OP,
  SW_OP_INFIX,
  SW_OP_NONE,
  SW_OP_POSTFIX,
  SW_OP_PREFIX,
  SW_SPACE,
  SW_START,
  SW_STRBODY,
  SW_T_KEYWORD,
  SW_T_LINEBREAK,
  SW_T_NON_SPACE_OR_COMMENT,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
  SW_T_OPERATOR,
  SW_T_START_OF_SCOPE,
  SwTokList,
  swIsEndOfScopeOf,
  swIsLvalue,
  swIsMultilineStringDelimiter,
  swIsRvalue,
  swIsStringDelimiter,
  swIsSwiftKeyword,
  swKindIsComment,
  swStringDelimiterType,
  swTokIs,
} from "./token";

/** The code point at byte `p` (the source is valid UTF-8), or -1 at the end. */
export const swCpAt = (src: u8[], n: i32, p: i32): i32 => {
  if (p >= n) {
    return -1;
  }
  const c = toI32(src[p]);
  if (c < 0x80) {
    return c;
  }
  if (c < 0xe0) {
    return ((c & 0x1f) << 6) | (toI32(src[p + 1]) & 0x3f);
  }
  if (c < 0xf0) {
    return ((c & 0x0f) << 12) | ((toI32(src[p + 1]) & 0x3f) << 6) | (toI32(src[p + 2]) & 0x3f);
  }
  return ((c & 0x07) << 18) | ((toI32(src[p + 1]) & 0x3f) << 12) | ((toI32(src[p + 2]) & 0x3f) << 6) | (toI32(src[p + 3]) & 0x3f);
};

/** The byte length of the UTF-8 sequence starting with byte `c`. */
export const swCpLen = (c: i32): i32 => (c < 0x80 ? 1 : c < 0xe0 ? 2 : c < 0xf0 ? 3 : 4);

/** Whether `src[0, n)` is valid UTF-8. */
export const swValidUtf8 = (src: u8[], n: i32): boolean => {
  let i = 0;
  while (i < n) {
    const c = toI32(src[i]);
    if (c < 0x80) {
      i++;
      continue;
    }
    let k = 0;
    if (c >= 0xc2 && c < 0xe0) {
      k = 1;
    } else if (c >= 0xe0 && c < 0xf0) {
      k = 2;
    } else if (c >= 0xf0 && c < 0xf5) {
      k = 3;
    } else {
      return false;
    }
    for (let j = 1; j <= k; j++) {
      if (i + j >= n) {
        return false;
      }
      if ((toI32(src[i + j]) & 0xc0) !== 0x80) {
        return false;
      }
    }
    if (k === 2) {
      const v = swCpAt(src, n, i);
      if (v < 0x800 || (v >= 0xd800 && v < 0xe000)) {
        return false;
      }
    } else if (k === 3) {
      const v = swCpAt(src, n, i);
      if (v < 0x10000 || v > 0x10ffff) {
        return false;
      }
    }
    i += k + 1;
  }
  return true;
};

/** UnicodeScalar.isSpace. */
export const swCpIsSpace = (c: i32): boolean =>
  c === 0x09 ||
  c === 0x11 ||
  c === 0x12 ||
  c === 0x20 ||
  c === 0x85 ||
  c === 0xa0 ||
  c === 0x1680 ||
  (c >= 0x2000 && c <= 0x200a) ||
  c === 0x2028 ||
  c === 0x2029 ||
  c === 0x202f ||
  c === 0x205f ||
  c === 0x3000;

/** UnicodeScalar.isLinebreak. */
export const swCpIsLinebreak = (c: i32): boolean => c === 10 || c === 13 || c === 11 || c === 12;

const swCpIsDigit = (c: i32): boolean => c >= 48 && c <= 57;

const swCpIsHexDigit = (c: i32): boolean => (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);

/** parseOperator's isHead. */
const swOpHead = (c: i32): boolean => {
  if (c < 0x80) {
    return (
      c === 46 || c === 47 || c === 92 || c === 61 || c === 45 || c === 43 || c === 33 || c === 42 || c === 37 || c === 38 || c === 124 || c === 94 || c === 126 || c === 63
    );
  }
  return (
    c === 0xad ||
    (c >= 0xa1 && c <= 0xa7) ||
    c === 0xa9 ||
    c === 0xab ||
    c === 0xac ||
    c === 0xae ||
    (c >= 0xb0 && c <= 0xb1) ||
    c === 0xb6 ||
    c === 0xbb ||
    c === 0xbf ||
    c === 0xd7 ||
    c === 0xf7 ||
    (c >= 0x2016 && c <= 0x2017) ||
    (c >= 0x2020 && c <= 0x2027) ||
    (c >= 0x2030 && c <= 0x203e) ||
    (c >= 0x2041 && c <= 0x2053) ||
    (c >= 0x2055 && c <= 0x205e) ||
    (c >= 0x2190 && c <= 0x23ff) ||
    (c >= 0x2500 && c <= 0x2775) ||
    (c >= 0x2794 && c <= 0x2bff) ||
    (c >= 0x2e00 && c <= 0x2e7f) ||
    (c >= 0x3001 && c <= 0x3003) ||
    (c >= 0x3008 && c <= 0x3030)
  );
};

/** parseOperator's isTail. */
const swOpTail = (c: i32): boolean => {
  if (swOpHead(c)) {
    return true;
  }
  return (
    (c >= 0x0300 && c <= 0x036f) ||
    (c >= 0x1dc0 && c <= 0x1dff) ||
    (c >= 0x20d0 && c <= 0x20ff) ||
    (c >= 0xfe00 && c <= 0xfe0f) ||
    (c >= 0xfe20 && c <= 0xfe2f) ||
    (c >= 0xe0100 && c <= 0xe01ef) ||
    c === 62
  );
};

/** parseIdentifier's isHead. */
export const swIdentHead = (c: i32): boolean => {
  if (c < 0x80) {
    return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36;
  }
  return (
    c === 0xa8 ||
    c === 0xaa ||
    c === 0xad ||
    c === 0xaf ||
    (c >= 0xb2 && c <= 0xb5) ||
    (c >= 0xb7 && c <= 0xba) ||
    (c >= 0xbc && c <= 0xbe) ||
    (c >= 0xc0 && c <= 0xd6) ||
    (c >= 0xd8 && c <= 0xf6) ||
    (c >= 0xf8 && c <= 0xff) ||
    (c >= 0x100 && c <= 0x2ff) ||
    (c >= 0x370 && c <= 0x167f) ||
    (c >= 0x1681 && c <= 0x180d) ||
    (c >= 0x180f && c <= 0x1dbf) ||
    (c >= 0x1e00 && c <= 0x1fff) ||
    (c >= 0x200b && c <= 0x200d) ||
    (c >= 0x202a && c <= 0x202e) ||
    (c >= 0x203f && c <= 0x2040) ||
    c === 0x2054 ||
    (c >= 0x2060 && c <= 0x206f) ||
    (c >= 0x2070 && c <= 0x20cf) ||
    (c >= 0x2100 && c <= 0x218f) ||
    (c >= 0x2460 && c <= 0x24ff) ||
    (c >= 0x2776 && c <= 0x2793) ||
    (c >= 0x2c00 && c <= 0x2dff) ||
    (c >= 0x2e80 && c <= 0x2fff) ||
    (c >= 0x3004 && c <= 0x3007) ||
    (c >= 0x3021 && c <= 0x302f) ||
    (c >= 0x3031 && c <= 0x303f) ||
    (c >= 0x3040 && c <= 0xd7ff) ||
    (c >= 0xf900 && c <= 0xfd3d) ||
    (c >= 0xfd40 && c <= 0xfdcf) ||
    (c >= 0xfdf0 && c <= 0xfe1f) ||
    (c >= 0xfe30 && c <= 0xfe44) ||
    (c >= 0xfe47 && c <= 0xfffd) ||
    (c >= 0x10000 && (c & 0xffff) <= 0xfffd && c <= 0xefffd)
  );
};

/** parseIdentifier's isTail. */
export const swIdentTail = (c: i32): boolean =>
  (c >= 48 && c <= 57) ||
  (c >= 0x0300 && c <= 0x036f) ||
  (c >= 0x1dc0 && c <= 0x1dff) ||
  (c >= 0x20d0 && c <= 0x20ff) ||
  (c >= 0xfe20 && c <= 0xfe2f) ||
  swIdentHead(c);

/** The tokenizer's state: the source, the read position and the tokens so far. */
class SwLexer {
  src: u8[];
  n: i32;
  p: i32 = 0;
  t: SwTokList;
  stack: i32[];
  closed: i32[];
  line: i32 = 1;
  // The token parseToken read.
  tk: i32 = 0;
  ts: string = "";
  ta: i32 = 0;
  // Pending comment body and space ([start, end) of the source, -1 for none).
  cS: i32 = -1;
  cE: i32 = -1;
  spS: i32 = -1;
  spE: i32 = -1;

  constructor(src: u8[], n: i32) {
    this.src = src;
    this.n = n;
    this.t = new SwTokList();
    this.stack = [];
    this.closed = [];
  }

  first(): i32 {
    return swCpAt(this.src, this.n, this.p);
  }

  adv(): void {
    this.p += swCpLen(toI32(this.src[this.p]));
  }

  read(c: i32): boolean {
    if (this.p < this.n && this.first() === c) {
      this.adv();
      return true;
    }
    return false;
  }

  readStr(s: string): boolean {
    const k = toI32(s.length);
    if (this.p + k > this.n) {
      return false;
    }
    for (let i = 0; i < k; i++) {
      if (toI32(this.src[this.p + i]) !== s.charCodeAt(i)) {
        return false;
      }
    }
    this.p += k;
    return true;
  }

  /** readString with a run of `h` hashes. */
  readHashes(h: i32): boolean {
    if (this.p + h > this.n) {
      return false;
    }
    for (let i = 0; i < h; i++) {
      if (toI32(this.src[this.p + i]) !== 35) {
        return false;
      }
    }
    this.p += h;
    return true;
  }

  str(a: i32, b: i32): string {
    return String.fromBytes(this.src, a, b);
  }

  set(k: i32, a: i32, b: i32, x: i32): boolean {
    this.tk = k;
    this.ts = this.str(a, b);
    this.ta = x;
    return true;
  }

  last(): i32 {
    return this.t.count() - 1;
  }
}

const swSpanWhile = (lx: SwLexer, kind: i32): i32 => {
  // kind 0: isSpace; 1: not space or linebreak; 2: digit; 3: hex digit; 4: 0/1; 5: octal; 6: digit or _ ...
  const start = lx.p;
  while (lx.p < lx.n) {
    const c = lx.first();
    let ok = false;
    if (kind === 0) {
      ok = swCpIsSpace(c);
    } else if (kind === 1) {
      ok = !(swCpIsSpace(c) || swCpIsLinebreak(c));
    } else if (kind === 2) {
      ok = c === 35;
    }
    if (!ok) {
      break;
    }
    lx.adv();
  }
  return start;
};

/** readNumber(where: head): a head character then heads or `_`. kind 0 digit, 1 hex, 2 binary, 3 octal. */
const swNumHead = (kind: i32, c: i32): boolean => {
  if (kind === 0) {
    return swCpIsDigit(c);
  }
  if (kind === 1) {
    return swCpIsHexDigit(c);
  }
  if (kind === 2) {
    return c === 48 || c === 49;
  }
  return c >= 48 && c <= 55;
};

const swReadNumber = (lx: SwLexer, kind: i32): boolean => {
  if (lx.p >= lx.n || !swNumHead(kind, lx.first())) {
    return false;
  }
  lx.adv();
  while (lx.p < lx.n) {
    const c = lx.first();
    if (!(swNumHead(kind, c) || c === 95)) {
      break;
    }
    lx.adv();
  }
  return true;
};

const swReadSign = (lx: SwLexer): void => {
  const c = lx.first();
  if (c === 45 || c === 43) {
    lx.adv();
  }
};

const swReadToEndOfToken = (lx: SwLexer): void => {
  swSpanWhile(lx, 1);
};

const swParseNumber = (lx: SwLexer): boolean => {
  const start = lx.p;
  if (!swReadNumber(lx, 0)) {
    return false;
  }
  if (lx.p - start === 1 && toI32(lx.src[start]) === 48) {
    if (lx.read(120)) {
      // 0x
      const hs = lx.p;
      if (swReadNumber(lx, 1)) {
        const c = lx.first();
        if (c === 112 || c === 80) {
          lx.adv();
          swReadSign(lx);
          if (swReadNumber(lx, 0)) {
            return lx.set(SW_NUMBER, start, lx.p, SW_NUM_HEX);
          }
          swReadToEndOfToken(lx);
          return lx.set(SW_ERROR, start, lx.p, 0);
        }
        const endOfHex = lx.p;
        if (lx.read(46)) {
          const fs = lx.p;
          if (swReadNumber(lx, 1)) {
            const c2 = lx.first();
            if (c2 === 112 || c2 === 80) {
              lx.adv();
              swReadSign(lx);
              if (swReadNumber(lx, 0)) {
                return lx.set(SW_NUMBER, start, lx.p, SW_NUM_HEX);
              }
              swReadToEndOfToken(lx);
              return lx.set(SW_ERROR, start, lx.p, 0);
            }
            if (swCpIsDigit(toI32(lx.src[fs]))) {
              swReadToEndOfToken(lx);
              return lx.set(SW_ERROR, start, lx.p, 0);
            }
          }
        }
        lx.p = endOfHex;
        return lx.set(SW_NUMBER, start, lx.p, SW_NUM_HEX);
      }
      lx.p = hs;
      swReadToEndOfToken(lx);
      return lx.set(SW_ERROR, start, lx.p, 0);
    } else if (lx.read(98)) {
      if (swReadNumber(lx, 2)) {
        return lx.set(SW_NUMBER, start, lx.p, SW_NUM_BINARY);
      }
      swReadToEndOfToken(lx);
      return lx.set(SW_ERROR, start, lx.p, 0);
    } else if (lx.read(111)) {
      if (swReadNumber(lx, 3)) {
        return lx.set(SW_NUMBER, start, lx.p, SW_NUM_OCTAL);
      }
      swReadToEndOfToken(lx);
      return lx.set(SW_ERROR, start, lx.p, 0);
    }
  }
  let type = SW_NUM_INTEGER;
  const endOfInt = lx.p;
  if (lx.read(46) && swReadNumber(lx, 0)) {
    type = SW_NUM_DECIMAL;
  } else {
    lx.p = endOfInt;
  }
  const endOfFloat = lx.p;
  const e = lx.first();
  if (e === 101 || e === 69) {
    lx.adv();
    swReadSign(lx);
    if (swReadNumber(lx, 0)) {
      type = SW_NUM_DECIMAL;
    } else {
      lx.p = endOfFloat;
    }
  }
  return lx.set(SW_NUMBER, start, lx.p, type);
};

/** read(head: isHead, tail: isTail) for identifiers; answers whether one was read. */
const swReadIdentifier = (lx: SwLexer): boolean => {
  if (lx.p >= lx.n || !swIdentHead(lx.first())) {
    return false;
  }
  lx.adv();
  while (lx.p < lx.n && swIdentTail(lx.first())) {
    lx.adv();
  }
  return true;
};

const swParseStartOfString = (lx: SwLexer): boolean => {
  const s0 = lx.p;
  if (!lx.read(34)) {
    return false;
  }
  const start = lx.p;
  if (lx.readStr('""')) {
    const c = lx.first();
    if (c < 0 || swCpIsSpace(c) || swCpIsLinebreak(c)) {
      return lx.set(SW_START, s0, lx.p, 0);
    }
    lx.p = start;
  }
  return lx.set(SW_START, s0, lx.p, 0);
};

const swParseIdentifier = (lx: SwLexer): boolean => {
  const start = lx.p;
  if (lx.read(96)) {
    // `raw identifier`
    const rs = lx.p;
    while (lx.p < lx.n) {
      const c = lx.first();
      if (c === 0x60 || c === 0x5c || c === 0x0d || c === 0x0a || c === 0 || (c >= 1 && c <= 0x1f) || c === 0x7f) {
        break;
      }
      lx.adv();
    }
    if (lx.p > rs && lx.read(96)) {
      return lx.set(SW_IDENT, start, lx.p, 0);
    }
    lx.p = start;
  } else if (lx.read(60)) {
    if (lx.read(35)) {
      // <#placeholder#>
      let prevWasHash = false;
      let i = lx.p;
      let found = false;
      while (i < lx.n) {
        const c = swCpAt(lx.src, lx.n, i);
        i += swCpLen(toI32(lx.src[i]));
        if (c === 62) {
          if (prevWasHash) {
            found = true;
            break;
          }
        } else {
          prevWasHash = c === 35;
        }
      }
      if (found) {
        lx.p = i;
        return lx.set(SW_IDENT, start, lx.p, 0);
      }
    }
    lx.p = start;
  } else if (lx.read(35)) {
    const is = lx.p;
    if (swReadIdentifier(lx)) {
      const id = lx.str(is, lx.p);
      if (id === "if") {
        return lx.set(SW_START, start, lx.p, 0);
      }
      if (id === "endif") {
        return lx.set(SW_END, start, lx.p, 0);
      }
      return lx.set(SW_KEYWORD, start, lx.p, 0);
    }
    swSpanWhile(lx, 2);
    if (swParseStartOfString(lx)) {
      return lx.set(SW_START, start, lx.p, 0);
    }
    if (lx.read(47)) {
      return lx.set(SW_START, start, lx.p, 0);
    }
    lx.p = start;
  } else if (lx.read(64)) {
    if (swReadIdentifier(lx)) {
      return lx.set(SW_KEYWORD, start, lx.p, 0);
    }
    lx.p = start;
  } else if (swReadIdentifier(lx)) {
    lx.set(SW_IDENT, start, lx.p, 0);
    if (swIsSwiftKeyword(lx.ts)) {
      lx.tk = SW_KEYWORD;
    }
    return true;
  }
  return false;
};

const swParseOperator = (lx: SwLexer): boolean => {
  const s0 = lx.p;
  if (lx.readStr("::")) {
    return lx.set(SW_OP, s0, lx.p, SW_OP_NONE);
  }
  let start = lx.p;
  if (lx.p >= lx.n || !swOpHead(lx.first())) {
    return false;
  }
  let tail = lx.first();
  lx.adv();
  if (tail === 47) {
    const f = lx.first();
    if (f !== 42 && f !== 47) {
      return lx.set(SW_OP, s0, lx.p, SW_OP_NONE);
    }
    start = lx.p;
  } else if (tail === 63 || tail === 33 || tail === 92) {
    return lx.set(SW_OP, s0, lx.p, SW_OP_NONE);
  } else {
    start = lx.p;
  }
  // head is [s0, tailStart); tail is the character at tailStart.
  let tailStart = s0;
  const headWasDot = tail === 46;
  while (lx.p < lx.n) {
    const c = lx.first();
    if (!(swOpTail(c) && (headWasDot || c !== 46))) {
      break;
    }
    const cStart = lx.p;
    lx.adv();
    if (tail === 47) {
      if (c === 42) {
        if (tailStart === s0) {
          return lx.set(SW_START, s0, lx.p, 0);
        }
        lx.p = start;
        return lx.set(SW_OP, s0, tailStart, SW_OP_NONE);
      }
      if (c === 47) {
        if (tailStart === s0) {
          return lx.set(SW_START, s0, lx.p, 0);
        }
        lx.p = start;
        return lx.set(SW_OP, s0, tailStart, SW_OP_NONE);
      }
    }
    if (c !== 47) {
      start = lx.p;
    }
    tailStart = cStart;
    tail = c;
  }
  return lx.set(SW_OP, s0, lx.p, SW_OP_NONE);
};

const swParseToken = (lx: SwLexer): boolean => {
  if (lx.p >= lx.n) {
    return false;
  }
  const s0 = lx.p;
  const c = lx.first();
  // parseSpace
  if (swCpIsSpace(c)) {
    swSpanWhile(lx, 0);
    return lx.set(SW_SPACE, s0, lx.p, 0);
  }
  // parseLineBreak
  if (c === 13) {
    lx.adv();
    lx.read(10);
    return lx.set(SW_LINEBREAK, s0, lx.p, 0);
  }
  if (c === 10 || c === 11 || c === 12) {
    lx.adv();
    return lx.set(SW_LINEBREAK, s0, lx.p, 0);
  }
  if (swParseNumber(lx)) {
    return true;
  }
  if (swParseIdentifier(lx)) {
    return true;
  }
  if (swParseOperator(lx)) {
    return true;
  }
  // parseDelimiter
  if (c === 58 || c === 59 || c === 44) {
    lx.adv();
    return lx.set(SW_DELIM, s0, lx.p, 0);
  }
  // parseStartOfScope
  if (swParseStartOfString(lx)) {
    return true;
  }
  if (c === 60 || c === 40 || c === 91 || c === 123) {
    lx.adv();
    return lx.set(SW_START, s0, lx.p, 0);
  }
  // parseEndOfScope
  if (c === 125 || c === 93 || c === 41 || c === 62) {
    lx.adv();
    return lx.set(SW_END, s0, lx.p, 0);
  }
  swReadToEndOfToken(lx);
  return lx.set(SW_ERROR, s0, lx.p, 0);
};

// --- tokenize()'s nested functions ---

const swIs = (lx: SwLexer, i: i32, type: i32): boolean => swTokIs(lx.t.k[i], lx.t.s[i], lx.t.a[i], type);

/** index(of:before:) — the tokenizer's plain linear search. */
const swLxIndexBefore = (lx: SwLexer, type: i32, index: i32): i32 => {
  let i = index - 1;
  while (i >= 0) {
    if (swIs(lx, i, type)) {
      return i;
    }
    i--;
  }
  return -1;
};

const swLxIndexAfter = (lx: SwLexer, type: i32, index: i32): i32 => {
  let i = index + 1;
  const n = lx.t.count();
  while (i < n) {
    if (swIs(lx, i, type)) {
      return i;
    }
    i++;
  }
  return -1;
};

const swLxIsTok = (lx: SwLexer, i: i32, k: i32, s: string): boolean => lx.t.k[i] === k && lx.t.s[i] === s;

const swStackLast = (lx: SwLexer): i32 => {
  const m = toI32(lx.stack.length);
  return m === 0 ? -1 : lx.stack[m - 1];
};

const swProcessLinebreak = (lx: SwLexer, s0: i32): void => {
  // `char` was read at s0; a \r\n pair is one linebreak.
  if (toI32(lx.src[s0]) === 13 && lx.read(10)) {
    lx.t.push(SW_LINEBREAK, "\r\n", lx.line);
  } else {
    lx.t.push(SW_LINEBREAK, "\n", lx.line);
  }
  lx.line = lx.line + 1;
};

const swProcessStringBodyRegex = (lx: SwLexer, regex: boolean, hashCount: i32): void => {
  const sS = lx.p; // the string so far is [sS, lx.p) minus the current character
  let escaped = false;
  let parenDepth = 0;
  let classDepth = 0;
  const delimiter = regex ? 47 : 34;
  while (lx.p < lx.n) {
    const cS = lx.p;
    const c = lx.first();
    lx.adv();
    if (c === 92 && !escaped) {
      const save = lx.p;
      if (lx.readHashes(hashCount)) {
        escaped = true;
        continue;
      }
      lx.p = save;
    }
    if (c === delimiter && !escaped) {
      const save = lx.p;
      if (lx.readHashes(hashCount)) {
        if (regex && hashCount === 0) {
          const f = lx.first();
          let lastSpace = false;
          if (cS > sS) {
            // the last scalar of the string
            let q = cS - 1;
            while (q > sS && (toI32(lx.src[q]) & 0xc0) === 0x80) {
              q--;
            }
            lastSpace = swCpIsSpace(swCpAt(lx.src, lx.n, q));
          }
          if (f === 47 || f === 42 || lastSpace) {
            // Encountered a comment, so this isn't a regex literal after all
            return;
          }
        }
        if (cS > sS) {
          lx.t.push(SW_STRBODY, lx.str(sS, cS), 0);
        }
        lx.t.push(SW_END, lx.str(cS, lx.p), 0);
        lx.stack.pop();
        return;
      }
      lx.p = save;
    }
    if (c === 40 && escaped && !regex) {
      if (cS > sS) {
        lx.t.push(SW_STRBODY, lx.str(sS, cS), 0);
      }
      lx.stack.push(lx.t.count());
      lx.t.push(SW_START, "(", 0);
      return;
    }
    if (c === 13 || c === 10) {
      if (cS > sS) {
        lx.t.push(SW_STRBODY, lx.str(sS, cS), 0);
      }
      lx.t.push(SW_ERROR, "", 0);
      swProcessLinebreak(lx, cS);
      if (!regex) {
        lx.stack.pop();
      }
      return;
    }
    if (regex && hashCount === 0 && !escaped) {
      if (c === 91) {
        classDepth++;
      } else if (c === 93 && classDepth > 0) {
        classDepth--;
      } else if (c === 40 && classDepth === 0) {
        parenDepth++;
      } else if (c === 41 && classDepth === 0) {
        parenDepth--;
        if (parenDepth < 0) {
          return;
        }
      }
    }
    escaped = false;
  }
  if (lx.p > sS) {
    lx.t.push(SW_STRBODY, lx.str(sS, lx.p), 0);
  }
};

const swProcessMultilineStringBody = (lx: SwLexer, regex: boolean, hashCount: i32): void => {
  let sS = lx.p;
  let escaped = false;
  const delimiter = regex ? 47 : 34;
  while (lx.p < lx.n) {
    const cS = lx.p;
    const c = lx.first();
    lx.adv();
    if (c === 92 && !escaped) {
      const save = lx.p;
      if (lx.readHashes(hashCount)) {
        escaped = true;
        continue;
      }
      lx.p = save;
    }
    if (c === delimiter && !escaped) {
      const save = lx.p;
      let ok = true;
      if (!regex) {
        ok = lx.readStr('""');
      }
      if (ok && lx.readHashes(hashCount)) {
        if (cS > sS) {
          lx.t.push(regex ? SW_STRBODY : SW_ERROR, lx.str(sS, cS), 0);
        }
        swFixMultilineStringIndent(lx);
        lx.t.push(SW_END, lx.str(cS, lx.p), 0);
        lx.stack.pop();
        return;
      }
      lx.p = save;
    }
    if (c === 40 && escaped && !regex) {
      if (cS > sS) {
        lx.t.push(SW_STRBODY, lx.str(sS, cS), 0);
      }
      lx.stack.push(lx.t.count());
      lx.t.push(SW_START, "(", 0);
      return;
    }
    if (c === 13 || c === 10) {
      // string != "" || tokens.last(where: { !$0.isSpace })?.isLinebreak
      let lastNonSpaceIsLinebreak = false;
      for (let i = lx.t.count() - 1; i >= 0; i--) {
        if (lx.t.k[i] !== SW_SPACE) {
          lastNonSpaceIsLinebreak = lx.t.k[i] === SW_LINEBREAK;
          break;
        }
      }
      if (cS > sS || lastNonSpaceIsLinebreak) {
        lx.t.push(SW_STRBODY, lx.str(sS, cS), 0);
      }
      swProcessLinebreak(lx, cS);
      const sp = lx.p;
      swSpanWhile(lx, 0);
      if (lx.p > sp) {
        lx.t.push(SW_SPACE, lx.str(sp, lx.p), 0);
      }
      sS = lx.p;
      escaped = false;
      continue;
    }
    escaped = false;
  }
  if (lx.p > sS) {
    lx.t.push(SW_STRBODY, lx.str(sS, lx.p), 0);
  }
};

/** The multiline string literal's indent fix-up, before its closing delimiter is appended. */
const swFixMultilineStringIndent = (lx: SwLexer): void => {
  const t = lx.t;
  const offsetStack: string[] = [""];
  const lastI = t.count() - 1;
  if (t.k[lastI] === SW_SPACE) {
    offsetStack[0] = t.s[lastI];
  }
  const from = swStackLast(lx);
  for (let index = t.count() - 2; index >= from; index--) {
    const nk = t.k[index + 1];
    const ns = t.s[index + 1];
    const nextIsMulti = swIsMultilineStringDelimiter(nk, ns);
    if (!(t.k[index] === SW_SPACE && t.k[index - 1] === SW_LINEBREAK && ((nextIsMulti && nk === SW_END) || nk === SW_STRBODY))) {
      if (nextIsMulti && nk === SW_START) {
        offsetStack.pop();
      }
      continue;
    }
    const indent = t.s[index];
    if (nextIsMulti && nk === SW_END) {
      offsetStack.push(indent);
    }
    const m = toI32(offsetStack.length);
    const offset = m === 0 ? "" : offsetStack[m - 1];
    if (!(offset.length === 0 || indent.startsWith(offset))) {
      t.set(index, SW_ERROR, indent, 0);
      break;
    }
    const remainder = indent.substring(toI32(offset.length));
    if (nk === SW_STRBODY) {
      t.set(index + 1, SW_STRBODY, remainder + ns, 0);
    } else if (remainder.length !== 0) {
      t.insertAt(index + 1, SW_STRBODY, remainder, 0);
    }
    if (offset.length === 0) {
      t.removeAt(index);
    } else {
      t.set(index, SW_SPACE, offset, 0);
    }
  }
};

const swProcessStringBody = (lx: SwLexer, dt: i32): void => {
  const regex = (dt & 1) !== 0;
  const hashCount = dt >> 2;
  if ((dt & 2) !== 0) {
    swProcessMultilineStringBody(lx, regex, hashCount);
  } else {
    swProcessStringBodyRegex(lx, regex, hashCount);
  }
};

const swFlushComment = (lx: SwLexer): void => {
  if (lx.cS >= 0) {
    lx.t.push(SW_COMMENT, lx.str(lx.cS, lx.cE), 0);
    lx.cS = -1;
  }
  if (lx.spS >= 0) {
    lx.t.push(SW_SPACE, lx.str(lx.spS, lx.spE), 0);
    lx.spS = -1;
  }
};

/** A non-space comment character [a, b): pending space joins the comment, or becomes a token. */
const swCommentChar = (lx: SwLexer, a: i32, b: i32): void => {
  if (lx.spS >= 0) {
    if (lx.cS < 0) {
      lx.t.push(SW_SPACE, lx.str(lx.spS, lx.spE), 0);
    }
    lx.spS = -1;
  }
  if (lx.cS < 0) {
    lx.cS = a;
  }
  lx.cE = b;
};

const swCommentSpace = (lx: SwLexer, a: i32, b: i32): void => {
  if (lx.spS < 0) {
    lx.spS = a;
  }
  lx.spE = b;
};

const swProcessCommentBody = (lx: SwLexer): void => {
  while (lx.p < lx.n) {
    const c = lx.first();
    if (c === 13 || c === 10) {
      break;
    }
    const a = lx.p;
    lx.adv();
    if (swCpIsSpace(c)) {
      swCommentSpace(lx, a, lx.p);
      continue;
    }
    swCommentChar(lx, a, lx.p);
  }
  swFlushComment(lx);
};

const swCountScalars = (s: string): i32 => {
  let n = 0;
  const k = toI32(s.length);
  for (let i = 0; i < k; i++) {
    if ((s.charCodeAt(i) & 0xc0) !== 0x80) {
      n++;
    }
  }
  return n;
};

/** String.dropFirst(k scalars). */
const swDropScalars = (s: string, k: i32): string => {
  let i = 0;
  let m = 0;
  const n = toI32(s.length);
  while (i < n && m < k) {
    i++;
    while (i < n && (s.charCodeAt(i) & 0xc0) === 0x80) {
      i++;
    }
    m++;
  }
  return s.substring(i);
};

const swProcessMultilineCommentBody = (lx: SwLexer): void => {
  const t = lx.t;
  while (lx.p < lx.n) {
    const a = lx.p;
    const c = lx.first();
    lx.adv();
    if (c === 47 && lx.read(42)) {
      swFlushComment(lx);
      lx.stack.push(t.count());
      t.push(SW_START, "/*", 0);
      continue;
    }
    if (c === 42 && lx.read(47)) {
      swFlushComment(lx);
      t.push(SW_END, "*/", 0);
      // Fix up indents
      let baseIndent = "";
      let baseLen = 0;
      const lo = swStackLast(lx) + 1;
      const hi = t.count() - 1;
      for (let index = lo; index < hi; index++) {
        if (t.k[index - 1] !== SW_LINEBREAK) {
          continue;
        }
        if (t.k[index] === SW_SPACE) {
          const nk = t.k[index + 1];
          if (nk === SW_COMMENT || (nk === SW_END && t.s[index + 1] === "*/")) {
            const len = swCountScalars(t.s[index]);
            if (baseIndent.length === 0 || len < baseLen) {
              baseIndent = t.s[index];
              baseLen = len;
            }
          }
        } else if (t.k[index] === SW_COMMENT) {
          baseIndent = "";
          baseLen = 0;
          break;
        }
      }
      for (let index = hi - 1; index >= lo; index--) {
        if (!(t.k[index] === SW_SPACE && t.k[index - 1] === SW_LINEBREAK && t.s[index].startsWith(baseIndent))) {
          continue;
        }
        const indent = t.s[index];
        const nk = t.k[index + 1];
        const ns = t.s[index + 1];
        if (nk === SW_COMMENT) {
          t.set(index + 1, SW_COMMENT, swDropScalars(indent, baseLen) + ns, 0);
        } else if ((nk === SW_START && ns === "/*") || (nk === SW_END && ns === "*/")) {
          if (swCountScalars(indent) > baseLen) {
            t.insertAt(index + 1, SW_COMMENT, swDropScalars(indent, baseLen), 0);
          }
        } else {
          continue;
        }
        if (baseIndent.length === 0) {
          t.removeAt(index);
        } else {
          t.set(index, SW_SPACE, baseIndent, 0);
        }
      }
      lx.stack.pop();
      const top = swStackLast(lx);
      if (top < 0 || !swLxIsTok(lx, top, SW_START, "/*")) {
        return;
      }
      continue;
    }
    if (c === 13 || c === 10) {
      swFlushComment(lx);
      swProcessLinebreak(lx, a);
      continue;
    }
    if (swCpIsSpace(c)) {
      swCommentSpace(lx, a, lx.p);
      continue;
    }
    swCommentChar(lx, a, lx.p);
  }
  swFlushComment(lx);
};

const swConvertOpeningChevronToOperator = (lx: SwLexer, index: i32): void => {
  for (let j = toI32(lx.stack.length) - 1; j >= 0; j--) {
    if (lx.stack[j] === index) {
      for (let q = j; q < toI32(lx.stack.length) - 1; q++) {
        lx.stack[q] = lx.stack[q + 1];
      }
      lx.stack.pop();
      break;
    }
  }
  lx.t.set(index, SW_OP, "<", SW_OP_NONE);
  swStitchOperators(lx, index);
};

const swConvertClosingChevronToOperator = (lx: SwLexer, i: i32, andOpeningChevron: boolean): void => {
  lx.t.set(i, SW_OP, ">", SW_OP_NONE);
  swStitchOperators(lx, i);
  let scopeIndex = -1;
  if (andOpeningChevron && lx.closed.length !== 0) {
    scopeIndex = lx.closed[0];
    for (let q = 0; q < toI32(lx.closed.length) - 1; q++) {
      lx.closed[q] = lx.closed[q + 1];
    }
    lx.closed.pop();
  }
  const prevIndex = swLxIndexBefore(lx, SW_T_NON_SPACE_OR_COMMENT, i);
  if (prevIndex >= 0 && swLxIsTok(lx, prevIndex, SW_END, ">")) {
    swConvertClosingChevronToOperator(lx, prevIndex, true);
  }
  if (scopeIndex >= 0) {
    swConvertOpeningChevronToOperator(lx, scopeIndex);
  }
};

const swLxIsUnwrapOperator = (lx: SwLexer, index: i32): boolean => {
  const t = lx.t;
  if (t.k[index] === SW_OP && (t.s[index] === "?" || t.s[index] === "!") && index > 0) {
    const pk = t.k[index - 1];
    return !(pk === SW_SPACE || pk === SW_LINEBREAK) && pk !== SW_START;
  }
  return false;
};

const swStackShiftAbove = (lx: SwLexer, index: i32): void => {
  for (let q = 0; q < toI32(lx.stack.length); q++) {
    if (lx.stack[q] > index) {
      lx.stack[q] = lx.stack[q] - 1;
    }
  }
};

const swStitchOperators = (lx: SwLexer, index0: i32): void => {
  const t = lx.t;
  let str = t.s[index0];
  if (index0 > 0 && t.k[index0 - 1] === SW_OP && t.s[index0 - 1] === "\\") {
    if (str === ".?.") {
      t.set(index0, SW_OP, ".", SW_OP_PREFIX);
      t.insertAt(index0 + 1, SW_OP, "?", SW_OP_POSTFIX);
      t.insertAt(index0 + 2, SW_OP, ".", SW_OP_INFIX);
      return;
    }
    if (str === ".?") {
      t.set(index0, SW_OP, ".", SW_OP_PREFIX);
      t.insertAt(index0 + 1, SW_OP, "?", SW_OP_POSTFIX);
      return;
    }
  }
  while (true) {
    if (!(index0 + 1 < t.count())) {
      break;
    }
    if (t.k[index0 + 1] !== SW_OP) {
      break;
    }
    const next = t.s[index0 + 1];
    if (next.startsWith("\\") || !(str.startsWith(".") || next.indexOf(".") < 0)) {
      break;
    }
    if (swStackLast(lx) === index0) {
      lx.stack.pop();
    }
    str = str + next;
    t.set(index0, SW_OP, str, SW_OP_NONE);
    t.removeAt(index0 + 1);
    swStackShiftAbove(lx, index0);
  }
  let index = index0;
  while (true) {
    if (!(index > 0)) {
      break;
    }
    if (t.k[index - 1] !== SW_OP) {
      break;
    }
    const prev = t.s[index - 1];
    if (swLxIsUnwrapOperator(lx, index - 1) || str.startsWith("\\") || !(prev.startsWith(".") || str.indexOf(".") < 0)) {
      break;
    }
    if (swStackLast(lx) === index - 1) {
      lx.stack.pop();
    }
    str = prev + str;
    t.set(index - 1, SW_OP, str, SW_OP_NONE);
    t.removeAt(index);
    swStackShiftAbove(lx, index);
    index--;
  }
  swSetOperatorType(lx, index);
  // Fix ternary that may not have been correctly closed in the first pass
  const scopeIndex = swStackLast(lx);
  if (scopeIndex >= 0 && t.k[scopeIndex] === SW_OP && t.s[scopeIndex] === "?" && t.a[scopeIndex] === SW_OP_INFIX) {
    for (let i = index; i < t.count(); i++) {
      if (t.k[i] === SW_DELIM && t.s[i] === ":") {
        t.set(i, SW_OP, ":", SW_OP_INFIX);
        lx.stack.pop();
        break;
      }
    }
  }
};

const swSetOperatorType = (lx: SwLexer, i0: i32): void => {
  const t = lx.t;
  const str = t.s[i0];
  const currentType = t.a[i0];
  const prevNonSpaceIndex = swLxIndexBefore(lx, SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i0);
  if (prevNonSpaceIndex < 0) {
    if (str === "/") {
      t.set(i0, SW_START, "/", 0);
    } else if (t.count() > i0 + 1) {
      t.set(i0, SW_OP, str, SW_OP_PREFIX);
    }
    return;
  }
  const pk = t.k[prevNonSpaceIndex];
  const ps = t.s[prevNonSpaceIndex];
  const pa = t.a[prevNonSpaceIndex];
  if (pk === SW_KEYWORD && (ps === "func" || ps === "operator")) {
    t.set(i0, SW_OP, str, SW_OP_NONE);
    return;
  }
  const prk = t.k[i0 - 1];
  const prs = t.s[i0 - 1];
  const pra = t.a[i0 - 1];
  const prevIsSpaceOrCommentOrLinebreak = prk === SW_SPACE || prk === SW_LINEBREAK || swKindIsComment(prk, prs);
  let type = SW_OP_NONE;
  if (str === ":" || str === "::" || str === "=" || str === "->") {
    type = SW_OP_INFIX;
  } else if (str === ".") {
    let tp = SW_OP_PREFIX;
    let pni = prevNonSpaceIndex;
    while (true) {
      const qk = t.k[pni];
      const qs = t.s[pni];
      const qa = t.a[pni];
      if (swIsLvalue(qk, qs, qa)) {
        let lineStart = swLxIndexBefore(lx, SW_T_LINEBREAK, pni);
        if (lineStart < 0) {
          lineStart = 0;
        }
        const ls2 = swLxIndexAfter(lx, SW_T_NON_SPACE_OR_COMMENT, lineStart);
        if (ls2 >= 0) {
          lineStart = ls2;
        }
        const lk = t.k[lineStart];
        const lsS = t.s[lineStart];
        let isElse = lk === SW_KEYWORD && (lsS === "#elseif" || lsS === "#else");
        const isIf = lk === SW_START && lsS === "#if";
        if (isElse || isIf) {
          if (isElse) {
            while (true) {
              const start = swLxIndexBefore(lx, SW_T_START_OF_SCOPE, lineStart);
              if (start < 0) {
                break;
              }
              lineStart = start;
              if (swLxIsTok(lx, start, SW_START, "#if")) {
                break;
              }
            }
          }
          isElse = false;
          const prevIndex = swLxIndexBefore(lx, SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, lineStart);
          if (prevIndex < 0) {
            // fallthrough to default
            tp = SW_OP_INFIX;
            break;
          }
          pni = prevIndex;
          continue;
        }
        tp = SW_OP_INFIX;
      } else if ((qk === SW_KEYWORD && qs.startsWith("@")) || (qk === SW_END && qs === "#endif")) {
        tp = SW_OP_INFIX;
      }
      break;
    }
    type = tp;
  } else if (str === "?") {
    if (prevIsSpaceOrCommentOrLinebreak) {
      if (currentType !== SW_OP_INFIX) {
        lx.stack.push(i0);
      }
      type = SW_OP_INFIX;
    } else if (prk !== SW_START) {
      type = SW_OP_POSTFIX;
    } else {
      type = SW_OP_NONE;
    }
  } else if (str === "!" && !prevIsSpaceOrCommentOrLinebreak && prk !== SW_START) {
    type = SW_OP_POSTFIX;
  } else {
    const nextNonSpace = swLxIndexAfter(lx, SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i0);
    if (nextNonSpace < 0) {
      if (
        str === "/" &&
        currentType === SW_OP_NONE &&
        (prk === SW_SPACE ||
          prk === SW_LINEBREAK ||
          (pk === SW_OP && pa === SW_OP_INFIX) ||
          (pk === SW_OP && pa === SW_OP_POSTFIX && (ps === "?" || ps === "!") && prevNonSpaceIndex > 0 && swLxIsTok(lx, prevNonSpaceIndex - 1, SW_KEYWORD, "try")) ||
          (pk === SW_START && (ps === "(" || ps === "[")) ||
          (pk === SW_DELIM && (ps === ":" || ps === ",")) ||
          (pk === SW_KEYWORD && (ps === "try" || ps === "await")))
      ) {
        t.set(i0, SW_START, "/", 0);
        return;
      } else if (swIsLvalue(prk, prs, pra)) {
        type = SW_OP_POSTFIX;
      } else {
        return;
      }
    } else {
      const nk = t.k[i0 + 1];
      const ns = t.s[i0 + 1];
      const na = t.a[i0 + 1];
      if (swIsRvalue(nk, ns, na)) {
        type = swIsLvalue(prk, prs, pra) ? SW_OP_INFIX : SW_OP_PREFIX;
      } else if (swIsLvalue(prk, prs, pra)) {
        type = SW_OP_POSTFIX;
      } else if (
        prevIsSpaceOrCommentOrLinebreak &&
        swIsLvalue(pk, ps, pa) &&
        (nk === SW_SPACE || nk === SW_LINEBREAK || swKindIsComment(nk, ns)) &&
        swIsRvalue(t.k[nextNonSpace], t.s[nextNonSpace], t.a[nextNonSpace])
      ) {
        type = SW_OP_INFIX;
      } else {
        return;
      }
    }
  }
  let i = i0;
  if (type === SW_OP_PREFIX && pk === SW_END && ps === ">") {
    const count = t.count();
    swConvertClosingChevronToOperator(lx, prevNonSpaceIndex, true);
    i -= count - t.count();
  }
  t.set(i, SW_OP, str, type);
};

const swProcessToken = (lx: SwLexer): void => {
  const t = lx.t;
  let count = t.count();
  const tk = t.k[count - 1];
  const ts = t.s[count - 1];
  const ta = t.a[count - 1];
  if (!(tk === SW_SPACE || swKindIsComment(tk, ts)) && tk !== SW_IDENT) {
    const prevIndex = swLxIndexBefore(lx, SW_T_NON_SPACE_OR_COMMENT, count - 1);
    if (prevIndex >= 0 && t.k[prevIndex] === SW_KEYWORD && (t.s[prevIndex] === "consume" || t.s[prevIndex] === "discard")) {
      t.set(prevIndex, SW_IDENT, t.s[prevIndex], 0);
    }
  }
  if (tk === SW_KEYWORD) {
    const prevIndex = swLxIndexBefore(lx, SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, count - 1);
    if (prevIndex >= 0) {
      const pk = t.k[prevIndex];
      const ps = t.s[prevIndex];
      if (
        (pk === SW_OP && ps === ".") ||
        (ts === "await" &&
          pk === SW_KEYWORD &&
          (ps === "func" || ps === "let" || ps === "var" || ps === "class" || ps === "struct" || ps === "enum" || ps === "extension" || ps === "typealias"))
      ) {
        t.set(t.count() - 1, SW_IDENT, ts, 0);
        swProcessToken(lx);
        return;
      }
    }
    if (count > 1 && t.k[count - 2] === SW_NUMBER) {
      t.set(count - 1, SW_ERROR, ts, 0);
    }
  } else if (tk === SW_IDENT) {
    const prevIndex = swLxIndexBefore(lx, SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, count - 1);
    if (prevIndex >= 0 && t.k[prevIndex] === SW_IDENT && (t.s[prevIndex] === "actor" || t.s[prevIndex] === "macro")) {
      const ppi = swLxIndexBefore(lx, SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, prevIndex);
      if (!(ppi >= 0 && t.k[ppi] === SW_OP && t.a[ppi] === SW_OP_INFIX)) {
        t.set(prevIndex, SW_KEYWORD, t.s[prevIndex], 0);
        swProcessToken(lx);
        return;
      }
    }
    if (count > 1 && t.k[count - 2] === SW_NUMBER) {
      t.set(count - 1, SW_ERROR, ts, 0);
    }
  } else if (tk === SW_NUMBER) {
    if (count > 1) {
      if (t.k[count - 2] === SW_NUMBER) {
        t.set(count - 1, SW_ERROR, ts, 0);
      } else if (t.k[count - 2] === SW_OP && t.s[count - 2] === ".") {
        t.set(count - 1, SW_IDENT, ts, 0);
      }
    }
  } else if (tk === SW_OP) {
    swStitchOperators(lx, count - 1);
  } else if (tk === SW_START) {
    if (ts === "<" && count >= 2) {
      if (t.k[count - 2] === SW_OP) {
        const q = swLxIndexBefore(lx, SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, count - 2);
        if (q < 0 || !(t.k[q] === SW_KEYWORD && (t.s[q] === "func" || t.s[q] === "init"))) {
          t.set(t.count() - 1, SW_OP, "<", SW_OP_NONE);
          swStitchOperators(lx, count - 1);
          swProcessToken(lx);
          return;
        }
      }
    }
    lx.closed = [];
  } else if (tk === SW_LINEBREAK) {
    if (ta === 0) {
      t.set(count - 1, SW_LINEBREAK, ts, lx.line);
      lx.line = lx.line + 1;
    } else {
      lx.line = ta + 1;
    }
  }
  if (!(tk === SW_SPACE || tk === SW_LINEBREAK || swKindIsComment(tk, ts))) {
    const prevIndex = swLxIndexBefore(lx, SW_T_NON_SPACE_OR_COMMENT, count - 1);
    if (prevIndex >= 0 && swLxIsTok(lx, prevIndex, SW_END, ">")) {
      // Fix up misidentified generic that is actually a pair of operators
      let stage = 0; // 0: none; 1: the identifier check; 2: convert
      if (tk === SW_OP && ts === "=" && prevIndex === count - 2) {
        let ok = false;
        const startIndex = swLxIndexBefore(lx, SW_T_START_OF_SCOPE, count - 1);
        if (startIndex >= 0 && swLxIsTok(lx, startIndex, SW_START, "<")) {
          const pi = swLxIndexBefore(lx, SW_T_NON_SPACE_OR_COMMENT, startIndex);
          if (pi >= 0 && t.k[pi] === SW_IDENT) {
            const ppi = swLxIndexBefore(lx, SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, pi);
            if (ppi >= 0 && swLxIsTok(lx, ppi, SW_DELIM, ":")) {
              ok = true;
            }
          }
        }
        stage = ok ? 0 : 1;
      } else if (tk === SW_IDENT) {
        stage = 1;
      } else if ((tk === SW_START && swIsStringDelimiter(tk, ts)) || tk === SW_NUMBER) {
        stage = 2;
      }
      if (stage === 1) {
        let ok = false;
        if (lx.closed.length !== 0) {
          const scopeIndex = lx.closed[0];
          const pi = swLxIndexBefore(lx, SW_T_NON_SPACE_OR_COMMENT, scopeIndex);
          if (pi >= 0 && t.k[pi] === SW_KEYWORD && t.s[pi].startsWith("@")) {
            ok = true;
          }
        }
        stage = ok ? 0 : 2;
      }
      if (stage === 2) {
        swConvertClosingChevronToOperator(lx, prevIndex, true);
        swProcessToken(lx);
        return;
      }
    }
    const lastOperatorIndex = swLxIndexBefore(lx, SW_T_OPERATOR, count - 1);
    if (lastOperatorIndex >= 0) {
      swSetOperatorType(lx, lastOperatorIndex);
    }
  }
  // Handle scope
  const scopeIndex = swStackLast(lx);
  if (scopeIndex >= 0) {
    const sk = t.k[scopeIndex];
    const ss = t.s[scopeIndex];
    const sa = t.a[scopeIndex];
    if (swIsEndOfScopeOf(tk, ts, sk, ss, sa)) {
      lx.stack.pop();
      if (tk === SW_DELIM && ts === ":") {
        if (sk === SW_OP && ss === "?" && sa === SW_OP_INFIX) {
          t.set(t.count() - 1, SW_OP, ":", SW_OP_INFIX);
        } else {
          t.set(t.count() - 1, SW_START, ":", 0);
          lx.stack.push(t.count() - 1);
        }
      } else if (tk === SW_END && (ts === "case" || ts === "default")) {
        lx.stack.push(t.count() - 1);
      } else if (tk === SW_END && ts === ")") {
        const top = swStackLast(lx);
        if (top >= 0) {
          const dt = swStringDelimiterType(t.k[top], t.s[top]);
          if (dt >= 0) {
            swProcessStringBody(lx, dt);
          }
        }
      } else if (tk === SW_END && ts === ">") {
        if (sk === SW_START && ss === "<" && scopeIndex === count - 2) {
          swConvertOpeningChevronToOperator(lx, count - 2);
          swProcessToken(lx);
          return;
        }
      }
      if (tk === SW_END && ts === ">") {
        lx.closed.push(0);
        for (let q = toI32(lx.closed.length) - 1; q > 0; q--) {
          lx.closed[q] = lx.closed[q - 1];
        }
        lx.closed[0] = scopeIndex;
      } else {
        lx.closed = [];
      }
      return;
    }
    let genericIndex = -1;
    for (let q = toI32(lx.stack.length) - 1; q >= 0; q--) {
      const si = lx.stack[q];
      if (t.k[si] === SW_START && t.s[si] === "<") {
        genericIndex = si;
        break;
      }
    }
    if (genericIndex >= 0) {
      // We think it's a generic at this point, but could be wrong
      if (tk === SW_OP) {
        let isMinusDigit = false;
        if (ts === "-") {
          const f = lx.first();
          if (f >= 48 && f <= 57) {
            const q = swLxIndexBefore(lx, SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, count - 1);
            if (
              q >= 0 &&
              (swLxIsTok(lx, q, SW_START, "<") || swLxIsTok(lx, q, SW_DELIM, ",") || (t.k[q] === SW_OP && t.s[q] === "==" && t.a[q] === SW_OP_INFIX))
            ) {
              isMinusDigit = true;
            }
          }
        }
        if (!isMinusDigit) {
          let allowed = false;
          if (ts === "." || ts === "==" || ts === "?" || ts === "!" || ts === "&" || ts === "->" || ts === "~" || ts === "::") {
            allowed = swLxIndexBefore(lx, SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, count - 1) !== genericIndex;
          }
          if (!allowed) {
            swConvertOpeningChevronToOperator(lx, genericIndex);
            if (genericIndex > 0 && swLxIsTok(lx, genericIndex - 1, SW_START, "<")) {
              swConvertOpeningChevronToOperator(lx, genericIndex - 1);
            }
          }
        }
      } else if (tk === SW_DELIM && ts === ":" && lx.stack.length > 1) {
        const q = lx.stack[toI32(lx.stack.length) - 2];
        if ((t.k[q] === SW_END && t.s[q] === "case") || (t.k[q] === SW_OP && t.s[q] === "?" && t.a[q] === SW_OP_INFIX)) {
          swConvertOpeningChevronToOperator(lx, genericIndex);
          swProcessToken(lx);
          return;
        }
      } else if (tk === SW_KEYWORD && (ts === "throws" || ts === "repeat" || ts === "let")) {
        // allowed
      } else if ((tk === SW_KEYWORD && !ts.startsWith("@")) || tk === SW_END) {
        swConvertOpeningChevronToOperator(lx, genericIndex);
        swProcessToken(lx);
        return;
      }
    } else if (tk === SW_DELIM && ts === ":") {
      if (sk === SW_START && (ss === "(" || ss === "[")) {
        const prevIndex = swLxIndexBefore(lx, SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, count - 1);
        if (prevIndex >= 0 && (t.k[prevIndex] === SW_IDENT || t.k[prevIndex] === SW_KEYWORD)) {
          if (t.k[prevIndex] === SW_KEYWORD && !t.s[prevIndex].startsWith("@")) {
            t.set(prevIndex, SW_IDENT, t.s[prevIndex], 0);
          }
          const ppi = swLxIndexBefore(lx, SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, prevIndex);
          if (ppi >= 0 && t.k[ppi] === SW_KEYWORD && !t.s[ppi].startsWith("@")) {
            t.set(ppi, SW_IDENT, t.s[ppi], 0);
          }
        }
      }
    } else if (tk === SW_KEYWORD) {
      let sIdx = scopeIndex;
      let stackIndex = toI32(lx.stack.length) - 1;
      while (stackIndex > 0 && swLxIsTok(lx, sIdx, SW_START, "#if")) {
        stackIndex--;
        sIdx = lx.stack[stackIndex];
      }
      const zk = t.k[sIdx];
      const zs = t.s[sIdx];
      if (zk === SW_START && zs === "(") {
        if (sIdx > 0 && t.k[sIdx - 1] === SW_KEYWORD && t.s[sIdx - 1].startsWith("@")) {
          t.set(t.count() - 1, SW_IDENT, ts, 0);
          swProcessToken(lx);
          return;
        }
      } else if (zk === SW_START && (zs === "{" || zs === ":")) {
        if (ts === "default") {
          t.set(t.count() - 1, SW_END, ts, 0);
          swProcessToken(lx);
          return;
        } else if (ts === "case") {
          let isEnum = false;
          let keywordIndex = swLxIndexBefore(lx, SW_T_KEYWORD, sIdx);
          if (keywordIndex >= 0) {
            while (swLxIsTok(lx, keywordIndex, SW_KEYWORD, "where") || swLxIsTok(lx, keywordIndex, SW_KEYWORD, "let")) {
              const prevIndex = swLxIndexBefore(lx, SW_T_KEYWORD, keywordIndex);
              if (prevIndex < 0) {
                break;
              }
              keywordIndex = prevIndex;
            }
            if (swLxIsTok(lx, keywordIndex, SW_KEYWORD, "enum")) {
              isEnum = true;
            }
          }
          if (!isEnum) {
            const prevIndex = swLxIndexBefore(lx, SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, count - 1);
            if (prevIndex >= 0) {
              const pk = t.k[prevIndex];
              const ps = t.s[prevIndex];
              const keep =
                (pk === SW_KEYWORD && (ps === "if" || ps === "guard" || ps === "while" || ps === "for" || ps === "await")) || (pk === SW_DELIM && ps === ",");
              if (!keep) {
                t.set(t.count() - 1, SW_END, ts, 0);
                swProcessToken(lx);
                return;
              }
            }
          }
        }
      }
    } else if (sk === SW_START && ss === ":") {
      if (tk === SW_KEYWORD && (ts === "#else" || ts === "#elseif")) {
        lx.stack.pop();
        return;
      } else if (tk === SW_END && ts === "#endif") {
        lx.stack.pop();
        const top = swStackLast(lx);
        if (top >= 0 && swLxIsTok(lx, top, SW_START, "#if")) {
          lx.stack.pop();
        }
        return;
      }
    }
  }
  // Either there's no scope, or token didn't close it
  count = t.count();
  const k2 = t.k[count - 1];
  const s2 = t.s[count - 1];
  if (k2 === SW_START && s2 === "/") {
    const f = lx.first();
    if (f < 0 || swCpIsSpace(f) || swCpIsLinebreak(f)) {
      // Misidentified as regex
      t.set(count - 1, SW_OP, "/", SW_OP_NONE);
      return;
    }
    lx.stack.push(count - 1);
    const start = lx.p;
    const startLine = lx.line;
    swProcessStringBodyRegex(lx, true, 0);
    if (swStackLast(lx) === count - 1) {
      lx.p = start;
      lx.line = startLine;
      lx.stack.pop();
      t.truncate(count);
      t.set(count - 1, SW_OP, "/", SW_OP_NONE);
      return;
    }
  } else if (k2 === SW_START) {
    lx.stack.push(count - 1);
    if (s2 === "/*") {
      swProcessMultilineCommentBody(lx);
    } else if (s2 === "//") {
      swProcessCommentBody(lx);
    } else {
      const dt = swStringDelimiterType(k2, s2);
      if (dt >= 0) {
        if ((dt & 2) !== 0) {
          const sp = lx.p;
          swSpanWhile(lx, 0);
          if (lx.p > sp) {
            t.push(SW_SPACE, lx.str(sp, lx.p), 0);
          }
        }
        swProcessStringBody(lx, dt);
      }
    }
  } else if (k2 === SW_END && s2 === ">") {
    // Misidentified > as closing generic scope
    swConvertClosingChevronToOperator(lx, count - 1, false);
  } else if (k2 === SW_END) {
    const top = swStackLast(lx);
    if ((s2 === "case" || s2 === "default") && top >= 0 && swLxIsTok(lx, top, SW_START, "#if")) {
      lx.stack.push(count - 1);
      return;
    }
    // Previous scope wasn't closed correctly
    t.set(count - 1, SW_ERROR, s2, 0);
  } else if (k2 === SW_DELIM && s2 === ":") {
    const prevIndex = swLxIndexBefore(lx, SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, count - 1);
    if (prevIndex >= 0 && t.k[prevIndex] === SW_KEYWORD) {
      t.set(prevIndex, SW_IDENT, t.s[prevIndex], 0);
    }
  }
};

/** tokenize(source). The source must be valid UTF-8. */
export const swTokenize = (src: u8[], n: i32): SwTokList => {
  const lx = new SwLexer(src, n);
  // Ignore hashbang at start of file
  if (n >= 2 && toI32(src[0]) === 35 && toI32(src[1]) === 33) {
    lx.p = 2;
    lx.t.push(SW_START, "#!", 0);
    swProcessCommentBody(lx);
  }
  while (swParseToken(lx)) {
    lx.t.push(lx.tk, lx.ts, lx.ta);
    swProcessToken(lx);
  }
  while (true) {
    const scopeIndex = swStackLast(lx);
    if (scopeIndex < 0) {
      break;
    }
    if (swLxIsTok(lx, scopeIndex, SW_START, "<")) {
      swConvertOpeningChevronToOperator(lx, scopeIndex);
    } else if (swLxIsTok(lx, scopeIndex, SW_START, "//")) {
      lx.stack.pop();
    } else {
      const m = lx.t.count();
      if (m > 0 && lx.t.k[m - 1] !== SW_ERROR) {
        lx.t.push(SW_ERROR, "", 0);
      }
      break;
    }
  }
  return lx.t;
};
