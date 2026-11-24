// Formatting a whole source (a file, or a snippet such as a macro body) and
// the snippet helpers built on it: format_snippet and format_code_block.
//
// Ported from rustfmt 1.10.0 (MIT OR Apache-2.0, Copyright The Rust Project
// Developers): formatting.rs, lib.rs.

import { RsAst } from "./ast";
import { rsAttrsContainSkip } from "./attr";
import { rsCharClasses, rsIndentNextLine, rsKindIsComment, rsKindIsString, rsLineClasses, rsSliceStr } from "./comment";
import { RsCtx, RsFile, RsRanges } from "./context";
import { RsTokens, rsLex, rsZeroU8s } from "./lexer";
import { RsParser } from "./parser";
import { RsConfig, rsIndentStr } from "./shape";
import { rsWsLenAt } from "./str";
import { RsVisitor } from "./visitor";
import { add32, atI32, sub32 } from "../core/arr";
import { fault } from "../core/fault";

/** What formatting one source gave. */
export class RsFormatted {
  text: string = "";
  parseFailed: boolean = false;
  failAt: i32 = -1; // the byte offset of the token the parser failed at
  unsupported: boolean = false;
  broken: boolean = false;
  why: string = "";
  macroFailure: boolean = false;
  lostComment: boolean = false;
  skipped: RsRanges;
  constructor() {
    this.skipped = new RsRanges();
  }
}

/** Lexes, parses and formats `src[0, n)` (already normalized: LF, no BOM), whose text is `text`. */
export const rsFormatSource = (src: u8[], n: i32, text: string, cfg: RsConfig, isMacroDef: boolean): RsFormatted => {
  const r = new RsFormatted();
  const t = new RsTokens(src, n, cfg.edition);
  rsLex(t);
  if (t.failed) {
    r.parseFailed = true;
    r.why = "lexing failed";
    return r;
  }
  const ast = new RsAst(t.nt);
  const p = new RsParser(t, ast);
  const root = p.parseCrate();
  if (p.failed || root < 0) {
    r.parseFailed = true;
    r.failAt = p.p < t.nt ? atI32(t.lo, p.p) : n;
    r.why = "parse failed";
    return r;
  }
  p.finishInnerAttrs();
  const f = new RsFile(src, n, text, t, ast, cfg);
  // #![rustfmt::skip] on the crate: the source is echoed back.
  if (rsAttrsContainSkip(new RsCtx(f), root)) {
    r.text = text;
    return r;
  }
  const v = new RsVisitor(f);
  v.isMacroDef = isMacroDef;
  v.lastPos = 0;
  v.skipEmptyLines(n);
  v.formatCrate(root);
  if (f.unsupported || f.broken) {
    r.unsupported = f.unsupported;
    r.broken = f.broken;
    r.why = f.why;
    return r;
  }
  // append_newline; format_lines then makes a run of trailing newlines one.
  v.out.add("\n");
  const s = v.text();
  let m = toI32(s.length);
  while (m >= 2 && m <= s.length && s.charCodeAt(m - 2) === 10) {
    m--;
  }
  r.text = m < toI32(s.length) ? s.substring(0, m) : s;
  r.macroFailure = v.macroRewriteFailure;
  r.lostComment = f.lostComment;
  r.skipped = v.skipped;
  return r;
};

/** A formatted snippet and its non-formatted line ranges. */
export class RsSnippet {
  text: string;
  skipped: RsRanges;
  constructor(text: string, skipped: RsRanges) {
    this.text = text;
    this.skipped = skipped;
  }
}

const strBytes = (s: string): u8[] => {
  const n = toI32(s.length);
  const b = rsZeroU8s(add32(n, 1));
  for (let i = 0; i < n && i < b.length; i++) {
    b[i] = toU8(s.charCodeAt(i));
  }
  return b;
};

/** Whether a line of `s` ends in a whitespace char (the error's precondition, without classifying chars). */
const anyLineEndsInWhitespace = (s: string): boolean => {
  const n = toI32(s.length);
  let lineStart = 0;
  for (let i = 0; i < n; i++) {
    if (s.charCodeAt(i) !== 10) {
      continue;
    }
    // The last char of the line, a carriage return aside.
    let j = i - 1;
    while (j >= lineStart && j >= 0 && s.charCodeAt(j) === 13) {
      j--;
    }
    while (j > lineStart && j >= 0 && (s.charCodeAt(j) & 0xc0) === 0x80) {
      j--;
    }
    if (j >= lineStart && j >= 0 && rsWsLenAt(s, j) > 0) {
      return true;
    }
    lineStart = i + 1;
  }
  return false;
};

/**
 * FormatLines' TrailingWhitespace error over formatted text: a line outside
 * the skipped lines whose last char is whitespace. With
 * `errorOnUnformatted` off (a file) a line whose newline is in a comment or
 * that holds a string literal does not count; format_snippet turns it on for
 * a macro_rules! body. A file with the error makes rustfmt exit with an
 * error; a macro body with it keeps the definition as written.
 */
