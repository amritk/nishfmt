// dart_style's back end (lib/src/back_end/: Code, CodeWriter, Solution,
// Solver, SolutionCache) and each piece type's format(): the same search
// over piece states in the same order, with the same cost model, so the
// same solution wins.
//
// Ported from dart_style (Dart SDK 3.14) (BSD-3-Clause, Copyright the Dart
// project authors).

import { Out } from "../core/out";
import {
  ASSIGN_BLOCK_OR_HEADLINE_RIGHT,
  BOUND_BEFORE_EXTENDS,
  CASE_BEFORE_BODY,
  CASE_BEFORE_WHEN_AND_BODY,
  CASE_BLOCK_BODY,
  CHAIN_BLOCK_TRAILING_CALL,
  CHAIN_SPLIT_AFTER_PROPERTIES,
  CTOR_BEFORE_INITIALIZERS,
  CTOR_BETWEEN_INITIALIZERS,
  DtPiece,
  IFCASE_BEFORE_CASE,
  IFCASE_BEFORE_CASE_AND_WHEN,
  IFCASE_BEFORE_WHEN,
  IN_ASSIGNMENT,
  IN_BLOCK,
  IN_CONTROL_FLOW_CLAUSE,
  IN_EXPRESSION,
  IN_GROUPING,
  IN_INFIX,
  IN_INITIALIZER,
  IN_INITIALIZER_OPTIONAL,
  IN_NONE,
  LIST_ELEMENT_APPEND_COMMA,
  PK_ADJACENT,
  PK_ASSIGN,
  PK_BLOCK,
  PK_CASE_EXPRESSION,
  PK_CHAIN,
  PK_CLAUSE,
  PK_CODE,
  PK_COMMENT,
  PK_CONSTRUCTOR,
  PK_CONTROL_FLOW,
  PK_ENABLE_FORMATTING,
  PK_FOR,
  PK_FOR_IN,
  PK_GROUPING,
  PK_IF_CASE,
  PK_INFIX,
  PK_LEADING_COMMENT,
  PK_LIST,
  PK_LIST_ELEMENT,
  PK_NEWLINE,
  PK_PREFIX,
  PK_PRIMARY_TYPE,
  PK_SEQUENCE,
  PK_SEQUENCE_ELEMENT,
  PK_SPACE,
  PK_TYPE,
  PK_TYPE_PARAMETER_BOUND,
  PK_TYPE_TEST,
  PK_VARIABLE,
  PRIMARY_BEFORE_CLAUSES,
  PRIMARY_BETWEEN_CLAUSES,
  S_SPLIT,
  S_UNSPLIT,
  SH_BLOCK,
  SH_HEADLINE,
  SH_INLINE,
  SH_OTHER,
  TB_SEMICOLON,
  TYPE_TEST_BLOCK,
  VAR_AFTER_TYPE,
  VAR_BETWEEN,
  WS_BLANK,
  WS_NEWLINE,
  WS_NONE,
  WS_SPACE,
  dtAllowed,
  dtConstraints,
  dtHasConstraints,
  dtMayRefuseInline,
  dtContainsNewline,
  dtHasStates,
  dtIndentSpaces,
  dtKids,
  dtOffspring,
  dtShapeMerge,
  dtStateCost,
  dtStateValue,
  dtStates,
} from "./pieces";

// ---------------------------------------------------------------------------
// Code.
//
// dart_style builds a GroupCode tree for every solution it tries and writes
// the winner's. Here the search only measures; the winner is formatted once
// more with its states, straight into this builder, which writes what
// GroupCode and _StringBuilder would have: a group drops a newline that
// would be its first child and starts at its own indentation.

/** _StringBuilder over the code a writer emits. */
export class DtBuilder {
  out: Out;
  src: u8[];
  n: i32;
  eol: string;
  indent: i32 = 0;
  disabledStart: i32 = -1;

  constructor(out: Out, src: u8[], n: i32, eol: string) {
    this.out = out;
    this.src = src;
    this.n = n;
    this.eol = eol;
  }

  text(s: string): void {
    if (this.disabledStart < 0) {
      this.out.spaces(this.indent);
      this.indent = 0;
      this.out.str(s);
    }
  }

  newline(blank: boolean, indent: i32): void {
    if (this.disabledStart < 0) {
      this.out.str(this.eol);
      if (blank) {
        this.out.str(this.eol);
      }
      this.indent = indent;
    }
  }

  enable(enabled: boolean, offset: i32): void {
    if (!enabled) {
      if (this.disabledStart < 0) {
        this.disabledStart = offset;
      }
    } else if (this.disabledStart >= 0) {
      this.out.range(this.src, this.disabledStart, offset);
      this.disabledStart = -1;
    }
  }

  finish(): void {
    if (this.disabledStart >= 0) {
      this.out.range(this.src, this.disabledStart, this.n);
    } else {
      this.out.str(this.eol);
    }
  }
}

// ---------------------------------------------------------------------------
// Solutions.

class DtBind {
  piece: DtPiece;
  state: i32;
  parent: DtBind | null;
  constructor(piece: DtPiece, state: i32, parent: DtBind | null) {
    this.piece = piece;
    this.state = state;
    this.parent = parent;
  }
}

export class DtSolution {
  binds: DtBind | null;
  allowed: Map<i32, i32[]> | null;
  own: i32;
  subtree: i32 = 0;
  valid: boolean = true;
  deadEnd: boolean = false;
  overflow: i32 = 0;
  expand: DtPiece[];
  // While binding: the cache whose stampOf/stateOf hold this solution's
  // states under `stamp`.
  bc: DtCache | null = null;
  stamp: i32 = 0;

