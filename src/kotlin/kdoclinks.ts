// The names a KDoc comment links to, as ktfmt's RedundantImportDetector
// reads them: every markdown link `[a.b]` and every tag subject (`@see a.b`),
// first segment only, except the first link of a one-line `@param` or
// `@property` tag. The lexer is the Kotlin compiler's KDoc.flex, reduced to
// the tokens the KDoc parser's sections and tags are made of.
//
// Ported from the Kotlin compiler's KDoc.flex, KDocParser and
// KDocLinkParser (Apache License 2.0, Copyright JetBrains s.r.o.).

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

const BT_NONE: i32 = 0;
const BT_PARAGRAPH: i32 = 1;
const BT_CODE: i32 = 2;

/** The KDoc tokens of src[a, b): kinds and ranges in parallel lists. */
class KDocLexer {
  src: u8[];
  e: i32 = 0;
  p: i32 = 0;
  state: i32 = 0;
  breaks: i32 = 0;
  block: i32 = 0;
  kinds: i32[];
  starts: i32[];
  ends: i32[];

  constructor(src: u8[], a: i32, b: i32) {
    this.src = src;
    this.p = a;
    this.e = b;
    this.kinds = [];
    this.starts = [];
    this.ends = [];
  }

  at(i: i32): i32 {
    return i < this.e ? toI32(this.src[i]) : -1;
  }

  beginAndUpdate(s: i32): void {
    this.breaks = s === KS_LINE_BEGINNING || s === KS_CODE_BLOCK_LINE_BEGINNING ? this.breaks + 1 : 0;
    this.state = s;
  }

  emit(kind: i32, len: i32): void {
    this.kinds.push(kind);
    this.starts.push(this.p);
    this.ends.push(this.p + len);
    this.p = this.p + len;
  }

  run(): void {
    while (this.p < this.e) {
      this.step();
    }
  }

