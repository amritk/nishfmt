// nishfmt: a fast multi-language formatter whose output matches each
// language's reference tool (clang-format, google-java-format, ktfmt,
// RuboCop, SwiftFormat, rustfmt, dart format, CSharpier). The CLI walks the
// paths it is given, formats every source in parallel worker processes, and
// prints a timing summary.

import { Out } from "./core/out";
import { Ignore, walk } from "./core/files";
import { CppEngine, formatCpp, isCppName } from "./cpp/run";
import { JavaEngine, formatJava, isJavaName } from "./java/run";
import { KotlinEngine, formatKotlin, isKotlinName, kprofPrint } from "./kotlin/run";
import { RubyEngine, formatRuby, isRubyName } from "./ruby/run";
import { SwiftEngine, formatSwift, isSwiftName } from "./swift/run";
import { RustEngine, formatRust, isRustName } from "./rust/run";
import { DartEngine, formatDart, isDartName } from "./dart/run";
import { CSharpEngine, formatCSharp, isCSharpName } from "./csharp/run";
import { free, regionWith } from "nish:region";

/** Languages, by the extension or name of a file; 0 is not ours. */
const LANG_CPP: i32 = 1;
const LANG_JAVA: i32 = 2;
const LANG_KOTLIN: i32 = 3;
const LANG_RUBY: i32 = 4;
const LANG_SWIFT: i32 = 5;
const LANG_RUST: i32 = 6;
const LANG_DART: i32 = 7;
const LANG_CSHARP: i32 = 8;

const langOf = (name: string): i32 => {
  if (isCppName(name)) {
    return LANG_CPP;
  }
  if (isJavaName(name)) {
    return LANG_JAVA;
  }
  if (isKotlinName(name)) {
    return LANG_KOTLIN;
  }
  if (isRubyName(name)) {
    return LANG_RUBY;
  }
  if (isSwiftName(name)) {
    return LANG_SWIFT;
  }
  if (isRustName(name)) {
    return LANG_RUST;
  }
  if (isDartName(name)) {
    return LANG_DART;
  }
  if (isCSharpName(name)) {
    return LANG_CSHARP;
  }
  return 0;
};

const MODE_STDOUT: i32 = 0;
const MODE_WRITE: i32 = 1;
const MODE_CHECK: i32 = 2;

class Cli {
  trace: boolean = false;
  once: boolean = false; // FFONCE: one run per file, to compare with a single clang-format run
  showReruns: boolean = false; // FFRERUN: name each file run again
  mode: i32 = 0;
  width: i32 = 120;
  indent: i32 = 2;
  jobs: i32 = 0;
  quiet: boolean = false;
  worker: string = "";
  stats: string = "";
  paths: string[];
  constructor() {
    this.paths = [];
  }
}

/** One worker's reusable state: the C++ engine, its output buffer and the batch of other files. */
class Engine {
  cpp: CppEngine;
  out: Out;
  job: Job;
  constructor(cli: Cli) {
    this.job = new Job();
    this.cpp = new CppEngine(cli.width, cli.indent);
    this.cpp.once = cli.once;
    this.cpp.showReruns = cli.showReruns;
    this.out = new Out(1 << 16);
  }
}

class Stats {
  prof: i64[];
  constructor() {
    this.prof = [toI64(0), toI64(0), toI64(0), toI64(0), toI64(0), toI64(0)];
  }
  files: i32 = 0;
  changed: i32 = 0;
  skipped: i32 = 0;
  bytes: i64 = 0;
}

const ms = (x: i64): i64 => x / toI64(1000000);

