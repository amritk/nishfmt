// What the Style cops about calls, definitions and small syntax choices
// share: rubocop-ast node predicates (SendNode, DefNode, BlockNode, ...) and
// the TrailingComma mixin.
//
// Ported from RuboCop 1.92.3 and rubocop-ast 1.52.0 (MIT License, Copyright
// (c) 2012-24 Bozhidar Batsov).

import {
  F_BEGIN,
  F_DOT,
  F_END,
  F_EXPRESSION,
  F_HEREDOC_BODY,
  F_KEYWORD,
  F_OPERATOR,
  F_SELECTOR,
  NT_AND_ASGN,
  NT_ARGS,
  NT_ARRAY_PATTERN,
  NT_ARRAY_PATTERN_WITH_TAIL,
  NT_BEGIN,
  NT_BLOCK,
  NT_CASGN,
  NT_CBASE,
  NT_CLASS,
  NT_COMPLEX,
  NT_CONST,
  NT_CONST_PATTERN,
  NT_CSEND,
  NT_CVASGN,
  NT_DEF,
  NT_DEFS,
  NT_FALSE,
  NT_FIND_PATTERN,
  NT_FLOAT,
  NT_GVASGN,
  NT_HASH,
  NT_HASH_PATTERN,
  NT_IF,
  NT_IN_PATTERN,
  NT_INT,
  NT_IVASGN,
  NT_KWBEGIN,
  NT_LVASGN,
  NT_MASGN,
  NT_MATCH_ALT,
  NT_MATCH_AS,
  NT_MATCH_PATTERN,
  NT_MATCH_PATTERN_P,
  NT_MODULE,
  NT_NIL,
  NT_NUMBLOCK,
  NT_OP_ASGN,
  NT_OR_ASGN,
  NT_PAIR,
  NT_RATIONAL,
  NT_REGOPT,
  NT_RESBODY,
  NT_SCLASS,
  NT_SEND,
  NT_STR,
  NT_SUPER,
  NT_SYM,
  NT_TRUE,
  NT_YIELD,
  vTag,
  V_NIL,
  VT_SYM,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { TK_kRESCUE_MOD } from "../tables";

// ---- Node predicates ------------------------------------------------------------

/** Whether a handle is a node of type t. */
export const ssxIs = (src: RbSource, n: i32, t: i32): boolean => src.a.isNode(n) && src.a.type(n) === t;

/** call_type?: send or csend. */
export const ssxIsCall = (src: RbSource, n: i32): boolean =>
  src.a.isNode(n) && (src.a.type(n) === NT_SEND || src.a.type(n) === NT_CSEND);

/** any_block_type?: block or numblock. */
export const ssxIsAnyBlock = (src: RbSource, n: i32): boolean =>
  src.a.isNode(n) && (src.a.type(n) === NT_BLOCK || src.a.type(n) === NT_NUMBLOCK);

/** The method name of a send/csend ("" for other nodes). */
export const ssxMeth = (src: RbSource, n: i32): string => {
  if (!ssxIsCall(src, n)) {
    return "";
  }
  return src.a.text(src.a.kid(n, 1));
};

/** The arguments of a send/csend (children from 2), super/yield (all children). */
export const ssxArgs = (src: RbSource, n: i32): i32[] => {
  const out: i32[] = [];
  const t = src.a.type(n);
  const from = t === NT_SEND || t === NT_CSEND ? 2 : 0;
  for (let i = from; i < src.a.nKid(n); i++) {
    out.push(src.a.kid(n, i));
  }
  return out;
};

/** The number of arguments of a send/csend. */
export const ssxArgc = (src: RbSource, n: i32): i32 => src.a.nKid(n) - 2;

/** loc_is?(field, text). */
export const ssxLocIs = (src: RbSource, n: i32, f: i32, text: string): boolean => {
  const m = src.a.map(n);
  if (!src.a.has(m, f)) {
    return false;
  }
  return src.src(src.a.fS(m, f), src.a.fE(m, f)) === text;
};

/** loc?(field). */
export const ssxHas = (src: RbSource, n: i32, f: i32): boolean => src.a.has(src.a.map(n), f);

export const ssxFS = (src: RbSource, n: i32, f: i32): i32 => src.a.fS(src.a.map(n), f);

export const ssxFE = (src: RbSource, n: i32, f: i32): i32 => src.a.fE(src.a.map(n), f);

/** ParameterizedNode#parenthesized?: loc.end is `)`. */
export const ssxParenthesized = (src: RbSource, n: i32): boolean => ssxLocIs(src, n, F_END, ")");

/** command?(name): no receiver, that method. */
export const ssxCommand = (src: RbSource, n: i32, name: string): boolean =>
  ssxIsCall(src, n) && src.a.kid(n, 0) === V_NIL && ssxMeth(src, n) === name;

/** setter_method?: the send has an operator (`a.b = c`). */
export const ssxSetter = (src: RbSource, n: i32): boolean => ssxHas(src, n, F_OPERATOR);

/** MethodIdentifierPredicates#operator_method? */
export const ssxOperatorName = (m: string): boolean =>
  ssxInList(" | ^ & <=> == === =~ > >= < <= << >> + - * / % ** ~ +@ -@ !@ ~@ [] []= ! != !~ ` ", m);

/** Whether m is one of the space-separated words of list (which starts and ends with a space). */
export const ssxInList = (list: string, m: string): boolean => m.length > 0 && list.indexOf(` ${m} `) >= 0;

/** Node#assignment?, with SendNode's override (setter_method?). */
export const ssxAssignment = (src: RbSource, n: i32): boolean => {
  if (!src.a.isNode(n)) {
    return false;
  }
  const t = src.a.type(n);
  if (t === NT_SEND || t === NT_CSEND) {
    return ssxSetter(src, n);
  }
  return (
    t === NT_LVASGN ||
    t === NT_IVASGN ||
    t === NT_CVASGN ||
    t === NT_GVASGN ||
    t === NT_CASGN ||
    t === NT_MASGN ||
    t === NT_OP_ASGN ||
    t === NT_OR_ASGN ||
    t === NT_AND_ASGN
  );
};

/** Node#argument?: one of a send parent's arguments. */
export const ssxArgument = (src: RbSource, n: i32): boolean => {
  const p = src.parent(n);
  if (p === V_NIL || src.a.type(p) !== NT_SEND) {
    return false;
  }
  for (let i = 2; i < src.a.nKid(p); i++) {
    if (src.a.kid(p, i) === n) {
      return true;
    }
  }
  return false;
};

/** (const {nil? cbase} :Name). */
export const ssxGlobalConst = (src: RbSource, n: i32, name: string): boolean => {
  if (!ssxIs(src, n, NT_CONST)) {
    return false;
  }
  const ns = src.a.kid(n, 0);
  if (ns !== V_NIL && !ssxIs(src, ns, NT_CBASE)) {
    return false;
  }
  return src.a.text(src.a.kid(n, 1)) === name;
};

/** (const nil? :Name). */
export const ssxBareConst = (src: RbSource, n: i32, name: string): boolean =>
  ssxIs(src, n, NT_CONST) && src.a.kid(n, 0) === V_NIL && src.a.text(src.a.kid(n, 1)) === name;

/** A symbol child handle's text, or "" when it is not a symbol. */
export const ssxSymText = (src: RbSource, h: i32): string => (h !== V_NIL && vTag(h) === VT_SYM ? src.a.text(h) : "");

/** MethodDispatchNode#block_literal?: the send of a block/numblock parent. */
export const ssxBlockLiteral = (src: RbSource, n: i32): boolean => {
  const p = src.parent(n);
  return p !== V_NIL && ssxIsAnyBlock(src, p) && src.a.kid(p, 0) === n;
};

/** The def's argument node (def: kid 1, defs: kid 2). */
export const ssxDefArgs = (src: RbSource, n: i32): i32 =>
  src.a.type(n) === NT_DEF ? src.a.kid(n, 1) : src.a.kid(n, 2);

/** The def's body (def: kid 2, defs: kid 3). */
export const ssxDefBody = (src: RbSource, n: i32): i32 =>
  src.a.type(n) === NT_DEF ? src.a.kid(n, 2) : src.a.kid(n, 3);

/** The def's name. */
export const ssxDefName = (src: RbSource, n: i32): string =>
  src.a.type(n) === NT_DEF ? src.a.text(src.a.kid(n, 0)) : src.a.text(src.a.kid(n, 1));

/** DefNode#endless?: no `end`. */
export const ssxEndless = (src: RbSource, n: i32): boolean => !ssxHas(src, n, F_END);

/** The first line of a node. */
export const ssxFirstLine = (src: RbSource, n: i32): i32 => src.line(src.a.exS(n));

/** The last line of a node. */
export const ssxLastLine = (src: RbSource, n: i32): i32 => src.line(src.a.exE(n));

/** Node#single_line? */
export const ssxSingleLine = (src: RbSource, n: i32): boolean => ssxFirstLine(src, n) === ssxLastLine(src, n);

/** Node#multiline? */
export const ssxMultiline = (src: RbSource, n: i32): boolean => ssxFirstLine(src, n) !== ssxLastLine(src, n);

/** ProcessedSource#comment_at_line: the first comment starting on line l, or -1. */
export const ssxCommentAtLine = (src: RbSource, l: i32): i32 => {
  for (let i = 0; i < toI32(src.commS.length); i++) {
    if (src.line(src.commS[i]) === l) {
      return i;
    }
  }
  return -1;
};

/** ProcessedSource#contains_comment? for a range on lines l1..l2: a comment starts on one of them. */
export const ssxCommentsInLines = (src: RbSource, l1: i32, l2: i32): boolean => {
  for (let i = 0; i < toI32(src.commS.length); i++) {
    const l = src.line(src.commS[i]);
    if (l >= l1 && l <= l2) {
      return true;
    }
  }
  return false;
};

/** Ruby's \s. */
export const ssxIsSpace = (c: i32): boolean => c === 32 || c === 9 || c === 10 || c === 11 || c === 12 || c === 13;

/** Ruby's \w: [a-zA-Z0-9_]. */
export const ssxIsWord = (c: i32): boolean =>
  (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;

/** Whether every code point of a string satisfies \w (s is UTF-8 bytes; non-ASCII bytes fail). */
export const ssxAllWord = (s: string, from: i32, to: i32): boolean => {
  for (let i = from; i < to; i++) {
    if (!ssxIsWord(s.charCodeAt(i))) {
      return false;
    }
  }
  return true;
};

/** Node#basic_literal?: str int float sym true false nil complex rational regopt. */
export const ssxBasicLiteral = (src: RbSource, n: i32): boolean => {
  if (!src.a.isNode(n)) {
    return false;
  }
  const t = src.a.type(n);
  return (
    t === NT_STR ||
    t === NT_INT ||
    t === NT_FLOAT ||
    t === NT_SYM ||
    t === NT_TRUE ||
    t === NT_FALSE ||
    t === NT_NIL ||
    t === NT_COMPLEX ||
    t === NT_RATIONAL ||
    t === NT_REGOPT
  );
};

/** range_by_whole_lines: the start of the line holding s. */
export const ssxWholeLinesS = (src: RbSource, s: i32): i32 => src.lineStart(src.line(s));

/** range_by_whole_lines: the end of the line holding e (past its newline when asked), within the buffer. */
export const ssxWholeLinesE = (src: RbSource, e: i32, finalNewline: boolean): i32 => {
  const le = src.lineEnd(src.line(e)) + (finalNewline ? 1 : 0);
  return le > src.n ? src.n : le;
};

/** The length of a UTF-8 string in characters. */
export const ssxCharLen = (s: string): i32 => {
  let k = 0;
  for (let i = 0; i < toI32(s.length); i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80 || c >= 0xc0) {
      k++;
    }
  }
  return k;
};

/** /\A[A-Za-z_]\w*[?!=]?\z/ (suffixes: the allowed final characters, e.g. "?!="). */
export const ssxIdentLike = (s: string, suffixes: string): boolean => {
  const k = toI32(s.length);
  if (k === 0) {
    return false;
  }
  const c0 = s.charCodeAt(0);
  if (!((c0 >= 65 && c0 <= 90) || (c0 >= 97 && c0 <= 122) || c0 === 95)) {
    return false;
  }
  let end = k;
  const last = s.substring(k - 1, k);
  if (k > 1 && suffixes.indexOf(last) >= 0) {
    end = k - 1;
  }
  return ssxAllWord(s, 1, end);
};

/** The sibling index of n in its parent's children (-1 for none). */
export const ssxSiblingIndex = (src: RbSource, n: i32): i32 => {
  const p = src.parent(n);
  if (p === V_NIL) {
    return -1;
  }
  for (let i = 0; i < src.a.nKid(p); i++) {
    if (src.a.kid(p, i) === n) {
      return i;
    }
  }
  return -1;
};

/** The selector range start (MethodDispatchNode#selector: keyword, else selector). */
export const ssxSelS = (src: RbSource, n: i32): i32 =>
  ssxHas(src, n, F_KEYWORD) ? ssxFS(src, n, F_KEYWORD) : ssxFS(src, n, F_SELECTOR);

export const ssxSelE = (src: RbSource, n: i32): i32 =>
  ssxHas(src, n, F_KEYWORD) ? ssxFE(src, n, F_KEYWORD) : ssxFE(src, n, F_SELECTOR);

/** MethodDispatchNode#dot? */
export const ssxDot = (src: RbSource, n: i32): boolean => ssxLocIs(src, n, F_DOT, ".");

/** loc_is?(:begin, text): HashNode#braces?, ArrayNode#square_brackets? and the like. */
export const ssxBeginIs = (src: RbSource, n: i32, text: string): boolean => ssxLocIs(src, n, F_BEGIN, text);

// ---- Shared node helpers ---------------------------------------------------------

/** PatternMatchingHelp#in_pattern? */
export const ssxInPattern = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  let child = n;
  let p = src.parent(n);
  while (p !== V_NIL) {
    const t = a.type(p);
    if (t === NT_IN_PATTERN) {
      return a.kid(p, 0) === child;
    }
    if (t === NT_MATCH_PATTERN || t === NT_MATCH_PATTERN_P) {
      return a.kid(p, 1) === child;
    }
    if (
      t === NT_ARRAY_PATTERN ||
      t === NT_ARRAY_PATTERN_WITH_TAIL ||
      t === NT_BEGIN ||
      t === NT_CONST_PATTERN ||
      t === NT_FIND_PATTERN ||
      t === NT_HASH_PATTERN ||
      t === NT_MATCH_ALT ||
      t === NT_MATCH_AS ||
      t === NT_PAIR
    ) {
      child = p;
      p = src.parent(p);
      continue;
    }
    return false;
  }
  return false;
};

