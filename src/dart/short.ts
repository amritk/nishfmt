// dart_style's short style back end (lib/src/short/: Chunk, ChunkBuilder,
// NestingLevel, NestingBuilder, the Rule classes, LineWriter, LineSplitter,
// SolveState, SolveStateQueue, RuleSet and SplitSet): the same chunks and
// rules, searched in the same order with the same costs.
//
// Where dart_style would throw (a rule index that is stale or missing, two
// solve states it believes cannot be equal), DTS_FAIL is set and the file is
// left alone, as `dart format` reports an error for it.
//
// Ported from dart_style 3.1.14-wip at 5a9534fad9ff, the commit Dart SDK
// 3.14.1 pins (BSD-3-Clause, Copyright the Dart project authors).

import { add32, sliceI32s, strUtf16Len, sub32 } from "../core/arr";
import { fault } from "../core/fault";

// Cost.
export const DTS_COST_ARROW: i32 = 0;
export const DTS_COST_NORMAL: i32 = 1;
export const DTS_COST_ASSIGN: i32 = 1;
export const DTS_COST_ASSIGN_BLOCK: i32 = 2;
export const DTS_COST_POSITIONAL_ARGUMENTS: i32 = 2;
export const DTS_COST_SINGLE_ELEMENT_LIST: i32 = 2;
export const DTS_COST_SPLIT_BLOCKS: i32 = 2;
export const DTS_COST_CONSTRUCTOR_NAME: i32 = 4;
export const DTS_COST_INDEX: i32 = 4;
export const DTS_COST_TYPE_ARGUMENT: i32 = 4;
export const DTS_COST_PARAMETER_TYPE: i32 = 4;

// Indent.
export const DTS_INDENT_BLOCK: i32 = 2;
export const DTS_INDENT_CASCADE: i32 = 2;
export const DTS_INDENT_EXPRESSION: i32 = 4;
export const DTS_INDENT_CONSTRUCTOR_INITIALIZER: i32 = 4;

// Rule kinds.
export const DTS_RULE: i32 = 0;
export const DTS_RULE_POSITIONAL: i32 = 1;
export const DTS_RULE_NAMED: i32 = 2;
export const DTS_RULE_COMBINATOR: i32 = 3;
export const DTS_RULE_TYPE_ARGUMENT: i32 = 4;

const DTS_UNSPLIT: i32 = 0;
export const DTS_MUST_SPLIT: i32 = -1;
const DTS_FULL_SPLIT_CONSTRAINT: i32 = -2;
// No constraint (dart_style's null).
export const DTS_NONE: i32 = -100;

// [0] the next id, [1] a stamp for marks, [2] set when dart_style would throw.
export const DTS_STATE = new Int32Array(4);

const dtsSetIn = (st: Int32Array, k: i32, v: i32): void => {
  if (k >= 0 && k < st.length) {
    st[k] = v;
  } else {
    fault();
  }
};

const dtsGetIn = (st: Int32Array, k: i32): i32 => {
  if (k >= 0 && k < st.length) {
    return st[k];
  }
  fault();
  return 1;
};

/** st[k] + 1, stored back; run.ts clears the counters for each file. */
const dtsBumpIn = (st: Int32Array, k: i32): i32 => {
  if (k >= 0 && k < st.length) {
    const v = st[k];
    if (v < 2147483647) {
      st[k] = v + 1;
      return v + 1;
    }
  }
  fault();
  return 0;
};

export const dtsFail = (): void => {
  dtsSetIn(DTS_STATE, 2, 1);
};

/** Whether dtsFail was called since run.ts cleared DTS_STATE. */
export const dtsFailed = (): boolean => dtsGetIn(DTS_STATE, 2) !== 0;

const dtsBump = (k: i32): i32 => dtsBumpIn(DTS_STATE, k);

const dtsNextId = (): i32 => dtsBump(0);

const dtsStamp = (): i32 => dtsBump(1);

/** String length in UTF-16 code units, for a UTF-8 string. */
export const dtsLen16 = (s: string): i32 => strUtf16Len(s);

// ---------------------------------------------------------------------------
// Rules.

/** Rule and its subclasses, by kind. */
export class DtsRule {
  id: i32;
  kind: i32;
  cost0: i32;
  index: i32 = -1;
  hard: boolean = false;
  // SplitContainingRule._trackInnerRules.
  track: boolean = true;
  // The constraints in the order they were added, and the rules they
  // constrain in first-added order (constrainedRules).
  cOther: DtsRule[];
  cMin: i32[];
  cMax: i32[];
  cVal: i32[];
  keys: DtsRule[];
  all: DtsRule[];
  allValid: boolean = false;
  // The argument chunks of positional, named and type argument rules (the
  // null chunk stands in for a missing one), the combinators and the names
  // after each.
  args: DtsChunk[];
  leading: i32 = 0;
  trailing: i32 = 0;
  combs: DtsChunk[];
  names: DtsChunk[];
  nameSet: i32[];
  nSets: i32 = 0;
  mark: i32 = 0; // live-rule membership
  tmark: i32 = 0; // allConstrainedRules traversal
  smark: i32 = 0; // a splitter's distinct rules

  constructor(kind: i32, cost: i32) {
    this.id = dtsNextId();
    this.kind = kind;
    this.cost0 = cost;
    this.cOther = [];
    this.cMin = [];
    this.cMax = [];
    this.cVal = [];
    this.keys = [];
    this.all = [];
    this.args = [];
    this.combs = [];
    this.names = [];
    this.nameSet = [];
  }

  cost(): i32 {
    return this.kind === DTS_RULE_TYPE_ARGUMENT ? DTS_COST_TYPE_ARGUMENT : this.cost0;
  }

  numValues(): i32 {
    switch (this.kind) {
      case DTS_RULE_POSITIONAL: {
        const n = toI32(this.args.length);
        // A chunk an argument: far below this.
        if (n > 1073741823) {
          fault();
          return 2;
        }
        const blocks = this.leading > 0 || this.trailing > 0;
        if (n > 1) {
          if (blocks) {
            return n + 3;
          }
          return n + 2;
        }
        if (blocks) {
          return n + 2;
        }
        return n + 1;
      }
      case DTS_RULE_NAMED:
        return 3;
      case DTS_RULE_COMBINATOR:
        return this.nSets === 2 ? 5 : 3;
      case DTS_RULE_TYPE_ARGUMENT: {
        const n = toI32(this.args.length);
        if (n === 1) {
          return 2;
        }
        if (n > 1073741823) {
          fault();
          return 2;
        }
        return n + 2;
      }
      default:
        return 2;
    }
  }

  fullySplitValue(): i32 {
    // Every rule has two values at least.
    const v = this.numValues();
    if (v < 1) {
      fault();
      return 0;
    }
    return v - 1;
  }

  splitsOnInnerRules(): boolean {
    if (this.kind === DTS_RULE_POSITIONAL || this.kind === DTS_RULE_NAMED) {
      return this.track;
    }
    return true;
  }

  harden(): void {
    this.hard = true;
  }

  isSplit(value: i32, chunk: DtsChunk): boolean {
    if (this.kind === DTS_RULE_TYPE_ARGUMENT) {
      if (value === DTS_UNSPLIT) {
        return false;
      }
      if (value === this.fullySplitValue()) {
        return true;
      }
      const args = this.args;
      const i = sub32(toI32(args.length), value);
      if (i < 0 || i >= args.length) {
        dtsFail();
        return true;
      }
      return chunk === args[i];
    }
    if (this.hard) {
      return true;
    }
    if (value === DTS_UNSPLIT) {
      return false;
    }
    return this.isSplitAtValue(value, chunk);
  }

