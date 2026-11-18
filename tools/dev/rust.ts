// A Rust-only driver for quick builds while porting:
//   nish tools/dev/rust.ts --link /tmp/rustdev && /tmp/rustdev <file>
// prints the formatted file, or exits 1 when it cannot be formatted. With
// more than one file it formats each and prints nothing (for profiling).
// FFEDITION=2024 parses at edition 2024 instead of 2021.

import { Out } from "../../src/core/out";
import { RustEngine, formatRust } from "../../src/rust/run";

const rsDevOne = (path: string, print: boolean): i32 => {
  const read = readFileBytesSync(path);
  if (read === null) {
    return 2;
  }
  const n = toI32(read.length);
  const src = new Array<u8>(n);
  src.set(read);
  const out = new Out(n + 1024);
  const e = new RustEngine();
  e.debug = getenv("FFDEBUG") !== null;
  e.dump = getenv("FFDUMP") !== null;
  e.parseOnly = getenv("FFPARSE") !== null;
  const edition = getenv("FFEDITION");
  if (edition !== null && edition === "2024") {
    e.edition = 2024;
  }
  if (!formatRust(e, path, src, n, out)) {
    return 1;
  }
  if (print) {
    writeBytes(out.buf, 0, out.n);
  }
  return 0;
};

export const main = (): i32 => {
  const argc = toI32(process.argv.length);
  if (argc <= 2) {
    return rsDevOne(process.argv[1], true);
  }
  let failed = 0;
  for (let i = 1; i < argc; i++) {
    if (rsDevOne(process.argv[i], false) !== 0) {
      failed++;
    }
  }
  return failed > 0 ? 1 : 0;
};
