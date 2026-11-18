// The Rust entry point: rustfmt's pipeline over one file.
//
// Ported from rustfmt 1.9.0 (MIT OR Apache-2.0, Copyright The Rust Project
// Developers): formatting.rs, source_file.rs.

import { Out } from "../core/out";
import { RsAst } from "./ast";
import { rsDump } from "./dump";
import { rsFormatSource } from "./format";
import { RsTokens, rsLex } from "./lexer";
import { RsParser } from "./parser";
import { rsConfigWithMaxWidth } from "./shape";

/** One file's Rust state; a fresh one formats each file, in a region of its own. */
export class RustEngine {
  debug: boolean = false;
  dump: boolean = false;
  parseOnly: boolean = false;
  // nishfmt's Rust style: edition 2024, style_edition 2024, max_width 120.
  edition: i32 = 2024;
  styleEdition: i32 = 2024;
  maxWidth: i32 = 120;
  constructor() {}
}

/** Formats `src[0, n)` into `out` as rustfmt does; answers false when the file cannot be formatted. */
export const formatRust = (e: RustEngine, path: string, src0: u8[], n0: i32, out: Out): boolean => {
  out.n = 0;
  // rustc drops a byte order mark and normalizes CRLF line endings to LF
  // when it loads a file; the newline style (Auto) then sees only LF.
  let src = src0;
  let n = n0;
  const bom = n0 >= 3 && toI32(src0[0]) === 0xef && toI32(src0[1]) === 0xbb && toI32(src0[2]) === 0xbf ? 3 : 0;
  let hasCr = false;
  for (let i = 0; i + 1 < n0; i++) {
    if (toI32(src0[i]) === 13 && toI32(src0[i + 1]) === 10) {
      hasCr = true;
      break;
    }
  }
  if (hasCr || bom > 0) {
    src = new Array<u8>(n0 + 1);
    let k = 0;
    for (let i = bom; i < n0; i++) {
      if (toI32(src0[i]) === 13 && i + 1 < n0 && toI32(src0[i + 1]) === 10) {
        continue;
      }
      src[k] = src0[i];
      k++;
    }
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
  const r = rsFormatSource(src, n, cfg, false);
  if (r.parseFailed || r.unsupported || r.broken) {
    if (e.debug) {
      let line = 1;
      for (let i = 0; i < r.failAt && i < n; i++) {
        if (toI32(src[i]) === 10) {
          line++;
        }
      }
      const where = r.parseFailed ? `:${line}` : "";
      const what = r.unsupported ? "unsupported: " + r.why : r.broken ? "span lookup failed: " + r.why : r.why;
      console.error(`${path}${where}: ${what}`);
    }
    return false;
  }
  out.str(r.text);
  return true;
};

export const isRustName = (name: string): boolean => name.endsWith(".rs");
