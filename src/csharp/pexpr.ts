// Parsing of expressions, patterns, lambdas, initializers, queries and
// interpolated strings.
//
// Ported from Roslyn's LanguageParser.cs, LanguageParser_Patterns.cs and
// LanguageParser_InterpolatedString.cs (MIT License, Copyright the .NET
// Foundation and Contributors), for CSharpier 1.4.0 (MIT License, Copyright
// (c) 2021 Bela VanderVoort).

// Precedence

import {
  K_AddAssignmentExpression,
  K_AddExpression,
  K_AddressOfExpression,
  K_AliasQualifiedName,
  K_AmpersandAmpersandToken,
  K_AmpersandEqualsToken,
  K_AmpersandToken,
  K_AndAssignmentExpression,
  K_AndKeyword,
  K_AndPattern,
  K_AnonymousMethodExpression,
  K_AnonymousObjectCreationExpression,
  K_AnonymousObjectMemberDeclarator,
  K_ArgListExpression,
  K_ArgListKeyword,
  K_Argument,
  K_ArgumentList,
  K_ArrayCreationExpression,
  K_ArrayInitializerExpression,
  K_ArrayType,
  K_AsExpression,
  K_AsKeyword,
  K_AscendingKeyword,
  K_AscendingOrdering,
  K_AsteriskEqualsToken,
  K_AsteriskToken,
  K_AsyncKeyword,
  K_AwaitExpression,
  K_AwaitKeyword,
  K_BarBarToken,
  K_BarEqualsToken,
  K_BarToken,
  K_BaseExpression,
  K_BaseKeyword,
  K_BitwiseAndExpression,
  K_BitwiseNotExpression,
  K_BitwiseOrExpression,
  K_BracketedArgumentList,
  K_BreakKeyword,
  K_ByKeyword,
  K_CaretEqualsToken,
  K_CaretToken,
  K_CaseKeyword,
  K_CastExpression,
  K_CatchKeyword,
  K_CharacterLiteralExpression,
  K_CharacterLiteralToken,
  K_CheckedExpression,
  K_CheckedKeyword,
  K_ClassKeyword,
  K_CloseBraceToken,
  K_CloseBracketToken,
  K_CloseParenToken,
  K_CoalesceAssignmentExpression,
  K_CoalesceExpression,
  K_CollectionExpression,
  K_CollectionInitializerExpression,
  K_ColonColonToken,
  K_ColonToken,
  K_CommaToken,
  K_ComplexElementInitializerExpression,
  K_ConditionalAccessExpression,
  K_ConditionalExpression,
  K_ConstKeyword,
  K_ConstantPattern,
  K_ContinueKeyword,
  K_DeclarationExpression,
  K_DeclarationPattern,
  K_DefaultExpression,
  K_DefaultKeyword,
  K_DefaultLiteralExpression,
  K_DelegateKeyword,
  K_DescendingKeyword,
  K_DescendingOrdering,
  K_DiscardDesignation,
  K_DiscardPattern,
  K_DivideAssignmentExpression,
  K_DivideExpression,
  K_DoKeyword,
  K_DotDotToken,
  K_DotToken,
  K_ElementAccessExpression,
  K_ElementBindingExpression,
  K_ElseKeyword,
  K_EndOfFileToken,
  K_EnumKeyword,
  K_EqualsEqualsToken,
  K_EqualsExpression,
  K_EqualsGreaterThanToken,
  K_EqualsKeyword,
  K_EqualsToken,
  K_EqualsValueClause,
  K_ExclamationEqualsToken,
  K_ExclamationToken,
  K_ExclusiveOrAssignmentExpression,
  K_ExclusiveOrExpression,
  K_ExpressionColon,
  K_ExpressionElement,
  K_FalseKeyword,
  K_FalseLiteralExpression,
  K_FieldExpression,
  K_FieldKeyword,
  K_FinallyKeyword,
  K_ForEachKeyword,
  K_ForKeyword,
  K_FromClause,
  K_FromKeyword,
  K_GenericName,
  K_GotoKeyword,
  K_GreaterThanEqualsToken,
  K_GreaterThanExpression,
  K_GreaterThanGreaterThanEqualsToken,
  K_GreaterThanGreaterThanGreaterThanEqualsToken,
  K_GreaterThanGreaterThanGreaterThanToken,
  K_GreaterThanGreaterThanToken,
  K_GreaterThanOrEqualExpression,
  K_GreaterThanToken,
  K_GroupClause,
  K_GroupKeyword,
  K_IdentifierName,
  K_IdentifierToken,
  K_IfKeyword,
  K_ImplicitArrayCreationExpression,
  K_ImplicitElementAccess,
  K_ImplicitObjectCreationExpression,
  K_ImplicitStackAllocArrayCreationExpression,
  K_InKeyword,
  K_IndexExpression,
  K_InterfaceKeyword,
  K_InterpolatedMultiLineRawStringStartToken,
  K_InterpolatedRawStringEndToken,
  K_InterpolatedSingleLineRawStringStartToken,
  K_InterpolatedStringEndToken,
  K_InterpolatedStringExpression,
  K_InterpolatedStringStartToken,
  K_InterpolatedStringText,
  K_InterpolatedStringTextToken,
  K_InterpolatedVerbatimStringStartToken,
  K_Interpolation,
  K_InterpolationAlignmentClause,
  K_InterpolationFormatClause,
  K_IntoKeyword,
  K_InvocationExpression,
  K_IsExpression,
  K_IsKeyword,
  K_IsPatternExpression,
  K_JoinClause,
  K_JoinIntoClause,
  K_JoinKeyword,
  K_LeftShiftAssignmentExpression,
  K_LeftShiftExpression,
  K_LessThanEqualsToken,
  K_LessThanExpression,
  K_LessThanLessThanEqualsToken,
  K_LessThanLessThanToken,
  K_LessThanOrEqualExpression,
  K_LessThanToken,
  K_LetClause,
  K_LetKeyword,
  K_ListPattern,
  K_LockKeyword,
  K_LogicalAndExpression,
  K_LogicalNotExpression,
  K_LogicalOrExpression,
  K_MakeRefExpression,
  K_MakeRefKeyword,
  K_MemberBindingExpression,
  K_MinusEqualsToken,
  K_MinusGreaterThanToken,
  K_MinusMinusToken,
  K_MinusToken,
  K_ModuloAssignmentExpression,
  K_ModuloExpression,
  K_MultiLineRawStringLiteralToken,
  K_MultiplyAssignmentExpression,
  K_MultiplyExpression,
  K_NameColon,
  K_NameOfKeyword,
  K_NewKeyword,
  K_NotEqualsExpression,
  K_NotKeyword,
  K_NotPattern,
  K_NullKeyword,
  K_NullLiteralExpression,
  K_NullableType,
  K_NumericLiteralExpression,
  K_NumericLiteralToken,
  K_ObjectCreationExpression,
  K_ObjectInitializerExpression,
  K_OnKeyword,
  K_OpenBraceToken,
  K_OpenBracketToken,
  K_OpenParenToken,
  K_OrAssignmentExpression,
  K_OrKeyword,
  K_OrPattern,
  K_OrderByClause,
  K_OrderByKeyword,
  K_OutKeyword,
  K_Parameter,
  K_ParameterList,
  K_ParamsKeyword,
  K_ParenthesizedExpression,
  K_ParenthesizedLambdaExpression,
  K_ParenthesizedPattern,
  K_ParenthesizedVariableDesignation,
  K_PartialKeyword,
  K_PercentEqualsToken,
  K_PercentToken,
  K_PlusEqualsToken,
  K_PlusPlusToken,
  K_PlusToken,
  K_PointerIndirectionExpression,
  K_PointerMemberAccessExpression,
  K_PositionalPatternClause,
  K_PostDecrementExpression,
  K_PostIncrementExpression,
  K_PreDecrementExpression,
  K_PreIncrementExpression,
  K_PredefinedType,
  K_PropertyPatternClause,
  K_QualifiedName,
  K_QueryBody,
  K_QueryContinuation,
  K_QueryExpression,
  K_QuestionQuestionEqualsToken,
  K_QuestionQuestionToken,
  K_QuestionToken,
  K_RangeExpression,
  K_ReadOnlyKeyword,
  K_RecordKeyword,
  K_RecursivePattern,
  K_RefExpression,
  K_RefKeyword,
  K_RefTypeExpression,
  K_RefTypeKeyword,
  K_RefValueExpression,
  K_RefValueKeyword,
  K_RelationalPattern,
  K_ReturnKeyword,
  K_RightShiftAssignmentExpression,
  K_RightShiftExpression,
  K_ScopedKeyword,
  K_ScopedType,
  K_SelectClause,
  K_SelectKeyword,
  K_SemicolonToken,
  K_SimpleAssignmentExpression,
  K_SimpleLambdaExpression,
  K_SimpleMemberAccessExpression,
  K_SingleLineRawStringLiteralToken,
  K_SingleVariableDesignation,
  K_SizeOfExpression,
  K_SizeOfKeyword,
  K_SlashEqualsToken,
  K_SlashToken,
  K_SlicePattern,
  K_SpreadElement,
  K_StackAllocArrayCreationExpression,
  K_StackAllocKeyword,
  K_StaticKeyword,
  K_StringLiteralExpression,
  K_StringLiteralToken,
  K_StructKeyword,
  K_Subpattern,
  K_SubtractAssignmentExpression,
  K_SubtractExpression,
  K_SuppressNullableWarningExpression,
  K_SwitchExpression,
  K_SwitchExpressionArm,
  K_SwitchKeyword,
  K_ThisExpression,
  K_ThisKeyword,
  K_ThrowExpression,
  K_ThrowKeyword,
  K_TildeToken,
  K_TrueKeyword,
  K_TrueLiteralExpression,
  K_TryKeyword,
  K_TupleExpression,
  K_TypeOfExpression,
  K_TypeOfKeyword,
  K_TypePattern,
  K_UnaryMinusExpression,
  K_UnaryPlusExpression,
  K_UncheckedExpression,
  K_UncheckedKeyword,
  K_UnionKeyword,
  K_UnsafeExpression,
  K_UnsafeKeyword,
  K_UnsignedRightShiftAssignmentExpression,
  K_UnsignedRightShiftExpression,
  K_UsingKeyword,
  K_Utf8MultiLineRawStringLiteralToken,
  K_Utf8SingleLineRawStringLiteralToken,
  K_Utf8StringLiteralExpression,
  K_Utf8StringLiteralToken,
  K_VarKeyword,
  K_VarPattern,
  K_VoidKeyword,
  K_WhenClause,
  K_WhenKeyword,
  K_WhereClause,
  K_WhereKeyword,
  K_WhileKeyword,
  K_WithElement,
  K_WithExpression,
  K_WithInitializerExpression,
  K_WithKeyword,
} from "./kinds";
import {
  CsParser,
  NO_IN_EXPRESSION,
  PT_AFTER_IS,
  PT_AFTER_TUPLE_COMMA,
  PT_AS_EXPRESSION,
  PT_DEFINITE_PATTERN,
  PT_FIRST_ELEMENT_OF_POSSIBLE_TUPLE_LITERAL,
  PT_NEW_EXPRESSION,
  PT_NORMAL,
  PT_PARAMETER,
  ST_ALIAS_QUALIFIED_NAME,
  ST_GENERIC_TYPE_OR_EXPRESSION,
  ST_GENERIC_TYPE_OR_METHOD,
  ST_MUST_BE_TYPE,
  ST_NON_GENERIC_TYPE_OR_EXPRESSION,
  ST_NOT_TYPE,
  ST_NULLABLE_TYPE,
  ST_POINTER_OR_MULTIPLICATION,
  ST_TUPLE_TYPE,
  csIsPredefinedType,
  cspAliasQualifiedName,
  cspIdentifierName,
  cspIdentifierToken,
  cspIsFunctionPointerStart,
  cspIsTrueIdentifier,
  cspIsTrueIdentifierAt,
  cspScanType,
  cspScanTupleTypePublic,
  cspSimpleName,
  cspType,
  cspTypeOrVoid,
  cspModifierKind,
  cspIsTypeModifierOrTypeKeyword,
  cspIsPossibleMemberName,
} from "./parser";
import {
  cspAttributeDeclarations,
  cspIsParameterModifierExcludingScoped,
  cspNameEquals,
  cspParameterModifiers,
  cspVariableInitializer,
  cspParenthesizedParameterList,
} from "./pdecl";
import { cspBlock, cspIsPossibleTypedIdentifierStartAt } from "./pstmt";
import { TF_HOLE_END } from "./lexer";
import { fault } from "../core/fault";

export const PREC_EXPRESSION: i32 = 0;
export const PREC_ASSIGNMENT: i32 = 0;
export const PREC_LAMBDA: i32 = 0;
export const PREC_CONDITIONAL: i32 = 1;
export const PREC_COALESCING: i32 = 2;
export const PREC_CONDITIONAL_OR: i32 = 3;
export const PREC_CONDITIONAL_AND: i32 = 4;
export const PREC_LOGICAL_OR: i32 = 5;
export const PREC_LOGICAL_XOR: i32 = 6;
export const PREC_LOGICAL_AND: i32 = 7;
export const PREC_EQUALITY: i32 = 8;
export const PREC_RELATIONAL: i32 = 9;
export const PREC_SHIFT: i32 = 10;
export const PREC_ADDITIVE: i32 = 11;
export const PREC_MULTIPLICATIVE: i32 = 12;
export const PREC_SWITCH: i32 = 13;
export const PREC_RANGE: i32 = 14;
export const PREC_UNARY: i32 = 15;
export const PREC_CAST: i32 = 16;
export const PREC_POINTER_INDIRECTION: i32 = 17;
export const PREC_ADDRESS_OF: i32 = 18;
export const PREC_PRIMARY: i32 = 19;

