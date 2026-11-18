// Formatting macro invocations (whose arguments parse as expressions, types,
// patterns or items) and macro definitions (format_macro_matchers and
// format_macro_bodies are off, so `macro_rules!` branches are kept as
// written).
//
// Ported from rustfmt 1.10.0 (MIT OR Apache-2.0, Copyright The Rust Project
// Developers): macros.rs, header.rs, parse/macros/mod.rs,
// parse/macros/lazy_static.rs.

import {
  IT_MACRO_RULES,
  N_MACRO_ARGS,
  N_MACRO_KW,
  RsAst,
  rsIsExprKind,
  rsIsItemKind,
  rsIsPatKind,
  rsIsTyKind,
} from "./ast";
import {
  rsCombineStrsWithMissingComments,
  rsContainsComment,
  rsFindUncommented,
  rsTrimLeftPreserveLayout,
} from "./comment";
import { RsCtx } from "./context";
import { RHS_EXPR, rsRewriteArray, rsRewriteAssignRhs, rsRewriteBlockNode, rsRewriteNode } from "./expr";
import { RsListFormatting, ST_ALWAYS, ST_NEVER, ST_VERTICAL, rsItemizeList, rsWriteList } from "./lists";
import {
  KW_LET,
  KW_REF,
  KW_STATIC,
  T_COLON,
  T_COMMA,
  T_DOC_BLOCK_INNER,
  T_DOC_BLOCK_OUTER,
  T_DOC_LINE_INNER,
  T_DOC_LINE_OUTER,
  T_EOF,
  T_EQ,
  T_FATARROW,
  T_IDENT,
  T_LBRACE,
  T_LBRACKET,
  T_LPAREN,
  T_SEMI,
  rsIsReserved,
  RsTokens,
} from "./lexer";
import { OC_MACRO_ARG, rsRewriteWithParens } from "./overflow";
import { RsParser } from "./parser";
import { RsShape, rsConfigWithMaxWidthOf, rsIndentStr, rsIndentStrNl } from "./shape";
import { RsStrBuf, rsHasByte, rsLines, rsTrim, rsTrimEnd } from "./str";
import { K_IN_STRING, K_NORMAL, rsCharClasses, rsFilteredStrFits, rsIndentNextLine, rsLineClasses } from "./comment";
import { rsFormatCodeBlock, rsFormatSnippet } from "./format";
import { rsRewriteTy } from "./types";
import { rsFormatVisibility, rsIdentStr } from "./utils";
import { RsVisitor } from "./visitor";

export const MP_ITEM: i32 = 0;
export const MP_STATEMENT: i32 = 1;
export const MP_EXPRESSION: i32 = 2;
export const MP_PAT: i32 = 3;

export const rsMacroPosItem = (): i32 => MP_ITEM;
export const rsMacroPosStatement = (): i32 => MP_STATEMENT;
export const rsMacroPosExpr = (): i32 => MP_EXPRESSION;
export const rsMacroPosPat = (): i32 => MP_PAT;

// Delimiter styles.
const DS_PAREN: i32 = 0;
const DS_BRACKET: i32 = 1;
const DS_BRACE: i32 = 2;

// Flags on the N_MACRO_ARGS cache node.
const MA_FAILED: i32 = 1;
const MA_VEC_WITH_SEMI: i32 = 2;
const MA_TRAILING_COMMA: i32 = 4;

/**
 * macro_style: the first of `(`, `[`, `{` outside comments in the snippet.
 * Only the path and comments come before the arguments' delimiter, so it is
 * that delimiter.
 */
const macroStyle = (ctx: RsCtx, mac: i32): i32 => {
  const k = ctx.ast.x[ctx.ast.b[mac]];
  if (k === T_LPAREN) {
    return DS_PAREN;
  }
  return k === T_LBRACKET ? DS_BRACKET : DS_BRACE;
};

export const rsMacroStyleIsBraces = (ctx: RsCtx, mac: i32): boolean => macroStyle(ctx, mac) === DS_BRACE;

