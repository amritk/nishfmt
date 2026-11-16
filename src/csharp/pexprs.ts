// CSharpier's node printers for expressions, patterns, types and queries,
// with the member chain printer (InvocationExpression.cs) and the binary
// expression printer.
//
// Ported from CSharpier 1.4.0 (MIT License, Copyright (c) 2021 Bela
// VanderVoort), CSharp/SyntaxPrinter/SyntaxNodePrinters/*.cs, over a tree
// shaped after Roslyn's syntax model (MIT License, Copyright the .NET
// Foundation and Contributors).

import {
  F_AliasQualifiedName_Alias,
  F_AliasQualifiedName_ColonColonToken,
  F_AliasQualifiedName_Name,
  F_AnonymousMethodExpression_Block,
  F_AnonymousMethodExpression_DelegateKeyword,
  F_AnonymousMethodExpression_Modifiers,
  F_AnonymousMethodExpression_ParameterList,
  F_AnonymousObjectCreationExpression_CloseBraceToken,
  F_AnonymousObjectCreationExpression_Initializers,
  F_AnonymousObjectCreationExpression_NewKeyword,
  F_AnonymousObjectCreationExpression_OpenBraceToken,
  F_AnonymousObjectMemberDeclarator_Expression,
  F_AnonymousObjectMemberDeclarator_NameEquals,
  F_ArgumentList_Arguments,
  F_ArgumentList_CloseParenToken,
  F_ArgumentList_OpenParenToken,
  F_Argument_Expression,
  F_Argument_NameColon,
  F_Argument_RefKindKeyword,
  F_ArrayCreationExpression_Initializer,
  F_ArrayCreationExpression_NewKeyword,
  F_ArrayCreationExpression_Type,
  F_ArrayRankSpecifier_CloseBracketToken,
  F_ArrayRankSpecifier_OpenBracketToken,
  F_ArrayRankSpecifier_Sizes,
  F_ArrayType_ElementType,
  F_ArrayType_RankSpecifiers,
  F_AssignmentExpression_Left,
  F_AssignmentExpression_OperatorToken,
  F_AssignmentExpression_Right,
  F_AwaitExpression_AwaitKeyword,
  F_AwaitExpression_Expression,
  F_BaseExpression_Token,
  F_BinaryExpression_Left,
  F_BinaryExpression_OperatorToken,
  F_BinaryExpression_Right,
  F_BinaryPattern_Left,
  F_BinaryPattern_OperatorToken,
  F_BinaryPattern_Right,
  F_Block_Statements,
  F_BracketedArgumentList_Arguments,
  F_BracketedArgumentList_CloseBracketToken,
  F_BracketedArgumentList_OpenBracketToken,
  F_CastExpression_CloseParenToken,
  F_CastExpression_Expression,
  F_CastExpression_OpenParenToken,
  F_CastExpression_Type,
  F_CheckedExpression_CloseParenToken,
  F_CheckedExpression_Expression,
  F_CheckedExpression_Keyword,
  F_CheckedExpression_OpenParenToken,
  F_CollectionExpression_CloseBracketToken,
  F_CollectionExpression_Elements,
  F_CollectionExpression_OpenBracketToken,
  F_ConditionalAccessExpression_Expression,
  F_ConditionalAccessExpression_WhenNotNull,
  F_ConditionalExpression_ColonToken,
  F_ConditionalExpression_Condition,
  F_ConditionalExpression_QuestionToken,
  F_ConditionalExpression_WhenFalse,
  F_ConditionalExpression_WhenTrue,
  F_ConstantPattern_Expression,
  F_DeclarationExpression_Designation,
  F_DeclarationExpression_Type,
  F_DeclarationPattern_Designation,
  F_DeclarationPattern_Type,
  F_DiscardDesignation_UnderscoreToken,
  F_DiscardPattern_UnderscoreToken,
  F_ElementAccessExpression_ArgumentList,
  F_ElementAccessExpression_Expression,
  F_ElementBindingExpression_ArgumentList,
  F_ExpressionElement_Expression,
  F_FromClause_Expression,
  F_FromClause_FromKeyword,
  F_FromClause_Identifier,
  F_FromClause_InKeyword,
  F_FromClause_Type,
  F_FunctionPointerCallingConvention_ManagedOrUnmanagedKeyword,
  F_FunctionPointerCallingConvention_UnmanagedCallingConventionList,
  F_FunctionPointerParameterList_GreaterThanToken,
  F_FunctionPointerParameterList_LessThanToken,
  F_FunctionPointerParameterList_Parameters,
  F_FunctionPointerParameter_AttributeLists,
  F_FunctionPointerParameter_Modifiers,
  F_FunctionPointerParameter_Type,
  F_FunctionPointerType_AsteriskToken,
  F_FunctionPointerType_CallingConvention,
  F_FunctionPointerType_DelegateKeyword,
  F_FunctionPointerType_ParameterList,
  F_FunctionPointerUnmanagedCallingConventionList_CallingConventions,
  F_FunctionPointerUnmanagedCallingConventionList_CloseBracketToken,
  F_FunctionPointerUnmanagedCallingConventionList_OpenBracketToken,
  F_FunctionPointerUnmanagedCallingConvention_Name,
  F_GenericName_Identifier,
  F_GenericName_TypeArgumentList,
  F_GroupClause_ByExpression,
  F_GroupClause_ByKeyword,
  F_GroupClause_GroupExpression,
  F_GroupClause_GroupKeyword,
  F_IdentifierName_Identifier,
  F_ImplicitArrayCreationExpression_CloseBracketToken,
  F_ImplicitArrayCreationExpression_Commas,
  F_ImplicitArrayCreationExpression_Initializer,
  F_ImplicitArrayCreationExpression_NewKeyword,
  F_ImplicitArrayCreationExpression_OpenBracketToken,
  F_ImplicitElementAccess_ArgumentList,
  F_ImplicitObjectCreationExpression_ArgumentList,
  F_ImplicitObjectCreationExpression_Initializer,
  F_ImplicitObjectCreationExpression_NewKeyword,
  F_ImplicitStackAllocArrayCreationExpression_CloseBracketToken,
  F_ImplicitStackAllocArrayCreationExpression_Initializer,
  F_ImplicitStackAllocArrayCreationExpression_OpenBracketToken,
  F_ImplicitStackAllocArrayCreationExpression_StackAllocKeyword,
  F_InitializerExpression_CloseBraceToken,
  F_InitializerExpression_Expressions,
  F_InitializerExpression_OpenBraceToken,
  F_InterpolatedStringExpression_Contents,
  F_InterpolatedStringExpression_StringEndToken,
  F_InterpolatedStringExpression_StringStartToken,
  F_InterpolatedStringText_TextToken,
  F_InterpolationAlignmentClause_CommaToken,
  F_InterpolationAlignmentClause_Value,
  F_InterpolationFormatClause_ColonToken,
  F_InterpolationFormatClause_FormatStringToken,
  F_Interpolation_AlignmentClause,
  F_Interpolation_CloseBraceToken,
  F_Interpolation_Expression,
  F_Interpolation_FormatClause,
  F_Interpolation_OpenBraceToken,
  F_InvocationExpression_Expression,
  F_IsPatternExpression_Expression,
  F_IsPatternExpression_IsKeyword,
  F_IsPatternExpression_Pattern,
  F_JoinClause_EqualsKeyword,
  F_JoinClause_Identifier,
  F_JoinClause_InExpression,
  F_JoinClause_InKeyword,
  F_JoinClause_Into,
  F_JoinClause_JoinKeyword,
  F_JoinClause_LeftExpression,
  F_JoinClause_OnKeyword,
  F_JoinClause_RightExpression,
  F_JoinClause_Type,
  F_JoinIntoClause_Identifier,
  F_JoinIntoClause_IntoKeyword,
  F_LetClause_EqualsToken,
  F_LetClause_Expression,
  F_LetClause_Identifier,
  F_LetClause_LetKeyword,
  F_ListPattern_CloseBracketToken,
  F_ListPattern_Designation,
  F_ListPattern_OpenBracketToken,
  F_ListPattern_Patterns,
  F_LiteralExpression_Token,
  F_MemberAccessExpression_Expression,
  F_MemberBindingExpression_Name,
  F_MemberBindingExpression_OperatorToken,
  F_NameEquals_EqualsToken,
  F_NameEquals_Name,
  F_NullableType_ElementType,
  F_NullableType_QuestionToken,
  F_ObjectCreationExpression_ArgumentList,
  F_ObjectCreationExpression_Initializer,
  F_ObjectCreationExpression_NewKeyword,
  F_ObjectCreationExpression_Type,
  F_OrderByClause_OrderByKeyword,
  F_OrderByClause_Orderings,
  F_Ordering_AscendingOrDescendingKeyword,
  F_Ordering_Expression,
  F_ParameterList_Parameters,
  F_ParenthesizedExpression_CloseParenToken,
  F_ParenthesizedExpression_Expression,
  F_ParenthesizedExpression_OpenParenToken,
  F_ParenthesizedLambdaExpression_ArrowToken,
  F_ParenthesizedLambdaExpression_AttributeLists,
  F_ParenthesizedLambdaExpression_Block,
  F_ParenthesizedLambdaExpression_ExpressionBody,
  F_ParenthesizedLambdaExpression_Modifiers,
  F_ParenthesizedLambdaExpression_ParameterList,
  F_ParenthesizedLambdaExpression_ReturnType,
  F_ParenthesizedPattern_CloseParenToken,
  F_ParenthesizedPattern_OpenParenToken,
  F_ParenthesizedPattern_Pattern,
  F_ParenthesizedVariableDesignation_CloseParenToken,
  F_ParenthesizedVariableDesignation_OpenParenToken,
  F_ParenthesizedVariableDesignation_Variables,
  F_PointerType_AsteriskToken,
  F_PointerType_ElementType,
  F_PositionalPatternClause_CloseParenToken,
  F_PositionalPatternClause_OpenParenToken,
  F_PositionalPatternClause_Subpatterns,
  F_PostfixUnaryExpression_Operand,
  F_PostfixUnaryExpression_OperatorToken,
  F_PredefinedType_Keyword,
  F_PrefixUnaryExpression_Operand,
  F_PrefixUnaryExpression_OperatorToken,
  F_PrimaryConstructorBaseType_ArgumentList,
  F_PrimaryConstructorBaseType_Type,
  F_PropertyPatternClause_CloseBraceToken,
  F_PropertyPatternClause_OpenBraceToken,
  F_PropertyPatternClause_Subpatterns,
  F_QualifiedName_DotToken,
  F_QualifiedName_Left,
  F_QualifiedName_Right,
  F_QueryBody_Clauses,
  F_QueryBody_Continuation,
  F_QueryBody_SelectOrGroup,
  F_QueryContinuation_Body,
  F_QueryContinuation_Identifier,
  F_QueryContinuation_IntoKeyword,
  F_QueryExpression_Body,
  F_QueryExpression_FromClause,
  F_RangeExpression_LeftOperand,
  F_RangeExpression_OperatorToken,
  F_RangeExpression_RightOperand,
  F_RecursivePattern_Designation,
  F_RecursivePattern_PositionalPatternClause,
  F_RecursivePattern_PropertyPatternClause,
  F_RecursivePattern_Type,
  F_RefExpression_Expression,
  F_RefExpression_RefKeyword,
  F_RefType_ReadOnlyKeyword,
  F_RefType_RefKeyword,
  F_RefType_Type,
  F_RefValueExpression_CloseParenToken,
  F_RefValueExpression_Comma,
  F_RefValueExpression_Expression,
  F_RefValueExpression_Keyword,
  F_RefValueExpression_OpenParenToken,
  F_RefValueExpression_Type,
  F_RelationalPattern_Expression,
  F_RelationalPattern_OperatorToken,
  F_SelectClause_Expression,
  F_SelectClause_SelectKeyword,
  F_SimpleLambdaExpression_ArrowToken,
  F_SimpleLambdaExpression_Block,
  F_SimpleLambdaExpression_ExpressionBody,
  F_SimpleLambdaExpression_Modifiers,
  F_SimpleLambdaExpression_Parameter,
  F_SingleVariableDesignation_Identifier,
  F_SlicePattern_DotDotToken,
  F_SlicePattern_Pattern,
  F_SpreadElement_Expression,
  F_SpreadElement_OperatorToken,
  F_StackAllocArrayCreationExpression_Initializer,
  F_StackAllocArrayCreationExpression_StackAllocKeyword,
  F_StackAllocArrayCreationExpression_Type,
  F_Subpattern_ExpressionColon,
  F_Subpattern_Pattern,
  F_SwitchExpressionArm_EqualsGreaterThanToken,
  F_SwitchExpressionArm_Expression,
  F_SwitchExpressionArm_Pattern,
  F_SwitchExpressionArm_WhenClause,
  F_SwitchExpression_Arms,
  F_SwitchExpression_CloseBraceToken,
  F_SwitchExpression_GoverningExpression,
  F_SwitchExpression_OpenBraceToken,
  F_SwitchExpression_SwitchKeyword,
  F_ThisExpression_Token,
  F_ThrowExpression_Expression,
  F_ThrowExpression_ThrowKeyword,
  F_TupleElement_Identifier,
  F_TupleElement_Type,
  F_TupleExpression_Arguments,
  F_TupleExpression_CloseParenToken,
  F_TupleExpression_OpenParenToken,
  F_TupleType_CloseParenToken,
  F_TupleType_Elements,
  F_TupleType_OpenParenToken,
  F_TypeArgumentList_Arguments,
  F_TypeArgumentList_GreaterThanToken,
  F_TypeArgumentList_LessThanToken,
  F_TypePattern_Type,
  F_UnaryPattern_OperatorToken,
  F_UnaryPattern_Pattern,
  F_VarPattern_Designation,
  F_VarPattern_VarKeyword,
  F_WhereClause_Condition,
  F_WhereClause_WhereKeyword,
  F_WithElement_ArgumentList,
  F_WithElement_WithKeyword,
  F_WithExpression_Expression,
  F_WithExpression_Initializer,
  F_WithExpression_WithKeyword,
  K_AmpersandAmpersandToken,
  K_AmpersandToken,
  K_AnonymousObjectCreationExpression,
  K_Argument,
  K_ArgumentList,
  K_ArrayInitializerExpression,
  K_ArrowExpressionClause,
  K_AsKeyword,
  K_AsteriskToken,
  K_AttributeArgument,
  K_AwaitExpression,
  K_BarBarToken,
  K_BarToken,
  K_CaretToken,
  K_CasePatternSwitchLabel,
  K_CastExpression,
  K_CoalesceExpression,
  K_CollectionExpression,
  K_CollectionInitializerExpression,
  K_ComplexElementInitializerExpression,
  K_ConditionalAccessExpression,
  K_ConditionalExpression,
  K_EqualsEqualsToken,
  K_EqualsValueClause,
  K_ExclamationEqualsToken,
  K_ExpressionElement,
  K_ExpressionStatement,
  K_GenericName,
  K_GreaterThanEqualsToken,
  K_GreaterThanGreaterThanGreaterThanToken,
  K_GreaterThanGreaterThanToken,
  K_GreaterThanToken,
  K_IdentifierName,
  K_IfStatement,
  K_InterpolatedMultiLineRawStringStartToken,
  K_InterpolatedStringText,
  K_Interpolation,
  K_InvocationExpression,
  K_IsKeyword,
  K_IsPatternExpression,
  K_LessThanEqualsToken,
  K_LessThanLessThanToken,
  K_LessThanToken,
  K_MinusToken,
  K_NameColon,
  K_ObjectInitializerExpression,
  K_OmittedArraySizeExpression,
  K_OmittedTypeArgument,
  K_ParenthesizedExpression,
  K_PercentToken,
  K_PlusToken,
  K_PredefinedType,
  K_QuestionQuestionToken,
  K_RecursivePattern,
  K_ReturnStatement,
  K_SlashToken,
  K_SuppressNullableWarningExpression,
  K_SwitchExpression,
  K_SwitchExpressionArm,
  K_ThisExpression,
  K_VariableDeclarator,
  K_WithInitializerExpression,
  Y_AliasQualifiedName,
  Y_AnonymousMethodExpression,
  Y_AnonymousObjectCreationExpression,
  Y_AnonymousObjectMemberDeclarator,
  Y_Argument,
  Y_ArgumentList,
  Y_ArrayCreationExpression,
  Y_ArrayRankSpecifier,
  Y_ArrayType,
  Y_ArrowExpressionClause,
  Y_AssignmentExpression,
  Y_AwaitExpression,
  Y_BaseExpression,
  Y_BinaryExpression,
  Y_BinaryPattern,
  Y_BracketedArgumentList,
  Y_CastExpression,
  Y_CatchFilterClause,
  Y_CheckedExpression,
  Y_CollectionExpression,
  Y_ConditionalAccessExpression,
  Y_ConditionalExpression,
  Y_ConstantPattern,
  Y_DeclarationExpression,
  Y_DeclarationPattern,
  Y_DefaultExpression,
  Y_DiscardDesignation,
  Y_DiscardPattern,
  Y_DoStatement,
  Y_ElementAccessExpression,
  Y_ElementBindingExpression,
  Y_EqualsValueClause,
  Y_ExpressionElement,
  Y_FromClause,
  Y_FunctionPointerType,
  Y_GenericName,
  Y_GroupClause,
  Y_IdentifierName,
  Y_ImplicitArrayCreationExpression,
  Y_ImplicitElementAccess,
  Y_ImplicitObjectCreationExpression,
  Y_ImplicitStackAllocArrayCreationExpression,
  Y_InitializerExpression,
  Y_InterpolatedStringExpression,
  Y_InterpolatedStringText,
  Y_Interpolation,
  Y_InvocationExpression,
  Y_IsPatternExpression,
  Y_JoinClause,
  Y_LambdaExpression,
  Y_LetClause,
  Y_ListPattern,
  Y_LiteralExpression,
  Y_MakeRefExpression,
  Y_MemberAccessExpression,
  Y_MemberBindingExpression,
  Y_NullableType,
  Y_ObjectCreationExpression,
  Y_OmittedArraySizeExpression,
  Y_OmittedTypeArgument,
  Y_OrderByClause,
  Y_ParenthesizedExpression,
  Y_ParenthesizedLambdaExpression,
  Y_ParenthesizedPattern,
  Y_ParenthesizedVariableDesignation,
  Y_PointerType,
  Y_PostfixUnaryExpression,
  Y_PredefinedType,
  Y_PrefixUnaryExpression,
  Y_PrimaryConstructorBaseType,
  Y_PropertyDeclaration,
  Y_QualifiedName,
  Y_QueryBody,
  Y_QueryContinuation,
  Y_QueryExpression,
  Y_RangeExpression,
  Y_RecursivePattern,
  Y_RefExpression,
  Y_RefType,
  Y_RefTypeExpression,
  Y_RefValueExpression,
  Y_RelationalPattern,
  Y_ReturnStatement,
  Y_SelectClause,
  Y_SimpleLambdaExpression,
  Y_SingleVariableDesignation,
  Y_SizeOfExpression,
  Y_SlicePattern,
  Y_SpreadElement,
  Y_StackAllocArrayCreationExpression,
  Y_Subpattern,
  Y_SwitchExpression,
  Y_SwitchStatement,
  Y_ThisExpression,
  Y_ThrowExpression,
  Y_TupleElement,
  Y_TupleExpression,
  Y_TupleType,
  Y_TypeArgumentList,
  Y_TypeOfExpression,
  Y_TypePattern,
  Y_UnaryPattern,
  Y_VarPattern,
  Y_WhereClause,
  Y_WhileStatement,
  Y_WithElement,
  Y_WithExpression,
  csTypeShape,
} from "./kinds";
import {
  DOC_BREAK_PARENT,
  DOC_HARDLINE,
  DOC_HARDLINE_NO_TRIM,
  DOC_LINE,
  DOC_LITERAL_LINE,
  DOC_NULL,
  DOC_SOFTLINE,
  DOC_SPACE,
  D_GROUP,
  D_INDENT,
  D_STRING,
  csdContainsBreak,
  csdRemoveInitialDoubleHardLine,
} from "./doc";
import {
  CsBuf,
  CsPrint,
  SL_ANON_MEMBER,
  SL_ARGUMENT,
  SL_ARM,
  SL_ATTRIBUTE,
  SL_ATTRIBUTE_ARG,
  SL_CALLING_CONVENTION,
  SL_FNPTR_PARAM,
  SL_NODE,
  SL_ORDERING,
  SL_POS_SUBPATTERN,
  SL_PROP_SUBPATTERN,
  cswAnyComment,
  cswAnyCommentOrDirective,
  cswArgumentListLike,
  cswAttributeLists,
  cswExtraNewLines,
  cswFindParent,
  cswJoinNodes,
  cswLeadA,
  cswLeadB,
  cswLeadingTrivia,
  cswLeadingTriviaTok,
  cswModifiers,
  cswModifiersSorted,
  cswRawIndentEnd,
  cswRawIndentStart,
  cswRawLinesExport,
  cswRawValue,
  cswRightHandSide,
  cswSepList,
  cswShouldIndentRawString,
  cswTok,
  cswTokNoLead,
  cswTokNoTrail,
  cswTokSfx,
  cswTrailingTriviaTok,
} from "./print";
import {
  cswAttribute,
  cswAttributeArgument,
  cswBaseExpressionColon,
  cswBlock,
  cswNode,
  cswParameterList,
  cswUnhandled,
} from "./pnodes";
import { cswMemberChain } from "./pchain";