const usage = (): string =>
  [
    "usage: nishfmt [options] <file-or-dir>...",
    "",
    "Formats each file to match its language's reference formatter:",
    "  C++ (.cpp .cc .cxx .hpp .hh .hxx .h)  clang-format 18, LLVM style",
    "  Java (.java)                        google-java-format 1.28",
    "  Kotlin (.kt .kts)                   ktfmt 0.64",
    "  Ruby (.rb, Gemfile, .gemspec, ...)  rubocop -a 1.92.2",
    "  Swift (.swift)                      SwiftFormat 0.64.7",
    "  Rust (.rs)                          rustfmt 1.9.0, edition 2021",
    "  Dart (.dart)                        dart format 3.14",
    "  C# (.cs)                            CSharpier 1.4.0",
    "",
    "A single file with no mode prints the result to stdout.",
    "",
    "  -i, --write     rewrite files in place",
    "  --check         list files that would change; exit 1 if any",
    "  --width <n>     C++ column limit (default 120)",
    "  --indent <n>    C++ indent width (default 2)",
    "  -j <n>          worker processes (default: one per core)",
    "  -q, --quiet     no summary",
    "  -h, --help      this text",
    "",
    "In C++, a `// nishfmt off` ... `// nishfmt on` region is left as written; a file",
    "that does not parse (unbalanced brackets, unterminated literals) is left",
    "untouched and counted as skipped.",
  ].join("\n");

/** Files formatted in one region: up to this many, or until this many bytes were read. */
const BATCH_FILES: i32 = 32;
const BATCH_BYTES: i32 = 1048576;

/**
 * Files in one language but C++ to format in a region of their own: what
 * goes in, and the numbers that come out. Kotlin and Java files share one
 * engine across a batch, so its arrays grow once rather than once a file;
 * the other languages take one file a batch.
 */
class Job {
  paths: string[];
  count: i32 = 0;
  done: i32 = 0;
  lang: i32 = 0;
  mode: i32 = 0;
  quiet: boolean = false;
  // Per file k: 2k the result (0 unchanged, 1 changed, 2 skipped, 3 unreadable), 2k+1 the bytes read.
  res: i32[];
  constructor() {
    this.paths = [];
    for (let i = 0; i < BATCH_FILES; i++) {
      this.paths.push("");
    }
    this.res = new Array<i32>(2 * BATCH_FILES);
  }
}

class JobRoot {
  done: i32 = 0;
}

/** The engines a batch formats with, made when a file first needs one. */
class JobEngines {
  kotlin: KotlinEngine | null = null;
  java: JavaEngine | null = null;
}

/**
 * Formats the batch's files, leaving each result in `job.res` and the number
 * formatted in `job.done`; the caller runs it in a region of its own and
 * frees it, so all it allocates is given back when the batch is done and a
 * worker's memory does not grow with the files it has formatted.
 */
