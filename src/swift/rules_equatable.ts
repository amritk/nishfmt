// SwiftFormat's redundantEquatable rule (equatableMacro none, so only structs).
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { fault } from "../core/fault";
import {
  SW_DECL_IFDEF,
  SW_DECL_TYPE,
  swDeclarationName,
  swDeclHi,
  swDeclIsStoredInstanceProperty,
  swDeclKeywordIndex,
  swDeclLo,
  swParseConformances,
  swParseDeclarations,
  swReleaseDecls,
  swStringExcludingLinebreaksAndComments,
} from "./decl";
import { swParsePropertyDeclaration } from "./expr";
import { SwDecl, SwFormatter } from "./formatter";
import { swParseFunctionArguments } from "./funcdecl";
import { swHasModifier, swModifiersForDeclaration } from "./modifiers";
import { swEndOfScope, swIsTypeKeywordStr } from "./parsing";
import { swCollectRecursive, swFullyQualifiedName } from "./rules_acl";
import {
  SW_DELIM,
  SW_IDENT,
  SW_KEYWORD,
  SW_OP,
  SW_OP_INFIX,
  SW_OP_POSTFIX,
  SW_START,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
} from "./token";

// Token indices, token counts and line numbers stay below the token count, far from the
// i32 limits, so a sum or difference of them the prover cannot bound is written
// `toI32(toU32(a) + b)`: wrapping u32 arithmetic, exact for such values.

const swConformsToAny = (f: SwFormatter, kw: i32, a: string, b: string): boolean => {
  const c = swParseConformances(f, kw);
  const starts = c.starts;
  const ends = c.ends;
  for (let q = 0; q < starts.length && q < ends.length; q++) {
    // A token index: the u32 sum is exact.
    const s = swStringExcludingLinebreaksAndComments(f, starts[q], toI32(toU32(ends[q]) + 1));
    if (s === a || s === b) {
      return true;
    }
  }
  return false;
};

const swSameRun = (f: SwFormatter, a0: i32, a1: i32, b0: i32, b1: i32): boolean => {
  if (toI32(toU32(a1) - toU32(a0)) !== toI32(toU32(b1) - toU32(b0))) {
    return false;
  }
  for (let q = 0; q <= toI32(toU32(a1) - toU32(a0)); q = toI32(toU32(q) + 1)) {
    if (!f.same(toI32(toU32(a0) + toU32(q)), toI32(toU32(b0) + toU32(q)))) {
      return false;
    }
  }
  return true;
};

/** parseComparedProperties(inEquatableImplementation:); null for nil. */
const swParseComparedProperties = (f: SwFormatter, funcIndex: i32): string[] | null => {
  const sb = f.indexOfAfter(SW_START, "{", 0, funcIndex);
  const first = sb >= 0 ? f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, sb) : -1;
  const eb = sb >= 0 ? swEndOfScope(f, sb) : -1;
  if (first < 0 || eb < 0) {
    return null;
  }
  const out: string[] = [];
  let cur = first;
  if (f.kw(cur, "return")) {
    const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, cur);
    if (n >= 0) {
      cur = n;
    }
  }
  while (cur < eb) {
    if (!f.tok(cur, SW_IDENT, "lhs")) {
      return null;
    }
    const d1 = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, cur);
    const p1 = d1 >= 0 && f.op(d1, ".", SW_OP_INFIX) ? f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, d1) : -1;
    if (p1 < 0 || !(f.k(p1) === SW_IDENT || f.k(p1) === SW_KEYWORD)) {
      return null;
    }
    const eq = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, p1);
    const r = eq >= 0 && f.op(eq, "==", SW_OP_INFIX) ? f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, eq) : -1;
    if (r < 0 || !f.tok(r, SW_IDENT, "rhs")) {
      return null;
    }
    const d2 = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, r);
    const p2 = d2 >= 0 && f.op(d2, ".", SW_OP_INFIX) ? f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, d2) : -1;
    if (p2 < 0 || !f.same(p1, p2)) {
      return null;
    }
    const after = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, p2);
    if (after < 0) {
      return null;
    }
    if (out.indexOf(f.s(p1)) < 0) {
      out.push(f.s(p1));
    }
    if (f.op(after, "&&", SW_OP_INFIX)) {
      const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, after);
      cur = n >= 0 ? n : after;
    } else {
      cur = after;
    }
  }
  return out;
};

/** TypeName.isTuple. */
const swIsTupleType = (f: SwFormatter, lo: i32, hi: i32): boolean => {
  const op = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, toI32(toU32(lo) - 1));
  if (op < 0 || !f.tok(op, SW_START, "(")) {
    return false;
  }
  const cp = swEndOfScope(f, op);
  if (cp < 0 || toI32(toU32(op) + 1) === cp) {
    return false;
  }
  const ta = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, cp);
  if (ta >= 0 && !(ta > hi || f.op(ta, "?", SW_OP_POSTFIX))) {
    return false;
  }
  return f.indexOfIn(SW_DELIM, ",", 0, toI32(toU32(op) + 1), cp) >= 0;
};

const swHasStoredPropertyIn = (f: SwFormatter, ds: SwDecl[]): boolean => {
  for (const d of ds) {
    if (swDeclIsStoredInstanceProperty(f, d) || swHasStoredPropertyIn(f, d.body)) {
      return true;
    }
  }
  return false;
};

