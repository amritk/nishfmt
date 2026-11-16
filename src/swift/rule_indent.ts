// SwiftFormat's indent rule (default options: four spaces, indentCase off,
// ifdef `indent`, no Xcode indentation).
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { SwFormatter, swIndexBeforeWhere } from "./formatter";
import {
  swConditionalBranches,
  swCurrentScope,
  swEndOfScope,
  swIndexOfLastSignificantKeyword,
  swIsCommentedCode,
  swIsConditionalStatement,
  swIsEndOfStatement,
  swIsGuardElse,
  swIsInClosureArguments,
  swIsLabel,
  swIsMacroTok,
  swIsSpaceOrComment,
  swIsStartOfClosure,
  swIsStartOfStatement,
  swIsTrailingClosureLabel,
  swLinewrapIndent,
  swPrevIs,
  swSpaceEquivalentToTokens,
  swSpaceEquivalentToWidth,
  swSpaceWidth,
  swStartOfConditionalStatement,
  swStartOfScope,
  swStringBodyIndent,
} from "./parsing";
import {
  SW_DELIM,
  SW_END,
  SW_IDENT,
  SW_KEYWORD,
  SW_LINEBREAK,
  SW_OP,
  SW_OP_INFIX,
  SW_SPACE,
  SW_START,
  SW_STRBODY,
  SW_T_LINEBREAK,
  SW_T_NON_SPACE,
  SW_T_NON_SPACE_OR_COMMENT,
  SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK,
  SW_T_NON_SPACE_OR_LINEBREAK,
  SW_T_START_OF_SCOPE,
  swIsMultilineStringDelimiter,
  swIsStringDelimiter,
  swIsSwitchCaseOrDefault,
  swKindIsComment,
  SW_COMMENT,
  SW_ERROR,
} from "./token";

const SW_INDENT: string = "    ";

class SwIndentState {
  // The scope stack holds token values (some synthetic).
  sk: i32[];
  ss: string[];
  sa: i32[];
  starts: i32[];
  indents: string[];
  strIndents: string[];
  counts: i32[];
  wraps: boolean[];
  bad: boolean = false;

  constructor() {
    this.sk = [];
    this.ss = [];
    this.sa = [];
    this.starts = [];
    this.indents = [""];
    this.strIndents = [""];
    this.counts = [1];
    this.wraps = [false];
  }

  scopeIs(k: i32, s: string): boolean {
    const m = toI32(this.sk.length);
    return m > 0 && this.sk[m - 1] === k && this.ss[m - 1] === s;
  }

  scopeAt(back: i32, k: i32, s: string): boolean {
    const m = toI32(this.sk.length);
    return m > back && this.sk[m - 1 - back] === k && this.ss[m - 1 - back] === s;
  }

  scopeStr(): string | null {
    const m = toI32(this.ss.length);
    return m === 0 ? null : this.ss[m - 1];
  }

  lastWrap(): boolean {
    const m = toI32(this.wraps.length);
    return m > 0 && this.wraps[m - 1];
  }

  setLastWrap(v: boolean): void {
    const m = toI32(this.wraps.length);
    if (m > 0) {
      this.wraps[m - 1] = v;
    } else {
      this.bad = true;
    }
  }

  lastIndent(): string {
    const m = toI32(this.indents.length);
    return m === 0 ? "" : this.indents[m - 1];
  }

  indentAt(back: i32): string {
    const m = toI32(this.indents.length);
    if (back < 1 || back > m) {
      this.bad = true;
      return "";
    }
    return this.indents[m - back];
  }

  setLastIndent(s: string): void {
    const m = toI32(this.indents.length);
    if (m > 0) {
      this.indents[m - 1] = s;
    } else {
      this.bad = true;
    }
  }

  lastStrIndent(): string {
    const m = toI32(this.strIndents.length);
    if (m === 0) {
      this.bad = true;
      return "";
    }
    return this.strIndents[m - 1];
  }

  setLastStrIndent(s: string): void {
    const m = toI32(this.strIndents.length);
    if (m > 0) {
      this.strIndents[m - 1] = s;
    } else {
      this.bad = true;
    }
  }

  lastStart(): i32 {
    const m = toI32(this.starts.length);
    return m === 0 ? -1 : this.starts[m - 1];
  }

  popIndent(): void {
    if (this.indents.length === 0) {
      this.bad = true;
      return;
    }
    this.indents.pop();
  }

  popStrIndent(): void {
    if (this.strIndents.length === 0) {
      this.bad = true;
      return;
    }
    this.strIndents.pop();
  }

  popScope(): void {
    if (this.lastWrap()) {
      this.popIndent();
      this.popStrIndent();
    }
    this.popIndent();
    this.popStrIndent();
    if (this.counts.length === 0 || this.wraps.length === 0 || this.starts.length === 0 || this.sk.length === 0) {
      this.bad = true;
      return;
    }
    this.counts.pop();
    this.wraps.pop();
    this.starts.pop();
    this.sk.pop();
    this.ss.pop();
    this.sa.pop();
  }

  pushScope(k: i32, s: string, a: i32): void {
    this.sk.push(k);
    this.ss.push(s);
    this.sa.push(a);
  }
}

const swApplyIndent = (f: SwFormatter, indent: string, at: i32): i32 => (f.isEnabled() ? f.insertSpace(indent, at) : 0);

