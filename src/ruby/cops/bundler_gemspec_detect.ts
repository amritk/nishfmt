// The detection-only Bundler and Gemspec cops: Bundler/DuplicatedGem,
// Bundler/DuplicatedGroup, Bundler/GemFilename (EnforcedStyle: Gemfile),
// Gemspec/DuplicatedAssignment, Gemspec/RequiredRubyVersion (against
// TargetRubyVersion 3.3) and Gemspec/RubyVersionGlobalsUsage, each under its
// default Include.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_ELSE,
  NT_ARG,
  NT_ARGS,
  NT_ARRAY,
  NT_BEGIN,
  NT_BLOCK,
  NT_CASE,
  NT_CBASE,
  NT_CONST,
  NT_CSEND,
  NT_CVAR,
  NT_DSTR,
  NT_GVAR,
  NT_HASH,
  NT_IF,
  NT_INT,
  NT_IVAR,
  NT_LVAR,
  NT_SEND,
  NT_STR,
  NT_SYM,
  NT_WHEN,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { rbGemfileIncluded, rbGemspecIncluded } from "./bundler_gem_help";
import { vfSameNode } from "./lint_variable_force";
import { mcxLiteral } from "./metrics_complexity_help";
import { scnBranches } from "./style_cond_help";
import { ssxDescendants, ssxGlobalConst, ssxIntValue } from "./style_syntax_help";

/** All nodes, the root first (def_node_search order). */
const bgdAll = (src: RbSource): i32[] => src.pre;

/** register_offense's range: on the node's first line, from its column to its last column. */
const bgdRegister = (c: RbCop, src: RbSource, n: i32): void => {
  const l = src.line(src.a.exS(n));
  const col = src.column(src.a.exS(n));
  const last = src.column(src.a.exE(n));
  const s = src.lineStart(l) + col;
  c.offense(s, s + (last > col ? last - col : 0));
};

/** group_by(&:first_argument): the group whose first node's first argument equals n's, or -1. */
const bgdGroupOf = (src: RbSource, groups: i32[][], n: i32): i32 => {
  for (let i = 0; i < toI32(groups.length); i++) {
    if (vfSameNode(src, src.a.kid(groups[i][0], 2), src.a.kid(n, 2))) {
      return i;
    }
  }
  return -1;
};

/** The first argument of a send (V_NIL for none). */
const bgdFirstArg = (src: RbSource, n: i32): i32 => (src.a.nKid(n) > 2 ? src.a.kid(n, 2) : V_NIL);

/** String#<=> < 0 (bytewise). */
const bgdLess = (x: string, y: string): boolean => {
  const n = toI32(x.length);
  const m = toI32(y.length);
  for (let i = 0; i < n && i < m; i++) {
    if (x.charCodeAt(i) !== y.charCodeAt(i)) {
      return x.charCodeAt(i) < y.charCodeAt(i);
    }
  }
  return n < m;
};

/** Array#sort of strings. */
const bgdSort = (xs: string[]): string[] => {
  const out: string[] = [];
  for (const x of xs) {
    out.push(x);
    let i = toI32(out.length) - 1;
    while (i > 0 && bgdLess(out[i], out[i - 1])) {
      const t = out[i];
      out[i] = out[i - 1];
      out[i - 1] = t;
      i--;
    }
  }
  return out;
};

// ---- Bundler/DuplicatedGem ----------------------------------------------------------

/** CaseNode#branches: the when bodies, and the else branch when there is an `else`. */
const bgdCaseBranches = (src: RbSource, n: i32): i32[] => {
  const a = src.a;
  const out: i32[] = [];
  const k = a.nKid(n);
  for (let i = 1; i < k - 1; i++) {
    const w = a.kid(n, i);
    if (a.isNode(w) && a.type(w) === NT_WHEN) {
      out.push(a.kid(w, -1));
    }
  }
  if (a.has(a.map(n), F_ELSE)) {
    out.push(a.kid(n, k - 1));
  }
  return out;
};

