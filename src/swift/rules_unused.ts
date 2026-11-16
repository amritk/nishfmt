// SwiftFormat's unusedArguments rule (stripUnusedArguments always) and
// removeUsed(from:with:locals:in:).
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { swIsUnsafeExpression } from "./expr";
import { SwFormatter } from "./formatter";
import { SwFuncArg, swParseFunctionDeclaration, swUnescaped } from "./funcdecl";
import { swStartOfModifiers } from "./modifiers";
import {
  swConditionalBranches,
  swCurrentScope,
  swEndOfAttribute,
  swEndOfScope,
  swIsAttribute,
  swIsConditionalAssignment,
  swIsConditionalStatement,
  swIsStartOfClosure,
  swIsStartOfStatement,
  swParseType,
  swStartOfForLoopPattern,
  swStartOfScope,
} from "./parsing";
import { SW_SCOPE_DICTIONARY, swScopeType } from "./parsing2";
import {
  SW_DELIM,
  SW_END,
  SW_IDENT,
  SW_KEYWORD,
  SW_OP,
  SW_OP_INFIX,
  SW_SPACE,
  SW_START,
  SW_T_COMMENT,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
  SW_T_NON_SPACE_OR_LINEBREAK,
  SW_T_START_OF_SCOPE,
  swStrIsMacro,
} from "./token";

class SwRUState {
  isDeclaration: boolean = false;
  wasDeclaration: boolean = false;
  isConditional: boolean = false;
  isGuard: boolean = false;
  locals: string[];
  temp: string[];
  constructor() {
    this.locals = [];
    this.temp = [];
  }
}

const swRemoveAt = (names: string[], data: i32[], q: i32): void => {
  const n = toI32(names.length);
  for (let j = q; j + 1 < n; j++) {
    names[j] = names[j + 1];
    data[j] = data[j + 1];
  }
  names.pop();
  data.pop();
};

const swPushLocals = (st: SwRUState, names: string[], data: i32[]): void => {
  if (st.isDeclaration && st.isConditional) {
    for (const name of st.temp) {
      const q = names.indexOf(name);
      if (q >= 0 && st.locals.indexOf(name) < 0) {
        swRemoveAt(names, data, q);
      }
    }
  }
  st.wasDeclaration = st.isDeclaration;
  st.isDeclaration = false;
  for (const name of st.temp) {
    if (st.locals.indexOf(name) < 0) {
      st.locals.push(name);
    }
  }
  st.temp = [];
};

const swCopyNames = (a: string[]): string[] => {
  const out: string[] = [];
  for (const s of a) {
    out.push(s);
  }
  return out;
};