/** RescueNode#rescue_modifier?: a resbody whose keyword is a `rescue` modifier token. */
export const ssxRescueModifier = (src: RbSource, n: i32): boolean => {
  if (!ssxIs(src, n, NT_RESBODY)) {
    return false;
  }
  const s = ssxFS(src, n, F_KEYWORD);
  const e = ssxFE(src, n, F_KEYWORD);
  for (let i = 0; i < toI32(src.tokT.length); i++) {
    if (src.tokT[i] === TK_kRESCUE_MOD && src.tokS[i] === s && src.tokE[i] === e) {
      return true;
    }
  }
  return false;
};

/** All descendants of n (pre-order, n excluded). */
export const ssxDescendants = (src: RbSource, n: i32): i32[] => {
  const out: i32[] = [];
  const stack: i32[] = [];
  for (let i = src.a.nKid(n) - 1; i >= 0; i--) {
    if (src.a.isNode(src.a.kid(n, i))) {
      stack.push(src.a.kid(n, i));
    }
  }
  while (stack.length > 0) {
    const c = stack[stack.length - 1];
    stack.pop();
    out.push(c);
    for (let i = src.a.nKid(c) - 1; i >= 0; i--) {
      if (src.a.isNode(src.a.kid(c, i))) {
        stack.push(src.a.kid(c, i));
      }
    }
  }
  return out;
};

