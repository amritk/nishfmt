// fastfmt: a fast C++ formatter whose output matches clang-format's LLVM
// style. The CLI walks the paths it is given, formats every C++ source in
// parallel worker processes, and prints a timing summary.

import { Out } from "./core/out";
import { Ignore, walk } from "./core/files";
import { CppEngine, formatCpp, isCppName } from "./cpp/run";
import { JavaEngine, formatJava, isJavaName } from "./java/run";

/** Languages, by the extension or name of a file; 0 is not ours. */
const LANG_CPP: i32 = 1;
const LANG_JAVA: i32 = 2;

const langOf = (name: string): i32 => {
  if (isCppName(name)) {
    return LANG_CPP;
  }
  if (isJavaName(name)) {
    return LANG_JAVA;
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

/** One worker's reusable state: one engine per language and the output buffer. */
class Engine {
  cpp: CppEngine;
  java: JavaEngine;
  out: Out;
  constructor(cli: Cli) {
    this.java = new JavaEngine();
    this.java.debug = getenv("FFDEBUG") !== null;
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
    "usage: fastfmt [options] <file-or-dir>...",
    "",
    "Formats C++ (.cpp .cc .cxx .hpp .hh .hxx .h) in clang-format's LLVM style.",
    "A single file with no mode prints the result to stdout.",
    "",
    "  -i, --write     rewrite files in place",
    "  --check         list files that would change; exit 1 if any",
    "  --width <n>     column limit (default 120)",
    "  --indent <n>    indent width (default 2)",
    "  -j <n>          worker processes (default: one per core)",
    "  -q, --quiet     no summary",
    "  -h, --help      this text",
    "",
    "A `// fastfmt off` ... `// fastfmt on` region is left as written; a file",
    "that does not parse (unbalanced brackets, unterminated literals) is left",
    "untouched and counted as skipped.",
  ].join("\n");

/** Formats one file; answers 0 unchanged, 1 changed, 2 skipped. */
const formatFile = (path: string, cli: Cli, stats: Stats, eng: Engine): i32 => {
  if (cli.trace) {
    console.error(`file ${path}`);
  }
  const src = readFileBytesSync(path);
  if (src === null) {
    console.error(`fastfmt: cannot read ${path}`);
    stats.skipped = stats.skipped + 1;
    return 2;
  }
  const n = toI32(src.length);
  stats.files = stats.files + 1;
  stats.bytes = stats.bytes + toI64(n);
  const out = eng.out;
  const tr0 = monotonicNanos();
  const lang = langOf(path);
  const okRun = lang === LANG_JAVA ? formatJava(eng.java, path, src, n, out) : formatCpp(eng.cpp, path, src, n, out, stats.prof);
  stats.prof[5] = stats.prof[5] + (monotonicNanos() - tr0);
  if (!okRun) {
    stats.skipped = stats.skipped + 1;
    if (cli.mode === MODE_STDOUT) {
      writeBytes(src, 0, n);
    } else if (!cli.quiet) {
      console.error(`fastfmt: skipped ${path} (does not parse)`);
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
      console.error(`fastfmt: cannot write ${path}`);
    }
  } else if (cli.mode === MODE_CHECK) {
    console.log(path);
  }
  return 1;
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
        console.error(`fastfmt: ${a} needs a value`);
        return 2;
      }
      const v = parseInt(argv[i + 1]);
      if (v <= 0) {
        console.error(`fastfmt: bad value for ${a}`);
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
      console.error(`fastfmt: unknown option ${a}\n${usage()}`);
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
      for (let i = at; i < at + size; i++) {
        formatFile(files[i], cli, stats, eng);
      }
    }
    at = at + size;
    c++;
  }
  writeFileSync(cli.stats, `${stats.files} ${stats.changed} ${stats.skipped} ${stats.bytes}\n`);
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
    console.error("fastfmt: several files: pass -i to rewrite them or --check to list changes");
    return 2;
  }
  const stats = new Stats();
  const tWalk = monotonicNanos();
  let jobs = cli.jobs > 0 ? cli.jobs : availableParallelism();
  if (cli.mode === MODE_STDOUT || files.length < 64) {
    jobs = 1;
  }
  if (jobs === 1) {
    const eng = engineFor(cli);
    for (const p of files) {
      formatFile(p, cli, stats, eng);
    }
    if (getenv("FFPROF") !== null) {
      console.error(`searches ${eng.cpp.f.ind.stSearches} nodes ${eng.cpp.f.ind.stNodes} pops ${eng.cpp.f.ind.stPops} depth ${eng.cpp.f.ind.stDepth} listMiss ${eng.cpp.f.ind.stListMiss} listHit ${eng.cpp.f.ind.stListHit}`);
      console.error(`lex ${ms(stats.prof[0])} parse ${ms(stats.prof[1])} classify ${ms(stats.prof[2])} layout ${ms(stats.prof[3])} write ${ms(stats.prof[4])} run-total ${ms(stats.prof[5])} ms`);
    }
  } else {
    const self = realpathSync("/proc/self/exe") ?? process.argv[0];
    const tmp = getenv("TMPDIR") ?? "/tmp";
    const tag = `${tmp}/fastfmt-${wallClockNanos()}`;
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
      pids.push(spawn(argv));
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
    console.error(`fastfmt: ${stats.files} files, ${verb} ${stats.changed}, skipped ${stats.skipped}; ${mbTenths / 10}.${mbTenths % 10} MB in ${ms} ms (${rate} MB/s, ${jobs} workers)`);
  }
  if (cli.mode === MODE_CHECK && stats.changed > 0) {
    return 1;
  }
  return 0;
};