/** The printers of the node types cswDispatch leaves to this module. */
export const cswExpressionNode = (P: CsPrint, n: i32, y: i32): i32 => {
  const D = P.D;
  switch (y) {
    case Y_IdentifierName:
      return cswTok(P, P.s(n, F_IdentifierName_Identifier));
    case Y_QualifiedName:
      return D.concat([cswNode(P, P.s(n, F_QualifiedName_Left)), cswTok(P, P.s(n, F_QualifiedName_DotToken)), cswNode(P, P.s(n, F_QualifiedName_Right))]);
    case Y_GenericName:
      return D.group([cswTok(P, P.s(n, F_GenericName_Identifier)), cswNode(P, P.s(n, F_GenericName_TypeArgumentList))]);
    case Y_TypeArgumentList:
      return cswTypeArgumentList(P, n);
    case Y_AliasQualifiedName:
      return D.concat([
        cswNode(P, P.s(n, F_AliasQualifiedName_Alias)),
        cswTok(P, P.s(n, F_AliasQualifiedName_ColonColonToken)),
        cswNode(P, P.s(n, F_AliasQualifiedName_Name)),
      ]);
    case Y_PredefinedType:
      return cswTok(P, P.s(n, F_PredefinedType_Keyword));
    case Y_ArrayType: {
      const et = cswNode(P, P.s(n, F_ArrayType_ElementType));
      const rs = P.s(n, F_ArrayType_RankSpecifiers);
      const parts: i32[] = [];
      for (let i = 0; i < P.count(rs); i++) {
        parts.push(cswNode(P, P.at(rs, i)));
      }
      return D.concat([et, D.concat(parts)]);
    }
    case Y_ArrayRankSpecifier:
      return cswArrayRankSpecifier(P, n);
    case Y_PointerType:
      return D.concat([cswNode(P, P.s(n, F_PointerType_ElementType)), cswTok(P, P.s(n, F_PointerType_AsteriskToken))]);
    case Y_FunctionPointerType:
      return cswFunctionPointerType(P, n);
    case Y_NullableType:
      return D.concat([cswNode(P, P.s(n, F_NullableType_ElementType)), cswTok(P, P.s(n, F_NullableType_QuestionToken))]);
    case Y_TupleType:
      return D.group([
        cswTok(P, P.s(n, F_TupleType_OpenParenToken)),
        D.indent([DOC_SOFTLINE, cswSepList(P, P.s(n, F_TupleType_Elements), SL_NODE, DOC_LINE, 0, -1)]),
        DOC_SOFTLINE,
        cswTok(P, P.s(n, F_TupleType_CloseParenToken)),
      ]);
    case Y_TupleElement: {
      const id = P.s(n, F_TupleElement_Identifier);
      return D.concat([cswNode(P, P.s(n, F_TupleElement_Type)), id >= 0 ? D.concat([DOC_SPACE, cswTok(P, id)]) : DOC_NULL]);
    }
    case Y_OmittedTypeArgument:
    case Y_OmittedArraySizeExpression:
      return DOC_NULL;
    case Y_RefType:
      return D.concat([
        cswTokSfx(P, P.s(n, F_RefType_RefKeyword), DOC_SPACE),
        cswTokSfx(P, P.s(n, F_RefType_ReadOnlyKeyword), DOC_SPACE),
        cswNode(P, P.s(n, F_RefType_Type)),
      ]);
    case Y_ParenthesizedExpression:
      return D.group([
        cswTok(P, P.s(n, F_ParenthesizedExpression_OpenParenToken)),
        D.indent([DOC_SOFTLINE, cswNode(P, P.s(n, F_ParenthesizedExpression_Expression))]),
        DOC_SOFTLINE,
        cswTok(P, P.s(n, F_ParenthesizedExpression_CloseParenToken)),
      ]);
    case Y_TupleExpression:
      return D.group1(
        cswArgumentListLike(P, P.s(n, F_TupleExpression_OpenParenToken), P.s(n, F_TupleExpression_Arguments), P.s(n, F_TupleExpression_CloseParenToken)),
      );
    case Y_PrefixUnaryExpression:
      return D.concat([cswTok(P, P.s(n, F_PrefixUnaryExpression_OperatorToken)), cswNode(P, P.s(n, F_PrefixUnaryExpression_Operand))]);
    case Y_AwaitExpression: {
      const e = P.s(n, F_AwaitExpression_Expression);
      const kw = cswTokSfx(P, P.s(n, F_AwaitExpression_AwaitKeyword), DOC_SPACE);
      return D.concat([kw, P.is(e, Y_QueryExpression) ? D.indent([DOC_LINE, cswNode(P, e)]) : cswNode(P, e)]);
    }
    case Y_PostfixUnaryExpression:
      if (P.k(n) === K_SuppressNullableWarningExpression && P.is(P.s(n, F_PostfixUnaryExpression_Operand), Y_InvocationExpression)) {
        return cswMemberChain(P, n);
      }
      return D.concat([cswNode(P, P.s(n, F_PostfixUnaryExpression_Operand)), cswTok(P, P.s(n, F_PostfixUnaryExpression_OperatorToken))]);
    case Y_MemberAccessExpression:
    case Y_ConditionalAccessExpression:
    case Y_InvocationExpression:
      return cswMemberChain(P, n);
    case Y_MemberBindingExpression:
      return D.concat([cswTok(P, P.s(n, F_MemberBindingExpression_OperatorToken)), cswNode(P, P.s(n, F_MemberBindingExpression_Name))]);
    case Y_ElementBindingExpression:
      return cswNode(P, P.s(n, F_ElementBindingExpression_ArgumentList));
    case Y_ImplicitElementAccess:
      return cswNode(P, P.s(n, F_ImplicitElementAccess_ArgumentList));
    case Y_RangeExpression: {
      const l = P.s(n, F_RangeExpression_LeftOperand);
      const r = P.s(n, F_RangeExpression_RightOperand);
      return D.concat([l >= 0 ? cswNode(P, l) : DOC_NULL, cswTok(P, P.s(n, F_RangeExpression_OperatorToken)), r >= 0 ? cswNode(P, r) : DOC_NULL]);
    }
    case Y_BinaryExpression:
      return cswBinaryExpression(P, n);
    case Y_AssignmentExpression:
      return cswAssignment(P, n);
    case Y_ConditionalExpression:
      if (!P.is(P.s(n, F_ConditionalExpression_WhenTrue), Y_ConditionalExpression) && P.is(P.s(n, F_ConditionalExpression_WhenFalse), Y_ConditionalExpression)) {
        return cswConditionalChained(P, n);
      }
      return cswConditionalRegular(P, n);
    case Y_ThisExpression:
      return cswTok(P, P.s(n, F_ThisExpression_Token));
    case Y_BaseExpression:
      return cswTok(P, P.s(n, F_BaseExpression_Token));
    case Y_LiteralExpression:
      return cswTok(P, P.s(n, F_LiteralExpression_Token));
    case Y_MakeRefExpression:
    case Y_RefTypeExpression:
      // Keyword OpenParenToken Expression CloseParenToken
      return D.concat([cswTok(P, P.s(n, 0)), cswTok(P, P.s(n, 1)), cswNode(P, P.s(n, 2)), cswTok(P, P.s(n, 3))]);
    case Y_RefValueExpression:
      return D.concat([
        cswTok(P, P.s(n, F_RefValueExpression_Keyword)),
        cswTok(P, P.s(n, F_RefValueExpression_OpenParenToken)),
        cswNode(P, P.s(n, F_RefValueExpression_Expression)),
        cswTokSfx(P, P.s(n, F_RefValueExpression_Comma), DOC_SPACE),
        cswNode(P, P.s(n, F_RefValueExpression_Type)),
        cswTok(P, P.s(n, F_RefValueExpression_CloseParenToken)),
      ]);
    case Y_CheckedExpression:
      return D.concat([
        cswTok(P, P.s(n, F_CheckedExpression_Keyword)),
        D.group([
          cswTok(P, P.s(n, F_CheckedExpression_OpenParenToken)),
          D.indent([DOC_SOFTLINE, cswNode(P, P.s(n, F_CheckedExpression_Expression))]),
          DOC_SOFTLINE,
          cswTok(P, P.s(n, F_CheckedExpression_CloseParenToken)),
        ]),
      ]);
    case Y_DefaultExpression:
    case Y_TypeOfExpression:
    case Y_SizeOfExpression:
      // Keyword OpenParenToken Type CloseParenToken
      return D.concat([cswTok(P, P.s(n, 0)), cswTok(P, P.s(n, 1)), cswNode(P, P.s(n, 2)), cswTok(P, P.s(n, 3))]);
    case Y_ElementAccessExpression:
      return D.concat([cswNode(P, P.s(n, F_ElementAccessExpression_Expression)), cswNode(P, P.s(n, F_ElementAccessExpression_ArgumentList))]);
    case Y_ArgumentList:
      return cswArgumentList(P, n);
    case Y_BracketedArgumentList:
      return cswBracketedArgumentList(P, n);
    case Y_Argument:
      return cswArgument(P, n);
    case Y_DeclarationExpression:
      return D.concat([cswNode(P, P.s(n, F_DeclarationExpression_Type)), DOC_SPACE, cswNode(P, P.s(n, F_DeclarationExpression_Designation))]);
    case Y_CastExpression:
      return cswCastExpression(P, n);
    case Y_AnonymousMethodExpression: {
      const docs: i32[] = [];
      docs.push(cswModifiers(P, P.s(n, F_AnonymousMethodExpression_Modifiers)));
      docs.push(cswTok(P, P.s(n, F_AnonymousMethodExpression_DelegateKeyword)));
      const pl = P.s(n, F_AnonymousMethodExpression_ParameterList);
      if (pl >= 0) {
        docs.push(cswParameterList(P, pl));
      }
      docs.push(cswBlock(P, P.s(n, F_AnonymousMethodExpression_Block)));
      return D.concat(docs);
    }
    case Y_SimpleLambdaExpression:
      return D.group([cswSimpleLambdaHead(P, n), cswSimpleLambdaBody(P, n)]);
    case Y_ParenthesizedLambdaExpression:
      return D.concat([cswParenLambdaHead(P, n), cswParenLambdaBody(P, n)]);
    case Y_RefExpression:
      return D.concat([cswTokSfx(P, P.s(n, F_RefExpression_RefKeyword), DOC_SPACE), cswNode(P, P.s(n, F_RefExpression_Expression))]);
    case Y_InitializerExpression:
      return cswInitializer(P, n);
    case Y_ObjectCreationExpression: {
      const al = P.s(n, F_ObjectCreationExpression_ArgumentList);
      return cswBreakParentIfNested(
        P,
        n,
        P.s(n, F_ObjectCreationExpression_Initializer),
        D.group([
          cswTokSfx(P, P.s(n, F_ObjectCreationExpression_NewKeyword), DOC_SPACE),
          cswNode(P, P.s(n, F_ObjectCreationExpression_Type)),
          al >= 0
            ? D.group1(cswArgumentListLike(P, P.s(al, F_ArgumentList_OpenParenToken), P.s(al, F_ArgumentList_Arguments), P.s(al, F_ArgumentList_CloseParenToken)))
            : DOC_NULL,
          cswInitializerOptionalWithLine(P, P.s(n, F_ObjectCreationExpression_Initializer)),
        ]),
      );
    }
    case Y_ImplicitObjectCreationExpression:
      return cswBreakParentIfNested(
        P,
        n,
        P.s(n, F_ImplicitObjectCreationExpression_Initializer),
        D.group([
          cswTok(P, P.s(n, F_ImplicitObjectCreationExpression_NewKeyword)),
          cswArgumentList(P, P.s(n, F_ImplicitObjectCreationExpression_ArgumentList)),
          cswInitializerOptionalWithLine(P, P.s(n, F_ImplicitObjectCreationExpression_Initializer)),
        ]),
      );
    case Y_WithExpression:
      return D.concat([
        cswNode(P, P.s(n, F_WithExpression_Expression)),
        DOC_SPACE,
        cswTokSfx(P, P.s(n, F_WithExpression_WithKeyword), DOC_LINE),
        cswNode(P, P.s(n, F_WithExpression_Initializer)),
      ]);
    case Y_AnonymousObjectMemberDeclarator:
      return cswAnonymousMember(P, n);
    case Y_AnonymousObjectCreationExpression:
      return cswAnonymousObjectCreation(P, n);
    case Y_ArrayCreationExpression:
      return D.group([
        cswTokSfx(P, P.s(n, F_ArrayCreationExpression_NewKeyword), DOC_SPACE),
        cswNode(P, P.s(n, F_ArrayCreationExpression_Type)),
        cswInitializerOptionalWithLine(P, P.s(n, F_ArrayCreationExpression_Initializer)),
      ]);
    case Y_ImplicitArrayCreationExpression: {
      const commas = P.s(n, F_ImplicitArrayCreationExpression_Commas);
      const cs: i32[] = [];
      for (let i = 0; i < P.count(commas); i++) {
        cs.push(cswTok(P, P.at(commas, i)));
      }
      return D.group([
        cswTok(P, P.s(n, F_ImplicitArrayCreationExpression_NewKeyword)),
        cswTok(P, P.s(n, F_ImplicitArrayCreationExpression_OpenBracketToken)),
        D.concat(cs),
        cswTok(P, P.s(n, F_ImplicitArrayCreationExpression_CloseBracketToken)),
        DOC_LINE,
        cswInitializer(P, P.s(n, F_ImplicitArrayCreationExpression_Initializer)),
      ]);
    }
    case Y_StackAllocArrayCreationExpression:
      return D.group([
        cswTokSfx(P, P.s(n, F_StackAllocArrayCreationExpression_StackAllocKeyword), DOC_SPACE),
        cswNode(P, P.s(n, F_StackAllocArrayCreationExpression_Type)),
        cswInitializerOptionalWithLine(P, P.s(n, F_StackAllocArrayCreationExpression_Initializer)),
      ]);
    case Y_ImplicitStackAllocArrayCreationExpression:
      return D.concat([
        cswTok(P, P.s(n, F_ImplicitStackAllocArrayCreationExpression_StackAllocKeyword)),
        cswTok(P, P.s(n, F_ImplicitStackAllocArrayCreationExpression_OpenBracketToken)),
        cswTokSfx(P, P.s(n, F_ImplicitStackAllocArrayCreationExpression_CloseBracketToken), DOC_SPACE),
        cswNode(P, P.s(n, F_ImplicitStackAllocArrayCreationExpression_Initializer)),
      ]);
    case Y_CollectionExpression:
      return cswCollectionExpression(P, n);
    case Y_ExpressionElement:
      return cswNode(P, P.s(n, F_ExpressionElement_Expression));
    case Y_SpreadElement:
      return D.group([cswTok(P, P.s(n, F_SpreadElement_OperatorToken)), DOC_SPACE, cswNode(P, P.s(n, F_SpreadElement_Expression))]);
    case Y_WithElement:
      return D.concat([cswTok(P, P.s(n, F_WithElement_WithKeyword)), cswArgumentList(P, P.s(n, F_WithElement_ArgumentList))]);
    case Y_QueryExpression:
      return cswQueryExpression(P, n);
    case Y_QueryBody:
      return cswQueryBody(P, n);
    case Y_FromClause:
      return cswFromClause(P, n);
    case Y_LetClause:
      return D.concat([
        cswExtraNewLines(P, n),
        cswTokSfx(P, P.s(n, F_LetClause_LetKeyword), DOC_SPACE),
        cswTokSfx(P, P.s(n, F_LetClause_Identifier), DOC_SPACE),
        cswTokSfx(P, P.s(n, F_LetClause_EqualsToken), DOC_SPACE),
        cswNode(P, P.s(n, F_LetClause_Expression)),
      ]);
    case Y_JoinClause:
      return cswJoinClause(P, n);
    case Y_WhereClause:
      return D.concat([
        cswExtraNewLines(P, n),
        D.group([cswTok(P, P.s(n, F_WhereClause_WhereKeyword)), D.indent([DOC_LINE, cswNode(P, P.s(n, F_WhereClause_Condition))])]),
      ]);
    case Y_OrderByClause:
      return D.concat([
        cswExtraNewLines(P, n),
        cswTok(P, P.s(n, F_OrderByClause_OrderByKeyword)),
        cswSepList(P, P.s(n, F_OrderByClause_Orderings), SL_ORDERING, DOC_NULL, 0, -1),
      ]);
    case Y_SelectClause:
      return D.concat([cswExtraNewLines(P, n), cswTokSfx(P, P.s(n, F_SelectClause_SelectKeyword), DOC_SPACE), cswNode(P, P.s(n, F_SelectClause_Expression))]);
    case Y_GroupClause:
      return D.concat([
        cswExtraNewLines(P, n),
        cswTokSfx(P, P.s(n, F_GroupClause_GroupKeyword), DOC_SPACE),
        cswNode(P, P.s(n, F_GroupClause_GroupExpression)),
        DOC_SPACE,
        cswTokSfx(P, P.s(n, F_GroupClause_ByKeyword), DOC_SPACE),
        cswNode(P, P.s(n, F_GroupClause_ByExpression)),
      ]);
    case Y_QueryContinuation:
      return cswQueryContinuation(P, n);
    case Y_InterpolatedStringExpression:
      return cswInterpolatedString(P, n);
    case Y_InterpolatedStringText:
      return cswTok(P, P.s(n, F_InterpolatedStringText_TextToken));
    case Y_Interpolation:
      return cswInterpolation(P, n);
    case Y_IsPatternExpression:
      return cswIsPattern(P, n);
    case Y_ThrowExpression:
      return D.concat([cswTokSfx(P, P.s(n, F_ThrowExpression_ThrowKeyword), DOC_SPACE), cswNode(P, P.s(n, F_ThrowExpression_Expression))]);
    case Y_DiscardPattern:
      return cswTok(P, P.s(n, F_DiscardPattern_UnderscoreToken));
    case Y_DiscardDesignation:
      return cswTok(P, P.s(n, F_DiscardDesignation_UnderscoreToken));
    case Y_SingleVariableDesignation:
      return cswTok(P, P.s(n, F_SingleVariableDesignation_Identifier));
    case Y_ParenthesizedVariableDesignation:
      return D.group([
        cswTok(P, P.s(n, F_ParenthesizedVariableDesignation_OpenParenToken)),
        D.indent([DOC_SOFTLINE, cswSepList(P, P.s(n, F_ParenthesizedVariableDesignation_Variables), SL_NODE, DOC_LINE, 0, -1)]),
        DOC_SOFTLINE,
        cswTok(P, P.s(n, F_ParenthesizedVariableDesignation_CloseParenToken)),
      ]);
    case Y_DeclarationPattern:
      return D.concat([cswNode(P, P.s(n, F_DeclarationPattern_Type)), DOC_SPACE, cswNode(P, P.s(n, F_DeclarationPattern_Designation))]);
    case Y_VarPattern:
      return D.concat([cswTokSfx(P, P.s(n, F_VarPattern_VarKeyword), DOC_SPACE), cswNode(P, P.s(n, F_VarPattern_Designation))]);
    case Y_RecursivePattern:
      return cswRecursivePattern(P, n, true);
    case Y_ConstantPattern:
      return cswNode(P, P.s(n, F_ConstantPattern_Expression));
    case Y_ParenthesizedPattern:
      return D.group([
        cswTok(P, P.s(n, F_ParenthesizedPattern_OpenParenToken)),
        D.indent([DOC_SOFTLINE, cswNode(P, P.s(n, F_ParenthesizedPattern_Pattern))]),
        DOC_SOFTLINE,
        cswTok(P, P.s(n, F_ParenthesizedPattern_CloseParenToken)),
      ]);
    case Y_RelationalPattern:
      return D.concat([cswTokSfx(P, P.s(n, F_RelationalPattern_OperatorToken), DOC_SPACE), cswNode(P, P.s(n, F_RelationalPattern_Expression))]);
    case Y_TypePattern:
      return cswNode(P, P.s(n, F_TypePattern_Type));
    case Y_BinaryPattern: {
      const p = P.par(n);
      return D.indentIf(
        P.is(p, Y_Subpattern) || P.is(p, Y_IsPatternExpression),
        D.concat([
          cswNode(P, P.s(n, F_BinaryPattern_Left)),
          DOC_LINE,
          cswTokSfx(P, P.s(n, F_BinaryPattern_OperatorToken), DOC_SPACE),
          cswNode(P, P.s(n, F_BinaryPattern_Right)),
        ]),
      );
    }
    case Y_UnaryPattern:
      return D.concat([cswTokSfx(P, P.s(n, F_UnaryPattern_OperatorToken), DOC_SPACE), cswNode(P, P.s(n, F_UnaryPattern_Pattern))]);
    case Y_ListPattern: {
      const des = P.s(n, F_ListPattern_Designation);
      const close = P.s(n, F_ListPattern_CloseBracketToken);
      return D.group([
        cswTok(P, P.s(n, F_ListPattern_OpenBracketToken)),
        D.indent([DOC_SOFTLINE, cswSepList(P, P.s(n, F_ListPattern_Patterns), SL_NODE, DOC_LINE, 0, close)]),
        DOC_SOFTLINE,
        cswTok(P, close),
        des >= 0 ? DOC_SPACE : DOC_NULL,
        cswNode(P, des),
      ]);
    }
    case Y_SlicePattern: {
      const pat = P.s(n, F_SlicePattern_Pattern);
      if (pat < 0) {
        return cswTok(P, P.s(n, F_SlicePattern_DotDotToken));
      }
      return D.concat([cswTok(P, P.s(n, F_SlicePattern_DotDotToken)), DOC_SPACE, cswNode(P, pat)]);
    }
    case Y_SwitchExpression:
      return cswSwitchExpression(P, n);
    case Y_PrimaryConstructorBaseType:
      return D.concat([cswNode(P, P.s(n, F_PrimaryConstructorBaseType_Type)), cswArgumentList(P, P.s(n, F_PrimaryConstructorBaseType_ArgumentList))]);
    default:
      return cswUnhandled(P, n);
  }
};

