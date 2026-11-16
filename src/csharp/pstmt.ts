// Parsing of statements.
//
// Ported from Roslyn's LanguageParser.cs (MIT License, Copyright the .NET
// Foundation and Contributors), for CSharpier 1.4.0 (MIT License, Copyright
// (c) 2021 Bela VanderVoort).

import {
  K_AsteriskToken,
  K_AsyncKeyword,
  K_AwaitKeyword,
  K_Block,
  K_BreakKeyword,
  K_BreakStatement,
  K_CaseKeyword,
  K_CasePatternSwitchLabel,
  K_CaseSwitchLabel,
  K_CatchClause,
  K_CatchDeclaration,
  K_CatchFilterClause,
  K_CatchKeyword,
  K_CheckedKeyword,
  K_CheckedStatement,
  K_CloseBraceToken,
  K_CloseParenToken,
  K_ColonColonToken,
  K_ColonToken,
  K_CommaToken,
  K_ConstKeyword,
  K_ConstantPattern,
  K_ContinueKeyword,
  K_ContinueStatement,
  K_DeclarationExpression,
  K_DefaultKeyword,
  K_DefaultSwitchLabel,
  K_DiscardDesignation,
  K_DoKeyword,
  K_DoStatement,
  K_DotToken,
  K_ElseClause,
  K_ElseKeyword,
  K_EmptyStatement,
  K_EndOfFileToken,
  K_EqualsGreaterThanToken,
  K_EqualsToken,
  K_ExclamationToken,
  K_ExpressionStatement,
  K_ExternKeyword,
  K_FinallyClause,
  K_FinallyKeyword,
  K_FixedKeyword,
  K_FixedStatement,
  K_ForEachKeyword,
  K_ForEachStatement,
  K_ForEachVariableStatement,
  K_ForKeyword,
  K_ForStatement,
  K_GotoCaseStatement,
  K_GotoDefaultStatement,
  K_GotoKeyword,
  K_GotoStatement,
  K_IdentifierName,
  K_IdentifierToken,
  K_IfKeyword,
  K_IfStatement,
  K_InKeyword,
  K_InternalKeyword,
  K_LabeledStatement,
  K_LessThanToken,
  K_LocalDeclarationStatement,
  K_LocalFunctionStatement,
  K_LockKeyword,
  K_LockStatement,
  K_MinusGreaterThanToken,
  K_MinusMinusToken,
  K_NullableType,
  K_OpenBraceToken,
  K_OpenBracketToken,
  K_OpenParenToken,
  K_ParenthesizedExpression,
  K_PlusPlusToken,
  K_PredefinedType,
  K_PrivateKeyword,
  K_ProtectedKeyword,
  K_PublicKeyword,
  K_QuestionToken,
  K_ReadOnlyKeyword,
  K_RefKeyword,
  K_ReturnKeyword,
  K_ReturnStatement,
  K_SafeKeyword,
  K_ScopedKeyword,
  K_ScopedType,
  K_SemicolonToken,
  K_SingleVariableDesignation,
  K_StaticKeyword,
  K_SwitchKeyword,
  K_SwitchSection,
  K_SwitchStatement,
  K_ThisKeyword,
  K_ThrowKeyword,
  K_ThrowStatement,
  K_TryKeyword,
  K_TryStatement,
  K_TupleExpression,
  K_UncheckedKeyword,
  K_UncheckedStatement,
  K_UnsafeKeyword,
  K_UnsafeStatement,
  K_UsingKeyword,
  K_UsingStatement,
  K_VariableDeclaration,
  K_VoidKeyword,
  K_VolatileKeyword,
  K_WhenKeyword,
  K_WhereKeyword,
  K_WhileKeyword,
  K_WhileStatement,
  K_WithKeyword,
  K_YieldBreakStatement,
  K_YieldKeyword,
  K_YieldReturnStatement,
} from "./kinds";
import {
  CsParser,
  PT_NORMAL,
  ST_GENERIC_TYPE_OR_EXPRESSION,
  ST_MUST_BE_TYPE,
  ST_NON_GENERIC_TYPE_OR_EXPRESSION,
  ST_NOT_TYPE,
  ST_NULLABLE_TYPE,
  csIsPredefinedType,
  cspIdentifierName,
  cspIdentifierToken,
  cspIsTrueIdentifier,
  cspIsTrueIdentifierAt,
  cspIsTypeDeclarationStart,
  cspScanType,
  cspType,
  cspTypeOrVoid,
  cspModifierKind,
} from "./parser";
import {
  VF_CONST,
  VF_FOR_STATEMENT,
  VF_LOCAL_OR_FIELD,
  cspAttributeDeclarations,
  cspBodies,
  cspIsDefiniteScopedModifier,
  cspParenthesizedParameterList,
  cspTypeParameterConstraintClauses,
  cspTypeParameterList,
  cspVariableDeclarators,
  cspArrowExpressionClause,
} from "./pdecl";
import {
  cspBracketedArgumentList,
  cspCollectionExpression,
  cspDeclarationExpression,
  cspExpressionCore,
  cspExpressionOrPatternForSwitchStatement,
  cspIsAwaitExpression,
  cspIsExpectedAssignmentOperator,
  cspIsExpectedBinaryOperator,
  cspIsPossibleAwaitExpressionStatement,
  cspIsPossibleDeclarationExpression,
  cspIsPossibleExpression,
  cspIsQueryExpression,
  cspPossibleRefExpression,
  cspQueryExpression,
  cspSubExpression,
  cspWhenClause,
  PREC_EXPRESSION,
  cspIsPatternKind,
} from "./pexpr";

/** A block; `attrs` is its attribute list. */
export const cspBlock = (p: CsParser, attrs: i32): i32 => {
  const m = p.sp();
  p.push(attrs);
  p.push(p.expect(K_OpenBraceToken));
  const lm = p.sp();
  cspStatements(p, false);
  p.push(p.list(lm));
  p.push(p.expect(K_CloseBraceToken));
  return p.node(K_Block, m);
};

