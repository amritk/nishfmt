// The parts of RuboCop::AST::Node and its subclasses the cops use, as
// functions of a source and a node handle.
//
// Ported from rubocop-ast 1.51.0 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_HEREDOC_END, M_HEREDOC, V_NIL } from "./ast";
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

