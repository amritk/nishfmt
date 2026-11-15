// google-java-format's import fixes, run on the text before formatting:
// ImportOrderer (static imports first, then the rest, each sorted, one blank
// line between the two groups) and RemoveUnusedImports (an import whose
// simple name is never an identifier in the code or a javadoc reference
// goes, as do java.lang and same-package imports).
//
// Ported from google-java-format 1.28 (Apache License 2.0, Copyright 2015 Google Inc.).

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
  const n = a.length < b.length ? toI32(a.length) : toI32(b.length);
  for (let i = 0; i < n; i++) {
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

const isJavaWs = (c: i32): boolean => c === 32 || c === 9 || c === 10 || c === 13 || c === 12 || c === 11;

/**
 * ImportOrderer.reorderImports over lexed toks. Answers null when the text
 * stays as it is, "" (with `failed` set) when gjf would refuse the file.
 */
export class ImportFixer {
  failed: boolean = false;

  /** The text with its imports reordered, or null to keep it. `inp` holds the lexed text. */
  reorder(inp: GInput, out: Out): boolean {
    this.failed = false;
    const src = inp.src;
    const n = inp.n;
    // The toks before the first class, interface or enum keyword.
    let stop = inp.nToks - 1; // EOF
    for (let t = 0; t < inp.nToks; t++) {
      if ((inp.tFlags[t] & TF_TOKEN) !== 0 && inp.tKind[t] === JK_IDENT && (inp.is(t, "class") || inp.is(t, "interface") || inp.is(t, "enum"))) {
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
    if (first > 0 && (inp.tFlags[first - 1] & TF_SPACES) !== 0 && this.isSpaceTok(inp, first - 1)) {
      unindented = first - 1;
    }
    const imps: Imp[] = [];
    let i = first;
    let afterLast = i;
    while (i < stop && inp.is(i, "import")) {
      i++;
      if (this.isSpaceTok(inp, i)) {
        i++;
      }
      const isStatic = inp.is(i, "static");
      if (isStatic) {
        i++;
        if (this.isSpaceTok(inp, i)) {
          i++;
        }
      }
      if (!this.isIdentTok(inp, i)) {
        this.failed = true;
        return false;
      }
      // The imported name.
      let name = "";
      while (true) {
        if (!this.isIdentTok(inp, i)) {
          this.failed = true;
          return false;
        }
        name = name + inp.text(i);
        i++;
        if (!inp.is(i, ".")) {
          break;
        }
        name = `${name}.`;
        i++;
        if (inp.is(i, "*")) {
          name = `${name}*`;
          i++;
          break;
        }
      }
      if (this.isSpaceTok(inp, i)) {
        i++;
      }
      if (!inp.is(i, ";")) {
        this.failed = true;
        return false;
      }
      while (inp.is(i, ";")) {
        i++;
      }
      let trailing = "";
      if (this.isSpaceTok(inp, i)) {
        trailing = trailing + inp.text(i);
        i++;
      }
      if ((inp.tFlags[i] & TF_NEWLINE) !== 0) {
        trailing = trailing + inp.text(i);
        i++;
      }
      while ((inp.tFlags[i] & TF_LINE_COMMENT) !== 0) {
        trailing = trailing + inp.text(i);
        i++;
        if ((inp.tFlags[i] & TF_NEWLINE) !== 0) {
          trailing = trailing + inp.text(i);
          i++;
        }
      }
      while (inp.is(i, ";")) {
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
        for (let q = toI32(imps.length) - 1; q > pos; q--) {
          imps[q] = imps[q - 1];
        }
        imps[pos] = imp;
      }
      afterLast = i;
      while (i < stop && ((inp.tFlags[i] & TF_NEWLINE) !== 0 || this.isSpaceTok(inp, i))) {
        i++;
      }
    }
    // A later import before the class means they are not contiguous.
    for (let t = afterLast; t < stop; t++) {
      if (this.isIdentTok(inp, t) && inp.is(t, "import")) {
        this.failed = true;
        return false;
      }
    }
    out.n = 0;
    const prefixEnd = inp.tPos[unindented];
    out.range(src, 0, prefixEnd);
    if (prefixEnd > 0) {
      const c = toI32(src[prefixEnd - 1]);
      if (c !== 10 && c !== 13) {
        out.str(sep);
        out.str(sep);
      }
    }
    let prev = imps[0];
    for (const imp of imps) {
      if (prev.isStatic && !imp.isStatic) {
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
      prev = imp;
    }
    // The tail: the rest of the text with its leading whitespace trimmed.
    let ts = afterLast < inp.nToks ? inp.tPos[afterLast] : n;
    while (ts < n && isJavaWs(toI32(src[ts]))) {
      ts++;
    }
    if (ts < n) {
      out.str(sep);
      out.range(src, ts, n);
    }
    return true;
  }

  private isIdentTok(inp: GInput, t: i32): boolean {
    if (t >= inp.nToks || (inp.tFlags[t] & TF_TOKEN) === 0 || inp.tEnd[t] === inp.tPos[t]) {
      return false;
    }
    const c = toI32(inp.src[inp.tPos[t]]);
    return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36 || c >= 128;
  }

  private isSpaceTok(inp: GInput, t: i32): boolean {
    if (t >= inp.nToks || inp.tEnd[t] === inp.tPos[t]) {
      return false;
    }
    const c = toI32(inp.src[inp.tPos[t]]);
    return c === 32 || c === 9 || c === 12;
  }

  /**
   * RemoveUnusedImports over a parsed tree; writes the text without the
   * unused imports into `out` and answers whether any went.
   */
  removeUnused(inp: GInput, t: JTree, root: i32, out: Out): boolean {
    const used = new NameSet();
    // Identifiers everywhere but in imports.
    for (let x = 0; x < t.n; x++) {
      if (t.kind[x] === N_IDENTIFIER && t.name[x] >= 0) {
        used.add(inp, t.name[x]);
      }
    }
    // Identifiers in imports do not count: undo them.
    const imports = t.c[root];
    for (let i = 0; i < t.len(imports); i++) {
      this.unmark(inp, t, t.a[t.at(imports, i)], used);
    }
    // Javadoc references on declarations.
    for (let x = 0; x < t.n; x++) {
      const k = t.kind[x];
      if (k === N_CLASS || k === N_METHOD || k === N_VARIABLE) {
        this.javadocRefs(inp, t.start[x], used);
      }
    }
    const pkg = t.b[root] >= 0 ? qualifiedName(inp, t, t.b[root]) : "";
    const src = inp.src;
    const n = inp.n;
    const sep = guessSeparator(src, n);
    out.n = 0;
    let at = 0;
    let any = false;
    for (let i = 0; i < t.len(imports); i++) {
      const imp = t.at(imports, i);
      const q = t.a[imp];
      if (t.kind[q] !== N_MEMBER_SELECT) {
        continue;
      }
      const qualifier = qualifiedName(inp, t, t.a[q]);
      const simple = inp.text(t.name[q]);
      let unused = false;
      if (qualifier === "java.lang") {
        unused = true;
      } else if (t.b[root] >= 0 && pkg === qualifier) {
        unused = true;
      } else if (simple === "*") {
        unused = false;
      } else {
        unused = !used.has(simple);
      }
      if (!unused) {
        continue;
      }
      let end = t.end[imp];
      let e = end;
      while (e < n && toI32(src[e]) === 32) {
        e++;
      }
      if (e < n) {
        end = e;
      }
      const sl = toI32(sep.length);
      if (end + sl < n && matchesAt(src, end, sep)) {
        end += sl;
      }
      out.range(src, at, t.start[imp]);
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
    let x = q;
    while (t.kind[x] === N_MEMBER_SELECT) {
      x = t.a[x];
    }
    if (t.kind[x] === N_IDENTIFIER) {
      used.remove(inp, t.name[x]);
    }
  }

  /** The references of the javadoc right before the token at `pos`. */
  private javadocRefs(inp: GInput, pos: i32, used: NameSet): void {
    const k = inp.tokenAt(pos);
    if (k < 0 || inp.tPos[inp.kTok[k]] !== pos) {
      return;
    }
    // The last javadoc among the comments before the token.
    let doc = -1;
    for (let j = 0; j < inp.kBeforeN[k]; j++) {
      const tk = inp.refs[inp.kBefore[k] + j];
      if ((inp.tFlags[tk] & TF_JAVADOC) !== 0) {
        doc = tk;
      }
    }
    if (doc < 0) {
      return;
    }
    scanJavadocRefs(inp.src, inp.tPos[doc], inp.tEnd[doc], used);
  }
}

const matchesAt = (src: u8[], at: i32, s: string): boolean => {
  for (let i = 0; i < toI32(s.length); i++) {
    if (toI32(src[at + i]) !== s.charCodeAt(i)) {
      return false;
    }
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
  if (t.kind[x] === N_MEMBER_SELECT) {
    return `${qualifiedName(inp, t, t.a[x])}.${inp.text(t.name[x])}`;
  }
  return t.name[x] >= 0 ? inp.text(t.name[x]) : "";
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
    for (let i = 0; i < toI32(this.names.length); i++) {
      if (this.names[i] === s) {
        this.counts[i] = this.counts[i] + 1;
        return;
      }
    }
    this.names.push(s);
    this.counts.push(1);
  }
  add(inp: GInput, tok: i32): void {
    this.addStr(inp.text(tok));
  }
  remove(inp: GInput, tok: i32): void {
    const s = inp.text(tok);
    for (let i = 0; i < toI32(this.names.length); i++) {
      if (this.names[i] === s) {
        this.counts[i] = this.counts[i] - 1;
        return;
      }
    }
  }
  has(s: string): boolean {
    for (let i = 0; i < toI32(this.names.length); i++) {
      if (this.names[i] === s) {
        return this.counts[i] > 0;
      }
    }
    return false;
  }
}

const isIdStart = (c: i32): boolean => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36 || c >= 128;
const isIdPart = (c: i32): boolean => isIdStart(c) || (c >= 48 && c <= 57);

/**
 * The identifiers javac's doc tree scanner finds in the references of a
 * javadoc: `{@link Ref}`, `{@linkplain Ref}`, `{@value Ref}`, `@see Ref`,
 * `@throws Ref`, `@exception Ref`. A reference `a.B#m(C, D[])` contributes
 * its qualifier's first name and each parameter type's first name.
 */
const scanJavadocRefs = (src: u8[], a: i32, e: i32, used: NameSet): void => {
  let i = a;
  while (i < e) {
    if (toI32(src[i]) !== 64) {
      i++;
      continue;
    }
    // A block tag is valid at a line start (after `*` and spaces); an inline tag after `{`.
    const inline = i > a && toI32(src[i - 1]) === 123;
    let j = i + 1;
    while (j < e && isIdPart(toI32(src[j]))) {
      j++;
    }
    const tag = String.fromBytes(src, i + 1, j);
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
    while (i < e && (toI32(src[i]) === 32 || toI32(src[i]) === 9 || toI32(src[i]) === 10 || toI32(src[i]) === 13 || toI32(src[i]) === 42)) {
      if (toI32(src[i]) === 42 && !(i > a && (toI32(src[i - 1]) === 10 || toI32(src[i - 1]) === 13 || toI32(src[i - 1]) === 32 || toI32(src[i - 1]) === 9))) {
        break;
      }
      i++;
    }
    // The qualifier: a dotted name before `#`.
    if (i < e && isIdStart(toI32(src[i]))) {
      let k = i;
      while (k < e && isIdPart(toI32(src[k]))) {
        k++;
      }
      used.addStr(String.fromBytes(src, i, k));
      while (k < e && (isIdPart(toI32(src[k])) || toI32(src[k]) === 46)) {
        k++;
      }
      i = k;
    }
    if (i < e && toI32(src[i]) === 35) {
      // #member(params)
      i++;
      while (i < e && isIdPart(toI32(src[i]))) {
        i++;
      }
      if (i < e && toI32(src[i]) === 40) {
        i++;
        while (i < e && toI32(src[i]) !== 41) {
          while (i < e && (toI32(src[i]) === 32 || toI32(src[i]) === 44)) {
            i++;
          }
          if (i < e && isIdStart(toI32(src[i]))) {
            let k = i;
            while (k < e && isIdPart(toI32(src[k]))) {
              k++;
            }
            used.addStr(String.fromBytes(src, i, k));
            i = k;
          } else if (i < e && toI32(src[i]) !== 41) {
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
    const c = toI32(src[j]);
    if (c === 10 || c === 13) {
      return true;
    }
    if (c !== 32 && c !== 9 && c !== 42) {
      return false;
    }
    if (j >= a + 1 && c === 42 && toI32(src[j - 1]) === 47) {
      return true; // the opening /**
    }
    j--;
  }
  return true;
};

export const isStaticImport = (t: JTree, imp: i32): boolean => t.kind[imp] === N_IMPORT && (t.flags[imp] & FL_STATIC) !== 0;
