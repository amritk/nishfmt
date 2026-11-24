// IntelliJ's PsiBuilder, as the Kotlin parser drives it: markers in a
// production list over the lexemes, whitespace and comments skipped while
// parsing and bound to nodes afterwards by edge binders, then a tree where
// every lexeme is a leaf (the CST the Kotlin PSI is). Together with the
// Kotlin compiler's SemanticWhitespaceAwarePsiBuilderImpl, which joins `?.`,
// `?:` and `!!` and answers whether a newline precedes the current token.
//
// Ported from the IntelliJ platform's PsiBuilderImpl (SDK 251.27812.49, the
// one the Kotlin compiler 2.4.10 builds with) and the Kotlin compiler
// 2.4.10's parser support (Apache License 2.0, Copyright JetBrains s.r.o.).

import { bytesText, growI32 } from "../core/arr";
import { fault } from "../core/fault";
import { KLexemes } from "./lexer";
import {
  T_BLOCK_COMMENT,
  T_COLON,
  T_DOC_COMMENT,
  T_DOT,
  T_ELVIS,
  T_EOL_COMMENT,
  T_ERROR_ELEMENT,
  T_EXCL,
  T_EXCLEXCL,
  T_QUEST,
  T_SAFE_ACCESS,
  T_SHEBANG_COMMENT,
  T_WHITE_SPACE,
  N_CONSTRUCTOR_DELEGATION_CALL,
  N_CONSTRUCTOR_DELEGATION_REFERENCE,
} from "./types";

// Edge binders.
export const B_DEFAULT: i32 = 0;
export const B_PRECEDING_COMMENTS: i32 = 1;
export const B_PRECEDING_DOC_COMMENTS: i32 = 2;
export const B_TRAILING_COMMENTS: i32 = 3;
export const B_PRECEDING_ALL: i32 = 4; // BindAll(false): 0
export const B_TRAILING_ALL: i32 = 5; // BindAll(true): all
export const B_DO_NOT_BIND: i32 = 6;
export const B_PRECEDING_ALL_COMMENTS: i32 = 7; // AllCommentsBinder(false)
export const B_TRAILING_ALL_COMMENTS: i32 = 8; // AllCommentsBinder(true)
export const B_SHEBANG: i32 = 9;

// Production kinds.
const P_START: i32 = 1;
const P_DONE: i32 = 2;

export const isWsOrComment = (t: i32): boolean =>
  t === T_WHITE_SPACE || t === T_EOL_COMMENT || t === T_BLOCK_COMMENT || t === T_DOC_COMMENT || t === T_SHEBANG_COMMENT;

/** The concrete tree: one node per PSI element; leaves are lexemes. */
export class KTree {
  n: i32 = 0;
  type: i32[];
  start: i32[]; // byte offsets
  end: i32[];
  parent: i32[];
  first: i32[];
  last: i32[];
  next: i32[];
  prev: i32[];
  leaf: i32[]; // 1 for a leaf

  constructor() {
    this.type = new Array<i32>(512);
    this.start = new Array<i32>(512);
    this.end = new Array<i32>(512);
    this.parent = new Array<i32>(512);
    this.first = new Array<i32>(512);
    this.last = new Array<i32>(512);
    this.next = new Array<i32>(512);
    this.prev = new Array<i32>(512);
    this.leaf = new Array<i32>(512);
  }

  reset(): void {
    this.n = 0;
  }