/** removeUsed(from:with:locals:in:); false after a fatal error. */
export const swRemoveUsed = (f: SwFormatter, names: string[], data: i32[], locals: string[], lo: i32, hi: i32): boolean => {
  const st = new SwRUState();
  st.locals = swCopyNames(locals);
  let i = lo;
  while (i < hi) {
    if (swIsStartOfStatement(f, i, null, false)) {
      const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
      if (!(p >= 0 && f.ks(p, SW_OP, "=")) && !(p >= 0 && swIsUnsafeExpression(f, p))) {
        swPushLocals(st, names, data);
        st.wasDeclaration = false;
      }
    }
    const k = f.k(i);
    const s = f.s(i);
    let brace = k === SW_START && s === "{";
    if (k === SW_KEYWORD && s === "guard") {
      st.isGuard = true;
    } else if (k === SW_KEYWORD && (s === "let" || s === "var" || s === "func" || s === "for")) {
      st.isDeclaration = true;
      let j = i;
      while (true) {
        const sc = f.indexOfBefore(SW_START, "(", 0, j);
        if (sc < 0) {
          break;
        }
        j = sc;
      }
      st.isConditional = swIsConditionalStatement(f, j);
    } else if (k === SW_IDENT) {
      const name = swUnescaped(s);
      const q = names.indexOf(name);
      if (q >= 0 && st.locals.indexOf(name) < 0) {
        const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
        const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
        let ok = p >= 0 && !f.ks(p, SW_OP, ".");
        if (ok && n >= 0 && f.tok(n, SW_DELIM, ":")) {
          const sos = swStartOfScope(f, i);
          ok = sos >= 0 && swScopeType(f, sos) === SW_SCOPE_DICTIONARY;
        }
        if (ok) {
          let temp = false;
          if (st.isDeclaration && n >= 0) {
            if ((f.tok(n, SW_DELIM, ",") && !st.isConditional) || f.tok(n, SW_END, ")") || f.op(n, "=", SW_OP_INFIX)) {
              temp = true;
            }
          }
          if (temp) {
            if (st.temp.indexOf(name) < 0) {
              st.temp.push(name);
            }
          } else {
            swRemoveAt(names, data, q);
            if (names.length === 0) {
              return true;
            }
          }
        }
      }
    } else if (k === SW_KEYWORD && (s === "if" || s === "switch")) {
      let endIndex = -1;
      if (swIsConditionalAssignment(f, i)) {
        const br = swConditionalBranches(f, i);
        if (br !== null && br.ends.length !== 0) {
          endIndex = br.ends[toI32(br.ends.length) - 1];
        }
      }
      if (endIndex >= 0) {
        if (!swRemoveUsed(f, names, data, st.locals, i + 1, endIndex)) {
          return false;
        }
      } else {
        brace = true;
      }
    } else if (k === SW_END && (s === "case" || s === "default")) {
      swPushLocals(st, names, data);
      const ci = f.indexOfAfter(SW_START, ":", 0, i);
      if (ci < 0) {
        f.fatalError("Expected :", i);
        return false;
      }
      const e = swEndOfScope(f, ci);
      if (e < 0) {
        f.fatalError("Expected end of case statement", ci);
        return false;
      }
      if (!swRemoveUsed(f, names, data, st.locals, i + 1, e)) {
        return false;
      }
      i = e - 1;
    } else if (f.op(i, "=", SW_OP_INFIX) || (k === SW_DELIM && s === ":") || (k === SW_START && s === ":") || (k === SW_KEYWORD && (s === "in" || s === "where"))) {
      st.wasDeclaration = st.isDeclaration;
      st.isDeclaration = false;
    } else if (k === SW_DELIM && s === ",") {
      const cs = swCurrentScope(f, i);
      if (cs >= 0 && (f.tok(cs, SW_START, "(") || f.tok(cs, SW_START, "[") || f.tok(cs, SW_START, "<"))) {
        // in a list
      } else if (st.isConditional) {
        if (st.isGuard && st.wasDeclaration) {
          swPushLocals(st, names, data);
        }
        st.wasDeclaration = false;
      } else {
        const w = st.wasDeclaration;
        swPushLocals(st, names, data);
        st.isDeclaration = w;
      }
    } else if (k === SW_DELIM && s === ";") {
      swPushLocals(st, names, data);
      st.wasDeclaration = false;
    }
    if (brace) {
      const endIndex = swEndOfScope(f, i);
      if (endIndex < 0) {
        f.fatalError("Expected }", i);
        return false;
      }
      if (swIsStartOfClosure(f, i)) {
        if (!swRemoveUsed(f, names, data, st.locals, i + 1, endIndex)) {
          return false;
        }
      } else if (st.isGuard) {
        if (!swRemoveUsed(f, names, data, st.locals, i + 1, endIndex)) {
          return false;
        }
        swPushLocals(st, names, data);
      } else {
        const prev = swCopyNames(st.locals);
        swPushLocals(st, names, data);
        if (!swRemoveUsed(f, names, data, st.locals, i + 1, endIndex)) {
          return false;
        }
        st.locals = prev;
      }
      st.isGuard = false;
      i = endIndex;
    }
    i++;
  }
  return true;
};

const swRange = (n: i32): i32[] => {
  const out: i32[] = [];
  for (let q = 0; q < n; q++) {
    out.push(q);
  }
  return out;
};