  constructor(own: i32, binds: DtBind | null, allowed: Map<i32, i32[]> | null) {
    this.own = own;
    this.binds = binds;
    this.allowed = allowed;
    this.expand = [];
  }

  cost(): i32 {
    return this.own + this.subtree;
  }

  /** The state `piece` is pinned or bound to, or -1. */
  stateIfBound(piece: DtPiece): i32 {
    if (piece.pinned >= 0) {
      return piece.pinned;
    }
    let n = this.binds;
    while (n !== null) {
      if (n.piece === piece) {
        return n.state;
      }
      n = n.parent;
    }
    return -1;
  }

  state(piece: DtPiece): i32 {
    const s = this.stateIfBound(piece);
    return s < 0 ? S_UNSPLIT : s;
  }

  /** Writes the bound states into `c`'s stamped arrays, for binding. */
  beginBinding(c: DtCache): void {
    DT_GEN[1] = DT_GEN[1] + 1;
    const stamp = DT_GEN[1];
    this.stamp = stamp;
    this.bc = c;
    const so = c.stampOf;
    const st = c.stateOf;
    let b = this.binds;
    while (b !== null) {
      const id = b.piece.id;
      if (so[id] !== stamp) {
        so[id] = stamp;
        st[id] = b.state;
      }
      b = b.parent;
    }
  }

  /** stateIfBound, from the stamped arrays while binding. */
  boundState(piece: DtPiece): i32 {
    if (piece.pinned >= 0) {
      return piece.pinned;
    }
    const c = this.bc;
    if (c !== null) {
      const id = piece.id;
      return c.stampOf[id] === this.stamp ? c.stateOf[id] : -1;
    }
    return this.stateIfBound(piece);
  }

  invalidate(piece: DtPiece): void {
    if (piece.pinned >= 0) {
      return;
    }
    this.valid = false;
  }

  bind(piece: DtPiece, state: i32): void {
    if (this.deadEnd) {
      return;
    }
    const bound = this.boundState(piece);
    if (bound < 0) {
      this.own = this.own + dtStateCost(piece, state);
      this.binds = new DtBind(piece, state, this.binds);
      const c = this.bc;
      if (c !== null) {
        c.stampOf[piece.id] = this.stamp;
        c.stateOf[piece.id] = state;
      }
      if (dtHasConstraints(piece)) {
        const ps: DtPiece[] = [];
        const ss: i32[] = [];
        dtConstraints(piece, state, ps, ss);
        for (let i = 0; i < ps.length; i++) {
          this.bind(ps[i], ss[i]);
        }
      }
      if (!this.deadEnd) {
        for (const child of dtKids(piece)) {
          if (this.deadEnd) {
            break;
          }
          if (dtAllowed(piece, state, child) === SH_INLINE) {
            this.constrainOffspring(child);
          }
        }
      }
    } else if (bound !== state) {
      this.deadEnd = true;
      this.valid = false;
    }
  }

  constrainOffspring(piece: DtPiece): void {
    for (const off of dtOffspring(piece)) {
      if (this.deadEnd) {
        break;
      }
      const bs = this.boundState(off);
      if (bs >= 0) {
        if (dtContainsNewline(off, bs)) {
          this.deadEnd = true;
          this.valid = false;
        }
        continue;
      }
      const al = this.allowed;
      if (al !== null && al.has(off.id)) {
        continue;
      }
      const allowedUnsplit = !dtContainsNewline(off, S_UNSPLIT);
      const states = dtStates(off);
      let nRemaining = 0;
      for (const s of states) {
        if (!dtContainsNewline(off, s)) {
          nRemaining++;
        }
      }
      if (nRemaining === 0) {
        if (!allowedUnsplit) {
          this.deadEnd = true;
          this.valid = false;
        } else {
          this.bind(off, S_UNSPLIT);
        }
        continue;
      }
      const remaining: i32[] = [];
      for (const s of states) {
        if (!dtContainsNewline(off, s)) {
          remaining.push(s);
        }
      }
      if (!allowedUnsplit && remaining.length === 1) {
        this.bind(off, remaining[0]);
      } else if (remaining.length < states.length) {
        const m0 = this.allowed;
        if (m0 === null) {
          const m = new Map<i32, i32[]>();
          m.set(off.id, remaining);
          this.allowed = m;
        } else {
          m0.set(off.id, remaining);
        }
      }
    }
  }

  /** compareTo: negative when this solution is better. */
  compare(o: DtSolution): i32 {
    const c = this.cost();
    const oc = o.cost();
    if (c !== oc) {
      return c < oc ? -1 : 1;
    }
    if (this.overflow !== o.overflow) {
      return this.overflow < o.overflow ? -1 : 1;
    }
    // Earlier bound pieces first: the list is newest first.
    const pieces: DtPiece[] = [];
    let n = this.binds;
    while (n !== null) {
      pieces.push(n.piece);
      n = n.parent;
    }
    for (let i = toI32(pieces.length) - 1; i >= 0; i--) {
      const p = pieces[i];
      const a = this.state(p);
      const b = o.state(p);
      if (a !== b) {
        const va = dtStateValue(a);
        const vb = dtStateValue(b);
        return va < vb ? -1 : va > vb ? 1 : 0;
      }
    }
    return 0;
  }
}

// ---------------------------------------------------------------------------
// The solver and its cache.

export class DtCache {
  map: Map<i64, DtSolution>;
  pageWidth: i32;
  // The states a writer's solution binds, by piece id, valid where the stamp
  // is the writer's.
  stampOf: i32[];
  stateOf: i32[];
  writers: DtWriter[];
  depth: i32 = 0;
  builder: DtBuilder | null = null;

