// The printing context and CSharpier's shared printers: tokens with their
// trivia (Token.cs), ExtraNewLines, SeparatedSyntaxList, TrailingComma,
// Modifiers, AttributeLists, ConstraintClauses, OptionalBraces,
// CSharpierIgnore, ArgumentListLike, ArgumentListWithTrailingLambda,
// RightHandSide, MembersWithForcedLines, NamespaceLikePrinter and
// UsingDirectives.
//
// Ported from CSharpier 1.4.0 (MIT License, Copyright (c) 2021 Bela
// VanderVoort), CSharp/SyntaxPrinter/*.cs, over a tree shaped after Roslyn's
// syntax model (MIT License, Copyright the .NET Foundation and Contributors).

import {
  cswAttributeList,
  cswBlock,
  cswExternAlias,
  cswNode,
  cswParameter,
  cswTypeParameter,
  cswTypeParameterConstraintClause,
  cswUsingDirective,
  cswVariableDeclarator,
} from "./pnodes";
import {
  cswArgument,
  cswArgumentModifiers,
  cswBinaryParts,
  cswIsCoalesceWithNonBinaryLeft,
  cswParenLambdaBody,
  cswParenLambdaHead,
  cswSimpleLambdaBody,
  cswSimpleLambdaHead,
  cswSlItemMore,
} from "./pexprs";
import {
  F_AnonymousMethodExpression_Block,
  F_AnonymousMethodExpression_ExpressionBody,
  F_ArgumentList_Arguments,
  F_Argument_Expression,
  F_Argument_NameColon,
  F_AssignmentExpression_Right,
  F_CastExpression_Type,
  F_CompilationUnit_AttributeLists,
  F_ConditionalExpression_Condition,
  F_ConditionalExpression_WhenFalse,
  F_ConditionalExpression_WhenTrue,
  F_EnumDeclaration_CloseBraceToken,
  F_IdentifierName_Identifier,
  F_InterpolatedStringExpression_StringStartToken,
  F_LiteralExpression_Token,
  F_ObjectCreationExpression_ArgumentList,
  F_ObjectCreationExpression_Initializer,
  F_ObjectCreationExpression_Type,
  F_ParameterList_Parameters,
  F_ParenthesizedLambdaExpression_ArrowToken,
  F_ParenthesizedLambdaExpression_Block,
  F_ParenthesizedLambdaExpression_ExpressionBody,
  F_ParenthesizedLambdaExpression_ParameterList,
  F_QualifiedName_Left,
  F_SimpleLambdaExpression_ArrowToken,
  F_SimpleLambdaExpression_Block,
  F_SimpleLambdaExpression_ExpressionBody,
  F_StackAllocArrayCreationExpression_Initializer,
  F_UsingDirective_Alias,
  F_UsingDirective_GlobalKeyword,
  F_UsingDirective_NamespaceOrType,
  F_UsingDirective_StaticKeyword,
  K_AbstractKeyword,
  K_AliasQualifiedName,
  K_AsyncKeyword,
  K_BadDirectiveTrivia,
  K_Block,
  K_ClassDeclaration,
  K_CloseBraceToken,
  K_CloseBracketToken,
  K_ClosedKeyword,
  K_CollectionExpression,
  K_CompilationUnit,
  K_ConstructorDeclaration,
  K_ConversionOperatorDeclaration,
  K_DefineDirectiveTrivia,
  K_DestructorDeclaration,
  K_DisabledTextTrivia,
  K_ElifDirectiveTrivia,
  K_ElseDirectiveTrivia,
  K_EndIfDirectiveTrivia,
  K_EndOfLineTrivia,
  K_EndRegionDirectiveTrivia,
  K_EnumDeclaration,
  K_EnumMemberDeclaration,
  K_ExternKeyword,
  K_FileKeyword,
  K_FileScopedNamespaceDeclaration,
  K_IdentifierName,
  K_IfDirectiveTrivia,
  K_IgnoredDirectiveTrivia,
  K_InterfaceDeclaration,
  K_InternalKeyword,
  K_InterpolatedMultiLineRawStringStartToken,
  K_InterpolatedRawStringEndToken,
  K_InterpolatedStringTextToken,
  K_InterpolatedVerbatimStringStartToken,
  K_LineSpanDirectiveTrivia,
  K_LoadDirectiveTrivia,
  K_MethodDeclaration,
  K_MultiLineCommentTrivia,
  K_MultiLineDocumentationCommentTrivia,
  K_MultiLineRawStringLiteralToken,
  K_NamespaceDeclaration,
  K_NewKeyword,
  K_NullableDirectiveTrivia,
  K_OperatorDeclaration,
  K_OverrideKeyword,
  K_PragmaChecksumDirectiveTrivia,
  K_PragmaWarningDirectiveTrivia,
  K_PrivateKeyword,
  K_ProtectedKeyword,
  K_PublicKeyword,
  K_QualifiedName,
  K_ReadOnlyKeyword,
  K_RecordDeclaration,
  K_RecordStructDeclaration,
  K_RegionDirectiveTrivia,
  K_RequiredKeyword,
  K_SealedKeyword,
  K_ShebangDirectiveTrivia,
  K_SingleLineCommentTrivia,
  K_SingleLineDocumentationCommentTrivia,
  K_StaticKeyword,
  K_StringLiteralToken,
  K_StructDeclaration,
  K_SwitchSection,
  K_UndefDirectiveTrivia,
  K_UnsafeKeyword,
  K_VirtualKeyword,
  K_VolatileKeyword,
  K_WhitespaceTrivia,
  Y_AccessorDeclaration,
  Y_AnonymousFunctionExpression,
  Y_AnonymousObjectCreationExpression,
  Y_Argument,
  Y_ArrowExpressionClause,
  Y_AssignmentExpression,
  Y_BaseMethodDeclaration,
  Y_BinaryExpression,
  Y_CastExpression,
  Y_CollectionExpression,
  Y_ConditionalExpression,
  Y_EqualsValueClause,
  Y_ExpressionStatement,
  Y_GenericName,
  Y_GlobalStatement,
  Y_InitializerExpression,
  Y_InterpolatedStringExpression,
  Y_IsPatternExpression,
  Y_LambdaExpression,
  Y_LiteralExpression,
  Y_Name,
  Y_ObjectCreationExpression,
  Y_Parameter,
  Y_ParenthesizedExpression,
  Y_ParenthesizedLambdaExpression,
  Y_QueryExpression,
  Y_SimpleLambdaExpression,
  Y_StackAllocArrayCreationExpression,
  Y_Statement,
  Y_TypeParameter,
  Y_VariableDeclarator,
} from "./kinds";
import {
  CsLexer,
  csCodePoint,
  csCpLen,
  csIsWhitespaceCp,
} from "./lexer";
import {
  CsTree,
} from "./tree";
import {
  CT_MULTI,
  CT_SINGLE,
  CsDocs,
  DOC_HARDLINE,
  DOC_HARDLINE_FOR_TRIVIA,
  DOC_HARDLINE_IF_NO_PREVIOUS_LINE,
  DOC_HARDLINE_IF_NO_PREVIOUS_LINE_FOR_TRIVIA,
  DOC_HARDLINE_NO_TRIM,
  DOC_LINE,
  DOC_LITERAL_LINE,
  DOC_NULL,
  DOC_SOFTLINE,
  DOC_SPACE,
  DOC_TRIM,
  D_CONCAT,
  D_HARDLINE,
  D_LEADING_COMMENT,
  D_TRAILING_COMMENT,
  SF_DIRECTIVE,
  SF_SRC,
  csdContainsBreak,
  csdRemoveInitialDoubleHardLine,
  csIsDotnetWhiteSpaceCp,
} from "./doc";

/** A growable byte buffer. */
export class CsBuf {
  buf: u8[];
  n: i32 = 0;
  constructor(cap: i32) {
    this.buf = new Array<u8>(cap < 16 ? 16 : cap);
  }
  reserve(k: i32): void {
    if (this.n + k > toI32(this.buf.length)) {
      let cap = toI32(this.buf.length) * 2;
      if (cap < this.n + k) {
        cap = this.n + k + 16;
      }
      const nb = new Array<u8>(cap);
      for (let i = 0; i < this.n; i++) {
        nb[i] = this.buf[i];
      }
      this.buf = nb;
    }
  }
  byte(c: i32): void {
    this.reserve(1);
    this.buf[this.n] = toU8(c);
    this.n = this.n + 1;
  }
  range(s: u8[], a: i32, b: i32): void {
    this.reserve(b - a);
    for (let i = a; i < b; i++) {
      this.buf[this.n] = s[i];
      this.n = this.n + 1;
    }
  }
}

/** One print of one tree: CSharpPrintingContext and its state. */
export class CsPrint {
  t: CsTree;
  lx: CsLexer;
  src: u8[];
  D: CsDocs;
  eolCr: boolean;
  depth: i32 = 0;
  failed: boolean = false;
  failMsg: string = "";
  nextTriviaNeedsLine: boolean = false;
  tcTrivia: i32 = -1; // the trailing comment a trailing comma goes before
  tcDoc: i32 = 0;
  movedTrailingTrivia: boolean = false;
  reorderedModifiers: boolean = false;
  reorderedUsings: boolean = false;
  comma: i32;

  constructor(t: CsTree, D: CsDocs, eolCr: boolean) {
    this.t = t;
    this.lx = t.lx;
    this.src = t.src;
    this.D = D;
    this.eolCr = eolCr;
    this.comma = D.strArena(",");
  }

  fail(msg: string): void {
    if (!this.failed) {
      this.failed = true;
      this.failMsg = msg;
    }
  }

  // ---- tree access ----

  k(n: i32): i32 {
    return this.t.kind[n];
  }

  s(n: i32, i: i32): i32 {
    return this.t.s(n, i);
  }

  is(n: i32, y: i32): boolean {
    return this.t.is(n, y);
  }

  par(n: i32): i32 {
    return n < 0 ? -1 : this.t.parent[n];
  }

  /** Whether n's parent is of type y. */
  pis(n: i32, y: i32): boolean {
    return this.t.is(this.par(n), y);
  }

  tk(tok: i32): i32 {
    return tok < 0 ? 0 : this.lx.kind[tok];
  }

  /** The first token of node n. */
  first(n: i32): i32 {
    return this.t.first[n];
  }

  last(n: i32): i32 {
    return this.t.last[n];
  }

  count(l: i32): i32 {
    return this.t.count(l);
  }

  at(l: i32, i: i32): i32 {
    return this.t.at(l, i);
  }

  scount(l: i32): i32 {
    return this.t.scount(l);
  }

  sel(l: i32, i: i32): i32 {
    return this.t.sel(l, i);
  }

  sep(l: i32, i: i32): i32 {
    return this.t.sep(l, i);
  }

  sepCount(l: i32): i32 {
    return this.t.sepCount(l);
  }

  // ---- docs ----

  cc(docs: i32[]): i32 {
    return this.D.concat(docs);
  }

  group(docs: i32[]): i32 {
    return this.D.group(docs);
  }

