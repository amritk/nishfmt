// SwiftFormat's blankLinesAroundMark, blankLinesBetweenScopes,
// headerFileName, modifierOrder, modifiersOnSameLine,
// consistentSwitchCaseSpacing and sortTypealiases rules.
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { SwDecl, swDeclKeywordIndex, swDeclLo, swParseDeclarations, swReleaseDecls } from "./decl";
import { SwFormatter, swIndexAfterWhere, swIndexBeforeWhere } from "./formatter";
import { swCommentDirective } from "./imports";
import { swIsModifier, swStartOfModifiers } from "./modifiers";
import { swEndOfScope, swIsDeclarationTypeKeyword, swIsLabel, swParseType, swStartOfScope, swSwitchStatementBranches } from "./parsing";
import { swStrLess } from "./rules_braces";
import { swLowercased } from "./rules_simple";
import {
  SW_COMMENT,
  SW_DELIM,
  SW_END,
  SW_ERROR,
  SW_IDENT,
  SW_KEYWORD,
  SW_LINEBREAK,
  SW_OP,
  SW_OP_INFIX,
  SW_OP_PREFIX,
  SW_SPACE,
  SW_START,
  SW_T_LINEBREAK,
  SW_T_NON_SPACE,
  SW_T_NON_SPACE_OR_COMMENT,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
  SW_T_NON_SPACE_OR_LINEBREAK,
  SwTok,
} from "./token";

/** blankLinesAroundMark (lineAfterMarks, insertBlankLines). */
export const swRuleBlankLinesAroundMark = (f: SwFormatter): void => {
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (f.k(i) !== SW_COMMENT || !f.s(i).startsWith("MARK:")) {
      continue;
    }
    const startIndex = f.indexBefore(SW_T_NON_SPACE, i);
    if (startIndex < 0 || !f.tok(startIndex, SW_START, "//")) {
      continue;
    }
    const nextIndex = f.indexAfter(SW_T_LINEBREAK, i);
    if (nextIndex >= 0) {
      const nt = f.indexAfter(SW_T_NON_SPACE, nextIndex);
      if (nt >= 0 && f.k(nt) !== SW_LINEBREAK && !f.tok(nt, SW_END, "}")) {
        f.insertLinebreak(nextIndex);
      }
    }
    const lastIndex = f.indexBefore(SW_T_LINEBREAK, startIndex);
    if (lastIndex >= 0) {
      const lt = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT, lastIndex);
      if (lt >= 0 && f.k(lt) !== SW_LINEBREAK) {
        if (f.tok(lt, SW_START, "{") && f.ruleEnabled("blankLinesAtStartOfScope")) {
          // typeBlankLines is `remove`, so blankLinesAtStartOfScope would remove it
          continue;
        }
        f.insertLinebreak(lastIndex);
      }
    }
  }
};

