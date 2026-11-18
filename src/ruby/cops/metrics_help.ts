// What the Metrics cops share: Metrics::Utils::IteratingBlock,
// RepeatedCsendDiscount, CodeLengthCalculator (under the default
// CountComments: false and CountAsOne: []) with the CodeLength mixin, and
// the MethodComplexity mixin's matchers. RepeatedAttributeDiscount is off
// under the default CountRepeatedAttributes: true (AbcSize).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_HEREDOC_BODY,
  F_HEREDOC_END,
  F_NAME,
  NT_BLOCK,
  NT_BLOCK_PASS,
  NT_CASGN,
  NT_CLASS,
  NT_CSEND,
  NT_DEF,
  NT_DEFS,
  NT_DSTR,
  NT_LVAR,
  NT_MODULE,
  NT_NUMBLOCK,
  NT_SCLASS,
  NT_SEND,
  NT_STR,
  NT_SYM,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { rnHeredoc } from "../node";
import { RbSource } from "../source";
import { RbLayLines, rbLayRxSpace, rbLayStripWs } from "./layout_empty_help";
import { ssxInList } from "./style_syntax_help";

// IteratingBlock::KNOWN_ITERATING_METHODS (enumerable, enumerator, array, hash).
const MTX_ITERATING: string =
  " all? any? chain chunk chunk_while collect collect_concat count cycle detect drop drop_while each each_cons each_entry each_slice each_with_index each_with_object entries filter filter_map find find_all find_index flat_map grep grep_v group_by inject lazy map max max_by min min_by minmax minmax_by none? one? partition reduce reject reverse_each select slice_after slice_before slice_when sort sort_by sum take take_while tally to_h uniq zip" +
  " with_index with_object" +
  " bsearch bsearch_index collect! combination d_permutation delete_if each_index keep_if map! permutation product reject! repeat repeated_combination select! sort! " +
  " each_key each_pair each_value fetch fetch_values has_key? merge merge! transform_keys transform_keys! transform_values transform_values! ";

/** MethodDispatchNode#method_name of a call-like node ("" when it has none in the list's sense). */
const mtxDispatchName = (src: RbSource, n: i32): string => {
  if (!src.a.isNode(n)) {
    return "";
  }
  const t = src.a.type(n);
  if (t === NT_SEND || t === NT_CSEND) {
    return src.a.text(src.a.kid(n, 1));
  }
  // super, zsuper, yield, lambda, defined?: never an iterating name.
  return "";
};

/**
 * IteratingBlock#iterating_block?: -1 (nil) when n is neither a block nor a
 * block-pass node, else 1 when its method is a known iterating method, 0 when not.
 * (A numblock is not a `:block`: nil.)
 */
export const mtxIterating = (src: RbSource, n: i32): i32 => {
  const t = src.a.type(n);
  let name = "";
  if (t === NT_BLOCK) {
    name = mtxDispatchName(src, src.a.kid(n, 0));
  } else if (t === NT_BLOCK_PASS) {
    name = mtxDispatchName(src, src.parent(n));
  } else {
    return -1;
  }
  return ssxInList(MTX_ITERATING, name) ? 1 : 0;
};

/** Utils::RepeatedCsendDiscount: `&.` on a local variable already seen counts once. */
export class MtxCsend {
  seen: Map<string, i32>;

  constructor() {
    this.seen = new Map<string, i32>();
  }

  /** reset_repeated_csend. */
  reset(): void {
    this.seen = new Map<string, i32>();
  }

  /** discount_for_repeated_csend? */
  discount(src: RbSource, csend: i32): boolean {
    const r = src.a.kid(csend, 0);
    if (!src.a.isNode(r) || src.a.type(r) !== NT_LVAR) {
      return false;
    }
    const name = src.a.text(src.a.kid(r, 0));
    const v = this.seen.get(name);
    if (v === undefined) {
      this.seen.set(name, csend);
      return false;
    }
    return v !== csend;
  }

