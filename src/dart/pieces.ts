// dart_style's Piece tree (lib/src/piece/*.dart): one class for every piece
// type, with the kind deciding which fields mean what, and the behaviour of
// each type (states, constraints, allowed child shapes, page width pinning)
// as functions over the kind.
//
// Ported from dart_style (Dart SDK 3.14) (BSD-3-Clause, Copyright the Dart
// project authors).

// Piece kinds.
export const PK_ADJACENT: i32 = 1;
export const PK_ASSIGN: i32 = 2;
export const PK_CASE_EXPRESSION: i32 = 3;
export const PK_CHAIN: i32 = 4;
export const PK_CLAUSE: i32 = 5;
export const PK_CONSTRUCTOR: i32 = 6;
export const PK_CONTROL_FLOW: i32 = 7;
export const PK_FOR: i32 = 8;
export const PK_FOR_IN: i32 = 9;
export const PK_GROUPING: i32 = 10;
export const PK_IF_CASE: i32 = 11;
export const PK_INFIX: i32 = 12;
export const PK_LEADING_COMMENT: i32 = 13;
export const PK_LIST: i32 = 14;
export const PK_LIST_ELEMENT: i32 = 15;
export const PK_PREFIX: i32 = 16;
export const PK_SEQUENCE: i32 = 17;
export const PK_BLOCK: i32 = 18;
export const PK_SEQUENCE_ELEMENT: i32 = 19;
export const PK_CODE: i32 = 20;
export const PK_COMMENT: i32 = 21;
export const PK_ENABLE_FORMATTING: i32 = 22;
export const PK_SPACE: i32 = 23;
export const PK_NEWLINE: i32 = 24;
export const PK_TYPE: i32 = 25;
export const PK_PRIMARY_TYPE: i32 = 26;
export const PK_TYPE_PARAMETER_BOUND: i32 = 27;
export const PK_TYPE_TEST: i32 = 28;
export const PK_VARIABLE: i32 = 29;

// States, interned by (value, cost) as Dart's const State instances are.
export const S_UNSPLIT: i32 = 0; // State(0, cost: 0)
export const S_SPLIT: i32 = 1; // State(255)
export const S_1_0: i32 = 2; // State(1, cost: 0)
export const S_1_1: i32 = 3; // State(1)
export const S_2_1: i32 = 4; // State(2)
export const S_2_2: i32 = 5; // State(2, cost: 2)
export const S_3_1: i32 = 6; // State(3)

export const dtStateValue = (s: i32): i32 => {
  switch (s) {
    case S_UNSPLIT:
      return 0;
    case S_SPLIT:
      return 255;
    case S_1_0:
    case S_1_1:
      return 1;
    case S_2_1:
    case S_2_2:
      return 2;
    default:
      return 3;
  }
};

export const dtStateBaseCost = (s: i32): i32 => {
  switch (s) {
    case S_UNSPLIT:
    case S_1_0:
      return 0;
    case S_2_2:
      return 2;
    default:
      return 1;
  }
};

// Named states, per piece type.
export const LIST_ELEMENT_APPEND_COMMA: i32 = S_1_0;
export const ASSIGN_BLOCK_OR_HEADLINE_RIGHT: i32 = S_1_0;
export const ASSIGN_BLOCK_LEFT: i32 = S_2_1;
export const CASE_BLOCK_BODY: i32 = S_1_0;
export const CASE_BEFORE_BODY: i32 = S_2_1;
export const CASE_BEFORE_WHEN_AND_BODY: i32 = S_3_1;
export const CHAIN_BLOCK_TRAILING_CALL: i32 = S_1_0;
export const CHAIN_SPLIT_AFTER_PROPERTIES: i32 = S_2_1;
export const CLAUSE_BETWEEN: i32 = S_1_1;
export const CTOR_BEFORE_INITIALIZERS: i32 = S_1_1;
export const CTOR_BETWEEN_INITIALIZERS: i32 = S_2_2;
export const IFCASE_BEFORE_WHEN: i32 = S_1_1;
export const IFCASE_BEFORE_CASE: i32 = S_2_1;
export const IFCASE_BEFORE_CASE_AND_WHEN: i32 = S_3_1;
export const PRIMARY_BEFORE_CLAUSES: i32 = S_1_1;
export const PRIMARY_INLINE_CLAUSES: i32 = S_2_1;
export const PRIMARY_BETWEEN_CLAUSES: i32 = S_3_1;
export const BOUND_INSIDE: i32 = S_1_1;
export const BOUND_BEFORE_EXTENDS: i32 = S_2_1;
export const TYPE_TEST_BLOCK: i32 = S_1_1;
export const VAR_BETWEEN: i32 = S_1_1;
export const VAR_AFTER_TYPE: i32 = S_2_2;


