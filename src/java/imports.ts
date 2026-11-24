// google-java-format's import fixes, run on the text before formatting:
// ImportOrderer (static imports first, then the rest, each sorted, one blank
// line between the two groups) and RemoveUnusedImports (an import whose
// simple name is never an identifier in the code or a javadoc reference
// goes, as do java.lang and same-package imports). 2.0.0's module imports
// (`import module m;`, a third group) are left out: javac 21, which the
// reference runs on, rejects them, and so does the parser.
//
// Ported from google-java-format 2.0.0 (Apache License 2.0, Copyright 2015 Google Inc.).

import { atI32, atU8, bytesText } from "../core/arr";
import { fault, faulted } from "../core/fault";
import { Out } from "../core/out";
import { GInput, TF_JAVADOC, TF_LINE_COMMENT, TF_NEWLINE, TF_SPACES, TF_TOKEN } from "../gdoc/input";
import { JTree, N_CLASS, N_IDENTIFIER, N_IMPORT, N_MEMBER_SELECT, N_METHOD, N_VARIABLE, FL_STATIC } from "./ast";
import { JK_IDENT } from "./lexer";

class Imp {
  name: string = "";
  isStatic: boolean = false;
  trailing: string = "";
}

/** Java's String.compareTo for ASCII-ish text: byte order, then length. */
export const strCompare = (a: string, b: string): i32 => {
  for (let i = 0; i < a.length && i < b.length; i++) {
    const d = a.charCodeAt(i) - b.charCodeAt(i);
    if (d !== 0) {
      return d;
    }
  }
  return toI32(a.length) - toI32(b.length);
};

const impBefore = (a: Imp, b: Imp): i32 => {
  if (a.isStatic !== b.isStatic) {
    return a.isStatic ? -1 : 1;
  }
  return strCompare(a.name, b.name);
};

/** The line separator gjf guesses: the first line break's. */
export const guessSeparator = (src: u8[], n: i32): string => {
  for (let i = 0; i < n; i++) {
    if (i >= src.length) {
      fault();
      return "\n";
    }
    const c = toI32(src[i]);
    if (c === 13) {
      return i + 1 < n && atU8(src, i + 1) === 10 ? "\r\n" : "\r";
    }
    if (c === 10) {
      return "\n";
    }
  }
  return "\n";
};

const isJavaWs = (c: i32): boolean => c === 32 || c === 9 || c === 10 || c === 13 || c === 12 || c === 11;

/**
 * ImportOrderer.reorderImports over lexed toks. `reorder` writes the new text
 * to `out` and answers true, or answers false: with `failure` set when gjf
 * would refuse the file, with it empty when the text stays as it is.
 */
export class ImportFixer {
  // Why reorder gave up on the file ("" when it did not): ImportOrderer's
  // FormatterException, which fails the whole file.
  failure: string = "";