/** Pushes statements until `}` (or a switch section when stopOnSwitchSections). */
const cspStatements = (p: CsParser, stopOnSwitchSections: boolean): void => {
  while (!p.err) {
    const k = p.k();
    if (k === K_CloseBraceToken || k === K_EndOfFileToken) {
      break;
    }
    if (stopOnSwitchSections && cspIsPossibleSwitchSection(p)) {
      break;
    }
    if (!cspIsPossibleStatement(p)) {
      p.fail("statement expected");
      break;
    }
    const s = cspPossiblyAttributedStatement(p);
    if (s < 0) {
      if (!p.err) {
        p.fail("statement expected");
      }
      break;
    }
    p.push(s);
  }
};

const cspPossiblyAttributedStatement = (p: CsParser): i32 => cspStatementCore(p, cspStatementAttributeDeclarations(p), false);

const cspStatementAttributeDeclarations = (p: CsParser): i32 => {
  if (p.k() !== K_OpenBracketToken) {
    return p.list(p.sp());
  }
  const rp = p.mark();
  cspCollectionExpression(p);
  let hadBracket = false;
  while (p.k() === K_OpenBracketToken && !p.err) {
    cspBracketedArgumentList(p);
    hadBracket = true;
  }
  const k = p.k();
  let isCollection =
    k === K_DotToken || k === K_QuestionToken || k === K_ExclamationToken || k === K_PlusPlusToken || k === K_MinusMinusToken || k === K_MinusGreaterThanToken;
  isCollection =
    isCollection ||
    cspIsExpectedBinaryOperator(k) ||
    cspIsExpectedAssignmentOperator(k) ||
    (k === K_IdentifierToken && (p.ck() === K_SwitchKeyword || p.ck() === K_WithKeyword) && p.kindAt(1) === K_OpenBraceToken);
  if (!p.err && !isCollection && hadBracket && p.k() === K_OpenParenToken) {
    const save = p.err;
    cspTypeOrVoid(p);
    isCollection = p.err || !cspIsTrueIdentifier(p);
    p.err = save;
  }
  p.reset(rp);
  if (isCollection) {
    return p.list(p.sp());
  }
  return cspAttributeDeclarations(p, true);
};

export const cspIsPossibleStatement = (p: CsParser): boolean => {
  if (cspIsDefiniteStatement(p)) {
    return true;
  }
  const k = p.k();
  switch (k) {
    case K_CheckedKeyword:
    case K_UncheckedKeyword:
    case K_ThrowKeyword:
    case K_SwitchKeyword:
    case K_OpenBraceToken:
    case K_SemicolonToken:
    case K_StaticKeyword:
    case K_ReadOnlyKeyword:
    case K_RefKeyword:
    case K_OpenBracketToken:
      return true;
    case K_IdentifierToken:
      return cspIsTrueIdentifier(p);
    default:
      return csIsPredefinedType(k) || cspIsPossibleExpression(p);
  }
};

const cspIsDefiniteStatement = (p: CsParser): boolean => {
  switch (p.k()) {
    case K_FixedKeyword:
    case K_BreakKeyword:
    case K_ContinueKeyword:
    case K_TryKeyword:
    case K_ConstKeyword:
    case K_DoKeyword:
    case K_ForKeyword:
    case K_ForEachKeyword:
    case K_GotoKeyword:
    case K_IfKeyword:
    case K_ElseKeyword:
    case K_LockKeyword:
    case K_ReturnKeyword:
    case K_UnsafeKeyword:
    case K_UsingKeyword:
    case K_WhileKeyword:
    case K_VolatileKeyword:
    case K_ExternKeyword:
    case K_CaseKeyword:
      return true;
    default:
      return false;
  }
};

/** ParseStatementCore. */
export const cspStatementCore = (p: CsParser, attrs: i32, isGlobal: boolean): i32 => {
  p.depth = p.depth + 1;
  if (p.depth > 400) {
    p.fail("too deep");
    return -1;
  }
  const r = cspStatementCoreImpl(p, attrs, isGlobal);
  p.depth = p.depth - 1;
  return r;
};

const cspStatementCoreImpl = (p: CsParser, attrs: i32, isGlobal: boolean): i32 => {
  const start = p.mark();
  switch (p.k()) {
    case K_FixedKeyword:
      return cspFixedStatement(p, attrs);
    case K_BreakKeyword:
      return cspBreakOrContinue(p, attrs, K_BreakStatement);
    case K_ContinueKeyword:
      return cspBreakOrContinue(p, attrs, K_ContinueStatement);
    case K_TryKeyword:
      return cspTryStatement(p, attrs);
    case K_CatchKeyword:
    case K_FinallyKeyword:
      p.fail("try expected");
      return -1;
    case K_CheckedKeyword:
    case K_UncheckedKeyword:
      return cspCheckedStatement(p, attrs);
    case K_DoKeyword:
      return cspDoStatement(p, attrs);
    case K_ForKeyword:
      return cspForOrForEachStatement(p, attrs);
    case K_ForEachKeyword:
      return cspForEachStatement(p, attrs, -1);
    case K_GotoKeyword:
      return cspGotoStatement(p, attrs);
    case K_IfKeyword:
      return cspIfStatement(p, attrs);
    case K_ElseKeyword:
      p.fail("else cannot start a statement");
      return -1;
    case K_LockKeyword:
      return cspLockStatement(p, attrs);
    case K_ReturnKeyword:
      return cspReturnStatement(p, attrs);
    case K_SwitchKeyword:
      return cspSwitchStatement(p, attrs);
    case K_CaseKeyword:
      p.fail("case outside switch");
      return -1;
    case K_ThrowKeyword:
      return cspThrowStatement(p, attrs);
    case K_UnsafeKeyword: {
      const k1 = p.kindAt(1);
      if (k1 === K_OpenParenToken) {
        const m = p.mark();
        const r = cspLocalDeclarationStatement(p, attrs);
        if (r >= 0 && !p.err && p.t.kind[r] === K_LocalFunctionStatement) {
          return r;
        }
        p.reset(m);
        return cspExpressionStatement(p, attrs);
      }
      if (k1 === K_OpenBraceToken) {
        const m = p.sp();
        p.push(attrs);
        p.push(p.eat());
        p.push(cspBlock(p, cspAttributeDeclarations(p, false)));
        return p.node(K_UnsafeStatement, m);
      }
      break;
    }
    case K_UsingKeyword:
      return p.kindAt(1) === K_OpenParenToken ? cspUsingStatement(p, attrs, -1) : cspLocalDeclarationStatement(p, attrs);
    case K_WhileKeyword:
      return cspWhileStatement(p, attrs);
    case K_OpenBraceToken:
      return cspBlock(p, attrs);
    case K_SemicolonToken: {
      const m = p.sp();
      p.push(attrs);
      p.push(p.eat());
      return p.node(K_EmptyStatement, m);
    }
    case K_IdentifierToken: {
      const r = cspTryStatementStartingWithIdentifier(p, attrs, isGlobal);
      if (r >= 0 || p.err) {
        return r;
      }
      break;
    }
    default:
      break;
  }
  // ParseStatementCoreRest
  if (!cspIsPossibleLocalDeclarationStatement(p)) {
    return cspExpressionStatement(p, attrs);
  }
  const beginsWithAwait = p.k() === K_IdentifierToken && p.ck() === K_AwaitKeyword;
  const r = cspLocalDeclarationStatement(p, attrs);
  if (p.err && beginsWithAwait && !p.inAsync) {
    p.reset(start);
    const save = p.inAsync;
    p.inAsync = true;
    const e = cspExpressionStatement(p, attrs);
    p.inAsync = save;
    return e;
  }
  if (r < 0 && !p.err) {
    p.reset(start);
    return -1;
  }
  return r;
};

