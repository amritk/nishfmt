// What the Lint batch of detection cops share: RuboCop::AST::Node's literal
// predicates, const_name, parent_module_name, the generic `receiver`
// matcher, value_used?, a node's sexp (to_s) for keys, and CommentsHelp's
// comments_contain_disables?.
//
// Ported from RuboCop 1.92.2 and rubocop-ast 1.51.0 (MIT License, Copyright
// (c) 2012-24 Bozhidar Batsov).

import {
  NT_AND,
  NT_ARRAY,
  NT_BEGIN,
  NT_BLOCK,
  NT_CASE,
  NT_CASGN,
  NT_CBASE,
  NT_CLASS,
  NT_COMPLEX,
  NT_CONST,
  NT_CSEND,
  NT_DEF,
  NT_DEFINED_P,
  NT_DEFS,
  NT_DSTR,
  NT_DSYM,
  NT_EFLIPFLOP,
  NT_ERANGE,
  NT_FALSE,
  NT_FLOAT,
  NT_FOR,
  NT_HASH,
  NT_IF,
  NT_IFLIPFLOP,
  NT_INT,
  NT_IRANGE,
  NT_KWBEGIN,
  NT_LAMBDA,
  NT_MODULE,
  NT_NIL,
  NT_NOT,
  NT_NUMBLOCK,
  NT_OR,
  NT_PAIR,
  NT_RATIONAL,
  NT_REGEXP,
  NT_REGOPT,
  NT_SCLASS,
  NT_SELF,
  NT_SEND,
  NT_STR,
  NT_SYM,
  NT_TRUE,
  NT_UNTIL,
  NT_UNTIL_POST,
  NT_WHEN,
  NT_WHILE,
  NT_WHILE_POST,
  NT_XSTR,
  V_NIL,
} from "../ast";
import { RbSource } from "../source";
import { srdFindEndLine } from "./style_redundant_condition";
import { ssxIs, ssxMeth } from "./style_syntax_help";

// ---- Literal predicates ------------------------------------------------------------

/** truthy_literal?. */
export const lbhTruthyT = (t: i32): boolean =>
  t === NT_STR ||
  t === NT_DSTR ||
  t === NT_XSTR ||
  t === NT_INT ||
  t === NT_FLOAT ||
  t === NT_SYM ||
  t === NT_DSYM ||
  t === NT_ARRAY ||
  t === NT_HASH ||
  t === NT_REGEXP ||
  t === NT_TRUE ||
  t === NT_IRANGE ||
  t === NT_ERANGE ||
  t === NT_COMPLEX ||
  t === NT_RATIONAL ||
  t === NT_REGOPT;

/** falsey_literal?. */
export const lbhFalseyT = (t: i32): boolean => t === NT_FALSE || t === NT_NIL;

/** Whether a handle is a node whose type satisfies one of the predicates below. */
export const lbhTruthy = (src: RbSource, n: i32): boolean => src.a.isNode(n) && lbhTruthyT(src.a.type(n));

export const lbhFalsey = (src: RbSource, n: i32): boolean => src.a.isNode(n) && lbhFalseyT(src.a.type(n));

/** literal?. */
export const lbhLiteral = (src: RbSource, n: i32): boolean => lbhTruthy(src, n) || lbhFalsey(src, n);

/** COMPOSITE_LITERALS. */
const lbhCompositeT = (t: i32): boolean =>
  t === NT_DSTR || t === NT_XSTR || t === NT_DSYM || t === NT_ARRAY || t === NT_HASH || t === NT_IRANGE || t === NT_ERANGE || t === NT_REGEXP;

/** basic_literal?. */
export const lbhBasicLiteral = (src: RbSource, n: i32): boolean => lbhLiteral(src, n) && !lbhCompositeT(src.a.type(n));

/** mutable_literal? (MUTABLE_LITERALS). */
const lbhMutableT = (t: i32): boolean =>
  t === NT_STR || t === NT_DSTR || t === NT_XSTR || t === NT_ARRAY || t === NT_HASH || t === NT_REGEXP || t === NT_IRANGE || t === NT_ERANGE;

