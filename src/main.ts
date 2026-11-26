// nishfmt: a fast multi-language formatter whose output matches each
// language's reference tool (clang-format, google-java-format, ktfmt,
// RuboCop, SwiftFormat, rustfmt, dart format, CSharpier). The CLI walks the
// paths it is given, formats every source in parallel worker processes, and
// prints a timing summary.

import { fault, faultReset, faulted } from "./core/fault";
import { newU8s } from "./core/arr";
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

/** One worker's reusable state: the batch it formats next. */
class Engine {
  job: Job;
  constructor(cli: Cli) {
    this.job = new Job();
    this.job.width = cli.width;
    this.job.indent = cli.indent;
    this.job.once = cli.once;
    this.job.showReruns = cli.showReruns;
  }
}

/** The run's counts, which start at 0 and only grow (plus). */
class Stats {
  prof: i64[];
  constructor() {
    this.prof = [toI64(0), toI64(0), toI64(0), toI64(0), toI64(0), toI64(0)];
  }
  files: i64 = 0;
  changed: i64 = 0;
  skipped: i64 = 0;
  crashed: i64 = 0; // of the skipped, files a worker died on
  faulted: i64 = 0; // of the skipped, files a formatter faulted on
  bytes: i64 = 0;
}

/**
 * `a + b` for counts (files, bytes, nanoseconds, rounds), both at least 0:
 * exact in u64 below 2^63, which no count of files or bytes on disk reaches.
 */
const plus = (a: i64, b: i64): i64 => toI64(toU64(a) + toU64(b));

/** Nanoseconds from `t0` to `t1`, two monotonicNanos() readings, which are never below 0. */
const nsBetween = (t0: i64, t1: i64): i64 => (t0 >= 0 && t1 >= 0 ? t1 - t0 : 0);

/** The version `--version` prints; release-please bumps it. */
const NISHFMT_VERSION: string = "0.2.0"; // x-release-please-version

const ms = (x: i64): i64 => x / toI64(1000000);

const usage = (): string =>
  [
    "usage: nishfmt [options] <file-or-dir>...",
    "",
    "Formats each file to match its language's reference formatter:",
    "  C++ (.cpp .cc .cxx .hpp .hh .hxx .h)  clang-format 23.1.5, LLVM style",
    "  Java (.java)                        google-java-format 2.0.0",
    "  Kotlin (.kt .kts)                   ktfmt 0.65, kotlinlang style",
    "  Ruby (.rb, Gemfile, .gemspec, ...)  rubocop -a 1.92.3",
    "  Swift (.swift)                      SwiftFormat 0.64.7",
    "  Rust (.rs)                          rustfmt 1.10.0, edition 2024, max_width 120",
    "  Dart (.dart)                        dart format 3.14.1",
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
    "  -v, --version   print the version",
    "",
    "A file nishfmt cannot format exactly as the reference tool would (one that",
    "does not parse, say, or one its formatter crashes or faults on) is left",
    "untouched and counted as skipped. C++ output is formatted again until it",
    "stops changing, so that one clang-format run leaves it as it is; a file",
    "that never settles is skipped too. In C++, a `// nishfmt off` ...",
    "`// nishfmt on` region is left as written.",
    "",
    "Exit status: 0; 1 with --check when a file would change; 2 for a bad command",
    "line. A skipped file does not change it.",
  ].join("\n");

/** Files formatted in one region: up to this many, or until this many bytes were read. */
const BATCH_FILES: i32 = 32;
const BATCH_BYTES: i32 = 1048576;
/** The length of Job.res, two slots a file: 2 * BATCH_FILES. */
const BATCH_RES: i32 = 64;

/**
 * Files in one language to format in a region of their own: what goes in,
 * and the numbers that come out. C++, Kotlin and Java files share one engine
 * across a batch, so its arrays grow once rather than once a file; the other
 * languages take one file a batch.
 */