const cspPrecedence = (k: i32): i32 => {
  switch (k) {
    case K_QueryExpression:
    case K_ParenthesizedLambdaExpression:
    case K_SimpleLambdaExpression:
    case K_AnonymousMethodExpression:
    case K_SimpleAssignmentExpression:
    case K_AddAssignmentExpression:
    case K_SubtractAssignmentExpression:
    case K_MultiplyAssignmentExpression:
    case K_DivideAssignmentExpression:
    case K_ModuloAssignmentExpression:
    case K_AndAssignmentExpression:
    case K_ExclusiveOrAssignmentExpression:
    case K_OrAssignmentExpression:
    case K_LeftShiftAssignmentExpression:
    case K_RightShiftAssignmentExpression:
    case K_UnsignedRightShiftAssignmentExpression:
    case K_CoalesceAssignmentExpression:
    case K_ConditionalExpression:
      return PREC_EXPRESSION;
    case K_CoalesceExpression:
    case K_ThrowExpression:
      return PREC_COALESCING;
    case K_LogicalOrExpression:
      return PREC_CONDITIONAL_OR;
    case K_LogicalAndExpression:
      return PREC_CONDITIONAL_AND;
    case K_BitwiseOrExpression:
      return PREC_LOGICAL_OR;
    case K_ExclusiveOrExpression:
      return PREC_LOGICAL_XOR;
    case K_BitwiseAndExpression:
      return PREC_LOGICAL_AND;
    case K_EqualsExpression:
    case K_NotEqualsExpression:
      return PREC_EQUALITY;
    case K_LessThanExpression:
    case K_LessThanOrEqualExpression:
    case K_GreaterThanExpression:
    case K_GreaterThanOrEqualExpression:
    case K_IsExpression:
    case K_AsExpression:
    case K_IsPatternExpression:
      return PREC_RELATIONAL;
    case K_SwitchExpression:
    case K_WithExpression:
      return PREC_SWITCH;
    case K_LeftShiftExpression:
    case K_RightShiftExpression:
    case K_UnsignedRightShiftExpression:
      return PREC_SHIFT;
    case K_AddExpression:
    case K_SubtractExpression:
      return PREC_ADDITIVE;
    case K_MultiplyExpression:
    case K_DivideExpression:
    case K_ModuloExpression:
      return PREC_MULTIPLICATIVE;
    case K_UnaryPlusExpression:
    case K_UnaryMinusExpression:
    case K_BitwiseNotExpression:
    case K_LogicalNotExpression:
    case K_PreIncrementExpression:
    case K_PreDecrementExpression:
    case K_TypeOfExpression:
    case K_SizeOfExpression:
    case K_CheckedExpression:
    case K_UncheckedExpression:
    case K_UnsafeExpression:
    case K_MakeRefExpression:
    case K_RefValueExpression:
    case K_RefTypeExpression:
    case K_AwaitExpression:
    case K_IndexExpression:
      return PREC_UNARY;
    case K_CastExpression:
      return PREC_CAST;
    case K_PointerIndirectionExpression:
      return PREC_POINTER_INDIRECTION;
    case K_AddressOfExpression:
      return PREC_ADDRESS_OF;
    case K_RangeExpression:
      return PREC_RANGE;
    default:
      return PREC_PRIMARY;
  }
};

const cspIsRightAssociative = (k: i32): boolean => {
  switch (k) {
    case K_SimpleAssignmentExpression:
    case K_AddAssignmentExpression:
    case K_SubtractAssignmentExpression:
    case K_MultiplyAssignmentExpression:
    case K_DivideAssignmentExpression:
    case K_ModuloAssignmentExpression:
    case K_AndAssignmentExpression:
    case K_ExclusiveOrAssignmentExpression:
    case K_OrAssignmentExpression:
    case K_LeftShiftAssignmentExpression:
    case K_RightShiftAssignmentExpression:
    case K_UnsignedRightShiftAssignmentExpression:
    case K_CoalesceAssignmentExpression:
    case K_CoalesceExpression:
      return true;
    default:
      return false;
  }
};

const cspPrefixUnaryKind = (t: i32): i32 => {
  switch (t) {
    case K_PlusToken:
      return K_UnaryPlusExpression;
    case K_MinusToken:
      return K_UnaryMinusExpression;
    case K_TildeToken:
      return K_BitwiseNotExpression;
    case K_ExclamationToken:
      return K_LogicalNotExpression;
    case K_PlusPlusToken:
      return K_PreIncrementExpression;
    case K_MinusMinusToken:
      return K_PreDecrementExpression;
    case K_AmpersandToken:
      return K_AddressOfExpression;
    case K_AsteriskToken:
      return K_PointerIndirectionExpression;
    case K_CaretToken:
      return K_IndexExpression;
    default:
      return 0;
  }
};

const cspBinaryKind = (t: i32): i32 => {
  switch (t) {
    case K_QuestionQuestionToken:
      return K_CoalesceExpression;
    case K_IsKeyword:
      return K_IsExpression;
    case K_AsKeyword:
      return K_AsExpression;
    case K_BarToken:
      return K_BitwiseOrExpression;
    case K_CaretToken:
      return K_ExclusiveOrExpression;
    case K_AmpersandToken:
      return K_BitwiseAndExpression;
    case K_EqualsEqualsToken:
      return K_EqualsExpression;
    case K_ExclamationEqualsToken:
      return K_NotEqualsExpression;
    case K_LessThanToken:
      return K_LessThanExpression;
    case K_LessThanEqualsToken:
      return K_LessThanOrEqualExpression;
    case K_GreaterThanToken:
      return K_GreaterThanExpression;
    case K_GreaterThanEqualsToken:
      return K_GreaterThanOrEqualExpression;
    case K_LessThanLessThanToken:
      return K_LeftShiftExpression;
    case K_GreaterThanGreaterThanToken:
      return K_RightShiftExpression;
    case K_GreaterThanGreaterThanGreaterThanToken:
      return K_UnsignedRightShiftExpression;
    case K_PlusToken:
      return K_AddExpression;
    case K_MinusToken:
      return K_SubtractExpression;
    case K_AsteriskToken:
      return K_MultiplyExpression;
    case K_SlashToken:
      return K_DivideExpression;
    case K_PercentToken:
      return K_ModuloExpression;
    case K_AmpersandAmpersandToken:
      return K_LogicalAndExpression;
    case K_BarBarToken:
      return K_LogicalOrExpression;
    default:
      return 0;
  }
};

const cspAssignmentKind = (t: i32): i32 => {
  switch (t) {
    case K_BarEqualsToken:
      return K_OrAssignmentExpression;
    case K_AmpersandEqualsToken:
      return K_AndAssignmentExpression;
    case K_CaretEqualsToken:
      return K_ExclusiveOrAssignmentExpression;
    case K_LessThanLessThanEqualsToken:
      return K_LeftShiftAssignmentExpression;
    case K_GreaterThanGreaterThanEqualsToken:
      return K_RightShiftAssignmentExpression;
    case K_GreaterThanGreaterThanGreaterThanEqualsToken:
      return K_UnsignedRightShiftAssignmentExpression;
    case K_PlusEqualsToken:
      return K_AddAssignmentExpression;
    case K_MinusEqualsToken:
      return K_SubtractAssignmentExpression;
    case K_AsteriskEqualsToken:
      return K_MultiplyAssignmentExpression;
    case K_SlashEqualsToken:
      return K_DivideAssignmentExpression;
    case K_PercentEqualsToken:
      return K_ModuloAssignmentExpression;
    case K_EqualsToken:
      return K_SimpleAssignmentExpression;
    case K_QuestionQuestionEqualsToken:
      return K_CoalesceAssignmentExpression;
    default:
      return 0;
  }
};

export const cspIsExpectedBinaryOperator = (t: i32): boolean => cspBinaryKind(t) !== 0;
export const cspIsExpectedAssignmentOperator = (t: i32): boolean => cspAssignmentKind(t) !== 0;

const cspIsPostfixUnaryToken = (t: i32): boolean =>
  t === K_PlusPlusToken || t === K_MinusMinusToken || t === K_ExclamationToken;

export const cspIsPatternKind = (k: i32): boolean => {
  switch (k) {
    case K_DiscardPattern:
    case K_DeclarationPattern:
    case K_VarPattern:
    case K_RecursivePattern:
    case K_ConstantPattern:
    case K_ParenthesizedPattern:
    case K_RelationalPattern:
    case K_TypePattern:
    case K_OrPattern:
    case K_AndPattern:
    case K_NotPattern:
    case K_ListPattern:
    case K_SlicePattern:
      return true;
    default:
      return false;
  }
};

// ---- possible expressions ----

export const cspCanStartExpression = (p: CsParser): boolean => cspIsPossibleExpressionImpl(p, false, false);
export const cspIsPossibleExpression = (p: CsParser): boolean => cspIsPossibleExpressionImpl(p, true, true);

const cspIsPossibleExpressionImpl = (p: CsParser, allowBinary: boolean, allowAssignment: boolean): boolean => {
  const tk = p.k();
  switch (tk) {
    case K_TypeOfKeyword:
    case K_DefaultKeyword:
    case K_SizeOfKeyword:
    case K_MakeRefKeyword:
    case K_RefTypeKeyword:
    case K_CheckedKeyword:
    case K_UncheckedKeyword:
    case K_UnsafeKeyword:
    case K_RefValueKeyword:
    case K_ArgListKeyword:
    case K_BaseKeyword:
    case K_FalseKeyword:
    case K_ThisKeyword:
    case K_TrueKeyword:
    case K_NullKeyword:
    case K_OpenParenToken:
    case K_NumericLiteralToken:
    case K_StringLiteralToken:
    case K_Utf8StringLiteralToken:
    case K_SingleLineRawStringLiteralToken:
    case K_Utf8SingleLineRawStringLiteralToken:
    case K_MultiLineRawStringLiteralToken:
    case K_Utf8MultiLineRawStringLiteralToken:
    case K_InterpolatedStringStartToken:
    case K_InterpolatedVerbatimStringStartToken:
    case K_InterpolatedSingleLineRawStringStartToken:
    case K_InterpolatedMultiLineRawStringStartToken:
    case K_CharacterLiteralToken:
    case K_NewKeyword:
    case K_DelegateKeyword:
    case K_ColonColonToken:
    case K_ThrowKeyword:
    case K_StackAllocKeyword:
    case K_RefKeyword:
    case K_OpenBracketToken:
      return true;
    case K_DotToken:
      return cspIsAtDotDot(p);
    case K_StaticKeyword:
      return cspIsPossibleAnonymousMethodExpression(p) || cspIsPossibleLambdaExpression(p, PREC_EXPRESSION);
    case K_IdentifierToken:
      return cspIsTrueIdentifier(p) || p.ck() === K_FromKeyword;
    default:
      return (
        csIsPredefinedType(tk) ||
        cspPrefixUnaryKind(tk) !== 0 ||
        cspIsPostfixUnaryToken(tk) ||
        (allowBinary && cspBinaryKind(tk) !== 0) ||
        (allowAssignment && cspAssignmentKind(tk) !== 0)
      );
  }
};

const cspIsInvalidSubExpression = (k: i32): boolean => {
  switch (k) {
    case K_BreakKeyword:
    case K_CaseKeyword:
    case K_CatchKeyword:
    case K_ConstKeyword:
    case K_ContinueKeyword:
    case K_DoKeyword:
    case K_FinallyKeyword:
    case K_ForKeyword:
    case K_ForEachKeyword:
    case K_GotoKeyword:
    case K_IfKeyword:
    case K_ElseKeyword:
    case K_LockKeyword:
    case K_ReturnKeyword:
    case K_SwitchKeyword:
    case K_TryKeyword:
    case K_UsingKeyword:
    case K_WhileKeyword:
      return true;
    default:
      return false;
  }
};

export const cspIsAtDotDot = (p: CsParser): boolean =>
  p.k() === K_DotToken && p.kindAt(1) === K_DotToken && p.noTriviaBetween(0);

const cspEatDotDot = (p: CsParser): i32 => {
  if (p.kindAt(2) === K_DotToken && p.noTriviaBetween(1)) {
    p.fail("triple dot");
    return -1;
  }
  return p.eatMerged(K_DotDotToken, 2);
};

export const cspIsPossibleAwaitExpressionStatement = (p: CsParser): boolean =>
  p.inAsync && p.k() === K_IdentifierToken && p.ck() === K_AwaitKeyword;

export const cspIsAwaitExpression = (p: CsParser): boolean => {
  if (p.k() === K_IdentifierToken && p.ck() === K_AwaitKeyword) {
    if (p.inAsync) {
      return true;
    }
    const k1 = p.kindAt(1);
    switch (k1) {
      case K_IdentifierToken:
        return p.ckAt(1) !== K_WithKeyword;
      case K_NewKeyword:
      case K_ThisKeyword:
      case K_BaseKeyword:
      case K_DelegateKeyword:
      case K_TypeOfKeyword:
      case K_CheckedKeyword:
      case K_UncheckedKeyword:
      case K_DefaultKeyword:
      case K_TrueKeyword:
      case K_FalseKeyword:
      case K_StringLiteralToken:
      case K_SingleLineRawStringLiteralToken:
      case K_Utf8SingleLineRawStringLiteralToken:
      case K_MultiLineRawStringLiteralToken:
      case K_Utf8MultiLineRawStringLiteralToken:
      case K_Utf8StringLiteralToken:
      case K_InterpolatedStringStartToken:
      case K_InterpolatedVerbatimStringStartToken:
      case K_InterpolatedSingleLineRawStringStartToken:
      case K_InterpolatedMultiLineRawStringStartToken:
      case K_NumericLiteralToken:
      case K_NullKeyword:
      case K_CharacterLiteralToken:
        return true;
      default:
        return false;
    }
  }
  return false;
};

// ---- expressions ----

export const cspExpressionCore = (p: CsParser): i32 => cspSubExpression(p, PREC_EXPRESSION);

export const cspSubExpression = (p: CsParser, precedence: i32): i32 => {
  const d = p.depth;
  if (d >= 600) {
    if (d < 2147483647) {
      p.depth = d + 1;
    } else {
      fault();
    }
    p.fail("too deep");
    return -1;
  }
  p.depth = d + 1;
  const r = cspSubExpressionCore(p, precedence);
  // the depth counts this call, so it is at least 1
  const e = p.depth;
  if (e > 0) {
    p.depth = e - 1;
  } else {
    fault();
  }
  return r;
};

const cspSubExpressionCore = (p: CsParser, precedence: i32): i32 => {
  const tk = p.k();
  if (cspIsInvalidSubExpression(tk)) {
    p.fail("invalid expression term");
    return -1;
  }
  return cspExpressionContinued(p, cspUnaryOrPrimary(p, precedence, tk), precedence);
};

const cspUnaryOrPrimary = (p: CsParser, precedence: i32, tk: i32): i32 => {
  const ok = cspPrefixUnaryKind(tk);
  if (ok !== 0) {
    const m = p.sp();
    p.push(p.eat());
    p.push(cspSubExpression(p, cspPrecedence(ok)));
    return p.node(ok, m);
  }
  if (cspIsAtDotDot(p)) {
    const m = p.sp();
    p.push(-1);
    p.push(cspEatDotDot(p));
    p.push(cspCanStartExpression(p) ? cspSubExpression(p, PREC_RANGE) : -1);
    return p.node(K_RangeExpression, m);
  }
  if (cspIsAwaitExpression(p)) {
    const m = p.sp();
    p.push(p.eatContextual(K_AwaitKeyword));
    p.push(cspSubExpression(p, PREC_UNARY));
    return p.node(K_AwaitExpression, m);
  }
  if (cspIsQueryExpression(p, false, false)) {
    return cspQueryExpression(p);
  }
  if (p.k() === K_IdentifierToken && p.ck() === K_FromKeyword && p.inQuery) {
    p.fail("invalid expression term");
    return -1;
  }
  if (tk === K_ThrowKeyword) {
    const m = p.sp();
    p.push(p.eat());
    p.push(cspSubExpression(p, PREC_COALESCING));
    const r = p.node(K_ThrowExpression, m);
    if (precedence > PREC_COALESCING) {
      p.fail("invalid throw expression");
    }
    return r;
  }
  if (cspIsPossibleDeconstructionLeft(p, precedence)) {
    return cspDeclarationExpression(p, PT_NORMAL, false);
  }
  return cspPrimaryExpression(p, precedence);
};

