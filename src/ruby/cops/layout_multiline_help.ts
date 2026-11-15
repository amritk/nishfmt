// What the keyword/end alignment and multiline layout cops share: the
// rubocop-ast node predicates they ask (assignment?, conditional?, chained?,
// macro?, ...), Util#begins_its_line?, RangeHelp#column_offset_between,
// EndKeywordAlignment#start_line_range and the AlignmentCorrector (correct
// and align_end).
//
// Ported from RuboCop 1.92.2 and rubocop-ast 1.51.0 (MIT License, Copyright
// (c) 2012-24 Bozhidar Batsov).

import {
  F_BEGIN,
  F_END,
  F_HEREDOC_BODY,
  F_HEREDOC_END,
  F_OPERATOR,
  F_QUESTION,
  NT_AND_ASGN,
  NT_BEGIN,
  NT_BLOCK,
  NT_CASE,
  NT_CASE_MATCH,
  NT_CASGN,
  NT_CBASE,
  NT_CLASS,
  NT_CONST,
  NT_CSEND,
  NT_CVASGN,
  NT_DEF,
  NT_DEFS,
  NT_DSTR,
  NT_GVASGN,
  NT_IF,
  NT_IVASGN,
  NT_KWBEGIN,
  NT_LVASGN,
  NT_MASGN,
  NT_MODULE,
  NT_NUMBLOCK,
  NT_OP_ASGN,
  NT_OR_ASGN,
  NT_SCLASS,
  NT_SEND,
  NT_STR,
  NT_UNTIL,
  NT_WHILE,
  NT_XSTR,
  V_NIL,
} from "../ast";
import { rnHas, rnHeredoc, rnS, rnE, rnMethod } from "../node";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";
import { lspIsWs } from "./layout_space_help";

// ---- Node predicates ---------------------------------------------------------------

/** call_type?: send or csend. */
export const rmlIsCall = (src: RbSource, n: i32): boolean => {
  if (!src.a.isNode(n)) {
    return false;
  }
  const t = src.a.type(n);
  return t === NT_SEND || t === NT_CSEND;
};

/** any_block_type? */
export const rmlIsBlock = (src: RbSource, n: i32): boolean => {
  if (!src.a.isNode(n)) {
    return false;
  }
  const t = src.a.type(n);
  return t === NT_BLOCK || t === NT_NUMBLOCK;
};

/** any_def_type? */
export const rmlIsDef = (src: RbSource, n: i32): boolean => {
  if (!src.a.isNode(n)) {
    return false;
  }
  const t = src.a.type(n);
  return t === NT_DEF || t === NT_DEFS;
};

/** any_str_type? */
export const rmlIsStr = (src: RbSource, n: i32): boolean => {
  if (!src.a.isNode(n)) {
    return false;
  }
  const t = src.a.type(n);
  return t === NT_STR || t === NT_DSTR || t === NT_XSTR;
};

/** Whether `t` is one of Node::ASSIGNMENTS. */
export const rmlAsgnType = (t: i32): boolean =>
  t === NT_LVASGN ||
  t === NT_IVASGN ||
  t === NT_CVASGN ||
  t === NT_GVASGN ||
  t === NT_CASGN ||
  t === NT_MASGN ||
  t === NT_OP_ASGN ||
  t === NT_OR_ASGN ||
  t === NT_AND_ASGN;

/** Node#assignment? (a send's is setter_method?: it has an operator). */
export const rmlIsAssignment = (src: RbSource, n: i32): boolean => {
  if (!src.a.isNode(n)) {
    return false;
  }
  if (rmlIsCall(src, n)) {
    return rnHas(src, n, F_OPERATOR);
  }
  return rmlAsgnType(src.a.type(n));
};

/** Node#conditional? */
export const rmlIsConditional = (src: RbSource, n: i32): boolean => {
  if (!src.a.isNode(n)) {
    return false;
  }
  const t = src.a.type(n);
  return t === NT_IF || t === NT_WHILE || t === NT_UNTIL || t === NT_CASE || t === NT_CASE_MATCH;
};

/** IfNode#ternary? */
export const rmlTernary = (src: RbSource, n: i32): boolean => src.a.type(n) === NT_IF && rnHas(src, n, F_QUESTION);

/** The `expression` (right-hand side) of an assignment node (V_NIL for none). */
export const rmlAsgnExpr = (src: RbSource, n: i32): i32 => {
  const t = src.a.type(n);
  if (t === NT_CASGN) {
    return src.a.kid(n, 2);
  }
  if (t === NT_OP_ASGN) {
    return src.a.kid(n, 2);
  }
  return src.a.kid(n, 1);
};

