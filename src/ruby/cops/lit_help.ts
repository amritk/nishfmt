// What the literal cops share: the PercentLiteral mixin, the
// PercentLiteralDelimiters preferences, PercentArray / ArraySyntax, MagicComment
// and a few character classes of Ruby's regexps.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_BEGIN,
  F_END,
  NT_BEGIN,
  NT_BLOCK,
  NT_DSTR,
  NT_DSYM,
  NT_NUMBLOCK,
  NT_SEND,
  NT_STR,
  V_NIL,
  rbInspectStr,
  rbInspectSym,
} from "../ast";
import { rnHas, rnS, rnE } from "../node";
import { RbSource, TK_COMMENT } from "../source";
import { rbDoubleQuotesRequired, rbEscapeString, rbNeedsEscaping, rbReplaceAll } from "../util";

/** PercentLiteral#begin_source: the source of loc.begin, or null without one. */
export const rbLitBeginSrc = (src: RbSource, n: i32): string | null => {
  if (!rnHas(src, n, F_BEGIN)) {
    return null;
  }
  return src.src(rnS(src, n, F_BEGIN), rnE(src, n, F_BEGIN));
};

/** PercentLiteral#percent_literal?: loc.begin starts with `%`. */
export const rbLitIsPercent = (src: RbSource, n: i32): boolean => {
  const b = rbLitBeginSrc(src, n);
  return b !== null && b.startsWith("%");
};

/** PercentLiteral#type: loc.begin's source without its last character. */
export const rbLitPctType = (src: RbSource, n: i32): string => src.src(rnS(src, n, F_BEGIN), rnE(src, n, F_BEGIN) - 1);

/** The last character of loc.begin's source (one code point). */
export const rbLitBeginLast = (src: RbSource, n: i32): string => {
  const e = rnE(src, n, F_BEGIN);
  return src.src(e - 1, e);
};

/** The first character of loc.end's source (one code point). */
export const rbLitEndFirst = (src: RbSource, n: i32): string => {
  const s = rnS(src, n, F_END);
  return src.src(s, s + 1);
};

/**
 * PreferredDelimiters#delimiters with the default configuration: the opening
 * and closing delimiter of a percent literal type, as a two-character string.
 */
export const rbLitPreferred = (type: string): string => {
  if (type === "%i" || type === "%I" || type === "%w" || type === "%W") {
    return "[]";
  }
  if (type === "%r") {
    return "{}";
  }
  return "()";
};

/** PercentLiteralDelimiters#matchpairs: the pair a delimiter belongs to, or the delimiter alone. */
export const rbLitMatchpairs = (d: string): string[] => {
  if (d === "(" || d === ")") {
    return ["(", ")"];
  }
  if (d === "[") {
    return ["[", "]"];
  }
  if (d === "{") {
    return ["{", "}"];
  }
  if (d === "<") {
    return ["<", ">"];
  }
  return [d];
};

/** Whether `s` contains any of `ds`. */
export const rbLitContainsAny = (s: string, ds: string[]): boolean => {
  for (const d of ds) {
    if (s.indexOf(d) >= 0) {
      return true;
    }
  }
  return false;
};

/** ASCII letter or digit. */
export const rbLitAsciiAlnum = (c: i32): boolean =>
  (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);

/** Ruby's regexp `\w` (ASCII only). */
export const rbLitWordC = (c: i32): boolean => rbLitAsciiAlnum(c) || c === 95;

/** Ruby's regexp `\s`: space, \t, \n, \v, \f, \r. */
export const rbLitSpaceC = (c: i32): boolean => c === 32 || (c >= 9 && c <= 13);

