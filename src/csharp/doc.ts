// CSharpier's Doc model, Prettier's printing algorithm as CSharpier has it:
// the Doc types, PropagateBreaks, DocFitter and DocPrinter.
//
// Ported from CSharpier 1.4.0 (MIT License, Copyright (c) 2021 Bela
// VanderVoort): DocTypes/*.cs, DocPrinter/*.cs, DocTypes/DocUtilities.cs.

import { add32, copyU8s, mul32, sub32 } from "../core/arr";
import { fault } from "../core/fault";
import { Out } from "../core/out";
import { csZeroI32s, csZeroU8s } from "./lexer";

// Doc kinds.
export const D_NULL: i32 = 0;
export const D_STRING: i32 = 1;
export const D_CONCAT: i32 = 2;
export const D_GROUP: i32 = 3;
export const D_CONDGROUP: i32 = 4;
export const D_INDENT: i32 = 5;
export const D_IFBREAK: i32 = 6;
export const D_LINE: i32 = 7; // a LineDoc: Normal
export const D_SOFTLINE: i32 = 8; // a LineDoc: Soft
export const D_HARDLINE: i32 = 9; // HardLine (and HardLineNoTrim)
export const D_LITERALLINE: i32 = 10;
export const D_TRIM: i32 = 11;
export const D_BREAKPARENT: i32 = 12;
export const D_LEADING_COMMENT: i32 = 13;
export const D_TRAILING_COMMENT: i32 = 14;
export const D_FORCEFLAT: i32 = 15;
export const D_REGION: i32 = 16;
export const D_ALWAYSFITS: i32 = 17;

// HardLine flags (in field b).
export const HL_SQUASH: i32 = 1;
export const HL_FOR_TRIVIA: i32 = 2;
export const HL_NO_TRIM: i32 = 4;

// Text flags (in field d of strings, comments and regions).
export const SF_SRC: i32 = 1; // the text is in the source, not the arena
export const SF_DIRECTIVE: i32 = 2;

// Comment types.
export const CT_SINGLE: i32 = 0;
export const CT_MULTI: i32 = 1;

// The singletons, at fixed indices.
export const DOC_NULL: i32 = 0;
export const DOC_BREAK_PARENT: i32 = 1;
export const DOC_HARDLINE: i32 = 2;
export const DOC_HARDLINE_NO_TRIM: i32 = 3;
export const DOC_HARDLINE_FOR_TRIVIA: i32 = 4;
export const DOC_HARDLINE_IF_NO_PREVIOUS_LINE: i32 = 5;
export const DOC_HARDLINE_IF_NO_PREVIOUS_LINE_FOR_TRIVIA: i32 = 6;
export const DOC_LITERAL_LINE: i32 = 7;
export const DOC_LINE: i32 = 8;
export const DOC_SOFTLINE: i32 = 9;
export const DOC_TRIM: i32 = 10;
export const DOC_SPACE: i32 = 11;
export const DOC_EMPTY: i32 = 12;

/** The group id CSharpier spells "" (string.Empty): one id, shared. */
export const GID_EMPTY: i32 = 0;

// Print modes.
const PM_FLAT: i32 = 0;
const PM_BREAK: i32 = 1;
const PM_FORCE_FLAT: i32 = 2;

const csIsWideChar = (c: i32): boolean =>
  c >= 0x1100 &&
  (c <= 0x115f ||
    c === 0x2329 ||
    c === 0x232a ||
    (c >= 0x2e80 && c <= 0xa4cf && c !== 0x303f) ||
    (c >= 0xac00 && c <= 0xd7a3) ||
    (c >= 0xf900 && c <= 0xfaff) ||
    (c >= 0xfe10 && c <= 0xfe19) ||
    (c >= 0xfe30 && c <= 0xfe6f) ||
    (c >= 0xff00 && c <= 0xff60) ||
    (c >= 0xffe0 && c <= 0xffe6));

/** The printed width of UTF-8 text the way CharacterSizeCalculator counts UTF-16 chars. */
export const csPrintedWidth = (s: u8[], a: i32, b: i32): i32 => {
  let w = 0;
  let i = a;
  while (i < b) {
    // a width past 10^9 needs a line no file holds
    if (i < 0 || i >= s.length || i > 2000000000 || w > 1000000000) {
      fault();
      return 0;
    }
    const c = toI32(s[i]);
    if (c < 0x80) {
      w++;
      i++;
      continue;
    }
    if (c < 0xc0) {
      i++;
      continue;
    }
    if (c < 0xe0) {
      w++;
      i += 2;
      continue;
    }
    if (c < 0xf0) {
      const i1 = i + 1;
      const i2 = i + 2;
      let c1 = 0;
      if (i1 < b) {
        if (i1 >= s.length) {
          fault();
          return 0;
        }
        c1 = (toI32(s[i1]) & 0x3f) << 6;
      }
      let c2 = 0;
      if (i2 < b) {
        if (i2 >= s.length) {
          fault();
          return 0;
        }
        c2 = toI32(s[i2]) & 0x3f;
      }
      const cp = ((c & 0x0f) << 12) | c1 | c2;
      if (csIsWideChar(cp)) {
        w += 2;
      } else {
        w += 1;
      }
      i += 3;
      continue;
    }
    // a surrogate pair: two chars of width one
    w += 2;
    i += 4;
  }
  return w;
};

/** The number of spaces and tabs ending s[a, b). */
const csTrailingWs = (s: u8[], a: i32, b: i32): i32 => {
  let e = b;
  while (e > a) {
    if (e <= 0 || e > s.length) {
      fault();
      return 0;
    }
    const c = toI32(s[e - 1]);
    if (c !== 32 && c !== 9) {
      break;
    }
    e--;
  }
  return sub32(b, e);
};

export class CsDocs {
  src: u8[];
  n: i32 = 0;
  kind: i32[];
  a: i32[];
  b: i32[];
  c: i32[];
  d: i32[];
  e: i32[];
  pool: i32[];
  np: i32 = 0;
  sb: u8[]; // the text of strings that are not in the source
  ns: i32 = 0;
  ngroup: i32 = 1; // group id 0 is CSharpier's "" id, shared by every group given it

