// IntelliJ's PsiBuilder, as the Kotlin parser drives it: markers in a
// production list over the lexemes, whitespace and comments skipped while
// parsing and bound to nodes afterwards by edge binders, then a tree where
// every lexeme is a leaf (the CST the Kotlin PSI is). Together with the
// Kotlin compiler's SemanticWhitespaceAwarePsiBuilderImpl, which joins `?.`,
// `?:` and `!!` and answers whether a newline precedes the current token.
//
// Ported from the IntelliJ platform's PsiBuilderImpl and the Kotlin
// compiler's parser support (Apache License 2.0, Copyright JetBrains s.r.o.).

import { growI32 } from "../core/arr";
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
    const c = 4096;
    this.type = new Array<i32>(c);
    this.start = new Array<i32>(c);
    this.end = new Array<i32>(c);
    this.parent = new Array<i32>(c);
    this.first = new Array<i32>(c);
    this.last = new Array<i32>(c);
    this.next = new Array<i32>(c);
    this.prev = new Array<i32>(c);
    this.leaf = new Array<i32>(c);
  }

  reset(): void {
    this.n = 0;
  }

  add(type: i32, start: i32, end: i32, parent: i32, isLeaf: boolean): i32 {
    const i = this.n;
    if (i >= toI32(this.type.length)) {
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
    this.type[i] = type;
    this.start[i] = start;
    this.end[i] = end;
    this.parent[i] = parent;
    this.first[i] = -1;
    this.last[i] = -1;
    this.next[i] = -1;
    this.prev[i] = -1;
    this.leaf[i] = isLeaf ? 1 : 0;
    if (parent >= 0) {
      const l = this.last[parent];
      if (l < 0) {
        this.first[parent] = i;
      } else {
        this.next[l] = i;
        this.prev[i] = l;
      }
      this.last[parent] = i;
    }
    this.n = i + 1;
    return i;
  }
}

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
    const c = 4096;
    this.pKind = new Array<i32>(c);
    this.pLex = new Array<i32>(c);
    this.pType = new Array<i32>(c);
    this.pBinder = new Array<i32>(c);
    this.pOther = new Array<i32>(c);
    this.pCollapse = new Array<i32>(c);
    this.pNext = new Array<i32>(c);
    this.pPrev = new Array<i32>(c);
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

  private skipWs(): void {
    const lx = this.lx;
    while (this.cur < lx.count && isWsOrComment(lx.type[this.cur])) {
      this.cur = this.cur + 1;
    }
  }

  /** A truncated builder's end (TruncatedSemanticWhitespaceAwarePsiBuilder), -1 for none. */
  eofLimit: i32 = -1;

  eof(): boolean {
    if (this.cur >= this.lx.count) {
      return true;
    }
    return this.eofLimit >= 0 && this.lx.start[this.cur] >= this.eofLimit;
  }

  /** The raw type at the current lexeme (PsiBuilderImpl.getTokenType), or -1 at EOF. */
  rawTokenType(): i32 {
    return this.cur < this.lx.count ? this.lx.type[this.cur] : -1;
  }

  /** The raw lexeme type `steps` from the current one (whitespace included), or -1. */
  rawLookup(steps: i32): i32 {
    const i = this.cur + steps;
    return i >= 0 && i < this.lx.count ? this.lx.type[i] : -1;
  }

  /** The start offset of the lexeme `steps` from the current one. */
  rawTokenTypeStart(steps: i32): i32 {
    const i = this.cur + steps;
    if (i < 0) {
      return 0;
    }
    if (i >= this.lx.count) {
      return this.lx.n;
    }
    return this.lx.start[i];
  }

  /** The type `steps` non-whitespace tokens ahead (PsiBuilderImpl.lookAhead), or -1. */
  private rawLookAhead(steps: i32): i32 {
    const lx = this.lx;
    let i = this.cur;
    let k = steps;
    while (k > 0) {
      i++;
      while (i < lx.count && isWsOrComment(lx.type[i])) {
        i++;
      }
      k--;
    }
    return i < lx.count ? lx.type[i] : -1;
  }

  private joining(): boolean {
    return this.joinComplex[this.nJoin - 1] === 1;
  }

  /** SemanticWhitespaceAwarePsiBuilderImpl.getTokenType: `?.`, `?:` and `!!` joined. */
  tt(): i32 {
    if (this.eofLimit >= 0 && this.eof()) {
      return -1;
    }
    const raw = this.rawTokenType();
    if (!this.joining()) {
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
      let i = this.cur;
      let k = steps;
      while (k > 0) {
        i++;
        while (i < lx.count && isWsOrComment(lx.type[i])) {
          i++;
        }
        k--;
      }
      const st = i < lx.count ? lx.start[i] : lx.n;
      if (st >= this.eofLimit) {
        return -1;
      }
      return i < lx.count ? lx.type[i] : -1;
    }
    if (!this.joining()) {
      return this.rawLookAhead(steps);
    }
    const t = this.tt();
    if (t === T_SAFE_ACCESS || t === T_ELVIS || t === T_EXCLEXCL) {
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
    if (this.cur < this.lx.count) {
      this.cur = this.cur + 1;
    }
    this.skipWs();
  }

  remapCurrentToken(t: i32): void {
    if (this.cur < this.lx.count) {
      this.lx.type[this.cur] = t;
    }
  }

  tokenStart(): i32 {
    return this.cur < this.lx.count ? this.lx.start[this.cur] : this.lx.n;
  }

  tokenEnd(): i32 {
    return this.cur < this.lx.count ? this.lx.end[this.cur] : this.lx.n;
  }

  /** Whether the current token's text is `s`. */
  tokenIs(s: string): boolean {
    if (this.cur >= this.lx.count) {
      return false;
    }
    const a = this.lx.start[this.cur];
    const e = this.lx.end[this.cur];
    const k = toI32(s.length);
    if (e - a !== k) {
      return false;
    }
    for (let i = 0; i < k; i++) {
      if (toI32(this.lx.src[a + i]) !== s.charCodeAt(i)) {
        return false;
      }
    }
    return true;
  }

  tokenText(): string {
    if (this.cur >= this.lx.count) {
      return "";
    }
    return String.fromBytes(this.lx.src, this.lx.start[this.cur], this.lx.end[this.cur]);
  }

  /** The current offset (getCurrentOffset). */
  currentOffset(): i32 {
    return this.tokenStart();
  }

  /** newlineBeforeCurrentToken. */
  newlineBefore(): boolean {
    if (this.newlines[this.nNewlines - 1] === 0) {
      return false;
    }
    if (this.eof()) {
      return true;
    }
    const lx = this.lx;
    for (let i = this.cur - 1; i >= 0; i--) {
      const t = lx.type[i];
      if (t === T_BLOCK_COMMENT || t === T_DOC_COMMENT || t === T_EOL_COMMENT || t === T_SHEBANG_COMMENT) {
        continue;
      }
      if (t !== T_WHITE_SPACE) {
        break;
      }
      for (let j = lx.start[i]; j < lx.end[i]; j++) {
        if (toI32(lx.src[j]) === 10) {
          return true;
        }
      }
    }
    return false;
  }

  private pushNewlines(v: i32): void {
    if (this.nNewlines >= toI32(this.newlines.length)) {
      this.newlines = growI32(this.newlines, this.nNewlines * 2 + 8);
    }
    this.newlines[this.nNewlines] = v;
    this.nNewlines = this.nNewlines + 1;
  }

  disableNewlines(): void {
    this.pushNewlines(0);
  }

  enableNewlines(): void {
    this.pushNewlines(1);
  }

  restoreNewlinesState(): void {
    if (this.nNewlines > 1) {
      this.nNewlines = this.nNewlines - 1;
    }
  }

  private pushJoin(v: i32): void {
    if (this.nJoin >= toI32(this.joinComplex.length)) {
      this.joinComplex = growI32(this.joinComplex, this.nJoin * 2 + 8);
    }
    this.joinComplex[this.nJoin] = v;
    this.nJoin = this.nJoin + 1;
  }

  enableJoiningComplexTokens(): void {
    this.pushJoin(1);
  }

  disableJoiningComplexTokens(): void {
    this.pushJoin(0);
  }

  restoreJoiningComplexTokensState(): void {
    if (this.nJoin > 1) {
      this.nJoin = this.nJoin - 1;
    }
  }

  // ---- Markers ---------------------------------------------------------------

  private newP(kind: i32, lex: i32): i32 {
    const i = this.nP;
    if (i >= toI32(this.pKind.length)) {
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
    this.pKind[i] = kind;
    this.pLex[i] = lex;
    this.pType[i] = 0;
    this.pBinder[i] = B_DEFAULT;
    this.pOther[i] = -1;
    this.pCollapse[i] = 0;
    this.pNext[i] = -1;
    this.pPrev[i] = -1;
    this.nP = i + 1;
    return i;
  }

  private append(p: i32): void {
    this.pPrev[p] = this.tail;
    this.pNext[p] = -1;
    if (this.tail >= 0) {
      this.pNext[this.tail] = p;
    } else {
      this.head = p;
    }
    this.tail = p;
  }

  private insertBefore(p: i32, before: i32): void {
    const pr = this.pPrev[before];
    this.pPrev[p] = pr;
    this.pNext[p] = before;
    this.pPrev[before] = p;
    if (pr >= 0) {
      this.pNext[pr] = p;
    } else {
      this.head = p;
    }
  }

  private unlink(p: i32): void {
    const pr = this.pPrev[p];
    const nx = this.pNext[p];
    if (pr >= 0) {
      this.pNext[pr] = nx;
    } else {
      this.head = nx;
    }
    if (nx >= 0) {
      this.pPrev[nx] = pr;
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
    if ((type === N_CONSTRUCTOR_DELEGATION_CALL || type === N_CONSTRUCTOR_DELEGATION_REFERENCE) && this.isEmptyRange(this.pLex[m], this.cur)) {
      this.pBinder[m] = B_DO_NOT_BIND;
    }
    const d = this.newP(P_DONE, this.cur);
    this.pType[m] = type;
    this.pType[d] = type;
    this.pOther[m] = d;
    this.pOther[d] = m;
    this.append(d);
  }

  private isEmptyRange(a: i32, b: i32): boolean {
    for (let i = a; i < b; i++) {
      if (!isWsOrComment(this.lx.type[i])) {
        return false;
      }
    }
    return true;
  }

  collapse(m: i32, type: i32): void {
    this.done(m, type);
    this.pCollapse[m] = 1;
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
    this.cur = this.pLex[m];
    // Remove m and everything after it.
    const pr = this.pPrev[m];
    if (pr >= 0) {
      this.pNext[pr] = -1;
    } else {
      this.head = -1;
    }
    this.tail = pr;
  }

  precede(m: i32): i32 {
    const p = this.newP(P_START, this.pLex[m]);
    this.insertBefore(p, m);
    return p;
  }

  doneBefore(m: i32, type: i32, before: i32): void {
    const d = this.newP(P_DONE, this.pLex[before]);
    this.pType[m] = type;
    this.pType[d] = type;
    this.pOther[m] = d;
    this.pOther[d] = m;
    this.insertBefore(d, before);
  }

  setBinders(m: i32, left: i32, right: i32): void {
    this.pBinder[m] = left;
    const d = this.pOther[m];
    if (d >= 0) {
      this.pBinder[d] = right;
    }
  }

  /** The lexeme index of a marker (for "has anything been parsed since"). */
  lexOf(m: i32): i32 {
    return this.pLex[m];
  }

  // ---- Whitespace balancing and the tree --------------------------------------

  /** WhitespacesAndCommentsBinder.getEdgePosition over lexemes [a, b). */
  private edge(binder: i32, a: i32, b: i32, isStart: boolean): i32 {
    const lx = this.lx;
    const size = b - a;
    if (binder === B_DEFAULT) {
      return isStart ? size : 0;
    }
    if (size === 0) {
      return 0;
    }
    if (binder === B_PRECEDING_DOC_COMMENTS || binder === B_PRECEDING_COMMENTS) {
      for (let i = size - 1; i >= 0; i--) {
        if (lx.type[a + i] === T_DOC_COMMENT) {
          return i;
        }
      }
      if (binder === B_PRECEDING_DOC_COMMENTS) {
        return size;
      }
      let result = size;
      for (let i = size - 1; i >= 0; i--) {
        const t = lx.type[a + i];
        if (t === T_WHITE_SPACE) {
          if (this.lineBreaks(a + i) > 1) {
            break;
          }
        } else if (t === T_EOL_COMMENT || t === T_BLOCK_COMMENT || t === T_DOC_COMMENT || t === T_SHEBANG_COMMENT) {
          if (i === 0 || (lx.type[a + i - 1] === T_WHITE_SPACE && this.lineBreaks(a + i - 1) > 0)) {
            result = i;
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
        const t = lx.type[a + i];
        if (t === T_WHITE_SPACE) {
          if (this.lineBreaks(a + i) > 0) {
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
      return lx.type[a] === T_WHITE_SPACE ? 1 : 0;
    }
    if (binder === B_TRAILING_ALL_COMMENTS) {
      return lx.type[b - 1] === T_WHITE_SPACE ? size - 1 : size;
    }
    if (binder === B_SHEBANG) {
      if (lx.type[a] === T_SHEBANG_COMMENT) {
        return size > 1 && lx.type[a + 1] === T_WHITE_SPACE ? 2 : 1;
      }
      return 0;
    }
    return isStart ? size : 0;
  }

  private lineBreaks(i: i32): i32 {
    let n = 0;
    for (let j = this.lx.start[i]; j < this.lx.end[i]; j++) {
      if (toI32(this.lx.src[j]) === 10) {
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
    p = this.pNext[p];
    while (p >= 0 && p !== this.tail) {
      const prevLex = this.pLex[prev];
      let wsStart = this.pLex[p] > lastIndex ? this.pLex[p] : lastIndex;
      while (wsStart > prevLex && isWsOrComment(lx.type[wsStart - 1])) {
        wsStart--;
      }
      let wsEnd = this.pLex[p];
      while (wsEnd < lx.count && isWsOrComment(lx.type[wsEnd])) {
        wsEnd++;
      }
      if (wsStart !== wsEnd) {
        this.pLex[p] = wsStart + this.edge(this.pBinder[p], wsStart, wsEnd, this.pKind[p] === P_START);
      } else if (this.pLex[p] < wsStart) {
        this.pLex[p] = wsStart;
      }
      lastIndex = this.pLex[p];
      prev = p;
      p = this.pNext[p];
    }
  }

  /** Builds the tree from the productions; answers the root. */
  build(): i32 {
    // Any error element left means the file does not parse.
    for (let q = this.head; q >= 0; q = this.pNext[q]) {
      if (this.pType[q] === T_ERROR_ELEMENT) {
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
      const lex = this.pLex[p];
      const top = stack.length > 0 ? stack[stack.length - 1] : -1;
      // Leaves up to this marker.
      while (lexI < lex && top >= 0) {
        tr.add(lx.type[lexI], lx.start[lexI], lx.end[lexI], top, true);
        lexI++;
      }
      if (this.pKind[p] === P_START) {
        if (this.pCollapse[p] === 1) {
          const d = this.pOther[p];
          const e = this.pLex[d];
          const a = lexI < lx.count ? lx.start[lexI] : lx.n;
          const b = e > lexI ? lx.end[e - 1] : a;
          tr.add(this.pType[p], a, b, top, true);
          lexI = e;
          // Skip to after the collapsed marker's done.
          p = this.pNext[d];
          continue;
        }
        const a = lexI < lx.count ? lx.start[lexI] : lx.n;
        const node = tr.add(this.pType[p], a, a, top, false);
        stack.push(node);
      } else {
        const node = stack.pop();
        tr.end[node] = lexI > 0 ? lx.end[lexI - 1] : 0;
        if (tr.end[node] < tr.start[node]) {
          tr.end[node] = tr.start[node];
        }
        if (stack.length === 0) {
          // The root: take every remaining lexeme.
          while (lexI < lx.count) {
            tr.add(lx.type[lexI], lx.start[lexI], lx.end[lexI], node, true);
            lexI++;
          }
          tr.end[node] = lx.n;
        }
      }
      p = this.pNext[p];
    }
    return 0;
  }
}
