// The parts of the analyzer's AST that dart_style reads, as parallel arrays:
// a node is an index with a kind, its first and last token, and a run of
// fields that hold token indices, node indices or list ids (-1 for none).
// Node kinds and field names follow package:analyzer (BSD-3-Clause,
// Copyright the Dart project authors).

// Node kinds.
export const N_NONE: i32 = 0;
export const N_COMPILATION_UNIT: i32 = 1;
export const N_SCRIPT_TAG: i32 = 2;
export const N_LIBRARY_DIRECTIVE: i32 = 3;
export const N_IMPORT_DIRECTIVE: i32 = 4;
export const N_EXPORT_DIRECTIVE: i32 = 5;
export const N_PART_DIRECTIVE: i32 = 6;
export const N_PART_OF_DIRECTIVE: i32 = 7;
export const N_CONFIGURATION: i32 = 8;
export const N_SHOW_COMBINATOR: i32 = 9;
export const N_HIDE_COMBINATOR: i32 = 10;
export const N_DOTTED_NAME: i32 = 11;
export const N_ANNOTATION: i32 = 12;
export const N_CLASS_DECLARATION: i32 = 13;
export const N_MIXIN_DECLARATION: i32 = 14;
export const N_EXTENSION_DECLARATION: i32 = 15;
export const N_EXTENSION_TYPE_DECLARATION: i32 = 16;
export const N_ENUM_DECLARATION: i32 = 17;
export const N_CLASS_TYPE_ALIAS: i32 = 18;
export const N_FUNCTION_TYPE_ALIAS: i32 = 19;
export const N_GENERIC_TYPE_ALIAS: i32 = 20;
export const N_FUNCTION_DECLARATION: i32 = 21;
export const N_TOP_LEVEL_VARIABLE_DECLARATION: i32 = 22;
export const N_NAME_WITH_TYPE_PARAMETERS: i32 = 23;
export const N_PRIMARY_CONSTRUCTOR_DECLARATION: i32 = 24;
export const N_PRIMARY_CONSTRUCTOR_NAME: i32 = 25;
export const N_BLOCK_CLASS_BODY: i32 = 26;
export const N_EMPTY_CLASS_BODY: i32 = 27;
export const N_BLOCK_ENUM_BODY: i32 = 28;
export const N_EMPTY_ENUM_BODY: i32 = 29;
export const N_EXTENDS_CLAUSE: i32 = 30;
export const N_WITH_CLAUSE: i32 = 31;
export const N_IMPLEMENTS_CLAUSE: i32 = 32;
export const N_MIXIN_ON_CLAUSE: i32 = 33;
export const N_EXTENSION_ON_CLAUSE: i32 = 34;
export const N_NATIVE_CLAUSE: i32 = 35;
export const N_ENUM_CONSTANT_DECLARATION: i32 = 36;
export const N_ENUM_CONSTANT_ARGUMENTS: i32 = 37;
export const N_CONSTRUCTOR_SELECTOR: i32 = 38;
export const N_CONSTRUCTOR_DECLARATION: i32 = 39;
export const N_METHOD_DECLARATION: i32 = 40;
export const N_FIELD_DECLARATION: i32 = 41;
export const N_PRIMARY_CONSTRUCTOR_BODY: i32 = 42;
export const N_CONSTRUCTOR_FIELD_INITIALIZER: i32 = 43;
export const N_SUPER_CONSTRUCTOR_INVOCATION: i32 = 44;
export const N_REDIRECTING_CONSTRUCTOR_INVOCATION: i32 = 45;
export const N_ASSERT_INITIALIZER: i32 = 46;
export const N_CONSTRUCTOR_NAME: i32 = 47;
export const N_TYPE_PARAMETER_LIST: i32 = 48;
export const N_TYPE_PARAMETER: i32 = 49;
export const N_TYPE_ARGUMENT_LIST: i32 = 50;
export const N_NAMED_TYPE: i32 = 51;
export const N_GENERIC_FUNCTION_TYPE: i32 = 52;
export const N_RECORD_TYPE_ANNOTATION: i32 = 53;
export const N_RECORD_TYPE_NAMED_FIELDS: i32 = 54;
export const N_RECORD_TYPE_POSITIONAL_FIELD: i32 = 55;
export const N_RECORD_TYPE_NAMED_FIELD: i32 = 56;
export const N_FORMAL_PARAMETER_LIST: i32 = 57;
export const N_REGULAR_FORMAL_PARAMETER: i32 = 58;
export const N_FIELD_FORMAL_PARAMETER: i32 = 59;
export const N_SUPER_FORMAL_PARAMETER: i32 = 60;
export const N_FORMAL_PARAMETER_DEFAULT_CLAUSE: i32 = 61;
export const N_FUNCTION_TYPED_SUFFIX: i32 = 62;
export const N_BLOCK_FUNCTION_BODY: i32 = 63;
export const N_EXPRESSION_FUNCTION_BODY: i32 = 64;
export const N_EMPTY_FUNCTION_BODY: i32 = 65;
export const N_NATIVE_FUNCTION_BODY: i32 = 66;
// Statements.
export const N_BLOCK: i32 = 70;
export const N_EXPRESSION_STATEMENT: i32 = 71;
export const N_VARIABLE_DECLARATION_STATEMENT: i32 = 72;
export const N_VARIABLE_DECLARATION_LIST: i32 = 73;
export const N_VARIABLE_DECLARATION: i32 = 74;
export const N_PATTERN_VARIABLE_DECLARATION_STATEMENT: i32 = 75;
export const N_PATTERN_VARIABLE_DECLARATION: i32 = 76;
export const N_IF_STATEMENT: i32 = 77;
export const N_FOR_STATEMENT: i32 = 78;
export const N_FOR_PARTS_WITH_DECLARATIONS: i32 = 79;
export const N_FOR_PARTS_WITH_EXPRESSION: i32 = 80;
export const N_FOR_PARTS_WITH_PATTERN: i32 = 81;
export const N_FOR_EACH_PARTS_WITH_DECLARATION: i32 = 82;
export const N_FOR_EACH_PARTS_WITH_IDENTIFIER: i32 = 83;
export const N_FOR_EACH_PARTS_WITH_PATTERN: i32 = 84;
export const N_DECLARED_IDENTIFIER: i32 = 85;
export const N_WHILE_STATEMENT: i32 = 86;
export const N_DO_STATEMENT: i32 = 87;
export const N_SWITCH_STATEMENT: i32 = 88;
export const N_SWITCH_PATTERN_CASE: i32 = 89;
export const N_SWITCH_DEFAULT: i32 = 90;
export const N_LABEL: i32 = 91;
export const N_TRY_STATEMENT: i32 = 92;
export const N_CATCH_CLAUSE: i32 = 93;
export const N_CATCH_CLAUSE_PARAMETER: i32 = 94;
export const N_RETURN_STATEMENT: i32 = 95;
export const N_BREAK_STATEMENT: i32 = 96;
export const N_CONTINUE_STATEMENT: i32 = 97;
export const N_LABEL_REFERENCE: i32 = 98;
export const N_YIELD_STATEMENT: i32 = 99;
export const N_ASSERT_STATEMENT: i32 = 100;
export const N_LABELED_STATEMENT: i32 = 101;
export const N_EMPTY_STATEMENT: i32 = 102;
export const N_FUNCTION_DECLARATION_STATEMENT: i32 = 103;
export const N_GUARDED_PATTERN: i32 = 104;
export const N_WHEN_CLAUSE: i32 = 105;
export const N_CASE_CLAUSE: i32 = 106;
// Expressions.
export const N_SIMPLE_IDENTIFIER: i32 = 110;
export const N_PREFIXED_IDENTIFIER: i32 = 111;
export const N_BOOLEAN_LITERAL: i32 = 112;
export const N_NULL_LITERAL: i32 = 113;
export const N_INTEGER_LITERAL: i32 = 114;
export const N_DOUBLE_LITERAL: i32 = 115;
export const N_SIMPLE_STRING_LITERAL: i32 = 116;
export const N_STRING_INTERPOLATION: i32 = 117;
export const N_INTERPOLATION_STRING: i32 = 118;
export const N_INTERPOLATION_EXPRESSION: i32 = 119;
export const N_ADJACENT_STRINGS: i32 = 120;
export const N_SYMBOL_LITERAL: i32 = 121;
export const N_THIS_EXPRESSION: i32 = 122;
export const N_SUPER_EXPRESSION: i32 = 123;
export const N_RETHROW_EXPRESSION: i32 = 124;
export const N_LIST_LITERAL: i32 = 125;
export const N_SET_OR_MAP_LITERAL: i32 = 126;
export const N_MAP_LITERAL_ENTRY: i32 = 127;
export const N_RECORD_LITERAL: i32 = 128;
export const N_RECORD_LITERAL_NAMED_FIELD: i32 = 129;
export const N_NAMED_ARGUMENT: i32 = 130;
export const N_PARENTHESIZED_EXPRESSION: i32 = 131;
export const N_FUNCTION_EXPRESSION: i32 = 132;
export const N_FUNCTION_EXPRESSION_INVOCATION: i32 = 133;
export const N_FUNCTION_REFERENCE: i32 = 134;
export const N_METHOD_INVOCATION: i32 = 135;
export const N_PROPERTY_ACCESS: i32 = 136;
export const N_INDEX_EXPRESSION: i32 = 137;
export const N_INSTANCE_CREATION_EXPRESSION: i32 = 138;
export const N_ARGUMENT_LIST: i32 = 139;
export const N_ASSIGNMENT_EXPRESSION: i32 = 140;
export const N_BINARY_EXPRESSION: i32 = 141;
export const N_PREFIX_EXPRESSION: i32 = 142;
export const N_POSTFIX_EXPRESSION: i32 = 143;
export const N_CONDITIONAL_EXPRESSION: i32 = 144;
export const N_AS_EXPRESSION: i32 = 145;
export const N_IS_EXPRESSION: i32 = 146;
export const N_AWAIT_EXPRESSION: i32 = 147;
export const N_THROW_EXPRESSION: i32 = 148;
export const N_CASCADE_EXPRESSION: i32 = 149;
export const N_SWITCH_EXPRESSION: i32 = 150;
export const N_SWITCH_EXPRESSION_CASE: i32 = 151;
export const N_DOT_SHORTHAND_INVOCATION: i32 = 152;
export const N_DOT_SHORTHAND_PROPERTY_ACCESS: i32 = 153;
export const N_DOT_SHORTHAND_CONSTRUCTOR_INVOCATION: i32 = 154;
export const N_SPREAD_ELEMENT: i32 = 155;
export const N_NULL_AWARE_ELEMENT: i32 = 156;
export const N_IF_ELEMENT: i32 = 157;
export const N_FOR_ELEMENT: i32 = 158;
export const N_PATTERN_ASSIGNMENT: i32 = 159;
// Patterns.
export const N_CONSTANT_PATTERN: i32 = 170;
export const N_DECLARED_VARIABLE_PATTERN: i32 = 171;
export const N_ASSIGNED_VARIABLE_PATTERN: i32 = 172;
export const N_WILDCARD_PATTERN: i32 = 173;
export const N_LIST_PATTERN: i32 = 174;
export const N_MAP_PATTERN: i32 = 175;
export const N_MAP_PATTERN_ENTRY: i32 = 176;
export const N_RECORD_PATTERN: i32 = 177;
export const N_PATTERN_FIELD: i32 = 178;
export const N_PATTERN_FIELD_NAME: i32 = 179;
export const N_OBJECT_PATTERN: i32 = 180;
export const N_PARENTHESIZED_PATTERN: i32 = 181;
export const N_LOGICAL_OR_PATTERN: i32 = 182;
export const N_LOGICAL_AND_PATTERN: i32 = 183;
export const N_RELATIONAL_PATTERN: i32 = 184;
export const N_CAST_PATTERN: i32 = 185;
export const N_NULL_CHECK_PATTERN: i32 = 186;
export const N_NULL_ASSERT_PATTERN: i32 = 187;
export const N_REST_PATTERN_ELEMENT: i32 = 188;
export const N_LAST: i32 = 190;