/** The operator here: its token kind (merged for `>>` and the like) and its expression kind; 0 for none. */
class CsOp {
  tok: i32;
  expr: i32;
  n: i32; // tokens it spans
  constructor(tok: i32, expr: i32, n: i32) {
    this.tok = tok;
    this.expr = expr;
    this.n = n;
  }
}

const cspCurrentOperator = (p: CsParser): CsOp => {
  if (cspIsAtDotDot(p)) {
    return new CsOp(K_DotDotToken, K_RangeExpression, 2);
  }
  let k1 = p.k() === K_IdentifierToken ? p.ck() : p.k();
  let n = 1;
  if (
    k1 === K_GreaterThanToken &&
    (p.kindAt(1) === K_GreaterThanToken || p.kindAt(1) === K_GreaterThanEqualsToken) &&
    p.noTriviaBetween(0)
  ) {
    if (p.kindAt(1) === K_GreaterThanToken) {
      if ((p.kindAt(2) === K_GreaterThanToken || p.kindAt(2) === K_GreaterThanEqualsToken) && p.noTriviaBetween(1)) {
        k1 =
          p.kindAt(2) === K_GreaterThanToken
            ? K_GreaterThanGreaterThanGreaterThanToken
            : K_GreaterThanGreaterThanGreaterThanEqualsToken;
        n = 3;
      } else {
        k1 = K_GreaterThanGreaterThanToken;
        n = 2;
      }
    } else {
      k1 = K_GreaterThanGreaterThanEqualsToken;
      n = 2;
    }
  }
  const b = cspBinaryKind(k1);
  if (b !== 0) {
    return new CsOp(k1, b, n);
  }
  const a = cspAssignmentKind(k1);
  if (a !== 0) {
    return new CsOp(k1, a, n);
  }
  if (k1 === K_SwitchKeyword && p.kindAt(1) === K_OpenBraceToken) {
    return new CsOp(k1, K_SwitchExpression, 1);
  }
  if (k1 === K_WithKeyword && p.kindAt(1) === K_OpenBraceToken) {
    return new CsOp(k1, K_WithExpression, 1);
  }
  return new CsOp(0, 0, 0);
};

const cspEatOperator = (p: CsParser, op: CsOp): i32 => {
  if (op.tok === K_DotDotToken) {
    return cspEatDotDot(p);
  }
  if (op.n > 1) {
    return p.eatMerged(op.tok, op.n);
  }
  if (p.k() === K_IdentifierToken) {
    return p.eatContextual(op.tok);
  }
  return p.eat();
};

export const cspExpressionContinued = (p: CsParser, first: i32, precedence: i32): i32 => {
  let cur = first;
  while (!p.err) {
    const op = cspCurrentOperator(p);
    if (op.tok === 0) {
      break;
    }
    const np = cspPrecedence(op.expr);
    if (np < precedence) {
      break;
    }
    if (np === precedence && !cspIsRightAssociative(op.expr)) {
      break;
    }
    const opTok = cspEatOperator(p, op);
    if (cur >= 0 && np > cspPrecedence(p.nodeKind(cur)) && p.nodeKind(cur) === K_IsPatternExpression) {
      p.fail("unexpected token after is pattern");
      return -1;
    }
    if (op.expr === K_AsExpression) {
      const m = p.sp();
      p.push(cur);
      p.push(opTok);
      p.push(cspType(p, PT_AS_EXPRESSION));
      cur = p.node(K_AsExpression, m);
      continue;
    }
    if (op.expr === K_IsExpression) {
      cur = cspIsExpression(p, cur, opTok);
      continue;
    }
    if (op.expr === K_SwitchExpression) {
      cur = cspSwitchExpression(p, cur, opTok);
      continue;
    }
    if (op.expr === K_WithExpression) {
      cur = cspWithExpression(p, cur, opTok);
      continue;
    }
    if (op.expr === K_RangeExpression) {
      const m = p.sp();
      p.push(cur);
      p.push(opTok);
      p.push(cspCanStartExpression(p) ? cspSubExpression(p, PREC_RANGE) : -1);
      cur = p.node(K_RangeExpression, m);
      continue;
    }
    if (cspAssignmentKind(op.tok) !== 0) {
      cur = cspAssignmentExpression(p, op.expr, cur, opTok);
      continue;
    }
    const m = p.sp();
    p.push(cur);
    p.push(opTok);
    p.push(cspSubExpression(p, np));
    cur = p.node(op.expr, m);
  }
  if (p.k() === K_QuestionToken && precedence <= PREC_CONDITIONAL) {
    const m = p.sp();
    p.push(cur);
    p.push(p.eat());
    p.push(cspPossibleRefExpression(p));
    p.push(p.expect(K_ColonToken));
    p.push(cspPossibleRefExpression(p));
    return p.node(K_ConditionalExpression, m);
  }
  return cur;
};

const cspAssignmentExpression = (p: CsParser, kind: i32, left: i32, opTok: i32): i32 => {
  const m = p.sp();
  p.push(left);
  p.push(opTok);
  if (
    kind === K_SimpleAssignmentExpression &&
    p.k() === K_RefKeyword &&
    !cspIsPossibleLambdaExpression(p, PREC_ASSIGNMENT)
  ) {
    const rm = p.sp();
    p.push(p.eat());
    p.push(cspExpressionCore(p));
    p.push(p.node(K_RefExpression, rm));
  } else {
    p.push(cspSubExpression(p, PREC_ASSIGNMENT));
  }
  return p.node(kind, m);
};

export const cspPossibleRefExpression = (p: CsParser): i32 => {
  if (p.k() === K_RefKeyword && !cspIsPossibleLambdaExpression(p, PREC_EXPRESSION)) {
    const m = p.sp();
    p.push(p.eat());
    p.push(cspExpressionCore(p));
    return p.node(K_RefExpression, m);
  }
  return cspExpressionCore(p);
};

/** DeclarationExpression: (scoped) type designation. */
export const cspDeclarationExpression = (p: CsParser, mode: i32, isScoped: boolean): i32 => {
  const m = p.sp();
  if (isScoped) {
    const sm = p.sp();
    p.push(p.eatContextual(K_ScopedKeyword));
    p.push(cspType(p, mode));
    p.push(p.node(K_ScopedType, sm));
  } else {
    p.push(cspType(p, mode));
  }
  p.push(cspDesignation(p, false));
  return p.node(K_DeclarationExpression, m);
};

const cspDesignation = (p: CsParser, forPattern: boolean): i32 => {
  if (p.k() === K_OpenParenToken) {
    const m = p.sp();
    p.push(p.eat());
    const lm = p.sp();
    let done = false;
    if (forPattern) {
      done = p.k() === K_CloseParenToken;
    } else {
      p.push(cspDesignation(p, forPattern));
      p.push(p.expect(K_CommaToken));
    }
    if (!done) {
      while (!p.err) {
        p.push(cspDesignation(p, forPattern));
        if (p.k() === K_CommaToken) {
          p.push(p.eat());
        } else {
          break;
        }
      }
    }
    p.push(p.list(lm));
    p.push(p.expect(K_CloseParenToken));
    return p.node(K_ParenthesizedVariableDesignation, m);
  }
  return cspSimpleDesignation(p);
};

const cspSimpleDesignation = (p: CsParser): i32 => {
  const m = p.sp();
  if (p.k() === K_IdentifierToken && p.t.tokIs(p.cur(), "_")) {
    p.push(p.eat());
    return p.node(K_DiscardDesignation, m);
  }
  p.push(p.expect(K_IdentifierToken));
  return p.node(K_SingleVariableDesignation, m);
};

export const cspWhenClause = (p: CsParser, precedence: i32): i32 => {
  if (p.k() !== K_IdentifierToken || p.ck() !== K_WhenKeyword) {
    return -1;
  }
  const m = p.sp();
  p.push(p.eatContextual(K_WhenKeyword));
  p.push(cspSubExpression(p, precedence));
  return p.node(K_WhenClause, m);
};

const cspIsVarType = (p: CsParser): boolean => {
  if (!(p.k() === K_IdentifierToken && p.t.tokIs(p.cur(), "var"))) {
    return false;
  }
  switch (p.kindAt(1)) {
    case K_DotToken:
    case K_ColonColonToken:
    case K_OpenBracketToken:
    case K_AsteriskToken:
    case K_QuestionToken:
    case K_LessThanToken:
      return false;
    default:
      return true;
  }
};

/** IsPossibleDeclarationExpression: 0 no, 1 yes, 2 yes with `scoped`. */
export const cspIsPossibleDeclarationExpression = (p: CsParser, mode: i32, permitTupleDesignation: boolean): i32 => {
  if (p.inAsync && p.k() === K_IdentifierToken && p.ck() === K_AwaitKeyword) {
    return 0;
  }
  const m = p.mark();
  if (p.k() === K_IdentifierToken && p.ck() === K_ScopedKeyword) {
    p.eat();
    if (cspScanType(p, PT_NORMAL) !== ST_NOT_TYPE && p.k() === K_IdentifierToken) {
      let r = false;
      if (mode === PT_FIRST_ELEMENT_OF_POSSIBLE_TUPLE_LITERAL) {
        r = p.kindAt(1) === K_CommaToken;
      } else if (mode === PT_AFTER_TUPLE_COMMA) {
        r = p.kindAt(1) === K_CommaToken || p.kindAt(1) === K_CloseParenToken;
      } else {
        r = true;
      }
      if (r) {
        p.reset(m);
        return 2;
      }
    }
    p.reset(m);
  }
  const typeIsVar = cspIsVarType(p);
  let r = false;
  if (cspScanType(p, mode) !== ST_NOT_TYPE) {
    const last = p.lastScan;
    const lastIsPredefined = last >= 0 && csIsPredefinedType(p.tokKind(last));
    if (cspScanDesignation(p, permitTupleDesignation && (typeIsVar || lastIsPredefined))) {
      if (mode === PT_FIRST_ELEMENT_OF_POSSIBLE_TUPLE_LITERAL) {
        r = p.k() === K_CommaToken;
      } else if (mode === PT_AFTER_TUPLE_COMMA) {
        r = p.k() === K_CommaToken || p.k() === K_CloseParenToken;
      } else {
        r = true;
      }
    }
  }
  p.reset(m);
  return r ? 1 : 0;
};

const cspScanDesignation = (p: CsParser, permitTuple: boolean): boolean => {
  if (p.k() === K_IdentifierToken) {
    const r = cspIsTrueIdentifier(p);
    p.eat();
    return r;
  }
  if (p.k() === K_OpenParenToken) {
    if (!permitTuple) {
      return false;
    }
    let sawComma = false;
    while (true) {
      p.eat();
      if (!cspScanDesignation(p, true)) {
        return false;
      }
      if (p.k() === K_CloseParenToken) {
        p.eat();
        return sawComma;
      }
      if (p.k() === K_CommaToken) {
        sawComma = true;
        continue;
      }
      return false;
    }
  }
  return false;
};

const cspIsPossibleDeconstructionLeft = (p: CsParser, precedence: i32): boolean => {
  if (
    precedence > PREC_ASSIGNMENT ||
    !((p.k() === K_IdentifierToken && p.t.tokIs(p.cur(), "var")) || csIsPredefinedType(p.k()))
  ) {
    return false;
  }
  const m = p.mark();
  p.eat();
  const r = p.k() === K_OpenParenToken && cspScanDesignator(p) && p.k() === K_EqualsToken;
  p.reset(m);
  return r;
};

const cspScanDesignator = (p: CsParser): boolean => {
  if (p.k() === K_IdentifierToken) {
    if (!cspIsTrueIdentifier(p)) {
      return false;
    }
    p.eat();
    return true;
  }
  if (p.k() === K_OpenParenToken) {
    while (true) {
      p.eat();
      if (!cspScanDesignator(p)) {
        return false;
      }
      if (p.k() === K_CommaToken) {
        continue;
      }
      if (p.k() === K_CloseParenToken) {
        p.eat();
        return true;
      }
      return false;
    }
  }
  return false;
};

const cspIsPossibleAnonymousMethodExpression = (p: CsParser): boolean => {
  let i = 0;
  while (p.kindAt(i) === K_StaticKeyword || (p.kindAt(i) === K_IdentifierToken && p.ckAt(i) === K_AsyncKeyword)) {
    if (i >= 2147483646) {
      fault();
      return false;
    }
    i++;
  }
  if (p.kindAt(i) !== K_DelegateKeyword) {
    return false;
  }
  if (i >= 2147483647) {
    fault();
    return false;
  }
  return p.kindAt(i + 1) !== K_AsteriskToken;
};

const cspLiteralKind = (t: i32): i32 => {
  switch (t) {
    case K_ArgListKeyword:
      return K_ArgListExpression;
    case K_FalseKeyword:
      return K_FalseLiteralExpression;
    case K_TrueKeyword:
      return K_TrueLiteralExpression;
    case K_NullKeyword:
      return K_NullLiteralExpression;
    case K_NumericLiteralToken:
      return K_NumericLiteralExpression;
    case K_StringLiteralToken:
    case K_SingleLineRawStringLiteralToken:
    case K_MultiLineRawStringLiteralToken:
      return K_StringLiteralExpression;
    case K_Utf8StringLiteralToken:
    case K_Utf8SingleLineRawStringLiteralToken:
    case K_Utf8MultiLineRawStringLiteralToken:
      return K_Utf8StringLiteralExpression;
    case K_CharacterLiteralToken:
      return K_CharacterLiteralExpression;
    default:
      return 0;
  }
};

const cspPrimaryExpression = (p: CsParser, precedence: i32): i32 =>
  cspPostfixExpression(p, cspPrimaryWithoutPostfix(p, precedence));

const cspKeywordParenExpr = (p: CsParser, kind: i32, typeArg: boolean, orVoid: boolean): i32 => {
  const m = p.sp();
  p.push(p.eat());
  p.push(p.expect(K_OpenParenToken));
  p.push(typeArg ? (orVoid ? cspTypeOrVoid(p) : cspType(p, PT_NORMAL)) : cspExpressionCore(p));
  p.push(p.expect(K_CloseParenToken));
  return p.node(kind, m);
};

