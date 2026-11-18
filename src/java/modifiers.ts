// google-java-format's ModifierOrderer: each run of modifiers is sorted into
// javax.lang.model's Modifier order, keeping the whitespace and comments
// between the positions. (2.0.0's `value` is not a Modifier on JDK 21.)
//
// Ported from google-java-format 2.0.0 (Apache License 2.0, Copyright 2016 Google Inc.).

import { Out } from "../core/out";
import { GInput } from "../gdoc/input";

/** The Modifier ordinal of a token's text, or -1: public protected private abstract default static sealed non-sealed final transient volatile synchronized native strictfp. */
const modifierRank = (inp: GInput, t: i32): i32 => {
  if (inp.is(t, "public")) return 0;
  if (inp.is(t, "protected")) return 1;
  if (inp.is(t, "private")) return 2;
  if (inp.is(t, "abstract")) return 3;
  if (inp.is(t, "default")) return 4;
  if (inp.is(t, "static")) return 5;
  if (inp.is(t, "sealed")) return 6;
  if (inp.is(t, "final")) return 8;
  if (inp.is(t, "transient")) return 9;
  if (inp.is(t, "volatile")) return 10;
  if (inp.is(t, "synchronized")) return 11;
  if (inp.is(t, "native")) return 12;
  if (inp.is(t, "strictfp")) return 13;
  return -1;
};

const RANK_NAMES: string =
  "public protected private abstract default static sealed non-sealed final transient volatile synchronized native strictfp";

const rankName = (r: i32): string => {
  let i = 0;
  let k = 0;
  const s = RANK_NAMES;
  while (k < r) {
    while (s.charCodeAt(i) !== 32) {
      i++;
    }
    i++;
    k++;
  }
  let e = i;
  while (e < toI32(s.length) && s.charCodeAt(e) !== 32) {
    e++;
  }
  return s.substring(i, e);
};

/** Writes the text with every modifier run sorted into `out`; answers whether anything moved. */
export const reorderModifiers = (inp: GInput, out: Out): boolean => {
  const nk = inp.nTokens;
  out.n = 0;
  let at = 0;
  let any = false;
  let k = 0;
  // Each run: token ranges [first, last] and ranks.
  const sc = new ModScan();
  while (k < nk) {
    const r0 = sc.take(inp, k, nk);
    k = sc.next;
    if (r0 < 0) {
      continue;
    }
    const firsts: i32[] = [sc.first];
    const lasts: i32[] = [sc.last];
    const ranks: i32[] = [r0];
    while (k < nk) {
      const r = sc.take(inp, k, nk);
      k = sc.next;
      if (r < 0) {
        break;
      }
      firsts.push(sc.first);
      lasts.push(sc.last);
      ranks.push(r);
    }
    let ordered = true;
    for (let i = 1; i < toI32(ranks.length); i++) {
      if (ranks[i - 1] > ranks[i]) {
        ordered = false;
      }
    }
    if (ordered) {
      continue;
    }
    const sorted = ranks.slice(0, ranks.length);
    sorted.sort((a, b) => a - b);
    const begin = inp.tPos[inp.kTok[firsts[0]]];
    const end = inp.tEnd[inp.kTok[lasts[lasts.length - 1]]];
    out.range(inp.src, at, begin);
    for (let i = 0; i < toI32(sorted.length); i++) {
      if (i > 0) {
        triviaBefore(inp, firsts[i], out);
      }
      out.str(rankName(sorted[i]));
      if (i < toI32(sorted.length) - 1) {
        triviaAfter(inp, lasts[i], out);
      }
    }
    at = end;
    any = true;
  }
  if (!any) {
    return false;
  }
  out.range(inp.src, at, inp.n);
  return true;
};

/** The token range of the last `take`, and where the scan continues. */
class ModScan {
  first: i32 = 0;
  last: i32 = 0;
  next: i32 = 0;

  /** getModifierTokens at token k: its rank, or -1. */
  take(inp: GInput, k: i32, nk: i32): i32 {
    const t = inp.kTok[k];
    this.first = k;
    this.last = k;
    this.next = k + 1;
    if (!inp.is(t, "non")) {
      return modifierRank(inp, t);
    }
    if (k + 1 >= nk) {
      return -1;
    }
    this.next = k + 2;
    if (!inp.is(inp.kTok[k + 1], "-") || k + 2 >= nk) {
      return -1;
    }
    this.next = k + 3;
    this.last = k + 2;
    const r = modifierRank(inp, inp.kTok[k + 2]);
    return r === 6 ? 7 : -1;
  }
}

const triviaBefore = (inp: GInput, k: i32, out: Out): void => {
  for (let j = 0; j < inp.kBeforeN[k]; j++) {
    const t = inp.refs[inp.kBefore[k] + j];
    out.range(inp.src, inp.tPos[t], inp.tEnd[t]);
  }
};

const triviaAfter = (inp: GInput, k: i32, out: Out): void => {
  for (let j = 0; j < inp.kAfterN[k]; j++) {
    const t = inp.refs[inp.kAfter[k] + j];
    out.range(inp.src, inp.tPos[t], inp.tEnd[t]);
  }
};