class Job {
  paths: string[];
  // The worker's progress log; `base` below is the list index of paths[0].
  log: string = "";
  // Per file k: 2k the result (0 unchanged, 1 changed, 2 skipped, 3 unreadable), 2k+1 the bytes read.
  res: i32[];
  count: i32 = 0;
  done: i32 = 0;
  lang: i32 = 0;
  mode: i32 = 0;
  base: i32 = 0;
  quiet: boolean = false;
  // The C++ engine's settings, from the command line.
  width: i32 = 120;
  indent: i32 = 2;
  once: boolean = false;
  showReruns: boolean = false;
  // C++ phase times (formatCpp's prof) and the line breaker's search
  // counts, summed over the worker's batches for FFPROF.
  prof: i64[];
  searches: i64 = 0;
  nodes: i64 = 0;
  pops: i64 = 0;
  depth: i64 = 0;
  listMiss: i64 = 0;
  listHit: i64 = 0;
  constructor() {
    this.prof = [toI64(0), toI64(0), toI64(0), toI64(0), toI64(0), toI64(0)];
    this.paths = [];
    for (let i = 0; i < BATCH_FILES; i++) {
      this.paths.push("");
    }
    this.res = new Array<i32>(BATCH_RES);
  }
}

/**
 * Records file `k` of a batch in `res` (Job.res): its result and the bytes
 * read. `k` is below the batch's count, at most BATCH_FILES, and `res` holds
 * two slots for each, so the store always happens.
 */
const setRes = (res: i32[], k: i32, result: i32, bytes: i32): void => {
  if (k >= 0 && k < 32) {
    // 32 is BATCH_FILES.
    const r = k + k;
    if (r >= 0 && r < res.length - 1) {
      res[r] = result;
      res[r + 1] = bytes;
    }
  }
};

/**
 * Whether `a[0, an)` and `b[0, bn)` hold the same bytes. A count past its
 * array's end (which Out and readFileBytesSync never give) answers false.
 */
