// The Dart scanner: source bytes to tokens with their preceding comments, in
// parallel arrays. After the analyzer's scanner (_fe_analyzer_shared
// AbstractScanner, BSD-3-Clause, Copyright the Dart project authors): the
// same token boundaries, string interpolation segments, nested block
// comments, script tag and `// @dart=` language version comment.

import {
  K_NONE,
  K_OPERATOR,
  T_AMP,
  T_AMPAMP,
  T_AMPAMP_EQ,
  T_AMP_EQ,
  T_ARROW,
  T_AT,
  T_BACKTICK,
  T_BANG,
  T_BAR,
  T_BARBAR,
  T_BARBAR_EQ,
  T_BAR_EQ,
  T_BOF,
  T_CARET,
  T_CARET_EQ,
  T_COLON,
  T_COMMA,
  T_DEC,
  T_DOT,
  T_DOTDOT,
  T_DOUBLE,
  T_ELLIPSIS,
  T_ELLIPSIS_Q,
  T_EOF,
  T_EQ,
  T_EQEQ,
  T_GE,
  T_GT,
  T_HASH,
  T_IDENT,
  T_INC,
  T_INDEX,
  T_INDEX_EQ,
  T_INT,
  T_INTERP_EXPR,
  T_INTERP_IDENT,
  T_LBRACE,
  T_LBRACKET,
  T_LE,
  T_LPAREN,
  T_LT,
  T_MINUS,
  T_MINUS_EQ,
  T_NE,
  T_PERCENT,
  T_PERCENT_EQ,
  T_PLUS,
  T_PLUS_EQ,
  T_QDOT,
  T_QDOTDOT,
  T_QQ,
  T_QQ_EQ,
  T_QUESTION,
  T_RBRACE,
  T_RBRACKET,
  T_RPAREN,
  T_SCRIPT,
  T_SEMI,
  T_SHL,
  T_SHL_EQ,
  T_SHR,
  T_SHR_EQ,
  T_SLASH,
  T_SLASH_EQ,
  T_STAR,
  T_STAR_EQ,
  T_STRING,
  T_TILDE,
  T_TILDE_SLASH,
  T_TILDE_SLASH_EQ,
  T_USHR,
  T_USHR_EQ,
  dtKeyword,
} from "./tokens";

export const C_LINE: i32 = 1; // `//` comment
export const C_BLOCK: i32 = 2; // `/* */` comment

const dtGrowI32 = (a: i32[], cap: i32): i32[] => {
  const b = new Array<i32>(cap);
  b.set(a);
  return b;
};

const dtGrowBool = (a: boolean[], cap: i32): boolean[] => {
  const b = new Array<boolean>(cap);
  for (let i = 0; i < toI32(a.length); i++) {
    b[i] = a[i];
  }
  return b;
};

/** The tokens of one file and the comments before each. */
export class DtTokens {
  src: u8[];
  n: i32 = 0; // source length
  count: i32 = 0; // tokens, including BOF at 0 and EOF last
  kind: i32[];
  kw: i32[];
  start: i32[];
  end: i32[];
  cFirst: i32[]; // first preceding comment, or -1
  cCount: i32[];
  lineS: i32[]; // 1-based line of the start
  lineE: i32[]; // 1-based line of the end
  // The scanner splits a `>>` or `>>>` that closes enough open `<` on its
  // statement, as the parser would; `pred` marks each `>` it split off but
  // the last, and the parser sets `gt` on each `>` it takes as a closing
  // angle bracket. dtParse checks the one covers the other.
  pred: boolean[];
  gt: boolean[];
  npred: i32 = 0;
  // Comments.
  nc: i32 = 0;
  cStart: i32[];
  cEnd: i32[];
  cKind: i32[];
  cLineS: i32[];
  cLineE: i32[];
  cCol1: boolean[]; // starts at column 1
  // The `// @dart=major.minor` comment, if any.
  verMajor: i32 = -1;
  verMinor: i32 = -1;
  failed: boolean = false;
  why: string = "";