  /** reset_on_lvasgn. */
  resetOn(src: RbSource, lvasgn: i32): void {
    const name = src.a.text(src.a.kid(lvasgn, 0));
    this.seen.delete(name);
  }
}

/**
 * MethodComplexity#define_method?: `(any_block (send nil? :define_method
 * ({sym str} $_)) _ _)`; the method name, or null.
 */
export const mtxDefineMethodName = (src: RbSource, n: i32): string | null => {
  const a = src.a;
  const t = a.type(n);
  if (t !== NT_BLOCK && t !== NT_NUMBLOCK) {
    return null;
  }
  const s = a.kid(n, 0);
  if (
    !a.isNode(s) ||
    a.type(s) !== NT_SEND ||
    a.kid(s, 0) !== V_NIL ||
    a.text(a.kid(s, 1)) !== "define_method" ||
    a.nKid(s) !== 3
  ) {
    return null;
  }
  const arg = a.kid(s, 2);
  if (!a.isNode(arg) || (a.type(arg) !== NT_SYM && a.type(arg) !== NT_STR)) {
    return null;
  }
  return a.text(a.kid(arg, 0));
};

/** The body of a def, defs, block or numblock (V_NIL when empty). */
export const mtxBody = (src: RbSource, n: i32): i32 => {
  const t = src.a.type(n);
  if (t === NT_DEF) {
    return src.a.kid(n, 2);
  }
  if (t === NT_DEFS) {
    return src.a.kid(n, 3);
  }
  return src.a.kid(n, 2);
};

/** Node#line_count. */
export const mtxLineCount = (src: RbSource, n: i32): i32 => {
  if (src.a.exS(n) < 0) {
    return 0;
  }
  return src.line(src.a.exE(n)) - src.line(src.a.exS(n)) + 1;
};

// ---- CodeLengthCalculator ---------------------------------------------------------

/**
 * `source.lines.count { |line| !irrelevant_line?(line) }` over the text
 * [s, e): a line counts unless it is blank or a comment line (/^\s*#/).
 */
const mtxCountRange = (src: RbSource, s: i32, e: i32): i32 => {
  let cnt = 0;
  let p = s;
  while (p < e) {
    let blank = true;
    let lead = true;
    let comment = false;
    let i = p;
    while (i < e && src.pts[i] !== 10) {
      const c = src.pts[i];
      if (lead && !rbLayRxSpace(c)) {
        lead = false;
        comment = c === 35;
      }
      if (!rbLayStripWs(c)) {
        blank = false;
      }
      i++;
    }
    if (!blank && !comment) {
      cnt++;
    }
    p = i + 1;
  }
  return cnt;
};

/** irrelevant_line? of processed_source[i] (a 0-based index). */
const mtxIrrelevantLine = (L: RbLayLines, i: i32): boolean => L.blank(i) || L.commentLine(i);

/** CodeLengthCalculator#heredoc_node?: a str/dstr/xstr heredoc. */
const mtxHeredocNode = (src: RbSource, n: i32): boolean => rnHeredoc(src, n);

/** Node#each_descendant into out (pre-order). */
const mtxDescend = (src: RbSource, n: i32, out: i32[]): void => {
  for (let i = 0; i < src.a.nKid(n); i++) {
    const k = src.a.kid(n, i);
    if (src.a.isNode(k)) {
      out.push(k);
      mtxDescend(src, k, out);
    }
  }
};

/** node_with_heredoc?: a str or dstr heredoc among the descendants. */
const mtxNodeWithHeredoc = (src: RbSource, ds: i32[]): boolean => {
  for (const d of ds) {
    const t = src.a.type(d);
    if ((t === NT_STR || t === NT_DSTR) && mtxHeredocNode(src, d)) {
      return true;
    }
  }
  return false;
};

/** Whether n is a class or module (CLASSLIKE_TYPES). */
const mtxClasslike = (src: RbSource, n: i32): boolean =>
  src.a.isNode(n) && (src.a.type(n) === NT_CLASS || src.a.type(n) === NT_MODULE);

