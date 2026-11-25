// SwiftFormat's import handling: parseImports, the sortImports and
// duplicateImports rules (importGrouping accessControl+alpha, hoistImports
// on).
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { fault } from "../core/fault";
import { swUniMarkUncertain } from "./unicode";
import { SwFormatter } from "./formatter";
import { swIsAclModifierStr } from "./modifiers";
import { swEndOfAttribute, swEndOfScope, swIsAttribute, swStartOfScope } from "./parsing";
import {
  SW_COMMENT,
  SW_DELIM,
  SW_IDENT,
  SW_KEYWORD,
  SW_LINEBREAK,
  SW_OP,
  SW_OP_INFIX,
  SW_START,
  SW_T_IDENTIFIER,
  SW_T_KEYWORD_OR_ATTRIBUTE,
  SW_T_LINEBREAK,
  SW_T_NON_SPACE,
  SW_T_NON_SPACE_OR_COMMENT,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
  SW_T_SPACE_OR_COMMENT_OR_LINEBREAK,
  SwTok,
} from "./token";

/** An import statement's range [lo, hi), module name, attributes and access level ("" for none). */
export class SwImport {
  module: string;
  lo: i32;
  hi: i32;
  attributes: string[];
  access: string;
  constructor(module: string, lo: i32, hi: i32) {
    this.module = module;
    this.lo = lo;
    this.hi = hi;
    this.attributes = [];
    this.access = "";
  }
}

export class SwImportGroup {
  items: SwImport[];
  constructor() {
    this.items = [];
  }
}

/** String.commentDirective, or "" for nil. */
export const swCommentDirective = (s: string): string => {
  const parts: string[] = [];
  let start = 0;
  const n = toI32(s.length);
  // n is a string length, so i < 2147483647 changes nothing.
  for (let i = 0; i <= n && i < 2147483647; i++) {
    if (i === n || (i < n && s.charCodeAt(i) === 58)) {
      if (i > start) {
        parts.push(s.substring(start, i));
      }
      start = i + 1;
    }
  }
  if (parts.length < 2) {
    return "";
  }
  const p0 = parts[0];
  const p1 = parts[1];
  if (p0.indexOf(" ") >= 0) {
    return "";
  }
  const l = swLower(p0);
  if (l === "note" || l === "warning" || p1.startsWith("//")) {
    return "";
  }
  return p0;
};

const swHasNonAscii = (s: string): boolean => {
  for (let i = 0; i < toI32(s.length); i++) {
    if (s.charCodeAt(i) >= 0x80) {
      return true;
    }
  }
  return false;
};

/** The bytes of s with ASCII capitals lowered (the other bytes kept as they are). */
const swLower = (s: string): string => {
  const n = toI32(s.length);
  const parts: string[] = [];
  let from = 0;
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c >= 65 && c <= 90) {
      parts.push(s.substring(from, i));
      parts.push(String.fromCharCode(c + 32));
      from = i + 1;
    }
  }
  if (from === 0) {
    return s;
  }
  parts.push(s.substring(from));
  return parts.join("");
};

/** The file's name (the last path component). */
const swFileName = (path: string): string => {
  let base = path;
  let i = path.indexOf("/");
  // indexOf answers below path.length, so the u32 sums are exact.
  while (i >= 0) {
    base = path.substring(toI32(toU32(i) + 1));
    i = path.indexOf("/", toI32(toU32(i) + 1));
  }
  return base;
};

/** Token.importAccessLevel. */
const swImportAccessLevel = (f: SwFormatter, i: i32): string => {
  if ((f.k(i) === SW_KEYWORD && !f.s(i).startsWith("@")) || f.k(i) === SW_IDENT) {
    if (swIsAclModifierStr(f.s(i))) {
      return f.s(i);
    }
  }
  return "";
};

