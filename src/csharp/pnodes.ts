// CSharpier's node printers for declarations and statements, and Node.Print,
// the dispatcher over all of them.
//
// Ported from CSharpier 1.4.0 (MIT License, Copyright (c) 2021 Bela
// VanderVoort), CSharp/SyntaxPrinter/SyntaxNodePrinters/*.cs and the Node
// printer its generator writes, over a tree shaped after Roslyn's syntax model
// (MIT License, Copyright the .NET Foundation and Contributors).

import {
  F_AccessorDeclaration_AttributeLists,
  F_AccessorDeclaration_Body,
  F_AccessorDeclaration_ExpressionBody,
  F_AccessorDeclaration_Keyword,
  F_AccessorDeclaration_Modifiers,
  F_AccessorDeclaration_SemicolonToken,
  F_AccessorList_Accessors,
  F_AccessorList_CloseBraceToken,
  F_AccessorList_OpenBraceToken,
  F_ArrowExpressionClause_ArrowToken,
  F_ArrowExpressionClause_Expression,
  F_AttributeArgumentList_Arguments,
  F_AttributeArgumentList_CloseParenToken,
  F_AttributeArgumentList_OpenParenToken,
  F_AttributeArgument_Expression,
  F_AttributeArgument_NameColon,
  F_AttributeArgument_NameEquals,
  F_AttributeList_Attributes,
  F_AttributeList_CloseBracketToken,
  F_AttributeList_OpenBracketToken,
  F_AttributeList_Target,
  F_AttributeTargetSpecifier_ColonToken,
  F_AttributeTargetSpecifier_Identifier,
  F_Attribute_ArgumentList,
  F_Attribute_Name,
  F_BaseList_ColonToken,
  F_BaseList_Types,
  F_Block_CloseBraceToken,
  F_Block_OpenBraceToken,
  F_Block_Statements,
  F_BracketedParameterList_CloseBracketToken,
  F_BracketedParameterList_OpenBracketToken,
  F_BracketedParameterList_Parameters,
  F_BreakStatement_BreakKeyword,
  F_BreakStatement_Name,
  F_BreakStatement_SemicolonToken,
  F_CasePatternSwitchLabel_ColonToken,
  F_CasePatternSwitchLabel_Keyword,
  F_CasePatternSwitchLabel_Pattern,
  F_CasePatternSwitchLabel_WhenClause,
  F_CaseSwitchLabel_ColonToken,
  F_CaseSwitchLabel_Keyword,
  F_CaseSwitchLabel_Value,
  F_CatchClause_Block,
  F_CatchClause_CatchKeyword,
  F_CatchClause_Declaration,
  F_CatchClause_Filter,
  F_CatchDeclaration_CloseParenToken,
  F_CatchDeclaration_Identifier,
  F_CatchDeclaration_OpenParenToken,
  F_CatchDeclaration_Type,
  F_CatchFilterClause_CloseParenToken,
  F_CatchFilterClause_FilterExpression,
  F_CatchFilterClause_OpenParenToken,
  F_CatchFilterClause_WhenKeyword,
  F_CheckedStatement_Block,
  F_CheckedStatement_Keyword,
  F_ClassDeclaration_BaseList,
  F_ClassDeclaration_CloseBraceToken,
  F_ClassDeclaration_ConstraintClauses,
  F_ClassDeclaration_Identifier,
  F_ClassDeclaration_Keyword,
  F_ClassDeclaration_Members,
  F_ClassDeclaration_OpenBraceToken,
  F_ClassDeclaration_ParameterList,
  F_ClassDeclaration_SemicolonToken,
  F_ClassDeclaration_TypeParameterList,
  F_ClassOrStructConstraint_ClassOrStructKeyword,
  F_ClassOrStructConstraint_QuestionToken,
  F_CompilationUnit_AttributeLists,
  F_CompilationUnit_EndOfFileToken,
  F_CompilationUnit_Externs,
  F_CompilationUnit_Members,
  F_CompilationUnit_Usings,
  F_ConstructorConstraint_CloseParenToken,
  F_ConstructorConstraint_NewKeyword,
  F_ConstructorConstraint_OpenParenToken,
  F_ConstructorDeclaration_Body,
  F_ConstructorDeclaration_ExpressionBody,
  F_ConstructorDeclaration_Identifier,
  F_ConstructorDeclaration_Initializer,
  F_ConstructorDeclaration_ParameterList,
  F_ConstructorDeclaration_SemicolonToken,
  F_ConstructorInitializer_ArgumentList,
  F_ConstructorInitializer_ColonToken,
  F_ConstructorInitializer_ThisOrBaseKeyword,
  F_ContinueStatement_ContinueKeyword,
  F_ContinueStatement_Name,
  F_ContinueStatement_SemicolonToken,
  F_ConversionOperatorDeclaration_Body,
  F_ConversionOperatorDeclaration_CheckedKeyword,
  F_ConversionOperatorDeclaration_ExpressionBody,
  F_ConversionOperatorDeclaration_ImplicitOrExplicitKeyword,
  F_ConversionOperatorDeclaration_OperatorKeyword,
  F_ConversionOperatorDeclaration_ParameterList,
  F_ConversionOperatorDeclaration_SemicolonToken,
  F_ConversionOperatorDeclaration_Type,
  F_DefaultConstraint_DefaultKeyword,
  F_DefaultSwitchLabel_ColonToken,
  F_DefaultSwitchLabel_Keyword,
  F_DelegateDeclaration_AttributeLists,
  F_DelegateDeclaration_ConstraintClauses,
  F_DelegateDeclaration_DelegateKeyword,
  F_DelegateDeclaration_Identifier,
  F_DelegateDeclaration_Modifiers,
  F_DelegateDeclaration_ParameterList,
  F_DelegateDeclaration_ReturnType,
  F_DelegateDeclaration_SemicolonToken,
  F_DelegateDeclaration_TypeParameterList,
  F_DestructorDeclaration_Body,
  F_DestructorDeclaration_ExpressionBody,
  F_DestructorDeclaration_Identifier,
  F_DestructorDeclaration_ParameterList,
  F_DestructorDeclaration_SemicolonToken,
  F_DestructorDeclaration_TildeToken,
  F_DoStatement_CloseParenToken,
  F_DoStatement_Condition,
  F_DoStatement_DoKeyword,
  F_DoStatement_OpenParenToken,
  F_DoStatement_SemicolonToken,
  F_DoStatement_Statement,
  F_DoStatement_WhileKeyword,
  F_ElseClause_ElseKeyword,
  F_ElseClause_Statement,
  F_EmptyStatement_SemicolonToken,
  F_EnumDeclaration_BaseList,
  F_EnumDeclaration_CloseBraceToken,
  F_EnumDeclaration_EnumKeyword,
  F_EnumDeclaration_Identifier,
  F_EnumDeclaration_Members,
  F_EnumDeclaration_OpenBraceToken,
  F_EnumDeclaration_SemicolonToken,
  F_EnumMemberDeclaration_AttributeLists,
  F_EnumMemberDeclaration_EqualsValue,
  F_EnumMemberDeclaration_Identifier,
  F_EnumMemberDeclaration_Modifiers,
  F_EqualsValueClause_EqualsToken,
  F_EqualsValueClause_Value,
  F_EventDeclaration_AccessorList,
  F_EventDeclaration_EventKeyword,
  F_EventDeclaration_ExplicitInterfaceSpecifier,
  F_EventDeclaration_Identifier,
  F_EventDeclaration_SemicolonToken,
  F_EventDeclaration_Type,
  F_EventFieldDeclaration_Declaration,
  F_EventFieldDeclaration_EventKeyword,
  F_EventFieldDeclaration_SemicolonToken,
  F_ExplicitInterfaceSpecifier_DotToken,
  F_ExplicitInterfaceSpecifier_Name,
  F_ExpressionStatement_Expression,
  F_ExpressionStatement_SemicolonToken,
  F_ExtensionBlockDeclaration_CloseBraceToken,
  F_ExtensionBlockDeclaration_ConstraintClauses,
  F_ExtensionBlockDeclaration_Keyword,
  F_ExtensionBlockDeclaration_Members,
  F_ExtensionBlockDeclaration_OpenBraceToken,
  F_ExtensionBlockDeclaration_ParameterList,
  F_ExtensionBlockDeclaration_SemicolonToken,
  F_ExtensionBlockDeclaration_TypeParameterList,
  F_ExternAliasDirective_AliasKeyword,
  F_ExternAliasDirective_ExternKeyword,
  F_ExternAliasDirective_Identifier,
  F_ExternAliasDirective_SemicolonToken,
  F_FieldDeclaration_Declaration,
  F_FieldDeclaration_SemicolonToken,
  F_FileScopedNamespaceDeclaration_AttributeLists,
  F_FileScopedNamespaceDeclaration_Externs,
  F_FileScopedNamespaceDeclaration_Members,
  F_FileScopedNamespaceDeclaration_Modifiers,
  F_FileScopedNamespaceDeclaration_Name,
  F_FileScopedNamespaceDeclaration_NamespaceKeyword,
  F_FileScopedNamespaceDeclaration_SemicolonToken,
  F_FileScopedNamespaceDeclaration_Usings,
  F_FinallyClause_Block,
  F_FinallyClause_FinallyKeyword,
  F_FixedStatement_CloseParenToken,
  F_FixedStatement_Declaration,
  F_FixedStatement_FixedKeyword,
  F_FixedStatement_OpenParenToken,
  F_FixedStatement_Statement,
  F_ForEachStatement_AwaitKeyword,
  F_ForEachStatement_CloseParenToken,
  F_ForEachStatement_Expression,
  F_ForEachStatement_ForEachKeyword,
  F_ForEachStatement_Identifier,
  F_ForEachStatement_InKeyword,
  F_ForEachStatement_OpenParenToken,
  F_ForEachStatement_Statement,
  F_ForEachStatement_Type,
  F_ForEachVariableStatement_AwaitKeyword,
  F_ForEachVariableStatement_CloseParenToken,
  F_ForEachVariableStatement_Expression,
  F_ForEachVariableStatement_ForEachKeyword,
  F_ForEachVariableStatement_InKeyword,
  F_ForEachVariableStatement_OpenParenToken,
  F_ForEachVariableStatement_Statement,
  F_ForEachVariableStatement_Variable,
  F_ForStatement_CloseParenToken,
  F_ForStatement_Condition,
  F_ForStatement_Declaration,
  F_ForStatement_FirstSemicolonToken,
  F_ForStatement_ForKeyword,
  F_ForStatement_Incrementors,
  F_ForStatement_Initializers,
  F_ForStatement_OpenParenToken,
  F_ForStatement_SecondSemicolonToken,
  F_ForStatement_Statement,
  F_GlobalStatement_AttributeLists,
  F_GlobalStatement_Modifiers,
  F_GlobalStatement_Statement,
  F_GotoStatement_CaseOrDefaultKeyword,
  F_GotoStatement_Expression,
  F_GotoStatement_GotoKeyword,
  F_GotoStatement_SemicolonToken,
  F_IfStatement_CloseParenToken,
  F_IfStatement_Condition,
  F_IfStatement_Else,
  F_IfStatement_IfKeyword,
  F_IfStatement_OpenParenToken,
  F_IfStatement_Statement,
  F_IndexerDeclaration_AccessorList,
  F_IndexerDeclaration_ExplicitInterfaceSpecifier,
  F_IndexerDeclaration_ExpressionBody,
  F_IndexerDeclaration_ParameterList,
  F_IndexerDeclaration_SemicolonToken,
  F_IndexerDeclaration_ThisKeyword,
  F_IndexerDeclaration_Type,
  F_LabeledStatement_AttributeLists,
  F_LabeledStatement_ColonToken,
  F_LabeledStatement_Identifier,
  F_LabeledStatement_Statement,
  F_LocalDeclarationStatement_AwaitKeyword,
  F_LocalDeclarationStatement_Declaration,
  F_LocalDeclarationStatement_Modifiers,
  F_LocalDeclarationStatement_SemicolonToken,
  F_LocalDeclarationStatement_UsingKeyword,
  F_LocalFunctionStatement_Body,
  F_LocalFunctionStatement_ConstraintClauses,
  F_LocalFunctionStatement_ExpressionBody,
  F_LocalFunctionStatement_Identifier,
  F_LocalFunctionStatement_ParameterList,
  F_LocalFunctionStatement_ReturnType,
  F_LocalFunctionStatement_SemicolonToken,
  F_LocalFunctionStatement_TypeParameterList,
  F_LockStatement_CloseParenToken,
  F_LockStatement_Expression,
  F_LockStatement_LockKeyword,
  F_LockStatement_OpenParenToken,
  F_LockStatement_Statement,
  F_MethodDeclaration_Body,
  F_MethodDeclaration_ConstraintClauses,
  F_MethodDeclaration_ExplicitInterfaceSpecifier,
  F_MethodDeclaration_ExpressionBody,
  F_MethodDeclaration_Identifier,
  F_MethodDeclaration_ParameterList,
  F_MethodDeclaration_ReturnType,
  F_MethodDeclaration_SemicolonToken,
  F_MethodDeclaration_TypeParameterList,
  F_NameEquals_EqualsToken,
  F_NameEquals_Name,
  F_NamespaceDeclaration_AttributeLists,
  F_NamespaceDeclaration_CloseBraceToken,
  F_NamespaceDeclaration_Externs,
  F_NamespaceDeclaration_Members,
  F_NamespaceDeclaration_Modifiers,
  F_NamespaceDeclaration_Name,
  F_NamespaceDeclaration_NamespaceKeyword,
  F_NamespaceDeclaration_OpenBraceToken,
  F_NamespaceDeclaration_SemicolonToken,
  F_NamespaceDeclaration_Usings,
  F_OperatorDeclaration_Body,
  F_OperatorDeclaration_CheckedKeyword,
  F_OperatorDeclaration_ExplicitInterfaceSpecifier,
  F_OperatorDeclaration_ExpressionBody,
  F_OperatorDeclaration_OperatorKeyword,
  F_OperatorDeclaration_OperatorToken,
  F_OperatorDeclaration_ParameterList,
  F_OperatorDeclaration_ReturnType,
  F_OperatorDeclaration_SemicolonToken,
  F_ParameterList_CloseParenToken,
  F_ParameterList_OpenParenToken,
  F_ParameterList_Parameters,
  F_Parameter_AttributeLists,
  F_Parameter_Default,
  F_Parameter_Identifier,
  F_Parameter_Modifiers,
  F_Parameter_Type,
  F_PropertyDeclaration_AccessorList,
  F_PropertyDeclaration_ExplicitInterfaceSpecifier,
  F_PropertyDeclaration_ExpressionBody,
  F_PropertyDeclaration_Identifier,
  F_PropertyDeclaration_Initializer,
  F_PropertyDeclaration_SemicolonToken,
  F_PropertyDeclaration_Type,
  F_RecordDeclaration_BaseList,
  F_RecordDeclaration_ClassOrStructKeyword,
  F_RecordDeclaration_CloseBraceToken,
  F_RecordDeclaration_ConstraintClauses,
  F_RecordDeclaration_Identifier,
  F_RecordDeclaration_Keyword,
  F_RecordDeclaration_Members,
  F_RecordDeclaration_OpenBraceToken,
  F_RecordDeclaration_ParameterList,
  F_RecordDeclaration_SemicolonToken,
  F_RecordDeclaration_TypeParameterList,
  F_RecursivePattern_Type,
  F_ReturnStatement_Expression,
  F_ReturnStatement_ReturnKeyword,
  F_ReturnStatement_SemicolonToken,
  F_SimpleBaseType_Type,
  F_Subpattern_Pattern,
  F_SwitchExpressionArm_Pattern,
  F_SwitchSection_Labels,
  F_SwitchSection_Statements,
  F_SwitchStatement_CloseBraceToken,
  F_SwitchStatement_CloseParenToken,
  F_SwitchStatement_Expression,
  F_SwitchStatement_OpenBraceToken,
  F_SwitchStatement_OpenParenToken,
  F_SwitchStatement_Sections,
  F_SwitchStatement_SwitchKeyword,
  F_ThrowStatement_Expression,
  F_ThrowStatement_SemicolonToken,
  F_ThrowStatement_ThrowKeyword,
  F_TryStatement_AttributeLists,
  F_TryStatement_Block,
  F_TryStatement_Catches,
  F_TryStatement_Finally,
  F_TryStatement_TryKeyword,
  F_TypeConstraint_Type,
  F_TypeParameterConstraintClause_ColonToken,
  F_TypeParameterConstraintClause_Constraints,
  F_TypeParameterConstraintClause_Name,
  F_TypeParameterConstraintClause_WhereKeyword,
  F_TypeParameterList_GreaterThanToken,
  F_TypeParameterList_LessThanToken,
  F_TypeParameterList_Parameters,
  F_TypeParameter_AttributeLists,
  F_TypeParameter_Identifier,
  F_TypeParameter_VarianceKeyword,
  F_UnsafeStatement_Block,
  F_UnsafeStatement_UnsafeKeyword,
  F_UsingDirective_Alias,
  F_UsingDirective_GlobalKeyword,
  F_UsingDirective_NamespaceOrType,
  F_UsingDirective_SemicolonToken,
  F_UsingDirective_StaticKeyword,
  F_UsingDirective_UnsafeKeyword,
  F_UsingDirective_UsingKeyword,
  F_UsingStatement_AwaitKeyword,
  F_UsingStatement_CloseParenToken,
  F_UsingStatement_Declaration,
  F_UsingStatement_Expression,
  F_UsingStatement_OpenParenToken,
  F_UsingStatement_Statement,
  F_UsingStatement_UsingKeyword,
  F_VariableDeclaration_Type,
  F_VariableDeclaration_Variables,
  F_VariableDeclarator_ArgumentList,
  F_VariableDeclarator_Identifier,
  F_VariableDeclarator_Initializer,
  F_WhenClause_Condition,
  F_WhenClause_WhenKeyword,
  F_WhileStatement_CloseParenToken,
  F_WhileStatement_Condition,
  F_WhileStatement_OpenParenToken,
  F_WhileStatement_Statement,
  F_WhileStatement_WhileKeyword,
  F_YieldStatement_Expression,
  F_YieldStatement_ReturnOrBreakKeyword,
  F_YieldStatement_SemicolonToken,
  F_YieldStatement_YieldKeyword,
  K_Block,
  K_CollectionExpression,
  K_CompilationUnit,
  K_DiscardPattern,
  K_EventFieldDeclaration,
  K_FixedStatement,
  K_ForEachStatement,
  K_ForEachVariableStatement,
  K_ForStatement,
  K_GlobalStatement,
  K_IfStatement,
  K_MethodDeclaration,
  K_MultiLineCommentTrivia,
  K_MultiLineDocumentationCommentTrivia,
  K_ParameterList,
  K_SingleLineCommentTrivia,
  K_SingleLineDocumentationCommentTrivia,
  K_SwitchExpressionArm,
  K_UsingStatement,
  K_WhileStatement,
  Y_AccessorDeclaration,
  Y_AnonymousMethodExpression,
  Y_AnonymousObjectCreationExpression,
  Y_ArrowExpressionClause,
  Y_AttributeList,
  Y_BaseMethodDeclaration,
  Y_BinaryExpression,
  Y_Block,
  Y_BracketedParameterList,
  Y_BreakStatement,
  Y_CasePatternSwitchLabel,
  Y_CaseSwitchLabel,
  Y_CatchClause,
  Y_CheckedStatement,
  Y_ClassDeclaration,
  Y_ClassOrStructConstraint,
  Y_CompilationUnit,
  Y_ConditionalExpression,
  Y_ConstructorConstraint,
  Y_ConstructorDeclaration,
  Y_ContinueStatement,
  Y_ConversionOperatorDeclaration,
  Y_DefaultConstraint,
  Y_DefaultSwitchLabel,
  Y_DelegateDeclaration,
  Y_DestructorDeclaration,
  Y_DoStatement,
  Y_ElseClause,
  Y_EmptyStatement,
  Y_EnumDeclaration,
  Y_EnumMemberDeclaration,
  Y_EqualsValueClause,
  Y_EventDeclaration,
  Y_EventFieldDeclaration,
  Y_ExplicitInterfaceSpecifier,
  Y_ExpressionColon,
  Y_ExpressionStatement,
  Y_ExtensionBlockDeclaration,
  Y_ExternAliasDirective,
  Y_FieldDeclaration,
  Y_FileScopedNamespaceDeclaration,
  Y_FinallyClause,
  Y_FixedStatement,
  Y_ForEachStatement,
  Y_ForEachVariableStatement,
  Y_ForStatement,
  Y_GlobalStatement,
  Y_GotoStatement,
  Y_IfStatement,
  Y_IncompleteMember,
  Y_IndexerDeclaration,
  Y_InitializerExpression,
  Y_InterfaceDeclaration,
  Y_InvocationExpression,
  Y_LabeledStatement,
  Y_LocalDeclarationStatement,
  Y_LocalFunctionStatement,
  Y_LockStatement,
  Y_MethodDeclaration,
  Y_NameColon,
  Y_NameEquals,
  Y_NamespaceDeclaration,
  Y_ObjectCreationExpression,
  Y_OperatorDeclaration,
  Y_Parameter,
  Y_ParameterList,
  Y_ParenthesizedLambdaExpression,
  Y_PropertyDeclaration,
  Y_QueryExpression,
  Y_RecordDeclaration,
  Y_RecursivePattern,
  Y_ReturnStatement,
  Y_SimpleBaseType,
  Y_Statement,
  Y_StructDeclaration,
  Y_Subpattern,
  Y_SwitchExpression,
  Y_SwitchSection,
  Y_SwitchStatement,
  Y_ThrowStatement,
  Y_TryStatement,
  Y_TypeConstraint,
  Y_TypeParameter,
  Y_TypeParameterConstraintClause,
  Y_TypeParameterList,
  Y_UnionDeclaration,
  Y_UnsafeStatement,
  Y_UsingDirective,
  Y_UsingStatement,
  Y_VariableDeclaration,
  Y_VariableDeclarator,
  Y_WhenClause,
  Y_WhileStatement,
  Y_YieldStatement,
} from "./kinds";
import {
  DOC_BREAK_PARENT,
  DOC_HARDLINE,
  DOC_HARDLINE_IF_NO_PREVIOUS_LINE,
  DOC_LINE,
  DOC_NULL,
  DOC_SOFTLINE,
  DOC_SPACE,
  D_CONCAT,
  D_HARDLINE,
  D_LEADING_COMMENT,
  HL_FOR_TRIVIA,
  csdRemoveInitialDoubleHardLine,
  csdRemoveInitialDoubleHardLineList,
} from "./doc";
import {
  CsBuf,
  CsPrint,
  IGN_ONE,
  SL_ARGUMENT,
  SL_ATTRIBUTE,
  SL_ATTRIBUTE_ARG,
  SL_NODE,
  SL_PARAMETER,
  SL_TYPE_PARAMETER,
  SL_VARIABLE,
  cswAnyNonWhitespace,
  cswAppendNodeUnformatted,
  cswAppendUnformatted,
  cswAttributeLists,
  cswConstraintClauses,
  cswExtraNewLines,
  cswHasIgnoreComment,
  cswIsNodeIgnored,
  cswJoinNodes,
  cswJoin,
  cswLeadA,
  cswLeadB,
  cswLeadingTrivia,
  cswLeadingTriviaTok,
  cswMembersWithForcedLines,
  cswModifiers,
  cswModifiersSorted,
  cswNamespaceLike,
  cswNodesRespectingRangeIgnore,
  cswOptionalBraces,
  cswRightHandSide,
  cswSepList,
  cswTok,
  cswTokHasComments,
  cswTokNoLead,
  cswTokSfx,
  cswTokSfxNoLead,
  cswTrimmedDoc,
  cswTrimmedSrc,
  cswUsingsWithSorting,
} from "./print";
import {
  cswExpressionNode,
  cswArgument,
  cswArgumentList,
  cswBracketedArgumentList,
  cswIsCoalesceWithNonBinaryLeft,
} from "./pexprs";
import { CsDocs } from "./doc";
import { CsLexer } from "./lexer";
import { fault } from "../core/fault";

