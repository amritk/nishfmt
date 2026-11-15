// The Kotlin lexer, ported from the Kotlin compiler's Kotlin.flex (Apache
// License 2.0, Copyright JetBrains s.r.o. and Kotlin Programming Language
// contributors). Longest match wins and ties go to the earlier rule, as in
// JFlex; string templates and comments keep JFlex's state stack.

import { growI32 } from "../core/arr";
import {
  T_ANDAND,
  T_AND,
  T_ARROW,
  T_AS_KEYWORD,
  T_AS_SAFE,
  T_AT,
  T_BAD_CHARACTER,
  T_BLOCK_COMMENT,
  T_BREAK_KEYWORD,
  T_CHARACTER_LITERAL,
  T_CLASS_KEYWORD,
  T_CLOSING_QUOTE,
  T_COLON,
  T_COLONCOLON,
  T_COMMA,
  T_CONTINUE_KEYWORD,
  T_DANGLING_NEWLINE,
  T_DIV,
  T_DIVEQ,
  T_DOC_COMMENT,
  T_DOT,
  T_DOUBLE_ARROW,
  T_DOUBLE_SEMICOLON,
  T_DO_KEYWORD,
  T_ELSE_KEYWORD,
  T_EOL_COMMENT,
  T_EQ,
  T_EQEQ,
  T_EQEQEQ,
  T_ESCAPE_SEQUENCE,
  T_EXCL,
  T_EXCLEQ,
  T_EXCLEQEQEQ,
  T_FALSE_KEYWORD,
  T_FIELD_IDENTIFIER,
  T_FLOAT_LITERAL,
  T_FOR_KEYWORD,
  T_FUN_KEYWORD,
  T_GT,
  T_GTEQ,
  T_HASH,
  T_IDENTIFIER,
  T_IF_KEYWORD,
  T_INTEGER_LITERAL,
  T_INTERFACE_KEYWORD,
  T_INTERPOLATION_PREFIX,
  T_IN_KEYWORD,
  T_IS_KEYWORD,
  T_LBRACE,
  T_LBRACKET,
  T_LONG_TEMPLATE_ENTRY_END,
  T_LONG_TEMPLATE_ENTRY_START,
  T_LPAR,
  T_LT,
  T_LTEQ,
  T_MINUS,
  T_MINUSEQ,
  T_MINUSMINUS,
  T_MUL,
  T_MULTEQ,
  T_NOT_IN,
  T_NOT_IS,
  T_NULL_KEYWORD,
  T_OBJECT_KEYWORD,
  T_OPEN_QUOTE,
  T_OROR,
  T_PACKAGE_KEYWORD,
  T_PERC,
  T_PERCEQ,
  T_PLUS,
  T_PLUSEQ,
  T_PLUSPLUS,
  T_QUEST,
  T_RANGE,
  T_RANGE_UNTIL,
  T_RBRACE,
  T_RBRACKET,
  T_REGULAR_STRING_PART,
  T_RESERVED,
  T_RETURN_KEYWORD,
  T_RPAR,
  T_SEMICOLON,
  T_SHEBANG_COMMENT,
  T_SHORT_TEMPLATE_ENTRY_START,
  T_SUPER_KEYWORD,
  T_THIS_KEYWORD,
  T_THROW_KEYWORD,
  T_TRUE_KEYWORD,
  T_TRY_KEYWORD,
  T_TYPEOF_KEYWORD,
  T_TYPE_ALIAS_KEYWORD,
  T_VAL_KEYWORD,
  T_VAR_KEYWORD,
  T_WHEN_KEYWORD,
  T_WHILE_KEYWORD,
  T_WHITE_SPACE,
} from "./types";

// Lexer states.
const S_INITIAL: i32 = 0;
const S_STRING_PREFIX: i32 = 1;
const S_STRING: i32 = 2;
const S_RAW_STRING: i32 = 3;
const S_SHORT_TEMPLATE_ENTRY: i32 = 4;
const S_LONG_TEMPLATE_ENTRY: i32 = 5;
const S_UNMATCHED_BACKTICK: i32 = 6;

