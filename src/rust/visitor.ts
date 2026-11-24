// The formatting visitor: walks items and statements, writing rewrites and
// the text between them (missed spans: comments and blank lines) into one
// buffer.
//
// Ported from rustfmt 1.10.0 (MIT OR Apache-2.0, Copyright The Rust Project
// Developers): visitor.rs, missed_spans.rs.

import { add32, sub32 } from "../core/arr";

import { fault } from "../core/fault";
import { Out } from "../core/out";
import {
  AT_DOC,
  AT_INNER,
  BLK_UNSAFE,
  IT_LOADED,
  IT_UNSAFE,
  N_ATTR,
  N_BLOCK,
  N_CONST,
  N_ENUM,
  N_EXTERN_CRATE,
  N_EX_BREAK,
  N_EX_CONTINUE,
  N_EX_FOR,
  N_EX_IF,
  N_EX_LET,
  N_EX_LOOP,
  N_EX_MATCH,
  N_EX_RET,
  N_EX_WHILE,
  N_FN,
  N_FOREIGN_MOD,
  N_IMPL,
  N_LOCAL,
  N_MACRO_DEF,
  N_MAC_ITEM,
  N_MOD,
  N_STATIC,
  N_STMT_EMPTY,
  N_STMT_EXPR,
  N_STMT_ITEM,
  N_STMT_MAC,
  N_STMT_SEMI,
  N_STRUCT,
  N_TRAIT,
  N_TRAIT_ALIAS,
  N_TYPE_ALIAS,
  N_UNION,
  N_USE,
  RsAst,
} from "./ast";
import { rsAttrsContainSkip, rsExprAttrsContainSkip, rsIsSkipAttrPath, rsRewriteAttrs } from "./attr";
import {
  CK_COMMENT,
  CK_NORMAL,
  rsCommentCodeSlices,
  rsContainsComment,
  rsIsLastCommentBlock,
  rsLastLineWidth,
  rsRewriteComment,
} from "./comment";
import { RsCtx, RsFile, RsRanges } from "./context";
import { rsFormatStmt } from "./expr";
import { rsFormatImport } from "./imports";
import {
  rsFormatForeignMod,
  rsFormatImpl,
  rsFormatTrait,
  rsFormatTraitAlias,
  rsRewriteExternCrate,
  rsVisitEnum,
  rsVisitFnItem,
  rsVisitStatic,
  rsVisitStruct,
  rsVisitTypeAlias,
} from "./items";
import { rsMacroPosItem, rsMacroPosStatement, rsMacroStyleIsBraces, rsRewriteMacro, rsRewriteMacroDef } from "./macros";
import { rsVisitItemsWithReordering } from "./reorder";
import { RsShape, rsIndentFromWidth, rsIndentStr, rsIndentStrNl, rsShapeIndented } from "./shape";
import {
  RsStrBuf,
  rsCountNewlines,
  rsCut,
  rsHasByte,
  rsIndexOfByte,
  rsIsBlank,
  rsTrim,
  rsTrimEnd,
  rsWsLenAt,
} from "./str";

import { rsFormatVisibility, rsIdentStr } from "./utils";
import { rsNA, rsNAtn, rsNC, rsND, rsNE, rsNFl, rsNHi, rsNKind, rsNLastI32, rsNLn, rsNLo } from "./nodes";

export class RsVisitor {
  f: RsFile;
  ast: RsAst;
  buf: Out;
  lastPos: i32 = 0;
  bi: i32 = 0; // block_indent.block_indent
  al: i32 = 0; // block_indent.alignment
  isIfElseBlock: boolean = false;
  isLoopBlock: boolean = false;
  isMacroDef: boolean = false;
  // ItemVisitorKind for associated items: 1 trait, 2 impl.
  assocKind: i32 = 1;
  macroRewriteFailure: boolean = false;
  skipped: RsRanges;
  // `buf` again as strings, for `text`: every write to `buf` goes to both
  // (but the final newline format.ts adds after the walk).
  out: RsStrBuf;
  // Reads the source for `snippet`.
  srcCtx: RsCtx;
  // The source span this visitor works over (the snippet provider's).
  startPos: i32 = 0;
  endPos: i32 = 0;

  constructor(f: RsFile) {
    this.f = f;
    this.ast = f.ast;
    this.buf = new Out(256);
    this.endPos = f.n;
    this.skipped = new RsRanges();
    this.out = new RsStrBuf();
    this.srcCtx = new RsCtx(f);
  }

  shape(): RsShape {
    return rsShapeIndented(this.bi, this.al, this.f.cfg);
  }

  ctx(): RsCtx {
    const c = new RsCtx(this.f);
    c.isMacroDef = this.isMacroDef;
    c.skipped = this.skipped;
    return c;
  }

