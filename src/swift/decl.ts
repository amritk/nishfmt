// SwiftFormat's Declaration tree (Declaration.swift) and parseDeclarations:
// declarations with auto-updating ranges, their keywords, names,
// modifiers, visibility and bodies.
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { swParsePropertyDeclaration, swParseExpressionEnd } from "./expr";
import { SwDecl, SwFormatter, swIndexAfterWhere, swIndexBeforeWhere } from "./formatter";
import { swIsFunctionDeclarationKeyword, swParseFunctionDeclaration } from "./funcdecl";
import { swIsModifierKeyword, swModifiersForDeclaration, swStartOfModifiers } from "./modifiers";
import {
  swEndOfAttribute,
  swEndOfScope,
  swIndexOfLastSignificantKeyword,
  swIsAttribute,
  swIsDeclarationTypeKeyword,
  swIsTypeKeywordStr,
  swParseType,
  swStartOfScope,
  SW_EX_WHERE,
} from "./parsing";
import { swConditionalCompilationDirectives } from "./expr";
import {
  SW_DELIM,
  SW_END,
  SW_IDENT,
  SW_KEYWORD,
  SW_LINEBREAK,
  SW_OP,
  SW_OP_INFIX,
  SW_SPACE,
  SW_START,
  SW_T_NON_LINEBREAK,
  SW_T_NON_SPACE,
  SW_T_NON_SPACE_OR_COMMENT,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
  SW_T_NON_SPACE_OR_LINEBREAK,
  SW_T_START_OF_SCOPE,
  swStrIsMacro,
} from "./token";

export const SW_DECL_SIMPLE: i32 = 0;
export const SW_DECL_TYPE: i32 = 1;
export const SW_DECL_IFDEF: i32 = 2;


export const swDeclLo = (f: SwFormatter, d: SwDecl): i32 => f.refLo[d.h];
export const swDeclHi = (f: SwFormatter, d: SwDecl): i32 => f.refHi[d.h];

/** Declaration._keywordIndex, or -1 when the declaration is no longer valid. */
export const swDeclKeywordIndex = (f: SwFormatter, d: SwDecl): i32 => {
  const lo = swDeclLo(f, d) - 1;
  if (d.kind === SW_DECL_IFDEF) {
    return f.indexOfAfter(SW_START, "#if", 0, lo);
  }
  return f.indexOfAfter(SW_KEYWORD, d.keyword, 0, lo);
};

/** declarationType(at:). */
export const swDeclarationType = (f: SwFormatter, index: i32): string => {
  if (!swIsDeclarationTypeKeyword(f, index)) {
    return "";
  }
  const kw = f.s(index);
  if (kw === "class") {
    let next = index;
    while (true) {
      const i = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, next);
      if (i < 0) {
        break;
      }
      if (swIsDeclarationTypeKeyword(f, i)) {
        return f.s(i);
      }
      if (!swIsModifierKeyword(f, i)) {
        break;
      }
      next = i;
    }
  }
  return kw;
};

/** isFreestandingMacroExpansion(at:in:). */
const swIsFreestandingMacroExpansion = (f: SwFormatter, index: i32, lo: i32, hi: i32): boolean => {
  if (!(index >= lo && index < hi) || !swStrIsMacro(f.s(index))) {
    return false;
  }
  const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
  if (p < 0 || !(p >= lo && p < hi)) {
    return true;
  }
  if (f.tok(p, SW_DELIM, ";")) {
    return true;
  }
  let lb = false;
  for (let j = p; j < index; j++) {
    if (f.k(j) === SW_LINEBREAK) {
      lb = true;
      break;
    }
  }
  if (!lb || (f.k(p) === SW_OP && f.a(p) === SW_OP_INFIX) || f.tok(p, SW_DELIM, ",")) {
    return false;
  }
  return true;
};

