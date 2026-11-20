// A Dart parser that builds the analyzer's AST shapes (see ast.ts) for
// dart_style. Recursive descent over the grammar, with the disambiguation
// rules of the analyzer's parser: _fe_analyzer_shared's Parser and
// computeType/computeTypeParamOrArg (type_info.dart) and the AstBuilder that
// turns its events into nodes (BSD-3-Clause, Copyright the Dart project
// authors). A file the analyzer would reject with a syntax error should fail
// here; where this parser is stricter, the file is only skipped.

import {
  DtAst,
  N_ADJACENT_STRINGS,
  N_ANNOTATION,
  N_ARGUMENT_LIST,
  N_AS_EXPRESSION,
  N_ASSERT_INITIALIZER,
  N_ASSERT_STATEMENT,
  N_ASSIGNED_VARIABLE_PATTERN,
  N_ASSIGNMENT_EXPRESSION,
  N_AWAIT_EXPRESSION,
  N_BINARY_EXPRESSION,
  N_BLOCK,
  N_BLOCK_CLASS_BODY,
  N_BLOCK_ENUM_BODY,
  N_BLOCK_FUNCTION_BODY,
  N_BOOLEAN_LITERAL,
  N_BREAK_STATEMENT,
  N_CASCADE_EXPRESSION,
  N_CASE_CLAUSE,
  N_CAST_PATTERN,
  N_CATCH_CLAUSE,
  N_CATCH_CLAUSE_PARAMETER,
  N_CLASS_DECLARATION,
  N_CLASS_TYPE_ALIAS,
  N_COMPILATION_UNIT,
  N_CONDITIONAL_EXPRESSION,
  N_CONFIGURATION,
  N_CONSTANT_PATTERN,
  N_CONSTRUCTOR_DECLARATION,
  N_CONSTRUCTOR_FIELD_INITIALIZER,
  N_CONSTRUCTOR_NAME,
  N_CONSTRUCTOR_SELECTOR,
  N_CONTINUE_STATEMENT,
  N_DECLARED_IDENTIFIER,
  N_DECLARED_VARIABLE_PATTERN,
  N_DO_STATEMENT,
  N_DOT_SHORTHAND_CONSTRUCTOR_INVOCATION,
  N_DOT_SHORTHAND_INVOCATION,
  N_DOT_SHORTHAND_PROPERTY_ACCESS,
  N_DOTTED_NAME,
  N_DOUBLE_LITERAL,
  N_EMPTY_CLASS_BODY,
  N_EMPTY_ENUM_BODY,
  N_EMPTY_FUNCTION_BODY,
  N_EMPTY_STATEMENT,
  N_ENUM_CONSTANT_ARGUMENTS,
  N_ENUM_CONSTANT_DECLARATION,
  N_ENUM_DECLARATION,
  N_EXPORT_DIRECTIVE,
  N_EXPRESSION_FUNCTION_BODY,
  N_EXPRESSION_STATEMENT,
  N_EXTENDS_CLAUSE,
  N_EXTENSION_DECLARATION,
  N_EXTENSION_ON_CLAUSE,
  N_EXTENSION_TYPE_DECLARATION,
  N_FIELD_DECLARATION,
  N_FIELD_FORMAL_PARAMETER,
  N_FOR_EACH_PARTS_WITH_DECLARATION,
  N_FOR_EACH_PARTS_WITH_IDENTIFIER,
  N_FOR_EACH_PARTS_WITH_PATTERN,
  N_FOR_ELEMENT,
  N_FOR_PARTS_WITH_DECLARATIONS,
  N_FOR_PARTS_WITH_EXPRESSION,
  N_FOR_PARTS_WITH_PATTERN,
  N_FOR_STATEMENT,
  N_FORMAL_PARAMETER_DEFAULT_CLAUSE,
  N_FORMAL_PARAMETER_LIST,
  N_FUNCTION_DECLARATION,
  N_FUNCTION_DECLARATION_STATEMENT,
  N_FUNCTION_EXPRESSION,
  N_FUNCTION_EXPRESSION_INVOCATION,
  N_FUNCTION_REFERENCE,
  N_FUNCTION_TYPE_ALIAS,
  N_FUNCTION_TYPED_SUFFIX,
  N_GENERIC_FUNCTION_TYPE,
  N_GENERIC_TYPE_ALIAS,
  N_GUARDED_PATTERN,
  N_HIDE_COMBINATOR,
  N_IF_ELEMENT,
  N_IF_STATEMENT,
  N_IMPLEMENTS_CLAUSE,
  N_IMPORT_DIRECTIVE,
  N_INDEX_EXPRESSION,
  N_INSTANCE_CREATION_EXPRESSION,
  N_INTEGER_LITERAL,
  N_INTERPOLATION_EXPRESSION,
  N_INTERPOLATION_STRING,
  N_IS_EXPRESSION,
  N_LABEL,
  N_LABEL_REFERENCE,
  N_LABELED_STATEMENT,
  N_LIBRARY_DIRECTIVE,
  N_LIST_LITERAL,
  N_LIST_PATTERN,
  N_LOGICAL_AND_PATTERN,
  N_LOGICAL_OR_PATTERN,
  N_MAP_LITERAL_ENTRY,
  N_MAP_PATTERN,
  N_MAP_PATTERN_ENTRY,
  N_METHOD_DECLARATION,
  N_METHOD_INVOCATION,
  N_MIXIN_DECLARATION,
  N_MIXIN_ON_CLAUSE,
  N_NAME_WITH_TYPE_PARAMETERS,
  N_NAMED_ARGUMENT,
  N_NAMED_TYPE,
  N_NATIVE_CLAUSE,
  N_NATIVE_FUNCTION_BODY,
  N_NULL_ASSERT_PATTERN,
  N_NULL_AWARE_ELEMENT,
  N_NULL_CHECK_PATTERN,
  N_NULL_LITERAL,
  N_OBJECT_PATTERN,
  N_PARENTHESIZED_EXPRESSION,
  N_PARENTHESIZED_PATTERN,
  N_PART_DIRECTIVE,
  N_PART_OF_DIRECTIVE,
  N_PATTERN_ASSIGNMENT,
  N_PATTERN_FIELD,
  N_PATTERN_FIELD_NAME,
  N_PATTERN_VARIABLE_DECLARATION,
  N_PATTERN_VARIABLE_DECLARATION_STATEMENT,
  N_POSTFIX_EXPRESSION,
  N_PREFIX_EXPRESSION,
  N_PREFIXED_IDENTIFIER,
  N_PRIMARY_CONSTRUCTOR_BODY,
  N_PRIMARY_CONSTRUCTOR_DECLARATION,
  N_PRIMARY_CONSTRUCTOR_NAME,
  N_PROPERTY_ACCESS,
  N_RECORD_LITERAL,
  N_RECORD_LITERAL_NAMED_FIELD,
  N_RECORD_PATTERN,
  N_RECORD_TYPE_ANNOTATION,
  N_RECORD_TYPE_NAMED_FIELD,
  N_RECORD_TYPE_NAMED_FIELDS,
  N_RECORD_TYPE_POSITIONAL_FIELD,
  N_REDIRECTING_CONSTRUCTOR_INVOCATION,
  N_REGULAR_FORMAL_PARAMETER,
  N_RELATIONAL_PATTERN,
  N_REST_PATTERN_ELEMENT,
  N_RETHROW_EXPRESSION,
  N_RETURN_STATEMENT,
  N_SCRIPT_TAG,
  N_SET_OR_MAP_LITERAL,
  N_SHOW_COMBINATOR,
  N_SIMPLE_IDENTIFIER,
  N_SIMPLE_STRING_LITERAL,
  N_SPREAD_ELEMENT,
  N_STRING_INTERPOLATION,
  N_SUPER_CONSTRUCTOR_INVOCATION,
  N_SUPER_EXPRESSION,
  N_SUPER_FORMAL_PARAMETER,
  N_SWITCH_DEFAULT,
  N_SWITCH_EXPRESSION,
  N_SWITCH_EXPRESSION_CASE,
  N_SWITCH_CASE,
  N_SWITCH_PATTERN_CASE,
  N_SWITCH_STATEMENT,
  N_SYMBOL_LITERAL,
  N_THIS_EXPRESSION,
  N_THROW_EXPRESSION,
  N_TOP_LEVEL_VARIABLE_DECLARATION,
  N_TRY_STATEMENT,
  N_TYPE_ARGUMENT_LIST,
  N_TYPE_PARAMETER,
  N_TYPE_PARAMETER_LIST,
  N_VARIABLE_DECLARATION,
  N_VARIABLE_DECLARATION_LIST,
  N_VARIABLE_DECLARATION_STATEMENT,
  N_WHEN_CLAUSE,
  N_WHILE_STATEMENT,
  N_WILDCARD_PATTERN,
  N_WITH_CLAUSE,
  N_YIELD_STATEMENT,
} from "./ast";
import { DtTokens } from "./scanner";
import {
  K_ABSTRACT,
  K_AS,
  K_ASSERT,
  K_ASYNC,
  K_AUGMENT,
  K_AWAIT,
  K_BASE,
  K_BREAK,
  K_CASE,
  K_CATCH,
  K_CLASS,
  K_CONST,
  K_CONTINUE,
  K_COVARIANT,
  K_DEFAULT,
  K_DEFERRED,
  K_DO,
  K_DYNAMIC,
  K_ELSE,
  K_ENUM,
  K_EXPORT,
  K_EXTENDS,
  K_EXTENSION,
  K_EXTERNAL,
  K_FACTORY,
  K_FALSE,
  K_FINAL,
  K_FINALLY,
  K_FOR,
  K_FUNCTION,
  K_GET,
  K_HIDE,
  K_IF,
  K_IMPLEMENTS,
  K_IMPORT,
  K_IN,
  K_INTERFACE,
  K_IS,
  K_LATE,
  K_LIBRARY,
  K_MIXIN,
  K_NATIVE,
  K_NEW,
  K_NONE,
  K_NULL,
  K_OF,
  K_ON,
  K_OPERATOR,
  K_PART,
  K_REQUIRED,
  K_RETHROW,
  K_RETURN,
  K_SEALED,
  K_SET,
  K_SHOW,
  K_STATIC,
  K_SUPER,
  K_SWITCH,
  K_SYNC,
  K_THIS,
  K_THROW,
  K_TRUE,
  K_TRY,
  K_TYPE,
  K_TYPEDEF,
  K_VAR,
  K_VOID,
  K_WHEN,
  K_WHILE,
  K_WITH,
  K_YIELD,
  T_AMP,
  T_AMPAMP,
  T_AMP_EQ,
  T_ARROW,
  T_AT,
  T_BANG,
  T_BAR,
  T_BARBAR,
  T_BAR_EQ,
  T_CARET,
  T_CARET_EQ,
  T_COLON,
  T_COMMA,
  T_DEC,
  T_DOT,
  T_DOTDOT,
  T_DOUBLE,
  T_ELLIPSIS,
  T_ELLIPSIS_Q,
  T_EOF,
  T_EQ,
  T_EQEQ,
  T_GE,
  T_GT,
  T_HASH,
  T_IDENT,
  T_INC,
  T_INDEX,
  T_INDEX_EQ,
  T_INT,
  T_INTERP_EXPR,
  T_INTERP_IDENT,
  T_LBRACE,
  T_LBRACKET,
  T_LE,
  T_LPAREN,
  T_LT,
  T_MINUS,
  T_MINUS_EQ,
  T_NE,
  T_PERCENT,
  T_PERCENT_EQ,
  T_PLUS,
  T_PLUS_EQ,
  T_QDOT,
  T_QDOTDOT,
  T_QQ,
  T_QQ_EQ,
  T_QUESTION,
  T_RBRACE,
  T_RBRACKET,
  T_RPAREN,
  T_SCRIPT,
  T_SEMI,
  T_SHL,
  T_SHL_EQ,
  T_SHR,
  T_SHR_EQ,
  T_SLASH,
  T_SLASH_EQ,
  T_STAR,
  T_STAR_EQ,
  T_STRING,
  T_TILDE,
  T_TILDE_SLASH,
  T_TILDE_SLASH_EQ,
  T_USHR,
  T_USHR_EQ,
  dtIsBuiltIn,
  dtIsReserved,
} from "./tokens";

// Precedences, as the analyzer's TokenType.precedence.
export const P_ASSIGNMENT: i32 = 1;
export const P_CASCADE: i32 = 2;
export const P_CONDITIONAL: i32 = 3;
export const P_IF_NULL: i32 = 4;
export const P_LOGICAL_OR: i32 = 5;
export const P_LOGICAL_AND: i32 = 6;
export const P_EQUALITY: i32 = 7;
export const P_RELATIONAL: i32 = 8;
export const P_BITWISE_OR: i32 = 9;
export const P_BITWISE_XOR: i32 = 10;
export const P_BITWISE_AND: i32 = 11;
export const P_SHIFT: i32 = 12;
export const P_ADDITIVE: i32 = 13;
export const P_MULTIPLICATIVE: i32 = 14;
export const P_PREFIX: i32 = 15;
export const P_POSTFIX: i32 = 16;
export const P_SELECTOR: i32 = 17;

/** The precedence of the operator token kind `k` (keyword `kw`). */
export const dtPrecedence = (k: i32, kw: i32): i32 => {
  switch (k) {
    case T_EQ:
    case T_STAR_EQ:
    case T_SLASH_EQ:
    case T_TILDE_SLASH_EQ:
    case T_PERCENT_EQ:
    case T_PLUS_EQ:
    case T_MINUS_EQ:
    case T_SHL_EQ:
    case T_SHR_EQ:
    case T_USHR_EQ:
    case T_AMP_EQ:
    case T_CARET_EQ:
    case T_BAR_EQ:
    case T_QQ_EQ:
      return P_ASSIGNMENT;
    case T_DOTDOT:
    case T_QDOTDOT:
      return P_CASCADE;
    case T_QUESTION:
      return P_CONDITIONAL;
    case T_QQ:
      return P_IF_NULL;
    case T_BARBAR:
      return P_LOGICAL_OR;
    case T_AMPAMP:
      return P_LOGICAL_AND;
    case T_EQEQ:
    case T_NE:
      return P_EQUALITY;
    case T_LT:
    case T_GT:
    case T_LE:
    case T_GE:
      return P_RELATIONAL;
    case T_BAR:
      return P_BITWISE_OR;
    case T_CARET:
      return P_BITWISE_XOR;
    case T_AMP:
      return P_BITWISE_AND;
    case T_SHL:
    case T_SHR:
    case T_USHR:
      return P_SHIFT;
    case T_PLUS:
    case T_MINUS:
      return P_ADDITIVE;
    case T_STAR:
    case T_SLASH:
    case T_TILDE_SLASH:
    case T_PERCENT:
      return P_MULTIPLICATIVE;
    case T_INC:
    case T_DEC:
      return P_POSTFIX;
    case T_DOT:
    case T_QDOT:
    case T_LPAREN:
    case T_LBRACKET:
      return P_SELECTOR;
    case T_BANG:
      return P_PREFIX;
    case T_IDENT:
      if (kw === K_IS || kw === K_AS) {
        return P_RELATIONAL;
      }
      return 0;
    default:
      return 0;
  }
};

// Pattern contexts.
const PC_MATCHING: i32 = 0;
const PC_DECLARATION: i32 = 1;
const PC_ASSIGNMENT: i32 = 2;

// Where a formal parameter list is.
const FP_NORMAL: i32 = 0;
const FP_FUNCTION_TYPE: i32 = 1; // the parameters of `Function(...)`

// Cursor positions for lookahead: a token index times 4 plus the number of
// `>` characters already taken from a compound `>>`-like token.
const NO: i32 = -1;

export class DtParser {
  t: DtTokens;
  a: DtAst;
  p: i32 = 1;
  failed: boolean = false;
  why: string = "";
  mt: i32[]; // the matching bracket of ( [ { and `${`
  mayFn: boolean = true; // mayParseFunctionExpressions
  className: i32 = -1; // the name token of the enclosing type, for constructors
  asyncState: i32 = 0; // 0 sync, 1 async, 2 async*, 3 sync*
  patterns: boolean = true; // whether `case` takes a pattern (language 3.0 on)
  primaryCtors: boolean = true; // language 3.13 on

  constructor(t: DtTokens) {
    this.t = t;
    this.a = new DtAst(t.count * 2 + 16);
    this.mt = new Array<i32>(t.count + 8);
    this.svP = [];
    this.svN = [];
    this.svF = [];
    this.svL = [];
    this.svFailed = [];
  }

  fail(why: string): void {
    if (!this.failed) {
      this.failed = true;
      this.why = `${why} at ${this.t.start[this.p]} (${this.t.text(this.p)})`;
    }
  }

  // ---------------------------------------------------------------------
  // Tokens.

  k(i: i32): i32 {
    return this.t.kind[i];
  }

  kw(i: i32): i32 {
    if (this.t.kind[i] !== T_IDENT) {
      return K_NONE;
    }
    return this.t.kw[i];
  }

  /** Whether token `i` is an identifier: not a reserved word. */
  isId(i: i32): boolean {
    return this.t.kind[i] === T_IDENT && !dtIsReserved(this.t.kw[i]);
  }

  /** An identifier that is not a keyword of any kind, or a contextual one. */
  isPlainOrPseudo(i: i32): boolean {
    if (this.t.kind[i] !== T_IDENT) {
      return false;
    }
    const kw = this.t.kw[i];
    return kw === K_NONE || (!dtIsReserved(kw) && !dtIsBuiltIn(kw));
  }

  is(i: i32, s: string): boolean {
    return this.t.is(i, s);
  }

  /** Consumes the current token, which must be of kind `kind`. */
  expect(kind: i32): i32 {
    const i = this.p;
    if (this.t.kind[i] !== kind) {
      this.fail(`expected ${kind}`);
      return i;
    }
    this.p = i + 1;
    return i;
  }

  expectKw(kw: i32): i32 {
    const i = this.p;
    if (this.kw(i) !== kw) {
      this.fail(`expected keyword ${kw}`);
      return i;
    }
    this.p = i + 1;
    return i;
  }

  expectId(): i32 {
    const i = this.p;
    if (!this.isId(i)) {
      this.fail("expected identifier");
      return i;
    }
    this.p = i + 1;
    return i;
  }

  optional(kind: i32): i32 {
    const i = this.p;
    if (this.t.kind[i] === kind) {
      this.p = i + 1;
      return i;
    }
    return -1;
  }

  optionalKw(kw: i32): i32 {
    const i = this.p;
    if (this.kw(i) === kw) {
      this.p = i + 1;
      return i;
    }
    return -1;
  }

  /** Consumes one `>` from the current token, splitting `>>` and friends. */
  expectGt(): i32 {
    const i = this.p;
    const k = this.t.kind[i];
    if (k === T_GT) {
      this.t.gt[i] = true;
      this.p = i + 1;
      return i;
    }
    if (k === T_SHR || k === T_USHR || k === T_GE || k === T_SHR_EQ || k === T_USHR_EQ) {
      this.splitGt(i);
      this.t.gt[i] = true;
      this.p = i + 1;
      return i;
    }
    this.fail("expected >");
    return i;
  }

  splitGt(i: i32): void {
    this.t.splitGt(i);
    const n = this.t.count;
    if (n + 2 > toI32(this.mt.length)) {
      const m = new Array<i32>(n * 2);
      m.set(this.mt);
      this.mt = m;
    }
    for (let j = n - 1; j > i + 1; j--) {
      this.mt[j] = this.mt[j - 1];
    }
    this.mt[i + 1] = -1;
    for (let j = 0; j < n; j++) {
      if (this.mt[j] > i) {
        this.mt[j] = this.mt[j] + 1;
      }
    }
  }

  /** Pairs up brackets; answers false when they don't balance. */
  matchBrackets(): boolean {
    const n = this.t.count;
    const stack = new Array<i32>(n + 1);
    let sp = 0;
    for (let i = 0; i < n; i++) {
      this.mt[i] = -1;
      const k = this.t.kind[i];
      if (k === T_LPAREN || k === T_LBRACKET || k === T_LBRACE || k === T_INTERP_EXPR) {
        stack[sp] = i;
        sp++;
      } else if (k === T_RPAREN || k === T_RBRACKET || k === T_RBRACE) {
        if (sp === 0) {
          return false;
        }
        sp--;
        const o = stack[sp];
        const ok = this.t.kind[o];
        const want = ok === T_LPAREN ? T_RPAREN : ok === T_LBRACKET ? T_RBRACKET : T_RBRACE;
        if (want !== k) {
          return false;
        }
        this.mt[o] = i;
        this.mt[i] = o;
      }
    }
    return sp === 0;
  }

