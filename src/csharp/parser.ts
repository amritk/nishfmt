// The parser state and the parsing of names and types: Roslyn's
// LanguageParser, without its error recovery (any syntax error sets `err`,
// and the file is then left alone).
//
// Ported from Roslyn's LanguageParser.cs (MIT License, Copyright the .NET
// Foundation and Contributors), for CSharpier 1.4.0 (MIT License, Copyright
// (c) 2021 Bela VanderVoort).

// NameOptions

import {
  K_AbstractKeyword,
  K_AliasQualifiedName,
  K_AmpersandAmpersandToken,
  K_AmpersandToken,
  K_AndKeyword,
  K_ArgListKeyword,
  K_ArrayRankSpecifier,
  K_ArrayType,
  K_AsKeyword,
  K_AscendingKeyword,
  K_AsteriskToken,
  K_AsyncKeyword,
  K_AwaitKeyword,
  K_BarBarToken,
  K_BarToken,
  K_BoolKeyword,
  K_ByKeyword,
  K_ByteKeyword,
  K_CaretToken,
  K_CharKeyword,
  K_CharacterLiteralToken,
  K_ClassKeyword,
  K_CloseBraceToken,
  K_CloseBracketToken,
  K_CloseParenToken,
  K_ClosedKeyword,
  K_ColonColonToken,
  K_ColonToken,
  K_CommaToken,
  K_DecimalKeyword,
  K_DelegateKeyword,
  K_DescendingKeyword,
  K_DotToken,
  K_DoubleKeyword,
  K_EndOfFileToken,
  K_EnumKeyword,
  K_EqualsEqualsToken,
  K_EqualsGreaterThanToken,
  K_EqualsKeyword,
  K_EqualsToken,
  K_EventKeyword,
  K_ExclamationEqualsToken,
  K_ExplicitKeyword,
  K_ExternKeyword,
  K_FalseKeyword,
  K_FileKeyword,
  K_FloatKeyword,
  K_FromKeyword,
  K_FunctionPointerCallingConvention,
  K_FunctionPointerParameter,
  K_FunctionPointerParameterList,
  K_FunctionPointerType,
  K_FunctionPointerUnmanagedCallingConvention,
  K_FunctionPointerUnmanagedCallingConventionList,
  K_GenericName,
  K_GlobalKeyword,
  K_GreaterThanEqualsToken,
  K_GreaterThanToken,
  K_GroupKeyword,
  K_IdentifierName,
  K_IdentifierToken,
  K_ImplicitKeyword,
  K_IntKeyword,
  K_InterfaceKeyword,
  K_InternalKeyword,
  K_IntoKeyword,
  K_IsKeyword,
  K_JoinKeyword,
  K_LessThanEqualsToken,
  K_LessThanToken,
  K_LetKeyword,
  K_LongKeyword,
  K_ManagedKeyword,
  K_MultiLineRawStringLiteralToken,
  K_NamespaceKeyword,
  K_NewKeyword,
  K_NullKeyword,
  K_NullableType,
  K_NumericLiteralToken,
  K_ObjectKeyword,
  K_OmittedArraySizeExpression,
  K_OmittedTypeArgument,
  K_OnKeyword,
  K_OpenBraceToken,
  K_OpenBracketToken,
  K_OpenParenToken,
  K_OperatorKeyword,
  K_OrKeyword,
  K_OrderByKeyword,
  K_OverrideKeyword,
  K_PartialKeyword,
  K_PointerType,
  K_PredefinedType,
  K_PrivateKeyword,
  K_ProtectedKeyword,
  K_PublicKeyword,
  K_QualifiedName,
  K_QuestionToken,
  K_ReadOnlyKeyword,
  K_RecordKeyword,
  K_RefKeyword,
  K_RefType,
  K_RequiredKeyword,
  K_SByteKeyword,
  K_SafeKeyword,
  K_SealedKeyword,
  K_SelectKeyword,
  K_SemicolonToken,
  K_ShortKeyword,
  K_SingleLineRawStringLiteralToken,
  K_StaticKeyword,
  K_StringKeyword,
  K_StringLiteralToken,
  K_StructKeyword,
  K_ThisKeyword,
  K_TrueKeyword,
  K_TupleElement,
  K_TupleType,
  K_TypeArgumentList,
  K_UIntKeyword,
  K_ULongKeyword,
  K_UShortKeyword,
  K_UnionKeyword,
  K_UnmanagedKeyword,
  K_UnsafeKeyword,
  K_UsingKeyword,
  K_Utf8MultiLineRawStringLiteralToken,
  K_Utf8SingleLineRawStringLiteralToken,
  K_Utf8StringLiteralToken,
  K_VirtualKeyword,
  K_VoidKeyword,
  K_VolatileKeyword,
  K_WhereKeyword,
  K_WithKeyword,
} from "./kinds";
import { growI32 } from "../core/arr";
import { CsLexer, TF_HOLE_END } from "./lexer";
import { CsTree } from "./tree";
import { cspParameterModifiers } from "./pdecl";
import {
  cspExpressionCore,
  cspIsPossibleExpression,
  cspCanStartExpression,
  cspPossibleRefExpression,
  cspIsUnambiguousModifierListFollowedByOpenParen,
} from "./pexpr";

export const NO_IN_EXPRESSION: i32 = 1;
export const NO_IN_TYPE_LIST: i32 = 2;
export const NO_POSSIBLE_PATTERN: i32 = 4;
export const NO_AFTER_IS: i32 = 8;
export const NO_DEFINITE_PATTERN: i32 = 16;
export const NO_AFTER_OUT: i32 = 32;
export const NO_AFTER_TUPLE_COMMA: i32 = 64;
export const NO_FIRST_ELEMENT_OF_POSSIBLE_TUPLE_LITERAL: i32 = 128;

// ScanTypeFlags
export const ST_NOT_TYPE: i32 = 0;
export const ST_MUST_BE_TYPE: i32 = 1;
export const ST_GENERIC_TYPE_OR_METHOD: i32 = 2;
export const ST_GENERIC_TYPE_OR_EXPRESSION: i32 = 3;
export const ST_NON_GENERIC_TYPE_OR_EXPRESSION: i32 = 4;
export const ST_ALIAS_QUALIFIED_NAME: i32 = 5;
export const ST_NULLABLE_TYPE: i32 = 6;
export const ST_POINTER_OR_MULTIPLICATION: i32 = 7;
export const ST_TUPLE_TYPE: i32 = 8;

