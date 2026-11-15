// Parser::Builders::Default as RuboCop configures it (RuboCop::AST::Builder:
// emit_forward_arg and emit_match_pattern on, the other "modern" forms off,
// __FILE__ and __LINE__ as literals): the node and source map each grammar
// rule makes. Tokens, nodes and lists are handles of an RbAst.
//
// Ported from the parser gem 3.3.13.0 (MIT License, Copyright (c) 2013-2024
// parser contributors).

import {
  F_ASSIGNMENT,
  F_ASSOC,
  F_BEGIN,
  F_COLON,
  F_DOT,
  F_DOUBLE_COLON,
  F_ELSE,
  F_END,
  F_EXPRESSION,
  F_HEREDOC_BODY,
  F_HEREDOC_END,
  F_IN,
  F_KEYWORD,
  F_NAME,
  F_OPERATOR,
  F_QUESTION,
  F_SELECTOR,
  M_COLLECTION,
  M_CONDITION,
  M_CONSTANT,
  M_DEFINITION,
  M_FOR,
  M_HEREDOC,
  M_KEYWORD,
  M_MAP,
  M_METHOD_DEFINITION,
  M_OPERATOR,
  M_RESCUE_BODY,
  M_SEND,
  M_TERNARY,
  M_VARIABLE,
  NT_ALIAS,
  NT_AND,
  NT_AND_ASGN,
  NT_ARG,
  NT_ARG_EXPR,
  NT_ARGS,
  NT_ARRAY,
  NT_ARRAY_PATTERN,
  NT_ARRAY_PATTERN_WITH_TAIL,
  NT_BACK_REF,
  NT_BEGIN,
  NT_BLOCK,
  NT_BLOCK_PASS,
  NT_BLOCKARG,
  NT_BLOCKARG_EXPR,
  NT_CASE,
  NT_CASE_MATCH,
  NT_CASGN,
  NT_CBASE,
  NT_CLASS,
  NT_COMPLEX,
  NT_CONST,
  NT_CONST_PATTERN,
  NT_CSEND,
  NT_CVAR,
  NT_CVASGN,
  NT_DEF,
  NT_DEFS,
  NT_DSTR,
  NT_DSYM,
  NT_EFLIPFLOP,
  NT_EMPTY_ELSE,
  NT_ENSURE,
  NT_ERANGE,
  NT_FALSE,
  NT_FIND_PATTERN,
  NT_FLOAT,
  NT_FOR,
  NT_FORWARD_ARG,
  NT_FORWARDED_ARGS,
  NT_FORWARDED_KWRESTARG,
  NT_FORWARDED_RESTARG,
  NT_GVAR,
  NT_GVASGN,
  NT_HASH,
  NT_HASH_PATTERN,
  NT_IDENT,
  NT_IF,
  NT_IF_GUARD,
  NT_IFLIPFLOP,
  NT_IN_MATCH,
  NT_IN_PATTERN,
  NT_INDEX,
  NT_INT,
  NT_IRANGE,
  NT_IVAR,
  NT_IVASGN,
  NT_KWARG,
  NT_KWBEGIN,
  NT_KWNILARG,
  NT_KWOPTARG,
  NT_KWRESTARG,
  NT_KWSPLAT,
  NT_LVAR,
  NT_LVASGN,
  NT_MASGN,
  NT_MATCH_ALT,
  NT_MATCH_AS,
  NT_MATCH_CURRENT_LINE,
  NT_MATCH_NIL_PATTERN,
  NT_MATCH_PATTERN,
  NT_MATCH_PATTERN_P,
  NT_MATCH_REST,
  NT_MATCH_VAR,
  NT_MATCH_WITH_LVASGN,
  NT_MATCH_WITH_TRAILING_COMMA,
  NT_MLHS,
  NT_MODULE,
  NT_NIL,
  NT_NTH_REF,
  NT_NUMARGS,
  NT_NUMBLOCK,
  NT_OP_ASGN,
  NT_OPTARG,
  NT_OR,
  NT_OR_ASGN,
  NT_PAIR,
  NT_PIN,
  NT_POSTEXE,
  NT_PREEXE,
  NT_PROCARG0,
  NT_RATIONAL,
  NT_REGEXP,
  NT_REGOPT,
  NT_RESBODY,
  NT_RESCUE,
  NT_RESTARG,
  NT_RESTARG_EXPR,
  NT_SCLASS,
  NT_SELF,
  NT_SEND,
  NT_SHADOWARG,
  NT_SPLAT,
  NT_STR,
  NT_SUPER,
  NT_SYM,
  NT_TRUE,
  NT_UNDEF,
  NT_UNLESS_GUARD,
  NT_WHEN,
  NT_XSTR,
  NT_YIELD,
  NT_ZSUPER,
  NT_LAMBDA,
  NT___ENCODING__,
  NT___FILE__,
  NT___LINE__,
  RbAst,
  VT_COMPLEX,
  VT_FLOAT,
  VT_INT,
  VT_RATIONAL,

  VT_SYM,
  V_NIL,
  vIdx,

  vTag,
  rbFloatInspect,
} from "./ast";
import { RbContext, RbStaticEnv } from "./env";

/** What the builder reads of the parser: the stacks and flags the grammar keeps. */
export class RbParseState {
  env: RbStaticEnv;
  ctx: RbContext;
  failed: boolean = false;
  // MaxNumparamStack: value and static flag per scope.
  npValue: i32[];
  npStatic: boolean[];
  // CurrentArgStack ("" is nil).
  currentArg: string[];
  // VariablesStack for pattern variables and pattern hash keys.
  patternVars: string[][];
  patternKeys: string[][];
  path: string = "";
  // Line starts (code point offsets) for __LINE__.
  lineStarts: i32[];

  constructor(env: RbStaticEnv, ctx: RbContext) {
    this.env = env;
    this.ctx = ctx;
    this.npValue = [];
    this.npStatic = [];
    this.currentArg = [];
    this.patternVars = [[]];
    this.patternKeys = [[]];
    this.lineStarts = [];
    this.lineAt = [];
  }

  error(): void {
    this.failed = true;
  }

  // MaxNumparamStack.
  npPush(isStatic: boolean): void {
    this.npValue.push(0);
    this.npStatic.push(isStatic);
  }

  npPop(): i32 {
    const k = toI32(this.npValue.length);
    if (k === 0) {
      return 0;
    }
    const v = this.npValue[k - 1];
    this.npValue.pop();
    this.npStatic.pop();
    return v;
  }

  npTop(): i32 {
    const k = toI32(this.npValue.length);
    return k > 0 ? this.npValue[k - 1] : 0;
  }

  npSet(v: i32): void {
    const k = toI32(this.npValue.length);
    if (k > 0) {
      this.npValue[k - 1] = v;
    }
  }

  hasOrdinaryParams(): boolean {
    return this.npTop() === -1;
  }

  setOrdinaryParams(): void {
    this.npSet(-1);
  }

  hasNumparams(): boolean {
    return this.npValue.length > 0 && this.npTop() > 0;
  }

  npRegister(v: i32): void {
    const t = this.npTop();
    this.npSet(t > v ? t : v);
  }

  // CurrentArgStack.
  argPush(v: string): void {
    this.currentArg.push(v);
  }

  argSet(v: string): void {
    const k = toI32(this.currentArg.length);
    if (k > 0) {
      this.currentArg[k - 1] = v;
    }
  }

  argPop(): void {
    if (this.currentArg.length > 0) {
      this.currentArg.pop();
    }
  }

  argTop(): string {
    const k = toI32(this.currentArg.length);
    return k > 0 ? this.currentArg[k - 1] : "";
  }

  // VariablesStack.
  varsPush(keys: boolean): void {
    const l: string[] = [];
    if (keys) {
      this.patternKeys.push(l);
    } else {
      this.patternVars.push(l);
    }
  }

  varsPop(keys: boolean): void {
    if (keys) {
      if (this.patternKeys.length > 0) {
        this.patternKeys.pop();
      }
    } else if (this.patternVars.length > 0) {
      this.patternVars.pop();
    }
  }

  varsDeclared(keys: boolean, name: string): boolean {
    const s = keys ? this.patternKeys : this.patternVars;
    if (s.length === 0) {
      return false;
    }
    for (const v of s[s.length - 1]) {
      if (v === name) {
        return true;
      }
    }
    return false;
  }

  varsDeclare(keys: boolean, name: string): void {
    if (keys) {
      const k = toI32(this.patternKeys.length);
      if (k > 0) {
        this.patternKeys[k - 1].push(name);
      }
    } else {
      const k = toI32(this.patternVars.length);
      if (k > 0) {
        this.patternVars[k - 1].push(name);
      }
    }
  }

  // The line of every code point offset (0..n), filled by fillLines.
  lineAt: i32[];

  /** Builds lineAt from lineStarts for a source of n code points. */
  fillLines(n: i32): void {
    const t: i32[] = [];
    let l = 1;
    const k = toI32(this.lineStarts.length);
    for (let i = 0; i <= n; i++) {
      while (l < k && this.lineStarts[l] <= i) {
        l++;
      }
      t.push(l);
    }
    this.lineAt = t;
  }

  /** The 1-based line of a code point offset. */
  lineOf(pos: i32): i32 {
    const k = toI32(this.lineAt.length);
    if (k > 0) {
      return pos < 0 ? 1 : pos < k ? this.lineAt[pos] : this.lineAt[k - 1];
    }
    let lo = 0;
    let hi = toI32(this.lineStarts.length) - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lineStarts[mid] <= pos) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo + 1;
  }

}

export class RbBuilder {
  a: RbAst;
  st: RbParseState;

  constructor(a: RbAst, st: RbParseState) {
    this.a = a;
    this.st = st;
  }

  // ---- Helpers ------------------------------------------------------------------

  diag(): void {
    this.st.error();
  }

  value(t: i32): string {
    return this.a.tokValue(t);
  }

  n(type: i32, kids: i32, map: i32): i32 {
    return this.a.node(type, kids, map);
  }

  n0(type: i32, map: i32): i32 {
    return this.a.node(type, this.a.list(), map);
  }

  /** A map of `kind` with expression [s, e). */
  map(kind: i32, s: i32, e: i32): i32 {
    const m = this.a.newMap(kind);
    this.a.setF(m, F_EXPRESSION, s, e);
    return m;
  }

  tS(t: i32): i32 {
    return this.a.hasLoc(t) ? this.a.tokS(t) : -1;
  }

  tE(t: i32): i32 {
    return this.a.hasLoc(t) ? this.a.tokE(t) : -1;
  }

  exS(n: i32): i32 {
    return this.a.exS(n);
  }

