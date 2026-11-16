// Parsing of the compilation unit, namespaces, usings, attributes, modifiers
// and type members.
//
// Ported from Roslyn's LanguageParser.cs (MIT License, Copyright the .NET
// Foundation and Contributors), for CSharpier 1.4.0 (MIT License, Copyright
// (c) 2021 Bela VanderVoort).

import {
  K_AbstractKeyword,
  K_AccessorList,
  K_AddAccessorDeclaration,
  K_AddKeyword,
  K_AliasKeyword,
  K_AliasQualifiedName,
  K_AllowsConstraintClause,
  K_AllowsKeyword,
  K_AmpersandEqualsToken,
  K_AmpersandToken,
  K_ArgListKeyword,
  K_Argument,
  K_ArrayType,
  K_ArrowExpressionClause,
  K_AsteriskEqualsToken,
  K_AsteriskToken,
  K_AsyncKeyword,
  K_Attribute,
  K_AttributeArgument,
  K_AttributeArgumentList,
  K_AttributeList,
  K_AttributeTargetSpecifier,
  K_BarEqualsToken,
  K_BarToken,
  K_BaseConstructorInitializer,
  K_BaseKeyword,
  K_BaseList,
  K_BracketedArgumentList,
  K_BracketedParameterList,
  K_CaretEqualsToken,
  K_CaretToken,
  K_CheckedKeyword,
  K_ClassConstraint,
  K_ClassDeclaration,
  K_ClassKeyword,
  K_CloseBraceToken,
  K_CloseBracketToken,
  K_CloseParenToken,
  K_ColonColonToken,
  K_ColonToken,
  K_CommaToken,
  K_CompilationUnit,
  K_ConstKeyword,
  K_ConstructorConstraint,
  K_ConstructorDeclaration,
  K_ConversionOperatorDeclaration,
  K_DefaultConstraint,
  K_DefaultKeyword,
  K_DelegateDeclaration,
  K_DelegateKeyword,
  K_DestructorDeclaration,
  K_DotDotToken,
  K_DotToken,
  K_EndOfFileToken,
  K_EnumDeclaration,
  K_EnumKeyword,
  K_EnumMemberDeclaration,
  K_EqualsEqualsToken,
  K_EqualsGreaterThanToken,
  K_EqualsToken,
  K_EqualsValueClause,
  K_EventDeclaration,
  K_EventFieldDeclaration,
  K_EventKeyword,
  K_ExclamationEqualsToken,
  K_ExclamationToken,
  K_ExplicitInterfaceSpecifier,
  K_ExplicitKeyword,
  K_ExpressionStatement,
  K_ExtensionBlockDeclaration,
  K_ExtensionKeyword,
  K_ExternAliasDirective,
  K_ExternKeyword,
  K_FalseKeyword,
  K_FieldDeclaration,
  K_FileKeyword,
  K_FileScopedNamespaceDeclaration,
  K_FixedKeyword,
  K_GetAccessorDeclaration,
  K_GetKeyword,
  K_GlobalKeyword,
  K_GlobalStatement,
  K_GreaterThanEqualsToken,
  K_GreaterThanGreaterThanEqualsToken,
  K_GreaterThanGreaterThanGreaterThanEqualsToken,
  K_GreaterThanGreaterThanGreaterThanToken,
  K_GreaterThanGreaterThanToken,
  K_GreaterThanToken,
  K_IdentifierName,
  K_IdentifierToken,
  K_ImplicitKeyword,
  K_InKeyword,
  K_IndexerDeclaration,
  K_InitAccessorDeclaration,
  K_InitKeyword,
  K_InterfaceDeclaration,
  K_InterfaceKeyword,
  K_InternalKeyword,
  K_LessThanEqualsToken,
  K_LessThanLessThanEqualsToken,
  K_LessThanLessThanToken,
  K_LessThanToken,
  K_LocalFunctionStatement,
  K_MethodDeclaration,
  K_MinusEqualsToken,
  K_MinusGreaterThanToken,
  K_MinusMinusToken,
  K_MinusToken,
  K_NameColon,
  K_NameEquals,
  K_NamespaceDeclaration,
  K_NamespaceKeyword,
  K_NewKeyword,
  K_OpenBraceToken,
  K_OpenBracketToken,
  K_OpenParenToken,
  K_OperatorDeclaration,
  K_OperatorKeyword,
  K_OutKeyword,
  K_Parameter,
  K_ParameterList,
  K_ParamsKeyword,
  K_PartialKeyword,
  K_PercentEqualsToken,
  K_PercentToken,
  K_PlusEqualsToken,
  K_PlusPlusToken,
  K_PlusToken,
  K_PrimaryConstructorBaseType,
  K_PrivateKeyword,
  K_PropertyDeclaration,
  K_ProtectedKeyword,
  K_PublicKeyword,
  K_QualifiedName,
  K_QuestionToken,
  K_ReadOnlyKeyword,
  K_RecordDeclaration,
  K_RecordKeyword,
  K_RecordStructDeclaration,
  K_RefExpression,
  K_RefKeyword,
  K_RefStructConstraint,
  K_RefType,
  K_RemoveAccessorDeclaration,
  K_RemoveKeyword,
  K_ScopedKeyword,
  K_ScopedType,
  K_SemicolonToken,
  K_SetAccessorDeclaration,
  K_SetKeyword,
  K_SimpleBaseType,
  K_SlashEqualsToken,
  K_SlashToken,
  K_StaticKeyword,
  K_StructConstraint,
  K_StructDeclaration,
  K_StructKeyword,
  K_ThisConstructorInitializer,
  K_ThisKeyword,
  K_TildeToken,
  K_TrueKeyword,
  K_TypeConstraint,
  K_TypeParameter,
  K_TypeParameterConstraintClause,
  K_TypeParameterList,
  K_UncheckedKeyword,
  K_UnionDeclaration,
  K_UnionKeyword,
  K_UnsafeKeyword,
  K_UsingDirective,
  K_UsingKeyword,
  K_VariableDeclaration,
  K_VariableDeclarator,
  K_VoidKeyword,
  K_WhereKeyword,
} from "./kinds";
import {
  CsParser,
  MOD_ASYNC,
  MOD_CONTEXTUAL,
  MOD_PARTIAL,
  MOD_REF,
  NO_IN_TYPE_LIST,
  PT_NORMAL,
  PT_PARAMETER,
  ST_NOT_TYPE,
  csIsPredefinedType,
  cspIdentifierName,
  cspIdentifierToken,
  cspIsCurrentTokenDefinitelyPartialModifier,
  cspIsCurrentTokenWhereOfConstraintClause,
  cspIsFunctionPointerStart,
  cspIsPossibleMemberName,
  cspIsPossibleType,
  cspIsTrueIdentifier,
  cspIsTypeDeclarationStart,
  cspIsTypeFollowedByMemberName,
  cspIsTypeModifierOrTypeKeyword,
  cspIsTypeOrNamespaceDeclarationStart,
  cspModifierKind,
  cspQualifiedName,
  cspScanType,
  cspSimpleName,
  cspType,
  cspTypeOrVoid,
  csIsLiteralToken,
  cspArrayRankSpecifier,
  cspScanNamedTypePartPublic,
} from "./parser";
import {
  cspBlock,
  cspLocalDeclarationStatement,
  cspStatementCore,
  cspIsPossibleStatement,
  cspTryLocalFunctionBody,
} from "./pstmt";
import {
  cspArgumentList,
  cspArrayInitializer,
  cspExpressionCore,
  cspIsPossibleExpression,
  cspCanStartExpression,
  cspPossibleRefExpression,
  cspIsPossibleLambdaExpression,
  cspBracketedArgumentList,
  cspIsNamedAssignment,
  cspIsPossibleNewExpression,
  cspIsAnonymousDelegateExpression,
} from "./pexpr";

/** The compilation unit. */
export const cspCompilationUnit = (p: CsParser): i32 => {
  const ex = p.sp();
  const exl = cspNamespaceBody(p, K_CompilationUnit);
  if (p.err) {
    return -1;
  }
  if (p.k() !== K_EndOfFileToken) {
    p.fail("end of file expected");
    return -1;
  }
  // cspNamespaceBody pushed four lists
  if (exl < 0) {
    return -1;
  }
  p.push(p.eat());
  return p.node(K_CompilationUnit, ex);
};

// Parts in their order (NamespaceParts).
const NP_NONE: i32 = 0;
const NP_EXTERNS: i32 = 1;
const NP_USINGS: i32 = 2;
const NP_GLOBAL_ATTRIBUTES: i32 = 3;
const NP_MEMBERS: i32 = 4;

/**
 * Parses a namespace body and pushes its lists: for the compilation unit
 * Externs, Usings, AttributeLists, Members; for a namespace Externs, Usings, Members.
 */
const cspNamespaceBody = (p: CsParser, parentKind: i32): i32 => {
  const isGlobal = parentKind === K_CompilationUnit;
  const externs: i32[] = [];
  const usings: i32[] = [];
  const attrs: i32[] = [];
  const members: i32[] = [];
  let seen = NP_NONE;
  while (!p.err) {
    const k = p.k();
    if (k === K_NamespaceKeyword) {
      const m0 = p.sp();
      p.push(p.list(p.sp()));
      p.push(p.list(p.sp()));
      members.push(cspNamespaceDeclaration(p, m0));
      seen = NP_MEMBERS;
      continue;
    }
    if (k === K_CloseBraceToken) {
      if (isGlobal) {
        p.fail("unexpected }");
      }
      break;
    }
    if (k === K_EndOfFileToken) {
      break;
    }
    if (k === K_ExternKeyword && cspScanExternAliasDirective(p)) {
      if (seen > NP_EXTERNS) {
        p.fail("extern after elements");
        break;
      }
      externs.push(cspExternAliasDirective(p));
      seen = NP_EXTERNS;
      continue;
    }
    if (k === K_UsingKeyword || (k === K_IdentifierToken && p.ck() === K_GlobalKeyword && p.kindAt(1) === K_UsingKeyword)) {
      if (k === K_UsingKeyword && isGlobal && (p.kindAt(1) === K_OpenParenToken || cspIsPossibleTopLevelUsingLocalDeclarationStatement(p))) {
        // a top-level using statement
      } else {
        if (seen > NP_USINGS) {
          p.fail("using after elements");
          break;
        }
        usings.push(cspUsingDirective(p));
        seen = NP_USINGS;
        continue;
      }
    }
    if (k === K_OpenBracketToken && cspIsPossibleGlobalAttributeDeclaration(p)) {
      const a = cspTryAttributeDeclaration(p, isGlobal);
      if (a >= 0) {
        if (!isGlobal || seen > NP_GLOBAL_ATTRIBUTES) {
          p.fail("global attributes not first");
          break;
        }
        attrs.push(a);
        seen = NP_GLOBAL_ATTRIBUTES;
        continue;
      }
    }
    const mem = isGlobal ? cspMemberDeclarationOrStatement(p) : cspMemberDeclaration(p, parentKind);
    if (mem < 0) {
      if (!p.err) {
        p.fail("member expected");
      }
      break;
    }
    members.push(mem);
    seen = NP_MEMBERS;
  }
  const lm = p.sp();
  for (const e of externs) {
    p.push(e);
  }
  p.push(p.list(lm));
  const um = p.sp();
  for (const u of usings) {
    p.push(u);
  }
  p.push(p.list(um));
  if (isGlobal) {
    const am = p.sp();
    for (const a of attrs) {
      p.push(a);
    }
    p.push(p.list(am));
  }
  const mm = p.sp();
  for (const x of members) {
    p.push(x);
  }
  p.push(p.list(mm));
  return 0;
};

