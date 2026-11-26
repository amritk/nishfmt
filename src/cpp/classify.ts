// Token roles and spacing.
//
// One forward pass per line over a bracket stack decides what each token is
// doing (a template bracket, a pointer declarator or a multiplication, a
// unary or binary operator, which kind of colon) and whether each bracket
// level holds an expression or a declaration. `spaceBefore` then answers the
// single space-or-none question for every adjacent pair, at LLVM style.

import { isForEachMacro, isQtWord } from "./parser";
import { Doc } from "./doc";
import { fault } from "../core/fault";
import {
  KW_TRY,
  KW_CONST_CAST,
  KW_DYNAMIC_CAST,
  KW_REINTERPRET_CAST,
  KW_STATIC_CAST,
  PP_DEFINE,
  PP_ELIF,
  PP_ERROR,
  PP_ENDIF,
  PP_ELSE,
  PP_OTHER,
  PP_PRAGMA,
  PP_IF,
  BK_BLOCK,
  BK_BRACED_INIT,
  binPrecedence,
  KW_ALIGNOF,
  TT_FUNCTION_ANNOTATION_RPAREN,
  CW_FINAL,
  CW_OVERRIDE,
  isIdentKind,
  isLiteralKind,
  isSimpleTypeKind,
  isWordKind,
  K_COMMENT,
  K_UNKNOWN,
  K_HEADER,
  CW_HAS_INCLUDE,
  K_EOF,
  K_IDENT,
  KW_ASM,
  K_NUMBER,
  K_STRING,
  KW_ALIGNAS,
  KW_ATTRIBUTE,
  KW_AUTO,
  KW_CASE,
  KW_CATCH,
  KW_CLASS,
  KW_TYPENAME,
  KW_CONST,
  KW_CONSTEVAL,
  KW_CONSTEXPR,
  KW_DECLTYPE,
  KW_DEFAULT,
  KW_DELETE,
  KW_ENUM,
  KW_EXPLICIT,
  KW_FALSE,
  KW_FOR,
  KW_FRIEND,
  KW_IF,
  KW_INLINE,
  KW_NEW,
  KW_MS,
  KW_NOEXCEPT,
  KW_OPERATOR,
  KW_PRIVATE,
  KW_PROTECTED,
  KW_PUBLIC,
  KW_REQUIRES,
  KW_RETURN,
  KW_CO_RETURN,
  KW_CO_YIELD,
  KW_CO_AWAIT,
  KW_SIZEOF,
  KW_STATIC,
  KW_STATIC_ASSERT,
  KW_STRUCT,
  KW_SWITCH,
  KW_TEMPLATE,
  KW_THIS,
  KW_THROW,
  KW_TRUE,
  KW_TYPEOF,
  KW_GENERIC,
  TT_GENERIC_SELECTION_COLON,
  KW_ATOMIC,
  KW_UNION,
  KW_USING,
  KW_VIRTUAL,
  LT_OTHER,
  LT_VIRTUAL_FUNCTION_DECL,
  KW_VOLATILE,
  KW_WHILE,
  LT_IMPORT,
  LT_PREPROCESSOR,
  P_AMP,
  P_AMPAMP,
  P_AT,
  P_BACKSLASH,
  P_ARROW,
  P_ARROWSTAR,
  P_CARET,
  P_COLON,
  P_COLONCOLON,
  P_COMMA,
  P_ELLIPSIS,
  P_EQUAL,
  P_EXCLAIM,
  P_GREATER,
  P_HASH,
  P_HASHHASH,
  P_LBRACE,
  P_LESS,
  P_LESSLESS,
  P_LPAREN,
  P_LSQUARE,
  P_MINUS,
  P_MINUSMINUS,
  P_PERIOD,
  P_PERIODSTAR,
  P_PIPEPIPE,
  P_PLUS,
  P_PLUSPLUS,
  P_QUESTION,
  P_RBRACE,
  P_RPAREN,
  P_RSQUARE,
  P_SEMI,
  P_STAR,
  P_TILDE,
  PREC_ASSIGNMENT,
  PREC_COMMA,
  TT_ATTRIBUTE_RPAREN,
  TT_ATTRIBUTE_SQUARE,
  TT_BINARY_OPERATOR,
  TT_BIT_FIELD_COLON,
  TT_BLOCK_COMMENT,
  TT_CASE_LABEL_COLON,
  TT_CAST_RPAREN,
  TT_ARRAY_INITIALIZER_LSQUARE,
  PREC_UNKNOWN,
  TT_CONDITIONAL_EXPR,
  TT_CTOR_DTOR_DECL_NAME,
  TT_CTOR_INITIALIZER_COLON,
  TT_CTOR_INITIALIZER_COMMA,
  TT_DESIGNATED_INITIALIZER_PERIOD,
  TT_FUNCTION_DECLARATION_NAME,
  TT_FUNCTION_LBRACE,
  TT_FUNCTION_TYPE_LPAREN,
  TT_INHERITANCE_COLON,
  TT_INLINE_ASM_COLON,
  TT_IMPLICIT_STRING_LITERAL,
  TT_INLINE_ASM_BRACE,
  TT_OBJC_METHOD_SPECIFIER,
  TT_SELECTOR_NAME,
  TT_OBJC_METHOD_EXPR,
  TT_LAMBDA_ARROW,
  TT_LAMBDA_LBRACE,
  TT_LAMBDA_LSQUARE,
  TT_LINE_COMMENT,
  TT_OVERLOADED_OPERATOR,
  TT_OVERLOADED_OPERATOR_LPAREN,
  TT_POINTER_OR_REFERENCE,
  TT_RANGE_BASED_FOR_LOOP_COLON,
  TT_START_OF_NAME,
  TT_CLASS_HEAD_NAME,
  TT_ENUM_LBRACE,
  TT_ENUM_EQUAL,
  TT_TEMPLATE_CLOSER,
  TT_TEMPLATE_OPENER,
  TT_TRAILING_ANNOTATION,
  TT_TRAILING_RETURN_ARROW,
  TT_TRAILING_UNARY_OPERATOR,
  TT_UNARY_OPERATOR,
  TT_UNKNOWN,
  TT_ARRAY_SUBSCRIPT_LSQUARE,
  TT_INLINE_ASM_SYMBOLIC_NAME_LSQUARE,
  TT_DESIGNATED_INITIALIZER_LSQUARE,
} from "./tok";

const MAXD: i32 = 512;

/** The largest i32: a count of tokens walked stays far below it. */
const CL_I32_MAX: i32 = 2147483647;

/**
 * `xs[i]` of a token or line table. Every index the classifier reads is a
 * token or line the document holds; one outside the table faults and
 * answers -1, which ends any walk along the token links.
 */
const clAt = (xs: i32[], i: i32): i32 => {
  // (One unsigned compare: a negative `i` is past every length.)
  const u = toU32(i);
  if (u < toU32(xs.length)) {
    return xs[u];
  }
  fault();
  return -1;
};

/** A comment token's type: a block comment's second byte is `*` (42). */
const clCommentType = (d: Doc, t: i32): i32 => {
  const s = clAt(d.start, t);
  // (A byte offset, below the file's length.)
  if (s >= CL_I32_MAX) {
    fault();
    return TT_LINE_COMMENT;
  }
  return d.at(s + 1) === 42 ? TT_BLOCK_COMMENT : TT_LINE_COMMENT;
};

/** `xs[i] = v` of a token or line table; an index outside it faults. */
const clSet = (xs: i32[], i: i32, v: i32): void => {
  const u = toU32(i);
  if (u < toU32(xs.length)) {
    xs[u] = v;
    return;
  }
  fault();
};

/** One bracket level's state, which clang-format keeps per context. */
class CppClassLevel {
  open: i32 = -1; // the level's opening token (-1 at the top)
  expr: i32 = 0; // 1 when the level holds an expression
  tmpl: i32 = 0; // 1 inside template arguments
  asg: i32 = 0; // 1 once the level has passed an assignment
  ques: i32 = 0; // pending `?` count, for matching `:`
  afterNew: i32 = 0; // 1 past a `new` at this depth: clang-format's CanBeExpression off
  caret: i32 = 0; // 1 past a unary `^` at this depth: clang-format's CaretFound
  sa: i32 = 0; // 1 in a static_assert's first argument: clang-format's InStaticAssertFirstArgument
  bindAt: i32 = 0; // binding strength
}

export class Classifier {
  d: Doc;
  first: i32 = -1;
  line: i32 = -1;
  subObjC: i32 = -1; // a subscript's `[` a `:` made an Objective-C message (subscriptColon)
  // Per-depth state: MAXD levels, and a spare a level past them answers after a fault.
  lv: CppClassLevel[];
  lvSpare: CppClassLevel;
  ctorSeen: boolean = false; // a constructor initializer list started before the current token
  fnEarly: boolean = false; // isFunctionName decided on the token before `operator` alone
  depth: i32 = 0;
  inClass: boolean = false; // the enclosing scope is a class body
  // The line is in a #define's body inside one of its braces: clang-format's
  // MacroBodyScopes is not empty (TokenAnnotator::annotate).
  macroScope: boolean = false;
  lineHasRequires: boolean = false; // the line being classified holds `requires`
  lineHasOperator: boolean = false; // ... `operator`
  lineHasStarSquare: boolean = false; // ... `*` right before `[`

  constructor(d: Doc) {
    this.d = d;
    this.lv = [];
    for (let i = 0; i < MAXD; i++) {
      this.lv.push(new CppClassLevel());
    }
    this.lvSpare = new CppClassLevel();
  }

  /** Level `x`'s state; a level outside the stack faults and answers a spare. */
  level(x: i32): CppClassLevel {
    const lv = this.lv;
    const u = toU32(x);
    if (u < toU32(lv.length)) {
      return lv[u];
    }
    fault();
    return this.lvSpare;
  }

  /** Token `t`'s kind, or -1 for no token (`t < 0`). */
  k(t: i32): i32 {
    if (t < 0) {
      return -1;
    }
    const kind = this.d.kind;
    if (t < kind.length) {
      return kind[t];
    }
    fault();
    return -1;
  }

  /** Token `t`'s type, or -1 for no token (`t < 0`). */
  ty(t: i32): i32 {
    if (t < 0) {
      return -1;
    }
    const type = this.d.type;
    if (t < type.length) {
      return type[t];
    }
    fault();
    return -1;
  }

  /**
   * `T *[A::k]`: clang-format starts an Objective-C message at a `[` after a
   * pointer `*` and keeps it when the brackets hold more than one token and
   * no `(` follows; the `*` is then a binary operator (not after `new`).
   */
  objcStarBrackets(): void {
    const d = this.d;
    if (!this.lineHasStarSquare) {
      return;
    }
    for (let t = this.first; t >= 0; t = clAt(d.nxt, t)) {
      if (clAt(d.kind, t) !== P_STAR || clAt(d.type, t) !== TT_POINTER_OR_REFERENCE) {
        continue;
      }
      const lb = clAt(d.nxt, t);
      if (
        lb < 0 ||
        clAt(d.kind, lb) !== P_LSQUARE ||
        clAt(d.type, lb) === TT_LAMBDA_LSQUARE ||
        clAt(d.type, lb) === TT_ATTRIBUTE_SQUARE
      ) {
        continue;
      }
      const rb = clAt(d.match, lb);
      if (rb < 0 || rb - 2 <= lb) {
        continue;
      }
      const after = clAt(d.nxt, rb);
      if (after >= 0 && clAt(d.kind, after) === P_LPAREN) {
        continue;
      }
      let q = clAt(d.prv, t);
      while (
        q >= 0 &&
        (isWordKind(clAt(d.kind, q)) || clAt(d.kind, q) === P_COLONCOLON) &&
        clAt(d.kind, q) !== KW_NEW
      ) {
        q = clAt(d.prv, q);
      }
      if (q >= 0 && clAt(d.kind, q) === KW_NEW) {
        continue;
      }
      clSet(d.type, t, TT_BINARY_OPERATOR);
    }
  }

  /** Whether this line starts with `asm`, `__asm` or `__asm__` (clang-format's kw_asm). */
  lineStartsWithAsm(): boolean {
    const d = this.d;
    const f = this.first;
    if (f < 0) {
      return false;
    }
    if (clAt(d.kind, f) === KW_ASM) {
      return true;
    }
    if (clAt(d.kind, f) !== K_IDENT) {
      return false;
    }
    return d.is(f, "__asm") || d.is(f, "__asm__");
  }

  set(t: i32, tt: i32): void {
    const final = this.d.final;
    const type = this.d.type;
    const u = toU32(t);
    if (u >= toU32(final.length) || u >= toU32(type.length)) {
      fault();
      return;
    }
    if (final[u] === 0) {
      type[u] = tt;
    }
  }

  /** Whether `(` token `o` is an if's: `if (`, or `if constexpr (` / `if X (` (consumeToken's kw_if). */
  isIfParen(o: i32): boolean {
    const p = this.prev(o);
    if (p < 0) {
      return false;
    }
    const pk = this.k(p);
    if (pk === KW_IF) {
      return clAt(this.d.lType, this.line) !== LT_PREPROCESSOR;
    }
    if (pk !== KW_CONSTEXPR && pk !== K_IDENT) {
      return false;
    }
    const pp = this.prev(p);
    return pp >= 0 && this.k(pp) === KW_IF && clAt(this.d.lType, this.line) !== LT_PREPROCESSOR;
  }

  /** The token before `t`, comments skipped, or -1. */
  prev(t: i32): i32 {
    const prv = this.d.prv;
    const kind = this.d.kind;
    if (t < 0 || t >= prv.length) {
      fault();
      return -1;
    }
    let p = prv[t];
    while (p >= 0) {
      if (p >= kind.length) {
        fault();
        return -1;
      }
      if (kind[p] !== K_COMMENT) {
        return p;
      }
      if (p >= prv.length) {
        fault();
        return -1;
      }
      p = prv[p];
    }
    return p;
  }

  /** The token after `t`, comments skipped, or -1. */
  next(t: i32): i32 {
    const nxt = this.d.nxt;
    const kind = this.d.kind;
    if (t < 0 || t >= nxt.length) {
      fault();
      return -1;
    }
    let n = nxt[t];
    while (n >= 0) {
      if (n >= kind.length) {
        fault();
        return -1;
      }
      if (kind[n] !== K_COMMENT) {
        return n;
      }
      if (n >= nxt.length) {
        fault();
        return -1;
      }
      n = nxt[n];
    }
    return n;
  }

  isPtrKind(t: i32): boolean {
    const k = this.k(t);
    return k === P_STAR || k === P_AMP || k === P_AMPAMP;
  }

  isWord(t: i32): boolean {
    return isWordKind(this.k(t));
  }

  isLit(t: i32): boolean {
    return isLiteralKind(this.k(t));
  }

  /**
   * The `>` closing the template bracket at `lt`, or -1 if `<` compares
   * (clang-format 23's parseAngle). A `>` the parser already made a closer
   * (before `{` or an empty `()`) closes whatever the checks below say.
   */
  findCloser(lt: i32, inExpr: boolean, parentLess: boolean, saFirst: boolean): i32 {
    const d = this.d;
    let depth = 0;
    let seenTernary = false;
    let maybeAngles = true;
    // (A line starting with `template` never gives the angles up for `&&` or `||`.)
    const angleOps = inExpr && clAt(d.kind, this.first) !== KW_TEMPLATE;
    let t = clAt(d.nxt, lt);
    while (t >= 0) {
      const k = clAt(d.kind, t);
      if (depth === 0) {
        if (k === P_GREATER) {
          const n = clAt(d.nxt, t);
          if (!(clAt(d.final, t) === 1 && clAt(d.type, t) === TT_TEMPLATE_CLOSER)) {
            // `a < b >> 2`: a `>` right against another closes nothing unless
            // the `<` sits in template arguments.
            if (n >= 0 && clAt(d.kind, n) === P_GREATER && clAt(d.ws, n) === 0 && !parentLess) {
              return -1;
            }
            // `a < b ? c : d > e`: after a `?:` in an expression, only a `>`
            // before `(` or `{` closes.
            if (inExpr && seenTernary && (n < 0 || (clAt(d.kind, n) !== P_LPAREN && clAt(d.kind, n) !== P_LBRACE))) {
              return -1;
            }
            if (!maybeAngles) {
              return -1;
            }
            // `static_assert(N < M > -1)`: nor in a static_assert's first
            // argument before `-` or a name.
            if (saFirst && n >= 0 && (clAt(d.kind, n) === P_MINUS || isIdentKind(clAt(d.kind, n)))) {
              return -1;
            }
          }
          if (n >= 0 && isLiteralKind(clAt(d.kind, n))) {
            return -1;
          }
          return t;
        }
        // (A `{` is nested, as in `X<T{}>`: clang-format bails only on closers.)
        if (k === P_SEMI || k === P_RBRACE || k === P_RPAREN || k === P_RSQUARE) {
          return -1;
        }
        // An `&&` or `||` that is a binary operator, in an expression, makes
        // these angles a comparison unless an earlier closer settles it.
        // (An `&&` right before `>`, `,` or `...` is a reference type.)
        const p = clAt(d.prv, t);
        if (maybeAngles && angleOps && p >= 0 && p !== lt) {
          const pk = clAt(d.kind, p);
          if (pk === P_PIPEPIPE) {
            maybeAngles = false;
          } else if (pk === P_AMPAMP && !(k === P_GREATER || k === P_COMMA || k === P_ELLIPSIS)) {
            maybeAngles = false;
          }
        }
        // (A `?` is read with its conditional below: only its `:` is seen here.)
        if (p >= 0 && p !== lt && clAt(d.kind, p) === P_COLON) {
          seenTernary = true;
        }
        if (k === P_LESS) {
          const c = this.nestedCloser(t);
          if (c >= 0) {
            t = clAt(d.nxt, c);
            continue;
          }
          t = clAt(d.nxt, t);
          continue;
        }
        if (k === P_QUESTION) {
          // parseConditional: everything up to the `:` is read as an
          // expression, a `>` among it a comparison.
          const c = this.conditionalColon(t);
          if (c < 0) {
            return -1;
          }
          t = clAt(d.nxt, c);
          continue;
        }
      }
      if (k === P_LPAREN || k === P_LSQUARE || k === P_LBRACE) {
        if (depth >= CL_I32_MAX) {
          fault();
          return -1;
        }
        depth++;
      } else if (k === P_RPAREN || k === P_RSQUARE || k === P_RBRACE) {
        // (`depth` never drops below 0: a closer at 0 ends the walk.)
        if (depth <= 0) {
          return -1;
        }
        depth--;
      }
      t = clAt(d.nxt, t);
    }
    return -1;
  }

  /**
   * The closer of a `<` met inside template arguments or a conditional, or
   * -1: after a literal, `}` or `)` a `<` opens nothing.
   */
  nestedCloser(t: i32): i32 {
    const d = this.d;
    const p = this.prev(t);
    const pk = p >= 0 ? this.k(p) : -1;
    const binary =
      p >= 0 &&
      (this.isLit(p) ||
        pk === P_RBRACE ||
        (pk === P_RPAREN && !(clAt(d.match, p) >= 0 && this.ty(clAt(d.match, p)) === TT_OVERLOADED_OPERATOR_LPAREN)));
    return binary ? -1 : this.findCloser(t, false, true, false);
  }

