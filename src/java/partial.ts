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

import { Out } from "../core/out";
import { JlEngine } from "./layout/engine";
import { GInput } from "../gdoc/input";

/** The byte length of a CharMatcher.whitespace() character at `i`, or 0. */
const jpWsLen = (s: u8[], n: i32, i: i32): i32 => {
  const c = toI32(s[i]);
  if (c < 0x80) {
    return c === 32 || c === 9 || c === 10 || c === 13 || c === 12 || c === 11 ? 1 : 0;
  }
  const c1 = i + 1 < n ? toI32(s[i + 1]) : 0;
  if (c === 0xc2 && (c1 === 0x85 || c1 === 0xa0)) {
    return 2;
  }
  if (i + 2 >= n) {
    return 0;
  }
  const c2 = toI32(s[i + 2]);
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
  const c = toI32(s[i]);
  if (c === 13) {
    return i + 1 < n && toI32(s[i + 1]) === 10 ? 2 : 1;
  }
  return c === 10 ? 1 : -1;
};

/** A TreeRangeSet of closed-open ranges: sorts them and joins the connected ones. */
const jpCoalesce = (los: i32[], his: i32[]): void => {
  const n = toI32(los.length);
  for (let i = 1; i < n; i++) {
    const lo = los[i];
    const hi = his[i];
    let j = i - 1;
    while (j >= 0 && los[j] > lo) {
      los[j + 1] = los[j];
      his[j + 1] = his[j];
      j--;
    }
    los[j + 1] = lo;
    his[j + 1] = hi;
  }
  let m = 0;
  for (let i = 0; i < n; i++) {
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
    los.pop();
    his.pop();
  }
};

/** JavaOutput.startTok: the token's first numbered tok. */
const jpStartTok = (inp: GInput, k: i32): i32 => {
  for (let j = 0; j < inp.kBeforeN[k]; j++) {
    const t = inp.refs[inp.kBefore[k] + j];
    if (inp.tIdx[t] >= 0) {
      return t;
    }
  }
  return inp.kTok[k];
};

/** JavaOutput.endTok: the token's last numbered tok. */
const jpEndTok = (inp: GInput, k: i32): i32 => {
  for (let j = inp.kAfterN[k] - 1; j >= 0; j--) {
    const t = inp.refs[inp.kAfter[k] + j];
    if (inp.tIdx[t] >= 0) {
      return t;
    }
  }
  return inp.kTok[k];
};

/** makeKToIJ(output).get(k): the output lines holding tok number k, as lo (or -1) and hi. */
class JpLines {
  lo: i32 = -1;
  hi: i32 = -1;
}

