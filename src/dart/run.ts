// The Dart entry point: dart_format's pipeline over one file.
//
// Ported from dart_style 3.1.14-wip at 5a9534fad9ff, the commit Dart SDK
// 3.14.1 pins (BSD-3-Clause, Copyright the Dart project authors).

import { add32, atI32, mul32, newI32s, sub32 } from "../core/arr";
import { fault } from "../core/fault";
import { Out } from "../core/out";
import { stableSort } from "../core/sort";
import { DtFileConfig, dtConfigFor } from "./config";
import { DtFeature, dtFeatures } from "./features";
import { DtAst, dtNodeName, dtSig, N_NAMED_TYPE } from "./ast";
import { DtParser } from "./parser";
import { DtPiece, dtFixedState, dtKids, dtPin, dtSetStyle, dtV313 } from "./pieces";
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
      const a = atI32(toks.start, i);
      const b = atI32(toks.end, i);
      out.str(
        `${atI32(toks.kind, i)} ${atI32(toks.kw, i)} ${a} ${b} L${atI32(toks.lineS, i)}-${atI32(toks.lineE, i)} c${atI32(toks.cCount, i)} `,
      );
      out.range(src, a, b);
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
    dtsClearState(DTS_STATE);
    // The short style takes the configured width; `// dart format width=` is the tall style's.
    const sv = new DtsVisitor(toks, p.a, cfg.pageWidth);
    const text = sv.run(unit, dtLineEnding(src, n));
    if (sv.failed || dtsThrew(DTS_STATE)) {
      if (e.debug) {
        console.error(`${path}: short style: ${sv.failed ? sv.why : "dart_style would throw"}`);
      }
      return false;
    }
    out.str(text);
    return true;
  }
  // The tall style's language-versioned switches (FormattingStyle).
  dtSetStyle(ver === 3007, ver >= 3013);
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
  if (dtV313()) {
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
  dtProfAdd(DT_PROF, t0, t1, t2, t3, t4, t5);
  return true;
};

/** Zeroes the short style's counters and its "would throw" flag, DTS_STATE[0, 3). */
const dtsClearState = (st: Int32Array): void => {
  if (st.length < 3) {
    fault();
    return;
  }
  st[0] = 0;
  st[1] = 0;
  st[2] = 0;
};

/** DTS_STATE[2]: whether the short style met a form dart_style throws on. */
const dtsThrew = (st: Int32Array): boolean => {
  if (st.length > 2) {
    return st[2] !== 0;
  }
  fault();
  return true;
};

/** `b - a` of two monotonic clock readings, exact as long as it fits. */
const dtNanosBetween = (a: i64, b: i64): f64 => toF64(toI64(toU64(b) - toU64(a)));

/** Adds each phase's time to DT_PROF. */
const dtProfAdd = (prof: Float64Array, t0: i64, t1: i64, t2: i64, t3: i64, t4: i64, t5: i64): void => {
  if (prof.length < 5) {
    fault();
    return;
  }
  prof[0] = prof[0] + dtNanosBetween(t0, t1);
  prof[1] = prof[1] + dtNanosBetween(t1, t2);
  prof[2] = prof[2] + dtNanosBetween(t2, t3);
  prof[3] = prof[3] + dtNanosBetween(t3, t4);
  prof[4] = prof[4] + dtNanosBetween(t4, t5);
};

/** A language version as one number, major * 1000 + minor (minor clamped below 1000). */
const dtVer = (major: i32, minor: i32): i32 =>
  major > 1000000 ? 1000000000 : add32(mul32(major, 1000), minor < 999 ? minor : 999);

/** No `// @dart=` comment and no package: dart_style's newest version, which takes every newer side. */
const DT_VER_NEWEST: i32 = 2000000000;

/** Nanoseconds spent per phase: scan, parse, pieces, solve, output. */
export const DT_PROF = new Float64Array(8);