  /** The text with its imports reordered, or null to keep it. `inp` holds the lexed text. */
  reorder(inp: GInput, out: Out): boolean {
    this.failure = "";
    const src = inp.src;
    const n = inp.n;
    // The scans below stop at the EOF tok (empty text, flags TF_TOKEN), which
    // matches none of their tests, so `i` stays below `nToks` and each `i++`
    // after a test that held fits.
    const nToks = inp.nToks;
    if (nToks <= 0) {
      // No toks, so no `import` either.
      return false;
    }
    // The toks before the first class, interface or enum keyword.
    let stop = nToks - 1; // EOF
    for (let t = 0; t < nToks; t++) {
      if (
        (atI32(inp.tFlags, t) & TF_TOKEN) !== 0 &&
        atI32(inp.tKind, t) === JK_IDENT &&
        (inp.is(t, "class") || inp.is(t, "interface") || inp.is(t, "enum"))
      ) {
        stop = t;
        break;
      }
    }
    // The first identifier token that is `import`.
    let first = -1;
    for (let t = 0; t < stop; t++) {
      if (this.isIdentTok(inp, t) && inp.is(t, "import")) {
        first = t;
        break;
      }
    }
    if (first < 0) {
      return false;
    }
    const sep = guessSeparator(src, n);
    let unindented = first;
    if (first > 0 && (atI32(inp.tFlags, first - 1) & TF_SPACES) !== 0 && this.isSpaceTok(inp, first - 1)) {
      unindented = first - 1;
    }
    const imps: Imp[] = [];
    let i = first;
    let afterLast = i;
    while (i < stop && inp.is(i, "import")) {
      i++;
      if (i < nToks && this.isSpaceTok(inp, i)) {
        i++;
      }
      const isStatic = inp.is(i, "static");
      // ImportType.MODULE: the word after `import`, so `import module.Foo;`
      // then has no identifier ("Unexpected token after import: .").
      const isModule = !isStatic && inp.is(i, "module");
      if (isStatic || isModule) {
        if (i >= nToks) {
          fault();
          return false;
        }
        i++;
        if (i < nToks && this.isSpaceTok(inp, i)) {
          i++;
        }
      }
      if (!this.isIdentTok(inp, i)) {
        this.failure = isModule
          ? "a module import (ImportType.MODULE): unexpected token after import"
          : "unexpected token after import";
        return false;
      }
      // The imported name.
      let name = "";
      while (true) {
        if (i >= nToks || !this.isIdentTok(inp, i)) {
          this.failure = "unexpected token in an imported name";
          return false;
        }
        name = name + inp.text(i);
        i++;
        if (i >= nToks || !inp.is(i, ".")) {
          break;
        }
        name = `${name}.`;
        i++;
        if (i < nToks && inp.is(i, "*")) {
          name = `${name}*`;
          i++;
          break;
        }
      }
      if (i < nToks && this.isSpaceTok(inp, i)) {
        i++;
      }
      if (!inp.is(i, ";")) {
        this.failure = "no ; after an import";
        return false;
      }
      while (i < nToks && inp.is(i, ";")) {
        i++;
      }
      let trailing = "";
      if (i < nToks && this.isSpaceTok(inp, i)) {
        trailing = trailing + inp.text(i);
        i++;
      }
      if ((atI32(inp.tFlags, i) & TF_NEWLINE) !== 0) {
        if (i >= nToks) {
          fault();
          return false;
        }
        trailing = trailing + inp.text(i);
        i++;
      }
      while ((atI32(inp.tFlags, i) & TF_LINE_COMMENT) !== 0) {
        if (i >= nToks) {
          fault();
          return false;
        }
        trailing = trailing + inp.text(i);
        i++;
        if ((atI32(inp.tFlags, i) & TF_NEWLINE) !== 0) {
          if (i >= nToks) {
            fault();
            return false;
          }
          trailing = trailing + inp.text(i);
          i++;
        }
      }
      while (i < nToks && inp.is(i, ";")) {
        i++;
      }
      const imp = new Imp();
      imp.name = name;
      imp.isStatic = isStatic;
      imp.trailing = trailing;
      // An ImmutableSortedSet: insert in order, the first of equals wins.
      let pos = toI32(imps.length);
      let dup = false;
      for (let q = 0; q < toI32(imps.length); q++) {
        const c = impBefore(imp, imps[q]);
        if (c === 0) {
          dup = true;
          break;
        }
        if (c < 0) {
          pos = q;
          break;
        }
      }
      if (!dup) {
        imps.push(imp);
        // `pos` is at most the old length, so every index below is in `imps`.
        for (let q = toI32(imps.length) - 1; q > pos && q > 0 && q < imps.length; q--) {
          imps[q] = imps[q - 1];
        }
        if (pos < 0 || pos >= imps.length) {
          fault();
          return false;
        }
        imps[pos] = imp;
      }
      afterLast = i;
      while (i < stop && ((atI32(inp.tFlags, i) & TF_NEWLINE) !== 0 || this.isSpaceTok(inp, i))) {
        i++;
      }
    }
    // A later import before the class means they are not contiguous.
    for (let t = afterLast; t < stop; t++) {
      if (this.isIdentTok(inp, t) && inp.is(t, "import")) {
        this.failure = "imports not contiguous";
        return false;
      }
    }
    out.n = 0;
    const prefixEnd = atI32(inp.tPos, unindented);
    out.range(src, 0, prefixEnd);
    if (prefixEnd > 0) {
      const c = atU8(src, prefixEnd - 1);
      if (c !== 10 && c !== 13) {
        out.str(sep);
        out.str(sep);
      }
    }
    if (imps.length === 0) {
      fault();
      return false;
    }
    // Whether the import before was static (the first has none before it).
    let prevStatic = false;
    for (const imp of imps) {
      if (prevStatic && !imp.isStatic) {
        out.str(sep);
      }
      out.str("import ");
      if (imp.isStatic) {
        out.str("static ");
      }
      out.str(imp.name);
      out.str(";");
      if (isBlankString(imp.trailing)) {
        out.str(sep);
      } else {
        out.str(imp.trailing);
      }
      prevStatic = imp.isStatic;
    }
    // The tail: the rest of the text with its leading whitespace trimmed.
    let ts = afterLast < nToks ? atI32(inp.tPos, afterLast) : n;
    while (ts < n) {
      if (ts < 0 || ts >= src.length) {
        fault();
        return false;
      }
      if (!isJavaWs(toI32(src[ts]))) {
        break;
      }
      ts++;
    }
    if (ts < n) {
      out.str(sep);
      out.range(src, ts, n);
    }
    return true;
  }

