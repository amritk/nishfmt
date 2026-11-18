// The display width of a string, as unicode-width's `UnicodeWidthStr::width`
// (rustfmt's unicode_str_width) counts it: code point widths from the crate's
// tables (uwidth_table.ts), and the sequences it treats as one glyph, such as
// emoji ZWJ sequences, emoji modifiers, variation selectors, regional
// indicator pairs and a few ligatures.
//
// Ported from unicode-width 0.1.14 (MIT OR Apache-2.0, Copyright The Rust
// Project Developers): src/tables.rs, without the cjk feature.

import { RS_UWIDTH_NRUNS, RS_UWIDTH_RUNS } from "./uwidth_table";

// WidthInfo.
const WI_DEFAULT: i32 = 0;
const WI_LINE_FEED: i32 = 0x0001;
const WI_EMOJI_MODIFIER: i32 = 0x0002;
const WI_REGIONAL_INDICATOR: i32 = 0x0003;
const WI_SEVERAL_REGIONAL_INDICATOR: i32 = 0x0004;
const WI_EMOJI_PRESENTATION: i32 = 0x0005;
const WI_ZWJ_EMOJI_PRESENTATION: i32 = 0x1006;
const WI_VS16_ZWJ_EMOJI_PRESENTATION: i32 = 0x9006;
const WI_KEYCAP_ZWJ_EMOJI_PRESENTATION: i32 = 0x1007;
const WI_VS16_KEYCAP_ZWJ_EMOJI_PRESENTATION: i32 = 0x9007;
const WI_REGIONAL_INDICATOR_ZWJ_PRESENTATION: i32 = 0x0009;
const WI_EVEN_REGIONAL_INDICATOR_ZWJ_PRESENTATION: i32 = 0x000a;
const WI_ODD_REGIONAL_INDICATOR_ZWJ_PRESENTATION: i32 = 0x000b;
const WI_TAG_END_ZWJ_EMOJI_PRESENTATION: i32 = 0x0010;
const WI_TAG_D1_END_ZWJ_EMOJI_PRESENTATION: i32 = 0x0011;
const WI_TAG_D2_END_ZWJ_EMOJI_PRESENTATION: i32 = 0x0012;
const WI_TAG_D3_END_ZWJ_EMOJI_PRESENTATION: i32 = 0x0013;
const WI_TAG_A1_END_ZWJ_EMOJI_PRESENTATION: i32 = 0x0019;
const WI_TAG_A2_END_ZWJ_EMOJI_PRESENTATION: i32 = 0x001a;
const WI_TAG_A3_END_ZWJ_EMOJI_PRESENTATION: i32 = 0x001b;
const WI_TAG_A4_END_ZWJ_EMOJI_PRESENTATION: i32 = 0x001c;
const WI_TAG_A5_END_ZWJ_EMOJI_PRESENTATION: i32 = 0x001d;
const WI_TAG_A6_END_ZWJ_EMOJI_PRESENTATION: i32 = 0x001e;
const WI_VARIATION_SELECTOR_16: i32 = 0x8000;
const WI_JOINING_GROUP_ALEF: i32 = 0x30ff;
const WI_ZWJ_HEBREW_LETTER_LAMED: i32 = 0x3c00;
const WI_ZWJ_BUGINESE_LETTER_YA: i32 = 0x3c01;
const WI_BUGINESE_VOWEL_SIGN_I_ZWJ_LETTER_YA: i32 = 0x3c02;
const WI_TIFINAGH_CONSONANT: i32 = 0x3803;
const WI_ZWJ_TIFINAGH_CONSONANT: i32 = 0x3c03;
const WI_TIFINAGH_JOINER_CONSONANT: i32 = 0x3c04;
const WI_LISU_TONE_LETTER_MYA_NA_JEU: i32 = 0x3c05;
const WI_ZWJ_OLD_TURKIC_LETTER_ORKHON_I: i32 = 0x3c06;
const WI_KHMER_COENG_ELIGIBLE_LETTER: i32 = 0x3c07;

// The flags of a code point in the table.
const UF_TRANSPARENT_ZERO_WIDTH: i32 = 1;
const UF_LIGATURE_TRANSPARENT: i32 = 2;
const UF_EMOJI_PRESENTATION_SEQ: i32 = 4;
const UF_TEXT_PRESENTATION_SEQ: i32 = 8;
const UF_EMOJI_MODIFIER_BASE: i32 = 16;

/** The `k`-th six-hex-digit number of the runs. */
const rsUwEntry = (k: i32): i32 => {
  let v = 0;
  for (let i = k * 6; i < k * 6 + 6; i++) {
    const c = RS_UWIDTH_RUNS.charCodeAt(i);
    v = v * 16 + (c <= 57 ? c - 48 : c - 87);
  }
  return v;
};

