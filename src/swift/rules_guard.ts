// SwiftFormat's repeatedGuard rule and parseConditionalStatement(at:).
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { swParsePropertyDeclaration } from "./expr";
import { SwFormatter } from "./formatter";
import { swEndOfScope, swSpaceEquivalentToTokens } from "./parsing";
import {
  SW_DELIM,
  SW_IDENT,
  SW_KEYWORD,
  SW_LINEBREAK,
  SW_OP,
  SW_OP_INFIX,
  SW_SPACE,
  SW_START,
  SW_T_LINEBREAK,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
  SW_T_NON_SPACE_OR_LINEBREAK,
  SwTok,
} from "./token";

// Token indices, token counts and line numbers stay below the token count, far from the
// i32 limits, so a sum or difference of them the prover cannot bound is written
// `toI32(toU32(a) + b)`: wrapping u32 arithmetic, exact for such values.

export const SW_COND_BOOL: i32 = 0;
export const SW_COND_BINDING: i32 = 1;
export const SW_COND_PATTERN: i32 = 2;
export const SW_COND_AVAILABILITY: i32 = 3;

/** parseConditionalStatement(at:)'s elements. */
export class SwConditions {
  kinds: i32[];
  starts: i32[];
  ends: i32[];
  names: string[]; // the bound property's identifier for an optional binding, else ""
  constructor() {
    this.kinds = [];
    this.starts = [];
    this.ends = [];
    this.names = [];
  }
}

/** parseConditionalStatement(at:) for a `guard` or `if`. */
export const swParseConditionalStatement = (f: SwFormatter, gi: i32): SwConditions => {
  const c = new SwConditions();
  let endIndex = -1;
  const brace = f.indexOfAfter(SW_START, "{", 0, gi);
  if (brace >= 0) {
    if (f.kw(gi, "if")) {
      endIndex = brace;
    } else {
      const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, brace);
      if (p >= 0 && f.kw(p, "else")) {
        endIndex = p;
      }
    }
  }
  if (endIndex < 0) {
    return c;
  }
  let pos = toI32(toU32(gi) + 1);
  while (pos < endIndex) {
    const cs = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, toI32(toU32(pos) - 1));
    if (cs < 0 || cs >= endIndex) {
      break;
    }
    let ce = -1;
    const comma = f.indexOfAfter(SW_DELIM, ",", 0, cs - 1);
    if (comma >= 0 && comma < endIndex) {
      const b = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, comma);
      ce = b >= 0 ? b : cs;
    } else {
      const b = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, endIndex);
      ce = b >= 0 ? b : cs;
    }
    let kind = SW_COND_BOOL;
    let name = "";
    if (f.kw(cs, "case")) {
      kind = SW_COND_PATTERN;
    } else if (f.kw(cs, "let") || f.kw(cs, "var")) {
      const p = swParsePropertyDeclaration(f, cs);
      if (p === null) {
        return new SwConditions();
      }
      kind = SW_COND_BINDING;
      name = p.identifier;
    } else if (f.kw(cs, "#available") || f.kw(cs, "#unavailable")) {
      kind = SW_COND_AVAILABILITY;
    }
    c.kinds.push(kind);
    c.starts.push(cs);
    c.ends.push(ce);
    c.names.push(name);
    const nc = f.indexOfAfter(SW_DELIM, ",", 0, ce);
    if (nc >= 0 && nc < endIndex) {
      pos = nc + 1;
    } else {
      break;
    }
  }
  return c;
};

/** conditionsAreWrapped(after:before:). */
const swGuardConditionsAreWrapped = (f: SwFormatter, keywordIndex: i32, endIndex: i32): boolean => {
  const last = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, endIndex);
  return last >= 0 && f.indexInType(SW_T_LINEBREAK, toI32(toU32(keywordIndex) + 1), last) >= 0;
};

/** repeatedGuardParts(at:) as [else, bodyStart, bodyEnd], or []. */
const swRepeatedGuardParts = (f: SwFormatter, gi: i32): i32[] => {
  if (!f.kw(gi, "guard")) {
    return [];
  }
  const e = f.indexOfAfter(SW_KEYWORD, "else", 0, gi);
  const bs = e >= 0 ? f.indexOfAfter(SW_START, "{", 0, e) : -1;
  const be = bs >= 0 ? swEndOfScope(f, bs) : -1;
  if (be < 0) {
    return [];
  }
  return [e, bs, be];
};