// Guarded reads of the lexer's and the docs' columns: an index the tree or
// the docs handed out is inside them, so the fault branches are never taken.

/** The start of token t's leading trivia. */
export const cswTokL0 = (lx: CsLexer, t: i32): i32 => {
  const l0 = lx.l0;
  if (t >= 0 && t < l0.length) {
    return l0[t];
  }
  fault();
  return 0;
};

/** The end of token t's leading trivia. */
export const cswTokL1 = (lx: CsLexer, t: i32): i32 => {
  const l1 = lx.l1;
  if (t >= 0 && t < l1.length) {
    return l1[t];
  }
  fault();
  return 0;
};

/** The source offset token t starts at. */
export const cswTokStart = (lx: CsLexer, t: i32): i32 => {
  const start = lx.start;
  if (t >= 0 && t < start.length) {
    return start[t];
  }
  fault();
  return 0;
};

/** The source offset token t ends at. */
export const cswTokEnd = (lx: CsLexer, t: i32): i32 => {
  const end = lx.end;
  if (t >= 0 && t < end.length) {
    return end[t];
  }
  fault();
  return 0;
};

/** The kind of doc d. */
export const cswDocKind = (D: CsDocs, d: i32): i32 => {
  const kind = D.kind;
  if (d >= 0 && d < kind.length) {
    return kind[d];
  }
  fault();
  return 0;
};

