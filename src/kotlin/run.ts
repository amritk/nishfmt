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
import { ktTypeName } from "./types";
import { KVisitor } from "./visitor";

/** One worker's reusable Kotlin state. */
export class KotlinEngine {
  lx: KLexemes;
  lx2: KLexemes;
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
  debug: boolean = false;
  dump: boolean = false;
  constructor() {
    this.lx = new KLexemes();
    this.lx2 = new KLexemes();
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

/** Parses `src[0, n)` into the engine's tree; answers false when it does not parse. */
export const parseKotlin = (e: KotlinEngine, src: u8[], n: i32): boolean => {
  e.lx.lex(src, n);
  if (e.lx.failed) {
    return false;
  }
  e.b.reset();
  e.p.parseScript();
  e.b.build();
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
  // A shebang line is set aside and put back in front.
  let start = 0;
  if (n0 >= 2 && toI32(src0[0]) === 35 && toI32(src0[1]) === 33) {
    while (start < n0 && toI32(src0[start]) !== 10) {
      start++;
    }
    start = start < n0 ? start + 1 : n0;
  }
  const shebangEnd = start > 0 && toI32(src0[start - 1]) === 10 ? start - 1 : start;
  const sep = start > 0 ? guessSep(src0.slice(start, n0), n0 - start) : guessSep(src0, n0);
  // Tombstones and comment escapes ktfmt reserves.
  for (let i = start; i < n0; i++) {
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
  let a = start;
  for (let i = start; i < n0; i++) {
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
  const all = e.passes.combined(0, e.buf2);
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
    if (!ensureParsed(e, path)) {
      return false;
    }
    const ps = e.passes;
    ps.reset(e.cur, e.curN);
    const b2 = e.buf2;
    const changed = step === 0 ? ps.sortImports(0, b2) : step === 1 ? ps.dropRedundant(0, b2) : ps.addTrailingCommas(0, b2);
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
  // addRedundantElements again, read through the tree of the text before
  // pretty printing (whose code tokens the output keeps), unless that fails.
  let mapped = 0;
  if (!sameText(po.buf, po.n, e.cur, e.curN)) {
    mapped = addCommasMapped(e, po.buf, po.n);
  }
  if (mapped === 1) {
    setCur(e, e.buf2.buf, e.buf2.n);
  } else {
    setCur(e, po.buf, po.n);
    if (mapped === -1 || e.parsed) {
      if (!ensureParsed(e, path)) {
        return false;
      }
      e.passes.reset(e.cur, e.curN);
      if (e.passes.addTrailingCommas(0, e.buf2)) {
        setCur(e, e.buf2.buf, e.buf2.n);
      }
    }
  }
  if (kHasTrimCall(e.cur, e.curN) && !ensureParsed(e, path)) {
    return false;
  }
  if (e.parsed && e.ml.format(e.cur, e.curN, e.buf2)) {
    setCur(e, e.buf2.buf, e.buf2.n);
  }
  const res = e.cur;
  out.n = 0;
  if (start > 0) {
    out.range(src0, 0, shebangEnd);
    out.str("\n");
  }
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
  const b = e.lx2;
  b.lex(buf, n);
  if (b.failed) {
    return -1;
  }
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
  let m = 0;
  let j = 0;
  for (let i = 0; i < a.count; i++) {
    const ty = a.type[i];
    if (isWsOrComment(ty)) {
      continue;
    }
    while (j < b.count && isWsOrComment(b.type[j])) {
      j++;
    }
    const len = a.end[i] - a.start[i];
    if (j >= b.count || b.end[j] - b.start[j] !== len) {
      return -1;
    }
    // Soft keywords the parser remapped carry another type; compare text.
    for (let k = 0; k < len; k++) {
      if (a.src[a.start[i] + k] !== buf[b.start[j] + k]) {
        return -1;
      }
    }
    inStart[m] = a.start[i];
    inEnd[m] = a.end[i];
    outStart[m] = b.start[j];
    outEnd[m] = b.end[j];
    m++;
    j++;
  }
  while (j < b.count && isWsOrComment(b.type[j])) {
    j++;
  }
  if (j !== b.count) {
    return -1;
  }
  e.passes.reset(e.cur, e.curN);
  return e.passes.addTrailingCommasMapped(0, buf, n, inStart, inEnd, outStart, outEnd, m, e.buf2);
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
  if (!parseKotlin(e, e.cur, e.curN)) {
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
  tokenizeKotlin(e.inp, e.b.tree, 0, src, n);
  const g = e.g;
  g.reset();
  e.vis.reset(src);
  e.vis.visit(0);
  g.sync(n);
  g.drain();
  return g.layout();
};

export const isKotlinName = (name: string): boolean => name.endsWith(".kt") || name.endsWith(".kts");