/** A node's children. */
export const rmlKids = (src: RbSource, n: i32): i32[] => {
  const out: i32[] = [];
  for (let i = 0; i < src.a.nKid(n); i++) {
    out.push(src.a.kid(n, i));
  }
  return out;
};

/** The arguments of a send/csend. */
export const rmlArgs = (src: RbSource, n: i32): i32[] => {
  const out: i32[] = [];
  for (let i = 2; i < src.a.nKid(n); i++) {
    out.push(src.a.kid(n, i));
  }
  return out;
};

/** The last argument of a send/csend (V_NIL for none). */
export const rmlLastArg = (src: RbSource, n: i32): i32 => (src.a.nKid(n) > 2 ? src.a.kid(n, -1) : V_NIL);

/** The first argument of a send/csend (V_NIL for none). */
export const rmlFirstArg = (src: RbSource, n: i32): i32 => (src.a.nKid(n) > 2 ? src.a.kid(n, 2) : V_NIL);

/** CheckAssignment.extract_rhs. */
export const rmlExtractRhs = (src: RbSource, n: i32): i32 => {
  if (rmlIsCall(src, n)) {
    return rmlLastArg(src, n);
  }
  if (rmlIsAssignment(src, n)) {
    return rmlAsgnExpr(src, n);
  }
  return V_NIL;
};

/** Node#receiver: a call's, or a block's call's (V_NIL for anything else). */
export const rmlReceiver = (src: RbSource, n: i32): i32 => {
  if (rmlIsCall(src, n)) {
    return src.a.kid(n, 0);
  }
  if (rmlIsBlock(src, n)) {
    const sn = src.a.kid(n, 0);
    return rmlIsCall(src, sn) ? src.a.kid(sn, 0) : V_NIL;
  }
  return V_NIL;
};

/** Util#first_part_of_call_chain. */
export const rmlFirstPartOfCallChain = (src: RbSource, n0: i32): i32 => {
  let n = n0;
  while (n !== V_NIL && src.a.isNode(n)) {
    if (rmlIsCall(src, n)) {
      n = src.a.kid(n, 0);
    } else if (rmlIsBlock(src, n)) {
      n = src.a.kid(n, 0);
    } else {
      break;
    }
  }
  return n;
};

/** child_nodes.first (V_NIL for none). */
export const rmlFirstChildNode = (src: RbSource, n: i32): i32 => {
  for (let i = 0; i < src.a.nKid(n); i++) {
    const c = src.a.kid(n, i);
    if (src.a.isNode(c)) {
      return c;
    }
  }
  return V_NIL;
};

/** The last child that is not nil (children.compact.last; V_NIL for none). */
export const rmlLastNonNilChild = (src: RbSource, n: i32): i32 => {
  for (let i = src.a.nKid(n) - 1; i >= 0; i--) {
    const c = src.a.kid(n, i);
    if (c !== V_NIL) {
      return c;
    }
  }
  return V_NIL;
};

