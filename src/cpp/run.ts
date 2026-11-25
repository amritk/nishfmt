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
  unsettled: boolean = false; // the last file still changed on its last run
  constructor(width: i32, indent: i32) {
    const opts = new Options();
    opts.columnLimit = width;
    opts.indentWidth = indent;
    this.d = new Doc(new Array<u8>(0), 0, opts);
    this.f = new Formatter(this.d);
  }
}

/** Formats `src[0, n)` into `out`; answers false when the file does not parse or never settles. */
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
  // clang-format's fixed point: a CI check runs clang-format once on the
  // committed file and fails if anything changes, and clang-format's own
  // output is not always stable under a second run. So the result is
  // formatted again until a run leaves it as it is. A file whose first run
  // changes nothing is settled already, so already-formatted files take one
  // run. One still changing after the last run never settles: no output
  // passes the check, and the file is skipped.
  e.unsettled = false;
  if (e.once) {
    return okRun && finishCpp(out, crlf);
  }
  let prev = src;
  let prevN = n;
  let runs = 1;
  while (okRun && !cppSameBytes(prev, prevN, out.buf, out.n)) {
    if (runs >= CPP_MAX_RUNS) {
      e.unsettled = true;
      return false;
    }
    runs++;
    if (e.showReruns) {
      console.error(`rerun ${runs - 1} ${path}`);
    }
    const once = sliceU8s(out.buf, 0, out.n);
    prev = once;
    prevN = toI32(once.length);
    d.reset(once, prevN);
    f.reset();
    f.setPath(path);
    out.n = 0;
    okRun = f.run(out, prof);
  }
  return okRun && finishCpp(out, crlf);
};

/** The most runs a file may take to settle; mk.sh's ref-settled allows clang-format six. */
const CPP_MAX_RUNS: i32 = 8;

/** Whether `a[0, an)` and `b[0, bn)` hold the same bytes. */
const cppSameBytes = (a: u8[], an: i32, b: u8[], bn: i32): boolean => {
  if (an !== bn || an < 0 || an > a.length || bn > b.length) {
    return false;
  }
  for (let i = 0; i < an && i < a.length && i < b.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
};

/** clang-format's derived line ending, applied once the file has settled. */
const finishCpp = (out: Out, crlf: boolean): boolean => {
  if (crlf) {
    toCRLF(out);
  }
  return true;
};

export const isCppName = (name: string): boolean =>
  name.endsWith(".cpp") ||
  name.endsWith(".cc") ||
  name.endsWith(".cxx") ||
  name.endsWith(".hpp") ||
  name.endsWith(".hh") ||
  name.endsWith(".hxx") ||
  name.endsWith(".h");
