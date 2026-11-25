// Parser::Source::TreeRewriter with the policy RuboCop's Corrector sets:
// different replacements, swallowed insertions and crossing insertions are
// clobbering; crossing deletions are accepted. Ranges are code point offsets.
// A clobbering change leaves the rewriter as it was and returns false (the
// Ruby raises Parser::ClobberingError).
//
// Ported from the parser gem 3.3.13.0 (MIT License, Copyright (c) 2013-2024
// parser contributors).

import { fault } from "../core/fault";
import { rbText } from "./lexer";

/** One node of the action tree; never changed once made. */
export class RbAction {
  s: i32;
  e: i32;
  before: string;
  hasRepl: boolean;
  repl: string;
  after: string;
  children: RbAction[];

  constructor(s: i32, e: i32, before: string, hasRepl: boolean, repl: string, after: string, children: RbAction[]) {
    this.s = s;
    this.e = e;
    this.before = before;
    this.hasRepl = hasRepl;
    this.repl = repl;
    this.after = after;
    this.children = children;
  }

  empty(): boolean {
    return (
      this.before.length === 0 &&
      this.after.length === 0 &&
      this.children.length === 0 &&
      (!this.hasRepl || (this.repl.length === 0 && this.s === this.e))
    );
  }

  insertion(): boolean {
    return this.before.length > 0 || this.after.length > 0 || (this.hasRepl && this.repl.length > 0);
  }
}

/** The outcome of an action-tree operation: the new action, or clobbering. */
class RbCombined {
  ok: boolean;
  action: RbAction;

  constructor(ok: boolean, action: RbAction) {
    this.ok = ok;
    this.action = action;
  }
}

const rbFail = (): RbCombined => new RbCombined(false, new RbAction(0, 0, "", false, "", "", []));
const rbOk = (a: RbAction): RbCombined => new RbCombined(true, a);

/** A copy of `a` with other fields (Action#with); clobbers when a replacement swallows an insertion. */
const rbWith = (
  a: RbAction,
  s: i32,
  e: i32,
  children: RbAction[],
  before: string,
  hasRepl: boolean,
  repl: string,
  after: string,
): RbCombined => {
  let kids = children;
  if (hasRepl) {
    for (const c of children) {
      if (c.insertion()) {
        return rbFail();
      }
    }
    const none: RbAction[] = [];
    kids = none;
  }
  return rbOk(new RbAction(s, e, before, hasRepl, repl, after, kids));
};

const rbWithChildren = (a: RbAction, children: RbAction[]): RbCombined =>
  rbWith(a, a.s, a.e, children, a.before, a.hasRepl, a.repl, a.after);

const rbCombine = (self: RbAction, action: RbAction): RbCombined => {
  if (action.empty()) {
    return rbOk(self);
  }
  return rbDoCombine(self, action);
};

const rbDoCombine = (self: RbAction, action: RbAction): RbCombined => {
  if (action.s === self.s && action.e === self.e) {
    return rbMerge(self, action);
  }
  return rbPlace(self, action);
};

const rbMerge = (self: RbAction, action: RbAction): RbCombined => {
  if (self.hasRepl && action.hasRepl && self.repl !== action.repl) {
    return rbFail();
  }
  const hasRepl = action.hasRepl || self.hasRepl;
  const repl = action.hasRepl ? action.repl : self.repl;
  const r = rbWith(
    self,
    self.s,
    self.e,
    self.children,
    action.before + self.before,
    hasRepl,
    repl,
    self.after + action.after,
  );
  if (!r.ok) {
    return r;
  }
  return rbCombineChildren(r.action, action.children);
};

const rbCombineChildren = (self: RbAction, more: RbAction[]): RbCombined => {
  let parent = self;
  for (const c of more) {
    const r = rbPlace(parent, c);
    if (!r.ok) {
      return r;
    }
    parent = r.action;
  }
  return rbOk(parent);
};

