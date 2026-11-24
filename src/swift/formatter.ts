// SwiftFormat's Formatter: the token array a rule edits, with enumeration
// that survives edits and the scope-aware token searches the rules use.
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import {
  SW_COMMENT,
  SW_END,
  SW_KEYWORD,
  SW_LINEBREAK,
  SW_OP,
  SW_SPACE,
  SW_START,
  SW_STRBODY,
  SW_T_KEYWORD,
  SW_T_START_OF_SCOPE,
  SwTok,
  SwTokList,
  swIsEndOfScopeOf,
  swClosesByCode,
  swTokIsAt,
  SW_SC_COLON,
  SW_SC_END_BRACE,
  SW_SC_ENDIF,
  SW_SC_IF,
  SW_SC_LINE_COMMENT,
  SW_SC_BLOCK_COMMENT,
  SW_SC_END_BLOCK_COMMENT,
  SW_SC_KEYWORD,
  SW_T_LINEBREAK,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
  SW_SC_ATTRIBUTE,
  SW_SC_CASE,
  SW_SC_DEFAULT,
  swIsMultilineStringDelimiter,
  swIsSwitchCaseOrDefault,
  swKindIsComment,
  swTokIs,
} from "./token";
import { add32, sub32 } from "../core/arr";
import { fault } from "../core/fault";

/** The line after a linebreak's original line (its aux value). */
const swLineAfter = (v: i32): i32 => {
  if (v < 2147483647) {
    return v + 1;
  }
  fault();
  return 1;
};

/** A declaration; its range is an auto-updating reference in the formatter. */
export class SwDecl {
  keyword: string;
  kind: i32;
  h: i32;
  body: SwDecl[];
  parent: SwDecl | null = null;
  constructor(keyword: string, kind: i32, h: i32) {
    this.keyword = keyword;
    this.kind = kind;
    this.h = h;
    this.body = [];
  }
}

export class SwFormatter {
  t: SwTokList;
  // forEachToken's enumerationIndex.
  ei: i32 = -1;
  // The rule being applied (for messages).
  rule: string = "";
  errors: string[];
  ruleDisabled: boolean = false;
  // Auto-updating indices and ranges (AutoUpdatingIndex / AutoUpdatingRange): [lo, hi] pairs.
  refLo: i32[];
  refHi: i32[];
  refLive: boolean[];
  // Incremented on every change (Formatter.mutationCount).
  mutations: i32 = 0;
  path: string = "";
  // When set, the only enabled rule (options.enabledRules for `--rules name`).
  only: string = "";
  // enclosingStringDelimiters, cached for one mutation count.
  enc: i32[];
  encMut: i32 = -1;
  // endOfScope(at:) results, each valid while its stamp equals mutations + 1.
  eoVal: i32[];
  eoGen: i32[];
  // index(of: .startOfScope, before:) results, stamped the same way.
  csVal: i32[];
  csGen: i32[];
  // index(of: .keyword, before:) results, stamped the same way.
  kwVal: i32[];
  kwGen: i32[];
  // hasImport: the imported module names as " a b ", valid while impMut equals mutations.
  impNames: string = "";
  impMut: i32 = -1;
  // parseDeclarations(), kept while declCacheMut equals mutations (no directives).
  declCache: SwDecl[] | null = null;
  declCacheMut: i32 = -1;
  // `swiftformat:` directives (Formatter.directives), parallel arrays: type (0 enable,
  // 1 disable), toggle, line, index in line, and the rule names as " a b ".
  dirType: i32[];
  dirToggle: boolean[];
  dirLine: i32[];
  dirIndex: i32[];
  dirNames: string[];
  // Formatter.disabled, set by updateEnablement.
  disabled: boolean = false;
  // The current rule's directive names (lowercased name and old names) as " a b ".
  ruleNames: string = "";
  // containsMultilineStringLiteral: -1 unknown, 0 no, 1 yes.
  multilineStrings: i32 = -1;

  constructor(t: SwTokList) {
    this.t = t;
    this.errors = [];
    this.refLo = [];
    this.refHi = [];
    this.refLive = [];
    this.enc = [];
    this.eoVal = [];
    this.eoGen = [];
    this.csVal = [];
    this.csGen = [];
    this.kwVal = [];
    this.kwGen = [];
    this.dirType = [];
    this.dirToggle = [];
    this.dirLine = [];
    this.dirIndex = [];
    this.dirNames = [];
  }

  count(): i32 {
    return toI32(this.t.k.length);
  }

  // The accessors below read one token. An index outside the list is a
  // rule's bug (the read panicked before): it faults and answers a neutral
  // value. The token arrays always have one length (SwTokList), so a test
  // against the kinds' length decides, and the others only prove the reads.

  k(i: i32): i32 {
    const tk = this.t.k;
    if (i >= 0 && i < tk.length) {
      return tk[i];
    }
    fault();
    return -1;
  }

  s(i: i32): string {
    const ts = this.t.s;
    if (i >= 0 && i < ts.length) {
      return ts[i];
    }
    fault();
    return "";
  }

  a(i: i32): i32 {
    const ta = this.t.a;
    if (i >= 0 && i < ta.length) {
      return ta[i];
    }
    fault();
    return 0;
  }

