// A C++-only driver for quick builds:
//   nish tools/dev/cpp.ts --allow-panics --link /tmp/cppdev && /tmp/cppdev <file>
// prints the formatted file, or exits 1 when it cannot be formatted. It
// formats as nishfmt does by default (width 120, indent 2).

import { faultReset, faulted } from "../../src/core/fault";
import { Out } from "../../src/core/out";
import { CppEngine, formatCpp } from "../../src/cpp/run";

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
  const e = new CppEngine(120, 2);
  const prof: i64[] = [toI64(0), toI64(0), toI64(0), toI64(0), toI64(0), toI64(0)];
  faultReset();
  if (!formatCpp(e, path, src, n, out, prof) || faulted()) {
    return 1;
  }
  writeBytes(out.buf, 0, out.n);
  return 0;
};
