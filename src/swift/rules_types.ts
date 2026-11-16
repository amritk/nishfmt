// SwiftFormat's typeSugar, void, numberFormatting and andOperator rules.
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { swDeclHi, swDeclIsStoredInstanceProperty, swDeclKeywordIndex, swDeclLo, swParseEnclosingType, swReleaseDecls } from "./decl";
import { swParsePropertyDeclaration } from "./expr";
import { SwDecl, SwFormatter } from "./formatter";
import { swCurrentScope, swEndOfScope, swLastSignificantKeyword } from "./parsing";
import { swIsInResultBuilder } from "./rules_simple";
import {
  SW_DELIM,
  SW_END,
  SW_IDENT,
  SW_KEYWORD,
  SW_LINEBREAK,
  SW_NUMBER,
  SW_NUM_BINARY,
  SW_NUM_DECIMAL,
  SW_NUM_HEX,
  SW_NUM_INTEGER,
  SW_NUM_OCTAL,
  SW_OP,
  SW_OP_INFIX,
  SW_OP_POSTFIX,
  SW_OP_PREFIX,
  SW_SPACE,
  SW_START,
  SW_T_END_OF_SCOPE,
  SW_T_KEYWORD,
  SW_T_NON_SPACE,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
  SW_T_NON_SPACE_OR_LINEBREAK,
  SW_T_START_OF_SCOPE,
  SwTok,
} from "./token";
import { swTokenize } from "./tokenizer";

/** Declaration collection's declaration(containing:): the innermost one. */
const swDeclContaining = (f: SwFormatter, ds: SwDecl[], index: i32, best: SwDecl | null): SwDecl | null => {
  let cur = best;
  for (const d of ds) {
    const lo = swDeclLo(f, d);
    const hi = swDeclHi(f, d);
    if (index >= lo && index <= hi) {
      let ok = true;
      if (cur !== null) {
        const olo = swDeclLo(f, cur);
        const ohi = swDeclHi(f, cur);
        ok = olo <= lo && ohi >= hi;
      }
      if (ok) {
        cur = d;
      }
    }
    cur = swDeclContaining(f, d.body, index, cur);
  }
  return cur;
};

