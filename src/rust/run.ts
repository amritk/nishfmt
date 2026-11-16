// The Rust entry point: rustfmt's pipeline over one file.

import { Out } from "../core/out";

/** One file's Rust state; a fresh one formats each file, in a region of its own. */
export class RustEngine {
  debug: boolean = false;
  constructor() {}
}

/** Formats `src[0, n)` into `out` as rustfmt does; answers false when the file cannot be formatted. */
export const formatRust = (e: RustEngine, path: string, src: u8[], n: i32, out: Out): boolean => {
  if (e.debug) {
    console.error(`${path}: Rust is not supported yet`);
  }
  out.n = 0;
  return n < 0;
};

export const isRustName = (name: string): boolean => name.endsWith(".rs");