  /**
   * The `:` ending the conditional whose `?` is `q` (clang-format's
   * parseConditional), or -1 when a closing bracket comes first.
   */
  conditionalColon(q: i32): i32 {
    const d = this.d;
    let depth = 0;
    let t = clAt(d.nxt, q);
    while (t >= 0) {
      const k = clAt(d.kind, t);
      if (depth === 0) {
        if (k === P_COLON) {
          return t;
        }
        if (k === P_SEMI || k === P_RBRACE || k === P_RPAREN || k === P_RSQUARE) {
          return -1;
        }
        if (k === P_LESS) {
          const c = this.nestedCloser(t);
          if (c >= 0) {
            t = clAt(d.nxt, c);
            continue;
          }
        } else if (k === P_QUESTION) {
          const c = this.conditionalColon(t);
          if (c < 0) {
            return -1;
          }
          t = clAt(d.nxt, c);
          continue;
        }
      }
      if (k === P_LPAREN || k === P_LSQUARE || k === P_LBRACE) {
        if (depth >= CL_I32_MAX) {
          fault();
          return -1;
        }
        depth++;
      } else if (k === P_RPAREN || k === P_RSQUARE || k === P_RBRACE) {
        // (It may go below 0: computed in i64, it fits.)
        const nd = toI64(depth) - toI64(1);
        if (nd < toI64(-2147483648)) {
          fault();
          return -1;
        }
        depth = toI32(nd);
      }
      t = clAt(d.nxt, t);
    }
    return -1;
  }

  /** Whether the token before `t` makes `t` a prefix operator. */
  unaryByPrev(t: i32): boolean {
    const p = this.prev(t);
    if (p < 0) {
      return true;
    }
    const pk = this.k(p);
    const pt = this.ty(p);
    if (
      pt === TT_CONDITIONAL_EXPR ||
      pt === TT_CAST_RPAREN ||
      pt === TT_UNARY_OPERATOR ||
      pt === TT_BINARY_OPERATOR ||
      pt === TT_TEMPLATE_OPENER
    ) {
      return true;
    }
    switch (pk) {
      case P_LPAREN:
      case P_COMMA:
      case P_COLON:
      case P_SEMI:
      case P_EQUAL:
      case P_QUESTION:
      case P_LSQUARE:
      case P_LBRACE:
      case KW_CASE:
      case KW_DELETE:
      case KW_RETURN:
      case KW_THROW:
      case KW_SIZEOF:
      case KW_CO_AWAIT:
      case KW_CO_YIELD:
      case KW_CO_RETURN:
        return true;
      default:
        return false;
    }
  }

  /** Pointer/reference declarator, prefix operator, or binary operator. */
  /** `(*name)(...)`: marks `(` at `o` (closed by `c`) as a function type's. */
  markFunctionType(o: i32, c: i32): void {
    const d = this.d;
    const f = this.next(o);
    if (f < 0 || f === c) {
      return;
    }
    // clang-format's lParenStartsCppCast: never the parens of
    // `static_cast<T>(...)` and the other named casts.
    const g = this.prev(o);
    if (g >= 0 && this.ty(g) === TT_TEMPLATE_CLOSER && clAt(d.match, g) >= 0 && clAt(d.match, g) < g) {
      const mp = this.prev(clAt(d.match, g));
      const ck = mp >= 0 ? this.k(mp) : -1;
      if (ck === KW_STATIC_CAST || ck === KW_CONST_CAST || ck === KW_DYNAMIC_CAST || ck === KW_REINTERPRET_CAST) {
        return;
      }
    }
    // `(&)`, `(*)`, `(C::*)` make a function or array type whatever the
    // context (clang-format 23's parseParens; a pointer, not a block's `^`).
    const last = clAt(d.prv, c);
    const bare = this.isPtrKind(last) && (clAt(d.prv, last) === o || this.k(clAt(d.prv, last)) === P_COLONCOLON);
    if (this.level(this.depth).expr === 1 && !bare) {
      return;
    }
    // A `*`/`&` first, or after a `::` (a pointer to member: `(C::*)`).
    let ptr = false;
    for (let q = f; q >= 0 && q !== c; q = this.next(q)) {
      const qk = this.k(q);
      if (qk === P_STAR || qk === P_AMP || qk === P_AMPAMP || qk === P_CARET) {
        // (Right after them: a comment between hides the `(` or `::`.)
        const qp = clAt(d.prv, q);
        if (qp === o || (qp >= 0 && this.k(qp) === P_COLONCOLON)) {
          ptr = true;
          break;
        }
      }
      if (clAt(d.match, q) > q) {
        q = clAt(d.match, q);
      }
    }
    if (!ptr) {
      return;
    }
    if (!bare) {
      for (let q = f; q >= 0 && q !== c; q = this.next(q)) {
        if (clAt(d.match, q) > q) {
          q = clAt(d.match, q);
          continue;
        }
        if (this.k(q) === P_COMMA) {
          return;
        }
      }
    }
    // (The token right after `)`: a comment there hides what follows.)
    const n = clAt(d.nxt, c);
    if (
      n >= 0 &&
      (this.k(n) === P_LPAREN ||
        (this.k(n) === P_LSQUARE && (clAt(d.lMustDecl, this.line) === 1 || isTypeName(d, this.prev(o)))))
    ) {
      this.set(o, TT_FUNCTION_TYPE_LPAREN);
    }
  }

  /** Whether `t` sits in a requires clause: in its parens, or after `requires` at its depth. */
  /** Whether `(` at `t`, after `requires`, opens a requires expression's parameter list. */
  requiresExprParen(t: i32): boolean {
    const rq = this.prev(t);
    return rq >= 0 && !requiresIsClause(this.d, rq);
  }

  /**
   * Whether `t` (`*`, `&` or `&&`) sits in a requires clause's parentheses,
   * at any depth, with no `<` left open before it at any of their levels:
   * a binary operator (clang-format 23's parseParens, StarAndAmpTokenType).
   */
  inRequiresParens(t: i32, dep: i32): boolean {
    const d = this.d;
    // (A level past the stack: the walk below would read its opener.)
    if (dep >= MAXD) {
      fault();
      return false;
    }

    for (let x = dep; x > 0; x--) {
      const o = this.level(x).open;
      const op = this.prev(o);
      if (clAt(d.kind, o) === P_LPAREN && op >= 0 && this.k(op) === KW_REQUIRES && !this.requiresExprParen(o)) {
        // Each level from here in: its `<`s (less any `>`s) before the next
        // level's `(`, or before `t`. (A braced list or a lambda's brackets
        // are read whole, their tokens untyped.)
        for (let y = x; y <= dep; y++) {
          const yk = clAt(d.kind, this.level(y).open);
          if (yk === P_LBRACE || yk === P_LSQUARE) {
            return false;
          }
          if (yk !== P_LPAREN) {
            continue;
          }
          let end = t;
          for (let z = y + 1; z <= dep; z++) {
            if (clAt(d.kind, this.level(z).open) === P_LPAREN) {
              end = this.level(z).open;
              break;
            }
          }
          let excess = 0;
          for (let q = clAt(d.nxt, this.level(y).open); q >= 0 && q !== end; q = clAt(d.nxt, q)) {
            const k = this.k(q);
            if (
              (k === P_LPAREN || k === P_LBRACE || k === P_LSQUARE) &&
              clAt(d.match, q) > q &&
              clAt(d.match, q) < end
            ) {
              q = clAt(d.match, q);
            } else if (k === P_LESS) {
              if (excess >= CL_I32_MAX) {
                fault();
                return false;
              }
              excess++;
            } else if (k === P_GREATER && excess > 0) {
              excess--;
            }
          }
          if (excess > 0) {
            return false;
          }
        }
        return true;
      }
    }
    return false;
  }

  inRequiresClause(t: i32, dep: i32): boolean {
    const d = this.d;
    for (let q = this.prev(t); q >= 0; q = this.prev(q)) {
      const k = this.k(q);
      if (clAt(d.match, q) >= 0 && clAt(d.match, q) < q) {
        q = clAt(d.match, q);
        continue;
      }
      if (k === KW_REQUIRES) {
        return t < this.requiresClauseEnd(q);
      }
      if (k === P_SEMI || k === P_LBRACE || k === P_LPAREN || k === P_LSQUARE || k === P_COMMA || k === P_EQUAL) {
        return false;
      }
    }
    return false;
  }

  /** Whether token `p` is the last of a requires clause (clang-format's ClosesRequiresClause). */
  closesRequiresClause(p: i32): boolean {
    const d = this.d;
    if (!this.lineHasRequires) {
      return false;
    }
    // (From a closing bracket, its opener: the walk stays outside it.)
    let q0 = p;
    if (clAt(d.match, q0) >= 0 && clAt(d.match, q0) < q0) {
      q0 = clAt(d.match, q0);
    }
    for (let q = this.prev(q0); q >= 0; q = this.prev(q)) {
      const k = this.k(q);
      if (clAt(d.match, q) >= 0 && clAt(d.match, q) < q) {
        q = clAt(d.match, q);
        continue;
      }
      if (k === KW_REQUIRES) {
        const e = this.requiresClauseEnd(q);
        const n = this.next(p);
        return e > p && (n < 0 || n >= e);
      }
      if (k === P_SEMI || k === P_LBRACE || k === P_RBRACE || k === P_LPAREN || k === P_LSQUARE || k === P_COMMA) {
        return false;
      }
    }
    return false;
  }

  /**
   * The first token after the requires clause that `requires` (token `rq`)
   * starts: primaries (`(...)`, names with `::` and `<...>`) joined by `&&`
   * and `||`, as clang-format's parseConstraintExpression reads it.
   */
  requiresClauseEnd(rq: i32): i32 {
    const d = this.d;
    let i = this.next(rq);
    while (i >= 0) {
      while (i >= 0 && this.k(i) === P_EXCLAIM) {
        i = this.next(i);
      }
      if (i < 0) {
        return d.ntok;
      }
      if (this.k(i) === P_LPAREN) {
        if (clAt(d.match, i) < 0) {
          return d.ntok;
        }
        i = this.next(clAt(d.match, i));
      } else {
        let any = false;
        while (i >= 0 && (isWordKind(this.k(i)) || this.k(i) === P_COLONCOLON)) {
          // A word continues the clause only right after `::`, `&&`, `||`,
          // `!`, `requires` or `=` (a comment before it ends the clause).
          if (isWordKind(this.k(i))) {
            const rp = clAt(d.prv, i);
            const rk = rp >= 0 ? this.k(rp) : -1;
            if (
              !(
                rk === P_COLONCOLON ||
                rk === P_AMPAMP ||
                rk === P_PIPEPIPE ||
                rk === P_EXCLAIM ||
                rk === KW_REQUIRES ||
                rk === P_EQUAL
              )
            ) {
              break;
            }
          }
          any = true;
          i = this.next(i);
          if (i >= 0 && (this.k(i) === P_LESS || this.k(i) === P_LPAREN) && clAt(d.match, i) > i) {
            i = this.next(clAt(d.match, i));
          }
        }
        if (!any) {
          return i < 0 ? d.ntok : i;
        }
      }
      if (i >= 0 && (this.k(i) === P_AMPAMP || this.k(i) === P_PIPEPIPE)) {
        i = this.next(i);
        continue;
      }
      break;
    }
    return i < 0 ? d.ntok : i;
  }

  starRole(t: i32, inExpr: boolean, inTmpl: boolean): i32 {
    const p = this.prev(t);
    if (p < 0) {
      return TT_UNARY_OPERATOR;
    }
    if (isTypeName(this.d, p)) {
      return TT_POINTER_OR_REFERENCE;
    }
    if ((this.k(p) === KW_NEW || this.k(p) === KW_DELETE) && this.k(t) === P_AMPAMP) {
      return TT_BINARY_OPERATOR;
    }
    const n = this.next(t);
    if (n < 0) {
      return TT_POINTER_OR_REFERENCE;
    }
    const nk = this.k(n);
    if (nk === P_GREATER) {
      return TT_POINTER_OR_REFERENCE;
    }
    if (inTmpl && nk === KW_NOEXCEPT) {
      return TT_BINARY_OPERATOR;
    }
    if (
      nk === P_ARROW ||
      nk === P_EQUAL ||
      nk === P_COMMA ||
      nk === P_RPAREN ||
      nk === P_SEMI ||
      (nk === KW_NOEXCEPT && !inExpr) ||
      nk === KW_CONST ||
      nk === KW_VOLATILE ||
      isPointerQualifierWord(this.d, n) ||
      (nk === P_LBRACE && this.next(n) < 0) ||
      (nk === KW_REQUIRES && requiresIsClause(this.d, n))
    ) {
      return TT_POINTER_OR_REFERENCE;
    }
    const pk = this.k(p);
    if (pk === P_COLONCOLON) {
      return TT_POINTER_OR_REFERENCE;
    }
    // After `decltype(...)` or `typeof(...)`: a type.
    if (pk === P_RPAREN && clAt(this.d.match, p) >= 0) {
      const mp = this.prev(clAt(this.d.match, p));
      if (mp >= 0 && (this.k(mp) === KW_DECLTYPE || this.k(mp) === KW_TYPEOF)) {
        return TT_POINTER_OR_REFERENCE;
      }
    }
    if (this.unaryByPrev(t)) {
      return TT_UNARY_OPERATOR;
    }
    if (nk === P_LSQUARE && this.ty(n) !== TT_LAMBDA_LSQUARE) {
      return TT_POINTER_OR_REFERENCE;
    }
    if (nk === KW_OPERATOR && !inExpr) {
      return TT_POINTER_OR_REFERENCE;
    }
    if (pk === P_RBRACE && this.k(t) === P_STAR && clAt(this.d.match, p) < 0) {
      return TT_POINTER_OR_REFERENCE;
    }
    if (this.isLit(p) || pk === P_RPAREN || pk === P_RSQUARE || pk === KW_TRUE || pk === KW_FALSE || pk === P_RBRACE) {
      return TT_BINARY_OPERATOR;
    }
    let q = n;
    while (q >= 0 && this.k(q) === P_LPAREN) {
      q = this.next(q);
    }
    if (q >= 0) {
      const qk = this.k(q);
      if (
        this.isLit(q) ||
        qk === KW_TRUE ||
        qk === KW_FALSE ||
        qk === P_PLUS ||
        qk === P_MINUS ||
        qk === P_EXCLAIM ||
        qk === P_TILDE ||
        qk === P_PLUSPLUS ||
        qk === P_MINUSMINUS ||
        qk === KW_SIZEOF ||
        qk === KW_ALIGNOF
      ) {
        return TT_BINARY_OPERATOR;
      }
    }
    if (inTmpl && isIdentKind(nk)) {
      return TT_BINARY_OPERATOR;
    }
    if (this.k(t) === P_AMPAMP && (nk === P_LPAREN || nk === P_STAR || nk === P_AMP)) {
      return TT_BINARY_OPERATOR;
    }
    // `aaa && aaa->f()`; `width * height * length`, which makes the second
    // `*` a multiplication too.
    if (isIdentKind(nk)) {
      const nn = this.next(n);
      if (nn >= 0 && this.k(nn) === P_ARROW) {
        return TT_BINARY_OPERATOR;
      }
      if (nn >= 0 && this.isPtrKind(nn) && !this.objcLifetimeQualifier(n)) {
        this.set(nn, TT_BINARY_OPERATOR);
        return TT_BINARY_OPERATOR;
      }
    }
    if (inExpr) {
      return TT_BINARY_OPERATOR;
    }
    // At class scope it is a member's pointer or reference.
    if (this.inClass) {
      return TT_POINTER_OR_REFERENCE;
    }
    // `a & b;`: more likely operator& than an uninitialized reference.
    if (this.k(t) === P_AMP && isIdentKind(pk) && this.chainedAmpOrMember(this.prev(p)) && isIdentKind(nk)) {
      const nn = this.next(n);
      if (nn >= 0 && (this.chainedAmpOrMember(nn) || this.k(nn) === P_SEMI)) {
        return TT_BINARY_OPERATOR;
      }
    }
    return TT_POINTER_OR_REFERENCE;
  }

  /** `__strong`, `__weak`, ...: clang-format's isObjCLifetimeQualifier, in a file it may read as Objective-C. */
  objcLifetimeQualifier(t: i32): boolean {
    const d = this.d;
    return (
      d.objcLang &&
      (d.is(t, "__autoreleasing") || d.is(t, "__strong") || d.is(t, "__weak") || d.is(t, "__unsafe_unretained"))
    );
  }

  /** Whether `t` is absent, `&` or a member access (clang-format's IsChainedOperatorAmpOrMember). */
  chainedAmpOrMember(t: i32): boolean {
    if (t < 0) {
      return true;
    }
    const k = this.k(t);
    return k === P_AMP || k === P_PERIOD || k === P_ARROW || k === P_ARROWSTAR || k === P_PERIODSTAR;
  }

  /** Whether `(` at `t` (whose previous token is `p`) holds an expression. */
  parenIsExpr(t: i32, outer: i32): i32 {
    const d = this.d;
    // After a unary `^`: an Objective-C block's parameters (CaretFound).
    const dep = this.depth;
    if (dep > 0 && this.level(dep - 1).caret === 1 && clAt(d.inPP, t) === 0) {
      return 0;
    }
    const p = this.prev(t);
    const pk = this.k(p);
    // (In a directive clang-format reads parentheses after a keyword as an
    // expression first, `for` and `catch` included.)
    if ((pk === KW_FOR || pk === KW_CATCH) && clAt(d.inPP, t) === 0) {
      return 0;
    }
    // A foreach macro's first argument is a declaration.
    if (p >= 0 && isForEachMacro(d, p)) {
      return 0;
    }
    // An operator's parameters (`operator,(T &&t)`), unless it is called as a member.
    if (this.ty(t) === TT_OVERLOADED_OPERATOR_LPAREN) {
      let o = p;
      while (o >= 0 && this.k(o) !== KW_OPERATOR) {
        o = this.prev(o);
      }
      const op = o >= 0 ? this.prev(o) : -1;
      return op >= 0 && (this.k(op) === P_PERIOD || this.k(op) === P_ARROW) ? 1 : 0;
    }
    // A block literal's parameter list: `^(T *x) { ... }`.
    if (pk === P_CARET && this.unaryByPrev(p)) {
      return 0;
    }
    // A requires expression's parameter list: `requires(T &t) { ... }`.
    if (pk === KW_REQUIRES && this.requiresExprParen(t)) {
      return 0;
    }
    // (A `<` is a binary operator to clang-format until its `>` is found.)
    if (
      pk === KW_GENERIC ||
      pk === KW_IF ||
      (pk === KW_CONSTEXPR && this.k(this.prev(p)) === KW_IF) ||
      pk === KW_WHILE ||
      pk === KW_SWITCH ||
      pk === KW_NOEXCEPT ||
      pk === P_LPAREN ||
      pk === P_COMMA ||
      this.ty(p) === TT_BINARY_OPERATOR ||
      pk === P_LESS ||
      pk === KW_DECLTYPE ||
      pk === KW_TYPEOF ||
      pk === KW_RETURN
    ) {
      return 1;
    }
    // A lambda's parameter list (past any `<...>`).
    let lp = p;
    if (
      pk === P_GREATER &&
      clAt(d.match, p) >= 0 &&
      clAt(d.match, p) < p &&
      this.ty(clAt(d.match, p)) === TT_TEMPLATE_OPENER
    ) {
      lp = this.prev(clAt(d.match, p));
    }
    if (
      lp >= 0 &&
      this.k(lp) === P_RSQUARE &&
      clAt(d.match, lp) >= 0 &&
      this.ty(clAt(d.match, lp)) === TT_LAMBDA_LSQUARE
    ) {
      return 0;
    }
    // In a directive (a macro body), parens after a name keep the outer
    // context; any other parens hold an expression. So do a name's, on a
    // body line inside one of the macro's braces that need not be a
    // declaration (parseParens: `Line.InMacroBody && !Scopes.empty()`).
    if (clAt(d.inPP, t) === 1) {
      if (!(p >= 0 && isIdentKind(pk))) {
        return 1;
      }
      return this.macroScope && clAt(d.lMustDecl, this.line) === 0 ? 1 : outer;
    }
    // After a function type's parentheses (`(*fn)(...)`): parameters.
    if (
      pk === P_RPAREN &&
      clAt(d.match, p) >= 0 &&
      clAt(d.match, p) < p &&
      this.ty(clAt(d.match, p)) === TT_FUNCTION_TYPE_LPAREN
    ) {
      return 0;
    }
    if (clAt(d.lMustDecl, this.line) === 0) {
      return 1;
    }
    return outer;
  }

