// RuboCop::Cop::RangeHelp over code point offsets.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

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
  let pos = pos0;
  const off = step === -1 ? -1 : 0;
  while (rbIsBlank(src.at(pos + off))) {
    pos += step;
  }
  if (continuations) {
    const o2 = step === -1 ? -2 : 0;
    while (src.at(pos + o2) === 92 && src.at(pos + o2 + 1) === 10) {
      pos += 2 * step;
    }
  }
  if (newlines) {
    while (src.at(pos + off) === 10) {
      pos += step;
    }
  }
  if (whitespace) {
    while (rbIsWs(src.at(pos + off))) {
      pos += step;
    }
  }
  return pos < 0 ? 0 : pos;
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