/** indexOfNextDeclarationStart(after:), or -1. */
export const swIndexOfNextDeclarationStart = (f: SwFormatter, index: i32): i32 => {
  let s = index;
  while (true) {
    const n = swIndexAfterWhere(f, s, (g, j) => swIsDeclarationTypeKeyword(g, j) || g.tok(j, SW_START, "#if") || swStrIsMacro(g.s(j)));
    if (n < 0) {
      return -1;
    }
    if (swIsDeclarationTypeKeyword(f, n) || f.tok(n, SW_START, "#if") || swIsFreestandingMacroExpansion(f, n, 0, f.count())) {
      return n;
    }
    s = n;
  }
};

/** endOfConditionalAttributeBlock(at:), or -1. */
export const swEndOfConditionalAttributeBlock = (f: SwFormatter, ifIndex: i32): i32 => {
  if (!f.tok(ifIndex, SW_START, "#if")) {
    return -1;
  }
  const first = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, f.endOfLine(ifIndex));
  if (first < 0 || !(swIsAttribute(f, first) || f.kw(first, "#else") || f.kw(first, "#elseif"))) {
    return -1;
  }
  const dirs = swConditionalCompilationDirectives(f, ifIndex);
  if (dirs === null) {
    return -1;
  }
  const bStart: i32[] = [];
  const bEnd: i32[] = [];
  for (let q = 0; q + 1 < toI32(dirs.length); q++) {
    const eod = f.endOfLine(dirs[q]);
    if (!(eod < dirs[q + 1])) {
      return -1;
    }
    bStart.push(eod);
    bEnd.push(dirs[q + 1]);
  }
  if (bEnd.length === 0) {
    return -1;
  }
  const endif = bEnd[toI32(bEnd.length) - 1];
  const nextIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, endif);
  if (nextIndex < 0) {
    return -1;
  }
  const di = swIndexOfNextDeclarationStart(f, endif);
  if (di < 0 || swStartOfModifiers(f, di, true) !== nextIndex) {
    return -1;
  }
  if (f.tok(di, SW_START, "#if") && swEndOfConditionalAttributeBlock(f, di) < 0) {
    return -1;
  }
  let contains = false;
  for (let q = 0; q < toI32(bStart.length); q++) {
    let index = bStart[q];
    while (true) {
      const ai = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
      if (ai < 0 || ai >= bEnd[q]) {
        break;
      }
      if (!swIsAttribute(f, ai)) {
        return -1;
      }
      const ea = swEndOfAttribute(f, ai);
      if (ea < 0) {
        return -1;
      }
      contains = true;
      index = ea;
    }
  }
  return contains ? endif : -1;
};

/** startOfConditionalAttributeBlocks(before:). */
export const swStartOfConditionalAttributeBlocks = (f: SwFormatter, index: i32): i32 => {
  let startIndex = index;
  while (true) {
    const endif = f.indexBefore(SW_T_NON_SPACE_OR_LINEBREAK, startIndex);
    if (endif < 0 || !f.tok(endif, SW_END, "#endif")) {
      break;
    }
    const ifIndex = f.indexOfBefore(SW_START, "#if", 0, endif);
    if (ifIndex < 0 || swEndOfConditionalAttributeBlock(f, ifIndex) !== endif) {
      break;
    }
    startIndex = ifIndex;
  }
  return startIndex;
};

