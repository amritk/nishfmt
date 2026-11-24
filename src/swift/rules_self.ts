// SwiftFormat's redundantSelf and redundantStaticSelf rules: addOrRemoveSelf(static:),
// removeSelf(at:exclude:include:) and processDeclaredVariables (explicitSelf remove,
// swiftVersion undefined, so closures never allow implicit self).
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { SwFormatter, swIndexInWhere } from "./formatter";
import { add32, sub32 } from "../core/arr";
import { fault } from "../core/fault";
import { swParseFunctionDeclaration, swUnescaped, swUnescapedTok } from "./funcdecl";
import { swIsUnsafeExpression } from "./expr";
import { swModifiersForDeclaration } from "./modifiers";
import {
  swCurrentScope,
  swEndOfAttribute,
  swEndOfScope,
  swIsAttribute,
  swIsConditionalStatement,
  swIsInClosureArguments,
  swIsStartOfClosure,
  swIsStartOfStatement,
  swStartOfForLoopPattern,
} from "./parsing";
import { swBackticksRequired } from "./rules_redundant1";
import {
  SW_COMMENT,
  SW_DELIM,
  SW_END,
  SW_IDENT,
  SW_KEYWORD,
  SW_LINEBREAK,
  SW_NUMBER,
  SW_OP,
  SW_OP_INFIX,
  SW_OP_POSTFIX,
  SW_SPACE,
  SW_START,
  SW_T_END_OF_SCOPE,
  SW_T_IDENTIFIER,
  SW_T_KEYWORD,
  SW_T_LINEBREAK,
  SW_T_NON_SPACE,
  SW_T_NON_SPACE_OR_COMMENT,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
  SW_T_NON_SPACE_OR_LINEBREAK,
  SW_T_START_OF_SCOPE,
  swIsStringDelimiter,
  swPopLast,
  swIsSwitchCaseOrDefault,
  swStrIsMacro,
} from "./token";

// MARK: name sets (small, so plain arrays)

const swNHas = (a: string[], s: string): boolean => a.indexOf(s) >= 0;

const swNAdd = (a: string[], s: string): void => {
  if (a.indexOf(s) < 0) {
    a.push(s);
  }
};

const swNCopy = (a: string[]): string[] => {
  const out: string[] = [];
  for (const s of a) {
    out.push(s);
  }
  return out;
};

const swNUnionInto = (a: string[], b: string[]): void => {
  for (const s of b) {
    swNAdd(a, s);
  }
};

const swNMinus = (a: string[], b: string[]): string[] => {
  const out: string[] = [];
  for (const s of a) {
    if (b.indexOf(s) < 0) {
      out.push(s);
    }
  }
  return out;
};

const swSelfRequired = (s: string): boolean =>
  s === "notice" ||
  s === "info" ||
  s === "debug" ||
  s === "error" ||
  s === "warning" ||
  s === "fault" ||
  s === "log" ||
  s === "trace" ||
  s === "critical";
const swGlobalFunc = (s: string): boolean =>
  s === "min" || s === "max" || s === "abs" || s === "print" || s === "stride" || s === "zip";
const swOwnership = (s: string): boolean =>
  s === "weak" || s === "unowned" || s === "unowned(safe)" || s === "unowned(unsafe)";

/** Walk state shared by the recursive helpers (Swift's inout index and stacks). */
class SwSelfCtx {
  idx: i32 = 0;
  staticSelf: boolean = false;
  selfKw: string = "self";
  typeNames: string[];
  typeKws: string[];
  closAllows: boolean[];
  closCapture: string[];
  dead: boolean = false;
  constructor() {
    this.typeNames = [];
    this.typeKws = [];
    this.closAllows = [];
    this.closCapture = [];
  }
}

const swSelfFatal = (f: SwFormatter, c: SwSelfCtx, msg: string, at: i32): void => {
  f.fatalError(msg, at);
  c.dead = true;
};

/** isSelfRequiredType(beforeAssignment:). */
const swIsSelfRequiredType = (f: SwFormatter, equalsIndex: i32): boolean => {
  let typeIndex = equalsIndex;
  while (true) {
    const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, typeIndex);
    if (p < 0) {
      break;
    }
    if (f.k(p) === SW_OP && (f.s(p) === "?" || f.s(p) === "!") && f.a(p) === SW_OP_POSTFIX) {
      typeIndex = p;
    } else if (f.tok(p, SW_END, ">")) {
      const ms = swStartOfScopeAt(f, p);
      if (ms >= 0) {
        typeIndex = ms;
      } else {
        typeIndex = p;
        break;
      }
    } else {
      typeIndex = p;
      break;
    }
  }
  if (f.k(typeIndex) !== SW_IDENT) {
    return false;
  }
  return swSelfRequired(swUnescaped(f.s(typeIndex)));
};

/** startOfScope(at:) for an end-of-scope token. */
const swStartOfScopeAt = (f: SwFormatter, i: i32): i32 => {
  const cs = swCurrentScope(f, i);
  return cs;
};

/** isAssignedToSelfRequiredType(at:). */
const swIsAssignedToSelfRequiredType = (f: SwFormatter, i: i32): boolean => {
  let index = i;
  while (true) {
    const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
    if (p < 0) {
      return false;
    }
    if (f.op(p, "=", SW_OP_INFIX)) {
      return swIsSelfRequiredType(f, p);
    }
    const k = f.k(p);
    if (
      k === SW_IDENT ||
      f.op(p, ".", SW_OP_INFIX) ||
      f.kw(p, "try") ||
      f.kw(p, "await") ||
      f.op(p, "?", SW_OP_POSTFIX) ||
      f.op(p, "!", SW_OP_POSTFIX)
    ) {
      index = p;
    } else {
      return false;
    }
  }
};

