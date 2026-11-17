// What the Style cops about blocks, bodies and statements share: rubocop-ast
// predicates on blocks, rescues and method dispatch nodes, the directive
// comment regexp, TrailingBody with its LineBreakCorrector, and
// ReparsedEquivalence over arbitrary corrections.
//
// Ported from RuboCop 1.92.2 and rubocop-ast 1.51.0 (MIT License, Copyright
// (c) 2012-24 Bozhidar Batsov).

import {
  F_END,
  NT_AND,
  NT_ARRAY,
  NT_BEGIN,
  NT_BLOCK,
  NT_CLASS,
  NT_CSEND,
  NT_DEF,
  NT_DEFS,
  NT_KWBEGIN,
  NT_LAMBDA,
  NT_MODULE,
  NT_NUMBLOCK,
  NT_OR,
  NT_RESBODY,
  NT_SCLASS,
  NT_SEND,
  NT_SUPER,
  NT_YIELD,
  NT_ZSUPER,
  RbAst,
  V_NIL,
  vTag,
} from "../ast";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";
import { TK_tSEMI } from "../tables";
import { rmlSpaces } from "./layout_multiline_help";
import { ssxIsAnyBlock, ssxIsCall, ssxIsSpace, ssxIsWord, ssxLocIs, ssxOperatorName } from "./style_syntax_help";

// ---- Method dispatch nodes -------------------------------------------------------

/** MethodDispatchNode#method_name for send, csend, super, zsuper, yield and lambda nodes ("" otherwise). */
export const sbhMethodName = (src: RbSource, n: i32): string => {
  if (!src.a.isNode(n)) {
    return "";
  }
  const t = src.a.type(n);
  if (t === NT_SEND || t === NT_CSEND) {
    return src.a.text(src.a.kid(n, 1));
  }
  if (t === NT_SUPER || t === NT_ZSUPER) {
    return "super";
  }
  if (t === NT_YIELD) {
    return "yield";
  }
  if (t === NT_LAMBDA) {
    return "lambda";
  }
  return "";
};

/** The arguments of a send, csend, super or yield (none for zsuper, lambda and anything else). */
export const sbhCallArgs = (src: RbSource, n: i32): i32[] => {
  const out: i32[] = [];
  if (!src.a.isNode(n)) {
    return out;
  }
  const t = src.a.type(n);
  let from = 0;
  if (t === NT_SEND || t === NT_CSEND) {
    from = 2;
  } else if (t !== NT_SUPER && t !== NT_YIELD) {
    return out;
  }
  for (let i = from; i < src.a.nKid(n); i++) {
    out.push(src.a.kid(n, i));
  }
  return out;
};

/** MethodIdentifierPredicates#comparison_method? */
export const sbhComparisonName = (m: string): boolean =>
  m === "==" || m === "===" || m === "!=" || m === "<=" || m === ">=" || m === "<" || m === ">";

/** MethodIdentifierPredicates#assignment_method?: ends with `=` and is no comparison. */
export const sbhAssignmentMethod = (m: string): boolean => !sbhComparisonName(m) && m.endsWith("=");

/** MethodIdentifierPredicates#operator_method? of a dispatch node. */
export const sbhOperatorMethod = (src: RbSource, n: i32): boolean =>
  ssxIsCall(src, n) && ssxOperatorName(src.a.text(src.a.kid(n, 1)));

/** MethodDispatchNode#block_node: the block (or numblock) whose send this is (V_NIL for none). */
export const sbhBlockNode = (src: RbSource, n: i32): i32 => {
  const p = src.parent(n);
  if (p !== V_NIL && ssxIsAnyBlock(src, p) && src.a.kid(p, 0) === n) {
    return p;
  }
  return V_NIL;
};

/**
 * MethodDispatchNode#lambda_literal?: a `->` (RuboCop's builder makes it
 * `(send nil :lambda)`) that is the send of a block.
 */