  /** with_context's tail: a macro failure in `c` is this visitor's. */
  took(c: RsCtx): void {
    if (c.macroRewriteFailure) {
      this.macroRewriteFailure = true;
    }
  }

  /** Drop for a visitor made from a context: its macro failure goes to the context. */
  giveTo(c: RsCtx): void {
    if (this.macroRewriteFailure) {
      c.macroRewriteFailure = true;
    }
  }

  /** line_number: the newlines in the buffer. */
  lineNumber(): i32 {
    let k = 0;
    const b = this.buf.buf;
    const n = this.buf.n;
    if (n > b.length) {
      fault();
      return 0;
    }
    for (let i = 0; i < n && i < b.length; i++) {
      if (toI32(b[i]) === 10) {
        // k <= i.
        if (k >= b.length) {
          fault();
          return 0;
        }
        k++;
      }
    }
    return k;
  }

  /** The source text [lo, hi), as the context reads it (RsCtx.snippet). */
  snippet(lo: i32, hi: i32): string {
    return this.srcCtx.snippet(lo, hi);
  }

  blockIndent(): void {
    this.bi = add32(this.bi, this.f.cfg.tabSpaces);
  }

  blockUnindent(): void {
    if (this.bi < this.f.cfg.tabSpaces) {
      this.al = 0;
    } else {
      this.bi = sub32(this.bi, this.f.cfg.tabSpaces);
    }
  }

  indentStr(): string {
    return rsIndentStr(this.f.cfg, this.bi, this.al);
  }

  indentStrNl(): string {
    return rsIndentStrNl(this.f.cfg, this.bi, this.al);
  }

  /** The buffer so far, as a string. */
  text(): string {
    return this.out.str();
  }

  pushStr(s: string): void {
    this.buf.str(s);
    this.out.add(s);
  }

  /** The buffer's last line width (last_line_width(&self.buffer)). */
  bufLastLineWidth(): i32 {
    return rsLastLineWidth(this.out.lastLine(), this.f.cfg.tabSpaces);
  }

  bufTrailingNewlines(): i32 {
    const b = this.buf.buf;
    const n = this.buf.n;
    if (n <= 0) {
      return 0;
    }
    if (n > b.length) {
      fault();
      return 0;
    }
    let k = 0;
    let i = n - 1;
    while (i >= 0 && i < b.length && toI32(b[i]) === 10) {
      // k = n - 1 - i <= i.
      if (k >= b.length) {
        fault();
        return 0;
      }
      k++;
      i--;
    }
    return k;
  }

  /** Drops the buffer's final byte when it is a newline. */
  dropFinalNewline(): void {
    const ob = this.buf;
    const b = ob.buf;
    const n = ob.n;
    if (n > 0) {
      if (n > b.length) {
        fault();
        return;
      }
      if (toI32(b[n - 1]) === 10) {
        ob.n = n - 1;
        this.out.dropLast();
      }
    }
  }

  // ---------------------------------------------------------------- missed spans

  formatMissing(end: i32): void {
    const ms = this.snippet(this.lastPos, end);
    if (rsTrim(ms) === ";") {
      this.pushStr(";");
      this.lastPos = end;
      return;
    }
    this.formatMissingInner(end, 0);
  }

  formatMissingWithIndent(end: i32): void {
    this.formatMissingInner(end, 1);
  }

  formatMissingNoIndent(end: i32): void {
    this.formatMissingInner(end, 2);
  }

  // mode 0: push the last snippet; 1: indent; 2: no indent.
  processLast(mode: i32, last: string, snippet: string, isSame: boolean): void {
    if (mode === 0) {
      this.pushStr(last);
      return;
    }
    this.pushStr(rsTrimEnd(last));
    if (isSame && this.buf.n !== 0) {
      this.pushStr("\n");
    }
    if (mode === 1) {
      this.pushStr(this.indentStr());
    }
  }

  formatMissingInner(end: i32, mode: i32): void {
    const start = this.lastPos;
    if (start === end) {
      if (this.buf.n !== 0) {
        this.processLast(mode, "", "", true);
      }
      return;
    }
    if (start > end) {
      this.f.broken = true;
      return;
    }
    this.lastPos = end;
    const snippet = this.snippet(start, end);
    if (start === 0 && end === toI32(snippet.length) && rsIsBlank(snippet)) {
      return;
    }
    if (rsIsBlank(snippet)) {
      this.pushVerticalSpaces(rsCountNewlines(snippet));
      this.processLast(mode, "", snippet, snippet.length === 0);
    } else {
      this.writeSnippet(start, snippet, mode);
    }
  }