/** An int node's value. */
export const ssxIntValue = (src: RbSource, n: i32): i64 => {
  const s = src.a.text(src.a.kid(n, 0));
  let v: i64 = 0;
  let neg = false;
  for (let i = 0; i < toI32(s.length); i++) {
    const c = s.charCodeAt(i);
    if (c === 45) {
      neg = true;
    } else if (c >= 48 && c <= 57) {
      v = v * 10 + toI64(c - 48);
    }
  }
  return neg ? -v : v;
};

// ---- Macros ----------------------------------------------------------------------------

/** Node#class_constructor?: `Class/Module/Struct.new` or `Data.define`, or a block on one. */
export const ssxClassConstructor = (src: RbSource, n0: i32): boolean => {
  let n = n0;
  if (ssxIsAnyBlock(src, n)) {
    n = src.a.kid(n, 0);
  }
  if (!ssxIs(src, n, NT_SEND)) {
    return false;
  }
  const r = src.a.kid(n, 0);
  const m = ssxMeth(src, n);
  if (m === "new") {
    return ssxGlobalConst(src, r, "Class") || ssxGlobalConst(src, r, "Module") || ssxGlobalConst(src, r, "Struct");
  }
  return m === "define" && ssxGlobalConst(src, r, "Data");
};

/** MethodDispatchNode#in_macro_scope? */
export const ssxInMacroScope = (src: RbSource, n: i32): boolean => {
  const p = src.parent(n);
  if (p === V_NIL) {
    return true;
  }
  const t = src.a.type(p);
  if (t === NT_SCLASS || t === NT_CLASS || t === NT_MODULE || ssxClassConstructor(src, p)) {
    return true;
  }
  const wrapper = t === NT_KWBEGIN || t === NT_BEGIN || ssxIsAnyBlock(src, p) || (t === NT_IF && src.a.kid(p, 0) !== n);
  return wrapper && ssxInMacroScope(src, p);
};

