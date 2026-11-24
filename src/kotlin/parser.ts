// The Kotlin parser: KotlinParsing, KotlinExpressionParsing and
// AbstractKotlinParsing from the Kotlin compiler, merged into one class over
// the PsiBuilder emulation. Method names and the order of every marker
// operation follow the originals, since the PSI shape (and so ktfmt's
// output) depends on them. Lazy blocks and lambdas are parsed eagerly,
// which builds the same tree their reparse would.
//
// Ported from the Kotlin compiler 2.4.10 (Apache License 2.0, Copyright
// JetBrains s.r.o. and Kotlin Programming Language contributors).

import { add32, sub32 } from "../core/arr";
import { fault } from "../core/fault";
import {
  B_PRECEDING_ALL,
  B_PRECEDING_ALL_COMMENTS,
  B_PRECEDING_COMMENTS,
  B_PRECEDING_DOC_COMMENTS,
  B_SHEBANG,
  B_TRAILING_ALL,
  B_TRAILING_ALL_COMMENTS,
  B_TRAILING_COMMENTS,
  B_DEFAULT,
  B_DO_NOT_BIND,
  KBuilder,
  isWsOrComment,
} from "./builder";
import {
  N_ANNOTATED_EXPRESSION,
  N_ANNOTATION,
  N_ANNOTATION_ENTRY,
  N_ANNOTATION_TARGET,
  N_ARRAY_ACCESS_EXPRESSION,
  N_BACKING_FIELD,
  N_BINARY_EXPRESSION,
  N_BINARY_WITH_TYPE,
  N_BLOCK,
  N_BODY,
  N_BOOLEAN_CONSTANT,
  N_BREAK,
  N_CALLABLE_REFERENCE_EXPRESSION,
  N_CALL_EXPRESSION,
  N_CATCH,
  N_CHARACTER_CONSTANT,
  N_CLASS,
  N_CLASS_BODY,
  N_CLASS_INITIALIZER,
  N_COMPANION_BLOCK,
  N_CLASS_LITERAL_EXPRESSION,
  N_COLLECTION_LITERAL_EXPRESSION,
  N_CONDITION,
  N_CONSTRUCTOR_CALLEE,
  N_CONSTRUCTOR_DELEGATION_CALL,
  N_CONSTRUCTOR_DELEGATION_REFERENCE,
  N_CONTEXT_PARAMETER_LIST,
  N_CONTEXT_RECEIVER,
  N_CONTINUE,
  N_CONTRACT_EFFECT,
  N_CONTRACT_EFFECT_LIST,
  N_DELEGATED_SUPER_TYPE_ENTRY,
  N_DESTRUCTURING_DECLARATION,
  N_DESTRUCTURING_DECLARATION_ENTRY,
  N_DOT_QUALIFIED_EXPRESSION,
  N_DO_WHILE,
  N_DYNAMIC_TYPE,
  N_ELSE,
  N_ENUM_ENTRY,
  N_ENUM_ENTRY_SUPERCLASS_REFERENCE_EXPRESSION,
  N_ESCAPE_STRING_TEMPLATE_ENTRY,
  N_FILE_ANNOTATION_LIST,
  N_FINALLY,
  N_FLOAT_CONSTANT,
  N_FOR,
  N_FUN,
  N_FUNCTION_LITERAL,
  N_FUNCTION_TYPE,
  N_FUNCTION_TYPE_RECEIVER,
  N_IF,
  N_IMPORT_ALIAS,
  N_IMPORT_DIRECTIVE,
  N_IMPORT_LIST,
  N_INDICES,
  N_INITIALIZER_LIST,
  N_INTEGER_CONSTANT,
  N_INTERSECTION_TYPE,
  N_IS_EXPRESSION,
  N_KT_FILE,
  N_LABEL,
  N_LABELED_EXPRESSION,
  N_LABEL_QUALIFIER,
  N_LAMBDA_ARGUMENT,
  N_LAMBDA_EXPRESSION,
  N_LITERAL_STRING_TEMPLATE_ENTRY,
  N_LONG_STRING_TEMPLATE_ENTRY,
  N_LOOP_RANGE,
  N_MODIFIER_LIST,
  N_NULL,
  N_NULLABLE_TYPE,
  N_OBJECT_DECLARATION,
  N_OBJECT_LITERAL,
  N_OPERATION_REFERENCE,
  N_PACKAGE_DIRECTIVE,
  N_PARENTHESIZED,
  N_POSTFIX_EXPRESSION,
  N_PREFIX_EXPRESSION,
  N_PRIMARY_CONSTRUCTOR,
  N_PROPERTY,
  N_PROPERTY_ACCESSOR,
  N_PROPERTY_DELEGATE,
  N_REFERENCE_EXPRESSION,
  N_RETURN,
  N_SAFE_ACCESS_EXPRESSION,
  N_SCRIPT,
  N_SCRIPT_INITIALIZER,
  N_SECONDARY_CONSTRUCTOR,
  N_SHORT_STRING_TEMPLATE_ENTRY,
  N_STRING_INTERPOLATION_PREFIX,
  N_STRING_TEMPLATE,
  N_SUPER_EXPRESSION,
  N_SUPER_TYPE_CALL_ENTRY,
  N_SUPER_TYPE_ENTRY,
  N_SUPER_TYPE_LIST,
  N_THEN,
  N_THIS_EXPRESSION,
  N_THROW,
  N_TRY,
  N_TYPEALIAS,
  N_TYPE_ARGUMENT_LIST,
  N_TYPE_CONSTRAINT,
  N_TYPE_CONSTRAINT_LIST,
  N_TYPE_PARAMETER,
  N_TYPE_PARAMETER_LIST,
  N_TYPE_PROJECTION,
  N_TYPE_REFERENCE,
  N_USER_TYPE,
  N_VALUE_ARGUMENT,
  N_VALUE_ARGUMENT_LIST,
  N_VALUE_ARGUMENT_NAME,
  N_VALUE_PARAMETER,
  N_VALUE_PARAMETER_LIST,
  N_WHEN,
  N_WHEN_CONDITION_EXPRESSION,
  N_WHEN_CONDITION_IN_RANGE,
  N_WHEN_CONDITION_IS_PATTERN,
  N_WHEN_ENTRY,
  N_WHEN_ENTRY_GUARD,
  N_WHILE,
  T_ABSTRACT_KEYWORD,
  T_ACTUAL_KEYWORD,
  T_ALL_KEYWORD,
  T_AND,
  T_ANDAND,
  T_ANNOTATION_KEYWORD,
  T_ARROW,
  T_AS_KEYWORD,
  T_AS_SAFE,
  T_AT,
  T_BREAK_KEYWORD,
  T_BY_KEYWORD,
  T_CATCH_KEYWORD,
  T_CHARACTER_LITERAL,
  T_CLASS_KEYWORD,
  T_CLOSING_QUOTE,
  T_COLON,
  T_COLONCOLON,
  T_COMMA,
  T_BLOCK_COMMENT,
  T_COMPANION_KEYWORD,
  T_DOC_COMMENT,
  T_CONSTRUCTOR_KEYWORD,
  T_CONST_KEYWORD,
  T_CONTEXT_KEYWORD,
  T_CONTINUE_KEYWORD,
  T_CONTRACT_KEYWORD,
  T_CROSSINLINE_KEYWORD,
  T_DANGLING_NEWLINE,
  T_DATA_KEYWORD,
  T_DELEGATE_KEYWORD,
  T_DIV,
  T_DIVEQ,
  T_DOT,
  T_DO_KEYWORD,
  T_DYNAMIC_KEYWORD,
  T_ELSE_KEYWORD,
  T_ELVIS,
  T_ENUM_KEYWORD,
  T_EOL_OR_SEMICOLON,
  T_EQ,
  T_EQEQ,
  T_EQEQEQ,
  T_ESCAPE_SEQUENCE,
  T_EXCL,
  T_EXCLEQ,
  T_EXCLEQEQEQ,
  T_EXCLEXCL,
  T_EXPECT_KEYWORD,
  T_EXTERNAL_KEYWORD,
  T_FALSE_KEYWORD,
  T_FIELD_KEYWORD,
  T_FILE_KEYWORD,
  T_FINALLY_KEYWORD,
  T_FINAL_KEYWORD,
  T_FLOAT_LITERAL,
  T_FOR_KEYWORD,
  T_FUN_KEYWORD,
  T_GET_KEYWORD,
  T_GT,
  T_GTEQ,
  T_HASH,
  T_IDENTIFIER,
  T_IF_KEYWORD,
  T_IMPORT_KEYWORD,
  T_INFIX_KEYWORD,
  T_INIT_KEYWORD,
  T_INLINE_KEYWORD,
  T_INNER_KEYWORD,
  T_INTEGER_LITERAL,
  T_INTERFACE_KEYWORD,
  T_INTERNAL_KEYWORD,
  T_INTERPOLATION_PREFIX,
  T_IN_KEYWORD,
  T_IS_KEYWORD,
  T_LATEINIT_KEYWORD,
  T_LBRACE,
  T_LBRACKET,
  T_LONG_TEMPLATE_ENTRY_END,
  T_LONG_TEMPLATE_ENTRY_START,
  T_LPAR,
  T_LT,
  T_LTEQ,
  T_MINUS,
  T_MINUSEQ,
  T_MINUSMINUS,
  T_MUL,
  T_MULTEQ,
  T_NOINLINE_KEYWORD,
  T_NOT_IN,
  T_NOT_IS,
  T_NULL_KEYWORD,
  T_OBJECT_KEYWORD,
  T_OPEN_KEYWORD,
  T_OPEN_QUOTE,
  T_OPERATOR_KEYWORD,
  T_OROR,
  T_OUT_KEYWORD,
  T_OVERRIDE_KEYWORD,
  T_PACKAGE_KEYWORD,
  T_PARAM_KEYWORD,
  T_PERC,
  T_PERCEQ,
  T_PLUS,
  T_PLUSEQ,
  T_PLUSPLUS,
  T_PRIVATE_KEYWORD,
  T_PROPERTY_KEYWORD,
  T_PROTECTED_KEYWORD,
  T_PUBLIC_KEYWORD,
  T_QUEST,
  T_RANGE,
  T_RANGE_UNTIL,
  T_RBRACE,
  T_RBRACKET,
  T_RECEIVER_KEYWORD,
  T_REGULAR_STRING_PART,
  T_REIFIED_KEYWORD,
  T_RETURN_KEYWORD,
  T_RPAR,
  T_SAFE_ACCESS,
  T_SEALED_KEYWORD,
  T_SEMICOLON,
  T_SETPARAM_KEYWORD,
  T_SET_KEYWORD,
  T_SHORT_TEMPLATE_ENTRY_START,
  T_SUPER_KEYWORD,
  T_SUSPEND_KEYWORD,
  T_TAILREC_KEYWORD,
  T_THIS_KEYWORD,
  T_THROW_KEYWORD,
  T_TRUE_KEYWORD,
  T_TRY_KEYWORD,
  T_TYPE_ALIAS_KEYWORD,
  T_VALUE_KEYWORD,
  T_VAL_KEYWORD,
  T_VARARG_KEYWORD,
  T_VAR_KEYWORD,
  T_WHEN_KEYWORD,
  T_WHERE_KEYWORD,
  T_WHILE_KEYWORD,
  T_WHITE_SPACE,
  ktIsSoft,
  ktKeywordText,
  ktSoftKeyword,
} from "./types";

/** A token set: a bitset over type ids, every one below 12 * 32. */
const tsNew = (xs: i32[]): i32[] => {
  const s = new Array<i32>(12);
  for (let i = 0; i < toI32(xs.length); i++) {
    const x = xs[i];
    const w = x >> 5;
    if (w < 0 || w >= s.length) {
      fault();
      return s;
    }
    s[w] = s[w] | (1 << (x & 31));
  }
  return s;
};

const tsHas = (s: i32[], t: i32): boolean => {
  if (t < 0) {
    return false;
  }
  const w = t >> 5;
  if (w < s.length) {
    return (s[w] & (1 << (t & 31))) !== 0;
  }
  fault();
  return false;
};

const tsOr = (a: i32[], b: i32[]): i32[] => {
  const s = new Array<i32>(12);
  for (let i = 0; i < 12; i++) {
    if (i >= a.length || i >= b.length) {
      fault();
      return s;
    }
    s[i] = a[i] | b[i];
  }
  return s;
};

const tsAnd = (a: i32[], b: i32[]): i32[] => {
  const s = new Array<i32>(12);
  for (let i = 0; i < 12; i++) {
    if (i >= a.length || i >= b.length) {
      fault();
      return s;
    }
    s[i] = a[i] & b[i];
  }
  return s;
};

const tsAndNot = (a: i32[], b: i32[]): i32[] => {
  const s = new Array<i32>(12);
  for (let i = 0; i < 12; i++) {
    if (i >= a.length || i >= b.length) {
      fault();
      return s;
    }
    s[i] = a[i] & ~b[i];
  }
  return s;
};

// AnnotationParsingMode.
const APM_DEFAULT: i32 = 0;
const APM_FILE_BEFORE_PACKAGE: i32 = 1;
const APM_FILE_WHEN_PACKAGE_OMITTED: i32 = 2;
const APM_TYPE_CONTEXT: i32 = 3;
const APM_WITH_WS: i32 = 4;
const APM_WITH_WS_NO_CONTEXT: i32 = 5;
const APM_NO_ANNOTATIONS_NO_CONTEXT: i32 = 6;

const apmIsFile = (m: i32): boolean => m === APM_FILE_BEFORE_PACKAGE || m === APM_FILE_WHEN_PACKAGE_OMITTED;
const apmAllowAnnotations = (m: i32): boolean => m !== APM_NO_ANNOTATIONS_NO_CONTEXT;
const apmAllowContext = (m: i32): boolean => m === APM_DEFAULT || m === APM_WITH_WS;
const apmTypeContext = (m: i32): boolean => m === APM_TYPE_CONTEXT || m === APM_WITH_WS || m === APM_WITH_WS_NO_CONTEXT;
const apmWithWs = (m: i32): boolean => m === APM_WITH_WS || m === APM_WITH_WS_NO_CONTEXT;

// DeclarationParsingMode.
const DPM_MEMBER_OR_TOPLEVEL: i32 = 0;
const DPM_LOCAL: i32 = 1;
const DPM_SCRIPT_TOPLEVEL: i32 = 2;

// NameParsingMode.
const NPM_REQUIRED: i32 = 0;
const NPM_ALLOWED: i32 = 1;
const NPM_PROHIBITED: i32 = 2;

// MultiDeclarationMode.
const MDM_SHORT: i32 = 0;
const MDM_FULL: i32 = 1;
const MDM_FULL_VAL_ONLY: i32 = 2;

// Property components.
const PC_GET: i32 = 0;
const PC_SET: i32 = 1;
const PC_FIELD: i32 = 2;

// Enum entry results.
const EE_FAILED: i32 = 0;
const EE_NO_DELIMITER: i32 = 1;
const EE_COMMA: i32 = 2;
const EE_SEMICOLON: i32 = 3;

// Binary operation precedences (ordinals).
const PR_AS: i32 = 0;
const PR_MULTIPLICATIVE: i32 = 1;
const PR_ADDITIVE: i32 = 2;
const PR_RANGE: i32 = 3;
const PR_INFIX: i32 = 4;
const PR_ELVIS: i32 = 5;
const PR_IN_OR_IS: i32 = 6;
const PR_COMPARISON: i32 = 7;
const PR_EQUALITY: i32 = 8;
const PR_CONJUNCTION: i32 = 9;
const PR_DISJUNCTION: i32 = 10;
const PR_ASSIGNMENT: i32 = 11;

/** ModifierDetector. */
class ModDetector {
  enumDetected: boolean = false;
  companionDetected: boolean = false;
}

export class KParser {
  b: KBuilder;
  byDepth: i32 = -1; // SemanticWhitespaceAwarePsiBuilderForByClause's stack size, -1 outside a `by` clause

