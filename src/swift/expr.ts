// SwiftFormat's expression and property parsing: parseExpressionRange,
// postfix #if blocks, parsePropertyDeclaration, and the statement-body
// wrapping helpers.
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { SwFormatter } from "./formatter";
import { swStartOfModifiers } from "./modifiers";
import {
  swConditionalBranches,
  swEndOfScope,
  swHasLinebreak,
  swIsConditionalStatement,
  swIsStartOfClosure,
  swIsUnwrap,
  swLastSignificantKeyword,
  swParseType,
  swPrevIs,
  swStartOfScope,
  SW_EX_CLASS,
  SW_EX_WHERE,
} from "./parsing";
import {
  SW_DELIM,
  SW_END,
  SW_IDENT,
  SW_KEYWORD,
  SW_LINEBREAK,
  SW_NUMBER,
  SW_OP,
  SW_OP_INFIX,
  SW_OP_POSTFIX,
  SW_OP_PREFIX,
  SW_SPACE,
  SW_START,
  SW_T_NON_SPACE_OR_COMMENT,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
  swIsMultilineStringDelimiter,
  swIsStringDelimiter,
  swStrIsMacro,
} from "./token";

/** isUnsafeExpression(at:). */
export const swIsUnsafeExpression = (f: SwFormatter, index: i32): boolean => {
  if (!f.tok(index, SW_IDENT, "unsafe")) {
    return false;
  }
  const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
  if (p >= 0 && f.ks(p, SW_OP, ".")) {
    return false;
  }
  const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
  if (n < 0 || !f.onSameLine(index, n)) {
    return false;
  }
  const k = f.k(n);
  if (k === SW_IDENT || k === SW_NUMBER || (k === SW_OP && f.a(n) === SW_OP_PREFIX) || f.kw(n, "try") || f.kw(n, "await") || f.kw(n, "if") || f.kw(n, "switch")) {
    return true;
  }
  if (f.tok(n, SW_START, "{")) {
    return swIsStartOfClosure(f, n);
  }
  if (f.tok(n, SW_START, "(") || f.tok(n, SW_START, "[")) {
    return n > index + 1;
  }
  if (k === SW_START && swIsStringDelimiter(k, f.s(n))) {
    return true;
  }
  if (k === SW_KEYWORD && f.s(n).startsWith("#")) {
    return true;
  }
  return false;
};

/** conditionalCompilationDirectives(at:), or null. */
export const swConditionalCompilationDirectives = (f: SwFormatter, ifIndex: i32): i32[] | null => {
  if (!f.tok(ifIndex, SW_START, "#if")) {
    return null;
  }
  const out: i32[] = [ifIndex];
  let depth = 0;
  for (let i = ifIndex; i < f.count(); i++) {
    if (f.tok(i, SW_START, "#if")) {
      depth++;
    } else if ((f.kw(i, "#elseif") || f.kw(i, "#else")) && depth === 1) {
      out.push(i);
    } else if (f.tok(i, SW_END, "#endif")) {
      depth--;
      if (depth === 0) {
        out.push(i);
        return out;
      }
    }
  }
  return null;
};

/** endOfPostfixConditionalCompilationBlock(at:), or -1. */
export const swEndOfPostfixIfdef = (f: SwFormatter, ifIndex: i32): i32 => {
  if (!f.tok(ifIndex, SW_START, "#if")) {
    return -1;
  }
  const first = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, f.endOfLine(ifIndex));
  if (first < 0 || !(f.ks(first, SW_OP, ".") || f.tok(first, SW_START, "#if"))) {
    return -1;
  }
  const dirs = swConditionalCompilationDirectives(f, ifIndex);
  if (dirs === null) {
    return -1;
  }
  let last = -1;
  for (let q = 0; q + 1 < toI32(dirs.length); q++) {
    const eod = f.endOfLine(dirs[q]);
    if (!(eod < dirs[q + 1])) {
      return -1;
    }
    const lo = eod + 1;
    const hi = dirs[q + 1];
    if (!(swIsMemberAccessChain(f, lo, hi) || f.indexInType(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, lo, hi) < 0)) {
      return -1;
    }
    last = hi;
  }
  return last;
};