/** typeSugar (shortOptionals preserveStructInits). */
export const swRuleTypeSugar = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.tok(i, SW_START, "<")) {
      continue;
    }
    const typeIndex = f.indexBefore(SW_T_NON_SPACE_OR_LINEBREAK, i);
    if (typeIndex < 0 || f.k(typeIndex) !== SW_IDENT) {
      continue;
    }
    const identifier = f.s(typeIndex);
    const endIndex = f.indexOfAfter(SW_END, ">", 0, i);
    if (endIndex < 0) {
      continue;
    }
    const typeStart = f.indexInType(SW_T_NON_SPACE_OR_LINEBREAK, i + 1, endIndex);
    const typeEnd = f.lastIndexInType(SW_T_NON_SPACE_OR_LINEBREAK, i + 1, endIndex);
    if (typeStart < 0 || typeEnd < 0) {
      continue;
    }
    const dot = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, endIndex);
    if (dot >= 0 && f.ks(dot, SW_OP, ".")) {
      const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, dot);
      if (n >= 0 && !(f.tok(n, SW_IDENT, "self") || f.tok(n, SW_IDENT, "Type")) && identifier !== "Optional") {
        continue;
      }
    }
    const pt = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, typeIndex);
    const cs = swCurrentScope(f, i);
    if (!(pt >= 0 && f.tok(pt, SW_DELIM, ":")) || (cs >= 0 && f.tok(cs, SW_START, "["))) {
      let startIndex = i;
      if (identifier === "Dictionary") {
        const c = f.indexOfIn(SW_DELIM, ",", 0, i + 1, endIndex);
        if (c >= 0) {
          startIndex = c;
        }
      }
      const pi = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, startIndex);
      if (pi >= 0 && f.tok(pi, SW_START, "(")) {
        const ui = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, pi);
        if (ui >= 0 && f.tok(ui, SW_IDENT, "_")) {
          const ni = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, ui);
          if (ni >= 0 && f.k(ni) === SW_IDENT) {
            continue;
          }
        }
      }
    }
    if (pt >= 0 && f.k(pt) === SW_KEYWORD) {
      const s = f.s(pt);
      if (s === "struct" || s === "class" || s === "actor" || s === "enum" || s === "protocol" || s === "typealias") {
        continue;
      }
    }
    if (identifier === "Array") {
      const toks: SwTok[] = [new SwTok(SW_START, "[", 0)];
      for (const t of f.slice(typeStart, typeEnd + 1)) {
        toks.push(t);
      }
      toks.push(new SwTok(SW_END, "]", 0));
      f.replaceTokens(typeIndex, endIndex + 1, toks);
    } else if (identifier === "Dictionary") {
      const commaIndex = f.indexOfIn(SW_DELIM, ",", 0, typeStart, typeEnd);
      if (commaIndex < 0) {
        continue;
      }
      f.replaceToken(commaIndex, SW_DELIM, ":", 0);
      const toks: SwTok[] = [new SwTok(SW_START, "[", 0)];
      for (const t of f.slice(typeStart, typeEnd + 1)) {
        toks.push(t);
      }
      toks.push(new SwTok(SW_END, "]", 0));
      f.replaceTokens(typeIndex, endIndex + 1, toks);
    } else if (identifier === "Optional") {
      const parentType = swParseEnclosingType(f, i);
      if (parentType !== null) {
        const property = swDeclContaining(f, parentType.body, i, null);
        let skip = false;
        if (property !== null && property.keyword === "var") {
          let hasInit = false;
          for (const d of parentType.body) {
            if (d.keyword === "init") {
              hasInit = true;
            }
          }
          const inStruct = parentType.keyword === "struct" && !hasInit;
          const stored = swDeclIsStoredInstanceProperty(f, property);
          const p = swParsePropertyDeclaration(f, swDeclKeywordIndex(f, property));
          const noDefault = p === null || p.valueEnd < 0;
          skip = inStruct && stored && noDefault;
        }
        swReleaseDecls(f, [parentType]);
        if (skip) {
          continue;
        }
      }
      const le = f.indexBefore(SW_T_END_OF_SCOPE, i);
      if (swLastSignificantKeyword(f, i) === "case" || (le >= 0 && f.tok(le, SW_END, "case"))) {
        continue;
      }
      const typeTokens = f.slice(typeStart, typeEnd + 1);
      let wrap = false;
      for (const t of typeTokens) {
        if (t.k === SW_OP && t.a === SW_OP_INFIX && (t.s === "&" || t.s === "->")) {
          wrap = true;
        }
        if (t.k === SW_IDENT && t.a === 0 && (t.s === "some" || t.s === "any")) {
          wrap = true;
        }
      }
      const toks: SwTok[] = [];
      if (wrap) {
        toks.push(new SwTok(SW_START, "(", 0));
      }
      for (const t of typeTokens) {
        toks.push(t);
      }
      if (wrap) {
        toks.push(new SwTok(SW_END, ")", 0));
      }
      toks.push(new SwTok(SW_OP, "?", SW_OP_POSTFIX));
      f.replaceTokens(typeIndex, endIndex + 1, toks);
    } else {
      continue;
    }
    const d2 = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, typeIndex);
    if (d2 >= 0 && f.ks(d2, SW_OP, ".")) {
      const sw = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, d2);
      if (sw >= 0 && f.tok(sw, SW_IDENT, "Swift")) {
        f.removeTokens(sw, typeIndex);
      }
    }
  }
};

/** isArgumentToken(at:). */
const swIsArgumentToken = (f: SwFormatter, index: i32): boolean => {
  const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
  if (n < 0) {
    return false;
  }
  if (f.op(n, "->", SW_OP_INFIX) || f.kw(n, "throws") || f.kw(n, "rethrows") || f.tok(n, SW_IDENT, "async")) {
    return true;
  }
  if (f.tok(n, SW_START, "{")) {
    if (f.tok(index, SW_END, ")")) {
      const o = f.indexOfBefore(SW_START, "(", 0, index);
      if (o >= 0) {
        const ni = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, o);
        if (ni >= 0 && f.k(ni) === SW_IDENT && f.lastIs(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, ni, SW_KEYWORD, "func")) {
          return true;
        }
      }
    }
    return false;
  }
  if (f.kw(n, "in")) {
    if (f.tok(index, SW_END, ")")) {
      const o = f.indexOfBefore(SW_START, "(", 0, index);
      if (o >= 0) {
        return f.lastIs(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, o, SW_START, "{");
      }
    }
    return false;
  }
  return false;
};