/** MethodDispatchNode#macro?: no receiver, in macro scope (send nodes). */
export const ssxMacro = (src: RbSource, n: i32): boolean =>
  ssxIs(src, n, NT_SEND) && src.a.kid(n, 0) === V_NIL && ssxInMacroScope(src, n);

/** MethodDispatchNode#access_modifier?: a macro `public`, `protected`, `private` or `module_function`. */
export const ssxAccessModifier = (src: RbSource, n: i32): boolean => {
  if (!ssxMacro(src, n)) {
    return false;
  }
  const m = ssxMeth(src, n);
  return m === "public" || m === "protected" || m === "private" || m === "module_function";
};

/** SendNode#attribute_accessor?: `attr_reader`, `attr_writer`, `attr_accessor` or `attr` with no receiver and an argument. */
export const ssxAttributeAccessor = (src: RbSource, n: i32): boolean => {
  if (!ssxIs(src, n, NT_SEND) || src.a.kid(n, 0) !== V_NIL || src.a.nKid(n) < 3) {
    return false;
  }
  const m = ssxMeth(src, n);
  return m === "attr_reader" || m === "attr_writer" || m === "attr_accessor" || m === "attr";
};

/** processed_source[i] (0-based, negative from the end): a source line's text. */
export const ssxLineAt = (src: RbSource, i0: i32): string => {
  const k = src.lineCount();
  const i = i0 < 0 ? i0 + k : i0;
  if (i < 0 || i >= k) {
    return "";
  }
  return src.lineText(i + 1);
};

