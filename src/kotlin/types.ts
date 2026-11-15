// Kotlin token and node types, as the Kotlin compiler's KtTokens and KtNodeTypes.
// Generated from the Kotlin 2.3.20 sources (Apache License 2.0, Copyright JetBrains s.r.o.).

export const T_INVALID: i32 = 0;
export const T_EOF: i32 = 1;
export const T_RESERVED: i32 = 2;
export const T_BLOCK_COMMENT: i32 = 3;
export const T_EOL_COMMENT: i32 = 4;
export const T_SHEBANG_COMMENT: i32 = 5;
export const T_INTEGER_LITERAL: i32 = 6;
export const T_FLOAT_LITERAL: i32 = 7;
export const T_CHARACTER_LITERAL: i32 = 8;
export const T_CLOSING_QUOTE: i32 = 9;
export const T_OPEN_QUOTE: i32 = 10;
export const T_REGULAR_STRING_PART: i32 = 11;
export const T_ESCAPE_SEQUENCE: i32 = 12;
export const T_SHORT_TEMPLATE_ENTRY_START: i32 = 13;
export const T_LONG_TEMPLATE_ENTRY_START: i32 = 14;
export const T_LONG_TEMPLATE_ENTRY_END: i32 = 15;
export const T_DANGLING_NEWLINE: i32 = 16;
export const T_PACKAGE_KEYWORD: i32 = 17;
export const T_AS_KEYWORD: i32 = 18;
export const T_TYPE_ALIAS_KEYWORD: i32 = 19;
export const T_CLASS_KEYWORD: i32 = 20;
export const T_THIS_KEYWORD: i32 = 21;
export const T_SUPER_KEYWORD: i32 = 22;
export const T_VAL_KEYWORD: i32 = 23;
export const T_VAR_KEYWORD: i32 = 24;
export const T_FUN_KEYWORD: i32 = 25;
export const T_FOR_KEYWORD: i32 = 26;
export const T_NULL_KEYWORD: i32 = 27;
export const T_TRUE_KEYWORD: i32 = 28;
export const T_FALSE_KEYWORD: i32 = 29;
export const T_IS_KEYWORD: i32 = 30;
export const T_IN_KEYWORD: i32 = 31;
export const T_THROW_KEYWORD: i32 = 32;
export const T_RETURN_KEYWORD: i32 = 33;
export const T_BREAK_KEYWORD: i32 = 34;
export const T_CONTINUE_KEYWORD: i32 = 35;
export const T_OBJECT_KEYWORD: i32 = 36;
export const T_IF_KEYWORD: i32 = 37;
export const T_TRY_KEYWORD: i32 = 38;
export const T_ELSE_KEYWORD: i32 = 39;
export const T_WHILE_KEYWORD: i32 = 40;
export const T_DO_KEYWORD: i32 = 41;
export const T_WHEN_KEYWORD: i32 = 42;
export const T_INTERFACE_KEYWORD: i32 = 43;
export const T_TYPEOF_KEYWORD: i32 = 44;
export const T_AS_SAFE: i32 = 45;
export const T_IDENTIFIER: i32 = 46;
export const T_FIELD_IDENTIFIER: i32 = 47;
export const T_LBRACKET: i32 = 48;
export const T_RBRACKET: i32 = 49;
export const T_LBRACE: i32 = 50;
export const T_RBRACE: i32 = 51;
export const T_LPAR: i32 = 52;
export const T_RPAR: i32 = 53;
export const T_DOT: i32 = 54;
export const T_PLUSPLUS: i32 = 55;
export const T_MINUSMINUS: i32 = 56;
export const T_MUL: i32 = 57;
export const T_PLUS: i32 = 58;
export const T_MINUS: i32 = 59;
export const T_EXCL: i32 = 60;
export const T_DIV: i32 = 61;
export const T_PERC: i32 = 62;
export const T_LT: i32 = 63;
export const T_GT: i32 = 64;
export const T_LTEQ: i32 = 65;
export const T_GTEQ: i32 = 66;
export const T_EQEQEQ: i32 = 67;
export const T_ARROW: i32 = 68;
export const T_DOUBLE_ARROW: i32 = 69;
export const T_EXCLEQEQEQ: i32 = 70;
export const T_EQEQ: i32 = 71;
export const T_EXCLEQ: i32 = 72;
export const T_EXCLEXCL: i32 = 73;
export const T_ANDAND: i32 = 74;
export const T_AND: i32 = 75;
export const T_OROR: i32 = 76;
export const T_SAFE_ACCESS: i32 = 77;
export const T_ELVIS: i32 = 78;
export const T_QUEST: i32 = 79;
export const T_COLONCOLON: i32 = 80;
export const T_COLON: i32 = 81;
export const T_SEMICOLON: i32 = 82;
export const T_DOUBLE_SEMICOLON: i32 = 83;
export const T_RANGE: i32 = 84;
export const T_RANGE_UNTIL: i32 = 85;
export const T_EQ: i32 = 86;
export const T_MULTEQ: i32 = 87;
export const T_DIVEQ: i32 = 88;
export const T_PERCEQ: i32 = 89;
export const T_PLUSEQ: i32 = 90;
export const T_MINUSEQ: i32 = 91;
export const T_NOT_IN: i32 = 92;
export const T_NOT_IS: i32 = 93;
export const T_HASH: i32 = 94;
export const T_AT: i32 = 95;
export const T_COMMA: i32 = 96;
export const T_EOL_OR_SEMICOLON: i32 = 97;
export const T_FILE_KEYWORD: i32 = 98;
export const T_FIELD_KEYWORD: i32 = 99;
export const T_PROPERTY_KEYWORD: i32 = 100;
export const T_RECEIVER_KEYWORD: i32 = 101;
export const T_PARAM_KEYWORD: i32 = 102;
export const T_SETPARAM_KEYWORD: i32 = 103;
export const T_DELEGATE_KEYWORD: i32 = 104;
export const T_IMPORT_KEYWORD: i32 = 105;
export const T_WHERE_KEYWORD: i32 = 106;
export const T_BY_KEYWORD: i32 = 107;
export const T_GET_KEYWORD: i32 = 108;
export const T_SET_KEYWORD: i32 = 109;
export const T_CONSTRUCTOR_KEYWORD: i32 = 110;
export const T_INIT_KEYWORD: i32 = 111;
export const T_CONTEXT_KEYWORD: i32 = 112;
export const T_ABSTRACT_KEYWORD: i32 = 113;
export const T_ENUM_KEYWORD: i32 = 114;
export const T_CONTRACT_KEYWORD: i32 = 115;
export const T_OPEN_KEYWORD: i32 = 116;
export const T_INNER_KEYWORD: i32 = 117;
export const T_OVERRIDE_KEYWORD: i32 = 118;
export const T_PRIVATE_KEYWORD: i32 = 119;
export const T_PUBLIC_KEYWORD: i32 = 120;
export const T_INTERNAL_KEYWORD: i32 = 121;
export const T_PROTECTED_KEYWORD: i32 = 122;
export const T_CATCH_KEYWORD: i32 = 123;
export const T_OUT_KEYWORD: i32 = 124;
export const T_VARARG_KEYWORD: i32 = 125;
export const T_REIFIED_KEYWORD: i32 = 126;
export const T_DYNAMIC_KEYWORD: i32 = 127;
export const T_COMPANION_KEYWORD: i32 = 128;
export const T_SEALED_KEYWORD: i32 = 129;
export const T_FINALLY_KEYWORD: i32 = 130;
export const T_FINAL_KEYWORD: i32 = 131;
export const T_LATEINIT_KEYWORD: i32 = 132;
export const T_DATA_KEYWORD: i32 = 133;
export const T_VALUE_KEYWORD: i32 = 134;
export const T_INLINE_KEYWORD: i32 = 135;
export const T_NOINLINE_KEYWORD: i32 = 136;
export const T_TAILREC_KEYWORD: i32 = 137;
export const T_EXTERNAL_KEYWORD: i32 = 138;
export const T_ANNOTATION_KEYWORD: i32 = 139;
export const T_CROSSINLINE_KEYWORD: i32 = 140;
export const T_OPERATOR_KEYWORD: i32 = 141;
export const T_INFIX_KEYWORD: i32 = 142;
export const T_CONST_KEYWORD: i32 = 143;
export const T_SUSPEND_KEYWORD: i32 = 144;
export const T_EXPECT_KEYWORD: i32 = 145;
export const T_ACTUAL_KEYWORD: i32 = 146;
export const T_INTERPOLATION_PREFIX: i32 = 147;
export const T_ALL_KEYWORD: i32 = 148;
export const T_WHITE_SPACE: i32 = 149;
export const T_DOC_COMMENT: i32 = 150;
export const T_BAD_CHARACTER: i32 = 151;
export const T_ERROR_ELEMENT: i32 = 152;

