// SwiftFormat's redundantType rule (propertyTypes inferLocalsOnly, swiftVersion
// undefined) and endOfExpression(at:upTo:).
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { SwFormatter, swIndexBeforeWhere } from "./formatter";
import { swHasModifier } from "./modifiers";
import {
  SwBranches,
  swConditionalBranches,
  swEndOfScope,
  swIsConditionalStatement,
  swIsMacroTok,
  swIsStartOfClosure,
  swIsSubscriptOrFunctionCall,
  swIsUnwrap,
  swLastSignificantKeyword,
} from "./parsing";
import { swDeclarationIndexAndScope, SW_SCOPE_LOCAL } from "./rules_doc";
import {
  SW_DELIM,
  SW_END,
  SW_IDENT,
  SW_KEYWORD,
  SW_NUMBER,
  SW_NUM_DECIMAL,
  SW_OP,
  SW_OP_INFIX,
  SW_OP_POSTFIX,
  SW_OP_PREFIX,
  SW_SPACE,
  SW_START,
  SW_T_NON_SPACE_OR_COMMENT,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
  SW_T_NON_SPACE_OR_LINEBREAK,
  SwTok,
  swIsStringDelimiter,
  swStrIsMacro,
} from "./token";

/** endOfExpression(at:upTo:), the delimiters being none, `?` (infix) when `upToTernary`,
 *  and also infix `&&`, `||` and `:` when `upToLogical`. */
export const swEndOfExpression = (
  f: SwFormatter,
  index0: i32,
  upToTernary: boolean,
  upToLogical: boolean = false,
): i32 => {
  let index = index0;
  if (f.k(index) === SW_END) {
    index = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, index);
  }
  let lastIndex = index;
  let wasOperator = true;
  while (index >= 0) {
    let i = index;
    const k = f.k(i);
    const s = f.s(i);
    const a = f.a(i);
    if (upToTernary && f.op(i, "?", SW_OP_INFIX)) {
      return lastIndex;
    }
    if (upToLogical && k === SW_OP && a === SW_OP_INFIX && (s === "&&" || s === "||" || s === ":")) {
      return lastIndex;
    }
    if (k === SW_OP && a === SW_OP_INFIX) {
      wasOperator = true;
    } else if ((k === SW_OP && a === SW_OP_PREFIX && wasOperator) || (k === SW_OP && a === SW_OP_POSTFIX)) {
      // break
    } else if (k === SW_KEYWORD && s === "as") {
      wasOperator = true;
      if (swIsUnwrap(f, i + 1)) {
        i++;
      }
    } else if ((k === SW_KEYWORD && swStrIsMacro(s)) || k === SW_NUMBER || k === SW_IDENT) {
      if (!wasOperator) {
        return lastIndex;
      }
      wasOperator = false;
    } else if (
      k === SW_START &&
      (s === "<" ||
        wasOperator ||
        (s === "{" && swIsStartOfClosure(f, i)) ||
        (s === "(" &&
          (swIsSubscriptOrFunctionCall(f, i) || swIsMacroTok(f, f.indexBefore(SW_T_NON_SPACE_OR_COMMENT, i)))) ||
        (s === "[" && swIsSubscriptOrFunctionCall(f, i)))
    ) {
      wasOperator = false;
      const e = swEndOfScope(f, i);
      if (e < 0) {
        return -1;
      }
      i = e;
    } else {
      return lastIndex;
    }
    lastIndex = i;
    index = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
  }
  return lastIndex;
};

/** typeToken(forValueToken:) == tokens[typeIndex]. */
const swTypeTokenMatches = (f: SwFormatter, typeIndex: i32, valueIndex: i32): boolean => {
  const vk = f.k(valueIndex);
  const vs = f.s(valueIndex);
  let k = vk;
  let s = vs;
  let a = f.a(valueIndex);
  if (vk === SW_NUMBER) {
    k = SW_IDENT;
    s = a === SW_NUM_DECIMAL ? "Double" : "Int";
    a = 0;
  } else if (vk === SW_IDENT) {
    if (vs === "true" || vs === "false") {
      s = "Bool";
    }
  } else if (swIsStringDelimiter(vk, vs)) {
    k = SW_IDENT;
    s = "String";
    a = 0;
  }
  return f.k(typeIndex) === k && f.s(typeIndex) === s && f.a(typeIndex) === a;
};

