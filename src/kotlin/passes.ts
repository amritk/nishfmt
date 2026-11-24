// ktfmt's text-to-text passes around the pretty printer: sorting and
// de-duplicating imports, dropping unused imports and redundant
// semicolons, and adding trailing commas to multi-line lists. Each reads
// the tree of the current text and writes the new text into `out`,
// answering whether anything changed. In kotlinlang style
// (trailingCommaManagementStrategy COMPLETE) dropping redundant elements
// also drops every managed list's trailing comma, and adding them puts one
// back where the list is on more than one line.
//
// Ported from ktfmt 0.65's Formatter.sortedAndDistinctImports,
// RedundantElementManager, RedundantImportDetector,
// RedundantSemicolonDetector, TrailingCommas and EnumEntryList (Apache
// License 2.0, Copyright (c) Meta Platforms, Inc. and affiliates).

import { bytesText, newU8s } from "../core/arr";
import { fault } from "../core/fault";
import { Out } from "../core/out";
import { stableSort } from "../core/sort";
import { KTree } from "./builder";
import { kIsComment, kIsPsiChild } from "./input";
import { kdocReferences } from "./kdoclinks";
import { K_REMOVE_REDUNDANT_TRAILING_COMMAS } from "./options";
import {
  N_ARRAY_ACCESS_EXPRESSION,
  N_CALL_EXPRESSION,
  N_CLASS,
  N_CLASS_BODY,
  N_COLLECTION_LITERAL_EXPRESSION,
  N_CONSTRUCTOR_DELEGATION_REFERENCE,
  N_DOT_QUALIFIED_EXPRESSION,
  N_ELSE,
  N_ENUM_ENTRY,
  N_ENUM_ENTRY_SUPERCLASS_REFERENCE_EXPRESSION,
  N_FUNCTION_LITERAL,
  N_IF,
  N_IMPORT_ALIAS,
  N_IMPORT_DIRECTIVE,
  N_IMPORT_LIST,
  N_LABEL,
  N_LAMBDA_EXPRESSION,
  N_LONG_STRING_TEMPLATE_ENTRY,
  N_LITERAL_STRING_TEMPLATE_ENTRY,
  N_ESCAPE_STRING_TEMPLATE_ENTRY,
  N_SHORT_STRING_TEMPLATE_ENTRY,
  N_MODIFIER_LIST,
  N_OBJECT_DECLARATION,
  N_OPERATION_REFERENCE,
  N_PACKAGE_DIRECTIVE,
  N_REFERENCE_EXPRESSION,
  N_STRING_TEMPLATE,
  N_THEN,
  N_BODY,
  N_TYPE_ARGUMENT_LIST,
  N_TYPE_PARAMETER,
  N_TYPE_PARAMETER_LIST,
  N_TYPE_PROJECTION,
  N_VALUE_ARGUMENT,
  N_VALUE_ARGUMENT_LIST,
  N_VALUE_PARAMETER,
  N_VALUE_PARAMETER_LIST,
  N_WHEN_ENTRY,
  N_WHILE,
  T_ARROW,
  T_COMMA,
  T_COMPANION_KEYWORD,
  T_DOC_COMMENT,
  T_ENUM_KEYWORD,
  T_GT,
  T_IDENTIFIER,
  T_MUL,
  T_RBRACE,
  T_RBRACKET,
  T_RPAR,
  T_SEMICOLON,
  T_WHITE_SPACE,
} from "./types";
import { kIsExpr } from "./visitor";

/** The passes over one tree. */
export class KPasses {
  t: KTree;
  src: u8[];
  n: i32 = 0;
  failed: boolean = false;
  failure: string = "";
  // Edits: [start, end) replaced by a string, applied from the end.
  eStart: i32[];
  eEnd: i32[];
  eText: string[];

  constructor(t: KTree) {
    this.t = t;
    this.src = new Array<u8>(0);
    this.eStart = [];
    this.eEnd = [];
    this.eText = [];
    this.mInStart = [];
    this.mInEnd = [];
    this.mOutStart = [];
    this.mOutEnd = [];
    this.mBuf = new Array<u8>(0);
    this.removed = new Array<u8>(0);
    this.nlSemis = [];
  }

  reset(src: u8[], n: i32): void {
    this.src = src;
    this.n = n;
    this.failed = false;
    this.failure = "";
    this.eStart = [];
    this.eEnd = [];
    this.eText = [];
  }

  // ---- Shared ----------------------------------------------------------------

  text(n: i32): string {
    return bytesText(this.src, this.t.st(n), this.t.en(n));
  }

  child(n: i32, type: i32): i32 {
    if (n < 0) {
      return -1;
    }
    for (let c = this.t.fst(n); c >= 0; c = this.t.nxt(c)) {
      if (this.t.ty(c) === type) {
        return c;
      }
    }
    return -1;
  }

  isWsOrComment(c: i32): boolean {
    const ty = this.t.ty(c);
    return ty === T_WHITE_SPACE || kIsComment(ty);
  }

  prevConcrete(c: i32): i32 {
    let p = this.t.prv(c);
    while (p >= 0 && this.isWsOrComment(p)) {
      p = this.t.prv(p);
    }
    return p;
  }

  nextConcrete(c: i32): i32 {
    let p = this.t.nxt(c);
    while (p >= 0 && this.isWsOrComment(p)) {
      p = this.t.nxt(p);
    }
    return p;
  }