/** blankLinesBetweenScopes. */
export const swRuleBlankLinesBetweenScopes = (f: SwFormatter): void => {
  const stack: boolean[] = [true];
  let spaceable = false;
  for (let i0 = f.enumStart(); i0 >= 0; i0 = f.enumNext()) {
    const s = f.s(i0);
    if (f.k(i0) === SW_KEYWORD && (s === "class" || s === "actor" || s === "struct" || s === "extension" || s === "enum")) {
      spaceable = !f.lastIs(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i0, SW_KEYWORD, "import");
      continue;
    }
    if (f.kw(i0, "func") || f.kw(i0, "var")) {
      spaceable = false;
      continue;
    }
    if (f.tok(i0, SW_START, "{")) {
      stack.push(spaceable);
      spaceable = false;
      continue;
    }
    if (!f.tok(i0, SW_END, "}")) {
      continue;
    }
    if (stack.length > 0) {
      stack.pop();
    }
    const m = toI32(stack.length);
    if (!(m > 0 && stack[m - 1])) {
      continue;
    }
    const ob = f.indexOfBefore(SW_START, "{", 0, i0);
    if (ob < 0 || f.lastIndexInType(SW_T_LINEBREAK, ob + 1, i0) < 0) {
      continue;
    }
    let i = i0;
    const np = f.indexAfter(SW_T_NON_SPACE, i);
    if (np >= 0 && f.tok(np, SW_START, "(")) {
      const cp = f.indexOfAfter(SW_END, ")", 0, np);
      if (cp >= 0) {
        i = cp;
      }
    }
    const nextTokenIndex = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, i);
    if (nextTokenIndex < 0 || !f.isEnabled()) {
      continue;
    }
    const flb = f.indexInType(SW_T_LINEBREAK, i + 1, nextTokenIndex);
    if (flb < 0 || f.indexInType(SW_T_LINEBREAK, flb + 1, nextTokenIndex) >= 0) {
      continue;
    }
    let nnc = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
    if (nnc >= 0) {
      while (f.tok(nnc, SW_START, "#if")) {
        const ni = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, f.endOfLine(nnc));
        if (ni < 0) {
          break;
        }
        nnc = ni;
      }
      const k = f.k(nnc);
      const ks = f.s(nnc);
      if (
        k === SW_ERROR ||
        k === SW_END ||
        (k === SW_OP && f.a(nnc) === SW_OP_INFIX) ||
        f.tok(nnc, SW_DELIM, ",") ||
        f.tok(nnc, SW_DELIM, ":") ||
        (k === SW_KEYWORD && (ks === "else" || ks === "catch" || ks === "#else" || ks === "#elseif"))
      ) {
        continue;
      }
      if (f.kw(nnc, "while")) {
        const pb = f.indexOfBefore(SW_START, "{", 0, i);
        if (pb >= 0 && f.lastIs(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, pb, SW_KEYWORD, "repeat")) {
          continue;
        }
      } else if (swIsLabel(f, nnc)) {
        const ci = f.indexOfAfter(SW_DELIM, ":", 0, nnc);
        if (ci >= 0 && f.nextIs(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, ci, SW_START, "{")) {
          continue;
        }
      }
    }
    if (f.tok(nextTokenIndex, SW_START, "//")) {
      const b = f.indexAfter(SW_T_NON_SPACE, nextTokenIndex);
      if (b >= 0 && f.k(b) === SW_COMMENT && swLowercased(swTrimWS(f.s(b))).startsWith("sourcery:")) {
        continue;
      }
    }
    f.insertLinebreak(flb);
  }
};

const swTrimWS = (s: string): string => {
  let a = 0;
  let b = toI32(s.length);
  while (a < b && (s.charCodeAt(a) === 32 || s.charCodeAt(a) === 9)) {
    a++;
  }
  while (b > a && (s.charCodeAt(b - 1) === 32 || s.charCodeAt(b - 1) === 9)) {
    b--;
  }
  return s.substring(a, b);
};

