// google-java-format's javadoc formatter: JavadocFormatter's preparation of
// the comment text, JavadocLexer's tokens and its four cleanup passes, and
// JavadocWriter's filling. The regular expressions of the original are
// hand-written matchers here. Only classic `/** */` javadoc is ported: the
// reference treats `///` as javadoc only when it runs on JDK 23 or newer, and
// the corpus runs it on JDK 21, where `///` is a line comment.
//
// Ported from google-java-format 2.0.0 (Apache License 2.0, Copyright 2016 Google Inc.).

import { strUtf16Len } from "../core/arr";
import { splitLines } from "../gdoc/comments";

// Token types.
const T_BEGIN: i32 = 1;
const T_END: i32 = 2;
const T_FOOTER: i32 = 3;
const T_SNIPPET_BEGIN: i32 = 4;
const T_SNIPPET_END: i32 = 5;
const T_LIST_OPEN: i32 = 6;
const T_LIST_CLOSE: i32 = 7;
const T_LI_OPEN: i32 = 8;
const T_LI_CLOSE: i32 = 9;
const T_H_OPEN: i32 = 10;
const T_H_CLOSE: i32 = 11;
const T_P_OPEN: i32 = 12;
const T_P_CLOSE: i32 = 13;
const T_BQ_OPEN: i32 = 14;
const T_BQ_CLOSE: i32 = 15;
const T_PRE_OPEN: i32 = 16;
const T_PRE_CLOSE: i32 = 17;
const T_CODE_OPEN: i32 = 18;
const T_CODE_CLOSE: i32 = 19;
const T_TABLE_OPEN: i32 = 20;
const T_TABLE_CLOSE: i32 = 21;
const T_MOE_BEGIN: i32 = 22;
const T_MOE_END: i32 = 23;
const T_HTML_COMMENT: i32 = 24;
const T_BR: i32 = 25;
const T_WS: i32 = 26;
const T_FORCED_NEWLINE: i32 = 27;
const T_OPTIONAL_BREAK: i32 = 28;
const T_LITERAL: i32 = 29;

// JavadocLexer.NestingContext, for the classic contexts.
const NC_PRE: i32 = 1;
const NC_CODE: i32 = 2;
const NC_TABLE: i32 = 3;
const NC_SNIPPET: i32 = 4;
const NC_BRACE: i32 = 5;
const NC_INLINE_TAG: i32 = 6;

const MAX_LINE_LENGTH: i32 = 100;

class JdToks {
  types: i32[];
  values: string[];
  /** A decision needed Character.isLetterOrDigit on a character this port cannot classify. */
  undecidable: boolean = false;
  constructor() {
    this.types = [];
    this.values = [];
  }
  add(type: i32, value: string): void {
    this.types.push(type);
    this.values.push(value);
  }
  size(): i32 {
    return toI32(this.types.length);
  }
}

/** Whether `s` has `p` at byte `i`. */
const startsAt = (s: string, p: string, i: i32): boolean => {
  const k = toI32(p.length);
  if (i < 0 || i + k > toI32(s.length)) {
    return false;
  }
  for (let q = 0; q < k; q++) {
    if (s.charCodeAt(i + q) !== p.charCodeAt(q)) {
      return false;
    }
  }
  return true;
};