  constructor(pageWidth: i32, pieces: i32) {
    this.map = new Map<i64, DtSolution>();
    this.pageWidth = pageWidth;
    this.stampOf = new Array<i32>(pieces + 1);
    this.stateOf = new Array<i32>(pieces + 1);
    this.writers = [];
  }

  key(root: DtPiece, indent: i32, subsequent: i32): i64 {
    return (toI64(root.id) << toI64(32)) | (toI64(indent) << toI64(16)) | toI64(subsequent);
  }

  find(root: DtPiece, stateIfBound: i32, indent: i32, subsequent: i32): DtSolution {
    const key = this.key(root, indent, subsequent);
    const hit = this.map.get(key);
    if (hit !== undefined) {
      return hit;
    }
    const s = dtSolve(this, root, stateIfBound, indent, subsequent);
    this.map.set(key, s);
    return s;
  }

  /** The writer for the current nesting depth. */
  writer(): DtWriter {
    const d = this.depth;
    if (d >= toI32(this.writers.length)) {
      this.writers.push(new DtWriter(this));
    }
    return this.writers[d];
  }
}

const MAX_ATTEMPTS: i32 = 10000;

/** HeapPriorityQueue<Solution> from package:collection. */
class DtQueue {
  q: DtSolution[];
  constructor() {
    this.q = [];
  }

  add(e: DtSolution): void {
    this.q.push(e);
    this.bubbleUp(e, toI32(this.q.length) - 1);
  }

  removeFirst(): DtSolution {
    const result = this.q[0];
    const last = this.q.pop();
    if (this.q.length > 0) {
      this.bubbleDown(last, 0);
    }
    return result;
  }

  bubbleUp(e: DtSolution, index0: i32): void {
    let index = index0;
    while (index > 0) {
      const pi = (index - 1) >> 1;
      const parent = this.q[pi];
      if (e.compare(parent) > 0) {
        break;
      }
      this.q[index] = parent;
      index = pi;
    }
    this.q[index] = e;
  }

  bubbleDown(e: DtSolution, index0: i32): void {
    let index = index0;
    const len = toI32(this.q.length);
    let right = index * 2 + 2;
    while (right < len) {
      const left = right - 1;
      const lc = this.q[left];
      const rc = this.q[right];
      let minI = right;
      let minC = rc;
      if (lc.compare(rc) < 0) {
        minI = left;
        minC = lc;
      }
      if (e.compare(minC) <= 0) {
        this.q[index] = e;
        return;
      }
      this.q[index] = minC;
      index = minI;
      right = index * 2 + 2;
    }
    const left = right - 1;
    if (left < len) {
      const child = this.q[left];
      if (e.compare(child) > 0) {
        this.q[index] = child;
        index = left;
      }
    }
    this.q[index] = e;
  }
}

/** Solver.format. */
export const dtSolve = (cache: DtCache, root: DtPiece, rootState: i32, leading: i32, subsequent: i32): DtSolution => {
  const first = new DtSolution(0, null, null);
  first.beginBinding(cache);
  if (rootState >= 0) {
    first.bind(root, rootState);
  }
  first.bc = null;
  dtRunWriter(cache, first, root, leading, subsequent, first.stamp);
  const queue = new DtQueue();
  queue.add(first);
  let best = first;
  let attempts = 0;
  while (queue.q.length > 0 && attempts < MAX_ATTEMPTS) {
    const s = queue.removeFirst();
    attempts++;
    if (s.valid) {
      if (s.overflow === 0) {
        best = s;
        break;
      }
      if (!best.valid || s.overflow < best.overflow) {
        best = s;
      }
    }
    dtExpand(cache, s, root, leading, subsequent, queue);
  }
  return best;
};

/** Solution.expand, adding each new solution to `queue`. */
const dtExpand = (cache: DtCache, s: DtSolution, root: DtPiece, leading: i32, subsequent: i32, queue: DtQueue): void => {
  const ex = s.expand;
  for (let i = 0; i < ex.length; i++) {
    const ep = ex[i];
    let states = dtStates(ep);
    const al = s.allowed;
    if (al !== null) {
      const st = al.get(ep.id);
      if (st !== undefined) {
        states = st;
      }
    }
    for (const state of states) {
      let copy: Map<i32, i32[]> | null = null;
      if (al !== null) {
        const m = new Map<i32, i32[]>();
        for (const k of al.keys()) {
          m.set(k, al.get(k) ?? []);
        }
        copy = m;
      }
      const e = new DtSolution(s.own, s.binds, copy);
      e.beginBinding(cache);
      let ok = true;
      for (let j = 0; j < i; j++) {
        e.bind(ex[j], S_UNSPLIT);
        if (e.deadEnd) {
          ok = false;
          break;
        }
      }
      if (!ok) {
        continue;
      }
      e.bind(ep, state);
      e.bc = null;
      if (!e.deadEnd) {
        dtRunWriter(cache, e, root, leading, subsequent, e.stamp);
        if (!e.deadEnd) {
          queue.add(e);
        }
      }
    }
  }
};

/** Solution._format: runs a CodeWriter over the tree for `s`, measuring. */
const dtRunWriter = (cache: DtCache, s: DtSolution, root: DtPiece, leading: i32, subsequent: i32, stamp: i32): void => {
  const w = cache.writer();
  cache.depth = cache.depth + 1;
  w.reset(s, leading, subsequent, false, stamp);
  w.format(root, false);
  w.finishLine();
  s.expand = w.expandPieces;
  cache.depth = cache.depth - 1;
};

