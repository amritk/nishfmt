// dart_style's back end (lib/src/back_end/: Code, CodeWriter, Solution,
// Solver, SolutionCache) and each piece type's format(): the same search
// over piece states in the same order, with the same cost model, so the
// same solution wins.
//
// Ported from dart_style 3.1.14-wip at 5a9534fad9ff, the commit Dart SDK
// 3.14.1 pins (BSD-3-Clause, Copyright the Dart project authors).

import { add32, sub32 } from "../core/arr";
import { fault } from "../core/fault";
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
  PK_ASSIGN37,
  S_1_1,
  S_3_1,
  dtIs37,
  dtV313,
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
  dtFixedState,
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
    const r = toI64(this.own) + toI64(this.subtree);
    if (r >= toI64(-2147483648) && r <= toI64(2147483647)) {
      return toI32(r);
    }
    fault();
    return 0;
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
    const stamp = c.nextStamp();
    this.stamp = stamp;
    this.bc = c;
    const so = c.stampOf;
    const st = c.stateOf;
    let b = this.binds;
    while (b !== null) {
      // The cache holds a slot for every piece id. (A negative id is a u32
      // past any length: one compare an array tests both ends.)
      const id = toU32(b.piece.id);
      if (id >= toU32(so.length) || id >= toU32(st.length)) {
        fault();
        return;
      }
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
      const so = c.stampOf;
      const st = c.stateOf;
      if (id < 0 || id >= so.length || id >= st.length) {
        fault();
        return -1;
      }
      return so[id] === this.stamp ? st[id] : -1;
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
      this.own = add32(this.own, dtStateCost(piece, state));
      this.binds = new DtBind(piece, state, this.binds);
      const c = this.bc;
      if (c !== null) {
        const id = piece.id;
        const so = c.stampOf;
        const st = c.stateOf;
        if (id < 0 || id >= so.length || id >= st.length) {
          fault();
          return;
        }
        so[id] = this.stamp;
        st[id] = state;
      }
      if (dtHasConstraints(piece)) {
        const ps: DtPiece[] = [];
        const ss: i32[] = [];
        dtConstraints(piece, state, ps, ss);
        // dtConstraints adds a piece and its state together.
        if (ss.length < ps.length) {
          fault();
          return;
        }
        for (let i = 0; i < ps.length && i < ss.length; i++) {
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
      let anyRemaining = false;
      for (const s of states) {
        if (!dtContainsNewline(off, s)) {
          anyRemaining = true;
        }
      }
      if (!anyRemaining) {
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

  // The last stamp handed out, and the last line-set generation. A cache
  // formats one file, whose pieces and stamp arrays are its own.
  stampGen: i32 = 0;
  markGen: i32 = 0;

  constructor(pageWidth: i32, pieces: i32) {
    this.map = new Map<i64, DtSolution>();
    this.pageWidth = pageWidth;
    this.stampOf = dtCacheZeros(add32(pieces, 1));
    this.stateOf = dtCacheZeros(add32(pieces, 1));
    this.writers = [];
  }

  /** A stamp no solution of this cache has had yet. */
  nextStamp(): i32 {
    const g = this.stampGen;
    if (g < 2147483647) {
      this.stampGen = g + 1;
      return g + 1;
    }
    fault();
    return g;
  }

  /** A line-set generation no line of this cache has had yet. */
  nextMark(): i32 {
    const g = this.markGen;
    if (g < 2147483647) {
      this.markGen = g + 1;
      return g + 1;
    }
    fault();
    return g;
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
    const ws = this.writers;
    if (d >= 0 && d < ws.length) {
      return ws[d];
    }
    // The depth only grows a writer at a time.
    fault();
    const w = new DtWriter(this);
    return w;
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

  /** The first solution; the queue is not empty. */
  removeFirst(first: DtSolution): DtSolution {
    const q = this.q;
    if (q.length < 1) {
      fault();
      return first;
    }
    const result = q[0];
    const last = q.pop();
    if (q.length > 0) {
      this.bubbleDown(last, 0);
    }
    return result;
  }

  bubbleUp(e: DtSolution, index0: i32): void {
    const q = this.q;
    let index = index0;
    while (index > 0) {
      const pi = (index - 1) >> 1;
      if (pi < 0 || pi >= q.length) {
        fault();
        return;
      }
      const parent = q[pi];
      if (e.compare(parent) > 0) {
        break;
      }
      if (index >= q.length) {
        fault();
        return;
      }
      q[index] = parent;
      index = pi;
    }
    if (index < 0 || index >= q.length) {
      fault();
      return;
    }
    q[index] = e;
  }

  bubbleDown(e: DtSolution, index0: i32): void {
    const q = this.q;
    let index = index0;
    const len = toI32(q.length);
    // Below this, 2 * index + 2 fits.
    if (index < 0 || index > 1073741822) {
      fault();
      return;
    }
    let right = index * 2 + 2;
    while (right < len) {
      // The children of a heap slot, inside the heap.
      if (right <= 0 || right >= q.length) {
        fault();
        return;
      }
      const left = right - 1;
      const lc = q[left];
      const rc = q[right];
      let minI = right;
      let minC = rc;
      if (lc.compare(rc) < 0) {
        minI = left;
        minC = lc;
      }
      const stop = e.compare(minC) <= 0;
      if (index < 0 || index >= q.length) {
        fault();
        return;
      }
      if (stop) {
        q[index] = e;
        return;
      }
      q[index] = minC;
      index = minI;
      if (index > 1073741822) {
        fault();
        return;
      }
      right = index * 2 + 2;
    }
    if (right <= 0) {
      fault();
      return;
    }
    const left = right - 1;
    if (left < len) {
      if (left >= q.length) {
        fault();
        return;
      }
      const child = q[left];
      if (e.compare(child) > 0) {
        if (index < 0 || index >= q.length) {
          fault();
          return;
        }
        q[index] = child;
        index = left;
      }
    }
    if (index < 0 || index >= q.length) {
      fault();
      return;
    }
    q[index] = e;
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
    const s = queue.removeFirst(first);
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
const dtExpand = (
  cache: DtCache,
  s: DtSolution,
  root: DtPiece,
  leading: i32,
  subsequent: i32,
  queue: DtQueue,
): void => {
  // dart_style binds the expand pieces before the i-th to unsplit afresh for
  // every new solution. Binding depends only on the solution's states, so
  // the same bindings are made once here, on `base`, and each new solution
  // starts from a copy of it: the same solutions, with the same bindings in
  // the same order.
  const ex = s.expand;
  const al = s.allowed;
  const base = new DtSolution(s.own, s.binds, ex.length > 1 ? dtCopyAllowed(al) : null);
  for (let i = 0; i < ex.length; i++) {
    const ep = ex[i];
    let prev = ep;
    if (i > 0) {
      prev = ex[i - 1];
    }
    let states = dtStates(ep);
    if (al !== null) {
      const st = al.get(ep.id);
      if (st !== undefined) {
        states = st;
      }
    }
    let own = s.own;
    let binds = s.binds;
    let allowed = al;
    if (i > 0) {
      const b = base;
      b.beginBinding(cache);
      b.bind(prev, S_UNSPLIT);
      b.bc = null;
      if (b.deadEnd) {
        // Every later piece would bind this prefix too.
        return;
      }
      own = b.own;
      binds = b.binds;
      allowed = b.allowed;
    }
    for (const state of states) {
      const e = new DtSolution(own, binds, dtCopyAllowed(allowed));
      e.beginBinding(cache);
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

const dtCopyAllowed = (al: Map<i32, i32[]> | null): Map<i32, i32[]> | null => {
  if (al === null) {
    return null;
  }
  const m = new Map<i32, i32[]>();
  for (const k of al.keys()) {
    m.set(k, al.get(k) ?? []);
  }
  return m;
};

/** Solution._format: runs a CodeWriter over the tree for `s`, measuring. */
const dtRunWriter = (cache: DtCache, s: DtSolution, root: DtPiece, leading: i32, subsequent: i32, stamp: i32): void => {
  const w = cache.writer();
  const d = cache.depth;
  // writer() keeps a writer for every depth up to this one.
  if (d < 0 || d >= toI32(cache.writers.length)) {
    fault();
    return;
  }
  cache.depth = d + 1;
  w.reset(s, leading, subsequent, false, stamp);
  w.format(root, false);
  w.finishLine();
  s.expand = w.expandPieces;
  cache.depth = d;
};

/** Writes the code for solution `s` of `root` to the cache's builder. */
export const dtEmit = (cache: DtCache, s: DtSolution, root: DtPiece, leading: i32, subsequent: i32): void => {
  const w = cache.writer();
  const d = cache.depth;
  if (d < 0 || d >= toI32(cache.writers.length)) {
    fault();
    return;
  }
  cache.depth = d + 1;
  w.reset(s, leading, subsequent, true, 0);
  const b = cache.builder;
  if (b !== null) {
    b.indent = leading;
  }
  w.format(root, false);
  cache.depth = d;
};

// ---------------------------------------------------------------------------
// CodeWriter.

// Shape modes.
const SM_MERGE: i32 = 0;
const SM_BLOCK: i32 = 1;
const SM_BEFORE_HEADLINE: i32 = 2;
const SM_AFTER_HEADLINE: i32 = 3;
const SM_OTHER: i32 = 4;

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
  indColl: i32[]; // 3.7: how much of each level can collapse
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
    this.indColl = new Array<i32>(16);
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
    const stamp = this.cache.nextStamp();
    this.stamp = stamp;
    const so = this.cache.stampOf;
    const st = this.cache.stateOf;
    let b = sol.binds;
    while (b !== null) {
      // The cache holds a slot for every piece id. (A negative id is a u32
      // past any length: one compare an array tests both ends.)
      const id = toU32(b.piece.id);
      if (id >= toU32(so.length) || id >= toU32(st.length)) {
        fault();
        return;
      }
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
    const id = toU32(piece.id);
    const so = this.cache.stampOf;
    const st = this.cache.stateOf;
    if (id >= toU32(so.length) || id >= toU32(st.length)) {
      fault();
      return -1;
    }
    if (so[id] === this.stamp) {
      return st[id];
    }
    return -1;
  }

  state(piece: DtPiece): i32 {
    const s = this.stateIfBound(piece);
    return s < 0 ? S_UNSPLIT : s;
  }

  /** Solution.tryBindByPageWidth's bind, mirrored into the stamped states. */
  bindNow(piece: DtPiece, state: i32): void {
    const sol = this.sol;
    const before = sol.binds;
    sol.bind(piece, state);
    const so = this.cache.stampOf;
    const st = this.cache.stateOf;
    let b = sol.binds;
    while (b !== null) {
      if (before !== null && b === before) {
        break;
      }
      const id = b.piece.id;
      if (id < 0 || id >= so.length || id >= st.length) {
        fault();
        return;
      }
      if (so[id] !== this.stamp) {
        so[id] = this.stamp;
        st[id] = b.state;
      }
      b = b.parent;
    }
  }

  pushInd(kind: i32, spaces: i32): void {
    this.pushIndColl(kind, spaces, 0);
  }

  pushIndColl(kind: i32, spaces: i32, coll: i32): void {
    const n = this.nInd;
    if (n >= toI32(this.indType.length)) {
      // Doubles the three, in place.
      let cap = n;
      if (n >= 0 && n <= 1073741823) {
        cap = n + n;
      }
      dtPadInts(this.indType, cap);
      dtPadInts(this.indSpaces, cap);
      dtPadInts(this.indColl, cap);
    }
    const indType = this.indType;
    const indSpaces = this.indSpaces;
    const indColl = this.indColl;
    if (n < 0 || n >= indType.length || n >= indSpaces.length || n >= indColl.length) {
      fault();
      return;
    }
    indType[n] = kind;
    indSpaces[n] = spaces;
    indColl[n] = coll;
    this.nInd = n + 1;
  }

  /** _pushIndent3Dot7. */
  pushIndent37(spaces: i32, canCollapse: boolean): void {
    const n = this.nInd;
    const indSpaces = this.indSpaces;
    const indColl = this.indColl;
    // reset pushed the first level, and pops match pushes.
    if (n <= 0 || n > indSpaces.length || n > indColl.length) {
      fault();
      return;
    }
    const top = n - 1;
    const parentIndent = indSpaces[top];
    const parentCollapse = indColl[top];
    if (parentCollapse === spaces) {
      this.pushIndColl(IN_NONE, parentIndent, 0);
    } else if (canCollapse) {
      this.pushIndColl(IN_NONE, add32(parentIndent, spaces), spaces);
    } else {
      this.pushIndColl(IN_NONE, add32(parentIndent, spaces), 0);
    }
  }

  pushCollapsibleIndent(): void {
    if (dtIs37()) {
      this.pushIndent37(dtIndentSpaces(IN_EXPRESSION), true);
    } else {
      this.pushIndent(IN_CONTROL_FLOW_CLAUSE);
    }
  }

  newGen(): void {
    this.nMarked = 0;
    this.gen = this.cache.nextMark();
  }

  /** items + 1. */
  bumpItems(): void {
    const k = this.items;
    if (k < 2147483647) {
      this.items = k + 1;
    } else {
      fault();
    }
  }

  write(text: string, len: i32, soft: boolean): void {
    this.flushWhitespace();
    if (this.emit) {
      const b = this.cache.builder;
      if (b !== null) {
        b.text(text);
      }
      this.bumpItems();
      return;
    }
    this.column = add32(this.column, len);
    if (soft) {
      this.softChars = add32(this.softChars, len);
    } else {
      this.softChars = 0;
    }
    const un = this.unsolved;
    const nu = toI32(un.length);
    const nMarked = this.nMarked;
    if (!this.foundExpandLine && nu > nMarked) {
      if (nMarked < 0) {
        fault();
        return;
      }
      const gen = this.gen;
      const lp = this.linePieces;
      for (let i = nMarked; i < nu && i < un.length; i++) {
        const p = un[i];
        if (p.mark !== gen) {
          p.mark = gen;
          const nl = this.nLine;
          // nLine never passes linePieces' length.
          if (nl < 0 || nl > lp.length || nl >= 2147483647) {
            fault();
            return;
          }
          if (nl < lp.length) {
            lp[nl] = p;
          } else {
            lp.push(p);
          }
          this.nLine = nl + 1;
        }
      }
      this.nMarked = nu;
    }
  }

  pushIndent(kind: i32): void {
    if (dtIs37()) {
      this.pushIndent37(dtIndentSpaces(kind), false);
      return;
    }
    const n = this.nInd;
    const indType = this.indType;
    const indSpaces = this.indSpaces;
    if (n <= 0 || n > indType.length || n > indSpaces.length) {
      fault();
      return;
    }
    const top = n - 1;
    const pt = indType[top];
    const base = indSpaces[top];
    let offset = dtIndentSpaces(kind);
    if (pt === IN_ASSIGNMENT && kind === IN_INFIX) {
      offset = 0;
    } else if (pt === IN_CONTROL_FLOW_CLAUSE && (kind === IN_EXPRESSION || kind === IN_INFIX)) {
      offset = 0;
    }
    this.pushInd(kind, add32(base, offset));
  }

  popIndent(): void {
    const n = this.nInd;
    if (n > 0) {
      this.nInd = n - 1;
    } else {
      fault();
    }
  }

  /** The innermost indentation. */
  topSpaces(): i32 {
    const n = this.nInd;
    const indSpaces = this.indSpaces;
    if (n > 0 && n <= indSpaces.length) {
      return indSpaces[n - 1];
    }
    fault();
    return 0;
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
      const nf = this.nFmt;
      if (nf < 0) {
        fault();
        return;
      }
      this.applyNewline(nf - 1, SH_OTHER);
      this.pendingIndent = flushLeft ? 0 : this.topSpaces();
    }
    if (ws > this.pendingWs) {
      this.pendingWs = ws;
    }
  }

  setShapeMode(mode: i32): void {
    const nf = this.nFmt;
    const fmtMode = this.fmtMode;
    if (nf > 0 && nf <= fmtMode.length) {
      fmtMode[nf - 1] = mode;
    } else {
      fault();
    }
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
    const subsequent = this.topSpaces();
    const s = this.cache.find(piece, this.stateIfBound(piece), indent, subsequent);
    this.pendingIndent = 0;
    this.flushWhitespace();
    if (this.emit) {
      dtEmit(this.cache, s, piece, indent, subsequent);
      this.bumpItems();
      return;
    }
    this.sol.overflow = add32(this.sol.overflow, s.overflow);
    this.sol.subtree = add32(this.sol.subtree, s.cost());
  }

  formatInline(piece: DtPiece): void {
    if (
      !this.emit &&
      piece.kind === PK_CODE &&
      piece.list.length === 0 &&
      piece.list2.length === 0 &&
      piece.lines.length === 1 &&
      !dtHasStates(piece)
    ) {
      // The common leaf, measured: what the general path below does for
      // it, where its shape stays inline.
      const lines = piece.lines;
      const lens = piece.lens;
      // A text piece has a length for each line.
      if (lines.length < 1 || lens.length < 1) {
        fault();
        return;
      }
      this.write(lines[0], lens[0], piece.soft);
      const n = this.nFmt;
      if (n > 0) {
        const fmtPiece = this.fmtPiece;
        if (n > fmtPiece.length) {
          fault();
          return;
        }
        const parent = fmtPiece[n - 1];
        if (
          !dtIs37() &&
          dtMayRefuseInline(parent.kind) &&
          (dtAllowed(parent, this.state(parent), piece) & SH_INLINE) === 0
        ) {
          this.sol.invalidate(parent);
        }
      }
      return;
    }
    let unsolved = !this.emit && dtHasStates(piece) && this.stateIfBound(piece) < 0;
    if (unsolved && !dtV313()) {
      // Before 3.13, pieces are bound by page width while formatting.
      const indSpaces = this.indSpaces;
      if (indSpaces.length < 1) {
        fault();
        return;
      }
      const fixed = dtFixedState(piece, sub32(this.pageWidth, indSpaces[0]));
      if (fixed >= 0) {
        this.bindNow(piece, fixed);
        unsolved = false;
      }
    }
    if (unsolved) {
      this.unsolved.push(piece);
    }
    const n0 = this.nFmt;
    if (n0 >= toI32(this.fmtShape.length)) {
      // Doubles the two, in place.
      let cap = n0;
      if (n0 >= 0 && n0 <= 1073741823) {
        cap = n0 + n0;
      }
      dtPadInts(this.fmtShape, cap);
      dtPadInts(this.fmtMode, cap);
    }
    const fmtPiece = this.fmtPiece;
    // nFmt never passes fmtPiece's length.
    if (n0 < 0 || n0 > fmtPiece.length) {
      fault();
      return;
    }
    if (n0 < fmtPiece.length) {
      fmtPiece[n0] = piece;
    } else {
      fmtPiece.push(piece);
    }
    const fmtShape = this.fmtShape;
    const fmtMode = this.fmtMode;
    if (n0 >= fmtShape.length || n0 >= fmtMode.length) {
      fault();
      return;
    }
    fmtShape[n0] = SH_INLINE;
    fmtMode[n0] = SM_MERGE;
    this.nFmt = n0 + 1;
    dtFormatPiece(this, piece, this.state(piece));
    this.nFmt = n0;
    const shapes = this.fmtShape;
    if (n0 >= shapes.length) {
      fault();
      return;
    }
    const shape = shapes[n0];
    if (unsolved) {
      const un = this.unsolved;
      if (un.length < 1) {
        fault();
        return;
      }
      un.pop();
      if (this.nMarked > toI32(un.length)) {
        this.nMarked = toI32(un.length);
      }
    }
    if (n0 > 0 && !this.emit) {
      const pieces = this.fmtPiece;
      if (n0 > pieces.length) {
        fault();
        return;
      }
      const parent = pieces[n0 - 1];
      if (dtIs37()) {
        if (shape !== SH_INLINE && dtAllowed(parent, this.state(parent), piece) === SH_INLINE) {
          this.sol.invalidate(parent);
        }
      } else if (shape !== SH_INLINE || dtMayRefuseInline(parent.kind)) {
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
      this.bumpItems();
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
        this.bumpItems();
      }
    } else if (ws === WS_SPACE) {
      if (this.emit) {
        const b = this.cache.builder;
        if (b !== null) {
          b.text(" ");
        }
        this.bumpItems();
      }
      const col = this.column;
      const soft = this.softChars;
      if (col < 2147483647 && soft < 2147483647) {
        this.column = col + 1;
        this.softChars = soft + 1;
      } else {
        fault();
      }
    }
    this.pendingWs = WS_NONE;
  }

  finishLine(): void {
    const column = this.column;
    const pageWidth = this.pageWidth;
    if (column > pageWidth) {
      let overflow = sub32(column, pageWidth);
      const softChars = this.softChars;
      if (dtV313() && softChars > 0) {
        if (softChars >= overflow) {
          overflow = 1;
        } else {
          // overflow > softChars - 1 >= 0: the u32 difference is exact.
          overflow = toI32(toU32(overflow) - toU32(softChars - 1));
        }
      }
      this.sol.overflow = add32(this.sol.overflow, overflow);
    }
    if (this.foundExpandLine) {
      return;
    }
    const nl = this.nLine;
    if (nl > 0 && (this.column > this.pageWidth || !this.sol.valid)) {
      const lp = this.linePieces;
      if (nl > lp.length) {
        fault();
        return;
      }
      for (let i = 0; i < nl && i < lp.length; i++) {
        this.expandPieces.push(lp[i]);
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
    const fmtMode = this.fmtMode;
    const fmtShape = this.fmtShape;
    if (i >= fmtMode.length || i >= fmtShape.length) {
      fault();
      return;
    }
    const mode = fmtMode[i];
    const cur = fmtShape[i];
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
    fmtShape[i] = r;
  }

  /** TextPiece._formatLines. */
  formatLines(p: DtPiece, soft: boolean): void {
    const lines = p.lines;
    const lens = p.lens;
    const n = toI32(lines.length);
    if (n > 1) {
      this.setShapeMode(SM_BEFORE_HEADLINE);
    }
    // A text piece has a length for each line, and a line at least.
    if (lines.length < 1 || lens.length < 1) {
      fault();
      return;
    }
    this.write(lines[0], lens[0], soft);
    if (n > 1) {
      this.setShapeMode(SM_AFTER_HEADLINE);
    }
    for (let i = 1; i < n; i++) {
      this.newline(false, true);
      if (i >= lines.length || i >= lens.length) {
        fault();
        return;
      }
      this.write(lines[i], lens[i], soft);
    }
  }
}

/**
 * `n` zeroes, as `new Array<i32>(n)` made them: an array of a u16 length
 * needs no check, and only the rest past 65535 is pushed.
 */
const dtCacheZeros = (n: i32): i32[] => {
  if (n >= 0 && n <= 65535) {
    return new Array<i32>(toU16(n));
  }
  if (n < 0) {
    fault();
    const none: i32[] = [];
    return none;
  }
  const xs = new Array<i32>(65535);
  dtPadInts(xs, n);
  return xs;
};

/** Grows `xs` in place to `n` elements, the new ones 0. */
const dtPadInts = (xs: i32[], n: i32): void => {
  while (xs.length < n) {
    xs.push(0);
  }
};

const dtReq = (p: DtPiece | null): DtPiece => {
  if (p === null) {
    // A piece's builder sets every child its format reads.
    fault();
    return new DtPiece(0, PK_SPACE);
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
    case PK_ASSIGN37: {
      const atOp = s === S_3_1;
      if (atOp) {
        w.pushIndent(IN_EXPRESSION);
      }
      const left = p.a;
      if (left !== null) {
        w.format(left, false);
      }
      w.pushIndent(IN_EXPRESSION);
      w.format(dtReq(p.b), false);
      w.popIndent();
      w.splitIf(atOp);
      const indentRight = s === S_1_1 && !p.b1;
      if (indentRight) {
        w.pushIndent(IN_EXPRESSION);
      }
      w.format(dtReq(p.c), false);
      if (indentRight) {
        w.popIndent();
      }
      if (atOp) {
        w.popIndent();
      }
      return;
    }
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
        for (let i = 0; i < n && i < calls.length; i++) {
          w.format(calls[i], false);
        }
      } else if (s === CHAIN_SPLIT_AFTER_PROPERTIES) {
        w.pushIndent(p.i2);
        w.setShapeMode(SM_BEFORE_HEADLINE);
        w.format(dtReq(p.a), false);
        const i0 = p.i0;
        // The properties are some of the calls.
        if (i0 < 0 || i0 > n) {
          fault();
          return;
        }
        for (let i = 0; i < i0 && i < calls.length; i++) {
          w.format(calls[i], false);
        }
        w.setShapeMode(SM_AFTER_HEADLINE);
        for (let i = i0; i >= 0 && i < n && i < calls.length; i++) {
          const call = calls[i];
          w.newline();
          w.format(call, i < n - 1);
        }
        w.popIndent();
      } else if (s === CHAIN_BLOCK_TRAILING_CALL) {
        if (p.b0) {
          w.setShapeMode(SM_OTHER);
        }
        w.format(dtReq(p.a), false);
        for (let i = 0; i < n && i < calls.length; i++) {
          w.format(calls[i], false);
        }
      } else {
        w.pushIndent(p.i2);
        w.setShapeMode(SM_BEFORE_HEADLINE);
        w.format(dtReq(p.a), false);
        w.setShapeMode(SM_AFTER_HEADLINE);
        for (let i = 0; i < n && i < calls.length; i++) {
          const call = calls[i];
          w.newline();
          w.format(call, i < n - 1);
        }
        w.popIndent();
      }
      return;
    }
    case PK_CLAUSE: {
      w.format(dtReq(p.a), false);
      w.pushIndent(IN_EXPRESSION);
      const clauses = p.list;
      for (let i = 0; i < clauses.length; i++) {
        const clause = clauses[i];
        if (p.b0 && i === 0) {
          w.splitIf(s === S_SPLIT);
        } else {
          w.splitIf(s !== S_UNSPLIT);
        }
        w.format(clause, false);
      }
      w.popIndent();
      return;
    }
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
      const heads = p.list;
      const bodies = p.list2;
      const ints = p.ints;
      const n = toI32(heads.length);
      // A body and a flag for each head.
      if (bodies.length < n || ints.length < n) {
        fault();
        return;
      }
      for (let i = 0; i < n && i < heads.length && i < bodies.length && i < ints.length; i++) {
        const isBlock = ints[i] === 1;
        const head = heads[i];
        const body = bodies[i];
        w.format(head, false);
        if (!isBlock) {
          w.pushIndent(IN_BLOCK);
          w.splitIf(s === S_SPLIT);
        }
        w.format(body, false);
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
        w.pushCollapsibleIndent();
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
        w.pushCollapsibleIndent();
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
      if (dtIs37()) {
        // _InfixPiece3Dot7.
        for (let i = 0; i < n && i < ops.length; i++) {
          w.format(ops[i], s === S_SPLIT && i > 0 && i < n - 1);
          if (i < n - 1) {
            w.splitIf(s === S_SPLIT);
          }
        }
        w.popIndent();
        return;
      }
      // An infix piece has an operand at least.
      if (ops.length < 1) {
        fault();
        return;
      }
      const op0 = ops[0];
      if (p.b0) {
        w.setShapeMode(SM_BEFORE_HEADLINE);
      }
      w.format(op0, false);
      if (p.b0) {
        w.setShapeMode(SM_AFTER_HEADLINE);
      }
      for (let i = 1; i < n && i < ops.length; i++) {
        const op = ops[i];
        w.splitIf(s === S_SPLIT);
        if (p.b0) {
          w.pushIndent(IN_BLOCK);
        }
        w.format(op, s === S_SPLIT && i < n - 1);
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
      for (let i = 0; i < n && i < els.length; i++) {
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
      const rest = p.list2;
      const i0 = p.i0;
      // The first i0 of list2 follow the content.
      if (i0 < 0 || (content !== null && i0 > rest.length)) {
        fault();
        return;
      }
      if (content !== null) {
        w.format(content, false);
        for (let i = 0; i < i0 && i < rest.length; i++) {
          const x = rest[i];
          w.space();
          w.format(x, false);
        }
        if (s === LIST_ELEMENT_APPEND_COMMA) {
          w.write(",", 1, true);
        }
        if (p.delim.length > 0) {
          w.space();
          w.write(p.delim, toI32(p.delim.length), false);
        }
      }
      for (let i = i0; i >= 0 && i < rest.length; i++) {
        const x = rest[i];
        if (i > 0 || content !== null) {
          w.space();
        }
        w.format(x, false);
      }
      return;
    }
    case PK_SEQUENCE: {
      const els = p.list;
      const n = toI32(els.length);
      w.pushIndent(IN_NONE);
      for (let i = 0; i < n && i < els.length; i++) {
        const el = els[i];
        let next = el;
        const j = i + 1;
        if (j < els.length) {
          next = els[j];
        }
        w.format(el, true);
        if (i < n - 1) {
          w.popIndent();
          w.pushIndent(next.i0);
          w.newline(el.b0, false);
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
      const clauses = p.list;
      for (let i = 0; i < nc && i < clauses.length; i++) {
        const clause = clauses[i];
        w.splitIf(s === PRIMARY_BEFORE_CLAUSES || (s === PRIMARY_BETWEEN_CLAUSES && i !== 0) || s === S_SPLIT);
        w.format(clause, false);
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
      const vars = p.list;
      for (let i = 0; i < vars.length; i++) {
        const v = vars[i];
        if (i > 0) {
          w.splitIf(s !== S_UNSPLIT);
        }
        w.format(v, false);
      }
      if (s === VAR_BETWEEN) {
        w.popIndent();
      }
      return;
    }
    default:
      // Every piece kind the builders make is a case above.
      fault();
      return;
  }
};
