// dart_style's front end: AstNodeVisitor and PieceFactory, PieceWriter,
// DelimitedListBuilder, SequenceBuilder, ChainBuilder, TypeBuilder and
// ExpressionContents (lib/src/front_end/), building the Piece tree from the
// AST and its comments.
//
// Ported from dart_style (Dart SDK 3.14) (BSD-3-Clause, Copyright the Dart
// project authors).

import {
  DtAst,
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
  N_CATCH_CLAUSE_PARAMETER,
  N_CLASS_DECLARATION,
  N_CLASS_TYPE_ALIAS,
  N_CONDITIONAL_EXPRESSION,
  N_CONFIGURATION,
  N_CONSTANT_PATTERN,
  N_CONSTRUCTOR_DECLARATION,
  N_CONSTRUCTOR_FIELD_INITIALIZER,
  N_CONSTRUCTOR_NAME,
  N_CONSTRUCTOR_SELECTOR,
  N_CONTINUE_STATEMENT,
  N_DECLARED_IDENTIFIER,
  N_DECLARED_VARIABLE_PATTERN,
  N_DOTTED_NAME,
  N_DOT_SHORTHAND_CONSTRUCTOR_INVOCATION,
  N_DOT_SHORTHAND_INVOCATION,
  N_DOT_SHORTHAND_PROPERTY_ACCESS,
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
  N_EXTENSION_DECLARATION,
  N_EXTENSION_TYPE_DECLARATION,
  N_FIELD_DECLARATION,
  N_FIELD_FORMAL_PARAMETER,
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
  N_FUNCTION_TYPE_ALIAS,
  N_GENERIC_FUNCTION_TYPE,
  N_GENERIC_TYPE_ALIAS,
  N_IF_ELEMENT,
  N_IF_STATEMENT,
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
  N_NAMED_ARGUMENT,
  N_NAMED_TYPE,
  N_NAME_WITH_TYPE_PARAMETERS,
  N_NATIVE_CLAUSE,
  N_NATIVE_FUNCTION_BODY,
  N_NULL_ASSERT_PATTERN,
  N_NULL_AWARE_ELEMENT,
  N_NULL_CHECK_PATTERN,
  N_NULL_LITERAL,
  N_OBJECT_PATTERN,
  N_PARENTHESIZED_EXPRESSION,
  N_PARENTHESIZED_PATTERN,
  N_PART_DIRECTIVE,
  N_PART_OF_DIRECTIVE,
  N_PATTERN_ASSIGNMENT,
  N_PATTERN_FIELD,
  N_PATTERN_FIELD_NAME,
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
  N_SIMPLE_IDENTIFIER,
  N_SIMPLE_STRING_LITERAL,
  N_SPREAD_ELEMENT,
  N_STRING_INTERPOLATION,
  N_SUPER_CONSTRUCTOR_INVOCATION,
  N_SUPER_EXPRESSION,
  N_SUPER_FORMAL_PARAMETER,
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
  N_VARIABLE_DECLARATION_LIST,
  N_VARIABLE_DECLARATION_STATEMENT,
  N_WHEN_CLAUSE,
  N_WHILE_STATEMENT,
  N_WILDCARD_PATTERN,
  N_YIELD_STATEMENT,
  dtNodeName,
  dtSig,
  N_VARIABLE_DECLARATION,
} from "./ast";
import {
  dtKidsNow,
  CM_ALWAYS_TRAILING,
  CM_NONE,
  CM_NON_TRAILING,
  CM_TRAILING,
  CT_BLOCK_FORMAT,
  CT_PROPERTY,
  CT_SPLITTABLE,
  CT_UNSPLITTABLE,
  DtPiece,
  DtPieces,
  IN_BLOCK,
  IN_CASCADE,
  IN_EXPRESSION,
  IN_INFIX,
  IN_NONE,
  LIST_ELEMENT_APPEND_COMMA,
  PK_ADJACENT,
  PK_ASSIGN,
  PK_BLOCK,
  PK_CASE_EXPRESSION,
  PK_CHAIN,
  PK_CLAUSE,
  PK_CODE,
  PK_COMMENT,
  PK_CONSTRUCTOR,
  PK_CONTROL_FLOW,
  PK_ENABLE_FORMATTING,
  PK_FOR,
  PK_FOR_IN,
  PK_GROUPING,
  PK_IF_CASE,
  PK_INFIX,
  PK_LEADING_COMMENT,
  PK_LIST,
  PK_LIST_ELEMENT,
  PK_NEWLINE,
  PK_PREFIX,
  PK_PRIMARY_TYPE,
  PK_SEQUENCE,
  PK_SEQUENCE_ELEMENT,
  PK_SPACE,
  PK_TYPE,
  PK_TYPE_PARAMETER_BOUND,
  PK_TYPE_TEST,
  PK_VARIABLE,
  S_SPLIT,
  S_UNSPLIT,
  TB_BLOCK,
  TB_LIST,
  TB_SEMICOLON,
  WS_NEWLINE,
  WS_NONE,
  WS_SPACE,
  dtPin,
  dtIs37,
  PK_ASSIGN37,
  dtV313,
  dtPreventSplit,
} from "./pieces";
import {
  K_NONE,
  T_BANG,
  T_COLON,
  T_COMMA,
  T_DEC,
  T_EQ,
  T_MINUS,
  T_QUESTION,
  T_RBRACE,
  T_RBRACKET,
  T_SEMI,
} from "./tokens";
import { C_LINE, DtTokens } from "./scanner";
import { CT_LINE, CT_INLINE_BLOCK, DtComment, DtCommentWriter, DtComments, dtEmptyComments } from "./comments";
import { dtPrecedence } from "./parser";

// NodeContext.
const NC_NONE: i32 = 0;
const NC_ASSIGNMENT: i32 = 1;
const NC_CASCADE_TARGET: i32 = 2;
const NC_CONDITIONAL_BRANCH: i32 = 3;
const NC_FOR_LOOP_VARIABLE: i32 = 4;
const NC_NAMED_EXPRESSION: i32 = 5;
const NC_MULTILINE_STRING_INTERPOLATION: i32 = 6;
const NC_SWITCH_EXPRESSION_CASE: i32 = 7;

// BlockFormat.
const BF_FUNCTION: i32 = 0;
const BF_COLLECTION: i32 = 1;
const BF_INVOCATION: i32 = 2;
const BF_INDENTED_ADJACENT: i32 = 3;
const BF_UNINDENTED_ADJACENT: i32 = 4;
const BF_NONE: i32 = 5;

// ExpressionContents types.
const EC_COLLECTION: i32 = 0;
const EC_NAMED_COLLECTION: i32 = 1;
const EC_CALL_WITH_NAMED: i32 = 2;
const EC_OTHER_CALL: i32 = 3;

/** ListStyle. */
class DtListStyle {
  commas: i32;
  splitCost: i32;
  spaceWhenUnsplit: boolean;
  constructor(commas: i32, splitCost: i32, spaceWhenUnsplit: boolean) {
    this.commas = commas;
    this.splitCost = splitCost;
    this.spaceWhenUnsplit = spaceWhenUnsplit;
  }
}

/** DelimitedListBuilder. */
class DtListBuilder {
  v: DtVisitor;
  style: DtListStyle;
  left: DtPiece | null = null;
  right: DtPiece | null = null;
  elements: DtPiece[];
  mustSplit: boolean = false;
  leading: DtPiece[];
  beforeComma: DtComments;

  constructor(v: DtVisitor, style: DtListStyle) {
    this.v = v;
    this.style = style;
    this.elements = [];
    this.leading = [];
    this.beforeComma = dtEmptyComments();
  }

  build(forceSplit: boolean = false, blockShaped: boolean = true): DtPiece {
    const v = this.v;
    if (this.elements.length === 0) {
      v.begin();
      const l = this.left;
      if (l !== null) {
        v.add(l);
      }
      const r = this.right;
      if (r !== null) {
        v.add(r);
      }
      return v.end();
    }
    let last = -1;
    for (let i = toI32(this.elements.length) - 1; i >= 0; i--) {
      if (this.elements[i].a !== null) {
        last = i;
        break;
      }
    }
    const p = v.pf.make(PK_LIST);
    p.a = this.left;
    p.b = this.right;
    p.list = this.elements;
    p.i0 = this.style.commas;
    p.i1 = this.style.splitCost;
    p.b0 = this.style.spaceWhenUnsplit;
    p.i2 = last;
    p.b1 = blockShaped;
    for (let i = 0; i < this.elements.length; i++) {
      const el = this.elements[i];
      const c = this.style.commas;
      if (c === CM_ALWAYS_TRAILING) {
        dtPin(el, LIST_ELEMENT_APPEND_COMMA);
      } else if (c === CM_TRAILING) {
        if (i < last) {
          dtPin(el, LIST_ELEMENT_APPEND_COMMA);
        }
      } else if (c === CM_NON_TRAILING) {
        dtPin(el, i < last ? LIST_ELEMENT_APPEND_COMMA : S_UNSPLIT);
      } else {
        dtPin(el, S_UNSPLIT);
      }
    }
    if (this.mustSplit || forceSplit) {
      dtPin(p, S_SPLIT);
    }
    return p;
  }

  leftBracket(tok: i32): void {
    this.left = this.v.tokenPiece(tok, -1, false, false);
  }

  addLeftBracket(p: DtPiece): void {
    this.left = p;
  }

  rightBracket(bracket: i32, delimiter: i32 = -1, semicolon: i32 = -1): void {
    const v = this.v;
    let before = v.cw.takeCommentsBefore(bracket);
    if (delimiter >= 0) {
      before = v.cw.takeCommentsBefore(delimiter).concatenate(before);
    }
    if (semicolon >= 0) {
      before = v.cw.takeCommentsBefore(semicolon).concatenate(before);
    }
    this.addComments(before, false);
    v.begin();
    v.token(delimiter);
    v.token(bracket);
    this.right = v.end();
  }

  add(p: DtPiece): void {
    const el = this.v.pf.make(PK_LIST_ELEMENT);
    for (const c of this.leading) {
      el.list.push(c);
    }
    el.a = p;
    this.elements.push(el);
    this.leading = [];
    this.beforeComma = dtEmptyComments();
  }

  addInner(inner: DtListBuilder, forceSplit: boolean = false): void {
    this.add(inner.build(forceSplit, true));
    this.beforeComma = inner.beforeComma;
  }

  addCommentsBefore(tok: i32): void {
    const c = this.v.cw.takeCommentsBefore(tok);
    this.addComments(c, true);
  }

  visit(node: i32): void {
    const v = this.v;
    this.addCommentsBefore(v.a.beg[node]);
    this.add(v.nodePiece(node, false, NC_NONE));
    const next = v.a.end[node] + 1;
    if (v.t.kind[next] === T_COMMA) {
      this.beforeComma = v.cw.takeCommentsBefore(next);
    }
  }

  visitAll(list: i32, allowBlockArgument: boolean): void {
    const a = this.v.a;
    for (let i = 0; i < a.len(list); i++) {
      this.visit(a.at(list, i));
    }
    if (allowBlockArgument) {
      this.setBlockArgument(list);
    }
  }

  leftDelimiter(delim: i32): void {
    const v = this.v;
    this.beforeComma = this.beforeComma.concatenate(v.cw.takeCommentsBefore(delim));
    this.elements[this.elements.length - 1].delim = v.t.text(delim);
  }

  addComments(comments: DtComments, hasElementAfter: boolean): void {
    if (this.beforeComma.isEmpty() && comments.isEmpty() && comments.linesBeforeNextToken() <= 1) {
      return;
    }
    if (this.beforeComma.requiresNewline() || comments.requiresNewline()) {
      this.mustSplit = true;
    }
    // _splitCommaComments.
    let before = comments;
    if (!hasElementAfter) {
      this.beforeComma = this.beforeComma.concatenate(before);
      before = dtEmptyComments();
    }
    if (!before.isEmpty() && before.cs[0].type === CT_LINE && before.linesBefore(0) === 0) {
      this.beforeComma = this.beforeComma.concatenate(before.head(1));
      before = before.tail(1);
    }
    const bc = this.beforeComma;
    let inlineCount = 0;
    if (this.elements.length > 0) {
      while (inlineCount < bc.len()) {
        if (!bc.isHanging(inlineCount) || bc.cs[inlineCount].type !== CT_INLINE_BLOCK) {
          break;
        }
        inlineCount++;
      }
    }
    const inlineComments = bc.head(inlineCount);
    const remaining = bc.tail(inlineCount);
    let hangingCount = 0;
    if (this.elements.length > 0) {
      while (hangingCount < remaining.len()) {
        if (!remaining.isHanging(hangingCount)) {
          break;
        }
        hangingCount++;
      }
    }
    const hanging = remaining.head(hangingCount);
    const separateBefore = remaining.tail(hangingCount);
    let leadingCount = 0;
    if (hasElementAfter && !before.isEmpty()) {
      while (leadingCount < before.len()) {
        const ci = before.len() - leadingCount - 1;
        if (!before.isLeading(ci)) {
          break;
        }
        leadingCount++;
      }
    }
    const separateAfter = before.head(before.len() - leadingCount);
    const leadingComments = before.tail(before.len() - leadingCount);
    const separate = separateBefore.concatenate(separateAfter);

    const v = this.v;
    for (const c of inlineComments.cs) {
      const cp = v.commentPiece(c, WS_NONE);
      const last = this.elements[this.elements.length - 1];
      last.list2.push(cp);
      last.i0 = last.i0 + 1;
    }
    for (const c of hanging.cs) {
      const cp = v.commentPiece(c, WS_NONE);
      this.elements[this.elements.length - 1].list2.push(cp);
    }
    let wroteBlank = false;
    if (!hasElementAfter && this.elements.length > 0 && comments.linesBeforeNextToken() > 1) {
      this.elements[this.elements.length - 1].b2 = true;
      wroteBlank = true;
    }
    for (let i = 0; i < separate.len(); i++) {
      if (separate.linesBefore(i) > 1 && this.elements.length > 0) {
        this.elements[this.elements.length - 1].b2 = true;
        wroteBlank = true;
      }
      const cp = v.commentPiece(separate.cs[i], WS_NONE);
      const el = v.pf.make(PK_LIST_ELEMENT);
      el.list2.push(cp);
      this.elements.push(el);
    }
    if (!wroteBlank && this.elements.length > 0 && comments.linesBeforeNextToken() > 1) {
      this.elements[this.elements.length - 1].b2 = true;
    }
    for (const c of leadingComments.cs) {
      this.leading.push(v.commentPiece(c, WS_NONE));
    }
  }

  setBlockArgument(list: i32): void {
    const v = this.v;
    const a = v.a;
    const n = a.len(list);
    const ci = this.candidateBlockArgument(list);
    if (ci === -1) {
      return;
    }
    if (a.kind[a.at(list, ci)] === N_NAMED_ARGUMENT) {
      return;
    }
    if (ci < n - 2) {
      return;
    }
    if (ci === 1 && v.blockFormatNode(a.at(list, 1)) === BF_FUNCTION && a.kind[a.at(list, 0)] !== N_NAMED_ARGUMENT) {
      const ft = v.blockFormatNode(a.at(list, 0));
      if (ft === BF_UNINDENTED_ADJACENT || ft === BF_INDENTED_ADJACENT) {
        this.elements[0].b0 = true;
        if (ft === BF_UNINDENTED_ADJACENT) {
          this.elements[0].b1 = true;
        }
        this.elements[1].b0 = true;
        return;
      }
    }
    this.elements[ci].b0 = true;
  }

  candidateBlockArgument(list: i32): i32 {
    const v = this.v;
    const a = v.a;
    let fn = -1;
    let coll = -1;
    for (let i = 0; i < a.len(list); i++) {
      const bf = v.blockFormatNode(a.at(list, i));
      if (bf === BF_FUNCTION) {
        fn = fn >= 0 ? -2 : i;
      } else if (bf === BF_COLLECTION) {
        coll = coll >= 0 ? -2 : i;
      }
    }
    if (fn >= 0) {
      return fn;
    }
    if (coll >= 0) {
      return coll;
    }
    return -1;
  }
}

/** SequenceBuilder. */
class DtSeqBuilder {
  v: DtVisitor;
  left: DtPiece | null = null;
  right: DtPiece | null = null;
  elements: DtPiece[];
  allowBlank: boolean = false;

  constructor(v: DtVisitor) {
    this.v = v;
    this.elements = [];
  }

  build(forceSplit: boolean = false): DtPiece {
    const v = this.v;
    if (this.left === null && this.elements.length === 1 && this.elements[0].list.length === 0 && this.right === null) {
      const only = this.elements[0].a;
      if (only !== null) {
        return only;
      }
    }
    if (this.elements.length === 0) {
      v.begin();
      const l = this.left;
      if (l !== null) {
        v.add(l);
      }
      if (forceSplit || this.left === null) {
        v.add(v.pf.make(PK_NEWLINE));
      }
      const r = this.right;
      if (r !== null) {
        v.add(r);
      }
      return v.end();
    }
    this.elements[this.elements.length - 1].b0 = false;
    const seq = v.pf.make(PK_SEQUENCE);
    seq.list = this.elements;
    const l = this.left;
    const r = this.right;
    if (l !== null && r !== null) {
      const b = v.pf.make(PK_BLOCK);
      b.a = l;
      b.b = seq;
      b.c = r;
      return b;
    }
    return seq;
  }

  leftBracket(tok: i32, soft: boolean = false): void {
    this.left = this.v.tokenPiece(tok, -1, false, soft);
  }

  rightBracket(tok: i32): void {
    this.addCommentsBefore(tok, IN_NONE, false);
    this.right = this.v.tokenPiece(tok, -1, false, false);
  }

  add(p: DtPiece, indent: i32 = 0, allowBlankAfter: boolean = true): void {
    const el = this.v.pf.make(PK_SEQUENCE_ELEMENT);
    el.i0 = indent;
    el.a = p;
    this.elements.push(el);
    this.allowBlank = allowBlankAfter;
  }

