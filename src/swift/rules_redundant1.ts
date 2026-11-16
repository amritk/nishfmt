// SwiftFormat's assertionFailures, initCoderUnavailable,
// redundantRawValues, redundantObjc, redundantBackticks, redundantPattern,
// redundantVoidReturnType and redundantExtensionACL rules.
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { SwFormatter, swIndexAfterWhere, swIndexBeforeWhere } from "./formatter";
import { swParseFunctionDeclaration, swUnescaped } from "./funcdecl";
import { swHasImport } from "./imports";
import { swHasModifier, swIsAclModifierStr, swIsModifier, swModifiersForDeclaration, swStartOfModifiers } from "./modifiers";
import {
  swCurrentScope,
  swEndOfScope,
  swIndexOfLastSignificantKeyword,
  swIsAccessorKeyword,
  swIsAttribute,
  swIsPropertyAccessorKeyword,
  swParseType,
  swPrevIs,
  SW_EX_WHERE,
} from "./parsing";
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
  SW_T_END_OF_SCOPE,
  SW_T_KEYWORD,
  SW_T_NON_SPACE,
  SW_T_NON_SPACE_OR_COMMENT,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
  SW_T_NON_SPACE_OR_LINEBREAK,
  SW_T_OPERATOR,
  SwTok,
  swIsSwiftKeyword,
} from "./token";
import { swParseIdentifierString, swTokenize } from "./tokenizer";

/** assertionFailures. */
export const swRuleAssertionFailures = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    const isAssert = f.tok(i, SW_IDENT, "assert");
    if (!isAssert && !f.tok(i, SW_IDENT, "precondition")) {
      continue;
    }
    const ss = f.indexAfter(SW_T_NON_SPACE, i);
    if (ss < 0 || !f.tok(ss, SW_START, "(")) {
      continue;
    }
    const ii = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, ss);
    if (ii < 0 || !f.tok(ii, SW_IDENT, "false")) {
      continue;
    }
    let endIndex = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, ii);
    if (endIndex < 0) {
      continue;
    }
    if (f.tok(endIndex, SW_DELIM, ",")) {
      const e = f.indexAfter(SW_T_NON_SPACE, endIndex);
      if (e >= 0) {
        endIndex = e;
      }
    }
    f.replaceTokens(i, endIndex, [new SwTok(SW_IDENT, isAssert ? "assertionFailure" : "preconditionFailure", 0), new SwTok(SW_START, "(", 0)]);
  }
};

/** initCoderUnavailable (initCoderNil off). */
export const swRuleInitCoderUnavailable = (f: SwFormatter): void => {
  const src = "@available(*, unavailable)";
  const n = toI32(src.length);
  const b = new Array<u8>(n);
  for (let j = 0; j < n; j++) {
    b[j] = toU8(src.charCodeAt(j));
  }
  const ut = swTokenize(b, n);
  const unavailable: SwTok[] = [];
  for (let j = 0; j < ut.count(); j++) {
    unavailable.push(new SwTok(ut.k[j], ut.s[j], ut.a[j]));
  }
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.tok(i, SW_IDENT, "required")) {
      continue;
    }
    let initIndex = f.indexOfAfter(SW_KEYWORD, "init", 0, i);
    if (initIndex < 0) {
      continue;
    }
    const q = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, initIndex);
    if (q >= 0 && f.op(q, "?", 3)) {
      initIndex = q;
    }
    const paren = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, initIndex);
    if (paren < 0 || !f.tok(paren, SW_START, "(")) {
      continue;
    }
    const coder = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, paren);
    if (coder < 0 || !f.tok(coder, SW_IDENT, "coder")) {
      continue;
    }
    const ep = f.indexOfAfter(SW_END, ")", 0, coder);
    if (ep < 0) {
      continue;
    }
    const brace = f.indexOfAfter(SW_START, "{", 0, ep);
    if (brace < 0) {
      continue;
    }
    const ft = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, brace);
    if (ft < 0 || !(f.tok(ft, SW_END, "}") || f.tok(ft, SW_IDENT, "fatalError"))) {
      continue;
    }
    if (swHasModifier(f, i, "@available")) {
      continue;
    }
    const startIndex = swStartOfModifiers(f, i, true);
    f.insert(SW_SPACE, f.currentIndentForLine(startIndex), 0, startIndex);
    f.insertLinebreak(startIndex);
    f.insertToks(unavailable, startIndex);
  }
};