const isWordChar = (c: i32): boolean =>
  (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95;

const jdLower = (c: i32): i32 => (c >= 65 && c <= 90 ? c + 32 : c);

const isJdSpaceOrTab = (c: i32): boolean => c === 32 || c === 9;

/** BRACE_CONTEXTS: contexts a left brace opens and the matching right brace closes. */
const isJdBraceContext = (c: i32): boolean => c === NC_SNIPPET || c === NC_INLINE_TAG || c === NC_BRACE;

/** JavadocLexer's NestingStack<NestingContext>; the top is the last element. */
class JdLexer {
  s: string = "";
  pos: i32 = 0;
  n: i32 = 0;
  stack: i32[];
  somethingSinceNewline: boolean = false;
  failed: boolean = false;
  /** The end of the token `next` read. */
  end: i32 = 0;

  constructor() {
    this.stack = [];
  }

  at(i: i32): i32 {
    return i < this.n ? this.s.charCodeAt(i) : -1;
  }

  contains(v: i32): boolean {
    return this.stack.indexOf(v) >= 0;
  }

  /** containsAny(BRACE_CONTEXTS). */
  inBraceContext(): boolean {
    return this.stack.some(isJdBraceContext);
  }

  /** containsAny(TAG_CONTEXTS). */
  inTagContext(): boolean {
    return this.contains(NC_SNIPPET) || this.contains(NC_INLINE_TAG);
  }

  /** containsAny(PRESERVE_FORMATTING_CONTEXTS). */
  preserve(): boolean {
    return this.contains(NC_PRE) || this.contains(NC_TABLE) || this.contains(NC_CODE) || this.contains(NC_SNIPPET);
  }

  /** NestingStack.popUntil: if `v` is on the stack, pop it and everything above it. */
  popUntil(v: i32): void {
    if (!this.contains(v)) {
      return;
    }
    let popped = -1;
    while (popped !== v) {
      popped = this.stack[this.stack.length - 1];
      this.stack.pop();
    }
  }

  /** NestingStack.popIfIn(BRACE_CONTEXTS): the context popped, or 0. */
  popIfBrace(): i32 {
    const k = toI32(this.stack.length);
    if (k === 0) {
      return 0;
    }
    const top = this.stack[k - 1];
    if (!isJdBraceContext(top)) {
      return 0;
    }
    this.stack.pop();
    return top;
  }

  /** NEWLINE_PATTERN: [ \t]*\n ; answers the end or -1. */
  newline(): i32 {
    let i = this.pos;
    while (isJdSpaceOrTab(this.at(i))) {
      i++;
    }
    return this.at(i) === 10 ? i + 1 : -1;
  }

  /** FOOTER_TAG_PATTERN: @(param\s+<\w+>|[a-z]\w*). */
  footer(): i32 {
    let i = this.pos;
    if (this.at(i) !== 64) {
      return -1;
    }
    i++;
    if (startsAt(this.s, "param", i)) {
      let j = i + 5;
      let ws = 0;
      while (isJdWs(this.at(j))) {
        j++;
        ws++;
      }
      if (ws > 0 && this.at(j) === 60) {
        let k = j + 1;
        const k0 = k;
        while (isWordChar(this.at(k))) {
          k++;
        }
        if (k > k0 && this.at(k) === 62) {
          return k + 1;
        }
      }
    }
    const c = this.at(i);
    if (c >= 97 && c <= 122) {
      i++;
      while (isWordChar(this.at(i))) {
        i++;
      }
      return i;
    }
    return -1;
  }

  /** <(?:names)\b[^>]*> (case-insensitive); `close` adds the slash. */
  tag(names: string[], close: boolean): i32 {
    let i = this.pos;
    if (this.at(i) !== 60) {
      return -1;
    }
    i++;
    if (close) {
      if (this.at(i) !== 47) {
        return -1;
      }
      i++;
    }
    let matched = -1;
    for (const nm of names) {
      let ok = true;
      for (let q = 0; q < toI32(nm.length); q++) {
        const want = nm.charCodeAt(q);
        const got = jdLower(this.at(i + q));
        if (want === 63) {
          // `?` stands for a digit 1-6 (h[1-6]).
          if (got < 49 || got > 54) {
            ok = false;
            break;
          }
        } else if (got !== want) {
          ok = false;
          break;
        }
      }
      if (ok && !isWordChar(this.at(i + toI32(nm.length)))) {
        matched = i + toI32(nm.length);
        break;
      }
    }
    if (matched < 0) {
      return -1;
    }
    let j = matched;
    while (j < this.n && this.at(j) !== 62) {
      j++;
    }
    if (j >= this.n) {
      return -1;
    }
    return j + 1;
  }

  /** CLASSIC_LITERAL_PATTERN: .[^ \t\n@<{}*]* */
  literal(): i32 {
    let i = this.pos + 1;
    while (i < this.n) {
      const c = this.at(i);
      if (c === 32 || c === 9 || c === 10 || c === 64 || c === 60 || c === 123 || c === 125 || c === 42) {
        break;
      }
      i++;
    }
    return i;
  }

  /** <!--.*?--> */
  htmlComment(): i32 {
    if (!startsAt(this.s, "<!--", this.pos)) {
      return -1;
    }
    const e = this.s.indexOf("-->", this.pos + 4);
    return e < 0 ? -1 : e + 3;
  }

  /** <!--\s*MOE:begin_intracomment_strip\s*--> and the end variant. */
  moe(word: string): i32 {
    if (!startsAt(this.s, "<!--", this.pos)) {
      return -1;
    }
    let i = this.pos + 4;
    while (isJdWs(this.at(i))) {
      i++;
    }
    if (!startsAt(this.s, word, i)) {
      return -1;
    }
    i += toI32(word.length);
    while (isJdWs(this.at(i))) {
      i++;
    }
    if (!startsAt(this.s, "-->", i)) {
      return -1;
    }
    return i + 3;
  }

  /** An open or close tag that pushes or pops `ctx`; answers its token type, or 0. */
  contextTag(name: string, ctx: i32, open: i32, close: i32, preserving: boolean): i32 {
    let e = this.tag([name], false);
    if (e >= 0) {
      this.end = e;
      this.stack.push(ctx);
      return preserving ? T_LITERAL : open;
    }
    e = this.tag([name], true);
    if (e >= 0) {
      this.end = e;
      this.popUntil(ctx);
      return this.preserve() ? T_LITERAL : close;
    }
    return 0;
  }

  /** JavadocLexer.consumeToken for classic javadoc: answers its type and sets `end`. */
  next(): i32 {
    const preserving = this.preserve();
    let e = this.newline();
    if (e >= 0) {
      this.end = e;
      this.somethingSinceNewline = false;
      return preserving ? T_FORCED_NEWLINE : T_WS;
    }
    const c = this.at(this.pos);
    if (isJdSpaceOrTab(c)) {
      this.end = this.pos + 1;
      return preserving ? T_LITERAL : T_WS;
    }
    if (!this.somethingSinceNewline) {
      e = this.footer();
      if (e >= 0) {
        // checkMatchingTags
        if (this.stack.length !== 0) {
          this.failed = true;
        }
        this.end = e;
        this.somethingSinceNewline = true;
        return T_FOOTER;
      }
    }
    this.somethingSinceNewline = true;
    if (c === 123 && this.at(this.pos + 1) === 64) {
      if (startsAt(this.s, "snippet", this.pos + 2) && !isWordChar(this.at(this.pos + 9))) {
        this.end = this.pos + 9;
        if (this.inBraceContext()) {
          this.stack.push(NC_BRACE);
          return T_LITERAL;
        }
        this.stack.push(NC_SNIPPET);
        return T_SNIPPET_BEGIN;
      }
      let i = this.pos + 2;
      while (isWordChar(this.at(i))) {
        i++;
      }
      this.end = i;
      this.stack.push(NC_INLINE_TAG);
      return T_LITERAL;
    }
    if (c === 123) {
      this.end = this.pos + 1;
      if (this.inBraceContext()) {
        this.stack.push(NC_BRACE);
      }
      return T_LITERAL;
    }
    if (c === 125) {
      this.end = this.pos + 1;
      return this.popIfBrace() === NC_SNIPPET ? T_SNIPPET_END : T_LITERAL;
    }
    if (this.inTagContext()) {
      this.end = this.literal();
      return T_LITERAL;
    }
    if (c === 60) {
      let t = this.contextTag("pre", NC_PRE, T_PRE_OPEN, T_PRE_CLOSE, preserving);
      if (t === 0) {
        t = this.contextTag("code", NC_CODE, T_CODE_OPEN, T_CODE_CLOSE, preserving);
      }
      if (t === 0) {
        t = this.contextTag("table", NC_TABLE, T_TABLE_OPEN, T_TABLE_CLOSE, preserving);
      }
      if (t !== 0) {
        return t;
      }
    }
    if (preserving) {
      this.end = this.literal();
      return T_LITERAL;
    }
    if (c === 60) {
      const kinds: i32[] = [
        T_P_OPEN,
        T_P_CLOSE,
        T_LIST_OPEN,
        T_LIST_CLOSE,
        T_LI_OPEN,
        T_LI_CLOSE,
        T_BQ_OPEN,
        T_BQ_CLOSE,
        T_H_OPEN,
        T_H_CLOSE,
        T_BR,
      ];
      for (const k of kinds) {
        const e2 = this.tagOf(k);
        if (e2 >= 0) {
          this.end = e2;
          return k;
        }
      }
      e = this.moe("MOE:begin_intracomment_strip");
      if (e >= 0) {
        this.end = e;
        return T_MOE_BEGIN;
      }
      e = this.moe("MOE:end_intracomment_strip");
      if (e >= 0) {
        this.end = e;
        return T_MOE_END;
      }
      e = this.htmlComment();
      if (e >= 0) {
        this.end = e;
        return T_HTML_COMMENT;
      }
    }
    this.end = this.literal();
    return T_LITERAL;
  }

  private tagOf(k: i32): i32 {
    switch (k) {
      case T_P_OPEN:
        return this.tag(["p"], false);
      case T_P_CLOSE:
        return this.tag(["p"], true);
      case T_LIST_OPEN:
        return this.tag(["ul", "ol", "dl"], false);
      case T_LIST_CLOSE:
        return this.tag(["ul", "ol", "dl"], true);
      case T_LI_OPEN:
        return this.tag(["li", "dt", "dd"], false);
      case T_LI_CLOSE:
        return this.tag(["li", "dt", "dd"], true);
      case T_BQ_OPEN:
        return this.tag(["blockquote"], false);
      case T_BQ_CLOSE:
        return this.tag(["blockquote"], true);
      case T_H_OPEN:
        return this.tag(["h?"], false);
      case T_H_CLOSE:
        return this.tag(["h?"], true);
      default:
        return this.tag(["br"], false);
    }
  }
}

const isJdWs = (c: i32): boolean => c === 32 || c === 9 || c === 10 || c === 13 || c === 12 || c === 11;

const countNewlines = (s: string): i32 => {
  let n = 0;
  for (let i = 0; i < toI32(s.length); i++) {
    if (s.charCodeAt(i) === 10) {
      n++;
    }
  }
  return n;
};

/** NOT_SPACE_OR_TAB.indexIn: the first character that is not a space or tab, or -1. */
const jdFirstNonSpaceOrTab = (s: string): i32 => {
  for (let i = 0; i < toI32(s.length); i++) {
    if (!isJdSpaceOrTab(s.charCodeAt(i))) {
      return i;
    }
  }
  return -1;
};

/** CLASSIC_PREFIX_PATTERN ^[ \t]*[*][ \t]? : the end of the match, or -1. */
const jdClassicPrefixEnd = (s: string): i32 => {
  const n = toI32(s.length);
  let i = 0;
  while (i < n && isJdSpaceOrTab(s.charCodeAt(i))) {
    i++;
  }
  if (i >= n || s.charCodeAt(i) !== 42) {
    return -1;
  }
  i++;
  if (i < n && isJdSpaceOrTab(s.charCodeAt(i))) {
    i++;
  }
  return i;
};

/*
 * Lengths below are compared in bytes where the reference compares UTF-16 units. That is
 * exact: a line is cut only inside its leading spaces and tabs, and a line shorter than the
 * cut is all spaces and tabs.
 */

/** JavadocFormatter.jdStripCommonLeadingWhitespace. */
const jdStripCommonLeadingWhitespace = (lines: string[]): string => {
  let leading = -1;
  for (const l of lines) {
    const i = jdFirstNonSpaceOrTab(l);
    if (i >= 0 && (leading < 0 || i < leading)) {
      leading = i;
    }
  }
  if (leading < 0) {
    leading = 0;
  }
  const out: string[] = [];
  for (const l of lines) {
    out.push(toI32(l.length) < leading ? "" : l.substring(leading, toI32(l.length)));
  }
  return out.join("\n");
};

/**
 * JavadocFormatter.jdClassicCommentText: the comment without its leading slash-star-star and
 * trailing star-slash (and any stars before that), each line's leading star, and the
 * whitespace every line shares.
 */
const jdClassicCommentText = (input: string): string => {
  let end = toI32(input.length) - 2;
  while (end > 3 && input.charCodeAt(end - 1) === 42) {
    end--;
  }
  const lines = splitLines(input.substring(3, end));
  // The first line keeps a leading `*`, as in `/** * foo\n * bar\n */`.
  let starPrefixLength = -1;
  let nonStarMinLeading = -1;
  for (let i = 1; i < toI32(lines.length); i++) {
    const p = jdClassicPrefixEnd(lines[i]);
    if (p >= 0) {
      if (starPrefixLength < 0 || p < starPrefixLength) {
        starPrefixLength = p;
      }
    } else {
      const k = jdFirstNonSpaceOrTab(lines[i]);
      if (k >= 0 && (nonStarMinLeading < 0 || k < nonStarMinLeading)) {
        nonStarMinLeading = k;
      }
    }
  }
  const starLen = starPrefixLength < 0 ? 0 : starPrefixLength;
  const nonStarLen = nonStarMinLeading < 0 ? 0 : nonStarMinLeading;
  const nonStarStripCount = starLen < nonStarLen ? starLen : nonStarLen;
  const processed: string[] = [lines[0]];
  for (let i = 1; i < toI32(lines.length); i++) {
    const l = lines[i];
    const p = jdClassicPrefixEnd(l);
    if (p >= 0) {
      processed.push(l.substring(p, toI32(l.length)));
    } else {
      processed.push(toI32(l.length) >= nonStarStripCount ? l.substring(nonStarStripCount, toI32(l.length)) : "");
    }
  }
  return jdStripCommonLeadingWhitespace(processed);
};

/** JavadocLexer.lex for classic javadoc, on jdClassicCommentText's output; null when it does not lex. */
const lexJavadoc = (body: string): JdToks | null => {
  const lx = new JdLexer();
  lx.s = body;
  lx.n = toI32(body.length);
  const raw = new JdToks();
  raw.add(T_BEGIN, "/**");
  while (lx.pos < lx.n) {
    const type = lx.next();
    raw.add(type, body.substring(lx.pos, lx.end));
    lx.pos = lx.end;
  }
  if (lx.failed || lx.stack.length !== 0) {
    return null;
  }
  raw.add(T_END, "*/");
  const joined = joinAdjacent(raw);
  if (joined.undecidable) {
    return joined;
  }
  return deindentPreCodeBlocks(optionalizeSpacesAfterLinks(inferParagraphTags(joined)));
};

/**
 * Character.isLetterOrDigit on the UTF-16 unit that holds the code point at byte `i`: 1, 0,
 * or -1 where this port cannot tell (a letter or digit above U+00FF is not classified).
 */
const jdLetterOrDigitAt = (s: string, i: i32): i32 => {
  const c = s.charCodeAt(i);
  if (c < 0x80) {
    return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) ? 1 : 0;
  }
  if (c >= 0xf0) {
    // A supplementary code point: charAt sees a surrogate, which is neither.
    return 0;
  }
  if (c >= 0xc2 && c <= 0xc3 && i + 1 < toI32(s.length)) {
    const cp = ((c & 0x1f) << 6) | (s.charCodeAt(i + 1) & 0x3f);
    // Latin-1: ª µ º and À-ÿ except × and ÷ are letters; nothing in it is a digit.
    if (cp === 0xaa || cp === 0xb5 || cp === 0xba) {
      return 1;
    }
    return cp >= 0xc0 && cp !== 0xd7 && cp !== 0xf7 ? 1 : 0;
  }
  return -1;
};

