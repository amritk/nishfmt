// Formatting and tools for comments: rustfmt's comment.rs at the default
// configuration (normalize_comments, wrap_comments and
// format_code_in_doc_comments off, so comments are re-indented, not
// rewrapped), with its char classifier, line classes and comment/code slices.
//
// Ported from rustfmt 1.10.0 (MIT OR Apache-2.0, Copyright The Rust Project
// Developers): comment.rs, utils.rs.

import { add32, atI32, atU8, growI32, sub32 } from "../core/arr";
import { fault } from "../core/fault";
import { RsCtx } from "./context";
import { rsZeroI32s, rsZeroU8s } from "./lexer";
import { RsConfig, RsShape, rsIndentFromWidth, rsIndentStr, rsIndentStrNl } from "./shape";
import {
  RsStrBuf,
  rsCountMatches,
  rsIndexOfByte,
  rsIsAlnumByte,
  rsIsBlank,
  rsLines,
  rsTrim,
  rsTrimEnd,
  rsTrimStart,
  rsWidth,
  rsWidthRange,
  rsWsLenAt,
} from "./str";

// FullCodeCharKind.
export const K_NORMAL: i32 = 0;
export const K_START_COMMENT: i32 = 1;
export const K_IN_COMMENT: i32 = 2;
export const K_END_COMMENT: i32 = 3;
export const K_START_STRING_COMMENTED: i32 = 4;
export const K_END_STRING_COMMENTED: i32 = 5;
export const K_IN_STRING_COMMENTED: i32 = 6;
export const K_START_STRING: i32 = 7;
export const K_END_STRING: i32 = 8;
export const K_IN_STRING: i32 = 9;

/** `s.slice(a, b)`: the bytes `s[a, b)`, or "" after a fault when that is not a range of `s`. */
export const rsSliceStr = (s: string, a: i32, b: i32): string => {
  if (a >= 0 && a <= b && b <= toI32(s.length)) {
    return s.substring(a, b);
  }
  fault();
  return "";
};

export const rsKindIsComment = (k: i32): boolean => k >= K_START_COMMENT && k <= K_IN_STRING_COMMENTED;
export const rsKindInsideComment = (k: i32): boolean =>
  k === K_IN_COMMENT || (k >= K_START_STRING_COMMENTED && k <= K_IN_STRING_COMMENTED);
export const rsKindIsString = (k: i32): boolean => k === K_IN_STRING || k === K_START_STRING;
export const rsKindIsCommentedString = (k: i32): boolean =>
  k === K_IN_STRING_COMMENTED || k === K_START_STRING_COMMENTED;

/**
 * indent_next_line (utils.rs): whether the line after one of kind `k` may be
 * indented when a separately formatted block is put back (format_strings is
 * off, so never inside a string).
 */
export const rsIndentNextLine = (k: i32, cfg: RsConfig): boolean => {
  if (rsKindIsString(k)) {
    return false;
  }
  return cfg.styleEdition < 2024 || !rsKindIsCommentedString(k);
};

// CodeCharKind.
export const CK_NORMAL: i32 = 0;
export const CK_COMMENT: i32 = 1;

// CharClassesStatus.
const S_NORMAL: i32 = 0;
const S_LIT_STRING: i32 = 1;
const S_LIT_STRING_ESCAPE: i32 = 2;
const S_LIT_RAW_STRING: i32 = 3;
const S_RAW_STRING_PREFIX: i32 = 4;
const S_RAW_STRING_SUFFIX: i32 = 5;
const S_LIT_CHAR: i32 = 6;
const S_LIT_CHAR_ESCAPE: i32 = 7;
const S_BLOCK_COMMENT: i32 = 8;
const S_STRING_IN_BLOCK_COMMENT: i32 = 9;
const S_BLOCK_COMMENT_OPENING: i32 = 10;
const S_BLOCK_COMMENT_CLOSING: i32 = 11;
const S_LINE_COMMENT: i32 = 12;

/** The kinds CharClasses gives each char of a string, one entry per byte. */
export class RsClasses {
  kinds: i32[];
  // Char starts, in order, and their count.
  starts: i32[];
  nc: i32 = 0;
  // Whether the status after the last char is Normal.
  endNormal: boolean = true;
  constructor(n: i32) {
    this.kinds = rsZeroI32s(add32(n, 1));
    this.starts = rsZeroI32s(add32(n, 1));
  }
}

const nextChar = (s: string, i: i32, n: i32): i32 => {
  let j = i + 1;
  while (j < n && (s.charCodeAt(j) & 0xc0) === 0x80) {
    j++;
  }
  return j;
};

const at8 = (src: u8[], i: i32): i32 => {
  if (i >= 0 && i < src.length) {
    return toI32(src[i]);
  }
  fault();
  return -1;
};

const next8 = (src: u8[], i: i32, n: i32): i32 => {
  // Every caller has `i < n`, and the scan stays inside `src`.
  if (i < 0 || i >= n || n > src.length) {
    fault();
    return n;
  }
  let j = i + 1;
  while (j < n && (toI32(src[j]) & 0xc0) === 0x80) {
    j++;
  }
  return j;
};

/** CharClasses as a stream over the bytes `src[i, n)`: `next` gives each char's kind. */
export class RsCharScan {
  src: u8[];
  n: i32;
  i: i32; // the next char
  cs: i32 = 0; // the char `next` last gave
  st: i32 = 0;
  arg: i32 = 0;
  constructor(src: u8[], i: i32, n: i32) {
    this.src = src;
    this.i = i;
    this.n = n;
  }

  /**
   * The end of the run of chars from `i` that `next` would give as plain code
   * without a change of state (K_NORMAL from the Normal state); `i` itself
   * outside that state. A caller that handles the run in a loop of its own
   * moves past it with `skipTo`.
   */
  plainEnd(): i32 {
    let i = this.i;
    if (this.st !== S_NORMAL) {
      return i;
    }
    const n = this.n;
    const src = this.src;
    while (i >= 0 && i < n && i < src.length) {
      const c = toI32(src[i]);
      if (c >= 128 || c === 114 || c === 34 || c === 39 || c === 47) {
        break;
      }
      i++;
    }
    return i;
  }

