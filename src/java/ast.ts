// A Java syntax tree in the shape google-java-format's visitor reads from
// javac: one node per javac tree, its children in numbered slots, lists in
// one shared array. Positions are byte offsets: a node starts at its first
// token and ends after its last.

import { growI32 } from "../core/arr";

// Node kinds (javac's Tree.Kind, coarse; `op` refines operators and literals).
export const N_COMPILATION_UNIT: i32 = 1;
export const N_IMPORT: i32 = 2;
export const N_CLASS: i32 = 3; // sub: CK_*
export const N_METHOD: i32 = 4;
export const N_VARIABLE: i32 = 5;
export const N_BLOCK: i32 = 6;
export const N_EXPRESSION_STATEMENT: i32 = 7;
export const N_IF: i32 = 8;
export const N_FOR: i32 = 9;
export const N_ENHANCED_FOR: i32 = 10;
export const N_WHILE: i32 = 11;
export const N_DO_WHILE: i32 = 12;
export const N_TRY: i32 = 13;
export const N_CATCH: i32 = 14;
export const N_SWITCH: i32 = 15;
export const N_CASE: i32 = 16;
export const N_SYNCHRONIZED: i32 = 17;
export const N_RETURN: i32 = 18;
export const N_THROW: i32 = 19;
export const N_BREAK: i32 = 20;
export const N_CONTINUE: i32 = 21;
export const N_LABELED: i32 = 22;
export const N_EMPTY: i32 = 23;
export const N_ASSERT: i32 = 24;
export const N_YIELD: i32 = 25;
export const N_IDENTIFIER: i32 = 26;
export const N_MEMBER_SELECT: i32 = 27;
export const N_METHOD_INVOCATION: i32 = 28;
export const N_NEW_CLASS: i32 = 29;
export const N_NEW_ARRAY: i32 = 30;
export const N_LITERAL: i32 = 31; // op: LIT_*
export const N_PARENTHESIZED: i32 = 32;
export const N_ASSIGNMENT: i32 = 33;
export const N_COMPOUND_ASSIGNMENT: i32 = 34; // op: the operator id
export const N_UNARY: i32 = 35; // op: the operator id
export const N_BINARY: i32 = 36; // op: the operator id
export const N_CONDITIONAL: i32 = 37;
export const N_INSTANCE_OF: i32 = 38;
export const N_TYPE_CAST: i32 = 39;
export const N_ARRAY_ACCESS: i32 = 40;
export const N_LAMBDA: i32 = 41;
export const N_MEMBER_REFERENCE: i32 = 42;
export const N_SWITCH_EXPRESSION: i32 = 43;
export const N_PRIMITIVE_TYPE: i32 = 44;
export const N_ARRAY_TYPE: i32 = 45;
export const N_PARAMETERIZED_TYPE: i32 = 46;
export const N_WILDCARD: i32 = 47; // op: 0 unbound, 1 extends, 2 super
export const N_UNION_TYPE: i32 = 48;
export const N_INTERSECTION_TYPE: i32 = 49;
export const N_ANNOTATED_TYPE: i32 = 50;
export const N_TYPE_PARAMETER: i32 = 51;
export const N_ANNOTATION: i32 = 52;
export const N_MODIFIERS: i32 = 53;
export const N_BINDING_PATTERN: i32 = 54;
export const N_DECONSTRUCTION_PATTERN: i32 = 55;
export const N_ANY_PATTERN: i32 = 56;
export const N_CONSTANT_CASE_LABEL: i32 = 57;
export const N_PATTERN_CASE_LABEL: i32 = 58;
export const N_DEFAULT_CASE_LABEL: i32 = 59;
export const N_MODULE: i32 = 60;
export const N_EXPORTS: i32 = 61;
export const N_OPENS: i32 = 62;
export const N_PROVIDES: i32 = 63;
export const N_REQUIRES: i32 = 64;
export const N_USES: i32 = 65;

// Class kinds.
export const CK_CLASS: i32 = 0;
export const CK_INTERFACE: i32 = 1;
export const CK_ENUM: i32 = 2;
export const CK_ANNOTATION: i32 = 3;
export const CK_RECORD: i32 = 4;

// Literal kinds.
export const LIT_INT: i32 = 1;
export const LIT_LONG: i32 = 2;
export const LIT_FLOAT: i32 = 3;
export const LIT_DOUBLE: i32 = 4;
export const LIT_BOOLEAN: i32 = 5;
export const LIT_CHAR: i32 = 6;
export const LIT_STRING: i32 = 7;
export const LIT_NULL: i32 = 8;