// Field layouts. Each kind's fields, in order. `T` marks a token, `N` a
// node, `L` a list id.
// CompilationUnit: scriptTag N, directives L, declarations L
// ScriptTag: tok T
// LibraryDirective: metadata L, keyword T, name N, semicolon T
// Import/ExportDirective: metadata L, keyword T, uri N, configurations L,
//   deferred T, as T, prefix N, combinators L, semicolon T
// PartDirective: metadata L, partKeyword T, uri N, configurations L, semicolon T
// PartOfDirective: metadata L, partKeyword T, ofKeyword T, libraryName N, uri N, semicolon T
// Configuration: if T, lp T, name N, equal T, value N, rp T, uri N
// Show/HideCombinator: keyword T, names L
// DottedName: tokens L (tokens, not nodes)
// Annotation: at T, name N, typeArguments N, period T, constructorName N, arguments N
// ClassDeclaration: metadata L, abstract T, base T, interface T, final T,
//   sealed T, mixin T, class T, namePart N, extends N, with N, implements N,
//   native N, body N
// MixinDeclaration: metadata L, base T, mixin T, name T, typeParameters N,
//   on N, implements N, body N
// ExtensionDeclaration: metadata L, extension T, type T, name T,
//   typeParameters N, on N, body N
// ExtensionTypeDeclaration: metadata L, extension T, type T, namePart N, implements N, body N
// EnumDeclaration: metadata L, enum T, namePart N, with N, implements N, body N
// ClassTypeAlias: metadata L, abstract T, base T, interface T, final T,
//   sealed T, mixin T, typedef T, name T, typeParameters N, equals T,
//   superclass N, with N, implements N, semicolon T
// FunctionTypeAlias: metadata L, typedef T, returnType N, name T,
//   typeParameters N, parameters N, semicolon T
// GenericTypeAlias: metadata L, typedef T, name T, typeParameters N, equals T, type N, semicolon T
// FunctionDeclaration: metadata L, external T, returnType N, property T,
//   name T, functionExpression N
// TopLevelVariableDeclaration: metadata L, external T, variables N, semicolon T
// NameWithTypeParameters: name T, typeParameters N
// PrimaryConstructorDeclaration: const T, name T, typeParameters N,
//   constructorName N, formalParameters N
// PrimaryConstructorName: period T, name T
// BlockClassBody: lb T, members L, rb T
// EmptyClassBody / EmptyEnumBody: semicolon T
// BlockEnumBody: lb T, constants L, semicolon T, members L, rb T
// Extends/With/Implements/MixinOn/ExtensionOnClause: keyword T, types L
// NativeClause: native T, name N
// EnumConstantDeclaration: metadata L, name T, arguments N
// EnumConstantArguments: typeArguments N, constructorSelector N, argumentList N
// ConstructorSelector: period T, name N
// ConstructorDeclaration: metadata L, external T, const T, factory T, new T,
//   typeName N, period T, name T, parameters N, separator T,
//   initializers L, redirectedConstructor N, body N
// MethodDeclaration: metadata L, external T, modifier T, returnType N,
//   property T, operator T, name T, typeParameters N, parameters N, body N
// FieldDeclaration: metadata L, external T, static T, abstract T,
//   covariant T, fields N, semicolon T
// PrimaryConstructorBody: metadata L, this T, colon T, initializers L, body N
// ConstructorFieldInitializer: this T, period T, fieldName N, equals T, expression N
// Super/RedirectingConstructorInvocation: keyword T, period T, constructorName N, argumentList N
// AssertInitializer / AssertStatement: assert T, lp T, condition N, comma T,
//   message N, rp T, semicolon T
// ConstructorName: type N, period T, name N
// TypeParameterList / TypeArgumentList: lb T, items L, rb T
// TypeParameter: metadata L, name T, extends T, bound N
// NamedType: prefixName T, prefixPeriod T, name T, typeArguments N, question T
// GenericFunctionType: returnType N, function T, typeParameters N, parameters N, question T
// RecordTypeAnnotation: lp T, positional L, named N, rp T, question T
// RecordTypeNamedFields: lb T, fields L, rb T
// RecordTypePositional/NamedField: metadata L, type N, name T
// FormalParameterList: lp T, parameters L, leftDelimiter T, rightDelimiter T, rp T
// Regular/Field/SuperFormalParameter: metadata L, required T, covariant T,
//   mutable T, type N, keyword T (this/super), period T, name T,
//   suffix N, defaultClause N, kind (0 required, 1 optional positional, 2 named)
// FormalParameterDefaultClause: separator T, value N
// FunctionTypedSuffix: typeParameters N, parameters N, question T
// BlockFunctionBody: keyword T, star T, block N
// ExpressionFunctionBody: keyword T, star T, arrow T, expression N, semicolon T
// EmptyFunctionBody: semicolon T
// NativeFunctionBody: native T, string N, semicolon T
// Block: lb T, statements L, rb T
// ExpressionStatement: expression N, semicolon T
// VariableDeclarationStatement: variables N, semicolon T
// VariableDeclarationList: metadata L, late T, keyword T, type N, variables L
// VariableDeclaration: name T, equals T, initializer N
// PatternVariableDeclarationStatement: declaration N, semicolon T
// PatternVariableDeclaration: metadata L, keyword T, pattern N, equals T, expression N
// IfStatement / IfElement: if T, lp T, expression N, caseClause N, rp T,
//   then N, else T, elseBranch N
// ForStatement / ForElement: await T, for T, lp T, parts N, rp T, body N
// ForPartsWithDeclarations/Expression/Pattern: init N, leftSep T,
//   condition N, rightSep T, updaters L
// ForEachPartsWithDeclaration: loopVariable N, in T, iterable N
// ForEachPartsWithIdentifier: identifier N, in T, iterable N
// ForEachPartsWithPattern: metadata L, keyword T, pattern N, in T, iterable N
// DeclaredIdentifier: metadata L, keyword T, type N, name T
// WhileStatement: while T, lp T, condition N, rp T, body N
// DoStatement: do T, body N, while T, lp T, condition N, rp T, semicolon T
// SwitchStatement: switch T, lp T, expression N, rp T, lb T, members L, rb T
// SwitchPatternCase: labels L, keyword T, guardedPattern N, colon T, statements L
// SwitchDefault: labels L, keyword T, colon T, statements L
// Label: name T, colon T
// TryStatement: try T, body N, catchClauses L, finally T, finallyBlock N
// CatchClause: on T, exceptionType N, catch T, lp T, exceptionParameter N,
//   comma T, stackTraceParameter N, rp T, body N
// CatchClauseParameter: name T
// ReturnStatement: return T, expression N, semicolon T
// Break/ContinueStatement: keyword T, label N, semicolon T
// LabelReference: name T
// YieldStatement: yield T, star T, expression N, semicolon T
// LabeledStatement: labels L, statement N
// EmptyStatement: semicolon T
// FunctionDeclarationStatement: functionDeclaration N
// GuardedPattern: pattern N, whenClause N
// WhenClause: when T, expression N
// CaseClause: case T, guardedPattern N
// SimpleIdentifier: tok T
// PrefixedIdentifier: prefix N, period T, identifier N
// Boolean/Null/Integer/Double/SimpleStringLiteral: tok T
// StringInterpolation: elements L
// InterpolationString: contents T
// InterpolationExpression: lb T, expression N, rb T
// AdjacentStrings: strings L, indentStrings (1 or 0)
// SymbolLiteral: pound T, components L (tokens)
// This/Super/RethrowExpression: tok T
// ListLiteral / SetOrMapLiteral: const T, typeArguments N, lb T, elements L, rb T
// MapLiteralEntry: keyQuestion T, key N, separator T, valueQuestion T, value N
// RecordLiteral: const T, lp T, fields L, rp T
// RecordLiteralNamedField / NamedArgument: name T, colon T, expression N
// ParenthesizedExpression / ParenthesizedPattern: lp T, expression N, rp T
// FunctionExpression: typeParameters N, parameters N, body N
// FunctionExpressionInvocation: function N, typeArguments N, argumentList N
// FunctionReference: function N, typeArguments N
// MethodInvocation: target N, operator T, methodName N, typeArguments N, argumentList N
// PropertyAccess: target N, operator T, propertyName N
// IndexExpression: target N, period T, question T, lb T, index N, rb T
// InstanceCreationExpression: keyword T, constructorName N, argumentList N
// ArgumentList: lp T, arguments L, rp T
// AssignmentExpression / BinaryExpression / Logical*Pattern / PatternAssignment:
//   left N, operator T, right N
// PrefixExpression / RelationalPattern / RestPatternElement / Spread /
//   NullAwareElement / Await / Throw: operator T, operand N
// PostfixExpression / NullCheckPattern / NullAssertPattern: operand N, operator T
// ConditionalExpression: condition N, question T, then N, colon T, else N
// AsExpression / CastPattern: expression N, as T, type N
// IsExpression: expression N, is T, not T, type N
// CascadeExpression: target N, sections L
// SwitchExpression: switch T, lp T, expression N, rp T, lb T, cases L, rb T
// SwitchExpressionCase: guardedPattern N, arrow T, expression N
// DotShorthandInvocation: period T, memberName N, typeArguments N, argumentList N
// DotShorthandPropertyAccess: period T, propertyName N
// DotShorthandConstructorInvocation: const T, period T, constructorName N,
//   typeArguments N, argumentList N
// ConstantPattern: const T, expression N
// DeclaredVariablePattern / WildcardPattern: keyword T, type N, name T
// AssignedVariablePattern: name T
// ListPattern / MapPattern: typeArguments N, lb T, elements L, rb T
// MapPatternEntry: key N, separator T, value N
// RecordPattern: lp T, fields L, rp T
// PatternField: name N, pattern N
// PatternFieldName: name T, colon T
// ObjectPattern: type N, lp T, fields L, rp T