// Shapes, as bits.
export const SH_INLINE: i32 = 1;
export const SH_BLOCK: i32 = 2;
export const SH_HEADLINE: i32 = 4;
export const SH_OTHER: i32 = 8;
export const SH_ALL: i32 = 15;

export const dtShapeMerge = (a: i32, b: i32): i32 => {
  if (a === SH_INLINE) {
    return b;
  }
  if (b === SH_INLINE) {
    return a;
  }
  return SH_OTHER;
};

const dtAnyIf = (c: boolean): i32 => (c ? SH_ALL : SH_INLINE);

// Indentation kinds (the back end's Indent enum).
export const IN_NONE: i32 = 0;
export const IN_ASSIGNMENT: i32 = 1;
export const IN_BLOCK: i32 = 2;
export const IN_CASCADE: i32 = 3;
export const IN_CONTROL_FLOW_CLAUSE: i32 = 4;
export const IN_EXPRESSION: i32 = 5;
export const IN_GROUPING: i32 = 6;
export const IN_INFIX: i32 = 7;
export const IN_INITIALIZER: i32 = 8;
export const IN_INITIALIZER_OPTIONAL: i32 = 9;

export const dtIndentSpaces = (k: i32): i32 => {
  switch (k) {
    case IN_ASSIGNMENT:
    case IN_CONTROL_FLOW_CLAUSE:
    case IN_EXPRESSION:
    case IN_INFIX:
      return 4;
    case IN_BLOCK:
    case IN_CASCADE:
    case IN_INITIALIZER:
      return 2;
    case IN_INITIALIZER_OPTIONAL:
      return 3;
    default:
      return 0;
  }
};

// Whitespace.
export const WS_NONE: i32 = 0;
export const WS_SPACE: i32 = 1;
export const WS_NEWLINE: i32 = 2;
export const WS_BLANK: i32 = 3;

// List commas.
export const CM_ALWAYS_TRAILING: i32 = 0;
export const CM_TRAILING: i32 = 1;
export const CM_NON_TRAILING: i32 = 2;
export const CM_NONE: i32 = 3;

// Type body kinds.
export const TB_BLOCK: i32 = 0;
export const TB_LIST: i32 = 1;
export const TB_SEMICOLON: i32 = 2;

// Chain call types.
export const CT_PROPERTY: i32 = 0;
export const CT_UNSPLITTABLE: i32 = 1;
export const CT_SPLITTABLE: i32 = 2;
export const CT_BLOCK_FORMAT: i32 = 3;