const sameBytes = (a: u8[], an: i32, b: u8[], bn: i32): boolean => {
  if (an !== bn || an < 0 || an > a.length || bn > b.length) {
    return false;
  }
  for (let i = 0; i < an && i < a.length && i < b.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
};

class JobRoot {
  done: i32 = 0;
}

/** The engines a batch formats with, made when a file first needs one. */
class JobEngines {
  cpp: CppEngine | null = null;
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
  // C++ phase times for this batch, added to job.prof at its end: the
  // engine may keep what it is given, so it gets the region's own array.
  const prof: i64[] = [toI64(0), toI64(0), toI64(0), toI64(0), toI64(0), toI64(0)];
  const count = job.count;
  const base = job.base;
  // What the batch has read so far; it only decides when the batch is full,
  // so it stops at BATCH_BYTES. It is 0 for the first file, which always runs.
  let bytes = 0;
  let k = 0;
  // The test hooks (testCrash, testFault), read once a batch.
  const crashOn = getenv("NISHFMT_TEST_CRASH");
  const faultOn = getenv("NISHFMT_TEST_FAULT");
  while (k < count && bytes < BATCH_BYTES) {
    // The engines keep what they are given, so the path is a copy the region
    // allocates; readFileBytesSync allocates the bytes in the region itself.
    // job.paths holds BATCH_FILES entries, at least the batch's count.
    const paths = job.paths;
    if (k < 0 || k >= paths.length) {
      break;
    }
    let path = "";
    const p0 = paths[k];
    for (let i = 0; i < toI32(p0.length); i++) {
      path = path + String.fromCharCode(p0.charCodeAt(i));
    }
    // The entry's index in the worker's list, below the list's length.
    const at = toI32(toU32(base) + toU32(k));
    const read = readFileBytesSync(path);
    if (read === null) {
      setRes(job.res, k, 3, 0);
      k++;
      continue;
    }
    const src: u8[] = read;
    const n = toI32(src.length);
    let cap = 2147483647;
    if (n < 2147482624) {
      cap = n + 1024;
    }
    const out = new Out(cap);
    // The output, about the file's size, in one zero-filled block, which Out
    // would otherwise grow a byte at a time (no module held to no panic can
    // allocate an array of a length it computes).
    if (cap < 2147483647) {
      out.buf = new Array<u8>(cap);
    }
    testCrash(path, crashOn);
    faultReset();
    let ok = false;
    let unsettled = false;
    if (job.lang === LANG_CPP) {
      const c0 = engines.cpp;
      if (c0 !== null) {
        ok = formatCpp(c0, path, src, n, out, prof);
        unsettled = c0.unsettled;
      } else {
        const fresh = new CppEngine(job.width, job.indent);
        fresh.once = job.once;
        fresh.showReruns = job.showReruns;
        engines.cpp = fresh;
        ok = formatCpp(fresh, path, src, n, out, prof);
        unsettled = fresh.unsettled;
      }
    } else if (job.lang === LANG_KOTLIN) {
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
      // The Rust formatter cuts snippets from the text, which no module held
      // to no panic can make from bytes.
      rs.text = String.fromBytes(src, 0, n);
      ok = formatRust(rs, path, src, n, out);
    } else if (job.lang === LANG_DART) {
      const d = new DartEngine();
      d.debug = getenv("FFDEBUG") !== null;
      // Tokens cut their text from it, which no module held to no panic
      // can make from bytes.
      d.text = String.fromBytes(src, 0, n);
      ok = formatDart(d, path, src, n, out);
    } else {
      const cs = new CSharpEngine();
      cs.debug = getenv("FFDEBUG") !== null;
      ok = formatCSharp(cs, path, src, n, out);
    }
    testFault(path, faultOn);
    // A formatter that met a state its guards rule out faulted: its output
    // is not used, as a panic's was not, and the file is reported as a crash
    // is, since either is a nishfmt bug.
    const fell = faulted();
    if (fell) {
      ok = false;
    }
    if (!ok) {
      setRes(job.res, k, fell ? 4 : 2, n);
      if (job.mode === MODE_STDOUT) {
        writeBytes(src, 0, n);
      }
      if (fell) {
        console.error(`nishfmt: skipped ${path} (formatter fault)`);
      } else if (job.mode !== MODE_STDOUT && !job.quiet) {
        // A C++ file whose output still changes when formatted again has no
        // output a clang-format check would pass.
        console.error(`nishfmt: skipped ${path} (${unsettled ? "does not settle" : "does not parse"})`);
      }
      logEntry(job.log, at, 1, 0, 1, n, fell ? 1 : 0);
    } else {
      const same = sameBytes(out.buf, out.n, src, n);
      setRes(job.res, k, same ? 0 : 1, n);
      if (job.mode === MODE_STDOUT) {
        writeBytes(out.buf, 0, out.n);
      } else if (!same && job.mode === MODE_WRITE) {
        if (writeFileBytesSync(path, out.buf.slice(0, out.n)) < 0) {
          console.error(`nishfmt: cannot write ${path}`);
        }
      } else if (!same && job.mode === MODE_CHECK) {
        console.log(path);
      }
      logEntry(job.log, at, 1, same ? 0 : 1, 0, n, 0);
    }
    // 1048576 is BATCH_BYTES.
    if (n >= 0 && n < 1048576 && bytes >= 0 && bytes < 1048576) {
      bytes = bytes + n;
    } else {
      bytes = BATCH_BYTES;
    }
    k++;
  }
  job.done = k;
  const total = job.prof;
  for (let i = 0; i < prof.length && i < total.length; i++) {
    total[i] = plus(total[i], prof[i]);
  }
  const c1 = engines.cpp;
  if (c1 !== null) {
    const ind = c1.f.ind;
    job.searches = plus(job.searches, ind.stSearches);
    job.nodes = plus(job.nodes, ind.stNodes);
    job.pops = plus(job.pops, ind.stPops);
    job.depth = plus(job.depth, ind.stDepth);
    job.listMiss = plus(job.listMiss, ind.stListMiss);
    job.listHit = plus(job.listHit, ind.stListHit);
  }
  return root;
};

/**
 * With NISHFMT_TEST_CRASH set to a suffix (`suffix`), a worker panics on each
 * file whose path ends with it, before formatting it. No formatter panics on
 * any input, so this is how tests/run.sh's worker-crash cases take a worker
 * down.
 */
const testCrash = (path: string, suffix: string | null): void => {
  if (suffix !== null && suffix.length > 0 && path.endsWith(suffix)) {
    panic(`NISHFMT_TEST_CRASH: crashing on ${path}`);
  }
};

/**
 * With NISHFMT_TEST_FAULT set to a suffix (`suffix`), each file whose path
 * ends with it faults after its formatter ran. No input is known to fault a
 * formatter, so this is how tests/run.sh's fault cases make one.
 */
const testFault = (path: string, suffix: string | null): void => {
  if (suffix !== null && suffix.length > 0 && path.endsWith(suffix)) {
    fault();
  }
};

/** Whether files of a language share an engine within a batch. */
const batches = (lang: i32): boolean => lang === LANG_CPP || lang === LANG_KOTLIN || lang === LANG_JAVA;

/**
 * The language a file is formatted as: its own, or C++ for a name no
 * language claims (a file named on the command line, say).
 */
const langFor = (name: string): i32 => {
  const lang = langOf(name);
  return lang > 0 ? lang : LANG_CPP;
};

/**
 * Appends one finished entry of the worker's list to its progress log
 * `cli.stats` (nothing when it is "", outside a worker): its index, then the
 * files, changed, skipped, bytes and faulted files it added to the counts. The parent sums
 * the counts from these lines, and an entry with no line was never finished:
 * its worker died.
 */
const logEntry = (log: string, at: i32, files: i32, changed: i32, skipped: i32, bytes: i32, faulted: i32): void => {
  if (log.length !== 0) {
    appendFileSync(log, `${at} ${files} ${changed} ${skipped} ${bytes} ${faulted}\n`);
  }
};

/** Entry `at`, `path`, is a directory: logged as `<at> 0 0 0 0 0 d`, and kept in `dirs`. */
const logDir = (log: string, at: i32, path: string, dirs: string[]): void => {
  if (log.length !== 0) {
    appendFileSync(log, `${at} 0 0 0 0 0 d\n`);
  }
  dirs.push(path);
};

/**
 * Formats `files[a, b)` of the worker's list in batches of one language,
 * each batch in a region of its own, so a worker's memory does not grow with
 * the files it has formatted. Each entry is logged as soon as it is finished
 * (logEntry). The walk does not stat names that look like sources, so a
 * directory named like one (`Directory.swift`) arrives here: it is logged as
 * a directory and added to `dirs`, and the parent walks it.
 */
const formatFiles = (files: string[], a: i32, b: i32, cli: Cli, stats: Stats, eng: Engine, dirs: string[]): void => {
  const log = cli.stats;
  let i = a;
  // b is at most files.length (runWorker's chunks, formatInProcess's whole list).
  while (i >= 0 && i < b && i < files.length) {
    const lang = langFor(files[i]);
    const job = eng.job;
    const cap = batches(lang) ? BATCH_FILES : 1;
    // The batch: files[i, end) of one language, at most `cap` of them.
    let count = 0;
    let end = i;
    while (end >= 0 && end < b && end < files.length && count >= 0 && count < cap) {
      const f = files[end];
      if (langFor(f) !== lang) {
        break;
      }
      // job.paths holds BATCH_FILES entries, and cap is at most that.
      const paths = job.paths;
      if (count >= paths.length) {
        break;
      }
      paths[count] = f;
      if (cli.trace) {
        console.error(`file ${f}`);
      }
      count++;
      end++;
    }
    job.count = count;
    job.lang = lang;
    job.mode = cli.mode;
    job.quiet = cli.quiet;
    job.log = log;
    job.base = i;
    job.done = 0;
    const tr0 = monotonicNanos();
    free(regionWith(job, runJob));
    addRunTime(stats, tr0);
    // runJob formats at least the batch's first file and at most its count,
    // so `at` moves on and stays below `end`.
    const res = job.res;
    const done = job.done;
    let at = i;
    // 32 is BATCH_FILES.
    for (let k = 0; k >= 0 && k < 32 && k < done && k < count && at >= 0 && at < files.length; k++) {
      const r = k + k;
      if (r < 0 || r >= res.length - 1) {
        break;
      }
      const result = res[r];
      const read = res[r + 1];
      const f = files[at];
      if (result === 3) {
        if (isDirectorySync(f)) {
          logDir(log, at, f, dirs);
        } else {
          console.error(`nishfmt: cannot read ${f}`);
          stats.skipped = plus(stats.skipped, 1);
          logEntry(log, at, 0, 0, 1, 0, 0);
        }
      } else {
        stats.files = plus(stats.files, 1);
        stats.bytes = plus(stats.bytes, toI64(read));
        if (result === 2) {
          stats.skipped = plus(stats.skipped, 1);
        } else if (result === 4) {
          stats.skipped = plus(stats.skipped, 1);
          stats.faulted = plus(stats.faulted, 1);
        } else if (result === 1) {
          stats.changed = plus(stats.changed, 1);
        }
      }
      at++;
    }
    if (at <= i) {
      // No file of the batch was done: stop, and leave the rest unlogged for
      // the parent to run again (runRound).
      return;
    }
    i = at;
  }
};

/** Adds the nanoseconds since `tr0` to the time spent formatting, `stats.prof[5]` (FFPROF). */
const addRunTime = (stats: Stats, tr0: i64): void => {
  const d = nsBetween(tr0, monotonicNanos());
  const prof = stats.prof;
  if (prof.length > 5) {
    prof[5] = toI64(toU64(prof[5]) + toU64(d)); // both at least 0, as plus
  }
};

/**
 * A worker's command line run through env(1) with glibc's heap trimming
 * off: each batch of files is formatted in a region that is freed after
 * it, and with trimming on glibc hands that memory back to the kernel
 * every time, so the next file faults it in again (about a third of the run's
 * time). Unchanged when GLIBC_TUNABLES is already set or env(1) is missing.
 */
const withMallocTunables = (argv: string[]): string[] => {
  if (getenv("GLIBC_TUNABLES") !== null || !isExecutableSync("/usr/bin/env")) {
    return argv;
  }
  const out: string[] = [
    "/usr/bin/env",
    "GLIBC_TUNABLES=glibc.malloc.trim_threshold=4294967295:glibc.malloc.mmap_threshold=33554432",
  ];
  for (const a of argv) {
    out.push(a);
  }
  return out;
};

const parseArgs = (cli: Cli): i32 => {
  const argv = process.argv;
  let i = 1;
  while (i >= 0 && i < toI32(argv.length)) {
    const a = argv[i];
    // The next argument, after the values `a` takes.
    let next = i + 1;
    if (a === "-i" || a === "--write") {
      cli.mode = MODE_WRITE;
    } else if (a === "--check") {
      cli.mode = MODE_CHECK;
    } else if (a === "-q" || a === "--quiet") {
      cli.quiet = true;
    } else if (a === "-h" || a === "--help") {
      console.log(usage());
      return 0;
    } else if (a === "-v" || a === "--version") {
      console.log(`nishfmt ${NISHFMT_VERSION}`);
      return 0;
    } else if (a === "--width" || a === "--indent" || a === "-j") {
      if (next >= toI32(argv.length)) {
        console.error(`nishfmt: ${a} needs a value`);
        return 2;
      }
      const v = parseInt(argv[next]);
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
      next = next + 1;
    } else if (a === "--worker") {
      if (next >= toI32(argv.length) - 1) {
        return 2;
      }
      cli.worker = argv[next];
      cli.stats = argv[next + 1];
      next = next + 2;
    } else if (a.startsWith("-")) {
      console.error(`nishfmt: unknown option ${a}\n${usage()}`);
      return 2;
    } else {
      cli.paths.push(a);
    }
    i = next;
  }
  return -1;
};

const engineFor = (cli: Cli): Engine => new Engine(cli);

/**
 * The end of the claim that starts at entry `at` of `nf`: large while much is
 * left, down to single files at the end, so no worker finishes long after the
 * rest. It is past `at` and at most `nf` (`nf` itself when `at` is not below
 * it). Each claim is `(nf - at) / (jobs * 16)` entries, at least one, with 4
 * for `jobs` when it is not positive.
 */
const chunkEnd = (at: i32, nf: i32, jobs: i32): i32 => {
  if (at < 0 || at >= nf) {
    return nf;
  }
  const left = nf - at;
  let n = left / 64;
  if (jobs > 0) {
    if (jobs >= 134217728) {
      // jobs * 16 is past any count of entries: one entry, as left / (jobs * 16) < 1 gives.
      return at + 1;
    }
    const d = jobs * 16;
    if (d > 0) {
      n = left / d;
    }
  }
  if (n <= 1) {
    return at + 1;
  }
  // n is at most left, so at + n is at most nf: exact in u32.
  return toI32(toU32(at) + toU32(n));
};

const runWorker = (cli: Cli): i32 => {
  const list = readFileSyncOrNull(cli.worker);
  if (list === null) {
    return 2;
  }
  const text: string = list;
  const files: string[] = [];
  let a = 0;
  const n = toI32(text.length);
  for (let i = 0; i < n; i++) {
    if (text.charCodeAt(i) === 10) {
      if (i > a) {
        files.push(text.substring(a, i));
      }
      a = i + 1;
    }
  }
  if (n > a) {
    files.push(text.substring(a, n));
  }
  const stats = new Stats();
  const eng = engineFor(cli);
  const dirs: string[] = []; // the parent walks these, from the log
  // Claim chunks: creating the chunk's marker file exclusively wins it.
  const nf = toI32(files.length);
  // Each chunk has an entry, so c stays below at, and below nf.
  let c = 0;
  let at = 0;
  while (at < nf && c < nf) {
    const end = chunkEnd(at, nf, cli.jobs);
    if (createFileExclusiveSync(`${cli.worker}.c${c}`, "", 384) >= 0) {
      formatFiles(files, at, end, cli, stats, eng, dirs);
    }
    at = end;
    c++;
  }
  if (getenv("FFKPROF") !== null) {
    kprofPrint();
  }
  if (getenv("FFPROF") !== null) {
    const job = eng.job;
    console.error(
      `searches ${job.searches} nodes ${job.nodes} pops ${job.pops} depth ${job.depth} listMiss ${job.listMiss} listHit ${job.listHit}`,
    );
    // The phases come from the C++ batches, the run time from every batch.
    const phases = job.prof;
    const prof = stats.prof;
    if (phases.length >= 5 && prof.length >= 6) {
      const lex = phases[0];
      const parse = phases[1];
      const classify = phases[2];
      const layout = phases[3];
      const write = phases[4];
      const run = prof[5];
      console.error(
        `worker: lex ${ms(lex)} parse ${ms(parse)} classify ${ms(classify)} layout ${ms(layout)} write ${ms(write)} run ${ms(run)} ms`,
      );
    }
  }
  return 0;
};

/** The digits of `s[a, b)` as a number; 0 when there are none. */
const parseNum = (s: string, a: i32, b: i32): i32 => {
  let v = 0;
  // b is at most s.length (readLog).
  for (let i = a; i >= 0 && i < b && i < s.length; i++) {
    const ch = s.charCodeAt(i);
    if (ch >= 48 && ch <= 57 && v >= 0 && v < 214748364) {
      v = v * 10 + (ch - 48);
    }
  }
  return v;
};

/**
 * Reads a worker's progress log (logEntry): marks each entry of `files` it
 * finished in `done`, adds its counts to `into` and each directory to
 * `dirs`. A line without its newline is one the worker died writing, and
 * does not count.
 */
const readLog = (path: string, files: string[], done: u8[], into: Stats, dirs: string[]): void => {
  const text = readFileSyncOrNull(path);
  if (text === null) {
    return;
  }
  const s: string = text;
  // A line's fields: the entry, then the files, changed, skipped, bytes and
  // faulted files it added.
  let v0 = 0;
  let v1 = 0;
  let v2 = 0;
  let v3 = 0;
  let v4 = 0;
  let v5 = 0;
  let a = 0;
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) !== 10) {
      continue;
    }
    let f = 0;
    let w = a;
    for (let j = a; j >= 0 && j <= i && j < s.length && f < 7; j++) {
      if (j === i || s.charCodeAt(j) === 32) {
        if (f < 6) {
          const num = parseNum(s, w, j);
          if (f === 0) {
            v0 = num;
          } else if (f === 1) {
            v1 = num;
          } else if (f === 2) {
            v2 = num;
          } else if (f === 3) {
            v3 = num;
          } else if (f === 4) {
            v4 = num;
          } else {
            v5 = num;
          }
        }
        f++;
        w = j + 1;
      }
    }
    a = i + 1;
    const at = v0;
    if (f >= 6 && at >= 0 && at < toI32(done.length) && done[at] === 0) {
      done[at] = 1;
      // done has an entry for each of files.
      if (f === 7 && at < files.length) {
        dirs.push(files[at]);
      }
      // parseNum's numbers are at least 0.
      into.files = plus(into.files, toI64(v1));
      into.changed = plus(into.changed, toI64(v2));
      into.skipped = plus(into.skipped, toI64(v3));
      into.bytes = plus(into.bytes, toI64(v4));
      into.faulted = plus(into.faulted, toI64(v5));
    }
  }
};