/** Field a of doc d. */
export const cswDocA = (D: CsDocs, d: i32): i32 => {
  const a = D.a;
  if (d >= 0 && d < a.length) {
    return a[d];
  }
  fault();
  return 0;
};

/** Field b of doc d. */
export const cswDocB = (D: CsDocs, d: i32): i32 => {
  const b = D.b;
  if (d >= 0 && d < b.length) {
    return b[d];
  }
  fault();
  return 0;
};

/** Leaves one level of print recursion; the level entered is at least 1. */
export const cswDepthDown = (P: CsPrint): void => {
  const e = P.depth;
  if (e > 0) {
    P.depth = e - 1;
  } else {
    fault();
  }
};

/** The first of a list of docs the caller filled. */
export const cswFirstDoc = (docs: i32[]): i32 => {
  if (docs.length > 0) {
    return docs[0];
  }
  fault();
  return DOC_NULL;
};

/** Node.Print. */
export const cswNode = (P: CsPrint, n: i32): i32 => {
  if (n < 0 || P.failed) {
    return DOC_NULL;
  }
  if (P.depth > 200) {
    P.fail("We can't handle this deep of recursion yet.");
    return DOC_NULL;
  }
  if (cswIsNodeIgnored(P, n)) {
    const buf = new CsBuf(256);
    cswAppendNodeUnformatted(P, buf, n);
    const code = cswTrimmedDoc(P, buf);
    return P.is(n, Y_Statement) ? P.cc([cswExtraNewLines(P, n), code]) : code;
  }
  const d = P.depth;
  if (d >= 2147483647) {
    fault();
    return DOC_NULL;
  }
  P.depth = d + 1;
  const r = cswDispatch(P, n);
  cswDepthDown(P);
  return r;
};

/** UnhandledNode.Print: the full text, trimmed. */
export const cswUnhandled = (P: CsPrint, n: i32): i32 => cswTrimmedSrc(P, P.t.fullStart(n), P.t.fullEnd(n));

const cswDispatch = (P: CsPrint, n: i32): i32 => {
  const y = P.t.ty(n);
  switch (y) {
    case Y_CompilationUnit:
      return cswCompilationUnit(P, n);
    case Y_NamespaceDeclaration:
      return cswNamespaceDeclaration(P, n);
    case Y_FileScopedNamespaceDeclaration:
      return cswFileScopedNamespace(P, n);
    case Y_UsingDirective:
      return cswUsingDirective(P, n, true);
    case Y_ExternAliasDirective:
      return cswExternAlias(P, n, true);
    case Y_AttributeList:
      return cswAttributeList(P, n);
    case Y_ClassDeclaration:
    case Y_StructDeclaration:
    case Y_InterfaceDeclaration:
    case Y_RecordDeclaration:
    case Y_EnumDeclaration:
    case Y_UnionDeclaration:
    case Y_ExtensionBlockDeclaration:
      return cswBaseTypeDeclaration(P, n);
    case Y_MethodDeclaration:
    case Y_OperatorDeclaration:
    case Y_ConversionOperatorDeclaration:
    case Y_ConstructorDeclaration:
    case Y_DestructorDeclaration:
    case Y_LocalFunctionStatement:
      return cswBaseMethodDeclaration(P, n);
    case Y_FieldDeclaration:
    case Y_EventFieldDeclaration:
      return cswBaseFieldDeclaration(P, n);
    case Y_PropertyDeclaration:
    case Y_EventDeclaration:
    case Y_IndexerDeclaration:
      return cswBasePropertyDeclaration(P, n);
    case Y_DelegateDeclaration:
      return cswDelegateDeclaration(P, n);
    case Y_EnumMemberDeclaration:
      return cswEnumMember(P, n);
    case Y_IncompleteMember:
      return P.str("");
    case Y_ParameterList:
      return cswParameterListLike(
        P,
        n,
        P.s(n, F_ParameterList_OpenParenToken),
        P.s(n, F_ParameterList_Parameters),
        P.s(n, F_ParameterList_CloseParenToken),
      );
    case Y_BracketedParameterList:
      return cswParameterListLike(
        P,
        n,
        P.s(n, F_BracketedParameterList_OpenBracketToken),
        P.s(n, F_BracketedParameterList_Parameters),
        P.s(n, F_BracketedParameterList_CloseBracketToken),
      );
    case Y_Parameter:
      return cswParameter(P, n);
    case Y_TypeParameterList:
      return cswTypeParameterList(P, n);
    case Y_TypeParameter:
      return cswTypeParameter(P, n);
    case Y_TypeParameterConstraintClause:
      return cswTypeParameterConstraintClause(P, n);
    case Y_ClassOrStructConstraint:
      return P.cc([
        cswTok(P, P.s(n, F_ClassOrStructConstraint_ClassOrStructKeyword)),
        cswTok(P, P.s(n, F_ClassOrStructConstraint_QuestionToken)),
      ]);
    case Y_ConstructorConstraint:
      return P.cc([
        cswTok(P, P.s(n, F_ConstructorConstraint_NewKeyword)),
        cswTok(P, P.s(n, F_ConstructorConstraint_OpenParenToken)),
        cswTok(P, P.s(n, F_ConstructorConstraint_CloseParenToken)),
      ]);
    case Y_DefaultConstraint:
      return cswTok(P, P.s(n, F_DefaultConstraint_DefaultKeyword));
    case Y_TypeConstraint:
      return cswNode(P, P.s(n, F_TypeConstraint_Type));
    case Y_ExplicitInterfaceSpecifier:
      return cswExplicitInterfaceSpecifier(P, n);
    case Y_ArrowExpressionClause:
      return cswArrowExpressionClause(P, n);
    case Y_EqualsValueClause:
      return cswEqualsValueClause(P, n);
    case Y_NameEquals:
      return cswNameEquals(P, n);
    case Y_NameColon:
    case Y_ExpressionColon:
      return cswBaseExpressionColon(P, n);
    case Y_SimpleBaseType:
      return cswNode(P, P.s(n, F_SimpleBaseType_Type));
    case Y_VariableDeclaration:
      return cswVariableDeclaration(P, n);
    case Y_VariableDeclarator:
      return cswVariableDeclarator(P, n);
    // statements
    case Y_Block:
      return cswBlock(P, n);
    case Y_ExpressionStatement:
      return cswExpressionStatement(P, n);
    case Y_LocalDeclarationStatement:
      return cswLocalDeclarationStatement(P, n);
    case Y_ReturnStatement:
      return cswReturnStatement(P, n);
    case Y_IfStatement:
      return cswIfStatement(P, n);
    case Y_ElseClause:
      return cswElseClause(P, n);
    case Y_ForStatement:
      return cswForStatement(P, n);
    case Y_ForEachStatement:
    case Y_ForEachVariableStatement:
      return cswForEach(P, n);
    case Y_WhileStatement:
      return cswWhileStatement(P, n);
    case Y_DoStatement:
      return cswDoStatement(P, n);
    case Y_SwitchStatement:
      return cswSwitchStatement(P, n);
    case Y_SwitchSection:
      return cswSwitchSection(P, n);
    case Y_CaseSwitchLabel:
      return P.cc([
        cswExtraNewLines(P, n),
        cswTokSfx(P, P.s(n, F_CaseSwitchLabel_Keyword), DOC_SPACE),
        P.D.group1(cswNode(P, P.s(n, F_CaseSwitchLabel_Value))),
        cswTok(P, P.s(n, F_CaseSwitchLabel_ColonToken)),
      ]);
    case Y_CasePatternSwitchLabel:
      return P.group([
        cswExtraNewLines(P, n),
        cswTokSfx(P, P.s(n, F_CasePatternSwitchLabel_Keyword), DOC_SPACE),
        cswNode(P, P.s(n, F_CasePatternSwitchLabel_Pattern)),
        P.s(n, F_CasePatternSwitchLabel_WhenClause) >= 0
          ? cswWhenClause(P, P.s(n, F_CasePatternSwitchLabel_WhenClause))
          : DOC_NULL,
        cswTok(P, P.s(n, F_CasePatternSwitchLabel_ColonToken)),
      ]);
    case Y_DefaultSwitchLabel:
      return P.cc([
        cswExtraNewLines(P, n),
        cswTok(P, P.s(n, F_DefaultSwitchLabel_Keyword)),
        cswTok(P, P.s(n, F_DefaultSwitchLabel_ColonToken)),
      ]);
    case Y_WhenClause:
      return cswWhenClause(P, n);
    case Y_TryStatement:
      return cswTryStatement(P, n);
    case Y_CatchClause:
      return cswCatchClause(P, n);
    case Y_FinallyClause:
      return P.cc([cswTok(P, P.s(n, F_FinallyClause_FinallyKeyword)), cswNode(P, P.s(n, F_FinallyClause_Block))]);
    case Y_UsingStatement:
      return cswUsingStatement(P, n);
    case Y_LockStatement:
      return cswLockStatement(P, n);
    case Y_FixedStatement:
      return cswFixedStatement(P, n);
    case Y_CheckedStatement:
      return P.cc([cswTok(P, P.s(n, F_CheckedStatement_Keyword)), cswBlock(P, P.s(n, F_CheckedStatement_Block))]);
    case Y_UnsafeStatement:
      return P.cc([
        cswExtraNewLines(P, n),
        cswTok(P, P.s(n, F_UnsafeStatement_UnsafeKeyword)),
        cswNode(P, P.s(n, F_UnsafeStatement_Block)),
      ]);
    case Y_YieldStatement: {
      const e = P.s(n, F_YieldStatement_Expression);
      const expr = e >= 0 ? P.cc([DOC_SPACE, cswNode(P, e)]) : DOC_NULL;
      return P.cc([
        cswExtraNewLines(P, n),
        cswTokSfx(P, P.s(n, F_YieldStatement_YieldKeyword), DOC_SPACE),
        cswTok(P, P.s(n, F_YieldStatement_ReturnOrBreakKeyword)),
        expr,
        cswTok(P, P.s(n, F_YieldStatement_SemicolonToken)),
      ]);
    }
    case Y_ThrowStatement: {
      const e = P.s(n, F_ThrowStatement_Expression);
      const expr = e >= 0 ? P.cc([DOC_SPACE, cswNode(P, e)]) : DOC_NULL;
      return P.cc([
        cswExtraNewLines(P, n),
        cswTok(P, P.s(n, F_ThrowStatement_ThrowKeyword)),
        expr,
        cswTok(P, P.s(n, F_ThrowStatement_SemicolonToken)),
      ]);
    }
    case Y_BreakStatement: {
      const name = P.s(n, F_BreakStatement_Name);
      return P.cc([
        cswExtraNewLines(P, n),
        cswTokSfx(P, P.s(n, F_BreakStatement_BreakKeyword), name >= 0 ? DOC_SPACE : DOC_NULL),
        name >= 0 ? cswNode(P, name) : DOC_NULL,
        cswTok(P, P.s(n, F_BreakStatement_SemicolonToken)),
      ]);
    }
    case Y_ContinueStatement: {
      const name = P.s(n, F_ContinueStatement_Name);
      return P.cc([
        cswExtraNewLines(P, n),
        cswTokSfx(P, P.s(n, F_ContinueStatement_ContinueKeyword), name >= 0 ? DOC_SPACE : DOC_NULL),
        name >= 0 ? cswNode(P, name) : DOC_NULL,
        cswTok(P, P.s(n, F_ContinueStatement_SemicolonToken)),
      ]);
    }
    case Y_GotoStatement: {
      const e = P.s(n, F_GotoStatement_Expression);
      const expr = e >= 0 ? P.cc([DOC_SPACE, cswNode(P, e)]) : DOC_NULL;
      const cd = P.s(n, F_GotoStatement_CaseOrDefaultKeyword);
      return P.cc([
        cswExtraNewLines(P, n),
        cswTok(P, P.s(n, F_GotoStatement_GotoKeyword)),
        cd >= 0 ? DOC_SPACE : DOC_NULL,
        cswTok(P, cd),
        expr,
        cswTok(P, P.s(n, F_GotoStatement_SemicolonToken)),
      ]);
    }
    case Y_LabeledStatement:
      return cswLabeledStatement(P, n);
    case Y_EmptyStatement:
      return cswTok(P, P.s(n, F_EmptyStatement_SemicolonToken));
    case Y_GlobalStatement:
      return P.cc([
        cswAttributeLists(P, n, P.s(n, F_GlobalStatement_AttributeLists)),
        cswModifiers(P, P.s(n, F_GlobalStatement_Modifiers)),
        cswNode(P, P.s(n, F_GlobalStatement_Statement)),
      ]);
    default:
      return cswExpressionNode(P, n, y);
  }
};

// ---- compilation unit and namespaces ----