  // ---------------------------------------------------------------------
  // Lookahead cursors: a token index times 4 plus the number of `>`
  // characters already taken from a compound `>>`-like token.

  /** The kind of the (possibly partial) token at cursor `c`. */
  ck(c: i32): i32 {
    const i = c >> 2;
    const s = c & 3;
    const k = this.t.kind[i];
    if (s === 0) {
      return k;
    }
    if (k === T_SHR) {
      return T_GT;
    }
    if (k === T_USHR) {
      return s === 1 ? T_SHR : T_GT;
    }
    if (k === T_GE) {
      return T_EQ;
    }
    if (k === T_SHR_EQ) {
      return s === 1 ? T_GE : T_EQ;
    }
    if (k === T_USHR_EQ) {
      return s === 1 ? T_SHR_EQ : s === 2 ? T_GE : T_EQ;
    }
    return k;
  }

  ckw(c: i32): i32 {
    if ((c & 3) !== 0) {
      return K_NONE;
    }
    return this.kw(c >> 2);
  }

  cIsId(c: i32): boolean {
    return (c & 3) === 0 && this.isId(c >> 2);
  }

  /** The cursor after the token at `c`. */
  cn(c: i32): i32 {
    return ((c >> 2) + 1) << 2;
  }

  /** The cursor after one `>` at `c`, or NO. */
  cGt(c: i32): i32 {
    const k = this.ck(c);
    if (k === T_GT) {
      return this.cn(c);
    }
    if (k === T_SHR || k === T_USHR || k === T_GE || k === T_SHR_EQ || k === T_USHR_EQ) {
      return c + 1;
    }
    return NO;
  }

  /** The cursor after the group opened at `c`, or NO. */
  cGroupEnd(c: i32): i32 {
    if ((c & 3) !== 0) {
      return NO;
    }
    const m = this.mt[toI32(c >> 2)];
    if (m < 0) {
      return NO;
    }
    return (m + 1) << 2;
  }

  /** fasta's looksLikeName. */
  looksLikeName(c: i32): boolean {
    if ((c & 3) !== 0) {
      return false;
    }
    const i = c >> 2;
    if (this.k(i) !== T_IDENT) {
      return false;
    }
    const kw = this.t.kw[i];
    if (kw === K_NONE || kw === K_THIS || kw === K_SUPER) {
      return true;
    }
    if (dtIsReserved(kw)) {
      return false;
    }
    return kw !== K_TYPEDEF || !this.isId(i + 1);
  }

  looksLikeNameOrEndOfBlock(c: i32): boolean {
    const k = this.ck(c);
    return this.looksLikeName(c) || k === T_EOF || k === T_RBRACE;
  }

  /** fasta's isValidNonRecordTypeReference. */
  isValidTypeRef(c: i32): boolean {
    if ((c & 3) !== 0) {
      return false;
    }
    const i = c >> 2;
    if (this.k(i) !== T_IDENT) {
      return false;
    }
    const kw = this.t.kw[i];
    if (kw === K_NONE) {
      return true;
    }
    if (dtIsReserved(kw)) {
      return kw === K_VOID;
    }
    if (!dtIsBuiltIn(kw)) {
      return true; // contextual keywords
    }
    return this.k(i + 1) === T_DOT || kw === K_DYNAMIC || kw === K_FUNCTION;
  }

  /** `Function` followed by `<` or `(`. */
  isGFT(c: i32): boolean {
    if (this.ckw(c) !== K_FUNCTION) {
      return false;
    }
    const n = this.ck(this.cn(c));
    return n === T_LT || n === T_LPAREN;
  }

  isPossibleRecordType(c: i32): boolean {
    return (c & 3) === 0 && this.k(toI32(c >> 2)) === T_LPAREN && this.mt[toI32(c >> 2)] >= 0;
  }

  // What computeType found.
  tyNullable: boolean = false;
  tyRecord: boolean = false;
  tyRecovered: boolean = false;
  tyCouldBeExpr: boolean = false;
  tyGftReturnHasRecord: boolean = false;
  tyComplexOrArgs: boolean = false; // not a simple or prefixed type

  ret(end: i32, nullable: boolean, record: boolean, recovered: boolean, couldBeExpr: boolean): i32 {
    this.tyNullable = nullable;
    this.tyRecord = record;
    this.tyRecovered = recovered;
    this.tyCouldBeExpr = couldBeExpr;
    this.tyGftReturnHasRecord = false;
    return end;
  }

  // What rest() found.
  rsSeen: boolean = false;
  rsNullable: boolean = false;

  /**
   * fasta's ComplexTypeInfo.computeRest: `start` is the type's first token,
   * `after` the cursor after its base type. Answers the cursor after the
   * type including any `?` and `Function(...)` suffixes.
   */
  rest(start: i32, after: i32, required: boolean): i32 {
    let end = after;
    let token = after;
    let nullable = false;
    if (this.ck(token) === T_QUESTION) {
      nullable = true;
      token = this.cn(token);
      end = token;
    }
    let seen = false;
    while (this.ckw(token) === K_FUNCTION) {
      let n = this.cn(token);
      if (this.ck(n) === T_LT) {
        const ta = this.typeArgsEnd(n, true);
        if (ta !== NO) {
          n = ta;
        }
      }
      if (this.ck(n) !== T_LPAREN) {
        break;
      }
      const ge = this.cGroupEnd(n);
      if (ge === NO) {
        break;
      }
      if (!required) {
        let nx = ge;
        if (this.ck(nx) === T_QUESTION) {
          nx = this.cn(nx);
        }
        if (!(this.cIsId(nx) || this.ckw(nx) === K_THIS || this.ckw(nx) === K_SUPER)) {
          break;
        }
      }
      seen = true;
      nullable = false;
      end = ge;
      token = ge;
      if (this.ck(token) === T_QUESTION) {
        nullable = true;
        token = this.cn(token);
        end = token;
      }
    }
    this.rsSeen = seen;
    this.rsNullable = nullable;
    return end;
  }

  /**
   * fasta's computeType for a type starting at cursor `c`: answers the
   * cursor after the type, or NO, and sets the ty* fields.
   */
  computeType(c: i32, required: boolean): i32 {
    if (!this.isValidTypeRef(c) && !this.isPossibleRecordType(c)) {
      return this.ret(NO, false, false, false, false);
    }
    if (this.ckw(c) === K_VOID) {
      const n = this.cn(c);
      if (this.isGFT(n)) {
        const e = this.rest(c, n, required);
        if (this.rsSeen) {
          return this.ret(e, this.rsNullable, false, false, false);
        }
      }
      return this.ret(n, false, false, false, false);
    }
    if (this.isGFT(c)) {
      const e = this.rest(c, c, required);
      if (!this.rsSeen) {
        return required ? this.ret(this.cn(c), false, false, false, true) : this.ret(NO, false, false, false, false);
      }
      return this.ret(e, this.rsNullable, false, false, false);
    }
    if (this.isPossibleRecordType(c)) {
      const after = this.cGroupEnd(c);
      if (this.isGFT(after) || (this.ck(after) === T_QUESTION && this.isGFT(this.cn(after)))) {
        const e = this.rest(c, after, required);
        if (this.rsSeen) {
          const r = this.ret(e, this.rsNullable, false, false, false);
          this.tyGftReturnHasRecord = true;
          return r;
        }
      }
      return this.computeRecordType(c, required);
    }
    // An identifier.
    const next = this.cn(c);
    if (this.ck(next) === T_LT) {
      const ta = this.typeArgsEnd(next, false);
      if (ta !== NO) {
        if (this.tpSimple) {
          if (this.ck(ta) === T_QUESTION) {
            const n2 = this.cn(ta);
            if (!this.isGFT(n2)) {
              if ((required || this.looksLikeName(n2)) && this.tpSimpleGt) {
                return this.ret(n2, true, false, false, false);
              }
              return this.ret(NO, false, false, false, false);
            }
          } else if (!this.isGFT(ta)) {
            if (required || this.looksLikeName(ta)) {
              return this.ret(ta, false, false, false, false);
            }
            return this.ret(NO, false, false, false, false);
          }
        }
        const e = this.rest(c, ta, required);
        if (!required && !this.looksLikeNameOrEndOfBlock(e) && !this.rsSeen) {
          return this.ret(NO, false, false, false, false);
        }
        return this.ret(e, this.rsNullable, false, false, false);
      }
    }
    if (this.ck(next) === T_DOT) {
      const n2 = this.cn(next);
      if (!this.isValidTypeRef(n2)) {
        return this.ret(NO, false, false, false, false);
      }
      const n3 = this.cn(n2);
      let afterArgs = n3;
      let hasArgs = false;
      if (this.ck(n3) === T_LT) {
        const ta = this.typeArgsEnd(n3, false);
        if (ta !== NO) {
          hasArgs = true;
          afterArgs = ta;
        }
      }
      if (!hasArgs) {
        if (this.ck(n3) === T_QUESTION) {
          const n4 = this.cn(n3);
          if (!this.isGFT(n4) && !(required || this.looksLikeName(n4))) {
            return this.ret(NO, false, false, false, false);
          }
        } else if (!this.isGFT(n3)) {
          if (required || this.looksLikeName(n3)) {
            return this.ret(n3, false, false, false, true);
          }
          return this.ret(NO, false, false, false, false);
        }
      }
      const e = this.rest(c, afterArgs, required);
      if (!required && !this.looksLikeName(e) && !this.rsSeen) {
        return this.ret(NO, false, false, false, false);
      }
      return this.ret(e, this.rsNullable, false, false, !hasArgs && !this.rsSeen);
    }
    if (this.isGFT(next)) {
      const e = this.rest(c, next, required);
      if (!this.rsSeen) {
        return this.ret(next, false, false, false, true);
      }
      return this.ret(e, this.rsNullable, false, false, false);
    }
    if (this.ck(next) === T_QUESTION) {
      const n2 = this.cn(next);
      if (this.isGFT(n2)) {
        const e = this.rest(c, next, required);
        if (!this.rsSeen) {
          return this.ret(n2, true, false, false, true);
        }
        return this.ret(e, this.rsNullable, false, false, false);
      }
      if (required || this.looksLikeName(n2)) {
        return this.ret(n2, true, false, false, true);
      }
      return this.ret(NO, false, false, false, false);
    }
    if (required || this.looksLikeName(next)) {
      return this.ret(next, false, false, false, true);
    }
    return this.ret(NO, false, false, false, false);
  }

  /** fasta's computeRecordType at the `(` at cursor `c`. */
  computeRecordType(c: i32, required: boolean): i32 {
    const close = this.mt[toI32(c >> 2)];
    const recovered = !this.recordTypeContentsOk(c >> 2, close);
    let token = (close + 1) << 2;
    if (!required) {
      let next = token;
      if (this.ck(next) === T_QUESTION) {
        next = this.cn(next);
      }
      let getOrSet = false;
      const nkw = this.ckw(next);
      if ((nkw === K_GET || nkw === K_SET) && this.cIsId(this.cn(next))) {
        getOrSet = true;
        next = this.cn(next);
      }
      if (this.cIsId(next)) {
        const ai = this.cn(next);
        const ak = this.ck(ai);
        const akw = this.ckw(ai);
        if (
          !(
            ak === T_SEMI ||
            ak === T_EQ ||
            ak === T_LT ||
            ak === T_LPAREN ||
            ak === T_COMMA ||
            ak === T_RPAREN ||
            akw === K_IN ||
            ak === T_RBRACE ||
            ak === T_COLON ||
            ak === T_RBRACKET ||
            ak === T_EOF
          )
        ) {
          if (getOrSet && (ak === T_ARROW || ak === T_LBRACE || akw === K_ASYNC || akw === K_SYNC || ak === T_EOF)) {
            // A getter or setter.
          } else if (this.ckw(next) === K_OPERATOR) {
            // `(int, int) operator [](int foo) {}`
          } else {
            return this.ret(NO, false, false, false, false);
          }
        }
      } else if ((this.ckw(next) === K_THIS || this.ckw(next) === K_SUPER) && this.ck(this.cn(next)) === T_DOT) {
        // `C((int, int) this.x)`
      } else {
        const nk = this.ck(next);
        if (
          recovered ||
          !(
            nk === T_COMMA ||
            nk === T_GT ||
            nk === T_SHR ||
            nk === T_SHR_EQ ||
            nk === T_USHR ||
            nk === T_USHR_EQ ||
            nk === T_EOF
          )
        ) {
          return this.ret(NO, false, false, false, false);
        }
      }
    }
    let nullable = false;
    if (this.ck(token) === T_QUESTION) {
      nullable = true;
      token = this.cn(token);
    }
    return this.ret(token, nullable, true, recovered, true);
  }

  /** Whether the `(` at token `o` and `)` at `close` hold a record type's fields. */
  recordTypeContentsOk(o: i32, close: i32): boolean {
    let c = (o + 1) << 2;
    let count = 0;
    let named = false;
    let comma = false;
    while (true) {
      if (this.ck(c) === T_RPAREN) {
        break;
      }
      if (named && this.ck(c) === T_RBRACE && this.ck(this.cn(c)) === T_RPAREN) {
        c = this.cn(c);
        break;
      }
      count++;
      if (!named && this.ck(c) === T_LBRACE) {
        named = true;
        c = this.cn(c);
      }
      while (this.ck(c) === T_AT) {
        c = this.skipMetadataC(c);
        if (c === NO) {
          return false;
        }
      }
      const te = this.computeType(c, true);
      if (te === NO || this.tyRecovered) {
        return false;
      }
      c = te;
      if (this.cIsId(c)) {
        c = this.cn(c);
      } else if (named) {
        return false;
      }
      if (this.ck(c) !== T_COMMA) {
        if (this.ck(c) === T_RPAREN) {
          break;
        }
        if (this.ck(c) === T_RBRACE && this.ck(this.cn(c)) === T_RPAREN) {
          c = this.cn(c);
          break;
        }
        return false;
      }
      comma = true;
      c = this.cn(c);
    }
    if ((count === 1 && !named && !comma) || c >> 2 !== close) {
      return false;
    }
    return true;
  }

  /** Skips one annotation `@name(.name)?(<...>)?(.name)?(args)?` at cursor `c`. */
  skipMetadataC(c0: i32): i32 {
    let c = this.cn(c0);
    if (!this.cIsId(c)) {
      return NO;
    }
    c = this.cn(c);
    if (this.ck(c) === T_DOT && this.cIsId(this.cn(c))) {
      c = this.cn(this.cn(c));
    }
    if (this.ck(c) === T_LT) {
      const ta = this.typeArgsEnd(c, false);
      if (ta !== NO) {
        c = ta;
      }
    }
    if (this.ck(c) === T_DOT && this.cIsId(this.cn(c))) {
      c = this.cn(this.cn(c));
    }
    if (this.ck(c) === T_LPAREN) {
      c = this.cGroupEnd(c);
    }
    return c;
  }

  // What typeArgsEnd found: `< identifier >` (closed by a plain `>`).
  tpSimple: boolean = false;
  tpSimpleGt: boolean = false;

  /**
   * fasta's computeTypeParamOrArg at the `<` at cursor `lt`: answers the
   * cursor after the closing `>`, or NO.
   */
  typeArgsEnd(lt: i32, inDeclaration: boolean): i32 {
    const first = this.cn(lt);
    if ((first & 3) === 0 && this.isPlainOrPseudo(first >> 2)) {
      const after = this.cn(first);
      const ak = this.ck(after);
      if (ak === T_GT || ak === T_SHR || ak === T_GE) {
        this.tpSimple = true;
        this.tpSimpleGt = ak === T_GT;
        return this.cGt(after);
      }
    } else if (this.ck(first) === T_LPAREN) {
      let record = false;
      if (this.isPossibleRecordType(first)) {
        const te = this.computeType(first, false);
        if (te !== NO && (this.tyRecord || this.tyGftReturnHasRecord) && !this.tyRecovered) {
          record = true;
        }
      }
      if (!record) {
        this.tpSimple = false;
        return NO;
      }
    }
    let next = lt; // the cursor before the next type
    while (true) {
      let start = this.cn(next);
      let te = this.computeType(start, true);
      if (te === NO) {
        while (te === NO && this.ck(start) === T_AT) {
          start = this.skipMetadataC(start);
          if (start === NO) {
            this.tpSimple = false;
            return NO;
          }
          te = this.computeType(start, true);
        }
        if (te === NO) {
          if (next === lt && !inDeclaration && !this.isCloser(start) && this.ck(start) !== T_COMMA) {
            this.tpSimple = false;
            return NO;
          }
          if (this.ck(start) !== T_COMMA) {
            this.tpSimple = false;
            return NO;
          }
          te = start;
        }
      }
      let n = te;
      if (this.ckw(n) === K_EXTENDS) {
        const b = this.computeType(this.cn(n), true);
        if (b === NO) {
          this.tpSimple = false;
          return NO;
        }
        n = b;
      }
      if (this.ck(n) !== T_COMMA) {
        const g = this.cGt(n);
        this.tpSimple = false;
        return g;
      }
      next = n;
    }
  }

  isCloser(c: i32): boolean {
    const k = this.ck(c);
    return k === T_GT || k === T_SHR || k === T_GE || k === T_SHR_EQ || k === T_USHR || k === T_USHR_EQ;
  }

  /** fasta's computeMethodTypeArguments for the `<` at token `i`: the cursor after, or NO. */
  methodTypeArgsEnd(i: i32): i32 {
    if (this.k(i) !== T_LT) {
      return NO;
    }
    const e = this.typeArgsEnd(i << 2, false);
    if (e === NO) {
      return NO;
    }
    const k = this.ck(e);
    if (
      k === T_LPAREN ||
      k === T_DOT ||
      k === T_EQEQ ||
      k === T_NE ||
      k === T_RPAREN ||
      k === T_RBRACKET ||
      k === T_RBRACE ||
      k === T_SEMI ||
      k === T_COLON ||
      k === T_COMMA ||
      k === T_EOF
    ) {
      return e;
    }
    return NO;
  }

  /** Whether `<` at token `i` begins type arguments: the token after them, or -1. */
  typeArgsTok(i: i32, inDeclaration: boolean): i32 {
    if (this.k(i) !== T_LT) {
      return -1;
    }
    const e = this.typeArgsEnd(i << 2, inDeclaration);
    if (e === NO) {
      return -1;
    }
    return e;
  }

  // ---------------------------------------------------------------------
  // Nodes.

  mk(kind: i32, beg: i32, ...fs: i32[]): i32 {
    const n = toI32(fs.length);
    const id = this.a.add(kind, beg, this.p - 1, n);
    for (let i = 0; i < n; i++) {
      this.a.set(id, i, fs[i]);
    }
    return id;
  }

  /** A node whose end is token `end` rather than the last one consumed. */
  mkEnd(kind: i32, beg: i32, end: i32, ...fs: i32[]): i32 {
    const n = toI32(fs.length);
    const id = this.a.add(kind, beg, end, n);
    for (let i = 0; i < n; i++) {
      this.a.set(id, i, fs[i]);
    }
    return id;
  }

  ident(): i32 {
    const t = this.expectId();
    return this.mk(N_SIMPLE_IDENTIFIER, t, t);
  }

  /** A simple identifier for any identifier-like token, keywords included. */
  identAny(): i32 {
    const t = this.p;
    if (this.k(t) !== T_IDENT) {
      this.fail("expected identifier");
      return -1;
    }
    this.p = t + 1;
    return this.mk(N_SIMPLE_IDENTIFIER, t, t);
  }

  // ---------------------------------------------------------------------
  // Compilation unit and directives.

