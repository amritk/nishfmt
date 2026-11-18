// A Rust-only driver for quick builds while porting:
//   nish tools/dev/rust.ts --link /tmp/rustdev && /tmp/rustdev <file>
// prints the formatted file, or exits 1 when it cannot be formatted. With
// more than one file it formats each and prints nothing (for profiling).
// It formats as nishfmt does (edition 2024, style edition 2024, width 120);
// FFEDITION, FFSTYLE (2015, 2018, 2021 or 2024) and FFWIDTH override each.

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
  if (edition !== null) {
    e.edition = parseInt(edition);
  }
  const style = getenv("FFSTYLE");
  if (style !== null) {
    // The port has the 2015-2021 and 2024 paths, not 2027's.
    const se = parseInt(style);
    if (se !== 2015 && se !== 2018 && se !== 2021 && se !== 2024) {
      console.error(`FFSTYLE=${style}: the port implements style editions 2015, 2018, 2021 and 2024`);
      return 2;
    }
    e.styleEdition = se;
  }
  const width = getenv("FFWIDTH");
  if (width !== null) {
    e.maxWidth = parseInt(width);
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
