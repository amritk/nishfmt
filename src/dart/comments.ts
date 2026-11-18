// dart_style's comment handling: CommentWriter, SourceComment and
// CommentSequence (lib/src/front_end/comment_writer.dart) over the
// scanner's comment arrays.
//
// Ported from dart_style 3.1.14-wip at 5a9534fad9ff, the commit Dart SDK
// 3.14.1 pins (BSD-3-Clause, Copyright the Dart project authors).

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
    return this.lines[i];
  }

  linesAfter(i: i32): i32 {
    return this.lines[i + 1];
  }

  isHanging(i: i32): boolean {
    if (this.linesBefore(i) !== 0) {
      return false;
    }
    const t = this.cs[i].type;
    return t === CT_INLINE_BLOCK || t === CT_LINE;
  }

  isLeading(i: i32): boolean {
    if (this.linesAfter(i) > 0) {
      return false;
    }
    return this.cs[i].type === CT_INLINE_BLOCK;
  }

  linesBeforeNextToken(): i32 {
    return this.lines[this.lines.length - 1];
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
    const n = toI32(this.lines.length);
    for (let i = 0; i < n - 1; i++) {
      r.lines.push(this.lines[i]);
    }
    r.lines.push(this.lines[n - 1] + o.lines[0]);
    for (let i = 1; i < o.lines.length; i++) {
      r.lines.push(o.lines[i]);
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
    for (let i = 0; i <= index; i++) {
      r.lines.push(this.lines[i]);
    }
    for (let i = 0; i < index; i++) {
      r.cs.push(this.cs[i]);
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
    for (let i = index + 1; i < this.lines.length; i++) {
      r.lines.push(this.lines[i]);
    }
    for (let i = index; i < this.cs.length; i++) {
      r.cs.push(this.cs[i]);
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
    this.taken = new Array<boolean>(t.count + 8);
    this.none = dtEmptyComments();
  }

  hasComments(tok: i32): boolean {
    return this.t.cCount[tok] > 0;
  }

  takeCommentsBefore(tok: i32): DtComments {
    if (this.taken[tok]) {
      return this.none;
    }
    this.taken[tok] = true;
    return this.commentsBeforeRaw(tok);
  }

  commentsBefore(tok: i32): DtComments {
    if (this.t.cCount[tok] === 0) {
      return this.none;
    }
    if (this.taken[tok]) {
      return this.none;
    }
    return this.commentsBeforeRaw(tok);
  }

  commentsBeforeRaw(tok: i32): DtComments {
    const t = this.t;
    let previousLine = t.lineE[tok - 1];
    const tokenLine = t.lineS[tok];
    if (t.kind[tok - 1] === T_SCRIPT) {
      previousLine = tokenLine;
    }
    const r = new DtComments();
    const first = t.cFirst[tok];
    const n = t.cCount[tok];
    for (let k = 0; k < n; k++) {
      const ci = first + k;
      const commentLine = t.cLineS[ci];
      const text = dtTrimmed(t.src, t.cStart[ci], t.cEnd[ci]);
      let linesBefore = commentLine - previousLine;
      let flushLeft = t.cCol1[ci];
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
      } else if (t.cKind[ci] === C_LINE) {
        type = CT_LINE;
      } else if (commentLine === previousLine || commentLine === tokenLine) {
        type = CT_INLINE_BLOCK;
      }
      r.lines.push(linesBefore);
      r.cs.push(new DtComment(text, type, flushLeft, t.cStart[ci]));
      previousLine = t.cLineE[ci];
    }
    r.lines.push(tokenLine - previousLine);
    return r;
  }

  hasNewlineBetween(a: i32, b: i32): boolean {
    return this.t.lineE[a] < this.t.lineS[b];
  }
}

/** Whether the UTF-8 sequence ending before `e` is a whitespace character; answers its length or 0. */
const dtWsBefore = (src: u8[], a: i32, e: i32): i32 => {
  if (e <= a) {
    return 0;
  }
  const c = toI32(src[e - 1]);
  if (c === 32 || (c >= 9 && c <= 13)) {
    return 1;
  }
  if (e - 2 >= a && toI32(src[e - 2]) === 0xc2 && (c === 0x85 || c === 0xa0)) {
    return 2;
  }
  if (e - 3 >= a) {
    const b0 = toI32(src[e - 3]);
    const b1 = toI32(src[e - 2]);
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
    e -= w;
  }
  return String.fromBytes(src, a, e);
};