  add(type: i32, start: i32, end: i32, parent: i32, isLeaf: boolean): i32 {
    const i = this.n;
    if (i >= toI32(this.type.length)) {
      if (i < 0 || i > 1073741815) {
        fault();
        return -1;
      }
      const c = i * 2 + 16;
      this.type = growI32(this.type, c);
      this.start = growI32(this.start, c);
      this.end = growI32(this.end, c);
      this.parent = growI32(this.parent, c);
      this.first = growI32(this.first, c);
      this.last = growI32(this.last, c);
      this.next = growI32(this.next, c);
      this.prev = growI32(this.prev, c);
      this.leaf = growI32(this.leaf, c);
    }
    const ty = this.type;
    const st = this.start;
    const en = this.end;
    const pa = this.parent;
    const fi = this.first;
    const la = this.last;
    const nx = this.next;
    const pr = this.prev;
    const lf = this.leaf;
    if (
      i < 0 ||
      i >= ty.length ||
      i >= st.length ||
      i >= en.length ||
      i >= pa.length ||
      i >= fi.length ||
      i >= la.length ||
      i >= nx.length ||
      i >= pr.length ||
      i >= lf.length
    ) {
      fault();
      return -1;
    }
    ty[i] = type;
    st[i] = start;
    en[i] = end;
    pa[i] = parent;
    fi[i] = -1;
    la[i] = -1;
    nx[i] = -1;
    pr[i] = -1;
    lf[i] = isLeaf ? 1 : 0;
    if (parent >= 0) {
      if (parent >= la.length || parent >= fi.length) {
        fault();
        return -1;
      }
      const l = la[parent];
      if (l < 0) {
        fi[parent] = i;
      } else if (l < nx.length) {
        nx[l] = i;
        pr[i] = l;
      } else {
        fault();
        return -1;
      }
      la[parent] = i;
    }
    this.n = i + 1;
    return i;
  }

  // Guarded reads of a node's fields. A node index out of range is a broken
  // tree (the old indexing panicked there): the file faults, and the read
  // answers a value that ends any walk over the tree.

  ty(i: i32): i32 {
    const a = this.type;
    if (i >= 0 && i < a.length) {
      return a[i];
    }
    fault();
    return -1;
  }

  st(i: i32): i32 {
    const a = this.start;
    if (i >= 0 && i < a.length) {
      return a[i];
    }
    fault();
    return 0;
  }

  en(i: i32): i32 {
    const a = this.end;
    if (i >= 0 && i < a.length) {
      return a[i];
    }
    fault();
    return 0;
  }

  par(i: i32): i32 {
    const a = this.parent;
    if (i >= 0 && i < a.length) {
      return a[i];
    }
    fault();
    return -1;
  }

  fst(i: i32): i32 {
    const a = this.first;
    if (i >= 0 && i < a.length) {
      return a[i];
    }
    fault();
    return -1;
  }

  lst(i: i32): i32 {
    const a = this.last;
    if (i >= 0 && i < a.length) {
      return a[i];
    }
    fault();
    return -1;
  }

  nxt(i: i32): i32 {
    const a = this.next;
    if (i >= 0 && i < a.length) {
      return a[i];
    }
    fault();
    return -1;
  }

  prv(i: i32): i32 {
    const a = this.prev;
    if (i >= 0 && i < a.length) {
      return a[i];
    }
    fault();
    return -1;
  }

  /** leaf[i]: 1 for a leaf (and after a fault, so no walk descends). */
  lf(i: i32): i32 {
    const a = this.leaf;
    if (i >= 0 && i < a.length) {
      return a[i];
    }
    fault();
    return 1;
  }

  setEnd(i: i32, v: i32): void {
    const a = this.end;
    if (i >= 0 && i < a.length) {
      a[i] = v;
    } else {
      fault();
    }
  }
}

/** xs[i] for a marker or lexeme index; one out of range faults and answers `none`. */
const kbAt = (xs: i32[], i: i32, none: i32): i32 => {
  if (i >= 0 && i < xs.length) {
    return xs[i];
  }
  fault();
  return none;
};

/** xs[i] = v for a marker index; one out of range faults. */
const kbPut = (xs: i32[], i: i32, v: i32): void => {
  if (i >= 0 && i < xs.length) {
    xs[i] = v;
  } else {
    fault();
  }
};

export class KBuilder {
  lx: KLexemes;
  cur: i32 = 0; // the current lexeme (never whitespace or a comment)
  failed: boolean = false;

  // Productions: a doubly linked list of markers.
  nP: i32 = 0;
  pKind: i32[];
  pLex: i32[];
  pType: i32[];
  pBinder: i32[]; // start: left binder; done: right binder
  pOther: i32[]; // start: its done marker; done: its start marker
  pCollapse: i32[];
  pNext: i32[];
  pPrev: i32[];
  head: i32 = -1;
  tail: i32 = -1;