/** parseImports(). */
export const swParseImports = (f: SwFormatter): SwImportGroup[] => {
  const stack: SwImportGroup[] = [];
  let cur = new SwImportGroup();
  const fileName = f.path.length === 0 ? ".swift" : swFileName(f.path);
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.kw(i, "import")) {
      continue;
    }
    let startIndex = f.indexBefore(SW_T_LINEBREAK, i);
    if (startIndex < 0) {
      startIndex = 0;
    }
    let pk = f.indexBefore(SW_T_KEYWORD_OR_ATTRIBUTE, i);
    let skip = false;
    while (pk >= 0) {
      if (swIsAttribute(f, pk)) {
        let nextStart = -1;
        if (pk < startIndex) {
          nextStart = f.indexBefore(SW_T_LINEBREAK, pk);
          if (nextStart < 0) {
            nextStart = 0;
          }
        }
        pk = f.indexBefore(SW_T_KEYWORD_OR_ATTRIBUTE, pk);
        if (nextStart >= 0) {
          startIndex = nextStart;
        }
      } else if (f.k(pk) === SW_KEYWORD && swIsAclModifierStr(f.s(pk))) {
        pk = f.indexBefore(SW_T_KEYWORD_OR_ATTRIBUTE, pk);
      } else if (pk >= startIndex) {
        skip = true;
        break;
      } else {
        break;
      }
    }
    if (skip) {
      continue;
    }
    const codeStart = startIndex;
    let prevIndex = f.indexBefore(SW_T_LINEBREAK, startIndex);
    if (prevIndex < 0) {
      prevIndex = 0;
    }
    while (startIndex > 0) {
      const a = f.indexAfter(SW_T_NON_SPACE, prevIndex);
      const b = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, prevIndex);
      if (!(a >= 0 && f.isComment(a) && b >= 0 && f.k(b) === SW_LINEBREAK)) {
        break;
      }
      if (prevIndex === 0 && f.indexOfBefore(SW_START, "#if", 0, startIndex) >= 0) {
        break;
      }
      startIndex = prevIndex;
      prevIndex = f.indexBefore(SW_T_LINEBREAK, startIndex);
      if (prevIndex < 0) {
        prevIndex = 0;
      }
    }
    if (f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, startIndex) < 0) {
      for (let j = startIndex; j < codeStart; j++) {
        if (f.k(j) !== SW_COMMENT) {
          continue;
        }
        const body = f.s(j);
        if (
          body.indexOf("created") >= 0 ||
          body.indexOf("Created") >= 0 ||
          body.indexOf(fileName) >= 0 ||
          swCommentDirective(body) === "swift-tools-version"
        ) {
          startIndex = codeStart;
          break;
        }
      }
    }
    let endIndex = f.indexAfter(SW_T_LINEBREAK, i);
    if (endIndex < 0) {
      endIndex = f.count();
    }
    const fp = f.indexAfter(SW_T_IDENTIFIER, i);
    if (fp < 0) {
      stack.push(cur);
      cur = new SwImportGroup();
      continue;
    }
    const parts: string[] = [f.s(fp)];
    let lastDot = false;
    let partIndex = fp;
    while (true) {
      const np = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, partIndex);
      if (np < 0) {
        break;
      }
      if (f.op(np, ".", SW_OP_INFIX)) {
        parts.push(".");
        lastDot = true;
      } else if (f.k(np) === SW_IDENT && lastDot) {
        parts.push(f.s(np));
        lastDot = false;
      } else {
        break;
      }
      partIndex = np;
    }
    const imp = new SwImport(parts.join(""), startIndex, endIndex);
    for (let j = startIndex; j < endIndex; j++) {
      if (imp.access.length === 0) {
        imp.access = swImportAccessLevel(f, j);
      }
      if (swIsAttribute(f, j)) {
        imp.attributes.push(f.s(j));
      }
    }
    cur.items.push(imp);
    const sp = f.indexAfter(SW_T_SPACE_OR_COMMENT_OR_LINEBREAK, endIndex);
    if (sp >= 0 && f.k(sp) === SW_LINEBREAK) {
      stack.push(cur);
      cur = new SwImportGroup();
      continue;
    }
    let nt = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, endIndex);
    if (nt >= 0) {
      let ended = false;
      while (swIsAttribute(f, nt)) {
        const ea = swEndOfAttribute(f, nt);
        const ni = ea >= 0 ? f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, ea) : -1;
        if (ni < 0) {
          ended = true;
          break;
        }
        nt = ni;
      }
      if (ended) {
        stack.push(cur);
        cur = new SwImportGroup();
        continue;
      }
      const isImport = f.kw(nt, "import");
      let isAcl = false;
      if (swImportAccessLevel(f, nt).length !== 0) {
        const m = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, nt);
        isAcl = m >= 0 && f.kw(m, "import");
      }
      if (!isImport && !isAcl) {
        stack.push(cur);
        cur = new SwImportGroup();
        continue;
      }
    }
  }
  stack.push(cur);
  return stack;
};