/** The separated list items beyond the ones print.ts knows. */
export const cswSlItemMore = (P: CsPrint, item: i32, n: i32): i32 => {
  const D = P.D;
  switch (item) {
    case SL_ATTRIBUTE:
      return cswAttribute(P, n);
    case SL_ATTRIBUTE_ARG:
      return cswAttributeArgument(P, n);
    case SL_ANON_MEMBER:
      return cswAnonymousMember(P, n);
    case SL_ARM:
      return cswSwitchArm(P, n);
    case SL_POS_SUBPATTERN: {
      const ec = P.s(n, F_Subpattern_ExpressionColon);
      return D.concat([P.k(ec) === K_NameColon ? cswBaseExpressionColon(P, ec) : DOC_NULL, cswNode(P, P.s(n, F_Subpattern_Pattern))]);
    }
    case SL_PROP_SUBPATTERN: {
      const ec = P.s(n, F_Subpattern_ExpressionColon);
      return D.group([ec >= 0 ? cswNode(P, ec) : DOC_NULL, cswNode(P, P.s(n, F_Subpattern_Pattern))]);
    }
    case SL_FNPTR_PARAM:
      return D.concat([
        cswAttributeLists(P, n, P.s(n, F_FunctionPointerParameter_AttributeLists)),
        cswModifiers(P, P.s(n, F_FunctionPointerParameter_Modifiers)),
        cswNode(P, P.s(n, F_FunctionPointerParameter_Type)),
      ]);
    case SL_CALLING_CONVENTION:
      return cswTok(P, P.s(n, F_FunctionPointerUnmanagedCallingConvention_Name));
    case SL_ORDERING: {
      const kw = P.s(n, F_Ordering_AscendingOrDescendingKeyword);
      return D.concat([DOC_SPACE, cswNode(P, P.s(n, F_Ordering_Expression)), kw < 0 ? DOC_NULL : DOC_SPACE, cswTok(P, kw)]);
    }
    default:
      P.fail("unknown list item");
      return DOC_NULL;
  }
};