/** (from...size).bsearch: the first index whose child satisfies the test, or size. */
const rbFirstEndAfter = (kids: RbAction[], from: i32, pos: i32): i32 => {
  let lo = from;
  let hi = toI32(kids.length);
  // `from` is an index of `kids`, so `0 <= lo <= hi <= kids.length` throughout.
  while (lo >= 0 && hi >= 0 && lo < hi) {
    // Both are non-negative, so the u32 sum is the true one.
    const mid = toI32((toU32(lo) + toU32(hi)) >> 1);
    if (mid < 0 || mid >= kids.length) {
      fault();
      return lo;
    }
    if (kids[mid].e > pos) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return lo;
};

const rbFirstStartFrom = (kids: RbAction[], from: i32, pos: i32): i32 => {
  let lo = from;
  let hi = toI32(kids.length);
  // As in rbFirstEndAfter.
  while (lo >= 0 && hi >= 0 && lo < hi) {
    const mid = toI32((toU32(lo) + toU32(hi)) >> 1);
    if (mid < 0 || mid >= kids.length) {
      fault();
      return lo;
    }
    if (kids[mid].s >= pos) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return lo;
};

const rbCmp = (a: i32, b: i32): i32 => (a < b ? -1 : a > b ? 1 : 0);

const rbSlice = (kids: RbAction[], a: i32, b: i32): RbAction[] => {
  const out: RbAction[] = [];
  if (a < b && (a < 0 || b > kids.length)) {
    fault();
    return out;
  }
  for (let i = a; i >= 0 && i < b && i < kids.length; i++) {
    out.push(kids[i]);
  }
  return out;
};

const rbPlace = (self: RbAction, action: RbAction): RbCombined => {
  const kids = self.children;
  const n = toI32(kids.length);
  let left = rbFirstEndAfter(kids, 0, action.s);
  // Both searches answer an index in [their start, n].
  if (left < 0 || left > n) {
    fault();
    return rbFail();
  }
  const start = left === 0 ? 0 : left - 1;
  let right = rbFirstStartFrom(kids, start, action.e);
  if (right < 0 || right > n) {
    fault();
    return rbFail();
  }
  const center = right - left;
  let parent: RbAction | null = null;
  let hasChild = false;
  let contained: RbAction[] = [];
  const fusible: RbAction[] = [];
  if (center === 0) {
    // neither parent nor children
  } else if (center === -1) {
    // `right` is `left - 1`: the two swap past each other.
    right = left;
    left -= 1;
    if (left < 0 || left >= kids.length) {
      fault();
      return rbFail();
    }
    parent = kids[left];
  } else {
    // Here `left < right`: `right` is at least `left - 1`, and center is neither 0 nor -1.
    if (left < 0 || left >= kids.length || right < 1 || right > kids.length) {
      fault();
      return rbFail();
    }
    const kl = kids[left];
    const kr = kids[right - 1];
    const ol = rbCmp(kl.s, action.s);
    const or = rbCmp(kr.e, action.e);
    if (center === 1 && ol <= 0 && or >= 0) {
      parent = kl;
    } else {
      hasChild = true;
      let a = left;
      let b = right;
      if (ol < 0) {
        fusible.push(kl);
        a++;
      }
      if (or > 0) {
        fusible.push(kr);
        b--;
      }
      contained = rbSlice(kids, a, b);
      for (const c of fusible) {
        if (action.insertion() || c.insertion()) {
          // crossing_insertions
          return rbFail();
        }
      }
    }
  }
  const sibL = rbSlice(kids, 0, left);
  const sibR = rbSlice(kids, right, n);
  if (fusible.length > 0) {
    // fuse_deletions
    const others: RbAction[] = [];
    for (const c of sibL) {
      others.push(c);
    }
    for (const c of contained) {
      others.push(c);
    }
    for (const c of sibR) {
      others.push(c);
    }
    const without = rbWithChildren(self, others);
    if (!without.ok) {
      return without;
    }
    let fs = action.s;
    let fe = action.e;
    for (const c of fusible) {
      fs = c.s < fs ? c.s : fs;
      fe = c.e > fe ? c.e : fe;
    }
    const fused = rbWith(action, fs, fe, action.children, action.before, action.hasRepl, action.repl, action.after);
    if (!fused.ok) {
      return fused;
    }
    return rbDoCombine(without.action, fused.action);
  }
  let extra: RbAction = action;
  if (parent !== null) {
    const r = rbDoCombine(parent, action);
    if (!r.ok) {
      return r;
    }
    extra = r.action;
  } else if (hasChild) {
    const r = rbWithChildren(action, contained);
    if (!r.ok) {
      return r;
    }
    const r2 = rbCombineChildren(r.action, action.children);
    if (!r2.ok) {
      return r2;
    }
    extra = r2.action;
  }
  const all: RbAction[] = [];
  for (const c of sibL) {
    all.push(c);
  }
  all.push(extra);
  for (const c of sibR) {
    all.push(c);
  }
  return rbWithChildren(self, all);
};

/** ordered_replacements, appended to the three lists. */
const rbOrdered = (a: RbAction, rs: i32[], re: i32[], rt: string[]): void => {
  if (a.before.length > 0) {
    rs.push(a.s);
    re.push(a.s);
    rt.push(a.before);
  }
  if (a.hasRepl) {
    rs.push(a.s);
    re.push(a.e);
    rt.push(a.repl);
  }
  for (const c of a.children) {
    rbOrdered(c, rs, re, rt);
  }
  if (a.after.length > 0) {
    rs.push(a.e);
    re.push(a.e);
    rt.push(a.after);
  }
};

export class RbRewriter {
  root: RbAction;
  n: i32;

  constructor(n: i32) {
    this.n = n;
    const none: RbAction[] = [];
    let end = n;
    // `n` is a source length, below the i32 maximum.
    if (n < 2147483647) {
      end = n + 1;
    } else {
      fault();
    }
    this.root = new RbAction(-1, end, "", false, "", "", none);
  }

  empty(): boolean {
    return this.root.empty();
  }

  private combine(a: RbAction): boolean {
    if (a.s < 0 || a.e > this.n || a.s > a.e) {
      return false;
    }
    const r = rbCombine(this.root, a);
    if (!r.ok) {
      return false;
    }
    this.root = r.action;
    return true;
  }

  replace(s: i32, e: i32, content: string): boolean {
    const none: RbAction[] = [];
    return this.combine(new RbAction(s, e, "", true, content, "", none));
  }

  wrap(s: i32, e: i32, before: string, after: string): boolean {
    const none: RbAction[] = [];
    return this.combine(new RbAction(s, e, before, false, "", after, none));
  }

  remove(s: i32, e: i32): boolean {
    return this.replace(s, e, "");
  }

  insertBefore(s: i32, e: i32, content: string): boolean {
    return this.wrap(s, e, content, "");
  }

  insertAfter(s: i32, e: i32, content: string): boolean {
    return this.wrap(s, e, "", content);
  }

  /** Corrector#swap. */
  swap(s1: i32, e1: i32, s2: i32, e2: i32, src1: string, src2: string): boolean {
    if (e1 === s2) {
      return this.insertBefore(s1, e1, src2) && this.remove(s2, e2);
    }
    if (e2 === s1) {
      return this.insertBefore(s2, e2, src1) && this.remove(s1, e1);
    }
    return this.replace(s1, e1, src2) && this.replace(s2, e2, src1);
  }

  /** TreeRewriter#merge!: all of `other`'s actions, or none of them on clobbering. */
  merge(other: RbRewriter): boolean {
    const r = rbCombine(this.root, other.root);
    if (!r.ok) {
      return false;
    }
    this.root = r.action;
    return true;
  }

  /** The rewritten source. */
  process(pts: i32[]): string {
    const rs: i32[] = [];
    const re: i32[] = [];
    const rt: string[] = [];
    rbOrdered(this.root, rs, re, rt);
    const parts: string[] = [];
    let last = 0;
    // The three grow together (rbOrdered).
    for (let i = 0; i < rs.length && i < re.length && i < rt.length; i++) {
      const s = rs[i];
      const t = rt[i];
      const e = re[i];
      if (s > last) {
        parts.push(rbText(pts, last, s));
      }
      parts.push(t);
      last = e;
    }
    parts.push(rbText(pts, last, toI32(pts.length)));
    return parts.join("");
  }
}