  constructor(src: u8[], cap: i32) {
    this.src = src;
    // Capacities only: a column past its capacity is pushed to.
    let c = 64;
    if (cap > 64 && cap <= 100000000) {
      c = cap;
    }
    this.kind = csZeroI32s(c);
    this.a = csZeroI32s(c);
    this.b = csZeroI32s(c);
    this.c = csZeroI32s(c);
    this.d = csZeroI32s(c);
    this.e = csZeroI32s(c);
    this.pool = csZeroI32s(c + c / 6);
    this.sb = csZeroU8s(c / 4 + 64);
    this.add(D_NULL, 0, 0, 0, 0);
    this.add(D_BREAKPARENT, 0, 0, 0, 0);
    this.add(D_HARDLINE, 0, 0, 0, 0);
    this.add(D_HARDLINE, 0, HL_NO_TRIM, 0, 0);
    this.add(D_HARDLINE, 0, HL_FOR_TRIVIA, 0, 0);
    this.add(D_HARDLINE, 0, HL_SQUASH, 0, 0);
    this.add(D_HARDLINE, 0, HL_SQUASH | HL_FOR_TRIVIA, 0, 0);
    this.add(D_LITERALLINE, 0, 0, 0, 0);
    this.add(D_LINE, 0, 0, 0, 0);
    this.add(D_SOFTLINE, 0, 0, 0, 0);
    this.add(D_TRIM, 0, 0, 0, 0);
    this.strArena(" ");
    this.strArena("");
  }

  add(k: i32, a: i32, b: i32, c: i32, d: i32): i32 {
    const i = this.n;
    const kind = this.kind;
    const fa = this.a;
    const fb = this.b;
    const fc = this.c;
    const fd = this.d;
    const fe = this.e;
    if (i < 0 || i > 1000000000) {
      fault();
      return DOC_NULL;
    }
    if (i < kind.length && i < fa.length && i < fb.length && i < fc.length && i < fd.length && i < fe.length) {
      kind[i] = k;
      fa[i] = a;
      fb[i] = b;
      fc[i] = c;
      fd[i] = d;
      fe[i] = 0;
    } else if (i === kind.length) {
      // the columns are written together, so all end here
      kind.push(k);
      fa.push(a);
      fb.push(b);
      fc.push(c);
      fd.push(d);
      fe.push(0);
    } else {
      fault();
      return DOC_NULL;
    }
    this.n = i + 1;
    return i;
  }

  // ---- fields ----
  // A doc that is no doc reads as 0 (a Null doc) after a fault.

  kindOf(d: i32): i32 {
    const xs = this.kind;
    if (d >= 0 && d < xs.length) {
      return xs[d];
    }
    fault();
    return 0;
  }

  aOf(d: i32): i32 {
    const xs = this.a;
    if (d >= 0 && d < xs.length) {
      return xs[d];
    }
    fault();
    return 0;
  }

  bOf(d: i32): i32 {
    const xs = this.b;
    if (d >= 0 && d < xs.length) {
      return xs[d];
    }
    fault();
    return 0;
  }

  cOf(d: i32): i32 {
    const xs = this.c;
    if (d >= 0 && d < xs.length) {
      return xs[d];
    }
    fault();
    return 0;
  }

  dOf(d: i32): i32 {
    const xs = this.d;
    if (d >= 0 && d < xs.length) {
      return xs[d];
    }
    fault();
    return 0;
  }

  eOf(d: i32): i32 {
    const xs = this.e;
    if (d >= 0 && d < xs.length) {
      return xs[d];
    }
    fault();
    return 0;
  }

  setA(d: i32, v: i32): void {
    const xs = this.a;
    if (d >= 0 && d < xs.length) {
      xs[d] = v;
    } else {
      fault();
    }
  }

  setB(d: i32, v: i32): void {
    const xs = this.b;
    if (d >= 0 && d < xs.length) {
      xs[d] = v;
    } else {
      fault();
    }
  }

  setD(d: i32, v: i32): void {
    const xs = this.d;
    if (d >= 0 && d < xs.length) {
      xs[d] = v;
    } else {
      fault();
    }
  }

  setE(d: i32, v: i32): void {
    const xs = this.e;
    if (d >= 0 && d < xs.length) {
      xs[d] = v;
    } else {
      fault();
    }
  }

  // ---- text ----

  /** A StringDoc over src[a, b). */
  strSrc(a: i32, b: i32): i32 {
    const d = this.add(D_STRING, a, b, csPrintedWidth(this.src, a, b), SF_SRC);
    this.setE(d, csTrailingWs(this.src, a, b));
    return d;
  }

  /** A StringDoc over `s`, put in the arena. */
  strArena(s: string): i32 {
    const a = this.appendStr(s);
    const d = this.add(D_STRING, a, this.ns, csPrintedWidth(this.sb, a, this.ns), 0);
    this.setE(d, csTrailingWs(this.sb, a, this.ns));
    return d;
  }

  /** A StringDoc for a constant: the singletons for " " and "". */
  str(s: string): i32 {
    if (s === " ") {
      return DOC_SPACE;
    }
    if (s === "") {
      return DOC_EMPTY;
    }
    return this.strArena(s);
  }

  /** A StringDoc over arena[a, b) (text appended with appendStr / appendBytes). */
  strAt(a: i32, b: i32, directive: boolean): i32 {
    const d = this.add(D_STRING, a, b, csPrintedWidth(this.sb, a, b), directive ? SF_DIRECTIVE : 0);
    this.setE(d, csTrailingWs(this.sb, a, b));
    return d;
  }

  appendStr(s: string): i32 {
    const a = this.ns;
    this.reserveSb(toI32(s.length));
    const sb = this.sb;
    let p = a;
    for (let i = 0; i < s.length; i++) {
      if (p < 0 || p >= sb.length) {
        fault();
        return a;
      }
      sb[p] = toU8(s.charCodeAt(i));
      p = p + 1;
    }
    this.ns = p;
    return a;
  }

  appendBytes(buf: u8[], a: i32, b: i32): i32 {
    const o = this.ns;
    if (b === a) {
      return o;
    }
    if (a < 0 || b < a || b > buf.length || o < 0 || o > 1000000000) {
      fault();
      return o;
    }
    // b >= a >= 0, so the u32 difference is exact
    const k = toI32(toU32(b) - toU32(a));
    if (k > 1000000000) {
      fault();
      return o;
    }
    this.reserveSb(k);
    copyU8s(this.sb, o, buf, a, k);
    this.ns = o + k;
    return o;
  }

  appendByte(c: i32): void {
    this.reserveSb(1);
    const sb = this.sb;
    const ns = this.ns;
    if (ns >= 0 && ns < sb.length) {
      sb[ns] = toU8(c);
      this.ns = ns + 1;
    } else {
      fault();
    }
  }

