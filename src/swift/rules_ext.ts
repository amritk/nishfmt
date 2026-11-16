// SwiftFormat's redundantFileprivate (swiftVersion undefined: file-scope only),
// redundantNilInit (nilInit remove), enumNamespaces (always) and
// extensionAttributes (typeAttributes preserve) rules.
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import {
  SwDecl,
  SW_DECL_IFDEF,
  SW_DECL_SIMPLE,
  SW_DECL_TYPE,
  swDeclarationName,
  swDeclHi,
  swDeclKeywordIndex,
  swDeclModifiers,
  swParseConformances,
  swParseDeclarations,
  swReleaseDecls,
  swStartOfConditionalAttributeBlocks,
  swStringExcludingLinebreaksAndComments,
} from "./decl";
import { swParsePropertyDeclaration } from "./expr";
import { SwFormatter } from "./formatter";
import { swHasImport } from "./imports";
import { swHasModifier, swIndexOfModifier, swModifiersForDeclaration, swStartOfModifiers } from "./modifiers";
import { swEndOfAttribute, swIsTypeKeywordStr, swIsUnwrap } from "./parsing";
import { swCollectExcludingTypeBodies, swCollectRecursive, swParentType } from "./rules_acl";
import { swIsStartOfClosureType } from "./rules_redundant1";
import { swIsInResultBuilder } from "./rules_simple";
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
  SW_T_NON_SPACE,
  SW_T_NON_SPACE_OR_COMMENT,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
  SW_T_START_OF_SCOPE,
  SwTok,
} from "./token";

/** redundantFileprivate. */
export const swRuleRedundantFileprivate = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (f.kw(i, "fileprivate") && f.indexBefore(SW_T_START_OF_SCOPE, i) < 0) {
      f.replaceToken(i, SW_KEYWORD, "private", 0);
    }
  }
};

/** TypeName(range: lo...hi).isOptionalType. */
const swIsOptionalType = (f: SwFormatter, lo: i32, hi: i32): boolean => {
  const u = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, hi + 1);
  if (u < 0 || !swIsUnwrap(f, u)) {
    return false;
  }
  // !isClosure
  if (!swIsStartOfClosureType(f, lo)) {
    return true;
  }
  return f.tok(lo, SW_START, "(") && f.tok(hi, SW_END, ")") && f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, hi) === u;
};

/** redundantNilInit. */
export const swRuleRedundantNilInit = (f: SwFormatter): void => {
  const decls = swParseDeclarations(f);
  const all: SwDecl[] = [];
  swCollectRecursive(decls, all);
  for (const d of all) {
    if (d.keyword !== "var") {
      continue;
    }
    const varIndex = swDeclKeywordIndex(f, d);
    let skip = false;
    for (const m of swDeclModifiers(f, d)) {
      if (m === "lazy" || (m !== "@objc" && m.startsWith("@"))) {
        skip = true;
      }
    }
    if (skip || swIsInResultBuilder(f, varIndex)) {
      continue;
    }
    const pt = swParentType(d);
    if (pt !== null) {
      const ptk = swDeclKeywordIndex(f, pt);
      const c = swParseConformances(f, ptk);
      for (let q = 0; q < toI32(c.starts.length); q++) {
        const s = swStringExcludingLinebreaksAndComments(f, c.starts[q], c.ends[q] + 1);
        if (s === "Codable" || s === "Decodable") {
          skip = true;
        }
      }
      if (skip) {
        continue;
      }
      if (pt.keyword === "struct") {
        const ob = f.indexOfIn(SW_START, "{", 0, ptk, swDeclHi(f, pt));
        const brace = ob >= 0 ? ob : ptk;
        if (f.indexOfAfter(SW_KEYWORD, "init", 0, brace) < 0) {
          continue;
        }
      }
    }
    const p = swParsePropertyDeclaration(f, varIndex);
    if (p === null || p.typeStart < 0 || !swIsOptionalType(f, p.typeStart, p.typeEnd)) {
      continue;
    }
    if (p.assignment >= 0 && p.valueStart >= 0 && p.valueStart === p.valueEnd && f.tok(p.valueStart, SW_IDENT, "nil")) {
      const b = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, p.assignment);
      const startIndex = b >= 0 ? b : p.assignment - 1;
      f.removeTokens(startIndex + 1, p.valueEnd + 1);
    }
  }
  swReleaseDecls(f, decls);
};