/** _endOfDeclarationInTypeBody(atDeclarationKeyword:), or -1 for nil. */
export const swEndOfDeclarationInTypeBody = (f: SwFormatter, kwIndex: i32): i32 => {
  let searchIndex = kwIndex;
  const dt = swDeclarationType(f, kwIndex);
  const keyword = dt.length !== 0 ? dt : f.s(kwIndex);
  let endOfDeclaration = -1;
  if (f.tok(kwIndex, SW_START, "#if")) {
    const e = swEndOfScope(f, kwIndex);
    if (e >= 0) {
      searchIndex = e;
    }
  } else if (f.kw(kwIndex, "class") && keyword !== "class") {
    const k = f.indexOfAfter(SW_KEYWORD, keyword, 0, kwIndex);
    if (k >= 0) {
      searchIndex = k;
    }
  } else if (f.kw(kwIndex, "import")) {
    const sk = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, kwIndex);
    if (sk >= 0 && swIsDeclarationTypeKeyword(f, sk)) {
      searchIndex = sk;
    }
  } else if (f.kw(kwIndex, "protocol") || f.kw(kwIndex, "struct") || f.kw(kwIndex, "actor") || f.kw(kwIndex, "enum") || f.kw(kwIndex, "extension")) {
    const ss = f.indexOfAfter(SW_START, "{", 0, kwIndex);
    if (ss >= 0) {
      const e = swEndOfScope(f, ss);
      if (e >= 0) {
        searchIndex = e;
      }
    }
  } else if (f.kw(kwIndex, "let") || f.kw(kwIndex, "var")) {
    const p = swParsePropertyDeclaration(f, kwIndex);
    if (p !== null) {
      const e = swPropertyRangeEnd(p.bodyEnd, p.valueEnd, p.typeEnd, p.identifierIndex);
      searchIndex = e;
      endOfDeclaration = e;
    }
  } else if (swIsFunctionDeclarationKeyword(f, kwIndex)) {
    const d = swParseFunctionDeclaration(f, kwIndex);
    if (d !== null) {
      searchIndex = d.end();
      endOfDeclaration = d.end();
    }
  } else if (f.k(kwIndex) === SW_KEYWORD && swStrIsMacro(f.s(kwIndex))) {
    const e = swParseExpressionEnd(f, kwIndex, false);
    if (e >= 0) {
      searchIndex = e;
      endOfDeclaration = e;
    }
  }
  const next = swIndexOfNextDeclarationStart(f, searchIndex);
  if (next < 0) {
    return -1;
  }
  const lsi = swIndexBeforeWhere(f, swStartOfModifiers(f, next, true), (g, j) => {
    const k = g.k(j);
    return !(k === SW_SPACE || k === SW_LINEBREAK || g.isComment(j));
  });
  if (lsi >= 0) {
    const last = f.tok(lsi, SW_DELIM, ";") ? lsi : f.endOfLine(lsi);
    if (endOfDeclaration >= 0) {
      endOfDeclaration = endOfDeclaration > last ? endOfDeclaration : last;
    } else {
      endOfDeclaration = last;
    }
  }
  while (endOfDeclaration >= 0 && f.has(endOfDeclaration + 1) && (f.k(endOfDeclaration + 1) === SW_SPACE || f.k(endOfDeclaration + 1) === SW_LINEBREAK)) {
    if (f.k(endOfDeclaration + 1) === SW_SPACE) {
      if (!(f.k(endOfDeclaration) === SW_LINEBREAK && f.has(endOfDeclaration + 2) && f.k(endOfDeclaration + 2) === SW_LINEBREAK)) {
        break;
      }
    }
    endOfDeclaration = endOfDeclaration + 1;
  }
  return endOfDeclaration;
};

/** PropertyDeclaration.range.upperBound. */
export const swPropertyRangeEnd = (bodyEnd: i32, valueEnd: i32, typeEnd: i32, identifierIndex: i32): i32 => {
  if (bodyEnd >= 0) {
    return bodyEnd;
  }
  if (valueEnd >= 0) {
    return valueEnd;
  }
  if (typeEnd >= 0) {
    return typeEnd;
  }
  return identifierIndex;
};

