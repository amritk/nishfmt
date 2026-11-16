// dart_style's short style front end (lib/src/short/: SourceVisitor,
// ArgumentListVisitor, ArgumentSublist and CallChainVisitor), writing the
// AST's tokens and comments to a chunk builder for language versions up to
// 3.6.
//
// Ported from dart_style (Dart SDK 3.14) (BSD-3-Clause, Copyright the Dart
// project authors).

import {
  N_ADJACENT_STRINGS,
  N_ANNOTATION,
  N_ARGUMENT_LIST,
  N_ASSERT_INITIALIZER,
  N_ASSERT_STATEMENT,
  N_ASSIGNED_VARIABLE_PATTERN,
  N_ASSIGNMENT_EXPRESSION,
  N_AS_EXPRESSION,
  N_AWAIT_EXPRESSION,
  N_BINARY_EXPRESSION,
  N_BLOCK,
  N_BLOCK_CLASS_BODY,
  N_BLOCK_ENUM_BODY,
  N_BLOCK_FUNCTION_BODY,
  N_BOOLEAN_LITERAL,
  N_BREAK_STATEMENT,
  N_CASCADE_EXPRESSION,
  N_CAST_PATTERN,
  N_CATCH_CLAUSE,
  N_CATCH_CLAUSE_PARAMETER,
  N_CLASS_DECLARATION,
  N_CLASS_TYPE_ALIAS,
  N_COMPILATION_UNIT,
  N_CONDITIONAL_EXPRESSION,
  N_CONFIGURATION,
  N_CONSTANT_PATTERN,
  N_CONSTRUCTOR_DECLARATION,
  N_CONSTRUCTOR_FIELD_INITIALIZER,
  N_CONSTRUCTOR_NAME,
  N_CONTINUE_STATEMENT,
  N_DECLARED_IDENTIFIER,
  N_DECLARED_VARIABLE_PATTERN,
  N_DOTTED_NAME,
  N_DOUBLE_LITERAL,
  N_DO_STATEMENT,
  N_EMPTY_CLASS_BODY,
  N_EMPTY_ENUM_BODY,
  N_EMPTY_FUNCTION_BODY,
  N_EMPTY_STATEMENT,
  N_ENUM_CONSTANT_DECLARATION,
  N_ENUM_DECLARATION,
  N_EXPORT_DIRECTIVE,
  N_EXPRESSION_FUNCTION_BODY,
  N_EXPRESSION_STATEMENT,
  N_EXTENDS_CLAUSE,
  N_EXTENSION_DECLARATION,
  N_EXTENSION_TYPE_DECLARATION,
  N_FIELD_DECLARATION,
  N_FIELD_FORMAL_PARAMETER,
  N_FORMAL_PARAMETER_DEFAULT_CLAUSE,
  N_FORMAL_PARAMETER_LIST,
  N_FOR_EACH_PARTS_WITH_DECLARATION,
  N_FOR_EACH_PARTS_WITH_IDENTIFIER,
  N_FOR_EACH_PARTS_WITH_PATTERN,
  N_FOR_ELEMENT,
  N_FOR_PARTS_WITH_DECLARATIONS,
  N_FOR_PARTS_WITH_EXPRESSION,
  N_FOR_PARTS_WITH_PATTERN,
  N_FOR_STATEMENT,
  N_FUNCTION_DECLARATION,
  N_FUNCTION_DECLARATION_STATEMENT,
  N_FUNCTION_EXPRESSION,
  N_FUNCTION_EXPRESSION_INVOCATION,
  N_FUNCTION_REFERENCE,
  N_FUNCTION_TYPED_SUFFIX,
  N_FUNCTION_TYPE_ALIAS,
  N_GENERIC_FUNCTION_TYPE,
  N_GENERIC_TYPE_ALIAS,
  N_HIDE_COMBINATOR,
  N_IF_ELEMENT,
  N_IF_STATEMENT,
  N_IMPLEMENTS_CLAUSE,
  N_IMPORT_DIRECTIVE,
  N_INDEX_EXPRESSION,
  N_INSTANCE_CREATION_EXPRESSION,
  N_INTEGER_LITERAL,
  N_INTERPOLATION_EXPRESSION,
  N_INTERPOLATION_STRING,
  N_IS_EXPRESSION,
  N_LABEL,
  N_LABELED_STATEMENT,
  N_LABEL_REFERENCE,
  N_LIBRARY_DIRECTIVE,
  N_LIST_LITERAL,
  N_LIST_PATTERN,
  N_LOGICAL_AND_PATTERN,
  N_LOGICAL_OR_PATTERN,
  N_MAP_LITERAL_ENTRY,
  N_MAP_PATTERN,
  N_MAP_PATTERN_ENTRY,
  N_METHOD_DECLARATION,
  N_METHOD_INVOCATION,
  N_MIXIN_DECLARATION,
  N_MIXIN_ON_CLAUSE,
  N_NAMED_ARGUMENT,
  N_NAMED_TYPE,
  N_NAME_WITH_TYPE_PARAMETERS,
  N_NATIVE_CLAUSE,
  N_NATIVE_FUNCTION_BODY,
  N_NULL_ASSERT_PATTERN,
  N_NULL_CHECK_PATTERN,
  N_NULL_LITERAL,
  N_OBJECT_PATTERN,
  N_PARENTHESIZED_EXPRESSION,
  N_PARENTHESIZED_PATTERN,
  N_PART_DIRECTIVE,
  N_PART_OF_DIRECTIVE,
  N_PATTERN_ASSIGNMENT,
  N_PATTERN_FIELD,
  N_PATTERN_VARIABLE_DECLARATION,
  N_PATTERN_VARIABLE_DECLARATION_STATEMENT,
  N_POSTFIX_EXPRESSION,
  N_PREFIXED_IDENTIFIER,
  N_PREFIX_EXPRESSION,
  N_PRIMARY_CONSTRUCTOR_BODY,
  N_PRIMARY_CONSTRUCTOR_DECLARATION,
  N_PRIMARY_CONSTRUCTOR_NAME,
  N_PROPERTY_ACCESS,
  N_RECORD_LITERAL,
  N_RECORD_LITERAL_NAMED_FIELD,
  N_RECORD_PATTERN,
  N_RECORD_TYPE_ANNOTATION,
  N_RECORD_TYPE_NAMED_FIELD,
  N_RECORD_TYPE_POSITIONAL_FIELD,
  N_REDIRECTING_CONSTRUCTOR_INVOCATION,
  N_REGULAR_FORMAL_PARAMETER,
  N_RELATIONAL_PATTERN,
  N_REST_PATTERN_ELEMENT,
  N_RETHROW_EXPRESSION,
  N_RETURN_STATEMENT,
  N_SCRIPT_TAG,
  N_SET_OR_MAP_LITERAL,
  N_SHOW_COMBINATOR,
  N_SIMPLE_IDENTIFIER,
  N_SIMPLE_STRING_LITERAL,
  N_SPREAD_ELEMENT,
  N_STRING_INTERPOLATION,
  N_SUPER_CONSTRUCTOR_INVOCATION,
  N_SUPER_EXPRESSION,
  N_SUPER_FORMAL_PARAMETER,
  N_SWITCH_CASE,
  N_SWITCH_EXPRESSION,
  N_SWITCH_EXPRESSION_CASE,
  N_SWITCH_PATTERN_CASE,
  N_SWITCH_STATEMENT,
  N_SYMBOL_LITERAL,
  N_THIS_EXPRESSION,
  N_THROW_EXPRESSION,
  N_TOP_LEVEL_VARIABLE_DECLARATION,
  N_TRY_STATEMENT,
  N_TYPE_ARGUMENT_LIST,
  N_TYPE_PARAMETER,
  N_TYPE_PARAMETER_LIST,
  N_VARIABLE_DECLARATION,
  N_VARIABLE_DECLARATION_LIST,
  N_VARIABLE_DECLARATION_STATEMENT,
  N_WHILE_STATEMENT,
  N_WILDCARD_PATTERN,
  N_WITH_CLAUSE,
  N_YIELD_STATEMENT,
  DtAst,
  dtNodeName,
  dtSig,
} from "./ast";
import { C_LINE, DtTokens } from "./scanner";
import { K_NONE, T_BANG, T_BOF, T_COMMA, T_DEC, T_DOT, T_EQ, T_MINUS, T_QUESTION, T_SCRIPT, T_SEMI } from "./tokens";
import { dtPrecedence } from "./parser";
import { dtTrimmed } from "./comments";
import {
  DTS_COST_ARROW,
  DTS_COST_ASSIGN,
  DTS_COST_ASSIGN_BLOCK,
  DTS_COST_CONSTRUCTOR_NAME,
  DTS_COST_INDEX,
  DTS_COST_NORMAL,
  DTS_COST_PARAMETER_TYPE,
  DTS_COST_POSITIONAL_ARGUMENTS,
  DTS_COST_SPLIT_BLOCKS,
  DTS_COST_TYPE_ARGUMENT,
  DTS_CT_BLOCK,
  DTS_CT_DOC,
  DTS_CT_INLINE_BLOCK,
  DTS_CT_LINE,
  DTS_INDENT_BLOCK,
  DTS_INDENT_CASCADE,
  DTS_INDENT_CONSTRUCTOR_INITIALIZER,
  DTS_INDENT_EXPRESSION,
  DTS_STATE,
  DtsBuilder,
  DtsChunk,
  DtsComment,
  DtsContext,
  DtsRule,
  dtsCombinatorRule,
  dtsHardRule,
  dtsNamedRule,
  dtsPositionalRule,
  dtsRule,
  dtsTypeArgumentRule,
} from "./short";

// Before/after/between actions (dart_style passes closures).
const SA_NONE: i32 = 0;
const SA_SPACE: i32 = 1;
const SA_SPLIT: i32 = 2;
const SA_NEWLINE: i32 = 3;
const SA_SOLO_SPLIT: i32 = 4;
const SA_ONE_OR_TWO: i32 = 5;
const SA_SPLIT_OR_NEWLINE: i32 = 6;
const SA_SPLIT_OR_TWO: i32 = 7;
const SA_ZERO_SPLIT: i32 = 8;

// What _visitFunctionBody's beforeBody does.
const FB_NONE: i32 = 0;
const FB_UNNEST_UNLESS_EXPRESSION: i32 = 1;
const FB_CONSTRUCTOR: i32 = 2;

export class DtsVisitor {
  t: DtTokens;
  a: DtAst;
  src: u8[];
  cx: DtsContext;
  builder: DtsBuilder;
  parent: i32[];
  lastToken: i32 = -1;
  suppressed: boolean[];
  collectionSplits: boolean[];
  blockRules: Map<i32, DtsRule>;
  blockPrev: Map<i32, DtsChunk>;
  failed: boolean = false;
  why: string = "";

  constructor(t: DtTokens, a: DtAst, pageWidth: i32) {
    this.t = t;
    this.a = a;
    this.src = t.src;
    this.cx = new DtsContext(pageWidth);
    const top: DtsChunk[] = [];
    this.builder = new DtsBuilder(this.cx, null, top);
    this.parent = new Array<i32>(a.n + 1);
    this.parent.fill(-1);
    this.suppressed = new Array<boolean>(t.count + 1);
    this.collectionSplits = [];
    this.blockRules = new Map<i32, DtsRule>();
    this.blockPrev = new Map<i32, DtsChunk>();
  }

  fail(why: string): void {
    if (!this.failed) {
      this.failed = true;
      this.why = why;
    }
  }

  /** run(): formats the unit; answers the text. */
  run(unit: i32, lineEnding: string): string {
    this.setParents(unit);
    this.visit(unit, SA_NONE, SA_NONE);
    // The unit ends at EOF, whose `next` is itself.
    this.writePrecedingCommentsAndNewlines(this.t.count - 1);
    if (this.failed || DTS_STATE[2] !== 0) {
      return "";
    }
    return this.builder.end(lineEnding);
  }