  has(i: i32): boolean {
    return i >= 0 && i < toI32(this.t.k.length);
  }

  /** tokens[i].is(type), false when out of range. */
  is(i: i32, type: i32): boolean {
    const t = this.t;
    const tk = t.k;
    const ts = t.s;
    const ta = t.a;
    if (i < 0 || i >= tk.length || i >= ts.length || i >= ta.length) {
      return false;
    }
    return swTokIs(tk[i], ts[i], ta[i], type);
  }

  /** tokens[i] == Token(k, s) for a token with no aux value (aux 0). */
  tok(i: i32, k: i32, s: string): boolean {
    const t = this.t;
    const tk = t.k;
    // The kind decides most calls, so the other arrays are read only after it.
    if (i < 0 || i >= tk.length || tk[i] !== k) {
      return false;
    }
    const ta = t.a;
    const ts = t.s;
    return i < ta.length && i < ts.length && ta[i] === 0 && ts[i] === s;
  }

  /** The kind and string match (any aux: `case .operator(s, _)`). */
  ks(i: i32, k: i32, s: string): boolean {
    const t = this.t;
    const tk = t.k;
    if (i < 0 || i >= tk.length || tk[i] !== k) {
      return false;
    }
    const ts = t.s;
    return i < ts.length && ts[i] === s;
  }

  op(i: i32, s: string, type: i32): boolean {
    const t = this.t;
    const tk = t.k;
    if (i < 0 || i >= tk.length || tk[i] !== SW_OP) {
      return false;
    }
    const ta = t.a;
    const ts = t.s;
    return i < ta.length && i < ts.length && ta[i] === type && ts[i] === s;
  }

  /** tokens[i] == Token(k, s, a); an index outside the list faults. */
  eq(i: i32, k: i32, s: string, a: i32): boolean {
    const t = this.t;
    const tk = t.k;
    if (i < 0 || i >= tk.length) {
      fault();
      return false;
    }
    if (tk[i] !== k) {
      return false;
    }
    const ta = t.a;
    const ts = t.s;
    return i < ta.length && i < ts.length && ta[i] === a && ts[i] === s;
  }

  kw(i: i32, s: string): boolean {
    return this.tok(i, SW_KEYWORD, s);
  }

  isComment(i: i32): boolean {
    const t = this.t;
    const tk = t.k;
    if (i < 0 || i >= tk.length) {
      return false;
    }
    // swKindIsComment, reading the string only for a scope token.
    const k = tk[i];
    if (k === SW_COMMENT) {
      return true;
    }
    if (k !== SW_START && k !== SW_END) {
      return false;
    }
    const ts = t.s;
    return i < ts.length && swKindIsComment(k, ts[i]);
  }

  /** Whether token i and j are equal (kind, string and aux). */
  same(i: i32, j: i32): boolean {
    const t = this.t;
    const tk = t.k;
    const ts = t.s;
    const ta = t.a;
    if (i < 0 || j < 0 || i >= tk.length || j >= tk.length || i >= ts.length || j >= ts.length) {
      fault();
      return false;
    }
    if (i >= ta.length || j >= ta.length) {
      fault();
      return false;
    }
    return tk[i] === tk[j] && ta[i] === ta[j] && ts[i] === ts[j];
  }

  /** tokens[i].isEndOfScope(tokens[j]). */
  closes(i: i32, j: i32): boolean {
    return swClosesByCode(this.t, i, j);
  }

  // MARK: enablement

  /** options.enabledRules.contains(name). */
  ruleEnabled(name: string): boolean {
    return this.only.length === 0 || this.only === name;
  }

  isEnabled(): boolean {
    return !this.ruleDisabled && !this.disabled;
  }

  hasDirectives(): boolean {
    return this.dirType.length !== 0;
  }

  /** Directive.applies(to: currentRule). */
  directiveApplies(d: i32): boolean {
    const dn = this.dirNames;
    if (d < 0 || d >= dn.length) {
      fault();
      return false;
    }
    const names = dn[d];
    if (names.indexOf(" all ") >= 0) {
      return true;
    }
    const n = toI32(names.length);
    let start = 1;
    while (start > 0 && start < n) {
      const e = names.indexOf(" ", start);
      // The names are " a b " (swDirectiveRuleNames): a space follows every name.
      if (e < start || e >= n) {
        fault();
        return false;
      }
      if (this.ruleNames.indexOf(names.substring(start - 1, e + 1)) >= 0) {
        return true;
      }
      start = e + 1;
    }
    return false;
  }

  /** Whether any directive applies to the current rule. */
  anyDirectiveApplies(): boolean {
    for (let d = 0; d < toI32(this.dirType.length); d++) {
      if (this.directiveApplies(d)) {
        return true;
      }
    }
    return false;
  }

  /** The line (from the last linebreak's original line number) of token i: Formatter's physical line. */
  private lineOf(i: i32): i32 {
    const tk = this.t.k;
    const ta = this.t.a;
    if (i >= tk.length) {
      fault();
      return 1;
    }
    for (let j = i; j >= 0 && j < tk.length && j < ta.length; j--) {
      if (tk[j] === SW_LINEBREAK) {
        return swLineAfter(ta[j]);
      }
    }
    return 1;
  }