  visit(node: i32, indent: i32 = 0, blankBefore: boolean = false): void {
    const v = this.v;
    const tok = v.a.beg[node];
    const wrote = this.addCommentsBefore(tok, indent, blankBefore);
    if (blankBefore && !wrote) {
      this.addBlank();
    }
    this.add(v.nodePiece(node, false, NC_NONE), indent, true);
  }

  addBlank(): void {
    if (this.elements.length === 0) {
      return;
    }
    if (!this.allowBlank) {
      return;
    }
    this.elements[this.elements.length - 1].b0 = true;
  }

  addCommentsBefore(tok: i32, indent: i32 = 0, blankBefore: boolean = false): boolean {
    const v = this.v;
    let wrote = false;
    const comments = v.cw.takeCommentsBefore(tok);
    if (blankBefore && !comments.containsBlankLine()) {
      this.addBlank();
      wrote = true;
    }
    for (let i = 0; i < comments.len(); i++) {
      const c = v.commentPiece(comments.cs[i], WS_NONE);
      if (this.elements.length > 0 && comments.isHanging(i)) {
        this.elements[this.elements.length - 1].list.push(c);
      } else {
        if (comments.linesBefore(i) > 1) {
          this.allowBlank = true;
          this.addBlank();
          wrote = true;
        }
        const el = v.pf.make(PK_SEQUENCE_ELEMENT);
        el.i0 = indent;
        el.a = c;
        this.elements.push(el);
      }
    }
    if (comments.linesBeforeNextToken() > 1) {
      if (!comments.isEmpty()) {
        this.allowBlank = true;
      }
      this.addBlank();
      wrote = true;
    }
    return wrote;
  }
}

/** The Piece-building visitor, with PieceWriter's state. */
export class DtVisitor {
  t: DtTokens;
  a: DtAst;
  src: u8[];
  pf: DtPieces;
  cw: DtCommentWriter;
  // PieceWriter.
  stack: DtPiece[][];
  current: DtPiece | null = null;
  pendingSpace: boolean = false;
  // Text appended to the current code piece's last line, kept as bytes
  // until the piece stops being current (see flushText).
  tb: u8[];
  tbN: i32 = 0;
  tbLen: i32 = 0; // in UTF-16 units
  tbPiece: DtPiece | null = null;
  previousCode: DtPiece | null = null;
  metaStack: DtPiece[][];
  // AstNodeVisitor.
  parentContext: i32 = 0;
  // ExpressionContents.
  ecType: i32[];
  ecCollections: i32[];
  ecNamed: i32[];
  ecNested: i32[];
  failed: boolean = false;
  why: string = "";
  // Each node's parent, for the pre-3.13 styles that look at it.
  parent: i32[];

  constructor(t: DtTokens, a: DtAst) {
    this.t = t;
    this.a = a;
    this.src = t.src;
    this.parent = [];
    this.pf = new DtPieces();
    this.cw = new DtCommentWriter(t);
    this.tb = new Array<u8>(256);
    this.stack = [];
    this.metaStack = [];
    this.ecType = [];
    this.ecCollections = [];
    this.ecNamed = [];
    this.ecNested = [];
    this.ecType.push(EC_OTHER_CALL);
    this.ecCollections.push(0);
    this.ecNamed.push(0);
    this.ecNested.push(0);
  }

  fail(why: string): void {
    if (!this.failed) {
      this.failed = true;
      this.why = why;
    }
  }

  f(n: i32, i: i32): i32 {
    return this.a.fld[this.a.fs[n] + i];
  }

  kind(n: i32): i32 {
    return this.a.kind[n];
  }

  // -------------------------------------------------------------------------
  // PieceWriter.

  /** TextPiece.append. */
  /** Appends the source bytes `[a, b)` to the current piece `p`'s last line, deferred. */
  appendSrc(p: DtPiece, a: i32, b: i32): void {
    const cur = this.tbPiece;
    if (cur === null || cur !== p) {
      this.flushText();
      this.tbPiece = p;
    }
    let n = this.tbN;
    // One byte to spare, for a space after.
    if (n + b - a + 1 > toI32(this.tb.length)) {
      let cap = toI32(this.tb.length) * 2;
      while (cap < n + b - a + 1) {
        cap = cap * 2;
      }
      const g = new Array<u8>(cap);
      for (let i = 0; i < n; i++) {
        g[i] = this.tb[i];
      }
      this.tb = g;
    }
    let len = this.tbLen;
    for (let i = a; i < b; i++) {
      const c = this.src[i];
      this.tb[n] = c;
      n++;
      if (c < 0x80 || c >= 0xc0) {
        len += c >= 0xf0 ? 2 : 1;
      }
    }
    this.tbN = n;
    this.tbLen = len;
  }

  /** Moves the deferred text into its piece. */
  flushText(): void {
    const p = this.tbPiece;
    if (p === null) {
      return;
    }
    this.tbPiece = null;
    if (this.tbN === 0) {
      return;
    }
    const text = String.fromBytes(this.tb, 0, this.tbN);
    if (p.lines.length === 0) {
      p.lines.push(text);
      p.lens.push(this.tbLen);
    } else {
      const last = toI32(p.lines.length) - 1;
      p.lines[last] = p.lines[last] + text;
      p.lens[last] = p.lens[last] + this.tbLen;
    }
    this.tbN = 0;
    this.tbLen = 0;
  }

  append(p: DtPiece, text: string, multiline: boolean): void {
    const pend = this.tbPiece;
    if (pend !== null && pend === p) {
      this.flushText();
    }
    if (p.lines.length === 0 && !multiline) {
      p.lines.push(text);
      p.lens.push(dtStrUtf16(text));
      return;
    }
    if (p.lines.length === 0) {
      p.lines.push("");
      p.lens.push(0);
    }
    const last = toI32(p.lines.length) - 1;
    if (!multiline) {
      p.lines[last] = p.lines[last] + text;
      p.lens[last] = p.lens[last] + dtStrUtf16(text);
      return;
    }
    // Split on \r\n, \r or \n.
    let start = 0;
    let first = true;
    const n = toI32(text.length);
    let i = 0;
    while (i <= n) {
      let end = -1;
      let skip = 0;
      if (i === n) {
        end = n;
      } else {
        const c = text.charCodeAt(i);
        if (c === 10) {
          end = i;
          skip = 1;
        } else if (c === 13) {
          end = i;
          skip = i + 1 < n && text.charCodeAt(i + 1) === 10 ? 2 : 1;
        }
      }
      if (end >= 0) {
        const line = text.slice(start, end);
        if (first) {
          const li = toI32(p.lines.length) - 1;
          p.lines[li] = p.lines[li] + line;
          p.lens[li] = p.lens[li] + dtStrUtf16(line);
          first = false;
        } else {
          p.lines.push(line);
          p.lens.push(dtStrUtf16(line));
        }
        if (i === n) {
          break;
        }
        i += skip;
        start = i;
      } else {
        i++;
      }
    }
  }

  lexeme(tok: i32): string {
    return String.fromBytes(this.src, this.t.start[tok], this.t.end[tok]);
  }

  token(tok: i32, spaceBefore: boolean = false, spaceAfter: boolean = false, soft0: boolean = false): void {
    if (tok < 0) {
      return;
    }
    // Soft text only with soft overflow (3.13 on).
    const soft = soft0 && dtV313();
    if (spaceBefore) {
      this.space();
    }
    const cur = this.current;
    if (this.cw.hasComments(tok)) {
      this.beginCodeToken(tok, soft);
    } else if (cur !== null && cur.soft === soft) {
      if (this.pendingSpace) {
        this.appendSrc(cur, -1, -1);
        this.tb[this.tbN] = 32;
        this.tbN = this.tbN + 1;
        this.tbLen = this.tbLen + 1;
        this.pendingSpace = false;
      }
      this.appendSrc(cur, this.t.start[tok], this.t.end[tok]);
    } else {
      this.beginCodeToken(tok, soft);
    }
    if (spaceAfter) {
      this.space();
    }
  }

  multilineToken(tok: i32, soft: boolean): void {
    const comments = this.cw.commentsBefore(tok);
    const p = this.pf.make(PK_CODE);
    p.soft = soft && dtV313();
    p.list = this.splitComments(comments, tok);
    this.append(p, this.lexeme(tok), true);
    this.previousCode = p;
    this.add(p);
  }

  space(): void {
    this.pendingSpace = true;
  }

  modifier(tok: i32): void {
    this.token(tok, false, true, false);
  }

  add(p: DtPiece): void {
    this.flushSpace();
    this.stack[this.stack.length - 1].push(p);
    this.flushText();
    this.current = null;
  }

  begin(): void {
    this.flushSpace();
    this.flushText();
    this.current = null;
    const fresh: DtPiece[] = [];
    this.stack.push(fresh);
  }

  end(): DtPiece {
    this.flushSpace();
    this.flushText();
    this.current = null;
    const built = this.stack.pop();
    if (built.length === 1) {
      return built[0];
    }
    if (built.length === 0) {
      this.fail("empty build");
      return this.pf.make(PK_ADJACENT);
    }
    const p = this.pf.make(PK_ADJACENT);
    p.list = built;
    return p;
  }

  /** build() with metadata: the leading pieces are made before the content. */
  beginMeta(meta: i32): void {
    this.flushSpace();
    this.flushText();
    this.current = null;
    const leading: DtPiece[] = [];
    const n = this.a.len(meta);
    if (n > 0) {
      for (let i = 0; i < n; i++) {
        leading.push(this.nodePiece(this.a.at(meta, i), false, NC_NONE));
      }
      const after = this.a.end[this.a.at(meta, n - 1)] + 1;
      for (const c of this.takeCommentsBefore(after)) {
        leading.push(c);
      }
    }
    this.metaStack.push(leading);
    const fresh: DtPiece[] = [];
    this.stack.push(fresh);
  }

  endMeta(inline: boolean): DtPiece {
    const built = this.end();
    const leading = this.metaStack.pop();
    if (leading.length === 0) {
      return built;
    }
    if (inline) {
      const lb = new DtListBuilder(this, new DtListStyle(CM_NONE, 1, true));
      for (const p of leading) {
        lb.add(p);
      }
      lb.add(built);
      return lb.build(false, true);
    }
    const sb = new DtSeqBuilder(this);
    for (const p of leading) {
      sb.add(p, IN_NONE, true);
    }
    sb.add(built, IN_NONE, true);
    return sb.build(true);
  }

  /** withMetadata: answers whether it began a wrapping build. */
  withMetaBegin(meta: i32): boolean {
    if (this.a.len(meta) === 0) {
      return false;
    }
    this.beginMeta(meta);
    return true;
  }

  withMetaEnd(began: boolean, inline: boolean): void {
    if (began) {
      this.add(this.endMeta(inline));
    }
  }

  tokenPiece(tok: i32, discarded: i32 = -1, commaAfter: boolean = false, soft: boolean = false): DtPiece {
    const p = this.makeCodePiece(tok, discarded, soft);
    if (commaAfter) {
      const next = tok + 1;
      if (this.t.kind[next] === T_COMMA) {
        const adj = this.pf.make(PK_ADJACENT);
        adj.list.push(p);
        adj.list.push(this.makeCodePiece(next, -1, soft));
        return adj;
      }
    }
    return p;
  }

  commentPiece(c: DtComment, trailing: i32): DtPiece {
    const off = c.text === "// dart format off";
    const on = c.text === "// dart format on";
    const p = this.pf.make(off || on ? PK_ENABLE_FORMATTING : PK_COMMENT);
    if (off || on) {
      p.b0 = on;
      p.i1 = c.offset + toI32(c.text.length);
    }
    p.i0 = trailing;
    p.soft = dtV313();
    this.append(p, c.text, c.type !== CT_LINE);
    return p;
  }

  takeCommentsBefore(tok: i32): DtPiece[] {
    return this.splitComments(this.cw.takeCommentsBefore(tok), tok);
  }

  /** hoistLeadingComments with the comments already taken. */
  addHoisted(leading: DtPiece[], p: DtPiece): void {
    if (leading.length > 0) {
      const lc = this.pf.make(PK_LEADING_COMMENT);
      lc.list = leading;
      lc.a = p;
      this.add(lc);
    } else {
      this.add(p);
    }
  }

  beginCodeToken(tok: i32, soft: boolean): void {
    this.flushSpace();
    const code = this.makeCodePiece(tok, -1, soft);
    this.stack[this.stack.length - 1].push(code);
    this.flushText();
    this.current = code;
  }

  flushSpace(): void {
    if (!this.pendingSpace) {
      return;
    }
    this.stack[this.stack.length - 1].push(this.pf.make(PK_SPACE));
    this.pendingSpace = false;
  }

  makeCodePiece(tok: i32, discarded: i32, soft: boolean): DtPiece {
    let comments = this.cw.commentsBefore(tok);
    if (discarded >= 0) {
      comments = this.cw.commentsBefore(discarded).concatenate(comments);
    }
    const p = this.pf.make(PK_CODE);
    p.soft = soft && dtV313();
    p.list = this.splitComments(comments, tok);
    this.append(p, this.lexeme(tok), false);
    this.previousCode = p;
    return p;
  }

  splitComments(comments: DtComments, tok: i32): DtPiece[] {
    const leading: DtPiece[] = [];
    if (comments.isEmpty()) {
      return leading;
    }
    let afterHanging = false;
    const k = this.t.kind[tok];
    for (let i = 0; i < comments.len(); i++) {
      const c = comments.cs[i];
      let trailing = WS_SPACE;
      if (c.requiresNewline()) {
        trailing = WS_NEWLINE;
      } else if (k === T_RBRACKET || k === T_RBRACE || k === T_COMMA || k === T_SEMI) {
        trailing = WS_NONE;
      }
      const cp = this.commentPiece(c, trailing);
      const prev = this.previousCode;
      if (!afterHanging && comments.isHanging(i) && prev !== null) {
        prev.list2.push(cp);
      } else {
        leading.push(cp);
        afterHanging = true;
      }
    }
    return leading;
  }

  // -------------------------------------------------------------------------
  // PieceFactory helpers.

  nodePiece(node: i32, commaAfter: boolean = false, context: i32 = 0): DtPiece {
    this.begin();
    this.visitNode(node, context);
    let r = this.end();
    if (commaAfter) {
      const next = this.a.end[node] + 1;
      if (this.t.kind[next] === T_COMMA) {
        const comma = this.tokenPiece(next, -1, false, false);
        const adj = this.pf.make(PK_ADJACENT);
        adj.list.push(r);
        adj.list.push(comma);
        r = adj;
      }
    }
    return r;
  }

  optionalNodePiece(node: i32): DtPiece | null {
    if (node < 0) {
      return null;
    }
    return this.nodePiece(node, false, NC_NONE);
  }

  visit(node: i32, spaceBefore: boolean = false, spaceAfter: boolean = false, context: i32 = 0): void {
    if (node < 0) {
      return;
    }
    if (spaceBefore) {
      this.space();
    }
    this.visitNode(node, context);
    if (spaceAfter) {
      this.space();
    }
  }

  /** AstNodeVisitor.visitNode. */
  visitNode(node: i32, context: i32): void {
    const prev = this.parentContext;
    this.parentContext = context;
    const first = this.a.beg[node];
    if (this.cw.hasComments(first)) {
      const comments = this.takeCommentsBefore(first);
      this.begin();
      this.accept(node);
      let p = this.end();
      if (comments.length > 0) {
        const lc = this.pf.make(PK_LEADING_COMMENT);
        lc.list = comments;
        lc.a = p;
        p = lc;
      }
      this.add(p);
    } else {
      this.accept(node);
    }
    this.parentContext = prev;
  }

  infix(operands: DtPiece[], indent: i32, conditional: boolean): DtPiece {
    const p = this.pf.make(PK_INFIX);
    p.list = operands;
    p.i0 = indent;
    p.b0 = conditional;
    return p;
  }

  assignPiece(left: DtPiece, right: DtPiece, avoidSplit: boolean = true): DtPiece {
    const p = this.pf.make(PK_ASSIGN);
    p.a = left;
    p.b = right;
    p.b0 = avoidSplit;
    return p;
  }

  /** AssignPiece3Dot7. */
  assign37(
    left: DtPiece | null,
    op: DtPiece,
    right: DtPiece,
    canBlockSplitLeft: boolean,
    canBlockSplitRight: boolean,
    avoidBlockSplitRight: boolean,
  ): DtPiece {
    const p = this.pf.make(PK_ASSIGN37);
    p.a = left;
    p.b = op;
    p.c = right;
    p.b0 = canBlockSplitLeft;
    p.b1 = canBlockSplitRight;
    p.b2 = avoidBlockSplitRight;
    return p;
  }

  isPatternKind(k: i32): boolean {
    return (
      k === N_CONSTANT_PATTERN ||
      k === N_DECLARED_VARIABLE_PATTERN ||
      k === N_ASSIGNED_VARIABLE_PATTERN ||
      k === N_WILDCARD_PATTERN ||
      k === N_LIST_PATTERN ||
      k === N_MAP_PATTERN ||
      k === N_RECORD_PATTERN ||
      k === N_OBJECT_PATTERN ||
      k === N_PARENTHESIZED_PATTERN ||
      k === N_LOGICAL_OR_PATTERN ||
      k === N_LOGICAL_AND_PATTERN ||
      k === N_RELATIONAL_PATTERN ||
      k === N_CAST_PATTERN ||
      k === N_NULL_CHECK_PATTERN ||
      k === N_NULL_ASSERT_PATTERN
    );
  }

  /** canBlockSplit of an expression or pattern (false for anything else). */
  canBlockSplitAny(n: i32): boolean {
    if (this.isPatternKind(this.kind(n))) {
      return this.patternCanBlockSplit(n);
    }
    return this.canBlockSplit(n);
  }