  /** Makes room for k more bytes after ns; the arena never nears 10^9 bytes. */
  reserveSb(k: i32): void {
    const ns = this.ns;
    const sb = this.sb;
    if (ns < 0 || k < 0 || ns > 1000000000 || k > 1000000000) {
      fault();
      return;
    }
    const need = ns + k;
    const len = toI32(sb.length);
    if (need > len) {
      let cap = need + 64;
      if (len <= 1000000000 && len * 2 >= need) {
        cap = len * 2;
      }
      const nb = csZeroU8s(cap);
      copyU8s(nb, 0, sb, 0, ns);
      this.sb = nb;
    }
  }

  textLen(d: i32): i32 {
    return sub32(this.bOf(d), this.aOf(d));
  }

  /** Byte i of the text of doc d (a string, comment or region). */
  textAt(d: i32, i: i32): i32 {
    const a = this.aOf(d);
    const buf = (this.dOf(d) & SF_SRC) !== 0 ? this.src : this.sb;
    if (a >= 0 && i >= 0) {
      // both non-negative i32s, so the u32 sum is exact
      const k = toI32(toU32(a) + toU32(i));
      if (k >= 0 && k < buf.length) {
        return toI32(buf[k]);
      }
    }
    fault();
    return -1;
  }

  textIs(d: i32, s: string): boolean {
    const n = this.textLen(d);
    if (n !== toI32(s.length)) {
      return false;
    }
    for (let i = 0; i < n && i < s.length; i++) {
      if (this.textAt(d, i) !== s.charCodeAt(i)) {
        return false;
      }
    }
    return true;
  }

  // ---- constructors ----

  /** Doc.Concat: Null for none, the doc itself for one. */
  concat(docs: i32[]): i32 {
    const n = toI32(docs.length);
    if (n === 0) {
      return DOC_NULL;
    }
    if (n === 1 && docs.length > 0) {
      return docs[0];
    }
    return this.concatList(docs);
  }

  /** Appends docs to the pool; answers their offset, or -1 after a fault. */
  poolAppend(docs: i32[]): i32 {
    const n = toI32(docs.length);
    const off = this.np;
    if (off < 0 || off > 1000000000 || n > 1000000000) {
      fault();
      return -1;
    }
    const pool = this.pool;
    let p = off;
    for (let i = 0; i < docs.length; i++) {
      const v = docs[i];
      if (p >= 0 && p < pool.length) {
        pool[p] = v;
        p = p + 1;
      } else if (p === pool.length && p < 2000000000) {
        pool.push(v);
        p = p + 1;
      } else {
        fault();
        return -1;
      }
    }
    this.np = p;
    return off;
  }

  /** new Concat(list) (always a Concat). */
  concatList(docs: i32[]): i32 {
    const off = this.poolAppend(docs);
    return this.add(D_CONCAT, off, toI32(docs.length), 0, 0);
  }

  /** Doc.Group(params): one element is the contents itself. */
  group(docs: i32[]): i32 {
    return this.add(D_GROUP, this.concat(docs), 0, -1, 0);
  }

  group1(contents: i32): i32 {
    return this.add(D_GROUP, contents, 0, -1, 0);
  }

  groupWithId(id: i32, docs: i32[]): i32 {
    return this.add(D_GROUP, this.concat(docs), 0, id, 0);
  }

  newGroupId(): i32 {
    const id = this.ngroup;
    if (id < 0 || id > 1000000000) {
      fault();
      return 0;
    }
    this.ngroup = id + 1;
    return id;
  }

  indent(docs: i32[]): i32 {
    return this.add(D_INDENT, this.concat(docs), 0, 0, 0);
  }

  indent1(contents: i32): i32 {
    return this.add(D_INDENT, contents, 0, 0, 0);
  }

  indentIf(cond: boolean, contents: i32): i32 {
    return cond ? this.indent1(contents) : contents;
  }

  ifBreak(breakContents: i32, flatContents: i32, groupId: i32): i32 {
    return this.add(D_IFBREAK, breakContents, flatContents, groupId, 0);
  }

  indentIfBreak(contents: i32, groupId: i32): i32 {
    return this.add(D_IFBREAK, this.indent1(contents), contents, groupId, 0);
  }

  forceFlat(docs: i32[]): i32 {
    return this.add(D_FORCEFLAT, this.concat(docs), 0, 0, 0);
  }

  alwaysFits(contents: i32): i32 {
    return this.add(D_ALWAYSFITS, contents, 0, 0, 0);
  }

  conditionalGroup(options: i32[]): i32 {
    let first = DOC_NULL;
    if (options.length > 0) {
      first = options[0];
    } else {
      fault();
      return DOC_NULL;
    }
    const off = this.poolAppend(options);
    const g = this.add(D_CONDGROUP, first, 0, -1, off);
    this.setE(g, toI32(options.length));
    return g;
  }

  /** A comment over arena[a, b). */
  comment(kind: i32, a: i32, b: i32, type: i32): i32 {
    return this.add(kind, a, b, type, 0);
  }

  region(a: i32, b: i32, isEnd: boolean): i32 {
    return this.add(D_REGION, a, b, isEnd ? 1 : 0, 0);
  }

  // ---- reading ----

  /** Pool entry off + i; a Null doc after a fault when there is none. */
  poolAt(off: i32, i: i32): i32 {
    const pool = this.pool;
    if (off >= 0 && i >= 0) {
      // both non-negative i32s, so the u32 sum is exact
      const k = toI32(toU32(off) + toU32(i));
      if (k >= 0 && k < pool.length) {
        return pool[k];
      }
    }
    fault();
    return DOC_NULL;
  }

  /** Child i of a Concat. */
  at(d: i32, i: i32): i32 {
    return this.poolAt(this.aOf(d), i);
  }

  count(d: i32): i32 {
    return this.bOf(d);
  }

  setAt(d: i32, i: i32, v: i32): void {
    const off = this.aOf(d);
    const pool = this.pool;
    if (off >= 0 && i >= 0) {
      // both non-negative i32s, so the u32 sum is exact
      const k = toI32(toU32(off) + toU32(i));
      if (k >= 0 && k < pool.length) {
        pool[k] = v;
        return;
      }
    }
    fault();
  }

  isHardLine(d: i32): boolean {
    return this.kindOf(d) === D_HARDLINE;
  }
}

// ---- DocUtilities ----

