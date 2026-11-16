// google-java-format's JavaInputAstVisitor (and its Java 21 subclass), over
// the JTree: each visit emits the ops for one construct. Ported from
// google-java-format 1.28 (Apache License 2.0, Copyright 2015 Google Inc.);
// the order of every op matches the original, since the layout depends on it.

import { GEngine, INDEPENDENT, UNIFIED, FORCED, BL_NO, BL_PRESERVE, BL_YES } from "../gdoc/engine";
import { GInput } from "../gdoc/input";
import {
  CK_ANNOTATION,
  CK_ENUM,
  CK_INTERFACE,
  CK_RECORD,
  FL_COMPACT_CTOR,
  FL_CTOR,
  FL_ENUM,
  FL_NEW_REF,
  FL_OPEN_MODULE,
  FL_RULE,
  FL_STATEMENT_BODY,
  FL_STATIC,
  JTree,
  LIT_STRING,
  N_ANNOTATED_TYPE,
  N_ANNOTATION,
  N_ANY_PATTERN,
  N_ARRAY_ACCESS,
  N_ARRAY_TYPE,
  N_ASSERT,
  N_ASSIGNMENT,
  N_BINARY,
  N_BINDING_PATTERN,
  N_BLOCK,
  N_BREAK,
  N_CASE,
  N_CLASS,
  N_COMPILATION_UNIT,
  N_COMPOUND_ASSIGNMENT,
  N_CONDITIONAL,
  N_CONSTANT_CASE_LABEL,
  N_CONTINUE,
  N_DECONSTRUCTION_PATTERN,
  N_DEFAULT_CASE_LABEL,
  N_DO_WHILE,
  N_EMPTY,
  N_ENHANCED_FOR,
  N_EXPORTS,
  N_EXPRESSION_STATEMENT,
  N_FOR,
  N_IDENTIFIER,
  N_IF,
  N_IMPORT,
  N_INSTANCE_OF,
  N_INTERSECTION_TYPE,
  N_LABELED,
  N_LAMBDA,
  N_LITERAL,
  N_MEMBER_REFERENCE,
  N_MEMBER_SELECT,
  N_METHOD,
  N_METHOD_INVOCATION,
  N_MODULE,
  N_NEW_ARRAY,
  N_NEW_CLASS,
  N_OPENS,
  N_PARAMETERIZED_TYPE,
  N_PARENTHESIZED,
  N_PATTERN_CASE_LABEL,
  N_PRIMITIVE_TYPE,
  N_PROVIDES,
  N_REQUIRES,
  N_RETURN,
  N_SWITCH,
  N_SWITCH_EXPRESSION,
  N_SYNCHRONIZED,
  N_THROW,
  N_TRY,
  N_TYPE_CAST,
  N_TYPE_PARAMETER,
  N_UNARY,
  N_UNION_TYPE,
  N_USES,
  N_VARIABLE,
  N_WHILE,
  N_WILDCARD,
  N_YIELD,
  OP_NEG,
  OP_PLUS,
  OP_POS,
  OP_POSTDEC,
  OP_POSTINC,
  OP_PREDEC,
  OP_PREINC,
  opName,
  opPrec,
} from "./ast";

// Declaration kinds and directions.
const DK_NONE: i32 = 0;
const DK_FIELD: i32 = 1;
const DK_PARAMETER: i32 = 2;
const VERTICAL: i32 = 0;
const HORIZONTAL: i32 = 1;

const MAX_ITEM_LENGTH_FOR_FILLING: i32 = 10;

/** A deque of annotation lists (DimensionHelpers' dims): list ids, -1 for an empty list. */
class Dims {
  items: i32[];
  head: i32 = 0;
  constructor() {
    this.items = [];
  }
  size(): i32 {
    return toI32(this.items.length) - this.head;
  }
  isEmpty(): boolean {
    return this.size() === 0;
  }
  removeFirst(): i32 {
    const x = this.items[this.head];
    this.head = this.head + 1;
    return x;
  }
}

/** One modifier or declaration annotation, in source order. */
class ModItem {
  isModifier: boolean = false;
  tok: i32 = -1; // a modifier's tok
  ann: i32 = -1; // an annotation node
  pos: i32 = 0;
}

class SplitMods {
  decl: ModItem[];
  typeAnnos: i32[]; // annotation nodes
  constructor() {
    this.decl = [];
    this.typeAnnos = [];
  }
  hasDeclarationAnnotation(): boolean {
    for (const m of this.decl) {
      if (!m.isModifier) {
        return true;
      }
    }
    return false;
  }
}

export class JVisitor {
  g: GEngine;
  t: JTree;
  inp: GInput;
  ZERO: i32 = 0;
  plusTwo: i32 = 0;
  plusFour: i32 = 0;
  minusTwo: i32 = 0;
  minusFour: i32 = 0;
  path: i32[];
  nPath: i32 = 0;
  typeAnnotationSimpleNames: string[];
  exprDepth: i32 = 0; // scans of ExpressionTrees open (JavaInputAstVisitor.inExpression)

  constructor(g: GEngine, t: JTree) {
    this.g = g;
    this.t = t;
    this.inp = g.inp;
    this.path = new Array<i32>(256);
    this.typeAnnotationSimpleNames = [];
  }

  reset(): void {
    const g = this.g;
    this.ZERO = g.constIndent(0);
    this.plusTwo = g.constIndent(2);
    this.plusFour = g.constIndent(4);
    this.minusTwo = g.constIndent(-2);
    this.minusFour = g.constIndent(-4);
    this.nPath = 0;
    this.exprDepth = 0;
    this.typeAnnotationSimpleNames = [];
  }

  /** JavaInputAstVisitor.markForPartialFormat: a region boundary, outside expressions only. */
  markForPartialFormat(): void {
    if (this.exprDepth === 0) {
      this.g.markForPartialFormat();
    }
  }

  // ---- Helpers ---------------------------------------------------------------

  token(s: string): void {
    this.g.tok(s);
  }

  tokenInd(s: string, plusIndentCommentsBefore: i32): void {
    this.g.token(s, true, plusIndentCommentsBefore, -1);
  }

  tokenBreakTrailingComment(s: string, ind: i32): void {
    this.g.token(s, true, 0, ind);
  }

  visitName(tok: i32): void {
    this.g.tokLike(tok);
  }

  sync(n: i32): void {
    this.g.sync(this.t.start[n]);
  }

  len(l: i32): i32 {
    return this.t.len(l);
  }

  at(l: i32, i: i32): i32 {
    return this.t.at(l, i);
  }

  startPos(n: i32): i32 {
    return this.t.start[n];
  }

  endPos(n: i32): i32 {
    return this.t.end[n];
  }

  currentLeaf(): i32 {
    return this.nPath > 0 ? this.path[this.nPath - 1] : -1;
  }

  /** The node `up` levels above the current leaf (0 is the leaf), or -1. */
  pathAt(up: i32): i32 {
    const i = this.nPath - 1 - up;
    return i >= 0 ? this.path[i] : -1;
  }

  scan(n: i32): void {
    if (n < 0) {
      return;
    }
    if (this.nPath >= toI32(this.path.length)) {
      const np = new Array<i32>(this.nPath * 2);
      np.set(this.path);
      this.path = np;
    }
    this.path[this.nPath] = n;
    this.nPath = this.nPath + 1;
    const previous = this.g.depthNow();
    // javac's JCExpression subclasses: every expression and type node but a type parameter.
    const k = this.t.kind[n];
    const expr = (k >= N_IDENTIFIER && k <= N_ANNOTATED_TYPE) || k === N_ANNOTATION;
    if (expr) {
      this.exprDepth = this.exprDepth + 1;
    }
    this.visit(n);
    if (expr) {
      this.exprDepth = this.exprDepth - 1;
    }
    this.nPath = this.nPath - 1;
    if (this.g.depthNow() !== previous) {
      this.g.fail("unclosed ops");
    }
  }

  visit(n: i32): void {
    const t = this.t;
    switch (t.kind[n]) {
      case N_COMPILATION_UNIT:
        this.visitCompilationUnit(n);
        break;
      case N_IMPORT:
        this.visitImport(n);
        break;
      case N_CLASS:
        this.visitClass(n);
        break;
      case N_METHOD:
        this.visitMethod(n);
        break;
      case N_VARIABLE:
        this.visitVariable(n);
        break;
      case N_BLOCK:
        this.visitBlock(n, false, false, false);
        break;
      case N_EXPRESSION_STATEMENT:
        this.sync(n);
        this.scan(t.a[n]);
        this.token(";");
        break;
      case N_IF:
        this.visitIf(n);
        break;
      case N_FOR:
        this.visitForLoop(n);
        break;
      case N_ENHANCED_FOR:
        this.visitEnhancedForLoop(n);
        break;
      case N_WHILE:
        this.sync(n);
        this.token("while");
        this.g.space();
        this.token("(");
        this.scan(t.a[t.a[n]]);
        this.token(")");
        this.visitStatement(t.b[n], true, true, false);
        break;
      case N_DO_WHILE:
        this.visitDoWhileLoop(n);
        break;
      case N_TRY:
        this.visitTry(n);
        break;
      case N_SWITCH:
      case N_SWITCH_EXPRESSION:
        this.sync(n);
        this.visitSwitch(t.a[n], t.b[n]);
        break;
      case N_CASE:
        this.visitCase(n);
        break;
      case N_SYNCHRONIZED:
        this.sync(n);
        this.token("synchronized");
        this.g.space();
        this.token("(");
        this.g.open(this.plusFour);
        this.g.brk();
        this.scan(t.a[t.a[n]]);
        this.g.close();
        this.token(")");
        this.g.space();
        this.scan(t.b[n]);
        break;
      case N_RETURN:
        this.sync(n);
        this.token("return");
        if (t.a[n] >= 0) {
          this.g.space();
          this.scan(t.a[n]);
        }
        this.token(";");
        break;
      case N_THROW:
        this.sync(n);
        this.token("throw");
        this.g.space();
        this.scan(t.a[n]);
        this.token(";");
        break;
      case N_YIELD:
        this.sync(n);
        this.token("yield");
        this.g.space();
        this.scan(t.a[n]);
        this.token(";");
        break;
      case N_BREAK:
        this.sync(n);
        this.g.open(this.plusFour);
        this.token("break");
        if (t.name[n] >= 0) {
          this.g.brkSp();
          this.visitName(t.name[n]);
        }
        this.g.close();
        this.token(";");
        break;
      case N_CONTINUE:
        this.sync(n);
        this.g.open(this.plusFour);
        this.token("continue");
        if (t.name[n] >= 0) {
          this.g.brkSp();
          this.visitName(t.name[n]);
        }
        this.token(";");
        this.g.close();
        break;
      case N_LABELED:
        this.sync(n);
        this.g.open(this.ZERO);
        this.visitName(t.name[n]);
        this.token(":");
        this.g.forcedBreak();
        this.g.close();
        this.scan(t.a[n]);
        break;
      case N_EMPTY:
        this.sync(n);
        this.dropEmptyDeclarations();
        break;
      case N_ASSERT:
        this.sync(n);
        this.g.open(this.ZERO);
        this.token("assert");
        this.g.space();
        this.g.open(t.b[n] < 0 ? this.ZERO : this.plusFour);
        this.scan(t.a[n]);
        if (t.b[n] >= 0) {
          this.g.brkSp();
          this.token(":");
          this.g.space();
          this.scan(t.b[n]);
        }
        this.g.close();
        this.g.close();
        this.token(";");
        break;
      case N_IDENTIFIER:
        this.sync(n);
        this.visitName(t.name[n]);
        break;
      case N_MEMBER_SELECT:
      case N_ARRAY_ACCESS:
        this.sync(n);
        this.visitDot(n);
        break;
      case N_METHOD_INVOCATION:
        this.sync(n);
        if (!this.handleLogStatement(n)) {
          this.visitDot(n);
        }
        break;
      case N_NEW_CLASS:
        this.visitNewClass(n);
        break;
      case N_NEW_ARRAY:
        this.visitNewArray(n);
        break;
      case N_LITERAL:
        this.visitLiteral(n);
        break;
      case N_PARENTHESIZED:
        this.token("(");
        this.scan(t.a[n]);
        this.token(")");
        break;
      case N_ASSIGNMENT:
      case N_COMPOUND_ASSIGNMENT:
        this.sync(n);
        this.g.open(this.plusFour);
        this.scan(t.a[n]);
        this.g.space();
        this.splitToken(t.kind[n] === N_ASSIGNMENT ? "=" : `${opName(t.op[n])}=`);
        this.g.brkSp();
        this.scan(t.b[n]);
        this.g.close();
        break;
      case N_UNARY:
        this.visitUnary(n);
        break;
      case N_BINARY:
        this.visitBinary(n);
        break;
      case N_CONDITIONAL:
        this.sync(n);
        this.g.open(this.plusFour);
        this.scan(t.a[n]);
        this.g.brkSp();
        this.token("?");
        this.g.space();
        this.scan(t.b[n]);
        this.g.brkSp();
        this.token(":");
        this.g.space();
        this.scan(t.c[n]);
        this.g.close();
        break;
      case N_INSTANCE_OF:
        this.sync(n);
        this.g.open(this.plusFour);
        this.scan(t.a[n]);
        this.g.brkSp();
        this.g.open(this.ZERO);
        this.token("instanceof");
        this.g.brkSp();
        if (t.c[n] >= 0) {
          this.scan(t.c[n]);
        } else {
          this.scan(t.b[n]);
        }
        this.g.close();
        this.g.close();
        break;
      case N_TYPE_CAST:
        this.sync(n);
        this.g.open(this.plusFour);
        this.token("(");
        this.scan(t.a[n]);
        this.token(")");
        this.g.brkSp();
        this.scan(t.b[n]);
        this.g.close();
        break;
      case N_LAMBDA:
        this.visitLambdaExpression(n);
        break;
      case N_MEMBER_REFERENCE:
        this.g.open(this.plusFour);
        this.scan(t.a[n]);
        this.g.brk();
        this.g.op("::");
        this.addTypeArguments(t.b[n], this.plusFour);
        if ((t.flags[n] & FL_NEW_REF) !== 0) {
          this.token("new");
        } else {
          this.visitName(t.name[n]);
        }
        this.g.close();
        break;
      case N_PRIMITIVE_TYPE:
        this.sync(n);
        this.visitName(t.name[n]);
        break;
      case N_ARRAY_TYPE:
        this.sync(n);
        this.visitAnnotatedArrayType(n);
        break;
      case N_PARAMETERIZED_TYPE:
        this.visitParameterizedType(n);
        break;
      case N_WILDCARD:
        this.sync(n);
        this.g.open(this.ZERO);
        this.token("?");
        if (t.a[n] >= 0) {
          this.g.open(this.plusFour);
          this.g.space();
          this.token(t.op[n] === 1 ? "extends" : "super");
          this.g.brkSp();
          this.scan(t.a[n]);
          this.g.close();
        }
        this.g.close();
        break;
      case N_INTERSECTION_TYPE:
        this.sync(n);
        this.g.open(this.plusFour);
        for (let i = 0; i < this.len(t.a[n]); i++) {
          if (i > 0) {
            this.g.breakToFill(" ");
            this.token("&");
            this.g.space();
          }
          this.scan(this.at(t.a[n], i));
        }
        this.g.close();
        break;
      case N_ANNOTATED_TYPE:
        this.visitAnnotatedType(n);
        break;
      case N_TYPE_PARAMETER:
        this.visitTypeParameter(n);
        break;
      case N_ANNOTATION:
        this.visitAnnotation(n);
        break;
      case N_BINDING_PATTERN: {
        this.sync(n);
        const v = t.a[n];
        this.declareOne(DK_PARAMETER, HORIZONTAL, t.a[v], t.b[v], t.name[v], "", "", -1, "", -1, false, null);
        break;
      }
      case N_DECONSTRUCTION_PATTERN:
        this.scan(t.a[n]);
        this.g.open(this.plusFour);
        this.token("(");
        this.g.brk();
        for (let i = 0; i < this.len(t.b[n]); i++) {
          if (i > 0) {
            this.token(",");
            this.g.brkSp();
          }
          this.scan(this.at(t.b[n], i));
        }
        this.g.close();
        this.token(")");
        break;
      case N_ANY_PATTERN:
        this.token("_");
        break;
      case N_DEFAULT_CASE_LABEL:
        this.token("default");
        break;
      case N_CONSTANT_CASE_LABEL:
      case N_PATTERN_CASE_LABEL:
        this.scan(t.a[n]);
        break;
      case N_MODULE:
        this.visitModule(n);
        break;
      case N_EXPORTS:
        this.visitDirective("exports", "to", t.a[n], t.b[n]);
        break;
      case N_OPENS:
        this.visitDirective("opens", "to", t.a[n], t.b[n]);
        break;
      case N_PROVIDES:
        this.visitDirective("provides", "with", t.a[n], t.b[n]);
        break;
      case N_REQUIRES:
        this.token("requires");
        this.g.space();
        while (true) {
          if (this.g.peekIs("static")) {
            this.token("static");
            this.g.space();
          } else if (this.g.peekIs("transitive")) {
            this.token("transitive");
            this.g.space();
          } else {
            break;
          }
        }
        this.scan(t.a[n]);
        this.token(";");
        break;
      case N_USES:
        this.token("uses");
        this.g.space();
        this.scan(t.a[n]);
        this.token(";");
        break;
      default:
        this.g.fail(`unexpected node kind ${t.kind[n]}`);
    }
  }