  // SemanticWhitespaceAwarePsiBuilderImpl's stacks.
  newlines: i32[];
  nNewlines: i32 = 0;
  joinComplex: i32[];
  nJoin: i32 = 0;

  tree: KTree;

  constructor(lx: KLexemes) {
    this.lx = lx;
    this.pKind = new Array<i32>(512);
    this.pLex = new Array<i32>(512);
    this.pType = new Array<i32>(512);
    this.pBinder = new Array<i32>(512);
    this.pOther = new Array<i32>(512);
    this.pCollapse = new Array<i32>(512);
    this.pNext = new Array<i32>(512);
    this.pPrev = new Array<i32>(512);
    this.newlines = new Array<i32>(64);
    this.joinComplex = new Array<i32>(64);
    this.tree = new KTree();
  }

  reset(): void {
    this.cur = 0;
    this.failed = false;
    this.nP = 0;
    this.head = -1;
    this.tail = -1;
    this.nNewlines = 0;
    this.nJoin = 0;
    this.pushNewlines(1);
    this.pushJoin(1);
    // The root marker is made before whitespace is skipped (PsiBuilderImpl.mark
    // skips only once the production list is not empty).
  }

  // ---- Lexer access ----------------------------------------------------------

  // The lexer's arrays hold at least `lx.count` lexemes, so a lexeme index
  // below the count is in range; one that is not faults.

  /** lx.type[i] for a lexeme index; -1 after a fault. */
  private lt(i: i32): i32 {
    const a = this.lx.type;
    if (i >= 0 && i < a.length) {
      return a[i];
    }
    fault();
    return -1;
  }

  /** lx.start[i] for a lexeme index. */
  private ls(i: i32): i32 {
    const a = this.lx.start;
    if (i >= 0 && i < a.length) {
      return a[i];
    }
    fault();
    return 0;
  }

  /** lx.end[i] for a lexeme index. */
  private le(i: i32): i32 {
    const a = this.lx.end;
    if (i >= 0 && i < a.length) {
      return a[i];
    }
    fault();
    return 0;
  }

  private skipWs(): void {
    const lx = this.lx;
    const ty = lx.type;
    const cnt = lx.count;
    let c = this.cur;
    while (c < cnt) {
      if (c < 0 || c >= ty.length) {
        fault();
        break;
      }
      if (!isWsOrComment(ty[c])) {
        break;
      }
      c++;
    }
    this.cur = c;
  }

  /** A truncated builder's end (TruncatedSemanticWhitespaceAwarePsiBuilder), -1 for none. */
  eofLimit: i32 = -1;

  eof(): boolean {
    const c = this.cur;
    if (c >= this.lx.count) {
      return true;
    }
    return this.eofLimit >= 0 && this.ls(c) >= this.eofLimit;
  }

  /** The raw type at the current lexeme (PsiBuilderImpl.getTokenType), or -1 at EOF. */
  rawTokenType(): i32 {
    const c = this.cur;
    return c < this.lx.count ? this.lt(c) : -1;
  }

  /** The raw lexeme type `steps` from the current one (whitespace included), or -1. */
  rawLookup(steps: i32): i32 {
    const i = toI64(this.cur) + toI64(steps);
    if (i >= toI64(0) && i < toI64(this.lx.count)) {
      return this.lt(toI32(i));
    }
    return -1;
  }

  /** The start offset of the lexeme `steps` from the current one. */
  rawTokenTypeStart(steps: i32): i32 {
    const i = toI64(this.cur) + toI64(steps);
    if (i < toI64(0)) {
      return 0;
    }
    if (i >= toI64(this.lx.count)) {
      return this.lx.n;
    }
    return this.ls(toI32(i));
  }

  /**
   * The lexeme `steps` non-whitespace tokens ahead (PsiBuilderImpl.lookAhead);
   * one at or past `lx.count` is past the end, however far.
   */
  private aheadIndex(steps: i32): i32 {
    const lx = this.lx;
    const ty = lx.type;
    const cnt = lx.count;
    let i = this.cur;
    let k = steps;
    while (k > 0) {
      if (i >= cnt) {
        break;
      }
      i++;
      while (i < cnt) {
        if (i < 0 || i >= ty.length) {
          fault();
          return cnt;
        }
        if (!isWsOrComment(ty[i])) {
          break;
        }
        i++;
      }
      k--;
    }
    return i;
  }

