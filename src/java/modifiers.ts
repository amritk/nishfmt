// google-java-format's ModifierOrderer: each run of modifiers is sorted into
// javax.lang.model's Modifier order, keeping the whitespace and comments
// between the positions. (2.0.0's `value` is not a Modifier on JDK 21.)
//
// Ported from google-java-format 2.0.0 (Apache License 2.0, Copyright 2016 Google Inc.).

import { fault } from "../core/fault";
import { Out } from "../core/out";
import { stableSort } from "../core/sort";
import { GInput } from "../gdoc/input";

/** Modifier.SEALED's and Modifier.NON_SEALED's ordinals. */
export const RANK_SEALED: i32 = 6;
export const RANK_NON_SEALED: i32 = 7;

/** The Modifier ordinal of a token's text, or -1: public protected private abstract default static sealed non-sealed final transient volatile synchronized native strictfp. */
export const modifierRank = (inp: GInput, t: i32): i32 => {
  if (inp.is(t, "public")) return 0;
  if (inp.is(t, "protected")) return 1;
  if (inp.is(t, "private")) return 2;
  if (inp.is(t, "abstract")) return 3;
  if (inp.is(t, "default")) return 4;
  if (inp.is(t, "static")) return 5;
  if (inp.is(t, "sealed")) return RANK_SEALED;
  if (inp.is(t, "final")) return 8;
  if (inp.is(t, "transient")) return 9;
  if (inp.is(t, "volatile")) return 10;
  if (inp.is(t, "synchronized")) return 11;
  if (inp.is(t, "native")) return 12;
  if (inp.is(t, "strictfp")) return 13;
  return -1;
};

/** A Modifier ordinal's name. */
const rankName = (r: i32): string => {
  if (r <= 0) return "public";
  if (r === 1) return "protected";
  if (r === 2) return "private";
  if (r === 3) return "abstract";
  if (r === 4) return "default";
  if (r === 5) return "static";
  if (r === RANK_SEALED) return "sealed";
  if (r === RANK_NON_SEALED) return "non-sealed";
  if (r === 8) return "final";
  if (r === 9) return "transient";
  if (r === 10) return "volatile";
  if (r === 11) return "synchronized";
  if (r === 12) return "native";
  if (r === 13) return "strictfp";
  fault();
  return "";
};

/** The source offset where token k starts, or with `end` where it ends. */
const modTokEdge = (inp: GInput, k: i32, end: boolean): i32 => {
  const kTok = inp.kTok;
  if (k >= 0 && k < kTok.length) {
    const t = kTok[k];
    const edges = end ? inp.tEnd : inp.tPos;
    if (t >= 0 && t < edges.length) {
      return edges[t];
    }
  }
  fault();
  return 0;
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
    const runFirst = sc.first;
    let runLast = sc.last;
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
      runLast = sc.last;
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
    const sorted: i32[] = [];
    for (const r of ranks) {
      sorted.push(r);
    }
    stableSort(sorted, (a: i32, b: i32): i32 => (a < b ? -1 : a > b ? 1 : 0));
    const begin = modTokEdge(inp, runFirst, false);
    const end = modTokEdge(inp, runLast, true);
    out.range(inp.src, at, begin);
    // firsts, lasts and sorted hold one entry per modifier.
    for (let i = 0; i < toI32(sorted.length) && i < firsts.length && i < lasts.length; i++) {
      const first = firsts[i];
      const last = lasts[i];
      const rank = sorted[i];
      const more = i < toI32(sorted.length) - 1;
      if (i > 0) {
        triviaBefore(inp, first, out);
      }
      out.str(rankName(rank));
      if (more) {
        triviaAfter(inp, last, out);
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

  /** getModifierTokens at token k (below nk): its rank, or -1. */
  take(inp: GInput, k: i32, nk: i32): i32 {
    const kTok = inp.kTok;
    this.first = k;
    this.last = k;
    if (k < 0 || k >= kTok.length) {
      // kTok holds every token below nk.
      fault();
      this.next = nk;
      return -1;
    }
    const k1 = k + 1;
    this.next = k1;
    const t = kTok[k];
    if (!inp.is(t, "non")) {
      return modifierRank(inp, t);
    }
    if (k1 >= nk) {
      return -1;
    }
    if (k1 >= kTok.length) {
      fault();
      this.next = nk;
      return -1;
    }
    const k2 = k1 + 1;
    this.next = k2;
    if (!inp.is(kTok[k1], "-") || k2 >= nk) {
      return -1;
    }
    if (k2 >= kTok.length) {
      fault();
      this.next = nk;
      return -1;
    }
    this.next = k2 + 1;
    this.last = k2;
    const r = modifierRank(inp, kTok[k2]);
    return r === RANK_SEALED ? RANK_NON_SEALED : -1;
  }
}

/** Writes the comments and whitespace of the `n` refs from `from`. */
const modTrivia = (inp: GInput, from: i32, n: i32, out: Out): void => {
  const refs = inp.refs;
  const tPos = inp.tPos;
  const tEnd = inp.tEnd;
  let r = from;
  for (let j = 0; j < n; j++) {
    if (r < 0 || r >= refs.length) {
      fault();
      return;
    }
    const t = refs[r];
    r = r + 1;
    if (t < 0 || t >= tPos.length || t >= tEnd.length) {
      fault();
      return;
    }
    out.range(inp.src, tPos[t], tEnd[t]);
  }
};

const triviaBefore = (inp: GInput, k: i32, out: Out): void => {
  const kBefore = inp.kBefore;
  const kBeforeN = inp.kBeforeN;
  if (k >= 0 && k < kBefore.length && k < kBeforeN.length) {
    modTrivia(inp, kBefore[k], kBeforeN[k], out);
    return;
  }
  fault();
};

const triviaAfter = (inp: GInput, k: i32, out: Out): void => {
  const kAfter = inp.kAfter;
  const kAfterN = inp.kAfterN;
  if (k >= 0 && k < kAfter.length && k < kAfterN.length) {
    modTrivia(inp, kAfter[k], kAfterN[k], out);
    return;
  }
  fault();
};