export const sbhLambdaLiteral = (src: RbSource, n: i32): boolean => {
  if (!src.a.isNode(n)) {
    return false;
  }
  if (src.a.type(n) === NT_LAMBDA) {
    return true;
  }
  if (!ssxIsCall(src, n) || sbhBlockNode(src, n) === V_NIL) {
    return false;
  }
  const s = src.a.exS(n);
  return src.a.exE(n) - s === 2 && src.at(s) === 45 && src.at(s + 1) === 62;
};

/** Node#chained?: the receiver of a call parent. */
export const sbhChained = (src: RbSource, n: i32): boolean => {
  const p = src.parent(n);
  return p !== V_NIL && ssxIsCall(src, p) && src.a.kid(p, 0) === n;
};

// ---- Blocks -------------------------------------------------------------------------

/** BlockNode#braces?: its end is `}`. */
export const sbhBraces = (src: RbSource, n: i32): boolean => ssxLocIs(src, n, F_END, "}");

/** BlockNode#method_name: its send node's. */
export const sbhBlockMethod = (src: RbSource, n: i32): string => sbhMethodName(src, src.a.kid(n, 0));

/** block_type? (not numblock). */
export const sbhIsBlock = (src: RbSource, n: i32): boolean => src.a.isNode(n) && src.a.type(n) === NT_BLOCK;

/** numblock_type? */
export const sbhIsNumblock = (src: RbSource, n: i32): boolean => src.a.isNode(n) && src.a.type(n) === NT_NUMBLOCK;

// ---- Rescue -------------------------------------------------------------------------

/** RescueNode#resbody_branches. */
export const sbhResbodies = (src: RbSource, n: i32): i32[] => {
  const out: i32[] = [];
  for (let i = 1; i < src.a.nKid(n) - 1; i++) {
    const c = src.a.kid(n, i);
    if (src.a.isNode(c) && src.a.type(c) === NT_RESBODY) {
      out.push(c);
    }
  }
  return out;
};

/** ResbodyNode#exceptions: the exception nodes of a resbody. */
export const sbhResbodyExceptions = (src: RbSource, n: i32): i32[] => {
  const out: i32[] = [];
  const ex = src.a.kid(n, 0);
  if (ex === V_NIL) {
    return out;
  }
  if (src.a.isNode(ex) && src.a.type(ex) === NT_ARRAY) {
    for (let i = 0; i < src.a.nKid(ex); i++) {
      out.push(src.a.kid(ex, i));
    }
    return out;
  }
  out.push(ex);
  return out;
};

// ---- Comments ---------------------------------------------------------------------

/** Whether `text` holds `sub` at byte `at`. */
const sbhHasAt = (text: string, at: i32, sub: string): boolean => {
  const m = toI32(sub.length);
  if (at < 0 || at + m > toI32(text.length)) {
    return false;
  }
  return text.substring(at, at + m) === sub;
};

/** comment.text.match?(DirectiveComment::DIRECTIVE_COMMENT_REGEXP): `# rubocop : <mode>\b` anywhere. */
export const sbhDirectiveComment = (text: string): boolean => {
  const k = toI32(text.length);
  const modes = ["disable-next", "enable-next", "todo-next", "disable", "enable", "push", "pop", "todo", "next"];
  for (let p = 0; p < k; p++) {
    if (text.charCodeAt(p) !== 35) {
      continue;
    }
    let q = p + 1;
    while (q < k && ssxIsSpace(text.charCodeAt(q))) {
      q++;
    }
    if (!sbhHasAt(text, q, "rubocop")) {
      continue;
    }
    q += 7;
    while (q < k && ssxIsSpace(text.charCodeAt(q))) {
      q++;
    }
    if (q >= k || text.charCodeAt(q) !== 58) {
      continue;
    }
    q++;
    while (q < k && ssxIsSpace(text.charCodeAt(q))) {
      q++;
    }
    for (const m of modes) {
      const ml = toI32(m.length);
      if (sbhHasAt(text, q, m) && (q + ml >= k || !ssxIsWord(text.charCodeAt(q + ml)))) {
        return true;
      }
    }
  }
  return false;
};

// ---- TrailingBody and LineBreakCorrector ----------------------------------------