// Operators (unary, binary and compound assignment share ids).
export const OP_POS: i32 = 1; // +x
export const OP_NEG: i32 = 2; // -x
export const OP_NOT: i32 = 3; // !
export const OP_COMPL: i32 = 4; // ~
export const OP_PREINC: i32 = 5;
export const OP_PREDEC: i32 = 6;
export const OP_POSTINC: i32 = 7;
export const OP_POSTDEC: i32 = 8;
export const OP_OR: i32 = 10; // ||
export const OP_AND: i32 = 11; // &&
export const OP_BITOR: i32 = 12;
export const OP_BITXOR: i32 = 13;
export const OP_BITAND: i32 = 14;
export const OP_EQ: i32 = 15;
export const OP_NE: i32 = 16;
export const OP_LT: i32 = 17;
export const OP_GT: i32 = 18;
export const OP_LE: i32 = 19;
export const OP_GE: i32 = 20;
export const OP_SL: i32 = 21;
export const OP_SR: i32 = 22;
export const OP_USR: i32 = 23;
export const OP_PLUS: i32 = 24;
export const OP_MINUS: i32 = 25;
export const OP_MUL: i32 = 26;
export const OP_DIV: i32 = 27;
export const OP_MOD: i32 = 28;

// Flags.
export const FL_VARARGS: i32 = 1;
export const FL_ENUM: i32 = 2; // an enum constant
export const FL_RECORD: i32 = 4; // a record component
export const FL_COMPACT_CTOR: i32 = 8;
export const FL_STATIC: i32 = 16; // a static import, a static block
export const FL_CTOR: i32 = 32;
export const FL_RULE: i32 = 64; // a `->` case
export const FL_STATEMENT_BODY: i32 = 128; // a lambda with a block body
export const FL_OPEN_MODULE: i32 = 256;
export const FL_NEW_REF: i32 = 512; // a `::new` reference
export const FL_IMPLICIT: i32 = 1024; // an implicitly declared class: the file's top-level fields and methods

/** The operator's text. */
export const opName = (op: i32): string => {
  switch (op) {
    case OP_POS:
      return "+";
    case OP_NEG:
      return "-";
    case OP_NOT:
      return "!";
    case OP_COMPL:
      return "~";
    case OP_PREINC:
    case OP_POSTINC:
      return "++";
    case OP_PREDEC:
    case OP_POSTDEC:
      return "--";
    case OP_OR:
      return "||";
    case OP_AND:
      return "&&";
    case OP_BITOR:
      return "|";
    case OP_BITXOR:
      return "^";
    case OP_BITAND:
      return "&";
    case OP_EQ:
      return "==";
    case OP_NE:
      return "!=";
    case OP_LT:
      return "<";
    case OP_GT:
      return ">";
    case OP_LE:
      return "<=";
    case OP_GE:
      return ">=";
    case OP_SL:
      return "<<";
    case OP_SR:
      return ">>";
    case OP_USR:
      return ">>>";
    case OP_PLUS:
      return "+";
    case OP_MINUS:
      return "-";
    case OP_MUL:
      return "*";
    case OP_DIV:
      return "/";
    case OP_MOD:
      return "%";
    default:
      return "?";
  }
};

/** TreeInfo.opPrec of a binary operator. */
export const opPrec = (op: i32): i32 => {
  switch (op) {
    case OP_OR:
      return 4;
    case OP_AND:
      return 5;
    case OP_BITOR:
      return 6;
    case OP_BITXOR:
      return 7;
    case OP_BITAND:
      return 8;
    case OP_EQ:
    case OP_NE:
      return 9;
    case OP_LT:
    case OP_GT:
    case OP_LE:
    case OP_GE:
      return 10;
    case OP_SL:
    case OP_SR:
    case OP_USR:
      return 11;
    case OP_PLUS:
    case OP_MINUS:
      return 12;
    case OP_MUL:
    case OP_DIV:
    case OP_MOD:
      return 13;
    default:
      return -1;
  }
};

