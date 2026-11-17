// Swift's Character semantics for the Swift port: extended grapheme clusters
// (String.count, UAX #29) and the case tests SwiftFormat makes on characters
// (Character.isUppercase, String(c).uppercased() == String(c)), from the
// generated table in unicode_data.ts.
//
// A code point the table marks uncertain (unassigned in the Unicode version the
// table was made from, or a virama, which the newer Indic conjunct rule GB9c
// depends on) sets SW_UNI_UNCERTAIN; formatSwift then leaves the file alone.

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

const swHexDigit = (c: i32): i32 => (c <= 57 ? c - 48 : c - 87);

const swUniInit = (): void => {
  if (SW_UNI_READY[0] === 1) {
    return;
  }
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
      SW_UNI_START[k] = start;
      SW_UNI_VALUE[k] = cur;
      k++;
      cur = 0;
    } else {
      cur = cur * 16 + swHexDigit(c);
    }
  }
  SW_UNI_START[k] = start;
  SW_UNI_VALUE[k] = cur;
  SW_UNI_READY[0] = 1;
};

/** The table value for code point cp. */
export const swUniProps = (cp: i32): i32 => {
  swUniInit();
  let lo = 0;
  let hi = SW_UNI_ENTRIES - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (SW_UNI_START[mid] <= cp) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  const v = SW_UNI_VALUE[lo];
  if ((v & SW_UNI_UNSURE) !== 0) {
    SW_UNI_UNCERTAIN[0] = 1;
  }
  return v;
};

/** The code point at byte i of s (valid UTF-8). */
export const swUniCpAt = (s: string, i: i32): i32 => {
  const c = s.charCodeAt(i);
  if (c < 0x80) {
    return c;
  }
  if (c < 0xe0) {
    return ((c & 0x1f) << 6) | (s.charCodeAt(i + 1) & 0x3f);
  }
  if (c < 0xf0) {
    return ((c & 0x0f) << 12) | ((s.charCodeAt(i + 1) & 0x3f) << 6) | (s.charCodeAt(i + 2) & 0x3f);
  }
  return (
    ((c & 0x07) << 18) |
    ((s.charCodeAt(i + 1) & 0x3f) << 12) |
    ((s.charCodeAt(i + 2) & 0x3f) << 6) |
    (s.charCodeAt(i + 3) & 0x3f)
  );
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
  st.ri = cur === SW_GCB_RI ? st.ri + 1 : 0;
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
      if (s.charCodeAt(i) === 10 && s.charCodeAt(i - 1) === 13) {
        count--;
      }
    }
    return count;
  }
  const st = new SwGraphemeState();
  let count = 0;
  let i = 0;
  while (i < n) {
    const c = s.charCodeAt(i);
    const v = swUniProps(swUniCpAt(s, i));
    if (swGraphemeBreak(st, v)) {
      count++;
    }
    i += swUniLen(c);
  }
  return count;
};

/** The byte end of the Character (grapheme cluster) starting at byte i of s. */
export const swCharacterEnd = (s: string, i0: i32): i32 => {
  const n = toI32(s.length);
  const st = new SwGraphemeState();
  let i = i0;
  while (i < n) {
    const v = swUniProps(swUniCpAt(s, i));
    if (swGraphemeBreak(st, v) && i > i0) {
      return i;
    }
    i += swUniLen(s.charCodeAt(i));
  }
  return n;
};

/** String(c).uppercased() == String(c) for the Character starting at byte i of s. */
export const swCharacterUppercaseInvariant = (s: string, i: i32): boolean => {
  const c = s.charCodeAt(i);
  const e = c < 0x80 && (i + 1 >= toI32(s.length) || s.charCodeAt(i + 1) < 0x80) ? i + 1 : swCharacterEnd(s, i);
  let j = i;
  while (j < e) {
    const d = s.charCodeAt(j);
    if (d < 0x80) {
      if (d >= 97 && d <= 122) {
        return false;
      }
    } else if ((swUniProps(swUniCpAt(s, j)) & SW_UNI_UPPER_CHANGES) !== 0) {
      return false;
    }
    j += swUniLen(d);
  }
  return true;
};

/** Character.isUppercase for the Character starting at byte i of s. */
export const swCharacterIsUppercase = (s: string, i: i32): boolean => {
  const c = s.charCodeAt(i);
  if (c < 0x80 && (i + 1 >= toI32(s.length) || s.charCodeAt(i + 1) < 0x80)) {
    return c >= 65 && c <= 90;
  }
  const e = swCharacterEnd(s, i);
  const first = swUniProps(swUniCpAt(s, i));
  if (e === i + swUniLen(c)) {
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
  while (j < e) {
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
    j += swUniLen(d);
  }
  return !upperChanges && lowerChanges;
};

/** Whether the scalar at byte i of s continues the Character before it (where byte-wise and
 *  Character-wise string operations would disagree). */
export const swUniJoinsPrevious = (s: string, i: i32): boolean => {
  if (i <= 0 || i >= toI32(s.length)) {
    return false;
  }
  let p = i - 1;
  while (p > 0 && (s.charCodeAt(p) & 0xc0) === 0x80) {
    p--;
  }
  return (s.charCodeAt(i) >= 0x80 || s.charCodeAt(p) >= 0x80) && swCharacterEnd(s, p) > i;
};

/** Marks the file uncertain when a Character boundary among the first `upto` bytes of s is not
 *  where a byte-wise operation would put it. */
export const swUniCheckPrefix = (s: string, upto: i32): void => {
  const n = toI32(s.length) < upto ? toI32(s.length) : upto;
  for (let i = 1; i < n; i++) {
    if (
      (s.charCodeAt(i) >= 0x80 || s.charCodeAt(i - 1) >= 0x80) &&
      (s.charCodeAt(i) & 0xc0) !== 0x80 &&
      swUniJoinsPrevious(s, i)
    ) {
      SW_UNI_UNCERTAIN[0] = 1;
      return;
    }
  }
};