  /**
   * The end of the line comment the scan is in: the `\n` that ends it, or the
   * end; `i` itself outside one. `next` gives every char before it
   * K_IN_COMMENT, without a change of state.
   */
  lineCommentEnd(): i32 {
    let i = this.i;
    if (this.st !== S_LINE_COMMENT) {
      return i;
    }
    const n = this.n;
    const src = this.src;
    while (i >= 0 && i < n && i < src.length && toI32(src[i]) !== 10) {
      i++;
    }
    return i;
  }

  /**
   * Moves past the chars before `e` (from `plainEnd` or `lineCommentEnd`), as
   * a `next` for each would: `cs` is the start of the last of them.
   */
  skipTo(e: i32): void {
    const i = this.i;
    if (e <= i) {
      return;
    }
    const src = this.src;
    // Both ends come from a scan inside `src`.
    if (i < 0 || e > src.length) {
      fault();
      return;
    }
    // `\n` and plain code are single bytes, so `e` starts a char.
    let c = sub32(e, 1);
    while (c > i && c > 0 && c < src.length && (toI32(src[c]) & 0xc0) === 0x80) {
      c--;
    }
    this.cs = c;
    this.i = e;
  }

  /** The kind of the next char (its start in `cs`), or -1 at the end. */
  next(): i32 {
    const src = this.src;
    const n = this.n;
    const i = this.i;
    if (i >= n) {
      return -1;
    }
    // The scan stays inside `src[0, n)`.
    if (i < 0 || i >= src.length) {
      fault();
      return -1;
    }
    const chr = toI32(src[i]);
    const st0 = this.st;
    if (st0 === S_NORMAL) {
      // Plain code: no state change.
      if (chr < 128 && chr !== 114 && chr !== 34 && chr !== 39 && chr !== 47) {
        this.cs = i;
        this.i = i + 1;
        return K_NORMAL;
      }
    } else if (chr < 128) {
      // Inside a comment or a string most chars change nothing: those the
      // general path below gives the state's own kind without a transition,
      // when the char is one byte (the next is not a continuation byte).
      const i1 = i + 1;
      if (i1 >= n || i1 >= src.length || (toI32(src[i1]) & 0xc0) !== 0x80) {
        let k = -1;
        if (st0 === S_LINE_COMMENT) {
          k = chr !== 10 ? K_IN_COMMENT : -1;
        } else if (st0 === S_BLOCK_COMMENT) {
          k = chr !== 42 && chr !== 47 && chr !== 34 ? K_IN_COMMENT : -1;
        } else if (st0 === S_LIT_STRING) {
          k = chr !== 34 && chr !== 92 ? K_IN_STRING : -1;
        } else if (st0 === S_LIT_RAW_STRING) {
          k = chr !== 34 ? K_IN_STRING : -1;
        } else if (st0 === S_STRING_IN_BLOCK_COMMENT) {
          k = chr !== 34 && chr !== 42 ? K_IN_STRING_COMMENTED : -1;
        }
        if (k >= 0) {
          this.cs = i;
          this.i = i1;
          return k;
        }
      }
    }
    let st = st0;
    let arg = this.arg;
    // A count of `#`s or a comment depth: never more than the bytes scanned.
    if (arg < 0 || arg >= n) {
      fault();
      return -1;
    }
    // next8, inline (`n <= src.length`, so the second test never ends the loop early).
    let j = i + 1;
    while (j < n && j < src.length && (toI32(src[j]) & 0xc0) === 0x80) {
      j++;
    }
    let kind = K_NORMAL;
    // The peeks: chars after this one.
    const p1 = j;
    let c1 = -1;
    if (p1 < n) {
      c1 = at8(src, p1);
    }
    let done = false;
    if (st === S_LIT_RAW_STRING) {
      kind = K_IN_STRING;
      if (chr === 34) {
        if (arg === 0) {
          // rustfmt 1.10: the closing quote of a raw string without `#`s is normal code.
          kind = K_NORMAL;
          st = S_NORMAL;
        } else {
          // is_raw_string_suffix: the next `arg` chars are all '#'.
          let ok = true;
          let q = p1;
          for (let k = 0; k < arg; k++) {
            if (q >= n || at8(src, q) !== 35) {
              ok = false;
              break;
            }
            q = next8(src, q, n);
          }
          if (ok) {
            st = S_RAW_STRING_SUFFIX;
          }
        }
      }
    } else if (st === S_RAW_STRING_PREFIX) {
      kind = K_IN_STRING;
      if (chr === 35) {
        arg++;
      } else if (chr === 34) {
        st = S_LIT_RAW_STRING;
      } else {
        st = S_NORMAL;
      }
    } else if (st === S_RAW_STRING_SUFFIX) {
      if (chr === 35) {
        if (arg === 1) {
          st = S_NORMAL;
        } else {
          kind = K_IN_STRING;
          arg--;
        }
      } else {
        st = S_NORMAL;
      }
    } else if (st === S_LIT_STRING) {
      kind = K_IN_STRING;
      if (chr === 34) {
        st = S_NORMAL;
      } else if (chr === 92) {
        st = S_LIT_STRING_ESCAPE;
      }
    } else if (st === S_LIT_STRING_ESCAPE) {
      kind = K_IN_STRING;
      st = S_LIT_STRING;
    } else if (st === S_LIT_CHAR) {
      if (chr === 92) {
        st = S_LIT_CHAR_ESCAPE;
      } else if (chr === 39) {
        st = S_NORMAL;
      }
    } else if (st === S_LIT_CHAR_ESCAPE) {
      st = S_LIT_CHAR;
    } else if (st === S_NORMAL) {
      if (chr === 114) {
        if (c1 === 34) {
          kind = K_IN_STRING;
          st = S_RAW_STRING_PREFIX;
          arg = 0;
        } else if (c1 === 35) {
          // rustfmt 1.10 takes any `r#` for a raw string prefix (raw identifiers too).
          const isRaw = true;
          if (isRaw) {
            kind = K_IN_STRING;
            st = S_RAW_STRING_PREFIX;
            arg = 0;
          }
        }
      } else if (chr === 34) {
        kind = K_IN_STRING;
        st = S_LIT_STRING;
      } else if (chr === 39) {
        if (c1 === 92) {
          st = S_LIT_CHAR;
        } else {
          const p2 = p1 < n ? next8(src, p1, n) : n;
          let c2 = -1;
          if (p2 < n) {
            c2 = at8(src, p2);
          }
          if (c2 === 39) {
            st = S_LIT_CHAR;
          }
        }
      } else if (chr === 47) {
        if (c1 === 42) {
          st = S_BLOCK_COMMENT_OPENING;
          arg = 1;
          kind = K_START_COMMENT;
          done = true;
        } else if (c1 === 47) {
          st = S_LINE_COMMENT;
          kind = K_START_COMMENT;
          done = true;
        }
      }
    } else if (st === S_STRING_IN_BLOCK_COMMENT) {
      kind = K_IN_STRING_COMMENTED;
      if (chr === 34) {
        st = S_BLOCK_COMMENT;
      } else if (chr === 42 && c1 === 47) {
        kind = K_IN_COMMENT;
        st = S_BLOCK_COMMENT_CLOSING;
        arg = arg - 1;
      }
    } else if (st === S_BLOCK_COMMENT) {
      kind = K_IN_COMMENT;
      if (c1 === 47 && chr === 42) {
        st = S_BLOCK_COMMENT_CLOSING;
        arg = arg - 1;
      } else if (c1 === 42 && chr === 47) {
        st = S_BLOCK_COMMENT_OPENING;
        arg = arg + 1;
      } else if (chr === 34) {
        st = S_STRING_IN_BLOCK_COMMENT;
      }
    } else if (st === S_BLOCK_COMMENT_OPENING) {
      st = S_BLOCK_COMMENT;
      kind = K_IN_COMMENT;
    } else if (st === S_BLOCK_COMMENT_CLOSING) {
      if (arg === 0) {
        st = S_NORMAL;
        kind = K_END_COMMENT;
      } else {
        st = S_BLOCK_COMMENT;
        kind = K_IN_COMMENT;
      }
    } else if (st === S_LINE_COMMENT) {
      if (chr === 10) {
        st = S_NORMAL;
        kind = K_END_COMMENT;
      } else {
        kind = K_IN_COMMENT;
      }
    }
    if (done) {
      // (the status is already set)
    }
    this.st = st;
    this.arg = arg;
    this.cs = i;
    this.i = j;
    return kind;
  }
}