// The runs decoded on first use: first code points and packed values.
const rsUwStarts = new Int32Array(RS_UWIDTH_NRUNS);
const rsUwValues = new Int32Array(RS_UWIDTH_NRUNS);
const rsUwDecoded = new Int32Array(1);

/** The packed value of `cp` (width | info << 2 | flags << 18), by binary search over the runs. */
const rsUwSearch = (cp: i32): i32 => {
  if (rsUwDecoded[0] === 0) {
    for (let k = 0; k < RS_UWIDTH_NRUNS; k++) {
      rsUwStarts[k] = rsUwEntry(k * 2);
      rsUwValues[k] = rsUwEntry(k * 2 + 1);
    }
    rsUwDecoded[0] = 1;
  }
  let lo = 0;
  let hi = RS_UWIDTH_NRUNS - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (rsUwStarts[mid] <= cp) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return rsUwValues[lo];
};

// The packed value + 1 of the BMP code points looked up so far (0: not yet).
const rsUwCache = new Int32Array(65536);

const rsUwLookup = (cp: i32): i32 => {
  if (cp >= 65536) {
    return rsUwSearch(cp);
  }
  const c = rsUwCache[cp];
  if (c !== 0) {
    return c - 1;
  }
  const v = rsUwSearch(cp);
  rsUwCache[cp] = v + 1;
  return v;
};

const uwWidth = (v: i32): i32 => v & 3;
const uwInfo = (v: i32): i32 => (v >> 2) & 0xffff;
const uwHas = (v: i32, f: i32): boolean => ((v >> 18) & f) !== 0;

const isEmojiPresentation = (i: i32): boolean => (i & 0x8000) !== 0;
const isZwjEmojiPresentation = (i: i32): boolean => (i & 0xb000) === 0x9000;
const setEmojiPresentation = (i: i32): i32 =>
  (i & 0x2000) === 0x2000 || (i & 0x9000) === 0x1000 ? i | 0x8000 : WI_VARIATION_SELECTOR_16;
const unsetEmojiPresentation = (i: i32): i32 => ((i & 0x2000) === 0x2000 ? i & 0x7fff : WI_DEFAULT);
const isTextPresentation = (i: i32): boolean => (i & 0x4000) !== 0;
const setTextPresentation = (i: i32): i32 => ((i & 0x2000) === 0x2000 ? i | 0x4000 : 0x4000);
const unsetTextPresentation = (i: i32): i32 => i & 0xbfff;
const isLigatureTransparentInfo = (i: i32): boolean => (i & 0x0800) !== 0;

const isTagEnd = (i: i32): boolean =>
  i === WI_TAG_END_ZWJ_EMOJI_PRESENTATION ||
  i === WI_TAG_A1_END_ZWJ_EMOJI_PRESENTATION ||
  i === WI_TAG_A2_END_ZWJ_EMOJI_PRESENTATION ||
  i === WI_TAG_A3_END_ZWJ_EMOJI_PRESENTATION ||
  i === WI_TAG_A4_END_ZWJ_EMOJI_PRESENTATION;

const isTagLetterEnd = (i: i32): boolean =>
  i === WI_TAG_A3_END_ZWJ_EMOJI_PRESENTATION ||
  i === WI_TAG_A4_END_ZWJ_EMOJI_PRESENTATION ||
  i === WI_TAG_A5_END_ZWJ_EMOJI_PRESENTATION ||
  i === WI_TAG_A6_END_ZWJ_EMOJI_PRESENTATION ||
  i === WI_TAG_D3_END_ZWJ_EMOJI_PRESENTATION;

/** The fold state of str_width: the WidthInfo of what follows. */
class RsUwState {
  info: i32 = 0;
  constructor() {}

  /** width_in_str: the width code point `c` adds; sets `info` for the code point before it. */
  step(c: i32): i32 {
    let next = this.info;
    if (isEmojiPresentation(next)) {
      if (uwHas(rsUwLookup(c), UF_EMOJI_PRESENTATION_SEQ)) {
        this.info = WI_EMOJI_PRESENTATION;
        return isZwjEmojiPresentation(next) ? 0 : 2;
      }
      next = unsetEmojiPresentation(next);
    }
    if (c <= 0xa0) {
      if (c === 10) {
        this.info = WI_LINE_FEED;
        return 0;
      }
      this.info = WI_DEFAULT;
      return c === 13 && next === WI_LINE_FEED ? 0 : 1;
    }
    const v = rsUwLookup(c);
    if (next !== WI_DEFAULT) {
      const r = this.special(c, v, next);
      if (r !== -2) {
        return r;
      }
    }
    // Fallback: the code point's own width.
    this.info = uwInfo(v);
    return uwWidth(v);
  }

