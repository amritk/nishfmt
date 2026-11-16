// Token kinds, token types and operator precedences.
//
// `K_*`/`P_*`/`KW_*` are lexical kinds, `TT_*` the role a token plays in its
// line, `PREC_*` a binary operator's precedence (C++'s, lowest first).

// Lexical kinds.
export const K_EOF: i32 = 0;
export const K_IDENT: i32 = 1;
export const K_NUMBER: i32 = 2;
export const K_STRING: i32 = 3;
export const K_CHAR: i32 = 4;
export const K_COMMENT: i32 = 5;
export const K_UNKNOWN: i32 = 6;
export const K_HEADER: i32 = 7; // `<foo.h>` after #include

// Punctuators.
export const P_LPAREN: i32 = 10;
export const P_RPAREN: i32 = 11;
export const P_LBRACE: i32 = 12;
export const P_RBRACE: i32 = 13;
export const P_LSQUARE: i32 = 14;
export const P_RSQUARE: i32 = 15;
export const P_SEMI: i32 = 16;
export const P_COMMA: i32 = 17;
export const P_COLON: i32 = 18;
export const P_COLONCOLON: i32 = 19;
export const P_PERIOD: i32 = 20;
export const P_ELLIPSIS: i32 = 21;
export const P_ARROW: i32 = 22;
export const P_ARROWSTAR: i32 = 23;
export const P_PERIODSTAR: i32 = 24;
export const P_QUESTION: i32 = 25;
export const P_LESS: i32 = 26;
export const P_GREATER: i32 = 27;
export const P_LESSEQUAL: i32 = 28;
export const P_GREATEREQUAL: i32 = 29;
export const P_LESSLESS: i32 = 30;
export const P_LESSLESSEQUAL: i32 = 31;
export const P_GREATERGREATEREQUAL: i32 = 32;
export const P_EQUAL: i32 = 33;
export const P_EQUALEQUAL: i32 = 34;
export const P_EXCLAIM: i32 = 35;
export const P_EXCLAIMEQUAL: i32 = 36;
export const P_PLUS: i32 = 37;
export const P_PLUSPLUS: i32 = 38;
export const P_PLUSEQUAL: i32 = 39;
export const P_MINUS: i32 = 40;
export const P_MINUSMINUS: i32 = 41;
export const P_MINUSEQUAL: i32 = 42;
export const P_STAR: i32 = 43;
export const P_STAREQUAL: i32 = 44;
export const P_SLASH: i32 = 45;
export const P_SLASHEQUAL: i32 = 46;
export const P_PERCENT: i32 = 47;
export const P_PERCENTEQUAL: i32 = 48;
export const P_AMP: i32 = 49;
export const P_AMPAMP: i32 = 50;
export const P_AMPEQUAL: i32 = 51;
export const P_PIPE: i32 = 52;
export const P_PIPEPIPE: i32 = 53;
export const P_PIPEEQUAL: i32 = 54;
export const P_CARET: i32 = 55;
export const P_CARETEQUAL: i32 = 56;
export const P_TILDE: i32 = 57;
export const P_HASH: i32 = 58;
export const P_HASHHASH: i32 = 59;
export const P_SPACESHIP: i32 = 60;
export const P_AT: i32 = 61;
export const P_BACKSLASH: i32 = 62;