/** The function-argument pass. */
const swUnusedFunctionArguments = (f: SwFormatter): boolean => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (f.k(i) !== SW_KEYWORD) {
      continue;
    }
    const ks = f.s(i);
    if (!(ks === "func" || ks === "init" || ks === "subscript")) {
      continue;
    }
    const nt = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    const isOperator = ks === "subscript" || (ks === "func" && nt >= 0 && f.k(nt) === SW_OP);
    const decl = swParseFunctionDeclaration(f, i);
    if (decl === null || decl.bodyStart < 0) {
      continue;
    }
    const args: SwFuncArg[] = [];
    for (const a of decl.args) {
      if (a.internalLabel.length !== 0) {
        args.push(a);
      }
    }
    const argNames: string[] = [];
    for (const a of args) {
      argNames.push(a.internalLabel);
    }
    const data = swRange(toI32(args.length));
    if (!swRemoveUsed(f, argNames, data, [], decl.bodyStart + 1, decl.bodyEnd)) {
      return false;
    }
    const soa = swStartOfModifiers(f, i, true);
    for (let ai = soa; ai < i; ai++) {
      const as = f.s(ai);
      if (!(as === "@_lifetime" || as === "@lifetime")) {
        continue;
      }
      const e = swEndOfAttribute(f, ai);
      if (e < 0 || e <= ai) {
        continue;
      }
      for (let x = ai + 1; x <= e; x++) {
        if (f.k(x) === SW_IDENT) {
          const q = argNames.indexOf(swUnescaped(f.s(x)));
          if (q >= 0) {
            swRemoveAt(argNames, data, q);
          }
        }
      }
    }
    const todo: SwFuncArg[] = [];
    for (const q of data) {
      todo.push(args[q]);
    }
    for (const a of decl.args) {
      if (a.internalLabel.length === 0 && a.externalLabel.length === 0 && a.externalLabelIndex >= 0) {
        if (f.indexInType(SW_T_COMMENT, a.externalLabelIndex + 1, a.internalLabelIndex) < 0) {
          todo.push(a);
        }
      }
    }
    // sort by internalLabelIndex, descending
    for (let p = 1; p < toI32(todo.length); p++) {
      let q = p;
      while (q > 0 && todo[q - 1].internalLabelIndex < todo[q].internalLabelIndex) {
        const t = todo[q];
        todo[q] = todo[q - 1];
        todo[q - 1] = t;
        q--;
      }
    }
    for (const a of todo) {
      if (isOperator) {
        if (a.externalLabelIndex >= 0 && a.externalLabel.length === 0) {
          f.removeTokens(a.externalLabelIndex + 1, a.internalLabelIndex + 1);
        } else {
          f.replaceToken(a.internalLabelIndex, SW_IDENT, "_", 0);
        }
      } else if (a.externalLabelIndex >= 0 && a.externalLabel.length === 0) {
        f.removeTokens(a.externalLabelIndex + 1, a.internalLabelIndex + 1);
      } else if (a.externalLabelIndex < 0) {
        f.insert(SW_IDENT, "_", 0, a.internalLabelIndex + 1);
        f.insert(SW_SPACE, " ", 0, a.internalLabelIndex + 1);
      } else {
        f.replaceToken(a.internalLabelIndex, SW_IDENT, "_", 0);
      }
    }
  }
  return true;
};

/** The for-loop pass. */
const swUnusedForLoopVariables = (f: SwFormatter): boolean => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.kw(i, "for")) {
      continue;
    }
    const inIndex = f.indexOfAfter(SW_KEYWORD, "in", 0, i);
    if (inIndex < 0) {
      continue;
    }
    let index = swStartOfForLoopPattern(f, i);
    if (index < 0) {
      continue;
    }
    const names: string[] = [];
    const idx: i32[] = [];
    let skip = false;
    while (index < inIndex) {
      const k = f.k(index);
      const s = f.s(index);
      if (k === SW_KEYWORD && s === "case") {
        skip = true;
        break;
      }
      if (s === "await" && (k === SW_IDENT || k === SW_KEYWORD)) {
        // async sequence marker
      } else if (k === SW_IDENT) {
        const name = swUnescaped(s);
        if (name !== "_") {
          names.push(name);
          idx.push(index);
        }
      } else if (k === SW_DELIM && s === ":") {
        const ts = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
        if (ts >= 0) {
          const te = swParseType(f, ts);
          if (te >= 0) {
            index = te;
          }
        }
      }
      index++;
    }
    if (skip || names.length === 0) {
      continue;
    }
    const bodyStart = f.indexOfAfter(SW_START, "{", 0, inIndex);
    const bodyEnd = bodyStart >= 0 ? swEndOfScope(f, bodyStart) : -1;
    if (bodyEnd < 0) {
      continue;
    }
    if (!swRemoveUsed(f, names, idx, [], bodyStart + 1, bodyEnd)) {
      return false;
    }
    const wi = f.indexOfAfter(SW_KEYWORD, "where", 0, inIndex);
    if (wi >= 0 && wi < bodyStart) {
      if (!swRemoveUsed(f, names, idx, [], wi + 1, bodyStart)) {
        return false;
      }
    }
    for (let q = toI32(idx.length) - 1; q >= 0; q--) {
      f.replaceToken(idx[q], SW_IDENT, "_", 0);
    }
  }
  return true;
};

