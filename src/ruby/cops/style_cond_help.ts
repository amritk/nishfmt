// What the Style cops about conditionals share: rubocop-ast's IfNode,
// WhileNode and CaseNode predicates, the comment associator
// (ProcessedSource#ast_with_comments), Layout/LineLength's line length rules
// (LineLengthHelp with the default configuration) and the StatementModifier
// mixin.
//
// Ported from RuboCop 1.92.3, rubocop-ast 1.52.0 (MIT License, Copyright (c)
// 2012-24 Bozhidar Batsov) and parser 3.3.13.0 (MIT License, Copyright (c)
// 2013-2024 parser contributors).

import {
  F_BEGIN,
  F_DOT,
  F_ELSE,
  F_END,
  F_HEREDOC_BODY,
  F_HEREDOC_END,
  F_KEYWORD,
  F_QUESTION,
  F_SELECTOR,
  M_HEREDOC,
  NT_AND,
  NT_ARRAY,
  NT_BEGIN,
  NT_BREAK,
  NT_CASE,
  NT_CASE_MATCH,
  NT_CASGN,
  NT_CSEND,
  NT_CVASGN,
  NT_DEF,
  NT_DEFS,
  NT_DSTR,
  NT_GVASGN,
  NT_HASH,
  NT_IF,
  NT_IVASGN,
  NT_KWBEGIN,
  NT_LVASGN,
  NT_MASGN,
  NT_NEXT,
  NT_OR,
  NT_PAIR,
  NT_RETURN,
  NT_SEND,
  NT_STR,
  NT_SUPER,
  NT_UNTIL,
  NT_UNTIL_POST,
  NT_WHILE,
  NT_WHILE_POST,
  NT_XSTR,
  NT_YIELD,
  V_NIL,
} from "../ast";
import { RbSource } from "../source";
import {
  ssxAssignment,
  ssxDescendants,
  ssxFE,
  ssxFS,
  ssxHas,
  ssxIs,
  ssxIsCall,
  ssxIsSpace,
  ssxLocIs,
  ssxMeth,
  ssxParenthesized,
} from "./style_syntax_help";

// ---- IfNode, WhileNode, UntilNode -------------------------------------------------

/** IfNode#ternary? */
export const scnTernary = (src: RbSource, n: i32): boolean => ssxIs(src, n, NT_IF) && ssxHas(src, n, F_QUESTION);

/** IfNode#keyword (`if`, `unless`, `elsif`; "" for a ternary), WhileNode/UntilNode#keyword. */
export const scnKeyword = (src: RbSource, n: i32): string => {
  const t = src.a.type(n);
  if (t === NT_WHILE || t === NT_WHILE_POST) {
    return "while";
  }
  if (t === NT_UNTIL || t === NT_UNTIL_POST) {
    return "until";
  }
  if (t === NT_CASE || t === NT_CASE_MATCH) {
    return "case";
  }
  if (scnTernary(src, n) || !ssxHas(src, n, F_KEYWORD)) {
    return "";
  }
  return src.src(ssxFS(src, n, F_KEYWORD), ssxFE(src, n, F_KEYWORD));
};

/** IfNode#if? */
export const scnIfKw = (src: RbSource, n: i32): boolean => ssxIs(src, n, NT_IF) && scnKeyword(src, n) === "if";

/** IfNode#unless? */
export const scnUnless = (src: RbSource, n: i32): boolean =>
  ssxIs(src, n, NT_IF) && !scnTernary(src, n) && ssxFE(src, n, F_KEYWORD) - ssxFS(src, n, F_KEYWORD) === 6;

/** IfNode#elsif? */
export const scnElsif = (src: RbSource, n: i32): boolean => ssxIs(src, n, NT_IF) && scnKeyword(src, n) === "elsif";

/** IfNode#else? (also CaseNode): loc.else. */
export const scnElse = (src: RbSource, n: i32): boolean => ssxHas(src, n, F_ELSE);

/** IfNode#then?, WhenNode#then?: loc.begin is `then`. */
export const scnThen = (src: RbSource, n: i32): boolean => ssxLocIs(src, n, F_BEGIN, "then");

/** WhileNode#do? */
export const scnDo = (src: RbSource, n: i32): boolean => ssxLocIs(src, n, F_BEGIN, "do");