const strToBytes = (s: string): u8[] => {
  const n = toI32(s.length);
  const b = rsZeroU8s(add32(n, 1));
  for (let i = 0; i < n && i < b.length; i++) {
    b[i] = toU8(s.charCodeAt(i));
  }
  return b;
};

/**
 * Whether CharClasses can find a comment in `s`: one starts only at a `/` of
 * plain code followed by `/` or `*`, so a text with neither pair has none,
 * and every char of it is code or string.
 */
export const rsMayHaveComment = (s: string): boolean => s.indexOf("//") >= 0 || s.indexOf("/*") >= 0;

/** Runs CharClasses over `s`. */
export const rsCharClasses = (s: string): RsClasses => {
  const n = toI32(s.length);
  const r = new RsClasses(n);
  const sc = new RsCharScan(strToBytes(s), 0, n);
  const starts = r.starts;
  const kinds = r.kinds;
  let nc = 0;
  for (;;) {
    // A run of plain code: one char a byte, each K_NORMAL.
    const pe = sc.plainEnd();
    for (let k = sc.i; k >= 0 && k < pe && k < kinds.length; k++) {
      if (nc < 0 || nc >= starts.length) {
        fault();
        break;
      }
      starts[nc] = k;
      nc++;
      kinds[k] = K_NORMAL;
    }
    sc.skipTo(pe);
    const kind = sc.next();
    if (kind < 0) {
      break;
    }
    const cs = sc.cs;
    const e = sc.i;
    // Each char is a byte or more of `s`, and both arrays hold a slot a byte.
    if (nc < 0 || nc >= starts.length || cs < 0 || e > kinds.length) {
      fault();
      break;
    }
    starts[nc] = cs;
    nc++;
    for (let k = cs; k >= 0 && k < e && k < kinds.length; k++) {
      kinds[k] = kind;
    }
  }
  r.nc = nc;
  r.endNormal = sc.st === S_NORMAL;
  return r;
};

/** find_uncommented over the bytes `src[lo, hi)`: the offset from `lo`, or -1. Stops at the first match. */
export const rsFindUncommentedIn = (src: u8[], lo: i32, hi: i32, pat: string): i32 => {
  const m = toI32(pat.length);
  const sc = new RsCharScan(src, lo, hi);
  let ni = 0;
  for (;;) {
    // A run of plain code, matched here as the loop below would match it a char at a time.
    const pe = sc.plainEnd();
    for (let i = sc.i; i >= 0 && i < pe && i < src.length; i++) {
      if (ni >= m) {
        return sub32(sub32(i, m), lo);
      }
      if (ni >= 0 && toI32(src[i]) === pat.charCodeAt(ni)) {
        ni++;
      } else {
        ni = 0;
      }
    }
    sc.skipTo(pe);
    const k = sc.next();
    if (k < 0) {
      break;
    }
    if (ni >= m) {
      return sub32(sub32(sc.cs, m), lo);
    }
    if ((k === K_NORMAL || k === K_IN_STRING) && ni >= 0 && atU8(src, sc.cs) === pat.charCodeAt(ni)) {
      ni++;
    } else {
      ni = 0;
    }
  }
  if (ni < m) {
    return -1;
  }
  return sub32(sub32(hi, m), lo);
};

/** Whether `text` contains any comment. */
export const rsContainsComment = (text: string): boolean => {
  const n = toI32(text.length);
  if (!rsMayHaveComment(text)) {
    return false;
  }
  const sc = new RsCharScan(strToBytes(text), 0, n);
  for (;;) {
    sc.skipTo(sc.plainEnd());
    const k = sc.next();
    if (k < 0) {
      return false;
    }
    if (rsKindIsComment(k)) {
      return true;
    }
  }
};

/** FindUncommented::find_uncommented. */
export const rsFindUncommented = (s: string, pat: string): i32 => {
  const n = toI32(s.length);
  return rsFindUncommentedIn(strToBytes(s), 0, n, pat);
};

/** FindUncommented::find_last_uncommented. */
export const rsFindLastUncommented = (s: string, pat: string): i32 => {
  const left = rsFindUncommented(s, pat);
  if (left < 0) {
    return -1;
  }
  let result = left;
  for (;;) {
    const next = rsFindLastUncommented(rsSliceStr(s, add32(result, 1), toI32(s.length)), pat);
    if (next < 0) {
      break;
    }
    result = add32(result, add32(next, 1));
  }
  return result;
};

