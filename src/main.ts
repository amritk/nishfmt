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
  crashed: i32 = 0; // of the skipped, files a worker died on
  bytes: i64 = 0;
}

/** The version `--version` prints; release-please bumps it. */
const NISHFMT_VERSION: string = "0.1.0"; // x-release-please-version

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
    "does not parse, say, or one its formatter crashes on) is left untouched and",
    "counted as skipped. In C++, a `// nishfmt off` ... `// nishfmt on` region is",
    "left as written.",
    "",
    "Exit status: 0; 1 with --check when a file would change; 2 for a bad command",
    "line. A skipped file does not change it.",
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
      logEntry(job.log, job.base + k, 1, 0, 1, n);
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
    logEntry(job.log, job.base + k, 1, same ? 0 : 1, 0, n);
    bytes = bytes + n;
    k++;
  }
  job.done = k;
  return root;
};

/** Whether files of a language share an engine within a batch. */
const batches = (lang: i32): boolean => lang === LANG_KOTLIN || lang === LANG_JAVA;

/**
 * Appends one finished entry of the worker's list to its progress log
 * `cli.stats`: its index, then the files, changed, skipped and bytes it added
 * to the counts. The parent sums the counts from these lines, and an entry
 * with no line was never finished: its worker died.
 */
const logEntry = (log: string, at: i32, files: i32, changed: i32, skipped: i32, bytes: i32): void => {
  appendFileSync(log, `${at} ${files} ${changed} ${skipped} ${bytes}\n`);
};

/**
 * Formats `files[a, b)` of the worker's list: C++ files one by one with the
 * worker's engine, the others in batches of one language, each batch in a
 * region of its own. Each entry is logged as soon as it is finished
 * (logEntry). The walk does not stat names that look like sources, so a
 * directory named like one (`Directory.swift`) arrives here: it is logged as
 * a directory, `<at> 0 0 0 0 d`, and the parent walks it.
 */
