// A Dart-only driver for quick builds while porting:
//   nish tools/dev/dart.ts --link /tmp/dartdev && /tmp/dartdev <file>
// prints the formatted file, or exits 1 when it cannot be formatted.

import { Out } from "../../src/core/out";
import { DartEngine, formatDart } from "../../src/dart/run";

export const main = (): i32 => {
  const path = process.argv[1];
  const read = readFileBytesSync(path);
  if (read === null) {
    return 2;
  }
  const n = toI32(read.length);
  const src = new Array<u8>(n);
  src.set(read);
  const out = new Out(n + 1024);
  const e = new DartEngine();
  e.debug = getenv("FFDEBUG") !== null;
  if (!formatDart(e, path, src, n, out)) {
    return 1;
  }
  writeBytes(out.buf, 0, out.n);
  return 0;
};