/** conditional_declaration? */
const bgdConditional = (src: RbSource, nodes: i32[]): boolean => {
  const a = src.a;
  let p = src.parent(nodes[0]);
  while (p !== V_NIL && a.type(p) === NT_BEGIN) {
    p = src.parent(p);
  }
  if (p === V_NIL || (a.type(p) !== NT_IF && a.type(p) !== NT_WHEN)) {
    return false;
  }
  const root = a.type(p) === NT_IF ? p : src.parent(p);
  if (root === V_NIL) {
    return false;
  }
  let branches: i32[] = [];
  if (a.type(root) === NT_IF) {
    branches = scnBranches(src, root);
  } else if (a.type(root) === NT_CASE) {
    branches = bgdCaseBranches(src, root);
  }
  for (const n of nodes) {
    let inside = false;
    for (const b of branches) {
      if (b === V_NIL || !a.isNode(b)) {
        continue;
      }
      if (vfSameNode(src, b, n)) {
        inside = true;
      }
      for (let i = 0; i < a.nKid(b); i++) {
        const k = a.kid(b, i);
        if (a.isNode(k) && vfSameNode(src, k, n)) {
          inside = true;
        }
      }
    }
    if (!inside) {
      return false;
    }
  }
  return true;
};

export class CopBundlerDuplicatedGem {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Bundler/DuplicatedGem");
  }
  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    if (!rbGemfileIncluded(src.p.st.path) || src.root === V_NIL) {
      return;
    }
    const a = src.a;
    const groups: i32[][] = [];
    for (const n of bgdAll(src)) {
      // (send nil? :gem str ...)
      if (a.type(n) !== NT_SEND || a.kid(n, 0) !== V_NIL || a.text(a.kid(n, 1)) !== "gem" || a.nKid(n) < 3 || a.type(a.kid(n, 2)) !== NT_STR) {
        continue;
      }
      const g = bgdGroupOf(src, groups, n);
      if (g < 0) {
        const ns: i32[] = [n];
        groups.push(ns);
      } else {
        groups[g].push(n);
      }
    }
    for (const nodes of groups) {
      if (nodes.length < 2 || bgdConditional(src, nodes)) {
        continue;
      }
      for (let i = 1; i < toI32(nodes.length); i++) {
        bgdRegister(this.c, src, nodes[i]);
      }
    }
  }
}

// ---- Bundler/DuplicatedGroup ----------------------------------------------------------

/** respond_to?(:value) ? value.to_s : source, for a group argument. */
const bgdValueOrSource = (src: RbSource, n: i32): string => {
  const a = src.a;
  const t = a.type(n);
  if (t === NT_STR || t === NT_SYM) {
    return a.text(a.kid(n, 0));
  }
  if (t === NT_INT) {
    return `${ssxIntValue(src, n)}`;
  }
  if (t === NT_DSTR) {
    // DstrNode#value: the children's values (or sources), joined.
    const out: string[] = [];
    for (let i = 0; i < a.nKid(n); i++) {
      const k = a.kid(n, i);
      if (!a.isNode(k)) {
        continue;
      }
      const kt = a.type(k);
      out.push(kt === NT_STR || kt === NT_SYM || kt === NT_DSTR || kt === NT_INT ? bgdValueOrSource(src, k) : src.nodeSrc(k));
    }
    return out.join("");
  }
  return src.nodeSrc(n);
};

/** The block's method name (its send node's). */
const bgdBlockMethod = (src: RbSource, b: i32): string => {
  const s = src.a.kid(b, 0);
  if (src.a.isNode(s) && (src.a.type(s) === NT_SEND || src.a.type(s) === NT_CSEND)) {
    return src.a.text(src.a.kid(s, 1));
  }
  return "";
};