/** hasImport(_:). */
export const swHasImport = (f: SwFormatter, module: string): boolean => {
  if (f.hasDirectives()) {
    // Which imports parseImports sees depends on the current rule's enablement.
    for (const g of swParseImports(f)) {
      for (const r of g.items) {
        if (r.module === module) {
          return true;
        }
      }
    }
    return false;
  }
  if (f.impMut !== f.mutations) {
    const parts: string[] = [""];
    for (const g of swParseImports(f)) {
      for (const r of g.items) {
        parts.push(r.module);
      }
    }
    parts.push("");
    f.impNames = parts.join(" ");
    f.impMut = f.mutations;
  }
  return f.impNames.indexOf(` ${module} `) >= 0;
};

/** ImportRange `<`. */
const swImportLess = (a: SwImport, b: SwImport): boolean => {
  if (swHasNonAscii(a.module) || swHasNonAscii(b.module)) {
    // Unicode lowercasing and String ordering (canonical equivalence) are not ported.
    swUniMarkUncertain();
  }
  const la = swLower(a.module);
  const lb = swLower(b.module);
  if (la === lb) {
    return swLess(a.module, b.module);
  }
  return swLess(la, lb);
};

const swLess = (a: string, b: string): boolean => {
  const n = toI32(a.length);
  const m = toI32(b.length);
  const k = n < m ? n : m;
  for (let i = 0; i < k && i < n && i < m; i++) {
    const x = a.charCodeAt(i);
    const y = b.charCodeAt(i);
    if (x !== y) {
      return x < y;
    }
  }
  return n < m;
};

const swAccessOrder = (r: SwImport): i32 => {
  const acl = ["private", "fileprivate", "internal", "package", "public", "open"];
  return acl.indexOf(r.access);
};

/** sortRanges(_:) (a stable sort by access level, then module). */
export const swSortImportRanges = (rs: SwImport[]): SwImport[] => {
  const out: SwImport[] = [];
  for (const r of rs) {
    out.push(r);
  }
  // insertion sort (stable)
  for (let i = 1; i < out.length; i++) {
    const x = out[i];
    let j = i - 1;
    while (j >= 0 && j < out.length && swImportBefore(x, out[j])) {
      // j < i < out.length.
      if (j >= out.length - 1) {
        fault();
        return out;
      }
      out[j + 1] = out[j];
      j--;
    }
    const k = j + 1;
    if (k < 0 || k >= out.length) {
      fault();
      return out;
    }
    out[k] = x;
  }
  return out;
};

const swImportBefore = (lhs: SwImport, rhs: SwImport): boolean => {
  const a = swAccessOrder(lhs);
  const b = swAccessOrder(rhs);
  if (a !== b) {
    return a > b;
  }
  return swImportLess(lhs, rhs);
};

/** isInsidePreprocessorCondition(at:). */
const swIsInsidePreprocessorCondition = (f: SwFormatter, index: i32): boolean => {
  let i = index;
  while (true) {
    const ifIndex = f.indexOfBefore(SW_START, "#if", 0, i);
    if (ifIndex < 0) {
      return false;
    }
    const e = swEndOfScope(f, ifIndex);
    if (e >= 0 && e > index) {
      return true;
    }
    i = ifIndex;
  }
};