  /** The fast path for a non-default `next`: a width (with `info` set), or -2 to fall back to the table. */
  special(c: i32, v: i32, next0: i32): i32 {
    let next = next0;
    if (c === 0xfe0f) {
      this.info = setEmojiPresentation(next);
      return 0;
    }
    if (c === 0xfe0e) {
      this.info = setTextPresentation(next);
      return 0;
    }
    if (isTextPresentation(next)) {
      if (uwHas(v, UF_TEXT_PRESENTATION_SEQ)) {
        this.info = WI_DEFAULT;
        return 1;
      }
      next = unsetTextPresentation(next);
    }
    if (isLigatureTransparentInfo(next)) {
      if (c === 0x200d) {
        this.info = next | 0x0400;
        return 0;
      }
      if (uwHas(v, UF_LIGATURE_TRANSPARENT)) {
        this.info = next;
        return 0;
      }
    }
    const ri = c >= 0x1f1e6 && c <= 0x1f1ff;
    const tagLetter = c >= 0xe0061 && c <= 0xe007a;
    const tagDigit = c >= 0xe0030 && c <= 0xe0039;
    let w = -2;
    let ni = WI_DEFAULT;
    if (
      next === WI_JOINING_GROUP_ALEF &&
      (c === 0x644 || (c >= 0x6b5 && c <= 0x6b8) || c === 0x76a || c === 0x8a6 || c === 0x8c7)
    ) {
      // Arabic Lam-Alef ligature
      w = 0;
    } else if (next === WI_JOINING_GROUP_ALEF && uwHas(v, UF_TRANSPARENT_ZERO_WIDTH)) {
      w = 0;
      ni = WI_JOINING_GROUP_ALEF;
    } else if (next === WI_ZWJ_HEBREW_LETTER_LAMED && c === 0x5d0) {
      w = 0;
    } else if (next === WI_KHMER_COENG_ELIGIBLE_LETTER && c === 0x17d2) {
      w = -1;
    } else if (next === WI_ZWJ_BUGINESE_LETTER_YA && c === 0x1a17) {
      w = 0;
      ni = WI_BUGINESE_VOWEL_SIGN_I_ZWJ_LETTER_YA;
    } else if (next === WI_BUGINESE_VOWEL_SIGN_I_ZWJ_LETTER_YA && c === 0x1a15) {
      w = 0;
    } else if ((next === WI_TIFINAGH_CONSONANT || next === WI_ZWJ_TIFINAGH_CONSONANT) && c === 0x2d7f) {
      w = 1;
      ni = WI_TIFINAGH_JOINER_CONSONANT;
    } else if (next === WI_ZWJ_TIFINAGH_CONSONANT && ((c >= 0x2d31 && c <= 0x2d65) || c === 0x2d6f)) {
      w = 0;
    } else if (next === WI_TIFINAGH_JOINER_CONSONANT && ((c >= 0x2d31 && c <= 0x2d65) || c === 0x2d6f)) {
      w = -1;
    } else if (next === WI_LISU_TONE_LETTER_MYA_NA_JEU && c >= 0xa4f8 && c <= 0xa4fb) {
      w = 0;
    } else if (next === WI_ZWJ_OLD_TURKIC_LETTER_ORKHON_I && c === 0x10c32) {
      w = 0;
    } else if (next === WI_EMOJI_MODIFIER && uwHas(v, UF_EMOJI_MODIFIER_BASE)) {
      // Emoji modifier
      w = 0;
      ni = WI_EMOJI_PRESENTATION;
    } else if ((next === WI_REGIONAL_INDICATOR || next === WI_SEVERAL_REGIONAL_INDICATOR) && ri) {
      w = 1;
      ni = WI_SEVERAL_REGIONAL_INDICATOR;
    } else if (
      (next === WI_EMOJI_PRESENTATION ||
        next === WI_SEVERAL_REGIONAL_INDICATOR ||
        next === WI_EVEN_REGIONAL_INDICATOR_ZWJ_PRESENTATION ||
        next === WI_ODD_REGIONAL_INDICATOR_ZWJ_PRESENTATION ||
        next === WI_EMOJI_MODIFIER) &&
      c === 0x200d
    ) {
      // ZWJ emoji
      w = 0;
      ni = WI_ZWJ_EMOJI_PRESENTATION;
    } else if (next === WI_ZWJ_EMOJI_PRESENTATION && c === 0x20e3) {
      w = 0;
      ni = WI_KEYCAP_ZWJ_EMOJI_PRESENTATION;
    } else if (next === WI_VS16_ZWJ_EMOJI_PRESENTATION && uwHas(v, UF_EMOJI_PRESENTATION_SEQ)) {
      w = 0;
      ni = WI_EMOJI_PRESENTATION;
    } else if (next === WI_VS16_KEYCAP_ZWJ_EMOJI_PRESENTATION && ((c >= 48 && c <= 57) || c === 35 || c === 42)) {
      w = 0;
      ni = WI_EMOJI_PRESENTATION;
    } else if (next === WI_ZWJ_EMOJI_PRESENTATION && ri) {
      w = 1;
      ni = WI_REGIONAL_INDICATOR_ZWJ_PRESENTATION;
    } else if (
      (next === WI_REGIONAL_INDICATOR_ZWJ_PRESENTATION || next === WI_ODD_REGIONAL_INDICATOR_ZWJ_PRESENTATION) &&
      ri
    ) {
      w = -1;
      ni = WI_EVEN_REGIONAL_INDICATOR_ZWJ_PRESENTATION;
    } else if (next === WI_EVEN_REGIONAL_INDICATOR_ZWJ_PRESENTATION && ri) {
      w = 3;
      ni = WI_ODD_REGIONAL_INDICATOR_ZWJ_PRESENTATION;
    } else if (next === WI_ZWJ_EMOJI_PRESENTATION && c >= 0x1f3fb && c <= 0x1f3ff) {
      w = 0;
      ni = WI_EMOJI_MODIFIER;
    } else if (next === WI_ZWJ_EMOJI_PRESENTATION && c === 0xe007f) {
      w = 0;
      ni = WI_TAG_END_ZWJ_EMOJI_PRESENTATION;
    } else if (next === WI_TAG_END_ZWJ_EMOJI_PRESENTATION && tagLetter) {
      w = 0;
      ni = WI_TAG_A1_END_ZWJ_EMOJI_PRESENTATION;
    } else if (next === WI_TAG_A1_END_ZWJ_EMOJI_PRESENTATION && tagLetter) {
      w = 0;
      ni = WI_TAG_A2_END_ZWJ_EMOJI_PRESENTATION;
    } else if (next === WI_TAG_A2_END_ZWJ_EMOJI_PRESENTATION && tagLetter) {
      w = 0;
      ni = WI_TAG_A3_END_ZWJ_EMOJI_PRESENTATION;
    } else if (next === WI_TAG_A3_END_ZWJ_EMOJI_PRESENTATION && tagLetter) {
      w = 0;
      ni = WI_TAG_A4_END_ZWJ_EMOJI_PRESENTATION;
    } else if (next === WI_TAG_A4_END_ZWJ_EMOJI_PRESENTATION && tagLetter) {
      w = 0;
      ni = WI_TAG_A5_END_ZWJ_EMOJI_PRESENTATION;
    } else if (next === WI_TAG_A5_END_ZWJ_EMOJI_PRESENTATION && tagLetter) {
      w = 0;
      ni = WI_TAG_A6_END_ZWJ_EMOJI_PRESENTATION;
    } else if (isTagEnd(next) && tagDigit) {
      w = 0;
      ni = WI_TAG_D1_END_ZWJ_EMOJI_PRESENTATION;
    } else if (next === WI_TAG_D1_END_ZWJ_EMOJI_PRESENTATION && tagDigit) {
      w = 0;
      ni = WI_TAG_D2_END_ZWJ_EMOJI_PRESENTATION;
    } else if (next === WI_TAG_D2_END_ZWJ_EMOJI_PRESENTATION && tagDigit) {
      w = 0;
      ni = WI_TAG_D3_END_ZWJ_EMOJI_PRESENTATION;
    } else if (isTagLetterEnd(next) && c === 0x1f3f4) {
      w = 0;
      ni = WI_EMOJI_PRESENTATION;
    } else if (next === WI_ZWJ_EMOJI_PRESENTATION && uwInfo(v) === WI_EMOJI_PRESENTATION) {
      w = 0;
      ni = WI_EMOJI_PRESENTATION;
    }
    if (w !== -2) {
      this.info = ni;
    }
    return w;
  }
}

/** str_width of the UTF-8 bytes of `s`, which has a byte of 0x80 or above. */
export const rsUnicodeStrWidth = (s: string): i32 => {
  const st = new RsUwState();
  let sum = 0;
  let j = toI32(s.length);
  // rfold over the chars.
  while (j > 0) {
    let i = j - 1;
    while (i > 0 && (s.charCodeAt(i) & 0xc0) === 0x80) {
      i--;
    }
    const b = s.charCodeAt(i);
    let cp = b;
    let k = 1;
    if (b >= 0xf0) {
      cp = b & 7;
      k = 4;
    } else if (b >= 0xe0) {
      cp = b & 15;
      k = 3;
    } else if (b >= 0xc0) {
      cp = b & 31;
      k = 2;
    }
    for (let m = 1; m < k && i + m < j; m++) {
      cp = (cp << 6) | (s.charCodeAt(i + m) & 63);
    }
    sum += st.step(cp);
    j = i;
  }
  return sum;
};
