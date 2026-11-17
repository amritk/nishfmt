// SwiftFormat's preferForLoop rule (preserveSingleLineForEach on,
// preserveAnonymousForEach off), with String.singularized().
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { swSingularized } from "./singular";
import { swIsUnsafeExpression } from "./expr";
import { SwFormatter } from "./formatter";
import { swCurrentScope, swEndOfScope, swIsAttribute, swIsUnwrap, swParseType, swStartOfScope } from "./parsing";
import { swIndexIsWithinNestedClosure } from "./rules_closure";
import { swStartOfForLoopBody } from "./rules_enumerated";
import { swParseFunctionCallArguments } from "./rules_trailing";
import { swTokenize } from "./tokenizer";
import {
  SW_DELIM,
  SW_END,
  SW_IDENT,
  SW_KEYWORD,
  SW_LINEBREAK,
  SW_OP,
  SW_OP_INFIX,
  SW_OP_PREFIX,
  SW_SPACE,
  SW_START,
  SW_T_NON_SPACE_OR_COMMENT,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
  SW_T_NON_SPACE_OR_LINEBREAK,
  SwTok,
  swIsSwiftKeyword,
} from "./token";

const swIsAsciiString = (s: string): boolean => {
  for (let i = 0; i < toI32(s.length); i++) {
    if (s.charCodeAt(i) >= 128) {
      return false;
    }
  }
  return true;
};

const swTokenizeString = (src: string): SwTok[] => {
  const n = toI32(src.length);
  const b = new Array<u8>(n);
  for (let j = 0; j < n; j++) {
    b[j] = toU8(src.charCodeAt(j));
  }
  const t = swTokenize(b, n);
  const out: SwTok[] = [];
  for (let j = 0; j < t.count(); j++) {
    out.push(new SwTok(t.k[j], t.s[j], t.a[j]));
  }
  return out;
};

const SW_CHAIN_IGNORED: string =
  " reversed sorted shuffled enumerated dropFirst dropLast map flatMap compactMap filter reduce lazy ";

/** The forLoopSubjectIdentifier state of startOfChainComponent. */
class SwChainState {
  ident: string = "";
  hasIdent: boolean = false;
}

/** startOfChainComponent(at:forLoopSubjectIdentifier:), or -1. */
const swStartOfChainComponent = (f: SwFormatter, index: i32, st: SwChainState): i32 => {
  const k = f.k(index);
  if (k === SW_IDENT) {
    if (!st.hasIdent || SW_CHAIN_IGNORED.indexOf(` ${st.ident} `) >= 0) {
      st.ident = f.s(index);
      st.hasIdent = true;
    }
    return index;
  }
  if (f.tok(index, SW_END, ")") || f.tok(index, SW_END, "]")) {
    const sos = swStartOfScope(f, index);
    if (sos < 0) {
      return -1;
    }
    const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT, sos);
    if (p < 0) {
      return -1;
    }
    if (swIsUnsafeExpression(f, p)) {
      return sos;
    }
    const r = swStartOfChainComponent(f, p, st);
    return r >= 0 ? r : sos;
  }
  return -1;
};

/** The closure's parsed arguments: argument indices and the `in` keyword (-1 for nil). */
class SwClosureArgs {
  args: i32[];
  inKeyword: i32 = -1;
  constructor() {
    this.args = [];
  }
}

/** Skips throws/rethrows/async and a return type after `current` (parseClosureArguments). */
const swSkipEffectsAndReturnType = (f: SwFormatter, current: i32): i32 => {
  let currentIndex = current;
  const nextTokenIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, currentIndex);
  if (nextTokenIndex < 0) {
    return currentIndex;
  }
  let idx = nextTokenIndex;
  while (f.kw(idx, "throws") || f.kw(idx, "rethrows") || f.tok(idx, SW_IDENT, "async")) {
    const ps = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, idx);
    const pe = ps >= 0 && f.tok(ps, SW_START, "(") ? swEndOfScope(f, ps) : -1;
    const nx = pe >= 0 ? f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, pe) : -1;
    if (nx >= 0) {
      idx = nx;
    } else {
      const n2 = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, idx);
      if (n2 < 0) {
        break;
      }
      idx = n2;
    }
  }
  if (f.op(idx, "->", SW_OP_INFIX)) {
    const rts = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, idx);
    const rte = rts >= 0 ? swParseType(f, rts) : -1;
    if (rte >= 0) {
      return rte;
    }
  }
  if (idx !== nextTokenIndex) {
    const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, idx);
    if (p >= 0) {
      currentIndex = p;
    }
  }
  return currentIndex;
};