  private isIdentTok(inp: GInput, t: i32): boolean {
    if (t >= inp.nToks) {
      return false;
    }
    const tFlags = inp.tFlags;
    const tPos = inp.tPos;
    const tEnd = inp.tEnd;
    if (t < 0 || t >= tFlags.length || t >= tPos.length || t >= tEnd.length) {
      fault();
      return false;
    }
    if ((tFlags[t] & TF_TOKEN) === 0 || tEnd[t] === tPos[t]) {
      return false;
    }
    const c = atU8(inp.src, tPos[t]);
    return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36 || c >= 128;
  }

  private isSpaceTok(inp: GInput, t: i32): boolean {
    if (t >= inp.nToks) {
      return false;
    }
    const tPos = inp.tPos;
    const tEnd = inp.tEnd;
    if (t < 0 || t >= tPos.length || t >= tEnd.length) {
      fault();
      return false;
    }
    if (tEnd[t] === tPos[t]) {
      return false;
    }
    const c = atU8(inp.src, tPos[t]);
    return c === 32 || c === 9 || c === 12;
  }

  /**
   * RemoveUnusedImports over a parsed tree; writes the text without the
   * unused imports into `out` and answers whether any went.
   */
  removeUnused(inp: GInput, t: JTree, root: i32, out: Out): boolean {
    const used = new NameSet();
    // Identifiers everywhere but in imports.
    const kind = t.kind;
    for (let x = 0; x < t.n; x++) {
      if (x >= kind.length) {
        fault();
        return false;
      }
      if (kind[x] === N_IDENTIFIER) {
        const name = atI32(t.name, x);
        if (name >= 0) {
          used.add(inp, name);
        }
      }
    }
    // Identifiers in imports do not count: undo them.
    const imports = atI32(t.c, root);
    for (let i = 0; i < t.len(imports); i++) {
      this.unmark(inp, t, atI32(t.a, t.at(imports, i)), used);
    }
    // Javadoc references on declarations.
    for (let x = 0; x < t.n; x++) {
      if (x >= kind.length) {
        fault();
        return false;
      }
      const k = kind[x];
      if (k === N_CLASS || k === N_METHOD || k === N_VARIABLE) {
        this.javadocRefs(inp, atI32(t.start, x), used);
      }
    }
    const pkgNode = atI32(t.b, root);
    const pkg = pkgNode >= 0 ? qualifiedName(inp, t, pkgNode) : "";
    const src = inp.src;
    const n = inp.n;
    const sep = guessSeparator(src, n);
    out.n = 0;
    let at = 0;
    let any = false;
    for (let i = 0; i < t.len(imports); i++) {
      const imp = t.at(imports, i);
      const q = atI32(t.a, imp);
      if (atI32(t.kind, q) !== N_MEMBER_SELECT) {
        continue;
      }
      const qualifier = qualifiedName(inp, t, atI32(t.a, q));
      const simple = inp.text(atI32(t.name, q));
      let unused = false;
      if (qualifier === "java.lang") {
        unused = true;
      } else if (pkgNode >= 0 && pkg === qualifier) {
        unused = true;
      } else if (simple === "*") {
        unused = false;
      } else {
        unused = !used.has(simple);
      }
      if (!unused) {
        continue;
      }
      let end = atI32(t.end, imp);
      let e = end;
      while (e < n) {
        if (e < 0 || e >= src.length) {
          fault();
          return false;
        }
        if (toI32(src[e]) !== 32) {
          break;
        }
        e++;
      }
      if (e < n) {
        end = e;
      }
      const sl = toI32(sep.length);
      const sepEnd = toI64(end) + toI64(sl);
      if (sepEnd < toI64(n) && matchesAt(src, end, sep)) {
        // Below `n`, so the conversion is exact.
        end = toI32(sepEnd);
      }
      out.range(src, at, atI32(t.start, imp));
      at = end;
      any = true;
    }
    if (!any) {
      return false;
    }
    out.range(src, at, n);
    return true;
  }

