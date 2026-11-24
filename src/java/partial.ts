// google-java-format's partial formatting, which StringWrapper runs on the
// ranges it is about to replace (Formatter.getFormatReplacements): the
// whole text is formatted again, the character ranges become token ranges,
// those grow to the regions the visitor marked as formattable alone, and each
// region's lines are taken from the new output. Formatting is not idempotent
// everywhere (a trailing comment wrapped onto a second line is a leading
// comment the next time), so this can change the text.
//
// Ported from google-java-format 2.0.0 (Apache License 2.0, Copyright 2015 Google Inc.):
// Formatter.getFormatReplacements, JavaInput.characterRangesToTokenRanges,
// JavaOutput.getFormatReplacements, expandToBreakableRegions and
// applyReplacements, and InputOutput.makeKToIJ.

import { add32, atI32, newI32s, sub32 } from "../core/arr";
import { fault } from "../core/fault";
import { Out } from "../core/out";
import { JlEngine } from "./layout/engine";
import { GInput } from "../gdoc/input";

/** The byte length of a CharMatcher.whitespace() character at `i` (below `n`), or 0. */
const jpWsLen = (s: u8[], n: i32, i: i32): i32 => {
  if (i < 0 || i >= s.length) {
    fault();
    return 0;
  }
  const c = toI32(s[i]);
  if (c < 0x80) {
    return c === 32 || c === 9 || c === 10 || c === 13 || c === 12 || c === 11 ? 1 : 0;
  }
  const i1 = i + 1;
  if (i1 >= n) {
    return 0; // no second byte, so no third
  }
  if (i1 >= s.length) {
    fault();
    return 0;
  }
  const c1 = toI32(s[i1]);
  if (c === 0xc2 && (c1 === 0x85 || c1 === 0xa0)) {
    return 2;
  }
  const i2 = i1 + 1;
  if (i2 >= n) {
    return 0;
  }
  if (i2 >= s.length) {
    fault();
    return 0;
  }
  const c2 = toI32(s[i2]);
  if (c === 0xe1 && c1 === 0x9a && c2 === 0x80) {
    return 3; // U+1680
  }
  if (c === 0xe2 && c1 === 0x80 && ((c2 >= 0x80 && c2 <= 0x8a) || c2 === 0xa8 || c2 === 0xa9 || c2 === 0xaf)) {
    return 3; // U+2000-200A, U+2028, U+2029, U+202F
  }
  if (c === 0xe2 && c1 === 0x81 && c2 === 0x9f) {
    return 3; // U+205F
  }
  if (c === 0xe3 && c1 === 0x80 && c2 === 0x80) {
    return 3; // U+3000
  }
  return 0;
};

/** The byte length of a whitespace character ending just before `i`, or 0. */
const jpWsBefore = (s: u8[], n: i32, i: i32): i32 => {
  if (i <= 0 || i > s.length) {
    fault();
    return 0;
  }
  if (toI32(s[i - 1]) < 0x80) {
    return jpWsLen(s, n, i - 1);
  }
  if (i >= 2 && jpWsLen(s, n, i - 2) === 2) {
    return 2;
  }
  if (i >= 3 && jpWsLen(s, n, i - 3) === 3) {
    return 3;
  }
  return 0;
};

/** Newlines.hasNewlineAt. */
const jpNewlineAt = (s: u8[], n: i32, i: i32): i32 => {
  if (i < 0 || i >= s.length) {
    fault();
    return -1;
  }
  const c = toI32(s[i]);
  if (c === 13) {
    const i1 = i + 1;
    if (i1 >= n) {
      return 1;
    }
    if (i1 >= s.length) {
      fault();
      return -1;
    }
    return toI32(s[i1]) === 10 ? 2 : 1;
  }
  return c === 10 ? 1 : -1;
};