const swBodiesMatch = (f: SwFormatter, a0: i32, a1: i32, b0: i32, b1: i32): boolean => {
  const la: i32[] = [];
  const lb: i32[] = [];
  for (let j = a0; j <= a1; j = toI32(toU32(j) + 1)) {
    if (f.k(j) !== SW_SPACE && f.k(j) !== SW_LINEBREAK) {
      if (f.isComment(j)) {
        return false;
      }
      la.push(j);
    }
  }
  for (let j = b0; j <= b1; j = toI32(toU32(j) + 1)) {
    if (f.k(j) !== SW_SPACE && f.k(j) !== SW_LINEBREAK) {
      if (f.isComment(j)) {
        return false;
      }
      lb.push(j);
    }
  }
  if (la.length !== lb.length) {
    return false;
  }
  for (let q = 0; q < la.length && q < lb.length; q++) {
    if (!f.same(la[q], lb[q])) {
      return false;
    }
  }
  return true;
};

/** namesDeclaredByRepeatedGuard(at:); null for nil. */
const swNamesDeclaredByGuard = (f: SwFormatter, gi: i32): string[] | null => {
  const c = swParseConditionalStatement(f, gi);
  if (c.kinds.length === 0) {
    return null;
  }
  const names: string[] = [];
  const kinds = c.kinds;
  const cnames = c.names;
  const starts = c.starts;
  const ends = c.ends;
  for (let q = 0; q < kinds.length && q < cnames.length && q < starts.length && q < ends.length; q++) {
    const k = kinds[q];
    const start = starts[q];
    if (k === SW_COND_BINDING) {
      names.push(cnames[q]);
    } else if (k === SW_COND_PATTERN) {
      // A token index: the u32 sum is exact.
      const eq = f.indexOfIn(SW_OP, "=", SW_OP_INFIX, start, toI32(toU32(ends[q]) + 1));
      if (eq < 0) {
        return null;
      }
      for (let j = start; j < eq; j++) {
        if (f.k(j) === SW_IDENT && f.s(j) !== "_") {
          names.push(f.s(j));
        }
      }
    }
  }
  return names;
};

/** mergeGuardFollowingGuard(at:). */
const swMergeGuardFollowingGuard = (f: SwFormatter, gi: i32): boolean => {
  // Each is [] or [else, body start, body end].
  const fg = swRepeatedGuardParts(f, gi);
  if (fg.length < 3) {
    return false;
  }
  const fElse = fg[0];
  const fStart = fg[1];
  const fEnd = fg[2];
  const ng = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, fEnd);
  if (ng < 0 || !f.kw(ng, "guard")) {
    return false;
  }
  const sg = swRepeatedGuardParts(f, ng);
  if (sg.length < 3) {
    return false;
  }
  const sElse = sg[0];
  const sStart = sg[1];
  const sEnd = sg[2];
  if (!swBodiesMatch(f, fStart, fEnd, sStart, sEnd)) {
    return false;
  }
  const firstNames = swNamesDeclaredByGuard(f, gi);
  if (firstNames === null || swNamesDeclaredByGuard(f, ng) === null) {
    return false;
  }
  for (let j = sStart; j <= sEnd; j = toI32(toU32(j) + 1)) {
    if (f.k(j) === SW_IDENT && firstNames.indexOf(f.s(j)) >= 0) {
      return false;
    }
  }
  const fce = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, fElse);
  if (fce < 0) {
    return false;
  }
  for (let j = toI32(toU32(fce) + 1); j <= ng; j = toI32(toU32(j) + 1)) {
    if (f.isComment(j)) {
      return false;
    }
  }
  if (swGuardConditionsAreWrapped(f, gi, fElse) || swGuardConditionsAreWrapped(f, ng, sElse)) {
    const c = swParseConditionalStatement(f, gi);
    const scs = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, ng);
    const cs = c.starts;
    if (cs.length > 0 && scs >= 0) {
      const lo = cs[0];
      const indent = swSpaceEquivalentToTokens(f, f.startOfLine(lo), lo);
      f.replaceTokens(toI32(toU32(fce) + 1), scs, [
        new SwTok(SW_DELIM, ",", 0),
        new SwTok(SW_LINEBREAK, "\n", f.linebreakLine(gi)),
        new SwTok(SW_SPACE, indent, 0),
      ]);
      return true;
    }
  }
  f.replaceTokens(toI32(toU32(fce) + 1), toI32(toU32(ng) + 1), [new SwTok(SW_DELIM, ",", 0)]);
  return true;
};

/** repeatedGuard. */
export const swRuleRepeatedGuard = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (!f.kw(i, "guard")) {
      continue;
    }
    while (swMergeGuardFollowingGuard(f, i)) {
      // repeat
    }
  }
};