// Keywords, and contextual words recognised by id.
export const KW_FIRST: i32 = 100;
export const KW_ALIGNAS: i32 = 100;
export const KW_ALIGNOF: i32 = 101;
export const KW_ASM: i32 = 102;
export const KW_AUTO: i32 = 103;
export const KW_BOOL: i32 = 104;
export const KW_BREAK: i32 = 105;
export const KW_CASE: i32 = 106;
export const KW_CATCH: i32 = 107;
export const KW_CHAR: i32 = 108;
export const KW_CHAR8_T: i32 = 109;
export const KW_CHAR16_T: i32 = 110;
export const KW_CHAR32_T: i32 = 111;
export const KW_CLASS: i32 = 112;
export const KW_CO_AWAIT: i32 = 113;
export const KW_CO_RETURN: i32 = 114;
export const KW_CO_YIELD: i32 = 115;
export const KW_CONCEPT: i32 = 116;
export const KW_CONST: i32 = 117;
export const KW_CONSTEVAL: i32 = 118;
export const KW_CONSTEXPR: i32 = 119;
export const KW_CONSTINIT: i32 = 120;
export const KW_CONST_CAST: i32 = 121;
export const KW_CONTINUE: i32 = 122;
export const KW_DECLTYPE: i32 = 123;
export const KW_DEFAULT: i32 = 124;
export const KW_DELETE: i32 = 125;
export const KW_DO: i32 = 126;
export const KW_DOUBLE: i32 = 127;
export const KW_DYNAMIC_CAST: i32 = 128;
export const KW_ELSE: i32 = 129;
export const KW_ENUM: i32 = 130;
export const KW_EXPLICIT: i32 = 131;
export const KW_EXPORT: i32 = 132;
export const KW_EXTERN: i32 = 133;
export const KW_FALSE: i32 = 134;
export const KW_FLOAT: i32 = 135;
export const KW_FOR: i32 = 136;
export const KW_FRIEND: i32 = 137;
export const KW_GOTO: i32 = 138;
export const KW_IF: i32 = 139;
export const KW_INLINE: i32 = 140;
export const KW_INT: i32 = 141;
export const KW_LONG: i32 = 142;
export const KW_MUTABLE: i32 = 143;
export const KW_NAMESPACE: i32 = 144;
export const KW_NEW: i32 = 145;
export const KW_NOEXCEPT: i32 = 146;
export const KW_NULLPTR: i32 = 147;
export const KW_OPERATOR: i32 = 148;
export const KW_PRIVATE: i32 = 149;
export const KW_PROTECTED: i32 = 150;
export const KW_PUBLIC: i32 = 151;
export const KW_REGISTER: i32 = 152;
export const KW_REINTERPRET_CAST: i32 = 153;
export const KW_REQUIRES: i32 = 154;
export const KW_RETURN: i32 = 155;
export const KW_SHORT: i32 = 156;
export const KW_SIGNED: i32 = 157;
export const KW_SIZEOF: i32 = 158;
export const KW_STATIC: i32 = 159;
export const KW_STATIC_ASSERT: i32 = 160;
export const KW_STATIC_CAST: i32 = 161;
export const KW_STRUCT: i32 = 162;
export const KW_SWITCH: i32 = 163;
export const KW_TEMPLATE: i32 = 164;
export const KW_THIS: i32 = 165;
export const KW_THREAD_LOCAL: i32 = 166;
export const KW_THROW: i32 = 167;
export const KW_TRUE: i32 = 168;
export const KW_TRY: i32 = 169;
export const KW_TYPEDEF: i32 = 170;
export const KW_TYPEID: i32 = 171;
export const KW_TYPENAME: i32 = 172;
export const KW_UNION: i32 = 173;
export const KW_UNSIGNED: i32 = 174;
export const KW_USING: i32 = 175;
export const KW_VIRTUAL: i32 = 176;
export const KW_VOID: i32 = 177;
export const KW_VOLATILE: i32 = 178;
export const KW_WCHAR_T: i32 = 179;
export const KW_WHILE: i32 = 180;
export const KW_ATTRIBUTE: i32 = 181; // __attribute__
export const KW_TYPEOF: i32 = 182;
export const KW_ATOMIC: i32 = 183; // _Atomic
export const KW_MS: i32 = 184; // a Microsoft extension keyword that names no type (`__forceinline`, `__cdecl`)
export const KW_GENERIC: i32 = 185; // _Generic
export const KW_LAST: i32 = 185;
// Contextual words: lexed as identifiers, but recognised by id.
export const CW_OVERRIDE: i32 = 200;
export const CW_FINAL: i32 = 201;
export const CW_IMPORT: i32 = 202;
export const CW_MODULE: i32 = 203;
export const CW_HAS_INCLUDE: i32 = 204;

// Preprocessor directive ids (the word after `#`).
export const PP_NONE: i32 = 0;
export const PP_INCLUDE: i32 = 1;
export const PP_DEFINE: i32 = 2;
export const PP_IF: i32 = 3;
export const PP_ELIF: i32 = 4;
export const PP_ELSE: i32 = 5;
export const PP_ENDIF: i32 = 6;
export const PP_PRAGMA: i32 = 7;
export const PP_ERROR: i32 = 8;
export const PP_OTHER: i32 = 9;