  constructor(src: u8[], n: i32) {
    this.src = src;
    this.n = n;
    // About one token per four bytes and a comment per 64; both grow.
    const cap = (n >> 2) + 16;
    this.kind = new Array<i32>(cap);
    this.kw = new Array<i32>(cap);
    this.start = new Array<i32>(cap);
    this.end = new Array<i32>(cap);
    this.cFirst = new Array<i32>(cap);
    this.cCount = new Array<i32>(cap);
    this.lineS = new Array<i32>(cap);
    this.lineE = new Array<i32>(cap);
    this.pred = new Array<boolean>(cap);
    this.gt = new Array<boolean>(cap);
    const cc = (n >> 6) + 16;
    this.cStart = new Array<i32>(cc);
    this.cEnd = new Array<i32>(cc);
    this.cKind = new Array<i32>(cc);
    this.cLineS = new Array<i32>(cc);
    this.cLineE = new Array<i32>(cc);
    this.cCol1 = new Array<boolean>(cc);
  }

  /** Makes room for at least one more token. */
  roomForToken(): void {
    if (this.count + 1 < toI32(this.kind.length)) {
      return;
    }
    const cap = toI32(this.kind.length) * 2;
    this.kind = dtGrowI32(this.kind, cap);
    this.kw = dtGrowI32(this.kw, cap);
    this.start = dtGrowI32(this.start, cap);
    this.end = dtGrowI32(this.end, cap);
    this.cFirst = dtGrowI32(this.cFirst, cap);
    this.cCount = dtGrowI32(this.cCount, cap);
    this.lineS = dtGrowI32(this.lineS, cap);
    this.lineE = dtGrowI32(this.lineE, cap);
    this.pred = dtGrowBool(this.pred, cap);
    this.gt = dtGrowBool(this.gt, cap);
  }

  /** Makes room for at least one more comment. */
  roomForComment(): void {
    if (this.nc + 1 < toI32(this.cStart.length)) {
      return;
    }
    const cap = toI32(this.cStart.length) * 2;
    this.cStart = dtGrowI32(this.cStart, cap);
    this.cEnd = dtGrowI32(this.cEnd, cap);
    this.cKind = dtGrowI32(this.cKind, cap);
    this.cLineS = dtGrowI32(this.cLineS, cap);
    this.cLineE = dtGrowI32(this.cLineE, cap);
    this.cCol1 = dtGrowBool(this.cCol1, cap);
  }

  /** Whether token `t` is spelled `s`. */
  is(t: i32, s: string): boolean {
    const a = this.start[t];
    const k = this.end[t] - a;
    if (k !== toI32(s.length)) {
      return false;
    }
    for (let i = 0; i < k; i++) {
      if (toI32(this.src[a + i]) !== s.charCodeAt(i)) {
        return false;
      }
    }
    return true;
  }

  text(t: i32): string {
    return String.fromBytes(this.src, this.start[t], this.end[t]);
  }

  /**
   * Splits token `t` after its first `>`: `>>` becomes `>` `>`, `>=` becomes
   * `>` `=`, and so on. Shifts the following tokens up by one.
   */
  splitGt(t: i32): void {
    const k = this.kind[t];
    let rest = T_GT;
    if (k === T_GE) {
      rest = T_EQ;
    } else if (k === T_SHR) {
      rest = T_GT;
    } else if (k === T_SHR_EQ) {
      rest = T_GE;
    } else if (k === T_USHR) {
      rest = T_SHR;
    } else if (k === T_USHR_EQ) {
      rest = T_SHR_EQ;
    }
    this.roomForToken();
    for (let i = this.count; i > t + 1; i--) {
      this.kind[i] = this.kind[i - 1];
      this.kw[i] = this.kw[i - 1];
      this.start[i] = this.start[i - 1];
      this.end[i] = this.end[i - 1];
      this.cFirst[i] = this.cFirst[i - 1];
      this.cCount[i] = this.cCount[i - 1];
      this.lineS[i] = this.lineS[i - 1];
      this.lineE[i] = this.lineE[i - 1];
      this.pred[i] = this.pred[i - 1];
      this.gt[i] = this.gt[i - 1];
    }
    this.count = this.count + 1;
    const s = this.start[t];
    this.kind[t + 1] = rest;
    this.kw[t + 1] = K_NONE;
    this.start[t + 1] = s + 1;
    this.end[t + 1] = this.end[t];
    this.cFirst[t + 1] = -1;
    this.cCount[t + 1] = 0;
    this.lineS[t + 1] = this.lineS[t];
    this.lineE[t + 1] = this.lineE[t];
    this.pred[t + 1] = false;
    this.gt[t + 1] = false;
    this.kind[t] = T_GT;
    this.end[t] = s + 1;
  }
}