const runJob = (job: Job): JobRoot => {
  const root = new JobRoot();
  const engines = new JobEngines();
  let bytes = 0;
  let k = 0;
  while (k < job.count && (k === 0 || bytes < BATCH_BYTES)) {
    // The engines keep what they are given, so the path and the bytes are
    // copies the region allocates.
    let path = "";
    const p0 = job.paths[k];
    for (let i = 0; i < toI32(p0.length); i++) {
      path = path + String.fromCharCode(p0.charCodeAt(i));
    }
    const read = readFileBytesSync(path);
    job.res[2 * k + 1] = 0;
    if (read === null) {
      job.res[2 * k] = 3;
      k++;
      continue;
    }
    const n = toI32(read.length);
    const src = new Array<u8>(n);
    src.set(read);
    job.res[2 * k + 1] = n;
    const out = new Out(n + 1024);
    let ok = false;
    if (job.lang === LANG_KOTLIN) {
      const k0 = engines.kotlin;
      if (k0 !== null) {
        ok = formatKotlin(k0, path, src, n, out);
      } else {
        const fresh = new KotlinEngine();
        fresh.debug = getenv("FFDEBUG") !== null;
        fresh.dump = getenv("FFKTDUMP") !== null;
        fresh.prof = getenv("FFKPROF") !== null;
        engines.kotlin = fresh;
        ok = formatKotlin(fresh, path, src, n, out);
      }
    } else if (job.lang === LANG_JAVA) {
      const j0 = engines.java;
      if (j0 !== null) {
        ok = formatJava(j0, path, src, n, out);
      } else {
        const fresh = new JavaEngine();
        fresh.debug = getenv("FFDEBUG") !== null;
        engines.java = fresh;
        ok = formatJava(fresh, path, src, n, out);
      }
    } else if (job.lang === LANG_RUBY) {
      const r = new RubyEngine();
      r.debug = getenv("FFDEBUG") !== null;
      ok = formatRuby(r, path, src, n, out);
    } else if (job.lang === LANG_SWIFT) {
      const sw = new SwiftEngine();
      sw.debug = getenv("FFDEBUG") !== null;
      ok = formatSwift(sw, path, src, n, out);
    } else if (job.lang === LANG_RUST) {
      const rs = new RustEngine();
      rs.debug = getenv("FFDEBUG") !== null;
      ok = formatRust(rs, path, src, n, out);
    } else if (job.lang === LANG_DART) {
      const d = new DartEngine();
      d.debug = getenv("FFDEBUG") !== null;
      ok = formatDart(d, path, src, n, out);
    } else {
      const cs = new CSharpEngine();
      cs.debug = getenv("FFDEBUG") !== null;
      ok = formatCSharp(cs, path, src, n, out);
    }
    if (!ok) {
      job.res[2 * k] = 2;
      if (job.mode === MODE_STDOUT) {
        writeBytes(src, 0, n);
      } else if (!job.quiet) {
        console.error(`nishfmt: skipped ${path} (does not parse)`);
      }
      bytes = bytes + n;
      k++;
      continue;
    }
    let same = out.n === n;
    if (same) {
      for (let i = 0; i < n; i++) {
        if (out.buf[i] !== src[i]) {
          same = false;
          break;
        }
      }
    }
    job.res[2 * k] = same ? 0 : 1;
    if (job.mode === MODE_STDOUT) {
      writeBytes(out.buf, 0, out.n);
    } else if (!same && job.mode === MODE_WRITE) {
      if (writeFileBytesSync(path, out.buf.slice(0, out.n)) < 0) {
        console.error(`nishfmt: cannot write ${path}`);
      }
    } else if (!same && job.mode === MODE_CHECK) {
      console.log(path);
    }
    bytes = bytes + n;
    k++;

  }
  job.done = k;
  return root;
};

/** Whether files of a language share an engine within a batch. */
const batches = (lang: i32): boolean => lang === LANG_KOTLIN || lang === LANG_JAVA;

/**
 * Formats `files[a, b)`: C++ files one by one with the worker's engine, the
 * others in batches of one language, each batch in a region of its own.
 */
const formatFiles = (files: string[], a: i32, b: i32, cli: Cli, stats: Stats, eng: Engine): void => {
  // The walk does not stat names that look like sources, so a directory
  // named like one (`Directory.swift`) arrives here; it is walked once the
  // files around it are done.
  const dirs: string[] = [];
  let i = a;
  while (i < b) {
    const lang = langOf(files[i]);
    if (lang < LANG_JAVA) {
      if (formatFile(files[i], cli, stats, eng) === 3) {
        dirs.push(files[i]);
      }
      i++;
      continue;
    }
    const job = eng.job;
    job.count = 0;
    const cap = batches(lang) ? BATCH_FILES : 1;
    while (i + job.count < b && job.count < cap && langOf(files[i + job.count]) === lang) {
      job.paths[job.count] = files[i + job.count];
      if (cli.trace) {
        console.error(`file ${files[i + job.count]}`);
      }
      job.count = job.count + 1;
    }
    job.lang = lang;
    job.mode = cli.mode;
    job.quiet = cli.quiet;
    job.done = 0;
    const tr0 = monotonicNanos();
    free(regionWith(job, runJob));
    stats.prof[5] = stats.prof[5] + (monotonicNanos() - tr0);
    for (let k = 0; k < job.done; k++) {
      const res = job.res[2 * k];
      if (res === 3) {
        if (isDirectorySync(files[i + k])) {
          dirs.push(files[i + k]);
          continue;
        }
        console.error(`nishfmt: cannot read ${files[i + k]}`);
        stats.skipped = stats.skipped + 1;
        continue;
      }
      stats.files = stats.files + 1;
      stats.bytes = stats.bytes + toI64(job.res[2 * k + 1]);
      if (res === 2) {
        stats.skipped = stats.skipped + 1;
      } else if (res === 1) {
        stats.changed = stats.changed + 1;
      }
    }
    i = i + job.done;
  }
  for (const d of dirs) {
    const sub: string[] = [];
    walk(d, sub, new Ignore(), langOf);
    formatFiles(sub, 0, toI32(sub.length), cli, stats, eng);
  }
};