/** find_comment_end: the offset of the first code char after the comments at the start, or -1. */
export const rsFindCommentEnd = (s: string): i32 => {
  const r = rsCharClasses(s);
  const starts = r.starts;
  const kinds = r.kinds;
  for (let ci = 0; ci < r.nc && ci < starts.length; ci++) {
    const i = starts[ci];
    const k = atI32(kinds, i);
    if (k === K_NORMAL || k === K_IN_STRING) {
      return i;
    }
  }
  return r.endNormal ? toI32(s.length) : -1;
};

/** LineClasses: each line with the char kind at its end. */
export class RsLineClasses {
  lines: string[];
  kinds: i32[];
  n: i32 = 0;
  constructor() {
    this.lines = [];
    this.kinds = new Array<i32>(8);
  }
}

export const rsLineClasses = (s: string): RsLineClasses => {
  const out = new RsLineClasses();
  const n = toI32(s.length);
  if (n === 0) {
    return out;
  }
  const r = rsCharClasses(s);
  const nc = r.nc;
  const starts = r.starts;
  const kinds = r.kinds;
  let ci = 0;
  while (ci < nc) {
    const lineStart = atI32(starts, ci);
    const startKind = atI32(kinds, lineStart);
    let kind = K_NORMAL;
    let lineEnd = n;
    let sawNl = false;
    while (ci >= 0 && ci < nc) {
      const i = atI32(starts, ci);
      const k = atI32(kinds, i);
      kind = k;
      ci++;
      // A char start is in `s`.
      if (i < 0 || i >= n) {
        fault();
        return out;
      }
      if (s.charCodeAt(i) === 10) {
        if (startKind === K_NORMAL && k === K_IN_STRING) {
          kind = K_START_STRING;
        } else if (startKind === K_IN_STRING && k === K_NORMAL) {
          kind = K_END_STRING;
        } else if (startKind === K_IN_COMMENT && k === K_IN_STRING_COMMENTED) {
          kind = K_START_STRING_COMMENTED;
        } else if (startKind === K_IN_STRING_COMMENTED && k === K_IN_COMMENT) {
          kind = K_END_STRING_COMMENTED;
        }
        lineEnd = i;
        sawNl = true;
        break;
      }
    }
    if (!sawNl) {
      lineEnd = n;
    }
    let e = lineEnd;
    if (e > lineStart && e > 0 && e <= toI32(s.length) && s.charCodeAt(e - 1) === 13) {
      e--;
    }
    out.lines.push(rsSliceStr(s, lineStart, e));
    // One line a char at most.
    const on = out.n;
    if (on < 0 || on >= n) {
      fault();
      return out;
    }
    out.kinds = growI32(out.kinds, on + 1);
    const oks = out.kinds;
    if (on < oks.length) {
      oks[on] = kind;
    } else {
      fault();
    }
    out.n = on + 1;
  }
  return out;
};

/** Slices of code and comments: (kind, start, end) triples. */
export class RsSlices {
  kind: i32[];
  start: i32[];
  end: i32[];
  n: i32 = 0;
  constructor() {
    this.kind = new Array<i32>(8);
    this.start = new Array<i32>(8);
    this.end = new Array<i32>(8);
  }
  add(k: i32, a: i32, b: i32): void {
    const i = this.n;
    // A slice is a byte of the text or more.
    if (i < 0 || i > 1073741823) {
      fault();
      return;
    }
    this.kind = growI32(this.kind, i + 1);
    this.start = growI32(this.start, i + 1);
    this.end = growI32(this.end, i + 1);
    const kinds = this.kind;
    const starts = this.start;
    const ends = this.end;
    if (i < kinds.length && i < starts.length && i < ends.length) {
      kinds[i] = k;
      starts[i] = a;
      ends[i] = b;
      this.n = i + 1;
    } else {
      fault();
    }
  }
}

/** CommentCodeSlices: alternating code and comment slices; the first is code (maybe empty). */
export const rsCommentCodeSlices = (s: string): RsSlices => {
  const out = new RsSlices();
  const n = toI32(s.length);
  if (n > 0 && !rsMayHaveComment(s)) {
    // No comment: one code slice.
    out.add(CK_NORMAL, 0, n);
    return out;
  }
  const bytes = strToBytes(s);
  let lastKind = CK_COMMENT;
  let lastEnd = 0;
  while (lastEnd !== n) {
    // Each slice ends inside the text, after the last one.
    if (lastEnd < 0 || lastEnd > n) {
      fault();
      return out;
    }
    let subEnd = lastEnd;
    let firstWs = -1; // the offset of the first connecting whitespace, or -1
    const startsSlashSlash =
      lastEnd < n && lastEnd + 1 < n && s.charCodeAt(lastEnd) === 47 && s.charCodeAt(lastEnd + 1) === 47;
    let broke = false;
    let brokeAtLast = false;
    const sc = new RsCharScan(bytes, lastEnd, n);
    for (;;) {
      const kind0 = sc.next();
      if (kind0 < 0) {
        break;
      }
      const cs = sc.cs;
      // The scan gives chars of `s`.
      if (cs < 0 || cs >= n) {
        fault();
        return out;
      }
      const c = s.charCodeAt(cs);
      const isConnector = lastKind === CK_NORMAL && startsSlashSlash && (c === 32 || c === 9);
      if (isConnector && firstWs < 0) {
        firstWs = cs;
      }
      const ck = rsKindIsComment(kind0) ? CK_COMMENT : CK_NORMAL;
      if (ck === lastKind && !isConnector) {
        subEnd = firstWs >= 0 ? firstWs : cs;
        broke = true;
        brokeAtLast = sc.i >= n;
        break;
      }
      if (!isConnector) {
        firstWs = -1;
      }
    }
    const iterDone = !broke || brokeAtLast;
    if (iterDone && subEnd === lastEnd) {
      subEnd = firstWs >= 0 ? firstWs : n;
    }
    const kind = lastKind === CK_COMMENT ? CK_NORMAL : CK_COMMENT;
    out.add(kind, lastEnd, subEnd);
    lastEnd = subEnd;
    lastKind = kind;
  }
  return out;
};