  hasNewline(n: i32): boolean {
    const src = this.src;
    const e = this.t.en(n);
    for (let i = this.t.st(n); i < e; i++) {
      if (i < 0 || i >= src.length) {
        fault();
        return false;
      }
      if (toI32(src[i]) === 10) {
        return true;
      }
    }
    return false;
  }

  edit(a: i32, b: i32, s: string): void {
    this.eStart.push(a);
    this.eEnd.push(b);
    this.eText.push(s);
  }

  /** Applies the edits (sorted by end offset, descending, stably) into `out`. */
  apply(out: Out): boolean {
    const k = toI32(this.eStart.length);
    if (k === 0) {
      return false;
    }
    const order: i32[] = [];
    for (let i = 0; i < k; i++) {
      order.push(i);
    }
    const ends = this.eEnd;
    stableSort(order, (x: i32, y: i32): i32 => {
      const es = ends;
      if (x < 0 || x >= es.length || y < 0 || y >= es.length) {
        fault();
        return 0;
      }
      const ex = es[x];
      const ey = es[y];
      if (ey !== ex) {
        return ey > ex ? 1 : -1;
      }
      return x < y ? -1 : x > y ? 1 : 0;
    });
    // Edits never overlap here; write the text front to back from the reversed order.
    const starts = this.eStart;
    const texts = this.eText;
    const src = this.src;
    out.n = 0;
    let pos = 0;
    for (let q = k - 1; q >= 0; q--) {
      if (q >= order.length) {
        fault();
        return true;
      }
      const i = order[q];
      if (i < 0 || i >= starts.length || i >= ends.length || i >= texts.length) {
        fault();
        return true;
      }
      const a = starts[i];
      const e = ends[i];
      const s = texts[i];
      if (a > pos) {
        out.range(src, pos, a);
      }
      out.str(s);
      if (e > pos) {
        pos = e;
      }
    }
    if (pos < this.n) {
      out.range(this.src, pos, this.n);
    }
    return true;
  }

  /** The names of an import's reference, unquoted, joined by dots ("null" when there is none). */
  fqName(imp: i32): string {
    const ref = this.importRef(imp);
    if (ref < 0) {
      return "null";
    }
    const segs: string[] = [];
    this.collectSegments(ref, segs);
    return segs.join(".");
  }

  importRef(imp: i32): i32 {
    for (let c = this.t.fst(imp); c >= 0; c = this.t.nxt(c)) {
      const ty = this.t.ty(c);
      if (ty === N_DOT_QUALIFIED_EXPRESSION || ty === N_REFERENCE_EXPRESSION) {
        return c;
      }
    }
    return -1;
  }

  collectSegments(e: i32, out: string[]): void {
    const ty = this.t.ty(e);
    if (ty === N_DOT_QUALIFIED_EXPRESSION) {
      for (let c = this.t.fst(e); c >= 0; c = this.t.nxt(c)) {
        if (this.t.lf(c) === 0) {
          this.collectSegments(c, out);
        }
      }
    } else if (ty === N_REFERENCE_EXPRESSION) {
      out.push(kpUnquote(this.text(e)));
    }
  }

  // ---- sortedAndDistinctImports ----------------------------------------------

  sortImports(root: i32, out: Out): boolean {
    const il = this.child(root, N_IMPORT_LIST);
    if (il < 0 || this.child(il, N_IMPORT_DIRECTIVE) < 0) {
      return false;
    }
    const comments: i32[] = [];
    const imports: i32[] = [];
    const keys: string[] = [];
    for (let c = this.t.fst(il); c >= 0; c = this.t.nxt(c)) {
      const ty = this.t.ty(c);
      if (kIsComment(ty)) {
        comments.push(c);
      } else if (ty === N_IMPORT_DIRECTIVE) {
        imports.push(c);
      } else if (ty !== T_WHITE_SPACE) {
        this.failed = true;
        this.failure = "Imports not contiguous";
        return false;
      }
    }
    for (let i = 0; i < toI32(imports.length); i++) {
      const imp = imports[i];
      const alias = this.child(imp, N_IMPORT_ALIAS);
      const aliasText = alias >= 0 ? kpRemoveBackticks(this.text(alias)) : "null";
      keys.push(`${this.fqName(imp)} ${aliasText} ${this.child(imp, T_MUL) >= 0 ? "*" : ""}`);
    }
    const order: i32[] = [];
    for (let i = 0; i < toI32(imports.length); i++) {
      order.push(i);
    }
    stableSort(order, (x: i32, y: i32): i32 => kpCompareKeys(keys, x, y));
    const parts: string[] = [];
    for (let i = 0; i < toI32(comments.length); i++) {
      parts.push(this.text(comments[i]));
    }
    let last = "";
    for (let q = 0; q < toI32(order.length); q++) {
      const i = order[q];
      if (i < 0 || i >= keys.length || i >= imports.length) {
        fault();
        return false;
      }
      if (q > 0 && keys[i] === last) {
        continue;
      }
      last = keys[i];
      parts.push(this.text(imports[i]));
    }
    let body = parts.join("\n");
    const nl = kpLastIndexOf(body, 10);
    if (nl >= 0 && nl < toI32(body.length) && body.indexOf("//", nl + 1) >= 0) {
      body = `${body}\n`;
    }
    this.edit(this.t.st(il), this.t.en(il), body);
    const changed = this.apply(out);
    return changed && !(out.n === this.n && kpSameBytes(out.buf, this.src, this.n));
  }

  // ---- dropRedundantElements -------------------------------------------------

