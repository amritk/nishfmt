// The Dart entry point: dart_format's pipeline over one file.
//
// Ported from dart_style 3.1.14-wip at 5a9534fad9ff, the commit Dart SDK
// 3.14.1 pins (BSD-3-Clause, Copyright the Dart project authors).

import { Out } from "../core/out";
import { DtFileConfig, dtConfigFor } from "./config";
import { DtFeature, dtFeatures } from "./features";
import { DtAst, dtNodeName, dtSig, N_NAMED_TYPE } from "./ast";
import { DtParser } from "./parser";
import { DT_STYLE, DtPiece, dtFixedState, dtKids, dtPin } from "./pieces";
import { DtTokens, dtPredictionsHeld, dtScan, dtScanPlain } from "./scanner";
import { DtBuilder, DtCache, dtEmit, dtSolve } from "./solver";
import { DtVisitor } from "./visitor";
import { DTS_STATE } from "./short";
import { DtsVisitor } from "./shortvisit";

/** One file's Dart state; a fresh one formats each file, in a region of its own. */
export class DartEngine {
  debug: boolean = false;
  dump: string = "";
  constructor() {}
}

/** Formats `src[0, n)` into `out` as dart_format does; answers false when the file cannot be formatted. */
export const formatDart = (e: DartEngine, path: string, src: u8[], n: i32, out: Out): boolean => {
  out.n = 0;
  const t0 = monotonicNanos();
  let toks = dtScan(src, n);
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
      out.str(
        `${toks.kind[i]} ${toks.kw[i]} ${toks.start[i]} ${toks.end[i]} L${toks.lineS[i]}-${toks.lineE[i]} c${toks.cCount[i]} `,
      );
      out.range(src, toks.start[i], toks.end[i]);
      out.byte(10);
    }
    return true;
  }
  // The project: the package's language version, the configured page width.
  // dart format reads it for every file, `// @dart=` comment or not.
  const cfg = new DtFileConfig();
  if (!dtConfigFor(path, cfg)) {
    if (e.debug) {
      console.error(`${path}: project: ${cfg.why}`);
    }
    return false;
  }
  const t1 = monotonicNanos();
  // The language version, as major * 1000 + minor: the `// @dart=` comment,
  // else the package's, else the newest (DT_VER_NEWEST). The analyzer parses
  // at it and the style follows it.
  let ver = DT_VER_NEWEST;
  if (toks.verMajor >= 0) {
    ver = dtVer(toks.verMajor, toks.verMinor);
  } else if (cfg.verMajor >= 0) {
    ver = dtVer(cfg.verMajor, cfg.verMinor);
  }
  // Patterns (and so pattern `case`s) arrived in language 3.0.
  const patterns = ver >= 3000;
  const primaryCtors = ver >= 3013;
  let p = new DtParser(toks);
  p.patterns = patterns;
  p.primaryCtors = primaryCtors;
  let unit = p.parseUnit();
  if (toks.npred > 0 && (p.failed || !dtPredictionsHeld(toks))) {
    // The scanner split a `>>` the parser would not have: parse as it reads.
    if (e.debug) {
      console.error(`${path}: ${toks.npred} predicted >> splits did not hold`);
    }
    toks = dtScanPlain(src, n);
    p = new DtParser(toks);
    p.patterns = patterns;
    p.primaryCtors = primaryCtors;
    unit = p.parseUnit();
  }
  const t2 = monotonicNanos();
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
  // Syntax of a feature the version does not enable is an error dart format reports.
  // Nothing newer than 3.13 is gated, so from 3.13 on there is nothing to find.
  const feat = new DtFeature();
  if (ver < 3013) {
    dtFeatures(p.a, toks, unit, feat);
  }
  if (feat.ver > ver) {
    if (e.debug) {
      console.error(`${path}: ${feat.name} needs language ${toI32(feat.ver / 1000)}.${feat.ver % 1000}`);
    }
    return false;
  }
  // The language version picks the style: the short style up to 3.6.
  if (ver <= 3006) {
    DTS_STATE[0] = 0;
    DTS_STATE[1] = 0;
    DTS_STATE[2] = 0;
    // The short style takes the configured width; `// dart format width=` is the tall style's.
    const sv = new DtsVisitor(toks, p.a, cfg.pageWidth);
    const text = sv.run(unit, dtLineEnding(src, n));
    if (sv.failed || DTS_STATE[2] !== 0) {
      if (e.debug) {
        console.error(`${path}: short style: ${sv.failed ? sv.why : "dart_style would throw"}`);
      }
      return false;
    }
    out.str(text);
    return true;
  }
  // The tall style's language-versioned switches (FormattingStyle).
  DT_STYLE[0] = ver === 3007 ? 1 : 0;
  DT_STYLE[1] = ver >= 3013 ? 1 : 0;
  const v = new DtVisitor(toks, p.a);
  const root = v.buildUnit(unit);
  const t3 = monotonicNanos();
  if (v.failed) {
    if (e.debug) {
      console.error(`${path}: ${v.why}`);
    }
    return false;
  }
  const pageWidth = dtPageWidth(toks, cfg.pageWidth);
  if (DT_STYLE[1] !== 0) {
    // pinStateByPageWidthBeforeSolving (3.13 on); before that the writer
    // binds by page width while formatting.
    dtPinByPageWidth(root, pageWidth);
  }
  const cache = new DtCache(pageWidth, v.pf.n);
  const sol = dtSolve(cache, root, -1, 0, 0);
  const t4 = monotonicNanos();
  const b = new DtBuilder(out, src, n, dtLineEnding(src, n));
  cache.builder = b;
  dtEmit(cache, sol, root, 0, 0);
  b.finish();
  const t5 = monotonicNanos();
  DT_PROF[0] = DT_PROF[0] + toF64(t1 - t0);
  DT_PROF[1] = DT_PROF[1] + toF64(t2 - t1);
  DT_PROF[2] = DT_PROF[2] + toF64(t3 - t2);
  DT_PROF[3] = DT_PROF[3] + toF64(t4 - t3);
  DT_PROF[4] = DT_PROF[4] + toF64(t5 - t4);
  return true;
};

