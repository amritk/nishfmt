// RuboCop::Cop::RangeHelp over code point offsets.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { fault } from "../core/fault";
import { RbSource } from "./source";

const rbIsBlank = (c: i32): boolean => c === 32 || c === 9;
const rbIsWs = (c: i32): boolean => c === 32 || c === 9 || c === 10 || c === 11 || c === 12 || c === 13;

/** RangeHelp#final_pos moving left (step -1) or right (step 1) from `pos`. */
export const rbFinalPos = (
  src: RbSource,
  pos0: i32,
  step: i32,
  continuations: boolean,
  newlines: boolean,
  whitespace: boolean,
): i32 => {
  const n = src.n;
  let pos = pos0;
  // src.at answers -1 outside [0, n), which no test below matches: from
  // outside [0, n] nothing moves, and inside it every step stays in [0, n].
  if (pos < 0 || pos > n) {
    return pos < 0 ? 0 : pos;
  }
  // Sources stay below 2^30 code points (node.ts, "Bounded values").
  if (n > 1073741823) {
    fault();
    return pos;
  }
  if (step === -1) {
    while (pos > 0 && pos <= n && rbIsBlank(src.at(pos - 1))) {
      pos--;
    }
    if (continuations) {
      while (pos > 1 && pos <= n && src.at(pos - 2) === 92 && src.at(pos - 1) === 10) {
        pos -= 2;
      }
    }
    if (newlines) {
      while (pos > 0 && pos <= n && src.at(pos - 1) === 10) {
        pos--;
      }
    }
    if (whitespace) {
      while (pos > 0 && pos <= n && rbIsWs(src.at(pos - 1))) {
        pos--;
      }
    }
    return pos;
  }
  while (pos >= 0 && pos < n && rbIsBlank(src.at(pos))) {
    pos++;
  }
  if (continuations) {
    while (pos >= 0 && pos < n && src.at(pos) === 92 && pos + 1 < n && src.at(pos + 1) === 10) {
      pos += 2;
    }
  }
  if (newlines) {
    while (pos >= 0 && pos < n && src.at(pos) === 10) {
      pos++;
    }
  }
  if (whitespace) {
    while (pos >= 0 && pos < n && rbIsWs(src.at(pos))) {
      pos++;
    }
  }
  return pos;
};

/** range_with_surrounding_space: the new begin (side 0 both, 1 left, 2 right). */
export const rbSpaceBegin = (
  src: RbSource,
  s: i32,
  side: i32,
  newlines: boolean,
  whitespace: boolean,
  continuations: boolean,
): i32 => (side === 2 ? s : rbFinalPos(src, s, -1, continuations, newlines, whitespace));

/** range_with_surrounding_space: the new end. */
export const rbSpaceEnd = (
  src: RbSource,
  e: i32,
  side: i32,
  newlines: boolean,
  whitespace: boolean,
  continuations: boolean,
): i32 => (side === 1 ? e : rbFinalPos(src, e, 1, continuations, newlines, whitespace));

/** src.at(x + k), without the sum overflowing: -1 outside the source. */
export const rbAtOff = (src: RbSource, x: i32, k: i32): i32 => {
  const i = toI64(x) + toI64(k);
  if (i >= toI64(0) && i < toI64(src.n)) {
    return src.at(toI32(i));
  }
  return -1;
};