  // ---- Compilation unit ------------------------------------------------------

  visitCompilationUnit(n: i32): void {
    const t = this.t;
    const g = this.g;
    let afterFirstToken = false;
    if (t.b[n] >= 0) {
      this.markForPartialFormat();
      this.visitPackage(t.b[n], t.a[n]);
      g.forcedBreak();
      afterFirstToken = true;
    }
    this.dropEmptyDeclarations();
    const imports = t.c[n];
    if (this.len(imports) > 0) {
      if (afterFirstToken) {
        g.blankLineWanted(BL_YES);
      }
      for (let i = 0; i < this.len(imports); i++) {
        this.markForPartialFormat();
        g.blankLineWanted(BL_PRESERVE);
        this.scan(this.at(imports, i));
        g.forcedBreak();
      }
      afterFirstToken = true;
    }
    this.dropEmptyDeclarations();
    const types = t.d[n];
    for (let i = 0; i < this.len(types); i++) {
      const ty = this.at(types, i);
      if (t.kind[ty] === N_IMPORT) {
        continue;
      }
      if (afterFirstToken) {
        g.blankLineWanted(BL_YES);
      }
      this.markForPartialFormat();
      this.scan(ty);
      g.forcedBreak();
      afterFirstToken = true;
      this.dropEmptyDeclarations();
    }
    if (t.e[n] >= 0) {
      if (afterFirstToken) {
        g.blankLineWanted(BL_YES);
      }
      this.markForPartialFormat();
      this.visitModule(t.e[n]);
      g.forcedBreak();
    }
    // A boundary at EOF, so that the whole file can be formatted.
    this.markForPartialFormat();
  }

  dropEmptyDeclarations(): void {
    while (this.g.peekIs(";")) {
      this.g.forcedBreak();
      this.markForPartialFormat();
      this.token(";");
    }
  }

  visitPackage(name: i32, annotations: i32): void {
    const g = this.g;
    if (this.len(annotations) > 0) {
      for (let i = 0; i < this.len(annotations); i++) {
        g.forcedBreak();
        this.scan(this.at(annotations, i));
      }
      g.forcedBreak();
    }
    g.open(this.plusFour);
    this.token("package");
    g.space();
    this.visitQualifiedName(name);
    g.close();
    this.token(";");
  }

  visitImport(n: i32): void {
    const t = this.t;
    this.checkForTypeAnnotation(n);
    this.sync(n);
    this.token("import");
    this.g.space();
    if ((t.flags[n] & FL_STATIC) !== 0) {
      this.token("static");
      this.g.space();
    }
    this.visitQualifiedName(t.a[n]);
    this.token(";");
    this.dropEmptyDeclarations();
  }

  private checkForTypeAnnotation(n: i32): void {
    const t = this.t;
    const q = t.a[n];
    const simple = this.inp.text(t.name[q]);
    const full = this.qualifiedText(q);
    if (
      (simple === "NonNull" && (full === "org.jspecify.annotations.NonNull" || full === "org.checkerframework.checker.nullness.qual.NonNull")) ||
      (simple === "Nullable" && (full === "org.jspecify.annotations.Nullable" || full === "org.checkerframework.checker.nullness.qual.Nullable"))
    ) {
      this.typeAnnotationSimpleNames.push(simple);
    }
  }

  private qualifiedText(n: i32): string {
    const t = this.t;
    if (t.kind[n] === N_MEMBER_SELECT) {
      return `${this.qualifiedText(t.a[n])}.${this.inp.text(t.name[n])}`;
    }
    return this.inp.text(t.name[n]);
  }

  /** visitName(Tree): a dotted name, token by token. */
  visitQualifiedName(n: i32): void {
    const t = this.t;
    const stack: i32[] = [];
    let x = n;
    while (t.kind[x] === N_MEMBER_SELECT) {
      stack.push(t.name[x]);
      x = t.a[x];
    }
    stack.push(t.name[x]);
    for (let i = toI32(stack.length) - 1; i >= 0; i--) {
      if (i < toI32(stack.length) - 1) {
        this.token(".");
      }
      this.visitName(stack[i]);
    }
  }

  // ---- Classes ---------------------------------------------------------------

  visitClass(n: i32): void {
    switch (this.t.op[n]) {
      case CK_ANNOTATION:
        this.visitAnnotationType(n);
        break;
      case CK_ENUM:
        this.visitEnumDeclaration(n);
        break;
      case CK_RECORD:
        this.visitRecordDeclaration(n);
        break;
      default:
        this.visitClassDeclaration(n);
    }
  }

  visitAnnotationType(n: i32): void {
    const t = this.t;
    const g = this.g;
    this.sync(n);
    g.open(this.ZERO);
    this.typeDeclarationModifiers(t.a[n]);
    g.open(this.ZERO);
    this.token("@");
    this.token("interface");
    g.brkSp();
    this.visitName(t.name[n]);
    g.close();
    g.close();
    this.addBodyDeclarations(this.listItems(t.f[n]), true, true);
    g.guessToken(";");
  }

  visitClassDeclaration(n: i32): void {
    const t = this.t;
    const g = this.g;
    this.sync(n);
    this.typeDeclarationModifiers(t.a[n]);
    const hasSuperclassType = t.c[n] >= 0;
    const hasSuperInterfaceTypes = this.len(t.d[n]) > 0;
    const hasPermitsTypes = this.len(t.e[n]) > 0;
    this.token(t.op[n] === CK_INTERFACE ? "interface" : "class");
    g.space();
    this.visitName(t.name[n]);
    if (this.len(t.b[n]) > 0) {
      this.token("<");
    }
    g.open(this.plusFour);
    if (this.len(t.b[n]) > 0) {
      this.typeParametersRest(t.b[n], hasSuperclassType || hasSuperInterfaceTypes || hasPermitsTypes ? this.plusFour : this.ZERO);
    }
    if (hasSuperclassType) {
      g.breakToFill(" ");
      this.token("extends");
      g.space();
      this.scan(t.c[n]);
    }
    this.classDeclarationTypeList(t.op[n] === CK_INTERFACE ? "extends" : "implements", t.d[n]);
    this.classDeclarationTypeList("permits", t.e[n]);
    g.close();
    this.addBodyDeclarations(this.listItems(t.f[n]), true, true);
    this.dropEmptyDeclarations();
  }

  private classDeclarationTypeList(tokenText: string, types: i32): void {
    const g = this.g;
    if (this.len(types) === 0) {
      return;
    }
    g.breakToFill(" ");
    g.open(this.len(types) > 1 ? this.plusFour : this.ZERO);
    this.token(tokenText);
    g.space();
    for (let i = 0; i < this.len(types); i++) {
      if (i > 0) {
        this.token(",");
        g.brkSp();
      }
      this.scan(this.at(types, i));
    }
    g.close();
  }

  visitRecordDeclaration(n: i32): void {
    const t = this.t;
    const g = this.g;
    this.sync(n);
    this.typeDeclarationModifiers(t.a[n]);
    const hasSuperInterfaceTypes = this.len(t.d[n]) > 0;
    this.token("record");
    g.space();
    this.visitName(t.name[n]);
    if (this.len(t.b[n]) > 0) {
      this.token("<");
    }
    g.open(this.plusFour);
    if (this.len(t.b[n]) > 0) {
      this.typeParametersRest(t.b[n], hasSuperInterfaceTypes ? this.plusFour : this.ZERO);
    }
    const params = this.listItems(t.g[n]);
    this.token("(");
    if (params.length > 0) {
      g.breakToFill("");
    }
    this.visitFormals(-1, params);
    this.token(")");
    if (hasSuperInterfaceTypes) {
      g.breakToFill(" ");
      g.open(this.len(t.d[n]) > 1 ? this.plusFour : this.ZERO);
      this.token("implements");
      g.space();
      for (let i = 0; i < this.len(t.d[n]); i++) {
        if (i > 0) {
          this.token(",");
          g.brkSp();
        }
        this.scan(this.at(t.d[n], i));
      }
      g.close();
    }
    g.close();
    this.addBodyDeclarations(this.listItems(t.f[n]), true, true);
    this.dropEmptyDeclarations();
  }