/** parseClosureArguments(at:), or null. */
const swParseClosureArguments = (f: SwFormatter, closureStart: i32): SwClosureArgs | null => {
  const out = new SwClosureArgs();
  let currentIndex = closureStart;
  let globalActor = -1;
  let n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, currentIndex);
  if (n >= 0 && swIsAttribute(f, n)) {
    globalActor = n;
    currentIndex = n;
  }
  const first = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, currentIndex);
  if (first >= 0 && f.tok(first, SW_START, "[")) {
    const end = swEndOfScope(f, first);
    if (end >= 0) {
      currentIndex = end;
    }
  }
  if (globalActor < 0) {
    n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, currentIndex);
    if (n >= 0 && swIsAttribute(f, n)) {
      currentIndex = n;
    }
  }
  const firstParam = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, currentIndex);
  if (firstParam < 0) {
    return null;
  }
  if (f.tok(firstParam, SW_START, "(")) {
    const paramsEnd = swEndOfScope(f, firstParam);
    if (paramsEnd < 0) {
      return null;
    }
    let argIndex = firstParam + 1;
    while (argIndex < paramsEnd) {
      const nn = f.indexInType(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, argIndex, paramsEnd);
      if (nn >= 0 && (f.k(nn) === SW_IDENT || f.k(nn) === SW_KEYWORD)) {
        out.args.push(nn);
        const comma = f.indexOfIn(SW_DELIM, ",", 0, nn, paramsEnd);
        if (comma >= 0) {
          argIndex = comma + 1;
        } else {
          break;
        }
      } else {
        break;
      }
    }
    currentIndex = swSkipEffectsAndReturnType(f, paramsEnd);
  } else if (f.k(firstParam) === SW_IDENT) {
    let paramsEnd = firstParam;
    let argIndex = firstParam;
    while (argIndex < f.count()) {
      const ak = f.k(argIndex);
      if (ak === SW_IDENT) {
        out.args.push(argIndex);
        paramsEnd = argIndex;
        const nn = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, argIndex);
        if (nn < 0) {
          break;
        }
        if (f.tok(nn, SW_DELIM, ",")) {
          argIndex = nn + 1;
          continue;
        }
        if (
          f.kw(nn, "in") ||
          f.op(nn, "->", SW_OP_INFIX) ||
          f.kw(nn, "throws") ||
          f.kw(nn, "rethrows") ||
          f.tok(nn, SW_IDENT, "async")
        ) {
          break;
        }
        return null;
      } else if (ak === SW_SPACE || ak === SW_LINEBREAK || f.isComment(argIndex)) {
        argIndex++;
      } else {
        return null;
      }
    }
    currentIndex = swSkipEffectsAndReturnType(f, paramsEnd);
  }
  const inIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, currentIndex);
  if (inIndex < 0 || !f.kw(inIndex, "in")) {
    return null;
  }
  out.inKeyword = inIndex;
  return out;
};

/** loopBodies(in:_:) as [lo0, hi0, lo1, hi1, ...]. */
const swLoopBodies = (f: SwFormatter, open: i32, close: i32): i32[] => {
  const out: i32[] = [];
  for (let index = open + 1; index < close; index++) {
    if (swIndexIsWithinNestedClosure(f, index, open)) {
      continue;
    }
    let bodyStart = -1;
    if (f.kw(index, "for")) {
      const ii = f.indexOfAfter(SW_KEYWORD, "in", 0, index);
      bodyStart = ii >= 0 ? swStartOfForLoopBody(f, ii) : -1;
    } else if (f.kw(index, "while")) {
      const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
      let isRepeatWhile = false;
      if (p >= 0 && f.tok(p, SW_END, "}")) {
        const ps = swStartOfScope(f, p);
        if (ps >= 0) {
          const q = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, ps);
          isRepeatWhile = q >= 0 && f.kw(q, "repeat");
        }
      }
      bodyStart = isRepeatWhile ? -1 : f.indexOfAfter(SW_START, "{", 0, index);
    } else if (f.kw(index, "repeat")) {
      bodyStart = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
    }
    if (bodyStart >= 0 && f.tok(bodyStart, SW_START, "{") && bodyStart < close) {
      const be = swEndOfScope(f, bodyStart);
      if (be >= 0) {
        out.push(bodyStart);
        out.push(be);
      }
    }
  }
  return out;
};