// ParseTypeMode
export const PT_NORMAL: i32 = 0;
export const PT_PARAMETER: i32 = 1;
export const PT_AFTER_IS: i32 = 2;
export const PT_DEFINITE_PATTERN: i32 = 3;
export const PT_AFTER_OUT: i32 = 4;
export const PT_AFTER_REF: i32 = 5;
export const PT_AFTER_TUPLE_COMMA: i32 = 6;
export const PT_AS_EXPRESSION: i32 = 7;
export const PT_NEW_EXPRESSION: i32 = 8;
export const PT_FIRST_ELEMENT_OF_POSSIBLE_TUPLE_LITERAL: i32 = 9;

// ScanTypeArgumentListKind
const STA_NOT: i32 = 0;
const STA_POSSIBLE: i32 = 1;
const STA_DEFINITE: i32 = 2;

// Terminator states the parser still consults.
export const TS_PATTERN_IN_SWITCH_EXPRESSION_ARM: i32 = 1;
export const TS_EXPRESSION_OR_PATTERN_IN_CASE_LABEL: i32 = 2;

/** A point to return to after a speculative parse. */
export class CsMark {
  pos: i32;
  nn: i32;
  np: i32;
  nl: i32;
  sp: i32;
  nt: i32;
  nconv: i32;
  err: boolean;
  lastScan: i32;
  constructor(pos: i32, nn: i32, np: i32, nl: i32, sp: i32, nt: i32, nconv: i32, err: boolean, lastScan: i32) {
    this.pos = pos;
    this.nn = nn;
    this.np = np;
    this.nl = nl;
    this.sp = sp;
    this.nt = nt;
    this.nconv = nconv;
    this.err = err;
    this.lastScan = lastScan;
  }
}

export class CsParser {
  lx: CsLexer;
  t: CsTree;
  pos: i32 = 0; // index of the current token
  nreal: i32; // tokens the lexer produced; merged tokens are appended after these
  stop: i32; // the token that ends the current interpolation hole (acts as end of file)
  err: boolean = false;
  errMsg: string = "";
  convTok: i32[];
  convOld: i32[];
  nconv: i32 = 0;
  inQuery: boolean = false;
  inAsync: boolean = false;
  inField: boolean = false;
  forceConditionalAccess: boolean = false;
  termState: i32 = 0;
  depth: i32 = 0;
  lastScan: i32 = -1; // the last token a scan consumed (lastTokenOfType)

  constructor(lx: CsLexer) {
    this.lx = lx;
    this.t = new CsTree(lx);
    this.nreal = lx.nt;
    this.stop = lx.nt - 1;
    this.convTok = new Array<i32>(64);
    this.convOld = new Array<i32>(64);
  }

  fail(msg: string): void {
    if (!this.err) {
      this.err = true;
      const t = this.pos < this.nreal ? this.pos : this.nreal - 1;
      this.errMsg = `${msg} at ${this.lx.start[t]}`;
    }
  }

  // ---- tokens ----

  /** The token index i ahead of the current one (the end of file when past a hole's end). */
  tokAt(i: i32): i32 {
    const p = this.pos + i;
    return p < this.stop ? p : this.stop;
  }

  kindAt(i: i32): i32 {
    const p = this.pos + i;
    return p < this.stop ? this.lx.kind[p] : K_EndOfFileToken;
  }

  ckAt(i: i32): i32 {
    const p = this.pos + i;
    return p < this.stop ? this.lx.ck[p] : 0;
  }

  k(): i32 {
    return this.pos < this.stop ? this.lx.kind[this.pos] : K_EndOfFileToken;
  }

  ck(): i32 {
    return this.pos < this.stop ? this.lx.ck[this.pos] : 0;
  }

  cur(): i32 {
    return this.pos < this.stop ? this.pos : this.stop;
  }

  eat(): i32 {
    const t = this.cur();
    if (this.pos < this.stop) {
      this.pos = this.pos + 1;
    }
    return t;
  }

  expect(kind: i32): i32 {
    if (this.k() === kind) {
      return this.eat();
    }
    this.fail(`expected ${kind}, found ${this.k()}`);
    return -1;
  }

  /** Eats the current token if it is of `kind`; -1 otherwise. */
  tryEat(kind: i32): i32 {
    return this.k() === kind ? this.eat() : -1;
  }

  /** Eats an identifier that is a contextual keyword, turning it into that keyword. */
  eatContextual(kind: i32): i32 {
    if (this.k() !== K_IdentifierToken || this.ck() !== kind) {
      this.fail(`expected contextual ${kind}`);
      return -1;
    }
    const t = this.eat();
    this.convert(t, kind);
    return t;
  }

  /** ConvertToKeyword: the token becomes the keyword kind (undone on reset). */
  convert(t: i32, kind: i32): void {
    if (this.nconv >= toI32(this.convTok.length)) {
      this.convTok = growI32(this.convTok, this.nconv * 2);
      this.convOld = growI32(this.convOld, this.nconv * 2);
    }
    this.convTok[this.nconv] = t;
    this.convOld[this.nconv] = this.lx.kind[t];
    this.nconv = this.nconv + 1;
    this.lx.kind[t] = kind;
  }

  /** Whether tokens i and i+1 ahead touch (no trivia between them). */
  noTriviaBetween(i: i32): boolean {
    const a = this.tokAt(i);
    const b = this.tokAt(i + 1);
    return this.lx.t0[a] === this.lx.t1[a] && this.lx.l0[b] === this.lx.l1[b] && this.lx.end[a] === this.lx.start[b];
  }

  /** Joins tokens [cur, cur + n) into one token of `kind` (`>>`, `..`, ...). */
  eatMerged(kind: i32, n: i32): i32 {
    const lx = this.lx;
    const a = this.cur();
    const b = this.tokAt(n - 1);
    const t = lx.addToken(kind, lx.start[a], lx.end[b], lx.l0[a], lx.l1[a]);
    lx.t0[t] = lx.t0[b];
    lx.t1[t] = lx.t1[b];
    this.pos = this.pos + n;
    return t;
  }

  mark(): CsMark {
    const t = this.t;
    return new CsMark(this.pos, t.nn, t.np, t.nl, t.sp, this.lx.nt, this.nconv, this.err, this.lastScan);
  }