  /** The type `steps` non-whitespace tokens ahead (PsiBuilderImpl.lookAhead), or -1. */
  private rawLookAhead(steps: i32): i32 {
    const i = this.aheadIndex(steps);
    return i < this.lx.count ? this.lt(i) : -1;
  }

  private joining(): boolean {
    const j = this.joinComplex;
    const k = this.nJoin;
    if (k > 0 && k <= j.length) {
      return j[k - 1] === 1;
    }
    fault();
    return false;
  }

  /** SemanticWhitespaceAwarePsiBuilderImpl.getTokenType: `?.`, `?:` and `!!` joined. */
  tt(): i32 {
    const c = this.cur;
    const lx = this.lx;
    if (c >= lx.count) {
      return -1;
    }
    if (this.eofLimit >= 0 && this.ls(c) >= this.eofLimit) {
      return -1;
    }
    const raw = this.lt(c);
    if ((raw !== T_QUEST && raw !== T_EXCL) || !this.joining()) {
      return raw;
    }
    return this.joined(raw, 1);
  }

  private joined(raw: i32, steps: i32): i32 {
    if (raw === T_QUEST) {
      const nx = this.rawLookup(steps);
      if (nx === T_DOT) {
        return T_SAFE_ACCESS;
      }
      if (nx === T_COLON) {
        return T_ELVIS;
      }
    } else if (raw === T_EXCL) {
      const nx = this.rawLookup(steps);
      if (nx === T_EXCL) {
        return T_EXCLEXCL;
      }
    }
    return raw;
  }

  /** lookAhead(steps) with joined complex tokens. */
  lookAhead(steps: i32): i32 {
    if (this.eofLimit >= 0) {
      // TruncatedSemanticWhitespaceAwarePsiBuilder.lookAhead: raw, and null past the end.
      if (this.eof()) {
        return -1;
      }
      const lx = this.lx;
      const i = this.aheadIndex(steps);
      const st = i < lx.count ? this.ls(i) : lx.n;
      if (st >= this.eofLimit) {
        return -1;
      }
      return i < lx.count ? this.lt(i) : -1;
    }
    if (!this.joining()) {
      return this.rawLookAhead(steps);
    }
    const t = this.tt();
    if (t === T_SAFE_ACCESS || t === T_ELVIS || t === T_EXCLEXCL) {
      if (steps >= 2147483647) {
        fault();
        return -1;
      }
      return this.rawLookAhead(steps + 1);
    }
    // getJoinedTokenType(super.lookAhead(steps), 2): the raw lookup is relative to the current token.
    const la = this.rawLookAhead(steps);
    if (la === T_QUEST || la === T_EXCL) {
      return this.joined(la, 2);
    }
    return la;
  }

  advanceLexer(): void {
    if (this.eof()) {
      return;
    }
    if (this.joining()) {
      const t = this.tt();
      if (t === T_SAFE_ACCESS || t === T_ELVIS || t === T_EXCLEXCL) {
        const m = this.mark();
        this.rawAdvance();
        this.rawAdvance();
        this.collapse(m, t);
        return;
      }
    }
    this.rawAdvance();
  }

  private rawAdvance(): void {
    const c = this.cur;
    if (c < this.lx.count) {
      this.cur = c + 1;
    }
    this.skipWs();
  }

  remapCurrentToken(t: i32): void {
    const c = this.cur;
    if (c < this.lx.count) {
      kbPut(this.lx.type, c, t);
    }
  }

  tokenStart(): i32 {
    const c = this.cur;
    return c < this.lx.count ? this.ls(c) : this.lx.n;
  }

  tokenEnd(): i32 {
    const c = this.cur;
    return c < this.lx.count ? this.le(c) : this.lx.n;
  }