  exE(n: i32): i32 {
    return this.a.exE(n);
  }

  tokenMap(t: i32): i32 {
    return this.map(M_MAP, this.tS(t), this.tE(t));
  }

  exprMap(s: i32, e: i32): i32 {
    return this.map(M_MAP, s, e);
  }

  delimitedStringMap(t: i32): i32 {
    const s = this.tS(t);
    const e = this.tE(t);
    const m = this.map(M_COLLECTION, s, e);
    this.a.setF(m, F_BEGIN, s, s + 1);
    this.a.setF(m, F_END, e - 1, e);
    return m;
  }

  prefixStringMap(t: i32): i32 {
    const s = this.tS(t);
    const m = this.map(M_COLLECTION, s, this.tE(t));
    this.a.setF(m, F_BEGIN, s, s + 1);
    return m;
  }

  unquotedMap(t: i32): i32 {
    return this.map(M_COLLECTION, this.tS(t), this.tE(t));
  }

  /** collection_map(begin_t, parts, end_t); parts is a list (or V_NIL). */
  collectionMap(beginT: i32, parts: i32, endT: i32): i32 {
    let s = -1;
    let e = -1;
    if (!this.a.hasLoc(beginT) || !this.a.hasLoc(endT)) {
      if (this.a.len(parts) > 0) {
        s = this.exS(this.a.at(parts, 0));
        e = this.exE(this.a.at(parts, -1));
      } else if (this.a.hasLoc(beginT)) {
        s = this.tS(beginT);
        e = this.tE(beginT);
      } else if (this.a.hasLoc(endT)) {
        s = this.tS(endT);
        e = this.tE(endT);
      }
    } else {
      s = this.tS(beginT);
      e = this.tE(endT);
    }
    const m = this.map(M_COLLECTION, s, e);
    this.a.setT(m, F_BEGIN, beginT);
    this.a.setT(m, F_END, endT);
    return m;
  }

  /** collection_map with the expression given as a range (const_pattern, symbol_compose). */
  collectionMapRange(beginT: i32, s: i32, e: i32, endT: i32): i32 {
    let es = s;
    let ee = e;
    if (this.a.hasLoc(beginT) && this.a.hasLoc(endT)) {
      es = this.tS(beginT);
      ee = this.tE(endT);
    }
    const m = this.map(M_COLLECTION, es, ee);
    this.a.setT(m, F_BEGIN, beginT);
    this.a.setT(m, F_END, endT);
    return m;
  }

  stringMap(beginT: i32, parts: i32, endT: i32): i32 {
    if (this.a.hasLoc(beginT) && this.value(beginT).startsWith("<<")) {
      let s = 0;
      let e = 0;
      if (this.a.len(parts) > 0) {
        s = this.exS(this.a.at(parts, 0));
        e = this.exE(this.a.at(parts, -1));
      } else {
        s = this.tS(endT);
        e = s;
      }
      const m = this.a.newMap(M_HEREDOC);
      this.a.setT(m, F_EXPRESSION, beginT);
      this.a.setF(m, F_HEREDOC_BODY, s, e);
      this.a.setT(m, F_HEREDOC_END, endT);
      return m;
    }
    return this.collectionMap(beginT, parts, endT);
  }

  binaryOpMap(left: i32, opT: i32, right: i32): i32 {
    const m = this.map(M_OPERATOR, this.exS(left), this.exE(right));
    this.a.setT(m, F_OPERATOR, opT);
    return m;
  }

  unaryOpMap(opT: i32, arg: i32): i32 {
    const e = arg === V_NIL ? this.tE(opT) : this.exE(arg);
    const m = this.map(M_OPERATOR, this.tS(opT), e);
    this.a.setT(m, F_OPERATOR, opT);
    return m;
  }

  rangeMap(start: i32, opT: i32, end: i32): i32 {
    let s = 0;
    let e = 0;
    if (start !== V_NIL && end !== V_NIL) {
      s = this.exS(start);
      e = this.exE(end);
    } else if (start !== V_NIL) {
      s = this.exS(start);
      e = this.tE(opT);
    } else {
      s = this.tS(opT);
      e = end !== V_NIL ? this.exE(end) : this.tE(opT);
    }
    const m = this.map(M_OPERATOR, s, e);
    this.a.setT(m, F_OPERATOR, opT);
    return m;
  }

  argPrefixMap(opT: i32, nameT: i32): i32 {
    const e = nameT === V_NIL ? this.tE(opT) : this.tE(nameT);
    const m = this.map(M_VARIABLE, this.tS(opT), e);
    this.a.setT(m, F_NAME, nameT);
    return m;
  }

  kwargMap(nameT: i32, value: i32): i32 {
    const e = value !== V_NIL ? this.exE(value) : this.tE(nameT);
    const m = this.map(M_VARIABLE, this.tS(nameT), e);
    this.a.setF(m, F_NAME, this.tS(nameT), this.tE(nameT) - 1);
    return m;
  }

  variableMap(nameT: i32): i32 {
    const m = this.map(M_VARIABLE, this.tS(nameT), this.tE(nameT));
    this.a.setT(m, F_NAME, nameT);
    return m;
  }

  constantMap(scope: i32, colon2T: i32, nameT: i32): i32 {
    const s = scope === V_NIL ? this.tS(nameT) : this.exS(scope);
    const m = this.map(M_CONSTANT, s, this.tE(nameT));
    this.a.setT(m, F_DOUBLE_COLON, colon2T);
    this.a.setT(m, F_NAME, nameT);
    return m;
  }

  moduleDefinitionMap(keywordT: i32, name: i32, operatorT: i32, endT: i32): i32 {
    const m = this.map(M_DEFINITION, this.tS(keywordT), this.tE(endT));
    this.a.setT(m, F_KEYWORD, keywordT);
    this.a.setT(m, F_OPERATOR, operatorT);
    if (name !== V_NIL) {
      this.a.setF(m, F_NAME, this.exS(name), this.exE(name));
    }
    this.a.setT(m, F_END, endT);
    return m;
  }

  definitionMap(keywordT: i32, operatorT: i32, nameT: i32, endT: i32): i32 {
    const m = this.map(M_METHOD_DEFINITION, this.tS(keywordT), this.tE(endT));
    this.a.setT(m, F_KEYWORD, keywordT);
    this.a.setT(m, F_OPERATOR, operatorT);
    this.a.setT(m, F_NAME, nameT);
    this.a.setT(m, F_END, endT);
    return m;
  }

  endlessDefinitionMap(keywordT: i32, operatorT: i32, nameT: i32, assignmentT: i32, body: i32): i32 {
    const m = this.map(M_METHOD_DEFINITION, this.tS(keywordT), this.exE(body));
    this.a.setT(m, F_KEYWORD, keywordT);
    this.a.setT(m, F_OPERATOR, operatorT);
    this.a.setT(m, F_NAME, nameT);
    this.a.setT(m, F_ASSIGNMENT, assignmentT);
    return m;
  }

  sendMap(receiver: i32, dotT: i32, selectorT: i32, beginT: i32, args: i32, endT: i32): i32 {
    let s = -1;
    let e = -1;
    if (receiver !== V_NIL) {
      s = this.exS(receiver);
    } else if (selectorT !== V_NIL) {
      s = this.tS(selectorT);
    }
    if (endT !== V_NIL) {
      e = this.tE(endT);
    } else if (this.a.len(args) > 0) {
      e = this.exE(this.a.at(args, -1));
    } else if (selectorT !== V_NIL) {
      e = this.tE(selectorT);
    }
    // begin_l.join(end_l): with one of them missing Range#join is not reached in practice.
    if (s < 0) {
      s = e;
    }
    if (e < 0) {
      e = receiver !== V_NIL ? this.exE(receiver) : s;
    }
    const m = this.map(M_SEND, s, e);
    this.a.setT(m, F_DOT, dotT);
    this.a.setT(m, F_SELECTOR, selectorT);
    this.a.setT(m, F_BEGIN, beginT);
    this.a.setT(m, F_END, endT);
    return m;
  }

  varSendMap(v: i32): i32 {
    const m = this.map(M_SEND, this.exS(v), this.exE(v));
    this.a.setF(m, F_SELECTOR, this.exS(v), this.exE(v));
    return m;
  }

  sendBinaryOpMap(lhs: i32, selT: i32, rhs: i32): i32 {
    const m = this.map(M_SEND, this.exS(lhs), this.exE(rhs));
    this.a.setT(m, F_SELECTOR, selT);
    return m;
  }

  sendUnaryOpMap(selT: i32, arg: i32): i32 {
    const e = arg === V_NIL ? this.tE(selT) : this.exE(arg);
    const m = this.map(M_SEND, this.tS(selT), e);
    this.a.setT(m, F_SELECTOR, selT);
    return m;
  }

  sendIndexMap(receiver: i32, lbrackT: i32, rbrackT: i32): i32 {
    const m = this.map(M_SEND, this.exS(receiver), this.tE(rbrackT));
    this.a.setF(m, F_SELECTOR, this.tS(lbrackT), this.tE(rbrackT));
    return m;
  }

  blockMap(receiverS: i32, beginT: i32, endT: i32): i32 {
    const m = this.map(M_COLLECTION, receiverS, this.tE(endT));
    this.a.setT(m, F_BEGIN, beginT);
    this.a.setT(m, F_END, endT);
    return m;
  }

  keywordMap(keywordT: i32, beginT: i32, args: i32, endT: i32): i32 {
    let e = 0;
    const k = this.a.len(args);
    if (endT !== V_NIL) {
      e = this.tE(endT);
    } else if (k > 0 && this.a.at(args, -1) !== V_NIL) {
      e = this.exE(this.a.at(args, -1));
    } else if (k > 1) {
      e = this.exE(this.a.at(args, -2));
    } else {
      e = this.tE(keywordT);
    }
    const m = this.map(M_KEYWORD, this.tS(keywordT), e);
    this.a.setT(m, F_KEYWORD, keywordT);
    this.a.setT(m, F_BEGIN, beginT);
    this.a.setT(m, F_END, endT);
    return m;
  }

  keywordModMap(pre: i32, keywordT: i32, post: i32): i32 {
    const m = this.map(M_KEYWORD, this.exS(pre), this.exE(post));
    this.a.setT(m, F_KEYWORD, keywordT);
    return m;
  }