const kIsDigit = (c: i32): boolean => c >= 48 && c <= 57;
const kIsLetter = (c: i32): boolean => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;

/**
 * Character.isLetter for a non-ASCII code point, close enough for source code:
 * Latin-1's letters, and above U+00FF everything but the punctuation,
 * symbol and emoji blocks.
 */
const kIsUnicodeLetter = (cp: i32): boolean => {
  if (cp < 0x100) {
    return cp === 0xaa || cp === 0xb5 || cp === 0xba || (cp >= 0xc0 && cp <= 0xff && cp !== 0xd7 && cp !== 0xf7);
  }
  if (cp >= 0x2000 && cp <= 0x2bff) {
    return (cp >= 0x2c00 && cp <= 0x2dff) || cp === 0x2071 || cp === 0x207f || (cp >= 0x2090 && cp <= 0x209c) || (cp >= 0x2102 && cp <= 0x214f && cp !== 0x2118);
  }
  if (cp >= 0x3000 && cp <= 0x303f) {
    return cp === 0x3005 || cp === 0x3006 || (cp >= 0x3031 && cp <= 0x3035) || cp === 0x303b || cp === 0x303c;
  }
  if (cp >= 0xfe30 && cp <= 0xfe4f) {
    return false;
  }
  if (cp >= 0xff00 && cp <= 0xff20) {
    return false;
  }
  if (cp >= 0x1f000) {
    return false;
  }
  return true;
};

/** The code point and length of the UTF-8 sequence at `i`. */
class KCp {
  cp: i32 = 0;
  len: i32 = 1;
}
const kIsHex = (c: i32): boolean => kIsDigit(c) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70);

/** The lexemes of a Kotlin file: every token, whitespace run and comment. */
export class KLexemes {
  src: u8[];
  n: i32 = 0;
  count: i32 = 0;
  type: i32[];
  start: i32[];
  end: i32[];
  failed: boolean = false;

  // JFlex state.
  state: i32 = 0;
  lBraceCount: i32 = 0;
  requiredPrefix: i32 = -1;
  stStack: i32[];
  stBrace: i32[];
  stPrefix: i32[];
  nSt: i32 = 0;

  constructor() {
    this.src = new Array<u8>(0);
    this.type = new Array<i32>(1024);
    this.start = new Array<i32>(1024);
    this.end = new Array<i32>(1024);
    this.stStack = new Array<i32>(64);
    this.stBrace = new Array<i32>(64);
    this.stPrefix = new Array<i32>(64);
    this.cpTmp = new KCp();
  }

  private at(i: i32): i32 {
    return i < this.n ? toI32(this.src[i]) : -1;
  }

  private add(t: i32, a: i32, b: i32): void {
    const i = this.count;
    if (i >= toI32(this.type.length)) {
      const c = i * 2 + 16;
      this.type = growI32(this.type, c);
      this.start = growI32(this.start, c);
      this.end = growI32(this.end, c);
    }
    this.type[i] = t;
    this.start[i] = a;
    this.end[i] = b;
    this.count = i + 1;
  }

  private pushState(s: i32): void {
    if (this.nSt >= toI32(this.stStack.length)) {
      this.stStack = growI32(this.stStack, this.nSt * 2 + 8);
      this.stBrace = growI32(this.stBrace, this.nSt * 2 + 8);
      this.stPrefix = growI32(this.stPrefix, this.nSt * 2 + 8);
    }
    this.stStack[this.nSt] = this.state;
    this.stBrace[this.nSt] = this.lBraceCount;
    this.stPrefix[this.nSt] = this.requiredPrefix;
    this.nSt = this.nSt + 1;
    this.lBraceCount = 0;
    this.requiredPrefix = -1;
    this.state = s;
  }

  private pushPrefix(p: i32): void {
    this.pushState(S_STRING_PREFIX);
    this.requiredPrefix = p;
  }

  private popState(): void {
    if (this.nSt === 0) {
      this.state = S_INITIAL;
      return;
    }
    this.nSt = this.nSt - 1;
    this.state = this.stStack[this.nSt];
    this.lBraceCount = this.stBrace[this.nSt];
    this.requiredPrefix = this.stPrefix[this.nSt];
  }

