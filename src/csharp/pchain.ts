// CSharpier's member chain printer: InvocationExpression.PrintMemberChain,
// based on Prettier's member-chain.js.
//
// Ported from CSharpier 1.4.0 (MIT License, Copyright (c) 2021 Bela
// VanderVoort), CSharp/SyntaxPrinter/SyntaxNodePrinters/InvocationExpression.cs.

import {
  F_ConditionalAccessExpression_Expression,
  F_ConditionalAccessExpression_OperatorToken,
  F_ConditionalAccessExpression_WhenNotNull,
  F_ElementAccessExpression_ArgumentList,
  F_ElementAccessExpression_Expression,
  F_ExpressionStatement_SemicolonToken,
  F_IdentifierName_Identifier,
  F_InterpolatedStringExpression_StringStartToken,
  F_InvocationExpression_ArgumentList,
  F_InvocationExpression_Expression,
  F_LiteralExpression_Token,
  F_MemberAccessExpression_Expression,
  F_MemberAccessExpression_Name,
  F_MemberAccessExpression_OperatorToken,
  F_ObjectCreationExpression_Initializer,
  F_ParenthesizedExpression_Expression,
  F_PostfixUnaryExpression_Operand,
  F_PostfixUnaryExpression_OperatorToken,
  K_Argument,
  K_ArrayCreationExpression,
  K_BaseExpression,
  K_ConditionalAccessExpression,
  K_ElementAccessExpression,
  K_ExpressionStatement,
  K_IdentifierName,
  K_InterpolatedMultiLineRawStringStartToken,
  K_InvocationExpression,
  K_MemberBindingExpression,
  K_MultiLineRawStringLiteralToken,
  K_ObjectCreationExpression,
  K_ParenthesizedExpression,
  K_PredefinedType,
  K_QueryExpression,
  K_SwitchExpression,
  K_ThisExpression,
  Y_BinaryExpression,
  Y_InterpolatedStringExpression,
  Y_LiteralExpression,
  Y_MemberAccessExpression,
  Y_PostfixUnaryExpression,
  Y_SimpleLambdaExpression,
} from "./kinds";
import { DOC_HARDLINE, DOC_NULL, D_GROUP, D_INDENT, csdContainsBreak } from "./doc";
import { CsPrint, cswAnyComment, cswTok } from "./print";
import { cswDocA, cswDocKind, cswNode, cswTokEnd, cswTokL0, cswTokL1, cswTokStart } from "./pnodes";
import { cswArgumentList, cswIdentLen } from "./pexprs";
import { add32, sub32 } from "../core/arr";
import { fault } from "../core/fault";

class CsChain {
  nodes: i32[];
  docs: i32[];
  gs: i32[]; // group starts in nodes
  ge: i32[]; // group ends
  constructor() {
    this.nodes = [];
    this.docs = [];
    this.gs = [];
    this.ge = [];
  }
  add(n: i32, d: i32): void {
    this.nodes.push(n);
    this.docs.push(d);
  }
  ng(): i32 {
    return toI32(this.gs.length);
  }
  // A group's bounds are indices into nodes, so the arithmetic below fits
  // and the fault branches are never taken.
  gcount(g: i32): i32 {
    const ge = this.ge;
    const gs = this.gs;
    if (g >= 0 && g < ge.length && g < gs.length) {
      return sub32(ge[g], gs[g]);
    }
    fault();
    return 0;
  }
  /** The node of item i of group g. */
  gn(g: i32, i: i32): i32 {
    const gs = this.gs;
    if (g < 0 || g >= gs.length) {
      fault();
      return -1;
    }
    const j = add32(gs[g], i);
    const nodes = this.nodes;
    if (j >= 0 && j < nodes.length) {
      return nodes[j];
    }
    fault();
    return -1;
  }
  glast(g: i32): i32 {
    const ge = this.ge;
    if (g >= 0 && g < ge.length) {
      return sub32(ge[g], 1);
    }
    fault();
    return 0;
  }
  addGroup(s: i32, e: i32): void {
    this.gs.push(s);
    this.ge.push(e);
  }
}