/**
 * A piece. Fields by kind:
 *
 * - Adjacent: list = pieces
 * - Assign: a left, b right, b0 avoidSplit
 * - CaseExpression: a pattern, b guard?, c arrow, d body, b0
 *   canBlockSplitPattern, b1 patternIsLogicalOr, b2 canBlockSplitBody
 * - Chain: a target, list calls, ints call types, i0 leadingProperties,
 *   i1 blockCallIndex, i2 indent, b0 isCascade, b1 hasSingleElementTarget
 * - Clause: a header, list clauses, b0 allowLeadingClause
 * - Constructor: a header, b parameters?, c redirect?, d separator?,
 *   e initializers?, f body, b0 canSplitParameters, b1 hasOptionalParameter
 * - ControlFlow: list headers, list2 statements, ints isBlock, b0 isStatement
 * - For: a forKeyword, b parts, b0 indent
 * - ForIn: a variable, b sequence
 * - Grouping, Prefix: a content
 * - IfCase: a value, b pattern, c guard?, b0 canBlockSplitPattern
 * - Infix: list operands, i0 indent, b0 isConditional
 * - LeadingComment: list comments, a piece
 * - List: a before?, b after?, list elements, i0 commas, i1 splitCost,
 *   b0 spaceWhenUnsplit, i2 lastNonCommentElement, b1 isBlockShaped
 * - ListElement: list leadingComments, a content?, list2 hangingComments,
 *   b0 allowNewlinesWhenUnsplit, b1 indentWhenBlockFormatted, delim,
 *   i0 commentsBeforeDelimiter, b2 blank after it in its list
 * - Sequence: list elements
 * - Block: a left, b sequence, c right
 * - SequenceElement: a piece, list hangingComments, i0 indent, b0 blankAfter
 * - Code: lines, list leadingComments, list2 hangingComments, soft
 * - Comment, EnableFormatting: lines, i0 trailing whitespace, soft;
 *   b0 enabled, i1 source offset
 * - Type: a header, b body, i0 body type
 * - PrimaryType: a header, b parameters, list clauses, c body, i0 body type
 * - TypeParameterBound: a typeParameter, b bound
 * - TypeTest: a expression, b operator, c type, b0 canBlockSplit
 * - Variable: a header, list variables, b0 hasType
 */
export class DtPiece {
  id: i32;
  kind: i32;
  pinned: i32 = -1;
  hardNl: i32 = -1;
  total: i32 = -1;
  a: DtPiece | null = null;
  b: DtPiece | null = null;
  c: DtPiece | null = null;
  d: DtPiece | null = null;
  e: DtPiece | null = null;
  f: DtPiece | null = null;
  list: DtPiece[];
  list2: DtPiece[];
  ints: i32[];
  i0: i32 = 0;
  i1: i32 = 0;
  i2: i32 = 0;
  b0: boolean = false;
  b1: boolean = false;
  b2: boolean = false;
  soft: boolean = false;
  delim: string = "";
  lines: string[];
  lens: i32[];
  // Caches.
  statesC: i32[] | null = null;
  kidsC: DtPiece[] | null = null;
  offspringC: DtPiece[] | null = null;
  // The CodeWriter's set membership mark.
  mark: i32 = 0;
  // The number of states (-1 until known).
  ns: i32 = -1;

  constructor(id: i32, kind: i32) {
    this.id = id;
    this.kind = kind;
    this.list = [];
    this.list2 = [];
    this.ints = [];
    this.lines = [];
    this.lens = [];
  }
}

/** Creates pieces with ids. */
export class DtPieces {
  n: i32 = 0;
  constructor() {}

  make(kind: i32): DtPiece {
    const p = new DtPiece(this.n, kind);
    this.n = this.n + 1;
    return p;
  }
}

/** forEachChild, in order (cached once the tree is complete). */
export const dtKids = (p: DtPiece): DtPiece[] => {
  const cached = p.kidsC;
  if (cached !== null) {
    return cached;
  }
  const out = dtKidsNow(p);
  p.kidsC = out;
  return out;
};