// Node types.
export const N_KT_FILE: i32 = 160;
export const N_SCRIPT: i32 = 161;
export const N_PACKAGE_DIRECTIVE: i32 = 162;
export const N_IMPORT_LIST: i32 = 163;
export const N_IMPORT_DIRECTIVE: i32 = 164;
export const N_IMPORT_ALIAS: i32 = 165;
export const N_FILE_ANNOTATION_LIST: i32 = 166;
export const N_CLASS: i32 = 167;
export const N_FUN: i32 = 168;
export const N_PROPERTY: i32 = 169;
export const N_DESTRUCTURING_DECLARATION: i32 = 170;
export const N_DESTRUCTURING_DECLARATION_ENTRY: i32 = 171;
export const N_OBJECT_DECLARATION: i32 = 172;
export const N_TYPEALIAS: i32 = 173;
export const N_ENUM_ENTRY: i32 = 174;
export const N_CLASS_INITIALIZER: i32 = 175;
export const N_SCRIPT_INITIALIZER: i32 = 176;
export const N_SECONDARY_CONSTRUCTOR: i32 = 177;
export const N_PRIMARY_CONSTRUCTOR: i32 = 178;
export const N_CONTEXT_RECEIVER_LIST: i32 = 179;
export const N_CONTEXT_PARAMETER_LIST: i32 = 180;
export const N_CONTEXT_RECEIVER: i32 = 181;
export const N_TYPE_PARAMETER_LIST: i32 = 182;
export const N_TYPE_PARAMETER: i32 = 183;
export const N_SUPER_TYPE_LIST: i32 = 184;
export const N_DELEGATED_SUPER_TYPE_ENTRY: i32 = 185;
export const N_SUPER_TYPE_CALL_ENTRY: i32 = 186;
export const N_SUPER_TYPE_ENTRY: i32 = 187;
export const N_PROPERTY_DELEGATE: i32 = 188;
export const N_CONSTRUCTOR_CALLEE: i32 = 189;
export const N_VALUE_PARAMETER_LIST: i32 = 190;
export const N_VALUE_PARAMETER: i32 = 191;
export const N_CLASS_BODY: i32 = 192;
export const N_INITIALIZER_LIST: i32 = 193;
export const N_MODIFIER_LIST: i32 = 194;
export const N_ANNOTATION: i32 = 195;
export const N_ANNOTATION_ENTRY: i32 = 196;
export const N_ANNOTATION_TARGET: i32 = 197;
export const N_TYPE_ARGUMENT_LIST: i32 = 198;
export const N_VALUE_ARGUMENT_LIST: i32 = 199;
export const N_VALUE_ARGUMENT: i32 = 200;
export const N_CONTRACT_EFFECT_LIST: i32 = 201;
export const N_CONTRACT_EFFECT: i32 = 202;
export const N_LAMBDA_ARGUMENT: i32 = 203;
export const N_VALUE_ARGUMENT_NAME: i32 = 204;
export const N_TYPE_REFERENCE: i32 = 205;
export const N_USER_TYPE: i32 = 206;
export const N_DYNAMIC_TYPE: i32 = 207;
export const N_FUNCTION_TYPE: i32 = 208;
export const N_FUNCTION_TYPE_RECEIVER: i32 = 209;
export const N_NULLABLE_TYPE: i32 = 210;
export const N_INTERSECTION_TYPE: i32 = 211;
export const N_TYPE_PROJECTION: i32 = 212;
export const N_PROPERTY_ACCESSOR: i32 = 213;
export const N_BACKING_FIELD: i32 = 214;
export const N_INITIALIZER: i32 = 215;
export const N_TYPE_CONSTRAINT_LIST: i32 = 216;
export const N_TYPE_CONSTRAINT: i32 = 217;
export const N_CONSTRUCTOR_DELEGATION_CALL: i32 = 218;
export const N_CONSTRUCTOR_DELEGATION_REFERENCE: i32 = 219;
export const N_NULL: i32 = 220;
export const N_BOOLEAN_CONSTANT: i32 = 221;
export const N_FLOAT_CONSTANT: i32 = 222;
export const N_CHARACTER_CONSTANT: i32 = 223;
export const N_INTEGER_CONSTANT: i32 = 224;
export const N_STRING_TEMPLATE: i32 = 225;
export const N_LONG_STRING_TEMPLATE_ENTRY: i32 = 226;
export const N_SHORT_STRING_TEMPLATE_ENTRY: i32 = 227;
export const N_LITERAL_STRING_TEMPLATE_ENTRY: i32 = 228;
export const N_ESCAPE_STRING_TEMPLATE_ENTRY: i32 = 229;
export const N_STRING_INTERPOLATION_PREFIX: i32 = 230;
export const N_PARENTHESIZED: i32 = 231;
export const N_RETURN: i32 = 232;
export const N_THROW: i32 = 233;
export const N_CONTINUE: i32 = 234;
export const N_BREAK: i32 = 235;
export const N_IF: i32 = 236;
export const N_CONDITION: i32 = 237;
export const N_THEN: i32 = 238;
export const N_ELSE: i32 = 239;
export const N_TRY: i32 = 240;
export const N_CATCH: i32 = 241;
export const N_FINALLY: i32 = 242;
export const N_FOR: i32 = 243;
export const N_WHILE: i32 = 244;
export const N_DO_WHILE: i32 = 245;
export const N_LOOP_RANGE: i32 = 246;
export const N_BODY: i32 = 247;
export const N_BLOCK: i32 = 248;
export const N_LAMBDA_EXPRESSION: i32 = 249;
export const N_FUNCTION_LITERAL: i32 = 250;
export const N_ANNOTATED_EXPRESSION: i32 = 251;
export const N_REFERENCE_EXPRESSION: i32 = 252;
export const N_ENUM_ENTRY_SUPERCLASS_REFERENCE_EXPRESSION: i32 = 253;
export const N_OPERATION_REFERENCE: i32 = 254;
export const N_LABEL: i32 = 255;
export const N_LABEL_QUALIFIER: i32 = 256;
export const N_THIS_EXPRESSION: i32 = 257;
export const N_SUPER_EXPRESSION: i32 = 258;
export const N_BINARY_EXPRESSION: i32 = 259;
export const N_BINARY_WITH_TYPE: i32 = 260;
export const N_IS_EXPRESSION: i32 = 261;
export const N_PREFIX_EXPRESSION: i32 = 262;
export const N_POSTFIX_EXPRESSION: i32 = 263;
export const N_LABELED_EXPRESSION: i32 = 264;
export const N_CALL_EXPRESSION: i32 = 265;
export const N_ARRAY_ACCESS_EXPRESSION: i32 = 266;
export const N_INDICES: i32 = 267;
export const N_DOT_QUALIFIED_EXPRESSION: i32 = 268;
export const N_CALLABLE_REFERENCE_EXPRESSION: i32 = 269;
export const N_CLASS_LITERAL_EXPRESSION: i32 = 270;
export const N_SAFE_ACCESS_EXPRESSION: i32 = 271;
export const N_OBJECT_LITERAL: i32 = 272;
export const N_WHEN: i32 = 273;
export const N_WHEN_ENTRY: i32 = 274;
export const N_WHEN_ENTRY_GUARD: i32 = 275;
export const N_WHEN_CONDITION_IN_RANGE: i32 = 276;
export const N_WHEN_CONDITION_IS_PATTERN: i32 = 277;
export const N_WHEN_CONDITION_EXPRESSION: i32 = 278;
export const N_COLLECTION_LITERAL_EXPRESSION: i32 = 279;
export const N_TYPE_CODE_FRAGMENT: i32 = 280;
export const N_EXPRESSION_CODE_FRAGMENT: i32 = 281;
export const N_BLOCK_CODE_FRAGMENT: i32 = 282;
export const N_COUNT: i32 = 283;