/** headerCommentTokenRange(includingDirectives: ["*"]): [0] start, [1] end (exclusive); null for nil. */
const swHeaderCommentRangeAll = (f: SwFormatter): i32[] | null => {
  let start = 0;
  let lastHeader = -1;
  let startIndex = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, -1);
  if (startIndex >= 0) {
    if (f.tok(startIndex, SW_START, "#!")) {
      const e = f.indexAfter(SW_T_LINEBREAK, startIndex);
      if (e < 0) {
        return null;
      }
      const s2 = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, e);
      startIndex = s2 >= 0 ? s2 : e;
      start = startIndex;
      lastHeader = startIndex - 1;
    }
    if (f.tok(startIndex, SW_START, "//")) {
      const b = f.indexAfter(SW_T_NON_SPACE, startIndex);
      if (b >= 0 && f.k(b) === SW_COMMENT) {
        const body = f.s(b);
        if ((body.startsWith("/") && !body.startsWith("//")) || body.startsWith("swift-tools-version")) {
          return null;
        }
      }
      let lastIndex = startIndex;
      while (true) {
        const index = f.indexAfter(SW_T_LINEBREAK, lastIndex);
        if (index < 0) {
          break;
        }
        if (f.tok(index + 1, SW_START, "//")) {
          lastIndex = index;
          continue;
        }
        if (f.has(index + 1) && f.k(index + 1) === SW_LINEBREAK) {
          lastHeader = index + 1;
        } else if (f.has(index + 1) && f.k(index + 1) === SW_SPACE && f.has(index + 2) && f.k(index + 2) === SW_LINEBREAK) {
          lastHeader = index + 2;
        }
        break;
      }
    } else if (f.tok(startIndex, SW_START, "/*")) {
      const b = f.indexAfter(SW_T_NON_SPACE, startIndex);
      let stop = false;
      if (b >= 0 && f.k(b) === SW_COMMENT) {
        const body = f.s(b);
        if (body.startsWith("*") && !body.startsWith("**")) {
          return null;
        } else if (swCommentDirective(body).length !== 0) {
          stop = true;
        }
      }
      while (!stop) {
        const endIndex = f.indexOfAfter(SW_END, "*/", 0, startIndex);
        if (endIndex < 0) {
          break;
        }
        lastHeader = endIndex;
        const lb = f.indexAfter(SW_T_LINEBREAK, endIndex);
        if (lb >= 0) {
          lastHeader = lb;
        }
        const ni = f.indexAfter(SW_T_NON_SPACE, lastHeader);
        if (ni < 0) {
          break;
        }
        if (!f.tok(ni, SW_START, "/*")) {
          const e2 = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, lastHeader);
          if (e2 >= 0) {
            lastHeader = e2 - 1;
          }
          break;
        }
        startIndex = ni;
      }
    }
  }
  return [start, lastHeader + 1];
};

/** headerFileName. */
export const swRuleHeaderFileName = (f: SwFormatter): void => {
  let fileName = f.path;
  let p = fileName.indexOf("/");
  while (p >= 0) {
    fileName = fileName.substring(p + 1);
    p = fileName.indexOf("/");
  }
  if (fileName.length === 0 || !fileName.endsWith(".swift")) {
    return;
  }
  const r = swHeaderCommentRangeAll(f);
  if (r === null) {
    return;
  }
  for (let i = r[0]; i < r[1]; i++) {
    if (f.k(i) !== SW_COMMENT) {
      continue;
    }
    const body = f.s(i);
    if (body.endsWith(".swift") && body !== fileName && body.indexOf(" ") < 0 && body.indexOf("/") < 0) {
      f.replaceToken(i, SW_COMMENT, fileName, 0);
    }
  }
};

const SW_MODIFIER_ORDER: string =
  "override private fileprivate internal package public open private(set) fileprivate(set) internal(set) package(set) public(set) open(set) final dynamic optional required indirect isolated nonisolated nonisolated(unsafe) lazy weak unowned unowned(safe) unowned(unsafe) static class borrowing consuming __consuming mutating nonmutating prefix infix postfix async convenience";