  // Token sets.
  MODIFIER_KEYWORDS: i32[];
  SOFT_KEYWORDS: i32[];
  KEYWORDS: i32[];
  EMPTY: i32[];
  TOP_LEVEL_DECLARATION_FIRST: i32[];
  TOP_LEVEL_DECLARATION_FIRST_SEMICOLON_SET: i32[];
  LT_EQ_SEMICOLON_TOP_LEVEL_DECLARATION_FIRST_SET: i32[];
  DECLARATION_FIRST: i32[];
  CLASS_NAME_RECOVERY_SET: i32[];
  TYPE_PARAMETER_GT_RECOVERY_SET: i32[];
  PARAMETER_NAME_RECOVERY_SET: i32[];
  PACKAGE_NAME_RECOVERY_SET: i32[];
  IMPORT_RECOVERY_SET: i32[];
  TYPE_REF_FIRST: i32[];
  LBRACE_RBRACE_TYPE_REF_FIRST_SET: i32[];
  COLON_COMMA_LBRACE_RBRACE_TYPE_REF_FIRST_SET: i32[];
  RECEIVER_TYPE_TERMINATORS: i32[];
  VALUE_PARAMETER_FIRST: i32[];
  LAMBDA_VALUE_PARAMETER_FIRST: i32[];
  SOFT_KEYWORDS_AT_MEMBER_START: i32[];
  ANNOTATION_TARGETS: i32[];
  SEMICOLON_SET: i32[];
  COMMA_COLON_GT_SET: i32[];
  GT_COMMA_COLON_SET: i32[];
  IDENTIFIER_RBRACKET_LBRACKET_SET: i32[];
  LBRACE_RBRACE_SET: i32[];
  COMMA_SEMICOLON_RBRACE_SET: i32[];
  VALUE_ARGS_RECOVERY_SET: i32[];
  PROPERTY_NAME_FOLLOW_SET: i32[];
  DESTRUCTURING_PROPERTY_NAME_FOLLOW_SET: i32[];
  PROPERTY_NAME_FOLLOW_MULTI_DECLARATION_RECOVERY_SET: i32[];
  PROPERTY_NAME_FOLLOW_FUNCTION_OR_PROPERTY_RECOVERY_SET: i32[];
  IDENTIFIER_EQ_COLON_SEMICOLON_SET: i32[];
  COMMA_RPAR_RBRACKET_COLON_EQ_SET: i32[];
  ACCESSOR_FIRST_OR_PROPERTY_END: i32[];
  RPAR_IDENTIFIER_COLON_LBRACE_EQ_SET: i32[];
  COMMA_COLON_RPAR_SET: i32[];
  RPAR_COLON_LBRACE_EQ_SET: i32[];
  LBRACKET_LBRACE_RBRACE_LPAR_SET: i32[];
  FUNCTION_NAME_FOLLOW_SET: i32[];
  FUNCTION_NAME_RECOVERY_SET: i32[];
  VALUE_PARAMETERS_FOLLOW_SET: i32[];
  CONTEXT_PARAMETERS_FOLLOW_SET: i32[];
  LPAR_VALUE_PARAMETERS_FOLLOW_SET: i32[];
  LPAR_LBRACE_COLON_CONSTRUCTOR_KEYWORD_SET: i32[];
  definitelyOutOfReceiverSet: i32[];
  EOL_OR_SEMICOLON_RBRACE_SET: i32[];
  CLASS_INTERFACE_SET: i32[];
  NO_MODIFIER_BEFORE_FOR_VALUE_PARAMETER: i32[];
  EXPRESSION_FIRST: i32[];
  EXPRESSION_FOLLOW: i32[];
  USER_TYPE_NAME_RECOVERY_SET: i32[];
  TYPE_MODIFIER_KEYWORDS: i32[];
  TYPE_ARGUMENT_MODIFIER_KEYWORDS: i32[];
  RESERVED_VALUE_PARAMETER_MODIFIER_KEYWORDS: i32[];
  VAL_VAR: i32[];
  TYPE_RECOVERY: i32[];
  // Expression parsing.
  WHEN_CONDITION_RECOVERY_SET: i32[];
  WHEN_CONDITION_RECOVERY_SET_WITH_ARROW: i32[];
  TOKEN_SET_TO_FOLLOW_AFTER_DESTRUCTURING_DECLARATION_IN_LAMBDA: i32[];
  TOKEN_SET_TO_FOLLOW_AFTER_DESTRUCTURING_DECLARATION_IN_LAMBDA_RECOVERY: i32[];
  EQ_RPAR_SET: i32[];
  ARROW_SET: i32[];
  ARROW_COMMA_SET: i32[];
  IN_KEYWORD_R_PAR_COLON_SET: i32[];
  IN_KEYWORD_L_BRACE_SET: i32[];
  IN_KEYWORD_L_BRACE_RECOVERY_SET: i32[];
  COLON_IN_KEYWORD_SET: i32[];
  L_PAR_L_BRACE_R_PAR_SET: i32[];
  IN_KEYWORD_SET: i32[];
  TRY_CATCH_RECOVERY_TOKEN_SET: i32[];
  TYPE_ARGUMENT_LIST_STOPPERS: i32[];
  STATEMENT_FIRST: i32[];
  STATEMENT_NEW_LINE_QUICK_RECOVERY_SET: i32[];
  ALLOW_NEWLINE_OPERATIONS: i32[];
  PREFIX_OPERATIONS: i32[];
  POSTFIX_OPERATIONS: i32[];
  EXPECTING_ELEMENT_RECOVERY: i32[];
  ERROR_UNTIL_STATEMENT: i32[];
  WHEN_ARROW_RECOVERY: i32[];
  PROPERTY_ERROR_UNTIL: i32[];
  ACCESSOR_ERROR_UNTIL: i32[];
  SETTER_RPAR_UNTIL: i32[];
  ANDAND_UNTIL: i32[];
  TYPE_ARG_SET_STOP: i32[];

  constructor(b: KBuilder) {
    this.b = b;
    this.EMPTY = tsNew([]);
    this.MODIFIER_KEYWORDS = tsNew([
      T_PUBLIC_KEYWORD,
      T_PROTECTED_KEYWORD,
      T_PRIVATE_KEYWORD,
      T_INTERNAL_KEYWORD,
      T_EXPECT_KEYWORD,
      T_ACTUAL_KEYWORD,
      T_FINAL_KEYWORD,
      T_OPEN_KEYWORD,
      T_ABSTRACT_KEYWORD,
      T_SEALED_KEYWORD,
      T_CONST_KEYWORD,
      T_EXTERNAL_KEYWORD,
      T_OVERRIDE_KEYWORD,
      T_LATEINIT_KEYWORD,
      T_TAILREC_KEYWORD,
      T_VARARG_KEYWORD,
      T_SUSPEND_KEYWORD,
      T_INNER_KEYWORD,
      T_ENUM_KEYWORD,
      T_ANNOTATION_KEYWORD,
      T_FUN_KEYWORD,
      T_COMPANION_KEYWORD,
      T_INLINE_KEYWORD,
      T_VALUE_KEYWORD,
      T_INFIX_KEYWORD,
      T_OPERATOR_KEYWORD,
      T_DATA_KEYWORD,
      T_OUT_KEYWORD,
      T_IN_KEYWORD,
      T_REIFIED_KEYWORD,
      T_NOINLINE_KEYWORD,
      T_CROSSINLINE_KEYWORD,
    ]);
    const soft: i32[] = [];
    const hard: i32[] = [];
    for (let t = 0; t < 149; t++) {
      if (ktIsSoft(t)) {
        soft.push(t);
      } else if (ktKeywordText(t).length > 0) {
        hard.push(t);
      }
    }
    this.SOFT_KEYWORDS = tsNew(soft);
    this.KEYWORDS = tsNew(hard);
    this.TOP_LEVEL_DECLARATION_FIRST = tsNew([
      T_TYPE_ALIAS_KEYWORD,
      T_INTERFACE_KEYWORD,
      T_CLASS_KEYWORD,
      T_OBJECT_KEYWORD,
      T_FUN_KEYWORD,
      T_VAL_KEYWORD,
      T_VAR_KEYWORD,
      T_PACKAGE_KEYWORD,
    ]);
    this.TOP_LEVEL_DECLARATION_FIRST_SEMICOLON_SET = tsOr(this.TOP_LEVEL_DECLARATION_FIRST, tsNew([T_SEMICOLON]));
    this.LT_EQ_SEMICOLON_TOP_LEVEL_DECLARATION_FIRST_SET = tsOr(
      tsNew([T_LT, T_EQ, T_SEMICOLON]),
      this.TOP_LEVEL_DECLARATION_FIRST,
    );
    this.DECLARATION_FIRST = tsOr(
      this.TOP_LEVEL_DECLARATION_FIRST,
      tsNew([T_INIT_KEYWORD, T_GET_KEYWORD, T_SET_KEYWORD, T_CONSTRUCTOR_KEYWORD]),
    );
    this.CLASS_NAME_RECOVERY_SET = tsOr(tsNew([T_LT, T_LPAR, T_COLON, T_LBRACE]), this.TOP_LEVEL_DECLARATION_FIRST);
    this.TYPE_PARAMETER_GT_RECOVERY_SET = tsNew([T_WHERE_KEYWORD, T_LPAR, T_COLON, T_LBRACE, T_GT]);
    this.PARAMETER_NAME_RECOVERY_SET = tsNew([T_COLON, T_EQ, T_COMMA, T_RPAR, T_VAL_KEYWORD, T_VAR_KEYWORD]);
    this.PACKAGE_NAME_RECOVERY_SET = tsNew([T_DOT, T_EOL_OR_SEMICOLON]);
    this.IMPORT_RECOVERY_SET = tsNew([T_AS_KEYWORD, T_DOT, T_EOL_OR_SEMICOLON]);
    this.TYPE_REF_FIRST = tsNew([T_LBRACKET, T_IDENTIFIER, T_LPAR, T_HASH, T_DYNAMIC_KEYWORD]);
    this.LBRACE_RBRACE_TYPE_REF_FIRST_SET = tsOr(tsNew([T_LBRACE, T_RBRACE]), this.TYPE_REF_FIRST);
    this.COLON_COMMA_LBRACE_RBRACE_TYPE_REF_FIRST_SET = tsOr(
      tsNew([T_COLON, T_COMMA, T_LBRACE, T_RBRACE]),
      this.TYPE_REF_FIRST,
    );
    this.RECEIVER_TYPE_TERMINATORS = tsNew([T_DOT, T_SAFE_ACCESS]);
    this.VALUE_PARAMETER_FIRST = tsOr(
      tsNew([T_IDENTIFIER, T_LBRACKET, T_VAL_KEYWORD, T_VAR_KEYWORD]),
      tsAndNot(this.MODIFIER_KEYWORDS, tsNew([T_FUN_KEYWORD])),
    );
    this.LAMBDA_VALUE_PARAMETER_FIRST = tsOr(
      tsNew([T_IDENTIFIER, T_LBRACKET]),
      tsAndNot(this.MODIFIER_KEYWORDS, tsNew([T_FUN_KEYWORD])),
    );
    this.SOFT_KEYWORDS_AT_MEMBER_START = tsNew([T_CONSTRUCTOR_KEYWORD, T_INIT_KEYWORD]);
    this.ANNOTATION_TARGETS = tsNew([
      T_ALL_KEYWORD,
      T_FILE_KEYWORD,
      T_FIELD_KEYWORD,
      T_GET_KEYWORD,
      T_SET_KEYWORD,
      T_PROPERTY_KEYWORD,
      T_RECEIVER_KEYWORD,
      T_PARAM_KEYWORD,
      T_SETPARAM_KEYWORD,
      T_DELEGATE_KEYWORD,
    ]);
    this.SEMICOLON_SET = tsNew([T_SEMICOLON]);
    this.COMMA_COLON_GT_SET = tsNew([T_COMMA, T_COLON, T_GT]);
    this.GT_COMMA_COLON_SET = tsNew([T_GT, T_COMMA, T_COLON]);
    this.IDENTIFIER_RBRACKET_LBRACKET_SET = tsNew([T_IDENTIFIER, T_RBRACKET, T_LBRACKET]);
    this.LBRACE_RBRACE_SET = tsNew([T_LBRACE, T_RBRACE]);
    this.COMMA_SEMICOLON_RBRACE_SET = tsNew([T_COMMA, T_SEMICOLON, T_RBRACE]);
    this.VALUE_ARGS_RECOVERY_SET = tsNew([T_LBRACE, T_SEMICOLON, T_RPAR, T_EOL_OR_SEMICOLON, T_RBRACE]);
    this.PROPERTY_NAME_FOLLOW_SET = tsNew([
      T_COLON,
      T_EQ,
      T_LBRACE,
      T_RBRACE,
      T_SEMICOLON,
      T_VAL_KEYWORD,
      T_VAR_KEYWORD,
      T_FUN_KEYWORD,
      T_CLASS_KEYWORD,
    ]);
    this.VAL_VAR = tsNew([T_VAL_KEYWORD, T_VAR_KEYWORD]);
    this.DESTRUCTURING_PROPERTY_NAME_FOLLOW_SET = tsAndNot(this.PROPERTY_NAME_FOLLOW_SET, this.VAL_VAR);
    this.PROPERTY_NAME_FOLLOW_MULTI_DECLARATION_RECOVERY_SET = tsOr(
      this.PROPERTY_NAME_FOLLOW_SET,
      this.PARAMETER_NAME_RECOVERY_SET,
    );
    this.PROPERTY_NAME_FOLLOW_FUNCTION_OR_PROPERTY_RECOVERY_SET = tsOr(
      tsOr(this.PROPERTY_NAME_FOLLOW_SET, this.LBRACE_RBRACE_SET),
      this.TOP_LEVEL_DECLARATION_FIRST,
    );
    this.IDENTIFIER_EQ_COLON_SEMICOLON_SET = tsNew([T_IDENTIFIER, T_EQ, T_COLON, T_SEMICOLON]);
    this.COMMA_RPAR_RBRACKET_COLON_EQ_SET = tsNew([T_COMMA, T_RPAR, T_RBRACKET, T_COLON, T_EQ]);
    this.ACCESSOR_FIRST_OR_PROPERTY_END = tsOr(
      this.MODIFIER_KEYWORDS,
      tsNew([T_AT, T_GET_KEYWORD, T_SET_KEYWORD, T_FIELD_KEYWORD, T_EOL_OR_SEMICOLON, T_RBRACE]),
    );
    this.RPAR_IDENTIFIER_COLON_LBRACE_EQ_SET = tsNew([T_RPAR, T_IDENTIFIER, T_COLON, T_LBRACE, T_EQ]);
    this.COMMA_COLON_RPAR_SET = tsNew([T_COMMA, T_COLON, T_RPAR]);
    this.RPAR_COLON_LBRACE_EQ_SET = tsNew([T_RPAR, T_COLON, T_LBRACE, T_EQ]);
    this.LBRACKET_LBRACE_RBRACE_LPAR_SET = tsNew([T_LBRACKET, T_LBRACE, T_RBRACE, T_LPAR]);
    this.FUNCTION_NAME_FOLLOW_SET = tsNew([T_LT, T_LPAR, T_RPAR, T_COLON, T_EQ]);
    this.FUNCTION_NAME_RECOVERY_SET = tsOr(
      tsOr(tsNew([T_LT, T_LPAR, T_RPAR, T_COLON, T_EQ]), this.LBRACE_RBRACE_SET),
      this.TOP_LEVEL_DECLARATION_FIRST,
    );
    this.VALUE_PARAMETERS_FOLLOW_SET = tsNew([T_EQ, T_LBRACE, T_RBRACE, T_SEMICOLON, T_RPAR]);
    this.CONTEXT_PARAMETERS_FOLLOW_SET = tsNew([
      T_CLASS_KEYWORD,
      T_OBJECT_KEYWORD,
      T_FUN_KEYWORD,
      T_VAL_KEYWORD,
      T_VAR_KEYWORD,
    ]);
    this.LPAR_VALUE_PARAMETERS_FOLLOW_SET = tsOr(tsNew([T_LPAR]), this.VALUE_PARAMETERS_FOLLOW_SET);
    this.LPAR_LBRACE_COLON_CONSTRUCTOR_KEYWORD_SET = tsNew([T_LPAR, T_LBRACE, T_COLON, T_CONSTRUCTOR_KEYWORD]);
    this.definitelyOutOfReceiverSet = tsOr(
      tsNew([T_EQ, T_COLON, T_LBRACE, T_RBRACE, T_BY_KEYWORD]),
      this.TOP_LEVEL_DECLARATION_FIRST,
    );
    this.EOL_OR_SEMICOLON_RBRACE_SET = tsNew([T_EOL_OR_SEMICOLON, T_RBRACE]);
    this.CLASS_INTERFACE_SET = tsNew([T_CLASS_KEYWORD, T_INTERFACE_KEYWORD]);
    this.NO_MODIFIER_BEFORE_FOR_VALUE_PARAMETER = tsNew([T_COMMA, T_COLON, T_EQ, T_RPAR]);
    this.EXPRESSION_FIRST = tsNew([
      T_MINUS,
      T_PLUS,
      T_MINUSMINUS,
      T_PLUSPLUS,
      T_EXCL,
      T_EXCLEXCL,
      T_COLONCOLON,
      T_LPAR,
      T_TRUE_KEYWORD,
      T_FALSE_KEYWORD,
      T_INTERPOLATION_PREFIX,
      T_OPEN_QUOTE,
      T_INTEGER_LITERAL,
      T_CHARACTER_LITERAL,
      T_FLOAT_LITERAL,
      T_NULL_KEYWORD,
      T_LBRACE,
      T_FUN_KEYWORD,
      T_THIS_KEYWORD,
      T_SUPER_KEYWORD,
      T_IF_KEYWORD,
      T_WHEN_KEYWORD,
      T_TRY_KEYWORD,
      T_OBJECT_KEYWORD,
      T_THROW_KEYWORD,
      T_RETURN_KEYWORD,
      T_CONTINUE_KEYWORD,
      T_BREAK_KEYWORD,
      T_FOR_KEYWORD,
      T_WHILE_KEYWORD,
      T_DO_KEYWORD,
      T_IDENTIFIER,
      T_AT,
      T_LBRACKET,
    ]);
    this.EXPRESSION_FOLLOW = tsNew([T_EOL_OR_SEMICOLON, T_ARROW, T_COMMA, T_RBRACE, T_RPAR, T_RBRACKET]);
    this.USER_TYPE_NAME_RECOVERY_SET = tsOr(
      tsOr(this.EXPRESSION_FIRST, this.EXPRESSION_FOLLOW),
      this.DECLARATION_FIRST,
    );
    this.TYPE_MODIFIER_KEYWORDS = tsNew([T_SUSPEND_KEYWORD]);
    this.TYPE_ARGUMENT_MODIFIER_KEYWORDS = tsNew([T_IN_KEYWORD, T_OUT_KEYWORD]);
    this.RESERVED_VALUE_PARAMETER_MODIFIER_KEYWORDS = tsNew([T_OUT_KEYWORD, T_VARARG_KEYWORD]);
    this.TYPE_RECOVERY = tsOr(
      this.TOP_LEVEL_DECLARATION_FIRST,
      tsNew([T_EQ, T_COMMA, T_GT, T_RBRACKET, T_DOT, T_RPAR, T_RBRACE, T_LBRACE, T_SEMICOLON]),
    );
    this.WHEN_CONDITION_RECOVERY_SET = tsNew([
      T_RBRACE,
      T_IN_KEYWORD,
      T_NOT_IN,
      T_IS_KEYWORD,
      T_NOT_IS,
      T_ELSE_KEYWORD,
    ]);
    this.WHEN_CONDITION_RECOVERY_SET_WITH_ARROW = tsNew([
      T_RBRACE,
      T_IN_KEYWORD,
      T_NOT_IN,
      T_IS_KEYWORD,
      T_NOT_IS,
      T_ELSE_KEYWORD,
      T_ARROW,
      T_DOT,
    ]);
    this.TOKEN_SET_TO_FOLLOW_AFTER_DESTRUCTURING_DECLARATION_IN_LAMBDA = tsNew([T_ARROW, T_COMMA, T_COLON]);
    this.TOKEN_SET_TO_FOLLOW_AFTER_DESTRUCTURING_DECLARATION_IN_LAMBDA_RECOVERY = tsOr(
      this.TOKEN_SET_TO_FOLLOW_AFTER_DESTRUCTURING_DECLARATION_IN_LAMBDA,
      this.PARAMETER_NAME_RECOVERY_SET,
    );
    this.EQ_RPAR_SET = tsNew([T_EQ, T_RPAR]);
    this.ARROW_SET = tsNew([T_ARROW]);
    this.ARROW_COMMA_SET = tsNew([T_ARROW, T_COMMA]);
    this.IN_KEYWORD_R_PAR_COLON_SET = tsNew([T_IN_KEYWORD, T_RPAR, T_COLON]);
    this.IN_KEYWORD_L_BRACE_SET = tsNew([T_IN_KEYWORD, T_LBRACE]);
    this.IN_KEYWORD_L_BRACE_RECOVERY_SET = tsOr(this.IN_KEYWORD_L_BRACE_SET, this.PARAMETER_NAME_RECOVERY_SET);
    this.COLON_IN_KEYWORD_SET = tsNew([T_COLON, T_IN_KEYWORD]);
    this.L_PAR_L_BRACE_R_PAR_SET = tsNew([T_LPAR, T_LBRACE, T_RPAR]);
    this.IN_KEYWORD_SET = tsNew([T_IN_KEYWORD]);
    this.TRY_CATCH_RECOVERY_TOKEN_SET = tsNew([T_LBRACE, T_RBRACE, T_FINALLY_KEYWORD, T_CATCH_KEYWORD]);
    this.TYPE_ARGUMENT_LIST_STOPPERS = tsNew([
      T_INTEGER_LITERAL,
      T_FLOAT_LITERAL,
      T_CHARACTER_LITERAL,
      T_INTERPOLATION_PREFIX,
      T_OPEN_QUOTE,
      T_PACKAGE_KEYWORD,
      T_AS_KEYWORD,
      T_TYPE_ALIAS_KEYWORD,
      T_INTERFACE_KEYWORD,
      T_CLASS_KEYWORD,
      T_THIS_KEYWORD,
      T_VAL_KEYWORD,
      T_VAR_KEYWORD,
      T_FUN_KEYWORD,
      T_FOR_KEYWORD,
      T_NULL_KEYWORD,
      T_TRUE_KEYWORD,
      T_FALSE_KEYWORD,
      T_IS_KEYWORD,
      T_THROW_KEYWORD,
      T_RETURN_KEYWORD,
      T_BREAK_KEYWORD,
      T_CONTINUE_KEYWORD,
      T_OBJECT_KEYWORD,
      T_IF_KEYWORD,
      T_TRY_KEYWORD,
      T_ELSE_KEYWORD,
      T_WHILE_KEYWORD,
      T_DO_KEYWORD,
      T_WHEN_KEYWORD,
      T_RBRACKET,
      T_RBRACE,
      T_RPAR,
      T_PLUSPLUS,
      T_MINUSMINUS,
      T_EXCLEXCL,
      T_PLUS,
      T_MINUS,
      T_EXCL,
      T_DIV,
      T_PERC,
      T_LTEQ,
      T_EQEQEQ,
      T_EXCLEQEQEQ,
      T_EQEQ,
      T_EXCLEQ,
      T_ANDAND,
      T_OROR,
      T_SAFE_ACCESS,
      T_ELVIS,
      T_SEMICOLON,
      T_RANGE,
      T_RANGE_UNTIL,
      T_EQ,
      T_MULTEQ,
      T_DIVEQ,
      T_PERCEQ,
      T_PLUSEQ,
      T_MINUSEQ,
      T_NOT_IN,
      T_NOT_IS,
      T_COLONCOLON,
      T_COLON,
    ]);
    this.STATEMENT_FIRST = tsOr(
      tsOr(
        this.EXPRESSION_FIRST,
        tsNew([
          T_FUN_KEYWORD,
          T_VAL_KEYWORD,
          T_VAR_KEYWORD,
          T_INTERFACE_KEYWORD,
          T_CLASS_KEYWORD,
          T_TYPE_ALIAS_KEYWORD,
        ]),
      ),
      this.MODIFIER_KEYWORDS,
    );
    this.STATEMENT_NEW_LINE_QUICK_RECOVERY_SET = tsOr(
      tsAnd(this.STATEMENT_FIRST, tsAndNot(this.KEYWORDS, tsNew([T_IN_KEYWORD]))),
      tsNew([T_EOL_OR_SEMICOLON]),
    );
    this.ALLOW_NEWLINE_OPERATIONS = tsNew([
      T_DOT,
      T_SAFE_ACCESS,
      T_COLON,
      T_AS_KEYWORD,
      T_AS_SAFE,
      T_ELVIS,
      T_ANDAND,
      T_OROR,
    ]);
    this.PREFIX_OPERATIONS = tsNew([T_MINUS, T_PLUS, T_MINUSMINUS, T_PLUSPLUS, T_EXCL]);
    this.POSTFIX_OPERATIONS = tsNew([T_PLUSPLUS, T_MINUSMINUS, T_EXCLEXCL, T_DOT, T_SAFE_ACCESS]);
    this.EXPECTING_ELEMENT_RECOVERY = tsOr(this.EXPRESSION_FOLLOW, tsNew([T_LONG_TEMPLATE_ENTRY_END]));
    this.ERROR_UNTIL_STATEMENT = tsNew([T_EOL_OR_SEMICOLON, T_LBRACE, T_RBRACE]);
    this.WHEN_ARROW_RECOVERY = tsNew([T_ARROW, T_LBRACE, T_RBRACE, T_EOL_OR_SEMICOLON]);
    this.PROPERTY_ERROR_UNTIL = tsOr(this.DECLARATION_FIRST, tsNew([T_EOL_OR_SEMICOLON, T_LBRACE, T_RBRACE]));
    this.ACCESSOR_ERROR_UNTIL = tsOr(this.ACCESSOR_FIRST_OR_PROPERTY_END, tsNew([T_LBRACE, T_LPAR, T_EQ]));
    this.SETTER_RPAR_UNTIL = tsNew([T_RPAR, T_COLON, T_LBRACE, T_RBRACE, T_EQ, T_EOL_OR_SEMICOLON]);
    this.ANDAND_UNTIL = tsNew([T_LBRACE, T_RBRACE, T_ARROW]);
    this.TYPE_ARG_SET_STOP = tsNew([T_IDENTIFIER, T_LBRACE, T_RBRACE]);
  }