const cswCompilationUnit = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const docs: i32[] = [];
  cswNamespaceLike(
    P,
    n,
    P.s(n, F_CompilationUnit_Externs),
    P.s(n, F_CompilationUnit_Usings),
    P.s(n, F_CompilationUnit_Members),
    docs,
  );
  const eof = P.s(n, F_CompilationUnit_EndOfFileToken);
  const finalTrivia = cswLeadingTrivia(P, cswTokL0(P.lx, eof), cswTokL1(P.lx, eof), true, false);
  if (finalTrivia !== DOC_NULL) {
    const nd = toI32(docs.length);
    const prev = nd > 0 ? docs[nd - 1] : -1;
    let squash = false;
    if (
      cswDocKind(D, finalTrivia) === D_CONCAT &&
      D.count(finalTrivia) > 1 &&
      prev >= 0 &&
      cswDocKind(D, prev) === D_CONCAT
    ) {
      const cp = D.count(prev);
      squash =
        cp > 1 && cswDocKind(D, D.at(prev, cp - 1)) === D_HARDLINE && cswDocKind(D, D.at(prev, cp - 2)) === D_HARDLINE;
    }
    if (squash) {
      while (
        D.count(finalTrivia) > 0 &&
        cswDocKind(D, D.at(finalTrivia, 0)) === D_HARDLINE &&
        (cswDocB(D, D.at(finalTrivia, 0)) & HL_FOR_TRIVIA) !== 0
      ) {
        // List.RemoveAt(0)
        const da = D.a;
        const db = D.b;
        if (finalTrivia < 0 || finalTrivia >= da.length || finalTrivia >= db.length) {
          fault();
          break;
        }
        const va = da[finalTrivia];
        const vb = db[finalTrivia];
        // vb is the count, above 0; va an offset in the pool
        if (vb <= 0 || va >= 2147483647) {
          fault();
          break;
        }
        da[finalTrivia] = va + 1;
        db[finalTrivia] = vb - 1;
      }
      docs.push(finalTrivia);
    } else {
      docs.push(DOC_HARDLINE_IF_NO_PREVIOUS_LINE);
      docs.push(finalTrivia);
    }
  }
  docs.push(DOC_HARDLINE_IF_NO_PREVIOUS_LINE);
  return D.concat(docs);
};

const cswNamespaceDeclaration = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const inner: i32[] = [];
  const members = P.s(n, F_NamespaceDeclaration_Members);
  const usings = P.s(n, F_NamespaceDeclaration_Usings);
  const externs = P.s(n, F_NamespaceDeclaration_Externs);
  const hasAny = P.count(members) > 0 || P.count(usings) > 0 || P.count(externs) > 0;
  if (hasAny) {
    inner.push(DOC_HARDLINE);
    cswNamespaceLike(P, n, externs, usings, members, inner);
  } else {
    inner.push(DOC_SPACE);
  }
  csdRemoveInitialDoubleHardLineList(D, inner);
  return D.concat([
    cswAttributeLists(P, n, P.s(n, F_NamespaceDeclaration_AttributeLists)),
    cswModifiers(P, P.s(n, F_NamespaceDeclaration_Modifiers)),
    cswTok(P, P.s(n, F_NamespaceDeclaration_NamespaceKeyword)),
    DOC_SPACE,
    cswNode(P, P.s(n, F_NamespaceDeclaration_Name)),
    D.group([
      DOC_LINE,
      cswTok(P, P.s(n, F_NamespaceDeclaration_OpenBraceToken)),
      D.indent(inner),
      hasAny ? DOC_HARDLINE : DOC_NULL,
      cswTok(P, P.s(n, F_NamespaceDeclaration_CloseBraceToken)),
      cswTok(P, P.s(n, F_NamespaceDeclaration_SemicolonToken)),
    ]),
  ]);
};

const cswFileScopedNamespace = (P: CsPrint, n: i32): i32 => {
  const docs: i32[] = [
    cswAttributeLists(P, n, P.s(n, F_FileScopedNamespaceDeclaration_AttributeLists)),
    cswModifiers(P, P.s(n, F_FileScopedNamespaceDeclaration_Modifiers)),
    cswTok(P, P.s(n, F_FileScopedNamespaceDeclaration_NamespaceKeyword)),
    DOC_SPACE,
    cswNode(P, P.s(n, F_FileScopedNamespaceDeclaration_Name)),
    cswTok(P, P.s(n, F_FileScopedNamespaceDeclaration_SemicolonToken)),
    DOC_HARDLINE,
    DOC_HARDLINE,
  ];
  cswNamespaceLike(
    P,
    n,
    P.s(n, F_FileScopedNamespaceDeclaration_Externs),
    P.s(n, F_FileScopedNamespaceDeclaration_Usings),
    P.s(n, F_FileScopedNamespaceDeclaration_Members),
    docs,
  );
  return P.D.concat(docs);
};

export const cswUsingDirective = (P: CsPrint, n: i32, printExtraLines: boolean): i32 => {
  const alias = P.s(n, F_UsingDirective_Alias);
  return P.cc([
    printExtraLines ? cswExtraNewLines(P, n) : DOC_NULL,
    cswTokSfxNoLead(P, P.s(n, F_UsingDirective_GlobalKeyword), DOC_SPACE),
    cswTokSfxNoLead(P, P.s(n, F_UsingDirective_UsingKeyword), DOC_SPACE),
    cswTokSfxNoLead(P, P.s(n, F_UsingDirective_UnsafeKeyword), DOC_SPACE),
    cswTokSfxNoLead(P, P.s(n, F_UsingDirective_StaticKeyword), DOC_SPACE),
    alias < 0 ? DOC_NULL : cswNameEquals(P, alias),
    cswNode(P, P.s(n, F_UsingDirective_NamespaceOrType)),
    cswTok(P, P.s(n, F_UsingDirective_SemicolonToken)),
  ]);
};

export const cswExternAlias = (P: CsPrint, n: i32, printExtraLines: boolean): i32 =>
  P.cc([
    printExtraLines ? cswExtraNewLines(P, n) : DOC_NULL,
    cswTokSfx(P, P.s(n, F_ExternAliasDirective_ExternKeyword), DOC_SPACE),
    cswTokSfx(P, P.s(n, F_ExternAliasDirective_AliasKeyword), DOC_SPACE),
    cswTok(P, P.s(n, F_ExternAliasDirective_Identifier)),
    cswTok(P, P.s(n, F_ExternAliasDirective_SemicolonToken)),
  ]);

// ---- attributes ----

export const cswAttributeList = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const p = P.par(n);
  if (P.is(p, Y_BaseMethodDeclaration) && cswHasIgnoreComment(P, cswLeadA(P, n), cswLeadB(P, n), IGN_ONE)) {
    const buf = new CsBuf(256);
    cswAppendNodeUnformatted(P, buf, n);
    return cswTrimmedDoc(P, buf);
  }
  const docs: i32[] = [];
  if (P.k(p) === K_CompilationUnit && P.at(P.s(p, F_CompilationUnit_AttributeLists), 0) !== n) {
    docs.push(cswExtraNewLines(P, n));
  }
  docs.push(cswTok(P, P.s(n, F_AttributeList_OpenBracketToken)));
  const target = P.s(n, F_AttributeList_Target);
  if (target >= 0) {
    docs.push(cswTok(P, P.s(target, F_AttributeTargetSpecifier_Identifier)));
    docs.push(cswTokSfx(P, P.s(target, F_AttributeTargetSpecifier_ColonToken), DOC_SPACE));
  }
  const attrs = P.s(n, F_AttributeList_Attributes);
  const printed = cswSepList(P, attrs, SL_ATTRIBUTE, DOC_LINE, 0, -1);
  const many = P.scount(attrs) > 1;
  docs.push(many ? D.indent([DOC_SOFTLINE, printed]) : printed);
  if (many) {
    docs.push(DOC_SOFTLINE);
  }
  docs.push(cswTok(P, P.s(n, F_AttributeList_CloseBracketToken)));
  return D.group(docs);
};

/** One attribute of an attribute list. */
export const cswAttribute = (P: CsPrint, a: i32): i32 => {
  const D = P.D;
  const name = cswNode(P, P.s(a, F_Attribute_Name));
  const al = P.s(a, F_Attribute_ArgumentList);
  if (al < 0) {
    return name;
  }
  const args = P.s(al, F_AttributeArgumentList_Arguments);
  let single = false;
  if (P.scount(args) === 1) {
    const a0 = P.sel(args, 0);
    single =
      P.k(P.s(a0, F_AttributeArgument_Expression)) === K_CollectionExpression &&
      P.s(a0, F_AttributeArgument_NameColon) < 0 &&
      P.s(a0, F_AttributeArgument_NameEquals) < 0;
  }
  return D.group([
    name,
    cswTok(P, P.s(al, F_AttributeArgumentList_OpenParenToken)),
    D.indentIf(
      !single,
      D.concat([single ? DOC_NULL : DOC_SOFTLINE, cswSepList(P, args, SL_ATTRIBUTE_ARG, DOC_LINE, 0, -1)]),
    ),
    single ? DOC_NULL : DOC_SOFTLINE,
    cswTok(P, P.s(al, F_AttributeArgumentList_CloseParenToken)),
  ]);
};

export const cswAttributeArgument = (P: CsPrint, a: i32): i32 => {
  const ne = P.s(a, F_AttributeArgument_NameEquals);
  const nc = P.s(a, F_AttributeArgument_NameColon);
  return P.cc([
    ne >= 0 ? cswNameEquals(P, ne) : DOC_NULL,
    nc >= 0 ? cswBaseExpressionColon(P, nc) : DOC_NULL,
    cswNode(P, P.s(a, F_AttributeArgument_Expression)),
  ]);
};

// ---- types ----