/** removeSelf(at:exclude:include:); `include` null for nil. */
const swRemoveSelf = (f: SwFormatter, i: i32, exclude: string[], include: string[], useInclude: boolean): boolean => {
  const selfKeyword = f.s(i);
  const staticSelf = selfKeyword === "Self";
  const dotIndex = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, i);
  if (dotIndex < 0 || !f.op(dotIndex, ".", SW_OP_INFIX)) {
    return false;
  }
  if (swNHas(exclude, selfKeyword)) {
    return false;
  }
  const nextIndex = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, dotIndex);
  if (nextIndex < 0 || !f.isEnabled() || f.k(nextIndex) !== SW_IDENT) {
    return false;
  }
  const name = swUnescaped(f.s(nextIndex));
  if (useInclude && !swNHas(include, name)) {
    return false;
  }
  if (swNHas(exclude, name) || swGlobalFunc(name) || (!staticSelf && swSelfRequired(name))) {
    return false;
  }
  if (swBackticksRequired(f, name, nextIndex, true)) {
    return false;
  }
  let index = i;
  while (true) {
    const scopeStart = f.indexBefore(SW_T_START_OF_SCOPE, index);
    if (scopeStart < 0) {
      break;
    }
    const s = f.s(scopeStart);
    if (s === "[") {
      // continue
    } else if (s === "(") {
      const prevIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, scopeStart);
      if (prevIndex >= 0) {
        const pn = f.k(prevIndex) === SW_IDENT ? swUnescaped(f.s(prevIndex)) : f.s(prevIndex);
        const isSym = !staticSelf && (swSelfRequired(pn) || pn === "expect" || pn === "os_log");
        if (isSym || swIsAttribute(f, prevIndex)) {
          return false;
        }
      }
    } else if (swIsStringDelimiter(f.k(scopeStart), s)) {
      // continue
    } else {
      break;
    }
    index = scopeStart;
  }
  if (!staticSelf && swIsAssignedToSelfRequiredType(f, index)) {
    return false;
  }
  f.removeTokens(i, nextIndex);
  return true;
};

/** processDeclaredVariables(at:names:removeSelfKeyword:onlyLocal:scopeAllowsImplicitSelfRebinding:) with rebinding off. Answers the new index. */
const swProcessDeclaredVariables = (
  f: SwFormatter,
  c: SwSelfCtx,
  index0: i32,
  names: string[],
  removeSelfKeyword: string,
  onlyLocal: boolean,
): i32 => {
  let index = index0;
  const isConditional = swIsConditionalStatement(f, index);
  let declarationIndex = -1;
  let hasDecl = true;
  const scopeIndexStack: i32[] = [];
  const locals: string[] = [];
  while (index >= 0 && index < f.count()) {
    const k = f.k(index);
    const s = f.s(index);
    const pns = f.indexBefore(SW_T_NON_SPACE, index);
    if (k === SW_IDENT && pns >= 0 && f.k(pns) !== SW_OP) {
      if (removeSelfKeyword.length !== 0 && s === removeSelfKeyword && f.isEnabled()) {
        const ni = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
        if (ni >= 0 && f.op(ni, ".", SW_OP_INFIX)) {
          const nn = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, ni);
          if (nn >= 0 && f.k(nn) === SW_IDENT) {
            const ex = swNCopy(names);
            swNUnionInto(ex, locals);
            swRemoveSelf(f, index, ex, [], false);
            index++;
            continue;
          }
        }
      }
      const nx = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
      if (nx >= 0 && ((f.tok(nx, SW_DELIM, ":") && scopeIndexStack.length !== 0) || f.ks(nx, SW_OP, "."))) {
        index++;
        continue;
      }
      const name = swUnescaped(s);
      if (name !== "_" && (hasDecl || !isConditional)) {
        swNAdd(locals, name);
      }
      let brokeInner = false;
      while (true) {
        const nextIndex = f.indexAfter(SW_T_NON_SPACE, index);
        if (nextIndex < 0) {
          break;
        }
        const tk = f.k(nextIndex);
        const ts = f.s(nextIndex);
        if (swIsStartOfStatement(f, nextIndex)) {
          swNUnionInto(names, locals);
        }
        const rsk = removeSelfKeyword.length !== 0 && swIsConditionalStatement(f, nextIndex) ? removeSelfKeyword : "";
        const include = locals;
        let isScope = false;
        if (tk === SW_KEYWORD && (ts === "is" || ts === "as" || ts === "try" || ts === "await")) {
          index = nextIndex;
          continue;
        }
        if (tk === SW_IDENT && rsk.length !== 0 && ts === rsk && f.isEnabled()) {
          swRemoveSelf(f, nextIndex, names, include, onlyLocal);
          index = nextIndex;
          continue;
        }
        if (
          tk === SW_START &&
          (ts === "<" || ts === "[" || ts === "(" || swIsStringDelimiter(tk, ts) || swIsStartOfClosure(f, nextIndex))
        ) {
          isScope = true;
          const endIndex = swEndOfScope(f, nextIndex);
          if (endIndex < 0) {
            swSelfFatal(f, c, "Expected end of scope", nextIndex);
            return index;
          }
          if (rsk.length !== 0 && ts !== "{") {
            let i = endIndex - 1;
            // nextIndex >= 0.
            while (i > nextIndex && i > 0) {
              if (f.tok(i, SW_END, "}")) {
                const b = f.indexOfBefore(SW_START, "{", 0, i);
                if (b >= 0) {
                  i = b;
                }
              } else if (f.k(i) === SW_IDENT && f.s(i) === rsk && f.isEnabled()) {
                swRemoveSelf(f, i, names, include, onlyLocal);
              }
              i--;
            }
            index = swEndOfScope(f, nextIndex);
          } else {
            index = endIndex;
          }
        }
        if (isScope || tk === SW_NUMBER || tk === SW_IDENT) {
          if (nextIndex > index) {
            index = nextIndex;
          }
          const bi = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
          if (bi >= 0 && swIsStartOfClosure(f, bi)) {
            continue;
          }
          let cont = false;
          if (bi >= 0) {
            const bk = f.k(bi);
            const bs = f.s(bi);
            cont =
              (bk === SW_OP && (f.a(bi) === SW_OP_INFIX || f.a(bi) === SW_OP_POSTFIX)) ||
              f.kw(bi, "is") ||
              f.kw(bi, "as") ||
              f.tok(bi, SW_DELIM, ",") ||
              (bk === SW_START && (bs === "[" || bs === "("));
          }
          if (!cont) {
            swNUnionInto(names, locals);
            return index;
          }
          continue;
        }
        if (tk === SW_KEYWORD && ts === "switch") {
          const braceIndex = f.indexOfAfter(SW_START, "{", 0, nextIndex);
          const endIndex = braceIndex >= 0 ? swEndOfScope(f, braceIndex) : -1;
          if (endIndex < 0) {
            swNUnionInto(names, locals);
            return index;
          }
          index = endIndex;
          continue;
        }
        if (tk === SW_KEYWORD && (ts === "let" || ts === "var")) {
          swNUnionInto(names, locals);
          declarationIndex = nextIndex;
          hasDecl = true;
          index = nextIndex;
          brokeInner = true;
          break;
        }
        if (tk === SW_KEYWORD || (tk === SW_START && (ts === "{" || ts === ":")) || (tk === SW_END && ts === "}")) {
          swNUnionInto(names, locals);
          return index;
        }
        if (tk === SW_END && ts === ")") {
          let scopeIndex = -1;
          const sl = toI32(scopeIndexStack.length);
          if (sl > 0) {
            scopeIndex = scopeIndexStack[sl - 1];
            swPopLast(scopeIndexStack);
          }
          if (hasDecl && declarationIndex > scopeIndex) {
            hasDecl = false;
          }
        } else if (tk === SW_DELIM && ts === ",") {
          const sl = toI32(scopeIndexStack.length);
          const top = sl > 0 ? scopeIndexStack[sl - 1] : -1;
          if (hasDecl && declarationIndex >= top) {
            hasDecl = false;
          }
          index = nextIndex;
          swNUnionInto(names, locals);
          brokeInner = true;
          break;
        } else if (tk === SW_LINEBREAK || (tk === SW_END && ts === "*/")) {
          f.updateEnablement(nextIndex);
        }
        index = nextIndex;
      }
      if (!brokeInner) {
        // inner loop ran out of tokens
      }
    } else if (k === SW_KEYWORD && (s === "let" || s === "var")) {
      declarationIndex = index;
      hasDecl = true;
    } else if (k === SW_START && s === "(") {
      if (hasDecl) {
        scopeIndexStack.push(index);
      } else {
        const endIndex = f.indexOfAfter(SW_END, ")", 0, index);
        if (endIndex < 0) {
          swSelfFatal(f, c, "Expected )", index);
          return index;
        }
        let found = false;
        for (let j = index; j < endIndex; j++) {
          if (f.kw(j, "let") || f.kw(j, "var")) {
            found = true;
            break;
          }
        }
        if (!found) {
          index = endIndex;
        } else {
          scopeIndexStack.push(index);
        }
      }
    } else if (k === SW_START && s === "{") {
      const e = swIsStartOfClosure(f, index) ? swEndOfScope(f, index) : -1;
      if (e < 0) {
        index--;
        swNUnionInto(names, locals);
        return index;
      }
      index = e;
    } else if (k === SW_LINEBREAK || (k === SW_END && s === "*/")) {
      f.updateEnablement(index);
    }
    index = add32(index, 1);
  }
  return index;
};