/** The closure-argument pass. */
const swUnusedClosureArguments = (f: SwFormatter): boolean => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.kw(i, "in")) {
      continue;
    }
    const start = f.indexOfBefore(SW_START, "{", 0, i);
    if (start < 0) {
      continue;
    }
    const names: string[] = [];
    const p0: i32[] = [];
    const p1: i32[] = [];
    let index = i - 1;
    const stack: i32[] = [0];
    let abort = false;
    while (index > start) {
      const k = f.k(index);
      const s = f.s(index);
      let ret = false;
      if (k === SW_IDENT && s === "async") {
        const pl = f.indexBefore(SW_T_NON_SPACE_OR_LINEBREAK, index);
        ret = pl >= 0 && f.k(pl) === SW_IDENT;
      }
      if (k === SW_END && s === "}") {
        abort = true;
        break;
      } else if (k === SW_END && s === "]") {
        const b = f.indexOfBefore(SW_START, "[", 0, index);
        if (b >= 0) {
          index = b;
        }
      } else if (k === SW_END && s === ")") {
        stack.push(toI32(names.length));
      } else if (k === SW_START && s === "(") {
        if (stack.length !== 0) {
          stack.pop();
        }
      } else if (k === SW_DELIM && s === ",") {
        if (stack.length !== 0) {
          stack[toI32(stack.length) - 1] = toI32(names.length);
        }
      } else if (ret || f.op(index, "->", SW_OP_INFIX) || f.kw(index, "throws")) {
        const count = stack.length !== 0 ? stack[toI32(stack.length) - 1] : 0;
        while (toI32(names.length) > count) {
          names.pop();
          p0.pop();
          p1.pop();
        }
      } else if (k === SW_KEYWORD && !swIsAttribute(f, index) && !swStrIsMacro(s) && s !== "inout") {
        abort = true;
        break;
      } else if (k === SW_IDENT) {
        let ok = stack.length < 3;
        if (ok) {
          const pt = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
          ok = pt >= 0 && (f.tok(pt, SW_DELIM, ",") || f.tok(pt, SW_START, "(") || f.tok(pt, SW_START, "{") || f.tok(pt, SW_END, "]"));
        }
        if (ok) {
          const ss = f.indexBefore(SW_T_START_OF_SCOPE, index);
          ok = ss >= 0 && !f.tok(ss, SW_START, "[") && !f.tok(ss, SW_START, "<");
        }
        if (ok) {
          const name = swUnescaped(s);
          const ni = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
          if (ni >= 0 && f.k(ni) === SW_IDENT && f.nextIs(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, ni, SW_DELIM, ":")) {
            const internalName = swUnescaped(f.s(ni));
            if (internalName !== "_") {
              names.push(internalName);
              p0.push(index);
              p1.push(ni);
            }
          } else if (name !== "_") {
            names.push(name);
            p0.push(index);
            p1.push(index);
          }
        }
      }
      index--;
    }
    if (abort || names.length === 0) {
      continue;
    }
    const bodyEndIndex = f.indexOfAfter(SW_END, "}", 0, i);
    if (bodyEndIndex < 0) {
      continue;
    }
    const data = swRange(toI32(names.length));
    if (!swRemoveUsed(f, names, data, [], i + 1, bodyEndIndex)) {
      return false;
    }
    for (const q of data) {
      const a = p0[q];
      const b = p1[q];
      if (f.tok(a, SW_IDENT, "_") && a !== b) {
        f.removeToken(b);
        if (f.tok(b - 1, SW_SPACE, " ")) {
          f.removeToken(b - 1);
        }
      } else {
        f.replaceToken(b, SW_IDENT, "_", 0);
      }
    }
  }
  return true;
};

/** unusedArguments. */
export const swRuleUnusedArguments = (f: SwFormatter): void => {
  if (!swUnusedFunctionArguments(f)) {
    return;
  }
  if (!swUnusedForLoopVariables(f)) {
    return;
  }
  swUnusedClosureArguments(f);
};
