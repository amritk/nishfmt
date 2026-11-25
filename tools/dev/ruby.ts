// A Ruby-only driver for quick builds while porting:
//   nish tools/dev/ruby.ts --allow-panics --link /tmp/rubydev && /tmp/rubydev <file>
// prints the formatted file, or exits 1 when it cannot be formatted.

import { faultReset, faulted } from "../../src/core/fault";
import { Out } from "../../src/core/out";
import { RubyEngine, formatRuby } from "../../src/ruby/run";

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
  const e = new RubyEngine();
  e.debug = getenv("FFDEBUG") !== null;
  faultReset();
  if (!formatRuby(e, path, src, n, out) || faulted()) {
    return 1;
  }
  writeBytes(out.buf, 0, out.n);
  return 0;
};