  /** updateEnablement(at:). */
  updateEnablement(index: i32): void {
    const nd = toI32(this.dirType.length);
    if (nd === 0) {
      return;
    }
    const dirType = this.dirType;
    const dirToggle = this.dirToggle;
    const dirLine = this.dirLine;
    const dirIndex = this.dirIndex;
    // The directive arrays are filled together (swProcessDirectives).
    if (dirToggle.length < nd || dirLine.length < nd || dirIndex.length < nd) {
      fault();
      return;
    }
    const physicalLine = this.lineOf(index);
    let hasApplicableLineDirective = false;
    for (let d = 0; d < nd && d < dirToggle.length && d < dirLine.length; d++) {
      if (!dirToggle[d] && dirLine[d] === physicalLine && this.directiveApplies(d)) {
        hasApplicableLineDirective = true;
        break;
      }
    }
    const tk = this.t.k;
    const ts = this.t.s;
    const ta = this.t.a;
    if (this.multilineStrings < 0) {
      this.multilineStrings = 0;
      for (let j = 0; j < tk.length && j < ts.length; j++) {
        if (swIsMultilineStringDelimiter(tk[j], ts[j])) {
          this.multilineStrings = 1;
          break;
        }
      }
    }
    if (index < 0 || index >= tk.length) {
      fault();
      return;
    }
    let enablementIndex = index;
    if (tk[index] === SW_LINEBREAK && !hasApplicableLineDirective && this.multilineStrings === 1) {
      const startIndex = swIndexBeforeWhere(this, index, (f, j) => {
        const k = f.k(j);
        return !(k === SW_SPACE || k === SW_LINEBREAK || k === SW_STRBODY || k === SW_END);
      });
      if (startIndex >= 0 && startIndex < tk.length && startIndex < ts.length) {
        if (swIsMultilineStringDelimiter(tk[startIndex], ts[startIndex])) {
          enablementIndex = startIndex;
        }
      }
    }
    let line = 1;
    let tokenIndex = enablementIndex;
    if (enablementIndex < 0 || enablementIndex >= tk.length || enablementIndex >= ta.length) {
      fault();
      return;
    }
    if (tk[enablementIndex] === SW_LINEBREAK) {
      line = swLineAfter(ta[enablementIndex]);
      tokenIndex = 0;
    } else {
      for (let j = enablementIndex - 1; j >= 0 && j < tk.length && j < ta.length; j--) {
        if (tk[j] === SW_LINEBREAK) {
          line = swLineAfter(ta[j]);
          // 0 <= j < enablementIndex.
          tokenIndex = toI32(toU32(enablementIndex) - toU32(j) - toU32(1));
          break;
        }
      }
    }
    // disabledCount and disabledNext, each kept as disables minus enables: every
    // directive adds one to one side, so each side stays below nd.
    let countUp = 0;
    let countDown = 0;
    let nextUp = 0;
    let nextDown = 0;
    for (
      let d = 0;
      d < nd && d < dirType.length && d < dirToggle.length && d < dirLine.length && d < dirIndex.length;
      d++
    ) {
      if (dirLine[d] > line || (dirLine[d] === line && dirIndex[d] > tokenIndex)) {
        break;
      }
      if (!this.directiveApplies(d)) {
        continue;
      }
      if (d >= dirType.length || d >= dirToggle.length || d >= dirLine.length) {
        fault();
        return;
      }
      const up = dirType[d] === 1;
      if (dirToggle[d]) {
        if (up && countUp < nd) {
          countUp++;
        } else if (!up && countDown < nd) {
          countDown++;
        }
      } else if (dirLine[d] === line) {
        if (up && nextUp < nd) {
          nextUp++;
        } else if (!up && nextDown < nd) {
          nextDown++;
        }
      } else {
        nextUp = 0;
        nextDown = 0;
      }
    }
    this.disabled = toI64(countUp) - toI64(countDown) + toI64(nextUp) - toI64(nextDown) > toI64(0);
  }

  /** Whether token i starts or ends a comment or is a linebreak (forEachToken updates enablement there). */
  private isEnablementPoint(i: i32): boolean {
    const tk = this.t.k;
    const ts = this.t.s;
    if (i < 0 || i >= tk.length || i >= ts.length) {
      fault();
      return true;
    }
    const k = tk[i];
    if (k === SW_LINEBREAK) {
      return true;
    }
    const s = ts[i];
    return (k === SW_START && (s === "//" || s === "/*")) || (k === SW_END && s === "*/");
  }

  /** The enablement forEachToken(in: lo..., onlyWhereEnabled: false) would see at index i. */
  enabledInLoopAt(i: i32, lo: i32): boolean {
    if (this.dirType.length === 0) {
      return !this.ruleDisabled;
    }
    let j = i;
    while (j > lo) {
      if (this.isEnablementPoint(j)) {
        break;
      }
      if (j <= 0) {
        // The next step read token -1.
        fault();
        break;
      }
      j--;
    }
    this.updateEnablement(j);
    return this.isEnabled();
  }