  reset(m: CsMark): void {
    const t = this.t;
    this.pos = m.pos;
    t.nn = m.nn;
    t.np = m.np;
    t.nl = m.nl;
    t.sp = m.sp;
    this.lx.nt = m.nt;
    while (this.nconv > m.nconv) {
      this.nconv = this.nconv - 1;
      this.lx.kind[this.convTok[this.nconv]] = this.convOld[this.nconv];
    }
    this.err = m.err;
    this.lastScan = m.lastScan;
  }

  // ---- tree building ----

  push(v: i32): void {
    this.t.push(v);
  }

  sp(): i32 {
    return this.t.sp;
  }

  node(kind: i32, mark: i32): i32 {
    return this.t.node(kind, mark);
  }

  list(mark: i32): i32 {
    return this.t.list(mark);
  }
}

// ---- token classes ----

export const csIsPredefinedType = (k: i32): boolean =>
  k === K_BoolKeyword ||
  k === K_ByteKeyword ||
  k === K_SByteKeyword ||
  k === K_IntKeyword ||
  k === K_UIntKeyword ||
  k === K_ShortKeyword ||
  k === K_UShortKeyword ||
  k === K_LongKeyword ||
  k === K_ULongKeyword ||
  k === K_FloatKeyword ||
  k === K_DoubleKeyword ||
  k === K_DecimalKeyword ||
  k === K_StringKeyword ||
  k === K_CharKeyword ||
  k === K_ObjectKeyword ||
  k === K_VoidKeyword;

export const csIsLiteralToken = (k: i32): boolean =>
  k === K_StringLiteralToken ||
  k === K_Utf8StringLiteralToken ||
  k === K_SingleLineRawStringLiteralToken ||
  k === K_Utf8SingleLineRawStringLiteralToken ||
  k === K_MultiLineRawStringLiteralToken ||
  k === K_Utf8MultiLineRawStringLiteralToken ||
  k === K_CharacterLiteralToken ||
  k === K_NumericLiteralToken ||
  k === K_NullKeyword ||
  k === K_TrueKeyword ||
  k === K_FalseKeyword ||
  k === K_ArgListKeyword;

export const csIsQueryContextualKeyword = (ck: i32): boolean =>
  ck === K_FromKeyword ||
  ck === K_WhereKeyword ||
  ck === K_SelectKeyword ||
  ck === K_GroupKeyword ||
  ck === K_IntoKeyword ||
  ck === K_OrderByKeyword ||
  ck === K_JoinKeyword ||
  ck === K_LetKeyword ||
  ck === K_OnKeyword ||
  ck === K_EqualsKeyword ||
  ck === K_ByKeyword ||
  ck === K_AscendingKeyword ||
  ck === K_DescendingKeyword;

// ---- identifiers ----

export const cspIsTrueIdentifier = (p: CsParser): boolean => {
  if (p.k() === K_IdentifierToken) {
    if (
      !cspIsCurrentTokenDefinitelyPartialModifier(p, false) &&
      !(p.inQuery && csIsQueryContextualKeyword(p.ck())) &&
      !cspIsCurrentTokenWhereOfConstraintClause(p)
    ) {
      return true;
    }
  }
  return false;
};

export const cspIsTrueIdentifierAt = (p: CsParser, i: i32): boolean =>
  p.kindAt(i) === K_IdentifierToken && !(p.inQuery && csIsQueryContextualKeyword(p.ckAt(i)));

export const cspIsCurrentTokenWhereOfConstraintClause = (p: CsParser): boolean =>
  p.ck() === K_WhereKeyword && p.kindAt(1) === K_IdentifierToken && p.kindAt(2) === K_ColonToken;

export const cspIdentifierToken = (p: CsParser): i32 => {
  if (p.k() === K_IdentifierToken) {
    if (cspIsCurrentTokenDefinitelyPartialModifier(p, false) || (p.inQuery && csIsQueryContextualKeyword(p.ck()))) {
      p.fail("invalid expression term");
      return -1;
    }
    return p.eat();
  }
  p.fail("identifier expected");
  return -1;
};

export const cspIdentifierName = (p: CsParser): i32 => {
  const m = p.sp();
  p.push(cspIdentifierToken(p));
  return p.node(K_IdentifierName, m);
};

/** IsCurrentTokenDefinitelyPartialModifier. */
export const cspIsCurrentTokenDefinitelyPartialModifier = (p: CsParser, onlyForTypeDeclarations: boolean): boolean => {
  if (p.k() !== K_IdentifierToken || p.ck() !== K_PartialKeyword) {
    return false;
  }
  if (cspIsUnambiguousAnonymousFunctionModifierListFollowedByOpenParen(p)) {
    return false;
  }
  // in a type or namespace declaration
  {
    const m = p.mark();
    while (cspModifierKind(p.k(), p.ck()) !== 0) {
      p.eat();
    }
    const r = cspIsTypeOrNamespaceDeclarationStart(p);
    p.reset(m);
    if (r) {
      return true;
    }
  }
  if (onlyForTypeDeclarations) {
    return false;
  }
  const m = p.mark();
  p.eat();
  let r = false;
  if (p.k() === K_IdentifierToken && p.kindAt(1) === K_OpenParenToken) {
    r = true; // partial constructors are enabled in preview
  } else {
    let decided = false;
    while (cspModifierKind(p.k(), p.ck()) !== 0) {
      if (p.k() !== K_IdentifierToken) {
        r = true;
        decided = true;
        break;
      }
      if (p.kindAt(1) === K_IdentifierToken && p.kindAt(2) === K_OpenParenToken) {
        r = true;
        decided = true;
        break;
      }
      if (cspIsTypeFollowedByMemberName(p)) {
        r = true;
        decided = true;
        break;
      }
      p.eat();
    }
    if (!decided) {
      if (p.k() === K_EventKeyword || p.k() === K_ImplicitKeyword || p.k() === K_ExplicitKeyword) {
        r = true;
      } else {
        r = cspIsTypeFollowedByMemberName(p);
      }
    }
  }
  p.reset(m);
  return r;
};

/** The DeclarationModifiers of a token, as a nonzero code, or 0 for none (scoped excluded). */

export const MOD_PARTIAL: i32 = 100;
export const MOD_ASYNC: i32 = 101;
export const MOD_REF: i32 = 102;
export const MOD_CONTEXTUAL: i32 = 103; // required, file, closed, safe