/** IfNode#inverse_keyword, WhileNode#inverse_keyword. */
export const scnInverseKeyword = (src: RbSource, n: i32): string => {
  const k = scnKeyword(src, n);
  if (k === "if") {
    return "unless";
  }
  if (k === "unless") {
    return "if";
  }
  if (k === "while") {
    return "until";
  }
  if (k === "until") {
    return "while";
  }
  return "";
};

/** Node#basic_conditional?: if, while, until. */
export const scnBasicConditional = (src: RbSource, n: i32): boolean =>
  src.a.isNode(n) && (src.a.type(n) === NT_IF || src.a.type(n) === NT_WHILE || src.a.type(n) === NT_UNTIL);

/** Node#conditional?: if, while, until, case, case_match. */
export const scnConditional = (src: RbSource, n: i32): boolean =>
  scnBasicConditional(src, n) || ssxIs(src, n, NT_CASE) || ssxIs(src, n, NT_CASE_MATCH);

/** modifier_form?: IfNode (if/unless without `end`), WhileNode/UntilNode (no `end`). */
export const scnModifier = (src: RbSource, n: i32): boolean => {
  if (!src.a.isNode(n)) {
    return false;
  }
  const t = src.a.type(n);
  if (t === NT_IF) {
    const k = scnKeyword(src, n);
    return (k === "if" || k === "unless") && !ssxHas(src, n, F_END);
  }
  if (t === NT_WHILE || t === NT_UNTIL || t === NT_WHILE_POST || t === NT_UNTIL_POST) {
    return !ssxHas(src, n, F_END);
  }
  return false;
};

/** IfNode#if_branch. */
export const scnIfBranch = (src: RbSource, n: i32): i32 => (scnUnless(src, n) ? src.a.kid(n, 2) : src.a.kid(n, 1));

/** IfNode#else_branch. */
export const scnElseBranch = (src: RbSource, n: i32): i32 => (scnUnless(src, n) ? src.a.kid(n, 1) : src.a.kid(n, 2));

/** ConditionalNode#body: the if branch of an if, the body of a while/until. */
export const scnBody = (src: RbSource, n: i32): i32 =>
  src.a.type(n) === NT_IF ? scnIfBranch(src, n) : src.a.kid(n, 1);

/** IfNode#elsif_conditional?: the else branch is an elsif. */
export const scnElsifConditional = (src: RbSource, n: i32): boolean => {
  const e = scnElseBranch(src, n);
  return ssxIs(src, e, NT_IF) && scnElsif(src, e);
};

/** Node#each_node(type): n and its descendants of type t. */
export const scnEachNode = (src: RbSource, n: i32, t: i32): i32[] => {
  const out: i32[] = [];
  if (!src.a.isNode(n)) {
    return out;
  }
  if (src.a.type(n) === t) {
    out.push(n);
  }
  for (const d of ssxDescendants(src, n)) {
    if (src.a.type(d) === t) {
      out.push(d);
    }
  }
  return out;
};

/** IfNode#nested_conditional?: an if (not an elsif) in the if or else branch. */
export const scnNestedConditional = (src: RbSource, n: i32): boolean => {
  const parts: i32[] = [src.a.kid(n, 1), src.a.kid(n, 2)];
  for (const b of parts) {
    if (b === V_NIL) {
      continue;
    }
    for (const x of scnEachNode(src, b, NT_IF)) {
      if (!scnElsif(src, x)) {
        return true;
      }
    }
  }
  return false;
};

/** IfNode#branches. */
export const scnBranches = (src: RbSource, n: i32): i32[] => {
  const out: i32[] = [];
  if (scnTernary(src, n)) {
    out.push(scnIfBranch(src, n));
    out.push(scnElseBranch(src, n));
    return out;
  }
  out.push(scnIfBranch(src, n));
  if (!scnElse(src, n)) {
    return out;
  }
  if (scnElsifConditional(src, n)) {
    for (const b of scnBranches(src, scnElseBranch(src, n))) {
      out.push(b);
    }
  } else {
    out.push(scnElseBranch(src, n));
  }
  return out;
};

/** Node#any_str heredoc?: a str/dstr/xstr with a heredoc map. */
export const scnHeredoc = (src: RbSource, n: i32): boolean => {
  if (!src.a.isNode(n)) {
    return false;
  }
  const t = src.a.type(n);
  return (t === NT_STR || t === NT_DSTR || t === NT_XSTR) && src.a.mapKind(src.a.map(n)) === M_HEREDOC;
};