  /** Whether the current token's text is `s`. */
  tokenIs(s: string): boolean {
    const c = this.cur;
    if (c >= this.lx.count) {
      return false;
    }
    const a = this.ls(c);
    const e = this.le(c);
    const k = toI32(s.length);
    if (toI64(e) - toI64(a) !== toI64(k)) {
      return false;
    }
    const src = this.lx.src;
    let j = a;
    for (let i = 0; i < k; i++) {
      if (j < 0 || j >= src.length) {
        fault();
        return false;
      }
      if (toI32(src[j]) !== s.charCodeAt(i)) {
        return false;
      }
      j++;
    }
    return true;
  }

  tokenText(): string {
    const c = this.cur;
    if (c >= this.lx.count) {
      return "";
    }
    return bytesText(this.lx.src, this.ls(c), this.le(c));
  }

  /** The current offset (getCurrentOffset). */
  currentOffset(): i32 {
    return this.tokenStart();
  }

  /** newlineBeforeCurrentToken. */
  newlineBefore(): boolean {
    const nl = this.newlines;
    const k = this.nNewlines;
    if (k <= 0 || k > nl.length) {
      fault();
      return false;
    }
    if (nl[k - 1] === 0) {
      return false;
    }
    if (this.eof()) {
      return true;
    }
    const src = this.lx.src;
    let i = this.cur;
    while (i > 0) {
      i--;
      const t = this.lt(i);
      if (t === T_BLOCK_COMMENT || t === T_DOC_COMMENT || t === T_EOL_COMMENT || t === T_SHEBANG_COMMENT) {
        continue;
      }
      if (t !== T_WHITE_SPACE) {
        break;
      }
      const e = this.le(i);
      for (let j = this.ls(i); j < e; j++) {
        if (j < 0 || j >= src.length) {
          fault();
          return false;
        }
        if (toI32(src[j]) === 10) {
          return true;
        }
      }
    }
    return false;
  }

  private pushNewlines(v: i32): void {
    const k = this.nNewlines;
    if (k >= toI32(this.newlines.length)) {
      if (k < 0 || k > 1073741819) {
        fault();
        return;
      }
      this.newlines = growI32(this.newlines, k * 2 + 8);
    }
    const a = this.newlines;
    if (k < 0 || k >= a.length) {
      fault();
      return;
    }
    a[k] = v;
    this.nNewlines = k + 1;
  }

  disableNewlines(): void {
    this.pushNewlines(0);
  }

  enableNewlines(): void {
    this.pushNewlines(1);
  }

  restoreNewlinesState(): void {
    const k = this.nNewlines;
    if (k > 1) {
      this.nNewlines = k - 1;
    }
  }

  private pushJoin(v: i32): void {
    const k = this.nJoin;
    if (k >= toI32(this.joinComplex.length)) {
      if (k < 0 || k > 1073741819) {
        fault();
        return;
      }
      this.joinComplex = growI32(this.joinComplex, k * 2 + 8);
    }
    const a = this.joinComplex;
    if (k < 0 || k >= a.length) {
      fault();
      return;
    }
    a[k] = v;
    this.nJoin = k + 1;
  }

  enableJoiningComplexTokens(): void {
    this.pushJoin(1);
  }

  disableJoiningComplexTokens(): void {
    this.pushJoin(0);
  }

  restoreJoiningComplexTokensState(): void {
    const k = this.nJoin;
    if (k > 1) {
      this.nJoin = k - 1;
    }
  }

  // ---- Markers ---------------------------------------------------------------

  private newP(kind: i32, lex: i32): i32 {
    const i = this.nP;
    if (i >= toI32(this.pKind.length)) {
      if (i < 0 || i > 1073741815) {
        fault();
        return -1;
      }
      const c = i * 2 + 16;
      this.pKind = growI32(this.pKind, c);
      this.pLex = growI32(this.pLex, c);
      this.pType = growI32(this.pType, c);
      this.pBinder = growI32(this.pBinder, c);
      this.pOther = growI32(this.pOther, c);
      this.pCollapse = growI32(this.pCollapse, c);
      this.pNext = growI32(this.pNext, c);
      this.pPrev = growI32(this.pPrev, c);
    }
    const pk = this.pKind;
    const pl = this.pLex;
    const pt = this.pType;
    const pb = this.pBinder;
    const po = this.pOther;
    const pc = this.pCollapse;
    const pn = this.pNext;
    const pp = this.pPrev;
    if (
      i < 0 ||
      i >= pk.length ||
      i >= pl.length ||
      i >= pt.length ||
      i >= pb.length ||
      i >= po.length ||
      i >= pc.length ||
      i >= pn.length ||
      i >= pp.length
    ) {
      fault();
      return -1;
    }
    pk[i] = kind;
    pl[i] = lex;
    pt[i] = 0;
    pb[i] = B_DEFAULT;
    po[i] = -1;
    pc[i] = 0;
    pn[i] = -1;
    pp[i] = -1;
    this.nP = i + 1;
    return i;
  }

