// SwiftFormat's simplifyGenericConstraints rule and parseGenericTypes(from:into:).
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { swStringExcludingLinebreaksAndComments } from "./decl";
import { SwFormatter } from "./formatter";
import { swParseFunctionDeclaration } from "./funcdecl";
import { swCharCount, swEndOfScope, swParseGenericValueEnd, swParseType } from "./parsing";
import { swTokenize } from "./tokenizer";
import {
  SW_DELIM,
  SW_END,
  SW_KEYWORD,
  SW_LINEBREAK,
  SW_OP,
  SW_SPACE,
  SW_START,
  SW_T_LINEBREAK,
  SW_T_NON_SPACE_OR_COMMENT,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
  SwTok,
} from "./token";

/** A GenericConformance: type 0 for a protocol constraint, 1 for a concrete type. */
class SwGenConf {
  name: string;
  typeName: string;
  type: i32;
  lo: i32;
  hi: i32;
  constructor(name: string, typeName: string, type: i32, lo: i32, hi: i32) {
    this.name = name;
    this.typeName = typeName;
    this.type = type;
    this.lo = lo;
    this.hi = hi;
  }
}

class SwGenType {
  name: string;
  confs: SwGenConf[];
  constructor(name: string) {
    this.name = name;
    this.confs = [];
  }
}

/** parseGenericTypes(from:into:): answers the end of the parsed range. */
const swParseGenericTypes = (f: SwFormatter, start: i32, types: SwGenType[]): i32 => {
  let cur = start;
  while (cur < f.count()) {
    const ps = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, cur);
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
    cur = lhsEnd;
    let ct = -1;
    const ci = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, cur);
    if (ci >= 0 && f.tok(ci, SW_DELIM, ":")) {
      ct = 0;
      cur = ci;
    } else if (ci >= 0 && f.k(ci) === SW_OP && f.s(ci) === "==") {
      ct = 1;
      cur = ci;
    }
    let rhsLo = -1;
    let rhsHi = -1;
    const ri = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, cur);
    if (ri >= 0) {
      let re = swParseGenericValueEnd(f, ri);
      if (re < 0) {
        re = swParseType(f, ri);
      }
      if (re >= 0) {
        rhsLo = ri;
        rhsHi = re;
        cur = re;
      }
    }
    let more = false;
    const comma = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, cur);
    if (comma >= 0 && f.tok(comma, SW_DELIM, ",")) {
      cur = comma;
      more = true;
      const nt = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, cur);
      if (nt >= 0) {
        cur = nt - 1;
      }
    } else {
      const nt = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, cur);
      if (nt >= 0) {
        cur = nt - 1;
      }
    }
    const full = swStringExcludingLinebreaksAndComments(f, lhs, lhsEnd + 1);
    const dot = full.indexOf(".");
    const base = dot >= 0 ? full.substring(0, dot) : full;
    let gi = -1;
    for (let q = 0; q < toI32(types.length); q++) {
      if (types[q].name === base) {
        gi = q;
        break;
      }
    }
    if (gi < 0) {
      types.push(new SwGenType(base));
      gi = toI32(types.length) - 1;
    }
    if (rhsLo >= 0 && ct >= 0) {
      types[gi].confs.push(new SwGenConf(swStringExcludingLinebreaksAndComments(f, rhsLo, rhsHi + 1), full, ct, lhs, cur));
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
  return cur;
};

/** isGenericTypeDeclared(_:in:). */
const swIsGenericTypeDeclared = (f: SwFormatter, name: string, gs: i32): boolean => {
  const ge = swEndOfScope(f, gs);
  if (ge < 0) {
    return false;
  }
  let cur = gs + 1;
  while (cur < ge) {
    const ti = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, cur - 1);
    if (ti < 0 || ti >= ge) {
      break;
    }
    if (f.s(ti) === name) {
      return true;
    }
    const ci = f.indexOfAfter(SW_DELIM, ",", 0, ti);
    if (ci < 0) {
      break;
    }
    cur = ci + 1;
  }
  return false;
};

