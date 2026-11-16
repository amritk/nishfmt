// SwiftFormat's parseFunctionDeclaration and the parts of parseGenericTypes
// it needs (the range of a generic clause or where clause).
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { SwFormatter } from "./formatter";
import { swModifiersForDeclaration } from "./modifiers";
import { swEffectsClauseEnd, swEndOfScope, swIsAttribute, swParseGenericValueEnd, swParseType } from "./parsing";
import {
  SW_DELIM,
  SW_IDENT,
  SW_KEYWORD,
  SW_OP,
  SW_OP_INFIX,
  SW_OP_POSTFIX,
  SW_START,
  SW_T_NON_SPACE_OR_COMMENT,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
} from "./token";

/** parseGenericTypes(from:)'s range end (the clause starts at `start`, a `<` or `where`). */
export const swGenericTypesEnd = (f: SwFormatter, start: i32): i32 => {
  let currentIndex = start;
  while (currentIndex < f.count()) {
    const ps = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, currentIndex);
    if (ps < 0) {
      break;
    }
    const isValue = f.kw(ps, "let");
    const lhs = isValue ? f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, ps) : ps;
    if (lhs < 0) {
      break;
    }
    const lhsEnd = swParseType(f, lhs);
    if (lhsEnd < 0) {
      break;
    }
    currentIndex = lhsEnd;
    const colon = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, currentIndex);
    if (colon >= 0 && f.tok(colon, SW_DELIM, ":")) {
      currentIndex = colon;
    } else if (colon >= 0 && f.k(colon) === SW_OP && f.s(colon) === "==") {
      currentIndex = colon;
    }
    const rhs = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, currentIndex);
    if (rhs >= 0) {
      let e = swParseGenericValueEnd(f, rhs);
      if (e < 0) {
        e = swParseType(f, rhs);
      }
      if (e >= 0) {
        currentIndex = e;
      }
    }
    const comma = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, currentIndex);
    let more = false;
    if (comma >= 0 && f.tok(comma, SW_DELIM, ",")) {
      currentIndex = comma;
      more = true;
      const nt = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, currentIndex);
      if (nt >= 0) {
        currentIndex = nt - 1;
      }
    } else {
      const nt = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, currentIndex);
      if (nt >= 0) {
        currentIndex = nt - 1;
      }
    }
    if (!more) {
      break;
    }
  }
  if (f.tok(start, SW_START, "<")) {
    const e = swEndOfScope(f, start);
    if (e >= 0) {
      return e;
    }
  }
  return currentIndex;
};

/** A function argument (FunctionArgument). */
export class SwFuncArg {
  externalLabel: string; // "" for nil
  internalLabel: string;
  externalLabelIndex: i32; // -1 for nil
  internalLabelIndex: i32;
  typeStart: i32;
  typeEnd: i32;
  attributes: string[];
  constructor() {
    this.externalLabel = "";
    this.internalLabel = "";
    this.externalLabelIndex = -1;
    this.internalLabelIndex = -1;
    this.typeStart = -1;
    this.typeEnd = -1;
    this.attributes = [];
  }
}

/** FunctionDeclaration; -1 marks an absent part. */
export class SwFuncDecl {
  keywordIndex: i32 = -1;
  name: string = "";
  hasName: boolean = false;
  nameIndex: i32 = -1;
  genericStart: i32 = -1;
  genericEnd: i32 = -1;
  argsStart: i32 = -1;
  argsEnd: i32 = -1;
  args: SwFuncArg[];
  effectsStart: i32 = -1;
  effectsEnd: i32 = -1;
  returnOp: i32 = -1;
  returnStart: i32 = -1;
  returnEnd: i32 = -1;
  whereStart: i32 = -1;
  whereEnd: i32 = -1;
  bodyStart: i32 = -1;
  bodyEnd: i32 = -1;
  constructor() {
    this.args = [];
  }

  /** The full range's end. */
  end(): i32 {
    if (this.bodyEnd >= 0) {
      return this.bodyEnd;
    }
    if (this.whereEnd >= 0) {
      return this.whereEnd;
    }
    if (this.returnEnd >= 0) {
      return this.returnEnd;
    }
    if (this.effectsEnd >= 0) {
      return this.effectsEnd;
    }
    return this.argsEnd;
  }
}

/** Token.unescaped() for an identifier: `$foo` to `foo`, backticks removed. */
export const swUnescaped = (s: string): string => {
  if (s.startsWith("$")) {
    return s.substring(1);
  }
  if (s.indexOf("`") < 0) {
    return s;
  }
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < toI32(s.length); i++) {
    if (s.charCodeAt(i) === 96) {
      parts.push(s.substring(start, i));
      start = i + 1;
    }
  }
  parts.push(s.substring(start));
  return parts.join("");
};