/** Writes the code for solution `s` of `root` to the cache's builder. */
export const dtEmit = (cache: DtCache, s: DtSolution, root: DtPiece, leading: i32, subsequent: i32): void => {
  const w = cache.writer();
  cache.depth = cache.depth + 1;
  w.reset(s, leading, subsequent, true, 0);
  const b = cache.builder;
  if (b !== null) {
    b.indent = leading;
  }
  w.format(root, false);
  cache.depth = cache.depth - 1;
};

// ---------------------------------------------------------------------------
// CodeWriter.

// Shape modes.
const SM_MERGE: i32 = 0;
const SM_BLOCK: i32 = 1;
const SM_BEFORE_HEADLINE: i32 = 2;
const SM_AFTER_HEADLINE: i32 = 3;
const SM_OTHER: i32 = 4;

// Unique marks for the set of pieces on the current line, and stamps for a
// writer's materialized states.
const DT_GEN = new Int32Array(2);

export class DtWriter {
  cache: DtCache;
  sol: DtSolution;
  emit: boolean = false;
  items: i32 = 0; // children of this writer's group, when emitting
  pageWidth: i32;
  stamp: i32 = 0;
  pendingWs: i32 = 0;
  pendingIndent: i32 = 0;
  column: i32 = 0;
  softChars: i32 = 0;
  indType: i32[];
  indSpaces: i32[];
  nInd: i32 = 0;
  fmtPiece: DtPiece[];
  fmtShape: i32[];
  fmtMode: i32[];
  nFmt: i32 = 0;
  foundExpandLine: boolean = false;
  expandPieces: DtPiece[];
  unsolved: DtPiece[];
  nMarked: i32 = 0; // how many of `unsolved` are on linePieces already
  linePieces: DtPiece[];
  nLine: i32 = 0;
  gen: i32 = 0;

  constructor(cache: DtCache) {
    this.cache = cache;
    this.sol = new DtSolution(0, null, null);
    this.pageWidth = cache.pageWidth;
    this.indType = new Array<i32>(16);
    this.indSpaces = new Array<i32>(16);
    this.fmtPiece = [];
    this.fmtShape = new Array<i32>(16);
    this.fmtMode = new Array<i32>(16);
    this.expandPieces = [];
    this.unsolved = [];
    this.linePieces = [];
  }

  /**
   * Starts a run over `sol`, whose states are in the cache's stamped arrays
   * under `stamp` already unless that is 0.
   */
  reset(sol: DtSolution, leading: i32, subsequent: i32, emit: boolean, stamp0: i32): void {
    this.sol = sol;
    this.emit = emit;
    this.items = 0;
    this.pendingWs = WS_NONE;
    this.softChars = 0;
    this.nInd = 0;
    while (this.fmtPiece.length > 0) {
      this.fmtPiece.pop();
    }
    this.nFmt = 0;
    while (this.unsolved.length > 0) {
      this.unsolved.pop();
    }
    this.foundExpandLine = false;
    this.expandPieces = [];
    this.nLine = 0;
    this.pushInd(IN_NONE, leading);
    this.pendingIndent = leading;
    this.column = leading;
    if (subsequent > leading) {
      this.pushInd(IN_NONE, subsequent);
    }
    this.newGen();
    if (stamp0 > 0) {
      this.stamp = stamp0;
      return;
    }
    // Materialize the solution's states.
    DT_GEN[1] = DT_GEN[1] + 1;
    const stamp = DT_GEN[1];
    this.stamp = stamp;
    const so = this.cache.stampOf;
    const st = this.cache.stateOf;
    let b = sol.binds;
    while (b !== null) {
      const id = b.piece.id;
      if (so[id] !== stamp) {
        so[id] = stamp;
        st[id] = b.state;
      }
      b = b.parent;
    }
  }

  /** The state `piece` is pinned or bound to in this writer's solution, or -1. */
  stateIfBound(piece: DtPiece): i32 {
    if (piece.pinned >= 0) {
      return piece.pinned;
    }
    const id = piece.id;
    if (this.cache.stampOf[id] === this.stamp) {
      return this.cache.stateOf[id];
    }
    return -1;
  }

  state(piece: DtPiece): i32 {
    const s = this.stateIfBound(piece);
    return s < 0 ? S_UNSPLIT : s;
  }

  pushInd(kind: i32, spaces: i32): void {
    const n = this.nInd;
    if (n >= toI32(this.indType.length)) {
      const t = new Array<i32>(n * 2);
      t.set(this.indType);
      this.indType = t;
      const s = new Array<i32>(n * 2);
      s.set(this.indSpaces);
      this.indSpaces = s;
    }
    this.indType[n] = kind;
    this.indSpaces[n] = spaces;
    this.nInd = n + 1;
  }

  newGen(): void {
    this.nMarked = 0;
    DT_GEN[0] = DT_GEN[0] + 1;
    this.gen = DT_GEN[0];
  }

  write(text: string, len: i32, soft: boolean): void {
    this.flushWhitespace();
    if (this.emit) {
      const b = this.cache.builder;
      if (b !== null) {
        b.text(text);
      }
      this.items = this.items + 1;
      return;
    }
    this.column = this.column + len;
    if (soft) {
      this.softChars = this.softChars + len;
    } else {
      this.softChars = 0;
    }
    const nu = toI32(this.unsolved.length);
    if (!this.foundExpandLine && nu > this.nMarked) {
      for (let i = this.nMarked; i < nu; i++) {
        const p = this.unsolved[i];
        if (p.mark !== this.gen) {
          p.mark = this.gen;
          if (this.nLine < toI32(this.linePieces.length)) {
            this.linePieces[this.nLine] = p;
          } else {
            this.linePieces.push(p);
          }
          this.nLine = this.nLine + 1;
        }
      }
      this.nMarked = nu;
    }
  }

