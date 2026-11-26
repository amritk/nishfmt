// The C++ entry point: one file through the clang-format-style pipeline,
// run again until it reaches clang-format's fixed point.

import { Doc, Options } from "./doc";
import { Formatter } from "./format";
import { Out } from "../core/out";
import { toCRLF } from "../core/files";
import { sliceU8s } from "../core/arr";
import { fault } from "../core/fault";
import { lex } from "./lexer";
import { CppCodePrint, cppCodePrint, cppSameCode } from "./samecode";

/** One worker's reusable C++ state: the token tables and the formatter. */
export class CppEngine {
  d: Doc;
  f: Formatter;
  once: boolean = false; // FFONCE: one run per file, to compare with a single clang-format run
  showReruns: boolean = false; // FFRERUN: name each file run again
  unsettled: boolean = false; // the last file still changed on its last run
  // A second token table, to check that a run kept the code (samecode.ts):
  // the prints of the run's input and of its output.
  chk: Doc;
  before: CppCodePrint = new CppCodePrint();
  after: CppCodePrint = new CppCodePrint();
  constructor(width: i32, indent: i32) {
    const opts = new Options();
    opts.columnLimit = width;
    opts.indentWidth = indent;
    this.d = new Doc(new Array<u8>(0), 0, opts);
    this.f = new Formatter(this.d);
    this.chk = new Doc(new Array<u8>(0), 0, opts);
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
  let printed = false;
  // (A run writes LF; a CRLF source the first run otherwise left alone has
  // settled already, and finishCpp writes its CRs back.)
  let settled = okRun && crlf && cppSameButCR(src, n, out.buf, out.n);
  while (okRun && !settled && !cppSameBytes(prev, prevN, out.buf, out.n)) {
    const once = sliceU8s(out.buf, 0, out.n);
    const onceN = toI32(once.length);
    // Each run that changed the file must have kept its code: one that did
    // not is a nishfmt bug, and the file is left as it was.
    const chk = e.chk;
    if (!printed) {
      chk.reset(prev, prevN);
      if (!lex(chk)) {
        fault();
        return false;
      }
      cppCodePrint(chk, e.before);
      printed = true;
    }
    chk.reset(once, onceN);
    if (!lex(chk)) {
      fault();
      return false;
    }
    cppCodePrint(chk, e.after);
    if (!cppSameCode(e.before, e.after)) {
      fault();
      return false;
    }
    const kept = e.before;
    e.before = e.after;
    e.after = kept;
    if (runs >= CPP_MAX_RUNS) {
      e.unsettled = true;
      return false;
    }
    runs++;
    if (e.showReruns) {
      console.error(`rerun ${runs - 1} ${path}`);
    }
    prev = once;
    prevN = onceN;
    d.reset(once, prevN);
    f.reset();
    f.setPath(path);
    out.n = 0;
    okRun = f.run(out, prof);
    if (!okRun) {
      // nishfmt's own output did not parse: a nishfmt bug.
      fault();
      return false;
    }
    settled = false;
  }
  return okRun && finishCpp(out, crlf);
};

/**
 * The most runs a file may take to settle. (mk.sh's ref-settled gives
 * clang-format its first run and five more; nishfmt, which formats the
 * source as clang-format's first run does, is given a few to spare.)
 */
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

/**
 * Whether LF text `b[0, bn)` is CRLF text `a[0, an)` with each CR before an LF
 * dropped.
 */
const cppSameButCR = (a: u8[], an: i32, b: u8[], bn: i32): boolean => {
  if (an < bn || an > a.length || bn < 0 || bn > b.length) {
    return false;
  }
  let j = 0;
  for (let i = 0; i < an && i < a.length; i++) {
    const c = a[i];
    if (c === 13 && i + 1 < an && i + 1 < a.length && a[i + 1] === 10) {
      continue;
    }
    if (j >= bn || j >= b.length || b[j] !== c) {
      return false;
    }
    j++;
  }
  return j === bn;
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