export const cspModifierKind = (k: i32, ck: i32): i32 => {
  switch (k) {
    case K_PublicKeyword:
    case K_InternalKeyword:
    case K_ProtectedKeyword:
    case K_PrivateKeyword:
    case K_SealedKeyword:
    case K_AbstractKeyword:
    case K_StaticKeyword:
    case K_VirtualKeyword:
    case K_ExternKeyword:
    case K_NewKeyword:
    case K_OverrideKeyword:
    case K_ReadOnlyKeyword:
    case K_VolatileKeyword:
    case K_UnsafeKeyword:
      return 1;
    case K_PartialKeyword:
      return MOD_PARTIAL;
    case K_AsyncKeyword:
      return MOD_ASYNC;
    case K_RefKeyword:
      return MOD_REF;
    case K_IdentifierToken:
      switch (ck) {
        case K_PartialKeyword:
          return MOD_PARTIAL;
        case K_AsyncKeyword:
          return MOD_ASYNC;
        case K_RequiredKeyword:
        case K_FileKeyword:
        case K_ClosedKeyword:
        case K_SafeKeyword:
          return MOD_CONTEXTUAL;
        default:
          return 0;
      }
    default:
      return 0;
  }
};

export const cspIsTypeModifierOrTypeKeyword = (k: i32): boolean => {
  switch (k) {
    case K_EnumKeyword:
    case K_DelegateKeyword:
    case K_ClassKeyword:
    case K_InterfaceKeyword:
    case K_StructKeyword:
    case K_AbstractKeyword:
    case K_InternalKeyword:
    case K_NewKeyword:
    case K_PrivateKeyword:
    case K_ProtectedKeyword:
    case K_PublicKeyword:
    case K_SealedKeyword:
    case K_StaticKeyword:
    case K_UnsafeKeyword:
      return true;
    default:
      return false;
  }
};

export const cspIsTypeDeclarationStart = (p: CsParser): boolean => {
  switch (p.k()) {
    case K_ClassKeyword:
    case K_DelegateKeyword:
      if (p.k() === K_DelegateKeyword && p.kindAt(1) === K_AsteriskToken) {
        return false;
      }
      return true;
    case K_EnumKeyword:
    case K_InterfaceKeyword:
    case K_StructKeyword:
      return true;
    case K_IdentifierToken:
      if (p.ck() === K_RecordKeyword || p.ck() === K_UnionKeyword) {
        // `record` / `union` followed by an identifier, or `record class`/`record struct`
        const k1 = p.kindAt(1);
        if (p.ck() === K_RecordKeyword && (k1 === K_ClassKeyword || k1 === K_StructKeyword)) {
          return true;
        }
        if (k1 === K_IdentifierToken) {
          return true;
        }
        return false;
      }
      return false;
    default:
      return false;
  }
};

export const cspIsTypeOrNamespaceDeclarationStart = (p: CsParser): boolean =>
  cspIsTypeDeclarationStart(p) || p.k() === K_NamespaceKeyword;

export const cspIsTypeFollowedByMemberName = (p: CsParser): boolean => {
  const m = p.mark();
  const r = cspScanType(p, PT_NORMAL) !== ST_NOT_TYPE && cspIsPossibleMemberName(p);
  p.reset(m);
  return r;
};

export const cspIsPossibleMemberName = (p: CsParser): boolean => {
  switch (p.k()) {
    case K_IdentifierToken:
      if (p.ck() === K_GlobalKeyword && p.kindAt(1) === K_UsingKeyword) {
        return false;
      }
      return true;
    case K_ThisKeyword:
      return true;
    default:
      return false;
  }
};

/** IsUnambiguousAnonymousFunctionModifierListFollowedByOpenParen. */
export const cspIsUnambiguousAnonymousFunctionModifierListFollowedByOpenParen = (p: CsParser): boolean =>
  cspIsUnambiguousModifierListFollowedByOpenParen(p);

// ---- names ----

const cspIsDotOrColonColon = (p: CsParser): boolean => p.k() === K_DotToken || p.k() === K_ColonColonToken;

export const cspSimpleName = (p: CsParser, options: i32): i32 => {
  const id = cspIdentifierToken(p);
  if (id < 0) {
    return -1;
  }
  if (p.k() === K_LessThanToken) {
    const m = p.mark();
    const kind = cspScanTypeArgumentList(p, options);
    p.reset(m);
    if (kind === STA_DEFINITE || (kind === STA_POSSIBLE && (options & NO_IN_TYPE_LIST) !== 0)) {
      const sm = p.sp();
      p.push(id);
      p.push(cspTypeArgumentList(p));
      return p.node(K_GenericName, sm);
    }
  }
  const sm = p.sp();
  p.push(id);
  return p.node(K_IdentifierName, sm);
};

const cspScanTypeArgumentList = (p: CsParser, options: i32): i32 => {
  if (p.k() !== K_LessThanToken) {
    return STA_NOT;
  }
  if ((options & NO_IN_EXPRESSION) === 0) {
    return STA_DEFINITE;
  }
  const r = cspScanPossibleTypeArgumentList(p);
  if (r.flags === ST_NOT_TYPE) {
    return STA_NOT;
  }
  if (r.definite) {
    return STA_DEFINITE;
  }
  switch (p.k()) {
    case K_OpenParenToken:
    case K_CloseParenToken:
    case K_CloseBracketToken:
    case K_CloseBraceToken:
    case K_ColonToken:
    case K_SemicolonToken:
    case K_CommaToken:
    case K_DotToken:
    case K_QuestionToken:
    case K_EqualsEqualsToken:
    case K_ExclamationEqualsToken:
    case K_BarToken:
    case K_CaretToken:
    case K_AmpersandAmpersandToken:
    case K_BarBarToken:
    case K_AmpersandToken:
    case K_OpenBracketToken:
    case K_LessThanToken:
    case K_LessThanEqualsToken:
    case K_GreaterThanEqualsToken:
    case K_IsKeyword:
    case K_AsKeyword:
    case K_OpenBraceToken:
    case K_EndOfFileToken:
    case K_EqualsGreaterThanToken:
      return STA_DEFINITE;
    case K_GreaterThanToken:
      if ((options & NO_AFTER_IS) !== 0 && p.kindAt(1) !== K_GreaterThanToken) {
        return STA_DEFINITE;
      }
      return STA_POSSIBLE;
    case K_IdentifierToken:
      if (
        (options & (NO_AFTER_IS | NO_DEFINITE_PATTERN | NO_AFTER_OUT)) !== 0 ||
        ((options & NO_AFTER_TUPLE_COMMA) !== 0 &&
          (p.kindAt(1) === K_CommaToken || p.kindAt(1) === K_CloseParenToken)) ||
        ((options & NO_FIRST_ELEMENT_OF_POSSIBLE_TUPLE_LITERAL) !== 0 && p.kindAt(1) === K_CommaToken)
      ) {
        return STA_DEFINITE;
      }
      return STA_POSSIBLE;
    default:
      return STA_POSSIBLE;
  }
};

