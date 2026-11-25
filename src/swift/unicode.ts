// Swift's Character semantics for the Swift port: extended grapheme clusters
// (String.count, UAX #29) and the case tests SwiftFormat makes on characters
// (Character.isUppercase, String(c).uppercased() == String(c)), from the
// generated table in unicode_data.ts.
//
// A code point the table marks uncertain (unassigned in the Unicode version the
// table was made from, or a virama, which the newer Indic conjunct rule GB9c
// depends on) sets SW_UNI_UNCERTAIN; formatSwift then leaves the file alone.

import { fault } from "../core/fault";
import { SW_UNI_ENTRIES, SW_UNI_TABLE } from "./unicode_data";

export const SW_GCB_OTHER: i32 = 0;
const SW_GCB_CR: i32 = 1;
const SW_GCB_LF: i32 = 2;
const SW_GCB_CONTROL: i32 = 3;
const SW_GCB_EXTEND: i32 = 4;
const SW_GCB_ZWJ: i32 = 5;
const SW_GCB_RI: i32 = 6;
const SW_GCB_PREPEND: i32 = 7;
const SW_GCB_SPACING_MARK: i32 = 8;
const SW_GCB_L: i32 = 9;
const SW_GCB_V: i32 = 10;
const SW_GCB_T: i32 = 11;
const SW_GCB_LV: i32 = 12;
const SW_GCB_LVT: i32 = 13;

const SW_UNI_EXT_PICT: i32 = 16;
const SW_UNI_UNSURE: i32 = 32;
const SW_UNI_UPPER: i32 = 64;
const SW_UNI_LOWER: i32 = 128;
const SW_UNI_TITLE: i32 = 256;
const SW_UNI_UPPER_CHANGES: i32 = 512;
const SW_UNI_LOWER_CHANGES: i32 = 1024;

const SW_UNI_START = new Int32Array(8192);
const SW_UNI_VALUE = new Int32Array(8192);
const SW_UNI_READY = new Int32Array(1);
// Set when a count or case test met an uncertain code point; formatSwift resets and reads it.
export const SW_UNI_UNCERTAIN = new Int32Array(1);

const swUniFlagFill = (flag: Int32Array, v: i32): void => {
  for (let i = 0; i < flag.length; i++) {
    flag[i] = v;
  }
};

const swUniFlagRead = (flag: Int32Array): i32 => (flag.length > 0 ? flag[0] : 0);

/** Sets SW_UNI_UNCERTAIN: the file is left alone. */
export const swUniMarkUncertain = (): void => {
  swUniFlagFill(SW_UNI_UNCERTAIN, 1);
};

/** Clears SW_UNI_UNCERTAIN before a file is formatted. */
export const swUniResetUncertain = (): void => {
  swUniFlagFill(SW_UNI_UNCERTAIN, 0);
};

/** Whether SW_UNI_UNCERTAIN is set. */
export const swUniIsUncertain = (): boolean => swUniFlagRead(SW_UNI_UNCERTAIN) !== 0;

/** Parses SW_UNI_TABLE into starts and values; false after a fault. */
const swUniFill = (starts: Int32Array, values: Int32Array): boolean => {
  const t = SW_UNI_TABLE;
  const n = toI32(t.length);
  let k = 0;
  let cur = 0;
  let start = 0;
  for (let i = 0; i < n; i++) {
    const c = t.charCodeAt(i);
    if (c === 58) {
      start = cur;
      cur = 0;
    } else if (c === 44) {
      if (k < 0 || k >= starts.length || k >= values.length) {
        fault();
        return false;
      }
      starts[k] = start;
      values[k] = cur;
      k++;
      cur = 0;
    } else {
      // The table's hex numbers are code points and property bits, below 2^24.
      if (cur < 0 || cur >= 0x1000000) {
        fault();
        return false;
      }
      // A hex digit, 0-9 or a-f: cur * 16 + digit is (cur << 4) | digit.
      const d = c & 0xff;
      const digit = d <= 57 ? d - 48 : d - 87;
      if (digit < 0 || digit > 15) {
        fault();
        return false;
      }
      cur = (cur << 4) | digit;
    }
  }
  if (k < 0 || k >= starts.length || k >= values.length) {
    fault();
    return false;
  }
  starts[k] = start;
  values[k] = cur;
  return true;
};

const swUniInit = (): void => {
  if (swUniFlagRead(SW_UNI_READY) === 1) {
    return;
  }
  if (swUniFill(SW_UNI_START, SW_UNI_VALUE)) {
    swUniFlagFill(SW_UNI_READY, 1);
  }
};