const macroName = (ctx: RsCtx, path: i32): string => {
  const ast = ctx.ast;
  let s = "";
  if ((ast.fl[path] & 1) !== 0 && ast.ln[path] > 1) {
    s = "::";
  }
  for (let i = 0; i < ast.ln[path]; i++) {
    if (i > 0) {
      s = s + "::";
    }
    s = s + rsIdentStr(ctx, ast.d[ast.kid(path, i)]);
  }
  return s + "!";
};

/** Whether MacroArg node `n` is a keyword. */
export const rsIsMacroKeywordArg = (ast: RsAst, n: i32): boolean => ast.kind[n] === N_MACRO_KW;

/** Rewrite for MacroArg. */
export const rsMacroArgRewrite = (ctx: RsCtx, n: i32, shape: RsShape): string | null => {
  const ast = ctx.ast;
  const k = ast.kind[n];
  if (k === N_MACRO_KW) {
    return ctx.tokStr(ast.d[n]);
  }
  if (rsIsItemKind(k)) {
    return rewriteItemAsArg(ctx, n, shape);
  }
  return rsRewriteNode(ctx, n, shape);
};

/** Rewrite for ast::Item: a visitor over the one item. */
const rewriteItemAsArg = (ctx: RsCtx, item: i32, shape: RsShape): string | null => {
  const v = new RsVisitor(ctx.f);
  v.bi = shape.bi;
  v.al = shape.al;
  v.lastPos = rsItemSpanLo(ctx.ast, item);
  v.visitItem(item);
  v.giveTo(ctx);
  return String.fromBytes(v.buf.buf, 0, v.buf.n);
};

const rsItemSpanLo = (ast: RsAst, item: i32): i32 => (ast.atn[item] > 0 ? ast.lo[ast.attr(item, 0)] : ast.lo[item]);

const isDocTok = (k: i32): boolean =>
  k === T_DOC_LINE_OUTER || k === T_DOC_LINE_INNER || k === T_DOC_BLOCK_OUTER || k === T_DOC_BLOCK_INNER;

/** parse_macro_args over the tokens of N_TTS `tts`: an N_MACRO_ARGS node (cached on the mac's `c`). */
const parseMacroArgs = (ctx: RsCtx, mac: i32, style: i32, forcedBracket: boolean): i32 => {
  const ast = ctx.ast;
  const cached = ast.c[mac];
  if (cached >= 0 && ast.x[cached] === style) {
    return cached;
  }
  const tts = ast.b[mac];
  const open = ast.a[tts];
  const close = ast.b[tts];
  const args: i32[] = [];
  let flags = 0;
  if (style !== DS_BRACE) {
    const p = new RsParser(ctx.f.t, ast);
    p.p = open + 1;
    p.end = close;
    p.ph = ctx.f.t.hi[open];
    for (;;) {
      const a = parseOneArg(ctx, p);
      if (a < 0) {
        flags = MA_FAILED;
        break;
      }
      args.push(a);
      const k = p.tk();
      if (k === T_EOF) {
        break;
      }
      if (k === T_COMMA) {
        p.bump();
        if (p.tk() === T_EOF) {
          flags = flags | MA_TRAILING_COMMA;
          break;
        }
        continue;
      }
      if (k === T_SEMI) {
        if (forcedBracket) {
          p.bump();
          if (p.tk() !== T_EOF) {
            const b = parseOneArg(ctx, p);
            if (b >= 0) {
              args.push(b);
              p.bump();
              if (p.tk() === T_EOF && args.length === 2) {
                flags = flags | MA_VEC_WITH_SEMI;
                break;
              }
            }
          }
        }
        flags = MA_FAILED;
        break;
      }
      if (rsIsItemKind(ast.kind[a])) {
        continue;
      }
      flags = MA_FAILED;
      break;
    }
    p.finishInnerAttrs();
  }
  const n = ast.add(N_MACRO_ARGS, ast.lo[tts]);
  ast.x[n] = style;
  ast.fl[n] = flags;
  ast.ls[n] = ast.addKids(args, 0, toI32(args.length));
  ast.ln[n] = toI32(args.length);
  ast.c[mac] = n;
  return n;
};