/** redundantEquatable. */
export const swRuleRedundantEquatable = (f: SwFormatter): void => {
  const decls = swParseDeclarations(f);
  const all: SwDecl[] = [];
  swCollectRecursive(decls, all);
  const typeNames: string[] = [];
  const typeDecls: SwDecl[] = [];
  const eqTypes: string[] = [];
  const strideable: string[] = [];
  const implNames: string[] = [];
  const implDecls: SwDecl[] = [];
  for (const d of all) {
    const kw = swDeclKeywordIndex(f, d);
    const name = swDeclarationName(f, kw);
    if (name.length === 0) {
      continue;
    }
    const definesType = swIsTypeKeywordStr(d.keyword) && d.keyword !== "extension";
    const fq = swFullyQualifiedName(f, d);
    if (definesType && fq.length !== 0) {
      const q = typeNames.indexOf(fq);
      if (q >= typeDecls.length) {
        // typeDecls is parallel to typeNames.
        fault();
        return;
      }
      if (q >= 0) {
        typeDecls[q] = d;
      } else {
        typeNames.push(fq);
        typeDecls.push(d);
      }
    }
    if (d.kind === SW_DECL_TYPE && fq.length !== 0) {
      if (swConformsToAny(f, kw, "Equatable", "Hashable")) {
        eqTypes.push(fq);
      }
      if (swConformsToAny(f, kw, "Strideable", "Strideable") && strideable.indexOf(fq) < 0) {
        strideable.push(fq);
      }
    }
    if (d.keyword === "func" && name === "==" && swHasModifier(f, kw, "static")) {
      const sa = f.indexOfAfter(SW_START, "(", 0, kw);
      if (sa < 0) {
        continue;
      }
      const args = swParseFunctionArguments(f, sa);
      if (
        args.length === 2 &&
        args[0].internalLabel === "lhs" &&
        args[1].internalLabel === "rhs" &&
        swSameRun(f, args[0].typeStart, args[0].typeEnd, args[1].typeStart, args[1].typeEnd)
      ) {
        let compared = swStringExcludingLinebreaksAndComments(f, args[0].typeStart, toI32(toU32(args[0].typeEnd) + 1));
        const p = d.parent;
        if (p !== null) {
          const pfq = swFullyQualifiedName(f, p);
          const pn = swDeclarationName(f, swDeclKeywordIndex(f, p));
          if (compared === "Self" && pfq.length !== 0) {
            compared = pfq;
          }
          if (p.keyword === "extension" && pn.length !== 0 && compared !== pn && pn.endsWith("." + compared)) {
            compared = pn;
          }
          if (compared === pn && pfq.length !== 0) {
            compared = pfq;
          }
        }
        const q = implNames.indexOf(compared);
        if (q >= implDecls.length) {
          // implDecls is parallel to implNames.
          fault();
          return;
        }
        if (q >= 0) {
          implDecls[q] = d;
        } else {
          implNames.push(compared);
          implDecls.push(d);
        }
      }
    }
  }
  for (const tn of eqTypes) {
    const ti = typeNames.indexOf(tn);
    const ii = implNames.indexOf(tn);
    if (strideable.indexOf(tn) >= 0 || ti < 0 || ii < 0) {
      continue;
    }
    if (ti >= typeDecls.length || ii >= implDecls.length) {
      fault();
      return;
    }
    const td = typeDecls[ti];
    const fn = implDecls[ii];
    if (td.keyword !== "struct") {
      continue;
    }
    const stored: SwDecl[] = [];
    const names: string[] = [];
    let conditional = false;
    for (const b of td.body) {
      if (swDeclIsStoredInstanceProperty(f, b)) {
        stored.push(b);
        const n = swDeclarationName(f, swDeclKeywordIndex(f, b));
        if (names.indexOf(n) < 0) {
          names.push(n);
        }
      }
      if (b.kind === SW_DECL_IFDEF && swHasStoredPropertyIn(f, [b])) {
        conditional = true;
      }
    }
    if (conditional) {
      continue;
    }
    const compared = swParseComparedProperties(f, swDeclKeywordIndex(f, fn));
    if (compared === null || compared.length !== names.length) {
      continue;
    }
    let sameSet = true;
    for (const n of compared) {
      if (names.indexOf(n) < 0) {
        sameSet = false;
      }
    }
    if (!sameSet) {
      continue;
    }
    let hasAttr = false;
    for (const m of swModifiersForDeclaration(f, swDeclKeywordIndex(f, fn)).names) {
      if (m.startsWith("@")) {
        hasAttr = true;
      }
    }
    if (hasAttr) {
      continue;
    }
    let nonEquatable = false;
    for (const s of stored) {
      const p = swParsePropertyDeclaration(f, swDeclKeywordIndex(f, s));
      if (p !== null && p.typeStart >= 0) {
        const ts = swStringExcludingLinebreaksAndComments(f, p.typeStart, toI32(toU32(p.typeEnd) + 1));
        if (ts === "AnyClass" || ts === "Any.Type" || swIsTupleType(f, p.typeStart, p.typeEnd)) {
          nonEquatable = true;
        }
      }
    }
    if (nonEquatable) {
      continue;
    }
    f.removeTokens(swDeclLo(f, fn), toI32(toU32(swDeclHi(f, fn)) + 1));
  }
  swReleaseDecls(f, decls);
};