const cswFlatten = (P: CsPrint, e: i32, c: CsChain): void => {
  const D = P.D;
  const k = P.k(e);
  if (k === K_InvocationExpression) {
    cswFlatten(P, P.s(e, F_InvocationExpression_Expression), c);
    c.add(e, cswArgumentList(P, P.s(e, F_InvocationExpression_ArgumentList)));
  } else if (k === K_ElementAccessExpression) {
    cswFlatten(P, P.s(e, F_ElementAccessExpression_Expression), c);
    c.add(e, cswNode(P, P.s(e, F_ElementAccessExpression_ArgumentList)));
  } else if (P.is(e, Y_MemberAccessExpression)) {
    cswFlatten(P, P.s(e, F_MemberAccessExpression_Expression), c);
    c.add(
      e,
      D.concat([
        cswTok(P, P.s(e, F_MemberAccessExpression_OperatorToken)),
        cswNode(P, P.s(e, F_MemberAccessExpression_Name)),
      ]),
    );
  } else if (k === K_ConditionalAccessExpression) {
    cswFlatten(P, P.s(e, F_ConditionalAccessExpression_Expression), c);
    c.add(e, cswTok(P, P.s(e, F_ConditionalAccessExpression_OperatorToken)));
    cswFlatten(P, P.s(e, F_ConditionalAccessExpression_WhenNotNull), c);
  } else if (
    P.is(e, Y_PostfixUnaryExpression) &&
    (P.k(P.s(e, F_PostfixUnaryExpression_Operand)) === K_InvocationExpression ||
      P.is(P.s(e, F_PostfixUnaryExpression_Operand), Y_MemberAccessExpression))
  ) {
    cswFlatten(P, P.s(e, F_PostfixUnaryExpression_Operand), c);
    c.add(e, cswTok(P, P.s(e, F_PostfixUnaryExpression_OperatorToken)));
  } else {
    c.add(e, cswNode(P, e));
  }
};

const cswGroupOnLines = (P: CsPrint, c: CsChain): void => {
  const nodes = c.nodes;
  const n = toI32(nodes.length);
  let s = 0;
  for (let i = 1; i < n; i++) {
    if (i >= nodes.length) {
      fault();
      return;
    }
    const node = nodes[i];
    const prevNode = nodes[i - 1];
    const k = P.k(node);
    if (k === K_ConditionalAccessExpression) {
      c.addGroup(s, i);
      s = i;
    } else if (
      (P.is(node, Y_MemberAccessExpression) || k === K_MemberBindingExpression || k === K_IdentifierName) &&
      P.k(prevNode) !== K_ConditionalAccessExpression
    ) {
      c.addGroup(s, i);
      s = i;
    }
  }
  c.addGroup(s, n);
};

const cswGroupPrettierStyle = (P: CsPrint, c: CsChain): void => {
  const n = toI32(c.nodes.length);
  let index = 1;
  while (index < n && P.k(c.nodes[index]) === K_InvocationExpression) {
    index++;
  }
  const nodes = c.nodes;
  // a chain has at least its innermost expression
  if (nodes.length < 1) {
    fault();
    return;
  }
  const node0 = nodes[0];
  const k0 = P.k(node0);
  if (k0 !== K_InvocationExpression && !P.is(node0, Y_PostfixUnaryExpression) && index < n) {
    const ki = c.nodes[index];
    if (P.k(ki) === K_ElementAccessExpression || P.is(ki, Y_PostfixUnaryExpression)) {
      index++;
    }
  }
  c.addGroup(0, index);
  let s = index;
  let seen = false;
  for (; index < n; index++) {
    if (index < 0 || index >= nodes.length) {
      fault();
      return;
    }
    const node = nodes[index];
    if (seen && (P.is(node, Y_MemberAccessExpression) || P.k(node) === K_ConditionalAccessExpression)) {
      c.addGroup(s, index);
      s = index;
      seen = false;
    }
    if (P.k(node) === K_InvocationExpression || P.k(node) === K_ElementAccessExpression) {
      seen = true;
    }
  }
  if (index > s) {
    c.addGroup(s, index);
  }
};

const cswGroupDocs = (c: CsChain, g: i32): i32[] => {
  const out: i32[] = [];
  const gs = c.gs;
  const ge = c.ge;
  const docs = c.docs;
  if (g < 0 || g >= gs.length || g >= ge.length) {
    fault();
    return out;
  }
  const a = gs[g];
  const b = ge[g];
  for (let i = a; i < b; i++) {
    if (i < 0 || i >= docs.length) {
      fault();
      return out;
    }
    out.push(docs[i]);
  }
  return out;
};