  setParents(n: i32): void {
    const sig = dtSig(this.kind(n));
    for (let i = 0; i < toI32(sig.length); i++) {
      const c = sig.charCodeAt(i);
      const v = this.f(n, i);
      if (v < 0) {
        continue;
      }
      if (c === 78) {
        // N
        this.parent[v] = n;
        this.setParents(v);
      } else if (c === 76) {
        // L
        for (let j = 0; j < this.a.len(v); j++) {
          const x = this.a.at(v, j);
          this.parent[x] = n;
          this.setParents(x);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // AST access.

  f(n: i32, i: i32): i32 {
    return this.a.fld[this.a.fs[n] + i];
  }

  kind(n: i32): i32 {
    return n < 0 ? -1 : this.a.kind[n];
  }

  len(l: i32): i32 {
    return this.a.len(l);
  }

  at(l: i32, i: i32): i32 {
    return this.a.at(l, i);
  }

  items(l: i32): i32[] {
    const out: i32[] = [];
    for (let i = 0; i < this.a.len(l); i++) {
      out.push(this.a.at(l, i));
    }
    return out;
  }

  lex(tok: i32): string {
    return String.fromBytes(this.src, this.t.start[tok], this.t.end[tok]);
  }

  tk(tok: i32): i32 {
    return tok < 0 ? -1 : this.t.kind[tok];
  }

  hasComments(tok: i32): boolean {
    return this.t.cCount[tok] > 0;
  }

  // ast_extensions.

  commaAfter(n: i32): i32 {
    const next = this.a.end[n] + 1;
    if (this.t.kind[next] === T_COMMA) {
      return next;
    }
    if (this.t.kind[next] === T_QUESTION && this.t.kind[next + 1] === T_COMMA) {
      return next + 1;
    }
    return -1;
  }

  hasCommaAfter(n: i32): boolean {
    return this.commaAfter(n) >= 0;
  }

  listHasCommaAfter(xs: i32[]): boolean {
    return xs.length > 0 && this.hasCommaAfter(xs[xs.length - 1]);
  }

  canSplit(xs: i32[], right: i32): boolean {
    return xs.length > 0 || this.hasComments(right);
  }

  hasLineCommentBefore(tok: i32): boolean {
    const t = this.t;
    const first = t.cFirst[tok];
    for (let k = 0; k < t.cCount[tok]; k++) {
      if (t.cKind[first + k] === C_LINE) {
        return true;
      }
    }
    return false;
  }

  containsLineComments(xs: i32[], right: i32): boolean {
    for (const x of xs) {
      if (this.hasLineCommentBefore(this.a.beg[x])) {
        return true;
      }
    }
    return right >= 0 && this.hasLineCommentBefore(right);
  }

  isCollectionLiteral(n: i32): boolean {
    const k = this.kind(n);
    return k === N_LIST_LITERAL || k === N_RECORD_LITERAL || k === N_SET_OR_MAP_LITERAL;
  }

  isControlFlowElement(n: i32): boolean {
    const k = this.kind(n);
    return k === N_IF_ELEMENT || k === N_FOR_ELEMENT;
  }

  isFunctionExpressionBody(n: i32): boolean {
    const p = this.parent[n];
    return p >= 0 && this.kind(p) === N_FUNCTION_EXPRESSION && this.kind(this.parent[p]) !== N_FUNCTION_DECLARATION;
  }

  spreadCollectionBracket(n: i32): i32 {
    if (this.kind(n) !== N_SPREAD_ELEMENT) {
      return -1;
    }
    const e = this.f(n, 1);
    const k = this.kind(e);
    if (k === N_LIST_LITERAL || k === N_SET_OR_MAP_LITERAL) {
      if (this.canSplit(this.items(this.f(e, 3)), this.f(e, 4))) {
        return this.f(e, 2);
      }
    }
    return -1;
  }

  isSpreadCollection(n: i32): boolean {
    return this.spreadCollectionBracket(n) >= 0;
  }

  hasNonEmptyBody(n: i32): boolean {
    let body = -1;
    const k = this.kind(n);
    if (k === N_METHOD_DECLARATION) {
      body = this.f(n, 9);
    } else if (k === N_FUNCTION_DECLARATION_STATEMENT) {
      body = this.f(this.f(this.f(n, 0), 5), 2);
    } else if (k === N_FUNCTION_DECLARATION) {
      body = this.f(this.f(n, 5), 2);
    }
    return body >= 0 && this.kind(body) === N_BLOCK_FUNCTION_BODY && this.len(this.f(this.f(body, 2), 1)) > 0;
  }

  isTrailingCommaArgument(n: i32): boolean {
    let p = this.parent[n];
    if (this.kind(p) === N_NAMED_ARGUMENT) {
      p = this.parent[p];
    }
    return this.kind(p) === N_ARGUMENT_LIST && this.listHasCommaAfter(this.items(this.f(p, 1)));
  }

  looksLikeStaticCall(n: i32): boolean {
    if (this.kind(n) !== N_METHOD_INVOCATION) {
      return false;
    }
    let target = this.f(n, 0);
    if (target < 0) {
      return false;
    }
    if (this.kind(target) === N_SIMPLE_IDENTIFIER && this.looksLikeClassName(this.f(this.f(n, 2), 0))) {
      return true;
    }
    if (this.kind(target) === N_PREFIXED_IDENTIFIER) {
      target = this.f(target, 2);
    }
    return this.kind(target) === N_SIMPLE_IDENTIFIER && this.looksLikeClassName(this.f(target, 0));
  }

  looksLikeClassName(tok: i32): boolean {
    const t = this.t;
    const s = t.start[tok];
    const e = t.end[tok];
    if (t.is(tok, "bool") || t.is(tok, "double") || t.is(tok, "int") || t.is(tok, "num")) {
      return true;
    }
    let i = s;
    let c = toI32(this.src[i]);
    i++;
    if (c === 95) {
      if (e - s === 1) {
        return false;
      }
      c = toI32(this.src[i]);
      i++;
    }
    if (c < 65 || c > 90) {
      return false;
    }
    for (let j = i; j < e; j++) {
      const d = toI32(this.src[j]);
      if (d >= 97 && d <= 122) {
        return true;
      }
    }
    return false;
  }

  /** CascadeExpression.allowInline. */
  allowInline(n: i32): boolean {
    if (this.len(this.f(n, 1)) > 1) {
      return false;
    }
    const k = this.kind(this.f(n, 0));
    return !(k === N_CONDITIONAL_EXPRESSION || k === N_BINARY_EXPRESSION || k === N_PREFIX_EXPRESSION || k === N_AWAIT_EXPRESSION);
  }

  isStringLiteral(n: i32): boolean {
    const k = this.kind(n);
    return k === N_SIMPLE_STRING_LITERAL || k === N_STRING_INTERPOLATION || k === N_ADJACENT_STRINGS;
  }

  /** SingleStringLiteral.isMultiline. */
  isMultilineString(n: i32): boolean {
    const k = this.kind(n);
    let tok = -1;
    if (k === N_SIMPLE_STRING_LITERAL) {
      tok = this.f(n, 0);
    } else if (k === N_STRING_INTERPOLATION) {
      tok = this.a.beg[n];
    } else {
      return false;
    }
    let i = this.t.start[tok];
    if (this.src[i] === 114) {
      i++;
    }
    const q = this.src[i];
    return i + 2 < this.t.end[tok] && this.src[i + 1] === q && this.src[i + 2] === q;
  }

  /** A formal parameter's kind: 0 required positional, 1 optional positional, 2 named. */
  paramKind(p: i32): i32 {
    return this.f(p, 10);
  }

  isOptionalParam(p: i32): boolean {
    return this.paramKind(p) !== 0;
  }

  // -------------------------------------------------------------------------
  // Writing.

  act(a: i32): void {
    switch (a) {
      case SA_SPACE:
        this.space();
        return;
      case SA_SPLIT:
        this.split();
        return;
      case SA_NEWLINE:
        this.newline();
        return;
      case SA_SOLO_SPLIT:
        this.soloSplit(DTS_COST_NORMAL);
        return;
      case SA_ONE_OR_TWO:
        this.oneOrTwoNewlines();
        return;
      case SA_SPLIT_OR_NEWLINE:
        this.splitOrNewline();
        return;
      case SA_SPLIT_OR_TWO:
        this.splitOrTwoNewlines();
        return;
      case SA_ZERO_SPLIT:
        this.zeroSplit();
        return;
      default:
        return;
    }
  }

  visit(n: i32, before: i32, after: i32): void {
    if (n < 0) {
      return;
    }
    this.act(before);
    this.accept(n);
    this.act(after);
  }

  v(n: i32): void {
    this.visit(n, SA_NONE, SA_NONE);
  }

  visitNodes(xs: i32[], before: i32, between: i32, after: i32): void {
    if (xs.length === 0) {
      return;
    }
    this.act(before);
    this.v(xs[0]);
    for (let i = 1; i < xs.length; i++) {
      this.act(between);
      this.v(xs[i]);
    }
    this.act(after);
  }

  visitCommaSeparatedNodes(xs: i32[], between: i32): void {
    for (let i = 0; i < xs.length; i++) {
      if (i > 0) {
        this.act(between);
      }
      const n = xs[i];
      this.v(n);
      const next = this.a.end[n] + 1;
      if (this.t.kind[next] === T_COMMA) {
        this.token(next, SA_NONE, SA_NONE);
      }
    }
  }

  token(tok: i32, before: i32, after: i32): void {
    if (tok < 0) {
      return;
    }
    this.writePrecedingCommentsAndNewlines(tok);
    this.act(before);
    this.writeText(this.lex(tok), tok, true);
    this.act(after);
  }

  tok(tok: i32): void {
    this.token(tok, SA_NONE, SA_NONE);
  }

  modifier(tok: i32): void {
    this.token(tok, SA_NONE, SA_SPACE);
  }

  space(): void {
    this.builder.writeSpace();
  }

  newline(): void {
    this.builder.writeNewline(false, false, false);
  }

  twoNewlines(): void {
    this.builder.writeNewline(true, false, false);
  }

  splitOrNewline(): void {
    if (this.linesBeforeNextToken() > 0) {
      this.builder.writeNewline(false, false, true);
    } else {
      this.split();
    }
  }

  splitOrTwoNewlines(): void {
    if (this.linesBeforeNextToken() > 1) {
      this.twoNewlines();
    } else {
      this.split();
    }
  }

  oneOrTwoNewlines(): void {
    this.builder.writeNewline(this.linesBeforeNextToken() > 1, false, false);
  }

  linesBeforeNextToken(): i32 {
    const prev = this.lastToken;
    if (prev < 0) {
      this.fail("no previous token");
      return 0;
    }
    const next = prev + 1;
    let line = this.t.lineS[next];
    if (this.t.cCount[next] > 0) {
      line = this.t.cLineS[this.t.cFirst[next]];
    }
    return line - this.t.lineE[prev];
  }

  split(): DtsChunk {
    return this.builder.split(true, true);
  }

  zeroSplit(): DtsChunk {
    return this.builder.split(true, false);
  }

  soloSplit(cost: i32): DtsRule {
    const rule = dtsRule(cost);
    this.builder.startRule(rule);
    this.split();
    this.builder.endRule();
    return rule;
  }

  soloZeroSplit(): void {
    this.builder.startRule(dtsRule(DTS_COST_NORMAL));
    this.builder.split(true, false);
    this.builder.endRule();
  }

  nest(): void {
    this.builder.nestExpression(DTS_INDENT_EXPRESSION, false);
  }

  unnest(): void {
    this.builder.unnest(true);
  }

  startRule(): void {
    this.builder.startRule(dtsRule(DTS_COST_NORMAL));
  }

  startLazyRule(): void {
    this.builder.startLazyRule(dtsRule(DTS_COST_NORMAL));
  }

  endRule(): void {
    this.builder.endRule();
  }

  startSpan(): void {
    this.builder.startSpan(DTS_COST_NORMAL);
  }

  endSpan(): void {
    this.builder.endSpan();
  }

  writeText(text: string, tok: i32, mergeEmptySplits: boolean): void {
    this.builder.write(text, mergeEmptySplits);
    this.lastToken = tok;
  }

  writePrecedingCommentsAndNewlines(tok: i32): boolean {
    const t = this.t;
    const n = t.cCount[tok];
    if (n === 0) {
      return false;
    }
    if (this.suppressed[tok]) {
      return false;
    }
    let previousLine = t.lineE[tok - 1];
    const tokenLine = t.lineS[tok];
    if (t.kind[tok - 1] === T_SCRIPT) {
      previousLine = tokenLine;
    }
    const comments: DtsComment[] = [];
    const first = t.cFirst[tok];
    for (let k = 0; k < n; k++) {
      const c = first + k;
      const commentLine = t.cLineS[c];
      if (k === 0 && t.kind[tok - 1] === T_BOF) {
        previousLine = commentLine;
      }
      const text = dtTrimmed(t.src, t.cStart[c], t.cEnd[c]);
      let linesBefore = commentLine - previousLine;
      let flushLeft = t.cCol1[c];
      const isDocLine = text.startsWith("///") && !text.startsWith("////");
      if (isDocLine) {
        flushLeft = false;
        if (k === 0) {
          linesBefore = 2;
        }
      }
      let type = DTS_CT_BLOCK;
      if (isDocLine || (text.startsWith("/**") && text !== "/**/")) {
        type = DTS_CT_DOC;
      } else if (t.cKind[c] === C_LINE) {
        type = DTS_CT_LINE;
      } else if (commentLine === previousLine || commentLine === tokenLine) {
        type = DTS_CT_INLINE_BLOCK;
      }
      comments.push(new DtsComment(text, type, linesBefore, flushLeft));
      previousLine = t.cLineE[c];
    }
    this.builder.writeComments(comments, tokenLine - previousLine, this.lex(tok));
    return comments[0].linesBefore > 0;
  }

  writeStringLiteral(tok: i32): void {
    this.writePrecedingCommentsAndNewlines(tok);
    const lines = dtsSplitLines(this.lex(tok));
    if (lines.length > 1) {
      this.writeStringFirstLine(lines[0], tok);
    } else {
      this.writeText(lines[0], tok, true);
    }
    for (let i = 1; i < lines.length; i++) {
      this.builder.writeNewline(false, true, true);
      this.writeText(lines[i], tok, false);
    }
  }

  writeStringFirstLine(line: string, tok: i32): void {
    const n = toI32(line.length);
    const quoteStart = line.startsWith("r") ? 1 : 0;
    const quoteEnd = quoteStart + 3;
    let backslashCount = 0;
    if (n > quoteEnd && (dtsStartsAt(line, "'''", quoteStart) || dtsStartsAt(line, "\"\"\"", quoteStart))) {
      let cursor = quoteEnd;
      while (true) {
        let c = line.charCodeAt(cursor);
        if (c === 92) {
          cursor++;
          backslashCount++;
          if (cursor >= n) {
            break;
          }
          c = line.charCodeAt(cursor);
        }
        if (c !== 32 && c !== 9) {
          break;
        }
        cursor++;
        if (cursor >= n) {
          break;
        }
      }
      if (cursor === n) {
        let first = line.substring(0, quoteEnd);
        if (backslashCount > 0) {
          first = first + "\\";
          backslashCount--;
          while (backslashCount > 0) {
            first = first + " \\";
            backslashCount--;
          }
        }
        this.writeText(first, tok, true);
        return;
      }
    }
    this.writeText(line, tok, true);
  }

  writeCommaAfter(n: i32): void {
    const c = this.commaAfter(n);
    if (c >= 0) {
      this.tok(c);
    }
  }

  beforeBlock(tok: i32, rule: DtsRule, previousChunk: DtsChunk | null): void {
    this.blockRules.set(tok, rule);
    if (previousChunk !== null) {
      this.blockPrev.set(tok, previousChunk);
    }
  }

  // -------------------------------------------------------------------------
  // The visit methods.

  accept(n: i32): void {
    if (this.failed) {
      return;
    }
    switch (this.kind(n)) {
      case N_ADJACENT_STRINGS:
        this.visitAdjacentStrings(n);
        return;
      case N_ANNOTATION:
        this.tok(this.f(n, 0));
        this.v(this.f(n, 1));
        this.nest();
        this.v(this.f(n, 2));
        this.tok(this.f(n, 3));
        this.v(this.f(n, 4));
        if (this.f(n, 5) >= 0) {
          this.visitArgumentList(this.f(n, 5), false);
        }
        this.unnest();
        return;
      case N_ARGUMENT_LIST:
        this.visitArgumentList(n, true);
        return;
      case N_AS_EXPRESSION:
      case N_CAST_PATTERN:
        this.startSpan();
        this.nest();
        this.v(this.f(n, 0));
        this.soloSplit(DTS_COST_NORMAL);
        this.tok(this.f(n, 1));
        this.space();
        this.v(this.f(n, 2));
        this.unnest();
        this.endSpan();
        return;
      case N_ASSERT_INITIALIZER:
        this.visitAssert(n, false);
        return;
      case N_ASSERT_STATEMENT:
        this.visitAssert(n, true);
        return;
      case N_ASSIGNED_VARIABLE_PATTERN:
        this.tok(this.f(n, 0));
        return;
      case N_ASSIGNMENT_EXPRESSION:
        this.nest();
        this.v(this.f(n, 0));
        this.visitAssignment(this.f(n, 1), this.f(n, 2), false);
        this.unnest();
        return;
      case N_AWAIT_EXPRESSION:
        this.tok(this.f(n, 0));
        this.space();
        this.v(this.f(n, 1));
        return;
      case N_BINARY_EXPRESSION:
        this.visitBinary(n, dtPrecedence(this.t.kind[this.f(n, 1)], K_NONE), this.kind(this.parent[n]) !== N_EXPRESSION_FUNCTION_BODY);
        return;
      case N_BLOCK: {
        const stmts = this.items(this.f(n, 1));
        if (!this.canSplit(stmts, this.f(n, 2))) {
          this.tok(this.f(n, 0));
          if (this.splitEmptyBlock(n)) {
            this.newline();
          }
          this.tok(this.f(n, 2));
          return;
        }
        this.visitBody(this.f(n, 0), stmts, this.f(n, 2));
        return;
      }
      case N_BLOCK_CLASS_BODY:
        this.visitBody(this.f(n, 0), this.items(this.f(n, 1)), this.f(n, 2));
        return;
      case N_BLOCK_ENUM_BODY:
        this.visitBlockEnumBody(n);
        return;
      case N_BLOCK_FUNCTION_BODY:
        this.space();
        this.tok(this.f(n, 0));
        this.tok(this.f(n, 1));
        if (this.f(n, 0) >= 0) {
          this.space();
        }
        this.v(this.f(n, 2));
        return;
      case N_BOOLEAN_LITERAL:
      case N_DOUBLE_LITERAL:
      case N_INTEGER_LITERAL:
      case N_NULL_LITERAL:
      case N_SIMPLE_IDENTIFIER:
      case N_THIS_EXPRESSION:
      case N_SUPER_EXPRESSION:
      case N_RETHROW_EXPRESSION:
      case N_LABEL_REFERENCE:
      case N_CATCH_CLAUSE_PARAMETER:
      case N_EMPTY_CLASS_BODY:
      case N_EMPTY_ENUM_BODY:
      case N_EMPTY_FUNCTION_BODY:
      case N_EMPTY_STATEMENT:
        this.tok(this.f(n, 0));
        return;
      case N_BREAK_STATEMENT:
      case N_CONTINUE_STATEMENT:
        this.nest();
        this.tok(this.f(n, 0));
        this.visit(this.f(n, 1), SA_SPACE, SA_NONE);
        this.tok(this.f(n, 2));
        this.unnest();
        return;
      case N_CASCADE_EXPRESSION:
        this.visitCascade(n);
        return;
      case N_CATCH_CLAUSE:
        this.visitCatchClause(n);
        return;
      case N_CLASS_DECLARATION:
        this.visitClassDeclaration(n);
        return;
      case N_CLASS_TYPE_ALIAS:
        this.visitClassTypeAlias(n);
        return;
      case N_COMPILATION_UNIT:
        this.visitCompilationUnit(n);
        return;
      case N_CONDITIONAL_EXPRESSION:
        this.visitConditional(n);
        return;
      case N_CONFIGURATION:
        this.tok(this.f(n, 0));
        this.space();
        this.tok(this.f(n, 1));
        this.v(this.f(n, 2));
        if (this.f(n, 3) >= 0) {
          this.nest();
          this.space();
          this.tok(this.f(n, 3));
          this.soloSplit(DTS_COST_NORMAL);
          this.v(this.f(n, 4));
          this.unnest();
        }
        this.tok(this.f(n, 5));
        this.space();
        this.v(this.f(n, 6));
        return;
      case N_CONSTANT_PATTERN:
        this.token(this.f(n, 0), SA_NONE, SA_SPACE);
        this.v(this.f(n, 1));
        return;
      case N_CONSTRUCTOR_DECLARATION:
        this.visitConstructorDeclaration(n);
        return;
      case N_CONSTRUCTOR_FIELD_INITIALIZER:
        this.nest();
        this.tok(this.f(n, 0));
        this.tok(this.f(n, 1));
        this.v(this.f(n, 2));
        this.visitAssignment(this.f(n, 3), this.f(n, 4), false);
        this.unnest();
        return;
      case N_CONSTRUCTOR_NAME:
        this.v(this.f(n, 0));
        this.tok(this.f(n, 1));
        this.v(this.f(n, 2));
        return;
      case N_DECLARED_IDENTIFIER:
        this.modifier(this.f(n, 1));
        this.visit(this.f(n, 2), SA_NONE, SA_SPACE);
        this.tok(this.f(n, 3));
        return;
      case N_DECLARED_VARIABLE_PATTERN:
      case N_WILDCARD_PATTERN:
        this.modifier(this.f(n, 0));
        this.visit(this.f(n, 1), SA_NONE, SA_SOLO_SPLIT);
        this.tok(this.f(n, 2));
        return;
      case N_DO_STATEMENT:
        this.nest();
        this.tok(this.f(n, 0));
        this.space();
        this.builder.unnest(false);
        this.v(this.f(n, 1));
        this.nest();
        this.space();
        this.tok(this.f(n, 2));
        this.space();
        this.tok(this.f(n, 3));
        this.soloZeroSplit();
        this.v(this.f(n, 4));
        this.tok(this.f(n, 5));
        this.tok(this.f(n, 6));
        this.unnest();
        return;
      case N_DOTTED_NAME: {
        const l = this.f(n, 0);
        for (let i = 0; i < this.len(l); i++) {
          this.tok(this.at(l, i));
        }
        return;
      }
      case N_ENUM_CONSTANT_DECLARATION:
        this.visitMetadata(this.f(n, 0));
        this.tok(this.f(n, 1));
        if (this.f(n, 2) >= 0) {
          const args = this.f(n, 2);
          this.nest();
          this.v(this.f(args, 0));
          const ctor = this.f(args, 1);
          if (ctor >= 0) {
            this.tok(this.f(ctor, 0));
            this.v(this.f(ctor, 1));
          }
          this.visitArgumentList(this.f(args, 2), false);
          this.unnest();
        }
        return;
      case N_ENUM_DECLARATION:
        this.visitMetadata(this.f(n, 0));
        this.nest();
        this.tok(this.f(n, 1));
        this.space();
        this.v(this.f(n, 2));
        this.visitClauses(this.f(n, 3), this.f(n, 4));
        if (this.kind(this.f(n, 5)) !== N_EMPTY_ENUM_BODY) {
          this.space();
        }
        this.unnest();
        this.v(this.f(n, 5));
        return;
      case N_EXPORT_DIRECTIVE:
      case N_IMPORT_DIRECTIVE:
        this.visitImportOrExport(n);
        return;
      case N_EXPRESSION_FUNCTION_BODY:
        this.visitExpressionFunctionBody(n);
        return;
      case N_EXPRESSION_STATEMENT:
        this.nest();
        this.v(this.f(n, 0));
        this.tok(this.f(n, 1));
        this.unnest();
        return;
      case N_EXTENDS_CLAUSE:
        this.soloSplit(DTS_COST_NORMAL);
        this.tok(this.f(n, 0));
        this.space();
        this.v(this.at(this.f(n, 1), 0));
        return;
      case N_EXTENSION_DECLARATION:
        this.visitExtensionDeclaration(n);
        return;
      case N_EXTENSION_TYPE_DECLARATION:
        this.visitMetadata(this.f(n, 0));
        this.nest();
        this.tok(this.f(n, 1));
        this.space();
        this.tok(this.f(n, 2));
        this.visit(this.f(n, 3), SA_SPACE, SA_NONE);
        this.builder.startRule(dtsCombinatorRule());
        this.v(this.f(n, 4));
        this.endRule();
        if (this.kind(this.f(n, 5)) !== N_EMPTY_CLASS_BODY) {
          this.space();
        }
        this.unnest();
        this.v(this.f(n, 5));
        return;
      case N_FIELD_DECLARATION:
        this.visitMetadata(this.f(n, 0));
        this.nest();
        this.modifier(this.f(n, 1));
        this.modifier(this.f(n, 2));
        this.modifier(this.f(n, 3));
        this.modifier(this.f(n, 4));
        this.v(this.f(n, 5));
        this.tok(this.f(n, 6));
        this.unnest();
        return;
      case N_FIELD_FORMAL_PARAMETER:
      case N_SUPER_FORMAL_PARAMETER:
        this.visitFieldOrSuperParameter(n);
        return;
      case N_REGULAR_FORMAL_PARAMETER:
        this.visitRegularParameter(n);
        return;
      case N_FORMAL_PARAMETER_DEFAULT_CLAUSE:
        this.startSpan();
        this.nest();
        if (this.t.kind[this.f(n, 0)] === T_EQ) {
          this.space();
        }
        this.tok(this.f(n, 0));
        this.soloSplit(this.assignmentCost(this.f(n, 1)));
        this.v(this.f(n, 1));
        this.unnest();
        this.endSpan();
        return;
      case N_FORMAL_PARAMETER_LIST:
        this.visitFormalParameterList(n, true);
        return;
      case N_FOR_ELEMENT:
        this.visitForElement(n);
        return;
      case N_FOR_STATEMENT:
        this.nest();
        this.token(this.f(n, 0), SA_NONE, SA_SPACE);
        this.tok(this.f(n, 1));
        this.space();
        this.tok(this.f(n, 2));
        this.startRule();
        this.v(this.f(n, 3));
        this.tok(this.f(n, 4));
        this.endRule();
        this.unnest();
        this.visitLoopBody(this.f(n, 5));
        return;
      case N_FOR_EACH_PARTS_WITH_DECLARATION: {
        const lv = this.f(n, 0);
        this.visitNodes(this.items(this.f(lv, 0)), SA_NONE, SA_SPLIT, SA_SPLIT);
        this.v(lv);
        this.visitForEachPartsFromIn(n);
        return;
      }
      case N_FOR_EACH_PARTS_WITH_IDENTIFIER:
        this.v(this.f(n, 0));
        this.visitForEachPartsFromIn(n);
        return;
      case N_FOR_EACH_PARTS_WITH_PATTERN:
        this.builder.startBlockArgumentNesting();
        this.visitNodes(this.items(this.f(n, 0)), SA_NONE, SA_SPLIT, SA_SPLIT);
        this.tok(this.f(n, 1));
        this.space();
        this.v(this.f(n, 2));
        this.builder.endBlockArgumentNesting();
        this.soloSplit(DTS_COST_NORMAL);
        this.tok(this.f(n, 3));
        this.space();
        this.v(this.f(n, 4));
        return;
      case N_FOR_PARTS_WITH_DECLARATIONS: {
        this.nest();
        this.startRule();
        const decl = this.f(n, 0);
        this.visitNodes(this.items(this.f(decl, 0)), SA_NONE, SA_SPLIT, SA_SPLIT);
        this.modifier(this.f(decl, 2));
        this.visit(this.f(decl, 3), SA_NONE, SA_SPACE);
        this.visitCommaSeparatedNodes(this.items(this.f(decl, 4)), SA_SPLIT);
        this.endRule();
        this.unnest();
        this.visitForPartsFromLeftSeparator(n);
        return;
      }
      case N_FOR_PARTS_WITH_EXPRESSION:
        this.v(this.f(n, 0));
        this.visitForPartsFromLeftSeparator(n);
        return;
      case N_FOR_PARTS_WITH_PATTERN: {
        this.builder.startBlockArgumentNesting();
        this.nest();
        const decl = this.f(n, 0);
        this.visitNodes(this.items(this.f(decl, 0)), SA_NONE, SA_SPLIT, SA_SPLIT);
        this.tok(this.f(decl, 1));
        this.space();
        this.v(this.f(decl, 2));
        this.visitAssignment(this.f(decl, 3), this.f(decl, 4), false);
        this.unnest();
        this.builder.endBlockArgumentNesting();
        this.visitForPartsFromLeftSeparator(n);
        return;
      }
      case N_FUNCTION_DECLARATION: {
        const fe = this.f(n, 5);
        this.visitFunctionOrMethodDeclaration(
          this.f(n, 0),
          this.f(n, 1),
          this.f(n, 3),
          -1,
          -1,
          this.f(n, 4),
          this.f(n, 2),
          this.f(fe, 0),
          this.f(fe, 1),
          this.f(fe, 2),
        );
        return;
      }
      case N_FUNCTION_DECLARATION_STATEMENT:
        this.v(this.f(n, 0));
        return;
      case N_FUNCTION_EXPRESSION:
        this.visitFunctionBody(this.f(n, 0), this.f(n, 1), this.f(n, 2), FB_NONE, -1);
        return;
      case N_FUNCTION_EXPRESSION_INVOCATION:
        this.startSpan();
        this.nest();
        this.v(this.f(n, 0));
        this.v(this.f(n, 1));
        this.visitArgumentList(this.f(n, 2), false);
        this.unnest();
        this.endSpan();
        return;
      case N_FUNCTION_REFERENCE:
        this.v(this.f(n, 0));
        this.v(this.f(n, 1));
        return;
      case N_FUNCTION_TYPE_ALIAS:
        this.visitMetadata(this.f(n, 0));
        this.nest();
        this.tok(this.f(n, 1));
        this.space();
        this.visit(this.f(n, 2), SA_NONE, SA_SPACE);
        this.tok(this.f(n, 3));
        this.v(this.f(n, 4));
        this.v(this.f(n, 5));
        this.tok(this.f(n, 6));
        this.unnest();
        return;
      case N_FUNCTION_TYPED_SUFFIX:
        this.visitParameterSignature(this.f(n, 0), this.f(n, 1));
        this.tok(this.f(n, 2));
        return;
      case N_GENERIC_FUNCTION_TYPE:
        this.startLazyRule();
        this.nest();
        this.visit(this.f(n, 0), SA_NONE, SA_SPLIT);
        this.tok(this.f(n, 1));
        this.unnest();
        this.endRule();
        this.visitParameterSignature(this.f(n, 2), this.f(n, 3));
        this.tok(this.f(n, 4));
        return;
      case N_GENERIC_TYPE_ALIAS:
        this.visitNodes(this.items(this.f(n, 0)), SA_NONE, SA_NEWLINE, SA_NEWLINE);
        this.nest();
        this.tok(this.f(n, 1));
        this.space();
        this.startRule();
        this.tok(this.f(n, 2));
        this.v(this.f(n, 3));
        this.split();
        this.tok(this.f(n, 4));
        this.endRule();
        this.space();
        this.v(this.f(n, 5));
        this.tok(this.f(n, 6));
        this.unnest();
        return;
      case N_HIDE_COMBINATOR:
      case N_SHOW_COMBINATOR:
      case N_IMPLEMENTS_CLAUSE:
      case N_WITH_CLAUSE:
      case N_MIXIN_ON_CLAUSE:
        this.visitCombinator(this.f(n, 0), this.items(this.f(n, 1)));
        return;
      case N_IF_ELEMENT:
        this.visitIfElement(n);
        return;
      case N_IF_STATEMENT:
        this.visitIfStatement(n);
        return;
      case N_INDEX_EXPRESSION:
        this.nest();
        if (this.f(n, 1) >= 0) {
          this.tok(this.f(n, 1));
        } else {
          this.v(this.f(n, 0));
        }
        this.finishIndexExpression(n);
        this.unnest();
        return;
      case N_INSTANCE_CREATION_EXPRESSION:
        this.startSpan();
        this.token(this.f(n, 0), SA_NONE, SA_SPACE);
        this.builder.startSpan(DTS_COST_CONSTRUCTOR_NAME);
        this.nest();
        this.v(this.f(n, 1));
        this.endSpan();
        this.visitArgumentList(this.f(n, 2), false);
        this.endSpan();
        this.unnest();
        return;
      case N_INTERPOLATION_EXPRESSION:
        this.builder.preventSplit();
        this.tok(this.f(n, 0));
        this.startSpan();
        this.v(this.f(n, 1));
        this.endSpan();
        this.tok(this.f(n, 2));
        this.builder.endPreventSplit();
        return;
      case N_INTERPOLATION_STRING:
      case N_SIMPLE_STRING_LITERAL:
        this.writeStringLiteral(this.f(n, 0));
        return;
      case N_IS_EXPRESSION:
        this.startSpan();
        this.nest();
        this.v(this.f(n, 0));
        this.soloSplit(DTS_COST_NORMAL);
        this.tok(this.f(n, 1));
        this.tok(this.f(n, 2));
        this.space();
        this.v(this.f(n, 3));
        this.unnest();
        this.endSpan();
        return;
      case N_LABEL:
        this.tok(this.f(n, 0));
        this.tok(this.f(n, 1));
        return;
      case N_LABELED_STATEMENT:
        this.visitNodes(this.items(this.f(n, 0)), SA_NONE, SA_NEWLINE, SA_NEWLINE);
        this.v(this.f(n, 1));
        return;
      case N_LIBRARY_DIRECTIVE:
        this.visitDirectiveMetadata(n);
        this.nest();
        this.tok(this.f(n, 1));
        this.visit(this.f(n, 2), SA_SPACE, SA_NONE);
        this.tok(this.f(n, 3));
        this.unnest();
        return;
      case N_LIST_LITERAL:
      case N_SET_OR_MAP_LITERAL:
        this.visitCollectionLiteral(this.f(n, 2), this.items(this.f(n, 3)), this.f(n, 4), this.f(n, 0), this.f(n, 1), true, false);
        return;
      case N_LIST_PATTERN:
      case N_MAP_PATTERN:
        this.visitCollectionLiteral(this.f(n, 1), this.items(this.f(n, 2)), this.f(n, 3), -1, this.f(n, 0), false, false);
        return;
      case N_LOGICAL_AND_PATTERN:
      case N_LOGICAL_OR_PATTERN:
        this.visitBinary(n, -1, true);
        return;
      case N_MAP_LITERAL_ENTRY:
        this.nest();
        this.v(this.f(n, 1));
        this.tok(this.f(n, 2));
        this.soloSplit(DTS_COST_NORMAL);
        this.v(this.f(n, 4));
        this.unnest();
        return;
      case N_MAP_PATTERN_ENTRY:
        this.nest();
        this.v(this.f(n, 0));
        this.tok(this.f(n, 1));
        this.soloSplit(DTS_COST_NORMAL);
        this.v(this.f(n, 2));
        this.unnest();
        return;
      case N_METHOD_DECLARATION:
        this.visitFunctionOrMethodDeclaration(
          this.f(n, 0),
          this.f(n, 1),
          this.f(n, 4),
          this.f(n, 2),
          this.f(n, 5),
          this.f(n, 6),
          this.f(n, 3),
          this.f(n, 7),
          this.f(n, 8),
          this.f(n, 9),
        );
        return;
      case N_METHOD_INVOCATION:
        this.visitMethodInvocation(n);
        return;
      case N_MIXIN_DECLARATION:
        this.visitMixinDeclaration(n);
        return;
      case N_NAME_WITH_TYPE_PARAMETERS:
        this.tok(this.f(n, 0));
        this.v(this.f(n, 1));
        return;
      case N_NAMED_ARGUMENT:
        this.visitNamedNode(this.f(n, 0), this.f(n, 1), this.f(n, 2), null);
        return;
      case N_NAMED_TYPE:
        if (this.f(n, 0) >= 0) {
          this.startSpan();
          this.tok(this.f(n, 0));
          this.soloZeroSplit();
          this.tok(this.f(n, 1));
          this.tok(this.f(n, 2));
          this.endSpan();
        } else {
          this.tok(this.f(n, 2));
        }
        this.v(this.f(n, 3));
        this.tok(this.f(n, 4));
        return;
      case N_NATIVE_CLAUSE:
        this.tok(this.f(n, 0));
        this.visit(this.f(n, 1), SA_SPACE, SA_NONE);
        return;
      case N_NATIVE_FUNCTION_BODY:
        this.nest();
        this.builder.nestExpression(DTS_INDENT_EXPRESSION, true);
        this.soloSplit(DTS_COST_NORMAL);
        this.tok(this.f(n, 0));
        this.visit(this.f(n, 1), SA_SPACE, SA_NONE);
        this.unnest();
        this.tok(this.f(n, 2));
        this.unnest();
        return;
      case N_NULL_ASSERT_PATTERN:
      case N_NULL_CHECK_PATTERN:
      case N_POSTFIX_EXPRESSION:
        this.v(this.f(n, 0));
        this.tok(this.f(n, 1));
        return;
      case N_OBJECT_PATTERN:
        this.v(this.f(n, 0));
        this.visitCollectionLiteral(this.f(n, 1), this.items(this.f(n, 2)), this.f(n, 3), -1, -1, false, false);
        return;
      case N_PARENTHESIZED_EXPRESSION:
      case N_PARENTHESIZED_PATTERN:
        this.nest();
        this.tok(this.f(n, 0));
        this.v(this.f(n, 1));
        this.unnest();
        this.tok(this.f(n, 2));
        return;
      case N_PART_DIRECTIVE:
        this.visitDirectiveMetadata(n);
        this.nest();
        this.tok(this.f(n, 1));
        this.space();
        this.v(this.f(n, 2));
        this.tok(this.f(n, 4));
        this.unnest();
        return;
      case N_PART_OF_DIRECTIVE:
        this.visitDirectiveMetadata(n);
        this.nest();
        this.tok(this.f(n, 1));
        this.space();
        this.tok(this.f(n, 2));
        this.space();
        this.v(this.f(n, 3));
        this.v(this.f(n, 4));
        this.tok(this.f(n, 5));
        this.unnest();
        return;
      case N_PATTERN_ASSIGNMENT:
        this.v(this.f(n, 0));
        this.visitAssignment(this.f(n, 1), this.f(n, 2), false);
        return;
      case N_PATTERN_FIELD: {
        const name = this.f(n, 0);
        if (name >= 0) {
          if (this.f(name, 0) >= 0) {
            this.visitNamedNodeTok(this.f(name, 0), this.f(name, 1), this.f(n, 1), null);
          } else {
            this.tok(this.f(name, 1));
            this.v(this.f(n, 1));
          }
        } else {
          this.v(this.f(n, 1));
        }
        return;
      }
      case N_PATTERN_VARIABLE_DECLARATION:
        this.visitMetadata(this.f(n, 0));
        this.nest();
        this.tok(this.f(n, 1));
        this.space();
        this.v(this.f(n, 2));
        this.visitAssignment(this.f(n, 3), this.f(n, 4), false);
        this.unnest();
        return;
      case N_PATTERN_VARIABLE_DECLARATION_STATEMENT:
        this.v(this.f(n, 0));
        this.tok(this.f(n, 1));
        return;
      case N_PREFIXED_IDENTIFIER:
        new DtsCallChain(this, n).visit();
        return;
      case N_PREFIX_EXPRESSION: {
        this.tok(this.f(n, 0));
        const operand = this.f(n, 1);
        if (this.kind(operand) === N_PREFIX_EXPRESSION) {
          const op = this.t.kind[this.f(operand, 0)];
          if (op === T_MINUS || op === T_DEC) {
            this.space();
          }
        }
        this.v(operand);
        return;
      }
      case N_PRIMARY_CONSTRUCTOR_DECLARATION:
        this.modifier(this.f(n, 0));
        this.tok(this.f(n, 1));
        this.v(this.f(n, 2));
        this.v(this.f(n, 3));
        this.v(this.f(n, 4));
        return;
      case N_PRIMARY_CONSTRUCTOR_BODY:
        this.visitMetadata(this.f(n, 0));
        this.tok(this.f(n, 1));
        if (this.len(this.f(n, 3)) > 0) {
          this.startRule();
          this.builder.indent(DTS_INDENT_CONSTRUCTOR_INITIALIZER);
          this.split();
          this.tok(this.f(n, 2));
          this.space();
          this.visitCommaSeparatedNodes(this.items(this.f(n, 3)), SA_SPACE);
          this.builder.unindent();
          this.endRule();
        }
        this.v(this.f(n, 4));
        return;
      case N_PRIMARY_CONSTRUCTOR_NAME:
        this.tok(this.f(n, 0));
        this.tok(this.f(n, 1));
        return;
      case N_PROPERTY_ACCESS:
        if (this.f(n, 0) < 0) {
          this.tok(this.f(n, 1));
          this.v(this.f(n, 2));
          return;
        }
        new DtsCallChain(this, n).visit();
        return;
      case N_REDIRECTING_CONSTRUCTOR_INVOCATION:
      case N_SUPER_CONSTRUCTOR_INVOCATION:
        this.startSpan();
        this.tok(this.f(n, 0));
        this.tok(this.f(n, 1));
        this.v(this.f(n, 2));
        this.v(this.f(n, 3));
        this.endSpan();
        return;
      case N_RECORD_LITERAL:
        this.modifier(this.f(n, 0));
        this.visitCollectionLiteral(this.f(n, 1), this.items(this.f(n, 2)), this.f(n, 3), -1, -1, false, true);
        return;
      case N_RECORD_LITERAL_NAMED_FIELD:
        this.visitNamedNode(this.f(n, 0), this.f(n, 1), this.f(n, 2), null);
        return;
      case N_RECORD_PATTERN:
        this.visitCollectionLiteral(this.f(n, 0), this.items(this.f(n, 1)), this.f(n, 2), -1, -1, false, true);
        return;
      case N_RECORD_TYPE_ANNOTATION:
        this.visitRecordType(n);
        return;
      case N_RECORD_TYPE_NAMED_FIELD:
      case N_RECORD_TYPE_POSITIONAL_FIELD: {
        const meta = this.f(n, 0);
        this.paramMetaBegin(meta);
        this.v(this.f(n, 1));
        this.token(this.f(n, 2), SA_SPACE, SA_NONE);
        this.paramMetaEnd(meta);
        return;
      }
      case N_RELATIONAL_PATTERN:
        this.tok(this.f(n, 0));
        this.space();
        this.v(this.f(n, 1));
        return;
      case N_REST_PATTERN_ELEMENT:
      case N_SPREAD_ELEMENT:
        this.tok(this.f(n, 0));
        this.v(this.f(n, 1));
        return;
      case N_RETURN_STATEMENT:
        this.nest();
        this.tok(this.f(n, 0));
        this.visit(this.f(n, 1), SA_SPACE, SA_NONE);
        this.tok(this.f(n, 2));
        this.unnest();
        return;
      case N_SCRIPT_TAG: {
        const tok = this.f(n, 0);
        this.writeText(dtTrimmed(this.src, this.t.start[tok], this.t.end[tok]), tok, true);
        this.twoNewlines();
        return;
      }
      case N_STRING_INTERPOLATION: {
        const l = this.f(n, 0);
        for (let i = 0; i < this.len(l); i++) {
          this.v(this.at(l, i));
        }
        return;
      }
      case N_SWITCH_EXPRESSION:
        this.visitSwitchExpression(n);
        return;
      case N_SWITCH_EXPRESSION_CASE:
        this.visitSwitchExpressionCase(n);
        return;
      case N_SWITCH_STATEMENT:
        this.visitSwitchStatement(n);
        return;
      case N_SYMBOL_LITERAL: {
        this.tok(this.f(n, 0));
        const l = this.f(n, 1);
        for (let i = 0; i < this.len(l); i++) {
          const c = this.at(l, i);
          if (this.t.kind[c - 1] === T_DOT) {
            this.tok(c - 1);
          }
          this.tok(c);
        }
        return;
      }
      case N_THROW_EXPRESSION:
        this.tok(this.f(n, 0));
        this.space();
        this.v(this.f(n, 1));
        return;
      case N_TOP_LEVEL_VARIABLE_DECLARATION:
        this.visitMetadata(this.f(n, 0));
        this.nest();
        this.modifier(this.f(n, 1));
        this.v(this.f(n, 2));
        this.tok(this.f(n, 3));
        this.unnest();
        return;
      case N_TRY_STATEMENT:
        this.tok(this.f(n, 0));
        this.space();
        this.v(this.f(n, 1));
        this.visitNodes(this.items(this.f(n, 2)), SA_SPACE, SA_SPACE, SA_NONE);
        this.token(this.f(n, 3), SA_SPACE, SA_SPACE);
        this.v(this.f(n, 4));
        return;
      case N_TYPE_ARGUMENT_LIST:
      case N_TYPE_PARAMETER_LIST:
        this.visitGenericList(this.f(n, 0), this.f(n, 2), this.items(this.f(n, 1)));
        return;
      case N_TYPE_PARAMETER: {
        const meta = this.f(n, 0);
        this.paramMetaBegin(meta);
        this.tok(this.f(n, 1));
        this.token(this.f(n, 2), SA_SPACE, SA_SPACE);
        this.v(this.f(n, 3));
        this.paramMetaEnd(meta);
        return;
      }
      case N_VARIABLE_DECLARATION: {
        this.tok(this.f(n, 0));
        if (this.f(n, 2) < 0) {
          return;
        }
        const multiple = this.len(this.f(this.parent[n], 4)) > 1;
        this.visitAssignment(this.f(n, 1), this.f(n, 2), multiple);
        return;
      }
      case N_VARIABLE_DECLARATION_LIST:
        this.visitVariableDeclarationList(n);
        return;
      case N_VARIABLE_DECLARATION_STATEMENT:
        this.nest();
        this.v(this.f(n, 0));
        this.tok(this.f(n, 1));
        this.unnest();
        return;
      case N_WHILE_STATEMENT:
        this.nest();
        this.tok(this.f(n, 0));
        this.space();
        this.tok(this.f(n, 1));
        this.soloZeroSplit();
        this.v(this.f(n, 2));
        this.tok(this.f(n, 3));
        this.unnest();
        this.visitLoopBody(this.f(n, 4));
        return;
      case N_YIELD_STATEMENT:
        this.nest();
        this.tok(this.f(n, 0));
        this.tok(this.f(n, 1));
        this.space();
        this.v(this.f(n, 2));
        this.tok(this.f(n, 3));
        this.unnest();
        return;
      default:
        this.fail(`no short-style visit for ${dtNodeName(this.kind(n))}`);
        return;
    }
  }

  visitAdjacentStrings(n: i32): void {
    let shouldNest = true;
    const p = this.parent[n];
    const pk = this.kind(p);
    if (pk === N_ARGUMENT_LIST) {
      shouldNest = false;
      const args = this.f(p, 1);
      for (let i = 0; i < this.len(args); i++) {
        const arg = this.at(args, i);
        if (arg === n) {
          continue;
        }
        if (this.isStringLiteral(arg)) {
          shouldNest = true;
          break;
        }
      }
    } else if (pk === N_ASSERT_INITIALIZER || pk === N_ASSERT_STATEMENT) {
      shouldNest = false;
      const c = this.f(p, 2);
      const m = this.f(p, 4);
      if (c !== n && this.isStringLiteral(c)) {
        shouldNest = true;
      }
      if (m !== n && m >= 0 && this.isStringLiteral(m)) {
        shouldNest = true;
      }
    } else if (
      pk === N_VARIABLE_DECLARATION ||
      (pk === N_ASSIGNMENT_EXPRESSION && this.f(p, 2) === n && this.kind(this.parent[p]) === N_EXPRESSION_STATEMENT)
    ) {
      shouldNest = false;
    } else if (pk === N_NAMED_ARGUMENT || pk === N_EXPRESSION_FUNCTION_BODY) {
      shouldNest = false;
    }
    this.startSpan();
    this.startRule();
    if (shouldNest) {
      this.nest();
    }
    this.visitNodes(this.items(this.f(n, 0)), SA_NONE, SA_SPLIT_OR_NEWLINE, SA_NONE);
    if (shouldNest) {
      this.unnest();
    }
    this.endRule();
    this.endSpan();
  }

  visitArgumentList(n: i32, nestExpression: boolean): void {
    const lp = this.f(n, 0);
    const rp = this.f(n, 2);
    const args = this.items(this.f(n, 1));
    if (args.length === 0) {
      this.tok(lp);
      if (this.hasComments(rp)) {
        this.soloZeroSplit();
      }
      this.tok(rp);
      return;
    }
    if (this.listHasCommaAfter(args)) {
      this.visitCollectionLiteral(lp, args, rp, -1, -1, false, false);
      return;
    }
    if (nestExpression) {
      this.nest();
    }
    new DtsArgList(this, lp, rp, args).visit();
    if (nestExpression) {
      this.unnest();
    }
  }

  visitAssert(n: i32, statement: boolean): void {
    if (statement) {
      this.nest();
    }
    this.tok(this.f(n, 0));
    const args: i32[] = [this.f(n, 2)];
    if (this.f(n, 4) >= 0) {
      args.push(this.f(n, 4));
    }
    if (this.listHasCommaAfter(args)) {
      this.visitCollectionLiteral(this.f(n, 1), args, this.f(n, 5), -1, -1, false, false);
    } else {
      if (!statement) {
        this.nest();
      }
      new DtsArgList(this, this.f(n, 1), this.f(n, 5), args).visit();
      if (!statement) {
        this.unnest();
      }
    }
    if (statement) {
      this.tok(this.f(n, 6));
      this.unnest();
    }
  }

  visitBlockEnumBody(n: i32): void {
    this.beginBody(this.f(n, 0), true);
    const constants = this.items(this.f(n, 1));
    this.visitCommaSeparatedNodes(constants, SA_SPLIT_OR_TWO);
    if (constants.length === 0) {
      this.fail("enum without constants");
      return;
    }
    const lastConst = constants[constants.length - 1];
    const trailingComma = this.commaAfter(lastConst);
    if (trailingComma >= 0) {
      this.builder.forceRules();
    }
    const afterConstants = this.a.end[lastConst] + 1;
    let semicolon = -1;
    if (this.t.kind[afterConstants] === T_SEMI) {
      semicolon = afterConstants;
    } else if (trailingComma >= 0 && this.t.kind[trailingComma + 1] === T_SEMI) {
      semicolon = afterConstants + 1;
    }
    const members = this.items(this.f(n, 3));
    if (semicolon >= 0) {
      if (trailingComma >= 0) {
        this.newline();
      }
      this.tok(semicolon);
      if (members.length > 0) {
        this.twoNewlines();
      }
    }
    this.visitBodyContents(members);
    this.endBody(
      this.f(n, 4),
      semicolon >= 0 || trailingComma >= 0 || members.length > 0 || this.containsLineComments(constants, -1),
    );
  }

  visitCascade(n: i32): void {
    const sections = this.items(this.f(n, 1));
    if (sections.length > 1) {
      this.visitSplitCascade(n, sections);
      return;
    }
    const target = this.f(n, 0);
    let splitIfTargetSplits = true;
    const tk = this.kind(target);
    if (this.isCollectionLiteral(target)) {
      splitIfTargetSplits = false;
    } else if (tk === N_METHOD_INVOCATION || tk === N_FUNCTION_EXPRESSION_INVOCATION || tk === N_INSTANCE_CREATION_EXPRESSION) {
      const al = tk === N_METHOD_INVOCATION ? this.f(target, 4) : this.f(target, 2);
      splitIfTargetSplits = !this.listHasCommaAfter(this.items(this.f(al, 1)));
    }
    if (splitIfTargetSplits) {
      this.builder.startLazyRule(this.allowInline(n) ? dtsRule(DTS_COST_NORMAL) : dtsHardRule());
    }
    this.v(target);
    this.builder.nestExpression(DTS_INDENT_CASCADE, true);
    this.builder.startBlockArgumentNesting();
    if (!splitIfTargetSplits) {
      this.builder.startRule(this.allowInline(n) ? dtsRule(DTS_COST_NORMAL) : dtsHardRule());
    }
    this.zeroSplit();
    if (!splitIfTargetSplits) {
      this.endRule();
    }
    this.visitNodes(sections, SA_NONE, SA_ZERO_SPLIT, SA_NONE);
    if (splitIfTargetSplits) {
      this.endRule();
    }
    this.builder.endBlockArgumentNesting();
    this.unnest();
  }

  visitSplitCascade(n: i32, sections: i32[]): void {
    this.builder.startLazyRule(dtsHardRule());
    this.v(this.f(n, 0));
    this.builder.nestExpression(DTS_INDENT_CASCADE, true);
    this.builder.startBlockArgumentNesting();
    const firstTok = this.a.beg[sections[0]];
    this.writePrecedingCommentsAndNewlines(firstTok);
    this.suppressed[firstTok] = true;
    this.builder = this.builder.startBlock(null, false, false);
    for (let i = 0; i < sections.length - 1; i++) {
      this.newline();
      this.v(sections[i]);
    }
    const lastTok = this.a.beg[sections[sections.length - 1]];
    this.writePrecedingCommentsAndNewlines(lastTok);
    this.suppressed[lastTok] = true;
    this.builder = this.builder.endBlock(true);
    this.v(sections[sections.length - 1]);
    this.endRule();
    this.builder.endBlockArgumentNesting();
    this.unnest();
  }

  visitCatchClause(n: i32): void {
    this.token(this.f(n, 0), SA_NONE, SA_SPACE);
    this.v(this.f(n, 1));
    if (this.f(n, 2) >= 0) {
      if (this.f(n, 1) >= 0) {
        this.space();
      }
      this.tok(this.f(n, 2));
      this.space();
      this.tok(this.f(n, 3));
      this.v(this.f(n, 4));
      this.token(this.f(n, 5), SA_NONE, SA_SPACE);
      this.v(this.f(n, 6));
      this.tok(this.f(n, 7));
      this.space();
    } else {
      this.space();
    }
    this.v(this.f(n, 8));
  }

  visitClassDeclaration(n: i32): void {
    this.visitMetadata(this.f(n, 0));
    this.nest();
    for (let i = 1; i <= 6; i++) {
      this.modifier(this.f(n, i));
    }
    this.tok(this.f(n, 7));
    this.space();
    this.v(this.f(n, 8));
    this.v(this.f(n, 9));
    this.visitClauses(this.f(n, 10), this.f(n, 11));
    this.visit(this.f(n, 12), SA_SPACE, SA_NONE);
    if (this.kind(this.f(n, 13)) !== N_EMPTY_CLASS_BODY) {
      this.space();
    }
    this.unnest();
    this.v(this.f(n, 13));
  }

  visitClassTypeAlias(n: i32): void {
    this.visitMetadata(this.f(n, 0));
    this.nest();
    for (let i = 1; i <= 6; i++) {
      this.modifier(this.f(n, i));
    }
    this.tok(this.f(n, 7));
    this.space();
    this.tok(this.f(n, 8));
    this.v(this.f(n, 9));
    this.space();
    this.tok(this.f(n, 10));
    this.space();
    this.v(this.f(n, 11));
    this.visitClauses(this.f(n, 12), this.f(n, 13));
    this.tok(this.f(n, 14));
    this.unnest();
  }

  visitCompilationUnit(n: i32): void {
    this.v(this.f(n, 0));
    let directives = this.items(this.f(n, 1));
    if (directives.length > 0 && this.kind(directives[0]) === N_LIBRARY_DIRECTIVE) {
      this.v(directives[0]);
      this.twoNewlines();
      directives = directives.slice(1, directives.length);
    }
    this.visitNodes(directives, SA_NONE, SA_ONE_OR_TWO, SA_NONE);
    let needsDouble = true;
    const decls = this.items(this.f(n, 2));
    for (const d of decls) {
      const k = this.kind(d);
      const hasBody = k === N_CLASS_DECLARATION || k === N_ENUM_DECLARATION || k === N_EXTENSION_DECLARATION;
      if (hasBody) {
        needsDouble = true;
      }
      if (needsDouble) {
        this.twoNewlines();
      } else {
        this.oneOrTwoNewlines();
      }
      this.v(d);
      needsDouble = false;
      if (hasBody) {
        needsDouble = true;
      } else if (k === N_FUNCTION_DECLARATION) {
        const body = this.f(this.f(d, 5), 2);
        if (this.kind(body) === N_BLOCK_FUNCTION_BODY) {
          needsDouble = this.len(this.f(this.f(body, 2), 1)) > 0;
        }
      }
    }
  }

  visitConditional(n: i32): void {
    this.nest();
    this.startLazyRule();
    this.v(this.f(n, 0));
    this.builder.nestExpression(DTS_INDENT_BLOCK, true);
    this.builder.startBlockArgumentNesting();
    this.unnest();
    this.startSpan();
    this.split();
    this.tok(this.f(n, 1));
    this.space();
    this.nest();
    this.v(this.f(n, 2));
    this.unnest();
    this.split();
    this.tok(this.f(n, 3));
    this.space();
    this.v(this.f(n, 4));
    if (this.kind(this.parent[n]) === N_CONDITIONAL_EXPRESSION) {
      this.builder.forceRules();
    }
    this.endRule();
    this.endSpan();
    this.builder.endBlockArgumentNesting();
    this.unnest();
  }

  visitConstructorDeclaration(n: i32): void {
    this.visitMetadata(this.f(n, 0));
    this.modifier(this.f(n, 1));
    this.modifier(this.f(n, 2));
    this.modifier(this.f(n, 4));
    this.modifier(this.f(n, 3));
    this.v(this.f(n, 5));
    this.tok(this.f(n, 6));
    this.tok(this.f(n, 7));
    const inits = this.items(this.f(n, 10));
    if (inits.length > 0) {
      this.startRule();
    }
    if (this.f(n, 11) >= 0) {
      this.nest();
    }
    this.visitFunctionBody(-1, this.f(n, 8), this.f(n, 12), FB_CONSTRUCTOR, n);
  }

  /** _visitFunctionBody's beforeBody for constructors. */
  constructorBeforeBody(n: i32): void {
    const inits = this.items(this.f(n, 10));
    if (this.f(n, 11) >= 0) {
      this.token(this.f(n, 9), SA_SPACE, SA_NONE);
      this.soloSplit(DTS_COST_NORMAL);
      this.visitCommaSeparatedNodes(inits, SA_SPACE);
      this.v(this.f(n, 11));
      this.unnest();
    } else if (inits.length > 0) {
      this.visitConstructorInitializers(n, inits);
      this.endRule();
    }
  }

  visitConstructorInitializers(n: i32, inits: i32[]): void {
    const params = this.items(this.f(this.f(n, 8), 1));
    const hasTrailingComma = this.listHasCommaAfter(params);
    if (hasTrailingComma) {
      this.space();
      if (inits.length > 1) {
        let padding = "  ";
        if (this.isOptionalParam(params[params.length - 1])) {
          padding = " ";
        }
        this.writeText(padding, this.f(n, 9), true);
      }
      this.tok(this.f(n, 9));
      this.space();
      this.builder.indent(6);
    } else {
      this.builder.indent(DTS_INDENT_CONSTRUCTOR_INITIALIZER);
      this.split();
      this.tok(this.f(n, 9));
      this.space();
      this.builder.indent(2);
    }
    for (let i = 0; i < inits.length; i++) {
      if (i > 0) {
        this.tok(this.a.beg[inits[i]] - 1);
        this.newline();
      }
      this.v(inits[i]);
    }
    this.builder.unindent();
    if (!hasTrailingComma) {
      this.builder.unindent();
    }
  }

  visitExpressionFunctionBody(n: i32): void {
    this.space();
    this.tok(this.f(n, 0));
    this.tok(this.f(n, 1));
    if (this.f(n, 0) >= 0 || this.f(n, 1) >= 0) {
      this.space();
    }
    const fnBody = this.isFunctionExpressionBody(n);
    if (fnBody) {
      this.startSpan();
    }
    this.tok(this.f(n, 2));
    this.split();
    const e = this.f(n, 3);
    const isBinary = this.kind(e) === N_BINARY_EXPRESSION;
    if (!isBinary) {
      this.endRule();
    }
    if (fnBody) {
      this.endSpan();
    }
    let isArgWithTrailingComma = false;
    const p = this.parent[n];
    if (this.kind(p) === N_FUNCTION_EXPRESSION) {
      isArgWithTrailingComma = this.isTrailingCommaArgument(p);
    }
    if (!isArgWithTrailingComma) {
      this.builder.startBlockArgumentNesting();
    }
    this.startSpan();
    this.v(e);
    this.endSpan();
    if (!isArgWithTrailingComma) {
      this.builder.endBlockArgumentNesting();
    }
    if (isBinary) {
      this.endRule();
    }
    this.tok(this.f(n, 4));
  }

  visitExtensionDeclaration(n: i32): void {
    this.visitMetadata(this.f(n, 0));
    this.nest();
    this.tok(this.f(n, 1));
    this.token(this.f(n, 3), SA_SPACE, SA_NONE);
    this.v(this.f(n, 4));
    const on = this.f(n, 5);
    if (on >= 0) {
      this.soloSplit(DTS_COST_NORMAL);
      this.tok(this.f(on, 0));
      this.space();
      this.v(this.at(this.f(on, 1), 0));
    }
    if (this.kind(this.f(n, 6)) !== N_EMPTY_CLASS_BODY) {
      this.space();
    }
    this.unnest();
    this.v(this.f(n, 6));
  }

  visitFieldOrSuperParameter(n: i32): void {
    const meta = this.f(n, 0);
    this.paramMetaBegin(meta);
    this.beginFormalParameter(n);
    this.token(this.f(n, 3), SA_NONE, SA_SPACE);
    if (this.kind(n) === N_FIELD_FORMAL_PARAMETER) {
      this.v(this.f(n, 4));
      this.separatorBetweenTypeAndVariable(this.f(n, 4), false);
    } else {
      this.visit(this.f(n, 4), SA_NONE, SA_SPLIT);
    }
    this.tok(this.f(n, 5));
    this.tok(this.f(n, 6));
    this.tok(this.f(n, 7));
    const suffix = this.f(n, 8);
    if (suffix >= 0) {
      this.v(this.f(suffix, 0));
      this.v(this.f(suffix, 1));
      this.tok(this.f(suffix, 2));
    }
    this.endFormalParameter();
    this.v(this.f(n, 9));
    this.paramMetaEnd(meta);
  }

  visitRegularParameter(n: i32): void {
    const meta = this.f(n, 0);
    this.paramMetaBegin(meta);
    const suffix = this.f(n, 8);
    if (suffix >= 0) {
      this.modifier(this.f(n, 1));
      this.modifier(this.f(n, 2));
      this.visit(this.f(n, 4), SA_NONE, SA_SPACE);
      this.startSpan();
      this.tok(this.f(n, 7));
      this.visitParameterSignature(this.f(suffix, 0), this.f(suffix, 1));
      this.tok(this.f(suffix, 2));
      this.endSpan();
      this.v(this.f(n, 9));
    } else {
      this.beginFormalParameter(n);
      this.modifier(this.f(n, 3));
      this.v(this.f(n, 4));
      if (this.f(n, 7) >= 0) {
        this.separatorBetweenTypeAndVariable(this.f(n, 4), false);
      }
      this.tok(this.f(n, 7));
      this.endFormalParameter();
      this.v(this.f(n, 9));
    }
    this.paramMetaEnd(meta);
  }

  visitFormalParameterList(n: i32, nestExpression: boolean): void {
    const lp = this.f(n, 0);
    const rp = this.f(n, 4);
    const params = this.items(this.f(n, 1));
    if (params.length === 0) {
      this.tok(lp);
      if (this.hasComments(rp)) {
        this.soloZeroSplit();
      }
      this.tok(rp);
      return;
    }
    if (this.listHasCommaAfter(params)) {
      this.visitTrailingCommaParameterList(n, params);
      return;
    }
    const required: i32[] = [];
    const optional: i32[] = [];
    for (const p of params) {
      if (this.isOptionalParam(p)) {
        optional.push(p);
      } else {
        required.push(p);
      }
    }
    if (nestExpression) {
      this.nest();
    }
    this.tok(lp);
    let rule: DtsRule | null = null;
    if (required.length > 0) {
      const r = dtsPositionalRule(null, toI32(required.length), 0, 0);
      rule = r;
      this.builder.startRule(r);
      if (this.isFunctionExpressionBody(n)) {
        r.beforeArgument(this.cx.nullChunk);
      } else {
        r.beforeArgument(this.zeroSplit());
      }
      this.builder.startBlockArgumentNesting();
      this.startSpan();
      for (let i = 0; i < required.length; i++) {
        const p = required[i];
        this.v(p);
        this.writeCommaAfter(p);
        if (i < required.length - 1) {
          r.beforeArgument(this.split());
        }
      }
      this.builder.endBlockArgumentNesting();
      this.endSpan();
      this.endRule();
    }
    if (optional.length > 0) {
      const namedRule = dtsNamedRule(null, 0, 0);
      if (rule !== null) {
        rule.addNamedArgsConstraints(namedRule);
      }
      this.builder.startRule(namedRule);
      this.builder.startBlockArgumentNesting();
      namedRule.beforeArgument(this.builder.split(true, required.length > 0));
      this.tok(this.f(n, 2));
      for (let i = 0; i < optional.length; i++) {
        const p = optional[i];
        this.v(p);
        this.writeCommaAfter(p);
        if (i < optional.length - 1) {
          namedRule.beforeArgument(this.split());
        }
      }
      this.builder.endBlockArgumentNesting();
      this.endRule();
      this.tok(this.f(n, 3));
    }
    this.tok(rp);
    if (nestExpression) {
      this.unnest();
    }
  }

  visitTrailingCommaParameterList(n: i32, params: i32[]): void {
    this.builder.startRule(dtsHardRule());
    this.tok(this.f(n, 0));
    let lastRequired = -1;
    for (let i = 0; i < params.length; i++) {
      if (this.isOptionalParam(params[i])) {
        if (i > 0) {
          lastRequired = params[i - 1];
        }
        break;
      }
    }
    if (this.isOptionalParam(params[0])) {
      this.tok(this.f(n, 2));
    }
    this.builder = this.builder.startBlock(null, true, false);
    for (const p of params) {
      this.builder.writeNewline(false, false, false);
      this.v(p);
      this.writeCommaAfter(p);
      if (p === lastRequired) {
        this.space();
        this.tok(this.f(n, 2));
        lastRequired = -1;
      }
    }
    const rightDelim = this.f(n, 3);
    const firstDelimiter = rightDelim >= 0 ? rightDelim : this.f(n, 4);
    if (this.hasComments(firstDelimiter)) {
      this.builder.writeNewline(false, false, false);
      this.writePrecedingCommentsAndNewlines(firstDelimiter);
    }
    this.builder = this.builder.endBlock(true);
    this.endRule();
    this.writeText(this.lex(firstDelimiter), firstDelimiter, true);
    if (firstDelimiter !== this.f(n, 4)) {
      this.tok(this.f(n, 4));
    }
  }

  beginFormalParameter(n: i32): void {
    this.builder.startLazyRule(dtsRule(DTS_COST_PARAMETER_TYPE));
    this.nest();
    this.modifier(this.f(n, 1));
    this.modifier(this.f(n, 2));
  }

  endFormalParameter(): void {
    this.unnest();
    this.endRule();
  }

  visitForElement(n: i32): void {
    const body = this.f(n, 5);
    const isSpreadBody = this.isSpreadCollection(body);
    this.nest();
    this.token(this.f(n, 0), SA_NONE, SA_SPACE);
    this.tok(this.f(n, 1));
    this.space();
    this.tok(this.f(n, 2));
    this.startRule();
    this.startRule();
    this.v(this.f(n, 3));
    this.tok(this.f(n, 4));
    this.endRule();
    this.unnest();
    this.builder.nestExpression(DTS_INDENT_BLOCK, true);
    if (isSpreadBody) {
      this.space();
    } else {
      this.split();
      this.builder.startBlockArgumentNesting();
    }
    this.v(body);
    if (!isSpreadBody) {
      this.builder.endBlockArgumentNesting();
    }
    this.unnest();
    if (this.isControlFlowElement(body)) {
      this.builder.forceRules();
    }
    this.endRule();
  }

  visitForEachPartsFromIn(n: i32): void {
    this.soloSplit(DTS_COST_NORMAL);
    this.tok(this.f(n, 1));
    this.space();
    this.v(this.f(n, 2));
  }

  visitForPartsFromLeftSeparator(n: i32): void {
    this.tok(this.f(n, 1));
    if (this.f(n, 2) >= 0) {
      this.split();
    }
    this.v(this.f(n, 2));
    this.tok(this.f(n, 3));
    const updaters = this.items(this.f(n, 4));
    if (updaters.length > 0) {
      this.split();
      this.startRule();
      this.visitCommaSeparatedNodes(updaters, SA_SPLIT);
      this.endRule();
    }
  }

  visitIfElement(n: i32): void {
    const ifElements: i32[] = [];
    let node = n;
    while (node >= 0 && this.kind(node) === N_IF_ELEMENT) {
      ifElements.push(node);
      node = this.f(node, 7);
    }
    const spreadRule = dtsRule(DTS_COST_NORMAL);
    const spreadElements: i32[] = [];
    for (const e of ifElements) {
      const bracket = this.spreadCollectionBracket(this.f(e, 5));
      if (bracket >= 0) {
        spreadElements.push(e);
        this.beforeBlock(bracket, spreadRule, null);
      }
    }
    const lastIf = ifElements[ifElements.length - 1];
    const lastElse = this.f(lastIf, 7);
    if (lastElse >= 0) {
      const bracket = this.spreadCollectionBracket(lastElse);
      if (bracket >= 0) {
        spreadElements.push(lastElse);
        this.beforeBlock(bracket, spreadRule, null);
      }
    }
    this.startLazyRule();
    let hasInnerControlFlow = false;
    for (const e of ifElements) {
      this.visitIfCondition(this.f(e, 0), this.f(e, 1), this.f(e, 2), this.f(e, 3), this.f(e, 4));
      const then = this.f(e, 5);
      this.visitIfChild(e, then, spreadElements);
      if (this.isControlFlowElement(then)) {
        hasInnerControlFlow = true;
      }
      if (this.f(e, 7) >= 0) {
        if (spreadElements.indexOf(e) >= 0) {
          this.space();
        } else {
          this.split();
        }
        this.tok(this.f(e, 6));
        if (e !== lastIf) {
          this.space();
        }
      }
    }
    if (lastElse >= 0) {
      this.visitIfChild(lastElse, lastElse, spreadElements);
      if (this.isControlFlowElement(lastElse)) {
        hasInnerControlFlow = true;
      }
    }
    if (hasInnerControlFlow) {
      this.builder.forceRules();
    }
    this.endRule();
  }

  visitIfChild(element: i32, child: i32, spreadElements: i32[]): void {
    this.builder.nestExpression(2, true);
    const isSpread = spreadElements.indexOf(element) >= 0;
    if (isSpread) {
      this.space();
    } else {
      this.split();
      this.builder.startBlockArgumentNesting();
    }
    this.v(child);
    if (!isSpread) {
      this.builder.endBlockArgumentNesting();
    }
    this.unnest();
  }

  visitIfStatement(n: i32): void {
    this.visitIfCondition(this.f(n, 0), this.f(n, 1), this.f(n, 2), this.f(n, 3), this.f(n, 4));
    const hasElse = this.f(n, 7) >= 0;
    this.visitIfClause(this.f(n, 5), hasElse);
    if (hasElse) {
      if (this.kind(this.f(n, 5)) === N_BLOCK) {
        this.space();
      } else {
        this.newline();
      }
      this.tok(this.f(n, 6));
      this.visitIfClause(this.f(n, 7), hasElse);
    }
  }

  visitIfClause(clause: i32, hasElse: boolean): void {
    const k = this.kind(clause);
    if (k === N_BLOCK || k === N_IF_STATEMENT) {
      this.space();
      this.v(clause);
    } else {
      this.builder.indent(DTS_INDENT_BLOCK);
      this.startRule();
      if (hasElse) {
        this.builder.writeNewline(false, false, false);
      } else {
        this.builder.split(false, true);
      }
      this.v(clause);
      this.endRule();
      this.builder.unindent();
    }
  }

  visitImportOrExport(n: i32): void {
    this.visitDirectiveMetadata(n);
    this.nest();
    this.tok(this.f(n, 1));
    this.space();
    this.v(this.f(n, 2));
    this.visitConfigurations(this.items(this.f(n, 3)));
    if (this.f(n, 5) >= 0) {
      this.soloSplit(DTS_COST_NORMAL);
      this.token(this.f(n, 4), SA_NONE, SA_SPACE);
      this.tok(this.f(n, 5));
      this.space();
      this.v(this.f(n, 6));
    }
    this.builder.startRule(dtsCombinatorRule());
    this.visitNodes(this.items(this.f(n, 7)), SA_NONE, SA_NONE, SA_NONE);
    this.endRule();
    this.tok(this.f(n, 8));
    this.unnest();
  }

  finishIndexExpression(n: i32): void {
    if (this.kind(this.f(n, 0)) === N_INDEX_EXPRESSION) {
      this.soloZeroSplit();
    }
    this.builder.startSpan(DTS_COST_INDEX);
    this.tok(this.f(n, 2));
    this.tok(this.f(n, 3));
    this.soloZeroSplit();
    this.v(this.f(n, 4));
    this.tok(this.f(n, 5));
    this.endSpan();
  }

  visitMethodInvocation(n: i32): void {
    const target = this.f(n, 0);
    if (target < 0 || this.looksLikeStaticCall(n)) {
      this.nest();
      this.startSpan();
      if (target >= 0) {
        this.builder.startSpan(DTS_COST_CONSTRUCTOR_NAME);
        this.v(target);
        this.soloZeroSplit();
      }
      this.tok(this.f(n, 1));
      this.v(this.f(n, 2));
      if (target >= 0) {
        this.endSpan();
      }
      this.nest();
      this.v(this.f(n, 3));
      this.visitArgumentList(this.f(n, 4), false);
      this.unnest();
      this.endSpan();
      this.unnest();
      return;
    }
    new DtsCallChain(this, n).visit();
  }

  visitMixinDeclaration(n: i32): void {
    this.visitMetadata(this.f(n, 0));
    this.nest();
    this.modifier(this.f(n, 1));
    this.tok(this.f(n, 2));
    this.space();
    this.tok(this.f(n, 3));
    this.v(this.f(n, 4));
    const on = this.f(n, 5);
    const nOn = on >= 0 ? this.len(this.f(on, 1)) : 0;
    if (on >= 0 && nOn === 1) {
      this.soloSplit(DTS_COST_NORMAL);
      this.tok(this.f(on, 0));
      this.space();
      this.v(this.at(this.f(on, 1), 0));
    }
    this.builder.startRule(dtsCombinatorRule());
    if (on >= 0 && nOn > 1) {
      this.v(on);
    }
    this.v(this.f(n, 6));
    this.endRule();
    if (this.kind(this.f(n, 7)) !== N_EMPTY_CLASS_BODY) {
      this.space();
    }
    this.unnest();
    this.v(this.f(n, 7));
  }

  visitRecordType(n: i32): void {
    const positional = this.items(this.f(n, 1));
    const named = this.f(n, 2);
    const rp = this.f(n, 3);
    if (positional.length === 0 && named < 0) {
      this.tok(this.f(n, 0));
      if (this.hasComments(rp)) {
        this.soloZeroSplit();
      }
      this.tok(rp);
      this.tok(this.f(n, 4));
      return;
    }
    this.tok(this.f(n, 0));
    this.startRule();
    if (positional.length === 0) {
      this.tok(this.f(named, 0));
    }
    this.builder = this.builder.startBlock(null, true, false);
    for (let i = 0; i < positional.length; i++) {
      this.builder.split(false, i > 0);
      this.v(positional[i]);
      this.writeCommaAfter(positional[i]);
    }
    let firstClosing = rp;
    let namedFields: i32[] = [];
    if (named >= 0) {
      if (positional.length > 0) {
        this.space();
        this.tok(this.f(named, 0));
      }
      namedFields = this.items(this.f(named, 1));
      for (let i = 0; i < namedFields.length; i++) {
        this.builder.split(false, i > 0);
        this.v(namedFields[i]);
        this.writeCommaAfter(namedFields[i]);
      }
      firstClosing = this.f(named, 2);
    }
    if (this.hasComments(firstClosing)) {
      this.newline();
      this.writePrecedingCommentsAndNewlines(firstClosing);
    }
    let force = false;
    if (named < 0) {
      force = positional.length > 1 && this.hasCommaAfter(positional[positional.length - 1]);
    } else {
      force = namedFields.length > 0 && this.hasCommaAfter(namedFields[namedFields.length - 1]);
    }
    this.builder = this.builder.endBlock(force);
    this.endRule();
    this.writeText(this.lex(firstClosing), firstClosing, true);
    if (named >= 0) {
      this.tok(rp);
    }
    this.tok(this.f(n, 4));
  }

  visitSwitchExpression(n: i32): void {
    const cases = this.items(this.f(n, 5));
    const rb = this.f(n, 6);
    if (!this.canSplit(cases, rb)) {
      this.visitSwitchValue(this.f(n, 0), this.f(n, 1), this.f(n, 2), this.f(n, 3));
      this.tok(this.f(n, 4));
      this.tok(rb);
      return;
    }
    this.startRule();
    this.visitSwitchValue(this.f(n, 0), this.f(n, 1), this.f(n, 2), this.f(n, 3));
    this.tok(this.f(n, 4));
    this.builder = this.builder.startBlock(null, true, cases.length > 0);
    this.visitCommaSeparatedNodes(cases, SA_SPLIT);
    const hasTrailingComma = cases.length > 0 && this.commaAfter(cases[cases.length - 1]) >= 0;
    const forceSplit = this.containsLineComments(cases, rb);
    this.endBody(rb, hasTrailingComma || forceSplit);
  }

  visitSwitchExpressionCase(n: i32): void {
    const orBranches: i32[] = [];
    const orTokens: i32[] = [];
    const gp = this.f(n, 0);
    this.flattenOr(this.f(gp, 0), orBranches, orTokens);
    this.startLazyRule();
    for (let i = 0; i < orBranches.length - 1; i++) {
      this.v(orBranches[i]);
      this.space();
      this.tok(orTokens[i]);
      this.split();
    }
    this.builder.nestExpression(DTS_INDENT_BLOCK, false);
    const when = this.f(gp, 1);
    if (when >= 0) {
      this.startLazyRule();
      this.builder.nestExpression(DTS_INDENT_BLOCK, false);
    }
    this.v(orBranches[orBranches.length - 1]);
    if (when >= 0) {
      this.split();
      this.builder.startBlockArgumentNesting();
      this.visitWhenClause(when);
      this.builder.endBlockArgumentNesting();
      this.unnest();
      this.endRule();
    }
    this.space();
    this.tok(this.f(n, 1));
    this.split();
    this.endRule();
    this.builder.startBlockArgumentNesting();
    this.v(this.f(n, 2));
    this.builder.endBlockArgumentNesting();
    this.unnest();
  }

  flattenOr(e: i32, branches: i32[], tokens: i32[]): void {
    if (this.kind(e) !== N_LOGICAL_OR_PATTERN) {
      branches.push(e);
    } else {
      this.flattenOr(this.f(e, 0), branches, tokens);
      tokens.push(this.f(e, 1));
      this.flattenOr(this.f(e, 2), branches, tokens);
    }
  }

  visitSwitchStatement(n: i32): void {
    this.visitSwitchValue(this.f(n, 0), this.f(n, 1), this.f(n, 2), this.f(n, 3));
    this.beginBody(this.f(n, 4), false);
    const members = this.items(this.f(n, 5));
    for (const m of members) {
      const mk = this.kind(m);
      this.visitNodes(this.items(this.f(m, 0)), SA_NONE, SA_NEWLINE, SA_NEWLINE);
      this.tok(this.f(m, 1));
      let colon = -1;
      let stmts: i32[] = [];
      if (mk === N_SWITCH_CASE) {
        this.space();
        this.v(this.f(m, 2));
        colon = this.f(m, 3);
        stmts = this.items(this.f(m, 4));
      } else if (mk === N_SWITCH_PATTERN_CASE) {
        this.space();
        const gp = this.f(m, 2);
        const when = this.f(gp, 1);
        if (when < 0) {
          this.builder.indent(DTS_INDENT_BLOCK);
          this.v(this.f(gp, 0));
          this.builder.unindent();
        } else {
          this.startRule();
          this.nest();
          this.builder.startBlockArgumentNesting();
          this.v(this.f(gp, 0));
          this.split();
          this.visitWhenClause(when);
          this.builder.endBlockArgumentNesting();
          this.unnest();
          this.endRule();
        }
        colon = this.f(m, 3);
        stmts = this.items(this.f(m, 4));
      } else {
        colon = this.f(m, 2);
        stmts = this.items(this.f(m, 3));
      }
      this.tok(colon);
      if (stmts.length > 0) {
        this.builder.indent(DTS_INDENT_BLOCK);
        this.newline();
        this.visitNodes(stmts, SA_NONE, SA_ONE_OR_TWO, SA_NONE);
        this.builder.unindent();
        this.oneOrTwoNewlines();
      } else {
        this.builder.writeNewline(false, false, false);
      }
    }
    if (members.length > 0) {
      this.newline();
    }
    this.endBody(this.f(n, 6), members.length > 0);
  }

  visitSwitchValue(sw: i32, lp: i32, value: i32, rp: i32): void {
    this.nest();
    this.tok(sw);
    this.space();
    this.tok(lp);
    this.soloZeroSplit();
    this.v(value);
    this.tok(rp);
    this.space();
    this.unnest();
  }

  visitVariableDeclarationList(n: i32): void {
    this.visitMetadata(this.f(n, 0));
    this.startSpan();
    this.modifier(this.f(n, 1));
    this.modifier(this.f(n, 2));
    this.v(this.f(n, 3));
    this.separatorBetweenTypeAndVariable(this.f(n, 3), true);
    this.endSpan();
    this.startRule();
    const vars = this.items(this.f(n, 4));
    if (vars.length > 1) {
      this.builder.startBlockArgumentNesting();
    }
    this.visitCommaSeparatedNodes(vars, SA_SPLIT);
    if (vars.length > 1) {
      this.builder.endBlockArgumentNesting();
    }
    this.endRule();
  }

  visitMetadata(meta: i32): void {
    this.visitNodes(this.items(meta), SA_NONE, SA_NEWLINE, SA_NEWLINE);
  }

  visitDirectiveMetadata(n: i32): void {
    const unit = this.parent[n];
    const isFirst = this.at(this.f(unit, 1), 0) === n;
    this.visitNodes(this.items(this.f(n, 0)), SA_NONE, SA_NEWLINE, isFirst ? SA_ONE_OR_TWO : SA_NEWLINE);
  }

  paramMetaBegin(meta: i32): void {
    if (this.len(meta) === 0) {
      return;
    }
    this.startLazyRule();
    this.visitNodes(this.items(meta), SA_NONE, SA_SPLIT, SA_SPLIT);
  }

  paramMetaEnd(meta: i32): void {
    if (this.len(meta) === 0) {
      return;
    }
    this.endRule();
  }

  visitNamedNode(nameNode: i32, colon: i32, node: i32, rule: DtsRule | null): void {
    // NamedArgument and RecordLiteralNamedField hold the name as a token.
    this.visitNamedNodeTok(nameNode, colon, node, rule);
  }

  visitNamedNodeTok(name: i32, colon: i32, node: i32, rule: DtsRule | null): void {
    this.nest();
    this.startSpan();
    this.tok(name);
    this.tok(colon);
    const k = this.kind(node);
    if (k === N_LIST_LITERAL || k === N_SET_OR_MAP_LITERAL || k === N_RECORD_LITERAL) {
      this.space();
    } else {
      const split = this.soloSplit(DTS_COST_NORMAL);
      if (rule !== null) {
        split.constrainWhenSplit(rule);
      }
    }
    this.v(node);
    this.endSpan();
    this.unnest();
  }

  visitAssignment(equals: i32, rhs: i32, nest: boolean): void {
    this.space();
    this.tok(equals);
    if (nest) {
      this.builder.nestExpression(DTS_INDENT_EXPRESSION, true);
    }
    this.soloSplit(this.assignmentCost(rhs));
    this.startSpan();
    this.v(rhs);
    this.endSpan();
    if (nest) {
      this.unnest();
    }
  }

  visitBinary(n: i32, precedence: i32, nest: boolean): void {
    this.startSpan();
    if (nest) {
      this.nest();
    }
    this.startLazyRule();
    this.builder.startBlockArgumentNesting();
    this.traverseBinary(n, this.kind(n), precedence);
    this.builder.endBlockArgumentNesting();
    if (nest) {
      this.unnest();
    }
    this.endSpan();
    this.endRule();
  }

  traverseBinary(e: i32, k: i32, precedence: i32): void {
    if (this.kind(e) !== k) {
      this.v(e);
      return;
    }
    const op = this.f(e, 1);
    if (precedence !== -1 && dtPrecedence(this.t.kind[op], K_NONE) !== precedence) {
      this.v(e);
      return;
    }
    this.traverseBinary(this.f(e, 0), k, precedence);
    this.space();
    this.tok(op);
    this.split();
    this.traverseBinary(this.f(e, 2), k, precedence);
  }

  visitClauses(withClause: i32, implementsClause: i32): void {
    this.builder.startRule(dtsCombinatorRule());
    this.v(withClause);
    this.v(implementsClause);
    this.endRule();
  }

  visitGenericList(lb: i32, rb: i32, nodes: i32[]): void {
    const rule = dtsTypeArgumentRule();
    this.builder.startLazyRule(rule);
    this.startSpan();
    this.nest();
    this.tok(lb);
    rule.beforeArgument(this.zeroSplit());
    this.builder.startBlockArgumentNesting();
    for (let i = 0; i < nodes.length; i++) {
      this.v(nodes[i]);
      if (i < nodes.length - 1) {
        let comma = this.a.end[nodes[i]] + 1;
        if (this.t.kind[comma] === T_QUESTION) {
          comma = comma + 1;
        }
        this.tok(comma);
        rule.beforeArgument(this.split());
      }
    }
    this.tok(rb);
    this.builder.endBlockArgumentNesting();
    this.unnest();
    this.endSpan();
    this.endRule();
  }

  visitBodyContents(nodes: i32[]): void {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      this.v(n);
      if (i < nodes.length - 1) {
        if (this.hasNonEmptyBody(n)) {
          this.twoNewlines();
        } else {
          this.oneOrTwoNewlines();
        }
      }
    }
  }

  visitFunctionOrMethodDeclaration(
    meta: i32,
    external: i32,
    propertyKeyword: i32,
    modifierKeyword: i32,
    operatorKeyword: i32,
    name: i32,
    returnType: i32,
    typeParameters: i32,
    params: i32,
    body: i32,
  ): void {
    this.visitMetadata(meta);
    this.nest();
    this.startSpan();
    this.modifier(external);
    this.modifier(modifierKeyword);
    this.visit(returnType, SA_NONE, SA_SOLO_SPLIT);
    this.modifier(propertyKeyword);
    this.modifier(operatorKeyword);
    this.tok(name);
    this.endSpan();
    this.visitFunctionBody(typeParameters, params, body, FB_UNNEST_UNLESS_EXPRESSION, -1);
    if (this.kind(body) === N_EXPRESSION_FUNCTION_BODY) {
      this.unnest();
    }
  }

  visitFunctionBody(typeParameters: i32, params: i32, body: i32, beforeBody: i32, ctor: i32): void {
    const isExpr = this.kind(body) === N_EXPRESSION_FUNCTION_BODY;
    if (isExpr) {
      this.nest();
      this.builder.startLazyRule(dtsRule(DTS_COST_ARROW));
    }
    this.visitParameterSignature(typeParameters, params);
    if (beforeBody === FB_UNNEST_UNLESS_EXPRESSION) {
      if (!isExpr) {
        this.unnest();
      }
    } else if (beforeBody === FB_CONSTRUCTOR) {
      this.constructorBeforeBody(ctor);
    }
    this.v(body);
    if (isExpr) {
      this.unnest();
    }
  }

  visitParameterSignature(typeParameters: i32, params: i32): void {
    this.nest();
    this.v(typeParameters);
    if (params >= 0) {
      this.visitFormalParameterList(params, false);
    }
    this.unnest();
  }

  visitLoopBody(body: i32): void {
    const k = this.kind(body);
    if (k === N_EMPTY_STATEMENT) {
      this.v(body);
    } else if (k === N_BLOCK) {
      this.space();
      this.v(body);
    } else {
      this.builder.indent(DTS_INDENT_BLOCK);
      this.startRule();
      this.builder.split(false, true);
      this.v(body);
      this.endRule();
      this.builder.unindent();
    }
  }

  visitCollectionLiteral(
    leftBracket: i32,
    elements: i32[],
    rightBracket: i32,
    constKeyword: i32,
    typeArguments: i32,
    splitOuterCollection: boolean,
    isRecord: boolean,
  ): void {
    this.modifier(constKeyword);
    if (typeArguments >= 0) {
      this.startSpan();
      this.nest();
      this.tok(this.f(typeArguments, 0));
      this.builder.startRule(dtsRule(DTS_COST_TYPE_ARGUMENT));
      const targs = this.items(this.f(typeArguments, 1));
      for (let i = 0; i < targs.length; i++) {
        this.v(targs[i]);
        if (i < targs.length - 1) {
          let comma = this.a.end[targs[i]] + 1;
          if (this.t.kind[comma] === T_QUESTION) {
            comma = comma + 1;
          }
          this.tok(comma);
          this.split();
        }
      }
      this.tok(this.f(typeArguments, 2));
      this.endRule();
      this.unnest();
      this.endSpan();
    }
    if (elements.length === 0) {
      this.visitBody(leftBracket, elements, rightBracket);
      return;
    }
    if (splitOuterCollection) {
      for (let i = 0; i < this.collectionSplits.length; i++) {
        this.collectionSplits[i] = true;
      }
      this.collectionSplits.push(false);
    }
    this.beginBody(leftBracket, false);
    if (this.containsLineComments(elements, rightBracket)) {
      let lineRule = dtsTypeArgumentRule();
      this.builder.startLazyRule(lineRule);
      for (const element of elements) {
        const b = this.a.beg[element];
        if (this.t.lineE[b - 1] !== this.t.lineS[b]) {
          this.oneOrTwoNewlines();
          this.endRule();
          lineRule = dtsTypeArgumentRule();
          this.builder.startLazyRule(lineRule);
        } else {
          lineRule.beforeArgument(this.split());
        }
        this.v(element);
        this.writeCommaAfter(element);
      }
      this.endRule();
    } else {
      for (let i = 0; i < elements.length; i++) {
        this.builder.split(false, i > 0);
        this.v(elements[i]);
        this.writeCommaAfter(elements[i]);
      }
    }
    let force = false;
    if (splitOuterCollection) {
      force = this.collectionSplits.pop();
    }
    const isSingleElementRecord = isRecord && elements.length === 1;
    if (this.listHasCommaAfter(elements) && !isSingleElementRecord) {
      force = true;
    }
    this.endBody(rightBracket, force);
  }

  visitIfCondition(ifKeyword: i32, lp: i32, condition: i32, caseClause: i32, rp: i32): void {
    this.nest();
    this.tok(ifKeyword);
    this.space();
    this.tok(lp);
    if (caseClause < 0) {
      this.v(condition);
    } else {
      this.builder.startRule(dtsRule(DTS_COST_NORMAL));
      this.v(condition);
      this.split();
      this.tok(this.f(caseClause, 0));
      this.space();
      this.builder.startBlockArgumentNesting();
      this.builder.nestExpression(DTS_INDENT_EXPRESSION, true);
      const gp = this.f(caseClause, 1);
      this.v(this.f(gp, 0));
      this.unnest();
      this.builder.endBlockArgumentNesting();
      this.endRule();
      const when = this.f(gp, 1);
      if (when >= 0) {
        this.startRule();
        this.split();
        this.builder.startBlockArgumentNesting();
        this.nest();
        this.visitWhenClause(when);
        this.unnest();
        this.builder.endBlockArgumentNesting();
        this.endRule();
      }
    }
    this.tok(rp);
    this.unnest();
  }

  visitWhenClause(when: i32): void {
    this.tok(this.f(when, 0));
    this.space();
    this.v(this.f(when, 1));
  }

  separatorBetweenTypeAndVariable(type: i32, isSolo: boolean): void {
    if (type < 0) {
      return;
    }
    let isBlockType = false;
    const k = this.kind(type);
    if (k === N_GENERIC_FUNCTION_TYPE) {
      const params = this.items(this.f(this.f(type, 3), 1));
      isBlockType = params.length > 0 && this.hasCommaAfter(params[params.length - 1]);
    } else if (k === N_RECORD_TYPE_ANNOTATION) {
      isBlockType = true;
    }
    if (isBlockType) {
      this.space();
    } else if (isSolo) {
      this.soloSplit(DTS_COST_NORMAL);
    } else {
      this.split();
    }
  }

  splitEmptyBlock(n: i32): boolean {
    const p = this.parent[n];
    const pk = this.kind(p);
    if (pk === N_IF_STATEMENT) {
      return this.f(p, 7) >= 0 && this.f(p, 5) === n;
    }
    if (pk === N_CATCH_CLAUSE && this.kind(this.parent[p]) === N_TRY_STATEMENT) {
      const tr = this.parent[p];
      const catches = this.f(tr, 2);
      return this.f(tr, 4) >= 0 || n !== this.f(this.at(catches, this.len(catches) - 1), 8);
    }
    return false;
  }

  assignmentCost(rhs: i32): i32 {
    const k = this.kind(rhs);
    if (k === N_LIST_LITERAL || k === N_SET_OR_MAP_LITERAL || k === N_CASCADE_EXPRESSION) {
      return DTS_COST_ASSIGN_BLOCK;
    }
    return DTS_COST_ASSIGN;
  }

  beginBody(leftBracket: i32, space: boolean): void {
    this.tok(leftBracket);
    const r = this.blockRules.get(leftBracket);
    this.builder.startRule(r !== undefined ? r : dtsRule(DTS_COST_NORMAL));
    const c = this.blockPrev.get(leftBracket);
    this.builder = this.builder.startBlock(c !== undefined ? c : null, true, space);
  }

  endBody(rightBracket: i32, forceSplit: boolean): void {
    const hasLeadingNewline = this.writePrecedingCommentsAndNewlines(rightBracket);
    this.builder = this.builder.endBlock(hasLeadingNewline || forceSplit);
    this.endRule();
    this.writeText(this.lex(rightBracket), rightBracket, true);
  }

  visitConfigurations(configs: i32[]): void {
    if (configs.length === 0) {
      return;
    }
    this.startRule();
    for (const c of configs) {
      this.split();
      this.v(c);
    }
    this.endRule();
  }

  visitCombinator(keyword: i32, nodes: i32[]): void {
    const rule = this.builder.rule();
    rule.addCombinator(this.split());
    this.nest();
    this.tok(keyword);
    rule.addName(this.split());
    for (let i = 0; i < nodes.length; i++) {
      if (i > 0) {
        rule.addName(this.split());
      }
      const n = nodes[i];
      this.v(n);
      const next = this.a.end[n] + 1;
      if (this.t.kind[next] === T_COMMA) {
        this.tok(next);
      }
    }
    this.unnest();
  }

  visitBody(leftBracket: i32, nodes: i32[], rightBracket: i32): void {
    if (!this.canSplit(nodes, rightBracket)) {
      this.tok(leftBracket);
      this.tok(rightBracket);
      return;
    }
    this.beginBody(leftBracket, false);
    this.visitBodyContents(nodes);
    this.endBody(rightBracket, nodes.length > 0);
  }
}

const dtsStartsAt = (s: string, p: string, at: i32): boolean => {
  const n = toI32(p.length);
  if (at + n > toI32(s.length)) {
    return false;
  }
  for (let i = 0; i < n; i++) {
    if (s.charCodeAt(at + i) !== p.charCodeAt(i)) {
      return false;
    }
  }
  return true;
};

/** Splits on `\r\n`, `\r` or `\n`. */
const dtsSplitLines = (s: string): string[] => {
  const out: string[] = [];
  const n = toI32(s.length);
  let start = 0;
  let i = 0;
  while (i < n) {
    const c = s.charCodeAt(i);
    if (c === 10 || c === 13) {
      out.push(s.substring(start, i));
      if (c === 13 && i + 1 < n && s.charCodeAt(i + 1) === 10) {
        i++;
      }
      i++;
      start = i;
    } else {
      i++;
    }
  }
  out.push(s.substring(start, n));
  return out;
};

// ---------------------------------------------------------------------------
// ArgumentListVisitor and ArgumentSublist.

class DtsArgList {
  v: DtsVisitor;
  lp: i32;
  rp: i32;
  all: i32[];
  args: DtsSublist;
  functions: i32[];
  hasFunctions: boolean = false;
  after: DtsSublist;

  constructor(v: DtsVisitor, lp: i32, rp: i32, all: i32[]) {
    this.v = v;
    this.lp = lp;
    this.rp = rp;
    this.all = all;
    this.functions = [];
    const range = dtsContiguousFunctions(v, all);
    if (range.length === 0) {
      this.args = new DtsSublist(v, all, all);
      this.after = this.args;
    } else {
      this.hasFunctions = true;
      this.args = new DtsSublist(v, all, all.slice(0, range[0]));
      this.functions = all.slice(range[0], range[1]);
      this.after = new DtsSublist(v, all, all.slice(range[1], all.length));
    }
  }

  isSingle(): boolean {
    return this.all.length === 1 && this.v.kind(this.all[0]) !== N_NAMED_ARGUMENT;
  }

  hasBlockArguments(): boolean {
    return this.args.blocks.length > 0 || this.hasFunctions;
  }

  visit(): void {
    const v = this.v;
    const single = this.isSingle();
    if (single) {
      v.startSpan();
    }
    v.startSpan();
    v.tok(this.lp);
    this.args.visit();
    v.endSpan();
    if (this.hasFunctions) {
      const fns = this.functions;
      if (fns[0] === this.all[0]) {
        v.soloZeroSplit();
      } else {
        v.soloSplit(DTS_COST_NORMAL);
      }
      for (let i = 0; i < fns.length; i++) {
        const a = fns[i];
        if (i > 0) {
          v.space();
        }
        v.v(a);
        if (v.hasCommaAfter(a)) {
          v.tok(v.a.end[a] + 1);
        }
      }
      v.startSpan();
      this.after.visit();
      v.endSpan();
    }
    v.tok(this.rp);
    if (single) {
      v.endSpan();
    }
  }
}

/** The argument expression of an argument (a named argument's value). */
const dtsArgumentExpression = (v: DtsVisitor, arg: i32): i32 => {
  if (v.kind(arg) === N_NAMED_ARGUMENT) {
    return v.f(arg, 2);
  }
  return arg;
};

const dtsIsAllNamed = (v: DtsVisitor, args: i32[]): boolean => {
  for (const a of args) {
    if (v.kind(a) !== N_NAMED_ARGUMENT) {
      return false;
    }
  }
  return true;
};

/** _contiguousFunctions: [start, end) of the block function arguments, or []. */
const dtsContiguousFunctions = (v: DtsVisitor, args: i32[]): i32[] => {
  let start = -1;
  let end = -1;
  for (let i = 0; i < args.length; i++) {
    if (dtsIsBlockFunction(v, args[i])) {
      if (start < 0) {
        start = i;
      }
      if (end !== -1 && end !== i) {
        return [];
      }
      end = i + 1;
    }
  }
  if (start < 0) {
    return [];
  }
  if (dtsIsAllNamed(v, args) && (start > 0 || end < toI32(args.length))) {
    return [];
  }
  if (dtsIsAllNamed(v, args.slice(start, end))) {
    for (let i = 0; i < start; i++) {
      if (dtsIsNamedArrow(v, args[i])) {
        return [];
      }
    }
    for (let i = end; i < args.length; i++) {
      if (dtsIsNamedArrow(v, args[i])) {
        return [];
      }
    }
  }
  return [start, end];
};

const dtsIsNamedArrow = (v: DtsVisitor, arg: i32): boolean => {
  if (v.kind(arg) !== N_NAMED_ARGUMENT) {
    return false;
  }
  const e = v.f(arg, 2);
  return v.kind(e) === N_FUNCTION_EXPRESSION && v.kind(v.f(e, 2)) === N_EXPRESSION_FUNCTION_BODY;
};

const dtsIsBlockFunction = (v: DtsVisitor, arg: i32): boolean => {
  let e = dtsArgumentExpression(v, arg);
  const k = v.kind(e);
  if (k === N_METHOD_INVOCATION) {
    if (!dtsIsValidWrappingTarget(v, v.f(e, 0))) {
      return false;
    }
    const al = v.f(v.f(e, 4), 1);
    if (v.len(al) !== 1) {
      return false;
    }
    return dtsIsBlockFunction(v, v.at(al, 0));
  }
  if (k === N_INSTANCE_CREATION_EXPRESSION) {
    const al = v.f(v.f(e, 2), 1);
    if (v.len(al) !== 1) {
      return false;
    }
    return dtsIsBlockFunction(v, v.at(al, 0));
  }
  if (k === N_FUNCTION_EXPRESSION_INVOCATION) {
    if (v.len(v.f(v.f(e, 2), 1)) > 0) {
      return false;
    }
    e = v.f(e, 0);
  }
  while (v.kind(e) === N_PARENTHESIZED_EXPRESSION) {
    e = v.f(e, 1);
  }
  if (v.kind(e) !== N_FUNCTION_EXPRESSION) {
    return false;
  }
  const body = v.f(e, 2);
  if (v.kind(body) !== N_BLOCK_FUNCTION_BODY) {
    return false;
  }
  const block = v.f(body, 2);
  return v.len(v.f(block, 1)) > 0 || v.hasComments(v.f(block, 2));
};

const dtsIsValidWrappingTarget = (v: DtsVisitor, e0: i32): boolean => {
  let e = e0;
  if (e < 0) {
    return true;
  }
  while (e >= 0 && v.kind(e) === N_PROPERTY_ACCESS) {
    e = v.f(e, 0);
  }
  const k = v.kind(e);
  return k === N_PREFIXED_IDENTIFIER || k === N_SIMPLE_IDENTIFIER;
};

class DtsSublist {
  v: DtsVisitor;
  all: i32[];
  positional: i32[];
  named: i32[];
  // The block arguments and their opening tokens.
  blocks: i32[];
  blockToks: i32[];
  leadingBlocks: i32 = 0;
  trailingBlocks: i32 = 0;
  blockRule: DtsRule | null = null;
  previousSplit: DtsChunk | null = null;

  constructor(v: DtsVisitor, all: i32[], args: i32[]) {
    this.v = v;
    this.all = all;
    this.positional = [];
    this.named = [];
    this.blocks = [];
    this.blockToks = [];
    // _splitArgumentLists
    let inNamed = false;
    let mixed = false;
    for (const a of args) {
      if (v.kind(a) === N_NAMED_ARGUMENT) {
        inNamed = true;
      } else if (inNamed) {
        mixed = true;
        break;
      }
      if (inNamed) {
        this.named.push(a);
      } else {
        this.positional.push(a);
      }
    }
    if (mixed) {
      this.positional = [];
      this.named = args;
    }
    for (const a of args) {
      const b = this.blockToken(a);
      if (b >= 0) {
        this.blocks.push(a);
        this.blockToks.push(b);
      }
    }
    let leading = 0;
    for (const a of args) {
      if (this.blocks.indexOf(a) < 0) {
        break;
      }
      leading++;
    }
    let trailing = 0;
    if (leading !== toI32(args.length)) {
      for (let i = toI32(args.length) - 1; i >= 0; i--) {
        if (this.blocks.indexOf(args[i]) < 0) {
          break;
        }
        trailing++;
      }
    }
    if (leading !== toI32(this.blocks.length)) {
      leading = 0;
    }
    if (trailing !== toI32(this.blocks.length)) {
      trailing = 0;
    }
    if (leading === 0 && trailing === 0) {
      this.blocks = [];
      this.blockToks = [];
    }
    this.leadingBlocks = leading;
    this.trailingBlocks = trailing;
  }

  blockToken(arg: i32): i32 {
    const v = this.v;
    const e = dtsArgumentExpression(v, arg);
    const k = v.kind(e);
    if (k === N_LIST_LITERAL || k === N_SET_OR_MAP_LITERAL) {
      return v.f(e, 2);
    }
    if (k === N_RECORD_LITERAL) {
      return v.f(e, 1);
    }
    if ((k === N_SIMPLE_STRING_LITERAL || k === N_STRING_INTERPOLATION) && v.isMultilineString(e)) {
      return v.a.beg[e];
    }
    return -1;
  }

  visit(): void {
    if (this.blocks.length > 0) {
      this.blockRule = dtsRule(DTS_COST_SPLIT_BLOCKS);
    }
    const rule = this.visitPositional();
    this.visitNamed(rule);
  }

  visitPositional(): DtsRule | null {
    if (this.positional.length === 0) {
      return null;
    }
    const np = toI32(this.positional.length);
    const leading = this.leadingBlocks < np ? this.leadingBlocks : np;
    const t = this.trailingBlocks - toI32(this.named.length);
    const trailing = t > 0 ? t : 0;
    const rule = dtsPositionalRule(this.blockRule, np, leading, trailing);
    this.visitArguments(this.positional, rule, true);
    return rule;
  }

  visitNamed(positionalRule: DtsRule | null): void {
    if (this.named.length === 0) {
      return;
    }
    const l = this.leadingBlocks - toI32(this.positional.length);
    const leading = l > 0 ? l : 0;
    const nn = toI32(this.named.length);
    const trailing = this.trailingBlocks < nn ? this.trailingBlocks : nn;
    const namedRule = dtsNamedRule(this.blockRule, leading, trailing);
    if (positionalRule !== null) {
      positionalRule.addNamedArgsConstraints(namedRule);
    }
    this.visitArguments(this.named, namedRule, false);
  }

  visitArguments(args: i32[], rule: DtsRule, isPositional: boolean): void {
    const v = this.v;
    v.builder.startRule(rule);
    let ps = v.builder.split(true, args[0] !== this.all[0]);
    this.previousSplit = ps;
    rule.beforeArgument(ps);
    if (isPositional) {
      v.builder.startSpan(DTS_COST_POSITIONAL_ARGUMENTS);
    }
    for (let i = 0; i < args.length; i++) {
      this.visitArgument(rule, args[i]);
      if (i < args.length - 1) {
        ps = v.split();
        this.previousSplit = ps;
        rule.beforeArgument(ps);
      }
    }
    if (isPositional) {
      v.endSpan();
    }
    v.endRule();
  }

  visitArgument(rule: DtsRule, arg: i32): void {
    const v = this.v;
    const bi = this.blocks.indexOf(arg);
    const isNamed = v.kind(arg) === N_NAMED_ARGUMENT;
    const nestBlocks = this.all.length > 1 || v.kind(this.all[0]) === N_RECORD_LITERAL;
    if (bi >= 0) {
      rule.disableSplitOnInnerRules();
      const br = this.blockRule;
      if (br !== null) {
        v.beforeBlock(this.blockToks[bi], br, this.previousSplit);
      }
    } else if (nestBlocks) {
      v.builder.startBlockArgumentNesting();
    } else if (!isNamed) {
      rule.disableSplitOnInnerRules();
    }
    if (isNamed) {
      v.visitNamedNode(v.f(arg, 0), v.f(arg, 1), v.f(arg, 2), rule);
    } else {
      v.v(arg);
    }
    if (bi >= 0) {
      rule.enableSplitOnInnerRules();
    } else if (nestBlocks) {
      v.builder.endBlockArgumentNesting();
    } else if (!isNamed) {
      rule.enableSplitOnInnerRules();
    }
    if (v.hasCommaAfter(arg)) {
      v.tok(v.a.end[arg] + 1);
    }
  }
}

// ---------------------------------------------------------------------------
// CallChainVisitor.

const SEL_METHOD: i32 = 0;
const SEL_PREFIXED: i32 = 1;
const SEL_PROPERTY: i32 = 2;

class DtsSelector {
  kind: i32;
  node: i32;
  postfixes: i32[];
  constructor(kind: i32, node: i32) {
    this.kind = kind;
    this.node = node;
    this.postfixes = [];
  }

  isProperty(): boolean {
    return this.kind !== SEL_METHOD;
  }
}

class DtsCallChain {
  v: DtsVisitor;
  target: i32;
  properties: DtsSelector[];
  calls: DtsSelector[];
  blockCalls: DtsSelector[];
  hasBlockCalls: boolean = false;
  hangingCall: DtsSelector | null = null;
  ruleEnabled: boolean = false;
  spanEnded: boolean = false;
  propertyRule: DtsRule | null = null;

  constructor(v: DtsVisitor, node: i32) {
    this.v = v;
    const calls: DtsSelector[] = [];
    this.target = dtsUnwrapTarget(v, node, calls);
    this.properties = [];
    if (v.kind(dtsUnwrapNullAssertion(v, this.target)) === N_SIMPLE_IDENTIFIER) {
      for (const c of calls) {
        if (!c.isProperty()) {
          break;
        }
        this.properties.push(c);
      }
    }
    let rest = calls.slice(this.properties.length, calls.length);
    this.blockCalls = [];
    let inBlockCalls = false;
    for (let i = 0; i < rest.length; i++) {
      const call = rest[i];
      if (call.kind === SEL_METHOD && new DtsArgList(v, -1, -1, v.items(v.f(v.f(call.node, 4), 1))).hasBlockArguments()) {
        inBlockCalls = true;
        this.hasBlockCalls = true;
        this.blockCalls.push(call);
      } else if (inBlockCalls) {
        if (i === rest.length - 1) {
          this.hangingCall = call;
          break;
        }
        this.hasBlockCalls = false;
        this.blockCalls = [];
        break;
      }
    }
    if (this.hasBlockCalls) {
      const kept: DtsSelector[] = [];
      for (const c of rest) {
        if (this.blockCalls.indexOf(c) < 0) {
          kept.push(c);
        }
      }
      rest = kept;
    }
    const h = this.hangingCall;
    if (h !== null) {
      const kept: DtsSelector[] = [];
      for (const c of rest) {
        if (c !== h) {
          kept.push(c);
        }
      }
      rest = kept;
    }
    this.calls = rest;
  }

  visit(): void {
    const v = this.v;
    v.nest();
    v.startSpan();
    const splitOnTarget = this.forcesSplit(this.target);
    if (splitOnTarget) {
      if (this.properties.length > 1) {
        const r = dtsPositionalRule(null, toI32(this.properties.length), 0, 0);
        this.propertyRule = r;
        v.builder.startLazyRule(r);
      } else {
        this.enableRule(true);
      }
    }
    v.v(this.target);
    if (this.properties.length === 1) {
      v.soloZeroSplit();
      this.write(this.properties[0]);
    } else if (this.properties.length > 1) {
      if (!splitOnTarget) {
        const r = dtsPositionalRule(null, toI32(this.properties.length), 0, 0);
        this.propertyRule = r;
        v.builder.startRule(r);
      }
      const pr = this.propertyRule;
      for (const p of this.properties) {
        const c = v.zeroSplit();
        if (pr !== null) {
          pr.beforeArgument(c);
        }
        this.write(p);
      }
      v.endRule();
    }
    if (this.calls.length > 1) {
      v.builder.startBlockArgumentNesting();
    }
    for (const call of this.calls) {
      this.enableRule(false);
      v.zeroSplit();
      this.write(call);
    }
    if (this.calls.length > 1) {
      v.builder.endBlockArgumentNesting();
    }
    if (this.hasBlockCalls) {
      this.enableRule(false);
      v.zeroSplit();
      this.disableRule();
      for (const b of this.blockCalls) {
        this.write(b);
      }
      const h = this.hangingCall;
      if (h !== null) {
        this.write(h);
      }
    }
    this.disableRule();
    this.endSpanOnce();
    v.unnest();
  }

  forcesSplit(e0: i32): boolean {
    const v = this.v;
    let e = e0;
    while (v.kind(e) === N_PARENTHESIZED_EXPRESSION) {
      e = v.f(e, 1);
    }
    if (v.isCollectionLiteral(e)) {
      return false;
    }
    const k = v.kind(e);
    if (k === N_FUNCTION_EXPRESSION) {
      const body = v.f(e, 2);
      if (v.kind(body) !== N_BLOCK_FUNCTION_BODY) {
        return false;
      }
      return v.len(v.f(v.f(body, 2), 1)) === 0;
    }
    let al = -1;
    if (k === N_METHOD_INVOCATION) {
      al = v.f(e, 4);
    } else if (k === N_INSTANCE_CREATION_EXPRESSION || k === N_FUNCTION_EXPRESSION_INVOCATION) {
      al = v.f(e, 2);
    }
    if (al < 0) {
      return true;
    }
    const args = v.f(al, 1);
    if (v.len(args) === 0) {
      return true;
    }
    const last = v.at(args, v.len(args) - 1);
    if (v.hasCommaAfter(last)) {
      return false;
    }
    return this.forcesSplit(dtsArgumentExpression(v, last));
  }

  beforeMethodArguments(selector: DtsSelector): void {
    if (!this.hasBlockCalls && this.calls.length > 0 && selector === this.calls[this.calls.length - 1]) {
      this.disableRule();
    }
    if (this.properties.length === 0 && this.calls.length === 1 && !this.hasBlockCalls && this.v.kind(this.target) === N_SIMPLE_IDENTIFIER) {
      this.endSpanOnce();
    }
  }

  disableRule(): void {
    if (!this.ruleEnabled) {
      return;
    }
    this.v.endRule();
    this.ruleEnabled = false;
  }

  enableRule(lazy: boolean): void {
    if (this.ruleEnabled) {
      return;
    }
    const rule = dtsRule(DTS_COST_NORMAL);
    const pr = this.propertyRule;
    if (pr !== null) {
      pr.addNamedArgsConstraints(rule);
    }
    if (lazy) {
      this.v.builder.startLazyRule(rule);
    } else {
      this.v.builder.startRule(rule);
    }
    this.ruleEnabled = true;
  }

  endSpanOnce(): void {
    if (this.spanEnded) {
      return;
    }
    this.v.endSpan();
    this.spanEnded = true;
  }

  write(s: DtsSelector): void {
    const v = this.v;
    const n = s.node;
    if (s.kind === SEL_METHOD) {
      v.tok(v.f(n, 1));
      v.tok(v.f(v.f(n, 2), 0));
      this.beforeMethodArguments(s);
      v.nest();
      v.v(v.f(n, 3));
      v.visitArgumentList(v.f(n, 4), false);
      v.unnest();
    } else if (s.kind === SEL_PREFIXED) {
      v.tok(v.f(n, 1));
      v.v(v.f(n, 2));
    } else {
      v.tok(v.f(n, 1));
      v.v(v.f(n, 2));
    }
    v.nest();
    for (const p of s.postfixes) {
      const k = v.kind(p);
      if (k === N_FUNCTION_EXPRESSION_INVOCATION) {
        v.soloZeroSplit();
        v.v(v.f(p, 1));
        v.visitArgumentList(v.f(p, 2), true);
      } else if (k === N_INDEX_EXPRESSION) {
        v.finishIndexExpression(p);
      } else if (k === N_POSTFIX_EXPRESSION) {
        v.tok(v.f(p, 1));
      }
    }
    v.unnest();
  }
}

const dtsUnwrapTarget = (v: DtsVisitor, node: i32, calls: DtsSelector[]): i32 => {
  if (v.looksLikeStaticCall(node)) {
    return node;
  }
  const k = v.kind(node);
  if (k === N_METHOD_INVOCATION && v.f(node, 0) >= 0) {
    return dtsUnwrapSelector(v, v.f(node, 0), new DtsSelector(SEL_METHOD, node), calls);
  }
  if (k === N_PROPERTY_ACCESS && v.f(node, 0) >= 0) {
    return dtsUnwrapSelector(v, v.f(node, 0), new DtsSelector(SEL_PROPERTY, node), calls);
  }
  if (k === N_PREFIXED_IDENTIFIER) {
    return dtsUnwrapSelector(v, v.f(node, 0), new DtsSelector(SEL_PREFIXED, node), calls);
  }
  if (k === N_INDEX_EXPRESSION && v.f(node, 0) >= 0) {
    return dtsUnwrapPostfix(v, node, v.f(node, 0), calls);
  }
  if (k === N_FUNCTION_EXPRESSION_INVOCATION) {
    return dtsUnwrapPostfix(v, node, v.f(node, 0), calls);
  }
  if (k === N_POSTFIX_EXPRESSION && v.t.kind[v.f(node, 1)] === T_BANG) {
    return dtsUnwrapPostfix(v, node, v.f(node, 0), calls);
  }
  return node;
};

const dtsUnwrapPostfix = (v: DtsVisitor, node: i32, target0: i32, calls: DtsSelector[]): i32 => {
  const target = dtsUnwrapTarget(v, target0, calls);
  if (calls.length === 0) {
    return node;
  }
  calls[calls.length - 1].postfixes.push(node);
  return target;
};

const dtsUnwrapSelector = (v: DtsVisitor, target0: i32, selector: DtsSelector, calls: DtsSelector[]): i32 => {
  const target = dtsUnwrapTarget(v, target0, calls);
  calls.push(selector);
  return target;
};

const dtsUnwrapNullAssertion = (v: DtsVisitor, e: i32): i32 => {
  if (v.kind(e) === N_POSTFIX_EXPRESSION && v.t.kind[v.f(e, 1)] === T_BANG) {
    return v.f(e, 0);
  }
  return e;
};