/** forEachChild, uncached (while the tree is still being built). */
export const dtKidsNow = (p: DtPiece): DtPiece[] => {
  const out: DtPiece[] = [];
  const k = p.kind;
  switch (k) {
    case PK_ADJACENT:
    case PK_INFIX:
    case PK_SEQUENCE:
      for (const x of p.list) {
        out.push(x);
      }
      break;
    case PK_ASSIGN:
    case PK_FOR:
    case PK_FOR_IN:
    case PK_TYPE:
    case PK_TYPE_PARAMETER_BOUND:
      dtPush(out, p.a);
      dtPush(out, p.b);
      break;
    case PK_CASE_EXPRESSION:
      dtPush(out, p.a);
      dtPush(out, p.b);
      dtPush(out, p.c);
      dtPush(out, p.d);
      break;
    case PK_CHAIN:
      dtPush(out, p.a);
      for (const x of p.list) {
        out.push(x);
      }
      break;
    case PK_CLAUSE:
      dtPush(out, p.a);
      for (const x of p.list) {
        out.push(x);
      }
      break;
    case PK_CONSTRUCTOR:
      // dart_style visits the redirect twice and never the parameters.
      dtPush(out, p.a);
      dtPush(out, p.c);
      dtPush(out, p.c);
      dtPush(out, p.d);
      dtPush(out, p.e);
      dtPush(out, p.f);
      break;
    case PK_CONTROL_FLOW:
      for (let i = 0; i < p.list.length; i++) {
        out.push(p.list[i]);
        out.push(p.list2[i]);
      }
      break;
    case PK_GROUPING:
    case PK_PREFIX:
      dtPush(out, p.a);
      break;
    case PK_IF_CASE:
      dtPush(out, p.a);
      dtPush(out, p.b);
      dtPush(out, p.c);
      break;
    case PK_LEADING_COMMENT:
      for (const x of p.list) {
        out.push(x);
      }
      dtPush(out, p.a);
      break;
    case PK_LIST:
      dtPush(out, p.a);
      for (const x of p.list) {
        out.push(x);
      }
      dtPush(out, p.b);
      break;
    case PK_LIST_ELEMENT:
      for (const x of p.list) {
        out.push(x);
      }
      dtPush(out, p.a);
      for (const x of p.list2) {
        out.push(x);
      }
      break;
    case PK_BLOCK:
      dtPush(out, p.a);
      dtPush(out, p.b);
      dtPush(out, p.c);
      break;
    case PK_SEQUENCE_ELEMENT:
      dtPush(out, p.a);
      for (const x of p.list) {
        out.push(x);
      }
      break;
    case PK_CODE:
      for (const x of p.list) {
        out.push(x);
      }
      for (const x of p.list2) {
        out.push(x);
      }
      break;
    case PK_PRIMARY_TYPE:
      dtPush(out, p.a);
      dtPush(out, p.b);
      for (const x of p.list) {
        out.push(x);
      }
      dtPush(out, p.c);
      break;
    case PK_TYPE_TEST:
      dtPush(out, p.a);
      dtPush(out, p.b);
      dtPush(out, p.c);
      break;
    case PK_VARIABLE:
      dtPush(out, p.a);
      for (const x of p.list) {
        out.push(x);
      }
      break;
    default:
      break;
  }
  return out;
};

const dtPush = (out: DtPiece[], x: DtPiece | null): void => {
  if (x !== null) {
    out.push(x);
  }
};