/** The AST of one file. */
export class DtAst {
  n: i32 = 0;
  kind: i32[];
  beg: i32[];
  end: i32[];
  fs: i32[];
  nf: i32 = 0;
  fld: i32[];
  nl: i32 = 1;
  lst: i32[];

  constructor(cap: i32) {
    const c = cap < 64 ? 64 : cap;
    this.kind = new Array<i32>(c);
    this.beg = new Array<i32>(c);
    this.end = new Array<i32>(c);
    this.fs = new Array<i32>(c);
    this.fld = new Array<i32>(c * 4);
    this.lst = new Array<i32>(c);
    this.lst[0] = 0; // the empty list
  }

  /** Adds a node with `k` fields, all -1; answers it. */
  add(kind: i32, beg: i32, end: i32, k: i32): i32 {
    const i = this.n;
    if (i >= toI32(this.kind.length)) {
      const c = i * 2;
      this.kind = dtGrow(this.kind, c);
      this.beg = dtGrow(this.beg, c);
      this.end = dtGrow(this.end, c);
      this.fs = dtGrow(this.fs, c);
    }
    if (this.nf + k > toI32(this.fld.length)) {
      this.fld = dtGrow(this.fld, (this.nf + k) * 2);
    }
    this.kind[i] = kind;
    this.beg[i] = beg;
    this.end[i] = end;
    this.fs[i] = this.nf;
    for (let j = 0; j < k; j++) {
      this.fld[this.nf + j] = -1;
    }
    this.nf = this.nf + k;
    this.n = i + 1;
    return i;
  }