  indent(docs: i32[]): i32 {
    return this.D.indent(docs);
  }

  str(s: string): i32 {
    return this.D.str(s);
  }
}

// ---- trivia ----

export const cswIsDirectiveKind = (k: i32): boolean =>
  (k >= K_IfDirectiveTrivia && k <= K_BadDirectiveTrivia) ||
  k === K_ShebangDirectiveTrivia ||
  k === K_LoadDirectiveTrivia ||
  k === K_NullableDirectiveTrivia ||
  k === K_LineSpanDirectiveTrivia ||
  k === K_IgnoredDirectiveTrivia;

export const cswIsCommentKind = (k: i32): boolean =>
  k === K_SingleLineCommentTrivia ||
  k === K_MultiLineCommentTrivia ||
  k === K_SingleLineDocumentationCommentTrivia ||
  k === K_MultiLineDocumentationCommentTrivia;

export const cswAnyDirective = (lx: CsLexer, a: i32, b: i32): boolean => {
  for (let i = a; i < b; i++) {
    if (cswIsDirectiveKind(lx.trKind[i])) {
      return true;
    }
  }
  return false;
};

export const cswAnyComment = (lx: CsLexer, a: i32, b: i32): boolean => {
  for (let i = a; i < b; i++) {
    if (cswIsCommentKind(lx.trKind[i])) {
      return true;
    }
  }
  return false;
};

export const cswAnyCommentOrDirective = (lx: CsLexer, a: i32, b: i32): boolean => {
  for (let i = a; i < b; i++) {
    const k = lx.trKind[i];
    if (cswIsCommentKind(k) || cswIsDirectiveKind(k)) {
      return true;
    }
  }
  return false;
};

/** Whether any trivia in [a, b) is not whitespace or a line end. */
export const cswAnyNonWhitespace = (lx: CsLexer, a: i32, b: i32): boolean => {
  for (let i = a; i < b; i++) {
    const k = lx.trKind[i];
    if (k !== K_WhitespaceTrivia && k !== K_EndOfLineTrivia) {
      return true;
    }
  }
  return false;
};

export const cswAnyKind = (lx: CsLexer, a: i32, b: i32, kind: i32): boolean => {
  for (let i = a; i < b; i++) {
    if (lx.trKind[i] === kind) {
      return true;
    }
  }
  return false;
};

/** IndexOfNextEndOfLine over the trivia [a, b): the next line end after x past whitespace, or -1. */
export const cswIndexOfNextEol = (lx: CsLexer, b: i32, x: i32): i32 => {
  for (let i = x + 1; i < b; i++) {
    const k = lx.trKind[i];
    if (k === K_WhitespaceTrivia) {
      continue;
    }
    if (k === K_EndOfLineTrivia) {
      return i;
    }
    return -1;
  }
  return -1;
};

/** The leading trivia of node n: its first token's. */
export const cswLeadA = (P: CsPrint, n: i32): i32 => {
  const t = P.first(n);
  return t < 0 ? 0 : P.lx.l0[t];
};

export const cswLeadB = (P: CsPrint, n: i32): i32 => {
  const t = P.first(n);
  return t < 0 ? 0 : P.lx.l1[t];
};

/** Whether the text of trivia i (a single-line comment) matches `^// csharpier-ignore<suffix>($| -)`. */
const cswCommentMatches = (P: CsPrint, i: i32, suffix: string): boolean => {
  const lx = P.lx;
  const a = lx.trStart[i];
  const b = lx.trTextEnd[i];
  const base = "// csharpier-ignore";
  const n1 = toI32(base.length);
  const n2 = toI32(suffix.length);
  if (b - a < n1 + n2) {
    return false;
  }
  for (let j = 0; j < n1; j++) {
    if (toI32(P.src[a + j]) !== base.charCodeAt(j)) {
      return false;
    }
  }
  for (let j = 0; j < n2; j++) {
    if (toI32(P.src[a + n1 + j]) !== suffix.charCodeAt(j)) {
      return false;
    }
  }
  const p = a + n1 + n2;
  if (p === b) {
    return true;
  }
  return p + 1 < b && toI32(P.src[p]) === 32 && toI32(P.src[p + 1]) === 45;
};

export const IGN_ONE: i32 = 0;
export const IGN_START: i32 = 1;
export const IGN_END: i32 = 2;

/** HasLeadingCommentMatching over the trivia [a, b). */
export const cswHasIgnoreComment = (P: CsPrint, a: i32, b: i32, which: i32): boolean => {
  const lx = P.lx;
  for (let i = a; i < b; i++) {
    if (lx.trKind[i] !== K_SingleLineCommentTrivia) {
      continue;
    }
    const suffix = which === IGN_ONE ? "" : which === IGN_START ? "-start" : "-end";
    if (cswCommentMatches(P, i, suffix)) {
      return true;
    }
  }
  return false;
};

export const cswNodeHasIgnore = (P: CsPrint, n: i32, which: i32): boolean => cswHasIgnoreComment(P, cswLeadA(P, n), cswLeadB(P, n), which);

/** ExtraNewLines.Print over the trivia [a, b). */
export const cswExtraNewLinesRange = (P: CsPrint, a: i32, b: i32): i32 => {
  const lx = P.lx;
  for (let i = a; i < b; i++) {
    const k = lx.trKind[i];
    if (k === K_EndOfLineTrivia) {
      return DOC_HARDLINE;
    }
    if (k !== K_WhitespaceTrivia) {
      return DOC_NULL;
    }
  }
  return DOC_NULL;
};

/** ExtraNewLines.Print(node). */
export const cswExtraNewLines = (P: CsPrint, n: i32): i32 => {
  if (P.pis(n, Y_GlobalStatement)) {
    return DOC_NULL;
  }
  return cswExtraNewLinesRange(P, cswLeadA(P, n), cswLeadB(P, n));
};

const cswInsert = (docs: i32[], at: i32, v: i32): void => {
  docs.push(0);
  for (let i = toI32(docs.length) - 1; i > at; i--) {
    docs[i] = docs[i - 1];
  }
  docs[at] = v;
};

/** PrivatePrintLeadingTrivia over the trivia [a, b). */
export const cswLeadingTrivia = (P: CsPrint, a: i32, b: i32, includeInitialNewLines: boolean, skipLastHardline: boolean): i32 => {
  if (b <= a) {
    return DOC_NULL;
  }
  const lx = P.lx;
  const D = P.D;
  if (!includeInitialNewLines && !P.nextTriviaNeedsLine && !cswAnyNonWhitespace(lx, a, b)) {
    return DOC_NULL;
  }
  const docs: i32[] = [];
  let printNewLines = includeInitialNewLines;
  let x = a;
  while (x < b) {
    const kind = lx.trKind[x];
    if (printNewLines && kind === K_EndOfLineTrivia) {
      const n = toI32(docs.length);
      if (n > 0 && docs[n - 1] === DOC_HARDLINE_FOR_TRIVIA) {
        printNewLines = false;
      }
      if (
        !(
          n > 1 &&
          docs[n - 1] === DOC_HARDLINE_FOR_TRIVIA &&
          D.kind[docs[n - 2]] === D_LEADING_COMMENT &&
          D.c[docs[n - 2]] === CT_SINGLE
        )
      ) {
        docs.push(DOC_HARDLINE_FOR_TRIVIA);
      }
    }
    if (kind !== K_EndOfLineTrivia && kind !== K_WhitespaceTrivia) {
      printNewLines = true;
    }
    if (kind === K_SingleLineCommentTrivia || kind === K_SingleLineDocumentationCommentTrivia) {
      docs.push(cswLeadingComment(P, a, x, CT_SINGLE));
      docs.push(kind === K_SingleLineDocumentationCommentTrivia ? DOC_HARDLINE_FOR_TRIVIA : DOC_NULL);
    } else if (kind === K_MultiLineCommentTrivia || kind === K_MultiLineDocumentationCommentTrivia) {
      docs.push(cswLeadingComment(P, a, x, CT_MULTI));
    } else if (kind === K_DisabledTextTrivia) {
      docs.push(DOC_TRIM);
      docs.push(D.strSrc(lx.trStart[x], lx.trTextEnd[x]));
    } else if (kind === K_RegionDirectiveTrivia || kind === K_EndRegionDirectiveTrivia) {
      docs.push(DOC_HARDLINE_IF_NO_PREVIOUS_LINE);
      docs.push(DOC_TRIM);
      const r = D.region(lx.trStart[x], lx.trTextEnd[x], kind === K_EndRegionDirectiveTrivia);
      D.d[r] = SF_SRC;
      docs.push(r);
      docs.push(DOC_HARDLINE);
    } else if (cswIsDirectiveKind(kind)) {
      docs.push(DOC_HARDLINE_IF_NO_PREVIOUS_LINE_FOR_TRIVIA);
      docs.push(DOC_HARDLINE_IF_NO_PREVIOUS_LINE_FOR_TRIVIA);
      docs.push(DOC_TRIM);
      const s = D.strSrc(lx.trStart[x], lx.trTextEnd[x]);
      D.d[s] = SF_SRC | SF_DIRECTIVE;
      docs.push(s);
      docs.push(DOC_HARDLINE_FOR_TRIVIA);
      if (kind === K_EndIfDirectiveTrivia) {
        const li = cswIndexOfNextEol(lx, b, x);
        if (li >= 0) {
          x = li;
          docs.push(DOC_HARDLINE_FOR_TRIVIA);
        }
        printNewLines = false;
      }
    }
    x++;
  }
  if (skipLastHardline) {
    while (toI32(docs.length) !== 0) {
      const l = docs[toI32(docs.length) - 1];
      if (D.kind[l] === D_HARDLINE || l === DOC_NULL) {
        docs.pop();
      } else {
        break;
      }
    }
  }
  if (P.nextTriviaNeedsLine) {
    if (cswAnyKind(lx, a, b, K_IfDirectiveTrivia)) {
      cswInsert(docs, 0, DOC_HARDLINE_FOR_TRIVIA);
    } else {
      let index = toI32(docs.length) - 1;
      while (index >= 0) {
        const d = docs[index];
        const dk = D.kind[d];
        if (dk === D_HARDLINE || dk === D_LEADING_COMMENT || d === DOC_NULL) {
          index--;
        } else {
          break;
        }
      }
      const n = toI32(docs.length);
      if (index + 2 >= n || !(D.kind[docs[index + 1]] === D_HARDLINE && D.kind[docs[index + 2]] === D_HARDLINE)) {
        cswInsert(docs, index + 1, DOC_HARDLINE_FOR_TRIVIA);
      }
    }
    P.nextTriviaNeedsLine = false;
  }
  return toI32(docs.length) > 0 ? D.concat(docs) : DOC_NULL;
};

/** A LeadingComment for trivia x of the list starting at a. */
const cswLeadingComment = (P: CsPrint, a: i32, x: i32, type: i32): i32 => {
  const lx = P.lx;
  let s = lx.trStart[x];
  let e = lx.trEnd[x];
  while (e > s && (toI32(P.src[e - 1]) === 10 || toI32(P.src[e - 1]) === 13)) {
    e--;
  }
  if (type === CT_MULTI && x > a && lx.trKind[x - 1] === K_WhitespaceTrivia) {
    s = lx.trStart[x - 1];
  }
  const d = P.D.comment(D_LEADING_COMMENT, s, e, type);
  P.D.d[d] = SF_SRC;
  return d;
};