class CsScanTA {
  flags: i32;
  definite: boolean;
  constructor(flags: i32, definite: boolean) {
    this.flags = flags;
    this.definite = definite;
  }
}

const cspIsOpenName = (p: CsParser): boolean => {
  let n = 1;
  while (p.kindAt(n) === K_CommaToken) {
    n++;
  }
  return p.kindAt(n) === K_GreaterThanToken;
};

const cspScanPossibleTypeArgumentList = (p: CsParser): CsScanTA => {
  let definite = false;
  if (cspIsOpenName(p)) {
    p.eat();
    while (p.k() === K_CommaToken) {
      p.eat();
    }
    p.lastScan = p.eat();
    return new CsScanTA(ST_GENERIC_TYPE_OR_METHOD, true);
  }
  let result = ST_GENERIC_TYPE_OR_EXPRESSION;
  let lastScanned = ST_NOT_TYPE;
  do {
    p.eat();
    if (p.k() === K_OpenBracketToken) {
      return new CsScanTA(ST_NOT_TYPE, false);
    }
    if (p.k() === K_GreaterThanToken) {
      p.lastScan = p.eat();
      return new CsScanTA(result, definite);
    }
    if (p.k() === K_CommaToken) {
      lastScanned = ST_NOT_TYPE;
      continue;
    }
    lastScanned = cspScanType(p, PT_NORMAL);
    switch (lastScanned) {
      case ST_NOT_TYPE:
        return new CsScanTA(ST_NOT_TYPE, false);
      case ST_MUST_BE_TYPE:
        definite = definite || p.k() === K_CommaToken || p.k() === K_GreaterThanToken;
        result = ST_GENERIC_TYPE_OR_METHOD;
        break;
      case ST_NULLABLE_TYPE:
        definite = definite || p.k() === K_CommaToken || p.k() === K_GreaterThanToken;
        if (definite) {
          result = ST_GENERIC_TYPE_OR_METHOD;
        }
        break;
      case ST_GENERIC_TYPE_OR_EXPRESSION:
        if (!definite) {
          definite = p.k() === K_CommaToken;
          result = ST_GENERIC_TYPE_OR_METHOD;
        }
        break;
      case ST_GENERIC_TYPE_OR_METHOD:
        result = ST_GENERIC_TYPE_OR_METHOD;
        break;
      default:
        break;
    }
  } while (p.k() === K_CommaToken);
  if (p.k() !== K_GreaterThanToken) {
    if (p.k() === K_IdentifierToken) {
      // a missing `>`: error recovery in Roslyn
      return new CsScanTA(result, definite);
    }
    if (lastScanned === ST_TUPLE_TYPE && p.k() === K_OpenParenToken) {
      return new CsScanTA(result, definite);
    }
    return new CsScanTA(ST_NOT_TYPE, false);
  }
  p.lastScan = p.eat();
  definite = definite || p.k() === K_CloseParenToken;
  if (definite) {
    result = ST_GENERIC_TYPE_OR_METHOD;
  }
  return new CsScanTA(result, definite);
};

const cspTokenBreaksTypeArgumentList = (p: CsParser, i: i32): boolean => {
  const t = p.tokAt(i);
  const k = p.kindAt(i);
  if (k === K_IdentifierToken && (p.ckAt(i) === K_OrKeyword || p.ckAt(i) === K_AndKeyword)) {
    return true;
  }
  if (t < 0) {
    return false;
  }
  switch (k) {
    case K_OpenParenToken:
    case K_LessThanToken:
    case K_CloseParenToken:
    case K_SemicolonToken:
    case K_OpenBraceToken:
    case K_CloseBraceToken:
    case K_EqualsToken:
    case K_EqualsGreaterThanToken:
    case K_ThisKeyword:
    case K_OperatorKeyword:
      return true;
    default:
      return false;
  }
};

export const cspTypeArgumentList = (p: CsParser): i32 => {
  const isOpen = cspIsOpenName(p);
  const m = p.sp();
  p.push(p.expect(K_LessThanToken));
  const lm = p.sp();
  if (isOpen) {
    const om = p.sp();
    p.push(-1);
    p.push(p.node(K_OmittedTypeArgument, om));
    while (p.k() === K_CommaToken) {
      p.push(p.eat());
      const om2 = p.sp();
      p.push(-1);
      p.push(p.node(K_OmittedTypeArgument, om2));
    }
    p.push(p.list(lm));
    p.push(p.expect(K_GreaterThanToken));
    return p.node(K_TypeArgumentList, m);
  }
  p.push(cspTypeArgument(p));
  while (p.k() !== K_GreaterThanToken && !p.err) {
    if (cspTokenBreaksTypeArgumentList(p, 0)) {
      break;
    }
    if (p.k() === K_IdentifierToken && cspTokenBreaksTypeArgumentList(p, 1)) {
      break;
    }
    if (p.k() === K_IdentifierToken && p.kindAt(1) === K_CloseBracketToken) {
      break;
    }
    if (p.k() === K_CommaToken || cspIsPossibleType(p)) {
      p.push(p.expect(K_CommaToken));
      p.push(cspTypeArgument(p));
    } else {
      p.fail("bad type argument list");
      break;
    }
  }
  p.push(p.list(lm));
  p.push(p.expect(K_GreaterThanToken));
  return p.node(K_TypeArgumentList, m);
};

const cspTypeArgument = (p: CsParser): i32 => {
  if (p.k() === K_OpenBracketToken && p.kindAt(1) !== K_CloseBracketToken) {
    p.fail("attributes on a type argument");
    return -1;
  }
  return cspType(p, PT_NORMAL);
};

export const cspAliasQualifiedName = (p: CsParser, options: i32): i32 => {
  const name = cspSimpleName(p, options);
  if (p.k() === K_ColonColonToken) {
    return cspQualifiedNameRight(p, options, name, p.eat());
  }
  return name;
};