  pushIndent(kind: i32): void {
    const top = this.nInd - 1;
    const pt = this.indType[top];
    let offset = dtIndentSpaces(kind);
    if (pt === IN_ASSIGNMENT && kind === IN_INFIX) {
      offset = 0;
    } else if (pt === IN_CONTROL_FLOW_CLAUSE && (kind === IN_EXPRESSION || kind === IN_INFIX)) {
      offset = 0;
    }
    this.pushInd(kind, this.indSpaces[top] + offset);
  }

  popIndent(): void {
    this.nInd = this.nInd - 1;
  }

  splitIf(cond: boolean, space: boolean = true, blank: boolean = false): void {
    if (cond) {
      this.newline(blank, false);
    } else if (space) {
      this.space();
    }
  }

  space(): void {
    this.whitespace(WS_SPACE, false);
  }

  newline(blank: boolean = false, flushLeft: boolean = false): void {
    this.whitespace(blank ? WS_BLANK : WS_NEWLINE, flushLeft);
  }

  whitespace(ws: i32, flushLeft: boolean): void {
    if (ws === WS_NEWLINE || ws === WS_BLANK) {
      this.applyNewline(this.nFmt - 1, SH_OTHER);
      this.pendingIndent = flushLeft ? 0 : this.indSpaces[this.nInd - 1];
    }
    if (ws > this.pendingWs) {
      this.pendingWs = ws;
    }
  }

  setShapeMode(mode: i32): void {
    this.fmtMode[this.nFmt - 1] = mode;
  }

  format(piece: DtPiece, separate: boolean): void {
    if (separate) {
      this.formatSeparate(piece);
    } else {
      this.formatInline(piece);
    }
  }

  formatSeparate(piece: DtPiece): void {
    const indent = this.pendingIndent;
    const subsequent = this.indSpaces[this.nInd - 1];
    const s = this.cache.find(piece, this.stateIfBound(piece), indent, subsequent);
    this.pendingIndent = 0;
    this.flushWhitespace();
    if (this.emit) {
      dtEmit(this.cache, s, piece, indent, subsequent);
      this.items = this.items + 1;
      return;
    }
    this.sol.overflow = this.sol.overflow + s.overflow;
    this.sol.subtree = this.sol.subtree + s.cost();
  }

  formatInline(piece: DtPiece): void {
    if (!this.emit && piece.kind === PK_CODE && piece.list.length === 0 && piece.list2.length === 0 && piece.lines.length === 1 && !dtHasStates(piece)) {
      // The common leaf, measured: what the general path below does for
      // it, where its shape stays inline.
      this.write(piece.lines[0], piece.lens[0], piece.soft);
      const n = this.nFmt;
      if (n > 0) {
        const parent = this.fmtPiece[n - 1];
        if (dtMayRefuseInline(parent.kind) && (dtAllowed(parent, this.state(parent), piece) & SH_INLINE) === 0) {
          this.sol.invalidate(parent);
        }
      }
      return;
    }
    const unsolved = !this.emit && dtHasStates(piece) && this.stateIfBound(piece) < 0;
    if (unsolved) {
      this.unsolved.push(piece);
    }
    const n0 = this.nFmt;
    if (n0 >= toI32(this.fmtShape.length)) {
      const a = new Array<i32>(n0 * 2);
      a.set(this.fmtShape);
      this.fmtShape = a;
      const b = new Array<i32>(n0 * 2);
      b.set(this.fmtMode);
      this.fmtMode = b;
    }
    if (n0 < toI32(this.fmtPiece.length)) {
      this.fmtPiece[n0] = piece;
    } else {
      this.fmtPiece.push(piece);
    }
    this.fmtShape[n0] = SH_INLINE;
    this.fmtMode[n0] = SM_MERGE;
    this.nFmt = n0 + 1;
    dtFormatPiece(this, piece, this.state(piece));
    this.nFmt = n0;
    const shape = this.fmtShape[n0];
    if (unsolved) {
      this.unsolved.pop();
      if (this.nMarked > toI32(this.unsolved.length)) {
        this.nMarked = toI32(this.unsolved.length);
      }
    }
    if (n0 > 0 && !this.emit) {
      const parent = this.fmtPiece[n0 - 1];
      if (shape !== SH_INLINE || dtMayRefuseInline(parent.kind)) {
        const allowed = dtAllowed(parent, this.state(parent), piece);
        if ((allowed & shape) === 0) {
          this.sol.invalidate(parent);
        }
      }
      if (shape !== SH_INLINE) {
        this.applyNewline(n0 - 1, shape);
      }
    }
  }

  enableFormatting(enabled: boolean, offset: i32): void {
    if (this.emit) {
      const b = this.cache.builder;
      if (b !== null) {
        b.enable(enabled, offset);
      }
      this.items = this.items + 1;
    }
  }

  flushWhitespace(): void {
    const ws = this.pendingWs;
    if (ws === WS_NEWLINE || ws === WS_BLANK) {
      if (!this.emit) {
        this.finishLine();
      }
      this.column = this.pendingIndent;
      this.softChars = 0;
      if (this.emit && this.items > 0) {
        const b = this.cache.builder;
        if (b !== null) {
          b.newline(ws === WS_BLANK, this.column);
        }
        this.items = this.items + 1;
      }
    } else if (ws === WS_SPACE) {
      if (this.emit) {
        const b = this.cache.builder;
        if (b !== null) {
          b.text(" ");
        }
        this.items = this.items + 1;
      }
      this.column = this.column + 1;
      this.softChars = this.softChars + 1;
    }
    this.pendingWs = WS_NONE;
  }