  fatalError(msg: string, _at: i32): void {
    this.errors.push(`[${this.rule}] ${msg}`);
    this.ruleDisabled = true;
  }

  // MARK: auto-updating references

  /** Registers an auto-updating range [lo, hi]; answers its handle. */
  ref(lo: i32, hi: i32): i32 {
    this.refLo.push(lo);
    this.refHi.push(hi);
    this.refLive.push(true);
    return toI32(this.refLo.length) - 1;
  }

  /** The low end of reference h; an unknown handle faults and answers -1. */
  refLoOf(h: i32): i32 {
    const refLo = this.refLo;
    if (h >= 0 && h < refLo.length) {
      return refLo[h];
    }
    fault();
    return -1;
  }

  /** The high end of reference h; an unknown handle faults and answers -1. */
  refHiOf(h: i32): i32 {
    const refHi = this.refHi;
    if (h >= 0 && h < refHi.length) {
      return refHi[h];
    }
    fault();
    return -1;
  }

  unref(h: i32): void {
    const live = this.refLive;
    if (h >= 0 && h < live.length) {
      live[h] = false;
    } else {
      fault();
    }
  }

  private updateRefs(at: i32, delta: i32): void {
    const refLo = this.refLo;
    const refHi = this.refHi;
    const refLive = this.refLive;
    for (let r = 0; r < refLo.length && r < refHi.length && r < refLive.length; r++) {
      if (!refLive[r]) {
        continue;
      }
      let lo = refLo[r];
      let hi = refHi[r];
      if (at < lo) {
        lo = add32(lo, delta);
        hi = add32(hi, delta);
      } else if (at <= hi) {
        hi = add32(hi, delta);
      }
      if (lo > hi) {
        hi = lo;
      }
      if (r >= refLo.length || r >= refHi.length) {
        fault();
        return;
      }
      refLo[r] = lo;
      refHi[r] = hi;
    }
  }

  /** Counts one change (Formatter.mutationCount). */
  private bump(): void {
    const m = this.mutations;
    if (m < 2147483647) {
      this.mutations = m + 1;
    } else {
      fault();
    }
  }

  // MARK: access and mutation

  replaceToken(i: i32, k: i32, s: string, a: i32): void {
    const t = this.t;
    const tk = t.k;
    const ts = t.s;
    const ta = t.a;
    if (i < 0 || i >= tk.length || i >= ts.length || i >= ta.length) {
      fault();
      return;
    }
    // Replacing a token with an equal one changes nothing the caches depend on.
    if (tk[i] === k && ta[i] === a && ts[i] === s) {
      return;
    }
    t.set(i, k, s, a);
    this.bump();
  }

  replaceTokenWith(i: i32, toks: SwTok[]): void {
    if (toks.length <= 0) {
      this.removeToken(i);
      return;
    }
    if (i < 0 || i >= this.count()) {
      fault();
      return;
    }
    const t0 = toks[0];
    this.replaceToken(i, t0.k, t0.s, t0.a);
    this.insertToksFrom(toks, 1, i + 1);
  }

  /** replaceTokens(in: lo ..< hi, with: toks); answers the change in token count. */
  replaceTokens(lo: i32, hi: i32, toks: SwTok[]): i32 {
    const m = toI32(toks.length);
    const rc = sub32(hi, lo);
    const mx = rc < m ? rc : m;
    for (let i = 0; i < mx && i < toks.length; i++) {
      const ti = toks[i];
      this.replaceToken(add32(lo, i), ti.k, ti.s, ti.a);
    }
    if (rc > mx) {
      const end = add32(lo, mx);
      for (let index = sub32(hi, 1); index >= end; index--) {
        this.removeToken(index);
        if (index < 0) {
          // removeToken faulted.
          break;
        }
      }
    } else if (m > mx) {
      this.insertToksFrom(toks, mx, add32(lo, mx));
    }
    return sub32(m, rc);
  }

  /** replaceTokens(in: lo ..< hi, with: token). */
  replaceTokensWith1(lo: i32, hi: i32, k: i32, s: string, a: i32): i32 {
    const rc = sub32(hi, lo);
    if (rc === 1) {
      this.replaceToken(lo, k, s, a);
    } else if (rc === 0) {
      this.insert(k, s, a, lo);
    } else {
      this.replaceToken(lo, k, s, a);
      this.removeTokens(add32(lo, 1), hi);
    }
    return sub32(1, rc);
  }

  removeToken(i: i32): void {
    this.updateRefs(i, -1);
    if (i < 0) {
      fault();
      return;
    }
    this.t.removeAt(i);
    this.bump();
    const ei = this.ei;
    if (ei >= i && ei >= 0) {
      this.ei = ei - 1;
    }
  }

  /** removeTokens(in: lo ..< hi), last first (references and the enumeration index are updated
   *  as for one removal at a time; the tokens move once). */
  removeTokens(lo: i32, hi: i32): void {
    const span = sub32(hi, lo);
    if (span <= 1) {
      if (span === 1) {
        this.removeToken(lo);
      }
      return;
    }
    if (lo < 0 || hi <= 0) {
      // removeRange(lo, hi) panicked on a negative lo.
      fault();
      return;
    }
    for (let i = hi - 1; i >= lo && i >= 0; i--) {
      this.updateRefs(i, -1);
      const ei = this.ei;
      if (ei >= i && ei >= 0) {
        this.ei = ei - 1;
      }
    }
    this.t.removeRange(lo, hi);
    this.bump();
  }