/** Formats one C++ file; answers 0 unchanged, 1 changed, 2 skipped, 3 a directory. */
const formatFile = (path: string, cli: Cli, stats: Stats, eng: Engine): i32 => {
  if (cli.trace) {
    console.error(`file ${path}`);
  }
  const src = readFileBytesSync(path);
  if (src === null) {
    if (isDirectorySync(path)) {
      return 3;
    }
    console.error(`nishfmt: cannot read ${path}`);
    stats.skipped = stats.skipped + 1;
    return 2;
  }
  const n = toI32(src.length);
  stats.files = stats.files + 1;
  stats.bytes = stats.bytes + toI64(n);
  const out = eng.out;
  const tr0 = monotonicNanos();
  const okRun = formatCpp(eng.cpp, path, src, n, out, stats.prof);
  stats.prof[5] = stats.prof[5] + (monotonicNanos() - tr0);
  if (!okRun) {
    stats.skipped = stats.skipped + 1;
    if (cli.mode === MODE_STDOUT) {
      writeBytes(src, 0, n);
    } else if (!cli.quiet) {
      console.error(`nishfmt: skipped ${path} (does not parse)`);
    }
    return 2;
  }
  let same = out.n === n;
  if (same) {
    for (let i = 0; i < n; i++) {
      if (out.buf[i] !== src[i]) {
        same = false;
        break;
      }
    }
  }
  if (cli.mode === MODE_STDOUT) {
    writeBytes(out.buf, 0, out.n);
    return same ? 0 : 1;
  }
  if (same) {
    return 0;
  }
  stats.changed = stats.changed + 1;
  if (cli.mode === MODE_WRITE) {
    const r = writeFileBytesSync(path, out.buf.slice(0, out.n));
    if (r < 0) {
      console.error(`nishfmt: cannot write ${path}`);
    }
  } else if (cli.mode === MODE_CHECK) {
    console.log(path);
  }
  return 1;
};

/**
 * A worker's command line run through env(1) with glibc's heap trimming
 * off: each Java or Kotlin file is formatted in a region that is freed
 * after it, and with trimming on glibc hands that memory back to the kernel
 * every time, so the next file faults it in again (about a third of the run's
 * time). Unchanged when GLIBC_TUNABLES is already set or env(1) is missing.
 */
const withMallocTunables = (argv: string[]): string[] => {
  if (getenv("GLIBC_TUNABLES") !== null || !isExecutableSync("/usr/bin/env")) {
    return argv;
  }
  const out: string[] = ["/usr/bin/env", "GLIBC_TUNABLES=glibc.malloc.trim_threshold=4294967295:glibc.malloc.mmap_threshold=33554432"];
  for (const a of argv) {
    out.push(a);
  }
  return out;
};

const parseArgs = (cli: Cli): i32 => {
  const argv = process.argv;
  let i = 1;
  while (i < toI32(argv.length)) {
    const a = argv[i];
    if (a === "-i" || a === "--write") {
      cli.mode = MODE_WRITE;
    } else if (a === "--check") {
      cli.mode = MODE_CHECK;
    } else if (a === "-q" || a === "--quiet") {
      cli.quiet = true;
    } else if (a === "-h" || a === "--help") {
      console.log(usage());
      return 0;
    } else if (a === "--width" || a === "--indent" || a === "-j") {
      if (i + 1 >= toI32(argv.length)) {
        console.error(`nishfmt: ${a} needs a value`);
        return 2;
      }
      const v = parseInt(argv[i + 1]);
      if (v <= 0) {
        console.error(`nishfmt: bad value for ${a}`);
        return 2;
      }
      if (a === "--width") {
        cli.width = v;
      } else if (a === "--indent") {
        cli.indent = v;
      } else {
        cli.jobs = v;
      }
      i++;
    } else if (a === "--worker") {
      if (i + 2 >= toI32(argv.length)) {
        return 2;
      }
      cli.worker = argv[i + 1];
      cli.stats = argv[i + 2];
      i += 2;
    } else if (a.startsWith("-")) {
      console.error(`nishfmt: unknown option ${a}\n${usage()}`);
      return 2;
    } else {
      cli.paths.push(a);
    }
    i++;
  }
  return -1;
};