/** immutable_literal?. */
export const lbhImmutableLiteral = (src: RbSource, n: i32): boolean => lbhLiteral(src, n) && !lbhMutableT(src.a.type(n));

/** recursive_basic_literal?. */
export const lbhRecursiveBasicLiteral = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  if (!a.isNode(n)) {
    return false;
  }
  const t = a.type(n);
  if (t === NT_SEND) {
    const m = ssxMeth(src, n);
    // LITERAL_RECURSIVE_METHODS: COMPARISON_OPERATORS + * ! <=>
    const ok = m === "==" || m === "===" || m === "!=" || m === "<=" || m === ">=" || m === ">" || m === "<" || m === "*" || m === "!" || m === "<=>";
    if (!ok || !lbhRecursiveBasicLiteral(src, a.kid(n, 0))) {
      return false;
    }
    for (let i = 2; i < a.nKid(n); i++) {
      if (!lbhRecursiveBasicLiteral(src, a.kid(n, i))) {
        return false;
      }
    }
    return true;
  }
  if (t === NT_AND || t === NT_OR || lbhCompositeT(t) || t === NT_BEGIN || t === NT_PAIR) {
    for (let i = 0; i < a.nKid(n); i++) {
      const c = a.kid(n, i);
      // children.compact: nil dropped; every other child must answer.
      if (c === V_NIL) {
        continue;
      }
      if (!lbhRecursiveBasicLiteral(src, c)) {
        return false;
      }
    }
    return true;
  }
  return lbhBasicLiteral(src, n);
};

// ---- Names ----------------------------------------------------------------------------

/** const_name of a const or casgn node ("" stands in for nil). */
export const lbhConstName = (src: RbSource, n: i32): string => {
  const a = src.a;
  if (!ssxIs(src, n, NT_CONST) && !ssxIs(src, n, NT_CASGN)) {
    return "";
  }
  const ns = a.kid(n, 0);
  const short = a.text(a.kid(n, 1));
  if (ns !== V_NIL && !ssxIs(src, ns, NT_CBASE)) {
    return `${lbhConstName(src, ns)}::${short}`;
  }
  return short;
};

/** global_const?(names): (const {nil? cbase} name), names comma-separated. */
export const lbhGlobalConst = (src: RbSource, n: i32, names: string): boolean => {
  if (!ssxIs(src, n, NT_CONST)) {
    return false;
  }
  const ns = src.a.kid(n, 0);
  if (ns !== V_NIL && !ssxIs(src, ns, NT_CBASE)) {
    return false;
  }
  return `,${names},`.indexOf(`,${src.a.text(src.a.kid(n, 1))},`) >= 0;
};

/** (const _ name): any namespace. */
export const lbhAnyConst = (src: RbSource, n: i32, names: string): boolean =>
  ssxIs(src, n, NT_CONST) && `,${names},`.indexOf(`,${src.a.text(src.a.kid(n, 1))},`) >= 0;

/** Node#receiver: the receiver of a send/csend, of a defs, or of a block's call; V_NIL otherwise. */
export const lbhReceiver = (src: RbSource, n: i32): i32 => {
  const a = src.a;
  if (!a.isNode(n)) {
    return V_NIL;
  }
  const t = a.type(n);
  if (t === NT_SEND || t === NT_CSEND || t === NT_DEFS) {
    return a.kid(n, 0);
  }
  if (t === NT_BLOCK || t === NT_NUMBLOCK) {
    const s = a.kid(n, 0);
    if (ssxIs(src, s, NT_SEND) || ssxIs(src, s, NT_CSEND)) {
      return a.kid(s, 0);
    }
  }
  return V_NIL;
};

