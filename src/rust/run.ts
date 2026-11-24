// The Rust entry point: rustfmt's pipeline over one file.
//
// Ported from rustfmt 1.10.0 (MIT OR Apache-2.0, Copyright The Rust Project
// Developers): formatting.rs, source_file.rs.

import { Out } from "../core/out";
import { RsAst } from "./ast";
import { rsDump } from "./dump";
import { rsFormatSource, rsHasTrailingWhitespaceError } from "./format";
import { RsTokens, rsLex } from "./lexer";
import { RsParser } from "./parser";
import { rsConfigWithMaxWidth } from "./shape";
import { add32, newU8s } from "../core/arr";
import { fault } from "../core/fault";

/** One file's Rust state; a fresh one formats each file, in a region of its own. */
export class RustEngine {
  debug: boolean = false;
  dump: boolean = false;
  parseOnly: boolean = false;
  // nishfmt's Rust style: edition 2024, style_edition 2024, max_width 120.
  edition: i32 = 2024;
  styleEdition: i32 = 2024;
  maxWidth: i32 = 120;
  // The file's text, `String.fromBytes(src, 0, n)`: the caller sets it.
  text: string = "";
  constructor() {}
}

/** Formats `src[0, n)` into `out` as rustfmt does; answers false when the file cannot be formatted. */
export const formatRust = (e: RustEngine, path: string, src0: u8[], n0: i32, out: Out): boolean => {
  out.n = 0;
  // The file is `src0[0, n0)`.
  if (n0 < 0 || n0 > src0.length) {
    fault();
    return false;
  }
  // rustc drops a byte order mark and normalizes CRLF line endings to LF
  // when it loads a file; the newline style (Auto) then sees only LF.
  let src = src0;
  let n = n0;
  let text = e.text;
  // The caller gives the file's text with its bytes.
  if (toI32(text.length) !== n0) {
    fault();
    return false;
  }
  const bom =
    n0 >= 3 && src0.length >= 3 && toI32(src0[0]) === 0xef && toI32(src0[1]) === 0xbb && toI32(src0[2]) === 0xbf
      ? 3
      : 0;
  let hasCr = false;
  for (let i = 0; i < n0 && i + 1 < n0; i++) {
    if (toI32(src0[i]) === 13 && toI32(src0[i + 1]) === 10) {
      hasCr = true;
      break;
    }
  }
  if (hasCr || bom > 0) {
    src = newU8s(add32(n0, 1));
    if (n0 > src0.length) {
      fault();
      return false;
    }
    // The text, normalized the same way: the runs between dropped bytes.
    const parts: string[] = [];
    let from = bom;
    let k = 0;
    for (let i = bom; i >= 0 && i < n0 && i < src0.length; i++) {
      if (toI32(src0[i]) === 13 && i + 1 < n0 && i + 1 < src0.length && toI32(src0[i + 1]) === 10) {
        parts.push(text.substring(from, i));
        from = i + 1;
        continue;
      }
      // At most one byte kept a byte read.
      if (k < 0 || k >= src.length || k > i) {
        fault();
        return false;
      }
      src[k] = src0[i];
      k++;
    }
    parts.push(text.substring(from, n0));
    text = parts.join("");
    n = k;
  }
  if (e.dump || e.parseOnly) {
    const t = new RsTokens(src, n, e.edition);
    rsLex(t);
    if (t.failed) {
      return false;
    }
    const ast = new RsAst(t.nt);
    const p = new RsParser(t, ast);
    const root = p.parseCrate();
    if (p.failed || root < 0) {
      return false;
    }
    p.finishInnerAttrs();
    if (e.dump) {
      out.str(rsDump(ast, t, root));
    }
    return true;
  }
  const cfg = rsConfigWithMaxWidth(e.maxWidth);
  cfg.edition = e.edition;
  cfg.styleEdition = e.styleEdition;
  const r = rsFormatSource(src, n, text, cfg, false);
  if (r.parseFailed || r.unsupported || r.broken) {
    if (e.debug) {
      let line = 1;
      for (let i = 0; i < r.failAt && i < n && i < src.length; i++) {
        if (toI32(src[i]) === 10) {
          line = add32(line, 1);
        }
      }
      const where = r.parseFailed ? `:${line}` : "";
      const what = r.unsupported ? "unsupported: " + r.why : r.broken ? "span lookup failed: " + r.why : r.why;
      console.error(`${path}${where}: ${what}`);
    }
    return false;
  }
  // format_lines: trailing whitespace rustfmt could not remove is an error.
  if (rsHasTrailingWhitespaceError(r, false)) {
    if (e.debug) {
      console.error(`${path}: trailing whitespace left`);
    }
    return false;
  }
  out.range(r.bytes, 0, r.nb);
  return true;
};

export const isRustName = (name: string): boolean => name.endsWith(".rs");