const engineFor = (cli: Cli): Engine => new Engine(cli);

/**
 * Files in the next claim, `left` being unclaimed: large while much is left,
 * down to single files at the end, so no worker finishes long after the rest.
 */
const chunkSize = (left: i32, jobs: i32): i32 => {
  const n = left / ((jobs > 0 ? jobs : 4) * 16);
  return n < 1 ? 1 : n;
};

const runWorker = (cli: Cli): i32 => {
  const list = readFileSyncOrNull(cli.worker);
  if (list === null) {
    return 2;
  }
  const files: string[] = [];
  let a = 0;
  const n = toI32(list.length);
  for (let i = 0; i <= n; i++) {
    if (i === n || list.charCodeAt(i) === 10) {
      if (i > a) {
        files.push(list.substring(a, i));
      }
      a = i + 1;
    }
  }
  const stats = new Stats();
  const eng = engineFor(cli);
  // Claim chunks: creating the chunk's marker file exclusively wins it.
  const nf = toI32(files.length);
  let c = 0;
  let at = 0;
  while (at < nf) {
    const size = chunkSize(nf - at, cli.jobs);
    if (createFileExclusiveSync(`${cli.worker}.c${c}`, "", 384) >= 0) {
      formatFiles(files, at, at + size, cli, stats, eng);
    }
    at = at + size;
    c++;
  }
  writeFileSync(cli.stats, `${stats.files} ${stats.changed} ${stats.skipped} ${stats.bytes}\n`);
  if (getenv("FFKPROF") !== null) {
    kprofPrint();
  }
  if (getenv("FFPROF") !== null) {
    console.error(`worker: lex ${ms(stats.prof[0])} parse ${ms(stats.prof[1])} classify ${ms(stats.prof[2])} layout ${ms(stats.prof[3])} write ${ms(stats.prof[4])} run ${ms(stats.prof[5])} ms`);
  }
  return 0;
};

const parseStats = (path: string, into: Stats): void => {
  const s = readFileSyncOrNull(path);
  if (s === null) {
    return;
  }
  const parts: string[] = [];
  let a = 0;
  for (let i = 0; i <= toI32(s.length); i++) {
    if (i === toI32(s.length) || s.charCodeAt(i) === 32 || s.charCodeAt(i) === 10) {
      if (i > a) {
        parts.push(s.substring(a, i));
      }
      a = i + 1;
    }
  }
  if (parts.length >= 4) {
    into.files = into.files + parseInt(parts[0]);
    into.changed = into.changed + parseInt(parts[1]);
    into.skipped = into.skipped + parseInt(parts[2]);
    into.bytes = into.bytes + toI64(parseInt(parts[3]));
  }
};

