// SwiftFormat's redundantMemberwiseInit rule, with the default options
// (preferSynthesizedInitForInternalStructs never, Swift version below 6.4).
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import {
  SW_DECL_TYPE,
  swDeclIsStoredInstanceProperty,
  swDeclKeywordIndex,
  swDeclLo,
  swDeclVisibility,
  swParseDeclarations,
  swReleaseDecls,
  swStartOfConditionalAttributeBlocks,
  swStringExcludingLinebreaksAndComments,
  swVisibilityRank,
} from "./decl";
import { swParsePropertyDeclaration } from "./expr";
import { SwDecl, SwFormatter } from "./formatter";
import { swParseFunctionDeclaration } from "./funcdecl";
import { swHasModifier, swIsDocComment, swModifiersForDeclaration, swStartOfModifiers } from "./modifiers";
import { swEndOfScope, swIsAttribute, swParseType, swStartOfScope } from "./parsing";
import {
  SW_DELIM,
  SW_IDENT,
  SW_KEYWORD,
  SW_LINEBREAK,
  SW_OP,
  SW_OP_INFIX,
  SW_SPACE,
  SW_START,
  SW_T_LINEBREAK,
  SW_T_NON_SPACE,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
} from "./token";

/** Declaration.accessLevel() as a Visibility rank (internal when absent). */
const swAccessRank = (f: SwFormatter, d: SwDecl): i32 => {
  const v = swDeclVisibility(f, d);
  return v.length === 0 ? 3 : swVisibilityRank(v);
};

/** Declaration.startOfModifiersIndex(includingAttributes:). */
const swDeclStartOfModifiers = (f: SwFormatter, d: SwDecl, includingAttributes: boolean): i32 => {
  const s = swStartOfModifiers(f, swDeclKeywordIndex(f, d), includingAttributes);
  const lo = swDeclLo(f, d);
  return s > lo ? s : lo;
};

/** Declaration.attributes is not empty. */
const swDeclHasAttributes = (f: SwFormatter, d: SwDecl): boolean => {
  const som = swDeclStartOfModifiers(f, d, true);
  const soa = swStartOfConditionalAttributeBlocks(f, som);
  for (let i = soa; i < som; i++) {
    if (swIsAttribute(f, i)) {
      return true;
    }
  }
  const m = swModifiersForDeclaration(f, swDeclKeywordIndex(f, d));
  for (const n of m.names) {
    if (n.startsWith("@")) {
      return true;
    }
  }
  return false;
};

/** parseDocCommentRange(forDeclarationAt:)'s lower bound, or -1 for nil. */
const swDocCommentStart = (f: SwFormatter, keywordIndex: i32): i32 => {
  const som = swStartOfModifiers(f, keywordIndex, true);
  let parseIndex = swStartOfConditionalAttributeBlocks(f, som);
  let found = false;
  while (true) {
    const eopl = f.indexBefore(SW_T_LINEBREAK, parseIndex);
    if (eopl < 0) {
      break;
    }
    const eoplc = f.indexBefore(SW_T_NON_SPACE, eopl);
    if (eoplc < 0 || !f.isComment(eoplc)) {
      break;
    }
    const sos = swStartOfScope(f, eoplc);
    if (sos < 0) {
      break;
    }
    parseIndex = sos;
    found = true;
  }
  return found ? parseIndex : -1;
};

/** Whether tokens [a0, a1] equal tokens [b0, b1]. */
const swSameTokenRun = (f: SwFormatter, a0: i32, a1: i32, b0: i32, b1: i32): boolean => {
  if (a1 - a0 !== b1 - b0) {
    return false;
  }
  for (let q = 0; q <= a1 - a0; q++) {
    if (!f.same(a0 + q, b0 + q)) {
      return false;
    }
  }
  return true;
};

/** s.replacingOccurrences(of: what, with: ""). */
const swRemoveAll = (s: string, what: string): string => {
  if (s.indexOf(what) < 0) {
    return s;
  }
  const parts: string[] = [];
  let start = 0;
  while (true) {
    const j = s.indexOf(what, start);
    if (j < 0) {
      break;
    }
    parts.push(s.substring(start, j));
    start = j + toI32(what.length);
  }
  parts.push(s.substring(start));
  return parts.join("");
};

/** checkForDefaultValue(arg:). */
const swArgHasDefaultValue = (f: SwFormatter, internalLabelIndex: i32): boolean => {
  const colon = f.indexOfAfter(SW_DELIM, ":", 0, internalLabelIndex);
  if (colon < 0) {
    return false;
  }
  const ts = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, colon);
  if (ts < 0) {
    return false;
  }
  const te = swParseType(f, ts);
  if (te < 0) {
    return false;
  }
  const eq = f.indexOfAfter(SW_OP, "=", SW_OP_INFIX, te);
  if (eq < 0) {
    return false;
  }
  const between = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, te);
  return !(between >= 0 && between < eq);
};