const cspTryStatementStartingWithIdentifier = (p: CsParser, attrs: i32, isGlobal: boolean): i32 => {
  const ck = p.ck();
  if (ck === K_AwaitKeyword && p.kindAt(1) === K_ForEachKeyword) {
    return cspForEachStatement(p, attrs, p.eatContextual(K_AwaitKeyword));
  }
  if (ck === K_AwaitKeyword && p.kindAt(1) === K_UsingKeyword) {
    if (p.kindAt(2) === K_OpenParenToken) {
      return cspUsingStatement(p, attrs, p.eatContextual(K_AwaitKeyword));
    }
    return -1;
  }
  if (p.kindAt(1) === K_ColonToken && cspIsTrueIdentifier(p)) {
    return cspLabeledStatement(p, attrs);
  }
  if (ck === K_YieldKeyword && (p.kindAt(1) === K_ReturnKeyword || p.kindAt(1) === K_BreakKeyword)) {
    return cspYieldStatement(p, attrs);
  }
  if (cspIsPossibleAwaitExpressionStatement(p)) {
    return cspExpressionStatement(p, attrs);
  }
  if (cspIsQueryExpression(p, true, false)) {
    return cspExpressionStatementWith(p, attrs, cspQueryExpression(p));
  }
  if (isGlobal) {
    return -1;
  }
  return -1;
};

const cspIsDeclarationModifier = (k: i32): boolean =>
  k === K_ConstKeyword || k === K_StaticKeyword || k === K_ReadOnlyKeyword || k === K_VolatileKeyword;

const cspIsAdditionalLocalFunctionModifier = (k: i32): boolean =>
  k === K_StaticKeyword ||
  k === K_AsyncKeyword ||
  k === K_UnsafeKeyword ||
  k === K_SafeKeyword ||
  k === K_ExternKeyword ||
  k === K_PublicKeyword ||
  k === K_InternalKeyword ||
  k === K_ProtectedKeyword ||
  k === K_PrivateKeyword;

/** The ContextualKind of the current token: its kind for a keyword, its contextual kind for an identifier. */
const cspCk = (p: CsParser, i: i32): i32 => (p.kindAt(i) === K_IdentifierToken ? p.ckAt(i) : p.kindAt(i));

const cspIsPossibleLocalDeclarationStatement = (p: CsParser): boolean => {
  const tk = p.k();
  if (tk === K_RefKeyword || cspIsDeclarationModifier(tk) || (csIsPredefinedType(tk) && p.kindAt(1) !== K_DotToken && p.kindAt(1) !== K_OpenParenToken)) {
    return true;
  }
  if (tk === K_UsingKeyword) {
    return true;
  }
  if (p.k() === K_IdentifierToken && p.ck() === K_AwaitKeyword && p.kindAt(1) === K_UsingKeyword) {
    return true;
  }
  if (cspIsDefiniteScopedModifier(p, false, false)) {
    return true;
  }
  const ck = cspCk(p, 0);
  const isPossibleModifier =
    cspIsAdditionalLocalFunctionModifier(ck) &&
    (!(ck === K_AsyncKeyword || ck === K_SafeKeyword || ck === K_ScopedKeyword) || cspShouldContextualKeywordBeTreatedAsModifierStmt(p));
  if (isPossibleModifier) {
    return true;
  }
  return cspIsPossibleFirstTypedIdentifierInLocalDeclarationStatement(p);
};

/** ShouldContextualKeywordBeTreatedAsModifier(parsingStatementNotDeclaration: true). */
const cspShouldContextualKeywordBeTreatedAsModifierStmt = (p: CsParser): boolean => {
  if (p.k() !== K_IdentifierToken) {
    return true;
  }
  const k1 = p.kindAt(1);
  if (k1 !== K_IdentifierToken && cspIsStatementModifierKeyword(k1)) {
    return true;
  }
  const m = p.mark();
  p.eat();
  let r = false;
  if (cspScanType(p, PT_NORMAL) !== ST_NOT_TYPE) {
    const k = p.k();
    if (k === K_IdentifierToken || k === K_ThisKeyword) {
      r = true;
    } else if (k === K_EndOfFileToken || k === K_CloseBraceToken || csIsPredefinedType(k)) {
      r = true;
    } else if (cspIsStatementModifierKeyword(k)) {
      r = true;
    } else if (cspIsTypeDeclarationStart(p)) {
      r = true;
    }
  }
  p.reset(m);
  return r;
};

const cspIsStatementModifierKeyword = (k: i32): boolean => cspModifierKind(k, 0) !== 0;

/** IsPossibleTypedIdentifierStart: 1 true, 0 false, -1 unknown. */
const cspIsPossibleTypedIdentifierStart = (p: CsParser, i: i32, allowThisKeyword: boolean): i32 => {
  if (cspIsTrueIdentifierAt(p, i)) {
    switch (p.kindAt(i + 1)) {
      case K_DotToken:
      case K_AsteriskToken:
      case K_QuestionToken:
      case K_OpenBracketToken:
      case K_LessThanToken:
      case K_ColonColonToken:
        return -1;
      case K_OpenParenToken:
        return p.t.tokIs(p.tokAt(i), "var") ? -1 : 0;
      case K_IdentifierToken:
        return cspIsTrueIdentifierAt(p, i + 1) ? 1 : 0;
      case K_ThisKeyword:
        return allowThisKeyword ? 1 : 0;
      default:
        return 0;
    }
  }
  return -1;
};