  private cpAt(i: i32, out: KCp): void {
    const c = this.at(i);
    if (c < 0x80) {
      out.cp = c;
      out.len = 1;
      return;
    }
    let len = 2;
    let cp = c & 0x1f;
    if (c >= 0xf0) {
      len = 4;
      cp = c & 0x07;
    } else if (c >= 0xe0) {
      len = 3;
      cp = c & 0x0f;
    }
    for (let k = 1; k < len; k++) {
      cp = (cp << 6) | (this.at(i + k) & 0x3f);
    }
    out.cp = cp;
    out.len = len;
  }

  /** The length of a letter (Character.isLetter, `_` included) at `i`, or 0. */
  letterLen(i: i32): i32 {
    const c = this.at(i);
    if (c < 0) {
      return 0;
    }
    if (c < 0x80) {
      return kIsLetter(c) ? 1 : 0;
    }
    this.cpAt(i, this.cpTmp);
    return kIsUnicodeLetter(this.cpTmp.cp) ? this.cpTmp.len : 0;
  }

  /** The length of an identifier part (letter or digit) at `i`, or 0. */
  identPartLen(i: i32): i32 {
    const c = this.at(i);
    if (c >= 48 && c <= 57) {
      return 1;
    }
    return this.letterLen(i);
  }

  cpTmp: KCp;

  /** The end of an identifier at `i` (plain or backticked), or -1. */
  private identEnd(i: i32): i32 {
    const c = this.at(i);
    const l0 = this.letterLen(i);
    if (l0 > 0) {
      let j = i + l0;
      // ASCII letters, digits and `_` without the code point decoder.
      const src = this.src;
      const n = this.n;
      while (j < n) {
        const d = toI32(src[j]);
        if ((d >= 97 && d <= 122) || (d >= 65 && d <= 90) || (d >= 48 && d <= 57) || d === 95) {
          j++;
        } else {
          break;
        }
      }
      let k = this.identPartLen(j);
      while (k > 0) {
        j += k;
        k = this.identPartLen(j);
      }
      return j;
    }
    if (c === 96) {
      let j = i + 1;
      while (j < this.n && this.at(j) !== 96 && this.at(j) !== 10) {
        j++;
      }
      if (j > i + 1 && this.at(j) === 96) {
        return j + 1;
      }
    }
    return -1;
  }

  lex(src: u8[], n: i32): void {
    this.src = src;
    this.n = n;
    this.count = 0;
    this.failed = false;
    this.state = S_INITIAL;
    this.lBraceCount = 0;
    this.requiredPrefix = -1;
    this.nSt = 0;
    let i = 0;
    while (i < n) {
      const s = this.state;
      if (s === S_STRING_PREFIX) {
        if (this.at(i) === 34 && this.at(i + 1) === 34 && this.at(i + 2) === 34) {
          this.state = S_RAW_STRING;
          this.add(T_OPEN_QUOTE, i, i + 3);
          i += 3;
        } else if (this.at(i) === 34) {
          this.state = S_STRING;
          this.add(T_OPEN_QUOTE, i, i + 1);
          i += 1;
        } else {
          this.add(T_BAD_CHARACTER, i, i + 1);
          this.failed = true;
          i += 1;
        }
        continue;
      }
      if (s === S_STRING || s === S_RAW_STRING) {
        i = this.lexString(i, s === S_RAW_STRING);
        continue;
      }
      if (s === S_SHORT_TEMPLATE_ENTRY) {
        const e = this.identEnd(i);
        if (e > i) {
          const isThis = e - i === 4 && this.at(i) === 116 && this.at(i + 1) === 104 && this.at(i + 2) === 105 && this.at(i + 3) === 115;
          this.popState();
          this.add(isThis ? T_THIS_KEYWORD : T_IDENTIFIER, i, e);
          i = e;
        } else {
          this.add(T_BAD_CHARACTER, i, i + 1);
          this.failed = true;
          i++;
        }
        continue;
      }
      if (s === S_LONG_TEMPLATE_ENTRY) {
        const c = this.at(i);
        if (c === 123) {
          this.lBraceCount = this.lBraceCount + 1;
          this.add(T_LBRACE, i, i + 1);
          i++;
          continue;
        }
        if (c === 125) {
          if (this.lBraceCount === 0) {
            this.popState();
            this.add(T_LONG_TEMPLATE_ENTRY_END, i, i + 1);
          } else {
            this.lBraceCount = this.lBraceCount - 1;
            this.add(T_RBRACE, i, i + 1);
          }
          i++;
          continue;
        }
      }
      i = this.lexMain(i);
    }
    if (this.state !== S_INITIAL && this.state !== S_LONG_TEMPLATE_ENTRY) {
      // An unterminated string or template at the end.
      this.failed = this.failed || this.state === S_STRING || this.state === S_RAW_STRING || this.state === S_STRING_PREFIX;
    }
  }