const swIsPropertyAccessorTok = (f: SwFormatter, i: i32, subscriptOnly: boolean): boolean => {
  const k = f.k(i);
  if (k !== SW_IDENT && k !== SW_KEYWORD) {
    return false;
  }
  const s = f.s(i);
  if (s === "get" || s === "set" || s === "_read" || s === "_modify") {
    return true;
  }
  return !subscriptOnly && (s === "willSet" || s === "didSet" || s === "init");
};

/** Whether the scope stack's top is the token (k, s). */
const swScopeTopIs = (scopeK: i32[], scopeS: string[], k: i32, s: string): boolean => {
  const j = toI32(scopeK.length) - 1;
  return j >= 0 && j < scopeK.length && j < scopeS.length && scopeK[j] === k && scopeS[j] === s;
};

/** Whether the scope stack's top is not the sentinel (a space token). */
const swScopeTopNotSpace = (scopeK: i32[]): boolean => {
  const j = toI32(scopeK.length) - 1;
  return j >= 0 && j < scopeK.length && scopeK[j] !== SW_SPACE;
};

/** Pops the scope stack's four parallel arrays. */
const swPopScope = (scopeTok: i32[], scopeK: i32[], scopeS: string[], scopeDyn: string[][]): void => {
  swPopLast(scopeTok);
  swPopLast(scopeK);
  swPopLast(scopeS);
  swPopLast(scopeDyn);
};

/** Whether the innermost closure does not allow implicit self (false outside closures). */
const swClosureDisallows = (c: SwSelfCtx): boolean => {
  const ca = c.closAllows;
  const cl = toI32(ca.length) - 1;
  return cl >= 0 && cl < ca.length && !ca[cl];
};