  conditionMap(keywordT: i32, cond: i32, beginT: i32, body: i32, elseT: i32, elseE: i32, endT: i32): i32 {
    let e = 0;
    if (endT !== V_NIL && this.a.hasLoc(endT)) {
      e = this.tE(endT);
    } else if (elseE !== V_NIL && this.exS(elseE) >= 0) {
      e = this.exE(elseE);
    } else if (this.a.hasLoc(elseT)) {
      e = this.tE(elseT);
    } else if (body !== V_NIL && this.exS(body) >= 0) {
      e = this.exE(body);
    } else if (this.a.hasLoc(beginT)) {
      e = this.tE(beginT);
    } else {
      e = this.exE(cond);
    }
    const m = this.map(M_CONDITION, this.tS(keywordT), e);
    this.a.setT(m, F_KEYWORD, keywordT);
    this.a.setT(m, F_BEGIN, beginT);
    this.a.setT(m, F_ELSE, elseT);
    this.a.setT(m, F_END, endT);
    return m;
  }

  ternaryMap(beginE: i32, questionT: i32, colonT: i32, endE: i32): i32 {
    const m = this.map(M_TERNARY, this.exS(beginE), this.exE(endE));
    this.a.setT(m, F_QUESTION, questionT);
    this.a.setT(m, F_COLON, colonT);
    return m;
  }

  forMap(keywordT: i32, inT: i32, beginT: i32, endT: i32): i32 {
    const m = this.map(M_FOR, this.tS(keywordT), this.tE(endT));
    this.a.setT(m, F_KEYWORD, keywordT);
    this.a.setT(m, F_IN, inT);
    this.a.setT(m, F_BEGIN, beginT);
    this.a.setT(m, F_END, endT);
    return m;
  }

  rescueBodyMap(keywordT: i32, excList: i32, assocT: i32, excVar: i32, thenT: i32, compstmt: i32): i32 {
    let e = -1;
    if (compstmt !== V_NIL) {
      e = this.exE(compstmt);
    }
    if (e < 0 && thenT !== V_NIL) {
      e = this.tE(thenT);
    }
    if (e < 0 && excVar !== V_NIL) {
      e = this.exE(excVar);
    }
    if (e < 0 && excList !== V_NIL) {
      e = this.exE(excList);
    }
    if (e < 0) {
      e = this.tE(keywordT);
    }
    const m = this.map(M_RESCUE_BODY, this.tS(keywordT), e);
    this.a.setT(m, F_KEYWORD, keywordT);
    this.a.setT(m, F_ASSOC, assocT);
    this.a.setT(m, F_BEGIN, thenT);
    return m;
  }

  ehKeywordMap(compstmt: i32, keywordT: i32, bodies: i32, elseT: i32, elseE: i32): i32 {
    let s = 0;
    if (compstmt === V_NIL) {
      s = keywordT === V_NIL ? this.exS(this.a.at(bodies, 0)) : this.tS(keywordT);
    } else {
      s = this.exS(compstmt);
    }
    let e = 0;
    if (elseT !== V_NIL) {
      e = elseE === V_NIL ? this.tE(elseT) : this.exE(elseE);
    } else if (this.a.at(bodies, -1) !== V_NIL) {
      e = this.exE(this.a.at(bodies, -1));
    } else {
      e = this.tE(keywordT);
    }
    const m = this.map(M_CONDITION, s, e);
    this.a.setT(m, F_KEYWORD, keywordT);
    this.a.setT(m, F_ELSE, elseT);
    return m;
  }

  guardMap(keywordT: i32, body: i32): i32 {
    const m = this.map(M_KEYWORD, this.tS(keywordT), this.exE(body));
    this.a.setT(m, F_KEYWORD, keywordT);
    return m;
  }

  // ---- Literals -------------------------------------------------------------------

  nil(t: i32): i32 {
    return this.n0(NT_NIL, this.tokenMap(t));
  }

  true_(t: i32): i32 {
    return this.n0(NT_TRUE, this.tokenMap(t));
  }

  false_(t: i32): i32 {
    return this.n0(NT_FALSE, this.tokenMap(t));
  }

  numeric(kind: i32, t: i32): i32 {
    const v = this.value(t);
    let h = 0;
    if (kind === NT_INT) {
      h = this.a.num(VT_INT, v);
    } else if (kind === NT_FLOAT) {
      h = this.a.num(VT_FLOAT, v);
    } else if (kind === NT_RATIONAL) {
      h = this.a.num(VT_RATIONAL, rbRationalText(v));
    } else {
      h = this.a.num(VT_COMPLEX, rbComplexText(v));
    }
    const m = this.map(M_OPERATOR, this.tS(t), this.tE(t));
    return this.n(kind, this.a.list1(h), m);
  }

  unaryNum(unaryT: i32, numeric: i32): i32 {
    let v = this.a.kid(numeric, 0);
    if (this.value(unaryT) === "-") {
      v = rbNegate(this.a, v);
    }
    const m = this.map(M_OPERATOR, this.tS(unaryT), this.exE(numeric));
    this.a.setT(m, F_OPERATOR, unaryT);
    return this.a.updated(numeric, -1, this.a.list1(v), m);
  }

  __LINE__(t: i32): i32 {
    return this.n0(NT___LINE__, this.tokenMap(t));
  }

  string(t: i32): i32 {
    return this.n(NT_STR, this.a.list1(this.a.strVal(this.value(t))), this.delimitedStringMap(t));
  }

  stringInternal(t: i32): i32 {
    return this.n(NT_STR, this.a.list1(this.a.strVal(this.value(t))), this.unquotedMap(t));
  }

  stringCompose(beginT: i32, parts: i32, endT: i32): i32 {
    if (this.collapseStringParts(parts)) {
      if (beginT === V_NIL && endT === V_NIL) {
        return this.a.at(parts, 0);
      }
      return this.n(NT_STR, this.a.copyList(this.a.kids(this.a.at(parts, 0))), this.stringMap(beginT, parts, endT));
    }
    return this.n(NT_DSTR, this.a.copyList(parts), this.stringMap(beginT, parts, endT));
  }

  character(t: i32): i32 {
    return this.n(NT_STR, this.a.list1(this.a.strVal(this.value(t))), this.prefixStringMap(t));
  }

  __FILE__(t: i32): i32 {
    return this.n0(NT___FILE__, this.tokenMap(t));
  }

  symbol(t: i32): i32 {
    return this.n(NT_SYM, this.a.list1(this.a.sym(this.value(t))), this.prefixStringMap(t));
  }

  symbolInternal(t: i32): i32 {
    return this.n(NT_SYM, this.a.list1(this.a.sym(this.value(t))), this.unquotedMap(t));
  }

  symbolCompose(beginT: i32, parts: i32, endT: i32): i32 {
    if (this.collapseStringParts(parts)) {
      const str = this.a.at(parts, 0);
      const sym = this.a.sym(this.a.text(this.a.kid(str, 0)));
      return this.n(NT_SYM, this.a.list1(sym), this.collectionMapRange(beginT, this.exS(str), this.exE(str), endT));
    }
    return this.n(NT_DSYM, this.a.copyList(parts), this.collectionMap(beginT, parts, endT));
  }

  xstringCompose(beginT: i32, parts: i32, endT: i32): i32 {
    return this.n(NT_XSTR, this.a.copyList(parts), this.stringMap(beginT, parts, endT));
  }

  dedentString(node: i32, dedentLevel: i32): i32 {
    if (dedentLevel < 0) {
      return node;
    }
    const d = new RbDedenter(dedentLevel);
    const t = this.a.type(node);
    if (t === NT_STR) {
      const s = this.a.kid(node, 0);
      this.a.strs[vIdx(s)] = d.dedent(this.a.text(s));
      return node;
    }
    if (t === NT_DSTR || t === NT_XSTR) {
      const kids = this.a.list();
      const k = this.a.kids(node);
      for (let i = 0; i < this.a.len(k); i++) {
        const c = this.a.at(k, i);
        if (c !== V_NIL && this.a.type(c) === NT_STR) {
          const s = this.a.kid(c, 0);
          const v = d.dedent(this.a.text(s));
          this.a.strs[vIdx(s)] = v;
          if (v.length === 0) {
            continue;
          }
        } else {
          d.interrupt();
        }
        this.a.push(kids, c);
      }
      return this.a.updated(node, -1, kids, -2);
    }
    return node;
  }

  regexpOptions(t: i32): i32 {
    const v = this.value(t);
    // each_char.sort.uniq
    const kids = this.a.list();
    for (let c = 97; c <= 122; c++) {
      const ch = String.fromCharCode(c);
      if (v.indexOf(ch) >= 0) {
        this.a.push(kids, this.a.sym(ch));
      }
    }
    return this.n(NT_REGOPT, kids, this.tokenMap(t));
  }

  regexpCompose(beginT: i32, parts: i32, endT: i32, options: i32): i32 {
    const kids = this.a.copyList(parts);
    this.a.push(kids, options);
    const m = this.map(M_COLLECTION, this.tS(beginT), this.exE(options));
    this.a.setT(m, F_BEGIN, beginT);
    this.a.setT(m, F_END, endT);
    return this.n(NT_REGEXP, kids, m);
  }

  array(beginT: i32, elements: i32, endT: i32): i32 {
    return this.n(NT_ARRAY, this.a.copyList(elements), this.collectionMap(beginT, elements, endT));
  }

  splat(starT: i32, arg: i32 = 0): i32 {
    if (arg === V_NIL) {
      return this.n0(NT_SPLAT, this.unaryOpMap(starT, V_NIL));
    }
    return this.n(NT_SPLAT, this.a.list1(arg), this.unaryOpMap(starT, arg));
  }

  word(parts: i32): i32 {
    if (this.collapseStringParts(parts)) {
      return this.a.at(parts, 0);
    }
    return this.n(NT_DSTR, this.a.copyList(parts), this.collectionMap(V_NIL, parts, V_NIL));
  }

  wordsCompose(beginT: i32, parts: i32, endT: i32): i32 {
    return this.n(NT_ARRAY, this.a.copyList(parts), this.collectionMap(beginT, parts, endT));
  }

  symbolsCompose(beginT: i32, parts: i32, endT: i32): i32 {
    const out = this.a.list();
    for (let i = 0; i < this.a.len(parts); i++) {
      const p = this.a.at(parts, i);
      const t = this.a.type(p);
      if (t === NT_STR) {
        this.a.push(out, this.a.updated(p, NT_SYM, this.a.list1(this.a.sym(this.a.text(this.a.kid(p, 0)))), -2));
      } else if (t === NT_DSTR) {
        this.a.push(out, this.a.updated(p, NT_DSYM, V_NIL, -2));
      } else {
        this.a.push(out, p);
      }
    }
    return this.n(NT_ARRAY, out, this.collectionMap(beginT, out, endT));
  }