  private lexString(i: i32, raw: boolean): i32 {
    const c = this.at(i);
    if (c === 10) {
      if (raw) {
        this.add(T_REGULAR_STRING_PART, i, i + 1);
        return i + 1;
      }
      this.popState();
      this.add(T_DANGLING_NEWLINE, i, i);
      this.failed = true;
      return i;
    }
    if (c === 34) {
      if (raw) {
        let q = i;
        while (this.at(q) === 34) {
          q++;
        }
        const len = q - i;
        if (len >= 3) {
          if (len === 3) {
            this.popState();
            this.add(T_CLOSING_QUOTE, i, i + 3);
            return i + 3;
          }
          this.add(T_REGULAR_STRING_PART, i, q - 3);
          return q - 3;
        }
        this.add(T_REGULAR_STRING_PART, i, i + 1);
        return i + 1;
      }
      this.popState();
      this.add(T_CLOSING_QUOTE, i, i + 1);
      return i + 1;
    }
    if (c === 92) {
      if (raw) {
        this.add(T_REGULAR_STRING_PART, i, i + 1);
        return i + 1;
      }
      // ESCAPE_SEQUENCE: \uXXXX or \ and any char but \n.
      if (this.at(i + 1) === 117 && kIsHex(this.at(i + 2)) && kIsHex(this.at(i + 3)) && kIsHex(this.at(i + 4)) && kIsHex(this.at(i + 5))) {
        this.add(T_ESCAPE_SEQUENCE, i, i + 6);
        return i + 6;
      }
      if (i + 1 < this.n && this.at(i + 1) !== 10) {
        const e = i + 1 + kUtf8Len(this.at(i + 1));
        this.add(T_ESCAPE_SEQUENCE, i, e);
        return e;
      }
      this.add(T_BAD_CHARACTER, i, i + 1);
      this.failed = true;
      return i + 1;
    }
    if (c === 36) {
      let d = i;
      while (this.at(d) === 36) {
        d++;
      }
      const prefix = d - i;
      const req = this.requiredPrefix;
      if (this.at(d) === 123) {
        // LONG_TEMPLATE_ENTRY_START
        if (prefix === req) {
          this.pushState(S_LONG_TEMPLATE_ENTRY);
          this.add(T_LONG_TEMPLATE_ENTRY_START, i, d + 1);
          return d + 1;
        }
        if (prefix < req) {
          this.add(T_REGULAR_STRING_PART, i, d);
          return d;
        }
        // Too many dollars: the extra ones are text.
        const keep = prefix - req;
        this.add(T_REGULAR_STRING_PART, i, i + keep);
        return i + keep;
      }
      const ie = this.identEnd(d);
      if (ie > d) {
        // SHORT_TEMPLATE_ENTRY
        if (prefix === req) {
          this.pushState(S_SHORT_TEMPLATE_ENTRY);
          this.add(T_SHORT_TEMPLATE_ENTRY_START, i, d);
          return d;
        }
        if (prefix < req) {
          this.add(T_REGULAR_STRING_PART, i, d);
          return d;
        }
        const keep = prefix - req;
        this.add(T_REGULAR_STRING_PART, i, i + keep);
        return i + keep;
      }
      // LONELY_DOLLAR
      this.add(T_REGULAR_STRING_PART, i, d);
      return d;
    }
    if (c < 0) {
      return i + 1;
    }
    // REGULAR_STRING_PART: [^\\\"\n\$]+
    let j = i;
    while (j < this.n) {
      const d = this.at(j);
      if (d === 92 || d === 34 || d === 10 || d === 36) {
        break;
      }
      j++;
    }
    this.add(T_REGULAR_STRING_PART, i, j);
    return j;
  }