  finishLine(): void {
    if (this.column > this.pageWidth) {
      let overflow = this.column - this.pageWidth;
      if (this.softChars > 0) {
        if (this.softChars >= overflow) {
          overflow = 1;
        } else {
          overflow = overflow - this.softChars + 1;
        }
      }
      this.sol.overflow = this.sol.overflow + overflow;
    }
    if (this.foundExpandLine) {
      return;
    }
    if (this.nLine > 0 && (this.column > this.pageWidth || !this.sol.valid)) {
      for (let i = 0; i < this.nLine; i++) {
        this.expandPieces.push(this.linePieces[i]);
      }
      this.foundExpandLine = true;
    } else {
      this.nLine = 0;
      this.newGen();
    }
  }

  /** _applyNewlineToShape for the format state at `i`. */
  applyNewline(i: i32, shape: i32): void {
    if (i < 0) {
      return;
    }
    const mode = this.fmtMode[i];
    const cur = this.fmtShape[i];
    let r = cur;
    if (mode === SM_MERGE) {
      r = dtShapeMerge(cur, shape);
    } else if (mode === SM_BLOCK) {
      r = SH_BLOCK;
    } else if (mode === SM_BEFORE_HEADLINE) {
      r = SH_OTHER;
    } else if (mode === SM_AFTER_HEADLINE) {
      r = cur === SH_INLINE ? SH_HEADLINE : cur;
    } else {
      r = SH_OTHER;
    }
    this.fmtShape[i] = r;
  }

  /** TextPiece._formatLines. */
  formatLines(p: DtPiece, soft: boolean): void {
    const n = toI32(p.lines.length);
    if (n > 1) {
      this.setShapeMode(SM_BEFORE_HEADLINE);
    }
    this.write(p.lines[0], p.lens[0], soft);
    if (n > 1) {
      this.setShapeMode(SM_AFTER_HEADLINE);
    }
    for (let i = 1; i < n; i++) {
      this.newline(false, true);
      this.write(p.lines[i], p.lens[i], soft);
    }
  }
}

const dtReq = (p: DtPiece | null): DtPiece => {
  if (p === null) {
    panic("dart: missing piece");
  }
  return p;
};