/** The code points of a UTF-8 string (invalid bytes decode as U+FFFD). */
export const rbLitChars = (s: string): i32[] => {
  const out: i32[] = [];
  const n = toI32(s.length);
  let i = 0;
  while (i < n) {
    const c = s.charCodeAt(i);
    let k = 0;
    let v = 0;
    if (c < 0x80) {
      out.push(c);
      i++;
      continue;
    } else if (c >= 0xc2 && c < 0xe0) {
      k = 1;
      v = c & 0x1f;
    } else if (c >= 0xe0 && c < 0xf0) {
      k = 2;
      v = c & 0x0f;
    } else if (c >= 0xf0 && c < 0xf5) {
      k = 3;
      v = c & 0x07;
    } else {
      out.push(0xfffd);
      i++;
      continue;
    }
    let ok = i + k < n;
    for (let j = 1; j <= k && ok; j++) {
      const d = s.charCodeAt(i + j);
      if ((d & 0xc0) !== 0x80) {
        ok = false;
      } else {
        v = (v << 6) | (d & 0x3f);
      }
    }
    if (!ok) {
      out.push(0xfffd);
      i++;
      continue;
    }
    out.push(v);
    i += k + 1;
  }
  return out;
};

/** Node#block_literal?: the send of a block (or numblock). */
export const rbLitBlockLiteral = (src: RbSource, n: i32): boolean => {
  const p = src.parent(n);
  if (p === V_NIL) {
    return false;
  }
  const t = src.a.type(p);
  return (t === NT_BLOCK || t === NT_NUMBLOCK) && src.a.kid(p, 0) === n;
};

/** ParameterizedNode#parenthesized?: loc.end is `)`. */
export const rbLitParenthesized = (src: RbSource, n: i32): boolean =>
  rnHas(src, n, F_END) && src.src(rnS(src, n, F_END), rnE(src, n, F_END)) === ")";

/** PercentArray#invalid_percent_array_context?: an argument of an unparenthesized send with a block. */
export const rbLitInvalidPercentContext = (src: RbSource, n: i32): boolean => {
  const p = src.parent(n);
  if (p === V_NIL || src.a.type(p) !== NT_SEND) {
    return false;
  }
  let isArg = false;
  for (let i = 2; i < src.a.nKid(p); i++) {
    if (src.a.kid(p, i) === n) {
      isArg = true;
    }
  }
  return isArg && !rbLitParenthesized(src, p) && rbLitBlockLiteral(src, p);
};

/** PercentArray#comments_in_array?: a comment on the array's lines but its last. */
export const rbLitCommentsInArray = (src: RbSource, n: i32): boolean => {
  const first = src.line(src.a.exS(n));
  const last = src.line(src.a.exE(n));
  for (let i = 0; i < src.commentCount(); i++) {
    const l = src.line(src.commS[i]);
    if (l >= first && l < last) {
      return true;
    }
  }
  return false;
};

/** PercentArray#build_bracketed_array_with_appropriate_whitespace. */
export const rbLitBracketed = (src: RbSource, n: i32, elements: string[]): string => {
  const a = src.a;
  const k = a.nKid(n);
  const parts: string[] = ["["];
  parts.push(src.src(rnE(src, n, F_BEGIN), rbLitElementBegin(src, a.kid(n, 0))));
  let between = " ";
  if (k >= 2) {
    between = src.src(a.exE(a.kid(n, 0)), rbLitElementBegin(src, a.kid(n, 1)));
  }
  parts.push(elements.join(`,${between}`));
  parts.push(src.src(a.exE(a.kid(n, k - 1)), rnS(src, n, F_END)));
  parts.push("]");
  return parts.join("");
};

/**
 * PercentArray#element_begin: the location of an element starting with a
 * variable interpolated without braces, such as `#@foo`, does not include the `#`.
 */
const rbLitElementBegin = (src: RbSource, e: i32): i32 => {
  const a = src.a;
  const s = a.exS(e);
  const t = a.type(e);
  if (t !== NT_DSTR && t !== NT_DSYM) {
    return s;
  }
  const f = a.kid(e, 0);
  if (a.isNode(f) && (a.type(f) === NT_STR || a.type(f) === NT_BEGIN)) {
    return s;
  }
  return s - 1;
};

/**
 * PercentArray#build_interpolated_string_literal: a double-quoted string
 * literal for an interpolated element of a `%W` or `%I` array. Only the text
 * around the interpolations is escaped, the code inside them is kept as written.
 */