/**
 * Slots by kind (-1 when absent; a list slot holds a list id, -1 when null):
 *  COMPILATION_UNIT: a pkgAnnotations(list) b pkgName c imports(list) d typeDecls(list) e module
 *  IMPORT: a qualid
 *  CLASS: a mods b typarams(list) c extends d implements(list) e permits(list) f members(list) g recordComponents(list); name
 *  METHOD: a mods b typarams(list) c restype d params(list) e recvparam f thrown(list) g body h defaultValue; name
 *  VARIABLE: a mods b type c init d nameExpr; name
 *  BLOCK: a stats(list)
 *  EXPRESSION_STATEMENT: a expr
 *  IF: a cond b then c else
 *  FOR: a init(list) b cond c update(list) d body
 *  ENHANCED_FOR: a var b expr c body
 *  WHILE: a cond b body;  DO_WHILE: a body b cond
 *  TRY: a resources(list) b block c catches(list) d finally
 *  CATCH: a param b block
 *  SWITCH, SWITCH_EXPRESSION: a selector b cases(list)
 *  CASE: a labels(list) b guard c stats(list) d body
 *  SYNCHRONIZED: a lock b block
 *  RETURN, THROW, YIELD: a expr
 *  BREAK, CONTINUE: name (label tok or -1)
 *  LABELED: a stmt; name
 *  ASSERT: a cond b detail
 *  IDENTIFIER: name
 *  MEMBER_SELECT: a expr; name
 *  METHOD_INVOCATION: a typeargs(list) b meth c args(list)
 *  NEW_CLASS: a encl b typeargs(list) c clazz d args(list) e body (a CLASS)
 *  NEW_ARRAY: a elemtype b dims(list) c inits(list) d annotations(list) e dimAnnotations(list of lists)
 *  LITERAL: (op = LIT_*)
 *  PARENTHESIZED: a expr
 *  ASSIGNMENT, COMPOUND_ASSIGNMENT: a var b expr
 *  UNARY: a expr;  BINARY: a lhs b rhs
 *  CONDITIONAL: a cond b true c false
 *  INSTANCE_OF: a expr b type c pattern
 *  TYPE_CAST: a type b expr
 *  ARRAY_ACCESS: a expr b index
 *  LAMBDA: a params(list) b body
 *  MEMBER_REFERENCE: a qualifier b typeargs(list); name (or -1 for new)
 *  PRIMITIVE_TYPE: name
 *  ARRAY_TYPE: a elem
 *  PARAMETERIZED_TYPE: a type b args(list)
 *  WILDCARD: a bound
 *  UNION_TYPE: a alternatives(list);  INTERSECTION_TYPE: a bounds(list)
 *  ANNOTATED_TYPE: a annotations(list) b underlying
 *  TYPE_PARAMETER: a annotations(list) b bounds(list); name
 *  ANNOTATION: a type b args(list)
 *  MODIFIERS: a annotations(list) (start is -1 when empty)
 *  BINDING_PATTERN: a var
 *  DECONSTRUCTION_PATTERN: a deconstructor b nested(list)
 *  CONSTANT_CASE_LABEL: a expr;  PATTERN_CASE_LABEL: a pattern
 *  MODULE: a annotations(list) b name c directives(list)
 *  EXPORTS, OPENS: a package b modules(list);  PROVIDES: a service b impls(list)
 *  REQUIRES: a module;  USES: a service
 */
export class JTree {
  n: i32 = 0;
  kind: i32[];
  op: i32[];
  start: i32[];
  end: i32[];
  name: i32[];
  flags: i32[];
  parent: i32[];
  a: i32[];
  b: i32[];
  c: i32[];
  d: i32[];
  e: i32[];
  f: i32[];
  g: i32[];
  h: i32[];

  // Lists: items[lStart[l] .. lStart[l] + lLen[l]).
  nLists: i32 = 0;
  lStart: i32[];
  lLen: i32[];
  items: i32[];
  nItems: i32 = 0;
  // A stack lists are built on before they are copied into `items`.
  tmp: i32[];
  nTmp: i32 = 0;

  constructor() {
    const c = 1024;
    this.kind = new Array<i32>(c);
    this.op = new Array<i32>(c);
    this.start = new Array<i32>(c);
    this.end = new Array<i32>(c);
    this.name = new Array<i32>(c);
    this.flags = new Array<i32>(c);
    this.parent = new Array<i32>(c);
    this.a = new Array<i32>(c);
    this.b = new Array<i32>(c);
    this.c = new Array<i32>(c);
    this.d = new Array<i32>(c);
    this.e = new Array<i32>(c);
    this.f = new Array<i32>(c);
    this.g = new Array<i32>(c);
    this.h = new Array<i32>(c);
    this.lStart = new Array<i32>(256);
    this.lLen = new Array<i32>(256);
    this.items = new Array<i32>(1024);
    this.tmp = new Array<i32>(256);
  }