  pair(key: i32, assocT: i32, value: i32): i32 {
    return this.n(NT_PAIR, this.a.list2(key, value), this.binaryOpMap(key, assocT, value));
  }

  pairKeyword(keyT: i32, value: i32): i32 {
    const s = this.tS(keyT);
    const e = this.tE(keyT);
    const keyMap = this.map(M_COLLECTION, s, e - 1);
    const pairMap = this.map(M_OPERATOR, s, this.exE(value));
    this.a.setF(pairMap, F_OPERATOR, e - 1, e);
    const key = this.n(NT_SYM, this.a.list1(this.a.sym(this.value(keyT))), keyMap);
    return this.n(NT_PAIR, this.a.list2(key, value), pairMap);
  }

  pairQuoted(beginT: i32, parts: i32, endT: i32, value: i32): i32 {
    const ee = this.tE(endT);
    const endT2 = this.a.token(this.value(endT), ee - 2, ee - 1);
    const pairMap = this.map(M_OPERATOR, this.tS(beginT), this.exE(value));
    this.a.setF(pairMap, F_OPERATOR, ee - 1, ee);
    const key = this.symbolCompose(beginT, parts, endT2);
    return this.n(NT_PAIR, this.a.list2(key, value), pairMap);
  }

  pairLabel(keyT: i32): i32 {
    const s = this.tS(keyT);
    const e = this.tE(keyT) - 1;
    const label = this.value(keyT);
    let value = 0;
    if (rbStartsUpper(label)) {
      const m = this.map(M_CONSTANT, s, e);
      this.a.setF(m, F_NAME, s, e);
      value = this.n(NT_CONST, this.a.list2(V_NIL, this.a.sym(label)), m);
    } else {
      const m = this.map(M_VARIABLE, s, e);
      this.a.setF(m, F_NAME, s, e);
      value = this.n(NT_IDENT, this.a.list1(this.a.sym(label)), m);
    }
    // Prism's pair for a value omission spans the whole label, colon included.
    const pair = this.pairKeyword(keyT, this.accessible(value));
    this.a.setF(this.a.map(pair), F_EXPRESSION, s, this.tE(keyT));
    return pair;
  }

  kwsplat(dstarT: i32, arg: i32): i32 {
    return this.n(NT_KWSPLAT, this.a.list1(arg), this.unaryOpMap(dstarT, arg));
  }

  associate(beginT: i32, pairs: i32, endT: i32): i32 {
    return this.n(NT_HASH, this.a.copyList(pairs), this.collectionMap(beginT, pairs, endT));
  }

  rangeInclusive(lhs: i32, dotT: i32, rhs: i32): i32 {
    return this.n(NT_IRANGE, this.a.list2(lhs, rhs), this.rangeMap(lhs, dotT, rhs));
  }

  rangeExclusive(lhs: i32, dotT: i32, rhs: i32): i32 {
    return this.n(NT_ERANGE, this.a.list2(lhs, rhs), this.rangeMap(lhs, dotT, rhs));
  }

  self_(t: i32): i32 {
    return this.n0(NT_SELF, this.tokenMap(t));
  }

  ident(t: i32): i32 {
    return this.n(NT_IDENT, this.a.list1(this.a.sym(this.value(t))), this.variableMap(t));
  }

  ivar(t: i32): i32 {
    return this.n(NT_IVAR, this.a.list1(this.a.sym(this.value(t))), this.variableMap(t));
  }

  gvar(t: i32): i32 {
    const name = this.value(t);
    if (name.startsWith("$0") && name.length > 2) {
      this.diag();
    }
    return this.n(NT_GVAR, this.a.list1(this.a.sym(name)), this.variableMap(t));
  }

  cvar(t: i32): i32 {
    return this.n(NT_CVAR, this.a.list1(this.a.sym(this.value(t))), this.variableMap(t));
  }

  backRef(t: i32): i32 {
    return this.n(NT_BACK_REF, this.a.list1(this.a.sym(this.value(t))), this.tokenMap(t));
  }

  nthRef(t: i32): i32 {
    return this.n(NT_NTH_REF, this.a.list1(this.a.num(VT_INT, this.value(t))), this.tokenMap(t));
  }

  accessible(node: i32): i32 {
    const t = this.a.type(node);
    if (t === NT___FILE__) {
      return this.n(NT_STR, this.a.list1(this.a.strVal(this.st.path)), this.a.copyMap(this.a.map(node)));
    }
    if (t === NT___LINE__) {
      const line = this.st.lineOf(this.exS(node));
      return this.n(NT_INT, this.a.list1(this.a.num(VT_INT, `${line}`)), this.a.copyMap(this.a.map(node)));
    }
    if (t === NT___ENCODING__) {
      const enc = this.n(NT_CONST, this.a.list2(V_NIL, this.a.sym("Encoding")), -1);
      return this.n(NT_CONST, this.a.list2(enc, this.a.sym("UTF_8")), this.a.copyMap(this.a.map(node)));
    }
    if (t === NT_IDENT) {
      const name = this.a.text(this.a.kid(node, 0));
      if (name.endsWith("?") || name.endsWith("!")) {
        this.diag();
      }
      if (this.tryDeclareNumparam(node)) {
        return this.a.updated(node, NT_LVAR, V_NIL, -2);
      }
      if (!this.st.env.declared(name)) {
        return this.n(NT_SEND, this.a.list2(V_NIL, this.a.sym(name)), this.varSendMap(node));
      }
      if (name === this.st.argTop() && name.length > 0) {
        this.diag();
      }
      return this.a.updated(node, NT_LVAR, V_NIL, -2);
    }
    return node;
  }

  /** Parser#try_declare_numparam. */
  tryDeclareNumparam(node: i32): boolean {
    const name = this.a.text(this.a.kid(node, 0));
    if (rbIsNumparam(name) && !this.st.env.declared(name) && this.st.ctx.inDynamicBlock()) {
      if (this.st.hasOrdinaryParams()) {
        this.diag();
      }
      // Outer block scopes that already use numbered parameters.
      for (let i = toI32(this.st.npValue.length) - 2; i >= 0; i--) {
        if (this.st.npStatic[i]) {
          break;
        }
        if (this.st.npValue[i] > 0) {
          this.diag();
        }
      }
      this.st.env.declare(name);
      this.st.npRegister(name.charCodeAt(1) - 48);
      return true;
    }
    return false;
  }

  const_(nameT: i32): i32 {
    return this.n(NT_CONST, this.a.list2(V_NIL, this.a.sym(this.value(nameT))), this.constantMap(V_NIL, V_NIL, nameT));
  }

  constGlobal(colon3T: i32, nameT: i32): i32 {
    const cbase = this.n0(NT_CBASE, this.tokenMap(colon3T));
    return this.n(NT_CONST, this.a.list2(cbase, this.a.sym(this.value(nameT))), this.constantMap(cbase, colon3T, nameT));
  }

  constFetch(scope: i32, colon2T: i32, nameT: i32): i32 {
    return this.n(NT_CONST, this.a.list2(scope, this.a.sym(this.value(nameT))), this.constantMap(scope, colon2T, nameT));
  }

  __ENCODING__(t: i32): i32 {
    return this.n0(NT___ENCODING__, this.tokenMap(t));
  }

  assignable(node: i32): i32 {
    const t = this.a.type(node);
    if (t === NT_CVAR) {
      return this.a.updated(node, NT_CVASGN, V_NIL, -2);
    }
    if (t === NT_IVAR) {
      return this.a.updated(node, NT_IVASGN, V_NIL, -2);
    }
    if (t === NT_GVAR) {
      return this.a.updated(node, NT_GVASGN, V_NIL, -2);
    }
    if (t === NT_CONST) {
      if (this.st.ctx.in_def) {
        this.diag();
      }
      return this.a.updated(node, NT_CASGN, V_NIL, -2);
    }
    if (t === NT_IDENT) {
      const name = this.a.text(this.a.kid(node, 0));
      this.checkAssignmentToNumparam(name);
      this.checkReservedForNumparam(name);
      this.st.env.declare(name);
      return this.a.updated(node, NT_LVASGN, V_NIL, -2);
    }
    if (t === NT_MATCH_VAR) {
      const name = this.a.text(this.a.kid(node, 0));
      this.checkAssignmentToNumparam(name);
      this.checkReservedForNumparam(name);
      return node;
    }
    this.diag();
    return node;
  }

  constOpAssignable(node: i32): i32 {
    return this.a.updated(node, NT_CASGN, V_NIL, -2);
  }

  assign(lhs: i32, eqlT: i32, rhs: i32): i32 {
    const kids = this.a.copyList(this.a.kids(lhs));
    this.a.push(kids, rhs);
    const m = this.a.copyMap(this.a.map(lhs));
    this.a.setT(m, F_OPERATOR, eqlT);
    this.a.setF(m, F_EXPRESSION, this.exS(lhs), this.exE(rhs));
    return this.a.updated(lhs, -1, kids, m);
  }

  opAssign(lhs0: i32, opT: i32, rhs: i32): i32 {
    let lhs = lhs0;
    const t = this.a.type(lhs);
    if (t === NT_GVASGN || t === NT_IVASGN || t === NT_LVASGN || t === NT_CVASGN || t === NT_CASGN || t === NT_SEND || t === NT_CSEND || t === NT_INDEX) {
      const op = this.value(opT);
      const m = this.a.copyMap(this.a.map(lhs));
      this.a.setT(m, F_OPERATOR, opT);
      this.a.setF(m, F_EXPRESSION, this.exS(lhs), this.exE(rhs));
      if (op === "&&") {
        return this.n(NT_AND_ASGN, this.a.list2(lhs, rhs), m);
      }
      if (op === "||") {
        return this.n(NT_OR_ASGN, this.a.list2(lhs, rhs), m);
      }
      return this.n(NT_OP_ASGN, this.a.list3(lhs, this.a.sym(op), rhs), m);
    }
    this.diag();
    lhs = lhs0;
    return lhs;
  }

  multiLhs(beginT: i32, items0: i32, endT: i32): i32 {
    // `[*items]`: a node spreads its children. Prism keeps a parenthesized
    // inner mlhs as one item instead.
    let items = items0;
    if (this.a.isNode(items0)) {
      items = this.a.has(this.a.map(items0), F_BEGIN) ? this.a.list1(items0) : this.a.kids(items0);
    }
    return this.n(NT_MLHS, this.a.copyList(items), this.collectionMap(beginT, items, endT));
  }

