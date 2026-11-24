// The Kotlin entry point: ktfmt's pipeline over one file.
//
// Ported from ktfmt 0.65's Formatter and KotlinCode (Apache License 2.0,
// Copyright (c) Meta Platforms, Inc. and affiliates).

import { atI32, growI32, sliceU8s } from "../core/arr";
import { fault } from "../core/fault";
import { guessSep } from "../core/files";
import { Out } from "../core/out";
import { GEngine } from "../gdoc/engine";
import { GInput } from "../gdoc/input";
import { KBuilder, isWsOrComment } from "./builder";
import { rewriteKotlinComment } from "./comments";
import { tokenizeKotlin } from "./input";
import { KLexemes } from "./lexer";
import { KMultilineStrings } from "./mlstring";
import { K_MAX_WIDTH } from "./options";
import { KParser } from "./parser";
import { KPasses } from "./passes";
import { T_WHITE_SPACE, ktTypeName } from "./types";
import { KVisitor } from "./visitor";

// FFKPROF: nanoseconds per phase, summed over a worker's files (module
// storage outlives the per-file regions): 1 parse, 2 passes, 3 tokenize,
// 4 visit, 5 layout, 6 the rest; 7 counts parses; 8-10 split parsing into
// lexing, parsing and building the tree; 11 and 13 count reparses after the
// passes and for the multi-line string pass; 12 times addCommasMapped; 14
// and 15 count markers and nodes.
const KPROF = new BigInt64Array(16);

/** prof[i], or 0 for a slot it does not have. */
const kprofAt = (prof: BigInt64Array, i: i32): i64 => {
  if (i >= 0 && i < prof.length) {
    return prof[i];
  }
  return toI64(0);
};

// The profile sums wrap rather than overflow: they are diagnostics, and no
// run lasts the 292 years an i64 of nanoseconds holds.

/** Adds `d` to prof[i]. */
const kprofAdd = (prof: BigInt64Array, i: i32, d: i64): void => {
  if (i >= 0 && i < prof.length) {
    prof[i] = toI64(toU64(prof[i]) + toU64(d));
  }
};

/** Adds `d` to the engine's per-file slot `xs[i]`. */
const kprofAddT = (xs: i64[], i: i32, d: i64): void => {
  if (i >= 0 && i < xs.length) {
    xs[i] = toI64(toU64(xs[i]) + toU64(d));
  }
};

/** The nanoseconds from `t0` (an earlier monotonicNanos) to `t1`. */
const kNanos = (t0: i64, t1: i64): i64 => toI64(toU64(t1) - toU64(t0));

/** Prints the phase times FFKPROF collected. */
export const kprofPrint = (): void => {
  const m = toI64(1000000);
  console.error(
    `kotlin: parse ${kprofAt(KPROF, 1) / m} (${kprofAt(KPROF, 7)} parses) passes ${kprofAt(KPROF, 2) / m} tokenize ${kprofAt(KPROF, 3) / m} visit ${kprofAt(KPROF, 4) / m} layout ${kprofAt(KPROF, 5) / m} after ${kprofAt(KPROF, 6) / m} ms; lex ${kprofAt(KPROF, 8) / m} parser ${kprofAt(KPROF, 9) / m} build ${kprofAt(KPROF, 10) / m}; reparses: steps ${kprofAt(KPROF, 11)} commas-mapped ${kprofAt(KPROF, 12) / m} ms; trim ${kprofAt(KPROF, 13)} markers ${kprofAt(KPROF, 14)} nodes ${kprofAt(KPROF, 15)}`,
  );
};