/** A language version as one number, major * 1000 + minor (minor clamped below 1000). */
const dtVer = (major: i32, minor: i32): i32 =>
  major > 1000000 ? 1000000000 : major * 1000 + (minor < 999 ? minor : 999);

/** No `// @dart=` comment and no package: dart_style's newest version, which takes every newer side. */
const DT_VER_NEWEST: i32 = 2000000000;

/** Nanoseconds spent per phase: scan, parse, pieces, solve, output. */
export const DT_PROF = new Float64Array(8);

export const dtProfReport = (): string =>
  `scan ${DT_PROF[0] / 1e6} ms, parse ${DT_PROF[1] / 1e6} ms, pieces ${DT_PROF[2] / 1e6} ms, solve ${DT_PROF[3] / 1e6} ms, output ${DT_PROF[4] / 1e6} ms`;

/** A `// dart format width=N` comment before the first token, or `dflt`. */
const dtPageWidth = (t: DtTokens, dflt: i32): i32 => {
  const first = t.cFirst[1];
  for (let k = 0; k < t.cCount[1]; k++) {
    const ci = first + k;
    const a = t.cStart[ci];
    const b = t.cEnd[ci];
    const pre = "// dart format width=";
    const pn = toI32(pre.length);
    if (b - a <= pn) {
      continue;
    }
    let ok = true;
    for (let j = 0; j < pn; j++) {
      if (toI32(t.src[a + j]) !== pre.charCodeAt(j)) {
        ok = false;
        break;
      }
    }
    if (!ok) {
      continue;
    }
    let w = 0;
    for (let j = a + pn; j < b; j++) {
      const c = toI32(t.src[j]);
      if (c < 48 || c > 57) {
        ok = false;
        break;
      }
      w = w * 10 + c - 48;
      if (w > 100000000) {
        ok = false;
        break;
      }
    }
    if (ok) {
      return w;
    }
  }
  return dflt;
};

/** "\r\n" when the first line ends with one, else "\n". */
const dtLineEnding = (src: u8[], n: i32): string => {
  for (let i = 0; i < n; i++) {
    const c = toI32(src[i]);
    if (c === 13) {
      return i + 1 < n && toI32(src[i + 1]) === 10 ? "\r\n" : "\n";
    }
    if (c === 10) {
      return "\n";
    }
  }
  return "\n";
};

const dtPinByPageWidth = (p: DtPiece, width: i32): void => {
  const s = dtFixedState(p, width);
  if (s >= 0) {
    dtPin(p, s);
  }
  for (const k of dtKids(p)) {
    dtPinByPageWidth(k, width);
  }
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