  /** Classifies line `l` and, recursively, its children. */
  classifyLine(l: i32): void {
    const d = this.d;
    this.line = l;
    // (Lines are classified again later: the scope is kept per line.)
    this.inClass = clAt(d.lInClass, l) === 1;
    this.first = clAt(d.lFirst, l);
    this.lineHasRequires = false;
    this.lineHasOperator = false;
    this.lineHasStarSquare = false;
    const lt = clAt(d.lType, l);
    const pk = clAt(d.ppKind, this.first);
    if (
      lt === LT_IMPORT ||
      (lt === LT_PREPROCESSOR &&
        pk !== PP_DEFINE &&
        pk !== PP_IF &&
        pk !== PP_ELIF &&
        pk !== PP_PRAGMA &&
        pk !== PP_OTHER)
    ) {
      for (let t = this.first; t >= 0; t = clAt(d.nxt, t)) {
        clSet(d.nest, t, 0);
        if (clAt(d.kind, t) === K_COMMENT) {
          clSet(d.type, t, clCommentType(d, t));
        }
      }
      return;
    }
    const fk = this.k(this.first);
    const lineIsTemplate = fk === KW_TEMPLATE;
    const lineIsUsing = fk === KW_USING;
    // The level stack: every level index below is tested against it before use.
    const lv = this.lv;
    if (lv.length < 1) {
      fault();
      return;
    }
    const top = lv[0];
    this.depth = 0;
    top.open = -1;
    // `#if` and `#elif` conditions are expressions.
    top.expr = lt === LT_PREPROCESSOR && (pk === PP_IF || pk === PP_ELIF) ? 1 : 0;
    // (An #if condition stays an expression after any parentheses close.)
    top.asg = top.expr;
    top.tmpl = 0;
    top.ques = 0;
    top.afterNew = 0;
    top.caret = 0;
    top.sa = 0;
    top.bindAt = 1;
    let sawFnParams = false; // a top-level `(...)` that looks like parameters closed
    let autoFound = false; // an `auto` earlier on the line
    this.ctorSeen = false;
    // Brackets clang-format's annotator cannot match, or a line that starts
    // with `:`, which it cannot annotate either.
    let invalid = this.first >= 0 && clAt(d.kind, this.first) === P_COLON;
    let afterHeader = false; // past `__has_include(<...>`: the rest is implicit
    const implicitOk = d.anyImplicit;
    // An Objective-C method declaration (clang-format's LT_ObjCMethodDecl).
    const objcMethod = clAt(d.lObjC, l) === 1 && (this.k(this.first) === P_MINUS || this.k(this.first) === P_PLUS);
    for (let t = this.first; t >= 0; t = clAt(d.nxt, t)) {
      clSet(d.match, t, -1);
      const k0 = clAt(d.kind, t);
      if (k0 === KW_REQUIRES) {
        this.lineHasRequires = true;
      } else if (k0 === KW_OPERATOR) {
        this.lineHasOperator = true;
      } else if (k0 === P_STAR && clAt(d.nxt, t) >= 0 && clAt(d.kind, clAt(d.nxt, t)) === P_LSQUARE) {
        this.lineHasStarSquare = true;
      }
      if (clAt(d.final, t) === 0) {
        // A stray character (`\`, a backtick) is an implicit string literal.
        clSet(
          d.type,
          t,
          implicitOk && (k0 === K_UNKNOWN || k0 === P_BACKSLASH || afterHeader) && k0 !== K_COMMENT
            ? TT_IMPLICIT_STRING_LITERAL
            : TT_UNKNOWN,
        );
      }
      // clang-format's parseHasInclude: every token after the header's `<`
      // but comments is an implicit string literal.
      if (implicitOk && k0 === K_HEADER && clAt(d.inPP, t) === 1) {
        const p = clAt(d.prv, t);
        if (
          p >= 0 &&
          clAt(d.kind, p) === P_LPAREN &&
          clAt(d.prv, p) >= 0 &&
          clAt(d.kind, clAt(d.prv, p)) === CW_HAS_INCLUDE
        ) {
          afterHeader = true;
        }
      }
    }
    for (let t = this.first; t >= 0; t = clAt(d.nxt, t)) {
      const k = clAt(d.kind, t);
      const dep = this.depth;
      // (A `<` may push a level past the stack; the old read of the
      // level's binding below panicked there.)
      if (dep < 0 || dep >= lv.length) {
        fault();
        return;
      }
      const L = lv[dep]; // this token's level (`N` below: one it opens)

      clSet(d.nest, t, dep);
      clSet(d.bind, t, L.bindAt);
      if (k === K_COMMENT) {
        this.set(t, clCommentType(d, t));
        continue;
      }
      // `for` not followed by `(` (after an optional `co_await`): clang-format's
      // annotator gives up on the line.
      if (k === KW_FOR && clAt(d.lType, l) !== LT_PREPROCESSOR) {
        let n = clAt(d.nxt, t);
        if (n >= 0 && clAt(d.kind, n) === KW_CO_AWAIT) {
          n = clAt(d.nxt, n);
        }
        if (n < 0 || clAt(d.kind, n) !== P_LPAREN) {
          invalid = true;
        }
      }
      if (k === KW_NEW) {
        L.afterNew = 1;
      }
      // clang-format's modifyContext: `assert` (a keyword to it) turns the
      // context off expression; its parentheses inherit that, unless they
      // are an expression by themselves (outside a directive, in a
      // statement).
      if (k === K_IDENT && d.is(t, "assert")) {
        L.expr = 0;
      }
      // After a lambda's `->` the context holds a type (clang-format's
      // TrailingReturnArrow sets IsExpression off).
      if (k === P_ARROW && clAt(d.type, t) === TT_LAMBDA_ARROW) {
        L.expr = 0;
      }
      const pv = clAt(d.prv, t);
      if (!this.ctorSeen && pv >= 0 && clAt(d.type, pv) === TT_CTOR_INITIALIZER_COLON) {
        this.ctorSeen = true;
      }
      // clang-format's parseParens: after a binary operator the parens hold
      // an expression; after `const`, `auto` or a type name they do not.
      if (dep > 0 && this.k(L.open) === P_LPAREN) {
        const pt = this.prev(t);
        if (pt >= 0 && pt !== L.open) {
          if (this.ty(pt) === TT_BINARY_OPERATOR) {
            L.expr = 1;
          }
          const ptk = this.k(pt);
          if (ptk === KW_CONST || ptk === KW_AUTO || isTypeName(d, pt)) {
            const n = clAt(d.nxt, t);
            const fnTypeParen =
              k === P_LPAREN && n >= 0 && (this.k(n) === P_STAR || this.k(n) === P_AMP || this.k(n) === P_CARET);
            if (!(k === P_LBRACE || (k === P_LPAREN && !fnTypeParen))) {
              L.expr = 0;
            }
          }
        }
      }
      if (binPrecedence(k) === PREC_ASSIGNMENT && !lineIsUsing && fk !== KW_RETURN) {
        const p = this.prev(t);
        if (
          !(lineIsTemplate && (dep > 0 ? !this.templateParamDefault(t, dep) : this.templateDeclKeyword())) &&
          !(p >= 0 && (this.k(p) === P_LSQUARE || this.k(p) === KW_OPERATOR))
        ) {
          L.expr = 1;
          L.asg = 1;
          // What precedes an initializer is a declarator: `T *x = ...`.
          if (this.ty(this.first) !== TT_UNARY_OPERATOR) {
            let q = p;
            while (
              q >= 0 &&
              clAt(d.prv, q) >= 0 &&
              !(this.k(clAt(d.prv, q)) === P_COMMA || this.k(clAt(d.prv, q)) === P_SEMI)
            ) {
              const qk = this.k(q);
              if (
                (qk === P_RSQUARE || qk === P_RPAREN || qk === P_GREATER) &&
                clAt(d.match, q) >= 0 &&
                clAt(d.match, q) < q
              ) {
                q = clAt(d.match, q);
              }
              // (Its opener stops the walk too, as in clang-format.)
              const ok = this.k(q);
              if (ok === P_LPAREN || ok === P_LSQUARE || ok === P_LBRACE || this.ty(q) === TT_TEMPLATE_OPENER) {
                break;
              }
              if (
                (this.ty(q) === TT_BINARY_OPERATOR || this.ty(q) === TT_UNARY_OPERATOR) &&
                this.isPtrKind(q) &&
                clAt(d.prv, q) >= 0 &&
                this.k(clAt(d.prv, q)) !== P_EQUAL
              ) {
                clSet(d.type, q, TT_POINTER_OR_REFERENCE);
              }
              q = clAt(d.prv, q);
            }
          }
        }
      }
      switch (k) {
        case P_LPAREN:
        case P_LSQUARE:
        case P_LBRACE: {
          this.subObjC = -1;
          if (k === P_LSQUARE && clAt(d.type, t) !== TT_LAMBDA_LSQUARE) {
            const n = clAt(d.nxt, t);
            const p = this.prev(t);
            if (this.isCppAttribute(t)) {
              this.set(t, TT_ATTRIBUTE_SQUARE);
              this.set(n, TT_ATTRIBUTE_SQUARE);
            } else if (p >= 0 && this.ty(p) === TT_ATTRIBUTE_SQUARE && this.k(p) === P_LSQUARE) {
              // inner of `[[`
            } else if (
              dep > 0 &&
              this.k(L.open) === P_LBRACE &&
              p >= 0 &&
              (this.k(p) === P_LBRACE || this.k(p) === P_COMMA)
            ) {
              this.set(t, TT_DESIGNATED_INITIALIZER_LSQUARE);
              this.subscriptColon(t);
            } else if (
              p >= 0 &&
              (this.k(p) === KW_AUTO ||
                ((this.k(p) === KW_CONST ||
                  this.k(p) === KW_VOLATILE ||
                  this.k(p) === P_AMP ||
                  this.k(p) === P_AMPAMP) &&
                  autoBeforeQualifiers(d, p)))
            ) {
              // A structured binding: no subscript (it binds as any bracket).
            } else if (this.lineStartsWithAsm()) {
              // clang-format's InsideInlineASM: an operand's symbolic name.
              this.set(t, TT_INLINE_ASM_SYMBOLIC_NAME_LSQUARE);
            } else if (this.startsObjCExpr(t, p, dep) && this.listCommaBeforeColon(t)) {
              // clang-format's parseSquare: an Objective-C message expression
              // that holds a `,` before any `:` is a container literal.
              this.set(t, TT_ARRAY_INITIALIZER_LSQUARE);
            } else if (this.startsObjCExpr(t, p, dep) && this.messageColon(t)) {
              // A message with arguments: `[obj sel:arg]`.
              this.set(t, TT_OBJC_METHOD_EXPR);
            } else if (this.startsObjCExpr(t, p, dep)) {
              // An Objective-C message to clang-format (or, with `(` after
              // the `]` or one token inside, nothing): no subscript.
            } else if (
              n >= 0 &&
              this.k(n) === P_RSQUARE &&
              p >= 0 &&
              (this.ty(p) === TT_BINARY_OPERATOR ||
                this.k(p) === P_AT ||
                this.k(p) === P_COMMA ||
                this.k(p) === P_LPAREN ||
                this.k(p) === P_LSQUARE ||
                this.k(p) === P_QUESTION ||
                this.k(p) === P_COLON ||
                this.k(p) === KW_RETURN ||
                this.k(p) === KW_DEFAULT)
            ) {
              // `f([](...) ...)` with no lambda body (in a macro): an empty
              // container literal to clang-format's parseSquare.
              this.set(t, TT_ARRAY_INITIALIZER_LSQUARE);
            } else if (dep === 0 && p >= 0 && this.k(p) === P_COMMA) {
              // After a top-level `,` clang-format starts an Objective-C
              // message expression: no subscript.
            } else {
              this.set(t, TT_ARRAY_SUBSCRIPT_LSQUARE);
              this.subscriptColon(t);
            }
          }
          if (k === P_LPAREN) {
            const p = this.prev(t);
            if (p >= 0 && this.k(p) === KW_ATTRIBUTE) {
              clSet(d.type, t, TT_UNKNOWN);
            }
          }
          const nd = dep + 1;
          if (nd >= MAXD) {
            d.failed = true;
            return;
          }
          // (The stack is MAXD long.)
          if (nd >= lv.length) {
            fault();
            return;
          }
          const N = lv[nd];
          this.depth = nd;
          N.open = t;
          N.asg = 0;
          N.tmpl = 0;
          N.ques = 0;
          N.afterNew = 0;
          N.caret = 0;
          N.sa = k === P_LPAREN && this.k(this.prev(t)) === KW_STATIC_ASSERT ? 1 : 0;
          if (k === P_LPAREN) {
            N.expr = this.parenIsExpr(t, L.expr);
          } else {
            N.expr = 1;
          }
          N.asg = N.expr;
          // (A level binds at most 12 more than the one outside it, so with
          // MAXD levels the sum stays far below 2^30.)
          const outerBind = L.bindAt;
          if (outerBind >= 1073741824) {
            fault();
            return;
          }
          if (k === P_LSQUARE && (clAt(d.type, t) === TT_ARRAY_SUBSCRIPT_LSQUARE || this.subObjC === t)) {
            N.bindAt = outerBind + 10;
          } else {
            N.bindAt = outerBind + 1;
          }
          break;
        }
        case P_RPAREN:
        case P_RSQUARE:
        case P_RBRACE: {
          // Close the innermost matching level (template levels left open
          // by a stray `<` are dropped).
          let dd = dep;
          while (dd > 0 && dd <= dep) {
            const o = lv[dd].open;
            const ok = this.k(o);
            if (
              (k === P_RPAREN && ok === P_LPAREN) ||
              (k === P_RSQUARE && ok === P_LSQUARE) ||
              (k === P_RBRACE && ok === P_LBRACE)
            ) {
              break;
            }
            dd--;
          }
          if (dd > 0) {
            // Closing across an open `(`, `[` or `{` breaks the line for
            // clang-format (only stray `<` levels may be dropped).
            for (let x = dd + 1; x <= dep && x < lv.length; x++) {
              if (this.k(lv[x].open) !== P_LESS) {
                invalid = true;
              }
            }
            const D = lv[dd];
            const o = D.open;
            clSet(d.match, o, t);
            clSet(d.match, t, o);
            clSet(d.nest, t, dd);
            clSet(d.bind, t, D.bindAt);
            this.depth = dd - 1;
            if (k === P_RPAREN && objcMethod && this.prev(o) === this.first) {
              // The return type's parentheses: a cast's to clang-format.
              clSet(d.type, t, TT_CAST_RPAREN);
            }
            if (k === P_RPAREN) {
              this.markFunctionType(o, t);
              const op = this.prev(o);
              if (op >= 0 && this.k(op) === KW_ATTRIBUTE) {
                this.set(t, TT_ATTRIBUTE_RPAREN);
              }
              // `decltype(...)` and `typeof(...)` name a type: not a parameter list.
              if (
                this.depth === 0 &&
                clAt(d.lMustDecl, l) === 1 &&
                top.expr === 0 &&
                !(
                  op >= 0 &&
                  (this.k(op) === KW_ATTRIBUTE ||
                    this.k(op) === KW_REQUIRES ||
                    this.k(op) === KW_DECLTYPE ||
                    this.k(op) === KW_TYPEOF)
                )
              ) {
                sawFnParams = true;
                clSet(d.lMightFn, l, 1);
              }
            }
            if (k === P_RSQUARE && this.ty(o) === TT_ATTRIBUTE_SQUARE) {
              this.set(t, TT_ATTRIBUTE_SQUARE);
            }
          } else if (k !== P_RBRACE || (t !== this.first && !this.startsDefineBody(t))) {
            // A closer with no opener (a line may start with `}`, as may a
            // `#define`'s body joined onto it).
            invalid = true;
          }
          // clang-format's modifyContext types the `*` and `&` before a `)`,
          // `>` or `,` as declarators, but not before a `]` or `}`: the `&`
          // of a lambda's `[&]` stays a unary operator, before which no line
          // may break.
          if (k === P_RPAREN) {
            this.markPtrRun(t);
          }
          if (clAt(d.lMustDecl, l) === 1 && !this.ctorSeen) {
            // (The level the closer returned to, at or below `dep`.)
            const cur = this.depth;
            if (cur < 0 || cur >= lv.length) {
              fault();
              return;
            }
            const C = lv[cur];
            C.expr = C.asg;
          }
          break;
        }
        case P_LESS: {
          const p = this.prev(t);
          let isTmpl = false;
          // A `<` that starts a line may open a template too (clang-format
          // only checks the token before when there is one).
          if (p >= 0 || t === this.first) {
            const pk = p >= 0 ? this.k(p) : 0;
            const okPrev =
              p < 0 ||
              !(
                this.isLit(p) ||
                pk === P_RBRACE ||
                (pk === P_RPAREN &&
                  dep > 0 &&
                  !(clAt(d.match, p) >= 0 && this.ty(clAt(d.match, p)) === TT_OVERLOADED_OPERATOR_LPAREN)) ||
                pk === KW_OPERATOR
              );
            if (okPrev) {
              const c = this.findCloser(t, L.expr === 1, dep > 0 && this.ty(L.open) === TT_TEMPLATE_OPENER, L.sa === 1);
              if (c >= 0) {
                isTmpl = true;
                this.set(t, TT_TEMPLATE_OPENER);
                this.set(c, TT_TEMPLATE_CLOSER);
                clSet(d.match, t, c);
                clSet(d.match, c, t);
                const nd = dep + 1;
                // (No MAXD test here: a level past the stack faults.)
                const outerBind = L.bindAt;
                if (nd >= lv.length || outerBind >= 1073741824) {
                  fault();
                  return;
                }
                const N = lv[nd];
                this.depth = nd;
                N.open = t;
                N.asg = 0;
                N.expr = 0;
                N.tmpl = pk === KW_TEMPLATE ? 0 : 1;
                N.ques = 0;
                N.afterNew = 0;
                N.caret = 0;
                N.sa = 0;
                N.bindAt = outerBind + 12;
              }
            }
            if (pk === KW_OPERATOR) {
              this.set(t, TT_OVERLOADED_OPERATOR);
              isTmpl = true;
            }
          }
          if (!isTmpl) {
            this.set(t, TT_BINARY_OPERATOR);
          }
          break;
        }
        case P_GREATER: {
          if (this.ty(t) === TT_TEMPLATE_CLOSER && dep > 0 && L.open === clAt(d.match, t)) {
            clSet(d.nest, t, dep);
            clSet(d.bind, t, L.bindAt);
            this.depth = dep - 1;
            this.markPtrRun(t);
          } else if (this.ty(t) !== TT_OVERLOADED_OPERATOR) {
            this.set(t, TT_BINARY_OPERATOR);
          }
          break;
        }
        case P_STAR:
        case P_AMP:
        case P_AMPAMP:
          if (this.ty(t) === TT_UNKNOWN) {
            if (
              (this.lineHasRequires && this.inRequiresParens(t, dep)) ||
              (k === P_AMPAMP && this.inRequiresClause(t, dep))
            ) {
              this.set(t, TT_BINARY_OPERATOR);
            } else {
              const inExpr = (L.expr === 1 && L.afterNew === 0) || L.sa === 1;
              this.set(t, this.starRole(t, inExpr, L.tmpl === 1));
            }
          }
          break;
        case P_PLUS:
        case P_MINUS:
        case P_CARET:
          if (objcMethod && t === this.first) {
            clSet(d.type, t, TT_OBJC_METHOD_SPECIFIER);
            break;
          }
          if (this.ty(t) === TT_UNKNOWN) {
            this.set(t, this.unaryByPrev(t) ? TT_UNARY_OPERATOR : TT_BINARY_OPERATOR);
          }
          if (k === P_CARET && this.ty(t) === TT_UNARY_OPERATOR) {
            L.caret = 1;
          }
          break;
        case P_PLUSPLUS:
        case P_MINUSMINUS: {
          const p = this.prev(t);
          if (
            p >= 0 &&
            (this.k(p) === P_RPAREN || this.k(p) === P_RSQUARE || isIdentKind(this.k(p))) &&
            this.ty(p) !== TT_CAST_RPAREN
          ) {
            this.set(t, TT_TRAILING_UNARY_OPERATOR);
          } else {
            this.set(t, TT_UNARY_OPERATOR);
          }
          break;
        }
        case P_EXCLAIM:
        case P_TILDE:
          if (this.ty(t) === TT_UNKNOWN) {
            this.set(t, TT_UNARY_OPERATOR);
          }
          // clang-format: a `!` (not `operator!`) starts an expression.
          if (k === P_EXCLAIM && !(this.prev(t) >= 0 && this.k(this.prev(t)) === KW_OPERATOR)) {
            L.expr = 1;
          }
          break;
        case P_QUESTION: {
          this.set(t, TT_CONDITIONAL_EXPR);
          const pending = L.ques;
          if (pending >= CL_I32_MAX) {
            fault();
            return;
          }
          L.ques = pending + 1;
          L.expr = 1;
          break;
        }
        case P_COLON:
          if (objcMethod || (dep > 0 && this.k(L.open) === P_LSQUARE && this.ty(L.open) === TT_OBJC_METHOD_EXPR)) {
            // clang-format: every `:` of a method declaration ends a
            // selector part, and the word before it is that part.
            clSet(d.type, t, TT_OBJC_METHOD_EXPR);
            const p = this.prev(t);
            if (p >= 0 && isWordKind(this.k(p))) {
              clSet(d.type, p, TT_SELECTOR_NAME);
            }
            break;
          }
          this.classifyColon(t, dep);
          break;
        case P_COMMA:
          L.sa = 0;
          this.markPtrRun(t);
          if (this.ty(this.prevCtorColon(t, dep)) === TT_CTOR_INITIALIZER_COLON) {
            this.set(t, TT_CTOR_INITIALIZER_COMMA);
          }
          // (Inside a constructor initializer list clang-format leaves it be.)
          if (clAt(d.lMustDecl, l) === 1 && !this.ctorSeen) {
            L.expr = 0;
          }
          // A braced list's comma starts an expression again (parseBrace's
          // IsBracedListComma).
          if (dep > 0 && this.k(L.open) === P_LBRACE && clAt(d.bk, L.open) === BK_BRACED_INIT) {
            L.expr = 1;
          }
          // A foreach macro's arguments after the first are expressions.
          if (
            dep > 0 &&
            this.k(L.open) === P_LPAREN &&
            this.prev(L.open) >= 0 &&
            isForEachMacro(d, this.prev(L.open))
          ) {
            L.expr = 1;
          }
          break;
        case P_PERIOD: {
          const p = this.prev(t);
          if (p >= 0 && (this.k(p) === P_COMMA || this.k(p) === P_LBRACE)) {
            this.set(t, TT_DESIGNATED_INITIALIZER_PERIOD);
          }
          break;
        }
        case P_SEMI:
          // clang-format's modifyContext: what follows a `;` is an
          // expression (a for loop's condition, an if's after its initializer).
          L.expr = 1;
          if (dep > 0 && this.isIfParen(L.open)) {
            // parseParens(IsIf): an if's initializer is a declaration; every
            // `*`, `&` and `&&` before its first `=`, `(` or `{` is a pointer.
            for (let q = clAt(d.nxt, L.open); q >= 0 && q !== t; q = clAt(d.nxt, q)) {
              const qk = this.k(q);
              if (qk === P_EQUAL || qk === P_LPAREN || qk === P_LBRACE) {
                break;
              }
              if (qk === P_STAR || qk === P_AMP || qk === P_AMPAMP) {
                clSet(d.type, q, TT_POINTER_OR_REFERENCE);
                clSet(d.final, q, 1);
              }
            }
          }
          break;
        case KW_RETURN:
        case KW_THROW:
        case KW_CASE:
        case KW_CO_AWAIT:
        case KW_CO_YIELD:
        case KW_CO_RETURN:
          L.expr = 1;
          break;
        case P_LESSLESS:
          if (this.ty(t) !== TT_OVERLOADED_OPERATOR) {
            L.expr = 1;
            this.set(t, TT_BINARY_OPERATOR);
          }
          break;
        case KW_OPERATOR:
          this.markOperatorName(t);
          break;
        case KW_NEW:
          break;
        default:
          if (binPrecedence(k) > PREC_COMMA && this.ty(t) === TT_UNKNOWN) {
            const p = this.prev(t);
            if (!(p >= 0 && this.k(p) === P_LSQUARE)) {
              this.set(t, TT_BINARY_OPERATOR);
            }
          }
          // clang-format 23: a `=` whose innermost brace is an enum's is
          // TT_EnumEqual (consumeToken, `Scopes.back() == ST_Enum`).
          if (k === P_EQUAL && this.ty(t) !== TT_OVERLOADED_OPERATOR) {
            let x = dep;
            while (x > 0 && x <= dep && this.k(lv[x].open) !== P_LBRACE) {
              x--;
            }
            if (x > 0 && x <= dep && this.ty(lv[x].open) === TT_ENUM_LBRACE) {
              clSet(d.type, t, TT_ENUM_EQUAL);
              clSet(d.final, t, 1);
            }
          }
          break;
      }
      // The first selector part, right after the return type.
      if (objcMethod && isWordKind(k)) {
        const p = this.prev(t);
        if (
          p >= 0 &&
          this.k(p) === P_RPAREN &&
          this.ty(p) === TT_CAST_RPAREN &&
          clAt(d.match, p) >= 0 &&
          this.prev(clAt(d.match, p)) === this.first
        ) {
          clSet(d.type, t, TT_SELECTOR_NAME);
        }
      }
      // Names: an identifier following a type.
      if (
        isIdentKind(k) &&
        this.ty(t) === TT_UNKNOWN &&
        this.isStartOfName(t) &&
        !(sawFnParams && clAt(d.nest, t) === 0)
      ) {
        this.set(t, TT_START_OF_NAME);
      }
      if (
        sawFnParams &&
        clAt(d.nest, t) === 0 &&
        this.ty(t) === TT_UNKNOWN &&
        (isIdentKind(k) || k === KW_CONST || k === KW_NOEXCEPT) &&
        !this.afterEqualOrCtorInit(t)
      ) {
        this.set(t, TT_TRAILING_ANNOTATION);
      }
      if (k === P_RPAREN && this.ty(t) === TT_UNKNOWN && this.endsCast(t)) {
        this.set(t, TT_CAST_RPAREN);
      }
      if (k === KW_AUTO) {
        autoFound = true;
      }
      if (k === P_ARROW && this.ty(t) === TT_UNKNOWN) {
        const p = this.prev(t);
        if (
          p >= 0 &&
          (this.k(p) === KW_NOEXCEPT ||
            (this.k(p) === P_RBRACE && clAt(d.bk, p) === BK_BLOCK) ||
            (autoFound &&
              clAt(d.lMightFn, l) === 1 &&
              clAt(d.nest, t) === 0 &&
              this.k(p) !== K_IDENT &&
              this.k(p) !== KW_OPERATOR) ||
            this.isDeductionGuide(t))
        ) {
          this.set(t, TT_TRAILING_RETURN_ARROW);
        }
      }
    }
    // An unclosed `(` or `[` breaks the line too.
    // (Every push tested its level against the stacks.)
    const last0 = this.depth;
    if (last0 >= lv.length) {
      fault();
      return;
    }
    for (let x = 1; x <= last0 && x < lv.length; x++) {
      const ok = this.k(lv[x].open);

      if (ok === P_LPAREN || ok === P_LSQUARE) {
        invalid = true;
      }
    }
    clSet(d.lInvalid, l, invalid ? 1 : 0);
    // A directive line is annotated as a directive: no function declaration
    // (clang-format's parsePreprocessorDirective never sets one).
    if (clAt(d.lType, l) === LT_PREPROCESSOR) {
      clSet(d.lMightFn, l, 0);
    }
    this.markAnnotationParens();
    this.markDeclName(l);
    this.operatorCallOperands();
    this.keepBreakAfterAttributes();
    // A function declaration line ending in `};` has a body, not a braced
    // list, before its `;` (clang-format re-marks those braces). The line
    // declares a function when its first word is a constructor's or
    // destructor's name, or a later name before any braced list is a
    // declaration's (TokenAnnotator::annotate).
    // (Line.endsWith skips comments.)
    let last = clAt(d.lLast, l);
    while (clAt(d.kind, last) === K_COMMENT && clAt(d.prv, last) >= 0) {
      last = clAt(d.prv, last);
    }
    const lp = this.prev(last);
    if (
      clAt(d.kind, last) === P_SEMI &&
      lp >= 0 &&
      clAt(d.kind, lp) === P_RBRACE &&
      clAt(d.match, lp) >= 0 &&
      clAt(d.match, lp) < lp
    ) {
      const fnc = clAt(d.kind, this.first) === K_COMMENT ? this.next(this.first) : this.first;
      let fn = fnc >= 0 && clAt(d.type, fnc) === TT_CTOR_DTOR_DECL_NAME;
      for (
        let q = fnc >= 0 ? clAt(d.nxt, fnc) : -1;
        !fn && q >= 0 && clAt(d.bk, q) !== BK_BRACED_INIT;
        q = clAt(d.nxt, q)
      ) {
        if (clAt(d.type, q) === TT_FUNCTION_DECLARATION_NAME || clAt(d.type, q) === TT_CTOR_DTOR_DECL_NAME) {
          fn = true;
        }
      }
      if (fn && clAt(d.type, clAt(d.match, lp)) === TT_UNKNOWN) {
        const lb = clAt(d.match, lp);
        clSet(d.bk, lb, BK_BLOCK);
        clSet(d.bk, lp, BK_BLOCK);
        clSet(d.type, lb, TT_FUNCTION_LBRACE);
      }
    }
    // `virtual` outside any brackets: a virtual function's declaration.
    // A trailing comma (or comment) before `}` puts the list one per line.
    const other = clAt(d.lType, l) === LT_OTHER;
    for (let t = this.first; t >= 0; t = clAt(d.nxt, t)) {
      if (other && clAt(d.kind, t) === KW_VIRTUAL && clAt(d.nest, t) === 0 && clAt(d.lType, l) === LT_OTHER) {
        clSet(d.lType, l, LT_VIRTUAL_FUNCTION_DECL);
      }
      if (clAt(d.kind, t) === P_RBRACE && clAt(d.match, t) >= 0) {
        const o = clAt(d.match, t);
        const p = clAt(d.prv, t);
        if (p !== o && (clAt(d.kind, p) === P_COMMA || (clAt(d.kind, p) === K_COMMENT && isTrailingComment(d, p)))) {
          clSet(d.mustBreak, t, 1);
          if (clAt(d.bk, o) !== BK_BLOCK || clAt(d.type, o) === 18) {
            const n = clAt(d.nxt, o);
            if (n >= 0 && n !== t) {
              clSet(d.mustBreak, n, 1);
            }
          }
        }
      }
    }
    this.objcStarBrackets();
    // Children: lambda bodies, statements in function bodies.
    for (let t = this.first; t >= 0; t = clAt(d.nxt, t)) {
      let c = clAt(d.childHead, t);
      while (c >= 0) {
        const saveFirst = this.first;
        const saveScope = this.macroScope;
        // (A child line of a macro body is inside one of its braces.)
        this.macroScope = clAt(d.inPP, clAt(d.lFirst, c)) === 1;
        this.classifyLine(c);
        this.macroScope = saveScope;
        this.line = l;
        this.first = saveFirst;
        c = clAt(d.lSibling, c);
      }
    }
  }