/** modifierOrder. */
export const swRuleModifierOrder = (f: SwFormatter): void => {
  const order: string[] = [];
  let st = 0;
  for (let j = 0; j <= toI32(SW_MODIFIER_ORDER.length); j++) {
    if (j === toI32(SW_MODIFIER_ORDER.length) || SW_MODIFIER_ORDER.charCodeAt(j) === 32) {
      order.push(SW_MODIFIER_ORDER.substring(st, j));
      st = j + 1;
    }
  }
  for (let i = f.enumStart(); i >= 0; i = f.enumNext()) {
    if (f.k(i) !== SW_KEYWORD || f.s(i).startsWith("@") || !swIsDeclarationTypeKeyword(f, i)) {
      continue;
    }
    const names: string[] = [];
    const ranges: SwTok[][] = [];
    let lastName = "";
    let lastToks: SwTok[] = [];
    let hasLast = false;
    let lastIndex = i;
    let previousIndex = lastIndex;
    while (true) {
      const index = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, lastIndex);
      if (index < 0) {
        break;
      }
      if ((f.k(index) === SW_OP && (f.a(index) === SW_OP_PREFIX || f.a(index) === SW_OP_INFIX)) || f.kw(index, "case")) {
        hasLast = false;
        lastIndex = previousIndex;
        break;
      }
      if (swIsModifier(f, index)) {
        if (hasLast) {
          swSetModifier(names, ranges, lastName, lastToks);
        }
        hasLast = true;
        lastName = f.s(index);
        lastToks = f.slice(index, lastIndex);
        previousIndex = lastIndex;
        lastIndex = index;
        continue;
      }
      if (f.tok(index, SW_END, ")")) {
        const pi = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
        const op = f.indexOfBefore(SW_START, "(", 0, index);
        const mi = op >= 0 ? f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, op) : -1;
        if (pi >= 0 && f.k(pi) === SW_IDENT && mi >= 0 && swIsModifier(f, mi)) {
          if (hasLast) {
            swSetModifier(names, ranges, lastName, lastToks);
          }
          hasLast = true;
          lastName = f.s(mi) + (f.s(pi) === "set" ? "(set)" : "");
          lastToks = f.slice(mi, lastIndex);
          previousIndex = lastIndex;
          lastIndex = mi;
          continue;
        }
        break;
      }
      break;
    }
    if (hasLast) {
      swSetModifier(names, ranges, lastName, lastToks);
    }
    if (names.length === 0) {
      continue;
    }
    const sorted: SwTok[] = [];
    for (const m of order) {
      const q = names.indexOf(m);
      if (q >= 0) {
        for (const t of ranges[q]) {
          sorted.push(t);
        }
      }
    }
    f.replaceTokens(lastIndex, i, sorted);
  }
};

const swSetModifier = (names: string[], ranges: SwTok[][], name: string, toks: SwTok[]): void => {
  const q = names.indexOf(name);
  if (q >= 0) {
    ranges[q] = toks;
  } else {
    names.push(name);
    ranges.push(toks);
  }
};

/** unwrapLine(before:preservingComments: true) (maxWidth is 0). */
export const swUnwrapLine = (f: SwFormatter, tokenIndex: i32): void => {
  const nw = f.indexBefore(SW_T_NON_SPACE_OR_LINEBREAK, tokenIndex);
  if (nw < 0 || f.k(nw) === SW_COMMENT) {
    return;
  }
  f.replaceTokens(nw + 1, tokenIndex, [new SwTok(SW_SPACE, " ", 0)]);
};

const swModifiersOnSameLineDecls = (f: SwFormatter, ds: SwDecl[]): void => {
  for (const d of ds) {
    swModifiersOnSameLineDecl(f, d);
    swModifiersOnSameLineDecls(f, d.body);
  }
};

const swModifiersOnSameLineDecl = (f: SwFormatter, d: SwDecl): void => {
  const ki = swDeclKeywordIndex(f, d);
  if (ki < 0) {
    return;
  }
  let ms = swStartOfModifiers(f, ki, false);
  const lo = swDeclLo(f, d);
  if (ms < lo) {
    ms = lo;
  }
  if (!(ms < ki) || f.onSameLine(ms, ki)) {
    return;
  }
  for (let j = ms; j < ki; j++) {
    if (f.isComment(j)) {
      return;
    }
  }
  let cur = ki;
  while (cur > ms) {
    const prev = f.indexBefore(SW_T_NON_SPACE_OR_LINEBREAK, cur);
    if (prev < 0) {
      break;
    }
    let lb = false;
    for (let j = prev + 1; j < cur; j++) {
      if (f.k(j) === SW_LINEBREAK) {
        lb = true;
        break;
      }
    }
    if (lb) {
      swUnwrapLine(f, cur);
    }
    cur = prev;
  }
};

