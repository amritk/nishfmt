// Java tokens as google-java-format's JavaInput sees them: javac's tokens,
// with every multi-character operator split into one tok per character,
// whitespace split into runs of spaces and single newlines, and comments as
// their own toks. Columns follow JavaInput's arithmetic, including its habit
// of advancing a split operator's later characters by the whole operator.

import {
  GInput,
  TF_BLOCK_COMMENT,
  TF_JAVADOC,
  TF_LINE_COMMENT,
  TF_NEWLINE,
  TF_PARAM_COMMENT,
  TF_SPACES,
  TF_TOKEN,
} from "../gdoc/input";

// Token kinds (GInput.tKind).
export const JK_IDENT: i32 = 1;
export const JK_NUMBER: i32 = 2;
export const JK_CHAR: i32 = 3;
export const JK_STRING: i32 = 4;
export const JK_TEXT_BLOCK: i32 = 5;
export const JK_OP: i32 = 6; // one character of an operator or separator
export const JK_COMMENT: i32 = 7;
export const JK_WS: i32 = 8;

const jIsLetter = (c: i32): boolean =>
  (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36 || c >= 128;
const jIsDigit = (c: i32): boolean => c >= 48 && c <= 57;
const jIsIdentChar = (c: i32): boolean => jIsLetter(c) || jIsDigit(c);

/** The length of the longest Java operator at `src[i]` (javac's grouping). */
const opLength = (src: u8[], i: i32, n: i32): i32 => {
  const c = toI32(src[i]);
  const c1 = i + 1 < n ? toI32(src[i + 1]) : -1;
  const c2 = i + 2 < n ? toI32(src[i + 2]) : -1;
  const c3 = i + 3 < n ? toI32(src[i + 3]) : -1;
  switch (c) {
    case 40: // ( ) [ ] { } ; , @ ~ ?
    case 41:
    case 91:
    case 93:
    case 123:
    case 125:
    case 59:
    case 44:
    case 64:
    case 126:
    case 63:
      return 1;
    case 46: // . ...
      return c1 === 46 && c2 === 46 ? 3 : 1;
    case 58: // : ::
      return c1 === 58 ? 2 : 1;
    case 61: // = ==
    case 33: // ! !=
    case 42: // * *=
    case 37: // % %=
    case 94: // ^ ^=
    case 47: // / /=
      return c1 === 61 ? 2 : 1;
    case 43: // + ++ +=
      return c1 === 43 || c1 === 61 ? 2 : 1;
    case 45: // - -- -= ->
      return c1 === 45 || c1 === 61 || c1 === 62 ? 2 : 1;
    case 38: // & && &=
      return c1 === 38 || c1 === 61 ? 2 : 1;
    case 124: // | || |=
      return c1 === 124 || c1 === 61 ? 2 : 1;
    case 60: // < << <= <<=
      if (c1 === 60) {
        return c2 === 61 ? 3 : 2;
      }
      return c1 === 61 ? 2 : 1;
    case 62: // > >> >>> >= >>= >>>=
      if (c1 === 62) {
        if (c2 === 62) {
          return c3 === 61 ? 4 : 3;
        }
        return c2 === 61 ? 3 : 2;
      }
      return c1 === 61 ? 2 : 1;
    default:
      return 1;
  }
};

class Col {
  col: i32 = 0;
}

/** JavaInput.updateColumn: after a newline, the last line's length; else plus the length. */
const updateColumn = (inp: GInput, col: Col, a: i32, b: i32): void => {
  let last = -1;
  for (let i = a; i < b; i++) {
    const c = toI32(inp.src[i]);
    if (c === 10) {
      last = i + 1;
    } else if (c === 13) {
      if (i + 1 < b && toI32(inp.src[i + 1]) === 10) {
        i++;
      }
      last = i + 1;
    }
  }
  if (last > a) {
    col.col = inp.width(last, b);
  } else {
    col.col = col.col + inp.width(a, b);
  }
};

/** Whether `/* ... *\/` matches JavaInput's parameter-comment pattern `/\*[A-Za-z0-9\s_\-]+=\s*\*\/`. */
const isParamComment = (src: u8[], a: i32, b: i32): boolean => {
  if (b - a < 5) {
    return false;
  }
  let i = a + 2;
  const e = b - 2;
  const s0 = i;
  while (i < e) {
    const c = toI32(src[i]);
    if (
      (c >= 65 && c <= 90) ||
      (c >= 97 && c <= 122) ||
      jIsDigit(c) ||
      c === 95 ||
      c === 45 ||
      c === 32 ||
      c === 9 ||
      c === 10 ||
      c === 13 ||
      c === 12
    ) {
      i++;
    } else {
      break;
    }
  }
  // The character class is greedy but must leave the `=`; backtracking means
  // any `=` after one or more class characters works if only whitespace follows.
  if (i === s0 || i >= e || toI32(src[i]) !== 61) {
    return false;
  }
  i++;
  while (i < e) {
    const c = toI32(src[i]);
    if (c === 32 || c === 9 || c === 10 || c === 13 || c === 12) {
      i++;
    } else {
      return false;
    }
  }
  return true;
};

/** Lexes `src[0, n)` into `inp`'s toks and tokens; answers false on a lexical error. */
export const lexJava = (inp: GInput, src: u8[], n: i32): boolean => {
  inp.reset(src, n);
  const col = new Col();
  let i = 0;
  while (i < n) {
    const c = toI32(src[i]);
    const a = i;
    if (c === 32 || c === 9 || c === 12 || c === 10 || c === 13) {
      // A whitespace run: spaces and single newlines.
      while (i < n) {
        const d = toI32(src[i]);
        if (d === 32 || d === 9 || d === 12 || d === 10 || d === 13) {
          i++;
        } else {
          break;
        }
      }
      // Split as JavaInput does; every piece's column advances by the whole run.
      const c0 = col.col;
      let j = a;
      let cc = c0;
      while (j < i) {
        const d = toI32(src[j]);
        if (d === 10 || d === 13) {
          const e = d === 13 && j + 1 < i && toI32(src[j + 1]) === 10 ? j + 2 : j + 1;
          inp.addTok(j, e, TF_NEWLINE, JK_WS, cc);
          j = e;
        } else {
          let e = j;
          while (e < i && toI32(src[e]) !== 10 && toI32(src[e]) !== 13) {
            e++;
          }
          inp.addTok(j, e, TF_SPACES, JK_WS, cc);
          j = e;
        }
        const t = new Col();
        t.col = cc;
        updateColumn(inp, t, a, i);
        cc = t.col;
      }
      updateColumn(inp, col, a, i);
      continue;
    }
    if (c === 47 && i + 1 < n && toI32(src[i + 1]) === 47) {
      while (i < n && toI32(src[i]) !== 10 && toI32(src[i]) !== 13) {
        i++;
      }
      inp.addTok(a, i, TF_LINE_COMMENT, JK_COMMENT, col.col);
      updateColumn(inp, col, a, i);
      continue;
    }
    if (c === 47 && i + 1 < n && toI32(src[i + 1]) === 42) {
      i += 2;
      let closed = false;
      while (i + 1 < n) {
        if (toI32(src[i]) === 42 && toI32(src[i + 1]) === 47) {
          i += 2;
          closed = true;
          break;
        }
        i++;
      }
      if (!closed) {
        return false;
      }
      let f = TF_BLOCK_COMMENT;
      if (i - a > 4 && toI32(src[a + 2]) === 42 && toI32(src[a + 3]) !== 42) {
        f |= TF_JAVADOC;
      }
      if (isParamComment(src, a, i)) {
        f |= TF_PARAM_COMMENT;
      }
      inp.addTok(a, i, f, JK_COMMENT, col.col);
      updateColumn(inp, col, a, i);
      continue;
    }
    if (jIsLetter(c)) {
      while (i < n && jIsIdentChar(toI32(src[i]))) {
        i++;
      }
      inp.addTok(a, i, TF_TOKEN, JK_IDENT, col.col);
      updateColumn(inp, col, a, i);
      continue;
    }
    if (jIsDigit(c) || (c === 46 && i + 1 < n && jIsDigit(toI32(src[i + 1])))) {
      i = scanNumber(src, i, n);
      inp.addTok(a, i, TF_TOKEN, JK_NUMBER, col.col);
      updateColumn(inp, col, a, i);
      continue;
    }
    if (c === 34) {
      if (i + 2 < n && toI32(src[i + 1]) === 34 && toI32(src[i + 2]) === 34) {
        // A text block: to the next unescaped """.
        i += 3;
        let closed = false;
        while (i < n) {
          const d = toI32(src[i]);
          if (d === 92) {
            i += 2;
            continue;
          }
          if (d === 34 && i + 2 < n && toI32(src[i + 1]) === 34 && toI32(src[i + 2]) === 34) {
            i += 3;
            closed = true;
            break;
          }
          i++;
        }
        if (!closed) {
          return false;
        }
        inp.addTok(a, i, TF_TOKEN, JK_TEXT_BLOCK, col.col);
        updateColumn(inp, col, a, i);
        continue;
      }
      i++;
      let closed = false;
      while (i < n) {
        const d = toI32(src[i]);
        if (d === 92) {
          i += 2;
          continue;
        }
        if (d === 34) {
          i++;
          closed = true;
          break;
        }
        if (d === 10 || d === 13) {
          break;
        }
        i++;
      }
      if (!closed) {
        return false;
      }
      inp.addTok(a, i, TF_TOKEN, JK_STRING, col.col);
      updateColumn(inp, col, a, i);
      continue;
    }
    if (c === 39) {
      i++;
      let closed = false;
      while (i < n) {
        const d = toI32(src[i]);
        if (d === 92) {
          i += 2;
          continue;
        }
        if (d === 39) {
          i++;
          closed = true;
          break;
        }
        if (d === 10 || d === 13) {
          break;
        }
        i++;
      }
      if (!closed) {
        return false;
      }
      inp.addTok(a, i, TF_TOKEN, JK_CHAR, col.col);
      updateColumn(inp, col, a, i);
      continue;
    }
    if (c === 92 && i + 1 < n && toI32(src[i + 1]) === 117) {
      // A unicode escape outside a literal: not supported.
      return false;
    }
    // An operator: one tok per character, each advancing by the whole operator.
    const len = opLength(src, i, n);
    const c0 = col.col;
    for (let q = 0; q < len; q++) {
      inp.addTok(i + q, i + q + 1, TF_TOKEN, JK_OP, c0 + q * len);
    }
    i += len;
    col.col = c0 + len * len;
  }
  inp.addEof(n, col.col);
  inp.buildTokens();
  return true;
};

/** Scans a Java numeric literal from `i`; answers its end. */
const scanNumber = (src: u8[], i0: i32, n: i32): i32 => {
  let i = i0;
  const c = toI32(src[i]);
  if (c === 48 && i + 1 < n && (toI32(src[i + 1]) === 120 || toI32(src[i + 1]) === 88)) {
    // Hex, possibly a hex float.
    i += 2;
    while (i < n && (jIsHex(toI32(src[i])) || toI32(src[i]) === 95)) {
      i++;
    }
    if (i < n && toI32(src[i]) === 46) {
      i++;
      while (i < n && (jIsHex(toI32(src[i])) || toI32(src[i]) === 95)) {
        i++;
      }
    }
    if (i < n && (toI32(src[i]) === 112 || toI32(src[i]) === 80)) {
      i++;
      if (i < n && (toI32(src[i]) === 43 || toI32(src[i]) === 45)) {
        i++;
      }
      while (i < n && (jIsDigit(toI32(src[i])) || toI32(src[i]) === 95)) {
        i++;
      }
    }
    return suffix(src, i, n);
  }
  if (c === 48 && i + 1 < n && (toI32(src[i + 1]) === 98 || toI32(src[i + 1]) === 66)) {
    i += 2;
    while (i < n && (toI32(src[i]) === 48 || toI32(src[i]) === 49 || toI32(src[i]) === 95)) {
      i++;
    }
    return suffix(src, i, n);
  }
  while (i < n && (jIsDigit(toI32(src[i])) || toI32(src[i]) === 95)) {
    i++;
  }
  if (i < n && toI32(src[i]) === 46 && !(i + 1 < n && toI32(src[i + 1]) === 46)) {
    // A fraction (not the start of `...`, and not a member access on an int, which Java has not).
    i++;
    while (i < n && (jIsDigit(toI32(src[i])) || toI32(src[i]) === 95)) {
      i++;
    }
  }
  if (i < n && (toI32(src[i]) === 101 || toI32(src[i]) === 69)) {
    i++;
    if (i < n && (toI32(src[i]) === 43 || toI32(src[i]) === 45)) {
      i++;
    }
    while (i < n && (jIsDigit(toI32(src[i])) || toI32(src[i]) === 95)) {
      i++;
    }
  }
  return suffix(src, i, n);
};

const jIsHex = (c: i32): boolean => jIsDigit(c) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70);

const suffix = (src: u8[], i: i32, n: i32): i32 => {
  if (i < n) {
    const c = toI32(src[i]);
    if (c === 108 || c === 76 || c === 102 || c === 70 || c === 100 || c === 68) {
      return i + 1;
    }
  }
  return i;
};