/** What every round of a run shares: where its files go, and the counts. */
class Run {
  cli: Cli;
  stats: Stats;
  self: string;
  tag: string;
  tunables: boolean = false;
  rounds: i64 = 0;
  constructor(cli: Cli, stats: Stats, self: string, tag: string) {
    this.cli = cli;
    this.stats = stats;
    this.self = self;
    this.tag = tag;
  }
}

/** Starts one worker on the list at `listPath`, its log the next of `logs`; answers its pid. */
const startWorker = (run: Run, listPath: string, logs: string[], jobs: i32): i32 => {
  const cli = run.cli;
  const log = `${listPath}.${logs.length}.log`;
  logs.push(log);
  const argv: string[] = [
    run.self,
    "--worker",
    listPath,
    log,
    "--width",
    `${cli.width}`,
    "--indent",
    `${cli.indent}`,
    "-j",
    `${jobs}`,
  ];
  if (cli.mode === MODE_WRITE) {
    argv.push("-i");
  } else if (cli.mode === MODE_CHECK) {
    argv.push("--check");
  }
  if (cli.quiet) {
    argv.push("-q");
  }
  return spawn(run.tunables ? withMallocTunables(argv) : argv);
};

/**
 * Formats `files` in `jobs` worker processes, then whatever a worker that
 * died (a panic, a signal) left unfinished. Each worker logs every entry it
 * finishes, so an entry with no line in any log was not finished. A worker
 * formats a chunk in order, so in a chunk that was claimed the first entry
 * not finished is the one its worker died on: that entry is run again alone,
 * and the rest of the unfinished entries go to a fresh round. A file that a
 * worker of its own dies on too is left untouched and counted as skipped.
 * The files of a directory a worker logged (formatFiles) go to a round of
 * their own.
 */