  private append(p: i32): void {
    kbPut(this.pPrev, p, this.tail);
    kbPut(this.pNext, p, -1);
    if (this.tail >= 0) {
      kbPut(this.pNext, this.tail, p);
    } else {
      this.head = p;
    }
    this.tail = p;
  }

  private insertBefore(p: i32, before: i32): void {
    const pr = kbAt(this.pPrev, before, -1);
    kbPut(this.pPrev, p, pr);
    kbPut(this.pNext, p, before);
    kbPut(this.pPrev, before, p);
    if (pr >= 0) {
      kbPut(this.pNext, pr, p);
    } else {
      this.head = p;
    }
  }

  private unlink(p: i32): void {
    const pr = kbAt(this.pPrev, p, -1);
    const nx = kbAt(this.pNext, p, -1);
    if (pr >= 0) {
      kbPut(this.pNext, pr, nx);
    } else {
      this.head = nx;
    }
    if (nx >= 0) {
      kbPut(this.pPrev, nx, pr);
    } else {
      this.tail = pr;
    }
  }

  mark(): i32 {
    if (this.head >= 0) {
      this.skipWs();
    }
    const m = this.newP(P_START, this.cur);
    this.append(m);
    if (this.head === m) {
      this.skipWs();
    }
    return m;
  }

  done(m: i32, type: i32): void {
    // processDone: an empty element of a left-bound type sticks to what precedes it.
    if (
      (type === N_CONSTRUCTOR_DELEGATION_CALL || type === N_CONSTRUCTOR_DELEGATION_REFERENCE) &&
      this.isEmptyRange(kbAt(this.pLex, m, 0), this.cur)
    ) {
      kbPut(this.pBinder, m, B_DO_NOT_BIND);
    }
    const d = this.newP(P_DONE, this.cur);
    kbPut(this.pType, m, type);
    kbPut(this.pType, d, type);
    kbPut(this.pOther, m, d);
    kbPut(this.pOther, d, m);
    this.append(d);
  }

  private isEmptyRange(a: i32, b: i32): boolean {
    for (let i = a; i < b; i++) {
      if (!isWsOrComment(this.lt(i))) {
        return false;
      }
    }
    return true;
  }

  collapse(m: i32, type: i32): void {
    this.done(m, type);
    kbPut(this.pCollapse, m, 1);
  }

  /** marker.error(message): an error element; the file does not parse. */
  errorMarker(m: i32): void {
    this.done(m, T_ERROR_ELEMENT);
  }

  /** builder.error(message): an empty error element here. */
  error(): void {
    const m = this.mark();
    this.done(m, T_ERROR_ELEMENT);
  }

  drop(m: i32): void {
    this.unlink(m);
  }

  rollbackTo(m: i32): void {
    this.cur = kbAt(this.pLex, m, 0);
    // Remove m and everything after it.
    const pr = kbAt(this.pPrev, m, -1);
    if (pr >= 0) {
      kbPut(this.pNext, pr, -1);
    } else {
      this.head = -1;
    }
    this.tail = pr;
  }

  precede(m: i32): i32 {
    const p = this.newP(P_START, kbAt(this.pLex, m, 0));
    this.insertBefore(p, m);
    return p;
  }

  doneBefore(m: i32, type: i32, before: i32): void {
    const d = this.newP(P_DONE, kbAt(this.pLex, before, 0));
    kbPut(this.pType, m, type);
    kbPut(this.pType, d, type);
    kbPut(this.pOther, m, d);
    kbPut(this.pOther, d, m);
    this.insertBefore(d, before);
  }