  isSplitAtValue(value: i32, chunk: DtsChunk): boolean {
    switch (this.kind) {
      case DTS_RULE_POSITIONAL: {
        const args = this.args;
        const n = toI32(args.length);
        if (n === 0 || args.length < 1) {
          dtsFail();
          return true;
        }
        if (value === 1) {
          return chunk === args[0];
        }
        if (value <= n) {
          // Values count from 1 here; a lower one is outside args.
          if (value < 1) {
            fault();
            return true;
          }
          // n >= value > value - 1 >= 0: the u32 difference is exact.
          const k = toI32(toU32(n) - toU32(value - 1));
          if (k < 0 || k >= args.length) {
            fault();
            return true;
          }
          return chunk === args[k];
        }
        if (n < 2147483647 && value === n + 1) {
          const leading = this.leading;
          for (let i = 0; i < leading; i++) {
            if (i >= args.length) {
              fault();
              return true;
            }
            if (chunk === args[i]) {
              return false;
            }
          }
          for (let i = sub32(n, this.trailing); i < n; i++) {
            if (i < 0 || i >= args.length) {
              fault();
              return true;
            }
            if (chunk === args[i]) {
              return false;
            }
          }
          return true;
        }
        return true;
      }
      case DTS_RULE_NAMED:
        if (value === 1) {
          const args = this.args;
          if (args.length < 1) {
            dtsFail();
            return true;
          }
          return chunk === args[0];
        }
        return true;
      case DTS_RULE_COMBINATOR:
        if (value === 1) {
          return this.combs.indexOf(chunk) >= 0;
        }
        if (value === 2) {
          return this.isCombinatorSplit(0, chunk);
        }
        if (value === 3) {
          if (this.nSets === 2) {
            return this.isCombinatorSplit(1, chunk);
          }
          return true;
        }
        return true;
      default:
        return true;
    }
  }

  isCombinatorSplit(set: i32, chunk: DtsChunk): boolean {
    if (this.combs.indexOf(chunk) >= 0) {
      return true;
    }
    const names = this.names;
    const nameSet = this.nameSet;
    for (let i = 0; i < names.length; i++) {
      // addName adds a name and its set together.
      if (i >= nameSet.length) {
        fault();
        return true;
      }
      if (nameSet[i] === set && names[i] === chunk) {
        return true;
      }
    }
    return false;
  }

  /** The value `other` must take when this rule is `value`, or DTS_NONE. */
  constrain(value: i32, other: DtsRule): i32 {
    if (value === DTS_UNSPLIT) {
      return DTS_NONE;
    }
    const cOther = this.cOther;
    const cMin = this.cMin;
    const cMax = this.cMax;
    const cVal = this.cVal;
    const n = toI32(cOther.length);
    // The four grow and shrink together.
    if (cMin.length < n || cMax.length < n || cVal.length < n) {
      fault();
      return DTS_NONE;
    }
    for (let i = 0; i < n && i < cOther.length && i < cMin.length && i < cMax.length && i < cVal.length; i++) {
      if (cOther[i] !== other) {
        continue;
      }
      if (value >= cMin[i] && value <= cMax[i]) {
        const v = cVal[i];
        if (v === DTS_FULL_SPLIT_CONSTRAINT) {
          return other.fullySplitValue();
        }
        return v;
      }
    }
    return DTS_NONE;
  }

  addConstraint(value: i32, other: DtsRule, otherValue: i32): void {
    this.addRangeConstraint(value, value, other, otherValue);
  }

  addRangeConstraint(min: i32, max: i32, other: DtsRule, otherValue: i32): void {
    if (this.keys.indexOf(other) < 0) {
      this.keys.push(other);
    }
    this.cOther.push(other);
    this.cMin.push(min);
    this.cMax.push(max);
    this.cVal.push(otherValue);
  }

  constrainWhenSplit(other: DtsRule): void {
    this.addRangeConstraint(1, 100000, other, DTS_FULL_SPLIT_CONSTRAINT);
  }

  constrainWhenFullySplit(other: DtsRule): void {
    this.addConstraint(this.fullySplitValue(), other, DTS_FULL_SPLIT_CONSTRAINT);
  }

  forgetUnusedRules(): void {
    let unused = false;
    for (const k of this.keys) {
      if (k.index < 0) {
        unused = true;
      }
    }
    if (unused) {
      const o: DtsRule[] = [];
      const mn: i32[] = [];
      const mx: i32[] = [];
      const v: i32[] = [];
      const cOther = this.cOther;
      const cMin = this.cMin;
      const cMax = this.cMax;
      const cVal = this.cVal;
      const n = cOther.length;
      if (cMin.length < n || cMax.length < n || cVal.length < n) {
        fault();
        return;
      }
      for (let i = 0; i < cOther.length && i < cMin.length && i < cMax.length && i < cVal.length; i++) {
        const other = cOther[i];
        const lo = cMin[i];
        const hi = cMax[i];
        const val = cVal[i];
        if (other.index >= 0) {
          o.push(other);
          mn.push(lo);
          mx.push(hi);
          v.push(val);
        }
      }
      this.cOther = o;
      this.cMin = mn;
      this.cMax = mx;
      this.cVal = v;
      const ks: DtsRule[] = [];
      for (const k of this.keys) {
        if (k.index >= 0) {
          ks.push(k);
        }
      }
      this.keys = ks;
    }
    this.allValid = false;
  }

  /** allConstrainedRules: this rule and every rule it transitively constrains. */
  allConstrainedRules(): DtsRule[] {
    if (this.allValid) {
      return this.all;
    }
    const out: DtsRule[] = [];
    const stamp = dtsStamp();
    dtsTraverse(out, this, stamp);
    this.all = out;
    this.allValid = true;
    return out;
  }

  beforeArgument(chunk: DtsChunk): void {
    this.args.push(chunk);
  }

  disableSplitOnInnerRules(): void {
    this.track = false;
  }

  enableSplitOnInnerRules(): void {
    this.track = true;
  }

  /** PositionalRule.addNamedArgsConstraints. */
  addNamedArgsConstraints(rule: DtsRule): void {
    this.constrainWhenFullySplit(rule);
    this.addRangeConstraint(1, this.fullySplitValue(), rule, DTS_MUST_SPLIT);
  }

  addCombinator(chunk: DtsChunk): void {
    if (this.combs.indexOf(chunk) < 0) {
      this.combs.push(chunk);
    }
    const k = this.nSets;
    if (k < 2147483647) {
      this.nSets = k + 1;
    } else {
      fault();
    }
  }

  addName(chunk: DtsChunk): void {
    this.names.push(chunk);
    const k = this.nSets;
    if (k >= -2147483647) {
      this.nameSet.push(toI32(toI64(k) - toI64(1)));
    } else {
      fault();
    }
  }
}

const dtsTraverse = (out: DtsRule[], rule: DtsRule, stamp: i32): void => {
  if (rule.tmark === stamp) {
    return;
  }
  rule.tmark = stamp;
  out.push(rule);
  for (const r of rule.keys) {
    dtsTraverse(out, r, stamp);
  }
};

export const dtsRule = (cost: i32): DtsRule => new DtsRule(DTS_RULE, cost);

export const dtsHardRule = (): DtsRule => {
  const r = new DtsRule(DTS_RULE, 0);
  r.harden();
  return r;
};

/** PositionalRule. */
export const dtsPositionalRule = (
  collectionRule: DtsRule | null,
  argumentCount: i32,
  leading: i32,
  trailing: i32,
): DtsRule => {
  const r = new DtsRule(DTS_RULE_POSITIONAL, DTS_COST_NORMAL);
  r.leading = leading;
  r.trailing = trailing;
  if (collectionRule !== null) {
    if (leading > 0) {
      r.addConstraint(1, collectionRule, DTS_UNSPLIT);
    }
    if (leading > 0 || trailing > 0) {
      r.addConstraint(add32(argumentCount, 1), collectionRule, 1);
    }
    for (let a = 0; a < leading; a++) {
      r.addConstraint(add32(sub32(argumentCount, a), 1), collectionRule, DTS_UNSPLIT);
    }
    for (let a = sub32(argumentCount, trailing); a < argumentCount; a++) {
      r.addConstraint(add32(sub32(argumentCount, a), 1), collectionRule, DTS_UNSPLIT);
    }
  } else if (leading > 0 || trailing > 0) {
    dtsFail();
  }
  return r;
};