  /** mlhs_item: tLPAREN mlhs_inner rparen. Prism nests a parenthesized inner mlhs. */
  mlhsItem(beginT: i32, body: i32, endT: i32): i32 {
    if (this.a.isNode(body) && this.a.type(body) === NT_MLHS && this.a.has(this.a.map(body), F_BEGIN)) {
      const l = this.a.list1(body);
      return this.n(NT_MLHS, l, this.collectionMap(beginT, l, endT));
    }
    return this.begin(beginT, body, endT);
  }

  multiAssign(lhs: i32, eqlT: i32, rhs: i32): i32 {
    return this.n(NT_MASGN, this.a.list2(lhs, rhs), this.binaryOpMap(lhs, eqlT, rhs));
  }

  defClass(classT: i32, name: i32, ltT: i32, superclass: i32, body: i32, endT: i32): i32 {
    return this.n(NT_CLASS, this.a.list3(name, superclass, body), this.moduleDefinitionMap(classT, name, ltT, endT));
  }

  defSclass(classT: i32, lshftT: i32, expr: i32, body: i32, endT: i32): i32 {
    return this.n(NT_SCLASS, this.a.list2(expr, body), this.moduleDefinitionMap(classT, V_NIL, lshftT, endT));
  }

  defModule(moduleT: i32, name: i32, body: i32, endT: i32): i32 {
    return this.n(NT_MODULE, this.a.list2(name, body), this.moduleDefinitionMap(moduleT, name, V_NIL, endT));
  }

  defMethod(defT: i32, nameT: i32, args: i32, body: i32, endT: i32): i32 {
    this.checkReservedForNumparam(this.value(nameT));
    return this.n(NT_DEF, this.a.list3(this.a.sym(this.value(nameT)), args, body), this.definitionMap(defT, V_NIL, nameT, endT));
  }

  defEndlessMethod(defT: i32, nameT: i32, args: i32, assignmentT: i32, body: i32): i32 {
    this.checkReservedForNumparam(this.value(nameT));
    return this.n(NT_DEF, this.a.list3(this.a.sym(this.value(nameT)), args, body), this.endlessDefinitionMap(defT, V_NIL, nameT, assignmentT, body));
  }

  defSingleton(defT: i32, definee: i32, dotT: i32, nameT: i32, args: i32, body: i32, endT: i32): i32 {
    this.validateDefinee(definee);
    this.checkReservedForNumparam(this.value(nameT));
    const kids = this.a.list();
    this.a.push(kids, definee);
    this.a.push(kids, this.a.sym(this.value(nameT)));
    this.a.push(kids, args);
    this.a.push(kids, body);
    return this.n(NT_DEFS, kids, this.definitionMap(defT, dotT, nameT, endT));
  }

  defEndlessSingleton(defT: i32, definee: i32, dotT: i32, nameT: i32, args: i32, assignmentT: i32, body: i32): i32 {
    this.validateDefinee(definee);
    this.checkReservedForNumparam(this.value(nameT));
    const kids = this.a.list();
    this.a.push(kids, definee);
    this.a.push(kids, this.a.sym(this.value(nameT)));
    this.a.push(kids, args);
    this.a.push(kids, body);
    return this.n(NT_DEFS, kids, this.endlessDefinitionMap(defT, dotT, nameT, assignmentT, body));
  }

  undefMethod(undefT: i32, names: i32): i32 {
    return this.n(NT_UNDEF, this.a.copyList(names), this.keywordMap(undefT, V_NIL, names, V_NIL));
  }

  alias(aliasT: i32, to: i32, from: i32): i32 {
    const l = this.a.list2(to, from);
    return this.n(NT_ALIAS, l, this.keywordMap(aliasT, V_NIL, l, V_NIL));
  }

  args(beginT: i32, args: i32, endT: i32, check: boolean = true): i32 {
    if (check) {
      this.checkDuplicateArgs(args);
    }
    this.validateNoForwardArgAfterRestarg(args);
    return this.n(NT_ARGS, this.a.copyList(args), this.collectionMap(beginT, args, endT));
  }

  numargs(maxNumparam: i32): i32 {
    return this.n(NT_NUMARGS, this.a.list1(this.a.num(VT_INT, `${maxNumparam}`)), -1);
  }

  forwardOnlyArgs(beginT: i32, dotsT: i32, endT: i32): i32 {
    const arg = this.forwardArg(dotsT);
    const l = this.a.list1(arg);
    return this.n(NT_ARGS, l, this.collectionMap(beginT, l, endT));
  }

  forwardArg(dotsT: i32): i32 {
    return this.n0(NT_FORWARD_ARG, this.tokenMap(dotsT));
  }

  arg(nameT: i32): i32 {
    this.checkReservedForNumparam(this.value(nameT));
    return this.n(NT_ARG, this.a.list1(this.a.sym(this.value(nameT))), this.variableMap(nameT));
  }

  optarg(nameT: i32, eqlT: i32, value: i32): i32 {
    this.checkReservedForNumparam(this.value(nameT));
    const m = this.variableMap(nameT);
    this.a.setT(m, F_OPERATOR, eqlT);
    this.a.setF(m, F_EXPRESSION, this.tS(nameT), this.exE(value));
    return this.n(NT_OPTARG, this.a.list2(this.a.sym(this.value(nameT)), value), m);
  }

  restarg(starT: i32, nameT: i32 = 0): i32 {
    if (nameT !== V_NIL) {
      this.checkReservedForNumparam(this.value(nameT));
      return this.n(NT_RESTARG, this.a.list1(this.a.sym(this.value(nameT))), this.argPrefixMap(starT, nameT));
    }
    return this.n0(NT_RESTARG, this.argPrefixMap(starT, V_NIL));
  }

  kwarg(nameT: i32): i32 {
    this.checkReservedForNumparam(this.value(nameT));
    return this.n(NT_KWARG, this.a.list1(this.a.sym(this.value(nameT))), this.kwargMap(nameT, V_NIL));
  }

  kwoptarg(nameT: i32, value: i32): i32 {
    this.checkReservedForNumparam(this.value(nameT));
    return this.n(NT_KWOPTARG, this.a.list2(this.a.sym(this.value(nameT)), value), this.kwargMap(nameT, value));
  }

  kwrestarg(dstarT: i32, nameT: i32 = 0): i32 {
    if (nameT !== V_NIL) {
      this.checkReservedForNumparam(this.value(nameT));
      return this.n(NT_KWRESTARG, this.a.list1(this.a.sym(this.value(nameT))), this.argPrefixMap(dstarT, nameT));
    }
    return this.n0(NT_KWRESTARG, this.argPrefixMap(dstarT, V_NIL));
  }

  kwnilarg(dstarT: i32, nilT: i32): i32 {
    return this.n0(NT_KWNILARG, this.argPrefixMap(dstarT, nilT));
  }

  shadowarg(nameT: i32): i32 {
    this.checkReservedForNumparam(this.value(nameT));
    return this.n(NT_SHADOWARG, this.a.list1(this.a.sym(this.value(nameT))), this.variableMap(nameT));
  }

  blockarg(amperT: i32, nameT: i32): i32 {
    if (nameT !== V_NIL) {
      this.checkReservedForNumparam(this.value(nameT));
    }
    const name = nameT !== V_NIL ? this.a.sym(this.value(nameT)) : V_NIL;
    return this.n(NT_BLOCKARG, this.a.list1(name), this.argPrefixMap(amperT, nameT));
  }

  /** procarg0 with emit_procarg0 off: the argument itself. */
  procarg0(arg: i32): i32 {
    return arg;
  }

  argExpr(expr: i32): i32 {
    if (this.a.type(expr) === NT_LVASGN) {
      return this.a.updated(expr, NT_ARG, V_NIL, -2);
    }
    return this.n(NT_ARG_EXPR, this.a.list1(expr), this.a.copyMap(this.a.map(expr)));
  }

  restargExpr(starT: i32, expr: i32 = 0): i32 {
    if (expr === V_NIL) {
      return this.n0(NT_RESTARG, this.tokenMap(starT));
    }
    if (this.a.type(expr) === NT_LVASGN) {
      return this.a.updated(expr, NT_RESTARG, V_NIL, -2);
    }
    return this.n(NT_RESTARG_EXPR, this.a.list1(expr), this.a.copyMap(this.a.map(expr)));
  }

  blockargExpr(amperT: i32, expr: i32): i32 {
    if (this.a.type(expr) === NT_LVASGN) {
      return this.a.updated(expr, NT_BLOCKARG, V_NIL, -2);
    }
    return this.n(NT_BLOCKARG_EXPR, this.a.list1(expr), this.a.copyMap(this.a.map(expr)));
  }

  callTypeForDot(dotT: i32): i32 {
    return dotT !== V_NIL && this.value(dotT) === "&." ? NT_CSEND : NT_SEND;
  }

  forwardedArgs(dotsT: i32): i32 {
    return this.n0(NT_FORWARDED_ARGS, this.tokenMap(dotsT));
  }

  forwardedRestarg(starT: i32): i32 {
    return this.n0(NT_FORWARDED_RESTARG, this.tokenMap(starT));
  }

  forwardedKwrestarg(dstarT: i32): i32 {
    return this.n0(NT_FORWARDED_KWRESTARG, this.tokenMap(dstarT));
  }

  callMethod(receiver: i32, dotT: i32, selectorT: i32, lparenT: i32 = 0, args: i32 = 0, rparenT: i32 = 0): i32 {
    const type = this.callTypeForDot(dotT);
    const kids = this.a.list();
    this.a.push(kids, receiver);
    this.a.push(kids, this.a.sym(selectorT === V_NIL ? "call" : this.value(selectorT)));
    for (let i = 0; i < this.a.len(args); i++) {
      this.a.push(kids, this.a.at(args, i));
    }
    return this.n(type, kids, this.sendMap(receiver, dotT, selectorT, lparenT, args, rparenT));
  }

  callLambda(lambdaT: i32): i32 {
    return this.n(NT_SEND, this.a.list2(V_NIL, this.a.sym("lambda")), this.sendMap(V_NIL, V_NIL, lambdaT, V_NIL, V_NIL, V_NIL));
  }