/** removeImportGroupLines(_:). */
const swRemoveImportGroupLines = (f: SwFormatter, first: SwImport, last: SwImport): void => {
  // Token indices: each u32 sum is exact.
  const sol = first.lo;
  const afterLast = toI32(toU32(last.hi) + 1);
  const eoll = afterLast < f.count() ? afterLast : f.count();
  const p = f.indexBefore(SW_T_NON_SPACE, sol);
  const blank = p >= 0 && f.k(p) === SW_LINEBREAK;
  f.removeTokens(blank ? sol : toI32(toU32(sol) + 1), eoll);
};

/** hoistStrayImports(). */
const swHoistStrayImports = (f: SwFormatter): void => {
  const all = swParseImports(f);
  const groups: SwImportGroup[] = [];
  for (const g of all) {
    const items = g.items;
    if (items.length > 0 && !swIsInsidePreprocessorCondition(f, items[0].lo)) {
      groups.push(g);
    }
  }
  if (groups.length <= 1) {
    return;
  }
  // Every group kept has an item.
  let stray = false;
  for (let i = 1; i < groups.length; i++) {
    const a = groups[i - 1].items;
    const b = groups[i].items;
    const na = toI32(a.length);
    if (na < 1 || b.length < 1) {
      fault();
      return;
    }
    const start = a[na - 1].hi;
    const end = b[0].lo;
    if (start < end && f.indexInType(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, start, end) >= 0) {
      stray = true;
    }
  }
  if (!stray) {
    const within: i32[] = [];
    const flat: SwImport[] = [];
    for (const g of groups) {
      for (const r of swSortImportRanges(g.items)) {
        within.push(r.lo);
      }
      for (const r of g.items) {
        flat.push(r);
      }
    }
    const across = swSortImportRanges(flat);
    let same = within.length === across.length;
    for (let q = 0; same && q < across.length && q < within.length; q++) {
      if (across[q].lo !== within[q]) {
        same = false;
      }
    }
    if (same) {
      return;
    }
  }
  if (groups.length < 1) {
    fault();
    return;
  }
  const g0 = groups[0].items;
  const ng0 = toI32(g0.length);
  if (ng0 < 1) {
    fault();
    return;
  }
  const insertionIndex = g0[ng0 - 1].hi;
  const hoisted: SwTok[] = [];
  for (let gi = 1; gi < toI32(groups.length); gi++) {
    for (const r of groups[gi].items) {
      hoisted.push(new SwTok(SW_LINEBREAK, "\n", f.linebreakLine(insertionIndex)));
      let lo = r.lo;
      while (lo < r.hi && f.k(lo) === SW_LINEBREAK) {
        lo++;
      }
      for (const t of f.slice(lo, r.hi)) {
        hoisted.push(t);
      }
    }
  }
  for (let gi = toI32(groups.length) - 1; gi >= 1 && gi < groups.length; gi--) {
    const it = groups[gi].items;
    const ni = toI32(it.length);
    if (ni < 1 || it.length < 1) {
      fault();
      return;
    }
    swRemoveImportGroupLines(f, it[0], it[ni - 1]);
  }
  f.insertToks(hoisted, insertionIndex);
};

/** sortImports. */
export const swRuleSortImports = (f: SwFormatter): void => {
  swHoistStrayImports(f);
  const groups = swParseImports(f);
  for (let gi = toI32(groups.length) - 1; gi >= 0 && gi < groups.length; gi--) {
    const rs = groups[gi].items;
    const nr = toI32(rs.length);
    if (nr <= 1 || rs.length <= 1) {
      continue;
    }
    const lo = rs[0].lo;
    const hi = rs[nr - 1].hi;
    const sorted = swSortImportRanges(rs);
    let inserted = false;
    const toks: SwTok[] = [];
    for (const r of sorted) {
      if (r.lo < r.hi && f.k(r.lo) !== SW_LINEBREAK) {
        inserted = true;
        toks.push(new SwTok(SW_LINEBREAK, "\n", f.linebreakLine(0)));
      }
      for (const t of f.slice(r.lo, r.hi)) {
        toks.push(t);
      }
    }
    let final: SwTok[] = toks;
    if (inserted && toks.length > 0) {
      final = [];
      for (let q = 1; q < toks.length; q++) {
        final.push(toks[q]);
      }
    }
    f.replaceTokens(lo, hi, final);
  }
};