/** processAccessors(_:for:at:...). */
const swProcessAccessors = (
  f: SwFormatter,
  c: SwSelfCtx,
  subscriptOnly: boolean,
  name: string,
  localNames0: string[],
  dyn: boolean,
  cos: boolean,
): void => {
  let found = false;
  const localNames = swNCopy(localNames0);
  while (!c.dead) {
    let nextIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, c.idx);
    if (nextIndex < 0) {
      break;
    }
    const isAttr = swIsAttribute(f, nextIndex);
    if (!isAttr && !swIsPropertyAccessorTok(f, nextIndex, subscriptOnly)) {
      break;
    }
    const startIndex = f.indexOfAfter(SW_START, "{", 0, nextIndex);
    if (startIndex < 0) {
      break;
    }
    if (isAttr) {
      const si = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, nextIndex);
      const e = si >= 0 && f.tok(si, SW_START, "(") ? swEndOfScope(f, si) : -1;
      if (e < 0) {
        break;
      }
      c.idx = e;
      continue;
    }
    found = true;
    c.idx = add32(startIndex, 1);
    const ps = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, nextIndex);
    const vt = ps >= 0 && f.tok(ps, SW_START, "(") ? f.indexAfter(SW_T_IDENTIFIER, ps) : -1;
    if (vt >= 0) {
      swNAdd(localNames, swUnescapedTok(f, vt));
    } else {
      while (swIsAttribute(f, nextIndex)) {
        const e = swEndOfAttribute(f, nextIndex);
        if (e < 0) {
          break;
        }
        const x = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, e);
        if (x < 0) {
          break;
        }
        nextIndex = x;
      }
      const ts = f.s(nextIndex);
      if (ts === "get" || ts === "_read" || ts === "_modify") {
        swNAdd(localNames, name);
      } else if (ts === "set" || ts === "init") {
        swNAdd(localNames, name);
        swNAdd(localNames, "newValue");
      } else if (ts === "willSet") {
        swNAdd(localNames, "newValue");
      } else if (ts === "didSet") {
        swNAdd(localNames, "oldValue");
      }
    }
    swProcessBody(f, c, localNames, dyn, cos, false, false);
    c.idx = sub32(c.idx, 1);
  }
  if (c.dead) {
    return;
  }
  if (found) {
    const e = f.indexOfAfter(SW_END, "}", 0, c.idx);
    if (e < 0) {
      swSelfFatal(f, c, "Expected }", c.idx);
      return;
    }
    c.idx = add32(e, 1);
  } else {
    c.idx = add32(c.idx, 1);
    swNAdd(localNames, name);
    swProcessBody(f, c, localNames, dyn, cos, false, false);
  }
};

/** processFunction(at:...). */
const swProcessFunction = (f: SwFormatter, c: SwSelfCtx, localNames0: string[], dyn: boolean, cos: boolean): void => {
  const funcKeywordIndex = c.idx;
  const startTok = f.s(c.idx);
  const localNames = swNCopy(localNames0);
  const startIndex = f.indexOfAfter(SW_START, "(", 0, c.idx);
  const endIndex = startIndex >= 0 ? f.indexOfAfter(SW_END, ")", 0, startIndex) : -1;
  if (endIndex < 0) {
    c.idx = add32(c.idx, 1);
    return;
  }
  c.idx = startIndex;
  while (c.idx < endIndex) {
    const en = f.indexAfter(SW_T_IDENTIFIER, c.idx);
    const nx = en >= 0 ? f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, en) : -1;
    if (nx < 0) {
      break;
    }
    if (f.k(nx) === SW_IDENT && f.s(nx) !== "_") {
      swNAdd(localNames, swUnescaped(f.s(nx)));
    } else if (f.tok(nx, SW_DELIM, ":")) {
      if (f.k(en) === SW_IDENT && f.s(en) !== "_") {
        swNAdd(localNames, swUnescaped(f.s(en)));
      }
    }
    const cm = f.indexOfAfter(SW_DELIM, ",", 0, c.idx);
    c.idx = cm >= 0 ? cm : endIndex;
  }
  let bodyStartIndex = -1;
  const fd = swParseFunctionDeclaration(f, funcKeywordIndex);
  if (fd !== null) {
    if (fd.bodyStart < 0) {
      c.idx = fd.end();
      return;
    }
    bodyStartIndex = fd.bodyStart;
  } else {
    const v = swIndexInWhere(f, add32(endIndex, 1), f.count(), (g, j) => {
      const k = g.k(j);
      if (k === SW_START && g.s(j) === "{") {
        return true;
      }
      if (k === SW_KEYWORD) {
        const s = g.s(j);
        if (s === "throws" || s === "rethrows" || s === "where" || s === "is" || s === "repeat") {
          return false;
        }
        return !s.startsWith("@");
      }
      return false;
    });
    if (v < 0 || !f.tok(v, SW_START, "{")) {
      return;
    }
    bodyStartIndex = v;
  }
  if (startTok === "subscript") {
    c.idx = bodyStartIndex;
    swProcessAccessors(f, c, true, "", localNames, dyn, cos);
  } else {
    c.idx = add32(bodyStartIndex, 1);
    swProcessBody(f, c, localNames, dyn, cos, false, startTok === "init");
  }
};

const swSupportedSelfCapture = (s: string): boolean =>
  s === "self" ||
  s === "unowned self" ||
  s === "unowned(safe) self" ||
  s === "unowned(unsafe) self" ||
  s === "weak self";

/** Splits tokens lo..<hi by `,` delimiters, omitting empty pieces: answers [lo0, hi0, lo1, hi1, ...]. */
const swSplitByComma = (f: SwFormatter, lo: i32, hi: i32, out: i32[]): void => {
  let st = lo;
  for (let j = lo; j <= hi && j < 2147483647; j++) {
    if (j === hi || f.tok(j, SW_DELIM, ",")) {
      if (j > st) {
        out.push(st);
        out.push(j);
      }
      st = j + 1;
    }
  }
};

const swTrimWs = (s: string): string => {
  let a = 0;
  let b = toI32(s.length);
  while (
    a < b &&
    (s.charCodeAt(a) === 32 || s.charCodeAt(a) === 9 || s.charCodeAt(a) === 10 || s.charCodeAt(a) === 13)
  ) {
    a++;
  }
  while (b > a && b > 0 && b <= s.length) {
    const c = s.charCodeAt(b - 1);
    if (!(c === 32 || c === 9 || c === 10 || c === 13)) {
      break;
    }
    b--;
  }
  return s.substring(a, b);
};

