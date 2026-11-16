// The CSharp entry point: CSharpier's pipeline over one file.

import { Out } from "../core/out";

/** One file's CSharp state; a fresh one formats each file, in a region of its own. */
export class CSharpEngine {
  debug: boolean = false;
  constructor() {}
}

/** Formats `src[0, n)` into `out` as CSharpier does; answers false when the file cannot be formatted. */
export const formatCSharp = (e: CSharpEngine, path: string, src: u8[], n: i32, out: Out): boolean => {
  if (e.debug) {
    console.error(`${path}: CSharp is not supported yet`);
  }
  out.n = 0;
  return n < 0;
};

export const isCSharpName = (name: string): boolean => name.endsWith(".cs");