const cswShouldMergeFirstTwo = (P: CsPrint, c: CsChain, parent: i32): boolean => {
  if (c.ng() < 2 || c.gcount(0) !== 1) {
    return false;
  }
  const first = c.gn(0, 0);
  const fk = P.k(first);
  if (
    !(
      (fk === K_IdentifierName && cswIdentLen(P, first) <= 4) ||
      fk === K_ThisExpression ||
      fk === K_PredefinedType ||
      fk === K_BaseExpression
    )
  ) {
    return false;
  }
  if (c.gcount(1) === 1) {
    return true;
  }
  if (
    P.is(parent, Y_SimpleLambdaExpression) ||
    P.k(parent) === K_Argument ||
    P.is(parent, Y_BinaryExpression) ||
    P.k(parent) === K_ExpressionStatement
  ) {
    return true;
  }
  const n11 = c.gn(1, 1);
  return (
    P.k(n11) === K_InvocationExpression || P.k(n11) === K_ElementAccessExpression || P.is(n11, Y_PostfixUnaryExpression)
  );
};

const cswIsMemberName = (P: CsPrint, n: i32, w: string): boolean => {
  if (!P.is(n, Y_MemberAccessExpression)) {
    return false;
  }
  const name = P.s(n, F_MemberAccessExpression_Name);
  return P.k(name) === K_IdentifierName && P.t.tokIs(P.s(name, F_IdentifierName_Identifier), w);
};

class CsIndex {
  i: i32 = 0;
  constructor() {}
}

const cswPossibleContents = (P: CsPrint, c: CsChain, idx: CsIndex): i32 => {
  const D = P.D;
  if (idx.i >= c.ng()) {
    return DOC_NULL;
  }
  const g = idx.i;
  if (!cswIsMemberName(P, c.gn(g, 0), "ThenInclude")) {
    return DOC_NULL;
  }
  // a group index, below the number of groups
  if (g >= 2147483647) {
    fault();
    return DOC_NULL;
  }
  idx.i = g + 1;
  const grp = D.group(cswGroupDocs(c, g));
  return D.indent([DOC_HARDLINE, grp, cswPossibleContents(P, c, idx)]);
};

const cswIndentedGroup = (P: CsPrint, c: CsChain, from: i32): i32 => {
  const D = P.D;
  if (from >= c.ng()) {
    return DOC_NULL;
  }
  const result: i32[] = [];
  const idx = new CsIndex();
  idx.i = from;
  while (idx.i < c.ng()) {
    const pc = cswPossibleContents(P, c, idx);
    if (pc !== DOC_NULL) {
      // cswPossibleContents moved past at least one group from `from` >= 1
      const j = idx.i;
      if (j <= 0) {
        fault();
        break;
      }
      idx.i = j - 1;
      result.push(pc);
    } else {
      result.push(DOC_HARDLINE);
      result.push(D.group(cswGroupDocs(c, idx.i)));
    }
    // a group index, below the number of groups
    const j2 = idx.i;
    if (j2 >= 2147483647) {
      fault();
      break;
    }
    idx.i = j2 + 1;
  }
  return D.indent1(D.group(result));
};

const cswIsMultiLineLiteral = (P: CsPrint, n: i32): boolean => {
  if (P.is(n, Y_LiteralExpression)) {
    const t = P.s(n, F_LiteralExpression_Token);
    if (P.tk(t) === K_MultiLineRawStringLiteralToken) {
      return true;
    }
    const a = cswTokStart(P.lx, t);
    const b = cswTokEnd(P.lx, t);
    const src = P.src;
    if (a < b && (a < 0 || b > src.length)) {
      fault();
      return false;
    }
    for (let i = a; i >= 0 && i < b && i < src.length; i++) {
      if (toI32(src[i]) === 10) {
        return true;
      }
    }
    return false;
  }
  return (
    P.is(n, Y_InterpolatedStringExpression) &&
    P.tk(P.s(n, F_InterpolatedStringExpression_StringStartToken)) === K_InterpolatedMultiLineRawStringStartToken
  );
};

const cswHasAncestorType = (P: CsPrint, n: i32, y: i32): boolean => {
  let p = P.par(n);
  while (p >= 0) {
    if (P.t.ty(p) === y) {
      return true;
    }
    p = P.par(p);
  }
  return false;
};