/** Node#argument?: one of a send parent's arguments. */
export const rmlIsArgument = (src: RbSource, n: i32): boolean => {
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

/** Node#chained?: the receiver of a call parent. */
export const rmlIsChained = (src: RbSource, n: i32): boolean => {
  const p = src.parent(n);
  return p !== V_NIL && rmlIsCall(src, p) && src.a.kid(p, 0) === n;
};

/** Node#heredoc? for a string node. */
export const rmlIsHeredoc = (src: RbSource, n: i32): boolean => rmlIsStr(src, n) && rnHeredoc(src, n);

/** (const {nil? cbase} name) for one of `names` (comma separated, with commas around). */
const rmlGlobalConst = (src: RbSource, n: i32, names: string): boolean => {
  if (!src.a.isNode(n) || src.a.type(n) !== NT_CONST) {
    return false;
  }
  const scope = src.a.kid(n, 0);
  if (scope !== V_NIL && !(src.a.isNode(scope) && src.a.type(scope) === NT_CBASE)) {
    return false;
  }
  return names.indexOf(`,${src.a.text(src.a.kid(n, 1))},`) >= 0;
};

/** The send half of class_constructor?. */
const rmlClassConstructorSend = (src: RbSource, n: i32): boolean => {
  if (!src.a.isNode(n) || src.a.type(n) !== NT_SEND) {
    return false;
  }
  const m = rnMethod(src, n);
  const r = src.a.kid(n, 0);
  return (m === "new" && rmlGlobalConst(src, r, ",Class,Module,Struct,")) || (m === "define" && rmlGlobalConst(src, r, ",Data,"));
};

/** Node#class_constructor? */
export const rmlClassConstructor = (src: RbSource, n: i32): boolean => {
  if (rmlClassConstructorSend(src, n)) {
    return true;
  }
  return rmlIsBlock(src, n) && rmlClassConstructorSend(src, src.a.kid(n, 0));
};

/** MethodDispatchNode#in_macro_scope? */
export const rmlInMacroScope = (src: RbSource, n: i32): boolean => {
  const p = src.parent(n);
  if (p === V_NIL) {
    return true;
  }
  const t = src.a.type(p);
  if (t === NT_SCLASS || t === NT_CLASS || t === NT_MODULE || rmlClassConstructor(src, p)) {
    return true;
  }
  let wrapper = t === NT_KWBEGIN || t === NT_BEGIN || t === NT_BLOCK || t === NT_NUMBLOCK;
  if (t === NT_IF && src.a.kid(p, 0) !== n) {
    wrapper = true;
  }
  return wrapper && rmlInMacroScope(src, p);
};

/** SendNode#macro? */
export const rmlMacro = (src: RbSource, n: i32): boolean => src.a.kid(n, 0) === V_NIL && rmlInMacroScope(src, n);

/** SendNode#access_modifier? */
export const rmlAccessModifier = (src: RbSource, n: i32): boolean => {
  if (!src.a.isNode(n) || src.a.type(n) !== NT_SEND || src.a.kid(n, 0) !== V_NIL) {
    return false;
  }
  const m = rnMethod(src, n);
  if (m !== "public" && m !== "protected" && m !== "private" && m !== "module_function") {
    return false;
  }
  return rmlMacro(src, n);
};

/** MethodDispatchNode#def_modifier: the def a receiverless send wraps (V_NIL for none). */
export const rmlDefModifier = (src: RbSource, n: i32): i32 => {
  if (!src.a.isNode(n) || src.a.type(n) !== NT_SEND || src.a.kid(n, 0) !== V_NIL) {
    return V_NIL;
  }
  const arg = src.a.kid(n, 2);
  if (!src.a.isNode(arg)) {
    return V_NIL;
  }
  if (rmlIsDef(src, arg)) {
    return arg;
  }
  return rmlDefModifier(src, arg);
};

/** Node#each_descendant (pre-order, without the node itself). */
export const rmlDescendants = (src: RbSource, n: i32, out: i32[]): void => {
  for (let i = 0; i < src.a.nKid(n); i++) {
    const c = src.a.kid(n, i);
    if (src.a.isNode(c)) {
      out.push(c);
      rmlDescendants(src, c, out);
    }
  }
};

/** Node#first_line. */
export const rmlFirstLine = (src: RbSource, n: i32): i32 => src.line(src.a.exS(n));

/** Node#last_line. */
export const rmlLastLine = (src: RbSource, n: i32): i32 => src.line(src.a.exE(n));

/** Node#single_line? (BlockNode#single_line?: its braces or do/end on one line). */
export const rmlSingleLine = (src: RbSource, n: i32): boolean => {
  if (rmlIsBlock(src, n)) {
    return src.line(rnS(src, n, F_BEGIN)) === src.line(rnS(src, n, F_END));
  }
  return rmlFirstLine(src, n) === rmlLastLine(src, n);
};

// ---- Lines and columns ---------------------------------------------------------------

/** Util#begins_its_line? for a range starting at `pos`. */
export const rmlBeginsItsLine = (src: RbSource, pos: i32): boolean => {
  const l = src.line(pos);
  let i = src.lineStart(l);
  const e = src.lineEnd(l);
  while (i < e && lspIsWs(src.at(i))) {
    i++;
  }
  return i < e && i === pos;
};

/** The position of the first non-whitespace character of 1-based line `l` (-1 for none). */
export const rmlFirstNonWs = (src: RbSource, l: i32): i32 => {
  const e = src.lineEnd(l);
  for (let i = src.lineStart(l); i < e; i++) {
    if (!lspIsWs(src.at(i))) {
      return i;
    }
  }
  return -1;
};

/** ProcessedSource#line_indentation: the leading whitespace of 1-based line `l`. */
export const rmlLineIndentation = (src: RbSource, l: i32): i32 => {
  const s = src.lineStart(l);
  const e = src.lineEnd(l);
  let i = s;
  while (i < e && lspIsWs(src.at(i))) {
    i++;
  }
  return i - s;
};

/** RangeHelp#effective_column: a column, one less after a byte order mark on line 1. */
export const rmlEffCol = (src: RbSource, pos: i32): i32 => {
  const c = src.column(pos);
  if (src.line(pos) === 1 && src.at(0) === 0xfeff) {
    return c - 1;
  }
  return c;
};

/** RangeHelp#column_offset_between(base, range). */
export const rmlColumnOffset = (src: RbSource, base: i32, pos: i32): i32 => rmlEffCol(src, base) - rmlEffCol(src, pos);

/** A source range [s, e). */
export class RmlRange {
  s: i32;
  e: i32;

  constructor(s: i32, e: i32) {
    this.s = s;
    this.e = e;
  }
}

/** EndKeywordAlignment#start_line_range of a node: its first line without the surrounding whitespace. */
export const rmlStartLineRange = (src: RbSource, n: i32): RmlRange => {
  const l = src.line(src.a.exS(n));
  const ls = src.lineStart(l);
  const le = src.lineEnd(l);
  let s = ls;
  while (s < le && lspIsWs(src.at(s))) {
    s++;
  }
  let e = le;
  while (e > ls && lspIsWs(src.at(e - 1))) {
    e--;
  }
  return new RmlRange(s, e);
};

/** String#strip.empty? of [s, e). */
export const rmlBlankRange = (src: RbSource, s: i32, e: i32): boolean => {
  for (let i = s; i < e; i++) {
    const c = src.at(i);
    if (!lspIsWs(c) && c !== 0) {
      return false;
    }
  }
  return true;
};

/** `n` spaces. */
export const rmlSpaces = (n: i32): string => {
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    parts.push(" ");
  }
  return parts.join("");
};