const cswBaseTypeDeclaration = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const y = P.t.ty(n);
  let tpl = -1;
  let constraints = -1;
  let hasConstraints = false;
  let recordKeyword = -1;
  let keyword = -1;
  let identifier = -1;
  let parameterList = -1;
  let baseList = -1;
  let open = -1;
  let members = -1;
  let close = -1;
  let semicolon = -1;
  let separated = false;
  if (
    y === Y_ClassDeclaration ||
    y === Y_StructDeclaration ||
    y === Y_InterfaceDeclaration ||
    y === Y_UnionDeclaration
  ) {
    keyword = P.s(n, F_ClassDeclaration_Keyword);
    identifier = P.s(n, F_ClassDeclaration_Identifier);
    tpl = P.s(n, F_ClassDeclaration_TypeParameterList);
    if (y !== Y_InterfaceDeclaration) {
      parameterList = P.s(n, F_ClassDeclaration_ParameterList);
    }
    baseList = P.s(n, F_ClassDeclaration_BaseList);
    constraints = P.s(n, F_ClassDeclaration_ConstraintClauses);
    open = P.s(n, F_ClassDeclaration_OpenBraceToken);
    members = P.s(n, F_ClassDeclaration_Members);
    close = P.s(n, F_ClassDeclaration_CloseBraceToken);
    semicolon = P.s(n, F_ClassDeclaration_SemicolonToken);
    hasConstraints = true;
  } else if (y === Y_RecordDeclaration) {
    recordKeyword = P.s(n, F_RecordDeclaration_Keyword);
    keyword = P.s(n, F_RecordDeclaration_ClassOrStructKeyword);
    identifier = P.s(n, F_RecordDeclaration_Identifier);
    tpl = P.s(n, F_RecordDeclaration_TypeParameterList);
    parameterList = P.s(n, F_RecordDeclaration_ParameterList);
    baseList = P.s(n, F_RecordDeclaration_BaseList);
    constraints = P.s(n, F_RecordDeclaration_ConstraintClauses);
    open = P.s(n, F_RecordDeclaration_OpenBraceToken);
    members = P.s(n, F_RecordDeclaration_Members);
    close = P.s(n, F_RecordDeclaration_CloseBraceToken);
    semicolon = P.s(n, F_RecordDeclaration_SemicolonToken);
    hasConstraints = true;
  } else if (y === Y_ExtensionBlockDeclaration) {
    keyword = P.s(n, F_ExtensionBlockDeclaration_Keyword);
    tpl = P.s(n, F_ExtensionBlockDeclaration_TypeParameterList);
    parameterList = P.s(n, F_ExtensionBlockDeclaration_ParameterList);
    constraints = P.s(n, F_ExtensionBlockDeclaration_ConstraintClauses);
    open = P.s(n, F_ExtensionBlockDeclaration_OpenBraceToken);
    members = P.s(n, F_ExtensionBlockDeclaration_Members);
    close = P.s(n, F_ExtensionBlockDeclaration_CloseBraceToken);
    semicolon = P.s(n, F_ExtensionBlockDeclaration_SemicolonToken);
    hasConstraints = true;
  } else {
    keyword = P.s(n, F_EnumDeclaration_EnumKeyword);
    identifier = P.s(n, F_EnumDeclaration_Identifier);
    baseList = P.s(n, F_EnumDeclaration_BaseList);
    open = P.s(n, F_EnumDeclaration_OpenBraceToken);
    members = P.s(n, F_EnumDeclaration_Members);
    close = P.s(n, F_EnumDeclaration_CloseBraceToken);
    semicolon = P.s(n, F_EnumDeclaration_SemicolonToken);
    separated = true;
  }
  const hasMembers = separated ? P.scount(members) > 0 : P.count(members) > 0;
  const docs: i32[] = [];
  const attrs = P.s(n, 0);
  if (P.count(attrs) > 0) {
    docs.push(cswAttributeLists(P, n, attrs));
  }
  const mods = P.s(n, 1);
  if (P.count(mods) > 0) {
    docs.push(cswModifiersSorted(P, mods));
  }
  if (recordKeyword >= 0) {
    docs.push(cswTokSfx(P, recordKeyword, DOC_SPACE));
  }
  if (keyword >= 0) {
    if (y === Y_ExtensionBlockDeclaration) {
      docs.push(cswTok(P, keyword));
    } else {
      docs.push(cswTokSfx(P, keyword, DOC_SPACE));
    }
  }
  docs.push(cswTok(P, identifier));
  if (tpl >= 0) {
    docs.push(cswTypeParameterList(P, tpl));
  }
  if (parameterList >= 0) {
    docs.push(
      cswParameterListLike(
        P,
        parameterList,
        P.s(parameterList, F_ParameterList_OpenParenToken),
        P.s(parameterList, F_ParameterList_Parameters),
        P.s(parameterList, F_ParameterList_CloseParenToken),
      ),
    );
  }
  if (baseList >= 0) {
    const types = P.s(baseList, F_BaseList_Types);
    const many = P.scount(types) > 1;
    const baseDoc = D.concat([
      cswTok(P, P.s(baseList, F_BaseList_ColonToken)),
      DOC_SPACE,
      cswNode(P, P.sel(types, 0)),
      many
        ? D.indent([cswTok(P, P.sep(types, 0)), DOC_LINE, cswSepList(P, types, SL_NODE, DOC_LINE, 1, -1)])
        : DOC_NULL,
    ]);
    docs.push(D.group1(D.indent([DOC_LINE, baseDoc])));
  }
  if (hasConstraints) {
    docs.push(cswConstraintClauses(P, constraints));
  }
  if (hasMembers) {
    const ms = cswMembersWithForcedLines(P, n, members, separated, false);
    const content = D.indent(ms);
    csdRemoveInitialDoubleHardLine(D, content);
    docs.push(DOC_HARDLINE);
    docs.push(cswTok(P, open));
    docs.push(content);
    docs.push(DOC_HARDLINE);
    docs.push(cswTok(P, close));
  } else if (open >= 0) {
    const lx = P.lx;
    const sep = cswAnyNonWhitespace(lx, cswTokL0(lx, close), cswTokL1(lx, close)) ? DOC_LINE : DOC_SPACE;
    docs.push(sep);
    docs.push(cswTok(P, open));
    docs.push(sep);
    docs.push(cswTok(P, close));
  }
  docs.push(cswTok(P, semicolon));
  return D.concat(docs);
};

// ---- methods ----

const cswBaseMethodDeclaration = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const y = P.t.ty(n);
  const attrs = P.s(n, 0);
  const mods = P.s(n, 1);
  let returnType = -1;
  let eis = -1;
  let identifier = -1;
  let tilde = -1;
  let tpl = -1;
  let constraints = -1;
  let parameterList = -1;
  let initializer = -1;
  let body = -1;
  let exprBody = -1;
  let semicolon = -1;
  let hasIdentifier = false;
  switch (y) {
    case Y_MethodDeclaration:
      returnType = P.s(n, F_MethodDeclaration_ReturnType);
      eis = P.s(n, F_MethodDeclaration_ExplicitInterfaceSpecifier);
      identifier = P.s(n, F_MethodDeclaration_Identifier);
      hasIdentifier = true;
      tpl = P.s(n, F_MethodDeclaration_TypeParameterList);
      constraints = P.s(n, F_MethodDeclaration_ConstraintClauses);
      parameterList = P.s(n, F_MethodDeclaration_ParameterList);
      body = P.s(n, F_MethodDeclaration_Body);
      exprBody = P.s(n, F_MethodDeclaration_ExpressionBody);
      semicolon = P.s(n, F_MethodDeclaration_SemicolonToken);
      break;
    case Y_DestructorDeclaration:
      tilde = P.s(n, F_DestructorDeclaration_TildeToken);
      identifier = P.s(n, F_DestructorDeclaration_Identifier);
      hasIdentifier = true;
      parameterList = P.s(n, F_DestructorDeclaration_ParameterList);
      body = P.s(n, F_DestructorDeclaration_Body);
      exprBody = P.s(n, F_DestructorDeclaration_ExpressionBody);
      semicolon = P.s(n, F_DestructorDeclaration_SemicolonToken);
      break;
    case Y_ConstructorDeclaration:
      identifier = P.s(n, F_ConstructorDeclaration_Identifier);
      hasIdentifier = true;
      initializer = P.s(n, F_ConstructorDeclaration_Initializer);
      parameterList = P.s(n, F_ConstructorDeclaration_ParameterList);
      body = P.s(n, F_ConstructorDeclaration_Body);
      exprBody = P.s(n, F_ConstructorDeclaration_ExpressionBody);
      semicolon = P.s(n, F_ConstructorDeclaration_SemicolonToken);
      break;
    case Y_OperatorDeclaration:
      parameterList = P.s(n, F_OperatorDeclaration_ParameterList);
      body = P.s(n, F_OperatorDeclaration_Body);
      exprBody = P.s(n, F_OperatorDeclaration_ExpressionBody);
      semicolon = P.s(n, F_OperatorDeclaration_SemicolonToken);
      break;
    case Y_ConversionOperatorDeclaration:
      parameterList = P.s(n, F_ConversionOperatorDeclaration_ParameterList);
      body = P.s(n, F_ConversionOperatorDeclaration_Body);
      exprBody = P.s(n, F_ConversionOperatorDeclaration_ExpressionBody);
      semicolon = P.s(n, F_ConversionOperatorDeclaration_SemicolonToken);
      break;
    default:
      // a local function
      returnType = P.s(n, F_LocalFunctionStatement_ReturnType);
      identifier = P.s(n, F_LocalFunctionStatement_Identifier);
      hasIdentifier = true;
      tpl = P.s(n, F_LocalFunctionStatement_TypeParameterList);
      parameterList = P.s(n, F_LocalFunctionStatement_ParameterList);
      constraints = P.s(n, F_LocalFunctionStatement_ConstraintClauses);
      body = P.s(n, F_LocalFunctionStatement_Body);
      exprBody = P.s(n, F_LocalFunctionStatement_ExpressionBody);
      semicolon = P.s(n, F_LocalFunctionStatement_SemicolonToken);
      break;
  }
  const docs: i32[] = [];
  const decl: i32[] = [];
  if (y === Y_LocalFunctionStatement) {
    docs.push(cswExtraNewLines(P, n));
  }
  const lx = P.lx;
  if (P.count(attrs) > 0) {
    docs.push(cswAttributeLists(P, n, attrs));
    if (P.count(mods) > 0) {
      const m0 = P.at(mods, 0);
      if (cswHasIgnoreComment(P, cswTokL0(lx, m0), cswTokL1(lx, m0), IGN_ONE)) {
        cswMethodUnformattedWithoutAttributes(P, n, attrs, cswTokL0(lx, m0), docs);
        return D.group(docs);
      }
    } else if (returnType >= 0 && cswHasIgnoreComment(P, cswLeadA(P, returnType), cswLeadB(P, returnType), IGN_ONE)) {
      cswMethodUnformattedWithoutAttributes(P, n, attrs, cswLeadA(P, returnType), docs);
      return D.group(docs);
    }
  }
  if (P.count(mods) > 0) {
    decl.push(cswModifiersSorted(P, mods));
  }
  if (returnType >= 0) {
    decl.push(cswNode(P, returnType));
    decl.push(DOC_SPACE);
  }
  if (eis >= 0) {
    decl.push(cswExplicitInterfaceSpecifier(P, eis));
  }
  if (hasIdentifier) {
    if (tilde >= 0) {
      decl.push(D.concat([cswTok(P, tilde), cswTok(P, identifier)]));
    } else {
      decl.push(cswTok(P, identifier));
    }
  }
  if (y === Y_ConversionOperatorDeclaration) {
    decl.push(cswTokSfx(P, P.s(n, F_ConversionOperatorDeclaration_ImplicitOrExplicitKeyword), DOC_SPACE));
    decl.push(cswTokSfx(P, P.s(n, F_ConversionOperatorDeclaration_OperatorKeyword), DOC_SPACE));
    decl.push(cswTokSfx(P, P.s(n, F_ConversionOperatorDeclaration_CheckedKeyword), DOC_SPACE));
    decl.push(cswNode(P, P.s(n, F_ConversionOperatorDeclaration_Type)));
  } else if (y === Y_OperatorDeclaration) {
    decl.push(cswNode(P, P.s(n, F_OperatorDeclaration_ReturnType)));
    decl.push(DOC_SPACE);
    const oeis = P.s(n, F_OperatorDeclaration_ExplicitInterfaceSpecifier);
    decl.push(oeis >= 0 ? cswNode(P, oeis) : DOC_NULL);
    decl.push(cswTokSfx(P, P.s(n, F_OperatorDeclaration_OperatorKeyword), DOC_SPACE));
    decl.push(cswTokSfx(P, P.s(n, F_OperatorDeclaration_CheckedKeyword), DOC_SPACE));
    decl.push(cswTok(P, P.s(n, F_OperatorDeclaration_OperatorToken)));
  }
  if (tpl >= 0 && P.scount(P.s(tpl, F_TypeParameterList_Parameters)) > 0) {
    decl.push(cswTypeParameterList(P, tpl));
  }
  if (parameterList >= 0) {
    const params = P.s(parameterList, F_ParameterList_Parameters);
    if (P.scount(params) > 0) {
      decl.push(
        cswParameterListLike(
          P,
          parameterList,
          P.s(parameterList, F_ParameterList_OpenParenToken),
          params,
          P.s(parameterList, F_ParameterList_CloseParenToken),
        ),
      );
    } else {
      decl.push(cswTok(P, P.s(parameterList, F_ParameterList_OpenParenToken)));
      decl.push(cswTok(P, P.s(parameterList, F_ParameterList_CloseParenToken)));
    }
    decl.push(D.ifBreak(DOC_NULL, DOC_SOFTLINE, -1));
  }
  if (initializer >= 0) {
    const colon = cswTokSfx(P, P.s(initializer, F_ConstructorInitializer_ColonToken), DOC_SPACE);
    const argList = D.group1(cswArgumentList(P, P.s(initializer, F_ConstructorInitializer_ArgumentList)));
    decl.push(
      D.group([
        D.indent1(DOC_HARDLINE),
        D.indent1(colon),
        cswTok(P, P.s(initializer, F_ConstructorInitializer_ThisOrBaseKeyword)),
        D.indent1(argList),
      ]),
    );
  }
  docs.push(D.group(decl));
  if (y === Y_MethodDeclaration || y === Y_LocalFunctionStatement) {
    docs.push(cswConstraintClauses(P, constraints));
  }
  if (body >= 0) {
    docs.push(cswBlock(P, body));
  } else if (exprBody >= 0) {
    docs.push(cswArrowExpressionClause(P, exprBody));
  }
  docs.push(cswTok(P, semicolon));
  return D.group(docs);
};

/** PrintMethodUnformattedWithoutAttributes: the method's text from the trivia at `from` on. */
const cswMethodUnformattedWithoutAttributes = (P: CsPrint, n: i32, attrs: i32, from: i32, docs: i32[]): void => {
  const a0 = P.at(attrs, 0);
  if (cswLeadB(P, a0) <= cswLeadA(P, a0)) {
    P.fail("an attribute without leading trivia before csharpier-ignore");
    return;
  }
  const trStart = P.lx.trStart;
  if (from < 0 || from >= trStart.length) {
    fault();
    return;
  }
  const s = cswTrimmedSrc(P, trStart[from], P.t.fullEnd(n));
  const buf = new CsBuf(256);
  cswAppendUnformatted(P, buf, cswDocA(P.D, s), cswDocB(P.D, s));
  const o = P.D.appendBytes(buf.buf, 0, buf.n);
  // an offset in the docs' text, so the sum fits
  const e = toI64(o) + toI64(buf.n);
  if (e > toI64(2147483647)) {
    fault();
    return;
  }
  docs.push(P.D.strAt(o, toI32(e), false));
};