/** isWordChar (letter, digit or `_`) at byte `i`, as jdLetterOrDigitAt answers. */
const jdWordCharAt = (s: string, i: i32): i32 => (s.charCodeAt(i) === 95 ? 1 : jdLetterOrDigitAt(s, i));

/** jdIsHyphenatedWordEnd: ends in `-` after a word character. */
const jdIsHyphenatedWordEnd = (s: string): i32 => {
  let k = toI32(s.length) - 1;
  if (k < 1 || s.charCodeAt(k) !== 45) {
    return 0;
  }
  // The start of the code point before the hyphen.
  k--;
  while (k > 0 && (s.charCodeAt(k) & 0xc0) === 0x80) {
    k--;
  }
  return jdWordCharAt(s, k);
};

/** jdIsWordStart. */
const jdIsWordStart = (s: string): i32 => (s.length === 0 ? 0 : jdWordCharAt(s, 0));

/** joinAdjacentLiteralsAndAdjacentWhitespace. */
const joinAdjacent = (input: JdToks): JdToks => {
  const out = new JdToks();
  let acc = "";
  let i = 0;
  const n = input.size();
  while (i < n) {
    if (input.types[i] === T_LITERAL) {
      acc = acc + input.values[i];
      i++;
      continue;
    }
    if (acc.length === 0) {
      if (input.types[i] === T_WS) {
        let ws = "";
        while (i < n && input.types[i] === T_WS) {
          ws = ws + input.values[i];
          i++;
        }
        out.add(T_WS, ws);
      } else {
        out.add(input.types[i], input.values[i]);
        i++;
      }
      continue;
    }
    let ws = "";
    while (i < n && input.types[i] === T_WS) {
      ws = ws + input.values[i];
      i++;
    }
    const nextLiteral = i < n && input.types[i] === T_LITERAL;
    if (nextLiteral && input.values[i].startsWith("@")) {
      acc = `${acc} ${input.values[i]}`;
      i++;
      continue;
    }
    // A word hyphenated across a line break is joined back together (but not "pre- and post-").
    if (nextLiteral && countNewlines(ws) === 1 && input.values[i] !== "and" && input.values[i] !== "or") {
      const end = jdIsHyphenatedWordEnd(acc);
      const start = end === 0 ? 0 : jdIsWordStart(input.values[i]);
      if (end === 1 && start === 1) {
        acc = acc + input.values[i];
        i++;
        continue;
      }
      if (end !== 0 && start !== 0) {
        out.undecidable = true;
      }
    }
    out.add(T_LITERAL, acc);
    acc = "";
    if (ws.length > 0) {
      out.add(T_WS, ws);
    }
  }
  return out;
};