  visitEnumDeclaration(n: i32): void {
    const t = this.t;
    const g = this.g;
    this.sync(n);
    g.open(this.ZERO);
    this.typeDeclarationModifiers(t.a[n]);
    g.open(this.plusFour);
    this.token("enum");
    g.brkSp();
    this.visitName(t.name[n]);
    g.close();
    g.close();
    if (this.len(t.d[n]) > 0) {
      g.open(this.plusFour);
      g.brkSp();
      g.open(this.plusFour);
      this.token("implements");
      g.brkSp();
      g.open(this.ZERO);
      for (let i = 0; i < this.len(t.d[n]); i++) {
        if (i > 0) {
          this.token(",");
          g.breakToFill(" ");
        }
        this.scan(this.at(t.d[n], i));
      }
      g.close();
      g.close();
      g.close();
    }
    g.space();
    this.tokenBreakTrailingComment("{", this.plusTwo);
    const enumConstants: i32[] = [];
    const members: i32[] = [];
    for (let i = 0; i < this.len(t.f[n]); i++) {
      const m = this.at(t.f[n], i);
      if (t.kind[m] === N_VARIABLE && (t.flags[m] & FL_ENUM) !== 0) {
        enumConstants.push(m);
      } else {
        members.push(m);
      }
    }
    if (enumConstants.length === 0 && members.length === 0) {
      if (g.peekIs(";")) {
        g.open(this.plusTwo);
        g.forcedBreak();
        this.token(";");
        g.forcedBreak();
        this.dropEmptyDeclarations();
        g.close();
        g.open(this.ZERO);
        g.forcedBreak();
        g.blankLineWanted(BL_NO);
        this.tokenInd("}", this.plusTwo);
        g.close();
      } else {
        g.open(this.ZERO);
        g.blankLineWanted(BL_NO);
        this.token("}");
        g.close();
      }
    } else {
      g.open(this.plusTwo);
      g.blankLineWanted(BL_NO);
      g.forcedBreak();
      g.open(this.ZERO);
      for (let i = 0; i < toI32(enumConstants.length); i++) {
        if (i > 0) {
          this.token(",");
          g.forcedBreak();
          g.blankLineWanted(BL_PRESERVE);
        }
        this.markForPartialFormat();
        this.visitEnumConstantDeclaration(enumConstants[i]);
      }
      if (g.peekIs(",")) {
        this.token(",");
        g.forcedBreak();
      }
      g.close();
      g.close();
      if (g.peekIs(";")) {
        g.open(this.plusTwo);
        this.token(";");
        g.forcedBreak();
        this.dropEmptyDeclarations();
        g.close();
      }
      g.open(this.ZERO);
      this.addBodyDeclarations(members, false, false);
      g.forcedBreak();
      g.blankLineWanted(BL_NO);
      this.tokenInd("}", this.plusTwo);
      g.close();
    }
    g.guessToken(";");
  }

  private visitEnumConstantDeclaration(v: i32): void {
    const t = this.t;
    const g = this.g;
    const annos = t.a[t.a[v]];
    for (let i = 0; i < this.len(annos); i++) {
      this.scan(this.at(annos, i));
      g.forcedBreak();
    }
    this.visitName(t.name[v]);
    const init = t.c[v];
    if (this.len(t.d[init]) === 0) {
      g.guessToken("(");
      g.guessToken(")");
    } else {
      this.addArguments(t.d[init], this.plusFour);
    }
    if (t.e[init] >= 0) {
      this.addBodyDeclarations(this.listItems(t.f[t.e[init]]), true, true);
    }
  }

  private listItems(l: i32): i32[] {
    const out: i32[] = [];
    for (let i = 0; i < this.len(l); i++) {
      out.push(this.at(l, i));
    }
    return out;
  }

  addBodyDeclarations(decls: i32[], braces: boolean, first0: boolean): void {
    const t = this.t;
    const g = this.g;
    if (decls.length === 0) {
      if (braces) {
        g.space();
        this.tokenBreakTrailingComment("{", this.plusTwo);
        g.blankLineWanted(BL_NO);
        g.open(this.ZERO);
        if (g.peekIs(";")) {
          g.open(this.plusTwo);
          this.dropEmptyDeclarations();
          g.close();
          g.forcedBreak();
        }
        this.tokenInd("}", this.plusTwo);
        g.close();
      }
      return;
    }
    if (braces) {
      g.space();
      this.tokenBreakTrailingComment("{", this.plusTwo);
      g.open(this.ZERO);
    }
    g.open(this.plusTwo);
    let first = first0;
    let lastOneGotBlankLineBefore = false;
    let i = 0;
    const nd = toI32(decls.length);
    while (i < nd) {
      const decl = decls[i];
      i++;
      this.dropEmptyDeclarations();
      g.forcedBreak();
      const thisOneGetsBlankLineBefore = t.kind[decl] !== N_VARIABLE || this.hasJavaDoc(decl);
      if (first) {
        g.blankLineWanted(BL_PRESERVE);
      } else if (thisOneGetsBlankLineBefore || lastOneGotBlankLineBefore) {
        g.blankLineWanted(BL_YES);
      }
      this.markForPartialFormat();
      if (t.kind[decl] === N_VARIABLE) {
        const frags: i32[] = [decl];
        while (i < nd && t.kind[decls[i]] === N_VARIABLE && t.start[decls[i]] === t.start[decl]) {
          frags.push(decls[i]);
          i++;
        }
        this.visitVariables(frags, DK_FIELD, this.fieldAnnotationDirection(t.a[decl]));
      } else {
        this.scan(decl);
      }
      first = false;
      lastOneGotBlankLineBefore = thisOneGetsBlankLineBefore;
    }
    this.dropEmptyDeclarations();
    g.forcedBreak();
    g.close();
    g.forcedBreak();
    this.markForPartialFormat();
    if (braces) {
      g.blankLineWanted(BL_NO);
      this.tokenInd("}", this.plusTwo);
      g.close();
    }
  }

  private hasJavaDoc(decl: i32): boolean {
    const inp = this.inp;
    const k = inp.tokenAt(this.t.start[decl]);
    if (k >= 0) {
      for (let j = 0; j < inp.kBeforeN[k]; j++) {
        const tk = inp.refs[inp.kBefore[k] + j];
        const a = inp.tPos[tk];
        if (inp.tEnd[tk] - a >= 3 && toI32(inp.src[a]) === 47 && toI32(inp.src[a + 1]) === 42 && toI32(inp.src[a + 2]) === 42) {
          return true;
        }
      }
    }
    return false;
  }

  // ---- Modifiers -------------------------------------------------------------

  typeDeclarationModifiers(mods: i32): void {
    const typeAnnos = this.visitModifiersOf(mods, VERTICAL, -1);
    this.verticalAnnotations(typeAnnos);
  }

  verticalAnnotations(annos: i32[]): void {
    for (const a of annos) {
      this.g.forcedBreak();
      this.scan(a);
      this.g.forcedBreak();
    }
  }

  visitAndBreakModifiers(mods: i32, dir: i32, declBreak: i32): void {
    const typeAnnos = this.visitModifiersOf(mods, dir, declBreak);
    this.visitAnnotations(typeAnnos, false, true);
  }

  visitModifiersOf(mods: i32, dir: i32, declBreak: i32): i32[] {
    return this.visitSplitModifiers(this.splitModifiers(mods, this.listItems(this.t.a[mods])), dir, declBreak);
  }

  private breakList(declBreak: i32): void {
    this.g.breakOp(UNIFIED, " ", this.ZERO, declBreak);
  }

  private forceBreakList(declBreak: i32): void {
    this.g.breakOp(FORCED, "", this.ZERO, declBreak);
  }

  private breakFillList(): void {
    this.g.open(this.ZERO);
    this.g.breakOp(INDEPENDENT, " ", this.ZERO, -1);
    this.g.close();
  }

  visitSplitModifiers(split: SplitMods, dir: i32, declBreak: i32): i32[] {
    const g = this.g;
    if (split.decl.length === 0) {
      return split.typeAnnos;
    }
    let q = 0;
    const nd = toI32(split.decl.length);
    g.open(this.ZERO);
    let afterFirstToken = false;
    let lastWasAnnotation = false;
    while (q < nd && !split.decl[q].isModifier) {
      if (afterFirstToken) {
        if (dir === VERTICAL) {
          this.forceBreakList(declBreak);
        } else {
          this.breakList(declBreak);
        }
      }
      q = this.formatAnnotationOrModifier(split.decl, q);
      afterFirstToken = true;
      lastWasAnnotation = true;
    }
    g.close();
    if (q >= nd) {
      if (dir === VERTICAL) {
        this.forceBreakList(declBreak);
      } else {
        this.breakList(declBreak);
      }
      return split.typeAnnos;
    }
    if (lastWasAnnotation) {
      if (dir === VERTICAL) {
        this.forceBreakList(declBreak);
      } else {
        this.breakList(declBreak);
      }
    }
    g.open(this.ZERO);
    afterFirstToken = false;
    while (q < nd) {
      if (afterFirstToken) {
        this.breakFillList();
      }
      q = this.formatAnnotationOrModifier(split.decl, q);
      afterFirstToken = true;
    }
    g.close();
    this.breakFillList();
    return split.typeAnnos;
  }

  private formatAnnotationOrModifier(items: ModItem[], q: i32): i32 {
    const m = items[q];
    if (m.isModifier) {
      this.visitName(m.tok);
      if (this.inp.is(m.tok, "non") && q + 2 < toI32(items.length)) {
        this.visitName(items[q + 1].tok);
        this.visitName(items[q + 2].tok);
        return q + 3;
      }
      return q + 1;
    }
    this.scan(m.ann);
    return q + 1;
  }

  splitModifiers(mods: i32, annotations: i32[]): SplitMods {
    const g = this.g;
    const inp = this.inp;
    const t = this.t;
    const out = new SplitMods();
    const pt = g.peekTok(0);
    if (annotations.length === 0 && (pt < 0 || !isModifier(inp, pt))) {
      return out;
    }
    // Toks from the modifiers' start while they are in an annotation or a modifier.
    const all: ModItem[] = [];
    for (let k = g.tokenI; k < inp.nTokens; k++) {
      const tk = inp.kTok[k];
      const p = inp.tPos[tk];
      let inAnno = false;
      for (const a of annotations) {
        if (p >= t.start[a] && p < t.end[a]) {
          inAnno = true;
          break;
        }
      }
      if (!inAnno && !isModifier(inp, tk)) {
        break;
      }
      if (!inAnno) {
        const m = new ModItem();
        m.isModifier = true;
        m.tok = tk;
        m.pos = p;
        all.push(m);
      }
    }
    for (const a of annotations) {
      const m = new ModItem();
      m.ann = a;
      m.pos = t.start[a];
      all.push(m);
    }
    // Sort by position (stable).
    for (let i = 1; i < toI32(all.length); i++) {
      const x = all[i];
      let j = i - 1;
      while (j >= 0 && all[j].pos > x.pos) {
        all[j + 1] = all[j];
        j--;
      }
      all[j + 1] = x;
    }
    let idx = toI32(all.length) - 1;
    const typeAnnosRev: i32[] = [];
    while (idx >= 0) {
      const m = all[idx];
      if (m.isModifier || !this.isTypeAnnotation(m.ann)) {
        break;
      }
      typeAnnosRev.push(m.ann);
      idx--;
    }
    for (let i = 0; i <= idx; i++) {
      out.decl.push(all[i]);
    }
    for (let i = toI32(typeAnnosRev.length) - 1; i >= 0; i--) {
      out.typeAnnos.push(typeAnnosRev[i]);
    }
    return out;
  }

  private isTypeAnnotation(a: i32): boolean {
    const t = this.t;
    const ty = t.a[a];
    if (t.kind[ty] !== N_IDENTIFIER) {
      return false;
    }
    const name = this.inp.text(t.name[ty]);
    for (const s of this.typeAnnotationSimpleNames) {
      if (s === name) {
        return true;
      }
    }
    return false;
  }

  private fieldAnnotationDirection(mods: i32): i32 {
    const t = this.t;
    const annos = t.a[mods];
    for (let i = 0; i < this.len(annos); i++) {
      if (this.len(t.b[this.at(annos, i)]) > 0) {
        return VERTICAL;
      }
    }
    return HORIZONTAL;
  }

  private canLocalHaveHorizontalAnnotations(mods: i32): i32 {
    const t = this.t;
    const annos = t.a[mods];
    let parameterless = 0;
    for (let i = 0; i < this.len(annos); i++) {
      if (this.len(t.b[this.at(annos, i)]) === 0) {
        parameterless++;
      }
    }
    return parameterless <= 1 && parameterless === this.len(annos) ? HORIZONTAL : VERTICAL;
  }

  visitAnnotations(annos: i32[], breakBefore: boolean, breakAfter: boolean): void {
    const g = this.g;
    if (annos.length > 0) {
      if (breakBefore) {
        g.breakToFill(" ");
      }
      for (let i = 0; i < toI32(annos.length); i++) {
        if (i > 0) {
          g.breakToFill(" ");
        }
        this.scan(annos[i]);
      }
      if (breakAfter) {
        g.breakToFill(" ");
      }
    }
  }

  visitAnnotation(n: i32): void {
    const t = this.t;
    const g = this.g;
    this.sync(n);
    if (this.visitSingleMemberAnnotation(n)) {
      return;
    }
    g.open(this.ZERO);
    this.token("@");
    this.scan(t.a[n]);
    const args = t.b[n];
    if (this.len(args) > 0) {
      g.open(this.plusFour);
      this.token("(");
      g.brk();
      let hasArrayInitializer = false;
      for (let i = 0; i < this.len(args); i++) {
        if (this.isArrayValue(this.at(args, i))) {
          hasArrayInitializer = true;
        }
      }
      for (let i = 0; i < this.len(args); i++) {
        const arg = this.at(args, i);
        if (i > 0) {
          this.token(",");
          if (hasArrayInitializer) {
            g.forcedBreak();
          } else {
            g.brkSp();
          }
        }
        if (t.kind[arg] === N_ASSIGNMENT) {
          this.visitAnnotationArgument(arg);
        } else {
          this.scan(arg);
        }
      }
      this.token(")");
      g.close();
      g.close();
      return;
    } else if (g.peekIs("(")) {
      this.token("(");
      this.token(")");
    }
    g.close();
  }