/** hasLocalVoid(). */
const swHasLocalVoid = (f: SwFormatter): boolean => {
  for (let i = 0; i < f.count(); i++) {
    if (!f.tok(i, SW_IDENT, "Void")) {
      continue;
    }
    const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (p >= 0 && (f.kw(p, "typealias") || f.kw(p, "struct") || f.kw(p, "class") || f.kw(p, "enum"))) {
      return true;
    }
  }
  return false;
};

/** void (useVoid). */
export const swRuleVoid = (f: SwFormatter): void => {
  const hasLocalVoid = swHasLocalVoid(f);
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.tok(i, SW_IDENT, "Void")) {
      continue;
    }
    const nextIndex = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, i);
    let prevIndex = f.indexBefore(SW_T_NON_SPACE_OR_LINEBREAK, i);
    let inParens = false;
    if (nextIndex >= 0 && f.tok(nextIndex, SW_END, ")") && prevIndex >= 0) {
      if (f.tok(prevIndex, SW_DELIM, ":")) {
        const pp = f.indexBefore(SW_T_NON_SPACE_OR_LINEBREAK, prevIndex);
        if (pp >= 0 && f.tok(pp, SW_IDENT, "_")) {
          const si = f.indexBefore(SW_T_NON_SPACE_OR_LINEBREAK, pp);
          if (si >= 0 && f.tok(si, SW_START, "(")) {
            prevIndex = si;
            inParens = true;
          }
        }
      }
      if (!inParens) {
        inParens = f.tok(prevIndex, SW_START, "(");
      }
    }
    if (inParens) {
      const lb = f.indexBefore(SW_T_NON_SPACE_OR_LINEBREAK, prevIndex);
      if (swIsArgumentToken(f, nextIndex) || (lb >= 0 && f.k(lb) === SW_IDENT)) {
        // useVoid: keep
      } else {
        f.removeTokens(i + 1, nextIndex + 1);
        f.removeTokens(prevIndex, i);
      }
      continue;
    }
    const pt = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (pt >= 0 && (f.op(pt, ".", SW_OP_PREFIX) || f.op(pt, ".", SW_OP_INFIX) || f.kw(pt, "typealias"))) {
      continue;
    }
    const nt = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (nt >= 0 && f.op(nt, ".", SW_OP_INFIX)) {
      continue;
    }
    const ns = f.indexAfter(SW_T_NON_SPACE, i);
    if (ns >= 0 && f.tok(ns, SW_START, "(")) {
      if (!hasLocalVoid) {
        f.removeToken(i);
      }
      continue;
    }
    if (swIsArgumentToken(f, i) && !hasLocalVoid) {
      f.replaceTokenWith(i, [new SwTok(SW_START, "(", 0), new SwTok(SW_END, ")", 0)]);
    }
  }
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.tok(i, SW_START, "(")) {
      continue;
    }
    const endIndex = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, i);
    if (endIndex < 0 || !f.tok(endIndex, SW_END, ")")) {
      continue;
    }
    const pt = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (pt < 0 || swIsArgumentToken(f, endIndex)) {
      continue;
    }
    if (f.op(pt, "->", SW_OP_INFIX)) {
      if (!hasLocalVoid) {
        f.replaceTokensWith1(i, endIndex + 1, SW_IDENT, "Void", 0);
      }
    } else if ((f.tok(pt, SW_START, "<") || (f.tok(pt, SW_DELIM, ",") && swCurrentScopeIs(f, i, "<"))) && !hasLocalVoid) {
      f.replaceTokensWith1(i, endIndex + 1, SW_IDENT, "Void", 0);
    } else if (f.op(pt, "=", SW_OP_INFIX)) {
      const eq = pt;
      const ppt = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, eq);
      if (ppt >= 0 && f.k(ppt) === SW_IDENT && swLastSignificantKeyword(f, i) === "typealias" && !hasLocalVoid) {
        f.replaceTokensWith1(i, endIndex + 1, SW_IDENT, "Void", 0);
      }
    }
  }
};