const swIsIfdefDirective = (f: SwFormatter, i: i32): boolean =>
  f.tok(i, SW_START, "#if") || f.kw(i, "#else") || f.kw(i, "#elseif") || f.tok(i, SW_END, "#endif");

/** startOfConditionalStatementContainingLinewrap(at:). */
const swStartOfConditionalStatementContainingLinewrap = (f: SwFormatter, index: i32): i32 => {
  const s = swStartOfConditionalStatement(f, index);
  if (s >= 0) {
    return s;
  }
  const guardIndex = f.indexOfBefore(SW_KEYWORD, "guard", 0, index);
  if (guardIndex < 0 || swStartOfScope(f, guardIndex) !== swStartOfScope(f, index)) {
    return -1;
  }
  const elseIndex = f.indexOfAfter(SW_KEYWORD, "else", 0, index);
  if (elseIndex < 0 || !swIsGuardElse(f, elseIndex)) {
    return -1;
  }
  return guardIndex;
};

/** indentForConditions(after:), or null. */
const swIndentForConditions = (f: SwFormatter, keywordIndex: i32): string | null => {
  const first = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, keywordIndex);
  if (first < 0) {
    return null;
  }
  if (f.onSameLine(keywordIndex, first)) {
    return swSpaceEquivalentToTokens(f, f.startOfLine(keywordIndex), first);
  }
  return f.currentIndentForLine(first);
};

/** indentForScopeInMultilineCondition(at:), or null. */
const swIndentForScopeInMultilineCondition = (f: SwFormatter, scopeStart: i32): string | null => {
  if (!(swIsStartOfClosure(f, scopeStart) || f.tok(scopeStart, SW_START, "("))) {
    return null;
  }
  let hasKeyword = false;
  for (let j = f.startOfLine(scopeStart); j < scopeStart; j++) {
    if (f.k(j) === SW_KEYWORD) {
      const s = f.s(j);
      if (s === "if" || s === "guard" || s === "while" || s === "for" || s === "repeat" || s === "case" || s === "switch") {
        hasKeyword = true;
        break;
      }
    }
  }
  if (!hasKeyword) {
    return null;
  }
  const scopeEnd = swEndOfScope(f, scopeStart);
  if (scopeEnd < 0 || f.onSameLine(scopeStart, scopeEnd)) {
    return null;
  }
  let index = scopeEnd;
  while (true) {
    const nextIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
    if (nextIndex < 0) {
      break;
    }
    if (f.tok(nextIndex, SW_DELIM, ",")) {
      const scope = swCurrentScope(f, nextIndex);
      if (!(scope >= 0 && (f.tok(scope, SW_START, "(") || f.tok(scope, SW_START, "[")))) {
        const cs = swStartOfConditionalStatement(f, nextIndex);
        if (cs < 0 || !(cs < scopeStart) || !f.onSameLine(cs, scopeStart) || swStartOfScope(f, nextIndex) !== swStartOfScope(f, cs)) {
          return null;
        }
        const fc = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, cs);
        if (fc < 0 || !f.onSameLine(fc, scopeStart)) {
          return null;
        }
        const nc = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, nextIndex);
        if (nc < 0) {
          return null;
        }
        if (!f.onSameLine(nextIndex, nc)) {
          return swIndentForConditions(f, cs);
        }
      }
    } else if (f.tok(nextIndex, SW_START, "{")) {
      return null;
    } else if (f.kw(nextIndex, "else")) {
      return null;
    }
    index = nextIndex;
  }
  return null;
};

/** isFirstStackedClosureArgument(at:). */
const swIsFirstStackedClosureArgument = (f: SwFormatter, i: i32): boolean => {
  const prevIndex = f.indexBefore(SW_T_NON_SPACE, i);
  if (prevIndex < 0) {
    return false;
  }
  const ok =
    f.tok(prevIndex, SW_START, "(") ||
    (f.tok(prevIndex, SW_DELIM, ":") && f.has(prevIndex - 1) && f.k(prevIndex - 1) === SW_IDENT && swPrevIs(f, SW_T_NON_SPACE, prevIndex - 1, SW_START, "("));
  if (!ok) {
    return false;
  }
  const endIndex = swEndOfScope(f, i);
  if (endIndex < 0) {
    return false;
  }
  const comma = f.indexAfter(SW_T_NON_SPACE, endIndex);
  if (comma < 0 || !f.tok(comma, SW_DELIM, ",")) {
    return false;
  }
  const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, comma);
  return n >= 0 && f.k(n) === SW_LINEBREAK;
};

/** shouldIndentNextLine(at:). */
const swShouldIndentNextLine = (f: SwFormatter, i: i32): boolean => {
  const eol = f.endOfLine(i);
  const nextIndex = f.indexAfter(SW_T_NON_SPACE, eol);
  if (nextIndex < 0 || f.k(nextIndex) === SW_LINEBREAK || f.isComment(nextIndex)) {
    return false;
  }
  const last = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, eol + 1);
  if (last >= 0 && (f.kw(last, "return") || f.op(last, "=", SW_OP_INFIX))) {
    const eonl = f.endOfLine(nextIndex);
    const l2 = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, eonl);
    if (l2 >= 0 && ((f.k(l2) === SW_OP && f.a(l2) === SW_OP_INFIX) || f.tok(l2, SW_DELIM, ","))) {
      return false;
    }
    if (l2 >= 0 && f.tok(l2, SW_END, ")")) {
      return true;
    }
    return f.lastIndexInType(SW_T_START_OF_SCOPE, nextIndex, eonl) < 0;
  }
  return false;
};