  pushVerticalSpaces(nc0: i32): void {
    let nc = nc0;
    const offset = this.bufTrailingNewlines();
    const upper = 2; // blank_lines_upper_bound + 1
    const lower = 1; // blank_lines_lower_bound + 1
    // A count of newlines is never negative.
    if (offset < 0) {
      fault();
      return;
    }
    const total = add32(nc, offset);
    if (total > upper) {
      nc = offset >= upper ? 0 : upper - offset;
    } else if (total < lower) {
      nc = offset >= lower ? 0 : lower - offset;
    }
    this.buf.newlines(nc);
    for (let i = 0; i < nc; i++) {
      this.out.add("\n");
    }
  }

  writeSnippet(spanLo: i32, snippet: string, mode: i32): void {
    let lineStart = 0;
    let lastWs = -1;
    const sl = rsCommentCodeSlices(snippet);
    const slKind = sl.kind;
    const slStart = sl.start;
    const slEnd = sl.end;
    for (let si = 0; si < sl.n; si++) {
      if (si < 0 || si >= slKind.length || si >= slStart.length || si >= slEnd.length) {
        fault();
        return;
      }
      const kind = slKind[si];
      const offset = slStart[si];
      const sub = rsCut(snippet, offset, slEnd[si]);
      const nlc = rsCountNewlines(sub);
      if (kind === CK_COMMENT) {
        this.processComment(snippet, add32(spanLo, offset), offset, sub);
        lastWs = -1;
        lineStart = add32(offset, toI32(sub.length));
      } else if (rsIsBlank(sub) && nlc > 0) {
        this.pushVerticalSpaces(nlc);
        lineStart = add32(offset, toI32(sub.length));
      } else {
        // process_missing_code
        const n = toI32(sub.length);
        if (offset < 0) {
          fault();
          return;
        }
        for (let k = 0; k < n; k++) {
          // 0 <= offset and sub = snippet[offset, offset + n), so i is exact.
          const i = toI32(toU32(k) + toU32(offset));
          const c = sub.charCodeAt(k);
          if (c === 10) {
            const i1 = add32(i, 1);
            if (lastWs >= 0) {
              this.pushStr(rsCut(snippet, lineStart, lastWs));
              this.pushStr("\n");
              lastWs = -1;
            } else {
              this.pushStr(rsCut(snippet, lineStart, i1));
            }
            lineStart = i1;
          } else if ((c & 0xc0) === 0x80) {
            // (inside a char)
          } else if (lastWs < 0 && rsWsLenAt(sub, k) > 0) {
            lastWs = i;
          } else {
            // A second whitespace char in a row clears it too, as rustfmt does.
            lastWs = -1;
          }
        }
        const end = add32(n, offset);
        let remaining = rsCut(snippet, lineStart, end);
        lineStart = end;
        remaining = rsTrim(remaining);
        if (remaining.length !== 0) {
          this.pushStr(this.indentStr());
        }
        this.pushStr(remaining);
      }
    }
    const last = rsCut(snippet, lineStart, toI32(snippet.length));
    this.processLast(mode, last, snippet, lineStart === 0);
  }

  /**
   * A comment that starts on the line of the code before it (style edition
   * 2024): its first line as is (wrapped, it could mix with the others), the
   * other lines below at the block indent, rewritten at `shape`.
   */
  pushCommentFromSameLine(sub: string, shape: RsShape): void {
    const nl = rsIndexOfByte(sub, 10, 0);
    if (nl < 0) {
      this.pushStr(sub);
      return;
    }
    const n = toI32(sub.length);
    if (nl >= n) {
      fault();
      return;
    }
    this.pushStr(sub.substring(0, nl));
    if (nl + 1 === n) {
      return;
    }
    this.pushStr(this.indentStrNl());
    const other = sub.substring(nl + 1, n);
    const r = rsRewriteComment(other, shape, this.f.cfg);
    this.pushStr(r === null ? other : r);
  }