/** One worker's reusable Kotlin state. */
export class KotlinEngine {
  lx: KLexemes;
  // The code lexemes of the text before and after pretty printing.
  mInStart: i32[];
  mInEnd: i32[];
  mOutStart: i32[];
  mOutEnd: i32[];
  b: KBuilder;
  p: KParser;
  inp: GInput;
  g: GEngine;
  vis: KVisitor;
  passes: KPasses;
  ml: KMultilineStrings;
  buf1: Out;
  buf2: Out;
  // The text the current step works on, and whether `b.tree` is its parse.
  cur: u8[];
  curN: i32 = 0;
  parsed: boolean = false;
  // Whether the text parses as a script (KtScript) rather than a file.
  script: boolean = true;
  debug: boolean = false;
  dump: boolean = false;
  prof: boolean = false;
  profT: i64[];
  constructor() {
    this.profT = [toI64(0), toI64(0), toI64(0), toI64(0), toI64(0), toI64(0)];
    this.lx = new KLexemes();
    this.mInStart = new Array<i32>(256);
    this.mInEnd = new Array<i32>(256);
    this.mOutStart = new Array<i32>(256);
    this.mOutEnd = new Array<i32>(256);
    this.b = new KBuilder(this.lx);
    this.p = new KParser(this.b);
    this.inp = new GInput();
    this.g = new GEngine(this.inp);
    this.g.rewrite = rewriteKotlinComment;
    this.g.maxWidth = K_MAX_WIDTH;
    this.vis = new KVisitor(this.g, this.b.tree);
    this.passes = new KPasses(this.b.tree);
    this.ml = new KMultilineStrings(this.b.tree);
    this.buf1 = new Out(1 << 12);
    this.buf2 = new Out(1 << 12);
    this.cur = new Array<u8>(0);
  }
}

const kParse = (e: KotlinEngine): void => {
  if (e.script) {
    e.p.parseScript();
  } else {
    e.p.parseFile();
  }
};

/** Parses `src[0, n)` into the engine's tree; answers false when it does not parse. */
export const parseKotlin = (e: KotlinEngine, src: u8[], n: i32): boolean => {
  if (!e.prof) {
    e.lx.lex(src, n);
    if (e.lx.failed) {
      return false;
    }
    e.b.reset();
    kParse(e);
    e.b.build();
    return !e.b.failed;
  }
  const t0 = monotonicNanos();
  e.lx.lex(src, n);
  if (e.lx.failed) {
    return false;
  }
  const t1 = monotonicNanos();
  e.b.reset();
  kParse(e);
  const t2 = monotonicNanos();
  e.b.build();
  const t3 = monotonicNanos();
  kprofAdd(KPROF, 8, kNanos(t0, t1));
  kprofAdd(KPROF, 9, kNanos(t1, t2));
  kprofAdd(KPROF, 10, kNanos(t2, t3));
  return !e.b.failed;
};

/** The PSI dump of the tree (as the reference dumper prints it), offsets in UTF-16 units. */
export const dumpKotlin = (e: KotlinEngine, out: Out): void => {
  const src = e.lx.src;
  const n = e.lx.n;
  if (n < 0 || n > src.length) {
    fault();
    return;
  }
  // UTF-16 offset of every byte offset.
  const u16: i32[] = [];
  let u = 0;
  for (let i = 0; i < n && i < src.length; i++) {
    const c = toI32(src[i]);
    u16.push(u);
    if (c >= 0xf0) {
      if (u > 2147483645) {
        fault();
        return;
      }
      u = u + 2;
    } else if (c < 0x80 || c >= 0xc0) {
      if (u > 2147483646) {
        fault();
        return;
      }
      u = u + 1;
    }
  }
  u16.push(u);
  dumpNode(e, 0, 0, u16, out);
};

const dumpNode = (e: KotlinEngine, node: i32, depth: i32, u16: i32[], out: Out): void => {
  const tr = e.b.tree;
  const src = e.lx.src;
  out.spaces(depth);
  out.str(ktTypeName(tr.ty(node)));
  out.str(` ${atI32(u16, tr.st(node))}-${atI32(u16, tr.en(node))}`);
  if (tr.lf(node) === 1 || tr.fst(node) < 0) {
    out.byte(32);
    const b = tr.en(node);
    for (let i = tr.st(node); i < b; i++) {
      if (i < 0 || i >= src.length) {
        fault();
        return;
      }
      const c = toI32(src[i]);
      if (c === 92) {
        out.str("\\\\");
      } else if (c === 10) {
        out.str("\\n");
      } else if (c === 13) {
        out.str("\\r");
      } else {
        out.byte(c);
      }
    }
  }
  out.byte(10);
  if (depth >= 2147483647) {
    fault();
    return;
  }
  for (let c = tr.fst(node); c >= 0; c = tr.nxt(c)) {
    dumpNode(e, c, depth + 1, u16, out);
  }
};