/** NamedRule. */
export const dtsNamedRule = (collectionRule: DtsRule | null, leading: i32, trailing: i32): DtsRule => {
  const r = new DtsRule(DTS_RULE_NAMED, DTS_COST_NORMAL);
  if (leading > 0 || trailing > 0) {
    if (collectionRule === null) {
      dtsFail();
    } else {
      r.addConstraint(1, collectionRule, DTS_UNSPLIT);
    }
  }
  return r;
};

export const dtsCombinatorRule = (): DtsRule => new DtsRule(DTS_RULE_COMBINATOR, DTS_COST_NORMAL);

export const dtsTypeArgumentRule = (): DtsRule => new DtsRule(DTS_RULE_TYPE_ARGUMENT, DTS_COST_NORMAL);

// ---------------------------------------------------------------------------
// Chunks, nesting and spans.

export class DtsNest {
  parent: DtsNest | null;
  indent: i32;
  total: i32 = -1;
  marked: boolean = false;

  constructor(parent: DtsNest | null, indent: i32) {
    this.parent = parent;
    this.indent = indent;
  }

  isNested(): boolean {
    return this.parent !== null;
  }

  nest(spaces: i32): DtsNest {
    return new DtsNest(this, spaces);
  }

  clearTotalUsedIndent(): void {
    this.total = -1;
    const p = this.parent;
    if (p !== null) {
      p.clearTotalUsedIndent();
    }
  }

  refreshTotalUsedIndent(): void {
    if (this.total >= 0) {
      return;
    }
    let t = 0;
    const p = this.parent;
    if (p !== null) {
      p.refreshTotalUsedIndent();
      t = p.total;
    }
    if (this.marked) {
      t = add32(t, this.indent);
    }
    this.total = t;
  }
}

export class DtsSpan {
  cost: i32;
  marked: boolean = false;
  constructor(cost: i32) {
    this.cost = cost;
  }
}

export class DtsChunk {
  id: i32;
  text: string = "";
  len16: i32 = 0;
  indent: i32;
  nesting: DtsNest;
  rule: DtsRule;
  isDouble: boolean;
  flushLeft: boolean;
  space: boolean;
  canDivide: boolean = true;
  spans: DtsSpan[];
  isBlock: boolean = false;
  argument: DtsChunk | null = null;
  children: DtsChunk[];
  blockLen: i32 = -1;

  constructor(rule: DtsRule, indent: i32, nesting: DtsNest, space: boolean, flushLeft: boolean, isDouble: boolean) {
    this.id = dtsNextId();
    this.rule = rule;
    this.indent = indent;
    this.nesting = nesting;
    this.space = space;
    this.flushLeft = flushLeft;
    this.isDouble = isDouble;
    this.spans = [];
    this.children = [];
  }

  length(): i32 {
    const n = this.len16;
    if (!this.space) {
      return n;
    }
    if (n < 2147483647) {
      return n + 1;
    }
    fault();
    return n;
  }

  appendText(s: string): void {
    this.text = this.text + s;
    this.len16 = add32(this.len16, dtsLen16(s));
  }

  textEndsWith(s: string): boolean {
    return this.text.endsWith(s);
  }

  /** unsplitBlockLength. */
  unsplitBlockLength(): i32 {
    if (!this.isBlock) {
      return 0;
    }
    let n = 0;
    for (const c of this.children) {
      n = add32(n, add32(c.length(), c.unsplitBlockLength()));
    }
    return n;
  }

  /** unsplitBlockLength, cached once the block is complete (while solving). */
  cachedBlockLength(): i32 {
    if (this.blockLen < 0) {
      this.blockLen = this.unsplitBlockLength();
    }
    return this.blockLen;
  }

  /** BlockChunk.indentBlock. */
  indentBlock(values: DtsRuleSet, dummy: DtsRule): boolean {
    if (!this.isBlock) {
      return false;
    }
    const a = this.argument;
    if (a === null) {
      return false;
    }
    const rule = a.rule;
    if (rule === dummy) {
      return true;
    }
    return rule.isSplit(values.getValue(rule), a);
  }
}

class DtsNestBuilder {
  stack: i32[];
  pending: DtsNest | null = null;
  nesting: DtsNest;

  constructor() {
    this.stack = [0];
    this.nesting = new DtsNest(null, 0);
  }

  indentation(): i32 {
    const st = this.stack;
    const k = toI32(st.length);
    if (k > 0 && k <= st.length) {
      return st[k - 1];
    }
    // The stack starts with 0, and unindent follows indent.
    fault();
    return 0;
  }

  currentNesting(): DtsNest {
    const p = this.pending;
    return p !== null ? p : this.nesting;
  }

  indent(spaces: i32): void {
    this.stack.push(add32(this.indentation(), spaces));
  }

  unindent(): void {
    const st = this.stack;
    if (st.length > 0) {
      st.pop();
    } else {
      fault();
    }
  }

  nest(indent: i32): void {
    this.pending = this.currentNesting().nest(indent);
  }

  unnest(): void {
    this.pending = this.currentNesting().parent;
  }

  commitNesting(): void {
    const p = this.pending;
    if (p === null) {
      return;
    }
    this.nesting = p;
    this.pending = null;
  }
}

// Comment types (CommentType).
export const DTS_CT_DOC: i32 = 0;
export const DTS_CT_LINE: i32 = 1;
export const DTS_CT_BLOCK: i32 = 2;
export const DTS_CT_INLINE_BLOCK: i32 = 3;

export class DtsComment {
  text: string;
  type: i32;
  linesBefore: i32;
  flushLeft: boolean;
  constructor(text: string, type: i32, linesBefore: i32, flushLeft: boolean) {
    this.text = text;
    this.type = type;
    this.linesBefore = linesBefore;
    this.flushLeft = flushLeft;
  }
}

/** Shared by a chunk builder and its block builders. */
export class DtsContext {
  pageWidth: i32;
  dummy: DtsRule;
  nullChunk: DtsChunk;
  constructor(pageWidth: i32) {
    this.pageWidth = pageWidth;
    this.dummy = dtsHardRule();
    this.nullChunk = new DtsChunk(this.dummy, 0, new DtsNest(null, 0), false, false, false);
  }

  dummyChunk(): DtsChunk {
    const c = new DtsChunk(this.dummy, 0, new DtsNest(null, 0), false, false, false);
    c.text = "(dummy)";
    c.len16 = 7;
    return c;
  }
}

// ---------------------------------------------------------------------------
// ChunkBuilder.

export class DtsBuilder {
  cx: DtsContext;
  parent: DtsBuilder | null;
  chunks: DtsChunk[];
  pendingNewlines: i32 = 0;
  pendingSpace: boolean = false;
  pendingNested: boolean = false;
  pendingFlushLeft: boolean = false;
  afterComment: boolean = false;
  rules: DtsRule[];
  hardSplitRules: DtsRule[];
  lazyRules: DtsRule[];
  spanStart: i32[];
  spanCost: i32[];
  nesting: DtsNestBuilder;
  blockArgumentNesting: DtsNest[];
  preventSplitNesting: i32 = 0;

  constructor(cx: DtsContext, parent: DtsBuilder | null, chunks: DtsChunk[]) {
    this.cx = cx;
    this.parent = parent;
    this.chunks = chunks;
    this.rules = [];
    this.hardSplitRules = [];
    this.lazyRules = [];
    this.spanStart = [];
    this.spanCost = [];
    this.nesting = new DtsNestBuilder();
    this.blockArgumentNesting = [];
    if (parent === null) {
      this.indent(0);
    }
    this.startBlockArgumentNesting();
  }

  rule(): DtsRule {
    const rules = this.rules;
    const k = toI32(rules.length);
    if (k < 1 || k > rules.length) {
      dtsFail();
      return this.cx.dummy;
    }
    return rules[k - 1];
  }

  last(): DtsChunk {
    const chunks = this.chunks;
    const k = toI32(chunks.length);
    if (k > 0 && k <= chunks.length) {
      return chunks[k - 1];
    }
    fault();
    return this.cx.nullChunk;
  }