/** each_node(:any_str): n and its str/dstr/xstr descendants. */
export const scnEachStr = (src: RbSource, n: i32): i32[] => {
  const out: i32[] = [];
  if (!src.a.isNode(n)) {
    return out;
  }
  const all: i32[] = [n];
  for (const d of ssxDescendants(src, n)) {
    all.push(d);
  }
  for (const x of all) {
    const t = src.a.type(x);
    if (t === NT_STR || t === NT_DSTR || t === NT_XSTR) {
      out.push(x);
    }
  }
  return out;
};

/** Node#chained?: the receiver of a call parent. */
export const scnChained = (src: RbSource, n: i32): boolean => {
  const p = src.parent(n);
  return p !== V_NIL && ssxIsCall(src, p) && src.a.kid(p, 0) === n;
};

/** Node#operator_keyword?: and, or. */
export const scnOperatorKeyword = (src: RbSource, n: i32): boolean => ssxIs(src, n, NT_AND) || ssxIs(src, n, NT_OR);

/** any_def_type? and endless? */
export const scnEndlessDef = (src: RbSource, n: i32): boolean =>
  (ssxIs(src, n, NT_DEF) || ssxIs(src, n, NT_DEFS)) && !ssxHas(src, n, F_END);

/** Node#source_range.size == 0. */
export const scnEmptySource = (src: RbSource, n: i32): boolean => src.a.exE(n) - src.a.exS(n) === 0;

/** Node#nonempty_line_count: the lines of the source with a non-space character. */
export const scnNonemptyLineCount = (src: RbSource, n: i32): i32 => {
  let k = 0;
  let seen = false;
  for (let p = src.a.exS(n); p < src.a.exE(n); p++) {
    const c = src.at(p);
    if (c === 10) {
      if (seen) {
        k++;
      }
      seen = false;
    } else if (!ssxIsSpace(c)) {
      seen = true;
    }
  }
  return seen ? k + 1 : k;
};

/** Node#left_siblings: the parent's children before n (handles; nodes and scalars). */
export const scnLeftSiblings = (src: RbSource, n: i32): i32[] => {
  const out: i32[] = [];
  const p = src.parent(n);
  if (p === V_NIL) {
    return out;
  }
  for (let i = 0; i < src.a.nKid(p); i++) {
    const c = src.a.kid(p, i);
    if (c === n) {
      break;
    }
    out.push(c);
  }
  return out;
};

// ---- Comments ---------------------------------------------------------------------

/** ProcessedSource#comment_at_line: the comment the index keeps for line l (the last starting there), or -1. */
export const scnCommentAt = (src: RbSource, l: i32): i32 => {
  let r = -1;
  for (let i = 0; i < toI32(src.commS.length); i++) {
    const cl = src.line(src.commS[i]);
    if (cl === l) {
      r = i;
    } else if (cl > l) {
      break;
    }
  }
  return r;
};

/** ProcessedSource#contains_comment? / each_comment_in_lines(l1..l2).any? */
export const scnCommentInLines = (src: RbSource, l1: i32, l2: i32): boolean => {
  for (let i = 0; i < toI32(src.commS.length); i++) {
    const l = src.line(src.commS[i]);
    if (l >= l1 && l <= l2) {
      return true;
    }
  }
  return false;
};

/** Comments (indexes) whose line is in [l1, l2), in line order (each_comment_in_lines(l1...l2)). */
export const scnCommentsInLines = (src: RbSource, l1: i32, l2: i32): i32[] => {
  const out: i32[] = [];
  for (let l = l1; l < l2; l++) {
    const c = scnCommentAt(src, l);
    if (c >= 0) {
      out.push(c);
    }
  }
  return out;
};

/** Whether [s, e) matches /\A#\s*(-\*-|)\s*(frozen_string_literal|warn_indent|warn_past_scope):.*\1$/ (approximately). */
const scnMagicComment = (t: string): boolean => {
  if (!t.startsWith("#")) {
    return false;
  }
  let i = 1;
  const k = toI32(t.length);
  while (i < k && ssxIsSpace(t.charCodeAt(i))) {
    i++;
  }
  let emacs = false;
  if (t.substring(i, i + 3) === "-*-") {
    emacs = true;
    i += 3;
  }
  while (i < k && ssxIsSpace(t.charCodeAt(i))) {
    i++;
  }
  const rest = t.substring(i, k);
  if (
    !(
      rest.startsWith("frozen_string_literal:") ||
      rest.startsWith("warn_indent:") ||
      rest.startsWith("warn_past_scope:")
    )
  ) {
    return false;
  }
  return !emacs || t.endsWith("-*-");
};