/** Formats `src0[0, n0)` into `out` as ktfmt does; answers false when the file cannot be formatted. */
export const formatKotlin = (e: KotlinEngine, path: string, src0: u8[], n0: i32, out: Out): boolean => {
  // The caller hands the file in a buffer at least `n0` long.
  if (n0 < 0 || n0 > src0.length) {
    fault();
    return false;
  }
  // A byte order mark stays in front; the text after it is what is formatted.
  if (n0 >= 3 && src0.length >= 3 && toI32(src0[0]) === 0xef && toI32(src0[1]) === 0xbb && toI32(src0[2]) === 0xbf) {
    if (n0 > 2147482623) {
      fault();
      return false;
    }
    const rest = new Out(n0 + 1024);
    if (!formatKotlin(e, path, sliceU8s(src0, 3, n0), n0 - 3, rest)) {
      return false;
    }
    out.n = 0;
    out.range(src0, 0, 3);
    out.range(rest.buf, 0, rest.n);
    return true;
  }
  if (!e.prof) {
    return formatKotlin0(e, path, src0, n0, out);
  }
  const t0 = monotonicNanos();
  const ok = formatKotlin0(e, path, src0, n0, out);
  // The phases add up their own slots; slot 6 takes what is left.
  let other = kNanos(t0, monotonicNanos());
  const pt = e.profT;
  for (let i = 1; i < 6 && i < pt.length; i++) {
    other = kNanos(pt[i], other);
    kprofAdd(KPROF, i, pt[i]);
    pt[i] = toI64(0);
  }
  kprofAdd(KPROF, 6, other);
  return ok;
};