const cspPrimaryWithoutPostfix = (p: CsParser, precedence: i32): i32 => {
  const tk = p.k();
  switch (tk) {
    case K_TypeOfKeyword:
      return cspKeywordParenExpr(p, K_TypeOfExpression, true, true);
    case K_DefaultKeyword: {
      if (p.kindAt(1) === K_OpenParenToken) {
        return cspKeywordParenExpr(p, K_DefaultExpression, true, false);
      }
      const m = p.sp();
      p.push(p.eat());
      return p.node(K_DefaultLiteralExpression, m);
    }
    case K_SizeOfKeyword:
      return cspKeywordParenExpr(p, K_SizeOfExpression, true, false);
    case K_MakeRefKeyword:
      return cspKeywordParenExpr(p, K_MakeRefExpression, false, false);
    case K_RefTypeKeyword:
      return cspKeywordParenExpr(p, K_RefTypeExpression, false, false);
    case K_CheckedKeyword:
      return cspKeywordParenExpr(p, K_CheckedExpression, false, false);
    case K_UncheckedKeyword:
      return cspKeywordParenExpr(p, K_UncheckedExpression, false, false);
    case K_UnsafeKeyword:
      return cspKeywordParenExpr(p, K_UnsafeExpression, false, false);
    case K_RefValueKeyword: {
      const m = p.sp();
      p.push(p.eat());
      p.push(p.expect(K_OpenParenToken));
      p.push(cspExpressionCore(p));
      p.push(p.expect(K_CommaToken));
      p.push(cspType(p, PT_NORMAL));
      p.push(p.expect(K_CloseParenToken));
      return p.node(K_RefValueExpression, m);
    }
    case K_ColonColonToken:
      return cspAliasQualifiedName(p, NO_IN_EXPRESSION);
    case K_EqualsGreaterThanToken:
      return cspLambdaExpression(p);
    case K_StaticKeyword:
      if (cspIsPossibleAnonymousMethodExpression(p)) {
        return cspAnonymousMethodExpression(p);
      }
      if (cspIsPossibleLambdaExpression(p, precedence)) {
        return cspLambdaExpression(p);
      }
      p.fail("invalid expression term");
      return -1;
    case K_IdentifierToken: {
      if (!cspIsTrueIdentifier(p)) {
        p.fail("invalid expression term");
        return -1;
      }
      if (cspIsPossibleAnonymousMethodExpression(p)) {
        return cspAnonymousMethodExpression(p);
      }
      if (cspIsPossibleLambdaExpression(p, precedence)) {
        const l = cspTryLambdaExpression(p);
        if (l >= 0) {
          return l;
        }
        if (p.err) {
          return -1;
        }
      }
      if (cspIsPossibleDeconstructionLeft(p, precedence)) {
        return cspDeclarationExpression(p, PT_NORMAL, false);
      }
      if (p.ck() === K_FieldKeyword && p.inField && p.kindAt(1) !== K_ColonColonToken) {
        const m = p.sp();
        p.push(p.eatContextual(K_FieldKeyword));
        return p.node(K_FieldExpression, m);
      }
      return cspAliasQualifiedName(p, NO_IN_EXPRESSION);
    }
    case K_OpenBracketToken:
      return cspIsPossibleLambdaExpression(p, precedence) ? cspLambdaExpression(p) : cspCollectionExpression(p);
    case K_ThisKeyword: {
      const m = p.sp();
      p.push(p.eat());
      return p.node(K_ThisExpression, m);
    }
    case K_BaseKeyword: {
      const m = p.sp();
      p.push(p.eat());
      return p.node(K_BaseExpression, m);
    }
    case K_ArgListKeyword:
    case K_FalseKeyword:
    case K_TrueKeyword:
    case K_NullKeyword:
    case K_NumericLiteralToken:
    case K_StringLiteralToken:
    case K_Utf8StringLiteralToken:
    case K_CharacterLiteralToken:
    case K_SingleLineRawStringLiteralToken:
    case K_Utf8SingleLineRawStringLiteralToken:
    case K_MultiLineRawStringLiteralToken:
    case K_Utf8MultiLineRawStringLiteralToken: {
      const m = p.sp();
      p.push(p.eat());
      return p.node(cspLiteralKind(tk), m);
    }
    case K_InterpolatedStringStartToken:
    case K_InterpolatedVerbatimStringStartToken:
    case K_InterpolatedSingleLineRawStringStartToken:
    case K_InterpolatedMultiLineRawStringStartToken:
      return cspInterpolatedString(p);
    case K_OpenParenToken: {
      if (cspIsPossibleLambdaExpression(p, precedence)) {
        const l = cspTryLambdaExpression(p);
        if (l >= 0) {
          return l;
        }
        if (p.err) {
          return -1;
        }
      }
      return cspCastOrParenExpressionOrTuple(p);
    }
    case K_NewKeyword:
      return cspNewExpression(p);
    case K_StackAllocKeyword:
      return cspStackAllocExpression(p);
    case K_DelegateKeyword:
      return cspIsPossibleLambdaExpression(p, precedence) ? cspLambdaExpression(p) : cspAnonymousMethodExpression(p);
    case K_RefKeyword:
      if (cspIsPossibleLambdaExpression(p, precedence)) {
        return cspLambdaExpression(p);
      }
      p.fail("invalid expression term ref");
      return -1;
    default:
      if (csIsPredefinedType(tk)) {
        if (cspIsPossibleLambdaExpression(p, precedence)) {
          return cspLambdaExpression(p);
        }
        const m = p.sp();
        p.push(p.eat());
        const e = p.node(K_PredefinedType, m);
        if (p.k() !== K_DotToken || tk === K_VoidKeyword) {
          p.fail("invalid expression term");
        }
        return e;
      }
      p.fail(`invalid expression term ${tk}`);
      return -1;
  }
};

const cspPostfixExpression = (p: CsParser, first: i32): i32 => {
  let e = first;
  while (!p.err) {
    switch (p.k()) {
      case K_OpenParenToken: {
        const m = p.sp();
        p.push(e);
        p.push(cspArgumentList(p));
        e = p.node(K_InvocationExpression, m);
        continue;
      }
      case K_OpenBracketToken: {
        const m = p.sp();
        p.push(e);
        p.push(cspBracketedArgumentList(p));
        e = p.node(K_ElementAccessExpression, m);
        continue;
      }
      case K_PlusPlusToken:
      case K_MinusMinusToken: {
        const m = p.sp();
        p.push(e);
        const t = p.eat();
        p.push(t);
        e = p.node(p.tokKind(t) === K_PlusPlusToken ? K_PostIncrementExpression : K_PostDecrementExpression, m);
        continue;
      }
      case K_ColonColonToken:
        p.fail("unexpected aliased name");
        return -1;
      case K_MinusGreaterThanToken: {
        const m = p.sp();
        p.push(e);
        p.push(p.eat());
        p.push(cspSimpleName(p, NO_IN_EXPRESSION));
        e = p.node(K_PointerMemberAccessExpression, m);
        continue;
      }
      case K_DotToken: {
        if (cspIsAtDotDot(p)) {
          return e;
        }
        const m = p.sp();
        p.push(e);
        p.push(p.eat());
        p.push(cspSimpleName(p, NO_IN_EXPRESSION));
        e = p.node(K_SimpleMemberAccessExpression, m);
        continue;
      }
      case K_QuestionToken: {
        const c = cspTryConditionalAccess(p, e);
        if (c >= 0) {
          e = c;
          continue;
        }
        return e;
      }
      case K_ExclamationToken: {
        const m = p.sp();
        p.push(e);
        p.push(p.eat());
        e = p.node(K_SuppressNullableWarningExpression, m);
        continue;
      }
      default:
        return e;
    }
  }
  return e;
};

const cspTryConditionalAccess = (p: CsParser, primary: i32): i32 => {
  if (p.k() !== K_QuestionToken) {
    return -1;
  }
  const k1 = p.kindAt(1);
  let binding = -1;
  let q = -1;
  if (k1 === K_DotToken && !(p.kindAt(2) === K_DotToken && p.noTriviaBetween(1))) {
    q = p.eat();
    const m = p.sp();
    p.push(p.eat());
    p.push(cspSimpleName(p, NO_IN_EXPRESSION));
    binding = p.node(K_MemberBindingExpression, m);
  } else if (k1 === K_OpenBracketToken && cspIsStartOfElementBinding(p)) {
    q = p.eat();
    const m = p.sp();
    p.push(cspBracketedArgumentList(p));
    binding = p.node(K_ElementBindingExpression, m);
  } else {
    return -1;
  }
  const m = p.sp();
  p.push(primary);
  p.push(q);
  p.push(cspWhenNotNull(p, binding));
  return p.node(K_ConditionalAccessExpression, m);
};

const cspIsStartOfElementBinding = (p: CsParser): boolean => {
  if (p.forceConditionalAccess) {
    return true;
  }
  const m = p.mark();
  p.eat(); // ?
  cspPossibleRefExpression(p);
  const r = p.k() !== K_ColonToken;
  p.reset(m);
  return r;
};

const cspWhenNotNull = (p: CsParser, first: i32): i32 => {
  let e = first;
  while (!p.err) {
    const before = p.mark();
    const beforeExpr = e;
    while (p.k() === K_ExclamationToken) {
      const m = p.sp();
      p.push(e);
      p.push(p.eat());
      e = p.node(K_SuppressNullableWarningExpression, m);
    }
    const k = p.k();
    if (k === K_OpenParenToken) {
      const m = p.sp();
      p.push(e);
      p.push(cspArgumentList(p));
      e = p.node(K_InvocationExpression, m);
      continue;
    }
    if (k === K_OpenBracketToken) {
      const m = p.sp();
      p.push(e);
      p.push(cspBracketedArgumentList(p));
      e = p.node(K_ElementAccessExpression, m);
      continue;
    }
    if (k === K_DotToken) {
      const m = p.sp();
      p.push(e);
      p.push(p.eat());
      p.push(cspSimpleName(p, NO_IN_EXPRESSION));
      e = p.node(K_SimpleMemberAccessExpression, m);
      continue;
    }
    const c = cspTryConditionalAccess(p, e);
    if (c >= 0) {
      return c;
    }
    const op = cspCurrentOperator(p);
    if (op.tok !== 0 && cspAssignmentKind(op.tok) !== 0) {
      return cspAssignmentExpression(p, op.expr, e, cspEatOperator(p, op));
    }
    p.reset(before);
    return beforeExpr;
  }
  return e;
};

// ---- argument lists ----

export const cspArgumentList = (p: CsParser): i32 =>
  cspArgumentListImpl(p, K_OpenParenToken, K_CloseParenToken, K_ArgumentList);
export const cspBracketedArgumentList = (p: CsParser): i32 =>
  cspArgumentListImpl(p, K_OpenBracketToken, K_CloseBracketToken, K_BracketedArgumentList);

const cspArgumentListImpl = (p: CsParser, open: i32, close: i32, kind: i32): i32 => {
  const isIndexer = open === K_OpenBracketToken;
  const m = p.sp();
  p.push(p.expect(open));
  const lm = p.sp();
  if (p.k() !== close && p.k() !== K_SemicolonToken) {
    if (!(p.k() === K_CommaToken || cspIsPossibleArgumentExpression(p))) {
      p.fail("argument expected");
    } else {
      p.push(cspArgumentExpression(p, isIndexer));
      while (p.k() === K_CommaToken && !p.err) {
        p.push(p.eat());
        p.push(cspArgumentExpression(p, isIndexer));
      }
    }
  } else if (isIndexer && p.k() === close) {
    p.fail("value expected");
  }
  p.push(p.list(lm));
  p.push(p.expect(close));
  return p.node(kind, m);
};

const cspIsValidArgumentRefKindKeyword = (k: i32): boolean =>
  k === K_RefKeyword || k === K_OutKeyword || k === K_InKeyword;

const cspIsPossibleArgumentExpression = (p: CsParser): boolean =>
  cspIsValidArgumentRefKindKeyword(p.k()) || cspIsPossibleExpression(p);

const cspArgumentExpression = (p: CsParser, isIndexer: boolean): i32 => {
  const m = p.sp();
  if (p.k() === K_IdentifierToken && p.kindAt(1) === K_ColonToken) {
    const cm = p.sp();
    p.push(cspIdentifierName(p));
    p.push(p.expect(K_ColonToken));
    p.push(p.node(K_NameColon, cm));
  } else {
    p.push(-1);
  }
  let refKind = -1;
  if (
    cspIsValidArgumentRefKindKeyword(p.k()) &&
    !(p.k() === K_RefKeyword && cspIsPossibleLambdaExpression(p, PREC_EXPRESSION))
  ) {
    refKind = p.eat();
  }
  p.push(refKind);
  if (p.k() === K_CommaToken || (isIndexer && p.k() === K_CloseBracketToken)) {
    p.fail("missing argument");
    return -1;
  }
  if (refKind >= 0 && p.tokKind(refKind) === K_OutKeyword) {
    p.push(cspExpressionOrDeclarationExpr(p, PT_NORMAL, false));
  } else {
    p.push(cspSubExpression(p, PREC_EXPRESSION));
  }
  return p.node(K_Argument, m);
};

const cspExpressionOrDeclarationExpr = (p: CsParser, mode: i32, permitTuple: boolean): i32 => {
  const d = cspIsPossibleDeclarationExpression(p, mode, permitTuple);
  if (d !== 0) {
    return cspDeclarationExpression(p, mode, d === 2);
  }
  return cspSubExpression(p, PREC_EXPRESSION);
};

// ---- lambdas ----

/** ParseAnonymousFunctionModifiers: pushes the modifiers. */
const cspAnonymousFunctionModifiers = (p: CsParser): void => {
  let allowPartial = false;
  if (p.k() === K_IdentifierToken && p.ck() === K_PartialKeyword) {
    for (let i = 1; ; i++) {
      if (p.kindAt(i) === K_StaticKeyword) {
        allowPartial = true;
        break;
      }
      if (!(p.kindAt(i) === K_IdentifierToken && (p.ckAt(i) === K_PartialKeyword || p.ckAt(i) === K_AsyncKeyword))) {
        break;
      }
      if (i >= 2147483647) {
        fault();
        break;
      }
    }
  }
  while (!p.err) {
    if (allowPartial && p.k() === K_IdentifierToken && p.ck() === K_PartialKeyword) {
      p.push(p.eatContextual(K_PartialKeyword));
      continue;
    }
    if (p.k() === K_StaticKeyword) {
      p.push(p.eat());
      continue;
    }
    if (p.k() === K_IdentifierToken && p.ck() === K_AsyncKeyword && cspIsAnonymousFunctionAsyncModifier(p)) {
      p.push(p.eatContextual(K_AsyncKeyword));
      continue;
    }
    break;
  }
};

const cspIsAnonymousFunctionAsyncModifier = (p: CsParser): boolean => {
  const k = p.kindAt(1);
  switch (k) {
    case K_OpenParenToken:
    case K_IdentifierToken:
    case K_StaticKeyword:
    case K_RefKeyword:
    case K_DelegateKeyword:
      return true;
    default:
      return csIsPredefinedType(k);
  }
};

export const cspIsUnambiguousModifierListFollowedByOpenParen = (p: CsParser): boolean => {
  const m = p.mark();
  const sp = p.sp();
  cspAnonymousFunctionModifiers(p);
  let sawStatic = false;
  const stk = p.t.stk;
  const tsp = p.t.sp;
  for (let i = sp; i < tsp; i++) {
    if (i < 0 || i >= stk.length) {
      fault();
      break;
    }
    if (p.tokKind(stk[i]) === K_StaticKeyword) {
      sawStatic = true;
    }
  }
  const r = p.k() === K_OpenParenToken && sawStatic;
  p.reset(m);
  return r;
};