  dropRedundant(root: i32, out: Out): boolean {
    const used: string[] = [];
    const semis: i32[] = [];
    this.thisPackage = "";
    this.scan(root, used, semis, false);
    for (let i = 0; i < toI32(semis.length); i++) {
      const s = semis[i];
      const nx = this.t.nxt(s);
      const keepLine = nx >= 0 && this.t.ty(nx) === T_WHITE_SPACE && this.hasNewline(nx);
      this.edit(this.t.st(s), this.t.en(s), keepLine ? "" : "\n");
    }
    this.redundantImports(root, used);
    this.dropTrailingCommas(root, false);
    return this.apply(out);
  }

  /**
   * RedundantElementManager's trailing-comma removal, which only COMPLETE
   * runs: an edit dropping each, and with `mark` each marked removed.
   */
  dropTrailingCommas(root: i32, mark: boolean): void {
    if (!K_REMOVE_REDUNDANT_TRAILING_COMMAS) {
      return;
    }
    const commas: i32[] = [];
    this.detectTrailingCommas(root, commas);
    for (let i = 0; i < toI32(commas.length); i++) {
      const c = commas[i];
      this.edit(this.t.st(c), this.t.en(c), "");
      if (mark) {
        this.markRemoved(c);
      }
    }
  }

  /**
   * TrailingCommas.Detector: every comma that is the trailing comma of the
   * managed list it belongs to, as RedundantElementManager visits them
   * (not inside KDoc, whose commas are not tree nodes here).
   */
  detectTrailingCommas(n: i32, out: i32[]): void {
    const t = this.t;
    if (t.ty(n) === T_COMMA) {
      const p = t.par(n);
      if (p >= 0 && this.managedTrailingComma(p) === n) {
        out.push(n);
      }
      return;
    }
    if (t.lf(n) === 1) {
      return;
    }
    for (let c = t.fst(n); c >= 0; c = t.nxt(c)) {
      this.detectTrailingCommas(c, out);
    }
  }

  /** TrailingCommas.extractManagedList(list)?.trailingComma: the node, or -1. */
  managedTrailingComma(list: i32): i32 {
    const t = this.t;
    const ty = t.ty(list);
    if (ty === N_VALUE_PARAMETER_LIST) {
      const p = t.par(list);
      if (p >= 0 && t.ty(p) === N_FUNCTION_LITERAL) {
        // getTrailingCommaByElementsList: the last child, or before it when that is a comment.
        let last = t.lst(list);
        if (last >= 0 && kIsComment(t.ty(last))) {
          last = this.prevConcrete(last);
        }
        return last >= 0 && t.ty(last) === T_COMMA ? last : -1;
      }
      return this.trailingCommaNode(list, T_RPAR);
    }
    if (ty === N_VALUE_ARGUMENT_LIST) {
      return this.trailingCommaNode(list, T_RPAR);
    }
    if (ty === N_TYPE_ARGUMENT_LIST || ty === N_TYPE_PARAMETER_LIST) {
      return this.trailingCommaNode(list, T_GT);
    }
    if (ty === N_COLLECTION_LITERAL_EXPRESSION) {
      return this.trailingCommaNode(list, T_RBRACKET);
    }
    if (ty === N_WHEN_ENTRY) {
      return this.trailingCommaNode(list, T_ARROW);
    }
    if (ty === N_ENUM_ENTRY) {
      const body = t.par(list);
      return body >= 0 && this.isEnumBody(body) ? this.enumTrailingComma(body) : -1;
    }
    if (ty === N_CLASS_BODY) {
      return this.isEnumBody(list) ? this.enumTrailingComma(list) : -1;
    }
    return -1;
  }

  thisPackage: string = "";

  // The combined passes: semicolons dropped (by node) and where those that
  // become a line break were.
  removedOn: boolean = false;
  removed: u8[];
  nlSemis: i32[];

