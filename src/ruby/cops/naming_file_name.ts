// Naming/FileName (detection only; Exclude: [Rakefile.rb],
// ExpectMatchingDefinition: false, Regex: nil, IgnoreExecutableScripts:
// true). Its offense is a global one (line 1, column 0, empty).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { RbCop } from "../cop";
import { RbSource } from "../source";
import { nmhAsciiDigit, nmhCps, nmhLower } from "./naming_help";
import { ssxInList } from "./style_syntax_help";

// The AllCops Include basenames with a capital letter (Config#allowed_camel_case_file?).
const NFN_CAMEL: string =
  " Appraisals Berksfile Brewfile Buildfile Capfile Dangerfile Deliverfile Fastfile Gemfile Guardfile Jarfile Mavenfile Podfile Puppetfile Rakefile Schemafile Snapfile Steepfile Thorfile Vagrantfile ";

/** The part of a path after its last `/`, and the index where it starts. */
const nfnBaseStart = (path: string): i32 => {
  let i = toI32(path.length) - 1;
  while (i >= 0 && path.charCodeAt(i) !== 47) {
    i--;
  }
  return i + 1;
};

/** Whether a directory of the path starts with `.` (`**` does not enter it); `.` and `..` excepted. */
const nfnHiddenDir = (path: string, baseStart: i32): boolean => {
  let a = 0;
  for (let i = 0; i < baseStart; i++) {
    if (path.charCodeAt(i) !== 47) {
      continue;
    }
    const part = path.substring(a, i);
    if (part.length > 0 && part !== "." && part !== ".." && part.charCodeAt(0) === 46) {
      return true;
    }
    a = i + 1;
  }
  return false;
};

/** filename_good?: the basename without a leading dot and its extension, in SNAKE_CASE. */
const nfnGood = (basename: string): boolean => {
  let b = basename;
  if (b.startsWith(".")) {
    b = b.substring(1, toI32(b.length));
  }
  // sub(/\.[^.]+$/, '')
  let k = toI32(b.length) - 1;
  while (k >= 0 && b.charCodeAt(k) !== 46) {
    k--;
  }
  if (k >= 0 && k < toI32(b.length) - 1) {
    b = b.substring(0, k);
  }
  // sub('+', '_')
  const plus = b.indexOf("+");
  if (plus >= 0) {
    b = `${b.substring(0, plus)}_${b.substring(plus + 1, toI32(b.length))}`;
  }
  // /^[\d[[:lower:]]_.?!]+$/
  const cs = nmhCps(b);
  if (cs.length === 0) {
    return false;
  }
  for (const c of cs) {
    if (!(nmhAsciiDigit(c) || nmhLower(c) || c === 95 || c === 46 || c === 63 || c === 33)) {
      return false;
    }
  }
  return true;
};

export class CopNamingFileName {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Naming/FileName");
  }
  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const path = src.p.st.path;
    if (path === "Rakefile.rb" || path === "./Rakefile.rb") {
      return;
    }
    const bs = nfnBaseStart(path);
    const base = path.substring(bs, toI32(path.length));
    // allowed_camel_case_file?
    if (base.endsWith(".gemspec") && base !== ".gemspec") {
      return;
    }
    if (!nfnHiddenDir(path, bs) && (ssxInList(NFN_CAMEL, base) || (base.endsWith("Fastfile") && !base.startsWith(".")))) {
      return;
    }
    if (nfnGood(base)) {
      return;
    }
    // bad_filename_allowed?: an executable script.
    if (src.at(0) === 35 && src.at(1) === 33) {
      return;
    }
    this.c.offense(0, 0);
  }
}