const dtIsIdStart = (c: i32): boolean => (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 95 || c === 36;
const dtIsIdPart = (c: i32): boolean =>
  (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 95 || c === 36 || (c >= 48 && c <= 57);
const dtIsDigit = (c: i32): boolean => c >= 48 && c <= 57;
const dtIsHex = (c: i32): boolean => (c >= 48 && c <= 57) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70);

/** Scans one file. */
export class DtScanner {
  t: DtTokens;
  src: u8[];
  n: i32;
  p: i32 = 0;
  // Comments seen since the last token.
  pendFirst: i32 = -1;
  // The stack of strings with an open `${`: quote char, triple, brace depth.
  sQuote: i32[];
  sTriple: boolean[];
  sDepth: i32[];
  ns: i32 = 0;
  // Open `<` since the last `;`, `{`, `}`, `=>`, `&&` or `||`, and whether
  // to split `>>` by them (see DtTokens.pred).
  lt: i32 = 0;
  predict: boolean = true;
  // The 1-based line at the scanning position, and where it starts.
  line: i32 = 1;
  lineStart: i32 = 0;
  // The line a string segment being added starts on, or -1.
  segLine: i32 = -1;
  // Whether we are still before the first token (for `// @dart=`).
  header: boolean = true;

  constructor(t: DtTokens) {
    this.t = t;
    this.src = t.src;
    this.n = t.n;
    this.sQuote = new Array<i32>(64);
    this.sTriple = new Array<boolean>(64);
    this.sDepth = new Array<i32>(64);
  }

  fail(why: string): void {
    if (!this.t.failed) {
      this.t.failed = true;
      this.t.why = `${why} at ${this.p}`;
    }
  }

  at(i: i32): i32 {
    if (i < this.n) {
      return toI32(this.src[i]);
    }
    return -1;
  }

  /** Notes the byte `c` at `i` when it is `\n` or `\r` (`\r\n` counts at the `\n`). */
  newlineAt(c: i32, i: i32): void {
    if (c === 10 || (c === 13 && this.at(i + 1) !== 10)) {
      this.line = this.line + 1;
      this.lineStart = i + 1;
    }
  }

  add(kind: i32, a: i32, b: i32): void {
    const t = this.t;
    t.roomForToken();
    const i = t.count;
    t.kind[i] = kind;
    t.kw[i] = K_NONE;
    t.start[i] = a;
    t.end[i] = b;
    t.lineS[i] = this.segLine >= 0 ? this.segLine : this.line;
    t.lineE[i] = this.line;
    if (this.pendFirst >= 0) {
      t.cFirst[i] = this.pendFirst;
      t.cCount[i] = t.nc - this.pendFirst;
    } else {
      t.cFirst[i] = -1;
      t.cCount[i] = 0;
    }
    this.pendFirst = -1;
    t.count = i + 1;
    this.header = false;
    if (kind === T_LT) {
      this.lt = this.lt + 1;
    } else if (kind === T_GT) {
      if (this.lt > 0) {
        this.lt = this.lt - 1;
      }
    } else if (kind === T_SHR || kind === T_USHR) {
      const m = kind === T_SHR ? 2 : 3;
      if (this.predict && this.lt >= m) {
        for (let j = 1; j < m; j++) {
          t.pred[t.count - 1] = true;
          t.splitGt(t.count - 1);
        }
        t.npred = t.npred + m - 1;
        this.lt = this.lt - m;
      } else {
        this.lt = 0;
      }
    } else if (kind === T_SEMI || kind === T_LBRACE || kind === T_RBRACE || kind === T_ARROW || kind === T_AMPAMP || kind === T_BARBAR) {
      this.lt = 0;
    }
  }

  /** Records the line and column-1-ness of the comment about to be added at `a`. */
  commentStart(a: i32): void {
    const t = this.t;
    t.roomForComment();
    t.cLineS[t.nc] = this.line;
    t.cCol1[t.nc] = a === this.lineStart;
  }

  /** add, for a string segment that starts on line `segLine`. */
  addSeg(kind: i32, a: i32, b: i32, segLine: i32): void {
    this.segLine = segLine;
    this.add(kind, a, b);
    this.segLine = -1;
  }

  addComment(kind: i32, a: i32, b: i32): void {
    const t = this.t;
    t.roomForComment();
    const i = t.nc;
    t.cStart[i] = a;
    t.cEnd[i] = b;
    t.cKind[i] = kind;
    t.cLineE[i] = this.line;
    if (this.pendFirst < 0) {
      this.pendFirst = i;
    }
    t.nc = i + 1;
  }

  scan(): void {
    const t = this.t;
    // BOF.
    t.kind[0] = T_BOF;
    t.kw[0] = K_NONE;
    t.start[0] = 0;
    t.end[0] = 0;
    t.cFirst[0] = -1;
    t.cCount[0] = 0;
    t.lineS[0] = 1;
    t.lineE[0] = 1;
    t.count = 1;
    // Skip a UTF-8 byte order mark.
    if (this.n >= 3 && this.at(0) === 0xef && this.at(1) === 0xbb && this.at(2) === 0xbf) {
      this.p = 3;
    }
    if (this.at(this.p) === 35 && this.at(this.p + 1) === 33) {
      const a = this.p;
      let i = a;
      while (i < this.n && this.at(i) !== 10 && this.at(i) !== 13) {
        i++;
      }
      this.p = i;
      this.add(T_SCRIPT, a, i);
      this.header = true;
    }
    while (!t.failed) {
      const c = this.skipTrivia();
      if (c < 0) {
        break;
      }
      this.token(c);
    }
    if (this.ns > 0) {
      this.fail("unterminated interpolation");
    }
    this.add(T_EOF, this.n, this.n);
  }

  /** Skips whitespace and comments; answers the next byte or -1 at the end. */
  skipTrivia(): i32 {
    const n = this.n;
    while (this.p < n) {
      const c = toI32(this.src[this.p]);
      if (c === 32 || c === 9 || c === 12 || c === 11) {
        this.p = this.p + 1;
        continue;
      }
      if (c === 10 || c === 13) {
        this.newlineAt(c, this.p);
        this.p = this.p + 1;
        continue;
      }
      if (c === 47) {
        const d = this.at(this.p + 1);
        if (d === 47) {
          const a = this.p;
          let i = a + 2;
          while (i < n) {
            const e = toI32(this.src[i]);
            if (e === 10 || e === 13) {
              break;
            }
            i++;
          }
          this.p = i;
          if (this.header && this.t.verMajor < 0) {
            this.languageVersion(a, i);
          }
          this.commentStart(a);
          this.addComment(C_LINE, a, i);
          continue;
        }
        if (d === 42) {
          const a = this.p;
          this.commentStart(a);
          let i = a + 2;
          let depth = 1;
          while (i < n && depth > 0) {
            const e = toI32(this.src[i]);
            if (e === 42 && this.at(i + 1) === 47) {
              depth--;
              i += 2;
            } else if (e === 47 && this.at(i + 1) === 42) {
              depth++;
              i += 2;
            } else {
              if (e === 10 || e === 13) {
                this.newlineAt(e, i);
              }
              i++;
            }
          }
          if (depth > 0) {
            this.fail("unterminated comment");
            return -1;
          }
          this.p = i;
          this.addComment(C_BLOCK, a, i);
          continue;
        }
      }
      return c;
    }
    return -1;
  }

  /** Recognizes `// @dart = 2.12` in the file header. */
  languageVersion(a: i32, b: i32): void {
    let i = a + 2;
    if (this.at(i) === 47) {
      return; // a doc comment
    }
    while (i < b && this.at(i) === 32) {
      i++;
    }
    if (!(this.at(i) === 64 && this.at(i + 1) === 100 && this.at(i + 2) === 97 && this.at(i + 3) === 114 && this.at(i + 4) === 116)) {
      return;
    }
    i += 5;
    while (i < b && this.at(i) === 32) {
      i++;
    }
    if (this.at(i) !== 61) {
      return;
    }
    i++;
    while (i < b && this.at(i) === 32) {
      i++;
    }
    let major = 0;
    const ms = i;
    while (i < b && dtIsDigit(this.at(i))) {
      major = major * 10 + this.at(i) - 48;
      if (major > 100000) {
        return;
      }
      i++;
    }
    if (i === ms || this.at(i) !== 46) {
      return;
    }
    i++;
    let minor = 0;
    const ns = i;
    while (i < b && dtIsDigit(this.at(i))) {
      minor = minor * 10 + this.at(i) - 48;
      if (minor > 100000) {
        return;
      }
      i++;
    }
    if (i === ns) {
      return;
    }
    while (i < b && this.at(i) === 32) {
      i++;
    }
    if (i !== b) {
      return;
    }
    this.t.verMajor = major;
    this.t.verMinor = minor;
  }

  op(kind: i32, len: i32): void {
    this.add(kind, this.p, this.p + len);
    this.p += len;
  }

  token(c: i32): void {
    const p = this.p;
    if (dtIsIdStart(c)) {
      // A raw string?
      if (c === 114 && (this.at(p + 1) === 39 || this.at(p + 1) === 34)) {
        this.string(p, p + 1, true);
        return;
      }
      let i = p + 1;
      while (i < this.n && dtIsIdPart(toI32(this.src[i]))) {
        i++;
      }
      this.add(T_IDENT, p, i);
      this.t.kw[this.t.count - 1] = dtKeyword(this.src, p, i);
      this.p = i;
      return;
    }
    if (dtIsDigit(c) || (c === 46 && dtIsDigit(this.at(p + 1)))) {
      this.number(p);
      return;
    }
    const d = this.at(p + 1);
    switch (c) {
      case 39:
      case 34:
        this.string(p, p, false);
        return;
      case 40:
        this.op(T_LPAREN, 1);
        return;
      case 41:
        this.op(T_RPAREN, 1);
        return;
      case 91: {
        // `[]` and `[]=` are single tokens only as operator names.
        const prev = this.t.count - 1;
        if (d === 93 && ((this.t.kind[prev] === T_IDENT && this.t.kw[prev] === K_OPERATOR) || this.t.kind[prev] === T_HASH)) {
          if (this.at(p + 2) === 61) {
            this.op(T_INDEX_EQ, 3);
          } else {
            this.op(T_INDEX, 2);
          }
          return;
        }
        this.op(T_LBRACKET, 1);
        return;
      }
      case 93:
        this.op(T_RBRACKET, 1);
        return;
      case 123:
        if (this.ns > 0) {
          this.sDepth[this.ns - 1] = this.sDepth[this.ns - 1] + 1;
        }
        this.op(T_LBRACE, 1);
        return;
      case 125:
        if (this.ns > 0) {
          const top = this.ns - 1;
          if (this.sDepth[top] === 0) {
            this.op(T_RBRACE, 1);
            this.ns = top;
            this.stringBody(this.p, this.sQuote[top], this.sTriple[top], false);
            return;
          }
          this.sDepth[top] = this.sDepth[top] - 1;
        }
        this.op(T_RBRACE, 1);
        return;
      case 59:
        this.op(T_SEMI, 1);
        return;
      case 44:
        this.op(T_COMMA, 1);
        return;
      case 46:
        if (d === 46) {
          if (this.at(p + 2) === 46) {
            if (this.at(p + 3) === 63) {
              this.op(T_ELLIPSIS_Q, 4);
            } else {
              this.op(T_ELLIPSIS, 3);
            }
          } else {
            this.op(T_DOTDOT, 2);
          }
        } else {
          this.op(T_DOT, 1);
        }
        return;
      case 63:
        if (d === 63) {
          if (this.at(p + 2) === 61) {
            this.op(T_QQ_EQ, 3);
          } else {
            this.op(T_QQ, 2);
          }
        } else if (d === 46) {
          if (this.at(p + 2) === 46) {
            this.op(T_QDOTDOT, 3);
          } else {
            this.op(T_QDOT, 2);
          }
        } else {
          this.op(T_QUESTION, 1);
        }
        return;
      case 58:
        this.op(T_COLON, 1);
        return;
      case 61:
        if (d === 61) {
          this.op(T_EQEQ, 2);
        } else if (d === 62) {
          this.op(T_ARROW, 2);
        } else {
          this.op(T_EQ, 1);
        }
        return;
      case 33:
        if (d === 61) {
          this.op(T_NE, 2);
        } else {
          this.op(T_BANG, 1);
        }
        return;
      case 60:
        if (d === 61) {
          this.op(T_LE, 2);
        } else if (d === 60) {
          if (this.at(p + 2) === 61) {
            this.op(T_SHL_EQ, 3);
          } else {
            this.op(T_SHL, 2);
          }
        } else {
          this.op(T_LT, 1);
        }
        return;
      case 62:
        if (d === 61) {
          this.op(T_GE, 2);
        } else if (d === 62) {
          const e = this.at(p + 2);
          if (e === 61) {
            this.op(T_SHR_EQ, 3);
          } else if (e === 62) {
            if (this.at(p + 3) === 61) {
              this.op(T_USHR_EQ, 4);
            } else {
              this.op(T_USHR, 3);
            }
          } else {
            this.op(T_SHR, 2);
          }
        } else {
          this.op(T_GT, 1);
        }
        return;
      case 43:
        if (d === 61) {
          this.op(T_PLUS_EQ, 2);
        } else if (d === 43) {
          this.op(T_INC, 2);
        } else {
          this.op(T_PLUS, 1);
        }
        return;
      case 45:
        if (d === 61) {
          this.op(T_MINUS_EQ, 2);
        } else if (d === 45) {
          this.op(T_DEC, 2);
        } else {
          this.op(T_MINUS, 1);
        }
        return;
      case 42:
        if (d === 61) {
          this.op(T_STAR_EQ, 2);
        } else {
          this.op(T_STAR, 1);
        }
        return;
      case 47:
        if (d === 61) {
          this.op(T_SLASH_EQ, 2);
        } else {
          this.op(T_SLASH, 1);
        }
        return;
      case 126:
        if (d === 47) {
          if (this.at(p + 2) === 61) {
            this.op(T_TILDE_SLASH_EQ, 3);
          } else {
            this.op(T_TILDE_SLASH, 2);
          }
        } else {
          this.op(T_TILDE, 1);
        }
        return;
      case 37:
        if (d === 61) {
          this.op(T_PERCENT_EQ, 2);
        } else {
          this.op(T_PERCENT, 1);
        }
        return;
      case 38:
        if (d === 38) {
          if (this.at(p + 2) === 61) {
            this.op(T_AMPAMP_EQ, 3);
          } else {
            this.op(T_AMPAMP, 2);
          }
        } else if (d === 61) {
          this.op(T_AMP_EQ, 2);
        } else {
          this.op(T_AMP, 1);
        }
        return;
      case 124:
        if (d === 124) {
          if (this.at(p + 2) === 61) {
            this.op(T_BARBAR_EQ, 3);
          } else {
            this.op(T_BARBAR, 2);
          }
        } else if (d === 61) {
          this.op(T_BAR_EQ, 2);
        } else {
          this.op(T_BAR, 1);
        }
        return;
      case 94:
        if (d === 61) {
          this.op(T_CARET_EQ, 2);
        } else {
          this.op(T_CARET, 1);
        }
        return;
      case 35:
        this.op(T_HASH, 1);
        return;
      case 64:
        this.op(T_AT, 1);
        return;
      case 96:
        this.op(T_BACKTICK, 1);
        this.fail("backtick");
        return;
      default:
        this.fail("unexpected character");
        return;
    }
  }

  number(p: i32): void {
    let i = p;
    let isDouble = false;
    if (this.at(i) === 48 && (this.at(i + 1) === 120 || this.at(i + 1) === 88) && dtIsHex(this.at(i + 2))) {
      i += 3;
      while (dtIsHex(this.at(i)) || (this.at(i) === 95 && this.sepOk(i, true))) {
        i++;
      }
      this.add(T_INT, p, i);
      this.p = i;
      return;
    }
    while (dtIsDigit(this.at(i)) || (this.at(i) === 95 && this.sepOk(i, false))) {
      i++;
    }
    if (this.at(i) === 46 && dtIsDigit(this.at(i + 1))) {
      isDouble = true;
      i++;
      while (dtIsDigit(this.at(i)) || (this.at(i) === 95 && this.sepOk(i, false))) {
        i++;
      }
    }
    const e = this.at(i);
    if (e === 101 || e === 69) {
      let j = i + 1;
      if (this.at(j) === 43 || this.at(j) === 45) {
        j++;
      }
      if (dtIsDigit(this.at(j))) {
        isDouble = true;
        i = j;
        while (dtIsDigit(this.at(i)) || (this.at(i) === 95 && this.sepOk(i, false))) {
          i++;
        }
      }
    }
    this.add(isDouble ? T_DOUBLE : T_INT, p, i);
    this.p = i;
  }

  /** Whether the `_` run at `i` separates two digits. */
  sepOk(i: i32, hex: boolean): boolean {
    let j = i;
    while (this.at(j) === 95) {
      j++;
    }
    const c = this.at(j);
    return hex ? dtIsHex(c) : dtIsDigit(c);
  }

  /** Scans a string literal starting at `a` whose quote is at `q`. */
  string(a: i32, q: i32, raw: boolean): void {
    const quote = this.at(q);
    let triple = false;
    let i = q + 1;
    if (this.at(q + 1) === quote && this.at(q + 2) === quote) {
      triple = true;
      i = q + 3;
    }
    this.stringBody(a, quote, triple, raw, i);
  }

  /**
   * Scans string contents from `from` (the segment's token starts at `a`)
   * up to the closing quote or the next interpolation.
   */
  stringBody(a0: i32, quote: i32, triple: boolean, raw: boolean, from: i32 = -1): void {
    let a = a0;
    let i = from < 0 ? a0 : from;
    const n = this.n;
    let segLine = this.line;
    while (true) {
      if (i >= n) {
        this.fail("unterminated string");
        return;
      }
      const c = toI32(this.src[i]);
      if (c === quote) {
        if (!triple) {
          this.addSeg(T_STRING, a, i + 1, segLine);
          this.p = i + 1;
          return;
        }
        if (this.at(i + 1) === quote && this.at(i + 2) === quote) {
          this.addSeg(T_STRING, a, i + 3, segLine);
          this.p = i + 3;
          return;
        }
        i++;
        continue;
      }
      if (c === 10 || c === 13) {
        if (!triple) {
          this.fail("newline in string");
          return;
        }
        this.newlineAt(c, i);
      }
      if (c === 92 && !raw) {
        const d = this.at(i + 1);
        if (d === 10 || d === 13) {
          this.newlineAt(d, i + 1);
        }
        i += 2;
        continue;
      }
      if (c === 36 && !raw) {
        const d = this.at(i + 1);
        if (d === 123) {
          this.addSeg(T_STRING, a, i, segLine);
          this.add(T_INTERP_EXPR, i, i + 2);
          this.p = i + 2;
          if (this.ns >= toI32(this.sQuote.length)) {
            this.fail("interpolation too deep");
            return;
          }
          this.sQuote[this.ns] = quote;
          this.sTriple[this.ns] = triple;
          this.sDepth[this.ns] = 0;
          this.ns = this.ns + 1;
          return;
        }
        if ((d >= 97 && d <= 122) || (d >= 65 && d <= 90) || d === 95) {
          this.addSeg(T_STRING, a, i, segLine);
          this.add(T_INTERP_IDENT, i, i + 1);
          let j = i + 2;
          while (j < n) {
            const e = toI32(this.src[j]);
            if ((e >= 97 && e <= 122) || (e >= 65 && e <= 90) || e === 95 || (e >= 48 && e <= 57)) {
              j++;
            } else {
              break;
            }
          }
          this.add(T_IDENT, i + 1, j);
          this.t.kw[this.t.count - 1] = dtKeyword(this.src, i + 1, j);
          // The rest of the string is the next segment.
          a = j;
          i = j;
          segLine = this.line;
          continue;
        }
        this.fail("bad interpolation");
        return;
      }
      i++;
    }
  }
}

/** Scans `src[0, n)`. */
export const dtScan = (src: u8[], n: i32): DtTokens => {
  const t = new DtTokens(src, n);
  const s = new DtScanner(t);
  s.scan();
  return t;
};

/** Scans without splitting any `>>` up front (see DtTokens.pred). */
export const dtScanPlain = (src: u8[], n: i32): DtTokens => {
  const t = new DtTokens(src, n);
  const s = new DtScanner(t);
  s.predict = false;
  s.scan();
  return t;
};

/** Whether the parser took every `>` the scanner split off as a closing angle bracket. */
export const dtPredictionsHeld = (t: DtTokens): boolean => {
  if (t.npred === 0) {
    return true;
  }
  for (let i = 0; i < t.count; i++) {
    if (t.pred[i] && !t.gt[i]) {
      return false;
    }
  }
  return true;
};