export const cspIsPossibleLambdaExpression = (p: CsParser, precedence: i32): boolean => {
  if (precedence > PREC_LAMBDA) {
    return false;
  }
  if (p.kindAt(1) === K_EqualsGreaterThanToken) {
    return true;
  }
  const m = p.mark();
  const r = cspIsPossibleLambdaExpressionScan(p, precedence);
  p.reset(m);
  return r;
};

const cspIsPossibleLambdaExpressionScan = (p: CsParser, precedence: i32): boolean => {
  if (p.k() === K_OpenBracketToken) {
    cspAttributeDeclarations(p, true);
    if (p.err) {
      return false;
    }
  }
  if (cspIsUnambiguousModifierListFollowedByOpenParen(p)) {
    return true;
  }
  let seenStatic = false;
  if (p.k() === K_StaticKeyword) {
    p.eat();
    seenStatic = true;
  } else if (p.k() === K_IdentifierToken && p.ck() === K_AsyncKeyword && p.kindAt(1) === K_StaticKeyword) {
    p.eat();
    p.eat();
    seenStatic = true;
  }
  if (seenStatic) {
    if (p.k() === K_EqualsGreaterThanToken || p.k() === K_OpenParenToken) {
      return true;
    }
  }
  if (p.k() === K_IdentifierToken && p.kindAt(1) === K_EqualsGreaterThanToken) {
    return true;
  }
  if (p.k() === K_IdentifierToken && p.ck() === K_AsyncKeyword && cspIsAnonymousFunctionAsyncModifier(p)) {
    p.eat();
  }
  {
    const nm = p.mark();
    const st = cspScanType(p, PT_NORMAL);
    if (st === ST_NOT_TYPE || p.k() !== K_OpenParenToken) {
      p.reset(nm);
    }
  }
  if (p.k() === K_IdentifierToken && p.kindAt(1) === K_EqualsGreaterThanToken) {
    return true;
  }
  if (p.k() !== K_OpenParenToken) {
    return false;
  }
  return cspScanParenthesizedLambda(p, precedence);
};

const cspScanParenthesizedLambda = (p: CsParser, precedence: i32): boolean =>
  cspScanImplicitlyTypedLambda(p, precedence) || cspScanExplicitlyTypedLambda(p, precedence);

const cspIsParameterModifierIncludingScoped = (p: CsParser, i: i32): boolean =>
  cspIsParameterModifierExcludingScoped(p.kindAt(i)) ||
  (p.kindAt(i) === K_IdentifierToken && p.ckAt(i) === K_ScopedKeyword);

const cspScanImplicitlyTypedLambda = (p: CsParser, precedence: i32): boolean => {
  if (precedence > PREC_LAMBDA) {
    return false;
  }
  let i = 1;
  while (true) {
    const k = p.kindAt(i);
    if (i >= 2147483646) {
      fault();
      return false;
    }
    i++;
    if (cspIsTrueIdentifierAt(p, i - 1) || k === K_CommaToken || cspIsParameterModifierIncludingScoped(p, i - 1)) {
      continue;
    }
    return k === K_CloseParenToken && p.kindAt(i) === K_EqualsGreaterThanToken;
  }
};

const cspScanExplicitlyTypedLambda = (p: CsParser, precedence: i32): boolean => {
  if (precedence > PREC_LAMBDA) {
    return false;
  }
  const m = p.mark();
  let r = false;
  while (!p.err) {
    p.eat();
    const sp = p.sp();
    cspAttributeDeclarations(p, true);
    p.t.sp = sp;
    if (cspIsParameterModifierIncludingScoped(p, 0)) {
      cspParameterModifiers(p, false, true);
      p.t.sp = sp;
    }
    if (cspShouldParseLambdaParameterType(p) && cspScanType(p, PT_NORMAL) === ST_NOT_TYPE) {
      r = false;
      break;
    }
    if (cspIsTrueIdentifier(p)) {
      p.eat();
    }
    if (p.k() === K_EqualsToken) {
      p.eat();
      if (p.k() === K_OpenBracketToken) {
        r = false;
        break;
      }
      cspExpressionCore(p);
      p.t.sp = sp;
    }
    if (p.k() === K_CommaToken) {
      continue;
    }
    if (p.k() === K_CloseParenToken) {
      r = p.kindAt(1) === K_EqualsGreaterThanToken;
      break;
    }
    r = false;
    break;
  }
  p.reset(m);
  return r;
};

const cspShouldParseLambdaParameterType = (p: CsParser): boolean => {
  const k = p.k();
  if (csIsPredefinedType(k) || k === K_OpenParenToken || cspIsFunctionPointerStart(p)) {
    return true;
  }
  if (cspIsTrueIdentifierAt(p, 0)) {
    const k1 = p.kindAt(1);
    if (
      k1 !== K_CommaToken &&
      k1 !== K_CloseParenToken &&
      k1 !== K_EqualsGreaterThanToken &&
      k1 !== K_OpenBraceToken &&
      k1 !== K_EqualsToken
    ) {
      return true;
    }
  }
  return false;
};

const cspTryLambdaExpression = (p: CsParser): i32 => {
  const m = p.mark();
  const r = cspLambdaExpression(p);
  if (p.err) {
    return -1;
  }
  if (p.k() === K_ColonToken && r >= 0 && p.nodeKind(r) === K_ParenthesizedLambdaExpression) {
    const rt = p.t.s(r, 2);
    if (rt >= 0 && p.nodeKind(rt) === K_NullableType) {
      p.reset(m);
      return -1;
    }
  }
  return r;
};

const cspLambdaExpression = (p: CsParser): i32 => {
  const attrs = cspAttributeDeclarations(p, true);
  const mm = p.sp();
  cspAnonymousFunctionModifiers(p);
  let isAsync = false;
  const stk = p.t.stk;
  const tsp = p.t.sp;
  for (let i = mm; i < tsp; i++) {
    if (i < 0 || i >= stk.length) {
      fault();
      break;
    }
    if (p.tokKind(stk[i]) === K_AsyncKeyword) {
      isAsync = true;
    }
  }
  const mods = p.list(mm);
  const saveAsync = p.inAsync;
  const saveForce = p.forceConditionalAccess;
  p.inAsync = p.inAsync || isAsync;
  p.forceConditionalAccess = false;
  let r = -1;
  // a return type
  let rt = -1;
  {
    const rp = p.mark();
    rt = cspTypeOrVoid(p);
    if (p.err || p.k() !== K_OpenParenToken) {
      p.reset(rp);
      rt = -1;
    }
  }
  if (p.k() === K_OpenParenToken) {
    const m = p.sp();
    p.push(attrs);
    p.push(mods);
    p.push(rt);
    p.push(cspLambdaParameterList(p));
    p.push(p.expect(K_EqualsGreaterThanToken));
    cspLambdaBody(p);
    r = p.node(K_ParenthesizedLambdaExpression, m);
  } else {
    let ident = -1;
    if (p.k() !== K_IdentifierToken && p.kindAt(1) === K_EqualsGreaterThanToken) {
      ident = p.eat();
    } else {
      ident = cspIdentifierToken(p);
    }
    const m = p.sp();
    p.push(attrs);
    p.push(mods);
    const pm = p.sp();
    p.push(p.list(p.sp()));
    p.push(p.list(p.sp()));
    p.push(-1);
    p.push(ident);
    p.push(-1);
    p.push(p.node(K_Parameter, pm));
    p.push(p.expect(K_EqualsGreaterThanToken));
    cspLambdaBody(p);
    r = p.node(K_SimpleLambdaExpression, m);
  }
  p.inAsync = saveAsync;
  p.forceConditionalAccess = saveForce;
  return r;
};

/** Pushes Block, ExpressionBody. */
const cspLambdaBody = (p: CsParser): void => {
  if (p.k() === K_OpenBraceToken) {
    p.push(cspBlock(p, p.list(p.sp())));
    p.push(-1);
  } else {
    p.push(-1);
    p.push(cspPossibleRefExpression(p));
  }
};

const cspLambdaParameterList = (p: CsParser): i32 => {
  const m = p.sp();
  p.push(p.expect(K_OpenParenToken));
  const lm = p.sp();
  if (p.k() !== K_CloseParenToken) {
    if (!(p.k() === K_CommaToken || cspIsPossibleLambdaParameter(p))) {
      p.fail("lambda parameter expected");
    } else {
      p.push(cspLambdaParameter(p));
      while (p.k() === K_CommaToken && !p.err) {
        p.push(p.eat());
        p.push(cspLambdaParameter(p));
      }
    }
  }
  p.push(p.list(lm));
  p.push(p.expect(K_CloseParenToken));
  return p.node(K_ParameterList, m);
};

const cspIsPossibleLambdaParameter = (p: CsParser): boolean => {
  switch (p.k()) {
    case K_ParamsKeyword:
    case K_ReadOnlyKeyword:
    case K_RefKeyword:
    case K_OutKeyword:
    case K_InKeyword:
    case K_OpenParenToken:
    case K_OpenBracketToken:
      return true;
    case K_IdentifierToken:
      return cspIsTrueIdentifier(p);
    case K_DelegateKeyword:
      return cspIsFunctionPointerStart(p);
    default:
      return csIsPredefinedType(p.k());
  }
};

const cspLambdaParameter = (p: CsParser): i32 => {
  const m = p.sp();
  p.push(cspAttributeDeclarations(p, false));
  const mm = p.sp();
  if (cspIsParameterModifierIncludingScoped(p, 0)) {
    cspParameterModifiers(p, false, true);
  }
  p.push(p.list(mm));
  p.push(cspShouldParseLambdaParameterType(p) ? cspType(p, PT_PARAMETER) : -1);
  p.push(cspIdentifierToken(p));
  if (p.k() === K_EqualsToken) {
    const em = p.sp();
    p.push(p.eat());
    p.push(cspExpressionCore(p));
    p.push(p.node(K_EqualsValueClause, em));
  } else {
    p.push(-1);
  }
  return p.node(K_Parameter, m);
};

const cspAnonymousMethodExpression = (p: CsParser): i32 => {
  const mm = p.sp();
  cspAnonymousFunctionModifiers(p);
  let isAsync = false;
  const stk = p.t.stk;
  const tsp = p.t.sp;
  for (let i = mm; i < tsp; i++) {
    if (i < 0 || i >= stk.length) {
      fault();
      break;
    }
    if (p.tokKind(stk[i]) === K_AsyncKeyword) {
      isAsync = true;
    }
  }
  const mods = p.list(mm);
  const saveAsync = p.inAsync;
  const saveForce = p.forceConditionalAccess;
  p.inAsync = p.inAsync || isAsync;
  p.forceConditionalAccess = false;
  const m = p.sp();
  p.push(mods);
  p.push(p.expect(K_DelegateKeyword));
  p.push(p.k() === K_OpenParenToken ? cspParenthesizedParameterListE(p) : -1);
  if (p.k() !== K_OpenBraceToken) {
    p.fail("{ expected");
    return -1;
  }
  p.push(cspBlock(p, p.list(p.sp())));
  p.push(-1);
  p.inAsync = saveAsync;
  p.forceConditionalAccess = saveForce;
  return p.node(K_AnonymousMethodExpression, m);
};

const cspParenthesizedParameterListE = (p: CsParser): i32 => cspParenthesizedParameterList(p, false);

// ---- casts, parentheses and tuples ----

const cspCanFollowCast = (k: i32): boolean => {
  switch (k) {
    case K_AsKeyword:
    case K_IsKeyword:
    case K_SemicolonToken:
    case K_CloseParenToken:
    case K_CloseBracketToken:
    case K_OpenBraceToken:
    case K_CloseBraceToken:
    case K_CommaToken:
    case K_EqualsToken:
    case K_PlusEqualsToken:
    case K_MinusEqualsToken:
    case K_AsteriskEqualsToken:
    case K_SlashEqualsToken:
    case K_PercentEqualsToken:
    case K_AmpersandEqualsToken:
    case K_CaretEqualsToken:
    case K_BarEqualsToken:
    case K_LessThanLessThanEqualsToken:
    case K_GreaterThanGreaterThanEqualsToken:
    case K_GreaterThanGreaterThanGreaterThanEqualsToken:
    case K_QuestionToken:
    case K_ColonToken:
    case K_BarBarToken:
    case K_AmpersandAmpersandToken:
    case K_BarToken:
    case K_CaretToken:
    case K_AmpersandToken:
    case K_EqualsEqualsToken:
    case K_ExclamationEqualsToken:
    case K_LessThanToken:
    case K_LessThanEqualsToken:
    case K_GreaterThanToken:
    case K_GreaterThanEqualsToken:
    case K_QuestionQuestionEqualsToken:
    case K_LessThanLessThanToken:
    case K_GreaterThanGreaterThanToken:
    case K_GreaterThanGreaterThanGreaterThanToken:
    case K_PlusToken:
    case K_MinusToken:
    case K_AsteriskToken:
    case K_SlashToken:
    case K_PercentToken:
    case K_PlusPlusToken:
    case K_MinusMinusToken:
    case K_OpenBracketToken:
    case K_DotToken:
    case K_MinusGreaterThanToken:
    case K_QuestionQuestionToken:
    case K_EndOfFileToken:
    case K_SwitchKeyword:
    case K_EqualsGreaterThanToken:
      return false;
    default:
      return true;
  }
};

const cspScanCast = (p: CsParser, forPattern: boolean, inSwitchArmPattern: boolean): boolean => {
  if (p.k() !== K_OpenParenToken) {
    return false;
  }
  p.eat();
  const type = cspScanType(p, forPattern ? PT_DEFINITE_PATTERN : PT_NORMAL);
  if (type === ST_NOT_TYPE) {
    return false;
  }
  if (p.k() !== K_CloseParenToken) {
    return false;
  }
  p.eat();
  if (forPattern && p.k() === K_IdentifierToken) {
    if (cspIsBinaryPattern(p)) {
      return false;
    }
    if (inSwitchArmPattern && p.ck() === K_WhenKeyword) {
      return false;
    }
    return true;
  }
  switch (type) {
    case ST_POINTER_OR_MULTIPLICATION:
    case ST_NULLABLE_TYPE:
    case ST_MUST_BE_TYPE:
    case ST_ALIAS_QUALIFIED_NAME: {
      if (!forPattern) {
        return true;
      }
      const k = p.k();
      if (k === K_PlusToken || k === K_MinusToken || k === K_AmpersandToken || k === K_AsteriskToken) {
        return true;
      }
      if (k === K_DotToken && cspIsAtDotDot(p)) {
        return true;
      }
      return cspCanFollowCast(k);
    }
    case ST_GENERIC_TYPE_OR_METHOD:
    case ST_TUPLE_TYPE:
      return p.k() === K_OpenBracketToken || cspCanFollowCast(p.k());
    case ST_GENERIC_TYPE_OR_EXPRESSION:
    case ST_NON_GENERIC_TYPE_OR_EXPRESSION:
      if (p.k() === K_OpenBracketToken && p.kindAt(1) === K_CloseBracketToken) {
        return true;
      }
      return cspCanFollowCast(p.k());
    default:
      return false;
  }
};