const runRound = (run: Run, files: string[], jobs: i32): void => {
  const nf = toI32(files.length);
  if (nf === 0) {
    return;
  }
  const listPath = `${run.tag}-${run.rounds}.list`;
  run.rounds = plus(run.rounds, 1);
  if (createFileExclusiveSync(listPath, files.join("\n"), 384) < 0) {
    // No list for workers (TMPDIR not writable, say).
    formatInProcess(run, files);
    return;
  }
  // A worker that exits abnormally is replaced at once, so the chunks no
  // worker has claimed yet keep `jobs` workers. Workers claim chunks in
  // order, so once the last is claimed there is nothing left to replace one
  // for; and there is at most one replacement a chunk, so workers that die
  // before claiming one cannot respawn forever.
  // Each chunk has an entry, so there are at most nf of them.
  let chunks = 0;
  for (let at = 0; at < nf && chunks < nf; at = chunkEnd(at, nf, jobs)) {
    chunks++;
  }
  const lastChunk = `${listPath}.c${chunks - 1}`;
  const logs: string[] = [];
  // live is at most k, below jobs.
  let live = 0;
  for (let k = 0; k < jobs && live < jobs; k++) {
    if (startWorker(run, listPath, logs, jobs) > 0) {
      live++;
    }
  }
  if (live === 0) {
    // No worker would start (a process limit, say): nothing was formatted.
    unlinkSync(listPath);
    formatInProcess(run, files);
    return;
  }
  while (live > 0) {
    // waitPid answers the pid and the status; an answer without both is an
    // error, as a pid of 0 or less is.
    const w = waitPid(-1, 0);
    if (w.length < 2 || w[0] <= 0) {
      break;
    }
    const status = w[1];
    // The worker that exited, unless a replacement takes its place.
    let replaced = false;
    if (status !== 0 && chunks > 0 && readFileSyncOrNull(lastChunk) === null) {
      chunks--;
      replaced = startWorker(run, listPath, logs, jobs) > 0;
    }
    if (!replaced) {
      live--;
    }
  }
  const done = newU8s(nf);
  const dirs: string[] = [];
  for (const log of logs) {
    readLog(log, files, done, run.stats, dirs);
    unlinkSync(log);
  }
  const culprits: string[] = [];
  const rest: string[] = [];
  let at = 0;
  let c = 0;
  while (at < nf && c < nf) {
    const end = chunkEnd(at, nf, jobs);
    // The marker is there when a worker claimed the chunk.
    let first = unlinkSync(`${listPath}.c${c}`) === 0;
    // done and files both have nf entries, and end is at most nf.
    for (let i = at; i >= 0 && i < end && i < done.length && i < files.length; i++) {
      if (done[i] === 0) {
        if (first) {
          culprits.push(files[i]);
          first = false;
        } else {
          rest.push(files[i]);
        }
      }
    }
    at = end;
    c++;
  }
  unlinkSync(listPath);
  if (dirs.length > 0) {
    const sub: string[] = [];
    for (const d of dirs) {
      walk(d, sub, new Ignore(), langOf);
    }
    runRound(run, sub, jobs);
  }
  if (culprits.length === 0 && rest.length === 0) {
    return;
  }
  if (nf === 1 && files.length > 0) {
    crashed(run, files[0]);
    return;
  }
  if (culprits.length === 0) {
    // No worker claimed what is left (none started, say): each entry alone.
    for (const f of rest) {
      runRound(run, [f], 1);
    }
    return;
  }
  for (const f of culprits) {
    runRound(run, [f], 1);
  }
  if (rest.length > 0) {
    runRound(run, rest, jobs);
  }
};

