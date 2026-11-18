// ktfmt's text-to-text passes around the pretty printer: sorting and
// de-duplicating imports, dropping unused imports and redundant
// semicolons, and adding trailing commas to multi-line lists. Each reads
// the tree of the current text and writes the new text into `out`,
// answering whether anything changed.
//
// Ported from ktfmt 0.65's Formatter.sortedAndDistinctImports,
// RedundantElementManager, RedundantImportDetector,
// RedundantSemicolonDetector, TrailingCommas and EnumEntryList (Apache
// License 2.0, Copyright (c) Meta Platforms, Inc. and affiliates).

import { Out } from "../core/out";
import { KTree } from "./builder";
import { kIsComment, kIsPsiChild } from "./input";
import { kdocReferences } from "./kdoclinks";
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
  N_WHILE,
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
    return String.fromBytes(this.src, this.t.start[n], this.t.end[n]);
  }

  child(n: i32, type: i32): i32 {
    if (n < 0) {
      return -1;
    }
    for (let c = this.t.first[n]; c >= 0; c = this.t.next[c]) {
      if (this.t.type[c] === type) {
        return c;
      }
    }
    return -1;
  }

  isWsOrComment(c: i32): boolean {
    const ty = this.t.type[c];
    return ty === T_WHITE_SPACE || kIsComment(ty);
  }

  prevConcrete(c: i32): i32 {
    let p = this.t.prev[c];
    while (p >= 0 && this.isWsOrComment(p)) {
      p = this.t.prev[p];
    }
    return p;
  }

  nextConcrete(c: i32): i32 {
    let p = this.t.next[c];
    while (p >= 0 && this.isWsOrComment(p)) {
      p = this.t.next[p];
    }
    return p;
  }

  hasNewline(n: i32): boolean {
    for (let i = this.t.start[n]; i < this.t.end[n]; i++) {
      if (toI32(this.src[i]) === 10) {
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
    order.sort((x: i32, y: i32): i32 => (ends[y] !== ends[x] ? ends[y] - ends[x] : x - y));
    // Edits never overlap here; write the text front to back from the reversed order.
    out.n = 0;
    let pos = 0;
    for (let q = k - 1; q >= 0; q--) {
      const i = order[q];
      const a = this.eStart[i];
      if (a > pos) {
        out.range(this.src, pos, a);
      }
      out.str(this.eText[i]);
      if (this.eEnd[i] > pos) {
        pos = this.eEnd[i];
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
    for (let c = this.t.first[imp]; c >= 0; c = this.t.next[c]) {
      const ty = this.t.type[c];
      if (ty === N_DOT_QUALIFIED_EXPRESSION || ty === N_REFERENCE_EXPRESSION) {
        return c;
      }
    }
    return -1;
  }

  collectSegments(e: i32, out: string[]): void {
    const ty = this.t.type[e];
    if (ty === N_DOT_QUALIFIED_EXPRESSION) {
      for (let c = this.t.first[e]; c >= 0; c = this.t.next[c]) {
        if (this.t.leaf[c] === 0) {
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
    for (let c = this.t.first[il]; c >= 0; c = this.t.next[c]) {
      const ty = this.t.type[c];
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
    order.sort((x: i32, y: i32): i32 => {
      const c = kpCompareUtf16(keys[x], keys[y]);
      return c !== 0 ? c : x - y;
    });
    const parts: string[] = [];
    for (let i = 0; i < toI32(comments.length); i++) {
      parts.push(this.text(comments[i]));
    }
    let last = "";
    for (let q = 0; q < toI32(order.length); q++) {
      const i = order[q];
      if (q > 0 && keys[i] === last) {
        continue;
      }
      last = keys[i];
      parts.push(this.text(imports[i]));
    }
    let body = parts.join("\n");
    const nl = kpLastIndexOf(body, 10);
    if (nl >= 0 && body.indexOf("//", nl + 1) >= 0) {
      body = `${body}\n`;
    }
    this.edit(this.t.start[il], this.t.end[il], body);
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
      const nx = this.t.next[s];
      const keepLine = nx >= 0 && this.t.type[nx] === T_WHITE_SPACE && this.hasNewline(nx);
      this.edit(this.t.start[s], this.t.end[s], keepLine ? "" : "\n");
    }
    this.redundantImports(root, used);
    return this.apply(out);
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
      for (let i = t.start[il]; i < t.end[il]; i++) {
        if (toI32(this.src[i]) === 59) {
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
      for (let c = t.first[il]; c >= 0; c = t.next[c]) {
        const ty = t.type[c];
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
    order.sort((x: i32, y: i32): i32 => {
      const c = kpCompareUtf16(keys[x], keys[y]);
      return c !== 0 ? c : x - y;
    });
    const kept: i32[] = [];
    for (let q = 0; q < toI32(order.length); q++) {
      if (q > 0 && keys[order[q]] === keys[order[q - 1]]) {
        continue;
      }
      kept.push(imports[order[q]]);
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
      const terminator = nl >= 0 && sortedBody.indexOf("//", nl + 1) >= 0;
      for (let i = 0; i < toI32(kept.length); i++) {
        if (drop[i] === 1) {
          parts[toI32(comments.length) + i] = "";
        }
      }
      const body = parts.join("\n") + (terminator ? "\n" : "");
      if (!this.textIs(il, body)) {
        this.edit(t.start[il], t.end[il], body);
      }
    }
    this.removed = new Array<u8>(t.n);
    this.nlSemis = [];
    for (let i = 0; i < toI32(semis.length); i++) {
      const sm = semis[i];
      const nx = t.next[sm];
      const keepLine = nx >= 0 && t.type[nx] === T_WHITE_SPACE && this.hasNewline(nx);
      this.edit(t.start[sm], t.end[sm], keepLine ? "" : "\n");
      this.removed[sm] = 1;
      if (!keepLine) {
        this.nlSemis.push(t.start[sm]);
      }
    }
    this.removedOn = true;
    this.suggest(root);
    this.removedOn = false;
    this.nlSemis = [];
    return this.apply(out) ? 1 : 0;
  }

  textIs(n: i32, s: string): boolean {
    const a = this.t.start[n];
    const k = toI32(s.length);
    if (this.t.end[n] - a !== k) {
      return false;
    }
    for (let i = 0; i < k; i++) {
      if (toI32(this.src[a + i]) !== s.charCodeAt(i)) {
        return false;
      }
    }
    return true;
  }

  /** RedundantImportDetector over the imports `imps` (in order): 1 for each that goes. */
  redundantAmong(imps: i32[], used: string[]): u8[] {
    const res = new Array<u8>(imps.length);
    const ids: string[] = [];
    const cand: u8[] = new Array<u8>(imps.length);
    for (let i = 0; i < toI32(imps.length); i++) {
      const c = imps[i];
      ids.push("");
      if (this.child(c, T_MUL) >= 0 || this.importRef(c) < 0) {
        continue;
      }
      const id = this.importIdentifier(c);
      if (kpIsOperatorName(id) || kpIsComponentN(id)) {
        continue;
      }
      cand[i] = 1;
      ids[i] = id;
    }
    for (let i = 0; i < toI32(imps.length); i++) {
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
      const fq = this.fqName(imps[i]);
      const dot = kpLastIndexOf(fq, 46);
      const parent = dot >= 0 ? fq.substring(0, dot) : "";
      const fromThisPackage = !this.lastSegmentHasDot(imps[i]) && parent === this.thisPackage;
      const hasAlias = this.child(imps[i], N_IMPORT_ALIAS) >= 0;
      let count = 0;
      for (let j = 0; j < toI32(imps.length); j++) {
        if (cand[j] === 1 && ids[j] === id) {
          count++;
        }
      }
      if (!isUsed || (fromThisPackage && !hasAlias && count <= 1)) {
        res[i] = 1;
      }
    }
    return res;
  }

  scan(n: i32, used: string[], semis: i32[], skipRefs: boolean): void {
    const t = this.t;
    const ty = t.type[n];
    if (ty === T_DOC_COMMENT) {
      kdocReferences(this.src, t.start[n], t.end[n], used);
      return;
    }
    if (ty === T_SEMICOLON) {
      if (this.isExtraSemicolon(n)) {
        semis.push(n);
      }
      return;
    }
    if (t.leaf[n] === 1) {
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
    for (let c = t.first[n]; c >= 0; c = t.next[c]) {
      this.scan(c, used, semis, skip);
    }
  }

  hasPsiChildren(n: i32): boolean {
    for (let c = this.t.first[n]; c >= 0; c = this.t.next[c]) {
      if (kIsPsiChild(this.t, c)) {
        return true;
      }
    }
    return false;
  }

  lastPsiChild(n: i32): i32 {
    let last = -1;
    for (let c = this.t.first[n]; c >= 0; c = this.t.next[c]) {
      if (kIsPsiChild(this.t, c)) {
        last = c;
      }
    }
    return last;
  }

  isExtraSemicolon(s: i32): boolean {
    const t = this.t;
    const parent = t.parent[s];
    const pt = t.type[parent];
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
      return this.lastPsiChild(t.parent[parent]) === parent;
    }
    const prev = this.prevConcrete(s);
    if (pt === N_CLASS_BODY) {
      if (
        prev >= 0 &&
        t.type[prev] === N_OBJECT_DECLARATION &&
        this.child(this.child(prev, N_MODIFIER_LIST), T_COMPANION_KEYWORD) >= 0
      ) {
        if (this.child(prev, T_IDENTIFIER) < 0) {
          const nx = this.nextConcrete(s);
          const isLast = nx < 0 || t.type[nx] === T_RBRACE;
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
    if (prev >= 0 && (t.type[prev] === N_IF || t.type[prev] === N_WHILE) && prevLeaf >= 0) {
      const lt = t.type[prevLeaf];
      if ((lt === N_THEN || lt === N_ELSE || lt === N_BODY) && t.end[prevLeaf] === t.start[prevLeaf]) {
        return false;
      }
    }
    const nx = this.nextConcrete(s);
    if (nx >= 0) {
      const nt = t.type[nx];
      if (nt === N_LAMBDA_EXPRESSION) {
        return false;
      }
      if (nt === N_DOT_QUALIFIED_EXPRESSION) {
        const r = this.firstExpr(nx);
        if (r >= 0 && t.type[r] === N_LAMBDA_EXPRESSION) {
          return false;
        }
      }
    }
    return true;
  }

  firstExpr(n: i32): i32 {
    for (let c = this.t.first[n]; c >= 0; c = this.t.next[c]) {
      if (kIsExpr(this.t.type[c])) {
        return c;
      }
    }
    return -1;
  }

  /** PsiTreeUtil.prevLeaf: the deepest last descendant of the previous sibling, up the parents. */
  prevLeaf(e: i32): i32 {
    let x = e;
    while (x >= 0) {
      const p = this.t.prev[x];
      if (p >= 0) {
        let y = p;
        while (this.t.leaf[y] === 0 && this.t.last[y] >= 0) {
          y = this.t.last[y];
        }
        return y;
      }
      x = this.t.parent[x];
      if (x >= 0 && this.t.parent[x] < 0) {
        return -1;
      }
    }
    return -1;
  }

  isEnumBody(body: i32): boolean {
    const clazz = this.t.parent[body];
    return (
      clazz >= 0 &&
      this.t.type[clazz] === N_CLASS &&
      this.child(this.child(clazz, N_MODIFIER_LIST), T_ENUM_KEYWORD) >= 0
    );
  }

  lastEnumEntry(body: i32): i32 {
    let last = -1;
    for (let c = this.t.first[body]; c >= 0; c = this.t.next[c]) {
      if (this.t.type[c] === N_ENUM_ENTRY) {
        last = c;
      }
    }
    return last;
  }

  /** EnumEntryList's last token of the last entry, past whitespace and comments. */
  enumLastToken(entry: i32): i32 {
    let c = this.t.last[entry];
    while (c >= 0 && (this.isWsOrComment(c) || this.isRemoved(c))) {
      c = this.t.prev[c];
    }
    return c;
  }

  /** Whether the combined passes drop node `c` (a semicolon) before the comma pass reads the tree. */
  isRemoved(c: i32): boolean {
    return this.removedOn && this.removed[c] === 1;
  }

  enumTerminatingSemicolon(body: i32): i32 {
    const last = this.lastEnumEntry(body);
    if (last < 0) {
      for (let c = this.t.first[body]; c >= 0; c = this.t.next[c]) {
        if (this.t.type[c] === T_SEMICOLON && !this.isRemoved(c)) {
          return c;
        }
      }
      return -1;
    }
    const tok = this.enumLastToken(last);
    return tok >= 0 && this.t.type[tok] === T_SEMICOLON ? tok : -1;
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
    if (this.t.type[tok] === T_COMMA) {
      return tok;
    }
    if (this.t.type[tok] === T_SEMICOLON) {
      const p = this.prevConcrete(tok);
      return p >= 0 && this.t.type[p] === T_COMMA ? p : -1;
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
    for (let c = this.t.first[il]; c >= 0; c = this.t.next[c]) {
      if (this.t.type[c] !== N_IMPORT_DIRECTIVE || this.child(c, T_MUL) >= 0 || this.importRef(c) < 0) {
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
      const id = ids[i];
      let isUsed = kpIsOperatorName(id);
      for (let j = 0; j < toI32(used.length) && !isUsed; j++) {
        if (used[j] === id) {
          isUsed = true;
        }
      }
      const fq = this.fqName(cands[i]);
      const dot = kpLastIndexOf(fq, 46);
      const parent = dot >= 0 ? fq.substring(0, dot) : "";
      const segsHaveDot = this.lastSegmentHasDot(cands[i]);
      const fromThisPackage = !segsHaveDot && parent === this.thisPackage;
      const hasAlias = this.child(cands[i], N_IMPORT_ALIAS) >= 0;
      let count = 0;
      for (let j = 0; j < toI32(ids.length); j++) {
        if (ids[j] === id) {
          count++;
        }
      }
      if (!isUsed || (fromThisPackage && !hasAlias && count <= 1)) {
        this.edit(this.t.start[cands[i]], this.t.end[cands[i]], "");
      }
    }
  }

  /** Whether the import's last name, unquoted, contains a dot. */
  lastSegmentHasDot(imp: i32): boolean {
    const segs: string[] = [];
    this.collectSegments(this.importRef(imp), segs);
    return segs.length > 0 && segs[segs.length - 1].indexOf(".") >= 0;
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
      name = segs.length > 0 ? segs[segs.length - 1] : "";
    }
    name = kpTrimBackticks(name);
    const d = kpLastIndexOf(name, 46);
    return d >= 0 ? name.substring(d + 1, toI32(name.length)) : name;
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
    let lo = 0;
    let hi = this.mCount - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (a[mid] < p) {
        lo = mid + 1;
      } else if (a[mid] > p) {
        hi = mid - 1;
      } else {
        return end ? this.mOutEnd[mid] : this.mOutStart[mid];
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
        if (p >= this.t.start[n] && p < this.t.end[n]) {
          return true;
        }
      }
      return false;
    }
    const a = this.mapPos(this.t.start[n], false);
    const b = this.mapPos(this.t.end[n], true);
    for (let i = a; i < b; i++) {
      if (toI32(this.mBuf[i]) === 10) {
        return true;
      }
    }
    return false;
  }

  suggest(n: i32): void {
    const t = this.t;
    if (t.leaf[n] === 1) {
      return;
    }
    this.takeElement(n);
    for (let c = t.first[n]; c >= 0; c = t.next[c]) {
      this.suggest(c);
    }
  }

  takeElement(n: i32): void {
    const t = this.t;
    const ty = t.type[n];
    let last = -1;
    let count = 0;
    let hasComma = false;
    if (
      ty === N_VALUE_ARGUMENT_LIST ||
      ty === N_VALUE_PARAMETER_LIST ||
      ty === N_TYPE_ARGUMENT_LIST ||
      ty === N_TYPE_PARAMETER_LIST
    ) {
      if (ty === N_VALUE_PARAMETER_LIST) {
        const p = t.parent[n];
        if (
          p >= 0 &&
          t.type[p] === N_FUNCTION_LITERAL &&
          t.parent[p] >= 0 &&
          t.type[t.parent[p]] === N_LAMBDA_EXPRESSION
        ) {
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
      for (let c = t.first[n]; c >= 0; c = t.next[c]) {
        if (t.type[c] === item) {
          last = c;
          count++;
        }
      }
      const close = ty === N_VALUE_ARGUMENT_LIST || ty === N_VALUE_PARAMETER_LIST ? T_RPAR : T_GT;
      hasComma = this.trailingCommaBefore(n, close);
    } else if (ty === N_COLLECTION_LITERAL_EXPRESSION) {
      for (let c = t.first[n]; c >= 0; c = t.next[c]) {
        if (kIsExpr(t.type[c])) {
          last = c;
          count++;
        }
      }
      hasComma = this.trailingCommaBefore(n, T_RBRACKET);
    } else if (ty === N_CLASS_BODY) {
      if (!this.isEnumBody(n) || this.enumTerminatingSemicolon(n) >= 0) {
        return;
      }
      for (let c = t.first[n]; c >= 0; c = t.next[c]) {
        if (t.type[c] === N_ENUM_ENTRY) {
          last = c;
          count++;
        }
      }
      hasComma = this.enumTrailingComma(n) >= 0;
    } else {
      return;
    }
    if (count === 0 || hasComma || !this.listHasNewline(n)) {
      return;
    }
    const leaf = this.leftLeaf(last);
    const at = this.mapped ? this.mapPos(t.end[leaf], true) : t.end[leaf];
    this.edit(at, at, ",");
  }

  trailingCommaBefore(list: i32, close: i32): boolean {
    let last = -1;
    for (let c = this.t.first[list]; c >= 0; c = this.t.next[c]) {
      if (this.t.type[c] === close) {
        last = c;
      }
    }
    if (last < 0) {
      return false;
    }
    const p = this.prevConcrete(last);
    return p >= 0 && this.t.type[p] === T_COMMA;
  }

  /** leftLeafIgnoringCommentsAndWhitespace. */
  leftLeaf(e: i32): i32 {
    let x = e;
    while (true) {
      if (this.t.leaf[x] === 1) {
        return x;
      }
      let c = this.t.last[x];
      while (c >= 0 && this.isWsOrComment(c)) {
        c = this.t.prev[c];
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
  return k >= 2 && s.charCodeAt(0) === 96 && s.charCodeAt(k - 1) === 96 ? s.substring(1, k - 1) : s;
};

/** String.trim('`'): every leading and trailing backtick. */
const kpTrimBackticks = (s: string): string => {
  let a = 0;
  let b = toI32(s.length);
  while (a < b && s.charCodeAt(a) === 96) {
    a++;
  }
  while (b > a && s.charCodeAt(b - 1) === 96) {
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
  const n = toI32(a.length) < toI32(b.length) ? toI32(a.length) : toI32(b.length);
  for (let i = 0; i < n; i++) {
    const x = a.charCodeAt(i);
    const y = b.charCodeAt(i);
    if (x !== y) {
      return x - y;
    }
  }
  return toI32(a.length) - toI32(b.length);
};

const kpSameBytes = (a: u8[], b: u8[], n: i32): boolean => {
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
};