/** check_keyword, then parse_macro_arg: expr, type, pattern, item. -1 when none parses. */
const parseOneArg = (ctx: RsCtx, p: RsParser): i32 => {
  const ast = ctx.ast;
  const t = ctx.f.t;
  // A keyword followed by EOF or a comma.
  if (p.tk() === T_IDENT && p.off < 0 && rsIsReserved(p.kw())) {
    const k1 = p.la(1);
    if (k1 === T_EOF || k1 === T_COMMA) {
      const n = ast.add(N_MACRO_KW, t.lo[p.p]);
      ast.hi[n] = t.hi[p.p];
      ast.d[n] = p.p;
      p.bump();
      return n;
    }
  }
  const isDoc = isDocTok(p.tk());
  // Expr.
  if ((p.canBeginExpr() && p.kw() !== KW_LET) || isDoc) {
    const s = p.save();
    const e = p.parseExpr();
    if (!p.failed && e >= 0) {
      return e;
    }
    p.restore(s);
  }
  // Type.
  if (p.canBeginType() || isDoc) {
    const s = p.save();
    const ty = p.parseTy();
    if (!p.failed && ty >= 0) {
      return ty;
    }
    p.restore(s);
  }
  // Pattern.
  if (p.canBeginPat() || isDoc) {
    const s = p.save();
    const pat = p.parsePatNoTopAlt();
    if (!p.failed && pat >= 0) {
      return pat;
    }
    p.restore(s);
  }
  // Item.
  {
    const s = p.save();
    const it = p.parseItem(true);
    if (!p.failed && it >= 0) {
      return it;
    }
    p.restore(s);
  }
  return -1;
};

/** return_macro_parse_failure_fallback. */
const parseFailureFallback = (ctx: RsCtx, shape: RsShape, pos: i32, lo: i32, hi: i32): string | null => {
  ctx.macroRewriteFailure = true;
  const snippet = ctx.snippet(lo, hi);
  const ls = rsLines(snippet);
  let likeBlock = false;
  if (ls.length > 0) {
    const t = rsTrim(ls[ls.length - 1]);
    likeBlock = true;
    for (let i = 0; i < toI32(t.length); i++) {
      const c = t.charCodeAt(i);
      if (c !== 125 && c !== 41 && c !== 93) {
        likeBlock = false;
        break;
      }
    }
  }
  if (likeBlock) {
    return rsTrimLeftPreserveLayout(snippet, shape.bi, shape.al, ctx.cfg);
  }
  return pos === MP_ITEM ? snippet + ";" : snippet;
};

/** rewrite_macro. */
export const rsRewriteMacro = (ctx: RsCtx, mac: i32, shape: RsShape, pos: i32): string | null => {
  const nested = ctx.insideMacro;
  ctx.insideMacro = true;
  const r = rewriteMacroInner(ctx, mac, shape, pos, nested);
  ctx.insideMacro = nested;
  if (r === null) {
    ctx.macroRewriteFailure = true;
  }
  return r;
};