// ---- AlignmentCorrector -----------------------------------------------------------

/** AlignmentCorrector.align_end: the `end` at [endS, ...) moved to `column`. */
export const rmlAlignEnd = (src: RbSource, k: RbRewriter, endS: i32, column: i32): void => {
  const ws = endS - src.column(endS);
  const ind = rmlSpaces(column);
  if (rmlBlankRange(src, ws, endS)) {
    k.replace(ws, endS, ind);
  } else {
    k.insertAfter(ws, endS, `\n${ind}`);
  }
};

/** AlignmentCorrector.correct for a range (taboo: every string of the source). */
export class RmlAlignCorr {
  src: RbSource;
  have: boolean = false;
  tabS: i32[];
  tabE: i32[];
  docS: i32[];
  docE: i32[];

  constructor(src: RbSource) {
    this.src = src;
    this.tabS = [];
    this.tabE = [];
    this.docS = [];
    this.docE = [];
  }

  /** source_string_ranges and the document (=begin) comments. */
  private prepare(): void {
    if (this.have) {
      return;
    }
    this.have = true;
    const src = this.src;
    for (const n of src.pre) {
      if (!rmlIsStr(src, n)) {
        continue;
      }
      if (rnHeredoc(src, n)) {
        this.tabS.push(rnS(src, n, F_HEREDOC_BODY));
        this.tabE.push(rnE(src, n, F_HEREDOC_END));
      } else if (rnHas(src, n, F_BEGIN) && rnHas(src, n, F_END)) {
        this.tabS.push(rnE(src, n, F_BEGIN));
        this.tabE.push(rnS(src, n, F_END));
      }
    }
    for (let i = 0; i < toI32(src.commS.length); i++) {
      const s = src.commS[i];
      if (src.at(s) === 61) {
        this.docS.push(s);
        this.docE.push(src.commE[i]);
      }
    }
  }

  /** Whether [s, e) lies within a string's contents. */
  private taboo(s: i32, e: i32): boolean {
    for (let i = 0; i < toI32(this.tabS.length); i++) {
      if (s >= this.tabS[i] && e <= this.tabE[i]) {
        return true;
      }
    }
    return false;
  }

  /** AlignmentCorrector.correct(corrector, processed_source, range, column_delta). */
  correct(k: RbRewriter, s: i32, e: i32, delta: i32): void {
    this.prepare();
    const src = this.src;
    if (s >= e) {
      return;
    }
    for (let i = 0; i < toI32(this.docS.length); i++) {
      if (this.docS[i] >= s && this.docE[i] <= e) {
        return;
      }
    }
    // each_line(expr)
    let pos = s;
    while (true) {
      this.line(k, pos, delta);
      let j = pos;
      while (j < e && src.at(j) !== 10) {
        j++;
      }
      if (j >= e - 1) {
        break;
      }
      pos = j + 1;
    }
  }

  /** autocorrect_line at `lb`. */
  private line(k: RbRewriter, lb: i32, delta: i32): void {
    const src = this.src;
    let rs = lb;
    let re = lb;
    if (delta <= 0) {
      const ad = -delta;
      if (src.at(lb) === 32) {
        re = lb + ad;
      } else {
        rs = lb - ad;
      }
    }
    if (this.taboo(rs, re)) {
      return;
    }
    if (delta > 0) {
      if (src.at(rs) !== 10) {
        k.insertBefore(rs, re, rmlSpaces(delta));
      }
      return;
    }
    if (re <= rs) {
      return;
    }
    for (let i = rs; i < re; i++) {
      const c = src.at(i);
      if (c !== 32 && c !== 9) {
        return;
      }
    }
    k.remove(rs, re);
  }
}