export const cspIsPossibleTypedIdentifierStartAt = (p: CsParser, i: i32, allowThisKeyword: boolean): i32 => cspIsPossibleTypedIdentifierStart(p, i, allowThisKeyword);

const cspIsPossibleFirstTypedIdentifierInLocalDeclarationStatement = (p: CsParser): boolean => {
  const ti = cspIsPossibleTypedIdentifierStart(p, 0, false);
  if (ti >= 0) {
    return ti === 1;
  }
  if (p.k() === K_IdentifierToken && p.kindAt(1) === K_DotToken) {
    // a `.` at the end of a line followed by `a b` that is not a declaration
    const dt = p.tokAt(1);
    let eol = false;
    for (let r = p.lx.t0[dt]; r < p.lx.t1[dt]; r++) {
      if (p.lx.trKind[r] === 8539) {
        eol = true;
      }
    }
    if (eol && p.kindAt(2) === K_IdentifierToken && p.kindAt(3) === K_IdentifierToken) {
      const k4 = p.kindAt(4);
      if (k4 !== K_SemicolonToken && k4 !== K_EqualsToken && k4 !== K_CommaToken && k4 !== K_OpenParenToken && k4 !== K_LessThanToken) {
        return false;
      }
    }
  }
  const m = p.mark();
  const st = cspScanType(p, PT_NORMAL);
  let r = false;
  if (st === ST_MUST_BE_TYPE && p.k() !== K_DotToken && p.k() !== K_OpenParenToken) {
    r = true;
  } else if (st === ST_NOT_TYPE) {
    r = false;
  } else if (p.k() !== K_IdentifierToken) {
    const ak = p.k();
    r =
      st === ST_GENERIC_TYPE_OR_EXPRESSION &&
      (cspIsDefiniteStatement(p) || cspIsTypeDeclarationStart(p) || ak === K_PublicKeyword || ak === K_PrivateKeyword || ak === K_ProtectedKeyword || ak === K_InternalKeyword);
  } else {
    r = true;
  }
  p.reset(m);
  return r;
};

/** ParseLocalDeclarationStatement: a local declaration or a local function. */
export const cspLocalDeclarationStatement = (p: CsParser, attrs: i32): i32 => {
  let awaitKw = -1;
  let usingKw = -1;
  let canParseAsLocalFunction = false;
  if (p.k() === K_IdentifierToken && p.ck() === K_AwaitKeyword && p.kindAt(1) === K_UsingKeyword) {
    awaitKw = p.eatContextual(K_AwaitKeyword);
    usingKw = p.eat();
  } else if (p.k() === K_UsingKeyword) {
    usingKw = p.eat();
  } else {
    canParseAsLocalFunction = true;
  }
  const mods: i32[] = [];
  cspLocalDeclarationStatementModifiers(p, mods, usingKw >= 0);
  let scoped = -1;
  if (cspIsDefiniteScopedModifier(p, false, false)) {
    scoped = p.eatContextual(K_ScopedKeyword);
  }
  let isConst = false;
  for (const t of mods) {
    if (p.lx.kind[t] === K_ConstKeyword) {
      isConst = true;
    }
  }
  let type = canParseAsLocalFunction ? cspTypeOrVoid(p) : cspType(p, PT_NORMAL);
  if (p.err) {
    return -1;
  }
  const flags = VF_LOCAL_OR_FIELD | (isConst ? VF_CONST : 0);
  // a local function: ParseVariableDeclarators with allowLocalFunctions
  if (canParseAsLocalFunction && p.k() === K_IdentifierToken && (p.kindAt(1) === K_OpenParenToken || p.kindAt(1) === K_LessThanToken)) {
    const save = p.mark();
    const name = p.eat();
    const lf = cspLocalFunctionBody(p, attrs, mods, scoped, type, name);
    if (lf >= 0) {
      return lf;
    }
    if (p.err) {
      return -1;
    }
    p.reset(save);
  }
  if (canParseAsLocalFunction && p.t.count(attrs) === 0 && mods.length > 0) {
    const k0 = p.lx.kind[mods[0]];
    if (k0 === K_PublicKeyword || k0 === K_PrivateKeyword || k0 === K_ProtectedKeyword || k0 === K_InternalKeyword) {
      return -1;
    }
  }
  if (scoped >= 0) {
    const sm = p.sp();
    p.push(scoped);
    p.push(type);
    type = p.node(K_ScopedType, sm);
  }
  if (usingKw < 0) {
    for (const t of mods) {
      if (cspIsAdditionalLocalFunctionModifier(cspTokenCk(p, t))) {
        p.fail("bad member flag");
        return -1;
      }
    }
  }
  const m = p.sp();
  p.push(attrs);
  p.push(awaitKw);
  p.push(usingKw);
  const mm = p.sp();
  for (const t of mods) {
    p.push(t);
  }
  p.push(p.list(mm));
  const dm = p.sp();
  p.push(type);
  cspVariableDeclarators(p, type, flags, false, false);
  p.push(p.node(K_VariableDeclaration, dm));
  if (type >= 0 && p.t.kind[type] === K_PredefinedType && p.lx.kind[p.t.s(type, 0)] === K_VoidKeyword) {
    p.fail("void here");
    return -1;
  }
  p.push(p.expect(K_SemicolonToken));
  return p.node(K_LocalDeclarationStatement, m);
};

const cspTokenCk = (p: CsParser, t: i32): i32 => (p.lx.kind[t] === K_IdentifierToken ? p.lx.ck[t] : p.lx.kind[t]);

const cspLocalDeclarationStatementModifiers = (p: CsParser, mods: i32[], isUsing: boolean): void => {
  while (!p.err) {
    const k = cspCk(p, 0);
    if (!(cspIsDeclarationModifier(k) || cspIsAdditionalLocalFunctionModifier(k))) {
      break;
    }
    let mod = -1;
    if (k === K_AsyncKeyword || k === K_SafeKeyword) {
      if (p.k() === K_IdentifierToken) {
        if (!cspShouldTreatAsLocalModifier(p)) {
          break;
        }
        mod = p.eatContextual(k);
      } else {
        mod = p.eat();
      }
    } else {
      mod = p.eat();
    }
    if (isUsing) {
      p.fail("no modifiers on using");
      return;
    }
    if (k === K_ReadOnlyKeyword || k === K_VolatileKeyword) {
      p.fail("bad member flag");
      return;
    }
    mods.push(mod);
  }
};