/** hostsOnlyStaticMembers. */
const swHostsOnlyStaticMembers = (f: SwFormatter, ds: SwDecl[]): boolean => {
  for (const d of ds) {
    if (d.kind === SW_DECL_SIMPLE) {
      if (d.keyword === "init") {
        return false;
      }
      if (d.keyword === "let" || d.keyword === "var" || d.keyword === "func" || d.keyword === "subscript") {
        if (!swHasModifier(f, swDeclKeywordIndex(f, d), "static")) {
          return false;
        }
      }
    } else if (d.kind === SW_DECL_IFDEF) {
      if (!swHostsOnlyStaticMembers(f, d.body)) {
        return false;
      }
    }
  }
  return true;
};

/** Declaration.attributes is non-empty. */
const swHasAttributes = (f: SwFormatter, kw: i32): boolean => {
  const som = swStartOfModifiers(f, kw, true);
  const soa = swStartOfConditionalAttributeBlocks(f, som);
  for (let j = soa; j < som; j++) {
    if (f.k(j) === SW_KEYWORD && f.s(j).startsWith("@")) {
      return true;
    }
  }
  for (const m of swModifiersForDeclaration(f, kw).names) {
    if (m.startsWith("@")) {
      return true;
    }
  }
  return false;
};

const swRangeContainsTypeInit = (f: SwFormatter, type: string, lo: i32, hi: i32): boolean => {
  for (let i = lo; i < hi; i++) {
    if (f.k(i) !== SW_IDENT) {
      continue;
    }
    const name = f.s(i);
    if (!(name === type || name === "Self" || name === "self")) {
      continue;
    }
    const nextIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, i);
    if (nextIndex < 0) {
      continue;
    }
    if (f.tok(nextIndex, SW_START, "(")) {
      return true;
    }
    if (f.op(nextIndex, ".", SW_OP_INFIX)) {
      const n2 = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, nextIndex);
      if (n2 >= 0 && (f.tok(n2, SW_IDENT, "init") || f.tok(n2, SW_IDENT, "self"))) {
        return true;
      }
    }
  }
  return false;
};

const swRangeContainsSelfAssignment = (f: SwFormatter, lo: i32, hi: i32): boolean => {
  for (let i = lo; i < hi; i++) {
    if (!f.tok(i, SW_IDENT, "self")) {
      continue;
    }
    const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (p >= 0 && (f.op(p, "=", SW_OP_INFIX) || f.tok(p, SW_DELIM, ":") || f.tok(p, SW_START, "("))) {
      return true;
    }
  }
  return false;
};

/** enumNamespaces. */
export const swRuleEnumNamespaces = (f: SwFormatter): void => {
  const isSwiftTestingFile = swHasImport(f, "Testing");
  const decls = swParseDeclarations(f);
  const all: SwDecl[] = [];
  swCollectRecursive(decls, all);
  for (const d of all) {
    if (d.kind !== SW_DECL_TYPE || !(d.keyword === "struct" || d.keyword === "class")) {
      continue;
    }
    const i = swDeclKeywordIndex(f, d);
    if (d.keyword === "class" && !swHasModifier(f, i, "final")) {
      continue;
    }
    if (swHasAttributes(f, i)) {
      continue;
    }
    const name = swDeclarationName(f, i);
    if (name.length === 0) {
      continue;
    }
    const braceIndex = f.indexOfAfter(SW_START, "{", 0, i);
    if (braceIndex < 0) {
      continue;
    }
    let colon = false;
    for (let j = i; j <= braceIndex; j++) {
      if (f.tok(j, SW_DELIM, ":")) {
        colon = true;
        break;
      }
    }
    if (colon) {
      continue;
    }
    const endIndex = f.indexOfAfter(SW_END, "}", 0, braceIndex);
    if (endIndex < 0) {
      continue;
    }
    if (d.body.length === 0 || !swHostsOnlyStaticMembers(f, d.body)) {
      continue;
    }
    if (swRangeContainsTypeInit(f, name, braceIndex + 1, endIndex) || swRangeContainsSelfAssignment(f, braceIndex + 1, endIndex)) {
      continue;
    }
    if (isSwiftTestingFile) {
      let hasTest = false;
      for (const b of d.body) {
        if (b.keyword === "func" && swHasModifier(f, swDeclKeywordIndex(f, b), "@Test")) {
          hasTest = true;
        }
      }
      if (hasTest) {
        continue;
      }
    }
    f.replaceToken(i, SW_KEYWORD, "enum", 0);
    const fi = swIndexOfModifier(f, "final", i);
    if (fi >= 0) {
      const ni = f.indexAfter(SW_T_NON_SPACE, fi);
      if (ni >= 0) {
        f.removeTokens(fi, ni);
      }
    }
  }
  swReleaseDecls(f, decls);
};

class SwHoistable {
  text: string;
  toks: SwTok[];
  constructor(text: string, toks: SwTok[]) {
    this.text = text;
    this.toks = toks;
  }
}