/** isTrailingClosureOnLineAfterMultilineMethodCall(at:). */
const swIsTrailingClosureOnLineAfterMultilineMethodCall = (f: SwFormatter, startOfScope: i32): boolean => {
  if (!swIsStartOfClosure(f, startOfScope)) {
    return false;
  }
  const endCall = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, startOfScope);
  if (endCall < 0 || !f.tok(endCall, SW_END, ")") || f.startOfLine(endCall) === f.startOfLine(startOfScope)) {
    return false;
  }
  const startCall = swStartOfScope(f, endCall);
  if (startCall < 0 || f.startOfLine(startCall) === f.startOfLine(endCall)) {
    return false;
  }
  return true;
};

/** The indent rule. Answers false when its bookkeeping goes wrong (SwiftFormat would crash). */
export const swRuleIndent = (f: SwFormatter): boolean => {
  const st = new SwIndentState();
  let lastNonSpaceOrLinebreakIndex = -1;
  let lineIndex = 0;
  for (let i0 = f.enumStart(); i0 >= 0; i0 = f.enumNext()) {
    if (st.bad || f.errors.length !== 0) {
      f.ei = -1;
      return !st.bad;
    }
    let i = i0;
    const tk = f.k(i);
    const ts = f.s(i);
    const ta = f.a(i);
    if (tk === SW_START) {
      if (ts === ":" && st.scopeIs(SW_END, "case")) {
        st.popScope();
      } else if (ts === "{" && !swIsStartOfClosure(f, i) && st.lastWrap()) {
        st.popIndent();
        st.setLastWrap(false);
      }
      st.pushScope(tk, ts, ta);
      let indentCount = 0;
      if (lineIndex > st.lastStart()) {
        indentCount = 1;
      } else if (swIsMultilineStringDelimiter(tk, ts) && swMultilineStringInCall(f, i)) {
        indentCount = 1;
      } else if (st.sk.length > 1 && st.scopeAt(1, SW_START, ":")) {
        indentCount = 1;
      } else {
        const m = toI32(st.counts.length);
        indentCount = (m === 0 ? 0 : st.counts[m - 1]) + 1;
      }
      let indent = st.indentAt(indentCount);
      if (ts === "/*") {
        if (st.sk.length < 2 || !st.scopeAt(1, SW_START, "/*")) {
          indent = indent + " ";
        }
      } else if (ts === ":") {
        indent = indent + SW_INDENT;
      } else if (ts === "#if") {
        const li = f.indexAfter(SW_T_LINEBREAK, i);
        if (li >= 0) {
          const nk = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, li);
          if (nk >= 0 && (f.tok(nk, SW_END, "case") || f.tok(nk, SW_END, "default") || f.kw(nk, "@unknown"))) {
            indent = st.indentAt(indentCount + 1);
          }
        }
        i += swApplyIndent(f, indent, f.startOfLine(i));
        indent = indent + SW_INDENT;
      } else if (ts === "{" && swIsFirstStackedClosureArgument(f, i)) {
        let prevIndex = f.indexBefore(SW_T_NON_SPACE, i);
        let done = false;
        if (prevIndex >= 0 && f.tok(prevIndex, SW_DELIM, ":")) {
          let parenIndex = -1;
          if (f.has(prevIndex - 1) && f.k(prevIndex - 1) === SW_IDENT) {
            const p = f.indexBefore(SW_T_NON_SPACE, prevIndex - 1);
            if (p >= 0 && f.tok(p, SW_START, "(")) {
              parenIndex = p;
            }
          }
          if (parenIndex < 0) {
            const stringIndent = swStringBodyIndent(f, i);
            st.setLastStrIndent(stringIndent);
            indent = indent + stringIndent + SW_INDENT;
            done = true;
          } else {
            prevIndex = parenIndex;
          }
        }
        if (!done && prevIndex >= 0) {
          const startIndex = f.startOfLine(i);
          indent = swSpaceEquivalentToTokens(f, startIndex, prevIndex + 1);
          st.setLastIndent(indent);
          indent = indent + SW_INDENT;
          indentCount -= 1;
        }
      } else if (ts === "{" && swIsStartOfClosure(f, i)) {
        const prevIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT, i);
        if (prevIndex >= 0 && f.tok(prevIndex, SW_END, ")")) {
          const prevIndent = f.currentIndentForLine(prevIndex);
          if (prevIndent === indent + SW_INDENT) {
            if (!st.lastWrap()) {
              st.setLastWrap(true);
              st.indents.push(prevIndent);
              st.strIndents.push("");
            }
            indent = prevIndent;
          }
        }
        const ci = swIndentForScopeInMultilineCondition(f, i);
        if (ci !== null) {
          indent = ci;
        }
        const stringIndent = swStringBodyIndent(f, i);
        st.setLastStrIndent(stringIndent);
        indent = indent + stringIndent + SW_INDENT;
      } else if (swIsStringDelimiter(tk, ts) || ts === "//") {
        // no indent change
      } else {
        let aligned = false;
        if (ts === "[" || ts === "(") {
          const linebreakIndex = f.indexAfter(SW_T_LINEBREAK, i);
          const nextIndex = f.indexAfter(SW_T_NON_SPACE, i);
          if (linebreakIndex >= 0 && nextIndex >= 0 && nextIndex !== linebreakIndex) {
            const lb = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT, linebreakIndex);
            const la = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, linebreakIndex);
            if ((lb >= 0 && f.tok(lb, SW_DELIM, ",")) || (la >= 0 && f.tok(la, SW_DELIM, ","))) {
              const start = f.startOfLine(i);
              const m = toI32(st.counts.length);
              const lastIndentCount = m === 0 ? 0 : st.counts[m - 1];
              if (indentCount > lastIndentCount) {
                indentCount = lastIndentCount;
                if (m > 0) {
                  st.counts[m - 1] = 1;
                }
              }
              indent = swSpaceEquivalentToTokens(f, start, nextIndex);
              aligned = true;
            }
          }
        }
        if (!aligned) {
          if (ts === "(") {
            const ci = swIndentForScopeInMultilineCondition(f, i);
            if (ci !== null) {
              indent = ci;
            }
          }
          const stringIndent = swStringBodyIndent(f, i);
          st.setLastStrIndent(stringIndent);
          indent = indent + stringIndent + SW_INDENT;
        }
      }
      st.indents.push(indent);
      st.strIndents.push("");
      st.counts.push(indentCount);
      st.starts.push(lineIndex);
      st.wraps.push(false);
    } else if (tk === SW_SPACE) {
      if (i === 0 && !(f.has(i + 1) && f.k(i + 1) === SW_LINEBREAK)) {
        f.removeToken(i);
      }
    } else if (tk === SW_KEYWORD && (ts === "#else" || ts === "#elseif")) {
      let indent = st.indentAt(2);
      if (st.scopeIs(SW_START, ":")) {
        indent = st.indentAt(4);
      }
      const start = f.startOfLine(i);
      i += swApplyIndent(f, indent, start);
    } else if (tk === SW_KEYWORD && ts === "@unknown" && !st.scopeIs(SW_START, "#if")) {
      const indent = st.indentAt(2);
      const start = f.startOfLine(i);
      const stringIndent = st.lastStrIndent();
      i += swApplyIndent(f, stringIndent + indent, start);
    } else if (tk === SW_KEYWORD && ts === "in" && st.scopeIs(SW_START, "{")) {
      const startIndex = f.indexOfBefore(SW_START, "{", 0, i);
      if (startIndex >= 0 && f.indexOfIn(SW_KEYWORD, "for", 0, startIndex + 1, i) < 0) {
        const paramsIndex = f.indexInType(SW_T_START_OF_SCOPE, startIndex + 1, i);
        if (paramsIndex >= 0 && !swHasLb(f, startIndex + 1, paramsIndex) && swHasLb(f, paramsIndex + 1, i)) {
          st.setLastIndent(st.lastIndent() + SW_INDENT);
        }
      }
    } else if (tk === SW_OP && ts === "=" && ta === SW_OP_INFIX && swIsAssignmentOfWrappedConditional(f, i)) {
      const indent = st.lastIndent() + SW_INDENT;
      st.indents.push(indent);
      st.strIndents.push("");
      st.counts.push(1);
      st.starts.push(lineIndex);
      st.wraps.push(false);
      st.pushScope(SW_OP, "=", SW_OP_INFIX);
      st.starts.push(lineIndex);
    } else {
      i = swIndentDefault(f, st, i, tk, ts, lineIndex);
      // The deferred end of a conditional assignment's scope.
      if (tk === SW_END && ts === "}" && st.scopeIs(SW_OP, "=")) {
        const sos = swStartOfScope(f, i);
        if (sos >= 0) {
          let pai = f.indexOfBefore(SW_OP, "=", SW_OP_INFIX, sos);
          while (pai >= 0 && swIsConditionalStatement(f, pai)) {
            const npai = f.indexOfBefore(SW_OP, "=", SW_OP_INFIX, pai);
            if (npai < 0) {
              break;
            }
            pai = npai;
          }
          if (pai >= 0) {
            const nt = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, pai);
            if (nt >= 0) {
              const br = swConditionalBranches(f, nt);
              if (br !== null && br.ends.length !== 0 && br.ends[toI32(br.ends.length) - 1] === i) {
                st.popScope();
              }
            }
          }
        }
      }
    }
    // The second switch
    if ((tk === SW_END && (ts === "case" || ts === "default")) || (tk === SW_KEYWORD && (ts === "@unknown" || ts === "#else" || ts === "#elseif")) || (tk === SW_START && ts === "#if")) {
      if (tk === SW_END && ts === "case") {
        st.pushScope(tk, ts, ta);
        let indent = st.lastIndent();
        const n = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, i);
        if (n >= 0 && f.k(n) === SW_LINEBREAK) {
          indent = indent + SW_INDENT;
        } else {
          indent = indent + swSpaceEquivalentToWidth(5);
        }
        st.indents.push(indent);
        st.strIndents.push("");
        st.counts.push(1);
        st.starts.push(lineIndex);
        st.wraps.push(false);
      }
      let index = f.startOfLine(i);
      if (index === i || index === i - 1) {
        const indent = f.k(index) === SW_SPACE ? f.s(index) : "";
        index -= 1;
        while (f.has(index - 1) && f.isComment(index - 1)) {
          const startIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT, index);
          if (startIndex < 0 || f.k(startIndex) !== SW_LINEBREAK) {
            break;
          }
          const prevWasEndComment = f.tok(index - 1, SW_END, "*/");
          if (!swIsCommentedCode(f, startIndex + 1)) {
            swApplyIndent(f, indent, startIndex + 1);
          }
          if (prevWasEndComment) {
            let ci = f.indexOfAfter(SW_START, "/*", 0, startIndex);
            if (ci >= 0) {
              while (true) {
                const lbi = f.indexAfter(SW_T_LINEBREAK, ci);
                if (lbi < 0) {
                  break;
                }
                swApplyIndent(f, indent + " ", lbi + 1);
                ci = lbi;
              }
            }
          }
          index = startIndex;
        }
      }
    } else if (tk === SW_LINEBREAK) {
      const r = swIndentLinebreak(f, st, i, lastNonSpaceOrLinebreakIndex, lineIndex);
      lineIndex += 1;
      if (r >= -1) {
        lastNonSpaceOrLinebreakIndex = r;
      }
    }
    // Track token for line wraps
    if (!(tk === SW_SPACE || swKindIsComment(tk, ts))) {
      if (tk !== SW_LINEBREAK) {
        lastNonSpaceOrLinebreakIndex = i;
      }
    }
  }
  return !st.bad;
};

