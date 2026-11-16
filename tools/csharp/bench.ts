// Formats C# files in one process, each in a region of its own as fastfmt
// does, for profiling:
//   nish tools/csharp/bench.ts --link /tmp/csbench && /tmp/csbench [-r N] files...
// prints how many formatted and how many were refused.

import { Out } from "../../src/core/out";
import { CSharpEngine, formatCSharp } from "../../src/csharp/run";
import { free, regionWith } from "nish:region";

class CsBenchJob {
  path: string = "";
  ok: i32[];
  constructor() {
    this.ok = new Array<i32>(1);
  }
}

class CsBenchRoot {
  done: i32 = 0;
}

const csBenchOne = (job: CsBenchJob): CsBenchRoot => {
  const root = new CsBenchRoot();
  let path = "";
  for (let i = 0; i < toI32(job.path.length); i++) {
    path = path + String.fromCharCode(job.path.charCodeAt(i));
  }
  const read = readFileBytesSync(path);
  if (read === null) {
    job.ok[0] = 2;
    return root;
  }
  const n = toI32(read.length);
  const src = new Array<u8>(n);
  src.set(read);
  const out = new Out(n + 1024);
  const e = new CSharpEngine();
  job.ok[0] = formatCSharp(e, path, src, n, out) ? 1 : 0;
  return root;
};

export const main = (): i32 => {
  let ok = 0;
  let refused = 0;
  let rounds = 1;
  let first = 1;
  if (toI32(process.argv.length) > 2 && process.argv[1] === "-r") {
    rounds = parseInt(process.argv[2]);
    first = 3;
  }
  const job = new CsBenchJob();
  for (let r = 0; r < rounds; r++) {
    for (let i = first; i < toI32(process.argv.length); i++) {
      job.path = process.argv[i];
      free(regionWith(job, csBenchOne));
      if (job.ok[0] === 1) {
        ok++;
      } else if (job.ok[0] === 0) {
        refused++;
      }
    }
  }
  console.log(`formatted ${ok} refused ${refused}`);
  return 0;
};