const formatKotlin0 = (e: KotlinEngine, path: string, src0: u8[], n0: i32, out: Out): boolean => {
  // KotlinCode: a `.kt` file parses as a regular file, anything else (a
  // `.kts` file, standard input) as a script. A shebang is a comment tok.
  e.script = !path.endsWith(".kt");
  const sep = guessSep(src0, n0);
  // Tombstones and comment escapes ktfmt reserves.
  for (let i = 0; i < n0 && i < src0.length; i++) {
    const c = toI32(src0[i]);
    if (c === 3 || c === 4 || c === 5) {
      if (e.debug) {
        console.error(`${path}: contains a reserved control character`);
      }
      return false;
    }
  }
  // convertLineSeparators: every \r\n and \r becomes \n.
  const b1 = e.buf1;
  b1.n = 0;
  let a = 0;
  let lf = false; // whether this byte is the \n of a \r\n
  for (let i = 0; i < n0 && i < src0.length; i++) {
    if (lf) {
      lf = false;
      continue;
    }
    if (toI32(src0[i]) === 13) {
      const k = i + 1;
      b1.range(src0, a, i);
      b1.byte(10);
      a = k;
      if (k < n0 && k < src0.length && toI32(src0[k]) === 10) {
        lf = true;
        a = k + 1;
      }
    }
  }
  b1.range(src0, a, n0);
  e.cur = b1.buf;
  e.curN = b1.n;
  e.parsed = false;
  if (e.dump) {
    if (!ensureParsed(e, path)) {
      return false;
    }
    out.n = 0;
    dumpKotlin(e, out);
    return true;
  }
  // sortedAndDistinctImports, dropRedundantElements, addRedundantElements:
  // at once off the first tree, else one by one.
  if (!ensureParsed(e, path)) {
    return false;
  }
  e.passes.reset(e.cur, e.curN);
  const tp = e.prof ? monotonicNanos() : toI64(0);
  const all = e.passes.combined(0, e.buf2);
  if (e.prof) {
    kprofAddT(e.profT, 2, kNanos(tp, monotonicNanos()));
  }
  if (e.passes.failed) {
    if (e.debug) {
      console.error(`${path}: ${e.passes.failure}`);
    }
    return false;
  }
  if (all === 1) {
    setCur(e, e.buf2.buf, e.buf2.n);
  }
  for (let step = 0; step < 3 && all === -1; step++) {
    if (e.prof && !e.parsed) {
      kprofAdd(KPROF, 11, toI64(1));
    }
    if (!ensureParsed(e, path)) {
      return false;
    }
    const ps = e.passes;
    ps.reset(e.cur, e.curN);
    const b2 = e.buf2;
    const ts = e.prof ? monotonicNanos() : toI64(0);
    const changed =
      step === 0 ? ps.sortImports(0, b2) : step === 1 ? ps.dropRedundant(0, b2) : ps.addTrailingCommas(0, b2);
    if (e.prof) {
      kprofAddT(e.profT, 2, kNanos(ts, monotonicNanos()));
    }
    if (ps.failed) {
      if (e.debug) {
        console.error(`${path}: ${ps.failure}`);
      }
      return false;
    }
    if (changed) {
      setCur(e, b2.buf, b2.n);
    }
  }
  // prettyPrintAndManageTrailingCommas: pretty print, and again while
  // addRedundantElements adds trailing commas to the result, so a comma
  // added after the layout is laid out too. Adding only ever adds, so it
  // converges.
  for (let round = 0; round <= 16; round++) {
    if (round === 16) {
      if (e.debug) {
        console.error(`${path}: trailing commas do not converge`);
      }
      return false;
    }
    if (!ensureParsed(e, path)) {
      return false;
    }
    if (!prettyPrint(e, e.cur, e.curN)) {
      if (e.debug) {
        console.error(`${path}: ${e.g.failure}`);
      }
      return false;
    }
    // WhitespaceTombstones: back to spaces.
    const po = e.g.out;
    const pob = po.buf;
    const pon = po.n;
    if (pon > pob.length) {
      fault();
      return false;
    }
    for (let i = 0; i < pon && i < pob.length; i++) {
      if (toI32(pob[i]) === 3) {
        pob[i] = toU8(32);
      }
    }
    // addRedundantElements, read through the tree of the text before
    // pretty printing (whose code tokens the output keeps), unless that fails.
    let mapped = 0;
    if (!sameText(po.buf, po.n, e.cur, e.curN)) {
      const tm = e.prof ? monotonicNanos() : toI64(0);
      mapped = addCommasMapped(e, po.buf, po.n);
      if (e.prof) {
        kprofAdd(KPROF, 12, kNanos(tm, monotonicNanos()));
      }
    }
    if (mapped === 1) {
      setCur(e, e.buf2.buf, e.buf2.n);
      continue;
    }
    setCur(e, po.buf, po.n);
    if (mapped === -1 || e.parsed) {
      if (!ensureParsed(e, path)) {
        return false;
      }
      e.passes.reset(e.cur, e.curN);
      if (e.passes.addTrailingCommas(0, e.buf2)) {
        setCur(e, e.buf2.buf, e.buf2.n);
        continue;
      }
    }
    break;
  }
  if (e.prof && !e.parsed && kHasTrimCall(e.cur, e.curN)) {
    kprofAdd(KPROF, 13, toI64(1));
  }
  if (kHasTrimCall(e.cur, e.curN) && !ensureParsed(e, path)) {
    return false;
  }
  if (e.parsed && e.ml.format(e.cur, e.curN, e.buf2)) {
    setCur(e, e.buf2.buf, e.buf2.n);
  }
  if (e.prof) {
    kprofAdd(KPROF, 14, toI64(e.b.nP));
    kprofAdd(KPROF, 15, toI64(e.b.tree.n));
  }
  const res = e.cur;
  out.n = 0;
  if (sep === "\n") {
    out.range(res, 0, e.curN);
  } else {
    let q = 0;
    const rn = e.curN;
    if (rn > res.length) {
      fault();
      return false;
    }
    for (let i = 0; i < rn && i < res.length; i++) {
      if (toI32(res[i]) === 10) {
        out.range(res, q, i);
        out.str(sep);
        q = i + 1;
      }
    }
    out.range(res, q, e.curN);
  }
  return true;
};