/** importAttributesWithArguments(in:). */
const swImportAttributes = (f: SwFormatter, lo: i32, hi: i32): string[] => {
  const out: string[] = [];
  for (let i = lo; i < hi; i++) {
    if (!swIsAttribute(f, i)) {
      continue;
    }
    let a = f.s(i);
    const op = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (op >= 0 && f.tok(op, SW_START, "(")) {
      const cp = swEndOfScope(f, op);
      if (cp >= 0) {
        const parts: string[] = [a];
        // cp < f.count(), so `j < n` changes nothing.
        const n = f.count();
        for (let j = op; j <= cp && j < n; j++) {
          const k = f.k(j);
          if (!(k === 9 || k === SW_LINEBREAK || f.isComment(j))) {
            parts.push(f.s(j));
          }
        }
        a = parts.join("");
      }
    }
    if (out.indexOf(a) < 0) {
      out.push(a);
    }
  }
  return out;
};

const swIsSubset = (a: string[], b: string[]): boolean => {
  for (const x of a) {
    if (b.indexOf(x) < 0) {
      return false;
    }
  }
  return true;
};

/** duplicateImports. */
export const swRuleDuplicateImports = (f: SwFormatter): void => {
  const groups = swParseImports(f);
  for (let gi = toI32(groups.length) - 1; gi >= 0 && gi < groups.length; gi--) {
    const rs: SwImport[] = [];
    for (const r of groups[gi].items) {
      rs.push(r);
    }
    for (let i = toI32(rs.length) - 1; i >= 0; i--) {
      if (i >= toI32(rs.length)) {
        continue;
      }
      const range = rs[i];
      for (let q = i; q < toI32(rs.length) - 1; q++) {
        rs[q] = rs[q + 1];
      }
      // rs held rs[i].
      if (rs.length < 1) {
        fault();
        return;
      }
      rs.pop();
      let j = -1;
      for (let q = 0; q < toI32(rs.length); q++) {
        if (rs[q].module === range.module) {
          j = q;
          break;
        }
      }
      if (j < 0) {
        continue;
      }
      if (j >= rs.length) {
        fault();
        return;
      }
      const range2 = rs[j];
      const a1 = swImportAttributes(f, range.lo, range.hi);
      const a2 = swImportAttributes(f, range2.lo, range2.hi);
      if (swIsSubset(a1, a2)) {
        f.removeTokens(range.lo, range.hi);
        continue;
      }
      if (j >= i && swIsSubset(a2, a1)) {
        f.removeTokens(range2.lo, range2.hi);
        for (let q = j; q < toI32(rs.length) - 1; q++) {
          rs[q] = rs[q + 1];
        }
        // rs held rs[j].
        if (rs.length < 1) {
          fault();
          return;
        }
        rs.pop();
      }
      rs.push(range);
    }
  }
  // removeDuplicateImportsAcrossGroups
  const imports: SwImport[] = [];
  for (const g of swParseImports(f)) {
    for (const r of g.items) {
      if (r.attributes.length !== 0 || r.access.length !== 0) {
        continue;
      }
      const ii = f.indexOfIn(SW_KEYWORD, "import", 0, r.lo, r.hi);
      if (ii < 0 || swStartOfScope(f, ii) >= 0) {
        continue;
      }
      const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, ii);
      if (n < 0 || f.k(n) !== SW_IDENT) {
        continue;
      }
      imports.push(r);
    }
  }
  for (let q = toI32(imports.length) - 1; q >= 0 && q < imports.length; q--) {
    const r = imports[q];
    let firstLo = -1;
    let firstHi = -1;
    for (const x of imports) {
      if (x.module === r.module) {
        firstLo = x.lo;
        firstHi = x.hi;
        break;
      }
    }
    if (firstLo === r.lo && firstHi === r.hi) {
      continue;
    }
    let bad = false;
    for (let j = r.lo; j < r.hi; j++) {
      if (f.isComment(j) || f.tok(j, SW_DELIM, ";")) {
        bad = true;
        break;
      }
    }
    if (bad) {
      continue;
    }
    swRemoveImportGroupLines(f, r, r);
  }
};