/** TrailingBody#trailing_body? for a class, sclass, module, def or defs (body = its last child). */
export const sbhTrailingBody = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  const body = a.kid(n, -1);
  if (body === V_NIL || !a.isNode(body)) {
    return false;
  }
  return src.line(a.exS(n)) !== src.line(a.exE(n)) && src.line(a.exS(n)) === src.line(a.exS(body));
};

/** TrailingBody#first_part_of: [start, end) of a body (its first child for a begin). */
export const sbhFirstPartS = (src: RbSource, body: i32): i32 => {
  const a = src.a;
  if (a.type(body) === NT_BEGIN) {
    return a.exS(a.kid(body, 0));
  }
  return a.exS(body);
};

export const sbhFirstPartE = (src: RbSource, body: i32): i32 => {
  const a = src.a;
  if (a.type(body) === NT_BEGIN) {
    return a.exE(a.kid(body, 0));
  }
  return a.exE(body);
};

/** LineBreakCorrector.correct_trailing_body (IndentationWidth 2) for a node whose `keyword` starts at kwS. */
export const sbhCorrectTrailingBody = (src: RbSource, k: RbRewriter, n: i32, kwS: i32): void => {
  const a = src.a;
  const body = a.kid(n, -1);
  const col = src.column(kwS);
  // eol_comment: processed_source.comment_at_line(node.source_range.line), the last one there.
  const line = src.line(a.exS(n));
  let ci = -1;
  for (let i = 0; i < toI32(src.commS.length); i++) {
    if (src.line(src.commS[i]) === line) {
      ci = i;
    }
  }
  k.insertBefore(sbhFirstPartS(src, body), sbhFirstPartE(src, body), `\n${rmlSpaces(col + 2)}`);
  if (ci >= 0) {
    const cs = src.commS[ci];
    const ce = src.commE[ci];
    k.insertBefore(a.exS(n), a.exE(n), `${src.src(cs, ce)}\n${rmlSpaces(col)}`);
    k.remove(cs, ce);
  }
  // remove_semicolon: the first `;` (in position order) after the node's start, on the body's
  // first line and left of the body.
  const bl = src.line(a.exS(body));
  const bc = src.column(a.exS(body));
  let best = -1;
  for (let i = 0; i < toI32(src.tokT.length); i++) {
    if (src.tokT[i] !== TK_tSEMI || src.tokE[i] <= a.exS(n)) {
      continue;
    }
    if (src.line(src.tokS[i]) !== bl || src.column(src.tokS[i]) >= bc) {
      continue;
    }
    if (best < 0 || src.tokS[i] < src.tokS[best]) {
      best = i;
    }
  }
  if (best >= 0) {
    k.remove(src.tokS[best], src.tokE[best]);
  }
};

// ---- ReparsedEquivalence with arbitrary corrections ----------------------------------

/** A parsed tree (Parser::AST::Node children, locations dropped), possibly normalized. */
export class SbhTree {
  // Node type, or -1 for a leaf (nil, symbol, string, number).
  t: i32;
  leaf: string;
  kids: SbhTree[];

  constructor(t: i32, leaf: string, kids: SbhTree[]) {
    this.t = t;
    this.leaf = leaf;
    this.kids = kids;
  }
}

/** rotate_same_operator: `x && (y && z)` as `(x && y) && z`. */
const sbhRotate = (n: SbhTree): SbhTree => {
  if ((n.t !== NT_AND && n.t !== NT_OR) || n.kids.length < 2) {
    return n;
  }
  const right = n.kids[1];
  if (right.t !== n.t || right.kids.length < 2) {
    return n;
  }
  const l: SbhTree[] = [n.kids[0], right.kids[0]];
  const rotatedLeft = sbhRotate(new SbhTree(n.t, "", l));
  const r: SbhTree[] = [rotatedLeft, right.kids[1]];
  return sbhRotate(new SbhTree(n.t, "", r));
};