const swCurrentScopeIs = (f: SwFormatter, i: i32, s: string): boolean => {
  const c = swCurrentScope(f, i);
  return c >= 0 && f.tok(c, SW_START, s);
};

/** applyGrouping(.group(group, threshold), to:). */
const swApplyGrouping = (number: string, group: i32, threshold: i32): string => {
  const parts: string[] = [];
  for (let i = 0; i < toI32(number.length); i++) {
    if (number.charCodeAt(i) !== 95) {
      parts.push(number.substring(i, i + 1));
    }
  }
  const n = toI32(parts.length);
  if (!(group > 0 && n >= threshold)) {
    return parts.join("");
  }
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const fromEnd = n - i;
    if (i > 0 && fromEnd % group === 0) {
      out.push("_");
    }
    out.push(parts[i]);
  }
  return out.join("");
};

/** Splits `s` at any of the bytes in `seps`. */
const swSplitAny = (s: string, seps: string): string[] => {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < toI32(s.length); i++) {
    if (seps.indexOf(s.substring(i, i + 1)) >= 0) {
      out.push(s.substring(start, i));
      start = i + 1;
    }
  }
  out.push(s.substring(start));
  return out;
};

/** ASCII uppercased(). */
const swUppercased = (s: string): string => {
  const n = toI32(s.length);
  const b = new Array<u8>(n);
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    b[i] = toU8(c >= 97 && c <= 122 ? c - 32 : c);
  }
  return String.fromBytes(b, 0, n);
};

/** availabilityArgumentRanges(), as [lo, hi] pairs. */
const swAvailabilityRanges = (f: SwFormatter): i32[] => {
  const out: i32[] = [];
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.tok(i, SW_START, "(")) {
      continue;
    }
    const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (p < 0) {
      continue;
    }
    const s = f.s(p);
    if (
      f.k(p) === SW_KEYWORD &&
      (s === "@available" ||
        s === "@backDeployed" ||
        s === "@_backDeploy" ||
        s === "@_originallyDefinedIn" ||
        s === "@_spi_available" ||
        s === "@_specialize" ||
        s === "#available" ||
        s === "#unavailable")
    ) {
      const e = swEndOfScope(f, i);
      if (e >= 0) {
        out.push(i);
        out.push(e);
      }
    }
  }
  return out;
};

/** numberFormatting (default groupings, uppercase hex, lowercase exponent). */
export const swRuleNumberFormatting = (f: SwFormatter): void => {
  const ranges = swAvailabilityRanges(f);
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (f.k(i) !== SW_NUMBER) {
      continue;
    }
    const number = f.s(i);
    const type = f.a(i);
    let group = 3;
    let threshold = 6;
    let prefix = "";
    let expSep = "";
    let parts: string[] = [];
    if (type === SW_NUM_INTEGER || type === SW_NUM_DECIMAL) {
      expSep = "e";
      parts = swSplitAny(number, ".eE");
    } else if (type === SW_NUM_BINARY) {
      group = 4;
      threshold = 8;
      prefix = "0b";
      parts = [number.substring(2)];
    } else if (type === SW_NUM_OCTAL) {
      group = 4;
      threshold = 8;
      prefix = "0o";
      parts = [number.substring(2)];
    } else {
      group = 4;
      threshold = 8;
      prefix = "0x";
      expSep = "p";
      const raw = swSplitAny(number.substring(2), ".pP");
      for (const p of raw) {
        parts.push(swUppercased(p));
      }
    }
    let main = parts[0];
    let fraction = "";
    let exponent = "";
    const pc = toI32(parts.length);
    if (pc === 2 && number.indexOf(".") >= 0) {
      fraction = parts[1];
    } else if (pc === 2) {
      exponent = parts[1];
    } else if (pc === 3) {
      fraction = parts[1];
      exponent = parts[2];
    }
    main = swApplyGrouping(main, group, threshold);
    let result = prefix + main;
    if (fraction.length !== 0) {
      result = result + "." + fraction;
    }
    if (exponent.length !== 0) {
      result = result + expSep + exponent;
    }
    if (result === number) {
      continue;
    }
    let inAvail = false;
    for (let q = 0; q + 1 < toI32(ranges.length); q += 2) {
      if (i >= ranges[q] && i <= ranges[q + 1]) {
        inAvail = true;
        break;
      }
    }
    if (inAvail) {
      continue;
    }
    f.replaceToken(i, SW_NUMBER, result, type);
  }
};