const cspScanExternAliasDirective = (p: CsParser): boolean =>
  p.k() === K_ExternKeyword &&
  p.kindAt(1) === K_IdentifierToken &&
  p.ckAt(1) === K_AliasKeyword &&
  p.kindAt(2) === K_IdentifierToken &&
  p.kindAt(3) === K_SemicolonToken;

const cspExternAliasDirective = (p: CsParser): i32 => {
  const m = p.sp();
  p.push(p.expect(K_ExternKeyword));
  p.push(p.eatContextual(K_AliasKeyword));
  p.push(cspIdentifierToken(p));
  p.push(p.expect(K_SemicolonToken));
  return p.node(K_ExternAliasDirective, m);
};

export const cspNameEquals = (p: CsParser): i32 => {
  const m = p.sp();
  p.push(cspIdentifierName(p));
  p.push(p.expect(K_EqualsToken));
  return p.node(K_NameEquals, m);
};

const cspUsingDirective = (p: CsParser): i32 => {
  const m = p.sp();
  if (p.k() === K_IdentifierToken && p.ck() === K_GlobalKeyword) {
    p.push(p.eatContextual(K_GlobalKeyword));
  } else {
    p.push(-1);
  }
  p.push(p.expect(K_UsingKeyword));
  const st = p.tryEat(K_StaticKeyword);
  const un = p.tryEat(K_UnsafeKeyword);
  if (st < 0 && un >= 0 && p.k() === K_StaticKeyword) {
    p.fail("static after unsafe");
    return -1;
  }
  p.push(st);
  p.push(un);
  const alias = cspIsNamedAssignment(p) ? cspNameEquals(p) : -1;
  p.push(alias);
  p.push(alias < 0 ? cspQualifiedName(p, 0) : cspType(p, PT_NORMAL));
  p.push(p.expect(K_SemicolonToken));
  return p.node(K_UsingDirective, m);
};

const cspIsPossibleTopLevelUsingLocalDeclarationStatement = (p: CsParser): boolean => {
  // using var x = ...; or using Type x = ...;
  if (p.k() !== K_UsingKeyword) {
    return false;
  }
  const m = p.mark();
  p.eat();
  let r = false;
  if (p.k() === K_IdentifierToken && p.kindAt(1) === K_IdentifierToken && p.kindAt(2) === K_EqualsToken) {
    r = true;
  } else {
    const st = cspScanType(p, PT_NORMAL);
    r = st !== ST_NOT_TYPE && p.k() === K_IdentifierToken && (p.kindAt(1) === K_EqualsToken || p.kindAt(1) === K_SemicolonToken || p.kindAt(1) === K_CommaToken);
    if (st !== ST_NOT_TYPE && (p.k() === K_EqualsToken || p.k() === K_SemicolonToken)) {
      r = false;
    }
  }
  p.reset(m);
  return r;
};

// ---- attributes ----

const cspIsGlobalAttributeTarget = (p: CsParser, i: i32): boolean => {
  const t = p.tokAt(i);
  if (p.kindAt(i) !== K_IdentifierToken) {
    return false;
  }
  return p.t.tokIs(t, "assembly") || p.t.tokIs(t, "module");
};

const cspIsPossibleGlobalAttributeDeclaration = (p: CsParser): boolean =>
  p.k() === K_OpenBracketToken && cspIsGlobalAttributeTarget(p, 1) && p.kindAt(2) === K_ColonToken;

const cspIsSomeWord = (k: i32): boolean => k === K_IdentifierToken || (k >= 8304 && k <= 8384);

const cspIsAttributeTarget = (p: CsParser): boolean => cspIsSomeWord(p.k()) && p.kindAt(1) === K_ColonToken;

export const cspIsPossibleAttributeDeclaration = (p: CsParser): boolean => {
  if (p.k() !== K_OpenBracketToken) {
    return false;
  }
  const m = p.mark();
  p.eat();
  let r = true;
  if (cspIsTrueIdentifier(p)) {
    r = true;
  } else if (cspIsAttributeTarget(p)) {
    r = true;
  } else if (csIsLiteralToken(p.k())) {
    r = false;
  }
  p.reset(m);
  return r;
};

/** Parses attribute lists and pushes the list. */
export const cspAttributeDeclarations = (p: CsParser, inExpressionContext: boolean): i32 => {
  const m = p.sp();
  while (cspIsPossibleAttributeDeclaration(p) && !p.err) {
    const a = cspTryAttributeDeclaration(p, inExpressionContext);
    if (a < 0) {
      break;
    }
    p.push(a);
  }
  return p.list(m);
};

export const cspTryAttributeDeclaration = (p: CsParser, inExpressionContext: boolean): i32 => {
  const rp = p.mark();
  const m = p.sp();
  p.push(p.expect(K_OpenBracketToken));
  if (cspIsAttributeTarget(p)) {
    const tm = p.sp();
    const id = p.eat();
    if (p.lx.kind[id] === K_IdentifierToken && p.lx.ck[id] !== 0) {
      p.convert(id, p.lx.ck[id]);
    }
    p.push(id);
    p.push(p.expect(K_ColonToken));
    p.push(p.node(K_AttributeTargetSpecifier, tm));
  } else {
    p.push(-1);
  }
  const lm = p.sp();
  // requireOneElement, allowTrailingSeparator
  p.push(cspAttribute(p));
  while (p.k() === K_CommaToken && !p.err) {
    p.push(p.eat());
    if (p.k() === K_CloseBracketToken) {
      break;
    }
    p.push(cspAttribute(p));
  }
  p.push(p.list(lm));
  p.push(p.expect(K_CloseBracketToken));
  if (inExpressionContext) {
    const k = p.k();
    if (k === K_DotToken || k === K_MinusGreaterThanToken || (k === K_QuestionToken && p.kindAt(1) === K_DotToken)) {
      p.reset(rp);
      return -1;
    }
  }
  return p.node(K_AttributeList, m);
};

const cspAttribute = (p: CsParser): i32 => {
  if (!cspIsTrueIdentifier(p)) {
    p.fail("attribute expected");
    return -1;
  }
  const m = p.sp();
  p.push(cspQualifiedName(p, 0));
  p.push(cspAttributeArgumentList(p));
  return p.node(K_Attribute, m);
};

const cspAttributeArgumentList = (p: CsParser): i32 => {
  if (p.k() !== K_OpenParenToken) {
    return -1;
  }
  const m = p.sp();
  p.push(p.eat());
  const lm = p.sp();
  if (p.k() !== K_CloseParenToken) {
    p.push(cspAttributeArgument(p));
    while (p.k() === K_CommaToken && !p.err) {
      p.push(p.eat());
      p.push(cspAttributeArgument(p));
    }
  }
  p.push(p.list(lm));
  p.push(p.expect(K_CloseParenToken));
  return p.node(K_AttributeArgumentList, m);
};

const cspAttributeArgument = (p: CsParser): i32 => {
  const m = p.sp();
  let ne = -1;
  let nc = -1;
  if (p.k() === K_IdentifierToken) {
    const k1 = p.kindAt(1);
    if (k1 === K_EqualsToken) {
      ne = cspNameEquals(p);
    } else if (k1 === K_ColonToken) {
      const cm = p.sp();
      p.push(cspIdentifierName(p));
      p.push(p.expect(K_ColonToken));
      nc = p.node(K_NameColon, cm);
    }
  }
  p.push(ne);
  p.push(nc);
  p.push(cspExpressionCore(p));
  return p.node(K_AttributeArgument, m);
};

// ---- modifiers ----

/** ShouldContextualKeywordBeTreatedAsModifier. */
const cspShouldContextualKeywordBeTreatedAsModifier = (p: CsParser, parsingStatementNotDeclaration: boolean): boolean => {
  // IsNonContextualModifier(PeekToken(1))
  const k1 = p.kindAt(1);
  if (k1 !== K_IdentifierToken && cspModifierKind(k1, p.ckAt(1)) !== 0) {
    return true;
  }
  const m = p.mark();
  p.eat();
  let r = false;
  if (!parsingStatementNotDeclaration && cspIsCurrentTokenDefinitelyPartialModifier(p, false)) {
    r = true;
  } else if (
    !parsingStatementNotDeclaration &&
    (cspIsTypeModifierOrTypeKeyword(p.k()) ||
      p.k() === K_EventKeyword ||
      ((p.k() === K_ExplicitKeyword || p.k() === K_ImplicitKeyword) && p.kindAt(1) === K_OperatorKeyword))
  ) {
    r = true;
  } else if (cspScanType(p, PT_NORMAL) !== ST_NOT_TYPE) {
    const k = p.k();
    if (cspIsPossibleMemberName(p)) {
      r = true;
    } else if (k === K_EndOfFileToken || k === K_CloseBraceToken) {
      r = true;
    } else if (csIsPredefinedType(k)) {
      r = true;
    } else if (k !== K_IdentifierToken && cspModifierKind(k, p.ck()) !== 0) {
      r = true;
    } else if (cspIsTypeOrNamespaceDeclarationStart(p)) {
      r = true;
    } else if (!parsingStatementNotDeclaration && k === K_OperatorKeyword) {
      r = true;
    }
  }
  p.reset(m);
  return r;
};