  // ---- AbstractKotlinParsing -------------------------------------------------

  mark(): i32 {
    return this.b.mark();
  }

  error(): void {
    this.b.error();
  }

  tt(): i32 {
    return this.b.tt();
  }

  eof(): boolean {
    return this.b.eof();
  }

  advance(): void {
    this.b.advanceLexer();
  }

  advanceN(k: i32): void {
    for (let i = 0; i < k; i++) {
      this.advance();
    }
  }

  lookahead(k: i32): i32 {
    return this.b.lookAhead(k);
  }

  private tokenMatches(token: i32, expectation: i32): boolean {
    if (token === expectation) {
      return true;
    }
    if (expectation === T_EOL_OR_SEMICOLON) {
      if (this.eof()) {
        return true;
      }
      if (token === T_SEMICOLON) {
        return true;
      }
      if (this.b.newlineBefore()) {
        return true;
      }
    }
    return false;
  }

  _at(expectation: i32): boolean {
    return this.tokenMatches(this.tt(), expectation);
  }

  at(expectation: i32): boolean {
    if (this._at(expectation)) {
      return true;
    }
    const token = this.tt();
    if (token === T_IDENTIFIER && ktKeywordText(expectation).length > 0) {
      if (ktIsSoft(expectation) && this.b.tokenIs(ktKeywordText(expectation))) {
        this.b.remapCurrentToken(expectation);
        return true;
      }
    }
    if (expectation === T_IDENTIFIER && token >= 0 && ktIsSoft(token)) {
      this.b.remapCurrentToken(T_IDENTIFIER);
      return true;
    }
    return false;
  }

  _atSet(set: i32[]): boolean {
    const token = this.tt();
    if (tsHas(set, token)) {
      return true;
    }
    if (tsHas(set, T_EOL_OR_SEMICOLON)) {
      if (this.eof()) {
        return true;
      }
      if (token === T_SEMICOLON) {
        return true;
      }
      if (this.b.newlineBefore()) {
        return true;
      }
    }
    return false;
  }

  atSet(set: i32[]): boolean {
    if (this._atSet(set)) {
      return true;
    }
    const token = this.tt();
    if (token === T_IDENTIFIER) {
      const kw = ktSoftKeyword(this.b.tokenText());
      if (kw >= 0 && tsHas(set, kw)) {
        this.b.remapCurrentToken(kw);
        return true;
      }
    } else if (tsHas(set, T_IDENTIFIER) && token >= 0 && ktIsSoft(token)) {
      this.b.remapCurrentToken(T_IDENTIFIER);
      return true;
    }
    return false;
  }

  expect(expectation: i32): boolean {
    if (this.at(expectation)) {
      this.advance();
      return true;
    }
    if (expectation === T_IDENTIFIER && this.b.tokenIs("`")) {
      this.advance();
    }
    return false;
  }

  expectMsg(expectation: i32): boolean {
    if (this.expect(expectation)) {
      return true;
    }
    this.errorWithRecovery(null);
    return false;
  }

  expectRec(expectation: i32, recoverySet: i32[]): boolean {
    if (this.expect(expectation)) {
      return true;
    }
    this.errorWithRecovery(recoverySet);
    return false;
  }

  expectNoAdvance(expectation: i32): void {
    if (this.at(expectation)) {
      this.advance();
      return;
    }
    this.error();
  }

  errorWithRecovery(recoverySet: i32[] | null): void {
    const t = this.tt();
    if (
      recoverySet === null ||
      tsHas(recoverySet, t) ||
      t === T_LBRACE ||
      t === T_RBRACE ||
      (tsHas(recoverySet, T_EOL_OR_SEMICOLON) && (this.eof() || t === T_SEMICOLON || this.b.newlineBefore()))
    ) {
      this.error();
    } else {
      this.errorAndAdvance(1);
    }
  }

  errorAndAdvance(k: i32): void {
    const err = this.mark();
    this.advanceN(k);
    this.b.errorMarker(err);
  }

  consumeIf(token: i32): boolean {
    if (this.at(token)) {
      this.advance();
      return true;
    }
    return false;
  }

  skipUntil(set: i32[]): void {
    const stopAtEolOrSemi = tsHas(set, T_EOL_OR_SEMICOLON);
    while (!this.eof() && !tsHas(set, this.tt()) && !(stopAtEolOrSemi && this.at(T_EOL_OR_SEMICOLON))) {
      this.advance();
    }
  }

  errorUntil(set: i32[]): void {
    const err = this.mark();
    this.skipUntil(set);
    this.b.errorMarker(err);
  }

  errorIf(m: i32, condition: boolean): void {
    if (condition) {
      this.b.errorMarker(m);
    } else {
      this.b.drop(m);
    }
  }

  eol(): boolean {
    return this.b.newlineBefore() || this.eof();
  }

  getLastToken(): i32 {
    const cur = this.b.cur;
    // A lexeme index, below the source's length.
    if (cur > 1073741823) {
      fault();
      return -1;
    }
    let i = 1;
    while (i <= cur && isWsOrComment(this.b.rawLookup(-i))) {
      i++;
    }
    return this.b.rawLookup(-i);
  }

  closeDeclarationWithCommentBinders(m: i32, type: i32, precedingNonDocComments: boolean): void {
    this.b.done(m, type);
    this.b.setBinders(
      m,
      precedingNonDocComments ? B_PRECEDING_COMMENTS : B_PRECEDING_DOC_COMMENTS,
      B_TRAILING_COMMENTS,
    );
  }

  disableNewlines(): void {
    this.b.disableNewlines();
    this.byDepthUp();
  }

  enableNewlines(): void {
    this.b.enableNewlines();
    this.byDepthUp();
  }

  private byDepthUp(): void {
    const d = this.byDepth;
    if (d >= 0) {
      // One level a token at most.
      if (d >= 1073741823) {
        fault();
        return;
      }
      this.byDepth = d + 1;
    }
  }

  restoreNewlinesState(): void {
    this.b.restoreNewlinesState();
    const d = this.byDepth;
    if (d >= 0) {
      this.byDepth = d - 1;
    }
  }

  // ---- KotlinParsing: files --------------------------------------------------

  parseFile(): void {
    const fileMarker = this.mark();
    this.parsePreamble();
    while (!this.eof()) {
      this.parseTopLevelDeclaration();
    }
    this.checkUnclosedBlockComment();
    this.b.done(fileMarker, N_KT_FILE);
  }

  private checkUnclosedBlockComment(): void {
    const last = this.b.rawLookup(-1);
    if (last === T_BLOCK_COMMENT || last === T_DOC_COMMENT) {
      const a = this.b.rawTokenTypeStart(-1);
      const e = this.b.rawTokenTypeStart(0);
      const src = this.b.lx.src;
      // The last lexeme's range lies in the source.
      if (a < 0 || e < 0 || e > src.length) {
        fault();
        return;
      }
      if (!(e - a > 2 && e >= 2 && toI32(src[e - 2]) === 42 && toI32(src[e - 1]) === 47)) {
        // The file does not parse; the marker's binders do not matter.
        this.error();
      }
    }
  }

  private parseTopLevelDeclaration(): void {
    if (this.at(T_SEMICOLON)) {
      this.advance();
      return;
    }
    const decl = this.mark();
    const detector = new ModDetector();
    this.parseModifierList(detector, this.EMPTY, false);
    let declType = this.parseCommonDeclaration(detector, NPM_REQUIRED, DPM_MEMBER_OR_TOPLEVEL);
    if (declType < 0 && this.at(T_LBRACE)) {
      this.error();
      this.parseBlock();
      declType = N_FUN;
    }
    if (declType < 0 && this.at(T_IMPORT_KEYWORD)) {
      this.error();
      this.parseImportDirectives();
      this.b.drop(decl);
    } else if (declType < 0) {
      this.errorAndAdvance(1);
      this.b.drop(decl);
    } else {
      this.closeDeclarationWithCommentBinders(decl, declType, true);
    }
  }

  parseScript(): void {
    const fileMarker = this.mark();
    this.parsePreamble();
    const scriptMarker = this.mark();
    const blockMarker = this.mark();
    this.parseStatements(true);
    this.checkForUnexpectedSymbols();
    this.b.done(blockMarker, N_BLOCK);
    this.b.setBinders(blockMarker, B_PRECEDING_ALL, B_TRAILING_ALL);
    this.b.done(scriptMarker, N_SCRIPT);
    this.b.setBinders(scriptMarker, B_PRECEDING_ALL, B_TRAILING_ALL);
    this.b.done(fileMarker, N_KT_FILE);
  }

  private checkForUnexpectedSymbols(): void {
    while (!this.eof()) {
      this.errorAndAdvance(1);
    }
  }

  private parsePreamble(): void {
    const firstEntry = this.mark();
    this.parseFileAnnotationList(APM_FILE_BEFORE_PACKAGE);
    let packageDirective = this.mark();
    this.parseModifierListSimple(this.EMPTY);
    if (this.at(T_PACKAGE_KEYWORD)) {
      this.advance();
      this.parsePackageName();
      this.b.drop(firstEntry);
      this.consumeIf(T_SEMICOLON);
      this.b.done(packageDirective, N_PACKAGE_DIRECTIVE);
    } else {
      this.b.rollbackTo(firstEntry);
      this.parseFileAnnotationList(APM_FILE_WHEN_PACKAGE_OMITTED);
      packageDirective = this.mark();
      this.b.done(packageDirective, N_PACKAGE_DIRECTIVE);
      this.b.setBinders(packageDirective, B_SHEBANG, B_DEFAULT);
    }
    this.parseImportDirectives();
  }

  private parsePackageName(): void {
    let qualifiedExpression = this.mark();
    let simpleName = true;
    while (true) {
      if (this.b.newlineBefore()) {
        this.errorWithRecovery(this.PACKAGE_NAME_RECOVERY_SET);
        break;
      }
      if (this.at(T_DOT)) {
        this.advance();
        this.b.errorMarker(qualifiedExpression);
        qualifiedExpression = this.mark();
        continue;
      }
      const nsName = this.mark();
      const simpleNameFound = this.expectRec(T_IDENTIFIER, this.PACKAGE_NAME_RECOVERY_SET);
      if (simpleNameFound) {
        this.b.done(nsName, N_REFERENCE_EXPRESSION);
      } else {
        this.b.drop(nsName);
      }
      if (!simpleName) {
        const precedingMarker = this.b.precede(qualifiedExpression);
        this.b.done(qualifiedExpression, N_DOT_QUALIFIED_EXPRESSION);
        qualifiedExpression = precedingMarker;
      }
      if (this.at(T_DOT)) {
        this.advance();
        if (simpleName && !simpleNameFound) {
          this.b.drop(qualifiedExpression);
          qualifiedExpression = this.mark();
        } else {
          simpleName = false;
        }
      } else {
        break;
      }
    }
    this.b.drop(qualifiedExpression);
  }

  private parseImportDirective(): void {
    const importDirective = this.mark();
    this.advance();
    if (this.closeImportWithErrorIfNewline(importDirective, -1)) {
      return;
    }
    if (!this.at(T_IDENTIFIER)) {
      const err = this.mark();
      this.skipUntil(tsNew([T_EOL_OR_SEMICOLON]));
      this.b.errorMarker(err);
      this.b.done(importDirective, N_IMPORT_DIRECTIVE);
      this.consumeIf(T_SEMICOLON);
      return;
    }
    let qualifiedName = this.mark();
    let reference = this.mark();
    this.advance();
    this.b.done(reference, N_REFERENCE_EXPRESSION);
    while (this.at(T_DOT) && this.lookahead(1) !== T_MUL) {
      this.advance();
      if (this.closeImportWithErrorIfNewline(importDirective, -1)) {
        this.b.drop(qualifiedName);
        return;
      }
      reference = this.mark();
      if (this.expectRec(T_IDENTIFIER, this.IMPORT_RECOVERY_SET)) {
        this.b.done(reference, N_REFERENCE_EXPRESSION);
      } else {
        this.b.drop(reference);
      }
      const precede = this.b.precede(qualifiedName);
      this.b.done(qualifiedName, N_DOT_QUALIFIED_EXPRESSION);
      qualifiedName = precede;
    }
    this.b.drop(qualifiedName);
    if (this.at(T_DOT)) {
      this.advance();
      this.advance();
      if (this.at(T_AS_KEYWORD)) {
        const as = this.mark();
        this.advance();
        if (this.closeImportWithErrorIfNewline(importDirective, -1)) {
          this.b.drop(as);
          return;
        }
        this.consumeIf(T_IDENTIFIER);
        this.b.done(as, N_IMPORT_ALIAS);
        this.b.errorMarker(this.b.precede(as));
      }
    }
    if (this.at(T_AS_KEYWORD)) {
      const alias = this.mark();
      this.advance();
      if (this.closeImportWithErrorIfNewline(importDirective, alias)) {
        return;
      }
      this.expectRec(T_IDENTIFIER, this.SEMICOLON_SET);
      this.b.done(alias, N_IMPORT_ALIAS);
    }
    this.consumeIf(T_SEMICOLON);
    this.b.done(importDirective, N_IMPORT_DIRECTIVE);
    this.b.setBinders(importDirective, B_DEFAULT, B_TRAILING_COMMENTS);
  }

  private closeImportWithErrorIfNewline(importDirective: i32, importAlias: i32): boolean {
    if (this.b.newlineBefore()) {
      if (importAlias >= 0) {
        this.b.done(importAlias, N_IMPORT_ALIAS);
      }
      this.error();
      this.b.done(importDirective, N_IMPORT_DIRECTIVE);
      return true;
    }
    return false;
  }