/** Buffer::ENCODING_RE: /[\s#](en)?coding\s*[:=]\s*([A-Za-z0-9_-]+)/ (the comment form). */
const scnEncodingComment = (t: string): boolean => {
  const k = toI32(t.length);
  let p = t.indexOf("coding", 0);
  while (p >= 0) {
    let q = p;
    if (q >= 2 && t.substring(q - 2, q) === "en") {
      q -= 2;
    }
    const before = q > 0 ? t.charCodeAt(q - 1) : -1;
    if (before === 35 || ssxIsSpace(before)) {
      let i = p + 6;
      while (i < k && ssxIsSpace(t.charCodeAt(i))) {
        i++;
      }
      if (i < k && (t.charCodeAt(i) === 58 || t.charCodeAt(i) === 61)) {
        i++;
        while (i < k && ssxIsSpace(t.charCodeAt(i))) {
          i++;
        }
        if (i < k) {
          const c = t.charCodeAt(i);
          if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 45) {
            return true;
          }
        }
      }
    }
    p = t.indexOf("coding", p + 1);
  }
  return false;
};

/** Parser::Source::Comment::Associator#associate_by_identity: node -> its comments (indexes). */
export class ScnAssoc {
  map: Map<i32, i32[]>;
  cur: i32 = 0;
  src: RbSource | null = null;

  constructor() {
    this.map = new Map<i32, i32[]>();
  }

  /** Associates the comments of a source with its nodes. */
  build(src: RbSource): void {
    this.src = src;
    this.map = new Map<i32, i32[]>();
    this.cur = 0;
    const nc = toI32(src.commS.length);
    if (this.cur < nc && src.src(src.commS[this.cur], src.commE[this.cur]).startsWith("#!")) {
      this.cur = this.cur + 1;
    }
    if (this.cur < nc && scnMagicComment(src.src(src.commS[this.cur], src.commE[this.cur]))) {
      this.cur = this.cur + 1;
    }
    if (this.cur < nc && scnEncodingComment(src.src(src.commS[this.cur], src.commE[this.cur]))) {
      this.cur = this.cur + 1;
    }
    if (src.root !== V_NIL) {
      this.visit(src, src.root);
    }
  }

  /** The comments associated with node n. */
  of(n: i32): i32[] {
    const r = this.map.get(n);
    if (r === undefined) {
      const none: i32[] = [];
      return none;
    }
    return r;
  }

  private add(n: i32): void {
    const r = this.map.get(n);
    if (r === undefined) {
      const xs: i32[] = [this.cur];
      this.map.set(n, xs);
    } else {
      r.push(this.cur);
    }
    this.cur = this.cur + 1;
  }

  private more(src: RbSource): boolean {
    return this.cur < toI32(src.commS.length);
  }

  private visit(src: RbSource, n: i32): void {
    const a = src.a;
    if (a.type(n) !== NT_BEGIN) {
      while (this.more(src) && src.commE[this.cur] <= a.exS(n)) {
        this.add(n);
      }
    }
    if (!this.more(src)) {
      return;
    }
    if (src.line(src.commS[this.cur]) <= src.line(a.exE(n)) || a.mapKind(a.map(n)) === M_HEREDOC) {
      for (const c of this.children(src, n)) {
        this.visit(src, c);
      }
      while (this.more(src) && src.commE[this.cur] <= a.exE(n)) {
        this.add(n);
      }
      while (this.more(src) && src.line(src.commS[this.cur]) === src.line(a.exE(n))) {
        this.add(n);
      }
    }
  }

  private children(src: RbSource, n: i32): i32[] {
    const a = src.a;
    const t = a.type(n);
    const out: i32[] = [];
    for (let i = 0; i < a.nKid(n); i++) {
      const c = a.kid(n, i);
      if (a.isNode(c) && a.exS(c) >= 0) {
        out.push(c);
      }
    }
    if (
      t === NT_IF ||
      t === NT_WHILE ||
      t === NT_WHILE_POST ||
      t === NT_UNTIL ||
      t === NT_UNTIL_POST ||
      t === NT_MASGN
    ) {
      // sort_by begin_pos
      for (let i = 1; i < toI32(out.length); i++) {
        let j = i;
        while (j > 0 && a.exS(out[j - 1]) > a.exS(out[j])) {
          const x = out[j];
          out[j] = out[j - 1];
          out[j - 1] = x;
          j--;
        }
      }
    }
    return out;
  }
}