  /** process_comment; `abs` is the comment's absolute offset in the source. */
  processComment(snippet: string, abs: i32, offset: i32, sub: string): void {
    // The last non-space char before the comment, in the whole source.
    const src = this.f.src;
    let j = sub32(abs, 1);
    let lastChar = -1;
    while (j >= 0) {
      if (j >= src.length) {
        fault();
        return;
      }
      const c = toI32(src[j]);
      if (c !== 32 && c !== 9) {
        lastChar = c;
        break;
      }
      j--;
    }
    const fixIndent = lastChar < 0 || lastChar === 123 || lastChar === 10;
    let cbi = this.bi;
    let cal = this.al;
    let onSameLine = false;
    if (fixIndent) {
      if (lastChar === 123) {
        this.pushStr("\n");
      }
      this.pushStr(this.indentStr());
    } else if (this.f.cfg.styleEdition >= 2024 && !snippet.startsWith("\n")) {
      // On the line of the code before it: kept at the block's indent.
      onSameLine = true;
      this.pushStr(" ");
    } else {
      this.pushStr(" ");
      const ind = rsIndentFromWidth(this.f.cfg, this.bufLastLineWidth());
      cbi = ind.bi;
      cal = ind.al;
    }
    const cs = rsShapeIndented(cbi, cal, this.f.cfg).comment(this.f.cfg);
    if (onSameLine) {
      this.pushCommentFromSameLine(sub, cs);
    } else {
      const r = rsRewriteComment(sub, cs, this.f.cfg);
      this.pushStr(r === null ? sub : r);
    }
    const ls = add32(offset, toI32(sub.length));
    if (ls <= toI32(snippet.length)) {
      if (ls < 0) {
        fault();
        return;
      }
      let k = ls;
      const n = toI32(snippet.length);
      while (k < n && (snippet.charCodeAt(k) === 32 || snippet.charCodeAt(k) === 9)) {
        k++;
      }
      const c = k < n ? snippet.charCodeAt(k) : -1;
      if (c === 10 || c === 13) {
        if (!rsIsLastCommentBlock(sub)) {
          this.pushStr("\n");
        }
      } else {
        this.pushStr("\n");
      }
    }
  }

  // ---------------------------------------------------------------- rewrites

  pushRewriteInner(lo: i32, hi: i32, rw: string | null): void {
    if (rw !== null) {
      this.pushStr(rw);
    } else {
      this.pushStr(rsTrim(this.snippet(lo, hi)));
    }
    this.lastPos = hi;
  }

  pushRewrite(lo: i32, hi: i32, rw: string | null): void {
    this.formatMissingWithIndent(lo);
    this.pushRewriteInner(lo, hi, rw);
  }

  /** push_skipped_with_span: node `n`'s attributes, its span [lo, hi) and `mainLo`, the span's lo without attributes. */
  pushSkippedWithSpan(n: i32, lo: i32, hi: i32, mainLo: i32): void {
    const ast = this.ast;
    this.formatMissingWithIndent(lo);
    let attrsEnd = 1;
    for (let i = 0; i < rsNAtn(ast, n); i++) {
      const l = this.f.lineOf(rsNHi(ast, ast.attr(n, i)));
      if (i === 0 || l > attrsEnd) {
        attrsEnd = l;
      }
    }
    const firstLine = this.f.lineOf(mainLo);
    const ae1 = add32(attrsEnd, 1);
    const slo = ae1 < firstLine ? ae1 : firstLine;
    this.pushRewriteInner(lo, hi, null);
    this.skipped.push(slo, add32(this.lineNumber(), 1));
  }

  /** visit_attrs over node `n`'s attributes of one style; answers true when they contain a skip. */
  visitAttrs(n: i32, inner: boolean): boolean {
    const ast = this.ast;
    const k = rsNAtn(ast, n);
    if (k === 0) {
      return false;
    }
    // Unknown rustfmt attributes only report errors.
    if (rsAttrsContainSkip(this.ctx(), n)) {
      return true;
    }
    const sel: i32[] = [];
    for (let i = 0; i < k; i++) {
      const a = ast.attr(n, i);
      const isInner = (rsNFl(ast, a) & AT_INNER) !== 0;
      if (isInner === inner) {
        sel.push(a);
      }
    }
    const ns = toI32(sel.length);
    if (ns <= 0) {
      return false;
    }
    const lo = sel.length > 0 ? rsNLo(ast, sel[0]) : 0;
    const hi = ns > 0 ? rsNHi(ast, sel[ns - 1]) : 0;
    const rw = rsRewriteAttrs(this.ctx(), sel, this.shape());
    this.pushRewrite(lo, hi, rw);
    return false;
  }

  fnBodySkip(item: i32): boolean {
    const ast = this.ast;
    return rsNKind(ast, item) === N_FN && rsNC(ast, item) >= 0 && rsAttrsContainSkip(this.ctx(), rsNC(ast, item));
  }

  /** Spanned::span lo of item `n`: its first outer attribute, else its own lo. */
  spanLoWithAttrs(n: i32): i32 {
    const ast = this.ast;
    for (let i = 0; i < rsNAtn(ast, n); i++) {
      const a = ast.attr(n, i);
      if ((rsNFl(ast, a) & AT_INNER) === 0) {
        return rsNLo(ast, a);
      }
    }
    return rsNLo(ast, n);
  }