/** redundantRawValues. */
export const swRuleRedundantRawValues = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.kw(i, "enum")) {
      continue;
    }
    const ni = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (ni < 0 || f.k(ni) !== SW_IDENT) {
      continue;
    }
    const ci = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, ni);
    if (ci < 0 || !f.tok(ci, SW_DELIM, ":")) {
      continue;
    }
    const ti = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, ci);
    if (ti < 0 || !f.tok(ti, SW_IDENT, "String")) {
      continue;
    }
    const bi = f.indexOfAfter(SW_START, "{", 0, ci);
    if (bi < 0) {
      continue;
    }
    let lastIndex = f.indexOfAfter(SW_KEYWORD, "case", 0, bi);
    while (lastIndex >= 0) {
      let index = lastIndex;
      const nameIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
      if (nameIndex < 0 || f.k(nameIndex) !== SW_IDENT) {
        break;
      }
      const eq = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, nameIndex);
      const qi = eq >= 0 && f.op(eq, "=", SW_OP_INFIX) ? f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, eq) : -1;
      if (qi >= 0 && f.tok(qi, SW_START, '"') && f.tok(qi + 2, SW_END, '"')) {
        if (f.has(qi + 1) && swUnescaped(f.s(nameIndex)) === f.s(qi + 1)) {
          f.removeTokens(nameIndex + 1, qi + 3);
          index = nameIndex;
        } else {
          index = qi + 2;
        }
      } else {
        index = nameIndex;
      }
      const c = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
      if (c >= 0 && f.tok(c, SW_DELIM, ",")) {
        lastIndex = c;
      } else {
        lastIndex = f.indexOfAfter(SW_KEYWORD, "case", 0, index);
      }
    }
  }
};

/** removeAttribute(at:). */
const swRemoveAttribute = (f: SwFormatter, i: i32): void => {
  f.removeToken(i);
  if (f.has(i) && f.k(i) === SW_SPACE) {
    f.removeToken(i);
  } else if (f.has(i - 1) && f.k(i - 1) === SW_SPACE) {
    f.removeToken(i - 1);
  }
};

const swIsObjcImplyingAttribute = (s: string): boolean =>
  s === "@IBOutlet" || s === "@IBAction" || s === "@IBSegueAction" || s === "@IBDesignable" || s === "@IBInspectable" || s === "@GKInspectable" || s === "@NSManaged";