/** The tree of a node handle; `norm` applies RedundantParentheses#normalize_reparsed_ast. */
export const sbhTree = (a: RbAst, h: i32, norm: boolean): SbhTree => {
  if (!a.isNode(h)) {
    const none: SbhTree[] = [];
    return new SbhTree(-1, h === V_NIL ? "nil" : `${vTag(h)}:${a.inspect(h)}`, none);
  }
  const t = a.type(h);
  let kids: SbhTree[] = [];
  for (let i = 0; i < a.nKid(h); i++) {
    kids.push(sbhTree(a, a.kid(h, i), norm));
  }
  if (!norm) {
    return new SbhTree(t, "", kids);
  }
  if (t === NT_BEGIN || t === NT_KWBEGIN) {
    // splice_nested_sequences
    const sp: SbhTree[] = [];
    for (const k of kids) {
      if (k.t === NT_BEGIN) {
        for (const kk of k.kids) {
          sp.push(kk);
        }
      } else {
        sp.push(k);
      }
    }
    kids = sp;
  }
  if (t === NT_BEGIN && kids.length === 1 && kids[0].t >= 0) {
    return kids[0];
  }
  return sbhRotate(new SbhTree(t, "", kids));
};

/** Parser::AST::Node#== on two trees. */
export const sbhTreeEq = (x: SbhTree, y: SbhTree): boolean => {
  if (x.t !== y.t || x.leaf !== y.leaf || x.kids.length !== y.kids.length) {
    return false;
  }
  for (let i = 0; i < toI32(x.kids.length); i++) {
    if (!sbhTreeEq(x.kids[i], y.kids[i])) {
      return false;
    }
  }
  return true;
};

/** UTF-8 bytes of a nish string to code points. */
export const sbhCodePoints = (s: string): i32[] => {
  const out: i32[] = [];
  const n = toI32(s.length);
  let i = 0;
  while (i < n) {
    const c = s.charCodeAt(i);
    if (c < 0x80) {
      out.push(c);
      i++;
    } else if (c < 0xe0) {
      out.push(((c & 0x1f) << 6) | (s.charCodeAt(i + 1) & 0x3f));
      i += 2;
    } else if (c < 0xf0) {
      out.push(((c & 0x0f) << 12) | ((s.charCodeAt(i + 1) & 0x3f) << 6) | (s.charCodeAt(i + 2) & 0x3f));
      i += 3;
    } else {
      out.push(
        ((c & 0x07) << 18) |
          ((s.charCodeAt(i + 1) & 0x3f) << 12) |
          ((s.charCodeAt(i + 2) & 0x3f) << 6) |
          (s.charCodeAt(i + 3) & 0x3f),
      );
      i += 4;
    }
  }
  return out;
};

/** Whether the code points [s, e) contain the ASCII text `lit`. */
const sbhRangeIncludes = (pts: i32[], s: i32, e: i32, lit: string): boolean => {
  const k = toI32(lit.length);
  for (let i = s; i + k <= e; i++) {
    let ok = true;
    for (let j = 0; j < k; j++) {
      if (pts[i + j] !== lit.charCodeAt(j)) {
        ok = false;
        break;
      }
    }
    if (ok) {
      return true;
    }
  }
  return false;
};

/** reparse_scope: the innermost def, defs, class, module or sclass containing [s, e) (V_NIL: none). */
const sbhReparseScope = (src: RbSource, s: i32, e: i32): i32 => {
  const a = src.a;
  let node = src.root;
  let scope = V_NIL;
  while (node !== V_NIL && a.isNode(node)) {
    const t = a.type(node);
    if (t === NT_DEF || t === NT_DEFS || t === NT_CLASS || t === NT_MODULE || t === NT_SCLASS) {
      scope = node;
    }
    let next = V_NIL;
    for (let i = 0; i < a.nKid(node); i++) {
      const c = a.kid(node, i);
      if (a.isNode(c) && a.exS(c) >= 0 && a.exS(c) <= s && e <= a.exE(c)) {
        next = c;
        break;
      }
    }
    node = next;
  }
  return scope;
};

/** ReparsedEquivalence over the items' own correctors: verification state for one source. */
export class SbhReparse {
  src: RbSource;
  norm: boolean;
  origOf: Map<i32, SbhTree>;

