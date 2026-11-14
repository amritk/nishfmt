// Array helpers every language shares.

/** Grows `xs` to at least `n` elements, keeping its contents. */
export const growI32 = (xs: i32[], n: i32): i32[] => {
  if (toI32(xs.length) >= n) {
    return xs;
  }
  let cap = toI32(xs.length) * 2;
  if (cap < n) {
    cap = n;
  }
  const out = new Array<i32>(cap);
  out.set(xs);
  return out;
};

/** The number of UTF-16 code units in `src[a, b)`, which Java's String.length counts. */
export const utf16Len = (src: u8[], a: i32, b: i32): i32 => {
  let n = 0;
  for (let i = a; i < b; i++) {
    const c = toI32(src[i]);
    if (c < 0x80 || c >= 0xc0) {
      n += c >= 0xf0 ? 2 : 1;
    }
  }
  return n;
};

/** The number of UTF-16 code units in `s`. */
export const strUtf16Len = (s: string): i32 => {
  let n = 0;
  const k = toI32(s.length);
  for (let i = 0; i < k; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80 || c >= 0xc0) {
      n += c >= 0xf0 ? 2 : 1;
    }
  }
  return n;
};