// ---- names and types ----

const cswTypeArgumentList = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const args = P.s(n, F_TypeArgumentList_Arguments);
  const na = P.scount(args);
  const firstOmitted = na > 0 && P.k(P.sel(args, 0)) === K_OmittedTypeArgument;
  let anyGeneric = false;
  for (let i = 0; i < na; i++) {
    if (P.k(P.sel(args, i)) === K_GenericName) {
      anyGeneric = true;
    }
  }
  const sep = !firstOmitted && (na > 1 || anyGeneric) ? DOC_SOFTLINE : DOC_NULL;
  return D.concat([
    cswTok(P, P.s(n, F_TypeArgumentList_LessThanToken)),
    D.indentIf(sep !== DOC_NULL, D.concat([sep, cswSepList(P, args, SL_NODE, firstOmitted ? DOC_NULL : DOC_LINE, 0, -1)])),
    sep,
    cswTok(P, P.s(n, F_TypeArgumentList_GreaterThanToken)),
  ]);
};

const cswArrayRankSpecifier = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const sizes = P.s(n, F_ArrayRankSpecifier_Sizes);
  const ns = P.scount(sizes);
  let allOmitted = true;
  for (let i = 0; i < ns; i++) {
    if (P.k(P.sel(sizes, i)) !== K_OmittedArraySizeExpression) {
      allOmitted = false;
    }
  }
  const open = P.s(n, F_ArrayRankSpecifier_OpenBracketToken);
  const close = P.s(n, F_ArrayRankSpecifier_CloseBracketToken);
  if (allOmitted) {
    return D.concat([cswTok(P, open), cswSepList(P, sizes, SL_NODE, DOC_NULL, 0, -1), cswTok(P, close)]);
  }
  return D.group([
    cswTok(P, open),
    ns > 0 ? D.concat([D.indent([DOC_SOFTLINE, cswSepList(P, sizes, SL_NODE, DOC_LINE, 0, -1)]), DOC_SOFTLINE]) : DOC_NULL,
    cswTok(P, close),
  ]);
};