const rewriteMacroInner = (ctx: RsCtx, mac: i32, shape: RsShape, pos: i32, isNested: boolean): string | null => {
  const ast = ctx.ast;
  const cfg = ctx.cfg;
  const originalStyle = macroStyle(ctx, mac);
  const name = macroName(ctx, ast.a[mac]);
  const isForcedBracket = name === "vec!";
  const style = isForcedBracket && !isNested ? DS_BRACKET : originalStyle;
  const tts = ast.b[mac];
  const lo = ast.lo[mac];
  const hi = ast.hi[mac];
  const tsEmpty = ast.b[tts] === ast.a[tts] + 1;
  const hasComment = rsContainsComment(ctx.snippet(lo, hi));
  if (tsEmpty && !hasComment) {
    if (style === DS_PAREN) {
      return pos === MP_ITEM ? name + "();" : name + "()";
    }
    if (style === DS_BRACKET) {
      return pos === MP_ITEM ? name + "[];" : name + "[]";
    }
    return name + " {}";
  }
  if (name === "lazy_static!" && !hasComment) {
    // null when it does not parse (then formatted like any macro), "" when
    // it parses but does not format (a macro failure).
    const r = formatLazyStatic(ctx, shape, mac, name);
    if (r !== null) {
      return r.length === 0 ? null : r;
    }
    if (ctx.f.unsupported) {
      return null;
    }
  }
  const pa = parseMacroArgs(ctx, mac, style, isForcedBracket);
  if ((ast.fl[pa] & MA_FAILED) !== 0) {
    return parseFailureFallback(ctx, shape, pos, lo, hi);
  }
  const args: i32[] = [];
  for (let i = 0; i < ast.ln[pa]; i++) {
    args.push(ast.kid(pa, i));
  }
  const vecWithSemi = (ast.fl[pa] & MA_VEC_WITH_SEMI) !== 0;
  const trailingComma = (ast.fl[pa] & MA_TRAILING_COMMA) !== 0;
  if (args.length > 0) {
    let allItems = true;
    for (const a of args) {
      if (!rsIsItemKind(ast.kind[a])) {
        allItems = false;
      }
    }
    if (allItems) {
      return rewriteMacroWithItems(ctx, args, name, shape, style, originalStyle, pos, lo, hi);
    }
  }
  if (style === DS_PAREN) {
    if (vecWithSemi) {
      return handleVecSemi(ctx, shape, args, name, style, lo, hi);
    }
    const r = rsRewriteWithParens(
      ctx,
      name,
      args,
      OC_MACRO_ARG,
      shape,
      lo,
      hi,
      cfg.fnCallWidth,
      trailingComma ? ST_ALWAYS : ST_NEVER,
    );
    if (r === null) {
      return null;
    }
    return pos === MP_ITEM ? r + ";" : r;
  }
  if (style === DS_BRACKET) {
    if (vecWithSemi) {
      return handleVecSemi(ctx, shape, args, name, style, lo, hi);
    }
    let force = trailingComma ? ST_ALWAYS : ST_NEVER;
    if (isForcedBracket && !isNested) {
      ctx.insideMacro = false;
      force = ST_VERTICAL;
    }
    const delim = originalStyle === DS_PAREN ? T_LPAREN : originalStyle === DS_BRACE ? T_LBRACE : -1;
    const r = rsRewriteArray(ctx, name, args, OC_MACRO_ARG, lo, hi, shape, force, delim);
    if (r === null) {
      return null;
    }
    return pos === MP_ITEM ? r + ";" : r;
  }
  // Braces: re-indented, not formatted.
  const sn = ctx.snippet(lo, hi);
  const bp = sn.indexOf("{");
  const snippet = bp < 0 ? "" : sn.slice(bp, toI32(sn.length));
  const body = rsTrimLeftPreserveLayout(snippet, shape.bi, shape.al, cfg);
  return body !== null ? `${name} ${body}` : `${name} ${snippet}`;
};

const handleVecSemi = (
  ctx: RsCtx,
  shape: RsShape,
  args: i32[],
  name: string,
  style: i32,
  lo: i32,
  hi: i32,
): string | null => {
  const cfg = ctx.cfg;
  const left = style === DS_PAREN ? "(" : "[";
  const right = style === DS_PAREN ? ")" : "]";
  const macShape = shape.offsetLeft(toI32(name.length));
  if (macShape === null) {
    return null;
  }
  const nested = macShape.blockIndent(cfg.tabSpaces);
  const l = rsMacroArgRewrite(ctx, args[0], nested);
  if (l === null) {
    return null;
  }
  const r = rsMacroArgRewrite(ctx, args[1], nested);
  if (r === null) {
    return null;
  }
  if (lo > hi) {
    return null;
  }
  if (!rsHasByte(l, 10) && !rsHasByte(r, 10) && toI32(l.length) + toI32(r.length) + 8 <= shape.width) {
    return `${name}${left}${l}; ${r}${right}`;
  }
  const ni = rsIndentStrNl(cfg, nested.bi, nested.al);
  return `${name}${left}${ni}${l};${ni}${r}${rsIndentStrNl(cfg, shape.bi, shape.al)}${right}`;
};