/** isMemberAccessChain(in: lo ..< hi). */
const swIsMemberAccessChain = (f: SwFormatter, lo: i32, hi: i32): boolean => {
  let s = f.indexInType(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, lo, hi);
  if (s < 0) {
    return false;
  }
  while (s < hi) {
    let e = -1;
    if (f.ks(s, SW_OP, ".")) {
      const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, s);
      if (n >= 0) {
        e = swParseExpressionEnd(f, n, false);
      }
    } else {
      e = swEndOfPostfixIfdef(f, s);
    }
    if (e < 0) {
      return false;
    }
    const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, e);
    if (n < 0) {
      return false;
    }
    s = n;
  }
  return s === hi;
};

/** parseExpressionRange(startingAt:allowConditionalExpressions:)'s end (it starts at `start`), or -1. */
export const swParseExpressionEnd = (f: SwFormatter, start: i32, allowConditional: boolean = false): i32 => {
  const sk = f.k(start);
  const ss = f.s(start);
  if ((sk === SW_OP && f.a(start) === SW_OP_PREFIX) || ss === "await" || ss === "repeat" || ss === "each" || swIsUnsafeExpression(f, start)) {
    const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, start);
    if (n >= 0) {
      const e = swParseExpressionEnd(f, n, allowConditional);
      if (e >= 0) {
        return e;
      }
    }
  }
  if (ss === "try") {
    let n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, start);
    if (n < 0) {
      return -1;
    }
    if (swIsUnwrap(f, n)) {
      const m = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, n);
      if (m < 0) {
        return -1;
      }
      n = m;
    }
    const e = swParseExpressionEnd(f, n, allowConditional);
    if (e >= 0) {
      return e;
    }
  }
  let end = 0;
  if (sk === SW_IDENT || sk === SW_NUMBER) {
    end = start;
  } else if (sk === SW_START) {
    if (ss === "#if" || ss === "#elseif" || ss === "#else") {
      return -1;
    }
    const e = swEndOfScope(f, start);
    if (e < 0) {
      return -1;
    }
    end = e;
  } else if (sk === SW_KEYWORD && ss.startsWith("#")) {
    end = start;
  } else if (f.kw(start, "if") || f.kw(start, "switch")) {
    if (!allowConditional) {
      return -1;
    }
    const b = swConditionalBranches(f, start);
    if (b === null || b.ends.length === 0) {
      return -1;
    }
    end = b.ends[toI32(b.ends.length) - 1];
  } else {
    return -1;
  }
  while (true) {
    const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, end);
    if (n < 0) {
      break;
    }
    const nk = f.k(n);
    const ns = f.s(n);
    if (nk === SW_START && (ns === "(" || ns === "[" || ns === "<")) {
      if (swHasLinebreak(f, end, n)) {
        return end;
      }
      const e = swEndOfScope(f, n);
      if (e < 0) {
        return -1;
      }
      end = e;
    } else if ((nk === SW_DELIM && ns === ".") || (nk === SW_OP && ns === ".")) {
      const id = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, n);
      if (id < 0 || f.k(id) !== SW_IDENT) {
        return end;
      }
      end = id;
    } else if (nk === SW_START && ns === "#if") {
      const e = swEndOfPostfixIfdef(f, n);
      if (e < 0) {
        return end;
      }
      end = e;
    } else if (nk === SW_OP && f.a(n) === SW_OP_POSTFIX) {
      end = n;
    } else if (nk === SW_OP && f.a(n) === SW_OP_INFIX && ns !== "=") {
      const m = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, n);
      const e = m >= 0 ? swParseExpressionEnd(f, m, false) : -1;
      if (e < 0) {
        return end;
      }
      end = e;
    } else if (f.kw(n, "is") || f.kw(n, "as")) {
      let m = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, n);
      if (m < 0) {
        return -1;
      }
      if (swIsUnwrap(f, m)) {
        const q = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, m);
        if (q < 0) {
          return -1;
        }
        m = q;
      }
      const e = swParseExpressionEnd(f, m, false);
      if (e < 0) {
        return end;
      }
      end = e;
    } else if (nk === SW_START && ns === "{" && swIsStartOfClosure(f, n)) {
      const e = swEndOfScope(f, n);
      if (e < 0) {
        return -1;
      }
      if (swIsConditionalStatement(f, start)) {
        return end;
      }
      end = e;
    } else if (nk === SW_IDENT) {
      const c = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, n);
      if (c < 0 || !f.tok(c, SW_DELIM, ":")) {
        return end;
      }
      const sc = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, c);
      if (sc < 0 || !f.tok(sc, SW_START, "{")) {
        return end;
      }
      const e = swEndOfScope(f, sc);
      if (e < 0) {
        return end;
      }
      end = e;
    } else {
      return end;
    }
  }
  return end;
};