export const csdContainsBreak = (D: CsDocs, d: i32): boolean => {
  const k = D.kindOf(d);
  if (k === D_GROUP || k === D_CONDGROUP) {
    if (D.bOf(d) !== 0) {
      return true;
    }
  } else if (k === D_HARDLINE || k === D_LITERALLINE || k === D_BREAKPARENT) {
    return true;
  }
  switch (k) {
    case D_GROUP:
    case D_CONDGROUP:
    case D_INDENT:
    case D_FORCEFLAT:
      return csdContainsBreak(D, D.aOf(d));
    case D_CONCAT: {
      const n = D.bOf(d);
      const off = D.aOf(d);
      for (let i = 0; i < n; i++) {
        if (csdContainsBreak(D, D.poolAt(off, i))) {
          return true;
        }
      }
      return false;
    }
    case D_IFBREAK:
      return csdContainsBreak(D, D.bOf(d));
    default:
      return false;
  }
};

/** RemoveInitialDoubleHardLine over a list of docs (as a Concat's contents or a List). */
export const csdRemoveInitialDoubleHardLineList = (D: CsDocs, docs: i32[]): void => {
  const st = new CsRemoveState();
  csdRemoveList(D, docs, st);
};

class CsRemoveState {
  removeNext: boolean = false;
  constructor() {}
}

const csdRemoveList = (D: CsDocs, docs: i32[], st: CsRemoveState): void => {
  for (let x = 0; x < docs.length; x++) {
    const doc = docs[x];
    if (D.kindOf(doc) === D_HARDLINE) {
      if (st.removeNext) {
        docs[x] = DOC_NULL;
        return;
      }
      st.removeNext = true;
    } else {
      csdRemoveDoc(D, doc, st);
      return;
    }
  }
};

const csdRemoveConcat = (D: CsDocs, c: i32, st: CsRemoveState): void => {
  const n = D.bOf(c);
  for (let x = 0; x < n; x++) {
    const doc = D.at(c, x);
    if (D.kindOf(doc) === D_HARDLINE) {
      if (st.removeNext) {
        D.setAt(c, x, DOC_NULL);
        return;
      }
      st.removeNext = true;
    } else {
      csdRemoveDoc(D, doc, st);
      return;
    }
  }
};

export const csdRemoveInitialDoubleHardLine = (D: CsDocs, doc: i32): i32 => {
  const st = new CsRemoveState();
  csdRemoveDoc(D, doc, st);
  return doc;
};

const csdRemoveDoc = (D: CsDocs, doc: i32, st: CsRemoveState): void => {
  switch (D.kindOf(doc)) {
    case D_STRING:
      return;
    case D_INDENT:
    case D_GROUP:
    case D_CONDGROUP: {
      const c = D.aOf(doc);
      if (D.kindOf(c) === D_HARDLINE) {
        if (st.removeNext) {
          D.setA(doc, DOC_NULL);
          return;
        }
        st.removeNext = true;
        return;
      }
      csdRemoveDoc(D, c, st);
      return;
    }
    case D_CONCAT:
      csdRemoveConcat(D, doc, st);
      return;
    default:
      return;
  }
};

// ---- PropagateBreaks ----

export const csdPropagateBreaks = (D: CsDocs, root: i32): void => {
  const visited = csZeroU8s(D.n);
  const groupStack: i32[] = [];
  let forceFlat = 0;
  let canSkipBreak = false;
  let stringCount = 0;
  let stringCountAtLastHardLine = 0;
  const MARKER = -1;
  const stack: i32[] = [root];
  while (stack.length > 0) {
    const sl = toI32(stack.length);
    if (sl <= 0) {
      break;
    }
    const doc = stack[sl - 1];
    if (doc === MARKER) {
      stack.pop();
      let ex = 0;
      if (stack.length > 0) {
        ex = stack.pop();
      } else {
        fault();
        return;
      }
      // OnExit
      if (D.kindOf(ex) === D_FORCEFLAT) {
        forceFlat = sub32(forceFlat, 1);
      } else {
        canSkipBreak = false;
        let g = 0;
        if (groupStack.length > 0) {
          g = groupStack.pop();
        } else {
          fault();
          return;
        }
        if (D.bOf(g) !== 0) {
          csdBreakParentGroup(D, groupStack);
        }
      }
      continue;
    }
    const k = D.kindOf(doc);
    // OnEnter
    let enter = true;
    if (k === D_STRING && (D.dOf(doc) & SF_DIRECTIVE) === 0) {
      canSkipBreak = false;
      if (D.bOf(doc) > D.aOf(doc)) {
        stringCount = add32(stringCount, 1);
      }
    } else if (k === D_GROUP || k === D_CONDGROUP) {
      canSkipBreak = true;
      groupStack.push(doc);
      if (doc < 0 || doc >= visited.length) {
        fault();
        return;
      }
      if (visited[doc] !== 0) {
        enter = false;
      }
      visited[doc] = 1;
    } else if (
      (k === D_HARDLINE || k === D_LITERALLINE || k === D_BREAKPARENT) &&
      (forceFlat === 0 || k === D_LITERALLINE)
    ) {
      const isAtStartOfLine = stringCount === stringCountAtLastHardLine;
      if (k === D_HARDLINE && (D.bOf(doc) & HL_FOR_TRIVIA) !== 0 && (isAtStartOfLine || canSkipBreak)) {
        const gs = toI32(groupStack.length);
        if (!isAtStartOfLine && gs > 1) {
          D.setB(groupStack[gs - 2], 1);
        }
      } else {
        csdBreakParentGroup(D, groupStack);
      }
      if (k === D_HARDLINE) {
        stringCountAtLastHardLine = stringCount;
      }
    } else if (k === D_FORCEFLAT) {
      forceFlat = add32(forceFlat, 1);
    }
    if (!enter) {
      // OnExit for the group
      if (stack.length > 0) {
        stack.pop();
      }
      canSkipBreak = false;
      let g = 0;
      if (groupStack.length > 0) {
        g = groupStack.pop();
      } else {
        fault();
        return;
      }
      if (D.bOf(g) !== 0) {
        csdBreakParentGroup(D, groupStack);
      }
      continue;
    }
    if (k === D_FORCEFLAT || k === D_GROUP || k === D_CONDGROUP) {
      stack.push(MARKER);
    } else if (stack.length > 0) {
      stack.pop();
    }
    if (k === D_CONCAT) {
      const off = D.aOf(doc);
      let x = D.bOf(doc);
      while (x > 0) {
        x = x - 1;
        let ch = D.poolAt(off, x);
        if (forceFlat > 0) {
          const ck = D.kindOf(ch);
          if (ck === D_LINE || ck === D_SOFTLINE || ck === D_HARDLINE) {
            ch = ck === D_SOFTLINE ? DOC_EMPTY : DOC_SPACE;
            D.setAt(doc, x, ch);
          }
        }
        stack.push(ch);
      }
    } else if (k === D_IFBREAK) {
      stack.push(D.bOf(doc));
      stack.push(D.aOf(doc));
    } else if (k === D_CONDGROUP) {
      const off = D.dOf(doc);
      const n = D.eOf(doc);
      for (let i = 0; i < n; i++) {
        stack.push(D.poolAt(off, i));
      }
    } else if (k === D_GROUP || k === D_INDENT || k === D_FORCEFLAT) {
      stack.push(D.aOf(doc));
    }
  }
};

