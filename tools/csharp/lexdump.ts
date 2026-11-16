// Lexes C# files and reports the ones the lexer refuses (or dumps the tokens of one).
//   nish tools/csharp/lexdump.ts --link /tmp/cslex && /tmp/cslex [-d] files...

import { CsLexer } from "../../src/csharp/lexer";

export const main = (): i32 => {
  let dump = false;
  let bad = 0;
  for (let i = 1; i < toI32(process.argv.length); i++) {
    const path = process.argv[i];
    if (path === "-d") {
      dump = true;
      continue;
    }
    const read = readFileBytesSync(path);
    if (read === null) {
      continue;
    }
    const n = toI32(read.length);
    const src = new Array<u8>(n);
    src.set(read);
    let s = 0;
    if (n >= 3 && toI32(src[0]) === 0xef && toI32(src[1]) === 0xbb && toI32(src[2]) === 0xbf) {
      s = 3;
    }
    const lx = new CsLexer(src, s, n, []);
    lx.lexFile();
    if (lx.err) {
      bad++;
      console.log(`${path}: ${lx.errMsg}`);
    }
    if (dump) {
      for (let t = 0; t < lx.nt; t++) {
        let lead = "";
        for (let r = lx.l0[t]; r < lx.l1[t]; r++) {
          lead = lead + ` L${lx.trKind[r]}[${String.fromBytes(src, lx.trStart[r], lx.trTextEnd[r])}]`;
        }
        let trail = "";
        for (let r = lx.t0[t]; r < lx.t1[t]; r++) {
          trail = trail + ` T${lx.trKind[r]}`;
        }
        console.log(`${t} k=${lx.kind[t]} ck=${lx.ck[t]} '${String.fromBytes(src, lx.start[t], lx.end[t])}'${lead}${trail}`);
      }
    }
  }
  console.log(`bad: ${bad}`);
  return 0;
};