/** The PSI debug name of a type, as the PSI dump prints it. */
export const ktTypeName = (t: i32): string => {
  switch (t) {
    case 0:
      return "INVALID";
    case 1:
      return "EOF";
    case 2:
      return "RESERVED";
    case 3:
      return "BLOCK_COMMENT";
    case 4:
      return "EOL_COMMENT";
    case 5:
      return "SHEBANG_COMMENT";
    case 6:
      return "INTEGER_LITERAL";
    case 7:
      return "FLOAT_CONSTANT";
    case 8:
      return "CHARACTER_LITERAL";
    case 9:
      return "CLOSING_QUOTE";
    case 10:
      return "OPEN_QUOTE";
    case 11:
      return "REGULAR_STRING_PART";
    case 12:
      return "ESCAPE_SEQUENCE";
    case 13:
      return "SHORT_TEMPLATE_ENTRY_START";
    case 14:
      return "LONG_TEMPLATE_ENTRY_START";
    case 15:
      return "LONG_TEMPLATE_ENTRY_END";
    case 16:
      return "DANGLING_NEWLINE";
    case 17:
      return "package";
    case 18:
      return "as";
    case 19:
      return "typealias";
    case 20:
      return "class";
    case 21:
      return "this";
    case 22:
      return "super";
    case 23:
      return "val";
    case 24:
      return "var";
    case 25:
      return "fun";
    case 26:
      return "for";
    case 27:
      return "null";
    case 28:
      return "true";
    case 29:
      return "false";
    case 30:
      return "is";
    case 31:
      return "in";
    case 32:
      return "throw";
    case 33:
      return "return";
    case 34:
      return "break";
    case 35:
      return "continue";
    case 36:
      return "object";
    case 37:
      return "if";
    case 38:
      return "try";
    case 39:
      return "else";
    case 40:
      return "while";
    case 41:
      return "do";
    case 42:
      return "when";
    case 43:
      return "interface";
    case 44:
      return "typeof";
    case 45:
      return "AS_SAFE";
    case 46:
      return "IDENTIFIER";
    case 47:
      return "FIELD_IDENTIFIER";
    case 48:
      return "LBRACKET";
    case 49:
      return "RBRACKET";
    case 50:
      return "LBRACE";
    case 51:
      return "RBRACE";
    case 52:
      return "LPAR";
    case 53:
      return "RPAR";
    case 54:
      return "DOT";
    case 55:
      return "PLUSPLUS";
    case 56:
      return "MINUSMINUS";
    case 57:
      return "MUL";
    case 58:
      return "PLUS";
    case 59:
      return "MINUS";
    case 60:
      return "EXCL";
    case 61:
      return "DIV";
    case 62:
      return "PERC";
    case 63:
      return "LT";
    case 64:
      return "GT";
    case 65:
      return "LTEQ";
    case 66:
      return "GTEQ";
    case 67:
      return "EQEQEQ";
    case 68:
      return "ARROW";
    case 69:
      return "DOUBLE_ARROW";
    case 70:
      return "EXCLEQEQEQ";
    case 71:
      return "EQEQ";
    case 72:
      return "EXCLEQ";
    case 73:
      return "EXCLEXCL";
    case 74:
      return "ANDAND";
    case 75:
      return "AND";
    case 76:
      return "OROR";
    case 77:
      return "SAFE_ACCESS";
    case 78:
      return "ELVIS";
    case 79:
      return "QUEST";
    case 80:
      return "COLONCOLON";
    case 81:
      return "COLON";
    case 82:
      return "SEMICOLON";
    case 83:
      return "DOUBLE_SEMICOLON";
    case 84:
      return "RANGE";
    case 85:
      return "RANGE_UNTIL";
    case 86:
      return "EQ";
    case 87:
      return "MULTEQ";
    case 88:
      return "DIVEQ";
    case 89:
      return "PERCEQ";
    case 90:
      return "PLUSEQ";
    case 91:
      return "MINUSEQ";
    case 92:
      return "NOT_IN";
    case 93:
      return "NOT_IS";
    case 94:
      return "HASH";
    case 95:
      return "AT";
    case 96:
      return "COMMA";
    case 97:
      return "EOL_OR_SEMICOLON";
    case 98:
      return "file";
    case 99:
      return "field";
    case 100:
      return "property";
    case 101:
      return "receiver";
    case 102:
      return "param";
    case 103:
      return "setparam";
    case 104:
      return "delegate";
    case 105:
      return "import";
    case 106:
      return "where";
    case 107:
      return "by";
    case 108:
      return "get";
    case 109:
      return "set";
    case 110:
      return "constructor";
    case 111:
      return "init";
    case 112:
      return "context";
    case 113:
      return "abstract";
    case 114:
      return "enum";
    case 115:
      return "contract";
    case 116:
      return "open";
    case 117:
      return "inner";
    case 118:
      return "override";
    case 119:
      return "private";
    case 120:
      return "public";
    case 121:
      return "internal";
    case 122:
      return "protected";
    case 123:
      return "catch";
    case 124:
      return "out";
    case 125:
      return "vararg";
    case 126:
      return "reified";
    case 127:
      return "dynamic";
    case 128:
      return "companion";
    case 129:
      return "sealed";
    case 130:
      return "finally";
    case 131:
      return "final";
    case 132:
      return "lateinit";
    case 133:
      return "data";
    case 134:
      return "value";
    case 135:
      return "inline";
    case 136:
      return "noinline";
    case 137:
      return "tailrec";
    case 138:
      return "external";
    case 139:
      return "annotation";
    case 140:
      return "crossinline";
    case 141:
      return "operator";
    case 142:
      return "infix";
    case 143:
      return "const";
    case 144:
      return "suspend";
    case 145:
      return "expect";
    case 146:
      return "actual";
    case 147:
      return "INTERPOLATION_PREFIX";
    case 148:
      return "all";
    case 149:
      return "WHITE_SPACE";
    case 150:
      return "KDoc";
    case 151:
      return "BAD_CHARACTER";
    case 152:
      return "ERROR_ELEMENT";
    case 160:
      return "kotlin.FILE";
    case 161:
      return "SCRIPT";
    case 162:
      return "PACKAGE_DIRECTIVE";
    case 163:
      return "IMPORT_LIST";
    case 164:
      return "IMPORT_DIRECTIVE";
    case 165:
      return "IMPORT_ALIAS";
    case 166:
      return "FILE_ANNOTATION_LIST";
    case 167:
      return "CLASS";
    case 168:
      return "FUN";
    case 169:
      return "PROPERTY";
    case 170:
      return "DESTRUCTURING_DECLARATION";
    case 171:
      return "DESTRUCTURING_DECLARATION_ENTRY";
    case 172:
      return "OBJECT_DECLARATION";
    case 173:
      return "TYPEALIAS";
    case 174:
      return "ENUM_ENTRY";
    case 175:
      return "CLASS_INITIALIZER";
    case 176:
      return "SCRIPT_INITIALIZER";
    case 177:
      return "SECONDARY_CONSTRUCTOR";
    case 178:
      return "PRIMARY_CONSTRUCTOR";
    case 179:
      return "CONTEXT_RECEIVER_LIST";
    case 180:
      return "CONTEXT_PARAMETER_LIST";
    case 181:
      return "CONTEXT_RECEIVER";
    case 182:
      return "TYPE_PARAMETER_LIST";
    case 183:
      return "TYPE_PARAMETER";
    case 184:
      return "SUPER_TYPE_LIST";
    case 185:
      return "DELEGATED_SUPER_TYPE_ENTRY";
    case 186:
      return "SUPER_TYPE_CALL_ENTRY";
    case 187:
      return "SUPER_TYPE_ENTRY";
    case 188:
      return "PROPERTY_DELEGATE";
    case 189:
      return "CONSTRUCTOR_CALLEE";
    case 190:
      return "VALUE_PARAMETER_LIST";
    case 191:
      return "VALUE_PARAMETER";
    case 192:
      return "CLASS_BODY";
    case 193:
      return "INITIALIZER_LIST";
    case 194:
      return "MODIFIER_LIST";
    case 195:
      return "ANNOTATION";
    case 196:
      return "ANNOTATION_ENTRY";
    case 197:
      return "ANNOTATION_TARGET";
    case 198:
      return "TYPE_ARGUMENT_LIST";
    case 199:
      return "VALUE_ARGUMENT_LIST";
    case 200:
      return "VALUE_ARGUMENT";
    case 201:
      return "CONTRACT_EFFECT_LIST";
    case 202:
      return "CONTRACT_EFFECT";
    case 203:
      return "LAMBDA_ARGUMENT";
    case 204:
      return "VALUE_ARGUMENT_NAME";
    case 205:
      return "TYPE_REFERENCE";
    case 206:
      return "USER_TYPE";
    case 207:
      return "DYNAMIC_TYPE";
    case 208:
      return "FUNCTION_TYPE";
    case 209:
      return "FUNCTION_TYPE_RECEIVER";
    case 210:
      return "NULLABLE_TYPE";
    case 211:
      return "INTERSECTION_TYPE";
    case 212:
      return "TYPE_PROJECTION";
    case 213:
      return "PROPERTY_ACCESSOR";
    case 214:
      return "BACKING_FIELD";
    case 215:
      return "INITIALIZER";
    case 216:
      return "TYPE_CONSTRAINT_LIST";
    case 217:
      return "TYPE_CONSTRAINT";
    case 218:
      return "CONSTRUCTOR_DELEGATION_CALL";
    case 219:
      return "CONSTRUCTOR_DELEGATION_REFERENCE";
    case 220:
      return "NULL";
    case 221:
      return "BOOLEAN_CONSTANT";
    case 222:
      return "FLOAT_CONSTANT";
    case 223:
      return "CHARACTER_CONSTANT";
    case 224:
      return "INTEGER_CONSTANT";
    case 225:
      return "STRING_TEMPLATE";
    case 226:
      return "LONG_STRING_TEMPLATE_ENTRY";
    case 227:
      return "SHORT_STRING_TEMPLATE_ENTRY";
    case 228:
      return "LITERAL_STRING_TEMPLATE_ENTRY";
    case 229:
      return "ESCAPE_STRING_TEMPLATE_ENTRY";
    case 230:
      return "STRING_INTERPOLATION_PREFIX";
    case 231:
      return "PARENTHESIZED";
    case 232:
      return "RETURN";
    case 233:
      return "THROW";
    case 234:
      return "CONTINUE";
    case 235:
      return "BREAK";
    case 236:
      return "IF";
    case 237:
      return "CONDITION";
    case 238:
      return "THEN";
    case 239:
      return "ELSE";
    case 240:
      return "TRY";
    case 241:
      return "CATCH";
    case 242:
      return "FINALLY";
    case 243:
      return "FOR";
    case 244:
      return "WHILE";
    case 245:
      return "DO_WHILE";
    case 246:
      return "LOOP_RANGE";
    case 247:
      return "BODY";
    case 248:
      return "BLOCK";
    case 249:
      return "LAMBDA_EXPRESSION";
    case 250:
      return "FUNCTION_LITERAL";
    case 251:
      return "ANNOTATED_EXPRESSION";
    case 252:
      return "REFERENCE_EXPRESSION";
    case 253:
      return "ENUM_ENTRY_SUPERCLASS_REFERENCE_EXPRESSION";
    case 254:
      return "OPERATION_REFERENCE";
    case 255:
      return "LABEL";
    case 256:
      return "LABEL_QUALIFIER";
    case 257:
      return "THIS_EXPRESSION";
    case 258:
      return "SUPER_EXPRESSION";
    case 259:
      return "BINARY_EXPRESSION";
    case 260:
      return "BINARY_WITH_TYPE";
    case 261:
      return "IS_EXPRESSION";
    case 262:
      return "PREFIX_EXPRESSION";
    case 263:
      return "POSTFIX_EXPRESSION";
    case 264:
      return "LABELED_EXPRESSION";
    case 265:
      return "CALL_EXPRESSION";
    case 266:
      return "ARRAY_ACCESS_EXPRESSION";
    case 267:
      return "INDICES";
    case 268:
      return "DOT_QUALIFIED_EXPRESSION";
    case 269:
      return "CALLABLE_REFERENCE_EXPRESSION";
    case 270:
      return "CLASS_LITERAL_EXPRESSION";
    case 271:
      return "SAFE_ACCESS_EXPRESSION";
    case 272:
      return "OBJECT_LITERAL";
    case 273:
      return "WHEN";
    case 274:
      return "WHEN_ENTRY";
    case 275:
      return "WHEN_ENTRY_GUARD";
    case 276:
      return "WHEN_CONDITION_IN_RANGE";
    case 277:
      return "WHEN_CONDITION_IS_PATTERN";
    case 278:
      return "WHEN_CONDITION_WITH_EXPRESSION";
    case 279:
      return "COLLECTION_LITERAL_EXPRESSION";
    case 280:
      return "TYPE_CODE_FRAGMENT";
    case 281:
      return "EXPRESSION_CODE_FRAGMENT";
    case 282:
      return "BLOCK_CODE_FRAGMENT";
    default:
      return "?";
  }
};