  write(s: string, mergeEmptySplits: boolean): void {
    this.emitPendingWhitespace(false, mergeEmptySplits);
    this.writeText(s, null);
    this.activateLazyRules();
    this.nesting.commitNesting();
    this.afterComment = false;
  }

  activateLazyRules(): void {
    if (this.lazyRules.length === 0) {
      return;
    }
    for (const r of this.lazyRules) {
      this.activateRule(r);
    }
    this.lazyRules = [];
  }

  writeNewline(isDouble: boolean, flushLeft: boolean, nest: boolean): void {
    this.pendingNewlines = isDouble ? 2 : 1;
    this.pendingFlushLeft = flushLeft;
    this.pendingNested = nest;
  }

  writeSpace(): void {
    this.pendingSpace = true;
  }

  split(nest: boolean, space: boolean): DtsChunk {
    if (this.preventSplitNesting > 0) {
      this.pendingNewlines = 0;
      this.pendingNested = false;
      if (space) {
        this.pendingSpace = true;
      }
      return this.cx.dummyChunk();
    }
    if (this.pendingNewlines > 0) {
      return this.cx.dummyChunk();
    }
    return this.writeSplit(false, false, nest, space, true);
  }

  writeComments(comments: DtsComment[], linesBeforeToken: i32, token: string): void {
    const n = toI32(comments.length);
    // Called with a comment at least: the last one is read below whatever happens.
    if (n < 1 || n > comments.length || comments.length < 1) {
      fault();
      return;
    }
    const first = comments[0];
    const lastComment = comments[n - 1];
    if (this.pendingNewlines === 2 && first.linesBefore < 2) {
      if (linesBeforeToken > 1) {
        this.writeNewline(false, false, false);
      } else {
        for (let i = 1; i < n && i < comments.length; i++) {
          if (comments[i].linesBefore > 1) {
            this.writeNewline(false, false, false);
            break;
          }
        }
      }
    }
    if (linesBeforeToken === 0 && this.pendingNewlines > first.linesBefore) {
      let all = true;
      for (const c of comments) {
        if (c.type !== DTS_CT_INLINE_BLOCK) {
          all = false;
        }
      }
      if (all) {
        first.linesBefore = this.pendingNewlines;
      }
    }
    for (let i = 0; i < n && i < comments.length; i++) {
      const comment = comments[i];
      const chunk = this.chunkForComment(comment, token);
      if (chunk !== null) {
        this.pendingSpace = this.needsSpaceBeforeComment(comment, chunk);
        if (this.pendingSpace && chunk !== this.last()) {
          this.last().space = true;
        }
      } else {
        if (this.pendingNewlines === 0) {
          if (comment.linesBefore > 0 && (this.afterComment || comment.type !== DTS_CT_INLINE_BLOCK)) {
            this.writeNewline(this.needsBlankLineBeforeComment(comment), comment.flushLeft, true);
          } else if (this.chunks.length > 0) {
            this.pendingSpace = this.needsSpaceBeforeComment(comment, this.last());
          }
        } else {
          this.pendingFlushLeft = comment.flushLeft;
        }
        this.emitPendingWhitespace(this.needsBlankLineBeforeComment(comment), true);
      }
      this.writeText(comment.text, chunk);
      let linesAfter = 0;
      if (i < n - 1) {
        const j = i + 1;
        if (j >= comments.length) {
          fault();
          return;
        }
        linesAfter = comments[j].linesBefore;
      } else {
        linesAfter = linesBeforeToken;
        if (linesAfter === 0 && lastComment.text.indexOf("\n") >= 0) {
          linesAfter = 1;
        }
      }
      if (linesAfter > 0) {
        this.writeNewline(this.pendingNewlines === 2 || linesAfter > 1, false, true);
      }
    }
    this.pendingSpace = this.needsSpaceAfterComment(lastComment, token);
    this.afterComment = true;
  }

  indent(spaces: i32): void {
    this.nesting.indent(spaces);
  }

  unindent(): void {
    this.nesting.unindent();
  }

  startSpan(cost: i32): void {
    this.spanStart.push(toI32(this.chunks.length));
    this.spanCost.push(cost);
  }

  endSpan(): void {
    const spanStart = this.spanStart;
    const spanCost = this.spanCost;
    // endSpan follows startSpan.
    if (spanStart.length < 1) {
      fault();
      return;
    }
    const start = spanStart.pop();
    if (spanCost.length < 1) {
      fault();
      return;
    }
    const cost = spanCost.pop();
    const chunks = this.chunks;
    const end = toI32(chunks.length);
    if (start === end) {
      return;
    }
    const span = new DtsSpan(cost);
    // A span starts at a length the chunks had.
    if (start < 0 && start < end) {
      fault();
      return;
    }
    for (let i = start; i >= 0 && i < end && i < chunks.length; i++) {
      const c = chunks[i];
      if (!c.rule.hard) {
        c.spans.push(span);
      }
    }
  }

  startRule(rule: DtsRule): void {
    this.activateLazyRules();
    this.activateRule(rule);
  }

  activateRule(rule: DtsRule): void {
    for (const outer of this.rules) {
      if (!outer.splitsOnInnerRules()) {
        continue;
      }
      rule.constrainWhenSplit(outer);
    }
    this.rules.push(rule);
  }

  startLazyRule(rule: DtsRule): void {
    this.lazyRules.push(rule);
  }

  endRule(): void {
    const lazyRules = this.lazyRules;
    const rules = this.rules;
    if (lazyRules.length > 0) {
      lazyRules.pop();
    } else if (rules.length > 0) {
      rules.pop();
    } else {
      // endRule follows startRule.
      fault();
    }
  }

  forceRules(): void {
    this.handleHardSplit();
  }

  nestExpression(indent: i32, now: boolean): void {
    this.nesting.nest(indent);
    if (now) {
      this.nesting.commitNesting();
    }
  }

  unnest(now: boolean): void {
    this.nesting.unnest();
    if (now) {
      this.nesting.commitNesting();
    }
  }

  startBlockArgumentNesting(): void {
    this.blockArgumentNesting.push(this.nesting.currentNesting());
  }

  endBlockArgumentNesting(): void {
    const ban = this.blockArgumentNesting;
    if (ban.length > 0) {
      ban.pop();
    } else {
      // The constructor starts one, and ends follow starts.
      fault();
    }
  }

  startBlock(argumentChunk: DtsChunk | null, indent: boolean, space: boolean): DtsBuilder {
    const rule = this.rule();
    const indentation = this.nesting.indentation();
    const ban = this.blockArgumentNesting;
    const k = toI32(ban.length);
    if (k < 1 || k > ban.length) {
      fault();
      return this;
    }
    const chunk = new DtsChunk(rule, indentation, ban[k - 1], space, this.pendingFlushLeft, false);
    chunk.isBlock = true;
    chunk.argument = argumentChunk;
    this.chunks.push(chunk);
    this.pendingFlushLeft = false;
    const builder = new DtsBuilder(this.cx, this, chunk.children);
    if (indent) {
      builder.indent(DTS_INDENT_BLOCK);
    }
    builder.startRule(dtsHardRule());
    builder.split(false, space);
    return builder;
  }

  endBlock(forceSplit0: boolean): DtsBuilder {
    this.divideChunks();
    let forceSplit = forceSplit0 || this.pendingNested;
    if (!forceSplit) {
      let length = 0;
      const rules = this.rules;
      for (const c of this.chunks) {
        length = add32(length, add32(c.length(), c.unsplitBlockLength()));
        if (length > this.cx.pageWidth) {
          forceSplit = true;
          break;
        }
        if (c.rule.hard && (rules.length < 1 || c.rule !== rules[0])) {
          forceSplit = true;
          break;
        }
      }
    }
    const parent = this.parent;
    if (parent === null) {
      dtsFail();
      return this;
    }
    if (forceSplit) {
      parent.forceRules();
    }
    return parent;
  }

  /** end(): the formatted text of the whole unit. */
  end(lineEnding: string): string {
    this.divideChunks();
    const w = new DtsLineWriter(this.cx, lineEnding, this.chunks, 0, new Map<i64, DtsResult>());
    const r = w.writeLines(true);
    return r.text;
  }