const cspIsBinaryPatternKeyword = (p: CsParser): boolean =>
  p.k() === K_IdentifierToken && (p.ck() === K_OrKeyword || p.ck() === K_AndKeyword);

const cspIsBinaryPattern = (p: CsParser): boolean => {
  if (!cspIsBinaryPatternKeyword(p)) {
    return false;
  }
  let last = true;
  p.eat();
  while (cspIsBinaryPatternKeyword(p)) {
    last = !last;
    p.eat();
  }
  return last === cspIsPossibleSubpatternElement(p);
};

const cspCastOrParenExpressionOrTuple = (p: CsParser): i32 => {
  const rp = p.mark();
  if (cspScanCast(p, false, false)) {
    if (!(p.inQuery && p.k() === K_IdentifierToken && cspIsQueryKeywordCk(p.ck()))) {
      p.reset(rp);
      const m = p.sp();
      p.push(p.expect(K_OpenParenToken));
      p.push(cspType(p, PT_NORMAL));
      p.push(p.expect(K_CloseParenToken));
      p.push(cspSubExpression(p, PREC_CAST));
      return p.node(K_CastExpression, m);
    }
  }
  p.reset(rp);
  const open = p.expect(K_OpenParenToken);
  const e = cspExpressionOrDeclarationExpr(p, PT_FIRST_ELEMENT_OF_POSSIBLE_TUPLE_LITERAL, true);
  if (p.err) {
    return -1;
  }
  if (p.k() === K_CommaToken) {
    const am = p.sp();
    p.push(-1);
    p.push(-1);
    p.push(e);
    return cspTupleExpressionTail(p, open, p.node(K_Argument, am));
  }
  if (p.nodeKind(e) === K_IdentifierName && p.k() === K_ColonToken) {
    const am = p.sp();
    const cm = p.sp();
    p.push(e);
    p.push(p.eat());
    p.push(p.node(K_NameColon, cm));
    p.push(-1);
    p.push(cspExpressionOrDeclarationExpr(p, PT_FIRST_ELEMENT_OF_POSSIBLE_TUPLE_LITERAL, true));
    return cspTupleExpressionTail(p, open, p.node(K_Argument, am));
  }
  const m = p.sp();
  p.push(open);
  p.push(e);
  p.push(p.expect(K_CloseParenToken));
  return p.node(K_ParenthesizedExpression, m);
};

const cspIsQueryKeywordCk = (ck: i32): boolean =>
  ck === K_FromKeyword ||
  ck === K_JoinKeyword ||
  ck === K_IntoKeyword ||
  ck === K_WhereKeyword ||
  ck === K_OrderByKeyword ||
  ck === K_GroupKeyword ||
  ck === K_SelectKeyword ||
  ck === K_LetKeyword ||
  ck === K_OnKeyword ||
  ck === K_EqualsKeyword ||
  ck === K_AscendingKeyword ||
  ck === K_DescendingKeyword ||
  ck === K_ByKeyword;

const cspTupleExpressionTail = (p: CsParser, open: i32, firstArg: i32): i32 => {
  const m = p.sp();
  p.push(open);
  const lm = p.sp();
  p.push(firstArg);
  let n = 1;
  while (p.k() === K_CommaToken && !p.err) {
    p.push(p.eat());
    const e = cspExpressionOrDeclarationExpr(p, PT_AFTER_TUPLE_COMMA, true);
    const am = p.sp();
    if (e >= 0 && p.nodeKind(e) === K_IdentifierName && p.k() === K_ColonToken) {
      const cm = p.sp();
      p.push(e);
      p.push(p.eat());
      p.push(p.node(K_NameColon, cm));
      p.push(-1);
      p.push(cspExpressionOrDeclarationExpr(p, PT_AFTER_TUPLE_COMMA, true));
    } else {
      p.push(-1);
      p.push(-1);
      p.push(e);
    }
    p.push(p.node(K_Argument, am));
    if (n >= 2147483647) {
      fault();
      break;
    }
    n++;
  }
  if (n < 2) {
    p.fail("tuple too few elements");
  }
  p.push(p.list(lm));
  p.push(p.expect(K_CloseParenToken));
  return p.node(K_TupleExpression, m);
};

// ---- new, stackalloc, initializers ----

const cspNewExpression = (p: CsParser): i32 => {
  if (p.kindAt(1) === K_OpenBraceToken) {
    return cspAnonymousTypeExpression(p);
  }
  if (p.kindAt(1) === K_OpenBracketToken) {
    return cspImplicitlyTypedArrayCreation(p);
  }
  return cspArrayOrObjectCreation(p);
};

const cspAnonymousTypeExpression = (p: CsParser): i32 => {
  const m = p.sp();
  p.push(p.eat());
  p.push(p.expect(K_OpenBraceToken));
  const lm = p.sp();
  if (p.k() !== K_CloseBraceToken) {
    p.push(cspAnonymousMember(p));
    while (p.k() === K_CommaToken && !p.err) {
      p.push(p.eat());
      if (p.k() === K_CloseBraceToken) {
        break;
      }
      p.push(cspAnonymousMember(p));
    }
  }
  p.push(p.list(lm));
  p.push(p.expect(K_CloseBraceToken));
  return p.node(K_AnonymousObjectCreationExpression, m);
};

const cspAnonymousMember = (p: CsParser): i32 => {
  const m = p.sp();
  p.push(cspIsNamedAssignment(p) ? cspNameEquals(p) : -1);
  p.push(cspExpressionCore(p));
  return p.node(K_AnonymousObjectMemberDeclarator, m);
};

export const cspIsNamedAssignment = (p: CsParser): boolean => cspIsTrueIdentifier(p) && p.kindAt(1) === K_EqualsToken;

const cspIsImplicitObjectCreation = (p: CsParser): boolean => {
  if (p.k() !== K_OpenParenToken) {
    return false;
  }
  const m = p.mark();
  p.eat();
  const st = cspScanTupleTypePublic(p);
  let r = true;
  if (st !== ST_NOT_TYPE) {
    const k = p.k();
    if (k === K_QuestionToken || k === K_OpenBracketToken || k === K_OpenParenToken) {
      r = false;
    }
  }
  p.reset(m);
  return r;
};

const cspArrayOrObjectCreation = (p: CsParser): i32 => {
  const nw = p.expect(K_NewKeyword);
  let type = -1;
  if (!cspIsImplicitObjectCreation(p)) {
    type = cspType(p, PT_NEW_EXPRESSION);
    if (p.err) {
      return -1;
    }
    if (p.nodeKind(type) === K_ArrayType) {
      const m = p.sp();
      p.push(nw);
      p.push(type);
      p.push(p.k() === K_OpenBraceToken ? cspArrayInitializer(p) : -1);
      return p.node(K_ArrayCreationExpression, m);
    }
  }
  const args = p.k() === K_OpenParenToken ? cspArgumentList(p) : -1;
  const init = p.k() === K_OpenBraceToken ? cspObjectOrCollectionInitializer(p) : -1;
  if (args < 0 && init < 0) {
    p.fail("bad new expression");
    return -1;
  }
  const m = p.sp();
  p.push(nw);
  if (type >= 0) {
    p.push(type);
    p.push(args);
    p.push(init);
    return p.node(K_ObjectCreationExpression, m);
  }
  p.push(args);
  p.push(init);
  return p.node(K_ImplicitObjectCreationExpression, m);
};

const cspWithExpression = (p: CsParser, receiver: i32, withTok: i32): i32 => {
  const m = p.sp();
  p.push(receiver);
  p.push(withTok);
  const im = p.sp();
  p.push(p.expect(K_OpenBraceToken));
  const lm = p.sp();
  if (p.k() !== K_CloseBraceToken) {
    p.push(cspExpressionCore(p));
    while (p.k() === K_CommaToken && !p.err) {
      p.push(p.eat());
      if (p.k() === K_CloseBraceToken) {
        break;
      }
      p.push(cspExpressionCore(p));
    }
  }
  p.push(p.list(lm));
  p.push(p.expect(K_CloseBraceToken));
  p.push(p.node(K_WithInitializerExpression, im));
  return p.node(K_WithExpression, m);
};

const cspIsInitializerMember = (p: CsParser): boolean =>
  p.k() === K_OpenBraceToken || cspIsNamedAssignment(p) || p.k() === K_OpenBracketToken || cspIsPossibleExpression(p);

const cspObjectOrCollectionInitializer = (p: CsParser): i32 => {
  const m = p.sp();
  p.push(p.expect(K_OpenBraceToken));
  const lm = p.sp();
  let isObject = true;
  let n = 0;
  if (p.k() !== K_CloseBraceToken) {
    if (!(p.k() === K_CommaToken || cspIsInitializerMember(p))) {
      p.fail("initializer member expected");
    } else {
      const e = cspInitializerMember(p);
      p.push(e);
      n++;
      let anyObj = cspIsObjectInitializerElement(p, e);
      while (p.k() === K_CommaToken && !p.err) {
        p.push(p.eat());
        if (p.k() === K_CloseBraceToken) {
          break;
        }
        const e2 = cspInitializerMember(p);
        p.push(e2);
        if (n >= 2147483647) {
          fault();
          break;
        }
        n++;
        anyObj = anyObj || cspIsObjectInitializerElement(p, e2);
      }
      if (p.k() === K_SemicolonToken) {
        p.fail("semicolon in initializer");
      }
      isObject = anyObj;
    }
  }
  if (n === 0) {
    isObject = true;
  }
  p.push(p.list(lm));
  p.push(p.expect(K_CloseBraceToken));
  return p.node(isObject ? K_ObjectInitializerExpression : K_CollectionInitializerExpression, m);
};

const cspIsObjectInitializerElement = (p: CsParser, e: i32): boolean => {
  if (e < 0 || p.nodeKind(e) !== K_SimpleAssignmentExpression) {
    return false;
  }
  const l = p.t.s(e, 0);
  const lk = p.nodeKind(l);
  return lk === K_IdentifierName || lk === K_ImplicitElementAccess;
};

const cspInitializerMember = (p: CsParser): i32 => {
  if (p.k() === K_OpenBraceToken) {
    return cspComplexElementInitializer(p);
  }
  if (p.k() === K_OpenBracketToken) {
    // dictionary initializer
    const m = p.sp();
    const im = p.sp();
    p.push(cspBracketedArgumentList(p));
    p.push(p.node(K_ImplicitElementAccess, im));
    p.push(p.expect(K_EqualsToken));
    p.push(p.k() === K_OpenBraceToken ? cspObjectOrCollectionInitializer(p) : cspPossibleRefExpression(p));
    return p.node(K_SimpleAssignmentExpression, m);
  }
  if (cspIsTrueIdentifier(p) && (p.kindAt(1) === K_EqualsToken || p.kindAt(1) === K_ColonToken)) {
    if (p.kindAt(1) === K_ColonToken) {
      p.fail("colon in object initializer");
      return -1;
    }
    const m = p.sp();
    p.push(cspIdentifierName(p));
    p.push(p.expect(K_EqualsToken));
    p.push(p.k() === K_OpenBraceToken ? cspObjectOrCollectionInitializer(p) : cspPossibleRefExpression(p));
    return p.node(K_SimpleAssignmentExpression, m);
  }
  return cspPossibleRefExpression(p);
};

const cspComplexElementInitializer = (p: CsParser): i32 => {
  const m = p.sp();
  p.push(p.expect(K_OpenBraceToken));
  const lm = p.sp();
  if (p.k() !== K_CloseBraceToken) {
    p.push(cspExpressionCore(p));
    while (p.k() === K_CommaToken && !p.err) {
      p.push(p.eat());
      p.push(cspExpressionCore(p));
    }
  }
  p.push(p.list(lm));
  p.push(p.expect(K_CloseBraceToken));
  return p.node(K_ComplexElementInitializerExpression, m);
};

const cspImplicitlyTypedArrayCreation = (p: CsParser): i32 => {
  const m = p.sp();
  p.push(p.eat());
  p.push(p.expect(K_OpenBracketToken));
  const lm = p.sp();
  while (p.k() === K_CommaToken) {
    p.push(p.eat());
  }
  if (cspIsPossibleExpression(p)) {
    p.fail("invalid array");
  }
  p.push(p.list(lm));
  p.push(p.expect(K_CloseBracketToken));
  p.push(cspArrayInitializer(p));
  return p.node(K_ImplicitArrayCreationExpression, m);
};

export const cspArrayInitializer = (p: CsParser): i32 => {
  const m = p.sp();
  p.push(p.expect(K_OpenBraceToken));
  const lm = p.sp();
  if (p.k() !== K_CloseBraceToken) {
    p.push(cspVariableInitializer(p));
    while (p.k() === K_CommaToken && !p.err) {
      p.push(p.eat());
      if (p.k() === K_CloseBraceToken) {
        break;
      }
      p.push(cspVariableInitializer(p));
    }
  }
  p.push(p.list(lm));
  p.push(p.expect(K_CloseBraceToken));
  return p.node(K_ArrayInitializerExpression, m);
};

const cspStackAllocExpression = (p: CsParser): i32 => {
  if (p.kindAt(1) === K_OpenBracketToken) {
    const m = p.sp();
    p.push(p.eat());
    p.push(p.expect(K_OpenBracketToken));
    if (p.k() !== K_CloseBracketToken) {
      p.fail("invalid stackalloc array");
      return -1;
    }
    p.push(p.expect(K_CloseBracketToken));
    p.push(cspArrayInitializer(p));
    return p.node(K_ImplicitStackAllocArrayCreationExpression, m);
  }
  const m = p.sp();
  p.push(p.eat());
  p.push(cspType(p, PT_NORMAL));
  p.push(p.k() === K_OpenBraceToken ? cspArrayInitializer(p) : -1);
  return p.node(K_StackAllocArrayCreationExpression, m);
};

export const cspCollectionExpression = (p: CsParser): i32 => {
  const m = p.sp();
  p.push(p.expect(K_OpenBracketToken));
  const lm = p.sp();
  if (p.k() !== K_CloseBracketToken) {
    if (!(p.k() === K_CommaToken || cspIsPossibleExpression(p))) {
      p.fail("collection element expected");
    } else {
      p.push(cspCollectionElement(p));
      while (p.k() === K_CommaToken && !p.err) {
        p.push(p.eat());
        if (p.k() === K_CloseBracketToken) {
          break;
        }
        p.push(cspCollectionElement(p));
      }
    }
  }
  p.push(p.list(lm));
  p.push(p.expect(K_CloseBracketToken));
  return p.node(K_CollectionExpression, m);
};