/** RangeHelp#range_with_comments: the span of a node and its associated comments, as [s, e]. */
export const scnRangeWithComments = (src: RbSource, as: ScnAssoc, n: i32): i32[] => {
  let s = src.a.exS(n);
  let e = src.a.exE(n);
  for (const c of as.of(n)) {
    if (src.commS[c] < s) {
      s = src.commS[c];
    }
    if (src.commE[c] > e) {
      e = src.commE[c];
    }
  }
  const r: i32[] = [s, e];
  return r;
};

// ---- Lines ------------------------------------------------------------------------

/** range_by_whole_lines: the start. */
export const scnWholeS = (src: RbSource, s: i32): i32 => src.lineStart(src.line(s));

/** range_by_whole_lines: the end (past the newline when asked), within the buffer. */
export const scnWholeE = (src: RbSource, e: i32, nl: boolean): i32 => {
  const le = src.lineEnd(src.line(e)) + (nl ? 1 : 0);
  return le > src.n ? src.n : le;
};

/** The text of line l from its start to position p (source_line[0...column]). */
export const scnLineBefore = (src: RbSource, p: i32): string => src.src(src.lineStart(src.line(p)), p);

/** The text of the line holding p from p to its end (source_line[last_column..]). */
export const scnLineAfter = (src: RbSource, p: i32): string => src.src(p, src.lineEnd(src.line(p)));

/** Ruby's String#length of UTF-8 bytes: characters. */
export const scnLen = (s: string): i32 => {
  let k = 0;
  for (let i = 0; i < toI32(s.length); i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80 || c >= 0xc0) {
      k++;
    }
  }
  return k;
};

/** ' ' * k. */
export const scnSpaces = (k: i32): string => {
  const parts: string[] = [];
  for (let i = 0; i < k; i++) {
    parts.push(" ");
  }
  return parts.join("");
};

/** String#rstrip (ASCII whitespace and NUL). */
export const scnRstrip = (s: string): string => {
  let e = toI32(s.length);
  while (e > 0 && (ssxIsSpace(s.charCodeAt(e - 1)) || s.charCodeAt(e - 1) === 0)) {
    e--;
  }
  return s.substring(0, e);
};

/** String#chomp (one trailing "\n", "\r\n" or "\r"). */
export const scnChomp = (s: string): string => {
  const k = toI32(s.length);
  if (k > 0 && s.charCodeAt(k - 1) === 10) {
    if (k > 1 && s.charCodeAt(k - 2) === 13) {
      return s.substring(0, k - 2);
    }
    return s.substring(0, k - 1);
  }
  if (k > 0 && s.charCodeAt(k - 1) === 13) {
    return s.substring(0, k - 1);
  }
  return s;
};

// ---- Layout/LineLength (LineLengthHelp, default configuration) -------------------------

/** max_line_length. */
export const SCN_MAX: i32 = 120;

/** LineLengthHelp#indentation_difference with a tab width of 2. */
export const scnIndentDiff = (s: string): i32 => {
  if (s.length === 0 || s.charCodeAt(0) !== 9) {
    return 0;
  }
  let i = 0;
  while (i < toI32(s.length) && s.charCodeAt(i) === 9) {
    i++;
  }
  return i >= toI32(s.length) ? 0 : i;
};

/** LineLengthHelp#line_length. */
export const scnLineLength = (s: string): i32 => scnLen(s) + scnIndentDiff(s);