const swTokenizeAscii = (src: string): SwTok[] => {
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

/** simplifyGenericConstraints(genericStartIndex:genericEndIndex:whereIndex:). */
const swSimplifyGenericConstraints = (f: SwFormatter, genericStart: i32, whereIndex: i32): void => {
  const types: SwGenType[] = [];
  swParseGenericTypes(f, genericStart, types);
  swParseGenericTypes(f, whereIndex, types);
  const moveTypes: string[] = [];
  const moveConfs: SwGenConf[] = [];
  for (const t of types) {
    const declaredInline = swIsGenericTypeDeclared(f, t.name, genericStart);
    for (const c of t.confs) {
      if (c.type !== 0 || c.lo <= whereIndex || c.typeName !== t.name || !declaredInline) {
        continue;
      }
      const last = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, c.hi + 1);
      if (last < 0 || !f.onSameLine(c.lo, last)) {
        continue;
      }
      moveTypes.push(t.name);
      moveConfs.push(c);
    }
  }
  if (moveConfs.length === 0) {
    return;
  }
  // group by generic type, in first-seen order
  const groupNames: string[] = [];
  const groups: SwGenConf[][] = [];
  for (let q = 0; q < toI32(moveConfs.length); q++) {
    const g = groupNames.indexOf(moveTypes[q]);
    if (g >= 0) {
      groups[g].push(moveConfs[q]);
    } else {
      groupNames.push(moveTypes[q]);
      groups.push([moveConfs[q]]);
    }
  }
  for (const g of groups) {
    const names: string[] = [];
    for (const c of g) {
      names.push(c.name);
    }
    if (swCharCount(names.join(" & ")) > 40) {
      return;
    }
  }
  const wref = f.ref(whereIndex, whereIndex);
  const gref = f.ref(genericStart, genericStart);
  // remove the moved constraints, last first
  const order: SwGenConf[] = [];
  for (const c of moveConfs) {
    order.push(c);
  }
  for (let p = 1; p < toI32(order.length); p++) {
    let q = p;
    while (q > 0 && order[q - 1].lo < order[q].lo) {
      const t = order[q];
      order[q] = order[q - 1];
      order[q - 1] = t;
      q--;
    }
  }
  for (const c of order) {
    f.removeTokens(c.lo, c.hi + 1);
  }
  const w = f.refLo[wref];
  const wt: SwGenType[] = [];
  swParseGenericTypes(f, whereIndex, wt);
  let allEmpty = true;
  for (const t of wt) {
    if (t.confs.length !== 0) {
      allEmpty = false;
    }
  }
  const ta = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, whereIndex);
  if (allEmpty && ta >= 0) {
    if (f.tok(ta, SW_START, "{")) {
      f.removeTokens(w, ta);
    } else {
      const startIndex = w > 0 && f.k(w - 1) === SW_SPACE ? w - 1 : w;
      const lb = f.indexAfter(SW_T_LINEBREAK, w);
      if (lb >= 0) {
        f.removeTokens(startIndex, lb);
      } else if (!f.tok(ta, SW_END, "}")) {
        let end = w + 1;
        while (end < f.count() && f.k(end) !== SW_LINEBREAK) {
          end++;
        }
        f.removeTokens(startIndex, end);
      }
    }
  }
  const ob = f.indexOfAfter(SW_START, "{", 0, f.refLo[wref]);
  if (ob >= 0) {
    const ci = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, ob);
    if (ci >= 0 && f.tok(ci, SW_DELIM, ",")) {
      f.removeToken(ci);
      if (f.k(ci - 1) === SW_SPACE && (f.k(ci) === SW_SPACE || f.k(ci) === SW_LINEBREAK)) {
        f.removeToken(ci - 1);
      }
    }
  }
  f.unref(wref);
  for (let g = 0; g < toI32(groups.length); g++) {
    const typeName = groupNames[g];
    const gs = f.refLo[gref];
    const ge = swEndOfScope(f, gs);
    if (ge < 0) {
      break;
    }
    let cur = gs + 1;
    while (cur < ge) {
      const ti = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, cur - 1);
      if (ti < 0 || ti >= ge) {
        break;
      }
      if (f.s(ti) === typeName) {
        const hasInline = f.nextIs(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, ti, SW_DELIM, ":");
        let end = ti;
        while (true) {
          const ni = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, end);
          if (ni < 0 || ni >= ge || f.tok(ni, SW_DELIM, ",")) {
            break;
          }
          end = ni;
        }
        const inline: string[] = [];
        for (const t of types) {
          if (t.name === typeName) {
            for (const c of t.confs) {
              if (c.lo < whereIndex) {
                inline.push(c.name);
              }
            }
            break;
          }
        }
        const names: string[] = [];
        for (const c of groups[g]) {
          if (inline.indexOf(c.name) < 0 && names.indexOf(c.name) < 0) {
            names.push(c.name);
          }
        }
        if (names.length === 0) {
          break;
        }
        const suffix = (hasInline ? " & " : ": ") + names.join(" & ");
        f.insertToks(swTokenizeAscii(suffix), end + 1);
        break;
      }
      const ci = f.indexOfAfter(SW_DELIM, ",", 0, ti);
      if (ci < 0) {
        break;
      }
      cur = ci + 1;
    }
  }
  f.unref(gref);
};

/** simplifyGenericConstraints. */
export const swRuleSimplifyGenericConstraints = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (f.k(i) !== SW_KEYWORD) {
      continue;
    }
    const s = f.s(i);
    if (s === "func") {
      const d = swParseFunctionDeclaration(f, i);
      if (d !== null && d.genericStart >= 0 && d.whereStart >= 0) {
        swSimplifyGenericConstraints(f, d.genericStart, d.whereStart);
      }
      continue;
    }
    if (!(s === "struct" || s === "class" || s === "enum" || s === "actor")) {
      continue;
    }
    const tn = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    const gs = tn >= 0 ? f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, tn) : -1;
    if (gs < 0 || !f.tok(gs, SW_START, "<")) {
      continue;
    }
    const ge = swEndOfScope(f, gs);
    if (ge < 0) {
      continue;
    }
    const w = f.indexOfAfter(SW_KEYWORD, "where", 0, ge);
    const ob = f.indexOfAfter(SW_START, "{", 0, ge);
    if (w < 0 || ob < 0 || w >= ob) {
      continue;
    }
    swSimplifyGenericConstraints(f, gs, w);
  }
};
