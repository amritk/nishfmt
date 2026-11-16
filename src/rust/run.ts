// The Rust entry point: rustfmt's pipeline over one file.
//
// Ported from rustfmt 1.9.0 (MIT OR Apache-2.0, Copyright The Rust Project
// Developers): formatting.rs, source_file.rs.

import { Out } from "../core/out";
import { RsAst } from "./ast";
import { rsAttrsContainSkip } from "./attr";
import { RsCtx, RsFile } from "./context";
import { rsDump } from "./dump";
import { RsTokens, rsLex } from "./lexer";
import { RsParser } from "./parser";
import { RsConfig } from "./shape";
import { RsVisitor } from "./visitor";

/** One file's Rust state; a fresh one formats each file, in a region of its own. */
export class RustEngine {
  debug: boolean = false;
  dump: boolean = false;
  parseOnly: boolean = false;
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
  const t = new RsTokens(src, n);
  rsLex(t);
  if (t.failed) {
    if (e.debug) {
      console.error(`${path}: lexing failed`);
    }
    return false;
  }
  const ast = new RsAst(t.nt);
  const p = new RsParser(t, ast);
  const root = p.parseCrate();
  if (p.failed || root < 0) {
    if (e.debug) {
      const at = p.p < t.nt ? t.lo[p.p] : n;
      let line = 1;
      for (let i = 0; i < at && i < n; i++) {
        if (toI32(src[i]) === 10) {
          line++;
        }
      }
      console.error(`${path}:${line}: parse failed at token ${p.p}`);
    }
    return false;
  }
  p.finishInnerAttrs();
  if (e.dump) {
    out.str(rsDump(ast, t, root));
    return true;
  }
  if (e.parseOnly) {
    return true;
  }
  const f = new RsFile(src, n, t, ast, new RsConfig());
  // #![rustfmt::skip] on the crate leaves the file as it is.
  if (rsAttrsContainSkip(new RsCtx(f), root)) {
    out.range(src, 0, n);
    return true;
  }
  const v = new RsVisitor(f);
  v.buf = new Out(n + n / 4 + 1024);
  v.lastPos = 0;
  v.skipEmptyLines(n);
  v.formatCrate(root);
  if (f.unsupported || f.broken) {
    if (e.debug) {
      console.error(`${path}: ${f.unsupported ? "unsupported: " + f.why : "span lookup failed: " + f.why}`);
    }
    return false;
  }
  // append_newline; format_lines then makes a run of trailing newlines one.
  v.buf.byte(10);
  const b = v.buf.buf;
  let m = v.buf.n;
  while (m >= 2 && toI32(b[m - 2]) === 10) {
    m--;
  }
  out.range(b, 0, m);
  return true;
};

export const isRustName = (name: string): boolean => name.endsWith(".rs");