  /**
   * sortedAndDistinctImports, dropRedundantElements and addRedundantElements
   * at once, all read off the tree of the text before them, so the text is
   * parsed again once rather than after each: -1 when that cannot be done
   * (a semicolon among the imports) and the caller runs them one by one, 0
   * when nothing changes, 1 when the new text is in `out`.
   */
  combined(root: i32, out: Out): i32 {
    const t = this.t;
    const il = this.child(root, N_IMPORT_LIST);
    if (il >= 0) {
      const src = this.src;
      const e = t.en(il);
      for (let i = t.st(il); i < e; i++) {
        if (i < 0 || i >= src.length) {
          fault();
          return -1;
        }
        if (toI32(src[i]) === 59) {
          return -1;
        }
      }
    }
    // The imports, sorted and without duplicates.
    const imports: i32[] = [];
    const comments: i32[] = [];
    const keys: string[] = [];
    const hasImports = il >= 0 && this.child(il, N_IMPORT_DIRECTIVE) >= 0;
    if (hasImports) {
      for (let c = t.fst(il); c >= 0; c = t.nxt(c)) {
        const ty = t.ty(c);
        if (kIsComment(ty)) {
          comments.push(c);
        } else if (ty === N_IMPORT_DIRECTIVE) {
          imports.push(c);
        } else if (ty !== T_WHITE_SPACE) {
          this.failed = true;
          this.failure = "Imports not contiguous";
          return 0;
        }
      }
      for (let i = 0; i < toI32(imports.length); i++) {
        const imp = imports[i];
        const alias = this.child(imp, N_IMPORT_ALIAS);
        const aliasText = alias >= 0 ? kpRemoveBackticks(this.text(alias)) : "null";
        keys.push(`${this.fqName(imp)} ${aliasText} ${this.child(imp, T_MUL) >= 0 ? "*" : ""}`);
      }
    }
    const order: i32[] = [];
    for (let i = 0; i < toI32(imports.length); i++) {
      order.push(i);
    }
    stableSort(order, (x: i32, y: i32): i32 => kpCompareKeys(keys, x, y));
    const kept: i32[] = [];
    for (let q = 0; q < toI32(order.length); q++) {
      const i = order[q];
      if (i < 0 || i >= keys.length || i >= imports.length) {
        fault();
        return 0;
      }
      if (q > 0) {
        const h = order[q - 1];
        if (h < 0 || h >= keys.length) {
          fault();
          return 0;
        }
        if (keys[i] === keys[h]) {
          continue;
        }
      }
      kept.push(imports[i]);
    }
    // Uses, redundant semicolons, and which of the kept imports go.
    const used: string[] = [];
    const semis: i32[] = [];
    this.thisPackage = "";
    this.scan(root, used, semis, false);
    const drop = this.redundantAmong(kept, used);
    if (hasImports) {
      const parts: string[] = [];
      for (let i = 0; i < toI32(comments.length); i++) {
        parts.push(this.text(comments[i]));
      }
      for (let i = 0; i < toI32(kept.length); i++) {
        parts.push(this.text(kept[i]));
      }
      const sortedBody = parts.join("\n");
      const nl = kpLastIndexOf(sortedBody, 10);
      const terminator = nl >= 0 && nl < toI32(sortedBody.length) && sortedBody.indexOf("//", nl + 1) >= 0;
      // parts holds the comments, then the kept imports.
      const base = toI32(comments.length);
      for (let i = 0; i < toI32(kept.length); i++) {
        const j = toI32(toU32(base) + toU32(i));
        if (i >= drop.length || j < 0 || j >= parts.length) {
          fault();
          return 0;
        }
        if (drop[i] === 1) {
          parts[j] = "";
        }
      }
      const body = parts.join("\n") + (terminator ? "\n" : "");
      if (!this.textIs(il, body)) {
        this.edit(t.st(il), t.en(il), body);
      }
    }
    this.removed = newU8s(t.n);
    this.nlSemis = [];
    for (let i = 0; i < toI32(semis.length); i++) {
      const sm = semis[i];
      const nx = t.nxt(sm);
      const keepLine = nx >= 0 && t.ty(nx) === T_WHITE_SPACE && this.hasNewline(nx);
      this.edit(t.st(sm), t.en(sm), keepLine ? "" : "\n");
      this.markRemoved(sm);
      if (!keepLine) {
        this.nlSemis.push(t.st(sm));
      }
    }
    this.dropTrailingCommas(root, true);
    this.removedOn = true;
    this.suggest(root);
    this.removedOn = false;
    this.nlSemis = [];
    return this.apply(out) ? 1 : 0;
  }

  textIs(n: i32, s: string): boolean {
    const a = this.t.st(n);
    const k = toI32(s.length);
    if (toI64(this.t.en(n)) - toI64(a) !== toI64(k)) {
      return false;
    }
    const src = this.src;
    let j = a;
    for (let i = 0; i < k; i++) {
      if (j < 0 || j >= src.length) {
        fault();
        return false;
      }
      if (toI32(src[j]) !== s.charCodeAt(i)) {
        return false;
      }
      j++;
    }
    return true;
  }

  /** removed[c] = 1, for a node of the tree `removed` was made for. */
  markRemoved(c: i32): void {
    const rm = this.removed;
    if (c >= 0 && c < rm.length) {
      rm[c] = 1;
    } else {
      fault();
    }
  }

  /** RedundantImportDetector over the imports `imps` (in order): 1 for each that goes. */
  redundantAmong(imps: i32[], used: string[]): u8[] {
    const res: u8[] = [];
    const ids: string[] = [];
    const cand: u8[] = [];
    for (let i = 0; i < toI32(imps.length); i++) {
      res.push(0);
      cand.push(0);
      ids.push("");
    }
    for (let i = 0; i < toI32(imps.length); i++) {
      const c = imps[i];
      if (this.child(c, T_MUL) >= 0 || this.importRef(c) < 0) {
        continue;
      }
      const id = this.importIdentifier(c);
      if (kpIsOperatorName(id) || kpIsComponentN(id)) {
        continue;
      }
      if (i >= cand.length || i >= ids.length) {
        fault();
        return res;
      }
      cand[i] = 1;
      ids[i] = id;
    }
    for (let i = 0; i < toI32(imps.length); i++) {
      if (i >= cand.length || i >= ids.length) {
        fault();
        return res;
      }
      if (cand[i] === 0) {
        continue;
      }
      const id = ids[i];
      let isUsed = false;
      for (let j = 0; j < toI32(used.length) && !isUsed; j++) {
        if (used[j] === id) {
          isUsed = true;
        }
      }
      const imp = imps[i];
      const fq = this.fqName(imp);
      const dot = kpLastIndexOf(fq, 46);
      const parent = dot >= 0 ? fq.substring(0, dot) : "";
      const fromThisPackage = !this.lastSegmentHasDot(imp) && parent === this.thisPackage;
      const hasAlias = this.child(imp, N_IMPORT_ALIAS) >= 0;
      // count stays below j + 1, so below the length.
      let count = 0;
      for (let j = 0; j < cand.length && j < ids.length; j++) {
        if (cand[j] === 1 && ids[j] === id) {
          if (count >= cand.length) {
            fault();
            return res;
          }
          count++;
        }
      }
      if (!isUsed || (fromThisPackage && !hasAlias && count <= 1)) {
        if (i >= res.length) {
          fault();
          return res;
        }
        res[i] = 1;
      }
    }
    return res;
  }