const scnWordChar = (c: i32): boolean =>
  (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c >= 0x80;

const SCN_MODES: string = "disable-next enable-next todo-next disable enable push todo next pop";

/** The byte offset of the first DirectiveComment::DIRECTIVE_COMMENT_REGEXP match in s (its header part), or -1; `end` gets the header's end. */
const scnDirectiveAt = (s: string, from: i32, end: i32[]): i32 => {
  const k = toI32(s.length);
  for (let i = from; i < k; i++) {
    if (s.charCodeAt(i) !== 35) {
      continue;
    }
    let p = i + 1;
    while (p < k && ssxIsSpace(s.charCodeAt(p))) {
      p++;
    }
    if (s.substring(p, p + 7) !== "rubocop") {
      continue;
    }
    p += 7;
    while (p < k && ssxIsSpace(s.charCodeAt(p))) {
      p++;
    }
    if (p >= k || s.charCodeAt(p) !== 58) {
      continue;
    }
    p++;
    while (p < k && ssxIsSpace(s.charCodeAt(p))) {
      p++;
    }
    let q = 0;
    let found = false;
    while (q < toI32(SCN_MODES.length)) {
      let sp = SCN_MODES.indexOf(" ", q);
      if (sp < 0) {
        sp = toI32(SCN_MODES.length);
      }
      const m = SCN_MODES.substring(q, sp);
      q = sp + 1;
      const ml = toI32(m.length);
      if (s.substring(p, p + ml) === m && (p + ml >= k || !scnWordChar(s.charCodeAt(p + ml)))) {
        end[0] = p + ml;
        found = true;
        break;
      }
    }
    if (found) {
      return i;
    }
  }
  return -1;
};

/** DirectiveComment.new(comment).match_captures is set: the comment text is a directive. */
export const scnIsDirective = (text: string): boolean => {
  const end: i32[] = [0];
  const i = scnDirectiveAt(text, 0, end);
  if (i < 0) {
    return false;
  }
  // pre_match =~ /\A#\s*\z/ drops it.
  const pre = text.substring(0, i);
  if (pre.startsWith("#")) {
    let allSpace = true;
    for (let j = 1; j < toI32(pre.length); j++) {
      if (!ssxIsSpace(pre.charCodeAt(j))) {
        allSpace = false;
      }
    }
    if (allSpace) {
      return false;
    }
  }
  return true;
};

/** URI chars the RFC 2396 regexp accepts after the scheme (approximately). */
const scnUriChar = (c: i32): boolean =>
  (c >= 48 && c <= 57) ||
  (c >= 65 && c <= 90) ||
  (c >= 97 && c <= 122) ||
  "-_.!~*'();/?:@&=+$,[]%#".indexOf(String.fromCharCode(c)) >= 0;

/** LineLengthHelp#extend_end_position (byte offsets). */
const scnExtendEnd = (s: string, e0: i32): i32 => {
  let e = e0;
  const k = toI32(s.length);
  // /{(\s|\S)*}$/: a `{` with a `}` closing the line after it.
  const ob = s.indexOf("{", 0);
  if (ob >= 0 && k > 0 && s.charCodeAt(k - 1) === 125 && k - 1 > ob) {
    // line[e..].match(/(\s|\S)*}/): up to the last `}`.
    let last = -1;
    for (let i = e; i < k; i++) {
      if (s.charCodeAt(i) === 125) {
        last = i;
      }
    }
    if (last >= 0) {
      e = last + 1;
    }
  }
  // /^\S+(?=\s|$)/
  let i = e;
  while (i < k && !ssxIsSpace(s.charCodeAt(i))) {
    i++;
  }
  if (i > e) {
    e = i;
  }
  return e;
};

/** LineLengthHelp#allowed_by_uri? with URISchemes http, https. */
export const scnAllowedByUri = (s: string): boolean => {
  const k = toI32(s.length);
  let lastB = -1;
  let lastE = -1;
  let i = 0;
  while (i < k) {
    let sl = 0;
    if (s.substring(i, i + 5) === "http:") {
      sl = 5;
    } else if (s.substring(i, i + 6) === "https:") {
      sl = 6;
    }
    if (sl === 0) {
      i++;
      continue;
    }
    let j = i + sl;
    while (j < k && scnUriChar(s.charCodeAt(j))) {
      j++;
    }
    lastB = i;
    lastE = j;
    i = j > i ? j : i + 1;
  }
  if (lastB < 0) {
    return false;
  }
  const end = scnExtendEnd(s, lastE);
  const d = scnIndentDiff(s);
  const b = scnLen(s.substring(0, lastB)) + d;
  const e = scnLen(s.substring(0, end)) + d;
  if (b < SCN_MAX && e < SCN_MAX) {
    return false;
  }
  return b < SCN_MAX && e === scnLineLength(s);
};

/** StatementModifier#acceptable_line_length? for source line l (its text s). */
export const scnAcceptableLineLength = (src: RbSource, s: string, l: i32): boolean => {
  if (scnLineLength(s) <= SCN_MAX) {
    return true;
  }
  if (!src.copEnabledAt("Layout/LineLength", l, l)) {
    return true;
  }
  const c = scnCommentAt(src, l);
  if (c >= 0 && scnIsDirective(src.src(src.commS[c], src.commE[c]))) {
    const end: i32[] = [0];
    const at = scnDirectiveAt(s, 0, end);
    const before = at < 0 ? s : s.substring(0, at);
    return scnLen(scnRstrip(before)) <= SCN_MAX;
  }
  return scnAllowedByUri(s);
};

// ---- StatementModifier ------------------------------------------------------------

/** StatementModifier#comment_disables_cop?: /#\s*rubocop\s*:\s*(disable|todo)\s*([^,],)*\s*(all|Cop)/. */
export const scnCommentDisablesCop = (t: string, cop: string): boolean => {
  const k = toI32(t.length);
  for (let i = 0; i < k; i++) {
    if (t.charCodeAt(i) !== 35) {
      continue;
    }
    let p = i + 1;
    while (p < k && ssxIsSpace(t.charCodeAt(p))) {
      p++;
    }
    if (t.substring(p, p + 7) !== "rubocop") {
      continue;
    }
    p += 7;
    while (p < k && ssxIsSpace(t.charCodeAt(p))) {
      p++;
    }
    if (p >= k || t.charCodeAt(p) !== 58) {
      continue;
    }
    p++;
    while (p < k && ssxIsSpace(t.charCodeAt(p))) {
      p++;
    }
    if (t.substring(p, p + 7) === "disable") {
      p += 7;
    } else if (t.substring(p, p + 4) === "todo") {
      p += 4;
    } else {
      continue;
    }
    // \s* ([^,],)* \s* (all|cop): try every number of `x,` pairs (backtracking).
    const starts: i32[] = [];
    let q = p;
    while (q < k && ssxIsSpace(t.charCodeAt(q))) {
      q++;
    }
    starts.push(q);
    while (q + 1 < k && t.charCodeAt(q) !== 44 && t.charCodeAt(q + 1) === 44) {
      q += 2;
      starts.push(q);
    }
    for (const s0 of starts) {
      let r = s0;
      while (r < k && ssxIsSpace(t.charCodeAt(r))) {
        r++;
      }
      if (t.substring(r, r + 3) === "all" || t.substring(r, r + toI32(cop.length)) === cop) {
        return true;
      }
    }
  }
  return false;
};

/** StatementModifier#first_line_comment: the comment on the node's first line unless it disables the cop ("" for none). */
export const scnFirstLineComment = (src: RbSource, n: i32, cop: string): string => {
  const c = scnCommentAt(src, src.line(src.a.exS(n)));
  if (c < 0) {
    return "";
  }
  const t = src.src(src.commS[c], src.commE[c]);
  return scnCommentDisablesCop(t, cop) ? "" : t;
};

/** StatementModifier#code_after: the code after the node's `end` on its line ("" for none). */
export const scnCodeAfter = (src: RbSource, n: i32): string => scnLineAfter(src, ssxFE(src, n, F_END));

/** StatementModifier#parenthesize? */
export const scnParenthesize = (src: RbSource, n: i32): boolean => {
  const p = src.parent(n);
  if (p === V_NIL) {
    return false;
  }
  if (ssxAssignment(src, p) || scnOperatorKeyword(src, p)) {
    return true;
  }
  const t = src.a.type(p);
  if (t === NT_ARRAY || t === NT_PAIR || t === NT_SEND || t === NT_CSEND || t === NT_YIELD || t === NT_SUPER) {
    return true;
  }
  if (t === NT_IF) {
    return scnTernary(src, p);
  }
  return scnEndlessDef(src, p);
};

/** StatementModifier#if_body_source. */
export const scnIfBodySource = (src: RbSource, b: i32): string => {
  const a = src.a;
  if (scnOmittedValueCall(src, b)) {
    const endE = ssxHas(src, b, F_SELECTOR) ? ssxFE(src, b, F_SELECTOR) : ssxFE(src, b, F_DOT);
    const parts: string[] = [];
    for (let i = 2; i < a.nKid(b); i++) {
      parts.push(src.nodeSrc(a.kid(b, i)));
    }
    return `${src.src(a.exS(b), endE)}(${parts.join(", ")})`;
  }
  const t = a.type(b);
  let v = V_NIL;
  if (t === NT_RETURN || t === NT_NEXT || t === NT_BREAK) {
    if (a.nKid(b) === 1) {
      v = a.kid(b, 0);
    }
  } else if (t === NT_LVASGN || t === NT_IVASGN || t === NT_CVASGN || t === NT_GVASGN || t === NT_CASGN) {
    v = a.kid(b, -1);
  }
  if (v !== V_NIL && a.isNode(v)) {
    return `${src.src(a.exS(b), a.exS(v))}${scnIfBodySource(src, v)}${src.src(a.exE(v), a.exE(b))}`;
  }
  return src.nodeSrc(b);
};

/** unparenthesized_call_with_omitted_value? */
const scnOmittedValueCall = (src: RbSource, b: i32): boolean => {
  const a = src.a;
  if (!ssxIsCall(src, b) || ssxMeth(src, b) === "[]=" || ssxParenthesized(src, b)) {
    return false;
  }
  if (a.nKid(b) <= 2) {
    return false;
  }
  const last = a.kid(b, -1);
  if (!ssxIs(src, last, NT_HASH)) {
    return false;
  }
  let lp = V_NIL;
  for (let i = 0; i < a.nKid(last); i++) {
    if (ssxIs(src, a.kid(last, i), NT_PAIR)) {
      lp = a.kid(last, i);
    }
  }
  if (lp === V_NIL) {
    return false;
  }
  // PairNode#value_omission?: the pair's source ends with `:`.
  return src.at(a.exE(lp) - 1) === 58;
};

/** StatementModifier#to_modifier_form. */
export const scnToModifierForm = (src: RbSource, n: i32, cop: string): string => {
  const parts: string[] = [];
  const body = scnBody(src, n);
  if (body !== V_NIL) {
    parts.push(scnIfBodySource(src, body));
  }
  parts.push(scnKeyword(src, n));
  parts.push(src.nodeSrc(src.a.kid(n, 0)));
  const expr = parts.join(" ");
  const pe = scnParenthesize(src, n) ? `(${expr})` : expr;
  const c = scnFirstLineComment(src, n, cop);
  return c.length > 0 ? `${pe} ${c}` : pe;
};

/** StatementModifier#non_eligible_node? (the mixin's own). */
export const scnNonEligibleNodeBase = (src: RbSource, n: i32, cop: string): boolean => {
  if (scnModifier(src, n) || scnNonemptyLineCount(src, n) > 3) {
    return true;
  }
  if (scnCommentAt(src, src.line(src.a.exE(n))) >= 0) {
    return true;
  }
  return scnFirstLineComment(src, n, cop).length > 0 && scnCodeAfter(src, n).length > 0;
};

/** StatementModifier#non_eligible_body? (the mixin's own). */
export const scnNonEligibleBodyBase = (src: RbSource, b: i32): boolean => {
  if (b === V_NIL || scnEmptySource(src, b) || ssxIs(src, b, NT_BEGIN)) {
    return true;
  }
  return scnCommentInLines(src, src.line(src.a.exS(b)), src.line(src.a.exE(b)));
};

/** StatementModifier#non_eligible_condition?: an lvasgn in the condition. */
export const scnNonEligibleCondition = (src: RbSource, c: i32): boolean => scnEachNode(src, c, NT_LVASGN).length > 0;

/** StatementModifier#modifier_fits_on_single_line? (line_in_modifier_form within the limit). */
export const scnModifierFits = (src: RbSource, n: i32, cop: string): boolean => {
  const kwS = ssxFS(src, n, F_KEYWORD);
  const line = `${scnLineBefore(src, kwS)}${scnToModifierForm(src, n, cop)}${scnCodeAfter(src, n)}`;
  return scnLineLength(line) <= SCN_MAX;
};

/** kwbegin or conditional body (WhileUntilModifier's non_eligible_body? additions). */
export const scnKwbeginOrConditional = (src: RbSource, b: i32): boolean =>
  scnConditional(src, b) || ssxIs(src, b, NT_KWBEGIN);

/** The heredoc range (body through end) of a heredoc string node: [s, e]. */
export const scnHeredocRange = (src: RbSource, h: i32): i32[] => {
  const r: i32[] = [ssxFS(src, h, F_HEREDOC_BODY), ssxFE(src, h, F_HEREDOC_END)];
  return r;
};

/** Whether n has an ancestor of type t. */
export const scnHasAncestor = (src: RbSource, n: i32, t: i32): boolean => {
  let p = src.parent(n);
  while (p !== V_NIL) {
    if (src.a.type(p) === t) {
      return true;
    }
    p = src.parent(p);
  }
  return false;
};
