// The per-file state: the source bytes, the token table and the line table.
//
// Both tables are columns (one `i32[]` per field), grown together, because
// every pass walks them in order and a column keeps that walk to one array.
// A worker keeps one Doc for every file it formats: `reset` points it at the
// next file and keeps the columns, so memory stays at the largest file's.

import { bytesText, growI32, newI32s, sub32 } from "../core/arr";
import { fault } from "../core/fault";

/** `e - a`, a token's byte length from its offsets (never negative in a token table). */
const docSpan = (a: i32, e: i32): i32 => {
  if (a >= 0 && e >= 0) {
    return e - a;
  }
  return sub32(e, a);
};

/** Formatting options (the LLVM style's knobs this formatter exposes). */
export class Options {
  columnLimit: i32 = 120;
  indentWidth: i32 = 2;
  continuationIndent: i32 = 4;
  accessModifierOffset: i32 = -2;
  sortIncludes: boolean = true;
  reflowComments: boolean = true;
}

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
  plain: i32[]; // 1 when the token's bytes are ASCII with no tab: its columns are its bytes
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
  eqList: i32[]; // 1: a brace clang-format never gives the braced-list kind (a braced list's `}`)
  asmFin: i32[]; // 1: a token inside `__asm { ... }`, kept as written
  hidSemi: i32[]; // 1: tokens another #if pass sees, after this one, hold a `;` for the brace scan
  fap: i32[]; // 1: clang's FirstAfterPPLine, set in any #if pass (see Formatter.scanAfterDirective)
  // Passes so far (this one included) that saw the token; 0 outside passes.
  // clang-format's parameter counts on a bracket are never reset between
  // passes, so they grow with every pass that annotates the bracket again.
  passMul: i32[];
  // clang-format's failed template parses a bracket's whole parse lies in:
  // parseAngle consumes, then backs off and the line is read again, and the
  // bracket's parameter counts are never reset (classify sets it per line).
  angDbl: i32[];
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
  objcLang: boolean = false; // the file's name makes clang-format guess its language (Objective-C when it is)
  objcSeen: boolean = false; // an Objective-C @interface or @protocol body was parsed
  objcOther: boolean = false; // Objective-C this formatter does not lay out (literals, @implementation, ...)
  lObjC: i32[]; // 1 on an Objective-C method declaration's line (clang-format's parseObjCMethod)

  n: i32 = 0;
  ntok: i32 = 0;
  nCR: i32 = 0; // carriage returns and line feeds between tokens, for the line ending
  nLF: i32 = 0;
  strTabs: boolean = false; // a string literal holds a tab
  // Rare features, so hot loops can skip their checks: a token that may be
  // an implicit string literal (a stray character, `\`, `__has_include`),
  // and an `asm` keyword (inline assembly blocks).
  anyImplicit: boolean = false;
  anyAsm: boolean = false;
  anyDefine: boolean = false; // a #define, which mergeDefines looks for
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
    this.kind = newI32s(cap);
    this.start = newI32s(cap);
    this.end = newI32s(cap);
    this.nl = newI32s(cap);
    this.ws = newI32s(cap);
    this.col = newI32s(cap);
    this.width = newI32s(cap);
    this.multi = newI32s(cap);
    this.plain = newI32s(cap);
    this.inPP = newI32s(cap);
    this.ppKind = newI32s(cap);
    this.ppId = newI32s(cap);
    this.unesc = newI32s(cap);
    this.nxt = newI32s(cap);
    this.prv = newI32s(cap);
    this.bk = newI32s(cap);
    this.childHead = newI32s(cap);
    this.childTail = newI32s(cap);
    this.childCount = newI32s(cap);
    this.type = newI32s(cap);
    this.final = newI32s(cap);
    this.eqList = newI32s(cap);
    this.hidSemi = newI32s(cap);
    this.fap = newI32s(cap);
    this.asmFin = newI32s(cap);
    this.passMul = newI32s(cap);
    this.angDbl = newI32s(cap);
    this.keepWs = newI32s(cap);
    this.dec = newI32s(cap);
    this.match = newI32s(cap);
    this.nest = newI32s(cap);
    this.bind = newI32s(cap);
    this.mustBreak = newI32s(cap);
    this.spaces = newI32s(cap);
    const lcap = n / 24 + 32;
    this.lFirst = newI32s(lcap);
    this.lLast = newI32s(lcap);
    this.lLevel = newI32s(lcap);
    this.lPP = newI32s(lcap);
    this.lType = newI32s(lcap);
    this.lMustDecl = newI32s(lcap);
    this.lMightFn = newI32s(lcap);
    this.lMultiVar = newI32s(lcap);
    this.lSibling = newI32s(lcap);
    this.lAbs = newI32s(lcap);
    this.lInlineCmt = newI32s(lcap);
    this.lParent = newI32s(lcap);
    this.lOpen = newI32s(lcap);
    this.lNamespace = newI32s(lcap);
    this.lInvalid = newI32s(lcap);
    this.lInClass = newI32s(lcap);
    this.lRetWrap = newI32s(lcap);
    this.lDefCode = newI32s(lcap);
    this.lObjC = newI32s(lcap);
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
    this.objcSeen = false;
    this.objcOther = false;
  }

  /** Makes room for token `i`. */
  growTokens(i: i32): void {
    if (i < toI32(this.kind.length)) {
      return;
    }
    if (i >= 2147483647) {
      fault();
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
    this.plain = growI32(this.plain, n);
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
    this.fap = growI32(this.fap, n);
    this.asmFin = growI32(this.asmFin, n);
    this.passMul = growI32(this.passMul, n);
    this.angDbl = growI32(this.angDbl, n);
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
    if (i >= 2147483647) {
      fault();
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
    this.lObjC = growI32(this.lObjC, n);
  }

  /** The byte at `i`, or 0 past the end. */
  at(i: i32): i32 {
    const src = this.src;
    if (i < 0 || i >= this.n) {
      return 0;
    }
    if (i < src.length) {
      return toI32(src[i]);
    }
    // `n` is never past the source.
    fault();
    return 0;
  }

  /** Token `t`'s length in bytes. */
  len(t: i32): i32 {
    const start = this.start;
    const end = this.end;
    if (t >= 0 && t < start.length && t < end.length) {
      return docSpan(start[t], end[t]);
    }
    fault();
    return 0;
  }

  /** Whether tokens `a` and `b` have the same text. */
  sameText(a: i32, b: i32): boolean {
    const start = this.start;
    const end = this.end;
    if (a < 0 || a >= start.length || a >= end.length || b < 0 || b >= start.length || b >= end.length) {
      fault();
      return false;
    }
    const sa = start[a];
    const ea = end[a];
    const sb = start[b];
    const eb = end[b];
    const n = docSpan(sa, ea);
    if (n !== docSpan(sb, eb)) {
      return false;
    }
    if (n <= 0) {
      return true;
    }
    const src = this.src;
    // Token bytes lie inside the source.
    if (sa < 0 || ea > src.length || sb < 0 || eb > src.length) {
      fault();
      return false;
    }
    let q = sb;
    for (let p = sa; p < ea; p++) {
      if (q >= eb) {
        return false;
      }
      if (src[p] !== src[q]) {
        return false;
      }
      q++;
    }
    return true;
  }

  /** Token `t`'s text, as a string (allocates; for rare paths). */
  text(t: i32): string {
    const start = this.start;
    const end = this.end;
    if (t >= 0 && t < start.length && t < end.length) {
      return bytesText(this.src, start[t], end[t]);
    }
    fault();
    return "";
  }

  /**
   * clang-format's OriginalColumn of token `t`: its column as written, a tab
   * reaching the next stop of 8 and a character one column (`col` counts
   * bytes).
   */
  origCol(t: i32): i32 {
    const start = this.start;
    const col = this.col;
    const src = this.src;
    if (t < 0 || t >= start.length || t >= col.length) {
      fault();
      return 0;
    }
    const s = start[t];
    const ls = sub32(s, col[t]);
    if (ls >= s) {
      return 0;
    }
    // The line's bytes lie inside the source.
    if (ls < 0 || s > src.length) {
      fault();
      return 0;
    }
    let c = 0;
    for (let k = ls; k < s; k++) {
      const b = src[k];
      if (b === 9) {
        if (c < 0 || c > 2147483639) {
          fault();
          return 0;
        }
        c = c + 8 - (c % 8);
      } else if (b < 0x80 || b >= 0xc0) {
        if (c < 0 || c >= 2147483647) {
          fault();
          return 0;
        }
        c++;
      }
    }
    return c;
  }

  /** Whether token `t`'s text is `s` (no string is made). */
  is(t: i32, s: string): boolean {
    const start = this.start;
    const end = this.end;
    if (t < 0 || t >= start.length || t >= end.length) {
      fault();
      return false;
    }
    const a = start[t];
    const e = end[t];
    const n = docSpan(a, e);
    if (n !== toI32(s.length)) {
      return false;
    }
    if (n === 0) {
      return true;
    }
    const src = this.src;
    // Token bytes lie inside the source.
    if (a < 0 || e > src.length) {
      fault();
      return false;
    }
    let p = a;
    for (let i = 0; i < s.length; i++) {
      if (p >= e) {
        return false;
      }
      if (toI32(src[p]) !== s.charCodeAt(i)) {
        return false;
      }
      p++;
    }
    return true;
  }

  /** Whether the bytes from `i` (before `e`) start with `s`. */
  startsWithAt(i: i32, e: i32, s: string): boolean {
    const n = toI32(s.length);
    if (sub32(e, i) < n) {
      return false;
    }
    if (n === 0) {
      return true;
    }
    const src = this.src;
    // The range lies inside the source.
    if (i < 0 || i > toI32(src.length) - n) {
      fault();
      return false;
    }
    let p = i;
    for (let k = 0; k < s.length; k++) {
      if (p >= src.length) {
        return false;
      }
      if (toI32(src[p]) !== s.charCodeAt(k)) {
        return false;
      }
      p++;
    }
    return true;
  }

  /** The first byte of token `t`. */
  firstByte(t: i32): i32 {
    const start = this.start;
    const src = this.src;
    if (t >= 0 && t < start.length) {
      const a = start[t];
      if (a >= 0 && a < src.length) {
        return toI32(src[a]);
      }
    }
    fault();
    return 0;
  }

  /** The last byte of token `t`. */
  lastByte(t: i32): i32 {
    const end = this.end;
    const src = this.src;
    if (t >= 0 && t < end.length) {
      const e = end[t];
      if (e > 0 && e <= src.length) {
        return toI32(src[e - 1]);
      }
    }
    fault();
    return 0;
  }
}