/** processBody(at:...). */
const swProcessBody = (
  f: SwFormatter,
  c: SwSelfCtx,
  inputLocalNames: string[],
  dyn: boolean,
  classOrStatic0: boolean,
  isTypeRoot: boolean,
  isInit: boolean,
): void => {
  if (c.dead) {
    return;
  }
  const n = f.count();
  const ci = c.idx;
  const isWhereClause = ci > 0 && f.kw(ci - 1, "where");
  const isCaseClause = !isWhereClause && ci > 0 && swIsSwitchCaseOrDefault(f.k(ci - 1), f.s(ci - 1));
  // Check if scope actually includes self before we waste a bunch of time
  {
    const st: string[] = [];
    for (let i = c.idx; i < n; i++) {
      const k = f.k(i);
      const s = f.s(i);
      if (k === SW_IDENT && s === c.selfKw) {
        break;
      }
      if (k === SW_START) {
        if (s === "{" && isWhereClause && st.length === 0) {
          return;
        }
        if (s === "{" || s === "(" || s === "[" || s === ":") {
          st.push(s);
        }
      } else if (k === SW_END && (s === "}" || s === ")" || s === "]" || s === "case" || s === "default")) {
        if (st.length === 0 || (st.length === 1 && st[0] === ":" && isCaseClause)) {
          c.idx = add32(i, 1);
          return;
        }
        swPopLast(st);
      }
    }
  }
  const inClosureDisallowingImplicitSelf = !c.staticSelf && swClosureDisallows(c);
  const localNames = swNCopy(inputLocalNames);
  if (!isTypeRoot) {
    let i = c.idx;
    let cos = false;
    while (f.has(i)) {
      const k = f.k(i);
      const s = f.s(i);
      if (k === SW_KEYWORD && s === "import") {
        const ni = f.indexAfter(SW_T_IDENTIFIER, i);
        if (ni < 0) {
          swSelfFatal(f, c, "Expected identifier", i);
          return;
        }
        i = ni;
      } else if (k === SW_KEYWORD && (s === "class" || s === "static")) {
        cos = true;
      } else if (k === SW_KEYWORD && s === "repeat") {
        if (f.nextIs(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i, SW_START, "{")) {
          const ni = f.indexOfAfter(SW_KEYWORD, "while", 0, i);
          if (ni < 0) {
            swSelfFatal(f, c, "Expected while", i);
            return;
          }
          i = ni;
        }
      } else if (k === SW_KEYWORD && (s === "if" || s === "for" || s === "while")) {
        const ni = f.indexOfAfter(SW_START, "{", 0, i);
        if (ni < 0) {
          swSelfFatal(f, c, "Expected {", i);
          return;
        }
        i = ni;
        continue;
      } else if (k === SW_KEYWORD && s === "switch") {
        const ni = f.indexOfAfter(SW_START, "{", 0, i);
        if (ni < 0) {
          swSelfFatal(f, c, "Expected {", i);
          return;
        }
        let endIndex = f.indexAfter(SW_T_END_OF_SCOPE, ni);
        if (endIndex < 0) {
          swSelfFatal(f, c, "Expected }", i);
          return;
        }
        while (!f.tok(endIndex, SW_END, "}")) {
          const n2 = f.indexOfAfter(SW_START, ":", 0, endIndex);
          if (n2 < 0) {
            swSelfFatal(f, c, "Expected :", i);
            return;
          }
          const e2 = f.indexAfter(SW_T_END_OF_SCOPE, n2);
          if (e2 < 0) {
            swSelfFatal(f, c, "Expected end of scope", i);
            return;
          }
          endIndex = e2;
        }
        i = endIndex;
      } else if (k === SW_KEYWORD && (s === "var" || s === "let")) {
        i = add32(i, 1);
        const removeSelf = !dyn && ((c.staticSelf && cos) || (!c.staticSelf && !inClosureDisallowingImplicitSelf));
        i = swProcessDeclaredVariables(f, c, i, localNames, removeSelf ? c.selfKw : "", true);
        if (c.dead) {
          return;
        }
      } else if (k === SW_KEYWORD && s === "func") {
        const nt = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
        if (nt >= 0) {
          swNAdd(localNames, swUnescapedTok(f, nt));
        }
      } else if (k === SW_START && (s === "(" || s === "#if" || s === ":" || s === "/*" || s === "//")) {
        // break
      } else if (k === SW_START) {
        cos = false;
        const e = swEndOfScope(f, i);
        i = e >= 0 ? e : sub32(n, 1);
      } else if (k === SW_END && (s === "}" || s === "case" || s === "default")) {
        break;
      } else if (k === SW_LINEBREAK || (k === SW_END && s === "*/")) {
        f.updateEnablement(i);
      }
      i = add32(i, 1);
    }
  }
  // Remove `self`
  let lastKeyword = "";
  let lastKeywordIndex = 0;
  let classOrStatic = classOrStatic0;
  // scope stack: token index (-1 for the sentinel) and dynamic member types
  const scopeTok: i32[] = [-1];
  const scopeK: i32[] = [SW_SPACE];
  const scopeS: string[] = [""];
  const scopeDyn: string[][] = [[]];
  while (f.has(c.idx) && !c.dead) {
    const index = c.idx;
    const k = f.k(index);
    const s = f.s(index);
    const isKw = k === SW_KEYWORD;
    if (isKw && (s === "is" || s === "as" || s === "try" || s === "await")) {
      // break
    } else if (k === SW_IDENT && s === "unsafe" && (lastKeyword === "for" || swIsUnsafeExpression(f, index))) {
      // break
    } else if (isKw && (s === "init" || s === "subscript" || (s === "func" && lastKeyword !== "import"))) {
      lastKeyword = "";
      const eff = c.staticSelf && !isTypeRoot ? false : classOrStatic;
      swProcessFunction(f, c, localNames, dyn, eff);
      classOrStatic = false;
      continue;
    } else if (isKw && s === "static") {
      if (!isTypeRoot) {
        swSelfFatal(f, c, "The static modifier is not valid outside a type body", index);
        return;
      }
      classOrStatic = true;
    } else if (isKw && s === "class" && swNextNotIdent(f, index)) {
      if (!f.lastIs(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index, SW_DELIM, ":")) {
        if (!isTypeRoot) {
          swSelfFatal(f, c, "The class modifier is not valid outside a type body", index);
          return;
        }
        classOrStatic = true;
      }
    } else if ((isKw && s === "where" && lastKeyword === "protocol") || (isKw && s === "protocol")) {
      const si = f.indexOfAfter(SW_START, "{", 0, index);
      if (si >= 0) {
        const e = swEndOfScope(f, si);
        if (e >= 0) {
          c.idx = e;
        }
      }
    } else if (
      isKw &&
      (s === "extension" ||
        s === "struct" ||
        s === "enum" ||
        s === "class" ||
        s === "actor" ||
        (s === "where" &&
          (lastKeyword === "extension" ||
            lastKeyword === "struct" ||
            lastKeyword === "enum" ||
            lastKeyword === "class" ||
            lastKeyword === "actor")))
    ) {
      if (!f.lastIs(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index, SW_KEYWORD, "import")) {
        const scopeStart = f.indexOfAfter(SW_START, "{", 0, index);
        const ni = f.indexAfter(SW_T_IDENTIFIER, index);
        if (scopeStart < 0 || ni < 0) {
          return;
        }
        const name = f.s(ni);
        const mods = swModifiersForDeclaration(f, index);
        let usingDyn = false;
        const mIdx = mods.idx;
        const mNames = mods.names;
        for (let q = 0; q < mIdx.length && q < mNames.length; q++) {
          const mn = mNames[q];
          if (f.s(mIdx[q]) === "@dynamicMemberLookup" || mn === "@dynamicMemberLookup") {
            usingDyn = true;
          }
        }
        // scopeDyn always holds its sentinel.
        const top = toI32(scopeDyn.length) - 1;
        if (top < 0 || top >= scopeDyn.length) {
          fault();
          return;
        }
        const topDyn = scopeDyn[top];
        if (usingDyn) {
          swNAdd(topDyn, name);
        } else if ((s === "extension" || lastKeyword === "extension") && swNHas(topDyn, name)) {
          usingDyn = true;
        }
        c.idx = add32(scopeStart, 1);
        c.typeNames.push(name);
        c.typeKws.push(s);
        swProcessBody(f, c, ["init"], usingDyn, classOrStatic, true, false);
        c.idx = sub32(c.idx, 1);
        swPopLast(c.typeNames);
        swPopLast(c.typeKws);
      }
    } else if (
      isKw &&
      s === "case" &&
      (lastKeyword === "if" || lastKeyword === "while" || lastKeyword === "guard" || lastKeyword === "for")
    ) {
      // break
    } else if (isKw && (s === "var" || s === "let")) {
      lastKeywordIndex = index;
      c.idx = add32(c.idx, 1);
      if (lastKeyword === "lazy") {
        while (true) {
          const ni = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, c.idx);
          if (ni < 0) {
            break;
          }
          const nk = f.k(ni);
          const ns = f.s(ni);
          if (nk === SW_KEYWORD && (ns === "as" || ns === "is" || ns === "try" || ns === "await")) {
            // keep going
          } else if (nk === SW_KEYWORD || f.tok(ni, SW_START, "{")) {
            break;
          }
          c.idx = ni;
        }
        lastKeyword = "";
      } else if (lastKeyword === "if" || lastKeyword === "while" || lastKeyword === "guard" || lastKeyword === "for") {
        const scopedNames = swNCopy(localNames);
        const removeSelf =
          !dyn && ((c.staticSelf && classOrStatic) || (!c.staticSelf && !inClosureDisallowingImplicitSelf));
        const guardDeclared: string[] = [];
        if (lastKeyword === "guard") {
          swProcessDeclaredVariables(f, c, c.idx, guardDeclared, "", false);
          if (c.dead) {
            return;
          }
        }
        c.idx = swProcessDeclaredVariables(f, c, c.idx, scopedNames, removeSelf ? c.selfKw : "", false);
        if (c.dead) {
          return;
        }
        while (true) {
          let sc = swCurrentScope(f, c.idx);
          if (sc < 0) {
            sc = f.has(c.idx) ? c.idx : -1;
          }
          if (sc < 0 || f.k(sc) !== SW_START) {
            break;
          }
          const scs = f.s(sc);
          if (!(scs === "[" || scs === "(" || swIsStringDelimiter(SW_START, scs))) {
            break;
          }
          const e = swEndOfScope(f, c.idx);
          if (e < 0) {
            break;
          }
          c.idx = add32(e, 1);
        }
        while (swScopeTopIs(scopeK, scopeS, SW_START, "(")) {
          swPopScope(scopeTok, scopeK, scopeS, scopeDyn);
        }
        let startIndex = f.tok(c.idx, SW_START, "{") ? c.idx : f.indexOfAfter(SW_START, "{", 0, c.idx);
        if (startIndex < 0) {
          swSelfFatal(f, c, "Expected {", c.idx);
          return;
        }
        while (swIsStartOfClosure(f, startIndex)) {
          const i2 = f.indexOfAfter(SW_END, "}", 0, startIndex);
          if (i2 < 0) {
            swSelfFatal(f, c, "Expected }", startIndex);
            return;
          }
          const j2 = f.indexOfAfter(SW_START, "{", 0, i2);
          if (j2 < 0) {
            swSelfFatal(f, c, "Expected {", i2);
            return;
          }
          startIndex = j2;
        }
        c.idx = add32(startIndex, 1);
        const bodyLocalNames =
          lastKeyword === "guard" ? swNMinus(localNames, swNMinus(guardDeclared, inputLocalNames)) : scopedNames;
        swProcessBody(f, c, bodyLocalNames, dyn, classOrStatic, false, isInit);
        c.idx = sub32(c.idx, 1);
        lastKeyword = "";
      } else {
        lastKeyword = s;
      }
      classOrStatic = false;
    } else if (
      (isKw && s === "where" && lastKeyword === "in") ||
      (k === SW_START && s === "{" && lastKeyword === "in" && !swIsStartOfClosure(f, index))
    ) {
      lastKeyword = "";
      const ln = swNCopy(localNames);
      const keywordIndex = f.indexOfBefore(SW_KEYWORD, "in", 0, index);
      const prevKeywordIndex = keywordIndex >= 0 ? f.indexOfBefore(SW_KEYWORD, "for", 0, keywordIndex) : -1;
      const patternStart = prevKeywordIndex >= 0 ? swStartOfForLoopPattern(f, prevKeywordIndex) : -1;
      if (patternStart < 0) {
        swSelfFatal(f, c, "Expected for keyword", index);
        return;
      }
      for (let j = patternStart; j < keywordIndex; j++) {
        if (f.k(j) === SW_IDENT && f.s(j) !== "_") {
          swNAdd(ln, swUnescaped(f.s(j)));
        }
      }
      c.idx = add32(c.idx, 1);
      swProcessBody(f, c, ln, dyn, classOrStatic, false, isInit);
      continue;
    } else if (isKw && s === "while" && lastKeyword === "repeat") {
      lastKeyword = "";
    } else if ((k === SW_START && s === "#if") || (isKw && s === "#elseif")) {
      if (k === SW_START) {
        scopeTok.push(index);
        scopeK.push(k);
        scopeS.push(s);
        scopeDyn.push([]);
      }
      const lb = f.indexAfter(SW_T_LINEBREAK, index);
      if (lb >= 0) {
        c.idx = lb;
      }
    } else if (isKw && s === "repeat" && !f.nextIs(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index, SW_START, "{")) {
      // pack expansion
    } else if (isKw && !swStrIsMacro(s)) {
      lastKeyword = s;
      lastKeywordIndex = index;
    } else if (k === SW_START && (s === "/*" || s === "//")) {
      const e = swEndOfScope(f, index);
      c.idx = e >= 0 ? e : sub32(n, 1);
      f.updateEnablement(c.idx);
    } else if (k === SW_START && (swIsStringDelimiter(k, s) || s === "[" || s === "(")) {
      scopeTok.push(index);
      scopeK.push(k);
      scopeS.push(s);
      scopeDyn.push([]);
    } else if (k === SW_START && s === ":") {
      lastKeyword = "";
    } else if (k === SW_START && s === "{" && lastKeyword === "catch") {
      lastKeyword = "";
      const ln = swNCopy(localNames);
      swNAdd(ln, "error");
      c.idx = add32(c.idx, 1);
      swProcessBody(f, c, ln, dyn, classOrStatic, false, isInit);
      continue;
    } else if (k === SW_START && s === "{" && isWhereClause && scopeK.length === 1) {
      return;
    } else if (k === SW_START && s === "{" && lastKeyword === "switch" && scopeK.length === 1) {
      lastKeyword = "";
      c.idx = add32(c.idx, 1);
      while (f.has(c.idx) && !c.dead) {
        const t = c.idx;
        c.idx = add32(c.idx, 1);
        if (f.tok(t, SW_END, "case") || f.tok(t, SW_END, "default")) {
          swProcessBody(f, c, localNames, dyn, classOrStatic, false, isInit);
          c.idx = sub32(c.idx, 1);
        } else if (f.tok(t, SW_END, "}")) {
          break;
        }
      }
    } else if (
      k === SW_START &&
      s === "{" &&
      (lastKeyword === "for" ||
        lastKeyword === "where" ||
        lastKeyword === "if" ||
        lastKeyword === "else" ||
        lastKeyword === "while" ||
        lastKeyword === "do" ||
        lastKeyword === "repeat")
    ) {
      let skip = false;
      if (lastKeyword !== "repeat") {
        const scopeIndex = f.indexBefore(SW_T_START_OF_SCOPE, index);
        if (scopeIndex >= 0 && scopeIndex > lastKeywordIndex) {
          const e = swEndOfScope(f, index);
          c.idx = e >= 0 ? e : sub32(n, 1);
          skip = true;
        } else {
          lastKeyword = "";
        }
      }
      if (!skip) {
        c.idx = add32(c.idx, 1);
        swProcessBody(f, c, localNames, dyn, classOrStatic, false, isInit);
        continue;
      }
    } else if (k === SW_START && s === "{" && lastKeyword === "var" && !swIsStartOfClosure(f, index)) {
      lastKeyword = "";
      let prevIndex = sub32(index, 1);
      let name = "";
      let hasName = false;
      while (prevIndex >= 0 && !f.kw(prevIndex, "var")) {
        if (f.k(prevIndex) === SW_IDENT) {
          name = f.s(prevIndex);
          hasName = true;
        }
        prevIndex--;
      }
      const mods = swModifiersForDeclaration(f, lastKeywordIndex);
      let cos2 = false;
      for (const m of mods.names) {
        if (m === "static" || m === "class") {
          cos2 = true;
        }
      }
      if (hasName && (cos2 || !c.staticSelf)) {
        swProcessAccessors(f, c, false, name, localNames, dyn, cos2);
      } else {
        const e = swEndOfScope(f, index);
        c.idx = add32(e >= 0 ? e : index, 1);
      }
      continue;
    } else if (k === SW_START && s === "{" && (lastKeyword === "var" || swIsStartOfClosure(f, index))) {
      if (lastKeyword === "var") {
        lastKeyword = "";
      }
      swProcessClosure(f, c, index, localNames, dyn, classOrStatic, isInit);
      if (c.dead) {
        return;
      }
    } else if (k === SW_START) {
      const e = swEndOfScope(f, index);
      c.idx = e >= 0 ? e : sub32(n, 1);
    } else if (k === SW_IDENT && s === c.selfKw) {
      if (f.isEnabled() && !isTypeRoot && !dyn && (!c.staticSelf || classOrStatic)) {
        const dotIndex = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, index);
        if (
          dotIndex >= 0 &&
          f.op(dotIndex, ".", SW_OP_INFIX) &&
          f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, dotIndex) >= 0
        ) {
          if (!swClosureDisallows(c)) {
            swRemoveSelf(f, index, localNames, [], false);
          }
        }
      }
    } else if (k === SW_IDENT || (isKw && swStrIsMacro(s))) {
      let isTypeOf = false;
      if (k === SW_IDENT && s === "type") {
        const pi = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
        isTypeOf =
          pi >= 0 && f.tok(pi, SW_START, "(") && f.nextIs(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, pi, SW_IDENT, "of");
      }
      if (!isTypeOf && f.isEnabled() && !isTypeRoot && s === "lazy") {
        lastKeyword = "lazy";
        lastKeywordIndex = index;
      }
    } else if (k === SW_END && (s === "case" || s === "default")) {
      return;
    } else if (k === SW_END) {
      if (s === "#endif") {
        while (true) {
          const j = toI32(scopeK.length) - 1;
          if (j < 0 || j >= scopeK.length || j >= scopeS.length || scopeK[j] === SW_SPACE) {
            break;
          }
          const ws = scopeS[j];
          const wk = scopeK[j];
          swPopScope(scopeTok, scopeK, scopeS, scopeDyn);
          if (!(wk === SW_START && ws === "#if")) {
            break;
          }
        }
      } else if (swScopeTopNotSpace(scopeK)) {
        swPopScope(scopeTok, scopeK, scopeS, scopeDyn);
      } else {
        c.idx = add32(c.idx, 1);
        return;
      }
    } else if (k === SW_LINEBREAK) {
      f.updateEnablement(index);
    }
    c.idx = add32(c.idx, 1);
  }
};