const cswBaseFieldDeclaration = (P: CsPrint, n: i32): i32 => {
  const docs: i32[] = [];
  docs.push(cswAttributeLists(P, n, P.s(n, 0)));
  docs.push(cswModifiersSorted(P, P.s(n, 1)));
  let decl = P.s(n, F_FieldDeclaration_Declaration);
  let semi = P.s(n, F_FieldDeclaration_SemicolonToken);
  if (P.k(n) === K_EventFieldDeclaration) {
    docs.push(cswTokSfx(P, P.s(n, F_EventFieldDeclaration_EventKeyword), DOC_SPACE));
    decl = P.s(n, F_EventFieldDeclaration_Declaration);
    semi = P.s(n, F_EventFieldDeclaration_SemicolonToken);
  }
  docs.push(cswVariableDeclaration(P, decl));
  docs.push(cswTok(P, semi));
  return P.cc(docs);
};

const cswBasePropertyDeclaration = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const y = P.t.ty(n);
  let initializer = -1;
  let eis = -1;
  let eventKeyword = DOC_NULL;
  let exprBody = -1;
  let semicolon = -1;
  let type = -1;
  let accessorList = -1;
  if (y === Y_PropertyDeclaration) {
    exprBody = P.s(n, F_PropertyDeclaration_ExpressionBody);
    initializer = P.s(n, F_PropertyDeclaration_Initializer);
    eis = P.s(n, F_PropertyDeclaration_ExplicitInterfaceSpecifier);
    semicolon = P.s(n, F_PropertyDeclaration_SemicolonToken);
    type = P.s(n, F_PropertyDeclaration_Type);
    accessorList = P.s(n, F_PropertyDeclaration_AccessorList);
  } else if (y === Y_IndexerDeclaration) {
    exprBody = P.s(n, F_IndexerDeclaration_ExpressionBody);
    eis = P.s(n, F_IndexerDeclaration_ExplicitInterfaceSpecifier);
    semicolon = P.s(n, F_IndexerDeclaration_SemicolonToken);
    type = P.s(n, F_IndexerDeclaration_Type);
    accessorList = P.s(n, F_IndexerDeclaration_AccessorList);
  } else {
    eventKeyword = cswTokSfx(P, P.s(n, F_EventDeclaration_EventKeyword), DOC_SPACE);
    eis = P.s(n, F_EventDeclaration_ExplicitInterfaceSpecifier);
    semicolon = P.s(n, F_EventDeclaration_SemicolonToken);
    type = P.s(n, F_EventDeclaration_Type);
    accessorList = P.s(n, F_EventDeclaration_AccessorList);
  }
  const attrsDoc = cswAttributeLists(P, n, P.s(n, 0));
  const modsDoc = cswModifiersSorted(P, P.s(n, 1));
  const typeDoc = cswNode(P, type);
  const eisDoc = eis >= 0 ? cswExplicitInterfaceSpecifier(P, eis) : DOC_NULL;
  let idDoc = DOC_NULL;
  if (y === Y_PropertyDeclaration) {
    idDoc = cswTok(P, P.s(n, F_PropertyDeclaration_Identifier));
  } else if (y === Y_IndexerDeclaration) {
    idDoc = D.concat([
      cswTok(P, P.s(n, F_IndexerDeclaration_ThisKeyword)),
      cswNode(P, P.s(n, F_IndexerDeclaration_ParameterList)),
    ]);
  } else {
    idDoc = cswTok(P, P.s(n, F_EventDeclaration_Identifier));
  }
  const contents = cswPropertyContents(P, accessorList, exprBody);
  const initDoc = initializer >= 0 ? cswEqualsValueClause(P, initializer) : DOC_NULL;
  const semiDoc = cswTok(P, semicolon);
  return D.group1(
    D.concat([attrsDoc, modsDoc, eventKeyword, typeDoc, DOC_SPACE, eisDoc, idDoc, contents, initDoc, semiDoc]),
  );
};

const cswPropertyContents = (P: CsPrint, accessorList: i32, exprBody: i32): i32 => {
  const D = P.D;
  if (accessorList >= 0) {
    const accessors = P.s(accessorList, F_AccessorList_Accessors);
    const na = P.count(accessors);
    let sep = DOC_SPACE;
    for (let i = 0; i < na; i++) {
      const a = P.at(accessors, i);
      if (
        P.s(a, F_AccessorDeclaration_Body) >= 0 ||
        P.s(a, F_AccessorDeclaration_ExpressionBody) >= 0 ||
        P.count(P.s(a, F_AccessorDeclaration_Modifiers)) > 0 ||
        P.count(P.s(a, F_AccessorDeclaration_AttributeLists)) > 0
      ) {
        sep = DOC_LINE;
      }
    }
    const open = cswTok(P, P.s(accessorList, F_AccessorList_OpenBraceToken));
    const items: i32[] = [];
    for (let i = 0; i < na; i++) {
      items.push(cswAccessor(P, P.at(accessors, i), sep));
    }
    return D.group1(
      D.concat([sep, open, D.indent(items), sep, cswTok(P, P.s(accessorList, F_AccessorList_CloseBraceToken))]),
    );
  }
  if (exprBody >= 0) {
    return cswArrowExpressionClause(P, exprBody);
  }
  return P.str("");
};

const cswAccessor = (P: CsPrint, n: i32, sep: i32): i32 => {
  const docs: i32[] = [];
  const attrs = P.s(n, F_AccessorDeclaration_AttributeLists);
  const body = P.s(n, F_AccessorDeclaration_Body);
  const eb = P.s(n, F_AccessorDeclaration_ExpressionBody);
  let hard = P.count(attrs) > 1 || body >= 0 || eb >= 0;
  if (!hard && P.count(attrs) > 0) {
    const a0 = P.at(attrs, 0);
    const first = P.sel(P.s(a0, F_AttributeList_Attributes), 0);
    const al = P.s(first, F_Attribute_ArgumentList);
    if (al >= 0 && P.scount(P.s(al, F_AttributeArgumentList_Arguments)) > 0) {
      hard = true;
    }
  }
  docs.push(hard ? DOC_HARDLINE : sep);
  docs.push(cswAttributeLists(P, n, attrs));
  docs.push(cswModifiersSorted(P, P.s(n, F_AccessorDeclaration_Modifiers)));
  docs.push(cswTok(P, P.s(n, F_AccessorDeclaration_Keyword)));
  if (body >= 0) {
    docs.push(cswBlock(P, body));
  } else if (eb >= 0) {
    docs.push(cswArrowExpressionClause(P, eb));
  }
  docs.push(cswTok(P, P.s(n, F_AccessorDeclaration_SemicolonToken)));
  return P.cc(docs);
};

const cswDelegateDeclaration = (P: CsPrint, n: i32): i32 => {
  const docs: i32[] = [];
  docs.push(cswAttributeLists(P, n, P.s(n, F_DelegateDeclaration_AttributeLists)));
  docs.push(cswModifiersSorted(P, P.s(n, F_DelegateDeclaration_Modifiers)));
  docs.push(cswTokSfx(P, P.s(n, F_DelegateDeclaration_DelegateKeyword), DOC_SPACE));
  docs.push(cswNode(P, P.s(n, F_DelegateDeclaration_ReturnType)));
  docs.push(DOC_SPACE);
  docs.push(cswTok(P, P.s(n, F_DelegateDeclaration_Identifier)));
  const tpl = P.s(n, F_DelegateDeclaration_TypeParameterList);
  if (tpl >= 0) {
    docs.push(cswNode(P, tpl));
  }
  docs.push(cswNode(P, P.s(n, F_DelegateDeclaration_ParameterList)));
  docs.push(cswConstraintClauses(P, P.s(n, F_DelegateDeclaration_ConstraintClauses)));
  docs.push(cswTok(P, P.s(n, F_DelegateDeclaration_SemicolonToken)));
  return P.cc(docs);
};

const cswEnumMember = (P: CsPrint, n: i32): i32 => {
  const docs: i32[] = [];
  docs.push(cswAttributeLists(P, n, P.s(n, F_EnumMemberDeclaration_AttributeLists)));
  docs.push(cswModifiers(P, P.s(n, F_EnumMemberDeclaration_Modifiers)));
  docs.push(cswTok(P, P.s(n, F_EnumMemberDeclaration_Identifier)));
  const ev = P.s(n, F_EnumMemberDeclaration_EqualsValue);
  if (ev >= 0) {
    docs.push(cswEqualsValueClause(P, ev));
  }
  return P.cc(docs);
};

/** ParameterList.Print over a parameter list node with its brackets. */
export const cswParameterListLike = (P: CsPrint, n: i32, open: i32, params: i32, close: i32): i32 => {
  const D = P.D;
  return D.group([
    cswTok(P, open),
    P.scount(params) > 0
      ? D.concat([D.indent([DOC_SOFTLINE, cswSepList(P, params, SL_PARAMETER, DOC_LINE, 0, -1)]), DOC_SOFTLINE])
      : DOC_NULL,
    cswTok(P, close),
  ]);
};

export const cswParameterList = (P: CsPrint, n: i32): i32 =>
  cswParameterListLike(
    P,
    n,
    P.s(n, F_ParameterList_OpenParenToken),
    P.s(n, F_ParameterList_Parameters),
    P.s(n, F_ParameterList_CloseParenToken),
  );

export const cswParameter = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const attrs = P.s(n, F_Parameter_AttributeLists);
  const hasAttribute = P.count(attrs) > 0;
  const docs: i32[] = [];
  if (hasAttribute) {
    docs.push(cswAttributeLists(P, n, attrs));
    const p = P.par(n);
    if (
      P.count(attrs) < 2 &&
      (cswAnyCommentRange(P, cswLeadA(P, n), cswLeadB(P, n)) ||
        (P.k(p) === K_ParameterList && P.scount(P.s(p, F_ParameterList_Parameters)) === 0))
    ) {
      docs.push(DOC_SPACE);
    } else {
      docs.push(D.indent1(DOC_LINE));
    }
  }
  const mods = P.s(n, F_Parameter_Modifiers);
  if (P.count(mods) > 0) {
    docs.push(cswModifiers(P, mods));
  }
  const type = P.s(n, F_Parameter_Type);
  const id = P.s(n, F_Parameter_Identifier);
  if (type >= 0) {
    docs.push(cswNode(P, type));
    if (id >= 0) {
      docs.push(DOC_SPACE);
    }
  }
  docs.push(cswTok(P, id));
  const def = P.s(n, F_Parameter_Default);
  if (def >= 0) {
    docs.push(cswEqualsValueClause(P, def));
  }
  return hasAttribute ? D.group(docs) : D.concat(docs);
};

const cswAnyCommentRange = (P: CsPrint, a: i32, b: i32): boolean => {
  const trKind = P.lx.trKind;
  for (let i = a; i < b; i++) {
    if (i < 0 || i >= trKind.length) {
      fault();
      return false;
    }
    const k = trKind[i];
    if (
      k === K_SingleLineCommentTrivia ||
      k === K_MultiLineCommentTrivia ||
      k === K_SingleLineDocumentationCommentTrivia ||
      k === K_MultiLineDocumentationCommentTrivia
    ) {
      return true;
    }
  }
  return false;
};

export const cswTypeParameterList = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const params = P.s(n, F_TypeParameterList_Parameters);
  const np = P.scount(params);
  if (np === 0) {
    return DOC_NULL;
  }
  const more = np > 1 || P.count(P.s(P.sel(params, 0), F_TypeParameter_AttributeLists)) > 0;
  return D.group([
    cswTok(P, P.s(n, F_TypeParameterList_LessThanToken)),
    D.indent([more ? DOC_SOFTLINE : DOC_NULL, cswSepList(P, params, SL_TYPE_PARAMETER, DOC_LINE, 0, -1)]),
    more ? DOC_SOFTLINE : DOC_NULL,
    cswTok(P, P.s(n, F_TypeParameterList_GreaterThanToken)),
  ]);
};

export const cswTypeParameter = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const attrs = P.s(n, F_TypeParameter_AttributeLists);
  const hasAttribute = P.count(attrs) > 0;
  const gid = hasAttribute ? D.newGroupId() : -1;
  const variance = P.s(n, F_TypeParameter_VarianceKeyword);
  const result = D.concat([
    cswAttributeLists(P, n, attrs),
    hasAttribute ? D.indentIfBreak(DOC_LINE, gid) : DOC_NULL,
    variance >= 0 ? cswTokSfx(P, variance, DOC_SPACE) : DOC_NULL,
    cswTok(P, P.s(n, F_TypeParameter_Identifier)),
  ]);
  return hasAttribute ? D.groupWithId(gid, [result]) : result;
};