  private unmark(inp: GInput, t: JTree, q: i32, used: NameSet): void {
    // Identifiers inside an import were added by the scan above; the import's
    // first identifier is the only IDENTIFIER node in it. Removing it is only
    // right when no other use exists, so count instead of set.
    const kind = t.kind;
    const ta = t.a;
    let x = q;
    while (true) {
      if (x < 0 || x >= kind.length) {
        fault();
        return;
      }
      if (kind[x] !== N_MEMBER_SELECT) {
        break;
      }
      if (x >= ta.length) {
        fault();
        return;
      }
      x = ta[x];
    }
    if (atI32(kind, x) === N_IDENTIFIER) {
      used.remove(inp, atI32(t.name, x));
    }
  }

  /** The references of the javadoc right before the token at `pos`. */
  private javadocRefs(inp: GInput, pos: i32, used: NameSet): void {
    const k = inp.tokenAt(pos);
    if (k < 0 || atI32(inp.tPos, atI32(inp.kTok, k)) !== pos) {
      return;
    }
    // The last javadoc among the comments before the token.
    let doc = -1;
    const refs = inp.refs;
    const tFlags = inp.tFlags;
    const bn = atI32(inp.kBeforeN, k);
    let r = atI32(inp.kBefore, k);
    for (let j = 0; j < bn; j++) {
      if (r < 0 || r >= refs.length) {
        fault();
        return;
      }
      const tk = refs[r];
      if ((atI32(tFlags, tk) & TF_JAVADOC) !== 0) {
        doc = tk;
      }
      r = r + 1;
    }
    if (doc < 0) {
      return;
    }
    scanJavadocRefs(inp.src, atI32(inp.tPos, doc), atI32(inp.tEnd, doc), used);
  }
}

const matchesAt = (src: u8[], at: i32, s: string): boolean => {
  let p = at;
  for (let i = 0; i < toI32(s.length); i++) {
    if (p < 0 || p >= src.length) {
      fault();
      return false;
    }
    if (toI32(src[p]) !== s.charCodeAt(i)) {
      return false;
    }
    p = p + 1;
  }
  return true;
};

const isBlankString = (s: string): boolean => {
  for (let i = 0; i < toI32(s.length); i++) {
    if (!isJavaWs(s.charCodeAt(i))) {
      return false;
    }
  }
  return true;
};

export const qualifiedName = (inp: GInput, t: JTree, x: i32): string => {
  const k = atI32(t.kind, x);
  if (faulted()) {
    return "";
  }
  if (k === N_MEMBER_SELECT) {
    return `${qualifiedName(inp, t, atI32(t.a, x))}.${inp.text(atI32(t.name, x))}`;
  }
  const name = atI32(t.name, x);
  return name >= 0 ? inp.text(name) : "";
};

/** A multiset of names. */
class NameSet {
  names: string[];
  counts: i32[];
  constructor() {
    this.names = [];
    this.counts = [];
  }
  addStr(s: string): void {
    const names = this.names;
    const counts = this.counts;
    for (let i = 0; i < toI32(names.length); i++) {
      if (names[i] === s) {
        // A count is at most the number of identifiers in the file.
        if (i >= counts.length) {
          fault();
          return;
        }
        const c = counts[i];
        if (c >= 2147483647) {
          fault();
          return;
        }
        counts[i] = c + 1;
        return;
      }
    }
    names.push(s);
    counts.push(1);
  }
  add(inp: GInput, tok: i32): void {
    this.addStr(inp.text(tok));
  }
  remove(inp: GInput, tok: i32): void {
    const s = inp.text(tok);
    const names = this.names;
    const counts = this.counts;
    for (let i = 0; i < toI32(names.length); i++) {
      if (names[i] === s) {
        if (i >= counts.length) {
          fault();
          return;
        }
        const c = counts[i];
        const r = toI64(c) - toI64(1);
        if (r < toI64(-2147483648)) {
          fault();
          return;
        }
        counts[i] = toI32(r);
        return;
      }
    }
  }
  has(s: string): boolean {
    const names = this.names;
    const counts = this.counts;
    for (let i = 0; i < toI32(names.length); i++) {
      if (names[i] === s) {
        if (i >= counts.length) {
          fault();
          return false;
        }
        return counts[i] > 0;
      }
    }
    return false;
  }
}