  parseUnit(): i32 {
    if (!this.matchBrackets()) {
      this.fail("unbalanced brackets");
      return -1;
    }
    let script = -1;
    if (this.k(this.p) === T_SCRIPT) {
      const t = this.p;
      this.p = t + 1;
      script = this.mk(N_SCRIPT_TAG, t, t);
    }
    const dirs: i32[] = [];
    const decls: i32[] = [];
    while (!this.failed && this.k(this.p) !== T_EOF) {
      const start = this.p;
      const meta = this.parseMetadata();
      const kw = this.kw(this.p);
      const nk = this.k(this.p + 1);
      if (
        (kw === K_IMPORT && nk === T_STRING) ||
        (kw === K_EXPORT && nk === T_STRING) ||
        (kw === K_PART && (nk === T_STRING || this.kw(this.p + 1) === K_OF)) ||
        (kw === K_LIBRARY && (nk === T_SEMI || (nk === T_IDENT && this.isId(this.p + 1))))
      ) {
        if (decls.length > 0) {
          this.fail("directive after declaration");
          return -1;
        }
        dirs.push(this.parseDirective(meta, start));
      } else {
        decls.push(this.parseTopLevelDeclaration(meta, start));
      }
    }
    const eof = this.p;
    return this.mkEnd(N_COMPILATION_UNIT, 1, eof, script, this.a.list(dirs), this.a.list(decls));
  }

  parseDirective(meta: i32, start: i32): i32 {
    const kwTok = this.p;
    const kw = this.kw(kwTok);
    this.p = kwTok + 1;
    if (kw === K_LIBRARY) {
      let name = -1;
      if (this.k(this.p) !== T_SEMI) {
        name = this.parseDottedName();
      }
      const semi = this.expect(T_SEMI);
      return this.mk(N_LIBRARY_DIRECTIVE, start, meta, kwTok, name, semi);
    }
    if (kw === K_PART) {
      if (this.kw(this.p) === K_OF) {
        const of = this.p;
        this.p = of + 1;
        let name = -1;
        let uri = -1;
        if (this.k(this.p) === T_STRING) {
          uri = this.parseStringLiteral();
        } else {
          name = this.parseDottedName();
        }
        const semi = this.expect(T_SEMI);
        return this.mk(N_PART_OF_DIRECTIVE, start, meta, kwTok, of, name, uri, semi);
      }
      const uri = this.parseStringLiteral();
      const configs = this.parseConfigurations();
      const semi = this.expect(T_SEMI);
      return this.mk(N_PART_DIRECTIVE, start, meta, kwTok, uri, configs, semi);
    }
    const uri = this.parseStringLiteral();
    const configs = this.parseConfigurations();
    let deferred = -1;
    let as = -1;
    let prefix = -1;
    if (kw === K_IMPORT) {
      deferred = this.optionalKw(K_DEFERRED);
      as = this.optionalKw(K_AS);
      if (as >= 0) {
        prefix = this.ident();
      } else if (deferred >= 0) {
        this.fail("deferred without as");
      }
    }
    const combs: i32[] = [];
    while (!this.failed) {
      const ckw = this.kw(this.p);
      if (ckw !== K_SHOW && ckw !== K_HIDE) {
        break;
      }
      const ct = this.p;
      this.p = ct + 1;
      const names: i32[] = [];
      names.push(this.ident());
      while (this.optional(T_COMMA) >= 0) {
        names.push(this.ident());
      }
      combs.push(this.mk(ckw === K_SHOW ? N_SHOW_COMBINATOR : N_HIDE_COMBINATOR, ct, ct, this.a.list(names)));
    }
    const semi = this.expect(T_SEMI);
    return this.mk(
      kw === K_IMPORT ? N_IMPORT_DIRECTIVE : N_EXPORT_DIRECTIVE,
      start,
      meta,
      kwTok,
      uri,
      configs,
      deferred,
      as,
      prefix,
      this.a.list(combs),
      semi,
    );
  }

  parseConfigurations(): i32 {
    const cs: i32[] = [];
    while (!this.failed && this.kw(this.p) === K_IF) {
      const ifTok = this.p;
      this.p = ifTok + 1;
      const lp = this.expect(T_LPAREN);
      const name = this.parseDottedName();
      let eq = -1;
      let value = -1;
      if (this.k(this.p) === T_EQEQ) {
        eq = this.p;
        this.p = eq + 1;
        value = this.parseStringLiteral();
      }
      const rp = this.expect(T_RPAREN);
      const uri = this.parseStringLiteral();
      cs.push(this.mk(N_CONFIGURATION, ifTok, ifTok, lp, name, eq, value, rp, uri));
    }
    return this.a.list(cs);
  }

  parseDottedName(): i32 {
    const start = this.p;
    const toks: i32[] = [];
    toks.push(this.expectId());
    while (this.k(this.p) === T_DOT && !this.failed) {
      toks.push(this.p);
      this.p = this.p + 1;
      toks.push(this.expectId());
    }
    return this.mk(N_DOTTED_NAME, start, this.a.list(toks));
  }

  // ---------------------------------------------------------------------
  // Metadata.

  /** Parses `@annotation`s; answers their list. */
  parseMetadata(): i32 {
    if (this.k(this.p) !== T_AT) {
      return 0;
    }
    const xs: i32[] = [];
    while (this.k(this.p) === T_AT && !this.failed) {
      xs.push(this.parseAnnotation());
    }
    return this.a.list(xs);
  }

  parseAnnotation(): i32 {
    const at = this.expect(T_AT);
    let name = this.ident();
    if (this.k(this.p) === T_DOT && this.isId(this.p + 1)) {
      const dot = this.p;
      this.p = dot + 1;
      const id = this.ident();
      name = this.mk(N_PREFIXED_IDENTIFIER, this.a.beg[name], name, dot, id);
    }
    let targs = -1;
    if (this.k(this.p) === T_LT) {
      targs = this.parseTypeArgumentList();
    }
    let period = -1;
    let ctor = -1;
    if (this.k(this.p) === T_DOT) {
      period = this.p;
      this.p = period + 1;
      ctor = this.identAny();
    }
    let args = -1;
    // Arguments must follow the name with no space between.
    if (this.k(this.p) === T_LPAREN && this.t.start[this.p] === this.t.end[this.p - 1]) {
      args = this.parseArgumentList();
    }
    return this.mk(N_ANNOTATION, at, at, name, targs, period, ctor, args);
  }

  // ---------------------------------------------------------------------
  // Top-level declarations.

  isClassModifier(kw: i32): boolean {
    return (
      kw === K_ABSTRACT ||
      kw === K_BASE ||
      kw === K_INTERFACE ||
      kw === K_FINAL ||
      kw === K_SEALED ||
      kw === K_MIXIN ||
      kw === K_AUGMENT
    );
  }

  parseTopLevelDeclaration(meta: i32, start: i32): i32 {
    // Class-like declarations.
    let j = this.p;
    while (this.isClassModifier(this.kw(j))) {
      if (this.kw(j) === K_MIXIN && this.kw(j + 1) !== K_CLASS) {
        break;
      }
      j++;
    }
    const kj = this.kw(j);
    if (kj === K_CLASS) {
      return this.parseClassOrAlias(meta, start);
    }
    if (kj === K_MIXIN && this.isId(j + 1)) {
      return this.parseMixin(meta, start);
    }
    if (kj === K_ENUM && j === this.p && this.isId(j + 1)) {
      return this.parseEnum(meta, start);
    }
    const kw = this.kw(this.p);
    if (kw === K_EXTENSION && (this.isId(this.p + 1) || this.kw(this.p + 1) === K_ON || this.k(this.p + 1) === T_LT)) {
      if (this.kw(this.p + 1) === K_TYPE && (this.isId(this.p + 2) || this.kw(this.p + 2) === K_CONST)) {
        return this.parseExtensionType(meta, start);
      }
      return this.parseExtension(meta, start);
    }
    if (
      kw === K_TYPEDEF &&
      (this.isId(this.p + 1) || this.k(this.p + 1) === T_LPAREN || this.kw(this.p + 1) === K_VOID)
    ) {
      return this.parseTypedef(meta, start);
    }
    return this.parseTopLevelMember(meta, start);
  }

  parseTopLevelMember(meta: i32, start: i32): i32 {
    let external = -1;
    if (this.kw(this.p) === K_EXTERNAL) {
      external = this.p;
      this.p = this.p + 1;
    } else if (this.kw(this.p) === K_AUGMENT) {
      this.fail("augment");
      return -1;
    }
    let late = -1;
    let keyword = -1;
    const kw = this.kw(this.p);
    if (kw === K_FINAL || kw === K_VAR || kw === K_CONST) {
      keyword = this.p;
      this.p = this.p + 1;
    } else if (kw === K_LATE) {
      late = this.p;
      this.p = this.p + 1;
      if (this.kw(this.p) === K_FINAL) {
        keyword = this.p;
        this.p = this.p + 1;
      }
    }
    const beforeType = this.p;
    const te = this.computeType(this.p << 2, false);
    let afterType = beforeType;
    if (te !== NO) {
      if ((te & 3) !== 0) {
        this.fail("odd type end");
        return -1;
      }
      afterType = toI32(te >> 2);
    }
    let getSet = -1;
    const gkw = this.kw(afterType);
    if ((gkw === K_GET || gkw === K_SET) && this.isId(afterType + 1)) {
      getSet = afterType;
    }
    const nameTok = getSet >= 0 ? afterType + 1 : afterType;
    const after = this.k(nameTok + 1);
    if (
      getSet >= 0 ||
      after === T_LPAREN ||
      after === T_LBRACE ||
      after === T_LT ||
      after === T_DOT ||
      after === T_ARROW
    ) {
      if (keyword >= 0 || late >= 0) {
        this.fail("modifier on function");
        return -1;
      }
      let ret = -1;
      if (te !== NO) {
        ret = this.parseType();
      }
      if (getSet >= 0) {
        getSet = this.p;
        this.p = getSet + 1;
      }
      const name = this.expectId();
      const fe = this.parseFunctionExpressionRest(name + 1, true);
      return this.mk(N_FUNCTION_DECLARATION, start, meta, external, ret, getSet, name, fe);
    }
    // A variable.
    const listBeg = late >= 0 ? late : keyword >= 0 ? keyword : beforeType;
    let type = -1;
    if (te !== NO) {
      type = this.parseType();
    }
    const vars = this.parseVariableDeclarations();
    const vl = this.mk(N_VARIABLE_DECLARATION_LIST, listBeg, 0, late, keyword, type, vars);
    const semi = this.expect(T_SEMI);
    return this.mk(N_TOP_LEVEL_VARIABLE_DECLARATION, start, meta, external, vl, semi);
  }

  /** `name (= init)? (, name (= init)?)*`; answers the list. */
  parseVariableDeclarations(): i32 {
    const vs: i32[] = [];
    while (!this.failed) {
      const name = this.expectId();
      let eq = -1;
      let init = -1;
      if (this.k(this.p) === T_EQ) {
        eq = this.p;
        this.p = eq + 1;
        init = this.parseExpression();
      }
      vs.push(this.mk(N_VARIABLE_DECLARATION, name, name, eq, init));
      if (this.optional(T_COMMA) < 0) {
        break;
      }
    }
    return this.a.list(vs);
  }

  /** Modifier tokens of a class header, in order. */
  parseClassOrAlias(meta: i32, start: i32): i32 {
    let abs = -1;
    let base = -1;
    let iface = -1;
    let fin = -1;
    let sealed = -1;
    let mixin = -1;
    while (!this.failed) {
      const kw = this.kw(this.p);
      if (kw === K_CLASS) {
        break;
      }
      const t = this.p;
      this.p = t + 1;
      if (kw === K_ABSTRACT) {
        abs = t;
      } else if (kw === K_BASE) {
        base = t;
      } else if (kw === K_INTERFACE) {
        iface = t;
      } else if (kw === K_FINAL) {
        fin = t;
      } else if (kw === K_SEALED) {
        sealed = t;
      } else if (kw === K_MIXIN) {
        mixin = t;
      } else {
        this.fail("class modifier");
        return -1;
      }
    }
    const classTok = this.expectKw(K_CLASS);
    // A mixin application class?
    let j = classTok + 1;
    if (this.isId(j)) {
      j++;
      if (this.k(j) === T_LT) {
        const e = this.typeArgsTok(j, true);
        if (e >= 0 && (e & 3) === 0) {
          j = toI32(e >> 2);
        }
      }
      if (this.k(j) === T_EQ) {
        const name = this.expectId();
        const saveClass = this.className;
        this.className = name;
        let tps = -1;
        if (this.k(this.p) === T_LT) {
          tps = this.parseTypeParameterList();
        }
        const eq = this.expect(T_EQ);
        const sup = this.parseNamedType();
        const withC = this.parseWithClause();
        const impl = this.parseImplementsClause();
        const semi = this.expect(T_SEMI);
        this.className = saveClass;
        return this.mk(
          N_CLASS_TYPE_ALIAS,
          start,
          meta,
          abs,
          base,
          iface,
          fin,
          sealed,
          mixin,
          classTok,
          name,
          tps,
          eq,
          sup,
          withC,
          impl,
          semi,
        );
      }
    }
    const namePart = this.parseClassNamePart();
    const saveClass = this.className;
    this.className =
      this.a.kind[namePart] === N_PRIMARY_CONSTRUCTOR_DECLARATION ? this.a.f(namePart, 1) : this.a.f(namePart, 0);
    let ext = -1;
    if (this.kw(this.p) === K_EXTENDS) {
      const et = this.p;
      this.p = et + 1;
      const xs: i32[] = [];
      xs.push(this.parseNamedType());
      ext = this.mk(N_EXTENDS_CLAUSE, et, et, this.a.list(xs));
    }
    const withC = this.parseWithClause();
    const impl = this.parseImplementsClause();
    let native = -1;
    if (this.kw(this.p) === K_NATIVE) {
      const nt = this.p;
      this.p = nt + 1;
      let s = -1;
      if (this.k(this.p) === T_STRING) {
        s = this.parseStringLiteral();
      }
      native = this.mk(N_NATIVE_CLAUSE, nt, nt, s);
    }
    const body = this.parseClassBody();
    this.className = saveClass;
    return this.mk(
      N_CLASS_DECLARATION,
      start,
      meta,
      abs,
      base,
      iface,
      fin,
      sealed,
      mixin,
      classTok,
      namePart,
      ext,
      withC,
      impl,
      native,
      body,
    );
  }

  /** `Name<T>` or a primary constructor `const? Name<T>(.name)?(params)`. */
  parseClassNamePart(): i32 {
    const beg = this.p;
    let cst = -1;
    if (this.kw(this.p) === K_CONST) {
      cst = this.p;
      this.p = cst + 1;
    }
    const name = this.expectId();
    let tps = -1;
    if (this.k(this.p) === T_LT) {
      tps = this.parseTypeParameterList();
    }
    if (
      cst >= 0 ||
      this.k(this.p) === T_LPAREN ||
      (this.k(this.p) === T_DOT && this.isId(this.p + 1) && this.k(this.p + 2) === T_LPAREN)
    ) {
      let cname = -1;
      if (this.k(this.p) === T_DOT) {
        const d = this.p;
        this.p = d + 1;
        const nm = this.expectId();
        cname = this.mk(N_PRIMARY_CONSTRUCTOR_NAME, d, d, nm);
      }
      this.primaryParams = true;
      const params = this.parseFormalParameterList(FP_NORMAL);
      return this.mk(N_PRIMARY_CONSTRUCTOR_DECLARATION, beg, cst, name, tps, cname, params);
    }
    return this.mk(N_NAME_WITH_TYPE_PARAMETERS, beg, name, tps);
  }

  parseWithClause(): i32 {
    if (this.kw(this.p) !== K_WITH) {
      return -1;
    }
    const wt = this.p;
    this.p = wt + 1;
    return this.mk(N_WITH_CLAUSE, wt, wt, this.parseTypeList());
  }

  parseImplementsClause(): i32 {
    if (this.kw(this.p) !== K_IMPLEMENTS) {
      return -1;
    }
    const it = this.p;
    this.p = it + 1;
    return this.mk(N_IMPLEMENTS_CLAUSE, it, it, this.parseTypeList());
  }

  /** `Type, Type, ...` of named types. */
  parseTypeList(): i32 {
    const xs: i32[] = [];
    xs.push(this.parseNamedType());
    while (this.optional(T_COMMA) >= 0 && !this.failed) {
      xs.push(this.parseNamedType());
    }
    return this.a.list(xs);
  }

  parseClassBody(): i32 {
    if (this.k(this.p) === T_SEMI) {
      const s = this.p;
      this.p = s + 1;
      return this.mk(N_EMPTY_CLASS_BODY, s, s);
    }
    const lb = this.expect(T_LBRACE);
    const members: i32[] = [];
    while (!this.failed && this.k(this.p) !== T_RBRACE) {
      if (this.k(this.p) === T_EOF) {
        this.fail("eof in class body");
        return -1;
      }
      members.push(this.parseClassMember());
    }
    const rb = this.expect(T_RBRACE);
    return this.mk(N_BLOCK_CLASS_BODY, lb, lb, this.a.list(members), rb);
  }

  parseMixin(meta: i32, start: i32): i32 {
    let base = -1;
    if (this.kw(this.p) === K_BASE) {
      base = this.p;
      this.p = base + 1;
    }
    const mixinTok = this.expectKw(K_MIXIN);
    const name = this.expectId();
    const saveClass = this.className;
    this.className = name;
    let tps = -1;
    if (this.k(this.p) === T_LT) {
      tps = this.parseTypeParameterList();
    }
    let on = -1;
    if (this.kw(this.p) === K_ON) {
      const ot = this.p;
      this.p = ot + 1;
      on = this.mk(N_MIXIN_ON_CLAUSE, ot, ot, this.parseTypeList());
    }
    const impl = this.parseImplementsClause();
    const body = this.parseClassBody();
    this.className = saveClass;
    return this.mk(N_MIXIN_DECLARATION, start, meta, base, mixinTok, name, tps, on, impl, body);
  }

  parseExtension(meta: i32, start: i32): i32 {
    const ext = this.expectKw(K_EXTENSION);
    let name = -1;
    if (this.isId(this.p) && this.kw(this.p) !== K_ON) {
      name = this.expectId();
    }
    let tps = -1;
    if (this.k(this.p) === T_LT) {
      tps = this.parseTypeParameterList();
    }
    const ot = this.expectKw(K_ON);
    const ts: i32[] = [];
    ts.push(this.parseType());
    const on = this.mk(N_EXTENSION_ON_CLAUSE, ot, ot, this.a.list(ts));
    const saveClass = this.className;
    this.className = -1;
    const body = this.parseClassBody();
    this.className = saveClass;
    return this.mk(N_EXTENSION_DECLARATION, start, meta, ext, -1, name, tps, on, body);
  }

  parseExtensionType(meta: i32, start: i32): i32 {
    const ext = this.expectKw(K_EXTENSION);
    const typeTok = this.expectKw(K_TYPE);
    const namePart = this.parseClassNamePart();
    if (this.a.kind[namePart] !== N_PRIMARY_CONSTRUCTOR_DECLARATION) {
      this.fail("extension type without representation");
      return -1;
    }
    const saveClass = this.className;
    this.className = this.a.f(namePart, 1);
    const impl = this.parseImplementsClause();
    const body = this.parseClassBody();
    this.className = saveClass;
    return this.mk(N_EXTENSION_TYPE_DECLARATION, start, meta, ext, typeTok, namePart, impl, body);
  }