/** Int(s.dropFirst()) is a non-zero integer, for a string starting with `$`. */
const swIsNonZeroDollarInt = (s: string): boolean => {
  const n = toI32(s.length);
  let p = 1;
  if (p < n && (s.charCodeAt(p) === 43 || s.charCodeAt(p) === 45)) {
    p++;
  }
  if (p >= n) {
    return false;
  }
  let nonZero = false;
  let digits = 0;
  for (let i = p; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) {
      return false;
    }
    if (c !== 48 || nonZero) {
      digits++;
    }
    if (c !== 48) {
      nonZero = true;
    }
  }
  if (!nonZero) {
    return false;
  }
  if (digits > 19) {
    return false;
  }
  if (digits === 19) {
    // Int.max is 9223372036854775807 (Int.min's magnitude is one more).
    let q = p;
    while (s.charCodeAt(q) === 48) {
      q++;
    }
    const v = s.substring(q);
    const lim = s.charCodeAt(1) === 45 ? "9223372036854775808" : "9223372036854775807";
    for (let j = 0; j < 19; j++) {
      if (v.charCodeAt(j) !== lim.charCodeAt(j)) {
        return v.charCodeAt(j) < lim.charCodeAt(j);
      }
    }
    return true;
  }
  return true;
};

/** preferForLoop for one `forEach` token. */
const swPreferForLoopAt = (f: SwFormatter, forEachIndex: i32): void => {
  const dot = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, forEachIndex);
  if (dot < 0 || !f.op(dot, ".", SW_OP_INFIX)) {
    return;
  }
  const after = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, forEachIndex);
  const beforeDot = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, dot);
  if (after < 0 || beforeDot < 0) {
    return;
  }
  if (!(f.tok(after, SW_START, "(") || f.tok(after, SW_START, "{"))) {
    return;
  }
  const args = swParseFunctionCallArguments(f, after);
  if (args.length !== 1 || !f.tok(args[0].lo, SW_START, "{") || !f.tok(args[0].hi, SW_END, "}")) {
    return;
  }
  const open = args[0].lo;
  const close = args[0].hi;
  const isTrailing = f.tok(after, SW_START, "{");
  const closeParen = isTrailing ? -1 : swEndOfScope(f, after);
  let multiline = false;
  for (let i = open; i < close; i++) {
    if (f.k(i) === SW_LINEBREAK) {
      multiline = true;
      break;
    }
  }
  if (!multiline) {
    return;
  }
  const firstInBody = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, open);
  if (firstInBody < 0 || f.tok(firstInBody, SW_START, "[")) {
    return;
  }
  const st = new SwChainState();
  let currentIndex = forEachIndex;
  while (true) {
    const pd = f.indexBefore(SW_T_NON_SPACE_OR_LINEBREAK, currentIndex);
    if (pd < 0 || !f.op(pd, ".", SW_OP_INFIX)) {
      break;
    }
    const tb = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, pd);
    if (tb < 0) {
      break;
    }
    const s = swStartOfChainComponent(f, tb, st);
    if (s < 0) {
      return;
    }
    currentIndex = s;
  }
  if (currentIndex === forEachIndex) {
    return;
  }
  let isUnsafe = false;
  const ui = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, currentIndex);
  if (ui >= 0 && swIsUnsafeExpression(f, ui)) {
    isUnsafe = true;
    currentIndex = ui;
  }
  const subjectLo = currentIndex;
  const subjectHi = beforeDot;
  const tbl = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, currentIndex);
  if (tbl >= 0) {
    let p = tbl;
    if (swIsUnwrap(f, tbl)) {
      p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT, tbl);
    }
    if (p >= 0) {
      if (f.kw(p, "try") || f.kw(p, "await")) {
        return;
      }
      const pk = f.k(p);
      if (
        (pk === SW_OP && (f.a(p) === SW_OP_INFIX || f.a(p) === SW_OP_PREFIX)) ||
        f.kw(p, "return") ||
        f.kw(p, "throw") ||
        f.tok(p, SW_IDENT, "yield")
      ) {
        return;
      }
    }
  }
  const scope = swCurrentScope(f, currentIndex);
  if (scope >= 0 && (f.tok(scope, SW_START, "(") || f.tok(scope, SW_START, "["))) {
    return;
  }
  for (let i = subjectLo; i <= subjectHi; i++) {
    if (f.k(i) === SW_LINEBREAK) {
      return;
    }
  }
  let names: string[] = [];
  let inKeyword = -1;
  let isAnonymous = false;
  const ca = swParseClosureArguments(f, open);
  if (ca !== null) {
    if (ca.args.length === 0) {
      return;
    }
    for (const a of ca.args) {
      names.push(f.s(a));
    }
    inKeyword = ca.inKeyword;
    for (const nm of names) {
      if (nm.startsWith("$")) {
        return;
      }
    }
  } else {
    isAnonymous = true;
    const eligible: string[] = [];
    if (st.hasIdent) {
      if (!swIsAsciiString(st.ident)) {
        // Unicode case-insensitive matching and case mapping are not ported.
        f.fatalError("preferForLoop: non-ASCII loop subject", forEachIndex);
        return;
      }
      const sing = swSingularized(st.ident);
      if (sing !== null && !swIsSwiftKeyword(sing)) {
        eligible.push(sing);
      }
    }
    eligible.push("item");
    eligible.push("element");
    eligible.push("value");
    let chosen = "";
    for (const name of eligible) {
      let used = false;
      for (let i = open; i <= close; i++) {
        if (f.s(i) === name) {
          used = true;
          break;
        }
      }
      if (!used) {
        chosen = name;
        break;
      }
    }
    if (chosen.length === 0) {
      return;
    }
    names = [chosen];
  }
  const bodies = swLoopBodies(f, open, close);
  for (let i = open; i <= close; i++) {
    if (swIndexIsWithinNestedClosure(f, i, open)) {
      continue;
    }
    const s = f.s(i);
    if (s.startsWith("$") && swIsNonZeroDollarInt(s)) {
      return;
    }
    if (f.kw(i, "return")) {
      for (let b = 0; b < toI32(bodies.length); b += 2) {
        if (i >= bodies[b] && i <= bodies[b + 1]) {
          return;
        }
      }
      const nt = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, i);
      if (nt >= 0 && !(f.k(nt) === SW_LINEBREAK || f.tok(nt, SW_END, "}"))) {
        return;
      }
    }
  }
  for (let i = open; i <= close; i++) {
    if (swIndexIsWithinNestedClosure(f, i, open)) {
      continue;
    }
    if (isAnonymous && f.s(i) === "$0") {
      f.replaceToken(i, SW_IDENT, names[0], 0);
    }
    if (f.kw(i, "return")) {
      f.replaceToken(i, SW_KEYWORD, "continue", 0);
    }
  }
  if (closeParen >= 0) {
    f.removeToken(closeParen);
  }
  const toks: SwTok[] = [new SwTok(SW_KEYWORD, "for", 0), new SwTok(SW_SPACE, " ", 0)];
  if (isUnsafe) {
    toks.push(new SwTok(SW_IDENT, "unsafe", 0));
    toks.push(new SwTok(SW_SPACE, " ", 0));
  }
  if (names.length === 1) {
    toks.push(new SwTok(SW_IDENT, names[0], 0));
  } else {
    for (const t of swTokenizeString(`(${names.join(", ")})`)) {
      toks.push(t);
    }
  }
  toks.push(new SwTok(SW_SPACE, " ", 0));
  toks.push(new SwTok(SW_KEYWORD, "in", 0));
  toks.push(new SwTok(SW_SPACE, " ", 0));
  for (let i = subjectLo; i <= subjectHi; i++) {
    toks.push(new SwTok(f.k(i), f.s(i), f.a(i)));
  }
  toks.push(new SwTok(SW_SPACE, " ", 0));
  toks.push(new SwTok(SW_START, "{", 0));
  const end = inKeyword >= 0 ? inKeyword : open;
  f.replaceTokens(subjectLo, end + 1, toks);
};

/** preferForLoop. */
export const swRulePreferForLoop = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (f.tok(i, SW_IDENT, "forEach")) {
      swPreferForLoopAt(f, i);
    }
  }
};