const swHasLb = (f: SwFormatter, lo: i32, hi: i32): boolean => {
  for (let j = lo; j < hi; j++) {
    if (f.k(j) === SW_LINEBREAK) {
      return true;
    }
  }
  return false;
};

/** The multiline string's indentCount check: `""" ... """` followed by a wrapped `)`. */
const swMultilineStringInCall = (f: SwFormatter, i: i32): boolean => {
  const endIndex = swEndOfScope(f, i);
  if (endIndex < 0) {
    return false;
  }
  const closing = f.indexOfAfter(SW_END, ")", 0, endIndex);
  if (closing < 0) {
    return false;
  }
  return f.indexInType(SW_T_LINEBREAK, endIndex + 1, closing) >= 0;
};

/** The `=` case's guard: an if/switch on its own line after the `=`. */
const swIsAssignmentOfWrappedConditional = (f: SwFormatter, i: i32): boolean => {
  const nk = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
  if (nk < 0) {
    return false;
  }
  const s = f.s(nk);
  return (s === "if" || s === "switch") && !f.onSameLine(i, nk);
};

/** The default case of the first switch: end of scope handling. Answers the (adjusted) index. */
const swIndentDefault = (f: SwFormatter, st: SwIndentState, i0: i32, tk: i32, ts: string, lineIndex: i32): i32 => {
  let i = i0;
  const m = toI32(st.sk.length);
  if (m > 0 && swClosesScope(tk, ts, st.sk[m - 1], st.ss[m - 1], st.sa[m - 1])) {
    const cm = toI32(st.counts.length);
    const indentCount = (cm === 0 ? 0 : st.counts[cm - 1]) - 1;
    st.popScope();
    if (tk === SW_LINEBREAK || !(lineIndex > st.lastStart())) {
      return i;
    }
    if (indentCount > 0) {
      for (let q = 0; q < indentCount; q++) {
        st.popIndent();
        st.popStrIndent();
      }
      for (let q = 0; q < indentCount; q++) {
        st.indents.push(st.lastIndent());
        const sm = toI32(st.strIndents.length);
        st.strIndents.push(sm === 0 ? "" : st.strIndents[sm - 1]);
      }
    }
    if (tk === SW_END && ts === ")") {
      const nti = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
      if (nti >= 0 && swIsTrailingClosureOnLineAfterMultilineMethodCall(f, nti)) {
        const fcs = swStartOfScope(f, i);
        if (fcs >= 0) {
          const indent = f.currentIndentForLine(fcs);
          st.indents.push(indent);
          st.strIndents.push("");
          st.counts.push(indentCount);
          st.starts.push(lineIndex);
          st.wraps.push(false);
          st.pushScope(SW_START, "{", 0);
        }
      }
    }
    if (tk === SW_END && ts === "}") {
      const sos = swStartOfScope(f, i);
      if (sos >= 0 && swIsTrailingClosureOnLineAfterMultilineMethodCall(f, sos)) {
        st.popScope();
      }
    }
    const start = f.startOfLine(i);
    const firstIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT, start - 1);
    if (firstIndex < 0 || firstIndex !== i) {
      return i;
    }
    let indent = st.lastIndent();
    let usedCondition = false;
    if (tk === SW_END && (ts === "}" || ts === ")")) {
      const csi = swStartOfScope(f, i);
      if (csi >= 0) {
        const ci = swIndentForScopeInMultilineCondition(f, csi);
        if (ci !== null) {
          indent = ci;
          usedCondition = true;
        }
      }
    }
    if (!usedCondition && swIsSwitchCaseOrDefault(tk, ts)) {
      // indentCase is off
    }
    const stringIndent = st.lastStrIndent();
    i += swApplyIndent(f, stringIndent + indent, start);
  } else if (tk === SW_END && ts === "#endif" && st.indents.length > 1) {
    let indent = st.indentAt(2);
    if (st.scopeIs(SW_START, ":") && st.indents.length > 1) {
      indent = st.indentAt(4);
      st.popScope();
    }
    i += swApplyIndent(f, indent, f.startOfLine(i));
    if (st.scopeIs(SW_START, "#if")) {
      st.popScope();
    }
  }
  return i;
};

