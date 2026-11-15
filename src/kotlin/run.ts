// The Kotlin entry point: ktfmt's pipeline over one file.

import { Out } from "../core/out";
import { KBuilder } from "./builder";
import { KLexemes } from "./lexer";
import { KParser } from "./parser";
import { ktTypeName } from "./types";

/** One worker's reusable Kotlin state. */
export class KotlinEngine {
  lx: KLexemes;
  b: KBuilder;
  p: KParser;
  debug: boolean = false;
  dump: boolean = false;
  constructor() {
    this.lx = new KLexemes();
    this.b = new KBuilder(this.lx);
    this.p = new KParser(this.b);
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

/** Formats `src[0, n)` into `out`; answers false when the file cannot be formatted. */
export const formatKotlin = (e: KotlinEngine, path: string, src: u8[], n: i32, out: Out): boolean => {
  if (!parseKotlin(e, src, n)) {
    if (e.debug) {
      console.error(`${path}: does not parse`);
    }
    return false;
  }
  if (e.dump) {
    out.n = 0;
    dumpKotlin(e, out);
    return true;
  }
  return false;
};

export const isKotlinName = (name: string): boolean => name.endsWith(".kt") || name.endsWith(".kts");