  block(methodCall: i32, beginT: i32, args0: i32, body: i32, endT: i32): i32 {
    const mt = this.a.type(methodCall);
    if (mt === NT_YIELD) {
      this.diag();
    }
    const k = this.a.kids(methodCall);
    const nk = this.a.len(k);
    const lastArg = mt === NT_SUPER ? this.a.at(k, -1) : nk > 2 ? this.a.at(k, -1) : V_NIL;
    if (lastArg !== V_NIL && this.a.isNode(lastArg)) {
      const lt = this.a.type(lastArg);
      if ((lt === NT_BLOCK_PASS || lt === NT_FORWARDED_ARGS) && mt !== NT_SUPER) {
        this.diag();
      }
    }
    let args = args0;
    let blockType = NT_BLOCK;
    if (this.a.type(args) === NT_NUMARGS) {
      blockType = NT_NUMBLOCK;
      args = this.a.kid(args, 0);
    }
    if (mt === NT_SEND || mt === NT_CSEND || mt === NT_INDEX || mt === NT_SUPER || mt === NT_ZSUPER || mt === NT_LAMBDA) {
      return this.n(blockType, this.a.list3(methodCall, args, body), this.blockMap(this.exS(methodCall), beginT, endT));
    }
    const actualSend = this.a.kid(methodCall, 0);
    const block = this.n(blockType, this.a.list3(actualSend, args, body), this.blockMap(this.exS(actualSend), beginT, endT));
    const m = this.a.copyMap(this.a.map(methodCall));
    this.a.setF(m, F_EXPRESSION, this.exS(methodCall), this.exE(block));
    return this.n(mt, this.a.list1(block), m);
  }

  blockPass(amperT: i32, arg: i32): i32 {
    const kids = this.a.list1(arg);
    return this.n(NT_BLOCK_PASS, kids, this.unaryOpMap(amperT, arg));
  }

  attrAsgn(receiver: i32, dotT: i32, selectorT: i32): i32 {
    const name = `${this.value(selectorT)}=`;
    const type = this.callTypeForDot(dotT);
    return this.n(type, this.a.list2(receiver, this.a.sym(name)), this.sendMap(receiver, dotT, selectorT, V_NIL, V_NIL, V_NIL));
  }

  index(receiver: i32, lbrackT: i32, indexes: i32, rbrackT: i32): i32 {
    const kids = this.a.list();
    this.a.push(kids, receiver);
    this.a.push(kids, this.a.sym("[]"));
    for (let i = 0; i < this.a.len(indexes); i++) {
      this.a.push(kids, this.a.at(indexes, i));
    }
    return this.n(NT_SEND, kids, this.sendIndexMap(receiver, lbrackT, rbrackT));
  }

  indexAsgn(receiver: i32, lbrackT: i32, indexes: i32, rbrackT: i32): i32 {
    const kids = this.a.list();
    this.a.push(kids, receiver);
    this.a.push(kids, this.a.sym("[]="));
    for (let i = 0; i < this.a.len(indexes); i++) {
      this.a.push(kids, this.a.at(indexes, i));
    }
    return this.n(NT_SEND, kids, this.sendIndexMap(receiver, lbrackT, rbrackT));
  }

  binaryOp(receiver: i32, opT: i32, arg: i32): i32 {
    return this.n(NT_SEND, this.a.list3(receiver, this.a.sym(this.value(opT)), arg), this.sendBinaryOpMap(receiver, opT, arg));
  }

  matchOp(receiver: i32, matchT: i32, arg: i32): i32 {
    const m = this.sendBinaryOpMap(receiver, matchT, arg);
    if (this.isStaticRegexp(receiver)) {
      const names = rbRegexpNames(this.staticString(this.a.kids(receiver), 1));
      for (const nm of names) {
        this.st.env.declare(nm);
      }
      return this.n(NT_MATCH_WITH_LVASGN, this.a.list2(receiver, arg), m);
    }
    return this.n(NT_SEND, this.a.list3(receiver, this.a.sym("=~"), arg), m);
  }

  unaryOp(opT: i32, receiver: i32): i32 {
    let method = this.value(opT);
    if (method === "+" || method === "-") {
      method = `${method}@`;
    }
    return this.n(NT_SEND, this.a.list2(receiver, this.a.sym(method)), this.sendUnaryOpMap(opT, receiver));
  }

  notOp(notT: i32, beginT: i32 = 0, receiver: i32 = 0, endT: i32 = 0): i32 {
    if (receiver === V_NIL) {
      const nilNode = this.n0(NT_BEGIN, this.collectionMap(beginT, V_NIL, endT));
      return this.n(NT_SEND, this.a.list2(nilNode, this.a.sym("!")), this.sendUnaryOpMap(notT, nilNode));
    }
    return this.n(NT_SEND, this.a.list2(this.checkCondition(receiver), this.a.sym("!")), this.sendMap(V_NIL, V_NIL, notT, beginT, this.a.list1(receiver), endT));
  }

  logicalOp(type: i32, lhs: i32, opT: i32, rhs: i32): i32 {
    return this.n(type, this.a.list2(lhs, rhs), this.binaryOpMap(lhs, opT, rhs));
  }

  condition(condT: i32, cond: i32, thenT: i32, ifTrue: i32, elseT: i32, ifFalse: i32, endT: i32): i32 {
    return this.n(NT_IF, this.a.list3(this.checkCondition(cond), ifTrue, ifFalse), this.conditionMap(condT, cond, thenT, ifTrue, elseT, ifFalse, endT));
  }

  conditionMod(ifTrue: i32, ifFalse: i32, condT: i32, cond: i32): i32 {
    const pre = ifTrue !== V_NIL ? ifTrue : ifFalse;
    return this.n(NT_IF, this.a.list3(this.checkCondition(cond), ifTrue, ifFalse), this.keywordModMap(pre, condT, cond));
  }

  ternary(cond: i32, questionT: i32, ifTrue: i32, colonT: i32, ifFalse: i32): i32 {
    return this.n(NT_IF, this.a.list3(this.checkCondition(cond), ifTrue, ifFalse), this.ternaryMap(cond, questionT, colonT, ifFalse));
  }

  when(whenT: i32, patterns: i32, thenT: i32, body: i32): i32 {
    const kids = this.a.push(patterns, body);
    return this.n(NT_WHEN, this.a.copyList(kids), this.keywordMap(whenT, thenT, kids, V_NIL));
  }

  case_(caseT: i32, expr: i32, whenBodies: i32, elseT: i32, elseBody: i32, endT: i32): i32 {
    const kids = this.a.list1(expr);
    for (let i = 0; i < this.a.len(whenBodies); i++) {
      this.a.push(kids, this.a.at(whenBodies, i));
    }
    this.a.push(kids, elseBody);
    return this.n(NT_CASE, kids, this.conditionMap(caseT, expr, V_NIL, V_NIL, elseT, elseBody, endT));
  }

  loop(type: i32, keywordT: i32, cond: i32, doT: i32, body: i32, endT: i32): i32 {
    return this.n(type, this.a.list2(this.checkCondition(cond), body), this.keywordMap(keywordT, doT, V_NIL, endT));
  }

  /** loop_mod; `postType` is the `_post` type used when the body is `begin ... end`. */
  loopMod(type: i32, postType: i32, body: i32, keywordT: i32, cond: i32): i32 {
    const t = this.a.type(body) === NT_KWBEGIN ? postType : type;
    return this.n(t, this.a.list2(this.checkCondition(cond), body), this.keywordModMap(body, keywordT, cond));
  }

  for_(forT: i32, iterator: i32, inT: i32, iteratee: i32, doT: i32, body: i32, endT: i32): i32 {
    return this.n(NT_FOR, this.a.list3(iterator, iteratee, body), this.forMap(forT, inT, doT, endT));
  }

  keywordCmd(type: i32, keywordT: i32, lparenT: i32 = 0, args: i32 = 0, rparenT: i32 = 0): i32 {
    if (type === NT_YIELD && this.a.len(args) > 0) {
      const last = this.a.at(args, -1);
      if (this.a.isNode(last) && this.a.type(last) === NT_BLOCK_PASS) {
        this.diag();
      }
    }
    const l = args === V_NIL ? this.a.list() : args;
    return this.n(type, this.a.copyList(l), this.keywordMap(keywordT, lparenT, l, rparenT));
  }

  preexe(preexeT: i32, lbraceT: i32, compstmt: i32, rbraceT: i32): i32 {
    return this.n(NT_PREEXE, this.a.list1(compstmt), this.keywordMap(preexeT, lbraceT, this.a.list(), rbraceT));
  }

  postexe(postexeT: i32, lbraceT: i32, compstmt: i32, rbraceT: i32): i32 {
    return this.n(NT_POSTEXE, this.a.list1(compstmt), this.keywordMap(postexeT, lbraceT, this.a.list(), rbraceT));
  }

  rescueBody(rescueT: i32, excList: i32, assocT: i32, excVar: i32, thenT: i32, compstmt: i32): i32 {
    return this.n(NT_RESBODY, this.a.list3(excList, excVar, compstmt), this.rescueBodyMap(rescueT, excList, assocT, excVar, thenT, compstmt));
  }

  beginBody(compound0: i32, rescueBodies: i32 = 0, elseT: i32 = 0, else_: i32 = 0, ensureT: i32 = 0, ensure_: i32 = 0): i32 {
    let compound = compound0;
    if (this.a.len(rescueBodies) > 0) {
      const kids = this.a.list1(compound);
      for (let i = 0; i < this.a.len(rescueBodies); i++) {
        this.a.push(kids, this.a.at(rescueBodies, i));
      }
      if (elseT !== V_NIL) {
        this.a.push(kids, else_);
        compound = this.n(NT_RESCUE, kids, this.ehKeywordMap(compound, V_NIL, rescueBodies, elseT, else_));
      } else {
        this.a.push(kids, V_NIL);
        compound = this.n(NT_RESCUE, kids, this.ehKeywordMap(compound, V_NIL, rescueBodies, V_NIL, V_NIL));
      }
    } else if (elseT !== V_NIL) {
      const statements = this.a.list();
      if (compound !== V_NIL) {
        if (this.a.type(compound) === NT_BEGIN) {
          const k = this.a.kids(compound);
          for (let i = 0; i < this.a.len(k); i++) {
            this.a.push(statements, this.a.at(k, i));
          }
        } else {
          this.a.push(statements, compound);
        }
      }
      const elseList = this.a.list1(else_);
      this.a.push(statements, this.n(NT_BEGIN, elseList, this.collectionMap(elseT, elseList, V_NIL)));
      compound = this.n(NT_BEGIN, statements, this.collectionMap(V_NIL, statements, V_NIL));
    }
    if (ensureT !== V_NIL) {
      const ens = this.a.list1(ensure_);
      compound = this.n(NT_ENSURE, this.a.list2(compound, ensure_), this.ehKeywordMap(compound, ensureT, ens, V_NIL, V_NIL));
    }
    return compound;
  }

  compstmt(statements: i32): i32 {
    const k = this.a.len(statements);
    if (k === 0) {
      return V_NIL;
    }
    if (k === 1) {
      return this.a.at(statements, 0);
    }
    return this.n(NT_BEGIN, this.a.copyList(statements), this.collectionMap(V_NIL, statements, V_NIL));
  }

