// Parses C# files and reports the ones the parser refuses (or dumps the tree of one).
//   nish tools/csharp/parsedump.ts --link /tmp/csparse && /tmp/csparse [-d] files...

import { CsLexer } from "../../src/csharp/lexer";
import { CsParser } from "../../src/csharp/parser";
import { cspCompilationUnit } from "../../src/csharp/pdecl";
import { CsTree } from "../../src/csharp/tree";

const dumpNode = (t: CsTree, n: i32, depth: i32): void => {
  let ind = "";
  for (let i = 0; i < depth; i++) {
    ind = ind + "  ";
  }
  const a = t.spanStart(n);
  const b = t.spanEnd(n);
  let text = a >= 0 ? String.fromBytes(t.src, a, b) : "";
  if (text.length > 60) {
    text = text.substring(0, 60) + "...";
  }
  console.log(`${ind}${t.kind[n]} [${text}]`);
  for (let i = 0; i < t.nslot[n]; i++) {
    const v = t.s(n, i);
    if (v < 0) {
      continue;
    }
    // children: nodes whose parent is n
  }
  for (let c = 0; c < t.nn; c++) {
    if (t.parent[c] === n) {
      dumpNode(t, c, depth + 1);
    }
  }
};

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
      console.log(`${path}: lex: ${lx.errMsg}`);
      continue;
    }
    const p = new CsParser(lx);
    const root = cspCompilationUnit(p);
    if (p.err || root < 0) {
      bad++;
      console.log(`${path}: parse: ${p.errMsg}`);
      continue;
    }
    if (dump) {
      dumpNode(p.t, root, 0);
    }
  }
  console.log(`bad: ${bad}`);
  return 0;
};
