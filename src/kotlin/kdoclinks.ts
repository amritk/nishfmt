// The names a KDoc comment links to, as ktfmt's RedundantImportDetector
// reads them: every markdown link `[a.b]` and every tag subject (`@see a.b`),
// first segment only, except the first link of a one-line `@param` or
// `@property` tag. The lexer is the Kotlin compiler's KDoc.flex, reduced to
// the tokens the KDoc parser's sections and tags are made of.
//
// Ported from the Kotlin compiler 2.4.10's KDoc.flex, KDocParser and
// KDocLinkParser (Apache License 2.0, Copyright JetBrains s.r.o.).

import { atI32, bytesText } from "../core/arr";
import { fault } from "../core/fault";

// Token kinds.
const KD_WS: i32 = 1;
const KD_START: i32 = 2;
const KD_END: i32 = 3;
const KD_LEADING_ASTERISK: i32 = 4;
const KD_TEXT: i32 = 5;
const KD_CODE_BLOCK_TEXT: i32 = 6;
const KD_TAG_NAME: i32 = 7;
const KD_LINK: i32 = 8;
const KD_OTHER: i32 = 9; // escaped char, parens, bad character
const KD_CODE_SPAN_TEXT: i32 = 10;

// Lexer states.
const KS_INITIAL: i32 = 0;
const KS_LINE_BEGINNING: i32 = 1;
const KS_CONTENTS_BEGINNING: i32 = 2;
const KS_TAG_BEGINNING: i32 = 3;
const KS_TAG_TEXT_BEGINNING: i32 = 4;
const KS_CONTENTS: i32 = 5;
const KS_CODE_BLOCK: i32 = 6;
const KS_CODE_BLOCK_LINE_BEGINNING: i32 = 7;
const KS_CODE_BLOCK_CONTENTS_BEGINNING: i32 = 8;
const KS_INDENTED_CODE_BLOCK: i32 = 9;
const KS_CODE_SPAN_CONTENTS: i32 = 10;
const KS_CODE_SPAN_LINE_BEGINNING: i32 = 11;

const BT_NONE: i32 = 0;
const BT_PARAGRAPH: i32 = 1;
const BT_CODE: i32 = 2;

/** The KDoc tokens of src[a, b): kinds and ranges in parallel lists. */
class KDocLexer {
  src: u8[];
  // The comment's end; positions stay within a few bytes of it, so a
  // position plus a length below 2^30 fits.
  e: integer<0, 1000000000> = 0;
  p: i32 = 0;
  state: i32 = 0;
  breaks: i32 = 0;
  block: i32 = 0;
  // The character and length of the fence that opened the current code
  // block or code span.
  fenceChar: i32 = 0;
  fenceLen: i32 = -1;
  kinds: i32[];
  starts: i32[];
  ends: i32[];

  constructor(src: u8[], a: i32, b: i32) {
    this.src = src;
    this.kinds = [];
    this.starts = [];
    this.ends = [];
    // A comment's range lies in a source the lexer took, which is below 2^30
    // bytes; one past 10^9 bytes is given up on.
    if (a < 0 || b < a || b < 0 || b > src.length || b > 1000000000) {
      fault();
      return;
    }
    this.p = a;
    this.e = b;
  }

  /** Gives up on the comment (and so the file): run() ends. */
  stop(): void {
    fault();
    this.p = this.e;
  }

  at(i: i32): i32 {
    if (i >= this.e) {
      return -1;
    }
    const src = this.src;
    if (i >= 0 && i < src.length) {
      return toI32(src[i]);
    }
    fault();
    return -1;
  }

  beginAndUpdate(s: i32): void {
    if (s === KS_LINE_BEGINNING || s === KS_CODE_BLOCK_LINE_BEGINNING) {
      // One a token, so below the comment's length.
      const b = this.breaks;
      if (b < 0 || b > 1073741823) {
        this.stop();
        return;
      }
      this.breaks = b + 1;
    } else {
      this.breaks = 0;
    }
    this.state = s;
  }

  emit(kind: i32, len: i32): void {
    const p = this.p;
    // Positions and lengths stay inside the comment.
    if (p < 0 || p > 1073741823 || len < 0 || len > 1073741823) {
      this.stop();
      return;
    }
    const q = p + len;
    this.kinds.push(kind);
    this.starts.push(p);
    this.ends.push(q);
    this.p = q;
  }