export const rbLitInterpolatedLiteral = (src: RbSource, n: i32): string => {
  const a = src.a;
  const parts: string[] = ['"'];
  for (let i = 0; i < a.nKid(n); i++) {
    const c = a.kid(n, i);
    if (a.type(c) === NT_STR) {
      const ins = rbInspectStr(a.text(a.kid(c, 0)));
      parts.push(ins.substring(1, toI32(ins.length) - 1));
    } else if (a.type(c) === NT_BEGIN) {
      parts.push(src.nodeSrc(c));
    } else {
      // A variable interpolated without braces, such as `#@foo`. The braces keep
      // the text that follows from becoming part of the variable name.
      parts.push(`#{${src.nodeSrc(c)}}`);
    }
  }
  parts.push('"');
  return parts.join("");
};

/** Util#trim_string_interpolation_escape_character: `\#{...}` becomes `#{...}` (lazily, within a line). */
export const rbLitTrimInterpEscape = (s: string): string => {
  const parts: string[] = [];
  const n = toI32(s.length);
  let i = 0;
  let from = 0;
  while (i + 2 < n) {
    if (s.charCodeAt(i) === 92 && s.charCodeAt(i + 1) === 35 && s.charCodeAt(i + 2) === 123) {
      let j = i + 3;
      while (j < n && s.charCodeAt(j) !== 125 && s.charCodeAt(j) !== 10) {
        j++;
      }
      if (j < n && s.charCodeAt(j) === 125) {
        parts.push(s.substring(from, i));
        parts.push(s.substring(i + 1, j + 1));
        from = j + 1;
        i = j + 1;
        continue;
      }
    }
    i++;
  }
  parts.push(s.substring(from, n));
  return parts.join("");
};

/** The source lines before the first non-comment token (FrozenStringLiteral#leading_comment_lines). */
export const rbLitLeadingCommentLines = (src: RbSource): string[] => {
  let firstLine = -1;
  for (let i = 0; i < toI32(src.tokT.length); i++) {
    if (src.tokT[i] !== TK_COMMENT) {
      firstLine = src.line(src.tokS[i]);
      break;
    }
  }
  const out: string[] = [];
  const last = firstLine < 0 ? src.lineCount() : firstLine - 1;
  for (let l = 1; l <= last && l <= src.lineCount(); l++) {
    out.push(src.lineText(l));
  }
  return out;
};

/** `s` without its first and last character (Ruby's `s[1..-2]`). */
const rbLitStripEnds = (s: string): string => {
  const n = toI32(s.length);
  if (n < 2) {
    return "";
  }
  // The first character of an inspect is ASCII; drop a whole code point at the end.
  let e = n - 1;
  while (e > 1 && (s.charCodeAt(e) & 0xc0) === 0x80) {
    e--;
  }
  return s.substring(1, e);
};

/** Util#needs_escaping? of a Symbol (its inspect without the colon and last character). */
export const rbLitSymNeedsEscaping = (s: string): boolean => {
  const ins = rbLitStripEnds(rbInspectSym(s));
  return rbDoubleQuotesRequired(rbReplaceAll(ins, '\\"', '"'));
};

/** `s` with every `[` and `]` escaped, unless they are as many (substitute_escaped_delimiters, `[]`). */
const rbLitSubstDelims = (s: string): string => {
  let o = 0;
  let c = 0;
  for (let i = 0; i < toI32(s.length); i++) {
    const ch = s.charCodeAt(i);
    if (ch === 91) {
      o++;
    } else if (ch === 93) {
      c++;
    }
  }
  if (o === c) {
    return s;
  }
  return rbReplaceAll(rbReplaceAll(s, "[", "\\["), "]", "\\]");
};

/** Ruby's `str.split("\n")` (trailing empty fields dropped). */
export const rbLitSplitLines = (s: string): string[] => {
  const out: string[] = [];
  let a = 0;
  const n = toI32(s.length);
  for (let i = 0; i <= n; i++) {
    if (i === n || s.charCodeAt(i) === 10) {
      out.push(s.substring(a, i));
      a = i + 1;
    }
  }
  while (out.length > 0 && out[out.length - 1].length === 0) {
    out.pop();
  }
  return out;
};