  private parseImportDirectives(): void {
    const importList = this.mark();
    const binder = this.at(T_IMPORT_KEYWORD) ? B_DEFAULT : B_DO_NOT_BIND;
    while (this.at(T_IMPORT_KEYWORD)) {
      this.parseImportDirective();
    }
    this.b.done(importList, N_IMPORT_LIST);
    if (binder === B_DO_NOT_BIND) {
      this.b.setBinders(importList, B_DO_NOT_BIND, B_DEFAULT);
    }
  }

  parseCommonDeclaration(detector: ModDetector, nameParsingModeForObject: i32, declarationParsingMode: i32): i32 {
    const t = this.tt();
    if (t === T_CLASS_KEYWORD || t === T_INTERFACE_KEYWORD) {
      return this.parseClass(detector.enumDetected, true);
    }
    if (t === T_FUN_KEYWORD) {
      return this.parseFunction(false);
    }
    if (t === T_VAL_KEYWORD || t === T_VAR_KEYWORD) {
      return this.parseProperty(declarationParsingMode);
    }
    if (t === T_LPAR || t === T_LBRACKET) {
      const la = this.lookahead(1);
      return la === T_VAL_KEYWORD || la === T_VAR_KEYWORD ? this.parseProperty(declarationParsingMode) : -1;
    }
    if (t === T_TYPE_ALIAS_KEYWORD) {
      return this.parseTypeAlias();
    }
    if (t === T_OBJECT_KEYWORD) {
      this.parseObject(nameParsingModeForObject, true);
      return N_OBJECT_DECLARATION;
    }
    if (t === T_IDENTIFIER) {
      if (detector.enumDetected && declarationParsingMode === DPM_MEMBER_OR_TOPLEVEL) {
        return this.parseClass(true, false);
      }
    }
    return -1;
  }

  // ---- Modifiers -------------------------------------------------------------

  parseModifierListSimple(noModifiersBefore: i32[]): boolean {
    return this.doParseModifierList(null, this.MODIFIER_KEYWORDS, APM_DEFAULT, noModifiersBefore, false);
  }

  parseAnnotationsList(noModifiersBefore: i32[]): void {
    this.doParseModifierList(null, this.EMPTY, APM_DEFAULT, noModifiersBefore, false);
  }

  parseModifierList(detector: ModDetector | null, noModifiersBefore: i32[], localDeclaration: boolean): boolean {
    return this.doParseModifierList(detector, this.MODIFIER_KEYWORDS, APM_DEFAULT, noModifiersBefore, localDeclaration);
  }

  private parseFunctionTypeValueParameterModifierList(): void {
    this.doParseModifierList(
      null,
      this.RESERVED_VALUE_PARAMETER_MODIFIER_KEYWORDS,
      APM_NO_ANNOTATIONS_NO_CONTEXT,
      this.NO_MODIFIER_BEFORE_FOR_VALUE_PARAMETER,
      false,
    );
  }

  private parseTypeModifierList(): void {
    this.doParseModifierList(null, this.TYPE_MODIFIER_KEYWORDS, APM_TYPE_CONTEXT, this.EMPTY, false);
  }

  private parseTypeArgumentModifierList(): void {
    this.doParseModifierList(
      null,
      this.TYPE_ARGUMENT_MODIFIER_KEYWORDS,
      APM_NO_ANNOTATIONS_NO_CONTEXT,
      this.COMMA_COLON_GT_SET,
      false,
    );
  }

  private doParseModifierListBody(
    detector: ModDetector | null,
    modifierKeywords: i32[],
    mode: i32,
    noModifiersBefore: i32[],
    localDeclaration: boolean,
  ): boolean {
    let empty = true;
    while (!this.eof()) {
      if (this.at(T_AT) && apmAllowAnnotations(mode)) {
        const beforeAnnotationMarker = this.mark();
        const isAnnotationParsed = this.parseAnnotationOrList(mode);
        if (!isAnnotationParsed && !apmWithWs(mode)) {
          this.b.rollbackTo(beforeAnnotationMarker);
          const newMode = apmAllowContext(mode) ? APM_WITH_WS : APM_WITH_WS_NO_CONTEXT;
          this.doParseModifierListBody(detector, modifierKeywords, newMode, noModifiersBefore, localDeclaration);
          empty = false;
          break;
        } else {
          this.b.drop(beforeAnnotationMarker);
        }
      } else if (this.at(T_CONTEXT_KEYWORD) && apmAllowContext(mode) && this.lookahead(1) === T_LPAR) {
        const contextMarker = this.mark();
        if (!this.parseContextParameterOrReceiverList(false) && localDeclaration) {
          this.b.rollbackTo(contextMarker);
          break;
        } else {
          this.b.drop(contextMarker);
        }
      } else if (this.tryParseModifier(detector, noModifiersBefore, modifierKeywords)) {
        // a modifier
      } else {
        break;
      }
      empty = false;
    }
    return empty;
  }

  private doParseModifierList(
    detector: ModDetector | null,
    modifierKeywords: i32[],
    mode: i32,
    noModifiersBefore: i32[],
    localDeclaration: boolean,
  ): boolean {
    const list = this.mark();
    const empty = this.doParseModifierListBody(detector, modifierKeywords, mode, noModifiersBefore, localDeclaration);
    if (empty) {
      this.b.drop(list);
    } else {
      this.b.done(list, N_MODIFIER_LIST);
    }
    return !empty;
  }

  private tryParseModifier(detector: ModDetector | null, noModifiersBefore: i32[], modifierKeywords: i32[]): boolean {
    const marker = this.mark();
    if (this.atSet(modifierKeywords)) {
      const la = this.lookahead(1);
      if (this.at(T_FUN_KEYWORD) && la !== T_INTERFACE_KEYWORD) {
        this.b.rollbackTo(marker);
        return false;
      }
      if (la >= 0 && !tsHas(noModifiersBefore, la)) {
        const t = this.tt();
        if (detector !== null) {
          if (t === T_ENUM_KEYWORD) {
            detector.enumDetected = true;
          } else if (t === T_COMPANION_KEYWORD) {
            detector.companionDetected = true;
          }
        }
        this.advance();
        this.b.collapse(marker, t);
        return true;
      }
    }
    this.b.rollbackTo(marker);
    return false;
  }

  private parseContextParameterOrReceiverList(inFunctionType: boolean): boolean {
    const list = this.mark();
    this.advance();
    let noError = false;
    if (this.lookahead(1) === T_RPAR) {
      this.advance();
      this.error();
      this.advance();
      noError = false;
    } else {
      noError = this.valueParameterLoop(inFunctionType, this.CONTEXT_PARAMETERS_FOLLOW_SET, 0, inFunctionType, false);
    }
    this.b.done(list, N_CONTEXT_PARAMETER_LIST);
    return noError;
  }

  private parseValueParameterOrTypeRef(inFunctionType: boolean): boolean {
    if (this.tryParseValueParameter(true)) {
      return true;
    }
    const contextReceiver = this.mark();
    if (!inFunctionType && this.isAtLabelDefinitionOrMissingIdentifier()) {
      this.parseLabelDefinition();
    }
    this.parseTypeRef();
    this.b.done(contextReceiver, N_CONTEXT_RECEIVER);
    return inFunctionType;
  }

  private parseFileAnnotationList(mode: i32): void {
    const list = this.mark();
    if (this.parseAnnotations(mode)) {
      this.b.done(list, N_FILE_ANNOTATION_LIST);
    } else {
      this.b.drop(list);
    }
  }

  parseAnnotations(mode: i32): boolean {
    if (!this.parseAnnotationOrList(mode)) {
      return false;
    }
    while (this.parseAnnotationOrList(mode)) {
      // more
    }
    return true;
  }

  private parseAnnotationOrList(mode: i32): boolean {
    if (this.at(T_AT)) {
      const nextRaw = this.b.rawLookup(1);
      let tokenToMatch = nextRaw;
      let isTargeted = false;
      if ((nextRaw === T_IDENTIFIER || tsHas(this.ANNOTATION_TARGETS, nextRaw)) && this.lookahead(2) === T_COLON) {
        tokenToMatch = this.lookahead(3);
        isTargeted = true;
      } else if (this.lookahead(1) === T_COLON) {
        isTargeted = true;
        tokenToMatch = this.lookahead(2);
      }
      if (tokenToMatch === T_IDENTIFIER) {
        return this.parseAnnotation(mode);
      } else if (tokenToMatch === T_LBRACKET) {
        return this.parseAnnotationList(mode);
      } else {
        if (isTargeted) {
          this.errorAndAdvance(this.lookahead(1) === T_COLON ? 2 : 3);
        } else {
          this.errorAndAdvance(1);
        }
      }
      return true;
    }
    return false;
  }

  private parseAnnotationList(mode: i32): boolean {
    const annotation = this.mark();
    this.disableNewlines();
    this.advance();
    if (!this.parseAnnotationTargetIfNeeded(mode)) {
      this.b.rollbackTo(annotation);
      this.restoreNewlinesState();
      return false;
    }
    this.advance();
    if (!this.at(T_IDENTIFIER) && !this.at(T_AT)) {
      this.error();
    } else {
      while (this.at(T_IDENTIFIER) || this.at(T_AT)) {
        if (this.at(T_AT)) {
          this.errorAndAdvance(1);
          continue;
        }
        this.parseAnnotation(APM_DEFAULT);
        while (this.at(T_COMMA)) {
          this.errorAndAdvance(1);
        }
      }
    }
    this.expectMsg(T_RBRACKET);
    this.restoreNewlinesState();
    this.b.done(annotation, N_ANNOTATION);
    return true;
  }

  private parseAnnotationTargetIfNeeded(mode: i32): boolean {
    if (this.at(T_COLON)) {
      this.errorAndAdvance(1);
      return true;
    }
    const targetKeyword = this.atSet(this.ANNOTATION_TARGETS) ? this.b.tt() : -1;
    if (
      mode === APM_FILE_WHEN_PACKAGE_OMITTED &&
      !(targetKeyword === T_FILE_KEYWORD && this.lookahead(1) === T_COLON)
    ) {
      return false;
    }
    if (this.lookahead(1) === T_COLON && targetKeyword < 0 && this.at(T_IDENTIFIER)) {
      this.errorAndAdvance(1);
      this.advance();
      return true;
    }
    if (targetKeyword < 0 && apmIsFile(mode)) {
      this.parseAnnotationTarget(T_FILE_KEYWORD);
    } else if (targetKeyword >= 0) {
      this.parseAnnotationTarget(targetKeyword);
    }
    return true;
  }

  private parseAnnotationTarget(keyword: i32): void {
    const marker = this.mark();
    if (!this.expect(keyword)) {
      this.error();
      this.b.drop(marker);
    } else {
      this.b.done(marker, N_ANNOTATION_TARGET);
    }
    if (!this.expect(T_COLON)) {
      this.errorWithRecovery(this.IDENTIFIER_RBRACKET_LBRACKET_SET);
    }
  }

  private parseAnnotation(mode: i32): boolean {
    const annotation = this.mark();
    const atAt = this.at(T_AT);
    if (atAt) {
      this.advance();
    }
    if (atAt && !this.parseAnnotationTargetIfNeeded(mode)) {
      this.b.rollbackTo(annotation);
      return false;
    }
    const reference = this.mark();
    const typeReference = this.mark();
    this.parseUserType();
    this.b.done(typeReference, N_TYPE_REFERENCE);
    this.b.done(reference, N_CONSTRUCTOR_CALLEE);
    this.parseTypeArgumentList();
    if (
      this.at(T_LPAR) &&
      !tsHas(this.VAL_VAR, this.lookahead(1)) &&
      !(isWsOrComment(this.b.rawLookup(-1)) && apmWithWs(mode))
    ) {
      this.parseValueArgumentList();
      if (apmTypeContext(mode) && (this.getLastToken() !== T_RPAR || this.at(T_ARROW))) {
        this.b.done(annotation, N_ANNOTATION_ENTRY);
        return false;
      }
    }
    this.b.done(annotation, N_ANNOTATION_ENTRY);
    return true;
  }

  // ---- Classes ---------------------------------------------------------------

  private parseClassOrObject(
    object: boolean,
    nameParsingMode: i32,
    optionalBody: boolean,
    enumClass: boolean,
    expectKindKeyword: boolean,
  ): i32 {
    if (expectKindKeyword) {
      this.advance();
    } else {
      this.error();
    }
    if (nameParsingMode === NPM_REQUIRED) {
      this.expectRec(T_IDENTIFIER, this.CLASS_NAME_RECOVERY_SET);
    } else {
      if (this.at(T_IDENTIFIER)) {
        if (nameParsingMode === NPM_PROHIBITED) {
          this.errorAndAdvance(1);
        } else {
          this.advance();
        }
      }
    }
    const typeParametersDeclared = this.parseTypeParameterList(this.TYPE_PARAMETER_GT_RECOVERY_SET);
    const beforeConstructorModifiers = this.mark();
    const primaryConstructorMarker = this.mark();
    const hasConstructorModifiers = this.parseModifierListSimple(this.EMPTY);
    if (hasConstructorModifiers && !this.atSet(this.LPAR_LBRACE_COLON_CONSTRUCTOR_KEYWORD_SET)) {
      this.b.rollbackTo(beforeConstructorModifiers);
      return object ? N_OBJECT_DECLARATION : N_CLASS;
    }
    this.b.drop(beforeConstructorModifiers);
    const hasConstructorKeyword = this.at(T_CONSTRUCTOR_KEYWORD);
    if (hasConstructorKeyword) {
      this.advance();
    }
    if (this.at(T_LPAR)) {
      this.parseValueParameterList(false, true, this.LBRACE_RBRACE_SET);
      this.b.done(primaryConstructorMarker, N_PRIMARY_CONSTRUCTOR);
    } else if (hasConstructorModifiers || hasConstructorKeyword) {
      this.b.done(primaryConstructorMarker, N_PRIMARY_CONSTRUCTOR);
      this.error();
    } else {
      this.b.drop(primaryConstructorMarker);
    }
    if (this.at(T_COLON)) {
      this.advance();
      this.parseDelegationSpecifierList();
    }
    // OptionalMarker whereMarker = new OptionalMarker(object)
    const whereMarker = object ? this.mark() : -1;
    const whereOffset = this.b.currentOffset();
    this.parseTypeConstraintsGuarded(typeParametersDeclared);
    if (whereMarker >= 0) {
      if (whereOffset === this.b.currentOffset()) {
        this.b.drop(whereMarker);
      } else {
        this.b.errorMarker(whereMarker);
      }
    }
    if (this.at(T_LBRACE)) {
      if (enumClass) {
        this.parseEnumClassBody();
      } else {
        this.parseClassBody();
      }
    } else if (!optionalBody) {
      const fakeBody = this.mark();
      this.error();
      this.b.done(fakeBody, N_CLASS_BODY);
    }
    return object ? N_OBJECT_DECLARATION : N_CLASS;
  }

  private parseClass(enumClass: boolean, expectKindKeyword: boolean): i32 {
    return this.parseClassOrObject(false, NPM_REQUIRED, true, enumClass, expectKindKeyword);
  }

  parseObject(nameParsingMode: i32, optionalBody: boolean): void {
    this.parseClassOrObject(true, nameParsingMode, optionalBody, false, true);
  }

  private parseEnumClassBody(): void {
    if (!this.at(T_LBRACE)) {
      return;
    }
    const body = this.mark();
    this.enableNewlines();
    this.advance();
    if (!this.parseEnumEntries() && !this.at(T_RBRACE)) {
      this.error();
    }
    this.parseMembers();
    this.expectMsg(T_RBRACE);
    this.restoreNewlinesState();
    this.b.done(body, N_CLASS_BODY);
  }

  private parseEnumEntries(): boolean {
    while (!this.eof() && !this.at(T_RBRACE)) {
      const r = this.parseEnumEntry();
      if (r === EE_FAILED) {
        if (this.at(T_SEMICOLON)) {
          this.advance();
          return true;
        }
        return false;
      } else if (r === EE_NO_DELIMITER) {
        return false;
      } else if (r === EE_SEMICOLON) {
        return true;
      }
    }
    return false;
  }

  private parseEnumEntry(): i32 {
    const entry = this.mark();
    this.parseModifierListSimple(this.COMMA_SEMICOLON_RBRACE_SET);
    if (!this.atSet(this.SOFT_KEYWORDS_AT_MEMBER_START) && this.at(T_IDENTIFIER)) {
      this.advance();
      if (this.at(T_LPAR)) {
        const initializerList = this.mark();
        const delegatorSuperCall = this.mark();
        const callee = this.mark();
        const typeReference = this.mark();
        const type = this.mark();
        const referenceExpr = this.mark();
        this.b.done(referenceExpr, N_ENUM_ENTRY_SUPERCLASS_REFERENCE_EXPRESSION);
        this.b.done(type, N_USER_TYPE);
        this.b.done(typeReference, N_TYPE_REFERENCE);
        this.b.done(callee, N_CONSTRUCTOR_CALLEE);
        this.parseValueArgumentList();
        this.b.done(delegatorSuperCall, N_SUPER_TYPE_CALL_ENTRY);
        this.b.done(initializerList, N_INITIALIZER_LIST);
      }
      if (this.at(T_LBRACE)) {
        this.parseClassBody();
      }
      const commaFound = this.at(T_COMMA);
      if (commaFound) {
        this.advance();
      }
      const semicolonFound = this.at(T_SEMICOLON);
      if (semicolonFound) {
        this.advance();
      }
      this.closeDeclarationWithCommentBinders(entry, N_ENUM_ENTRY, true);
      return semicolonFound ? EE_SEMICOLON : commaFound ? EE_COMMA : EE_NO_DELIMITER;
    }
    this.b.rollbackTo(entry);
    return EE_FAILED;
  }

  private parseClassBody(): void {
    const body = this.mark();
    this.enableNewlines();
    if (this.expectMsg(T_LBRACE)) {
      this.parseMembers();
      this.expectMsg(T_RBRACE);
    }
    this.restoreNewlinesState();
    this.b.done(body, N_CLASS_BODY);
  }

  private parseMembers(): void {
    while (!this.eof() && !this.at(T_RBRACE)) {
      this.parseMemberDeclaration();
    }
  }

  private parseMemberDeclaration(): void {
    if (this.at(T_SEMICOLON)) {
      this.advance();
      return;
    }
    const decl = this.mark();
    const isCompanionBlock = this.at(T_COMPANION_KEYWORD) && this.lookahead(1) === T_LBRACE;
    const detector = new ModDetector();
    this.parseModifierList(detector, this.EMPTY, false);
    const declType = isCompanionBlock ? this.parseCompanionBlock() : this.parseMemberDeclarationRest(detector);
    if (declType < 0) {
      this.errorWithRecovery(this.EMPTY);
      this.b.drop(decl);
    } else {
      this.closeDeclarationWithCommentBinders(decl, declType, true);
    }
  }