/** The result of compare(typeStartingAfter:withTypeStartingAfter:typeEndIndex:). */
class SwCompare {
  matches: boolean = false;
  i: i32 = 0;
  j: i32 = 0;
  wasValue: boolean = false;
}

const swCompareTypes = (f: SwFormatter, j0: i32, i0: i32, typeEndIndex: i32): SwCompare => {
  const r = new SwCompare();
  let i = i0;
  let j = j0;
  let wasValue = false;
  while (true) {
    const typeIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (typeIndex < 0 || typeIndex > typeEndIndex) {
      break;
    }
    const valueIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, j);
    if (valueIndex < 0) {
      break;
    }
    if (!wasValue) {
      const vk = f.k(valueIndex);
      const vs = f.s(valueIndex);
      if (swIsStringDelimiter(vk, vs) || vk === SW_NUMBER || (vk === SW_IDENT && (vs === "true" || vs === "false"))) {
        wasValue = true;
      }
    }
    if (!swTypeTokenMatches(f, typeIndex, valueIndex)) {
      r.i = i;
      r.j = j;
      r.wasValue = wasValue;
      return r;
    }
    i = typeIndex;
    j = valueIndex;
    if (swIsStringDelimiter(f.k(j), f.s(j))) {
      const e = swEndOfScope(f, j);
      if (e >= 0) {
        j = e;
      }
    }
  }
  r.i = i;
  r.j = j;
  r.wasValue = wasValue;
  if (i !== typeEndIndex) {
    return r;
  }
  const eoe = swEndOfExpression(f, j, true);
  if (eoe >= 0 && f.op(f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, eoe), "?", SW_OP_INFIX)) {
    return r;
  }
  r.matches = true;
  return r;
};

const swStrIn = (s: string, list: string): boolean => {
  let st = 0;
  for (let q = 0; q <= toI32(list.length); q++) {
    if (q === toI32(list.length) || list.charCodeAt(q) === 32) {
      if (list.substring(st, q) === s) {
        return true;
      }
      st = q + 1;
    }
  }
  return false;
};

/** simplifiableLiteralRange(forTypeName:initOpenParen:): answers the literal's end (its start is the first argument), or -1. */
const swSimplifiableLiteralEnd = (f: SwFormatter, typeName: string, parenIndex: i32): i32 => {
  const closeParen = swEndOfScope(f, parenIndex);
  const argStart = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, parenIndex);
  if (closeParen < 0 || argStart < 0 || argStart >= closeParen) {
    return -1;
  }
  const k = f.k(argStart);
  const s = f.s(argStart);
  let argEnd = -1;
  const isStr = swIsStringDelimiter(k, s);
  if (k === SW_NUMBER || (k === SW_IDENT && (s === "true" || s === "false"))) {
    argEnd = argStart;
  } else if (isStr || f.tok(argStart, SW_START, "[")) {
    argEnd = swEndOfScope(f, argStart);
    if (argEnd < 0) {
      return -1;
    }
  } else {
    return -1;
  }
  if (f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, argEnd) !== closeParen) {
    return -1;
  }
  if (k === SW_NUMBER) {
    if (f.a(argStart) === SW_NUM_DECIMAL) {
      if (!swStrIn(typeName, "Double Float Float16 Float80")) {
        return -1;
      }
    } else if (
      !swStrIn(
        typeName,
        "Int Int8 Int16 Int32 Int64 Int128 UInt UInt8 UInt16 UInt32 UInt64 UInt128 Double Float Float16 Float80 StaticBigInt",
      )
    ) {
      return -1;
    }
  } else if (isStr) {
    if (!swStrIn(typeName, "String Substring StaticString")) {
      return -1;
    }
  } else if (k === SW_IDENT) {
    if (typeName !== "Bool") {
      return -1;
    }
  } else if (
    !swStrIn(typeName, "ArraySlice ContiguousArray Set SIMD2 SIMD3 SIMD4 SIMD8 SIMD16 SIMD32 SIMD64 SIMDMask")
  ) {
    return -1;
  }
  return argEnd;
};