/** Token.PrintTrailingTrivia over the trivia [a, b). */
export const cswTrailingTrivia = (P: CsPrint, a: i32, b: i32): i32 => {
  const lx = P.lx;
  let has = false;
  for (let i = a; i < b; i++) {
    const k = lx.trKind[i];
    if (k === K_SingleLineCommentTrivia || k === K_MultiLineCommentTrivia) {
      has = true;
      break;
    }
  }
  if (!has) {
    return DOC_NULL;
  }
  const docs: i32[] = [];
  for (let i = a; i < b; i++) {
    const k = lx.trKind[i];
    if (k === K_SingleLineCommentTrivia) {
      const d = P.D.comment(D_TRAILING_COMMENT, lx.trStart[i], lx.trTextEnd[i], CT_SINGLE);
      P.D.d[d] = SF_SRC;
      docs.push(d);
    } else if (k === K_MultiLineCommentTrivia) {
      docs.push(DOC_SPACE);
      const d = P.D.comment(D_TRAILING_COMMENT, lx.trStart[i], lx.trTextEnd[i], CT_MULTI);
      P.D.d[d] = SF_SRC;
      docs.push(d);
    }
  }
  return P.D.concat(docs);
};

export const cswTrailingTriviaTok = (P: CsPrint, t: i32): i32 => (t < 0 ? DOC_NULL : cswTrailingTrivia(P, P.lx.t0[t], P.lx.t1[t]));

/** Token.PrintLeadingTrivia(token) with the leading trivia [a, b). */
export const cswLeadingTriviaTokRange = (P: CsPrint, t: i32, a: i32, b: i32): i32 => {
  const lx = P.lx;
  const kind = lx.kind[t];
  const isClosingBrace = kind === K_CloseBraceToken || (kind === K_CloseBracketToken && P.t.is(lx.parent[t], Y_CollectionExpression));
  let printed = cswLeadingTrivia(P, a, b, false, isClosingBrace);
  const hasDirective = cswAnyDirective(lx, a, b);
  if (hasDirective) {
    printed = P.D.alwaysFits(printed);
  }
  if (kind !== K_CloseBraceToken) {
    return printed;
  }
  let extra = DOC_NULL;
  if (hasDirective || cswAnyComment(lx, a, b)) {
    extra = cswExtraNewLinesRange(P, a, b);
  }
  if (printed !== DOC_NULL || extra !== DOC_NULL) {
    return P.D.concat([extra, P.D.indentIf(printed !== DOC_NULL, printed), DOC_HARDLINE]);
  }
  return printed;
};

export const cswLeadingTriviaTok = (P: CsPrint, t: i32): i32 => {
  if (t < 0) {
    return DOC_NULL;
  }
  return cswLeadingTriviaTokRange(P, t, P.lx.l0[t], P.lx.l1[t]);
};

/** Whether the token is printed as several lines (HasMultiLineText). */
const cswVerbatimText = (P: CsPrint, t: i32, kind: i32): boolean => {
  if (kind === K_StringLiteralToken) {
    return toI32(P.src[P.lx.start[t]]) === 64;
  }
  if (kind === K_InterpolatedStringTextToken) {
    const e = P.par(P.lx.parent[t]);
    return P.t.is(e, Y_InterpolatedStringExpression) && P.tk(P.s(e, F_InterpolatedStringExpression_StringStartToken)) === K_InterpolatedVerbatimStringStartToken;
  }
  return false;
};

/** The nearest ancestor of node n (n excluded) of type y, or -1 (FindParent). */
export const cswFindParent = (P: CsPrint, n: i32, y: i32): i32 => {
  let p = P.par(n);
  while (p >= 0) {
    if (P.is(p, y)) {
      return p;
    }
    p = P.par(p);
  }
  return -1;
};

/** Token.ShouldIndentRawString. */
export const cswShouldIndentRawString = (P: CsPrint, arg: i32): boolean => {
  if (arg < 0) {
    return true;
  }
  const e = P.s(arg, F_Argument_Expression);
  return P.is(e, Y_ParenthesizedLambdaExpression) || P.is(e, Y_SimpleLambdaExpression);
};

/** The ValueText of a multi-line raw string's content text src[a, b) (Roslyn's makeContent), into buf. */
export const cswRawValue = (P: CsPrint, buf: CsBuf, a: i32, b: i32, ia: i32, ib: i32, isFirst: boolean): void => {
  const src = P.src;
  const il = ib - ia;
  if (il === 0) {
    buf.range(src, a, b);
    return;
  }
  let i = a;
  if (!isFirst) {
    i = cswConsumeThroughNewLine(src, buf, i, b);
  }
  while (i < b) {
    const ls = i;
    while (i < b) {
      const c = csCodePoint(src, i, b);
      if (!csIsWhitespaceCp(c)) {
        break;
      }
      i += csCpLen(toI32(src[i]));
    }
    if (i > ls + il) {
      i = ls + il;
    }
    i = cswConsumeThroughNewLine(src, buf, i, b);
  }
};

const cswConsumeThroughNewLine = (src: u8[], buf: CsBuf, a: i32, b: i32): i32 => {
  let i = a;
  while (i < b) {
    const c = toI32(src[i]);
    if (c === 13) {
      if (i + 1 < b && toI32(src[i + 1]) === 10) {
        buf.range(src, a, i + 2);
        return i + 2;
      }
      buf.range(src, a, i + 1);
      return i + 1;
    }
    if (c === 10) {
      buf.range(src, a, i + 1);
      return i + 1;
    }
    if (c >= 0x80) {
      const cp = csCodePoint(src, i, b);
      const l = csCpLen(c);
      if (cp === 0x85 || cp === 0x2028 || cp === 0x2029) {
        buf.range(src, a, i + l);
        return i + l;
      }
      i += l;
      continue;
    }
    i++;
  }
  buf.range(src, a, b);
  return b;
};

/** The indentation whitespace of a multi-line raw string's closing token [a, b): after its line break, before the quotes. */
export const cswRawIndentStart = (src: u8[], a: i32, b: i32): i32 => {
  let i = a;
  const c = toI32(src[i]);
  if (c === 13 && i + 1 < b && toI32(src[i + 1]) === 10) {
    return i + 2;
  }
  if (c >= 0x80) {
    return i + csCpLen(c);
  }
  return i + 1;
};

export const cswRawIndentEnd = (src: u8[], a: i32, b: i32): i32 => {
  let i = a;
  while (i < b) {
    const c = csCodePoint(src, i, b);
    if (!csIsWhitespaceCp(c)) {
      break;
    }
    i += csCpLen(toI32(src[i]));
  }
  return i;
};

/** Pushes the lines of buf split on \r\n, \r and \n as StringDocs, each followed by a line doc chosen like the raw string printers do. */
const cswRawLines = (P: CsPrint, contents: i32[], buf: CsBuf, lastLineIsIndented: boolean, lineAfterLast: boolean): void => {
  const D = P.D;
  let s = 0;
  let i = 0;
  const n = buf.n;
  while (true) {
    let e = i;
    while (e < n && toI32(buf.buf[e]) !== 10 && toI32(buf.buf[e]) !== 13) {
      e++;
    }
    const a = D.appendBytes(buf.buf, s, e);
    contents.push(D.strAt(a, a + (e - s), false));
    const isLast = e >= n;
    if (!isLast || lineAfterLast) {
      contents.push(lastLineIsIndented ? (e === s ? DOC_HARDLINE : DOC_HARDLINE_NO_TRIM) : DOC_LITERAL_LINE);
    }
    if (isLast) {
      return;
    }
    if (toI32(buf.buf[e]) === 13 && e + 1 < n && toI32(buf.buf[e + 1]) === 10) {
      i = e + 2;
    } else {
      i = e + 1;
    }
    s = i;
  }
};

export const cswRawLinesExport = (P: CsPrint, contents: i32[], buf: CsBuf, lastLineIsIndented: boolean, lineAfterLast: boolean): void =>
  cswRawLines(P, contents, buf, lastLineIsIndented, lineAfterLast);

/** Token.PrintSyntaxToken: suffix -1 for none; the leading trivia is [la, lb). */
export const cswTokFull = (P: CsPrint, t: i32, suffix: i32, skipLead: boolean, skipTrail: boolean, la: i32, lb: i32): i32 => {
  if (t < 0) {
    return DOC_NULL;
  }
  const lx = P.lx;
  const D = P.D;
  const kind = lx.kind[t];
  const lead = skipLead ? DOC_NULL : cswLeadingTriviaTokRange(P, t, la, lb);
  const trail = skipTrail ? DOC_NULL : cswTrailingTriviaTok(P, t);
  const verbatim = cswVerbatimText(P, t, kind);
  const multi =
    verbatim ||
    kind === K_MultiLineRawStringLiteralToken ||
    kind === K_InterpolatedMultiLineRawStringStartToken ||
    kind === K_InterpolatedRawStringEndToken;
  if (suffix < 0 && lead === DOC_NULL && trail === DOC_NULL && !multi) {
    return D.strSrc(lx.start[t], lx.end[t]);
  }
  const docs: i32[] = [];
  if (lead !== DOC_NULL) {
    docs.push(lead);
  }
  const src = P.src;
  const a = lx.start[t];
  const b = lx.end[t];
  if (verbatim) {
    // Text.Replace("\r", "").Split('\n') joined with literal lines
    const parts: i32[] = [];
    let s = a;
    while (true) {
      let e = s;
      let hasCr = false;
      while (e < b && toI32(src[e]) !== 10) {
        if (toI32(src[e]) === 13) {
          hasCr = true;
        }
        e++;
      }
      if (toI32(parts.length) > 0) {
        parts.push(DOC_LITERAL_LINE);
      }
      if (hasCr) {
        const o = D.ns;
        for (let i = s; i < e; i++) {
          if (toI32(src[i]) !== 13) {
            D.appendByte(toI32(src[i]));
          }
        }
        parts.push(D.strAt(o, D.ns, false));
      } else {
        parts.push(D.strSrc(s, e));
      }
      if (e >= b) {
        break;
      }
      s = e + 1;
    }
    docs.push(D.concat(parts));
  } else if (kind === K_MultiLineRawStringLiteralToken) {
    // the first line (the quotes), the value's lines, the last line trimmed
    let fe = a;
    while (fe < b && toI32(src[fe]) !== 10 && toI32(src[fe]) !== 13) {
      fe++;
    }
    let ls = b;
    while (ls > a && toI32(src[ls - 1]) !== 10 && toI32(src[ls - 1]) !== 13) {
      ls--;
    }
    const lastLineIsIndented = toI32(src[ls]) === 9 || toI32(src[ls]) === 32;
    const contents: i32[] = [D.strSrc(a, fe), lastLineIsIndented ? DOC_HARDLINE_NO_TRIM : DOC_LITERAL_LINE];
    // the content: after the first line break, up to the line break before the last line
    let cs = fe;
    if (toI32(src[cs]) === 13 && cs + 1 < b && toI32(src[cs + 1]) === 10) {
      cs += 2;
    } else {
      cs += 1;
    }
    let ce = ls - 1;
    if (ce > cs && toI32(src[ce]) === 10 && toI32(src[ce - 1]) === 13) {
      ce--;
    }
    const buf = new CsBuf(ce - cs + 16);
    cswRawValue(P, buf, cs, ce, ls, cswRawIndentEnd(src, ls, b), true);
    cswRawLines(P, contents, buf, lastLineIsIndented, true);
    let ts = ls;
    while (ts < b && csIsTrimByteAt(src, ts, b)) {
      ts += csCpLen(toI32(src[ts]));
    }
    contents.push(D.strSrc(ts, b));
    docs.push(D.indentIf(cswShouldIndentRawString(P, cswFindParent(P, lx.parent[t], Y_Argument)), D.concat(contents)));
  } else if (kind === K_InterpolatedMultiLineRawStringStartToken || kind === K_InterpolatedRawStringEndToken) {
    let ts = a;
    let te = b;
    while (ts < te && csIsTrimByteAt(src, ts, te)) {
      ts += csCpLen(toI32(src[ts]));
    }
    while (te > ts && (toI32(src[te - 1]) === 32 || (toI32(src[te - 1]) >= 9 && toI32(src[te - 1]) <= 13))) {
      te--;
    }
    docs.push(D.strSrc(ts, te));
  } else {
    docs.push(D.strSrc(a, b));
  }
  if (trail !== DOC_NULL) {
    if (P.tcTrivia >= 0) {
      let fc = -1;
      for (let i = lx.t0[t]; i < lx.t1[t]; i++) {
        if (cswIsCommentKind(lx.trKind[i])) {
          fc = i;
          break;
        }
      }
      if (fc === P.tcTrivia) {
        docs.push(P.tcDoc);
        P.movedTrailingTrivia = true;
        P.tcTrivia = -1;
      }
    }
    docs.push(trail);
  }
  if (suffix >= 0) {
    docs.push(suffix);
  }
  return D.concat(docs);
};