  private parseCompanionBlock(): i32 {
    this.parseClassBody();
    return N_COMPANION_BLOCK;
  }

  private parseMemberDeclarationRest(detector: ModDetector): i32 {
    let declType = this.parseCommonDeclaration(
      detector,
      detector.companionDetected ? NPM_ALLOWED : NPM_REQUIRED,
      DPM_MEMBER_OR_TOPLEVEL,
    );
    if (declType >= 0) {
      return declType;
    }
    if (this.at(T_INIT_KEYWORD)) {
      this.advance();
      if (this.at(T_LBRACE)) {
        this.parseBlock();
      } else {
        this.b.errorMarker(this.mark());
      }
      declType = N_CLASS_INITIALIZER;
    } else if (this.at(T_CONSTRUCTOR_KEYWORD)) {
      this.parseSecondaryConstructor();
      declType = N_SECONDARY_CONSTRUCTOR;
    } else if (this.at(T_LBRACE)) {
      this.error();
      this.parseBlock();
      declType = N_FUN;
    }
    return declType;
  }

  private parseSecondaryConstructor(): void {
    this.advance();
    if (this.at(T_LPAR)) {
      this.parseValueParameterList(false, true, this.VALUE_ARGS_RECOVERY_SET);
    } else {
      this.errorWithRecovery(tsOr(this.VALUE_ARGS_RECOVERY_SET, tsNew([T_COLON])));
    }
    if (this.at(T_COLON)) {
      this.advance();
      const delegationCall = this.mark();
      if (this.at(T_THIS_KEYWORD) || this.at(T_SUPER_KEYWORD)) {
        this.parseThisOrSuper();
        this.parseValueArgumentList();
      } else {
        this.error();
        let beforeWrongDelegationCallee = -1;
        if (!this.at(T_LPAR)) {
          beforeWrongDelegationCallee = this.mark();
          this.advance();
        }
        this.parseValueArgumentList();
        if (beforeWrongDelegationCallee >= 0) {
          if (this.at(T_LBRACE)) {
            this.b.drop(beforeWrongDelegationCallee);
          } else {
            this.b.rollbackTo(beforeWrongDelegationCallee);
          }
        }
      }
      this.b.done(delegationCall, N_CONSTRUCTOR_DELEGATION_CALL);
    } else {
      const emptyDelegationCall = this.mark();
      this.b.done(this.mark(), N_CONSTRUCTOR_DELEGATION_REFERENCE);
      this.b.done(emptyDelegationCall, N_CONSTRUCTOR_DELEGATION_CALL);
    }
    if (this.at(T_LBRACE)) {
      this.parseBlock();
    }
  }

  private parseThisOrSuper(): void {
    const m = this.mark();
    this.advance();
    this.b.done(m, N_CONSTRUCTOR_DELEGATION_REFERENCE);
  }

  private parseTypeAlias(): i32 {
    this.advance();
    this.expectRec(T_IDENTIFIER, this.LT_EQ_SEMICOLON_TOP_LEVEL_DECLARATION_FIRST_SET);
    this.parseTypeParameterList(this.TYPE_PARAMETER_GT_RECOVERY_SET);
    if (this.at(T_WHERE_KEYWORD)) {
      const err = this.mark();
      this.parseTypeConstraints();
      this.b.errorMarker(err);
    }
    this.expectRec(T_EQ, this.TOP_LEVEL_DECLARATION_FIRST_SEMICOLON_SET);
    this.parseTypeRef();
    this.consumeIf(T_SEMICOLON);
    return N_TYPEALIAS;
  }

  // ---- Properties ------------------------------------------------------------

  parseProperty(mode: i32): i32 {
    const isShortForm = this.at(T_VAL_KEYWORD) || this.at(T_VAR_KEYWORD);
    if (isShortForm) {
      this.advance();
    }
    const typeParametersDeclared = this.at(T_LT) && this.parseTypeParameterList(this.IDENTIFIER_EQ_COLON_SEMICOLON_SET);
    this.b.disableJoiningComplexTokens();
    const receiver = this.mark();
    const receiverTypeDeclared = this.parseReceiverType(this.PROPERTY_NAME_FOLLOW_SET);
    const multiDeclaration = this.at(T_LPAR) || this.at(T_LBRACKET);
    this.errorIf(receiver, multiDeclaration && receiverTypeDeclared);
    const isNameOnTheNextLine = this.eol();
    const beforeName = this.mark();
    if (multiDeclaration) {
      const multiDecl = this.mark();
      this.parseMultiDeclarationEntry(
        isShortForm ? this.PROPERTY_NAME_FOLLOW_SET : this.DESTRUCTURING_PROPERTY_NAME_FOLLOW_SET,
        this.PROPERTY_NAME_FOLLOW_MULTI_DECLARATION_RECOVERY_SET,
        isShortForm ? MDM_SHORT : MDM_FULL,
      );
      this.errorIf(multiDecl, mode === DPM_MEMBER_OR_TOPLEVEL);
    } else {
      this.parseFunctionOrPropertyName(
        receiverTypeDeclared,
        this.PROPERTY_NAME_FOLLOW_SET,
        this.PROPERTY_NAME_FOLLOW_FUNCTION_OR_PROPERTY_RECOVERY_SET,
        true,
      );
    }
    this.b.restoreJoiningComplexTokensState();
    let noTypeReference = true;
    if (this.at(T_COLON)) {
      noTypeReference = false;
      const type = this.mark();
      this.advance();
      this.parseTypeRef();
      this.errorIf(type, multiDeclaration);
    }
    this.parseTypeConstraintsGuarded(typeParametersDeclared);
    if (!this.parsePropertyDelegateOrAssignment() && isNameOnTheNextLine && noTypeReference && !receiverTypeDeclared) {
      if (!multiDeclaration || isShortForm) {
        this.b.rollbackTo(beforeName);
        this.error();
      } else {
        this.b.drop(beforeName);
      }
      return multiDeclaration ? N_DESTRUCTURING_DECLARATION : N_PROPERTY;
    }
    this.b.drop(beforeName);
    const accessorsAllowed = mode !== DPM_LOCAL;
    if (accessorsAllowed) {
      this.enableNewlines();
      const hasNewLineWithSemicolon = this.consumeIf(T_SEMICOLON) && this.b.newlineBefore();
      this.restoreNewlinesState();
      if (!hasNewLineWithSemicolon) {
        const collected: boolean[] = [false, false, false];
        let kind = this.parsePropertyComponent(collected);
        while (kind >= 0) {
          if (kind >= collected.length) {
            fault();
            break;
          }
          collected[kind] = true;
          kind = this.parsePropertyComponent(collected);
        }
        if (!this.atSet(this.EOL_OR_SEMICOLON_RBRACE_SET)) {
          if (this.getLastToken() !== T_SEMICOLON) {
            this.errorUntil(this.PROPERTY_ERROR_UNTIL);
          }
        } else {
          this.consumeIf(T_SEMICOLON);
        }
      }
    }
    return multiDeclaration ? N_DESTRUCTURING_DECLARATION : N_PROPERTY;
  }

  private parsePropertyDelegateOrAssignment(): boolean {
    if (this.at(T_BY_KEYWORD)) {
      this.parsePropertyDelegate();
      return true;
    } else if (this.at(T_EQ)) {
      this.advance();
      this.parseExpression();
      return true;
    }
    return false;
  }

  private parsePropertyDelegate(): void {
    const delegate = this.mark();
    this.advance();
    this.parseExpression();
    this.b.done(delegate, N_PROPERTY_DELEGATE);
  }

  parseMultiDeclarationEntry(follow: i32[], recoverySet: i32[], mode: i32): void {
    this.disableNewlines();
    const isParentheses = this.at(T_LPAR);
    const closingBrace = isParentheses ? T_RPAR : T_RBRACKET;
    this.advance();
    if (!this.atSet(follow)) {
      while (true) {
        if (this.at(T_COMMA)) {
          this.errorAndAdvance(1);
        } else if (this.at(closingBrace)) {
          this.error();
          break;
        }
        const property = this.mark();
        if (mode === MDM_FULL) {
          if (this.at(T_VAL_KEYWORD) || this.at(T_VAR_KEYWORD)) {
            this.advance();
          } else {
            this.errorWithRecovery(recoverySet);
          }
        } else if (mode === MDM_FULL_VAL_ONLY) {
          if (this.at(T_VAL_KEYWORD)) {
            this.advance();
          } else {
            this.errorWithRecovery(recoverySet);
          }
        } else {
          this.parseModifierListSimple(this.COMMA_RPAR_RBRACKET_COLON_EQ_SET);
        }
        this.expectRec(T_IDENTIFIER, recoverySet);
        if (this.at(T_COLON)) {
          this.advance();
          this.parseTypeRefRec(follow);
        }
        if (this.at(T_EQ) && closingBrace === T_RPAR) {
          this.advance();
          this.parseSimpleNameExpression();
        }
        this.b.done(property, N_DESTRUCTURING_DECLARATION_ENTRY);
        if (!this.at(T_COMMA)) {
          break;
        }
        this.advance();
        if (this.at(closingBrace)) {
          break;
        }
      }
    }
    this.expectRec(closingBrace, follow);
    this.restoreNewlinesState();
  }

  /** parsePropertyComponent; answers the kind parsed or -1. */
  private parsePropertyComponent(notAllowed: boolean[]): i32 {
    const component = this.mark();
    this.parseModifierListSimple(this.EMPTY);
    let kind = -1;
    if (this.at(T_GET_KEYWORD)) {
      kind = PC_GET;
    } else if (this.at(T_SET_KEYWORD)) {
      kind = PC_SET;
    } else if (this.at(T_FIELD_KEYWORD)) {
      kind = PC_FIELD;
    } else {
      this.b.rollbackTo(component);
      return -1;
    }
    if (kind < 0 || kind >= notAllowed.length) {
      fault();
      this.b.rollbackTo(component);
      return -1;
    }
    if (notAllowed[kind]) {
      this.b.rollbackTo(component);
      return -1;
    }
    this.advance();
    if (!this.at(T_LPAR) && kind !== PC_FIELD) {
      if (!this.atSet(this.ACCESSOR_FIRST_OR_PROPERTY_END)) {
        this.errorUntil(this.ACCESSOR_ERROR_UNTIL);
      } else {
        this.closeDeclarationWithCommentBinders(component, N_PROPERTY_ACCESSOR, true);
        return kind;
      }
    }
    this.disableNewlines();
    if (kind !== PC_FIELD) {
      const parameterList = this.mark();
      this.expectRec(T_LPAR, this.RPAR_IDENTIFIER_COLON_LBRACE_EQ_SET);
      if (kind === PC_SET) {
        const setterParameter = this.mark();
        this.parseModifierListSimple(this.COMMA_COLON_RPAR_SET);
        this.expectRec(T_IDENTIFIER, this.RPAR_COLON_LBRACE_EQ_SET);
        if (this.at(T_COLON)) {
          this.advance();
          this.parseTypeRef();
        }
        this.b.done(setterParameter, N_VALUE_PARAMETER);
        if (this.at(T_COMMA)) {
          this.advance();
        }
      }
      if (!this.at(T_RPAR)) {
        this.errorUntil(this.SETTER_RPAR_UNTIL);
      }
      if (this.at(T_RPAR)) {
        this.advance();
      }
      this.b.done(parameterList, N_VALUE_PARAMETER_LIST);
    }
    this.restoreNewlinesState();
    if (this.at(T_COLON)) {
      this.advance();
      this.parseTypeRef();
    }
    if (kind !== PC_FIELD) {
      this.parseFunctionContract();
      this.parseFunctionBody();
    } else if (this.at(T_EQ)) {
      this.advance();
      this.parseExpression();
      this.consumeIf(T_SEMICOLON);
    }
    this.closeDeclarationWithCommentBinders(component, kind === PC_FIELD ? N_BACKING_FIELD : N_PROPERTY_ACCESSOR, true);
    return kind;
  }

  // ---- Functions -------------------------------------------------------------

  /** parseFunction(failIfIdentifierExists); -1 for null. */
  parseFunction(failIfIdentifierExists: boolean): i32 {
    this.advance();
    if (this.at(T_RBRACE)) {
      this.error();
      return N_FUN;
    }
    let typeParameterListOccurred = false;
    if (this.at(T_LT)) {
      this.parseTypeParameterList(this.LBRACKET_LBRACE_RBRACE_LPAR_SET);
      typeParameterListOccurred = true;
    }
    this.b.disableJoiningComplexTokens();
    const receiverFound = this.parseReceiverType(this.FUNCTION_NAME_FOLLOW_SET);
    if (this.at(T_IDENTIFIER) && failIfIdentifierExists) {
      this.b.restoreJoiningComplexTokensState();
      return -1;
    }
    this.parseFunctionOrPropertyName(
      receiverFound,
      this.FUNCTION_NAME_FOLLOW_SET,
      this.FUNCTION_NAME_RECOVERY_SET,
      false,
    );
    this.b.restoreJoiningComplexTokensState();
    if (this.at(T_LT)) {
      const err = this.mark();
      this.parseTypeParameterList(this.LPAR_VALUE_PARAMETERS_FOLLOW_SET);
      if (typeParameterListOccurred) {
        this.b.errorMarker(err);
      } else {
        this.b.drop(err);
      }
      typeParameterListOccurred = true;
    }
    if (this.at(T_LPAR)) {
      this.parseValueParameterList(false, false, this.VALUE_PARAMETERS_FOLLOW_SET);
    } else {
      this.error();
    }
    if (this.at(T_COLON)) {
      this.advance();
      this.parseTypeRef();
    }
    const functionContractOccurred = this.parseFunctionContract();
    this.parseTypeConstraintsGuarded(typeParameterListOccurred);
    if (!functionContractOccurred) {
      this.parseFunctionContract();
    }
    if (this.at(T_SEMICOLON)) {
      this.advance();
    } else if (this.at(T_EQ) || this.at(T_LBRACE)) {
      this.parseFunctionBody();
    }
    return N_FUN;
  }

  private parseReceiverType(nameFollow: i32[]): boolean {
    const annotations = this.mark();
    const annotationsPresent = this.parseAnnotations(APM_DEFAULT);
    const lastDot = this.lastDotAfterReceiver();
    const receiverPresent = lastDot !== -1;
    if (annotationsPresent) {
      if (receiverPresent) {
        this.b.rollbackTo(annotations);
      } else {
        this.b.errorMarker(annotations);
      }
    } else {
      this.b.drop(annotations);
    }
    if (!receiverPresent) {
      return false;
    }
    // createTruncatedBuilder(lastDot).parseTypeRefWithoutIntersections()
    const saved = this.b.eofLimit;
    this.b.eofLimit = lastDot;
    this.parseTypeRefFull(this.EMPTY, false);
    this.b.eofLimit = saved;
    if (this.atSet(this.RECEIVER_TYPE_TERMINATORS)) {
      this.advance();
    } else {
      this.errorWithRecovery(nameFollow);
    }
    return true;
  }

  /** lastDotAfterReceiver: the offset of the receiver's last `.`, or -1 (matchTokenStreamPredicate). */
  private lastDotAfterReceiver(): i32 {
    const lpar = this.at(T_LPAR);
    const currentPosition = this.mark();
    let openAngle = 0;
    let openBraces = 0;
    let openParens = 0;
    let openBrackets = 0;
    const opens: i32[] = [];
    let last = -1;
    let previousLookForResult = false;
    while (!this.eof()) {
      const topLevel = openAngle === 0 && openBrackets === 0 && openBraces === 0 && openParens === 0;
      const offset = this.b.currentOffset();
      if (lpar) {
        // FirstBefore(AtSet(RECEIVER_TYPE_TERMINATORS), stopAt)
        if (topLevel && this.atSet(this.RECEIVER_TYPE_TERMINATORS)) {
          last = offset;
          break;
        }
        if (topLevel && this.atSet(this.definitelyOutOfReceiverSet)) {
          break;
        }
        if (topLevel && !this.at(T_QUEST) && !this.at(T_LPAR) && !this.at(T_RPAR)) {
          break;
        }
      } else {
        // LastBefore(AtSet(RECEIVER_TYPE_TERMINATORS), stopAt)
        const lookForResult = topLevel && this.atSet(this.RECEIVER_TYPE_TERMINATORS);
        if (lookForResult) {
          last = offset;
        }
        let stop = false;
        if (topLevel && (this.atSet(this.definitelyOutOfReceiverSet) || this.at(T_LPAR))) {
          stop = true;
        } else if (topLevel && this.at(T_IDENTIFIER)) {
          const la = this.lookahead(1);
          stop = la !== T_LT && la !== T_DOT && la !== T_SAFE_ACCESS && la !== T_QUEST;
        }
        if (stop && topLevel) {
          break;
        }
        previousLookForResult = lookForResult;
      }
      const t = this.tt();
      // Each count moves by one a token, far from either end of i32.
      if (t === T_LPAR) {
        openParens = add32(openParens, 1);
        opens.push(T_LPAR);
      } else if (t === T_LT) {
        openAngle = add32(openAngle, 1);
        opens.push(T_LT);
      } else if (t === T_LBRACE) {
        openBraces = add32(openBraces, 1);
        opens.push(T_LBRACE);
      } else if (t === T_LBRACKET) {
        openBrackets = add32(openBrackets, 1);
        opens.push(T_LBRACKET);
      } else if (t === T_RPAR) {
        openParens = sub32(openParens, 1);
        // handleUnmatchedClosing: false, whatever the popped opener.
        if (opens.length > 0) {
          opens.pop();
        }
      } else if (t === T_GT) {
        openAngle = sub32(openAngle, 1);
      } else if (t === T_RBRACE) {
        openBraces = sub32(openBraces, 1);
      } else if (t === T_RBRACKET) {
        openBrackets = sub32(openBrackets, 1);
      }
      this.advance();
    }
    if (previousLookForResult) {
      // (used only by dontStopRightAfterOccurrence, which is false here)
    }
    this.b.rollbackTo(currentPosition);
    return last;
  }

  private parseFunctionOrPropertyName(
    receiverFound: boolean,
    nameFollow: i32[],
    recoverySet: i32[],
    nameRequired: boolean,
  ): void {
    if (!nameRequired && this.atSet(nameFollow)) {
      return;
    }
    if (this.expect(T_IDENTIFIER)) {
      return;
    }
    this.errorWithRecovery(recoverySet);
  }

  private parseFunctionBody(): void {
    if (this.at(T_LBRACE)) {
      this.parseBlock();
    } else if (this.at(T_EQ)) {
      this.advance();
      this.parseExpression();
      this.consumeIf(T_SEMICOLON);
    } else {
      this.error();
    }
  }