  /** The ctor-initializer colon governing a comma at depth `dep`, or -1. */
  prevCtorColon(t: i32, dep: i32): i32 {
    if (dep !== 0) {
      return -1;
    }
    for (let p = clAt(this.d.prv, t); p >= 0; p = clAt(this.d.prv, p)) {
      if (clAt(this.d.nest, p) === 0 && clAt(this.d.kind, p) === P_COLON) {
        return p;
      }
    }
    return -1;
  }

  /** Whether `t` is the first token of a `#define` body joined onto the directive. */
  startsDefineBody(t: i32): boolean {
    const d = this.d;
    const f = this.first;
    if (clAt(d.kind, f) !== P_HASH || clAt(d.ppKind, f) !== PP_DEFINE) {
      return false;
    }
    const w = clAt(d.nxt, f);
    const name = w >= 0 ? clAt(d.nxt, w) : -1;
    if (name < 0) {
      return false;
    }
    const p = clAt(d.prv, t);
    const n = clAt(d.nxt, name);
    if (n >= 0 && clAt(d.kind, n) === P_LPAREN && clAt(d.ws, n) === 0 && clAt(d.match, n) > n) {
      return p === clAt(d.match, n);
    }
    return p === name;
  }

  /**
   * On a `template <...>` line, whether what follows the parameter list is
   * class, struct, union, enum or using: an `=` there starts no expression.
   */
  /**
   * Whether `=` (token `t`, at depth `dep` of a `template` line) gives a
   * non-type template parameter its default: clang-format reads that value
   * as an expression, unlike a `typename`/`class` parameter's.
   */
  templateParamDefault(t: i32, dep: i32): boolean {
    const o = this.level(dep).open;
    if (this.k(o) !== P_LESS || this.ty(o) !== TT_TEMPLATE_OPENER || o !== this.next(this.first)) {
      return false;
    }
    const p = this.prev(t);
    const pp = p >= 0 ? this.prev(p) : -1;
    return pp >= 0 && this.k(pp) !== KW_TYPENAME && this.k(pp) !== KW_CLASS;
  }

  templateDeclKeyword(): boolean {
    const d = this.d;
    const lt = this.next(this.first);
    if (lt < 0 || this.k(lt) !== P_LESS || clAt(d.match, lt) < 0) {
      return false;
    }
    const n = this.next(clAt(d.match, lt));
    if (n < 0) {
      return false;
    }
    const k = this.k(n);
    return k === KW_CLASS || k === KW_STRUCT || k === KW_UNION || k === KW_ENUM || k === KW_USING;
  }

  /** Whether `t` follows `=` or starts a constructor initializer (never a trailing annotation). */
  afterEqualOrCtorInit(t: i32): boolean {
    const p = this.prev(t);
    if (p < 0) {
      return false;
    }
    const pt = this.ty(p);
    return this.k(p) === P_EQUAL || pt === TT_CTOR_INITIALIZER_COMMA || pt === TT_CTOR_INITIALIZER_COLON;
  }

  /** `* &` runs before a `)`, `>` or `,` are declarators. */
  markPtrRun(t: i32): void {
    let p = clAt(this.d.prv, t);
    while (p >= 0 && (this.k(p) === P_STAR || this.k(p) === P_AMP)) {
      this.set(p, TT_POINTER_OR_REFERENCE);
      p = clAt(this.d.prv, p);
    }
  }

  markOperatorName(t: i32): void {
    const d = this.d;
    let n = clAt(d.nxt, t);
    if (n < 0) {
      return;
    }
    // A conversion function, `operator T()` or a macro's `operator OP(`:
    // a word that is no operator first (clang-format 23's annotator).
    const nk0 = this.k(n);
    if (isWordKind(nk0) && nk0 !== KW_NEW && nk0 !== KW_DELETE && nk0 !== KW_CO_AWAIT) {
      let lp = clAt(d.nxt, n);
      const a = lp >= 0 ? clAt(d.nxt, lp) : -1;
      const c = a >= 0 ? clAt(d.nxt, a) : -1;
      if (nk0 === KW_DECLTYPE && this.k(lp) === P_LPAREN && this.k(a) === KW_AUTO && this.k(c) === P_RPAREN) {
        lp = clAt(d.nxt, c); // `decltype(auto)`
      } else {
        while (lp >= 0 && this.k(lp) !== P_LPAREN) {
          if (this.isPtrKind(lp)) {
            this.set(lp, TT_POINTER_OR_REFERENCE);
          }
          lp = clAt(d.nxt, lp);
        }
      }
      if (lp >= 0 && this.k(lp) === P_LPAREN) {
        if (this.level(this.depth).expr !== 1) {
          this.set(t, TT_FUNCTION_DECLARATION_NAME);
        }
        return;
      }
    }
    if (nk0 === P_LPAREN && clAt(d.nxt, n) >= 0 && this.k(clAt(d.nxt, n)) === P_RPAREN) {
      const after = clAt(d.nxt, clAt(d.nxt, n));
      if (after >= 0 && this.k(after) === P_LESS) {
        // `operator()<T>()`: clang-format types only the first `(`.
        this.set(n, TT_OVERLOADED_OPERATOR_LPAREN);
        return;
      }
      this.set(n, TT_OVERLOADED_OPERATOR);
      this.set(clAt(d.nxt, n), TT_OVERLOADED_OPERATOR);
      const lp = clAt(d.nxt, clAt(d.nxt, n));
      if (lp >= 0 && this.k(lp) === P_LPAREN) {
        this.set(lp, TT_OVERLOADED_OPERATOR_LPAREN);
      }
      return;
    }
    while (n >= 0 && this.k(n) !== P_LPAREN && this.k(n) !== P_SEMI) {
      const nk = this.k(n);
      if (nk === P_LESS && this.prev(n) !== t) {
        // `operator[]<T, 0>`: template arguments, read past whole.
        let depth = 0;
        let q = n;
        while (q >= 0 && this.k(q) !== P_SEMI && this.k(q) !== P_LBRACE) {
          const qk = this.k(q);
          if (qk === P_LESS) {
            if (depth >= CL_I32_MAX) {
              fault();
              return;
            }
            depth++;
          } else if (qk === P_GREATER) {
            // (The walk starts at a `<` and stops when its count is back to 0.)
            if (depth <= 0) {
              fault();
              return;
            }
            depth--;
            if (depth === 0) {
              break;
            }
          }
          q = clAt(d.nxt, q);
        }
        if (q >= 0 && this.k(q) === P_GREATER) {
          n = clAt(d.nxt, q);
          continue;
        }
      }
      if (!isWordKind(nk) && nk !== P_COLONCOLON) {
        if (nk === P_STAR || nk === P_AMP) {
          // `operator*` vs `operator Foo*`.
          const p = this.prev(n);
          this.set(n, p === t ? TT_OVERLOADED_OPERATOR : TT_POINTER_OR_REFERENCE);
        } else if ((nk !== P_LESS && nk !== P_GREATER) || this.prev(n) === t) {
          this.set(n, TT_OVERLOADED_OPERATOR);
        } else if (
          nk === P_GREATER &&
          clAt(d.ws, n) === 0 &&
          this.k(this.prev(n)) === P_GREATER &&
          this.ty(this.prev(n)) === TT_OVERLOADED_OPERATOR
        ) {
          // `operator>>`: the lexer splits `>>` into two `>`.
          this.set(n, TT_OVERLOADED_OPERATOR);
        }
      }
      if (nk === P_LSQUARE) {
        const c = clAt(d.nxt, n);
        if (c >= 0) {
          // (`operator[]<T>`: clang-format leaves that `]` untyped.)
          const cn = clAt(d.nxt, c);
          if (!(cn >= 0 && this.k(cn) === P_LESS)) {
            this.set(c, TT_OVERLOADED_OPERATOR);
          }
          n = c;
        }
      }
      n = clAt(d.nxt, n);
    }
    if (n >= 0 && this.k(n) === P_LPAREN) {
      this.set(n, TT_OVERLOADED_OPERATOR_LPAREN);
    }
  }