  visitItem(item: i32): void {
    const ast = this.ast;
    const k = rsNKind(ast, item);
    if (k === N_USE || k === N_EXTERN_CRATE) {
      if (rsAttrsContainSkip(this.ctx(), item)) {
        this.pushSkippedWithSpan(item, this.spanLoWithAttrs(item), rsNHi(ast, item), rsNLo(ast, item));
        return;
      }
    } else if (k === N_MOD && (rsNFl(ast, item) & IT_LOADED) === 0 && rsAttrsContainSkip(this.ctx(), item)) {
      // `mod foo;` with a skip attribute: nothing is pushed; the next missed span copies it.
      return;
    } else {
      // A fn body's inner attributes are the item's in rustc: `#![rustfmt::skip]` there skips the fn.
      if (this.fnBodySkip(item) || this.visitAttrs(item, false)) {
        this.pushSkippedWithSpan(item, this.spanLoWithAttrs(item), rsNHi(ast, item), rsNLo(ast, item));
        return;
      }
    }
    const lo = rsNLo(ast, item);
    const hi = rsNHi(ast, item);
    if (k === N_USE) {
      rsFormatImport(this, item);
    } else if (k === N_IMPL) {
      const c = this.ctx();
      const rw = rsFormatImpl(c, item, this.bi, this.al);
      this.took(c);
      this.pushRewrite(lo, hi, rw);
    } else if (k === N_TRAIT) {
      const c = this.ctx();
      const rw = rsFormatTrait(c, item, this.bi, this.al);
      this.took(c);
      this.pushRewrite(lo, hi, rw);
    } else if (k === N_TRAIT_ALIAS) {
      this.pushRewrite(lo, hi, rsFormatTraitAlias(this.ctx(), item, this.shape()));
    } else if (k === N_EXTERN_CRATE) {
      const rw = rsRewriteExternCrate(this.ctx(), item, this.shape());
      this.pushRewrite(this.spanLoWithAttrs(item), hi, rw);
    } else if (k === N_STRUCT || k === N_UNION) {
      rsVisitStruct(this, item);
    } else if (k === N_ENUM) {
      rsVisitEnum(this, item);
    } else if (k === N_MOD) {
      this.formatMissingWithIndent(lo);
      this.formatMod(item);
    } else if (k === N_MAC_ITEM) {
      this.visitMac(rsNA(ast, item), true, item);
    } else if (k === N_FOREIGN_MOD) {
      this.formatMissingWithIndent(lo);
      rsFormatForeignMod(this, item);
    } else if (k === N_STATIC || k === N_CONST) {
      rsVisitStatic(this, item);
    } else if (k === N_FN) {
      rsVisitFnItem(this, item);
    } else if (k === N_TYPE_ALIAS) {
      rsVisitTypeAlias(this, item, 0); // IVK_ITEM
    } else if (k === N_MACRO_DEF) {
      const rw = rsRewriteMacroDef(this.ctx(), this.shape(), this.bi, this.al, item);
      this.pushRewrite(lo, hi, rw);
    } else {
      this.f.unsupported = true;
    }
  }

  /** For an inline module: visit only the outer attributes (those before the item's span). */
  visitAttrsOuterOnlyBefore(item: i32): void {
    const ast = this.ast;
    const sel: i32[] = [];
    for (let i = 0; i < rsNAtn(ast, item); i++) {
      const a = ast.attr(item, i);
      if (
        (rsNFl(ast, a) & AT_INNER) === 0 &&
        !(rsNLo(ast, item) <= rsNLo(ast, a) && rsNHi(ast, a) <= rsNHi(ast, item))
      ) {
        sel.push(a);
      }
    }
    if (sel.length === 0) {
      return;
    }
    const rw = rsRewriteAttrs(this.ctx(), sel, this.shape());
    if (sel.length > 0) {
      this.pushRewrite(rsNLo(ast, sel[0]), rsNHi(ast, rsNLastI32(sel)), rw);
    } else {
      fault();
    }
  }

  /** visit_assoc_item: trait or impl items. */
  visitAssocItem(item: i32): void {
    const ast = this.ast;
    if (this.fnBodySkip(item) || this.visitAttrs(item, false)) {
      this.pushSkippedWithSpan(item, rsNLo(ast, item), rsNHi(ast, item), rsNLo(ast, item));
      return;
    }
    const k = rsNKind(ast, item);
    if (k === N_CONST) {
      rsVisitStatic(this, item);
    } else if (k === N_FN) {
      rsVisitFnItem(this, item);
    } else if (k === N_TYPE_ALIAS) {
      rsVisitTypeAlias(this, item, this.assocKind);
    } else if (k === N_MAC_ITEM) {
      this.visitMac(rsNA(ast, item), true, item);
    } else {
      this.f.unsupported = true;
    }
  }