  private isArrayValue(arg: i32): boolean {
    const t = this.t;
    if (t.kind[arg] !== N_ASSIGNMENT) {
      return false;
    }
    const e = t.b[arg];
    return t.kind[e] === N_NEW_ARRAY && t.a[e] < 0;
  }

  private visitAnnotationArgument(n: i32): void {
    const t = this.t;
    const g = this.g;
    const isArrayInitializer = t.kind[t.b[n]] === N_NEW_ARRAY;
    this.sync(n);
    g.open(isArrayInitializer ? this.ZERO : this.plusFour);
    this.scan(t.a[n]);
    g.space();
    this.token("=");
    if (isArrayInitializer) {
      g.space();
    } else {
      g.brkSp();
    }
    this.scan(t.b[n]);
    g.close();
  }

  private visitSingleMemberAnnotation(n: i32): boolean {
    const t = this.t;
    const g = this.g;
    const args = t.b[n];
    if (this.len(args) !== 1) {
      return false;
    }
    const value = this.at(args, 0);
    if (t.kind[value] === N_ASSIGNMENT) {
      return false;
    }
    const isArrayInitializer = t.kind[value] === N_NEW_ARRAY;
    g.open(isArrayInitializer ? this.ZERO : this.plusFour);
    this.token("@");
    this.scan(t.a[n]);
    this.token("(");
    if (!isArrayInitializer) {
      g.brk();
    }
    this.scan(value);
    g.close();
    this.token(")");
    return true;
  }

  // ---- Methods ---------------------------------------------------------------

  visitMethod(n: i32): void {
    const t = this.t;
    const g = this.g;
    this.sync(n);
    let annotations = this.listItems(t.a[t.a[n]]);
    let returnTypeAnnotations: i32[] = [];
    const isRecordConstructor = (t.flags[n] & FL_COMPACT_CTOR) !== 0;
    const typarams = t.b[n];
    if (this.len(typarams) > 0 && annotations.length > 0) {
      const typeParameterStart = t.start[this.at(typarams, 0)];
      for (let i = 0; i < toI32(annotations.length); i++) {
        if (t.start[annotations[i]] > typeParameterStart) {
          returnTypeAnnotations = annotations.slice(i, annotations.length);
          annotations = annotations.slice(0, i);
          break;
        }
      }
    }
    let typeAnnotations = this.visitSplitModifiers(this.splitModifiers(t.a[n], annotations), VERTICAL, -1);
    if (this.len(typarams) === 0 && t.c[n] >= 0) {
      returnTypeAnnotations = typeAnnotations;
      typeAnnotations = [];
    }
    let baseReturnType = -1;
    let dims: Dims | null = null;
    if (t.c[n] >= 0) {
      const d0 = new Dims();
      baseReturnType = this.extractDims(t.c[n], d0, true);
      dims = d0;
    } else {
      this.verticalAnnotations(typeAnnotations);
      typeAnnotations = [];
    }
    g.open(this.plusFour);
    const breakBeforeName = g.genSym();
    const breakBeforeType = g.genSym();
    g.open(this.ZERO);
    {
      let afterFirstToken = false;
      if (typeAnnotations.length > 0) {
        this.visitAnnotations(typeAnnotations, false, false);
        afterFirstToken = true;
      }
      if (this.len(typarams) > 0) {
        if (afterFirstToken) {
          g.breakToFill(" ");
        }
        this.token("<");
        this.typeParametersRest(typarams, this.plusFour);
        afterFirstToken = true;
      }
      let openedNameAndTypeScope = false;
      if (baseReturnType >= 0) {
        if (afterFirstToken) {
          g.breakOp(INDEPENDENT, " ", this.ZERO, breakBeforeType);
        } else {
          afterFirstToken = true;
        }
        if (!openedNameAndTypeScope) {
          g.open(g.ifIndent(breakBeforeType, this.plusFour, this.ZERO));
          openedNameAndTypeScope = true;
        }
        g.open(this.ZERO);
        if (returnTypeAnnotations.length > 0) {
          this.visitAnnotations(returnTypeAnnotations, false, false);
          g.brkSp();
        }
        this.scan(baseReturnType);
        if (dims !== null) {
          this.maybeAddDims(null, dims);
        }
        g.close();
      }
      if (afterFirstToken) {
        g.breakOp(INDEPENDENT, " ", this.ZERO, breakBeforeName);
      } else {
        afterFirstToken = true;
      }
      if (!openedNameAndTypeScope) {
        g.open(this.ZERO);
        openedNameAndTypeScope = true;
      }
      this.visitName(t.name[n]);
      if (!isRecordConstructor) {
        this.token("(");
      }
      g.close();
    }
    g.close();
    g.open(g.ifIndent(breakBeforeName, this.plusFour, this.ZERO));
    g.open(g.ifIndent(breakBeforeType, this.plusFour, this.ZERO));
    g.open(this.ZERO);
    {
      if (!isRecordConstructor) {
        if (this.len(t.d[n]) > 0 || t.e[n] >= 0) {
          g.breakToFill("");
          this.visitFormals(t.e[n], this.listItems(t.d[n]));
        }
        this.token(")");
      }
      if (dims !== null) {
        this.maybeAddDims(null, dims);
      }
      if (this.len(t.f[n]) > 0) {
        g.breakToFill(" ");
        g.open(this.plusFour);
        this.visitThrowsClause(t.f[n]);
        g.close();
      }
      if (t.h[n] >= 0) {
        g.space();
        this.token("default");
        if (t.kind[t.h[n]] === N_NEW_ARRAY) {
          g.open(this.minusFour);
          g.space();
          this.scan(t.h[n]);
          g.close();
        } else {
          g.open(this.ZERO);
          g.breakToFill(" ");
          this.scan(t.h[n]);
          g.close();
        }
      }
    }
    g.close();
    g.close();
    g.close();
    if (t.g[n] < 0) {
      this.token(";");
    } else {
      g.space();
      g.token("{", true, this.plusTwo, this.plusTwo);
    }
    g.close();
    if (t.g[n] >= 0) {
      this.methodBody(n);
    }
  }

  private methodBody(n: i32): void {
    const t = this.t;
    const g = this.g;
    const stats = t.a[t.g[n]];
    if (this.len(stats) === 0) {
      g.blankLineWanted(BL_NO);
    } else {
      g.open(this.plusTwo);
      g.forcedBreak();
      g.blankLineWanted(BL_PRESERVE);
      this.visitStatements(stats);
      g.close();
      g.forcedBreak();
      g.blankLineWanted(BL_NO);
      this.markForPartialFormat();
    }
    this.tokenInd("}", this.plusTwo);
  }

  private visitThrowsClause(types: i32): void {
    const g = this.g;
    this.token("throws");
    g.breakToFill(" ");
    for (let i = 0; i < this.len(types); i++) {
      if (i > 0) {
        this.token(",");
        g.brkSp();
      }
      this.scan(this.at(types, i));
    }
  }

  visitFormals(receiver: i32, params: i32[]): void {
    const t = this.t;
    const g = this.g;
    if (receiver < 0 && params.length === 0) {
      return;
    }
    g.open(this.ZERO);
    let afterFirstToken = false;
    if (receiver >= 0) {
      this.declareOne(DK_PARAMETER, HORIZONTAL, t.a[receiver], t.b[receiver], t.name[receiver], "", "", -1, params.length > 0 ? "," : "", t.d[receiver], false, null);
      afterFirstToken = true;
    }
    for (let i = 0; i < toI32(params.length); i++) {
      if (afterFirstToken) {
        g.brkSp();
      }
      this.visitToDeclare(DK_PARAMETER, HORIZONTAL, params[i], -1, "=", i < toI32(params.length) - 1 ? "," : "");
      afterFirstToken = true;
    }
    g.close();
  }

  typeParametersRest(typarams: i32, plusIndent: i32): void {
    const g = this.g;
    g.open(plusIndent);
    g.brk();
    g.open(this.ZERO);
    for (let i = 0; i < this.len(typarams); i++) {
      if (i > 0) {
        this.token(",");
        g.brkSp();
      }
      this.scan(this.at(typarams, i));
    }
    this.token(">");
    g.close();
    g.close();
  }

  visitTypeParameter(n: i32): void {
    const t = this.t;
    const g = this.g;
    this.sync(n);
    g.open(this.ZERO);
    this.visitAnnotations(this.listItems(t.a[n]), false, true);
    this.visitName(t.name[n]);
    const bounds = t.b[n];
    if (this.len(bounds) > 0) {
      g.space();
      this.token("extends");
      g.open(this.plusFour);
      g.brkSp();
      g.open(this.plusFour);
      for (let i = 0; i < this.len(bounds); i++) {
        if (i > 0) {
          g.breakToFill(" ");
          this.token("&");
          g.space();
        }
        this.scan(this.at(bounds, i));
      }
      g.close();
      g.close();
    }
    g.close();
  }

  // ---- Variables -------------------------------------------------------------

  visitVariable(n: i32): void {
    this.sync(n);
    this.visitVariables([n], DK_NONE, this.fieldAnnotationDirection(this.t.a[n]));
  }

  visitVariables(frags: i32[], kind: i32, dir: i32): void {
    const t = this.t;
    if (frags.length === 1) {
      const f = frags[0];
      let dims: Dims | null = null;
      let base = -1;
      if (t.b[f] >= 0) {
        const d0 = new Dims();
        base = this.extractDims(t.b[f], d0, true);
        dims = d0;
      }
      this.declareOne(kind, dir, t.a[f], t.b[f], t.name[f], "", "=", t.c[f], ";", -1, dims !== null, dims, base);
    } else {
      this.declareMany(frags, dir);
    }
  }

  private visitToDeclare(kind: i32, dir: i32, n: i32, initializer: i32, equals: string, trailing: string): void {
    const t = this.t;
    this.sync(n);
    let dims: Dims | null = null;
    let base = -1;
    if (t.b[n] >= 0) {
      const d0 = new Dims();
      base = this.extractDims(t.b[n], d0, true);
      dims = d0;
    }
    this.declareOne(kind, dir, t.a[n], base, t.name[n], "", equals, initializer, trailing, -1, dims !== null, dims, base);
  }

  /**
   * declareOne. `mods` is -1 for none; `hasDims` says typeWithDims is
   * present, with `dims` its annotation lists and `dimBase` its node.
   */
  declareOne(
    kind: i32,
    dir: i32,
    mods: i32,
    type: i32,
    name: i32,
    op: string,
    equals: string,
    initializer: i32,
    trailing: string,
    receiverExpression: i32,
    hasDims: boolean,
    dims0: Dims | null,
    dimBase: i32 = -1,
  ): i32 {
    const t = this.t;
    const g = this.g;
    const typeBreak = g.genSym();
    const verticalAnnotationBreak = g.genSym();
    const isField = kind === DK_FIELD;
    if (isField) {
      g.blankLineWantedIf(verticalAnnotationBreak);
    }
    const dims = dims0 !== null ? dims0 : new Dims();
    let baseDims = 0;
    const split = mods >= 0 ? this.splitModifiers(mods, this.listItems(t.a[mods])) : new SplitMods();
    g.open(kind === DK_PARAMETER && split.hasDeclarationAnnotation() ? this.plusFour : this.ZERO);
    {
      const annotations = this.visitSplitModifiers(split, dir, verticalAnnotationBreak);
      const p0 = g.peekTok(0);
      const isVar = p0 >= 0 && this.inp.is(p0, "var") && (!this.inp.is(name, "var") || g.peekIsAt(1, "var"));
      const hasType = type >= 0 || isVar;
      g.open(hasType ? this.plusFour : this.ZERO);
      {
        g.open(this.ZERO);
        {
          g.open(this.ZERO);
          {
            this.visitAnnotations(annotations, false, true);
            if (hasDims && dimBase >= 0) {
              this.scan(dimBase);
              const totalDims = dims.size();
              g.open(this.plusFour);
              this.maybeAddDims(null, dims);
              g.close();
              baseDims = totalDims - dims.size();
            } else if (isVar) {
              this.token("var");
            } else {
              this.scan(type);
            }
          }
          g.close();
          if (hasType) {
            g.breakOp(INDEPENDENT, " ", this.ZERO, typeBreak);
          }
          g.open(g.ifIndent(typeBreak, this.plusFour, this.ZERO));
          if (receiverExpression >= 0) {
            this.scan(receiverExpression);
          } else {
            this.variableName(name);
          }
          g.op(op);
        }
        this.maybeAddDims(null, dims);
        g.close();
      }
      g.close();
      if (initializer >= 0) {
        g.space();
        this.token(equals);
        if (t.kind[initializer] === N_NEW_ARRAY && t.a[initializer] < 0) {
          g.open(this.minusFour);
          g.space();
          this.visit(initializer); // accept(): no path entry
          g.close();
        } else {
          g.open(g.ifIndent(typeBreak, this.plusFour, this.ZERO));
          g.breakToFill(" ");
          this.scan(initializer);
          g.close();
        }
      }
      if (trailing.length > 0 && g.peekIs(trailing)) {
        g.guessToken(trailing);
      }
      g.close();
    }
    g.close();
    if (isField) {
      g.blankLineWantedIf(verticalAnnotationBreak);
    }
    return baseDims;
  }

