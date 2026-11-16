// A Dart-only driver for quick builds while porting:
//   nish tools/dev/dart.ts --link /tmp/dartdev && /tmp/dartdev <file>
// prints the formatted file, or exits 1 when it cannot be formatted.
//   /tmp/dartdev -prof <list-of-paths>
// formats every listed file and prints the time spent in each phase.

import { free, regionWith } from "nish:region";
import { Out } from "../../src/core/out";
import { DartEngine, dtProfReport, formatDart } from "../../src/dart/run";

const dtDevOne = (path: string, print: boolean): i32 => {
  const read = readFileBytesSync(path);
  if (read === null) {
    return 2;
  }
  const n = toI32(read.length);
  const src = new Array<u8>(n);
  src.set(read);
  const out = new Out(n + 1024);
  const e = new DartEngine();
  e.debug = getenv("FFDEBUG") !== null;
  e.dump = getenv("FFDTDUMP") ?? "";
  if (!formatDart(e, path, src, n, out)) {
    return 1;
  }
  if (print) {
    writeBytes(out.buf, 0, out.n);
  }
  return 0;
};

class DtDevJob {
  path: string = "";
  constructor() {}
}

class DtDevRoot {
  done: i32 = 0;
}

const dtDevRun = (job: DtDevJob): DtDevRoot => {
  let path = "";
  for (let i = 0; i < toI32(job.path.length); i++) {
    path = path + String.fromCharCode(job.path.charCodeAt(i));
  }
  dtDevOne(path, false);
  return new DtDevRoot();
};

export const main = (): i32 => {
  const path = process.argv[1];
  if (path === "-prof") {
    const list = readFileSync(process.argv[2]);
    let start = 0;
    let files = 0;
    const t0 = monotonicNanos();
    for (let i = 0; i <= toI32(list.length); i++) {
      if (i === toI32(list.length) || list.charCodeAt(i) === 10) {
        if (i > start) {
          const job = new DtDevJob();
          job.path = list.slice(start, i);
          const f0 = monotonicNanos();
          free(regionWith(job, dtDevRun));
          const fms = toF64(monotonicNanos() - f0) / 1e6;
          if (fms > 50.0) {
            console.log(`${fms} ms ${job.path}`);
          }
          files++;
        }
        start = i + 1;
      }
    }
    const ms = toF64(monotonicNanos() - t0) / 1e6;
    console.log(`${files} files in ${ms} ms: ${dtProfReport()}`);
    return 0;
  }
  return dtDevOne(path, true);
};
