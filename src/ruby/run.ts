// `rubocop -a` on one file: inspect, correct and inspect again until no cop
// corrects anything (Runner#do_inspection_loop). A file that does not parse,
// or uses what this port does not handle, is left as it is.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { fault } from "../core/fault";
import { Out } from "../core/out";
import { rbSplitComma } from "./ast";
import { RbSource } from "./source";
import { RbTeam } from "./team";

const RB_MAX_ITERATIONS: i32 = 200;

// RuboCop's AllCops Include patterns (config/default.yml).
const RB_EXTENSIONS: string =
  ".rb,.arb,.axlsx,.builder,.gemfile,.gemspec,.jb,.jbuilder,.mspec,.opal,.pluginspec,.podspec,.rabl,.rake,.rbw,.ru,.ruby,.schema,.spec,.thor";
const RB_BASENAMES: string =
  ".irbrc,.pryrc,.simplecov,buildfile,Appraisals,Berksfile,Brewfile,Buildfile,Capfile,Dangerfile,Deliverfile,Fastfile,Gemfile,Guardfile,Jarfile,Mavenfile,Podfile,Puppetfile,Rakefile,rakefile,Schemafile,Snapfile,Steepfile,Thorfile,Vagrantfile";

/** Whether RuboCop inspects a file of this name by default. */
export const isRubyName = (name: string): boolean => {
  for (const ext of rbSplitComma(RB_EXTENSIONS)) {
    if (name.endsWith(ext)) {
      return true;
    }
  }
  let base = name;
  let i = name.indexOf("/");
  while (i >= 0 && i < name.length) {
    base = name.substring(i + 1, toI32(name.length));
    i = name.indexOf("/", i + 1);
  }
  if (base.endsWith("Fastfile")) {
    return true;
  }
  for (const b of rbSplitComma(RB_BASENAMES)) {
    if (base === b) {
      return true;
    }
  }
  return false;
};

/** UTF-8 bytes to code points; null for invalid UTF-8. */
const rbDecode = (src: u8[], n: i32): i32[] | null => {
  const pts: i32[] = [];
  let i = 0;
  while (i >= 0 && i < n && i < src.length) {
    const c = toI32(src[i]);
    if (c < 0x80) {
      pts.push(c);
      i++;
      continue;
    }
    let k = 0;
    let v = 0;
    if (c >= 0xc2 && c < 0xe0) {
      k = 1;
      v = c & 0x1f;
    } else if (c >= 0xe0 && c < 0xf0) {
      k = 2;
      v = c & 0x0f;
    } else if (c >= 0xf0 && c < 0xf5) {
      k = 3;
      v = c & 0x07;
    } else {
      return null;
    }
    let p = i + 1;
    for (let j = 1; j <= k; j++) {
      if (p < 0 || p >= n || p >= src.length) {
        return null;
      }
      const d = toI32(src[p]);
      if ((d & 0xc0) !== 0x80) {
        return null;
      }
      v = (v << 6) | (d & 0x3f);
      p++;
    }
    pts.push(v);
    i = p;
  }
  return pts;
};

/** A string's code points (the corrected sources are valid UTF-8). */
const rbEncode = (s: string): i32[] => {
  const n = toI32(s.length);
  const b: u8[] = [];
  for (let i = 0; i < n; i++) {
    b.push(toU8(s.charCodeAt(i)));
  }
  const r = rbDecode(b, n);
  return r === null ? [] : r;
};

export class RubyEngine {
  team: RbTeam;
  debug: boolean = false;
  // FFRBOFFENSES: print the final pass's offenses (to check cops against RuboCop's).
  dumpOffenses: boolean = false;

  constructor() {
    this.team = new RbTeam();
    this.dumpOffenses = getenv("FFRBOFFENSES") !== null;
    const only = getenv("FFRBONLY");
    if (only !== null) {
      this.team.only = only;
    }
  }
}