/** The defined_module of a class, module or casgn: [namespace, name handle] or [] (none). */
export const lbhDefinedModule = (src: RbSource, n: i32): i32[] => {
  const a = src.a;
  const none: i32[] = [];
  const t = a.type(n);
  if (t === NT_CLASS || t === NT_MODULE) {
    const c = a.kid(n, 0);
    if (!ssxIs(src, c, NT_CONST)) {
      return none;
    }
    const r: i32[] = [a.kid(c, 0), a.kid(c, 1)];
    return r;
  }
  if (t === NT_CASGN) {
    let v = a.kid(n, 2);
    if (ssxIs(src, v, NT_BLOCK)) {
      v = a.kid(v, 0);
    }
    if (ssxIs(src, v, NT_SEND) && ssxMeth(src, v) === "new" && lbhGlobalConst(src, a.kid(v, 0), "Class,Module")) {
      const r: i32[] = [a.kid(n, 0), a.kid(n, 1)];
      return r;
    }
  }
  return none;
};

/** defined_module_name ("" stands in for nil). */
export const lbhDefinedModuleName = (src: RbSource, n: i32): string => {
  const dm = lbhDefinedModule(src, n);
  if (dm.length === 0) {
    return "";
  }
  const ns = dm[0];
  const short = src.a.text(dm[1]);
  if (ns !== V_NIL && !ssxIs(src, ns, NT_CBASE)) {
    return `${lbhConstName(src, ns)}::${short}`;
  }
  return short;
};

/** new_class_or_module_block?: ^(casgn _ _ (block (send (const _ {:Class :Module}) :new) ...)). */
const lbhNewClassOrModuleBlock = (src: RbSource, b: i32): boolean => {
  const a = src.a;
  const p = src.parent(b);
  if (!ssxIs(src, p, NT_CASGN) || a.kid(p, 2) !== b || !ssxIs(src, b, NT_BLOCK)) {
    return false;
  }
  const s = a.kid(b, 0);
  return ssxIs(src, s, NT_SEND) && a.nKid(s) === 2 && ssxMeth(src, s) === "new" && lbhAnyConst(src, a.kid(s, 0), "Class,Module");
};

/** Node#parent_module_name (null: undeterminable). */
export const lbhParentModuleName = (src: RbSource, n: i32): string | null => {
  const a = src.a;
  const parts: string[] = [];
  let p = src.parent(n);
  while (p !== V_NIL) {
    const t = a.type(p);
    if (t === NT_CLASS || t === NT_MODULE || t === NT_CASGN) {
      const nm = lbhDefinedModuleName(src, p);
      if (nm.length > 0) {
        parts.push(nm);
      }
    } else if (t === NT_SCLASS) {
      const subj = a.kid(p, 0);
      if (ssxIs(src, subj, NT_CONST)) {
        parts.push(`#<Class:${lbhConstName(src, subj)}>`);
      } else if (ssxIs(src, subj, NT_SELF)) {
        const outer = lbhParentModuleName(src, p);
        parts.push(`#<Class:${outer === null ? "" : outer}>`);
      } else {
        return null;
      }
    } else if (t === NT_BLOCK) {
      const s = a.kid(p, 0);
      if (ssxIs(src, s, NT_SEND) && ssxMeth(src, s) === "class_eval") {
        const r = a.kid(s, 0);
        if (r !== V_NIL) {
          if (!ssxIs(src, r, NT_CONST)) {
            return null;
          }
          parts.push(lbhConstName(src, r));
        }
      } else if (!lbhNewClassOrModuleBlock(src, p)) {
        return null;
      }
    }
    p = src.parent(p);
  }
  if (parts.length === 0) {
    return "Object";
  }
  const out: string[] = [];
  for (let i = toI32(parts.length) - 1; i >= 0; i--) {
    out.push(parts[i]);
  }
  return out.join("::");
};

/** The nearest ancestor of type t (V_NIL: none). */
export const lbhAncestor = (src: RbSource, n: i32, t: i32): i32 => {
  let p = src.parent(n);
  while (p !== V_NIL) {
    if (src.a.type(p) === t) {
      return p;
    }
    p = src.parent(p);
  }
  return V_NIL;
};