/** parseDeclarations(in: lo ..< hi). */
export const swParseDeclarationsIn = (f: SwFormatter, lo: i32, hi0: i32, useForEachToken: boolean = true): SwDecl[] => {
  const hi = hi0 > f.count() ? f.count() : hi0;
  const kws: string[] = [];
  const kwIdx: i32[] = [];
  const rlo: i32[] = [];
  const rhi: i32[] = [];
  let startOfDeclaration = lo;
  for (let index = lo < 0 ? 0 : lo; index < hi; index++) {
    if (index < startOfDeclaration) {
      continue;
    }
    const isStart =
      swIsDeclarationTypeKeyword(f, index) ||
      (f.tok(index, SW_START, "#if") && swEndOfConditionalAttributeBlock(f, index) < 0) ||
      swIsFreestandingMacroExpansion(f, index, lo, hi);
    if (!isStart) {
      continue;
    }
    if (f.lastIndexInType(SW_T_START_OF_SCOPE, startOfDeclaration, index) >= 0) {
      continue;
    }
    const dt = swDeclarationType(f, index);
    const keyword = dt.length !== 0 ? dt : f.s(index);
    const eod = swEndOfDeclarationInTypeBody(f, index);
    const end = eod < 0 ? hi - 1 : eod < hi - 1 ? eod : hi - 1;
    // A declaration where the current rule is disabled by a directive is left out.
    if (f.hasDirectives() && !(useForEachToken ? f.enabledInLoopAt(index, lo < 0 ? 0 : lo) : f.isEnabled())) {
      startOfDeclaration = end + 1;
      continue;
    }
    kws.push(keyword);
    kwIdx.push(index);
    rlo.push(startOfDeclaration);
    rhi.push(end);
    startOfDeclaration = end + 1;
  }
  const out: SwDecl[] = [];
  for (let q = 0; q < toI32(kws.length); q++) {
    const keyword = kws[q];
    const ki = kwIdx[q];
    let made = false;
    if (swIsTypeKeywordStr(keyword)) {
      const ob = f.indexOfAfter(SW_START, "{", 0, ki);
      const eos = ob >= 0 ? swEndOfScope(f, ob) : -1;
      if (ob >= 0 && eos >= 0) {
        const sob = f.indexAfter(SW_T_NON_LINEBREAK, ob);
        const eob = f.indexBefore(SW_T_NON_SPACE, eos);
        let body: SwDecl[] = [];
        if (sob >= 0 && eob >= 0 && sob <= eob) {
          body = swParseDeclarationsIn(f, sob, eob + 1);
        } else {
          body = swParseDeclarationsIn(f, ob + 1, eos);
        }
        const d = new SwDecl(keyword, SW_DECL_TYPE, f.ref(rlo[q], rhi[q]));
        d.body = body;
        for (const c of body) {
          c.parent = d;
        }
        out.push(d);
        made = true;
      }
    } else if (keyword === "#if") {
      const eos = swEndOfScope(f, ki);
      if (eos >= 0) {
        const eol = f.endOfLine(ki);
        const sob = f.indexAfter(SW_T_NON_LINEBREAK, eol);
        const eob = f.indexBefore(SW_T_NON_SPACE, eos);
        let body: SwDecl[] = [];
        if (sob >= 0 && eob >= 0 && sob <= eob) {
          body = swParseDeclarationsIn(f, sob, eob + 1);
        } else {
          body = swParseDeclarationsIn(f, eol + 1, eos);
        }
        const d = new SwDecl(keyword, SW_DECL_IFDEF, f.ref(rlo[q], rhi[q]));
        d.body = body;
        for (const c of body) {
          c.parent = d;
        }
        out.push(d);
        made = true;
      }
    }
    if (!made) {
      out.push(new SwDecl(keyword, SW_DECL_SIMPLE, f.ref(rlo[q], rhi[q])));
    }
  }
  const valid: SwDecl[] = [];
  for (const d of out) {
    if (swDeclKeywordIndex(f, d) >= 0) {
      valid.push(d);
    }
  }
  return valid;
};

