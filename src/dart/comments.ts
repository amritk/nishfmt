// dart_style's comment handling: CommentWriter, SourceComment and
// CommentSequence (lib/src/front_end/comment_writer.dart) over the
// scanner's comment arrays.
//
// Ported from dart_style 3.1.14-wip at 5a9534fad9ff, the commit Dart SDK
// 3.14.1 pins (BSD-3-Clause, Copyright the Dart project authors).

import { add32, bytesText, newBools } from "../core/arr";
import { fault } from "../core/fault";
import { C_LINE, DtTokens } from "./scanner";
import { T_SCRIPT } from "./tokens";

// Comment types.
export const CT_DOC: i32 = 0;
export const CT_LINE: i32 = 1;
export const CT_BLOCK: i32 = 2;
export const CT_INLINE_BLOCK: i32 = 3;

/** A comment in the source: its trimmed text and a little context. */
export class DtComment {
  text: string;
  type: i32;
  flushLeft: boolean;
  offset: i32; // byte offset of the comment

  constructor(text: string, type: i32, flushLeft: boolean, offset: i32) {
    this.text = text;
    this.type = type;
    this.flushLeft = flushLeft;
    this.offset = offset;
  }

  requiresNewline(): boolean {
    return this.type !== CT_INLINE_BLOCK;
  }
}

/** CommentSequence: comments and the newline counts around them. */
export class DtComments {
  lines: i32[]; // one more than cs
  cs: DtComment[];

  constructor() {
    this.lines = [];
    this.cs = [];
  }

  len(): i32 {
    return toI32(this.cs.length);
  }

  isEmpty(): boolean {
    return this.cs.length === 0;
  }

  requiresNewline(): boolean {
    for (const c of this.cs) {
      if (c.requiresNewline()) {
        return true;
      }
    }
    return false;
  }

  linesBefore(i: i32): i32 {
    const ls = this.lines;
    if (i >= 0 && i < ls.length) {
      return ls[i];
    }
    fault();
    return 0;
  }

  linesAfter(i: i32): i32 {
    const ls = this.lines;
    if (i >= -1 && i < ls.length) {
      const j = i + 1;
      if (j >= 0 && j < ls.length) {
        return ls[j];
      }
    }
    fault();
    return 0;
  }

  isHanging(i: i32): boolean {
    if (this.linesBefore(i) !== 0) {
      return false;
    }
    const cs = this.cs;
    if (i < 0 || i >= cs.length) {
      fault();
      return false;
    }
    const t = cs[i].type;
    return t === CT_INLINE_BLOCK || t === CT_LINE;
  }

  isLeading(i: i32): boolean {
    if (this.linesAfter(i) > 0) {
      return false;
    }
    const cs = this.cs;
    if (i < 0 || i >= cs.length) {
      fault();
      return false;
    }
    return cs[i].type === CT_INLINE_BLOCK;
  }

  linesBeforeNextToken(): i32 {
    const ls = this.lines;
    const n = ls.length;
    if (n > 0) {
      return ls[n - 1];
    }
    fault();
    return 0;
  }

  containsBlankLine(): boolean {
    for (let i = 0; i < this.cs.length; i++) {
      if (this.linesBefore(i) > 1) {
        return true;
      }
    }
    return this.linesBeforeNextToken() > 1;
  }

  /** This sequence followed by `o`. */
  concatenate(o: DtComments): DtComments {
    if (this.isEmpty()) {
      return o;
    }
    if (o.isEmpty()) {
      return this;
    }
    const r = new DtComments();
    const ls = this.lines;
    const ol = o.lines;
    const n = ls.length;
    if (n < 1 || ol.length < 1) {
      fault();
      return r;
    }
    // Newline counts are differences of line numbers, so the sum fits.
    const joined = toI32(toU32(ls[n - 1]) + toU32(ol[0]));
    for (let i = 0; i < n - 1 && i < ls.length; i++) {
      r.lines.push(ls[i]);
    }
    r.lines.push(joined);
    for (let i = 1; i < ol.length; i++) {
      r.lines.push(ol[i]);
    }
    for (const c of this.cs) {
      r.cs.push(c);
    }
    for (const c of o.cs) {
      r.cs.push(c);
    }
    return r;
  }

