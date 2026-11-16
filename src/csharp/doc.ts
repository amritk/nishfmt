// CSharpier's Doc model, Prettier's printing algorithm as CSharpier has it:
// the Doc types, PropagateBreaks, DocFitter and DocPrinter.
//
// Ported from CSharpier 1.4.0 (MIT License, Copyright (c) 2021 Bela
// VanderVoort): DocTypes/*.cs, DocPrinter/*.cs, DocTypes/DocUtilities.cs.

import { growI32 } from "../core/arr";
import { Out } from "../core/out";
import { uncheckedGet, uncheckedSet } from "nish:unsafe";

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
      const c1 = i + 1 < b ? (toI32(s[i + 1]) & 0x3f) << 6 : 0;
      const c2 = i + 2 < b ? toI32(s[i + 2]) & 0x3f : 0;
      const cp = ((c & 0x0f) << 12) | c1 | c2;
      w += csIsWideChar(cp) ? 2 : 1;
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
  while (e > a && (toI32(s[e - 1]) === 32 || toI32(s[e - 1]) === 9)) {
    e--;
  }
  return b - e;
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
    const c = cap < 64 ? 64 : cap;
    this.kind = new Array<i32>(c);
    this.a = new Array<i32>(c);
    this.b = new Array<i32>(c);
    this.c = new Array<i32>(c);
    this.d = new Array<i32>(c);
    this.e = new Array<i32>(c);
    this.pool = new Array<i32>(c + c / 6);
    this.sb = new Array<u8>(c / 4 + 64);
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
    if (i >= toI32(this.kind.length)) {
      const cap = i * 2;
      this.kind = growI32(this.kind, cap);
      this.a = growI32(this.a, cap);
      this.b = growI32(this.b, cap);
      this.c = growI32(this.c, cap);
      this.d = growI32(this.d, cap);
      this.e = growI32(this.e, cap);
    }
    this.kind[i] = k;
    this.a[i] = a;
    this.b[i] = b;
    this.c[i] = c;
    this.d[i] = d;
    this.e[i] = 0;
    this.n = i + 1;
    return i;
  }

  // ---- text ----

  /** A StringDoc over src[a, b). */
  strSrc(a: i32, b: i32): i32 {
    const d = this.add(D_STRING, a, b, csPrintedWidth(this.src, a, b), SF_SRC);
    this.e[d] = csTrailingWs(this.src, a, b);
    return d;
  }

  /** A StringDoc over `s`, put in the arena. */
  strArena(s: string): i32 {
    const a = this.appendStr(s);
    const d = this.add(D_STRING, a, this.ns, csPrintedWidth(this.sb, a, this.ns), 0);
    this.e[d] = csTrailingWs(this.sb, a, this.ns);
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
    this.e[d] = csTrailingWs(this.sb, a, b);
    return d;
  }

  appendStr(s: string): i32 {
    const a = this.ns;
    const k = toI32(s.length);
    this.reserveSb(k);
    for (let i = 0; i < k; i++) {
      this.sb[a + i] = toU8(s.charCodeAt(i));
    }
    this.ns = a + k;
    return a;
  }

  appendBytes(buf: u8[], a: i32, b: i32): i32 {
    const o = this.ns;
    const k = b - a;
    this.reserveSb(k);
    for (let i = 0; i < k; i++) {
      this.sb[o + i] = buf[a + i];
    }
    this.ns = o + k;
    return o;
  }

  appendByte(c: i32): void {
    this.reserveSb(1);
    this.sb[this.ns] = toU8(c);
    this.ns = this.ns + 1;
  }

  reserveSb(k: i32): void {
    if (this.ns + k > toI32(this.sb.length)) {
      let cap = toI32(this.sb.length) * 2;
      if (cap < this.ns + k) {
        cap = this.ns + k + 64;
      }
      const nb = new Array<u8>(cap);
      for (let i = 0; i < this.ns; i++) {
        nb[i] = this.sb[i];
      }
      this.sb = nb;
    }
  }

  textLen(d: i32): i32 {
    return this.b[d] - this.a[d];
  }

  /** Byte i of the text of doc d (a string, comment or region). */
  textAt(d: i32, i: i32): i32 {
    return (this.d[d] & SF_SRC) !== 0 ? toI32(this.src[this.a[d] + i]) : toI32(this.sb[this.a[d] + i]);
  }

  textIs(d: i32, s: string): boolean {
    const n = this.textLen(d);
    if (n !== toI32(s.length)) {
      return false;
    }
    for (let i = 0; i < n; i++) {
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
    if (n === 1) {
      return docs[0];
    }
    return this.concatList(docs);
  }

  /** new Concat(list) (always a Concat). */
  concatList(docs: i32[]): i32 {
    const n = toI32(docs.length);
    const off = this.np;
    this.reservePool(n);
    for (let i = 0; i < n; i++) {
      this.pool[off + i] = docs[i];
    }
    this.np = off + n;
    return this.add(D_CONCAT, off, n, 0, 0);
  }

  reservePool(n: i32): void {
    if (this.np + n > toI32(this.pool.length)) {
      this.pool = growI32(this.pool, (this.np + n) * 2);
    }
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
    const n = toI32(options.length);
    const off = this.np;
    this.reservePool(n);
    for (let i = 0; i < n; i++) {
      this.pool[off + i] = options[i];
    }
    this.np = off + n;
    const g = this.add(D_CONDGROUP, options[0], 0, -1, off);
    this.e[g] = n;
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

  /** Child i of a Concat. */
  at(d: i32, i: i32): i32 {
    return uncheckedGet(this.pool, uncheckedGet(this.a, d) + i);
  }

  count(d: i32): i32 {
    return this.b[d];
  }

  setAt(d: i32, i: i32, v: i32): void {
    this.pool[this.a[d] + i] = v;
  }

  isHardLine(d: i32): boolean {
    return this.kind[d] === D_HARDLINE;
  }
}

// ---- DocUtilities ----

export const csdContainsBreak = (D: CsDocs, d: i32): boolean => {
  const k = uncheckedGet(D.kind, d);
  if (k === D_GROUP || k === D_CONDGROUP) {
    if (uncheckedGet(D.b, d) !== 0) {
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
      return csdContainsBreak(D, uncheckedGet(D.a, d));
    case D_CONCAT: {
      const n = uncheckedGet(D.b, d);
      for (let i = 0; i < n; i++) {
        if (csdContainsBreak(D, D.at(d, i))) {
          return true;
        }
      }
      return false;
    }
    case D_IFBREAK:
      return csdContainsBreak(D, uncheckedGet(D.b, d));
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
  let x = 0;
  while (x < toI32(docs.length)) {
    const doc = docs[x];
    if (uncheckedGet(D.kind, doc) === D_HARDLINE) {
      if (st.removeNext) {
        docs[x] = DOC_NULL;
        return;
      }
      st.removeNext = true;
    } else {
      csdRemoveDoc(D, doc, st);
      return;
    }
    x++;
  }
};

const csdRemoveConcat = (D: CsDocs, c: i32, st: CsRemoveState): void => {
  let x = 0;
  const n = uncheckedGet(D.b, c);
  while (x < n) {
    const doc = D.at(c, x);
    if (uncheckedGet(D.kind, doc) === D_HARDLINE) {
      if (st.removeNext) {
        D.setAt(c, x, DOC_NULL);
        return;
      }
      st.removeNext = true;
    } else {
      csdRemoveDoc(D, doc, st);
      return;
    }
    x++;
  }
};

export const csdRemoveInitialDoubleHardLine = (D: CsDocs, doc: i32): i32 => {
  const st = new CsRemoveState();
  csdRemoveDoc(D, doc, st);
  return doc;
};

const csdRemoveDoc = (D: CsDocs, doc: i32, st: CsRemoveState): void => {
  switch (uncheckedGet(D.kind, doc)) {
    case D_STRING:
      return;
    case D_INDENT:
    case D_GROUP:
    case D_CONDGROUP: {
      const c = uncheckedGet(D.a, doc);
      if (uncheckedGet(D.kind, c) === D_HARDLINE) {
        if (st.removeNext) {
          D.a[doc] = DOC_NULL;
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
  const visited = new Array<u8>(D.n);
  const groupStack: i32[] = [];
  let forceFlat = 0;
  let canSkipBreak = false;
  let stringCount = 0;
  let stringCountAtLastHardLine = 0;
  const MARKER = -1;
  const stack: i32[] = [root];
  while (toI32(stack.length) > 0) {
    const doc = stack[toI32(stack.length) - 1];
    if (doc === MARKER) {
      stack.pop();
      const ex = stack.pop();
      // OnExit
      if (uncheckedGet(D.kind, ex) === D_FORCEFLAT) {
        forceFlat--;
      } else {
        canSkipBreak = false;
        const g = groupStack.pop();
        if (uncheckedGet(D.b, g) !== 0) {
          csdBreakParentGroup(D, groupStack);
        }
      }
      continue;
    }
    const k = uncheckedGet(D.kind, doc);
    // OnEnter
    let enter = true;
    if (k === D_STRING && (uncheckedGet(D.d, doc) & SF_DIRECTIVE) === 0) {
      canSkipBreak = false;
      if (uncheckedGet(D.b, doc) > uncheckedGet(D.a, doc)) {
        stringCount++;
      }
    } else if (k === D_GROUP || k === D_CONDGROUP) {
      canSkipBreak = true;
      groupStack.push(doc);
      if (visited[doc] !== 0) {
        enter = false;
      }
      visited[doc] = 1;
    } else if ((k === D_HARDLINE || k === D_LITERALLINE || k === D_BREAKPARENT) && (forceFlat === 0 || k === D_LITERALLINE)) {
      const isAtStartOfLine = stringCount === stringCountAtLastHardLine;
      if (k === D_HARDLINE && (uncheckedGet(D.b, doc) & HL_FOR_TRIVIA) !== 0 && (isAtStartOfLine || canSkipBreak)) {
        const gs = toI32(groupStack.length);
        if (!isAtStartOfLine && gs > 1) {
          D.b[groupStack[gs - 2]] = 1;
        }
      } else {
        csdBreakParentGroup(D, groupStack);
      }
      if (k === D_HARDLINE) {
        stringCountAtLastHardLine = stringCount;
      }
    } else if (k === D_FORCEFLAT) {
      forceFlat++;
    }
    if (!enter) {
      // OnExit for the group
      stack.pop();
      canSkipBreak = false;
      const g = groupStack.pop();
      if (uncheckedGet(D.b, g) !== 0) {
        csdBreakParentGroup(D, groupStack);
      }
      continue;
    }
    if (k === D_FORCEFLAT || k === D_GROUP || k === D_CONDGROUP) {
      stack.push(MARKER);
    } else {
      stack.pop();
    }
    if (k === D_CONCAT) {
      const n = uncheckedGet(D.b, doc);
      for (let x = n - 1; x >= 0; x--) {
        const ch = D.at(doc, x);
        const ck = uncheckedGet(D.kind, ch);
        if (forceFlat > 0 && (ck === D_LINE || ck === D_SOFTLINE || ck === D_HARDLINE)) {
          D.setAt(doc, x, ck === D_SOFTLINE ? DOC_EMPTY : DOC_SPACE);
        }
        stack.push(D.at(doc, x));
      }
    } else if (k === D_IFBREAK) {
      stack.push(uncheckedGet(D.b, doc));
      stack.push(uncheckedGet(D.a, doc));
    } else if (k === D_CONDGROUP) {
      const off = uncheckedGet(D.d, doc);
      const n = uncheckedGet(D.e, doc);
      for (let i = 0; i < n; i++) {
        stack.push(uncheckedGet(D.pool, off + i));
      }
    } else if (k === D_GROUP || k === D_INDENT || k === D_FORCEFLAT) {
      stack.push(uncheckedGet(D.a, doc));
    }
  }
};

const csdBreakParentGroup = (D: CsDocs, groupStack: i32[]): void => {
  const n = toI32(groupStack.length);
  if (n > 0) {
    const g = groupStack[n - 1];
    if (uncheckedGet(D.kind, g) !== D_CONDGROUP) {
      D.b[g] = 1;
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
    this.groupMode = new Array<i32>(D.ngroup + 1);
    for (let i = 0; i < D.ngroup + 1; i++) {
      this.groupMode[i] = -1;
    }
    this.regionIndents = [];
  }

  push(doc: i32, mode: i32, ind: i32): void {
    const i = this.nc;
    if (i >= toI32(this.cDoc.length)) {
      this.cMI = growI32(this.cMI, i * 2);
      this.cDoc = growI32(this.cDoc, i * 2);
    }
    uncheckedSet(this.cMI, i, (ind << 2) | mode);
    uncheckedSet(this.cDoc, i, doc);
    this.nc = i + 1;
  }

  indentLength(ind: i32): i32 {
    return ind * this.indentSize;
  }

  appendIndent(ind: i32): void {
    if (this.useTabs) {
      for (let i = 0; i < ind; i++) {
        this.out.byte(9);
      }
    } else {
      this.out.spaces(ind * this.indentSize);
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
    while (out.n > 0 && (toI32(out.buf[out.n - 1]) === 10 || toI32(out.buf[out.n - 1]) === 13)) {
      out.n = out.n - 1;
    }
    this.appendEol();
    // TrimStart('\n', '\r')
    let s = 0;
    while (s < out.n && (toI32(out.buf[s]) === 10 || toI32(out.buf[s]) === 13)) {
      s++;
    }
    if (s > 0) {
      for (let i = s; i < out.n; i++) {
        out.buf[i - s] = out.buf[i];
      }
      out.n = out.n - s;
    }
  }

  trimTrailingWhitespace(): i32 {
    const out = this.out;
    let t = 0;
    while (out.n > 0) {
      const c = toI32(out.buf[out.n - 1]);
      if (c !== 32 && c !== 9) {
        break;
      }
      out.n = out.n - 1;
      t++;
    }
    return t;
  }

  endsWithNewLineAndWhitespace(): boolean {
    const out = this.out;
    for (let i = out.n - 1; i >= 0; i--) {
      const c = toI32(out.buf[i]);
      if (c === 32 || c === 9) {
        continue;
      }
      return c === 10;
    }
    return false;
  }

  appendText(d: i32): void {
    const D = this.D;
    const n = D.textLen(d);
    if ((uncheckedGet(D.d, d) & SF_SRC) !== 0) {
      this.out.range(D.src, uncheckedGet(D.a, d), uncheckedGet(D.b, d));
    } else {
      this.out.range(D.sb, uncheckedGet(D.a, d), uncheckedGet(D.a, d) + n);
    }
  }

  processNext(): void {
    this.nc = this.nc - 1;
    const mi = uncheckedGet(this.cMI, this.nc);
    const ind = mi >> 2;
    const mode = mi & 3;
    const doc = uncheckedGet(this.cDoc, this.nc);
    const D = this.D;
    const k = uncheckedGet(D.kind, doc);
    switch (k) {
      case D_NULL:
        return;
      case D_STRING:
        this.processString(doc, ind);
        return;
      case D_CONCAT: {
        const n = uncheckedGet(D.b, doc);
        for (let x = n - 1; x >= 0; x--) {
          this.push(D.at(doc, x), mode, ind);
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
        this.push(uncheckedGet(D.a, doc), mode, ind + 1);
        return;
      case D_TRIM:
        this.currentWidth -= this.trimTrailingWhitespace();
        this.newLineNextStringValue = false;
        return;
      case D_IFBREAK: {
        let gm = mode;
        const id = uncheckedGet(D.c, doc);
        if (id >= 0) {
          gm = this.groupMode[id];
          if (gm < 0) {
            panic("an ifBreak before the group it targets");
          }
        }
        this.push(gm === PM_BREAK ? uncheckedGet(D.a, doc) : uncheckedGet(D.b, doc), mode, ind);
        return;
      }
      case D_BREAKPARENT:
        return;
      case D_LEADING_COMMENT: {
        this.trimTrailingWhitespace();
        const out = this.out;
        if ((out.n !== 0 && toI32(out.buf[out.n - 1]) !== 10) || this.newLineNextStringValue) {
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
        this.push(uncheckedGet(D.a, doc), PM_FORCE_FLAT, ind);
        return;
      case D_REGION:
        if (uncheckedGet(D.c, doc) !== 0) {
          const n = toI32(this.regionIndents.length);
          if (n > 0) {
            this.appendIndent(this.regionIndents.pop());
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
        this.push(uncheckedGet(D.a, doc), mode, ind);
        return;
      default:
        panic(`unknown doc ${k}`);
    }
  }

  /** CalculateCurrentLeadingIndentation of D's text [a, b). */
  leadingIndentation(buf: u8[], a: i32, b: i32): i32 {
    let r = 0;
    for (let i = a; i < b; i++) {
      const c = toI32(buf[i]);
      if (c === 32) {
        r++;
      } else if (c === 9) {
        r += this.indentSize;
      } else {
        break;
      }
    }
    return r;
  }

  appendComment(doc: i32, ind: i32): void {
    const D = this.D;
    const buf = (uncheckedGet(D.d, doc) & SF_SRC) !== 0 ? D.src : D.sb;
    const a = uncheckedGet(D.a, doc);
    const b = uncheckedGet(D.b, doc);
    const isMulti = uncheckedGet(D.c, doc) === CT_MULTI;
    // StringReader.ReadLine: lines split on \r\n, \r, \n
    let pos = a;
    let first = true;
    let delta = 0;
    while (pos <= b) {
      if (pos === b && !first) {
        return;
      }
      let e = pos;
      while (e < b && toI32(buf[e]) !== 10 && toI32(buf[e]) !== 13) {
        e++;
      }
      if (pos === b && first) {
        // an empty comment has no line
        return;
      }
      if (first && isMulti) {
        delta = this.indentLength(ind) - this.leadingIndentation(buf, pos, e);
      }
      first = false;
      if (!isMulti) {
        this.appendIndent(ind);
      } else {
        let spaces = this.leadingIndentation(buf, pos, e) + delta;
        if (this.useTabs) {
          const il = this.indentLength(ind);
          if (spaces >= il) {
            this.appendIndent(ind);
            spaces -= il;
          }
          while (spaces > 0 && spaces >= this.indentSize) {
            this.out.byte(9);
            spaces -= this.indentSize;
          }
        }
        if (spaces > 0) {
          this.out.spaces(spaces);
        }
      }
      // line.Trim()
      let ta = pos;
      let tb = e;
      while (ta < tb && csIsTrimByte(buf, ta, tb)) {
        ta += csTrimLen(buf, ta);
      }
      while (tb > ta && csIsTrimByteEnd(buf, ta, tb)) {
        tb -= csTrimLenEnd(buf, tb);
      }
      this.out.range(buf, ta, tb);
      // next line
      if (e >= b) {
        return;
      }
      if (toI32(buf[e]) === 13 && e + 1 < b && toI32(buf[e + 1]) === 10) {
        pos = e + 2;
      } else {
        pos = e + 1;
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
    this.currentWidth += uncheckedGet(D.c, doc);
  }

  processLine(doc: i32, mode: i32, ind: i32): void {
    const D = this.D;
    const k = uncheckedGet(D.kind, doc);
    if (mode === PM_FLAT || mode === PM_FORCE_FLAT) {
      if (k === D_SOFTLINE) {
        return;
      }
      if (k === D_LINE) {
        this.out.byte(32);
        this.currentWidth += 1;
        return;
      }
      this.shouldRemeasure = true;
    }
    const squash = k === D_HARDLINE && (uncheckedGet(D.b, doc) & HL_SQUASH) !== 0;
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
      const noTrim = k === D_HARDLINE && (uncheckedGet(D.b, doc) & HL_NO_TRIM) !== 0;
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
    const brk = uncheckedGet(D.b, doc) !== 0;
    if ((mode === PM_FLAT || mode === PM_FORCE_FLAT) && !this.shouldRemeasure) {
      this.push(uncheckedGet(D.a, doc), brk ? PM_BREAK : mode, ind);
    } else {
      this.shouldRemeasure = false;
      if (!brk && this.fits(uncheckedGet(D.a, doc), PM_FLAT)) {
        this.push(uncheckedGet(D.a, doc), PM_FLAT, ind);
      } else if (uncheckedGet(D.kind, doc) === D_CONDGROUP) {
        const off = uncheckedGet(D.d, doc);
        const n = uncheckedGet(D.e, doc);
        if (brk) {
          this.push(uncheckedGet(D.pool, off + n - 1), PM_BREAK, ind);
        } else {
          let found = false;
          let lastDoc = uncheckedGet(D.a, doc);
          let lastMode = PM_FLAT;
          for (let i = 1; i < n; i++) {
            const opt = uncheckedGet(D.pool, off + i);
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
        this.push(uncheckedGet(D.a, doc), PM_BREAK, ind);
      }
    }
    const id = uncheckedGet(D.c, doc);
    if (id >= 0) {
      this.groupMode[id] = this.cMI[this.nc - 1] & 3;
    }
  }

  spush(doc: i32, mode: i32, ns: i32): i32 {
    if (ns >= toI32(this.sDoc.length)) {
      this.sMI = growI32(this.sMI, ns * 2);
      this.sDoc = growI32(this.sDoc, ns * 2);
    }
    uncheckedSet(this.sMI, ns, mode);
    uncheckedSet(this.sDoc, ns, doc);
    return ns + 1;
  }

  /** DocFitter.Fits for the command (doc, mode, ind) with the remaining commands after it. */
  fits(doc0: i32, mode0: i32): boolean {
    const D = this.D;
    let remaining = this.width - this.currentWidth;
    let outputLength = 0;
    let trailingWhitespace = 0;
    let returnFalseIfMoreStringsFound = false;
    let ns = this.spush(doc0, mode0, 0);
    let x = 0; // index into the remaining commands, from the top
    while (x < this.nc || ns > 0) {
      if (remaining < 0) {
        return false;
      }
      let mode = 0;
      let doc = 0;
      if (ns > 0) {
        ns--;
        mode = uncheckedGet(this.sMI, ns);
        doc = uncheckedGet(this.sDoc, ns);
      } else {
        const ci = this.nc - 1 - x;
        x++;
        mode = uncheckedGet(this.cMI, ci) & 3;
        doc = uncheckedGet(this.cDoc, ci);
      }
      const k = uncheckedGet(D.kind, doc);
      switch (k) {
        case D_NULL:
          break;
        case D_STRING: {
          if ((uncheckedGet(D.d, doc) & SF_DIRECTIVE) !== 0) {
            continue;
          }
          if (returnFalseIfMoreStringsFound) {
            return false;
          }
          const n = uncheckedGet(D.b, doc) - uncheckedGet(D.a, doc);
          outputLength += n;
          // TrailingWhitespaceLength
          const len = uncheckedGet(D.e, doc);
          trailingWhitespace = len === n ? trailingWhitespace + len : len;
          remaining -= uncheckedGet(D.c, doc);
          break;
        }
        case D_CONCAT: {
          const n = uncheckedGet(D.b, doc);
          for (let i = n - 1; i >= 0; i--) {
            ns = this.spush(D.at(doc, i), mode, ns);
          }
          break;
        }
        case D_LINE:
        case D_SOFTLINE:
        case D_HARDLINE:
        case D_LITERALLINE:
          if (mode === PM_FLAT || mode === PM_FORCE_FLAT) {
            if (k === D_HARDLINE && (uncheckedGet(D.b, doc) & HL_FOR_TRIVIA) !== 0) {
              returnFalseIfMoreStringsFound = false;
            } else if (k === D_HARDLINE || k === D_LITERALLINE) {
              return true;
            }
            if (k !== D_SOFTLINE) {
              outputLength += 1;
              trailingWhitespace += 1;
              remaining -= 1;
            }
            break;
          }
          return true;
        case D_GROUP:
        case D_CONDGROUP: {
          const gm = uncheckedGet(D.b, doc) !== 0 ? PM_BREAK : mode;
          let contents = uncheckedGet(D.a, doc);
          if (gm === PM_BREAK && k === D_CONDGROUP) {
            contents = D.pool[uncheckedGet(D.d, doc) + uncheckedGet(D.e, doc) - 1];
          }
          ns = this.spush(contents, gm, ns);
          const id = uncheckedGet(D.c, doc);
          if (id >= 0) {
            this.groupMode[id] = gm;
          }
          break;
        }
        case D_INDENT:
          ns = this.spush(uncheckedGet(D.a, doc), mode, ns);
          break;
        case D_IFBREAK: {
          const id = uncheckedGet(D.c, doc);
          let im = mode;
          if (id >= 0 && this.groupMode[id] >= 0) {
            im = this.groupMode[id];
          }
          ns = this.spush(im === PM_BREAK ? uncheckedGet(D.a, doc) : uncheckedGet(D.b, doc), mode, ns);
          break;
        }
        case D_TRIM:
          outputLength -= trailingWhitespace;
          remaining += trailingWhitespace;
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
          ns = this.spush(uncheckedGet(D.a, doc), PM_FORCE_FLAT, ns);
          break;
        case D_BREAKPARENT:
          break;
        case D_ALWAYSFITS:
          break;
        default:
          panic(`fits: unknown doc ${k}`);
      }
    }
    return remaining > 0;
  }
}

/** Whether buf[i] starts a char .NET's Trim removes (char.IsWhiteSpace). */
const csIsTrimByte = (buf: u8[], i: i32, b: i32): boolean => {
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
  const c = toI32(buf[i]);
  return c < 0x80 ? 1 : c < 0xe0 ? 2 : c < 0xf0 ? 3 : 4;
};

/** Whether the char ending at tb is .NET whitespace. */
const csIsTrimByteEnd = (buf: u8[], ta: i32, tb: i32): boolean => {
  const c = toI32(buf[tb - 1]);
  if (c === 32 || (c >= 9 && c <= 13)) {
    return true;
  }
  if (c < 0x80) {
    return false;
  }
  let s = tb - 1;
  while (s > ta && (toI32(buf[s]) & 0xc0) === 0x80) {
    s--;
  }
  return csIsDotnetWhiteSpaceCp(csCpAt(buf, s, tb));
};

const csTrimLenEnd = (buf: u8[], tb: i32): i32 => {
  let n = 1;
  while (n < 4 && (toI32(buf[tb - n]) & 0xc0) === 0x80) {
    n++;
  }
  return n;
};

const csCpAt = (buf: u8[], i: i32, b: i32): i32 => {
  const c = toI32(buf[i]);
  if (c < 0xe0 && i + 1 < b) {
    return ((c & 0x1f) << 6) | (toI32(buf[i + 1]) & 0x3f);
  }
  if (c < 0xf0 && i + 2 < b) {
    return ((c & 0x0f) << 12) | ((toI32(buf[i + 1]) & 0x3f) << 6) | (toI32(buf[i + 2]) & 0x3f);
  }
  return 0x10000;
};

/** char.IsWhiteSpace for a non-ASCII code point. */
export const csIsDotnetWhiteSpaceCp = (c: i32): boolean =>
  c === 0x85 || c === 0xa0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000;