  setBinders(m: i32, left: i32, right: i32): void {
    kbPut(this.pBinder, m, left);
    const d = kbAt(this.pOther, m, -1);
    if (d >= 0) {
      kbPut(this.pBinder, d, right);
    }
  }

  /** The lexeme index of a marker (for "has anything been parsed since"). */
  lexOf(m: i32): i32 {
    return kbAt(this.pLex, m, 0);
  }

  // ---- Whitespace balancing and the tree --------------------------------------

  /** WhitespacesAndCommentsBinder.getEdgePosition over lexemes [a, b). */
  private edge(binder: i32, a: i32, b: i32, isStart: boolean): i32 {
    if (a < 0 || b < 0) {
      // Lexeme indexes are never negative.
      fault();
      return 0;
    }
    const size = b - a;
    if (binder === B_DEFAULT) {
      return isStart ? size : 0;
    }
    if (size === 0) {
      return 0;
    }
    // The last offset into [a, b), for the scans from the back.
    let back = -1;
    if (size > 0) {
      back = size - 1;
    }
    if (binder === B_PRECEDING_DOC_COMMENTS || binder === B_PRECEDING_COMMENTS) {
      // a + i < b for every i below size, so the u32 sums are exact.
      for (let i = back; i >= 0; i--) {
        if (this.lt(toI32(toU32(a) + toU32(i))) === T_DOC_COMMENT) {
          return i;
        }
      }
      if (binder === B_PRECEDING_DOC_COMMENTS) {
        return size;
      }
      let result = size;
      for (let i = back; i >= 0; i--) {
        const j = toI32(toU32(a) + toU32(i));
        const t = this.lt(j);
        if (t === T_WHITE_SPACE) {
          if (this.lineBreaks(j) > 1) {
            break;
          }
        } else if (t === T_EOL_COMMENT || t === T_BLOCK_COMMENT || t === T_DOC_COMMENT || t === T_SHEBANG_COMMENT) {
          if (i === 0) {
            result = i;
          } else {
            const j1 = toI32(toU32(a) + toU32(i - 1));
            if (this.lt(j1) === T_WHITE_SPACE && this.lineBreaks(j1) > 0) {
              result = i;
            }
          }
        } else {
          break;
        }
      }
      return result;
    }
    if (binder === B_TRAILING_COMMENTS) {
      let result = 0;
      for (let i = 0; i < size; i++) {
        const j = toI32(toU32(a) + toU32(i));
        const t = this.lt(j);
        if (t === T_WHITE_SPACE) {
          if (this.lineBreaks(j) > 0) {
            break;
          }
        } else if (t === T_EOL_COMMENT || t === T_BLOCK_COMMENT) {
          result = i + 1;
        } else {
          break;
        }
      }
      return result;
    }
    if (binder === B_PRECEDING_ALL) {
      return 0;
    }
    if (binder === B_TRAILING_ALL) {
      return size;
    }
    if (binder === B_DO_NOT_BIND) {
      return 0;
    }
    if (binder === B_PRECEDING_ALL_COMMENTS) {
      return this.lt(a) === T_WHITE_SPACE ? 1 : 0;
    }
    if (binder === B_TRAILING_ALL_COMMENTS) {
      if (this.lt(b - 1) === T_WHITE_SPACE) {
        // b - a - 1, which with a and b non-negative fits.
        return toI32(toI64(size) - toI64(1));
      }
      return size;
    }
    if (binder === B_SHEBANG) {
      if (this.lt(a) === T_SHEBANG_COMMENT) {
        // a + 1 < b, so the u32 sum is exact.
        return size > 1 && this.lt(toI32(toU32(a) + toU32(1))) === T_WHITE_SPACE ? 2 : 1;
      }
      return 0;
    }
    return isStart ? size : 0;
  }

  private lineBreaks(i: i32): i32 {
    const src = this.lx.src;
    const e = this.le(i);
    let n = 0;
    for (let j = this.ls(i); j < e; j++) {
      if (j < 0 || j >= src.length) {
        fault();
        return 0;
      }
      if (toI32(src[j]) === 10) {
        // n counts bytes of src, so it is below its length.
        if (n >= src.length) {
          fault();
          return 0;
        }
        n++;
      }
    }
    return n;
  }