/** The group's key: find_source_key and the sorted group_attributes. */
const bgdGroupKey = (src: RbSource, n: i32): string => {
  const a = src.a;
  let key = "";
  let p = src.parent(n);
  while (p !== V_NIL) {
    if (a.type(p) === NT_BLOCK) {
      const m = bgdBlockMethod(src, p);
      if (m === "source" || m === "git" || m === "platforms" || m === "path") {
        const first = bgdFirstArg(src, a.kid(p, 0));
        key = first === V_NIL ? m : `${m}${src.nodeSrc(first)}`;
        break;
      }
    }
    p = src.parent(p);
  }
  const attrs: string[] = [];
  for (let i = 2; i < a.nKid(n); i++) {
    const x = a.kid(n, i);
    if (a.type(x) === NT_HASH) {
      const ps: string[] = [];
      for (let j = 0; j < a.nKid(x); j++) {
        ps.push(src.nodeSrc(a.kid(x, j)));
      }
      attrs.push(bgdSort(ps).join(", "));
    } else {
      attrs.push(bgdValueOrSource(src, x));
    }
  }
  return `${key}${bgdSort(attrs).join("")}`;
};

export class CopBundlerDuplicatedGroup {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Bundler/DuplicatedGroup");
  }
  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    if (!rbGemfileIncluded(src.p.st.path) || src.root === V_NIL) {
      return;
    }
    const a = src.a;
    const keys: string[] = [];
    const groups: i32[][] = [];
    for (const n of bgdAll(src)) {
      if (a.type(n) !== NT_SEND || a.kid(n, 0) !== V_NIL || a.text(a.kid(n, 1)) !== "group") {
        continue;
      }
      const k = bgdGroupKey(src, n);
      let g = -1;
      for (let i = 0; i < toI32(keys.length); i++) {
        if (keys[i] === k) {
          g = i;
        }
      }
      if (g < 0) {
        keys.push(k);
        const ns: i32[] = [n];
        groups.push(ns);
      } else {
        groups[g].push(n);
      }
    }
    for (const nodes of groups) {
      for (let i = 1; i < toI32(nodes.length); i++) {
        bgdRegister(this.c, src, nodes[i]);
      }
    }
  }
}

// ---- Bundler/GemFilename ----------------------------------------------------------------

export class CopBundlerGemFilename {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Bundler/GemFilename");
  }
  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const path = src.p.st.path;
    // Include **/Gemfile, **/gems.rb (and lock files, not Ruby); a `gems.rb` is the offense, a global one.
    if (rbGemfileIncluded(path) && (path === "gems.rb" || path.endsWith("/gems.rb"))) {
      this.c.offense(0, 0);
    }
  }
}

// ---- Gemspec -----------------------------------------------------------------------------

/** GemspecHelp#gem_specification?: the block's parameter name, or null. */
const bgdSpecVar = (src: RbSource, n: i32): string | null => {
  const a = src.a;
  if (a.type(n) !== NT_BLOCK) {
    return null;
  }
  const s = a.kid(n, 0);
  const args = a.kid(n, 1);
  if (!a.isNode(s) || a.type(s) !== NT_SEND || a.nKid(s) !== 2 || a.text(a.kid(s, 1)) !== "new") {
    return null;
  }
  const r = a.kid(s, 0);
  if (!a.isNode(r) || a.type(r) !== NT_CONST || a.text(a.kid(r, 1)) !== "Specification" || !ssxGlobalConst(src, a.kid(r, 0), "Gem")) {
    return null;
  }
  if (!a.isNode(args) || a.type(args) !== NT_ARGS || a.nKid(args) !== 1) {
    return null;
  }
  const arg = a.kid(args, 0);
  if (!a.isNode(arg) || a.type(arg) !== NT_ARG) {
    return null;
  }
  return a.text(a.kid(arg, 0));
};

/** gem_specification (search): the first specification block's parameter name, or null. */
const bgdFirstSpecVar = (src: RbSource): string | null => {
  for (const n of bgdAll(src)) {
    const v = bgdSpecVar(src, n);
    if (v !== null) {
      return v;
    }
  }
  return null;
};

/** `(lvar {#match_block_variable_name? :_1 :it})`. */
const bgdSpecReceiver = (src: RbSource, r: i32, spec: string | null): boolean => {
  const a = src.a;
  if (!a.isNode(r) || a.type(r) !== NT_LVAR) {
    return false;
  }
  const name = a.text(a.kid(r, 0));
  return name === "_1" || name === "it" || (spec !== null && name === spec);
};