  preventSplit(): void {
    const k = this.preventSplitNesting;
    if (k < 2147483647) {
      this.preventSplitNesting = k + 1;
    } else {
      fault();
    }
  }

  endPreventSplit(): void {
    const k = this.preventSplitNesting;
    if (k >= -2147483647) {
      this.preventSplitNesting = toI32(toI64(k) - toI64(1));
    } else {
      fault();
    }
  }

  emitPendingWhitespace(isDouble0: boolean, mergeEmptySplits: boolean): void {
    if (this.pendingNewlines === 0) {
      return;
    }
    const isDouble = isDouble0 || this.pendingNewlines === 2;
    this.writeSplit(true, isDouble, this.pendingNested, false, mergeEmptySplits);
  }

  chunkForComment(comment: DtsComment, token: string): DtsChunk | null {
    const n = toI32(this.chunks.length);
    if (n === 0) {
      return null;
    }
    if (comment.linesBefore !== 0) {
      return null;
    }
    if (comment.type === DTS_CT_DOC || comment.type === DTS_CT_BLOCK) {
      return null;
    }
    const chunks = this.chunks;
    if (n < 1 || n > chunks.length) {
      fault();
      return null;
    }
    let chunk = chunks[n - 1];
    if (chunk.text.length === 0 && n > 1 && (!dtsIsGenericMethodComment(comment) || token !== "(")) {
      if (n > chunks.length) {
        fault();
        return null;
      }
      chunk = chunks[n - 2];
    }
    const text = chunk.text;
    if (text.endsWith(",") && comment.type === DTS_CT_INLINE_BLOCK) {
      return null;
    }
    if (text.endsWith("(") || text.endsWith("[") || (text.endsWith("{") && !text.endsWith("${"))) {
      return null;
    }
    return chunk;
  }

  needsSpaceBeforeComment(comment: DtsComment, chunk: DtsChunk): boolean {
    const text = chunk.text;
    const n = toI32(text.length);
    if (n === 0) {
      return false;
    }
    if (comment.type === DTS_CT_LINE) {
      return true;
    }
    if (dtsIsGenericMethodComment(comment)) {
      const c = text.charCodeAt(n - 1);
      if ((c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57) || c === 95) {
        return false;
      }
    }
    return !text.endsWith("(") && !text.endsWith("[") && !text.endsWith("{");
  }

  needsSpaceAfterComment(comment: DtsComment, token: string): boolean {
    if (this.last().text.length === 0) {
      return false;
    }
    if (this.pendingNewlines > 0) {
      return false;
    }
    if (dtsIsGenericMethodComment(comment) && token === "(") {
      return false;
    }
    return token !== ")" && token !== "]" && token !== "}" && token !== "," && token !== ";" && token !== "";
  }

  needsBlankLineBeforeComment(comment: DtsComment): boolean {
    if (comment.linesBefore < 2) {
      return false;
    }
    if (this.chunks.length === 0) {
      return false;
    }
    const text = this.last().text;
    if (text.endsWith("{") || text.endsWith("[")) {
      return false;
    }
    return true;
  }

  writeSplit(isHard: boolean, isDouble0: boolean, nest: boolean, space: boolean, mergeEmptySplits: boolean): DtsChunk {
    let isDouble = isDouble0;
    let chunk = this.cx.nullChunk;
    const n = toI32(this.chunks.length);
    if (mergeEmptySplits && n > 0 && this.chunks[n - 1].text.length === 0) {
      chunk = this.chunks[n - 1];
      if (isDouble) {
        if (n > 1 && this.chunks[n - 2].text.endsWith("{")) {
          isDouble = false;
        }
      }
      chunk.rule.harden();
      chunk.flushLeft = this.pendingFlushLeft;
      if (isDouble) {
        chunk.isDouble = true;
      }
    } else {
      chunk = this.startChunk(nest ? this.nesting.nesting : new DtsNest(null, 0), isHard, isDouble, space);
    }
    if (chunk.rule.hard) {
      this.handleHardSplit();
    }
    this.pendingNewlines = 0;
    this.pendingNested = false;
    return chunk;
  }

  writeText(s: string, chunk0: DtsChunk | null): void {
    let chunk = this.cx.nullChunk;
    if (chunk0 === null) {
      if (this.chunks.length === 0) {
        this.startChunk(new DtsNest(null, 0), true, false, false);
      }
      chunk = this.last();
    } else {
      chunk = chunk0;
    }
    if (this.pendingSpace && chunk.text.length > 0) {
      chunk.appendText(" ");
    }
    this.pendingSpace = false;
    chunk.appendText(s);
  }

  startChunk(nesting: DtsNest, isHard: boolean, isDouble: boolean, space: boolean): DtsChunk {
    const rule = isHard ? dtsHardRule() : this.rule();
    const chunk = new DtsChunk(rule, this.nesting.indentation(), nesting, space, this.pendingFlushLeft, isDouble);
    this.chunks.push(chunk);
    this.pendingFlushLeft = false;
    return chunk;
  }

  divideChunks(): void {
    this.hardenRules();
    const n = toI32(this.chunks.length);
    for (let i = 0; i < n; i++) {
      const c = this.chunks[i];
      if (i === 0 || !c.rule.hard || c.nesting.isNested() || c.isBlock) {
        c.canDivide = false;
      }
    }
  }

  handleHardSplit(): void {
    const rules = this.rules;
    const k = toI32(rules.length);
    if (k < 1 || k > rules.length) {
      return;
    }
    const r = rules[k - 1];
    if (!r.splitsOnInnerRules()) {
      return;
    }
    if (this.hardSplitRules.indexOf(r) < 0) {
      this.hardSplitRules.push(r);
    }
  }

  hardenRules(): void {
    if (this.hardSplitRules.length === 0) {
      return;
    }
    for (const r of this.hardSplitRules) {
      dtsWalkConstraints(r);
    }
    for (const c of this.chunks) {
      if (c.rule.hard && c.spans.length > 0) {
        c.spans = [];
      }
    }
  }
}

const dtsWalkConstraints = (rule: DtsRule): void => {
  rule.harden();
  for (const other of rule.keys) {
    if (other === rule) {
      continue;
    }
    if (!other.hard && rule.constrain(rule.fullySplitValue(), other) === other.fullySplitValue()) {
      dtsWalkConstraints(other);
    }
  }
};

const dtsIsGenericMethodComment = (c: DtsComment): boolean => c.text.startsWith("/*<") || c.text.startsWith("/*=");

// ---------------------------------------------------------------------------
// LineWriter.

const dtsSpaces = (n: i32): string => {
  let s = "";
  for (let i = 0; i < n; i++) {
    s = s + " ";
  }
  return s;
};

export class DtsResult {
  text: string;
  cost: i32;
  constructor(text: string, cost: i32) {
    this.text = text;
    this.cost = cost;
  }
}

export class DtsLineWriter {
  cx: DtsContext;
  lineEnding: string;
  chunks: DtsChunk[];
  blockIndentation: i32;
  cache: Map<i64, DtsResult>;
  out: string[];
  nonEmpty: boolean = false;

  constructor(
    cx: DtsContext,
    lineEnding: string,
    chunks: DtsChunk[],
    blockIndentation: i32,
    cache: Map<i64, DtsResult>,
  ) {
    this.cx = cx;
    this.lineEnding = lineEnding;
    this.chunks = chunks;
    this.blockIndentation = blockIndentation;
    this.cache = cache;
    this.out = [];
  }

  formatBlock(chunk: DtsChunk, column: i32): DtsResult {
    const key = (toI64(chunk.id) << 20) | toI64(column);
    const hit = this.cache.get(key);
    if (hit !== undefined) {
      return hit;
    }
    const w = new DtsLineWriter(this.cx, this.lineEnding, chunk.children, column, this.cache);
    const r = w.writeLines(false);
    this.cache.set(key, r);
    return r;
  }

  emit(s: string): void {
    if (s.length > 0) {
      this.out.push(s);
      this.nonEmpty = true;
    }
  }