const inferParagraphTags = (input: JdToks): JdToks => {
  const out = new JdToks();
  let i = 0;
  const n = input.size();
  while (i < n) {
    if (input.types[i] === T_LITERAL) {
      out.add(T_LITERAL, input.values[i]);
      i++;
      if (i < n && input.types[i] === T_WS && countNewlines(input.values[i]) > 1) {
        out.add(T_WS, input.values[i]);
        i++;
        if (i < n && input.types[i] === T_LITERAL) {
          out.add(T_P_OPEN, "<p>");
        }
      }
    } else {
      out.add(input.types[i], input.values[i]);
      i++;
    }
  }
  return out;
};

/** Whether `s` matches ^href=[^>]*> exactly. */
const isHrefLiteral = (s: string): boolean => {
  if (!s.startsWith("href=")) {
    return false;
  }
  const gt = s.indexOf(">", 5);
  return gt === toI32(s.length) - 1;
};

const optionalizeSpacesAfterLinks = (input: JdToks): JdToks => {
  const out = new JdToks();
  let i = 0;
  const n = input.size();
  while (i < n) {
    if (input.types[i] === T_LITERAL && isHrefLiteral(input.values[i])) {
      out.add(T_LITERAL, input.values[i]);
      i++;
      if (i < n && input.types[i] === T_WS) {
        out.add(T_OPTIONAL_BREAK, input.values[i]);
        i++;
      }
    } else {
      out.add(input.types[i], input.values[i]);
      i++;
    }
  }
  return out;
};

