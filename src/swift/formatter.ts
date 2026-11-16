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
  SW_T_START_OF_SCOPE,
  SwTok,
  SwTokList,
  swIsEndOfScopeOf,
  swIsMultilineStringDelimiter,
  swIsSwitchCaseOrDefault,
  swKindIsComment,
  swTokIs,
} from "./token";

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
    this.dirType = [];
    this.dirToggle = [];
    this.dirLine = [];
    this.dirIndex = [];
    this.dirNames = [];
  }

  count(): i32 {
    return toI32(this.t.k.length);
  }

  k(i: i32): i32 {
    return this.t.k[i];
  }

  s(i: i32): string {
    return this.t.s[i];
  }

  a(i: i32): i32 {
    return this.t.a[i];
  }

  has(i: i32): boolean {
    return i >= 0 && i < toI32(this.t.k.length);
  }

  /** tokens[i].is(type), false when out of range. */
  is(i: i32, type: i32): boolean {
    if (i < 0 || i >= toI32(this.t.k.length)) {
      return false;
    }
    return swTokIs(this.t.k[i], this.t.s[i], this.t.a[i], type);
  }

  /** tokens[i] == Token(k, s) for a token with no aux value (aux 0). */
  tok(i: i32, k: i32, s: string): boolean {
    if (i < 0 || i >= toI32(this.t.k.length)) {
      return false;
    }
    return this.t.k[i] === k && this.t.a[i] === 0 && this.t.s[i] === s;
  }

  /** The kind and string match (any aux: `case .operator(s, _)`). */
  ks(i: i32, k: i32, s: string): boolean {
    if (i < 0 || i >= toI32(this.t.k.length)) {
      return false;
    }
    return this.t.k[i] === k && this.t.s[i] === s;
  }

  op(i: i32, s: string, type: i32): boolean {
    if (i < 0 || i >= toI32(this.t.k.length)) {
      return false;
    }
    return this.t.k[i] === SW_OP && this.t.a[i] === type && this.t.s[i] === s;
  }

  kw(i: i32, s: string): boolean {
    return this.tok(i, SW_KEYWORD, s);
  }

  isComment(i: i32): boolean {
    return i >= 0 && i < this.count() && swKindIsComment(this.t.k[i], this.t.s[i]);
  }

  /** Whether token i and j are equal (kind, string and aux). */
  same(i: i32, j: i32): boolean {
    return this.t.k[i] === this.t.k[j] && this.t.a[i] === this.t.a[j] && this.t.s[i] === this.t.s[j];
  }

  /** tokens[i].isEndOfScope(tokens[j]). */
  closes(i: i32, j: i32): boolean {
    return swIsEndOfScopeOf(this.t.k[i], this.t.s[i], this.t.k[j], this.t.s[j], this.t.a[j]);
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
    const names = this.dirNames[d];
    if (names.indexOf(" all ") >= 0) {
      return true;
    }
    let start = 1;
    while (start < toI32(names.length)) {
      const e = names.indexOf(" ", start);
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
    for (let j = i; j >= 0; j--) {
      if (this.t.k[j] === SW_LINEBREAK) {
        return this.t.a[j] + 1;
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
    const physicalLine = this.lineOf(index);
    let hasApplicableLineDirective = false;
    for (let d = 0; d < nd; d++) {
      if (!this.dirToggle[d] && this.dirLine[d] === physicalLine && this.directiveApplies(d)) {
        hasApplicableLineDirective = true;
        break;
      }
    }
    if (this.multilineStrings < 0) {
      this.multilineStrings = 0;
      for (let j = 0; j < this.count(); j++) {
        if (swIsMultilineStringDelimiter(this.t.k[j], this.t.s[j])) {
          this.multilineStrings = 1;
          break;
        }
      }
    }
    let enablementIndex = index;
    if (this.t.k[index] === SW_LINEBREAK && !hasApplicableLineDirective && this.multilineStrings === 1) {
      const startIndex = swIndexBeforeWhere(this, index, (f, j) => {
        const k = f.t.k[j];
        return !(k === SW_SPACE || k === SW_LINEBREAK || k === SW_STRBODY || k === SW_END);
      });
      if (startIndex >= 0 && swIsMultilineStringDelimiter(this.t.k[startIndex], this.t.s[startIndex])) {
        enablementIndex = startIndex;
      }
    }
    let line = 1;
    let tokenIndex = enablementIndex;
    if (this.t.k[enablementIndex] === SW_LINEBREAK) {
      line = this.t.a[enablementIndex] + 1;
      tokenIndex = 0;
    } else {
      for (let j = enablementIndex - 1; j >= 0; j--) {
        if (this.t.k[j] === SW_LINEBREAK) {
          line = this.t.a[j] + 1;
          tokenIndex = enablementIndex - j - 1;
          break;
        }
      }
    }
    let disabledCount = 0;
    let disabledNext = 0;
    for (let d = 0; d < nd; d++) {
      if (this.dirLine[d] > line || (this.dirLine[d] === line && this.dirIndex[d] > tokenIndex)) {
        break;
      }
      if (!this.directiveApplies(d)) {
        continue;
      }
      const delta = this.dirType[d] === 1 ? 1 : -1;
      if (this.dirToggle[d]) {
        disabledCount += delta;
      } else if (this.dirLine[d] === line) {
        disabledNext += delta;
      } else {
        disabledNext = 0;
      }
    }
    this.disabled = disabledCount + disabledNext > 0;
  }

  /** Whether token i starts or ends a comment or is a linebreak (forEachToken updates enablement there). */
  private isEnablementPoint(i: i32): boolean {
    const k = this.t.k[i];
    if (k === SW_LINEBREAK) {
      return true;
    }
    const s = this.t.s[i];
    return (k === SW_START && (s === "//" || s === "/*")) || (k === SW_END && s === "*/");
  }

  /** The enablement forEachToken(in: lo..., onlyWhereEnabled: false) would see at index i. */
  enabledInLoopAt(i: i32, lo: i32): boolean {
    if (this.dirType.length === 0) {
      return !this.ruleDisabled;
    }
    let j = i;
    while (j > lo && !this.isEnablementPoint(j)) {
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

  unref(h: i32): void {
    this.refLive[h] = false;
  }

  private updateRefs(at: i32, delta: i32): void {
    for (let r = 0; r < toI32(this.refLo.length); r++) {
      if (!this.refLive[r]) {
        continue;
      }
      let lo = this.refLo[r];
      let hi = this.refHi[r];
      if (at < lo) {
        lo += delta;
        hi += delta;
      } else if (at <= hi) {
        hi += delta;
      }
      if (lo > hi) {
        hi = lo;
      }
      this.refLo[r] = lo;
      this.refHi[r] = hi;
    }
  }

  // MARK: access and mutation

  replaceToken(i: i32, k: i32, s: string, a: i32): void {
    // Replacing a token with an equal one changes nothing the caches depend on.
    if (this.t.k[i] === k && this.t.a[i] === a && this.t.s[i] === s) {
      return;
    }
    this.t.set(i, k, s, a);
    this.mutations = this.mutations + 1;
  }

  replaceTokenWith(i: i32, toks: SwTok[]): void {
    if (toks.length === 0) {
      this.removeToken(i);
      return;
    }
    this.replaceToken(i, toks[0].k, toks[0].s, toks[0].a);
    this.insertToksFrom(toks, 1, i + 1);
  }

  /** replaceTokens(in: lo ..< hi, with: toks); answers the change in token count. */
  replaceTokens(lo: i32, hi: i32, toks: SwTok[]): i32 {
    const m = toI32(toks.length);
    const rc = hi - lo;
    const mx = rc < m ? rc : m;
    for (let i = 0; i < mx; i++) {
      this.replaceToken(lo + i, toks[i].k, toks[i].s, toks[i].a);
    }
    if (rc > mx) {
      for (let index = hi - 1; index >= lo + mx; index--) {
        this.removeToken(index);
      }
    } else if (m > mx) {
      this.insertToksFrom(toks, mx, lo + mx);
    }
    return m - rc;
  }

  /** replaceTokens(in: lo ..< hi, with: token). */
  replaceTokensWith1(lo: i32, hi: i32, k: i32, s: string, a: i32): i32 {
    const rc = hi - lo;
    if (rc === 1) {
      this.replaceToken(lo, k, s, a);
    } else if (rc === 0) {
      this.insert(k, s, a, lo);
    } else {
      this.replaceToken(lo, k, s, a);
      this.removeTokens(lo + 1, hi);
    }
    return 1 - rc;
  }

  removeToken(i: i32): void {
    this.updateRefs(i, -1);
    this.t.removeAt(i);
    this.mutations = this.mutations + 1;
    if (this.ei >= i) {
      this.ei = this.ei - 1;
    }
  }

  /** removeTokens(in: lo ..< hi), last first. */
  removeTokens(lo: i32, hi: i32): void {
    for (let i = hi - 1; i >= lo; i--) {
      this.removeToken(i);
    }
  }

  removeLastToken(): void {
    const i = this.count() - 1;
    this.updateRefs(i, -1);
    this.t.removeAt(i);
    this.mutations = this.mutations + 1;
  }

  insert(k: i32, s: string, a: i32, at: i32): void {
    this.updateRefs(at, 1);
    this.t.insertAt(at, k, s, a);
    this.mutations = this.mutations + 1;
    if (this.ei >= at) {
      this.ei = this.ei + 1;
    }
  }

  insertToks(toks: SwTok[], at: i32): void {
    this.insertToksFrom(toks, 0, at);
  }

  insertToksFrom(toks: SwTok[], from: i32, at: i32): void {
    const m = toI32(toks.length) - from;
    if (m <= 0) {
      return;
    }
    this.updateRefs(at, m);
    this.t.openGap(at, m);
    for (let j = 0; j < m; j++) {
      this.t.set(at + j, toks[from + j].k, toks[from + j].s, toks[from + j].a);
    }
    this.mutations = this.mutations + 1;
    if (this.ei >= at) {
      this.ei += m;
    }
  }

  /** The tokens [lo, hi) as values. */
  slice(lo: i32, hi: i32): SwTok[] {
    const out: SwTok[] = [];
    for (let i = lo; i < hi; i++) {
      out.push(new SwTok(this.t.k[i], this.t.s[i], this.t.a[i]));
    }
    return out;
  }

  /** moveTokens(in: lo ... hi, to: newIndex). */
  moveTokens(lo: i32, hi: i32, newIndex0: i32): void {
    const toks = this.slice(lo, hi + 1);
    let newIndex = newIndex0;
    for (let index = hi; index >= lo; index--) {
      this.removeToken(index);
      if (index < newIndex) {
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
    this.ei = this.ei + 1;
    if (this.ei >= this.count()) {
      this.ei = -1;
      return -1;
    }
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
    this.ei = this.ei + 1;
    if (this.ei >= this.count()) {
      this.ei = -1;
      return -1;
    }
    if (this.dirType.length === 0) {
      return this.ei;
    }
    return this.enumSkip(false);
  }

  /** Updates enablement at ei and moves past tokens where the rule is disabled (when `only`). */
  private enumSkip(only: boolean): i32 {
    while (this.ei < this.count()) {
      if (this.isEnablementPoint(this.ei)) {
        this.updateEnablement(this.ei);
      }
      if (!only || this.isEnabled()) {
        return this.ei;
      }
      this.ei = this.ei + 1;
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
    const stack: i32[] = [];
    for (let i = lo; i < hi; i++) {
      const k = this.t.k[i];
      const s = this.t.s[i];
      if (k === SW_END && s === "#endif") {
        while (stack.length !== 0 && !this.tok(stack[toI32(stack.length) - 1], SW_START, "#if")) {
          stack.pop();
        }
      }
      const m = toI32(stack.length);
      if (m !== 0 && this.closes(i, stack[m - 1])) {
        stack.pop();
        if (k === SW_LINEBREAK && stack.length === 0 && swTokIs(k, s, this.t.a[i], type)) {
          return i;
        }
      } else if (swIsSwitchCaseOrDefault(k, s) && m !== 0 && this.tok(stack[m - 1], SW_START, "#if")) {
        continue;
      } else if (m === 0 && swTokIs(k, s, this.t.a[i], type)) {
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
    if (i >= this.count()) {
      return -1;
    }
    return this.indexInType(type, i + 1, this.count());
  }

  /** lastIndex(in: lo ..< hi, where: tokens of `type`) — scope-aware. */
  lastIndexInType(type: i32, lo0: i32, hi0: i32): i32 {
    const n = this.count();
    const lo = lo0 < 0 ? 0 : lo0;
    const hi = hi0 > n ? n : hi0;
    let linebreakEncountered = false;
    const stack: i32[] = [];
    for (let i = hi - 1; i >= lo; i--) {
      const k = this.t.k[i];
      const s = this.t.s[i];
      const a = this.t.a[i];
      const m = toI32(stack.length);
      const top = m === 0 ? -1 : stack[m - 1];
      if (k === SW_START) {
        if (s === ":" && top >= 0 && (this.tok(top, SW_END, "#endif") || this.tok(top, SW_END, "}"))) {
          continue;
        }
        if (top >= 0 && this.closes(top, i)) {
          stack.pop();
          continue;
        }
        if (s === "//" && linebreakEncountered) {
          linebreakEncountered = false;
          continue;
        }
        if (swTokIs(k, s, a, type)) {
          return i;
        }
        if (s === "//" && hi < n && this.t.k[hi] === SW_LINEBREAK) {
          continue;
        }
        return -1;
      }
      if (m === 0 && swTokIs(k, s, a, type)) {
        return i;
      }
      if (k === SW_LINEBREAK) {
        linebreakEncountered = true;
      } else if (k === SW_END) {
        if ((s === "case" || s === "default") && top >= 0 && (this.tok(top, SW_END, "#endif") || this.tok(top, SW_END, "}"))) {
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
    if (type !== SW_T_START_OF_SCOPE || i > this.count()) {
      return this.lastIndexInType(type, 0, i);
    }
    // The current scope is asked for constantly: cache it per mutation count.
    while (toI32(this.csGen.length) <= i) {
      this.csGen.push(0);
      this.csVal.push(0);
    }
    const stamp = this.mutations + 1;
    if (this.csGen[i] === stamp) {
      return this.csVal[i];
    }
    const r = this.lastIndexInType(type, 0, i);
    this.csGen[i] = stamp;
    this.csVal[i] = r;
    return r;
  }

  /** index(of: Token(k, s, a), after: i). */
  indexOfAfter(k: i32, s: string, a: i32, i: i32): i32 {
    return swIndexAfterWhere(this, i, (f, j) => f.t.k[j] === k && f.t.a[j] === a && f.t.s[j] === s);
  }

  /** index(of: Token(k, s, a), before: i). */
  indexOfBefore(k: i32, s: string, a: i32, i: i32): i32 {
    return swIndexBeforeWhere(this, i, (f, j) => f.t.k[j] === k && f.t.a[j] === a && f.t.s[j] === s);
  }

  /** index(of: Token(k, s, a), in: lo ..< hi). */
  indexOfIn(k: i32, s: string, a: i32, lo: i32, hi: i32): i32 {
    return swIndexInWhere(this, lo, hi, (f, j) => f.t.k[j] === k && f.t.a[j] === a && f.t.s[j] === s);
  }

  /** lastIndex(of: Token(k, s, a), in: lo ..< hi). */
  lastIndexOfIn(k: i32, s: string, a: i32, lo: i32, hi: i32): i32 {
    return swLastIndexInWhere(this, lo, hi, (f, j) => f.t.k[j] === k && f.t.a[j] === a && f.t.s[j] === s);
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
    let i = i0 > this.count() ? this.count() : i0;
    while (i - 1 >= 0 && i - 1 < this.count()) {
      if (this.t.k[i - 1] === SW_LINEBREAK) {
        break;
      }
      i--;
    }
    if (excludingIndent && i < this.count() && this.t.k[i] === SW_SPACE) {
      return i + 1;
    }
    return i;
  }

  /** endOfLine(at:). */
  endOfLine(i0: i32): i32 {
    let i = i0;
    while (i >= 0 && i < this.count()) {
      if (this.t.k[i] === SW_LINEBREAK) {
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
    if (j < this.count() && this.t.k[j] === SW_SPACE) {
      return this.t.s[j];
    }
    return "";
  }

  /** The original line number at index i. */
  originalLine(i: i32): i32 {
    for (let j = i - 1; j >= 0; j--) {
      if (this.t.k[j] === SW_LINEBREAK) {
        return this.t.a[j] + 1;
      }
    }
    return 1;
  }

  /** linebreakToken(for: i). */
  linebreakLine(i: i32): i32 {
    if (i >= 0 && i < this.count() && this.t.k[i] === SW_LINEBREAK) {
      return this.t.a[i];
    }
    return this.originalLine(i);
  }

  insertLinebreak(i: i32): void {
    this.insert(SW_LINEBREAK, "\n", this.linebreakLine(i), i);
  }

  /** insertSpace(_:at:): answers the change in token count. */
  insertSpace(space: string, i: i32): i32 {
    if (i >= 0 && i < this.count() && this.t.k[i] === SW_SPACE) {
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
    for (let i = lo; i < hi; i++) {
      parts.push(this.t.s[i]);
    }
    return parts.join("");
  }
}

export type SwPred = (f: SwFormatter, j: i32) => boolean;

/** index(in: lo ..< hi, where: pred) — scope-aware. */
export const swIndexInWhere = (f: SwFormatter, lo0: i32, hi0: i32, pred: (f: SwFormatter, j: i32) => boolean): i32 => {
  const n = f.count();
  const lo = lo0 < 0 ? 0 : lo0;
  const hi = hi0 > n ? n : hi0;
  const stack: i32[] = [];
  for (let i = lo; i < hi; i++) {
    const k = f.t.k[i];
    const s = f.t.s[i];
    if (k === SW_END && s === "#endif") {
      while (stack.length !== 0 && !f.tok(stack[toI32(stack.length) - 1], SW_START, "#if")) {
        stack.pop();
      }
    }
    const m = toI32(stack.length);
    if (m !== 0 && f.closes(i, stack[m - 1])) {
      stack.pop();
      if (k === SW_LINEBREAK && stack.length === 0 && pred(f, i)) {
        return i;
      }
    } else if (swIsSwitchCaseOrDefault(k, s) && m !== 0 && f.tok(stack[m - 1], SW_START, "#if")) {
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
  if (i >= f.count()) {
    return -1;
  }
  return swIndexInWhere(f, i + 1, f.count(), pred);
};

/** lastIndex(in: lo ..< hi, where: pred) — scope-aware. */
export const swLastIndexInWhere = (f: SwFormatter, lo0: i32, hi0: i32, pred: (f: SwFormatter, j: i32) => boolean): i32 => {
  const n = f.count();
  const lo = lo0 < 0 ? 0 : lo0;
  const hi = hi0 > n ? n : hi0;
  let linebreakEncountered = false;
  const stack: i32[] = [];
  for (let i = hi - 1; i >= lo; i--) {
    const k = f.t.k[i];
    const s = f.t.s[i];
    const m = toI32(stack.length);
    const top = m === 0 ? -1 : stack[m - 1];
    if (k === SW_START) {
      if (s === ":" && top >= 0 && (f.tok(top, SW_END, "#endif") || f.tok(top, SW_END, "}"))) {
        continue;
      }
      if (top >= 0 && f.closes(top, i)) {
        stack.pop();
        continue;
      }
      if (s === "//" && linebreakEncountered) {
        linebreakEncountered = false;
        continue;
      }
      if (pred(f, i)) {
        return i;
      }
      if (s === "//" && hi < n && f.t.k[hi] === SW_LINEBREAK) {
        continue;
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