/** The text of a keyword token (soft or hard), or "". */
export const ktKeywordText = (t: i32): string => {
  switch (t) {
    case T_PACKAGE_KEYWORD:
      return "package";
    case T_AS_KEYWORD:
      return "as";
    case T_TYPE_ALIAS_KEYWORD:
      return "typealias";
    case T_CLASS_KEYWORD:
      return "class";
    case T_THIS_KEYWORD:
      return "this";
    case T_SUPER_KEYWORD:
      return "super";
    case T_VAL_KEYWORD:
      return "val";
    case T_VAR_KEYWORD:
      return "var";
    case T_FUN_KEYWORD:
      return "fun";
    case T_FOR_KEYWORD:
      return "for";
    case T_NULL_KEYWORD:
      return "null";
    case T_TRUE_KEYWORD:
      return "true";
    case T_FALSE_KEYWORD:
      return "false";
    case T_IS_KEYWORD:
      return "is";
    case T_IN_KEYWORD:
      return "in";
    case T_THROW_KEYWORD:
      return "throw";
    case T_RETURN_KEYWORD:
      return "return";
    case T_BREAK_KEYWORD:
      return "break";
    case T_CONTINUE_KEYWORD:
      return "continue";
    case T_OBJECT_KEYWORD:
      return "object";
    case T_IF_KEYWORD:
      return "if";
    case T_TRY_KEYWORD:
      return "try";
    case T_ELSE_KEYWORD:
      return "else";
    case T_WHILE_KEYWORD:
      return "while";
    case T_DO_KEYWORD:
      return "do";
    case T_WHEN_KEYWORD:
      return "when";
    case T_INTERFACE_KEYWORD:
      return "interface";
    case T_TYPEOF_KEYWORD:
      return "typeof";
    case T_AS_SAFE:
      return "as?";
    case T_NOT_IN:
      return "!in";
    case T_NOT_IS:
      return "!is";
    case T_FILE_KEYWORD:
      return "file";
    case T_FIELD_KEYWORD:
      return "field";
    case T_PROPERTY_KEYWORD:
      return "property";
    case T_RECEIVER_KEYWORD:
      return "receiver";
    case T_PARAM_KEYWORD:
      return "param";
    case T_SETPARAM_KEYWORD:
      return "setparam";
    case T_DELEGATE_KEYWORD:
      return "delegate";
    case T_IMPORT_KEYWORD:
      return "import";
    case T_WHERE_KEYWORD:
      return "where";
    case T_BY_KEYWORD:
      return "by";
    case T_GET_KEYWORD:
      return "get";
    case T_SET_KEYWORD:
      return "set";
    case T_CONSTRUCTOR_KEYWORD:
      return "constructor";
    case T_INIT_KEYWORD:
      return "init";
    case T_CONTEXT_KEYWORD:
      return "context";
    case T_ABSTRACT_KEYWORD:
      return "abstract";
    case T_ENUM_KEYWORD:
      return "enum";
    case T_CONTRACT_KEYWORD:
      return "contract";
    case T_OPEN_KEYWORD:
      return "open";
    case T_INNER_KEYWORD:
      return "inner";
    case T_OVERRIDE_KEYWORD:
      return "override";
    case T_PRIVATE_KEYWORD:
      return "private";
    case T_PUBLIC_KEYWORD:
      return "public";
    case T_INTERNAL_KEYWORD:
      return "internal";
    case T_PROTECTED_KEYWORD:
      return "protected";
    case T_CATCH_KEYWORD:
      return "catch";
    case T_OUT_KEYWORD:
      return "out";
    case T_VARARG_KEYWORD:
      return "vararg";
    case T_REIFIED_KEYWORD:
      return "reified";
    case T_DYNAMIC_KEYWORD:
      return "dynamic";
    case T_COMPANION_KEYWORD:
      return "companion";
    case T_SEALED_KEYWORD:
      return "sealed";
    case T_FINALLY_KEYWORD:
      return "finally";
    case T_FINAL_KEYWORD:
      return "final";
    case T_LATEINIT_KEYWORD:
      return "lateinit";
    case T_DATA_KEYWORD:
      return "data";
    case T_VALUE_KEYWORD:
      return "value";
    case T_INLINE_KEYWORD:
      return "inline";
    case T_NOINLINE_KEYWORD:
      return "noinline";
    case T_TAILREC_KEYWORD:
      return "tailrec";
    case T_EXTERNAL_KEYWORD:
      return "external";
    case T_ANNOTATION_KEYWORD:
      return "annotation";
    case T_CROSSINLINE_KEYWORD:
      return "crossinline";
    case T_OPERATOR_KEYWORD:
      return "operator";
    case T_INFIX_KEYWORD:
      return "infix";
    case T_CONST_KEYWORD:
      return "const";
    case T_SUSPEND_KEYWORD:
      return "suspend";
    case T_EXPECT_KEYWORD:
      return "expect";
    case T_ACTUAL_KEYWORD:
      return "actual";
    case T_ALL_KEYWORD:
      return "all";
    default:
      return "";
  }
};