  /** AdjacentStrings.indentStrings3Dot7. */
  indentStrings37(n: i32): boolean {
    const p = this.parentOf(n);
    const pk = this.kind(p);
    if (pk === N_ARGUMENT_LIST) {
      const args = this.f(p, 1);
      for (let i = 0; i < this.a.len(args); i++) {
        const x = this.a.at(args, i);
        if (x !== n && this.isStringLiteralNode(x)) {
          return true;
        }
      }
      return false;
    }
    if (pk === N_ASSERT_INITIALIZER || pk === N_ASSERT_STATEMENT) {
      const c = this.f(p, 2);
      const m = this.f(p, 4);
      return (c !== n && this.isStringLiteralNode(c)) || (m >= 0 && m !== n && this.isStringLiteralNode(m));
    }
    if (
      pk === N_VARIABLE_DECLARATION ||
      pk === N_NAMED_ARGUMENT ||
      pk === N_RECORD_LITERAL_NAMED_FIELD ||
      pk === N_EXPRESSION_FUNCTION_BODY
    ) {
      return false;
    }
    if (pk === N_ASSIGNMENT_EXPRESSION && this.f(p, 2) === n) {
      return false;
    }
    if (pk === N_MAP_LITERAL_ENTRY && this.f(p, 4) === n) {
      return false;
    }
    return true;
  }

  isStringLiteralNode(n: i32): boolean {
    const k = this.kind(n);
    return k === N_SIMPLE_STRING_LITERAL || k === N_STRING_INTERPOLATION || k === N_ADJACENT_STRINGS;
  }

  variablePiece(header: DtPiece, vars: DtPiece[], hasType: boolean): DtPiece {
    const p = this.pf.make(PK_VARIABLE);
    p.a = header;
    p.list = vars;
    p.b0 = hasType;
    return p;
  }

  // -------------------------------------------------------------------------
  // ast_extensions.

  /** canSplit: elements or a comment before the closing bracket. */
  canSplit(list: i32, right: i32): boolean {
    return this.a.len(list) > 0 || this.cw.hasComments(right);
  }

  /** blockFormatType on AstNode. */
  blockFormatNode(n: i32): i32 {
    const k = this.kind(n);
    if (k === N_ADJACENT_STRINGS) {
      return this.f(n, 1) === 1 ? BF_INDENTED_ADJACENT : BF_UNINDENTED_ADJACENT;
    }
    if (k === N_NAMED_ARGUMENT) {
      return this.blockFormat(this.f(n, 2));
    }
    return this.blockFormat(n);
  }

  /** blockFormatType on Expression. */
  blockFormat(n: i32): i32 {
    const k = this.kind(n);
    switch (k) {
      case N_CASCADE_EXPRESSION:
        if (this.a.len(this.f(n, 1)) === 1 && this.canBlockSplit(this.f(n, 0))) {
          return BF_INVOCATION;
        }
        return BF_NONE;
      case N_FUNCTION_EXPRESSION: {
        const body = this.f(n, 2);
        if (this.kind(body) === N_BLOCK_FUNCTION_BODY) {
          const block = this.f(body, 2);
          if (this.canSplit(this.f(block, 1), this.f(block, 2))) {
            return BF_FUNCTION;
          }
        }
        return BF_NONE;
      }
      case N_FUNCTION_EXPRESSION_INVOCATION: {
        const fn = this.f(n, 0);
        if (this.kind(fn) === N_FUNCTION_EXPRESSION && this.blockFormat(fn) === BF_FUNCTION) {
          return BF_FUNCTION;
        }
        const args = this.f(n, 2);
        if (this.canSplit(this.f(args, 1), this.f(args, 2))) {
          return BF_INVOCATION;
        }
        return BF_NONE;
      }
      case N_LIST_LITERAL:
      case N_SET_OR_MAP_LITERAL:
        if (this.canSplit(this.f(n, 3), this.f(n, 4))) {
          return BF_COLLECTION;
        }
        return BF_NONE;
      case N_RECORD_LITERAL:
        if (this.canSplit(this.f(n, 2), this.f(n, 3))) {
          return BF_COLLECTION;
        }
        return BF_NONE;
      case N_SWITCH_EXPRESSION:
        if (this.canSplit(this.f(n, 5), this.f(n, 6))) {
          return BF_COLLECTION;
        }
        return BF_NONE;
      case N_INSTANCE_CREATION_EXPRESSION: {
        const args = this.f(n, 2);
        if (this.canSplit(this.f(args, 1), this.f(args, 2))) {
          return BF_INVOCATION;
        }
        return BF_NONE;
      }
      case N_METHOD_INVOCATION: {
        const args = this.f(n, 4);
        if (this.canSplit(this.f(args, 1), this.f(args, 2))) {
          return BF_INVOCATION;
        }
        return BF_NONE;
      }
      case N_STRING_INTERPOLATION:
        return this.isMultilineInterpolation(n) ? BF_COLLECTION : BF_NONE;
      case N_SIMPLE_STRING_LITERAL:
        return this.isMultilineString(this.f(n, 0)) ? BF_COLLECTION : BF_NONE;
      case N_PARENTHESIZED_EXPRESSION:
        return this.blockFormat(this.f(n, 1));
      case N_AWAIT_EXPRESSION:
        return this.blockFormat(this.f(n, 1));
      default:
        return BF_NONE;
    }
  }

  canBlockSplit(n: i32): boolean {
    return this.blockFormat(n) !== BF_NONE;
  }

  /** PatternExtensions.canBlockSplit. */
  patternCanBlockSplit(n: i32): boolean {
    const k = this.kind(n);
    switch (k) {
      case N_CONSTANT_PATTERN:
        return this.canBlockSplit(this.f(n, 1));
      case N_LIST_PATTERN:
      case N_MAP_PATTERN:
        return this.canSplit(this.f(n, 2), this.f(n, 3));
      case N_OBJECT_PATTERN:
        return this.canSplit(this.f(n, 2), this.f(n, 3));
      case N_RECORD_PATTERN:
        return this.canSplit(this.f(n, 1), this.f(n, 2));
      default:
        return false;
    }
  }

  /** Whether the string token's lexeme opens with three quotes. */
  isMultilineString(tok: i32): boolean {
    let i = this.t.start[tok];
    const e = this.t.end[tok];
    if (i < e && toI32(this.src[i]) === 114) {
      i++;
    }
    if (i + 2 >= e) {
      return false;
    }
    const q = toI32(this.src[i]);
    return (q === 39 || q === 34) && toI32(this.src[i + 1]) === q && toI32(this.src[i + 2]) === q;
  }

  isMultilineInterpolation(n: i32): boolean {
    const els = this.f(n, 0);
    const first = this.a.at(els, 0);
    return this.isMultilineString(this.f(first, 0));
  }

  hasSingleElement(n0: i32): boolean {
    let n = n0;
    while (true) {
      const k = this.kind(n);
      if (k === N_PARENTHESIZED_EXPRESSION || k === N_AWAIT_EXPRESSION) {
        n = this.f(n, 1);
      } else if (k === N_POSTFIX_EXPRESSION) {
        n = this.f(n, 0);
      } else {
        break;
      }
    }
    const k = this.kind(n);
    if (k === N_METHOD_INVOCATION) {
      return this.a.len(this.f(this.f(n, 4), 1)) === 1;
    }
    if (k === N_INSTANCE_CREATION_EXPRESSION || k === N_FUNCTION_EXPRESSION_INVOCATION) {
      return this.a.len(this.f(this.f(n, 2), 1)) === 1;
    }
    if (k === N_LIST_LITERAL || k === N_SET_OR_MAP_LITERAL) {
      return this.a.len(this.f(n, 3)) === 1;
    }
    if (k === N_RECORD_LITERAL) {
      return this.a.len(this.f(n, 2)) === 1;
    }
    return false;
  }

  /** looksLikeStaticCall. */
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
    const s = this.t.start[tok];
    const e = this.t.end[tok];
    const t = this.t;
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