const formatFiles = (files: string[], a: i32, b: i32, cli: Cli, stats: Stats, eng: Engine): void => {
  const log = cli.stats;
  let i = a;
  while (i < b) {
    const lang = langOf(files[i]);
    if (lang < LANG_JAVA) {
      const s0 = new Stats();
      s0.files = stats.files;
      s0.changed = stats.changed;
      s0.skipped = stats.skipped;
      s0.bytes = stats.bytes;
      if (formatFile(files[i], cli, stats, eng) === 3) {
        appendFileSync(log, `${i} 0 0 0 0 d\n`);
      } else {
        logEntry(
          log,
          i,
          stats.files - s0.files,
          stats.changed - s0.changed,
          stats.skipped - s0.skipped,
          toI32(stats.bytes - s0.bytes),
        );
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
    job.log = log;
    job.base = i;
    job.done = 0;
    const tr0 = monotonicNanos();
    free(regionWith(job, runJob));
    stats.prof[5] = stats.prof[5] + (monotonicNanos() - tr0);
    for (let k = 0; k < job.done; k++) {
      const res = job.res[2 * k];
      if (res === 3) {
        if (isDirectorySync(files[i + k])) {
          appendFileSync(log, `${i + k} 0 0 0 0 d\n`);
          continue;
        }
        console.error(`nishfmt: cannot read ${files[i + k]}`);
        stats.skipped = stats.skipped + 1;
        logEntry(log, i + k, 0, 0, 1, 0);
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
    } else if (a === "-v" || a === "--version") {
      console.log(`nishfmt ${NISHFMT_VERSION}`);
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
  if (getenv("FFKPROF") !== null) {
    kprofPrint();
  }
  if (getenv("FFPROF") !== null) {
    console.error(
      `searches ${eng.cpp.f.ind.stSearches} nodes ${eng.cpp.f.ind.stNodes} pops ${eng.cpp.f.ind.stPops} depth ${eng.cpp.f.ind.stDepth} listMiss ${eng.cpp.f.ind.stListMiss} listHit ${eng.cpp.f.ind.stListHit}`,
    );
    console.error(
      `worker: lex ${ms(stats.prof[0])} parse ${ms(stats.prof[1])} classify ${ms(stats.prof[2])} layout ${ms(stats.prof[3])} write ${ms(stats.prof[4])} run ${ms(stats.prof[5])} ms`,
    );
  }
  return 0;
};

/** The digits of `s[a, b)` as a number; 0 when there are none. */
const parseNum = (s: string, a: i32, b: i32): i32 => {
  let v = 0;
  for (let i = a; i < b; i++) {
    const ch = s.charCodeAt(i);
    if (ch >= 48 && ch <= 57 && v < 214748364) {
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
  const s = readFileSyncOrNull(path);
  if (s === null) {
    return;
  }
  const v: i32[] = [0, 0, 0, 0, 0];
  let a = 0;
  for (let i = 0; i < toI32(s.length); i++) {
    if (s.charCodeAt(i) !== 10) {
      continue;
    }
    let f = 0;
    let w = a;
    for (let j = a; j <= i && f < 6; j++) {
      if (j === i || s.charCodeAt(j) === 32) {
        if (f < 5) {
          v[f] = parseNum(s, w, j);
        }
        f++;
        w = j + 1;
      }
    }
    a = i + 1;
    const at = v[0];
    if (f >= 5 && at >= 0 && at < toI32(done.length) && done[at] === 0) {
      done[at] = 1;
      if (f === 6) {
        dirs.push(files[at]);
      }
      into.files = into.files + v[1];
      into.changed = into.changed + v[2];
      into.skipped = into.skipped + v[3];
      into.bytes = into.bytes + toI64(v[4]);
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
  rounds: i32 = 0;
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
  run.rounds = run.rounds + 1;
  writeFileSync(listPath, files.join("\n"));
  // A worker that exits abnormally is replaced at once, so the chunks no
  // worker has claimed yet keep `jobs` workers. Workers claim chunks in
  // order, so once the last is claimed there is nothing left to replace one
  // for; and there is at most one replacement a chunk, so workers that die
  // before claiming one cannot respawn forever.
  let chunks = 0;
  for (let at = 0; at < nf; at = at + chunkSize(nf - at, jobs)) {
    chunks++;
  }
  const lastChunk = `${listPath}.c${chunks - 1}`;
  const logs: string[] = [];
  let live = 0;
  for (let k = 0; k < jobs; k++) {
    if (startWorker(run, listPath, logs, jobs) > 0) {
      live++;
    }
  }
  while (live > 0) {
    const w = waitPid(-1, 0);
    if (w[0] <= 0) {
      break;
    }
    live--;
    if (w[1] !== 0 && chunks > 0 && readFileSyncOrNull(lastChunk) === null) {
      chunks--;
      if (startWorker(run, listPath, logs, jobs) > 0) {
        live++;
      }
    }
  }
  const done = new Array<u8>(nf);
  const dirs: string[] = [];
  for (const log of logs) {
    readLog(log, files, done, run.stats, dirs);
    unlinkSync(log);
  }
  const culprits: string[] = [];
  const rest: string[] = [];
  let at = 0;
  let c = 0;
  while (at < nf) {
    const size = chunkSize(nf - at, jobs);
    // The marker is there when a worker claimed the chunk.
    let first = unlinkSync(`${listPath}.c${c}`) === 0;
    for (let i = at; i < at + size && i < nf; i++) {
      if (done[i] === 0) {
        if (first) {
          culprits.push(files[i]);
          first = false;
        } else {
          rest.push(files[i]);
        }
      }
    }
    at = at + size;
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
  if (nf === 1) {
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
 * A worker of its own died on `path`: the file is left as it is (printed as
 * it is, with no mode) and counted as skipped.
 */
const crashed = (run: Run, path: string): void => {
  const stats = run.stats;
  stats.files = stats.files + 1;
  stats.skipped = stats.skipped + 1;
  stats.crashed = stats.crashed + 1;
  const src = readFileBytesSync(path);
  if (src !== null) {
    stats.bytes = stats.bytes + toI64(src.length);
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
  const self = realpathSync("/proc/self/exe") ?? process.argv[0];
  const tmp = getenv("TMPDIR") ?? "/tmp";
  const run = new Run(cli, stats, self, `${tmp}/nishfmt-${wallClockNanos()}`);
  run.tunables = files.length >= 64;
  runRound(run, files, jobs);
  if (getenv("FFPROF") !== null) {
    console.error(`walk ${(tWalk - t0) / toI64(1000000)} ms, format ${(monotonicNanos() - tWalk) / toI64(1000000)} ms`);
  }
  const ms = toI32((monotonicNanos() - t0) / toI64(1000000));
  if (!cli.quiet && cli.mode !== MODE_STDOUT) {
    const kb = toI32(stats.bytes / toI64(1024));
    const mbTenths = (kb * 10) / 1024;
    const rate = ms > 0 ? (kb * 1000) / 1024 / ms : 0;
    const verb = cli.mode === MODE_WRITE ? "reformatted" : "would reformat";
    const crash = stats.crashed > 0 ? ` (${stats.crashed} crashed)` : "";
    console.error(
      `nishfmt: ${stats.files} files, ${verb} ${stats.changed}, skipped ${stats.skipped}${crash}; ${mbTenths / 10}.${mbTenths % 10} MB in ${ms} ms (${rate} MB/s, ${jobs} workers)`,
    );
  }
  if (cli.mode === MODE_CHECK && stats.changed > 0) {
    return 1;
  }
  return 0;
};
