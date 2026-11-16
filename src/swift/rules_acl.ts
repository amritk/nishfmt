// SwiftFormat's access-control rules: extensionAccessControl (onExtension),
// redundantInternal, redundantPublic; and addDeclarationVisibility /
// removeDeclarationVisibility.
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import {
  SwDecl,
  SW_DECL_IFDEF,
  SW_DECL_TYPE,
  swDeclarationName,
  swDeclarationVisibility,
  swDeclKeywordIndex,
  swDeclVisibility,
  swParseConformances,
  swParseDeclarations,
  swReleaseDecls,
} from "./decl";
import { SwFormatter } from "./formatter";
import { swHasModifier, swIndexOfModifier, swStartOfModifiers } from "./modifiers";
import { swIndexOfLastSignificantKeyword, swStartOfScope, SW_EX_WHERE } from "./parsing";
import { SW_KEYWORD, SW_SPACE, SW_START, SW_T_NON_SPACE_OR_COMMENT, SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, SwTok } from "./token";

/** Visibility as a level: higher is more visible; -1 for none. */
export const swVisLevel = (s: string): i32 => {
  if (s === "private") {
    return 0;
  }
  if (s === "fileprivate") {
    return 1;
  }
  if (s === "internal") {
    return 2;
  }
  if (s === "package") {
    return 3;
  }
  if (s === "public") {
    return 4;
  }
  if (s === "open") {
    return 5;
  }
  return -1;
};

const SW_VIS_NAMES: string = "private fileprivate internal package public open";

const swVisName = (level: i32): string => {
  let k = 0;
  let st = 0;
  for (let j = 0; j <= toI32(SW_VIS_NAMES.length); j++) {
    if (j === toI32(SW_VIS_NAMES.length) || SW_VIS_NAMES.charCodeAt(j) === 32) {
      if (k === level) {
        return SW_VIS_NAMES.substring(st, j);
      }
      k++;
      st = j + 1;
    }
  }
  return "";
};

/** addDeclarationVisibility(_:declarationKeywordIndex:). */
export const swAddDeclarationVisibility = (f: SwFormatter, vis: string, kwIndex0: i32): void => {
  let kwIndex = kwIndex0;
  const existing = swDeclarationVisibility(f, kwIndex);
  if (existing.length !== 0) {
    const vi = swIndexOfModifier(f, existing, kwIndex);
    if (vi >= 0) {
      f.removeToken(vi);
      kwIndex--;
      while (f.has(vi) && f.k(vi) === SW_SPACE) {
        f.removeToken(vi);
        kwIndex--;
      }
    }
  }
  f.insertToks([new SwTok(SW_KEYWORD, vis, 0), new SwTok(SW_SPACE, " ", 0)], swStartOfModifiers(f, kwIndex, false));
};

/** removeDeclarationVisibility(_:declarationKeywordIndex:). */
export const swRemoveDeclarationVisibility = (f: SwFormatter, vis: string, kwIndex: i32): void => {
  const vi = swIndexOfModifier(f, vis, kwIndex);
  if (vi < 0) {
    return;
  }
  f.removeToken(vi);
  while (f.has(vi) && f.k(vi) === SW_SPACE) {
    f.removeToken(vi);
  }
};

/** Declaration.name. */
const swDeclName = (f: SwFormatter, d: SwDecl): string => swDeclarationName(f, swDeclKeywordIndex(f, d));

/** Declaration.fullyQualifiedName ("" for nil). */
const swFullyQualifiedName = (f: SwFormatter, d: SwDecl): string => {
  const name = swDeclName(f, d);
  if (name.length === 0) {
    return "";
  }
  const parts: string[] = [name];
  let p = d.parent;
  while (p !== null) {
    const n = swDeclName(f, p);
    if (n.length !== 0) {
      parts.push(n);
    }
    p = p.parent;
  }
  const out: string[] = [];
  for (let q = toI32(parts.length) - 1; q >= 0; q--) {
    out.push(parts[q]);
  }
  return out.join(".");
};

const swInsidePublicExtension = (f: SwFormatter, d: SwDecl): boolean => {
  let p = d.parent;
  while (p !== null) {
    if (p.keyword === "extension" && swDeclVisibility(f, p) === "public") {
      return true;
    }
    p = p.parent;
  }
  return false;
};

/** forEachRecursiveDeclaration, collected in order. */
const swCollectRecursive = (ds: SwDecl[], out: SwDecl[]): void => {
  for (const d of ds) {
    out.push(d);
    swCollectRecursive(d.body, out);
  }
};

/** forEachRecursiveDeclarationExcludingTypeBodies, collected in order. */
const swCollectExcludingTypeBodies = (ds: SwDecl[], out: SwDecl[]): void => {
  for (const d of ds) {
    if (d.kind === SW_DECL_IFDEF) {
      swCollectExcludingTypeBodies(d.body, out);
    } else {
      out.push(d);
    }
  }
};

