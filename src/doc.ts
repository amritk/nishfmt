// The per-file state: the source bytes, the token table and the line table.
//
// Both tables are columns (one `i32[]` per field), grown together, because
// every pass walks them in order and a column keeps that walk to one array.
// A worker keeps one Doc for every file it formats: `reset` points it at the
// next file and keeps the columns, so memory stays at the largest file's.

import { uncheckedGet } from "nish:unsafe";

/** Formatting options (the LLVM style's knobs this formatter exposes). */
export class Options {
  columnLimit: i32 = 120;
  indentWidth: i32 = 2;
  continuationIndent: i32 = 4;
  accessModifierOffset: i32 = -2;
  sortIncludes: boolean = true;
  reflowComments: boolean = true;
}

/** Grows `xs` to at least `n` elements, keeping its contents. */
export const growI32 = (xs: i32[], n: i32): i32[] => {
  if (toI32(xs.length) >= n) {
    return xs;
  }
  let cap = toI32(xs.length) * 2;
  if (cap < n) {
    cap = n;
  }
  const out = new Array<i32>(cap);
  out.set(xs);
  return out;
};

export class Doc {
  src: u8[];
  opts: Options;

  // Lexical columns.
  kind: i32[];
  start: i32[];
  end: i32[];
  nl: i32[]; // newlines in the whitespace before
  ws: i32[]; // 1 when whitespace precedes
  col: i32[]; // original column of the token's first byte
  width: i32[]; // column width (first line of a multi-line token)
  multi: i32[]; // 1 when the token spans lines
  inPP: i32[]; // 1 inside a preprocessor directive
  ppKind: i32[]; // on a directive's `#`: its PP_* id
  ppId: i32[]; // in a directive: its `#` token, else -1
  unesc: i32[]; // 1 when an unescaped newline precedes

  // Structure.
  nxt: i32[];
  prv: i32[];
  bk: i32[]; // brace kind
  childHead: i32[]; // first child line of a `{`, or -1
  childTail: i32[];
  childCount: i32[];

  // Classification.
  type: i32[];
  final: i32[];
  eqList: i32[]; // 1: a brace clang-format never gives the braced-list kind (a `{` reached through `=`, a `}`)
  asmFin: i32[]; // 1: a token inside `__asm { ... }`, kept as written
  hidSemi: i32[]; // 1: tokens another #if pass sees, after this one, hold a `;` for the brace scan
  // Passes so far (this one included) that saw the token; 0 outside passes.
  // clang-format's parameter counts on a bracket are never reset between
  // passes, so they grow with every pass that annotates the bracket again.
  passMul: i32[];
  // clang-format's FormatDecision, left by the pass that first formatted the
  // token: 0 unformatted, 1 continue, 2 break. A later pass's search keeps it.
  dec: i32[];
  keepWs: i32[]; // 1: the token keeps its whitespace as written (a line clang-format found no layout for)
  match: i32[];
  nest: i32[];
  bind: i32[];
  mustBreak: i32[];
  spaces: i32[];

  // Lines.
  lFirst: i32[];
  lLast: i32[];
  lLevel: i32[];
  lPP: i32[];
  lType: i32[];
  lMustDecl: i32[];
  lMightFn: i32[];
  lMultiVar: i32[];
  lSibling: i32[];
  lInlineCmt: i32[]; // 1: own-line comments before a directive inside a statement, parked like it
  lAbs: i32[]; // 1: a child line indented by its level alone, not from its block
  lParent: i32[];
  lOpen: i32[]; // for a line starting with `}`: the line holding its `{`
  lNamespace: i32[]; // 1 when the line opens a namespace
  lInvalid: i32[]; // 1 when clang-format could not annotate the line: written as it is
  lInClass: i32[]; // 1 when the line sits directly in a class body
  lRetWrap: i32[]; // 1 when a kept break after attributes wraps the return type
  lDefCode: i32[]; // 1 on a #define head whose body is parsed as code

