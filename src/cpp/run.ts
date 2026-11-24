// The C++ entry point: one file through the clang-format-style pipeline,
// run again until it reaches clang-format's fixed point.

import { Doc, Options } from "./doc";
import { Formatter } from "./format";
import { Out } from "../core/out";
import { toCRLF } from "../core/files";
import { sliceU8s } from "../core/arr";

/** One worker's reusable C++ state: the token tables and the formatter. */
export class CppEngine {
  d: Doc;
  f: Formatter;
  once: boolean = false; // FFONCE: one run per file, to compare with a single clang-format run
  showReruns: boolean = false; // FFRERUN: name each file run again
  constructor(width: i32, indent: i32) {
    const opts = new Options();
    opts.columnLimit = width;
    opts.indentWidth = indent;
    this.d = new Doc(new Array<u8>(0), 0, opts);
    this.f = new Formatter(this.d);
  }
}

/** Formats `src[0, n)` into `out`; answers false when the file does not parse. */
export const formatCpp = (e: CppEngine, path: string, src: u8[], n: i32, out: Out, prof: i64[]): boolean => {
  const d = e.d;
  d.reset(src, n);
  const f = e.f;
  f.reset();
  f.setPath(path);
  out.n = 0;
  let okRun = f.run(out, prof);
  // clang-format's derived line ending: CRLF when more than half the line
  // breaks are.
  const crlf = toI64(d.nCR) * toI64(2) > toI64(d.nLF);
  let runs = e.once ? 8 : 0;
  while (okRun && f.rerun && runs < 8 && (runs === 0 || f.rerunMacro)) {
    // clang-format's fixed point: format the result once more.
    runs++;
    if (e.showReruns) {
      console.error(`rerun ${runs} ${path}`);
    }
    const once = sliceU8s(out.buf, 0, out.n);
    d.reset(once, toI32(once.length));
    f.reset();
    f.setPath(path);
    out.n = 0;
    okRun = f.run(out, prof);
  }
  if (okRun && crlf) {
    toCRLF(out);
  }
  return okRun;
};

export const isCppName = (name: string): boolean =>
  name.endsWith(".cpp") ||
  name.endsWith(".cc") ||
  name.endsWith(".cxx") ||
  name.endsWith(".hpp") ||
  name.endsWith(".hh") ||
  name.endsWith(".hxx") ||
  name.endsWith(".h");