const cswFunctionPointerType = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const cc = P.s(n, F_FunctionPointerType_CallingConvention);
  const pl = P.s(n, F_FunctionPointerType_ParameterList);
  const del = cswTok(P, P.s(n, F_FunctionPointerType_DelegateKeyword));
  const ast = cswTokSfx(P, P.s(n, F_FunctionPointerType_AsteriskToken), DOC_SPACE);
  let ccDoc = DOC_NULL;
  if (cc >= 0) {
    const ul = P.s(cc, F_FunctionPointerCallingConvention_UnmanagedCallingConventionList);
    const kw = cswTok(P, P.s(cc, F_FunctionPointerCallingConvention_ManagedOrUnmanagedKeyword));
    ccDoc = D.concat([
      kw,
      ul >= 0
        ? D.concat([
            cswTok(P, P.s(ul, F_FunctionPointerUnmanagedCallingConventionList_OpenBracketToken)),
            cswSepList(P, P.s(ul, F_FunctionPointerUnmanagedCallingConventionList_CallingConventions), SL_CALLING_CONVENTION, DOC_SPACE, 0, -1),
            cswTok(P, P.s(ul, F_FunctionPointerUnmanagedCallingConventionList_CloseBracketToken)),
          ])
        : DOC_NULL,
    ]);
  }
  return D.concat([
    del,
    ast,
    ccDoc,
    cswTok(P, P.s(pl, F_FunctionPointerParameterList_LessThanToken)),
    D.indent1(D.group([DOC_SOFTLINE, cswSepList(P, P.s(pl, F_FunctionPointerParameterList_Parameters), SL_FNPTR_PARAM, DOC_LINE, 0, -1)])),
    cswTok(P, P.s(pl, F_FunctionPointerParameterList_GreaterThanToken)),
  ]);
};

// ---- arguments ----

export const cswArgumentList = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const p = P.par(n);
  let indent = false;
  if (P.is(p, Y_InvocationExpression)) {
    const e = P.s(p, F_InvocationExpression_Expression);
    let exprOk = P.k(e) === K_IdentifierName || P.k(e) === K_GenericName;
    if (!exprOk && P.is(e, Y_MemberAccessExpression)) {
      const ee = P.s(e, F_MemberAccessExpression_Expression);
      exprOk = P.k(ee) === K_ThisExpression || P.k(ee) === K_PredefinedType || (P.k(ee) === K_IdentifierName && cswIdentLen(P, ee) <= 4);
    }
    if (exprOk) {
      const pp = P.par(p);
      indent = P.is(P.par(pp), Y_InvocationExpression) || (P.is(pp, Y_PostfixUnaryExpression) && P.is(P.par(P.par(pp)), Y_InvocationExpression));
    }
  }
  return D.group1(
    D.indentIf(indent, cswArgumentListLike(P, P.s(n, F_ArgumentList_OpenParenToken), P.s(n, F_ArgumentList_Arguments), P.s(n, F_ArgumentList_CloseParenToken))),
  );
};

/** The UTF-16 length of an identifier name's identifier. */
export const cswIdentLen = (P: CsPrint, n: i32): i32 => {
  const t = P.s(n, F_IdentifierName_Identifier);
  const a = P.lx.start[t];
  const b = P.lx.end[t];
  let len = 0;
  for (let i = a; i < b; i++) {
    const c = toI32(P.src[i]);
    if ((c & 0xc0) !== 0x80) {
      len += c >= 0xf0 ? 2 : 1;
    }
  }
  return len;
};

export const cswBracketedArgumentList = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  return D.group([
    cswTok(P, P.s(n, F_BracketedArgumentList_OpenBracketToken)),
    D.indent([DOC_SOFTLINE, cswSepList(P, P.s(n, F_BracketedArgumentList_Arguments), SL_NODE, DOC_LINE, 0, -1)]),
    DOC_SOFTLINE,
    cswTok(P, P.s(n, F_BracketedArgumentList_CloseBracketToken)),
  ]);
};

export const cswArgument = (P: CsPrint, n: i32): i32 => {
  const mods = cswArgumentModifiers(P, n);
  if (mods === DOC_NULL) {
    return cswNode(P, P.s(n, F_Argument_Expression));
  }
  return P.cc([mods, cswNode(P, P.s(n, F_Argument_Expression))]);
};

export const cswArgumentModifiers = (P: CsPrint, n: i32): i32 => {
  const rk = P.s(n, F_Argument_RefKindKeyword);
  const nc = P.s(n, F_Argument_NameColon);
  if (nc < 0) {
    return rk >= 0 ? cswTokSfx(P, rk, DOC_SPACE) : DOC_NULL;
  }
  const ncDoc = cswBaseExpressionColon(P, nc);
  return rk >= 0 ? P.cc([ncDoc, cswTokSfx(P, rk, DOC_SPACE)]) : ncDoc;
};

// ---- lambdas ----

export const cswSimpleLambdaHead = (P: CsPrint, n: i32): i32 =>
  P.cc([
    cswModifiersSorted(P, P.s(n, F_SimpleLambdaExpression_Modifiers)),
    cswNode(P, P.s(n, F_SimpleLambdaExpression_Parameter)),
    DOC_SPACE,
    cswTok(P, P.s(n, F_SimpleLambdaExpression_ArrowToken)),
  ]);

export const cswSimpleLambdaBody = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const block = P.s(n, F_SimpleLambdaExpression_Block);
  if (block >= 0) {
    return cswBlock(P, block);
  }
  const body = P.s(n, F_SimpleLambdaExpression_ExpressionBody);
  if (P.is(body, Y_ObjectCreationExpression) || P.is(body, Y_AnonymousObjectCreationExpression)) {
    return D.group([DOC_SPACE, cswNode(P, body)]);
  }
  return D.indent([DOC_LINE, cswNode(P, body)]);
};

export const cswParenLambdaHead = (P: CsPrint, n: i32): i32 => {
  const rt = P.s(n, F_ParenthesizedLambdaExpression_ReturnType);
  return P.cc([
    cswAttributeLists(P, n, P.s(n, F_ParenthesizedLambdaExpression_AttributeLists)),
    cswModifiersSorted(P, P.s(n, F_ParenthesizedLambdaExpression_Modifiers)),
    rt >= 0 ? P.cc([cswNode(P, rt), DOC_SPACE]) : DOC_NULL,
    cswParameterList(P, P.s(n, F_ParenthesizedLambdaExpression_ParameterList)),
    DOC_SPACE,
    cswTok(P, P.s(n, F_ParenthesizedLambdaExpression_ArrowToken)),
  ]);
};

export const cswParenLambdaBody = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const block = P.s(n, F_ParenthesizedLambdaExpression_Block);
  if (block >= 0) {
    return D.concat([P.count(P.s(block, F_Block_Statements)) > 0 ? DOC_HARDLINE : DOC_SPACE, cswBlock(P, block)]);
  }
  const body = cswNode(P, P.s(n, F_ParenthesizedLambdaExpression_ExpressionBody));
  const params = P.s(P.s(n, F_ParenthesizedLambdaExpression_ParameterList), F_ParameterList_Parameters);
  const pp = P.par(P.par(n));
  if (P.scount(params) === 0 && P.k(pp) === K_ArgumentList && P.scount(P.s(pp, F_ArgumentList_Arguments)) === 1) {
    return D.ifBreak(D.indent([DOC_LINE, body]), D.group1(D.indent([DOC_LINE, body])), -1);
  }
  return D.group1(D.indent([DOC_LINE, body]));
};

// ---- binary expressions ----

const cswBinaryExpression = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const docs = cswBinaryParts(P, n);
  const p = P.par(n);
  if (P.k(p) === K_IfStatement) {
    return D.concat(docs);
  }
  const shouldNotIndent =
    P.is(p, Y_ArrowExpressionClause) ||
    P.is(p, Y_AssignmentExpression) ||
    P.is(p, Y_CatchFilterClause) ||
    P.is(p, Y_CheckedExpression) ||
    P.is(p, Y_DoStatement) ||
    P.is(p, Y_EqualsValueClause) ||
    P.is(p, Y_ParenthesizedExpression) ||
    P.is(p, Y_ParenthesizedLambdaExpression) ||
    P.is(p, Y_SimpleLambdaExpression) ||
    P.is(p, Y_SwitchExpression) ||
    P.is(p, Y_SwitchStatement) ||
    P.is(p, Y_WhereClause) ||
    P.is(p, Y_WhileStatement) ||
    (P.is(p, Y_ReturnStatement) && !cswIsCoalesceWithNonBinaryLeft(P, n)) ||
    (P.is(p, Y_ConditionalExpression) && P.s(p, F_ConditionalExpression_WhenTrue) !== n && P.s(p, F_ConditionalExpression_WhenFalse) !== n);
  if (shouldNotIndent) {
    return D.group(docs);
  }
  const rest: i32[] = [];
  for (let i = 1; i < toI32(docs.length); i++) {
    rest.push(docs[i]);
  }
  return D.group([docs[0], D.indent(rest)]);
};