/** Whether the char at s[i] is one .NET's Trim removes. */
export const csIsTrimByteAt = (s: u8[], i: i32, b: i32): boolean => {
  const c = toI32(s[i]);
  if (c === 32 || (c >= 9 && c <= 13)) {
    return true;
  }
  if (c < 0x80) {
    return false;
  }
  return csIsDotnetWhiteSpaceCp(csCodePoint(s, i, b));
};

export const cswTok = (P: CsPrint, t: i32): i32 => (t < 0 ? DOC_NULL : cswTokFull(P, t, -1, false, false, P.lx.l0[t], P.lx.l1[t]));

export const cswTokSfx = (P: CsPrint, t: i32, sfx: i32): i32 => (t < 0 ? DOC_NULL : cswTokFull(P, t, sfx, false, false, P.lx.l0[t], P.lx.l1[t]));

export const cswTokSfxNoLead = (P: CsPrint, t: i32, sfx: i32): i32 => (t < 0 ? DOC_NULL : cswTokFull(P, t, sfx, true, false, P.lx.l0[t], P.lx.l1[t]));

export const cswTokNoLead = (P: CsPrint, t: i32): i32 => (t < 0 ? DOC_NULL : cswTokFull(P, t, -1, true, false, P.lx.l0[t], P.lx.l1[t]));

export const cswTokNoTrail = (P: CsPrint, t: i32): i32 => (t < 0 ? DOC_NULL : cswTokFull(P, t, -1, false, true, P.lx.l0[t], P.lx.l1[t]));

/** Token.HasComments. */
export const cswTokHasComments = (P: CsPrint, t: i32): boolean => {
  const lx = P.lx;
  return cswAnyNonWhitespace(lx, lx.l0[t], lx.l1[t]) || cswAnyNonWhitespace(lx, lx.t0[t], lx.t1[t]);
};

// ---- text of nodes ----

export const cswTokFullStart = (lx: CsLexer, t: i32): i32 => (lx.l0[t] < lx.l1[t] ? lx.trStart[lx.l0[t]] : lx.start[t]);

export const cswTokFullEnd = (lx: CsLexer, t: i32): i32 => (lx.t0[t] < lx.t1[t] ? lx.trEnd[lx.t1[t] - 1] : lx.end[t]);

/** Appends src[a, b) with CSharpierIgnore.PrintWithoutFormatting's line handling: trailing [\t\v\f ] dropped and line breaks made the line ending. */
export const cswAppendUnformatted = (P: CsPrint, buf: CsBuf, a: i32, b: i32): void => {
  const src = P.src;
  let i = a;
  let ws = -1; // start of a pending run of [\t\v\f ]
  while (i < b) {
    const c = toI32(src[i]);
    if (c === 32 || c === 9 || c === 11 || c === 12) {
      if (ws < 0) {
        ws = i;
      }
      i++;
      continue;
    }
    if (c === 13 || c === 10) {
      ws = -1;
      if (P.eolCr) {
        buf.byte(13);
      }
      buf.byte(10);
      if (c === 13 && i + 1 < b && toI32(src[i + 1]) === 10) {
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }
    if (ws >= 0) {
      buf.range(src, ws, i);
      ws = -1;
    }
    buf.byte(c);
    i++;
  }
  if (ws >= 0) {
    buf.range(src, ws, b);
  }
};

/** PrintWithoutFormatting(node): its full text. */
export const cswAppendNodeUnformatted = (P: CsPrint, buf: CsBuf, n: i32): void => {
  cswAppendUnformatted(P, buf, P.t.fullStart(n), P.t.fullEnd(n));
};

/** A StringDoc of buf's text, trimmed. */
export const cswTrimmedDoc = (P: CsPrint, buf: CsBuf): i32 => {
  let a = 0;
  let b = buf.n;
  while (a < b && csIsTrimByteAt(buf.buf, a, b)) {
    a += csCpLen(toI32(buf.buf[a]));
  }
  while (b > a) {
    let s = b - 1;
    while (s > a && (toI32(buf.buf[s]) & 0xc0) === 0x80) {
      s--;
    }
    if (!csIsTrimByteAt(buf.buf, s, b)) {
      break;
    }
    b = s;
  }
  const o = P.D.appendBytes(buf.buf, a, b);
  return P.D.strAt(o, o + (b - a), false);
};

/** node.ToFullString().Trim() as a StringDoc (UnhandledNode). */
export const cswTrimmedSrc = (P: CsPrint, a: i32, b: i32): i32 => {
  let s = a;
  let e = b;
  const src = P.src;
  while (s < e && csIsTrimByteAt(src, s, e)) {
    s += csCpLen(toI32(src[s]));
  }
  while (e > s) {
    let k = e - 1;
    while (k > s && (toI32(src[k]) & 0xc0) === 0x80) {
      k--;
    }
    if (!csIsTrimByteAt(src, k, e)) {
      break;
    }
    e = k;
  }
  return P.D.strSrc(s, e);
};

// ---- TrailingComma ----

export const cswTrailingComma = (P: CsPrint, closing: i32, skipIfBreak: boolean): i32 => {
  const lx = P.lx;
  if (cswAnyDirective(lx, lx.l0[closing], lx.l1[closing])) {
    return DOC_NULL;
  }
  return skipIfBreak ? P.comma : P.D.ifBreak(P.comma, DOC_NULL, -1);
};

// ---- SeparatedSyntaxList ----

/** The first comment in the trailing trivia of node n's last token, or -1. */
export const cswFirstTrailingComment = (P: CsPrint, n: i32): i32 => {
  const t = P.last(n);
  if (t < 0) {
    return -1;
  }
  const lx = P.lx;
  for (let i = lx.t0[t]; i < lx.t1[t]; i++) {
    if (cswIsCommentKind(lx.trKind[i])) {
      return i;
    }
  }
  return -1;
};

/** SeparatedSyntaxList.Print: `item` picks the printer of the elements, `closing` is the closing token or -1. */
export const cswSepList = (P: CsPrint, l: i32, item: i32, afterSep: i32, start: i32, closing: i32): i32 => {
  const lx = P.lx;
  const docs: i32[] = [];
  const unf = new CsBuf(64);
  let printUnformatted = false;
  const n = P.scount(l);
  const nsep = P.sepCount(l);
  for (let x = start; x < n; x++) {
    const member = P.sel(l, x);
    if (cswNodeHasIgnore(P, member, IGN_END)) {
      docs.push(cswTrimmedDoc(P, unf));
      unf.n = 0;
      printUnformatted = false;
    } else if (cswNodeHasIgnore(P, member, IGN_START)) {
      if (!printUnformatted && x > 0) {
        docs.push(DOC_HARDLINE);
      }
      printUnformatted = true;
    }
    if (printUnformatted) {
      cswAppendNodeUnformatted(P, unf, member);
      if (x < nsep) {
        const st = P.sep(l, x);
        const d = cswTrimmedSrc(P, cswTokFullStart(lx, st), cswTokFullEnd(lx, st));
        unf.range(P.src, P.D.a[d], P.D.b[d]);
        if (P.eolCr) {
          unf.byte(13);
        }
        unf.byte(10);
      }
      continue;
    }
    const lastHasNoSeparator = x >= nsep;
    let firstTrailingComment = -1;
    if (lastHasNoSeparator && closing >= 0) {
      firstTrailingComment = cswFirstTrailingComment(P, member);
      if (firstTrailingComment >= 0) {
        P.tcTrivia = firstTrailingComment;
        P.tcDoc = cswTrailingComma(P, closing, true);
      }
    }
    docs.push(cswSlItem(P, item, member));
    if (lastHasNoSeparator) {
      if (closing >= 0 && firstTrailingComment < 0) {
        docs.push(cswTrailingComma(P, closing, false));
      }
      continue;
    }
    const isTrailingSeparator = x === n - 1;
    if (isTrailingSeparator) {
      const st = P.sep(l, x);
      if (cswAnyComment(lx, lx.t0[st], lx.t1[st]) || (closing >= 0 && cswAnyDirective(lx, lx.l0[closing], lx.l1[closing]))) {
        docs.push(cswTok(P, st));
      } else if (closing >= 0) {
        docs.push(cswTrailingComma(P, closing, false));
      } else {
        docs.push(P.D.ifBreak(cswTok(P, st), DOC_NULL, -1));
      }
    } else {
      docs.push(cswTok(P, P.sep(l, x)));
      docs.push(afterSep);
    }
  }
  if (unf.n > 0) {
    docs.push(cswTrimmedDoc(P, unf));
  }
  return P.D.concat(docs);
};


// ---- Modifiers ----

const cswModifierIndex = (k: i32): i32 => {
  switch (k) {
    case K_PublicKeyword:
      return 0;
    case K_PrivateKeyword:
      return 1;
    case K_ProtectedKeyword:
      return 2;
    case K_InternalKeyword:
      return 3;
    case K_FileKeyword:
      return 4;
    case K_StaticKeyword:
      return 5;
    case K_ExternKeyword:
      return 6;
    case K_NewKeyword:
      return 7;
    case K_VirtualKeyword:
      return 8;
    case K_ClosedKeyword:
      return 9;
    case K_AbstractKeyword:
      return 10;
    case K_SealedKeyword:
      return 11;
    case K_OverrideKeyword:
      return 12;
    case K_ReadOnlyKeyword:
      return 13;
    case K_UnsafeKeyword:
      return 14;
    case K_RequiredKeyword:
      return 15;
    case K_VolatileKeyword:
      return 16;
    case K_AsyncKeyword:
      return 17;
    default:
      return 1000;
  }
};

/** Modifiers.Print: the tokens of list l joined with spaces, and a space, in a group. */
export const cswModifiers = (P: CsPrint, l: i32): i32 => {
  const n = P.count(l);
  if (n === 0) {
    return DOC_NULL;
  }
  const docs: i32[] = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      docs.push(DOC_SPACE);
    }
    docs.push(cswTok(P, P.at(l, i)));
  }
  return P.D.group([P.D.concat(docs), DOC_SPACE]);
};