/** Whether a keyword token is soft (an identifier the parser may remap). */
export const ktIsSoft = (t: i32): boolean => {
  switch (t) {
    case T_FILE_KEYWORD:
    case T_FIELD_KEYWORD:
    case T_PROPERTY_KEYWORD:
    case T_RECEIVER_KEYWORD:
    case T_PARAM_KEYWORD:
    case T_SETPARAM_KEYWORD:
    case T_DELEGATE_KEYWORD:
    case T_IMPORT_KEYWORD:
    case T_WHERE_KEYWORD:
    case T_BY_KEYWORD:
    case T_GET_KEYWORD:
    case T_SET_KEYWORD:
    case T_CONSTRUCTOR_KEYWORD:
    case T_INIT_KEYWORD:
    case T_CONTEXT_KEYWORD:
    case T_ABSTRACT_KEYWORD:
    case T_ENUM_KEYWORD:
    case T_CONTRACT_KEYWORD:
    case T_OPEN_KEYWORD:
    case T_INNER_KEYWORD:
    case T_OVERRIDE_KEYWORD:
    case T_PRIVATE_KEYWORD:
    case T_PUBLIC_KEYWORD:
    case T_INTERNAL_KEYWORD:
    case T_PROTECTED_KEYWORD:
    case T_CATCH_KEYWORD:
    case T_OUT_KEYWORD:
    case T_VARARG_KEYWORD:
    case T_REIFIED_KEYWORD:
    case T_DYNAMIC_KEYWORD:
    case T_COMPANION_KEYWORD:
    case T_SEALED_KEYWORD:
    case T_FINALLY_KEYWORD:
    case T_FINAL_KEYWORD:
    case T_LATEINIT_KEYWORD:
    case T_DATA_KEYWORD:
    case T_VALUE_KEYWORD:
    case T_INLINE_KEYWORD:
    case T_NOINLINE_KEYWORD:
    case T_TAILREC_KEYWORD:
    case T_EXTERNAL_KEYWORD:
    case T_ANNOTATION_KEYWORD:
    case T_CROSSINLINE_KEYWORD:
    case T_OPERATOR_KEYWORD:
    case T_INFIX_KEYWORD:
    case T_CONST_KEYWORD:
    case T_SUSPEND_KEYWORD:
    case T_EXPECT_KEYWORD:
    case T_ACTUAL_KEYWORD:
    case T_ALL_KEYWORD:
      return true;
    default:
      return false;
  }
};