/** One line per offense: `path:line:col:last_line:last_col Cop` (1-based lines, 0-based columns). */
const rbDumpOffenses = (e: RubyEngine, path: string, src: RbSource): void => {
  const out: string[] = [];
  for (const c of e.team.cops) {
    const offS = c.offS;
    const offE = c.offE;
    for (let i = 0; i < offS.length && i < offE.length; i++) {
      const s = offS[i];
      const t = offE[i];
      out.push(`${path}:${src.line(s)}:${src.column(s)}:${src.line(t)}:${src.column(t)} ${c.name}`);
    }
  }
  if (out.length > 0) {
    console.error(out.join("\n"));
  }
};

/** Formats one Ruby file into `out`; false leaves it alone (does not parse, or not handled). */
/** The outcome of one inspection loop. */
class RbLoopResult {
  ok: boolean = true; // false: the source does not parse
  changed: boolean = false;
  text: string = "";
  pts: i32[];
  last: RbSource | null = null; // the source of the pass that corrected nothing
  looped: boolean = false; // stopped by the infinite-loop check

  constructor(pts: i32[]) {
    this.pts = pts;
  }
}

/** Runner#do_inspection_loop from `pts`. */
const rbInspectionLoop = (e: RubyEngine, path: string, pts0: i32[]): RbLoopResult => {
  const res = new RbLoopResult(pts0);
  let pts = pts0;
  const seen: string[] = [];
  for (let it = 0; it < RB_MAX_ITERATIONS; it++) {
    const rs = new RbSource(pts, path);
    if (!rs.valid) {
      res.ok = it > 0;
      return res;
    }
    const rw = e.team.run(rs);
    if (rw === null) {
      res.last = rs;
      return res;
    }
    res.text = rw.process(pts);
    res.changed = true;
    // Runner#check_for_infinite_loop: a source seen before ends the loop.
    for (const s of seen) {
      if (s === res.text) {
        res.looped = true;
      }
    }
    if (res.looped) {
      return res;
    }
    seen.push(res.text);
    pts = rbEncode(res.text);
    res.pts = pts;
  }
  res.looped = true;
  return res;
};

/** Formats one Ruby file into `out`; false leaves it alone (does not parse, or not handled). */
export const formatRuby = (e: RubyEngine, path: string, src: u8[], n: i32, out: Out): boolean => {
  if (n < 0 || n > src.length) {
    fault();
    return false;
  }
  for (let i = 0; i < n && i < src.length; i++) {
    if (toI32(src[i]) === 13) {
      return false;
    }
  }
  const pts0 = rbDecode(src, n);
  if (pts0 === null) {
    return false;
  }
  let r = rbInspectionLoop(e, path, pts0);
  if (!r.ok) {
    return false;
  }
  // Runner#add_redundant_disables: one pass of Lint/RedundantCopDisableDirective
  // over the settled source, reading the last pass's offenses; when it
  // corrects, the inspection loop runs again on the result.
  const last = r.last;
  // (disabled_line_ranges is never empty: config-disabled cops count, so any
  // file with a directive comment is checked.) The detection-only cops run
  // once, on the settled source, when their offenses are wanted: for
  // RedundantCopDisableDirective, or FFRBOFFENSES.
  const wantRcdd = last !== null && e.team.only.length === 0 && last.hasDirectiveText;
  if (last !== null && (wantRcdd || e.dumpOffenses)) {
    e.team.detect = true;
    e.team.run(last);
    e.team.detect = false;
    if (e.dumpOffenses) {
      rbDumpOffenses(e, path, last);
    }
  }
  if (last !== null && wantRcdd) {
    const rcdd = e.team.lintRedundantCopDisableDirective;
    rcdd.runWith(last, e.team.cops, true);
    if (!rcdd.c.rw.empty()) {
      const text = rcdd.c.rw.process(last.pts);
      const r2 = rbInspectionLoop(e, path, rbEncode(text));
      if (r2.ok) {
        if (!r2.changed) {
          r2.text = text;
          r2.changed = true;
        }
        r = r2;
      }
    }
  }
  if (!r.changed) {
    out.range(src, 0, n);
    return true;
  }
  out.str(r.text);
  return true;
};