  /** The first `index` comments. */
  head(index: i32): DtComments {
    if (index === 0) {
      return dtEmptyComments();
    }
    if (index === this.len()) {
      return this;
    }
    const r = new DtComments();
    const ls = this.lines;
    const cs = this.cs;
    if (index >= ls.length || index > cs.length) {
      fault();
      return r;
    }
    for (let i = 0; i <= index && i < ls.length; i++) {
      r.lines.push(ls[i]);
    }
    for (let i = 0; i < index && i < cs.length; i++) {
      r.cs.push(cs[i]);
    }
    return r;
  }

  /** The comments from `index` on. */
  tail(index: i32): DtComments {
    if (index === 0) {
      return this;
    }
    if (index === this.len()) {
      return dtEmptyComments();
    }
    const r = new DtComments();
    r.lines.push(0);
    const ls = this.lines;
    const cs = this.cs;
    if (index < 0) {
      fault();
      return r;
    }
    if (index < ls.length) {
      for (let i = index + 1; i < ls.length; i++) {
        r.lines.push(ls[i]);
      }
    }
    for (let i = index; i < cs.length; i++) {
      r.cs.push(cs[i]);
    }
    return r;
  }
}

export const dtEmptyComments = (): DtComments => {
  const c = new DtComments();
  c.lines.push(0);
  return c;
};

/** CommentWriter. */
export class DtCommentWriter {
  t: DtTokens;
  taken: boolean[];
  none: DtComments; // shared: a DtComments never changes once built

  constructor(t: DtTokens) {
    this.t = t;
    this.taken = newBools(add32(t.count, 8));
    this.none = dtEmptyComments();
  }

  hasComments(tok: i32): boolean {
    const cCount = this.t.cCount;
    if (tok >= 0 && tok < cCount.length) {
      return cCount[tok] > 0;
    }
    fault();
    return false;
  }

  takeCommentsBefore(tok: i32): DtComments {
    const taken = this.taken;
    if (tok < 0 || tok >= taken.length) {
      fault();
      return this.none;
    }
    if (taken[tok]) {
      return this.none;
    }
    taken[tok] = true;
    return this.commentsBeforeRaw(tok);
  }

  commentsBefore(tok: i32): DtComments {
    const cCount = this.t.cCount;
    const taken = this.taken;
    if (tok < 0 || tok >= cCount.length) {
      fault();
      return this.none;
    }
    if (cCount[tok] === 0) {
      return this.none;
    }
    if (tok >= taken.length) {
      fault();
      return this.none;
    }
    if (taken[tok]) {
      return this.none;
    }
    return this.commentsBeforeRaw(tok);
  }