export const cswTypeParameterConstraintClause = (P: CsPrint, n: i32): i32 =>
  P.group([
    cswTokSfx(P, P.s(n, F_TypeParameterConstraintClause_WhereKeyword), DOC_SPACE),
    cswNode(P, P.s(n, F_TypeParameterConstraintClause_Name)),
    DOC_SPACE,
    cswTokSfx(P, P.s(n, F_TypeParameterConstraintClause_ColonToken), DOC_SPACE),
    P.D.indent1(cswSepList(P, P.s(n, F_TypeParameterConstraintClause_Constraints), SL_NODE, DOC_LINE, 0, -1)),
  ]);

export const cswExplicitInterfaceSpecifier = (P: CsPrint, n: i32): i32 =>
  P.cc([
    cswNode(P, P.s(n, F_ExplicitInterfaceSpecifier_Name)),
    cswTok(P, P.s(n, F_ExplicitInterfaceSpecifier_DotToken)),
  ]);

export const cswArrowExpressionClause = (P: CsPrint, n: i32): i32 =>
  P.D.group1(
    P.D.indent([
      DOC_SPACE,
      cswTokSfx(P, P.s(n, F_ArrowExpressionClause_ArrowToken), DOC_LINE),
      cswNode(P, P.s(n, F_ArrowExpressionClause_Expression)),
    ]),
  );

export const cswEqualsValueClause = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const value = P.s(n, F_EqualsValueClause_Value);
  let sep = DOC_LINE;
  const p = P.par(n);
  if (P.is(p, Y_PropertyDeclaration) && !P.is(value, Y_AnonymousObjectCreationExpression)) {
    // keeping the line
  } else if (P.is(value, Y_QueryExpression)) {
    sep = DOC_NULL;
  } else if (
    P.is(value, Y_AnonymousObjectCreationExpression) ||
    P.is(value, Y_AnonymousMethodExpression) ||
    P.is(value, Y_ConditionalExpression) ||
    P.is(value, Y_ObjectCreationExpression) ||
    P.is(value, Y_InitializerExpression) ||
    P.is(value, Y_ParenthesizedLambdaExpression) ||
    P.is(value, Y_InvocationExpression) ||
    P.is(value, Y_SwitchExpression)
  ) {
    sep = DOC_SPACE;
  }
  let result = D.group([DOC_SPACE, cswTokSfx(P, P.s(n, F_EqualsValueClause_EqualsToken), sep), cswNode(P, value)]);
  if (sep === DOC_LINE && P.k(value) !== K_CollectionExpression) {
    result = D.indent1(result);
  }
  return result;
};

export const cswNameEquals = (P: CsPrint, n: i32): i32 =>
  P.cc([cswNode(P, P.s(n, F_NameEquals_Name)), DOC_SPACE, cswTokSfx(P, P.s(n, F_NameEquals_EqualsToken), DOC_SPACE)]);

export const cswBaseExpressionColon = (P: CsPrint, n: i32): i32 => {
  const p = P.par(n);
  const isLine =
    P.is(p, Y_Subpattern) &&
    P.is(P.s(p, F_Subpattern_Pattern), Y_RecursivePattern) &&
    P.s(P.s(p, F_Subpattern_Pattern), F_RecursivePattern_Type) < 0;
  // NameColon has Name where ExpressionColon has Expression, both in slot 0
  return P.cc([cswNode(P, P.s(n, 0)), cswTokSfx(P, P.s(n, 1), isLine ? DOC_LINE : DOC_SPACE)]);
};

export const cswVariableDeclaration = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const vars = P.s(n, F_VariableDeclaration_Variables);
  const type = P.s(n, F_VariableDeclaration_Type);
  if (P.scount(vars) > 1) {
    return D.concat([
      cswNode(P, type),
      DOC_SPACE,
      D.indent1(cswSepList(P, vars, SL_VARIABLE, P.is(P.par(n), Y_ForStatement) ? DOC_LINE : DOC_HARDLINE, 0, -1)),
    ]);
  }
  const v = P.sel(vars, 0);
  const al = P.s(v, F_VariableDeclarator_ArgumentList);
  const left = D.concat([
    cswNode(P, type),
    DOC_SPACE,
    cswTok(P, P.s(v, F_VariableDeclarator_Identifier)),
    al >= 0 ? cswBracketedArgumentList(P, al) : DOC_NULL,
  ]);
  const init = P.s(v, F_VariableDeclarator_Initializer);
  if (init < 0) {
    return D.group1(left);
  }
  return cswRightHandSide(
    P,
    n,
    D.concat([left, DOC_SPACE]),
    cswTok(P, P.s(init, F_EqualsValueClause_EqualsToken)),
    P.s(init, F_EqualsValueClause_Value),
  );
};

export const cswVariableDeclarator = (P: CsPrint, n: i32): i32 => {
  const docs: i32[] = [cswTok(P, P.s(n, F_VariableDeclarator_Identifier))];
  const al = P.s(n, F_VariableDeclarator_ArgumentList);
  if (al >= 0) {
    docs.push(cswBracketedArgumentList(P, al));
  }
  const init = P.s(n, F_VariableDeclarator_Initializer);
  if (init >= 0) {
    docs.push(cswEqualsValueClause(P, init));
  }
  return P.cc(docs);
};

// ---- statements ----

export const cswBlock = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const stmts = P.s(n, F_Block_Statements);
  const ns = P.count(stmts);
  const p = P.par(n);
  const open = P.s(n, F_Block_OpenBraceToken);
  const close = P.s(n, F_Block_CloseBraceToken);
  if (ns === 0 && P.k(p) === K_MethodDeclaration && !cswTokHasComments(P, close)) {
    return D.concat([DOC_SPACE, cswTok(P, open), DOC_SPACE, cswTok(P, close)]);
  }
  const sep = P.is(p, Y_AccessorDeclaration) && ns <= 1 ? DOC_LINE : DOC_HARDLINE;
  let inner = DOC_NULL;
  if (ns > 0) {
    const statements = cswNodesRespectingRangeIgnore(P, stmts);
    inner = D.indent([sep, cswJoin(P, sep, statements)]);
    csdRemoveInitialDoubleHardLine(D, inner);
  }
  const pk = P.k(p);
  const result = D.group([
    P.is(p, Y_ParenthesizedLambdaExpression) || pk === K_Block || pk === K_GlobalStatement ? DOC_NULL : DOC_LINE,
    cswTok(P, open),
    ns === 0 ? DOC_SPACE : D.concat([inner, sep]),
    cswTok(P, close),
  ]);
  return pk === K_Block ? D.concat([cswExtraNewLines(P, n), result]) : result;
};

const cswExpressionStatement = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const semi = P.s(n, F_ExpressionStatement_SemicolonToken);
  let lead = cswLeadingTriviaTok(P, semi);
  const expr = P.s(n, F_ExpressionStatement_Expression);
  let trim = false;
  if (P.is(expr, Y_InvocationExpression) && cswDocKind(D, lead) === D_CONCAT) {
    const cl = D.count(lead);
    trim =
      cl > 1 && cswDocKind(D, D.at(lead, cl - 1)) === D_HARDLINE && cswDocKind(D, D.at(lead, 0)) === D_LEADING_COMMENT;
  }
  if (trim) {
    const db = D.b;
    // the count, above 1
    if (lead < 0 || lead >= db.length) {
      fault();
      return DOC_NULL;
    }
    const vb = db[lead];
    if (vb <= 0) {
      fault();
      return DOC_NULL;
    }
    db[lead] = vb - 1;
    lead = D.concat([D.indent1(lead), DOC_HARDLINE]);
  }
  return D.group([cswExtraNewLines(P, n), cswNode(P, expr), lead, cswTokNoLead(P, semi)]);
};

const cswLocalDeclarationStatement = (P: CsPrint, n: i32): i32 =>
  P.cc([
    cswExtraNewLines(P, n),
    cswTokSfx(P, P.s(n, F_LocalDeclarationStatement_AwaitKeyword), DOC_SPACE),
    cswTokSfx(P, P.s(n, F_LocalDeclarationStatement_UsingKeyword), DOC_SPACE),
    cswModifiers(P, P.s(n, F_LocalDeclarationStatement_Modifiers)),
    cswVariableDeclaration(P, P.s(n, F_LocalDeclarationStatement_Declaration)),
    cswTok(P, P.s(n, F_LocalDeclarationStatement_SemicolonToken)),
  ]);

const cswReturnStatement = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const e = P.s(n, F_ReturnStatement_Expression);
  const extra = cswExtraNewLines(P, n);
  const kw = cswTokSfx(P, P.s(n, F_ReturnStatement_ReturnKeyword), e >= 0 ? DOC_SPACE : DOC_NULL);
  let ed = DOC_NULL;
  if (e >= 0) {
    if ((P.is(e, Y_BinaryExpression) || P.is(e, Y_QueryExpression)) && !cswIsCoalesceWithNonBinaryLeft(P, e)) {
      ed = D.indent1(cswNode(P, e));
    } else {
      ed = cswNode(P, e);
    }
  }
  return D.group([extra, kw, ed, cswTok(P, P.s(n, F_ReturnStatement_SemicolonToken))]);
};

/** IfStatement.Print. */
const cswIfStatement = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const docs: i32[] = [];
  if (!P.pis(n, Y_ElseClause)) {
    docs.push(cswExtraNewLines(P, n));
  }
  docs.push(cswTok(P, P.s(n, F_IfStatement_IfKeyword)));
  docs.push(DOC_SPACE);
  docs.push(
    D.group([
      cswTok(P, P.s(n, F_IfStatement_OpenParenToken)),
      D.indent([D.ifBreak(DOC_SOFTLINE, DOC_NULL, -1), cswNode(P, P.s(n, F_IfStatement_Condition))]),
      D.ifBreak(DOC_SOFTLINE, DOC_NULL, -1),
    ]),
  );
  docs.push(cswTok(P, P.s(n, F_IfStatement_CloseParenToken)));
  docs.push(cswOptionalBraces(P, P.s(n, F_IfStatement_Statement)));
  const el = P.s(n, F_IfStatement_Else);
  if (el >= 0) {
    docs.push(DOC_HARDLINE);
    docs.push(cswNode(P, el));
  }
  return D.concat(docs);
};

const cswElseClause = (P: CsPrint, n: i32): i32 => {
  const st = P.s(n, F_ElseClause_Statement);
  const kw = cswTok(P, P.s(n, F_ElseClause_ElseKeyword));
  return P.cc([kw, P.k(st) === K_IfStatement ? P.cc([DOC_SPACE, cswIfStatement(P, st)]) : cswOptionalBraces(P, st)]);
};

const cswForStatement = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const decl = P.s(n, F_ForStatement_Declaration);
  const cond = P.s(n, F_ForStatement_Condition);
  const st = P.s(n, F_ForStatement_Statement);
  const extra = cswExtraNewLines(P, n);
  const head = D.group([
    cswTok(P, P.s(n, F_ForStatement_ForKeyword)),
    DOC_SPACE,
    cswTok(P, P.s(n, F_ForStatement_OpenParenToken)),
    D.group([
      D.indent([
        DOC_SOFTLINE,
        D.group([
          decl >= 0 ? cswVariableDeclaration(P, decl) : DOC_NULL,
          cswSepList(P, P.s(n, F_ForStatement_Initializers), SL_NODE, DOC_SPACE, 0, -1),
          cswTok(P, P.s(n, F_ForStatement_FirstSemicolonToken)),
        ]),
        cond >= 0 ? D.concat([DOC_LINE, cswNode(P, cond)]) : DOC_LINE,
        cswTok(P, P.s(n, F_ForStatement_SecondSemicolonToken)),
        DOC_LINE,
        D.group1(D.indent1(cswSepList(P, P.s(n, F_ForStatement_Incrementors), SL_NODE, DOC_LINE, 0, -1))),
      ]),
      DOC_SOFTLINE,
    ]),
    cswTok(P, P.s(n, F_ForStatement_CloseParenToken)),
  ]);
  const body = P.k(st) === K_ForStatement ? D.group([DOC_HARDLINE, cswForStatement(P, st)]) : cswOptionalBraces(P, st);
  return D.concat([extra, head, body]);
};

