// The Java entry point: google-java-format 2.0.0's pipeline over one file
// (Formatter.formatSource as the CLI calls it): the cleanup passes, the
// formatter, then StringWrapper.

import { guessSep } from "../core/files";
import { Out } from "../core/out";
import { GEngine } from "../gdoc/engine";
import { JlEngine } from "./layout/engine";
import { GInput } from "../gdoc/input";
import { JTree } from "./ast";
import { lexJava } from "./lexer";
import { JParser } from "./parser";
import { JVisitor } from "./visitor";
import { rewriteJavaComment } from "./comments";
import { ImportFixer } from "./imports";
import { StringWrapper, needWrapping, replacementRanges } from "./strings";
import { partialFormat } from "./partial";
import { reorderModifiers } from "./modifiers";
import { JavaCleanups, cleanupComments } from "./cleanups";

/** One worker's reusable Java state. */
export class JavaEngine {
  inp: GInput;
  tree: JTree;
  parser: JParser;
  g: JlEngine;
  vis: JVisitor;
  imports: ImportFixer;
  buf1: Out;
  buf2: Out;
  buf3: Out;
  wrapper: StringWrapper;
  cleanups: JavaCleanups;
  root: i32 = -1;
  debug: boolean = false;
  constructor() {
    this.imports = new ImportFixer();
    this.buf1 = new Out(1 << 12);
    this.buf2 = new Out(1 << 12);
    this.buf3 = new Out(1 << 12);
    this.inp = new GInput();
    this.tree = new JTree();
    this.parser = new JParser(this.inp, this.tree);
    this.g = new JlEngine(this.inp, new GEngine(this.inp));
    this.vis = new JVisitor(this.g, this.tree);
    this.g.rewrite = rewriteJavaComment;
    this.wrapper = new StringWrapper(this.inp, this.tree);
    this.cleanups = new JavaCleanups();
  }
}

/** Formats `src[0, n)` into `out`; answers false when the file cannot be formatted. */
export const formatJava = (e: JavaEngine, path: string, src0: u8[], n0: i32, out: Out): boolean => {
  let src = src0;
  let n = n0;
  // An empty file has an empty character range, so Formatter replaces nothing.
  if (n === 0) {
    out.n = 0;
    return true;
  }
  // Cleanups.apply: the passes Cleanups.enabledPasses turns on for the CLI,
  // in its order, each on the text the one before left.
  if (!lexJava(e.inp, src, n)) {
    if (e.debug) {
      console.error(`${path}: lex error`);
    }
    return false;
  }
  if (!parseJava(e, path)) {
    return false;
  }
  // Whether a pass after the last parse changed the text.
  let changed = false;
  // REMOVE_UNUSED_IMPORTS.
  if (e.imports.removeUnused(e.inp, e.tree, e.root, e.buf1)) {
    src = e.buf1.buf.slice(0, e.buf1.n);
    n = e.buf1.n;
    if (!lexJava(e.inp, src, n) || !parseJava(e, path)) {
      return false;
    }
  }
  // AST_CLEANUPS.
  if (e.cleanups.run(e.inp, e.tree, e.root, e.buf1)) {
    const comments = cleanupComments(e.inp);
    src = e.buf1.buf.slice(0, e.buf1.n);
    n = e.buf1.n;
    changed = true;
    if (!lexJava(e.inp, src, n)) {
      return false;
    }
    // verifyCommentsPreserved: "error: cleanups modified comments".
    if (cleanupComments(e.inp) !== comments) {
      if (e.debug) {
        console.error(`${path}: cleanups modified comments`);
      }
      return false;
    }
  }
  // REORDER_MODIFIERS, on the tokens.
  if (reorderModifiers(e.inp, e.buf1)) {
    src = e.buf1.buf.slice(0, e.buf1.n);
    n = e.buf1.n;
    changed = true;
    if (!lexJava(e.inp, src, n)) {
      return false;
    }
  }
  // SORT_IMPORTS, on the text.
  if (e.imports.reorder(e.inp, e.buf1)) {
    src = e.buf1.buf.slice(0, e.buf1.n);
    n = e.buf1.n;
    changed = true;
    if (!lexJava(e.inp, src, n)) {
      return false;
    }
  } else if (e.imports.failed) {
    if (e.debug) {
      console.error(`${path}: imports not contiguous`);
    }
    return false;
  }
  // The tree of the last parse still fits text no pass changed since.
  if (changed && !parseJava(e, path)) {
    return false;
  }
  const root = e.root;
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
  // StringWrapper, on the formatted text.
  let res = g.out;
  if (needWrapping(g.out.buf, g.out.n)) {
    let fmt = g.out.buf.slice(0, g.out.n);
    if (lexJava(e.inp, fmt, toI32(fmt.length))) {
      const root2 = e.parser.parse();
      if (!e.parser.err) {
        let repls = e.wrapper.replacements("\n");
        if (repls.length > 0) {
          // getFormatReplacements(input, ranges): the text is formatted again
          // and the regions around the ranges are taken from that.
          g.partial = true;
          g.reset();
          e.vis.reset();
          e.vis.scan(root2);
          g.sync(toI32(fmt.length));
          g.drain();
          const ok = g.layout();
          g.partial = false;
          if (!ok) {
            if (e.debug) {
              console.error(`${path}: partial format: ${g.failure}`);
            }
            return false;
          }
          const partialChanged = partialFormat(e.inp, g, replacementRanges(repls), e.buf2);
          if (partialChanged < 0) {
            if (e.debug) {
              console.error(`${path}: partial format failed`);
            }
            return false;
          }
          if (partialChanged === 1) {
            fmt = e.buf2.buf.slice(0, e.buf2.n);
            if (!lexJava(e.inp, fmt, toI32(fmt.length))) {
              return false;
            }
            e.parser.parse();
            if (e.parser.err) {
              return false;
            }
            repls = e.wrapper.replacements("\n");
          }
          e.wrapper.apply(repls, e.buf3);
          res = e.buf3;
        }
      }
    }
  }
  out.n = 0;
  // JavaOutput's line separator, guessed from the text the cleanups left.
  const sep = guessSep(src, n);
  if (sep === "\n") {
    out.range(res.buf, 0, res.n);
  } else {
    for (let i = 0; i < res.n; i++) {
      const c = toI32(res.buf[i]);
      if (c === 10) {
        out.str(sep);
      } else {
        out.byte(c);
      }
    }
  }
  return true;
};

/** Parses the lexed text into `e.root`; answers false on a syntax error. */
const parseJava = (e: JavaEngine, path: string): boolean => {
  e.root = e.parser.parse();
  if (e.parser.err) {
    if (e.debug) {
      const t = e.inp.kTok[e.parser.errAt];
      console.error(`${path}: parse error at byte ${e.inp.tPos[t]} '${e.inp.text(t)}'`);
    }
    return false;
  }
  return true;
};

export const isJavaName = (name: string): boolean => name.endsWith(".java");