const rewriteMacroWithItems = (
  ctx: RsCtx,
  items: i32[],
  name: string,
  shape: RsShape,
  style: i32,
  originalStyle: i32,
  pos: i32,
  lo: i32,
  hi: i32,
): string | null => {
  const cfg = ctx.cfg;
  const opener = style === DS_PAREN ? "(" : style === DS_BRACKET ? "[" : " {";
  const closer = style === DS_PAREN ? ")" : style === DS_BRACKET ? "]" : "}";
  const origOpener = originalStyle === DS_PAREN ? "(" : originalStyle === DS_BRACKET ? "[" : "{";
  const semi = (style === DS_PAREN || style === DS_BRACKET) && pos === MP_ITEM ? ";" : "";
  const v = new RsVisitor(ctx.f);
  v.bi = shape.bi + cfg.tabSpaces;
  v.al = shape.al;
  v.lastPos = ctx.spanAfter(lo, hi, origOpener);
  for (const it of items) {
    v.visitItem(it);
  }
  v.giveTo(ctx);
  const buf = rsTrim(String.fromBytes(v.buf.buf, 0, v.buf.n));
  return name + opener + rsIndentStrNl(cfg, v.bi, v.al) + buf + rsIndentStrNl(cfg, shape.bi, shape.al) + closer + semi;
};

/** format_lazy_static; null when it does not parse (then the macro is formatted as usual). */
const formatLazyStatic = (ctx: RsCtx, shape: RsShape, mac: i32, name: string): string | null => {
  const ast = ctx.ast;
  const cfg = ctx.cfg;
  const tts = ast.b[mac];
  const p = new RsParser(ctx.f.t, ast);
  p.p = ast.a[tts] + 1;
  p.end = ast.b[tts];
  p.ph = ctx.f.t.hi[ast.a[tts]];
  const nested = shape.blockIndent(cfg.tabSpaces).withMaxWidth(cfg);
  const elems: i32[] = [];
  while (p.tk() !== T_EOF) {
    const vis = p.parseVis();
    if (p.failed) {
      return null;
    }
    p.eatKw(KW_STATIC);
    p.eatKw(KW_REF);
    if (p.tk() !== T_IDENT || (p.off < 0 && rsIsReserved(p.kw()))) {
      return null;
    }
    const id = p.identTok();
    p.eat(T_COLON);
    const ty = p.parseTy();
    if (p.failed) {
      return null;
    }
    p.eat(T_EQ);
    const ex = p.parseExpr();
    if (p.failed) {
      return null;
    }
    p.eat(T_SEMI);
    elems.push(vis);
    elems.push(id);
    elems.push(ty);
    elems.push(ex);
  }
  p.finishInnerAttrs();
  let result = name + " {" + rsIndentStrNl(cfg, nested.bi, nested.al);
  const n = toI32(elems.length) / 4;
  for (let i = 0; i < n; i++) {
    const vis = rsFormatVisibility(ctx, elems[i * 4]);
    const ts = rsRewriteTy(ctx, elems[i * 4 + 2], nested);
    if (ts === null) {
      return ""; // parsed, but did not format
    }
    const stmt = `${vis}static ref ${ctx.tokStr(elems[i * 4 + 1])}: ${ts} =`;
    const sh = nested.subWidth(1);
    if (sh === null) {
      return ""; // parsed, but did not format
    }
    const r = rsRewriteAssignRhs(ctx, stmt, elems[i * 4 + 3], RHS_EXPR, sh);
    if (r === null) {
      return ""; // parsed, but did not format
    }
    result = result + r + ";";
    if (i !== n - 1) {
      result = result + rsIndentStrNl(cfg, nested.bi, nested.al);
    }
  }
  return result + rsIndentStrNl(cfg, shape.bi, shape.al) + "}";
};

// ---------------------------------------------------------------- macro definitions