const csdBreakParentGroup = (D: CsDocs, groupStack: i32[]): void => {
  const n = toI32(groupStack.length);
  if (n > 0) {
    const g = groupStack[n - 1];
    if (D.kindOf(g) !== D_CONDGROUP) {
      D.setB(g, 1);
    }
  }
};

// ---- DocPrinter ----

export class CsPrinter {
  D: CsDocs;
  out: Out;
  width: i32;
  indentSize: i32;
  useTabs: boolean;
  eolCr: boolean; // the end of line is \r\n
  // the command stack
  cMI: i32[]; // indent << 2 | mode
  cDoc: i32[];
  nc: i32 = 0;
  // the fitter's scratch stack
  sMI: i32[];
  sDoc: i32[];
  groupMode: i32[];
  currentWidth: i32 = 0;
  shouldRemeasure: boolean = false;
  newLineNextStringValue: boolean = false;
  skipNextNewLine: boolean = false;
  regionIndents: i32[];

  constructor(D: CsDocs, out: Out, width: i32, indentSize: i32, useTabs: boolean, eolCr: boolean) {
    this.D = D;
    this.out = out;
    this.width = width;
    this.indentSize = indentSize;
    this.useTabs = useTabs;
    this.eolCr = eolCr;
    this.cMI = new Array<i32>(256);
    this.cDoc = new Array<i32>(256);
    this.sMI = new Array<i32>(256);
    this.sDoc = new Array<i32>(256);
    const groupMode: i32[] = [];
    const ng = D.ngroup;
    if (ng >= 0 && ng <= 1000000000) {
      for (let i = 0; i <= ng; i++) {
        groupMode.push(-1);
      }
    } else {
      fault();
    }
    this.groupMode = groupMode;
    this.regionIndents = [];
  }

  /** Gives up on the file and empties the command stack, which ends the print loop. */
  stop(): void {
    fault();
    this.nc = 0;
  }

  push(doc: i32, mode: i32, ind: i32): void {
    const i = this.nc;
    const cMI = this.cMI;
    const cDoc = this.cDoc;
    if (i >= 0 && i < cMI.length && i < cDoc.length) {
      cMI[i] = (ind << 2) | mode;
      cDoc[i] = doc;
      this.nc = i + 1;
      return;
    }
    this.pushPast(doc, mode, ind);
  }

  /** push past the end of the command stack's columns. */
  pushPast(doc: i32, mode: i32, ind: i32): void {
    const i = this.nc;
    const cMI = this.cMI;
    const cDoc = this.cDoc;
    if (i === cDoc.length && i === cMI.length && i < 2000000000) {
      cMI.push((ind << 2) | mode);
      cDoc.push(doc);
      this.nc = i + 1;
    } else {
      this.stop();
    }
  }

  indentLength(ind: i32): i32 {
    return mul32(ind, this.indentSize);
  }

  appendIndent(ind: i32): void {
    if (this.useTabs) {
      for (let i = 0; i < ind; i++) {
        this.out.byte(9);
      }
    } else {
      this.out.spaces(mul32(ind, this.indentSize));
    }
  }

  appendEol(): void {
    if (this.eolCr) {
      this.out.byte(13);
    }
    this.out.byte(10);
  }

  print(root: i32): void {
    csdPropagateBreaks(this.D, root);
    this.push(root, PM_BREAK, 0);
    while (this.nc > 0) {
      this.processNext();
    }
    // EnsureOutputEndsWithSingleNewLine
    const out = this.out;
    const buf = out.buf;
    let n = out.n;
    if (n > buf.length) {
      fault();
      return;
    }
    while (n > 0 && n <= buf.length && (toI32(buf[n - 1]) === 10 || toI32(buf[n - 1]) === 13)) {
      n = n - 1;
    }
    out.n = n;
    this.appendEol();
    // TrimStart('\n', '\r')
    const b2 = out.buf;
    const n2 = out.n;
    if (n2 < 0 || n2 > b2.length) {
      fault();
      return;
    }
    let s = 0;
    while (s < n2 && s < b2.length && (toI32(b2[s]) === 10 || toI32(b2[s]) === 13)) {
      s++;
    }
    if (s > 0) {
      let d = 0;
      for (let i = s; i < n2 && i < b2.length; i++) {
        if (d < 0 || d >= b2.length) {
          fault();
          return;
        }
        b2[d] = b2[i];
        d = d + 1;
      }
      out.n = d;
    }
  }

  trimTrailingWhitespace(): i32 {
    const out = this.out;
    const buf = out.buf;
    const n0 = out.n;
    if (n0 > buf.length) {
      fault();
      return 0;
    }
    let n = n0;
    while (n > 0 && n <= buf.length) {
      const c = toI32(buf[n - 1]);
      if (c !== 32 && c !== 9) {
        break;
      }
      n = n - 1;
    }
    out.n = n;
    return sub32(n0, n);
  }

  endsWithNewLineAndWhitespace(): boolean {
    const out = this.out;
    const buf = out.buf;
    let i = out.n;
    while (i > 0) {
      i = i - 1;
      if (i >= buf.length) {
        fault();
        return false;
      }
      const c = toI32(buf[i]);
      if (c === 32 || c === 9) {
        continue;
      }
      return c === 10;
    }
    return false;
  }

  /** Whether the output is not empty and its last byte is not a line feed. */
  outEndsMidLine(): boolean {
    const out = this.out;
    const buf = out.buf;
    const n = out.n;
    if (n === 0) {
      return false;
    }
    if (n > 0 && n <= buf.length) {
      return toI32(buf[n - 1]) !== 10;
    }
    fault();
    return false;
  }

  appendText(d: i32): void {
    const D = this.D;
    // a + textLen is b
    if ((D.dOf(d) & SF_SRC) !== 0) {
      this.out.range(D.src, D.aOf(d), D.bOf(d));
    } else {
      this.out.range(D.sb, D.aOf(d), D.bOf(d));
    }
  }