/** Piece.additionalStates (cached). */
export const dtStates = (p: DtPiece): i32[] => {
  const cached = p.statesC;
  if (cached !== null) {
    return cached;
  }
  const out: i32[] = [];
  switch (p.kind) {
    case PK_ASSIGN:
      out.push(ASSIGN_BLOCK_OR_HEADLINE_RIGHT);
      out.push(ASSIGN_BLOCK_LEFT);
      out.push(S_SPLIT);
      break;
    case PK_CASE_EXPRESSION:
      if (p.b2) {
        out.push(CASE_BLOCK_BODY);
      }
      out.push(CASE_BEFORE_BODY);
      if (p.b !== null) {
        out.push(CASE_BEFORE_WHEN_AND_BODY);
      }
      break;
    case PK_CHAIN:
      if (p.i1 !== -1) {
        out.push(CHAIN_BLOCK_TRAILING_CALL);
      }
      if (p.i0 > 0) {
        out.push(CHAIN_SPLIT_AFTER_PROPERTIES);
      }
      out.push(S_SPLIT);
      break;
    case PK_CLAUSE:
      if (p.b0) {
        out.push(CLAUSE_BETWEEN);
      }
      out.push(S_SPLIT);
      break;
    case PK_CONSTRUCTOR:
      if (p.e !== null) {
        out.push(CTOR_BEFORE_INITIALIZERS);
      }
      if (p.b0 && p.e !== null) {
        out.push(CTOR_BETWEEN_INITIALIZERS);
      }
      break;
    case PK_CONTROL_FLOW:
    case PK_FOR_IN:
    case PK_INFIX:
    case PK_LIST:
      out.push(S_SPLIT);
      break;
    case PK_IF_CASE:
      if (p.c !== null) {
        out.push(IFCASE_BEFORE_WHEN);
      }
      out.push(IFCASE_BEFORE_CASE);
      if (p.c !== null) {
        out.push(IFCASE_BEFORE_CASE_AND_WHEN);
      }
      break;
    case PK_TYPE:
      if (p.i0 === TB_LIST) {
        out.push(S_SPLIT);
      }
      break;
    case PK_PRIMARY_TYPE:
      if (p.list.length > 0) {
        out.push(PRIMARY_BEFORE_CLAUSES);
        out.push(PRIMARY_INLINE_CLAUSES);
      }
      out.push(PRIMARY_BETWEEN_CLAUSES);
      out.push(S_SPLIT);
      break;
    case PK_TYPE_PARAMETER_BOUND:
      out.push(BOUND_INSIDE);
      out.push(BOUND_BEFORE_EXTENDS);
      break;
    case PK_TYPE_TEST:
      if (p.b0) {
        out.push(TYPE_TEST_BLOCK);
      }
      out.push(S_SPLIT);
      break;
    case PK_VARIABLE:
      if (p.list.length > 1) {
        out.push(VAR_BETWEEN);
      }
      if (p.b0) {
        out.push(VAR_AFTER_TYPE);
      }
      break;
    default:
      break;
  }
  p.statesC = out;
  return out;
};

export const dtHasStates = (p: DtPiece): boolean => {
  if (p.ns < 0) {
    p.ns = toI32(dtStates(p).length);
  }
  return p.ns > 0;
};

/** Piece.stateCost. */
export const dtStateCost = (p: DtPiece, s: i32): i32 => {
  switch (p.kind) {
    case PK_LIST:
      if (s === S_SPLIT) {
        return p.i1;
      }
      break;
    case PK_ASSIGN:
      if (s === S_SPLIT) {
        return p.b0 ? 1 : 0;
      }
      break;
    case PK_CHAIN:
      if (p.b1 && (s === CHAIN_SPLIT_AFTER_PROPERTIES || s === S_SPLIT)) {
        return 0;
      }
      if (!p.b0 && p.i0 === p.list.length && s === S_SPLIT) {
        return 2;
      }
      if (s === S_SPLIT && p.b0) {
        return 0;
      }
      break;
    default:
      break;
  }
  return dtStateBaseCost(s);
};

/** Piece.containsHardNewline (cached). */
export const dtHardNewline = (p: DtPiece): boolean => {
  if (p.hardNl >= 0) {
    return p.hardNl === 1;
  }
  let r = false;
  switch (p.kind) {
    case PK_CODE:
      // TextPiece's own rule: its comments don't count.
      r = p.lines.length > 1;
      break;
    case PK_COMMENT:
    case PK_ENABLE_FORMATTING:
      r = p.i0 === WS_NEWLINE || p.i0 === WS_BLANK || p.lines.length > 1;
      break;
    case PK_SPACE:
      r = false;
      break;
    case PK_NEWLINE:
    case PK_BLOCK:
      r = true;
      break;
    case PK_SEQUENCE:
      r = p.list.length > 1;
      break;
    default:
      r = dtAnyHardNewline(p);
      break;
  }
  p.hardNl = r ? 1 : 0;
  return r;
};

const dtAnyHardNewline = (p: DtPiece): boolean => {
  let any = false;
  for (const k of dtKids(p)) {
    if (dtHardNewline(k)) {
      any = true;
    }
  }
  return any;
};