/** ParseModifiers: pushes modifier tokens (the caller makes the list); answers isPossibleTypeDeclaration. */
export const cspModifiers = (p: CsParser, forTopLevelStatements: boolean): boolean => {
  let isPossibleTypeDeclaration = true;
  while (!p.err) {
    const mod = cspModifierKind(p.k(), p.ck());
    if (mod === 0) {
      if (cspIsDefiniteScopedModifier(p, false, false)) {
        isPossibleTypeDeclaration = false;
        p.push(p.eatContextual(K_ScopedKeyword));
      }
      break;
    }
    if (mod === MOD_PARTIAL) {
      if (!cspIsCurrentTokenDefinitelyPartialModifier(p, false)) {
        return isPossibleTypeDeclaration;
      }
      if (p.k() === K_IdentifierToken) {
        p.push(p.eatContextual(K_PartialKeyword));
      } else {
        p.push(p.eat());
      }
      continue;
    }
    if (mod === MOD_REF) {
      // isRefReturningMember
      const nk = p.kindAt(1);
      if (!(nk === K_IdentifierToken && (p.ckAt(1) === K_RecordKeyword || p.ckAt(1) === K_UnionKeyword)) && cspIsTypeFollowedByMemberName(p)) {
        return isPossibleTypeDeclaration;
      }
      if (forTopLevelStatements && !cspShouldConsumeRefAtTopLevel(p)) {
        return isPossibleTypeDeclaration;
      }
      p.push(p.eat());
      continue;
    }
    if (mod === MOD_ASYNC) {
      if (p.k() === K_IdentifierToken) {
        if (!cspShouldContextualKeywordBeTreatedAsModifier(p, false)) {
          return isPossibleTypeDeclaration;
        }
        p.push(p.eatContextual(K_AsyncKeyword));
      } else {
        p.push(p.eat());
      }
      continue;
    }
    if (mod === MOD_CONTEXTUAL) {
      // required, file, closed, safe: features enabled in preview
      if (forTopLevelStatements && !cspShouldContextualKeywordBeTreatedAsModifier(p, false)) {
        return isPossibleTypeDeclaration;
      }
      p.push(p.eatContextual(p.ck()));
      continue;
    }
    p.push(p.eat());
  }
  return isPossibleTypeDeclaration;
};

const cspShouldConsumeRefAtTopLevel = (p: CsParser): boolean => {
  const m = p.mark();
  p.eat();
  while (cspModifierKind(p.k(), p.ck()) !== 0) {
    p.eat();
  }
  const ck = p.k() === K_IdentifierToken ? p.ck() : 0;
  const r = ck === K_RecordKeyword || ck === K_UnionKeyword || ck === K_ExtensionKeyword || cspIsTypeDeclarationStart(p);
  p.reset(m);
  return r;
};

export const cspIsDefiniteScopedModifier = (p: CsParser, isFunctionPointerParameter: boolean, isLambdaParameter: boolean): boolean => {
  if (p.k() !== K_IdentifierToken || p.ck() !== K_ScopedKeyword) {
    return false;
  }
  if (isLambdaParameter) {
    return true;
  }
  const m = p.mark();
  p.eat();
  let r = false;
  if (cspIsParameterModifierExcludingScoped(p.k())) {
    r = true;
  } else if (cspScanType(p, PT_NORMAL) !== ST_NOT_TYPE) {
    if (isFunctionPointerParameter) {
      r = p.k() === K_CommaToken || p.k() === K_GreaterThanToken;
    } else {
      r = p.k() === K_IdentifierToken;
    }
  }
  p.reset(m);
  return r;
};

export const cspIsParameterModifierExcludingScoped = (k: i32): boolean =>
  k === K_ThisKeyword || k === K_RefKeyword || k === K_OutKeyword || k === K_InKeyword || k === K_ParamsKeyword || k === K_ReadOnlyKeyword;

/** ParseParameterModifiers: pushes the modifier tokens. */
export const cspParameterModifiers = (p: CsParser, isFunctionPointerParameter: boolean, isLambdaParameter: boolean): void => {
  let seenScoped = false;
  while (!p.err) {
    if (cspIsParameterModifierExcludingScoped(p.k())) {
      p.push(p.eat());
      continue;
    }
    if (cspIsDefiniteScopedModifier(p, isFunctionPointerParameter, isLambdaParameter)) {
      if (!seenScoped) {
        seenScoped = true;
        p.push(p.eatContextual(K_ScopedKeyword));
        continue;
      }
      const k1 = p.kindAt(1);
      if (!(k1 === K_CloseParenToken || k1 === K_CommaToken || k1 === K_EqualsToken)) {
        p.push(p.eatContextual(K_ScopedKeyword));
        continue;
      }
    }
    return;
  }
};

// ---- members ----

const cspCanStartMember = (k: i32): boolean => {
  switch (k) {
    case K_AbstractKeyword:
    case K_ClassKeyword:
    case K_ConstKeyword:
    case K_DelegateKeyword:
    case K_EnumKeyword:
    case K_EventKeyword:
    case K_ExternKeyword:
    case K_FixedKeyword:
    case K_InterfaceKeyword:
    case K_NewKeyword:
    case K_StructKeyword:
    case K_IdentifierToken:
    case K_TildeToken:
    case K_OpenBracketToken:
    case K_ImplicitKeyword:
    case K_ExplicitKeyword:
    case K_OpenParenToken:
    case K_RefKeyword:
    case K_VoidKeyword:
      return true;
    default:
      return csIsPredefinedType(k) || cspModifierKind(k, 0) !== 0;
  }
};

/** A member of a type or namespace. */
export const cspMemberDeclaration = (p: CsParser, parentKind: i32): i32 => {
  p.depth = p.depth + 1;
  if (p.depth > 400) {
    p.fail("too deep");
    return -1;
  }
  const r = cspMemberDeclarationCore(p, parentKind);
  p.depth = p.depth - 1;
  return r;
};

/** Pushes attribute list and modifier list; answers isPossibleTypeDeclaration via the parser flag. */
class CsMemberStart {
  attrs: i32;
  mods: i32;
  possibleType: boolean;
  constructor(attrs: i32, mods: i32, possibleType: boolean) {
    this.attrs = attrs;
    this.mods = mods;
    this.possibleType = possibleType;
  }
}

const cspMemberStart = (p: CsParser, forTopLevel: boolean, attrs: i32): CsMemberStart => {
  const mm = p.sp();
  const possible = cspModifiers(p, forTopLevel);
  const mods = p.list(mm);
  return new CsMemberStart(attrs, mods, possible);
};

const cspIsExtensionContainerStart = (p: CsParser): boolean => p.k() === K_IdentifierToken && p.ck() === K_ExtensionKeyword;

const cspMemberDeclarationCore = (p: CsParser, parentKind: i32): i32 => {
  const attrs = cspAttributeDeclarations(p, false);
  const ms = cspMemberStart(p, false, attrs);
  const mods = ms.mods;
  if (cspIsExtensionContainerStart(p)) {
    return cspMainTypeDeclaration(p, attrs, mods);
  }
  if (p.k() === K_IdentifierToken && p.kindAt(1) === K_OpenParenToken) {
    return cspConstructorDeclaration(p, attrs, mods);
  }
  if (p.k() === K_TildeToken) {
    return cspDestructorDeclaration(p, attrs, mods);
  }
  if (p.k() === K_ConstKeyword) {
    return cspConstantFieldDeclaration(p, attrs, mods, parentKind);
  }
  if (p.k() === K_EventKeyword) {
    return cspEventDeclaration(p, attrs, mods, parentKind);
  }
  if (p.k() === K_FixedKeyword) {
    return cspFixedSizeBufferDeclaration(p, attrs, mods);
  }
  const conv = cspTryConversionOperatorDeclaration(p, attrs, mods);
  if (conv >= 0 || p.err) {
    return conv;
  }
  if (ms.possibleType && cspIsTypeDeclarationStart(p)) {
    return cspTypeDeclaration(p, attrs, mods);
  }
  let type = cspTypeOrVoid(p);
  let modsList = mods;
  while (!p.err) {
    if (cspIsMisplacedModifier(p)) {
      p.fail("misplaced modifier");
      return -1;
    }
    if (type >= 0 && p.t.kind[type] !== K_RefType) {
      const op = cspIsOperatorStart(p);
      if (op !== -2) {
        return cspOperatorDeclaration(p, attrs, modsList, type, op);
      }
    }
    if (cspIsFieldDeclaration(p, false, false)) {
      return cspNormalFieldDeclaration(p, attrs, modsList, type);
    }
    const afterType = p.mark();
    const mn = cspMemberName(p, false);
    if (p.err) {
      return -1;
    }
    if (mn.eis < 0 && mn.ident < 0 && mn.tpl < 0) {
      if (!(cspLooksLikeStartOfPropertyBody(p, type, modsList))) {
        p.fail("incomplete member");
        return -1;
      }
    }
    // ReconsideredTypeAsAsyncModifier
    if (
      type >= 0 &&
      p.t.kind[type] === K_IdentifierName &&
      mn.ident >= 0 &&
      p.lx.kind[mn.ident] === K_IdentifierToken &&
      !(p.k() === K_OpenParenToken || p.k() === K_OpenBraceToken || p.k() === K_EqualsGreaterThanToken)
    ) {
      const id = p.t.s(type, 0);
      if (p.lx.ck[id] === K_AsyncKeyword && !cspListHasKind(p, modsList, K_AsyncKeyword)) {
        // the type was the `async` modifier
        p.reset(afterType);
        // rebuild the modifier list with `async` appended
        const mm = p.sp();
        const off = p.t.lsOff[modsList];
        const len = p.t.lsLen[modsList];
        for (let i = 0; i < len; i++) {
          p.push(p.t.pool[off + i]);
        }
        p.convert(id, K_AsyncKeyword);
        p.push(id);
        modsList = p.list(mm);
        type = cspTypeOrVoid(p);
        continue;
      }
    }
    if (mn.ident >= 0 && p.lx.kind[mn.ident] === K_ThisKeyword) {
      return cspIndexerDeclaration(p, attrs, modsList, type, mn.eis, mn.ident, mn.tpl);
    }
    if (cspIsStartOfPropertyBody(p, 0)) {
      if (mn.ident < 0) {
        p.fail("identifier expected");
        return -1;
      }
      return cspPropertyDeclaration(p, attrs, modsList, type, mn.eis, mn.ident, mn.tpl);
    }
    return cspMethodDeclaration(p, attrs, modsList, type, mn.eis, mn.ident, mn.tpl);
  }
  return -1;
};

const cspListHasKind = (p: CsParser, l: i32, kind: i32): boolean => {
  const off = p.t.lsOff[l];
  const len = p.t.lsLen[l];
  for (let i = 0; i < len; i++) {
    if (p.lx.kind[p.t.pool[off + i]] === kind) {
      return true;
    }
  }
  return false;
};