  classifyColon(t: i32, dep: i32): void {
    const d = this.d;
    if (clAt(d.final, t) === 1 || this.ty(t) === TT_CASE_LABEL_COLON) {
      return;
    }
    const at = this.level(dep);
    const pending = at.ques;
    if (pending > 0) {
      at.ques = pending - 1;
      this.set(t, TT_CONDITIONAL_EXPR);
      return;
    }
    const o = at.open;
    if (this.ty(o) === TT_ATTRIBUTE_SQUARE) {
      return;
    }
    // `_Generic(x, int: a, ...)`: an association's colon.
    if (dep >= 1 && this.k(o) === P_LPAREN && this.prev(o) >= 0 && this.k(this.prev(o)) === KW_GENERIC) {
      this.set(t, TT_GENERIC_SELECTION_COLON);
      return;
    }
    // `for (x : xs)`.
    if (dep >= 1) {
      if (this.k(o) === P_LPAREN && this.k(this.prev(o)) === KW_FOR && dep === 1) {
        this.set(t, TT_RANGE_BASED_FOR_LOOP_COLON);
        return;
      }
      // Any other colon right inside parentheses: an inline assembly
      // operand separator on an `asm` line (clang-format 23 asks
      // `Line.First->is(tok::kw_asm)`), else a bit field's before a number,
      // else nothing.
      if (
        this.k(o) === P_LPAREN &&
        !(clAt(d.lType, this.line) === LT_PREPROCESSOR && clAt(d.ppKind, this.first) === PP_PRAGMA)
      ) {
        if (this.lineStartsWithAsm()) {
          this.set(t, TT_INLINE_ASM_COLON);
          return;
        }
        const n = this.next(t);
        if (n >= 0 && this.k(n) === K_NUMBER) {
          this.set(t, TT_BIT_FIELD_COLON);
        }
      }
      return;
    }
    const n = this.next(t);
    if (n >= 0 && this.k(n) === K_NUMBER) {
      this.set(t, TT_BIT_FIELD_COLON);
      return;
    }
    const fk = this.k(this.first);
    if (
      fk === KW_ENUM ||
      fk === KW_CASE ||
      fk === KW_DEFAULT ||
      fk === KW_PUBLIC ||
      fk === KW_PRIVATE ||
      fk === KW_PROTECTED ||
      isQtWord(d, this.first, true)
    ) {
      return;
    }
    const p = this.prev(t);
    if (p < 0) {
      return;
    }
    // (After a requires clause's last token too: `requires C<T> : x(1)`.)
    if (this.k(p) === P_RPAREN || this.k(p) === KW_NOEXCEPT || this.closesRequiresClause(p)) {
      this.set(t, TT_CTOR_INITIALIZER_COLON);
      this.level(0).expr = 1;
      return;
    }
    if (this.k(p) === KW_TRY) {
      // A member initializer list in a function try block: `f() try : x(1)`;
      // after any other `try`, no kind at all.
      const pp = this.prev(p);
      if (pp >= 0 && (this.k(pp) === P_RPAREN || this.k(pp) === KW_NOEXCEPT)) {
        this.set(t, TT_CTOR_INITIALIZER_COLON);
        this.level(0).expr = 1;
      }
      return;
    }
    if (n < 0) {
      return; // a label
    }
    this.set(t, TT_INHERITANCE_COLON);
  }

  isStartOfName(t: i32): boolean {
    const d = this.d;
    const p0 = clAt(d.prv, t);
    if (p0 < 0) {
      return false;
    }
    const n = this.next(t);
    if (
      (n < 0 && clAt(d.lPP, this.line) === 0) ||
      (n >= 0 && (this.isPtrKind(n) || this.k(n) === K_STRING || this.ty(n) === TT_CLASS_HEAD_NAME))
    ) {
      return false;
    }
    // `class Name final`: `final` names nothing.
    if (this.k(t) === CW_FINAL && this.ty(this.prev(t)) === TT_CLASS_HEAD_NAME) {
      return false;
    }
    let p = this.prev(t);
    while (p >= 0 && this.k(p) === KW_CONST) {
      p = this.prev(p);
    }
    if (p < 0) {
      return false;
    }
    if (this.closesRequiresClause(p)) {
      return false;
    }
    const pk = this.k(p);
    const pt = this.ty(p);
    if (pt === TT_TEMPLATE_CLOSER) {
      const m = clAt(d.match, p);
      if (m < 0) {
        return false;
      }
      const mp = clAt(d.prv, m);
      return mp >= 0 && this.k(mp) !== P_PERIOD && this.k(mp) !== KW_TEMPLATE;
    }
    if (pt === TT_ATTRIBUTE_RPAREN) {
      return true;
    }
    if (pk === P_RPAREN && clAt(d.match, p) >= 0 && clAt(d.prv, clAt(d.match, p)) >= 0) {
      const mp = this.prev(clAt(d.match, p));
      if (mp >= 0 && (this.k(mp) === KW_DECLTYPE || this.k(mp) === KW_TYPEOF)) {
        return true;
      }
    }
    if (isIdentKind(pk)) {
      // Not a directive's name (`#define X`).
      const pp = clAt(d.prv, p);
      return !(pp >= 0 && this.k(pp) === P_HASH);
    }
    if (pk === KW_AUTO || pt === TT_POINTER_OR_REFERENCE || isSimpleTypeKind(pk)) {
      return true;
    }
    return false;
  }

  /**
   * clang-format's StartsObjCMethodExpr for `[` at `t` after `p` (its
   * previous non-comment token) at depth `dep`: in a context that can be an
   * expression, not empty, after nothing, an opening bracket, `:`, `return`,
   * `throw`, a unary operator, a cast or any binary operator's token.
   */
  startsObjCExpr(t: i32, p: i32, dep: i32): boolean {
    const d = this.d;
    if (this.level(dep).afterNew === 1) {
      return false;
    }
    const n = clAt(d.nxt, t);
    if (n < 0 || this.k(n) === P_LBRACE || this.k(n) === P_RSQUARE) {
      return false;
    }
    if (p < 0) {
      return true;
    }
    const pk = this.k(p);
    const pt = this.ty(p);
    if (
      pk === P_COLON ||
      pk === P_LSQUARE ||
      pk === P_LPAREN ||
      pk === KW_RETURN ||
      pk === KW_THROW ||
      pt === TT_UNARY_OPERATOR ||
      pt === TT_CAST_RPAREN
    ) {
      return true;
    }
    // (After a template's `>`, an array type's brackets.)
    return binPrecedence(pk) > PREC_UNKNOWN && pt !== TT_TEMPLATE_CLOSER;
  }

  /**
   * Whether the brackets from `[` at `t` hold a receiver (`a`, `a.b`, ...),
   * a word, then a `:` at their own level, with no `,` or `?` before it: an
   * Objective-C message's selector argument.
   */
  messageColon(t: i32): boolean {
    const d = this.d;
    let r = clAt(d.nxt, t);
    // (A bracketed receiver, `[[a b] c:d]`, ends at its closer.)
    if (r >= 0 && (this.k(r) === P_LSQUARE || this.k(r) === P_LPAREN)) {
      let dd = 0;
      for (let q = r; q >= 0; q = clAt(d.nxt, q)) {
        const k = this.k(q);
        if (k === P_LPAREN || k === P_LSQUARE || k === P_LBRACE) {
          if (dd >= CL_I32_MAX) {
            fault();
            return false;
          }
          dd++;
        } else if (k === P_RPAREN || k === P_RSQUARE || k === P_RBRACE) {
          // (The walk starts at a bracket and stops when its count is back to 0.)
          if (dd <= 0) {
            fault();
            return false;
          }
          dd--;
          if (dd === 0) {
            r = q;
            break;
          }
        }
      }
    }
    const s = r >= 0 ? clAt(d.nxt, r) : -1;
    if (r < 0 || s < 0) {
      return false;
    }
    let depth = 0;
    for (let q = s; q >= 0; q = clAt(d.nxt, q)) {
      const k = this.k(q);
      if (k === P_LPAREN || k === P_LSQUARE || k === P_LBRACE) {
        if (depth >= CL_I32_MAX) {
          fault();
          return false;
        }
        depth++;
      } else if (k === P_RPAREN || k === P_RSQUARE || k === P_RBRACE) {
        // (`depth` never drops below 0.)
        if (depth <= 0) {
          return false;
        }
        depth--;
      } else if (depth === 0 && (k === P_COMMA || k === P_QUESTION || k === P_SEMI)) {
        return false;
      } else if (depth === 0 && k === P_COLON) {
        // (Right after the receiver too: `[a:b]`, the receiver a selector part.)
        return isWordKind(this.k(clAt(d.prv, q)));
      }
    }
    return false;
  }

  /**
   * clang-format's isCppAttribute: whether `[` at `t` opens `[[ ... ]]`, an
   * attribute, rather than an Objective-C message or array literal (`[[a
   * b:c] d:e]`): a word after `[[`, then no `:`, no two words in a row and
   * no word after `)` before the closing `]]`.
   */
  isCppAttribute(t: i32): boolean {
    const d = this.d;
    const n = clAt(d.nxt, t);
    if (n < 0 || this.k(n) !== P_LSQUARE) {
      return false;
    }
    const p = clAt(d.prv, t);
    if (p >= 0 && (this.k(p) === P_AT || this.k(p) === P_LSQUARE)) {
      return false;
    }
    let a = clAt(d.nxt, n);
    if (a < 0) {
      return false;
    }
    const a1 = clAt(d.nxt, a);
    if (this.k(a) === KW_USING && a1 >= 0 && this.k(a1) === K_IDENT) {
      const a2 = clAt(d.nxt, a1);
      if (a2 >= 0 && this.k(a2) === P_COLON) {
        return true;
      }
    }
    if (this.k(a) !== K_IDENT) {
      return false;
    }
    while (a >= 0) {
      const ak = this.k(a);
      const an = clAt(d.nxt, a);
      const ank = an >= 0 ? this.k(an) : -1;
      if (ak === P_RSQUARE && ank === P_RSQUARE) {
        return true;
      }
      if (ak === P_COLON || ((ak === K_IDENT || ak === P_RPAREN) && ank === K_IDENT)) {
        return false;
      }
      if (ak === P_ELLIPSIS) {
        return true;
      }
      a = an;
    }
    return false;
  }

  /**
   * clang-format's parseSquare: a `:` at the level of a subscript's or a
   * designated initializer's `[` (not a conditional's) makes it an
   * Objective-C message, `x [a.b:c]`. Followed by `(`, clang-format makes
   * it unknown again with its colons still a message's: the file is skipped.
   */
  subscriptColon(t: i32): void {
    const d = this.d;
    if (clAt(d.lType, this.line) === LT_PREPROCESSOR && clAt(d.ppKind, this.first) === PP_PRAGMA) {
      return;
    }
    let depth = 0;
    let ques = 0;
    let colon = false;
    for (let q = clAt(d.nxt, t); q >= 0; q = clAt(d.nxt, q)) {
      const k = this.k(q);
      if (k === P_LPAREN || k === P_LSQUARE || k === P_LBRACE) {
        if (depth >= CL_I32_MAX) {
          fault();
          return;
        }
        depth++;
      } else if (k === P_RPAREN || k === P_RSQUARE || k === P_RBRACE) {
        if (depth > 0) {
          depth--;
          continue;
        }
        if (!colon || k !== P_RSQUARE) {
          return;
        }
        const after = this.next(q);
        if (after >= 0 && this.k(after) === P_LPAREN) {
          d.failed = true;
          return;
        }
        // (Its binding stays a subscript's: clang-format chose it first.)
        if (clAt(d.type, t) === TT_ARRAY_SUBSCRIPT_LSQUARE) {
          this.subObjC = t;
        }
        clSet(d.type, t, TT_OBJC_METHOD_EXPR);
        return;
      } else if (depth === 0 && k === P_QUESTION) {
        if (ques >= CL_I32_MAX) {
          fault();
          return;
        }
        ques++;
      } else if (depth === 0 && k === P_COLON) {
        if (ques > 0) {
          ques--;
        } else {
          colon = true;
        }
      }
    }
  }

  /** Whether the brackets from `[` at `t` hold a `,` at their own level before any `:`. */
  listCommaBeforeColon(t: i32): boolean {
    const d = this.d;
    let depth = 0;
    for (let q = clAt(d.nxt, t); q >= 0; q = clAt(d.nxt, q)) {
      const k = this.k(q);
      if (k === P_LPAREN || k === P_LSQUARE || k === P_LBRACE) {
        if (depth >= CL_I32_MAX) {
          fault();
          return false;
        }
        depth++;
      } else if (k === P_RPAREN || k === P_RSQUARE || k === P_RBRACE) {
        // (`depth` never drops below 0.)
        if (depth <= 0) {
          return false;
        }
        depth--;
      } else if (depth === 0 && k === P_COMMA) {
        return true;
      } else if (depth === 0 && k === P_COLON) {
        return false;
      }
    }
    return false;
  }

  /** Whether `)` at `t` ends a C-style cast: clang-format's rParenEndsCast. */
  endsCast(t: i32): boolean {
    const d = this.d;
    const m = clAt(d.match, t);
    const n = clAt(d.nxt, t);
    if (m < 0 || n < 0 || clAt(d.prv, t) === m) {
      return false;
    }
    if (this.ty(m) === TT_OVERLOADED_OPERATOR_LPAREN || this.ty(m) === TT_FUNCTION_TYPE_LPAREN) {
      return false;
    }
    let lop = this.prev(m);
    if (lop >= 0) {
      // A `)` that is not a cast before these parens: look past it (chained casts).
      if (this.k(lop) === P_RPAREN && this.ty(lop) !== TT_CAST_RPAREN) {
        if (clAt(d.match, lop) < 0 || clAt(d.prv, clAt(d.match, lop)) < 0) {
          return false;
        }
        lop = clAt(d.prv, clAt(d.match, lop));
      }
      if (this.k(lop) === P_RSQUARE) {
        // `delete[] (void *)ptr`
        const ls = this.prev(lop);
        if (ls >= 0 && this.k(ls) === P_LSQUARE) {
          const dl = this.prev(ls);
          if (dl >= 0 && this.k(dl) === KW_DELETE) {
            lop = dl;
          }
        }
      }
      const lk = this.k(lop);
      if (isWordKind(lk) && clAt(d.prv, lop) >= 0 && this.k(clAt(d.prv, lop)) === KW_OPERATOR) {
        return false;
      }
      if (isWordKind(lk) && !(lk === KW_RETURN || lk === KW_CASE || lk === KW_DELETE || lk === KW_THROW)) {
        return false;
      }
      if (
        lk === P_RSQUARE ||
        this.ty(lop) === TT_OVERLOADED_OPERATOR ||
        this.ty(lop) === TT_TEMPLATE_CLOSER ||
        lk === P_ELLIPSIS
      ) {
        return false;
      }
    }
    const nk = this.k(n);
    const tp = clAt(d.prv, t);
    if (nk === P_QUESTION || (nk === P_AMPAMP && !isTypeName(d, tp))) {
      return false;
    }
    if (
      nk === KW_NOEXCEPT ||
      nk === KW_VOLATILE ||
      nk === KW_CONST ||
      nk === KW_REQUIRES ||
      nk === KW_THROW ||
      nk === P_ARROW ||
      nk === CW_OVERRIDE ||
      nk === CW_FINAL
    ) {
      return false;
    }
    if (nk === P_LSQUARE && clAt(d.nxt, n) >= 0 && this.k(clAt(d.nxt, n)) === P_LSQUARE) {
      return false; // a [[attribute]]
    }
    if (nk === KW_SIZEOF || nk === KW_ALIGNOF || (isLiteralKind(nk) && nk !== K_STRING)) {
      return true;
    }
    // (clang-format's IsNonVariableTemplate: a `>` whose `<` follows a token.)
    const parensAreType =
      (this.ty(tp) === TT_TEMPLATE_CLOSER && clAt(d.match, tp) >= 0 && this.prev(clAt(d.match, tp)) >= 0) ||
      isTypeName(d, tp) ||
      this.qualifiedPointer(tp);
    const couldEndDecl = nk === P_EQUAL || nk === P_SEMI || nk === P_LBRACE || nk === P_GREATER;
    if (parensAreType && !couldEndDecl) {
      return true;
    }
    if (lop < 0) {
      return false;
    }
    for (let q = clAt(d.nxt, m); q >= 0 && q !== t; q = clAt(d.nxt, q)) {
      if (this.ty(q) === TT_BINARY_OPERATOR) {
        return false;
      }
    }
    // (A reserved word clang lexes as a keyword, `__builtin_offsetof`, is none.)
    if ((isIdentKind(nk) && !isReservedKeyword(d, n)) || nk === KW_THIS) {
      return true;
    }
    // `(x)(` and `(a::x)(`: a name, maybe qualified, cast to.
    if (nk === P_LPAREN) {
      for (let q = tp; q >= 0 && isIdentKind(this.k(q)); ) {
        q = clAt(d.prv, q);
        if (q >= 0 && this.k(q) === P_COLONCOLON) {
          q = clAt(d.prv, q);
        }
        if (q === m) {
          return true;
        }
      }
    }
    const nn = clAt(d.nxt, n);
    if (nn < 0) {
      return false;
    }
    // `(T){...}`: a compound literal.
    if (nk === P_LBRACE && clAt(d.bk, n) === BK_BRACED_INIT) {
      return true;
    }
    const ampOrStar = nk === P_AMP || nk === P_STAR;
    const unary =
      nk === P_PLUS ||
      nk === P_PLUSPLUS ||
      nk === P_MINUS ||
      nk === P_MINUSMINUS ||
      nk === P_EXCLAIM ||
      nk === P_TILDE ||
      nk === KW_SIZEOF ||
      nk === KW_ALIGNOF;
    const nnk = this.k(nn);
    if (!(unary || ampOrStar) || nk === P_PLUS || !(isIdentKind(nnk) || nnk === K_NUMBER)) {
      return false;
    }
    const inPP = clAt(d.lType, this.line) === LT_PREPROCESSOR || clAt(d.inPP, t) === 1;
    if (ampOrStar && (nnk === K_NUMBER || inPP)) {
      return false;
    }
    if (inPP && nk === P_MINUS) {
      return false;
    }
    // `(*)(int)`: a function pointer type.
    if (this.k(tp) === P_RPAREN) {
      if (this.ty(tp) === TT_CAST_RPAREN || clAt(d.match, tp) < 0) {
        return false;
      }
      const pp = clAt(d.prv, clAt(d.match, tp));
      return (
        pp >= 0 &&
        this.k(pp) === P_RPAREN &&
        clAt(d.match, pp) >= 0 &&
        this.ty(clAt(d.match, pp)) === TT_FUNCTION_TYPE_LPAREN
      );
    }
    for (let q = tp; q >= 0 && q !== m; q = clAt(d.prv, q)) {
      const qk = this.k(q);
      if (!(qk === KW_CONST || isIdentKind(qk) || qk === P_COLONCOLON)) {
        return false;
      }
    }
    return true;
  }