export const cswIsCoalesceWithNonBinaryLeft = (P: CsPrint, n: i32): boolean =>
  P.k(n) === K_CoalesceExpression && !P.is(P.s(n, F_BinaryExpression_Left), Y_BinaryExpression) && !cswAnyComment(P.lx, cswLeadA(P, n), cswLeadB(P, n));

const cswPrecedence = (k: i32): i32 => {
  switch (k) {
    case K_QuestionQuestionToken:
      return 1;
    case K_BarBarToken:
      return 2;
    case K_AmpersandAmpersandToken:
      return 3;
    case K_BarToken:
      return 4;
    case K_CaretToken:
      return 5;
    case K_AmpersandToken:
      return 6;
    case K_ExclamationEqualsToken:
      return 7;
    case K_EqualsEqualsToken:
      return 8;
    case K_LessThanToken:
    case K_LessThanEqualsToken:
    case K_GreaterThanToken:
    case K_GreaterThanEqualsToken:
    case K_IsKeyword:
    case K_AsKeyword:
      return 9;
    case K_LessThanLessThanToken:
    case K_GreaterThanGreaterThanToken:
    case K_GreaterThanGreaterThanGreaterThanToken:
      return 10;
    case K_MinusToken:
    case K_PlusToken:
      return 11;
    case K_AsteriskToken:
    case K_SlashToken:
    case K_PercentToken:
      return 12;
    default:
      return -2;
  }
};

const cswNodePrecedence = (P: CsPrint, n: i32): i32 =>
  P.is(n, Y_BinaryExpression) ? cswPrecedence(P.tk(P.s(n, F_BinaryExpression_OperatorToken))) : -1;

/** BinaryExpression.PrintParts. */
export const cswBinaryParts = (P: CsPrint, n: i32): i32[] => {
  const D = P.D;
  if (!P.is(n, Y_BinaryExpression)) {
    return [D.group1(cswNode(P, n))];
  }
  if (P.depth > 200) {
    P.fail("We can't handle this deep of recursion yet.");
    return [DOC_NULL];
  }
  P.depth = P.depth + 1;
  const docs: i32[] = [];
  const left = P.s(n, F_BinaryExpression_Left);
  const right = P.s(n, F_BinaryExpression_Right);
  const op = P.s(n, F_BinaryExpression_OperatorToken);
  const p = P.par(n);
  const isCoalesce = P.k(n) === K_CoalesceExpression;
  const shouldGroup =
    (!isCoalesce || cswShouldGroupNullCoalescing(P, n)) &&
    P.k(n) !== P.k(p) &&
    cswNodePrecedence(P, n) !== cswNodePrecedence(P, p) &&
    !P.is(left, Y_BinaryExpression) &&
    !P.is(right, Y_BinaryExpression) &&
    P.k(left) !== K_IsPatternExpression;
  if (isCoalesce) {
    docs.push(cswNode(P, left));
    docs.push(DOC_LINE);
    docs.push(cswTok(P, op));
    docs.push(DOC_SPACE);
  }
  const possible = isCoalesce ? right : left;
  if (P.is(possible, Y_BinaryExpression) && cswPrecedence(P.tk(op)) === cswPrecedence(P.tk(P.s(possible, F_BinaryExpression_OperatorToken)))) {
    const sub = cswBinaryParts(P, possible);
    for (let i = 0; i < toI32(sub.length); i++) {
      docs.push(sub[i]);
    }
  } else {
    docs.push(cswNode(P, possible));
  }
  if (isCoalesce) {
    P.depth = P.depth - 1;
    if (shouldGroup) {
      const rest: i32[] = [];
      for (let i = 1; i < toI32(docs.length); i++) {
        rest.push(docs[i]);
      }
      return [docs[0], D.group(rest)];
    }
    return docs;
  }
  const r = D.concat([DOC_LINE, cswTok(P, op), DOC_SPACE, cswNode(P, right)]);
  docs.push(shouldGroup ? D.group1(r) : r);
  P.depth = P.depth - 1;
  return docs;
};

const cswShouldGroupNullCoalescing = (P: CsPrint, n: i32): boolean => {
  if (P.k(n) !== K_CoalesceExpression) {
    return false;
  }
  const left = P.s(n, F_BinaryExpression_Left);
  return (
    cswIsTerminalInvocation(P, left) ||
    P.k(left) === K_ParenthesizedExpression ||
    (P.k(left) === K_CastExpression && P.k(P.s(left, F_CastExpression_Expression)) === K_ParenthesizedExpression) ||
    P.k(left) === K_SwitchExpression
  );
};

const cswIsTerminalInvocation = (P: CsPrint, e: i32): boolean => {
  if (P.k(e) === K_InvocationExpression) {
    return !cswHasInvocationExcludingLeftmostParenthesized(P, P.s(e, F_InvocationExpression_Expression));
  }
  if (P.k(e) === K_ConditionalAccessExpression) {
    return (
      cswIsTerminalInvocationInWhenNotNull(P, P.s(e, F_ConditionalAccessExpression_WhenNotNull)) &&
      !cswHasInvocationExcludingLeftmostParenthesized(P, P.s(e, F_ConditionalAccessExpression_Expression))
    );
  }
  if (P.k(e) === K_AwaitExpression) {
    return cswIsTerminalInvocation(P, P.s(e, F_AwaitExpression_Expression));
  }
  return false;
};

const cswRightmost = (P: CsPrint, e: i32): i32 => {
  if (P.k(e) === K_InvocationExpression) {
    return e;
  }
  if (P.k(e) === K_ConditionalAccessExpression) {
    return cswRightmost(P, P.s(e, F_ConditionalAccessExpression_WhenNotNull));
  }
  if (P.is(e, Y_MemberAccessExpression)) {
    return cswRightmost(P, P.s(e, F_MemberAccessExpression_Expression));
  }
  return e;
};

const cswLeftmost = (P: CsPrint, e: i32): i32 => {
  if (P.is(e, Y_MemberAccessExpression)) {
    return cswLeftmost(P, P.s(e, F_MemberAccessExpression_Expression));
  }
  if (P.k(e) === K_InvocationExpression) {
    return cswLeftmost(P, P.s(e, F_InvocationExpression_Expression));
  }
  if (P.k(e) === K_ConditionalAccessExpression) {
    return cswLeftmost(P, P.s(e, F_ConditionalAccessExpression_Expression));
  }
  if (P.k(e) === K_AwaitExpression) {
    return cswLeftmost(P, P.s(e, F_AwaitExpression_Expression));
  }
  return e;
};

const cswIsTerminalInvocationInWhenNotNull = (P: CsPrint, w: i32): boolean => {
  const rightmost = cswRightmost(P, w);
  if (P.k(rightmost) !== K_InvocationExpression) {
    return false;
  }
  return !cswAnyDescendant(P, w, rightmost, -1, false);
};

const cswHasInvocationExcludingLeftmostParenthesized = (P: CsPrint, e: i32): boolean => {
  const lm = cswLeftmost(P, e);
  const excluded = P.k(lm) === K_ParenthesizedExpression ? lm : -1;
  return cswAnyDescendant(P, e, -1, excluded, true);
};

/**
 * Whether node n or a node under it is an invocation (or, with `orConditional`, a
 * conditional access) other than `skip`, not descending into `excluded`.
 */
const cswAnyDescendant = (P: CsPrint, n: i32, skip: i32, excluded: i32, orConditional: boolean): boolean => {
  if (n < 0) {
    return false;
  }
  const k = P.k(n);
  if (n !== skip && n !== excluded && (k === K_InvocationExpression || (orConditional && k === K_ConditionalAccessExpression))) {
    return true;
  }
  if (n === excluded) {
    return false;
  }
  const shape = csTypeShape(P.t.ty(n));
  const ns = P.t.nslot[n];
  for (let i = 0; i < ns; i++) {
    const v = P.s(n, i);
    if (v < 0) {
      continue;
    }
    const c = shape.charCodeAt(i) | 32;
    if (c === 110) {
      if (cswAnyDescendant(P, v, skip, excluded, orConditional)) {
        return true;
      }
    } else if (c === 108 || c === 115) {
      const len = P.count(v);
      for (let j = 0; j < len; j++) {
        if (c === 115 && (j & 1) === 1) {
          continue;
        }
        if (cswAnyDescendant(P, P.at(v, j), skip, excluded, orConditional)) {
          return true;
        }
      }
    }
  }
  return false;
};

const cswAssignment = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  let newLines = DOC_NULL;
  const p = P.par(n);
  if (P.is(p, Y_InitializerExpression) && P.sel(P.s(p, F_InitializerExpression_Expressions), 0) !== n) {
    newLines = cswExtraNewLines(P, n);
  }
  return cswRightHandSide(
    P,
    n,
    D.concat([newLines, cswNode(P, P.s(n, F_AssignmentExpression_Left)), DOC_SPACE]),
    cswTok(P, P.s(n, F_AssignmentExpression_OperatorToken)),
    P.s(n, F_AssignmentExpression_Right),
  );
};

// ---- conditional and cast ----

const cswConditionalRegular = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const wt = P.s(n, F_ConditionalExpression_WhenTrue);
  const wf = P.s(n, F_ConditionalExpression_WhenFalse);
  const whenTrue = P.k(wt) === K_ConditionalExpression ? cswConditionalRegular(P, wt) : cswNode(P, wt);
  const whenFalse = P.k(wf) === K_ConditionalExpression ? cswConditionalRegular(P, wf) : cswNode(P, wf);
  const inner = [
    DOC_LINE,
    cswTokSfx(P, P.s(n, F_ConditionalExpression_QuestionToken), DOC_SPACE),
    whenTrue,
    DOC_LINE,
    cswTokSfx(P, P.s(n, F_ConditionalExpression_ColonToken), DOC_SPACE),
    whenFalse,
  ];
  const p = P.par(n);
  const parentIsConditional = P.k(p) === K_ConditionalExpression;
  const cond = P.s(n, F_ConditionalExpression_Condition);
  let condDoc = DOC_NULL;
  if (P.k(p) === K_ReturnStatement && (P.is(cond, Y_BinaryExpression) || P.k(cond) === K_IsPatternExpression)) {
    condDoc = D.indent1(D.group([D.ifBreak(DOC_SOFTLINE, DOC_NULL, -1), cswNode(P, cond)]));
  } else {
    condDoc = cswNode(P, cond);
  }
  const outer = [parentIsConditional ? DOC_BREAK_PARENT : DOC_NULL, condDoc, D.indent(inner)];
  return parentIsConditional ? D.concat(outer) : D.group(outer);
};