/** PropertyDeclaration; -1 marks an absent part. */
export class SwProperty {
  identifier: string = "";
  startOfModifiers: i32 = -1;
  introducer: i32 = -1;
  identifierIndex: i32 = -1;
  colon: i32 = -1;
  typeStart: i32 = -1;
  typeEnd: i32 = -1;
  assignment: i32 = -1;
  valueStart: i32 = -1;
  valueEnd: i32 = -1;
  bodyStart: i32 = -1;
  bodyEnd: i32 = -1;
  insideStart: i32 = -1;
  insideEnd: i32 = -1;
}

/** parsePropertyDeclaration(atIntroducerIndex:). */
export const swParsePropertyDeclaration = (f: SwFormatter, introducer: i32): SwProperty | null => {
  if (!(f.s(introducer) === "let" || f.s(introducer) === "var")) {
    return null;
  }
  const idx = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, introducer);
  if (idx < 0 || f.k(idx) !== SW_IDENT) {
    return null;
  }
  const p = new SwProperty();
  p.introducer = introducer;
  p.identifier = f.s(idx);
  p.identifierIndex = idx;
  const colon = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, idx);
  if (colon >= 0 && f.tok(colon, SW_DELIM, ":")) {
    const st = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, colon);
    if (st >= 0) {
      const te = swParseType(f, st);
      if (te >= 0) {
        p.colon = colon;
        p.typeStart = st;
        p.typeEnd = te;
      }
    }
  }
  const eoti = p.typeEnd >= 0 ? p.typeEnd : idx;
  const ai = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, eoti);
  if (ai >= 0 && f.op(ai, "=", SW_OP_INFIX)) {
    const se = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, ai);
    if (se >= 0) {
      const ee = swParseExpressionEnd(f, se, true);
      if (ee >= 0) {
        p.assignment = ai;
        p.valueStart = se;
        p.valueEnd = ee;
      }
    }
  }
  const eotiv = p.valueEnd >= 0 ? p.valueEnd : eoti;
  const sb = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, eotiv);
  if (sb >= 0 && f.tok(sb, SW_START, "{")) {
    const eb = swEndOfScope(f, sb);
    if (eb >= 0) {
      p.bodyStart = sb;
      p.bodyEnd = eb;
      if (sb + 1 !== eb) {
        const ft = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, sb);
        const lt = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, eb);
        if (ft >= 0 && lt >= 0 && ft <= lt) {
          p.insideStart = ft;
          p.insideEnd = lt;
        } else {
          p.insideStart = sb + 1;
          p.insideEnd = eb - 1;
        }
      } else {
        p.insideStart = sb;
        p.insideEnd = eb;
      }
    }
  }
  p.startOfModifiers = swStartOfModifiers(f, introducer, true);
  return p;
};

/** isInsideProtocol(at:). */
export const swIsInsideProtocol = (f: SwFormatter, index: i32): boolean => {
  const sos = swStartOfScope(f, index);
  if (sos < 0) {
    return false;
  }
  return swLastSignificantKeyword(f, sos, SW_EX_WHERE | SW_EX_CLASS) === "protocol";
};