/** `s.split(sep).first || ''` for a separator that is not a single space. */
const rbLitSplitFirst = (s: string, sep: string): string => {
  const i = s.indexOf(sep);
  if (i < 0) {
    return s;
  }
  return s.substring(0, i);
};

/** PercentLiteralCorrector#fix_escaped_content. */
const rbLitFixEscaped = (src: RbSource, w: i32, escape: boolean): string => {
  let content = src.a.text(src.a.kid(w, 0));
  if (escape) {
    content = rbEscapeString(content);
  }
  return rbLitSubstDelims(content);
};

/**
 * PercentLiteralCorrector#correct for a bracketed array of syms (`char0` "i")
 * or strs ("w"): the `%i[...]`/`%w[...]` text that replaces the array.
 */
export const rbLitPercentCorrect = (src: RbSource, n: i32, char0: string, isSym: boolean): string => {
  const a = src.a;
  const k = a.nKid(n);
  let escape = false;
  for (let i = 0; i < k; i++) {
    const v = a.text(a.kid(a.kid(n, i), 0));
    if (isSym ? rbLitSymNeedsEscaping(v) : rbNeedsEscaping(v)) {
      escape = true;
    }
  }
  let char = char0;
  if (escape) {
    char = char0 === "i" ? "I" : "W";
  }
  const parts: string[] = [];
  const ns = a.exS(n);
  const ne = a.exE(n);
  if (src.line(ns) === src.line(ne)) {
    for (let i = 0; i < k; i++) {
      if (i > 0) {
        parts.push(" ");
      }
      parts.push(rbLitFixEscaped(src, a.kid(n, i), escape));
    }
  } else {
    const source = src.nodeSrc(n);
    const lines = rbLitSplitLines(source);
    const base = src.line(ns);
    let prev = base;
    for (let i = 0; i < k; i++) {
      const w = a.kid(n, i);
      const wf = src.line(a.exS(w));
      let lb = "";
      if (wf === prev) {
        lb = i === 0 && wf === base ? "" : " ";
      } else {
        const from = prev - base + 1;
        const to = wf - base + 1;
        const sel: string[] = [];
        for (let j = from; j < to && j < toI32(lines.length); j++) {
          sel.push(lines[j]);
        }
        lb = `\n${rbLitSplitFirst(sel.join("\n"), src.nodeSrc(w))}`;
      }
      prev = src.line(a.exE(w));
      parts.push(lb);
      parts.push(rbLitFixEscaped(src, w, escape));
    }
    // end_content
    if (lines.length > 0) {
      const last = lines[lines.length - 1];
      let j = 0;
      while (j < toI32(last.length) && rbLitSpaceC(last.charCodeAt(j))) {
        j++;
      }
      if (j < toI32(last.length) && last.charCodeAt(j) === 93) {
        parts.push(`\n${last.substring(0, j)}`);
      }
    }
  }
  return `%${char}[${parts.join("")}]`;
};

/** ArraySyntax#bracketed_array_of?: a `[...]` array, not empty, of nodes of type `t`. */
export const rbLitBracketedArrayOf = (src: RbSource, n: i32, t: i32): boolean => {
  const a = src.a;
  if (!rnHas(src, n, F_BEGIN) || src.src(rnS(src, n, F_BEGIN), rnE(src, n, F_BEGIN)) !== "[" || a.nKid(n) === 0) {
    return false;
  }
  for (let i = 0; i < a.nKid(n); i++) {
    const c = a.kid(n, i);
    if (!a.isNode(c) || a.type(c) !== t) {
      return false;
    }
  }
  return true;
};

/** PercentArray#allowed_bracket_array? (MinSize: 2). */
export const rbLitAllowedBracketArray = (src: RbSource, n: i32): boolean =>
  rbLitCommentsInArray(src, n) || src.a.nKid(n) < 2 || rbLitInvalidPercentContext(src, n);