/** The index of n among its parent's children (-1 at the root). */
export const lbhSiblingIndex = (src: RbSource, n: i32): i32 => {
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

/** Node#value_used?. */
export const lbhValueUsed = (src: RbSource, n: i32): boolean => {
  const p = src.parent(n);
  if (p === V_NIL) {
    return false;
  }
  const t = src.a.type(p);
  if (
    t === NT_ARRAY ||
    t === NT_DEFINED_P ||
    t === NT_DSTR ||
    t === NT_DSYM ||
    t === NT_EFLIPFLOP ||
    t === NT_ERANGE ||
    t === NT_FLOAT ||
    t === NT_HASH ||
    t === NT_IFLIPFLOP ||
    t === NT_IRANGE ||
    t === NT_NOT ||
    t === NT_PAIR ||
    t === NT_REGEXP ||
    t === NT_STR ||
    t === NT_SYM ||
    t === NT_WHEN ||
    t === NT_XSTR
  ) {
    return lbhValueUsed(src, p);
  }
  const idx = lbhSiblingIndex(src, n);
  if (t === NT_BEGIN || t === NT_KWBEGIN) {
    return idx === src.a.nKid(p) - 1 ? lbhValueUsed(src, p) : false;
  }
  if (t === NT_FOR) {
    return idx === 2 ? lbhValueUsed(src, p) : true;
  }
  if (t === NT_CASE || t === NT_IF) {
    return idx === 0 || lbhValueUsed(src, p);
  }
  if (t === NT_WHILE || t === NT_UNTIL || t === NT_WHILE_POST || t === NT_UNTIL_POST) {
    return idx === 0;
  }
  return true;
};

/** lambda?: (any_block (send nil? :lambda) ...), `->` included. */
export const lbhLambdaBlock = (src: RbSource, n: i32): boolean => {
  if (!ssxIs(src, n, NT_BLOCK) && !ssxIs(src, n, NT_NUMBLOCK)) {
    return false;
  }
  const s = src.a.kid(n, 0);
  return ssxIs(src, s, NT_LAMBDA) || (ssxIs(src, s, NT_SEND) && src.a.kid(s, 0) === V_NIL && ssxMeth(src, s) === "lambda");
};

/** BlockNode#lambda?: send_node.method?(:lambda). */
export const lbhBlockIsLambda = (src: RbSource, n: i32): boolean => {
  const s = src.a.kid(n, 0);
  return ssxIs(src, s, NT_LAMBDA) || ((ssxIs(src, s, NT_SEND) || ssxIs(src, s, NT_CSEND)) && ssxMeth(src, s) === "lambda");
};

/** Node#to_s (the sexp), as a key: equal for equal nodes. */
export const lbhSexp = (src: RbSource, h: i32): string => {
  const out: string[] = [];
  lbhSexpInto(src, h, out);
  return out.join("");
};

const lbhSexpInto = (src: RbSource, h: i32, out: string[]): void => {
  const a = src.a;
  if (!a.isNode(h)) {
    out.push(a.inspect(h));
    return;
  }
  out.push(`(${a.type(h)}`);
  for (let i = 0; i < a.nKid(h); i++) {
    out.push(" ");
    lbhSexpInto(src, a.kid(h, i), out);
  }
  out.push(")");
};

// ---- Comments -----------------------------------------------------------------------------

/** CommentsHelp#comments_contain_disables?(node, cop). */
export const lbhCommentsContainDisables = (src: RbSource, n: i32, cop: string): boolean => {
  const s = src.line(src.a.exS(n));
  const e = srdFindEndLine(src, n);
  for (let i = 0; i < toI32(src.dirNames.length); i++) {
    if (src.dirNames[i] !== cop) {
      continue;
    }
    const lo = src.dirFrom[i];
    const hi = src.dirTo[i];
    // (lo..hi).cover?(s...e) || (s...e).cover?(lo..hi)
    if ((s < e && lo <= s && e - 1 <= hi) || (lo <= hi && s <= lo && hi < e)) {
      return true;
    }
  }
  return false;
};