/** remove_trailing_white_spaces. */
const removeTrailingWhiteSpaces = (text: string): string => {
  const r = rsCharClasses(text);
  const buf = new RsStrBuf();
  let space = -1; // where the pending whitespace starts
  for (let ci = 0; ci < r.nc; ci++) {
    const i = r.starts[ci];
    const j = ci + 1 < r.nc ? r.starts[ci + 1] : toI32(text.length);
    const c = text.charCodeAt(i);
    if (c === 10) {
      if (r.kinds[i] === K_IN_STRING && space >= 0) {
        buf.addSlice(text, space, i);
      }
      space = -1;
      buf.add("\n");
    } else if (c === 32 || c === 9 || c === 13 || c === 11 || c === 12) {
      if (space < 0) {
        space = i;
      }
    } else {
      if (space >= 0) {
        buf.addSlice(text, space, i);
        space = -1;
      }
      buf.addSlice(text, i, j);
    }
  }
  return buf.str();
};

class Branch {
  lo: i32;
  hi: i32;
  argsOpen: i32;
  argsKind: i32;
  bodyOpen: i32; // the body's delimiter tokens
  bodyClose: i32;
  constructor(lo: i32, hi: i32, argsOpen: i32, argsKind: i32, bodyOpen: i32, bodyClose: i32) {
    this.lo = lo;
    this.hi = hi;
    this.argsOpen = argsOpen;
    this.argsKind = argsKind;
    this.bodyOpen = bodyOpen;
    this.bodyClose = bodyClose;
  }
}