  /** visit_mac; `item` is the item or statement node, for the span. */
  visitMac(mac: i32, isItem: boolean, item: i32): void {
    const ast = this.ast;
    const shape = this.shape().satSubWidth(1);
    const ctx = this.ctx();
    const rw0 = rsRewriteMacro(ctx, mac, shape, isItem ? rsMacroPosItem() : rsMacroPosStatement());
    this.took(ctx);
    let lo = rsNLo(ast, mac);
    let hi = rsNHi(ast, mac);
    let rw = rw0;
    if (isItem && !rsMacroStyleIsBraces(ctx, mac)) {
      // Brackets and parentheses: the item ends at the `;` after the macro.
      const h = ctx.spanBefore(rsNHi(ast, mac), this.endPos, ";");
      hi = add32(h, 1);
      if (rw !== null && !rw.endsWith(";")) {
        rw = rw + ";";
      }
    }
    lo = rsNLo(ast, mac);
    this.pushRewrite(lo, hi, rw);
    if (item < 0) {
      return;
    }
  }

  // ---------------------------------------------------------------- blocks and statements

  /** Spanned::span of statement `s`: [lo, hi). */
  stmtLo(s: i32): i32 {
    const ast = this.ast;
    const k = rsNKind(ast, s);
    if (k === N_STMT_ITEM || k === N_STMT_EXPR || k === N_STMT_SEMI) {
      return this.spanLoWithAttrs(rsNA(ast, s));
    }
    return this.spanLoWithAttrs(s);
  }

  visitStmt(s: i32, isLast: boolean, includeEmptySemi: boolean): void {
    const ast = this.ast;
    const k = rsNKind(ast, s);
    const slo = this.stmtLo(s);
    const shi = rsNHi(ast, s);
    if (k === N_STMT_EMPTY) {
      const snippet = this.snippet(this.lastPos, slo);
      let i = 0;
      while (i < toI32(snippet.length) && snippet.charCodeAt(i) === 32) {
        i++;
      }
      const startsNl =
        i < toI32(snippet.length) &&
        (snippet.charCodeAt(i) === 10 ||
          (snippet.charCodeAt(i) === 13 && i + 1 < toI32(snippet.length) && snippet.charCodeAt(i + 1) === 10));
      const t = rsTrim(snippet);
      if (t.length !== 0) {
        if (includeEmptySemi) {
          this.formatMissing(shi);
        } else {
          if (startsNl) {
            this.pushStr("\n");
          }
          this.pushStr(this.indentStr());
          this.pushStr(t);
        }
      } else if (includeEmptySemi) {
        this.pushStr(";");
      }
      this.lastPos = shi;
      return;
    }
    if (k === N_STMT_ITEM) {
      this.visitItem(rsNA(ast, s));
      this.lastPos = shi;
      return;
    }
    if (k === N_LOCAL || k === N_STMT_EXPR || k === N_STMT_SEMI) {
      const attrsOf = k === N_LOCAL ? s : rsNA(ast, s);
      const skip =
        k === N_LOCAL ? rsAttrsContainSkip(this.ctx(), attrsOf) : rsExprAttrsContainSkip(this.ctx(), attrsOf);
      if (skip) {
        this.pushSkippedWithSpan(attrsOf, slo, shi, rsNLo(ast, attrsOf));
      } else {
        const c = this.ctx();
        const rw = rsFormatStmt(c, this.shape(), s, isLast);
        this.took(c);
        this.pushRewrite(slo, shi, rw);
      }
      return;
    }
    if (k === N_STMT_MAC) {
      if (this.visitAttrs(s, false)) {
        this.pushSkippedWithSpan(s, slo, shi, rsNLo(ast, rsNA(ast, s)));
      } else {
        this.visitMac(rsNA(ast, s), false, s);
      }
      this.formatMissing(shi);
      return;
    }
    this.f.unsupported = true;
  }

  trimSpacesAfterOpeningBrace(b: i32, withAttrs: boolean): void {
    const ast = this.ast;
    if (rsNLn(ast, b) === 0) {
      return;
    }
    let hi = this.stmtLo(ast.kid(b, 0));
    // The first inner attribute, if any (when they are visited).
    for (let i = 0; withAttrs && i < rsNAtn(ast, b); i++) {
      const a = ast.attr(b, i);
      if ((rsNFl(ast, a) & AT_INNER) !== 0) {
        hi = rsNLo(ast, a);
        break;
      }
    }
    const snippet = this.snippet(this.lastPos, hi);
    const sl = rsCommentCodeSlices(snippet);
    const slKind = sl.kind;
    const slStart = sl.start;
    const slEnd = sl.end;
    if (sl.n > 0 && !(slKind.length > 0 && slStart.length > 0 && slEnd.length > 0)) {
      fault();
      return;
    }
    if (sl.n > 0 && slKind.length > 0 && slStart.length > 0 && slEnd.length > 0 && slKind[0] === CK_NORMAL) {
      const s0 = rsCut(snippet, slStart[0], slEnd[0]);
      let r = toI32(s0.length) - 1;
      while (r >= 0 && s0.charCodeAt(r) !== 10) {
        r--;
      }
      if (r >= 0) {
        this.lastPos = add32(this.lastPos, r);
      }
    }
  }

