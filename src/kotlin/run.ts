// The Kotlin entry point: ktfmt's pipeline over one file.

import { growI32 } from "../core/arr";
import { guessSep } from "../core/files";
import { Out } from "../core/out";
import { GEngine } from "../gdoc/engine";
import { GInput } from "../gdoc/input";
import { KBuilder, isWsOrComment } from "./builder";
import { rewriteKotlinComment } from "./comments";
import { tokenizeKotlin } from "./input";
import { KLexemes } from "./lexer";
import { KMultilineStrings } from "./mlstring";
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

/** Prints the phase times FFKPROF collected. */
export const kprofPrint = (): void => {
  const m = toI64(1000000);
  console.error(
    `kotlin: parse ${KPROF[1] / m} (${KPROF[7]} parses) passes ${KPROF[2] / m} tokenize ${KPROF[3] / m} visit ${KPROF[4] / m} layout ${KPROF[5] / m} after ${KPROF[6] / m} ms; lex ${KPROF[8] / m} parser ${KPROF[9] / m} build ${KPROF[10] / m}; reparses: steps ${KPROF[11]} commas-mapped ${KPROF[12] / m} ms; trim ${KPROF[13]} markers ${KPROF[14]} nodes ${KPROF[15]}`,
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
  KPROF[8] = KPROF[8] + (t1 - t0);
  KPROF[9] = KPROF[9] + (t2 - t1);
  KPROF[10] = KPROF[10] + (t3 - t2);
  return !e.b.failed;
};

/** The PSI dump of the tree (as the reference dumper prints it), offsets in UTF-16 units. */
export const dumpKotlin = (e: KotlinEngine, out: Out): void => {
  const src = e.lx.src;
  const n = e.lx.n;
  // UTF-16 offset of every byte offset.
  const u16 = new Array<i32>(n + 1);
  let u = 0;
  for (let i = 0; i < n; i++) {
    u16[i] = u;
    const c = toI32(src[i]);
    if (c < 0x80 || c >= 0xc0) {
      u += c >= 0xf0 ? 2 : 1;
    }
  }
  u16[n] = u;
  dumpNode(e, 0, 0, u16, out);
};

const dumpNode = (e: KotlinEngine, node: i32, depth: i32, u16: i32[], out: Out): void => {
  const tr = e.b.tree;
  const src = e.lx.src;
  out.spaces(depth);
  out.str(ktTypeName(tr.type[node]));
  out.str(` ${u16[tr.start[node]]}-${u16[tr.end[node]]}`);
  if (tr.leaf[node] === 1 || tr.first[node] < 0) {
    out.byte(32);
    for (let i = tr.start[node]; i < tr.end[node]; i++) {
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
  for (let c = tr.first[node]; c >= 0; c = tr.next[c]) {
    dumpNode(e, c, depth + 1, u16, out);
  }
};

/** Formats `src0[0, n0)` into `out` as ktfmt does; answers false when the file cannot be formatted. */
export const formatKotlin = (e: KotlinEngine, path: string, src0: u8[], n0: i32, out: Out): boolean => {
  // A byte order mark stays in front; the text after it is what is formatted.
  if (n0 >= 3 && toI32(src0[0]) === 0xef && toI32(src0[1]) === 0xbb && toI32(src0[2]) === 0xbf) {
    const rest = new Out(n0 + 1024);
    if (!formatKotlin(e, path, src0.slice(3, n0), n0 - 3, rest)) {
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
  let other = monotonicNanos() - t0;
  for (let i = 1; i < 6; i++) {
    other = other - e.profT[i];
    KPROF[i] = KPROF[i] + e.profT[i];
    e.profT[i] = toI64(0);
  }
  KPROF[6] = KPROF[6] + other;
  return ok;
};

const formatKotlin0 = (e: KotlinEngine, path: string, src0: u8[], n0: i32, out: Out): boolean => {
  // KotlinCode: a `.kt` file parses as a regular file, anything else (a
  // `.kts` file, standard input) as a script. A shebang is a comment tok.
  e.script = !path.endsWith(".kt");
  const sep = guessSep(src0, n0);
  // Tombstones and comment escapes ktfmt reserves.
  for (let i = 0; i < n0; i++) {
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
  for (let i = 0; i < n0; i++) {
    if (toI32(src0[i]) === 13) {
      b1.range(src0, a, i);
      b1.byte(10);
      if (i + 1 < n0 && toI32(src0[i + 1]) === 10) {
        i++;
      }
      a = i + 1;
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
    e.profT[2] = e.profT[2] + (monotonicNanos() - tp);
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
      KPROF[11] = KPROF[11] + toI64(1);
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
      e.profT[2] = e.profT[2] + (monotonicNanos() - ts);
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
  for (let round = 0; ; round++) {
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
    for (let i = 0; i < po.n; i++) {
      if (toI32(po.buf[i]) === 3) {
        po.buf[i] = toU8(32);
      }
    }
    // addRedundantElements, read through the tree of the text before
    // pretty printing (whose code tokens the output keeps), unless that fails.
    let mapped = 0;
    if (!sameText(po.buf, po.n, e.cur, e.curN)) {
      const tm = e.prof ? monotonicNanos() : toI64(0);
      mapped = addCommasMapped(e, po.buf, po.n);
      if (e.prof) {
        KPROF[12] = KPROF[12] + (monotonicNanos() - tm);
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
    KPROF[13] = KPROF[13] + toI64(1);
  }
  if (kHasTrimCall(e.cur, e.curN) && !ensureParsed(e, path)) {
    return false;
  }
  if (e.parsed && e.ml.format(e.cur, e.curN, e.buf2)) {
    setCur(e, e.buf2.buf, e.buf2.n);
  }
  if (e.prof) {
    KPROF[14] = KPROF[14] + toI64(e.b.nP);
    KPROF[15] = KPROF[15] + toI64(e.b.tree.n);
  }
  const res = e.cur;
  out.n = 0;
  if (sep === "\n") {
    out.range(res, 0, e.curN);
  } else {
    let q = 0;
    for (let i = 0; i < e.curN; i++) {
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
  const need = a.count + 1;
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
  // The pretty printer writes the code lexemes in order, as they were, and
  // changes only the whitespace and comments around them, so each one is
  // found by skipping whitespace (and comments, where the input had some
  // before it) from where the last one ended.
  let m = 0;
  let j = 0;
  let gap = false; // whether a comment came before this lexeme in the input
  for (let i = 0; i < a.count; i++) {
    const ty = a.type[i];
    if (isWsOrComment(ty)) {
      if (ty !== T_WHITE_SPACE) {
        gap = true;
      }
      continue;
    }
    const len = a.end[i] - a.start[i];
    // Lexemes that touched in the input touch in the output unless the
    // printer put whitespace between them (a lexeme that starts with
    // whitespace is a string part, which goes out as it was).
    const adjacent = !gap && i > 0 && a.end[i - 1] === a.start[i];
    if (!adjacent || !kSameAt(a.src, a.start[i], len, buf, n, j)) {
      j = gap ? kSkipWsAndComments(buf, n, j) : kSkipWs(buf, n, j);
    }
    gap = false;
    if (j < 0 || j + len > n) {
      return -1;
    }
    // Soft keywords the parser remapped carry another type; compare text.
    for (let k = 0; k < len; k++) {
      if (a.src[a.start[i] + k] !== buf[j + k]) {
        return -1;
      }
    }
    inStart[m] = a.start[i];
    inEnd[m] = a.end[i];
    outStart[m] = j;
    outEnd[m] = j + len;
    m++;
    j = j + len;
  }
  if (kSkipWsAndComments(buf, n, j) !== n) {
    return -1;
  }
  e.passes.reset(e.cur, e.curN);
  return e.passes.addTrailingCommasMapped(0, buf, n, inStart, inEnd, outStart, outEnd, m, e.buf2);
};

/** Whether `src[a, a + len)` occurs in `buf[0, n)` at `j`. */
const kSameAt = (src: u8[], a: i32, len: i32, buf: u8[], n: i32, j: i32): boolean => {
  if (j < 0 || j + len > n) {
    return false;
  }
  for (let k = 0; k < len; k++) {
    if (src[a + k] !== buf[j + k]) {
      return false;
    }
  }
  return true;
};

/** The first offset from `j` that is not a space, tab or newline. */
const kSkipWs = (buf: u8[], n: i32, j0: i32): i32 => {
  let j = j0;
  while (j < n) {
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
  let j = kSkipWs(buf, n, j0);
  while (j + 1 < n && toI32(buf[j]) === 47) {
    const c = toI32(buf[j + 1]);
    if (c === 47) {
      while (j < n && toI32(buf[j]) !== 10 && toI32(buf[j]) !== 13) {
        j++;
      }
    } else if (c === 42) {
      let depth = 1;
      j += 2;
      while (j < n && depth > 0) {
        if (j + 1 < n && toI32(buf[j]) === 47 && toI32(buf[j + 1]) === 42) {
          depth++;
          j += 2;
        } else if (j + 1 < n && toI32(buf[j]) === 42 && toI32(buf[j + 1]) === 47) {
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
  for (let i = 0; i + 12 <= n; i++) {
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
    let same = true;
    for (let i = 0; i < n; i++) {
      if (buf[i] !== e.cur[i]) {
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
    e.profT[1] = e.profT[1] + (monotonicNanos() - t0);
    KPROF[7] = KPROF[7] + toI64(1);
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
  tokenizeKotlin(e.inp, e.b.tree, 0, src, n);
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
    e.profT[3] = e.profT[3] + (t1 - t0);
    e.profT[4] = e.profT[4] + (t2 - t1);
    e.profT[5] = e.profT[5] + (monotonicNanos() - t2);
  }
  return ok;
};

export const isKotlinName = (name: string): boolean => name.endsWith(".kt") || name.endsWith(".kts");
