// SwiftFormat's docComments rule (docComments beforeDeclarations) and
// declarationScope(at:).
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { swEndOfConditionalAttributeBlock, swEndOfDeclarationInTypeBody } from "./decl";
import { SwFormatter, swIndexAfterWhere } from "./formatter";
import { swCommentDirective } from "./imports";
import { swIsDocComment, swIsModifier } from "./modifiers";
import { swEndOfScope, swIndexOfLastSignificantKeyword, swIsAttribute, swIsConditionalStatement, swIsDeclarationTypeKeyword, swIsStartOfClosure, SW_EX_WHERE } from "./parsing";
import {
  SW_COMMENT,
  SW_END,
  SW_KEYWORD,
  SW_LINEBREAK,
  SW_SPACE,
  SW_START,
  SW_T_KEYWORD,
  SW_T_LINEBREAK,
  SW_T_NON_SPACE,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
  SW_T_NON_SPACE_OR_LINEBREAK,
} from "./token";

export const SW_SCOPE_GLOBAL: i32 = 0;
export const SW_SCOPE_TYPE: i32 = 1;
export const SW_SCOPE_LOCAL: i32 = 2;

/** isStartOfClosureOrFunctionBody(at:). */
export const swIsStartOfClosureOrFunctionBody = (f: SwFormatter, i: i32): boolean => {
  if (!f.tok(i, SW_START, "{")) {
    return false;
  }
  if (swIsStartOfClosure(f, i)) {
    return true;
  }
  return f.lastIs(SW_T_KEYWORD, i, SW_KEYWORD, "func");
};

/** declarationScope(at:). */
export const swDeclarationScope = (f: SwFormatter, i: i32): i32 => {
  let unpaired = 0;
  let cur = i;
  let sos = -1;
  while (sos < 0 && cur > 0) {
    cur--;
    if (f.tok(cur, SW_END, "}")) {
      unpaired++;
    } else if (f.tok(cur, SW_START, "{")) {
      const e = swEndOfScope(f, cur);
      if (e >= 0 && i >= cur && i <= e && (swIsStartOfClosureOrFunctionBody(f, cur) || swIsConditionalStatement(f, cur))) {
        return SW_SCOPE_LOCAL;
      }
      if (unpaired === 0) {
        sos = cur;
      } else {
        unpaired--;
      }
    }
  }
  if (sos < 0) {
    return swIsConditionalStatement(f, i) ? SW_SCOPE_LOCAL : SW_SCOPE_GLOBAL;
  }
  if (swIsStartOfClosureOrFunctionBody(f, sos) || swIsConditionalStatement(f, sos)) {
    return SW_SCOPE_LOCAL;
  }
  const kw = swIndexOfLastSignificantKeyword(f, sos, SW_EX_WHERE);
  if (kw < 0) {
    return SW_SCOPE_LOCAL;
  }
  const s = f.s(kw);
  if (s === "class" || s === "actor" || s === "struct" || s === "enum" || s === "protocol" || s === "extension") {
    return SW_SCOPE_TYPE;
  }
  return SW_SCOPE_LOCAL;
};

/** shouldBeDocComment(at:endOfComment:): 1 true, 0 false, -1 nil. */
const swShouldBeDocComment = (f: SwFormatter, indices: i32[], endOfComment: i32): i32 => {
  let startIndex = indices[0];
  for (const x of indices) {
    if (x < startIndex) {
      startIndex = x;
    }
  }
  const nextDecl = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, endOfComment);
  if (nextDecl < 0) {
    return 0;
  }
  for (const x of indices) {
    const b = f.indexAfter(SW_T_NON_SPACE, x);
    if (b >= 0 && f.k(b) === SW_COMMENT && swCommentDirective(f.s(b)).length !== 0) {
      return -1;
    }
  }
  let di = nextDecl;
  const endif = swEndOfConditionalAttributeBlock(f, di);
  if (endif >= 0) {
    const x = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, endif);
    if (x >= 0) {
      di = x;
    }
  }
  if (swIsAttribute(f, di) || swIsModifier(f, di)) {
    const x = swIndexAfterWhere(f, di, (g, j) => swIsDeclarationTypeKeyword(g, j));
    if (x >= 0) {
      di = x;
    }
  }
  if (!swIsDeclarationTypeKeyword(f, di) || f.kw(di, "import")) {
    return 0;
  }
  if (swDeclarationScope(f, startIndex) === SW_SCOPE_LOCAL) {
    if (!f.kw(di, "func")) {
      return 0;
    }
    const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, startIndex);
    if (p >= 0 && !f.tok(p, SW_START, "{")) {
      return 0;
    }
  }
  // A blank line between the comment and the declaration
  let lineAllSpace = true;
  for (let j = endOfComment - 1; j <= nextDecl; j++) {
    if (f.k(j) === SW_LINEBREAK) {
      if (lineAllSpace) {
        return 0;
      }
      lineAllSpace = true;
    } else if (f.k(j) !== SW_SPACE) {
      lineAllSpace = false;
    }
  }
  if (lineAllSpace) {
    return 0;
  }
  const pt = f.indexBefore(SW_T_NON_SPACE_OR_LINEBREAK, startIndex);
  if (pt >= 0 && f.startOfLine(startIndex) === f.startOfLine(pt)) {
    return 0;
  }
  return swIsConditionalStatement(f, startIndex) ? 0 : 1;
};