/** parseDeclarations(). */
export const swParseDeclarations = (f: SwFormatter): SwDecl[] => {
  // As parseDeclarations() caches its result per mutation count (canCacheDeclarations: no
  // directives): rules that change nothing share one parse.
  const cached = f.declCache;
  if (cached !== null && f.declCacheMut === f.mutations && !f.hasDirectives()) {
    return cached;
  }
  const ds = swParseDeclarationsIn(f, 0, f.count());
  f.declCache = ds;
  f.declCacheMut = f.mutations;
  return ds;
};

/** parseEnclosingType(containing:), or null. */
export const swParseEnclosingType = (f: SwFormatter, index: i32): SwDecl | null => {
  const sos = swStartOfScope(f, index);
  if (sos < 0) {
    return null;
  }
  const tk = swIndexOfLastSignificantKeyword(f, sos, SW_EX_WHERE);
  if (tk >= 0 && swIsTypeKeywordStr(f.s(tk))) {
    const ob = f.indexOfAfter(SW_START, "{", 0, tk);
    const eos = ob >= 0 ? swEndOfScope(f, ob) : -1;
    if (ob >= 0 && eos >= 0) {
      const d = new SwDecl(f.s(tk), SW_DECL_TYPE, f.ref(swStartOfModifiers(f, tk, true), eos));
      d.body = swParseDeclarationsIn(f, ob + 1, eos, false);
      for (const c of d.body) {
        c.parent = d;
      }
      return d;
    }
  }
  return swParseEnclosingType(f, sos);
};

/** The declaration's modifiers (Declaration.modifiers). */
export const swDeclModifiers = (f: SwFormatter, d: SwDecl): string[] => swModifiersForDeclaration(f, swDeclKeywordIndex(f, d)).names;

/** isStoredProperty(atIntroducerIndex:). */
export const swIsStoredProperty = (f: SwFormatter, introducer: i32): boolean => {
  const p = swParsePropertyDeclaration(f, introducer);
  if (p === null) {
    return false;
  }
  if (p.bodyStart < 0) {
    return true;
  }
  const lo = p.insideStart;
  if (!f.has(lo)) {
    return true;
  }
  return f.tok(lo, SW_IDENT, "willSet") || f.tok(lo, SW_IDENT, "didSet");
};

/** Declaration.isStoredInstanceProperty. */
export const swDeclIsStoredInstanceProperty = (f: SwFormatter, d: SwDecl): boolean => {
  const mods = swDeclModifiers(f, d);
  return mods.indexOf("static") < 0 && swIsStoredProperty(f, swDeclKeywordIndex(f, d));
};

/** declarationName(keywordIndex:), or "" for nil. */
export const swDeclarationName = (f: SwFormatter, keywordIndex: i32): string => {
  if (f.s(keywordIndex) === "#if") {
    return "";
  }
  const ni = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, keywordIndex);
  if (ni < 0) {
    return "";
  }
  if (f.s(keywordIndex) === "extension") {
    const e = swParseType(f, ni);
    if (e < 0) {
      return "";
    }
    return swStringExcludingLinebreaksAndComments(f, ni, e + 1);
  }
  return f.s(ni);
};

/** Visibility levels, most visible first (Visibility.allCases order). */
export const swVisibilityRank = (s: string): i32 => {
  if (s === "open") {
    return 0;
  }
  if (s === "public") {
    return 1;
  }
  if (s === "package") {
    return 2;
  }
  if (s === "internal") {
    return 3;
  }
  if (s === "fileprivate") {
    return 4;
  }
  if (s === "private") {
    return 5;
  }
  return -1;
};

/** declarationVisibility(keywordIndex:), or "". */
export const swDeclarationVisibility = (f: SwFormatter, keywordIndex: i32): string => {
  let s = swStartOfModifiers(f, keywordIndex, false);
  while (s < keywordIndex) {
    if (swVisibilityRank(f.s(s)) >= 0) {
      const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, s);
      if (!(n >= 0 && f.tok(n, SW_START, "("))) {
        return f.s(s);
      }
    }
    s++;
  }
  return "";
};

