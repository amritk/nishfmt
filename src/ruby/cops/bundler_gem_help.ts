// What the Bundler and Gemspec cops share: their Include patterns (a cop
// runs only on the files they match), and the OrderedGemNode mixin with
// OrderedGemCorrector under the default TreatCommentsAsGroupSeparators: true
// and ConsiderPunctuation: false.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { rbAtOff } from "../help";
import { fault } from "../../core/fault";
import { add32 } from "../../core/arr";
import { RbCop } from "../cop";
import { RbSource } from "../source";

/** The part of `path` after its last `/`. */
const rbGemBase = (path: string): string => {
  let i = toI32(path.length) - 1;
  while (i >= 0 && path.charCodeAt(i) !== 47) {
    i--;
  }
  return path.substring(i + 1, toI32(path.length));
};

/**
 * Whether a directory of a relative `path` starts with `.`: `**` does not
 * enter hidden directories (`File.fnmatch?` without FNM_DOTMATCH). `.` and
 * `..` are left out (RuboCop matches the expanded path too). An absolute path
 * is taken as matching: RuboCop matches it relative to the configuration's
 * directory, which this port does not know.
 */
const rbGemHiddenDir = (path: string): boolean => {
  const n = toI32(path.length);
  if (path.length > 0 && path.charCodeAt(0) === 47) {
    return false;
  }
  let a = 0;
  for (let i = 0; i < n; i++) {
    if (path.charCodeAt(i) !== 47) {
      continue;
    }
    const part = path.substring(a, i);
    if (part.length > 0 && part !== "." && part !== ".." && part.charCodeAt(0) === 46) {
      return true;
    }
    a = i + 1;
  }
  return false;
};

/** The Bundler cops' Include: a `Gemfile`, `gems.rb` or `*.gemfile` in any directory. */
export const rbGemfileIncluded = (path: string): boolean => {
  const b = rbGemBase(path);
  return !rbGemHiddenDir(path) && (b === "Gemfile" || b === "gems.rb" || b.endsWith(".gemfile"));
};

/** The Gemspec cops' Include: a `*.gemspec` in any directory. */
export const rbGemspecIncluded = (path: string): boolean =>
  !rbGemHiddenDir(path) && rbGemBase(path).endsWith(".gemspec");

/** OrderedGemNode#gem_canonical_name: without `-` and `_`, downcased. */
const rbGemCanonical = (name: string): string => {
  const out: string[] = [];
  for (let i = 0; i < toI32(name.length); i++) {
    const c = name.charCodeAt(i);
    if (c === 45 || c === 95) {
      continue;
    }
    out.push(String.fromCharCode(c >= 65 && c <= 90 ? c + 32 : c));
  }
  return out.join("");
};

/** String#< (bytewise). */
const rbGemLess = (x: string, y: string): boolean => {
  const n = toI32(x.length);
  const m = toI32(y.length);
  for (let i = 0; i < n && i < m; i++) {
    const a = x.charCodeAt(i);
    const b = y.charCodeAt(i);
    if (a !== b) {
      return a < b;
    }
  }
  return n < m;
};

/** OrderedGemNode#case_insensitive_out_of_order? */
export const rbGemOutOfOrder = (a: string, b: string): boolean => rbGemLess(rbGemCanonical(a), rbGemCanonical(b));

/** OrderedGemNode#consecutive_lines? (comments separate groups). */
export const rbGemConsecutive = (src: RbSource, prev: i32, cur: i32): boolean =>
  toI64(src.line(src.a.exE(prev))) === toI64(src.line(src.a.exS(cur))) - toI64(1);

/** OrderedGemNode#gem_name: the first argument's string (the patterns make it a str). */
export const rbGemName = (src: RbSource, n: i32): string => src.a.text(src.a.kid(src.a.kid(n, 2), 0));

/** OrderedGemCorrector#declaration_with_comment: the declaration's whole lines with the final newline. */
const rbGemDeclRange = (src: RbSource, n: i32): i32[] => {
  const s = src.lineStart(src.line(src.a.exS(n)));
  let e = add32(src.lineEnd(src.line(src.a.exE(n))), 1);
  if (e > src.n) {
    e = src.n;
  }
  return [s, e];
};

/** OrderedGemNode#register_offense with OrderedGemCorrector. */
export const rbGemRegister = (c: RbCop, src: RbSource, prev: i32, cur: i32): void => {
  const k = c.offense(src.a.exS(cur), src.a.exE(cur));
  if (k === null) {
    return;
  }
  const r1 = rbGemDeclRange(src, cur);
  const r2 = rbGemDeclRange(src, prev);
  if (r1.length < 2 || r2.length < 2) {
    fault();
    return;
  }
  const r1s = r1[0];
  const r1e = r1[1];
  const r2s = r2[0];
  const r2e = r2[1];
  const s1 = src.src(r1s, r1e);
  if (r1e > r1s && rbAtOff(src, r1e, -1) === 10) {
    k.swap(r1s, r1e, r2s, r2e, s1, src.src(r2s, r2e));
  } else {
    k.insertBefore(r2s, r2e, `${s1}\n`);
    k.remove(r1s, r1e);
  }
  c.commit(k);
};