/** Piece.totalCharacters (cached). */
export const dtTotalChars = (p: DtPiece): i32 => {
  if (p.total >= 0) {
    return p.total;
  }
  let t = 0;
  switch (p.kind) {
    case PK_CODE:
    case PK_COMMENT:
    case PK_ENABLE_FORMATTING:
      if (!p.soft) {
        for (const n of p.lens) {
          t += n;
        }
      }
      break;
    case PK_SPACE:
      t = 1;
      break;
    case PK_NEWLINE:
      t = 0;
      break;
    default:
      for (const k of dtKids(p)) {
        t += dtTotalChars(k);
      }
      break;
  }
  p.total = t;
  return t;
};

/** Piece.containsNewline. */
export const dtContainsNewline = (p: DtPiece, s: i32): boolean => {
  if (p.kind === PK_CONSTRUCTOR) {
    if (s === CTOR_BEFORE_INITIALIZERS) {
      return true;
    }
  } else if (p.kind === PK_CONTROL_FLOW) {
    if (s === S_SPLIT) {
      for (let i = 0; i < p.ints.length; i++) {
        if (p.ints[i] === 0) {
          return true;
        }
      }
    }
  }
  return s !== S_UNSPLIT || dtHardNewline(p);
};

/** Piece.applyConstraints: the pieces `p` in state `s` constrains, and to what. */
export const dtConstraints = (p: DtPiece, s: i32, outP: DtPiece[], outS: i32[]): void => {
  switch (p.kind) {
    case PK_LIST:
      if (p.i0 === CM_TRAILING && p.i2 !== -1) {
        outP.push(p.list[p.i2]);
        outS.push(s === S_SPLIT ? LIST_ELEMENT_APPEND_COMMA : S_UNSPLIT);
      }
      break;
    case PK_CONSTRUCTOR: {
      const params = p.b;
      const inits = p.e;
      if (params !== null && inits !== null) {
        if (s === S_UNSPLIT) {
          outP.push(params);
          outS.push(S_UNSPLIT);
          outP.push(inits);
          outS.push(S_UNSPLIT);
        } else if (s === CTOR_BEFORE_INITIALIZERS) {
          outP.push(params);
          outS.push(S_UNSPLIT);
          outP.push(inits);
          outS.push(S_SPLIT);
        } else if (s === CTOR_BETWEEN_INITIALIZERS) {
          outP.push(params);
          outS.push(S_SPLIT);
          outP.push(inits);
          outS.push(S_SPLIT);
        }
      }
      break;
    }
    case PK_CONTROL_FLOW:
      if (!p.b0) {
        for (let i = 0; i < p.ints.length; i++) {
          if (p.ints[i] === 1) {
            outP.push(p.list2[i]);
            outS.push(s);
          }
        }
      }
      break;
    case PK_TYPE:
      if (s === S_SPLIT) {
        const body = p.b;
        if (body !== null) {
          outP.push(body);
          outS.push(S_SPLIT);
        }
      }
      break;
    default:
      break;
  }
};

/** Piece.pin. */
export const dtPin = (p: DtPiece, s: i32): void => {
  if (p.pinned >= 0) {
    return;
  }
  p.pinned = s;
  if (dtHasConstraints(p)) {
    const ps: DtPiece[] = [];
    const ss: i32[] = [];
    dtConstraints(p, s, ps, ss);
    for (let i = 0; i < ps.length; i++) {
      dtPin(ps[i], ss[i]);
    }
  }
};

/** Whether the piece's kind ever constrains others. */
export const dtHasConstraints = (p: DtPiece): boolean => {
  const k = p.kind;
  return k === PK_LIST || k === PK_CONSTRUCTOR || k === PK_CONTROL_FLOW || k === PK_TYPE;
};

/** Whether allowedChildShapes can leave out Shape.inline for this kind. */
export const dtMayRefuseInline = (k: i32): boolean =>
  k === PK_ASSIGN || k === PK_CASE_EXPRESSION || k === PK_TYPE_TEST || k === PK_PRIMARY_TYPE;

/** Piece.preventSplit. */
export const dtPreventSplit = (p: DtPiece): void => {
  if (p.kind === PK_LIST_ELEMENT) {
    return;
  }
  dtPin(p, S_UNSPLIT);
};

/** Whether `x` is the (possibly null) `y`. */
const dtIsP = (x: DtPiece, y: DtPiece | null): boolean => y !== null && x === y;