  reset(): void {
    this.n = 0;
    this.nLists = 0;
    this.nItems = 0;
    this.nTmp = 0;
  }

  /**
   * Makes room for `cap` nodes up front. The parser writes `t.a[n] = parse()`,
   * which reads the column before the call; a column the call grew would
   * lose the write, so a parse must never grow the columns.
   */
  ensure(cap: i32): void {
    if (cap > toI32(this.kind.length)) {
      this.grow(cap);
    }
  }

  private grow(c: i32): void {
    this.kind = growI32(this.kind, c);
    this.op = growI32(this.op, c);
    this.start = growI32(this.start, c);
    this.end = growI32(this.end, c);
    this.name = growI32(this.name, c);
    this.flags = growI32(this.flags, c);
    this.parent = growI32(this.parent, c);
    this.a = growI32(this.a, c);
    this.b = growI32(this.b, c);
    this.c = growI32(this.c, c);
    this.d = growI32(this.d, c);
    this.e = growI32(this.e, c);
    this.f = growI32(this.f, c);
    this.g = growI32(this.g, c);
    this.h = growI32(this.h, c);
  }

  node(kind: i32, start: i32): i32 {
    const i = this.n;
    if (i >= toI32(this.kind.length)) {
      // Only reached past the parser's estimate; see `ensure`.
      const c = i * 2 + 16;
      this.kind = growI32(this.kind, c);
      this.op = growI32(this.op, c);
      this.start = growI32(this.start, c);
      this.end = growI32(this.end, c);
      this.name = growI32(this.name, c);
      this.flags = growI32(this.flags, c);
      this.parent = growI32(this.parent, c);
      this.a = growI32(this.a, c);
      this.b = growI32(this.b, c);
      this.c = growI32(this.c, c);
      this.d = growI32(this.d, c);
      this.e = growI32(this.e, c);
      this.f = growI32(this.f, c);
      this.g = growI32(this.g, c);
      this.h = growI32(this.h, c);
    }
    this.kind[i] = kind;
    this.op[i] = 0;
    this.start[i] = start;
    this.end[i] = start;
    this.name[i] = -1;
    this.flags[i] = 0;
    this.parent[i] = -1;
    this.a[i] = -1;
    this.b[i] = -1;
    this.c[i] = -1;
    this.d[i] = -1;
    this.e[i] = -1;
    this.f[i] = -1;
    this.g[i] = -1;
    this.h[i] = -1;
    this.n = i + 1;
    return i;
  }

  /** Marks the start of a list on the build stack; answers the mark. */
  mark(): i32 {
    return this.nTmp;
  }

  push(x: i32): void {
    if (this.nTmp >= toI32(this.tmp.length)) {
      this.tmp = growI32(this.tmp, this.nTmp * 2 + 16);
    }
    this.tmp[this.nTmp] = x;
    this.nTmp = this.nTmp + 1;
  }

  /** Copies the stack from `mark` into a new list and pops it. */
  list(mark: i32): i32 {
    const len = this.nTmp - mark;
    const l = this.nLists;
    if (l >= toI32(this.lStart.length)) {
      this.lStart = growI32(this.lStart, l * 2 + 16);
      this.lLen = growI32(this.lLen, l * 2 + 16);
    }
    if (this.nItems + len > toI32(this.items.length)) {
      this.items = growI32(this.items, (this.nItems + len) * 2 + 16);
    }
    this.lStart[l] = this.nItems;
    this.lLen[l] = len;
    for (let i = 0; i < len; i++) {
      this.items[this.nItems + i] = this.tmp[mark + i];
    }
    this.nItems = this.nItems + len;
    this.nTmp = mark;
    this.nLists = l + 1;
    return l;
  }

  /** An empty list. */
  empty(): i32 {
    return this.list(this.nTmp);
  }

  len(l: i32): i32 {
    return l < 0 ? 0 : this.lLen[l];
  }

  at(l: i32, i: i32): i32 {
    return this.items[this.lStart[l] + i];
  }

  last(l: i32): i32 {
    return this.items[this.lStart[l] + this.lLen[l] - 1];
  }
}