export const rsHasTrailingWhitespaceError = (r: RsFormatted, errorOnUnformatted: boolean): boolean => {
  const s = r.text;
  if (!anyLineEndsInWhitespace(s)) {
    return false;
  }
  const skipped = r.skipped;
  const cc = rsCharClasses(s);
  let line = 1;
  let lastWasSpace = false;
  let hasString = false;
  for (let ci = 0; ci < cc.nc; ci++) {
    const a = atI32(cc.starts, ci);
    const kind = atI32(cc.kinds, a);
    // A char start is in `s`.
    if (a < 0 || a >= toI32(s.length)) {
      fault();
      return false;
    }
    const b = s.charCodeAt(a);
    if (b === 13) {
      continue;
    }
    if (b === 10) {
      const allowed = errorOnUnformatted || (!rsKindIsComment(kind) && !hasString);
      if (lastWasSpace && allowed && !skipped.contains(line)) {
        return true;
      }
      line = add32(line, 1);
      lastWasSpace = false;
      hasString = false;
      continue;
    }
    lastWasSpace = rsWsLenAt(s, a) > 0;
    if (rsKindIsString(kind)) {
      hasString = true;
    }
  }
  return false;
};

/** format_snippet: null when the snippet does not parse or formats with errors. */
export const rsFormatSnippet = (parent: RsCtx, code: string, cfg: RsConfig, isMacroDef: boolean): RsSnippet | null => {
  const n = toI32(code.length);
  const r = rsFormatSource(strBytes(code), n, code, cfg, isMacroDef);
  if (r.unsupported) {
    parent.unsupported(r.why);
    return null;
  }
  if (r.parseFailed || r.broken) {
    return null;
  }
  if (r.macroFailure || (r.text.length === 0 && n !== 0)) {
    return null;
  }
  if (isMacroDef && (r.lostComment || rsHasTrailingWhitespaceError(r, true))) {
    return null;
  }
  return new RsSnippet(r.text, r.skipped);
};

const FN_MAIN_PREFIX: string = "fn main() {\n";

/** format_code_block: the code wrapped in `fn main() {}`, formatted, then unwrapped. */
export const rsFormatCodeBlock = (
  parent: RsCtx,
  code: string,
  cfg: RsConfig,
  isMacroDef: boolean,
): RsSnippet | null => {
  const indent = rsIndentStr(cfg, cfg.tabSpaces, 0);
  let wrapped = FN_MAIN_PREFIX;
  let needIndent = true;
  const lc = rsLineClasses(code);
  const lines = lc.lines;
  for (let i = 0; i < lc.n; i++) {
    // `n` counts the lines.
    if (i < 0 || i >= lines.length) {
      fault();
      return null;
    }
    if (needIndent) {
      wrapped = wrapped + indent;
    }
    wrapped = wrapped + lines[i] + "\n";
    needIndent = rsIndentNextLine(atI32(lc.kinds, i), cfg);
  }
  wrapped = wrapped + "}";
  const fm = rsFormatSnippet(parent, wrapped, cfg, isMacroDef);
  if (fm === null) {
    return null;
  }
  // unwrap_code_block: the ranges move up a line.
  const los = fm.skipped.lo;
  const his = fm.skipped.hi;
  for (let i = 0; i < los.length; i++) {
    // `lo` and `hi` grow together.
    if (i >= his.length) {
      fault();
      return null;
    }
    los[i] = sub32(los[i], 1);
    his[i] = sub32(his[i], 1);
  }
  const s = fm.text;
  let blockLen = toI32(s.length);
  for (let i = toI32(s.length) - 1; i >= 0; i--) {
    if (s.charCodeAt(i) === 125) {
      blockLen = i;
      if (i > 0) {
        const c = s.charCodeAt(i - 1);
        if (c === 32 || c === 9 || c === 10 || c === 13 || c === 11 || c === 12) {
          blockLen = i - 1;
        }
      }
      break;
    }
  }
  const pl = toI32(FN_MAIN_PREFIX.length);
  const blockStart = pl < blockLen ? pl : blockLen;
  let result = "";
  let isFirst = true;
  let isIndented = true;
  const inner = rsLineClasses(rsSliceStr(s, blockStart, blockLen));
  const innerLines = inner.lines;
  for (let i = 0; i < inner.n; i++) {
    if (!isFirst) {
      result = result + "\n";
    } else {
      isFirst = false;
    }
    // `n` counts the lines.
    if (i < 0 || i >= innerLines.length) {
      fault();
      return null;
    }
    const line = innerLines[i];
    let trimmed = line;
    if (isIndented) {
      if (toI32(line.length) > cfg.maxWidth) {
        return null;
      }
      if (toI32(line.length) > toI32(indent.length) && line.startsWith(indent)) {
        trimmed = rsSliceStr(line, cfg.hardTabs ? 1 : cfg.tabSpaces, toI32(line.length));
      }
    }
    result = result + trimmed;
    isIndented = rsIndentNextLine(atI32(inner.kinds, i), cfg);
  }
  return new RsSnippet(result, fm.skipped);
};