  begin(beginT: i32, body: i32, endT: i32): i32 {
    if (body === V_NIL) {
      return this.n0(NT_BEGIN, this.collectionMap(beginT, V_NIL, endT));
    }
    const bt = this.a.type(body);
    const bm = this.a.map(body);
    if (bt === NT_MLHS || (bt === NT_BEGIN && !this.a.has(bm, F_BEGIN) && !this.a.has(bm, F_END))) {
      const kids = this.a.copyList(this.a.kids(body));
      return this.n(bt, kids, this.collectionMap(beginT, kids, endT));
    }
    const l = this.a.list1(body);
    return this.n(NT_BEGIN, l, this.collectionMap(beginT, l, endT));
  }

  beginKeyword(beginT: i32, body: i32, endT: i32): i32 {
    if (body === V_NIL) {
      return this.n0(NT_KWBEGIN, this.collectionMap(beginT, V_NIL, endT));
    }
    const bm = this.a.map(body);
    if (this.a.type(body) === NT_BEGIN && !this.a.has(bm, F_BEGIN) && !this.a.has(bm, F_END)) {
      const kids = this.a.copyList(this.a.kids(body));
      return this.n(NT_KWBEGIN, kids, this.collectionMap(beginT, kids, endT));
    }
    const l = this.a.list1(body);
    return this.n(NT_KWBEGIN, l, this.collectionMap(beginT, l, endT));
  }

  caseMatch(caseT: i32, expr: i32, inBodies: i32, elseT: i32, elseBody0: i32, endT: i32): i32 {
    let elseBody = elseBody0;
    if (elseT !== V_NIL && elseBody === V_NIL) {
      elseBody = this.n(NT_EMPTY_ELSE, V_NIL, this.tokenMap(elseT));
    }
    const kids = this.a.list1(expr);
    for (let i = 0; i < this.a.len(inBodies); i++) {
      this.a.push(kids, this.a.at(inBodies, i));
    }
    this.a.push(kids, elseBody);
    return this.n(NT_CASE_MATCH, kids, this.conditionMap(caseT, expr, V_NIL, V_NIL, elseT, elseBody, endT));
  }

  inMatch(lhs: i32, inT: i32, rhs: i32): i32 {
    return this.n(NT_IN_MATCH, this.a.list2(lhs, rhs), this.binaryOpMap(lhs, inT, rhs));
  }

  matchPattern(lhs: i32, matchT: i32, rhs: i32): i32 {
    return this.n(NT_MATCH_PATTERN, this.a.list2(lhs, rhs), this.binaryOpMap(lhs, matchT, rhs));
  }

  matchPatternP(lhs: i32, matchT: i32, rhs: i32): i32 {
    return this.n(NT_MATCH_PATTERN_P, this.a.list2(lhs, rhs), this.binaryOpMap(lhs, matchT, rhs));
  }

  inPattern(inT: i32, pattern: i32, guard: i32, thenT: i32, body: i32): i32 {
    const kids = this.a.list3(pattern, guard, body);
    const compact = this.a.list();
    for (let i = 0; i < 3; i++) {
      if (this.a.at(kids, i) !== V_NIL) {
        this.a.push(compact, this.a.at(kids, i));
      }
    }
    return this.n(NT_IN_PATTERN, kids, this.keywordMap(inT, thenT, compact, V_NIL));
  }

  ifGuard(ifT: i32, body: i32): i32 {
    return this.n(NT_IF_GUARD, this.a.list1(body), this.guardMap(ifT, body));
  }

  unlessGuard(unlessT: i32, body: i32): i32 {
    return this.n(NT_UNLESS_GUARD, this.a.list1(body), this.guardMap(unlessT, body));
  }

  matchVar(nameT: i32): i32 {
    const name = this.value(nameT);
    this.checkLvarName(name);
    this.checkDuplicatePatternVariable(name);
    this.st.env.declare(name);
    return this.n(NT_MATCH_VAR, this.a.list1(this.a.sym(name)), this.variableMap(nameT));
  }

  matchHashVar(nameT: i32): i32 {
    const name = this.value(nameT);
    this.checkLvarName(name);
    this.checkDuplicatePatternVariable(name);
    this.st.env.declare(name);
    const m = this.map(M_VARIABLE, this.tS(nameT), this.tE(nameT));
    this.a.setF(m, F_NAME, this.tS(nameT), this.tE(nameT) - 1);
    return this.n(NT_MATCH_VAR, this.a.list1(this.a.sym(name)), m);
  }

  matchHashVarFromStr(beginT: i32, strings: i32, endT: i32): i32 {
    if (this.a.len(strings) > 1) {
      this.diag();
    }
    const s = this.a.at(strings, 0);
    const t = this.a.type(s);
    if (t === NT_STR) {
      const name = this.a.text(this.a.kid(s, 0));
      this.checkLvarName(name);
      this.checkDuplicatePatternVariable(name);
      this.st.env.declare(name);
      const sm = this.a.map(s);
      let ns = this.exS(s);
      let ne = this.exE(s);
      if (this.a.has(sm, F_BEGIN)) {
        ns += this.a.fE(sm, F_BEGIN) - this.a.fS(sm, F_BEGIN);
      }
      if (this.a.has(sm, F_END)) {
        ne -= this.a.fE(sm, F_END) - this.a.fS(sm, F_END);
      }
      const es = rbMin(this.tS(beginT), this.exS(s));
      const ee = rbMax(this.exE(s), this.tE(endT));
      const m = this.map(M_VARIABLE, es, ee);
      this.a.setF(m, F_NAME, ns, ne);
      return this.n(NT_MATCH_VAR, this.a.list1(this.a.sym(name)), m);
    }
    if (t === NT_BEGIN) {
      return this.matchHashVarFromStr(beginT, this.a.kids(s), endT);
    }
    this.diag();
    return s;
  }

  matchRest(starT: i32, nameT: i32 = 0): i32 {
    if (nameT === V_NIL) {
      return this.n0(NT_MATCH_REST, this.unaryOpMap(starT, V_NIL));
    }
    const name = this.matchVar(nameT);
    return this.n(NT_MATCH_REST, this.a.list1(name), this.unaryOpMap(starT, name));
  }

  hashPattern(lbraceT: i32, kwargs: i32, rbraceT: i32): i32 {
    this.checkDuplicateArgs(kwargs);
    return this.n(NT_HASH_PATTERN, this.a.copyList(kwargs), this.collectionMap(lbraceT, kwargs, rbraceT));
  }

  arrayPattern(lbrackT: i32, elements: i32, rbrackT: i32): i32 {
    if (elements === V_NIL) {
      return this.n(NT_ARRAY_PATTERN, V_NIL, this.collectionMap(lbrackT, this.a.list(), rbrackT));
    }
    let trailing = false;
    const nodes = this.a.list();
    for (let i = 0; i < this.a.len(elements); i++) {
      const el = this.a.at(elements, i);
      if (this.a.type(el) === NT_MATCH_WITH_TRAILING_COMMA) {
        trailing = true;
        this.a.push(nodes, this.a.kid(el, 0));
      } else {
        trailing = false;
        this.a.push(nodes, el);
      }
    }
    return this.n(trailing ? NT_ARRAY_PATTERN_WITH_TAIL : NT_ARRAY_PATTERN, nodes, this.collectionMap(lbrackT, elements, rbrackT));
  }

  findPattern(lbrackT: i32, elements: i32, rbrackT: i32): i32 {
    return this.n(NT_FIND_PATTERN, this.a.copyList(elements), this.collectionMap(lbrackT, elements, rbrackT));
  }

  matchWithTrailingComma(match: i32, commaT: i32): i32 {
    return this.n(NT_MATCH_WITH_TRAILING_COMMA, this.a.list1(match), this.exprMap(this.exS(match), rbMax(this.exE(match), this.tE(commaT))));
  }

  constPattern(c: i32, ldelimT: i32, pattern: i32, rdelimT: i32): i32 {
    const m = this.map(M_COLLECTION, this.exS(c), this.tE(rdelimT));
    this.a.setT(m, F_BEGIN, ldelimT);
    this.a.setT(m, F_END, rdelimT);
    return this.n(NT_CONST_PATTERN, this.a.list2(c, pattern), m);
  }

  pin(pinT: i32, v: i32): i32 {
    return this.n(NT_PIN, this.a.list1(v), this.sendUnaryOpMap(pinT, v));
  }

  matchAlt(left: i32, pipeT: i32, right: i32): i32 {
    return this.n(NT_MATCH_ALT, this.a.list2(left, right), this.binaryOpMap(left, pipeT, right));
  }

  matchAs(value: i32, assocT: i32, as: i32): i32 {
    return this.n(NT_MATCH_AS, this.a.list2(value, as), this.binaryOpMap(value, assocT, as));
  }

  matchNilPattern(dstarT: i32, nilT: i32): i32 {
    return this.n0(NT_MATCH_NIL_PATTERN, this.argPrefixMap(dstarT, nilT));
  }

  /** match_pair; `label` is a token (kind 1) or a [begin_t, parts, end_t] list (kind 2). */
  matchPair(kind: i32, label: i32, value: i32): i32 {
    if (vIdx(kind) === 1) {
      this.checkDuplicatePatternKey(this.value(label));
      return this.pairKeyword(label, value);
    }
    const beginT = this.a.at(label, 0);
    const parts = this.a.at(label, 1);
    const endT = this.a.at(label, 2);
    const s = this.staticString(parts, 0);
    if (s !== null) {
      this.checkDuplicatePatternKey(s);
    } else {
      this.diag();
    }
    return this.pairQuoted(beginT, parts, endT, value);
  }

  matchLabel(kind: i32, label: i32): i32 {
    if (vIdx(kind) === 1) {
      return this.matchHashVar(label);
    }
    return this.matchHashVarFromStr(this.a.at(label, 0), this.a.at(label, 1), this.a.at(label, 2));
  }

  // ---- Checks -----------------------------------------------------------------------

  checkCondition(cond: i32): i32 {
    const t = this.a.type(cond);
    if (t === NT_BEGIN) {
      if (this.a.nKid(cond) === 1) {
        return this.a.updated(cond, -1, this.a.list1(this.checkCondition(this.a.kid(cond, -1))), -2);
      }
      return cond;
    }
    if (t === NT_AND || t === NT_OR) {
      return this.a.updated(cond, t, this.a.list2(this.checkCondition(this.a.kid(cond, 0)), this.checkCondition(this.a.kid(cond, 1))), -2);
    }
    if (t === NT_IRANGE || t === NT_ERANGE) {
      const lhs = this.a.kid(cond, 0);
      const rhs = this.a.kid(cond, 1);
      const l = lhs !== V_NIL ? this.checkCondition(lhs) : V_NIL;
      const r = rhs !== V_NIL ? this.checkCondition(rhs) : V_NIL;
      return this.a.updated(cond, t === NT_IRANGE ? NT_IFLIPFLOP : NT_EFLIPFLOP, this.a.list2(l, r), -2);
    }
    if (t === NT_REGEXP) {
      return this.n(NT_MATCH_CURRENT_LINE, this.a.list1(cond), this.exprMap(this.exS(cond), this.exE(cond)));
    }
    return cond;
  }