  scan(n: i32, used: string[], semis: i32[], skipRefs: boolean): void {
    const t = this.t;
    const ty = t.ty(n);
    if (ty === T_DOC_COMMENT) {
      kdocReferences(this.src, t.st(n), t.en(n), used);
      return;
    }
    if (ty === T_SEMICOLON) {
      if (this.isExtraSemicolon(n)) {
        semis.push(n);
      }
      return;
    }
    if (t.lf(n) === 1) {
      return;
    }
    let skip = skipRefs;
    if (ty === N_PACKAGE_DIRECTIVE) {
      const segs: string[] = [];
      const ref = this.importRef(n);
      if (ref >= 0) {
        this.collectSegments(ref, segs);
      }
      this.thisPackage = segs.join(".");
      skip = true;
    } else if (ty === N_IMPORT_LIST) {
      skip = true;
    } else if (!skip && kpIsReferenceExpression(ty) && !this.hasPsiChildren(n)) {
      used.push(kpTrimBackticks(this.text(n)));
    }
    for (let c = t.fst(n); c >= 0; c = t.nxt(c)) {
      this.scan(c, used, semis, skip);
    }
  }

  hasPsiChildren(n: i32): boolean {
    for (let c = this.t.fst(n); c >= 0; c = this.t.nxt(c)) {
      if (kIsPsiChild(this.t, c)) {
        return true;
      }
    }
    return false;
  }

  lastPsiChild(n: i32): i32 {
    let last = -1;
    for (let c = this.t.fst(n); c >= 0; c = this.t.nxt(c)) {
      if (kIsPsiChild(this.t, c)) {
        last = c;
      }
    }
    return last;
  }

  isExtraSemicolon(s: i32): boolean {
    const t = this.t;
    const parent = t.par(s);
    const pt = t.ty(parent);
    if (
      pt === N_STRING_TEMPLATE ||
      pt === N_LITERAL_STRING_TEMPLATE_ENTRY ||
      pt === N_SHORT_STRING_TEMPLATE_ENTRY ||
      pt === N_LONG_STRING_TEMPLATE_ENTRY ||
      pt === N_ESCAPE_STRING_TEMPLATE_ENTRY
    ) {
      return false;
    }
    if (pt === N_ENUM_ENTRY) {
      return this.lastPsiChild(t.par(parent)) === parent;
    }
    const prev = this.prevConcrete(s);
    if (pt === N_CLASS_BODY) {
      if (
        prev >= 0 &&
        t.ty(prev) === N_OBJECT_DECLARATION &&
        this.child(this.child(prev, N_MODIFIER_LIST), T_COMPANION_KEYWORD) >= 0
      ) {
        if (this.child(prev, T_IDENTIFIER) < 0) {
          const nx = this.nextConcrete(s);
          const isLast = nx < 0 || t.ty(nx) === T_RBRACE;
          if (!isLast) {
            return false;
          }
        }
      }
      if (!this.isEnumBody(parent)) {
        return true;
      }
      return s !== this.enumTerminatingSemicolon(parent) || !this.hasPsiChildren(parent);
    }
    const prevLeaf = this.prevLeaf(s);
    if (prev >= 0 && (t.ty(prev) === N_IF || t.ty(prev) === N_WHILE) && prevLeaf >= 0) {
      const lt = t.ty(prevLeaf);
      if ((lt === N_THEN || lt === N_ELSE || lt === N_BODY) && t.en(prevLeaf) === t.st(prevLeaf)) {
        return false;
      }
    }
    const nx = this.nextConcrete(s);
    if (nx >= 0) {
      const nt = t.ty(nx);
      if (nt === N_LAMBDA_EXPRESSION) {
        return false;
      }
      if (nt === N_DOT_QUALIFIED_EXPRESSION) {
        const r = this.firstExpr(nx);
        if (r >= 0 && t.ty(r) === N_LAMBDA_EXPRESSION) {
          return false;
        }
      }
    }
    return true;
  }

  firstExpr(n: i32): i32 {
    for (let c = this.t.fst(n); c >= 0; c = this.t.nxt(c)) {
      if (kIsExpr(this.t.ty(c))) {
        return c;
      }
    }
    return -1;
  }

  /** PsiTreeUtil.prevLeaf: the deepest last descendant of the previous sibling, up the parents. */
  prevLeaf(e: i32): i32 {
    let x = e;
    while (x >= 0) {
      const p = this.t.prv(x);
      if (p >= 0) {
        let y = p;
        while (this.t.lf(y) === 0 && this.t.lst(y) >= 0) {
          y = this.t.lst(y);
        }
        return y;
      }
      x = this.t.par(x);
      if (x >= 0 && this.t.par(x) < 0) {
        return -1;
      }
    }
    return -1;
  }

  isEnumBody(body: i32): boolean {
    const clazz = this.t.par(body);
    return (
      clazz >= 0 && this.t.ty(clazz) === N_CLASS && this.child(this.child(clazz, N_MODIFIER_LIST), T_ENUM_KEYWORD) >= 0
    );
  }

  lastEnumEntry(body: i32): i32 {
    let last = -1;
    for (let c = this.t.fst(body); c >= 0; c = this.t.nxt(c)) {
      if (this.t.ty(c) === N_ENUM_ENTRY) {
        last = c;
      }
    }
    return last;
  }