/** Whether a token is a modifier keyword (KtModifierKeywordToken). */
export const ktIsModifierKeyword = (t: i32): boolean => {
  switch (t) {
    case T_FUN_KEYWORD:
    case T_IN_KEYWORD:
    case T_ABSTRACT_KEYWORD:
    case T_ENUM_KEYWORD:
    case T_CONTRACT_KEYWORD:
    case T_OPEN_KEYWORD:
    case T_INNER_KEYWORD:
    case T_OVERRIDE_KEYWORD:
    case T_PRIVATE_KEYWORD:
    case T_PUBLIC_KEYWORD:
    case T_INTERNAL_KEYWORD:
    case T_PROTECTED_KEYWORD:
    case T_OUT_KEYWORD:
    case T_VARARG_KEYWORD:
    case T_REIFIED_KEYWORD:
    case T_COMPANION_KEYWORD:
    case T_SEALED_KEYWORD:
    case T_FINAL_KEYWORD:
    case T_LATEINIT_KEYWORD:
    case T_DATA_KEYWORD:
    case T_VALUE_KEYWORD:
    case T_INLINE_KEYWORD:
    case T_NOINLINE_KEYWORD:
    case T_TAILREC_KEYWORD:
    case T_EXTERNAL_KEYWORD:
    case T_ANNOTATION_KEYWORD:
    case T_CROSSINLINE_KEYWORD:
    case T_OPERATOR_KEYWORD:
    case T_INFIX_KEYWORD:
    case T_CONST_KEYWORD:
    case T_SUSPEND_KEYWORD:
    case T_EXPECT_KEYWORD:
    case T_ACTUAL_KEYWORD:
      return true;
    default:
      return false;
  }
};

