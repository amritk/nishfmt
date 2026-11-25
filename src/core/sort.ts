// A stable merge sort that cannot panic, for the modules held to no panic.
//
// Ported from Nish 0.45.1's std/sort.ts (MIT License, Copyright (c) 2026 Nish
// contributors), the sort `xs.sort(cmp)` compiles to. Its one allocation is a
// `new Array<T>(n)` the compiler checks, so a call from a no-panic module is
// refused; this copy builds its scratch with `push` and computes its run
// arithmetic in u32 where std uses `nish:unsafe`. The order is std's: for a
// comparator that is a consistent total preorder any stable sort gives the
// one answer, and this one also merges and breaks ties exactly as std does.

/** The length of the runs insertion sort makes before the first merge. */
const SORT_RUN: i32 = 32;

/**
 * `lo + step`, or `n` when that is not below `n`. Every caller has
 * `0 <= lo <= n` and a positive `step`, so the u32 sum is the true one.
 */
const sortStepTo = (lo: i32, step: i32, n: i32): i32 => {
  if (lo < 0 || lo > n || step < 0) {
    return n;
  }
  // `0 <= lo <= n`, so both u32 results are the true ones.
  const room = toI32(toU32(n) - toU32(lo));
  return room > step ? toI32(toU32(lo) + toU32(step)) : n;
};

/**
 * `src[lo..hi)` sorted by insertion into `dst[lo..hi)`. The comparator call
 * forgets every array length, so each access after it repeats its guard.
 */
const sortInsertionRun = <T>(src: T[], dst: T[], cmp: (a: T, b: T) => i32, lo: i32, hi: i32): void => {
  // A strictly descending run is copied reversed: no two of its elements are
  // equal, so reversing it keeps the sort stable.
  if (lo < 0 || hi <= lo) {
    return;
  }
  let d = lo + 1;
  while (d > 0 && d < hi && d < src.length) {
    const p = d - 1;
    if (!(cmp(src[p], src[d]) > 0)) {
      break;
    }
    d = d + 1;
  }
  if (d >= hi) {
    // `hi > lo >= 0`, so the u32 difference is the true one.
    let r = toI32(toU32(hi) - 1);
    for (let k: i32 = lo; k < hi && k < dst.length && r >= 0 && r < src.length; k++) {
      dst[k] = src[r];
      // `r >= 0`, so the u32 difference is the true one, -1 at the end.
      r = toI32(toU32(r) - 1);
    }
    return;
  }
  for (let i: i32 = lo; i < hi; i++) {
    let j = i;
    while (j > lo && j > 0 && j < dst.length && i < src.length) {
      const k = j - 1;
      if (!(cmp(dst[k], src[i]) > 0) || k < 0 || k >= dst.length || j >= dst.length) {
        break;
      }
      dst[j] = dst[k];
      j = k;
    }
    if (i < src.length && j >= 0 && j < dst.length) {
      dst[j] = src[i];
    }
  }
};

/** `src[lo..hi)` copied into `dst[lo..hi)`. */
const sortCopyRun = <T>(src: T[], dst: T[], lo: i32, hi: i32): void => {
  for (let k: i32 = lo; k >= 0 && k < hi && k < src.length && k < dst.length; k++) {
    dst[k] = src[k];
  }
};

/**
 * The sorted runs `src[lo..mid)` and `src[mid..hi)` merged into `dst[lo..hi)`,
 * or copied when the last of the left run is not after the first of the right.
 */
const sortMergeRuns = <T>(src: T[], dst: T[], cmp: (a: T, b: T) => i32, lo: i32, mid: i32, hi: i32): void => {
  if (lo < 0 || mid < lo || hi < mid) {
    return;
  }
  if (mid > 0 && mid < hi && mid < src.length) {
    const last = mid - 1;
    if (last < src.length && !(cmp(src[last], src[mid]) > 0)) {
      sortCopyRun(src, dst, lo, hi);
      return;
    }
  }
  let i = lo;
  let j = mid;
  for (let k: i32 = lo; k < hi; k++) {
    let right = i >= mid;
    if (!right && j < hi && i >= 0 && i < src.length && j >= 0 && j < src.length) {
      right = cmp(src[i], src[j]) > 0;
    }
    if (right) {
      if (j >= 0 && j < src.length && k < dst.length) {
        dst[k] = src[j];
      }
      // `j` steps at most `hi - mid` times from `mid`, so it stays at most `hi`.
      if (j < hi) {
        j = j + 1;
      }
    } else {
      if (i >= 0 && i < src.length && k < dst.length) {
        dst[k] = src[i];
      }
      // `i` steps at most `mid - lo` times from `lo`, so it stays at most `mid`.
      if (i < mid) {
        i = i + 1;
      }
    }
  }
};

/** One bottom-up pass: every pair of adjacent `width`-runs of `src` merged into `dst`. */
const sortMergePass = <T>(src: T[], dst: T[], cmp: (a: T, b: T) => i32, n: i32, width: i32): void => {
  let lo: i32 = 0;
  while (lo >= 0 && lo < n) {
    const mid = sortStepTo(lo, width, n);
    const hi = sortStepTo(mid, width, n);
    sortMergeRuns(src, dst, cmp, lo, mid, hi);
    lo = hi;
  }
};

/**
 * Sorts `xs` in place by `cmp`, stably, as `xs.sort(cmp)` does.
 *
 * @param xs the array to sort; its elements are rearranged in place.
 * @param cmp compares an earlier element with a later one: a positive answer
 *   puts the later one first, and anything else keeps their order.
 */
export const stableSort = <T>(xs: T[], cmp: (a: T, b: T) => i32): void => {
  const n: i32 = toI32(xs.length);
  if (n < 2) {
    return;
  }
  const tmp: T[] = [];
  for (const x of xs) {
    tmp.push(x);
  }
  let lo: i32 = 0;
  while (lo >= 0 && lo < n) {
    const hi = sortStepTo(lo, SORT_RUN, n);
    sortInsertionRun(tmp, xs, cmp, lo, hi);
    lo = hi;
  }
  let inTmp = false;
  let width: i32 = SORT_RUN;
  while (width > 0 && width < n) {
    if (inTmp) {
      sortMergePass(tmp, xs, cmp, n, width);
    } else {
      sortMergePass(xs, tmp, cmp, n, width);
    }
    inTmp = !inTmp;
    width = sortStepTo(width, width, n);
  }
  if (inTmp) {
    sortCopyRun(tmp, xs, 0, n);
  }
};