/** hoistableAttributes(for:). */
const swHoistableAttributes = (f: SwFormatter, d: SwDecl): SwHoistable[] => {
  const out: SwHoistable[] = [];
  const m = swModifiersForDeclaration(f, swDeclKeywordIndex(f, d));
  const definesType = swIsTypeKeywordStr(d.keyword) && d.keyword !== "extension";
  for (let j = 0; j < toI32(m.idx.length); j++) {
    const name = m.names[j];
    const ok = name === "@MainActor" ? !definesType : name.startsWith("@available(");
    if (!ok) {
      continue;
    }
    const e = swEndOfAttribute(f, m.idx[j]);
    if (e < 0) {
      continue;
    }
    out.push(new SwHoistable(name, f.slice(m.idx[j], e + 1)));
  }
  return out;
};

/** removeHoistableAttribute(_:from:). */
const swRemoveHoistableAttribute = (f: SwFormatter, attribute: string, d: SwDecl): void => {
  const m = swModifiersForDeclaration(f, swDeclKeywordIndex(f, d));
  for (let j = 0; j < toI32(m.idx.length); j++) {
    if (m.names[j] !== attribute) {
      continue;
    }
    const startIndex = m.idx[j];
    const endIndex = swEndOfAttribute(f, startIndex);
    if (endIndex < 0) {
      continue;
    }
    let end = endIndex + 1;
    while (f.has(end) && f.k(end) === SW_SPACE) {
      end++;
    }
    if (f.isComment(end)) {
      continue;
    }
    if (f.has(end) && f.k(end) === SW_LINEBREAK) {
      end++;
      while (f.has(end) && f.k(end) === SW_SPACE) {
        end++;
      }
    }
    f.removeTokens(startIndex, end);
    return;
  }
};

/** extensionAttributes. */
export const swRuleExtensionAttributes = (f: SwFormatter): void => {
  const decls = swParseDeclarations(f);
  const all: SwDecl[] = [];
  swCollectRecursive(decls, all);
  for (const ext of all) {
    if (ext.kind !== SW_DECL_TYPE || ext.keyword !== "extension") {
      continue;
    }
    const ek = swDeclKeywordIndex(f, ext);
    if (swParseConformances(f, ek).starts.length !== 0) {
      continue;
    }
    const body: SwDecl[] = [];
    swCollectExcludingTypeBodies(ext.body, body);
    if (body.length === 0) {
      continue;
    }
    const extAttrs: string[] = [];
    for (const h of swHoistableAttributes(f, ext)) {
      if (extAttrs.indexOf(h.text) < 0) {
        extAttrs.push(h.text);
      }
    }
    const bodyAttrs: SwHoistable[][] = [];
    for (const b of body) {
      bodyAttrs.push(swHoistableAttributes(f, b));
    }
    let common: string[] = [];
    for (let q = 0; q < toI32(bodyAttrs.length); q++) {
      const texts: string[] = [];
      for (const h of bodyAttrs[q]) {
        if (texts.indexOf(h.text) < 0) {
          texts.push(h.text);
        }
      }
      if (q === 0) {
        common = texts;
      } else {
        const next: string[] = [];
        for (const t of common) {
          if (texts.indexOf(t) >= 0) {
            next.push(t);
          }
        }
        common = next;
      }
    }
    const toRemove: string[] = [];
    for (const t of common) {
      toRemove.push(t);
    }
    for (const t of extAttrs) {
      if (toRemove.indexOf(t) < 0) {
        toRemove.push(t);
      }
    }
    const toHoist: SwHoistable[] = [];
    for (const h of bodyAttrs[0]) {
      if (common.indexOf(h.text) >= 0 && extAttrs.indexOf(h.text) < 0) {
        toHoist.push(h);
      }
    }
    if (toHoist.length === 0 && toRemove.length === 0) {
      continue;
    }
    if (toHoist.length !== 0) {
      const ins = swStartOfModifiers(f, ek, true);
      const indent = f.currentIndentForLine(ins);
      const line = f.linebreakLine(ins);
      const toks: SwTok[] = [];
      for (const h of toHoist) {
        for (const t of h.toks) {
          toks.push(t);
        }
        toks.push(new SwTok(SW_LINEBREAK, "\n", line));
        if (indent.length !== 0) {
          toks.push(new SwTok(SW_SPACE, indent, 0));
        }
      }
      f.insertToks(toks, ins);
    }
    for (const b of body) {
      const attrs = swHoistableAttributes(f, b);
      for (let q = toI32(attrs.length) - 1; q >= 0; q--) {
        if (toRemove.indexOf(attrs[q].text) >= 0) {
          swRemoveHoistableAttribute(f, attrs[q].text, b);
        }
      }
    }
  }
  swReleaseDecls(f, decls);
};
