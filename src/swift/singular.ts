// SwiftFormat's String.singularized() (Singularize.swift), without regular
// expressions: each of its rules is a case-insensitive match of a captured
// alternation followed by a literal suffix at the end of the word, so it is
// matched by comparing suffixes, the longest alternative first (the one a
// leftmost regex match picks). Three rules have another shape and are
// handled by kind: `([^aeiouy]|qu)ies$`, `^(pra|a)xes$` and the unanchored
// `(x)en`.
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

// The rules in Singularize.swift's order, one a line: kind, alternatives,
// suffix, replacement, separated by tabs; "-" is empty. Kind E: the
// alternatives then the suffix end the word. N: `([^aeiouy]|qu)` then the
// suffix. W: the whole word. X: every occurrence, anywhere. A replacement
// starting with "$1" puts the matched alternative, as written, before the
// rest. The rules are tried from the last.
const SW_SINGULAR_TABLE: string =
  "E\t-\ts\t-\n" +
  "E\t-\teaux\teau\n" +
  "E\t-\tae\ta\n" +
  "E\t-\tera\tus\n" +
  "E\te\tae\t$1us\n" +
  "E\tss\t-\t$1\n" +
  "E\ttt|t\ti\t$1o\n" +
  "E\tt|i|v|d|l\ta\t$1um\n" +
  "E\ti\tves\t$1fe\n" +
  "E\ta|l|r|oo|ie\tves\t$1f\n" +
  "E\ttive|hive\ts\t$1\n" +
  "N\t-\ties\t$1y\n" +
  "E\tov|mb\ties\t$1ie\n" +
  "E\tx|ch|ss|sh\tes\t$1\n" +
  "E\tm|l\tice\t$1ouse\n" +
  "E\td\tice\t$1ie\n" +
  "E\tbus|ato\tes\t$1\n" +
  "E\tcris|test\tes\t$1is\n" +
  "W\tpra|a\txes\t$1xis\n" +
  "E\ts|z\tes\t$1\n" +
  "E\tace|ase\ts\t$1\n" +
  "E\tias\tes\t$1\n" +
  "E\tz\tzes\t$1\n" +
  "E\tbase|grouse\ts\t$1\n" +
  "X\tx\ten\t$1\n" +
  "E\toa|ly|gno|op|the|ip\tses\t$1sis\n" +
  "E\trt|ind|ap|cod\tices\t$1ex\n" +
  "E\ttr|end\tices\t$1ix\n" +
  "E\toc|radi|vir|octop|alumn|cill|cact|fung|ul|ab\ti\t$1us\n" +
  "E\tvir\tii\t$1us\n" +
  "E\tquiz\tzes\t$1\n" +
  "E\tpe\tople\t$1rson\n" +
  "E\tm\ten\t$1an\n" +
  "E\tchild\tren\t$1\n" +
  "E\tt\teeth\t$1ooth\n" +
  "E\tg\teese\t$1oose\n" +
  "E\titeri|en\ta\t$1on\n" +
  "E\tbison|craft|deer|equipment|fish|fruit|grouse|money|news|offspring\t-\t$1\n" +
  "E\tinfo|information|rice|salmon|series|sheep|shrimp|species|swine|trout|tuna\t-\t$1\n" +
  "E\tdata|media\t-\t$1";

const swSgLower = (c: i32): i32 => (c >= 65 && c <= 90 ? c + 32 : c);

/** Whether `s` (ASCII), from byte `at`, is `lit` ignoring ASCII case. */
const swSgAt = (s: string, at: i32, lit: string): boolean => {
  const m = toI32(lit.length);
  if (at < 0 || at + m > toI32(s.length)) {
    return false;
  }
  for (let i = 0; i < m; i++) {
    if (swSgLower(s.charCodeAt(at + i)) !== lit.charCodeAt(i)) {
      return false;
    }
  }
  return true;
};

const swSgField = (f: string): string => (f === "-" ? "" : f);