export const cswMemberChain = (P: CsPrint, n: i32): i32 => {
  const D = P.D;
  const parent = P.par(n);
  const c = new CsChain();
  cswFlatten(P, n, c);
  let anyInvocation = false;
  for (let i = 0; i < toI32(c.nodes.length); i++) {
    if (P.k(c.nodes[i]) === K_InvocationExpression) {
      anyInvocation = true;
    }
  }
  if (anyInvocation) {
    cswGroupPrettierStyle(P, c);
  } else {
    cswGroupOnLines(P, c);
  }
  const oneLine = c.docs;
  const merge = cswShouldMergeFirstTwo(P, c, parent);
  const cutoff = merge ? 3 : 2;
  const ng = c.ng();
  let forceOneLine = false;
  // the grouping made at least one group
  if (ng < 1) {
    fault();
    return DOC_NULL;
  }
  if (ng <= cutoff) {
    for (let g = merge ? 1 : 0; g < ng; g++) {
      const gl = c.glast(g);
      const nodes = c.nodes;
      if (gl < 0 || gl >= nodes.length) {
        fault();
        return DOC_NULL;
      }
      const last = nodes[gl];
      const lk = P.k(last);
      const ok =
        lk === K_InvocationExpression ||
        lk === K_ElementAccessExpression ||
        (P.is(last, Y_PostfixUnaryExpression) &&
          P.k(P.s(last, F_PostfixUnaryExpression_Operand)) === K_InvocationExpression);
      if (!ok) {
        forceOneLine = true;
      }
    }
    if (!forceOneLine && c.gcount(ng - 1) === 1 && P.is(c.gn(ng - 1, 0), Y_PostfixUnaryExpression)) {
      forceOneLine = true;
    }
  }
  if (!forceOneLine && cswHasAncestorType(P, n, Y_InterpolatedStringExpression)) {
    forceOneLine = true;
  }
  if (!forceOneLine) {
    for (let i = 0; i < c.gcount(0); i++) {
      if (cswIsMultiLineLiteral(P, c.gn(0, i))) {
        forceOneLine = true;
      }
    }
  }
  if (forceOneLine) {
    return D.group(oneLine);
  }
  let mergedDoc = DOC_NULL;
  if (merge) {
    const gl = c.glast(1);
    const docs = c.docs;
    if (gl < 0 || gl >= docs.length) {
      fault();
      return DOC_NULL;
    }
    const lastDoc = docs[gl];
    const isGroupOfIndent = cswDocKind(D, lastDoc) === D_GROUP && cswDocKind(D, cswDocA(D, lastDoc)) === D_INDENT;
    mergedDoc = D.indentIf(ng > 2 && !isGroupOfIndent, D.concat(cswGroupDocs(c, 1)));
  }
  const expanded = D.concat([D.concat(cswGroupDocs(c, 0)), mergedDoc, cswIndentedGroup(P, c, merge ? 2 : 1)]);
  let useExpanded = ng === 1;
  for (let i = 1; i < toI32(oneLine.length) && !useExpanded; i++) {
    if (csdContainsBreak(D, oneLine[i])) {
      useExpanded = true;
    }
  }
  if (!useExpanded) {
    for (let i = 0; i < c.gcount(0); i++) {
      const g0 = c.gn(0, i);
      if (
        P.k(g0) === K_ArrayCreationExpression ||
        (P.k(g0) === K_ObjectCreationExpression && P.s(g0, F_ObjectCreationExpression_Initializer) >= 0)
      ) {
        useExpanded = true;
      }
    }
  }
  if (!useExpanded) {
    const f = c.gn(0, 0);
    if (P.k(f) === K_ParenthesizedExpression) {
      const fe = P.s(f, F_ParenthesizedExpression_Expression);
      if (P.k(fe) === K_SwitchExpression || P.k(fe) === K_QueryExpression) {
        useExpanded = true;
      }
    }
  }
  if (!useExpanded && P.k(parent) === K_ExpressionStatement) {
    const semi = P.s(parent, F_ExpressionStatement_SemicolonToken);
    if (cswAnyComment(P.lx, cswTokL0(P.lx, semi), cswTokL1(P.lx, semi))) {
      useExpanded = true;
    }
  }
  if (useExpanded) {
    return expanded;
  }
  return D.conditionalGroup([D.concat(oneLine), expanded]);
};