/** UngroupedCommentCodeSlices: code runs, and one comment per slice. */
export const rsUngroupedSlices = (s: string): RsSlices => {
  const out = new RsSlices();
  const n = toI32(s.length);
  if (!rsMayHaveComment(s)) {
    // No comment: one code slice.
    if (n > 0) {
      out.add(CK_NORMAL, 0, n);
    }
    return out;
  }
  const sc = new RsCharScan(strToBytes(s), 0, n);
  let k = sc.next();
  let at = sc.cs;
  while (k >= 0) {
    const kind = k;
    const startIdx = at;
    k = sc.next();
    at = sc.cs;
    if (kind === K_NORMAL || kind === K_IN_STRING) {
      while (k >= 0 && !rsKindIsComment(k)) {
        sc.skipTo(sc.plainEnd());
        k = sc.next();
        at = sc.cs;
      }
    } else if (kind === K_START_COMMENT) {
      // `loop { match next() { Some(k) if inside_comment => continue, _ => break } }`: the
      // char that ends the loop is consumed too.
      for (;;) {
        if (k < 0) {
          break;
        }
        // The rest of a line comment, each char K_IN_COMMENT: the loop would
        // go on over every one of them.
        if (k === K_IN_COMMENT) {
          const le = sc.lineCommentEnd();
          if (le > sc.i) {
            sc.skipTo(le);
            at = sc.cs;
          }
        }
        const kk = k;
        k = sc.next();
        at = sc.cs;
        if (!rsKindInsideComment(kk)) {
          break;
        }
      }
    } else {
      // rustfmt panics here; it cannot happen for well-formed input.
      k = sc.next();
      at = sc.cs;
    }
    const end = k >= 0 ? at : n;
    out.add(rsKindIsComment(kind) ? CK_COMMENT : CK_NORMAL, startIdx, end);
  }
  return out;
};

const removeCommentHeader = (c: string): string => {
  const n = toI32(c.length);
  if (c.startsWith("///") || c.startsWith("//!")) {
    return rsSliceStr(c, 3, n);
  }
  if (c.startsWith("//")) {
    return rsSliceStr(c, 2, n);
  }
  if ((c.startsWith("/**") && !c.startsWith("/**/")) || c.startsWith("/*!")) {
    return n >= 5 ? rsSliceStr(c, 3, n - 2) : "";
  }
  return n >= 4 ? rsSliceStr(c, 2, n - 2) : "";
};

// The payload of a comment: CommentReducer's chars, appended to `out` as one string.
const commentPayload = (comment: string): string => {
  const isBlock = comment.startsWith("/*");
  const c = removeCommentHeader(comment);
  const n = toI32(c.length);
  let atStart = false;
  let i = 0;
  // The payload is runs of `c`: the run `c[runStart, runEnd)` grows until a byte is dropped.
  const parts: string[] = [];
  let runStart = 0;
  let runEnd = 0;
  while (i >= 0 && i < n) {
    let w = rsWsLenAt(c, i);
    if (isBlock && atStart) {
      while (i >= 0 && i < n && w > 0) {
        // A whitespace char is at most three bytes, and text stays below 2^30 bytes.
        if (w > 3 || i > 1073741823) {
          fault();
          return "";
        }
        i += w;
        w = i < n ? rsWsLenAt(c, i) : 0;
      }
      if (i < 0 || i >= n) {
        break;
      }
      if (c.charCodeAt(i) === 42) {
        i++;
        if (i >= n) {
          break;
        }
        w = rsWsLenAt(c, i);
      }
    } else if (c.charCodeAt(i) === 10) {
      atStart = true;
    }
    if (w === 0) {
      // A non-whitespace char: copy all its bytes.
      const j = nextChar(c, i, n);
      if (i !== runEnd) {
        parts.push(c.substring(runStart, runEnd));
        runStart = i;
      }
      runEnd = j;
      i = j;
    } else {
      if (w < 0 || w > 3 || i > 1073741823) {
        fault();
        return "";
      }
      i += w;
    }
  }
  parts.push(c.substring(runStart, runEnd));
  return parts.join("");
};

const commentContent = (code: string): string => {
  if (!rsMayHaveComment(code)) {
    return "";
  }
  const sl = rsUngroupedSlices(code);
  const out = new RsStrBuf();
  for (let i = 0; i < sl.n; i++) {
    if (atI32(sl.kind, i) === CK_COMMENT) {
      out.add(commentPayload(rsSliceStr(code, atI32(sl.start, i), atI32(sl.end, i))));
    }
  }
  return out.str();
};

/** changed_comment_content. */
export const rsChangedCommentContent = (orig: string, nw: string): boolean => {
  // Without a comment opener neither has a comment.
  if (!rsMayHaveComment(orig) && !rsMayHaveComment(nw)) {
    return false;
  }
  return commentContent(orig) !== commentContent(nw);
};

/** filter_normal_code. */
export const rsFilterNormalCode = (code: string): string => {
  // Without a comment or a '\r' every line is kept as it is.
  if (!rsMayHaveComment(code) && rsIndexOfByte(code, 13, 0) < 0) {
    return code;
  }
  const lc = rsLineClasses(code);
  const bb = new RsStrBuf();
  const lines = lc.lines;
  for (let i = 0; i < lc.n; i++) {
    const k = atI32(lc.kinds, i);
    if (k === K_NORMAL || k === K_START_STRING || k === K_IN_STRING || k === K_END_STRING) {
      // `n` counts the lines.
      if (i < 0 || i >= lines.length) {
        fault();
        return "";
      }
      bb.add(lines[i]);
      bb.add("\n");
    }
  }
  let buf = bb.str();
  if (!code.endsWith("\n") && buf.endsWith("\n")) {
    buf = rsSliceStr(buf, 0, sub32(toI32(buf.length), 1));
  }
  return buf;
};

// ---- comment styles

export const CS_DOUBLE_SLASH: i32 = 0;
export const CS_TRIPLE_SLASH: i32 = 1;
export const CS_DOC: i32 = 2;
export const CS_SINGLE_BULLET: i32 = 3;
export const CS_DOUBLE_BULLET: i32 = 4;
export const CS_EXCLAMATION: i32 = 5;
export const CS_CUSTOM: i32 = 6;