const cspCollectionElement = (p: CsParser): i32 => {
  if (p.k() === K_IdentifierToken && p.ck() === K_WithKeyword && p.kindAt(1) === K_OpenParenToken) {
    const m = p.sp();
    p.push(p.eatContextual(K_WithKeyword));
    p.push(cspArgumentList(p));
    return p.node(K_WithElement, m);
  }
  if (cspIsAtDotDot(p)) {
    const m = p.sp();
    p.push(cspEatDotDot(p));
    p.push(cspExpressionCore(p));
    return p.node(K_SpreadElement, m);
  }
  const m = p.sp();
  p.push(cspExpressionCore(p));
  return p.node(K_ExpressionElement, m);
};

// ---- interpolated strings ----

const cspInterpolatedString = (p: CsParser): i32 => {
  const m = p.sp();
  p.push(p.eat());
  const lm = p.sp();
  while (!p.err) {
    const k = p.k();
    if (k === K_InterpolatedStringTextToken) {
      const tm = p.sp();
      p.push(p.eat());
      p.push(p.node(K_InterpolatedStringText, tm));
      continue;
    }
    if (k === K_OpenBraceToken) {
      p.push(cspInterpolation(p));
      continue;
    }
    break;
  }
  p.push(p.list(lm));
  const ek = p.k();
  if (ek !== K_InterpolatedStringEndToken && ek !== K_InterpolatedRawStringEndToken) {
    p.fail("interpolated string end expected");
    return -1;
  }
  p.push(p.eat());
  return p.node(K_InterpolatedStringExpression, m);
};

const cspInterpolation = (p: CsParser): i32 => {
  const ob = p.eat();
  // the lexer left the index of the token that ends this hole on the `{`
  const end = p.tokCk(ob);
  if (end <= ob) {
    p.fail("bad interpolation");
    return -1;
  }
  const flags = p.lx.flags;
  if (end < 0 || end >= flags.length) {
    fault();
    return -1;
  }
  if ((flags[end] & TF_HOLE_END) === 0) {
    p.fail("bad interpolation");
    return -1;
  }
  const m = p.sp();
  p.push(ob);
  const saveStop = p.stop;
  p.stop = end;
  const e = cspExpressionCore(p);
  p.push(e);
  if (p.k() === K_CommaToken) {
    const am = p.sp();
    p.push(p.eat());
    p.push(cspExpressionCore(p));
    p.push(p.node(K_InterpolationAlignmentClause, am));
  } else {
    p.push(-1);
  }
  if (p.pos !== end && !p.err) {
    p.fail("unexpected tokens in interpolation");
  }
  p.stop = saveStop;
  if (p.err) {
    return -1;
  }
  if (p.tokKind(end) === K_ColonToken) {
    const fm = p.sp();
    p.push(p.eat());
    p.push(p.expect(K_InterpolatedStringTextToken));
    p.push(p.node(K_InterpolationFormatClause, fm));
  } else {
    p.push(-1);
  }
  p.push(p.expect(K_CloseBraceToken));
  return p.node(K_Interpolation, m);
};

// ---- queries ----

export const cspIsQueryExpression = (
  p: CsParser,
  mayBeVariableDeclaration: boolean,
  mayBeMemberDeclaration: boolean,
): boolean =>
  p.k() === K_IdentifierToken &&
  p.ck() === K_FromKeyword &&
  cspIsQueryExpressionAfterFrom(p, mayBeVariableDeclaration, mayBeMemberDeclaration);

const cspIsQueryExpressionAfterFrom = (
  p: CsParser,
  mayBeVariableDeclaration: boolean,
  mayBeMemberDeclaration: boolean,
): boolean => {
  const pk1 = p.kindAt(1);
  if (csIsPredefinedType(pk1)) {
    return true;
  }
  if (pk1 === K_IdentifierToken) {
    const pk2 = p.kindAt(2);
    if (pk2 === K_InKeyword) {
      return true;
    }
    if (mayBeVariableDeclaration) {
      if (pk2 === K_SemicolonToken || pk2 === K_CommaToken || pk2 === K_EqualsToken) {
        return false;
      }
    }
    if (mayBeMemberDeclaration) {
      if (pk2 === K_OpenParenToken || pk2 === K_OpenBraceToken) {
        return false;
      }
    } else {
      return true;
    }
  }
  const m = p.mark();
  p.eat();
  const r = cspScanType(p, PT_NORMAL) !== ST_NOT_TYPE && (p.k() === K_IdentifierToken || p.k() === K_InKeyword);
  p.reset(m);
  return r;
};

export const cspQueryExpression = (p: CsParser): i32 => {
  const save = p.inQuery;
  p.inQuery = true;
  const m = p.sp();
  p.push(cspFromClause(p));
  p.push(cspQueryBody(p));
  p.inQuery = save;
  return p.node(K_QueryExpression, m);
};

const cspQueryBody = (p: CsParser): i32 => {
  const m = p.sp();
  const lm = p.sp();
  while (!p.err && p.k() === K_IdentifierToken) {
    const ck = p.ck();
    if (ck === K_FromKeyword) {
      p.push(cspFromClause(p));
    } else if (ck === K_JoinKeyword) {
      p.push(cspJoinClause(p));
    } else if (ck === K_LetKeyword) {
      const cm = p.sp();
      p.push(p.eatContextual(K_LetKeyword));
      p.push(cspIdentifierToken(p));
      p.push(p.expect(K_EqualsToken));
      p.push(cspExpressionCore(p));
      p.push(p.node(K_LetClause, cm));
    } else if (ck === K_WhereKeyword) {
      const cm = p.sp();
      p.push(p.eatContextual(K_WhereKeyword));
      p.push(cspExpressionCore(p));
      p.push(p.node(K_WhereClause, cm));
    } else if (ck === K_OrderByKeyword) {
      p.push(cspOrderByClause(p));
    } else {
      break;
    }
  }
  p.push(p.list(lm));
  const ck = p.k() === K_IdentifierToken ? p.ck() : 0;
  if (ck === K_SelectKeyword) {
    const cm = p.sp();
    p.push(p.eatContextual(K_SelectKeyword));
    p.push(cspExpressionCore(p));
    p.push(p.node(K_SelectClause, cm));
  } else if (ck === K_GroupKeyword) {
    const cm = p.sp();
    p.push(p.eatContextual(K_GroupKeyword));
    p.push(cspExpressionCore(p));
    if (!(p.k() === K_IdentifierToken && p.ck() === K_ByKeyword)) {
      p.fail("by expected");
      return -1;
    }
    p.push(p.eatContextual(K_ByKeyword));
    p.push(cspExpressionCore(p));
    p.push(p.node(K_GroupClause, cm));
  } else {
    p.fail("select or group expected");
    return -1;
  }
  if (p.k() === K_IdentifierToken && p.ck() === K_IntoKeyword) {
    const cm = p.sp();
    p.push(p.eatContextual(K_IntoKeyword));
    p.push(cspIdentifierToken(p));
    p.push(cspQueryBody(p));
    p.push(p.node(K_QueryContinuation, cm));
  } else {
    p.push(-1);
  }
  return p.node(K_QueryBody, m);
};

const cspFromClause = (p: CsParser): i32 => {
  const m = p.sp();
  p.push(p.eatContextual(K_FromKeyword));
  p.push(p.kindAt(1) !== K_InKeyword ? cspType(p, PT_NORMAL) : -1);
  if (p.kindAt(1) === K_InKeyword && (p.k() !== K_IdentifierToken || cspIsQueryKeywordCk(p.ck()))) {
    p.fail("identifier expected in from");
    return -1;
  }
  p.push(cspIdentifierToken(p));
  p.push(p.expect(K_InKeyword));
  p.push(cspExpressionCore(p));
  return p.node(K_FromClause, m);
};

const cspJoinClause = (p: CsParser): i32 => {
  const m = p.sp();
  p.push(p.eatContextual(K_JoinKeyword));
  p.push(p.kindAt(1) !== K_InKeyword ? cspType(p, PT_NORMAL) : -1);
  p.push(cspIdentifierToken(p));
  p.push(p.expect(K_InKeyword));
  p.push(cspExpressionCore(p));
  p.push(p.eatContextual(K_OnKeyword));
  p.push(cspExpressionCore(p));
  p.push(p.eatContextual(K_EqualsKeyword));
  p.push(cspExpressionCore(p));
  if (p.k() === K_IdentifierToken && p.ck() === K_IntoKeyword) {
    const im = p.sp();
    p.push(p.eatContextual(K_IntoKeyword));
    p.push(cspIdentifierToken(p));
    p.push(p.node(K_JoinIntoClause, im));
  } else {
    p.push(-1);
  }
  return p.node(K_JoinClause, m);
};

const cspOrderByClause = (p: CsParser): i32 => {
  const m = p.sp();
  p.push(p.eatContextual(K_OrderByKeyword));
  const lm = p.sp();
  p.push(cspOrdering(p));
  while (p.k() === K_CommaToken && !p.err) {
    p.push(p.eat());
    p.push(cspOrdering(p));
  }
  p.push(p.list(lm));
  return p.node(K_OrderByClause, m);
};

const cspOrdering = (p: CsParser): i32 => {
  const m = p.sp();
  p.push(cspExpressionCore(p));
  let kind = K_AscendingOrdering;
  if (p.k() === K_IdentifierToken && (p.ck() === K_AscendingKeyword || p.ck() === K_DescendingKeyword)) {
    const ck = p.ck();
    p.push(p.eatContextual(ck));
    if (ck === K_DescendingKeyword) {
      kind = K_DescendingOrdering;
    }
  } else {
    p.push(-1);
  }
  return p.node(kind, m);
};

// ---- patterns ----

const cspIsExpression = (p: CsParser, left: i32, opTok: i32): i32 => {
  const node = cspTypeOrPatternForIsOperator(p);
  if (p.err) {
    return -1;
  }
  const m = p.sp();
  p.push(left);
  p.push(opTok);
  p.push(node);
  return p.node(cspIsPatternKind(p.nodeKind(node)) ? K_IsPatternExpression : K_IsExpression, m);
};

const cspTypeOrPatternForIsOperator = (p: CsParser): i32 => {
  const pat = cspPattern(p, PREC_RELATIONAL, true, false);
  if (p.err) {
    return -1;
  }
  const k = p.nodeKind(pat);
  if (k === K_ConstantPattern) {
    const t = cspConvertExpressionToType(p, p.t.s(pat, 0));
    if (t >= 0) {
      return t;
    }
    return pat;
  }
  if (k === K_TypePattern) {
    return p.t.s(pat, 0);
  }
  if (k === K_DiscardPattern) {
    const m = p.sp();
    p.push(p.t.s(pat, 0));
    return p.node(K_IdentifierName, m);
  }
  return pat;
};

const cspConvertExpressionToType = (p: CsParser, e: i32): i32 => {
  const k = p.nodeKind(e);
  if (k === K_IdentifierName || k === K_GenericName) {
    return e;
  }
  if (k === K_SimpleMemberAccessExpression && p.tokKind(p.t.s(e, 1)) === K_DotToken) {
    const left = cspConvertExpressionToType(p, p.t.s(e, 0));
    if (left < 0) {
      return -1;
    }
    const m = p.sp();
    p.push(left);
    p.push(p.t.s(e, 1));
    p.push(p.t.s(e, 2));
    return p.node(K_QualifiedName, m);
  }
  if (k === K_AliasQualifiedName) {
    return e;
  }
  return -1;
};

const cspPattern = (p: CsParser, precedence: i32, afterIs: boolean, inSwitchArmPattern: boolean): i32 => {
  let r = cspConjunctivePattern(p, precedence, afterIs, inSwitchArmPattern);
  while (!p.err && p.k() === K_IdentifierToken && p.ck() === K_OrKeyword) {
    const m = p.sp();
    p.push(r);
    p.push(p.eatContextual(K_OrKeyword));
    p.push(cspConjunctivePattern(p, precedence, afterIs, inSwitchArmPattern));
    r = p.node(K_OrPattern, m);
  }
  return r;
};

const cspConjunctivePattern = (p: CsParser, precedence: i32, afterIs: boolean, inSwitchArmPattern: boolean): i32 => {
  let r = cspNegatedPattern(p, precedence, afterIs, inSwitchArmPattern);
  while (!p.err && p.k() === K_IdentifierToken && p.ck() === K_AndKeyword) {
    const m = p.sp();
    p.push(r);
    p.push(p.eatContextual(K_AndKeyword));
    p.push(cspNegatedPattern(p, precedence, afterIs, inSwitchArmPattern));
    r = p.node(K_AndPattern, m);
  }
  return r;
};

const cspNegatedPattern = (p: CsParser, precedence: i32, afterIs: boolean, inSwitchArmPattern: boolean): i32 => {
  if (p.k() === K_IdentifierToken && p.ck() === K_NotKeyword) {
    const m = p.sp();
    p.push(p.eatContextual(K_NotKeyword));
    p.push(cspNegatedPattern(p, precedence, afterIs, inSwitchArmPattern));
    return p.node(K_NotPattern, m);
  }
  if (p.k() === K_EqualsEqualsToken || p.k() === K_ExclamationEqualsToken) {
    p.fail("equality operator in pattern");
    return -1;
  }
  return cspPrimaryPattern(p, precedence, afterIs, inSwitchArmPattern);
};

const cspLooksLikeTypeOfPattern = (p: CsParser): boolean => {
  const tk = p.k();
  if (csIsPredefinedType(tk)) {
    return true;
  }
  if (
    tk === K_IdentifierToken &&
    !p.t.tokIs(p.cur(), "_") &&
    (p.ck() !== K_NameOfKeyword || p.kindAt(1) !== K_OpenParenToken)
  ) {
    return true;
  }
  if (p.k() === K_OpenParenToken) {
    const m = p.mark();
    const r = cspScanType(p, PT_DEFINITE_PATTERN) !== ST_NOT_TYPE;
    p.reset(m);
    if (r) {
      return true;
    }
  }
  return cspIsFunctionPointerStart(p);
};

const cspPrimaryPattern = (p: CsParser, precedence: i32, afterIs: boolean, inSwitchArmPattern: boolean): i32 => {
  const tk = p.k();
  switch (tk) {
    case K_CommaToken:
    case K_SemicolonToken:
    case K_CloseBraceToken:
    case K_CloseParenToken:
    case K_CloseBracketToken:
    case K_EqualsGreaterThanToken:
      p.fail("missing pattern");
      return -1;
    default:
      break;
  }
  if (tk === K_IdentifierToken && p.t.tokIs(p.cur(), "_")) {
    const m = p.sp();
    p.push(p.eat());
    return p.node(K_DiscardPattern, m);
  }
  if (tk === K_OpenBracketToken) {
    return cspListPattern(p, inSwitchArmPattern);
  }
  if (tk === K_DotToken && cspIsAtDotDot(p)) {
    const m = p.sp();
    p.push(cspEatDotDot(p));
    p.push(cspIsPossibleSubpatternElement(p) ? cspPattern(p, precedence, false, inSwitchArmPattern) : -1);
    return p.node(K_SlicePattern, m);
  }
  if (
    tk === K_LessThanToken ||
    tk === K_LessThanEqualsToken ||
    tk === K_GreaterThanToken ||
    tk === K_GreaterThanEqualsToken ||
    tk === K_EqualsEqualsToken ||
    tk === K_ExclamationEqualsToken
  ) {
    const m = p.sp();
    p.push(p.eat());
    p.push(cspSubExpression(p, PREC_RELATIONAL));
    return p.node(K_RelationalPattern, m);
  }
  const rp = p.mark();
  let type = -1;
  if (cspLooksLikeTypeOfPattern(p)) {
    type = cspType(p, afterIs ? PT_AFTER_IS : PT_DEFINITE_PATTERN);
    if (p.err || !cspCanTokenFollowTypeInPattern(p, precedence)) {
      p.reset(rp);
      type = -1;
    }
  }
  const pat = cspPatternContinued(p, type, precedence, inSwitchArmPattern);
  if (pat >= 0 || p.err) {
    return pat;
  }
  p.reset(rp);
  const m = p.sp();
  p.push(cspSubExpression(p, precedence));
  return p.node(K_ConstantPattern, m);
};

