// The Dart entry point: dart_format's pipeline over one file.

import { Out } from "../core/out";

/** One file's Dart state; a fresh one formats each file, in a region of its own. */
export class DartEngine {
  debug: boolean = false;
  constructor() {}
}

/** Formats `src[0, n)` into `out` as dart_format does; answers false when the file cannot be formatted. */
export const formatDart = (e: DartEngine, path: string, src: u8[], n: i32, out: Out): boolean => {
  if (e.debug) {
    console.error(`${path}: Dart is not supported yet`);
  }
  out.n = 0;
  return n < 0;
};

export const isDartName = (name: string): boolean => name.endsWith(".dart");
