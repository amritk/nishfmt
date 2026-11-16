// The Dart entry point: dart_format's pipeline over one file.
//
// Ported from dart_style (Dart SDK 3.14) (BSD-3-Clause, Copyright the Dart
// project authors).

import { Out } from "../core/out";
import { DtAst, dtNodeName, dtSig, N_NAMED_TYPE } from "./ast";
import { DtParser } from "./parser";
import { DtTokens, dtScan } from "./scanner";

/** One file's Dart state; a fresh one formats each file, in a region of its own. */
export class DartEngine {
  debug: boolean = false;
  dump: string = "";
  constructor() {}
}

/** Formats `src[0, n)` into `out` as dart_format does; answers false when the file cannot be formatted. */
export const formatDart = (e: DartEngine, path: string, src: u8[], n: i32, out: Out): boolean => {
  out.n = 0;
  const toks = dtScan(src, n);
  if (toks.failed) {
    if (e.debug) {
      console.error(`${path}: scan: ${toks.why}`);
    }
    if (e.dump === "ast") {
      out.str(`FILE ${path}\nERROR\n`);
      return true;
    }
    return false;
  }
  if (e.dump === "tokens") {
    for (let i = 0; i < toks.count; i++) {
      out.str(`${toks.kind[i]} ${toks.kw[i]} ${toks.start[i]} ${toks.end[i]} L${toks.lineS[i]}-${toks.lineE[i]} c${toks.cCount[i]} `);
      out.range(src, toks.start[i], toks.end[i]);
      out.byte(10);
    }
    return true;
  }
  const p = new DtParser(toks);
  const unit = p.parseUnit();
  if (p.failed) {
    if (e.debug) {
      console.error(`${path}: parse: ${p.why}`);
    }
    if (e.dump === "ast") {
      out.str(`FILE ${path}\nERROR\n`);
      return true;
    }
    return false;
  }
  if (e.dump === "ast") {
    out.str(`FILE ${path}\n`);
    const u16 = dtUtf16Offsets(src, n);
    dtDumpNode(p.a, toks, u16, unit, 0, out);
    return true;
  }
  return false;
};

/** The UTF-16 offset of each byte offset. */
const dtUtf16Offsets = (src: u8[], n: i32): i32[] => {
  const xs = new Array<i32>(n + 1);
  let u = 0;
  for (let i = 0; i < n; i++) {
    xs[i] = u;
    const c = toI32(src[i]);
    if (c < 0x80 || c >= 0xc0) {
      u += c >= 0xf0 ? 2 : 1;
    }
  }
  xs[n] = u;
  return xs;
};

const dtDumpNode = (a: DtAst, t: DtTokens, u16: i32[], node: i32, depth: i32, out: Out): void => {
  const k = a.kind[node];
  out.str(`${depth} ${dtNodeName(k)} ${u16[t.start[a.beg[node]]]} ${u16[t.end[a.end[node]]]}\n`);
  const kids: i32[] = [];
  const sig = dtSig(k);
  for (let i = 0; i < toI32(sig.length); i++) {
    const c = sig.charCodeAt(i);
    const v = a.f(node, i);
    if (c === 78 && v >= 0) {
      kids.push(v);
    } else if (c === 76 && v > 0) {
      for (let j = 0; j < a.len(v); j++) {
        kids.push(a.at(v, j));
      }
    }
  }
  kids.sort((x: i32, y: i32): i32 => {
    const bx = t.start[a.beg[x]];
    const by = t.start[a.beg[y]];
    return bx < by ? -1 : bx > by ? 1 : 0;
  });
  for (let i = 0; i < toI32(kids.length); i++) {
    dtDumpNode(a, t, u16, kids[i], depth + 1, out);
  }
  if (k === N_NAMED_TYPE) {
    return;
  }
};

export const isDartName = (name: string): boolean => name.endsWith(".dart");