/** Whether `s` matches [ \t]*[{]@code exactly. */
const isBraceCode = (s: string): boolean => {
  let i = 0;
  while (i < toI32(s.length) && (s.charCodeAt(i) === 32 || s.charCodeAt(i) === 9)) {
    i++;
  }
  return s.substring(i, toI32(s.length)) === "{@code";
};

const trimJ = (s: string): string => {
  let a = 0;
  let b = toI32(s.length);
  while (a < b && s.charCodeAt(a) <= 32) {
    a++;
  }
  while (b > a && s.charCodeAt(b - 1) <= 32) {
    b--;
  }
  return s.substring(a, b);
};

const deindentPreCodeBlocks = (input: JdToks): JdToks => {
  const out = new JdToks();
  let i = 0;
  const n = input.size();
  while (i < n) {
    if (input.types[i] !== T_PRE_OPEN) {
      out.add(input.types[i], input.values[i]);
      i++;
      continue;
    }
    out.add(input.types[i], input.values[i]);
    i++;
    const nl0 = i;
    while (i < n && input.types[i] === T_FORCED_NEWLINE) {
      i++;
    }
    if (i >= n || input.types[i] !== T_LITERAL || !isBraceCode(input.values[i])) {
      for (let q = nl0; q < i; q++) {
        out.add(input.types[q], input.values[q]);
      }
      if (i < n) {
        out.add(input.types[i], input.values[i]);
        i++;
      }
      continue;
    }
    // deindentPreCodeBlock
    out.add(T_LITERAL, trimJ(input.values[i]));
    i++;
    const st: i32[] = [];
    const sv: string[] = [];
    while (i < n && input.types[i] !== T_PRE_CLOSE) {
      st.push(input.types[i]);
      sv.push(input.values[i]);
      i++;
    }
    let lo = 0;
    let hi = toI32(st.length);
    while (lo < hi && st[lo] === T_FORCED_NEWLINE) {
      lo++;
    }
    while (hi > lo && st[hi - 1] === T_FORCED_NEWLINE) {
      hi--;
    }
    if (lo >= hi) {
      continue;
    }
    const types: i32[] = [];
    const vals: string[] = [];
    for (let q = lo; q < hi; q++) {
      types.push(st[q]);
      vals.push(sv[q]);
    }
    let trailingBrace = false;
    const lastV = vals[vals.length - 1];
    if (types[types.length - 1] === T_LITERAL && lastV.endsWith("}")) {
      types.pop();
      vals.pop();
      if (lastV.length > 1) {
        types.push(T_LITERAL);
        vals.push(lastV.substring(0, toI32(lastV.length) - 1));
        types.push(T_FORCED_NEWLINE);
        vals.push("");
      }
      trailingBrace = true;
    }
    let trim = -1;
    for (let q = 0; q < toI32(types.length); q++) {
      if (types[q] === T_LITERAL) {
        const v = vals[q];
        let idx = -1;
        for (let k = 0; k < toI32(v.length); k++) {
          if (v.charCodeAt(k) !== 32) {
            idx = k;
            break;
          }
        }
        if (idx !== -1 && (trim === -1 || idx < trim)) {
          trim = idx;
        }
      }
    }
    out.add(T_FORCED_NEWLINE, "\n");
    for (let q = 0; q < toI32(types.length); q++) {
      if (types[q] === T_LITERAL) {
        const v = vals[q];
        out.add(T_LITERAL, trim > 0 && toI32(v.length) > trim ? v.substring(trim, toI32(v.length)) : v);
      } else {
        out.add(types[q], vals[q]);
      }
    }
    if (trailingBrace) {
      out.add(T_LITERAL, "}");
    } else {
      out.add(T_FORCED_NEWLINE, "\n");
    }
  }
  return out;
};