/** hasLowerPrecedenceThanAnd(at:). */
const swHasLowerPrecedenceThanAnd = (f: SwFormatter, i: i32): boolean => f.op(i, "||", SW_OP_INFIX) || f.op(i, "?", SW_OP_INFIX) || f.op(i, "=", SW_OP_INFIX);

/** conditionHasLowerPrecedenceThanAnd(in: lo ..< hi). */
const swConditionHasLowerPrecedenceThanAnd = (f: SwFormatter, lo: i32, hi: i32): boolean => {
  let index = lo;
  while (index < hi) {
    if (swHasLowerPrecedenceThanAnd(f, index)) {
      return true;
    }
    if (f.k(index) === SW_START) {
      const e = swEndOfScope(f, index);
      if (e < 0) {
        return true;
      }
      index = e;
    }
    index++;
  }
  return false;
};

/** andOperator (swiftVersion < 5.3 holds for an undefined version). */
export const swRuleAndOperator = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!(f.kw(i, "if") || f.kw(i, "guard") || f.kw(i, "while"))) {
      continue;
    }
    if (f.kw(i, "while") && f.lastIs(SW_T_KEYWORD, i, SW_KEYWORD, "repeat")) {
      continue;
    }
    let endIndex = f.indexOfAfter(SW_START, "{", 0, i);
    if (endIndex < 0) {
      continue;
    }
    if (swIsInResultBuilder(f, i)) {
      continue;
    }
    let index = i + 1;
    let chevronIndex = -1;
    let abort = false;
    while (index < endIndex) {
      if (f.op(index, "&&", SW_OP_INFIX)) {
        let endOfGroup = f.indexOfAfter(SW_DELIM, ",", 0, index);
        if (endOfGroup < 0) {
          endOfGroup = endIndex;
        }
        if (swConditionHasLowerPrecedenceThanAnd(f, index + 1, endOfGroup)) {
          index = endOfGroup;
          continue;
        }
        if (chevronIndex >= 0 && f.indexOfIn(SW_OP, ">", SW_OP_INFIX, index, endIndex) >= 0) {
          // Check if this would cause ambiguity for chevrons
          const parts: string[] = [];
          for (let j = i; j <= endIndex; j++) {
            parts.push(j === index ? "," : f.s(j));
          }
          parts.push("}");
          const text = parts.join("");
          const n = toI32(text.length);
          const b = new Array<u8>(n);
          for (let j = 0; j < n; j++) {
            b[j] = toU8(text.charCodeAt(j));
          }
          const re = swTokenize(b, n);
          const ci = chevronIndex - i;
          if (ci < re.count() && re.k[ci] === SW_START && re.s[ci] === "<") {
            abort = true;
            break;
          }
        }
        f.replaceToken(index, SW_DELIM, ",", 0);
        if (f.tok(index - 1, SW_SPACE, " ")) {
          f.removeToken(index - 1);
          endIndex -= 1;
          index -= 1;
        } else {
          const prevIndex = f.indexBefore(SW_T_NON_SPACE, index);
          if (prevIndex >= 0 && f.k(prevIndex) === SW_LINEBREAK) {
            const nl = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, prevIndex);
            if (nl >= 0) {
              f.removeToken(index);
              f.insert(SW_DELIM, ",", 0, nl + 1);
              if (f.tok(index + 1, SW_SPACE, " ")) {
                f.removeToken(index + 1);
                endIndex -= 1;
              }
            }
          }
        }
      } else if (f.op(index, "<", SW_OP_INFIX)) {
        chevronIndex = index;
      } else if (swHasLowerPrecedenceThanAnd(f, index) || f.kw(index, "try")) {
        const c = f.indexOfAfter(SW_DELIM, ",", 0, index);
        index = c >= 0 ? c : endIndex;
      } else if (f.k(index) === SW_START) {
        const e = swEndOfScope(f, index);
        index = e >= 0 ? e : endIndex;
      }
      index++;
    }
    if (abort) {
      continue;
    }
  }
};