  private variableName(name: i32): void {
    if (name < 0) {
      this.token("_");
    } else {
      this.visitName(name);
    }
  }

  private declareMany(frags: i32[], dir: i32): void {
    const t = this.t;
    const g = this.g;
    g.open(this.ZERO);
    const mods = t.a[frags[0]];
    const type = t.b[frags[0]];
    this.visitAndBreakModifiers(mods, dir, -1);
    g.open(this.plusFour);
    g.open(this.ZERO);
    let dims = new Dims();
    const base = this.extractDims(type, dims, true);
    this.scan(base);
    let baseDims = dims.size();
    this.maybeAddDims(null, dims);
    baseDims = baseDims - dims.size();
    for (let i = 0; i < toI32(frags.length); i++) {
      const f = frags[i];
      if (i > 0) {
        this.token(",");
      }
      dims = this.variableFragmentDims(i > 0, baseDims, t.b[f]);
      g.brkSp();
      g.open(this.ZERO);
      this.maybeAddDims(null, dims);
      this.variableName(t.name[f]);
      this.maybeAddDims(null, dims);
      if (t.c[f] >= 0) {
        g.space();
        this.token("=");
        g.open(this.plusFour);
        g.brkSp();
        this.scan(t.c[f]);
        g.close();
      }
      g.close();
      if (i === 0) {
        g.close();
      }
    }
    g.close();
    this.token(";");
    g.close();
  }

  private variableFragmentDims(afterFirstToken: boolean, leadingDims: i32, type: i32): Dims {
    const d = new Dims();
    if (type < 0) {
      return d;
    }
    if (!afterFirstToken) {
      this.extractDims(type, d, true);
      return d;
    }
    this.extractDims(type, d, false);
    if (leadingDims > 0) {
      const out = new Dims();
      for (let i = 0; i < d.size() - leadingDims; i++) {
        out.items.push(d.items[i]);
      }
      return out;
    }
    return d;
  }

  /** DimensionHelpers.extractDims: the base type, with each annotated dim's annotations added to `dims`. */
  extractDims(node: i32, dims: Dims, sorted: boolean): i32 {
    const rev: i32[] = [];
    const base = this.extractDimsInto(rev, node);
    const lists: i32[] = [];
    for (let i = toI32(rev.length) - 1; i >= 0; i--) {
      lists.push(rev[i]);
    }
    // `lists` holds the dims in order (addFirst semantics applied below).
    if (sorted) {
      let lastAnnotation = -1;
      let lastPos = -1;
      for (let i = 0; i < toI32(lists.length); i++) {
        const l = lists[i];
        if (this.len(l) > 0) {
          const pos = this.t.start[this.at(l, 0)];
          if (pos < lastPos) {
            // Collections.rotate(list, -(lastAnnotation + 1)).
            const k = lastAnnotation + 1;
            for (let j = 0; j < toI32(lists.length); j++) {
              dims.items.push(lists[(j + k) % toI32(lists.length)]);
            }
            return base;
          }
          lastPos = pos;
          lastAnnotation = i;
        }
      }
    }
    for (const l of lists) {
      dims.items.push(l);
    }
    return base;
  }

  private extractDimsInto(lists: i32[], node: i32): i32 {
    const t = this.t;
    if (t.kind[node] === N_ARRAY_TYPE) {
      return this.extractDimsInto(lists, t.a[node]);
    }
    if (t.kind[node] === N_ANNOTATED_TYPE) {
      if (t.kind[t.b[node]] !== N_ARRAY_TYPE) {
        return node;
      }
      // addFirst after the inner dims: collected in reverse, flipped by the caller.
      const r = this.extractDimsInto(lists, t.b[node]);
      lists.push(t.a[node]);
      return r;
    }
    return node;
  }

  /** maybeAddDims(dimExpressions, annotations). */
  maybeAddDims(dimExpressions: Dims | null, annotations: Dims): void {
    const g = this.g;
    let lastWasAnnotation = false;
    while (g.peekTok(0) >= 0) {
      if (g.peekIs("@")) {
        if (annotations.isEmpty()) {
          return;
        }
        const dimAnnotations = annotations.removeFirst();
        if (this.len(dimAnnotations) === 0) {
          continue;
        }
        g.breakToFill(" ");
        this.visitAnnotations(this.listItems(dimAnnotations), false, false);
        lastWasAnnotation = true;
      } else if (g.peekIs("[")) {
        if (lastWasAnnotation) {
          g.breakToFill(" ");
        } else {
          g.breakToFill("");
        }
        this.token("[");
        if (!g.peekIs("]")) {
          if (dimExpressions !== null && !dimExpressions.isEmpty()) {
            this.scan(dimExpressions.removeFirst());
          }
        }
        this.token("]");
        lastWasAnnotation = false;
      } else if (g.peekIs(".")) {
        if (!g.peekIsAt(1, ".")) {
          return;
        }
        if (lastWasAnnotation) {
          g.breakToFill(" ");
        } else {
          g.breakToFill("");
        }
        g.op("...");
        lastWasAnnotation = false;
      } else {
        return;
      }
    }
  }

  visitAnnotatedArrayType(n: i32): void {
    const g = this.g;
    const dims = new Dims();
    const base = this.extractDims(n, dims, true);
    g.open(this.plusFour);
    this.scan(base);
    this.maybeAddDims(null, dims);
    g.close();
  }

  visitAnnotatedType(n: i32): void {
    const t = this.t;
    const g = this.g;
    this.sync(n);
    const base = t.b[n];
    if (t.kind[base] === N_MEMBER_SELECT) {
      this.scan(t.a[base]);
      this.token(".");
      this.visitAnnotations(this.listItems(t.a[n]), false, false);
      g.breakToFill(" ");
      this.visitName(t.name[base]);
    } else if (t.kind[base] === N_ARRAY_TYPE) {
      this.visitAnnotatedArrayType(n);
    } else {
      this.visitAnnotations(this.listItems(t.a[n]), false, false);
      g.breakToFill(" ");
      this.scan(base);
    }
  }

  visitParameterizedType(n: i32): void {
    const t = this.t;
    const g = this.g;
    this.sync(n);
    const args = t.b[n];
    if (this.len(args) === 0) {
      this.scan(t.a[n]);
      this.token("<");
      this.token(">");
    } else {
      g.open(this.plusFour);
      this.scan(t.a[n]);
      this.token("<");
      g.brk();
      g.open(this.ZERO);
      for (let i = 0; i < this.len(args); i++) {
        if (i > 0) {
          this.token(",");
          g.brkSp();
        }
        this.scan(this.at(args, i));
      }
      g.close();
      g.close();
      this.token(">");
    }
  }

  // ---- Statements ------------------------------------------------------------

  visitBlock(n: i32, collapseEmpty: boolean, allowLeadingBlank: boolean, allowTrailingBlank: boolean): void {
    const t = this.t;
    const g = this.g;
    this.sync(n);
    if ((t.flags[n] & FL_STATIC) !== 0) {
      this.token("static");
      g.space();
    }
    const stats = t.a[n];
    if (collapseEmpty && this.len(stats) === 0) {
      if (g.peekIs(";")) {
        this.token(";");
      } else {
        this.tokenBreakTrailingComment("{", this.plusTwo);
        g.blankLineWanted(BL_NO);
        this.tokenInd("}", this.plusTwo);
      }
    } else {
      g.open(this.ZERO);
      g.open(this.plusTwo);
      this.tokenBreakTrailingComment("{", this.plusTwo);
      g.blankLineWanted(allowLeadingBlank ? BL_PRESERVE : BL_NO);
      this.visitStatements(stats);
      g.close();
      g.forcedBreak();
      g.close();
      g.blankLineWanted(allowTrailingBlank ? BL_PRESERVE : BL_NO);
      this.markForPartialFormat();
      this.tokenInd("}", this.plusTwo);
    }
  }

  private visitStatement(n: i32, collapseEmpty: boolean, allowLeadingBlank: boolean, allowTrailingBlank: boolean): void {
    const g = this.g;
    this.sync(n);
    if (this.t.kind[n] === N_BLOCK) {
      g.space();
      this.visitBlock(n, collapseEmpty, allowLeadingBlank, allowTrailingBlank);
    } else {
      g.open(this.plusTwo);
      g.brkSp();
      this.scan(n);
      g.close();
    }
  }

  visitStatements(stats: i32): void {
    const t = this.t;
    const g = this.g;
    let afterFirstToken = false;
    this.dropEmptyDeclarations();
    let i = 0;
    const ns = this.len(stats);
    while (i < ns) {
      const s = this.at(stats, i);
      i++;
      g.forcedBreak();
      if (afterFirstToken) {
        g.blankLineWanted(BL_PRESERVE);
      }
      this.markForPartialFormat();
      afterFirstToken = true;
      if (t.kind[s] === N_VARIABLE) {
        const frags: i32[] = [s];
        while (i < ns && t.kind[this.at(stats, i)] === N_VARIABLE && t.start[this.at(stats, i)] === t.start[s]) {
          frags.push(this.at(stats, i));
          i++;
        }
        this.visitVariables(frags, DK_NONE, this.canLocalHaveHorizontalAnnotations(t.a[s]));
      } else {
        this.scan(s);
      }
    }
  }

  visitIf(n0: i32): void {
    const t = this.t;
    const g = this.g;
    this.sync(n0);
    const exprs: i32[] = [];
    const stats: i32[] = [];
    let n = n0;
    while (true) {
      exprs.push(t.a[n]);
      stats.push(t.b[n]);
      if (t.c[n] >= 0 && t.kind[t.c[n]] === N_IF) {
        n = t.c[n];
      } else {
        break;
      }
    }
    g.open(this.ZERO);
    let afterFirstToken = false;
    let followingBlock = false;
    const en = toI32(exprs.length);
    for (let i = 0; i < en; i++) {
      if (afterFirstToken) {
        if (followingBlock) {
          g.space();
        } else {
          g.forcedBreak();
        }
        this.token("else");
        g.space();
      }
      this.token("if");
      g.space();
      this.token("(");
      this.scan(t.a[exprs[i]]);
      this.token(")");
      const onlyClause = en === 1 && t.c[n] < 0;
      const trailingClauses = i < en - 1 || t.c[n] >= 0;
      this.visitStatement(stats[i], onlyClause, true, trailingClauses);
      followingBlock = t.kind[stats[i]] === N_BLOCK;
      afterFirstToken = true;
    }
    if (t.c[n] >= 0) {
      if (followingBlock) {
        g.space();
      } else {
        g.forcedBreak();
      }
      this.token("else");
      this.visitStatement(t.c[n], false, true, false);
    }
    g.close();
  }

  private visitForLoop(n: i32): void {
    const t = this.t;
    const g = this.g;
    this.sync(n);
    this.token("for");
    g.space();
    this.token("(");
    g.open(this.plusFour);
    const init = t.a[n];
    g.open(this.len(init) > 1 && t.kind[this.at(init, 0)] === N_EXPRESSION_STATEMENT ? this.plusFour : this.ZERO);
    if (this.len(init) > 0) {
      if (t.kind[this.at(init, 0)] === N_VARIABLE) {
        const first = this.at(init, 0);
        const frags: i32[] = [first];
        for (let i = 1; i < this.len(init); i++) {
          const v = this.at(init, i);
          if (t.kind[v] === N_VARIABLE && t.start[v] === t.start[first]) {
            frags.push(v);
          }
        }
        this.visitVariables(frags, DK_NONE, HORIZONTAL);
      } else {
        g.open(this.ZERO);
        for (let i = 0; i < this.len(init); i++) {
          if (i > 0) {
            this.token(",");
            g.brkSp();
          }
          this.scan(t.a[this.at(init, i)]);
        }
        this.token(";");
        g.close();
      }
    } else {
      this.token(";");
    }
    g.close();
    g.brkSp();
    if (t.b[n] >= 0) {
      this.scan(t.b[n]);
    }
    this.token(";");
    const update = t.c[n];
    if (this.len(update) > 0) {
      g.brkSp();
      g.open(this.len(update) <= 1 ? this.ZERO : this.plusFour);
      for (let i = 0; i < this.len(update); i++) {
        if (i > 0) {
          this.token(",");
          g.breakToFill(" ");
        }
        this.scan(t.a[this.at(update, i)]);
      }
      g.guessToken(";");
      g.close();
    } else {
      g.space();
    }
    g.close();
    this.token(")");
    this.visitStatement(t.d[n], true, true, false);
  }

  private visitEnhancedForLoop(n: i32): void {
    const t = this.t;
    const g = this.g;
    this.sync(n);
    g.open(this.ZERO);
    this.token("for");
    g.space();
    this.token("(");
    g.open(this.ZERO);
    this.visitToDeclare(DK_NONE, HORIZONTAL, t.a[n], t.b[n], ":", "");
    g.close();
    this.token(")");
    g.close();
    this.visitStatement(t.c[n], true, true, false);
  }

