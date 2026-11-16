// Formatting and tools for comments: rustfmt's comment.rs at the default
// configuration (normalize_comments, wrap_comments and
// format_code_in_doc_comments off, so comments are re-indented, not
// rewrapped), with its char classifier, line classes and comment/code slices.
//
// Ported from rustfmt 1.9.0 (MIT OR Apache-2.0, Copyright The Rust Project
// Developers): comment.rs, utils.rs.

import { growI32 } from "../core/arr";
import { RsCtx } from "./context";
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

export const rsKindIsComment = (k: i32): boolean => k >= K_START_COMMENT && k <= K_IN_STRING_COMMENTED;
export const rsKindInsideComment = (k: i32): boolean => k === K_IN_COMMENT || (k >= K_START_STRING_COMMENTED && k <= K_IN_STRING_COMMENTED);
export const rsKindIsString = (k: i32): boolean => k === K_IN_STRING || k === K_START_STRING;
export const rsKindIsCommentedString = (k: i32): boolean => k === K_IN_STRING_COMMENTED || k === K_START_STRING_COMMENTED;

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
    this.kinds = new Array<i32>(n + 1);
    this.starts = new Array<i32>(n + 1);
  }
}

const nextChar = (s: string, i: i32, n: i32): i32 => {
  let j = i + 1;
  while (j < n && (s.charCodeAt(j) & 0xc0) === 0x80) {
    j++;
  }
  return j;
};

const at8 = (src: u8[], i: i32): i32 => toI32(src[i]);