/** Whether a token is a keyword token (KtKeywordToken, soft or hard). */
export const ktIsKeyword = (t: i32): boolean => ktKeywordText(t).length > 0;

/** The soft keyword token whose text is `s`, or -1. */
export const ktSoftKeyword = (s: string): i32 => {
  if (s === "file") {
    return T_FILE_KEYWORD;
  }
  if (s === "field") {
    return T_FIELD_KEYWORD;
  }
  if (s === "property") {
    return T_PROPERTY_KEYWORD;
  }
  if (s === "receiver") {
    return T_RECEIVER_KEYWORD;
  }
  if (s === "param") {
    return T_PARAM_KEYWORD;
  }
  if (s === "setparam") {
    return T_SETPARAM_KEYWORD;
  }
  if (s === "delegate") {
    return T_DELEGATE_KEYWORD;
  }
  if (s === "import") {
    return T_IMPORT_KEYWORD;
  }
  if (s === "where") {
    return T_WHERE_KEYWORD;
  }
  if (s === "by") {
    return T_BY_KEYWORD;
  }
  if (s === "get") {
    return T_GET_KEYWORD;
  }
  if (s === "set") {
    return T_SET_KEYWORD;
  }
  if (s === "constructor") {
    return T_CONSTRUCTOR_KEYWORD;
  }
  if (s === "init") {
    return T_INIT_KEYWORD;
  }
  if (s === "context") {
    return T_CONTEXT_KEYWORD;
  }
  if (s === "abstract") {
    return T_ABSTRACT_KEYWORD;
  }
  if (s === "enum") {
    return T_ENUM_KEYWORD;
  }
  if (s === "contract") {
    return T_CONTRACT_KEYWORD;
  }
  if (s === "open") {
    return T_OPEN_KEYWORD;
  }
  if (s === "inner") {
    return T_INNER_KEYWORD;
  }
  if (s === "override") {
    return T_OVERRIDE_KEYWORD;
  }
  if (s === "private") {
    return T_PRIVATE_KEYWORD;
  }
  if (s === "public") {
    return T_PUBLIC_KEYWORD;
  }
  if (s === "internal") {
    return T_INTERNAL_KEYWORD;
  }
  if (s === "protected") {
    return T_PROTECTED_KEYWORD;
  }
  if (s === "catch") {
    return T_CATCH_KEYWORD;
  }
  if (s === "out") {
    return T_OUT_KEYWORD;
  }
  if (s === "vararg") {
    return T_VARARG_KEYWORD;
  }
  if (s === "reified") {
    return T_REIFIED_KEYWORD;
  }
  if (s === "dynamic") {
    return T_DYNAMIC_KEYWORD;
  }
  if (s === "companion") {
    return T_COMPANION_KEYWORD;
  }
  if (s === "sealed") {
    return T_SEALED_KEYWORD;
  }
  if (s === "finally") {
    return T_FINALLY_KEYWORD;
  }
  if (s === "final") {
    return T_FINAL_KEYWORD;
  }
  if (s === "lateinit") {
    return T_LATEINIT_KEYWORD;
  }
  if (s === "data") {
    return T_DATA_KEYWORD;
  }
  if (s === "value") {
    return T_VALUE_KEYWORD;
  }
  if (s === "inline") {
    return T_INLINE_KEYWORD;
  }
  if (s === "noinline") {
    return T_NOINLINE_KEYWORD;
  }
  if (s === "tailrec") {
    return T_TAILREC_KEYWORD;
  }
  if (s === "external") {
    return T_EXTERNAL_KEYWORD;
  }
  if (s === "annotation") {
    return T_ANNOTATION_KEYWORD;
  }
  if (s === "crossinline") {
    return T_CROSSINLINE_KEYWORD;
  }
  if (s === "operator") {
    return T_OPERATOR_KEYWORD;
  }
  if (s === "infix") {
    return T_INFIX_KEYWORD;
  }
  if (s === "const") {
    return T_CONST_KEYWORD;
  }
  if (s === "suspend") {
    return T_SUSPEND_KEYWORD;
  }
  if (s === "expect") {
    return T_EXPECT_KEYWORD;
  }
  if (s === "actual") {
    return T_ACTUAL_KEYWORD;
  }
  if (s === "all") {
    return T_ALL_KEYWORD;
  }
  return -1;
};