const cspShouldTreatAsLocalModifier = (p: CsParser): boolean => {
  const m = p.mark();
  let r = false;
  do {
    p.eat();
    if (cspIsDeclarationModifier(p.k()) || cspIsAdditionalLocalFunctionModifier(p.k())) {
      r = true;
      break;
    }
    const m2 = p.mark();
    if (cspScanType(p, PT_NORMAL) !== ST_NOT_TYPE && p.k() === K_IdentifierToken) {
      r = true;
    }
    p.reset(m2);
    if (r) {
      break;
    }
  } while (cspIsAdditionalLocalFunctionModifier(cspCk(p, 0)));
  p.reset(m);
  return r;
};

/** TryParseLocalFunctionStatementBody (from the parser of fields, for top level `void F()` shapes). */
export const cspTryLocalFunctionBody = (p: CsParser, type: i32, name: i32): i32 => cspLocalFunctionBody(p, p.list(p.sp()), [], -1, type, name);

const cspLocalFunctionBody = (p: CsParser, attrs: i32, mods: i32[], scoped: i32, type: i32, name: i32): i32 => {
  const rp = p.mark();
  let force = true;
  if (type >= 0 && p.t.kind[type] === K_IdentifierName) {
    force = p.lx.ck[p.t.s(type, 0)] !== K_AwaitKeyword;
  }
  let isAsync = false;
  for (const t of mods) {
    const c = cspTokenCk(p, t);
    if (c === K_AsyncKeyword || c === K_UnsafeKeyword || c === K_SafeKeyword) {
      force = true;
    }
    if (c === K_AsyncKeyword) {
      isAsync = true;
    }
    if (!(c === K_AsyncKeyword || c === K_UnsafeKeyword || c === K_SafeKeyword || c === K_ReadOnlyKeyword || c === K_VolatileKeyword || c === K_StaticKeyword || c === K_ExternKeyword)) {
      p.fail("bad member flag");
      return -1;
    }
  }
  if (scoped >= 0) {
    p.fail("scoped local function");
    return -1;
  }
  const saveAsync = p.inAsync;
  p.inAsync = isAsync;
  const m = p.sp();
  p.push(attrs);
  const mm = p.sp();
  for (const t of mods) {
    p.push(t);
  }
  p.push(p.list(mm));
  p.push(type);
  p.push(name);
  p.push(cspTypeParameterList(p));
  p.push(cspParenthesizedParameterList(p, false));
  const cm = p.sp();
  if (p.k() === K_IdentifierToken && p.ck() === K_WhereKeyword) {
    cspTypeParameterConstraintClauses(p);
    force = true;
  }
  p.push(p.list(cm));
  // ParseBlockAndExpressionBodiesWithSemicolon(parseSemicolonAfterBlock: false)
  let block = -1;
  let expr = -1;
  if (p.k() === K_SemicolonToken) {
    p.push(-1);
    p.push(-1);
    p.push(p.eat());
  } else {
    block = p.k() === K_OpenBraceToken ? cspBlock(p, p.list(p.sp())) : -1;
    expr = p.k() === K_EqualsGreaterThanToken ? cspArrowExpressionClauseStmt(p) : -1;
    p.push(block);
    p.push(expr);
    if (expr >= 0 || block < 0) {
      p.push(p.expect(K_SemicolonToken));
    } else {
      p.push(-1);
    }
  }
  p.inAsync = saveAsync;
  if (p.err) {
    if (!force) {
      p.reset(rp);
      return -1;
    }
    return -1;
  }
  if (!force && block < 0 && expr < 0) {
    p.reset(rp);
    return -1;
  }
  return p.node(K_LocalFunctionStatement, m);
};

const cspArrowExpressionClauseStmt = (p: CsParser): i32 => cspArrowExpressionClause(p);

export const cspExpressionStatement = (p: CsParser, attrs: i32): i32 => cspExpressionStatementWith(p, attrs, cspExpressionCore(p));

const cspExpressionStatementWith = (p: CsParser, attrs: i32, e: i32): i32 => {
  const m = p.sp();
  p.push(attrs);
  p.push(e);
  p.push(p.expect(K_SemicolonToken));
  return p.node(K_ExpressionStatement, m);
};

const cspEmbeddedStatement = (p: CsParser): i32 => {
  const s = cspPossiblyAttributedStatement(p);
  if (s < 0 && !p.err) {
    p.fail("embedded statement expected");
  }
  return s;
};

const cspFixedStatement = (p: CsParser, attrs: i32): i32 => {
  const m = p.sp();
  p.push(attrs);
  p.push(p.expect(K_FixedKeyword));
  p.push(p.expect(K_OpenParenToken));
  p.push(cspParenthesizedVariableDeclaration(p, 0, -1));
  p.push(p.expect(K_CloseParenToken));
  p.push(cspEmbeddedStatement(p));
  return p.node(K_FixedStatement, m);
};

const cspBreakOrContinue = (p: CsParser, attrs: i32, kind: i32): i32 => {
  const m = p.sp();
  p.push(attrs);
  p.push(p.eat());
  p.push(cspIsTrueIdentifier(p) ? cspIdentifierName(p) : -1);
  p.push(p.expect(K_SemicolonToken));
  return p.node(kind, m);
};

const cspTryStatement = (p: CsParser, attrs: i32): i32 => {
  const m = p.sp();
  p.push(attrs);
  p.push(p.expect(K_TryKeyword));
  p.push(cspBlock(p, cspAttributeDeclarations(p, false)));
  const cm = p.sp();
  let n = 0;
  while (p.k() === K_CatchKeyword && !p.err) {
    p.push(cspCatchClause(p));
    n++;
  }
  p.push(p.list(cm));
  if (p.k() === K_FinallyKeyword) {
    const fm = p.sp();
    p.push(p.eat());
    p.push(cspBlock(p, cspAttributeDeclarations(p, false)));
    p.push(p.node(K_FinallyClause, fm));
  } else {
    if (n === 0) {
      p.fail("catch or finally expected");
      return -1;
    }
    p.push(-1);
  }
  return p.node(K_TryStatement, m);
};