// Requested whitespace.
const RW_NONE: i32 = 0;
const RW_WHITESPACE: i32 = 1;
const RW_NEWLINE: i32 = 2;
const RW_BLANK_LINE: i32 = 3;

// JavadocWriter's Indent kinds (classic javadoc has no block quote indent).
const IND_LIST: i32 = 1;
const IND_LIST_ITEM: i32 = 2;

class JdWriter {
  blockIndent: i32 = 0;
  out: string[];
  continuingListItemOfInnermostList: boolean = false;
  continuingFooterTag: boolean = false;
  /** indentStack, bottom first: each entry's kind and width. */
  indentKinds: i32[];
  indentWidths: i32[];
  /** postWriteModifiedContinuingListStack: it only ever holds 1s, so its depth. */
  postWriteModifiedContinuingListDepth: i32 = 0;
  remainingOnLine: i32 = 0;
  atStartOfLine: boolean = false;
  requested: i32 = 0;
  moeBegin: string = "";
  hasMoeBegin: boolean = false;
  indentForMoeEnd: i32 = 0;
  wroteAnythingSignificant: boolean = false;

  constructor(blockIndent: i32) {
    this.blockIndent = blockIndent;
    this.out = [];
    this.indentKinds = [];
    this.indentWidths = [];
  }

  append(s: string): void {
    this.out.push(s);
  }

  spaces(k: i32): void {
    let s = "";
    for (let i = 0; i < k; i++) {
      s = `${s} `;
    }
    this.out.push(s);
  }

  request(w: i32): void {
    if (w > this.requested) {
      this.requested = w;
    }
  }

  /** innerIndentString, as a width: classic indents are all spaces. */
  innerIndent(): i32 {
    let ii = this.continuingFooterTag ? 4 : 0;
    for (const w of this.indentWidths) {
      ii += w;
    }
    return ii;
  }

  pushIndent(kind: i32, width: i32): void {
    this.indentKinds.push(kind);
    this.indentWidths.push(width);
  }