  /** EnumEntryList's last token of the last entry, past whitespace and comments. */
  enumLastToken(entry: i32): i32 {
    let c = this.t.lst(entry);
    while (c >= 0 && (this.isWsOrComment(c) || this.isRemoved(c))) {
      c = this.t.prv(c);
    }
    return c;
  }

  /** Whether the combined passes drop node `c` (a semicolon or a trailing comma) before the comma pass reads the tree. */
  isRemoved(c: i32): boolean {
    if (!this.removedOn) {
      return false;
    }
    const rm = this.removed;
    if (c >= 0 && c < rm.length) {
      return rm[c] === 1;
    }
    fault();
    return false;
  }

  enumTerminatingSemicolon(body: i32): i32 {
    const last = this.lastEnumEntry(body);
    if (last < 0) {
      for (let c = this.t.fst(body); c >= 0; c = this.t.nxt(c)) {
        if (this.t.ty(c) === T_SEMICOLON && !this.isRemoved(c)) {
          return c;
        }
      }
      return -1;
    }
    const tok = this.enumLastToken(last);
    return tok >= 0 && this.t.ty(tok) === T_SEMICOLON ? tok : -1;
  }

  enumTrailingComma(body: i32): i32 {
    const last = this.lastEnumEntry(body);
    if (last < 0) {
      return -1;
    }
    const tok = this.enumLastToken(last);
    if (tok < 0) {
      return -1;
    }
    if (this.t.ty(tok) === T_COMMA) {
      return tok;
    }
    if (this.t.ty(tok) === T_SEMICOLON) {
      const p = this.prevConcrete(tok);
      return p >= 0 && this.t.ty(p) === T_COMMA && !this.isRemoved(p) ? p : -1;
    }
    return -1;
  }

  /** RedundantImportDetector.getRedundantImportElements, as edits. */
  redundantImports(root: i32, used: string[]): void {
    const il = this.child(root, N_IMPORT_LIST);
    if (il < 0) {
      return;
    }
    const cands: i32[] = [];
    const ids: string[] = [];
    for (let c = this.t.fst(il); c >= 0; c = this.t.nxt(c)) {
      if (this.t.ty(c) !== N_IMPORT_DIRECTIVE || this.child(c, T_MUL) >= 0 || this.importRef(c) < 0) {
        continue;
      }
      const id = this.importIdentifier(c);
      if (kpIsOperatorName(id) || kpIsComponentN(id)) {
        continue;
      }
      cands.push(c);
      ids.push(id);
    }
    for (let i = 0; i < toI32(cands.length); i++) {
      if (i >= ids.length) {
        fault();
        return;
      }
      const cand = cands[i];
      const id = ids[i];
      let isUsed = kpIsOperatorName(id);
      for (let j = 0; j < toI32(used.length) && !isUsed; j++) {
        if (used[j] === id) {
          isUsed = true;
        }
      }
      const fq = this.fqName(cand);
      const dot = kpLastIndexOf(fq, 46);
      const parent = dot >= 0 ? fq.substring(0, dot) : "";
      const segsHaveDot = this.lastSegmentHasDot(cand);
      const fromThisPackage = !segsHaveDot && parent === this.thisPackage;
      const hasAlias = this.child(cand, N_IMPORT_ALIAS) >= 0;
      // count stays below j + 1, so below the length.
      let count = 0;
      for (let j = 0; j < toI32(ids.length); j++) {
        if (ids[j] === id) {
          if (count >= ids.length) {
            fault();
            return;
          }
          count++;
        }
      }
      if (!isUsed || (fromThisPackage && !hasAlias && count <= 1)) {
        this.edit(this.t.st(cand), this.t.en(cand), "");
      }
    }
  }

  /** Whether the import's last name, unquoted, contains a dot. */
  lastSegmentHasDot(imp: i32): boolean {
    const segs: string[] = [];
    this.collectSegments(this.importRef(imp), segs);
    const k = segs.length;
    if (k > 0) {
      return segs[k - 1].indexOf(".") >= 0;
    }
    return false;
  }

  /** The imported name (the alias, else the last segment), backticks trimmed, after its last dot. */
  importIdentifier(imp: i32): string {
    const alias = this.child(imp, N_IMPORT_ALIAS);
    let name = "";
    if (alias >= 0) {
      const id = this.child(alias, T_IDENTIFIER);
      name = id >= 0 ? kpUnquote(this.text(id)) : "";
    } else {
      const segs: string[] = [];
      this.collectSegments(this.importRef(imp), segs);
      const k = segs.length;
      if (k > 0) {
        name = segs[k - 1];
      }
    }
    name = kpTrimBackticks(name);
    const d = kpLastIndexOf(name, 46);
    const len = toI32(name.length);
    // The last dot is at d in [0, len).
    if (d >= 0 && d < len) {
      return name.substring(d + 1, len);
    }
    return name;
  }

  // ---- addRedundantElements: trailing commas -----------------------------------

  addTrailingCommas(root: i32, out: Out): boolean {
    this.suggest(root);
    return this.apply(out);
  }

  // Mapped mode: the tree is of the text before pretty printing, the commas
  // go into its output. Code lexemes correspond one to one; `mIn` holds each
  // one's input start and end, `mOut` its output start and end.
  mapped: boolean = false;
  mapFailed: boolean = false;
  mInStart: i32[];
  mInEnd: i32[];
  mOutStart: i32[];
  mOutEnd: i32[];
  mBuf: u8[];
  mN: i32 = 0;
  mCount: i32 = 0;