  parseEnum(meta: i32, start: i32): i32 {
    const enumTok = this.expectKw(K_ENUM);
    const namePart = this.parseClassNamePart();
    const saveClass = this.className;
    this.className =
      this.a.kind[namePart] === N_PRIMARY_CONSTRUCTOR_DECLARATION ? this.a.f(namePart, 1) : this.a.f(namePart, 0);
    const withC = this.parseWithClause();
    const impl = this.parseImplementsClause();
    let body = -1;
    if (this.k(this.p) === T_SEMI) {
      const s = this.p;
      this.p = s + 1;
      body = this.mk(N_EMPTY_ENUM_BODY, s, s);
    } else {
      const lb = this.expect(T_LBRACE);
      const consts: i32[] = [];
      let semi = -1;
      while (!this.failed && this.k(this.p) !== T_RBRACE && this.k(this.p) !== T_SEMI) {
        const cbeg = this.p;
        const cmeta = this.parseMetadata();
        const name = this.expectId();
        let args = -1;
        const ab = this.p;
        let targs = -1;
        let sel = -1;
        let al = -1;
        if (this.k(this.p) === T_LT) {
          targs = this.parseTypeArgumentList();
        }
        if (this.k(this.p) === T_DOT) {
          const d = this.p;
          this.p = d + 1;
          const nm = this.identAny();
          sel = this.mk(N_CONSTRUCTOR_SELECTOR, d, d, nm);
        }
        if (this.k(this.p) === T_LPAREN) {
          al = this.parseArgumentList();
        } else if (targs >= 0 || sel >= 0) {
          this.fail("enum constant arguments");
          return -1;
        }
        if (targs >= 0 || sel >= 0 || al >= 0) {
          args = this.mk(N_ENUM_CONSTANT_ARGUMENTS, ab, targs, sel, al);
        }
        consts.push(this.mk(N_ENUM_CONSTANT_DECLARATION, cbeg, cmeta, name, args));
        if (this.optional(T_COMMA) < 0) {
          break;
        }
      }
      const members: i32[] = [];
      if (this.k(this.p) === T_SEMI) {
        semi = this.p;
        this.p = semi + 1;
        while (!this.failed && this.k(this.p) !== T_RBRACE) {
          if (this.k(this.p) === T_EOF) {
            this.fail("eof in enum");
            return -1;
          }
          members.push(this.parseClassMember());
        }
      }
      const rb = this.expect(T_RBRACE);
      body = this.mk(N_BLOCK_ENUM_BODY, lb, lb, this.a.list(consts), semi, this.a.list(members), rb);
    }
    this.className = saveClass;
    return this.mk(N_ENUM_DECLARATION, start, meta, enumTok, namePart, withC, impl, body);
  }

  parseTypedef(meta: i32, start: i32): i32 {
    const td = this.expectKw(K_TYPEDEF);
    // `typedef Name<T> = Type;`
    let j = this.p;
    if (this.isId(j)) {
      j++;
      if (this.k(j) === T_LT) {
        const e = this.typeArgsTok(j, true);
        if (e >= 0 && (e & 3) === 0) {
          j = toI32(e >> 2);
        } else if (e >= 0) {
          // `typedef F<T>= ...`: the `>=` closes the parameters.
          j = -2;
        }
      }
      if (j === -2 || this.k(j) === T_EQ) {
        const name = this.expectId();
        let tps = -1;
        if (this.k(this.p) === T_LT) {
          tps = this.parseTypeParameterList();
        }
        const eq = this.expect(T_EQ);
        const type = this.parseType();
        const semi = this.expect(T_SEMI);
        return this.mk(N_GENERIC_TYPE_ALIAS, start, meta, td, name, tps, eq, type, semi);
      }
    }
    // `typedef RetType? Name<T>(params);`
    let ret = -1;
    const te = this.computeType(this.p << 2, false);
    if (te !== NO && this.isId(toI32(te >> 2)) && (te & 3) === 0) {
      ret = this.parseType();
    }
    const name = this.expectId();
    let tps = -1;
    if (this.k(this.p) === T_LT) {
      tps = this.parseTypeParameterList();
    }
    const params = this.parseFormalParameterList(FP_NORMAL);
    const semi = this.expect(T_SEMI);
    return this.mk(N_FUNCTION_TYPE_ALIAS, start, meta, td, ret, name, tps, params, semi);
  }

  // ---------------------------------------------------------------------
  // Class members.

  /** Whether token `i` spells the enclosing type's name. */
  isClassName(i: i32): boolean {
    const c = this.className;
    if (c < 0 || this.k(i) !== T_IDENT) {
      return false;
    }
    const a = this.t.start[c];
    const n = this.t.end[c] - a;
    const b = this.t.start[i];
    if (this.t.end[i] - b !== n) {
      return false;
    }
    for (let j = 0; j < n; j++) {
      if (this.t.src[a + j] !== this.t.src[b + j]) {
        return false;
      }
    }
    return true;
  }

  parseClassMember(): i32 {
    const start = this.p;
    const meta = this.parseMetadata();
    let external = -1;
    let stat = -1;
    let abs = -1;
    let cov = -1;
    let late = -1;
    let keyword = -1; // var, final, const
    let factory = -1;
    while (!this.failed) {
      const kw = this.kw(this.p);
      const t = this.p;
      // A modifier only if something declarable follows.
      const nk = this.k(t + 1);
      if (nk !== T_IDENT && nk !== T_LPAREN) {
        break;
      }
      if (kw === K_EXTERNAL && external < 0) {
        external = t;
      } else if (kw === K_STATIC && stat < 0) {
        stat = t;
      } else if (kw === K_ABSTRACT && abs < 0) {
        abs = t;
      } else if (kw === K_COVARIANT && cov < 0) {
        cov = t;
      } else if (kw === K_LATE && late < 0) {
        late = t;
      } else if ((kw === K_VAR || kw === K_FINAL || kw === K_CONST) && keyword < 0) {
        keyword = t;
      } else if (kw === K_FACTORY && factory < 0) {
        factory = t;
      } else {
        break;
      }
      this.p = t + 1;
    }
    // Constructors.
    const p = this.p;
    if (factory >= 0) {
      return this.parseConstructor(meta, start, external, keyword, factory);
    }
    if (
      this.kw(p) === K_NEW &&
      (this.k(p + 1) === T_LPAREN || this.k(p + 1) === T_DOT || (this.isId(p + 1) && this.k(p + 2) === T_LPAREN))
    ) {
      return this.parseConstructor(meta, start, external, keyword, -1);
    }
    if (
      this.isClassName(p) &&
      (this.k(p + 1) === T_LPAREN || (this.k(p + 1) === T_DOT && this.k(p + 3) === T_LPAREN))
    ) {
      return this.parseConstructor(meta, start, external, keyword, -1);
    }
    if (
      this.kw(p) === K_THIS &&
      keyword < 0 &&
      (this.k(p + 1) === T_COLON || this.k(p + 1) === T_LBRACE || this.k(p + 1) === T_SEMI)
    ) {
      const th = this.p;
      this.p = th + 1;
      let colon = -1;
      const inits: i32[] = [];
      if (this.k(this.p) === T_COLON) {
        colon = this.p;
        this.p = colon + 1;
        this.parseInitializers(inits);
      }
      const body = this.parseFunctionBody(false, true);
      return this.mk(N_PRIMARY_CONSTRUCTOR_BODY, start, meta, th, colon, this.a.list(inits), body);
    }
    // Methods, getters, setters, operators and fields.
    const te = this.computeType(p << 2, false);
    let afterType = p;
    if (te !== NO) {
      if ((te & 3) !== 0) {
        this.fail("odd type end");
        return -1;
      }
      afterType = toI32(te >> 2);
    }
    const akw = this.kw(afterType);
    let getSet = -1;
    let operator = -1;
    if ((akw === K_GET || akw === K_SET) && this.isId(afterType + 1)) {
      getSet = afterType;
    } else if (akw === K_OPERATOR && this.isOperatorName(afterType + 1)) {
      operator = afterType;
    }
    const nameTok = getSet >= 0 || operator >= 0 ? afterType + 1 : afterType;
    const after = this.k(nameTok + 1);
    if (
      getSet >= 0 ||
      operator >= 0 ||
      after === T_LPAREN ||
      after === T_LT ||
      after === T_LBRACE ||
      after === T_ARROW
    ) {
      if (keyword >= 0 || late >= 0) {
        this.fail("modifier on method");
        return -1;
      }
      let ret = -1;
      if (te !== NO) {
        ret = this.parseType();
      }
      let name = -1;
      if (getSet >= 0) {
        getSet = this.p;
        this.p = getSet + 1;
      } else if (operator >= 0) {
        operator = this.p;
        this.p = operator + 1;
      }
      if (operator >= 0) {
        name = this.p;
        const ok = this.k(name);
        if (ok === T_IDENT || ok === T_EOF || ok === T_LPAREN) {
          this.fail("operator name");
          return -1;
        }
        this.p = name + 1;
      } else {
        name = this.expectId();
      }
      let tps = -1;
      if (this.k(this.p) === T_LT) {
        tps = this.parseTypeParameterList();
      }
      let params = -1;
      if (getSet < 0 || this.kw(getSet) === K_SET || this.k(this.p) === T_LPAREN) {
        params = this.parseFormalParameterList(FP_NORMAL);
      }
      const body = this.parseFunctionBody(false, true);
      const modifier = stat >= 0 ? stat : abs;
      return this.mk(
        N_METHOD_DECLARATION,
        start,
        meta,
        external,
        modifier,
        ret,
        getSet,
        operator,
        name,
        tps,
        params,
        body,
      );
    }
    // A field.
    const listBeg = late >= 0 ? late : keyword >= 0 ? keyword : p;
    let type = -1;
    if (te !== NO) {
      type = this.parseType();
    }
    const vars = this.parseVariableDeclarations();
    const vl = this.mkEnd(N_VARIABLE_DECLARATION_LIST, listBeg, this.p - 1, 0, late, keyword, type, vars);
    const semi = this.expect(T_SEMI);
    // The list starts at the first modifier that belongs to it.
    return this.mk(N_FIELD_DECLARATION, start, meta, external, stat, abs, cov, vl, semi);
  }

  /** Whether token `i` is a user-definable operator after `operator`. */
  isOperatorName(i: i32): boolean {
    const k = this.k(i);
    if (k === T_LT) {
      return this.k(i + 1) === T_LPAREN;
    }
    return (
      k === T_GT ||
      k === T_LE ||
      k === T_GE ||
      k === T_EQEQ ||
      k === T_MINUS ||
      k === T_PLUS ||
      k === T_SLASH ||
      k === T_TILDE_SLASH ||
      k === T_STAR ||
      k === T_PERCENT ||
      k === T_BAR ||
      k === T_CARET ||
      k === T_AMP ||
      k === T_SHL ||
      k === T_SHR ||
      k === T_USHR ||
      k === T_INDEX ||
      k === T_INDEX_EQ ||
      k === T_TILDE
    );
  }

  parseConstructor(meta: i32, start: i32, external: i32, keyword: i32, factory: i32): i32 {
    let cst = -1;
    if (keyword >= 0) {
      if (this.kw(keyword) !== K_CONST) {
        this.fail("constructor modifier");
        return -1;
      }
      cst = keyword;
    }
    let newTok = -1;
    let typeName = -1;
    let name = -1;
    if (this.kw(this.p) === K_NEW) {
      newTok = this.p;
      this.p = newTok + 1;
      if (this.isId(this.p) && this.k(this.p + 1) === T_LPAREN) {
        name = this.p;
        this.p = name + 1;
      }
    } else if (factory >= 0 && this.isId(this.p) && !this.isClassName(this.p) && this.k(this.p + 1) === T_LPAREN) {
      // `factory name(...)`
      name = this.p;
      this.p = name + 1;
    } else if (factory < 0 || this.k(this.p) === T_IDENT) {
      typeName = this.ident();
    }
    let period = -1;
    if (this.k(this.p) === T_DOT) {
      period = this.p;
      this.p = period + 1;
      name = this.p;
      if (this.k(name) !== T_IDENT) {
        this.fail("constructor name");
        return -1;
      }
      this.p = name + 1;
    }
    const params = this.parseFormalParameterList(FP_NORMAL);
    let sep = -1;
    const inits: i32[] = [];
    let redirect = -1;
    if (this.k(this.p) === T_COLON) {
      sep = this.p;
      this.p = sep + 1;
      this.parseInitializers(inits);
    } else if (this.k(this.p) === T_EQ && factory >= 0) {
      sep = this.p;
      this.p = sep + 1;
      redirect = this.parseConstructorName();
    }
    let body = -1;
    if (redirect >= 0) {
      const s = this.expect(T_SEMI);
      body = this.mk(N_EMPTY_FUNCTION_BODY, s, s);
    } else {
      body = this.parseFunctionBody(false, true);
    }
    return this.mk(
      N_CONSTRUCTOR_DECLARATION,
      start,
      meta,
      external,
      cst,
      factory,
      newTok,
      typeName,
      period,
      name,
      params,
      sep,
      this.a.list(inits),
      redirect,
      body,
    );
  }

  /** `Type(.name)?` for a redirecting factory. */
  parseConstructorName(): i32 {
    const beg = this.p;
    const type = this.parseNamedType();
    let period = -1;
    let name = -1;
    if (this.k(this.p) === T_DOT) {
      period = this.p;
      this.p = period + 1;
      name = this.identAny();
    }
    return this.mk(N_CONSTRUCTOR_NAME, beg, type, period, name);
  }

  parseInitializers(out: i32[]): void {
    const old = this.mayFn;
    this.mayFn = false;
    while (!this.failed) {
      out.push(this.parseInitializer());
      if (this.optional(T_COMMA) < 0) {
        break;
      }
    }
    this.mayFn = old;
  }

  parseInitializer(): i32 {
    const beg = this.p;
    const kw = this.kw(beg);
    if (kw === K_ASSERT) {
      return this.parseAssert(true);
    }
    if (
      kw === K_SUPER ||
      (kw === K_THIS && (this.k(beg + 1) === T_LPAREN || (this.k(beg + 1) === T_DOT && this.k(beg + 3) === T_LPAREN)))
    ) {
      this.p = beg + 1;
      let period = -1;
      let name = -1;
      if (this.k(this.p) === T_DOT) {
        period = this.p;
        this.p = period + 1;
        name = this.identAny();
      }
      const args = this.parseArgumentList();
      return this.mk(
        kw === K_SUPER ? N_SUPER_CONSTRUCTOR_INVOCATION : N_REDIRECTING_CONSTRUCTOR_INVOCATION,
        beg,
        beg,
        period,
        name,
        args,
      );
    }
    let th = -1;
    let period = -1;
    if (kw === K_THIS) {
      th = beg;
      this.p = beg + 1;
      period = this.expect(T_DOT);
    }
    const field = this.ident();
    const eq = this.expect(T_EQ);
    const e = this.parseExpressionNoCascadeOrCascade();
    return this.mk(N_CONSTRUCTOR_FIELD_INITIALIZER, beg, th, period, field, eq, e);
  }

  /** An initializer's expression: cascades are allowed. */
  parseExpressionNoCascadeOrCascade(): i32 {
    return this.parseExpression();
  }
  // ---------------------------------------------------------------------
  // Types.

  // A `?` at this token index is not part of the type being parsed (the
  // ambiguous `x is T ? a : b`).
  noQ: i32 = -1;

  // The token index where the type being parsed ends, as computeType measured
  // it, or -1: fasta's parser follows the TypeInfo computeType answered, so
  // a `<` or `Function` from there on is not part of the type (`x as int < 5`,
  // the parameter `void Function(int a)` named `Function`).
  tyEnd: i32 = -1;

  /** Parses the type computeType measured as ending at cursor `te`. */
  parseTypeTo(te: i32): i32 {
    const save = this.tyEnd;
    this.tyEnd = (te & 3) === 0 ? toI32(te >> 2) : -1;
    const t = this.parseType();
    this.tyEnd = save;
    return t;
  }

  /** Whether the type being parsed has ended at the current token. */
  atTyEnd(): boolean {
    return this.tyEnd >= 0 && this.p >= this.tyEnd;
  }

  /** Parses a type at the current token. */
  parseType(): i32 {
    let t = -1;
    const p = this.p;
    if (this.kw(p) === K_FUNCTION && (this.k(p + 1) === T_LT || this.k(p + 1) === T_LPAREN)) {
      t = this.parseGenericFunctionType(-1);
    } else if (this.k(p) === T_LPAREN) {
      t = this.parseRecordType();
    } else {
      t = this.parseNamedType();
    }
    while (
      !this.failed &&
      !this.atTyEnd() &&
      this.kw(this.p) === K_FUNCTION &&
      (this.k(this.p + 1) === T_LT || this.k(this.p + 1) === T_LPAREN)
    ) {
      t = this.parseGenericFunctionType(t);
    }
    return t;
  }

  /** `prefix.Name<args>?` with an optional `?`. */
  parseNamedType(): i32 {
    const beg = this.p;
    let prefix = -1;
    let period = -1;
    if (this.k(beg) !== T_IDENT || (dtIsReserved(this.t.kw[beg]) && this.t.kw[beg] !== K_VOID)) {
      this.fail("expected type");
      return -1;
    }
    if (this.k(beg + 1) === T_DOT && this.k(beg + 2) === T_IDENT) {
      prefix = beg;
      period = beg + 1;
      this.p = beg + 2;
    }
    const name = this.p;
    this.p = name + 1;
    let targs = -1;
    if (this.k(this.p) === T_LT && !this.atTyEnd()) {
      targs = this.parseTypeArgumentList();
    }
    const q = this.optQuestion();
    return this.mk(N_NAMED_TYPE, beg, prefix, period, name, targs, q);
  }

  optQuestion(): i32 {
    if (this.k(this.p) === T_QUESTION && this.p !== this.noQ) {
      const q = this.p;
      this.p = q + 1;
      return q;
    }
    return -1;
  }

  parseGenericFunctionType(ret: i32): i32 {
    const beg = ret >= 0 ? this.a.beg[ret] : this.p;
    const fn = this.expectKw(K_FUNCTION);
    let tps = -1;
    if (this.k(this.p) === T_LT) {
      tps = this.parseTypeParameterList();
    }
    const params = this.parseFormalParameterList(FP_FUNCTION_TYPE);
    const q = this.optQuestion();
    return this.mk(N_GENERIC_FUNCTION_TYPE, beg, ret, fn, tps, params, q);
  }

  parseRecordType(): i32 {
    const lp = this.expect(T_LPAREN);
    const pos: i32[] = [];
    let named = -1;
    while (!this.failed && this.k(this.p) !== T_RPAREN) {
      if (this.k(this.p) === T_LBRACE) {
        const lb = this.p;
        this.p = lb + 1;
        const fs: i32[] = [];
        while (!this.failed && this.k(this.p) !== T_RBRACE) {
          const fb = this.p;
          const meta = this.parseMetadata();
          const type = this.parseType();
          const name = this.expectId();
          fs.push(this.mk(N_RECORD_TYPE_NAMED_FIELD, fb, meta, type, name));
          if (this.optional(T_COMMA) < 0) {
            break;
          }
        }
        const rb = this.expect(T_RBRACE);
        named = this.mk(N_RECORD_TYPE_NAMED_FIELDS, lb, lb, this.a.list(fs), rb);
        break;
      }
      const fb = this.p;
      const meta = this.parseMetadata();
      const type = this.parseType();
      let name = -1;
      if (this.isId(this.p)) {
        name = this.p;
        this.p = name + 1;
      }
      pos.push(this.mk(N_RECORD_TYPE_POSITIONAL_FIELD, fb, meta, type, name));
      if (this.optional(T_COMMA) < 0) {
        break;
      }
    }
    const rp = this.expect(T_RPAREN);
    const q = this.optQuestion();
    return this.mk(N_RECORD_TYPE_ANNOTATION, lp, lp, this.a.list(pos), named, rp, q);
  }

  parseTypeArgumentList(): i32 {
    const lt = this.expect(T_LT);
    const xs: i32[] = [];
    while (!this.failed) {
      xs.push(this.parseType());
      if (this.optional(T_COMMA) < 0) {
        break;
      }
    }
    const gt = this.expectGt();
    return this.mk(N_TYPE_ARGUMENT_LIST, lt, lt, this.a.list(xs), gt);
  }

  parseTypeParameterList(): i32 {
    const lt = this.expect(T_LT);
    const xs: i32[] = [];
    while (!this.failed) {
      const beg = this.p;
      const meta = this.parseMetadata();
      const name = this.expectId();
      let ext = -1;
      let bound = -1;
      if (this.kw(this.p) === K_EXTENDS) {
        ext = this.p;
        this.p = ext + 1;
        bound = this.parseType();
      }
      xs.push(this.mk(N_TYPE_PARAMETER, beg, meta, name, ext, bound));
      if (this.optional(T_COMMA) < 0) {
        break;
      }
    }
    const gt = this.expectGt();
    return this.mk(N_TYPE_PARAMETER_LIST, lt, lt, this.a.list(xs), gt);
  }

  // ---------------------------------------------------------------------
  // Formal parameters.

