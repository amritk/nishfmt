// The parts of RuboCop::AST::Node and its subclasses the cops use, as
// functions of a source and a node handle.
//
// Ported from rubocop-ast 1.51.0 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, F_HEREDOC_END, M_HEREDOC, NT_PAIR, NT_SEND, V_NIL } from "./ast";
import { RbSource } from "./source";

/** The node's type. */
export const rnType = (src: RbSource, n: i32): i32 => src.a.type(n);

export const rnIs = (src: RbSource, n: i32, t: i32): boolean => src.a.isNode(n) && src.a.type(n) === t;

/** loc?(field): the node's source map has the field. */
export const rnHas = (src: RbSource, n: i32, f: i32): boolean => src.a.has(src.a.map(n), f);

export const rnS = (src: RbSource, n: i32, f: i32): i32 => src.a.fS(src.a.map(n), f);

export const rnE = (src: RbSource, n: i32, f: i32): i32 => src.a.fE(src.a.map(n), f);

/** The source of one of the node's map fields. */
export const rnFieldSrc = (src: RbSource, n: i32, f: i32): string => src.src(rnS(src, n, f), rnE(src, n, f));

export const rnHeredoc = (src: RbSource, n: i32): boolean => src.a.mapKind(src.a.map(n)) === M_HEREDOC;

/** The end of a node's text, past a heredoc's body. */
export const rnEndWithHeredoc = (src: RbSource, n: i32): i32 => {
  if (rnHeredoc(src, n)) {
    return rnE(src, n, F_HEREDOC_END);
  }
  return src.a.exE(n);
};

export const rnFirstLine = (src: RbSource, n: i32): i32 => src.line(src.a.exS(n));

export const rnLastLine = (src: RbSource, n: i32): i32 => src.line(src.a.exE(n));

export const rnSingleLine = (src: RbSource, n: i32): boolean => rnFirstLine(src, n) === rnLastLine(src, n);

export const rnMultiline = (src: RbSource, n: i32): boolean => !rnSingleLine(src, n);

/** The ancestors, nearest first. */
export const rnAncestors = (src: RbSource, n: i32): i32[] => {
  const out: i32[] = [];
  let p = src.parent(n);
  while (p !== V_NIL) {
    out.push(p);
    p = src.parent(p);
  }
  return out;
};

export const rnHasAncestor = (src: RbSource, n: i32, t: i32): boolean => {
  let p = src.parent(n);
  while (p !== V_NIL) {
    if (src.a.type(p) === t) {
      return true;
    }
    p = src.parent(p);
  }
  return false;
};

// ---- Sends --------------------------------------------------------------------

/** The receiver of a send/csend (or V_NIL). */
export const rnReceiver = (src: RbSource, n: i32): i32 => src.a.kid(n, 0);

/** The method name of a send/csend. */
export const rnMethod = (src: RbSource, n: i32): string => src.a.text(src.a.kid(n, 1));

/** The number of arguments of a send/csend. */
export const rnArgCount = (src: RbSource, n: i32): i32 => src.a.nKid(n) - 2;

export const rnArg = (src: RbSource, n: i32, i: i32): i32 => src.a.kid(n, i + 2);

/** Node#argument?: one of the arguments of a send parent. */
export const rnIsArgument = (src: RbSource, n: i32): boolean => {
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

/** HashNode#pairs: the pair children. */
export const rnPairs = (src: RbSource, n: i32): i32[] => {
  const out: i32[] = [];
  for (let i = 0; i < src.a.nKid(n); i++) {
    const c = src.a.kid(n, i);
    if (src.a.isNode(c) && src.a.type(c) === NT_PAIR) {
      out.push(c);
    }
  }
  return out;
};

/** HashNode#braces? */
export const rnBraces = (src: RbSource, n: i32): boolean => rnHas(src, n, F_BEGIN);