/** A TreeRangeSet of closed-open ranges: sorts them and joins the connected ones. */
const jpCoalesce = (los: i32[], his: i32[]): void => {
  if (los.length !== his.length) {
    fault();
    return;
  }
  for (let i = 1; i < los.length && i < his.length; i++) {
    const lo = los[i];
    const hi = his[i];
    let j = i;
    while (j > 0 && j < los.length && j < his.length && los[j - 1] > lo) {
      los[j] = los[j - 1];
      his[j] = his[j - 1];
      j--;
    }
    if (j < 0 || j >= los.length || j >= his.length) {
      fault();
      return;
    }
    los[j] = lo;
    his[j] = hi;
  }
  let m = 0;
  for (let i = 0; i < los.length && i < his.length; i++) {
    if (m < 0 || m >= los.length || m >= his.length) {
      fault(); // m counts the kept ranges among the first i, so m <= i
      return;
    }
    if (m > 0 && los[i] <= his[m - 1]) {
      if (his[i] > his[m - 1]) {
        his[m - 1] = his[i];
      }
    } else {
      los[m] = los[i];
      his[m] = his[i];
      m++;
    }
  }
  while (toI32(los.length) > m) {
    if (los.length > 0) {
      los.pop();
    }
    if (his.length > 0) {
      his.pop();
    } else {
      fault();
      return;
    }
  }
};

/** JavaOutput.startTok: the token's first numbered tok. */
const jpStartTok = (inp: GInput, k: i32): i32 => {
  const kBefore = inp.kBefore;
  const kBeforeN = inp.kBeforeN;
  const kTok = inp.kTok;
  if (k < 0 || k >= kBefore.length || k >= kBeforeN.length) {
    fault();
    return 0;
  }
  const base = kBefore[k];
  const cnt = kBeforeN[k];
  const refs = inp.refs;
  const tIdx = inp.tIdx;
  for (let j = 0; j < cnt; j++) {
    const r = add32(base, j);
    if (r < 0 || r >= refs.length) {
      fault();
      return 0;
    }
    const t = refs[r];
    if (t < 0 || t >= tIdx.length) {
      fault();
      return 0;
    }
    if (tIdx[t] >= 0) {
      return t;
    }
  }
  return atI32(kTok, k);
};

/** JavaOutput.endTok: the token's last numbered tok. */
const jpEndTok = (inp: GInput, k: i32): i32 => {
  const kAfter = inp.kAfter;
  const kAfterN = inp.kAfterN;
  const kTok = inp.kTok;
  if (k < 0 || k >= kAfter.length || k >= kAfterN.length) {
    fault();
    return 0;
  }
  const base = kAfter[k];
  let j = kAfterN[k];
  const refs = inp.refs;
  const tIdx = inp.tIdx;
  while (j > 0) {
    j = j - 1;
    const r = add32(base, j);
    if (r < 0 || r >= refs.length) {
      fault();
      return 0;
    }
    const t = refs[r];
    if (t < 0 || t >= tIdx.length) {
      fault();
      return 0;
    }
    if (tIdx[t] >= 0) {
      return t;
    }
  }
  return atI32(kTok, k);
};

/** tIdx[kTok[k]]: token k's numbered tok. */
const jpTokIdx = (inp: GInput, k: i32): i32 => atI32(inp.tIdx, atI32(inp.kTok, k));

/** makeKToIJ(output).get(k): the output lines holding tok number k, as lo (or -1) and hi. */
class JpLines {
  lo: i32 = -1;
  hi: i32 = -1;
}

const jpKToJ = (g: JlEngine, k: i32, r: JpLines): void => {
  r.lo = -1;
  r.hi = -1;
  const ijN = g.nOutLines;
  const nLineR = g.nLineR;
  const lineRLo = g.lineRLo;
  const lineRHi = g.lineRHi;
  for (let ij = 0; ij <= ijN && ij < nLineR; ij++) {
    if (ij >= lineRLo.length) {
      fault();
      return;
    }
    const lo = lineRLo[ij];
    if (lo >= 0 && lo <= k) {
      if (ij >= lineRHi.length) {
        fault();
        return;
      }
      if (k < lineRHi[ij]) {
        if (r.lo < 0) {
          r.lo = ij;
        }
        r.hi = ij + 1;
      }
    }
  }
};