  processNext(): void {
    const nc = this.nc;
    const cMI = this.cMI;
    const cDoc = this.cDoc;
    if (nc <= 0 || nc > cMI.length || nc > cDoc.length) {
      this.stop();
      return;
    }
    const top = nc - 1;
    this.nc = top;
    const mi = cMI[top];
    const ind = mi >> 2;
    const mode = mi & 3;
    const doc = cDoc[top];
    const D = this.D;
    const k = D.kindOf(doc);
    switch (k) {
      case D_NULL:
        return;
      case D_STRING:
        this.processString(doc, ind);
        return;
      case D_CONCAT: {
        // push's fast path, inline: the children, last first
        const off = D.aOf(doc);
        const mi2 = (ind << 2) | mode;
        let x = D.bOf(doc);
        while (x > 0) {
          x = x - 1;
          const ch = D.poolAt(off, x);
          const i = this.nc;
          const cm = this.cMI;
          const cd = this.cDoc;
          if (i >= 0 && i < cm.length && i < cd.length) {
            cm[i] = mi2;
            cd[i] = ch;
            this.nc = i + 1;
          } else {
            this.pushPast(ch, mode, ind);
          }
        }
        return;
      }
      case D_LINE:
      case D_SOFTLINE:
      case D_HARDLINE:
      case D_LITERALLINE:
        this.processLine(doc, mode, ind);
        return;
      case D_GROUP:
      case D_CONDGROUP:
        this.processGroup(doc, mode, ind);
        return;
      case D_INDENT:
        this.push(D.aOf(doc), mode, ind + 1);
        return;
      case D_TRIM:
        this.currentWidth = sub32(this.currentWidth, this.trimTrailingWhitespace());
        this.newLineNextStringValue = false;
        return;
      case D_IFBREAK: {
        let gm = mode;
        const id = D.cOf(doc);
        if (id >= 0) {
          const groupMode = this.groupMode;
          if (id >= groupMode.length) {
            this.stop();
            return;
          }
          gm = groupMode[id];
          if (gm < 0) {
            // an ifBreak before the group it targets
            this.stop();
            return;
          }
        }
        this.push(gm === PM_BREAK ? D.aOf(doc) : D.bOf(doc), mode, ind);
        return;
      }
      case D_BREAKPARENT:
        return;
      case D_LEADING_COMMENT: {
        this.trimTrailingWhitespace();
        if (this.outEndsMidLine() || this.newLineNextStringValue) {
          this.appendEol();
        }
        this.appendComment(doc, ind);
        this.currentWidth = this.indentLength(ind);
        this.newLineNextStringValue = false;
        this.skipNextNewLine = false;
        return;
      }
      case D_TRAILING_COMMENT:
        this.trimTrailingWhitespace();
        this.out.byte(32);
        this.appendText(doc);
        this.currentWidth = this.indentLength(ind);
        if (mode !== PM_FORCE_FLAT) {
          this.newLineNextStringValue = true;
          this.skipNextNewLine = true;
        }
        return;
      case D_FORCEFLAT:
        this.push(D.aOf(doc), PM_FORCE_FLAT, ind);
        return;
      case D_REGION:
        if (D.cOf(doc) !== 0) {
          const regionIndents = this.regionIndents;
          if (regionIndents.length > 0) {
            this.appendIndent(regionIndents.pop());
          } else {
            this.appendIndent(ind);
          }
        } else {
          this.appendIndent(ind);
          this.regionIndents.push(ind);
        }
        this.appendText(doc);
        return;
      case D_ALWAYSFITS:
        this.push(D.aOf(doc), mode, ind);
        return;
      default:
        // an unknown doc
        this.stop();
    }
  }

  /** CalculateCurrentLeadingIndentation of D's text [a, b). */
  leadingIndentation(buf: u8[], a: i32, b: i32): i32 {
    let r = 0;
    for (let i = a; i < b; i++) {
      if (i < 0 || i >= buf.length) {
        fault();
        return 0;
      }
      const c = toI32(buf[i]);
      if (c === 32) {
        r = add32(r, 1);
      } else if (c === 9) {
        r = add32(r, this.indentSize);
      } else {
        break;
      }
    }
    return r;
  }

  appendComment(doc: i32, ind: i32): void {
    const D = this.D;
    const buf = (D.dOf(doc) & SF_SRC) !== 0 ? D.src : D.sb;
    const a = D.aOf(doc);
    const b = D.bOf(doc);
    const isMulti = D.cOf(doc) === CT_MULTI;
    // StringReader.ReadLine: lines split on \r\n, \r, \n
    let pos = a;
    let first = true;
    let delta = 0;
    while (pos <= b) {
      if (pos === b && !first) {
        return;
      }
      let e = pos;
      while (e < b) {
        if (e < 0 || e >= buf.length) {
          fault();
          return;
        }
        const c = toI32(buf[e]);
        if (c === 10 || c === 13) {
          break;
        }
        e++;
      }
      if (pos === b && first) {
        // an empty comment has no line
        return;
      }
      if (first && isMulti) {
        delta = sub32(this.indentLength(ind), this.leadingIndentation(buf, pos, e));
      }
      first = false;
      if (!isMulti) {
        this.appendIndent(ind);
      } else {
        let spaces = add32(this.leadingIndentation(buf, pos, e), delta);
        if (this.useTabs) {
          const il = this.indentLength(ind);
          if (spaces >= il) {
            this.appendIndent(ind);
            spaces = sub32(spaces, il);
          }
          while (spaces > 0 && spaces >= this.indentSize) {
            this.out.byte(9);
            spaces = sub32(spaces, this.indentSize);
          }
        }
        if (spaces > 0) {
          this.out.spaces(spaces);
        }
      }
      // line.Trim()
      let ta = pos;
      let tb = e;
      // csTrimLen and csTrimLenEnd answer 1 to 4
      while (ta < tb && csIsTrimByte(buf, ta, tb)) {
        if (ta > 2000000000) {
          fault();
          return;
        }
        ta = ta + (csTrimLen(buf, ta) & 7);
      }
      while (tb > ta && csIsTrimByteEnd(buf, ta, tb)) {
        // csIsTrimByteEnd read buf[tb - 1], so tb > 0
        if (tb > 0) {
          tb = tb - (csTrimLenEnd(buf, tb) & 7);
        } else {
          fault();
          return;
        }
      }
      this.out.range(buf, ta, tb);
      // next line
      if (e >= b) {
        return;
      }
      if (e < 0 || e >= buf.length) {
        fault();
        return;
      }
      const e1 = e + 1;
      pos = e1;
      if (toI32(buf[e]) === 13 && e1 < b) {
        if (e1 >= buf.length) {
          fault();
          return;
        }
        if (toI32(buf[e1]) === 10) {
          pos = e1 + 1;
        }
      }
      if (pos >= b) {
        // ReadLine answers null after a final line break
        return;
      }
      this.appendEol();
    }
  }