  removeLastToken(): void {
    const i = toI32(this.t.k.length) - 1;
    this.updateRefs(i, -1);
    this.t.removeAt(i);
    this.bump();
  }

  insert(k: i32, s: string, a: i32, at: i32): void {
    this.updateRefs(at, 1);
    this.t.insertAt(at, k, s, a);
    this.bump();
    const ei = this.ei;
    if (ei >= at) {
      this.ei = add32(ei, 1);
    }
  }

  insertToks(toks: SwTok[], at: i32): void {
    this.insertToksFrom(toks, 0, at);
  }

  insertToksFrom(toks: SwTok[], from: i32, at: i32): void {
    if (from < 0) {
      // toks[from] panicked.
      fault();
      return;
    }
    const m = toI32(toks.length) - from;
    if (m <= 0) {
      return;
    }
    this.updateRefs(at, m);
    this.t.openGap(at, m);
    let d = at;
    for (let j = from; j < toks.length; j++) {
      const tk = this.t.k;
      if (d < 0 || d >= tk.length) {
        fault();
        return;
      }
      const tj = toks[j];
      this.t.set(d, tj.k, tj.s, tj.a);
      d = d + 1;
    }
    this.bump();
    const ei = this.ei;
    if (ei >= at) {
      this.ei = add32(ei, m);
    }
  }

  /** The tokens [lo, hi) as values. */
  slice(lo: i32, hi: i32): SwTok[] {
    const out: SwTok[] = [];
    const t = this.t;
    const tk = t.k;
    const ts = t.s;
    const ta = t.a;
    if (lo < hi && (lo < 0 || hi > tk.length)) {
      fault();
      return out;
    }
    for (let i = lo; i >= 0 && i < hi && i < tk.length && i < ts.length && i < ta.length; i++) {
      out.push(new SwTok(tk[i], ts[i], ta[i]));
    }
    return out;
  }

  /** moveTokens(in: lo ... hi, to: newIndex). */
  moveTokens(lo: i32, hi: i32, newIndex0: i32): void {
    const toks = this.slice(lo, add32(hi, 1));
    if (lo > hi) {
      return;
    }
    if (lo < 0) {
      fault();
      return;
    }
    let newIndex = newIndex0;
    for (let index = hi; index >= lo && index >= 0; index--) {
      this.removeToken(index);
      if (index < newIndex && newIndex > 0) {
        newIndex--;
      }
    }
    this.insertToks(toks, newIndex);
  }

  // MARK: enumeration

  /** Starts forEachToken; answers the first index (or -1). */
  enumStart(): i32 {
    this.ei = 0;
    if (this.ei >= this.count()) {
      this.ei = -1;
      return -1;
    }
    if (this.dirType.length === 0) {
      return this.ei;
    }
    this.updateEnablement(0);
    return this.enumSkip(true);
  }

  /** Advances forEachToken; answers the next index (or -1 at the end). */
  enumNext(): i32 {
    const ei = this.ei;
    if (ei >= toI32(this.t.k.length) - 1) {
      this.ei = -1;
      return -1;
    }
    this.ei = ei + 1;
    if (this.dirType.length === 0) {
      return this.ei;
    }
    return this.enumSkip(true);
  }

  /** forEachToken(onlyWhereEnabled: false): starts; enablement is updated but nothing is skipped. */
  enumStartAll(): i32 {
    this.ei = 0;
    if (this.ei >= this.count()) {
      this.ei = -1;
      return -1;
    }
    if (this.dirType.length === 0) {
      return this.ei;
    }
    this.updateEnablement(0);
    return this.enumSkip(false);
  }

  enumNextAll(): i32 {
    const ei = this.ei;
    if (ei >= toI32(this.t.k.length) - 1) {
      this.ei = -1;
      return -1;
    }
    this.ei = ei + 1;
    if (this.dirType.length === 0) {
      return this.ei;
    }
    return this.enumSkip(false);
  }

  /** Updates enablement at ei and moves past tokens where the rule is disabled (when `only`). */
  private enumSkip(only: boolean): i32 {
    while (true) {
      const ei = this.ei;
      if (ei >= this.count()) {
        break;
      }
      if (this.isEnablementPoint(ei)) {
        this.updateEnablement(ei);
      }
      if (!only || this.isEnabled()) {
        return ei;
      }
      this.ei = ei + 1;
    }
    this.ei = -1;
    return -1;
  }

  // MARK: utilities