class SwRTCtx {
  colonIndex: i32 = 0;
  typeEndIndex: i32 = 0;
  isInferred: boolean = false;
}

/** removeType(after:i:j:wasValue:). */
const swRemoveType = (
  f: SwFormatter,
  c: SwRTCtx,
  indexBeforeStartOfType: i32,
  i: i32,
  j: i32,
  wasValue: boolean,
): void => {
  if (c.isInferred) {
    f.removeTokens(c.colonIndex, c.typeEndIndex + 1);
    if (f.has(c.colonIndex - 1) && f.k(c.colonIndex - 1) === SW_SPACE) {
      f.removeToken(c.colonIndex - 1);
    }
    return;
  }
  if (wasValue) {
    return;
  }
  const valueStartIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, indexBeforeStartOfType);
  if (valueStartIndex < 0 || swIsConditionalStatement(f, i)) {
    return;
  }
  const endIndex = swEndOfExpression(f, j, false);
  if (endIndex < 0 || !(endIndex > j)) {
    return;
  }
  const nj = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, j);
  if (nj >= 0 && f.tok(nj, SW_START, "(")) {
    const parenIndex = nj;
    const closeParen = swEndOfScope(f, parenIndex);
    const typeStartIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, c.colonIndex);
    let lit = -1;
    let litStart = -1;
    if (closeParen >= 0 && closeParen >= endIndex && typeStartIndex >= 0 && f.k(typeStartIndex) === SW_IDENT) {
      lit = swSimplifiableLiteralEnd(f, f.s(typeStartIndex), parenIndex);
      litStart = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, parenIndex);
    }
    if (lit >= 0) {
      const toks = f.slice(litStart, lit + 1);
      f.replaceTokens(valueStartIndex, closeParen + 1, toks);
    } else if (f.indexOfIn(SW_OP, ".", SW_OP_INFIX, j, endIndex) < 0) {
      f.replaceTokens(valueStartIndex, j + 1, [new SwTok(SW_OP, ".", SW_OP_INFIX), new SwTok(SW_IDENT, "init", 0)]);
    }
  } else {
    const nextIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, j);
    if (
      nextIndex >= 0 &&
      f.op(nextIndex, ".", SW_OP_INFIX) &&
      f.indexOfIn(SW_OP, ".", SW_OP_INFIX, nextIndex + 1, endIndex) < 0
    ) {
      f.removeTokens(valueStartIndex, j + 1);
    }
  }
};

/** allRecursiveConditionalBranches(in:satisfy:) for the type comparison. */
const swAllBranchesMatch = (f: SwFormatter, c: SwRTCtx, br: SwBranches): boolean => {
  let all = true;
  for (let q = toI32(br.starts.length) - 1; q >= 0; q--) {
    const sb = br.starts[q];
    const ta = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, sb);
    const inner: SwBranches | null = ta >= 0 ? swConditionalBranches(f, ta) : null;
    if (inner !== null) {
      if (!swAllBranchesMatch(f, c, inner)) {
        all = false;
      }
    } else if (!swCompareTypes(f, sb, c.colonIndex, c.typeEndIndex).matches) {
      all = false;
    }
  }
  return all;
};

/** forEachRecursiveConditionalBranch(in:) removing the type from each branch. */
const swRemoveTypeInBranches = (f: SwFormatter, c: SwRTCtx, br: SwBranches): void => {
  for (let q = toI32(br.starts.length) - 1; q >= 0; q--) {
    const sb = br.starts[q];
    const ta = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, sb);
    const inner: SwBranches | null = ta >= 0 ? swConditionalBranches(f, ta) : null;
    if (inner !== null) {
      swRemoveTypeInBranches(f, c, inner);
    } else {
      const r = swCompareTypes(f, sb, c.colonIndex, c.typeEndIndex);
      swRemoveType(f, c, sb, r.i, r.j, r.wasValue);
    }
  }
};

