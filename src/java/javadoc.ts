// google-java-format's javadoc formatter: JavadocLexer's tokens, its four
// cleanup passes, and JavadocWriter's filling. The regular expressions of
// the original are hand-written matchers here.
//
// Ported from google-java-format 1.28 (Apache License 2.0, Copyright 2016 Google Inc.).

import { strUtf16Len } from "../core/arr";

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

const MAX_LINE_LENGTH: i32 = 100;

class JdToks {
  types: i32[];
  values: string[];
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

class JdLexer {
  s: string = "";
  pos: i32 = 0;
  n: i32 = 0;
  braceDepth: i32 = 0;
  preDepth: i32 = 0;
  codeDepth: i32 = 0;
  tableDepth: i32 = 0;
  outerInlineTagIsSnippet: boolean = false;
  somethingSinceNewline: boolean = false;
  failed: boolean = false;

  at(i: i32): i32 {
    return i < this.n ? this.s.charCodeAt(i) : -1;
  }

  /** NEWLINE_PATTERN: [ \t]*\n[ \t]*[*]?[ \t]? ; answers the end or -1. */
  newline(): i32 {
    let i = this.pos;
    while (this.at(i) === 32 || this.at(i) === 9) {
      i++;
    }
    if (this.at(i) !== 10) {
      return -1;
    }
    i++;
    while (this.at(i) === 32 || this.at(i) === 9) {
      i++;
    }
    if (this.at(i) === 42) {
      i++;
    }
    if (this.at(i) === 32 || this.at(i) === 9) {
      i++;
    }
    return i;
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

  /** ^<(?:names)\b[^>]*> (case-insensitive); `close` adds the slash. */
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

  /** LITERAL_PATTERN: .[^ \t\n@<{}*]* */
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

  /** ^<!--.*?--> */
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

  preserve(): boolean {
    return this.preDepth > 0 || this.tableDepth > 0 || this.codeDepth > 0 || this.outerInlineTagIsSnippet;
  }

  /** One token: answers its type and sets `end`. */
  end: i32 = 0;

  next(): i32 {
    const preserving = this.preserve();
    let e = this.newline();
    if (e >= 0) {
      this.end = e;
      this.somethingSinceNewline = false;
      return preserving ? T_FORCED_NEWLINE : T_WS;
    }
    const c = this.at(this.pos);
    if (c === 32 || c === 9) {
      this.end = this.pos + 1;
      return preserving ? T_LITERAL : T_WS;
    }
    if (!this.somethingSinceNewline) {
      e = this.footer();
      if (e >= 0) {
        if (this.braceDepth > 0 || this.preDepth > 0 || this.tableDepth > 0 || this.codeDepth > 0) {
          this.failed = true;
        }
        this.end = e;
        this.somethingSinceNewline = true;
        return T_FOOTER;
      }
    }
    this.somethingSinceNewline = true;
    if (c === 123 && this.at(this.pos + 1) === 64) {
      // {@snippet\b or {@\w*
      if (startsAt(this.s, "snippet", this.pos + 2) && !isWordChar(this.at(this.pos + 9))) {
        this.end = this.pos + 9;
        if (this.braceDepth === 0) {
          this.braceDepth = this.braceDepth + 1;
          this.outerInlineTagIsSnippet = true;
          return T_SNIPPET_BEGIN;
        }
        this.braceDepth = this.braceDepth + 1;
        return T_LITERAL;
      }
      let i = this.pos + 2;
      while (isWordChar(this.at(i))) {
        i++;
      }
      this.end = i;
      this.braceDepth = this.braceDepth + 1;
      return T_LITERAL;
    }
    if (c === 123) {
      this.end = this.pos + 1;
      if (this.braceDepth > 0) {
        this.braceDepth = this.braceDepth + 1;
      }
      return T_LITERAL;
    }
    if (c === 125) {
      this.end = this.pos + 1;
      if (this.outerInlineTagIsSnippet && this.braceDepth === 1) {
        this.braceDepth = this.braceDepth - 1;
        this.outerInlineTagIsSnippet = false;
        return T_SNIPPET_END;
      }
      if (this.braceDepth > 0) {
        this.braceDepth = this.braceDepth - 1;
      }
      return T_LITERAL;
    }
    if (this.braceDepth > 0) {
      this.end = this.literal();
      return T_LITERAL;
    }
    if (c === 60) {
      e = this.tag(["pre"], false);
      if (e >= 0) {
        this.end = e;
        this.preDepth = this.preDepth + 1;
        return preserving ? T_LITERAL : T_PRE_OPEN;
      }
      e = this.tag(["pre"], true);
      if (e >= 0) {
        this.end = e;
        if (this.preDepth > 0) {
          this.preDepth = this.preDepth - 1;
        }
        return this.preserve() ? T_LITERAL : T_PRE_CLOSE;
      }
      e = this.tag(["code"], false);
      if (e >= 0) {
        this.end = e;
        this.codeDepth = this.codeDepth + 1;
        return preserving ? T_LITERAL : T_CODE_OPEN;
      }
      e = this.tag(["code"], true);
      if (e >= 0) {
        this.end = e;
        if (this.codeDepth > 0) {
          this.codeDepth = this.codeDepth - 1;
        }
        return this.preserve() ? T_LITERAL : T_CODE_CLOSE;
      }
      e = this.tag(["table"], false);
      if (e >= 0) {
        this.end = e;
        this.tableDepth = this.tableDepth + 1;
        return preserving ? T_LITERAL : T_TABLE_OPEN;
      }
      e = this.tag(["table"], true);
      if (e >= 0) {
        this.end = e;
        if (this.tableDepth > 0) {
          this.tableDepth = this.tableDepth - 1;
        }
        return this.preserve() ? T_LITERAL : T_TABLE_CLOSE;
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

/** JavadocLexer.lex; answers null when the comment does not lex (unbalanced tags). */
const lexJavadoc = (input0: string): JdToks | null => {
  // Strip /** and */, normalize line endings.
  let body = input0.substring(3, toI32(input0.length) - 2);
  if (body.indexOf("\r") >= 0) {
    let o = "";
    for (let i = 0; i < toI32(body.length); i++) {
      const c = body.charCodeAt(i);
      if (c === 13) {
        o = `${o}\n`;
        if (i + 1 < toI32(body.length) && body.charCodeAt(i + 1) === 10) {
          i++;
        }
      } else {
        o = o + body.substring(i, i + 1);
      }
    }
    body = o;
  }
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
  if (lx.failed || lx.braceDepth > 0 || lx.preDepth > 0 || lx.tableDepth > 0 || lx.codeDepth > 0) {
    return null;
  }
  raw.add(T_END, "*/");
  return deindentPreCodeBlocks(optionalizeSpacesAfterLinks(inferParagraphTags(joinAdjacent(raw))));
};

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
      out.add(input.types[i], input.values[i]);
      i++;
      continue;
    }
    let ws = "";
    while (i < n && input.types[i] === T_WS) {
      ws = ws + input.values[i];
      i++;
    }
    if (i < n && input.types[i] === T_LITERAL && input.values[i].startsWith("@")) {
      acc = `${acc} ${input.values[i]}`;
      i++;
      continue;
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

class JdWriter {
  blockIndent: i32 = 0;
  out: string[];
  continuingListItemOfInnermostList: boolean = false;
  continuingFooterTag: boolean = false;
  continuingListItemCount: i32 = 0;
  continuingListCount: i32 = 0;
  postWriteModifiedContinuingListCount: i32 = 0;
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

  innerIndent(): i32 {
    let ii = this.continuingListItemCount * 4 + this.continuingListCount * 2;
    if (this.continuingFooterTag) {
      ii += 4;
    }
    return ii;
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

  writeToken(type: i32, value: string): void {
    if (this.hasMoeBegin) {
      this.request(RW_NEWLINE);
    }
    if (
      this.requested === RW_BLANK_LINE &&
      (this.postWriteModifiedContinuingListCount > 0 || this.continuingFooterTag)
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
      this.request(RW_NEWLINE);
      this.writeToken(type, value);
      return;
    }
    this.append(value);
    if (type !== T_LI_OPEN && type !== T_P_OPEN && type !== T_H_OPEN) {
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
        this.continuingListItemCount = 0;
        this.continuingListCount = 0;
        this.postWriteModifiedContinuingListCount = 0;
        if (!this.wroteAnythingSignificant) {
          // nothing
        } else if (!this.continuingFooterTag) {
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
        this.continuingListCount = this.continuingListCount + 1;
        this.postWriteModifiedContinuingListCount = this.postWriteModifiedContinuingListCount + 1;
        this.request(RW_NEWLINE);
        break;
      case T_LIST_CLOSE:
        this.request(RW_NEWLINE);
        if (this.continuingListItemCount > 0) {
          this.continuingListItemCount = this.continuingListItemCount - 1;
        }
        if (this.continuingListCount > 0) {
          this.continuingListCount = this.continuingListCount - 1;
        }
        this.writeToken(type, value);
        if (this.postWriteModifiedContinuingListCount > 0) {
          this.postWriteModifiedContinuingListCount = this.postWriteModifiedContinuingListCount - 1;
        }
        this.request(RW_BLANK_LINE);
        break;
      case T_LI_OPEN:
        this.request(RW_NEWLINE);
        if (this.continuingListItemOfInnermostList) {
          this.continuingListItemOfInnermostList = false;
          if (this.continuingListItemCount > 0) {
            this.continuingListItemCount = this.continuingListItemCount - 1;
          }
        }
        this.writeToken(type, value);
        this.continuingListItemOfInnermostList = true;
        this.continuingListItemCount = this.continuingListItemCount + 1;
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
      case T_BQ_CLOSE:
        this.request(RW_BLANK_LINE);
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
        this.newline(false);
        this.spaces(this.indentForMoeEnd);
        this.writeToken(type, value);
        this.request(RW_NEWLINE);
        break;
      case T_HTML_COMMENT:
        this.request(RW_NEWLINE);
        this.writeToken(type, value);
        this.request(RW_NEWLINE);
        break;
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

/** JavadocFormatter.formatJavadoc. */
export const formatJavadoc = (input: string, blockIndent: i32): string => {
  const toks = lexJavadoc(input);
  if (toks === null) {
    return input;
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
