// Guarded reads of one node's fields in the AST table (ast.ts), for the
// rewriting code that walks it.
//
// A node index the parser handed out is always below every field array's
// length; a read outside one is where the old code panicked, so it faults
// (src/core/fault.ts) and answers a neutral value: -1 ("absent") for a child
// or token field, so a walk along it ends, and 0 for a kind, a span end, the
// flags and a list length, so a loop over the list ends.

import { fault } from "../core/fault";
import { RsAst } from "./ast";

const rsNodeAt = (xs: i32[], n: i32, neutral: i32): i32 => {
  if (n >= 0 && n < xs.length) {
    return xs[n];
  }
  fault();
  return neutral;
};

export const rsNKind = (ast: RsAst, n: i32): i32 => rsNodeAt(ast.kind, n, 0);
export const rsNLo = (ast: RsAst, n: i32): i32 => rsNodeAt(ast.lo, n, 0);
export const rsNHi = (ast: RsAst, n: i32): i32 => rsNodeAt(ast.hi, n, 0);
export const rsNA = (ast: RsAst, n: i32): i32 => rsNodeAt(ast.a, n, -1);
export const rsNB = (ast: RsAst, n: i32): i32 => rsNodeAt(ast.b, n, -1);
export const rsNC = (ast: RsAst, n: i32): i32 => rsNodeAt(ast.c, n, -1);
export const rsND = (ast: RsAst, n: i32): i32 => rsNodeAt(ast.d, n, -1);
export const rsNE = (ast: RsAst, n: i32): i32 => rsNodeAt(ast.e, n, -1);
export const rsNX = (ast: RsAst, n: i32): i32 => rsNodeAt(ast.x, n, -1);
export const rsNFl = (ast: RsAst, n: i32): i32 => rsNodeAt(ast.fl, n, 0);
export const rsNLn = (ast: RsAst, n: i32): i32 => rsNodeAt(ast.ln, n, 0);
export const rsNAtn = (ast: RsAst, n: i32): i32 => rsNodeAt(ast.atn, n, 0);

/** Token `t`'s field `xs[t]` (a kind or a span end), or 0 after a fault. */
export const rsTokAt = (xs: i32[], t: i32): i32 => rsNodeAt(xs, t, 0);

/** The last of `xs` (a list of nodes the caller knows is not empty); an empty one faults and answers -1. */
export const rsNLastI32 = (xs: i32[]): i32 => {
  const k = toI32(xs.length);
  if (k > 0) {
    return xs[k - 1];
  }
  fault();
  return -1;
};