export class RsCommentStyle {
  k: i32;
  opener: string; // the custom opener
  constructor(k: i32, opener: string) {
    this.k = k;
    this.opener = opener;
  }
  isLineComment(): boolean {
    return this.k === CS_DOUBLE_SLASH || this.k === CS_TRIPLE_SLASH || this.k === CS_DOC || this.k === CS_CUSTOM;
  }
  isBlockComment(): boolean {
    return this.k === CS_SINGLE_BULLET || this.k === CS_DOUBLE_BULLET || this.k === CS_EXCLAMATION;
  }
  openerStr(): string {
    const k = this.k;
    if (k === CS_DOUBLE_SLASH) return "// ";
    if (k === CS_TRIPLE_SLASH) return "/// ";
    if (k === CS_DOC) return "//! ";
    if (k === CS_SINGLE_BULLET) return "/* ";
    if (k === CS_DOUBLE_BULLET) return "/** ";
    if (k === CS_EXCLAMATION) return "/*! ";
    return this.opener;
  }
  closer(): string {
    return this.isBlockComment() ? " */" : "";
  }
  prefix(): string {
    const k = this.k;
    if (k === CS_DOUBLE_SLASH) return "// ";
    if (k === CS_TRIPLE_SLASH) return "/// ";
    if (k === CS_DOC) return "//! ";
    if (this.isBlockComment()) return " * ";
    return this.opener;
  }
  eq(o: RsCommentStyle): boolean {
    return this.k === o.k && (this.k !== CS_CUSTOM || this.opener === o.opener);
  }
}

const isCustomComment = (c: string): boolean => {
  if (!c.startsWith("//") || toI32(c.length) < 3) {
    return false;
  }
  const b = c.charCodeAt(2);
  return !rsIsAlnumByte(b) && rsWsLenAt(c, 2) === 0;
};

const customOpener = (s: string): string => {
  const ls = rsLines(s);
  if (ls.length > 0) {
    const first = ls[0];
    const sp = rsIndexOfByte(first, 32, 0);
    return sp < 0 ? first : rsSliceStr(first, 0, add32(sp, 1));
  }
  return "";
};

/** comment_style(orig, false). */
export const rsCommentStyle = (orig: string): RsCommentStyle => {
  if (orig.startsWith("/**") && !orig.startsWith("/**/")) {
    return new RsCommentStyle(CS_DOUBLE_BULLET, "");
  }
  if (orig.startsWith("/*!")) {
    return new RsCommentStyle(CS_EXCLAMATION, "");
  }
  if (orig.startsWith("/*")) {
    return new RsCommentStyle(CS_SINGLE_BULLET, "");
  }
  if (orig.startsWith("///") && (toI32(orig.length) <= 3 || orig.charCodeAt(3) !== 47)) {
    return new RsCommentStyle(CS_TRIPLE_SLASH, "");
  }
  if (orig.startsWith("//!")) {
    return new RsCommentStyle(CS_DOC, "");
  }
  if (isCustomComment(orig)) {
    return new RsCommentStyle(CS_CUSTOM, customOpener(orig));
  }
  return new RsCommentStyle(CS_DOUBLE_SLASH, "");
};

export const rsIsLastCommentBlock = (s: string): boolean => rsTrimEnd(s).endsWith("*/");

const computeLen = (orig: string, from: i32, line: string): i32 => {
  const rest = sub32(toI32(orig.length), from);
  const ll = toI32(line.length);
  if (rest > ll) {
    // The line is a part of `orig` from `from`.
    const at = add32(from, ll);
    if (at < 0 || at >= toI32(orig.length) || ll > 1073741823) {
      fault();
      return 0;
    }
    return orig.charCodeAt(at) === 13 ? ll + 2 : ll + 1;
  }
  return ll;
};

const trimEndUnlessTwo = (s: string, isDoc: boolean): string => {
  if (isDoc && s.endsWith("  ")) {
    return s;
  }
  return rsTrimEnd(s);
};

/** light_rewrite_comment. */
const lightRewriteComment = (orig: string, bi: i32, al: i32, cfg: RsConfig, isDoc: boolean): string => {
  const ls = rsLines(orig);
  const sep = "\n" + rsIndentStr(cfg, bi, al);
  const out = new RsStrBuf();
  for (let i = 0; i < toI32(ls.length); i++) {
    const l = ls[i];
    const fnw = rsTrimStartLen(l);
    let left = "";
    if (fnw < toI32(l.length)) {
      // rustfmt 1.10 keeps the whitespace char before a leading `*` (none at column 0).
      if (fnw >= 0 && l.charCodeAt(fnw) === 42 && fnw > 0) {
        left = rsSliceStr(l, fnw - 1, toI32(l.length));
      } else {
        left = rsSliceStr(l, fnw, toI32(l.length));
      }
    }
    if (i > 0) {
      out.add(sep);
    }
    out.add(trimEndUnlessTwo(left, isDoc));
  }
  return out.str();
};

const rsTrimStartLen = (s: string): i32 => {
  const n = toI32(s.length);
  let i = 0;
  while (i >= 0 && i < n) {
    const k = rsWsLenAt(s, i);
    if (k === 0) {
      break;
    }
    // A whitespace char is at most three bytes.
    if (k < 0 || k > 3 || i > 1073741823) {
      fault();
      return i;
    }
    i += k;
  }
  return i;
};

/** get_prefix_space_width_and_end: [width, end]. */
export const rsPrefixSpaceWidth = (s: string, tabSpaces: i32): i32 => {
  let w = 0;
  const n = toI32(s.length);
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c === 32) {
      w = add32(w, 1);
    } else if (c === 9) {
      w = add32(w, tabSpaces);
    } else {
      return w;
    }
  }
  return w;
};

export const rsPrefixSpaceEnd = (s: string): i32 => {
  const n = toI32(s.length);
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c !== 32 && c !== 9) {
      return i;
    }
  }
  return n;
};