/** Piece.allowedChildShapes. */
export const dtAllowed = (p: DtPiece, s: i32, child: DtPiece): i32 => {
  switch (p.kind) {
    case PK_ASSIGN:
      if (s === S_UNSPLIT) {
        return SH_INLINE;
      }
      if (s === ASSIGN_BLOCK_LEFT && dtIsP(child, p.a)) {
        return SH_BLOCK;
      }
      if (s === ASSIGN_BLOCK_LEFT && dtIsP(child, p.b)) {
        return SH_INLINE | SH_OTHER;
      }
      if (s === ASSIGN_BLOCK_OR_HEADLINE_RIGHT && dtIsP(child, p.b)) {
        return SH_BLOCK | SH_HEADLINE;
      }
      return SH_ALL;
    case PK_CASE_EXPRESSION:
      if (dtIsP(child, p.a) && p.b1) {
        return SH_ALL;
      }
      if (dtIsP(child, p.c)) {
        return SH_ALL;
      }
      if (s === CASE_BLOCK_BODY && dtIsP(child, p.d)) {
        return SH_BLOCK;
      }
      if (s === CASE_BEFORE_BODY && dtIsP(child, p.a)) {
        return dtAnyIf(p.b === null);
      }
      if (s === CASE_BEFORE_BODY && dtIsP(child, p.d)) {
        return SH_ALL;
      }
      if (s === CASE_BEFORE_WHEN_AND_BODY) {
        return SH_ALL;
      }
      return SH_INLINE;
    case PK_CHAIN:
      if (dtIsP(child, p.a)) {
        if (s === S_UNSPLIT || s === CHAIN_BLOCK_TRAILING_CALL || s === CHAIN_SPLIT_AFTER_PROPERTIES) {
          return SH_INLINE | SH_BLOCK;
        }
        return SH_ALL;
      }
      if (s === S_UNSPLIT) {
        return SH_INLINE;
      }
      if (s === CHAIN_SPLIT_AFTER_PROPERTIES) {
        for (let i = 0; i < p.i0; i++) {
          if (p.list[i] === child) {
            return SH_INLINE;
          }
        }
      } else if (s === CHAIN_BLOCK_TRAILING_CALL) {
        return dtAnyIf(p.list[p.i1] === child);
      }
      return SH_ALL;
    case PK_CLAUSE:
      if (dtIsP(child, p.a)) {
        return dtAnyIf(s === S_SPLIT);
      }
      if (p.b0 && child === p.list[0]) {
        return dtAnyIf(s === S_SPLIT);
      }
      return dtAnyIf(s !== S_UNSPLIT);
    case PK_CONSTRUCTOR:
      if (dtIsP(child, p.f)) {
        return SH_ALL;
      }
      return dtAnyIf(p.e === null || s !== S_UNSPLIT);
    case PK_CONTROL_FLOW:
    case PK_INFIX:
      return dtAnyIf(s === S_SPLIT);
    case PK_FOR_IN:
      if (s === S_UNSPLIT) {
        if (dtIsP(child, p.b)) {
          return SH_INLINE | SH_BLOCK;
        }
        return SH_INLINE;
      }
      return SH_ALL;
    case PK_IF_CASE:
      if (s === S_UNSPLIT && dtIsP(child, p.b) && p.b0 && p.c === null) {
        return SH_INLINE | SH_BLOCK;
      }
      if (s === IFCASE_BEFORE_WHEN && p.c !== null && dtIsP(child, p.c)) {
        return SH_ALL;
      }
      if (s === IFCASE_BEFORE_CASE && dtIsP(child, p.b) && p.c === null) {
        return SH_ALL;
      }
      if (s === IFCASE_BEFORE_CASE && dtIsP(child, p.a)) {
        return SH_ALL;
      }
      if (s === IFCASE_BEFORE_CASE_AND_WHEN) {
        return SH_ALL;
      }
      return SH_INLINE;
    case PK_LIST:
      if (s === S_SPLIT) {
        return SH_ALL;
      }
      if (dtIsP(child, p.a)) {
        return SH_ALL;
      }
      if (dtIsP(child, p.b)) {
        return SH_ALL;
      }
      return dtAnyIf(child.kind === PK_LIST_ELEMENT && child.b0);
    case PK_TYPE:
      if (dtIsP(child, p.b)) {
        return SH_ALL;
      }
      return dtAnyIf(p.i0 !== TB_LIST || s === S_SPLIT);
    case PK_PRIMARY_TYPE: {
      if (dtIsP(child, p.a)) {
        return SH_ALL;
      }
      if (s === S_UNSPLIT) {
        if (!dtIsP(child, p.c)) {
          return SH_INLINE;
        }
      } else if (s === PRIMARY_BEFORE_CLAUSES) {
        if (dtIsP(child, p.b)) {
          return SH_INLINE;
        }
      } else if (s === PRIMARY_INLINE_CLAUSES) {
        if (dtIsP(child, p.b)) {
          return SH_BLOCK;
        }
        for (const c of p.list) {
          if (c === child) {
            return SH_INLINE;
          }
        }
      } else if (s === PRIMARY_BETWEEN_CLAUSES) {
        if (dtIsP(child, p.b)) {
          return SH_BLOCK;
        }
      }
      return SH_ALL;
    }
    case PK_TYPE_PARAMETER_BOUND:
      if (s === S_UNSPLIT) {
        return SH_INLINE;
      }
      if (s === BOUND_INSIDE) {
        return dtAnyIf(dtIsP(child, p.b));
      }
      return SH_ALL;
    case PK_TYPE_TEST:
      if (s === S_UNSPLIT) {
        return SH_INLINE;
      }
      if (s === TYPE_TEST_BLOCK && dtIsP(child, p.a)) {
        return SH_BLOCK;
      }
      return SH_ALL;
    case PK_VARIABLE:
      if (p.list.length === 1 && !p.b0) {
        return SH_ALL;
      }
      if (dtIsP(child, p.a)) {
        return dtAnyIf(s !== S_UNSPLIT);
      }
      return dtAnyIf(p.list.length === 1 || s !== S_UNSPLIT);
    default:
      return SH_ALL;
  }
};