  /** visit_block: block `b`'s inner attributes are on the block node. */
  visitBlock(b: i32, hasBraces: boolean): void {
    this.visitBlockWith(b, true, hasBraces);
  }

  /** visit_block with inner attributes when `withAttrs`. */
  visitBlockWith(b: i32, withAttrs: boolean, hasBraces: boolean): void {
    const ast = this.ast;
    const comp = hasBraces ? 1 : 0;
    this.lastPos = hasBraces ? add32(this.lastPos, 1) : this.lastPos;
    this.blockIndent();
    this.pushStr("{");
    this.trimSpacesAfterOpeningBrace(b, withAttrs);
    if (withAttrs && rsNAtn(ast, b) > 0) {
      this.visitAttrs(b, true);
    }
    this.walkStmts(b, 0, false);
    const n = rsNLn(ast, b);
    if (n > 0) {
      // add_semi_on_last_block_stmt: trailing_semicolon is on.
      const last = ast.kid(b, n - 1);
      if (rsNKind(ast, last) === N_STMT_EXPR && !this.isMacroDef) {
        const ek = rsNKind(ast, rsNA(ast, last));
        if (ek === N_EX_RET || ek === N_EX_CONTINUE || ek === N_EX_BREAK) {
          this.pushStr(";");
        }
      }
    }
    this.closeBlock(this.lastPos, sub32(rsNHi(ast, b), comp), this.isIfElseBlock && n > 0);
    this.lastPos = rsNHi(ast, b);
  }

  closeBlock(lo: i32, hi: i32, unindentComment: boolean): void {
    const cfg = this.f.cfg;
    let lastHi = lo;
    let unindented = false;
    let prevEndsWithNewline = false;
    let extraNewline = false;
    const cs = this.snippet(lo, hi);
    let alignToRight = false;
    if (unindentComment && rsContainsComment(cs)) {
      const slash = rsIndexOfByte(cs, 47, 0);
      const firstLines = slash < 0 ? cs : rsCut(cs, 0, slash);
      alignToRight = rsLastLineWidth(firstLines, cfg.tabSpaces) > rsLastLineWidth(cs, cfg.tabSpaces);
    }
    const sl = rsCommentCodeSlices(cs);
    const slKind = sl.kind;
    const slStart = sl.start;
    const slEnd = sl.end;
    for (let si = 0; si < sl.n; si++) {
      if (si < 0 || si >= slKind.length || si >= slStart.length || si >= slEnd.length) {
        fault();
        return;
      }
      const kind = slKind[si];
      const offset = slStart[si];
      const sub = rsCut(cs, offset, slEnd[si]);
      if (kind === CK_COMMENT) {
        if (!unindented && unindentComment && !alignToRight) {
          unindented = true;
          this.blockUnindent();
        }
        const between = this.snippet(lastHi, add32(lo, offset));
        let sameLine = !rsHasByte(between, 10);
        let commentShape = rsShapeIndented(this.bi, this.al, cfg).comment(cfg);
        if (cfg.styleEdition >= 2024 && sameLine) {
          // The comment's first line goes on the block's last line, the
          // other lines below it.
          this.pushStr(" ");
          this.pushCommentFromSameLine(sub, commentShape);
          prevEndsWithNewline = sub.endsWith("\n");
          extraNewline = false;
          lastHi = add32(add32(lo, offset), toI32(sub.length));
          continue;
        }
        if (sameLine) {
          let w = sub32(this.bufLastLineWidth(), add32(this.bi, this.al));
          if (w < 0) {
            w = 0;
          }
          const offsetLen = add32(1, w);
          const sh = commentShape.visualIndent(offsetLen).subWidth(offsetLen);
          if (sh !== null) {
            commentShape = sh;
          } else {
            sameLine = false;
          }
        }
        if (sameLine) {
          this.pushStr(" ");
        } else {
          if (rsCountNewlines(between) >= 2 || extraNewline) {
            this.pushStr("\n");
          }
          this.pushStr(this.indentStrNl());
        }
        const r = rsRewriteComment(sub, commentShape, cfg);
        this.pushStr(r === null ? sub : r);
      } else {
        const t = rsTrim(sub);
        let allSemi = true;
        for (let i = 0; i < toI32(t.length); i++) {
          if (t.charCodeAt(i) !== 59) {
            allSemi = false;
            break;
          }
        }
        if (t.length === 0 || allSemi) {
          extraNewline = prevEndsWithNewline && rsHasByte(sub, 10);
          continue;
        }
        this.pushStr(this.indentStrNl());
        this.pushStr(t);
      }
      prevEndsWithNewline = sub.endsWith("\n");
      extraNewline = false;
      lastHi = add32(add32(lo, offset), toI32(sub.length));
    }
    if (unindented) {
      this.blockIndent();
    }
    this.blockUnindent();
    this.pushStr(this.indentStrNl());
    this.pushStr("}");
  }