/** replace_names: `$name` becomes `zname`; null on `$(`. `olds`/`news` get the substitutions. */
const replaceNames = (input: string, olds: string[], news: string[]): string | null => {
  const r = rsCharClasses(input);
  const result = new RsStrBuf();
  let dollarCount = 0;
  let curName = "";
  for (let ci = 0; ci < r.nc; ci++) {
    const i = r.starts[ci];
    const j = ci + 1 < r.nc ? r.starts[ci + 1] : toI32(input.length);
    const c = input.charCodeAt(i);
    const alnum = (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c >= 0x80;
    if (r.kinds[i] !== K_NORMAL) {
      result.addSlice(input, i, j);
    } else if (c === 36) {
      dollarCount++;
    } else if (dollarCount === 0) {
      result.addSlice(input, i, j);
    } else if (!alnum && curName.length !== 0) {
      result.add(registerMetavariable(olds, news, curName, dollarCount));
      result.addSlice(input, i, j);
      dollarCount = 0;
      curName = "";
    } else if (c === 40 && curName.length === 0) {
      return null;
    } else if (alnum || c === 95) {
      curName = curName + input.slice(i, j);
    }
  }
  if (curName.length !== 0) {
    result.add(registerMetavariable(olds, news, curName, dollarCount));
  }
  return result.str();
};

const registerMetavariable = (olds: string[], news: string[], name: string, dollarCount: i32): string => {
  let nw = "";
  for (let i = 0; i < dollarCount - 1; i++) {
    nw = nw + "$";
  }
  nw = nw + "z" + name;
  let old = "";
  for (let i = 0; i < dollarCount; i++) {
    old = old + "$";
  }
  old = old + name;
  // A HashMap insert: a repeated name replaces its entry.
  for (let i = 0; i < olds.length; i++) {
    if (olds[i] === old) {
      news[i] = nw;
      return nw;
    }
  }
  olds.push(old);
  news.push(nw);
  return nw;
};

const replaceAll = (s: string, from: string, to: string): string => {
  if (from.length === 0) {
    return s;
  }
  const out = new RsStrBuf();
  let i = 0;
  for (;;) {
    const k = s.indexOf(from, i);
    if (k < 0) {
      break;
    }
    out.addSlice(s, i, k);
    out.add(to);
    i = k + toI32(from.length);
  }
  if (i === 0) {
    return s;
  }
  out.addSlice(s, i, toI32(s.length));
  return out.str();
};

const isEmptyLine = (s: string): boolean => rsTrim(s).length === 0;

/** MacroBranch::rewrite (format_macro_matchers off, format_macro_bodies on). */
const rewriteBranch = (ctx: RsCtx, br: Branch, shape: RsShape, multi: boolean): string | null => {
  const cfg = ctx.cfg;
  const t = ctx.f.t;
  if (br.argsKind !== T_LPAREN) {
    return null;
  }
  const oldBody = rsTrim(ctx.snippet(t.hi[br.bodyOpen], t.lo[br.bodyClose]));
  const hasBlockBody = oldBody.startsWith("{");
  // 5 = " => {", and at style edition 2024 6 = " => {{" for a block body.
  const prefixWidth = cfg.styleEdition >= 2024 && hasBlockBody ? 6 : 5;
  if (shape.subWidth(prefixWidth) === null) {
    return null;
  }
  let result = ctx.snippet(t.lo[br.argsOpen], t.hi[t.match[br.argsOpen]]);
  if (multi) {
    result = result + " =>";
  }
  const olds: string[] = [];
  const news: string[] = [];
  const bodyStr = replaceNames(oldBody, olds, news);
  if (bodyStr === null) {
    return null;
  }
  result = result + " {";
  const bbi = hasBlockBody ? shape.bi : shape.bi + cfg.tabSpaces;
  const bal = shape.al;
  const newWidth = cfg.maxWidth - (bbi + bal);
  let bodyCfg = rsConfigWithMaxWidthOf(cfg, newWidth);
  let fm0 = rsFormatSnippet(ctx, bodyStr, bodyCfg, true);
  if (fm0 === null) {
    if (ctx.f.unsupported) {
      return null;
    }
    bodyCfg = rsConfigWithMaxWidthOf(cfg, newWidth + cfg.tabSpaces);
    fm0 = rsFormatCodeBlock(ctx, bodyStr, bodyCfg, true);
  }
  const fm = fm0;
  if (fm === null) {
    return null;
  }
  if (!rsFilteredStrFits(fm.text, bodyCfg.maxWidth, cfg.tabSpaces, shape)) {
    return null;
  }
  const indentStr = rsIndentStr(cfg, bbi, bal);
  const nb = new RsStrBuf();
  let needIndent = true;
  const lc = rsLineClasses(rsTrimEnd(fm.text));
  for (let i = 0; i < lc.n; i++) {
    const l = lc.lines[i];
    if (!isEmptyLine(l) && needIndent && !fm.skipped.contains(i + 1)) {
      nb.add(indentStr);
    }
    nb.add(l);
    nb.add("\n");
    const k = lc.kinds[i];
    needIndent = rsIndentNextLine(k, bodyCfg);
  }
  let newBody = nb.str();
  for (let i = 0; i < olds.length; i++) {
    if (oldBody.indexOf(news[i]) >= 0) {
      return null;
    }
    newBody = replaceAll(newBody, news[i], olds[i]);
  }
  if (hasBlockBody) {
    result = result + rsTrim(newBody);
  } else if (newBody.length !== 0) {
    result = result + "\n" + newBody + rsIndentStr(cfg, shape.bi, shape.al);
  }
  return result + "}";
};

/** The token after the token tree at `i`. */
const ttEnd = (t: RsTokens, i: i32): i32 => {
  const k = t.kind[i];
  return k === T_LPAREN || k === T_LBRACKET || k === T_LBRACE ? t.match[i] + 1 : i + 1;
};

/** rewrite_macro_def. */
export const rsRewriteMacroDef = (ctx: RsCtx, shape: RsShape, bi: i32, al: i32, item: i32): string | null => {
  const ast = ctx.ast;
  const cfg = ctx.cfg;
  const t = ctx.f.t;
  const lo = ast.lo[item];
  const hi = ast.hi[item];
  const snippet = removeTrailingWhiteSpaces(ctx.snippet(lo, hi));
  if (snippet.endsWith(";")) {
    return snippet;
  }
  const isRules = (ast.fl[item] & IT_MACRO_RULES) !== 0;
  if (!isRules) {
    ctx.unsupported("macro 2.0");
    return null;
  }
  const body = ast.a[item];
  const bodyOpen = ast.a[body];
  const bodyClose = ast.b[body];
  // MacroParser::parse.
  const branches: Branch[] = [];
  let i = bodyOpen + 1;
  // While at least two token trees remain.
  while (i < bodyClose && ttEnd(t, i) < bodyClose) {
    const k = t.kind[i];
    if (!(k === T_LPAREN || k === T_LBRACKET || k === T_LBRACE)) {
      return snippet;
    }
    const argsClose = t.match[i];
    const blo = t.lo[i];
    const argsKind = k;
    const argsOpen = i;
    i = argsClose + 1;
    if (i >= bodyClose || t.kind[i] !== T_FATARROW) {
      return snippet;
    }
    i++;
    if (i >= bodyClose) {
      return snippet;
    }
    const k2 = t.kind[i];
    if (!(k2 === T_LPAREN || k2 === T_LBRACKET || k2 === T_LBRACE)) {
      return snippet;
    }
    const bc = t.match[i];
    const bo = i;
    let bhi = t.hi[bc];
    i = bc + 1;
    if (i < bodyClose && t.kind[i] === T_SEMI) {
      bhi = t.hi[i];
      i++;
    }
    branches.push(new Branch(blo, bhi, argsOpen, argsKind, bo, bc));
  }
  // The header (header.rs format_header): `macro_rules!`, then the name. A
  // comment between them is kept as written, with the whitespace around it.
  const identTok = ast.d[item];
  const identStr = rsIdentStr(ctx, identTok);
  const bangHi = ctx.spanAfter(lo, hi, "!");
  const identLo = t.lo[identTok];
  const between = ctx.snippet(bangHi, identLo);
  // Without a comment, combine_strs_with_missing_comments at infinite width
  // always joins the two with one space.
  let result = rsContainsComment(between) ? "macro_rules!" + between + identStr : "macro_rules! " + identStr;
  const armShape = shape.blockIndent(cfg.tabSpaces).withMaxWidth(cfg);
  if (branches.length === 0) {
    const blo = ctx.spanBefore(lo, hi, "{");
    // rewrite_empty_macro_def_body: an empty block over [blo, hi).
    const b = ast.add(150, blo);
    ast.hi[b] = hi;
    const r = rsRewriteBlockNode(ctx, b, shape);
    if (r === null) {
      return null;
    }
    return result + " " + r;
  }
  const items = rsItemizeList(
    ctx,
    toI32(branches.length),
    "}",
    ";",
    (k: i32): i32 => branches[k].lo,
    (k: i32): i32 => branches[k].hi,
    (k: i32): string | null => {
      const r = rewriteBranch(ctx, branches[k], armShape, true);
      if (r === null && ctx.macroRewriteFailure) {
        const br = branches[k];
        return rsTrim(ctx.snippet(t.hi[br.bodyOpen], t.lo[br.bodyClose]));
      }
      return r;
    },
    ctx.spanAfter(lo, hi, "{"),
    hi,
    false,
  );
  const fmt = new RsListFormatting(armShape, cfg);
  fmt.separator = ";";
  fmt.trailingSeparator = ST_ALWAYS;
  fmt.preserveNewline = true;
  result = result + " {" + rsIndentStrNl(cfg, armShape.bi, armShape.al);
  const ls = rsWriteList(items, fmt);
  if (ls === null) {
    return snippet;
  }
  result = result + ls;
  result = result + rsIndentStrNl(cfg, bi, al) + "}";
  return result;
};

export const rsMacroIsExprArg = (ast: RsAst, n: i32): boolean => rsIsExprKind(ast.kind[n]);
export const rsMacroIsTyArg = (ast: RsAst, n: i32): boolean => rsIsTyKind(ast.kind[n]);
export const rsMacroIsPatArg = (ast: RsAst, n: i32): boolean => rsIsPatKind(ast.kind[n]);
export const rsMacroIndent = (ctx: RsCtx, bi: i32, al: i32): string => rsIndentStr(ctx.cfg, bi, al);
export const rsMacroTrimEnd = (s: string): string => rsTrimEnd(s);