/** redundantObjc. */
export const swRuleRedundantObjc = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.kw(i, "@objc")) {
      continue;
    }
    const n0 = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (n0 >= 0 && f.tok(n0, SW_START, "(")) {
      continue;
    }
    let index = i;
    let skip = false;
    while (true) {
      let nextIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
      if (nextIndex < 0) {
        break;
      }
      const s = f.s(nextIndex);
      if (f.k(nextIndex) === SW_KEYWORD && (s === "class" || s === "actor" || s === "enum" || s === "protocol" || s === "struct")) {
        skip = true;
        break;
      }
      if (f.kw(nextIndex, "private") || f.kw(nextIndex, "fileprivate")) {
        const m = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, nextIndex);
        if (!(m >= 0 && f.tok(m, SW_START, "("))) {
          skip = true;
          break;
        }
      } else if (swIsAttribute(f, nextIndex)) {
        const si = f.indexOfAfter(SW_START, "(", 0, nextIndex);
        if (si >= 0) {
          const ei = f.indexOfAfter(SW_END, ")", 0, si);
          if (ei >= 0) {
            nextIndex = ei;
          }
        }
      } else if (!swIsModifier(f, nextIndex)) {
        break;
      }
      index = nextIndex;
    }
    if (skip) {
      continue;
    }
    const pa = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    const na = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if ((pa >= 0 && swIsAttribute(f, pa) && swIsObjcImplyingAttribute(f.s(pa))) || (na >= 0 && swIsAttribute(f, na) && swIsObjcImplyingAttribute(f.s(na)))) {
      swRemoveAttribute(f, i);
      continue;
    }
    const scopeStart = f.indexOfBefore(SW_START, "{", 0, i);
    if (scopeStart < 0) {
      continue;
    }
    const ki = f.indexBefore(SW_T_KEYWORD, scopeStart);
    if (ki < 0) {
      continue;
    }
    if (f.kw(ki, "class") || f.kw(ki, "actor")) {
      if (swHasModifier(f, ki, "@objcMembers")) {
        swRemoveAttribute(f, i);
      }
    } else if (f.kw(ki, "extension")) {
      if (swHasModifier(f, ki, "@objc")) {
        swRemoveAttribute(f, i);
      }
    }
  }
};

/** isArgumentPosition(at:). */
const swIsArgumentPosition = (f: SwFormatter, i: i32): boolean => {
  const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
  if (n < 0) {
    return false;
  }
  let ok = f.tok(n, SW_DELIM, ":");
  if (!ok && f.k(n) === SW_IDENT) {
    const m = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, n);
    ok = m >= 0 && f.tok(m, SW_DELIM, ":");
  }
  if (ok) {
    const cs = swCurrentScope(f, i);
    return cs >= 0 && f.tok(cs, SW_START, "(");
  }
  return false;
};

/** backticksRequired(forName:at:ignoreLeadingDot:) (swiftVersion undefined, i.e. below 4 and 5). */
export const swBackticksRequired = (f: SwFormatter, unescaped: string, i: i32, ignoreLeadingDot: boolean = false): boolean => {
  const parsed = swParseIdentifierString(unescaped);
  if (!(parsed === unescaped)) {
    return true;
  }
  if (!swIsSwiftKeyword(unescaped)) {
    if (unescaped === "_" || unescaped === "$") {
      return true;
    }
    if (unescaped === "self" || unescaped === "super" || unescaped === "nil" || unescaped === "true" || unescaped === "false") {
      if (unescaped === "self") {
        const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
        if (p >= 0 && f.ks(p, SW_OP, ".")) {
          return true;
        }
      }
      // swiftVersion < "4" holds for an undefined version.
      return true;
    }
    if (unescaped === "Self" || unescaped === "Any") {
      const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
      if (p >= 0 && (f.tok(p, SW_DELIM, ":") || f.op(p, "->", SW_OP_INFIX))) {
        return false;
      }
    } else if (unescaped === "Type" || unescaped === "Protocol") {
      const cs = swCurrentScope(f, i);
      if (cs >= 0 && f.tok(cs, SW_START, "{")) {
        return true;
      }
      const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
      if (p >= 0 && f.ks(p, SW_OP, ".")) {
        return true;
      }
      return false;
    } else if (
      unescaped === "get" ||
      unescaped === "set" ||
      unescaped === "_read" ||
      unescaped === "_modify" ||
      unescaped === "willSet" ||
      unescaped === "didSet" ||
      unescaped === "init"
    ) {
      return swIsAccessorKeyword(f, i, false);
    } else if (unescaped === "actor") {
      const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
      if (p >= 0 && f.k(p) === SW_OP && f.a(p) === SW_OP_INFIX) {
        return false;
      }
    } else {
      return false;
    }
  }
  const pd = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
  if (pd >= 0 && f.ks(pd, SW_OP, ".")) {
    if (unescaped === "init") {
      return true;
    }
    // swiftVersion >= "5" is false; keypath `\.` keeps backticks.
    if (!(f.has(pd - 1) && f.ks(pd - 1, SW_OP, "\\"))) {
      return ignoreLeadingDot;
    }
    return true;
  }
  if (pd >= 0 && f.ks(pd, SW_OP, "::")) {
    return unescaped === "deinit" || unescaped === "init" || unescaped === "subscript";
  }
  if (unescaped === "let" || unescaped === "var") {
    return true;
  }
  return !swIsArgumentPosition(f, i);
};

