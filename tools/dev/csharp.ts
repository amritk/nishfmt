// A CSharp-only driver for quick builds while porting:
//   nish tools/dev/csharp.ts --link /tmp/csharpdev && /tmp/csharpdev <file>
// prints the formatted file, or exits 1 when it cannot be formatted.

import { Out } from "../../src/core/out";
import { CSharpEngine, formatCSharp } from "../../src/csharp/run";

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
  const e = new CSharpEngine();
  e.debug = getenv("FFDEBUG") !== null;
  if (!formatCSharp(e, path, src, n, out)) {
    return 1;
  }
  writeBytes(out.buf, 0, out.n);
  return 0;
};