const cswConditionalChained = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const wt = P.s(n, F_ConditionalExpression_WhenTrue);
  const wf = P.s(n, F_ConditionalExpression_WhenFalse);
  const whenTrue = P.k(wt) === K_ConditionalExpression ? cswConditionalChained(P, wt) : cswNode(P, wt);
  const whenFalse = P.k(wf) === K_ConditionalExpression ? cswConditionalChained(P, wf) : cswNode(P, wf);
  const p = P.par(n);
  const contents = D.group([
    P.k(p) === K_ConditionalExpression ? DOC_BREAK_PARENT : DOC_NULL,
    D.group([
      cswNode(P, P.s(n, F_ConditionalExpression_Condition)),
      D.indent([DOC_LINE, cswTokSfx(P, P.s(n, F_ConditionalExpression_QuestionToken), DOC_SPACE), D.indentIf(P.k(wt) === K_ConditionalExpression, whenTrue)]),
    ]),
    DOC_LINE,
    D.group([cswTokSfx(P, P.s(n, F_ConditionalExpression_ColonToken), DOC_SPACE), whenFalse]),
  ]);
  if (P.k(p) === K_ReturnStatement || (P.k(p) === K_Argument && P.k(P.par(p)) === K_ArgumentList && P.scount(P.s(P.par(p), F_ArgumentList_Arguments)) > 1)) {
    return D.indent1(contents);
  }
  return contents;
};

const cswCastExpression = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const e = P.s(n, F_CastExpression_Expression);
  const type = P.s(n, F_CastExpression_Type);
  const simple =
    P.k(e) === K_ParenthesizedExpression ||
    ((P.k(e) === K_IdentifierName || (P.k(e) === K_InvocationExpression && P.k(P.s(e, F_InvocationExpression_Expression)) === K_IdentifierName)) &&
      P.k(type) !== K_GenericName);
  const open = cswTok(P, P.s(n, F_CastExpression_OpenParenToken));
  const td = cswNode(P, type);
  const close = cswTok(P, P.s(n, F_CastExpression_CloseParenToken));
  if (simple) {
    return D.concat([open, td, close, cswNode(P, e)]);
  }
  return D.group([open, td, close, D.indent([DOC_SOFTLINE, cswNode(P, e)])]);
};

// ---- creation and initializers ----

const cswBreakParentIfNested = (P: CsPrint, n: i32, initializer: i32, doc: i32): i32 => {
  let pi = -1;
  const p = P.par(n);
  if (P.k(p) !== -1 && P.is(p, Y_InitializerExpression)) {
    pi = p;
  } else if (P.is(P.par(p), Y_InitializerExpression)) {
    pi = P.par(p);
  }
  if (
    pi >= 0 &&
    initializer >= 0 &&
    (P.scount(P.s(initializer, F_InitializerExpression_Expressions)) > 1 || P.scount(P.s(pi, F_InitializerExpression_Expressions)) > 1)
  ) {
    return P.D.concat([doc, DOC_BREAK_PARENT]);
  }
  return doc;
};

const cswInitializerOptionalWithLine = (P: CsPrint, n: i32): i32 => (n >= 0 ? P.D.concat([DOC_LINE, cswInitializer(P, n)]) : DOC_NULL);

export const cswInitializer = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const p = P.par(n);
  const sep = P.is(p, Y_AssignmentExpression) || (P.is(p, Y_EqualsValueClause) && !P.is(P.par(p), Y_PropertyDeclaration)) ? DOC_LINE : DOC_NULL;
  const exprs = P.s(n, F_InitializerExpression_Expressions);
  const ne = P.scount(exprs);
  const k = P.k(n);
  const firstKind = ne > 0 ? P.k(P.sel(exprs, 0)) : -1;
  const alwaysBreak =
    (ne >= 3 && (k === K_ObjectInitializerExpression || (k === K_CollectionInitializerExpression && firstKind === K_ComplexElementInitializerExpression))) ||
    (k === K_ArrayInitializerExpression && firstKind === K_ArrayInitializerExpression);
  const close = P.s(n, F_InitializerExpression_CloseBraceToken);
  const lineDoc = alwaysBreak ? DOC_HARDLINE : DOC_LINE;
  const open = cswTok(P, P.s(n, F_InitializerExpression_OpenBraceToken));
  const body =
    ne === 0
      ? DOC_SPACE
      : D.concat([D.indent([lineDoc, cswSepList(P, exprs, SL_NODE, lineDoc, 0, k !== K_ComplexElementInitializerExpression ? close : -1)]), lineDoc]);
  const result = D.concat([sep, open, body, cswTok(P, close)]);
  const pk = P.t.ty(p);
  if (
    pk !== Y_ObjectCreationExpression &&
    pk !== Y_ArrayCreationExpression &&
    pk !== Y_StackAllocArrayCreationExpression &&
    pk !== Y_ImplicitArrayCreationExpression &&
    pk !== Y_ImplicitObjectCreationExpression &&
    k !== K_WithInitializerExpression
  ) {
    return D.group1(result);
  }
  return result;
};

const cswCollectionExpression = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const p = P.par(n);
  let nullSep = false;
  if (P.k(p) === K_Argument && P.s(p, F_Argument_NameColon) < 0) {
    nullSep = true;
  } else if (
    P.k(p) === K_AttributeArgument ||
    P.k(p) === K_ArrowExpressionClause ||
    P.k(p) === K_CastExpression ||
    P.k(p) === K_ExpressionElement ||
    P.is(p, Y_InitializerExpression) ||
    P.is(p, Y_LambdaExpression)
  ) {
    nullSep = true;
  } else if (P.is(p, Y_AssignmentExpression)) {
    const pp = P.par(p);
    nullSep = !(P.is(pp, Y_ObjectCreationExpression) || P.is(pp, Y_InitializerExpression) || P.k(pp) === K_ExpressionStatement);
  } else if (P.k(p) === K_EqualsValueClause) {
    nullSep = P.k(P.par(p)) !== K_VariableDeclarator;
  }
  const sep = nullSep ? DOC_NULL : D.ifBreak(DOC_LINE, DOC_NULL, -1);
  const elems = P.s(n, F_CollectionExpression_Elements);
  const ne = P.scount(elems);
  let alwaysBreak = false;
  if (ne > 0) {
    const e0 = P.sel(elems, 0);
    alwaysBreak = P.k(e0) === K_ExpressionElement && P.k(P.s(e0, F_ExpressionElement_Expression)) === K_CollectionExpression;
  }
  const close = P.s(n, F_CollectionExpression_CloseBracketToken);
  const lx = P.lx;
  const open = cswTok(P, P.s(n, F_CollectionExpression_OpenBracketToken));
  const items =
    ne > 0
      ? D.indent([alwaysBreak ? DOC_HARDLINE : D.ifBreak(DOC_LINE, DOC_NULL, -1), cswSepList(P, elems, SL_NODE, alwaysBreak ? DOC_HARDLINE : DOC_LINE, 0, close)])
      : DOC_NULL;
  const after = ne > 0 ? (alwaysBreak ? DOC_HARDLINE : D.ifBreak(DOC_LINE, DOC_NULL, -1)) : DOC_NULL;
  const closeLead = cswAnyCommentOrDirective(lx, lx.l0[close], lx.l1[close]) ? D.concat([D.indent1(cswLeadingTriviaTok(P, close)), DOC_HARDLINE]) : DOC_NULL;
  const result = D.concat([sep, open, items, after, closeLead, cswTokNoLead(P, close)]);
  return D.group1(result);
};

const cswAnonymousMember = (P: CsPrint, n: i32): i32 => {
  const docs: i32[] = [];
  const p = P.par(n);
  if (P.k(p) === K_AnonymousObjectCreationExpression && P.sel(P.s(p, F_AnonymousObjectCreationExpression_Initializers), 0) !== n) {
    docs.push(cswExtraNewLines(P, n));
  }
  const ne = P.s(n, F_AnonymousObjectMemberDeclarator_NameEquals);
  if (ne >= 0) {
    docs.push(cswTokSfx(P, P.s(P.s(ne, F_NameEquals_Name), F_IdentifierName_Identifier), DOC_SPACE));
    docs.push(cswTokSfx(P, P.s(ne, F_NameEquals_EqualsToken), DOC_SPACE));
  }
  docs.push(cswNode(P, P.s(n, F_AnonymousObjectMemberDeclarator_Expression)));
  return P.cc(docs);
};

const cswAnonymousObjectCreation = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const inits = P.s(n, F_AnonymousObjectCreationExpression_Initializers);
  const ni = P.scount(inits);
  const alwaysBreak = ni >= 3;
  const close = P.s(n, F_AnonymousObjectCreationExpression_CloseBraceToken);
  const nw = cswTokSfx(P, P.s(n, F_AnonymousObjectCreationExpression_NewKeyword), DOC_LINE);
  const open = cswTok(P, P.s(n, F_AnonymousObjectCreationExpression_OpenBraceToken));
  return D.group([
    nw,
    open,
    ni > 0 ? D.indent([alwaysBreak ? DOC_HARDLINE : DOC_LINE, cswSepList(P, inits, SL_ANON_MEMBER, DOC_LINE, 0, close)]) : DOC_NULL,
    DOC_LINE,
    cswTok(P, close),
  ]);
};

// ---- queries ----

const cswFromClause = (P: CsPrint, n: i32): i32 => {
  const type = P.s(n, F_FromClause_Type);
  return P.cc([
    cswTokSfx(P, P.s(n, F_FromClause_FromKeyword), DOC_SPACE),
    type >= 0 ? P.cc([cswNode(P, type), DOC_SPACE]) : DOC_NULL,
    cswTokSfx(P, P.s(n, F_FromClause_Identifier), DOC_SPACE),
    cswTokSfx(P, P.s(n, F_FromClause_InKeyword), DOC_SPACE),
    cswNode(P, P.s(n, F_FromClause_Expression)),
  ]);
};

const cswQueryExpression = (P: CsPrint, n: i32): i32 =>
  P.cc([cswFromClause(P, P.s(n, F_QueryExpression_FromClause)), DOC_LINE, cswQueryBody(P, P.s(n, F_QueryExpression_Body))]);

const cswQueryBody = (P: CsPrint, n: i32): i32 => {
  const docs: i32[] = [];
  const clauses = P.s(n, F_QueryBody_Clauses);
  docs.push(cswJoinNodes(P, DOC_LINE, clauses));
  if (P.count(clauses) > 0) {
    docs.push(DOC_LINE);
  }
  docs.push(cswNode(P, P.s(n, F_QueryBody_SelectOrGroup)));
  const cont = P.s(n, F_QueryBody_Continuation);
  if (cont >= 0) {
    docs.push(DOC_SPACE);
    docs.push(cswQueryContinuation(P, cont));
  }
  return P.cc(docs);
};

const cswQueryContinuation = (P: CsPrint, n: i32): i32 =>
  P.cc([
    cswTokSfx(P, P.s(n, F_QueryContinuation_IntoKeyword), DOC_SPACE),
    cswTokSfx(P, P.s(n, F_QueryContinuation_Identifier), DOC_LINE),
    cswQueryBody(P, P.s(n, F_QueryContinuation_Body)),
  ]);