const cspLooksLikeStartOfPropertyBody = (p: CsParser, type: i32, mods: i32): boolean => {
  if (p.t.count(mods) === 0) {
    // looksLikePropertyType
    let pt = type;
    if (pt < 0) {
      return false;
    }
    if (p.t.kind[pt] === K_RefType) {
      pt = p.t.s(pt, 2);
    }
    if (p.t.kind[pt] === K_IdentifierName && p.lx.ck[p.t.s(pt, 0)] !== 0) {
      return false;
    }
  }
  return cspIsStartOfPropertyBody(p, 0);
};

const cspIsMisplacedModifier = (p: CsParser): boolean => {
  const mod = cspModifierKind(p.k(), p.ck());
  if (mod === 0) {
    return false;
  }
  if (p.k() === K_IdentifierToken) {
    return false; // contextual modifiers
  }
  return true;
};

export const cspIsStartOfPropertyBody = (p: CsParser, index: i32): boolean => {
  let k = p.kindAt(index);
  if (k === K_OpenBraceToken || k === K_EqualsGreaterThanToken) {
    return true;
  }
  if (k === K_SemicolonToken) {
    k = p.kindAt(index + 1);
    if (k === K_OpenBraceToken || k === K_EqualsGreaterThanToken) {
      return true;
    }
  }
  return false;
};

export const cspIsFieldDeclaration = (p: CsParser, isEvent: boolean, isGlobalScriptLevel: boolean): boolean => {
  if (p.k() !== K_IdentifierToken) {
    return false;
  }
  if (p.ck() === K_GlobalKeyword && p.kindAt(1) === K_UsingKeyword) {
    return false;
  }
  if (!isGlobalScriptLevel && cspIsStartOfPropertyBody(p, 1)) {
    return false;
  }
  switch (p.kindAt(1)) {
    case K_DotToken:
    case K_ColonColonToken:
    case K_LessThanToken:
    case K_OpenBraceToken:
    case K_EqualsGreaterThanToken:
      return false;
    case K_OpenParenToken:
      return isEvent;
    default:
      return true;
  }
};

class CsMemberName {
  eis: i32;
  ident: i32;
  tpl: i32;
  constructor(eis: i32, ident: i32, tpl: i32) {
    this.eis = eis;
    this.ident = ident;
    this.tpl = tpl;
  }
}

/** ParseMemberName: an optional explicit interface specifier, the identifier (or `this`) and type parameters. */
const cspMemberName = (p: CsParser, isEvent: boolean): CsMemberName => {
  if (!cspIsPossibleMemberName(p)) {
    return new CsMemberName(-1, -1, -1);
  }
  let name = -1;
  let sep = -1;
  let ident = -1;
  let tpl = -1;
  let beforeIdent = p.mark();
  while (!p.err) {
    if (p.k() === K_ThisKeyword) {
      beforeIdent = p.mark();
      ident = p.eat();
      tpl = cspTypeParameterList(p);
      break;
    }
    const m = p.mark();
    cspScanNamedTypePartPublic(p);
    const isMemberName = !(p.k() === K_DotToken || p.k() === K_ColonColonToken);
    p.reset(m);
    if (isMemberName) {
      beforeIdent = p.mark();
      if (sep >= 0 && p.lx.kind[sep] === K_ColonColonToken) {
        p.fail("alias qualifier as expression");
        break;
      }
      ident = cspIdentifierToken(p);
      tpl = cspTypeParameterList(p);
      break;
    }
    const acc = cspAccumulateExplicitInterfaceName(p, name, sep);
    name = acc.name;
    sep = acc.sep;
  }
  let eis = -1;
  if (name >= 0) {
    if (p.lx.kind[sep] !== K_DotToken) {
      p.fail("dot expected");
      return new CsMemberName(-1, -1, -1);
    }
    if (isEvent && p.k() !== K_OpenBraceToken && p.k() !== K_SemicolonToken) {
      p.fail("explicit event field");
      return new CsMemberName(-1, -1, -1);
    }
    const m = p.sp();
    p.push(name);
    p.push(sep);
    eis = p.node(K_ExplicitInterfaceSpecifier, m);
  }
  if (beforeIdent.pos < 0) {
    return new CsMemberName(eis, ident, tpl);
  }
  return new CsMemberName(eis, ident, tpl);
};

class CsAccName {
  name: i32;
  sep: i32;
  constructor(name: i32, sep: i32) {
    this.name = name;
    this.sep = sep;
  }
}

const cspAccumulateExplicitInterfaceName = (p: CsParser, name: i32, sep: i32): CsAccName => {
  if (name < 0) {
    const n = cspSimpleName(p, NO_IN_TYPE_LIST);
    const s = p.k() === K_ColonColonToken ? p.eat() : p.expect(K_DotToken);
    return new CsAccName(n, s);
  }
  // ParseQualifiedNameRight
  const right = cspSimpleName(p, NO_IN_TYPE_LIST);
  const m = p.sp();
  let n = -1;
  if (p.lx.kind[sep] === K_DotToken) {
    p.push(name);
    p.push(sep);
    p.push(right);
    n = p.node(K_QualifiedName, m);
  } else {
    // alias qualified: global::X.
    const id = p.t.s(name, 0);
    if (p.lx.kind[id] === K_IdentifierToken && p.lx.ck[id] === K_GlobalKeyword) {
      p.convert(id, K_GlobalKeyword);
    }
    p.push(name);
    p.push(sep);
    p.push(right);
    n = p.node(K_AliasQualifiedName, m);
  }
  if (p.k() === K_ColonColonToken) {
    p.fail("unexpected aliased name");
    return new CsAccName(n, -1);
  }
  return new CsAccName(n, p.expect(K_DotToken));
};



const cspIsOperatorKeyword = (p: CsParser): boolean =>
  p.k() === K_ImplicitKeyword || p.k() === K_ExplicitKeyword || p.k() === K_OperatorKeyword;

/** IsOperatorStart: -2 if not an operator; otherwise the explicit interface specifier (-1 for none). */
const cspIsOperatorStart = (p: CsParser): i32 => {
  if (cspIsOperatorKeyword(p)) {
    return -1;
  }
  if (p.k() !== K_IdentifierToken) {
    return -2;
  }
  const before = p.mark();
  let name = -1;
  let sep = -1;
  while (!p.err) {
    let part = false;
    const m = p.mark();
    if (cspIsOperatorKeyword(p)) {
      part = false;
    } else {
      cspScanNamedTypePartPublic(p);
      part = p.k() === K_DotToken || p.k() === K_ColonColonToken || cspIsOperatorKeyword(p);
    }
    p.reset(m);
    if (!part) {
      break;
    }
    const acc = cspAccumulateExplicitInterfaceName(p, name, sep);
    name = acc.name;
    sep = acc.sep;
  }
  if (p.err || !cspIsOperatorKeyword(p) || name < 0) {
    p.reset(before);
    return -2;
  }
  if (p.lx.kind[sep] !== K_DotToken) {
    p.fail("dot expected");
    return -2;
  }
  const m = p.sp();
  p.push(name);
  p.push(sep);
  return p.node(K_ExplicitInterfaceSpecifier, m);
};

// ---- the member declarations ----

const cspPushAttrsMods = (p: CsParser, attrs: i32, mods: i32): void => {
  p.push(attrs);
  p.push(mods);
};

/** ParseBlockAndExpressionBodiesWithSemicolon: pushes Body, ExpressionBody, SemicolonToken. */
export const cspBodies = (p: CsParser): void => {
  if (p.k() === K_SemicolonToken) {
    p.push(-1);
    p.push(-1);
    p.push(p.eat());
    return;
  }
  const block = p.k() === K_OpenBraceToken ? cspBlock(p, p.list(p.sp())) : -1;
  const expr = p.k() === K_EqualsGreaterThanToken ? cspArrowExpressionClause(p) : -1;
  p.push(block);
  p.push(expr);
  if (expr >= 0 || block < 0) {
    p.push(p.expect(K_SemicolonToken));
  } else if (p.k() === K_SemicolonToken) {
    p.fail("unexpected semicolon");
    p.push(-1);
  } else {
    p.push(-1);
  }
};

export const cspArrowExpressionClause = (p: CsParser): i32 => {
  const m = p.sp();
  p.push(p.expect(K_EqualsGreaterThanToken));
  p.push(cspPossibleRefExpression(p));
  return p.node(K_ArrowExpressionClause, m);
};

const cspConstructorDeclaration = (p: CsParser, attrs: i32, mods: i32): i32 => {
  const m = p.sp();
  cspPushAttrsMods(p, attrs, mods);
  p.push(cspIdentifierToken(p));
  p.push(cspParenthesizedParameterList(p, false));
  p.push(cspTryConstructorInitializer(p));
  cspBodies(p);
  return p.node(K_ConstructorDeclaration, m);
};

const cspTryConstructorInitializer = (p: CsParser): i32 => {
  const k = p.k();
  if (k === K_ColonToken) {
    return cspConstructorInitializer(p);
  }
  return -1;
};

const cspConstructorInitializer = (p: CsParser): i32 => {
  const m = p.sp();
  p.push(p.expect(K_ColonToken));
  const k = p.k();
  if (k !== K_BaseKeyword && k !== K_ThisKeyword) {
    p.fail("this or base expected");
    return -1;
  }
  const tok = p.eat();
  p.push(tok);
  p.push(cspArgumentList(p));
  return p.node(p.lx.kind[tok] === K_BaseKeyword ? K_BaseConstructorInitializer : K_ThisConstructorInitializer, m);
};

const cspDestructorDeclaration = (p: CsParser, attrs: i32, mods: i32): i32 => {
  const m = p.sp();
  cspPushAttrsMods(p, attrs, mods);
  p.push(p.expect(K_TildeToken));
  p.push(cspIdentifierToken(p));
  const pm = p.sp();
  p.push(p.expect(K_OpenParenToken));
  p.push(p.list(p.sp()));
  p.push(p.expect(K_CloseParenToken));
  p.push(p.node(K_ParameterList, pm));
  cspBodies(p);
  return p.node(K_DestructorDeclaration, m);
};