  private visitDoWhileLoop(n: i32): void {
    const t = this.t;
    const g = this.g;
    this.sync(n);
    this.token("do");
    this.visitStatement(t.a[n], true, true, true);
    if (t.kind[t.a[n]] === N_BLOCK) {
      g.space();
    } else {
      g.brkSp();
    }
    this.token("while");
    g.space();
    this.token("(");
    this.scan(t.a[t.b[n]]);
    this.token(")");
    this.token(";");
  }

  private visitTry(n: i32): void {
    const t = this.t;
    const g = this.g;
    this.sync(n);
    g.open(this.ZERO);
    this.token("try");
    g.space();
    const res = t.a[n];
    if (this.len(res) > 0) {
      this.token("(");
      g.open(this.len(res) > 1 ? this.plusFour : this.ZERO);
      for (let i = 0; i < this.len(res); i++) {
        const r = this.at(res, i);
        if (i > 0) {
          g.forcedBreak();
        }
        if (t.kind[r] === N_VARIABLE) {
          this.declareOne(DK_PARAMETER, this.fieldAnnotationDirection(t.a[r]), t.a[r], t.b[r], t.name[r], "", "=", t.c[r], "", -1, false, null);
        } else {
          this.scan(r);
        }
        if (g.peekIs(";")) {
          this.token(";");
          g.space();
        }
      }
      if (g.peekIs(";")) {
        this.token(";");
        g.space();
      }
      this.token(")");
      g.close();
      g.space();
    }
    const catches = t.c[n];
    let trailingClauses = this.len(catches) > 0 || t.d[n] >= 0;
    this.visitBlock(t.b[n], !trailingClauses, true, trailingClauses);
    for (let i = 0; i < this.len(catches); i++) {
      trailingClauses = i < this.len(catches) - 1 || t.d[n] >= 0;
      this.visitCatchClause(this.at(catches, i), trailingClauses);
    }
    if (t.d[n] >= 0) {
      g.space();
      this.token("finally");
      g.space();
      this.visitBlock(t.d[n], false, true, false);
    }
    g.close();
  }

  private visitCatchClause(n: i32, allowTrailingBlank: boolean): void {
    const t = this.t;
    const g = this.g;
    this.sync(n);
    g.space();
    this.token("catch");
    g.space();
    this.token("(");
    g.open(this.plusFour);
    const ex = t.a[n];
    if (t.kind[t.b[ex]] === N_UNION_TYPE) {
      g.open(this.ZERO);
      this.visitUnionType(ex);
      g.close();
    } else {
      g.breakToFill("");
      g.open(this.ZERO);
      this.scan(ex);
      g.close();
    }
    g.close();
    this.token(")");
    g.space();
    this.visitBlock(t.b[n], false, true, allowTrailingBlank);
  }

  private visitUnionType(decl: i32): void {
    const t = this.t;
    const g = this.g;
    const union = t.a[t.b[decl]];
    g.open(this.ZERO);
    this.sync(decl);
    this.visitAndBreakModifiers(t.a[decl], HORIZONTAL, -1);
    const un = this.len(union);
    for (let i = 0; i < un - 1; i++) {
      if (i > 0) {
        g.brkSp();
        this.token("|");
        g.space();
      }
      this.scan(this.at(union, i));
    }
    g.brkSp();
    this.token("|");
    g.space();
    const last = this.at(union, un - 1);
    this.declareOne(DK_NONE, HORIZONTAL, -1, last, t.name[decl], "", "=", t.c[decl], "", -1, false, null);
    g.close();
  }

  private visitSwitch(selector: i32, cases: i32): void {
    const g = this.g;
    this.token("switch");
    g.space();
    this.token("(");
    this.scan(this.t.a[selector]);
    this.token(")");
    g.space();
    this.tokenBreakTrailingComment("{", this.plusTwo);
    g.blankLineWanted(BL_NO);
    g.open(this.plusTwo);
    for (let i = 0; i < this.len(cases); i++) {
      if (i > 0) {
        g.blankLineWanted(BL_PRESERVE);
      }
      this.scan(this.at(cases, i));
    }
    g.close();
    g.forcedBreak();
    g.blankLineWanted(BL_NO);
    this.tokenInd("}", this.plusFour);
  }

  private visitCase(n: i32): void {
    const t = this.t;
    const g = this.g;
    this.sync(n);
    this.markForPartialFormat();
    g.forcedBreak();
    const labels = t.a[n];
    const isDefault = this.len(labels) === 1 && t.kind[this.at(labels, 0)] === N_DEFAULT_CASE_LABEL;
    const rule = (t.flags[n] & FL_RULE) !== 0;
    g.open(rule ? this.plusFour : this.ZERO);
    if (isDefault) {
      this.tokenInd("default", this.ZERO);
    } else {
      this.tokenInd("case", this.ZERO);
      g.open(this.ZERO);
      g.space();
      for (let i = 0; i < this.len(labels); i++) {
        if (i > 0) {
          this.token(",");
          g.brkSp();
        }
        this.scan(this.at(labels, i));
      }
      g.close();
    }
    const guard = t.b[n];
    if (guard >= 0) {
      g.breakToFill(" ");
      this.token("when");
      g.space();
      this.scan(guard);
    }
    if (!rule) {
      this.token(":");
      g.open(this.plusTwo);
      this.visitStatements(t.c[n]);
      g.close();
      g.close();
    } else {
      g.space();
      this.token("-");
      this.token(">");
      const body = t.d[n];
      if (t.kind[body] === N_BLOCK) {
        g.close();
        g.space();
        this.visitBlock(body, true, false, false);
      } else {
        g.brkSp();
        this.scan(body);
        g.close();
      }
      g.guessToken(";");
    }
  }

  // ---- Expressions -----------------------------------------------------------

  private visitLiteral(n: i32): void {
    const inp = this.inp;
    const g = this.g;
    this.sync(n);
    const a = this.t.start[n];
    const e = this.t.end[n];
    if (e - a >= 3 && toI32(inp.src[a]) === 34 && toI32(inp.src[a + 1]) === 34 && toI32(inp.src[a + 2]) === 34) {
      if (this.textBlockDeindents(a, e)) {
        g.brkInd(g.constIndent(-1073741824));
      }
      g.tokLike(this.t.name[n]);
      return;
    }
    if (toI32(inp.src[a]) === 45) {
      this.token("-");
    }
    g.tokLike(this.t.name[n]);
  }

  /**
   * Whether a text block's closing line, stripped, is as long as the last line
   * of its stripped content (visitLiteral's `deindent`).
   */
  private textBlockDeindents(a: i32, e: i32): boolean {
    const src = this.inp.src;
    // Lines of the literal.
    const starts: i32[] = [a];
    for (let i = a; i < e; i++) {
      const c = toI32(src[i]);
      if (c === 10 || c === 13) {
        if (c === 13 && i + 1 < e && toI32(src[i + 1]) === 10) {
          i++;
        }
        starts.push(i + 1);
      }
    }
    const nl = toI32(starts.length);
    // stripIndent over lines 1..: the minimum indentation of non-blank lines,
    // and of the last line even when blank.
    let minIndent = 2147483647;
    for (let k = 1; k < nl; k++) {
      const s = starts[k];
      const le = this.tbLineEnd(starts, k, e);
      let i = s;
      while (i < le && (toI32(src[i]) === 32 || toI32(src[i]) === 9)) {
        i++;
      }
      const blank = i === le;
      if (!blank || k === nl - 1) {
        if (i - s < minIndent) {
          minIndent = i - s;
        }
      }
    }
    if (minIndent === 2147483647) {
      minIndent = 0;
    }
    // The last line of the stripped text, trailing-stripped.
    const lastK = nl - 1;
    const ls = starts[lastK];
    const le = this.tbLineEnd(starts, lastK, e);
    let lastTrim = le;
    while (lastTrim > ls && (toI32(src[lastTrim - 1]) === 32 || toI32(src[lastTrim - 1]) === 9)) {
      lastTrim--;
    }
    const lastOrigLen = lastTrim - ls;
    // The stripped version of the last line: indentation removed.
    let strippedLen = lastTrim - ls - minIndent;
    if (strippedLen < 0) {
      strippedLen = 0;
    }
    return lastOrigLen === strippedLen;
  }

  /** The end of text-block line `k`, without its terminator. */
  private tbLineEnd(starts: i32[], k: i32, e: i32): i32 {
    const src = this.inp.src;
    let x = k + 1 < toI32(starts.length) ? starts[k + 1] : e;
    while (x > starts[k] && (toI32(src[x - 1]) === 10 || toI32(src[x - 1]) === 13)) {
      x--;
    }
    return x;
  }

  private splitToken(s: string): void {
    for (let i = 0; i < toI32(s.length); i++) {
      this.token(s.substring(i, i + 1));
    }
  }

  private visitUnary(n: i32): void {
    const t = this.t;
    this.sync(n);
    const op = t.op[n];
    const name = opName(op);
    if (op === OP_POSTINC || op === OP_POSTDEC) {
      this.scan(t.a[n]);
      this.splitToken(name);
    } else {
      this.splitToken(name);
      if (this.ambiguousUnaryOperator(n, name)) {
        this.g.space();
      }
      this.scan(t.a[n]);
    }
  }

  private ambiguousUnaryOperator(n: i32, name: string): boolean {
    const t = this.t;
    const op = t.op[n];
    if (op !== OP_NEG && op !== OP_POS) {
      return false;
    }
    const e = t.a[n];
    let tagOp = -1;
    if (t.kind[e] === N_UNARY) {
      tagOp = t.op[e];
    } else if (t.kind[e] === N_LITERAL && toI32(this.inp.src[t.start[e]]) === 45) {
      tagOp = OP_NEG;
    }
    if (tagOp < 0) {
      return false;
    }
    if (tagOp === OP_POSTINC || tagOp === OP_POSTDEC) {
      return false;
    }
    // gjf compares the node's own operator name with itself here: always true.
    return true;
  }

  private visitBinary(n: i32): void {
    const g = this.g;
    this.sync(n);
    const operands: i32[] = [];
    const operators: i32[] = [];
    this.walkInfix(opPrec(this.t.op[n]), n, operands, operators);
    const fill = this.hasOnlyShortItems(operands) ? INDEPENDENT : UNIFIED;
    g.open(this.plusFour);
    this.scan(operands[0]);
    for (let i = 0; i < toI32(operators.length); i++) {
      g.breakOp(fill, " ", this.ZERO, -1);
      g.op(opName(operators[i]));
      g.space();
      this.scan(operands[i + 1]);
    }
    g.close();
  }

  private walkInfix(prec: i32, e: i32, operands: i32[], operators: i32[]): void {
    const t = this.t;
    if (t.kind[e] === N_BINARY && opPrec(t.op[e]) === prec) {
      this.walkInfix(prec, t.a[e], operands, operators);
      operators.push(t.op[e]);
      this.walkInfix(prec, t.b[e], operands, operators);
    } else {
      operands.push(e);
    }
  }

  private hasOnlyShortItems(exprs: i32[]): boolean {
    for (const e of exprs) {
      const s = this.t.start[e];
      if (this.g.actualSize(s, this.t.end[e] - s) >= MAX_ITEM_LENGTH_FOR_FILLING) {
        return false;
      }
    }
    return true;
  }

  private visitLambdaExpression(n: i32): void {
    const t = this.t;
    const g = this.g;
    this.sync(n);
    const statementBody = (t.flags[n] & FL_STATEMENT_BODY) !== 0;
    const parens = g.peekIs("(");
    g.open(parens ? this.plusFour : this.ZERO);
    if (parens) {
      this.token("(");
    }
    const params = t.a[n];
    for (let i = 0; i < this.len(params); i++) {
      if (i > 0) {
        this.token(",");
        g.brkSp();
      }
      const p = this.at(params, i);
      this.visitVariables([p], DK_NONE, this.fieldAnnotationDirection(t.a[p]));
    }
    if (parens) {
      this.token(")");
    }
    g.close();
    g.space();
    g.op("->");
    g.open(statementBody ? this.ZERO : this.plusFour);
    if (statementBody) {
      g.space();
    } else {
      g.brkSp();
    }
    if (t.kind[t.b[n]] === N_BLOCK) {
      this.visitBlock(t.b[n], true, false, false);
    } else {
      this.scan(t.b[n]);
    }
    g.close();
  }

  private visitNewClass(n: i32): void {
    const t = this.t;
    const g = this.g;
    this.sync(n);
    g.open(this.ZERO);
    if (t.a[n] >= 0) {
      this.scan(t.a[n]);
      g.brk();
      this.token(".");
    }
    this.token("new");
    g.space();
    this.addTypeArguments(t.b[n], this.plusFour);
    if (t.e[n] >= 0) {
      const annos = this.visitModifiersOf(t.a[t.e[n]], HORIZONTAL, -1);
      this.visitAnnotations(annos, false, true);
    }
    this.scan(t.c[n]);
    this.addArguments(t.d[n], this.plusFour);
    g.close();
    if (t.e[n] >= 0) {
      this.addBodyDeclarations(this.listItems(t.f[t.e[n]]), true, true);
    }
  }