const next8 = (src: u8[], i: i32, n: i32): i32 => {
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

  /** The kind of the next char (its start in `cs`), or -1 at the end. */
  next(): i32 {
    if (this.i >= this.n) {
      return -1;
    }
    const src = this.src;
    const n = this.n;
    const i = this.i;
    if (this.st === S_NORMAL) {
      // Plain code: no state change.
      const c0 = toI32(src[i]);
      if (c0 < 128 && c0 !== 114 && c0 !== 34 && c0 !== 39 && c0 !== 47) {
        this.cs = i;
        this.i = i + 1;
        return K_NORMAL;
      }
    }
    let st = this.st;
    let arg = this.arg;
    const j = next8(src, i, n);
    const chr = toI32(src[i]);
    let kind = K_NORMAL;
    // The peeks: chars after this one.
    const p1 = j;
    const c1 = p1 < n ? at8(src, p1) : -1;
    let done = false;
    if (st === S_LIT_RAW_STRING) {
      kind = K_IN_STRING;
      if (chr === 34) {
        if (arg === 0) {
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
          // is_raw_string_prefix: '#'s then '"'.
          let q = next8(src, p1, n);
          let isRaw = false;
          while (q < n) {
            const cq = at8(src, q);
            if (cq === 35) {
              q = next8(src, q, n);
              continue;
            }
            isRaw = cq === 34;
            break;
          }
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
          const c2 = p2 < n ? at8(src, p2) : -1;
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
  const b = new Array<u8>(n + 1);
  for (let i = 0; i < n; i++) {
    b[i] = toU8(s.charCodeAt(i));
  }
  return b;
};

/** Runs CharClasses over `s`. */
export const rsCharClasses = (s: string): RsClasses => {
  const n = toI32(s.length);
  const r = new RsClasses(n);
  const sc = new RsCharScan(strToBytes(s), 0, n);
  for (;;) {
    const kind = sc.next();
    if (kind < 0) {
      break;
    }
    r.starts[r.nc] = sc.cs;
    r.nc = r.nc + 1;
    for (let k = sc.cs; k < sc.i; k++) {
      r.kinds[k] = kind;
    }
  }
  r.endNormal = sc.st === S_NORMAL;
  return r;
};

/** find_uncommented over the bytes `src[lo, hi)`: the offset from `lo`, or -1. Stops at the first match. */
export const rsFindUncommentedIn = (src: u8[], lo: i32, hi: i32, pat: string): i32 => {
  const m = toI32(pat.length);
  const sc = new RsCharScan(src, lo, hi);
  let ni = 0;
  for (;;) {
    const k = sc.next();
    if (k < 0) {
      break;
    }
    if (ni >= m) {
      return sc.cs - m - lo;
    }
    if ((k === K_NORMAL || k === K_IN_STRING) && toI32(src[sc.cs]) === pat.charCodeAt(ni)) {
      ni++;
    } else {
      ni = 0;
    }
  }
  if (ni < m) {
    return -1;
  }
  return hi - m - lo;
};

/** Whether `text` contains any comment. */
export const rsContainsComment = (text: string): boolean => {
  const n = toI32(text.length);
  // Fast path: no '/' means no comment.
  if (rsIndexOfByte(text, 47, 0) < 0) {
    return false;
  }
  const sc = new RsCharScan(strToBytes(text), 0, n);
  for (;;) {
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
    const next = rsFindLastUncommented(s.slice(result + 1, toI32(s.length)), pat);
    if (next < 0) {
      break;
    }
    result += next + 1;
  }
  return result;
};

/** find_comment_end: the offset of the first code char after the comments at the start, or -1. */
export const rsFindCommentEnd = (s: string): i32 => {
  const r = rsCharClasses(s);
  for (let ci = 0; ci < r.nc; ci++) {
    const i = r.starts[ci];
    const k = r.kinds[i];
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
  let ci = 0;
  while (ci < r.nc) {
    const lineStart = r.starts[ci];
    const startKind = r.kinds[lineStart];
    let kind = K_NORMAL;
    let lineEnd = n;
    let sawNl = false;
    while (ci < r.nc) {
      const i = r.starts[ci];
      const k = r.kinds[i];
      kind = k;
      ci++;
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
    if (e > lineStart && s.charCodeAt(e - 1) === 13) {
      e--;
    }
    out.lines.push(s.slice(lineStart, e));
    out.kinds = growI32(out.kinds, out.n + 1);
    out.kinds[out.n] = kind;
    out.n = out.n + 1;
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
    this.kind = growI32(this.kind, i + 1);
    this.start = growI32(this.start, i + 1);
    this.end = growI32(this.end, i + 1);
    this.kind[i] = k;
    this.start[i] = a;
    this.end[i] = b;
    this.n = i + 1;
  }
}

/** CommentCodeSlices: alternating code and comment slices; the first is code (maybe empty). */
export const rsCommentCodeSlices = (s: string): RsSlices => {
  const out = new RsSlices();
  const n = toI32(s.length);
  if (n > 0 && rsIndexOfByte(s, 47, 0) < 0) {
    // No comment: one code slice.
    out.add(CK_NORMAL, 0, n);
    return out;
  }
  const bytes = strToBytes(s);
  let lastKind = CK_COMMENT;
  let lastEnd = 0;
  while (lastEnd !== n) {
    let subEnd = lastEnd;
    let firstWs = -1; // relative to lastEnd
    const startsSlashSlash = n - lastEnd >= 2 && s.charCodeAt(lastEnd) === 47 && s.charCodeAt(lastEnd + 1) === 47;
    let broke = false;
    let brokeAtLast = false;
    const sc = new RsCharScan(bytes, lastEnd, n);
    for (;;) {
      const kind0 = sc.next();
      if (kind0 < 0) {
        break;
      }
      const i = sc.cs - lastEnd;
      const c = s.charCodeAt(sc.cs);
      const isConnector = lastKind === CK_NORMAL && startsSlashSlash && (c === 32 || c === 9);
      if (isConnector && firstWs < 0) {
        firstWs = i;
      }
      const ck = rsKindIsComment(kind0) ? CK_COMMENT : CK_NORMAL;
      if (ck === lastKind && !isConnector) {
        const li = firstWs >= 0 ? firstWs : i;
        subEnd = lastEnd + li;
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
      subEnd = firstWs >= 0 ? lastEnd + firstWs : n;
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
  const r = rsCharClasses(s);
  const n = toI32(s.length);
  let ci = 0;
  while (ci < r.nc) {
    const startIdx = r.starts[ci];
    const kind = r.kinds[startIdx];
    ci++;
    if (kind === K_NORMAL || kind === K_IN_STRING) {
      while (ci < r.nc && !rsKindIsComment(r.kinds[r.starts[ci]])) {
        ci++;
      }
    } else if (kind === K_START_COMMENT) {
      // `loop { match next() { Some(k) if inside_comment => continue, _ => break } }`: the
      // char that ends the loop is consumed too.
      for (;;) {
        if (ci >= r.nc) {
          break;
        }
        const k = r.kinds[r.starts[ci]];
        ci++;
        if (!rsKindInsideComment(k)) {
          break;
        }
      }
    } else {
      // rustfmt panics here; it cannot happen for well-formed input.
      ci++;
    }
    const end = ci < r.nc ? r.starts[ci] : n;
    out.add(rsKindIsComment(kind) ? CK_COMMENT : CK_NORMAL, startIdx, end);
  }
  return out;
};

const removeCommentHeader = (c: string): string => {
  const n = toI32(c.length);
  if (c.startsWith("///") || c.startsWith("//!")) {
    return c.slice(3, n);
  }
  if (c.startsWith("//")) {
    return c.slice(2, n);
  }
  if ((c.startsWith("/**") && !c.startsWith("/**/")) || c.startsWith("/*!")) {
    return n >= 5 ? c.slice(3, n - 2) : "";
  }
  return n >= 4 ? c.slice(2, n - 2) : "";
};

// The payload of a comment: CommentReducer's chars, appended to `out` as one string.
const commentPayload = (comment: string): string => {
  const isBlock = comment.startsWith("/*");
  const c = removeCommentHeader(comment);
  const n = toI32(c.length);
  let atStart = false;
  let out = "";
  let i = 0;
  const bytes = new Array<u8>(n);
  let nb = 0;
  while (i < n) {
    let w = rsWsLenAt(c, i);
    if (isBlock && atStart) {
      while (i < n && w > 0) {
        i += w;
        w = i < n ? rsWsLenAt(c, i) : 0;
      }
      if (i >= n) {
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
      for (let k = i; k < j; k++) {
        bytes[nb] = toU8(c.charCodeAt(k));
        nb++;
      }
      i = j;
    } else {
      i += w;
    }
  }
  out = String.fromBytes(bytes, 0, nb);
  return out;
};

const commentContent = (code: string): string => {
  const sl = rsUngroupedSlices(code);
  const out = new RsStrBuf();
  for (let i = 0; i < sl.n; i++) {
    if (sl.kind[i] === CK_COMMENT) {
      out.add(commentPayload(code.slice(sl.start[i], sl.end[i])));
    }
  }
  return out.str();
};

/** changed_comment_content. */
export const rsChangedCommentContent = (orig: string, nw: string): boolean => {
  // Without a '/' neither has a comment.
  if (rsIndexOfByte(orig, 47, 0) < 0 && rsIndexOfByte(nw, 47, 0) < 0) {
    return false;
  }
  return commentContent(orig) !== commentContent(nw);
};

/** filter_normal_code. */
export const rsFilterNormalCode = (code: string): string => {
  // Without a '/' (no comments) or a '\r' every line is kept as it is.
  if (rsIndexOfByte(code, 47, 0) < 0 && rsIndexOfByte(code, 13, 0) < 0) {
    return code;
  }
  const lc = rsLineClasses(code);
  const bb = new RsStrBuf();
  for (let i = 0; i < lc.n; i++) {
    const k = lc.kinds[i];
    if (k === K_NORMAL || k === K_START_STRING || k === K_IN_STRING || k === K_END_STRING) {
      bb.add(lc.lines[i]);
      bb.add("\n");
    }
  }
  let buf = bb.str();
  if (!code.endsWith("\n") && buf.endsWith("\n")) {
    buf = buf.slice(0, toI32(buf.length) - 1);
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
  if (ls.length === 0) {
    return "";
  }
  const first = ls[0];
  const sp = rsIndexOfByte(first, 32, 0);
  return sp < 0 ? first : first.slice(0, sp + 1);
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
  const rest = toI32(orig.length) - from;
  const ll = toI32(line.length);
  if (rest > ll) {
    return orig.charCodeAt(from + ll) === 13 ? ll + 2 : ll + 1;
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
  let out = "";
  for (let i = 0; i < toI32(ls.length); i++) {
    const l = ls[i];
    const fnw = rsTrimStartLen(l);
    let left = "";
    if (fnw < toI32(l.length)) {
      if (l.charCodeAt(fnw) === 42) {
        left = " " + l.slice(fnw, toI32(l.length));
      } else {
        left = l.slice(fnw, toI32(l.length));
      }
    }
    if (i > 0) {
      out = out + sep;
    }
    out = out + trimEndUnlessTwo(left, isDoc);
  }
  return out;
};

const rsTrimStartLen = (s: string): i32 => {
  const n = toI32(s.length);
  let i = 0;
  while (i < n) {
    const k = rsWsLenAt(s, i);
    if (k === 0) {
      break;
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
      w++;
    } else if (c === 9) {
      w += tabSpaces;
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
  const firstLine = rsTrimEnd(lc.lines[0]);
  const trimmed: boolean[] = [];
  const lines: string[] = [];
  const widths: i32[] = [];
  let veto = false;
  let minPrefix = -1;
  for (let i = 1; i < lc.n; i++) {
    const kind = lc.kinds[i];
    let line = lc.lines[i];
    let tr = true;
    let pw = -1;
    if (!rsIsBlank(line)) {
      pw = rsPrefixSpaceWidth(line, cfg.tabSpaces);
    }
    const newVeto = kind === K_IN_STRING && !line.endsWith("\\");
    if (veto || newVeto) {
      veto = newVeto;
      tr = false;
    } else {
      line = rsTrim(line);
    }
    trimmed.push(tr);
    lines.push(line);
    widths.push(pw);
    if (kind === K_IN_STRING || kind === K_END_STRING) {
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
    if (!trimmed[i]) {
      out.add(lines[i]);
    } else if (widths[i] >= 0) {
      let extra = widths[i] - minPrefix;
      if (extra < 0) {
        extra = 0;
      }
      const ind = rsIndentFromWidth(cfg, bi + al + extra);
      out.add(rsIndentStr(cfg, ind.bi, ind.al));
      out.add(lines[i]);
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
        groupEnd += computeLen(orig, groupEnd, line);
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
      groupEnd += computeLen(orig, groupEnd, line);
      let tl = rsTrimStart(line);
      if (!tl.startsWith("*") && !tl.startsWith("//") && !tl.startsWith("/*")) {
        hasBareLines = true;
      }
      if (first) {
        const op = rsTrimEnd(style.openerStr());
        tl = tl.slice(toI32(op.length) < toI32(tl.length) ? toI32(op.length) : toI32(tl.length), toI32(tl.length));
        first = false;
      }
      if (tl.endsWith(closer)) {
        count--;
        if (count === 0) {
          break;
        }
      }
    }
  }
  const ge = groupEnd > toI32(orig.length) ? toI32(orig.length) : groupEnd;
  const firstGroup = orig.slice(0, ge);
  const rest = orig.slice(ge, toI32(orig.length));
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
  return rewritten + "\n" + (hasBareLines && style.isLineComment() ? "\n" : "") + rsIndentStr(cfg, shape.bi, shape.al) + restStr;
};

/** rewrite_comment(orig, block_style, shape, config). */
export const rsRewriteComment = (orig: string, shape: RsShape, cfg: RsConfig): string | null =>
  identifyComment(rsTrimStart(orig), shape, cfg, false);

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
export const rsRecoverMissingCommentInSpan = (snippet: string, shape: RsShape, cfg: RsConfig, usedWidth: i32): string | null => {
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
  const total = toI32(mc.length) + usedWidth + 1;
  const force = rsIndexOfByte(snippet.slice(0, pos), 10, 0) >= 0 || total > cfg.maxWidth;
  const sep = force ? rsIndentStrNl(cfg, shape.bi, shape.al) : " ";
  return sep + mc;
};

// ---- width helpers (utils.rs)

export const rsFirstLineWidth = (s: string): i32 => {
  const i = rsIndexOfByte(s, 10, 0);
  return rsWidth(i < 0 ? s : s.slice(0, i));
};

export const rsLastLineWidth = (s: string, tabSpaces: i32): i32 => {
  let i = toI32(s.length) - 1;
  while (i >= 0 && s.charCodeAt(i) !== 10) {
    i--;
  }
  const last = i < 0 ? s : s.slice(i + 1, toI32(s.length));
  const pw = rsPrefixSpaceWidth(last, tabSpaces);
  const pe = rsPrefixSpaceEnd(last);
  return pw + rsWidth(pe === 0 ? last : last.slice(pe, toI32(last.length)));
};

export const rsLastLineUsedWidth = (s: string, offset: i32, tabSpaces: i32): i32 => {
  if (rsIndexOfByte(s, 10, 0) >= 0) {
    return rsLastLineWidth(s, tabSpaces);
  }
  return offset + rsWidth(s);
};

export const rsTrimmedLastLineWidth = (s: string): i32 => {
  let i = toI32(s.length) - 1;
  while (i >= 0 && s.charCodeAt(i) !== 10) {
    i--;
  }
  return rsWidth(rsTrim(i < 0 ? s : s.slice(i + 1, toI32(s.length))));
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
  if (rsLastLineWidth(snippet, tabSpaces) > shape.usedWidth() + shape.width) {
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
  let oneLineWidth = rsLastLineWidth(prev, cfg.tabSpaces) + rsFirstLineWidth(next) + toI32(firstSep.length);
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
    preferSameLine = rsIndexOfByte(snippet.slice(0, pos), 10, 0) < 0;
  } else {
    preferSameLine = rsIndexOfByte(snippet, 10, 0) < 0;
  }
  oneLineWidth -= toI32(firstSep.length);
  let fs = "";
  if (prev.length === 0) {
    fs = "";
  } else {
    const olw = rsLastLineWidth(prev, cfg.tabSpaces) + rsFirstLineWidth(missing) + 1;
    fs = preferSameLine && olw <= shape.width ? " " : indentNl;
  }
  result = result + fs + missing;
  let second = "";
  if (next.length === 0) {
    second = "";
  } else if (missing.startsWith("//")) {
    second = indentNl;
  } else {
    oneLineWidth += toI32(missing.length) + toI32(fs.length) + 1;
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