  parseBlock(): void {
    const block = this.mark();
    this.enableNewlines();
    this.expectMsg(T_LBRACE);
    this.parseStatements(false);
    this.expectMsg(T_RBRACE);
    this.restoreNewlinesState();
    this.b.done(block, N_BLOCK);
  }

  private parseDelegationSpecifierList(): void {
    const list = this.mark();
    while (true) {
      if (this.at(T_COMMA)) {
        this.errorAndAdvance(1);
        continue;
      }
      this.parseDelegationSpecifier();
      if (!this.at(T_COMMA)) {
        break;
      }
      this.advance();
    }
    this.b.done(list, N_SUPER_TYPE_LIST);
  }

  private parseDelegationSpecifier(): void {
    const delegator = this.mark();
    const reference = this.mark();
    this.parseTypeRef();
    if (this.at(T_BY_KEYWORD)) {
      this.b.drop(reference);
      this.advance();
      // createForByClause(myBuilder, isLazy).myExpressionParsing.parseExpression()
      const saved = this.byDepth;
      this.byDepth = 0;
      this.parseExpression();
      this.byDepth = saved;
      this.b.done(delegator, N_DELEGATED_SUPER_TYPE_ENTRY);
    } else if (this.at(T_LPAR)) {
      this.b.done(reference, N_CONSTRUCTOR_CALLEE);
      this.parseValueArgumentList();
      this.b.done(delegator, N_SUPER_TYPE_CALL_ENTRY);
    } else {
      this.b.drop(reference);
      this.b.done(delegator, N_SUPER_TYPE_ENTRY);
    }
  }

  private parseTypeParameterList(recoverySet: i32[]): boolean {
    let result = false;
    if (this.at(T_LT)) {
      const list = this.mark();
      this.disableNewlines();
      this.advance();
      while (true) {
        if (this.at(T_COMMA)) {
          this.errorAndAdvance(1);
        }
        this.parseTypeParameter();
        if (!this.at(T_COMMA)) {
          break;
        }
        this.advance();
        if (this.at(T_GT)) {
          break;
        }
      }
      this.expectRec(T_GT, recoverySet);
      this.restoreNewlinesState();
      result = true;
      this.b.done(list, N_TYPE_PARAMETER_LIST);
    }
    return result;
  }

  private parseTypeConstraintsGuarded(typeParameterListOccurred: boolean): void {
    const err = this.mark();
    const constraints = this.parseTypeConstraints();
    this.errorIf(err, constraints && !typeParameterListOccurred);
  }

  private parseTypeConstraints(): boolean {
    if (this.at(T_WHERE_KEYWORD)) {
      this.parseTypeConstraintList();
      return true;
    }
    return false;
  }

  private parseTypeConstraintList(): void {
    this.advance();
    const list = this.mark();
    while (true) {
      if (this.at(T_COMMA)) {
        this.errorAndAdvance(1);
      }
      this.parseTypeConstraint();
      if (!this.at(T_COMMA)) {
        break;
      }
      this.advance();
    }
    this.b.done(list, N_TYPE_CONSTRAINT_LIST);
  }

  private parseTypeConstraint(): void {
    const constraint = this.mark();
    this.parseAnnotations(APM_DEFAULT);
    const reference = this.mark();
    if (this.expectRec(T_IDENTIFIER, this.COLON_COMMA_LBRACE_RBRACE_TYPE_REF_FIRST_SET)) {
      this.b.done(reference, N_REFERENCE_EXPRESSION);
    } else {
      this.b.drop(reference);
    }
    this.expectRec(T_COLON, this.LBRACE_RBRACE_TYPE_REF_FIRST_SET);
    this.parseTypeRef();
    this.b.done(constraint, N_TYPE_CONSTRAINT);
  }

  private parseFunctionContract(): boolean {
    if (this.at(T_CONTRACT_KEYWORD)) {
      this.parseContractDescriptionBlock();
      return true;
    }
    return false;
  }

  private parseTypeParameter(): void {
    if (this.atSet(this.TYPE_PARAMETER_GT_RECOVERY_SET)) {
      this.error();
      return;
    }
    const m = this.mark();
    this.parseModifierListSimple(this.GT_COMMA_COLON_SET);
    this.expectRec(T_IDENTIFIER, this.EMPTY);
    if (this.at(T_COLON)) {
      this.advance();
      this.parseTypeRef();
    }
    this.b.done(m, N_TYPE_PARAMETER);
  }

  // ---- Types -----------------------------------------------------------------

  parseTypeRef(): void {
    this.parseTypeRefFull(this.EMPTY, true);
  }

  parseTypeRefRec(extraRecoverySet: i32[]): void {
    this.parseTypeRefFull(extraRecoverySet, true);
  }

  parseTypeRefWithoutIntersections(): void {
    this.parseTypeRefFull(this.EMPTY, false);
  }

  private parseTypeRefFull(extraRecoverySet: i32[], allowSimpleIntersectionTypes: boolean): void {
    const m = this.parseTypeRefContents(extraRecoverySet, allowSimpleIntersectionTypes);
    this.b.done(m, N_TYPE_REFERENCE);
  }

  private parseTypeRefContents(extraRecoverySet: i32[], allowSimpleIntersectionTypes: boolean): i32 {
    const typeRefMarker = this.mark();
    this.parseTypeModifierList();
    const la = this.lookahead(1);
    const la2 = this.lookahead(2);
    let typeBeforeDot = true;
    const withContextReceiver = this.at(T_CONTEXT_KEYWORD) && la === T_LPAR;
    let wasFunctionTypeParsed = false;
    const contextReceiversStart = this.mark();
    if (withContextReceiver) {
      this.parseContextParameterOrReceiverList(true);
    }
    let typeElementMarker = this.mark();
    if (this.at(T_IDENTIFIER) && !(la === T_DOT && la2 === T_IDENTIFIER) && la !== T_LT && this.at(T_DYNAMIC_KEYWORD)) {
      const dynamicType = this.mark();
      this.advance();
      this.b.done(dynamicType, N_DYNAMIC_TYPE);
    } else if (this.at(T_IDENTIFIER) || this.at(T_PACKAGE_KEYWORD) || this.atParenthesizedMutableForPlatformTypes(0)) {
      this.parseUserType();
    } else if (this.at(T_LPAR)) {
      const functionOrParenthesizedType = this.mark();
      this.advance();
      this.b.drop(this.parseTypeRefContents(this.EMPTY, true));
      if (this.at(T_RPAR) && this.lookahead(1) !== T_ARROW) {
        this.advance();
        this.b.drop(functionOrParenthesizedType);
      } else {
        this.b.rollbackTo(functionOrParenthesizedType);
        this.parseFunctionType(this.b.precede(contextReceiversStart));
        wasFunctionTypeParsed = true;
      }
    } else {
      this.errorWithRecovery(tsOr(this.TYPE_RECOVERY, extraRecoverySet));
      typeBeforeDot = false;
    }
    this.b.disableJoiningComplexTokens();
    typeElementMarker = this.parseNullableTypeSuffix(typeElementMarker);
    this.b.restoreJoiningComplexTokensState();
    let wasIntersection = false;
    if (allowSimpleIntersectionTypes && this.at(T_AND)) {
      const leftTypeRef = typeElementMarker;
      typeElementMarker = this.b.precede(typeElementMarker);
      const intersectionType = this.b.precede(leftTypeRef);
      this.b.done(leftTypeRef, N_TYPE_REFERENCE);
      this.advance();
      this.parseTypeRefFull(extraRecoverySet, true);
      this.b.done(intersectionType, N_INTERSECTION_TYPE);
      wasIntersection = true;
    }
    if (typeBeforeDot && this.at(T_DOT) && !wasIntersection && !wasFunctionTypeParsed) {
      const functionType = this.b.precede(contextReceiversStart);
      const receiverTypeRef = this.b.precede(typeElementMarker);
      const receiverType = this.b.precede(receiverTypeRef);
      this.b.done(receiverTypeRef, N_TYPE_REFERENCE);
      this.b.done(receiverType, N_FUNCTION_TYPE_RECEIVER);
      this.advance();
      if (this.at(T_LPAR)) {
        this.parseFunctionType(functionType);
      } else {
        this.b.drop(functionType);
        this.error();
      }
      wasFunctionTypeParsed = true;
    }
    if (withContextReceiver && !wasFunctionTypeParsed) {
      this.errorWithRecovery(tsOr(this.TYPE_RECOVERY, extraRecoverySet));
    }
    this.b.drop(typeElementMarker);
    this.b.drop(contextReceiversStart);
    return typeRefMarker;
  }

  private parseNullableTypeSuffix(typeElementMarker0: i32): i32 {
    let typeElementMarker = typeElementMarker0;
    while (this.at(T_QUEST) && this.b.rawLookup(1) !== T_COLON) {
      const precede = this.b.precede(typeElementMarker);
      this.advance();
      this.b.done(typeElementMarker, N_NULLABLE_TYPE);
      typeElementMarker = precede;
    }
    return typeElementMarker;
  }

  private parseUserType(): void {
    let userType = this.mark();
    if (this.at(T_PACKAGE_KEYWORD)) {
      const keyword = this.mark();
      this.advance();
      this.b.errorMarker(keyword);
      this.expectRec(T_DOT, this.TYPE_ARG_SET_STOP);
    }
    let reference = this.mark();
    while (true) {
      this.recoverOnParenthesizedWordForPlatformTypes(0, "Mutable", true);
      if (this.expectRec(T_IDENTIFIER, this.USER_TYPE_NAME_RECOVERY_SET)) {
        this.b.done(reference, N_REFERENCE_EXPRESSION);
      } else {
        this.b.drop(reference);
        break;
      }
      this.parseTypeArgumentList();
      this.recoverOnPlatformTypeSuffix();
      if (!this.at(T_DOT)) {
        break;
      }
      if (this.lookahead(1) === T_LPAR && !this.atParenthesizedMutableForPlatformTypes(1)) {
        break;
      }
      const precede = this.b.precede(userType);
      this.b.done(userType, N_USER_TYPE);
      userType = precede;
      this.advance();
      reference = this.mark();
    }
    this.b.done(userType, N_USER_TYPE);
  }

  private atParenthesizedMutableForPlatformTypes(offset: i32): boolean {
    return this.recoverOnParenthesizedWordForPlatformTypes(offset, "Mutable", false);
  }

  private recoverOnParenthesizedWordForPlatformTypes(offset: i32, word: string, consume: boolean): boolean {
    if (
      this.lookahead(offset) === T_LPAR &&
      this.lookahead(offset + 1) === T_IDENTIFIER &&
      this.lookahead(offset + 2) === T_RPAR &&
      this.lookahead(offset + 3) === T_IDENTIFIER
    ) {
      const err = this.mark();
      this.advanceN(offset);
      this.advance();
      if (!this.b.tokenIs(word)) {
        this.b.rollbackTo(err);
        return false;
      }
      this.advance();
      this.advance();
      if (consume) {
        this.b.errorMarker(err);
      } else {
        this.b.rollbackTo(err);
      }
      return true;
    }
    return false;
  }

  private recoverOnPlatformTypeSuffix(): void {
    if (this.at(T_EXCL)) {
      const err = this.mark();
      this.advance();
      this.b.errorMarker(err);
    }
  }

  private parseTypeArgumentList(): void {
    if (!this.at(T_LT)) {
      return;
    }
    const list = this.mark();
    this.tryParseTypeArgumentList(this.EMPTY);
    this.b.done(list, N_TYPE_ARGUMENT_LIST);
  }

  tryParseTypeArgumentList(extraRecoverySet: i32[]): boolean {
    this.disableNewlines();
    this.advance();
    while (true) {
      const projection = this.mark();
      this.recoverOnParenthesizedWordForPlatformTypes(0, "out", true);
      this.parseTypeArgumentModifierList();
      if (this.at(T_MUL)) {
        this.advance();
      } else {
        this.parseTypeRefRec(extraRecoverySet);
      }
      this.b.done(projection, N_TYPE_PROJECTION);
      if (!this.at(T_COMMA)) {
        break;
      }
      this.advance();
      if (this.at(T_GT)) {
        break;
      }
    }
    const atGT = this.at(T_GT);
    if (!atGT) {
      this.error();
    } else {
      this.advance();
    }
    this.restoreNewlinesState();
    return atGT;
  }

  private parseFunctionType(functionType: i32): void {
    this.parseValueParameterList(true, true, this.EMPTY);
    this.expectRec(T_ARROW, this.TYPE_REF_FIRST);
    this.parseTypeRef();
    this.b.done(functionType, N_FUNCTION_TYPE);
  }

  // ---- Value parameters ------------------------------------------------------

  private parseValueParameterList(isFunctionTypeContents: boolean, typeRequired: boolean, recoverySet: i32[]): void {
    const parameters = this.mark();
    this.disableNewlines();
    this.valueParameterLoop(isFunctionTypeContents, recoverySet, 1, isFunctionTypeContents, typeRequired);
    this.restoreNewlinesState();
    this.b.done(parameters, N_VALUE_PARAMETER_LIST);
  }

  /**
   * valueParameterLoop; `which` picks the parameter parser: 0 a context
   * parameter or type (inFunctionType = a), 1 a value parameter list entry
   * (isFunctionTypeContents = a, typeRequired = c).
   */
  private valueParameterLoop(
    inFunctionTypeContext: boolean,
    recoverySet: i32[],
    which: i32,
    a: boolean,
    c: boolean,
  ): boolean {
    this.advance();
    let noError = true;
    if (!this.at(T_RPAR) && !this.atSet(recoverySet)) {
      while (true) {
        const offsetBefore = this.b.currentOffset();
        if (this.at(T_RPAR)) {
          break;
        }
        let ok = true;
        if (which === 0) {
          ok = this.parseValueParameterOrTypeRef(a);
        } else {
          if (a) {
            if (!this.tryParseValueParameter(c)) {
              const valueParameter = this.mark();
              this.parseFunctionTypeValueParameterModifierList();
              this.parseTypeRef();
              this.closeDeclarationWithCommentBinders(valueParameter, N_VALUE_PARAMETER, false);
            }
          } else {
            this.parseValueParameter(c);
          }
        }
        noError = ok && noError;
        if (this.at(T_COMMA)) {
          this.advance();
        } else if (this.at(T_COLON)) {
          continue;
        } else {
          if (!this.at(T_RPAR)) {
            this.error();
            noError = false;
          }
          if (!this.atSet(inFunctionTypeContext ? this.LAMBDA_VALUE_PARAMETER_FIRST : this.VALUE_PARAMETER_FIRST)) {
            break;
          }
          if (offsetBefore === this.b.currentOffset()) {
            break;
          }
        }
      }
    }
    return this.expectRec(T_RPAR, recoverySet) && noError;
  }

  private tryParseValueParameter(typeRequired: boolean): boolean {
    return this.parseValueParameterFull(true, typeRequired);
  }

  parseValueParameter(typeRequired: boolean): void {
    this.parseValueParameterFull(false, typeRequired);
  }

  private parseValueParameterFull(rollbackOnFailure: boolean, typeRequired: boolean): boolean {
    const parameter = this.mark();
    this.parseModifierListSimple(this.NO_MODIFIER_BEFORE_FOR_VALUE_PARAMETER);
    if (this.at(T_VAR_KEYWORD) || this.at(T_VAL_KEYWORD)) {
      this.advance();
    }
    if (!this.parseFunctionParameterRest(typeRequired) && rollbackOnFailure) {
      this.b.rollbackTo(parameter);
      return false;
    }
    this.closeDeclarationWithCommentBinders(parameter, N_VALUE_PARAMETER, false);
    return true;
  }

  private parseFunctionParameterRest(typeRequired: boolean): boolean {
    let noErrors = true;
    if (this.at(T_COMMA) || this.at(T_RPAR)) {
      this.error();
      noErrors = false;
    } else if (this.at(T_IDENTIFIER) && this.lookahead(1) === T_LT) {
      this.error();
      noErrors = false;
      this.parseTypeRef();
    } else if (this.at(T_COLON)) {
      this.error();
      this.advance();
      this.parseTypeRef();
    } else {
      this.expectRec(T_IDENTIFIER, this.PARAMETER_NAME_RECOVERY_SET);
      if (this.at(T_COLON)) {
        this.advance();
        if (this.at(T_IDENTIFIER) && this.lookahead(1) === T_COLON) {
          this.error();
          return false;
        }
        this.parseTypeRef();
      } else if (typeRequired) {
        this.errorWithRecovery(this.PARAMETER_NAME_RECOVERY_SET);
        noErrors = false;
      }
    }
    if (this.at(T_EQ)) {
      this.advance();
      this.parseExpression();
    }
    return noErrors;
  }

  // ---- KotlinExpressionParsing -----------------------------------------------

  parseExpression(): void {
    if (!this.atSet(this.EXPRESSION_FIRST)) {
      this.error();
      return;
    }
    this.parseBinaryExpression(PR_ASSIGNMENT);
  }

  /** The precedence of a binary operation token (soft keywords as INFIX), or -1. */
  private precedenceOf(t: i32): i32 {
    switch (t) {
      case T_AS_KEYWORD:
      case T_AS_SAFE:
        return PR_AS;
      case T_MUL:
      case T_DIV:
      case T_PERC:
        return PR_MULTIPLICATIVE;
      case T_PLUS:
      case T_MINUS:
        return PR_ADDITIVE;
      case T_RANGE:
      case T_RANGE_UNTIL:
        return PR_RANGE;
      case T_IDENTIFIER:
        return PR_INFIX;
      case T_ELVIS:
        return PR_ELVIS;
      case T_IN_KEYWORD:
      case T_NOT_IN:
      case T_IS_KEYWORD:
      case T_NOT_IS:
        return PR_IN_OR_IS;
      case T_LT:
      case T_GT:
      case T_LTEQ:
      case T_GTEQ:
        return PR_COMPARISON;
      case T_EQEQ:
      case T_EXCLEQ:
      case T_EQEQEQ:
      case T_EXCLEQEQEQ:
        return PR_EQUALITY;
      case T_ANDAND:
        return PR_CONJUNCTION;
      case T_OROR:
        return PR_DISJUNCTION;
      case T_EQ:
      case T_PLUSEQ:
      case T_MINUSEQ:
      case T_MULTEQ:
      case T_DIVEQ:
      case T_PERCEQ:
        return PR_ASSIGNMENT;
      default:
        return t >= 0 && ktIsSoft(t) ? PR_INFIX : -1;
    }
  }