/** Modifiers.PrintSorted. */
export const cswModifiersSorted = (P: CsPrint, l: i32): i32 => {
  const n = P.count(l);
  if (n === 0) {
    return DOC_NULL;
  }
  const lx = P.lx;
  let canSort = n > 1;
  if (canSort) {
    const t0 = P.at(l, 0);
    if (cswAnyDirective(lx, lx.l0[t0], lx.l1[t0])) {
      canSort = false;
    }
    for (let i = 1; i < n && canSort; i++) {
      const t = P.at(l, i);
      if (cswAnyCommentOrDirective(lx, lx.l0[t], lx.l1[t])) {
        canSort = false;
      }
    }
  }
  let sorted = false;
  if (canSort) {
    for (let i = 1; i < n; i++) {
      if (cswModifierIndex(lx.kind[P.at(l, i)]) < cswModifierIndex(lx.kind[P.at(l, i - 1)])) {
        sorted = true;
      }
    }
  }
  if (!sorted) {
    return cswModifiers(P, l);
  }
  // a stable insertion sort (Array.Sort's for short arrays)
  const order: i32[] = [];
  for (let i = 0; i < n; i++) {
    order.push(P.at(l, i));
  }
  for (let i = 1; i < n; i++) {
    const v = order[i];
    const vi = cswModifierIndex(lx.kind[v]);
    let j = i - 1;
    while (j >= 0 && cswModifierIndex(lx.kind[order[j]]) > vi) {
      order[j + 1] = order[j];
      j--;
    }
    order[j + 1] = v;
  }
  let same = true;
  for (let i = 0; i < n; i++) {
    if (order[i] !== P.at(l, i)) {
      same = false;
    }
  }
  if (same) {
    return cswModifiers(P, l);
  }
  P.reorderedModifiers = true;
  const lead = P.at(l, 0);
  const docs: i32[] = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      docs.push(DOC_SPACE);
    }
    const t = order[i];
    if (i === 0) {
      docs.push(cswTokFull(P, t, -1, false, false, lx.l0[lead], lx.l1[lead]));
    } else if (t === lead) {
      docs.push(cswTokFull(P, t, -1, false, false, 0, 0));
    } else {
      docs.push(cswTok(P, t));
    }
  }
  return P.D.group([P.D.concat(docs), DOC_SPACE]);
};

// ---- AttributeLists, ConstraintClauses, OptionalBraces ----

export const cswAttributeLists = (P: CsPrint, node: i32, l: i32): i32 => {
  const n = P.count(l);
  if (n === 0) {
    return DOC_NULL;
  }
  const isInline =
    P.is(node, Y_TypeParameter) || P.is(node, Y_Parameter) || P.is(node, Y_ParenthesizedLambdaExpression) || P.is(node, Y_AccessorDeclaration);
  const sep = isInline ? DOC_LINE : DOC_HARDLINE;
  const docs: i32[] = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      docs.push(sep);
    }
    docs.push(cswAttributeList(P, P.at(l, i)));
  }
  const printed = n === 1 ? docs[0] : P.D.concat(docs);
  if (P.is(node, Y_Parameter) || P.is(node, Y_TypeParameter)) {
    return printed;
  }
  return P.D.concat([printed, sep]);
};

export const cswConstraintClauses = (P: CsPrint, l: i32): i32 => {
  const n = P.count(l);
  if (n === 0) {
    return DOC_NULL;
  }
  const docs: i32[] = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      docs.push(DOC_HARDLINE);
    }
    docs.push(cswTypeParameterConstraintClause(P, P.at(l, i)));
  }
  const body = P.D.concat(docs);
  return P.D.group1(P.D.indent([DOC_HARDLINE, body]));
};

export const cswOptionalBraces = (P: CsPrint, n: i32): i32 => {
  if (P.k(n) === K_Block) {
    return cswBlock(P, n);
  }
  return csdRemoveInitialDoubleHardLine(P.D, P.D.indent([DOC_HARDLINE, cswNode(P, n)]));
};

// ---- CSharpierIgnore ----

/** CSharpierIgnore.IsNodeIgnored. */
export const cswIsNodeIgnored = (P: CsPrint, n: i32): boolean => {
  if (P.is(n, Y_BaseMethodDeclaration) && P.count(P.s(n, 0)) > 0) {
    return false;
  }
  const p = P.par(n);
  if (p < 0) {
    return false;
  }
  const pk = P.k(p);
  if (
    pk !== K_ClassDeclaration &&
    pk !== K_StructDeclaration &&
    pk !== K_InterfaceDeclaration &&
    pk !== K_RecordDeclaration &&
    pk !== K_RecordStructDeclaration &&
    pk !== K_EnumDeclaration &&
    pk !== K_Block &&
    pk !== K_CompilationUnit &&
    pk !== K_NamespaceDeclaration &&
    pk !== K_SwitchSection
  ) {
    return false;
  }
  return cswNodeHasIgnore(P, n, IGN_ONE);
};

/** CSharpierIgnore.PrintNodesRespectingRangeIgnore over the node list l. */
export const cswNodesRespectingRangeIgnore = (P: CsPrint, l: i32): i32[] => {
  const statements: i32[] = [];
  const unf = new CsBuf(64);
  let printUnformatted = false;
  let firstUnformatted = -1;
  const n = P.count(l);
  for (let i = 0; i < n; i++) {
    const node = P.at(l, i);
    if (cswNodeHasIgnore(P, node, IGN_END)) {
      const code = cswTrimmedDoc(P, unf);
      statements.push(firstUnformatted >= 0 && P.is(firstUnformatted, Y_Statement) ? P.D.concat([cswExtraNewLines(P, firstUnformatted), code]) : code);
      unf.n = 0;
      firstUnformatted = -1;
      printUnformatted = false;
    } else if (cswNodeHasIgnore(P, node, IGN_START)) {
      if (firstUnformatted < 0) {
        firstUnformatted = node;
      }
      printUnformatted = true;
    }
    if (printUnformatted) {
      cswAppendNodeUnformatted(P, unf, node);
    } else {
      statements.push(cswNode(P, node));
    }
  }
  if (unf.n > 0) {
    const code = cswTrimmedDoc(P, unf);
    statements.push(firstUnformatted >= 0 && P.is(firstUnformatted, Y_Statement) ? P.D.concat([cswExtraNewLines(P, firstUnformatted), code]) : code);
  }
  return statements;
};

/** Doc.Join(separator, docs). */
export const cswJoin = (P: CsPrint, sep: i32, docs: i32[]): i32 => {
  const n = toI32(docs.length);
  if (n === 1) {
    return docs[0];
  }
  const out: i32[] = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      out.push(sep);
    }
    out.push(docs[i]);
  }
  return P.D.concat(out);
};

/** Doc.Join(separator, list, Node.Print). */
export const cswJoinNodes = (P: CsPrint, sep: i32, l: i32): i32 => {
  const n = P.count(l);
  if (n === 0) {
    return DOC_NULL;
  }
  if (n === 1) {
    return cswNode(P, P.at(l, 0));
  }
  const out: i32[] = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      out.push(sep);
    }
    out.push(cswNode(P, P.at(l, i)));
  }
  return P.D.concat(out);
};

// ---- ArgumentListLike ----

const cswLambdaBodyIsBraced = (P: CsPrint, body: i32): boolean =>
  P.k(body) === K_Block || P.is(body, Y_ObjectCreationExpression) || P.is(body, Y_AnonymousObjectCreationExpression);

export const cswLambdaBody = (P: CsPrint, lambda: i32): i32 => {
  if (P.is(lambda, Y_SimpleLambdaExpression)) {
    const b = P.s(lambda, F_SimpleLambdaExpression_Block);
    return b >= 0 ? b : P.s(lambda, F_SimpleLambdaExpression_ExpressionBody);
  }
  if (P.is(lambda, Y_ParenthesizedLambdaExpression)) {
    const b = P.s(lambda, F_ParenthesizedLambdaExpression_Block);
    return b >= 0 ? b : P.s(lambda, F_ParenthesizedLambdaExpression_ExpressionBody);
  }
  const b = P.s(lambda, F_AnonymousMethodExpression_Block);
  return b >= 0 ? b : P.s(lambda, F_AnonymousMethodExpression_ExpressionBody);
};

export const cswArgumentListLike = (P: CsPrint, open: i32, args: i32, close: i32): i32 => {
  const D = P.D;
  const n = P.scount(args);
  let a = DOC_NULL;
  const a0 = n > 0 ? P.sel(args, 0) : -1;
  const e0 = a0 >= 0 ? P.s(a0, F_Argument_Expression) : -1;
  const lx = P.lx;
  if (n === 1 && P.is(e0, Y_SimpleLambdaExpression) && !cswAnyComment(lx, cswLeadA(P, e0), cswLeadB(P, e0))) {
    const gid = D.newGroupId();
    const head = D.groupWithId(gid, [D.indent([DOC_SOFTLINE, cswArgumentModifiers(P, a0), cswSimpleLambdaHead(P, e0)])]);
    const body = cswSimpleLambdaBody(P, e0);
    a = D.concat([
      head,
      D.ifBreak(D.indent1(D.group1(body)), body, gid),
      cswLambdaBodyIsBraced(P, cswLambdaBody(P, e0)) ? D.ifBreak(DOC_SOFTLINE, DOC_NULL, gid) : DOC_SOFTLINE,
    ]);
  } else if (n === 1 && P.is(e0, Y_ParenthesizedLambdaExpression) && P.scount(P.s(P.s(e0, F_ParenthesizedLambdaExpression_ParameterList), F_ParameterList_Parameters)) === 0) {
    const gid = D.newGroupId();
    a = D.concat([
      D.groupWithId(gid, [D.indent([DOC_SOFTLINE, cswArgumentModifiers(P, a0), cswParenLambdaHead(P, e0)])]),
      D.indentIfBreak(cswParenLambdaBody(P, e0), gid),
      P.s(e0, F_ParenthesizedLambdaExpression_Block) >= 0 ? D.ifBreak(DOC_SOFTLINE, DOC_NULL, gid) : DOC_SOFTLINE,
    ]);
  } else if (n === 1 && P.k(e0) === K_CollectionExpression && P.s(a0, F_Argument_NameColon) < 0) {
    a = cswSepList(P, args, SL_ARGUMENT, DOC_LINE, 0, -1);
  } else if (n > 1 && cswTrailingLambdaCandidate(P, open, args)) {
    a = cswArgumentListWithTrailingLambda(P, args, P.s(P.sel(args, n - 1), F_Argument_Expression));
  } else if (n > 0) {
    a = D.concat([D.indent([DOC_SOFTLINE, cswSepList(P, args, SL_ARGUMENT, DOC_LINE, 0, -1)]), DOC_SOFTLINE]);
  }
  return D.concat([cswTok(P, open), a, cswTok(P, close)]);
};

