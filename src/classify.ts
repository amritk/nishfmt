// Token roles and spacing.
//
// One forward pass per line over a bracket stack decides what each token is
// doing (a template bracket, a pointer declarator or a multiplication, a
// unary or binary operator, which kind of colon) and whether each bracket
// level holds an expression or a declaration. `spaceBefore` then answers the
// single space-or-none question for every adjacent pair, at LLVM style.

import { isForEachMacro, isQtWord } from "./parser";
import { Doc } from "./doc";
import {
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
  TT_LAMBDA_ARROW,
  TT_LAMBDA_LBRACE,
  TT_LAMBDA_LSQUARE,
  TT_LINE_COMMENT,
  TT_OVERLOADED_OPERATOR,
  TT_OVERLOADED_OPERATOR_LPAREN,
  TT_POINTER_OR_REFERENCE,
  TT_RANGE_BASED_FOR_LOOP_COLON,
  TT_START_OF_NAME,
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

export class Classifier {
  d: Doc;
  first: i32 = -1;
  line: i32 = -1;
  // Per-depth state.
  open: i32[]; // the opening token of each level (-1 at the top)
  expr: i32[]; // 1 when the level holds an expression
  tmpl: i32[]; // 1 inside template arguments
  lfd: i32[]; // 1 in an if/while condition's parens until a declaration is ruled out
  ctorSeen: boolean = false; // a constructor initializer list started before the current token
  fnEarly: boolean = false; // isFunctionName decided on the token before `operator` alone
  asg: i32[]; // 1 once the level has passed an assignment
  ques: i32[]; // pending `?` count, for matching `:`
  afterNew: i32[]; // 1 past a `new` at this depth: clang-format's CanBeExpression off
  caret: i32[]; // 1 past a unary `^` at this depth: clang-format's CaretFound
  bindAt: i32[]; // binding strength of each level
  depth: i32 = 0;
  inClass: boolean = false; // the enclosing scope is a class body
  lineHasRequires: boolean = false; // the line being classified holds `requires`

  constructor(d: Doc) {
    this.d = d;
    this.open = new Array<i32>(MAXD);
    this.expr = new Array<i32>(MAXD);
    this.tmpl = new Array<i32>(MAXD);
    this.lfd = new Array<i32>(MAXD);
    this.asg = new Array<i32>(MAXD);
    this.ques = new Array<i32>(MAXD);
    this.afterNew = new Array<i32>(MAXD);
    this.caret = new Array<i32>(MAXD);
    this.bindAt = new Array<i32>(MAXD);
  }

  k(t: i32): i32 {
    return t < 0 ? -1 : this.d.kind[t];
  }

  ty(t: i32): i32 {
    return t < 0 ? -1 : this.d.type[t];
  }

  /**
   * `T *[A::k]`: clang-format starts an Objective-C message at a `[` after a
   * pointer `*` and keeps it when the brackets hold more than one token and
   * no `(` follows; the `*` is then a binary operator (not after `new`).
   */
  objcStarBrackets(): void {
    const d = this.d;
    for (let t = this.first; t >= 0; t = d.nxt[t]) {
      if (d.kind[t] !== P_STAR || d.type[t] !== TT_POINTER_OR_REFERENCE) {
        continue;
      }
      const lb = d.nxt[t];
      if (lb < 0 || d.kind[lb] !== P_LSQUARE || d.type[lb] === TT_LAMBDA_LSQUARE || d.type[lb] === TT_ATTRIBUTE_SQUARE) {
        continue;
      }
      const rb = d.match[lb];
      if (rb < 0 || rb <= lb + 2) {
        continue;
      }
      const after = d.nxt[rb];
      if (after >= 0 && d.kind[after] === P_LPAREN) {
        continue;
      }
      let q = d.prv[t];
      while (q >= 0 && (isWordKind(d.kind[q]) || d.kind[q] === P_COLONCOLON) && d.kind[q] !== KW_NEW) {
        q = d.prv[q];
      }
      if (q >= 0 && d.kind[q] === KW_NEW) {
        continue;
      }
      d.type[t] = TT_BINARY_OPERATOR;
    }
  }

  /** Whether this line starts with `asm`, `__asm` or `__asm__` (clang-format's kw_asm). */
  lineStartsWithAsm(): boolean {
    const d = this.d;
    const f = this.first;
    if (f < 0) {
      return false;
    }
    if (d.kind[f] === KW_ASM) {
      return true;
    }
    if (d.kind[f] !== K_IDENT) {
      return false;
    }
    const tx = d.text(f);
    return tx === "__asm" || tx === "__asm__";
  }

  set(t: i32, tt: i32): void {
    if (this.d.final[t] === 0) {
      this.d.type[t] = tt;
    }
  }

  prev(t: i32): i32 {
    let p = this.d.prv[t];
    while (p >= 0 && this.d.kind[p] === K_COMMENT) {
      p = this.d.prv[p];
    }
    return p;
  }

  next(t: i32): i32 {
    let n = this.d.nxt[t];
    while (n >= 0 && this.d.kind[n] === K_COMMENT) {
      n = this.d.nxt[n];
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

  /** The `>` closing the template bracket at `lt`, or -1 if `<` compares. */
  findCloser(lt: i32, inExpr: boolean, parentLess: boolean): i32 {
    const d = this.d;
    let depth = 0;
    let t = d.nxt[lt];
    while (t >= 0) {
      const k = d.kind[t];
      if (depth === 0) {
        if (k === P_GREATER) {
          const n = d.nxt[t];
          if (n >= 0 && isLiteralKind(d.kind[n])) {
            return -1;
          }
          // `a < b >> 2`: a `>` right against another closes nothing unless
          // the `<` sits in template arguments (clang-format's parseAngle).
          if (n >= 0 && d.kind[n] === P_GREATER && d.ws[n] === 0 && !parentLess) {
            return -1;
          }
          return t;
        }
        if (k === P_LESS) {
          // clang-format's parseAngle: after a literal, `}` or `)` a `<`
          // opens nothing; one whose angle fails to close is an operator too.
          const p = this.prev(t);
          const pk = p >= 0 ? this.k(p) : -1;
          const binary = p >= 0 && (this.isLit(p) || pk === P_RBRACE || (pk === P_RPAREN && !(d.match[p] >= 0 && this.ty(d.match[p]) === TT_OVERLOADED_OPERATOR_LPAREN)));
          if (!binary) {
            const c = this.findCloser(t, false, true);
            if (c >= 0) {
              t = d.nxt[c];
              continue;
            }
          }
          t = d.nxt[t];
          continue;
        }
        // (A `{` is nested, as in `X<T{}>`: clang-format bails only on closers.)
        if (k === P_SEMI || k === P_RBRACE || k === P_RPAREN || k === P_RSQUARE) {
          return -1;
        }
        // (clang-format does not bail out on a line starting with `template`.)
        if (inExpr && d.kind[this.first] !== KW_TEMPLATE && (k === P_AMPAMP || k === P_PIPEPIPE || k === P_QUESTION || k === P_COLON)) {
          // An `&&` right before `>`, `,` or `...` is a reference type, not a binary operator.
          const n = d.nxt[t];
          if (!(k === P_AMPAMP && n >= 0 && (d.kind[n] === P_GREATER || d.kind[n] === P_COMMA || d.kind[n] === P_ELLIPSIS))) {
            return -1;
          }
        }
      }
      if (k === P_LPAREN || k === P_LSQUARE || k === P_LBRACE) {
        depth++;
      } else if (k === P_RPAREN || k === P_RSQUARE || k === P_RBRACE) {
        depth--;
        if (depth < 0) {
          return -1;
        }
      }
      t = d.nxt[t];
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
    if (pt === TT_CONDITIONAL_EXPR || pt === TT_CAST_RPAREN || pt === TT_UNARY_OPERATOR || pt === TT_BINARY_OPERATOR || pt === TT_TEMPLATE_OPENER) {
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
    if (this.expr[this.depth] === 1) {
      return;
    }
    const f = this.next(o);
    if (f < 0 || f === c) {
      return;
    }
    // A `*`/`&` first, or after a `::` (a pointer to member: `(C::*)`).
    let ptr = false;
    for (let q = f; q >= 0 && q !== c; q = this.next(q)) {
      const qk = this.k(q);
      if (qk === P_STAR || qk === P_AMP || qk === P_AMPAMP || qk === P_CARET) {
        const qp = this.prev(q);
        if (qp === o || (qp >= 0 && this.k(qp) === P_COLONCOLON)) {
          ptr = true;
          break;
        }
      }
      if (d.match[q] > q) {
        q = d.match[q];
      }
    }
    if (!ptr) {
      return;
    }
    for (let q = f; q >= 0 && q !== c; q = this.next(q)) {
      if (d.match[q] > q) {
        q = d.match[q];
        continue;
      }
      if (this.k(q) === P_COMMA) {
        return;
      }
    }
    // (The token right after `)`: a comment there hides what follows.)
    const n = d.nxt[c];
    if (n >= 0 && (this.k(n) === P_LPAREN || (this.k(n) === P_LSQUARE && d.lMustDecl[this.line] === 1))) {
      this.set(o, TT_FUNCTION_TYPE_LPAREN);
    }
  }

  /** Whether `t` sits in a requires clause: in its parens, or after `requires` at its depth. */
  /** Whether `(` at `t`, after `requires`, opens a requires expression's parameter list. */
  requiresExprParen(t: i32): boolean {
    const rq = this.prev(t);
    return rq >= 0 && !requiresIsClause(this.d, rq);
  }

  inRequiresClause(t: i32, dep: i32): boolean {
    const d = this.d;
    // Inside a requires clause's parentheses, at any depth, `&&` is binary.
    for (let x = dep; x > 0; x--) {
      const o = this.open[x];
      const op = this.prev(o);
      if (d.kind[o] === P_LPAREN && op >= 0 && this.k(op) === KW_REQUIRES && !this.requiresExprParen(o)) {
        return true;
      }
    }
    for (let q = this.prev(t); q >= 0; q = this.prev(q)) {
      const k = this.k(q);
      if (d.match[q] >= 0 && d.match[q] < q) {
        q = d.match[q];
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
    if (d.match[q0] >= 0 && d.match[q0] < q0) {
      q0 = d.match[q0];
    }
    for (let q = this.prev(q0); q >= 0; q = this.prev(q)) {
      const k = this.k(q);
      if (d.match[q] >= 0 && d.match[q] < q) {
        q = d.match[q];
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
        if (d.match[i] < 0) {
          return d.ntok;
        }
        i = this.next(d.match[i]);
      } else {
        let any = false;
        while (i >= 0 && (isWordKind(this.k(i)) || this.k(i) === P_COLONCOLON)) {
          // A word continues the clause only right after `::`, `&&`, `||`,
          // `!`, `requires` or `=` (a comment before it ends the clause).
          if (isWordKind(this.k(i))) {
            const rp = d.prv[i];
            const rk = rp >= 0 ? this.k(rp) : -1;
            if (!(rk === P_COLONCOLON || rk === P_AMPAMP || rk === P_PIPEPIPE || rk === P_EXCLAIM || rk === KW_REQUIRES || rk === P_EQUAL)) {
              break;
            }
          }
          any = true;
          i = this.next(i);
          if (i >= 0 && (this.k(i) === P_LESS || this.k(i) === P_LPAREN) && d.match[i] > i) {
            i = this.next(d.match[i]);
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
    const n = this.next(t);
    if (n < 0) {
      return TT_POINTER_OR_REFERENCE;
    }
    const nk = this.k(n);
    if (inTmpl && nk === KW_NOEXCEPT) {
      return TT_BINARY_OPERATOR;
    }
    if (nk === P_ARROW || nk === P_EQUAL || nk === P_COMMA || nk === P_RPAREN || (nk === KW_NOEXCEPT && !inExpr) || nk === KW_CONST || nk === KW_VOLATILE || (nk === P_LBRACE && this.next(n) < 0) || (nk === KW_REQUIRES && requiresIsClause(this.d, n))) {
      return TT_POINTER_OR_REFERENCE;
    }
    const pk = this.k(p);
    if (pk === P_COLONCOLON) {
      return TT_POINTER_OR_REFERENCE;
    }
    // After `decltype(...)` or `typeof(...)`: a type.
    if (pk === P_RPAREN && this.d.match[p] >= 0) {
      const mp = this.prev(this.d.match[p]);
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
    if ((nk === KW_OPERATOR && !inExpr) || nk === P_SEMI) {
      return TT_POINTER_OR_REFERENCE;
    }
    if (pk === P_RBRACE && this.k(t) === P_STAR && this.d.match[p] < 0) {
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
      if (this.isLit(q) || qk === KW_TRUE || qk === KW_FALSE || qk === P_PLUS || qk === P_MINUS || qk === P_EXCLAIM || qk === P_TILDE || qk === P_PLUSPLUS || qk === P_MINUSMINUS || qk === KW_SIZEOF || qk === KW_ALIGNOF) {
        return TT_BINARY_OPERATOR;
      }
    }
    if (inTmpl && isIdentKind(nk)) {
      return TT_BINARY_OPERATOR;
    }
    if (this.k(t) === P_AMPAMP && (nk === P_LPAREN || nk === P_STAR || nk === P_AMP)) {
      return TT_BINARY_OPERATOR;
    }
    if (isIdentKind(nk)) {
      const nn = this.next(n);
      if (nn >= 0 && this.k(nn) === P_ARROW) {
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
    if (this.depth > 0 && this.caret[this.depth - 1] === 1 && d.inPP[t] === 0) {
      return 0;
    }
    const p = this.prev(t);
    const pk = this.k(p);
    // (In a directive clang-format reads parentheses after a keyword as an
    // expression first, `for` and `catch` included.)
    if ((pk === KW_FOR || pk === KW_CATCH) && d.inPP[t] === 0) {
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
    if (pk === KW_GENERIC || pk === KW_IF || (pk === KW_CONSTEXPR && this.k(this.prev(p)) === KW_IF) || pk === KW_WHILE || pk === KW_SWITCH || pk === KW_STATIC_ASSERT || pk === KW_NOEXCEPT || pk === P_LPAREN || pk === P_COMMA || this.ty(p) === TT_BINARY_OPERATOR || pk === P_LESS || pk === KW_DECLTYPE || pk === KW_TYPEOF || pk === KW_RETURN) {
      return 1;
    }
    // A lambda's parameter list (past any `<...>`).
    let lp = p;
    if (pk === P_GREATER && d.match[p] >= 0 && d.match[p] < p && this.ty(d.match[p]) === TT_TEMPLATE_OPENER) {
      lp = this.prev(d.match[p]);
    }
    if (lp >= 0 && this.k(lp) === P_RSQUARE && d.match[lp] >= 0 && this.ty(d.match[lp]) === TT_LAMBDA_LSQUARE) {
      return 0;
    }
    // In a directive (a macro body), parens after a name keep the outer
    // context; any other parens hold an expression.
    if (d.inPP[t] === 1) {
      return p >= 0 && isIdentKind(pk) ? outer : 1;
    }
    // After a function type's parentheses (`(*fn)(...)`): parameters.
    if (pk === P_RPAREN && d.match[p] >= 0 && d.match[p] < p && this.ty(d.match[p]) === TT_FUNCTION_TYPE_LPAREN) {
      return 0;
    }
    if (d.lMustDecl[this.line] === 0) {
      return 1;
    }
    return outer;
  }

  /** Classifies line `l` and, recursively, its children. */
  classifyLine(l: i32): void {
    const d = this.d;
    this.line = l;
    // (Lines are classified again later: the scope is kept per line.)
    this.inClass = d.lInClass[l] === 1;
    this.first = d.lFirst[l];
    this.lineHasRequires = false;
    for (let t = this.first; t >= 0; t = d.nxt[t]) {
      if (d.kind[t] === KW_REQUIRES) {
        this.lineHasRequires = true;
        break;
      }
    }
    const lt = d.lType[l];
    const pk = d.ppKind[this.first];
    if (lt === LT_IMPORT || (lt === LT_PREPROCESSOR && pk !== PP_DEFINE && pk !== PP_IF && pk !== PP_ELIF && pk !== PP_PRAGMA && pk !== PP_OTHER)) {
      for (let t = this.first; t >= 0; t = d.nxt[t]) {
        d.nest[t] = 0;
        if (d.kind[t] === K_COMMENT) {
          d.type[t] = d.at(d.start[t] + 1) === 42 ? TT_BLOCK_COMMENT : TT_LINE_COMMENT;
        }
      }
      return;
    }
    const fk = this.k(this.first);
    const lineIsTemplate = fk === KW_TEMPLATE;
    const lineIsUsing = fk === KW_USING;
    this.depth = 0;
    this.open[0] = -1;
    // `#if` and `#elif` conditions are expressions.
    this.expr[0] = lt === LT_PREPROCESSOR && (pk === PP_IF || pk === PP_ELIF) ? 1 : 0;
    // (An #if condition stays an expression after any parentheses close.)
    this.asg[0] = this.expr[0];
    this.tmpl[0] = 0;
    this.ques[0] = 0;
    this.afterNew[0] = 0;
    this.caret[0] = 0;
    this.bindAt[0] = 1;
    let sawFnParams = false; // a top-level `(...)` that looks like parameters closed
    let autoFound = false; // an `auto` earlier on the line
    this.ctorSeen = false;
    // Brackets clang-format's annotator cannot match, or a line that starts
    // with `:`, which it cannot annotate either.
    let invalid = this.first >= 0 && d.kind[this.first] === P_COLON;
    let afterHeader = false; // past `__has_include(<...>`: the rest is implicit
    for (let t = this.first; t >= 0; t = d.nxt[t]) {
      d.match[t] = -1;
      if (d.final[t] === 0) {
        // A stray character (`\`, a backtick) is an implicit string literal.
        d.type[t] = (d.kind[t] === K_UNKNOWN || d.kind[t] === P_BACKSLASH || afterHeader) && d.kind[t] !== K_COMMENT ? TT_IMPLICIT_STRING_LITERAL : TT_UNKNOWN;
      }
      // clang-format's parseHasInclude: every token after the header's `<`
      // but comments is an implicit string literal.
      if (d.kind[t] === K_HEADER && d.inPP[t] === 1) {
        const p = d.prv[t];
        if (p >= 0 && d.kind[p] === P_LPAREN && d.prv[p] >= 0 && d.kind[d.prv[p]] === CW_HAS_INCLUDE) {
          afterHeader = true;
        }
      }
    }
    for (let t = this.first; t >= 0; t = d.nxt[t]) {
      const k = d.kind[t];
      const dep = this.depth;
      d.nest[t] = dep;
      d.bind[t] = this.bindAt[dep];
      if (k === K_COMMENT) {
        this.set(t, d.at(d.start[t] + 1) === 42 ? TT_BLOCK_COMMENT : TT_LINE_COMMENT);
        continue;
      }
      // `for` not followed by `(` (after an optional `co_await`): clang-format's
      // annotator gives up on the line.
      if (k === KW_FOR && d.lType[l] !== LT_PREPROCESSOR) {
        let n = d.nxt[t];
        if (n >= 0 && d.kind[n] === KW_CO_AWAIT) {
          n = d.nxt[n];
        }
        if (n < 0 || d.kind[n] !== P_LPAREN) {
          invalid = true;
        }
      }
      if (k === KW_NEW) {
        this.afterNew[dep] = 1;
      }
      // After a lambda's `->` the context holds a type (clang-format's
      // TrailingReturnArrow sets IsExpression off).
      if (k === P_ARROW && d.type[t] === TT_LAMBDA_ARROW) {
        this.expr[dep] = 0;
      }
      const pv = d.prv[t];
      if (pv >= 0 && d.type[pv] === TT_CTOR_INITIALIZER_COLON) {
        this.ctorSeen = true;
      }
      if (dep > 0 && this.lfd[dep] === 1 && k === K_IDENT) {
        // clang-format's parseParens(LookForDecls): `if (a *b ...)` without
        // `=` after `b` reads the `*` as a multiplication.
        const p = this.prev(t);
        const pp = p >= 0 ? this.prev(p) : -1;
        const n = d.nxt[t];
        if (pp >= 0 && this.k(pp) === K_IDENT && this.isPtrKind(p) && this.ty(p) === TT_POINTER_OR_REFERENCE && n >= 0 && this.k(n) !== P_EQUAL) {
          d.type[p] = TT_BINARY_OPERATOR;
          this.lfd[dep] = 0;
        }
      }
      // clang-format's parseParens: after a binary operator the parens hold
      // an expression; after `const`, `auto` or a simple type they do not.
      if (dep > 0 && this.k(this.open[dep]) === P_LPAREN) {
        const pt = this.prev(t);
        if (pt >= 0 && pt !== this.open[dep]) {
          if (this.ty(pt) === TT_BINARY_OPERATOR) {
            this.expr[dep] = 1;
          }
          const ptk = this.k(pt);
          if (ptk === KW_CONST || ptk === KW_AUTO || isSimpleTypeKind(ptk)) {
            const n = d.nxt[t];
            const fnTypeParen = k === P_LPAREN && n >= 0 && (this.k(n) === P_STAR || this.k(n) === P_AMP || this.k(n) === P_CARET);
            if (!(k === P_LBRACE || (k === P_LPAREN && !fnTypeParen))) {
              this.expr[dep] = 0;
            }
          }
        }
      }
      if (binPrecedence(k) === PREC_ASSIGNMENT && !lineIsUsing && fk !== KW_RETURN) {
        const p = this.prev(t);
        if (!(lineIsTemplate && (dep > 0 ? !this.templateParamDefault(t, dep) : this.templateDeclKeyword())) && !(p >= 0 && (this.k(p) === P_LSQUARE || this.k(p) === KW_OPERATOR))) {
          this.expr[dep] = 1;
          this.asg[dep] = 1;
          // What precedes an initializer is a declarator: `T *x = ...`.
          if (this.ty(this.first) !== TT_UNARY_OPERATOR) {
            let q = p;
            while (q >= 0 && d.prv[q] >= 0 && !(this.k(d.prv[q]) === P_COMMA || this.k(d.prv[q]) === P_SEMI)) {
              const qk = this.k(q);
              if ((qk === P_RSQUARE || qk === P_RPAREN || qk === P_GREATER) && d.match[q] >= 0 && d.match[q] < q) {
                q = d.match[q];
              }
              // (Its opener stops the walk too, as in clang-format.)
              const ok = this.k(q);
              if (ok === P_LPAREN || ok === P_LSQUARE || ok === P_LBRACE || this.ty(q) === TT_TEMPLATE_OPENER) {
                break;
              }
              if ((this.ty(q) === TT_BINARY_OPERATOR || this.ty(q) === TT_UNARY_OPERATOR) && this.isPtrKind(q) && d.prv[q] >= 0 && this.k(d.prv[q]) !== P_EQUAL) {
                d.type[q] = TT_POINTER_OR_REFERENCE;
              }
              q = d.prv[q];
            }
          }
        }
      }
      switch (k) {
        case P_LPAREN:
        case P_LSQUARE:
        case P_LBRACE: {
          if (k === P_LSQUARE && d.type[t] !== TT_LAMBDA_LSQUARE) {
            const n = d.nxt[t];
            const p = this.prev(t);
            if (n >= 0 && this.k(n) === P_LSQUARE && (p < 0 || this.k(p) !== P_LSQUARE)) {
              this.set(t, TT_ATTRIBUTE_SQUARE);
              this.set(n, TT_ATTRIBUTE_SQUARE);
            } else if (p >= 0 && this.ty(p) === TT_ATTRIBUTE_SQUARE && this.k(p) === P_LSQUARE) {
              // inner of `[[`
            } else if (dep > 0 && this.k(this.open[dep]) === P_LBRACE && p >= 0 && (this.k(p) === P_LBRACE || this.k(p) === P_COMMA)) {
              this.set(t, TT_DESIGNATED_INITIALIZER_LSQUARE);
            } else if (p >= 0 && (this.k(p) === KW_AUTO || ((this.k(p) === KW_CONST || this.k(p) === KW_VOLATILE || this.k(p) === P_AMP || this.k(p) === P_AMPAMP) && autoBeforeQualifiers(d, p)))) {
              // A structured binding: no subscript (it binds as any bracket).
            } else if (this.lineStartsWithAsm()) {
              // clang-format's InsideInlineASM: an operand's symbolic name.
              this.set(t, TT_INLINE_ASM_SYMBOLIC_NAME_LSQUARE);
            } else if (dep === 0 && p >= 0 && this.k(p) === P_COMMA) {
              // After a top-level `,` clang-format starts an Objective-C
              // message expression: no subscript.
            } else {
              this.set(t, TT_ARRAY_SUBSCRIPT_LSQUARE);
            }
          }
          if (k === P_LPAREN) {
            const p = this.prev(t);
            if (p >= 0 && this.k(p) === KW_ATTRIBUTE) {
              d.type[t] = TT_UNKNOWN;
            }
          }
          const nd = dep + 1;
          if (nd >= MAXD) {
            d.failed = true;
            return;
          }
          this.depth = nd;
          this.open[nd] = t;
          this.asg[nd] = 0;
          this.tmpl[nd] = 0;
          this.ques[nd] = 0;
          this.afterNew[nd] = 0;
          this.caret[nd] = 0;
          this.lfd[nd] = k === P_LPAREN && this.conditionParen(t) ? 1 : 0;
          if (k === P_LPAREN) {
            this.expr[nd] = this.parenIsExpr(t, this.expr[dep]);
          } else {
            this.expr[nd] = 1;
          }
          this.asg[nd] = this.expr[nd];
          this.bindAt[nd] = this.bindAt[dep] + (k === P_LSQUARE && d.type[t] === TT_ARRAY_SUBSCRIPT_LSQUARE ? 10 : 1);
          break;
        }
        case P_RPAREN:
        case P_RSQUARE:
        case P_RBRACE: {
          // Close the innermost matching level (template levels left open
          // by a stray `<` are dropped).
          let dd = this.depth;
          while (dd > 0) {
            const o = this.open[dd];
            const ok = this.k(o);
            if ((k === P_RPAREN && ok === P_LPAREN) || (k === P_RSQUARE && ok === P_LSQUARE) || (k === P_RBRACE && ok === P_LBRACE)) {
              break;
            }
            dd--;
          }
          if (dd > 0) {
            // Closing across an open `(`, `[` or `{` breaks the line for
            // clang-format (only stray `<` levels may be dropped).
            for (let x = dd + 1; x <= this.depth; x++) {
              if (this.k(this.open[x]) !== P_LESS) {
                invalid = true;
              }
            }
            const o = this.open[dd];
            d.match[o] = t;
            d.match[t] = o;
            d.nest[t] = dd;
            d.bind[t] = this.bindAt[dd];
            this.depth = dd - 1;
            if (k === P_RPAREN) {
              this.markFunctionType(o, t);
              const op = this.prev(o);
              if (op >= 0 && this.k(op) === KW_ATTRIBUTE) {
                this.set(t, TT_ATTRIBUTE_RPAREN);
              }
              // `decltype(...)` and `typeof(...)` name a type: not a parameter list.
              if (this.depth === 0 && d.lMustDecl[l] === 1 && this.expr[0] === 0 && !(op >= 0 && (this.k(op) === KW_ATTRIBUTE || this.k(op) === KW_REQUIRES || this.k(op) === KW_DECLTYPE || this.k(op) === KW_TYPEOF))) {
                sawFnParams = true;
                d.lMightFn[l] = 1;
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
          this.markPtrRun(t);
          if (d.lMustDecl[l] === 1 && !this.ctorSeen) {
            this.expr[this.depth] = this.asg[this.depth];
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
            const okPrev = p < 0 || !(this.isLit(p) || pk === P_RBRACE || (pk === P_RPAREN && dep > 0 && !(d.match[p] >= 0 && this.ty(d.match[p]) === TT_OVERLOADED_OPERATOR_LPAREN)) || (pk === KW_OPERATOR));
            if (okPrev) {
              const c = this.findCloser(t, this.expr[dep] === 1, dep > 0 && this.ty(this.open[dep]) === TT_TEMPLATE_OPENER);
              if (c >= 0) {
                isTmpl = true;
                this.set(t, TT_TEMPLATE_OPENER);
                this.set(c, TT_TEMPLATE_CLOSER);
                d.match[t] = c;
                d.match[c] = t;
                const nd = dep + 1;
                this.depth = nd;
                this.open[nd] = t;
                this.asg[nd] = 0;
                this.expr[nd] = 0;
                this.tmpl[nd] = pk === KW_TEMPLATE ? 0 : 1;
                this.ques[nd] = 0;
                this.afterNew[nd] = 0;
                this.caret[nd] = 0;
                this.lfd[nd] = 0;
                this.bindAt[nd] = this.bindAt[dep] + 12;
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
          if (this.ty(t) === TT_TEMPLATE_CLOSER && dep > 0 && this.open[dep] === d.match[t]) {
            d.nest[t] = dep;
            d.bind[t] = this.bindAt[dep];
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
            if (k === P_AMPAMP && this.inRequiresClause(t, dep)) {
              this.set(t, TT_BINARY_OPERATOR);
            } else {
              this.set(t, this.starRole(t, this.expr[dep] === 1 && this.afterNew[dep] === 0, this.tmpl[dep] === 1));
            }
          }
          break;
        case P_PLUS:
        case P_MINUS:
        case P_CARET:
          if (this.ty(t) === TT_UNKNOWN) {
            this.set(t, this.unaryByPrev(t) ? TT_UNARY_OPERATOR : TT_BINARY_OPERATOR);
          }
          if (k === P_CARET && this.ty(t) === TT_UNARY_OPERATOR) {
            this.caret[dep] = 1;
          }
          break;
        case P_PLUSPLUS:
        case P_MINUSMINUS: {
          const p = this.prev(t);
          if (p >= 0 && (this.k(p) === P_RPAREN || this.k(p) === P_RSQUARE || isIdentKind(this.k(p))) && this.ty(p) !== TT_CAST_RPAREN) {
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
            this.expr[dep] = 1;
          }
          break;
        case P_QUESTION:
          this.set(t, TT_CONDITIONAL_EXPR);
          this.ques[dep] = this.ques[dep] + 1;
          this.expr[dep] = 1;
          break;
        case P_COLON:
          this.classifyColon(t, dep);
          break;
        case P_COMMA:
          this.markPtrRun(t);
          if (this.ty(this.prevCtorColon(t, dep)) === TT_CTOR_INITIALIZER_COLON) {
            this.set(t, TT_CTOR_INITIALIZER_COMMA);
          }
          // (Inside a constructor initializer list clang-format leaves it be.)
          if (d.lMustDecl[l] === 1 && !this.ctorSeen) {
            this.expr[dep] = 0;
          }
          // A foreach macro's arguments after the first are expressions.
          if (dep > 0 && this.k(this.open[dep]) === P_LPAREN && this.prev(this.open[dep]) >= 0 && isForEachMacro(d, this.prev(this.open[dep]))) {
            this.expr[dep] = 1;
          }
          break;
        case P_PERIOD: {
          const p = this.prev(t);
          if (p >= 0 && (this.k(p) === P_COMMA || this.k(p) === P_LBRACE)) {
            this.set(t, TT_DESIGNATED_INITIALIZER_PERIOD);
          }
          break;
        }
        case P_SEMI: {
          // In `for (...)`, what follows the first `;` is an expression.
          const o = this.open[dep];
          if (dep > 0 && this.k(o) === P_LPAREN && this.prev(o) >= 0 && this.k(this.prev(o)) === KW_FOR) {
            this.expr[dep] = 1;
          }
          break;
        }
        case KW_RETURN:
        case KW_THROW:
        case KW_CASE:
        case KW_CO_AWAIT:
        case KW_CO_YIELD:
        case KW_CO_RETURN:
          this.expr[dep] = 1;
          break;
        case P_LESSLESS:
          if (this.ty(t) !== TT_OVERLOADED_OPERATOR) {
            this.expr[dep] = 1;
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
          break;
      }
      // Names: an identifier following a type.
      if (isIdentKind(k) && this.ty(t) === TT_UNKNOWN && this.isStartOfName(t) && !(sawFnParams && d.nest[t] === 0)) {
        this.set(t, TT_START_OF_NAME);
      }
      if (sawFnParams && d.nest[t] === 0 && this.ty(t) === TT_UNKNOWN && (isIdentKind(k) || k === KW_CONST || k === KW_NOEXCEPT) && !this.afterEqualOrCtorInit(t)) {
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
        if (p >= 0 && (this.k(p) === KW_NOEXCEPT || this.k(p) === P_RBRACE || (autoFound && d.lMightFn[l] === 1 && d.nest[t] === 0 && this.k(p) !== K_IDENT && this.k(p) !== KW_OPERATOR) || this.isDeductionGuide(t))) {
          this.set(t, TT_TRAILING_RETURN_ARROW);
        }
      }
    }
    // An unclosed `(` or `[` breaks the line too.
    for (let x = 1; x <= this.depth; x++) {
      const ok = this.k(this.open[x]);
      if (ok === P_LPAREN || ok === P_LSQUARE) {
        invalid = true;
      }
    }
    d.lInvalid[l] = invalid ? 1 : 0;
    // A directive line is annotated as a directive: no function declaration
    // (clang-format's parsePreprocessorDirective never sets one).
    if (d.lType[l] === LT_PREPROCESSOR) {
      d.lMightFn[l] = 0;
    }
    this.markAnnotationParens();
    this.markDeclName(l);
    this.operatorCallOperands();
    this.keepBreakAfterAttributes();
    // A function declaration line ending in `};` has a body, not a braced
    // list, before its `;` (clang-format re-marks those braces).
    const last = d.lLast[l];
    const lp = d.prv[last];
    if (d.kind[last] === P_SEMI && lp >= 0 && d.kind[lp] === P_RBRACE && d.match[lp] >= 0 && d.match[lp] < lp) {
      let fn = false;
      for (let q = this.first; q >= 0 && q !== lp; q = d.nxt[q]) {
        if (d.type[q] === TT_FUNCTION_DECLARATION_NAME) {
          fn = true;
          break;
        }
      }
      if (fn) {
        const lb = d.match[lp];
        d.bk[lb] = BK_BLOCK;
        d.bk[lp] = BK_BLOCK;
        d.type[lb] = TT_FUNCTION_LBRACE;
      }
    }
    // `virtual` outside any brackets: a virtual function's declaration.
    if (d.lType[l] === LT_OTHER) {
      for (let t = this.first; t >= 0; t = d.nxt[t]) {
        if (d.kind[t] === KW_VIRTUAL && d.nest[t] === 0) {
          d.lType[l] = LT_VIRTUAL_FUNCTION_DECL;
          break;
        }
      }
    }
    // A trailing comma (or comment) before `}` puts the list one per line.
    for (let t = this.first; t >= 0; t = d.nxt[t]) {
      if (d.kind[t] === P_RBRACE && d.match[t] >= 0) {
        const o = d.match[t];
        let p = d.prv[t];
        if (p !== o && (d.kind[p] === P_COMMA || (d.kind[p] === K_COMMENT && isTrailingComment(d, p)))) {
          d.mustBreak[t] = 1;
          if (d.bk[o] !== BK_BLOCK || d.type[o] === 18) {
            const n = d.nxt[o];
            if (n >= 0 && n !== t) {
              d.mustBreak[n] = 1;
            }
          }
        }
      }
    }
    this.objcStarBrackets();
    // Children: lambda bodies, statements in function bodies.
    for (let t = this.first; t >= 0; t = d.nxt[t]) {
      let c = d.childHead[t];
      while (c >= 0) {
        const saveFirst = this.first;
        this.classifyLine(c);
        this.line = l;
        this.first = saveFirst;
        c = d.lSibling[c];
      }
    }
  }

  /** The ctor-initializer colon governing a comma at depth `dep`, or -1. */
  prevCtorColon(t: i32, dep: i32): i32 {
    if (dep !== 0) {
      return -1;
    }
    for (let p = this.d.prv[t]; p >= 0; p = this.d.prv[p]) {
      if (this.d.nest[p] === 0 && this.d.kind[p] === P_COLON) {
        return p;
      }
    }
    return -1;
  }

  /** Whether `t` is the first token of a `#define` body joined onto the directive. */
  startsDefineBody(t: i32): boolean {
    const d = this.d;
    const f = this.first;
    if (d.kind[f] !== P_HASH || d.ppKind[f] !== PP_DEFINE) {
      return false;
    }
    const w = d.nxt[f];
    const name = w >= 0 ? d.nxt[w] : -1;
    if (name < 0) {
      return false;
    }
    let p = d.prv[t];
    const n = d.nxt[name];
    if (n >= 0 && d.kind[n] === P_LPAREN && d.ws[n] === 0 && d.match[n] > n) {
      return p === d.match[n];
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
    const o = this.open[dep];
    if (this.k(o) !== P_LESS || this.ty(o) !== TT_TEMPLATE_OPENER || o !== this.next(this.first)) {
      return false;
    }
    const p = this.prev(t);
    const pp = p >= 0 ? this.prev(p) : -1;
    return pp >= 0 && this.k(pp) !== KW_TYPENAME && this.k(pp) !== KW_CLASS;
  }

  /** Whether `(` (token `t`) holds an `if` or `while` condition. */
  conditionParen(t: i32): boolean {
    const p = this.prev(t);
    if (p < 0) {
      return false;
    }
    const pk = this.k(p);
    if (pk === KW_IF || pk === KW_WHILE) {
      return true;
    }
    const pp = this.prev(p);
    return (pk === KW_CONSTEXPR || pk === K_IDENT) && pp >= 0 && this.k(pp) === KW_IF;
  }

  templateDeclKeyword(): boolean {
    const d = this.d;
    const lt = this.next(this.first);
    if (lt < 0 || this.k(lt) !== P_LESS || d.match[lt] < 0) {
      return false;
    }
    const n = this.next(d.match[lt]);
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
    let p = this.d.prv[t];
    while (p >= 0 && (this.k(p) === P_STAR || this.k(p) === P_AMP)) {
      this.set(p, TT_POINTER_OR_REFERENCE);
      p = this.d.prv[p];
    }
  }

  markOperatorName(t: i32): void {
    const d = this.d;
    let n = d.nxt[t];
    if (n < 0) {
      return;
    }
    if (this.k(n) === P_LPAREN && d.nxt[n] >= 0 && this.k(d.nxt[n]) === P_RPAREN) {
      const after = d.nxt[d.nxt[n]];
      if (after >= 0 && this.k(after) === P_LESS) {
        // `operator()<T>()`: clang-format types only the first `(`.
        this.set(n, TT_OVERLOADED_OPERATOR_LPAREN);
        return;
      }
      this.set(n, TT_OVERLOADED_OPERATOR);
      this.set(d.nxt[n], TT_OVERLOADED_OPERATOR);
      const lp = d.nxt[d.nxt[n]];
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
            depth++;
          } else if (qk === P_GREATER) {
            depth--;
            if (depth === 0) {
              break;
            }
          }
          q = d.nxt[q];
        }
        if (q >= 0 && this.k(q) === P_GREATER) {
          n = d.nxt[q];
          continue;
        }
      }
      if (!isWordKind(nk) && nk !== P_COLONCOLON) {
        if (nk === P_STAR || nk === P_AMP) {
          // `operator*` vs `operator Foo*`.
          const p = this.prev(n);
          this.set(n, p === t ? TT_OVERLOADED_OPERATOR : TT_POINTER_OR_REFERENCE);
        } else if (nk !== P_LESS && nk !== P_GREATER || this.prev(n) === t) {
          this.set(n, TT_OVERLOADED_OPERATOR);
        } else if (nk === P_GREATER && d.ws[n] === 0 && this.k(this.prev(n)) === P_GREATER && this.ty(this.prev(n)) === TT_OVERLOADED_OPERATOR) {
          // `operator>>`: the lexer splits `>>` into two `>`.
          this.set(n, TT_OVERLOADED_OPERATOR);
        }
      }
      if (nk === P_LSQUARE) {
        const c = d.nxt[n];
        if (c >= 0) {
          // (`operator[]<T>`: clang-format leaves that `]` untyped.)
          const cn = d.nxt[c];
          if (!(cn >= 0 && this.k(cn) === P_LESS)) {
            this.set(c, TT_OVERLOADED_OPERATOR);
          }
          n = c;
        }
      }
      n = d.nxt[n];
    }
    if (n >= 0 && this.k(n) === P_LPAREN) {
      this.set(n, TT_OVERLOADED_OPERATOR_LPAREN);
    }
  }

  classifyColon(t: i32, dep: i32): void {
    const d = this.d;
    if (d.final[t] === 1 || this.ty(t) === TT_CASE_LABEL_COLON) {
      return;
    }
    if (this.ques[dep] > 0) {
      this.ques[dep] = this.ques[dep] - 1;
      this.set(t, TT_CONDITIONAL_EXPR);
      return;
    }
    if (this.ty(this.open[dep]) === TT_ATTRIBUTE_SQUARE) {
      return;
    }
    // `_Generic(x, int: a, ...)`: an association's colon.
    if (dep >= 1 && this.k(this.open[dep]) === P_LPAREN && this.prev(this.open[dep]) >= 0 && this.k(this.prev(this.open[dep])) === KW_GENERIC) {
      this.set(t, TT_GENERIC_SELECTION_COLON);
      return;
    }
    // `for (x : xs)`.
    if (dep >= 1) {
      const o = this.open[dep];
      if (this.k(o) === P_LPAREN && this.k(this.prev(o)) === KW_FOR && dep === 1) {
        this.set(t, TT_RANGE_BASED_FOR_LOOP_COLON);
        return;
      }
      // Any other colon right inside parentheses: an inline assembly
      // operand separator (unless it reads as an Objective-C selector's).
      if (this.k(o) === P_LPAREN && !(d.lType[this.line] === LT_PREPROCESSOR && d.ppKind[this.first] === PP_PRAGMA)) {
        const n = this.next(t);
        if (n >= 0 && this.k(n) === K_NUMBER) {
          this.set(t, TT_BIT_FIELD_COLON);
          return;
        }
        const p = this.prev(t);
        if (p >= 0 && isWordKind(this.k(p)) && n >= 0) {
          const nk = this.k(n);
          const nn = this.next(n);
          if (nk === P_RPAREN || nk === P_COMMA || (isWordKind(nk) && nn >= 0 && this.k(nn) === P_COLON)) {
            return;
          }
        }
        this.set(t, TT_INLINE_ASM_COLON);
      }
      return;
    }
    const n = this.next(t);
    if (n >= 0 && this.k(n) === K_NUMBER) {
      this.set(t, TT_BIT_FIELD_COLON);
      return;
    }
    const fk = this.k(this.first);
    if (fk === KW_ENUM || fk === KW_CASE || fk === KW_DEFAULT || fk === KW_PUBLIC || fk === KW_PRIVATE || fk === KW_PROTECTED || isQtWord(d, this.first, true)) {
      return;
    }
    const p = this.prev(t);
    if (p < 0) {
      return;
    }
    // (After a requires clause's last token too: `requires C<T> : x(1)`.)
    if (this.k(p) === P_RPAREN || this.k(p) === KW_NOEXCEPT || this.closesRequiresClause(p)) {
      this.set(t, TT_CTOR_INITIALIZER_COLON);
      this.expr[0] = 1;
      return;
    }
    if (n < 0) {
      return; // a label
    }
    this.set(t, TT_INHERITANCE_COLON);
  }

  isStartOfName(t: i32): boolean {
    const d = this.d;
    const p0 = d.prv[t];
    if (p0 < 0) {
      return false;
    }
    const n = this.next(t);
    if ((n < 0 && d.lPP[this.line] === 0) || (n >= 0 && (this.isPtrKind(n) || this.k(n) === K_STRING))) {
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
      const m = d.match[p];
      if (m < 0) {
        return false;
      }
      const mp = d.prv[m];
      return mp >= 0 && this.k(mp) !== P_PERIOD && this.k(mp) !== KW_TEMPLATE;
    }
    if (pt === TT_ATTRIBUTE_RPAREN) {
      return true;
    }
    if (pk === P_RPAREN && d.match[p] >= 0 && d.prv[d.match[p]] >= 0) {
      const mp = this.prev(d.match[p]);
      if (mp >= 0 && (this.k(mp) === KW_DECLTYPE || this.k(mp) === KW_TYPEOF)) {
        return true;
      }
    }
    if (isIdentKind(pk)) {
      // Not a directive's name (`#define X`).
      const pp = d.prv[p];
      return !(pp >= 0 && this.k(pp) === P_HASH);
    }
    if (pk === KW_AUTO || pt === TT_POINTER_OR_REFERENCE || isSimpleTypeKind(pk)) {
      return true;
    }
    return false;
  }

  /** Whether `)` at `t` ends a C-style cast: clang-format's rParenEndsCast. */
  endsCast(t: i32): boolean {
    const d = this.d;
    const m = d.match[t];
    const n = d.nxt[t];
    if (m < 0 || n < 0 || d.prv[t] === m) {
      return false;
    }
    if (this.ty(m) === TT_OVERLOADED_OPERATOR_LPAREN) {
      return false;
    }
    let lop = this.prev(m);
    if (lop >= 0) {
      // A `)` that is not a cast before these parens: look past it (chained casts).
      if (this.k(lop) === P_RPAREN && this.ty(lop) !== TT_CAST_RPAREN) {
        if (d.match[lop] < 0 || d.prv[d.match[lop]] < 0) {
          return false;
        }
        lop = d.prv[d.match[lop]];
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
      if (isWordKind(lk) && d.prv[lop] >= 0 && this.k(d.prv[lop]) === KW_OPERATOR) {
        return false;
      }
      if (isWordKind(lk) && !(lk === KW_RETURN || lk === KW_CASE || lk === KW_DELETE || lk === KW_THROW)) {
        return false;
      }
      if (lk === P_RSQUARE || this.ty(lop) === TT_OVERLOADED_OPERATOR || this.ty(lop) === TT_TEMPLATE_CLOSER || lk === P_ELLIPSIS) {
        return false;
      }
    }
    const nk = this.k(n);
    if (nk === P_QUESTION || nk === P_AMPAMP) {
      return false;
    }
    if (nk === KW_NOEXCEPT || nk === KW_VOLATILE || nk === KW_CONST || nk === KW_REQUIRES || nk === KW_THROW || nk === P_ARROW || nk === CW_OVERRIDE || nk === CW_FINAL) {
      return false;
    }
    if (nk === P_LSQUARE && d.nxt[n] >= 0 && this.k(d.nxt[n]) === P_LSQUARE) {
      return false; // a [[attribute]]
    }
    if (nk === KW_SIZEOF || nk === KW_ALIGNOF || (isLiteralKind(nk) && nk !== K_STRING)) {
      return true;
    }
    const tp = d.prv[t];
    const parensAreType = this.ty(tp) === TT_TEMPLATE_CLOSER || isSimpleTypeKind(this.k(tp)) || this.qualifiedPointer(tp);
    const couldEndDecl = nk === P_EQUAL || nk === P_SEMI || nk === P_LBRACE || nk === P_GREATER;
    if (parensAreType && !couldEndDecl) {
      return true;
    }
    if (lop < 0) {
      return false;
    }
    for (let q = d.nxt[m]; q >= 0 && q !== t; q = d.nxt[q]) {
      if (this.ty(q) === TT_BINARY_OPERATOR) {
        return false;
      }
    }
    if (isIdentKind(nk) || nk === KW_THIS) {
      return true;
    }
    if (nk === P_LPAREN && tp >= 0 && d.prv[tp] >= 0 && isIdentKind(this.k(tp)) && this.k(d.prv[tp]) === P_LPAREN) {
      return true;
    }
    const nn = d.nxt[n];
    if (nn < 0) {
      return false;
    }
    const ampOrStar = nk === P_AMP || nk === P_STAR;
    const unary = nk === P_PLUS || nk === P_PLUSPLUS || nk === P_MINUS || nk === P_MINUSMINUS || nk === P_EXCLAIM || nk === P_TILDE || nk === KW_SIZEOF || nk === KW_ALIGNOF;
    const nnk = this.k(nn);
    if (!(unary || ampOrStar) || nk === P_PLUS || !(isIdentKind(nnk) || nnk === K_NUMBER)) {
      return false;
    }
    const inPP = d.lType[this.line] === LT_PREPROCESSOR || d.inPP[t] === 1;
    if (ampOrStar && (nnk === K_NUMBER || inPP)) {
      return false;
    }
    if (inPP && nk === P_MINUS) {
      return false;
    }
    for (let q = tp; q >= 0 && q !== m; q = d.prv[q]) {
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
      if (this.ty(t) === TT_ATTRIBUTE_RPAREN && this.d.match[t] >= 0) {
        t = this.prev(this.d.match[t]);
        if (t >= 0) {
          t = this.prev(t);
        }
        continue;
      }
      if (this.ty(t) === TT_ATTRIBUTE_SQUARE && this.d.match[t] >= 0 && this.d.match[t] < t) {
        t = this.prev(this.d.match[t]);
        continue;
      }
      if (k === KW_CONST || k === KW_VOLATILE || (k === K_IDENT && (this.d.text(t) === "restrict" || this.d.text(t) === "__restrict" || this.d.text(t) === "_Nonnull" || this.d.text(t) === "_Nullable"))) {
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
    for (let t = this.first; t >= 0; t = d.nxt[t]) {
      if (d.kind[t] !== P_RPAREN || d.match[t] < 0 || !(this.ty(t) === TT_UNKNOWN || this.ty(t) === TT_CAST_RPAREN)) {
        continue;
      }
      const n = d.nxt[t];
      if (n < 0) {
        continue;
      }
      const nk = d.kind[n];
      if (binPrecedence(nk) > PREC_COMMA || nk === P_SEMI || nk === P_COLON || nk === P_LBRACE || nk === P_COMMA || nk === P_PERIOD || nk === P_ARROW || nk === P_COLONCOLON || nk === KW_NOEXCEPT || nk === P_CARET) {
        continue;
      }
      const b = d.prv[d.match[t]];
      if (b < 0 || d.kind[b] !== K_IDENT || !this.noLower(b)) {
        continue;
      }
      const bp = d.prv[b];
      if (bp >= 0 && !(this.ty(bp) === TT_TEMPLATE_CLOSER && d.match[bp] >= 0 && d.prv[d.match[bp]] >= 0 && d.kind[d.prv[d.match[bp]]] === KW_TEMPLATE)) {
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
    for (let t = d.nxt[this.first]; t >= 0; t = d.nxt[t]) {
      const ty = this.ty(t);
      if (ty === TT_START_OF_NAME) {
        seenName = true;
      }
      const p = d.prv[t];
      if (d.kind[p] === P_RSQUARE && this.ty(p) === TT_ATTRIBUTE_SQUARE && d.match[p] >= 0 && d.nxt[d.match[p]] >= 0 && d.kind[d.nxt[d.match[p]]] === P_LSQUARE) {
        after = t;
      }
      if (ty === TT_CTOR_DTOR_DECL_NAME || ty === TT_FUNCTION_DECLARATION_NAME) {
        seenName = true;
        isFunction = ty === TT_FUNCTION_DECLARATION_NAME;
        break;
      }
    }
    if (seenName && after >= 0 && d.nl[after] > 0) {
      d.mustBreak[after] = 2; // a kept break, which the annotator honours as such
      if (isFunction) {
        d.lRetWrap[this.line] = 1;
      }
    }
  }

  /** Whether identifier `t` has no lower-case letter. */
  noLower(t: i32): boolean {
    const d = this.d;
    for (let i = d.start[t]; i < d.end[t]; i++) {
      const c = d.at(i);
      if (c >= 97 && c <= 122) {
        return false;
      }
    }
    return true;
  }

  /** Whether the `->` at `t` is a deduction guide's: `A(...) -> A<...>;`. */
  isDeductionGuide(t: i32): boolean {
    const d = this.d;
    const p = d.prv[t];
    const n = d.nxt[t];
    if (p < 0 || d.kind[p] !== P_RPAREN || d.match[p] < 0 || n < 0 || d.kind[n] !== K_IDENT) {
      return false;
    }
    let c = d.nxt[n];
    if (c < 0 || d.kind[c] !== P_LESS) {
      return false;
    }
    let level = 0;
    let paren = 0;
    while (c >= 0) {
      const k = d.kind[c];
      if (k === P_LPAREN) {
        paren++;
      } else if (k === P_RPAREN) {
        paren--;
      } else if (paren === 0 && k === P_LESS) {
        level++;
      } else if (paren === 0 && k === P_GREATER) {
        level--;
      }
      if (paren === 0 && level < 1) {
        break;
      }
      c = d.nxt[c];
    }
    if (c < 0 || d.nxt[c] < 0 || d.kind[d.nxt[c]] !== P_SEMI) {
      return false;
    }
    const lead = d.prv[d.match[p]];
    return lead >= 0 && d.text(lead) === d.text(n);
  }

  /** Marks the first `->` after the parameter list of function name `t` as a trailing return arrow. */
  markReturnArrow(t: i32): void {
    const d = this.d;
    let p = d.nxt[t];
    while (p >= 0 && !(this.k(p) === P_LPAREN && (this.ty(p) === TT_OVERLOADED_OPERATOR_LPAREN || this.k(t) !== KW_OPERATOR))) {
      if (this.ty(p) === TT_TEMPLATE_OPENER && d.match[p] >= 0) {
        p = d.match[p];
      }
      p = d.nxt[p];
    }
    if (p < 0 || d.match[p] < 0) {
      return;
    }
    for (let a = d.nxt[d.match[p]]; a >= 0; a = d.nxt[a]) {
      if (this.k(a) === P_ARROW) {
        this.set(a, TT_TRAILING_RETURN_ARROW);
        return;
      }
      // Skip the arguments of a trailing annotation: `LOCKS_REQUIRED(a->b)`.
      const n = d.nxt[a];
      if (this.ty(a) === TT_TRAILING_ANNOTATION && n >= 0 && this.k(n) === P_LPAREN) {
        if (d.match[n] < 0) {
          return;
        }
        a = d.match[n];
      }
    }
  }

  /** Marks the function declaration name, or the ctor/dtor name, of line `l`. */
  markDeclName(l: i32): void {
    const d = this.d;
    for (let t = d.nxt[this.first]; t >= 0; t = d.nxt[t]) {
      // (An `operator` counts at any depth, as for clang-format.)
      if (d.nest[t] !== 0 && d.kind[t] !== KW_OPERATOR) {
        continue;
      }
      this.fnEarly = false;
      if (this.isFunctionName(t)) {
        this.set(t, TT_FUNCTION_DECLARATION_NAME);
        // (clang-format's MightBeFunctionDecl needs a line that must be a declaration.)
        if (d.lMustDecl[l] === 1) {
          d.lMightFn[l] = 1;
        }
        if (!this.fnEarly) {
          this.markReturnArrow(t);
        }
        return;
      }
    }
    // A constructor or destructor: no return type.
    let t = this.first;
    while (t >= 0) {
      const k = this.k(t);
      if (k === K_COMMENT || k === KW_FRIEND || k === KW_INLINE || k === KW_VIRTUAL || k === KW_CONSTEXPR || k === KW_CONSTEVAL || k === KW_EXPLICIT) {
        t = d.nxt[t];
        continue;
      }
      if (this.ty(t) === TT_ATTRIBUTE_SQUARE && k === P_LSQUARE) {
        t = d.match[t] >= 0 ? d.nxt[d.match[t]] : -1;
        continue;
      }
      break;
    }
    if (t < 0) {
      return;
    }
    if (this.k(t) === P_COLONCOLON) {
      t = d.nxt[t];
    }
    while (t >= 0 && this.k(t) === K_IDENT && d.nxt[t] >= 0 && this.k(d.nxt[t]) === P_COLONCOLON) {
      t = d.nxt[d.nxt[t]];
    }
    if (t >= 0 && this.k(t) === P_TILDE) {
      t = d.nxt[t];
    }
    if (t < 0 || this.k(t) !== K_IDENT) {
      return;
    }
    const lp = this.next(t);
    if (lp < 0 || this.k(lp) !== P_LPAREN || d.match[lp] < 0) {
      return;
    }
    let qualified = false;
    const p = this.prev(t);
    if (p >= 0) {
      let q = p;
      if (this.k(q) === P_TILDE) {
        q = this.prev(q);
      }
      if (q >= 0 && this.k(q) === P_COLONCOLON) {
        const qq = this.prev(q);
        qualified = qq >= 0 && d.sameText(qq, t);
      }
    }
    if (this.inClass || qualified || this.ty(d.lLast[l]) === TT_FUNCTION_LBRACE) {
      this.set(t, TT_CTOR_DTOR_DECL_NAME);
      if (d.lMustDecl[l] === 1) {
        d.lMightFn[l] = 1;
      }
    }
  }

  /**
   * On a line declaring no function, `a & b` inside an operator's parentheses
   * (`operator co_await(Baton & baton)`) is a binary operator to clang-format.
   */
  operatorCallOperands(): void {
    const d = this.d;
    let hasOp = false;
    for (let t = this.first; t >= 0; t = d.nxt[t]) {
      if (d.type[t] === TT_FUNCTION_DECLARATION_NAME) {
        return;
      }
      if (d.kind[t] === KW_OPERATOR) {
        hasOp = true;
      }
    }
    if (!hasOp) {
      return;
    }
    for (let t = this.first; t >= 0; t = d.nxt[t]) {
      if (d.kind[t] !== KW_OPERATOR) {
        continue;
      }
      let lp = d.nxt[t];
      while (lp >= 0 && d.type[lp] !== TT_OVERLOADED_OPERATOR_LPAREN) {
        lp = d.nxt[lp];
      }
      if (lp < 0) {
        return;
      }
      const rp = d.match[lp];
      for (let q = d.nxt[lp]; q >= 0 && q !== rp; q = d.nxt[q]) {
        if (d.kind[q] !== K_IDENT) {
          continue;
        }
        const n = d.nxt[q];
        if (n >= 0 && this.isPtrKind(n) && d.nxt[n] >= 0 && d.kind[d.nxt[n]] === K_IDENT) {
          d.type[n] = TT_BINARY_OPERATOR;
          q = n;
        }
      }
      t = lp;
    }
  }

  /** clang-format's skipOperatorName: the operator's `(` after its name tokens, or -1. */
  skipOperatorName(n0: i32): i32 {
    const d = this.d;
    for (let n = n0; n >= 0; n = d.nxt[n]) {
      const k = this.k(n);
      const tt = this.ty(n);
      if (tt === TT_OVERLOADED_OPERATOR_LPAREN) {
        return n;
      }
      // (clang-format's operator walk types these as overloaded operators.)
      if (tt === TT_OVERLOADED_OPERATOR || tt === TT_UNARY_OPERATOR || tt === TT_BINARY_OPERATOR || k === P_COMMA || k === P_STAR || k === P_ARROW || k === P_AMP || k === P_AMPAMP) {
        continue;
      }
      const nn = d.nxt[n];
      if (k === KW_NEW || k === KW_DELETE) {
        if (nn >= 0 && this.k(nn) === P_LSQUARE && d.nxt[nn] >= 0 && this.k(d.nxt[nn]) === P_RSQUARE) {
          n = d.nxt[nn];
        }
        continue;
      }
      if (k === P_LSQUARE && nn >= 0 && this.k(nn) === P_RSQUARE) {
        n = nn;
        continue;
      }
      if ((isSimpleTypeKind(k) || k === K_IDENT) && nn >= 0 && this.isPtrKind(nn)) {
        n = nn;
        continue;
      }
      if (tt === TT_TEMPLATE_OPENER && d.match[n] > n) {
        n = d.match[n];
        continue;
      }
      return -1;
    }
    return -1;
  }

  isFunctionName(t: i32): boolean {
    const d = this.d;
    let next = d.nxt[t];
    if (this.k(t) === KW_OPERATOR) {
      // clang-format's isFunctionDeclarationName: the token right before
      // (a comment counts) decides, then skipOperatorName.
      const p = d.prv[t];
      if (p < 0) {
        return false;
      }
      // (Decided before the parameter list is found: no trailing return arrow is marked.)
      if (this.isWord(p) && this.k(p) !== KW_RETURN && this.k(p) !== KW_CO_RETURN) {
        this.fnEarly = true;
        return true;
      }
      // `decltype(auto) operator()`: after a type-declaring parenthesis.
      if (this.k(p) === P_RPAREN && d.match[p] >= 0 && d.prv[d.match[p]] >= 0) {
        const pk = this.k(d.prv[d.match[p]]);
        if (pk === KW_DECLTYPE || pk === KW_TYPEOF || pk === KW_ATOMIC) {
          this.fnEarly = true;
          return true;
        }
      }
      if (!this.isPtrKind(p) && this.ty(p) !== TT_TEMPLATE_CLOSER) {
        return false;
      }
      next = this.skipOperatorName(d.nxt[t]);
      if (next < 0) {
        return false;
      }
    } else {
      if (this.ty(t) !== TT_START_OF_NAME) {
        return false;
      }
      while (next >= 0) {
        if (this.ty(next) === TT_TEMPLATE_OPENER && d.match[next] >= 0) {
          next = d.match[next];
        } else if (this.k(next) === P_COLONCOLON) {
          next = d.nxt[next];
          if (next < 0) {
            return false;
          }
          if (this.k(next) === KW_OPERATOR) {
            while (next >= 0 && this.ty(next) !== TT_OVERLOADED_OPERATOR_LPAREN) {
              next = d.nxt[next];
            }
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
        next = d.nxt[next];
      }
    }
    if (next < 0 || this.k(next) !== P_LPAREN || d.match[next] < 0) {
      return false;
    }
    const cp = d.match[next];
    const last = d.lLast[this.line];
    if (this.k(last) === P_LBRACE) {
      return true;
    }
    if (d.nxt[next] === cp) {
      return true;
    }
    if (d.nxt[cp] >= 0 && this.ty(d.nxt[cp]) === TT_POINTER_OR_REFERENCE) {
      return true;
    }
    const nn = d.nxt[next];
    // (clang-format's endsWith(semi) looks past trailing comments.)
    let lastNC = last;
    while (lastNC >= 0 && this.k(lastNC) === K_COMMENT) {
      lastNC = d.prv[lastNC];
    }
    if (nn >= 0 && this.k(nn) === K_IDENT && !(lastNC >= 0 && this.k(lastNC) === P_SEMI)) {
      return true;
    }
    for (let q = nn; q >= 0 && q !== cp; q = d.nxt[q]) {
      if ((this.k(q) === P_LPAREN || this.ty(q) === TT_TEMPLATE_OPENER) && d.match[q] >= 0) {
        q = d.match[q];
        continue;
      }
      if (this.k(q) === KW_CONST || isSimpleTypeKind(this.k(q)) || this.ty(q) === TT_POINTER_OR_REFERENCE || this.ty(q) === TT_START_OF_NAME || this.k(q) === P_ELLIPSIS) {
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
  if (d.kind[t] !== K_COMMENT) {
    return false;
  }
  const n = d.nxt[t];
  return d.type[t] === TT_LINE_COMMENT || n < 0 || d.nl[n] > 0;
};

/** Spacing inside a directive: `#word`, then its arguments; `#define` bodies as code. */
const ppSpace = (d: Doc, l: i32, r: i32): boolean => {
  const f = d.lFirst[l];
  const left = d.prv[r];
  if (left === f) {
    return false; // `#include`
  }
  if (d.kind[r] === K_COMMENT) {
    return true;
  }
  if (d.prv[left] === f) {
    // `#if (` and `#elif (`: a control statement's parenthesis.
    if (d.kind[r] === P_LPAREN && (d.text(left) === "if" || d.text(left) === "elif")) {
      return true;
    }
    return d.ws[r] === 1 || d.lType[l] === LT_IMPORT; // the directive's first argument
  }
  const pk = d.ppKind[f];
  if (pk === PP_DEFINE && d.len(d.nxt[f]) === 6 && d.at(d.start[d.nxt[f]]) === 100) {
    // `#define NAME(params) body`: params hug the name, the body is code.
    const name = d.nxt[d.nxt[f]];
    if (r === d.nxt[name] && d.kind[r] === P_LPAREN) {
      return d.ws[r] === 1;
    }
    if (d.kind[d.nxt[name]] === P_LPAREN && d.match[d.nxt[name]] === left) {
      return true; // the body after the parameter list
    }
    if (left === name) {
      return true;
    }
    return spaceBeforeCode(d, l, r);
  }
  if (pk === PP_IF || pk === PP_ELIF || pk === PP_PRAGMA || pk === PP_OTHER || pk === PP_ELSE || pk === PP_ENDIF || pk === PP_ERROR) {
    // Directive lines are formatted as code (implicit string literals keep
    // their own whitespace, see the formatter).
    return spaceBeforeCode(d, l, r);
  }
  return d.ws[r] === 1;
};

/** Whether one space goes before token `r` (LLVM style), given line `l`. */
export const spaceBefore = (d: Doc, l: i32, r: i32): boolean => {
  const lt = d.lType[l];
  if (lt === LT_PREPROCESSOR || lt === LT_IMPORT) {
    return ppSpace(d, l, r);
  }
  return spaceBeforeCode(d, l, r);
};

const spaceBeforeCode = (d: Doc, l: i32, r: i32): boolean => {
  const left = d.prv[r];
  if (left < 0) {
    return false;
  }
  const lk = d.kind[left];
  const rk = d.kind[r];
  const lt = d.type[left];
  const rt = d.type[r];
  // Around an implicit string literal the whitespace is as written.
  if (lt === TT_IMPLICIT_STRING_LITERAL || rt === TT_IMPLICIT_STRING_LITERAL) {
    return d.ws[r] === 1;
  }
  // After a finalized token (inline assembly) too; `asm {` is spaced.
  if (d.asmFin[left] === 1) {
    return d.ws[r] === 1;
  }
  if (rt === TT_INLINE_ASM_BRACE && rk === P_LBRACE) {
    return true;
  }
  // `@class`, `@"str"`: Objective-C's `@` keeps the word after it.
  if (lk === P_AT && (isWordKind(rk) || rk === K_STRING)) {
    return false;
  }
  // `Args &&...a`: nothing after a pack's `...` that follows `&`, `&&` or `*`.
  if (lk === P_ELLIPSIS && d.prv[left] >= 0 && (d.kind[d.prv[left]] === P_STAR || d.kind[d.prv[left]] === P_AMP || d.kind[d.prv[left]] === P_AMPAMP) && rt !== TT_LINE_COMMENT && rt !== TT_BINARY_OPERATOR) {
    return false;
  }
  if (rk === K_COMMENT) {
    if (rt === TT_LINE_COMMENT) {
      return !(d.bk[left] === BK_BRACED_INIT && d.eqList[left] === 0 && (lk === P_LBRACE || lk === P_LPAREN));
    }
    if (lk === P_LPAREN || lk === P_LSQUARE || lt === TT_TEMPLATE_OPENER || (lk === P_LBRACE && d.bk[left] !== BK_BLOCK) || lk === KW_OPERATOR) {
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
  if (rt === TT_FUNCTION_TYPE_LPAREN && lk !== P_LPAREN && lt !== TT_POINTER_OR_REFERENCE && lt !== TT_CAST_RPAREN && lk !== P_STAR && lk !== P_AMP && lk !== P_AMPAMP) {
    return true;
  }
  if (lk === P_STAR && rk === K_COMMENT) {
    return true;
  }
  if (lk === KW_OPERATOR) {
    return rk === P_COLONCOLON;
  }
  if (lt === TT_OVERLOADED_OPERATOR && (rt === TT_TEMPLATE_OPENER || rt === TT_TEMPLATE_CLOSER)) {
    return true;
  }
  if (rk === P_PERIOD && lk === K_NUMBER) {
    return true;
  }
  if (rt === TT_TRAILING_RETURN_ARROW || lt === TT_TRAILING_RETURN_ARROW || rt === TT_LAMBDA_ARROW || lt === TT_LAMBDA_ARROW) {
    return true;
  }
  if (lk === P_COMMA && rt !== TT_OVERLOADED_OPERATOR_LPAREN) {
    return true;
  }
  if (rk === P_COMMA || rk === P_SEMI) {
    return lk === P_SEMI && rk === P_SEMI ? false : false;
  }
  if (rt === TT_CTOR_INITIALIZER_COLON || rt === TT_RANGE_BASED_FOR_LOOP_COLON || rt === TT_INHERITANCE_COLON || lt === TT_BIT_FIELD_COLON) {
    return true;
  }
  if (rk === P_COLON) {
    if (rt === TT_CASE_LABEL_COLON || rt === TT_GENERIC_SELECTION_COLON) {
      return false;
    }
    let n = d.nxt[r];
    while (n >= 0 && d.kind[n] === K_COMMENT) {
      n = d.nxt[n];
    }
    if (n < 0) {
      return false;
    }
    if (lk === P_QUESTION || (lk === P_COLONCOLON && rt === TT_INLINE_ASM_COLON)) {
      return false;
    }
    return true;
  }
  if (((lk === P_MINUS || lk === P_MINUSMINUS) && (rk === P_MINUS || rk === P_MINUSMINUS)) || ((lk === P_PLUS || lk === P_PLUSPLUS) && (rk === P_PLUS || rk === P_PLUSPLUS))) {
    return true;
  }
  if (lt === TT_UNARY_OPERATOR) {
    // `not x`, `compl x`: an alternative token keeps its space (not before `(`).
    if ((lk === P_EXCLAIM || lk === P_TILDE) && d.width[left] > 1 && rk !== P_LPAREN) {
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
  if (rk === P_ARROW || rk === P_ARROWSTAR || rk === P_PERIODSTAR || lk === P_ARROW || lk === P_PERIOD || lk === P_ARROWSTAR || lk === P_PERIODSTAR || (rk === P_PERIOD && rt !== TT_DESIGNATED_INITIALIZER_PERIOD)) {
    return false;
  }
  if (rk === P_COLONCOLON) {
    if (isIdentKind(lk)) {
      return d.ws[r] === 1;
    }
    // (After a block comment: clang-format's rule for those, `/*x=*/` hugging.)
    if (lk === K_COMMENT) {
      return !(d.at(d.end[left] - 3) === 61);
    }
    if (lk === P_LBRACE || lk === P_LPAREN || lk === P_RPAREN || lk === P_LSQUARE || lt === TT_TEMPLATE_OPENER || lt === TT_TEMPLATE_CLOSER) {
      return false;
    }
    return true;
  }
  if ((lt === TT_TEMPLATE_OPENER) !== (rt === TT_TEMPLATE_CLOSER)) {
    return false;
  }
  if ((rt === TT_BINARY_OPERATOR && lk !== P_LPAREN) || ((lt === TT_BINARY_OPERATOR || lt === TT_CONDITIONAL_EXPR) && rk !== P_RPAREN)) {
    return true;
  }
  if (rt === TT_TRAILING_UNARY_OPERATOR) {
    return false;
  }
  // The general pair rules.
  if (lk === KW_RETURN && !(rk === P_SEMI || rk === P_RPAREN)) {
    return true;
  }
  if (lk === KW_THROW && rk === P_LPAREN && d.match[r] >= 0 && d.type[d.match[r]] === TT_CAST_RPAREN) {
    return true;
  }
  if (rk === P_HASHHASH) {
    return lk === P_HASH;
  }
  // `L#p`, `u8#p`: a string prefix stays on the stringizing `#`.
  if (rk === P_HASH && lk === K_IDENT && d.width[left] <= 3 && isStringPrefix(d, left)) {
    return false;
  }
  if (lk === P_HASHHASH || lk === P_HASH) {
    return rk === P_HASH;
  }
  if ((lk === P_LPAREN && rk === P_RPAREN) || (lk === P_LBRACE && d.bk[left] !== BK_BLOCK && rk === P_RBRACE && d.bk[r] !== BK_BLOCK)) {
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
    if (!(rk === P_LPAREN && lk === KW_CO_AWAIT && d.prv[left] >= 0 && d.kind[d.prv[left]] === KW_OPERATOR)) {
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
  if (lk === P_ELLIPSIS && d.prv[left] >= 0 && d.type[d.prv[left]] === TT_POINTER_OR_REFERENCE) {
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
    if (rk === P_LBRACE && d.bk[r] === BK_BLOCK) {
      return true;
    }
    return false;
  }
  if (rk === P_STAR && lk === P_LPAREN) {
    return false;
  }
  if (lk === P_LSQUARE) {
    return false;
  }
  if (rk === P_RSQUARE) {
    return false;
  }
  if (rk === P_LSQUARE && (lk === KW_AUTO || ((lk === KW_CONST || lk === KW_VOLATILE) && autoBeforeQualifiers(d, left)))) {
    // A structured binding: `auto [a, b]`, `auto const [a, b]`.
    return true;
  }
  if (rk === P_LSQUARE && !(rt === TT_LAMBDA_LSQUARE || rt === TT_DESIGNATED_INITIALIZER_LSQUARE || rt === TT_ATTRIBUTE_SQUARE) && lk !== K_NUMBER) {
    return false;
  }
  if (lk === P_LBRACE && rk === P_RBRACE) {
    return d.childHead[left] >= 0;
  }
  if (rk === P_RBRACE && operatorNameEndsAt(d, left)) {
    // `{operator delete }`: clang-format reads the `}` as part of the
    // operator's name, so it never pairs with its `{`.
    return true;
  }
  if ((lk === P_LBRACE && d.bk[left] !== BK_BLOCK) || (rk === P_RBRACE && d.match[r] >= 0 && d.bk[d.match[r]] !== BK_BLOCK)) {
    return false;
  }
  if (lt === TT_BLOCK_COMMENT) {
    return !(d.at(d.end[left] - 3) === 61);
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
    if (lk === KW_FOR || lk === KW_WHILE || lk === KW_SWITCH || lk === KW_CASE || lk === KW_CATCH || isForEachMacro(d, left) || ((lk === KW_IF || ((lk === KW_CONSTEXPR || lk === K_IDENT) && d.prv[left] >= 0 && d.kind[d.prv[left]] === KW_IF)) && d.lType[l] !== LT_PREPROCESSOR)) {
      return true;
    }
    if (rt === TT_OVERLOADED_OPERATOR_LPAREN) {
      return false;
    }
    if ((lk === KW_NEW || lk === KW_DELETE) && d.lMightFn[l] === 0) {
      return true;
    }
    // `delete[] (p)`
    if (lk === P_RSQUARE && d.match[left] >= 0 && d.prv[d.match[left]] >= 0 && d.kind[d.prv[d.match[left]]] === KW_DELETE) {
      return true;
    }
    return false;
  }
  if (rt === TT_UNARY_OPERATOR) {
    return !(lk === P_LPAREN || lk === P_LSQUARE);
  }
  // (A name or a simple type: other keywords keep the space, `noexcept {}`,
  // and so does `_asm`, a keyword for clang-format.)
  if (((lk === K_IDENT && !(d.at(d.start[left]) === 95 && (d.text(left) === "_asm" || d.text(left) === "__asm" || d.text(left) === "__asm__"))) || lk >= CW_OVERRIDE || isSimpleTypeKind(lk) || lk === P_GREATER || lk === P_RSQUARE || lk === P_RPAREN) && rk === P_LBRACE && d.bk[r] !== BK_BLOCK && d.nxt[r] >= 0) {
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
export const CLASSIFY_KINDS: i32 = KW_STATIC + KW_STRUCT + KW_UNION + KW_CLASS + KW_ALIGNAS + TT_FUNCTION_DECLARATION_NAME + TT_CTOR_DTOR_DECL_NAME + TT_START_OF_NAME + TT_LAMBDA_LBRACE + KW_THIS + TT_TRAILING_ANNOTATION + P_LPAREN;

/** The token before `t`, comments skipped, or -1. */
const prevCode = (d: Doc, t: i32): i32 => {
  let p = d.prv[t];
  while (p >= 0 && d.kind[p] === K_COMMENT) {
    p = d.prv[p];
  }
  return p;
};

/**
 * The token after `t` in the source, comments and other directives'
 * tokens skipped, or -1 (by index: the parser asks before tokens are linked).
 */
const nextCode = (d: Doc, t: i32): i32 => {
  const pp = d.ppId[t];
  for (let n = t + 1; n < d.ntok; n++) {
    const k = d.kind[n];
    if (k === K_EOF) {
      return -1;
    }
    if (k === K_COMMENT || d.ppId[n] !== pp) {
      if (pp >= 0 && d.ppId[n] !== pp && k !== K_COMMENT) {
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
  if (n >= 0 && d.kind[n] === P_LBRACE) {
    return false;
  }
  if (n < 0 || d.kind[n] !== P_LPAREN) {
    return true;
  }
  const p = prevCode(d, rq);
  if (p < 0) {
    return true;
  }
  const pk = d.kind[p];
  if (pk === P_GREATER || pk === P_RPAREN || pk === KW_NOEXCEPT || pk === KW_CONST) {
    return true;
  }
  if (pk === P_AMP || pk === P_AMPAMP) {
    const pp = prevCode(d, p);
    if (pp >= 0 && d.kind[pp] === KW_CONST) {
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
    const qk = d.kind[q];
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
      angles++;
    } else if (qk === P_GREATER) {
      angles--;
    } else if (isSimpleTypeKind(qk)) {
      return false;
    }
    q = nextCode(d, q);
  }
  return true;
};

/** Whether `auto` comes before token `t` past `const`, `volatile`, `&` and `&&` (a structured binding's specifiers). */
const autoBeforeQualifiers = (d: Doc, t: i32): boolean => {
  let q = t;
  while (q >= 0 && (d.kind[q] === KW_CONST || d.kind[q] === KW_VOLATILE || d.kind[q] === P_AMP || d.kind[q] === P_AMPAMP || d.kind[q] === K_COMMENT)) {
    q = d.prv[q];
  }
  return q >= 0 && d.kind[q] === KW_AUTO;
};

/** Whether token `t` ends an operator name (`operator delete`, `operator+`) with no `(` after `operator`. */
const operatorNameEndsAt = (d: Doc, t: i32): boolean => {
  let q = t;
  for (let n = 0; n < 4 && q >= 0; n++) {
    const k = d.kind[q];
    if (k === KW_OPERATOR) {
      return q !== t;
    }
    if (k === P_LPAREN || k === P_RPAREN || k === P_SEMI || k === P_COMMA || k === P_LBRACE || k === P_RBRACE) {
      return false;
    }
    q = d.prv[q];
  }
  return false;
};

/** Whether identifier `t` is a string literal prefix (`L`, `u`, `U`, `u8`, and their `R` forms). */
const isStringPrefix = (d: Doc, t: i32): boolean => {
  const x = d.text(t);
  return x === "L" || x === "u" || x === "U" || x === "u8" || x === "LR" || x === "uR" || x === "UR" || x === "u8R";
};