/** redundantBackticks. */
export const swRuleRedundantBackticks = (f: SwFormatter): void => {
  const isTesting = swHasImport(f, "Testing");
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (f.k(i) !== SW_IDENT) {
      continue;
    }
    const s = f.s(i);
    if (!s.startsWith("`") || swBackticksRequired(f, swUnescaped(s), i)) {
      continue;
    }
    if (isTesting) {
      const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
      if (p >= 0 && f.kw(p, "func") && swHasModifier(f, p, "@Test")) {
        continue;
      }
    }
    f.replaceToken(i, SW_IDENT, swUnescaped(s), 0);
  }
};

/** redundantBindings(in:). */
const swRedundantBindings = (f: SwFormatter, lo: i32, hi: i32): boolean => {
  let isEmpty = true;
  for (let j = lo; j < hi; j++) {
    if (f.tok(j, SW_IDENT, "_")) {
      isEmpty = false;
    } else if (f.k(j) === SW_SPACE || f.k(j) === SW_LINEBREAK || f.tok(j, SW_DELIM, ",") || f.kw(j, "let") || f.kw(j, "var")) {
      // fine
    } else {
      return false;
    }
  }
  return !isEmpty;
};

/** redundantPattern. */
export const swRuleRedundantPattern = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.tok(i, SW_START, "(")) {
      continue;
    }
    const prevIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT, i);
    if (prevIndex >= 0 && (f.kw(prevIndex, "case") || f.tok(prevIndex, SW_END, "case"))) {
      continue;
    }
    const endIndex = f.indexOfAfter(SW_END, ")", 0, i);
    if (endIndex < 0) {
      continue;
    }
    const nt = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, endIndex);
    if (nt < 0 || !(f.tok(nt, SW_START, ":") || f.op(nt, "=", SW_OP_INFIX)) || !swRedundantBindings(f, i + 1, endIndex)) {
      continue;
    }
    f.removeTokens(i, endIndex + 1);
    if (prevIndex >= 0 && f.k(prevIndex) === SW_IDENT) {
      const l = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT, prevIndex);
      if (l >= 0 && f.s(l) === ".") {
        const eos = swIndexBeforeWhere(f, prevIndex, (g, j) => g.tok(j, SW_END, "case") || g.kw(j, "case"));
        if (eos >= 0) {
          const vl = swIndexAfterWhere(f, eos, (g, j) => g.kw(j, "let") || g.kw(j, "var"));
          const oi = f.indexBefore(SW_T_OPERATOR, prevIndex);
          if (vl >= 0 && oi >= 0 && vl < oi) {
            f.removeTokens(vl, oi);
          }
        }
        continue;
      }
    }
    f.insert(SW_IDENT, "_", 0, i);
    if (!(f.has(i - 1) && (f.k(i - 1) === SW_SPACE || f.k(i - 1) === SW_LINEBREAK))) {
      f.insert(SW_SPACE, " ", 0, i);
    }
  }
};

/** endOfVoidType(at:), or -1. */
const swEndOfVoidType = (f: SwFormatter, index: i32): i32 => {
  if (f.tok(index, SW_IDENT, "Void")) {
    return index;
  }
  if (f.tok(index, SW_IDENT, "Swift")) {
    const d = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, index);
    if (d < 0 || !f.op(d, ".", SW_OP_INFIX)) {
      return -1;
    }
    const v = f.indexAfter(SW_T_NON_SPACE, d);
    if (v < 0 || !f.tok(v, SW_IDENT, "Void")) {
      return -1;
    }
    return v;
  }
  if (f.tok(index, SW_START, "(")) {
    const n = f.indexAfter(SW_T_NON_SPACE, index);
    if (n < 0) {
      return -1;
    }
    if (f.tok(n, SW_END, ")")) {
      return n;
    }
    if (f.tok(n, SW_IDENT, "Void")) {
      const m = f.indexAfter(SW_T_NON_SPACE, n);
      if (m >= 0 && f.tok(m, SW_END, ")")) {
        return m;
      }
    }
  }
  return -1;
};