  /** index(in: lo ..< hi, where: tokens of `type`) — scope-aware. */
  indexInType(type: i32, lo0: i32, hi0: i32): i32 {
    const n = this.count();
    const lo = lo0 < 0 ? 0 : lo0;
    const hi = hi0 > n ? n : hi0;
    const t = this.t;
    const tk = t.k;
    const tc = t.c;
    const ts = t.s;
    // The stack holds indices below i, inside the list.
    const stack: i32[] = [];
    for (let i = lo; i >= 0 && i < hi && i < tk.length && i < tc.length && i < ts.length; i++) {
      const k = tk[i];
      const c = tc[i];
      const unknown = c === SW_SC_ATTRIBUTE && ts[i] === "@unknown";
      if (c === SW_SC_ENDIF) {
        while (true) {
          const sm = toI32(stack.length);
          if (sm <= 0) {
            break;
          }
          const top = stack[sm - 1];
          if (top >= 0 && top < tc.length && tc[top] === SW_SC_IF) {
            break;
          }
          if (stack.length > 0) {
            stack.pop();
          } else {
            break;
          }
        }
      }
      const m = toI32(stack.length);
      const top = m > 0 ? stack[m - 1] : -1;
      if (m !== 0 && swClosesByCode(t, i, top)) {
        if (stack.length > 0) {
          stack.pop();
        }
        if (k === SW_LINEBREAK && stack.length === 0 && swTokIsAt(t, i, type)) {
          return i;
        }
      } else if (
        (c === SW_SC_CASE || c === SW_SC_DEFAULT || unknown) &&
        m !== 0 &&
        top >= 0 &&
        top < tc.length &&
        tc[top] === SW_SC_IF
      ) {
        continue;
      } else if (m === 0 && swTypeAt(t, i, k, c, type)) {
        return i;
      } else if (k === SW_END) {
        return -1;
      } else if (k === SW_START) {
        stack.push(i);
      }
    }
    return -1;
  }

  /** index(of: type, after: i). */
  indexAfter(type: i32, i: i32): i32 {
    const n = this.count();
    if (i >= n) {
      return -1;
    }
    return this.indexInType(type, i + 1, n);
  }

  /** lastIndex(in: lo ..< hi, where: tokens of `type`) — scope-aware. */
  lastIndexInType(type: i32, lo0: i32, hi0: i32): i32 {
    const n = this.count();
    let lo = lo0;
    if (lo < 0) {
      lo = 0;
    }
    let hi = hi0;
    if (hi > n) {
      hi = n;
    }
    if (hi <= lo || hi <= 0) {
      return -1;
    }
    const t = this.t;
    const tk = t.k;
    const tc = t.c;
    let linebreakEncountered = false;
    // The stack holds indices above i, inside the list.
    const stack: i32[] = [];
    for (let i = hi - 1; i >= lo && i >= 0 && i < tk.length && i < tc.length; i--) {
      const k = tk[i];
      const c = tc[i];
      const m = toI32(stack.length);
      let top = -1;
      let topc = -1;
      if (m > 0) {
        top = stack[m - 1];
        if (top < 0 || top >= tc.length) {
          fault();
          return -1;
        }
        topc = tc[top];
      }
      if (k === SW_START) {
        if (c === SW_SC_COLON && (topc === SW_SC_ENDIF || topc === SW_SC_END_BRACE)) {
          continue;
        }
        if (top >= 0 && swClosesByCode(t, top, i)) {
          if (stack.length > 0) {
            stack.pop();
          }
          continue;
        }
        if (c === SW_SC_LINE_COMMENT && linebreakEncountered) {
          linebreakEncountered = false;
          continue;
        }
        if (swTokIsAt(t, i, type)) {
          return i;
        }
        if (c === SW_SC_LINE_COMMENT && hi >= 0 && hi < tk.length && tk[hi] === SW_LINEBREAK) {
          continue;
        }
        return -1;
      }
      if (m === 0 && swTypeAt(t, i, k, c, type)) {
        return i;
      }
      if (k === SW_LINEBREAK) {
        linebreakEncountered = true;
      } else if (k === SW_END) {
        if ((c === SW_SC_CASE || c === SW_SC_DEFAULT) && (topc === SW_SC_ENDIF || topc === SW_SC_END_BRACE)) {
          continue;
        }
        stack.push(i);
      }
    }
    return -1;
  }

  /** index(of: type, before: i). */
  indexBefore(type: i32, i: i32): i32 {
    if (i <= 0) {
      return -1;
    }
    if (type === SW_T_KEYWORD && i <= this.count()) {
      // The last keyword at the current scope is asked for constantly too.
      return swCachedBefore(this, this.kwGen, this.kwVal, type, i);
    }
    if (type !== SW_T_START_OF_SCOPE || i > this.count()) {
      return this.lastIndexInType(type, 0, i);
    }
    // The current scope is asked for constantly: cache it per mutation count.
    return swCachedBefore(this, this.csGen, this.csVal, type, i);
  }

  /** index(of: Token(k, s, a), after: i). */
  indexOfAfter(k: i32, s: string, a: i32, i: i32): i32 {
    return swIndexAfterWhere(this, i, (f, j) => f.eq(j, k, s, a));
  }

  /** index(of: Token(k, s, a), before: i). */
  indexOfBefore(k: i32, s: string, a: i32, i: i32): i32 {
    return swIndexBeforeWhere(this, i, (f, j) => f.eq(j, k, s, a));
  }

  /** index(of: Token(k, s, a), in: lo ..< hi). */
  indexOfIn(k: i32, s: string, a: i32, lo: i32, hi: i32): i32 {
    return swIndexInWhere(this, lo, hi, (f, j) => f.eq(j, k, s, a));
  }