  n: i32 = 0;
  ntok: i32 = 0;
  nCR: i32 = 0; // carriage returns and line feeds between tokens, for the line ending
  nLF: i32 = 0;
  strTabs: boolean = false; // a string literal holds a tab
  nline: i32 = 0;
  topHead: i32 = -1;
  topTail: i32 = -1;
  // Whole-file failure (unbalanced input): leave the file untouched.
  failed: boolean = false;

  constructor(src: u8[], n: i32, opts: Options) {
    this.src = src;
    this.n = n;
    this.opts = opts;
    const cap = n / 4 + 64;
    this.kind = new Array<i32>(cap);
    this.start = new Array<i32>(cap);
    this.end = new Array<i32>(cap);
    this.nl = new Array<i32>(cap);
    this.ws = new Array<i32>(cap);
    this.col = new Array<i32>(cap);
    this.width = new Array<i32>(cap);
    this.multi = new Array<i32>(cap);
    this.inPP = new Array<i32>(cap);
    this.ppKind = new Array<i32>(cap);
    this.ppId = new Array<i32>(cap);
    this.unesc = new Array<i32>(cap);
    this.nxt = new Array<i32>(cap);
    this.prv = new Array<i32>(cap);
    this.bk = new Array<i32>(cap);
    this.childHead = new Array<i32>(cap);
    this.childTail = new Array<i32>(cap);
    this.childCount = new Array<i32>(cap);
    this.type = new Array<i32>(cap);
    this.final = new Array<i32>(cap);
    this.eqList = new Array<i32>(cap);
    this.hidSemi = new Array<i32>(cap);
    this.asmFin = new Array<i32>(cap);
    this.passMul = new Array<i32>(cap);
    this.keepWs = new Array<i32>(cap);
    this.dec = new Array<i32>(cap);
    this.match = new Array<i32>(cap);
    this.nest = new Array<i32>(cap);
    this.bind = new Array<i32>(cap);
    this.mustBreak = new Array<i32>(cap);
    this.spaces = new Array<i32>(cap);
    const lcap = n / 24 + 32;
    this.lFirst = new Array<i32>(lcap);
    this.lLast = new Array<i32>(lcap);
    this.lLevel = new Array<i32>(lcap);
    this.lPP = new Array<i32>(lcap);
    this.lType = new Array<i32>(lcap);
    this.lMustDecl = new Array<i32>(lcap);
    this.lMightFn = new Array<i32>(lcap);
    this.lMultiVar = new Array<i32>(lcap);
    this.lSibling = new Array<i32>(lcap);
    this.lAbs = new Array<i32>(lcap);
    this.lInlineCmt = new Array<i32>(lcap);
    this.lParent = new Array<i32>(lcap);
    this.lOpen = new Array<i32>(lcap);
    this.lNamespace = new Array<i32>(lcap);
    this.lInvalid = new Array<i32>(lcap);
    this.lInClass = new Array<i32>(lcap);
    this.lRetWrap = new Array<i32>(lcap);
    this.lDefCode = new Array<i32>(lcap);
  }

  /** Points the document at the next file, keeping the columns. */
  reset(src: u8[], n: i32): void {
    this.src = src;
    this.n = n;
    this.ntok = 0;
    this.nline = 0;
    this.topHead = -1;
    this.topTail = -1;
    this.failed = false;
  }