  private parseBinaryExpression(maxPrecedence: i32): i32 {
    let expression = this.mark();
    this.parsePrefixExpression();
    let minPrecedence = PR_AS;
    while (!this.interruptedWithNewLine()) {
      const token = this.tt();
      if (token < 0 || token >= T_WHITE_SPACE) {
        break;
      }
      const next = this.precedenceOf(token);
      if (next < 0 || next > maxPrecedence || next < minPrecedence) {
        break;
      }
      if (next === PR_INFIX && ktIsSoft(token)) {
        this.b.remapCurrentToken(T_IDENTIFIER);
      }
      this.parseOperationReference();
      let resultType = N_BINARY_EXPRESSION;
      if (token === T_AS_KEYWORD || token === T_AS_SAFE) {
        this.parseTypeRefWithoutIntersections();
        minPrecedence = PR_AS;
        resultType = N_BINARY_WITH_TYPE;
      } else if (token === T_IS_KEYWORD || token === T_NOT_IS) {
        this.parseTypeRefWithoutIntersections();
        minPrecedence = PR_IN_OR_IS;
        resultType = N_IS_EXPRESSION;
      } else {
        // getHigherPriority: one ordinal down (AS has none).
        minPrecedence = this.parseBinaryExpression(next - 1);
        resultType = N_BINARY_EXPRESSION;
      }
      this.b.done(expression, resultType);
      expression = this.b.precede(expression);
    }
    this.b.drop(expression);
    return minPrecedence;
  }

  private parseLabeledExpression(): void {
    const expression = this.mark();
    this.parseLabelDefinition();
    this.parsePrefixExpression();
    this.b.done(expression, N_LABELED_EXPRESSION);
  }

  private parsePrefixExpression(): void {
    if (this.at(T_AT)) {
      if (!this.parseLocalDeclaration(false, false)) {
        const expression = this.mark();
        this.parseAnnotations(APM_DEFAULT);
        this.parsePrefixExpression();
        this.b.done(expression, N_ANNOTATED_EXPRESSION);
      }
    } else {
      this.b.disableJoiningComplexTokens();
      if (this.isAtLabelDefinitionOrMissingIdentifier()) {
        this.b.restoreJoiningComplexTokensState();
        this.parseLabeledExpression();
      } else if (this.atSet(this.PREFIX_OPERATIONS)) {
        const expression = this.mark();
        this.parseOperationReference();
        this.b.restoreJoiningComplexTokensState();
        this.parsePrefixExpression();
        this.b.done(expression, N_PREFIX_EXPRESSION);
      } else {
        this.b.restoreJoiningComplexTokensState();
        this.parsePostfixExpression();
      }
    }
  }

  private parseDoubleColonSuffix(expression: i32): boolean {
    if (!this.at(T_COLONCOLON)) {
      return false;
    }
    this.advance();
    if (this.at(T_CLASS_KEYWORD)) {
      this.advance();
      this.b.done(expression, N_CLASS_LITERAL_EXPRESSION);
      return true;
    }
    this.parseSimpleNameExpression();
    if (this.at(T_LT)) {
      const typeArgumentList = this.mark();
      if (this.tryParseTypeArgumentList(this.TYPE_ARGUMENT_LIST_STOPPERS)) {
        this.b.errorMarker(typeArgumentList);
      } else {
        this.b.rollbackTo(typeArgumentList);
      }
    }
    if (this.at(T_LPAR) && !this.b.newlineBefore()) {
      const lpar = this.mark();
      this.parseCallSuffix();
      this.b.errorMarker(lpar);
    }
    this.b.done(expression, N_CALLABLE_REFERENCE_EXPRESSION);
    return true;
  }

  private skipQuestionMarksBeforeDoubleColon(): void {
    if (this.at(T_QUEST)) {
      let k = 1;
      while (this.lookahead(k) === T_QUEST) {
        // One a token, so below 2^30.
        if (k >= 1073741823) {
          fault();
          return;
        }
        k++;
      }

      if (this.lookahead(k) === T_COLONCOLON) {
        while (k > 0) {
          this.advance();
          k--;
        }
      }
    }
  }

  private parsePostfixExpression(): void {
    let expression = this.mark();
    let firstExpressionParsed = this.at(T_COLONCOLON)
      ? this.parseDoubleColonSuffix(this.mark())
      : this.parseAtomicExpression();
    while (true) {
      if (this.interruptedWithNewLine()) {
        break;
      } else if (this.at(T_LBRACKET)) {
        this.parseArrayAccess();
        this.b.done(expression, N_ARRAY_ACCESS_EXPRESSION);
      } else if (this.parseCallSuffix()) {
        this.b.done(expression, N_CALL_EXPRESSION);
      } else if (this.at(T_DOT) || this.at(T_SAFE_ACCESS)) {
        const expressionType = this.at(T_DOT) ? N_DOT_QUALIFIED_EXPRESSION : N_SAFE_ACCESS_EXPRESSION;
        this.advance();
        if (!firstExpressionParsed) {
          this.b.drop(expression);
          expression = this.mark();
          firstExpressionParsed = this.parseAtomicExpression();
          continue;
        }
        this.parseSelectorCallExpression();
        this.b.done(expression, expressionType);
      } else if (this.atSet(this.POSTFIX_OPERATIONS)) {
        this.parseOperationReference();
        this.b.done(expression, N_POSTFIX_EXPRESSION);
      } else {
        this.skipQuestionMarksBeforeDoubleColon();
        if (!this.parseDoubleColonSuffix(expression)) {
          break;
        }
      }
      expression = this.b.precede(expression);
    }
    this.b.drop(expression);
  }

  private parseCallSuffix(): boolean {
    if (this.parseCallWithClosure()) {
      // a trailing lambda
    } else if (this.at(T_LPAR)) {
      this.parseValueArgumentList();
      this.parseCallWithClosure();
    } else if (this.at(T_LT)) {
      const typeArgumentList = this.mark();
      if (this.tryParseTypeArgumentList(this.TYPE_ARGUMENT_LIST_STOPPERS)) {
        this.b.done(typeArgumentList, N_TYPE_ARGUMENT_LIST);
        if (!this.b.newlineBefore() && this.at(T_LPAR)) {
          this.parseValueArgumentList();
        }
        this.parseCallWithClosure();
      } else {
        this.b.rollbackTo(typeArgumentList);
        return false;
      }
    } else {
      return false;
    }
    return true;
  }

  private parseSelectorCallExpression(): void {
    const m = this.mark();
    this.parseAtomicExpression();
    if (!this.b.newlineBefore() && this.parseCallSuffix()) {
      this.b.done(m, N_CALL_EXPRESSION);
    } else {
      this.b.drop(m);
    }
  }

  private parseOperationReference(): void {
    const m = this.mark();
    this.advance();
    this.b.done(m, N_OPERATION_REFERENCE);
  }

  private parseCallWithClosure(): boolean {
    if (this.byDepth === 0) {
      // A `by` clause at its top level: `{` starts the class body.
      return false;
    }
    let success = false;
    while (true) {
      const argument = this.mark();
      if (!this.parseAnnotatedLambda(false)) {
        this.b.drop(argument);
        break;
      }
      this.b.done(argument, N_LAMBDA_ARGUMENT);
      success = true;
    }
    return success;
  }

  private parseAnnotatedLambda(preferBlock: boolean): boolean {
    const annotated = this.mark();
    const wereAnnotations = this.parseAnnotations(APM_DEFAULT);
    const labeled = this.mark();
    const wasLabel = this.isAtLabelDefinitionOrMissingIdentifier();
    if (wasLabel) {
      this.parseLabelDefinition();
    }
    if (!this.at(T_LBRACE)) {
      this.b.rollbackTo(annotated);
      return false;
    }
    this.parseFunctionLiteral(preferBlock);
    if (wasLabel) {
      this.b.done(labeled, N_LABELED_EXPRESSION);
    } else {
      this.b.drop(labeled);
    }
    if (wereAnnotations) {
      this.b.done(annotated, N_ANNOTATED_EXPRESSION);
    } else {
      this.b.drop(annotated);
    }
    return true;
  }

  isAtLabelDefinitionOrMissingIdentifier(): boolean {
    return (this.at(T_IDENTIFIER) && this.b.rawLookup(1) === T_AT) || this.at(T_AT);
  }

  private parseAtomicExpression(): boolean {
    let ok = true;
    const t = this.tt();
    switch (t) {
      case T_LPAR:
        this.parseParenthesizedExpression();
        break;
      case T_LBRACKET:
        this.parseAsCollectionLiteralExpression(N_COLLECTION_LITERAL_EXPRESSION, true);
        break;
      case T_THIS_KEYWORD:
        this.parseThisExpression();
        break;
      case T_SUPER_KEYWORD:
        this.parseSuperExpression();
        break;
      case T_OBJECT_KEYWORD:
        this.parseObjectLiteral();
        break;
      case T_THROW_KEYWORD:
        this.parseThrow();
        break;
      case T_RETURN_KEYWORD:
        this.parseReturn();
        break;
      case T_CONTINUE_KEYWORD:
        this.parseJump(N_CONTINUE);
        break;
      case T_BREAK_KEYWORD:
        this.parseJump(N_BREAK);
        break;
      case T_IF_KEYWORD:
        this.parseIf();
        break;
      case T_WHEN_KEYWORD:
        this.parseWhen();
        break;
      case T_TRY_KEYWORD:
        this.parseTry();
        break;
      case T_FOR_KEYWORD:
        this.parseFor();
        break;
      case T_WHILE_KEYWORD:
        this.parseWhile();
        break;
      case T_DO_KEYWORD:
        this.parseDoWhile();
        break;
      case T_IDENTIFIER:
        if (this.at(T_CONTEXT_KEYWORD) && this.lookahead(1) === T_LPAR) {
          if (this.parseLocalDeclaration(true, false)) {
            break;
          } else {
            this.at(T_IDENTIFIER);
          }
        }
        this.parseSimpleNameExpression();
        break;
      case T_LBRACE:
        this.parseFunctionLiteral(false);
        break;
      case T_INTERPOLATION_PREFIX:
      case T_OPEN_QUOTE:
        this.parseStringTemplate();
        break;
      case T_TRUE_KEYWORD:
      case T_FALSE_KEYWORD:
        this.parseOneTokenExpression(N_BOOLEAN_CONSTANT);
        break;
      case T_INTEGER_LITERAL:
        this.parseOneTokenExpression(N_INTEGER_CONSTANT);
        break;
      case T_CHARACTER_LITERAL:
        this.parseOneTokenExpression(N_CHARACTER_CONSTANT);
        break;
      case T_FLOAT_LITERAL:
        this.parseOneTokenExpression(N_FLOAT_CONSTANT);
        break;
      case T_NULL_KEYWORD:
        this.parseOneTokenExpression(N_NULL);
        break;
      case T_CLASS_KEYWORD:
      case T_INTERFACE_KEYWORD:
      case T_FUN_KEYWORD:
      case T_VAL_KEYWORD:
      case T_VAR_KEYWORD:
      case T_TYPE_ALIAS_KEYWORD:
        if (!this.parseLocalDeclaration(this.b.newlineBefore(), false)) {
          ok = false;
        }
        break;
      default:
        ok = false;
    }
    if (!ok) {
      this.errorWithRecovery(this.EXPECTING_ELEMENT_RECOVERY);
    }
    return ok;
  }

  private parseStringTemplate(): void {
    const template = this.mark();
    if (this.at(T_INTERPOLATION_PREFIX)) {
      const m = this.mark();
      this.advance();
      this.b.done(m, N_STRING_INTERPOLATION_PREFIX);
    }
    this.advance();
    while (!this.eof()) {
      if (this.at(T_CLOSING_QUOTE) || this.at(T_DANGLING_NEWLINE)) {
        break;
      }
      this.parseStringTemplateElement();
    }
    if (this.at(T_DANGLING_NEWLINE)) {
      this.errorAndAdvance(1);
    } else {
      this.expectMsg(T_CLOSING_QUOTE);
    }
    this.b.done(template, N_STRING_TEMPLATE);
  }

  private parseStringTemplateElement(): void {
    if (this.at(T_REGULAR_STRING_PART)) {
      const m = this.mark();
      this.advance();
      this.b.done(m, N_LITERAL_STRING_TEMPLATE_ENTRY);
    } else if (this.at(T_ESCAPE_SEQUENCE)) {
      const m = this.mark();
      this.advance();
      this.b.done(m, N_ESCAPE_STRING_TEMPLATE_ENTRY);
    } else if (this.at(T_SHORT_TEMPLATE_ENTRY_START)) {
      const entry = this.mark();
      this.advance();
      if (this.at(T_THIS_KEYWORD)) {
        const thisExpression = this.mark();
        const reference = this.mark();
        this.advance();
        this.b.done(reference, N_REFERENCE_EXPRESSION);
        this.b.done(thisExpression, N_THIS_EXPRESSION);
      } else {
        const kw = this.hardKeywordOfText();
        if (kw >= 0) {
          this.b.remapCurrentToken(kw);
          this.errorAndAdvance(1);
        } else {
          const reference = this.mark();
          this.expectMsg(T_IDENTIFIER);
          this.b.done(reference, N_REFERENCE_EXPRESSION);
        }
      }
      this.b.done(entry, N_SHORT_STRING_TEMPLATE_ENTRY);
    } else if (this.at(T_LONG_TEMPLATE_ENTRY_START)) {
      const longTemplateEntry = this.mark();
      this.advance();
      while (!this.eof()) {
        const offset = this.b.currentOffset();
        this.parseExpression();
        if (this._at(T_LONG_TEMPLATE_ENTRY_END)) {
          this.advance();
          break;
        } else {
          this.error();
          if (offset === this.b.currentOffset()) {
            this.advance();
          }
        }
      }
      this.b.done(longTemplateEntry, N_LONG_STRING_TEMPLATE_ENTRY);
    } else {
      this.errorAndAdvance(1);
    }
  }

  /** KEYWORD_TEXTS.get(tokenText): a hard keyword spelled by the current token, or -1. */
  private hardKeywordOfText(): i32 {
    for (let t = 0; t < 149; t++) {
      if (tsHas(this.KEYWORDS, t)) {
        const s = ktKeywordText(t);
        if (this.b.tokenIs(s)) {
          return t;
        }
      }
    }
    return -1;
  }

  private parseWhen(): void {
    const when = this.mark();
    this.advance();
    this.disableNewlines();
    if (this.at(T_LPAR)) {
      this.advance();
      const atWhenStart = this.mark();
      this.parseAnnotationsList(this.EQ_RPAR_SET);
      if (this.at(T_VAL_KEYWORD) || this.at(T_VAR_KEYWORD)) {
        const declType = this.parseProperty(DPM_LOCAL);
        this.b.done(atWhenStart, declType);
        this.b.setBinders(atWhenStart, B_PRECEDING_DOC_COMMENTS, B_TRAILING_COMMENTS);
      } else {
        this.b.rollbackTo(atWhenStart);
        this.parseExpression();
      }
      this.expectMsg(T_RPAR);
    }
    this.restoreNewlinesState();
    this.enableNewlines();
    if (this.expectMsg(T_LBRACE)) {
      while (!this.eof() && !this.at(T_RBRACE)) {
        this.parseWhenEntry();
      }
      this.expectMsg(T_RBRACE);
    }
    this.restoreNewlinesState();
    this.b.done(when, N_WHEN);
  }

  private parseWhenEntry(): void {
    const entry = this.mark();
    if (this.at(T_ELSE_KEYWORD)) {
      this.advance();
      this.parseWhenEntryGuardOrSuggest();
      if (!this.at(T_ARROW)) {
        this.errorUntil(this.WHEN_ARROW_RECOVERY);
      }
      if (this.at(T_ARROW)) {
        this.advance();
        if (this.atSet(this.WHEN_CONDITION_RECOVERY_SET)) {
          this.error();
        } else {
          this.parseControlStructureBody();
        }
      } else if (this.at(T_LBRACE)) {
        this.parseControlStructureBody();
      } else if (!this.atSet(this.WHEN_CONDITION_RECOVERY_SET)) {
        this.errorAndAdvance(1);
      }
    } else {
      this.parseWhenEntryNotElse();
    }
    this.b.done(entry, N_WHEN_ENTRY);
    this.consumeIf(T_SEMICOLON);
  }

  private parseWhenEntryNotElse(): void {
    while (true) {
      while (this.at(T_COMMA)) {
        this.errorAndAdvance(1);
      }
      this.parseWhenCondition();
      if (!this.at(T_COMMA)) {
        break;
      }
      this.advance();
      if (this.at(T_ARROW)) {
        break;
      }
    }
    this.parseWhenEntryGuardOrSuggest();
    this.expectRec(T_ARROW, this.WHEN_CONDITION_RECOVERY_SET);
    if (this.atSet(this.WHEN_CONDITION_RECOVERY_SET)) {
      this.error();
    } else {
      this.parseControlStructureBody();
    }
  }

  private parseWhenCondition(): void {
    const condition = this.mark();
    this.disableNewlines();
    const t = this.tt();
    if (t === T_IN_KEYWORD || t === T_NOT_IN) {
      const m = this.mark();
      this.advance();
      this.b.done(m, N_OPERATION_REFERENCE);
      if (this.atSet(this.WHEN_CONDITION_RECOVERY_SET_WITH_ARROW)) {
        this.error();
      } else {
        this.parseExpression();
      }
      this.b.done(condition, N_WHEN_CONDITION_IN_RANGE);
    } else if (t === T_IS_KEYWORD || t === T_NOT_IS) {
      this.advance();
      if (this.atSet(this.WHEN_CONDITION_RECOVERY_SET_WITH_ARROW)) {
        this.error();
      } else {
        this.parseTypeRef();
      }
      this.b.done(condition, N_WHEN_CONDITION_IS_PATTERN);
    } else if (t === T_RBRACE || t === T_ELSE_KEYWORD || t === T_ARROW || t === T_DOT) {
      this.error();
      this.b.done(condition, N_WHEN_CONDITION_EXPRESSION);
    } else {
      this.parseExpression();
      this.b.done(condition, N_WHEN_CONDITION_EXPRESSION);
    }
    this.restoreNewlinesState();
  }

  private parseWhenEntryGuardOrSuggest(): void {
    if (this.at(T_ANDAND)) {
      this.errorUntil(this.ANDAND_UNTIL);
    } else if (this.at(T_IF_KEYWORD)) {
      const guard = this.mark();
      this.advance();
      this.parseExpression();
      this.b.done(guard, N_WHEN_ENTRY_GUARD);
    }
  }

  private parseArrayAccess(): void {
    this.parseAsCollectionLiteralExpression(N_INDICES, false);
  }