const cspCatchClause = (p: CsParser): i32 => {
  const m = p.sp();
  p.push(p.eat());
  if (p.k() === K_OpenParenToken) {
    const dm = p.sp();
    p.push(p.eat());
    p.push(cspType(p, PT_NORMAL));
    p.push(cspIsTrueIdentifier(p) ? cspIdentifierToken(p) : -1);
    p.push(p.expect(K_CloseParenToken));
    p.push(p.node(K_CatchDeclaration, dm));
  } else {
    p.push(-1);
  }
  if (p.k() === K_IdentifierToken && p.ck() === K_WhenKeyword) {
    const fm = p.sp();
    p.push(p.eatContextual(K_WhenKeyword));
    p.push(p.expect(K_OpenParenToken));
    p.push(cspExpressionCore(p));
    p.push(p.expect(K_CloseParenToken));
    p.push(p.node(K_CatchFilterClause, fm));
  } else if (p.k() === K_IfKeyword) {
    p.fail("if instead of when");
    return -1;
  } else {
    p.push(-1);
  }
  p.push(cspBlock(p, cspAttributeDeclarations(p, false)));
  return p.node(K_CatchClause, m);
};

const cspCheckedStatement = (p: CsParser, attrs: i32): i32 => {
  if (p.kindAt(1) === K_OpenParenToken) {
    return cspExpressionStatement(p, attrs);
  }
  const m = p.sp();
  p.push(attrs);
  const kw = p.eat();
  p.push(kw);
  p.push(cspBlock(p, cspAttributeDeclarations(p, false)));
  return p.node(p.lx.kind[kw] === K_CheckedKeyword ? K_CheckedStatement : K_UncheckedStatement, m);
};

const cspDoStatement = (p: CsParser, attrs: i32): i32 => {
  const m = p.sp();
  p.push(attrs);
  p.push(p.expect(K_DoKeyword));
  p.push(cspEmbeddedStatement(p));
  p.push(p.expect(K_WhileKeyword));
  p.push(p.expect(K_OpenParenToken));
  p.push(cspExpressionCore(p));
  p.push(p.expect(K_CloseParenToken));
  p.push(p.expect(K_SemicolonToken));
  return p.node(K_DoStatement, m);
};

const cspForOrForEachStatement = (p: CsParser, attrs: i32): i32 => {
  const m = p.mark();
  p.eat();
  let isForEach = false;
  const op = p.eat();
  if (p.lx.kind[op] === K_OpenParenToken && cspScanType(p, PT_NORMAL) !== ST_NOT_TYPE) {
    if (p.k() === K_IdentifierToken) {
      p.eat();
      if (p.k() === K_InKeyword) {
        isForEach = true;
      }
    }
  }
  p.reset(m);
  return isForEach ? cspForEachStatement(p, attrs, -1) : cspForStatement(p, attrs);
};

const cspForStatement = (p: CsParser, attrs: i32): i32 => {
  const m = p.sp();
  p.push(attrs);
  p.push(p.expect(K_ForKeyword));
  p.push(p.expect(K_OpenParenToken));
  // the declaration or the initializers
  let isDecl = false;
  {
    const rp = p.mark();
    if (p.k() === K_IdentifierToken && p.ck() === K_ScopedKeyword) {
      if (p.kindAt(1) === K_RefKeyword) {
        isDecl = true;
      } else {
        p.eat();
        isDecl = cspScanType(p, PT_NORMAL) !== ST_NOT_TYPE && p.k() === K_IdentifierToken;
        p.reset(rp);
      }
    } else if (p.k() === K_RefKeyword) {
      isDecl = true;
    }
    if (!isDecl) {
      isDecl = !cspIsQueryExpression(p, true, false) && cspScanType(p, PT_NORMAL) !== ST_NOT_TYPE && cspIsTrueIdentifier(p);
      p.reset(rp);
    }
  }
  if (isDecl) {
    let scoped = -1;
    if (cspIsDefiniteScopedModifier(p, false, false)) {
      scoped = p.eatContextual(K_ScopedKeyword);
    }
    p.push(cspParenthesizedVariableDeclaration(p, VF_FOR_STATEMENT, scoped));
    p.push(p.list(p.sp()));
  } else {
    p.push(-1);
    const lm = p.sp();
    if (p.k() !== K_SemicolonToken) {
      cspExpressionList(p);
    }
    p.push(p.list(lm));
  }
  p.push(p.expect(K_SemicolonToken));
  p.push(p.k() !== K_SemicolonToken && p.k() !== K_CommaToken ? cspExpressionCore(p) : -1);
  p.push(p.expect(K_SemicolonToken));
  const im = p.sp();
  if (p.k() !== K_CloseParenToken) {
    cspExpressionList(p);
  }
  p.push(p.list(im));
  p.push(p.expect(K_CloseParenToken));
  p.push(cspEmbeddedStatement(p));
  return p.node(K_ForStatement, m);
};

/** A comma separated list of expressions (items pushed). */
const cspExpressionList = (p: CsParser): void => {
  if (!(p.k() === K_CommaToken || cspIsPossibleExpression(p))) {
    p.fail("expression expected");
    return;
  }
  p.push(cspExpressionCore(p));
  while (p.k() === K_CommaToken && !p.err) {
    p.push(p.eat());
    p.push(cspExpressionCore(p));
  }
};