/** The table value for code point cp, by binary search of starts. */
const swUniLookup = (starts: Int32Array, values: Int32Array, cp: i32): i32 => {
  let lo = 0;
  let hi = SW_UNI_ENTRIES - 1;
  while (lo < hi) {
    // lo and hi stay within [0, SW_UNI_ENTRIES), so the u32 sum is exact.
    const mid = toI32((toU32(lo) + toU32(hi) + 1) >> 1);
    if (mid < 0 || mid >= starts.length) {
      fault();
      return 0;
    }
    if (starts[mid] <= cp) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  if (lo < 0 || lo >= values.length) {
    fault();
    return 0;
  }
  const v = values[lo];
  if ((v & SW_UNI_UNSURE) !== 0) {
    swUniMarkUncertain();
  }
  return v;
};

/** The table value for code point cp. */
export const swUniProps = (cp: i32): i32 => {
  swUniInit();
  return swUniLookup(SW_UNI_START, SW_UNI_VALUE, cp);
};

/** The code point at byte i of s (valid UTF-8). */
export const swUniCpAt = (s: string, i: i32): i32 => {
  const n = toI32(s.length);
  if (i < 0 || i >= n) {
    fault();
    return 0;
  }
  const c = s.charCodeAt(i);
  if (c < 0x80) {
    return c;
  }
  const i1 = i + 1;
  if (i1 >= n) {
    fault();
    return 0;
  }
  const b1 = s.charCodeAt(i1) & 0x3f;
  if (c < 0xe0) {
    return ((c & 0x1f) << 6) | b1;
  }
  const i2 = i1 + 1;
  if (i2 >= n) {
    fault();
    return 0;
  }
  const b2 = s.charCodeAt(i2) & 0x3f;
  if (c < 0xf0) {
    return ((c & 0x0f) << 12) | (b1 << 6) | b2;
  }
  const i3 = i2 + 1;
  if (i3 >= n) {
    fault();
    return 0;
  }
  return ((c & 0x07) << 18) | (b1 << 12) | (b2 << 6) | (s.charCodeAt(i3) & 0x3f);
};

const swUniLen = (c: i32): i32 => (c < 0x80 ? 1 : c < 0xe0 ? 2 : c < 0xf0 ? 3 : 4);

/** Grapheme cluster segmentation state between two code points. */
class SwGraphemeState {
  prev: i32 = -1;
  // GB11: 1 after ExtPict Extend*, 2 after ExtPict Extend* ZWJ.
  pict: i32 = 0;
  // GB12/13: the number of regional indicators ending at prev.
  ri: i32 = 0;
}

/** Whether there is a grapheme cluster boundary before code point props `v`; advances the state. */
const swGraphemeBreak = (st: SwGraphemeState, v: i32): boolean => {
  const cur = v & 15;
  const prev = st.prev;
  let brk = true;
  if (prev < 0) {
    brk = true;
  } else if (prev === SW_GCB_CR && cur === SW_GCB_LF) {
    brk = false;
  } else if (prev === SW_GCB_CONTROL || prev === SW_GCB_CR || prev === SW_GCB_LF) {
    brk = true;
  } else if (cur === SW_GCB_CONTROL || cur === SW_GCB_CR || cur === SW_GCB_LF) {
    brk = true;
  } else if (prev === SW_GCB_L && (cur === SW_GCB_L || cur === SW_GCB_V || cur === SW_GCB_LV || cur === SW_GCB_LVT)) {
    brk = false;
  } else if ((prev === SW_GCB_LV || prev === SW_GCB_V) && (cur === SW_GCB_V || cur === SW_GCB_T)) {
    brk = false;
  } else if ((prev === SW_GCB_LVT || prev === SW_GCB_T) && cur === SW_GCB_T) {
    brk = false;
  } else if (cur === SW_GCB_EXTEND || cur === SW_GCB_ZWJ || cur === SW_GCB_SPACING_MARK) {
    brk = false;
  } else if (prev === SW_GCB_PREPEND) {
    brk = false;
  } else if (prev === SW_GCB_ZWJ && st.pict === 2 && (v & SW_UNI_EXT_PICT) !== 0) {
    brk = false;
  } else if (prev === SW_GCB_RI && cur === SW_GCB_RI && st.ri % 2 === 1) {
    brk = false;
  }
  if ((v & SW_UNI_EXT_PICT) !== 0) {
    st.pict = 1;
  } else if (cur === SW_GCB_EXTEND && st.pict === 1) {
    st.pict = 1;
  } else if (cur === SW_GCB_ZWJ && st.pict === 1) {
    st.pict = 2;
  } else {
    st.pict = 0;
  }
  if (cur === SW_GCB_RI) {
    // A count of the code points of one string: below 2^31 - 1.
    st.ri = toI32(toU32(st.ri) + 1);
  } else {
    st.ri = 0;
  }
  st.prev = cur;
  return brk;
};

/** String.count: the number of extended grapheme clusters in s. */
export const swGraphemeCount = (s: string): i32 => {
  const n = toI32(s.length);
  let ascii = true;
  for (let i = 0; i < n; i++) {
    if (s.charCodeAt(i) >= 0x80) {
      ascii = false;
      break;
    }
  }
  if (ascii) {
    let count = n;
    for (let i = 1; i < n; i++) {
      if (s.charCodeAt(i) === 10 && s.charCodeAt(i - 1) === 13 && count > 0) {
        count--;
      }
    }
    return count;
  }
  const st = new SwGraphemeState();
  let count = 0;
  let i = 0;
  // i < n and count <= i, so the u32 sums below are exact.
  while (i >= 0 && i < n) {
    const c = s.charCodeAt(i);
    const v = swUniProps(swUniCpAt(s, i));
    if (swGraphemeBreak(st, v)) {
      count = toI32(toU32(count) + 1);
    }
    i = toI32(toU32(i) + toU32(swUniLen(c)));
  }
  return count;
};

/** The byte end of the Character (grapheme cluster) starting at byte i of s. */
export const swCharacterEnd = (s: string, i0: i32): i32 => {
  const n = toI32(s.length);
  const st = new SwGraphemeState();
  if (i0 < 0) {
    fault();
    return n;
  }
  let i = i0;
  // i < n, so the u32 sum is exact.
  while (i >= 0 && i < n) {
    const v = swUniProps(swUniCpAt(s, i));
    if (swGraphemeBreak(st, v) && i > i0) {
      return i;
    }
    i = toI32(toU32(i) + toU32(swUniLen(s.charCodeAt(i))));
  }
  return n;
};

/** String(c).uppercased() == String(c) for the Character starting at byte i of s. */
export const swCharacterUppercaseInvariant = (s: string, i: i32): boolean => {
  const n = toI32(s.length);
  if (i < 0 || i >= n) {
    fault();
    return false;
  }
  const c = s.charCodeAt(i);
  const e = c < 0x80 && (i + 1 >= n || s.charCodeAt(i + 1) < 0x80) ? i + 1 : swCharacterEnd(s, i);
  let j = i;
  // e <= n, and j < n keeps the u32 sum below exact.
  while (j >= 0 && j < e && j < n) {
    const d = s.charCodeAt(j);
    if (d < 0x80) {
      if (d >= 97 && d <= 122) {
        return false;
      }
    } else if ((swUniProps(swUniCpAt(s, j)) & SW_UNI_UPPER_CHANGES) !== 0) {
      return false;
    }
    j = toI32(toU32(j) + toU32(swUniLen(d)));
  }
  return true;
};

/** Character.isUppercase for the Character starting at byte i of s. */
export const swCharacterIsUppercase = (s: string, i: i32): boolean => {
  const n = toI32(s.length);
  if (i < 0 || i >= n) {
    fault();
    return false;
  }
  const c = s.charCodeAt(i);
  if (c < 0x80 && (i + 1 >= n || s.charCodeAt(i + 1) < 0x80)) {
    return c >= 65 && c <= 90;
  }
  const e = swCharacterEnd(s, i);
  const first = swUniProps(swUniCpAt(s, i));
  // i < n, so the u32 sums in this function are exact.
  if (e === toI32(toU32(i) + toU32(swUniLen(c)))) {
    // One scalar: its Uppercase property, or cased and unchanged by uppercasing.
    if ((first & SW_UNI_UPPER) !== 0) {
      return true;
    }
    const cased = (first & (SW_UNI_UPPER | SW_UNI_LOWER | SW_UNI_TITLE)) !== 0;
    return cased && (first & SW_UNI_UPPER_CHANGES) === 0;
  }
  // Several scalars: uppercased() == self and lowercased() != self.
  let upperChanges = false;
  let lowerChanges = false;
  let j = i;
  while (j >= 0 && j < e && j < n) {
    const d = s.charCodeAt(j);
    const v =
      d < 0x80
        ? d >= 65 && d <= 90
          ? SW_UNI_LOWER_CHANGES
          : d >= 97 && d <= 122
            ? SW_UNI_UPPER_CHANGES
            : 0
        : swUniProps(swUniCpAt(s, j));
    if ((v & SW_UNI_UPPER_CHANGES) !== 0) {
      upperChanges = true;
    }
    if ((v & SW_UNI_LOWER_CHANGES) !== 0) {
      lowerChanges = true;
    }
    j = toI32(toU32(j) + toU32(swUniLen(d)));
  }
  return !upperChanges && lowerChanges;
};

/** Whether the scalar at byte i of s continues the Character before it (where byte-wise and
 *  Character-wise string operations would disagree). */
export const swUniJoinsPrevious = (s: string, i: i32): boolean => {
  const n = toI32(s.length);
  if (i <= 0 || i >= n) {
    return false;
  }
  let p = i - 1;
  while (p > 0 && p < n && (s.charCodeAt(p) & 0xc0) === 0x80) {
    p--;
  }
  if (p < 0 || p >= n) {
    fault();
    return false;
  }
  return (s.charCodeAt(i) >= 0x80 || s.charCodeAt(p) >= 0x80) && swCharacterEnd(s, p) > i;
};

/** Marks the file uncertain when a Character boundary among the first `upto` bytes of s is not
 *  where a byte-wise operation would put it. */
export const swUniCheckPrefix = (s: string, upto: i32): void => {
  const len = toI32(s.length);
  const n = len < upto ? len : upto;
  for (let i = 1; i < n && i < len; i++) {
    if (
      (s.charCodeAt(i) >= 0x80 || s.charCodeAt(i - 1) >= 0x80) &&
      (s.charCodeAt(i) & 0xc0) !== 0x80 &&
      swUniJoinsPrevious(s, i)
    ) {
      swUniMarkUncertain();
      return;
    }
  }
};
