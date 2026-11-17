// Layout/HashAlignment (EnforcedHashRocketStyle: key, EnforcedColonStyle:
// key, EnforcedLastArgumentHashStyle: always_inspect): KeyAlignment and
// KeywordSplatAlignment.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_OPERATOR, NT_HASH, NT_KWSPLAT, NT_PAIR } from "../ast";
import { RbCop } from "../cop";
import { rnE, rnPairs, rnS } from "../node";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";
import { lalBeginsItsLine, lalFirstLine, lalLastLine, lalSingleLine, lalSpaces } from "./layout_align_help";

/** HashElementNode: a pair's or kwsplat's key (a kwsplat is its own key). */
const rbHashAlKey = (src: RbSource, n: i32): i32 => (src.a.type(n) === NT_KWSPLAT ? n : src.a.kid(n, 0));

/** HashElementNode#same_line?. */
const rbHashAlSameLine = (src: RbSource, x: i32, y: i32): boolean =>
  lalLastLine(src, x) === lalFirstLine(src, y) || lalFirstLine(src, x) === lalLastLine(src, y);

/** first_pair.key_delta(current) (left alignment). */
const rbHashAlKeyDelta = (src: RbSource, first: i32, cur: i32): i32 => {
  if (rbHashAlSameLine(src, first, cur)) {
    return 0;
  }
  return src.column(src.a.exS(rbHashAlKey(src, first))) - src.column(src.a.exS(rbHashAlKey(src, cur)));
};

const rbHashAlRocket = (src: RbSource, pair: i32): boolean => {
  const s = rnS(src, pair, F_OPERATOR);
  return rnE(src, pair, F_OPERATOR) === s + 2 && src.at(s) === 61 && src.at(s + 1) === 62;
};

/**
 * The end of a pair's source. The builder ends an omitted-value pair
 * (`x:`) before its colon, where the parser gem's expression holds it.
 */
const rbHashAlEnd = (src: RbSource, n: i32): i32 => {
  const e = src.a.exE(n);
  if (src.a.type(n) === NT_PAIR) {
    const oe = rnE(src, n, F_OPERATOR);
    return oe > e ? oe : e;
  }
  return e;
};

/** PairNode#value_omission?: the source ends with a colon. */
const rbHashAlOmission = (src: RbSource, pair: i32): boolean => src.at(rbHashAlEnd(src, pair) - 1) === 58;

/** KeyAlignment#separator_delta. */
const rbHashAlSepDelta = (src: RbSource, pair: i32): i32 => {
  if (!rbHashAlRocket(src, pair)) {
    return 0;
  }
  return src.column(src.a.exE(src.a.kid(pair, 0))) + 1 - src.column(rnS(src, pair, F_OPERATOR));
};

/** KeyAlignment#value_delta. */
const rbHashAlValueDelta = (src: RbSource, pair: i32): i32 => {
  const key = src.a.kid(pair, 0);
  const val = src.a.kid(pair, 1);
  if (lalFirstLine(src, key) !== lalFirstLine(src, val) || rbHashAlOmission(src, pair)) {
    return 0;
  }
  return src.column(rnE(src, pair, F_OPERATOR)) + 1 - src.column(src.a.exS(val));
};

/** HashAlignment#adjust. */
const rbHashAlAdjust = (k: RbRewriter, delta: i32, s: i32, e: i32): void => {
  if (delta > 0) {
    k.insertBefore(s, e, lalSpaces(delta));
  } else if (delta < 0) {
    k.remove(s + delta, s);
  }
};

export class CopLayoutHashAlignment {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/HashAlignment");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_HASH) {
        continue;
      }
      const pairs = rnPairs(src, n);
      if (pairs.length === 0 || lalSingleLine(src, n)) {
        continue;
      }
      this.checkPairs(src, n, pairs[0]);
    }
  }

  private checkPairs(src: RbSource, node: i32, first: i32): void {
    const a = src.a;
    // offenses_by[KeyAlignment] / [KeywordSplatAlignment], with their deltas
    // (key, separator, value; hasKey false when the delta has no :key).
    const keyN: i32[] = [];
    const keyK: i32[] = [];
    const keyS: i32[] = [];
    const keyV: i32[] = [];
    const splatN: i32[] = [];
    const splatK: i32[] = [];
    // deltas_for_first_pair: separator and value only (no :key).
    {
      const sd = rbHashAlSepDelta(src, first);
      const vd = rbHashAlValueDelta(src, first);
      if (sd !== 0 || vd !== 0) {
        keyN.push(first);
        keyK.push(0);
        keyS.push(sd);
        keyV.push(vd);
      }
    }
    for (let i = 0; i < a.nKid(node); i++) {
      const cur = a.kid(node, i);
      const t = a.type(cur);
      if (t === NT_KWSPLAT) {
        if (!lalBeginsItsLine(src, a.exS(cur))) {
          continue;
        }
        const kd = rbHashAlKeyDelta(src, first, cur);
        if (kd === 0) {
          continue;
        }
        if (kd < -src.column(a.exS(cur))) {
          continue; // key_out_of_line?: unalignable
        }
        splatN.push(cur);
        splatK.push(kd);
        continue;
      }
      if (t !== NT_PAIR) {
        return; // hash_rocket? is undefined on other children: RuboCop raises
      }
      if (!lalBeginsItsLine(src, a.exS(cur))) {
        continue;
      }
      const kd = rbHashAlKeyDelta(src, first, cur);
      const sd = rbHashAlSepDelta(src, cur);
      const vd = rbHashAlValueDelta(src, cur);
      if (kd === 0 && sd === 0 && vd === 0) {
        continue;
      }
      if (kd < -src.column(a.exS(cur))) {
        continue; // key_out_of_line?: unalignable (the only style, registered all the same)
      }
      // column_deltas[KeyAlignment][node] = delta (the last one for a node wins)
      for (let j = 0; j < toI32(keyN.length); j++) {
        if (keyN[j] === cur) {
          keyK[j] = kd;
          keyS[j] = sd;
          keyV[j] = vd;
        }
      }
      keyN.push(cur);
      keyK.push(kd);
      keyS.push(sd);
      keyV.push(vd);
    }
    // add_offenses: keyword splats first, then the key alignment offenses.
    for (let j = 0; j < toI32(splatN.length); j++) {
      const cur = splatN[j];
      const k = this.c.offense(a.exS(cur), rbHashAlEnd(src, cur));
      if (k !== null) {
        rbHashAlAdjust(k, splatK[j], a.exS(cur), rbHashAlEnd(src, cur));
        this.c.commit(k);
      }
    }
    for (let j = 0; j < toI32(keyN.length); j++) {
      const cur = keyN[j];
      const k = this.c.offense(a.exS(cur), rbHashAlEnd(src, cur));
      if (k === null) {
        continue;
      }
      if (!rbHashAlOmission(src, cur)) {
        const key = a.kid(cur, 0);
        const val = a.kid(cur, 1);
        rbHashAlAdjust(k, keyK[j], a.exS(key), a.exE(key));
        rbHashAlAdjust(k, keyS[j], rnS(src, cur, F_OPERATOR), rnE(src, cur, F_OPERATOR));
        rbHashAlAdjust(k, keyV[j], a.exS(val), a.exE(val));
      } else {
        rbHashAlAdjust(k, keyK[j], a.exS(cur), rbHashAlEnd(src, cur));
      }
      this.c.commit(k);
    }
  }
}