  /** The longest-match rules of the initial state (also active in LONG_TEMPLATE_ENTRY). */
  private lexMain(i: i32): i32 {
    const c = this.at(i);
    const c1 = this.at(i + 1);
    // {INTERPOLATION}?\" : a string start.
    if (c === 34 || (c === 36 && this.dollarsThenQuote(i))) {
      let d = i;
      while (this.at(d) === 36) {
        d++;
      }
      const prefix = d - i;
      this.pushPrefix(prefix > 1 ? prefix : 1);
      if (prefix !== 0) {
        this.add(T_INTERPOLATION_PREFIX, i, d);
      }
      return d;
    }
    // Comments.
    if (c === 47 && c1 === 42) {
      if (this.at(i + 2) === 42 && this.at(i + 3) === 47) {
        this.add(T_BLOCK_COMMENT, i, i + 4);
        return i + 4;
      }
      const doc = this.at(i + 2) === 42;
      let j = i + (doc ? 3 : 2);
      let depth = 0;
      while (j < this.n) {
        if (this.at(j) === 47 && this.at(j + 1) === 42) {
          depth++;
          j += 2;
          continue;
        }
        if (this.at(j) === 42 && this.at(j + 1) === 47) {
          if (depth > 0) {
            depth--;
            j += 2;
            continue;
          }
          j += 2;
          this.add(doc ? T_DOC_COMMENT : T_BLOCK_COMMENT, i, j);
          return j;
        }
        j++;
      }
      // Unterminated: to the end.
      this.add(doc ? T_DOC_COMMENT : T_BLOCK_COMMENT, i, this.n);
      return this.n;
    }
    if (c === 32 || c === 10 || c === 9 || c === 12) {
      let j = i;
      while (j < this.n) {
        const d = this.at(j);
        if (d === 32 || d === 10 || d === 9 || d === 12) {
          j++;
        } else {
          break;
        }
      }
      this.add(T_WHITE_SPACE, i, j);
      return j;
    }
    if (c === 47 && c1 === 47) {
      let j = i;
      while (j < this.n && this.at(j) !== 10) {
        j++;
      }
      this.add(T_EOL_COMMENT, i, j);
      return j;
    }
    if (c === 35 && c1 === 33) {
      if (i === 0) {
        let j = i;
        while (j < this.n && this.at(j) !== 10) {
          j++;
        }
        this.add(T_SHEBANG_COMMENT, i, j);
        return j;
      }
      this.add(T_HASH, i, i + 1);
      return i + 1;
    }
    if (kIsDigit(c) || (c === 46 && kIsDigit(c1))) {
      return this.lexNumber(i);
    }
    if (c === 39) {
      // CHARACTER_LITERAL: '([^\\'\n]|ESC)*('|\\)?
      let j = i + 1;
      while (j < this.n) {
        const d = this.at(j);
        if (d === 39 || d === 10) {
          break;
        }
        if (d === 92) {
          if (this.at(j + 1) === 117 && kIsHex(this.at(j + 2)) && kIsHex(this.at(j + 3)) && kIsHex(this.at(j + 4)) && kIsHex(this.at(j + 5))) {
            j += 6;
            continue;
          }
          if (j + 1 < this.n && this.at(j + 1) !== 10) {
            j += 1 + kUtf8Len(this.at(j + 1));
            continue;
          }
          // A trailing backslash ends the literal.
          j += 1;
          this.add(T_CHARACTER_LITERAL, i, j);
          return j;
        }
        j++;
      }
      if (this.at(j) === 39) {
        j++;
      }
      this.add(T_CHARACTER_LITERAL, i, j);
      return j;
    }
    // Identifiers and keywords.
    if (this.letterLen(i) > 0 || c === 96) {
      const e = this.identEnd(i);
      if (e > i) {
        const kw = c === 96 ? -1 : keywordOf(this.src, i, e);
        // `as?` is longer than `as`.
        if (kw === T_AS_KEYWORD && this.at(e) === 63) {
          this.add(T_AS_SAFE, i, e + 1);
          return e + 1;
        }
        this.add(kw >= 0 ? kw : T_IDENTIFIER, i, e);
        return e;
      }
      if (c === 96) {
        this.pushState(S_UNMATCHED_BACKTICK);
        this.add(T_BAD_CHARACTER, i, i + 1);
        this.failed = true;
        return i + 1;
      }
    }
    if (c === 36) {
      const e = this.identEnd(i + 1);
      if (e > i + 1) {
        this.add(T_FIELD_IDENTIFIER, i, e);
        return e;
      }
    }
    // Operators.
    const c2 = this.at(i + 2);
    switch (c) {
      case 33: // !
        if (c1 === 105 && (c2 === 110 || c2 === 115)) {
          // !in / !is, unless an identifier part follows.
          if (this.identPartLen(i + 3) > 0) {
            this.add(T_EXCL, i, i + 1);
            return i + 1;
          }
          this.add(c2 === 110 ? T_NOT_IN : T_NOT_IS, i, i + 3);
          return i + 3;
        }
        if (c1 === 61 && c2 === 61) {
          this.add(T_EXCLEQEQEQ, i, i + 3);
          return i + 3;
        }
        if (c1 === 61) {
          this.add(T_EXCLEQ, i, i + 2);
          return i + 2;
        }
        this.add(T_EXCL, i, i + 1);
        return i + 1;
      case 46: // .
        if (c1 === 46 && c2 === 46) {
          this.add(T_RESERVED, i, i + 3);
          return i + 3;
        }
        if (c1 === 46 && c2 === 60) {
          this.add(T_RANGE_UNTIL, i, i + 3);
          return i + 3;
        }
        if (c1 === 46) {
          this.add(T_RANGE, i, i + 2);
          return i + 2;
        }
        this.add(T_DOT, i, i + 1);
        return i + 1;
      case 61: // =
        if (c1 === 61 && c2 === 61) {
          this.add(T_EQEQEQ, i, i + 3);
          return i + 3;
        }
        if (c1 === 61) {
          this.add(T_EQEQ, i, i + 2);
          return i + 2;
        }
        if (c1 === 62) {
          this.add(T_DOUBLE_ARROW, i, i + 2);
          return i + 2;
        }
        this.add(T_EQ, i, i + 1);
        return i + 1;
      case 43: // +
        if (c1 === 43) {
          this.add(T_PLUSPLUS, i, i + 2);
          return i + 2;
        }
        if (c1 === 61) {
          this.add(T_PLUSEQ, i, i + 2);
          return i + 2;
        }
        this.add(T_PLUS, i, i + 1);
        return i + 1;
      case 45: // -
        if (c1 === 45) {
          this.add(T_MINUSMINUS, i, i + 2);
          return i + 2;
        }
        if (c1 === 61) {
          this.add(T_MINUSEQ, i, i + 2);
          return i + 2;
        }
        if (c1 === 62) {
          this.add(T_ARROW, i, i + 2);
          return i + 2;
        }
        this.add(T_MINUS, i, i + 1);
        return i + 1;
      case 60: // <
        if (c1 === 61) {
          this.add(T_LTEQ, i, i + 2);
          return i + 2;
        }
        this.add(T_LT, i, i + 1);
        return i + 1;
      case 62: // >
        if (c1 === 61) {
          this.add(T_GTEQ, i, i + 2);
          return i + 2;
        }
        this.add(T_GT, i, i + 1);
        return i + 1;
      case 38: // &
        if (c1 === 38) {
          this.add(T_ANDAND, i, i + 2);
          return i + 2;
        }
        this.add(T_AND, i, i + 1);
        return i + 1;
      case 124: // |
        if (c1 === 124) {
          this.add(T_OROR, i, i + 2);
          return i + 2;
        }
        break;
      case 42: // *
        if (c1 === 61) {
          this.add(T_MULTEQ, i, i + 2);
          return i + 2;
        }
        this.add(T_MUL, i, i + 1);
        return i + 1;
      case 47: // /
        if (c1 === 61) {
          this.add(T_DIVEQ, i, i + 2);
          return i + 2;
        }
        this.add(T_DIV, i, i + 1);
        return i + 1;
      case 37: // %
        if (c1 === 61) {
          this.add(T_PERCEQ, i, i + 2);
          return i + 2;
        }
        this.add(T_PERC, i, i + 1);
        return i + 1;
      case 58: // :
        if (c1 === 58) {
          this.add(T_COLONCOLON, i, i + 2);
          return i + 2;
        }
        this.add(T_COLON, i, i + 1);
        return i + 1;
      case 59: // ;
        if (c1 === 59) {
          this.add(T_DOUBLE_SEMICOLON, i, i + 2);
          return i + 2;
        }
        this.add(T_SEMICOLON, i, i + 1);
        return i + 1;
      case 91:
        this.add(T_LBRACKET, i, i + 1);
        return i + 1;
      case 93:
        this.add(T_RBRACKET, i, i + 1);
        return i + 1;
      case 123:
        this.add(T_LBRACE, i, i + 1);
        return i + 1;
      case 125:
        this.add(T_RBRACE, i, i + 1);
        return i + 1;
      case 40:
        this.add(T_LPAR, i, i + 1);
        return i + 1;
      case 41:
        this.add(T_RPAR, i, i + 1);
        return i + 1;
      case 63:
        this.add(T_QUEST, i, i + 1);
        return i + 1;
      case 44:
        this.add(T_COMMA, i, i + 1);
        return i + 1;
      case 35:
        this.add(T_HASH, i, i + 1);
        return i + 1;
      case 64:
        this.add(T_AT, i, i + 1);
        return i + 1;
      default:
        break;
    }
    this.add(T_BAD_CHARACTER, i, i + 1);
    this.failed = true;
    return i + 1;
  }