  run(): void {
    while (this.p < this.e) {
      this.step();
    }
  }

  step(): void {
    const p = this.p;
    const e = this.e;
    // run() steps from inside the comment.
    if (p < 0 || p >= e) {
      this.stop();
      return;
    }
    const c = this.at(p);
    const s = this.state;
    // "*"+ "/" in every state.
    let q0 = p;
    while (q0 < e && this.at(q0) === 42) {
      q0++;
    }
    const stars = q0 - p;
    let endLen = 0;
    if (stars > 0 && q0 < e && this.at(q0) === 47) {
      endLen = q0 + 1 - p;
    }
    if (s === KS_INITIAL) {
      if (c === 47 && this.at(p + 1) === 42 && this.at(p + 2) === 42 && endLen < 3) {
        this.emit(KD_START, 3);
        this.beginAndUpdate(KS_CONTENTS_BEGINNING);
        return;
      }
      if (endLen > 0) {
        this.emit(p + endLen === this.e ? KD_END : KD_TEXT, endLen);
        return;
      }
      this.emit(KD_OTHER, 1);
      return;
    }
    const ws = kdWsRun(this, p);
    if (ws < 0 || ws > 1073741823) {
      this.stop();
      return;
    }
    if (s === KS_LINE_BEGINNING && (ws > 0 || stars > 0)) {
      if (ws > 0) {
        this.emit(KD_WS, ws);
        return;
      }
      if (endLen > stars) {
        this.emit(p + endLen === this.e ? KD_END : KD_TEXT, endLen);
        return;
      }
      this.emit(KD_LEADING_ASTERISK, stars);
      this.state = KS_CONTENTS_BEGINNING;
      return;
    }
    if (s === KS_TAG_BEGINNING || s === KS_TAG_TEXT_BEGINNING) {
      if (c === 10 || c === 13) {
        this.emit(KD_WS, 1);
        this.beginAndUpdate(KS_LINE_BEGINNING);
        return;
      }
      if (ws > 0) {
        this.emit(KD_WS, ws);
        return;
      }
      const link = kdCodeLink(this, p);
      let qn = 0;
      if (s === KS_TAG_BEGINNING) {
        qn = kdQualifiedName(this, p);
      }
      const best = link > qn ? link : qn;
      if (best > 0 && best >= endLen) {
        this.emit(KD_LINK, best);
        this.beginAndUpdate(s === KS_TAG_BEGINNING ? KS_TAG_TEXT_BEGINNING : KS_CONTENTS);
        return;
      }
      if (endLen > 0) {
        this.emit(p + endLen === this.e ? KD_END : KD_TEXT, endLen);
        return;
      }
      this.emit(KD_TEXT, kdCharLen(c));
      this.beginAndUpdate(KS_CONTENTS);
      return;
    }
    if (s === KS_CODE_SPAN_CONTENTS) {
      if (endLen > 0) {
        this.emit(p + endLen === this.e ? KD_END : KD_TEXT, endLen);
        return;
      }
      if (c === 10 || c === 13) {
        this.emit(KD_WS, 1);
        this.beginAndUpdate(KS_CODE_SPAN_LINE_BEGINNING);
        return;
      }
      if (c === 96) {
        const k = kdRun(this, p, 96);
        if (k === this.fenceLen && c === this.fenceChar) {
          // The code span's end.
          this.fenceLen = -1;
          this.fenceChar = 0;
          this.emit(KD_TEXT, k);
          this.beginAndUpdate(KS_CONTENTS);
        } else {
          this.emit(KD_CODE_SPAN_TEXT, k);
        }
        return;
      }
      this.emit(KD_CODE_SPAN_TEXT, kdCharLen(c));
      return;
    }
    if (s === KS_CODE_SPAN_LINE_BEGINNING) {
      if (ws > 0) {
        this.emit(KD_WS, ws);
        return;
      }
      if (endLen > 0) {
        this.emit(p + endLen === this.e ? KD_END : KD_TEXT, endLen);
        return;
      }
      if (stars > 0) {
        this.emit(KD_LEADING_ASTERISK, stars);
        this.beginAndUpdate(KS_CODE_SPAN_CONTENTS);
        return;
      }
      // [\s\S]: a bad character, in the same state.
      this.block = BT_PARAGRAPH;
      this.emit(KD_OTHER, kdCharLen(c));
      return;
    }
    if (s === KS_LINE_BEGINNING || s === KS_CONTENTS_BEGINNING || s === KS_CONTENTS) {
      if (s === KS_CONTENTS_BEGINNING && c === 64) {
        const id = kdPlainIdent(this, p + 1);
        if (id < 0 || id > 1073741823) {
          this.stop();
          return;
        }
        if (id > 0 && 1 + id >= endLen) {
          this.block = BT_PARAGRAPH;
          const ref = kdTagRequiresReference(this.src, p + 1, p + 1 + id);
          this.emit(KD_TAG_NAME, 1 + id);
          this.beginAndUpdate(ref ? KS_TAG_BEGINNING : KS_TAG_TEXT_BEGINNING);
          return;
        }
      }
      if (c === 10 || c === 13) {
        this.emit(KD_WS, 1);
        this.beginAndUpdate(KS_LINE_BEGINNING);
        return;
      }
      if (ws > 0) {
        // Both bytes lie in the comment, where at() reads the source.
        const tab = c === 9 || this.at(p + ws - 1) === 9;
        if (s === KS_CONTENTS_BEGINNING && (ws >= 4 || tab) && (this.block !== BT_PARAGRAPH || this.breaks >= 2)) {
          this.state = KS_INDENTED_CODE_BLOCK;
          this.block = BT_CODE;
          this.emit(KD_CODE_BLOCK_TEXT, ws);
          return;
        }
        this.state = s === KS_CONTENTS_BEGINNING ? KS_CONTENTS_BEGINNING : KS_CONTENTS;
        this.emit(KD_TEXT, ws);
        return;
      }
      // CODE_FENCE_START / LINE_BREAK_CHAR, at the start of a line only:
      // three or more backticks (and no backtick after them) or tildes, to
      // the end of the line.
      if (s === KS_CONTENTS_BEGINNING && (c === 96 || c === 126)) {
        const k = kdRun(this, p, c);
        if (k < 0 || k > 1073741823) {
          this.stop();
          return;
        }
        let q = p + k;
        while (q < e && this.at(q) !== 10 && this.at(q) !== 13 && !(c === 96 && this.at(q) === 96)) {
          q++;
        }
        if (k >= 3 && (this.at(q) === 10 || this.at(q) === 13)) {
          this.block = BT_CODE;
          this.fenceChar = c;
          this.fenceLen = k;
          this.emit(KD_TEXT, q - p);
          this.beginAndUpdate(KS_CODE_BLOCK_LINE_BEGINNING);
          return;
        }
      }
      // BACKTICK_STRING opens a code span.
      if (c === 96 && s !== KS_LINE_BEGINNING) {
        const k = kdRun(this, p, 96);
        this.fenceChar = c;
        this.fenceLen = k;
        this.emit(KD_TEXT, k);
        this.beginAndUpdate(KS_CODE_SPAN_CONTENTS);
        return;
      }
      const link = kdCodeLink(this, p);
      if (link > 0 && link >= endLen) {
        if (link > 1073741823) {
          this.stop();
          return;
        }
        const after = this.at(p + link);
        if (after >= 0 && after !== 40 && after !== 91) {
          this.block = BT_PARAGRAPH;
          this.emit(KD_LINK, link);
          this.beginAndUpdate(KS_CONTENTS);
          return;
        }
      }
      if (endLen > 0) {
        this.emit(p + endLen === this.e ? KD_END : KD_TEXT, endLen);
        return;
      }
      this.block = BT_PARAGRAPH;
      if (c === 92 && kdIsEscapable(this.at(p + 1))) {
        this.emit(KD_OTHER, 2);
      } else {
        this.emit(c === 40 || c === 41 ? KD_OTHER : KD_TEXT, kdCharLen(c));
      }
      this.beginAndUpdate(KS_CONTENTS);
      return;
    }
    // The code block states.
    if (s === KS_CODE_BLOCK_LINE_BEGINNING && (ws > 0 || stars > 0)) {
      if (ws > 0) {
        this.emit(KD_WS, ws);
        return;
      }
      if (endLen > stars) {
        this.emit(p + endLen === this.e ? KD_END : KD_TEXT, endLen);
        return;
      }
      this.emit(KD_LEADING_ASTERISK, stars);
      this.state = KS_CODE_BLOCK_CONTENTS_BEGINNING;
      return;
    }
    if (s === KS_CODE_BLOCK_LINE_BEGINNING || s === KS_CODE_BLOCK_CONTENTS_BEGINNING) {
      // CODE_FENCE_END / [ \t\f]* [\n]: the fence that opened the block
      // closes it; any other run is code.
      if (c === 96 || c === 126) {
        const k = kdRun(this, p, c);
        if (k < 0 || k > 1073741823) {
          this.stop();
          return;
        }
        let q = p + k;
        while (q < e && (this.at(q) === 32 || this.at(q) === 9 || this.at(q) === 12)) {
          q++;
        }
        if (this.at(q) === 10) {
          if (k === this.fenceLen && c === this.fenceChar) {
            this.fenceChar = 0;
            this.fenceLen = -1;
            this.emit(KD_TEXT, k);
            this.beginAndUpdate(KS_CONTENTS);
          } else {
            this.emit(KD_CODE_BLOCK_TEXT, k);
          }
          return;
        }
      }
    }
    if (c === 10 || c === 13) {
      this.emit(KD_WS, 1);
      this.beginAndUpdate(s === KS_INDENTED_CODE_BLOCK ? KS_LINE_BEGINNING : KS_CODE_BLOCK_LINE_BEGINNING);
      return;
    }
    if (endLen > 0 && endLen > ws) {
      this.emit(p + endLen === this.e ? KD_END : KD_TEXT, endLen);
      return;
    }
    if (ws > 0) {
      this.emit(KD_CODE_BLOCK_TEXT, ws);
      return;
    }
    this.emit(KD_CODE_BLOCK_TEXT, kdCharLen(c));
    this.beginAndUpdate(s === KS_INDENTED_CODE_BLOCK ? KS_INDENTED_CODE_BLOCK : KS_CODE_BLOCK);
  }
}