// Token types.
export const TT_UNKNOWN: i32 = 0;
export const TT_ATTRIBUTE_LPAREN: i32 = 1;
export const TT_ATTRIBUTE_RPAREN: i32 = 2;
export const TT_ATTRIBUTE_SQUARE: i32 = 3;
export const TT_BINARY_OPERATOR: i32 = 4;
export const TT_BIT_FIELD_COLON: i32 = 5;
export const TT_BLOCK_COMMENT: i32 = 6;
export const TT_CAST_RPAREN: i32 = 7;
export const TT_CASE_LABEL_COLON: i32 = 8;
export const TT_CLASS_LBRACE: i32 = 9;
export const TT_CONDITIONAL_EXPR: i32 = 10;
export const TT_CPP_CAST_LPAREN: i32 = 11;
export const TT_CTOR_DTOR_DECL_NAME: i32 = 12;
export const TT_CTOR_INITIALIZER_COLON: i32 = 13;
export const TT_CTOR_INITIALIZER_COMMA: i32 = 14;
export const TT_DESIGNATED_INITIALIZER_LSQUARE: i32 = 15;
export const TT_DESIGNATED_INITIALIZER_PERIOD: i32 = 16;
export const TT_DICT_LITERAL: i32 = 17;
export const TT_ENUM_LBRACE: i32 = 18;
export const TT_FUNCTION_ANNOTATION_RPAREN: i32 = 19;
export const TT_FUNCTION_DECLARATION_NAME: i32 = 20;
export const TT_FUNCTION_LBRACE: i32 = 21;
export const TT_FUNCTION_TYPE_LPAREN: i32 = 22;
export const TT_GOTO_LABEL_COLON: i32 = 23;
export const TT_IMPLICIT_STRING_LITERAL: i32 = 24;
export const TT_INHERITANCE_COLON: i32 = 25;
export const TT_INHERITANCE_COMMA: i32 = 26;
export const TT_INLINE_ASM_COLON: i32 = 27;
export const TT_LAMBDA_LBRACE: i32 = 28;
export const TT_LAMBDA_LSQUARE: i32 = 29;
export const TT_LINE_COMMENT: i32 = 30;
export const TT_NAMESPACE_LBRACE: i32 = 31;
export const TT_OVERLOADED_OPERATOR: i32 = 32;
export const TT_OVERLOADED_OPERATOR_LPAREN: i32 = 33;
export const TT_POINTER_OR_REFERENCE: i32 = 34;
export const TT_RANGE_BASED_FOR_LOOP_COLON: i32 = 35;
export const TT_START_OF_NAME: i32 = 36;
export const TT_STRUCT_LBRACE: i32 = 37;
export const TT_TEMPLATE_CLOSER: i32 = 38;
export const TT_TEMPLATE_OPENER: i32 = 39;
export const TT_TRAILING_ANNOTATION: i32 = 40;
export const TT_TRAILING_RETURN_ARROW: i32 = 41;
export const TT_TRAILING_UNARY_OPERATOR: i32 = 42;
export const TT_TYPE_DECLARATION_PAREN: i32 = 43;
export const TT_UNARY_OPERATOR: i32 = 44;
export const TT_UNION_LBRACE: i32 = 45;
export const TT_ARRAY_INITIALIZER_LSQUARE: i32 = 46;
export const TT_ARRAY_SUBSCRIPT_LSQUARE: i32 = 47;
export const TT_STRUCTURED_BINDING_LSQUARE: i32 = 48;
export const TT_CONTROL_STATEMENT_LBRACE: i32 = 49;
export const TT_ELSE_LBRACE: i32 = 50;
export const TT_RECORD_LBRACE: i32 = 51;
export const TT_ATTRIBUTE_COLON: i32 = 52;
export const TT_BRACED_LIST_LBRACE: i32 = 53;
export const TT_LAMBDA_ARROW: i32 = 54;
export const TT_BLOCK_LITERAL_LBRACE: i32 = 55; // `^(...) {`: an Apple block's body
export const TT_GENERIC_SELECTION_COLON: i32 = 56; // `_Generic(x, int: a)`
export const TT_INLINE_ASM_SYMBOLIC_NAME_LSQUARE: i32 = 57; // `asm(... : [name] "=r"(x))`
export const TT_DO_WHILE: i32 = 58; // the `while` ending a do-while
export const TT_INLINE_ASM_BRACE: i32 = 59; // the braces of `__asm { ... }`
export const TT_OBJC_METHOD_SPECIFIER: i32 = 60; // the `-` or `+` starting an Objective-C method declaration
export const TT_SELECTOR_NAME: i32 = 61; // a part of an Objective-C selector (`initWithX` in `initWithX:`)
export const TT_OBJC_METHOD_EXPR: i32 = 62; // the `:` after a selector part

// Brace kinds.
export const BK_UNKNOWN: i32 = 0;
export const BK_BLOCK: i32 = 1;
export const BK_BRACED_INIT: i32 = 2;