  /** hasNonEmptyBody. */
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
    return body >= 0 && this.kind(body) === N_BLOCK_FUNCTION_BODY && this.a.len(this.f(this.f(body, 2), 1)) > 0;
  }

  isControlFlowElement(n: i32): boolean {
    const k = this.kind(n);
    return k === N_IF_ELEMENT || k === N_FOR_ELEMENT;
  }

  /** spreadCollection: `n` itself when it spreads a non-empty literal, else -1. */
  spreadCollection(n: i32): i32 {
    if (this.kind(n) !== N_SPREAD_ELEMENT) {
      return -1;
    }
    const e = this.f(n, 1);
    const k = this.kind(e);
    if ((k === N_LIST_LITERAL || k === N_SET_OR_MAP_LITERAL) && this.canSplit(this.f(e, 3), this.f(e, 4))) {
      return n;
    }
    return -1;
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

  containsLineComments(list: i32, right: i32): boolean {
    for (let i = 0; i < this.a.len(list); i++) {
      if (this.hasLineCommentBefore(this.a.beg[this.a.at(list, i)])) {
        return true;
      }
    }
    return right >= 0 && this.hasLineCommentBefore(right);
  }

  /** commaAfter: the comma token after `n`, or -1. */
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

  // -------------------------------------------------------------------------
  // ExpressionContents.

  isTrivial(n: i32): boolean {
    const k = this.kind(n);
    if (k === N_NULL_LITERAL || k === N_BOOLEAN_LITERAL || k === N_INTEGER_LITERAL || k === N_DOUBLE_LITERAL) {
      return true;
    }
    if (k === N_PREFIX_EXPRESSION && this.t.kind[this.f(n, 0)] === T_MINUS) {
      return this.isTrivial(this.f(n, 1));
    }
    return false;
  }

  ecPush(type: i32, named: i32): void {
    this.ecType.push(type);
    this.ecCollections.push(0);
    this.ecNamed.push(named);
    this.ecNested.push(0);
  }

  /** _end: pops the top and folds it into its parent; answers its index's values via fields. */
  ecPopType: i32 = 0;
  ecPopCollections: i32 = 0;
  ecPopNamed: i32 = 0;
  ecPopNested: i32 = 0;

  ecEnd(): void {
    this.ecPopType = this.ecType.pop();
    this.ecPopCollections = this.ecCollections.pop();
    this.ecPopNamed = this.ecNamed.pop();
    this.ecPopNested = this.ecNested.pop();
    const top = toI32(this.ecType.length) - 1;
    this.ecCollections[top] = this.ecCollections[top] + this.ecPopCollections;
    this.ecNested[top] = this.ecNested[top] + this.ecPopNamed + this.ecPopNested;
  }

  beginCall(args: i32): void {
    let type = EC_OTHER_CALL;
    let named = 0;
    for (let i = 0; i < this.a.len(args); i++) {
      const x = this.a.at(args, i);
      if (this.kind(x) === N_NAMED_ARGUMENT) {
        type = EC_CALL_WITH_NAMED;
        if (!this.isTrivial(this.f(x, 2))) {
          named++;
        }
      }
    }
    this.ecPush(type, named);
  }

  endCall(): boolean {
    this.ecEnd();
    const total = this.ecPopNamed + this.ecPopNested;
    return total > 2 && this.ecPopNamed > 0 && this.ecPopNested > 0;
  }

  beginCollection(isNamed: boolean): void {
    const top = toI32(this.ecType.length) - 1;
    this.ecCollections[top] = this.ecCollections[top] + 1;
    this.ecPush(isNamed ? EC_NAMED_COLLECTION : EC_COLLECTION, 0);
  }

  endCollection(elements: i32): boolean {
    this.ecEnd();
    if (this.ecPopCollections > 0) {
      return true;
    }
    return this.a.len(elements) > 1 && this.ecPopType === EC_NAMED_COLLECTION && this.ecPopNamed + this.ecPopNested > 0;
  }

  // -------------------------------------------------------------------------
  // PieceFactory.

  writeArgumentList(n: i32): void {
    this.writeArguments(this.f(n, 0), this.f(n, 1), this.f(n, 2));
  }

  writeArguments(left: i32, args: i32, right: i32): void {
    if (!this.canSplit(args, right)) {
      this.token(left);
      this.token(right);
      return;
    }
    if (dtIs37()) {
      // 3.7: no eager splitting of complex calls.
      const lb = new DtListBuilder(this, dtStyleDefault());
      lb.leftBracket(left);
      lb.visitAll(args, true);
      lb.rightBracket(right);
      this.add(lb.build(false, true));
      return;
    }
    this.beginCall(args);
    const b = new DtListBuilder(this, dtStyleDefault());
    b.leftBracket(left);
    b.visitAll(args, true);
    b.rightBracket(right);
    const p = b.build(false, true);
    if (this.endCall()) {
      if (p.kind !== PK_LIST || !dtListHasBlockElement(p)) {
        dtPin(p, S_SPLIT);
      }
    }
    this.add(p);
  }

  /** writeArguments for an assert: the condition and message as arguments. */
  writeAssertArguments(left: i32, cond: i32, msg: i32, right: i32): void {
    const xs: i32[] = [];
    xs.push(cond);
    if (msg >= 0) {
      xs.push(msg);
    }
    this.writeArguments(left, this.a.list(xs), right);
  }

  writeBody(left: i32, contents: i32, right: i32, forceSplit: boolean): void {
    if (!forceSplit && !this.canSplit(contents, right)) {
      this.token(left);
      this.token(right);
      return;
    }
    const seq = new DtSeqBuilder(this);
    seq.leftBracket(left, true);
    let needsBlank = false;
    for (let i = 0; i < this.a.len(contents); i++) {
      const node = this.a.at(contents, i);
      seq.visit(node, IN_NONE, needsBlank);
      needsBlank = this.hasNonEmptyBody(node);
    }
    seq.rightBracket(right);
    this.add(seq.build(forceSplit));
  }

  writeBlock(block: i32, forceSplit: boolean): void {
    this.writeBody(this.f(block, 0), this.f(block, 1), this.f(block, 2), forceSplit);
  }

  writeBreak(keyword: i32, label: i32, semi: i32): void {
    this.token(keyword);
    this.visit(label, true);
    this.token(semi);
  }

  writeChain(n: i32): void {
    const cb = new DtChainBuilder(this, n);
    this.add(cb.build(this.parentContext === NC_CASCADE_TARGET));
  }

  writeCollection(
    left: i32,
    elements: i32,
    right: i32,
    cst: i32,
    targs: i32,
    style: DtListStyle,
    splitEagerly: boolean,
    preserveNewlines: boolean,
  ): void {
    this.modifier(cst);
    this.visit(targs);
    if (!this.canSplit(elements, right)) {
      this.token(left);
      this.token(right);
      return;
    }
    if (splitEagerly) {
      this.beginCollection(this.parentContext === NC_NAMED_EXPRESSION);
    }
    this.begin();
    this.writeList(elements, left, right, style, preserveNewlines, false, true);
    const collection = this.end();
    if (splitEagerly && this.endCollection(elements)) {
      dtPin(collection, S_SPLIT);
    }
    this.add(collection);
  }

  createCommaSeparated(list: i32): DtPiece {
    const b = new DtListBuilder(this, new DtListStyle(CM_NON_TRAILING, 1, false));
    for (let i = 0; i < this.a.len(list); i++) {
      b.visit(this.a.at(list, i));
    }
    return b.build(false, true);
  }

  writeControlFlowStart(keyword: i32, lp: i32, value: i32, rp: i32): void {
    this.token(keyword);
    this.space();
    this.token(lp);
    this.visit(value);
    this.token(rp);
  }

  createEnumConstant(n: i32, commaAfter: boolean, semicolon: i32): DtPiece {
    this.beginMeta(this.f(n, 0));
    this.token(this.f(n, 1));
    const args = this.f(n, 2);
    if (args >= 0) {
      this.visit(this.f(args, 0));
      this.visit(this.f(args, 1));
      this.visit(this.f(args, 2));
    }
    if (commaAfter) {
      this.token(this.commaAfter(n));
    } else if (semicolon >= 0) {
      this.add(this.tokenPiece(semicolon, this.commaAfter(n), false, false));
    }
    return this.endMeta(false);
  }

  writeFor(
    awaitTok: i32,
    forTok: i32,
    lp: i32,
    parts: i32,
    rp: i32,
    body: i32,
    hasBlockBody: boolean,
    forceSplitBody: boolean,
  ): void {
    this.begin();
    this.modifier(awaitTok);
    this.token(forTok);
    const forKw = this.end();
    const pk = this.kind(parts);
    const partsPiece = this.forPartsPiece(lp, parts, rp);
    const bodyPiece = this.nodePiece(body, false, NC_NONE);
    let indentHeader = false;
    if (pk === N_FOR_EACH_PARTS_WITH_DECLARATION) {
      indentHeader = this.a.len(this.f(this.f(parts, 0), 0)) > 0;
    } else if (pk === N_FOR_EACH_PARTS_WITH_PATTERN) {
      indentHeader = this.a.len(this.f(parts, 0)) > 0;
    }
    const fp = this.pf.make(PK_FOR);
    fp.a = forKw;
    fp.b = partsPiece;
    fp.b0 = indentHeader;
    if (hasBlockBody) {
      this.add(fp);
      this.space();
      this.add(bodyPiece);
    } else {
      const cf = this.pf.make(PK_CONTROL_FLOW);
      cf.b0 = true;
      cf.list.push(fp);
      cf.list2.push(bodyPiece);
      cf.ints.push(0);
      if (forceSplitBody) {
        dtPin(cf, S_SPLIT);
      }
      this.add(cf);
    }
  }

  forPartsPiece(lp: i32, parts: i32, rp: i32): DtPiece {
    const pk = this.kind(parts);
    if (
      pk === N_FOR_PARTS_WITH_EXPRESSION &&
      this.f(parts, 0) < 0 &&
      !this.cw.hasComments(this.f(parts, 1)) &&
      this.f(parts, 2) < 0 &&
      !this.cw.hasComments(this.f(parts, 3)) &&
      this.a.len(this.f(parts, 4)) === 0 &&
      !this.cw.hasComments(rp)
    ) {
      this.begin();
      this.token(lp);
      this.token(this.f(parts, 1));
      this.token(this.f(parts, 3));
      this.token(rp);
      return this.end();
    } else if (
      pk === N_FOR_PARTS_WITH_EXPRESSION ||
      pk === N_FOR_PARTS_WITH_DECLARATIONS ||
      pk === N_FOR_PARTS_WITH_PATTERN
    ) {
      const pl = new DtListBuilder(this, new DtListStyle(CM_NONE, 1, false));
      pl.leftBracket(lp);
      const init = this.f(parts, 0);
      const ls = this.f(parts, 1);
      const rs = this.f(parts, 3);
      if (init >= 0) {
        pl.addCommentsBefore(this.a.beg[init]);
        this.begin();
        this.visit(init, false, false, NC_FOR_LOOP_VARIABLE);
        this.token(ls);
        pl.add(this.end());
      } else {
        pl.addCommentsBefore(ls);
        pl.add(this.tokenPiece(ls));
      }
      const cond = this.f(parts, 2);
      if (cond >= 0) {
        pl.addCommentsBefore(this.a.beg[cond]);
        this.begin();
        this.visit(cond);
        this.token(rs);
        pl.add(this.end());
      } else {
        pl.addCommentsBefore(rs);
        pl.add(this.tokenPiece(rs));
      }
      const ups = this.f(parts, 4);
      if (this.a.len(ups) > 0) {
        pl.addCommentsBefore(this.a.beg[this.a.at(ups, 0)]);
        const ub = new DtListBuilder(this, new DtListStyle(CM_NON_TRAILING, 1, false));
        for (let i = 0; i < this.a.len(ups); i++) {
          ub.visit(this.a.at(ups, i));
        }
        pl.addInner(ub, false);
      }
      pl.rightBracket(rp);
      return pl.build(false, true);
    } else if (pk === N_FOR_EACH_PARTS_WITH_DECLARATION) {
      this.begin();
      this.token(lp);
      this.writeDeclaredForIn(this.f(parts, 0), this.f(parts, 1), this.f(parts, 2));
      this.token(rp);
      return this.end();
    } else if (pk === N_FOR_EACH_PARTS_WITH_IDENTIFIER) {
      this.begin();
      this.token(lp);
      this.writeForIn(this.f(parts, 0), this.f(parts, 1), this.f(parts, 2));
      this.token(rp);
      return this.end();
    }
    {
      // ForEachPartsWithPattern.
      const meta = this.f(parts, 0);
      const keyword = this.f(parts, 1);
      this.begin();
      this.token(lp);
      const first = this.a.len(meta) > 0 ? this.a.beg[this.a.at(meta, 0)] : keyword;
      const leading = this.takeCommentsBefore(first);
      this.beginMeta(meta);
      this.token(keyword);
      this.space();
      this.writeForIn(this.f(parts, 2), this.f(parts, 3), this.f(parts, 4));
      const inner = this.endMeta(true);
      this.addHoisted(leading, inner);
      this.token(rp);
      return this.end();
    }
  }

  writeFormalParameter(n: i32, type: i32, name: i32, mutable: i32, fieldKw: i32, period: i32): void {
    const def = this.f(n, 9);
    const mods: i32[] = [];
    mods.push(this.f(n, 1));
    mods.push(this.f(n, 2));
    mods.push(mutable);
    this.writeParameter(
      type,
      name,
      this.f(n, 0),
      mods,
      fieldKw,
      period,
      def >= 0 ? this.f(def, 0) : -1,
      def >= 0 ? this.f(def, 1) : -1,
    );
  }

  writeFunction(
    meta: i32,
    modifiers: i32[],
    returnType: i32,
    property: i32,
    name: i32,
    tps: i32,
    params: i32,
    body: i32,
  ): void {
    const began = this.withMetaBegin(meta);
    if (returnType < 0) {
      for (const k of modifiers) {
        this.modifier(k);
      }
      this.modifier(property);
      this.token(name);
      this.visit(tps);
      this.visit(params);
      this.visit(body);
    } else {
      let first = -1;
      for (const k of modifiers) {
        if (k >= 0 && first < 0) {
          first = k;
        }
      }
      if (first < 0) {
        first = this.a.beg[returnType];
      }
      const leading = this.takeCommentsBefore(first);
      this.begin();
      for (const k of modifiers) {
        this.modifier(k);
      }
      this.visit(returnType);
      const rt = this.end();
      this.begin();
      this.modifier(property);
      this.token(name);
      this.visit(tps);
      this.visit(params);
      this.visit(body);
      const sig = this.end();
      const vars: DtPiece[] = [];
      vars.push(sig);
      this.addHoisted(leading, this.variablePiece(rt, vars, true));
    }
    this.withMetaEnd(began, false);
  }

  /**
   * writeFunctionType. `parameter` is the formal parameter node for a
   * function-typed formal, or -1 for a GenericFunctionType.
   */
  writeFunctionType(
    returnType: i32,
    fnOrName: i32,
    tps: i32,
    params: i32,
    question: i32,
    parameter: i32,
    fieldKw: i32,
    period: i32,
  ): void {
    const meta = parameter >= 0 ? this.f(parameter, 0) : 0;
    const began = this.withMetaBegin(meta);
    const mods: i32[] = [];
    mods.push(parameter >= 0 ? this.f(parameter, 1) : -1);
    mods.push(parameter >= 0 ? this.f(parameter, 2) : -1);
    mods.push(parameter >= 0 ? this.f(parameter, 3) : -1);
    const def = parameter >= 0 ? this.f(parameter, 9) : -1;
    if (def >= 0) {
      this.begin();
      this.writeFunctionAndReturnType(mods, returnType, fieldKw, period, fnOrName, tps, params, question);
      const fn = this.end();
      this.writeDefaultValue(fn, this.f(def, 0), this.f(def, 1));
    } else {
      this.writeFunctionAndReturnType(mods, returnType, fieldKw, period, fnOrName, tps, params, question);
    }
    this.withMetaEnd(began, true);
  }

  /** writeFunctionAndReturnType with writeFunctionType's write(). */
  writeFunctionAndReturnType(
    mods: i32[],
    returnType: i32,
    fieldKw: i32,
    period: i32,
    fnOrName: i32,
    tps: i32,
    params: i32,
    question: i32,
  ): void {
    if (returnType < 0) {
      for (const m of mods) {
        this.modifier(m);
      }
      this.token(fieldKw);
      this.token(period);
      this.token(fnOrName);
      this.visit(tps);
      this.visit(params);
      this.token(question);
      return;
    }
    let first = -1;
    for (const m of mods) {
      if (m >= 0 && first < 0) {
        first = m;
      }
    }
    if (first < 0) {
      first = this.a.beg[returnType];
    }
    const leading = this.takeCommentsBefore(first);
    this.begin();
    for (const m of mods) {
      this.modifier(m);
    }
    this.visit(returnType);
    const rt = this.end();
    this.begin();
    this.token(fieldKw);
    this.token(period);
    this.token(fnOrName);
    this.visit(tps);
    this.visit(params);
    this.token(question);
    const sig = this.end();
    const vars: DtPiece[] = [];
    vars.push(sig);
    this.addHoisted(leading, this.variablePiece(rt, vars, true));
  }

  writeDefaultValue(parameter: DtPiece, separator: i32, value: i32): void {
    if (separator < 0) {
      this.add(parameter);
      return;
    }
    this.begin();
    if (!dtIs37()) {
      this.add(parameter);
    }
    const isEq = this.t.kind[separator] === T_EQ;
    if (isEq) {
      this.space();
    }
    this.token(separator);
    if (!isEq) {
      this.space();
    }
    const op = this.end();
    const vp = this.nodePiece(value, false, NC_ASSIGNMENT);
    if (dtIs37()) {
      this.add(this.assign37(parameter, op, vp, false, this.canBlockSplit(value), false));
      return;
    }
    this.add(this.assignPiece(op, vp, true));
  }

  writeParenthesized(left: i32, content: i32, right: i32): void {
    this.token(left);
    this.visit(content);
    this.token(right);
  }

  writeIfCondition(ifTok: i32, lp: i32, expr: i32, caseClause: i32, rp: i32): void {
    this.token(ifTok);
    this.space();
    this.token(lp);
    if (caseClause >= 0) {
      const ep = this.nodePiece(expr, false, NC_NONE);
      const gp = this.f(caseClause, 1);
      const pattern = this.f(gp, 0);
      this.begin();
      this.token(this.f(caseClause, 0));
      this.space();
      this.visit(pattern);
      const cp = this.end();
      const guard = this.optionalNodePiece(this.f(gp, 1));
      const p = this.pf.make(PK_IF_CASE);
      p.a = ep;
      p.b = cp;
      p.c = guard;
      p.b0 = this.patternCanBlockSplit(pattern);
      this.add(p);
    } else {
      this.visit(expr);
    }
    this.token(rp);
  }

  writeTry(n: i32): void {
    this.token(this.f(n, 0));
    this.space();
    this.writeBlock(this.f(n, 1), false);
    const catches = this.f(n, 2);
    const nc = this.a.len(catches);
    for (let i = 0; i < nc; i++) {
      const c = this.a.at(catches, i);
      this.space();
      const on = this.f(c, 0);
      if (on >= 0) {
        this.token(on, false, true);
        this.visit(this.f(c, 1));
      }
      const catchTok = this.f(c, 2);
      if (on >= 0 && catchTok >= 0) {
        this.space();
      }
      if (catchTok >= 0) {
        this.token(catchTok);
        this.space();
        const pb = new DtListBuilder(this, new DtListStyle(CM_NON_TRAILING, 1, false));
        pb.leftBracket(this.f(c, 3));
        pb.visit(this.f(c, 4));
        if (this.f(c, 6) >= 0) {
          pb.visit(this.f(c, 6));
        }
        pb.rightBracket(this.f(c, 7));
        this.add(pb.build(false, true));
      }
      this.space();
      this.writeBlock(this.f(c, 8), i < nc - 1 || this.f(n, 4) >= 0);
    }
    const fin = this.f(n, 4);
    if (fin >= 0) {
      this.space();
      this.token(this.f(n, 3));
      this.space();
      this.writeBlock(fin, false);
    }
  }

  writeImport(n: i32, keyword: i32, deferred: i32, as: i32, prefix: i32): void {
    const began = this.withMetaBegin(this.f(n, 0));
    this.begin();
    this.token(keyword);
    this.space();
    this.visit(this.f(n, 2));
    const dp = this.end();
    const clauses: DtPiece[] = [];
    const configs = this.f(n, 3);
    for (let i = 0; i < this.a.len(configs); i++) {
      clauses.push(this.nodePiece(this.a.at(configs, i), false, NC_NONE));
    }
    if (as >= 0) {
      this.begin();
      this.token(deferred, false, true);
      this.token(as);
      this.space();
      this.visit(prefix);
      clauses.push(this.end());
    }
    const combs = this.f(n, 7);
    for (let i = 0; i < this.a.len(combs); i++) {
      const c = this.a.at(combs, i);
      const ops: DtPiece[] = [];
      ops.push(this.tokenPiece(this.f(c, 0)));
      const names = this.f(c, 1);
      for (let j = 0; j < this.a.len(names); j++) {
        ops.push(this.tokenPiece(this.f(this.a.at(names, j), 0), -1, true, false));
      }
      clauses.push(this.infix(ops, IN_EXPRESSION, false));
    }
    if (clauses.length > 0) {
      const cp = this.pf.make(PK_CLAUSE);
      cp.a = dp;
      cp.list = clauses;
      cp.b0 = false;
      this.add(cp);
    } else {
      this.add(dp);
    }
    this.token(this.f(n, 8));
    this.withMetaEnd(began, false);
  }

  writeIndexExpression(n: i32): void {
    this.token(this.f(n, 2));
    this.token(this.f(n, 1));
    if (dtIs37()) {
      this.token(this.f(n, 3));
      this.visit(this.f(n, 4));
      this.token(this.f(n, 5));
      return;
    }
    this.begin();
    this.token(this.f(n, 3));
    this.visit(this.f(n, 4));
    this.token(this.f(n, 5));
    const inner = this.end();
    const g = this.pf.make(PK_GROUPING);
    g.a = inner;
    this.add(g);
  }

  writeInfix(left: i32, op: i32, right: i32, hanging: boolean, op2: i32, indent: i32): void {
    this.begin();
    this.visit(left);
    if (hanging) {
      this.space();
      this.token(op);
      this.token(op2);
    }
    const lp = this.end();
    this.begin();
    if (!hanging) {
      this.token(op);
      this.token(op2);
      this.space();
    }
    this.visit(right);
    const rp = this.end();
    const ops: DtPiece[] = [];
    ops.push(lp);
    ops.push(rp);
    this.add(this.infix(ops, indent, false));
  }

  /** writeInfixChain over nodes of `kind` with operators of precedence `prec` (or any when -1). */
  writeInfixChain(n: i32, kind: i32, prec: i32, indent: boolean): void {
    const operands: DtPiece[] = [];
    this.begin();
    this.infixTraverse(n, kind, prec, operands);
    operands.push(this.end());
    this.add(this.infix(operands, indent ? IN_INFIX : IN_NONE, false));
  }

  infixTraverse(e: i32, kind: i32, prec: i32, operands: DtPiece[]): void {
    if (this.kind(e) === kind) {
      const op = this.f(e, 1);
      if (prec < 0 || dtPrecedence(this.t.kind[op], this.t.kw[op]) === prec) {
        // `operands.add(build(...))` builds before traversing the right side.
        this.infixTraverse(this.f(e, 0), kind, prec, operands);
        this.space();
        this.token(op);
        operands.push(this.end());
        this.begin();
        this.infixTraverse(this.f(e, 2), kind, prec, operands);
        return;
      }
    }
    this.visit(e);
  }

  writeList(
    elements: i32,
    left: i32,
    right: i32,
    style: DtListStyle,
    preserveNewlines: boolean,
    allowBlockArgument: boolean,
    blockShaped: boolean,
  ): void {
    if (!this.canSplit(elements, right)) {
      this.token(left);
      this.token(right);
      return;
    }
    const b = new DtListBuilder(this, style);
    b.leftBracket(left);
    if (preserveNewlines && this.containsLineComments(elements, right)) {
      this.preserveNewlinesInCollection(elements, b);
    } else {
      b.visitAll(elements, allowBlockArgument);
    }
    b.rightBracket(right);
    this.add(b.build(false, blockShaped));
  }

  preserveNewlinesInCollection(elements: i32, b: DtListBuilder): void {
    const lineStyle = new DtListStyle(CM_NON_TRAILING, 1, false);
    let line = new DtListBuilder(this, lineStyle);
    let atLineStart = true;
    const n = this.a.len(elements);
    for (let i = 0; i < n; i++) {
      const el = this.a.at(elements, i);
      if (!atLineStart && this.cw.hasNewlineBetween(this.a.end[this.a.at(elements, i - 1)], this.a.beg[el])) {
        b.addInner(line, false);
        line = new DtListBuilder(this, lineStyle);
        atLineStart = true;
      }
      if (atLineStart) {
        b.addCommentsBefore(this.a.beg[el]);
      }
      line.visit(el);
      atLineStart = false;
    }
    if (!atLineStart) {
      b.addInner(line, false);
    }
  }

  writePatternVariable(keyword: i32, type: i32, name: i32): void {
    if (keyword < 0 && type < 0) {
      this.token(name);
      return;
    }
    this.begin();
    this.modifier(keyword);
    this.visit(type);
    const header = this.end();
    const vars: DtPiece[] = [];
    vars.push(this.tokenPiece(name));
    this.add(this.variablePiece(header, vars, type >= 0));
  }

  writePostfix(node: i32, op: i32): void {
    this.visit(node);
    this.token(op);
  }

  writePrefix(op: i32, operand: i32, space: boolean): void {
    if (dtIs37()) {
      this.token(op, false, space);
      this.visit(operand);
      return;
    }
    this.begin();
    this.token(op, false, space);
    this.visit(operand);
    const inner = this.end();
    const p = this.pf.make(PK_PREFIX);
    p.a = inner;
    this.add(p);
  }

  writeRecord(left: i32, fields: i32, right: i32, cst: i32, preserveNewlines: boolean): void {
    let style = new DtListStyle(CM_TRAILING, 1, false);
    if (this.a.len(fields) === 1) {
      const only = this.a.at(fields, 0);
      const k = this.kind(only);
      if ((k === N_PATTERN_FIELD && this.f(only, 0) >= 0) || k === N_RECORD_LITERAL_NAMED_FIELD) {
        style = new DtListStyle(CM_TRAILING, 1, false);
      } else {
        style = new DtListStyle(CM_ALWAYS_TRAILING, 1, false);
      }
    }
    this.writeCollection(left, fields, right, cst, -1, style, false, preserveNewlines);
  }

  writeTypeList(left: i32, elements: i32, right: i32): void {
    this.writeList(elements, left, right, new DtListStyle(CM_NON_TRAILING, 3, false), false, false, false);
  }

  writeTypeTest(expr: i32, keyword: i32, type: i32, bang: i32): void {
    if (!dtV313()) {
      // Before 3.13 (blockFormatTypeTest), a type test is an infix.
      this.writeInfix(expr, keyword, type, false, bang, dtIs37() ? IN_INFIX : IN_EXPRESSION);
      return;
    }
    const ep = this.nodePiece(expr, false, NC_NONE);
    this.begin();
    this.token(keyword);
    this.token(bang);
    const op = this.end();
    const p = this.pf.make(PK_TYPE_TEST);
    p.a = ep;
    p.b = op;
    p.c = this.nodePiece(type, false, NC_NONE);
    p.b0 = this.canBlockSplit(expr);
    this.add(p);
  }

  writeFunctionBodyModifiers(keyword: i32, star: i32): void {
    this.token(keyword, false, false, true);
    this.token(star, false, false, true);
    if (keyword >= 0) {
      this.space();
    }
  }

  writeAssignment(lhs: i32, op: i32, rhs: i32, includeComma: boolean, lhsContext: i32, rhsContext: i32): void {
    if (dtIs37()) {
      this.writeAssignment37(lhs, op, rhs, includeComma, lhsContext);
      return;
    }
    this.begin();
    this.visit(lhs, false, false, lhsContext);
    if (this.t.kind[op] !== T_COLON) {
      this.space();
    }
    this.token(op);
    const lp = this.end();
    const rp = this.nodePiece(rhs, includeComma, rhsContext);
    this.add(this.assignPiece(lp, rp, true));
  }

  writeAssignment37(lhs: i32, op: i32, rhs: i32, includeComma: boolean, lhsContext: i32): void {
    const lk = this.kind(lhs);
    let canBlockSplitLeft = false;
    if (lk === N_METHOD_INVOCATION || lk === N_PROPERTY_ACCESS || lk === N_PREFIXED_IDENTIFIER) {
      canBlockSplitLeft = true;
    } else {
      canBlockSplitLeft = this.canBlockSplitAny(lhs);
    }
    const canBlockSplitRight = this.canBlockSplitAny(rhs);
    const lp = this.nodePiece(lhs, false, lhsContext);
    this.begin();
    if (this.t.kind[op] !== T_COLON) {
      this.space();
    }
    this.token(op);
    const opp = this.end();
    const rp = this.nodePiece(rhs, includeComma, NC_ASSIGNMENT);
    this.add(this.assign37(lp, opp, rp, canBlockSplitLeft, canBlockSplitRight, false));
  }

  writeTokenAssignment(lhs: i32, op: i32, rhs: i32, includeComma: boolean, rhsContext: i32): void {
    if (dtIs37()) {
      const cbsr = this.canBlockSplitAny(rhs);
      this.begin();
      if (this.t.kind[op] !== T_COLON) {
        this.space();
      }
      this.token(op);
      const opp = this.end();
      const rp = this.nodePiece(rhs, includeComma, NC_ASSIGNMENT);
      this.add(this.assign37(this.tokenPiece(lhs), opp, rp, false, cbsr, false));
      return;
    }
    this.begin();
    this.token(lhs);
    if (this.t.kind[op] !== T_COLON) {
      this.space();
    }
    this.token(op);
    const lp = this.end();
    const rp = this.nodePiece(rhs, includeComma, rhsContext);
    this.add(this.assignPiece(lp, rp, true));
  }

  writeForIn(lhs: i32, inTok: i32, seq: i32): void {
    const leading = this.takeCommentsBefore(this.a.beg[lhs]);
    const lp = this.nodePiece(lhs, false, NC_FOR_LOOP_VARIABLE);
    const sp = this.createForInSequence(inTok, seq);
    const p = this.pf.make(PK_FOR_IN);
    p.a = lp;
    p.b = sp;
    p.b0 = this.canBlockSplit(seq);
    this.addHoisted(leading, p);
  }

  writeDeclaredForIn(ident: i32, inTok: i32, seq: i32): void {
    const leading = this.takeCommentsBefore(this.a.beg[ident]);
    this.beginMeta(this.f(ident, 0));
    this.begin();
    const mods: i32[] = [];
    mods.push(this.f(ident, 1));
    this.writeParameter(this.f(ident, 2), this.f(ident, 3), 0, mods, -1, -1, -1, -1);
    const lp = this.end();
    const sp = this.createForInSequence(inTok, seq);
    const p = this.pf.make(PK_FOR_IN);
    p.a = lp;
    p.b = sp;
    p.b0 = this.canBlockSplit(seq);
    this.add(p);
    this.addHoisted(leading, this.endMeta(true));
  }

  createForInSequence(inTok: i32, seq: i32): DtPiece {
    this.begin();
    this.token(inTok);
    this.space();
    this.visit(seq);
    return this.end();
  }

  parameterPiece(typePiece: DtPiece | null, namePiece: DtPiece | null): DtPiece {
    if (typePiece !== null && namePiece !== null) {
      const vars: DtPiece[] = [];
      vars.push(namePiece);
      return this.variablePiece(typePiece, vars, true);
    }
    if (typePiece !== null) {
      return typePiece;
    }
    if (namePiece !== null) {
      return namePiece;
    }
    this.fail("parameter without type or name");
    return this.pf.make(PK_ADJACENT);
  }

  writeParameter(type: i32, name: i32, meta: i32, mods: i32[], fieldKw: i32, period: i32, sep: i32, value: i32): void {
    const began = this.withMetaBegin(meta);
    let typePiece: DtPiece | null = null;
    if (type >= 0) {
      this.begin();
      for (const m of mods) {
        this.modifier(m);
      }
      this.visit(type);
      typePiece = this.end();
    }
    let namePiece: DtPiece | null = null;
    if (name >= 0) {
      this.begin();
      if (type < 0) {
        for (const m of mods) {
          this.modifier(m);
        }
      }
      this.token(fieldKw);
      this.token(period);
      this.token(name);
      namePiece = this.end();
    }
    this.writeDefaultValue(this.parameterPiece(typePiece, namePiece), sep, value);
    this.withMetaEnd(began, true);
  }

  // -------------------------------------------------------------------------
  // AstNodeVisitor.run.

  setParents(n: i32): void {
    const sig = dtSig(this.kind(n));
    for (let i = 0; i < toI32(sig.length); i++) {
      const c = sig.charCodeAt(i);
      const v = this.f(n, i);
      if (v < 0) {
        continue;
      }
      if (c === 78) {
        this.parent[v] = n;
        this.setParents(v);
      } else if (c === 76) {
        for (let j = 0; j < this.a.len(v); j++) {
          const x = this.a.at(v, j);
          this.parent[x] = n;
          this.setParents(x);
        }
      }
    }
  }

  parentOf(n: i32): i32 {
    return n >= 0 && n < toI32(this.parent.length) ? this.parent[n] : -1;
  }

  /** The piece for the whole compilation unit. */
  buildUnit(unit: i32): DtPiece {
    if (!dtV313()) {
      this.parent = new Array<i32>(this.a.n + 1);
      this.parent.fill(-1);
      this.setParents(unit);
    }
    const seq = new DtSeqBuilder(this);
    const script = this.f(unit, 0);
    if (script >= 0) {
      seq.visit(script, IN_NONE, false);
      seq.addBlank();
    }
    const dirs = this.f(unit, 1);
    let di = 0;
    const nd = this.a.len(dirs);
    if (nd > 0 && this.kind(this.a.at(dirs, 0)) === N_LIBRARY_DIRECTIVE) {
      seq.visit(this.a.at(dirs, 0), IN_NONE, false);
      seq.addBlank();
      di = 1;
    }
    let preceding = 3; // none
    for (let i = di; i < nd; i++) {
      const d = this.a.at(dirs, i);
      let needsBlank = false;
      if (dtV313()) {
        const section = this.directiveSection(d);
        if (section !== 3 && preceding !== 3 && section !== preceding) {
          needsBlank = true;
        }
        preceding = section;
      }
      seq.visit(d, IN_NONE, needsBlank);
    }
    seq.addBlank();
    let needsBlank = false;
    const decls = this.f(unit, 2);
    for (let i = 0; i < this.a.len(decls); i++) {
      const d = this.a.at(decls, i);
      const k = this.kind(d);
      let addBlankLines = false;
      if (k === N_CLASS_DECLARATION) {
        addBlankLines = this.kind(this.f(d, 13)) === N_BLOCK_CLASS_BODY;
      } else if (k === N_ENUM_DECLARATION) {
        addBlankLines = this.kind(this.f(d, 5)) === N_BLOCK_ENUM_BODY;
      } else if (k === N_EXTENSION_DECLARATION) {
        addBlankLines = this.kind(this.f(d, 6)) === N_BLOCK_CLASS_BODY;
      } else if (k === N_EXTENSION_TYPE_DECLARATION) {
        addBlankLines = dtV313() && this.kind(this.f(d, 5)) === N_BLOCK_CLASS_BODY;
      } else if (k === N_MIXIN_DECLARATION) {
        addBlankLines = dtV313() && this.kind(this.f(d, 7)) === N_BLOCK_CLASS_BODY;
      }
      seq.visit(d, IN_NONE, needsBlank || addBlankLines);
      needsBlank = addBlankLines || this.hasNonEmptyBody(d);
    }
    seq.addCommentsBefore(this.a.end[unit], IN_NONE, false);
    this.flushText();
    return seq.build(false);
  }

  /** _DirectiveSection: 0 dart:, 1 package:, 2 other, 3 none. */
  directiveSection(d: i32): i32 {
    const k = this.kind(d);
    if (k !== N_IMPORT_DIRECTIVE && k !== N_EXPORT_DIRECTIVE) {
      return 3;
    }
    const uri = this.f(d, 2);
    if (this.kind(uri) !== N_SIMPLE_STRING_LITERAL) {
      return 3;
    }
    // stringValue: the literal without its quotes (raw or not).
    const tok = this.f(uri, 0);
    let i = this.t.start[tok];
    const e = this.t.end[tok];
    if (toI32(this.src[i]) === 114) {
      i++;
    }
    const q = toI32(this.src[i]);
    if (i + 2 < e && toI32(this.src[i + 1]) === q && toI32(this.src[i + 2]) === q) {
      i += 3;
    } else {
      i += 1;
    }
    if (this.startsAt(i, e, "dart:")) {
      return 0;
    }
    if (this.startsAt(i, e, "package:")) {
      return 1;
    }
    return 2;
  }

  startsAt(i: i32, e: i32, s: string): boolean {
    const n = toI32(s.length);
    if (i + n > e) {
      return false;
    }
    for (let j = 0; j < n; j++) {
      if (toI32(this.src[i + j]) !== s.charCodeAt(j)) {
        return false;
      }
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // The visit methods.

  accept(n: i32): void {
    const k = this.kind(n);
    switch (k) {
      case N_ADJACENT_STRINGS: {
        const ops: DtPiece[] = [];
        const strs = this.f(n, 0);
        for (let i = 0; i < this.a.len(strs); i++) {
          ops.push(this.nodePiece(this.a.at(strs, i), false, NC_NONE));
        }
        const indentStrings = dtIs37() ? this.indentStrings37(n) : this.f(n, 1) === 1;
        const p = this.infix(ops, indentStrings ? IN_INFIX : IN_NONE, false);
        dtPin(p, S_SPLIT);
        this.add(p);
        return;
      }
      case N_ANNOTATION:
        this.token(this.f(n, 0));
        this.visit(this.f(n, 1));
        this.visit(this.f(n, 2));
        this.token(this.f(n, 3));
        this.visit(this.f(n, 4));
        this.visit(this.f(n, 5));
        return;
      case N_ARGUMENT_LIST:
        this.writeArgumentList(n);
        return;
      case N_AS_EXPRESSION:
        this.writeTypeTest(this.f(n, 0), this.f(n, 1), this.f(n, 2), -1);
        return;
      case N_ASSERT_INITIALIZER:
        this.token(this.f(n, 0));
        this.writeAssertArguments(this.f(n, 1), this.f(n, 2), this.f(n, 4), this.f(n, 5));
        return;
      case N_ASSERT_STATEMENT:
        this.token(this.f(n, 0));
        this.writeAssertArguments(this.f(n, 1), this.f(n, 2), this.f(n, 4), this.f(n, 5));
        this.token(this.f(n, 6));
        return;
      case N_ASSIGNED_VARIABLE_PATTERN:
        this.token(this.f(n, 0));
        return;
      case N_ASSIGNMENT_EXPRESSION:
      case N_PATTERN_ASSIGNMENT:
        this.writeAssignment(this.f(n, 0), this.f(n, 1), this.f(n, 2), false, NC_NONE, NC_NONE);
        return;
      case N_AWAIT_EXPRESSION:
      case N_THROW_EXPRESSION:
        this.writePrefix(this.f(n, 0), this.f(n, 1), true);
        return;
      case N_BINARY_EXPRESSION: {
        const op = this.f(n, 1);
        // 3.7 flattens binary operands in assignment contexts.
        this.writeInfixChain(
          n,
          N_BINARY_EXPRESSION,
          dtPrecedence(this.t.kind[op], this.t.kw[op]),
          !dtIs37() || this.parentContext !== NC_ASSIGNMENT,
        );
        return;
      }
      case N_BLOCK:
        this.writeBlock(n, false);
        return;
      case N_BLOCK_FUNCTION_BODY:
        this.space();
        this.writeFunctionBodyModifiers(this.f(n, 0), this.f(n, 1));
        this.visit(this.f(n, 2));
        return;
      case N_BOOLEAN_LITERAL:
      case N_NULL_LITERAL:
      case N_INTEGER_LITERAL:
      case N_DOUBLE_LITERAL:
      case N_SIMPLE_IDENTIFIER:
      case N_THIS_EXPRESSION:
      case N_SUPER_EXPRESSION:
      case N_RETHROW_EXPRESSION:
      case N_SCRIPT_TAG:
      case N_CATCH_CLAUSE_PARAMETER:
      case N_LABEL_REFERENCE:
        this.token(this.f(n, 0));
        return;
      case N_BREAK_STATEMENT:
      case N_CONTINUE_STATEMENT:
        this.writeBreak(this.f(n, 0), this.f(n, 1), this.f(n, 2));
        return;
      case N_CASCADE_EXPRESSION: {
        const cb = new DtChainBuilder(this, n);
        this.add(cb.buildCascade());
        return;
      }
      case N_CAST_PATTERN:
        this.writeInfix(this.f(n, 0), this.f(n, 1), this.f(n, 2), false, -1, IN_INFIX);
        return;
      case N_CLASS_DECLARATION: {
        const kws: i32[] = [];
        kws.push(this.f(n, 1));
        kws.push(this.f(n, 2));
        kws.push(this.f(n, 3));
        kws.push(this.f(n, 4));
        kws.push(this.f(n, 5));
        kws.push(this.f(n, 6));
        kws.push(this.f(n, 7));
        const tb = new DtTypeBuilder(this, this.f(n, 0), kws);
        tb.namePart = this.f(n, 8);
        tb.clause(this.f(n, 9));
        tb.clause(this.f(n, 10));
        tb.clause(this.f(n, 11));
        tb.nativeClause(this.f(n, 12));
        tb.allowLeadingClause = this.f(n, 9) >= 0;
        tb.buildClassBody(this.f(n, 13));
        return;
      }
      case N_CLASS_TYPE_ALIAS: {
        const kws: i32[] = [];
        for (let i = 1; i <= 7; i++) {
          kws.push(this.f(n, i));
        }
        const tb = new DtTypeBuilder(this, this.f(n, 0), kws);
        tb.name = this.f(n, 8);
        tb.tps = this.f(n, 9);
        tb.clause(this.f(n, 12));
        tb.clause(this.f(n, 13));
        tb.buildMixinApplicationClass(this.f(n, 10), this.f(n, 11), this.f(n, 14));
        return;
      }
      case N_CONDITIONAL_EXPRESSION:
        this.visitConditional(n);
        return;
      case N_CONFIGURATION: {
        this.token(this.f(n, 0));
        this.space();
        this.token(this.f(n, 1));
        const eq = this.f(n, 3);
        if (eq >= 0) {
          const name = this.f(n, 2);
          const leading = this.takeCommentsBefore(this.a.beg[name]);
          this.begin();
          this.visit(name);
          this.space();
          this.token(eq);
          const lp = this.end();
          const ops: DtPiece[] = [];
          ops.push(lp);
          ops.push(this.nodePiece(this.f(n, 4), false, NC_NONE));
          this.addHoisted(leading, this.infix(ops, IN_EXPRESSION, false));
        } else {
          this.visit(this.f(n, 2));
        }
        this.token(this.f(n, 5));
        this.space();
        this.visit(this.f(n, 6));
        return;
      }
      case N_CONSTANT_PATTERN: {
        const c = this.f(n, 0);
        if (c >= 0) {
          this.token(c, false, true);
        }
        this.visit(this.f(n, 1));
        return;
      }
      case N_CONSTRUCTOR_DECLARATION:
        this.visitConstructor(n);
        return;
      case N_CONSTRUCTOR_FIELD_INITIALIZER:
        this.token(this.f(n, 0));
        this.token(this.f(n, 1));
        this.writeAssignment(this.f(n, 2), this.f(n, 3), this.f(n, 4), false, NC_NONE, NC_NONE);
        return;
      case N_CONSTRUCTOR_NAME: {
        const type = this.f(n, 0);
        this.token(this.f(type, 0));
        this.token(this.f(type, 1));
        this.token(this.f(type, 2));
        this.visit(this.f(type, 3));
        this.token(this.f(type, 4));
        if (this.f(n, 2) >= 0) {
          this.token(this.f(n, 1));
          this.visit(this.f(n, 2));
        }
        return;
      }
      case N_CONSTRUCTOR_SELECTOR:
        this.token(this.f(n, 0));
        this.visit(this.f(n, 1));
        return;
      case N_DECLARED_IDENTIFIER: {
        const mods: i32[] = [];
        mods.push(this.f(n, 1));
        this.writeParameter(this.f(n, 2), this.f(n, 3), this.f(n, 0), mods, -1, -1, -1, -1);
        return;
      }
      case N_DECLARED_VARIABLE_PATTERN:
      case N_WILDCARD_PATTERN:
        this.writePatternVariable(this.f(n, 0), this.f(n, 1), this.f(n, 2));
        return;
      case N_DO_STATEMENT:
        this.token(this.f(n, 0));
        this.space();
        this.visit(this.f(n, 1));
        this.space();
        this.token(this.f(n, 2));
        this.space();
        this.token(this.f(n, 3));
        this.visit(this.f(n, 4));
        this.token(this.f(n, 5));
        this.token(this.f(n, 6));
        return;
      case N_DOT_SHORTHAND_CONSTRUCTOR_INVOCATION:
        this.modifier(this.f(n, 0));
        this.token(this.f(n, 1));
        this.visit(this.f(n, 2));
        this.visit(this.f(n, 3));
        this.visit(this.f(n, 4));
        return;
      case N_DOT_SHORTHAND_INVOCATION:
        this.token(this.f(n, 0));
        this.visit(this.f(n, 1));
        this.visit(this.f(n, 2));
        this.visit(this.f(n, 3));
        return;
      case N_DOT_SHORTHAND_PROPERTY_ACCESS:
        this.token(this.f(n, 0));
        this.visit(this.f(n, 1));
        return;
      case N_DOTTED_NAME: {
        const toks = this.f(n, 0);
        for (let i = 0; i < this.a.len(toks); i++) {
          this.token(this.a.at(toks, i));
        }
        return;
      }
      case N_EMPTY_FUNCTION_BODY:
      case N_EMPTY_STATEMENT:
        this.token(this.f(n, 0));
        return;
      case N_ENUM_CONSTANT_DECLARATION:
        this.add(this.createEnumConstant(n, false, -1));
        return;
      case N_ENUM_DECLARATION: {
        const kws: i32[] = [];
        kws.push(this.f(n, 1));
        const tb = new DtTypeBuilder(this, this.f(n, 0), kws);
        tb.namePart = this.f(n, 2);
        tb.clause(this.f(n, 3));
        tb.clause(this.f(n, 4));
        tb.buildEnum(n);
        return;
      }
      case N_EXPORT_DIRECTIVE:
        this.writeImport(n, this.f(n, 1), -1, -1, -1);
        return;
      case N_EXPRESSION_FUNCTION_BODY: {
        this.begin();
        this.space();
        this.writeFunctionBodyModifiers(this.f(n, 0), this.f(n, 1));
        this.token(this.f(n, 2));
        const op = this.end();
        const e = this.f(n, 3);
        const ep = this.nodePiece(e, false, NC_ASSIGNMENT);
        const ek = this.kind(e);
        if (dtIs37()) {
          this.add(this.assign37(null, op, ep, false, this.canBlockSplit(e), this.blockFormat(e) === BF_INVOCATION));
          this.token(this.f(n, 4));
          return;
        }
        const ap = this.assignPiece(op, ep, ek === N_LIST_LITERAL || ek === N_SET_OR_MAP_LITERAL);
        if (ek === N_FUNCTION_EXPRESSION && this.kind(this.f(e, 2)) === N_EXPRESSION_FUNCTION_BODY) {
          dtPin(ap, S_SPLIT);
        }
        this.add(ap);
        this.token(this.f(n, 4));
        return;
      }
      case N_EXPRESSION_STATEMENT:
        this.visit(this.f(n, 0));
        this.token(this.f(n, 1), false, false, true);
        return;
      case N_EXTENSION_DECLARATION: {
        const kws: i32[] = [];
        kws.push(this.f(n, 1));
        const tb = new DtTypeBuilder(this, this.f(n, 0), kws);
        tb.name = this.f(n, 3);
        tb.tps = this.f(n, 4);
        tb.clause(this.f(n, 5));
        tb.buildClassBody(this.f(n, 6));
        return;
      }
      case N_EXTENSION_TYPE_DECLARATION: {
        const kws: i32[] = [];
        kws.push(this.f(n, 1));
        kws.push(this.f(n, 2));
        const tb = new DtTypeBuilder(this, this.f(n, 0), kws);
        tb.namePart = this.f(n, 3);
        tb.clause(this.f(n, 4));
        tb.buildClassBody(this.f(n, 5));
        return;
      }
      case N_FIELD_DECLARATION: {
        const began = this.withMetaBegin(this.f(n, 0));
        this.modifier(this.f(n, 1));
        this.modifier(this.f(n, 2));
        this.modifier(this.f(n, 3));
        this.modifier(this.f(n, 4));
        this.visit(this.f(n, 5));
        this.token(this.f(n, 6));
        this.withMetaEnd(began, false);
        return;
      }
      case N_FIELD_FORMAL_PARAMETER:
      case N_SUPER_FORMAL_PARAMETER:
      case N_REGULAR_FORMAL_PARAMETER: {
        const suffix = this.f(n, 8);
        if (suffix >= 0) {
          this.writeFunctionType(
            this.f(n, 4),
            this.f(n, 7),
            this.f(suffix, 0),
            this.f(suffix, 1),
            this.f(suffix, 2),
            n,
            this.f(n, 5),
            this.f(n, 6),
          );
        } else {
          this.writeFormalParameter(n, this.f(n, 4), this.f(n, 7), this.f(n, 3), this.f(n, 5), this.f(n, 6));
        }
        return;
      }
      case N_FORMAL_PARAMETER_LIST:
        this.visitFormalParameterList(n);
        return;
      case N_FOR_ELEMENT: {
        const body = this.f(n, 5);
        this.writeFor(
          this.f(n, 0),
          this.f(n, 1),
          this.f(n, 2),
          this.f(n, 3),
          this.f(n, 4),
          body,
          this.spreadCollection(body) >= 0,
          this.isControlFlowElement(body),
        );
        return;
      }
      case N_FOR_STATEMENT: {
        const body = this.f(n, 5);
        this.writeFor(
          this.f(n, 0),
          this.f(n, 1),
          this.f(n, 2),
          this.f(n, 3),
          this.f(n, 4),
          body,
          this.kind(body) === N_BLOCK,
          false,
        );
        return;
      }
      case N_FUNCTION_DECLARATION: {
        const fe = this.f(n, 5);
        const mods: i32[] = [];
        mods.push(this.f(n, 1));
        this.writeFunction(
          this.f(n, 0),
          mods,
          this.f(n, 2),
          this.f(n, 3),
          this.f(n, 4),
          this.f(fe, 0),
          this.f(fe, 1),
          this.f(fe, 2),
        );
        return;
      }
      case N_FUNCTION_DECLARATION_STATEMENT:
        this.add(this.nodePiece(this.f(n, 0), false, NC_NONE));
        return;
      case N_FUNCTION_EXPRESSION: {
        const mods: i32[] = [];
        this.writeFunction(0, mods, -1, -1, -1, this.f(n, 0), this.f(n, 1), this.f(n, 2));
        return;
      }
      case N_FUNCTION_EXPRESSION_INVOCATION:
        this.visit(this.f(n, 0));
        this.visit(this.f(n, 1));
        this.visit(this.f(n, 2));
        return;
      case N_FUNCTION_REFERENCE:
        this.visit(this.f(n, 0));
        this.visit(this.f(n, 1));
        return;
      case N_FUNCTION_TYPE_ALIAS: {
        const began = this.withMetaBegin(this.f(n, 0));
        this.token(this.f(n, 1));
        this.space();
        this.visit(this.f(n, 2), false, true);
        this.token(this.f(n, 3));
        this.visit(this.f(n, 4));
        this.visit(this.f(n, 5));
        this.token(this.f(n, 6));
        this.withMetaEnd(began, false);
        return;
      }
      case N_GENERIC_FUNCTION_TYPE:
        this.writeFunctionType(this.f(n, 0), this.f(n, 1), this.f(n, 2), this.f(n, 3), this.f(n, 4), -1, -1, -1);
        return;
      case N_GENERIC_TYPE_ALIAS: {
        const began = this.withMetaBegin(this.f(n, 0));
        this.token(this.f(n, 1));
        this.space();
        this.token(this.f(n, 2));
        this.visit(this.f(n, 3));
        this.space();
        const ep = this.tokenPiece(this.f(n, 4));
        const tp = this.nodePiece(this.f(n, 5), false, NC_NONE);
        this.add(dtIs37() ? this.assign37(null, ep, tp, false, false, false) : this.assignPiece(ep, tp, true));
        this.token(this.f(n, 6));
        this.withMetaEnd(began, false);
        return;
      }
      case N_IF_ELEMENT:
        this.visitIfElement(n);
        return;
      case N_IF_STATEMENT:
        this.visitIfStatement(n);
        return;
      case N_IMPORT_DIRECTIVE:
        this.writeImport(n, this.f(n, 1), this.f(n, 4), this.f(n, 5), this.f(n, 6));
        return;
      case N_INDEX_EXPRESSION:
        this.visit(this.f(n, 0));
        this.writeIndexExpression(n);
        return;
      case N_INSTANCE_CREATION_EXPRESSION: {
        this.token(this.f(n, 0), false, true);
        const cn = this.f(n, 1);
        const type = this.f(cn, 0);
        this.token(this.f(type, 0));
        this.token(this.f(type, 1));
        this.token(this.f(type, 2));
        this.visit(this.f(type, 3));
        if (this.f(cn, 2) >= 0) {
          this.token(this.f(cn, 1));
          this.visit(this.f(cn, 2));
        }
        this.visit(this.f(n, 2));
        return;
      }
      case N_INTERPOLATION_EXPRESSION: {
        this.begin();
        this.token(this.f(n, 0));
        this.visit(this.f(n, 1));
        this.token(this.f(n, 2));
        const p = this.end();
        dtPreventAll(p);
        if (dtIs37()) {
          this.add(p);
          return;
        }
        const g = this.pf.make(PK_GROUPING);
        g.a = p;
        this.add(g);
        return;
      }
      case N_INTERPOLATION_STRING:
        if (this.parentContext === NC_MULTILINE_STRING_INTERPOLATION) {
          this.multilineToken(this.f(n, 0), false);
        } else {
          this.token(this.f(n, 0));
        }
        return;
      case N_IS_EXPRESSION:
        this.writeTypeTest(this.f(n, 0), this.f(n, 1), this.f(n, 3), this.f(n, 2));
        return;
      case N_LABEL:
        this.token(this.f(n, 0));
        this.token(this.f(n, 1));
        return;
      case N_LABELED_STATEMENT: {
        const seq = new DtSeqBuilder(this);
        const labels = this.f(n, 0);
        for (let i = 0; i < this.a.len(labels); i++) {
          seq.visit(this.a.at(labels, i), IN_NONE, false);
        }
        seq.visit(this.f(n, 1), IN_NONE, false);
        this.add(seq.build(false));
        return;
      }
      case N_LIBRARY_DIRECTIVE: {
        const began = this.withMetaBegin(this.f(n, 0));
        this.token(this.f(n, 1));
        this.visit(this.f(n, 2), true);
        this.token(this.f(n, 3));
        this.withMetaEnd(began, false);
        return;
      }
      case N_LIST_LITERAL:
      case N_SET_OR_MAP_LITERAL:
        this.writeCollection(
          this.f(n, 2),
          this.f(n, 3),
          this.f(n, 4),
          this.f(n, 0),
          this.f(n, 1),
          dtStyleDefault(),
          true,
          true,
        );
        return;
      case N_LIST_PATTERN:
      case N_MAP_PATTERN:
        this.writeCollection(
          this.f(n, 1),
          this.f(n, 2),
          this.f(n, 3),
          -1,
          this.f(n, 0),
          dtStyleDefault(),
          false,
          false,
        );
        return;
      case N_LOGICAL_AND_PATTERN: {
        const op = this.f(n, 1);
        this.writeInfixChain(
          n,
          N_LOGICAL_AND_PATTERN,
          dtPrecedence(this.t.kind[op], K_NONE),
          !dtIs37() || this.parentContext !== NC_ASSIGNMENT,
        );
        return;
      }
      case N_LOGICAL_OR_PATTERN: {
        const op = this.f(n, 1);
        let indent = this.parentContext !== NC_SWITCH_EXPRESSION_CASE;
        if (dtIs37() && this.parentContext === NC_ASSIGNMENT) {
          indent = false;
        }
        this.writeInfixChain(n, N_LOGICAL_OR_PATTERN, dtPrecedence(this.t.kind[op], K_NONE), indent);
        return;
      }
      case N_MAP_LITERAL_ENTRY: {
        if (dtIs37()) {
          this.writeAssignment(this.f(n, 1), this.f(n, 2), this.f(n, 4), false, NC_NONE, NC_NONE);
          return;
        }
        this.begin();
        this.token(this.f(n, 0));
        this.visit(this.f(n, 1));
        this.token(this.f(n, 2));
        const lp = this.end();
        this.begin();
        this.token(this.f(n, 3));
        this.visit(this.f(n, 4));
        const rp = this.end();
        this.add(this.assignPiece(lp, rp, true));
        return;
      }
      case N_MAP_PATTERN_ENTRY:
        this.writeAssignment(this.f(n, 0), this.f(n, 1), this.f(n, 2), false, NC_NONE, NC_NONE);
        return;
      case N_METHOD_DECLARATION: {
        const mods: i32[] = [];
        mods.push(this.f(n, 1));
        mods.push(this.f(n, 2));
        const op = this.f(n, 5);
        this.writeFunction(
          this.f(n, 0),
          mods,
          this.f(n, 3),
          op >= 0 ? op : this.f(n, 4),
          this.f(n, 6),
          this.f(n, 7),
          this.f(n, 8),
          this.f(n, 9),
        );
        return;
      }
      case N_METHOD_INVOCATION:
        if (this.f(n, 0) < 0 || this.looksLikeStaticCall(n)) {
          this.visit(this.f(n, 0));
          this.token(this.f(n, 1));
          this.visit(this.f(n, 2));
          this.visit(this.f(n, 3));
          this.visit(this.f(n, 4));
          return;
        }
        this.writeChain(n);
        return;
      case N_MIXIN_DECLARATION: {
        const kws: i32[] = [];
        kws.push(this.f(n, 1));
        kws.push(this.f(n, 2));
        const tb = new DtTypeBuilder(this, this.f(n, 0), kws);
        tb.name = this.f(n, 3);
        tb.tps = this.f(n, 4);
        tb.clause(this.f(n, 5));
        tb.clause(this.f(n, 6));
        tb.allowLeadingClause = this.f(n, 5) >= 0;
        tb.buildClassBody(this.f(n, 7));
        return;
      }
      case N_NAMED_ARGUMENT:
      case N_RECORD_LITERAL_NAMED_FIELD:
        this.writeTokenAssignment(this.f(n, 0), this.f(n, 1), this.f(n, 2), false, NC_NAMED_EXPRESSION);
        return;
      case N_NAMED_TYPE:
        this.token(this.f(n, 0));
        this.token(this.f(n, 1));
        this.token(this.f(n, 2));
        this.visit(this.f(n, 3));
        this.token(this.f(n, 4));
        return;
      case N_NATIVE_CLAUSE:
        this.token(this.f(n, 0));
        this.visit(this.f(n, 1), true);
        return;
      case N_NATIVE_FUNCTION_BODY:
        this.space();
        this.token(this.f(n, 0));
        this.visit(this.f(n, 1), true);
        this.token(this.f(n, 2));
        return;
      case N_NULL_ASSERT_PATTERN:
      case N_NULL_CHECK_PATTERN:
      case N_POSTFIX_EXPRESSION:
        this.writePostfix(this.f(n, 0), this.f(n, 1));
        return;
      case N_NULL_AWARE_ELEMENT:
      case N_SPREAD_ELEMENT:
      case N_REST_PATTERN_ELEMENT:
        this.writePrefix(this.f(n, 0), this.f(n, 1), false);
        return;
      case N_OBJECT_PATTERN: {
        const fields = this.f(n, 2);
        const rp = this.f(n, 3);
        if (!this.canSplit(fields, rp)) {
          this.visit(this.f(n, 0));
          this.token(this.f(n, 1));
          this.token(rp);
          return;
        }
        const b = new DtListBuilder(this, dtStyleDefault());
        this.begin();
        this.visit(this.f(n, 0));
        this.token(this.f(n, 1));
        b.addLeftBracket(this.end());
        for (let i = 0; i < this.a.len(fields); i++) {
          b.visit(this.a.at(fields, i));
        }
        b.rightBracket(rp);
        this.add(b.build(false, true));
        return;
      }
      case N_PARENTHESIZED_EXPRESSION:
      case N_PARENTHESIZED_PATTERN:
        this.writeParenthesized(this.f(n, 0), this.f(n, 1), this.f(n, 2));
        return;
      case N_PART_DIRECTIVE: {
        const began = this.withMetaBegin(this.f(n, 0));
        this.token(this.f(n, 1));
        this.space();
        this.visit(this.f(n, 2));
        this.token(this.f(n, 4));
        this.withMetaEnd(began, false);
        return;
      }
      case N_PART_OF_DIRECTIVE: {
        const began = this.withMetaBegin(this.f(n, 0));
        this.token(this.f(n, 1));
        this.space();
        this.token(this.f(n, 2));
        this.space();
        this.visit(this.f(n, 3));
        this.visit(this.f(n, 4));
        this.token(this.f(n, 5));
        this.withMetaEnd(began, false);
        return;
      }
      case N_PATTERN_FIELD:
        this.visit(this.f(n, 0));
        this.visit(this.f(n, 1));
        return;
      case N_PATTERN_FIELD_NAME:
        this.token(this.f(n, 0));
        this.token(this.f(n, 1));
        if (this.f(n, 0) >= 0) {
          this.space();
        }
        return;
      case N_PATTERN_VARIABLE_DECLARATION: {
        const began = this.withMetaBegin(this.f(n, 0));
        this.token(this.f(n, 1));
        this.space();
        this.writeAssignment(this.f(n, 2), this.f(n, 3), this.f(n, 4), false, NC_NONE, NC_NONE);
        this.withMetaEnd(began, this.parentContext === NC_FOR_LOOP_VARIABLE);
        return;
      }
      case N_PATTERN_VARIABLE_DECLARATION_STATEMENT:
      case N_VARIABLE_DECLARATION_STATEMENT:
        this.visit(this.f(n, 0));
        this.token(this.f(n, 1));
        return;
      case N_PREFIXED_IDENTIFIER:
      case N_PROPERTY_ACCESS:
        if (k === N_PROPERTY_ACCESS && this.f(n, 0) < 0) {
          this.token(this.f(n, 1));
          this.visit(this.f(n, 2));
          return;
        }
        this.writeChain(n);
        return;
      case N_PREFIX_EXPRESSION: {
        const op = this.f(n, 0);
        const operand = this.f(n, 1);
        let space = false;
        const ok = this.t.kind[op];
        if ((ok === T_MINUS || ok === T_DEC) && this.kind(operand) === N_PREFIX_EXPRESSION) {
          const ik = this.t.kind[this.f(operand, 0)];
          space = ik === T_MINUS || ik === T_DEC;
        }
        this.writePrefix(op, operand, space);
        return;
      }
      case N_PRIMARY_CONSTRUCTOR_BODY: {
        const began = this.withMetaBegin(this.f(n, 0));
        this.begin();
        this.token(this.f(n, 1));
        const header = this.end();
        let colon: DtPiece | null = null;
        let inits: DtPiece | null = null;
        if (this.a.len(this.f(n, 3)) > 0) {
          colon = this.tokenPiece(this.f(n, 2));
          inits = this.createCommaSeparated(this.f(n, 3));
        }
        const body = this.nodePiece(this.f(n, 4), false, NC_NONE);
        const p = this.pf.make(PK_CONSTRUCTOR);
        p.a = header;
        p.f = body;
        p.d = colon;
        p.e = inits;
        this.add(p);
        this.withMetaEnd(began, false);
        return;
      }
      case N_PRIMARY_CONSTRUCTOR_NAME:
        this.token(this.f(n, 0));
        this.token(this.f(n, 1));
        return;
      case N_RECORD_LITERAL:
        this.writeRecord(this.f(n, 1), this.f(n, 2), this.f(n, 3), this.f(n, 0), true);
        return;
      case N_RECORD_PATTERN:
        this.writeRecord(this.f(n, 0), this.f(n, 1), this.f(n, 2), -1, false);
        return;
      case N_RECORD_TYPE_ANNOTATION:
        this.visitRecordType(n);
        return;
      case N_RECORD_TYPE_NAMED_FIELD:
      case N_RECORD_TYPE_POSITIONAL_FIELD: {
        const mods: i32[] = [];
        this.writeParameter(this.f(n, 1), this.f(n, 2), this.f(n, 0), mods, -1, -1, -1, -1);
        return;
      }
      case N_REDIRECTING_CONSTRUCTOR_INVOCATION:
      case N_SUPER_CONSTRUCTOR_INVOCATION:
        this.token(this.f(n, 0));
        this.token(this.f(n, 1));
        this.visit(this.f(n, 2));
        this.visit(this.f(n, 3));
        return;
      case N_RELATIONAL_PATTERN:
        this.token(this.f(n, 0));
        this.space();
        this.visit(this.f(n, 1));
        return;
      case N_RETURN_STATEMENT:
        this.token(this.f(n, 0));
        this.visit(this.f(n, 1), true);
        this.token(this.f(n, 2));
        return;
      case N_SIMPLE_STRING_LITERAL: {
        const tok = this.f(n, 0);
        if (this.isMultilineString(tok)) {
          this.multilineToken(tok, true);
        } else {
          this.token(tok, false, false, true);
        }
        return;
      }
      case N_STRING_INTERPOLATION: {
        const els = this.f(n, 0);
        const ctx = this.isMultilineInterpolation(n) ? NC_MULTILINE_STRING_INTERPOLATION : NC_NONE;
        for (let i = 0; i < this.a.len(els); i++) {
          this.visit(this.a.at(els, i), false, false, ctx);
        }
        return;
      }
      case N_SWITCH_EXPRESSION:
        this.visitSwitchExpression(n);
        return;
      case N_SWITCH_EXPRESSION_CASE: {
        const gp = this.f(n, 0);
        const pattern = this.f(gp, 0);
        const pp = this.nodePiece(pattern, false, NC_SWITCH_EXPRESSION_CASE);
        const guard = this.optionalNodePiece(this.f(gp, 1));
        const arrow = this.tokenPiece(this.f(n, 1));
        const body = this.nodePiece(this.f(n, 2), false, NC_NONE);
        const p = this.pf.make(PK_CASE_EXPRESSION);
        p.a = pp;
        p.b = guard;
        p.c = arrow;
        p.d = body;
        p.b0 = this.patternCanBlockSplit(pattern);
        p.b1 = this.kind(pattern) === N_LOGICAL_OR_PATTERN;
        p.b2 = !dtIs37() || this.canBlockSplit(this.f(n, 2));
        this.add(p);
        return;
      }
      case N_SWITCH_STATEMENT:
        this.visitSwitchStatement(n);
        return;
      case N_SYMBOL_LITERAL: {
        this.token(this.f(n, 0));
        const comps = this.f(n, 1);
        for (let i = 0; i < this.a.len(comps); i++) {
          const c = this.a.at(comps, i);
          if (i > 0) {
            this.token(c - 1);
          }
          this.token(c);
        }
        return;
      }
      case N_TOP_LEVEL_VARIABLE_DECLARATION: {
        const began = this.withMetaBegin(this.f(n, 0));
        this.modifier(this.f(n, 1));
        this.visit(this.f(n, 2));
        this.token(this.f(n, 3));
        this.withMetaEnd(began, false);
        return;
      }
      case N_TRY_STATEMENT:
        this.writeTry(n);
        return;
      case N_TYPE_ARGUMENT_LIST:
      case N_TYPE_PARAMETER_LIST:
        this.writeTypeList(this.f(n, 0), this.f(n, 1), this.f(n, 2));
        return;
      case N_TYPE_PARAMETER: {
        const began = this.withMetaBegin(this.f(n, 0));
        const bound = this.f(n, 3);
        if (bound >= 0) {
          this.begin();
          this.token(this.f(n, 1));
          const tp = this.end();
          this.begin();
          this.token(this.f(n, 2));
          this.space();
          this.visit(bound);
          const bp = this.end();
          const p = this.pf.make(PK_TYPE_PARAMETER_BOUND);
          p.a = tp;
          p.b = bp;
          this.add(p);
        } else {
          this.token(this.f(n, 1));
        }
        this.withMetaEnd(began, true);
        return;
      }
      case N_VARIABLE_DECLARATION_LIST:
        this.visitVariableDeclarationList(n);
        return;
      case N_WHEN_CLAUSE:
        this.writePrefix(this.f(n, 0), this.f(n, 1), true);
        return;
      case N_WHILE_STATEMENT: {
        this.begin();
        this.writeControlFlowStart(this.f(n, 0), this.f(n, 1), this.f(n, 2), this.f(n, 3));
        this.space();
        const cond = this.end();
        const bodyNode = this.f(n, 4);
        const body = this.nodePiece(bodyNode, false, NC_NONE);
        const p = this.pf.make(PK_CONTROL_FLOW);
        p.b0 = true;
        p.list.push(cond);
        p.list2.push(body);
        p.ints.push(this.kind(bodyNode) === N_BLOCK ? 1 : 0);
        this.add(p);
        return;
      }
      case N_YIELD_STATEMENT:
        this.token(this.f(n, 0));
        this.token(this.f(n, 1));
        this.space();
        this.visit(this.f(n, 2));
        this.token(this.f(n, 3));
        return;
      default:
        this.fail(`no visitor for ${dtNodeName(k)}`);
        return;
    }
  }

  visitConditional(n: i32): void {
    const operands: DtPiece[] = [];
    operands.push(this.nodePiece(this.f(n, 0), false, NC_NONE));
    let cond = n;
    while (true) {
      this.condOperand(operands, this.f(cond, 1), this.f(cond, 2));
      const els = this.f(cond, 4);
      if (this.kind(els) === N_CONDITIONAL_EXPRESSION) {
        this.condOperand(operands, this.f(cond, 3), this.f(els, 0));
        cond = els;
      } else {
        this.condOperand(operands, this.f(cond, 3), els);
        break;
      }
    }
    const p = this.infix(operands, dtIs37() ? IN_EXPRESSION : IN_INFIX, true);
    if (
      this.parentContext === NC_CONDITIONAL_BRANCH ||
      this.kind(this.f(n, 2)) === N_CONDITIONAL_EXPRESSION ||
      this.kind(this.f(n, 4)) === N_CONDITIONAL_EXPRESSION
    ) {
      dtPin(p, S_SPLIT);
    }
    this.add(p);
  }

  condOperand(operands: DtPiece[], op: i32, operand: i32): void {
    if (!dtIs37()) {
      for (const c of this.takeCommentsBefore(op)) {
        operands.push(c);
      }
    }
    this.begin();
    this.token(op);
    this.space();
    this.visit(operand, false, false, NC_CONDITIONAL_BRANCH);
    operands.push(this.end());
  }

  visitConstructor(n: i32): void {
    const began = this.withMetaBegin(this.f(n, 0));
    this.begin();
    this.modifier(this.f(n, 1));
    this.modifier(this.f(n, 2));
    if (this.f(n, 5) >= 0 || this.f(n, 7) >= 0) {
      this.modifier(this.f(n, 4));
      this.modifier(this.f(n, 3));
      this.visit(this.f(n, 5));
    } else {
      this.token(this.f(n, 4));
      this.token(this.f(n, 3));
    }
    this.token(this.f(n, 6));
    this.token(this.f(n, 7));
    const header = this.end();
    const paramsNode = this.f(n, 8);
    const params = this.nodePiece(paramsNode, false, NC_NONE);
    let redirect: DtPiece | null = null;
    let sep: DtPiece | null = null;
    let inits: DtPiece | null = null;
    const ctor = this.f(n, 11);
    if (ctor >= 0) {
      this.begin();
      this.token(this.f(n, 9));
      this.space();
      const sp = this.end();
      if (dtIs37()) {
        redirect = this.assign37(null, sp, this.nodePiece(ctor, false, NC_ASSIGNMENT), false, false, false);
      } else {
        redirect = this.assignPiece(sp, this.nodePiece(ctor, false, NC_NONE), true);
      }
    } else if (this.a.len(this.f(n, 10)) > 0) {
      sep = this.tokenPiece(this.f(n, 9));
      inits = this.createCommaSeparated(this.f(n, 10));
    }
    const body = this.nodePiece(this.f(n, 12), false, NC_NONE);
    const p = this.pf.make(PK_CONSTRUCTOR);
    p.a = header;
    p.b = params;
    p.c = redirect;
    p.d = sep;
    p.e = inits;
    p.f = body;
    p.b0 = this.canSplit(this.f(paramsNode, 1), this.f(paramsNode, 4));
    p.b1 = this.f(paramsNode, 3) >= 0;
    this.add(p);
    this.withMetaEnd(began, false);
  }

  visitFormalParameterList(n: i32): void {
    const params = this.f(n, 1);
    const np = this.a.len(params);
    let firstOptional = -1;
    for (let i = 0; i < np; i++) {
      if (this.f(this.a.at(params, i), 10) !== 0) {
        firstOptional = i;
        break;
      }
    }
    const lp = this.f(n, 0);
    const rp = this.f(n, 4);
    if (!this.canSplit(params, rp)) {
      this.token(lp, false, false, true);
      this.token(rp, false, false, true);
      return;
    }
    // Before 3.13, an extension type's representation allows no trailing comma.
    let listStyle = dtStyleDefault();
    if (!dtV313() && this.kind(this.parentOf(this.parentOf(n))) === N_EXTENSION_TYPE_DECLARATION) {
      listStyle = new DtListStyle(CM_NON_TRAILING, 1, false);
    }
    const b = new DtListBuilder(this, listStyle);
    this.begin();
    this.token(lp);
    if (np > 0 && firstOptional === 0) {
      this.token(this.f(n, 2));
    }
    b.addLeftBracket(this.end());
    for (let i = 0; i < np; i++) {
      if (firstOptional > 0 && i === firstOptional) {
        b.leftDelimiter(this.f(n, 2));
      }
      b.visit(this.a.at(params, i));
    }
    b.rightBracket(rp, this.f(n, 3));
    this.add(b.build(false, dtV313()));
  }

  visitIfElement(n: i32): void {
    const piece = this.pf.make(PK_CONTROL_FLOW);
    piece.b0 = false;
    this.ifElementTraverse(piece, -1, n);
    this.add(piece);
  }

  ifElementTraverse(piece: DtPiece, precedingElse: i32, n: i32): void {
    const thenEl = this.f(n, 5);
    const spreadThen = this.spreadCollection(thenEl);
    this.begin();
    this.token(precedingElse, false, true);
    this.writeIfCondition(this.f(n, 0), this.f(n, 1), this.f(n, 2), this.f(n, 3), this.f(n, 4));
    if (spreadThen >= 0) {
      this.space();
      this.token(this.f(spreadThen, 0));
    }
    const condition = this.end();
    const thenPiece = this.nodePiece(spreadThen >= 0 ? this.f(spreadThen, 1) : thenEl, false, NC_NONE);
    if (this.isControlFlowElement(thenEl)) {
      dtPin(piece, S_SPLIT);
    }
    piece.list.push(condition);
    piece.list2.push(thenPiece);
    piece.ints.push(spreadThen >= 0 ? 1 : 0);
    const els = this.f(n, 7);
    if (els >= 0) {
      if (this.kind(els) === N_IF_ELEMENT) {
        this.ifElementTraverse(piece, this.f(n, 6), els);
      } else {
        const spreadElse = this.spreadCollection(els);
        this.begin();
        this.token(this.f(n, 6));
        if (spreadElse >= 0) {
          this.space();
          this.token(this.f(spreadElse, 0));
        }
        const header = this.end();
        const st = this.nodePiece(spreadElse >= 0 ? this.f(spreadElse, 1) : els, false, NC_NONE);
        piece.list.push(header);
        piece.list2.push(st);
        piece.ints.push(spreadElse >= 0 ? 1 : 0);
        if (this.isControlFlowElement(thenEl)) {
          dtPin(piece, S_SPLIT);
        }
      }
    }
  }

  visitIfStatement(n: i32): void {
    const piece = this.pf.make(PK_CONTROL_FLOW);
    piece.b0 = true;
    this.ifStatementTraverse(piece, -1, n);
    if (this.kind(this.f(n, 5)) === N_BLOCK || this.f(n, 7) >= 0) {
      dtPin(piece, S_SPLIT);
    }
    this.add(piece);
  }

  ifStatementTraverse(piece: DtPiece, precedingElse: i32, n: i32): void {
    this.begin();
    this.token(precedingElse, false, true);
    this.writeIfCondition(this.f(n, 0), this.f(n, 1), this.f(n, 2), this.f(n, 3), this.f(n, 4));
    this.space();
    const condition = this.end();
    const then = this.f(n, 5);
    const els = this.f(n, 7);
    const thenPiece =
      this.kind(then) === N_BLOCK && els >= 0 ? this.forcedBlockPiece(then) : this.nodePiece(then, false, NC_NONE);
    piece.list.push(condition);
    piece.list2.push(thenPiece);
    piece.ints.push(this.kind(then) === N_BLOCK ? 1 : 0);
    if (els >= 0) {
      if (this.kind(els) === N_IF_STATEMENT) {
        this.ifStatementTraverse(piece, this.f(n, 6), els);
      } else {
        this.begin();
        this.token(this.f(n, 6), false, true);
        const header = this.end();
        const st = this.nodePiece(els, false, NC_NONE);
        piece.list.push(header);
        piece.list2.push(st);
        piece.ints.push(this.kind(els) === N_BLOCK ? 1 : 0);
      }
    }
  }

  forcedBlockPiece(block: i32): DtPiece {
    this.begin();
    this.writeBlock(block, true);
    return this.end();
  }

  visitRecordType(n: i32): void {
    const named = this.f(n, 2);
    const positional = this.f(n, 1);
    const np = this.a.len(positional);
    const isSinglePositional = np === 1 && named < 0;
    const b = new DtListBuilder(this, new DtListStyle(isSinglePositional ? CM_ALWAYS_TRAILING : CM_TRAILING, 1, false));
    this.begin();
    this.token(this.f(n, 0));
    if (np === 0 && named >= 0) {
      this.token(this.f(named, 0));
    }
    b.addLeftBracket(this.end());
    for (let i = 0; i < np; i++) {
      b.visit(this.a.at(positional, i));
    }
    let rightDelim = -1;
    if (named >= 0) {
      if (np > 0) {
        b.leftDelimiter(this.f(named, 0));
      }
      const fields = this.f(named, 1);
      for (let i = 0; i < this.a.len(fields); i++) {
        b.visit(this.a.at(fields, i));
      }
      rightDelim = this.f(named, 2);
    }
    b.rightBracket(this.f(n, 3), rightDelim);
    this.add(b.build(false, true));
    this.token(this.f(n, 4));
  }

  visitSwitchExpression(n: i32): void {
    const lb = new DtListBuilder(this, new DtListStyle(CM_TRAILING, 1, true));
    this.begin();
    this.writeControlFlowStart(this.f(n, 0), this.f(n, 1), this.f(n, 2), this.f(n, 3));
    this.space();
    this.token(this.f(n, 4));
    lb.addLeftBracket(this.end());
    const cases = this.f(n, 5);
    for (let i = 0; i < this.a.len(cases); i++) {
      lb.visit(this.a.at(cases, i));
    }
    lb.rightBracket(this.f(n, 6));
    this.add(lb.build(this.a.len(cases) > 0, true));
  }

  visitSwitchStatement(n: i32): void {
    this.writeControlFlowStart(this.f(n, 0), this.f(n, 1), this.f(n, 2), this.f(n, 3));
    this.space();
    const seq = new DtSeqBuilder(this);
    seq.leftBracket(this.f(n, 4));
    const members = this.f(n, 5);
    for (let i = 0; i < this.a.len(members); i++) {
      const m = this.a.at(members, i);
      const labels = this.f(m, 0);
      for (let j = 0; j < this.a.len(labels); j++) {
        seq.visit(this.a.at(labels, j), IN_NONE, false);
      }
      const keyword = this.f(m, 1);
      seq.addCommentsBefore(keyword, IN_NONE, false);
      this.begin();
      this.token(keyword);
      let stmts = -1;
      if (this.kind(m) === N_SWITCH_PATTERN_CASE) {
        this.space();
        const gp = this.f(m, 2);
        const pp = this.nodePiece(this.f(gp, 0), false, NC_NONE);
        const when = this.f(gp, 1);
        if (when >= 0) {
          const ops: DtPiece[] = [];
          ops.push(pp);
          ops.push(this.nodePiece(when, false, NC_NONE));
          this.add(this.infix(ops, IN_EXPRESSION, false));
        } else {
          this.add(pp);
        }
        this.token(this.f(m, 3));
        stmts = this.f(m, 4);
      } else {
        this.token(this.f(m, 2));
        stmts = this.f(m, 3);
      }
      const casePiece = this.end();
      seq.add(casePiece, IN_NONE, false);
      for (let j = 0; j < this.a.len(stmts); j++) {
        seq.visit(this.a.at(stmts, j), IN_BLOCK, false);
      }
    }
    seq.rightBracket(this.f(n, 6));
    this.add(seq.build(false));
  }

  visitVariableDeclarationList(n: i32): void {
    const began = this.withMetaBegin(this.f(n, 0));
    this.begin();
    this.modifier(this.f(n, 1));
    this.modifier(this.f(n, 2));
    this.visit(this.f(n, 3));
    const header = this.end();
    const vars: DtPiece[] = [];
    const vs = this.f(n, 4);
    for (let i = 0; i < this.a.len(vs); i++) {
      const v = this.a.at(vs, i);
      const eq = this.f(v, 1);
      const init = this.f(v, 2);
      if (eq >= 0 && init >= 0 && dtIs37()) {
        const vp = this.tokenPiece(this.f(v, 0));
        this.begin();
        this.space();
        this.token(eq);
        const ep = this.end();
        const ip = this.nodePiece(init, true, NC_ASSIGNMENT);
        vars.push(this.assign37(vp, ep, ip, false, this.canBlockSplit(init), false));
      } else if (eq >= 0 && init >= 0) {
        this.begin();
        this.token(this.f(v, 0));
        this.space();
        this.token(eq);
        const vp = this.end();
        const ip = this.nodePiece(init, true, NC_NONE);
        vars.push(this.assignPiece(vp, ip, true));
      } else {
        vars.push(this.tokenPiece(this.f(v, 0), -1, true, false));
      }
    }
    this.add(this.variablePiece(header, vars, this.f(n, 3) >= 0));
    this.withMetaEnd(began, this.parentContext === NC_FOR_LOOP_VARIABLE);
  }
}

/** ChainBuilder. */
class DtChainBuilder {
  v: DtVisitor;
  root: i32;
  target: DtPiece | null = null;
  allowSplitInTarget: boolean = false;
  hasSingleElementTarget: boolean = false;
  calls: DtPiece[];
  types: i32[];

  constructor(v: DtVisitor, root: i32) {
    this.v = v;
    this.root = root;
    this.calls = [];
    this.types = [];
    if (v.kind(root) === N_CASCADE_EXPRESSION) {
      this.visitTarget(v.f(root, 0), true);
      const secs = v.f(root, 1);
      for (let i = 0; i < v.a.len(secs); i++) {
        const sec = v.a.at(secs, i);
        const piece = v.nodePiece(sec, false, NC_NONE);
        let ct = CT_UNSPLITTABLE;
        if (piece.kind === PK_LEADING_COMMENT) {
          ct = CT_UNSPLITTABLE;
        } else if (v.kind(sec) === N_METHOD_INVOCATION && v.f(sec, 0) >= 0) {
          ct = CT_UNSPLITTABLE;
        } else if (v.kind(sec) === N_METHOD_INVOCATION) {
          const args = v.f(sec, 4);
          if (v.canSplit(v.f(args, 1), v.f(args, 2))) {
            ct = CT_SPLITTABLE;
          }
        }
        this.calls.push(piece);
        this.types.push(ct);
      }
    } else {
      this.unwrapCall(root);
    }
  }

  canSplit(i: i32): boolean {
    const t = this.types[i];
    return t === CT_SPLITTABLE || t === CT_BLOCK_FORMAT;
  }

  make(cascade: boolean, indent: i32, leadingProperties: i32, blockCallIndex: i32): DtPiece {
    const p = this.v.pf.make(PK_CHAIN);
    p.a = this.target;
    p.list = this.calls;
    p.ints = this.types;
    p.i0 = leadingProperties;
    p.i1 = blockCallIndex;
    p.i2 = indent;
    p.b0 = cascade;
    p.b1 = this.hasSingleElementTarget;
    p.b2 = this.allowSplitInTarget;
    return p;
  }

  buildCascade(): DtPiece {
    const v = this.v;
    const block = this.calls.length === 1 && this.canSplit(0) ? 0 : -1;
    const chain = this.make(true, IN_CASCADE, 0, block);
    // allowInline.
    let inline = true;
    const secs = v.f(this.root, 1);
    if (v.a.len(secs) > 1) {
      inline = false;
    } else {
      const tk = v.kind(v.f(this.root, 0));
      if (
        tk === N_CONDITIONAL_EXPRESSION ||
        tk === N_BINARY_EXPRESSION ||
        tk === N_PREFIX_EXPRESSION ||
        tk === N_AWAIT_EXPRESSION
      ) {
        inline = false;
      }
    }
    if (!inline) {
      dtPin(chain, S_SPLIT);
    }
    return chain;
  }

  build(isCascadeTarget: boolean): DtPiece {
    const n = toI32(this.calls.length);
    if (n === 0) {
      const t = this.target;
      if (t === null) {
        return this.v.pf.make(PK_ADJACENT);
      }
      return t;
    }
    let leadingProperties = 0;
    while (leadingProperties < n && this.types[leadingProperties] === CT_PROPERTY) {
      leadingProperties++;
    }
    let leadingUnsplittable = leadingProperties;
    while (leadingUnsplittable < n && !this.canSplit(leadingUnsplittable)) {
      leadingUnsplittable++;
    }
    let lastCall = n - 1;
    if (!this.canSplit(lastCall) && n > 1 && this.types[lastCall - 1] === CT_BLOCK_FORMAT) {
      lastCall = n - 2;
    }
    let blockCall = -1;
    if (leadingUnsplittable === lastCall && this.canSplit(lastCall)) {
      blockCall = lastCall;
    } else if (this.types[lastCall] === CT_BLOCK_FORMAT) {
      blockCall = lastCall;
    }
    return this.make(false, isCascadeTarget ? IN_CASCADE : IN_EXPRESSION, leadingProperties, blockCall);
  }

  unwrapCall(e: i32): void {
    const v = this.v;
    const k = v.kind(e);
    if (v.looksLikeStaticCall(e)) {
      this.visitTarget(e, false);
      return;
    }
    if (k === N_METHOD_INVOCATION && v.f(e, 0) >= 0) {
      this.unwrapCall(v.f(e, 0));
      const argList = v.f(e, 4);
      let ct = CT_UNSPLITTABLE;
      if (v.canSplit(v.f(argList, 1), v.f(argList, 2))) {
        ct = CT_SPLITTABLE;
      }
      v.begin();
      v.token(v.f(e, 1));
      v.visit(v.f(e, 2));
      v.visit(v.f(e, 3));
      v.begin();
      v.writeArgumentList(argList);
      const args = v.end();
      if (args.kind === PK_LIST && dtListHasBlockElement(args)) {
        ct = CT_BLOCK_FORMAT;
      }
      v.add(args);
      this.calls.push(v.end());
      this.types.push(ct);
      return;
    }
    if (k === N_PROPERTY_ACCESS && v.f(e, 0) >= 0) {
      this.unwrapCall(v.f(e, 0));
      v.begin();
      v.token(v.f(e, 1));
      v.visit(v.f(e, 2));
      this.calls.push(v.end());
      this.types.push(CT_PROPERTY);
      return;
    }
    if (k === N_PREFIXED_IDENTIFIER) {
      this.unwrapCall(v.f(e, 0));
      v.begin();
      v.token(v.f(e, 1));
      v.visit(v.f(e, 2));
      this.calls.push(v.end());
      this.types.push(CT_PROPERTY);
      return;
    }
    if (k === N_FUNCTION_EXPRESSION_INVOCATION) {
      this.unwrapCall(v.f(e, 0));
      this.postfixPrepare(e);
      v.begin();
      v.add(this.postfixTarget());
      v.visit(v.f(e, 1));
      v.visit(v.f(e, 2));
      this.postfixFinish(v.end());
      return;
    }
    if (k === N_INDEX_EXPRESSION && v.f(e, 0) >= 0) {
      this.unwrapCall(v.f(e, 0));
      this.postfixPrepare(e);
      v.begin();
      v.add(this.postfixTarget());
      v.writeIndexExpression(e);
      this.postfixFinish(v.end());
      return;
    }
    if (k === N_POSTFIX_EXPRESSION && v.t.kind[v.f(e, 1)] === T_BANG) {
      this.unwrapCall(v.f(e, 0));
      this.postfixPrepare(e);
      v.begin();
      v.add(this.postfixTarget());
      v.token(v.f(e, 1));
      this.postfixFinish(v.end());
      return;
    }
    this.visitTarget(e, false);
  }

  /** _unwrapPostfix, split around createPostfix. */
  postfixOnTarget: boolean = false;

  postfixPrepare(e: i32): void {
    this.postfixOnTarget = this.calls.length === 0;
    // Before 3.13 the target's properties were not recalculated here.
    if (this.postfixOnTarget && dtV313()) {
      this.initTargetProperties(e);
    }
  }

  postfixTarget(): DtPiece {
    if (this.postfixOnTarget) {
      const t = this.target;
      if (t === null) {
        return this.v.pf.make(PK_ADJACENT);
      }
      return t;
    }
    return this.calls[this.calls.length - 1];
  }

  postfixFinish(p: DtPiece): void {
    if (this.postfixOnTarget) {
      this.target = p;
    } else {
      this.calls[this.calls.length - 1] = p;
    }
  }

  visitTarget(e: i32, cascadeTarget: boolean): void {
    this.initTargetProperties(e);
    this.target = this.v.nodePiece(e, false, cascadeTarget ? NC_CASCADE_TARGET : NC_NONE);
  }

  initTargetProperties(e: i32): void {
    this.allowSplitInTarget = this.v.canBlockSplit(e);
    this.hasSingleElementTarget = dtV313() && this.v.hasSingleElement(e);
  }
}

export const dtListHasBlockElement = (p: DtPiece): boolean => {
  for (const el of p.list) {
    if (el.b0) {
      return true;
    }
  }
  return false;
};

const dtStyleDefault = (): DtListStyle => new DtListStyle(CM_TRAILING, 1, false);

const dtStrUtf16 = (s: string): i32 => {
  let n = 0;
  const k = toI32(s.length);
  for (let i = 0; i < k; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80 || c >= 0xc0) {
      n += c >= 0xf0 ? 2 : 1;
    }
  }
  return n;
};

/** A `with`, `implements`, etc. clause of a type header. */
class DtClause {
  keyword: i32;
  types: i32[];
  constructor(keyword: i32) {
    this.keyword = keyword;
    this.types = [];
  }
}

/** TypeBuilder. */
class DtTypeBuilder {
  v: DtVisitor;
  meta: i32;
  keywords: i32[];
  name: i32 = -1;
  tps: i32 = -1;
  namePart: i32 = -1;
  clauses: DtClause[];
  allowLeadingClause: boolean = false;

  constructor(v: DtVisitor, meta: i32, keywords: i32[]) {
    this.v = v;
    this.meta = meta;
    this.keywords = keywords;
    this.clauses = [];
  }

  /** Adds a clause node (keyword T, types L). */
  clause(node: i32): void {
    if (node < 0) {
      return;
    }
    const v = this.v;
    const c = new DtClause(v.f(node, 0));
    const types = v.f(node, 1);
    for (let i = 0; i < v.a.len(types); i++) {
      c.types.push(v.a.at(types, i));
    }
    this.clauses.push(c);
  }

  nativeClause(node: i32): void {
    if (node < 0) {
      return;
    }
    const v = this.v;
    const c = new DtClause(v.f(node, 0));
    if (v.f(node, 1) >= 0) {
      c.types.push(v.f(node, 1));
    }
    this.clauses.push(c);
  }

  buildClause(c: DtClause): DtPiece {
    const v = this.v;
    const ops: DtPiece[] = [];
    ops.push(v.tokenPiece(c.keyword));
    for (const t of c.types) {
      ops.push(v.nodePiece(t, true, NC_NONE));
    }
    return v.infix(ops, IN_EXPRESSION, false);
  }

  buildClassBody(body: i32): void {
    const v = this.v;
    const bodyType = v.kind(body) === N_BLOCK_CLASS_BODY ? TB_BLOCK : TB_SEMICOLON;
    this.buildType(body, bodyType, -1);
  }

  buildEnum(node: i32): void {
    const v = this.v;
    const body = v.f(node, 5);
    let bodyType = TB_SEMICOLON;
    if (v.kind(body) === N_BLOCK_ENUM_BODY) {
      bodyType = v.a.len(v.f(body, 3)) === 0 ? TB_LIST : TB_BLOCK;
    }
    this.buildType(body, bodyType, node);
  }

  /** The body piece for a class body or an enum body (`enumNode` >= 0). */
  buildBody(body: i32, enumNode: i32): DtPiece {
    const v = this.v;
    const k = v.kind(body);
    if (k === N_BLOCK_CLASS_BODY) {
      v.begin();
      v.writeBody(v.f(body, 0), v.f(body, 1), v.f(body, 2), false);
      return v.end();
    }
    if (k === N_EMPTY_CLASS_BODY || k === N_EMPTY_ENUM_BODY) {
      return v.tokenPiece(v.f(body, 0));
    }
    // BlockEnumBody.
    if (v.a.len(v.f(body, 3)) === 0) {
      const np = v.f(enumNode, 2);
      return this.buildNormalEnumBody(body, v.kind(np) === N_PRIMARY_CONSTRUCTOR_DECLARATION);
    }
    return this.buildEnhancedEnumBody(body);
  }

  buildMixinApplicationClass(equals: i32, superclass: i32, semicolon: i32): void {
    const v = this.v;
    const began = v.withMetaBegin(this.meta);
    v.begin();
    this.buildHeader(true);
    v.space();
    v.token(equals);
    v.space();
    v.visit(superclass);
    let header = v.end();
    header = this.buildClauses(header);
    const tp = v.pf.make(PK_TYPE);
    tp.a = header;
    tp.b = v.tokenPiece(semicolon);
    tp.i0 = TB_SEMICOLON;
    v.add(tp);
    v.withMetaEnd(began, false);
  }

  buildType(body: i32, bodyType: i32, enumNode: i32): void {
    const v = this.v;
    const began = v.withMetaBegin(this.meta);
    const np = this.namePart;
    if (np >= 0 && v.kind(np) === N_PRIMARY_CONSTRUCTOR_DECLARATION) {
      v.begin();
      this.buildHeader(false);
      const header = v.end();
      const params = v.nodePiece(v.f(np, 4), false, NC_NONE);
      const clauses: DtPiece[] = [];
      for (const c of this.clauses) {
        clauses.push(this.buildClause(c));
      }
      const bp = this.buildBody(body, enumNode);
      const p = v.pf.make(PK_PRIMARY_TYPE);
      p.a = header;
      p.b = params;
      p.list = clauses;
      p.c = bp;
      p.i0 = bodyType;
      v.add(p);
    } else {
      v.begin();
      this.buildHeader(true);
      const header = this.buildClauses(v.end());
      const bp = this.buildBody(body, enumNode);
      const p = v.pf.make(PK_TYPE);
      p.a = header;
      p.b = bp;
      p.i0 = bodyType;
      v.add(p);
    }
    v.withMetaEnd(began, false);
  }

  buildHeader(includeParameters: boolean): void {
    const v = this.v;
    let space = false;
    for (const k of this.keywords) {
      if (space) {
        v.space();
      }
      v.token(k);
      if (k >= 0) {
        space = true;
      }
    }
    const np = this.namePart;
    if (np < 0) {
      v.token(this.name, space);
      v.visit(this.tps);
    } else if (v.kind(np) === N_NAME_WITH_TYPE_PARAMETERS) {
      v.token(v.f(np, 0), space);
      v.visit(v.f(np, 1));
    } else {
      v.token(v.f(np, 0), space);
      v.token(v.f(np, 1), true);
      v.visit(v.f(np, 2));
      v.visit(v.f(np, 3));
      if (includeParameters) {
        v.visit(v.f(np, 4));
      }
    }
  }

  buildClauses(header: DtPiece): DtPiece {
    if (this.clauses.length === 0) {
      return header;
    }
    const v = this.v;
    const ps: DtPiece[] = [];
    for (const c of this.clauses) {
      ps.push(this.buildClause(c));
    }
    const p = v.pf.make(PK_CLAUSE);
    p.a = header;
    p.list = ps;
    p.b0 = this.allowLeadingClause && ps.length > 1;
    return p;
  }

  buildNormalEnumBody(body: i32, forceSplit: boolean): DtPiece {
    const v = this.v;
    const b = new DtListBuilder(v, new DtListStyle(CM_TRAILING, 1, true));
    b.leftBracket(v.f(body, 0));
    const consts = v.f(body, 1);
    for (let i = 0; i < v.a.len(consts); i++) {
      b.visit(v.a.at(consts, i));
    }
    b.rightBracket(v.f(body, 4), -1, v.f(body, 2));
    return b.build(forceSplit, true);
  }

  buildEnhancedEnumBody(body: i32): DtPiece {
    const v = this.v;
    const b = new DtSeqBuilder(v);
    b.leftBracket(v.f(body, 0));
    const consts = v.f(body, 1);
    const n = v.a.len(consts);
    for (let i = 0; i < n; i++) {
      const c = v.a.at(consts, i);
      const isLast = i === n - 1;
      b.addCommentsBefore(v.a.beg[c]);
      b.add(v.createEnumConstant(c, !isLast, isLast ? v.f(body, 2) : -1), IN_NONE, true);
    }
    b.addBlank();
    let needsBlank = false;
    const members = v.f(body, 3);
    for (let i = 0; i < v.a.len(members); i++) {
      const m = v.a.at(members, i);
      if (needsBlank) {
        b.addBlank();
      }
      b.visit(m, IN_NONE, false);
      needsBlank = v.hasNonEmptyBody(m);
    }
    b.rightBracket(v.f(body, 4));
    return b.build(false);
  }
}

/** Pins `p` and everything under it so nothing splits (interpolations). */
const dtPreventAll = (p: DtPiece): void => {
  dtPreventSplit(p);
  for (const k of dtKidsNow(p)) {
    dtPreventAll(k);
  }
};