/** Declaration.visibility(), or "". */
export const swDeclVisibility = (f: SwFormatter, d: SwDecl): string => {
  if (d.kind === SW_DECL_IFDEF) {
    return d.body.length === 0 ? "" : swDeclVisibility(f, d.body[0]);
  }
  return swDeclarationVisibility(f, swDeclKeywordIndex(f, d));
};

/** stringExcludingLinebreaksAndComments over tokens [lo, hi). */
export const swStringExcludingLinebreaksAndComments = (f: SwFormatter, lo: i32, hi: i32): string => {
  const parts: string[] = [];
  let lastIsSpace = true;
  let lastSpaced = false;
  let any = false;
  let index = lo;
  while (index < hi) {
    while (index < hi && f.isComment(index)) {
      index++;
    }
    if (index < hi && f.k(index) === SW_LINEBREAK) {
      index++;
      while (index < hi && f.k(index) === SW_SPACE) {
        index++;
      }
      if (any && !lastIsSpace && index < hi && (lastSpaced || f.op(index, "&", SW_OP_INFIX) || f.op(index, "->", SW_OP_INFIX))) {
        parts.push(" ");
        lastIsSpace = true;
        lastSpaced = false;
      }
    }
    if (index < hi) {
      parts.push(f.s(index));
      any = true;
      lastIsSpace = f.k(index) === SW_SPACE;
      lastSpaced = f.op(index, "&", SW_OP_INFIX) || f.op(index, "->", SW_OP_INFIX);
      index++;
    }
  }
  return swTrimSpaces(parts.join(""));
};

/** trimmingCharacters(in: .whitespaces) for spaces and tabs. */
export const swTrimSpaces = (s: string): string => {
  let a = 0;
  let b = toI32(s.length);
  while (a < b && (s.charCodeAt(a) === 32 || s.charCodeAt(a) === 9)) {
    a++;
  }
  while (b > a && (s.charCodeAt(b - 1) === 32 || s.charCodeAt(b - 1) === 9)) {
    b--;
  }
  return s.substring(a, b);
};

/** parseConformancesOfType(atKeywordIndex:): the start index of each conformance (ends in `ends`). */
export class SwConformances {
  starts: i32[];
  ends: i32[];
  constructor() {
    this.starts = [];
    this.ends = [];
  }
}

export const swParseConformances = (f: SwFormatter, keywordIndex: i32): SwConformances => {
  const c = new SwConformances();
  const st = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, keywordIndex);
  if (st < 0) {
    return c;
  }
  const te = swParseType(f, st);
  if (te < 0) {
    return c;
  }
  const iat = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, te);
  if (iat < 0 || !f.tok(iat, SW_DELIM, ":")) {
    return c;
  }
  let next = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, iat);
  if (next < 0) {
    return c;
  }
  while (true) {
    const e = swParseType(f, next);
    if (e < 0) {
      break;
    }
    c.starts.push(next);
    c.ends.push(e);
    const nt = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, e);
    if (nt < 0) {
      break;
    }
    next = nt;
    if (!f.tok(nt, SW_DELIM, ",")) {
      return c;
    }
    const fc = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, nt);
    if (fc < 0) {
      return c;
    }
    next = fc;
  }
  return c;
};

/** Releases the declarations' range references. */
export const swReleaseDecls = (f: SwFormatter, ds: SwDecl[]): void => {
  const cached = f.declCache;
  if (cached !== null && cached === ds) {
    if (f.declCacheMut === f.mutations && !f.hasDirectives()) {
      // Still valid: keep it for the next rule.
      return;
    }
    f.declCache = null;
  }
  swReleaseDeclTree(f, ds);
};

const swReleaseDeclTree = (f: SwFormatter, ds: SwDecl[]): void => {
  for (const d of ds) {
    f.unref(d.h);
    swReleaseDeclTree(f, d.body);
  }
};