const cswJoinClause = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const type = P.s(n, F_JoinClause_Type);
  const into = P.s(n, F_JoinClause_Into);
  return D.concat([
    cswExtraNewLines(P, n),
    D.group([
      cswTokSfx(P, P.s(n, F_JoinClause_JoinKeyword), DOC_SPACE),
      type >= 0 ? D.concat([cswNode(P, type), DOC_SPACE]) : DOC_NULL,
      cswTokSfx(P, P.s(n, F_JoinClause_Identifier), DOC_SPACE),
      cswTokSfx(P, P.s(n, F_JoinClause_InKeyword), DOC_SPACE),
      cswNode(P, P.s(n, F_JoinClause_InExpression)),
      D.indent([
        DOC_LINE,
        cswTokSfx(P, P.s(n, F_JoinClause_OnKeyword), DOC_SPACE),
        cswNode(P, P.s(n, F_JoinClause_LeftExpression)),
        DOC_SPACE,
        cswTokSfx(P, P.s(n, F_JoinClause_EqualsKeyword), DOC_SPACE),
        cswNode(P, P.s(n, F_JoinClause_RightExpression)),
        into >= 0 ? D.concat([DOC_LINE, cswTokSfx(P, P.s(into, F_JoinIntoClause_IntoKeyword), DOC_SPACE), cswTok(P, P.s(into, F_JoinIntoClause_Identifier))]) : DOC_NULL,
      ]),
    ]),
  ]);
};

// ---- interpolated strings ----

const cswInterpolatedString = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const contents = P.s(n, F_InterpolatedStringExpression_Contents);
  const nc = P.count(contents);
  const src = P.src;
  for (let i = 0; i < nc; i++) {
    const c = P.at(contents, i);
    if (P.k(c) === K_Interpolation) {
      const a = P.t.spanStart(c);
      const b = P.t.spanEnd(c);
      for (let j = a; j < b; j++) {
        if (toI32(src[j]) === 10) {
          return D.concat([cswLeadingTrivia(P, cswLeadA(P, n), cswLeadB(P, n), false, false), D.strSrc(P.t.spanStart(n), P.t.spanEnd(n))]);
        }
      }
    }
  }
  const start = P.s(n, F_InterpolatedStringExpression_StringStartToken);
  const end = P.s(n, F_InterpolatedStringExpression_StringEndToken);
  if (P.tk(start) === K_InterpolatedMultiLineRawStringStartToken) {
    return cswRawInterpolatedString(P, n, start, contents, end);
  }
  const docs: i32[] = [cswTokNoLead(P, start)];
  for (let i = 0; i < nc; i++) {
    docs.push(cswNode(P, P.at(contents, i)));
  }
  docs.push(cswTokNoTrail(P, end));
  return D.concat([cswLeadingTriviaTok(P, start), D.forceFlat(docs), cswTrailingTriviaTok(P, end)]);
};

const cswRawInterpolatedString = (P: CsPrint, n: i32, start: i32, contents: i32, end: i32): i32 => {
  const D = P.D;
  const lx = P.lx;
  const src = P.src;
  const ea = lx.start[end];
  const eb = lx.end[end];
  let fc = ea;
  while (fc < eb && (toI32(src[fc]) === 13 || toI32(src[fc]) === 10)) {
    fc++;
  }
  const indented = fc < eb && (toI32(src[fc]) === 9 || toI32(src[fc]) === 32);
  const out: i32[] = [cswTok(P, start), indented ? DOC_HARDLINE_NO_TRIM : DOC_LITERAL_LINE];
  const ia = cswRawIndentStart(src, ea, eb);
  const ib = cswRawIndentEnd(src, ia, eb);
  const nc = P.count(contents);
  for (let i = 0; i < nc; i++) {
    const c = P.at(contents, i);
    if (P.k(c) === K_Interpolation) {
      out.push(cswInterpolation(P, c));
    } else if (P.k(c) === K_InterpolatedStringText) {
      const t = P.s(c, F_InterpolatedStringText_TextToken);
      const buf = new CsBuf(lx.end[t] - lx.start[t] + 16);
      cswRawValue(P, buf, lx.start[t], lx.end[t], ia, ib, i === 0);
      if (buf.n === 0) {
        continue;
      }
      cswRawLinesExport(P, out, buf, indented, false);
    }
  }
  const lastDoc = out[toI32(out.length) - 1];
  const lastEmpty = D.kind[lastDoc] === D_STRING && D.textLen(lastDoc) === 0;
  out.push(indented ? (lastEmpty ? DOC_HARDLINE : DOC_HARDLINE_NO_TRIM) : DOC_LITERAL_LINE);
  out.push(cswTok(P, end));
  return D.indentIf(cswShouldIndentRawString(P, cswFindParent(P, n, Y_Argument)), D.concat(out));
};

const cswInterpolation = (P: CsPrint, n: i32): i32 => {
  const docs: i32[] = [];
  docs.push(cswTok(P, P.s(n, F_Interpolation_OpenBraceToken)));
  docs.push(cswNode(P, P.s(n, F_Interpolation_Expression)));
  const al = P.s(n, F_Interpolation_AlignmentClause);
  if (al >= 0) {
    docs.push(cswTokSfx(P, P.s(al, F_InterpolationAlignmentClause_CommaToken), DOC_SPACE));
    docs.push(cswNode(P, P.s(al, F_InterpolationAlignmentClause_Value)));
  }
  const fc = P.s(n, F_Interpolation_FormatClause);
  if (fc >= 0) {
    docs.push(cswTok(P, P.s(fc, F_InterpolationFormatClause_ColonToken)));
    docs.push(cswTok(P, P.s(fc, F_InterpolationFormatClause_FormatStringToken)));
  }
  docs.push(cswTok(P, P.s(n, F_Interpolation_CloseBraceToken)));
  return P.cc(docs);
};

// ---- patterns ----

const cswIsPattern = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const p = P.par(n);
  const e = P.s(n, F_IsPatternExpression_Expression);
  const isK = P.s(n, F_IsPatternExpression_IsKeyword);
  const pat = P.s(n, F_IsPatternExpression_Pattern);
  if (!(P.k(p) === K_IfStatement || P.k(p) === K_ParenthesizedExpression || P.k(p) === K_EqualsValueClause)) {
    return D.group([cswNode(P, e), D.indent([DOC_LINE, cswTok(P, isK), DOC_SPACE, cswNode(P, pat)])]);
  }
  if (P.k(pat) !== K_RecursivePattern) {
    return D.group([cswNode(P, e), DOC_LINE, cswTok(P, isK), DOC_SPACE, cswNode(P, pat)]);
  }
  const type = P.s(pat, F_RecursivePattern_Type);
  if (type < 0) {
    return D.group([cswNode(P, e), DOC_SPACE, cswTok(P, isK), DOC_LINE, cswRecursivePattern(P, pat, true)]);
  }
  return D.group([D.group([cswNode(P, e), DOC_LINE, cswTok(P, isK), DOC_SPACE, cswNode(P, type)]), cswRecursivePattern(P, pat, false)]);
};

const cswRecursivePattern = (P: CsPrint, n: i32, includeType: boolean): i32 => {
  const D = P.D;
  const docs: i32[] = [];
  const type = P.s(n, F_RecursivePattern_Type);
  if (type >= 0 && includeType) {
    docs.push(cswNode(P, type));
  }
  const pos = P.s(n, F_RecursivePattern_PositionalPatternClause);
  if (pos >= 0) {
    const p = P.par(n);
    const pk = P.k(p);
    const noLine =
      pk === K_SwitchExpressionArm ||
      pk === K_IsPatternExpression ||
      pk === K_CasePatternSwitchLabel ||
      (P.is(p, Y_BinaryPattern) && (P.k(P.par(p)) === K_SwitchExpressionArm || P.k(P.par(p)) === K_CasePatternSwitchLabel));
    docs.push(noLine ? DOC_NULL : DOC_SOFTLINE);
    docs.push(
      D.group([
        cswTok(P, P.s(pos, F_PositionalPatternClause_OpenParenToken)),
        D.indent([DOC_SOFTLINE, cswSepList(P, P.s(pos, F_PositionalPatternClause_Subpatterns), SL_POS_SUBPATTERN, DOC_LINE, 0, -1)]),
        DOC_SOFTLINE,
        cswTok(P, P.s(pos, F_PositionalPatternClause_CloseParenToken)),
      ]),
    );
  }
  const prop = P.s(n, F_RecursivePattern_PropertyPatternClause);
  if (prop >= 0) {
    const open = P.s(prop, F_PropertyPatternClause_OpenBraceToken);
    const lx = P.lx;
    const subs = P.s(prop, F_PropertyPatternClause_Subpatterns);
    docs.push(
      D.group([
        type >= 0 && !cswAnyCommentOrDirective(lx, lx.l0[open], lx.l1[open]) ? DOC_LINE : DOC_NULL,
        cswTok(P, open),
        D.indent([P.scount(subs) > 0 ? DOC_LINE : DOC_NULL, cswSepList(P, subs, SL_PROP_SUBPATTERN, DOC_LINE, 0, -1)]),
        DOC_LINE,
        cswTok(P, P.s(prop, F_PropertyPatternClause_CloseBraceToken)),
      ]),
    );
  }
  const des = P.s(n, F_RecursivePattern_Designation);
  if (des >= 0) {
    docs.push(DOC_SPACE);
    docs.push(cswNode(P, des));
  }
  return D.concat(docs);
};

// ---- switch expressions ----

const cswSwitchExpression = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const close = P.s(n, F_SwitchExpression_CloseBraceToken);
  const sections = D.group([D.indent([DOC_HARDLINE, cswSepList(P, P.s(n, F_SwitchExpression_Arms), SL_ARM, DOC_HARDLINE, 0, close)]), DOC_HARDLINE]);
  csdRemoveInitialDoubleHardLine(D, sections);
  return D.concat([
    cswNode(P, P.s(n, F_SwitchExpression_GoverningExpression)),
    DOC_SPACE,
    cswTok(P, P.s(n, F_SwitchExpression_SwitchKeyword)),
    DOC_HARDLINE,
    cswTok(P, P.s(n, F_SwitchExpression_OpenBraceToken)),
    sections,
    cswTok(P, close),
  ]);
};

const cswSwitchArm = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const arrow = P.s(n, F_SwitchExpressionArm_EqualsGreaterThanToken);
  const lx = P.lx;
  const arrowHasComment = cswAnyComment(lx, lx.l0[arrow], lx.l1[arrow]);
  const gid2 = arrowHasComment ? -1 : D.newGroupId();
  const expr = P.s(n, F_SwitchExpressionArm_Expression);
  let inner = DOC_NULL;
  if (arrowHasComment) {
    inner = D.indent1(D.concat([DOC_LINE, cswTokSfx(P, arrow, DOC_SPACE), cswNode(P, expr)]));
  } else {
    inner = D.concat([DOC_SPACE, cswTok(P, arrow), D.groupWithId(gid2, [D.indent1(DOC_LINE)]), D.indentIfBreak(cswNode(P, expr), gid2)]);
  }
  const gid1 = D.newGroupId();
  const wc = P.s(n, F_SwitchExpressionArm_WhenClause);
  return D.concat([
    cswExtraNewLines(P, n),
    D.group([D.groupWithId(gid1, [D.concat([cswNode(P, P.s(n, F_SwitchExpressionArm_Pattern)), wc >= 0 ? cswNode(P, wc) : DOC_NULL])]), inner]),
  ]);
};