const sameText = (a: u8[], an: i32, b: u8[], bn: i32): boolean => {
  if (an !== bn) {
    return false;
  }
  for (let i = 0; i < an; i++) {
    if (i >= a.length || i >= b.length) {
      fault();
      return false;
    }
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
};

/**
 * The trailing-comma pass over the pretty printer's output `buf[0, n)` with
 * the current tree: -1 when the output's code lexemes do not line up with
 * the input's, 1 when commas went into `e.buf2`, 0 when none were needed.
 */
const addCommasMapped = (e: KotlinEngine, buf: u8[], n: i32): i32 => {
  const a = e.lx;
  const cnt = a.count;
  if (cnt < 0 || cnt > 1073741822) {
    fault();
    return -1;
  }
  const need = cnt + 1;
  if (toI32(e.mInStart.length) < need) {
    e.mInStart = growI32(e.mInStart, need * 2);
    e.mInEnd = growI32(e.mInEnd, need * 2);
    e.mOutStart = growI32(e.mOutStart, need * 2);
    e.mOutEnd = growI32(e.mOutEnd, need * 2);
  }
  const inStart = e.mInStart;
  const inEnd = e.mInEnd;
  const outStart = e.mOutStart;
  const outEnd = e.mOutEnd;
  const aType = a.type;
  const aStart = a.start;
  const aEnd = a.end;
  const aSrc = a.src;
  // The pretty printer writes the code lexemes in order, as they were, and
  // changes only the whitespace and comments around them, so each one is
  // found by skipping whitespace (and comments, where the input had some
  // before it) from where the last one ended.
  let m = 0;
  let j = 0;
  let gap = false; // whether a comment came before this lexeme in the input
  for (let i = 0; i < cnt; i++) {
    if (i >= aType.length || i >= aStart.length || i >= aEnd.length) {
      fault();
      return -1;
    }
    const ty = aType[i];
    if (isWsOrComment(ty)) {
      if (ty !== T_WHITE_SPACE) {
        gap = true;
      }
      continue;
    }
    const st = aStart[i];
    const en = aEnd[i];
    const len64 = toI64(en) - toI64(st);
    if (len64 < toI64(-2147483648) || len64 > toI64(2147483647)) {
      fault();
      return -1;
    }
    const len = toI32(len64);
    // Lexemes that touched in the input touch in the output unless the
    // printer put whitespace between them (a lexeme that starts with
    // whitespace is a string part, which goes out as it was).
    const adjacent = !gap && i > 0 && aEnd[i - 1] === st;
    if (!adjacent || !kSameAt(aSrc, st, len, buf, n, j)) {
      j = gap ? kSkipWsAndComments(buf, n, j) : kSkipWs(buf, n, j);
    }
    gap = false;
    const jEnd = toI64(j) + toI64(len);
    if (j < 0 || jEnd > toI64(n)) {
      return -1;
    }
    // Soft keywords the parser remapped carry another type; compare text.
    let x = st;
    let y = j;
    for (let k = 0; k < len; k++) {
      if (x < 0 || x >= aSrc.length || y >= buf.length) {
        fault();
        return -1;
      }
      if (aSrc[x] !== buf[y]) {
        return -1;
      }
      x++;
      y++;
    }
    if (m >= inStart.length || m >= inEnd.length || m >= outStart.length || m >= outEnd.length) {
      fault();
      return -1;
    }
    // j + len is at most n, an i32.
    const jn = toI32(jEnd);
    inStart[m] = st;
    inEnd[m] = en;
    outStart[m] = j;
    outEnd[m] = jn;
    m++;
    j = jn;
  }
  if (kSkipWsAndComments(buf, n, j) !== n) {
    return -1;
  }
  e.passes.reset(e.cur, e.curN);
  return e.passes.addTrailingCommasMapped(0, buf, n, inStart, inEnd, outStart, outEnd, m, e.buf2);
};

/** Whether `src[a, a + len)` occurs in `buf[0, n)` at `j`. */
const kSameAt = (src: u8[], a: i32, len: i32, buf: u8[], n: i32, j: i32): boolean => {
  if (j < 0 || toI64(j) + toI64(len) > toI64(n)) {
    return false;
  }
  let x = a;
  let y = j;
  for (let k = 0; k < len; k++) {
    if (x < 0 || x >= src.length || y >= buf.length) {
      fault();
      return false;
    }
    if (src[x] !== buf[y]) {
      return false;
    }
    x++;
    y++;
  }
  return true;
};

/** The first offset from `j` that is not a space, tab or newline. */
const kSkipWs = (buf: u8[], n: i32, j0: i32): i32 => {
  let j = j0;
  while (j < n) {
    if (j < 0 || j >= buf.length) {
      fault();
      return n;
    }
    const c = toI32(buf[j]);
    if (c !== 32 && c !== 9 && c !== 10 && c !== 13 && c !== 12) {
      break;
    }
    j++;
  }
  return j;
};

/** The first offset from `j` past whitespace and Kotlin comments (block comments nest). */
const kSkipWsAndComments = (buf: u8[], n: i32, j0: i32): i32 => {
  if (j0 < 0) {
    return -1;
  }
  if (n < 0) {
    return j0;
  }
  if (n > buf.length) {
    // `buf` holds the `n` bytes of the printed text.
    fault();
    return -1;
  }
  let j = kSkipWs(buf, n, j0);
  while (j >= 0 && j < n - 1 && j < buf.length - 1 && toI32(buf[j]) === 47) {
    const c = toI32(buf[j + 1]);
    if (c === 47) {
      while (j >= 0 && j < n && j < buf.length && toI32(buf[j]) !== 10 && toI32(buf[j]) !== 13) {
        j++;
      }
    } else if (c === 42) {
      let depth = 1;
      j += 2;
      while (j >= 0 && j < n && j < buf.length && depth > 0) {
        if (j < n - 1 && j < buf.length - 1 && toI32(buf[j]) === 47 && toI32(buf[j + 1]) === 42) {
          // Each level takes two bytes, so the depth stays below the length.
          if (depth >= buf.length) {
            fault();
            return -1;
          }
          depth++;
          j += 2;
        } else if (j < n - 1 && j < buf.length - 1 && toI32(buf[j]) === 42 && toI32(buf[j + 1]) === 47) {
          depth--;
          j += 2;
        } else {
          j++;
        }
      }
      if (depth > 0) {
        return -1;
      }
    } else {
      break;
    }
    j = kSkipWs(buf, n, j);
  }
  return j;
};

/** Whether `.trimIndent()` or `.trimMargin()` occurs, so the multi-line string pass has work. */
const kHasTrimCall = (src: u8[], n: i32): boolean => {
  if (n < 0) {
    return false;
  }
  if (n > src.length) {
    // `src` holds the `n` bytes of the current text.
    fault();
    return false;
  }
  // i + 12 <= n, and n is at most the length.
  for (let i = 0; i < n - 11 && i < src.length - 11; i++) {
    if (toI32(src[i]) === 116 && toI32(src[i + 1]) === 114 && toI32(src[i + 2]) === 105 && toI32(src[i + 3]) === 109) {
      const c = toI32(src[i + 4]);
      if ((c === 73 || c === 77) && toI32(src[i + 10]) === 40 && toI32(src[i + 11]) === 41) {
        return true;
      }
    }
  }
  return false;
};

/** Makes `buf[0, n)` the current text, unless it already is. */
const setCur = (e: KotlinEngine, buf: u8[], n: i32): void => {
  if (n === e.curN) {
    const cur = e.cur;
    let same = true;
    for (let i = 0; i < n; i++) {
      if (i >= buf.length || i >= cur.length) {
        fault();
        return;
      }
      if (buf[i] !== cur[i]) {
        same = false;
        break;
      }
    }
    if (same) {
      return;
    }
  }
  // The current text lives in buf1, which only the first step writes.
  e.buf1.n = 0;
  e.buf1.range(buf, 0, n);
  e.cur = e.buf1.buf;
  e.curN = n;
  e.parsed = false;
};

/** FormatterContext's lazy parse of the current text. */
const ensureParsed = (e: KotlinEngine, path: string): boolean => {
  if (e.parsed) {
    return true;
  }
  const t0 = e.prof ? monotonicNanos() : toI64(0);
  const okp = parseKotlin(e, e.cur, e.curN);
  if (e.prof) {
    kprofAddT(e.profT, 1, kNanos(t0, monotonicNanos()));
    kprofAdd(KPROF, 7, toI64(1));
  }
  if (!okp) {
    if (e.debug) {
      console.error(`${path}: does not parse`);
    }
    return false;
  }
  e.parsed = true;
  return true;
};

/** Formatter.prettyPrint over the parsed tree: the result is left in `e.g.out`. */
const prettyPrint = (e: KotlinEngine, src: u8[], n: i32): boolean => {
  const t0 = e.prof ? monotonicNanos() : toI64(0);
  if (!tokenizeKotlin(e.inp, e.b.tree, 0, src, n)) {
    e.g.failure = "unclosed comment";
    return false;
  }
  const t1 = e.prof ? monotonicNanos() : toI64(0);
  const g = e.g;
  g.reset();
  e.vis.reset(src);
  e.vis.visit(0);
  g.sync(n);
  const t2 = e.prof ? monotonicNanos() : toI64(0);
  g.drain();
  const ok = g.layout();
  if (e.prof) {
    kprofAddT(e.profT, 3, kNanos(t0, t1));
    kprofAddT(e.profT, 4, kNanos(t1, t2));
    kprofAddT(e.profT, 5, kNanos(t2, monotonicNanos()));
  }
  return ok;
};

export const isKotlinName = (name: string): boolean => name.endsWith(".kt") || name.endsWith(".kts");