/** extensionAccessControl (extensionACLPlacement onExtension). */
export const swRuleExtensionAccessControl = (f: SwFormatter): void => {
  const decls = swParseDeclarations(f);
  const all: SwDecl[] = [];
  swCollectRecursive(decls, all);
  const typeNames: string[] = [];
  const typeVis: i32[] = [];
  for (const d of all) {
    if (d.keyword === "extension" || d.kind !== SW_DECL_TYPE) {
      continue;
    }
    const qn = swFullyQualifiedName(f, d);
    if (qn.length === 0) {
      continue;
    }
    const v = swInsidePublicExtension(f, d) ? 4 : swVisLevelOr(swDeclVisibility(f, d), 2);
    const q = typeNames.indexOf(qn);
    if (q >= 0) {
      typeVis[q] = v;
    } else {
      typeNames.push(qn);
      typeVis.push(v);
    }
  }
  for (const ext of all) {
    if (ext.kind !== SW_DECL_TYPE || ext.keyword !== "extension") {
      continue;
    }
    const vk = swVisLevel(swDeclVisibility(f, ext));
    const ev = vk === 0 ? 1 : vk;
    if (ev < 0 && swParseConformances(f, swDeclKeywordIndex(f, ext)).starts.length !== 0) {
      continue;
    }
    const body: SwDecl[] = [];
    swCollectExcludingTypeBodies(ext.body, body);
    const vis: i32[] = [];
    for (const c of body) {
      const cv = swVisLevel(swDeclVisibility(f, c));
      vis.push(cv >= 0 ? cv : ev >= 0 ? ev : 2);
    }
    if (vis.length === 0) {
      continue;
    }
    // counts over the distinct levels, least visible first; max by count keeps the first
    let member = -1;
    let best = -1;
    let maxVis = -1;
    for (let lv = 0; lv <= 5; lv++) {
      let c = 0;
      for (const v of vis) {
        if (v === lv) {
          c++;
        }
      }
      if (c > 0 && c > best) {
        best = c;
        member = lv;
      }
      if (c > 0) {
        maxVis = lv;
      }
    }
    if (!(member <= (ev >= 0 ? ev : 4)) || member !== maxVis || !(member > 0)) {
      continue;
    }
    if (member !== ev && !(member === 2 && vk < 0)) {
      const en = swDeclName(f, ext);
      const q = en.length === 0 ? -1 : typeNames.indexOf(en);
      if (q >= 0 && typeVis[q] < member) {
        continue;
      }
      swAddDeclarationVisibility(f, swVisName(member), swDeclKeywordIndex(f, ext));
    }
    for (const c of body) {
      const cv = swVisLevel(swDeclVisibility(f, c));
      const eff = cv >= 0 ? cv : ev >= 0 ? ev : 2;
      if (member > eff) {
        if (cv < 0) {
          swAddDeclarationVisibility(f, "internal", swDeclKeywordIndex(f, c));
        }
        continue;
      }
      swRemoveDeclarationVisibility(f, swVisName(member), swDeclKeywordIndex(f, c));
    }
  }
  swReleaseDecls(f, decls);
};

const swVisLevelOr = (s: string, d: i32): i32 => {
  const v = swVisLevel(s);
  return v >= 0 ? v : d;
};

/** redundantInternal. */
export const swRuleRedundantInternal = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.kw(i, "internal")) {
      continue;
    }
    const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, i);
    if (n >= 0 && f.kw(n, "import")) {
      continue;
    }
    let sos = swStartOfScope(f, i);
    while (sos >= 0 && f.tok(sos, SW_START, "#if")) {
      sos = swStartOfScope(f, sos);
    }
    if (sos >= 0) {
      const tk = swIndexOfLastSignificantKeyword(f, sos, SW_EX_WHERE);
      if (tk >= 0 && f.kw(tk, "extension")) {
        const pt = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, tk);
        if (pt >= 0) {
          const ps = f.s(pt);
          if ((ps === "public" || ps === "package" || ps === "internal" || ps === "private" || ps === "fileprivate") && ps !== "internal") {
            continue;
          }
        }
      }
    }
    if (!(f.has(i + 1) && f.k(i + 1) === SW_SPACE)) {
      continue;
    }
    f.removeTokens(i, i + 2);
  }
};

/** The closest parent that is a type (Declaration.parentType). */
const swParentType = (d: SwDecl): SwDecl | null => {
  let p = d.parent;
  while (p !== null) {
    if (p.kind === SW_DECL_TYPE) {
      return p;
    }
    p = p.parent;
  }
  return null;
};

/** redundantPublic. */
export const swRuleRedundantPublic = (f: SwFormatter): void => {
  const decls = swParseDeclarations(f);
  const all: SwDecl[] = [];
  swCollectRecursive(decls, all);
  const internalTypes: string[] = [];
  for (const d of all) {
    if (d.kind !== SW_DECL_TYPE || d.keyword === "extension" || d.keyword === "protocol") {
      continue;
    }
    const tn = swFullyQualifiedName(f, d);
    if (tn.length === 0) {
      continue;
    }
    const v = swDeclVisibility(f, d);
    if (!(v === "internal" || v.length === 0)) {
      continue;
    }
    if (!swInsidePublicExtension(f, d)) {
      internalTypes.push(tn);
    }
  }
  for (const d of all) {
    if (swDeclVisibility(f, d) !== "public") {
      continue;
    }
    const pt = swParentType(d);
    if (pt === null || swInsidePublicExtension(f, d)) {
      continue;
    }
    if (swHasModifier(f, swDeclKeywordIndex(f, d), "@_spi")) {
      continue;
    }
    if (pt.keyword === "extension") {
      const en = swDeclName(f, pt);
      if (en.length !== 0 && internalTypes.indexOf(en) >= 0) {
        swRemoveDeclarationVisibility(f, "public", swDeclKeywordIndex(f, d));
      }
    } else {
      if (swVisLevelOr(swDeclVisibility(f, pt), 2) <= 2) {
        swRemoveDeclarationVisibility(f, "public", swDeclKeywordIndex(f, d));
      }
    }
  }
  swReleaseDecls(f, decls);
};