/**
 * Formatter.formatSource(input, characterRanges), once `g` has formatted
 * `inp` with `g.partial` set: `ranges` holds [start, end) pairs. Writes the
 * text into `out`; answers 1 when it changed, 0 when not, -1 when
 * google-java-format would fail.
 */
export const partialFormat = (inp: GInput, g: JlEngine, ranges: i32[], out: Out): i32 => {
  const text = inp.src;
  const n = inp.n;
  const kN = inp.kN;
  const nTokens = inp.nTokens;
  const kSpanStart = inp.kSpanStart;
  const kSpanEnd = inp.kSpanEnd;
  // characterRangesToTokenRanges: the tokens whose span meets each range.
  const tLo: i32[] = [];
  const tHi: i32[] = [];
  // Each pair is ranges[r - 1], ranges[r], for odd r.
  for (let r = 1; r > 0 && r < ranges.length; r++) {
    if ((r & 1) === 0) {
      continue;
    }
    const a = ranges[r - 1];
    let b = ranges[r];
    if (b > n) {
      return -1;
    }
    if (b <= a) {
      b = add32(a, 1);
    }
    let lo = 0;
    let hi = nTokens;
    while (lo >= 0 && lo < hi) {
      // lo and hi are not negative, so the u32 sum is exact.
      const mid = toI32((toU32(lo) + toU32(hi)) >>> 1);
      if (mid < 0 || mid >= kSpanEnd.length) {
        fault();
        return -1;
      }
      if (kSpanEnd[mid] >= a) {
        hi = mid;
      } else {
        lo = mid + 1;
      }
    }
    if (lo >= nTokens) {
      continue;
    }
    if (lo < 0 || lo >= kSpanStart.length) {
      fault();
      return -1;
    }
    if (kSpanStart[lo] >= b) {
      continue;
    }
    let last = lo;
    while (last >= 0 && last < kSpanStart.length) {
      const nx = last + 1;
      if (nx >= nTokens) {
        break;
      }
      if (nx >= kSpanStart.length) {
        fault();
        return -1;
      }
      if (kSpanStart[nx] >= b) {
        break;
      }
      last = nx;
    }
    tLo.push(jpTokIdx(inp, lo));
    tHi.push(add32(jpTokIdx(inp, last), 1));
  }
  jpCoalesce(tLo, tHi);
  // getFormatReplacements: each token range, within [0, kN], grown to the marked regions.
  const bLo: i32[] = [];
  const bHi: i32[] = [];
  const nPf = g.nPf;
  const pfLo = g.pfLo;
  const pfHi = g.pfHi;
  for (let i = 0; i < tLo.length && i < tHi.length; i++) {
    let lo = tLo[i];
    if (lo < 0) {
      lo = 0;
    }
    const kN1 = add32(kN, 1);
    let hi = tHi[i];
    if (hi > kN1) {
      hi = kN1;
    }
    if (lo >= hi || hi <= 0) {
      continue; // lo is not negative, so hi <= 0 is lo >= hi
    }
    const h1 = hi - 1;
    let pa = -1;
    let pb = -1;
    for (let p = 0; p < nPf; p++) {
      if (p >= pfLo.length || p >= pfHi.length) {
        fault();
        return -1;
      }
      if (pfLo[p] <= lo && lo <= pfHi[p]) {
        pa = p;
      }
      if (pfLo[p] <= h1 && h1 <= pfHi[p]) {
        pb = p;
      }
    }
    if (pa < 0 || pb < 0) {
      continue; // the range holds only whitespace
    }
    if (pa >= pfLo.length || pb >= pfHi.length) {
      fault();
      return -1;
    }
    const plo = pfLo[pa];
    const phi = pfHi[pb];
    bLo.push(plo);
    bHi.push(add32(phi, 1));
  }
  jpCoalesce(bLo, bHi);
  // The output's lines.
  const o = g.out.buf;
  const on = g.out.n;
  const lineCount = g.nOutLines;
  const ls = newI32s(add32(lineCount, 1));
  if (ls.length < 1 || on > o.length) {
    fault();
    return -1;
  }
  {
    let j = 0;
    ls[0] = 0;
    for (let p = 0; p < on && p < o.length && j < lineCount; p++) {
      if (toI32(o[p]) === 10) {
        j++;
        if (j >= ls.length) {
          fault();
          return -1;
        }
        ls[j] = p + 1;
      }
    }
  }
  // Line i is o[ls[i], ls[i + 1] - 1).
  const repFrom: i32[] = [];
  const repTo: i32[] = [];
  const reps: Out[] = [];
  const kj = new JpLines();
  for (let r = 0; r < bLo.length && r < bHi.length; r++) {
    const st = jpStartTok(inp, atI32(inp.kToToken, bLo[r]));
    const et = jpEndTok(inp, atI32(inp.kToToken, sub32(bHi[r], 1)));
    const rep = new Out(256);
    let replaceFrom = atI32(inp.tPos, st);
    while (replaceFrom > 0) {
      const w = jpWsBefore(text, n, replaceFrom);
      if (w <= 0) {
        break; // never negative
      }
      replaceFrom = replaceFrom - w;
    }
    jpKToJ(g, atI32(inp.tIdx, st), kj);
    if (kj.lo < 0) {
      return -1;
    }
    let i = kj.lo;
    while (i > 0) {
      if (i >= ls.length) {
        fault();
        return -1;
      }
      if (toI64(ls[i]) - toI64(ls[i - 1]) !== toI64(1)) {
        break;
      }
      i--;
    }
    jpKToJ(g, atI32(inp.tIdx, et), kj);
    if (kj.lo < 0) {
      return -1;
    }
    for (; i < kj.hi; i++) {
      if (i < lineCount) {
        if (i > 0) {
          rep.byte(10);
        }
        if (i < 0 || i >= ls.length - 1) {
          fault();
          return -1;
        }
        rep.range(o, ls[i], sub32(ls[i + 1], 1));
      }
    }
    const tEnd = atI32(inp.tEnd, et);
    let replaceTo = tEnd < n ? tEnd : n;
    if (toI64(atI32(inp.tIdx, et)) === toI64(kN) - toI64(1)) {
      replaceTo = n;
    }
    let newline = -1;
    while (replaceTo < n) {
      const w = jpWsLen(text, n, replaceTo);
      if (w === 0) {
        break;
      }
      const nl = jpNewlineAt(text, n, replaceTo);
      if (nl !== -1) {
        newline = replaceTo;
        replaceTo = add32(replaceTo, nl);
      } else {
        replaceTo = add32(replaceTo, w);
      }
    }
    if (newline !== -1) {
      replaceTo = newline;
    } else {
      rep.byte(10);
    }
    for (; i < lineCount; i++) {
      if (i < 0 || i >= ls.length - 1) {
        fault();
        return -1;
      }
      const a = ls[i];
      const e = sub32(ls[i + 1], 1);
      let p = a;
      while (p < e) {
        const w = jpWsLen(o, e, p);
        if (w <= 0) {
          break; // never negative
        }
        p = add32(p, w);
      }
      if (p === e) {
        rep.byte(10);
      } else {
        if (newline === -1) {
          rep.range(o, a, p);
        }
        break;
      }
    }
    repFrom.push(replaceFrom);
    repTo.push(replaceTo);
    reps.push(rep);
  }
  // applyReplacements: the regions are disjoint and in order.
  out.n = 0;
  let at = 0;
  for (let r = 0; r < reps.length && r < repFrom.length && r < repTo.length; r++) {
    if (repFrom[r] < at) {
      return -1;
    }
    out.range(text, at, repFrom[r]);
    if (r >= reps.length || r >= repTo.length) {
      fault();
      return -1;
    }
    const rep = reps[r];
    out.range(rep.buf, 0, rep.n);
    if (r >= repTo.length) {
      fault();
      return -1;
    }
    at = repTo[r];
  }
  out.range(text, at, n);
  if (out.n !== n) {
    return 1;
  }
  const ob = out.buf;
  if (n > ob.length || n > text.length) {
    fault();
    return -1;
  }
  for (let p = 0; p < n && p < ob.length && p < text.length; p++) {
    if (ob[p] !== text[p]) {
      return 1;
    }
  }
  return 0;
};