  /** lastIndex(of: Token(k, s, a), in: lo ..< hi). */
  lastIndexOfIn(k: i32, s: string, a: i32, lo: i32, hi: i32): i32 {
    return swLastIndexInWhere(this, lo, hi, (f, j) => f.eq(j, k, s, a));
  }

  /** next(type, after: i) as an index (same as indexAfter). */
  nextIs(type: i32, i: i32, k: i32, s: string): boolean {
    const j = this.indexAfter(type, i);
    return j >= 0 && this.tok(j, k, s);
  }

  lastIs(type: i32, i: i32, k: i32, s: string): boolean {
    const j = this.indexBefore(type, i);
    return j >= 0 && this.tok(j, k, s);
  }

  // MARK: line helpers (ParsingHelpers)

  /** startOfLine(at:excludingIndent:). */
  startOfLine(i0: i32, excludingIndent: boolean = false): i32 {
    const t = this.t;
    const tk = t.k;
    let i = i0;
    if (i > tk.length) {
      i = toI32(tk.length);
    }
    while (i > 0 && i <= tk.length) {
      if (tk[i - 1] === SW_LINEBREAK) {
        break;
      }
      i--;
    }
    if (excludingIndent && i < tk.length) {
      if (i < 0) {
        fault();
        return i;
      }
      if (tk[i] === SW_SPACE) {
        return i + 1;
      }
    }
    return i;
  }

  /** endOfLine(at:). */
  endOfLine(i0: i32): i32 {
    const tk = this.t.k;
    let i = i0;
    while (i >= 0 && i < tk.length) {
      if (tk[i] === SW_LINEBREAK) {
        break;
      }
      i++;
    }
    return i;
  }

  onSameLine(a: i32, b: i32): boolean {
    return this.startOfLine(a) === this.startOfLine(b);
  }

  currentIndentForLine(i: i32): string {
    const j = this.startOfLine(i);
    const tk = this.t.k;
    const ts = this.t.s;
    if (j < tk.length) {
      if (j < 0 || j >= ts.length) {
        fault();
        return "";
      }
      if (tk[j] === SW_SPACE) {
        return ts[j];
      }
    }
    return "";
  }

  /** The original line number at index i. */
  originalLine(i: i32): i32 {
    const tk = this.t.k;
    const ta = this.t.a;
    if (i <= 0) {
      return 1;
    }
    if (i > tk.length) {
      fault();
      return 1;
    }
    for (let j = i - 1; j >= 0 && j < tk.length && j < ta.length; j--) {
      if (tk[j] === SW_LINEBREAK) {
        return swLineAfter(ta[j]);
      }
    }
    return 1;
  }

  /** linebreakToken(for: i). */
  linebreakLine(i: i32): i32 {
    const tk = this.t.k;
    const ta = this.t.a;
    if (i >= 0 && i < tk.length && i < ta.length && tk[i] === SW_LINEBREAK) {
      return ta[i];
    }
    return this.originalLine(i);
  }

  insertLinebreak(i: i32): void {
    this.insert(SW_LINEBREAK, "\n", this.linebreakLine(i), i);
  }

  /** insertSpace(_:at:): answers the change in token count. */
  insertSpace(space: string, i: i32): i32 {
    const tk = this.t.k;
    if (i >= 0 && i < tk.length && tk[i] === SW_SPACE) {
      if (space.length === 0) {
        this.removeToken(i);
        return -1;
      }
      this.replaceToken(i, SW_SPACE, space, 0);
    } else if (space.length !== 0) {
      this.insert(SW_SPACE, space, 0, i);
      return 1;
    }
    return 0;
  }

  /** The text of tokens [lo, hi). */
  text(lo: i32, hi: i32): string {
    const parts: string[] = [];
    const ts = this.t.s;
    if (lo < hi && (lo < 0 || hi > ts.length)) {
      fault();
      return "";
    }
    for (let i = lo; i >= 0 && i < hi && i < ts.length; i++) {
      parts.push(ts[i]);
    }
    return parts.join("");
  }
}

/** swTokIsAt(t, i, type) for token i, whose kind and scope code are k and c: the common types
 *  answered from those two. */
const swTypeAt = (t: SwTokList, i: i32, k: i32, c: i32, type: i32): boolean => {
  if (type === SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK) {
    return (
      !(k === SW_SPACE || k === SW_LINEBREAK || k === SW_COMMENT) &&
      !(c === SW_SC_LINE_COMMENT || c === SW_SC_BLOCK_COMMENT || c === SW_SC_END_BLOCK_COMMENT)
    );
  }
  if (type === SW_T_START_OF_SCOPE) {
    return k === SW_START;
  }
  if (type === SW_T_KEYWORD) {
    return c === SW_SC_KEYWORD;
  }
  if (type === SW_T_LINEBREAK) {
    return k === SW_LINEBREAK;
  }
  return swTokIsAt(t, i, type);
};