/** isStartOfClosureType(at:). */
export const swIsStartOfClosureType = (f: SwFormatter, i: i32): boolean => {
  const te = swParseType(f, i);
  if (te < 0 || f.indexOfIn(SW_OP, "->", SW_OP_INFIX, i, te + 1) < 0) {
    return false;
  }
  const pk = swIndexOfLastSignificantKeyword(f, i, SW_EX_WHERE);
  if (pk >= 0 && f.kw(pk, "func")) {
    const d = swParseFunctionDeclaration(f, pk);
    if (d !== null && d.argsStart === i) {
      return false;
    }
  }
  return true;
};

/** redundantVoidReturnType (closureVoidReturn remove). */
export const swRuleRedundantVoidReturnType = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.op(i, "->", SW_OP_INFIX)) {
      continue;
    }
    const startIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (startIndex < 0) {
      continue;
    }
    const endIndex = swEndOfVoidType(f, startIndex);
    if (endIndex < 0) {
      continue;
    }
    const nt = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, endIndex);
    if (nt >= 0 && f.kw(nt, "in")) {
      const e = f.indexAfter(SW_T_NON_SPACE, endIndex);
      f.removeTokens(i, e);
      continue;
    }
    if (nt < 0) {
      continue;
    }
    if (swIsStartOfClosureType(f, startIndex)) {
      continue;
    }
    const isInProtocol = f.tok(nt, SW_END, "}") || (f.k(nt) === SW_KEYWORD && !f.kw(nt, "in"));
    if (!(f.tok(nt, SW_START, "{") || isInProtocol)) {
      continue;
    }
    const prevIndex = f.indexOfBefore(SW_END, ")", 0, i);
    if (prevIndex < 0) {
      continue;
    }
    const paren = f.indexOfBefore(SW_START, "(", 0, prevIndex);
    if (paren < 0) {
      continue;
    }
    const st = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, paren);
    if (st < 0 || !(f.k(st) === SW_IDENT || f.tok(st, SW_START, "{") || f.tok(st, SW_END, "]"))) {
      continue;
    }
    let sr = i;
    if (isInProtocol && f.has(i - 1) && f.k(i - 1) === SW_SPACE) {
      sr = i - 1;
    }
    f.removeTokens(sr, f.indexAfter(SW_T_NON_SPACE, endIndex));
  }
};

/** redundantExtensionACL. */
export const swRuleRedundantExtensionACL = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.kw(i, "extension")) {
      continue;
    }
    let acl = "";
    const mods = swModifiersForDeclaration(f, i);
    for (const m of mods.names) {
      acl = m;
      if (swIsAclModifierStr(m)) {
        break;
      }
    }
    if (!swIsAclModifierStr(acl)) {
      continue;
    }
    const startIndex = f.indexOfAfter(SW_START, "{", 0, i);
    if (startIndex < 0) {
      continue;
    }
    let endIndex = f.indexOfAfter(SW_END, "}", 0, startIndex);
    if (endIndex < 0) {
      continue;
    }
    if (acl === "private") {
      acl = "fileprivate";
    }
    while (true) {
      const ai = f.lastIndexOfIn(SW_KEYWORD, acl, 0, startIndex + 1, endIndex);
      if (ai < 0) {
        break;
      }
      f.removeToken(ai);
      if (f.has(ai) && f.k(ai) === SW_SPACE) {
        f.removeToken(ai);
      }
      endIndex = ai;
    }
  }
};