  // Whether the next parameter list is a primary constructor's, whose
  // parameters may be `var` or `final`.
  primaryParams: boolean = false;
  inPrimary: boolean = false;

  parseFormalParameterList(ctx: i32): i32 {
    const saveIn = this.inPrimary;
    this.inPrimary = this.primaryParams;
    this.primaryParams = false;
    const lp = this.expect(T_LPAREN);
    const params: i32[] = [];
    let leftDelim = -1;
    let rightDelim = -1;
    let kind = 0;
    while (!this.failed && this.k(this.p) !== T_RPAREN) {
      const k = this.k(this.p);
      if (kind === 0 && (k === T_LBRACKET || k === T_LBRACE)) {
        leftDelim = this.p;
        kind = k === T_LBRACKET ? 1 : 2;
        this.p = this.p + 1;
        continue;
      }
      if (kind !== 0 && (k === T_RBRACKET || k === T_RBRACE)) {
        rightDelim = this.p;
        this.p = this.p + 1;
        break;
      }
      params.push(this.parseFormalParameter(kind, ctx));
      if (this.optional(T_COMMA) < 0) {
        if (kind !== 0) {
          const ck = this.k(this.p);
          if ((kind === 1 && ck === T_RBRACKET) || (kind === 2 && ck === T_RBRACE)) {
            rightDelim = this.p;
            this.p = this.p + 1;
          } else {
            this.fail("expected closing delimiter");
          }
        }
        break;
      }
    }
    if (kind !== 0 && rightDelim < 0) {
      this.fail("unclosed optional parameters");
    }
    const rp = this.expect(T_RPAREN);
    this.inPrimary = saveIn;
    return this.mk(N_FORMAL_PARAMETER_LIST, lp, lp, this.a.list(params), leftDelim, rightDelim, rp);
  }

  /** Whether a modifier at `i` is one: something that declares follows. */
  modifierFollows(i: i32): boolean {
    const k = this.k(i + 1);
    return k === T_IDENT || k === T_LPAREN;
  }

  parseFormalParameter(kind: i32, ctx: i32): i32 {
    const beg = this.p;
    const meta = this.parseMetadata();
    let req = -1;
    let cov = -1;
    let mutable = -1;
    if (this.kw(this.p) === K_REQUIRED && this.modifierFollows(this.p)) {
      req = this.p;
      this.p = req + 1;
    }
    if (this.kw(this.p) === K_COVARIANT && this.modifierFollows(this.p)) {
      cov = this.p;
      this.p = cov + 1;
    }
    const mk = this.kw(this.p);
    if ((mk === K_VAR || mk === K_FINAL || mk === K_CONST) && this.modifierFollows(this.p)) {
      mutable = this.p;
      this.p = mutable + 1;
      // Before primary constructors (3.13), `var` and `final` were fine on
      // any parameter.
      if ((this.primaryCtors && !this.inPrimary) || mk === K_CONST) {
        this.fail("var, final or const on a parameter");
        return -1;
      }
    }
    let type = -1;
    let fieldKw = -1;
    let period = -1;
    const p = this.p;
    const pk = this.kw(p);
    if (!((pk === K_THIS || pk === K_SUPER) && this.k(p + 1) === T_DOT)) {
      const te = this.computeType(p << 2, false);
      if (te !== NO && ctx !== FP_FUNCTION_TYPE) {
        type = this.parseTypeTo(te);
      } else if (ctx === FP_FUNCTION_TYPE) {
        type = this.parseType();
      }
    }
    const fk = this.kw(this.p);
    if ((fk === K_THIS || fk === K_SUPER) && this.k(this.p + 1) === T_DOT) {
      fieldKw = this.p;
      period = this.p + 1;
      this.p = this.p + 2;
    }
    let name = -1;
    if (this.isId(this.p) || (fieldKw >= 0 && this.k(this.p) === T_IDENT)) {
      name = this.p;
      this.p = name + 1;
    } else if (ctx !== FP_FUNCTION_TYPE || fieldKw >= 0) {
      this.fail("expected parameter name");
      return -1;
    }
    let suffix = -1;
    if (name >= 0 && (this.k(this.p) === T_LPAREN || this.k(this.p) === T_LT)) {
      // fasta's functionTypedParameterVar: `var` or `final` on a
      // function-typed parameter, outside a primary constructor.
      if (mutable >= 0 && !this.inPrimary) {
        this.fail("var or final on a function-typed parameter");
        return -1;
      }
      const sb = this.p;
      let tps = -1;
      if (this.k(this.p) === T_LT) {
        tps = this.parseTypeParameterList();
      }
      const params = this.parseFormalParameterList(FP_NORMAL);
      const q = this.optQuestion();
      suffix = this.mk(N_FUNCTION_TYPED_SUFFIX, sb, tps, params, q);
    }
    let def = -1;
    const dk = this.k(this.p);
    if ((dk === T_EQ || dk === T_COLON) && kind !== 0) {
      const sep = this.p;
      this.p = sep + 1;
      const v = this.parseExpression();
      def = this.mk(N_FORMAL_PARAMETER_DEFAULT_CLAUSE, sep, sep, v);
    }
    const nk =
      fieldKw < 0
        ? N_REGULAR_FORMAL_PARAMETER
        : this.kw(fieldKw) === K_THIS
          ? N_FIELD_FORMAL_PARAMETER
          : N_SUPER_FORMAL_PARAMETER;
    return this.mk(nk, beg, meta, req, cov, mutable, type, fieldKw, period, name, suffix, def, kind);
  }

  // ---------------------------------------------------------------------
  // Function bodies.

  /** `typeParameters? (parameters)? body` after a function's name. */
  parseFunctionExpressionRest(beg: i32, isDeclaration: boolean): i32 {
    const b = this.p;
    let tps = -1;
    if (this.k(this.p) === T_LT) {
      tps = this.parseTypeParameterList();
    }
    let params = -1;
    if (this.k(this.p) === T_LPAREN) {
      params = this.parseFormalParameterList(FP_NORMAL);
    }
    const body = this.parseFunctionBody(!isDeclaration, isDeclaration);
    return this.mk(N_FUNCTION_EXPRESSION, b, tps, params, body);
  }

  /**
   * A function body. In an expression (a function literal), `=> e` takes no
   * `;`. `allowEmpty` allows a bare `;`.
   */
  parseFunctionBody(inExpression: boolean, allowEmpty: boolean): i32 {
    const beg = this.p;
    let keyword = -1;
    let star = -1;
    const kw = this.kw(beg);
    if (
      (kw === K_ASYNC || kw === K_SYNC) &&
      (this.k(beg + 1) === T_LBRACE || this.k(beg + 1) === T_ARROW || this.k(beg + 1) === T_STAR)
    ) {
      keyword = beg;
      this.p = beg + 1;
      if (this.k(this.p) === T_STAR) {
        star = this.p;
        this.p = star + 1;
      } else if (kw === K_SYNC) {
        this.fail("sync without *");
        return -1;
      }
    }
    const saveAsync = this.asyncState;
    this.asyncState = keyword < 0 ? 0 : kw === K_SYNC ? 3 : star >= 0 ? 2 : 1;
    const k = this.k(this.p);
    let body = -1;
    if (k === T_ARROW) {
      if (star >= 0) {
        this.fail("=> with generator");
        return -1;
      }
      const arrow = this.p;
      this.p = arrow + 1;
      const e = this.parseExpression();
      let semi = -1;
      if (!inExpression) {
        semi = this.expect(T_SEMI);
      }
      body = this.mk(N_EXPRESSION_FUNCTION_BODY, beg, keyword, star, arrow, e, semi);
    } else if (k === T_LBRACE) {
      const block = this.parseBlock();
      body = this.mk(N_BLOCK_FUNCTION_BODY, beg, keyword, star, block);
    } else if (k === T_SEMI && allowEmpty && keyword < 0) {
      const s = this.p;
      this.p = s + 1;
      body = this.mk(N_EMPTY_FUNCTION_BODY, s, s);
    } else if (this.kw(this.p) === K_NATIVE && allowEmpty && keyword < 0) {
      const nt = this.p;
      this.p = nt + 1;
      let s = -1;
      if (this.k(this.p) === T_STRING) {
        s = this.parseStringLiteral();
      }
      const semi = this.expect(T_SEMI);
      body = this.mk(N_NATIVE_FUNCTION_BODY, nt, nt, s, semi);
    } else {
      this.fail("expected function body");
    }
    this.asyncState = saveAsync;
    return body;
  }
  // ---------------------------------------------------------------------
  // Statements.

  parseBlock(): i32 {
    const lb = this.expect(T_LBRACE);
    const xs: i32[] = [];
    while (!this.failed && this.k(this.p) !== T_RBRACE) {
      if (this.k(this.p) === T_EOF) {
        this.fail("eof in block");
        return -1;
      }
      xs.push(this.parseStatement());
    }
    const rb = this.expect(T_RBRACE);
    return this.mk(N_BLOCK, lb, lb, this.a.list(xs), rb);
  }

  parseStatement(): i32 {
    const p = this.p;
    const k = this.k(p);
    if (k === T_LBRACE) {
      const m = this.mt[p];
      if (m >= 0 && this.k(m + 1) === T_EQ) {
        return this.parseExpressionStatement();
      }
      return this.parseBlock();
    }
    if (k === T_SEMI) {
      this.p = p + 1;
      return this.mk(N_EMPTY_STATEMENT, p, p);
    }
    if (k !== T_IDENT) {
      return this.parseExpressionStatementOrDeclaration();
    }
    const kw = this.t.kw[p];
    if (this.isId(p) && this.k(p + 1) === T_COLON) {
      return this.parseLabeled();
    }
    switch (kw) {
      case K_RETURN: {
        this.p = p + 1;
        let e = -1;
        if (this.k(this.p) !== T_SEMI) {
          e = this.parseExpression();
        }
        const semi = this.expect(T_SEMI);
        return this.mk(N_RETURN_STATEMENT, p, p, e, semi);
      }
      case K_IF:
        return this.parseIf();
      case K_FOR:
        return this.parseFor(-1);
      case K_AWAIT:
        if (this.kw(p + 1) === K_FOR) {
          this.p = p + 1;
          return this.parseFor(p);
        }
        return this.parseExpressionStatement();
      case K_WHILE: {
        this.p = p + 1;
        const lp = this.expect(T_LPAREN);
        const c = this.parseExpression();
        const rp = this.expect(T_RPAREN);
        const body = this.parseStatement();
        return this.mk(N_WHILE_STATEMENT, p, p, lp, c, rp, body);
      }
      case K_DO: {
        this.p = p + 1;
        const body = this.parseStatement();
        const wh = this.expectKw(K_WHILE);
        const lp = this.expect(T_LPAREN);
        const c = this.parseExpression();
        const rp = this.expect(T_RPAREN);
        const semi = this.expect(T_SEMI);
        return this.mk(N_DO_STATEMENT, p, p, body, wh, lp, c, rp, semi);
      }
      case K_TRY:
        return this.parseTry();
      case K_SWITCH:
        return this.parseSwitchStatement();
      case K_BREAK:
      case K_CONTINUE: {
        this.p = p + 1;
        let label = -1;
        if (this.isId(this.p)) {
          const lt = this.p;
          this.p = lt + 1;
          label = this.mk(N_LABEL_REFERENCE, lt, lt);
        }
        const semi = this.expect(T_SEMI);
        return this.mk(kw === K_BREAK ? N_BREAK_STATEMENT : N_CONTINUE_STATEMENT, p, p, label, semi);
      }
      case K_ASSERT:
        return this.parseAssert(false);
      case K_YIELD: {
        if (this.asyncState !== 0 || this.looksLikeExprAfter(p, false)) {
          this.p = p + 1;
          const star = this.optional(T_STAR);
          const e = this.parseExpression();
          const semi = this.expect(T_SEMI);
          return this.mk(N_YIELD_STATEMENT, p, p, star, e, semi);
        }
        return this.parseExpressionStatementOrDeclaration();
      }
      case K_CONST:
        return this.parseExpressionStatementOrDeclaration();
      default:
        return this.parseExpressionStatementOrDeclaration();
    }
  }

  parseLabeled(): i32 {
    const beg = this.p;
    const labels: i32[] = [];
    while (this.isId(this.p) && this.k(this.p + 1) === T_COLON) {
      const n = this.p;
      this.p = n + 2;
      labels.push(this.mkEnd(N_LABEL, n, n + 1, n, n + 1));
    }
    const s = this.parseStatement();
    return this.mk(N_LABELED_STATEMENT, beg, this.a.list(labels), s);
  }

  parseExpressionStatement(): i32 {
    const beg = this.p;
    const e = this.parseExpression();
    const semi = this.expect(T_SEMI);
    return this.mk(N_EXPRESSION_STATEMENT, beg, e, semi);
  }

  parseAssert(initializer: boolean): i32 {
    const as = this.expectKw(K_ASSERT);
    const lp = this.expect(T_LPAREN);
    const oldFn = this.mayFn;
    this.mayFn = true;
    const c = this.parseExpression();
    let comma = -1;
    let msg = -1;
    if (this.k(this.p) === T_COMMA) {
      comma = this.p;
      this.p = comma + 1;
      if (this.k(this.p) !== T_RPAREN) {
        msg = this.parseExpression();
        this.optional(T_COMMA);
      }
    }
    this.mayFn = oldFn;
    const rp = this.expect(T_RPAREN);
    let semi = -1;
    if (!initializer) {
      semi = this.expect(T_SEMI);
    }
    const n = this.mk(initializer ? N_ASSERT_INITIALIZER : N_ASSERT_STATEMENT, as, as, lp, c, comma, msg, rp, semi);
    this.markAdjacentStrings(c, msg);
    return n;
  }

  /**
   * fasta's skipOuterPattern at token `i`: answers the last token of the
   * outer pattern starting there, or -1.
   */
  skipOuterPattern(i: i32): i32 {
    if (this.isId(i)) {
      let j = i;
      if (this.k(j + 1) === T_DOT) {
        if (!this.isId(j + 2)) {
          return -1;
        }
        j = j + 2;
      }
      let a = j + 1;
      if (this.k(a) === T_LT) {
        const e = this.typeArgsTok(a, false);
        if (e < 0 || (e & 3) !== 0) {
          return -1;
        }
        a = toI32(e >> 2);
      }
      if (this.k(a) !== T_LPAREN) {
        return -1;
      }
      return this.mt[a];
    }
    let a = i;
    let hasArgs = false;
    if (this.k(a) === T_LT) {
      const e = this.typeArgsTok(a, true);
      if (e >= 0) {
        if ((e & 3) !== 0) {
          return -1;
        }
        a = toI32(e >> 2);
        hasArgs = true;
      }
    }
    const k = this.k(a);
    if (k === T_LBRACKET || k === T_LBRACE) {
      return this.mt[a];
    }
    if (!hasArgs && k === T_LPAREN) {
      return this.mt[a];
    }
    return -1;
  }

  /**
   * fasta's parseExpressionStatementOrDeclaration: a local variable or
   * pattern declaration, a local function, or an expression statement.
   */
  parseExpressionStatementOrDeclaration(): i32 {
    const start = this.p;
    const meta = this.parseMetadata();
    let late = -1;
    let keyword = -1;
    const kw = this.kw(this.p);
    if (kw === K_VAR || kw === K_FINAL || kw === K_CONST) {
      if (kw !== K_CONST || this.constStartsDeclaration(this.p)) {
        keyword = this.p;
        this.p = this.p + 1;
      }
    } else if (kw === K_LATE && (this.k(this.p + 1) === T_IDENT || this.k(this.p + 1) === T_LPAREN)) {
      late = this.p;
      this.p = this.p + 1;
      if (this.kw(this.p) === K_VAR || this.kw(this.p) === K_FINAL) {
        keyword = this.p;
        this.p = this.p + 1;
      }
    }
    const beforeType = this.p;
    // A pattern variable declaration.
    if (keyword >= 0 && this.kw(keyword) !== K_CONST) {
      const e = this.skipOuterPattern(beforeType);
      if (e >= 0 && this.k(e + 1) === T_EQ) {
        const decl = this.parsePatternDeclaration(start, meta, keyword);
        const semi = this.expect(T_SEMI);
        return this.mk(N_PATTERN_VARIABLE_DECLARATION_STATEMENT, start, decl, semi);
      }
    }
    let te = this.computeType(beforeType << 2, false);
    let afterType = beforeType;
    if (te !== NO) {
      if ((te & 3) !== 0) {
        te = NO;
      } else {
        afterType = toI32(te >> 2);
      }
    }
    const nullable = this.tyNullable;
    const couldBeExpr = this.tyCouldBeExpr;
    // A local function.
    if (this.looksLikeLocalFunction(afterType)) {
      let ret = -1;
      if (te !== NO) {
        ret = this.parseType();
      }
      const name = this.expectId();
      const fe = this.parseFunctionExpressionRest(name + 1, true);
      const fd = this.mk(N_FUNCTION_DECLARATION, start, meta, -1, ret, -1, name, fe);
      return this.mk(N_FUNCTION_DECLARATION_STATEMENT, start, fd);
    }
    const plain = beforeType === start;
    if (plain && te !== NO && nullable && couldBeExpr) {
      // `a ? b : c` scanned as the type `a?` and the name `b`.
      const next = afterType;
      if (this.looksLikeName(next << 2)) {
        const ai = next + 1;
        if (this.k(ai) === T_EQ) {
          if (this.speculateConditional(ai + 1)) {
            te = NO;
          }
        } else if (
          !(this.k(ai) === T_IDENT && this.t.kw[ai] !== K_NONE) &&
          !(this.k(ai) === T_SEMI || this.k(ai) === T_COMMA || this.k(ai) === T_RPAREN || this.k(ai) === T_EOF)
        ) {
          te = NO;
        }
      } else {
        // Not a name after the type: an expression.
        te = NO;
      }
    }
    if (te === NO && plain) {
      return this.parseExpressionStatement();
    }
    if (te !== NO && plain && couldBeExpr) {
      const nkw = this.kw(afterType);
      if (nkw === K_AS || nkw === K_IS) {
        const kk = this.k(afterType + 1);
        if (kk !== T_EQ && kk !== T_SEMI && kk !== T_COMMA) {
          return this.parseExpressionStatement();
        }
      }
    }
    // A local variable declaration.
    const listBeg = meta !== 0 ? start : late >= 0 ? late : keyword >= 0 ? keyword : beforeType;
    let type = -1;
    if (te !== NO) {
      type = this.parseType();
    }
    const vars = this.parseVariableDeclarations();
    const vl = this.mk(N_VARIABLE_DECLARATION_LIST, listBeg, meta, late, keyword, type, vars);
    const semi = this.expect(T_SEMI);
    return this.mk(N_VARIABLE_DECLARATION_STATEMENT, start, vl, semi);
  }

  /** fasta's parseExpressionStatementOrConstDeclaration test for `const` at `c`. */
  constStartsDeclaration(c: i32): boolean {
    const te = this.computeType((c + 1) << 2, false);
    if (te === NO) {
      const next = c + 1;
      if (!this.isId(next)) {
        return false;
      }
      const n2 = this.k(next + 1);
      if (!(n2 === T_EQ || n2 === T_IDENT || n2 === T_SEMI || n2 === T_COMMA || n2 === T_LBRACE)) {
        return false;
      }
    }
    return true;
  }

  /** fasta's looksLikeLocalFunction at token `i`. */
  looksLikeLocalFunction(i: i32): boolean {
    if (!this.isId(i)) {
      return false;
    }
    let j = i + 1;
    if (this.k(j) === T_LT) {
      const e = this.typeArgsTok(j, false);
      if (e < 0 || (e & 3) !== 0) {
        return false;
      }
      j = toI32(e >> 2);
    }
    if (this.k(j) === T_LPAREN) {
      const m = this.mt[j];
      if (m < 0) {
        return false;
      }
      return this.looksLikeFunctionBody(m + 1);
    }
    return this.k(j) === T_ARROW;
  }

  looksLikeFunctionBody(i: i32): boolean {
    const k = this.k(i);
    const kw = this.kw(i);
    return k === T_LBRACE || k === T_ARROW || kw === K_ASYNC || kw === K_SYNC;
  }