/** isInStringLiteralWithWrappingDisabled(at:) (wrapStringInterpolation is off): inside any string literal. */
export const swIsInStringLiteral = (f: SwFormatter, i: i32): boolean => {
  if (f.encMut !== f.mutations || toI32(f.enc.length) !== f.count()) {
    const n = f.count();
    const enc = new Array<i32>(n);
    const stack: i32[] = [];
    for (let j = 0; j < n; j++) {
      const k = f.k(j);
      const m = toI32(stack.length);
      if (k === SW_START && swIsStringDelimiter(k, f.s(j))) {
        enc[j] = m === 0 ? -1 : stack[m - 1];
        stack.push(j);
      } else if (k === SW_END && swIsStringDelimiter(k, f.s(j))) {
        enc[j] = m === 0 ? -1 : stack[m - 1];
        if (m > 0) {
          stack.pop();
        }
      } else {
        enc[j] = m === 0 ? -1 : stack[m - 1];
      }
    }
    f.enc = enc;
    f.encMut = f.mutations;
  }
  return i >= 0 && i < toI32(f.enc.length) && f.enc[i] >= 0;
};

/** wrapStatementBody(at:). */
export const swWrapStatementBody = (f: SwFormatter, i: i32): void => {
  if (swIsInStringLiteral(f, i)) {
    return;
  }
  let openBrace = i;
  while (swIsStartOfClosure(f, openBrace)) {
    const eoc = f.indexOfAfter(SW_END, "}", 0, openBrace);
    if (eoc < 0) {
      return;
    }
    const nob = f.indexOfAfter(SW_START, "{", 0, eoc + 1);
    if (nob < 0) {
      return;
    }
    openBrace = nob;
  }
  let first = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, openBrace);
  if (first < 0 || f.k(first) === SW_END || f.k(first) === SW_LINEBREAK) {
    return;
  }
  f.insertLinebreak(first);
  if (f.k(first - 1) === SW_SPACE) {
    f.removeToken(first - 1);
    first -= 1;
  }
  const moved = first + 1;
  const indent = f.currentIndentForLine(i) + "    ";
  f.insertSpace(indent, moved);
  let closing = f.indexOfAfter(SW_END, "}", 0, moved);
  if (closing < 0 || swHasLinebreak(f, moved, closing)) {
    return;
  }
  f.insertLinebreak(closing);
  const lb = closing;
  closing += 1;
  if (f.k(lb - 1) === SW_SPACE) {
    f.removeToken(lb - 1);
    closing -= 1;
  }
  f.insertSpace(f.currentIndentForLine(i), closing);
};

/** wrapIfFollowingOpeningBrace(at:). */
export const swWrapIfFollowingOpeningBrace = (f: SwFormatter, i: i32): void => {
  const lineStart = f.startOfLine(i);
  const openBrace = f.lastIndexOfIn(SW_START, "{", 0, lineStart, i);
  if (openBrace < 0) {
    return;
  }
  const closeBrace = swEndOfScope(f, openBrace);
  if (closeBrace >= 0) {
    const prevToken = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT, closeBrace);
    if (prevToken >= 0 && f.tok(prevToken, SW_END, "}") && f.startOfLine(prevToken) === f.startOfLine(closeBrace)) {
      const closeIndent = f.currentIndentForLine(openBrace);
      let insertAt = closeBrace;
      if (f.k(insertAt - 1) === SW_SPACE) {
        f.removeToken(insertAt - 1);
        insertAt -= 1;
      }
      f.insertLinebreak(insertAt);
      f.insertSpace(closeIndent, insertAt + 1);
    }
  }
  const ins = openBrace + 1;
  if (f.k(ins) === SW_SPACE) {
    f.removeToken(ins);
  }
  const indent = f.currentIndentForLine(openBrace) + "    ";
  f.insertLinebreak(ins);
  f.insertSpace(indent, ins + 1);
};