/** Each piece type's format(). */
const dtFormatPiece = (w: DtWriter, p: DtPiece, s: i32): void => {
  switch (p.kind) {
    case PK_ADJACENT:
      for (const x of p.list) {
        w.format(x, false);
      }
      return;
    case PK_ASSIGN:
      if (s === S_SPLIT) {
        w.pushIndent(IN_EXPRESSION);
        w.setShapeMode(SM_BEFORE_HEADLINE);
        w.format(dtReq(p.a), false);
        w.setShapeMode(SM_AFTER_HEADLINE);
        w.newline();
        w.popIndent();
        w.pushIndent(IN_ASSIGNMENT);
        w.format(dtReq(p.b), false);
        w.popIndent();
      } else {
        w.format(dtReq(p.a), false);
        w.space();
        w.format(dtReq(p.b), false);
      }
      return;
    case PK_CASE_EXPRESSION: {
      const indentPattern = !p.b0 && !p.b1 && s === CASE_BEFORE_WHEN_AND_BODY;
      if (indentPattern) {
        w.pushIndent(IN_EXPRESSION);
      }
      w.format(dtReq(p.a), false);
      if (indentPattern) {
        w.popIndent();
      }
      const guard = p.b;
      if (guard !== null) {
        w.pushIndent(IN_EXPRESSION);
        w.splitIf(s === CASE_BEFORE_WHEN_AND_BODY);
        w.format(guard, false);
        w.popIndent();
      }
      w.space();
      w.format(dtReq(p.c), false);
      const indentBody = s !== S_UNSPLIT && s !== CASE_BLOCK_BODY;
      if (indentBody) {
        w.pushIndent(IN_BLOCK);
      }
      w.splitIf(s === CASE_BEFORE_BODY || s === CASE_BEFORE_WHEN_AND_BODY);
      w.format(dtReq(p.d), false);
      if (indentBody) {
        w.popIndent();
      }
      return;
    }
    case PK_CHAIN: {
      const calls = p.list;
      const n = toI32(calls.length);
      if (s === S_UNSPLIT) {
        w.format(dtReq(p.a), false);
        for (let i = 0; i < n; i++) {
          w.format(calls[i], false);
        }
      } else if (s === CHAIN_SPLIT_AFTER_PROPERTIES) {
        w.pushIndent(p.i2);
        w.setShapeMode(SM_BEFORE_HEADLINE);
        w.format(dtReq(p.a), false);
        for (let i = 0; i < p.i0; i++) {
          w.format(calls[i], false);
        }
        w.setShapeMode(SM_AFTER_HEADLINE);
        for (let i = p.i0; i < n; i++) {
          w.newline();
          w.format(calls[i], i < n - 1);
        }
        w.popIndent();
      } else if (s === CHAIN_BLOCK_TRAILING_CALL) {
        if (p.b0) {
          w.setShapeMode(SM_OTHER);
        }
        w.format(dtReq(p.a), false);
        for (let i = 0; i < n; i++) {
          w.format(calls[i], false);
        }
      } else {
        w.pushIndent(p.i2);
        w.setShapeMode(SM_BEFORE_HEADLINE);
        w.format(dtReq(p.a), false);
        w.setShapeMode(SM_AFTER_HEADLINE);
        for (let i = 0; i < n; i++) {
          w.newline();
          w.format(calls[i], i < n - 1);
        }
        w.popIndent();
      }
      return;
    }
    case PK_CLAUSE:
      w.format(dtReq(p.a), false);
      w.pushIndent(IN_EXPRESSION);
      for (let i = 0; i < p.list.length; i++) {
        if (p.b0 && i === 0) {
          w.splitIf(s === S_SPLIT);
        } else {
          w.splitIf(s !== S_UNSPLIT);
        }
        w.format(p.list[i], false);
      }
      w.popIndent();
      return;
    case PK_CONSTRUCTOR: {
      w.format(dtReq(p.a), false);
      const params = p.b;
      if (params !== null) {
        w.format(params, false);
      }
      const redirect = p.c;
      if (redirect !== null) {
        w.space();
        w.format(redirect, false);
      }
      const inits = p.e;
      if (inits !== null) {
        w.pushIndent(IN_BLOCK);
        w.splitIf(s === CTOR_BEFORE_INITIALIZERS);
        w.format(dtReq(p.d), false);
        w.space();
        if (p.b1 && s === CTOR_BETWEEN_INITIALIZERS) {
          w.pushIndent(IN_INITIALIZER_OPTIONAL);
        } else {
          w.pushIndent(IN_INITIALIZER);
        }
        w.format(inits, false);
        w.popIndent();
        w.popIndent();
      }
      w.format(dtReq(p.f), false);
      return;
    }
    case PK_CONTROL_FLOW: {
      const n = toI32(p.list.length);
      for (let i = 0; i < n; i++) {
        const isBlock = p.ints[i] === 1;
        w.format(p.list[i], false);
        if (!isBlock) {
          w.pushIndent(IN_BLOCK);
          w.splitIf(s === S_SPLIT);
        }
        w.format(p.list2[i], false);
        if (!isBlock) {
          w.popIndent();
        }
        if (i < n - 1) {
          w.splitIf(s === S_SPLIT && !isBlock);
        }
      }
      return;
    }
    case PK_FOR:
      w.format(dtReq(p.a), false);
      w.space();
      if (p.b0) {
        w.pushIndent(IN_CONTROL_FLOW_CLAUSE);
      }
      w.format(dtReq(p.b), false);
      if (p.b0) {
        w.popIndent();
      }
      return;
    case PK_FOR_IN:
      if (s === S_SPLIT) {
        w.pushIndent(IN_EXPRESSION);
      }
      w.format(dtReq(p.a), false);
      w.splitIf(s === S_SPLIT);
      w.format(dtReq(p.b), false);
      if (s === S_SPLIT) {
        w.popIndent();
      }
      return;
    case PK_GROUPING:
      w.pushIndent(IN_GROUPING);
      w.setShapeMode(SM_OTHER);
      w.format(dtReq(p.a), false);
      w.popIndent();
      return;
    case PK_PREFIX:
      w.pushIndent(IN_GROUPING);
      w.format(dtReq(p.a), false);
      w.popIndent();
      return;
    case PK_IF_CASE: {
      if (s !== S_UNSPLIT) {
        w.pushIndent(IN_EXPRESSION);
      }
      w.format(dtReq(p.a), false);
      w.splitIf(s === IFCASE_BEFORE_CASE || s === IFCASE_BEFORE_CASE_AND_WHEN);
      if (!p.b0) {
        w.pushIndent(IN_CONTROL_FLOW_CLAUSE);
      }
      w.format(dtReq(p.b), false);
      if (!p.b0) {
        w.popIndent();
      }
      const guard = p.c;
      if (guard !== null) {
        w.splitIf(s === IFCASE_BEFORE_WHEN || s === IFCASE_BEFORE_CASE_AND_WHEN);
        w.format(guard, false);
      }
      if (s !== S_UNSPLIT) {
        w.popIndent();
      }
      return;
    }
    case PK_INFIX: {
      const ops = p.list;
      const n = toI32(ops.length);
      w.pushIndent(p.i0);
      if (p.b0) {
        w.setShapeMode(SM_BEFORE_HEADLINE);
      }
      w.format(ops[0], false);
      if (p.b0) {
        w.setShapeMode(SM_AFTER_HEADLINE);
      }
      for (let i = 1; i < n; i++) {
        w.splitIf(s === S_SPLIT);
        if (p.b0) {
          w.pushIndent(IN_BLOCK);
        }
        w.format(ops[i], s === S_SPLIT && i < n - 1);
        if (p.b0) {
          w.popIndent();
        }
      }
      w.popIndent();
      return;
    }
    case PK_LEADING_COMMENT:
      w.newline();
      for (const c of p.list) {
        w.format(c, false);
      }
      w.format(dtReq(p.a), false);
      return;
    case PK_LIST: {
      const els = p.list;
      const n = toI32(els.length);
      const before = p.a;
      if (before !== null) {
        w.format(before, false);
        if (s !== S_UNSPLIT) {
          w.pushIndent(IN_BLOCK);
        }
        if (p.b1) {
          w.setShapeMode(SM_BLOCK);
        }
        w.splitIf(s === S_SPLIT, p.b0 && n > 0);
      }
      for (let i = 0; i < n; i++) {
        const el = els[i];
        if (s === S_UNSPLIT && el.b1) {
          w.pushIndent(IN_EXPRESSION);
        }
        const separate = s === S_SPLIT && (i > 0 || before !== null) && (i < n - 1 || p.b !== null);
        w.format(el, separate);
        if (s === S_UNSPLIT && el.b1) {
          w.popIndent();
        }
        if (i < n - 1) {
          w.splitIf(s === S_SPLIT, el.delim.length === 0, el.b2);
        }
      }
      const after = p.b;
      if (after !== null) {
        if (s === S_SPLIT) {
          w.popIndent();
        }
        w.splitIf(s === S_SPLIT, p.b0 && n > 0);
        if (p.b1) {
          w.setShapeMode(SM_MERGE);
        }
        w.format(after, false);
      }
      return;
    }
    case PK_LIST_ELEMENT: {
      for (const c of p.list) {
        w.format(c, false);
        w.space();
      }
      const content = p.a;
      if (content !== null) {
        w.format(content, false);
        for (let i = 0; i < p.i0; i++) {
          w.space();
          w.format(p.list2[i], false);
        }
        if (s === LIST_ELEMENT_APPEND_COMMA) {
          w.write(",", 1, true);
        }
        if (p.delim.length > 0) {
          w.space();
          w.write(p.delim, toI32(p.delim.length), false);
        }
      }
      for (let i = p.i0; i < p.list2.length; i++) {
        if (i > 0 || content !== null) {
          w.space();
        }
        w.format(p.list2[i], false);
      }
      return;
    }
    case PK_SEQUENCE: {
      const els = p.list;
      const n = toI32(els.length);
      w.pushIndent(IN_NONE);
      for (let i = 0; i < n; i++) {
        w.format(els[i], true);
        if (i < n - 1) {
          w.popIndent();
          w.pushIndent(els[i + 1].i0);
          w.newline(els[i].b0, false);
        }
      }
      w.popIndent();
      return;
    }
    case PK_BLOCK:
      w.format(dtReq(p.a), false);
      w.pushIndent(IN_BLOCK);
      w.setShapeMode(SM_BLOCK);
      w.newline();
      w.format(dtReq(p.b), false);
      w.popIndent();
      w.newline();
      w.setShapeMode(SM_MERGE);
      w.format(dtReq(p.c), false);
      return;
    case PK_SEQUENCE_ELEMENT:
      w.format(dtReq(p.a), false);
      for (const c of p.list) {
        w.space();
        w.format(c, false);
      }
      return;
    case PK_CODE:
      if (p.list.length > 0) {
        w.newline();
        for (const c of p.list) {
          w.format(c, false);
        }
      }
      w.formatLines(p, p.soft);
      for (const c of p.list2) {
        w.space();
        w.format(c, false);
      }
      return;
    case PK_COMMENT:
      w.formatLines(p, true);
      w.whitespace(p.i0, false);
      return;
    case PK_ENABLE_FORMATTING:
      w.formatLines(p, true);
      w.whitespace(p.i0, false);
      w.enableFormatting(p.b0, p.i1);
      return;
    case PK_SPACE:
      w.space();
      return;
    case PK_NEWLINE:
      w.newline();
      return;
    case PK_TYPE:
      w.format(dtReq(p.a), false);
      if (p.i0 !== TB_SEMICOLON) {
        w.space();
      }
      w.format(dtReq(p.b), false);
      return;
    case PK_PRIMARY_TYPE: {
      w.format(dtReq(p.a), false);
      w.format(dtReq(p.b), false);
      const nc = toI32(p.list.length);
      const indent = s === PRIMARY_BEFORE_CLAUSES || (s === PRIMARY_BETWEEN_CLAUSES && nc > 1) || s === S_SPLIT;
      if (indent) {
        w.pushIndent(IN_INFIX);
      }
      for (let i = 0; i < nc; i++) {
        w.splitIf(s === PRIMARY_BEFORE_CLAUSES || (s === PRIMARY_BETWEEN_CLAUSES && i !== 0) || s === S_SPLIT);
        w.format(p.list[i], false);
      }
      if (indent) {
        w.popIndent();
      }
      if (p.i0 !== TB_SEMICOLON) {
        w.space();
      }
      w.format(dtReq(p.c), false);
      return;
    }
    case PK_TYPE_PARAMETER_BOUND:
      if (s === BOUND_BEFORE_EXTENDS) {
        w.pushIndent(IN_EXPRESSION);
      }
      w.format(dtReq(p.a), false);
      w.splitIf(s === BOUND_BEFORE_EXTENDS);
      w.format(dtReq(p.b), false);
      if (s === BOUND_BEFORE_EXTENDS) {
        w.popIndent();
      }
      return;
    case PK_TYPE_TEST:
      if (s === S_SPLIT) {
        w.pushIndent(IN_EXPRESSION);
      }
      w.format(dtReq(p.a), false);
      w.splitIf(s === S_SPLIT);
      w.format(dtReq(p.b), false);
      w.space();
      w.format(dtReq(p.c), false);
      if (s === S_SPLIT) {
        w.popIndent();
      }
      return;
    case PK_VARIABLE: {
      w.format(dtReq(p.a), false);
      if (s === VAR_BETWEEN) {
        w.pushIndent(IN_EXPRESSION);
      }
      w.splitIf(s === VAR_AFTER_TYPE);
      for (let i = 0; i < p.list.length; i++) {
        if (i > 0) {
          w.splitIf(s !== S_UNSPLIT);
        }
        w.format(p.list[i], false);
      }
      if (s === VAR_BETWEEN) {
        w.popIndent();
      }
      return;
    }
    default:
      panic(`dart: unknown piece ${p.kind}`);
  }
};