export const cspQualifiedName = (p: CsParser, options: i32): i32 => {
  let name = cspAliasQualifiedName(p, options);
  while (cspIsDotOrColonColon(p) && !p.err) {
    if (p.kindAt(1) === K_ThisKeyword) {
      break;
    }
    const sep = p.eat();
    name = cspQualifiedNameRight(p, options, name, sep);
  }
  return name;
};

const cspQualifiedNameRight = (p: CsParser, options: i32, left: i32, sep: i32): i32 => {
  const right = cspSimpleName(p, options);
  const m = p.sp();
  if (p.lx.kind[sep] === K_DotToken) {
    p.push(left);
    p.push(sep);
    p.push(right);
    return p.node(K_QualifiedName, m);
  }
  if (left < 0 || p.t.kind[left] !== K_IdentifierName) {
    p.fail("unexpected aliased name");
    return -1;
  }
  const id = p.t.s(left, 0);
  if (p.lx.kind[id] === K_IdentifierToken && p.lx.ck[id] === K_GlobalKeyword) {
    p.convert(id, K_GlobalKeyword);
  }
  p.push(left);
  p.push(sep);
  p.push(right);
  return p.node(K_AliasQualifiedName, m);
};

// ---- types ----

export const cspIsPossibleType = (p: CsParser): boolean => csIsPredefinedType(p.k()) || cspIsTrueIdentifier(p);

export const cspScanNamedTypePartPublic = (p: CsParser): i32 => cspScanNamedTypePart(p);

const cspScanNamedTypePart = (p: CsParser): i32 => {
  if (p.k() !== K_IdentifierToken || !cspIsTrueIdentifier(p)) {
    return ST_NOT_TYPE;
  }
  p.lastScan = p.eat();
  if (p.k() === K_LessThanToken) {
    return cspScanPossibleTypeArgumentList(p).flags;
  }
  return ST_NON_GENERIC_TYPE_OR_EXPRESSION;
};

/** ScanType: consumes a type if one is here; answers what it could be. Leaves p.lastScan on its last token. */
export const cspScanType = (p: CsParser, mode: i32): i32 => {
  let result = ST_NOT_TYPE;
  if (p.k() === K_RefKeyword) {
    p.eat();
    if (p.k() === K_ReadOnlyKeyword) {
      p.eat();
    }
  }
  if (p.k() === K_IdentifierToken || p.k() === K_ColonColonToken) {
    let isAlias = false;
    if (p.k() === K_ColonColonToken) {
      result = ST_NON_GENERIC_TYPE_OR_EXPRESSION;
      isAlias = true;
      p.lastScan = -1;
    } else {
      isAlias = p.kindAt(1) === K_ColonColonToken;
      result = cspScanNamedTypePart(p);
      if (result === ST_NOT_TYPE) {
        return ST_NOT_TYPE;
      }
    }
    let firstLoop = true;
    while (cspIsDotOrColonColon(p)) {
      if (!firstLoop) {
        isAlias = false;
      }
      firstLoop = false;
      p.eat();
      result = cspScanNamedTypePart(p);
      if (result === ST_NOT_TYPE) {
        return ST_NOT_TYPE;
      }
    }
    if (isAlias) {
      result = ST_ALIAS_QUALIFIED_NAME;
    }
  } else if (csIsPredefinedType(p.k())) {
    p.lastScan = p.eat();
    result = ST_MUST_BE_TYPE;
  } else if (p.k() === K_OpenParenToken) {
    p.lastScan = p.eat();
    result = cspScanTupleType(p);
    if (result === ST_NOT_TYPE || (mode === PT_DEFINITE_PATTERN && p.k() !== K_OpenBracketToken)) {
      return ST_NOT_TYPE;
    }
  } else if (cspIsFunctionPointerStart(p)) {
    result = cspScanFunctionPointerType(p);
  } else {
    p.lastScan = -1;
    return ST_NOT_TYPE;
  }
  while (true) {
    const k = p.k();
    if (k === K_QuestionToken) {
      const lk = p.lastScan >= 0 ? p.lx.kind[p.lastScan] : 0;
      if (lk === K_QuestionToken || lk === K_AsteriskToken) {
        break;
      }
      p.lastScan = p.eat();
      result = ST_NULLABLE_TYPE;
      continue;
    }
    if (k === K_AsteriskToken) {
      if (mode === PT_FIRST_ELEMENT_OF_POSSIBLE_TUPLE_LITERAL || mode === PT_AFTER_TUPLE_COMMA) {
        if (!cspPointerTypeModsFollowedByRankAndDimensionSpecifier(p)) {
          break;
        }
      } else if (mode === PT_DEFINITE_PATTERN) {
        break;
      }
      p.lastScan = p.eat();
      if (result === ST_GENERIC_TYPE_OR_EXPRESSION || result === ST_NON_GENERIC_TYPE_OR_EXPRESSION) {
        result = ST_POINTER_OR_MULTIPLICATION;
      } else if (result === ST_GENERIC_TYPE_OR_METHOD) {
        result = ST_MUST_BE_TYPE;
      }
      continue;
    }
    if (k === K_OpenBracketToken) {
      p.eat();
      while (p.k() === K_CommaToken) {
        p.eat();
      }
      if (p.k() !== K_CloseBracketToken) {
        p.lastScan = -1;
        return ST_NOT_TYPE;
      }
      p.lastScan = p.eat();
      result = ST_MUST_BE_TYPE;
      continue;
    }
    break;
  }
  return result;
};

export const cspScanTupleTypePublic = (p: CsParser): i32 => cspScanTupleType(p);

const cspScanTupleType = (p: CsParser): i32 => {
  let el = cspScanType(p, PT_NORMAL);
  if (el !== ST_NOT_TYPE) {
    if (cspIsTrueIdentifier(p)) {
      p.lastScan = p.eat();
    }
    if (p.k() === K_CommaToken) {
      do {
        p.lastScan = p.eat();
        el = cspScanType(p, PT_NORMAL);
        if (el === ST_NOT_TYPE) {
          p.lastScan = p.eat();
          return ST_NOT_TYPE;
        }
        if (cspIsTrueIdentifier(p)) {
          p.lastScan = p.eat();
        }
      } while (p.k() === K_CommaToken);
      if (p.k() === K_CloseParenToken) {
        p.lastScan = p.eat();
        return ST_TUPLE_TYPE;
      }
    }
  }
  p.lastScan = -1;
  return ST_NOT_TYPE;
};