  /** Whether `$`s at `i` are followed by a quote. */
  private dollarsThenQuote(i: i32): boolean {
    let d = i;
    while (this.at(d) === 36) {
      d++;
    }
    return this.at(d) === 34;
  }

  /** INTEGER_LITERAL or DOUBLE_LITERAL, whichever is longer. */
  private lexNumber(i: i32): i32 {
    const intEnd = this.intLiteralEnd(i);
    const dblEnd = this.doubleLiteralEnd(i);
    if (dblEnd > intEnd) {
      this.add(T_FLOAT_LITERAL, i, dblEnd);
      return dblEnd;
    }
    if (intEnd > i) {
      this.add(T_INTEGER_LITERAL, i, intEnd);
      return intEnd;
    }
    this.add(T_DOT, i, i + 1);
    return i + 1;
  }

  private intLiteralEnd(i: i32): i32 {
    const c = this.at(i);
    if (!kIsDigit(c)) {
      return i;
    }
    let j = i + 1;
    if (c === 48 && (this.at(j) === 120 || this.at(j) === 88)) {
      j++;
      while (kIsHex(this.at(j)) || this.at(j) === 95) {
        j++;
      }
    } else if (c === 48 && (this.at(j) === 98 || this.at(j) === 66)) {
      j++;
      while (kIsDigit(this.at(j)) || this.at(j) === 95) {
        j++;
      }
    } else {
      while (kIsDigit(this.at(j)) || this.at(j) === 95) {
        j++;
      }
    }
    if (this.at(j) === 85 || this.at(j) === 117) {
      j++;
    }
    if (this.at(j) === 76 || this.at(j) === 108) {
      j++;
    }
    return j;
  }