  /** Whether `t`, past trailing const/volatile/restrict, is a pointer or reference. */
  qualifiedPointer(t0: i32): boolean {
    let t = t0;
    while (t >= 0) {
      const k = this.k(t);
      if (this.ty(t) === TT_ATTRIBUTE_RPAREN && clAt(this.d.match, t) >= 0) {
        t = this.prev(clAt(this.d.match, t));
        if (t >= 0) {
          t = this.prev(t);
        }
        continue;
      }
      if (this.ty(t) === TT_ATTRIBUTE_SQUARE && clAt(this.d.match, t) >= 0 && clAt(this.d.match, t) < t) {
        t = this.prev(clAt(this.d.match, t));
        continue;
      }
      if (k === KW_CONST || k === KW_VOLATILE || isPointerQualifierWord(this.d, t)) {
        t = this.prev(t);
        continue;
      }
      break;
    }
    return t >= 0 && this.ty(t) === TT_POINTER_OR_REFERENCE;
  }

  /**
   * Marks the `)` of an all-caps macro call that annotates the declaration
   * after it (`FOO(x) int f();`), as clang-format does: a break follows it.
   */
  markAnnotationParens(): void {
    const d = this.d;
    for (let t = this.first; t >= 0; t = clAt(d.nxt, t)) {
      if (
        clAt(d.kind, t) !== P_RPAREN ||
        clAt(d.match, t) < 0 ||
        !(this.ty(t) === TT_UNKNOWN || this.ty(t) === TT_CAST_RPAREN)
      ) {
        continue;
      }
      const n = clAt(d.nxt, t);
      if (n < 0) {
        continue;
      }
      const nk = clAt(d.kind, n);
      if (
        binPrecedence(nk) > PREC_COMMA ||
        nk === P_SEMI ||
        nk === P_COLON ||
        nk === P_LBRACE ||
        nk === P_LPAREN ||
        nk === P_COMMA ||
        nk === P_PERIOD ||
        nk === P_ARROW ||
        nk === P_COLONCOLON ||
        nk === KW_NOEXCEPT ||
        nk === P_CARET
      ) {
        continue;
      }
      const b = clAt(d.prv, clAt(d.match, t));
      if (b < 0 || clAt(d.kind, b) !== K_IDENT || !noLower(d, b)) {
        continue;
      }
      const bp = clAt(d.prv, b);
      if (
        bp >= 0 &&
        !(
          this.ty(bp) === TT_TEMPLATE_CLOSER &&
          clAt(d.match, bp) >= 0 &&
          clAt(d.prv, clAt(d.match, bp)) >= 0 &&
          clAt(d.kind, clAt(d.prv, clAt(d.match, bp))) === KW_TEMPLATE
        )
      ) {
        continue;
      }
      this.set(t, TT_FUNCTION_ANNOTATION_RPAREN);
    }
  }

  /**
   * clang-format's BreakAfterAttributes: Leave. In a declaration, a newline
   * written after the last `[[...]]` group before the name is kept.
   */
  keepBreakAfterAttributes(): void {
    const d = this.d;
    let seenName = false;
    let isFunction = false;
    let after = -1;
    for (let t = clAt(d.nxt, this.first); t >= 0; t = clAt(d.nxt, t)) {
      const ty = this.ty(t);
      if (ty === TT_START_OF_NAME) {
        seenName = true;
      }
      const p = clAt(d.prv, t);
      if (
        clAt(d.kind, p) === P_RSQUARE &&
        this.ty(p) === TT_ATTRIBUTE_SQUARE &&
        clAt(d.match, p) >= 0 &&
        clAt(d.nxt, clAt(d.match, p)) >= 0 &&
        clAt(d.kind, clAt(d.nxt, clAt(d.match, p))) === P_LSQUARE
      ) {
        after = t;
      }
      if (ty === TT_CTOR_DTOR_DECL_NAME || ty === TT_FUNCTION_DECLARATION_NAME) {
        seenName = true;
        isFunction = ty === TT_FUNCTION_DECLARATION_NAME;
        break;
      }
    }
    if (seenName && after >= 0 && clAt(d.nl, after) > 0) {
      clSet(d.mustBreak, after, 2); // a kept break, which the annotator honours as such
      if (isFunction) {
        clSet(d.lRetWrap, this.line, 1);
      }
    }
  }

  /** Whether the `->` at `t` is a deduction guide's: `A(...) -> A<...>;`. */
  isDeductionGuide(t: i32): boolean {
    const d = this.d;
    const p = clAt(d.prv, t);
    const n = clAt(d.nxt, t);
    if (p < 0 || clAt(d.kind, p) !== P_RPAREN || clAt(d.match, p) < 0 || n < 0 || clAt(d.kind, n) !== K_IDENT) {
      return false;
    }
    let c = clAt(d.nxt, n);
    if (c < 0 || clAt(d.kind, c) !== P_LESS) {
      return false;
    }
    let level = 0;
    let paren = 0;
    while (c >= 0) {
      const k = clAt(d.kind, c);
      if (k === P_LPAREN) {
        if (paren >= CL_I32_MAX) {
          fault();
          return false;
        }
        paren++;
      } else if (k === P_RPAREN) {
        // (A stray `)` takes it below 0: computed in i64, it fits.)
        const np = toI64(paren) - toI64(1);
        if (np < toI64(-2147483648)) {
          fault();
          return false;
        }
        paren = toI32(np);
      } else if (paren === 0 && k === P_LESS) {
        if (level >= CL_I32_MAX) {
          fault();
          return false;
        }
        level++;
      } else if (paren === 0 && k === P_GREATER) {
        // (The walk starts at a `<` and stops when `level` is back below 1.)
        if (level <= 0) {
          fault();
          return false;
        }
        level--;
      }
      if (paren === 0 && level < 1) {
        break;
      }
      c = clAt(d.nxt, c);
    }
    if (c < 0 || clAt(d.nxt, c) < 0 || clAt(d.kind, clAt(d.nxt, c)) !== P_SEMI) {
      return false;
    }
    const lead = clAt(d.prv, clAt(d.match, p));
    return lead >= 0 && d.sameText(lead, n);
  }

  /** Marks the first `->` after the parameter list of function name `t` as a trailing return arrow. */
  markReturnArrow(t: i32): void {
    const d = this.d;
    let p = clAt(d.nxt, t);
    while (
      p >= 0 &&
      !(this.k(p) === P_LPAREN && (this.ty(p) === TT_OVERLOADED_OPERATOR_LPAREN || this.k(t) !== KW_OPERATOR))
    ) {
      if (this.ty(p) === TT_TEMPLATE_OPENER && clAt(d.match, p) >= 0) {
        p = clAt(d.match, p);
      }
      p = clAt(d.nxt, p);
    }
    if (p < 0 || clAt(d.match, p) < 0) {
      return;
    }
    for (let a = clAt(d.nxt, clAt(d.match, p)); a >= 0; a = clAt(d.nxt, a)) {
      if (this.k(a) === P_ARROW) {
        this.set(a, TT_TRAILING_RETURN_ARROW);
        return;
      }
      // Skip the arguments of a trailing annotation: `LOCKS_REQUIRED(a->b)`.
      const n = clAt(d.nxt, a);
      if (this.ty(a) === TT_TRAILING_ANNOTATION && n >= 0 && this.k(n) === P_LPAREN) {
        if (clAt(d.match, n) < 0) {
          return;
        }
        a = clAt(d.match, n);
      }
    }
  }

  /** Marks the function declaration name, or the ctor/dtor name, of line `l`. */
  markDeclName(l: i32): void {
    const d = this.d;
    // clang-format's annotate marks a constructor or destructor name first;
    // the search for a declaration name stops there.
    const ctor = this.markCtorDtorName(l);
    for (let t = clAt(d.nxt, this.first); t >= 0; t = clAt(d.nxt, t)) {
      if (t === ctor) {
        return;
      }
      // clang-format's search stops at the first braced list, nested or not
      // (calculateFormattingInformation).
      if (clAt(d.bk, t) === BK_BRACED_INIT && (clAt(d.kind, t) === P_LBRACE || clAt(d.kind, t) === P_RBRACE)) {
        break;
      }
      // (An `operator` counts at any depth, as for clang-format.)
      if (clAt(d.nest, t) !== 0 && clAt(d.kind, t) !== KW_OPERATOR) {
        continue;
      }
      this.fnEarly = false;
      if (this.isFunctionName(t)) {
        this.set(t, TT_FUNCTION_DECLARATION_NAME);
        // (clang-format's MightBeFunctionDecl needs a line that must be a declaration.)
        if (clAt(d.lMustDecl, l) === 1) {
          clSet(d.lMightFn, l, 1);
        }
        if (!this.fnEarly) {
          this.markReturnArrow(t);
        }
        return;
      }
    }
  }

  /**
   * clang-format 23's getFunctionName and isCtorOrDtorName: past `friend`,
   * `inline` and their kin, `[[...]]` and a `template <...>` prefix, the
   * unqualified name before a `(` names a constructor or destructor in a
   * class, on a line ending in a function body, or after its own class name
   * (`A::A`, `A<T>::A`). Answers that token, or -1.
   */
  markCtorDtorName(l: i32): i32 {
    const d = this.d;
    let t = this.first;
    while (t >= 0) {
      const k = this.k(t);
      if (
        k === K_COMMENT ||
        k === KW_FRIEND ||
        k === KW_INLINE ||
        k === KW_VIRTUAL ||
        k === KW_CONSTEXPR ||
        k === KW_CONSTEVAL ||
        k === KW_EXPLICIT
      ) {
        t = clAt(d.nxt, t);
        continue;
      }
      if (this.ty(t) === TT_ATTRIBUTE_SQUARE && k === P_LSQUARE) {
        t = clAt(d.match, t) >= 0 ? clAt(d.nxt, clAt(d.match, t)) : -1;
        continue;
      }
      if (k === KW_TEMPLATE) {
        const o = this.next(t);
        if (o < 0 || this.ty(o) !== TT_TEMPLATE_OPENER || clAt(d.match, o) < 0) {
          return -1;
        }
        t = this.next(clAt(d.match, o));
        continue;
      }
      break;
    }
    if (t < 0) {
      return -1;
    }
    if (this.k(t) === P_COLONCOLON) {
      t = clAt(d.nxt, t);
    }
    // skipNameQualifier: `A::`, `A<T>::`.
    while (t >= 0 && this.k(t) === K_IDENT) {
      let n = this.next(t);
      if (n >= 0 && this.ty(n) === TT_TEMPLATE_OPENER && clAt(d.match, n) >= 0) {
        n = this.next(clAt(d.match, n));
      }
      if (n < 0 || this.k(n) !== P_COLONCOLON) {
        break;
      }
      t = this.next(n);
    }
    if (t >= 0 && this.k(t) === P_TILDE) {
      t = clAt(d.nxt, t);
    }
    if (t < 0 || this.k(t) !== K_IDENT || this.ty(t) !== TT_UNKNOWN) {
      return -1;
    }
    const lp = this.next(t);
    if (lp < 0 || this.k(lp) !== P_LPAREN || this.ty(lp) !== TT_UNKNOWN || clAt(d.match, lp) < 0) {
      return -1;
    }
    let qualified = false;
    const p = this.prev(t);
    if (p >= 0) {
      let q = p;
      if (this.k(q) === P_TILDE) {
        q = this.prev(q);
      }
      if (q >= 0 && this.k(q) === P_COLONCOLON) {
        let qq = this.prev(q);
        if (qq >= 0 && this.ty(qq) === TT_TEMPLATE_CLOSER && clAt(d.match, qq) >= 0) {
          qq = this.prev(clAt(d.match, qq));
        }
        qualified = qq >= 0 && d.sameText(qq, t);
      }
    }
    if (this.inClass || qualified || this.ty(clAt(d.lLast, l)) === TT_FUNCTION_LBRACE) {
      this.set(t, TT_CTOR_DTOR_DECL_NAME);
      if (clAt(d.lMustDecl, l) === 1) {
        clSet(d.lMightFn, l, 1);
      }
      return t;
    }
    return -1;
  }

  /**
   * On a line declaring no function, `a & b` inside an operator's parentheses
   * (`operator co_await(Baton & baton)`) is a binary operator to clang-format.
   */
  operatorCallOperands(): void {
    const d = this.d;
    if (!this.lineHasOperator) {
      return;
    }
    let hasOp = false;
    for (let t = this.first; t >= 0; t = clAt(d.nxt, t)) {
      if (clAt(d.type, t) === TT_FUNCTION_DECLARATION_NAME) {
        return;
      }
      if (clAt(d.kind, t) === KW_OPERATOR) {
        hasOp = true;
      }
    }
    if (!hasOp) {
      return;
    }
    for (let t = this.first; t >= 0; t = clAt(d.nxt, t)) {
      if (clAt(d.kind, t) !== KW_OPERATOR) {
        continue;
      }
      let lp = clAt(d.nxt, t);
      while (lp >= 0 && clAt(d.type, lp) !== TT_OVERLOADED_OPERATOR_LPAREN) {
        lp = clAt(d.nxt, lp);
      }
      if (lp < 0) {
        return;
      }
      const rp = clAt(d.match, lp);
      for (let q = clAt(d.nxt, lp); q >= 0 && q !== rp; q = clAt(d.nxt, q)) {
        if (clAt(d.kind, q) !== K_IDENT) {
          continue;
        }
        const n = clAt(d.nxt, q);
        if (n >= 0 && this.isPtrKind(n) && clAt(d.nxt, n) >= 0 && clAt(d.kind, clAt(d.nxt, n)) === K_IDENT) {
          clSet(d.type, n, TT_BINARY_OPERATOR);
          q = n;
        }
      }
      t = lp;
    }
  }

  /** clang-format's skipOperatorName: the operator's `(` after its name tokens, or -1. */
  skipOperatorName(n0: i32): i32 {
    const d = this.d;
    for (let n = n0; n >= 0; n = clAt(d.nxt, n)) {
      const k = this.k(n);
      const tt = this.ty(n);
      if (tt === TT_OVERLOADED_OPERATOR_LPAREN) {
        return n;
      }
      // (clang-format's operator walk types these as overloaded operators.)
      if (
        tt === TT_OVERLOADED_OPERATOR ||
        tt === TT_UNARY_OPERATOR ||
        tt === TT_BINARY_OPERATOR ||
        k === P_COMMA ||
        k === P_STAR ||
        k === P_ARROW ||
        k === P_AMP ||
        k === P_AMPAMP
      ) {
        continue;
      }
      const nn = clAt(d.nxt, n);
      if (k === KW_NEW || k === KW_DELETE || k === KW_CO_AWAIT) {
        if (nn >= 0 && this.k(nn) === P_LSQUARE && clAt(d.nxt, nn) >= 0 && this.k(clAt(d.nxt, nn)) === P_RSQUARE) {
          n = clAt(d.nxt, nn);
        }
        continue;
      }
      if (k === P_LSQUARE && nn >= 0 && this.k(nn) === P_RSQUARE) {
        n = nn;
        continue;
      }
      if ((isTypeName(d, n) || k === K_IDENT) && nn >= 0 && this.isPtrKind(nn)) {
        n = nn;
        continue;
      }
      if (tt === TT_TEMPLATE_OPENER && clAt(d.match, n) > n) {
        n = clAt(d.match, n);
        continue;
      }
      return -1;
    }
    return -1;
  }

  isFunctionName(t: i32): boolean {
    const d = this.d;
    if (this.ty(t) === TT_FUNCTION_DECLARATION_NAME) {
      this.fnEarly = true; // (a conversion function's `operator`)
      return true;
    }
    let next = clAt(d.nxt, t);
    if (this.k(t) === KW_OPERATOR) {
      // clang-format's isFunctionDeclarationName: a friend, or the token
      // before decides, then skipOperatorName.
      const f = this.k(this.first) === K_COMMENT ? this.next(this.first) : this.first;
      if (f >= 0 && this.k(f) === KW_FRIEND) {
        this.fnEarly = true;
        return true;
      }
      const p = this.prev(t);
      if (p < 0) {
        return false;
      }
      // (Decided before the parameter list is found: no trailing return arrow is marked.)
      if (this.isWord(p) && this.k(p) !== KW_RETURN && this.k(p) !== KW_CO_RETURN) {
        this.fnEarly = true;
        return true;
      }
      // `decltype(auto) operator()`: after a type-declaring parenthesis.
      if (this.k(p) === P_RPAREN && clAt(d.match, p) >= 0 && clAt(d.prv, clAt(d.match, p)) >= 0) {
        const pk = this.k(clAt(d.prv, clAt(d.match, p)));
        if (pk === KW_DECLTYPE || pk === KW_TYPEOF || pk === KW_ATOMIC) {
          this.fnEarly = true;
          return true;
        }
      }
      if (!this.isPtrKind(p) && this.ty(p) !== TT_TEMPLATE_CLOSER) {
        return false;
      }
      next = this.skipOperatorName(clAt(d.nxt, t));
      if (next < 0) {
        return false;
      }
    } else {
      if (this.ty(t) !== TT_START_OF_NAME) {
        return false;
      }
      // `name##suffix(`
      while (
        next >= 0 &&
        this.k(next) === P_HASHHASH &&
        clAt(d.nxt, next) >= 0 &&
        this.k(clAt(d.nxt, next)) === K_IDENT
      ) {
        next = clAt(d.nxt, clAt(d.nxt, next));
      }
      while (next >= 0) {
        if (this.ty(next) === TT_TEMPLATE_OPENER && clAt(d.match, next) >= 0) {
          next = clAt(d.match, next);
        } else if (this.k(next) === P_COLONCOLON) {
          next = clAt(d.nxt, next);
          if (next < 0) {
            return false;
          }
          if (this.k(next) === KW_OPERATOR) {
            // (`X::operator op(`, a macro's parameter for the operator, has
            // no operator name: no declaration.)
            next = this.skipOperatorName(clAt(d.nxt, next));
            break;
          }
          if (this.k(next) !== K_IDENT) {
            return false;
          }
        } else if (this.k(next) === P_LPAREN) {
          break;
        } else {
          return false;
        }
        next = clAt(d.nxt, next);
      }
    }
    if (next < 0 || this.k(next) !== P_LPAREN || clAt(d.match, next) < 0) {
      return false;
    }
    const cp = clAt(d.match, next);
    const last = clAt(d.lLast, this.line);
    if (this.k(last) === P_LBRACE) {
      return true;
    }
    if (clAt(d.nxt, next) === cp) {
      return true;
    }
    if (clAt(d.nxt, cp) >= 0 && this.ty(clAt(d.nxt, cp)) === TT_POINTER_OR_REFERENCE) {
      return true;
    }
    const nn = clAt(d.nxt, next);
    // (clang-format's endsWith(semi) looks past trailing comments.)
    let lastNC = last;
    while (lastNC >= 0 && this.k(lastNC) === K_COMMENT) {
      lastNC = clAt(d.prv, lastNC);
    }
    if (nn >= 0 && this.k(nn) === K_IDENT && !(lastNC >= 0 && this.k(lastNC) === P_SEMI)) {
      return true;
    }
    for (let q = nn; q >= 0 && q !== cp; q = clAt(d.nxt, q)) {
      if ((this.k(q) === P_LPAREN || this.ty(q) === TT_TEMPLATE_OPENER) && clAt(d.match, q) >= 0) {
        q = clAt(d.match, q);
        continue;
      }
      if (
        this.k(q) === KW_CONST ||
        isTypeName(d, q) ||
        this.ty(q) === TT_POINTER_OR_REFERENCE ||
        this.ty(q) === TT_START_OF_NAME ||
        this.k(q) === P_ELLIPSIS
      ) {
        return true;
      }
      if (this.k(q) === P_LBRACE || isLiteralKind(this.k(q))) {
        return false;
      }
    }
    return false;
  }
}