  /** indentStack.popUntil(kind): pop the topmost `kind` entry and everything above it. */
  popIndentUntil(kind: i32): void {
    if (this.indentKinds.indexOf(kind) < 0) {
      return;
    }
    let popped = -1;
    while (popped !== kind) {
      popped = this.indentKinds[this.indentKinds.length - 1];
      this.indentKinds.pop();
      this.indentWidths.pop();
    }
  }

  newline(auto: boolean): void {
    this.append("\n");
    this.spaces(this.blockIndent + 1);
    this.append("*");
    this.spaces(1);
    this.remainingOnLine = MAX_LINE_LENGTH - this.blockIndent - 3;
    if (auto) {
      this.spaces(this.innerIndent());
      this.remainingOnLine -= this.innerIndent();
    }
    this.atStartOfLine = true;
  }

  blankLine(): void {
    this.append("\n");
    this.spaces(this.blockIndent + 1);
    this.append("*");
    this.newline(true);
  }

  flushWhitespace(): void {
    if (this.hasMoeBegin) {
      this.request(RW_NEWLINE);
    }
    if (!this.wroteAnythingSignificant) {
      this.requested = RW_NONE;
    }
    if (
      this.requested === RW_BLANK_LINE &&
      (this.postWriteModifiedContinuingListDepth > 0 || this.continuingFooterTag)
    ) {
      this.requested = RW_NEWLINE;
    }
    if (this.requested === RW_BLANK_LINE) {
      this.blankLine();
      this.requested = RW_NONE;
    } else if (this.requested === RW_NEWLINE) {
      this.newline(true);
      this.requested = RW_NONE;
    }
  }

  writeToken(type: i32, value: string): void {
    if (value.length === 0) {
      return;
    }
    this.flushWhitespace();
    const needWhitespace = this.requested === RW_WHITESPACE;
    const len = strUtf16Len(value);
    if (!this.atStartOfLine && len + (needWhitespace ? 1 : 0) > this.remainingOnLine) {
      this.newline(true);
    }
    if (!this.atStartOfLine && needWhitespace) {
      this.append(" ");
      this.remainingOnLine -= 1;
    }
    if (this.hasMoeBegin) {
      this.append(this.moeBegin);
      this.hasMoeBegin = false;
      this.indentForMoeEnd = this.innerIndent();
      this.wroteAnythingSignificant = true;
      this.request(RW_NEWLINE);
      this.writeToken(type, value);
      return;
    }
    this.append(value);
    // StartOfLineToken
    if (type !== T_LI_OPEN && type !== T_P_OPEN && type !== T_H_OPEN && type !== T_BQ_OPEN) {
      this.atStartOfLine = false;
    }
    this.remainingOnLine -= len;
    this.requested = RW_NONE;
    this.wroteAnythingSignificant = true;
  }

  write(type: i32, value: string): void {
    switch (type) {
      case T_BEGIN:
        this.append("/**");
        this.newline(true);
        break;
      case T_FOOTER:
        this.continuingListItemOfInnermostList = false;
        this.indentKinds = [];
        this.indentWidths = [];
        this.postWriteModifiedContinuingListDepth = 0;
        if (!this.continuingFooterTag) {
          this.request(RW_BLANK_LINE);
        } else {
          this.continuingFooterTag = false;
          this.request(RW_NEWLINE);
        }
        this.writeToken(type, value);
        this.continuingFooterTag = true;
        break;
      case T_SNIPPET_BEGIN:
        this.request(RW_BLANK_LINE);
        this.writeToken(type, value);
        break;
      case T_SNIPPET_END:
        this.writeToken(type, value);
        this.request(RW_BLANK_LINE);
        break;
      case T_LIST_OPEN:
        this.request(RW_BLANK_LINE);
        this.writeToken(type, value);
        this.continuingListItemOfInnermostList = false;
        this.pushIndent(IND_LIST, 2);
        this.postWriteModifiedContinuingListDepth = this.postWriteModifiedContinuingListDepth + 1;
        this.request(RW_NEWLINE);
        break;
      case T_LIST_CLOSE:
        this.request(RW_NEWLINE);
        this.popIndentUntil(IND_LIST);
        this.writeToken(type, value);
        if (this.postWriteModifiedContinuingListDepth > 0) {
          this.postWriteModifiedContinuingListDepth = this.postWriteModifiedContinuingListDepth - 1;
        }
        this.request(RW_BLANK_LINE);
        break;
      case T_LI_OPEN:
        this.request(RW_NEWLINE);
        if (this.continuingListItemOfInnermostList) {
          this.continuingListItemOfInnermostList = false;
          this.popIndentUntil(IND_LIST_ITEM);
        }
        this.writeToken(type, value);
        this.continuingListItemOfInnermostList = true;
        // The item's continuation lines line up after the tag as written (`<li>` is 4).
        this.pushIndent(IND_LIST_ITEM, strUtf16Len(value));
        break;
      case T_H_OPEN:
      case T_PRE_OPEN:
      case T_TABLE_OPEN:
        this.request(RW_BLANK_LINE);
        this.writeToken(type, value);
        break;
      case T_H_CLOSE:
      case T_PRE_CLOSE:
      case T_TABLE_CLOSE:
        this.writeToken(type, value);
        this.request(RW_BLANK_LINE);
        break;
      case T_P_OPEN:
        if (!this.wroteAnythingSignificant) {
          return;
        }
        this.request(RW_BLANK_LINE);
        this.writeToken(type, standardizeTag(value, "<p>"));
        break;
      case T_BQ_OPEN:
        this.request(RW_BLANK_LINE);
        this.writeToken(type, value);
        this.request(RW_NEWLINE);
        break;
      case T_BQ_CLOSE:
        this.request(RW_NEWLINE);
        this.writeToken(type, value);
        this.request(RW_BLANK_LINE);
        break;
      case T_CODE_OPEN:
      case T_CODE_CLOSE:
      case T_LITERAL:
        this.writeToken(type, value);
        break;
      case T_MOE_BEGIN:
        this.moeBegin = value;
        this.hasMoeBegin = true;
        break;
      case T_MOE_END:
        this.requested = RW_NONE;
        this.newline(false);
        this.spaces(this.indentForMoeEnd);
        this.writeToken(type, value);
        this.request(RW_NEWLINE);
        break;
      case T_HTML_COMMENT: {
        this.request(RW_NEWLINE);
        // A comment over several lines keeps their text, each after a bare ` * `.
        const lines = splitLines(value);
        this.writeToken(type, lines[0]);
        for (let i = 1; i < toI32(lines.length); i++) {
          this.newline(false);
          this.append(lines[i]);
          this.remainingOnLine -= strUtf16Len(lines[i]);
        }
        this.request(RW_NEWLINE);
        break;
      }
      case T_BR:
        this.writeToken(type, standardizeTag(value, "<br>"));
        this.request(RW_NEWLINE);
        break;
      case T_WS:
        this.request(RW_WHITESPACE);
        break;
      case T_FORCED_NEWLINE:
        this.newline(false);
        break;
      default:
        break;
    }
  }
}