export const main = (): i32 => {
  const t0 = monotonicNanos();
  const cli = new Cli();
  cli.trace = getenv("FFTRACE") !== null;
  cli.once = getenv("FFONCE") !== null;
  cli.showReruns = getenv("FFRERUN") !== null;
  const pr = parseArgs(cli);
  if (pr >= 0) {
    return pr;
  }
  if (cli.worker.length !== 0) {
    return runWorker(cli);
  }
  if (cli.paths.length === 0) {
    console.error(usage());
    return 2;
  }
  const files: string[] = [];
  const root = new Ignore();
  for (const p of cli.paths) {
    if (isDirectorySync(p)) {
      walk(p, files, root, langOf);
    } else {
      files.push(p);
    }
  }
  if (cli.mode === MODE_STDOUT && files.length !== 1) {
    console.error("nishfmt: several files: pass -i to rewrite them or --check to list changes");
    return 2;
  }
  const stats = new Stats();
  const tWalk = monotonicNanos();
  let jobs = cli.jobs > 0 ? cli.jobs : availableParallelism();
  if (cli.mode === MODE_STDOUT || files.length < 64) {
    jobs = 1;
  }
  // One worker still runs as a child when there are many files, so that it
  // gets glibc's trimming off (withMallocTunables); a run in this process
  // would fault its freed per-file regions back in for every file.
  const inProcess = cli.mode === MODE_STDOUT || files.length < 64 || getenv("GLIBC_TUNABLES") !== null;
  if (jobs === 1 && inProcess) {
    const eng = engineFor(cli);
    formatFiles(files, 0, toI32(files.length), cli, stats, eng);
    if (getenv("FFPROF") !== null) {
      console.error(`searches ${eng.cpp.f.ind.stSearches} nodes ${eng.cpp.f.ind.stNodes} pops ${eng.cpp.f.ind.stPops} depth ${eng.cpp.f.ind.stDepth} listMiss ${eng.cpp.f.ind.stListMiss} listHit ${eng.cpp.f.ind.stListHit}`);
      console.error(`lex ${ms(stats.prof[0])} parse ${ms(stats.prof[1])} classify ${ms(stats.prof[2])} layout ${ms(stats.prof[3])} write ${ms(stats.prof[4])} run-total ${ms(stats.prof[5])} ms`);
    }
  } else {
    const self = realpathSync("/proc/self/exe") ?? process.argv[0];
    const tmp = getenv("TMPDIR") ?? "/tmp";
    const tag = `${tmp}/nishfmt-${wallClockNanos()}`;
    const pids: i32[] = [];
    const listPath = `${tag}.list`;
    writeFileSync(listPath, files.join("\n"));
    for (let k = 0; k < jobs; k++) {
      const argv: string[] = [self, "--worker", listPath, `${tag}-${k}.stats`, "--width", `${cli.width}`, "--indent", `${cli.indent}`, "-j", `${jobs}`];
      if (cli.mode === MODE_WRITE) {
        argv.push("-i");
      } else {
        argv.push("--check");
      }
      if (cli.quiet) {
        argv.push("-q");
      }
      pids.push(spawn(withMallocTunables(argv)));
    }
    for (let k = 0; k < jobs; k++) {
      if (pids[k] > 0) {
        waitPid(pids[k], 0);
      }
      parseStats(`${tag}-${k}.stats`, stats);
      unlinkSync(`${tag}-${k}.stats`);
    }
    let at = 0;
    let c = 0;
    while (at < toI32(files.length)) {
      unlinkSync(`${listPath}.c${c}`);
      at = at + chunkSize(toI32(files.length) - at, jobs);
      c++;
    }
    unlinkSync(listPath);
  }
  if (getenv("FFPROF") !== null) {
    console.error(`walk ${(tWalk - t0) / toI64(1000000)} ms, format ${(monotonicNanos() - tWalk) / toI64(1000000)} ms`);
  }
  const ms = toI32((monotonicNanos() - t0) / toI64(1000000));
  if (!cli.quiet && cli.mode !== MODE_STDOUT) {
    const kb = toI32(stats.bytes / toI64(1024));
    const mbTenths = kb * 10 / 1024;
    const rate = ms > 0 ? kb * 1000 / 1024 / ms : 0;
    const verb = cli.mode === MODE_WRITE ? "reformatted" : "would reformat";
    console.error(`nishfmt: ${stats.files} files, ${verb} ${stats.changed}, skipped ${stats.skipped}; ${mbTenths / 10}.${mbTenths % 10} MB in ${ms} ms (${rate} MB/s, ${jobs} workers)`);
  }
  if (cli.mode === MODE_CHECK && stats.changed > 0) {
    return 1;
  }
  return 0;
};