/** Whether `t` is a comment that ends its line. */
export const isTrailingComment = (d: Doc, t: i32): boolean => {
  if (clAt(d.kind, t) !== K_COMMENT) {
    return false;
  }
  const n = clAt(d.nxt, t);
  return clAt(d.type, t) === TT_LINE_COMMENT || n < 0 || clAt(d.nl, n) > 0;
};

/** Whether a `<name>` header token comes before `r` on the line that starts at `f`. */
const headerBefore = (d: Doc, f: i32, r: i32): boolean => {
  for (let t = f; t >= 0 && t !== r; t = clAt(d.nxt, t)) {
    if (clAt(d.kind, t) === K_HEADER) {
      return true;
    }
  }
  return false;
};

/** Spacing inside a directive: `#word`, then its arguments; `#define` bodies as code. */
const ppSpace = (d: Doc, l: i32, r: i32): boolean => {
  const f = clAt(d.lFirst, l);
  const pk = clAt(d.ppKind, f);
  const left = clAt(d.prv, r);
  if (left === f) {
    return false; // `#include`
  }
  if (clAt(d.kind, r) === K_COMMENT) {
    // A line comment trails with one space. A block comment is spaced as
    // code: none after an opening bracket (`#if (/*c*/ X)`), and past a
    // `<name>` (`#include <a.h>`, `__has_include(<a.h>)`), after which the
    // line is implicit string literals to clang-format, the whitespace it
    // was written with.
    const lineComment = clCommentType(d, r) === TT_LINE_COMMENT;
    const lk = clAt(d.kind, left);
    if (!lineComment && headerBefore(d, f, r)) {
      return clAt(d.ws, r) === 1;
    }
    if (!lineComment && (lk === P_LPAREN || lk === P_LSQUARE)) {
      return false;
    }
    return true;
  }
  if (clAt(d.prv, left) === f) {
    // `#if (` and `#elif (`: a control statement's parenthesis.
    if (clAt(d.kind, r) === P_LPAREN && (d.is(left, "if") || d.is(left, "elif"))) {
      return true;
    }
    // The first token after `#error` or `#warning` is TT_AfterPPDirective.
    if (pk === PP_ERROR) {
      return true;
    }
    return clAt(d.ws, r) === 1 || clAt(d.lType, l) === LT_IMPORT; // the directive's first argument
  }
  if (pk === PP_DEFINE && d.len(clAt(d.nxt, f)) === 6 && d.at(clAt(d.start, clAt(d.nxt, f))) === 100) {
    // `#define NAME(params) body`: params hug the name, the body is code.
    const name = clAt(d.nxt, clAt(d.nxt, f));
    if (r === clAt(d.nxt, name) && clAt(d.kind, r) === P_LPAREN) {
      return clAt(d.ws, r) === 1;
    }
    if (clAt(d.kind, clAt(d.nxt, name)) === P_LPAREN && clAt(d.match, clAt(d.nxt, name)) === left) {
      return true; // the body after the parameter list
    }
    if (left === name) {
      return true;
    }
    return spaceBeforeCode(d, l, r);
  }
  if (
    pk === PP_IF ||
    pk === PP_ELIF ||
    pk === PP_PRAGMA ||
    pk === PP_OTHER ||
    pk === PP_ELSE ||
    pk === PP_ENDIF ||
    pk === PP_ERROR
  ) {
    // Directive lines are formatted as code (implicit string literals keep
    // their own whitespace, see the formatter).
    return spaceBeforeCode(d, l, r);
  }
  return clAt(d.ws, r) === 1;
};

/** Whether one space goes before token `r` (LLVM style), given line `l`. */
export const spaceBefore = (d: Doc, l: i32, r: i32): boolean => {
  const lt = clAt(d.lType, l);
  if (lt === LT_PREPROCESSOR || lt === LT_IMPORT) {
    return ppSpace(d, l, r);
  }
  return spaceBeforeCode(d, l, r);
};

const spaceBeforeCode = (d: Doc, l: i32, r: i32): boolean => {
  const left = clAt(d.prv, r);
  if (left < 0) {
    return false;
  }
  // (Both tokens are the document's: one test of each against the tables.)
  const kind = d.kind;
  const type = d.type;
  const ul = toU32(left);
  const ur = toU32(r);
  if (ul >= toU32(kind.length) || ur >= toU32(kind.length) || ul >= toU32(type.length) || ur >= toU32(type.length)) {
    fault();
    return false;
  }
  const lk = kind[ul];
  const rk = kind[ur];
  const lt = type[ul];
  const rt = type[ur];
  // Around an implicit string literal the whitespace is as written.
  if (d.anyImplicit && (lt === TT_IMPLICIT_STRING_LITERAL || rt === TT_IMPLICIT_STRING_LITERAL)) {
    return clAt(d.ws, r) === 1;
  }
  // After a finalized token (inline assembly) too; `asm {` is spaced.
  if (d.anyAsm) {
    if (clAt(d.asmFin, left) === 1) {
      return clAt(d.ws, r) === 1;
    }
    if (rt === TT_INLINE_ASM_BRACE && rk === P_LBRACE) {
      return true;
    }
  }
  // `@class`, `@"str"`: Objective-C's `@` keeps the word after it.
  if (lk === P_AT && (isWordKind(rk) || rk === K_STRING)) {
    return false;
  }
  // An Objective-C method declaration: `- (T)sel:(T)arg`.
  const objc = clAt(d.lObjC, l);
  if (objc === 1 && clAt(d.type, clAt(d.lFirst, l)) === TT_OBJC_METHOD_SPECIFIER) {
    if (lt === TT_OBJC_METHOD_SPECIFIER) {
      return true;
    }
    if (lk === P_RPAREN && lt !== TT_ATTRIBUTE_RPAREN && isWordKind(rk)) {
      return false;
    }
  }
  // `@interface X (Category) <Protocol>`: clang-format's LT_ObjCDecl.
  if (objc === 2) {
    if (rk === P_LPAREN && lk !== P_AT) {
      return true;
    }
    if (rk === P_LESS) {
      // (Not before a lightweight generic's `<`, which a `:` follows.)
      const m = clAt(d.match, r);
      const n = m > r ? clAt(d.nxt, m) : -1;
      return !(n >= 0 && clAt(d.kind, n) === P_COLON);
    }
  }
  // `@property(getter=isOn)`: no spaces around `=` (clang-format's LT_ObjCProperty).
  if ((rk === P_EQUAL || lk === P_EQUAL) && isObjCPropertyLine(d, l)) {
    return false;
  }
  // A selector's `:` hugs the part before it and the argument after it.
  if (rt === TT_OBJC_METHOD_EXPR && rk === P_COLON) {
    return false;
  }
  if (lt === TT_OBJC_METHOD_EXPR && lk === P_COLON && rk !== K_COMMENT) {
    return false;
  }
  // `Args &&...a`: nothing after a pack's `...` that follows `&`, `&&` or `*`.
  if (
    lk === P_ELLIPSIS &&
    clAt(d.prv, left) >= 0 &&
    (clAt(d.kind, clAt(d.prv, left)) === P_STAR ||
      clAt(d.kind, clAt(d.prv, left)) === P_AMP ||
      clAt(d.kind, clAt(d.prv, left)) === P_AMPAMP) &&
    rt !== TT_LINE_COMMENT &&
    rt !== TT_BINARY_OPERATOR
  ) {
    return false;
  }
  if (rk === K_COMMENT) {
    if (rt === TT_LINE_COMMENT) {
      return !(
        clAt(d.bk, left) === BK_BRACED_INIT &&
        clAt(d.eqList, left) === 0 &&
        (lk === P_LBRACE || lk === P_LPAREN)
      );
    }
    if (
      lk === P_LPAREN ||
      lk === P_LSQUARE ||
      lt === TT_TEMPLATE_OPENER ||
      (lk === P_LBRACE && clAt(d.bk, left) !== BK_BLOCK) ||
      lk === KW_OPERATOR
    ) {
      return false;
    }
    // A unary operator hugs a block comment (`-/*c*/ 1`), but `*`.
    if (lt === TT_UNARY_OPERATOR && lk !== P_STAR) {
      return false;
    }
    return true;
  }
  const lw = isWordKind(lk);
  const rw = isWordKind(rk);
  if (lw && rw) {
    return true;
  }
  // (A `*` or `&` before it is a pointer for clang-format, whatever we call it.)
  if (
    rt === TT_FUNCTION_TYPE_LPAREN &&
    lk !== P_LPAREN &&
    lt !== TT_POINTER_OR_REFERENCE &&
    lt !== TT_CAST_RPAREN &&
    lk !== P_STAR &&
    lk !== P_AMP &&
    lk !== P_AMPAMP
  ) {
    return true;
  }
  if (lk === P_STAR && rk === K_COMMENT) {
    return true;
  }
  if (lk === KW_OPERATOR) {
    return rk === P_COLONCOLON;
  }
  // `vld3.8`, `SSE4.2`, `[[suppress(type.5)]]`: a number from `.` hugs the name.
  if (isIdentKind(lk) && rk === K_NUMBER) {
    return d.firstByte(r) !== 46;
  }
  if (lt === TT_OVERLOADED_OPERATOR && (rt === TT_TEMPLATE_OPENER || rt === TT_TEMPLATE_CLOSER)) {
    return true;
  }
  if (rk === P_PERIOD && lk === K_NUMBER) {
    return true;
  }
  if (
    rt === TT_TRAILING_RETURN_ARROW ||
    lt === TT_TRAILING_RETURN_ARROW ||
    rt === TT_LAMBDA_ARROW ||
    lt === TT_LAMBDA_ARROW
  ) {
    return true;
  }
  if (lk === P_COMMA && rt !== TT_OVERLOADED_OPERATOR_LPAREN) {
    return true;
  }
  if (rk === P_COMMA || rk === P_SEMI) {
    return lk === P_SEMI && rk === P_SEMI ? false : false;
  }
  if (
    rt === TT_CTOR_INITIALIZER_COLON ||
    rt === TT_RANGE_BASED_FOR_LOOP_COLON ||
    rt === TT_INHERITANCE_COLON ||
    lt === TT_BIT_FIELD_COLON
  ) {
    return true;
  }
  if (rk === P_COLON) {
    if (rt === TT_CASE_LABEL_COLON || rt === TT_GENERIC_SELECTION_COLON) {
      return false;
    }
    let n = clAt(d.nxt, r);
    while (n >= 0 && clAt(d.kind, n) === K_COMMENT) {
      n = clAt(d.nxt, n);
    }
    if (n < 0) {
      return false;
    }
    if (lk === P_QUESTION || (lk === P_COLONCOLON && rt === TT_INLINE_ASM_COLON)) {
      return false;
    }
    return true;
  }
  if (
    ((lk === P_MINUS || lk === P_MINUSMINUS) && (rk === P_MINUS || rk === P_MINUSMINUS)) ||
    ((lk === P_PLUS || lk === P_PLUSPLUS) && (rk === P_PLUS || rk === P_PLUSPLUS))
  ) {
    return true;
  }
  if (lt === TT_UNARY_OPERATOR) {
    // `not x`, `compl x`: an alternative token keeps its space (not before `(`).
    if ((lk === P_EXCLAIM || lk === P_TILDE) && clAt(d.width, left) > 1 && rk !== P_LPAREN) {
      return true;
    }
    return rt === TT_BINARY_OPERATOR;
  }
  if (lt === TT_CAST_RPAREN) {
    return rt === TT_BINARY_OPERATOR;
  }
  if (lk === P_GREATER && rk === P_GREATER) {
    // `X<T> > y`: a comparison after a template closer keeps its space.
    return lt === TT_TEMPLATE_CLOSER && rt !== TT_TEMPLATE_CLOSER;
  }
  if (
    rk === P_ARROW ||
    rk === P_ARROWSTAR ||
    rk === P_PERIODSTAR ||
    lk === P_ARROW ||
    lk === P_PERIOD ||
    lk === P_ARROWSTAR ||
    lk === P_PERIODSTAR ||
    (rk === P_PERIOD && rt !== TT_DESIGNATED_INITIALIZER_PERIOD)
  ) {
    return false;
  }
  if (rk === P_COLONCOLON) {
    if (isIdentKind(lk)) {
      // `ALWAYS_INLINE ::std::string`: a name that may be a macro keeps the space.
      return clAt(d.ws, r) === 1 && isPossibleMacro(d, left);
    }
    // (After a block comment: clang-format's rule for those, `/*x=*/` hugging.)
    if (lk === K_COMMENT) {
      const e = clAt(d.end, left);
      return !(e >= 3 && d.at(e - 3) === 61);
    }
    if (
      lk === P_LBRACE ||
      lk === P_LPAREN ||
      lk === P_RPAREN ||
      lk === P_LSQUARE ||
      lt === TT_TEMPLATE_OPENER ||
      lt === TT_TEMPLATE_CLOSER
    ) {
      return false;
    }
    return true;
  }
  if ((lt === TT_TEMPLATE_OPENER) !== (rt === TT_TEMPLATE_CLOSER)) {
    return false;
  }
  if (
    (rt === TT_BINARY_OPERATOR && lk !== P_LPAREN) ||
    ((lt === TT_BINARY_OPERATOR || lt === TT_ENUM_EQUAL || lt === TT_CONDITIONAL_EXPR) && rk !== P_RPAREN)
  ) {
    return true;
  }
  if (rt === TT_TRAILING_UNARY_OPERATOR) {
    return false;
  }
  // The general pair rules.
  if (lk === KW_RETURN && !(rk === P_SEMI || rk === P_RPAREN)) {
    return true;
  }
  if (
    lk === KW_THROW &&
    rk === P_LPAREN &&
    clAt(d.match, r) >= 0 &&
    clAt(d.type, clAt(d.match, r)) === TT_CAST_RPAREN
  ) {
    return true;
  }
  if (rk === P_HASHHASH) {
    return lk === P_HASH;
  }
  // `L#p`, `u8#p`: a string prefix stays on the stringizing `#`.
  if (rk === P_HASH && lk === K_IDENT && clAt(d.width, left) <= 3 && isStringPrefix(d, left)) {
    return false;
  }
  if (lk === P_HASHHASH || lk === P_HASH) {
    return rk === P_HASH;
  }
  if (
    (lk === P_LPAREN && rk === P_RPAREN) ||
    (lk === P_LBRACE && clAt(d.bk, left) !== BK_BLOCK && rk === P_RBRACE && clAt(d.bk, r) !== BK_BLOCK)
  ) {
    return false;
  }
  if (lk === KW_AUTO && (rt === TT_LAMBDA_LBRACE || rt === TT_FUNCTION_LBRACE)) {
    return true;
  }
  if (lk === KW_AUTO && (rk === P_LPAREN || rk === P_LBRACE)) {
    return false;
  }
  // co_await (x), co_yield (x), co_return (x); not `operator co_await(`.
  if ((lk === KW_CO_AWAIT || lk === KW_CO_YIELD || lk === KW_CO_RETURN) && !(rk === P_SEMI || rk === P_RPAREN)) {
    if (
      !(
        rk === P_LPAREN &&
        lk === KW_CO_AWAIT &&
        clAt(d.prv, left) >= 0 &&
        clAt(d.kind, clAt(d.prv, left)) === KW_OPERATOR
      )
    ) {
      return true;
    }
  }
  if (lk === P_LPAREN || rk === P_RPAREN) {
    return false;
  }
  if (rk === P_LESS && lk === KW_TEMPLATE) {
    return true;
  }
  if (lk === P_EXCLAIM || lk === P_TILDE) {
    return false;
  }
  if (lk === P_COLON) {
    return true;
  }
  if (lk === P_COLONCOLON) {
    return false;
  }
  if (lk === P_LESS || rk === P_GREATER || rk === P_LESS) {
    if (rt !== TT_OVERLOADED_OPERATOR_LPAREN) {
      return false;
    }
  }
  if (rk === P_ELLIPSIS) {
    return isLiteralKind(lk);
  }
  if (lk === P_LSQUARE && rk === P_AMP) {
    return false;
  }
  if (lk === P_ELLIPSIS && clAt(d.prv, left) >= 0 && clAt(d.type, clAt(d.prv, left)) === TT_POINTER_OR_REFERENCE) {
    return false;
  }
  if (rt === TT_POINTER_OR_REFERENCE) {
    if (isLiteralKind(lk)) {
      return true;
    }
    return !(lt === TT_POINTER_OR_REFERENCE || lk === P_LPAREN);
  }
  if (lt === TT_POINTER_OR_REFERENCE) {
    if (isLiteralKind(rk) || rt === TT_BLOCK_COMMENT) {
      return true;
    }
    if ((rk === CW_OVERRIDE || rk === CW_FINAL || rk === KW_NOEXCEPT) && rt !== TT_START_OF_NAME) {
      return true;
    }
    if (rk === P_LBRACE && clAt(d.bk, r) === BK_BLOCK) {
      return true;
    }
    return false;
  }
  if (rk === P_STAR && lk === P_LPAREN) {
    return false;
  }
  // A container literal (`x + [a, b]`) has spaces inside its brackets.
  if (lk === P_LSQUARE) {
    return lt === TT_ARRAY_INITIALIZER_LSQUARE && rk !== P_RSQUARE;
  }
  if (rk === P_RSQUARE) {
    return clAt(d.match, r) >= 0 && clAt(d.type, clAt(d.match, r)) === TT_ARRAY_INITIALIZER_LSQUARE;
  }
  if (
    rk === P_LSQUARE &&
    (lk === KW_AUTO || ((lk === KW_CONST || lk === KW_VOLATILE) && autoBeforeQualifiers(d, left)))
  ) {
    // A structured binding: `auto [a, b]`, `auto const [a, b]`.
    return true;
  }
  if (
    rk === P_LSQUARE &&
    !(
      rt === TT_LAMBDA_LSQUARE ||
      rt === TT_DESIGNATED_INITIALIZER_LSQUARE ||
      rt === TT_ATTRIBUTE_SQUARE ||
      rt === TT_OBJC_METHOD_EXPR
    ) &&
    lk !== K_NUMBER
  ) {
    return false;
  }
  if (lk === P_LBRACE && rk === P_RBRACE) {
    return clAt(d.childHead, left) >= 0;
  }
  if (rk === P_RBRACE && operatorNameEndsAt(d, left)) {
    // `{operator delete }`: clang-format reads the `}` as part of the
    // operator's name, so it never pairs with its `{`.
    return true;
  }
  if (
    (lk === P_LBRACE && clAt(d.bk, left) !== BK_BLOCK) ||
    (rk === P_RBRACE && clAt(d.match, r) >= 0 && clAt(d.bk, clAt(d.match, r)) !== BK_BLOCK)
  ) {
    return false;
  }
  if (lt === TT_BLOCK_COMMENT) {
    const e = clAt(d.end, left);
    return !(e >= 3 && d.at(e - 3) === 61);
  }

  if (lt === TT_TEMPLATE_CLOSER && rt === TT_ATTRIBUTE_SQUARE) {
    return true;
  }
  if (rk === P_LPAREN) {
    if (lt === TT_ATTRIBUTE_RPAREN || (lk === P_RSQUARE && lt === TT_ATTRIBUTE_SQUARE)) {
      return true;
    }
    if (lk === P_SEMI) {
      return true;
    }
    if (
      lk === KW_FOR ||
      lk === KW_WHILE ||
      lk === KW_SWITCH ||
      lk === KW_CASE ||
      lk === KW_CATCH ||
      isForEachMacro(d, left) ||
      // isIf(AllowConstexprMacro): `if X (` only outside a directive.
      lk === KW_IF ||
      ((lk === KW_CONSTEXPR || (lk === K_IDENT && clAt(d.lType, l) !== LT_PREPROCESSOR)) &&
        clAt(d.prv, left) >= 0 &&
        clAt(d.kind, clAt(d.prv, left)) === KW_IF)
    ) {
      return true;
    }
    if (rt === TT_OVERLOADED_OPERATOR_LPAREN) {
      return false;
    }
    // `new (p) T`, `::new (p) T`; not `x.new(` or `x->new(`.
    if (lk === KW_NEW || lk === KW_DELETE) {
      const bl = clAt(d.prv, left);
      if (!(bl >= 0 && (clAt(d.kind, bl) === P_PERIOD || clAt(d.kind, bl) === P_ARROW))) {
        return true;
      }
    }
    // `delete[] (p)`
    if (
      lk === P_RSQUARE &&
      clAt(d.match, left) >= 0 &&
      clAt(d.prv, clAt(d.match, left)) >= 0 &&
      clAt(d.kind, clAt(d.prv, clAt(d.match, left))) === KW_DELETE
    ) {
      return true;
    }
    return false;
  }
  if (rt === TT_UNARY_OPERATOR) {
    return !(lk === P_LPAREN || lk === P_LSQUARE);
  }
  // (A name or a simple type: other keywords keep the space, `noexcept {}`,
  // and so does `_asm`, a keyword for clang-format.)
  if (
    ((lk === K_IDENT &&
      !(d.at(clAt(d.start, left)) === 95 && (d.is(left, "_asm") || d.is(left, "__asm") || d.is(left, "__asm__")))) ||
      lk >= CW_OVERRIDE ||
      isSimpleTypeKind(lk) ||
      lk === P_GREATER ||
      lk === P_RSQUARE ||
      lk === P_RPAREN) &&
    rk === P_LBRACE &&
    clAt(d.bk, r) !== BK_BLOCK &&
    clAt(d.nxt, r) >= 0
  ) {
    return false;
  }
  if (lk === P_PERIOD || rk === P_PERIOD) {
    return false;
  }
  if (lt === TT_TEMPLATE_CLOSER && rk === P_LSQUARE) {
    return false;
  }
  return true;
};