const dtProfReportOf = (prof: Float64Array): string => {
  if (prof.length < 5) {
    return "";
  }
  return `scan ${prof[0] / 1e6} ms, parse ${prof[1] / 1e6} ms, pieces ${prof[2] / 1e6} ms, solve ${prof[3] / 1e6} ms, output ${prof[4] / 1e6} ms`;
};

export const dtProfReport = (): string => dtProfReportOf(DT_PROF);

/** A `// dart format width=N` comment before the first token, or `dflt`. */
const dtPageWidth = (t: DtTokens, dflt: i32): i32 => {
  const cFirst = t.cFirst;
  const cCount = t.cCount;
  const cStart = t.cStart;
  const cEnd = t.cEnd;
  const src = t.src;
  if (cFirst.length < 2 || cCount.length < 2) {
    fault();
    return dflt;
  }
  const n = cCount[1];
  let ci = cFirst[1];
  for (let k = 0; k < n; k++) {
    if (ci < 0 || ci >= cStart.length || ci >= cEnd.length) {
      fault();
      return dflt;
    }
    const a = cStart[ci];
    const b = cEnd[ci];
    ci = ci + 1;
    const pre = "// dart format width=";
    const pn = toI32(pre.length);
    if (sub32(b, a) <= pn) {
      continue;
    }
    let ok = true;
    let x = a;
    for (let j = 0; j < pn; j++) {
      if (x < 0 || x >= src.length) {
        fault();
        return dflt;
      }
      if (toI32(src[x]) !== pre.charCodeAt(j)) {
        ok = false;
        break;
      }
      x = x + 1;
    }
    if (!ok) {
      continue;
    }
    let w = 0;
    for (let j = x; j < b; j++) {
      if (j < 0 || j >= src.length) {
        fault();
        return dflt;
      }
      const c = toI32(src[j]);
      if (c < 48 || c > 57 || w < 0 || w > 100000000) {
        ok = false;
        break;
      }
      w = w * 10 + (c - 48);
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
    if (i >= src.length) {
      fault();
      return "\n";
    }
    const c = toI32(src[i]);
    if (c === 13) {
      const j = i + 1;
      if (j >= n) {
        return "\n";
      }
      if (j >= src.length) {
        fault();
        return "\n";
      }
      return toI32(src[j]) === 10 ? "\r\n" : "\n";
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
  const xs = newI32s(add32(n, 1));
  if (n < 0 || n > src.length || n >= xs.length) {
    fault();
    return xs;
  }
  let u = 0;
  for (let i = 0; i < n && i < src.length && i < xs.length; i++) {
    xs[i] = u;
    const c = toI32(src[i]);
    // At most two units a byte, and n is a byte count.
    if (c >= 0xf0) {
      u = add32(u, 2);
    } else if (c < 0x80 || c >= 0xc0) {
      u = add32(u, 1);
    }
  }
  xs[n] = u;
  return xs;
};

const dtDumpNode = (a: DtAst, t: DtTokens, u16: i32[], node: i32, depth: i32, out: Out): void => {
  const k = atI32(a.kind, node);
  const from = atI32(u16, atI32(t.start, atI32(a.beg, node)));
  const to = atI32(u16, atI32(t.end, atI32(a.end, node)));
  out.str(`${depth} ${dtNodeName(k)} ${from} ${to}\n`);
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
  stableSort(kids, (x: i32, y: i32): i32 => {
    const bx = atI32(t.start, atI32(a.beg, x));
    const by = atI32(t.start, atI32(a.beg, y));
    return bx < by ? -1 : bx > by ? 1 : 0;
  });
  for (let i = 0; i < toI32(kids.length); i++) {
    dtDumpNode(a, t, u16, kids[i], add32(depth, 1), out);
  }
  if (k === N_NAMED_TYPE) {
    return;
  }
};

export const isDartName = (name: string): boolean => name.endsWith(".dart");