/** modifiersOnSameLine. */
export const swRuleModifiersOnSameLine = (f: SwFormatter): void => {
  const ds = swParseDeclarations(f);
  swModifiersOnSameLineDecls(f, ds);
  swReleaseDecls(f, ds);
};

/** consistentSwitchCaseSpacing (blankLineAfterSwitchCase is disabled). */
export const swRuleConsistentSwitchCaseSpacing = (f: SwFormatter): void => {
  for (let si = f.enumStart(); si >= 0; si = f.enumNext()) {
    if (!f.kw(si, "switch")) {
      continue;
    }
    const br = swSwitchStatementBranches(f, si);
    if (br === null) {
      continue;
    }
    const followed: boolean[] = [];
    const last: boolean[] = [];
    const lbEnd: i32[] = [];
    const lbBlank: i32[] = [];
    const nb = toI32(br.starts.length);
    for (let c = 0; c < nb; c++) {
      const sb = br.starts[c];
      const eb = br.ends[c];
      if (f.kw(eb, "#else") || f.kw(eb, "#elseif")) {
        continue;
      }
      let s0 = sb;
      while (true) {
        const t = f.indexAfter(SW_T_NON_SPACE, s0);
        if (t < 0 || f.k(t) !== SW_LINEBREAK) {
          break;
        }
        const cm = f.indexAfter(SW_T_NON_SPACE, t);
        if (cm < 0 || !f.isComment(cm)) {
          break;
        }
        const ec = swEndOfScope(f, cm);
        if (ec < 0) {
          break;
        }
        const tb = f.indexBefore(SW_T_NON_SPACE, ec);
        if (tb < 0) {
          break;
        }
        s0 = f.k(ec) === SW_LINEBREAK ? tb : ec;
      }
      let e0 = eb;
      while (true) {
        const t = f.indexBefore(SW_T_NON_SPACE, e0);
        if (t < 0 || f.k(t) !== SW_LINEBREAK) {
          break;
        }
        const cm = f.indexBefore(SW_T_NON_SPACE, t);
        if (cm < 0 || !f.isComment(cm)) {
          break;
        }
        const sc = swStartOfScope(f, cm);
        if (sc < 0 || !f.isComment(sc)) {
          break;
        }
        e0 = sc;
      }
      const ft = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, s0);
      const lt = f.indexBefore(SW_T_NON_SPACE_OR_LINEBREAK, e0);
      if (ft < 0 || lt < 0) {
        continue;
      }
      let endDetect = e0;
      if (f.tok(eb, SW_END, "#endif")) {
        const ta = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, eb);
        if (ta >= 0) {
          endDetect = ta;
        }
      }
      let lbe = -1;
      let lbb = -1;
      let isFollowed = false;
      const tbe = f.indexBefore(SW_T_NON_SPACE, endDetect);
      if (tbe >= 0 && f.k(tbe) === SW_LINEBREAK) {
        lbe = tbe;
      }
      if (lbe >= 0) {
        const tbb = f.indexBefore(SW_T_NON_SPACE, lbe);
        if (tbb >= 0 && f.k(tbb) === SW_LINEBREAK) {
          lbb = tbb;
          isFollowed = true;
        }
      }
      followed.push(isFollowed);
      last.push(c === nb - 1);
      lbEnd.push(lbe);
      lbBlank.push(lbb);
    }
    let withBlank = 0;
    let without = 0;
    for (let q = 0; q < toI32(followed.length); q++) {
      if (!last[q]) {
        if (followed[q]) {
          withBlank++;
        } else {
          without++;
        }
      }
    }
    const all = withBlank >= without;
    for (let q = toI32(followed.length) - 1; q >= 0; q--) {
      if (!followed[q] && all && !last[q]) {
        if (lbEnd[q] >= 0) {
          f.insertLinebreak(lbEnd[q]);
        }
      }
      if (followed[q] && (!all || last[q])) {
        if (lbEnd[q] >= 0 && lbBlank[q] >= 0) {
          f.removeTokens(lbBlank[q] + 1, lbEnd[q] + 1);
        }
      }
    }
  }
};