/** trim_left_preserve_layout; null when it cannot. */
export const rsTrimLeftPreserveLayout = (orig: string, bi: i32, al: i32, cfg: RsConfig): string | null => {
  const lc = rsLineClasses(orig);
  if (lc.n === 0) {
    return null;
  }
  const lcLines = lc.lines;
  if (!(lcLines.length > 0)) {
    fault();
    return null;
  }
  const firstLine = rsTrimEnd(lcLines[0]);
  const trimmed: boolean[] = [];
  const lines: string[] = [];
  const widths: i32[] = [];
  let veto = false;
  let minPrefix = -1;
  for (let i = 1; i < lc.n; i++) {
    const kind = atI32(lc.kinds, i);
    // `n` counts the lines.
    if (i >= lcLines.length) {
      fault();
      return null;
    }
    let line = lcLines[i];
    let tr = true;
    let pw = -1;
    if (!rsIsBlank(line)) {
      pw = rsPrefixSpaceWidth(line, cfg.tabSpaces);
    }
    // Only InString{Commented}, so the start of a string may be indented.
    const newVeto =
      (kind === K_IN_STRING || (cfg.styleEdition >= 2024 && kind === K_IN_STRING_COMMENTED)) && !line.endsWith("\\");
    if (veto || newVeto) {
      veto = newVeto;
      tr = false;
    } else {
      line = rsTrim(line);
    }
    trimmed.push(tr);
    lines.push(line);
    widths.push(pw);
    // Lines inside a string are not trimmed, so they do not count.
    if (kind === K_IN_STRING || kind === K_END_STRING) {
      continue;
    }
    if (cfg.styleEdition >= 2024 && (kind === K_IN_STRING_COMMENTED || kind === K_END_STRING_COMMENTED)) {
      continue;
    }
    if (pw >= 0 && (minPrefix < 0 || pw < minPrefix)) {
      minPrefix = pw;
    }
  }
  if (minPrefix < 0) {
    return null;
  }
  const out = new RsStrBuf();
  out.add(firstLine);
  out.add("\n");
  for (let i = 0; i < toI32(lines.length); i++) {
    if (i > 0) {
      out.add("\n");
    }
    // The three arrays grow together.
    if (i >= trimmed.length || i >= widths.length || i >= lines.length) {
      fault();
      return null;
    }
    const line = lines[i];
    if (!trimmed[i]) {
      out.add(line);
    } else if (widths[i] >= 0) {
      let extra = sub32(widths[i], minPrefix);
      if (extra < 0) {
        extra = 0;
      }
      const ind = rsIndentFromWidth(cfg, add32(add32(bi, al), extra));
      out.add(rsIndentStr(cfg, ind.bi, ind.al));
      out.add(line);
    }
  }
  return out.str();
};

// identify_comment at the default configuration.
const identifyComment = (orig: string, shape: RsShape, cfg: RsConfig, isDoc: boolean): string | null => {
  const style = rsCommentStyle(orig);
  let hasBareLines = false;
  let groupEnd = 0;
  const ls = rsLines(orig);
  if (style.isLineComment()) {
    let lineStart = "";
    if (style.k === CS_CUSTOM) {
      lineStart = rsTrimEnd(style.opener);
    } else {
      lineStart = rsTrimStart(style.prefix());
    }
    for (let i = 0; i < toI32(ls.length); i++) {
      const line = ls[i];
      const tl = rsTrimStart(line);
      if (tl.length === 0) {
        hasBareLines = true;
        break;
      } else if (tl.startsWith(lineStart) || rsCommentStyle(tl).eq(style)) {
        groupEnd = add32(groupEnd, computeLen(orig, groupEnd, line));
      } else {
        break;
      }
    }
  } else {
    const closer = "*/";
    let count = rsCountMatches(orig, closer);
    let first = true;
    for (let i = 0; i < toI32(ls.length); i++) {
      const line = ls[i];
      groupEnd = add32(groupEnd, computeLen(orig, groupEnd, line));
      let tl = rsTrimStart(line);
      if (!tl.startsWith("*") && !tl.startsWith("//") && !tl.startsWith("/*")) {
        hasBareLines = true;
      }
      if (first) {
        const op = rsTrimEnd(style.openerStr());
        tl = tl.substring(toI32(op.length) < toI32(tl.length) ? toI32(op.length) : toI32(tl.length), toI32(tl.length));
        first = false;
      }
      if (tl.endsWith(closer)) {
        count = sub32(count, 1);
        if (count === 0) {
          break;
        }
      }
    }
  }
  const ge = groupEnd > toI32(orig.length) ? toI32(orig.length) : groupEnd;
  const firstGroup = rsSliceStr(orig, 0, ge);
  const rest = rsSliceStr(orig, ge, toI32(orig.length));
  let rewritten = "";
  if (hasBareLines && style.isBlockComment()) {
    const r = rsTrimLeftPreserveLayout(firstGroup, shape.bi, shape.al, cfg);
    if (r === null) {
      return null;
    }
    rewritten = r;
  } else {
    rewritten = lightRewriteComment(firstGroup, shape.bi, shape.al, cfg, isDoc);
  }
  if (rest.length === 0) {
    return rewritten;
  }
  const restStr = identifyComment(rsTrimStart(rest), shape, cfg, isDoc);
  if (restStr === null) {
    return null;
  }
  return (
    rewritten +
    "\n" +
    (hasBareLines && style.isLineComment() ? "\n" : "") +
    rsIndentStr(cfg, shape.bi, shape.al) +
    restStr
  );
};

/** rewrite_comment(orig, block_style, shape, config). */
export const rsRewriteComment = (orig: string, shape: RsShape, cfg: RsConfig): string | null =>
  identifyComment(orig, shape, cfg, false);

/** rewrite_doc_comment. */
export const rsRewriteDocComment = (orig: string, shape: RsShape, cfg: RsConfig): string | null =>
  identifyComment(orig, shape, cfg, true);

/** rewrite_missing_comment over the text `snippet`. */
export const rsRewriteMissingComment = (snippet: string, shape: RsShape, cfg: RsConfig): string | null => {
  const t = rsTrim(snippet);
  if (t.length !== 0 && rsIndexOfByte(t, 47, 0) >= 0) {
    return rsRewriteComment(t, shape, cfg);
  }
  return "";
};

/** recover_missing_comment_in_span over the text `snippet`. */
export const rsRecoverMissingCommentInSpan = (
  snippet: string,
  shape: RsShape,
  cfg: RsConfig,
  usedWidth: i32,
): string | null => {
  const mc = rsRewriteMissingComment(snippet, shape, cfg);
  if (mc === null) {
    return null;
  }
  if (mc.length === 0) {
    return "";
  }
  const pos = rsIndexOfByte(snippet, 47, 0);
  if (pos < 0) {
    return null;
  }
  const total = add32(add32(toI32(mc.length), usedWidth), 1);
  const force = rsIndexOfByte(rsSliceStr(snippet, 0, pos), 10, 0) >= 0 || total > cfg.maxWidth;
  const sep = force ? rsIndentStrNl(cfg, shape.bi, shape.al) : " ";
  return sep + mc;
};