/** redundantMemberwiseInit. */
export const swRuleRedundantMemberwiseInit = (f: SwFormatter): void => {
  const all = swParseDeclarations(f);
  for (const sd of all) {
    if (sd.keyword !== "struct" || sd.kind !== SW_DECL_TYPE) {
      continue;
    }
    // The stored properties.
    const propNames: string[] = [];
    const propTypeStart: i32[] = [];
    const propTypeEnd: i32[] = [];
    const propDecls: SwDecl[] = [];
    for (const c of sd.body) {
      if (!(c.keyword === "var" || c.keyword === "let")) {
        continue;
      }
      const p = swParsePropertyDeclaration(f, swDeclKeywordIndex(f, c));
      if (p === null || p.typeStart < 0 || !swDeclIsStoredInstanceProperty(f, c)) {
        continue;
      }
      propNames.push(p.identifier);
      propTypeStart.push(p.typeStart);
      propTypeEnd.push(p.typeEnd);
      propDecls.push(c);
    }
    if (propNames.length === 0) {
      continue;
    }
    let inits = 0;
    let initDecl: SwDecl | null = null;
    for (const c of sd.body) {
      if (c.keyword === "init") {
        inits++;
        initDecl = c;
      }
    }
    if (inits !== 1 || initDecl === null) {
      continue;
    }
    const initAccess = swAccessRank(f, initDecl);
    if (initAccess === 1 || initAccess === 2) {
      continue;
    }
    // The synthesized init's visibility: the least visible private stored property in it.
    let synth = 3;
    for (const c of sd.body) {
      if (!(c.keyword === "var" || c.keyword === "let") || !swDeclIsStoredInstanceProperty(f, c)) {
        continue;
      }
      const acc = swAccessRank(f, c);
      if (!(acc === 4 || acc === 5)) {
        continue;
      }
      const ck = swDeclKeywordIndex(f, c);
      if (swHasModifier(f, ck, "@Environment")) {
        continue;
      }
      const p = swParsePropertyDeclaration(f, ck);
      const hasDefault = p !== null && p.valueStart >= 0;
      if (c.keyword === "let" && hasDefault) {
        continue;
      }
      if (acc > synth) {
        synth = acc;
      }
    }
    if (initAccess !== synth) {
      continue;
    }
    const ik = swDeclKeywordIndex(f, initDecl);
    const dcs = swDocCommentStart(f, ik);
    if (dcs >= 0 && swIsDocComment(f, dcs)) {
      continue;
    }
    const nx = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, ik);
    if (nx >= 0 && f.k(nx) === SW_OP && (f.s(nx) === "?" || f.s(nx) === "!")) {
      continue;
    }
    if (swDeclHasAttributes(f, initDecl)) {
      continue;
    }
    const fd = swParseFunctionDeclaration(f, ik);
    if (fd === null || fd.bodyStart < 0) {
      continue;
    }
    // The parameters.
    const paramNames: string[] = [];
    const paramBuilder: string[] = [];
    let ok = true;
    for (const a of fd.args) {
      if (a.internalLabel.length === 0) {
        ok = false;
        continue;
      }
      let builder = "";
      for (const at of a.attributes) {
        if (at.indexOf("Builder") >= 0) {
          builder = at;
          break;
        }
      }
      if (swArgHasDefaultValue(f, a.internalLabelIndex)) {
        ok = false;
      }
      if (a.externalLabel.length === 0 || a.externalLabel !== a.internalLabel) {
        ok = false;
      }
      paramNames.push(a.internalLabel);
      paramBuilder.push(builder);
    }
    if (!ok) {
      continue;
    }
    let anyBuilder = false;
    for (const b of paramBuilder) {
      if (b.length !== 0) {
        anyBuilder = true;
      }
    }
    if (anyBuilder) {
      // genericParameters: the struct's name is followed by `<`.
      const sk = swDeclKeywordIndex(f, sd);
      const ni = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, sk);
      const oa = ni >= 0 && f.k(ni) === SW_IDENT ? f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, ni) : -1;
      if (!(oa >= 0 && f.tok(oa, SW_START, "<"))) {
        continue;
      }
    }
    // The stored properties without default values.
    const wd: i32[] = [];
    for (let q = 0; q < toI32(propNames.length); q++) {
      let hasDefault = false;
      for (const c of sd.body) {
        if (!(c.keyword === "var" || c.keyword === "let")) {
          continue;
        }
        const p = swParsePropertyDeclaration(f, swDeclKeywordIndex(f, c));
        if (p !== null && p.identifier === propNames[q] && p.valueStart >= 0) {
          hasDefault = true;
          break;
        }
      }
      if (!hasDefault) {
        wd.push(q);
      }
    }
    if (paramNames.length !== wd.length) {
      continue;
    }
    for (let q = 0; q < toI32(wd.length); q++) {
      const pi = wd[q];
      const a = fd.args[q];
      if (paramNames[q] !== propNames[pi]) {
        ok = false;
        break;
      }
      const propType = swStringExcludingLinebreaksAndComments(f, propTypeStart[pi], propTypeEnd[pi] + 1);
      const paramType = swStringExcludingLinebreaksAndComments(f, a.typeStart, a.typeEnd + 1);
      if (paramBuilder[q].length !== 0 && paramType === `() -> ${propType}`) {
        continue;
      }
      if (swSameTokenRun(f, a.typeStart, a.typeEnd, propTypeStart[pi], propTypeEnd[pi])) {
        continue;
      }
      if (swRemoveAll(paramType, "@escaping ") === propType) {
        continue;
      }
      ok = false;
      break;
    }
    if (!ok) {
      continue;
    }
    // The body: memberwise assignments only.
    const bodyStart = fd.bodyStart + 1;
    const bodyEnd = fd.bodyEnd;
    let isRedundant = true;
    let assignmentCount = 0;
    for (let t = bodyStart; t < bodyEnd; t++) {
      if (f.isComment(t)) {
        isRedundant = false;
        break;
      }
    }
    const needsBuilder: string[] = [];
    let bodyIndex = bodyStart;
    if (isRedundant) {
      while (true) {
        const nt = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, bodyIndex - 1);
        if (nt < 0 || nt >= bodyEnd) {
          break;
        }
        if (!f.tok(nt, SW_IDENT, "self")) {
          isRedundant = false;
          break;
        }
        const dot = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, nt);
        const pr = dot >= 0 && f.ks(dot, SW_OP, ".") ? f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, dot) : -1;
        const eq = pr >= 0 && f.k(pr) === SW_IDENT ? f.indexOfAfter(SW_OP, "=", SW_OP_INFIX, pr) : -1;
        const vi = eq >= 0 ? f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, eq) : -1;
        if (vi < 0 || f.k(vi) !== SW_IDENT || f.s(pr) !== f.s(vi)) {
          isRedundant = false;
          break;
        }
        const name = f.s(pr);
        let known = false;
        for (const q of wd) {
          if (propNames[q] === name) {
            known = true;
          }
        }
        if (!known) {
          isRedundant = false;
          break;
        }
        let nextAfterValue = vi + 1;
        const paren = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, vi);
        const ep = paren >= 0 && f.tok(paren, SW_START, "(") ? swEndOfScope(f, paren) : -1;
        const inner = ep >= 0 ? f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, paren) : -1;
        if (ep >= 0 && !(inner >= 0 && inner < ep)) {
          needsBuilder.push(name);
          nextAfterValue = ep + 1;
        } else {
          const pq = paramNames.indexOf(name);
          if (pq >= 0 && paramBuilder[pq].length !== 0) {
            needsBuilder.push(name);
          }
        }
        assignmentCount++;
        bodyIndex = nextAfterValue;
      }
    }
    if (!isRedundant || assignmentCount !== toI32(wd.length)) {
      continue;
    }
    for (const q of wd) {
      const name = propNames[q];
      const pq = paramNames.indexOf(name);
      if (needsBuilder.indexOf(name) < 0 || pq < 0 || paramBuilder[pq].length === 0) {
        continue;
      }
      const at = swDeclStartOfModifiers(f, propDecls[q], true);
      f.insert(SW_SPACE, " ", 0, at);
      f.insert(SW_KEYWORD, paramBuilder[pq], 0, at);
    }
    const startRemoval = swDeclLo(f, initDecl);
    const ik2 = swDeclKeywordIndex(f, initDecl);
    const fd2 = swParseFunctionDeclaration(f, ik2);
    const endRemoval = fd2 !== null && fd2.bodyStart >= 0 ? fd2.bodyEnd : fd.bodyEnd;
    let s = startRemoval;
    let e = endRemoval;
    while (s > 0 && f.k(s - 1) === SW_SPACE) {
      s--;
    }
    if (s > 0 && f.k(s - 1) === SW_LINEBREAK) {
      s--;
    }
    while (e + 1 < f.count()) {
      const k = f.k(e + 1);
      if (k === SW_SPACE) {
        e++;
      } else if (k === SW_LINEBREAK) {
        e++;
        break;
      } else {
        break;
      }
    }
    f.removeTokens(s, e + 1);
  }
  swReleaseDecls(f, all);
};