  step(): void {
    const p = this.p;
    const c = this.at(p);
    const s = this.state;
    // "*"+ "/" in every state.
    let stars = 0;
    while (this.at(p + stars) === 42) {
      stars++;
    }
    const endLen = stars > 0 && this.at(p + stars) === 47 ? stars + 1 : 0;
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
      const qn = s === KS_TAG_BEGINNING ? kdQualifiedName(this, p) : 0;
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
    if (s === KS_LINE_BEGINNING || s === KS_CONTENTS_BEGINNING || s === KS_CONTENTS) {
      if (s === KS_CONTENTS_BEGINNING && c === 64) {
        const id = kdPlainIdent(this, p + 1);
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
        const tab = toI32(this.src[p]) === 9 || toI32(this.src[p + ws - 1]) === 9;
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
      // A code fence runs to the end of the line.
      if (
        (c === 96 && this.at(p + 1) === 96 && this.at(p + 2) === 96) ||
        (c === 126 && this.at(p + 1) === 126 && this.at(p + 2) === 126)
      ) {
        let q = p + 3;
        while (q < this.e && this.at(q) !== 10 && this.at(q) !== 13) {
          q++;
        }
        if (q - p >= endLen) {
          this.block = BT_CODE;
          this.emit(KD_TEXT, q - p);
          this.beginAndUpdate(KS_CODE_BLOCK_LINE_BEGINNING);
          return;
        }
      }
      const link = kdCodeLink(this, p);
      if (link > 0 && link >= endLen) {
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
      if (c === 92 && (this.at(p + 1) === 91 || this.at(p + 1) === 93)) {
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
      if (
        (c === 96 && this.at(p + 1) === 96 && this.at(p + 2) === 96) ||
        (c === 126 && this.at(p + 1) === 126 && this.at(p + 2) === 126)
      ) {
        let q = p + 3;
        while (this.at(q) === 32 || this.at(q) === 9 || this.at(q) === 12) {
          q++;
        }
        if (this.at(q) === 10 && 3 >= endLen) {
          this.emit(KD_TEXT, 3);
          this.beginAndUpdate(KS_CONTENTS);
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
  let q = p;
  while (true) {
    const c = lx.at(q);
    if (c === 32 || c === 9 || c === 12) {
      q++;
    } else {
      break;
    }
  }
  return q - p;
};

/** UTF-8 sequence length of a lead byte (a lexer step consumes one character). */
const kdCharLen = (c: i32): i32 => (c < 0xc0 ? 1 : c < 0xe0 ? 2 : c < 0xf0 ? 3 : 4);

const kdIsLetter = (c: i32): boolean =>
  (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36 || c >= 0xc0;

const kdIsPart = (c: i32): boolean => kdIsLetter(c) || (c >= 48 && c <= 57) || (c >= 0x80 && c < 0xc0);

/** PLAIN_IDENTIFIER at `p`: its length, or 0. */
const kdPlainIdent = (lx: KDocLexer, p: i32): i32 => {
  if (!kdIsLetter(lx.at(p))) {
    return 0;
  }
  let q = p + kdCharLen(lx.at(p));
  while (q < lx.e && kdIsPart(lx.at(q))) {
    q++;
  }
  return q - p;
};

/** IDENTIFIER: a plain one or a backquoted one. */
const kdIdent = (lx: KDocLexer, p: i32): i32 => {
  if (lx.at(p) === 96) {
    let q = p + 1;
    while (q < lx.e && lx.at(q) !== 96 && lx.at(q) !== 10) {
      q++;
    }
    return q > p + 1 && lx.at(q) === 96 ? q + 1 - p : 0;
  }
  return kdPlainIdent(lx, p);
};

/** QUALIFIED_NAME = IDENTIFIER ([.] IDENTIFIER?)*. */
const kdQualifiedName = (lx: KDocLexer, p: i32): i32 => {
  const first = kdIdent(lx, p);
  if (first === 0) {
    return 0;
  }
  let q = p + first;
  while (lx.at(q) === 46) {
    q++;
    q += kdIdent(lx, q);
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
  const n = toI32(lx.kinds.length);
  // Walk the tags: a tag runs from its name to the END, or to a leading
  // asterisk followed (past one TEXT) by the next tag name.
  let i = 0;
  let tagStart = -1;
  let firstLinkInTag = true;
  let dropFirst = false;
  while (i < n) {
    const k = lx.kinds[i];
    if (k === KD_TAG_NAME) {
      tagStart = i;
      firstLinkInTag = true;
      dropFirst = kdSkipFirstReference(lx, i);
    } else if (k === KD_END) {
      tagStart = -1;
    } else if (k === KD_LEADING_ASTERISK && tagStart >= 0) {
      let j = kdNextNonWs(lx, i + 1);
      if (j < n && lx.kinds[j] === KD_TEXT) {
        j = kdNextNonWs(lx, j + 1);
      }
      if (j < n && lx.kinds[j] === KD_TAG_NAME) {
        tagStart = -1;
      }
    } else if (k === KD_LINK) {
      const skip = tagStart >= 0 && firstLinkInTag && dropFirst;
      if (tagStart >= 0) {
        firstLinkInTag = false;
      }
      if (!skip) {
        const name = kdLinkFirstName(src, lx.starts[i], lx.ends[i]);
        if (name !== null) {
          out.push(name);
        }
      }
    }
    i++;
  }
};

const kdNextNonWs = (lx: KDocLexer, i: i32): i32 => {
  let j = i;
  while (j < toI32(lx.kinds.length) && lx.kinds[j] === KD_WS) {
    j++;
  }
  return j;
};

/**
 * Whether the tag at token `i` matches `^@(param|property) (.+)`: its text,
 * up to the last non-whitespace token before the tag ends, is one line.
 */
const kdSkipFirstReference = (lx: KDocLexer, i: i32): boolean => {
  const src = lx.src;
  const a = lx.starts[i];
  const name = String.fromBytes(src, a, lx.ends[i]);
  if (name !== "@param" && name !== "@property") {
    return false;
  }
  // The tag's extent.
  const n = toI32(lx.kinds.length);
  let last = i;
  let j = i + 1;
  while (j < n) {
    const k = lx.kinds[j];
    if (k === KD_END) {
      break;
    }
    if (k === KD_LEADING_ASTERISK) {
      let q = kdNextNonWs(lx, j + 1);
      if (q < n && lx.kinds[q] === KD_TEXT) {
        q = kdNextNonWs(lx, q + 1);
      }
      if (q < n && lx.kinds[q] === KD_TAG_NAME) {
        break;
      }
    }
    if (k !== KD_WS) {
      last = j;
    }
    j++;
  }
  const e = lx.ends[last];
  const b = lx.ends[i];
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
  let p = a;
  if (p < b && toI32(src[p]) === 91) {
    p++;
  }
  if (p < b && toI32(src[p]) === 96) {
    let q = p + 1;
    while (q < b && toI32(src[q]) !== 96) {
      q++;
    }
    return q < b ? String.fromBytes(src, p + 1, q) : null;
  }
  // A Kotlin identifier: letters, digits and `_` (no `$`).
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
  return String.fromBytes(src, p, q);
};
