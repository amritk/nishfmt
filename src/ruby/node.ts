// The parts of RuboCop::AST::Node and its subclasses the cops use, as
// functions of a source and a node handle.
//
// Ported from rubocop-ast 1.52.0 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, F_HEREDOC_END, M_HEREDOC, NT_PAIR, NT_SEND, V_NIL } from "./ast";
import { fault } from "../core/fault";
import { RbSource } from "./source";

// ---- Bounded values ---------------------------------------------------------------

// The offsets, lines, columns and child counts of a source below 2^30 code
// points lie in [-2^30, 2^30]. These readers check it (a file that large
// faults here and is left alone), and the compiler carries the range to a
// direct use of the call, so `rbNKid(src, n) - 1` needs no guard of its own.
// It carries an upper bound, and a lower bound of 0 or more, through literal
// bounds like these; a local holding the result keeps neither.

/** `x`, known to lie in [-2^30, 2^30]; outside it the file faults. */
export const rbB = (x: i32): i32 => {
  if (x >= -1073741823 && x <= 1073741823) {
    return x;
  }
  fault();
  return 0;
};

/** src.line: 1-based, so at least 1. */
export const rbLine = (src: RbSource, pos: i32): i32 => {
  const l = src.line(pos);
  if (l >= 1 && l <= 1073741823) {
    return l;
  }
  fault();
  return 1;
};

/** src.column, bounded. */
export const rbCol = (src: RbSource, pos: i32): i32 => {
  const c = src.column(pos);
  if (c >= -1073741823 && c <= 1073741823) {
    return c;
  }
  fault();
  return 0;
};

/** src.lineEnd, bounded. */
export const rbLineEnd = (src: RbSource, l: i32): i32 => {
  const e = src.lineEnd(l);
  if (e >= -1073741823 && e <= 1073741823) {
    return e;
  }
  fault();
  return 0;
};

/** The node's child count, at least 0. */
export const rbNKid = (src: RbSource, n: i32): i32 => {
  const k = src.a.nKid(n);
  if (k >= 0 && k <= 1073741823) {
    return k;
  }
  fault();
  return 0;
};

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
export const rnArgCount = (src: RbSource, n: i32): i32 => {
  const k = src.a.nKid(n);
  if (k >= 0 && k <= 1073741823) {
    return k - 2;
  }
  fault();
  return -2;
};

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