/** extract_body. */
const mtxExtractBody = (src: RbSource, n: i32): i32 => {
  const t = src.a.type(n);
  if (t === NT_CLASS) {
    return src.a.kid(n, 2);
  }
  if (t === NT_MODULE || t === NT_SCLASS) {
    return src.a.kid(n, 1);
  }
  if (t === NT_BLOCK || t === NT_NUMBLOCK || t === NT_DEF || t === NT_DEFS) {
    return mtxBody(src, n);
  }
  if (t === NT_CASGN) {
    const x = src.a.kid(n, 2);
    return src.a.isNode(x) ? mtxExtractBody(src, x) : V_NIL;
  }
  return n;
};

/** classlike_code_length (processed_source[line_number] reads the line after, as RuboCop does). */
const mtxClasslikeLength = (src: RbSource, L: RbLayLines, n: i32): i32 => {
  // namespace_module?
  if (mtxClasslike(src, mtxExtractBody(src, n))) {
    return 0;
  }
  const first = src.line(src.a.exS(n));
  const last = src.line(src.a.exE(n));
  const inner = new Set<i32>();
  const ds: i32[] = [];
  mtxDescend(src, n, ds);
  for (const d of ds) {
    if (mtxClasslike(src, d)) {
      const l2 = src.line(src.a.exE(d));
      for (let l = src.line(src.a.exS(d)); l <= l2; l++) {
        inner.add(l);
      }
    }
  }
  let len = 0;
  for (let l = first + 1; l < last; l++) {
    if (inner.has(l) || mtxIrrelevantLine(L, l)) {
      continue;
    }
    len++;
  }
  return len;
};

/** CodeLengthCalculator#calculate (no foldable types): the node's code length. */
export const mtxCodeLength = (src: RbSource, L: RbLayLines, n: i32): i32 => {
  if (mtxClasslike(src, n)) {
    return mtxClasslikeLength(src, L, n);
  }
  if (mtxHeredocNode(src, n)) {
    return mtxCountRange(src, src.a.fS(src.a.map(n), F_HEREDOC_BODY), src.a.fE(src.a.map(n), F_HEREDOC_BODY)) + 2;
  }
  const body = mtxExtractBody(src, n);
  if (body === V_NIL || !src.a.isNode(body)) {
    return 0;
  }
  const ds: i32[] = [];
  mtxDescend(src, body, ds);
  if (!mtxNodeWithHeredoc(src, ds)) {
    return mtxCountRange(src, src.a.exS(body), src.a.exE(body));
  }
  // source_from_node_with_heredoc: whole lines from the body's first line to
  // the last line any descendant (or heredoc end) reaches.
  let lastLine = -1;
  for (const d of ds) {
    if (src.a.exS(d) < 0) {
      continue;
    }
    const dl = mtxHeredocNode(src, d) ? src.line(src.a.fS(src.a.map(d), F_HEREDOC_END)) : src.line(src.a.exE(d));
    if (dl > lastLine) {
      lastLine = dl;
    }
  }
  let len = 0;
  const from = src.line(src.a.exS(body)) - 1;
  for (let i = from; i <= lastLine - 1 && i < L.n; i++) {
    if (!mtxIrrelevantLine(L, i)) {
      len++;
    }
  }
  return len;
};

/**
 * CodeLength#check_code_length: an offense at the node (a casgn's name) when
 * its code length exceeds max.
 */
export const mtxCheckCodeLength = (c: RbCop, src: RbSource, L: RbLayLines, n: i32, max: i32): void => {
  if (mtxLineCount(src, n) <= max) {
    return;
  }
  if (mtxCodeLength(src, L, n) <= max) {
    return;
  }
  if (src.a.type(n) === NT_CASGN) {
    c.offense(src.a.fS(src.a.map(n), F_NAME), src.a.fE(src.a.map(n), F_NAME));
    return;
  }
  c.offense(src.a.exS(n), src.a.exE(n));
};