  private digits(i: i32): i32 {
    if (!kIsDigit(this.at(i))) {
      return i;
    }
    let j = i + 1;
    while (kIsDigit(this.at(j)) || this.at(j) === 95) {
      j++;
    }
    return j;
  }

  private exponent(i: i32): i32 {
    if (this.at(i) !== 69 && this.at(i) !== 101) {
      return i;
    }
    let j = i + 1;
    if (this.at(j) === 43 || this.at(j) === 45) {
      j++;
    }
    while (kIsDigit(this.at(j)) || this.at(j) === 95) {
      j++;
    }
    return j;
  }

  /** DOUBLE_LITERAL = DIGITS? "." DIGITS EXP? [Ff]? | DIGITS (EXP [Ff]? | [Ff]); -1 when none. */
  private doubleLiteralEnd(i: i32): i32 {
    let best = -1;
    const d1 = this.digits(i);
    // DIGITS? . DIGITS ...
    if (this.at(d1) === 46) {
      const d2 = this.digits(d1 + 1);
      if (d2 > d1 + 1) {
        let j = this.exponent(d2);
        if (this.at(j) === 70 || this.at(j) === 102) {
          j++;
        }
        best = j;
      }
    }
    if (d1 > i) {
      const e = this.exponent(d1);
      if (e > d1) {
        let j = e;
        if (this.at(j) === 70 || this.at(j) === 102) {
          j++;
        }
        if (j > best) {
          best = j;
        }
      } else if (this.at(d1) === 70 || this.at(d1) === 102) {
        if (d1 + 1 > best) {
          best = d1 + 1;
        }
      }
    }
    return best;
  }
}