/** The length of a run of [ \t\f] at `p`. */
const kdWsRun = (lx: KDocLexer, p: i32): i32 => {
  const e = lx.e;
  let q = p;
  while (q < e) {
    const c = lx.at(q);
    if (c === 32 || c === 9 || c === 12) {
      q++;
    } else {
      break;
    }
  }
  return q - p;
};

/** The length of the run of byte `c` at `p` (countRepeating). */
const kdRun = (lx: KDocLexer, p: i32, c: i32): i32 => {
  const e = lx.e;
  let q = p;
  // c is a byte, which at() answers before e only.
  while (q < e && lx.at(q) === c) {
    q++;
  }
  return q - p;
};

/** ESCAPED_CHARS: a backslash before any ASCII punctuation. */
const kdIsEscapable = (c: i32): boolean =>
  (c >= 33 && c <= 47) || (c >= 58 && c <= 64) || (c >= 91 && c <= 96) || (c >= 123 && c <= 126);

/** UTF-8 sequence length of a lead byte (a lexer step consumes one character). */
const kdCharLen = (c: i32): i32 => (c < 0xc0 ? 1 : c < 0xe0 ? 2 : c < 0xf0 ? 3 : 4);

const kdIsLetter = (c: i32): boolean =>
  (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36 || c >= 0xc0;

const kdIsPart = (c: i32): boolean => kdIsLetter(c) || (c >= 48 && c <= 57) || (c >= 0x80 && c < 0xc0);

/** PLAIN_IDENTIFIER at `p`: its length, or 0. */
const kdPlainIdent = (lx: KDocLexer, p: i32): i32 => {
  const e = lx.e;
  const c = lx.at(p);
  // A letter lies before e, where a position is not negative.
  if (!kdIsLetter(c) || p < 0 || p >= e) {
    return 0;
  }
  // kdCharLen(c), the letter's length.
  let q = p + 1;
  if (c >= 0xf0) {
    q = p + 4;
  } else if (c >= 0xe0) {
    q = p + 3;
  } else if (c >= 0xc0) {
    q = p + 2;
  }
  while (q < e && kdIsPart(lx.at(q))) {
    q++;
  }
  return q - p;
};

/** IDENTIFIER: a plain one or a backquoted one. */
const kdIdent = (lx: KDocLexer, p: i32): i32 => {
  const e = lx.e;
  // A backquote lies before e, where a position is not negative.
  if (lx.at(p) === 96 && p >= 0 && p < e) {
    let q = p + 1;
    while (q < e && lx.at(q) !== 96 && lx.at(q) !== 10) {
      q++;
    }
    if (q > p + 1 && q < e && lx.at(q) === 96) {
      return q + 1 - p;
    }
    return 0;
  }
  return kdPlainIdent(lx, p);
};

/** QUALIFIED_NAME = IDENTIFIER ([.] IDENTIFIER?)*. */
const kdQualifiedName = (lx: KDocLexer, p: i32): i32 => {
  const e = lx.e;
  const first = kdIdent(lx, p);
  if (first === 0) {
    return 0;
  }
  // Names lie inside the comment.
  if (p < 0 || p > e || first < 0 || first > 1073741823) {
    fault();
    return 0;
  }
  let q = p + first;
  while (q >= 0 && q < e && lx.at(q) === 46) {
    q++;
    const id = kdIdent(lx, q);
    // Positions stay within a few bytes of e, at most 10^9.
    if (id < 0 || id > 1073741823 || q > 1000000000) {
      fault();
      return 0;
    }
    q += id;
  }
  if (q < 0) {
    fault();
    return 0;
  }
  return q - p;
};

/** CODE_LINK = \[ QUALIFIED_NAME \], longest match. */
const kdCodeLink = (lx: KDocLexer, p: i32): i32 => {
  if (lx.at(p) !== 91) {
    return 0;
  }
  // The longest QUALIFIED_NAME may overrun a shorter one followed by `]`;
  // try the greedy form, then each prefix ending at a dot.
  const qn = kdQualifiedName(lx, p + 1);
  if (qn === 0) {
    return 0;
  }
  // A name inside the comment.
  const e = lx.e;
  if (p < 0 || p > e || qn > 1073741823) {
    fault();
    return 0;
  }
  for (let len = qn; len > 0; len--) {
    if (lx.at(p + 1 + len) === 93) {
      return len + 2;
    }
  }
  return 0;
};

/** KDocKnownTag.isReferenceRequired for the tag name src[a, b) (no `@`). */
const kdTagRequiresReference = (src: u8[], a: i32, b: i32): boolean => {
  let name = "";
  if (a < 0 || b > src.length) {
    fault();
    return false;
  }
  for (let i = a; i < b; i++) {
    const c = toI32(src[i]);
    name = name + String.fromCharCode(c >= 97 && c <= 122 ? c - 32 : c);
  }
  return (
    name === "THROWS" ||
    name === "EXCEPTION" ||
    name === "PARAM" ||
    name === "SEE" ||
    name === "PROPERTY" ||
    name === "SAMPLE"
  );
};

/** Adds the names the KDoc comment src[a, b) links to. */
export const kdocReferences = (src: u8[], a: i32, b: i32, out: string[]): void => {
  const lx = new KDocLexer(src, a, b);
  lx.run();
  const kinds = lx.kinds;
  // Walk the tags: a tag runs from its name to the END, or to a leading
  // asterisk followed (past one TEXT) by the next tag name.
  let i = 0;
  let tagStart = -1;
  let firstLinkInTag = true;
  let dropFirst = false;
  while (i < kinds.length) {
    const k = kinds[i];
    if (k === KD_TAG_NAME) {
      tagStart = i;
      firstLinkInTag = true;
      dropFirst = kdSkipFirstReference(lx, i);
    } else if (k === KD_END) {
      tagStart = -1;
    } else if (k === KD_LEADING_ASTERISK && tagStart >= 0) {
      let j = kdNextNonWs(lx, i + 1);
      if (j >= 0 && j < kinds.length && kinds[j] === KD_TEXT) {
        j = kdNextNonWs(lx, j + 1);
      }
      if (j >= 0 && j < kinds.length && kinds[j] === KD_TAG_NAME) {
        tagStart = -1;
      }
    } else if (k === KD_LINK) {
      const skip = tagStart >= 0 && firstLinkInTag && dropFirst;
      if (tagStart >= 0) {
        firstLinkInTag = false;
      }
      if (!skip) {
        const name = kdLinkFirstName(src, atI32(lx.starts, i), atI32(lx.ends, i));
        if (name !== null) {
          out.push(name);
        }
      }
    }
    i++;
  }
};

/** The first token from `i` (not negative) that is not whitespace, or the token count. */
const kdNextNonWs = (lx: KDocLexer, i: i32): i32 => {
  const kinds = lx.kinds;
  let j = i;
  if (j < 0) {
    fault();
    return toI32(kinds.length);
  }
  while (j < kinds.length && kinds[j] === KD_WS) {
    j++;
  }
  return j;
};

/** Whether src[a, b) spells `s`. */
const kdBytesAre = (src: u8[], a: i32, b: i32, s: string): boolean => {
  if (a < 0 || b < a || b > src.length) {
    fault();
    return false;
  }
  const k = toI32(s.length);
  if (b < 0 || b - a !== k) {
    return false;
  }
  let p = a;
  for (let t = 0; t < k; t++) {
    if (p >= src.length) {
      fault();
      return false;
    }
    if (toI32(src[p]) !== s.charCodeAt(t)) {
      return false;
    }
    p++;
  }
  return true;
};

/**
 * Whether the tag at token `i` matches `^@(param|property) (.+)`: its text,
 * up to the last non-whitespace token before the tag ends, is one line.
 */
const kdSkipFirstReference = (lx: KDocLexer, i: i32): boolean => {
  const src = lx.src;
  const a = atI32(lx.starts, i);
  const ai = atI32(lx.ends, i);
  if (!kdBytesAre(src, a, ai, "@param") && !kdBytesAre(src, a, ai, "@property")) {
    return false;
  }
  // The tag's extent.
  const kinds = lx.kinds;
  if (i < 0) {
    fault();
    return false;
  }
  let last = i;
  let j = i + 1;
  while (j < kinds.length) {
    const k = kinds[j];
    if (k === KD_END) {
      break;
    }
    if (k === KD_LEADING_ASTERISK) {
      let q = kdNextNonWs(lx, j + 1);
      if (q >= 0 && q < kinds.length && kinds[q] === KD_TEXT) {
        q = kdNextNonWs(lx, q + 1);
      }
      if (q >= 0 && q < kinds.length && kinds[q] === KD_TAG_NAME) {
        break;
      }
    }
    if (k !== KD_WS) {
      last = j;
    }
    j++;
  }
  const e = atI32(lx.ends, last);
  const b = atI32(lx.ends, i);
  // Token ends lie in the source.
  if (b < 0 || e > src.length) {
    fault();
    return false;
  }
  // A single space, then at least one character, all on one line.
  if (b >= e || toI32(src[b]) !== 32 || b + 1 >= e) {
    return false;
  }
  for (let q = b; q < e; q++) {
    const c = toI32(src[q]);
    if (c === 10 || c === 13) {
      return false;
    }
  }
  return true;
};

/** The first segment of a link's qualified name, unquoted, or null when it has none. */
const kdLinkFirstName = (src: u8[], a: i32, b: i32): string | null => {
  // A token's range lies in the source.
  if (a < 0 || b > src.length) {
    fault();
    return null;
  }
  let p = a;
  if (p < b && toI32(src[p]) === 91) {
    p++;
  }
  if (p < b && toI32(src[p]) === 96) {
    let q = p + 1;
    while (q < b && toI32(src[q]) !== 96) {
      q++;
    }
    return q < b ? bytesText(src, p + 1, q) : null;
  }
  // A Kotlin identifier: letters, digits and `_` (no `$`).
  if (p >= src.length) {
    fault();
    return null;
  }
  const c0 = toI32(src[p]);
  if (!((c0 >= 65 && c0 <= 90) || (c0 >= 97 && c0 <= 122) || c0 === 95 || c0 >= 0xc0)) {
    return null;
  }
  let q = p + 1;
  while (q < b) {
    const c = toI32(src[q]);
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || (c >= 48 && c <= 57) || c >= 0x80) {
      q++;
    } else {
      break;
    }
  }
  return bytesText(src, p, q);
};