const cspForEachStatement = (p: CsParser, attrs: i32, awaitTok: i32): i32 => {
  if (p.k() === K_ForKeyword) {
    p.fail("for instead of foreach");
    return -1;
  }
  const fe = p.expect(K_ForEachKeyword);
  const op = p.expect(K_OpenParenToken);
  const variable = cspExpressionOrDeclaration(p, PT_NORMAL, true);
  const inKw = p.expect(K_InKeyword);
  if (p.err) {
    return -1;
  }
  const vk = p.t.kind[variable];
  if (!(vk === K_DeclarationExpression || vk === K_TupleExpression || (vk === K_IdentifierName && p.t.tokIs(p.t.s(variable, 0), "_")))) {
    p.fail("bad foreach declaration");
    return -1;
  }
  const expr = cspExpressionCore(p);
  const cp = p.expect(K_CloseParenToken);
  const stmt = cspEmbeddedStatement(p);
  const m = p.sp();
  p.push(attrs);
  p.push(awaitTok);
  p.push(fe);
  p.push(op);
  if (vk === K_DeclarationExpression) {
    const des = p.t.s(variable, 1);
    const dk = p.t.kind[des];
    if (dk === K_SingleVariableDesignation || dk === K_DiscardDesignation) {
      p.push(p.t.s(variable, 0));
      p.push(p.t.s(des, 0));
      p.push(inKw);
      p.push(expr);
      p.push(cp);
      p.push(stmt);
      return p.node(K_ForEachStatement, m);
    }
  }
  p.push(variable);
  p.push(inKw);
  p.push(expr);
  p.push(cp);
  p.push(stmt);
  return p.node(K_ForEachVariableStatement, m);
};

export const cspExpressionOrDeclaration = (p: CsParser, mode: i32, permitTupleDesignation: boolean): i32 => {
  const d = cspIsPossibleDeclarationExpression(p, mode, permitTupleDesignation);
  if (d !== 0) {
    return cspDeclarationExpression(p, mode, d === 2);
  }
  return cspSubExpression(p, PREC_EXPRESSION);
};

const cspGotoStatement = (p: CsParser, attrs: i32): i32 => {
  const m = p.sp();
  p.push(attrs);
  p.push(p.expect(K_GotoKeyword));
  let kind = K_GotoStatement;
  if (p.k() === K_CaseKeyword || p.k() === K_DefaultKeyword) {
    const t = p.eat();
    p.push(t);
    if (p.lx.kind[t] === K_CaseKeyword) {
      kind = K_GotoCaseStatement;
      p.push(cspExpressionCore(p));
    } else {
      kind = K_GotoDefaultStatement;
      p.push(-1);
    }
  } else {
    p.push(-1);
    p.push(cspIdentifierName(p));
  }
  p.push(p.expect(K_SemicolonToken));
  return p.node(kind, m);
};

const cspIfStatement = (p: CsParser, attrs: i32): i32 => {
  // iteratively for long else-if chains
  const ifs: i32[] = [];
  const opens: i32[] = [];
  const conds: i32[] = [];
  const closes: i32[] = [];
  const stmts: i32[] = [];
  const elses: i32[] = [];
  let alternative = -1;
  while (!p.err) {
    ifs.push(p.expect(K_IfKeyword));
    opens.push(p.expect(K_OpenParenToken));
    conds.push(cspExpressionCore(p));
    closes.push(p.expect(K_CloseParenToken));
    stmts.push(cspEmbeddedStatement(p));
    const el = p.k() === K_ElseKeyword ? p.eat() : -1;
    elses.push(el);
    if (el < 0) {
      alternative = -1;
      break;
    }
    if (p.k() !== K_IfKeyword) {
      alternative = cspEmbeddedStatement(p);
      break;
    }
  }
  if (p.err) {
    return -1;
  }
  let result = -1;
  for (let i = toI32(ifs.length) - 1; i >= 0; i--) {
    let elseClause = -1;
    if (alternative >= 0) {
      const em = p.sp();
      p.push(elses[i]);
      p.push(alternative);
      elseClause = p.node(K_ElseClause, em);
    }
    const m = p.sp();
    p.push(i === 0 ? attrs : p.list(p.sp()));
    p.push(ifs[i]);
    p.push(opens[i]);
    p.push(conds[i]);
    p.push(closes[i]);
    p.push(stmts[i]);
    p.push(elseClause);
    result = p.node(K_IfStatement, m);
    alternative = result;
  }
  return result;
};

const cspLockStatement = (p: CsParser, attrs: i32): i32 => {
  const m = p.sp();
  p.push(attrs);
  p.push(p.expect(K_LockKeyword));
  p.push(p.expect(K_OpenParenToken));
  p.push(cspExpressionCore(p));
  p.push(p.expect(K_CloseParenToken));
  p.push(cspEmbeddedStatement(p));
  return p.node(K_LockStatement, m);
};

const cspReturnStatement = (p: CsParser, attrs: i32): i32 => {
  const m = p.sp();
  p.push(attrs);
  p.push(p.expect(K_ReturnKeyword));
  p.push(p.k() !== K_SemicolonToken ? cspPossibleRefExpression(p) : -1);
  p.push(p.expect(K_SemicolonToken));
  return p.node(K_ReturnStatement, m);
};

const cspYieldStatement = (p: CsParser, attrs: i32): i32 => {
  const m = p.sp();
  p.push(attrs);
  p.push(p.eatContextual(K_YieldKeyword));
  let kind = K_YieldReturnStatement;
  if (p.k() === K_BreakKeyword) {
    kind = K_YieldBreakStatement;
    p.push(p.eat());
    p.push(-1);
  } else {
    p.push(p.expect(K_ReturnKeyword));
    if (p.k() === K_SemicolonToken) {
      p.fail("empty yield");
      return -1;
    }
    p.push(cspExpressionCore(p));
  }
  p.push(p.expect(K_SemicolonToken));
  return p.node(kind, m);
};

const cspSwitchStatement = (p: CsParser, attrs: i32): i32 => {
  const m = p.sp();
  p.push(attrs);
  p.push(p.expect(K_SwitchKeyword));
  const e = cspExpressionCore(p);
  if (p.err) {
    return -1;
  }
  const ek = p.t.kind[e];
  if (ek === K_ParenthesizedExpression) {
    p.push(p.t.s(e, 0));
    p.push(p.t.s(e, 1));
    p.push(p.t.s(e, 2));
  } else if (ek === K_TupleExpression) {
    p.push(-1);
    p.push(e);
    p.push(-1);
  } else {
    p.fail("switch governing expression requires parens");
    return -1;
  }
  p.push(p.expect(K_OpenBraceToken));
  const sm = p.sp();
  while (cspIsPossibleSwitchSection(p) && !p.err) {
    p.push(cspSwitchSection(p));
  }
  p.push(p.list(sm));
  p.push(p.expect(K_CloseBraceToken));
  return p.node(K_SwitchStatement, m);
};

const cspIsPossibleSwitchSection = (p: CsParser): boolean =>
  p.k() === K_CaseKeyword || (p.k() === K_DefaultKeyword && p.kindAt(1) !== K_OpenParenToken);