  writeLines(isCompilationUnit: boolean): DtsResult {
    let total = 0;
    let start = 0;
    const chunks = this.chunks;
    const n = toI32(chunks.length);
    for (let i = 0; i < n && i < chunks.length; i++) {
      if (!chunks[i].canDivide) {
        continue;
      }
      total = add32(total, this.completeLine(start, i));
      start = i;
    }
    if (start < n) {
      total = add32(total, this.completeLine(start, n));
    }
    if (isCompilationUnit) {
      this.emit(this.lineEnding);
    }
    return new DtsResult(this.out.join(""), total);
  }

  completeLine(start: i32, end: i32): i32 {
    const chunks: DtsChunk[] = [];
    const all = this.chunks;
    // writeLines passes a range of its chunks.
    if (start < end && (start < 0 || end > all.length)) {
      fault();
      return 0;
    }
    for (let i = start; i >= 0 && i < end && i < all.length; i++) {
      chunks.push(all[i]);
    }
    const splitter = new DtsSplitter(this, chunks, this.blockIndentation);
    const splits = splitter.apply();
    const n = toI32(chunks.length);
    for (let i = 0; i < n && i < chunks.length; i++) {
      const chunk = chunks[i];
      if (chunk.isBlock) {
        if (!splits.shouldSplitAt(i)) {
          this.writeChunksUnsplit(chunk);
        } else {
          this.emit(this.lineEnding);
          const block = this.formatBlock(chunk, splits.column(i));
          this.emit(block.text);
        }
      }
      if (splits.shouldSplitAt(i)) {
        if (this.nonEmpty) {
          this.emit(this.lineEnding);
          if (chunk.isDouble) {
            this.emit(this.lineEnding);
          }
        }
        this.emit(dtsSpaces(splits.column(i)));
      } else if (chunk.space) {
        this.emit(" ");
      }
      this.emit(chunk.text);
    }
    return splits.cost;
  }

  writeChunksUnsplit(block: DtsChunk): void {
    for (const c of block.children) {
      if (c.space) {
        this.emit(" ");
      }
      if (c.isBlock) {
        this.writeChunksUnsplit(c);
      }
      this.emit(c.text);
    }
  }
}

// ---------------------------------------------------------------------------
// LineSplitter, RuleSet, SplitSet.

const DTS_MAX_ATTEMPTS: i32 = 5000;

/** `n` copies of -1. */
const dtsMinusOnes = (n: i32): i32[] => {
  if (n >= 0 && n <= 65535) {
    const xs = new Array<i32>(toU16(n));
    xs.fill(-1);
    return xs;
  }
  const xs: i32[] = [];
  if (n < 0) {
    fault();
    return xs;
  }
  for (let i = 0; i < n; i++) {
    xs.push(-1);
  }
  return xs;
};

export class DtsSplitSet {
  columns: i32[];
  cost: i32 = 0;
  constructor(n: i32) {
    this.columns = dtsMinusOnes(n);
  }

  shouldSplitAt(i: i32): boolean {
    const columns = this.columns;
    return i >= 0 && i < columns.length && columns[i] !== -1;
  }

  /** The column chunk `i` starts at; it splits. */
  column(i: i32): i32 {
    const columns = this.columns;
    if (i >= 0 && i < columns.length) {
      return columns[i];
    }
    fault();
    return 0;
  }
}

export class DtsRuleSet {
  values: i32[]; // -1 when unbound

  constructor(n: i32) {
    this.values = dtsMinusOnes(n);
  }

  slot(rule: DtsRule): i32 {
    const i = rule.index;
    if (i < 0 || i >= toI32(this.values.length)) {
      dtsFail();
      return -1;
    }
    return i;
  }

  contains(rule: DtsRule): boolean {
    if (rule.hard) {
      return true;
    }
    const i = this.slot(rule);
    const values = this.values;
    return i >= 0 && i < values.length && values[i] !== -1;
  }

  getValue(rule: DtsRule): i32 {
    if (rule.hard) {
      return rule.fullySplitValue();
    }
    const i = this.slot(rule);
    const values = this.values;
    if (i < 0 || i >= values.length) {
      return DTS_UNSPLIT;
    }
    const v = values[i];
    return v !== -1 ? v : DTS_UNSPLIT;
  }

  clone(): DtsRuleSet {
    const r = new DtsRuleSet(0);
    const src = this.values;
    const n = toI32(src.length);
    if (n <= 65535) {
      const xs = new Array<i32>(toU16(n));
      for (let i = 0; i < xs.length && i < src.length; i++) {
        xs[i] = src[i];
      }
      r.values = xs;
    } else {
      r.values = sliceI32s(src, 0, n);
    }
    return r;
  }

  /** tryBind; the rules that must split are added to `mustSplit`. */
  tryBind(rule: DtsRule, value: i32, mustSplit: DtsRule[]): boolean {
    const i = this.slot(rule);
    const values = this.values;
    if (i < 0 || i >= values.length) {
      return false;
    }
    values[i] = value;
    for (const other of rule.keys) {
      let otherValue = -1;
      if (other.hard) {
        otherValue = other.fullySplitValue();
      } else {
        const j = this.slot(other);
        const vals = this.values;
        if (j < 0 || j >= vals.length) {
          return false;
        }
        otherValue = vals[j];
      }
      let constraint = rule.constrain(value, other);
      if (otherValue === -1) {
        if (constraint === DTS_MUST_SPLIT) {
          if (other.numValues() === 2) {
            if (!this.tryBind(other, 1, mustSplit)) {
              return false;
            }
          } else {
            mustSplit.push(other);
          }
        } else if (constraint !== DTS_NONE) {
          if (!this.tryBind(other, constraint, mustSplit)) {
            return false;
          }
        }
      } else {
        if (constraint === DTS_MUST_SPLIT) {
          if (otherValue === DTS_UNSPLIT) {
            return false;
          }
        } else if (constraint !== DTS_NONE) {
          if (otherValue !== constraint) {
            return false;
          }
        }
        constraint = other.constrain(otherValue, rule);
        if (constraint === DTS_MUST_SPLIT) {
          if (value === DTS_UNSPLIT) {
            return false;
          }
        } else if (constraint !== DTS_NONE) {
          if (value !== constraint) {
            return false;
          }
        }
      }
    }
    return true;
  }
}

export class DtsSplitter {
  writer: DtsLineWriter;
  chunks: DtsChunk[];
  rules: DtsRule[];
  blockIndentation: i32;
  queue: DtsQueue;

  constructor(writer: DtsLineWriter, chunks: DtsChunk[], blockIndentation: i32) {
    this.writer = writer;
    this.chunks = chunks;
    this.blockIndentation = blockIndentation;
    this.rules = [];
    const stamp = dtsStamp();
    for (const c of chunks) {
      const r = c.rule;
      if (r.smark !== stamp) {
        r.smark = stamp;
        this.rules.push(r);
      }
    }
    for (let i = 0; i < this.rules.length; i++) {
      this.rules[i].index = i;
    }
    for (const r of this.rules) {
      r.forgetUnusedRules();
    }
    this.queue = new DtsQueue(this.rules);
  }

  apply(): DtsSplitSet {
    let best = new DtsState(this, new DtsRuleSet(toI32(this.rules.length)));
    this.queue.add(best);
    let attempts = 0;
    while (this.queue.len > 0) {
      const state = this.queue.removeFirst(best);
      if (state.isBetterThan(best)) {
        best = state;
        if (best.overflowChars === 0) {
          break;
        }
      }
      const a = attempts;
      if (a > DTS_MAX_ATTEMPTS || a >= 2147483647) {
        break;
      }
      attempts = a + 1;
      state.expand();
      if (dtsFailed()) {
        break;
      }
    }
    return best.splits;
  }
}

// ---------------------------------------------------------------------------
// SolveState.

export class DtsState {
  sp: DtsSplitter;
  values: DtsRuleSet;
  live: DtsRule[];
  liveStamp: i32 = 0;
  splits: DtsSplitSet;
  overflowChars: i32 = 0;
  isComplete: boolean = true;
  // Lazily computed for overlap tests.
  overlapReady: boolean = false;
  bril: Map<i32, i32>; // bound rules in unbound lines, by id
  constraints: Map<i32, i32>;
  unboundReady: boolean = false;
  unboundConstraints: Map<i32, i32[]>;
  boundIds: Map<i32, i32>;
  unbound: DtsRule[];