  /** PsiBuilderImpl.balanceWhiteSpaces. */
  private balance(): void {
    const lx = this.lx;
    let lastIndex = 0;
    let p = this.head;
    if (p < 0) {
      return;
    }
    let prev = p;
    p = kbAt(this.pNext, p, -1);
    while (p >= 0 && p !== this.tail) {
      const prevLex = kbAt(this.pLex, prev, 0);
      const lexP = kbAt(this.pLex, p, 0);
      let wsStart = lexP > lastIndex ? lexP : lastIndex;
      while (wsStart > prevLex && wsStart > 0 && isWsOrComment(this.lt(wsStart - 1))) {
        wsStart--;
      }
      let wsEnd = lexP;
      while (wsEnd < lx.count && isWsOrComment(this.lt(wsEnd))) {
        wsEnd++;
      }
      if (wsStart !== wsEnd) {
        const r = this.edge(kbAt(this.pBinder, p, 0), wsStart, wsEnd, kbAt(this.pKind, p, 0) === P_START);
        const at = toI64(wsStart) + toI64(r);
        if (at < toI64(-2147483648) || at > toI64(2147483647)) {
          fault();
          return;
        }
        kbPut(this.pLex, p, toI32(at));
      } else if (lexP < wsStart) {
        kbPut(this.pLex, p, wsStart);
      }
      lastIndex = kbAt(this.pLex, p, 0);
      prev = p;
      p = kbAt(this.pNext, p, -1);
    }
  }

  /** Builds the tree from the productions; answers the root. */
  build(): i32 {
    // Any error element left means the file does not parse.
    for (let q = this.head; q >= 0; q = kbAt(this.pNext, q, -1)) {
      if (kbAt(this.pType, q, 0) === T_ERROR_ELEMENT) {
        this.failed = true;
        return 0;
      }
    }
    this.balance();
    const tr = this.tree;
    const lx = this.lx;
    tr.reset();
    let lexI = 0;
    const stack: i32[] = [];
    let p = this.head;
    while (p >= 0) {
      const lex = kbAt(this.pLex, p, 0);
      let top = -1;
      const ns = stack.length;
      if (ns > 0) {
        top = stack[ns - 1];
      }
      // Leaves up to this marker.
      while (lexI < lex && top >= 0) {
        tr.add(this.lt(lexI), this.ls(lexI), this.le(lexI), top, true);
        lexI++;
      }
      if (kbAt(this.pKind, p, 0) === P_START) {
        if (kbAt(this.pCollapse, p, 0) === 1) {
          const d = kbAt(this.pOther, p, -1);
          const e = kbAt(this.pLex, d, 0);
          const a = lexI < lx.count ? this.ls(lexI) : lx.n;
          let b = a;
          if (e > lexI && e > 0) {
            b = this.le(e - 1);
          }
          tr.add(kbAt(this.pType, p, 0), a, b, top, true);
          lexI = e;
          // Skip to after the collapsed marker's done.
          p = kbAt(this.pNext, d, -1);
          continue;
        }
        const a = lexI < lx.count ? this.ls(lexI) : lx.n;
        const node = tr.add(kbAt(this.pType, p, 0), a, a, top, false);
        stack.push(node);
      } else {
        let node = -1;
        if (stack.length > 0) {
          node = stack.pop();
        } else {
          // A done marker with no start open: the old pop panicked here.
          fault();
          return 0;
        }
        let end = 0;
        if (lexI > 0) {
          end = this.le(lexI - 1);
        }
        const st = tr.st(node);
        tr.setEnd(node, end < st ? st : end);
        if (stack.length === 0) {
          // The root: take every remaining lexeme.
          while (lexI < lx.count) {
            tr.add(this.lt(lexI), this.ls(lexI), this.le(lexI), node, true);
            lexI++;
          }
          tr.setEnd(node, lx.n);
        }
      }
      p = kbAt(this.pNext, p, -1);
    }
    return 0;
  }
}