/** lastIndexInType(type, 0, i) through a cache stamped with the mutation count (i > 0). */
const swCachedBefore = (f: SwFormatter, gen: i32[], val: i32[], type: i32, i: i32): i32 => {
  while (toI32(gen.length) <= i) {
    gen.push(0);
  }
  while (toI32(val.length) <= i) {
    val.push(0);
  }
  const m = f.mutations;
  if (m >= 2147483647) {
    fault();
    return -1;
  }
  const stamp = m + 1;
  if (i >= 0 && i < gen.length && i < val.length && gen[i] === stamp) {
    return val[i];
  }
  const r = f.lastIndexInType(type, 0, i);
  if (i >= 0 && i < gen.length && i < val.length) {
    gen[i] = stamp;
    val[i] = r;
  }
  return r;
};

export type SwPred = (f: SwFormatter, j: i32) => boolean;

/** index(in: lo ..< hi, where: pred) — scope-aware. */
export const swIndexInWhere = (f: SwFormatter, lo0: i32, hi0: i32, pred: (f: SwFormatter, j: i32) => boolean): i32 => {
  const n = f.count();
  const lo = lo0 < 0 ? 0 : lo0;
  const hi = hi0 > n ? n : hi0;
  const stack: i32[] = [];
  for (let i = lo; i >= 0 && i < hi; i++) {
    // Read afresh: a predicate may edit the tokens.
    const tk = f.t.k;
    const ts = f.t.s;
    if (i >= tk.length || i >= ts.length) {
      fault();
      return -1;
    }
    const k = tk[i];
    const s = ts[i];
    if (k === SW_END && s === "#endif") {
      while (true) {
        const sm = toI32(stack.length);
        if (sm <= 0 || f.tok(stack[sm - 1], SW_START, "#if")) {
          break;
        }
        if (stack.length > 0) {
          stack.pop();
        }
      }
    }
    const m = toI32(stack.length);
    const top = m > 0 ? stack[m - 1] : -1;
    if (m !== 0 && f.closes(i, top)) {
      if (stack.length > 0) {
        stack.pop();
      }
      if (k === SW_LINEBREAK && stack.length === 0 && pred(f, i)) {
        return i;
      }
    } else if (swIsSwitchCaseOrDefault(k, s) && m !== 0 && f.tok(top, SW_START, "#if")) {
      continue;
    } else if (m === 0 && pred(f, i)) {
      return i;
    } else if (k === SW_END) {
      return -1;
    } else if (k === SW_START) {
      stack.push(i);
    }
  }
  return -1;
};

export const swIndexAfterWhere = (f: SwFormatter, i: i32, pred: (f: SwFormatter, j: i32) => boolean): i32 => {
  const n = f.count();
  if (i >= n) {
    return -1;
  }
  return swIndexInWhere(f, i + 1, n, pred);
};

/** lastIndex(in: lo ..< hi, where: pred) — scope-aware. */
export const swLastIndexInWhere = (
  f: SwFormatter,
  lo0: i32,
  hi0: i32,
  pred: (f: SwFormatter, j: i32) => boolean,
): i32 => {
  const n = f.count();
  let lo = lo0;
  if (lo < 0) {
    lo = 0;
  }
  let hi = hi0;
  if (hi > n) {
    hi = n;
  }
  if (hi <= lo || hi <= 0) {
    return -1;
  }
  let linebreakEncountered = false;
  const stack: i32[] = [];
  for (let i = hi - 1; i >= lo && i >= 0; i--) {
    // Read afresh: a predicate may edit the tokens.
    const tk = f.t.k;
    const ts = f.t.s;
    if (i >= tk.length || i >= ts.length) {
      fault();
      return -1;
    }
    const k = tk[i];
    const s = ts[i];
    const m = toI32(stack.length);
    const top = m > 0 ? stack[m - 1] : -1;
    if (k === SW_START) {
      if (s === ":" && top >= 0 && (f.tok(top, SW_END, "#endif") || f.tok(top, SW_END, "}"))) {
        continue;
      }
      if (top >= 0 && f.closes(top, i)) {
        if (stack.length > 0) {
          stack.pop();
        }
        continue;
      }
      if (s === "//" && linebreakEncountered) {
        linebreakEncountered = false;
        continue;
      }
      if (pred(f, i)) {
        return i;
      }
      if (s === "//" && hi < n) {
        const tk2 = f.t.k;
        if (hi < 0 || hi >= tk2.length) {
          fault();
          return -1;
        }
        if (tk2[hi] === SW_LINEBREAK) {
          continue;
        }
      }
      return -1;
    }
    if (m === 0 && pred(f, i)) {
      return i;
    }
    if (k === SW_LINEBREAK) {
      linebreakEncountered = true;
    } else if (k === SW_END) {
      if ((s === "case" || s === "default") && top >= 0 && (f.tok(top, SW_END, "#endif") || f.tok(top, SW_END, "}"))) {
        continue;
      }
      stack.push(i);
    }
  }
  return -1;
};

export const swIndexBeforeWhere = (f: SwFormatter, i: i32, pred: (f: SwFormatter, j: i32) => boolean): i32 => {
  if (i <= 0) {
    return -1;
  }
  return swLastIndexInWhere(f, 0, i, pred);
};

/** Whether the token is a comment (SW_COMMENT kind included). */
export const swIsCommentKind = (k: i32): boolean => k === SW_COMMENT;