/** Token.isEndOfScope(scope) for a scope-stack entry. */
const swClosesScope = (k: i32, s: string, sk: i32, ss: string, sa: i32): boolean => {
  if (k === SW_END) {
    if (sk !== SW_START) {
      return false;
    }
    if (ss === "(") {
      return s === ")";
    }
    if (ss === "[") {
      return s === "]";
    }
    if (ss === "<") {
      return s === ">";
    }
    if (ss === "{" || ss === ":") {
      return s === "}" || s === "case" || s === "default";
    }
    if (ss === "/*") {
      return s === "*/";
    }
    if (ss === "#if") {
      return s === "#endif";
    }
    return swEndsString(s, ss);
  }
  if (k === SW_LINEBREAK) {
    return sk === SW_START && (ss === "//" || ss === "#!");
  }
  if ((k === SW_DELIM || k === SW_START) && s === ":") {
    return (sk === SW_END && (ss === "case" || ss === "default")) || (sk === SW_OP && ss === "?" && sa === SW_OP_INFIX);
  }
  return false;
};

/** Whether `s` closes the string delimiter `open`. */
const swEndsString = (s: string, open: string): boolean => {
  let quotes = 0;
  let hashes = 0;
  let slashes = 0;
  for (let i = 0; i < toI32(open.length); i++) {
    const c = open.charCodeAt(i);
    if (c === 35) {
      hashes++;
    } else if (c === 34) {
      quotes++;
    } else if (c === 47) {
      slashes++;
    } else {
      return false;
    }
  }
  const regex = slashes === 1;
  if (!(quotes > 0 || regex)) {
    return false;
  }
  const multi = quotes === 3 || (regex && hashes > 0);
  const q = regex ? "/" : multi ? '"""' : '"';
  if (toI32(s.length) !== toI32(q.length) + hashes || !s.startsWith(q)) {
    return false;
  }
  for (let i = toI32(q.length); i < toI32(s.length); i++) {
    if (s.charCodeAt(i) !== 35) {
      return false;
    }
  }
  return true;
};