const isIdStart = (c: i32): boolean =>
  (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36 || c >= 128;
const isIdPart = (c: i32): boolean => isIdStart(c) || (c >= 48 && c <= 57);

/**
 * The identifiers javac's doc tree scanner finds in the references of a
 * javadoc: `{@link Ref}`, `{@linkplain Ref}`, `{@value Ref}`, `@see Ref`,
 * `@throws Ref`, `@exception Ref`. A reference `a.B#m(C, D[])` contributes
 * its qualifier's first name and each parameter type's first name.
 */
const scanJavadocRefs = (src: u8[], a: i32, e: i32, used: NameSet): void => {
  // The scan reads every byte of [a, e), so a range outside `src` faults
  // here; inside, the length tests restate it after each call.
  if (a >= e) {
    return;
  }
  if (a < 0 || e > src.length) {
    fault();
    return;
  }
  let i = a;
  while (i >= 0 && i < e && i < src.length) {
    if (toI32(src[i]) !== 64) {
      i++;
      continue;
    }
    // A block tag is valid at a line start (after `*` and spaces); an inline tag after `{`.
    const inline = i > a && i > 0 && toI32(src[i - 1]) === 123;
    let j = i + 1;
    while (j < e && j < src.length && isIdPart(toI32(src[j]))) {
      j++;
    }
    const tag = bytesText(src, i + 1, j);
    let isRef = false;
    if (inline) {
      isRef = tag === "link" || tag === "linkplain" || tag === "value";
    } else if (atLineStart(src, a, i)) {
      isRef = tag === "see" || tag === "throws" || tag === "exception";
    }
    i = j;
    if (!isRef) {
      continue;
    }
    while (
      i < e &&
      i < src.length &&
      (toI32(src[i]) === 32 ||
        toI32(src[i]) === 9 ||
        toI32(src[i]) === 10 ||
        toI32(src[i]) === 13 ||
        toI32(src[i]) === 42)
    ) {
      if (
        toI32(src[i]) === 42 &&
        !(
          i > a &&
          i > 0 &&
          (toI32(src[i - 1]) === 10 || toI32(src[i - 1]) === 13 || toI32(src[i - 1]) === 32 || toI32(src[i - 1]) === 9)
        )
      ) {
        break;
      }
      i++;
    }
    // The qualifier: a dotted name before `#`.
    if (i < e && i < src.length && isIdStart(toI32(src[i]))) {
      let k = i;
      while (k < e && k < src.length && isIdPart(toI32(src[k]))) {
        k++;
      }
      used.addStr(bytesText(src, i, k));
      while (k < e && k < src.length && (isIdPart(toI32(src[k])) || toI32(src[k]) === 46)) {
        k++;
      }
      i = k;
    }
    if (i < e && i < src.length && toI32(src[i]) === 35) {
      // #member(params)
      i++;
      while (i < e && i < src.length && isIdPart(toI32(src[i]))) {
        i++;
      }
      if (i < e && i < src.length && toI32(src[i]) === 40) {
        i++;
        while (i >= 0 && i < e && i < src.length && toI32(src[i]) !== 41) {
          while (i < e && i < src.length && (toI32(src[i]) === 32 || toI32(src[i]) === 44)) {
            i++;
          }
          if (i < e && i < src.length && isIdStart(toI32(src[i]))) {
            let k = i;
            while (k < e && k < src.length && isIdPart(toI32(src[k]))) {
              k++;
            }
            used.addStr(bytesText(src, i, k));
            i = k;
          } else if (i < e && i < src.length && toI32(src[i]) !== 41) {
            i++;
          }
        }
      }
    }
  }
};

/** Whether `src[i]` follows only spaces and `*` on its javadoc line. */
const atLineStart = (src: u8[], a: i32, i: i32): boolean => {
  let j = i - 1;
  while (j >= a) {
    if (j < 0 || j >= src.length) {
      fault();
      return false;
    }
    const c = toI32(src[j]);
    if (c === 10 || c === 13) {
      return true;
    }
    if (c !== 32 && c !== 9 && c !== 42) {
      return false;
    }
    if (j > a && j > 0 && c === 42 && toI32(src[j - 1]) === 47) {
      return true; // the opening /**
    }
    j--;
  }
  return true;
};

export const isStaticImport = (t: JTree, imp: i32): boolean =>
  atI32(t.kind, imp) === N_IMPORT && (atI32(t.flags, imp) & FL_STATIC) !== 0;