const cswForEach = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  let variable = DOC_NULL;
  let aw = -1;
  let fe = -1;
  let op = -1;
  let inK = -1;
  let ex = -1;
  let cp = -1;
  let st = -1;
  if (P.k(n) === K_ForEachStatement) {
    variable = D.concat([
      cswNode(P, P.s(n, F_ForEachStatement_Type)),
      DOC_SPACE,
      cswTok(P, P.s(n, F_ForEachStatement_Identifier)),
    ]);
    aw = P.s(n, F_ForEachStatement_AwaitKeyword);
    fe = P.s(n, F_ForEachStatement_ForEachKeyword);
    op = P.s(n, F_ForEachStatement_OpenParenToken);
    inK = P.s(n, F_ForEachStatement_InKeyword);
    ex = P.s(n, F_ForEachStatement_Expression);
    cp = P.s(n, F_ForEachStatement_CloseParenToken);
    st = P.s(n, F_ForEachStatement_Statement);
  } else {
    variable = cswNode(P, P.s(n, F_ForEachVariableStatement_Variable));
    aw = P.s(n, F_ForEachVariableStatement_AwaitKeyword);
    fe = P.s(n, F_ForEachVariableStatement_ForEachKeyword);
    op = P.s(n, F_ForEachVariableStatement_OpenParenToken);
    inK = P.s(n, F_ForEachVariableStatement_InKeyword);
    ex = P.s(n, F_ForEachVariableStatement_Expression);
    cp = P.s(n, F_ForEachVariableStatement_CloseParenToken);
    st = P.s(n, F_ForEachVariableStatement_Statement);
  }
  const extra = cswExtraNewLines(P, n);
  const head = D.group([
    cswTok(P, aw),
    aw >= 0 ? DOC_SPACE : DOC_NULL,
    cswTok(P, fe),
    DOC_SPACE,
    cswTok(P, op),
    D.group([D.indent([DOC_SOFTLINE, variable, DOC_SPACE, cswTok(P, inK), DOC_SPACE, cswNode(P, ex)]), DOC_SOFTLINE]),
    cswTok(P, cp),
  ]);
  const sk = P.k(st);
  const body =
    sk === K_ForEachStatement || sk === K_ForEachVariableStatement
      ? D.group([DOC_HARDLINE, cswForEach(P, st)])
      : cswOptionalBraces(P, st);
  return D.concat([extra, head, body]);
};

const cswWhileStatement = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const st = P.s(n, F_WhileStatement_Statement);
  const extra = cswExtraNewLines(P, n);
  const head = D.group([
    cswTok(P, P.s(n, F_WhileStatement_WhileKeyword)),
    DOC_SPACE,
    cswTok(P, P.s(n, F_WhileStatement_OpenParenToken)),
    D.group([D.indent([DOC_SOFTLINE, cswNode(P, P.s(n, F_WhileStatement_Condition))]), DOC_SOFTLINE]),
    cswTok(P, P.s(n, F_WhileStatement_CloseParenToken)),
  ]);
  const body =
    P.k(st) === K_WhileStatement ? D.group([DOC_HARDLINE, cswWhileStatement(P, st)]) : cswOptionalBraces(P, st);
  return D.concat([extra, head, body]);
};

const cswDoStatement = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const st = P.s(n, F_DoStatement_Statement);
  const isBlock = P.k(st) === K_Block;
  return D.concat([
    cswExtraNewLines(P, n),
    cswTokSfx(P, P.s(n, F_DoStatement_DoKeyword), !isBlock ? DOC_SPACE : DOC_NULL),
    cswNode(P, st),
    isBlock ? DOC_SPACE : DOC_HARDLINE,
    cswTokSfx(P, P.s(n, F_DoStatement_WhileKeyword), DOC_SPACE),
    cswTok(P, P.s(n, F_DoStatement_OpenParenToken)),
    D.group([D.indent([DOC_SOFTLINE, cswNode(P, P.s(n, F_DoStatement_Condition))]), DOC_SOFTLINE]),
    cswTok(P, P.s(n, F_DoStatement_CloseParenToken)),
    cswTok(P, P.s(n, F_DoStatement_SemicolonToken)),
  ]);
};

const cswSwitchStatement = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const secs = P.s(n, F_SwitchStatement_Sections);
  const nsec = P.count(secs);
  let sections = DOC_SPACE;
  if (nsec > 0) {
    const parts: i32[] = [];
    for (let i = 0; i < nsec; i++) {
      if (i > 0) {
        parts.push(DOC_HARDLINE);
      }
      parts.push(cswSwitchSection(P, P.at(secs, i)));
    }
    const joined = nsec === 1 ? cswFirstDoc(parts) : D.concat(parts);
    sections = D.concat([D.indent1(D.concat([DOC_HARDLINE, joined])), DOC_HARDLINE]);
  }
  csdRemoveInitialDoubleHardLine(D, sections);
  const gid = D.newGroupId();
  return D.concat([
    cswExtraNewLines(P, n),
    D.group([
      cswTok(P, P.s(n, F_SwitchStatement_SwitchKeyword)),
      DOC_SPACE,
      cswTok(P, P.s(n, F_SwitchStatement_OpenParenToken)),
      D.groupWithId(gid, [D.indent([DOC_SOFTLINE, cswNode(P, P.s(n, F_SwitchStatement_Expression))]), DOC_SOFTLINE]),
      cswTok(P, P.s(n, F_SwitchStatement_CloseParenToken)),
      nsec === 0 ? DOC_SPACE : DOC_LINE,
      cswTok(P, P.s(n, F_SwitchStatement_OpenBraceToken)),
      sections,
      cswTok(P, P.s(n, F_SwitchStatement_CloseBraceToken)),
    ]),
  ]);
};

const cswSwitchSection = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const docs: i32[] = [];
  docs.push(cswJoinNodes(P, DOC_HARDLINE, P.s(n, F_SwitchSection_Labels)));
  const stmts = P.s(n, F_SwitchSection_Statements);
  if (P.count(stmts) === 1 && P.k(P.at(stmts, 0)) === K_Block) {
    docs.push(cswBlock(P, P.at(stmts, 0)));
  } else {
    const statements = cswNodesRespectingRangeIgnore(P, stmts);
    docs.push(
      D.indent([P.k(P.at(stmts, 0)) === K_Block ? DOC_NULL : DOC_HARDLINE, cswJoin(P, DOC_HARDLINE, statements)]),
    );
  }
  return D.concat(docs);
};

export const cswWhenClause = (P: CsPrint, n: i32): i32 => {
  const p = P.par(n);
  const isSpace = P.k(p) === K_SwitchExpressionArm && P.k(P.s(p, F_SwitchExpressionArm_Pattern)) === K_DiscardPattern;
  return P.D.group1(
    P.D.indent([
      isSpace ? DOC_SPACE : DOC_LINE,
      cswTokSfx(P, P.s(n, F_WhenClause_WhenKeyword), DOC_SPACE),
      cswNode(P, P.s(n, F_WhenClause_Condition)),
    ]),
  );
};

const cswTryStatement = (P: CsPrint, n: i32): i32 => {
  const docs: i32[] = [];
  docs.push(cswExtraNewLines(P, n));
  docs.push(cswAttributeLists(P, n, P.s(n, F_TryStatement_AttributeLists)));
  docs.push(cswTok(P, P.s(n, F_TryStatement_TryKeyword)));
  docs.push(cswBlock(P, P.s(n, F_TryStatement_Block)));
  const catches = P.s(n, F_TryStatement_Catches);
  const nc = P.count(catches);
  docs.push(nc > 0 ? DOC_HARDLINE : DOC_NULL);
  if (nc === 0) {
    docs.push(DOC_NULL);
  } else if (nc === 1) {
    docs.push(cswCatchClause(P, P.at(catches, 0)));
  } else {
    const parts: i32[] = [];
    for (let i = 0; i < nc; i++) {
      if (i > 0) {
        parts.push(DOC_HARDLINE);
      }
      parts.push(cswCatchClause(P, P.at(catches, i)));
    }
    docs.push(P.cc(parts));
  }
  const fin = P.s(n, F_TryStatement_Finally);
  if (fin >= 0) {
    docs.push(DOC_HARDLINE);
    docs.push(P.cc([cswTok(P, P.s(fin, F_FinallyClause_FinallyKeyword)), cswNode(P, P.s(fin, F_FinallyClause_Block))]));
  }
  return P.cc(docs);
};

const cswCatchClause = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const decl = P.s(n, F_CatchClause_Declaration);
  const filter = P.s(n, F_CatchClause_Filter);
  const kw = cswTok(P, P.s(n, F_CatchClause_CatchKeyword));
  let declDoc = DOC_NULL;
  if (decl >= 0) {
    const id = P.s(decl, F_CatchDeclaration_Identifier);
    declDoc = D.concat([
      DOC_SPACE,
      cswTok(P, P.s(decl, F_CatchDeclaration_OpenParenToken)),
      cswNode(P, P.s(decl, F_CatchDeclaration_Type)),
      id >= 0 ? DOC_SPACE : DOC_NULL,
      cswTok(P, id),
      cswTok(P, P.s(decl, F_CatchDeclaration_CloseParenToken)),
    ]);
  }
  let filterDoc = DOC_NULL;
  if (filter >= 0) {
    filterDoc = D.indent([
      DOC_LINE,
      cswTokSfx(P, P.s(filter, F_CatchFilterClause_WhenKeyword), DOC_SPACE),
      cswTok(P, P.s(filter, F_CatchFilterClause_OpenParenToken)),
      D.group([D.indent1(cswNode(P, P.s(filter, F_CatchFilterClause_FilterExpression))), DOC_SOFTLINE]),
      cswTok(P, P.s(filter, F_CatchFilterClause_CloseParenToken)),
    ]);
  }
  return D.concat([kw, D.group([declDoc, filterDoc]), cswBlock(P, P.s(n, F_CatchClause_Block))]);
};

const cswUsingStatement = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const docs: i32[] = [];
  docs.push(cswExtraNewLines(P, n));
  const aw = P.s(n, F_UsingStatement_AwaitKeyword);
  const decl = P.s(n, F_UsingStatement_Declaration);
  const ex = P.s(n, F_UsingStatement_Expression);
  docs.push(
    D.group([
      cswTok(P, aw),
      aw >= 0 ? DOC_SPACE : DOC_NULL,
      cswTok(P, P.s(n, F_UsingStatement_UsingKeyword)),
      DOC_SPACE,
      cswTok(P, P.s(n, F_UsingStatement_OpenParenToken)),
      D.group([
        D.indent([
          DOC_SOFTLINE,
          decl >= 0 ? cswVariableDeclaration(P, decl) : DOC_NULL,
          ex >= 0 ? cswNode(P, ex) : DOC_NULL,
        ]),
        DOC_SOFTLINE,
      ]),
      cswTok(P, P.s(n, F_UsingStatement_CloseParenToken)),
      D.ifBreak(DOC_NULL, DOC_SOFTLINE, -1),
    ]),
  );
  const st = P.s(n, F_UsingStatement_Statement);
  if (P.k(st) === K_UsingStatement) {
    docs.push(DOC_HARDLINE);
    docs.push(cswNode(P, st));
  } else if (P.k(st) === K_Block) {
    docs.push(cswBlock(P, st));
  } else {
    docs.push(D.indent([DOC_HARDLINE, cswNode(P, st)]));
  }
  return D.concat(docs);
};

const cswLockStatement = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const st = P.s(n, F_LockStatement_Statement);
  const statement = cswNode(P, st);
  return D.concat([
    cswExtraNewLines(P, n),
    cswTokSfx(P, P.s(n, F_LockStatement_LockKeyword), DOC_SPACE),
    cswTok(P, P.s(n, F_LockStatement_OpenParenToken)),
    cswNode(P, P.s(n, F_LockStatement_Expression)),
    cswTok(P, P.s(n, F_LockStatement_CloseParenToken)),
    P.k(st) === K_Block ? statement : D.indent([DOC_HARDLINE, statement]),
  ]);
};

const cswFixedStatement = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const st = P.s(n, F_FixedStatement_Statement);
  const extra = cswExtraNewLines(P, n);
  const head = D.group([
    cswTok(P, P.s(n, F_FixedStatement_FixedKeyword)),
    DOC_SPACE,
    cswTok(P, P.s(n, F_FixedStatement_OpenParenToken)),
    D.group([D.indent([DOC_SOFTLINE, cswNode(P, P.s(n, F_FixedStatement_Declaration))]), DOC_SOFTLINE]),
    cswTok(P, P.s(n, F_FixedStatement_CloseParenToken)),
    D.ifBreak(DOC_NULL, DOC_SOFTLINE, -1),
  ]);
  const body =
    P.k(st) === K_Block
      ? cswBlock(P, st)
      : D.indentIf(P.k(st) !== K_FixedStatement, D.concat([DOC_HARDLINE, cswNode(P, st)]));
  return D.concat([extra, head, body]);
};

const cswLabeledStatement = (P: CsPrint, n: i32): i32 => {
  const docs: i32[] = [];
  docs.push(cswExtraNewLines(P, n));
  docs.push(cswAttributeLists(P, n, P.s(n, F_LabeledStatement_AttributeLists)));
  docs.push(cswTok(P, P.s(n, F_LabeledStatement_Identifier)));
  docs.push(cswTok(P, P.s(n, F_LabeledStatement_ColonToken)));
  const st = P.s(n, F_LabeledStatement_Statement);
  if (P.k(st) === K_Block) {
    docs.push(cswBlock(P, st));
  } else {
    docs.push(DOC_HARDLINE);
    docs.push(cswNode(P, st));
  }
  return P.cc(docs);
};

// these live with the expressions