  /**
   * addRedundantElements over the pretty printer's output `buf[0, n)`, read
   * through the tree of the text it came from; answers -1 when a position
   * does not map (the caller reparses), else 1 when commas went in, 0 when not.
   */
  addTrailingCommasMapped(
    root: i32,
    buf: u8[],
    n: i32,
    inStart: i32[],
    inEnd: i32[],
    outStart: i32[],
    outEnd: i32[],
    count: i32,
    out: Out,
  ): i32 {
    this.mCount = count;
    this.mapped = true;
    this.mapFailed = false;
    this.mInStart = inStart;
    this.mInEnd = inEnd;
    this.mOutStart = outStart;
    this.mOutEnd = outEnd;
    this.mBuf = buf;
    this.mN = n;
    this.suggest(root);
    this.mapped = false;
    if (this.mapFailed) {
      return -1;
    }
    this.src = buf;
    this.n = n;
    return this.apply(out) ? 1 : 0;
  }

  /** The output offset of input offset `p`, a code lexeme's start (`end` false) or end. */
  mapPos(p: i32, end: boolean): i32 {
    const a = end ? this.mInEnd : this.mInStart;
    const o = end ? this.mOutEnd : this.mOutStart;
    const mc = this.mCount;
    let lo = 0;
    let hi = -1;
    if (mc > 0) {
      hi = mc - 1;
    }
    while (lo <= hi) {
      // 0 <= lo <= hi, so the u32 sum is exact.
      const mid = toI32((toU32(lo) + toU32(hi)) >> 1);
      if (mid < 0 || mid >= a.length) {
        fault();
        return 0;
      }
      if (a[mid] < p) {
        lo = mid + 1;
      } else if (a[mid] > p) {
        hi = mid - 1;
      } else {
        if (mid >= o.length) {
          fault();
          return 0;
        }
        return o[mid];
      }
    }
    this.mapFailed = true;
    return 0;
  }

  /** hasNewline of a bracketed list, measured in the output. */
  listHasNewline(n: i32): boolean {
    if (!this.mapped) {
      if (this.hasNewline(n)) {
        return true;
      }
      // A dropped semicolon that became a line break inside the list.
      for (let i = 0; i < toI32(this.nlSemis.length); i++) {
        const p = this.nlSemis[i];
        if (p >= this.t.st(n) && p < this.t.en(n)) {
          return true;
        }
      }
      return false;
    }
    const a = this.mapPos(this.t.st(n), false);
    const b = this.mapPos(this.t.en(n), true);
    const mb = this.mBuf;
    for (let i = a; i < b; i++) {
      if (i < 0 || i >= mb.length) {
        fault();
        return false;
      }
      if (toI32(mb[i]) === 10) {
        return true;
      }
    }
    return false;
  }

  suggest(n: i32): void {
    const t = this.t;
    if (t.lf(n) === 1) {
      return;
    }
    this.takeElement(n);
    for (let c = t.fst(n); c >= 0; c = t.nxt(c)) {
      this.suggest(c);
    }
  }

  takeElement(n: i32): void {
    const t = this.t;
    const ty = t.ty(n);
    let last = -1;
    let any = false; // whether the list has an element
    let hasComma = false;
    if (
      ty === N_VALUE_ARGUMENT_LIST ||
      ty === N_VALUE_PARAMETER_LIST ||
      ty === N_TYPE_ARGUMENT_LIST ||
      ty === N_TYPE_PARAMETER_LIST
    ) {
      if (ty === N_VALUE_PARAMETER_LIST) {
        const p = t.par(n);
        if (p >= 0 && t.ty(p) === N_FUNCTION_LITERAL && t.par(p) >= 0 && t.ty(t.par(p)) === N_LAMBDA_EXPRESSION) {
          return;
        }
      }
      const item =
        ty === N_VALUE_ARGUMENT_LIST
          ? N_VALUE_ARGUMENT
          : ty === N_VALUE_PARAMETER_LIST
            ? N_VALUE_PARAMETER
            : ty === N_TYPE_ARGUMENT_LIST
              ? N_TYPE_PROJECTION
              : N_TYPE_PARAMETER;
      for (let c = t.fst(n); c >= 0; c = t.nxt(c)) {
        if (t.ty(c) === item) {
          last = c;
          any = true;
        }
      }
      const close = ty === N_VALUE_ARGUMENT_LIST || ty === N_VALUE_PARAMETER_LIST ? T_RPAR : T_GT;
      hasComma = this.trailingCommaBefore(n, close);
    } else if (ty === N_COLLECTION_LITERAL_EXPRESSION) {
      for (let c = t.fst(n); c >= 0; c = t.nxt(c)) {
        if (kIsExpr(t.ty(c))) {
          last = c;
          any = true;
        }
      }
      hasComma = this.trailingCommaBefore(n, T_RBRACKET);
    } else if (ty === N_CLASS_BODY) {
      if (!this.isEnumBody(n) || this.enumTerminatingSemicolon(n) >= 0) {
        return;
      }
      for (let c = t.fst(n); c >= 0; c = t.nxt(c)) {
        if (t.ty(c) === N_ENUM_ENTRY) {
          last = c;
          any = true;
        }
      }
      hasComma = this.enumTrailingComma(n) >= 0;
    } else {
      return;
    }
    if (!any || hasComma || !this.listHasNewline(n)) {
      return;
    }
    const leaf = this.leftLeaf(last);
    const at = this.mapped ? this.mapPos(t.en(leaf), true) : t.en(leaf);
    this.edit(at, at, ",");
  }