/** inferredArrayLiteralElementType(at:) == tokens[argTypeIndex]. */
const swArrayLiteralElementTypeIs = (f: SwFormatter, index: i32, argTypeIndex: i32): boolean => {
  if (!f.tok(index, SW_START, "[")) {
    return false;
  }
  const endIndex = swEndOfScope(f, index);
  if (endIndex < 0) {
    return false;
  }
  let found = false;
  let ek = 0;
  let es = "";
  let ea = 0;
  let i = index;
  while (true) {
    const nextIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (nextIndex < 0 || nextIndex >= endIndex) {
      break;
    }
    const k = f.k(nextIndex);
    const s = f.s(nextIndex);
    if (f.tok(nextIndex, SW_DELIM, ",")) {
      i = nextIndex;
      continue;
    }
    let ik = k;
    let is = s;
    let ia = f.a(nextIndex);
    let changed = false;
    if (k === SW_NUMBER) {
      ik = SW_IDENT;
      is = ia === SW_NUM_DECIMAL ? "Double" : "Int";
      ia = 0;
      changed = true;
    } else if (k === SW_IDENT && (s === "true" || s === "false")) {
      is = "Bool";
      changed = true;
    } else if (swIsStringDelimiter(k, s)) {
      ik = SW_IDENT;
      is = "String";
      ia = 0;
      changed = true;
    }
    if (!changed) {
      return false;
    }
    if (found) {
      if (ek !== ik || es !== is || ea !== ia) {
        return false;
      }
    } else {
      found = true;
      ek = ik;
      es = is;
      ea = ia;
    }
    if (swIsStringDelimiter(k, s)) {
      const e = swEndOfScope(f, nextIndex);
      i = e >= 0 ? e : nextIndex;
    } else {
      i = nextIndex;
    }
  }
  return found && f.k(argTypeIndex) === ek && f.s(argTypeIndex) === es && f.a(argTypeIndex) === ea;
};

/** redundantType. */
export const swRuleRedundantType = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.op(i, "=", SW_OP_INFIX)) {
      continue;
    }
    const keyword = swLastSignificantKeyword(f, i);
    if (!(keyword === "var" || keyword === "let")) {
      continue;
    }
    const equalsIndex = i;
    const colonIndex = swIndexBeforeWhere(f, i, (g, j) => g.tok(j, SW_DELIM, ":") || g.op(j, "=", SW_OP_INFIX));
    if (colonIndex < 0 || !f.tok(colonIndex, SW_DELIM, ":")) {
      continue;
    }
    const typeEndIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, equalsIndex);
    if (typeEndIndex < 0) {
      continue;
    }
    const ds = swDeclarationIndexAndScope(f, equalsIndex);
    const scope = ds & 3;
    const declIndex = (ds >> 2) - 1;
    const c = new SwRTCtx();
    c.colonIndex = colonIndex;
    c.typeEndIndex = typeEndIndex;
    c.isInferred = scope === SW_SCOPE_LOCAL;
    if (!c.isInferred && declIndex >= 0 && swHasModifier(f, declIndex, "@Model")) {
      continue;
    }
    const tokenAfterEquals = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, equalsIndex);
    const br: SwBranches | null = tokenAfterEquals >= 0 ? swConditionalBranches(f, tokenAfterEquals) : null;
    if (br !== null && swAllBranchesMatch(f, c, br)) {
      if (c.isInferred) {
        swRemoveType(f, c, 0, 0, 0, false);
      } else {
        swRemoveTypeInBranches(f, c, br);
      }
      continue;
    }
    const r = swCompareTypes(f, equalsIndex, colonIndex, typeEndIndex);
    if (r.matches) {
      swRemoveType(f, c, equalsIndex, r.i, r.j, r.wasValue);
    } else if (c.isInferred && tokenAfterEquals >= 0 && f.tok(tokenAfterEquals, SW_START, "[")) {
      const base = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, colonIndex);
      if (base < 0 || f.k(base) !== SW_IDENT) {
        continue;
      }
      const openAngle = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, base);
      if (openAngle < 0 || !f.tok(openAngle, SW_START, "<")) {
        continue;
      }
      const arg = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, openAngle);
      if (arg < 0 || f.k(arg) !== SW_IDENT) {
        continue;
      }
      const closeAngle = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, arg);
      if (closeAngle !== typeEndIndex || !f.tok(closeAngle, SW_END, ">")) {
        continue;
      }
      if (f.tok(base, SW_IDENT, "Set") && swArrayLiteralElementTypeIs(f, tokenAfterEquals, arg)) {
        f.removeTokens(openAngle, typeEndIndex + 1);
      }
    }
  }
};
