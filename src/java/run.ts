// The Java entry point: google-java-format's pipeline over one file.

import { Out } from "../core/out";
import { GEngine } from "../gdoc/engine";
import { GInput } from "../gdoc/input";
import { JTree } from "./ast";
import { lexJava } from "./lexer";
import { JParser } from "./parser";
import { JVisitor } from "./visitor";
import { rewriteJavaComment } from "./comments";
import { ImportFixer } from "./imports";

/** One worker's reusable Java state. */
export class JavaEngine {
  inp: GInput;
  tree: JTree;
  parser: JParser;
  g: GEngine;
  vis: JVisitor;
  imports: ImportFixer;
  buf1: Out;
  buf2: Out;
  debug: boolean = false;
  constructor() {
    this.imports = new ImportFixer();
    this.buf1 = new Out(1 << 16);
    this.buf2 = new Out(1 << 16);
    this.inp = new GInput();
    this.tree = new JTree();
    this.parser = new JParser(this.inp, this.tree);
    this.g = new GEngine(this.inp);
    this.vis = new JVisitor(this.g, this.tree);
    this.g.rewrite = rewriteJavaComment;
  }
}

/** Formats `src[0, n)` into `out`; answers false when the file cannot be formatted. */
export const formatJava = (e: JavaEngine, path: string, src0: u8[], n0: i32, out: Out): boolean => {
  let src = src0;
  let n = n0;
  // ImportOrderer, on the text.
  if (!lexJava(e.inp, src, n)) {
    if (e.debug) {
      console.error(`${path}: lex error`);
    }
    return false;
  }
  if (e.imports.reorder(e.inp, e.buf1)) {
    src = e.buf1.buf.slice(0, e.buf1.n);
    n = e.buf1.n;
    if (!lexJava(e.inp, src, n)) {
      return false;
    }
  } else if (e.imports.failed) {
    if (e.debug) {
      console.error(`${path}: imports not contiguous`);
    }
    return false;
  }
  // RemoveUnusedImports, on the text.
  {
    const root0 = e.parser.parse();
    if (e.parser.err) {
      if (e.debug) {
        const t = e.inp.kTok[e.parser.errAt];
        console.error(`${path}: parse error at byte ${e.inp.tPos[t]} '${e.inp.text(t)}'`);
      }
      return false;
    }
    if (e.imports.removeUnused(e.inp, e.tree, root0, e.buf2)) {
      src = e.buf2.buf.slice(0, e.buf2.n);
      n = e.buf2.n;
    }
  }
  if (!lexJava(e.inp, src, n)) {
    if (e.debug) {
      console.error(`${path}: lex error`);
    }
    return false;
  }
  const root = e.parser.parse();
  if (e.parser.err) {
    if (e.debug) {
      const t = e.inp.kTok[e.parser.errAt];
      console.error(`${path}: parse error at byte ${e.inp.tPos[t]} '${e.inp.text(t)}'`);
    }
    return false;
  }
  const g = e.g;
  g.reset();
  e.vis.reset();
  e.vis.scan(root);
  g.sync(n);
  g.drain();
  if (!g.layout()) {
    if (e.debug) {
      console.error(`${path}: ${g.failure}`);
    }
    return false;
  }
  out.n = 0;
  const sep = guessSep(src0, n0);
  if (sep === "\n") {
    out.range(g.out.buf, 0, g.out.n);
  } else {
    for (let i = 0; i < g.out.n; i++) {
      const c = toI32(g.out.buf[i]);
      if (c === 10) {
        out.str(sep);
      } else {
        out.byte(c);
      }
    }
  }
  return true;
};

const guessSep = (src: u8[], n: i32): string => {
  for (let i = 0; i < n; i++) {
    const c = toI32(src[i]);
    if (c === 13) {
      return i + 1 < n && toI32(src[i + 1]) === 10 ? "\r\n" : "\r";
    }
    if (c === 10) {
      return "\n";
    }
  }
  return "\n";
};

export const isJavaName = (name: string): boolean => name.endsWith(".java");