const cswArrowToken = (P: CsPrint, lambda: i32): i32 =>
  P.is(lambda, Y_SimpleLambdaExpression) ? P.s(lambda, F_SimpleLambdaExpression_ArrowToken) : P.s(lambda, F_ParenthesizedLambdaExpression_ArrowToken);

const cswTrailingLambdaCandidate = (P: CsPrint, open: i32, args: i32): boolean => {
  const n = P.scount(args);
  const last = P.s(P.sel(args, n - 1), F_Argument_Expression);
  if (!P.is(last, Y_LambdaExpression)) {
    return false;
  }
  for (let i = 0; i < n - 1; i++) {
    if (P.is(P.s(P.sel(args, i), F_Argument_Expression), Y_AnonymousFunctionExpression)) {
      return false;
    }
  }
  const lx = P.lx;
  const arrow = cswArrowToken(P, last);
  // DescendantTrivia over [openParen.SpanStart, arrow.SpanStart)
  for (let i = lx.t0[open]; i < lx.l1[arrow]; i++) {
    const k = lx.trKind[i];
    if (cswIsCommentKind(k) || cswIsDirectiveKind(k)) {
      return false;
    }
  }
  return true;
};

const cswArgumentListWithTrailingLambda = (P: CsPrint, args: i32, lastLambda: i32): i32 => {
  const D = P.D;
  const chop = D.concat([D.indent([DOC_SOFTLINE, cswSepList(P, args, SL_ARGUMENT, DOC_LINE, 0, -1)]), DOC_SOFTLINE]);
  let head = DOC_NULL;
  let body = DOC_NULL;
  let braced = false;
  if (P.is(lastLambda, Y_SimpleLambdaExpression)) {
    braced = cswLambdaBodyIsBraced(P, cswLambdaBody(P, lastLambda));
    head = cswSimpleLambdaHead(P, lastLambda);
    body = cswSimpleLambdaBody(P, lastLambda);
  } else if (P.is(lastLambda, Y_ParenthesizedLambdaExpression)) {
    braced = P.s(lastLambda, F_ParenthesizedLambdaExpression_Block) >= 0;
    head = cswParenLambdaHead(P, lastLambda);
    body = braced ? cswParenLambdaBody(P, lastLambda) : D.indent([DOC_LINE, cswNode(P, cswLambdaBody(P, lastLambda))]);
  } else {
    return chop;
  }
  const n = P.scount(args);
  const flat: i32[] = [];
  for (let x = 0; x < n - 1; x++) {
    flat.push(cswArgument(P, P.sel(args, x)));
    flat.push(cswTok(P, P.sep(args, x)));
    flat.push(DOC_SPACE);
  }
  flat.push(cswArgumentModifiers(P, P.sel(args, n - 1)));
  flat.push(head);
  for (let i = 0; i < toI32(flat.length); i++) {
    if (csdContainsBreak(D, flat[i])) {
      return chop;
    }
  }
  const wrap = D.concat([D.forceFlat(flat), body, braced ? DOC_NULL : DOC_SOFTLINE]);
  return D.conditionalGroup([wrap, wrap, chop]);
};

// ---- RightHandSide ----

const L_BASIC_NO_LINE: i32 = 0;
const L_BASIC_SPACE: i32 = 1;
const L_BREAK_AFTER_OP: i32 = 2;
const L_BREAK_BEFORE_COALESCE: i32 = 3;
const L_CHAIN: i32 = 4;
const L_CHAIN_TAIL: i32 = 5;
const L_FLUID: i32 = 6;

export const cswRightHandSide = (P: CsPrint, left: i32, leftDoc: i32, opDoc: i32, right: i32): i32 => {
  const D = P.D;
  const layout = cswRhsLayout(P, left, right);
  switch (layout) {
    case L_BASIC_NO_LINE:
      return D.concat([leftDoc, opDoc, cswNode(P, right)]);
    case L_BASIC_SPACE:
      return D.concat([leftDoc, opDoc, DOC_SPACE, cswNode(P, right)]);
    case L_BREAK_AFTER_OP:
      return D.group([D.group1(leftDoc), opDoc, D.group1(D.indent([DOC_LINE, cswNode(P, right)]))]);
    case L_BREAK_BEFORE_COALESCE: {
      const gid = D.newGroupId();
      const docs = cswBinaryParts(P, right);
      const rest: i32[] = [];
      for (let i = 1; i < toI32(docs.length); i++) {
        rest.push(docs[i]);
      }
      return D.group([
        D.group1(leftDoc),
        opDoc,
        D.groupWithId(gid, [D.indent1(DOC_LINE)]),
        D.indentIfBreak(D.group([docs[0], D.ifBreak(D.concat(rest), D.indent(rest), gid)]), gid),
      ]);
    }
    case L_CHAIN:
      return D.concat([D.group1(leftDoc), opDoc, DOC_LINE, cswNode(P, right)]);
    case L_CHAIN_TAIL:
      return D.concat([D.group1(leftDoc), opDoc, D.indent([DOC_LINE, cswNode(P, right)])]);
    default: {
      const gid = D.newGroupId();
      return D.group([D.group1(leftDoc), opDoc, D.groupWithId(gid, [D.indent1(DOC_LINE)]), D.indentIfBreak(cswNode(P, right), gid)]);
    }
  }
};

const cswRhsLayout = (P: CsPrint, left: i32, right: i32): i32 => {
  const lx = P.lx;
  if (cswAnyComment(lx, cswLeadA(P, right), cswLeadB(P, right))) {
    return L_BREAK_AFTER_OP;
  }
  const isTail = !P.is(right, Y_AssignmentExpression);
  const lp = P.par(left);
  const shouldChain =
    P.is(left, Y_AssignmentExpression) &&
    (P.is(lp, Y_AssignmentExpression) || P.is(lp, Y_EqualsValueClause)) &&
    (!isTail || !(P.is(P.par(lp), Y_ExpressionStatement) || P.is(P.par(lp), Y_VariableDeclarator) || P.is(P.par(lp), Y_ArrowExpressionClause)));
  if (shouldChain) {
    return !isTail ? L_CHAIN : L_CHAIN_TAIL;
  }
  if (!isTail && P.is(P.s(right, F_AssignmentExpression_Right), Y_AssignmentExpression)) {
    return L_BREAK_AFTER_OP;
  }
  if (
    P.is(right, Y_ObjectCreationExpression) &&
    P.is(P.s(right, F_ObjectCreationExpression_Type), Y_GenericName) &&
    P.s(right, F_ObjectCreationExpression_ArgumentList) >= 0 &&
    P.scount(P.s(P.s(right, F_ObjectCreationExpression_ArgumentList), F_ArgumentList_Arguments)) === 0 &&
    P.s(right, F_ObjectCreationExpression_Initializer) < 0
  ) {
    return L_BREAK_AFTER_OP;
  }
  const rk = P.k(right);
  if (rk === K_CollectionExpression) {
    return L_BASIC_SPACE;
  }
  if (P.is(right, Y_LiteralExpression) && P.tk(P.s(right, F_LiteralExpression_Token)) === K_MultiLineRawStringLiteralToken) {
    return L_BASIC_SPACE;
  }
  if (P.is(right, Y_InterpolatedStringExpression) && P.tk(P.s(right, F_InterpolatedStringExpression_StringStartToken)) === K_InterpolatedMultiLineRawStringStartToken) {
    return L_BASIC_SPACE;
  }
  if (P.is(right, Y_InitializerExpression)) {
    return L_BASIC_NO_LINE;
  }
  if (P.is(right, Y_BinaryExpression) && cswIsCoalesceWithNonBinaryLeft(P, right)) {
    return L_BREAK_BEFORE_COALESCE;
  }
  if (P.is(right, Y_BinaryExpression)) {
    return L_BREAK_AFTER_OP;
  }
  if (P.is(right, Y_CastExpression) && P.is(P.s(right, F_CastExpression_Type), Y_GenericName)) {
    return L_BREAK_AFTER_OP;
  }
  if (P.is(right, Y_ConditionalExpression)) {
    const c = P.s(right, F_ConditionalExpression_Condition);
    if (P.is(c, Y_BinaryExpression) || P.is(c, Y_ParenthesizedExpression)) {
      return L_BREAK_AFTER_OP;
    }
    if (P.is(P.s(right, F_ConditionalExpression_WhenFalse), Y_ConditionalExpression) && !P.is(P.s(right, F_ConditionalExpression_WhenTrue), Y_ConditionalExpression)) {
      return L_BREAK_AFTER_OP;
    }
  }
  if (P.is(right, Y_InterpolatedStringExpression) || P.is(right, Y_IsPatternExpression) || P.is(right, Y_LiteralExpression) || P.is(right, Y_QueryExpression)) {
    return L_BREAK_AFTER_OP;
  }
  if (P.is(right, Y_StackAllocArrayCreationExpression) && P.s(right, F_StackAllocArrayCreationExpression_Initializer) < 0) {
    return L_BREAK_AFTER_OP;
  }
  return L_FLUID;
};

// ---- MembersWithForcedLines ----