  /** Whether an expression from `i` is followed by `:`, speculatively. */
  speculateConditional(i: i32): boolean {
    const save = this.save();
    this.p = i;
    this.parseExpressionNoCascade();
    const ok = !this.failed && this.k(this.p) === T_COLON;
    this.restore(save);
    return ok;
  }

  // Speculation.
  svP: i32[];
  svN: i32[];
  svF: i32[];
  svL: i32[];
  svFailed: boolean[];

  save(): i32 {
    this.svP.push(this.p);
    this.svN.push(this.a.n);
    this.svF.push(this.a.nf);
    this.svL.push(this.a.nl);
    this.svFailed.push(this.failed);
    return toI32(this.svP.length) - 1;
  }

  restore(s: i32): void {
    this.p = this.svP[s];
    this.a.n = this.svN[s];
    this.a.nf = this.svF[s];
    this.a.nl = this.svL[s];
    this.failed = this.svFailed[s];
    this.svP.pop();
    this.svN.pop();
    this.svF.pop();
    this.svL.pop();
    this.svFailed.pop();
  }

  /** Whether the text from `i` parses as `?` expr `:` expr. */
  canParseAsConditional(q: i32): boolean {
    const s = this.save();
    this.p = q + 1;
    this.parseExpressionNoCascade();
    let ok = false;
    if (!this.failed && this.k(this.p) === T_COLON) {
      this.p = this.p + 1;
      this.parseExpressionNoCascade();
      ok = !this.failed;
    }
    this.restore(s);
    return ok;
  }

  parsePatternDeclaration(start: i32, meta: i32, keyword: i32): i32 {
    const pat = this.parsePattern(PC_DECLARATION, 1);
    const eq = this.expect(T_EQ);
    const e = this.parseExpression();
    const beg = meta !== 0 ? start : keyword;
    return this.mk(N_PATTERN_VARIABLE_DECLARATION, beg, meta, keyword, pat, eq, e);
  }

  parseIf(): i32 {
    const ifTok = this.expectKw(K_IF);
    const lp = this.expect(T_LPAREN);
    const e = this.parseExpression();
    const cc = this.parseCaseClauseOpt();
    const rp = this.expect(T_RPAREN);
    const then = this.parseStatement();
    let elseTok = -1;
    let els = -1;
    if (this.kw(this.p) === K_ELSE) {
      elseTok = this.p;
      this.p = elseTok + 1;
      els = this.parseStatement();
    }
    return this.mk(N_IF_STATEMENT, ifTok, ifTok, lp, e, cc, rp, then, elseTok, els);
  }

  /** `case pattern (when expr)?` inside an if condition. */
  parseCaseClauseOpt(): i32 {
    if (this.kw(this.p) !== K_CASE) {
      return -1;
    }
    const ct = this.p;
    this.p = ct + 1;
    const gp = this.parseGuardedPattern();
    return this.mk(N_CASE_CLAUSE, ct, ct, gp);
  }

  parseGuardedPattern(): i32 {
    const beg = this.p;
    const pat = this.parsePattern(PC_MATCHING, 1);
    let when = -1;
    if (this.kw(this.p) === K_WHEN) {
      const wt = this.p;
      this.p = wt + 1;
      const e = this.parseExpression();
      when = this.mk(N_WHEN_CLAUSE, wt, wt, e);
    }
    return this.mk(N_GUARDED_PATTERN, beg, pat, when);
  }

  parseFor(awaitTok: i32): i32 {
    const forTok = this.expectKw(K_FOR);
    const lp = this.expect(T_LPAREN);
    const parts = this.parseForLoopParts(false);
    const rp = this.expect(T_RPAREN);
    const body = this.parseStatement();
    return this.mk(N_FOR_STATEMENT, awaitTok >= 0 ? awaitTok : forTok, awaitTok, forTok, lp, parts, rp, body);
  }

  /** The parts of a for statement or element, after `(`. */
  parseForLoopParts(inElement: boolean): i32 {
    const start = this.p;
    if (this.k(start) === T_SEMI) {
      return this.parseForPartsRest(N_FOR_PARTS_WITH_EXPRESSION, -1, start);
    }
    const meta = this.parseMetadata();
    let late = -1;
    let keyword = -1;
    const kw = this.kw(this.p);
    if (kw === K_VAR || kw === K_FINAL || kw === K_CONST) {
      keyword = this.p;
      this.p = this.p + 1;
    } else if (kw === K_LATE) {
      late = this.p;
      this.p = this.p + 1;
      if (this.kw(this.p) === K_VAR || this.kw(this.p) === K_FINAL) {
        keyword = this.p;
        this.p = this.p + 1;
      }
    }
    const beforeType = this.p;
    if (keyword >= 0 && this.kw(keyword) !== K_CONST) {
      const e = this.skipOuterPattern(beforeType);
      if (e >= 0 && (this.k(e + 1) === T_EQ || this.kw(e + 1) === K_IN)) {
        const pat = this.parsePattern(PC_DECLARATION, 1);
        if (this.kw(this.p) === K_IN) {
          const inTok = this.p;
          this.p = inTok + 1;
          const it = this.parseExpression();
          return this.mk(N_FOR_EACH_PARTS_WITH_PATTERN, start, meta, keyword, pat, inTok, it);
        }
        const eq = this.expect(T_EQ);
        const e2 = this.parseExpression();
        const beg = meta !== 0 ? start : keyword;
        const decl = this.mk(N_PATTERN_VARIABLE_DECLARATION, beg, meta, keyword, pat, eq, e2);
        return this.parseForPartsRest(N_FOR_PARTS_WITH_PATTERN, decl, start);
      }
    }
    let te = this.computeType(beforeType << 2, false);
    let afterType = beforeType;
    if (te !== NO) {
      if ((te & 3) !== 0) {
        te = NO;
      } else {
        afterType = toI32(te >> 2);
      }
    }
    const plain = beforeType === start;
    if (te !== NO && plain && this.tyCouldBeExpr) {
      const nkw = this.kw(afterType);
      if ((nkw === K_AS || nkw === K_IS) && this.kw(afterType + 1) !== K_IN) {
        const kk = this.k(afterType + 1);
        if (kk !== T_EQ && kk !== T_SEMI && kk !== T_COMMA) {
          te = NO;
        }
      }
    }
    if (te === NO && plain) {
      // An expression, or an identifier before `in`.
      if (this.isId(this.p) && this.kw(this.p + 1) === K_IN) {
        const id = this.ident();
        const inTok = this.expectKw(K_IN);
        const it = this.parseExpression();
        return this.mk(N_FOR_EACH_PARTS_WITH_IDENTIFIER, start, id, inTok, it);
      }
      const init = this.parseExpression();
      if (this.kw(this.p) === K_IN) {
        this.fail("for-in over a non-identifier");
        return -1;
      }
      return this.parseForPartsRest(N_FOR_PARTS_WITH_EXPRESSION, init, start);
    }
    // A declaration.
    let type = -1;
    if (te !== NO) {
      type = this.parseType();
    }
    if (this.isId(this.p) && this.kw(this.p + 1) === K_IN) {
      const name = this.expectId();
      const di = this.mk(N_DECLARED_IDENTIFIER, start, meta, keyword, type, name);
      const inTok = this.expectKw(K_IN);
      const it = this.parseExpression();
      return this.mk(N_FOR_EACH_PARTS_WITH_DECLARATION, start, di, inTok, it);
    }
    const listBeg = meta !== 0 ? start : late >= 0 ? late : keyword >= 0 ? keyword : beforeType;
    const vars = this.parseVariableDeclarations();
    const vl = this.mk(N_VARIABLE_DECLARATION_LIST, listBeg, meta, late, keyword, type, vars);
    return this.parseForPartsRest(N_FOR_PARTS_WITH_DECLARATIONS, vl, start);
  }

  /** `; condition? ; updaters` */
  parseForPartsRest(kind: i32, init: i32, start: i32): i32 {
    const ls = this.expect(T_SEMI);
    let cond = -1;
    if (this.k(this.p) !== T_SEMI) {
      cond = this.parseExpression();
    }
    const rs = this.expect(T_SEMI);
    const ups: i32[] = [];
    while (!this.failed && this.k(this.p) !== T_RPAREN) {
      ups.push(this.parseExpression());
      if (this.optional(T_COMMA) < 0) {
        break;
      }
    }
    return this.mk(kind, init >= 0 ? this.a.beg[init] : ls, init, ls, cond, rs, this.a.list(ups));
  }

  parseTry(): i32 {
    const tryTok = this.expectKw(K_TRY);
    const body = this.parseBlock();
    const catches: i32[] = [];
    while (!this.failed && (this.kw(this.p) === K_ON || this.kw(this.p) === K_CATCH)) {
      const cb = this.p;
      let on = -1;
      let type = -1;
      if (this.kw(this.p) === K_ON) {
        on = this.p;
        this.p = on + 1;
        type = this.parseType();
      }
      let catchTok = -1;
      let lp = -1;
      let ep = -1;
      let comma = -1;
      let sp = -1;
      let rp = -1;
      if (this.kw(this.p) === K_CATCH) {
        catchTok = this.p;
        this.p = catchTok + 1;
        lp = this.expect(T_LPAREN);
        const e = this.expectId();
        ep = this.mk(N_CATCH_CLAUSE_PARAMETER, e, e);
        if (this.k(this.p) === T_COMMA) {
          comma = this.p;
          this.p = comma + 1;
          const s = this.expectId();
          sp = this.mk(N_CATCH_CLAUSE_PARAMETER, s, s);
        }
        rp = this.expect(T_RPAREN);
      }
      const cbody = this.parseBlock();
      catches.push(this.mk(N_CATCH_CLAUSE, cb, on, type, catchTok, lp, ep, comma, sp, rp, cbody));
    }
    let fin = -1;
    let finBlock = -1;
    if (this.kw(this.p) === K_FINALLY) {
      fin = this.p;
      this.p = fin + 1;
      finBlock = this.parseBlock();
    }
    if (catches.length === 0 && fin < 0) {
      this.fail("try without catch or finally");
      return -1;
    }
    return this.mk(N_TRY_STATEMENT, tryTok, tryTok, body, this.a.list(catches), fin, finBlock);
  }

  parseSwitchStatement(): i32 {
    const sw = this.expectKw(K_SWITCH);
    const lp = this.expect(T_LPAREN);
    const e = this.parseExpression();
    const rp = this.expect(T_RPAREN);
    const lb = this.expect(T_LBRACE);
    const members: i32[] = [];
    while (!this.failed && this.k(this.p) !== T_RBRACE) {
      const mb = this.p;
      const labels: i32[] = [];
      while (this.isId(this.p) && this.k(this.p + 1) === T_COLON) {
        const n = this.p;
        this.p = n + 2;
        labels.push(this.mkEnd(N_LABEL, n, n + 1, n, n + 1));
      }
      const kw = this.kw(this.p);
      if (kw === K_CASE) {
        const ct = this.p;
        this.p = ct + 1;
        if (!this.patterns) {
          // Before 3.0, a case holds an expression.
          const e = this.parseExpression();
          const colon = this.expect(T_COLON);
          const stmts = this.parseSwitchStatements();
          members.push(this.mk(N_SWITCH_CASE, mb, this.a.list(labels), ct, e, colon, stmts));
          continue;
        }
        const gp = this.parseGuardedPattern();
        const colon = this.expect(T_COLON);
        const stmts = this.parseSwitchStatements();
        members.push(this.mk(N_SWITCH_PATTERN_CASE, mb, this.a.list(labels), ct, gp, colon, stmts));
      } else if (kw === K_DEFAULT) {
        const dt = this.p;
        this.p = dt + 1;
        const colon = this.expect(T_COLON);
        const stmts = this.parseSwitchStatements();
        members.push(this.mk(N_SWITCH_DEFAULT, mb, this.a.list(labels), dt, colon, stmts));
      } else {
        this.fail("expected case");
        return -1;
      }
    }
    const rb = this.expect(T_RBRACE);
    return this.mk(N_SWITCH_STATEMENT, sw, sw, lp, e, rp, lb, this.a.list(members), rb);
  }

  parseSwitchStatements(): i32 {
    const xs: i32[] = [];
    while (!this.failed) {
      const k = this.k(this.p);
      if (k === T_RBRACE || k === T_EOF) {
        break;
      }
      const kw = this.kw(this.p);
      if (kw === K_CASE || kw === K_DEFAULT) {
        break;
      }
      // A label before `case`?
      let j = this.p;
      while (this.isId(j) && this.k(j + 1) === T_COLON) {
        j = j + 2;
      }
      if (j > this.p && (this.kw(j) === K_CASE || this.kw(j) === K_DEFAULT)) {
        break;
      }
      xs.push(this.parseStatement());
    }
    return this.a.list(xs);
  }
  // ---------------------------------------------------------------------
  // Expressions.

  parseExpression(): i32 {
    return this.parseExpr(true);
  }

  parseExpressionNoCascade(): i32 {
    return this.parseExpr(false);
  }

  depth: i32 = 0;

  parseExpr(allowCascades: boolean): i32 {
    this.depth = this.depth + 1;
    if (this.depth > 400) {
      this.fail("expression too deep");
      this.depth = this.depth - 1;
      return -1;
    }
    const p = this.p;
    let r = -1;
    const e = this.skipOuterPattern(p);
    if (e >= 0 && this.k(e + 1) === T_EQ) {
      const pat = this.parsePattern(PC_ASSIGNMENT, 1);
      const eq = this.expect(T_EQ);
      const rhs = this.parseExpr(allowCascades);
      r = this.mk(N_PATTERN_ASSIGNMENT, p, pat, eq, rhs);
    } else if (this.kw(p) === K_THROW) {
      this.p = p + 1;
      const ex = this.parseExpr(allowCascades);
      r = this.mk(N_THROW_EXPRESSION, p, p, ex);
    } else {
      r = this.parsePrecedence(P_ASSIGNMENT, allowCascades, false);
    }
    this.depth = this.depth - 1;
    return r;
  }

  /** Whether `.` at `i` (or `const .` there) starts a dot shorthand. */
  isDotShorthand(i: i32): boolean {
    if (this.k(i) === T_DOT && (this.isId(i + 1) || this.kw(i + 1) === K_NEW)) {
      return true;
    }
    if (this.kw(i) === K_CONST && this.k(i + 1) === T_DOT && (this.isId(i + 2) || this.kw(i + 2) === K_NEW)) {
      return true;
    }
    return false;
  }

  parsePrecedence(prec: i32, allowCascades: boolean, constPattern: boolean): i32 {
    const p = this.p;
    let left = -1;
    if (this.isDotShorthand(p)) {
      left = this.parseDotShorthand(allowCascades);
    } else {
      left = this.parseUnary(allowCascades);
      left = this.typeArgApplication(left);
    }
    return this.precedenceLoop(prec, allowCascades, left, constPattern);
  }

  parseDotShorthand(allowCascades: boolean): i32 {
    const beg = this.p;
    let cst = -1;
    if (this.kw(beg) === K_CONST) {
      cst = beg;
      this.p = beg + 1;
    }
    const dot = this.expect(T_DOT);
    const name = this.identAny();
    let targs = -1;
    if (this.k(this.p) === T_LT) {
      const e = this.typeArgsTok(this.p, false);
      if (e >= 0 && this.ck(e) === T_LPAREN) {
        targs = this.parseTypeArgumentList();
      }
    }
    let left = -1;
    if (this.k(this.p) === T_LPAREN) {
      const args = this.parseArgumentList();
      if (cst >= 0) {
        left = this.mk(N_DOT_SHORTHAND_CONSTRUCTOR_INVOCATION, beg, cst, dot, name, targs, args);
      } else {
        left = this.mk(N_DOT_SHORTHAND_INVOCATION, beg, dot, name, targs, args);
      }
    } else {
      if (cst >= 0 || targs >= 0) {
        this.fail("const dot shorthand without arguments");
        return -1;
      }
      left = this.mk(N_DOT_SHORTHAND_PROPERTY_ACCESS, beg, dot, name);
    }
    left = this.precedenceLoop(P_SELECTOR, allowCascades, left, false);
    if (this.k(this.p) === T_BANG) {
      const b = this.p;
      this.p = b + 1;
      left = this.mk(N_POSTFIX_EXPRESSION, this.a.beg[left], left, b);
    }
    return left;
  }

  /** The precedence of the token at `i` in an expression. */
  precOf(i: i32): i32 {
    const k = this.k(i);
    if (k === T_BANG) {
      const n = this.k(i + 1);
      if (n === T_DOT || n === T_QUESTION || n === T_LPAREN || n === T_LBRACKET || n === T_QDOT) {
        return P_SELECTOR;
      }
      return P_POSTFIX;
    }
    if (k === T_QUESTION && this.k(i + 1) === T_LBRACKET) {
      if (!this.canParseAsConditional(i)) {
        return P_SELECTOR;
      }
      return P_CONDITIONAL;
    }
    if (k === T_IDENT) {
      const kw = this.t.kw[i];
      if (kw === K_IS || kw === K_AS) {
        return P_RELATIONAL;
      }
      return 0;
    }
    return dtPrecedence(k, K_NONE);
  }

  // Type arguments parsed but not yet applied to a call.
  pendingTargs: i32 = -1;

  /**
   * After an expression: `<T>` that is not followed by `(` makes a function
   * reference; one followed by `(` waits for the call.
   */
  typeArgApplication(left0: i32): i32 {
    this.pendingTargs = -1;
    let left = left0;
    // fasta looks past a `!` for the type arguments: `e!<T>(a)`.
    const bang = this.k(this.p) === T_BANG ? this.p : -1;
    const e = this.methodTypeArgsEnd(bang >= 0 ? bang + 1 : this.p);
    if (e === NO) {
      return left;
    }
    if (bang >= 0) {
      this.p = bang + 1;
      left = this.mk(N_POSTFIX_EXPRESSION, this.a.beg[left], left, bang);
    }
    const ta = this.parseTypeArgumentList();
    if (this.k(this.p) !== T_LPAREN) {
      return this.mk(N_FUNCTION_REFERENCE, this.a.beg[left], left, ta);
    }
    this.pendingTargs = ta;
    return left;
  }

  precedenceLoop(prec: i32, allowCascades: boolean, left0: i32, constPattern: boolean): i32 {
    let left = left0;
    let tokenLevel = this.precOf(this.p);
    if (constPattern && this.constPatternStop()) {
      return left;
    }
    if (tokenLevel < prec) {
      return left;
    }
    let level = tokenLevel;
    let lastBinaryLevel = -1;
    let sections: i32[] = [];
    while (!this.failed) {
      const op = this.p;
      const k = this.k(op);
      if (sections.length > 0 && tokenLevel !== P_CASCADE) {
        left = this.mk(N_CASCADE_EXPRESSION, this.a.beg[left], left, this.a.list(sections));
        sections = [];
      }
      if (tokenLevel === P_CASCADE) {
        if (!allowCascades) {
          return left;
        }
        sections.push(this.parseCascadeSection());
      } else if (tokenLevel === P_ASSIGNMENT) {
        this.p = op + 1;
        const rhs = this.parseExpr(allowCascades);
        left = this.mk(N_ASSIGNMENT_EXPRESSION, this.a.beg[left], left, op, rhs);
      } else if (tokenLevel === P_POSTFIX) {
        this.p = op + 1;
        left = this.mk(N_POSTFIX_EXPRESSION, this.a.beg[left], left, op);
      } else if (tokenLevel === P_SELECTOR) {
        if (k === T_DOT || k === T_QDOT) {
          this.p = op + 1;
          left = this.dotSelector(left, op);
          left = this.typeArgApplication(left);
        } else if (k === T_LPAREN || k === T_LBRACKET || k === T_QUESTION) {
          left = this.argumentOrIndexStar(left, k === T_QUESTION);
        } else if (k === T_BANG) {
          this.p = op + 1;
          left = this.mk(N_POSTFIX_EXPRESSION, this.a.beg[left], left, op);
        } else {
          this.fail("unexpected selector");
          return left;
        }
      } else if (k === T_IDENT && this.t.kw[op] === K_IS) {
        this.p = op + 1;
        const not = this.optional(T_BANG);
        const type = this.parseTypeAfterIsOrAs();
        left = this.mk(N_IS_EXPRESSION, this.a.beg[left], left, op, not, type);
      } else if (k === T_IDENT && this.t.kw[op] === K_AS) {
        this.p = op + 1;
        const type = this.parseTypeAfterIsOrAs();
        left = this.mk(N_AS_EXPRESSION, this.a.beg[left], left, op, type);
      } else if (k === T_QUESTION) {
        this.p = op + 1;
        const then = this.parseExpressionNoCascade();
        const colon = this.expect(T_COLON);
        const els = this.parseExpressionNoCascade();
        left = this.mk(N_CONDITIONAL_EXPRESSION, this.a.beg[left], left, op, then, colon, els);
      } else {
        if (level === P_EQUALITY || level === P_RELATIONAL) {
          if (lastBinaryLevel === level) {
            this.fail("chained equality or relational operator");
            return left;
          }
          lastBinaryLevel = level;
        }
        this.p = op + 1;
        const rhs = this.parsePrecedence(level + 1, allowCascades, false);
        left = this.mk(N_BINARY_EXPRESSION, this.a.beg[left], left, op, rhs);
      }
      tokenLevel = this.precOf(this.p);
      if (constPattern && this.constPatternStop()) {
        break;
      }
      if (tokenLevel <= level) {
        if (tokenLevel < prec) {
          break;
        }
        level = tokenLevel;
      } else {
        break;
      }
    }
    if (sections.length > 0) {
      left = this.mk(N_CASCADE_EXPRESSION, this.a.beg[left], left, this.a.list(sections));
    }
    return left;
  }