  f(node: i32, i: i32): i32 {
    return this.fld[this.fs[node] + i];
  }

  set(node: i32, i: i32, v: i32): void {
    this.fld[this.fs[node] + i] = v;
  }

  /** Stores `xs` as a list; answers its id. */
  list(xs: i32[]): i32 {
    const k = toI32(xs.length);
    if (k === 0) {
      return 0;
    }
    if (this.nl + k + 1 > toI32(this.lst.length)) {
      this.lst = dtGrow(this.lst, (this.nl + k + 1) * 2);
    }
    const id = this.nl;
    this.lst[id] = k;
    for (let j = 0; j < k; j++) {
      this.lst[id + 1 + j] = xs[j];
    }
    this.nl = id + k + 1;
    return id;
  }

  len(l: i32): i32 {
    if (l < 0) {
      return 0;
    }
    return this.lst[l];
  }

  at(l: i32, i: i32): i32 {
    return this.lst[l + 1 + i];
  }

  last(l: i32): i32 {
    return this.lst[l + this.lst[l]];
  }
}

export const dtGrow = (xs: i32[], n: i32): i32[] => {
  const out = new Array<i32>(n);
  out.set(xs);
  return out;
};

/** The analyzer's class name for node kind `k`. */
export const dtNodeName = (k: i32): string => {
  switch (k) {
    case N_COMPILATION_UNIT: return "CompilationUnit";
    case N_SCRIPT_TAG: return "ScriptTag";
    case N_LIBRARY_DIRECTIVE: return "LibraryDirective";
    case N_IMPORT_DIRECTIVE: return "ImportDirective";
    case N_EXPORT_DIRECTIVE: return "ExportDirective";
    case N_PART_DIRECTIVE: return "PartDirective";
    case N_PART_OF_DIRECTIVE: return "PartOfDirective";
    case N_CONFIGURATION: return "Configuration";
    case N_SHOW_COMBINATOR: return "ShowCombinator";
    case N_HIDE_COMBINATOR: return "HideCombinator";
    case N_DOTTED_NAME: return "DottedName";
    case N_ANNOTATION: return "Annotation";
    case N_CLASS_DECLARATION: return "ClassDeclaration";
    case N_MIXIN_DECLARATION: return "MixinDeclaration";
    case N_EXTENSION_DECLARATION: return "ExtensionDeclaration";
    case N_EXTENSION_TYPE_DECLARATION: return "ExtensionTypeDeclaration";
    case N_ENUM_DECLARATION: return "EnumDeclaration";
    case N_CLASS_TYPE_ALIAS: return "ClassTypeAlias";
    case N_FUNCTION_TYPE_ALIAS: return "FunctionTypeAlias";
    case N_GENERIC_TYPE_ALIAS: return "GenericTypeAlias";
    case N_FUNCTION_DECLARATION: return "FunctionDeclaration";
    case N_TOP_LEVEL_VARIABLE_DECLARATION: return "TopLevelVariableDeclaration";
    case N_NAME_WITH_TYPE_PARAMETERS: return "NameWithTypeParameters";
    case N_PRIMARY_CONSTRUCTOR_DECLARATION: return "PrimaryConstructorDeclaration";
    case N_PRIMARY_CONSTRUCTOR_NAME: return "PrimaryConstructorName";
    case N_BLOCK_CLASS_BODY: return "BlockClassBody";
    case N_EMPTY_CLASS_BODY: return "EmptyClassBody";
    case N_BLOCK_ENUM_BODY: return "BlockEnumBody";
    case N_EMPTY_ENUM_BODY: return "EmptyEnumBody";
    case N_EXTENDS_CLAUSE: return "ExtendsClause";
    case N_WITH_CLAUSE: return "WithClause";
    case N_IMPLEMENTS_CLAUSE: return "ImplementsClause";
    case N_MIXIN_ON_CLAUSE: return "MixinOnClause";
    case N_EXTENSION_ON_CLAUSE: return "ExtensionOnClause";
    case N_NATIVE_CLAUSE: return "NativeClause";
    case N_ENUM_CONSTANT_DECLARATION: return "EnumConstantDeclaration";
    case N_ENUM_CONSTANT_ARGUMENTS: return "EnumConstantArguments";
    case N_CONSTRUCTOR_SELECTOR: return "ConstructorSelector";
    case N_CONSTRUCTOR_DECLARATION: return "ConstructorDeclaration";
    case N_METHOD_DECLARATION: return "MethodDeclaration";
    case N_FIELD_DECLARATION: return "FieldDeclaration";
    case N_PRIMARY_CONSTRUCTOR_BODY: return "PrimaryConstructorBody";
    case N_CONSTRUCTOR_FIELD_INITIALIZER: return "ConstructorFieldInitializer";
    case N_SUPER_CONSTRUCTOR_INVOCATION: return "SuperConstructorInvocation";
    case N_REDIRECTING_CONSTRUCTOR_INVOCATION: return "RedirectingConstructorInvocation";
    case N_ASSERT_INITIALIZER: return "AssertInitializer";
    case N_CONSTRUCTOR_NAME: return "ConstructorName";
    case N_TYPE_PARAMETER_LIST: return "TypeParameterList";
    case N_TYPE_PARAMETER: return "TypeParameter";
    case N_TYPE_ARGUMENT_LIST: return "TypeArgumentList";
    case N_NAMED_TYPE: return "NamedType";
    case N_GENERIC_FUNCTION_TYPE: return "GenericFunctionType";
    case N_RECORD_TYPE_ANNOTATION: return "RecordTypeAnnotation";
    case N_RECORD_TYPE_NAMED_FIELDS: return "RecordTypeAnnotationNamedFields";
    case N_RECORD_TYPE_POSITIONAL_FIELD: return "RecordTypeAnnotationPositionalField";
    case N_RECORD_TYPE_NAMED_FIELD: return "RecordTypeAnnotationNamedField";
    case N_FORMAL_PARAMETER_LIST: return "FormalParameterList";
    case N_REGULAR_FORMAL_PARAMETER: return "RegularFormalParameter";
    case N_FIELD_FORMAL_PARAMETER: return "FieldFormalParameter";
    case N_SUPER_FORMAL_PARAMETER: return "SuperFormalParameter";
    case N_FORMAL_PARAMETER_DEFAULT_CLAUSE: return "FormalParameterDefaultClause";
    case N_FUNCTION_TYPED_SUFFIX: return "FunctionTypedFormalParameterSuffix";
    case N_BLOCK_FUNCTION_BODY: return "BlockFunctionBody";
    case N_EXPRESSION_FUNCTION_BODY: return "ExpressionFunctionBody";
    case N_EMPTY_FUNCTION_BODY: return "EmptyFunctionBody";
    case N_NATIVE_FUNCTION_BODY: return "NativeFunctionBody";
    case N_BLOCK: return "Block";
    case N_EXPRESSION_STATEMENT: return "ExpressionStatement";
    case N_VARIABLE_DECLARATION_STATEMENT: return "VariableDeclarationStatement";
    case N_VARIABLE_DECLARATION_LIST: return "VariableDeclarationList";
    case N_VARIABLE_DECLARATION: return "VariableDeclaration";
    case N_PATTERN_VARIABLE_DECLARATION_STATEMENT: return "PatternVariableDeclarationStatement";
    case N_PATTERN_VARIABLE_DECLARATION: return "PatternVariableDeclaration";
    case N_IF_STATEMENT: return "IfStatement";
    case N_FOR_STATEMENT: return "ForStatement";
    case N_FOR_PARTS_WITH_DECLARATIONS: return "ForPartsWithDeclarations";
    case N_FOR_PARTS_WITH_EXPRESSION: return "ForPartsWithExpression";
    case N_FOR_PARTS_WITH_PATTERN: return "ForPartsWithPattern";
    case N_FOR_EACH_PARTS_WITH_DECLARATION: return "ForEachPartsWithDeclaration";
    case N_FOR_EACH_PARTS_WITH_IDENTIFIER: return "ForEachPartsWithIdentifier";
    case N_FOR_EACH_PARTS_WITH_PATTERN: return "ForEachPartsWithPattern";
    case N_DECLARED_IDENTIFIER: return "DeclaredIdentifier";
    case N_WHILE_STATEMENT: return "WhileStatement";
    case N_DO_STATEMENT: return "DoStatement";
    case N_SWITCH_STATEMENT: return "SwitchStatement";
    case N_SWITCH_PATTERN_CASE: return "SwitchPatternCase";
    case N_SWITCH_DEFAULT: return "SwitchDefault";
    case N_LABEL: return "Label";
    case N_TRY_STATEMENT: return "TryStatement";
    case N_CATCH_CLAUSE: return "CatchClause";
    case N_CATCH_CLAUSE_PARAMETER: return "CatchClauseParameter";
    case N_RETURN_STATEMENT: return "ReturnStatement";
    case N_BREAK_STATEMENT: return "BreakStatement";
    case N_CONTINUE_STATEMENT: return "ContinueStatement";
    case N_LABEL_REFERENCE: return "LabelReference";
    case N_YIELD_STATEMENT: return "YieldStatement";
    case N_ASSERT_STATEMENT: return "AssertStatement";
    case N_LABELED_STATEMENT: return "LabeledStatement";
    case N_EMPTY_STATEMENT: return "EmptyStatement";
    case N_FUNCTION_DECLARATION_STATEMENT: return "FunctionDeclarationStatement";
    case N_GUARDED_PATTERN: return "GuardedPattern";
    case N_WHEN_CLAUSE: return "WhenClause";
    case N_CASE_CLAUSE: return "CaseClause";
    case N_SIMPLE_IDENTIFIER: return "SimpleIdentifier";
    case N_PREFIXED_IDENTIFIER: return "PrefixedIdentifier";
    case N_BOOLEAN_LITERAL: return "BooleanLiteral";
    case N_NULL_LITERAL: return "NullLiteral";
    case N_INTEGER_LITERAL: return "IntegerLiteral";
    case N_DOUBLE_LITERAL: return "DoubleLiteral";
    case N_SIMPLE_STRING_LITERAL: return "SimpleStringLiteral";
    case N_STRING_INTERPOLATION: return "StringInterpolation";
    case N_INTERPOLATION_STRING: return "InterpolationString";
    case N_INTERPOLATION_EXPRESSION: return "InterpolationExpression";
    case N_ADJACENT_STRINGS: return "AdjacentStrings";
    case N_SYMBOL_LITERAL: return "SymbolLiteral";
    case N_THIS_EXPRESSION: return "ThisExpression";
    case N_SUPER_EXPRESSION: return "SuperExpression";
    case N_RETHROW_EXPRESSION: return "RethrowExpression";
    case N_LIST_LITERAL: return "ListLiteral";
    case N_SET_OR_MAP_LITERAL: return "SetOrMapLiteral";
    case N_MAP_LITERAL_ENTRY: return "MapLiteralEntry";
    case N_RECORD_LITERAL: return "RecordLiteral";
    case N_RECORD_LITERAL_NAMED_FIELD: return "RecordLiteralNamedField";
    case N_NAMED_ARGUMENT: return "NamedArgument";
    case N_PARENTHESIZED_EXPRESSION: return "ParenthesizedExpression";
    case N_FUNCTION_EXPRESSION: return "FunctionExpression";
    case N_FUNCTION_EXPRESSION_INVOCATION: return "FunctionExpressionInvocation";
    case N_FUNCTION_REFERENCE: return "FunctionReference";
    case N_METHOD_INVOCATION: return "MethodInvocation";
    case N_PROPERTY_ACCESS: return "PropertyAccess";
    case N_INDEX_EXPRESSION: return "IndexExpression";
    case N_INSTANCE_CREATION_EXPRESSION: return "InstanceCreationExpression";
    case N_ARGUMENT_LIST: return "ArgumentList";
    case N_ASSIGNMENT_EXPRESSION: return "AssignmentExpression";
    case N_BINARY_EXPRESSION: return "BinaryExpression";
    case N_PREFIX_EXPRESSION: return "PrefixExpression";
    case N_POSTFIX_EXPRESSION: return "PostfixExpression";
    case N_CONDITIONAL_EXPRESSION: return "ConditionalExpression";
    case N_AS_EXPRESSION: return "AsExpression";
    case N_IS_EXPRESSION: return "IsExpression";
    case N_AWAIT_EXPRESSION: return "AwaitExpression";
    case N_THROW_EXPRESSION: return "ThrowExpression";
    case N_CASCADE_EXPRESSION: return "CascadeExpression";
    case N_SWITCH_EXPRESSION: return "SwitchExpression";
    case N_SWITCH_EXPRESSION_CASE: return "SwitchExpressionCase";
    case N_DOT_SHORTHAND_INVOCATION: return "DotShorthandInvocation";
    case N_DOT_SHORTHAND_PROPERTY_ACCESS: return "DotShorthandPropertyAccess";
    case N_DOT_SHORTHAND_CONSTRUCTOR_INVOCATION: return "DotShorthandConstructorInvocation";
    case N_SPREAD_ELEMENT: return "SpreadElement";
    case N_NULL_AWARE_ELEMENT: return "NullAwareElement";
    case N_IF_ELEMENT: return "IfElement";
    case N_FOR_ELEMENT: return "ForElement";
    case N_PATTERN_ASSIGNMENT: return "PatternAssignment";
    case N_CONSTANT_PATTERN: return "ConstantPattern";
    case N_DECLARED_VARIABLE_PATTERN: return "DeclaredVariablePattern";
    case N_ASSIGNED_VARIABLE_PATTERN: return "AssignedVariablePattern";
    case N_WILDCARD_PATTERN: return "WildcardPattern";
    case N_LIST_PATTERN: return "ListPattern";
    case N_MAP_PATTERN: return "MapPattern";
    case N_MAP_PATTERN_ENTRY: return "MapPatternEntry";
    case N_RECORD_PATTERN: return "RecordPattern";
    case N_PATTERN_FIELD: return "PatternField";
    case N_PATTERN_FIELD_NAME: return "PatternFieldName";
    case N_OBJECT_PATTERN: return "ObjectPattern";
    case N_PARENTHESIZED_PATTERN: return "ParenthesizedPattern";
    case N_LOGICAL_OR_PATTERN: return "LogicalOrPattern";
    case N_LOGICAL_AND_PATTERN: return "LogicalAndPattern";
    case N_RELATIONAL_PATTERN: return "RelationalPattern";
    case N_CAST_PATTERN: return "CastPattern";
    case N_NULL_CHECK_PATTERN: return "NullCheckPattern";
    case N_NULL_ASSERT_PATTERN: return "NullAssertPattern";
    case N_REST_PATTERN_ELEMENT: return "RestPatternElement";
    default: return "?";
  }
};