/** MembersWithForcedLines.Print over the member list l of node (a separated list when `separated`). */
export const cswMembersWithForcedLines = (P: CsPrint, node: i32, l: i32, separated: boolean, skipFirstHardLine: boolean): i32[] => {
  const lx = P.lx;
  const result: i32[] = [];
  if (!skipFirstHardLine) {
    result.push(DOC_HARDLINE);
  }
  const unf = new CsBuf(64);
  let printUnformatted = false;
  let lastMemberForcedBlankLine = false;
  const n = separated ? P.scount(l) : P.count(l);
  const nsep = separated ? P.sepCount(l) : 0;
  for (let mi = 0; mi < n; mi++) {
    let skipAddingLineBecauseIgnoreEnded = false;
    const member = separated ? P.sel(l, mi) : P.at(l, mi);
    const la = cswLeadA(P, member);
    const lb = cswLeadB(P, member);
    if (cswHasIgnoreComment(P, la, lb, IGN_END)) {
      skipAddingLineBecauseIgnoreEnded = true;
      result.push(cswTrimmedDoc(P, unf));
      unf.n = 0;
      printUnformatted = false;
    } else if (cswHasIgnoreComment(P, la, lb, IGN_START)) {
      if (!printUnformatted && mi > 0) {
        result.push(DOC_HARDLINE);
        result.push(cswExtraNewLines(P, member));
      }
      printUnformatted = true;
    }
    if (printUnformatted) {
      cswAppendNodeUnformatted(P, unf, member);
      continue;
    }
    const mk = P.k(member);
    let blankLineIsForced =
      (mk === K_MethodDeclaration && P.k(node) !== K_InterfaceDeclaration) ||
      mk === K_ClassDeclaration ||
      mk === K_ConstructorDeclaration ||
      mk === K_ConversionOperatorDeclaration ||
      mk === K_DestructorDeclaration ||
      mk === K_EnumDeclaration ||
      mk === K_FileScopedNamespaceDeclaration ||
      mk === K_InterfaceDeclaration ||
      mk === K_NamespaceDeclaration ||
      mk === K_OperatorDeclaration ||
      mk === K_RecordDeclaration ||
      mk === K_RecordStructDeclaration ||
      mk === K_StructDeclaration;
    if (mk === K_MethodDeclaration && P.k(node) === K_ClassDeclaration && cswHasModifier(P, P.s(node, 1), K_AbstractKeyword) && cswHasModifier(P, P.s(member, 1), K_AbstractKeyword)) {
      blankLineIsForced = false;
    }
    if (mi === 0) {
      lastMemberForcedBlankLine = blankLineIsForced;
      result.push(cswNode(P, member));
      const sepDoc = cswMemberSeparator(P, node, l, separated, mi, nsep, member);
      if (sepDoc !== DOC_NULL) {
        result.push(sepDoc);
      }
      continue;
    }
    let addBlankLine = blankLineIsForced || lastMemberForcedBlankLine;
    let containsCommentOrNewLine = false;
    let printExtraNewLines = false;
    let containsEndIfOrRegion = false;
    let containsIf = false;
    let containsElif = false;
    let containsElse = false;
    let containsEol = false;
    let lineFollowsEndIf = false;
    for (let ti = la; ti < lb; ti++) {
      const k = lx.trKind[ti];
      if (k === K_EndOfLineTrivia || cswIsCommentKind(k)) {
        containsCommentOrNewLine = true;
      } else if (k === K_PragmaWarningDirectiveTrivia || k === K_PragmaChecksumDirectiveTrivia || k === K_IfDirectiveTrivia || k === K_EndRegionDirectiveTrivia) {
        printExtraNewLines = true;
      } else if (k === K_EndIfDirectiveTrivia) {
        containsEndIfOrRegion = true;
      }
      if (k === K_EndIfDirectiveTrivia) {
        lineFollowsEndIf = cswIndexOfNextEol(lx, lb, ti) >= 0;
      }
      if (k === K_IfDirectiveTrivia) {
        containsIf = true;
      } else if (k === K_ElifDirectiveTrivia) {
        containsElif = true;
      } else if (k === K_ElseDirectiveTrivia) {
        containsElse = true;
      } else if (k === K_EndOfLineTrivia) {
        containsEol = true;
      }
    }
    if (!addBlankLine) {
      addBlankLine = P.count(P.s(member, 0)) > 0 || containsCommentOrNewLine;
    }
    if (printExtraNewLines) {
      result.push(cswExtraNewLines(P, member));
    } else if (addBlankLine && !containsEndIfOrRegion && !skipAddingLineBecauseIgnoreEnded) {
      result.push(DOC_HARDLINE);
    }
    if (
      addBlankLine &&
      ((!containsEndIfOrRegion && containsIf && !containsEol) ||
        (containsEndIfOrRegion && !containsIf && !containsElif && !containsElse && !lineFollowsEndIf && !printExtraNewLines))
    ) {
      P.nextTriviaNeedsLine = true;
    }
    const sepDoc = cswMemberSeparator(P, node, l, separated, mi, nsep, member);
    result.push(DOC_HARDLINE);
    result.push(cswNode(P, member));
    if (sepDoc !== DOC_NULL) {
      result.push(sepDoc);
    }
    lastMemberForcedBlankLine = blankLineIsForced;
  }
  if (unf.n > 0) {
    result.push(cswTrimmedDoc(P, unf));
  }
  return result;
};

export const cswHasModifier = (P: CsPrint, l: i32, kind: i32): boolean => {
  const n = P.count(l);
  for (let i = 0; i < n; i++) {
    if (P.lx.kind[P.at(l, i)] === kind) {
      return true;
    }
  }
  return false;
};

const cswMemberSeparator = (P: CsPrint, node: i32, l: i32, separated: boolean, mi: i32, nsep: i32, member: i32): i32 => {
  if (!separated) {
    return DOC_NULL;
  }
  if (mi < nsep) {
    return cswTok(P, P.sep(l, mi));
  }
  if (P.k(node) === K_EnumDeclaration && P.k(member) === K_EnumMemberDeclaration) {
    const close = P.s(node, F_EnumDeclaration_CloseBraceToken);
    const ftc = cswFirstTrailingComment(P, member);
    if (ftc >= 0) {
      P.tcTrivia = ftc;
      P.tcDoc = cswTrailingComma(P, close, true);
    } else {
      return cswTrailingComma(P, close, false);
    }
  }
  return DOC_NULL;
};

// ---- NamespaceLikePrinter ----

/** NamespaceLikePrinter.Print for a compilation unit or namespace with the given lists, into docs. */
export const cswNamespaceLike = (P: CsPrint, node: i32, externs: i32, usings: i32, members: i32, docs: i32[]): void => {
  const D = P.D;
  const lx = P.lx;
  const ne = P.count(externs);
  const nu = P.count(usings);
  if (ne > 0) {
    const parts: i32[] = [];
    for (let i = 0; i < ne; i++) {
      if (i > 0) {
        parts.push(DOC_HARDLINE);
      }
      parts.push(cswExternAlias(P, P.at(externs, i), i !== 0));
    }
    docs.push(ne === 1 ? parts[0] : D.concat(parts));
  }
  if (nu > 0) {
    if (ne > 0) {
      docs.push(DOC_HARDLINE);
    }
    docs.push(cswUsingsWithSorting(P, usings, ne !== 0));
  }
  let cuWithAttributes = false;
  const isCu = P.k(node) === K_CompilationUnit;
  if (isCu && P.count(P.s(node, F_CompilationUnit_AttributeLists)) > 0) {
    cuWithAttributes = true;
    const al = P.s(node, F_CompilationUnit_AttributeLists);
    if (ne > 0 || nu > 0) {
      const a0 = P.at(al, 0);
      docs.push(cswAnyDirective(lx, cswLeadA(P, a0), cswLeadB(P, a0)) ? cswExtraNewLines(P, a0) : DOC_HARDLINE);
    }
    docs.push(DOC_HARDLINE);
    docs.push(cswAttributeLists(P, node, al));
  }
  const nm = P.count(members);
  if (nm <= 0) {
    return;
  }
  if (nu > 0 || ne > 0) {
    const m0 = P.at(members, 0);
    const la = cswLeadA(P, m0);
    const lb = cswLeadB(P, m0);
    let nDir = 0;
    let allEndIf = true;
    for (let i = la; i < lb; i++) {
      const k = lx.trKind[i];
      if (cswIsDirectiveKind(k)) {
        nDir++;
        if (k !== K_EndIfDirectiveTrivia) {
          allEndIf = false;
        }
      }
    }
    if (nDir !== 0) {
      if ((!cuWithAttributes && allEndIf) || !allEndIf) {
        docs.push(cswExtraNewLines(P, m0));
      }
    } else if (!cuWithAttributes) {
      docs.push(DOC_HARDLINE);
    }
  }
  const ms = cswMembersWithForcedLines(P, node, members, false, nu === 0 && ne === 0 && !cuWithAttributes);
  for (let i = 0; i < toI32(ms.length); i++) {
    docs.push(ms[i]);
  }
};

// ---- UsingDirectives ----

/** The ICU primary weight of an ASCII char for culture-sensitive comparison (CLDR root order). */
const cswCollationWeight = (c: i32): i32 => {
  if (c >= 97 && c <= 122) {
    return 1000 + (c - 97) * 2;
  }
  if (c >= 65 && c <= 90) {
    return 1000 + (c - 65) * 2;
  }
  if (c >= 48 && c <= 57) {
    return 900 + (c - 48);
  }
  if (c >= 0x80) {
    return 2000 + c;
  }
  const punct = "\t\n\u000b\u000c\r _-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$";
  for (let i = 0; i < toI32(punct.length); i++) {
    if (punct.charCodeAt(i) === c) {
      return 10 + i;
    }
  }
  return 5 + c;
};

/** string.Compare with a culture: primary weights, then (unless ignoring case) lowercase before uppercase. */
export const cswCultureCompare = (s: u8[], a1: i32, b1: i32, s2: u8[], a2: i32, b2: i32, ignoreCase: boolean): i32 => {
  let i = a1;
  let j = a2;
  let tert = 0;
  while (i < b1 && j < b2) {
    const c1 = csCodePoint(s, i, b1);
    const c2 = csCodePoint(s2, j, b2);
    const w1 = cswCollationWeight(c1);
    const w2 = cswCollationWeight(c2);
    if (w1 !== w2) {
      return w1 < w2 ? -1 : 1;
    }
    if (tert === 0 && c1 !== c2) {
      // same letter, different case: lowercase first
      tert = c1 > c2 ? -1 : 1;
    }
    i += csCpLen(toI32(s[i]));
    j += csCpLen(toI32(s2[j]));
  }
  if (i < b1) {
    return 1;
  }
  if (j < b2) {
    return -1;
  }
  return ignoreCase ? 0 : tert;
};

/** UsingDirectives.DefaultOrder.Compare. */
const cswUsingCompare = (P: CsPrint, x: i32, y: i32): i32 => {
  const xn = cswUsingName(P, x);
  const yn = cswUsingName(P, y);
  if (xn < 0 && yn >= 0) {
    return -1;
  }
  if (yn < 0 && xn >= 0) {
    return 1;
  }
  const xa = P.s(x, F_UsingDirective_Alias);
  const ya = P.s(y, F_UsingDirective_Alias);
  if (xa >= 0 && ya >= 0) {
    return cswCompareTrimmed(P, xa, ya);
  }
  if (xn < 0 && yn < 0) {
    return 0;
  }
  return cswCompareTrimmed(P, xn, yn);
};

const cswCompareTrimmed = (P: CsPrint, x: i32, y: i32): i32 => {
  const dx = cswTrimmedSrc(P, P.t.fullStart(x), P.t.fullEnd(x));
  const dy = cswTrimmedSrc(P, P.t.fullStart(y), P.t.fullEnd(y));
  const D = P.D;
  return cswCultureCompare(P.src, D.a[dx], D.b[dx], P.src, D.a[dy], D.b[dy], true);
};