const cspMethodDeclaration = (p: CsParser, attrs: i32, mods: i32, type: i32, eis: i32, ident: i32, tpl: i32): i32 => {
  if (ident < 0) {
    p.fail("identifier expected");
    return -1;
  }
  const m = p.sp();
  cspPushAttrsMods(p, attrs, mods);
  p.push(type);
  p.push(eis);
  p.push(ident);
  p.push(tpl);
  p.push(cspParenthesizedParameterList(p, false));
  const cm = p.sp();
  if (p.k() === K_IdentifierToken && p.ck() === K_WhereKeyword) {
    cspTypeParameterConstraintClauses(p);
  } else if (p.k() === K_ColonToken) {
    p.fail("unexpected constructor initializer");
    return -1;
  }
  p.push(p.list(cm));
  const saveAsync = p.inAsync;
  p.inAsync = cspListHasKind(p, mods, K_AsyncKeyword);
  cspBodies(p);
  p.inAsync = saveAsync;
  return p.node(K_MethodDeclaration, m);
};

const cspIsAnyOverloadableOperator = (k: i32): boolean => {
  switch (k) {
    case K_PlusToken:
    case K_MinusToken:
    case K_ExclamationToken:
    case K_TildeToken:
    case K_PlusPlusToken:
    case K_MinusMinusToken:
    case K_TrueKeyword:
    case K_FalseKeyword:
    case K_AsteriskToken:
    case K_SlashToken:
    case K_PercentToken:
    case K_AmpersandToken:
    case K_BarToken:
    case K_CaretToken:
    case K_LessThanLessThanToken:
    case K_GreaterThanGreaterThanToken:
    case K_GreaterThanGreaterThanGreaterThanToken:
    case K_EqualsEqualsToken:
    case K_ExclamationEqualsToken:
    case K_LessThanToken:
    case K_LessThanEqualsToken:
    case K_GreaterThanToken:
    case K_GreaterThanEqualsToken:
    case K_PlusEqualsToken:
    case K_MinusEqualsToken:
    case K_AsteriskEqualsToken:
    case K_SlashEqualsToken:
    case K_PercentEqualsToken:
    case K_AmpersandEqualsToken:
    case K_BarEqualsToken:
    case K_CaretEqualsToken:
    case K_LessThanLessThanEqualsToken:
    case K_GreaterThanGreaterThanEqualsToken:
    case K_GreaterThanGreaterThanGreaterThanEqualsToken:
      return true;
    default:
      return false;
  }
};

const cspTryConversionOperatorDeclaration = (p: CsParser, attrs: i32, mods: i32): i32 => {
  const k = p.k();
  if (k !== K_ImplicitKeyword && k !== K_ExplicitKeyword) {
    return -1;
  }
  const m = p.sp();
  cspPushAttrsMods(p, attrs, mods);
  p.push(p.eat());
  p.push(-1); // explicit interface specifier: not supported here
  p.push(p.expect(K_OperatorKeyword));
  if (p.k() === K_UncheckedKeyword) {
    p.fail("misplaced unchecked");
    return -1;
  }
  p.push(p.tryEat(K_CheckedKeyword));
  p.push(cspType(p, PT_NORMAL));
  p.push(cspParenthesizedParameterList(p, false));
  cspBodies(p);
  return p.node(K_ConversionOperatorDeclaration, m);
};

const cspOperatorDeclaration = (p: CsParser, attrs: i32, mods: i32, type: i32, eis: i32): i32 => {
  if (p.k() === K_ImplicitKeyword || p.k() === K_ExplicitKeyword) {
    p.fail("bad operator syntax");
    return -1;
  }
  const m = p.sp();
  cspPushAttrsMods(p, attrs, mods);
  p.push(type);
  p.push(eis);
  p.push(p.expect(K_OperatorKeyword));
  if (p.k() === K_UncheckedKeyword) {
    p.fail("misplaced unchecked");
    return -1;
  }
  p.push(p.tryEat(K_CheckedKeyword));
  let op = -1;
  if (p.k() === K_GreaterThanToken) {
    // >, >>, >>>, >=, >>=, >>>=
    if (p.kindAt(1) === K_GreaterThanToken && p.noTriviaBetween(0)) {
      if (p.kindAt(2) === K_GreaterThanToken && p.noTriviaBetween(1)) {
        op = p.eatMerged(K_GreaterThanGreaterThanGreaterThanToken, 3);
      } else if (p.kindAt(2) === K_GreaterThanEqualsToken && p.noTriviaBetween(1)) {
        op = p.eatMerged(K_GreaterThanGreaterThanGreaterThanEqualsToken, 3);
      } else {
        op = p.eatMerged(K_GreaterThanGreaterThanToken, 2);
      }
    } else if (p.kindAt(1) === K_GreaterThanEqualsToken && p.noTriviaBetween(0)) {
      op = p.eatMerged(K_GreaterThanGreaterThanEqualsToken, 2);
    } else {
      op = p.eat();
    }
  } else if (cspIsAnyOverloadableOperator(p.k())) {
    op = p.eat();
  } else {
    p.fail("operator expected");
    return -1;
  }
  p.push(op);
  p.push(cspParenthesizedParameterList(p, false));
  cspBodies(p);
  return p.node(K_OperatorDeclaration, m);
};

const cspIndexerDeclaration = (p: CsParser, attrs: i32, mods: i32, type: i32, eis: i32, thisTok: i32, tpl: i32): i32 => {
  if (tpl >= 0) {
    p.fail("generic indexer");
    return -1;
  }
  const m = p.sp();
  cspPushAttrsMods(p, attrs, mods);
  p.push(type);
  p.push(eis);
  p.push(thisTok);
  p.push(cspBracketedParameterList(p));
  if (p.k() === K_EqualsGreaterThanToken) {
    p.push(-1);
    p.push(cspArrowExpressionClause(p));
    p.push(p.expect(K_SemicolonToken));
  } else {
    p.push(cspAccessorList(p, ACC_INDEXER));
    if (p.k() === K_SemicolonToken) {
      p.fail("unexpected semicolon");
      return -1;
    }
    p.push(-1);
    p.push(-1);
  }
  return p.node(K_IndexerDeclaration, m);
};

const cspPropertyDeclaration = (p: CsParser, attrs: i32, mods: i32, type: i32, eis: i32, ident: i32, tpl: i32): i32 => {
  if (tpl >= 0) {
    p.fail("generic property");
    return -1;
  }
  if (p.k() === K_SemicolonToken) {
    p.fail("unexpected semicolon");
    return -1;
  }
  const m = p.sp();
  cspPushAttrsMods(p, attrs, mods);
  p.push(type);
  p.push(eis);
  p.push(ident);
  p.push(p.k() === K_OpenBraceToken ? cspAccessorList(p, ACC_PROPERTY) : -1);
  let expr = -1;
  let init = -1;
  if (p.k() === K_EqualsGreaterThanToken) {
    const saveField = p.inField;
    p.inField = true;
    expr = cspArrowExpressionClause(p);
    p.inField = saveField;
  } else if (p.k() === K_EqualsToken) {
    const em = p.sp();
    p.push(p.eat());
    p.push(cspVariableInitializer(p));
    init = p.node(K_EqualsValueClause, em);
  }
  p.push(expr);
  p.push(init);
  if (expr >= 0 || init >= 0) {
    p.push(p.expect(K_SemicolonToken));
  } else if (p.k() === K_SemicolonToken) {
    p.fail("unexpected semicolon");
    return -1;
  } else {
    p.push(-1);
  }
  return p.node(K_PropertyDeclaration, m);
};

const ACC_PROPERTY: i32 = 0;
const ACC_INDEXER: i32 = 1;
const ACC_EVENT: i32 = 2;

const cspAccessorList = (p: CsParser, declaringKind: i32): i32 => {
  const m = p.sp();
  p.push(p.expect(K_OpenBraceToken));
  const lm = p.sp();
  while (p.k() !== K_CloseBraceToken && !p.err) {
    if (cspIsPossibleAccessor(p)) {
      p.push(cspAccessorDeclaration(p, declaringKind));
    } else {
      p.fail("accessor expected");
      break;
    }
  }
  p.push(p.list(lm));
  p.push(p.expect(K_CloseBraceToken));
  return p.node(K_AccessorList, m);
};

const cspAccessorKind = (ck: i32): i32 => {
  switch (ck) {
    case K_GetKeyword:
      return K_GetAccessorDeclaration;
    case K_SetKeyword:
      return K_SetAccessorDeclaration;
    case K_InitKeyword:
      return K_InitAccessorDeclaration;
    case K_AddKeyword:
      return K_AddAccessorDeclaration;
    case K_RemoveKeyword:
      return K_RemoveAccessorDeclaration;
    default:
      return 0;
  }
};

const cspAccessorModifiers = (p: CsParser): void => {
  while (!p.err && (cspModifierKind(p.k(), p.ck()) !== 0 || (p.k() === K_IdentifierToken && p.ck() === K_ScopedKeyword))) {
    const t = p.eat();
    if (p.lx.kind[t] === K_IdentifierToken) {
      p.convert(t, p.lx.ck[t]);
    }
    p.push(t);
  }
};

const cspIsAccessorBodyStart = (k: i32): boolean => k === K_OpenBraceToken || k === K_SemicolonToken || k === K_EqualsGreaterThanToken;

const cspIsPossibleAccessor = (p: CsParser): boolean => {
  if (cspIsPossibleAttributeDeclaration(p)) {
    return true;
  }
  const m = p.mark();
  const sp = p.sp();
  cspAccessorModifiers(p);
  const parsedMods = p.sp() > sp;
  let r = false;
  if (p.k() === K_IdentifierToken && cspAccessorKind(p.ck()) !== 0) {
    r = true;
  } else if (cspIsAccessorBodyStart(p.k())) {
    r = true;
  } else if (parsedMods) {
    r = p.k() === K_CloseBraceToken || p.k() === K_EndOfFileToken || (p.k() === K_IdentifierToken && cspIsAccessorBodyStart(p.kindAt(1)));
  } else {
    r = p.k() === K_IdentifierToken;
  }
  p.reset(m);
  return r;
};

const cspAccessorDeclaration = (p: CsParser, declaringKind: i32): i32 => {
  const m = p.sp();
  p.push(cspAttributeDeclarations(p, false));
  const mm = p.sp();
  cspAccessorModifiers(p);
  p.push(p.list(mm));
  if (p.k() !== K_IdentifierToken) {
    p.fail("get or set expected");
    return -1;
  }
  const name = p.eat();
  const kind = cspAccessorKind(p.lx.ck[name]);
  if (kind === 0) {
    p.fail("get or set expected");
    return -1;
  }
  p.convert(name, p.lx.ck[name]);
  p.push(name);
  const k = p.k();
  if (k === K_OpenBraceToken || k === K_EqualsGreaterThanToken) {
    const saveField = p.inField;
    p.inField = declaringKind === ACC_PROPERTY;
    cspBodies(p);
    p.inField = saveField;
  } else if (k === K_SemicolonToken) {
    p.push(-1);
    p.push(-1);
    p.push(p.eat());
  } else {
    p.fail("; or { expected");
    return -1;
  }
  if (declaringKind === ACC_EVENT) {
    // nothing special
  }
  return p.node(kind, m);
};