  /** In a constant pattern, a postfix `!`, `!?` or `as` ends the expression. */
  constPatternStop(): boolean {
    const k = this.k(this.p);
    if (k === T_BANG) {
      return this.precOf(this.p) === P_POSTFIX || this.k(this.p + 1) === T_QUESTION;
    }
    return k === T_IDENT && this.t.kw[this.p] === K_AS;
  }

  /** A type after `is` or `as`: fasta's computeTypeAfterIsOrAs decides a `?`. */
  parseTypeAfterIsOrAs(): i32 {
    const te = this.computeType(this.p << 2, true);
    let stopQ = -1;
    if (te !== NO && this.tyNullable && (te & 3) === 0) {
      const next = toI32(te >> 2);
      const nk = this.k(next);
      const nkw = this.kw(next);
      const q = next - 1;
      let keep = false;
      if (
        nk === T_RPAREN ||
        nk === T_RBRACE ||
        nk === T_RBRACKET ||
        nk === T_QUESTION ||
        nk === T_QQ ||
        nk === T_COMMA ||
        nk === T_SEMI ||
        nk === T_COLON ||
        nkw === K_IS ||
        nkw === K_AS ||
        nk === T_DOTDOT ||
        nk === T_BARBAR ||
        nk === T_AMPAMP ||
        nk === T_EOF
      ) {
        keep = true;
      } else if (nk === T_LBRACE || nkw === K_WHEN) {
        keep = !this.canParseAsConditional(q);
      }
      if (!keep && this.k(q) === T_QUESTION) {
        stopQ = q;
      }
    }
    const saveQ = this.noQ;
    this.noQ = stopQ;
    const t = te !== NO ? this.parseTypeTo(te) : this.parseType();
    this.noQ = saveQ;
    return t;
  }

  /** After `.` or `?.` at `op`: a property access or method call on `left`. */
  dotSelector(left: i32, op: i32): i32 {
    const name = this.identAny();
    let targs = -1;
    if (this.k(this.p) === T_LT) {
      const e = this.typeArgsTok(this.p, false);
      if (e >= 0 && this.ck(e) === T_LPAREN) {
        targs = this.parseTypeArgumentList();
      }
    }
    const lb = this.a.beg[left];
    if (this.k(this.p) === T_LPAREN) {
      const args = this.parseArgumentList();
      const lk = this.a.kind[left];
      if (lk === N_FUNCTION_REFERENCE && targs < 0 && this.t.kind[op] === T_DOT) {
        const fn = this.a.f(left, 0);
        const fk = this.a.kind[fn];
        if (fk === N_SIMPLE_IDENTIFIER || fk === N_PREFIXED_IDENTIFIER) {
          // `Foo<T>.name(...)`: an implicit `new`.
          let prefix = -1;
          let period = -1;
          let tname = -1;
          if (fk === N_SIMPLE_IDENTIFIER) {
            tname = this.a.f(fn, 0);
          } else {
            prefix = this.a.f(this.a.f(fn, 0), 0);
            period = this.a.f(fn, 1);
            tname = this.a.f(this.a.f(fn, 2), 0);
          }
          const ta = this.a.f(left, 1);
          const nt = this.mkEnd(N_NAMED_TYPE, lb, this.a.end[ta], prefix, period, tname, ta, -1);
          const cn = this.mkEnd(N_CONSTRUCTOR_NAME, lb, this.a.end[name], nt, op, name);
          return this.mk(N_INSTANCE_CREATION_EXPRESSION, lb, -1, cn, args);
        }
      }
      return this.mk(N_METHOD_INVOCATION, lb, left, op, name, targs, args);
    }
    if (targs >= 0) {
      this.fail("type arguments without call");
      return -1;
    }
    if (this.a.kind[left] === N_SIMPLE_IDENTIFIER && this.t.kind[op] === T_DOT) {
      return this.mk(N_PREFIXED_IDENTIFIER, lb, left, op, name);
    }
    return this.mk(N_PROPERTY_ACCESS, lb, left, op, name);
  }

  /** Calls and index operators after `left`. */
  argumentOrIndexStar(left0: i32, checkedNullAware: boolean): i32 {
    let left = left0;
    let checked = checkedNullAware;
    while (!this.failed) {
      const p = this.p;
      const k = this.k(p);
      let nullAware = k === T_QUESTION && this.k(p + 1) === T_LBRACKET;
      if (nullAware && !checked) {
        if (this.canParseAsConditional(p)) {
          nullAware = false;
        }
      }
      checked = false;
      if (k === T_LBRACKET || nullAware) {
        let q = -1;
        if (nullAware) {
          q = p;
          this.p = p + 1;
        }
        const lb = this.expect(T_LBRACKET);
        const old = this.mayFn;
        this.mayFn = true;
        const idx = this.parseExpression();
        this.mayFn = old;
        const rb = this.expect(T_RBRACKET);
        left = this.mk(N_INDEX_EXPRESSION, this.a.beg[left], left, -1, q, lb, idx, rb);
        left = this.typeArgApplication(left);
      } else if (k === T_LPAREN) {
        const ta = this.pendingTargs;
        this.pendingTargs = -1;
        const args = this.parseArgumentList();
        left = this.mk(N_FUNCTION_EXPRESSION_INVOCATION, this.a.beg[left], left, ta, args);
        left = this.typeArgApplication(left);
      } else {
        break;
      }
    }
    return left;
  }

  parseCascadeSection(): i32 {
    const op = this.p;
    this.p = op + 1;
    let sec = -1;
    if (this.k(this.p) === T_LBRACKET) {
      const lb = this.p;
      this.p = lb + 1;
      const old = this.mayFn;
      this.mayFn = true;
      const idx = this.parseExpression();
      this.mayFn = old;
      const rb = this.expect(T_RBRACKET);
      sec = this.mk(N_INDEX_EXPRESSION, op, -1, op, -1, lb, idx, rb);
      sec = this.typeArgApplication(sec);
      sec = this.argumentOrIndexStar(sec, false);
    } else {
      const name = this.identAny();
      let targs = -1;
      if (this.k(this.p) === T_LT) {
        const e = this.typeArgsTok(this.p, false);
        if (e >= 0 && this.ck(e) === T_LPAREN) {
          targs = this.parseTypeArgumentList();
        }
      }
      if (this.k(this.p) === T_LPAREN) {
        const args = this.parseArgumentList();
        sec = this.mk(N_METHOD_INVOCATION, op, -1, op, name, targs, args);
      } else {
        sec = this.mk(N_PROPERTY_ACCESS, op, -1, op, name);
      }
    }
    while (!this.failed) {
      const mark = this.p;
      const k = this.k(this.p);
      if (k === T_DOT || k === T_QDOT) {
        const d = this.p;
        this.p = d + 1;
        sec = this.dotSelector(sec, d);
      } else if (k === T_BANG) {
        const b = this.p;
        this.p = b + 1;
        sec = this.mk(N_POSTFIX_EXPRESSION, op, sec, b);
      }
      sec = this.typeArgApplication(sec);
      sec = this.argumentOrIndexStar(sec, false);
      if (this.p === mark) {
        break;
      }
    }
    if (dtPrecedence(this.k(this.p), K_NONE) === P_ASSIGNMENT) {
      const aop = this.p;
      this.p = aop + 1;
      const rhs = this.parseExpressionNoCascade();
      sec = this.mk(N_ASSIGNMENT_EXPRESSION, op, sec, aop, rhs);
    }
    return sec;
  }

  /** fasta's looksLikeExpressionAfterAwaitOrYield for the keyword at `i`. */
  looksLikeExprAfter(i: i32, unary: boolean): boolean {
    const n = i + 1;
    if (this.isId(n)) {
      const m = n + 1;
      const mk = this.k(m);
      if (mk === T_LPAREN) {
        const e = this.mt[m];
        if (e < 0) {
          return false;
        }
        const ak = this.k(e + 1);
        if (
          ak === T_SEMI ||
          ak === T_DOT ||
          ak === T_COMMA ||
          ak === T_DOTDOT ||
          ak === T_QUESTION ||
          ak === T_QDOT ||
          ak === T_RPAREN
        ) {
          return true;
        }
        return this.isBinaryOperator(e + 1);
      }
      if (mk === T_DOT || mk === T_RPAREN || mk === T_RBRACKET) {
        return true;
      }
      if (mk === T_COMMA && unary) {
        return true;
      }
      if (this.isBinaryOperator(m)) {
        return true;
      }
      return mk === T_SEMI && unary;
    }
    return this.kw(n) === K_NULL;
  }

  isBinaryOperator(i: i32): boolean {
    const k = this.k(i);
    if (k === T_IDENT) {
      return false;
    }
    const pr = dtPrecedence(k, K_NONE);
    return pr >= P_IF_NULL && pr <= P_MULTIPLICATIVE;
  }

  parseUnary(allowCascades: boolean): i32 {
    const p = this.p;
    const k = this.k(p);
    if (k === T_IDENT && this.t.kw[p] === K_AWAIT && (this.asyncState !== 0 || this.looksLikeExprAfter(p, true))) {
      this.p = p + 1;
      const e = this.parsePrecedence(P_POSTFIX, allowCascades, false);
      return this.mk(N_AWAIT_EXPRESSION, p, p, e);
    }
    if (k === T_MINUS || k === T_BANG || k === T_TILDE || k === T_INC || k === T_DEC) {
      this.p = p + 1;
      const e = this.parsePrecedence(P_POSTFIX, allowCascades, false);
      return this.mk(N_PREFIX_EXPRESSION, p, p, e);
    }
    if (k === T_PLUS) {
      this.fail("unary +");
      return -1;
    }
    // An implicit creation: `Foo<T>.name(...)` or `p.Foo<T>.name(...)`.
    if (this.isId(p)) {
      let id = p;
      if (this.k(p + 1) === T_DOT && this.isId(p + 2)) {
        id = p + 2;
      }
      if (this.k(id + 1) === T_LT) {
        const e = this.typeArgsTok(id + 1, false);
        if (e >= 0 && this.ck(e) === T_DOT) {
          const ap = this.cn(e);
          if ((this.cIsId(ap) || this.ckw(ap) === K_NEW) && this.ck(this.cn(ap)) === T_LPAREN) {
            const cn = this.parseConstructorReference();
            const args = this.parseArgumentList();
            return this.mk(N_INSTANCE_CREATION_EXPRESSION, p, -1, cn, args);
          }
        }
      }
    }
    return this.parsePrimary();
  }

  /** `prefix.Type<args>(.name)?` after `new` or `const`. */
  parseConstructorReference(): i32 {
    const beg = this.p;
    let prefix = -1;
    let period = -1;
    if (this.k(beg) !== T_IDENT) {
      this.fail("expected type name");
      return -1;
    }
    if (this.k(beg + 1) === T_DOT && this.k(beg + 2) === T_IDENT) {
      prefix = beg;
      period = beg + 1;
      this.p = beg + 2;
    }
    const name = this.p;
    this.p = name + 1;
    let targs = -1;
    if (this.k(this.p) === T_LT) {
      targs = this.parseTypeArgumentList();
    }
    const nt = this.mk(N_NAMED_TYPE, beg, prefix, period, name, targs, -1);
    let cp = -1;
    let cname = -1;
    if (this.k(this.p) === T_DOT) {
      cp = this.p;
      this.p = cp + 1;
      cname = this.identAny();
    }
    return this.mk(N_CONSTRUCTOR_NAME, beg, nt, cp, cname);
  }

  parsePrimary(): i32 {
    const p = this.p;
    const k = this.k(p);
    switch (k) {
      case T_INT:
        this.p = p + 1;
        return this.mk(N_INTEGER_LITERAL, p, p);
      case T_DOUBLE:
        this.p = p + 1;
        return this.mk(N_DOUBLE_LITERAL, p, p);
      case T_STRING:
        return this.parseStringLiteral();
      case T_HASH:
        return this.parseSymbol();
      case T_LPAREN:
        return this.parseParenOrFunction();
      case T_LBRACKET:
        return this.parseListLiteral(-1, -1);
      case T_LBRACE:
        return this.parseSetOrMapLiteral(-1, -1);
      case T_LT:
        return this.parseTypedLiteralOrFunction(-1);
      case T_IDENT:
        break;
      default:
        this.fail("expected expression");
        return -1;
    }
    const kw = this.t.kw[p];
    switch (kw) {
      case K_TRUE:
      case K_FALSE:
        this.p = p + 1;
        return this.mk(N_BOOLEAN_LITERAL, p, p);
      case K_NULL:
        this.p = p + 1;
        return this.mk(N_NULL_LITERAL, p, p);
      case K_THIS:
        this.p = p + 1;
        return this.mk(N_THIS_EXPRESSION, p, p);
      case K_SUPER:
        this.p = p + 1;
        return this.mk(N_SUPER_EXPRESSION, p, p);
      case K_RETHROW:
        this.p = p + 1;
        return this.mk(N_RETHROW_EXPRESSION, p, p);
      case K_NEW: {
        this.p = p + 1;
        const cn = this.parseConstructorReference();
        const args = this.parseArgumentList();
        return this.mk(N_INSTANCE_CREATION_EXPRESSION, p, p, cn, args);
      }
      case K_CONST:
        return this.parseConst();
      case K_SWITCH:
        return this.parseSwitchExpression();
      default:
        break;
    }
    if (dtIsReserved(kw) && kw !== K_VOID) {
      this.fail("unexpected keyword");
      return -1;
    }
    if (kw === K_VOID) {
      this.fail("void in expression");
      return -1;
    }
    return this.parseSend();
  }

  /** An identifier, its type arguments when a call follows, and the call. */
  parseSend(): i32 {
    const id = this.ident();
    let targs = -1;
    if (this.k(this.p) === T_LT) {
      const e = this.typeArgsTok(this.p, false);
      if (e >= 0 && this.ck(e) === T_LPAREN) {
        targs = this.parseTypeArgumentList();
      }
    }
    if (this.k(this.p) === T_LPAREN) {
      const args = this.parseArgumentList();
      return this.mk(N_METHOD_INVOCATION, this.a.beg[id], -1, -1, id, targs, args);
    }
    return id;
  }

  parseConst(): i32 {
    const c = this.p;
    this.p = c + 1;
    const k = this.k(this.p);
    if (k === T_LBRACKET) {
      return this.parseListLiteral(c, -1);
    }
    if (k === T_LBRACE) {
      return this.parseSetOrMapLiteral(c, -1);
    }
    if (k === T_LT) {
      return this.parseTypedLiteralOrFunction(c);
    }
    if (k === T_LPAREN) {
      return this.parseParenthesizedOrRecord(c);
    }
    const cn = this.parseConstructorReference();
    const args = this.parseArgumentList();
    return this.mk(N_INSTANCE_CREATION_EXPRESSION, c, c, cn, args);
  }

  /** `<T>[...]`, `<K, V>{...}` or a generic function expression. */
  parseTypedLiteralOrFunction(cst: i32): i32 {
    const lt = this.p;
    const e = this.typeArgsTok(lt, true);
    if (e >= 0 && (e & 3) === 0 && this.k(toI32(e >> 2)) === T_LPAREN && cst < 0) {
      // A generic function expression.
      const tps = this.parseTypeParameterList();
      const params = this.parseFormalParameterList(FP_NORMAL);
      const body = this.parseFunctionBody(true, false);
      return this.mk(N_FUNCTION_EXPRESSION, lt, tps, params, body);
    }
    const targs = this.parseTypeArgumentList();
    const k = this.k(this.p);
    if (k === T_LBRACKET) {
      return this.parseListLiteral(cst, targs);
    }
    if (k === T_LBRACE) {
      return this.parseSetOrMapLiteral(cst, targs);
    }
    this.fail("expected collection literal");
    return -1;
  }