/** Piece.fixedStateForPageWidth, or -1. */
export const dtFixedState = (p: DtPiece, pageWidth: i32): i32 => {
  if (p.kind === PK_INFIX) {
    let total = 0;
    for (const op of p.list) {
      if (dtHardNewline(op)) {
        return S_SPLIT;
      }
      total += dtTotalChars(op);
      if (total > pageWidth) {
        break;
      }
    }
    if (total > pageWidth) {
      return S_SPLIT;
    }
    return -1;
  }
  if (p.kind === PK_LIST) {
    let surrounding = 0;
    const before = p.a;
    if (before !== null) {
      if (dtHardNewline(before)) {
        return S_SPLIT;
      }
      surrounding += dtTotalChars(before);
    }
    const after = p.b;
    if (after !== null) {
      surrounding += dtTotalChars(after);
    }
    let line = surrounding;
    let first = true;
    for (const el of p.list) {
      if (el.b0) {
        line = surrounding;
        continue;
      }
      if (dtHardNewline(el)) {
        return S_SPLIT;
      }
      line += dtTotalChars(el);
      if (!first) {
        line += 2;
      }
      first = false;
      if (line > pageWidth) {
        return S_SPLIT;
      }
    }
    return -1;
  }
  return -1;
};

/** Piece.statefulOffspring (cached): the piece and its offspring that have states. */
export const dtOffspring = (p: DtPiece): DtPiece[] => {
  const cached = p.offspringC;
  if (cached !== null) {
    return cached;
  }
  const out: DtPiece[] = [];
  dtCollectStateful(p, out);
  p.offspringC = out;
  return out;
};

const dtCollectStateful = (p: DtPiece, out: DtPiece[]): void => {
  if (dtHasStates(p)) {
    out.push(p);
  }
  for (const k of dtKids(p)) {
    dtCollectStateful(k, out);
  }
};