const kUtf8Len = (c: i32): i32 => {
  if (c < 0x80) {
    return 1;
  }
  if (c >= 0xf0) {
    return 4;
  }
  if (c >= 0xe0) {
    return 3;
  }
  return 2;
};

/** The hard keyword spelled by src[a, b), or -1. */
const keywordOf = (src: u8[], a: i32, b: i32): i32 => {
  const n = b - a;
  if (n < 2 || n > 9) {
    return -1;
  }
  const s = String.fromBytes(src, a, b);
  if (s === "typealias") {
    return T_TYPE_ALIAS_KEYWORD;
  }
  if (s === "interface") {
    return T_INTERFACE_KEYWORD;
  }
  if (s === "continue") {
    return T_CONTINUE_KEYWORD;
  }
  if (s === "package") {
    return T_PACKAGE_KEYWORD;
  }
  if (s === "return") {
    return T_RETURN_KEYWORD;
  }
  if (s === "object") {
    return T_OBJECT_KEYWORD;
  }
  if (s === "while") {
    return T_WHILE_KEYWORD;
  }
  if (s === "break") {
    return T_BREAK_KEYWORD;
  }
  if (s === "class") {
    return T_CLASS_KEYWORD;
  }
  if (s === "throw") {
    return T_THROW_KEYWORD;
  }
  if (s === "false") {
    return T_FALSE_KEYWORD;
  }
  if (s === "super") {
    return T_SUPER_KEYWORD;
  }
  if (s === "typeof") {
    return T_TYPEOF_KEYWORD;
  }
  if (s === "when") {
    return T_WHEN_KEYWORD;
  }
  if (s === "true") {
    return T_TRUE_KEYWORD;
  }
  if (s === "this") {
    return T_THIS_KEYWORD;
  }
  if (s === "null") {
    return T_NULL_KEYWORD;
  }
  if (s === "else") {
    return T_ELSE_KEYWORD;
  }
  if (s === "try") {
    return T_TRY_KEYWORD;
  }
  if (s === "val") {
    return T_VAL_KEYWORD;
  }
  if (s === "var") {
    return T_VAR_KEYWORD;
  }
  if (s === "fun") {
    return T_FUN_KEYWORD;
  }
  if (s === "for") {
    return T_FOR_KEYWORD;
  }
  if (s === "is") {
    return T_IS_KEYWORD;
  }
  if (s === "in") {
    return T_IN_KEYWORD;
  }
  if (s === "if") {
    return T_IF_KEYWORD;
  }
  if (s === "do") {
    return T_DO_KEYWORD;
  }
  if (s === "as") {
    return T_AS_KEYWORD;
  }
  return -1;
};