/** parseFunctionDeclarationArguments(startOfScope:). */
export const swParseFunctionArguments = (f: SwFormatter, startOfScope: i32): SwFuncArg[] => {
  const out: SwFuncArg[] = [];
  const endOfScope = swEndOfScope(f, startOfScope);
  if (endOfScope < 0) {
    return out;
  }
  let currentIndex = startOfScope;
  while (true) {
    const colon = f.indexOfIn(SW_DELIM, ":", 0, currentIndex + 1, endOfScope);
    if (colon < 0) {
      break;
    }
    currentIndex = colon;
    const il = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT, colon);
    if (il < 0 || !(f.k(il) === SW_IDENT || f.s(il) === "_") || swIsAttribute(f, il)) {
      continue;
    }
    let el = il;
    let explicit = false;
    const pel = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT, il);
    if (pel >= 0 && (f.k(pel) === SW_IDENT || f.s(pel) === "_") && !swIsAttribute(f, pel)) {
      el = pel;
      explicit = true;
    }
    const attrs: string[] = [];
    const mods = swModifiersForDeclaration(f, el);
    for (const m of mods.names) {
      if (m.startsWith("@")) {
        attrs.push(m);
      }
    }
    const st = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, colon);
    if (st < 0) {
      continue;
    }
    const te = swParseType(f, st);
    if (te < 0) {
      continue;
    }
    const a = new SwFuncArg();
    a.externalLabel = f.s(el) === "_" ? "" : swUnescapedTok(f, el);
    a.internalLabel = f.s(il) === "_" ? "" : swUnescapedTok(f, il);
    a.externalLabelIndex = explicit ? el : -1;
    a.internalLabelIndex = il;
    a.typeStart = st;
    a.typeEnd = te;
    a.attributes = attrs;
    out.push(a);
  }
  return out;
};

/** Token.unescaped() for any token kind used as a label. */
export const swUnescapedTok = (f: SwFormatter, i: i32): string => {
  if (f.k(i) === SW_IDENT) {
    return swUnescaped(f.s(i));
  }
  return f.s(i);
};

/** parseFunctionDeclaration(keywordIndex:). */
export const swParseFunctionDeclaration = (f: SwFormatter, keywordIndex: i32): SwFuncDecl | null => {
  const d = new SwFuncDecl();
  d.keywordIndex = keywordIndex;
  let currentIndex = keywordIndex;
  if (f.kw(keywordIndex, "func")) {
    const ni = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, keywordIndex);
    if (ni < 0) {
      return null;
    }
    d.nameIndex = ni;
    d.name = f.s(ni);
    d.hasName = true;
    currentIndex = ni;
  }
  if (f.kw(keywordIndex, "init")) {
    const nt = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, keywordIndex);
    if (nt >= 0 && f.op(nt, "?", SW_OP_POSTFIX)) {
      currentIndex = nt;
    }
  }
  const sg = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, currentIndex);
  if (sg >= 0 && f.tok(sg, SW_START, "<")) {
    const eg = swEndOfScope(f, sg);
    if (eg >= 0) {
      d.genericStart = sg;
      d.genericEnd = eg;
      currentIndex = eg;
    }
  }
  const sa = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, currentIndex);
  if (sa < 0 || !f.tok(sa, SW_START, "(")) {
    return null;
  }
  const ea = swEndOfScope(f, sa);
  if (ea < 0) {
    return null;
  }
  d.argsStart = sa;
  d.argsEnd = ea;
  currentIndex = ea;
  const ee = swEffectsClauseEnd(f, currentIndex);
  if (ee >= 0) {
    d.effectsStart = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, currentIndex);
    d.effectsEnd = ee;
    currentIndex = ee + 1;
  }
  const ri = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, currentIndex);
  if (ri >= 0 && f.op(ri, "->", SW_OP_INFIX)) {
    const ra = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, ri);
    if (ra >= 0) {
      const re = swParseType(f, ra);
      if (re >= 0) {
        d.returnOp = ri;
        d.returnStart = ra;
        d.returnEnd = re;
        currentIndex = re;
      }
    }
  }
  const wk = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, currentIndex);
  if (wk >= 0 && f.kw(wk, "where")) {
    const we = swGenericTypesEnd(f, wk);
    d.whereStart = wk;
    d.whereEnd = we;
    currentIndex = we;
  }
  const bo = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, currentIndex);
  if (bo >= 0 && f.tok(bo, SW_START, "{")) {
    const bc = swEndOfScope(f, bo);
    if (bc >= 0) {
      d.bodyStart = bo;
      d.bodyEnd = bc;
    }
  }
  d.args = swParseFunctionArguments(f, sa);
  return d;
};

/** Token.isFunctionDeclarationKeyword. */
export const swIsFunctionDeclarationKeyword = (f: SwFormatter, i: i32): boolean =>
  f.has(i) && f.k(i) === SW_KEYWORD && (f.s(i) === "func" || f.s(i) === "init" || f.s(i) === "subscript");