  processString(doc: i32, ind: i32): void {
    const D = this.D;
    const n = D.textLen(doc);
    if (n === 0) {
      return;
    }
    if (this.newLineNextStringValue && this.skipNextNewLine && n === 1 && D.textAt(doc, 0) === 32) {
      return;
    }
    if (this.newLineNextStringValue) {
      this.trimTrailingWhitespace();
      this.appendEol();
      this.appendIndent(ind);
      this.currentWidth = this.indentLength(ind);
      this.newLineNextStringValue = false;
    }
    this.appendText(doc);
    this.currentWidth = add32(this.currentWidth, D.cOf(doc));
  }

  processLine(doc: i32, mode: i32, ind: i32): void {
    const D = this.D;
    const k = D.kindOf(doc);
    if (mode === PM_FLAT || mode === PM_FORCE_FLAT) {
      if (k === D_SOFTLINE) {
        return;
      }
      if (k === D_LINE) {
        this.out.byte(32);
        this.currentWidth = add32(this.currentWidth, 1);
        return;
      }
      this.shouldRemeasure = true;
    }
    const squash = k === D_HARDLINE && (D.bOf(doc) & HL_SQUASH) !== 0;
    if (squash && this.out.n > 0 && this.endsWithNewLineAndWhitespace()) {
      return;
    }
    if (k === D_LITERALLINE) {
      if (this.out.n > 0) {
        this.appendEol();
        this.currentWidth = 0;
      }
      return;
    }
    if (!this.skipNextNewLine || !this.newLineNextStringValue) {
      const noTrim = k === D_HARDLINE && (D.bOf(doc) & HL_NO_TRIM) !== 0;
      if (!noTrim) {
        this.trimTrailingWhitespace();
      }
      this.appendEol();
      this.appendIndent(ind);
      this.currentWidth = this.indentLength(ind);
    }
    if (this.skipNextNewLine) {
      this.skipNextNewLine = false;
    }
  }

  processGroup(doc: i32, mode: i32, ind: i32): void {
    const D = this.D;
    const brk = D.bOf(doc) !== 0;
    if ((mode === PM_FLAT || mode === PM_FORCE_FLAT) && !this.shouldRemeasure) {
      this.push(D.aOf(doc), brk ? PM_BREAK : mode, ind);
    } else {
      this.shouldRemeasure = false;
      if (!brk && this.fits(D.aOf(doc), PM_FLAT)) {
        this.push(D.aOf(doc), PM_FLAT, ind);
      } else if (D.kindOf(doc) === D_CONDGROUP) {
        const off = D.dOf(doc);
        const n = D.eOf(doc);
        if (brk) {
          this.push(D.poolAt(off, sub32(n, 1)), PM_BREAK, ind);
        } else {
          let found = false;
          let lastDoc = D.aOf(doc);
          let lastMode = PM_FLAT;
          for (let i = 1; i < n; i++) {
            const opt = D.poolAt(off, i);
            lastDoc = opt;
            lastMode = mode;
            if (!this.fits(opt, mode)) {
              continue;
            }
            this.push(opt, mode, ind);
            found = true;
            break;
          }
          if (!found) {
            this.push(lastDoc, lastMode, ind);
          }
        }
      } else {
        this.push(D.aOf(doc), PM_BREAK, ind);
      }
    }
    const id = D.cOf(doc);
    if (id >= 0) {
      const groupMode = this.groupMode;
      const cMI = this.cMI;
      const nc = this.nc;
      if (id < groupMode.length && nc > 0 && nc <= cMI.length) {
        groupMode[id] = cMI[nc - 1] & 3;
      } else {
        this.stop();
      }
    }
  }

  /** Pushes (doc, mode) on the fitter's stack of ns entries; answers the new count. */
  spush(doc: i32, mode: i32, ns: i32): i32 {
    const sMI = this.sMI;
    const sDoc = this.sDoc;
    if (ns >= 0 && ns < sMI.length && ns < sDoc.length) {
      sMI[ns] = mode;
      sDoc[ns] = doc;
      return ns + 1;
    }
    return this.spushPast(doc, mode, ns);
  }

  /** spush past the end of the fitter's stack columns. */
  spushPast(doc: i32, mode: i32, ns: i32): i32 {
    const sMI = this.sMI;
    const sDoc = this.sDoc;
    if (ns === sDoc.length && ns === sMI.length && ns < 2000000000) {
      sMI.push(mode);
      sDoc.push(doc);
      return ns + 1;
    }
    fault();
    return 0;
  }