  private parseAsCollectionLiteralExpression(nodeType: i32, canBeEmpty: boolean): void {
    const inner = this.mark();
    this.disableNewlines();
    this.advance();
    if (!canBeEmpty && this.at(T_RBRACKET)) {
      this.error();
    } else {
      while (true) {
        if (this.at(T_RBRACKET)) {
          break;
        }
        this.parseExpression();
        if (!this.at(T_COMMA)) {
          break;
        }
        this.advance();
      }
    }
    this.expectMsg(T_RBRACKET);
    this.restoreNewlinesState();
    this.b.done(inner, nodeType);
  }

  parseContractDescriptionBlock(): void {
    this.advance();
    const block = this.mark();
    this.expectMsg(T_LBRACKET);
    this.enableNewlines();
    while (true) {
      if (this.at(T_COMMA)) {
        this.errorAndAdvance(1);
      }
      if (this.at(T_RBRACKET)) {
        break;
      }
      const effect = this.mark();
      this.parseExpression();
      this.b.done(effect, N_CONTRACT_EFFECT);
      if (!this.at(T_COMMA)) {
        break;
      }
      this.advance();
    }
    this.expectMsg(T_RBRACKET);
    this.restoreNewlinesState();
    this.b.done(block, N_CONTRACT_EFFECT_LIST);
  }

  parseSimpleNameExpression(): void {
    const simpleName = this.mark();
    this.expectMsg(T_IDENTIFIER);
    this.b.done(simpleName, N_REFERENCE_EXPRESSION);
  }

  private parseLocalDeclaration(rollbackIfDefinitelyNotExpression: boolean, isScriptTopLevel: boolean): boolean {
    const decl = this.mark();
    const detector = new ModDetector();
    this.parseModifierList(detector, this.EMPTY, true);
    const declType = this.parseLocalDeclarationRest(detector, rollbackIfDefinitelyNotExpression, isScriptTopLevel);
    if (declType >= 0) {
      this.closeDeclarationWithCommentBinders(
        decl,
        declType,
        declType !== N_PROPERTY && declType !== N_DESTRUCTURING_DECLARATION,
      );
      return true;
    }
    this.b.rollbackTo(decl);
    return false;
  }

  parseFunctionLiteral(preferBlock: boolean): void {
    const literalExpression = this.mark();
    const literal = this.mark();
    this.enableNewlines();
    this.advance();
    let paramsFound = false;
    const token = this.tt();
    if (token === T_ARROW) {
      this.b.done(this.mark(), N_VALUE_PARAMETER_LIST);
      this.advance();
      paramsFound = true;
    } else if (token === T_IDENTIFIER || token === T_COLON || token === T_LPAR || token === T_LBRACKET) {
      const rollbackMarker = this.mark();
      const nextToken = this.lookahead(1);
      const preferParamsToExpressions = nextToken === T_COMMA || nextToken === T_COLON;
      this.parseFunctionLiteralParameterList();
      if (preferParamsToExpressions) {
        // rollbackOrDrop(rollbackMarker, ARROW, "An -> is expected", RBRACE)
        if (this.at(T_ARROW)) {
          this.advance();
          this.b.drop(rollbackMarker);
          paramsFound = true;
        } else if (this.at(T_RBRACE)) {
          this.b.drop(rollbackMarker);
          this.expectMsg(T_ARROW);
          paramsFound = true;
        } else {
          this.b.rollbackTo(rollbackMarker);
          paramsFound = false;
        }
      } else {
        // rollbackOrDropAt(rollbackMarker, ARROW)
        if (this.at(T_ARROW)) {
          this.advance();
          this.b.drop(rollbackMarker);
          paramsFound = true;
        } else {
          this.b.rollbackTo(rollbackMarker);
          paramsFound = false;
        }
      }
    }
    if (!paramsFound && preferBlock) {
      this.b.drop(literal);
      this.parseStatements(false);
      this.expectMsg(T_RBRACE);
      this.b.done(literalExpression, N_BLOCK);
      this.restoreNewlinesState();
      return;
    }
    const body = this.mark();
    this.parseStatements(false);
    this.b.done(body, N_BLOCK);
    this.b.setBinders(body, B_PRECEDING_ALL_COMMENTS, B_TRAILING_ALL_COMMENTS);
    this.expectMsg(T_RBRACE);
    this.b.done(literal, N_FUNCTION_LITERAL);
    this.b.done(literalExpression, N_LAMBDA_EXPRESSION);
    this.restoreNewlinesState();
  }

  private parseFunctionLiteralParameterList(): void {
    const parameterList = this.mark();
    while (!this.eof()) {
      if (this.at(T_ARROW)) {
        break;
      }
      const parameter = this.mark();
      if (this.at(T_COLON)) {
        this.error();
      } else if (this.at(T_LPAR) || this.at(T_LBRACKET)) {
        const destructuringDeclaration = this.mark();
        this.parseMultiDeclarationEntry(
          this.TOKEN_SET_TO_FOLLOW_AFTER_DESTRUCTURING_DECLARATION_IN_LAMBDA,
          this.TOKEN_SET_TO_FOLLOW_AFTER_DESTRUCTURING_DECLARATION_IN_LAMBDA_RECOVERY,
          this.lookahead(1) === T_VAL_KEYWORD ? MDM_FULL_VAL_ONLY : MDM_SHORT,
        );
        this.b.done(destructuringDeclaration, N_DESTRUCTURING_DECLARATION);
      } else {
        this.expectRec(T_IDENTIFIER, this.ARROW_SET);
      }
      if (this.at(T_COLON)) {
        this.advance();
        this.parseTypeRefRec(this.ARROW_COMMA_SET);
      }
      this.b.done(parameter, N_VALUE_PARAMETER);
      if (this.at(T_ARROW)) {
        break;
      } else if (this.at(T_COMMA)) {
        this.advance();
      } else {
        this.error();
        break;
      }
    }
    this.b.done(parameterList, N_VALUE_PARAMETER_LIST);
  }

  parseStatements(isScriptTopLevel: boolean): void {
    while (this.at(T_SEMICOLON)) {
      this.advance();
    }
    while (!this.eof() && !this.at(T_RBRACE)) {
      if (!this.atSet(this.STATEMENT_FIRST)) {
        this.errorAndAdvance(1);
      }
      if (this.atSet(this.STATEMENT_FIRST)) {
        this.parseStatement(isScriptTopLevel);
      }
      if (this.at(T_SEMICOLON)) {
        while (this.at(T_SEMICOLON)) {
          this.advance();
        }
      } else if (this.at(T_RBRACE)) {
        break;
      } else if (!isScriptTopLevel && !this.b.newlineBefore()) {
        if (this.atSet(this.STATEMENT_NEW_LINE_QUICK_RECOVERY_SET)) {
          this.error();
        } else {
          this.errorUntil(this.ERROR_UNTIL_STATEMENT);
        }
      }
    }
  }

  private parseStatement(isScriptTopLevel: boolean): void {
    if (!this.parseLocalDeclaration(false, isScriptTopLevel)) {
      if (!this.atSet(this.EXPRESSION_FIRST)) {
        this.errorAndAdvance(1);
      } else if (isScriptTopLevel) {
        const scriptInitializer = this.mark();
        this.parseBlockLevelExpression();
        this.b.done(scriptInitializer, N_SCRIPT_INITIALIZER);
      } else {
        this.parseBlockLevelExpression();
      }
    }
  }

  private parseBlockLevelExpression(): void {
    if (this.at(T_AT)) {
      const expression = this.mark();
      this.parseAnnotations(APM_DEFAULT);
      if (!this.b.newlineBefore()) {
        this.b.rollbackTo(expression);
        this.parseExpression();
        return;
      }
      this.parseBlockLevelExpression();
      this.b.done(expression, N_ANNOTATED_EXPRESSION);
      return;
    }
    this.parseExpression();
  }

  private parseLocalDeclarationRest(
    detector: ModDetector,
    failIfDefinitelyNotExpression: boolean,
    isScriptTopLevel: boolean,
  ): i32 {
    const keywordToken = this.tt();
    if (failIfDefinitelyNotExpression) {
      if (keywordToken !== T_FUN_KEYWORD) {
        return -1;
      }
      return this.parseFunction(true);
    }
    if (keywordToken === T_OBJECT_KEYWORD) {
      const la = this.lookahead(1);
      if (la === T_COLON || la === T_LBRACE) {
        return -1;
      }
    }
    return this.parseCommonDeclaration(detector, NPM_REQUIRED, isScriptTopLevel ? DPM_SCRIPT_TOPLEVEL : DPM_LOCAL);
  }

  private parseDoWhile(): void {
    const loop = this.mark();
    this.advance();
    if (!this.at(T_WHILE_KEYWORD)) {
      this.parseLoopBody();
    }
    if (this.expectMsg(T_WHILE_KEYWORD)) {
      this.parseCondition();
    }
    this.b.done(loop, N_DO_WHILE);
  }

  private parseWhile(): void {
    const loop = this.mark();
    this.advance();
    this.parseCondition();
    this.parseLoopBody();
    this.b.done(loop, N_WHILE);
  }

  private parseFor(): void {
    const loop = this.mark();
    this.advance();
    if (this.expectRec(T_LPAR, this.EXPRESSION_FIRST)) {
      this.disableNewlines();
      if (!this.at(T_RPAR)) {
        const parameter = this.mark();
        if (!this.at(T_IN_KEYWORD)) {
          this.parseModifierListSimple(this.IN_KEYWORD_R_PAR_COLON_SET);
        }
        if (this.at(T_VAL_KEYWORD) || this.at(T_VAR_KEYWORD)) {
          this.advance();
        }
        if (this.at(T_LPAR) || this.at(T_LBRACKET)) {
          const destructuringDeclaration = this.mark();
          this.parseMultiDeclarationEntry(
            this.IN_KEYWORD_L_BRACE_SET,
            this.IN_KEYWORD_L_BRACE_RECOVERY_SET,
            this.lookahead(1) === T_VAL_KEYWORD ? MDM_FULL_VAL_ONLY : MDM_SHORT,
          );
          this.b.done(destructuringDeclaration, N_DESTRUCTURING_DECLARATION);
        } else {
          this.expectRec(T_IDENTIFIER, this.COLON_IN_KEYWORD_SET);
          if (this.at(T_COLON)) {
            this.advance();
            this.parseTypeRefRec(this.IN_KEYWORD_SET);
          }
        }
        this.b.done(parameter, N_VALUE_PARAMETER);
        if (this.expectRec(T_IN_KEYWORD, this.L_PAR_L_BRACE_R_PAR_SET)) {
          const range = this.mark();
          this.parseExpression();
          this.b.done(range, N_LOOP_RANGE);
        }
      } else {
        this.error();
      }
      this.expectNoAdvance(T_RPAR);
      this.restoreNewlinesState();
    }
    this.parseLoopBody();
    this.b.done(loop, N_FOR);
  }

  private parseControlStructureBody(): void {
    if (!this.parseAnnotatedLambda(true)) {
      this.parseBlockLevelExpression();
    }
  }

  private parseLoopBody(): void {
    const body = this.mark();
    if (!this.at(T_SEMICOLON)) {
      this.parseControlStructureBody();
    }
    this.b.done(body, N_BODY);
  }

  private parseTry(): void {
    const tryExpression = this.mark();
    this.advance();
    this.parseBlock();
    let catchOrFinally = false;
    while (this.at(T_CATCH_KEYWORD)) {
      catchOrFinally = true;
      const catchBlock = this.mark();
      this.advance();
      if (this.atSet(this.TRY_CATCH_RECOVERY_TOKEN_SET)) {
        this.error();
      } else {
        const parameters = this.mark();
        this.expectRec(T_LPAR, this.TRY_CATCH_RECOVERY_TOKEN_SET);
        if (!this.atSet(this.TRY_CATCH_RECOVERY_TOKEN_SET)) {
          this.parseValueParameter(true);
          if (this.at(T_COMMA)) {
            this.advance();
          }
          this.expectRec(T_RPAR, this.TRY_CATCH_RECOVERY_TOKEN_SET);
        } else {
          this.error();
        }
        this.b.done(parameters, N_VALUE_PARAMETER_LIST);
      }
      if (this.at(T_LBRACE)) {
        this.parseBlock();
      } else {
        this.error();
      }
      this.b.done(catchBlock, N_CATCH);
    }
    if (this.at(T_FINALLY_KEYWORD)) {
      catchOrFinally = true;
      const finallyBlock = this.mark();
      this.advance();
      this.parseBlock();
      this.b.done(finallyBlock, N_FINALLY);
    }
    if (!catchOrFinally) {
      this.error();
    }
    this.b.done(tryExpression, N_TRY);
  }

  private parseIf(): void {
    const marker = this.mark();
    this.advance();
    this.parseCondition();
    const thenBranch = this.mark();
    if (!this.at(T_ELSE_KEYWORD) && !this.at(T_SEMICOLON)) {
      this.parseControlStructureBody();
    }
    if (this.at(T_SEMICOLON) && this.lookahead(1) === T_ELSE_KEYWORD) {
      this.advance();
    }
    this.b.done(thenBranch, N_THEN);
    if (this.at(T_ELSE_KEYWORD) && this.lookahead(1) !== T_ARROW) {
      this.advance();
      const elseBranch = this.mark();
      if (!this.at(T_SEMICOLON)) {
        this.parseControlStructureBody();
      }
      this.b.done(elseBranch, N_ELSE);
    }
    this.b.done(marker, N_IF);
  }

  private parseCondition(): void {
    this.disableNewlines();
    if (this.expectRec(T_LPAR, this.EXPRESSION_FIRST)) {
      const condition = this.mark();
      this.parseExpression();
      this.b.done(condition, N_CONDITION);
      this.expectMsg(T_RPAR);
    }
    this.restoreNewlinesState();
  }

  private parseJump(type: i32): void {
    const marker = this.mark();
    this.advance();
    this.parseLabelReferenceWithNoWhitespace();
    this.b.done(marker, type);
  }

  private parseReturn(): void {
    const returnExpression = this.mark();
    this.advance();
    this.parseLabelReferenceWithNoWhitespace();
    if (this.atSet(this.EXPRESSION_FIRST) && !this.at(T_EOL_OR_SEMICOLON)) {
      this.parseExpression();
    }
    this.b.done(returnExpression, N_RETURN);
  }

  private parseLabelReferenceWithNoWhitespace(): void {
    if (this.at(T_AT) && !this.b.newlineBefore()) {
      if (isWsOrComment(this.b.rawLookup(-1))) {
        this.error();
      }
      this.parseLabelReference();
    }
  }

  parseLabelDefinition(): void {
    const labelWrap = this.mark();
    const m = this.mark();
    if (this.at(T_AT)) {
      this.errorAndAdvance(1);
      this.b.drop(labelWrap);
      this.b.drop(m);
      return;
    }
    this.advance();
    this.advance();
    this.b.done(m, N_LABEL);
    this.b.done(labelWrap, N_LABEL_QUALIFIER);
  }

  private parseLabelReference(): void {
    const labelWrap = this.mark();
    const m = this.mark();
    if (this.b.rawLookup(1) !== T_IDENTIFIER) {
      this.errorAndAdvance(1);
      this.b.drop(labelWrap);
      this.b.drop(m);
      return;
    }
    this.advance();
    this.advance();
    this.b.done(m, N_LABEL);
    this.b.done(labelWrap, N_LABEL_QUALIFIER);
  }

  private parseThrow(): void {
    const marker = this.mark();
    this.advance();
    this.parseExpression();
    this.b.done(marker, N_THROW);
  }

  private parseParenthesizedExpression(): void {
    const m = this.mark();
    this.disableNewlines();
    this.advance();
    if (this.at(T_RPAR)) {
      this.error();
    } else {
      this.parseExpression();
    }
    this.expectMsg(T_RPAR);
    this.restoreNewlinesState();
    this.b.done(m, N_PARENTHESIZED);
  }

  private parseThisExpression(): void {
    const m = this.mark();
    const thisReference = this.mark();
    this.advance();
    this.b.done(thisReference, N_REFERENCE_EXPRESSION);
    this.parseLabelReferenceWithNoWhitespace();
    this.b.done(m, N_THIS_EXPRESSION);
  }

  private parseSuperExpression(): void {
    const m = this.mark();
    const superReference = this.mark();
    this.advance();
    this.b.done(superReference, N_REFERENCE_EXPRESSION);
    if (this.at(T_LT)) {
      const supertype = this.mark();
      this.disableNewlines();
      this.advance();
      this.parseTypeRef();
      if (this.at(T_GT)) {
        this.advance();
        this.b.drop(supertype);
      } else {
        this.b.rollbackTo(supertype);
      }
      this.restoreNewlinesState();
    }
    this.parseLabelReferenceWithNoWhitespace();
    this.b.done(m, N_SUPER_EXPRESSION);
  }

  parseValueArgumentList(): void {
    const list = this.mark();
    this.disableNewlines();
    if (this.expectRec(T_LPAR, this.EXPRESSION_FOLLOW)) {
      if (!this.at(T_RPAR)) {
        while (true) {
          this.parseValueArgument();
          if (this.at(T_COLON) && this.lookahead(1) === T_IDENTIFIER) {
            this.errorAndAdvance(2);
          }
          if (!this.at(T_COMMA)) {
            if (this.atSet(this.EXPRESSION_FIRST)) {
              this.error();
              continue;
            } else {
              break;
            }
          }
          this.advance();
          if (this.at(T_RPAR)) {
            break;
          }
        }
      }
      this.expectRec(T_RPAR, this.EXPRESSION_FOLLOW);
    }
    this.restoreNewlinesState();
    this.b.done(list, N_VALUE_ARGUMENT_LIST);
  }

  private parseValueArgument(): void {
    const argument = this.mark();
    if (this.at(T_IDENTIFIER) && this.lookahead(1) === T_EQ) {
      const argName = this.mark();
      const reference = this.mark();
      this.advance();
      this.b.done(reference, N_REFERENCE_EXPRESSION);
      this.b.done(argName, N_VALUE_ARGUMENT_NAME);
      this.advance();
    }
    if (this.at(T_MUL)) {
      this.advance();
    }
    if (!this.atSet(this.EXPRESSION_FIRST)) {
      this.error();
    } else {
      this.parseBinaryExpression(PR_ASSIGNMENT);
    }
    this.b.done(argument, N_VALUE_ARGUMENT);
  }

  private parseObjectLiteral(): void {
    const literal = this.mark();
    const declaration = this.mark();
    this.parseObject(NPM_PROHIBITED, false);
    this.b.done(declaration, N_OBJECT_DECLARATION);
    this.b.done(literal, N_OBJECT_LITERAL);
  }

  private parseOneTokenExpression(type: i32): void {
    const m = this.mark();
    this.advance();
    this.b.done(m, type);
  }

  private interruptedWithNewLine(): boolean {
    return !tsHas(this.ALLOW_NEWLINE_OPERATIONS, this.tt()) && this.b.newlineBefore();
  }
}