/** The linebreak case. Answers the new lastNonSpaceOrLinebreakIndex, or -2 to leave it. */
const swIndentLinebreak = (f: SwFormatter, st: SwIndentState, i: i32, lastNSL: i32, lineIndex: i32): i32 => {
  let result = -2;
  let effectiveLastIndex = lastNSL;
  const nextTokenIndex = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
  const scope = st.scopeStr();
  let linewrapped = false;
  if (effectiveLastIndex > -1) {
    if (!swIsEndOfStatement(f, effectiveLastIndex, scope)) {
      linewrapped = true;
    } else if (nextTokenIndex >= 0 && swIsTrailingClosureLabel(f, nextTokenIndex)) {
      linewrapped = true;
    } else if (nextTokenIndex >= 0) {
      const nk = f.k(nextTokenIndex);
      const ns = f.s(nextTokenIndex);
      let notWrapped =
        (nk === SW_END && (ns === "}" || ns === "]" || ns === ")") && f.a(nextTokenIndex) === 0) || nk === SW_STRBODY || swIsStartOfStatement(f, nextTokenIndex, scope);
      if (!notWrapped) {
        let identLike = false;
        if (nk === SW_IDENT) {
          if (ns === "async") {
            const cs = swCurrentScope(f, nextTokenIndex);
            identLike = cs >= 0 && f.tok(cs, SW_START, "(");
          } else {
            identLike = true;
          }
        }
        if (identLike || swIsMacroTok(f, nextTokenIndex) || f.kw(nextTokenIndex, "try") || f.kw(nextTokenIndex, "await")) {
          const lt = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, nextTokenIndex);
          if (lt >= 0 && !f.kw(lt, "return") && !(f.k(lt) === SW_OP && f.a(lt) === SW_OP_INFIX)) {
            notWrapped = true;
          }
        }
      }
      if (!notWrapped && nk === SW_DELIM && ns === ",") {
        const cs = swCurrentScope(f, nextTokenIndex);
        const css = cs >= 0 ? f.s(cs) : "";
        if (css === "<" || css === "[" || css === "(" || css === "case") {
          notWrapped = true;
        }
      }
      linewrapped = !notWrapped;
    }
  }
  // Determine current indent
  let indent = st.lastIndent();
  if (linewrapped && lineIndex === st.lastStart()) {
    indent = st.indents.length > 1 ? st.indentAt(2) : "";
  }
  const nextNonSpaceIndex0 = f.indexAfter(SW_T_NON_SPACE, i);
  if (nextNonSpaceIndex0 < 0) {
    return result;
  }
  let nextNonSpaceIndex = nextNonSpaceIndex0;
  const nxk = f.k(nextNonSpaceIndex);
  const nxs = f.s(nextNonSpaceIndex);
  // Begin wrap scope
  if (st.lastWrap()) {
    if (!linewrapped) {
      st.popIndent();
      st.setLastWrap(false);
      indent = st.lastIndent();
    } else {
      const shouldIndentLeadingDot = swStartOfConditionalStatement(f, i) >= 0;
      const prevCodeIndex = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
      const nn = f.indexAfter(SW_T_NON_SPACE, i);
      if (shouldIndentLeadingDot && nn >= 0 && f.op(nn, ".", SW_OP_INFIX) && prevCodeIndex >= 0) {
        let lineStart = f.indexBefore(SW_T_LINEBREAK, prevCodeIndex + 1);
        if (lineStart < 0) {
          lineStart = f.startOfLine(prevCodeIndex);
        }
        const startIndex = f.indexAfter(SW_T_NON_SPACE, lineStart);
        if (startIndex >= 0) {
          let ok = swIsStartOfStatement(f, startIndex);
          if (!ok && (f.k(startIndex) === SW_IDENT || f.kw(startIndex, "try") || f.kw(startIndex, "await") || swIsTrailingClosureLabel(f, startIndex))) {
            const lt = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, startIndex);
            ok = lt >= 0 && !f.kw(lt, "return") && !(f.k(lt) === SW_OP && f.a(lt) === SW_OP_INFIX);
          }
          if (ok) {
            indent = indent + SW_INDENT;
            st.setLastIndent(indent);
          }
        }
      }
      const lt = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
      if (lt >= 0 && f.tok(lt, SW_DELIM, ",")) {
        const cbi = swStartOfConditionalStatementContainingLinewrap(f, i);
        if (cbi >= 0) {
          const ci = swIndentForConditions(f, cbi);
          if (ci !== null && swSpaceWidthCount(ci) < swSpaceWidthCount(indent)) {
            indent = ci;
            st.setLastIndent(indent);
          }
        }
      }
    }
  } else if (linewrapped) {
    let lastToken = effectiveLastIndex;
    const ntIsDot = nextTokenIndex >= 0 && f.op(nextTokenIndex, ".", SW_OP_INFIX);
    if (ntIsDot || (nextTokenIndex >= 0 && swIsLabel(f, nextTokenIndex))) {
      let lineStart = f.startOfLine(effectiveLastIndex, true);

      const startHas = f.has(lineStart);
      const stK = startHas ? f.k(lineStart) : -1;
      const stS = startHas ? f.s(lineStart) : "";
      if (startHas && swIsIfdefDirective(f, lineStart)) {
        const index = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, lineStart);
        if (index >= 0) {
          result = index;
          effectiveLastIndex = index;
          lastToken = effectiveLastIndex;
          lineStart = f.startOfLine(effectiveLastIndex, true);
        }
      }
      const startTokIsElse = startHas && ((stK === SW_KEYWORD && (stS === "#else" || stS === "#elseif")) || (stK === SW_END && stS === "#endif"));
      if (f.op(lineStart, ".", SW_OP_INFIX) && startTokIsElse) {
        indent = f.currentIndentForLine(lineStart);
      } else if (swAllEndOfScopeOrSpace(f, lineStart, effectiveLastIndex)) {
        const lk = f.k(lastToken);
        const ls = f.s(lastToken);
        if (lk === SW_END) {
          indent = f.currentIndentForLine(effectiveLastIndex);
        }
        if ((lk !== SW_END || ls === "case") && !(lk === SW_END && (ls === "}" || ls === ")"))) {
          indent = indent + SW_INDENT;
        }
      } else {
        indent = indent + swLinewrapIndent(f, i);
      }
    } else if (!swPrevIs(f, SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i, SW_KEYWORD, "func") && (!swIsInClosureArguments(f, i) || lineIndex === st.lastStart())) {
      let usedCondition = false;
      const lt = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, i);
      if (lt >= 0 && f.tok(lt, SW_DELIM, ",")) {
        const sl = f.startOfLine(effectiveLastIndex, true);
        if (f.tok(sl, SW_END, "}") || f.tok(sl, SW_END, ")")) {
          const cbi = swIndexBeforeWhere(f, i, (g, j) => {
            const s = g.s(j);
            return s === "if" || s === "guard" || s === "while" || s === "for";
          });
          if (cbi >= 0 && swStartOfScope(f, cbi) === swStartOfScope(f, i)) {
            const ci = swIndentForConditions(f, cbi);
            if (ci !== null) {
              indent = ci;
              usedCondition = true;
            }
          }
        }
      }
      if (!usedCondition) {
        indent = indent + swLinewrapIndent(f, i);
      }
    }
    st.setLastWrap(true);
    st.indents.push(indent);
    st.strIndents.push("");
  }
  // Avoid indenting commented code
  if (swIsCommentedCode(f, nextNonSpaceIndex)) {
    return result;
  }
  // Apply indent
  if (nxk === SW_LINEBREAK) {
    // indentBlankLines is off
  } else if (nxk === SW_ERROR || (nxk === SW_KEYWORD && (nxs === "#else" || nxs === "#elseif")) || (nxk === SW_END && nxs === "#endif")) {
    // error, #else, #elseif, #endif
  } else if ((nxk === SW_START && (nxs === "/*" || nxs === "//" || nxs === "#if")) || f.k(nextNonSpaceIndex) === SW_COMMENT || (nxk === SW_END && nxs === "*/")) {
    let stage = 0;
    if ((nxk === SW_START && nxs === "/*") || nxk === SW_COMMENT || (nxk === SW_END && nxs === "*/")) {
      const e = swEndOfScope(f, nextNonSpaceIndex);
      if (e >= 0) {
        nextNonSpaceIndex = e;
      }
      stage = 1;
    } else if (nxk === SW_START && nxs === "//") {
      stage = 1;
    } else {
      stage = 2;
    }
    let skip = false;
    if (stage === 1) {
      const a = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, nextNonSpaceIndex);
      if (a >= 0) {
        nextNonSpaceIndex = a;
      }
      const b = f.indexBefore(SW_T_NON_SPACE_OR_LINEBREAK, nextNonSpaceIndex);
      if (b >= 0) {
        nextNonSpaceIndex = b;
      }
      const li = f.indexAfter(SW_T_LINEBREAK, nextNonSpaceIndex);
      if (li >= 0) {
        const nt = f.indexAfter(SW_T_NON_SPACE, li);
        if (nt >= 0 && (f.tok(nt, SW_START, "#if") || f.kw(nt, "#else") || f.kw(nt, "#elseif"))) {
          skip = true;
        }
      }
    }
    if (!skip) {
      const li = f.indexAfter(SW_T_LINEBREAK, nextNonSpaceIndex);
      let skip2 = false;
      if (li >= 0) {
        const nk = f.indexAfter(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, li);
        if (nk >= 0 && (f.tok(nk, SW_END, "case") || f.tok(nk, SW_END, "default") || f.kw(nk, "@unknown"))) {
          skip2 = true;
        }
      }
      if (!skip2) {
        swApplyIndent(f, indent, i + 1);
      }
    }
  } else if (nxk === SW_END || (nxk === SW_KEYWORD && nxs === "@unknown")) {
    const m = toI32(st.sk.length);
    if (m > 0) {
      const sk = st.sk[m - 1];
      const ss = st.ss[m - 1];
      if (
        (sk === SW_START && (ss === "/*" || ss === "#if")) ||
        (sk === SW_KEYWORD && (ss === "#else" || ss === "#elseif")) ||
        (sk === SW_START && swIsStringDelimiter(sk, ss))
      ) {
        swApplyIndent(f, indent, i + 1);
      }
    }
  } else {
    let lastIndex = effectiveLastIndex > -1 ? effectiveLastIndex : i;
    while (f.tok(lastIndex, SW_END, "#endif")) {
      const index = f.indexBefore(SW_T_START_OF_SCOPE, lastIndex);
      if (index < 0 || !f.tok(index, SW_START, "#if")) {
        break;
      }
      const p = f.indexBefore(SW_T_NON_SPACE_OR_COMMENT_OR_LINEBREAK, index);
      lastIndex = p >= 0 ? p : index;
    }
    if (lastIndex === f.startOfLine(lastIndex, true)) {
      if (f.tok(lastIndex, SW_END, "}")) {
        if (f.op(nextNonSpaceIndex, ".", SW_OP_INFIX) || swIsLabel(f, nextNonSpaceIndex)) {
          indent = f.currentIndentForLine(lastIndex);
        } else if (f.kw(nextNonSpaceIndex0, "else") || f.tok(nextNonSpaceIndex0, SW_START, "{")) {
          const scopeStart = swStartOfScope(f, lastIndex);
          if (scopeStart >= 0) {
            const startIndex = swIndexOfLastSignificantKeyword(f, scopeStart);
            if (startIndex >= 0 && (f.kw(startIndex, "else") || f.kw(startIndex, "switch"))) {
              const eq = f.indexOfBefore(SW_OP, "=", SW_OP_INFIX, startIndex);
              if (eq >= 0) {
                const outer = swStartOfConditionalStatement(f, eq);
                if (outer >= 0) {
                  indent = f.currentIndentForLine(outer);
                }
              }
            }
          }
        }
      } else if (f.tok(lastIndex, SW_END, ")")) {
        if (f.op(nextNonSpaceIndex, ".", SW_OP_INFIX)) {
          indent = f.currentIndentForLine(lastIndex);
        }
      }
    }
    swApplyIndent(f, indent, i + 1);
  }
  if (linewrapped && swShouldIndentNextLine(f, i)) {
    st.setLastIndent(st.lastIndent() + SW_INDENT);
  }
  return result;
};

/** tokens[lo ..< hi].allSatisfy { $0.isEndOfScope || $0.isSpaceOrComment }. */
const swAllEndOfScopeOrSpace = (f: SwFormatter, lo: i32, hi: i32): boolean => {
  for (let j = lo; j < hi; j++) {
    if (!(f.k(j) === SW_END || swIsSpaceOrComment(f, j))) {
      return false;
    }
  }
  return true;
};

/** String.count of an indent. */
const swSpaceWidthCount = (s: string): i32 => swSpaceWidth(s) - swTabExtra(s);

const swTabExtra = (s: string): i32 => {
  let n = 0;
  for (let j = 0; j < toI32(s.length); j++) {
    if (s.charCodeAt(j) === 9) {
      n += 3;
    }
  }
  return n;
};

