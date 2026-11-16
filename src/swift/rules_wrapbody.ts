// SwiftFormat's body-wrapping rules: wrapFunctionBodies,
// wrapPropertyBodies, wrapLoopBodies, wrapIfStatementBodies.
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { swIsInsideProtocol, swIsInStringLiteral, swParsePropertyDeclaration, swWrapIfFollowingOpeningBrace, swWrapStatementBody } from "./expr";
import { SwFormatter } from "./formatter";
import { swIsFunctionDeclarationKeyword, swParseFunctionDeclaration } from "./funcdecl";
import { swIsStartOfClosure, swStartOfConditionalStatement, swStartOfScope } from "./parsing";
import { SW_END, SW_KEYWORD, SW_LINEBREAK, SW_START, SW_T_NON_SPACE_OR_COMMENT, SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK } from "./token";

/** Whether wrapStatementBody(at:) is sure to leave a body already split over lines alone. */
const swBodyAlreadyWrapped = (f: SwFormatter, bodyStart: i32): boolean => {
  const first = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, bodyStart);
  return first >= 0 && (f.k(first) === SW_END || f.k(first) === SW_LINEBREAK) && !swIsStartOfClosure(f, bodyStart);
};

/** wrapFunctionBodies. */
export const swRuleWrapFunctionBodies = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!swIsFunctionDeclarationKeyword(f, i)) {
      continue;
    }
    const d = swParseFunctionDeclaration(f, i);
    if (d === null || d.bodyStart < 0 || swBodyAlreadyWrapped(f, d.bodyStart) || swIsInsideProtocol(f, i)) {
      continue;
    }
    swWrapStatementBody(f, d.bodyStart);
  }
};

/** wrapPropertyBodies. */
export const swRuleWrapPropertyBodies = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.kw(i, "var")) {
      continue;
    }
    const p = swParsePropertyDeclaration(f, i);
    if (p === null || p.bodyStart < 0 || swBodyAlreadyWrapped(f, p.bodyStart) || swIsInsideProtocol(f, i)) {
      continue;
    }
    swWrapStatementBody(f, p.bodyStart);
  }
};

/** wrapLoopBodies. */
export const swRuleWrapLoopBodies = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!(f.kw(i, "for") || f.kw(i, "while") || f.kw(i, "repeat"))) {
      continue;
    }
    const s = f.indexOfAfter(SW_START, "{", 0, i);
    if (s >= 0) {
      swWrapStatementBody(f, s);
    } else if (f.kw(i, "for")) {
      f.fatalError("Expected {", i);
    }
  }
};

/** wrapIfStatementBodies (if expressions need swiftVersion >= 5.9, so isIfExpression is false). */
export const swRuleWrapIfStatementBodies = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!(f.kw(i, "if") || f.kw(i, "else"))) {
      continue;
    }
    if (f.kw(i, "else")) {
      const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
      if (p >= 0 && !f.tok(p, SW_END, "}")) {
        continue;
      }
      if (p >= 0 && f.tok(p, SW_END, "}")) {
        const ob = swStartOfScope(f, p);
        if (ob >= 0) {
          const sos = swStartOfConditionalStatement(f, ob);
          if (sos >= 0 && f.kw(sos, "guard")) {
            continue;
          }
        }
      }
    }
    if (f.kw(i, "if")) {
      const bb = f.indexOfAfter(SW_START, "{", 0, i);
      if (bb >= 0 && !swIsInStringLiteral(f, bb)) {
        swWrapIfFollowingOpeningBrace(f, i);
      }
    }
    const s = f.indexOfAfter(SW_START, "{", 0, i);
    if (s < 0) {
      f.fatalError("Expected {", i);
      continue;
    }
    swWrapStatementBody(f, s);
  }
};