export const cspParenthesizedParameterList = (p: CsParser, forExtensionOrUnion: boolean): i32 => {
  const m = p.sp();
  p.push(p.expect(K_OpenParenToken));
  cspParameters(p, K_CloseParenToken, forExtensionOrUnion);
  p.push(p.expect(K_CloseParenToken));
  return p.node(K_ParameterList, m);
};

const cspBracketedParameterList = (p: CsParser): i32 => {
  const m = p.sp();
  p.push(p.expect(K_OpenBracketToken));
  cspParameters(p, K_CloseBracketToken, false);
  p.push(p.expect(K_CloseBracketToken));
  return p.node(K_BracketedParameterList, m);
};

const cspParameters = (p: CsParser, close: i32, identifierIsOptional: boolean): void => {
  const lm = p.sp();
  if (identifierIsOptional || p.k() !== close) {
    if (!identifierIsOptional && !(p.k() === K_CommaToken || cspIsPossibleParameter(p))) {
      p.fail("parameter expected");
    } else {
      p.push(cspParameter(p, identifierIsOptional));
      while (p.k() === K_CommaToken && !p.err) {
        p.push(p.eat());
        p.push(cspParameter(p, identifierIsOptional));
      }
    }
  }
  p.push(p.list(lm));
};

const cspIsPossibleParameter = (p: CsParser): boolean => {
  const k = p.k();
  switch (k) {
    case K_OpenBracketToken:
    case K_ArgListKeyword:
    case K_OpenParenToken:
      return true;
    case K_DelegateKeyword:
      return cspIsFunctionPointerStart(p);
    case K_IdentifierToken:
      return cspIsTrueIdentifier(p);
    default:
      return cspIsParameterModifierExcludingScoped(k) || cspIsDefiniteScopedModifier(p, false, false) || csIsPredefinedType(k);
  }
};