/** isPreservedByConsecutiveDeclarations(after:). */
const swIsPreservedByConsecutiveDeclarations = (f: SwFormatter, endOfComment: i32): boolean => {
  const dk = swIndexAfterWhere(f, endOfComment, (g, j) => swIsDeclarationTypeKeyword(g, j));
  if (dk < 0) {
    return false;
  }
  const eod = swEndOfDeclarationInTypeBody(f, dk);
  if (eod < 0) {
    return false;
  }
  const nk = swIndexAfterWhere(f, eod, (g, j) => swIsDeclarationTypeKeyword(g, j));
  if (nk < 0) {
    return false;
  }
  let lbs = 0;
  for (let j = dk; j <= nk; j++) {
    if (f.k(j) === SW_LINEBREAK) {
      lbs++;
    }
  }
  return lbs === 1;
};

/** isPrecededByContinuousPreservedCommentGroup(before:). */
const swIsPrecededByPreservedGroup = (f: SwFormatter, commentStart: i32): boolean => {
  const indent = f.currentIndentForLine(commentStart);
  let lineStart = f.startOfLine(commentStart);
  while (lineStart > 0) {
    const plb = f.indexBefore(SW_T_LINEBREAK, lineStart);
    if (plb < 0) {
      break;
    }
    const pls = f.startOfLine(plb);
    if (f.indexInType(SW_T_NON_SPACE, pls, plb) < 0) {
      break;
    }
    const plc = f.startOfLine(plb, true);
    if (f.tok(plc, SW_START, "//") && f.currentIndentForLine(plb) === indent) {
      const pce = swEndOfScope(f, plc);
      if (pce < 0) {
        break;
      }
      return swIsPreservedByConsecutiveDeclarations(f, pce) || swIsPrecededByPreservedGroup(f, plc);
    }
    lineStart = pls;
  }
  return false;
};

/** docComments. */
export const swRuleDocComments = (f: SwFormatter): void => {
  for (let index = f.enumStart(); index >= 0; index = f.enumNext()) {
    const isLine = f.tok(index, SW_START, "//");
    if (!isLine && !f.tok(index, SW_START, "/*")) {
      continue;
    }
    const endOfComment = swEndOfScope(f, index);
    if (endOfComment < 0) {
      continue;
    }
    const indices: i32[] = [index];
    const pt = f.indexBefore(SW_T_NON_SPACE_OR_LINEBREAK, index);
    const isTrailing = pt >= 0 && f.startOfLine(index) === f.startOfLine(pt);
    if (isLine && !isTrailing) {
      let i = index;
      while (true) {
        const pl = f.indexBefore(SW_T_LINEBREAK, i);
        if (pl < 0) {
          break;
        }
        const ls = f.startOfLine(pl, true);
        if (!f.tok(ls, SW_START, "//")) {
          break;
        }
        indices.push(ls);
        i = ls;
      }
      i = index;
      while (true) {
        const nl = f.indexAfter(SW_T_LINEBREAK, i);
        if (nl < 0) {
          break;
        }
        const ls = f.indexAfter(SW_T_NON_SPACE, nl);
        if (ls < 0 || !f.tok(ls, SW_START, "//")) {
          break;
        }
        indices.push(ls);
        i = ls;
      }
    }
    const use = swShouldBeDocComment(f, indices, endOfComment);
    if (use < 0) {
      continue;
    }
    const useDoc = use === 1;
    let preserve = false;
    if (useDoc) {
      let mn = indices[0];
      for (const x of indices) {
        if (x < mn) {
          mn = x;
        }
      }
      preserve = swIsPreservedByConsecutiveDeclarations(f, endOfComment) || swIsPrecededByPreservedGroup(f, mn);
    }
    const marker = isLine ? "/" : "*";
    const isDoc = swIsDocComment(f, index);
    if (f.has(index + 1) && f.k(index + 1) === SW_COMMENT) {
      const body = f.s(index + 1);
      if (useDoc && !isDoc && !preserve) {
        f.replaceToken(index + 1, SW_COMMENT, marker + body, 0);
      } else if ((!useDoc || isTrailing) && isDoc) {
        let p = 0;
        while (p < toI32(body.length) && body.charCodeAt(p) === marker.charCodeAt(0)) {
          p++;
        }
        if (p > 1) {
          continue;
        }
        const updated = body.substring(1);
        if (updated.length === 0) {
          f.removeToken(index + 1);
        } else {
          f.replaceToken(index + 1, SW_COMMENT, updated, 0);
        }
      }
    } else if (useDoc && !preserve) {
      f.insert(SW_COMMENT, marker, 0, index + 1);
    }
  }
};