  /** walk_stmts over block `b`'s statements from index `from`. */
  walkStmts(b: i32, from0: i32, includeCurrentEmptySemi0: boolean): void {
    const ast = this.ast;
    const n = rsNLn(ast, b);
    let from = from0;
    let includeEmpty = includeCurrentEmptySemi0;
    while (from < n) {
      // A run of `use` items is reordered.
      const items: i32[] = [];
      let k = from;
      while (k < n) {
        const s = ast.kid(b, k);
        if (rsNKind(ast, s) === N_STMT_ITEM && rsNKind(ast, rsNA(ast, s)) === N_USE) {
          items.push(rsNA(ast, s));
          k++;
        } else {
          break;
        }
      }
      if (items.length === 0) {
        const s = ast.kid(b, from);
        this.visitStmt(s, from === sub32(n, 1), includeEmpty);
        let next = false;
        if (from + 1 < n) {
          const s1 = ast.kid(b, from + 1);
          next = rsNKind(ast, s) === N_STMT_ITEM && rsNKind(ast, s1) === N_STMT_EMPTY;
        }
        includeEmpty = next;
        from++;
      } else {
        rsVisitItemsWithReordering(this, items);
        from = k;
        includeEmpty = false;
      }
    }
  }

  formatMod(item: i32): void {
    const ast = this.ast;
    const ctx = this.ctx();
    this.pushStr(rsFormatVisibility(ctx, rsNE(ast, item)));
    if ((rsNFl(ast, item) & IT_UNSAFE) !== 0) {
      this.pushStr("unsafe ");
    }
    this.pushStr("mod ");
    this.pushStr(rsIdentStr(ctx, rsND(ast, item)));
    if ((rsNFl(ast, item) & IT_LOADED) !== 0) {
      this.pushStr(" {");
      const modLo = ctx.spanAfter(rsNLo(ast, item), rsNHi(ast, item), "{");
      const body = rsTrim(this.snippet(modLo, sub32(rsNHi(ast, item), 1)));
      if (body.length === 0) {
        this.pushStr("}");
      } else {
        this.lastPos = modLo;
        this.blockIndent();
        this.visitInnerAttrsOf(item);
        this.walkModItems(item);
        this.closeBlock(this.lastPos, sub32(rsNHi(ast, item), 1), false);
      }
      this.lastPos = rsNHi(ast, item);
    } else {
      this.pushStr(";");
      this.lastPos = rsNHi(ast, item);
    }
  }

  /** visit_attrs(attrs, Inner) over the inner attributes of `n`. */
  visitInnerAttrsOf(n: i32): void {
    this.visitAttrs(n, true);
  }

  /** walk_mod_items: the items in `n`'s list. */
  walkModItems(n: i32): void {
    const ast = this.ast;
    const items: i32[] = [];
    for (let i = 0; i < rsNLn(ast, n); i++) {
      items.push(ast.kid(n, i));
    }
    rsVisitItemsWithReordering(this, items);
  }

  /** format_separate_mod for the crate root. */
  formatCrate(root: i32): void {
    this.bi = 0;
    this.al = 0;
    this.visitAttrs(root, true);
    this.walkModItems(root);
    this.formatMissingWithIndent(this.endPos);
  }

  skipEmptyLines(end: i32): void {
    for (;;) {
      const sn = this.snippet(this.lastPos, end);
      const k = rsIndexOfByte(sn, 10, 0);
      if (k < 0) {
        return;
      }
      const pos64 = toI64(this.lastPos) + toI64(k) + toI64(1);
      if (pos64 > toI64(2147483647)) {
        fault();
        return;
      }
      const pos = toI32(pos64);

      const s2 = this.snippet(this.lastPos, pos);
      if (!rsIsBlank(s2)) {
        return;
      }
      this.lastPos = pos;
    }
  }
}

export const rsIsDocAttr = (ast: RsAst, a: i32): boolean =>
  rsNKind(ast, a) === N_ATTR && (rsNFl(ast, a) & AT_DOC) !== 0;
export const rsIsBlockNode = (ast: RsAst, b: i32): boolean => rsNKind(ast, b) === N_BLOCK;
export const rsBlockIsUnsafe = (ast: RsAst, b: i32): boolean => (rsNFl(ast, b) & BLK_UNSAFE) !== 0;
export const rsIsControlFlowExprKind = (k: i32): boolean =>
  k === N_EX_LOOP || k === N_EX_WHILE || k === N_EX_FOR || k === N_EX_LET || k === N_EX_IF || k === N_EX_MATCH;