  private visitNewArray(n: i32): void {
    const t = this.t;
    const g = this.g;
    if (t.a[n] >= 0) {
      g.open(this.plusFour);
      this.token("new");
      g.space();
      const dims = new Dims();
      const base = this.extractDims(t.a[n], dims, true);
      const dimExprs = new Dims();
      for (let i = 0; i < this.len(t.b[n]); i++) {
        dimExprs.items.push(this.at(t.b[n], i));
      }
      const annos = new Dims();
      annos.items.push(t.d[n]);
      for (let i = 0; i < this.len(t.e[n]); i++) {
        annos.items.push(this.at(t.e[n], i));
      }
      for (let i = dims.head; i < toI32(dims.items.length); i++) {
        annos.items.push(dims.items[i]);
      }
      this.scan(base);
      g.open(this.ZERO);
      this.maybeAddDims(dimExprs, annos);
      g.close();
      g.close();
    }
    if (t.c[n] >= 0) {
      if (t.a[n] >= 0) {
        g.space();
      }
      this.visitArrayInitializer(t.c[n]);
    }
  }

  visitArrayInitializer(exprs: i32): void {
    const t = this.t;
    const g = this.g;
    const ne = this.len(exprs);
    let cols = -1;
    if (ne === 0) {
      this.tokenBreakTrailingComment("{", this.plusTwo);
      if (g.peekIs(",")) {
        this.token(",");
      }
      this.tokenInd("}", this.plusTwo);
    } else if ((cols = this.argumentsAreTabular(this.listItems(exprs))) !== -1) {
      g.open(this.plusTwo);
      this.token("{");
      g.forcedBreak();
      let afterFirstToken = false;
      for (let r = 0; r < ne; r += cols) {
        if (afterFirstToken) {
          g.forcedBreak();
        }
        const first = this.at(exprs, r);
        g.open(t.kind[first] === N_NEW_ARRAY || cols === 1 ? this.ZERO : this.plusFour);
        for (let i = r; i < r + cols && i < ne; i++) {
          if (i > r) {
            this.token(",");
            g.breakToFill(" ");
          }
          this.scan(this.at(exprs, i));
        }
        g.guessToken(",");
        g.close();
        afterFirstToken = true;
      }
      g.brkInd(this.minusTwo);
      g.close();
      this.tokenInd("}", this.plusTwo);
    } else {
      let inMemberValuePair = false;
      for (let i = 0; i < 2; i++) {
        const p = this.pathAt(i);
        if (p < 0) {
          break;
        }
        if (t.kind[p] === N_ANNOTATION) {
          inMemberValuePair = true;
          break;
        }
      }
      const items = this.listItems(exprs);
      const shortItems = this.hasOnlyShortItems(items);
      const allowFilledElementsOnOwnLine = shortItems || !inMemberValuePair;
      g.open(this.plusTwo);
      this.tokenBreakTrailingComment("{", this.plusTwo);
      const hasTrailingComma = this.hasTrailingToken(items, ",");
      g.breakOp(hasTrailingComma ? FORCED : UNIFIED, "", this.ZERO, -1);
      if (allowFilledElementsOnOwnLine) {
        g.open(this.ZERO);
      }
      const fill = shortItems ? INDEPENDENT : UNIFIED;
      for (let i = 0; i < ne; i++) {
        if (i > 0) {
          this.token(",");
          g.breakOp(fill, " ", this.ZERO, -1);
        }
        this.scan(items[i]);
      }
      g.guessToken(",");
      if (allowFilledElementsOnOwnLine) {
        g.close();
      }
      g.brkInd(this.minusTwo);
      g.close();
      this.tokenInd("}", this.plusTwo);
    }
  }

  private hasTrailingToken(nodes: i32[], s: string): boolean {
    if (nodes.length === 0) {
      return false;
    }
    const last = nodes[nodes.length - 1];
    const k = this.inp.tokenAt(this.t.end[last]);
    return k >= 0 && this.inp.is(this.inp.kTok[k], s);
  }

  addTypeArguments(targs: i32, plusIndent: i32): void {
    const g = this.g;
    if (targs < 0 || this.len(targs) === 0) {
      return;
    }
    this.token("<");
    g.open(plusIndent);
    for (let i = 0; i < this.len(targs); i++) {
      if (i > 0) {
        this.token(",");
        g.breakToFill(" ");
      }
      this.scan(this.at(targs, i));
    }
    g.close();
    this.token(">");
  }

  addArguments(args: i32, plusIndent: i32): void {
    const g = this.g;
    g.open(plusIndent);
    this.token("(");
    const na = this.len(args);
    if (na > 0) {
      const items = this.listItems(args);
      if (na % 2 === 0 && this.argumentsAreTabular(items) === 2) {
        g.forcedBreak();
        g.open(this.ZERO);
        for (let i = 0; i < na - 1; i += 2) {
          if (i > 0) {
            this.token(",");
            g.forcedBreak();
          }
          g.open(this.plusFour);
          this.scan(items[i]);
          this.token(",");
          g.brkSp();
          this.scan(items[i + 1]);
          g.close();
        }
        g.close();
      } else if (this.isFormatMethod(items)) {
        g.brk();
        g.open(this.ZERO);
        this.scan(items[0]);
        this.token(",");
        g.brkSp();
        g.open(this.ZERO);
        this.argList(items.slice(1, items.length));
        g.close();
        g.close();
      } else {
        g.brk();
        this.argList(items);
      }
    }
    this.token(")");
    g.close();
  }

  private argList(args: i32[]): void {
    const g = this.g;
    g.open(this.ZERO);
    const fill = this.hasOnlyShortItems(args) ? INDEPENDENT : UNIFIED;
    for (let i = 0; i < toI32(args.length); i++) {
      if (i > 0) {
        this.token(",");
        g.breakOp(fill, " ", this.ZERO, -1);
      }
      this.scan(args[i]);
    }
    g.close();
  }

  private isFormatMethod(args: i32[]): boolean {
    if (args.length < 2) {
      return false;
    }
    this.scStringLiteral = true;
    this.scFormatString = false;
    this.scanConcat(args[0]);
    return this.scStringLiteral && this.scFormatString;
  }

  scStringLiteral: boolean = true;
  scFormatString: boolean = false;

  private scanConcat(n: i32): void {
    const t = this.t;
    if (t.kind[n] === N_LITERAL && t.op[n] === LIT_STRING) {
      // FORMAT_SPECIFIER: `%` or `{digit}` in the value.
      const src = this.inp.src;
      for (let i = t.start[n]; i < t.end[n]; i++) {
        const c = toI32(src[i]);
        if (c === 37) {
          this.scFormatString = true;
        } else if (c === 123 && i + 2 < t.end[n] && toI32(src[i + 1]) >= 48 && toI32(src[i + 1]) <= 57 && toI32(src[i + 2]) === 125) {
          this.scFormatString = true;
        }
      }
      return;
    }
    if (t.kind[n] === N_BINARY && t.op[n] === OP_PLUS) {
      this.scanConcat(t.a[n]);
      this.scanConcat(t.b[n]);
      return;
    }
    this.scStringLiteral = false;
  }

  /** argumentsAreTabular: the column count of a table of arguments, or -1. */
  argumentsAreTabular(args: i32[]): i32 {
    if (args.length === 0) {
      return -1;
    }
    const rows: i32[][] = [];
    let i = 0;
    const na = toI32(args.length);
    const start0 = this.actualColumn(args[0]);
    {
      const row: i32[] = [args[i]];
      i++;
      while (i < na && this.actualColumn(args[i]) > start0) {
        row.push(args[i]);
        i++;
      }
      if (i >= na) {
        return -1;
      }
      if (this.rowLength(row) <= 1) {
        return -1;
      }
      rows.push(row);
    }
    while (i < na) {
      const start = this.actualColumn(args[i]);
      if (start !== start0) {
        return -1;
      }
      const row: i32[] = [args[i]];
      i++;
      while (i < na && this.actualColumn(args[i]) > start0) {
        row.push(args[i]);
        i++;
      }
      rows.push(row);
    }
    const size0 = toI32(rows[0].length);
    if (!this.expressionsAreParallel(rows, 0, toI32(rows.length))) {
      return -1;
    }
    for (let c = 1; c < size0; c++) {
      if (!this.expressionsAreParallel(rows, c, toI32(rows.length) / 2 + 1)) {
        return -1;
      }
    }
    if (rows.length === 2) {
      if (size0 === toI32(rows[1].length)) {
        return size0;
      }
      return -1;
    }
    for (let r = 1; r < toI32(rows.length) - 1; r++) {
      if (size0 !== toI32(rows[r].length)) {
        return -1;
      }
    }
    if (size0 < toI32(rows[rows.length - 1].length)) {
      return -1;
    }
    return size0;
  }

  private rowLength(row: i32[]): i32 {
    const t = this.t;
    let size = 0;
    for (const e of row) {
      if (t.kind[e] !== N_NEW_ARRAY || t.c[e] < 0) {
        size++;
        continue;
      }
      size += this.rowLength(this.listItems(t.c[e]));
    }
    return size;
  }

  private actualColumn(e: i32): i32 {
    return this.inp.columnAt(this.g.actualStartColumn(this.t.start[e]));
  }

  /** A fine-grained kind: javac's Tree.Kind distinguishes operators and literal types. */
  private fineKind(e: i32): i32 {
    const t = this.t;
    const k = t.kind[e];
    if (k === N_BINARY || k === N_UNARY || k === N_LITERAL || k === N_COMPOUND_ASSIGNMENT || k === N_WILDCARD) {
      return k * 64 + t.op[e];
    }
    return k * 64;
  }

  private expressionsAreParallel(rows: i32[][], column: i32, atLeastM: i32): boolean {
    const t = this.t;
    const kinds: i32[] = [];
    const counts: i32[] = [];
    for (const row of rows) {
      if (column >= toI32(row.length)) {
        continue;
      }
      const e = row[column];
      const k = t.kind[e] === N_UNARY ? this.fineKind(t.a[e]) : this.fineKind(e);
      let found = false;
      for (let i = 0; i < toI32(kinds.length); i++) {
        if (kinds[i] === k) {
          counts[i] = counts[i] + 1;
          found = true;
          break;
        }
      }
      if (!found) {
        kinds.push(k);
        counts.push(1);
      }
    }
    for (const c of counts) {
      if (c >= atLeastM) {
        return true;
      }
    }
    return false;
  }

  // ---- Dotted expressions ----------------------------------------------------

  private getArrayBase(e0: i32): i32 {
    let e = e0;
    while (this.t.kind[e] === N_ARRAY_ACCESS) {
      e = this.t.a[e];
    }
    return e;
  }

  private getMethodReceiver(mi: i32): i32 {
    const sel = this.t.b[mi];
    return this.t.kind[sel] === N_MEMBER_SELECT ? this.t.a[sel] : -1;
  }

  private methodName(mi: i32): i32 {
    return this.t.name[this.t.b[mi]];
  }

  private visitDot(node0: i32): void {
    const t = this.t;
    const g = this.g;
    let node = node0;
    const stack: i32[] = []; // reversed at the end (addFirst)
    while (true) {
      stack.push(node);
      if (t.kind[node] === N_ARRAY_ACCESS) {
        node = this.getArrayBase(node);
      }
      const k = t.kind[node];
      if (k === N_MEMBER_SELECT) {
        node = t.a[node];
      } else if (k === N_METHOD_INVOCATION) {
        node = this.getMethodReceiver(node);
      } else if (k === N_IDENTIFIER) {
        node = -1;
        break;
      } else {
        node = stack.pop();
        break;
      }
      if (node < 0) {
        break;
      }
    }
    const items: i32[] = [];
    for (let i = toI32(stack.length) - 1; i >= 0; i--) {
      items.push(stack[i]);
    }
    let needDot = false;
    if (node >= 0) {
      if (t.kind[node] === N_NEW_CLASS && t.e[node] >= 0) {
        g.open(this.ZERO);
        this.scan(this.getArrayBase(node));
        this.token(".");
      } else {
        g.open(this.plusFour);
        this.scan(this.getArrayBase(node));
        g.brk();
        needDot = true;
      }
      this.formatArrayIndices(this.getArrayIndices(node));
      if (items.length === 0) {
        g.close();
        return;
      }
    }
    const prefixes: i32[] = [];
    const tp = this.typePrefixLength(this.simpleNames(items));
    if (tp >= 0) {
      prefixes.push(tp);
    }
    let invocationCount = 0;
    let firstInvocationIndex = -1;
    for (let i = 0; i < toI32(items.length); i++) {
      if (t.kind[items[i]] === N_METHOD_INVOCATION) {
        if (i > 0 || node >= 0) {
          invocationCount++;
        }
        if (firstInvocationIndex < 0) {
          firstInvocationIndex = i;
        }
      }
    }
    if (invocationCount === 1 && firstInvocationIndex > 0) {
      addUnique(prefixes, firstInvocationIndex);
    }
    if (prefixes.length === 0 && t.kind[items[0]] === N_IDENTIFIER) {
      const nm = t.name[items[0]];
      if (this.inp.is(nm, "this") || this.inp.is(nm, "super")) {
        prefixes.push(1);
      }
    }
    const streamPrefixes = this.handleStream(items);
    for (const x of streamPrefixes) {
      addUnique(prefixes, x);
    }
    if (prefixes.length > 0) {
      this.visitDotWithPrefix(items, needDot, prefixes, streamPrefixes.length === 0 ? INDEPENDENT : UNIFIED);
    } else {
      this.visitRegularDot(items, needDot);
    }
    if (node >= 0) {
      g.close();
    }
  }

