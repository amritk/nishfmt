// `rubocop -a` on one file: inspect, correct and inspect again until no cop
// corrects anything (Runner#do_inspection_loop). A file that does not parse,
// or uses what this port does not handle, is left as it is.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { Out } from "../core/out";
import { rbSplitComma } from "./ast";
import { RbSource } from "./source";
import { RbTeam } from "./team";

const RB_MAX_ITERATIONS: i32 = 200;

// RuboCop's AllCops Include patterns (config/default.yml).
const RB_EXTENSIONS: string = ".rb,.arb,.axlsx,.builder,.gemfile,.gemspec,.jb,.jbuilder,.mspec,.opal,.pluginspec,.podspec,.rabl,.rake,.rbw,.ru,.ruby,.schema,.spec,.thor";
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
  while (i >= 0) {
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
  while (i < n) {
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
    for (let j = 1; j <= k; j++) {
      if (i + j >= n) {
        return null;
      }
      const d = toI32(src[i + j]);
      if ((d & 0xc0) !== 0x80) {
        return null;
      }
      v = (v << 6) | (d & 0x3f);
    }
    pts.push(v);
    i += k + 1;
  }
  return pts;
};

/** A string's code points (the corrected sources are valid UTF-8). */
const rbEncode = (s: string): i32[] => {
  const n = toI32(s.length);
  const b = new Array<u8>(n);
  for (let i = 0; i < n; i++) {
    b[i] = toU8(s.charCodeAt(i));
  }
  const r = rbDecode(b, n);
  return r === null ? [] : r;
};

export class RubyEngine {
  team: RbTeam;
  debug: boolean = false;

  constructor() {
    this.team = new RbTeam();
    const only = getenv("FFRBONLY");
    if (only !== null) {
      this.team.only = only;
    }
  }
}

/** Formats one Ruby file into `out`; false leaves it alone (does not parse, or not handled). */
export const formatRuby = (e: RubyEngine, path: string, src: u8[], n: i32, out: Out): boolean => {
  for (let i = 0; i < n; i++) {
    if (toI32(src[i]) === 13) {
      return false;
    }
  }
  const pts0 = rbDecode(src, n);
  if (pts0 === null) {
    return false;
  }
  let pts: i32[] = pts0;
  const seen: string[] = [];
  let text = "";
  let changed = false;
  for (let it = 0; it < RB_MAX_ITERATIONS; it++) {
    const rs = new RbSource(pts, path);
    if (!rs.valid || rs.unsupportedDirectives) {
      if (it === 0) {
        return false;
      }
      break;
    }
    const rw = e.team.run(rs);
    if (rw === null) {
      break;
    }
    text = rw.process(pts);
    changed = true;
    // Runner#check_for_infinite_loop: a source seen before ends the loop.
    let loop = false;
    for (const s of seen) {
      if (s === text) {
        loop = true;
      }
    }
    if (loop) {
      break;
    }
    seen.push(text);
    pts = rbEncode(text);
  }
  if (!changed) {
    out.range(src, 0, n);
    return true;
  }
  out.str(text);
  return true;
};
