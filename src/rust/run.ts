// The Rust entry point: rustfmt's pipeline over one file.

import { Out } from "../core/out";
import { RsAst } from "./ast";
import { rsDump } from "./dump";
import { RsTokens, rsLex } from "./lexer";
import { RsParser } from "./parser";

/** One file's Rust state; a fresh one formats each file, in a region of its own. */
export class RustEngine {
  debug: boolean = false;
  dump: boolean = false;
  parseOnly: boolean = false;
  constructor() {}
}

/** Formats `src[0, n)` into `out` as rustfmt does; answers false when the file cannot be formatted. */
export const formatRust = (e: RustEngine, path: string, src: u8[], n: i32, out: Out): boolean => {
  out.n = 0;
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
  return false;
};

export const isRustName = (name: string): boolean => name.endsWith(".rs");