  parseArgumentList(): i32 {
    const lp = this.expect(T_LPAREN);
    const old = this.mayFn;
    this.mayFn = true;
    const xs: i32[] = [];
    while (!this.failed && this.k(this.p) !== T_RPAREN) {
      if (this.k(this.p) === T_IDENT && this.k(this.p + 1) === T_COLON) {
        const name = this.p;
        this.p = name + 2;
        const e = this.parseExpression();
        xs.push(this.mk(N_NAMED_ARGUMENT, name, name, name + 1, e));
      } else {
        xs.push(this.parseExpression());
      }
      if (this.optional(T_COMMA) < 0) {
        break;
      }
    }
    this.mayFn = old;
    const rp = this.expect(T_RPAREN);
    const l = this.a.list(xs);
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i];
      // An argument that failed to parse is -1.
      if (x >= 0 && this.a.kind[x] === N_ADJACENT_STRINGS) {
        let other = false;
        for (let j = 0; j < xs.length; j++) {
          if (j !== i && this.isStringLiteral(xs[j])) {
            other = true;
          }
        }
        this.a.set(x, 1, other ? 1 : 0);
      }
    }
    return this.mk(N_ARGUMENT_LIST, lp, lp, l, rp);
  }

  isStringLiteral(n: i32): boolean {
    if (n < 0) {
      return false;
    }
    const k = this.a.kind[n];
    return k === N_SIMPLE_STRING_LITERAL || k === N_STRING_INTERPOLATION || k === N_ADJACENT_STRINGS;
  }

  /** Sets AdjacentStrings.indentStrings for an assert's condition and message. */
  markAdjacentStrings(c: i32, m: i32): void {
    if (c >= 0 && this.a.kind[c] === N_ADJACENT_STRINGS) {
      this.a.set(c, 1, this.isStringLiteral(m) ? 1 : 0);
    }
    if (m >= 0 && this.a.kind[m] === N_ADJACENT_STRINGS) {
      this.a.set(m, 1, this.isStringLiteral(c) ? 1 : 0);
    }
  }

  /** `(`: a function expression, a parenthesized expression or a record. */
  parseParenOrFunction(): i32 {
    const lp = this.p;
    if (this.mayFn) {
      const m = this.mt[lp];
      const n = m + 1;
      const nk = this.k(n);
      const nkw = this.kw(n);
      if (nk === T_ARROW || nk === T_LBRACE || nkw === K_ASYNC || nkw === K_SYNC) {
        const params = this.parseFormalParameterList(FP_NORMAL);
        const body = this.parseFunctionBody(true, false);
        return this.mk(N_FUNCTION_EXPRESSION, lp, -1, params, body);
      }
    }
    const old = this.mayFn;
    this.mayFn = true;
    const r = this.parseParenthesizedOrRecord(-1);
    this.mayFn = old;
    return r;
  }

  parseParenthesizedOrRecord(cst: i32): i32 {
    const lp = this.expect(T_LPAREN);
    const old = this.mayFn;
    this.mayFn = true;
    const xs: i32[] = [];
    let isRecord = cst >= 0;
    let named = false;
    while (!this.failed) {
      const k = this.k(this.p);
      if (k === T_RPAREN) {
        if (xs.length === 0) {
          isRecord = true;
        }
        break;
      }
      if (xs.length === 0 && k === T_COMMA && this.k(this.p + 1) === T_RPAREN) {
        this.fail("record with no fields and a comma");
        return -1;
      }
      if (k === T_IDENT && this.k(this.p + 1) === T_COLON) {
        isRecord = true;
        named = true;
        const name = this.p;
        this.p = name + 2;
        const e = this.parseExpression();
        xs.push(this.mk(N_RECORD_LITERAL_NAMED_FIELD, name, name, name + 1, e));
      } else {
        xs.push(this.parseExpression());
      }
      if (this.k(this.p) !== T_COMMA) {
        break;
      }
      isRecord = true;
      named = true;
      this.p = this.p + 1;
    }
    this.mayFn = old;
    const rp = this.expect(T_RPAREN);
    if (isRecord) {
      if (xs.length === 1 && !named) {
        this.fail("record with one positional field and no comma");
        return -1;
      }
      return this.mk(N_RECORD_LITERAL, cst >= 0 ? cst : lp, cst, lp, this.a.list(xs), rp);
    }
    return this.mk(N_PARENTHESIZED_EXPRESSION, lp, lp, xs[0], rp);
  }

  parseListLiteral(cst: i32, targs: i32): i32 {
    const beg = cst >= 0 ? cst : targs >= 0 ? this.a.beg[targs] : this.p;
    const lb = this.expect(T_LBRACKET);
    const old = this.mayFn;
    this.mayFn = true;
    const xs: i32[] = [];
    while (!this.failed && this.k(this.p) !== T_RBRACKET) {
      xs.push(this.parseElement(false));
      if (this.optional(T_COMMA) < 0) {
        break;
      }
    }
    this.mayFn = old;
    const rb = this.expect(T_RBRACKET);
    return this.mk(N_LIST_LITERAL, beg, cst, targs, lb, this.a.list(xs), rb);
  }

  parseSetOrMapLiteral(cst: i32, targs: i32): i32 {
    const beg = cst >= 0 ? cst : targs >= 0 ? this.a.beg[targs] : this.p;
    const lb = this.expect(T_LBRACE);
    const old = this.mayFn;
    this.mayFn = true;
    const xs: i32[] = [];
    while (!this.failed && this.k(this.p) !== T_RBRACE) {
      xs.push(this.parseElement(true));
      if (this.optional(T_COMMA) < 0) {
        break;
      }
    }
    this.mayFn = old;
    const rb = this.expect(T_RBRACE);
    return this.mk(N_SET_OR_MAP_LITERAL, beg, cst, targs, lb, this.a.list(xs), rb);
  }

  /** A collection element; in a `{}` literal, possibly a map entry. */
  parseElement(inBraces: boolean): i32 {
    const p = this.p;
    const k = this.k(p);
    const kw = this.kw(p);
    if (kw === K_IF) {
      this.p = p + 1;
      const lp = this.expect(T_LPAREN);
      const e = this.parseExpression();
      const cc = this.parseCaseClauseOpt();
      const rp = this.expect(T_RPAREN);
      const then = this.parseElement(inBraces);
      let elseTok = -1;
      let els = -1;
      if (this.kw(this.p) === K_ELSE) {
        elseTok = this.p;
        this.p = elseTok + 1;
        els = this.parseElement(inBraces);
      }
      return this.mk(N_IF_ELEMENT, p, p, lp, e, cc, rp, then, elseTok, els);
    }
    if (kw === K_FOR || (kw === K_AWAIT && this.kw(p + 1) === K_FOR)) {
      let aw = -1;
      if (kw === K_AWAIT) {
        aw = p;
        this.p = p + 1;
      }
      const forTok = this.expectKw(K_FOR);
      const lp = this.expect(T_LPAREN);
      const parts = this.parseForLoopParts(true);
      const rp = this.expect(T_RPAREN);
      const body = this.parseElement(inBraces);
      return this.mk(N_FOR_ELEMENT, p, aw, forTok, lp, parts, rp, body);
    }
    if (k === T_ELLIPSIS || k === T_ELLIPSIS_Q) {
      this.p = p + 1;
      const e = this.parseExpression();
      return this.mk(N_SPREAD_ELEMENT, p, p, e);
    }
    if (k === T_QUESTION) {
      this.p = p + 1;
      const e = this.parseExpression();
      if (inBraces && this.k(this.p) === T_COLON) {
        return this.mapEntryRest(p, p, e);
      }
      return this.mk(N_NULL_AWARE_ELEMENT, p, p, e);
    }
    const e = this.parseExpression();
    if (inBraces && this.k(this.p) === T_COLON) {
      return this.mapEntryRest(p, -1, e);
    }
    return e;
  }

  mapEntryRest(beg: i32, keyQ: i32, key: i32): i32 {
    const colon = this.expect(T_COLON);
    let vq = -1;
    if (this.k(this.p) === T_QUESTION) {
      vq = this.p;
      this.p = vq + 1;
    }
    const v = this.parseExpression();
    return this.mk(N_MAP_LITERAL_ENTRY, beg, keyQ, key, colon, vq, v);
  }

  /** One or more adjacent string literals. */
  parseStringLiteral(): i32 {
    const beg = this.p;
    const strs: i32[] = [];
    while (this.k(this.p) === T_STRING && !this.failed) {
      strs.push(this.parseSingleString());
    }
    if (strs.length === 0) {
      this.fail("expected string");
      return -1;
    }
    if (strs.length === 1) {
      return strs[0];
    }
    return this.mk(N_ADJACENT_STRINGS, beg, this.a.list(strs), 1);
  }

  parseSingleString(): i32 {
    const first = this.p;
    const fk = this.k(first + 1);
    if (fk !== T_INTERP_EXPR && fk !== T_INTERP_IDENT) {
      this.p = first + 1;
      return this.mk(N_SIMPLE_STRING_LITERAL, first, first);
    }
    const els: i32[] = [];
    this.p = first + 1;
    els.push(this.mkEnd(N_INTERPOLATION_STRING, first, first, first));
    while (!this.failed) {
      const ik = this.k(this.p);
      if (ik === T_INTERP_EXPR) {
        const lb = this.p;
        this.p = lb + 1;
        const old = this.mayFn;
        this.mayFn = true;
        const e = this.parseExpression();
        this.mayFn = old;
        const rb = this.expect(T_RBRACE);
        els.push(this.mk(N_INTERPOLATION_EXPRESSION, lb, lb, e, rb));
      } else if (ik === T_INTERP_IDENT) {
        const d = this.p;
        const id = d + 1;
        this.p = id + 1;
        let e = -1;
        if (this.kw(id) === K_THIS) {
          e = this.mkEnd(N_THIS_EXPRESSION, id, id, id);
        } else {
          e = this.mkEnd(N_SIMPLE_IDENTIFIER, id, id, id);
        }
        els.push(this.mk(N_INTERPOLATION_EXPRESSION, d, d, e, -1));
      } else {
        break;
      }
      const s = this.expect(T_STRING);
      els.push(this.mkEnd(N_INTERPOLATION_STRING, s, s, s));
    }
    return this.mk(N_STRING_INTERPOLATION, first, this.a.list(els));
  }

  parseSymbol(): i32 {
    const hash = this.expect(T_HASH);
    const comps: i32[] = [];
    const k = this.k(this.p);
    if (k === T_IDENT) {
      comps.push(this.p);
      this.p = this.p + 1;
      while (this.k(this.p) === T_DOT && this.k(this.p + 1) === T_IDENT) {
        this.p = this.p + 1;
        comps.push(this.p);
        this.p = this.p + 1;
      }
    } else if (k !== T_EOF && k !== T_LPAREN && k !== T_RPAREN && k !== T_SEMI && k !== T_COMMA) {
      // An operator.
      comps.push(this.p);
      this.p = this.p + 1;
    } else {
      this.fail("bad symbol");
      return -1;
    }
    return this.mk(N_SYMBOL_LITERAL, hash, hash, this.a.list(comps));
  }

  parseSwitchExpression(): i32 {
    const sw = this.expectKw(K_SWITCH);
    const lp = this.expect(T_LPAREN);
    const old = this.mayFn;
    this.mayFn = true;
    const e = this.parseExpression();
    const rp = this.expect(T_RPAREN);
    const lb = this.expect(T_LBRACE);
    const cases: i32[] = [];
    while (!this.failed && this.k(this.p) !== T_RBRACE) {
      this.mayFn = false;
      const cb = this.p;
      const gp = this.parseGuardedPattern();
      const arrow = this.expect(T_ARROW);
      this.mayFn = true;
      const body = this.parseExpression();
      cases.push(this.mk(N_SWITCH_EXPRESSION_CASE, cb, gp, arrow, body));
      if (this.optional(T_COMMA) < 0) {
        break;
      }
    }
    this.mayFn = old;
    const rb = this.expect(T_RBRACE);
    return this.mk(N_SWITCH_EXPRESSION, sw, sw, lp, e, rp, lb, this.a.list(cases), rb);
  }

  // ---------------------------------------------------------------------
  // Patterns.

  parsePattern(ctx: i32, prec: i32): i32 {
    const beg = this.p;
    let left = this.parsePrimaryPattern(ctx);
    while (!this.failed) {
      const p = this.p;
      const k = this.k(p);
      let level = 0;
      if (k === T_BANG || k === T_QUESTION) {
        level = P_SELECTOR;
      } else if (k === T_IDENT && this.t.kw[p] === K_AS) {
        level = P_RELATIONAL;
      } else if (k === T_AMPAMP) {
        level = P_LOGICAL_AND;
      } else if (k === T_BARBAR) {
        level = P_LOGICAL_OR;
      } else {
        level = this.precOf(p);
      }
      if (level < prec) {
        return left;
      }
      if (k === T_IDENT && this.t.kw[p] === K_AS) {
        this.p = p + 1;
        const type = this.parseTypeAfterIsOrAs();
        left = this.mk(N_CAST_PATTERN, beg, left, p, type);
      } else if (k === T_BANG) {
        this.p = p + 1;
        left = this.mk(N_NULL_ASSERT_PATTERN, beg, left, p);
      } else if (k === T_QUESTION) {
        this.p = p + 1;
        left = this.mk(N_NULL_CHECK_PATTERN, beg, left, p);
      } else if (k === T_AMPAMP || k === T_BARBAR) {
        this.p = p + 1;
        const rhs = this.parsePattern(ctx, level + 1);
        left = this.mk(k === T_AMPAMP ? N_LOGICAL_AND_PATTERN : N_LOGICAL_OR_PATTERN, beg, left, p, rhs);
      } else {
        return left;
      }
    }
    return left;
  }

  parsePrimaryPattern(ctx: i32): i32 {
    const beg = this.p;
    // List and map patterns, with optional type arguments.
    let afterArgs = beg;
    if (this.k(beg) === T_LT) {
      const e = this.typeArgsTok(beg, true);
      if (e >= 0 && (e & 3) === 0) {
        afterArgs = toI32(e >> 2);
      }
    }
    const ak = this.k(afterArgs);
    if (ak === T_LBRACKET || ak === T_LBRACE) {
      let targs = -1;
      if (afterArgs !== beg) {
        targs = this.parseTypeArgumentList();
      }
      if (ak === T_LBRACKET) {
        return this.parseListPattern(ctx, beg, targs);
      }
      return this.parseMapPattern(ctx, beg, targs);
    }
    const kw = this.kw(beg);
    const k = this.k(beg);
    if (kw === K_VAR || kw === K_FINAL) {
      return this.parseVariablePattern(ctx, true);
    }
    if (k === T_LPAREN) {
      const m = this.mt[beg];
      const ai = m + 1;
      if (this.isId(ai) || (this.k(ai) === T_QUESTION && this.isId(ai + 1))) {
        const te = this.computeVariablePatternType(beg << 2, true);
        if (te !== NO && this.tyRecord && !this.tyRecovered) {
          return this.parseVariablePattern(ctx, false);
        }
      }
      if (this.k(beg + 1) === T_RPAREN) {
        this.p = beg + 2;
        return this.mk(N_RECORD_PATTERN, beg, beg, 0, beg + 1);
      }
      return this.parseParenOrRecordPattern(ctx);
    }
    if (kw === K_CONST) {
      this.p = beg + 1;
      const e = this.parsePrecedence(P_EQUALITY, false, true);
      return this.mk(N_CONSTANT_PATTERN, beg, beg, e);
    }
    if (k === T_EQEQ || k === T_NE || k === T_LT || k === T_GT || k === T_LE || k === T_GE) {
      this.p = beg + 1;
      const e = this.parsePrecedence(P_BITWISE_OR, false, false);
      return this.mk(N_RELATIONAL_PATTERN, beg, beg, e);
    }
    const te = this.computeVariablePatternType(beg << 2, false);
    if (te !== NO) {
      return this.parseVariablePattern(ctx, false);
    }
    // An object pattern.
    if (this.isId(beg)) {
      let j = beg;
      let dot = false;
      if (this.k(j + 1) === T_DOT && this.isId(j + 2)) {
        j = j + 2;
        dot = true;
      }
      let a = j + 1;
      let ok = true;
      if (this.k(a) === T_LT) {
        const e = this.typeArgsTok(a, false);
        if (e >= 0 && (e & 3) === 0) {
          a = toI32(e >> 2);
        } else {
          ok = false;
        }
      }
      if (ok && this.k(a) === T_LPAREN) {
        const type = this.parseNamedType();
        return this.parseObjectPatternRest(ctx, beg, type);
      }
      if (!dot) {
        // A bare identifier: a variable in an irrefutable context or `_`.
        if (ctx !== PC_MATCHING || this.is(beg, "_")) {
          return this.parseVariablePattern(ctx, false);
        }
      }
    }
    const e = this.parsePrecedence(P_EQUALITY, false, true);
    return this.mk(N_CONSTANT_PATTERN, beg, -1, e);
  }

  /** fasta's computeVariablePatternType. */
  computeVariablePatternType(c: i32, required: boolean): i32 {
    const te = this.computeType(c, required);
    if (te !== NO && te !== c) {
      const kw = this.ckw(te);
      if (this.cIsId(te) && (kw === K_AS || kw === K_WHEN)) {
        return NO;
      }
    }
    return te;
  }

  /** `var x`, `final T x`, `T x` or a bare `x`. */
  parseVariablePattern(ctx: i32, hasKeyword: boolean): i32 {
    const beg = this.p;
    let keyword = -1;
    let type = -1;
    if (hasKeyword) {
      keyword = beg;
      this.p = beg + 1;
      const nextIsParen = this.k(this.p) === T_LPAREN;
      const te = this.computeVariablePatternType(this.p << 2, nextIsParen);
      if (te !== NO) {
        type = this.parseType();
      }
    } else {
      // A type unless this is just a name.
      const te = this.computeVariablePatternType(beg << 2, false);
      if (te !== NO) {
        type = this.parseType();
      } else if (this.k(beg) === T_LPAREN) {
        type = this.parseType();
      }
    }
    const name = this.expectId();
    const bare = keyword < 0 && type < 0;
    if (this.is(name, "_")) {
      return this.mk(N_WILDCARD_PATTERN, beg, keyword, type, name);
    }
    if (ctx === PC_ASSIGNMENT && bare) {
      return this.mk(N_ASSIGNED_VARIABLE_PATTERN, beg, name);
    }
    return this.mk(N_DECLARED_VARIABLE_PATTERN, beg, keyword, type, name);
  }

  parseListPattern(ctx: i32, beg: i32, targs: i32): i32 {
    const lb = this.expect(T_LBRACKET);
    const old = this.mayFn;
    this.mayFn = true;
    const xs: i32[] = [];
    while (!this.failed && this.k(this.p) !== T_RBRACKET) {
      if (this.k(this.p) === T_ELLIPSIS) {
        const d = this.p;
        this.p = d + 1;
        let pat = -1;
        const nk = this.k(this.p);
        if (nk !== T_COMMA && nk !== T_RBRACKET) {
          pat = this.parsePattern(ctx, 1);
        }
        xs.push(this.mk(N_REST_PATTERN_ELEMENT, d, d, pat));
      } else {
        xs.push(this.parsePattern(ctx, 1));
      }
      if (this.optional(T_COMMA) < 0) {
        break;
      }
    }
    this.mayFn = old;
    const rb = this.expect(T_RBRACKET);
    return this.mk(N_LIST_PATTERN, beg, targs, lb, this.a.list(xs), rb);
  }

  parseMapPattern(ctx: i32, beg: i32, targs: i32): i32 {
    const lb = this.expect(T_LBRACE);
    const old = this.mayFn;
    this.mayFn = true;
    const xs: i32[] = [];
    while (!this.failed && this.k(this.p) !== T_RBRACE) {
      if (this.k(this.p) === T_ELLIPSIS) {
        const d = this.p;
        this.p = d + 1;
        xs.push(this.mk(N_REST_PATTERN_ELEMENT, d, d, -1));
      } else {
        const eb = this.p;
        const key = this.parseExpression();
        const colon = this.expect(T_COLON);
        const v = this.parsePattern(ctx, 1);
        xs.push(this.mk(N_MAP_PATTERN_ENTRY, eb, key, colon, v));
      }
      if (this.optional(T_COMMA) < 0) {
        break;
      }
    }
    this.mayFn = old;
    const rb = this.expect(T_RBRACE);
    return this.mk(N_MAP_PATTERN, beg, targs, lb, this.a.list(xs), rb);
  }

  /** Pattern fields up to `)`; answers the list. */
  parsePatternFields(ctx: i32): i32 {
    const xs: i32[] = [];
    while (!this.failed && this.k(this.p) !== T_RPAREN) {
      const fb = this.p;
      let name = -1;
      if (this.k(this.p) === T_COLON) {
        const c = this.p;
        this.p = c + 1;
        name = this.mkEnd(N_PATTERN_FIELD_NAME, c, c, -1, c);
      } else if (this.k(this.p) === T_IDENT && this.k(this.p + 1) === T_COLON) {
        const n = this.p;
        this.p = n + 2;
        name = this.mkEnd(N_PATTERN_FIELD_NAME, n, n + 1, n, n + 1);
      }
      const pat = this.parsePattern(ctx, 1);
      xs.push(this.mk(N_PATTERN_FIELD, fb, name, pat));
      if (this.optional(T_COMMA) < 0) {
        break;
      }
    }
    return this.a.list(xs);
  }

  parseParenOrRecordPattern(ctx: i32): i32 {
    const lp = this.expect(T_LPAREN);
    const old = this.mayFn;
    this.mayFn = true;
    const fb = this.p;
    // `(pattern)` is parenthesized unless it has a name or a comma.
    if (this.k(fb) !== T_COLON && !(this.k(fb) === T_IDENT && this.k(fb + 1) === T_COLON)) {
      const pat = this.parsePattern(ctx, 1);
      if (this.k(this.p) === T_RPAREN) {
        this.mayFn = old;
        const rp = this.expect(T_RPAREN);
        return this.mk(N_PARENTHESIZED_PATTERN, lp, lp, pat, rp);
      }
      const xs: i32[] = [];
      xs.push(this.mk(N_PATTERN_FIELD, fb, -1, pat));
      this.expect(T_COMMA);
      const rest = this.parsePatternFields(ctx);
      for (let i = 0; i < this.a.len(rest); i++) {
        xs.push(this.a.at(rest, i));
      }
      this.mayFn = old;
      const rp = this.expect(T_RPAREN);
      return this.mk(N_RECORD_PATTERN, lp, lp, this.a.list(xs), rp);
    }
    const fields = this.parsePatternFields(ctx);
    this.mayFn = old;
    const rp = this.expect(T_RPAREN);
    return this.mk(N_RECORD_PATTERN, lp, lp, fields, rp);
  }

  parseObjectPatternRest(ctx: i32, beg: i32, type: i32): i32 {
    const lp = this.expect(T_LPAREN);
    const old = this.mayFn;
    this.mayFn = true;
    const fields = this.parsePatternFields(ctx);
    this.mayFn = old;
    const rp = this.expect(T_RPAREN);
    return this.mk(N_OBJECT_PATTERN, beg, type, lp, fields, rp);
  }
  // @@MORE@@
}