/** UsingDirective.Name: its NamespaceOrType when that is a name, else -1. */
const cswUsingName = (P: CsPrint, u: i32): i32 => {
  const n = P.s(u, F_UsingDirective_NamespaceOrType);
  return P.is(n, Y_Name) ? n : -1;
};

const cswIsSystemName = (P: CsPrint, n0: i32): boolean => {
  let n = n0;
  while (P.k(n) === K_QualifiedName) {
    n = P.s(n, F_QualifiedName_Left);
  }
  return P.k(n) === K_IdentifierName && P.t.tokIs(P.s(n, F_IdentifierName_Identifier), "System");
};

class CsUsingData {
  lead: i32;
  using: i32;
  shouldFormat: boolean;
  constructor(lead: i32, using: i32, shouldFormat: boolean) {
    this.lead = lead;
    this.using = using;
    this.shouldFormat = shouldFormat;
  }
}

class CsUsingGroups {
  isFirst: boolean = true;
  la: i32; // the trivia on the first using
  lb: i32;
  constructor(la: i32, lb: i32) {
    this.la = la;
    this.lb = lb;
  }
}

const cswUsingLead = (P: CsPrint, g: CsUsingGroups, u: i32): i32 => {
  const r = g.isFirst ? cswLeadingTrivia(P, g.la, g.lb, false, false) : cswLeadingTrivia(P, cswLeadA(P, u), cswLeadB(P, u), false, false);
  g.isFirst = false;
  return r;
};

const cswSortUsings = (P: CsPrint, xs: CsUsingData[]): void => {
  const n = toI32(xs.length);
  for (let i = 1; i < n; i++) {
    const v = xs[i];
    let j = i - 1;
    while (j >= 0 && cswUsingCompare(P, xs[j].using, v.using) > 0) {
      xs[j + 1] = xs[j];
      j--;
    }
    xs[j + 1] = v;
  }
};

/** UsingDirectives.PrintWithSorting. */
export const cswUsingsWithSorting = (P: CsPrint, usings: i32, printExtraLines: boolean): i32 => {
  const D = P.D;
  const lx = P.lx;
  const n = P.count(usings);
  if (n === 0) {
    return DOC_NULL;
  }
  const docs: i32[] = [];
  const u0 = P.at(usings, 0);
  const la = cswLeadA(P, u0);
  const lb = cswLeadB(P, u0);
  // initialComments = [la, icEnd), triviaWithinIf = [ifStart, ifEnd)
  let icEnd = la;
  let ifStart = lb;
  let ifEnd = lb;
  let foundIf = false;
  let keepUntilEndIf = false;
  let broke = false;
  for (let i = la; i < lb; i++) {
    const k = lx.trKind[i];
    if (k === K_DisabledTextTrivia && cswDisabledStartsWithExternAlias(P, i)) {
      icEnd = lb;
      ifStart = lb;
      ifEnd = lb;
      keepUntilEndIf = true;
      broke = true;
      break;
    }
    if (k === K_DefineDirectiveTrivia || k === K_UndefDirectiveTrivia) {
      icEnd = lb;
      ifStart = lb;
      ifEnd = lb;
      broke = true;
      break;
    }
    if (k === K_IfDirectiveTrivia && !foundIf) {
      foundIf = true;
      ifStart = i;
    }
    if (!foundIf) {
      icEnd = i + 1;
    }
  }
  if (!broke && foundIf) {
    ifEnd = lb;
  }
  if (!foundIf && !broke) {
    ifStart = lb;
    ifEnd = lb;
  }
  if (cswHasIgnoreComment(P, la, lb, IGN_START)) {
    icEnd = la;
  }
  docs.push(cswLeadingTrivia(P, la, icEnd, false, false));
  let startIndex = 0;
  if (keepUntilEndIf) {
    while (startIndex < n) {
      const u = P.at(usings, startIndex);
      startIndex++;
      if (u !== u0) {
        docs.push(cswLeadingTrivia(P, cswLeadA(P, u), cswLeadB(P, u), false, false));
      }
      docs.push(cswUsingDirective(P, u, true));
      if (cswAnyKind(lx, cswLeadA(P, u), cswLeadB(P, u), K_EndIfDirectiveTrivia)) {
        break;
      }
    }
  }
  // GroupUsings
  const groups: CsUsingData[][] = [[], [], [], [], [], [], [], [], [], []];
  const DIRECTIVE_GROUP = 9;
  const g = new CsUsingGroups(ifStart, ifEnd);
  let ifCount = 0;
  let shouldFormat = true;
  for (let i = startIndex; i < n; i++) {
    const u = P.at(usings, i);
    let openIfOrIgnore = ifCount > 0;
    const ua = cswLeadA(P, u);
    const ub = cswLeadB(P, u);
    if (cswHasIgnoreComment(P, ua, ub, IGN_END)) {
      openIfOrIgnore = true;
      shouldFormat = true;
    } else if (cswHasIgnoreComment(P, ua, ub, IGN_START)) {
      shouldFormat = false;
    }
    for (let ti = ua; ti < ub; ti++) {
      const k = lx.trKind[ti];
      if (k === K_IfDirectiveTrivia) {
        ifCount++;
      } else if (k === K_EndIfDirectiveTrivia) {
        ifCount--;
      }
    }
    if (ifCount > 0) {
      groups[DIRECTIVE_GROUP].push(new CsUsingData(cswUsingLead(P, g, u), u, shouldFormat));
      continue;
    }
    if (openIfOrIgnore) {
      groups[DIRECTIVE_GROUP].push(new CsUsingData(cswUsingLead(P, g, u), -1, shouldFormat));
    }
    const data = new CsUsingData(!openIfOrIgnore ? cswUsingLead(P, g, u) : DOC_NULL, u, shouldFormat);
    const name = cswUsingName(P, u);
    const hasAlias = P.s(u, F_UsingDirective_Alias) >= 0;
    if (!shouldFormat) {
      groups[DIRECTIVE_GROUP].push(data);
    } else if (P.s(u, F_UsingDirective_GlobalKeyword) >= 0) {
      if (hasAlias) {
        groups[2].push(data);
      } else if (name >= 0 && cswIsSystemName(P, name)) {
        groups[0].push(data);
      } else {
        groups[1].push(data);
      }
    } else if (P.s(u, F_UsingDirective_StaticKeyword) >= 0) {
      if (name >= 0 && cswIsSystemName(P, name)) {
        groups[6].push(data);
      } else {
        groups[7].push(data);
      }
    } else if (hasAlias) {
      groups[8].push(data);
    } else if (P.k(name) === K_AliasQualifiedName && name >= 0) {
      groups[4].push(data);
    } else if (name >= 0 && cswIsSystemName(P, name)) {
      groups[3].push(data);
    } else {
      groups[5].push(data);
    }
  }
  for (let gi = 0; gi < 9; gi++) {
    cswSortUsings(P, groups[gi]);
  }
  let isFirst = true;
  let prevShouldFormat = true;
  let index = 0;
  let reordered = false;
  for (let gi = 0; gi < 10; gi++) {
    const grp = groups[gi];
    for (let j = 0; j < toI32(grp.length); j++) {
      const ud = grp[j];
      if (!isFirst) {
        if (ud.shouldFormat || prevShouldFormat) {
          docs.push(DOC_HARDLINE);
        }
      }
      prevShouldFormat = ud.shouldFormat;
      if (ud.lead !== DOC_NULL && ud.shouldFormat) {
        docs.push(ud.lead);
      }
      if (ud.using >= 0) {
        if (index >= n || ud.using !== P.at(usings, index)) {
          reordered = true;
        }
        index++;
        if (ud.shouldFormat) {
          docs.push(cswUsingDirective(P, ud.using, printExtraLines));
        } else {
          const buf = new CsBuf(128);
          cswAppendNodeUnformatted(P, buf, ud.using);
          const o = D.appendBytes(buf.buf, 0, buf.n);
          docs.push(D.strAt(o, o + buf.n, false));
        }
      }
      isFirst = false;
    }
  }
  if (reordered) {
    let hasEndIf = false;
    for (let i = 0; i < n && !hasEndIf; i++) {
      const u = P.at(usings, i);
      hasEndIf = cswSrcContains(P, P.t.fullStart(u), P.t.fullEnd(u), "#endif");
    }
    const up = P.par(u0);
    if (hasEndIf || (P.k(up) === K_NamespaceDeclaration && cswLeadContains(P, up, "#if"))) {
      P.reorderedUsings = true;
    }
  }
  return D.concat(docs);
};

const cswLeadContains = (P: CsPrint, n: i32, w: string): boolean => {
  const la = cswLeadA(P, n);
  const lb = cswLeadB(P, n);
  if (lb <= la) {
    return false;
  }
  return cswSrcContains(P, P.lx.trStart[la], P.lx.trEnd[lb - 1], w);
};

export const cswSrcContains = (P: CsPrint, a: i32, b: i32, w: string): boolean => {
  const m = toI32(w.length);
  for (let i = a; i + m <= b; i++) {
    let ok = true;
    for (let j = 0; j < m; j++) {
      if (toI32(P.src[i + j]) !== w.charCodeAt(j)) {
        ok = false;
        break;
      }
    }
    if (ok) {
      return true;
    }
  }
  return false;
};

const cswDisabledStartsWithExternAlias = (P: CsPrint, i: i32): boolean => {
  const lx = P.lx;
  let a = lx.trStart[i];
  const b = lx.trEnd[i];
  while (a < b && csIsTrimByteAt(P.src, a, b)) {
    a += csCpLen(toI32(P.src[a]));
  }
  const w = "extern alias";
  if (b - a < toI32(w.length)) {
    return false;
  }
  for (let j = 0; j < toI32(w.length); j++) {
    if (toI32(P.src[a + j]) !== w.charCodeAt(j)) {
      return false;
    }
  }
  return true;
};

// ---- separated list items ----

export const SL_NODE: i32 = 0;
export const SL_ARGUMENT: i32 = 1;
export const SL_PARAMETER: i32 = 2;
export const SL_TYPE_PARAMETER: i32 = 3;
export const SL_VARIABLE: i32 = 4;
export const SL_ATTRIBUTE: i32 = 5;
export const SL_ATTRIBUTE_ARG: i32 = 6;
export const SL_ANON_MEMBER: i32 = 7;
export const SL_ARM: i32 = 8;
export const SL_POS_SUBPATTERN: i32 = 9;
export const SL_PROP_SUBPATTERN: i32 = 10;
export const SL_FNPTR_PARAM: i32 = 11;
export const SL_CALLING_CONVENTION: i32 = 12;
export const SL_ORDERING: i32 = 13;

const cswSlItem = (P: CsPrint, item: i32, n: i32): i32 => {
  switch (item) {
    case SL_NODE:
      return cswNode(P, n);
    case SL_ARGUMENT:
      return cswArgument(P, n);
    case SL_PARAMETER:
      return cswParameter(P, n);
    case SL_TYPE_PARAMETER:
      return cswTypeParameter(P, n);
    case SL_VARIABLE:
      return cswVariableDeclarator(P, n);
    default:
      return cswSlItemMore(P, item, n);
  }
};