/** next(.nonSpaceOrCommentOrLinebreak, after:)?.isIdentifier == false. */
const swNextNotIdent = (f: SwFormatter, i: i32): boolean => {
  const j = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
  return j >= 0 && f.k(j) !== SW_IDENT;
};

/** The closure case of processBody. */
const swProcessClosure = (
  f: SwFormatter,
  c: SwSelfCtx,
  index: i32,
  localNames: string[],
  dyn: boolean,
  classOrStatic: boolean,
  isInit: boolean,
): void => {
  const ki = f.indexAfter(SW_T_KEYWORD, index);
  const inIndex = ki >= 0 && f.kw(ki, "in") ? ki : -1;
  let capLo = -1;
  let capHi = -1;
  let parLo = -1;
  let parHi = -1;
  let done = false;
  if (inIndex >= 0) {
    const cls = swIndexInWhere(f, add32(index, 1), inIndex, (g, j) => {
      const k = g.k(j);
      return k !== SW_SPACE && k !== SW_LINEBREAK && !g.isComment(j) && !swIsAttribute(g, j);
    });
    if (cls >= 0 && f.tok(cls, SW_START, "[")) {
      const cle = swEndOfScope(f, cls);
      if (cle >= 0) {
        capLo = add32(cls, 1);
        capHi = cle;
        parLo = add32(cle, 1);
        parHi = inIndex;
        done = true;
      }
    }
    if (!done) {
      const ft = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
      if (ft >= 0 && swIsInClosureArguments(f, ft)) {
        parLo = ft;
        parHi = inIndex;
      }
    }
  }
  const capEntries: i32[] = [];
  if (capLo >= 0) {
    swSplitByComma(f, capLo, capHi, capEntries);
  }
  const parEntries: i32[] = [];
  if (parLo >= 0) {
    swSplitByComma(f, parLo, parHi, parEntries);
  }
  let selfCapture = "";
  let hasSelfCapture = false;
  const capText: string[] = [];
  // The entries come in [lo, hi) pairs.
  for (let q = 0; q >= 0 && q < capEntries.length; ) {
    const q1 = q + 1;
    if (q1 >= capEntries.length) {
      fault();
      return;
    }
    const t = swTrimWs(f.text(capEntries[q], capEntries[q1]));
    q = q1 + 1;
    capText.push(t);
    if (!hasSelfCapture && swSupportedSelfCapture(t)) {
      selfCapture = t;
      hasSelfCapture = true;
    }
  }
  const closureLocalNames = swNCopy(localNames);
  const all: i32[] = [];
  // capText holds one text per pair.
  for (let q = 0; q >= 0 && q < capEntries.length; ) {
    const q1 = q + 1;
    const qt = toI32(q / 2);
    if (q1 >= capEntries.length || qt >= capText.length) {
      fault();
      return;
    }
    const lo = capEntries[q];
    const hi = capEntries[q1];
    if (!(hasSelfCapture && capText[qt] === selfCapture)) {
      all.push(lo);
      all.push(hi);
    }
    q = q1 + 1;
  }
  for (const x of parEntries) {
    all.push(x);
  }
  for (let q = 0; q >= 0 && q < all.length; ) {
    const q1 = q + 1;
    if (q1 >= all.length) {
      fault();
      return;
    }
    const lo = all[q];
    const hi = all[q1];
    q = q1 + 1;
    let li = -1;
    for (let j = lo; j < hi; j++) {
      if (f.k(j) === SW_IDENT && !swOwnership(f.s(j))) {
        li = j;
        break;
      }
    }
    if (li < 0) {
      continue;
    }
    const name = f.s(li);
    if (name === "_") {
      continue;
    }
    swNAdd(closureLocalNames, name);
    if (name.startsWith("$")) {
      swNAdd(closureLocalNames, name.substring(1));
    }
  }
  c.closAllows.push(false);
  c.closCapture.push(selfCapture);
  c.idx = add32(inIndex >= 0 ? inIndex : index, 1);
  swProcessBody(f, c, closureLocalNames, dyn, c.staticSelf ? false : classOrStatic, false, isInit);
  c.idx = sub32(c.idx, 1);
  swPopLast(c.closAllows);
  swPopLast(c.closCapture);
};

/** addOrRemoveSelf(static:). */
const swAddOrRemoveSelf = (f: SwFormatter, staticSelf: boolean): void => {
  const c = new SwSelfCtx();
  c.staticSelf = staticSelf;
  c.selfKw = staticSelf ? "Self" : "self";
  swProcessBody(f, c, [], false, false, false, false);
};

/** redundantSelf. */
export const swRuleRedundantSelf = (f: SwFormatter): void => {
  swAddOrRemoveSelf(f, false);
};

/** redundantStaticSelf. */
export const swRuleRedundantStaticSelf = (f: SwFormatter): void => {
  swAddOrRemoveSelf(f, true);
};