// ---- width helpers (utils.rs)

export const rsFirstLineWidth = (s: string): i32 => {
  const i = rsIndexOfByte(s, 10, 0);
  return rsWidthRange(s, 0, i < 0 ? toI32(s.length) : i);
};

export const rsLastLineWidth = (s: string, tabSpaces: i32): i32 => {
  const n = toI32(s.length);
  let i = n - 1;
  while (i >= 0 && i < n && s.charCodeAt(i) !== 10) {
    i--;
  }
  // The last line is `s[i + 1, n)`: its leading spaces and tabs, as
  // rsPrefixSpaceWidth and rsPrefixSpaceEnd count them, then the rest's width.
  let pe = i + 1;
  let pw = 0;
  while (pe >= 0 && pe < n) {
    const c = s.charCodeAt(pe);
    if (c === 32) {
      pw = add32(pw, 1);
    } else if (c === 9) {
      pw = add32(pw, tabSpaces);
    } else {
      break;
    }
    pe++;
  }
  return add32(pw, rsWidthRange(s, pe, n));
};

export const rsLastLineUsedWidth = (s: string, offset: i32, tabSpaces: i32): i32 => {
  if (rsIndexOfByte(s, 10, 0) >= 0) {
    return rsLastLineWidth(s, tabSpaces);
  }
  return add32(offset, rsWidth(s));
};

export const rsTrimmedLastLineWidth = (s: string): i32 => {
  let i = toI32(s.length) - 1;
  while (i >= 0 && s.charCodeAt(i) !== 10) {
    i--;
  }
  return rsWidth(rsTrim(i < 0 ? s : rsSliceStr(s, i + 1, toI32(s.length))));
};

export const rsIsSingleLine = (s: string): boolean => rsIndexOfByte(s, 10, 0) < 0;

/** filtered_str_fits. */
export const rsFilteredStrFits = (snippet0: string, maxWidth: i32, tabSpaces: i32, shape: RsShape): boolean => {
  const snippet = rsFilterNormalCode(snippet0);
  if (snippet.length === 0) {
    return true;
  }
  if (rsFirstLineWidth(snippet) > shape.width) {
    return false;
  }
  if (rsIsSingleLine(snippet)) {
    return true;
  }
  const ls = rsLines(snippet);
  for (let i = 1; i < toI32(ls.length); i++) {
    if (rsWidth(ls[i]) > maxWidth) {
      return false;
    }
  }
  if (rsLastLineWidth(snippet, tabSpaces) > add32(shape.usedWidth(), shape.width)) {
    return false;
  }
  return true;
};

/** wrap_str. */
export const rsWrapStr = (s: string, cfg: RsConfig, shape: RsShape): string | null =>
  rsFilteredStrFits(s, cfg.maxWidth, cfg.tabSpaces, shape) ? s : null;

// ---- comment recovery around rewrites (need the source)

/** combine_strs_with_missing_comments over the source span [lo, hi). */
export const rsCombineStrsWithMissingComments = (
  ctx: RsCtx,
  prev: string,
  next: string,
  lo: i32,
  hi: i32,
  shape: RsShape,
  allowExtend: boolean,
): string | null => {
  const cfg = ctx.cfg;
  let result = prev;
  let allowOneLine = rsIndexOfByte(prev, 10, 0) < 0 && rsIndexOfByte(next, 10, 0) < 0;
  const firstSep = prev.length === 0 || next.length === 0 || rsTrimmedLastLineWidth(prev) === 0 ? "" : " ";
  let oneLineWidth = add32(add32(rsLastLineWidth(prev, cfg.tabSpaces), rsFirstLineWidth(next)), toI32(firstSep.length));
  const snippet = ctx.snippet(lo, hi);
  const missing = rsRewriteMissingComment(snippet, shape, cfg);
  if (missing === null) {
    return null;
  }
  const indentNl = rsIndentStrNl(cfg, shape.bi, shape.al);
  if (missing.length === 0) {
    if (allowExtend && oneLineWidth <= shape.width) {
      result = result + firstSep;
    } else if (prev.length !== 0) {
      result = result + indentNl;
    }
    return result + next;
  }
  const pos = rsIndexOfByte(snippet, 47, 0);
  let preferSameLine = false;
  if (pos >= 0) {
    preferSameLine = rsIndexOfByte(rsSliceStr(snippet, 0, pos), 10, 0) < 0;
  } else {
    preferSameLine = rsIndexOfByte(snippet, 10, 0) < 0;
  }
  oneLineWidth = sub32(oneLineWidth, toI32(firstSep.length));
  let fs = "";
  if (prev.length === 0) {
    fs = "";
  } else {
    const olw = add32(add32(rsLastLineWidth(prev, cfg.tabSpaces), rsFirstLineWidth(missing)), 1);
    fs = preferSameLine && olw <= shape.width ? " " : indentNl;
  }
  result = result + fs + missing;
  let second = "";
  if (next.length === 0) {
    second = "";
  } else if (missing.startsWith("//")) {
    second = indentNl;
  } else {
    oneLineWidth = add32(oneLineWidth, add32(add32(toI32(missing.length), toI32(fs.length)), 1));
    allowOneLine = allowOneLine && !missing.startsWith("//") && rsIndexOfByte(missing, 10, 0) < 0;
    second = preferSameLine && allowOneLine && oneLineWidth <= shape.width ? " " : indentNl;
  }
  return result + second + next;
};

/** recover_comment_removed: the original snippet when `nw` lost a comment of it. */
export const rsRecoverCommentRemoved = (ctx: RsCtx, nw: string, lo: i32, hi: i32): string => {
  const snippet = ctx.snippet(lo, hi);
  if (snippet !== nw && rsChangedCommentContent(snippet, nw)) {
    // error_on_unformatted is on for a macro body: ErrorKind::LostComment.
    ctx.f.lostComment = true;
    return snippet;
  }
  return nw;
};