// Kinds kept for the rules above that read them only in some branches.
export const CLASSIFY_KINDS: i32 =
  KW_STATIC +
  KW_STRUCT +
  KW_UNION +
  KW_CLASS +
  KW_ALIGNAS +
  TT_FUNCTION_DECLARATION_NAME +
  TT_CTOR_DTOR_DECL_NAME +
  TT_START_OF_NAME +
  TT_LAMBDA_LBRACE +
  KW_THIS +
  TT_TRAILING_ANNOTATION +
  P_LPAREN;

/** Whether identifier `t` has no lower-case letter. */
const noLower = (d: Doc, t: i32): boolean => {
  for (let i = clAt(d.start, t); i < clAt(d.end, t); i++) {
    const c = d.at(i);
    if (c >= 97 && c <= 122) {
      return false;
    }
  }
  return true;
};

/**
 * clang-format's isPossibleMacro(AllowFollowingColonColon): an all-caps name
 * of two or more characters, not qualified by a `::` before it.
 */
const isPossibleMacro = (d: Doc, t: i32): boolean => {
  const p = prevCode(d, t);
  return d.len(t) > 1 && !(p >= 0 && clAt(d.kind, p) === P_COLONCOLON) && noLower(d, t);
};

/** The token before `t`, comments skipped, or -1. */
export const prevCode = (d: Doc, t: i32): i32 => {
  let p = clAt(d.prv, t);
  while (p >= 0 && clAt(d.kind, p) === K_COMMENT) {
    p = clAt(d.prv, p);
  }
  return p;
};

/**
 * The token after `t` in the source, comments and other directives'
 * tokens skipped, or -1 (by index: the parser asks before tokens are linked).
 */
const nextCode = (d: Doc, t: i32): i32 => {
  const ppId = d.ppId;
  if (t < 0 || t >= ppId.length) {
    fault();
    return -1;
  }
  const pp = ppId[t];
  for (let n = t + 1; n < d.ntok; n++) {
    const k = clAt(d.kind, n);
    if (k === K_EOF) {
      return -1;
    }
    if (k === K_COMMENT || clAt(d.ppId, n) !== pp) {
      if (pp >= 0 && clAt(d.ppId, n) !== pp && k !== K_COMMENT) {
        return -1;
      }
      continue;
    }
    return n;
  }
  return -1;
};

/**
 * Whether `requires` at `rq` starts a requires clause rather than a requires
 * expression, by clang-format's guess (UnwrappedLineParser::parseRequires):
 * the token after it, then the one before it, then what its parentheses hold.
 */
export const requiresIsClause = (d: Doc, rq: i32): boolean => {
  const n = nextCode(d, rq);
  if (n >= 0 && clAt(d.kind, n) === P_LBRACE) {
    return false;
  }
  if (n < 0 || clAt(d.kind, n) !== P_LPAREN) {
    return true;
  }
  const p = prevCode(d, rq);
  if (p < 0) {
    return true;
  }
  const pk = clAt(d.kind, p);
  if (pk === P_GREATER || pk === P_RPAREN || pk === KW_NOEXCEPT || pk === KW_CONST) {
    return true;
  }
  if (pk === P_AMP || pk === P_AMPAMP) {
    const pp = prevCode(d, p);
    if (pp >= 0 && clAt(d.kind, pp) === KW_CONST) {
      return true;
    }
  } else {
    return isIdentKind(pk) || isSimpleTypeKind(pk) || pk === KW_AUTO;
  }
  // What the parentheses hold: a parameter list (`T t`, `const T &t`) or a
  // constraint.
  let foundType = false;
  let lastColonColon = false;
  let angles = 0;
  let q = nextCode(d, n);
  for (let i = 0; i < 50 && q >= 0; i++) {
    const qk = clAt(d.kind, q);
    if (qk === KW_VOLATILE || qk === KW_CONST || qk === P_COMMA) {
      if (angles === 0) {
        return false;
      }
    } else if (qk === P_RPAREN || qk === P_PIPEPIPE) {
      return true;
    } else if (qk === P_COLONCOLON) {
      lastColonColon = true;
    } else if (qk === K_IDENT) {
      if (foundType && !lastColonColon && angles === 0) {
        return false;
      }
      foundType = true;
      lastColonColon = false;
    } else if (qk === P_LESS) {
      if (angles >= CL_I32_MAX) {
        fault();
        return true;
      }
      angles++;
    } else if (qk === P_GREATER) {
      // (A stray `>` takes it below 0: computed in i64, it fits.)
      const na = toI64(angles) - toI64(1);
      if (na < toI64(-2147483648)) {
        fault();
        return true;
      }
      angles = toI32(na);
    } else if (isSimpleTypeKind(qk)) {
      return false;
    }
    q = nextCode(d, q);
  }
  return true;
};

/** Whether `{` at `lb` opens a requires expression's body (`requires {`, `requires(T t) {`). */
export const requiresExprBrace = (d: Doc, lb: i32): boolean => {
  let r = prevCode(d, lb);
  if (r >= 0 && clAt(d.kind, r) === P_RPAREN && clAt(d.match, r) >= 0) {
    r = prevCode(d, clAt(d.match, r));
  }
  return r >= 0 && clAt(d.kind, r) === KW_REQUIRES && !requiresIsClause(d, r);
};

/** Whether `auto` comes before token `t` past `const`, `volatile`, `&` and `&&` (a structured binding's specifiers). */
const autoBeforeQualifiers = (d: Doc, t: i32): boolean => {
  let q = t;
  while (
    q >= 0 &&
    (clAt(d.kind, q) === KW_CONST ||
      clAt(d.kind, q) === KW_VOLATILE ||
      clAt(d.kind, q) === P_AMP ||
      clAt(d.kind, q) === P_AMPAMP ||
      clAt(d.kind, q) === K_COMMENT)
  ) {
    q = clAt(d.prv, q);
  }
  return q >= 0 && clAt(d.kind, q) === KW_AUTO;
};

/** Whether token `t` ends an operator name (`operator delete`, `operator+`) with no `(` after `operator`. */
const operatorNameEndsAt = (d: Doc, t: i32): boolean => {
  let q = t;
  for (let n = 0; n < 4 && q >= 0; n++) {
    const k = clAt(d.kind, q);
    if (k === KW_OPERATOR) {
      return q !== t;
    }
    if (k === P_LPAREN || k === P_RPAREN || k === P_SEMI || k === P_COMMA || k === P_LBRACE || k === P_RBRACE) {
      return false;
    }
    q = clAt(d.prv, q);
  }
  return false;
};

/**
 * The words starting with `_` that clang's lexer, under clang-format's
 * language options (C++20, C99, Microsoft extensions, Objective-C), reads as
 * keywords (TokenKinds.def), each between spaces: no identifiers to
 * clang-format's annotator.
 */
const CLANG_RESERVED_KEYWORDS: string =
  " _Accum _Alignas _Alignof _BitInt _Complex _Decimal128 _Decimal32 _Decimal64 _ExtInt _Float16 _Fract _Generic" +
  " _Imaginary _Nonnull _Noreturn _Null_unspecified _Nullable _Nullable_result _Sat _Static_assert _Thread_local" +
  " __FUNCDNAME__ __FUNCSIG__ __FUNCTION__ __PRETTY_FUNCTION__ __alignof __alignof__ __array_extent __array_rank" +
  " __asm __asm__ __attribute __attribute__ __auto_type __bf16 __bridge __bridge_retain __bridge_retained" +
  " __bridge_transfer __builtin_COLUMN __builtin_FILE __builtin_FILE_NAME __builtin_FUNCSIG __builtin_FUNCTION" +
  " __builtin_LINE __builtin_alignof __builtin_available __builtin_bit_cast __builtin_choose_expr" +
  " __builtin_convertvector __builtin_offsetof __builtin_omp_required_simd_align __builtin_source_location" +
  " __builtin_va_arg __builtin_vectorelements __can_pass_in_regs __cdecl __char16_t __char32_t __complex" +
  " __complex__ __const __const__ __contravariant __covariant __datasizeof __declspec __decltype __extension__" +
  " __fastcall __float128 __forceinline __fp16 __func__ __funcref __has_nothrow_assign __has_nothrow_constructor" +
  " __has_nothrow_copy __has_nothrow_move_assign __has_trivial_assign __has_trivial_constructor" +
  " __has_trivial_copy __has_trivial_destructor __has_trivial_move_assign __has_trivial_move_constructor" +
  " __has_unique_object_representations __has_virtual_destructor __ibm128 __if_exists __if_not_exists __imag" +
  " __imag__ __inline __inline__ __int128 __int16 __int32 __int64 __int8 __interface __is_abstract __is_aggregate" +
  " __is_arithmetic __is_array __is_assignable __is_base_of __is_bounded_array __is_class __is_complete_type" +
  " __is_compound __is_const __is_constructible __is_convertible __is_convertible_to __is_destructible __is_empty" +
  " __is_enum __is_final __is_floating_point __is_function __is_fundamental __is_integral __is_interface_class" +
  " __is_literal __is_literal_type __is_lvalue_expr __is_lvalue_reference __is_member_function_pointer" +
  " __is_member_object_pointer __is_member_pointer __is_nothrow_assignable __is_nothrow_constructible" +
  " __is_nothrow_destructible __is_nullptr __is_object __is_pod __is_pointer __is_polymorphic __is_reference" +
  " __is_referenceable __is_rvalue_expr __is_rvalue_reference __is_same __is_same_as __is_scalar __is_scoped_enum" +
  " __is_sealed __is_signed __is_standard_layout __is_trivial __is_trivially_assignable" +
  " __is_trivially_constructible __is_trivially_copyable __is_trivially_destructible" +
  " __is_trivially_equality_comparable __is_trivially_relocatable __is_unbounded_array __is_union __is_unsigned" +
  " __is_void __is_volatile __kindof __label__ __module_private__ __multiple_inheritance __null __nullptr" +
  " __objc_no __objc_yes __pascal __private_extern__ __ptr32 __ptr64 __real __real__" +
  " __reference_binds_to_temporary __reference_constructs_from_temporary __regcall __restrict __restrict__" +
  " __signed __signed__ __single_inheritance __sptr __stdcall __super __thiscall __thread __typeof __typeof__" +
  " __unaligned __uptr __vectorcall __virtual_inheritance __volatile __volatile__ __w64 __wchar_t _alignof _asm" +
  " _declspec _inline _int16 _int32 _int64 _int8 _thiscall _vectorcall ";

/**
 * The identifiers among clang-format's canBePointerOrReferenceQualifier
 * keywords: `restrict` (C99 is on), `__restrict`, `__restrict__`, the
 * nullability qualifiers, `__ptr32`, `__ptr64` and `__funcref`.
 */
export const isPointerQualifierWord = (d: Doc, t: i32): boolean => {
  // (`__ptr32` and `__ptr64` lex as Microsoft keywords, KW_MS.)
  if (clAt(d.kind, t) === KW_MS) {
    return d.is(t, "__ptr32") || d.is(t, "__ptr64");
  }
  if (clAt(d.kind, t) !== K_IDENT) {
    return false;
  }
  return (
    d.is(t, "restrict") ||
    d.is(t, "__restrict") ||
    d.is(t, "__restrict__") ||
    d.is(t, "_Nonnull") ||
    d.is(t, "_Nullable") ||
    d.is(t, "_Null_unspecified") ||
    d.is(t, "__ptr32") ||
    d.is(t, "__ptr64") ||
    d.is(t, "__funcref")
  );
};

/** Whether identifier token `t` is a reserved-name keyword to clang's lexer (`__builtin_offsetof`, `__int64`). */
export const isReservedKeyword = (d: Doc, t: i32): boolean => {
  const a = clAt(d.start, t);
  const e = clAt(d.end, t);
  // (A token's bytes: 0 <= start <= end.)
  if (a < 0 || e < a) {
    fault();
    return false;
  }
  const n = toI32(toU32(e) - toU32(a)); // (exact: e >= a >= 0)
  const kw = CLANG_RESERVED_KEYWORDS;
  const m = kw.length;
  if (clAt(d.kind, t) !== K_IDENT || n < 3 || d.at(a) !== 95 || n >= m) {
    return false;
  }
  // A keyword of `n` bytes sits between the spaces at `i = j - n - 1` and `j`.
  for (let j = n + 1; j < m; j++) {
    const i = j - n - 1;
    if (i < 0 || i >= j || kw.charCodeAt(i) !== 32 || kw.charCodeAt(j) !== 32) {
      continue;
    }
    // Its bytes `kw[i + 1, j)` against the token's `[a, e)`, both `n` long.
    let same = true;
    let c = i + 1;
    let b = a;
    while (c < j && b < e) {
      if (kw.charCodeAt(c) !== d.at(b)) {
        same = false;
        break;
      }
      c++;
      b++;
    }
    if (same) {
      return true;
    }
  }
  return false;
};

/**
 * clang-format's FormatToken::isTypeName: a simple type specifier, or one of
 * the C library's type names it lists (CppNonKeywordTypes).
 */
export const isTypeName = (d: Doc, t: i32): boolean => {
  if (t < 0) {
    return false;
  }
  const k = clAt(d.kind, t);
  if (isSimpleTypeKind(k)) {
    return true;
  }
  if (k !== K_IDENT) {
    return false;
  }
  // Simple type specifiers the lexer has no kind for: keywords under
  // clang-format's LangOpts (MicrosoftExt is on: `__int64`, `_int64`).
  if (d.at(clAt(d.start, t)) === 95) {
    return (
      d.is(t, "__int64") ||
      d.is(t, "_int64") ||
      d.is(t, "__int128") ||
      d.is(t, "__bf16") ||
      d.is(t, "_Float16") ||
      d.is(t, "__float128") ||
      d.is(t, "__ibm128") ||
      d.is(t, "__auto_type")
    );
  }
  const w = d.len(t);
  // (Every one is 6 to 9 bytes and ends in `_t`: 95 `_`, 116 `t`.)
  const e = clAt(d.end, t);
  if (w < 6 || w > 9 || e < 2 || d.at(e - 2) !== 95 || d.lastByte(t) !== 116) {
    return false;
  }
  return (
    d.is(t, "clock_t") ||
    d.is(t, "int16_t") ||
    d.is(t, "int32_t") ||
    d.is(t, "int64_t") ||
    d.is(t, "int8_t") ||
    d.is(t, "intptr_t") ||
    d.is(t, "ptrdiff_t") ||
    d.is(t, "size_t") ||
    d.is(t, "time_t") ||
    d.is(t, "uint16_t") ||
    d.is(t, "uint32_t") ||
    d.is(t, "uint64_t") ||
    d.is(t, "uint8_t") ||
    d.is(t, "uintptr_t")
  );
};

/** Whether identifier `t` is a string literal prefix (`L`, `u`, `U`, `u8`, and their `R` forms). */
const isStringPrefix = (d: Doc, t: i32): boolean => {
  return (
    d.is(t, "L") ||
    d.is(t, "u") ||
    d.is(t, "U") ||
    d.is(t, "u8") ||
    d.is(t, "LR") ||
    d.is(t, "uR") ||
    d.is(t, "UR") ||
    d.is(t, "u8R")
  );
};

/** Whether line `l` starts with `@property` (clang-format's LT_ObjCProperty). */
export const isObjCPropertyLine = (d: Doc, l: i32): boolean => {
  const f = clAt(d.lFirst, l);
  const n = clAt(d.nxt, f);
  return clAt(d.kind, f) === P_AT && n >= 0 && clAt(d.kind, n) === K_IDENT && d.is(n, "property");
};