const cspParameter = (p: CsParser, identifierIsOptional: boolean): i32 => {
  const m = p.sp();
  p.push(cspAttributeDeclarations(p, false));
  const mm = p.sp();
  cspParameterModifiers(p, false, false);
  p.push(p.list(mm));
  if (p.k() === K_ArgListKeyword) {
    p.push(-1);
    p.push(p.eat());
    p.push(-1);
    return p.node(K_Parameter, m);
  }
  p.push(cspType(p, PT_PARAMETER));
  let ident = -1;
  if (p.k() === K_IdentifierToken && cspIsCurrentTokenWhereOfConstraintClause(p)) {
    if (!identifierIsOptional) {
      p.fail("identifier expected");
    }
  } else if (!(identifierIsOptional && p.k() !== K_IdentifierToken)) {
    ident = cspIdentifierToken(p);
  }
  if (ident >= 0 && p.k() === K_OpenBracketToken && p.kindAt(1) === K_CloseBracketToken) {
    p.fail("bad array syntax");
  }
  p.push(ident);
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

const cspFixedSizeBufferDeclaration = (p: CsParser, attrs: i32, mods: i32): i32 => {
  // the `fixed` token joins the modifiers
  const mm = p.sp();
  const off = p.t.lsOff[mods];
  const len = p.t.lsLen[mods];
  for (let i = 0; i < len; i++) {
    p.push(p.t.pool[off + i]);
  }
  p.push(p.eat());
  const mods2 = p.list(mm);
  const m = p.sp();
  p.push(attrs);
  p.push(mods2);
  const type = cspType(p, PT_NORMAL);
  const dm = p.sp();
  p.push(type);
  cspVariableDeclarators(p, type, VF_FIXED, false, false);
  p.push(p.node(K_VariableDeclaration, dm));
  p.push(p.expect(K_SemicolonToken));
  return p.node(K_FieldDeclaration, m);
};

const cspEventDeclaration = (p: CsParser, attrs: i32, mods: i32, parentKind: i32): i32 => {
  const ev = p.eat();
  const type = cspType(p, PT_NORMAL);
  if (cspIsFieldDeclaration(p, true, parentKind === K_CompilationUnit)) {
    const m = p.sp();
    cspPushAttrsMods(p, attrs, mods);
    p.push(ev);
    const dm = p.sp();
    p.push(type);
    cspVariableDeclarators(p, type, 0, false, false);
    p.push(p.node(K_VariableDeclaration, dm));
    if (p.k() === K_DotToken) {
      p.fail("explicit event field");
      return -1;
    }
    p.push(p.expect(K_SemicolonToken));
    return p.node(K_EventFieldDeclaration, m);
  }
  const mn = cspMemberName(p, true);
  if (p.err) {
    return -1;
  }
  if (mn.ident < 0 || p.lx.kind[mn.ident] !== K_IdentifierToken || mn.tpl >= 0) {
    p.fail("event name expected");
    return -1;
  }
  const m = p.sp();
  cspPushAttrsMods(p, attrs, mods);
  p.push(ev);
  p.push(type);
  p.push(mn.eis);
  p.push(mn.ident);
  if (mn.eis >= 0 && p.k() === K_SemicolonToken) {
    p.push(-1);
    p.push(p.eat());
  } else {
    p.push(cspAccessorList(p, ACC_EVENT));
    p.push(-1);
  }
  if (p.k() === K_SemicolonToken) {
    p.fail("unexpected semicolon");
    return -1;
  }
  return p.node(K_EventDeclaration, m);
};

const cspNormalFieldDeclaration = (p: CsParser, attrs: i32, mods: i32, type: i32): i32 => {
  const m = p.sp();
  // a trailing `scoped` modifier makes a ScopedType
  let mods2 = mods;
  let type2 = type;
  const len = p.t.lsLen[mods];
  if (len > 0) {
    const last = p.t.pool[p.t.lsOff[mods] + len - 1];
    if (p.lx.kind[last] === K_ScopedKeyword) {
      const mm = p.sp();
      for (let i = 0; i < len - 1; i++) {
        p.push(p.t.pool[p.t.lsOff[mods] + i]);
      }
      mods2 = p.list(mm);
      const sm = p.sp();
      p.push(last);
      p.push(type);
      type2 = p.node(K_ScopedType, sm);
    }
  }
  cspPushAttrsMods(p, attrs, mods2);
  const dm = p.sp();
  p.push(type2);
  cspVariableDeclarators(p, type2, VF_LOCAL_OR_FIELD, false, false);
  p.push(p.node(K_VariableDeclaration, dm));
  p.push(p.expect(K_SemicolonToken));
  return p.node(K_FieldDeclaration, m);
};

const cspConstantFieldDeclaration = (p: CsParser, attrs: i32, mods: i32, parentKind: i32): i32 => {
  const mm = p.sp();
  const off = p.t.lsOff[mods];
  const len = p.t.lsLen[mods];
  for (let i = 0; i < len; i++) {
    p.push(p.t.pool[off + i]);
  }
  p.push(p.expect(K_ConstKeyword));
  const mods2 = p.list(mm);
  const m = p.sp();
  cspPushAttrsMods(p, attrs, mods2);
  const type = cspType(p, PT_NORMAL);
  const dm = p.sp();
  p.push(type);
  cspVariableDeclarators(p, type, VF_CONST, false, false);
  p.push(p.node(K_VariableDeclaration, dm));
  p.push(p.expect(K_SemicolonToken));
  if (parentKind === 0) {
    return -1;
  }
  return p.node(K_FieldDeclaration, m);
};

// VariableFlags
export const VF_FIXED: i32 = 1;
export const VF_CONST: i32 = 2;
export const VF_LOCAL_OR_FIELD: i32 = 4;
export const VF_FOR_STATEMENT: i32 = 8;

/**
 * ParseVariableDeclarators: pushes the separated list of declarators. With
 * allowLocalFunctions, answers the local function statement it found instead
 * (pushing nothing), or -1.
 */
export const cspVariableDeclarators = (p: CsParser, type: i32, flags: i32, allowLocalFunctions: boolean, stopOnCloseParen: boolean): i32 => {
  const lm = p.sp();
  const first = cspVariableDeclarator(p, type, flags, true, allowLocalFunctions);
  if (first === -3) {
    return p.t.nn - 1; // a local function was parsed; it is the last node
  }
  p.push(first);
  while (p.k() !== K_SemicolonToken && !p.err) {
    if (stopOnCloseParen && p.k() === K_CloseParenToken) {
      break;
    }
    if (p.k() === K_CommaToken) {
      if ((flags & VF_FOR_STATEMENT) !== 0 && p.kindAt(1) !== K_SemicolonToken) {
        const legal = p.kindAt(1) === K_IdentifierToken && !(p.inQuery) && (p.kindAt(2) === K_CommaToken || p.kindAt(2) === K_EqualsToken || p.kindAt(2) === K_SemicolonToken);
        if (!legal) {
          break;
        }
      }
      p.push(p.eat());
      p.push(cspVariableDeclarator(p, type, flags, false, false));
      continue;
    }
    break;
  }
  p.push(p.list(lm));
  return -1;
};

/** One declarator; -3 when it turned out to be a local function (left as the last node). */
const cspVariableDeclarator = (p: CsParser, type: i32, flags: i32, isFirst: boolean, allowLocalFunctions: boolean): i32 => {
  const name = cspIdentifierToken(p);
  if (p.err) {
    return -1;
  }
  const isFixed = (flags & VF_FIXED) !== 0;
  const isConst = (flags & VF_CONST) !== 0;
  const isLocalOrField = (flags & VF_LOCAL_OR_FIELD) !== 0;
  if (!isFirst && cspIsTrueIdentifier(p)) {
    p.fail("multiple types in declaration");
    return -1;
  }
  const m = p.sp();
  p.push(name);
  const k = p.k();
  if (k === K_EqualsToken && !isFixed) {
    p.push(-1);
    const em = p.sp();
    p.push(p.eat());
    if (isLocalOrField && !isConst && p.k() === K_RefKeyword && !cspIsPossibleLambdaExpression(p, 1)) {
      const rm = p.sp();
      p.push(p.eat());
      p.push(cspVariableInitializer(p));
      p.push(p.node(K_RefExpression, rm));
    } else {
      p.push(cspVariableInitializer(p));
    }
    p.push(p.node(K_EqualsValueClause, em));
    return p.node(K_VariableDeclarator, m);
  }
  if ((k === K_LessThanToken || k === K_OpenParenToken) && allowLocalFunctions && isFirst) {
    p.t.sp = m;
    const lf = cspTryLocalFunctionBody(p, type, name);
    if (lf >= 0) {
      return -3;
    }
    if (p.err) {
      return -1;
    }
    p.push(name);
  }
  if (k === K_OpenParenToken) {
    p.fail("bad variable declaration");
    return -1;
  }
  if (k === K_OpenBracketToken) {
    // fixed size buffer (or C style array: an error)
    if (!isFixed) {
      p.fail("C style array");
      return -1;
    }
    const spec = cspArrayRankSpecifier(p);
    // convert to a bracketed argument list
    const am = p.sp();
    p.push(p.t.s(spec, 0));
    const lm = p.sp();
    const sizes = p.t.s(spec, 1);
    const n = p.t.count(sizes);
    for (let j = 0; j < n; j++) {
      const e = p.t.at(sizes, j);
      if ((j & 1) === 0) {
        const xm = p.sp();
        p.push(-1);
        p.push(-1);
        p.push(e);
        p.push(p.node(K_Argument, xm));
      } else {
        p.push(e);
      }
    }
    p.push(p.list(lm));
    p.push(p.t.s(spec, 2));
    p.push(p.node(K_BracketedArgumentList, am));
    p.push(-1);
    return p.node(K_VariableDeclarator, m);
  }
  if (isFixed) {
    p.fail("fixed dims required");
    return -1;
  }
  if (isConst) {
    p.fail("const value required");
    return -1;
  }
  p.push(-1);
  p.push(-1);
  return p.node(K_VariableDeclarator, m);
};


export const cspVariableInitializer = (p: CsParser): i32 =>
  p.k() === K_OpenBraceToken ? cspArrayInitializer(p) : cspExpressionCore(p);

// ---- type declarations ----

const cspTypeDeclaration = (p: CsParser, attrs: i32, mods: i32): i32 => {
  switch (p.k()) {
    case K_DelegateKeyword:
      return cspDelegateDeclaration(p, attrs, mods);
    case K_EnumKeyword:
      return cspEnumDeclaration(p, attrs, mods);
    default:
      return cspMainTypeDeclaration(p, attrs, mods);
  }
};

const cspMainTypeDeclaration = (p: CsParser, attrs: i32, mods: i32): i32 => {
  let keyword = -1;
  let recordMod = -1;
  if (p.k() === K_IdentifierToken && p.ck() === K_RecordKeyword) {
    keyword = p.eatContextual(K_RecordKeyword);
    if (p.k() === K_ClassKeyword || p.k() === K_StructKeyword) {
      recordMod = p.eat();
    }
  } else if ((p.k() === K_StructKeyword || p.k() === K_ClassKeyword) && p.kindAt(1) === K_IdentifierToken && p.ckAt(1) === K_RecordKeyword && p.kindAt(2) === K_IdentifierToken) {
    p.fail("misplaced record");
    return -1;
  } else {
    keyword = p.eat();
    if (p.lx.kind[keyword] === K_IdentifierToken) {
      p.convert(keyword, p.lx.ck[keyword]);
    }
  }
  const kk = p.lx.kind[keyword];
  const isExtension = kk === K_ExtensionKeyword;
  const isUnion = kk === K_UnionKeyword;
  const m = p.sp();
  cspPushAttrsMods(p, attrs, mods);
  p.push(keyword);
  if (kk === K_RecordKeyword) {
    p.push(recordMod);
  }
  if (isExtension) {
    if (p.k() === K_IdentifierToken) {
      p.fail("extension disallows name");
      return -1;
    }
  } else {
    p.push(cspIdentifierToken(p));
  }
  p.push(cspTypeParameterList(p));
  p.push(p.k() === K_OpenParenToken || isExtension ? cspParenthesizedParameterList(p, isExtension || isUnion) : -1);
  if (!isExtension) {
    p.push(cspBaseList(p));
  }
  const cm = p.sp();
  if (p.k() === K_IdentifierToken && p.ck() === K_WhereKeyword) {
    cspTypeParameterConstraintClauses(p);
  }
  p.push(p.list(cm));
  if (p.k() === K_SemicolonToken) {
    p.push(-1);
    p.push(p.list(p.sp()));
    p.push(-1);
    p.push(p.eat());
  } else {
    p.push(p.expect(K_OpenBraceToken));
    const lm = p.sp();
    while (!p.err) {
      const k = p.k();
      if (cspCanStartMember(k)) {
        const mem = cspMemberDeclaration(p, kk);
        if (mem < 0) {
          if (!p.err) {
            p.fail("member expected");
          }
          break;
        }
        p.push(mem);
      } else if (k === K_CloseBraceToken || k === K_EndOfFileToken) {
        break;
      } else {
        p.fail("bad member");
        break;
      }
    }
    p.push(p.list(lm));
    p.push(p.expect(K_CloseBraceToken));
    p.push(p.tryEat(K_SemicolonToken));
  }
  let kind = K_ClassDeclaration;
  switch (kk) {
    case K_StructKeyword:
      kind = K_StructDeclaration;
      break;
    case K_InterfaceKeyword:
      kind = K_InterfaceDeclaration;
      break;
    case K_UnionKeyword:
      kind = K_UnionDeclaration;
      break;
    case K_RecordKeyword:
      kind = recordMod >= 0 && p.lx.kind[recordMod] === K_StructKeyword ? K_RecordStructDeclaration : K_RecordDeclaration;
      break;
    case K_ExtensionKeyword:
      kind = K_ExtensionBlockDeclaration;
      break;
    default:
      kind = K_ClassDeclaration;
      break;
  }
  return p.node(kind, m);
};

const cspBaseList = (p: CsParser): i32 => {
  const colon = p.tryEat(K_ColonToken);
  if (colon < 0) {
    return -1;
  }
  const m = p.sp();
  p.push(colon);
  const lm = p.sp();
  const first = cspType(p, PT_NORMAL);
  if (p.k() === K_OpenParenToken) {
    const bm = p.sp();
    p.push(first);
    p.push(cspArgumentList(p));
    p.push(p.node(K_PrimaryConstructorBaseType, bm));
  } else {
    const bm = p.sp();
    p.push(first);
    p.push(p.node(K_SimpleBaseType, bm));
  }
  while (p.k() !== K_OpenBraceToken && p.k() !== K_SemicolonToken && !cspIsCurrentTokenWhereOfConstraintClause(p) && !p.err) {
    if (p.k() === K_CommaToken) {
      p.push(p.eat());
      const bm = p.sp();
      p.push(cspType(p, PT_NORMAL));
      p.push(p.node(K_SimpleBaseType, bm));
      continue;
    }
    if (cspModifierKind(p.k(), p.ck()) !== 0) {
      break;
    }
    p.fail("bad base list");
    break;
  }
  p.push(p.list(lm));
  return p.node(K_BaseList, m);
};

/** Pushes the constraint clauses (the caller makes the list). */
export const cspTypeParameterConstraintClauses = (p: CsParser): void => {
  while (p.k() === K_IdentifierToken && p.ck() === K_WhereKeyword && !p.err) {
    p.push(cspTypeParameterConstraintClause(p));
  }
};

const cspIsPossibleTypeParameterConstraint = (p: CsParser): boolean => {
  switch (p.k()) {
    case K_NewKeyword:
    case K_ClassKeyword:
    case K_StructKeyword:
    case K_DefaultKeyword:
      return true;
    case K_IdentifierToken:
      return (p.ck() === K_AllowsKeyword && p.kindAt(1) === K_RefKeyword) || cspIsTrueIdentifier(p);
    default:
      return csIsPredefinedType(p.k());
  }
};

const cspTypeParameterConstraintClause = (p: CsParser): i32 => {
  const m = p.sp();
  p.push(p.eatContextual(K_WhereKeyword));
  if (!cspIsTrueIdentifier(p)) {
    p.fail("identifier expected");
    return -1;
  }
  p.push(cspIdentifierName(p));
  p.push(p.expect(K_ColonToken));
  const lm = p.sp();
  if (p.k() === K_OpenBraceToken || cspIsCurrentTokenWhereOfConstraintClause(p)) {
    p.fail("type expected");
    return -1;
  }
  let c = cspTypeParameterConstraint(p);
  p.push(c);
  while (!p.err) {
    const k = p.k();
    if (k === K_OpenBraceToken || k === K_SemicolonToken || k === K_EqualsGreaterThanToken || (k === K_IdentifierToken && p.ck() === K_WhereKeyword)) {
      break;
    }
    const haveComma = k === K_CommaToken;
    if (haveComma || cspIsPossibleTypeParameterConstraint(p)) {
      const sep = p.expect(K_CommaToken);
      if (c >= 0 && p.t.kind[c] === K_AllowsConstraintClause && haveComma && !cspIsPossibleTypeParameterConstraint(p)) {
        p.fail("unexpected comma");
        break;
      }
      p.push(sep);
      if (cspIsCurrentTokenWhereOfConstraintClause(p)) {
        p.fail("type expected");
        break;
      }
      c = cspTypeParameterConstraint(p);
      p.push(c);
    } else {
      p.fail("bad constraint");
      break;
    }
  }
  p.push(p.list(lm));
  return p.node(K_TypeParameterConstraintClause, m);
};

const cspTypeParameterConstraint = (p: CsParser): i32 => {
  const m = p.sp();
  switch (p.k()) {
    case K_NewKeyword:
      p.push(p.eat());
      p.push(p.expect(K_OpenParenToken));
      p.push(p.expect(K_CloseParenToken));
      return p.node(K_ConstructorConstraint, m);
    case K_StructKeyword:
      p.push(p.eat());
      if (p.k() === K_QuestionToken) {
        p.fail("struct?");
        return -1;
      }
      p.push(-1);
      return p.node(K_StructConstraint, m);
    case K_ClassKeyword:
      p.push(p.eat());
      p.push(p.tryEat(K_QuestionToken));
      return p.node(K_ClassConstraint, m);
    case K_DefaultKeyword:
      p.push(p.eat());
      return p.node(K_DefaultConstraint, m);
    case K_EnumKeyword:
      p.fail("enum constraint");
      return -1;
    case K_DelegateKeyword:
      if (p.kindAt(1) !== K_AsteriskToken) {
        p.fail("delegate constraint");
        return -1;
      }
      p.push(cspType(p, PT_NORMAL));
      return p.node(K_TypeConstraint, m);
    default:
      break;
  }
  if (p.k() === K_IdentifierToken && p.ck() === K_AllowsKeyword && p.kindAt(1) === K_RefKeyword) {
    p.push(p.eatContextual(K_AllowsKeyword));
    const lm = p.sp();
    while (!p.err) {
      const rm = p.sp();
      p.push(p.expect(K_RefKeyword));
      p.push(p.expect(K_StructKeyword));
      p.push(p.node(K_RefStructConstraint, rm));
      if (p.k() === K_CommaToken && p.kindAt(1) === K_RefKeyword) {
        p.push(p.eat());
        continue;
      }
      break;
    }
    p.push(p.list(lm));
    return p.node(K_AllowsConstraintClause, m);
  }
  p.push(cspType(p, PT_NORMAL));
  return p.node(K_TypeConstraint, m);
};

export const cspTypeParameterList = (p: CsParser): i32 => {
  if (p.k() !== K_LessThanToken) {
    return -1;
  }
  const m = p.sp();
  p.push(p.eat());
  const lm = p.sp();
  p.push(cspTypeParameter(p));
  while (p.k() === K_CommaToken && !p.err) {
    p.push(p.eat());
    p.push(cspTypeParameter(p));
  }
  p.push(p.list(lm));
  p.push(p.expect(K_GreaterThanToken));
  return p.node(K_TypeParameterList, m);
};

const cspTypeParameter = (p: CsParser): i32 => {
  const m = p.sp();
  if (p.k() === K_OpenBracketToken) {
    p.push(cspAttributeDeclarations(p, false));
  } else {
    p.push(p.list(p.sp()));
  }
  if (cspIsCurrentTokenWhereOfConstraintClause(p) || cspIsCurrentTokenDefinitelyPartialModifier(p, false)) {
    p.fail("identifier expected");
    return -1;
  }
  p.push(p.k() === K_InKeyword || p.k() === K_OutKeyword ? p.eat() : -1);
  p.push(cspIdentifierToken(p));
  return p.node(K_TypeParameter, m);
};

const cspDelegateDeclaration = (p: CsParser, attrs: i32, mods: i32): i32 => {
  const m = p.sp();
  cspPushAttrsMods(p, attrs, mods);
  p.push(p.expect(K_DelegateKeyword));
  p.push(cspTypeOrVoid(p));
  p.push(cspIdentifierToken(p));
  p.push(cspTypeParameterList(p));
  p.push(cspParenthesizedParameterList(p, false));
  const cm = p.sp();
  if (p.k() === K_IdentifierToken && p.ck() === K_WhereKeyword) {
    cspTypeParameterConstraintClauses(p);
  }
  p.push(p.list(cm));
  p.push(p.expect(K_SemicolonToken));
  return p.node(K_DelegateDeclaration, m);
};

const cspEnumDeclaration = (p: CsParser, attrs: i32, mods: i32): i32 => {
  const m = p.sp();
  cspPushAttrsMods(p, attrs, mods);
  p.push(p.expect(K_EnumKeyword));
  p.push(cspIdentifierToken(p));
  if (p.k() === K_LessThanToken) {
    p.fail("generic enum");
    return -1;
  }
  if (p.k() === K_ColonToken) {
    const bm = p.sp();
    p.push(p.eat());
    const lm = p.sp();
    const sm = p.sp();
    p.push(cspType(p, PT_NORMAL));
    p.push(p.node(K_SimpleBaseType, sm));
    p.push(p.list(lm));
    p.push(p.node(K_BaseList, bm));
  } else {
    p.push(-1);
  }
  if (p.k() === K_SemicolonToken) {
    p.push(-1);
    p.push(p.list(p.sp()));
    p.push(-1);
    p.push(p.eat());
    return p.node(K_EnumDeclaration, m);
  }
  p.push(p.expect(K_OpenBraceToken));
  const lm = p.sp();
  if (p.k() !== K_CloseBraceToken) {
    p.push(cspEnumMemberDeclaration(p));
    while (p.k() === K_CommaToken && !p.err) {
      p.push(p.eat());
      if (p.k() === K_CloseBraceToken) {
        break;
      }
      p.push(cspEnumMemberDeclaration(p));
    }
  }
  p.push(p.list(lm));
  p.push(p.expect(K_CloseBraceToken));
  p.push(p.tryEat(K_SemicolonToken));
  return p.node(K_EnumDeclaration, m);
};

const cspEnumMemberDeclaration = (p: CsParser): i32 => {
  const m = p.sp();
  p.push(cspAttributeDeclarations(p, false));
  p.push(p.list(p.sp()));
  p.push(cspIdentifierToken(p));
  if (p.k() === K_EqualsToken) {
    const em = p.sp();
    p.push(p.eat());
    if (p.k() === K_CommaToken || p.k() === K_CloseBraceToken) {
      p.fail("constant expected");
      return -1;
    }
    p.push(cspExpressionCore(p));
    p.push(p.node(K_EqualsValueClause, em));
  } else {
    p.push(-1);
  }
  return p.node(K_EnumMemberDeclaration, m);
};

// ---- namespaces and top-level statements ----

const cspNamespaceDeclaration = (p: CsParser, m0: i32): i32 => {
  // m0: the attribute and modifier lists are already pushed
  const m = m0;
  p.push(p.expect(K_NamespaceKeyword));
  p.push(cspQualifiedName(p, 0));
  if (p.k() === K_SemicolonToken) {
    p.push(p.eat());
    cspNamespaceBody(p, K_FileScopedNamespaceDeclaration);
    return p.node(K_FileScopedNamespaceDeclaration, m);
  }
  p.push(p.expect(K_OpenBraceToken));
  cspNamespaceBody(p, K_NamespaceDeclaration);
  p.push(p.expect(K_CloseBraceToken));
  p.push(p.tryEat(K_SemicolonToken));
  return p.node(K_NamespaceDeclaration, m);
};

/** ParseMemberDeclarationOrStatement at the compilation unit level. */
const cspMemberDeclarationOrStatement = (p: CsParser): i32 => {
  const start = p.mark();
  const attrs = cspAttributeDeclarations(p, false);
  const haveAttrs = p.t.count(attrs) > 0;
  const k = p.k();
  if (k === K_UnsafeKeyword || k === K_FixedKeyword || k === K_DelegateKeyword || k === K_NewKeyword) {
    let stmt = false;
    if (k === K_UnsafeKeyword) {
      stmt = p.kindAt(1) === K_OpenBraceToken || p.kindAt(1) === K_OpenParenToken;
    } else if (k === K_FixedKeyword) {
      stmt = p.kindAt(1) === K_OpenParenToken;
    } else if (k === K_DelegateKeyword) {
      stmt = cspIsAnonymousDelegateExpression(p);
    } else {
      stmt = cspIsPossibleNewExpression(p);
    }
    if (stmt) {
      return cspGlobalStatement(p, cspStatementCore(p, attrs, true));
    }
  }
  const ms = cspMemberStart(p, true, attrs);
  const mods = ms.mods;
  const haveMods = p.t.count(mods) > 0;
  const firstModKind = haveMods ? p.lx.kind[p.t.at(mods, 0)] : 0;
  if (p.k() === K_IdentifierToken && p.kindAt(1) === K_OpenParenToken && (haveAttrs || haveMods)) {
    // a local function with attributes or modifiers
    p.reset(start);
    const a2 = cspAttributeDeclarations(p, false);
    const s = cspLocalDeclarationStatement(p, a2);
    if (s >= 0 && p.t.kind[s] === K_LocalFunctionStatement) {
      return cspGlobalStatement(p, s);
    }
    p.fail("bad top-level member");
    return -1;
  }
  if (p.k() === K_ConstKeyword) {
    p.reset(start);
    const a2 = cspAttributeDeclarations(p, false);
    const s = cspLocalDeclarationStatement(p, a2);
    if (s >= 0) {
      return cspGlobalStatement(p, s);
    }
    return -1;
  }
  if (p.k() === K_EventKeyword || p.k() === K_FixedKeyword) {
    p.fail("bad top-level member");
    return -1;
  }
  if (p.k() === K_ImplicitKeyword || p.k() === K_ExplicitKeyword) {
    p.fail("bad top-level member");
    return -1;
  }
  if (p.k() === K_NamespaceKeyword) {
    const m0 = p.sp();
    p.push(attrs);
    p.push(mods);
    return cspNamespaceDeclaration(p, m0);
  }
  if (ms.possibleType && cspIsTypeDeclarationStart(p)) {
    return cspTypeDeclaration(p, attrs, mods);
  }
  // a statement
  if (haveMods) {
    // a local function or declaration with modifiers
    p.reset(start);
    const a3 = cspAttributeDeclarations(p, false);
    const s3 = cspLocalDeclarationStatement(p, a3);
    if (s3 >= 0 && !p.err) {
      return cspGlobalStatement(p, s3);
    }
    // Roslyn backs out of a local declaration that starts with an
    // accessibility modifier and parses a member of the compilation unit
    p.reset(start);
    const mk = firstModKind;
    if (mk === K_PublicKeyword || mk === K_PrivateKeyword || mk === K_ProtectedKeyword || mk === K_InternalKeyword) {
      const r = cspMemberDeclarationCore(p, K_CompilationUnit);
      if (r >= 0 && !p.err) {
        return r;
      }
    }
    p.fail("modifiers on a statement");
    return -1;
  }
  p.reset(start);
  const a2 = cspAttributeDeclarations(p, false);
  if (!cspIsPossibleStatement(p)) {
    p.fail("statement expected");
    return -1;
  }
  const saveAsync = p.inAsync;
  p.inAsync = true;
  const s = cspStatementCore(p, a2, true);
  p.inAsync = saveAsync;
  if (s < 0) {
    return -1;
  }
  if (p.t.kind[s] === K_ExpressionStatement && p.t.kind[p.t.s(s, 1)] === K_IdentifierName && p.t.s(s, 2) < 0) {
    p.fail("bad statement");
    return -1;
  }
  return cspGlobalStatement(p, s);
};

const cspGlobalStatement = (p: CsParser, stmt: i32): i32 => {
  if (stmt < 0) {
    return -1;
  }
  const m = p.sp();
  p.push(p.list(p.sp()));
  p.push(p.list(p.sp()));
  p.push(stmt);
  return p.node(K_GlobalStatement, m);
};

// Unused imports kept referenced.
export const cspDeclUnused = (p: CsParser): boolean =>
  cspIsPossibleExpression(p) || cspCanStartExpression(p) || cspIsPossibleType(p) || cspBracketedArgumentList(p) < 0 || K_ArrayType === 0 || K_DotDotToken === 0 || K_FileKeyword === 0;