  constructor(sp: DtsSplitter, values: DtsRuleSet) {
    this.sp = sp;
    this.values = values;
    this.live = [];
    this.liveStamp = dtsStamp();
    this.splits = new DtsSplitSet(toI32(sp.chunks.length));
    this.bril = new Map<i32, i32>();
    this.constraints = new Map<i32, i32>();
    this.unboundConstraints = new Map<i32, i32[]>();
    this.boundIds = new Map<i32, i32>();
    this.unbound = [];
    this.calculateSplits();
    this.calculateCost();
  }

  getValue(rule: DtsRule): i32 {
    return this.values.getValue(rule);
  }

  addLive(rule: DtsRule): void {
    if (rule.mark !== this.liveStamp) {
      rule.mark = this.liveStamp;
      this.live.push(rule);
    }
  }

  isBetterThan(other: DtsState): boolean {
    if (!this.isComplete) {
      return false;
    }
    if (this.overflowChars !== other.overflowChars) {
      return this.overflowChars < other.overflowChars;
    }
    return this.splits.cost < other.splits.cost;
  }

  compareOverlap(other: DtsState): i32 {
    if (!this.isOverlapping(other)) {
      return 0;
    }
    for (const rule of this.sp.rules) {
      const v = this.values.getValue(rule);
      const o = other.values.getValue(rule);
      if (v !== o) {
        return v < o ? -1 : 1;
      }
    }
    dtsFail();
    return 0;
  }

  expand(): void {
    const unsplitRules = this.values.clone();
    // Mark this state's live rules.
    const stamp = dtsStamp();
    for (const r of this.live) {
      r.mark = stamp;
    }
    const liveCount = toI32(this.live.length);
    let tried = 0;
    for (const rule of this.sp.rules) {
      if (rule.mark === stamp) {
        for (let value = 1; value < rule.numValues(); value++) {
          const bound = unsplitRules.clone();
          const mustSplit: DtsRule[] = [];
          const valid = bound.tryBind(rule, value, mustSplit);
          if (!valid) {
            continue;
          }
          const state = new DtsState(this.sp, bound);
          if (mustSplit.length > 0) {
            state.isComplete = false;
            for (const r of mustSplit) {
              state.addLive(r);
            }
          }
          this.sp.queue.add(state);
          // Constructing states reuses marks; restore this state's.
          for (const r of this.live) {
            r.mark = stamp;
          }
        }
        // Only live rules carry the stamp, each once.
        if (tried >= liveCount) {
          fault();
          break;
        }
        tried = tried + 1;
        if (tried === liveCount) {
          break;
        }
      }
      if (!this.values.contains(rule)) {
        const ignored: DtsRule[] = [];
        if (!unsplitRules.tryBind(rule, 0, ignored)) {
          break;
        }
      }
    }
  }

  isOverlapping(other: DtsState): boolean {
    this.ensureOverlap();
    other.ensureOverlap();
    if (this.bril.size !== other.bril.size) {
      return false;
    }
    for (const id of this.bril.keys()) {
      const ov = other.bril.get(id);
      if (ov === undefined) {
        return false;
      }
      if ((this.bril.get(id) ?? 0) !== ov) {
        return false;
      }
    }
    if (this.constraints.size !== other.constraints.size) {
      return false;
    }
    for (const id of this.constraints.keys()) {
      const ov = other.constraints.get(id);
      if (ov === undefined || ov !== (this.constraints.get(id) ?? 0)) {
        return false;
      }
    }
    this.ensureUnbound();
    other.ensureUnbound();
    if (this.unboundConstraints.size !== other.unboundConstraints.size) {
      return false;
    }
    for (const id of this.unboundConstraints.keys()) {
      const d = this.unboundConstraints.get(id) ?? [];
      const od = other.unboundConstraints.get(id);
      if (od === undefined) {
        dtsFail();
        return false;
      }
      if (d.length !== od.length) {
        return false;
      }
      for (const v of d) {
        if (od.indexOf(v) < 0) {
          return false;
        }
      }
    }
    return true;
  }

  calculateSplits(): void {
    const chunks = this.sp.chunks;
    const n = toI32(chunks.length);
    const used: DtsNest[] = [];
    for (let i = 0; i < n && i < chunks.length; i++) {
      const c = chunks[i];
      if (c.rule.isSplit(this.getValue(c.rule), c)) {
        const nest = c.nesting;
        if (!nest.marked) {
          nest.marked = true;
          used.push(nest);
          nest.clearTotalUsedIndent();
        }
      }
    }
    for (const nest of used) {
      nest.refreshTotalUsedIndent();
    }
    for (const nest of used) {
      nest.marked = false;
    }
    for (let i = 0; i < n && i < chunks.length; i++) {
      const c = chunks[i];
      if (c.rule.isSplit(this.getValue(c.rule), c)) {
        let indent = 0;
        if (!c.flushLeft) {
          indent = add32(add32(this.sp.blockIndentation, c.indent), c.nesting.total);
          if (c.indentBlock(this.values, this.sp.writer.cx.dummy)) {
            indent = add32(indent, DTS_INDENT_EXPRESSION);
          }
        }
        // A split set has a column for each chunk.
        const columns = this.splits.columns;
        if (i >= columns.length) {
          fault();
          return;
        }
        columns[i] = indent;
      }
    }
  }

  calculateCost(): void {
    const chunks = this.sp.chunks;
    const n = toI32(chunks.length);
    const pageWidth = this.sp.writer.cx.pageWidth;
    let cost = 0;
    let length = 0;
    let foundOverflowRules = false;
    let start = 0;
    const splitSpans: DtsSpan[] = [];
    let previousNesting: DtsNest | null = null;
    const columns = this.splits.columns;
    for (let i = 0; i < n && i < chunks.length; i++) {
      const c = chunks[i];
      // shouldSplitAt(i), read once.
      let column = -1;
      if (i < columns.length) {
        column = columns[i];
      }
      if (column !== -1) {
        // endLine(i)
        if (length > pageWidth) {
          this.overflowChars = add32(this.overflowChars, sub32(length, pageWidth));
          if (!foundOverflowRules) {
            for (let j = start; j >= 0 && j < i && j < chunks.length; j++) {
              if (this.addLiveRules(chunks[j].rule)) {
                foundOverflowRules = true;
              }
            }
          }
        }
        start = i;
        for (const span of c.spans) {
          if (!span.marked) {
            span.marked = true;
            splitSpans.push(span);
            cost = add32(cost, span.cost);
          }
        }
        const totalIndent = c.nesting.total;
        if (
          previousNesting !== null &&
          totalIndent !== 0 &&
          totalIndent === previousNesting.total &&
          c.nesting !== previousNesting
        ) {
          this.overflowChars = add32(this.overflowChars, 10000);
        }
        previousNesting = c.nesting;
        length = column;
      } else if (c.space) {
        length = add32(length, 1);
      }
      if (c.isBlock) {
        if (column !== -1) {
          cost = add32(cost, this.sp.writer.formatBlock(c, column).cost);
        } else {
          length = add32(length, c.cachedBlockLength());
        }
      }
      length = add32(length, c.len16);
    }
    const rules = this.sp.rules;
    const values = this.values.values;
    // A rule set has a value for each rule.
    if (values.length < rules.length) {
      fault();
      return;
    }
    for (let i = 0; i < rules.length && i < values.length; i++) {
      const v = values[i];
      if (v !== -1 && v !== DTS_UNSPLIT) {
        cost = add32(cost, rules[i].cost());
      }
    }
    for (const span of splitSpans) {
      span.marked = false;
    }
    // endLine(n)
    if (length > pageWidth) {
      this.overflowChars = add32(this.overflowChars, sub32(length, pageWidth));
      if (!foundOverflowRules) {
        for (let j = start; j >= 0 && j < n && j < chunks.length; j++) {
          if (this.addLiveRules(chunks[j].rule)) {
            foundOverflowRules = true;
          }
        }
      }
    }
    this.splits.cost = cost;
  }