  /** DocFitter.Fits for the command (doc, mode, ind) with the remaining commands after it. */
  fits(doc0: i32, mode0: i32): boolean {
    const D = this.D;
    const cMI = this.cMI;
    const cDoc = this.cDoc;
    const groupMode = this.groupMode;
    let remaining = sub32(this.width, this.currentWidth);
    let outputLength = 0;
    let trailingWhitespace = 0;
    let returnFalseIfMoreStringsFound = false;
    let ns = this.spush(doc0, mode0, 0);
    let ci = this.nc; // the remaining commands below ci, from the top
    while (ci > 0 || ns > 0) {
      if (remaining < 0) {
        return false;
      }
      let mode = 0;
      let doc = 0;
      if (ns > 0) {
        ns = ns - 1;
        const sMI = this.sMI;
        const sDoc = this.sDoc;
        if (ns >= sMI.length || ns >= sDoc.length) {
          fault();
          return false;
        }
        mode = sMI[ns];
        doc = sDoc[ns];
      } else if (ci > 0 && ci <= cMI.length && ci <= cDoc.length) {
        const c1 = ci - 1;
        ci = c1;
        mode = cMI[c1] & 3;
        doc = cDoc[c1];
      } else {
        fault();
        return false;
      }
      const k = D.kindOf(doc);
      switch (k) {
        case D_NULL:
          break;
        case D_STRING: {
          if ((D.dOf(doc) & SF_DIRECTIVE) !== 0) {
            continue;
          }
          if (returnFalseIfMoreStringsFound) {
            return false;
          }
          const n = D.textLen(doc);
          // TrailingWhitespaceLength
          const len = D.eOf(doc);
          const w = D.cOf(doc);
          outputLength = add32(outputLength, n);
          if (len === n) {
            trailingWhitespace = add32(trailingWhitespace, len);
          } else {
            trailingWhitespace = len;
          }
          remaining = sub32(remaining, w);
          break;
        }
        case D_CONCAT: {
          const off = D.aOf(doc);
          let i = D.bOf(doc);
          while (i > 0) {
            i = i - 1;
            ns = this.spush(D.poolAt(off, i), mode, ns);
          }
          break;
        }
        case D_LINE:
        case D_SOFTLINE:
        case D_HARDLINE:
        case D_LITERALLINE:
          if (mode === PM_FLAT || mode === PM_FORCE_FLAT) {
            if (k === D_HARDLINE && (D.bOf(doc) & HL_FOR_TRIVIA) !== 0) {
              returnFalseIfMoreStringsFound = false;
            } else if (k === D_HARDLINE || k === D_LITERALLINE) {
              return true;
            }
            if (k !== D_SOFTLINE) {
              outputLength = add32(outputLength, 1);
              trailingWhitespace = add32(trailingWhitespace, 1);
              remaining = sub32(remaining, 1);
            }
            break;
          }
          return true;
        case D_GROUP:
        case D_CONDGROUP: {
          const gm = D.bOf(doc) !== 0 ? PM_BREAK : mode;
          let contents = D.aOf(doc);
          if (gm === PM_BREAK && k === D_CONDGROUP) {
            contents = D.poolAt(D.dOf(doc), sub32(D.eOf(doc), 1));
          }
          const id = D.cOf(doc);
          ns = this.spush(contents, gm, ns);
          if (id >= 0) {
            if (id >= groupMode.length) {
              fault();
              return false;
            }
            groupMode[id] = gm;
          }
          break;
        }
        case D_INDENT:
          ns = this.spush(D.aOf(doc), mode, ns);
          break;
        case D_IFBREAK: {
          const id = D.cOf(doc);
          let im = mode;
          if (id >= 0) {
            if (id >= groupMode.length) {
              fault();
              return false;
            }
            if (groupMode[id] >= 0) {
              im = groupMode[id];
            }
          }
          ns = this.spush(im === PM_BREAK ? D.aOf(doc) : D.bOf(doc), mode, ns);
          break;
        }
        case D_TRIM:
          outputLength = sub32(outputLength, trailingWhitespace);
          remaining = add32(remaining, trailingWhitespace);
          trailingWhitespace = 0;
          break;
        case D_LEADING_COMMENT:
        case D_TRAILING_COMMENT:
          if (outputLength > 0 && mode !== PM_FORCE_FLAT) {
            returnFalseIfMoreStringsFound = true;
          }
          break;
        case D_REGION:
          return false;
        case D_FORCEFLAT:
          ns = this.spush(D.aOf(doc), PM_FORCE_FLAT, ns);
          break;
        case D_BREAKPARENT:
          break;
        case D_ALWAYSFITS:
          break;
        default:
          // an unknown doc
          fault();
          return false;
      }
    }
    return remaining > 0;
  }
}

/** Whether buf[i] starts a char .NET's Trim removes (char.IsWhiteSpace). */
const csIsTrimByte = (buf: u8[], i: i32, b: i32): boolean => {
  if (i < 0 || i >= buf.length) {
    fault();
    return false;
  }
  const c = toI32(buf[i]);
  if (c === 32 || (c >= 9 && c <= 13)) {
    return true;
  }
  if (c < 0x80) {
    return false;
  }
  return csIsDotnetWhiteSpaceCp(csCpAt(buf, i, b));
};

const csTrimLen = (buf: u8[], i: i32): i32 => {
  if (i < 0 || i >= buf.length) {
    fault();
    return 1;
  }
  const c = toI32(buf[i]);
  if (c < 0x80) {
    return 1;
  }
  if (c < 0xe0) {
    return 2;
  }
  return c < 0xf0 ? 3 : 4;
};

/** Whether the char ending at tb is .NET whitespace. */
const csIsTrimByteEnd = (buf: u8[], ta: i32, tb: i32): boolean => {
  if (tb <= 0 || tb > buf.length) {
    fault();
    return false;
  }
  const c = toI32(buf[tb - 1]);
  if (c === 32 || (c >= 9 && c <= 13)) {
    return true;
  }
  if (c < 0x80) {
    return false;
  }
  let s = tb - 1;
  while (s > ta && s > 0 && s < buf.length && (toI32(buf[s]) & 0xc0) === 0x80) {
    s--;
  }
  return csIsDotnetWhiteSpaceCp(csCpAt(buf, s, tb));
};

const csTrimLenEnd = (buf: u8[], tb: i32): i32 => {
  if (tb < 0 || tb > buf.length) {
    fault();
    return 1;
  }
  let n = 1;
  while (n < 4) {
    const i = tb - n;
    if (i < 0 || i >= buf.length) {
      fault();
      return n;
    }
    if ((toI32(buf[i]) & 0xc0) !== 0x80) {
      break;
    }
    n++;
  }
  return n;
};

const csCpAt = (buf: u8[], i: i32, b: i32): i32 => {
  if (i < 0 || i >= buf.length || i > 2000000000) {
    fault();
    return 0x10000;
  }
  const c = toI32(buf[i]);
  const i1 = i + 1;
  const i2 = i + 2;
  if (c < 0xe0 && i1 < b) {
    if (i1 >= buf.length) {
      fault();
      return 0x10000;
    }
    return ((c & 0x1f) << 6) | (toI32(buf[i1]) & 0x3f);
  }
  if (c < 0xf0 && i2 < b) {
    if (i1 >= buf.length || i2 >= buf.length) {
      fault();
      return 0x10000;
    }
    return ((c & 0x0f) << 12) | ((toI32(buf[i1]) & 0x3f) << 6) | (toI32(buf[i2]) & 0x3f);
  }
  return 0x10000;
};

/** char.IsWhiteSpace for a non-ASCII code point. */
export const csIsDotnetWhiteSpaceCp = (c: i32): boolean =>
  c === 0x85 ||
  c === 0xa0 ||
  c === 0x1680 ||
  (c >= 0x2000 && c <= 0x200a) ||
  c === 0x2028 ||
  c === 0x2029 ||
  c === 0x202f ||
  c === 0x205f ||
  c === 0x3000;