const cspSwitchSection = (p: CsParser): i32 => {
  const m = p.sp();
  const lm = p.sp();
  do {
    if (p.k() === K_CaseKeyword) {
      const cm = p.sp();
      const caseKw = p.eat();
      if (p.k() === K_ColonToken) {
        p.fail("constant expected");
        return -1;
      }
      let node = cspExpressionOrPatternForSwitchStatement(p);
      if (p.err) {
        return -1;
      }
      if (p.k() === K_IdentifierToken && p.ck() === K_WhenKeyword && !cspIsPatternKind(p.t.kind[node])) {
        const pm = p.sp();
        p.push(node);
        node = p.node(K_ConstantPattern, pm);
      }
      if (cspIsPatternKind(p.t.kind[node])) {
        p.push(caseKw);
        p.push(node);
        p.push(cspWhenClause(p, PREC_EXPRESSION));
        p.push(p.expect(K_ColonToken));
        p.push(p.node(K_CasePatternSwitchLabel, cm));
      } else {
        p.push(caseKw);
        p.push(node);
        p.push(p.expect(K_ColonToken));
        p.push(p.node(K_CaseSwitchLabel, cm));
      }
    } else {
      const dm = p.sp();
      p.push(p.expect(K_DefaultKeyword));
      p.push(p.expect(K_ColonToken));
      p.push(p.node(K_DefaultSwitchLabel, dm));
    }
  } while (cspIsPossibleSwitchSection(p) && !p.err);
  p.push(p.list(lm));
  const stm = p.sp();
  cspStatements(p, true);
  p.push(p.list(stm));
  return p.node(K_SwitchSection, m);
};

const cspThrowStatement = (p: CsParser, attrs: i32): i32 => {
  const m = p.sp();
  p.push(attrs);
  p.push(p.expect(K_ThrowKeyword));
  p.push(p.k() !== K_SemicolonToken ? cspExpressionCore(p) : -1);
  p.push(p.expect(K_SemicolonToken));
  return p.node(K_ThrowStatement, m);
};

const cspUsingStatement = (p: CsParser, attrs: i32, awaitTok: i32): i32 => {
  const m = p.sp();
  p.push(attrs);
  p.push(awaitTok);
  p.push(p.expect(K_UsingKeyword));
  p.push(p.expect(K_OpenParenToken));
  // ParseUsingExpression
  const rp = p.mark();
  let decl = -1;
  let expr = -1;
  if (cspIsAwaitExpression(p)) {
    expr = cspExpressionCore(p);
  } else {
    let st = ST_NOT_TYPE;
    let done = false;
    if (cspIsQueryExpression(p, true, false)) {
      st = ST_NOT_TYPE;
    } else if (cspIsDefiniteScopedModifier(p, false, false)) {
      const scoped = p.eatContextual(K_ScopedKeyword);
      decl = cspParenthesizedVariableDeclaration(p, 0, scoped);
      done = true;
    } else {
      st = cspScanType(p, PT_NORMAL);
    }
    if (!done) {
      if (st === ST_NULLABLE_TYPE) {
        if (p.k() !== K_IdentifierToken) {
          p.reset(rp);
          expr = cspExpressionCore(p);
        } else {
          const k1 = p.kindAt(1);
          if (k1 === K_CommaToken || k1 === K_CloseParenToken) {
            p.reset(rp);
            decl = cspParenthesizedVariableDeclaration(p, 0, -1);
          } else if (k1 === K_EqualsToken) {
            p.reset(rp);
            decl = cspParenthesizedVariableDeclaration(p, 0, -1);
            if (p.k() === K_ColonToken) {
              const ty = p.t.s(decl, 0);
              if (p.t.kind[ty] === K_NullableType && p.t.scount(p.t.s(decl, 1)) === 1) {
                p.reset(rp);
                decl = -1;
                expr = cspExpressionCore(p);
              }
            }
          } else {
            p.reset(rp);
            expr = cspExpressionCore(p);
          }
        }
      } else if (cspIsUsingStatementVariableDeclaration(p, st)) {
        p.reset(rp);
        decl = cspParenthesizedVariableDeclaration(p, 0, -1);
      } else {
        p.reset(rp);
        expr = cspExpressionCore(p);
      }
    }
  }
  p.push(decl);
  p.push(expr);
  p.push(p.expect(K_CloseParenToken));
  p.push(cspEmbeddedStatement(p));
  return p.node(K_UsingStatement, m);
};

const cspIsUsingStatementVariableDeclaration = (p: CsParser, st: i32): boolean => {
  const c1 = st === ST_MUST_BE_TYPE && p.k() !== K_DotToken;
  const c2 = st !== ST_NOT_TYPE && p.k() === K_IdentifierToken;
  const c3 = st === ST_NON_GENERIC_TYPE_OR_EXPRESSION || p.kindAt(1) === K_EqualsToken;
  return c1 || (c2 && c3);
};

const cspWhileStatement = (p: CsParser, attrs: i32): i32 => {
  const m = p.sp();
  p.push(attrs);
  p.push(p.expect(K_WhileKeyword));
  p.push(p.expect(K_OpenParenToken));
  p.push(cspExpressionCore(p));
  p.push(p.expect(K_CloseParenToken));
  p.push(cspEmbeddedStatement(p));
  return p.node(K_WhileStatement, m);
};

const cspLabeledStatement = (p: CsParser, attrs: i32): i32 => {
  const m = p.sp();
  p.push(attrs);
  p.push(cspIdentifierToken(p));
  p.push(p.expect(K_ColonToken));
  p.push(cspEmbeddedStatement(p));
  return p.node(K_LabeledStatement, m);
};

/** ParseParenthesizedVariableDeclaration (for, using, fixed). */
const cspParenthesizedVariableDeclaration = (p: CsParser, initialFlags: i32, scoped: i32): i32 => {
  let type = cspType(p, PT_NORMAL);
  if (scoped >= 0) {
    const sm = p.sp();
    p.push(scoped);
    p.push(type);
    type = p.node(K_ScopedType, sm);
  }
  const dm = p.sp();
  p.push(type);
  cspVariableDeclarators(p, type, initialFlags | VF_LOCAL_OR_FIELD, false, true);
  return p.node(K_VariableDeclaration, dm);
};
