// The Swift entry point: SwiftFormat's pipeline over one file.

import { Out } from "../core/out";

/** One file's Swift state; a fresh one formats each file, in a region of its own. */
export class SwiftEngine {
  debug: boolean = false;
  constructor() {}
}

/** Formats `src[0, n)` into `out` as SwiftFormat does; answers false when the file cannot be formatted. */
export const formatSwift = (e: SwiftEngine, path: string, src: u8[], n: i32, out: Out): boolean => {
  if (e.debug) {
    console.error(`${path}: Swift is not supported yet`);
  }
  out.n = 0;
  return n < 0;
};

export const isSwiftName = (name: string): boolean => name.endsWith(".swift");