  /** Makes room for token `i`. */
  growTokens(i: i32): void {
    if (i < toI32(this.kind.length)) {
      return;
    }
    const n = i + 1;
    this.kind = growI32(this.kind, n);
    this.start = growI32(this.start, n);
    this.end = growI32(this.end, n);
    this.nl = growI32(this.nl, n);
    this.ws = growI32(this.ws, n);
    this.col = growI32(this.col, n);
    this.width = growI32(this.width, n);
    this.multi = growI32(this.multi, n);
    this.inPP = growI32(this.inPP, n);
    this.ppKind = growI32(this.ppKind, n);
    this.ppId = growI32(this.ppId, n);
    this.unesc = growI32(this.unesc, n);
    this.nxt = growI32(this.nxt, n);
    this.prv = growI32(this.prv, n);
    this.bk = growI32(this.bk, n);
    this.childHead = growI32(this.childHead, n);
    this.childTail = growI32(this.childTail, n);
    this.childCount = growI32(this.childCount, n);
    this.type = growI32(this.type, n);
    this.final = growI32(this.final, n);
    this.eqList = growI32(this.eqList, n);
    this.hidSemi = growI32(this.hidSemi, n);
    this.asmFin = growI32(this.asmFin, n);
    this.passMul = growI32(this.passMul, n);
    this.keepWs = growI32(this.keepWs, n);
    this.dec = growI32(this.dec, n);
    this.match = growI32(this.match, n);
    this.nest = growI32(this.nest, n);
    this.bind = growI32(this.bind, n);
    this.mustBreak = growI32(this.mustBreak, n);
    this.spaces = growI32(this.spaces, n);
  }

  /** Makes room for line `i`. */
  growLines(i: i32): void {
    if (i < toI32(this.lFirst.length)) {
      return;
    }
    const n = i + 1;
    this.lFirst = growI32(this.lFirst, n);
    this.lLast = growI32(this.lLast, n);
    this.lLevel = growI32(this.lLevel, n);
    this.lPP = growI32(this.lPP, n);
    this.lType = growI32(this.lType, n);
    this.lMustDecl = growI32(this.lMustDecl, n);
    this.lMightFn = growI32(this.lMightFn, n);
    this.lMultiVar = growI32(this.lMultiVar, n);
    this.lSibling = growI32(this.lSibling, n);
    this.lAbs = growI32(this.lAbs, n);
    this.lInlineCmt = growI32(this.lInlineCmt, n);
    this.lParent = growI32(this.lParent, n);
    this.lOpen = growI32(this.lOpen, n);
    this.lNamespace = growI32(this.lNamespace, n);
    this.lInvalid = growI32(this.lInvalid, n);
    this.lInClass = growI32(this.lInClass, n);
    this.lRetWrap = growI32(this.lRetWrap, n);
    this.lDefCode = growI32(this.lDefCode, n);
  }

  /** The byte at `i`, or 0 past the end. */
  at(i: i32): i32 {
    if (i < 0 || i >= this.n) {
      return 0;
    }
    return toI32(uncheckedGet(this.src, i));
  }

  /** Token `t`'s length in bytes. */
  len(t: i32): i32 {
    return this.end[t] - this.start[t];
  }

  /** Whether tokens `a` and `b` have the same text. */
  sameText(a: i32, b: i32): boolean {
    const sa = this.start[a];
    const sb = this.start[b];
    const n = this.end[a] - sa;
    if (n !== this.end[b] - sb) {
      return false;
    }
    for (let i = 0; i < n; i++) {
      if (uncheckedGet(this.src, sa + i) !== uncheckedGet(this.src, sb + i)) {
        return false;
      }
    }
    return true;
  }

  /** Token `t`'s text, as a string (allocates; for rare paths). */
  text(t: i32): string {
    return String.fromBytes(this.src, this.start[t], this.end[t]);
  }

  /**
   * clang-format's OriginalColumn of token `t`: its column as written, a tab
   * reaching the next stop of 8 and a character one column (`col` counts
   * bytes).
   */
  origCol(t: i32): i32 {
    const s = this.start[t];
    const ls = s - this.col[t];
    let c = 0;
    for (let k = ls; k < s; k++) {
      const b = toI32(uncheckedGet(this.src, k));
      if (b === 9) {
        c = c + 8 - (c % 8);
      } else if (b < 0x80 || b >= 0xc0) {
        c++;
      }
    }
    return c;
  }

  /** The first byte of token `t`. */
  firstByte(t: i32): i32 {
    return toI32(uncheckedGet(this.src, this.start[t]));
  }

  /** The last byte of token `t`. */
  lastByte(t: i32): i32 {
    return toI32(uncheckedGet(this.src, this.end[t] - 1));
  }
}