  private handleStream(items: i32[]): i32[] {
    const out: i32[] = [];
    for (let i = 0; i < toI32(items.length); i++) {
      const p = items[i];
      if (this.t.kind[p] !== N_METHOD_INVOCATION) {
        continue;
      }
      const nm = this.methodName(p);
      if (this.inp.is(nm, "stream") || this.inp.is(nm, "parallelStream") || this.inp.is(nm, "toBuilder")) {
        out.push(i);
      }
    }
    return out;
  }

  private handleLogStatement(n: i32): boolean {
    const t = this.t;
    if (!this.inp.is(this.methodName(n), "log")) {
      return false;
    }
    const rev: i32[] = [];
    let curr = n;
    while (curr >= 0 && t.kind[curr] === N_METHOD_INVOCATION) {
      rev.push(curr);
      if (!isLogMethod(this.inp, this.methodName(curr))) {
        return false;
      }
      curr = this.getMethodReceiver(curr);
    }
    if (curr < 0 || t.kind[curr] !== N_IDENTIFIER) {
      return false;
    }
    rev.push(curr);
    const parts: i32[] = [];
    for (let i = toI32(rev.length) - 1; i >= 0; i--) {
      parts.push(rev[i]);
    }
    this.visitDotWithPrefix(parts, false, [toI32(parts.length) - 1], INDEPENDENT);
    return true;
  }

  private visitRegularDot(items: i32[], needDot0: boolean): void {
    const g = this.g;
    const trailingDereferences = items.length > 1;
    let needDot = needDot0;
    if (!needDot0) {
      g.open(this.plusFour);
    }
    const minLength = 4;
    let length = needDot0 ? minLength : 0;
    for (const e of items) {
      if (needDot) {
        if (length > minLength) {
          g.breakOp(UNIFIED, "", this.ZERO, -1);
        }
        this.token(".");
        length++;
      }
      if (!this.fillFirstArgument(e, items, trailingDereferences ? this.ZERO : this.minusFour)) {
        const tyargTag = g.genSym();
        this.dotExpressionUpToArgs(e, tyargTag);
        const tyargIndent = g.ifIndent(tyargTag, this.plusFour, this.ZERO);
        this.dotExpressionArgsAndParen(e, tyargIndent, trailingDereferences || needDot ? this.plusFour : this.ZERO);
      }
      length += this.inp.width(this.t.start[e], this.t.end[e]);
      needDot = true;
    }
    if (!needDot0) {
      g.close();
    }
  }

  private fillFirstArgument(e: i32, items: i32[], indent: i32): boolean {
    const t = this.t;
    const g = this.g;
    if (items.length < 2) {
      return false;
    }
    if (t.kind[e] !== N_METHOD_INVOCATION) {
      return false;
    }
    const name = this.methodName(e);
    if (t.kind[t.b[e]] !== N_IDENTIFIER || this.inp.width(this.inp.tPos[name], this.inp.tEnd[name]) > 4 || this.len(t.a[e]) > 0 || this.len(t.c[e]) !== 1) {
      return false;
    }
    g.open(this.ZERO);
    g.open(indent);
    this.visitName(name);
    this.token("(");
    this.scan(this.at(t.c[e], 0));
    g.close();
    this.token(")");
    g.close();
    return true;
  }

  private visitDotWithPrefix(items: i32[], needDot0: boolean, prefixes0: i32[], prefixFill: i32): void {
    const g = this.g;
    let needDot = needDot0;
    const lastPrefix = prefixes0.length > 0 ? prefixes0[prefixes0.length - 1] : -1;
    const trailingDereferences = prefixes0.length > 0 && lastPrefix < toI32(items.length) - 1;
    g.open(this.plusFour);
    for (let i = 0; i < toI32(prefixes0.length); i++) {
      g.open(this.ZERO);
    }
    // ImmutableSortedSet: sorted, unique.
    const sorted: i32[] = [];
    for (const p of prefixes0) {
      addUnique(sorted, p);
    }
    for (let i = 1; i < toI32(sorted.length); i++) {
      const x = sorted[i];
      let j = i - 1;
      while (j >= 0 && sorted[j] > x) {
        sorted[j + 1] = sorted[j];
        j--;
      }
      sorted[j + 1] = x;
    }
    let up = 0;
    const nameTag = g.genSym();
    for (let i = 0; i < toI32(items.length); i++) {
      const e = items[i];
      if (needDot) {
        let fill = UNIFIED;
        if (up < toI32(sorted.length) && i <= sorted[up]) {
          fill = prefixFill;
        }
        g.breakOp(fill, "", this.ZERO, nameTag);
        this.token(".");
      }
      const tyargTag = g.genSym();
      this.dotExpressionUpToArgs(e, tyargTag);
      if (up < toI32(sorted.length) && i === sorted[up]) {
        g.close();
        up++;
      }
      const tyargIndent = g.ifIndent(tyargTag, this.plusFour, this.ZERO);
      const argsIndent = g.ifIndent(nameTag, this.plusFour, trailingDereferences ? this.plusFour : this.ZERO);
      this.dotExpressionArgsAndParen(e, tyargIndent, argsIndent);
      needDot = true;
    }
    g.close();
  }

  private simpleNames(items: i32[]): string[] {
    const t = this.t;
    const out: string[] = [];
    for (const e0 of items) {
      const isArray = t.kind[e0] === N_ARRAY_ACCESS;
      const e = this.getArrayBase(e0);
      const k = t.kind[e];
      if (k === N_MEMBER_SELECT || k === N_IDENTIFIER) {
        out.push(this.inp.text(t.name[e]));
      } else if (k === N_METHOD_INVOCATION) {
        out.push(this.inp.text(this.methodName(e)));
        break;
      } else {
        break;
      }
      if (isArray) {
        break;
      }
    }
    return out;
  }

  /** TypeNameClassifier.typePrefixLength, or -1. */
  private typePrefixLength(names: string[]): i32 {
    // States: 0 START, 1 TYPE, 2 FIRST_STATIC_MEMBER, 3 REJECT, 4 AMBIGUOUS.
    let state = 0;
    let typeLength = -1;
    for (let i = 0; i < toI32(names.length); i++) {
      const f = caseFormat(names[i]);
      // f: 0 UPPERCASE, 1 LOWERCASE, 2 UPPER_CAMEL, 3 LOWER_CAMEL
      if (state === 0) {
        state = f === 0 ? 4 : f === 3 ? 3 : f === 1 ? 0 : 1;
      } else if (state === 1) {
        state = f === 2 ? 1 : 2;
      } else if (state === 2) {
        state = 3;
      } else if (state === 4) {
        state = f === 0 ? 4 : f === 2 ? 1 : 3;
      }
      if (state === 3) {
        break;
      }
      if (state === 1 || state === 2) {
        typeLength = i;
      }
    }
    return typeLength;
  }

  private dotExpressionUpToArgs(e0: i32, tyargTag: i32): void {
    const t = this.t;
    const g = this.g;
    const e = this.getArrayBase(e0);
    const k = t.kind[e];
    if (k === N_MEMBER_SELECT) {
      this.visitName(t.name[e]);
    } else if (k === N_METHOD_INVOCATION) {
      if (this.len(t.a[e]) > 0) {
        g.open(this.plusFour);
        this.addTypeArguments(t.a[e], this.ZERO);
        g.breakOp(UNIFIED, "", this.ZERO, tyargTag);
        g.close();
      }
      this.visitName(this.methodName(e));
    } else if (k === N_IDENTIFIER) {
      this.visitName(t.name[e]);
    } else {
      this.scan(e);
    }
  }

  private dotExpressionArgsAndParen(e0: i32, tyargIndent: i32, indent: i32): void {
    const t = this.t;
    const g = this.g;
    const indices = this.getArrayIndices(e0);
    const e = this.getArrayBase(e0);
    if (t.kind[e] === N_METHOD_INVOCATION) {
      g.open(tyargIndent);
      this.addArguments(t.c[e], indent);
      g.close();
    }
    this.formatArrayIndices(indices);
  }

  /** The indices of nested array accesses, innermost last. */
  private getArrayIndices(e0: i32): i32[] {
    const t = this.t;
    const out: i32[] = [];
    let e = e0;
    while (t.kind[e] === N_ARRAY_ACCESS) {
      out.push(t.b[e]);
      e = t.a[e];
    }
    return out;
  }

  private formatArrayIndices(indices: i32[]): void {
    const g = this.g;
    if (indices.length === 0) {
      return;
    }
    g.open(this.ZERO);
    for (let i = toI32(indices.length) - 1; i >= 0; i--) {
      this.token("[");
      g.breakToFill("");
      this.scan(indices[i]);
      this.token("]");
    }
    g.close();
  }

  // ---- Modules ---------------------------------------------------------------

  private visitModule(n: i32): void {
    const t = this.t;
    const g = this.g;
    for (let i = 0; i < this.len(t.a[n]); i++) {
      this.scan(this.at(t.a[n], i));
      g.forcedBreak();
    }
    if ((t.flags[n] & FL_OPEN_MODULE) !== 0) {
      this.token("open");
      g.space();
    }
    this.token("module");
    g.space();
    this.scan(t.b[n]);
    g.space();
    const dirs = t.c[n];
    if (this.len(dirs) === 0) {
      this.tokenBreakTrailingComment("{", this.plusTwo);
      g.blankLineWanted(BL_NO);
      this.tokenInd("}", this.plusTwo);
    } else {
      g.open(this.plusTwo);
      this.token("{");
      g.forcedBreak();
      let prev = -1;
      for (let i = 0; i < this.len(dirs); i++) {
        const d = this.at(dirs, i);
        this.markForPartialFormat();
        g.blankLineWanted(prev >= 0 && prev !== t.kind[d] ? BL_YES : BL_NO);
        g.forcedBreak();
        this.scan(d);
        prev = t.kind[d];
      }
      g.close();
      g.forcedBreak();
      this.token("}");
    }
  }

  private visitDirective(name: string, separator: string, nameExpr: i32, items: i32): void {
    const g = this.g;
    this.token(name);
    g.space();
    this.scan(nameExpr);
    if (items >= 0) {
      g.open(this.plusFour);
      g.space();
      this.token(separator);
      g.forcedBreak();
      for (let i = 0; i < this.len(items); i++) {
        if (i > 0) {
          this.token(",");
          g.forcedBreak();
        }
        this.scan(this.at(items, i));
      }
      this.token(";");
      g.close();
    } else {
      this.token(";");
    }
  }
}

const addUnique = (xs: i32[], x: i32): void => {
  for (const y of xs) {
    if (y === x) {
      return;
    }
  }
  xs.push(x);
};

/** TypeNameClassifier.JavaCaseFormat.from: 0 UPPERCASE, 1 LOWERCASE, 2 UPPER_CAMEL, 3 LOWER_CAMEL. */
const caseFormat = (name: string): i32 => {
  let firstUppercase = false;
  let hasUppercase = false;
  let hasLowercase = false;
  let first = true;
  for (let i = 0; i < toI32(name.length); i++) {
    const c = name.charCodeAt(i);
    const upper = c >= 65 && c <= 90;
    const lower = c >= 97 && c <= 122;
    if (!upper && !lower) {
      continue;
    }
    if (first) {
      firstUppercase = upper;
      first = false;
    }
    hasUppercase = hasUppercase || upper;
    hasLowercase = hasLowercase || lower;
  }
  if (firstUppercase) {
    return hasLowercase || name.length === 1 ? 2 : 0;
  }
  return hasUppercase ? 3 : 1;
};

const isLogMethod = (inp: GInput, t: i32): boolean =>
  inp.is(t, "at") ||
  inp.is(t, "atConfig") ||
  inp.is(t, "atDebug") ||
  inp.is(t, "atFine") ||
  inp.is(t, "atFiner") ||
  inp.is(t, "atFinest") ||
  inp.is(t, "atInfo") ||
  inp.is(t, "atMostEvery") ||
  inp.is(t, "atSevere") ||
  inp.is(t, "atWarning") ||
  inp.is(t, "every") ||
  inp.is(t, "log") ||
  inp.is(t, "logVarargs") ||
  inp.is(t, "perUnique") ||
  inp.is(t, "withCause") ||
  inp.is(t, "withStackTrace");

/** JavaInputAstVisitor.isModifier on a tok's text. */
const isModifier = (inp: GInput, t: i32): boolean =>
  inp.is(t, "public") ||
  inp.is(t, "protected") ||
  inp.is(t, "private") ||
  inp.is(t, "abstract") ||
  inp.is(t, "static") ||
  inp.is(t, "final") ||
  inp.is(t, "transient") ||
  inp.is(t, "volatile") ||
  inp.is(t, "synchronized") ||
  inp.is(t, "native") ||
  inp.is(t, "strictfp") ||
  inp.is(t, "default") ||
  inp.is(t, "sealed") ||
  inp.is(t, "non") ||
  inp.is(t, "-");