const jpKToJ = (g: JlEngine, k: i32, r: JpLines): void => {
  r.lo = -1;
  r.hi = -1;
  const ijN = g.nOutLines;
  for (let ij = 0; ij <= ijN && ij < g.nLineR; ij++) {
    const lo = g.lineRLo[ij];
    if (lo >= 0 && lo <= k && k < g.lineRHi[ij]) {
      if (r.lo < 0) {
        r.lo = ij;
      }
      r.hi = ij + 1;
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
  // characterRangesToTokenRanges: the tokens whose span meets each range.
  const tLo: i32[] = [];
  const tHi: i32[] = [];
  for (let r = 0; r + 1 < toI32(ranges.length); r += 2) {
    const a = ranges[r];
    let b = ranges[r + 1];
    if (b > n) {
      return -1;
    }
    if (b <= a) {
      b = a + 1;
    }
    let lo = 0;
    let hi = nTokens;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (inp.kSpanEnd[mid] >= a) {
        hi = mid;
      } else {
        lo = mid + 1;
      }
    }
    if (lo >= nTokens || inp.kSpanStart[lo] >= b) {
      continue;
    }
    let last = lo;
    while (last + 1 < nTokens && inp.kSpanStart[last + 1] < b) {
      last++;
    }
    tLo.push(inp.tIdx[inp.kTok[lo]]);
    tHi.push(inp.tIdx[inp.kTok[last]] + 1);
  }
  jpCoalesce(tLo, tHi);
  // getFormatReplacements: each token range, within [0, kN], grown to the marked regions.
  const bLo: i32[] = [];
  const bHi: i32[] = [];
  for (let i = 0; i < toI32(tLo.length); i++) {
    const lo = tLo[i] < 0 ? 0 : tLo[i];
    const hi = tHi[i] > kN + 1 ? kN + 1 : tHi[i];
    if (lo >= hi) {
      continue;
    }
    let pa = -1;
    let pb = -1;
    for (let p = 0; p < g.nPf; p++) {
      if (g.pfLo[p] <= lo && lo <= g.pfHi[p]) {
        pa = p;
      }
      if (g.pfLo[p] <= hi - 1 && hi - 1 <= g.pfHi[p]) {
        pb = p;
      }
    }
    if (pa < 0 || pb < 0) {
      continue; // the range holds only whitespace
    }
    bLo.push(g.pfLo[pa]);
    bHi.push(g.pfHi[pb] + 1);
  }
  jpCoalesce(bLo, bHi);
  // The output's lines.
  const o = g.out.buf;
  const lineCount = g.nOutLines;
  const ls = new Array<i32>(lineCount + 1);
  {
    let j = 0;
    ls[0] = 0;
    for (let p = 0; p < g.out.n && j < lineCount; p++) {
      if (toI32(o[p]) === 10) {
        j++;
        ls[j] = p + 1;
      }
    }
  }
  // Line i is o[ls[i], ls[i + 1] - 1).
  const repFrom: i32[] = [];
  const repTo: i32[] = [];
  const reps: Out[] = [];
  const kj = new JpLines();
  for (let r = 0; r < toI32(bLo.length); r++) {
    const st = jpStartTok(inp, inp.kToToken[bLo[r]]);
    const et = jpEndTok(inp, inp.kToToken[bHi[r] - 1]);
    const rep = new Out(256);
    let replaceFrom = inp.tPos[st];
    while (replaceFrom > 0) {
      const w = jpWsBefore(text, n, replaceFrom);
      if (w === 0) {
        break;
      }
      replaceFrom -= w;
    }
    jpKToJ(g, inp.tIdx[st], kj);
    if (kj.lo < 0) {
      return -1;
    }
    let i = kj.lo;
    while (i > 0 && ls[i] - ls[i - 1] === 1) {
      i--;
    }
    jpKToJ(g, inp.tIdx[et], kj);
    if (kj.lo < 0) {
      return -1;
    }
    for (; i < kj.hi; i++) {
      if (i < lineCount) {
        if (i > 0) {
          rep.byte(10);
        }
        rep.range(o, ls[i], ls[i + 1] - 1);
      }
    }
    let replaceTo = inp.tEnd[et] < n ? inp.tEnd[et] : n;
    if (inp.tIdx[et] === kN - 1) {
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
        replaceTo += nl;
      } else {
        replaceTo += w;
      }
    }
    if (newline !== -1) {
      replaceTo = newline;
    } else {
      rep.byte(10);
    }
    for (; i < lineCount; i++) {
      const a = ls[i];
      const e = ls[i + 1] - 1;
      let p = a;
      while (p < e) {
        const w = jpWsLen(o, e, p);
        if (w === 0) {
          break;
        }
        p += w;
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
  for (let r = 0; r < toI32(reps.length); r++) {
    if (repFrom[r] < at) {
      return -1;
    }
    out.range(text, at, repFrom[r]);
    out.range(reps[r].buf, 0, reps[r].n);
    at = repTo[r];
  }
  out.range(text, at, n);
  if (out.n !== n) {
    return 1;
  }
  for (let p = 0; p < n; p++) {
    if (out.buf[p] !== text[p]) {
      return 1;
    }
  }
  return 0;
};