/**
 * The field types of node kind `k`, one letter per field: `T` token, `N`
 * node, `L` node list, `K` token list, `I` integer.
 */
export const dtSig = (k: i32): string => {
  switch (k) {
    case N_COMPILATION_UNIT: return "NLL";
    case N_SCRIPT_TAG: return "T";
    case N_LIBRARY_DIRECTIVE: return "LTNT";
    case N_IMPORT_DIRECTIVE: return "LTNLTTNLT";
    case N_EXPORT_DIRECTIVE: return "LTNLTTNLT";
    case N_PART_DIRECTIVE: return "LTNLT";
    case N_PART_OF_DIRECTIVE: return "LTTNNT";
    case N_CONFIGURATION: return "TTNTNTN";
    case N_SHOW_COMBINATOR: return "TL";
    case N_HIDE_COMBINATOR: return "TL";
    case N_DOTTED_NAME: return "K";
    case N_ANNOTATION: return "TNNTNN";
    case N_CLASS_DECLARATION: return "LTTTTTTTNNNNNN";
    case N_MIXIN_DECLARATION: return "LTTTNNNN";
    case N_EXTENSION_DECLARATION: return "LTTTNNN";
    case N_EXTENSION_TYPE_DECLARATION: return "LTTNNN";
    case N_ENUM_DECLARATION: return "LTNNNN";
    case N_CLASS_TYPE_ALIAS: return "LTTTTTTTTNTNNNT";
    case N_FUNCTION_TYPE_ALIAS: return "LTNTNNT";
    case N_GENERIC_TYPE_ALIAS: return "LTTNTNT";
    case N_FUNCTION_DECLARATION: return "LTNTTN";
    case N_TOP_LEVEL_VARIABLE_DECLARATION: return "LTNT";
    case N_NAME_WITH_TYPE_PARAMETERS: return "TN";
    case N_PRIMARY_CONSTRUCTOR_DECLARATION: return "TTNNN";
    case N_PRIMARY_CONSTRUCTOR_NAME: return "TT";
    case N_BLOCK_CLASS_BODY: return "TLT";
    case N_EMPTY_CLASS_BODY: return "T";
    case N_BLOCK_ENUM_BODY: return "TLTLT";
    case N_EMPTY_ENUM_BODY: return "T";
    case N_EXTENDS_CLAUSE: return "TL";
    case N_WITH_CLAUSE: return "TL";
    case N_IMPLEMENTS_CLAUSE: return "TL";
    case N_MIXIN_ON_CLAUSE: return "TL";
    case N_EXTENSION_ON_CLAUSE: return "TL";
    case N_NATIVE_CLAUSE: return "TN";
    case N_ENUM_CONSTANT_DECLARATION: return "LTN";
    case N_ENUM_CONSTANT_ARGUMENTS: return "NNN";
    case N_CONSTRUCTOR_SELECTOR: return "TN";
    case N_CONSTRUCTOR_DECLARATION: return "LTTTTNTTNTLNN";
    case N_METHOD_DECLARATION: return "LTTNTTTNNN";
    case N_FIELD_DECLARATION: return "LTTTTNT";
    case N_PRIMARY_CONSTRUCTOR_BODY: return "LTTLN";
    case N_CONSTRUCTOR_FIELD_INITIALIZER: return "TTNTN";
    case N_SUPER_CONSTRUCTOR_INVOCATION: return "TTNN";
    case N_REDIRECTING_CONSTRUCTOR_INVOCATION: return "TTNN";
    case N_ASSERT_INITIALIZER: return "TTNTNTT";
    case N_CONSTRUCTOR_NAME: return "NTN";
    case N_TYPE_PARAMETER_LIST: return "TLT";
    case N_TYPE_PARAMETER: return "LTTN";
    case N_TYPE_ARGUMENT_LIST: return "TLT";
    case N_NAMED_TYPE: return "TTTNT";
    case N_GENERIC_FUNCTION_TYPE: return "NTNNT";
    case N_RECORD_TYPE_ANNOTATION: return "TLNTT";
    case N_RECORD_TYPE_NAMED_FIELDS: return "TLT";
    case N_RECORD_TYPE_POSITIONAL_FIELD: return "LNT";
    case N_RECORD_TYPE_NAMED_FIELD: return "LNT";
    case N_FORMAL_PARAMETER_LIST: return "TLTTT";
    case N_REGULAR_FORMAL_PARAMETER: return "LTTTNTTTNNI";
    case N_FIELD_FORMAL_PARAMETER: return "LTTTNTTTNNI";
    case N_SUPER_FORMAL_PARAMETER: return "LTTTNTTTNNI";
    case N_FORMAL_PARAMETER_DEFAULT_CLAUSE: return "TN";
    case N_FUNCTION_TYPED_SUFFIX: return "NNT";
    case N_BLOCK_FUNCTION_BODY: return "TTN";
    case N_EXPRESSION_FUNCTION_BODY: return "TTTNT";
    case N_EMPTY_FUNCTION_BODY: return "T";
    case N_NATIVE_FUNCTION_BODY: return "TNT";
    case N_BLOCK: return "TLT";
    case N_EXPRESSION_STATEMENT: return "NT";
    case N_VARIABLE_DECLARATION_STATEMENT: return "NT";
    case N_VARIABLE_DECLARATION_LIST: return "LTTNL";
    case N_VARIABLE_DECLARATION: return "TTN";
    case N_PATTERN_VARIABLE_DECLARATION_STATEMENT: return "NT";
    case N_PATTERN_VARIABLE_DECLARATION: return "LTNTN";
    case N_IF_STATEMENT: return "TTNNTNTN";
    case N_IF_ELEMENT: return "TTNNTNTN";
    case N_FOR_STATEMENT: return "TTTNTN";
    case N_FOR_ELEMENT: return "TTTNTN";
    case N_FOR_PARTS_WITH_DECLARATIONS: return "NTNTL";
    case N_FOR_PARTS_WITH_EXPRESSION: return "NTNTL";
    case N_FOR_PARTS_WITH_PATTERN: return "NTNTL";
    case N_FOR_EACH_PARTS_WITH_DECLARATION: return "NTN";
    case N_FOR_EACH_PARTS_WITH_IDENTIFIER: return "NTN";
    case N_FOR_EACH_PARTS_WITH_PATTERN: return "LTNTN";
    case N_DECLARED_IDENTIFIER: return "LTNT";
    case N_WHILE_STATEMENT: return "TTNTN";
    case N_DO_STATEMENT: return "TNTTNTT";
    case N_SWITCH_STATEMENT: return "TTNTTLT";
    case N_SWITCH_PATTERN_CASE: return "LTNTL";
    case N_SWITCH_DEFAULT: return "LTTL";
    case N_LABEL: return "TT";
    case N_TRY_STATEMENT: return "TNLTN";
    case N_CATCH_CLAUSE: return "TNTTNTNTN";
    case N_CATCH_CLAUSE_PARAMETER: return "T";
    case N_RETURN_STATEMENT: return "TNT";
    case N_BREAK_STATEMENT: return "TNT";
    case N_CONTINUE_STATEMENT: return "TNT";
    case N_LABEL_REFERENCE: return "T";
    case N_YIELD_STATEMENT: return "TTNT";
    case N_ASSERT_STATEMENT: return "TTNTNTT";
    case N_LABELED_STATEMENT: return "LN";
    case N_EMPTY_STATEMENT: return "T";
    case N_FUNCTION_DECLARATION_STATEMENT: return "N";
    case N_GUARDED_PATTERN: return "NN";
    case N_WHEN_CLAUSE: return "TN";
    case N_CASE_CLAUSE: return "TN";
    case N_SIMPLE_IDENTIFIER: return "T";
    case N_PREFIXED_IDENTIFIER: return "NTN";
    case N_BOOLEAN_LITERAL: return "T";
    case N_NULL_LITERAL: return "T";
    case N_INTEGER_LITERAL: return "T";
    case N_DOUBLE_LITERAL: return "T";
    case N_SIMPLE_STRING_LITERAL: return "T";
    case N_STRING_INTERPOLATION: return "L";
    case N_INTERPOLATION_STRING: return "T";
    case N_INTERPOLATION_EXPRESSION: return "TNT";
    case N_ADJACENT_STRINGS: return "LI";
    case N_SYMBOL_LITERAL: return "TK";
    case N_THIS_EXPRESSION: return "T";
    case N_SUPER_EXPRESSION: return "T";
    case N_RETHROW_EXPRESSION: return "T";
    case N_LIST_LITERAL: return "TNTLT";
    case N_SET_OR_MAP_LITERAL: return "TNTLT";
    case N_MAP_LITERAL_ENTRY: return "TNTTN";
    case N_RECORD_LITERAL: return "TTLT";
    case N_RECORD_LITERAL_NAMED_FIELD: return "TTN";
    case N_NAMED_ARGUMENT: return "TTN";
    case N_PARENTHESIZED_EXPRESSION: return "TNT";
    case N_FUNCTION_EXPRESSION: return "NNN";
    case N_FUNCTION_EXPRESSION_INVOCATION: return "NNN";
    case N_FUNCTION_REFERENCE: return "NN";
    case N_METHOD_INVOCATION: return "NTNNN";
    case N_PROPERTY_ACCESS: return "NTN";
    case N_INDEX_EXPRESSION: return "NTTTNT";
    case N_INSTANCE_CREATION_EXPRESSION: return "TNN";
    case N_ARGUMENT_LIST: return "TLT";
    case N_ASSIGNMENT_EXPRESSION: return "NTN";
    case N_BINARY_EXPRESSION: return "NTN";
    case N_PREFIX_EXPRESSION: return "TN";
    case N_POSTFIX_EXPRESSION: return "NT";
    case N_CONDITIONAL_EXPRESSION: return "NTNTN";
    case N_AS_EXPRESSION: return "NTN";
    case N_IS_EXPRESSION: return "NTTN";
    case N_AWAIT_EXPRESSION: return "TN";
    case N_THROW_EXPRESSION: return "TN";
    case N_CASCADE_EXPRESSION: return "NL";
    case N_SWITCH_EXPRESSION: return "TTNTTLT";
    case N_SWITCH_EXPRESSION_CASE: return "NTN";
    case N_DOT_SHORTHAND_INVOCATION: return "TNNN";
    case N_DOT_SHORTHAND_PROPERTY_ACCESS: return "TN";
    case N_DOT_SHORTHAND_CONSTRUCTOR_INVOCATION: return "TTNNN";
    case N_SPREAD_ELEMENT: return "TN";
    case N_NULL_AWARE_ELEMENT: return "TN";
    case N_PATTERN_ASSIGNMENT: return "NTN";
    case N_CONSTANT_PATTERN: return "TN";
    case N_DECLARED_VARIABLE_PATTERN: return "TNT";
    case N_ASSIGNED_VARIABLE_PATTERN: return "T";
    case N_WILDCARD_PATTERN: return "TNT";
    case N_LIST_PATTERN: return "NTLT";
    case N_MAP_PATTERN: return "NTLT";
    case N_MAP_PATTERN_ENTRY: return "NTN";
    case N_RECORD_PATTERN: return "TLT";
    case N_PATTERN_FIELD: return "NN";
    case N_PATTERN_FIELD_NAME: return "TT";
    case N_OBJECT_PATTERN: return "NTLT";
    case N_PARENTHESIZED_PATTERN: return "TNT";
    case N_LOGICAL_OR_PATTERN: return "NTN";
    case N_LOGICAL_AND_PATTERN: return "NTN";
    case N_RELATIONAL_PATTERN: return "TN";
    case N_CAST_PATTERN: return "NTN";
    case N_NULL_CHECK_PATTERN: return "NT";
    case N_NULL_ASSERT_PATTERN: return "NT";
    case N_REST_PATTERN_ELEMENT: return "TN";
    default: return "";
  }
};