/** Util#comment_line?: /^\s*#/ on a line without its newline. */
export const ssxCommentLine = (s: string): boolean => {
  let i = 0;
  const k = toI32(s.length);
  while (i < k && ssxIsSpace(s.charCodeAt(i))) {
    i++;
  }
  return i < k && s.charCodeAt(i) === 35;
};

// ---- TrailingComma ----------------------------------------------------------------

/** TrailingComma#heredoc? */
const ssxTcHeredoc = (src: RbSource, n: i32): boolean => {
  if (!src.a.isNode(n)) {
    return false;
  }
  if (ssxHas(src, n, F_HEREDOC_BODY)) {
    return true;
  }
  const t = src.a.type(n);
  if (t === NT_SEND) {
    const k = src.a.nKid(n);
    if (k === 2) {
      return ssxTcHeredoc(src, src.a.kid(n, 0));
    }
    if (k > 2) {
      return ssxTcHeredoc(src, src.a.kid(n, -1));
    }
    return false;
  }
  if (t === NT_PAIR || t === NT_HASH) {
    return ssxTcHeredoc(src, src.a.kid(n, -1));
  }
  return false;
};

/**
 * TrailingComma#check with EnforcedStyleForMultiline: no_comma: an offense on
 * a comma right after the last item (whitespace only between), unless a
 * comment on that line starts before it; the correction removes it.
 */
export const ssxTrailingCommaCheck = (cop: RbCop, src: RbSource, items: i32[], beginPos: i32, endPos: i32): void => {
  let heredoc = false;
  for (const it of items) {
    if (ssxTcHeredoc(src, it)) {
      heredoc = true;
      break;
    }
  }
  let p = beginPos;
  while (p < endPos) {
    const c = src.at(p);
    if (heredoc ? ssxIsSpace(c) && c !== 10 : ssxIsSpace(c)) {
      p++;
      continue;
    }
    break;
  }
  if (p >= endPos || src.at(p) !== 44) {
    return;
  }
  // inside_comment?
  const ci = ssxCommentAtLine(src, src.line(beginPos));
  if (ci >= 0 && src.commS[ci] < p) {
    return;
  }
  const k = cop.offense(p, p + 1);
  if (k !== null) {
    k.remove(p, p + 1);
    cop.commit(k);
  }
};