export const cspIsFunctionPointerStart = (p: CsParser): boolean =>
  p.k() === K_DelegateKeyword && p.kindAt(1) === K_AsteriskToken;

const cspIsPossibleFunctionPointerParameterListStart = (k: i32): boolean =>
  k === K_LessThanToken || k === K_OpenParenToken;

const cspScanFunctionPointerType = (p: CsParser): i32 => {
  p.eat(); // delegate
  p.lastScan = p.eat(); // *
  if (p.k() === K_IdentifierToken) {
    const ck = p.ck();
    const k1 = p.kindAt(1);
    if (
      ck === K_ManagedKeyword ||
      ck === K_UnmanagedKeyword ||
      cspIsPossibleFunctionPointerParameterListStart(k1) ||
      k1 === K_OpenBracketToken
    ) {
      p.lastScan = p.eat();
    } else {
      return ST_MUST_BE_TYPE;
    }
    if (p.k() === K_OpenBracketToken) {
      p.lastScan = p.eat();
      while (p.k() !== K_CloseBracketToken && p.k() !== K_EndOfFileToken) {
        p.lastScan = p.eat();
      }
      if (p.k() === K_CloseBracketToken) {
        p.lastScan = p.eat();
      }
    }
  }
  if (!cspIsPossibleFunctionPointerParameterListStart(p.k())) {
    return ST_MUST_BE_TYPE;
  }
  p.eat();
  let depth = 1;
  while (depth > 0 && p.k() !== K_EndOfFileToken) {
    const k = p.k();
    if (k === K_LessThanToken) {
      depth++;
    } else if (k === K_GreaterThanToken) {
      depth--;
    }
    p.lastScan = p.eat();
  }
  return ST_MUST_BE_TYPE;
};

const cspPointerTypeModsFollowedByRankAndDimensionSpecifier = (p: CsParser): boolean => {
  for (let i = 0; ; i++) {
    const k = p.kindAt(i);
    if (k === K_AsteriskToken) {
      continue;
    }
    return k === K_OpenBracketToken;
  }
};

export const cspTypeOrVoid = (p: CsParser): i32 => {
  if (p.k() === K_VoidKeyword && p.kindAt(1) !== K_AsteriskToken) {
    const m = p.sp();
    p.push(p.eat());
    return p.node(K_PredefinedType, m);
  }
  return cspType(p, PT_NORMAL);
};

export const cspType = (p: CsParser, mode: i32): i32 => {
  if (p.k() === K_RefKeyword) {
    const m = p.sp();
    p.push(p.eat());
    p.push(p.k() === K_ReadOnlyKeyword ? p.eat() : -1);
    p.push(cspTypeCore(p, PT_AFTER_REF));
    return p.node(K_RefType, m);
  }
  return cspTypeCore(p, mode);
};

const cspTypeCore = (p: CsParser, mode: i32): i32 => {
  let options = 0;
  switch (mode) {
    case PT_AFTER_IS:
      options = NO_IN_EXPRESSION | NO_AFTER_IS | NO_POSSIBLE_PATTERN;
      break;
    case PT_DEFINITE_PATTERN:
      options = NO_IN_EXPRESSION | NO_DEFINITE_PATTERN | NO_POSSIBLE_PATTERN;
      break;
    case PT_AFTER_OUT:
      options = NO_IN_EXPRESSION | NO_AFTER_OUT;
      break;
    case PT_AFTER_TUPLE_COMMA:
      options = NO_IN_EXPRESSION | NO_AFTER_TUPLE_COMMA;
      break;
    case PT_FIRST_ELEMENT_OF_POSSIBLE_TUPLE_LITERAL:
      options = NO_IN_EXPRESSION | NO_FIRST_ELEMENT_OF_POSSIBLE_TUPLE_LITERAL;
      break;
    default:
      options = 0;
      break;
  }
  let type = cspUnderlyingType(p, mode, options);
  while (!p.err) {
    const k = p.k();
    if (k === K_QuestionToken) {
      const q = cspTryEatNullableQualifierIfApplicable(p, type, mode);
      if (q >= 0) {
        const m = p.sp();
        p.push(type);
        p.push(q);
        type = p.node(K_NullableType, m);
        continue;
      }
      break;
    }
    if (k === K_AsteriskToken) {
      if (
        mode === PT_AFTER_IS ||
        mode === PT_DEFINITE_PATTERN ||
        mode === PT_AFTER_TUPLE_COMMA ||
        mode === PT_FIRST_ELEMENT_OF_POSSIBLE_TUPLE_LITERAL
      ) {
        if (cspPointerTypeModsFollowedByRankAndDimensionSpecifier(p)) {
          type = cspPointerTypeMods(p, type);
          continue;
        }
        break;
      }
      type = cspPointerTypeMods(p, type);
      continue;
    }
    if (k === K_OpenBracketToken) {
      const m = p.sp();
      p.push(type);
      const lm = p.sp();
      do {
        p.push(cspArrayRankSpecifier(p));
      } while (p.k() === K_OpenBracketToken && !p.err);
      p.push(p.list(lm));
      type = p.node(K_ArrayType, m);
      continue;
    }
    break;
  }
  return type;
};

const cspPointerTypeMods = (p: CsParser, type: i32): i32 => {
  let t = type;
  while (p.k() === K_AsteriskToken) {
    const m = p.sp();
    p.push(t);
    p.push(p.eat());
    t = p.node(K_PointerType, m);
  }
  return t;
};

const cspTryEatNullableQualifierIfApplicable = (p: CsParser, typeSoFar: i32, mode: i32): i32 => {
  if (typeSoFar >= 0 && (p.t.kind[typeSoFar] === K_NullableType || p.t.kind[typeSoFar] === K_PointerType)) {
    return -1;
  }
  const m = p.mark();
  const q = p.eat();
  if (!cspCanFollowNullableType(p, mode)) {
    p.reset(m);
    return -1;
  }
  return q;
};