  checkDuplicateArgs(args: i32): void {
    const names: string[] = [];
    this.collectArgNames(args, names);
  }

  private collectArgNames(args: i32, names: string[]): void {
    for (let i = 0; i < this.a.len(args); i++) {
      const arg = this.a.at(args, i);
      if (!this.a.isNode(arg)) {
        continue;
      }
      const t = this.a.type(arg);
      if (t === NT_ARG || t === NT_OPTARG || t === NT_RESTARG || t === NT_BLOCKARG || t === NT_KWARG || t === NT_KWOPTARG || t === NT_KWRESTARG || t === NT_SHADOWARG) {
        const nh = this.a.kid(arg, 0);
        if (nh === V_NIL) {
          continue;
        }
        const name = this.a.text(nh);
        if (name.length > 0 && name.charCodeAt(0) !== 95) {
          for (const n of names) {
            if (n === name) {
              this.diag();
            }
          }
        }
        names.push(name);
      } else if (t === NT_PROCARG0) {
        const c = this.a.kid(arg, 0);
        if (vTag(c) === VT_SYM) {
          names.push(this.a.text(c));
        } else {
          this.collectArgNames(this.a.kids(arg), names);
        }
      } else if (t === NT_MLHS) {
        this.collectArgNames(this.a.kids(arg), names);
      }
    }
  }

  validateNoForwardArgAfterRestarg(args: i32): void {
    let rest = false;
    let fwd = false;
    for (let i = 0; i < this.a.len(args); i++) {
      const arg = this.a.at(args, i);
      if (!this.a.isNode(arg)) {
        continue;
      }
      if (this.a.type(arg) === NT_RESTARG) {
        rest = true;
      } else if (this.a.type(arg) === NT_FORWARD_ARG) {
        fwd = true;
      }
    }
    if (rest && fwd) {
      this.diag();
    }
  }

  checkAssignmentToNumparam(name: string): void {
    if (this.st.ctx.inDynamicBlock() && rbIsNumparam(name) && this.st.hasNumparams()) {
      this.diag();
    }
  }

  checkReservedForNumparam(name: string): void {
    if (rbIsNumparam(name)) {
      this.diag();
    }
  }

  checkLvarName(name: string): void {
    const c = name.length > 0 ? name.charCodeAt(0) : 0;
    if (!((c >= 97 && c <= 122) || c === 95 || c >= 0x80)) {
      this.diag();
    }
  }

  checkDuplicatePatternVariable(name: string): void {
    if (name.startsWith("_")) {
      return;
    }
    if (this.st.varsDeclared(false, name)) {
      this.diag();
    }
    this.st.varsDeclare(false, name);
  }

  checkDuplicatePatternKey(name: string): void {
    if (this.st.varsDeclared(true, name)) {
      this.diag();
    }
    this.st.varsDeclare(true, name);
  }

  validateDefinee(d: i32): boolean {
    const t = this.a.type(d);
    if (t === NT_INT || t === NT_STR || t === NT_DSTR || t === NT_SYM || t === NT_DSYM || t === NT_REGEXP || t === NT_ARRAY || t === NT_HASH) {
      this.diag();
      return false;
    }
    return true;
  }

  collapseStringParts(parts: i32): boolean {
    if (this.a.len(parts) !== 1) {
      return false;
    }
    const t = this.a.type(this.a.at(parts, 0));
    return t === NT_STR || t === NT_DSTR;
  }

  /** static_string of nodes[from, end) minus `drop` trailing nodes; null when not static. */
  staticString(nodes: i32, drop: i32): string | null {
    let out = "";
    for (let i = 0; i < this.a.len(nodes) - drop; i++) {
      const n = this.a.at(nodes, i);
      const t = this.a.type(n);
      if (t === NT_STR) {
        out = out + this.a.text(this.a.kid(n, 0));
      } else if (t === NT_BEGIN) {
        const s = this.staticString(this.a.kids(n), 0);
        if (s === null) {
          return null;
        }
        out = out + s;
      } else {
        return null;
      }
    }
    return out;
  }

  /** static_regexp_node for Ruby 3.3: a regexp whose parts are all plain strings. */
  isStaticRegexp(n: i32): boolean {
    if (this.a.type(n) !== NT_REGEXP) {
      return false;
    }
    const k = this.a.kids(n);
    for (let i = 0; i < this.a.len(k) - 1; i++) {
      if (this.a.type(this.a.at(k, i)) !== NT_STR) {
        return false;
      }
    }
    return true;
  }
}

/** Lexer::Dedenter. */
class RbDedenter {
  level: i32;
  atLineBegin: boolean = true;

  constructor(level: i32) {
    this.level = level;
  }

  dedent(s: string): string {
    // Split at backslash-newline continuations.
    const lines: string[] = [];
    let a = 0;
    for (let i = 0; i + 1 < toI32(s.length); i++) {
      if (s.charCodeAt(i) === 92 && s.charCodeAt(i + 1) === 10) {
        lines.push(s.substring(a, i));
        a = i + 2;
        i++;
      }
    }
    lines.push(s.substring(a, toI32(s.length)));
    let out = "";
    for (let li = 0; li < toI32(lines.length); li++) {
      let line = lines[li];
      if (this.atLineBegin || li > 0) {
        let left = this.level;
        let remove = 0;
        for (let i = 0; i < toI32(line.length); i++) {
          if (left <= 0) {
            break;
          }
          const c = line.charCodeAt(i);
          if (c === 32) {
            remove++;
            left -= 1;
          } else if (c === 9) {
            if (8 * ((remove - (remove % 8)) / 8 + 1) > this.level) {
              break;
            }
            remove++;
            left -= 8;
          } else {
            break;
          }
        }
        line = line.substring(remove, toI32(line.length));
      }
      out = out + line;
    }
    this.atLineBegin = out.endsWith("\n");
    return out;
  }

  interrupt(): void {
    this.atLineBegin = false;
  }
}

const rbMin = (a: i32, b: i32): i32 => (a < 0 ? b : b < 0 ? a : a < b ? a : b);
const rbMax = (a: i32, b: i32): i32 => (a > b ? a : b);

/** `_1`..`_9`. */
const rbIsNumparam = (s: string): boolean => s.length === 2 && s.charCodeAt(0) === 95 && s.charCodeAt(1) >= 49 && s.charCodeAt(1) <= 57;

const rbStartsUpper = (s: string): boolean => s.length > 0 && s.charCodeAt(0) >= 65 && s.charCodeAt(0) <= 90;

/** The named groups `(?<name>...)` of a regexp's source. */
const rbRegexpNames = (src: string | null): string[] => {
  const out: string[] = [];
  if (src === null) {
    return out;
  }
  const k = toI32(src.length);
  let i = 0;
  while (i < k) {
    const c = src.charCodeAt(i);
    if (c === 92) {
      i += 2;
      continue;
    }
    if (c === 40 && i + 3 < k && src.charCodeAt(i + 1) === 63 && src.charCodeAt(i + 2) === 60) {
      const d = src.charCodeAt(i + 3);
      if (d !== 61 && d !== 33) {
        let j = i + 3;
        while (j < k && src.charCodeAt(j) !== 62) {
          j++;
        }
        const name = src.substring(i + 3, j);
        let dup = false;
        for (const o of out) {
          if (o === name) {
            dup = true;
          }
        }
        if (!dup) {
          out.push(name);
        }
        i = j;
      }
    }
    i++;
  }
  return out;
};

/** `s` with every byte `c` replaced by `to`. */
const rbSwapSign = (s: string, c: i32, to: string): string => {
  let out = "";
  let a = 0;
  for (let i = 0; i < toI32(s.length); i++) {
    if (s.charCodeAt(i) === c) {
      out = out + s.substring(a, i) + to;
      a = i + 1;
    }
  }
  return out + s.substring(a, toI32(s.length));
};

/** -v for a numeric child handle. */
const rbNegate = (a: RbAst, v: i32): i32 => {
  const t = vTag(v);
  const s = a.text(v);
  if (t === VT_INT || t === VT_FLOAT) {
    return a.num(t, s.startsWith("-") ? s.substring(1, toI32(s.length)) : `-${s}`);
  }
  if (t === VT_RATIONAL) {
    return a.num(t, s.startsWith("-") ? s.substring(1, toI32(s.length)) : `-${s}`);
  }
  if (t === VT_COMPLEX) {
    // (0+3i) -> (0-3i)
    return a.num(t, s.indexOf("+") >= 0 ? rbSwapSign(s, 43, "-") : rbSwapSign(s, 45, "+"));
  }
  return v;
};

/** Rational(chars).inspect without the parentheses: "3/2" for 1.5r. */
const rbRationalText = (v: string): string => {
  let t = "";
  const raw = v.startsWith("r:") ? v.substring(2, toI32(v.length)) : v;
  for (let i = 0; i < toI32(raw.length); i++) {
    if (raw.charCodeAt(i) !== 95) {
      t = t + raw.substring(i, i + 1);
    }
  }
  const dot = t.indexOf(".");
  if (dot < 0) {
    return `${t}/1`;
  }
  const digits = t.substring(0, dot) + t.substring(dot + 1, toI32(t.length));
  let num = parseFloat(digits);
  let den: f64 = 1;
  for (let i = dot + 1; i < toI32(t.length); i++) {
    den = den * 10;
  }
  let a = num;
  let b = den;
  while (b > 0) {
    const r = a - Math.floor(a / b) * b;
    a = b;
    b = r;
  }
  if (a > 1) {
    num = num / a;
    den = den / a;
  }
  return `${toI32(num)}/${toI32(den)}`;
};

/** Complex(0, chars).inspect without the parentheses. */
const rbComplexText = (v: string): string => {
  if (v.startsWith("ir:")) {
    return `0+(${rbRationalText(v.substring(3, toI32(v.length)))})*i`;
  }
  if (v.startsWith("if:")) {
    return `0+${rbFloatInspect(v.substring(3, toI32(v.length)))}i`;
  }
  return `0+${v.startsWith("i:") ? v.substring(2, toI32(v.length)) : v}i`;
};