  addLiveRules(rule: DtsRule): boolean {
    let added = false;
    const all = rule.allConstrainedRules();
    for (const c of all) {
      if (this.values.contains(c)) {
        continue;
      }
      this.addLive(c);
      added = true;
    }
    return added;
  }

  ensureOverlap(): void {
    if (this.overlapReady) {
      return;
    }
    this.overlapReady = true;
    // _boundRulesInUnboundLines
    const chunks = this.sp.chunks;
    const n = toI32(chunks.length);
    let boundInLine: DtsRule[] = [];
    let hasUnbound = false;
    for (let i = 0; i < n && i < chunks.length; i++) {
      const rule = chunks[i].rule;
      if (this.splits.shouldSplitAt(i)) {
        if (hasUnbound) {
          for (const r of boundInLine) {
            this.bril.set(r.id, this.values.getValue(r));
          }
        }
        boundInLine = [];
        hasUnbound = false;
      }
      if (this.values.contains(rule)) {
        boundInLine.push(rule);
      } else {
        hasUnbound = true;
      }
    }
    if (hasUnbound) {
      for (const r of boundInLine) {
        this.bril.set(r.id, this.values.getValue(r));
      }
    }
    // _initConstraints
    const bound: DtsRule[] = [];
    for (const rule of this.sp.rules) {
      if (this.values.contains(rule)) {
        bound.push(rule);
        this.boundIds.set(rule.id, 1);
      } else {
        this.unbound.push(rule);
      }
    }
    const unboundIds = new Map<i32, i32>();
    for (const r of this.unbound) {
      unboundIds.set(r.id, 1);
    }
    for (const b of bound) {
      for (const u of b.keys) {
        if (!unboundIds.has(u.id)) {
          continue;
        }
        const value = this.values.getValue(b);
        const c = b.constrain(value, u);
        if (c !== DTS_NONE) {
          this.constraints.set(u.id, c);
        }
      }
    }
  }

  ensureUnbound(): void {
    if (this.unboundReady) {
      return;
    }
    this.unboundReady = true;
    for (const u of this.unbound) {
      let disallowed: i32[] = [];
      let made = false;
      for (const b of u.keys) {
        if (!this.boundIds.has(b.id)) {
          continue;
        }
        const boundValue = this.values.getValue(b);
        for (let value = 0; value < u.numValues(); value++) {
          const c = u.constrain(value, b);
          if (c === DTS_NONE) {
            continue;
          }
          if (c === boundValue) {
            continue;
          }
          if (c === DTS_MUST_SPLIT && boundValue !== DTS_UNSPLIT) {
            continue;
          }
          if (!made) {
            made = true;
            disallowed = [];
            this.unboundConstraints.set(u.id, disallowed);
          }
          if (disallowed.indexOf(value) < 0) {
            disallowed.push(value);
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// SolveStateQueue.

class DtsQueue {
  rules: DtsRule[];
  q: DtsState[];
  len: i32 = 0;

  constructor(rules: DtsRule[]) {
    this.rules = rules;
    this.q = [];
  }

  set(i: i32, s: DtsState): void {
    const q = this.q;
    if (i < 0) {
      fault();
      return;
    }
    if (i < q.length) {
      q[i] = s;
    } else {
      q.push(s);
    }
  }

  add(state: DtsState): void {
    if (this.tryOverlap(state)) {
      return;
    }
    const i = this.len;
    // len never passes the heap's length.
    if (i < 0 || i > this.q.length || i >= 2147483647) {
      fault();
      return;
    }
    this.len = i + 1;
    this.bubbleUp(state, i);
  }

  /** The first state; the queue is not empty. */
  removeFirst(first: DtsState): DtsState {
    const q = this.q;
    const len = this.len;
    if (len < 1 || len > q.length || q.length < 1) {
      fault();
      return first;
    }
    const result = q[0];
    const n = len - 1;
    this.len = n;
    if (n > 0) {
      if (n >= q.length) {
        fault();
        return result;
      }
      const last = q[n];
      this.bubbleDown(last, 0);
    }
    return result;
  }

  compare(a: DtsState, b: DtsState): i32 {
    const c = this.compareScore(a, b);
    if (c !== 0) {
      return c;
    }
    return this.compareRules(a, b);
  }

  compareScore(a: DtsState, b: DtsState): i32 {
    const ac = a.splits.cost;
    const bc = b.splits.cost;
    if (ac !== bc) {
      return ac < bc ? -1 : 1;
    }
    return a.overflowChars < b.overflowChars ? -1 : a.overflowChars > b.overflowChars ? 1 : 0;
  }

  compareRules(a: DtsState, b: DtsState): i32 {
    for (const rule of this.rules) {
      const av = a.getValue(rule);
      const bv = b.getValue(rule);
      if (av !== bv) {
        return av < bv ? -1 : 1;
      }
    }
    dtsFail();
    return 0;
  }

  tryOverlap(state: DtsState): boolean {
    const len = this.len;
    if (len === 0) {
      return false;
    }
    const q = this.q;
    let position = 1;
    do {
      // The walk stays on the heap: 1 <= position <= len <= its length.
      if (position < 1 || position > len || position > q.length) {
        fault();
        return false;
      }
      const index = position - 1;
      const enqueued = q[index];
      let comparison = this.compareScore(enqueued, state);
      if (comparison === 0) {
        const overlap = enqueued.compareOverlap(state);
        if (overlap < 0) {
          return true;
        } else if (overlap > 0) {
          if (index >= q.length) {
            fault();
            return false;
          }
          q[index] = state;
          return true;
        } else {
          comparison = this.compareRules(enqueued, state);
        }
      }
      if (comparison < 0) {
        if (position > 1073741823) {
          fault();
          return false;
        }
        const left = position * 2;
        if (left <= len) {
          position = left;
          continue;
        }
      }
      do {
        while ((position & 1) === 1) {
          position = position >> 1;
        }
        if (position >= 2147483647) {
          fault();
          return false;
        }
        position = position + 1;
      } while (position > len);
    } while (position !== 1);
    return false;
  }

  bubbleUp(element: DtsState, index0: i32): void {
    let index = index0;
    while (index > 0) {
      const parentIndex = (index - 1) >> 1;
      const q = this.q;
      if (parentIndex < 0 || parentIndex >= q.length) {
        fault();
        return;
      }
      const parent = q[parentIndex];
      if (this.compare(element, parent) > 0) {
        break;
      }
      this.set(index, parent);
      index = parentIndex;
    }
    this.set(index, element);
  }

  bubbleDown(element: DtsState, index0: i32): void {
    const q = this.q;
    let index = index0;
    // Below this, 2 * index + 2 fits.
    if (index < 0 || index > 1073741822) {
      fault();
      return;
    }
    let right = index * 2 + 2;
    while (right < this.len) {
      // The children of a heap slot, inside the heap.
      if (right <= 0 || right >= q.length) {
        fault();
        return;
      }
      const leftIndex = right - 1;
      const leftChild = q[leftIndex];
      const rightChild = q[right];
      let comparison = this.compare(leftChild, rightChild);
      let minIndex = right;
      let minChild = rightChild;
      if (comparison < 0) {
        minChild = leftChild;
        minIndex = leftIndex;
      }
      comparison = this.compare(element, minChild);
      if (index < 0 || index >= q.length) {
        fault();
        return;
      }
      if (comparison <= 0) {
        q[index] = element;
        return;
      }
      q[index] = minChild;
      index = minIndex;
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
    const leftIndex = right - 1;
    if (leftIndex < this.len) {
      if (leftIndex >= q.length) {
        fault();
        return;
      }
      const child = q[leftIndex];
      if (this.compare(element, child) > 0) {
        if (index < 0 || index >= q.length) {
          fault();
          return;
        }
        q[index] = child;
        index = leftIndex;
      }
    }
    if (index < 0 || index >= q.length) {
      fault();
      return;
    }
    q[index] = element;
  }
}