/** SIMPLE_TAG_PATTERN ^<\w+\s*\/?\s*> (matches()): the standard form, else the token. */
const standardizeTag = (value: string, std: string): string => {
  let i = 0;
  const n = toI32(value.length);
  if (i >= n || value.charCodeAt(i) !== 60) {
    return value;
  }
  i++;
  const w0 = i;
  while (i < n && isWordChar(value.charCodeAt(i))) {
    i++;
  }
  if (i === w0) {
    return value;
  }
  while (i < n && isJdWs(value.charCodeAt(i))) {
    i++;
  }
  if (i < n && value.charCodeAt(i) === 47) {
    i++;
  }
  while (i < n && isJdWs(value.charCodeAt(i))) {
    i++;
  }
  if (i === n - 1 && value.charCodeAt(i) === 62) {
    return std;
  }
  return value;
};

/**
 * JavadocFormatter.formatJavadoc for a classic javadoc comment. A comment that does not lex
 * (an unclosed tag) comes back unchanged, as in the reference; null means the answer turned on
 * a character this port cannot classify, so the file must be left alone.
 */
export const formatJavadoc = (input: string, blockIndent: i32): string | null => {
  const toks = lexJavadoc(jdClassicCommentText(input));
  if (toks === null) {
    return input;
  }
  if (toks.undecidable) {
    return null;
  }
  const w = new JdWriter(blockIndent);
  for (let i = 0; i < toks.size(); i++) {
    const type = toks.types[i];
    if (type === T_END) {
      w.append("\n");
      w.spaces(blockIndent + 1);
      w.append("*/");
      break;
    }
    w.write(type, toks.values[i]);
  }
  const result = w.out.join("");
  return makeSingleLineIfPossible(blockIndent, result);
};

/** ONE_CONTENT_LINE_PATTERN ` *\/[*][*]\n *[*] (.*)\n *[*]\/`, then the one-liner rules. */
const makeSingleLineIfPossible = (blockIndent: i32, input: string): string => {
  const n = toI32(input.length);
  let i = 0;
  while (i < n && input.charCodeAt(i) === 32) {
    i++;
  }
  if (!startsAt(input, "/**\n", i)) {
    return input;
  }
  i += 4;
  while (i < n && input.charCodeAt(i) === 32) {
    i++;
  }
  if (!startsAt(input, "* ", i)) {
    return input;
  }
  i += 2;
  const nl = input.indexOf("\n", i);
  if (nl < 0) {
    return input;
  }
  const line = input.substring(i, nl);
  let j = nl + 1;
  while (j < n && input.charCodeAt(j) === 32) {
    j++;
  }
  if (j !== n - 2 || !startsAt(input, "*/", j)) {
    return input;
  }
  if (line.length === 0) {
    return "/** */";
  }
  const limit = MAX_LINE_LENGTH - 7 - blockIndent;
  if (strUtf16Len(line) > limit) {
    return input;
  }
  if (line.startsWith("@") && line !== "@hide") {
    return input;
  }
  return `/** ${line} */`;
};