/** parseProtocolCompositionTypealias(at:): [equals, end, and...] or null. */
const swParseProtocolCompositionTypealias = (f: SwFormatter, ti: i32): i32[] | null => {
  const eq = f.indexOfAfter(SW_OP, "=", SW_OP_INFIX, ti);
  if (eq < 0) {
    return null;
  }
  const st = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, eq);
  if (st < 0) {
    return null;
  }
  const full = swParseType(f, st);
  if (full < 0) {
    return null;
  }
  const out: i32[] = [eq, full];
  let cur = st;
  while (true) {
    const nt = swParseType(f, cur, false, true);
    if (nt < 0) {
      break;
    }
    const na = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, nt);
    if (na < 0 || !f.op(na, "&", SW_OP_INFIX)) {
      break;
    }
    const ta = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, na);
    if (ta < 0) {
      break;
    }
    out.push(na);
    cur = ta;
  }
  if (out.length === 2) {
    return null;
  }
  return out;
};

class SwTaElem {
  start: i32;
  delim: i32;
  end: i32;
  type: string;
  toks: SwTok[];
  dup: boolean;
  constructor(start: i32, delim: i32, end: i32, type: string, toks: SwTok[], dup: boolean) {
    this.start = start;
    this.delim = delim;
    this.end = end;
    this.type = type;
    this.toks = toks;
    this.dup = dup;
  }
}

const swTaKey = (t: string): string => (t.startsWith("any") ? t.substring(3) : t);