// Precedence levels.
export const PREC_UNKNOWN: i32 = 0;
export const PREC_COMMA: i32 = 1;
export const PREC_ASSIGNMENT: i32 = 2;
export const PREC_CONDITIONAL: i32 = 3;
export const PREC_LOGICAL_OR: i32 = 4;
export const PREC_LOGICAL_AND: i32 = 5;
export const PREC_INCLUSIVE_OR: i32 = 6;
export const PREC_EXCLUSIVE_OR: i32 = 7;
export const PREC_BITWISE_AND: i32 = 8;
export const PREC_EQUALITY: i32 = 9;
export const PREC_RELATIONAL: i32 = 10;
export const PREC_SPACESHIP: i32 = 11;
export const PREC_SHIFT: i32 = 12;
export const PREC_ADDITIVE: i32 = 13;
export const PREC_MULTIPLICATIVE: i32 = 14;
export const PREC_POINTER_TO_MEMBER: i32 = 15;
export const PREC_UNARY: i32 = 16;
export const PREC_ARROW_AND_PERIOD: i32 = 17;

// Line types.
export const LT_OTHER: i32 = 0;
export const LT_PREPROCESSOR: i32 = 1;
export const LT_IMPORT: i32 = 2;
export const LT_INVALID: i32 = 3;
export const LT_VIRTUAL_FUNCTION_DECL: i32 = 4;
export const LT_COMMENT_ABOVE_PP: i32 = 5;

/** The binary precedence of a token kind, or PREC_UNKNOWN. */
export const binPrecedence = (k: i32): i32 => {
  switch (k) {
    case P_COMMA:
      return PREC_COMMA;
    case P_EQUAL:
    case P_STAREQUAL:
    case P_SLASHEQUAL:
    case P_PERCENTEQUAL:
    case P_PLUSEQUAL:
    case P_MINUSEQUAL:
    case P_LESSLESSEQUAL:
    case P_GREATERGREATEREQUAL:
    case P_AMPEQUAL:
    case P_CARETEQUAL:
    case P_PIPEEQUAL:
      return PREC_ASSIGNMENT;
    case P_QUESTION:
      return PREC_CONDITIONAL;
    case P_PIPEPIPE:
      return PREC_LOGICAL_OR;
    case P_AMPAMP:
      return PREC_LOGICAL_AND;
    case P_PIPE:
      return PREC_INCLUSIVE_OR;
    case P_CARET:
      return PREC_EXCLUSIVE_OR;
    case P_AMP:
      return PREC_BITWISE_AND;
    case P_EQUALEQUAL:
    case P_EXCLAIMEQUAL:
      return PREC_EQUALITY;
    case P_LESSEQUAL:
    case P_LESS:
    case P_GREATEREQUAL:
    case P_GREATER:
      return PREC_RELATIONAL;
    case P_SPACESHIP:
      return PREC_SPACESHIP;
    case P_LESSLESS:
      return PREC_SHIFT;
    case P_PLUS:
    case P_MINUS:
      return PREC_ADDITIVE;
    case P_PERCENT:
    case P_SLASH:
    case P_STAR:
      return PREC_MULTIPLICATIVE;
    case P_PERIODSTAR:
    case P_ARROWSTAR:
      return PREC_POINTER_TO_MEMBER;
    default:
      return PREC_UNKNOWN;
  }
};

/** Whether `k` is a builtin type word. */
export const isSimpleTypeKind = (k: i32): boolean => {
  switch (k) {
    case KW_SHORT:
    case KW_LONG:
    case KW_SIGNED:
    case KW_UNSIGNED:
    case KW_VOID:
    case KW_CHAR:
    case KW_INT:
    case KW_FLOAT:
    case KW_DOUBLE:
    case KW_WCHAR_T:
    case KW_BOOL:
    case KW_CHAR8_T:
    case KW_CHAR16_T:
    case KW_CHAR32_T:
    case KW_TYPEOF:
    case KW_DECLTYPE:
    case KW_ATOMIC:
      return true;
    default:
      return false;
  }
};

/** Whether `k` is a keyword: a word the lexer recognised. */
export const isKeyword = (k: i32): boolean => k >= KW_FIRST && k <= KW_LAST;

/** Whether `k` is word-like: an identifier or keyword. */
export const isWordKind = (k: i32): boolean => k === K_IDENT || (k >= KW_FIRST && k <= KW_LAST) || k >= CW_OVERRIDE;

/** Whether `k` is an identifier, plain or contextual. */
export const isIdentKind = (k: i32): boolean => k === K_IDENT || k >= CW_OVERRIDE;

/** Whether `k` is a literal (number, string, char). */
export const isLiteralKind = (k: i32): boolean => k === K_NUMBER || k === K_STRING || k === K_CHAR;