const cspCanFollowNullableType = (p: CsParser, mode: i32): boolean => {
  if (mode === PT_AFTER_IS && p.k() === K_OpenBracketToken) {
    const k1 = p.kindAt(1);
    if (k1 === K_CommaToken) {
      return true;
    }
    if (k1 === K_CloseBracketToken) {
      const m = p.mark();
      cspPossibleRefExpression(p);
      const r = p.k() !== K_ColonToken;
      p.reset(m);
      return r;
    }
    return false;
  }
  switch (mode) {
    case PT_AFTER_IS:
    case PT_DEFINITE_PATTERN:
    case PT_AS_EXPRESSION:
      if (cspIsTrueIdentifierAt(p, 0)) {
        const ck = p.ck();
        if (ck === K_AsyncKeyword || ck === K_AwaitKeyword || ck === K_FromKeyword) {
          return false;
        }
        if (p.ckAt(1) === K_WithKeyword && p.kindAt(1) === K_IdentifierToken) {
          return false;
        }
        const nk = p.kindAt(1);
        if (csIsLiteralToken(nk) || csIsPredefinedType(nk)) {
          return true;
        }
        if (nk === K_CloseParenToken || nk === K_CloseBracketToken || nk === K_CloseBraceToken) {
          return true;
        }
        if (nk === K_OpenBraceToken || nk === K_CommaToken || nk === K_SemicolonToken || nk === K_EndOfFileToken) {
          return true;
        }
        return false;
      }
      if (p.k() === K_OpenBracketToken) {
        return true;
      }
      return !cspCanStartExpression(p);
    case PT_NEW_EXPRESSION:
      return p.k() === K_OpenParenToken || p.k() === K_OpenBracketToken || p.k() === K_OpenBraceToken;
    default:
      return true;
  }
};

export const cspArrayRankSpecifier = (p: CsParser): i32 => {
  const m = p.sp();
  p.push(p.expect(K_OpenBracketToken));
  const lm = p.sp();
  let n = 0;
  let sawOmitted = false;
  let sawSize = false;
  while (p.k() !== K_CloseBracketToken && !p.err) {
    if (p.k() === K_CommaToken) {
      sawOmitted = true;
      const om = p.sp();
      p.push(-1);
      p.push(p.node(K_OmittedArraySizeExpression, om));
      p.push(p.eat());
      n += 2;
    } else if (cspIsPossibleExpression(p)) {
      p.push(cspExpressionCore(p));
      sawSize = true;
      n++;
      if (p.k() !== K_CloseBracketToken) {
        p.push(p.expect(K_CommaToken));
        n++;
      }
    } else {
      p.fail("bad array rank specifier");
      break;
    }
  }
  if ((n & 1) === 0) {
    sawOmitted = true;
    const om = p.sp();
    p.push(-1);
    p.push(p.node(K_OmittedArraySizeExpression, om));
  }
  if (sawOmitted && sawSize) {
    p.fail("value expected");
  }
  p.push(p.list(lm));
  p.push(p.expect(K_CloseBracketToken));
  return p.node(K_ArrayRankSpecifier, m);
};

const cspTupleType = (p: CsParser): i32 => {
  const m = p.sp();
  p.push(p.expect(K_OpenParenToken));
  const lm = p.sp();
  let n = 0;
  if (p.k() !== K_CloseParenToken) {
    p.push(cspTupleElement(p));
    n++;
    while (p.k() === K_CommaToken && !p.err) {
      p.push(p.eat());
      p.push(cspTupleElement(p));
      n++;
    }
  }
  if (n < 2) {
    p.fail("tuple too few elements");
  }
  p.push(p.list(lm));
  p.push(p.expect(K_CloseParenToken));
  return p.node(K_TupleType, m);
};

const cspTupleElement = (p: CsParser): i32 => {
  const m = p.sp();
  p.push(cspType(p, PT_NORMAL));
  p.push(cspIsTrueIdentifier(p) ? cspIdentifierToken(p) : -1);
  return p.node(K_TupleElement, m);
};

const cspUnderlyingType = (p: CsParser, mode: i32, options: i32): i32 => {
  if (csIsPredefinedType(p.k())) {
    const tok = p.eat();
    if (p.lx.kind[tok] === K_VoidKeyword && p.k() !== K_AsteriskToken) {
      p.fail("void here");
    }
    const m = p.sp();
    p.push(tok);
    return p.node(K_PredefinedType, m);
  }
  if (cspIsTrueIdentifier(p) || p.k() === K_ColonColonToken) {
    return cspQualifiedName(p, options);
  }
  if (p.k() === K_OpenParenToken) {
    return cspTupleType(p);
  }
  if (cspIsFunctionPointerStart(p)) {
    return cspFunctionPointerType(p);
  }
  p.fail(mode === PT_NEW_EXPRESSION ? "bad new expression" : "type expected");
  return -1;
};

const cspFunctionPointerType = (p: CsParser): i32 => {
  const m = p.sp();
  p.push(p.eat()); // delegate
  p.push(p.expect(K_AsteriskToken));
  // calling convention
  if (p.k() === K_IdentifierToken && (p.ck() === K_ManagedKeyword || p.ck() === K_UnmanagedKeyword)) {
    const cm = p.sp();
    const kw = p.eat();
    p.convert(kw, p.lx.ck[kw]);
    p.push(kw);
    if (p.k() === K_OpenBracketToken) {
      const um = p.sp();
      p.push(p.eat());
      const lm = p.sp();
      while (!p.err) {
        const ccm = p.sp();
        p.push(p.expect(K_IdentifierToken));
        p.push(p.node(K_FunctionPointerUnmanagedCallingConvention, ccm));
        if (p.k() !== K_CommaToken) {
          break;
        }
        p.push(p.eat());
      }
      p.push(p.list(lm));
      p.push(p.expect(K_CloseBracketToken));
      p.push(p.node(K_FunctionPointerUnmanagedCallingConventionList, um));
    } else {
      p.push(-1);
    }
    p.push(p.node(K_FunctionPointerCallingConvention, cm));
  } else {
    p.push(-1);
  }
  const lm0 = p.sp();
  p.push(p.expect(K_LessThanToken));
  const lm = p.sp();
  while (!p.err) {
    const pm = p.sp();
    p.push(p.list(p.sp())); // attribute lists
    const mm = p.sp();
    cspParameterModifiers(p, true, false);
    p.push(p.list(mm));
    p.push(cspTypeOrVoid(p));
    p.push(p.node(K_FunctionPointerParameter, pm));
    if (p.k() !== K_CommaToken) {
      break;
    }
    p.push(p.eat());
  }
  p.push(p.list(lm));
  p.push(p.expect(K_GreaterThanToken));
  p.push(p.node(K_FunctionPointerParameterList, lm0));
  return p.node(K_FunctionPointerType, m);
};
