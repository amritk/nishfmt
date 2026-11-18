// The formatting visitor: walks items and statements, writing rewrites and
// the text between them (missed spans: comments and blank lines) into one
// buffer.
//
// Ported from rustfmt 1.10.0 (MIT OR Apache-2.0, Copyright The Rust Project
// Developers): visitor.rs, missed_spans.rs.

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
import { rsCountNewlines, rsHasByte, rsIndexOfByte, rsIsBlank, rsTrim, rsTrimEnd } from "./str";
import { rsFormatVisibility, rsIdentStr } from "./utils";

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
  // The source span this visitor works over (the snippet provider's).
  startPos: i32 = 0;
  endPos: i32 = 0;

  constructor(f: RsFile) {
    this.f = f;
    this.ast = f.ast;
    this.buf = new Out(256);
    this.endPos = f.n;
    this.skipped = new RsRanges();
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
    for (let i = 0; i < this.buf.n; i++) {
      if (toI32(b[i]) === 10) {
        k++;
      }
    }
    return k;
  }

  snippet(lo: i32, hi: i32): string {
    if (lo >= hi) {
      return "";
    }
    return String.fromBytes(this.f.src, lo, hi);
  }

  blockIndent(): void {
    this.bi = this.bi + this.f.cfg.tabSpaces;
  }

  blockUnindent(): void {
    if (this.bi < this.f.cfg.tabSpaces) {
      this.al = 0;
    } else {
      this.bi = this.bi - this.f.cfg.tabSpaces;
    }
  }

  indentStr(): string {
    return rsIndentStr(this.f.cfg, this.bi, this.al);
  }

  indentStrNl(): string {
    return rsIndentStrNl(this.f.cfg, this.bi, this.al);
  }

  pushStr(s: string): void {
    this.buf.str(s);
  }

  /** The buffer's last line width (last_line_width(&self.buffer)). */
  bufLastLineWidth(): i32 {
    let i = this.buf.n - 1;
    while (i >= 0 && toI32(this.buf.buf[i]) !== 10) {
      i--;
    }
    const s = String.fromBytes(this.buf.buf, i + 1, this.buf.n);
    return rsLastLineWidth(s, this.f.cfg.tabSpaces);
  }

  bufTrailingNewlines(): i32 {
    let k = 0;
    let i = this.buf.n - 1;
    while (i >= 0 && toI32(this.buf.buf[i]) === 10) {
      k++;
      i--;
    }
    return k;
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
    if (nc + offset > upper) {
      nc = offset >= upper ? 0 : upper - offset;
    } else if (nc + offset < lower) {
      nc = offset >= lower ? 0 : lower - offset;
    }
    this.buf.newlines(nc);
  }

  writeSnippet(spanLo: i32, snippet: string, mode: i32): void {
    let lineStart = 0;
    let lastWs = -1;
    const sl = rsCommentCodeSlices(snippet);
    for (let si = 0; si < sl.n; si++) {
      const kind = sl.kind[si];
      const offset = sl.start[si];
      const sub = snippet.slice(sl.start[si], sl.end[si]);
      const nlc = rsCountNewlines(sub);
      if (kind === CK_COMMENT) {
        this.processComment(snippet, spanLo + offset, offset, sub);
        lastWs = -1;
        lineStart = offset + toI32(sub.length);
      } else if (rsIsBlank(sub) && nlc > 0) {
        this.pushVerticalSpaces(nlc);
        lineStart = offset + toI32(sub.length);
      } else {
        // process_missing_code
        const n = toI32(sub.length);
        for (let k = 0; k < n; k++) {
          const i = k + offset;
          const c = sub.charCodeAt(k);
          if (c === 10) {
            if (lastWs >= 0) {
              this.pushStr(snippet.slice(lineStart, lastWs));
              this.pushStr("\n");
              lastWs = -1;
            } else {
              this.pushStr(snippet.slice(lineStart, i + 1));
            }
            lineStart = i + 1;
          } else if (c === 32 || c === 9 || c === 13 || c === 11 || c === 12) {
            if (lastWs < 0) {
              lastWs = i;
            }
          } else {
            lastWs = -1;
          }
        }
        let remaining = snippet.slice(lineStart, n + offset);
        lineStart = n + offset;
        remaining = rsTrim(remaining);
        if (remaining.length !== 0) {
          this.pushStr(this.indentStr());
        }
        this.pushStr(remaining);
      }
    }
    const last = snippet.slice(lineStart, toI32(snippet.length));
    this.processLast(mode, last, snippet, lineStart === 0);
  }

  /** process_comment; `abs` is the comment's absolute offset in the source. */
  processComment(snippet: string, abs: i32, offset: i32, sub: string): void {
    // The last non-space char before the comment, in the whole source.
    let j = abs - 1;
    while (j >= 0) {
      const c = toI32(this.f.src[j]);
      if (c !== 32 && c !== 9) {
        break;
      }
      j--;
    }
    const lastChar = j >= 0 ? toI32(this.f.src[j]) : -1;
    const fixIndent = lastChar < 0 || lastChar === 123 || lastChar === 10;
    let cbi = this.bi;
    let cal = this.al;
    if (fixIndent) {
      if (lastChar === 123) {
        this.pushStr("\n");
      }
      this.pushStr(this.indentStr());
    } else {
      this.pushStr(" ");
      const ind = rsIndentFromWidth(this.f.cfg, this.bufLastLineWidth());
      cbi = ind.bi;
      cal = ind.al;
    }
    const cs = rsShapeIndented(cbi, cal, this.f.cfg).comment(this.f.cfg);
    const r = rsRewriteComment(sub, cs, this.f.cfg);
    this.pushStr(r === null ? sub : r);
    const ls = offset + toI32(sub.length);
    if (ls <= toI32(snippet.length)) {
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
    for (let i = 0; i < ast.atn[n]; i++) {
      const l = this.f.lineOf(ast.hi[ast.attr(n, i)]);
      if (i === 0 || l > attrsEnd) {
        attrsEnd = l;
      }
    }
    const firstLine = this.f.lineOf(mainLo);
    const slo = attrsEnd + 1 < firstLine ? attrsEnd + 1 : firstLine;
    this.pushRewriteInner(lo, hi, null);
    this.skipped.push(slo, this.lineNumber() + 1);
  }

  /** visit_attrs over node `n`'s attributes of one style; answers true when they contain a skip. */
  visitAttrs(n: i32, inner: boolean): boolean {
    const ast = this.ast;
    const k = ast.atn[n];
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
      const isInner = (ast.fl[a] & AT_INNER) !== 0;
      if (isInner === inner) {
        sel.push(a);
      }
    }
    if (sel.length === 0) {
      return false;
    }
    const lo = ast.lo[sel[0]];
    const hi = ast.hi[sel[sel.length - 1]];
    const rw = rsRewriteAttrs(this.ctx(), sel, this.shape());
    this.pushRewrite(lo, hi, rw);
    return false;
  }

  fnBodySkip(item: i32): boolean {
    const ast = this.ast;
    return ast.kind[item] === N_FN && ast.c[item] >= 0 && rsAttrsContainSkip(this.ctx(), ast.c[item]);
  }

  /** Spanned::span lo of item `n`: its first outer attribute, else its own lo. */
  spanLoWithAttrs(n: i32): i32 {
    const ast = this.ast;
    for (let i = 0; i < ast.atn[n]; i++) {
      const a = ast.attr(n, i);
      if ((ast.fl[a] & AT_INNER) === 0) {
        return ast.lo[a];
      }
    }
    return ast.lo[n];
  }

  visitItem(item: i32): void {
    const ast = this.ast;
    const k = ast.kind[item];
    if (k === N_USE || k === N_EXTERN_CRATE) {
      if (rsAttrsContainSkip(this.ctx(), item)) {
        this.pushSkippedWithSpan(item, this.spanLoWithAttrs(item), ast.hi[item], ast.lo[item]);
        return;
      }
    } else if (k === N_MOD && (ast.fl[item] & IT_LOADED) === 0 && rsAttrsContainSkip(this.ctx(), item)) {
      // `mod foo;` with a skip attribute: nothing is pushed; the next missed span copies it.
      return;
    } else {
      // A fn body's inner attributes are the item's in rustc: `#![rustfmt::skip]` there skips the fn.
      if (this.fnBodySkip(item) || this.visitAttrs(item, false)) {
        this.pushSkippedWithSpan(item, this.spanLoWithAttrs(item), ast.hi[item], ast.lo[item]);
        return;
      }
    }
    const lo = ast.lo[item];
    const hi = ast.hi[item];
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
      this.visitMac(ast.a[item], true, item);
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
    for (let i = 0; i < ast.atn[item]; i++) {
      const a = ast.attr(item, i);
      if ((ast.fl[a] & AT_INNER) === 0 && !(ast.lo[item] <= ast.lo[a] && ast.hi[a] <= ast.hi[item])) {
        sel.push(a);
      }
    }
    if (sel.length === 0) {
      return;
    }
    const rw = rsRewriteAttrs(this.ctx(), sel, this.shape());
    this.pushRewrite(ast.lo[sel[0]], ast.hi[sel[sel.length - 1]], rw);
  }

  /** visit_assoc_item: trait or impl items. */
  visitAssocItem(item: i32): void {
    const ast = this.ast;
    if (this.fnBodySkip(item) || this.visitAttrs(item, false)) {
      this.pushSkippedWithSpan(item, ast.lo[item], ast.hi[item], ast.lo[item]);
      return;
    }
    const k = ast.kind[item];
    if (k === N_CONST) {
      rsVisitStatic(this, item);
    } else if (k === N_FN) {
      rsVisitFnItem(this, item);
    } else if (k === N_TYPE_ALIAS) {
      rsVisitTypeAlias(this, item, this.assocKind);
    } else if (k === N_MAC_ITEM) {
      this.visitMac(ast.a[item], true, item);
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
    let lo = ast.lo[mac];
    let hi = ast.hi[mac];
    let rw = rw0;
    if (isItem && !rsMacroStyleIsBraces(ctx, mac)) {
      // Brackets and parentheses: the item ends at the `;` after the macro.
      const h = ctx.spanBefore(ast.hi[mac], this.endPos, ";");
      hi = h + 1;
      if (rw !== null && !rw.endsWith(";")) {
        rw = rw + ";";
      }
    }
    lo = ast.lo[mac];
    this.pushRewrite(lo, hi, rw);
    if (item < 0) {
      return;
    }
  }

  // ---------------------------------------------------------------- blocks and statements

  /** Spanned::span of statement `s`: [lo, hi). */
  stmtLo(s: i32): i32 {
    const ast = this.ast;
    const k = ast.kind[s];
    if (k === N_STMT_ITEM || k === N_STMT_EXPR || k === N_STMT_SEMI) {
      return this.spanLoWithAttrs(ast.a[s]);
    }
    return this.spanLoWithAttrs(s);
  }

  visitStmt(s: i32, isLast: boolean, includeEmptySemi: boolean): void {
    const ast = this.ast;
    const k = ast.kind[s];
    const slo = this.stmtLo(s);
    const shi = ast.hi[s];
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
      this.visitItem(ast.a[s]);
      this.lastPos = shi;
      return;
    }
    if (k === N_LOCAL || k === N_STMT_EXPR || k === N_STMT_SEMI) {
      const attrsOf = k === N_LOCAL ? s : ast.a[s];
      const skip =
        k === N_LOCAL ? rsAttrsContainSkip(this.ctx(), attrsOf) : rsExprAttrsContainSkip(this.ctx(), attrsOf);
      if (skip) {
        this.pushSkippedWithSpan(attrsOf, slo, shi, ast.lo[attrsOf]);
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
        this.pushSkippedWithSpan(s, slo, shi, ast.lo[ast.a[s]]);
      } else {
        this.visitMac(ast.a[s], false, s);
      }
      this.formatMissing(shi);
      return;
    }
    this.f.unsupported = true;
  }

  trimSpacesAfterOpeningBrace(b: i32, withAttrs: boolean): void {
    const ast = this.ast;
    if (ast.ln[b] === 0) {
      return;
    }
    let hi = this.stmtLo(ast.kid(b, 0));
    // The first inner attribute, if any (when they are visited).
    for (let i = 0; withAttrs && i < ast.atn[b]; i++) {
      const a = ast.attr(b, i);
      if ((ast.fl[a] & AT_INNER) !== 0) {
        hi = ast.lo[a];
        break;
      }
    }
    const snippet = this.snippet(this.lastPos, hi);
    const sl = rsCommentCodeSlices(snippet);
    if (sl.n > 0 && sl.kind[0] === CK_NORMAL) {
      const s0 = snippet.slice(sl.start[0], sl.end[0]);
      let r = toI32(s0.length) - 1;
      while (r >= 0 && s0.charCodeAt(r) !== 10) {
        r--;
      }
      if (r >= 0) {
        this.lastPos = this.lastPos + r;
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
    this.lastPos = this.lastPos + comp;
    this.blockIndent();
    this.pushStr("{");
    this.trimSpacesAfterOpeningBrace(b, withAttrs);
    if (withAttrs && ast.atn[b] > 0) {
      this.visitAttrs(b, true);
    }
    this.walkStmts(b, 0, false);
    const n = ast.ln[b];
    if (n > 0) {
      // add_semi_on_last_block_stmt: trailing_semicolon is on.
      const last = ast.kid(b, n - 1);
      if (ast.kind[last] === N_STMT_EXPR && !this.isMacroDef) {
        const ek = ast.kind[ast.a[last]];
        if (ek === N_EX_RET || ek === N_EX_CONTINUE || ek === N_EX_BREAK) {
          this.pushStr(";");
        }
      }
    }
    this.closeBlock(this.lastPos, ast.hi[b] - comp, this.isIfElseBlock && n > 0);
    this.lastPos = ast.hi[b];
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
      const firstLines = slash < 0 ? cs : cs.slice(0, slash);
      alignToRight = rsLastLineWidth(firstLines, cfg.tabSpaces) > rsLastLineWidth(cs, cfg.tabSpaces);
    }
    const sl = rsCommentCodeSlices(cs);
    for (let si = 0; si < sl.n; si++) {
      const kind = sl.kind[si];
      const offset = sl.start[si];
      const sub = cs.slice(sl.start[si], sl.end[si]);
      if (kind === CK_COMMENT) {
        if (!unindented && unindentComment && !alignToRight) {
          unindented = true;
          this.blockUnindent();
        }
        const between = this.snippet(lastHi, lo + offset);
        let sameLine = !rsHasByte(between, 10);
        let commentShape = rsShapeIndented(this.bi, this.al, cfg).comment(cfg);
        if (sameLine) {
          let w = this.bufLastLineWidth() - (this.bi + this.al);
          if (w < 0) {
            w = 0;
          }
          const offsetLen = 1 + w;
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
      lastHi = lo + offset + toI32(sub.length);
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
    const n = ast.ln[b];
    let from = from0;
    let includeEmpty = includeCurrentEmptySemi0;
    while (from < n) {
      // A run of `use` items is reordered.
      const items: i32[] = [];
      let k = from;
      while (k < n) {
        const s = ast.kid(b, k);
        if (ast.kind[s] === N_STMT_ITEM && ast.kind[ast.a[s]] === N_USE) {
          items.push(ast.a[s]);
          k++;
        } else {
          break;
        }
      }
      if (items.length === 0) {
        const s = ast.kid(b, from);
        this.visitStmt(s, from === n - 1, includeEmpty);
        let next = false;
        if (from + 1 < n) {
          const s1 = ast.kid(b, from + 1);
          next = ast.kind[s] === N_STMT_ITEM && ast.kind[s1] === N_STMT_EMPTY;
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
    this.pushStr(rsFormatVisibility(ctx, ast.e[item]));
    if ((ast.fl[item] & IT_UNSAFE) !== 0) {
      this.pushStr("unsafe ");
    }
    this.pushStr("mod ");
    this.pushStr(rsIdentStr(ctx, ast.d[item]));
    if ((ast.fl[item] & IT_LOADED) !== 0) {
      this.pushStr(" {");
      const modLo = ctx.spanAfter(ast.lo[item], ast.hi[item], "{");
      const body = rsTrim(this.snippet(modLo, ast.hi[item] - 1));
      if (body.length === 0) {
        this.pushStr("}");
      } else {
        this.lastPos = modLo;
        this.blockIndent();
        this.visitInnerAttrsOf(item);
        this.walkModItems(item);
        this.closeBlock(this.lastPos, ast.hi[item] - 1, false);
      }
      this.lastPos = ast.hi[item];
    } else {
      this.pushStr(";");
      this.lastPos = ast.hi[item];
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
    for (let i = 0; i < ast.ln[n]; i++) {
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
      const pos = this.lastPos + k + 1;
      const s2 = this.snippet(this.lastPos, pos);
      if (!rsIsBlank(s2)) {
        return;
      }
      this.lastPos = pos;
    }
  }
}

export const rsIsDocAttr = (ast: RsAst, a: i32): boolean => ast.kind[a] === N_ATTR && (ast.fl[a] & AT_DOC) !== 0;
export const rsIsBlockNode = (ast: RsAst, b: i32): boolean => ast.kind[b] === N_BLOCK;
export const rsBlockIsUnsafe = (ast: RsAst, b: i32): boolean => (ast.fl[b] & BLK_UNSAFE) !== 0;
export const rsIsControlFlowExprKind = (k: i32): boolean =>
  k === N_EX_LOOP || k === N_EX_WHILE || k === N_EX_FOR || k === N_EX_LET || k === N_EX_IF || k === N_EX_MATCH;