/**
 * Formats `files` in this process, for a round that cannot have workers (no
 * list could be written, or none would start), as nishfmt did for few files
 * before it had workers to take a panic. A panic here ends the run.
 */
const formatInProcess = (run: Run, files: string[]): void => {
  const dirs: string[] = [];
  formatFiles(files, 0, toI32(files.length), run.cli, run.stats, engineFor(run.cli), dirs);
  for (const d of dirs) {
    const sub: string[] = [];
    walk(d, sub, new Ignore(), langOf);
    formatInProcess(run, sub);
  }
};

/**
 * A worker of its own died on `path`: the file is left as it is (printed as
 * it is, with no mode) and counted as skipped.
 */
const crashed = (run: Run, path: string): void => {
  const stats = run.stats;
  stats.files = plus(stats.files, 1);
  stats.skipped = plus(stats.skipped, 1);
  stats.crashed = plus(stats.crashed, 1);
  const src = readFileBytesSync(path);
  if (src !== null) {
    stats.bytes = plus(stats.bytes, toI64(src.length));
    if (run.cli.mode === MODE_STDOUT) {
      writeBytes(src, 0, toI32(src.length));
    }
  }
  console.error(`nishfmt: skipped ${path} (formatter crashed)`);
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
  // Files are formatted in worker processes, even one file, so that a
  // formatter that panics takes down only its worker (runRound). Many files
  // run with glibc's heap trimming off (withMallocTunables).
  const argv = process.argv;
  const self = realpathSync("/proc/self/exe") ?? (argv.length > 0 ? argv[0] : "");
  const tmp = getenv("TMPDIR") ?? "/tmp";
  const run = new Run(cli, stats, self, `${tmp}/nishfmt-${wallClockNanos()}`);
  run.tunables = files.length >= 64;
  runRound(run, files, jobs);
  if (getenv("FFPROF") !== null) {
    const tFormat = nsBetween(tWalk, monotonicNanos());
    console.error(`walk ${nsBetween(t0, tWalk) / toI64(1000000)} ms, format ${tFormat / toI64(1000000)} ms`);
  }
  const ms = toI32(nsBetween(t0, monotonicNanos()) / toI64(1000000));
  if (!cli.quiet && cli.mode !== MODE_STDOUT) {
    const kb = toI32(stats.bytes / toI64(1024));
    // In i64, where an i32 kb times 1000 fits; each quotient fits an i32 again.
    const mbTenths = toI32((toI64(kb) * toI64(10)) / toI64(1024));
    const perSec = toI32((toI64(kb) * toI64(1000)) / toI64(1024));
    const rate = ms > 0 ? perSec / ms : 0;
    const verb = cli.mode === MODE_WRITE ? "reformatted" : "would reformat";
    // The skipped files that were nishfmt bugs: workers that died, formatters that faulted.
    let crash = "";
    if (stats.crashed > 0 && stats.faulted > 0) {
      crash = ` (${stats.crashed} crashed, ${stats.faulted} faulted)`;
    } else if (stats.crashed > 0) {
      crash = ` (${stats.crashed} crashed)`;
    } else if (stats.faulted > 0) {
      crash = ` (${stats.faulted} faulted)`;
    }
    console.error(
      `nishfmt: ${stats.files} files, ${verb} ${stats.changed}, skipped ${stats.skipped}${crash}; ${mbTenths / 10}.${mbTenths % 10} MB in ${ms} ms (${rate} MB/s, ${jobs} workers)`,
    );
  }
  if (cli.mode === MODE_CHECK && stats.changed > 0) {
    return 1;
  }
  return 0;
};