  constructor(src: RbSource, norm: boolean) {
    this.src = src;
    this.norm = norm;
    this.origOf = new Map<i32, SbhTree>();
  }

  /** normalized_original (null: the original does not reparse). */
  private original(scope: i32): SbhTree | null {
    const src = this.src;
    const from = scope === V_NIL ? 0 : src.a.exS(scope);
    const to = scope === V_NIL ? src.n : src.a.exE(scope);
    if (sbhRangeIncludes(src.pts, from, to, "__LINE__")) {
      const op: i32[] = [];
      for (let p = from; p < to; p++) {
        op.push(src.pts[p]);
      }
      const os = new RbSource(op, src.p.st.path);
      if (!os.valid) {
        return null;
      }
      return sbhTree(os.a, os.root, this.norm);
    }
    const key = scope === V_NIL ? -1 : scope;
    const got = this.origOf.get(key);
    if (got !== undefined) {
      return got;
    }
    const t = sbhTree(src.a, scope === V_NIL ? src.root : scope, this.norm);
    this.origOf.set(key, t);
    return t;
  }

  /** corrections_verify? for the items `idx`. */
  private verify(scope: i32, ks: RbRewriter[], idx: i32[]): boolean {
    const src = this.src;
    const rw = new RbRewriter(src.n);
    for (const i of idx) {
      if (!rw.merge(ks[i])) {
        return false;
      }
    }
    const corrected = sbhCodePoints(rw.process(src.pts));
    const delta = toI32(corrected.length) - src.n;
    let from = 0;
    let to = toI32(corrected.length);
    if (scope !== V_NIL) {
      from = src.a.exS(scope);
      to = src.a.exE(scope) + delta;
    }
    const frag: i32[] = [];
    for (let p = from; p < to && p < toI32(corrected.length); p++) {
      frag.push(corrected[p]);
    }
    const orig = this.original(scope);
    if (orig === null) {
      return false;
    }
    const rs = new RbSource(frag, src.p.st.path);
    if (!rs.valid) {
      return false;
    }
    return sbhTreeEq(sbhTree(rs.a, rs.root, this.norm), orig);
  }

  /** verified_subset. */
  private subset(scope: i32, ks: RbRewriter[], group: i32[], out: i32[]): void {
    if (this.verify(scope, ks, group)) {
      for (const i of group) {
        out.push(i);
      }
      return;
    }
    if (group.length === 1) {
      return;
    }
    const half = toI32(group.length) / 2;
    const g1: i32[] = [];
    const g2: i32[] = [];
    for (let i = 0; i < toI32(group.length); i++) {
      if (i < half) {
        g1.push(group[i]);
      } else {
        g2.push(group[i]);
      }
    }
    this.subset(scope, ks, g1, out);
    this.subset(scope, ks, g2, out);
  }

  /**
   * verified_by_reparse (oversized: :report) for items at [ss[i], es[i])
   * whose corrections are ks[i]: the verified indexes, by scope in first-seen order.
   */
  verified(ss: i32[], es: i32[], ks: RbRewriter[]): i32[] {
    const src = this.src;
    const scopes: i32[] = [];
    const groups: i32[][] = [];
    for (let i = 0; i < toI32(ss.length); i++) {
      const sc = sbhReparseScope(src, ss[i], es[i]);
      let g = -1;
      for (let j = 0; j < toI32(scopes.length); j++) {
        if (scopes[j] === sc) {
          g = j;
          break;
        }
      }
      if (g < 0) {
        scopes.push(sc);
        const fresh: i32[] = [];
        groups.push(fresh);
        g = toI32(scopes.length) - 1;
      }
      groups[g].push(i);
    }
    const out: i32[] = [];
    for (let j = 0; j < toI32(scopes.length); j++) {
      const sc = scopes[j];
      const size = sc === V_NIL ? src.n : src.a.exE(sc) - src.a.exS(sc);
      if (size > 64 * 1024) {
        for (const i of groups[j]) {
          out.push(i);
        }
        continue;
      }
      this.subset(sc, ks, groups[j], out);
    }
    return out;
  }
}