  /** Whether the list has a trailing comma that the combined passes keep. */
  trailingCommaBefore(list: i32, close: i32): boolean {
    const c = this.trailingCommaNode(list, close);
    return c >= 0 && !this.isRemoved(c);
  }

  /** getTrailingCommaByClosingElement of the list's first `close` child: the comma node, or -1. */
  trailingCommaNode(list: i32, close: i32): i32 {
    const cl = this.child(list, close);
    if (cl < 0) {
      return -1;
    }
    const p = this.prevConcrete(cl);
    return p >= 0 && this.t.ty(p) === T_COMMA ? p : -1;
  }

  /** leftLeafIgnoringCommentsAndWhitespace. */
  leftLeaf(e: i32): i32 {
    let x = e;
    while (true) {
      if (this.t.lf(x) === 1) {
        return x;
      }
      let c = this.t.lst(x);
      while (c >= 0 && (this.isWsOrComment(c) || this.isRemoved(c))) {
        c = this.t.prv(c);
      }
      if (c < 0) {
        return x;
      }
      x = c;
    }
  }
}

const kpIsReferenceExpression = (t: i32): boolean =>
  t === N_REFERENCE_EXPRESSION ||
  t === N_OPERATION_REFERENCE ||
  t === N_LABEL ||
  t === N_ENUM_ENTRY_SUPERCLASS_REFERENCE_EXPRESSION ||
  t === N_CALL_EXPRESSION ||
  t === N_ARRAY_ACCESS_EXPRESSION ||
  t === N_COLLECTION_LITERAL_EXPRESSION ||
  t === N_CONSTRUCTOR_DELEGATION_REFERENCE;

/** RedundantImportDetector.OPERATORS. */
const kpIsOperatorName = (s: string): boolean =>
  s === "unaryPlus" ||
  s === "unaryMinus" ||
  s === "not" ||
  s === "inc" ||
  s === "dec" ||
  s === "plus" ||
  s === "minus" ||
  s === "times" ||
  s === "div" ||
  s === "rem" ||
  s === "mod" ||
  s === "rangeTo" ||
  s === "contains" ||
  s === "get" ||
  s === "set" ||
  s === "invoke" ||
  s === "plusAssign" ||
  s === "minusAssign" ||
  s === "timesAssign" ||
  s === "divAssign" ||
  s === "remAssign" ||
  s === "modAssign" ||
  s === "equals" ||
  s === "compareTo" ||
  s === "iterator" ||
  s === "next" ||
  s === "hasNext" ||
  s === "and" ||
  s === "or" ||
  s === "getValue" ||
  s === "setValue" ||
  s === "provideDelegate" ||
  s === "assign";

/** `component\d+`. */
const kpIsComponentN = (s: string): boolean => {
  if (!s.startsWith("component") || s.length <= 9) {
    return false;
  }
  for (let i = 9; i < toI32(s.length); i++) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) {
      return false;
    }
  }
  return true;
};

/** Removes a surrounding pair of backticks. */
const kpUnquote = (s: string): string => {
  const k = toI32(s.length);
  if (k >= 2 && toI32(s.length) > 0 && s.charCodeAt(0) === 96) {
    const l = k - 1;
    if (l < toI32(s.length) && s.charCodeAt(l) === 96) {
      return s.substring(1, l);
    }
  }
  return s;
};

/** String.trim('`'): every leading and trailing backtick. */
const kpTrimBackticks = (s: string): string => {
  let a = 0;
  let b = toI32(s.length);
  while (a < b && s.charCodeAt(a) === 96) {
    a++;
  }
  while (b > a && b > 0 && b <= toI32(s.length) && s.charCodeAt(b - 1) === 96) {
    b--;
  }
  return s.substring(a, b);
};

const kpRemoveBackticks = (s: string): string => {
  let r = "";
  let a = 0;
  for (let i = 0; i < toI32(s.length); i++) {
    if (s.charCodeAt(i) === 96) {
      r = r + s.substring(a, i);
      a = i + 1;
    }
  }
  return a === 0 ? s : r + s.substring(a, toI32(s.length));
};

/** The last index of the UTF-16 unit `c` in `s`, or -1. */
const kpLastIndexOf = (s: string, c: i32): i32 => {
  for (let i = toI32(s.length) - 1; i >= 0; i--) {
    if (s.charCodeAt(i) === c) {
      return i;
    }
  }
  return -1;
};

/** String.compareTo: UTF-16 code unit order. */
const kpCompareUtf16 = (a: string, b: string): i32 => {
  for (let i = 0; i < toI32(a.length) && i < toI32(b.length); i++) {
    // Strings are UTF-8 bytes, so each unit is below 256.
    const x = a.charCodeAt(i) & 0xff;
    const y = b.charCodeAt(i) & 0xff;
    if (x !== y) {
      return x - y;
    }
  }
  return toI32(a.length) - toI32(b.length);
};

/** Orders import indexes by key, ties by index (the stable order). */
const kpCompareKeys = (keys: string[], x: i32, y: i32): i32 => {
  if (x < 0 || x >= keys.length || y < 0 || y >= keys.length) {
    fault();
    return 0;
  }
  const c = kpCompareUtf16(keys[x], keys[y]);
  if (c !== 0) {
    return c;
  }
  return x < y ? -1 : x > y ? 1 : 0;
};

const kpSameBytes = (a: u8[], b: u8[], n: i32): boolean => {
  for (let i = 0; i < n; i++) {
    if (i >= a.length || i >= b.length) {
      fault();
      return false;
    }
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
};