  commentsBeforeRaw(tok: i32): DtComments {
    const t = this.t;
    const r = new DtComments();
    const lineE = t.lineE;
    const lineS = t.lineS;
    const kind = t.kind;
    const cFirst = t.cFirst;
    const cCount = t.cCount;
    if (
      tok <= 0 ||
      tok >= lineE.length ||
      tok >= lineS.length ||
      tok >= kind.length ||
      tok >= cFirst.length ||
      tok >= cCount.length
    ) {
      fault();
      return r;
    }
    let previousLine = lineE[tok - 1];
    const tokenLine = lineS[tok];
    if (kind[tok - 1] === T_SCRIPT) {
      previousLine = tokenLine;
    }
    const n = cCount[tok];
    const cLineS = t.cLineS;
    const cLineE = t.cLineE;
    const cStart = t.cStart;
    const cEnd = t.cEnd;
    const cKind = t.cKind;
    const cCol1 = t.cCol1;
    let ci = cFirst[tok];
    for (let k = 0; k < n; k++) {
      // The comment arrays grow together, so one range covers them all.
      if (
        ci < 0 ||
        ci >= cLineS.length ||
        ci >= cLineE.length ||
        ci >= cStart.length ||
        ci >= cEnd.length ||
        ci >= cKind.length ||
        ci >= cCol1.length
      ) {
        fault();
        return r;
      }
      const commentLine = cLineS[ci];
      const start = cStart[ci];
      const isLine = cKind[ci] === C_LINE;
      const endLine = cLineE[ci];
      const col1 = cCol1[ci];
      const text = dtTrimmed(t.src, start, cEnd[ci]);
      // Line numbers are positive and below the source length, so differences fit.
      let linesBefore = toI32(toU32(commentLine) - toU32(previousLine));
      let flushLeft = col1;
      const isLineDoc = text.startsWith("///") && !text.startsWith("////");
      if (isLineDoc) {
        flushLeft = false;
        if (k === 0) {
          linesBefore = 2;
        }
      }
      let type = CT_BLOCK;
      if (isLineDoc || (text.startsWith("/**") && text !== "/**/")) {
        type = CT_DOC;
      } else if (isLine) {
        type = CT_LINE;
      } else if (commentLine === previousLine || commentLine === tokenLine) {
        type = CT_INLINE_BLOCK;
      }
      r.lines.push(linesBefore);
      r.cs.push(new DtComment(text, type, flushLeft, start));
      previousLine = endLine;
      ci = ci + 1;
    }
    r.lines.push(toI32(toU32(tokenLine) - toU32(previousLine)));
    return r;
  }

  hasNewlineBetween(a: i32, b: i32): boolean {
    const lineE = this.t.lineE;
    const lineS = this.t.lineS;
    if (a >= 0 && a < lineE.length && b >= 0 && b < lineS.length) {
      return lineE[a] < lineS[b];
    }
    fault();
    return false;
  }
}

/** Whether the UTF-8 sequence ending before `e` is a whitespace character; answers its length or 0. */
const dtWsBefore = (src: u8[], a: i32, e: i32): i32 => {
  if (e <= a) {
    return 0;
  }
  if (e <= 0 || e > src.length) {
    fault();
    return 0;
  }
  const c = toI32(src[e - 1]);
  if (c === 32 || (c >= 9 && c <= 13)) {
    return 1;
  }
  if (e - 2 < a) {
    return 0;
  }
  if (e < 2) {
    fault();
    return 0;
  }
  const b1 = toI32(src[e - 2]);
  if (b1 === 0xc2 && (c === 0x85 || c === 0xa0)) {
    return 2;
  }
  if (e - 3 >= a) {
    if (e < 3) {
      fault();
      return 0;
    }
    const b0 = toI32(src[e - 3]);
    if (b0 === 0xe1 && b1 === 0x9a && c === 0x80) {
      return 3; // U+1680
    }
    if (b0 === 0xe2 && b1 === 0x80 && ((c >= 0x80 && c <= 0x8a) || c === 0xa8 || c === 0xa9 || c === 0xaf)) {
      return 3; // U+2000..U+200A, U+2028, U+2029, U+202F
    }
    if (b0 === 0xe2 && b1 === 0x81 && c === 0x9f) {
      return 3; // U+205F
    }
    if (b0 === 0xe3 && b1 === 0x80 && c === 0x80) {
      return 3; // U+3000
    }
    if (b0 === 0xef && b1 === 0xbb && c === 0xbf) {
      return 3; // U+FEFF
    }
  }
  return 0;
};

/** The comment `src[a, b)` with surrounding whitespace removed, as Dart's trim(). */
export const dtTrimmed = (src: u8[], a: i32, b: i32): string => {
  let e = b;
  while (true) {
    const w = dtWsBefore(src, a, e);
    if (w === 0) {
      break;
    }
    // dtWsBefore read src[e - w], so w <= e and the difference is exact.
    e = toI32(toU32(e) - toU32(w));
  }
  return bytesText(src, a, e);
};