/** enclosing_specification: the first block ancestor that is a specification (V_NIL for none). */
const bgdEnclosing = (src: RbSource, n: i32): i32 => {
  let p = src.parent(n);
  while (p !== V_NIL) {
    if (src.a.type(p) === NT_BLOCK && bgdSpecVar(src, p) !== null) {
      return p;
    }
    p = src.parent(p);
  }
  return V_NIL;
};

export class CopGemspecDuplicatedAssignment {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Gemspec/DuplicatedAssignment");
  }
  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    if (!rbGemspecIncluded(src.p.st.path) || src.root === V_NIL) {
      return;
    }
    const a = src.a;
    const spec = bgdFirstSpecVar(src);
    // process_assignment_method_nodes
    const encl: i32[] = [];
    const names: string[] = [];
    const groups: i32[][] = [];
    for (const n of bgdAll(src)) {
      if (a.type(n) !== NT_SEND || !bgdSpecReceiver(src, a.kid(n, 0), spec)) {
        continue;
      }
      const m = a.text(a.kid(n, 1));
      // assignment_method?
      if (!m.endsWith("=") || m === "==" || m === "!=" || m === "<=" || m === ">=" || m === "===") {
        continue;
      }
      const e = bgdEnclosing(src, n);
      let g = -1;
      for (let i = 0; i < toI32(groups.length); i++) {
        if (encl[i] === e && names[i] === m) {
          g = i;
        }
      }
      if (g < 0) {
        encl.push(e);
        names.push(m);
        const ns: i32[] = [n];
        groups.push(ns);
      } else {
        groups[g].push(n);
      }
    }
    for (const nodes of groups) {
      for (let i = 1; i < toI32(nodes.length); i++) {
        bgdRegister(this.c, src, nodes[i]);
      }
    }
    // process_indexed_assignment_method_nodes: (send (send (lvar ...) _) :[]= literal? _)
    const iencl: i32[] = [];
    const inames: string[] = [];
    const igroups: i32[][] = [];
    for (const n of bgdAll(src)) {
      if (a.type(n) !== NT_SEND || a.text(a.kid(n, 1)) !== "[]=" || a.nKid(n) !== 4) {
        continue;
      }
      const r = a.kid(n, 0);
      if (!a.isNode(r) || a.type(r) !== NT_SEND || a.nKid(r) !== 2 || !bgdSpecReceiver(src, a.kid(r, 0), spec)) {
        continue;
      }
      const first = a.kid(n, 2);
      if (!a.isNode(first) || !mcxLiteral(a.type(first))) {
        continue;
      }
      const e = bgdEnclosing(src, n);
      const m = a.text(a.kid(r, 1));
      let g = -1;
      for (let i = 0; i < toI32(igroups.length); i++) {
        if (iencl[i] === e && inames[i] === m && vfSameNode(src, a.kid(igroups[i][0], 2), first)) {
          g = i;
        }
      }
      if (g < 0) {
        iencl.push(e);
        inames.push(m);
        const ns: i32[] = [n];
        igroups.push(ns);
      } else {
        igroups[g].push(n);
      }
    }
    for (const nodes of igroups) {
      for (let i = 1; i < toI32(nodes.length); i++) {
        bgdRegister(this.c, src, nodes[i]);
      }
    }
  }
}

/** A str node's content. */
const bgdStr = (src: RbSource, n: i32): string => src.a.text(src.a.kid(n, 0));

/** /[>=]/ */
const bgdHasGtEq = (s: string): boolean => s.indexOf(">") >= 0 || s.indexOf("=") >= 0;

/** `str_content.scan(/\d/).first(2).join('.')`. */
const bgdTwoDigits = (s: string): string => {
  const ds: string[] = [];
  for (let i = 0; i < toI32(s.length) && ds.length < 2; i++) {
    const c = s.charCodeAt(i);
    if (c >= 48 && c <= 57) {
      ds.push(s.substring(i, i + 1));
    }
  }
  return ds.join(".");
};