/** sortTypealiases. */
export const swRuleSortTypealiases = (f: SwFormatter): void => {
  for (let ti = f.enumStart(); ti >= 0; ti = f.enumNext()) {
    if (!f.kw(ti, "typealias")) {
      continue;
    }
    const pc = swParseProtocolCompositionTypealias(f, ti);
    if (pc === null) {
      continue;
    }
    const eq = pc[0];
    const endIndex = pc[1];
    const nameIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, eq);
    if (nameIndex < 0) {
      continue;
    }
    const delims: i32[] = [eq];
    for (let q = 2; q < toI32(pc.length); q++) {
      delims.push(pc[q]);
    }
    const seen: string[] = [];
    const parsed: SwTaElem[] = [];
    let bad = false;
    for (let d = 0; d < toI32(delims.length); d++) {
      const eop = parsed.length === 0 ? nameIndex : parsed[toI32(parsed.length) - 1].end;
      let es = f.indexAfter(SW_T_NON_SPACE_OR_LINEBREAK, eop);
      if (es < 0) {
        es = delims[d];
      }
      let ee = 0;
      let sameLine = false;
      if (d === toI32(delims.length) - 1) {
        ee = endIndex;
      } else {
        const nd = delims[d + 1];
        ee = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, nd);
        if (ee < 0) {
          ee = nd - 1;
        }
        sameLine = f.endOfLine(nd) === f.endOfLine(ee);
      }
      if (!sameLine) {
        ee = f.endOfLine(ee) - 1;
      }
      if (ee < es) {
        bad = true;
        break;
      }
      const toks = f.slice(es, ee + 1);
      const parts: string[] = [];
      for (let j = es; j <= ee; j++) {
        const k = f.k(j);
        if (!(k === SW_SPACE || k === SW_LINEBREAK || f.isComment(j)) && k !== SW_OP) {
          parts.push(f.s(j));
        }
      }
      const tn = parts.join("");
      const dup = seen.indexOf(tn) >= 0;
      seen.push(tn);
      parsed.push(new SwTaElem(es, delims[d], ee, tn, toks, dup));
    }
    if (bad) {
      continue;
    }
    const sorted: SwTaElem[] = [];
    for (const e of parsed) {
      sorted.push(e);
    }
    for (let a = 1; a < toI32(sorted.length); a++) {
      const x = sorted[a];
      let b = a - 1;
      while (b >= 0 && swStrLess(swTaKey(x.type), swTaKey(sorted[b].type))) {
        sorted[b + 1] = sorted[b];
        b--;
      }
      sorted[b + 1] = x;
    }
    let same = true;
    for (let q = 0; q < toI32(parsed.length); q++) {
      if (parsed[q].start !== sorted[q].start) {
        same = false;
      }
    }
    if (same) {
      continue;
    }
    let firstNonDup = -1;
    for (let q = 0; q < toI32(sorted.length); q++) {
      if (!sorted[q].dup) {
        firstNonDup = q;
        break;
      }
    }
    const newToks: SwTok[][] = [];
    for (let q = 0; q < toI32(sorted.length); q++) {
      const e = sorted[q];
      const toks: SwTok[] = [];
      for (const t of e.toks) {
        toks.push(t);
      }
      const di = e.delim - e.start;
      if (q === firstNonDup) {
        toks[di] = new SwTok(SW_OP, "=", SW_OP_INFIX);
      } else {
        toks[di] = new SwTok(SW_OP, "&", SW_OP_INFIX);
      }
      if (q !== toI32(sorted.length) - 1) {
        const lastTok = toks[toI32(toks.length) - 1];
        const pe = parsed[q].end;
        const nt = swIndexAfterWhere(f, pe, (g, j) => g.has(j));
        if (swKindIsCommentTok(lastTok) && nt >= 0 && f.k(nt) !== SW_LINEBREAK) {
          toks.push(new SwTok(SW_LINEBREAK, "\n", f.linebreakLine(pe)));
        }
      }
      if (q !== 0 && swKindIsCommentTok(toks[0])) {
        const ps = parsed[q].start;
        const pt = swIndexBeforeWhere(f, ps, (g, j) => g.k(j) !== SW_SPACE);
        if (pt >= 0 && f.k(pt) !== SW_LINEBREAK) {
          const lbt = new SwTok(SW_LINEBREAK, "\n", f.linebreakLine(ps));
          const withLb: SwTok[] = [lbt];
          for (const t of toks) {
            withLb.push(t);
          }
          newToks.push(withLb);
          continue;
        }
      }
      newToks.push(toks);
    }
    for (let q = toI32(parsed.length) - 1; q >= 0; q--) {
      const o = parsed[q];
      const nw = sorted[q];
      const tb = f.indexBefore(SW_T_NON_SPACE_OR_LINEBREAK, o.start);
      if (nw.dup && tb >= 0) {
        f.removeTokens(tb + 1, o.end + 1);
      } else {
        f.replaceTokens(o.start, o.end + 1, newToks[q]);
      }
    }
    const neq = f.indexOfAfter(SW_OP, "=", SW_OP_INFIX, ti);
    if (neq >= 0) {
      const sot = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, neq);
      const pc2 = swParseProtocolCompositionTypealias(f, ti);
      const fa = f.indexOfAfter(SW_OP, "&", SW_OP_INFIX, neq);
      if (sot >= 0 && pc2 !== null && fa >= 0) {
        const ai = f.indexOfIn(SW_IDENT, "any", 0, fa, pc2[1] + 1);
        if (ai >= 0) {
          const re = f.has(ai + 1) && f.k(ai + 1) === SW_SPACE ? ai + 1 : ai;
          f.removeTokens(ai, re + 1);
          f.insertToks([new SwTok(SW_IDENT, "any", 0), new SwTok(SW_SPACE, " ", 0)], sot);
        }
      }
    }
  }
};

const swKindIsCommentTok = (t: SwTok): boolean => t.k === SW_COMMENT || (t.k === SW_START && (t.s === "//" || t.s === "/*")) || (t.k === SW_END && t.s === "*/");