const cspCanTokenFollowTypeInPattern = (p: CsParser, precedence: i32): boolean => {
  const k = p.k();
  switch (k) {
    case K_OpenParenToken:
    case K_OpenBraceToken:
    case K_IdentifierToken:
    case K_CloseBraceToken:
    case K_CloseBracketToken:
    case K_CloseParenToken:
    case K_CommaToken:
    case K_SemicolonToken:
      return true;
    case K_DotToken:
    case K_MinusGreaterThanToken:
    case K_ExclamationToken:
      return false;
    default: {
      const b = cspBinaryKind(k);
      return b === 0 || cspPrecedence(b) <= precedence;
    }
  }
};

const cspPatternContinued = (p: CsParser, type: i32, precedence: i32, inSwitchArmPattern: boolean): i32 => {
  if (type >= 0 && p.nodeKind(type) === K_IdentifierName) {
    const id = p.t.s(type, 0);
    if (p.t.tokIs(id, "var") && (p.k() === K_OpenParenToken || cspIsValidPatternDesignation(p, inSwitchArmPattern))) {
      p.convert(id, K_VarKeyword);
      const m = p.sp();
      p.push(id);
      p.push(cspDesignation(p, true));
      return p.node(K_VarPattern, m);
    }
  }
  if (p.k() === K_OpenParenToken && (type >= 0 || !cspLooksLikeCastForPattern(p, inSwitchArmPattern))) {
    const open = p.eat();
    const lm = p.sp();
    let n = 0;
    let firstSub = -1;
    if (p.k() !== K_CloseParenToken) {
      if (!(p.k() === K_CommaToken || cspIsPossibleSubpatternElement(p))) {
        p.fail("subpattern expected");
        return -1;
      }
      firstSub = cspSubpatternElement(p);
      p.push(firstSub);
      n++;
      while (p.k() === K_CommaToken && !p.err) {
        p.push(p.eat());
        p.push(cspSubpatternElement(p));
        if (n >= 2147483647) {
          fault();
          break;
        }
        n++;
      }
    }
    const subs = p.list(lm);
    const close = p.expect(K_CloseParenToken);
    const prop = cspPropertyPatternClauseOpt(p, inSwitchArmPattern);
    const des = cspTryParseSimpleDesignation(p, inSwitchArmPattern);
    if (p.err) {
      return -1;
    }
    if (type < 0 && prop < 0 && des < 0 && n === 1) {
      if (p.t.s(firstSub, 0) < 0) {
        const sub = p.t.s(firstSub, 1);
        if (p.nodeKind(sub) === K_ConstantPattern) {
          const em = p.sp();
          p.push(open);
          p.push(p.t.s(sub, 0));
          p.push(close);
          const pe = p.node(K_ParenthesizedExpression, em);
          const e = cspExpressionContinued(p, pe, precedence);
          const cm = p.sp();
          p.push(e);
          return p.node(K_ConstantPattern, cm);
        }
        const pm = p.sp();
        p.push(open);
        p.push(sub);
        p.push(close);
        return p.node(K_ParenthesizedPattern, pm);
      }
    }
    const cm = p.sp();
    p.push(open);
    p.push(subs);
    p.push(close);
    const pos = p.node(K_PositionalPatternClause, cm);
    const m = p.sp();
    p.push(type);
    p.push(pos);
    p.push(prop);
    p.push(des);
    return p.node(K_RecursivePattern, m);
  }
  const prop = cspPropertyPatternClauseOpt(p, inSwitchArmPattern);
  if (p.err) {
    return -1;
  }
  if (prop >= 0) {
    const des = cspTryParseSimpleDesignation(p, inSwitchArmPattern);
    const m = p.sp();
    p.push(type);
    p.push(-1);
    p.push(prop);
    p.push(des);
    return p.node(K_RecursivePattern, m);
  }
  if (type >= 0) {
    const des = cspTryParseSimpleDesignation(p, inSwitchArmPattern);
    if (des >= 0) {
      const m = p.sp();
      p.push(type);
      p.push(des);
      return p.node(K_DeclarationPattern, m);
    }
    const e = cspConvertTypeToExpression(p, type, false);
    if (e >= 0) {
      const m = p.sp();
      p.push(cspExpressionContinued(p, e, precedence));
      return p.node(K_ConstantPattern, m);
    }
    const m = p.sp();
    p.push(type);
    return p.node(K_TypePattern, m);
  }
  return -1;
};

const cspLooksLikeCastForPattern = (p: CsParser, inSwitchArmPattern: boolean): boolean => {
  const m = p.mark();
  const r = cspScanCast(p, true, inSwitchArmPattern);
  p.reset(m);
  return r;
};

const cspPropertyPatternClauseOpt = (p: CsParser, inSwitchArmPattern: boolean): i32 => {
  if (
    cspIsTrueIdentifier(p) &&
    cspIsValidPatternDesignation(p, inSwitchArmPattern) &&
    p.kindAt(1) === K_OpenBraceToken
  ) {
    p.fail("designator before property pattern");
    return -1;
  }
  if (p.k() !== K_OpenBraceToken) {
    return -1;
  }
  const m = p.sp();
  p.push(p.eat());
  const lm = p.sp();
  if (p.k() !== K_CloseBraceToken) {
    if (!(p.k() === K_CommaToken || cspIsPossibleSubpatternElement(p))) {
      p.fail("subpattern expected");
      return -1;
    }
    p.push(cspSubpatternElement(p));
    while (p.k() === K_CommaToken && !p.err) {
      p.push(p.eat());
      if (p.k() === K_CloseBraceToken) {
        break;
      }
      p.push(cspSubpatternElement(p));
    }
  }
  p.push(p.list(lm));
  p.push(p.expect(K_CloseBraceToken));
  return p.node(K_PropertyPatternClause, m);
};

const cspTryParseSimpleDesignation = (p: CsParser, inSwitchArmPattern: boolean): i32 =>
  cspIsTrueIdentifier(p) && cspIsValidPatternDesignation(p, inSwitchArmPattern) ? cspSimpleDesignation(p) : -1;

const cspIsValidPatternDesignation = (p: CsParser, inSwitchArmPattern: boolean): boolean => {
  if (p.k() !== K_IdentifierToken) {
    return false;
  }
  const ck = p.ck();
  if (ck === K_WhenKeyword) {
    return !inSwitchArmPattern;
  }
  if (ck === K_AndKeyword || ck === K_OrKeyword) {
    const tk = p.kindAt(1);
    switch (tk) {
      case K_CloseBraceToken:
      case K_CloseBracketToken:
      case K_CloseParenToken:
      case K_CommaToken:
      case K_SemicolonToken:
      case K_QuestionToken:
      case K_ColonToken:
        return true;
      case K_LessThanEqualsToken:
      case K_LessThanToken:
      case K_GreaterThanEqualsToken:
      case K_GreaterThanToken:
      case K_IdentifierToken:
      case K_OpenBraceToken:
      case K_OpenParenToken:
      case K_OpenBracketToken:
        return false;
      default: {
        if (cspBinaryKind(tk) !== 0) {
          return true;
        }
        const m = p.mark();
        p.eat();
        const r = !cspCanStartExpression(p);
        p.reset(m);
        return r;
      }
    }
  }
  return true;
};

export const cspExpressionOrPatternForSwitchStatement = (p: CsParser): i32 => {
  const pat = cspPattern(p, PREC_CONDITIONAL, false, true);
  if (p.err) {
    return -1;
  }
  return cspConvertPatternToExpressionIfPossible(p, pat, false);
};

const cspConvertPatternToExpressionIfPossible = (p: CsParser, pat: i32, permitTypeArguments: boolean): i32 => {
  const k = p.nodeKind(pat);
  if (k === K_ConstantPattern) {
    return p.t.s(pat, 0);
  }
  if (k === K_TypePattern) {
    const e = cspConvertTypeToExpression(p, p.t.s(pat, 0), permitTypeArguments);
    if (e >= 0) {
      return e;
    }
    return pat;
  }
  if (k === K_DiscardPattern) {
    const m = p.sp();
    p.push(p.t.s(pat, 0));
    return p.node(K_IdentifierName, m);
  }
  return pat;
};

const cspConvertTypeToExpression = (p: CsParser, type: i32, permitTypeArguments: boolean): i32 => {
  const k = p.nodeKind(type);
  if (k === K_GenericName) {
    return permitTypeArguments ? type : -1;
  }
  if (k === K_IdentifierName) {
    return type;
  }
  if (k === K_QualifiedName) {
    const right = p.t.s(type, 2);
    if (!permitTypeArguments && p.nodeKind(right) === K_GenericName) {
      return -1;
    }
    const left = p.t.s(type, 0);
    const le = cspConvertTypeToExpression(p, left, true);
    const m = p.sp();
    p.push(le >= 0 ? le : left);
    p.push(p.t.s(type, 1));
    p.push(right);
    return p.node(K_SimpleMemberAccessExpression, m);
  }
  return -1;
};

const cspSubpatternElement = (p: CsParser): i32 => {
  let pat = cspPattern(p, PREC_CONDITIONAL, false, false);
  let exprColon = -1;
  if (!p.err && p.k() === K_ColonToken) {
    const e = cspConvertPatternToExpressionIfPossible(p, pat, true);
    if (!cspIsPatternKind(p.nodeKind(e))) {
      const colon = p.eat();
      const cm = p.sp();
      p.push(e);
      p.push(colon);
      exprColon = p.node(p.nodeKind(e) === K_IdentifierName ? K_NameColon : K_ExpressionColon, cm);
      pat = cspPattern(p, PREC_CONDITIONAL, false, false);
    }
  }
  const m = p.sp();
  p.push(exprColon);
  p.push(pat);
  return p.node(K_Subpattern, m);
};

const cspIsPossibleSubpatternElement = (p: CsParser): boolean => {
  const k = p.k();
  return (
    cspCanStartExpression(p) ||
    k === K_OpenBraceToken ||
    k === K_OpenBracketToken ||
    k === K_LessThanToken ||
    k === K_LessThanEqualsToken ||
    k === K_GreaterThanToken ||
    k === K_GreaterThanEqualsToken
  );
};

const cspSwitchExpression = (p: CsParser, governing: i32, switchTok: i32): i32 => {
  const m = p.sp();
  p.push(governing);
  p.push(switchTok);
  p.push(p.expect(K_OpenBraceToken));
  const lm = p.sp();
  while (p.k() !== K_CloseBraceToken && !p.err) {
    if (p.k() === K_CaseKeyword) {
      p.fail("case in switch arm");
      return -1;
    }
    const am = p.sp();
    p.push(cspPattern(p, PREC_COALESCING, false, true));
    p.push(cspWhenClause(p, PREC_COALESCING));
    p.push(p.expect(K_EqualsGreaterThanToken));
    p.push(cspExpressionCore(p));
    p.push(p.node(K_SwitchExpressionArm, am));
    if (p.k() !== K_CloseBraceToken) {
      p.push(p.expect(K_CommaToken));
    }
  }
  p.push(p.list(lm));
  p.push(p.expect(K_CloseBraceToken));
  return p.node(K_SwitchExpression, m);
};

const cspListPattern = (p: CsParser, inSwitchArmPattern: boolean): i32 => {
  const m = p.sp();
  p.push(p.eat());
  const lm = p.sp();
  if (p.k() !== K_CloseBracketToken) {
    if (!(p.k() === K_CommaToken || cspIsPossibleSubpatternElement(p))) {
      p.fail("pattern expected");
      return -1;
    }
    p.push(cspPattern(p, PREC_CONDITIONAL, false, false));
    while (p.k() === K_CommaToken && !p.err) {
      p.push(p.eat());
      if (p.k() === K_CloseBracketToken) {
        break;
      }
      p.push(cspPattern(p, PREC_CONDITIONAL, false, false));
    }
  }
  p.push(p.list(lm));
  p.push(p.expect(K_CloseBracketToken));
  p.push(cspTryParseSimpleDesignation(p, inSwitchArmPattern));
  return p.node(K_ListPattern, m);
};

// ---- statement helpers ----

export const cspIsPossibleNewExpression = (p: CsParser): boolean => {
  const k1 = p.kindAt(1);
  if (k1 === K_OpenBraceToken || k1 === K_OpenBracketToken) {
    return true;
  }
  if (k1 === K_ClassKeyword || k1 === K_StructKeyword || k1 === K_InterfaceKeyword || k1 === K_EnumKeyword) {
    return false;
  }
  if (k1 === K_IdentifierToken && (p.ckAt(1) === K_RecordKeyword || p.ckAt(1) === K_UnionKeyword)) {
    // GetBaseTypeDeclarationKind covers keywords only
  }
  const mod = cspModifierKindE(p.kindAt(1), p.ckAt(1));
  if (mod === 100) {
    if (csIsPredefinedType(p.kindAt(2)) || cspIsTypeModifierOrTypeKeywordE(p.kindAt(2))) {
      return false;
    }
  } else if (mod !== 0) {
    return false;
  }
  const ti = cspIsPossibleTypedIdentifierStartAt(p, 1, true);
  if (ti >= 0) {
    return ti === 0;
  }
  const m = p.mark();
  p.eat();
  const st = cspScanType(p, PT_NORMAL);
  const r = !cspIsPossibleMemberNameE(p) || st === ST_NOT_TYPE;
  p.reset(m);
  return r;
};

const cspModifierKindE = (k: i32, ck: i32): i32 => cspModifierKind(k, ck);
const cspIsTypeModifierOrTypeKeywordE = (k: i32): boolean => cspIsTypeModifierOrTypeKeyword(k);
const cspIsPossibleMemberNameE = (p: CsParser): boolean => cspIsPossibleMemberName(p);

export const cspIsAnonymousDelegateExpression = (p: CsParser): boolean => {
  const k1 = p.kindAt(1);
  if (k1 === K_OpenBraceToken) {
    return true;
  }
  if (k1 !== K_OpenParenToken) {
    return false;
  }
  const m = p.mark();
  p.eat();
  p.eat();
  const st = cspScanTupleTypePublic(p);
  const r = !(st === ST_TUPLE_TYPE && p.k() === K_IdentifierToken);
  p.reset(m);
  return r;
};