/** extract_ruby_version(defined_ruby_version(node)), or null. */
const bgdRubyVersion = (src: RbSource, n: i32): string | null => {
  const a = src.a;
  const t = a.type(n);
  if (t === NT_STR) {
    return bgdTwoDigits(bgdStr(src, n));
  }
  let strs: i32[] = [];
  if (t === NT_ARRAY && a.nKid(n) === 2 && a.type(a.kid(n, 0)) === NT_STR && a.type(a.kid(n, 1)) === NT_STR) {
    strs = [a.kid(n, 0), a.kid(n, 1)];
  } else if (t === NT_SEND && a.text(a.kid(n, 1)) === "new" && a.nKid(n) >= 3) {
    // (send (const (const nil? :Gem) :Requirement) :new $str+)
    const r = a.kid(n, 0);
    const gem = a.isNode(r) && a.type(r) === NT_CONST ? a.kid(r, 0) : V_NIL;
    if (!a.isNode(r) || a.type(r) !== NT_CONST || a.text(a.kid(r, 1)) !== "Requirement") {
      return null;
    }
    if (!a.isNode(gem) || a.type(gem) !== NT_CONST || a.kid(gem, 0) !== V_NIL || a.text(a.kid(gem, 1)) !== "Gem") {
      return null;
    }
    for (let i = 2; i < a.nKid(n); i++) {
      if (a.type(a.kid(n, i)) !== NT_STR) {
        return null;
      }
      strs.push(a.kid(n, i));
    }
  } else {
    return null;
  }
  for (const s of strs) {
    if (bgdHasGtEq(bgdStr(src, s))) {
      return bgdTwoDigits(bgdStr(src, s));
    }
  }
  return null;
};

/** Node::VARIABLES */
const bgdVariable = (t: i32): boolean => t === NT_LVAR || t === NT_IVAR || t === NT_CVAR || t === NT_GVAR;

/** dynamic_version? */
const bgdDynamic = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  const t = a.type(n);
  if ((t === NT_SEND && a.kid(n, 0) === V_NIL) || bgdVariable(t)) {
    return true;
  }
  for (const d of ssxDescendants(src, n)) {
    if (a.type(d) === NT_SEND || bgdVariable(a.type(d))) {
      return true;
    }
  }
  return false;
};

export class CopGemspecRequiredRubyVersion {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Gemspec/RequiredRubyVersion");
  }
  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    if (!rbGemspecIncluded(src.p.st.path)) {
      return;
    }
    const a = src.a;
    // on_new_investigation: required_ruby_version? (send _ :required_ruby_version= _)
    let found = false;
    if (src.root !== V_NIL) {
      for (const n of bgdAll(src)) {
        if (a.type(n) === NT_SEND && a.text(a.kid(n, 1)) === "required_ruby_version=" && a.nKid(n) === 3) {
          found = true;
        }
      }
    }
    if (!found) {
      this.c.offense(0, 0);
    }
    if (src.root === V_NIL) {
      return;
    }
    for (const n of bgdAll(src)) {
      if (a.type(n) !== NT_SEND || a.text(a.kid(n, 1)) !== "required_ruby_version=" || a.nKid(n) < 3) {
        continue;
      }
      const v = a.kid(n, 2);
      if (bgdDynamic(src, v)) {
        continue;
      }
      const rv = bgdRubyVersion(src, v);
      if (rv !== null && rv === "3.3") {
        continue;
      }
      this.c.offense(a.exS(v), a.exE(v));
    }
  }
}

export class CopGemspecRubyVersionGlobalsUsage {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Gemspec/RubyVersionGlobalsUsage");
  }
  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    if (!rbGemspecIncluded(src.p.st.path) || src.root === V_NIL || bgdFirstSpecVar(src) === null) {
      return;
    }
    const a = src.a;
    for (const n of bgdAll(src)) {
      if (a.type(n) !== NT_CONST) {
        continue;
      }
      const scope = a.kid(n, 0);
      const name = a.text(a.kid(n, 1));
      const top = scope === V_NIL || (a.isNode(scope) && a.type(scope) === NT_CBASE);
      if ((top && name === "RUBY_VERSION") || (name === "VERSION" && ssxGlobalConst(src, scope, "Ruby"))) {
        this.c.offense(a.exS(n), a.exE(n));
      }
    }
  }
}