/** The replacement with `$1` filled in from `s[a, b)`. */
const swSgReplace = (s: string, a: i32, b: i32, repl: string): string => {
  if (repl.startsWith("$1")) {
    return s.substring(a, b) + repl.substring(2);
  }
  return repl;
};

/**
 * One rule applied to `s`, or null when it does not match: the word with
 * the match replaced.
 */
const swSgRule = (s: string, kind: string, altsField: string, suffix: string, repl: string): string | null => {
  const n = toI32(s.length);
  const sl = toI32(suffix.length);
  if (kind === "X") {
    // (x)en, replaced everywhere: each "xen" becomes its "x".
    const lit = altsField + suffix;
    const m = toI32(lit.length);
    let out = "";
    let from = 0;
    let found = false;
    let i = 0;
    while (i + m <= n) {
      if (swSgAt(s, i, lit)) {
        out = out + s.substring(from, i) + swSgReplace(s, i, i + toI32(altsField.length), repl);
        i = i + m;
        from = i;
        found = true;
      } else {
        i++;
      }
    }
    if (!found) {
      return null;
    }
    return out + s.substring(from);
  }
  if (!swSgAt(s, n - sl, suffix)) {
    return null;
  }
  const end = n - sl;
  if (kind === "N") {
    // ([^aeiouy]|qu)ies$: "qu" starts further left, so it is tried first.
    if (swSgAt(s, end - 2, "qu")) {
      return s.substring(0, end - 2) + swSgReplace(s, end - 2, end, repl);
    }
    if (end >= 1) {
      const c = swSgLower(s.charCodeAt(end - 1));
      if (c !== 97 && c !== 101 && c !== 105 && c !== 111 && c !== 117 && c !== 121) {
        return s.substring(0, end - 1) + swSgReplace(s, end - 1, end, repl);
      }
    }
    return null;
  }
  // E and W: the longest alternative that ends at `end` starts leftmost.
  let best = -1;
  let a = 0;
  const alts = swSgField(altsField);
  const na = toI32(alts.length);
  for (let i = 0; i <= na; i++) {
    if (i === na || alts.charCodeAt(i) === 124) {
      const alt = alts.substring(a, i);
      const al = toI32(alt.length);
      a = i + 1;
      if (al > best && swSgAt(s, end - al, alt) && (kind !== "W" || end - al === 0)) {
        best = al;
      }
    }
  }
  if (best < 0) {
    return null;
  }
  return s.substring(0, end - best) + swSgReplace(s, end - best, end, repl);
};

/** The rules from the last; the first that matches answers. */
const swSgApply = (s: string): string | null => {
  const t = SW_SINGULAR_TABLE;
  const n = toI32(t.length);
  // Start of each line, so they can be visited from the last.
  const starts: i32[] = [0];
  for (let i = 0; i < n; i++) {
    if (t.charCodeAt(i) === 10) {
      starts.push(i + 1);
    }
  }
  for (let q = toI32(starts.length) - 1; q >= 0; q--) {
    const a = starts[q];
    const b = q + 1 < toI32(starts.length) ? starts[q + 1] - 1 : n;
    const t1 = t.indexOf("\t", a);
    const t2 = t.indexOf("\t", t1 + 1);
    const t3 = t.indexOf("\t", t2 + 1);
    const r = swSgRule(
      s,
      t.substring(a, t1),
      t.substring(t1 + 1, t2),
      swSgField(t.substring(t2 + 1, t3)),
      swSgField(t.substring(t3 + 1, b)),
    );
    if (r !== null) {
      return r;
    }
  }
  return null;
};

/** String.singularized() for an ASCII string; null for nil. */
export const swSingularized = (s: string): string | null => {
  const result = swSgApply(s);
  if (result === null) {
    return null;
  }
  // removingPrefix("all")
  if (result.startsWith("all") || result.startsWith("All")) {
    const rest = result.substring(3);
    if (rest.length === 0) {
      return null;
    }
    const c = rest.charCodeAt(0);
    const first = result.startsWith("all") ? swSgLower(c) : c >= 97 && c <= 122 ? c - 32 : c;
    return String.fromCharCode(first) + rest.substring(1);
  }
  return result;
};
