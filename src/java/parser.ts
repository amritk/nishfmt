// A recursive-descent Java parser over GInput's tokens, building the javac
// tree shapes google-java-format's visitor reads. Multi-character operators
// arrive as one token per character; `op2`/`op3` match them when adjacent.
// Ambiguities (declarations, casts, lambdas, generic method references) are
// settled the way javac settles them, by speculative parsing.

import { GInput } from "../gdoc/input";
import { JK_CHAR, JK_IDENT, JK_NUMBER, JK_STRING, JK_TEXT_BLOCK } from "./lexer";
import { modifierRank, RANK_NON_SEALED } from "./modifiers";
import {
  CK_ANNOTATION,
  CK_CLASS,
  CK_ENUM,
  CK_INTERFACE,
  CK_RECORD,
  FL_COMPACT_CTOR,
  FL_IMPLICIT,
  FL_CTOR,
  FL_ENUM,
  FL_NEW_REF,
  FL_OPEN_MODULE,
  FL_RECORD,
  FL_RULE,
  FL_STATEMENT_BODY,
  FL_STATIC,
  FL_VARARGS,
  JTree,
  LIT_BOOLEAN,
  LIT_CHAR,
  LIT_DOUBLE,
  LIT_FLOAT,
  LIT_INT,
  LIT_LONG,
  LIT_NULL,
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
  N_CATCH,
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
  N_MODIFIERS,
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
  OP_AND,
  OP_BITAND,
  OP_BITOR,
  OP_BITXOR,
  OP_COMPL,
  OP_DIV,
  OP_EQ,
  OP_GE,
  OP_GT,
  OP_LE,
  OP_LT,
  OP_MINUS,
  OP_MOD,
  OP_MUL,
  OP_NE,
  OP_NEG,
  OP_NOT,
  OP_OR,
  OP_PLUS,
  OP_POS,
  OP_POSTDEC,
  OP_POSTINC,
  OP_PREDEC,
  OP_PREINC,
  OP_SL,
  OP_SR,
  OP_USR,
} from "./ast";

// A MODIFIERS node's flag: `sealed` is among its words (javac's Flags.SEALED,
// which permitsClause reads). Above ast.ts's FL_* bits; only the parser reads it.
const FL_MODS_SEALED: i32 = 65536;

/** A saved parser position for speculation. */
class Mark {
  rejected: boolean = false;
  p: i32 = 0;
  n: i32 = 0;
  nLists: i32 = 0;
  nItems: i32 = 0;
  nTmp: i32 = 0;
  err: boolean = false;
}

export class JParser {
  inp: GInput;
  t: JTree;
  p: i32 = 0; // the current token
  nT: i32 = 0;
  err: boolean = false;
  errAt: i32 = 0;

  constructor(inp: GInput, t: JTree) {
    this.inp = inp;
    this.t = t;
  }

  // ---- Tokens ----------------------------------------------------------------

  tokAt(i: i32): i32 {
    const k = this.p + i;
    return k < this.nT ? this.inp.kTok[k] : this.inp.kTok[this.nT - 1];
  }

  is(s: string): boolean {
    return this.inp.is(this.tokAt(0), s);
  }

  isAt(i: i32, s: string): boolean {
    return this.inp.is(this.tokAt(i), s);
  }

  /** Whether token p+i starts right where token p+i-1 ends. */
  adjAt(i: i32): boolean {
    return this.inp.tPos[this.tokAt(i)] === this.inp.tEnd[this.tokAt(i - 1)];
  }

  op2At(i: i32, a: string, b: string): boolean {
    return this.isAt(i, a) && this.isAt(i + 1, b) && this.adjAt(i + 1);
  }

  op2(a: string, b: string): boolean {
    return this.op2At(0, a, b);
  }

  op3At(i: i32, a: string, b: string, c: string): boolean {
    return this.op2At(i, a, b) && this.isAt(i + 2, c) && this.adjAt(i + 2);
  }

  op3(a: string, b: string, c: string): boolean {
    return this.op3At(0, a, b, c);
  }

  kindAt(i: i32): i32 {
    return this.inp.tKind[this.tokAt(i)];
  }

  isIdentAt(i: i32): boolean {
    return this.kindAt(i) === JK_IDENT && !isJavaKeyword(this.inp, this.tokAt(i));
  }

  isIdent(): boolean {
    return this.isIdentAt(0);
  }

  atEof(): boolean {
    return this.p >= this.nT - 1;
  }

  pos(): i32 {
    return this.inp.tPos[this.tokAt(0)];
  }

  /** The end of the last consumed token. */
  prevEnd(): i32 {
    return this.p > 0 ? this.inp.tEnd[this.inp.kTok[this.p - 1]] : 0;
  }

  next(): void {
    if (this.p < this.nT - 1) {
      this.p = this.p + 1;
    }
  }

  skip(k: i32): void {
    for (let i = 0; i < k; i++) {
      this.next();
    }
  }

  fail(): void {
    if (!this.err) {
      this.err = true;
      this.errAt = this.p;
    }
  }

  expect(s: string): void {
    if (this.is(s)) {
      this.next();
    } else {
      this.fail();
    }
  }

  accept(s: string): boolean {
    if (this.is(s)) {
      this.next();
      return true;
    }
    return false;
  }

  /** The current token as an identifier (its tok), consuming it; fails if it is not one. */
  ident(): i32 {
    if (this.kindAt(0) !== JK_IDENT) {
      this.fail();
      return this.tokAt(0);
    }
    const t = this.tokAt(0);
    this.next();
    return t;
  }

  save(m: Mark): void {
    m.rejected = this.rejected;
    m.p = this.p;
    m.n = this.t.n;
    m.nLists = this.t.nLists;
    m.nItems = this.t.nItems;
    m.nTmp = this.t.nTmp;
    m.err = this.err;
  }

  restore(m: Mark): void {
    this.rejected = m.rejected;
    this.p = m.p;
    this.t.n = m.n;
    this.t.nLists = m.nLists;
    this.t.nItems = m.nItems;
    this.t.nTmp = m.nTmp;
    this.err = m.err;
  }

  finish(node: i32): i32 {
    this.t.end[node] = this.prevEnd();
    return node;
  }

  // ---- Compilation unit ------------------------------------------------------

  parse(): i32 {
    const t = this.t;
    t.reset();
    this.p = 0;
    this.nT = this.inp.nTokens;
    this.err = false;
    this.rejected = false;
    this.allowVarType = false;
    // At most a few nodes per token (an enum constant makes three of one).
    t.ensure(this.nT * 4 + 1024);
    const cu = t.node(N_COMPILATION_UNIT, 0);
    // Package annotations: annotations followed by `package`.
    const m = new Mark();
    this.save(m);
    const am = t.mark();
    while (this.is("@") && !this.isAt(1, "interface")) {
      t.push(this.annotation());
    }
    if (this.is("package")) {
      t.a[cu] = t.list(am);
      this.next();
      t.b[cu] = this.qualident(false);
      this.expect(";");
    } else {
      t.nTmp = am;
      this.restore(m);
      t.a[cu] = t.empty();
    }
    // javac (since JDK 21) rejects semicolons before an import declaration:
    // "extraneous semicolon". After the last import they are empty type
    // declarations.
    let semis = false;
    while (this.is(";")) {
      this.next();
      semis = true;
    }
    if (semis && this.is("import")) {
      this.fail();
    }
    const im = t.mark();
    while (this.is("import") && !this.err) {
      t.push(this.importDecl());
      semis = false;
      while (this.is(";")) {
        this.next();
        semis = true;
      }
      if (semis && this.is("import")) {
        this.fail();
      }
    }
    t.c[cu] = t.list(im);
    const dm = t.mark();
    // A field or method at the top level makes every declaration a member
    // of an implicitly declared class (JEP 445, a preview javac 21 parses).
    let implicit = -1;
    while (!this.atEof() && !this.err) {
      if (this.is(";")) {
        this.next();
        continue;
      }
      if (this.is("import")) {
        // An import after a type declaration: "class, interface, enum, or record expected".
        this.fail();
        break;
      }
      if (this.looksLikeModule()) {
        t.e[cu] = this.moduleDecl();
        continue;
      }
      const m0 = new Mark();
      this.save(m0);
      const mods = this.modifiers();
      if (this.isClassStart()) {
        t.push(this.classDecl(mods));
        continue;
      }
      this.restore(m0);
      if (implicit < 0) {
        implicit = this.implicitClass();
      }
      const fieldStartOk = this.topLevelFieldStart();
      const before = t.nTmp;
      this.member(implicit);
      // javac 21's topLevelMethodOrFieldDeclaration: a method, or a field
      // whose first name is followed by `=` or `;` and whose type is not
      // `var`. Anything else ("class, interface, enum, or record expected"
      // for an initializer, a constructor-shaped member or `int a, b;`) is
      // an error.
      if (!this.err && t.nTmp > before) {
        const m = t.tmp[before];
        if (t.kind[m] === N_BLOCK || (t.kind[m] === N_METHOD && (t.flags[m] & FL_CTOR) !== 0)) {
          this.fail();
        } else if (t.kind[m] === N_VARIABLE && !fieldStartOk) {
          this.fail();
        }
      }
    }
    if (implicit >= 0) {
      if (t.b[cu] >= 0) {
        // "unnamed class should not have package declaration".
        this.fail();
      }
      t.f[implicit] = t.list(dm);
      const n = t.len(t.f[implicit]);
      if (n > 0) {
        t.start[implicit] = t.start[t.at(t.f[implicit], 0)];
        t.end[implicit] = t.end[t.at(t.f[implicit], n - 1)];
      }
      const im2 = t.mark();
      t.push(implicit);
      t.d[cu] = t.list(im2);
    } else {
      t.d[cu] = t.list(dm);
    }
    this.finish(cu);
    if (this.rejected) {
      this.fail();
    }
    return cu;
  }

  /**
   * Looks ahead over modifiers, type and name: whether `=` or `;` follows
   * the name, and the type is not `var`, as javac 21 needs of a top-level
   * field. The position is left as it was.
   */
  private topLevelFieldStart(): boolean {
    const m = new Mark();
    this.save(m);
    this.modifiers();
    let ok = false;
    if (!this.is("<") && !this.is("var") && !this.is("void")) {
      this.type();
      if (!this.err && this.kindAt(0) === JK_IDENT) {
        this.next();
        ok = this.is("=") || this.is(";");
      }
    }
    this.restore(m);
    return ok;
  }

  /** The implicitly declared class the top-level members go in. */
  private implicitClass(): i32 {
    const t = this.t;
    const c = t.node(N_CLASS, this.pos());
    t.op[c] = CK_CLASS;
    t.flags[c] = FL_IMPLICIT;
    const bm = t.node(N_MODIFIERS, -1);
    t.a[bm] = t.empty();
    t.end[bm] = -1;
    t.a[c] = bm;
    t.b[c] = t.empty();
    t.d[c] = t.empty();
    t.e[c] = t.empty();
    t.g[c] = t.empty();
    return c;
  }

  private importDecl(): i32 {
    const t = this.t;
    const n = t.node(N_IMPORT, this.pos());
    this.next();
    if (this.is("static")) {
      this.next();
      t.flags[n] = FL_STATIC;
    }
    t.a[n] = this.qualident(true);
    this.expect(";");
    return this.finish(n);
  }

  /** a.b.c (with `.*` when `star`): identifiers and member selects. */
  private qualident(star: boolean): i32 {
    const t = this.t;
    const start = this.pos();
    let e = t.node(N_IDENTIFIER, start);
    t.name[e] = this.ident();
    this.finish(e);
    while (this.is(".") && (this.kindAt(1) === JK_IDENT || (star && this.isAt(1, "*")))) {
      this.next();
      const s = t.node(N_MEMBER_SELECT, start);
      t.a[s] = e;
      if (star && this.is("*")) {
        t.name[s] = this.tokAt(0);
        this.next();
      } else {
        t.name[s] = this.ident();
      }
      e = this.finish(s);
    }
    return e;
  }

  private looksLikeModule(): boolean {
    let i = 0;
    // Skip annotations roughly.
    while (this.isAt(i, "@")) {
      i++;
      while (this.kindAt(i) === JK_IDENT || this.isAt(i, ".")) {
        i++;
      }
      if (this.isAt(i, "(")) {
        let depth = 0;
        while (this.p + i < this.nT - 1) {
          if (this.isAt(i, "(")) {
            depth++;
          } else if (this.isAt(i, ")")) {
            depth--;
            if (depth === 0) {
              i++;
              break;
            }
          }
          i++;
        }
      }
    }
    if (this.isAt(i, "open")) {
      i++;
    }
    return this.isAt(i, "module") && this.kindAt(i + 1) === JK_IDENT;
  }

  private moduleDecl(): i32 {
    const t = this.t;
    const n = t.node(N_MODULE, this.pos());
    const am = t.mark();
    while (this.is("@")) {
      t.push(this.annotation());
    }
    t.a[n] = t.list(am);
    if (this.is("open")) {
      t.flags[n] = FL_OPEN_MODULE;
      this.next();
    }
    this.expect("module");
    t.b[n] = this.qualident(false);
    this.expect("{");
    const dm = t.mark();
    while (!this.is("}") && !this.atEof() && !this.err) {
      const d0 = this.pos();
      if (this.is("requires")) {
        const d = t.node(N_REQUIRES, d0);
        this.next();
        while ((this.is("static") || this.is("transitive")) && !this.isAt(1, ";") && !this.isAt(1, ".")) {
          this.next();
        }
        t.a[d] = this.qualident(false);
        this.expect(";");
        t.push(this.finish(d));
      } else if (this.is("exports") || this.is("opens")) {
        const d = t.node(this.is("exports") ? N_EXPORTS : N_OPENS, d0);
        this.next();
        t.a[d] = this.qualident(false);
        if (this.is("to")) {
          this.next();
          t.b[d] = this.qualidentList();
        }
        this.expect(";");
        t.push(this.finish(d));
      } else if (this.is("provides")) {
        const d = t.node(N_PROVIDES, d0);
        this.next();
        t.a[d] = this.qualident(false);
        this.expect("with");
        t.b[d] = this.qualidentList();
        this.expect(";");
        t.push(this.finish(d));
      } else if (this.is("uses")) {
        const d = t.node(N_USES, d0);
        this.next();
        t.a[d] = this.qualident(false);
        this.expect(";");
        t.push(this.finish(d));
      } else {
        this.fail();
      }
    }
    t.c[n] = t.list(dm);
    this.expect("}");
    return this.finish(n);
  }

  // ---- Modifiers and annotations ---------------------------------------------

  private isModifierWord(): boolean {
    if (this.kindAt(0) !== JK_IDENT) {
      return false;
    }
    const inp = this.inp;
    const t = this.tokAt(0);
    if (
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
      inp.is(t, "strictfp")
    ) {
      // `synchronized (` is a statement; `static {` an initializer.
      if (inp.is(t, "synchronized") && this.isAt(1, "(")) {
        return false;
      }
      return true;
    }
    if (inp.is(t, "default")) {
      return !this.isAt(1, ":") && !this.op2At(1, "-", ">");
    }
    // javac's modifiersOpt asks isSealedClassStart(false) and
    // isNonSealedClassStart(false), in a block as well: otherwise the word is
    // an identifier (`sealed int x;` is a field of type `sealed`).
    return this.isSealedOrNonSealedClassStart(false);
  }

  /** javac's isSealedClassStart(local) or isNonSealedClassStart(local) at the current token. */
  private isSealedOrNonSealedClassStart(local: boolean): boolean {
    if (this.is("sealed")) {
      return this.allowedAfterSealedOrNonSealed(1, local, false);
    }
    return this.isNonSealedAt(0) && this.allowedAfterSealedOrNonSealed(3, local, true);
  }

  /** javac's isNonSealedIdentifier: `non-sealed` at token p+i, its three tokens adjacent. */
  private isNonSealedAt(i: i32): boolean {
    return this.op3At(i, "non", "-", "sealed");
  }

  /**
   * javac's allowedAfterSealedOrNonSealed: whether token p+i, after `sealed`
   * or `non-sealed`, makes that word a modifier of a class declaration
   * (`local`: of a local class).
   */
  private allowedAfterSealedOrNonSealed(i: i32, local: boolean, nonSealed: boolean): boolean {
    if (this.isAt(i, "@")) {
      return !this.isAt(i + 1, "interface") || nonSealed;
    }
    if (
      this.isAt(i, "abstract") ||
      this.isAt(i, "final") ||
      this.isAt(i, "strictfp") ||
      this.isAt(i, "class") ||
      this.isAt(i, "interface") ||
      this.isAt(i, "enum")
    ) {
      return true;
    }
    if (local) {
      return false;
    }
    if (this.isAt(i, "public") || this.isAt(i, "protected") || this.isAt(i, "private") || this.isAt(i, "static")) {
      return true;
    }
    return this.isNonSealedAt(i) || this.isAt(i, "sealed");
  }

  /** Modifiers and declaration annotations; the node's start is -1 when there are none. */
  modifiers(): i32 {
    const t = this.t;
    const n = t.node(N_MODIFIERS, -1);
    const am = t.mark();
    let any = false;
    // The modifier words seen, a bit per Modifier ordinal: javac's "repeated modifier".
    let seen = 0;
    while (!this.err) {
      if (this.is("@") && !this.isAt(1, "interface")) {
        if (!any) {
          t.start[n] = this.pos();
        }
        any = true;
        t.push(this.annotation());
      } else if (this.isModifierWord()) {
        if (!any) {
          t.start[n] = this.pos();
        }
        any = true;
        const non = this.is("non");
        const bit = 1 << (non ? RANK_NON_SEALED : modifierRank(this.inp, this.tokAt(0)));
        if ((seen & bit) !== 0) {
          this.rejected = true;
        }
        seen = seen | bit;
        if (non) {
          this.skip(3);
        } else {
          if (this.is("sealed")) {
            t.flags[n] = t.flags[n] | FL_MODS_SEALED;
          }
          this.next();
        }
      } else {
        break;
      }
    }
    t.a[n] = t.list(am);
    if (any) {
      this.finish(n);
    } else {
      t.end[n] = -1;
    }
    return n;
  }

  annotation(): i32 {
    const t = this.t;
    const n = t.node(N_ANNOTATION, this.pos());
    this.expect("@");
    t.a[n] = this.qualident(false);
    if (this.is("(")) {
      this.next();
      const am = t.mark();
      if (!this.is(")")) {
        if (this.isIdent() && this.isAt(1, "=") && !this.isAt(2, "=")) {
          while (!this.err) {
            const a0 = this.pos();
            const as = t.node(N_ASSIGNMENT, a0);
            const id = t.node(N_IDENTIFIER, a0);
            t.name[id] = this.ident();
            this.finish(id);
            t.a[as] = id;
            this.expect("=");
            t.b[as] = this.elementValue();
            t.push(this.finish(as));
            if (!this.accept(",")) {
              break;
            }
          }
        } else {
          t.push(this.elementValue());
        }
      }
      t.b[n] = t.list(am);
      this.expect(")");
    } else {
      t.b[n] = t.empty();
    }
    return this.finish(n);
  }

  private elementValue(): i32 {
    if (this.is("@")) {
      return this.annotation();
    }
    if (this.is("{")) {
      return this.arrayInit(-1, this.pos());
    }
    return this.conditional();
  }

  /** `{ a, b, }` as a NEW_ARRAY without a type. */
  private arrayInit(elemtype: i32, start: i32): i32 {
    const t = this.t;
    const n = t.node(N_NEW_ARRAY, start);
    t.a[n] = elemtype;
    t.b[n] = t.empty();
    t.d[n] = t.empty();
    t.e[n] = t.empty();
    this.expect("{");
    const im = t.mark();
    while (!this.is("}") && !this.err) {
      if (this.is("{")) {
        t.push(this.arrayInit(-1, this.pos()));
      } else if (this.is("@")) {
        t.push(this.annotation());
      } else {
        t.push(this.expression());
      }
      if (!this.accept(",")) {
        break;
      }
    }
    t.c[n] = t.list(im);
    this.expect("}");
    return this.finish(n);
  }

  // ---- Declarations ----------------------------------------------------------

  private isClassStart(): boolean {
    if (this.is("class") || this.is("interface") || this.is("enum")) {
      return true;
    }
    if (this.is("@") && this.isAt(1, "interface")) {
      return true;
    }
    return this.is("record") && this.kindAt(1) === JK_IDENT && (this.isAt(2, "(") || this.isAt(2, "<"));
  }

  /** A class, interface, enum, record or annotation type after its modifiers. */
  classDecl(mods: i32): i32 {
    const t = this.t;
    const start = t.start[mods] >= 0 ? t.start[mods] : this.pos();
    const n = t.node(N_CLASS, start);
    t.a[n] = mods;
    t.d[n] = t.empty();
    t.e[n] = t.empty();
    t.b[n] = t.empty();
    t.g[n] = t.empty();
    t.parent[mods] = n;
    if (this.is("class")) {
      t.op[n] = CK_CLASS;
      this.next();
      t.name[n] = this.typeName();
      if (this.is("<")) {
        t.b[n] = this.typeParameters();
      }
      if (this.accept("extends")) {
        t.c[n] = this.type();
      }
      if (this.accept("implements")) {
        t.d[n] = this.typeList();
      }
      t.e[n] = this.permitsClause(mods);
      t.f[n] = this.classBody(n);
    } else if (this.is("interface")) {
      t.op[n] = CK_INTERFACE;
      this.next();
      t.name[n] = this.typeName();
      if (this.is("<")) {
        t.b[n] = this.typeParameters();
      }
      if (this.accept("extends")) {
        t.d[n] = this.typeList();
      }
      t.e[n] = this.permitsClause(mods);
      t.f[n] = this.classBody(n);
    } else if (this.is("enum")) {
      t.op[n] = CK_ENUM;
      this.next();
      t.name[n] = this.typeName();
      if (this.accept("implements")) {
        t.d[n] = this.typeList();
      }
      t.f[n] = this.enumBody(n);
    } else if (this.is("@")) {
      t.op[n] = CK_ANNOTATION;
      this.skip(2);
      t.name[n] = this.typeName();
      t.f[n] = this.classBody(n);
    } else if (this.is("record")) {
      t.op[n] = CK_RECORD;
      this.next();
      t.name[n] = this.typeName();
      if (this.is("<")) {
        t.b[n] = this.typeParameters();
      }
      this.expect("(");
      const cm = t.mark();
      while (!this.is(")") && !this.err) {
        const v = this.formalParameter(false);
        t.flags[v] = t.flags[v] | FL_RECORD;
        t.push(v);
        if (!this.accept(",")) {
          break;
        }
      }
      t.g[n] = t.list(cm);
      this.expect(")");
      if (this.accept("implements")) {
        t.d[n] = this.typeList();
      }
      t.f[n] = this.classBody(n);
    } else {
      this.fail();
    }
    return this.finish(n);
  }

  /**
   * javac's permitsClause: `permits` and a qualidentList (names, not types:
   * no type arguments, annotations or restricted-name check). On a class or
   * interface that is not `sealed`, "invalid permits clause".
   */
  private permitsClause(mods: i32): i32 {
    const t = this.t;
    if (!this.is("permits")) {
      return t.empty();
    }
    if ((t.flags[mods] & FL_MODS_SEALED) === 0) {
      this.rejected = true;
    }
    this.next();
    return this.qualidentList();
  }

  /** javac's qualidentList(false): `a.B, C`, names without type arguments or annotations. */
  private qualidentList(): i32 {
    const t = this.t;
    const m = t.mark();
    t.push(this.qualident(false));
    while (this.accept(",") && !this.err) {
      t.push(this.qualident(false));
    }
    return t.list(m);
  }

  private typeList(): i32 {
    const t = this.t;
    const m = t.mark();
    t.push(this.type());
    while (this.accept(",") && !this.err) {
      t.push(this.type());
    }
    return t.list(m);
  }

  private typeParameters(): i32 {
    const t = this.t;
    this.expect("<");
    const m = t.mark();
    while (!this.err) {
      const am = t.mark();
      const start = this.pos();
      while (this.is("@")) {
        t.push(this.annotation());
      }
      const annos = t.list(am);
      const n = t.node(N_TYPE_PARAMETER, start);
      t.a[n] = annos;
      t.name[n] = this.typeName();
      const bm = t.mark();
      if (this.accept("extends")) {
        t.push(this.type());
        while (this.accept("&") && !this.err) {
          t.push(this.type());
        }
      }
      t.b[n] = t.list(bm);
      t.push(this.finish(n));
      if (!this.accept(",")) {
        break;
      }
    }
    this.expect(">");
    return t.list(m);
  }

  private classBody(cls: i32): i32 {
    const t = this.t;
    this.expect("{");
    const m = t.mark();
    while (!this.is("}") && !this.atEof() && !this.err) {
      if (this.is(";")) {
        this.next();
        continue;
      }
      this.member(cls);
    }
    this.expect("}");
    return t.list(m);
  }

  /** One member, pushed on the list stack (fields push one node per declarator). */
  private member(cls: i32): void {
    const t = this.t;
    if (this.is("{") || (this.is("static") && this.isAt(1, "{"))) {
      const b = t.node(N_BLOCK, this.pos());
      if (this.is("static")) {
        t.flags[b] = FL_STATIC;
        this.next();
      }
      t.a[b] = this.blockStats();
      t.push(this.finish(b));
      return;
    }
    const mods = this.modifiers();
    if (this.isClassStart()) {
      t.push(this.classDecl(mods));
      return;
    }
    const start = t.start[mods] >= 0 ? t.start[mods] : this.pos();
    let typarams = -1;
    if (this.is("<")) {
      typarams = this.typeParameters();
    }
    // A constructor: `Name(`, or a compact record constructor `Name {`.
    if (this.kindAt(0) === JK_IDENT && this.isAt(1, "(")) {
      // javac's constructorOrMethodOrFieldDeclaration parses the name as the
      // return type, unannotatedType(false): `var() {}` is "'var' is not allowed here".
      if (this.isRestrictedTypeName(this.tokAt(0))) {
        this.rejected = true;
      }
      t.push(this.method(mods, start, typarams, -1, true));
      return;
    }
    if (
      t.op[cls] === CK_RECORD &&
      this.kindAt(0) === JK_IDENT &&
      this.isAt(1, "{") &&
      this.inp.sameText(this.tokAt(0), t.name[cls])
    ) {
      const n = t.node(N_METHOD, start);
      t.a[n] = mods;
      t.b[n] = typarams >= 0 ? typarams : t.empty();
      t.flags[n] = FL_CTOR | FL_COMPACT_CTOR;
      t.name[n] = this.ident();
      t.d[n] = t.empty();
      t.f[n] = t.empty();
      t.g[n] = this.block();
      t.parent[mods] = n;
      t.push(this.finish(n));
      return;
    }
    const type = this.type();
    if (this.kindAt(0) === JK_IDENT && this.isAt(1, "(")) {
      t.push(this.method(mods, start, typarams, type, false));
      return;
    }
    // Fields.
    this.declarators(mods, start, type, true);
    this.expect(";");
  }

  /** Variable declarators after the type: `a = 1, b[] = {}`; pushes each VARIABLE. */
  private declarators(mods: i32, start: i32, type: i32, field: boolean): void {
    const t = this.t;
    while (!this.err) {
      const v = t.node(N_VARIABLE, start);
      t.a[v] = mods;
      t.name[v] = this.ident();
      if (type >= 0) {
        t.b[v] = this.bracketsOpt(type);
      } else if (this.is("[") || this.is("@")) {
        // `var x[]` (`var` is type -1): javac's variableDeclaratorRest, "'var'
        // is not allowed as an element type of an array".
        this.fail();
      } else {
        t.b[v] = -1;
      }
      if (this.accept("=")) {
        t.c[v] = this.is("{") ? this.arrayInit(-1, this.pos()) : this.expression();
      }
      t.push(this.finish(v));
      if (!this.is(",")) {
        break;
      }
      if (type < 0) {
        // `var x = 1, y = 2`: "'var' is not allowed in a compound declaration".
        this.fail();
        break;
      }
      this.next();
    }
  }

  private method(mods: i32, start: i32, typarams: i32, restype: i32, ctor: boolean): i32 {
    const t = this.t;
    const n = t.node(N_METHOD, start);
    t.a[n] = mods;
    t.parent[mods] = n;
    t.b[n] = typarams >= 0 ? typarams : t.empty();
    t.c[n] = restype;
    if (ctor) {
      t.flags[n] = FL_CTOR;
    }
    t.name[n] = this.ident();
    this.expect("(");
    const pm = t.mark();
    if (!this.is(")")) {
      while (!this.err) {
        const v = this.formalParameter(true);
        if (t.d[v] >= 0) {
          // A receiver parameter.
          t.e[n] = v;
        } else {
          t.push(v);
        }
        if (!this.accept(",")) {
          break;
        }
      }
    }
    t.d[n] = t.list(pm);
    this.expect(")");
    if (restype >= 0) {
      t.c[n] = this.bracketsOpt(restype);
    }
    if (this.accept("throws")) {
      const tm = t.mark();
      t.push(this.qualifiedType());
      while (this.accept(",") && !this.err) {
        t.push(this.qualifiedType());
      }
      t.f[n] = t.list(tm);
    } else {
      t.f[n] = t.empty();
    }
    if (this.is("{")) {
      t.g[n] = this.block();
    } else if (this.is("default")) {
      this.next();
      t.h[n] = this.elementValue();
      this.expect(";");
    } else {
      this.expect(";");
    }
    return this.finish(n);
  }

  /** A formal parameter; a receiver parameter sets slot d (its name expression). */
  private formalParameter(allowReceiver: boolean, allowVar: boolean = false): i32 {
    const t = this.t;
    const mods = this.modifiers();
    const start = t.start[mods] >= 0 ? t.start[mods] : this.pos();
    const v = t.node(N_VARIABLE, start);
    t.a[v] = mods;
    t.parent[mods] = v;
    this.allowVarType = allowVar;
    let type = this.type();
    let varAnnos = -1;
    if (this.is("@") && this.varargsAnnotationsAhead()) {
      const am = t.mark();
      while (this.is("@")) {
        t.push(this.annotation());
      }
      varAnnos = t.list(am);
    }
    if (this.op3(".", ".", ".")) {
      this.skip(3);
      const at = t.node(N_ARRAY_TYPE, t.start[type]);
      t.a[at] = type;
      type = this.finish(at);
      if (varAnnos >= 0) {
        const an = t.node(N_ANNOTATED_TYPE, t.start[type]);
        t.a[an] = varAnnos;
        t.b[an] = type;
        type = this.finish(an);
      }
      t.flags[v] = FL_VARARGS;
    }
    // A receiver: `Type this` or `Type Outer.this`.
    if (
      allowReceiver &&
      (this.is("this") || (this.kindAt(0) === JK_IDENT && this.isAt(1, ".") && this.isAt(2, "this")))
    ) {
      let ne = t.node(N_IDENTIFIER, this.pos());
      t.name[ne] = this.ident();
      this.finish(ne);
      if (this.is(".")) {
        this.next();
        const s = t.node(N_MEMBER_SELECT, t.start[ne]);
        t.a[s] = ne;
        t.name[s] = this.ident();
        ne = this.finish(s);
      }
      t.d[v] = ne;
      t.b[v] = type;
      t.name[v] = this.tokAt(-1);
      return this.finish(v);
    }
    t.name[v] = this.ident();
    t.b[v] = this.bracketsOpt(type);
    return this.finish(v);
  }

  private enumBody(cls: i32): i32 {
    const t = this.t;
    this.expect("{");
    const m = t.mark();
    // Constants.
    while (!this.is(";") && !this.is("}") && !this.err) {
      if (this.is(",")) {
        this.next();
        continue;
      }
      const mods = this.modifiers();
      const start = t.start[mods] >= 0 ? t.start[mods] : this.pos();
      const v = t.node(N_VARIABLE, start);
      t.a[v] = mods;
      t.parent[mods] = v;
      t.flags[v] = FL_ENUM;
      const nameTok = this.tokAt(0);
      t.name[v] = this.ident();
      const nc = t.node(N_NEW_CLASS, this.inp.tPos[nameTok]);
      t.b[nc] = t.empty();
      if (this.is("(")) {
        t.d[nc] = this.args();
      } else {
        t.d[nc] = t.empty();
      }
      if (this.is("{")) {
        const body = t.node(N_CLASS, this.pos());
        const bm = t.node(N_MODIFIERS, -1);
        t.a[bm] = t.empty();
        t.end[bm] = -1;
        t.a[body] = bm;
        t.b[body] = t.empty();
        t.d[body] = t.empty();
        t.e[body] = t.empty();
        t.g[body] = t.empty();
        t.f[body] = this.classBody(body);
        t.e[nc] = this.finish(body);
      }
      t.c[v] = this.finish(nc);
      t.push(this.finish(v));
      if (!this.accept(",")) {
        break;
      }
    }
    if (this.accept(";")) {
      while (!this.is("}") && !this.atEof() && !this.err) {
        if (this.is(";")) {
          this.next();
          continue;
        }
        this.member(cls);
      }
    }
    this.expect("}");
    return t.list(m);
  }

  // ---- Types -----------------------------------------------------------------

  private isPrimitive(i: i32): boolean {
    const inp = this.inp;
    const t = this.tokAt(i);
    return (
      inp.is(t, "int") ||
      inp.is(t, "long") ||
      inp.is(t, "boolean") ||
      inp.is(t, "double") ||
      inp.is(t, "float") ||
      inp.is(t, "char") ||
      inp.is(t, "byte") ||
      inp.is(t, "short") ||
      inp.is(t, "void")
    );
  }

  /**
   * A type, as javac's unannotatedType: a restricted name (`var`, `yield`,
   * `record`, `sealed`, `permits`), looked through array types, is "not
   * allowed here", except `var` where the caller set `allowVarType` (an
   * explicit lambda parameter). Nested types never allow it.
   */
  type(): i32 {
    const allowVar = this.allowVarType;
    this.allowVarType = false;
    const ty = this.typeAnnotated();
    if (!this.err) {
      const w = this.restrictedTypeName(ty);
      if (w >= 0 && (!allowVar || !this.inp.is(w, "var"))) {
        // Not this.fail(): a lookahead that parses a type here must still
        // succeed, as javac's does, and the file fails once the parse
        // keeps the type (Mark drops the flag with a lookahead).
        this.rejected = true;
      }
    }
    return ty;
  }

  /** javac's restrictedTypeNameStartingAtSource, at source 21: `var`, `yield`, `record`, `sealed`, `permits`. */
  private isRestrictedTypeName(w: i32): boolean {
    const inp = this.inp;
    return inp.is(w, "var") || inp.is(w, "yield") || inp.is(w, "record") || inp.is(w, "sealed") || inp.is(w, "permits");
  }

  /** javac's restrictedTypeName: the restricted name (its tok) a type is, looked through array types, or -1. */
  private restrictedTypeName(ty: i32): i32 {
    let e = ty;
    while (this.t.kind[e] === N_ARRAY_TYPE) {
      e = this.t.a[e];
    }
    if (this.t.kind[e] === N_IDENTIFIER && this.t.name[e] >= 0 && this.isRestrictedTypeName(this.t.name[e])) {
      return this.t.name[e];
    }
    return -1;
  }

  /** javac's typeName(): a declared class or type parameter name, which a restricted name may not be. */
  private typeName(): i32 {
    const w = this.ident();
    if (!this.err && this.isRestrictedTypeName(w)) {
      this.rejected = true;
    }
    return w;
  }

  allowVarType: boolean = false;
  // javac reported an error and parsed on: a restricted name as a type ("'var'
  // is not allowed here"), a declared name or a constructor-shaped member's
  // name, a `permits` clause without `sealed`, an unqualified `yield(...)`, a
  // repeated modifier, a sealed or non-sealed local class, annotations before
  // an expression that is not a method reference. The file fails once the parse keeps
  // that tree; a lookahead that restores a Mark drops the flag with it.
  rejected: boolean = false;

  /** A type with dims; annotations before it become an ANNOTATED_TYPE. */
  private typeAnnotated(): i32 {
    const t = this.t;
    if (this.is("@")) {
      const start = this.pos();
      const am = t.mark();
      while (this.is("@")) {
        t.push(this.annotation());
      }
      const annos = t.list(am);
      const under = this.typeNoDims();
      const at = t.node(N_ANNOTATED_TYPE, start);
      t.a[at] = annos;
      t.b[at] = under;
      this.finish(at);
      if (t.kind[under] === N_MEMBER_SELECT) {
        t.start[at] = t.start[under];
      }
      return this.bracketsOpt(at);
    }
    return this.bracketsOpt(this.typeNoDims());
  }

  private typeNoDims(): i32 {
    const t = this.t;
    if (this.isPrimitive(0)) {
      const n = t.node(N_PRIMITIVE_TYPE, this.pos());
      t.name[n] = this.tokAt(0);
      this.next();
      return this.finish(n);
    }
    if (this.is("?")) {
      const n = t.node(N_WILDCARD, this.pos());
      this.next();
      if (this.accept("extends")) {
        t.op[n] = 1;
        t.a[n] = this.type();
      } else if (this.accept("super")) {
        t.op[n] = 2;
        t.a[n] = this.type();
      }
      return this.finish(n);
    }
    return this.qualifiedType();
  }

  /** A class type: `a.b.C<T>.D<U>`, with type annotations between parts. */
  qualifiedType(): i32 {
    const t = this.t;
    const start = this.pos();
    // A reserved word is javac's "illegal start of type" (`return` in a record
    // body that was a method `record f() { return null; }`).
    if (!this.isIdent()) {
      this.fail();
      return t.node(N_IDENTIFIER, start);
    }
    let e = t.node(N_IDENTIFIER, start);
    t.name[e] = this.ident();
    this.finish(e);
    if (this.is("<")) {
      e = this.typeArgsOn(e, start);
    }
    while (this.is(".") && !this.err) {
      // Stop before `.class`, `.this`, `...` and the like.
      if (this.isAt(1, ".")) {
        break;
      }
      if (this.isAt(1, "@")) {
        this.next();
        const am = t.mark();
        while (this.is("@")) {
          t.push(this.annotation());
        }
        const annos = t.list(am);
        const s = t.node(N_MEMBER_SELECT, start);
        t.a[s] = e;
        t.name[s] = this.ident();
        this.finish(s);
        const at = t.node(N_ANNOTATED_TYPE, start);
        t.a[at] = annos;
        t.b[at] = s;
        e = this.finish(at);
      } else if (
        this.kindAt(1) === JK_IDENT &&
        !this.isAt(1, "class") &&
        !this.isAt(1, "this") &&
        !this.isAt(1, "new") &&
        !this.isAt(1, "super")
      ) {
        this.next();
        const s = t.node(N_MEMBER_SELECT, start);
        t.a[s] = e;
        t.name[s] = this.ident();
        e = this.finish(s);
      } else {
        break;
      }
      if (this.is("<")) {
        e = this.typeArgsOn(e, start);
      }
    }
    return e;
  }

  private typeArgsOn(base: i32, start: i32): i32 {
    const t = this.t;
    const pt = t.node(N_PARAMETERIZED_TYPE, start);
    t.a[pt] = base;
    t.b[pt] = this.typeArgs();
    return this.finish(pt);
  }

  /** `<A, ? extends B>` or `<>`. */
  typeArgs(): i32 {
    const t = this.t;
    this.expect("<");
    const m = t.mark();
    if (!this.is(">")) {
      while (!this.err) {
        t.push(this.type());
        if (!this.accept(",")) {
          break;
        }
      }
    }
    this.expect(">");
    return t.list(m);
  }

  /** `[]` dims (with annotations) after a type. */
  bracketsOpt(type: i32): i32 {
    const t = this.t;
    let e = type;
    while (!this.err) {
      if (this.is("[") && this.isAt(1, "]")) {
        this.skip(2);
        const at = t.node(N_ARRAY_TYPE, t.start[type]);
        t.a[at] = e;
        e = this.finish(at);
      } else if (this.is("@") && this.annotatedDimAhead()) {
        const am = t.mark();
        while (this.is("@")) {
          t.push(this.annotation());
        }
        const annos = t.list(am);
        this.expect("[");
        this.expect("]");
        const at = t.node(N_ARRAY_TYPE, t.start[type]);
        t.a[at] = e;
        this.finish(at);
        const an = t.node(N_ANNOTATED_TYPE, t.start[type]);
        t.a[an] = annos;
        t.b[an] = at;
        e = this.finish(an);
      } else {
        break;
      }
    }
    return e;
  }

  /** Whether annotations here are followed by `...`. */
  private varargsAnnotationsAhead(): boolean {
    const m = new Mark();
    this.save(m);
    while (this.is("@") && !this.err) {
      this.annotation();
    }
    const ok = !this.err && this.op3(".", ".", ".");
    this.restore(m);
    return ok;
  }

  /** Whether annotations here are followed by `[`. */
  private annotatedDimAhead(): boolean {
    const m = new Mark();
    this.save(m);
    while (this.is("@") && !this.err) {
      this.annotation();
    }
    const ok = !this.err && this.is("[");
    this.restore(m);
    return ok;
  }

  // ---- Statements ------------------------------------------------------------

  block(): i32 {
    const t = this.t;
    const b = t.node(N_BLOCK, this.pos());
    t.a[b] = this.blockStats();
    return this.finish(b);
  }

  private blockStats(): i32 {
    const t = this.t;
    this.expect("{");
    const m = t.mark();
    while (!this.is("}") && !this.atEof() && !this.err) {
      this.blockStatement();
    }
    this.expect("}");
    return t.list(m);
  }

  /** One block statement, pushed (a declaration pushes one node per declarator). */
  private blockStatement(): void {
    const t = this.t;
    // Local classes and declarations with modifiers.
    if (
      this.is("final") ||
      this.is("abstract") ||
      this.is("static") ||
      this.is("strictfp") ||
      (this.is("@") && !this.isAt(1, "interface"))
    ) {
      const mods = this.modifiers();
      if (this.isClassStart()) {
        t.push(this.classDecl(mods));
        return;
      }
      this.localVariables(mods);
      this.expect(";");
      return;
    }
    if (this.isClassStart()) {
      const mods = this.modifiers();
      t.push(this.classDecl(mods));
      return;
    }
    // javac's blockStatement: isNonSealedClassStart(true) or
    // isSealedClassStart(true) is "sealed or non-sealed local classes are not
    // allowed", and the class is parsed on.
    if (this.isSealedOrNonSealedClassStart(true)) {
      this.rejected = true;
      t.push(this.classDecl(this.modifiers()));
      return;
    }
    if (this.isLocalVarDecl()) {
      const mods = this.modifiers();
      this.localVariables(mods);
      this.expect(";");
      return;
    }
    t.push(this.statement());
  }

  /** Declarators of a local variable after its modifiers; pushes each VARIABLE. */
  private localVariables(mods: i32): void {
    const t = this.t;
    const start = t.start[mods] >= 0 ? t.start[mods] : this.pos();
    let type = -1;
    if (this.is("var") && this.kindAt(1) === JK_IDENT && !this.isAt(1, "instanceof")) {
      this.next();
    } else {
      type = this.type();
    }
    this.declarators(mods, start, type, false);
  }

  /** Whether a local variable declaration starts here (javac's speculative check). */
  private isLocalVarDecl(): boolean {
    if (this.isPrimitive(0)) {
      // `int.class`, `int[].class` and `int[]::new` are expressions: javac's
      // term(EXPR | TYPE) leaves type mode at bracketsSuffix's `.class` or `::`.
      let i = 1;
      while (this.isAt(i, "[") && this.isAt(i + 1, "]")) {
        i += 2;
      }
      return !this.isAt(i, ".") && !this.op2At(i, ":", ":");
    }
    if (this.kindAt(0) !== JK_IDENT || isJavaKeyword(this.inp, this.tokAt(0))) {
      return false;
    }
    if (this.is("var") && this.kindAt(1) === JK_IDENT && !isJavaKeyword(this.inp, this.tokAt(1))) {
      return true;
    }
    if (this.is("yield") && this.isYieldStatement()) {
      return false;
    }
    // Quick rejections.
    const n1 = this.tokAt(1);
    const inp = this.inp;
    if (
      inp.is(n1, "=") ||
      inp.is(n1, "(") ||
      inp.is(n1, ";") ||
      inp.is(n1, ":") ||
      inp.is(n1, ")") ||
      inp.is(n1, "+") ||
      inp.is(n1, "-")
    ) {
      return false;
    }
    const m = new Mark();
    this.save(m);
    this.type();
    const ok =
      !this.err && this.kindAt(0) === JK_IDENT && !isJavaKeyword(this.inp, this.tokAt(0)) && this.declaratorFollows(1);
    this.restore(m);
    return ok;
  }

  /** What may follow a declared name. */
  private declaratorFollows(i: i32): boolean {
    return (
      this.isAt(i, "=") ||
      this.isAt(i, ";") ||
      this.isAt(i, ",") ||
      this.isAt(i, "[") ||
      this.isAt(i, ":") ||
      this.isAt(i, ")")
    );
  }

  private isYieldStatement(): boolean {
    const n1 = this.tokAt(1);
    const inp = this.inp;
    const k = inp.tKind[n1];
    if (k === JK_IDENT) {
      return !inp.is(n1, "instanceof");
    }
    if (k === JK_NUMBER || k === JK_STRING || k === JK_CHAR || k === JK_TEXT_BLOCK) {
      return true;
    }
    if (inp.is(n1, "+") || inp.is(n1, "-")) {
      // `yield++` / `yield--` are not statements; `yield -1` is.
      if (this.adjAt(2) && (this.isAt(2, "+") || this.isAt(2, "-")) && this.isAt(3, ";")) {
        return false;
      }
      return !this.isAt(2, "=");
    }
    if (inp.is(n1, "!") || inp.is(n1, "~")) {
      return true;
    }
    if (inp.is(n1, "(")) {
      // `yield(x);` is a call when what follows the `)` is not part of an expression.
      return true;
    }
    // javac's error recovery: `yield ;` is a yield statement, whose missing
    // expression is "illegal start of expression".
    return inp.is(n1, ";");
  }

  statement(): i32 {
    const t = this.t;
    const start = this.pos();
    if (this.is("{")) {
      return this.block();
    }
    if (this.is(";")) {
      const n = t.node(N_EMPTY, start);
      this.next();
      return this.finish(n);
    }
    if (this.is("if")) {
      const n = t.node(N_IF, start);
      this.next();
      t.a[n] = this.parExpression();
      t.b[n] = this.statement();
      if (this.accept("else")) {
        t.c[n] = this.statement();
      }
      return this.finish(n);
    }
    if (this.is("for")) {
      return this.forStatement();
    }
    if (this.is("while")) {
      const n = t.node(N_WHILE, start);
      this.next();
      t.a[n] = this.parExpression();
      t.b[n] = this.statement();
      return this.finish(n);
    }
    if (this.is("do")) {
      const n = t.node(N_DO_WHILE, start);
      this.next();
      t.a[n] = this.statement();
      this.expect("while");
      t.b[n] = this.parExpression();
      this.expect(";");
      return this.finish(n);
    }
    if (this.is("try")) {
      return this.tryStatement();
    }
    if (this.is("switch")) {
      const n = t.node(N_SWITCH, start);
      this.next();
      t.a[n] = this.parExpression();
      t.b[n] = this.switchBody(true);
      return this.finish(n);
    }
    if (this.is("synchronized")) {
      const n = t.node(N_SYNCHRONIZED, start);
      this.next();
      t.a[n] = this.parExpression();
      t.b[n] = this.block();
      return this.finish(n);
    }
    if (this.is("return")) {
      const n = t.node(N_RETURN, start);
      this.next();
      if (!this.is(";")) {
        t.a[n] = this.expression();
      }
      this.expect(";");
      return this.finish(n);
    }
    if (this.is("throw")) {
      const n = t.node(N_THROW, start);
      this.next();
      t.a[n] = this.expression();
      this.expect(";");
      return this.finish(n);
    }
    if (this.is("break") || this.is("continue")) {
      const n = t.node(this.is("break") ? N_BREAK : N_CONTINUE, start);
      this.next();
      if (this.kindAt(0) === JK_IDENT) {
        t.name[n] = this.ident();
      }
      this.expect(";");
      return this.finish(n);
    }
    if (this.is("assert")) {
      const n = t.node(N_ASSERT, start);
      this.next();
      t.a[n] = this.expression();
      if (this.accept(":")) {
        t.b[n] = this.expression();
      }
      this.expect(";");
      return this.finish(n);
    }
    if (this.is("yield") && this.isYieldStatement()) {
      const n = t.node(N_YIELD, start);
      this.next();
      t.a[n] = this.expression();
      this.expect(";");
      return this.finish(n);
    }
    if (this.isIdent() && this.isAt(1, ":") && !this.isAt(2, ":")) {
      const n = t.node(N_LABELED, start);
      t.name[n] = this.ident();
      this.next();
      t.a[n] = this.statement();
      return this.finish(n);
    }
    if (this.isClassStart()) {
      const mods = this.modifiers();
      return this.classDecl(mods);
    }
    const n = t.node(N_EXPRESSION_STATEMENT, start);
    t.a[n] = this.checkExprStat(this.expression());
    this.expect(";");
    return this.finish(n);
  }

  /**
   * javac's checkExprStat (TreeInfo.isExpressionStatement): an expression
   * statement is an assignment, `++` / `--`, a method call or a class instance
   * creation; anything else (`x;`, `int[].class;`, `(f());`) is "not a statement".
   */
  private checkExprStat(e: i32): i32 {
    const t = this.t;
    const k = t.kind[e];
    const ok =
      k === N_ASSIGNMENT ||
      k === N_COMPOUND_ASSIGNMENT ||
      k === N_METHOD_INVOCATION ||
      k === N_NEW_CLASS ||
      (k === N_UNARY &&
        (t.op[e] === OP_PREINC || t.op[e] === OP_PREDEC || t.op[e] === OP_POSTINC || t.op[e] === OP_POSTDEC));
    if (!ok) {
      this.rejected = true;
    }
    return e;
  }

  private parExpression(): i32 {
    const t = this.t;
    const n = t.node(N_PARENTHESIZED, this.pos());
    this.expect("(");
    t.a[n] = this.expression();
    this.expect(")");
    return this.finish(n);
  }

  private forStatement(): i32 {
    const t = this.t;
    const start = this.pos();
    this.next();
    this.expect("(");
    // Enhanced for: `for (mods Type name :`.
    if (this.isEnhancedFor()) {
      const n = t.node(N_ENHANCED_FOR, start);
      const mods = this.modifiers();
      const vs = t.start[mods] >= 0 ? t.start[mods] : this.pos();
      const v = t.node(N_VARIABLE, vs);
      t.a[v] = mods;
      t.parent[mods] = v;
      if (this.is("var") && this.kindAt(1) === JK_IDENT) {
        this.next();
      } else {
        t.b[v] = this.type();
      }
      t.name[v] = this.ident();
      t.b[v] = t.b[v] >= 0 ? this.bracketsOpt(t.b[v]) : -1;
      this.finish(v);
      t.a[n] = v;
      this.expect(":");
      t.b[n] = this.expression();
      this.expect(")");
      t.c[n] = this.statement();
      return this.finish(n);
    }
    const n = t.node(N_FOR, start);
    const im = t.mark();
    if (!this.is(";")) {
      if (this.is("final") || this.is("@") || this.isLocalVarDecl()) {
        const mods = this.modifiers();
        this.localVariables(mods);
      } else {
        while (!this.err) {
          const es = t.node(N_EXPRESSION_STATEMENT, this.pos());
          t.a[es] = this.checkExprStat(this.expression());
          t.push(this.finish(es));
          if (!this.accept(",")) {
            break;
          }
        }
      }
    }
    t.a[n] = t.list(im);
    this.expect(";");
    if (!this.is(";")) {
      t.b[n] = this.expression();
    }
    this.expect(";");
    const um = t.mark();
    if (!this.is(")")) {
      while (!this.err) {
        const es = t.node(N_EXPRESSION_STATEMENT, this.pos());
        t.a[es] = this.checkExprStat(this.expression());
        t.push(this.finish(es));
        if (!this.accept(",")) {
          break;
        }
      }
    }
    t.c[n] = t.list(um);
    this.expect(")");
    t.d[n] = this.statement();
    return this.finish(n);
  }

  private isEnhancedFor(): boolean {
    const m = new Mark();
    this.save(m);
    this.modifiers();
    let ok = false;
    if (this.is("var") && this.kindAt(1) === JK_IDENT) {
      this.next();
      this.next();
      ok = this.is(":");
    } else {
      this.type();
      if (!this.err && this.kindAt(0) === JK_IDENT) {
        this.next();
        while (this.is("[") && this.isAt(1, "]")) {
          this.skip(2);
        }
        ok = !this.err && this.is(":");
      }
    }
    this.restore(m);
    return ok;
  }

  private tryStatement(): i32 {
    const t = this.t;
    const n = t.node(N_TRY, this.pos());
    this.next();
    const rm = t.mark();
    if (this.accept("(")) {
      while (!this.is(")") && !this.err) {
        if (this.is("final") || this.is("@") || this.isLocalVarDecl()) {
          const mods = this.modifiers();
          const start = t.start[mods] >= 0 ? t.start[mods] : this.pos();
          const v = t.node(N_VARIABLE, start);
          t.a[v] = mods;
          t.parent[mods] = v;
          if (this.is("var") && this.kindAt(1) === JK_IDENT) {
            this.next();
          } else {
            t.b[v] = this.type();
          }
          t.name[v] = this.ident();
          this.expect("=");
          t.c[v] = this.expression();
          t.push(this.finish(v));
        } else {
          t.push(this.expression());
        }
        if (!this.accept(";")) {
          break;
        }
      }
      this.expect(")");
    }
    t.a[n] = t.list(rm);
    t.b[n] = this.block();
    const cm = t.mark();
    while (this.is("catch") && !this.err) {
      const c = t.node(N_CATCH, this.pos());
      this.next();
      this.expect("(");
      const mods = this.modifiers();
      const start = t.start[mods] >= 0 ? t.start[mods] : this.pos();
      const v = t.node(N_VARIABLE, start);
      t.a[v] = mods;
      t.parent[mods] = v;
      const first = this.type();
      if (this.is("|")) {
        const u = t.node(N_UNION_TYPE, t.start[first]);
        const um = t.mark();
        t.push(first);
        while (this.accept("|") && !this.err) {
          t.push(this.type());
        }
        t.a[u] = t.list(um);
        t.b[v] = this.finish(u);
      } else {
        t.b[v] = first;
      }
      t.name[v] = this.ident();
      t.a[c] = this.finish(v);
      this.expect(")");
      t.b[c] = this.block();
      t.push(this.finish(c));
    }
    t.c[n] = t.list(cm);
    if (this.accept("finally")) {
      t.d[n] = this.block();
    }
    return this.finish(n);
  }

  /** A switch's `{ cases }`; `statement`: a switch statement's, not a switch expression's. */
  private switchBody(statement: boolean): i32 {
    const t = this.t;
    this.expect("{");
    const m = t.mark();
    while (!this.is("}") && !this.atEof() && !this.err) {
      t.push(this.switchCase(statement));
    }
    this.expect("}");
    return t.list(m);
  }

  private switchCase(statement: boolean): i32 {
    const t = this.t;
    const n = t.node(N_CASE, this.pos());
    const lm = t.mark();
    if (this.is("default")) {
      const d = t.node(N_DEFAULT_CASE_LABEL, this.pos());
      this.next();
      t.push(this.finish(d));
    } else {
      this.expect("case");
      while (!this.err) {
        t.push(this.caseLabel());
        if (!this.accept(",")) {
          break;
        }
      }
    }
    t.a[n] = t.list(lm);
    if (this.is("when")) {
      this.next();
      t.b[n] = this.expression();
    }
    if (this.op2("-", ">")) {
      this.skip(2);
      t.flags[n] = FL_RULE;
      const sm = t.mark();
      if (this.is("{")) {
        const b = this.block();
        t.d[n] = b;
        t.push(b);
      } else if (this.is("throw")) {
        const s = this.statement();
        t.d[n] = s;
        t.push(s);
      } else {
        const e = this.expression();
        // A switch statement's rule body is javac's parseStatementAsBlock, an
        // expression statement; a switch expression's is the case's value.
        if (statement) {
          this.checkExprStat(e);
        }
        t.d[n] = e;
        this.expect(";");
      }
      t.c[n] = t.list(sm);
    } else {
      this.expect(":");
      const sm = t.mark();
      while (
        !this.is("case") &&
        !(this.is("default") && (this.isAt(1, ":") || this.op2At(1, "-", ">"))) &&
        !this.is("}") &&
        !this.atEof() &&
        !this.err
      ) {
        this.blockStatement();
      }
      t.c[n] = t.list(sm);
    }
    return this.finish(n);
  }

  private caseLabel(): i32 {
    const t = this.t;
    const start = this.pos();
    if (this.is("default")) {
      const d = t.node(N_DEFAULT_CASE_LABEL, start);
      this.next();
      return this.finish(d);
    }
    if (this.isPatternStart()) {
      const l = t.node(N_PATTERN_CASE_LABEL, start);
      t.a[l] = this.pattern();
      return this.finish(l);
    }
    const l = t.node(N_CONSTANT_CASE_LABEL, start);
    t.a[l] = this.conditional();
    return this.finish(l);
  }

  /** Whether a type pattern or record pattern starts here. */
  private isPatternStart(): boolean {
    if (this.is("_") && (this.isAt(1, ",") || this.isAt(1, ":") || this.op2At(1, "-", ">") || this.isAt(1, ")"))) {
      return true;
    }
    if (this.is("final") || this.is("@")) {
      return true;
    }
    const m = new Mark();
    this.save(m);
    let ok = false;
    if (this.is("var") && this.kindAt(1) === JK_IDENT) {
      ok = true;
    } else {
      this.type();
      ok = !this.err && ((this.kindAt(0) === JK_IDENT && !isJavaKeyword(this.inp, this.tokAt(0))) || this.is("("));
    }
    this.restore(m);
    return ok;
  }

  /** A binding, record or any pattern. */
  private pattern(nested: boolean = false): i32 {
    const t = this.t;
    const start = this.pos();
    if (this.is("_") && !this.isAt(1, "(") && this.kindAt(1) !== JK_IDENT) {
      const a = t.node(N_ANY_PATTERN, start);
      this.next();
      return this.finish(a);
    }
    const mods = this.modifiers();
    const vstart = t.start[mods] >= 0 ? t.start[mods] : this.pos();
    let type = -1;
    if (this.is("var") && this.kindAt(1) === JK_IDENT) {
      // `var` types only a record pattern's components: "'var' is not allowed here".
      if (!nested) {
        this.fail();
      }
      this.next();
    } else {
      type = this.type();
    }
    if (this.is("(")) {
      const d = t.node(N_DECONSTRUCTION_PATTERN, vstart);
      t.a[d] = type;
      this.next();
      const pm = t.mark();
      while (!this.is(")") && !this.err) {
        t.push(this.pattern(true));
        if (!this.accept(",")) {
          break;
        }
      }
      t.b[d] = t.list(pm);
      this.expect(")");
      return this.finish(d);
    }
    const b = t.node(N_BINDING_PATTERN, vstart);
    const v = t.node(N_VARIABLE, vstart);
    t.a[v] = mods;
    t.parent[mods] = v;
    t.b[v] = type;
    t.name[v] = this.ident();
    this.finish(v);
    t.a[b] = v;
    return this.finish(b);
  }

  // ---- Expressions -----------------------------------------------------------

  expression(): i32 {
    if (this.isLambdaStart()) {
      return this.lambda();
    }
    const t = this.t;
    const lhs = this.conditional();
    const op = this.assignOp();
    if (op === 0) {
      return lhs;
    }
    const n = t.node(op === -1 ? N_ASSIGNMENT : N_COMPOUND_ASSIGNMENT, t.start[lhs]);
    t.op[n] = op === -1 ? 0 : op;
    this.skip(this.assignOpLen);
    t.a[n] = lhs;
    t.b[n] = this.expression();
    return this.finish(n);
  }

  assignOpLen: i32 = 0;

  /** -1 for `=`, an OP_* for a compound assignment, 0 for none; sets assignOpLen. */
  private assignOp(): i32 {
    if (this.is("=") && !(this.isAt(1, "=") && this.adjAt(1))) {
      this.assignOpLen = 1;
      return -1;
    }
    const pairs = this.isAt(1, "=") && this.adjAt(1);
    if (pairs) {
      this.assignOpLen = 2;
      if (this.is("+")) return OP_PLUS;
      if (this.is("-")) return OP_MINUS;
      if (this.is("*")) return OP_MUL;
      if (this.is("/")) return OP_DIV;
      if (this.is("%")) return OP_MOD;
      if (this.is("&")) return OP_BITAND;
      if (this.is("|")) return OP_BITOR;
      if (this.is("^")) return OP_BITXOR;
    }
    if (this.op3("<", "<", "=")) {
      this.assignOpLen = 3;
      return OP_SL;
    }
    if (this.op3(">", ">", "=")) {
      this.assignOpLen = 3;
      return OP_SR;
    }
    if (this.op3(">", ">", ">") && this.isAt(3, "=") && this.adjAt(3)) {
      this.assignOpLen = 4;
      return OP_USR;
    }
    return 0;
  }

  private isLambdaStart(): boolean {
    if (this.isIdent() && this.op2At(1, "-", ">")) {
      return true;
    }
    if (this.is("_") && this.op2At(1, "-", ">")) {
      return true;
    }
    if (!this.is("(")) {
      return false;
    }
    // The matching paren followed by `->`.
    let depth = 0;
    let i = 0;
    while (this.p + i < this.nT - 1) {
      if (this.isAt(i, "(")) {
        depth++;
      } else if (this.isAt(i, ")")) {
        depth--;
        if (depth === 0) {
          return this.op2At(i + 1, "-", ">");
        }
      } else if (this.isAt(i, ";") || this.isAt(i, "{") || this.isAt(i, "}")) {
        return false;
      }
      i++;
    }
    return false;
  }

  private lambda(): i32 {
    const t = this.t;
    const n = t.node(N_LAMBDA, this.pos());
    const pm = t.mark();
    if (this.is("(")) {
      this.next();
      // javac: the parameters are all `var`, or none is ("invalid lambda
      // parameter declaration").
      let nVar = 0;
      let nOther = 0;
      while (!this.is(")") && !this.err) {
        const explicit = !(this.kindAt(0) === JK_IDENT && (this.isAt(1, ",") || this.isAt(1, ")")));
        if (explicit) {
          const p = this.formalParameter(false, true);
          const ty = t.b[p];
          // javac's lambdaExpressionOrStatement: a restricted type with array
          // brackets, `var[] x` or `var x[]`, is "not allowed as an element type of an array".
          if (ty >= 0 && t.kind[ty] === N_ARRAY_TYPE && this.restrictedTypeName(ty) >= 0) {
            this.rejected = true;
          }
          if (ty >= 0 && t.kind[ty] === N_IDENTIFIER && this.inp.is(t.name[ty], "var")) {
            nVar++;
          } else {
            nOther++;
          }
          t.push(p);
        } else {
          nOther++;
          const v = t.node(N_VARIABLE, this.pos());
          const mods = t.node(N_MODIFIERS, -1);
          t.a[mods] = t.empty();
          t.end[mods] = -1;
          t.a[v] = mods;
          t.parent[mods] = v;
          t.name[v] = this.ident();
          t.push(this.finish(v));
        }
        if (!this.accept(",")) {
          break;
        }
      }
      if (nVar > 0 && nOther > 0) {
        this.fail();
      }
      this.expect(")");
    } else {
      const v = t.node(N_VARIABLE, this.pos());
      const mods = t.node(N_MODIFIERS, -1);
      t.a[mods] = t.empty();
      t.end[mods] = -1;
      t.a[v] = mods;
      t.parent[mods] = v;
      t.name[v] = this.ident();
      t.push(this.finish(v));
    }
    t.a[n] = t.list(pm);
    if (!this.op2("-", ">")) {
      this.fail();
    }
    this.skip(2);
    if (this.is("{")) {
      t.flags[n] = FL_STATEMENT_BODY;
      t.b[n] = this.block();
    } else {
      t.b[n] = this.expression();
    }
    return this.finish(n);
  }

  conditional(): i32 {
    const t = this.t;
    const c = this.binary(4);
    if (!this.is("?")) {
      return c;
    }
    const n = t.node(N_CONDITIONAL, t.start[c]);
    this.next();
    t.a[n] = c;
    t.b[n] = this.isLambdaStart() ? this.lambda() : this.expression();
    this.expect(":");
    t.c[n] = this.isLambdaStart() ? this.lambda() : this.conditional();
    return this.finish(n);
  }

  binOpLen: i32 = 0;

  /** The binary operator here and its precedence; 0 when none. Sets binOpLen. */
  private binOp(): i32 {
    if (this.is("|")) {
      if (this.op2("|", "|")) {
        this.binOpLen = 2;
        return OP_OR;
      }
      if (this.op2("|", "=")) {
        return 0;
      }
      this.binOpLen = 1;
      return OP_BITOR;
    }
    if (this.is("&")) {
      if (this.op2("&", "&")) {
        this.binOpLen = 2;
        return OP_AND;
      }
      if (this.op2("&", "=")) {
        return 0;
      }
      this.binOpLen = 1;
      return OP_BITAND;
    }
    if (this.is("^")) {
      if (this.op2("^", "=")) {
        return 0;
      }
      this.binOpLen = 1;
      return OP_BITXOR;
    }
    if (this.is("=") && this.op2("=", "=")) {
      this.binOpLen = 2;
      return OP_EQ;
    }
    if (this.is("!") && this.op2("!", "=")) {
      this.binOpLen = 2;
      return OP_NE;
    }
    if (this.is("<")) {
      if (this.op2("<", "<")) {
        if (this.op3("<", "<", "=")) {
          return 0;
        }
        this.binOpLen = 2;
        return OP_SL;
      }
      if (this.op2("<", "=")) {
        this.binOpLen = 2;
        return OP_LE;
      }
      this.binOpLen = 1;
      return OP_LT;
    }
    if (this.is(">")) {
      if (this.op2(">", ">")) {
        if (this.op3(">", ">", ">")) {
          if (this.isAt(3, "=") && this.adjAt(3)) {
            return 0;
          }
          this.binOpLen = 3;
          return OP_USR;
        }
        if (this.op3(">", ">", "=")) {
          return 0;
        }
        this.binOpLen = 2;
        return OP_SR;
      }
      if (this.op2(">", "=")) {
        this.binOpLen = 2;
        return OP_GE;
      }
      this.binOpLen = 1;
      return OP_GT;
    }
    if (this.is("+") || this.is("-")) {
      if (this.isAt(1, "=") && this.adjAt(1)) {
        return 0;
      }
      if (this.op2("-", ">")) {
        return 0;
      }
      this.binOpLen = 1;
      return this.is("+") ? OP_PLUS : OP_MINUS;
    }
    if (this.is("*") || this.is("/") || this.is("%")) {
      if (this.isAt(1, "=") && this.adjAt(1)) {
        return 0;
      }
      this.binOpLen = 1;
      return this.is("*") ? OP_MUL : this.is("/") ? OP_DIV : OP_MOD;
    }
    return 0;
  }

  /** Precedence climbing from `minPrec` (javac's term2Rest). */
  private binary(minPrec: i32): i32 {
    const t = this.t;
    let lhs = this.unary();
    while (!this.err) {
      if (this.is("instanceof")) {
        if (10 < minPrec) {
          break;
        }
        const n = t.node(N_INSTANCE_OF, t.start[lhs]);
        this.next();
        t.a[n] = lhs;
        if (this.is("final") || this.is("@")) {
          t.c[n] = this.pattern();
        } else {
          const m = new Mark();
          this.save(m);
          const ty = this.type();
          if (!this.err && (this.is("(") || (this.kindAt(0) === JK_IDENT && !isJavaKeyword(this.inp, this.tokAt(0))))) {
            this.restore(m);
            t.c[n] = this.pattern();
          } else {
            t.b[n] = ty;
          }
        }
        lhs = this.finish(n);
        continue;
      }
      const op = this.binOp();
      if (op === 0) {
        break;
      }
      const prec = precOf(op);
      if (prec < minPrec) {
        break;
      }
      this.skip(this.binOpLen);
      const rhs = this.binary(prec + 1);
      const n = t.node(N_BINARY, t.start[lhs]);
      t.op[n] = op;
      t.a[n] = lhs;
      t.b[n] = rhs;
      lhs = this.finish(n);
    }
    return lhs;
  }

  private unary(): i32 {
    const t = this.t;
    const start = this.pos();
    if (this.op2("+", "+") || this.op2("-", "-")) {
      const n = t.node(N_UNARY, start);
      t.op[n] = this.is("+") ? OP_PREINC : OP_PREDEC;
      this.skip(2);
      t.a[n] = this.unary();
      return this.finish(n);
    }
    if (this.is("+") || this.is("!") || this.is("~")) {
      const n = t.node(N_UNARY, start);
      t.op[n] = this.is("+") ? OP_POS : this.is("!") ? OP_NOT : OP_COMPL;
      this.next();
      t.a[n] = this.unary();
      return this.finish(n);
    }
    if (this.is("-")) {
      // A decimal int or long literal folds into a negative literal.
      const nk = this.kindAt(1);
      if (nk === JK_NUMBER && this.isDecimalIntegral(this.tokAt(1))) {
        this.next();
        const lit = this.literal();
        t.start[lit] = start;
        return this.postfix(this.selectors(lit));
      }
      const n = t.node(N_UNARY, start);
      t.op[n] = OP_NEG;
      this.next();
      t.a[n] = this.unary();
      return this.finish(n);
    }
    if (this.is("(")) {
      const cast = this.tryCast();
      if (cast >= 0) {
        return cast;
      }
    }
    return this.postfix(this.primaryWithSelectors());
  }

  private isDecimalIntegral(tok: i32): boolean {
    const inp = this.inp;
    const a = inp.tPos[tok];
    const e = inp.tEnd[tok];
    // javac scans a leading 0 as octal (radix 8), hex or binary: never radix 10.
    if (toI32(inp.src[a]) === 48) {
      return false;
    }
    for (let i = a; i < e; i++) {
      const c = toI32(inp.src[i]);
      if (c === 46 || c === 101 || c === 69 || c === 102 || c === 70 || c === 100 || c === 68) {
        return false;
      }
    }
    return true;
  }

  /** A cast at `(`, or -1 when this is not one (javac's analyzeParens). */
  private tryCast(): i32 {
    const t = this.t;
    const start = this.pos();
    const m = new Mark();
    this.save(m);
    this.next();
    if (this.isPrimitive(0)) {
      const ty = this.type();
      if (!this.err && this.is(")")) {
        this.next();
        const n = t.node(N_TYPE_CAST, start);
        t.a[n] = ty;
        t.b[n] = this.unary();
        return this.finish(n);
      }
      this.restore(m);
      return -1;
    }
    if (this.kindAt(0) !== JK_IDENT && !this.is("@")) {
      this.restore(m);
      return -1;
    }
    let ty = this.type();
    if (!this.err && this.is("&")) {
      const it = t.node(N_INTERSECTION_TYPE, t.start[ty]);
      const im = t.mark();
      t.push(ty);
      while (this.accept("&") && !this.err) {
        t.push(this.type());
      }
      t.a[it] = t.list(im);
      ty = this.finish(it);
    }
    if (this.err || !this.is(")")) {
      this.restore(m);
      return -1;
    }
    // What may start the operand of a reference cast.
    const k = this.kindAt(1);
    let ok = false;
    if (k === JK_IDENT) {
      ok = !this.isAt(1, "instanceof");
    } else if (k === JK_NUMBER || k === JK_STRING || k === JK_CHAR || k === JK_TEXT_BLOCK) {
      ok = true;
    } else if (this.isAt(1, "(") || (this.isAt(1, "!") && !this.op2At(1, "!", "=")) || this.isAt(1, "~")) {
      ok = true;
    }
    if (!ok) {
      this.restore(m);
      return -1;
    }
    this.next();
    const n = t.node(N_TYPE_CAST, start);
    t.a[n] = ty;
    t.b[n] = this.isLambdaStart() ? this.lambda() : this.unary();
    return this.finish(n);
  }

  private postfix(e0: i32): i32 {
    const t = this.t;
    let e = e0;
    while ((this.op2("+", "+") || this.op2("-", "-")) && !this.err) {
      const n = t.node(N_UNARY, t.start[e]);
      t.op[n] = this.is("+") ? OP_POSTINC : OP_POSTDEC;
      this.skip(2);
      t.a[n] = e;
      e = this.finish(n);
    }
    return e;
  }

  private primaryWithSelectors(): i32 {
    return this.selectors(this.primary());
  }

  /** `.name`, `.name(...)`, `[i]`, `::name`, `.new`, `.<T>m()` after a primary. */
  private selectors(e0: i32): i32 {
    const t = this.t;
    let e = e0;
    while (!this.err) {
      if (this.is(".")) {
        if (this.isAt(1, "<")) {
          // .<T>method(args)
          this.next();
          const targs = this.typeArgs();
          const s = t.node(N_MEMBER_SELECT, t.start[e]);
          t.a[s] = e;
          t.name[s] = this.ident();
          this.finish(s);
          const mi = t.node(N_METHOD_INVOCATION, t.start[e]);
          t.a[mi] = targs;
          t.b[mi] = s;
          t.c[mi] = this.args();
          e = this.finish(mi);
          continue;
        }
        if (this.isAt(1, "new")) {
          this.next();
          e = this.creator(e);
          continue;
        }
        if (this.isAt(1, "@")) {
          // A type annotation in a qualified name: parse as a type.
          this.fail();
          break;
        }
        this.next();
        const s = t.node(N_MEMBER_SELECT, t.start[e]);
        t.a[s] = e;
        if (this.kindAt(0) === JK_IDENT) {
          t.name[s] = this.tokAt(0);
          this.next();
        } else {
          this.fail();
        }
        this.finish(s);
        if (this.is("(")) {
          const mi = t.node(N_METHOD_INVOCATION, t.start[e]);
          t.a[mi] = t.empty();
          t.b[mi] = s;
          t.c[mi] = this.args();
          e = this.finish(mi);
        } else {
          e = s;
        }
        continue;
      }
      if (this.is("[")) {
        this.next();
        const n = t.node(N_ARRAY_ACCESS, t.start[e]);
        t.a[n] = e;
        t.b[n] = this.expression();
        this.expect("]");
        e = this.finish(n);
        continue;
      }
      if (this.op2(":", ":")) {
        e = this.memberRef(e);
        continue;
      }
      break;
    }
    return e;
  }

  private memberRef(qual: i32): i32 {
    const t = this.t;
    const n = t.node(N_MEMBER_REFERENCE, t.start[qual]);
    t.a[n] = qual;
    this.skip(2);
    if (this.is("<")) {
      t.b[n] = this.typeArgs();
    }
    if (this.is("new")) {
      t.flags[n] = FL_NEW_REF;
      this.next();
    } else {
      t.name[n] = this.ident();
    }
    return this.finish(n);
  }

  args(): i32 {
    const t = this.t;
    this.expect("(");
    const m = t.mark();
    if (!this.is(")")) {
      while (!this.err) {
        t.push(this.expression());
        if (!this.accept(",")) {
          break;
        }
      }
    }
    this.expect(")");
    return t.list(m);
  }

  private literal(): i32 {
    const t = this.t;
    const tok = this.tokAt(0);
    const inp = this.inp;
    const n = t.node(N_LITERAL, this.pos());
    const k = inp.tKind[tok];
    if (k === JK_STRING || k === JK_TEXT_BLOCK) {
      t.op[n] = LIT_STRING;
    } else if (k === JK_CHAR) {
      t.op[n] = LIT_CHAR;
    } else if (k === JK_NUMBER) {
      t.op[n] = numberKind(inp, tok);
    } else if (inp.is(tok, "true") || inp.is(tok, "false")) {
      t.op[n] = LIT_BOOLEAN;
    } else {
      t.op[n] = LIT_NULL;
    }
    t.name[n] = tok;
    this.next();
    return this.finish(n);
  }

  primary(): i32 {
    const t = this.t;
    const start = this.pos();
    const k = this.kindAt(0);
    if (
      k === JK_NUMBER ||
      k === JK_STRING ||
      k === JK_CHAR ||
      k === JK_TEXT_BLOCK ||
      this.is("true") ||
      this.is("false") ||
      this.is("null")
    ) {
      return this.literal();
    }
    if (this.is("(")) {
      const n = t.node(N_PARENTHESIZED, start);
      this.next();
      t.a[n] = this.expression();
      this.expect(")");
      return this.finish(n);
    }
    if (this.is("new")) {
      return this.creator(-1);
    }
    if (this.is("switch")) {
      const n = t.node(N_SWITCH_EXPRESSION, start);
      this.next();
      t.a[n] = this.parExpression();
      t.b[n] = this.switchBody(false);
      return this.finish(n);
    }
    if (this.isPrimitive(0)) {
      // int.class, int[].class, int[]::new
      const ty = this.type();
      if (this.op2(":", ":")) {
        return ty;
      }
      if (this.is(".") && this.isAt(1, "class")) {
        this.next();
        const s = t.node(N_MEMBER_SELECT, start);
        t.a[s] = ty;
        t.name[s] = this.tokAt(0);
        this.next();
        return this.finish(s);
      }
      this.fail();
      return ty;
    }
    if (this.is("@")) {
      // An annotated type in expression position. javac's term3 (MONKEYS_AT,
      // EXPR mode) takes only a method reference after the annotations: a
      // class literal is "no annotations are allowed in the type of a class
      // literal" and anything else an illegal start of expression. On an
      // array type (`@A String[]::new`) javac drops the annotations, and
      // google-java-format fails ("did not generate token").
      const ty = this.type();
      if (!this.op2(":", ":") || t.kind[ty] === N_ARRAY_TYPE) {
        this.rejected = true;
      }
      return ty;
    }
    if (k === JK_IDENT) {
      // Generic type before `::`: `List<String>::new`. As in javac's term3, no
      // restricted-name check on a type in expression position (see below).
      if (this.isAt(1, "<")) {
        const m = new Mark();
        this.save(m);
        const ty = this.typeAnnotated();
        if (!this.err && this.op2(":", ":")) {
          return ty;
        }
        this.restore(m);
      }
      // Array type before `::` or `.class`: `String[]::new`, `String[].class`.
      // javac's bracketsSuffix, which does not check for a restricted name:
      // `var[].class` is a class literal.
      if (this.isAt(1, "[") && this.isAt(2, "]")) {
        const ty = this.typeAnnotated();
        if (this.is(".") && this.isAt(1, "class")) {
          this.next();
          const s = t.node(N_MEMBER_SELECT, start);
          t.a[s] = ty;
          t.name[s] = this.tokAt(0);
          this.next();
          return this.finish(s);
        }
        return ty;
      }
      // Qualified names with array types: a.b.C[].class
      const id = t.node(N_IDENTIFIER, start);
      t.name[id] = this.tokAt(0);
      this.next();
      this.finish(id);
      if (this.is("(")) {
        // javac's isInvalidUnqualifiedMethodIdentifier: "invalid use of a
        // restricted identifier 'yield'"; `this.yield(1)` and `A.yield(1)` are calls.
        if (this.inp.is(t.name[id], "yield")) {
          this.rejected = true;
        }
        const mi = t.node(N_METHOD_INVOCATION, start);
        t.a[mi] = t.empty();
        t.b[mi] = id;
        t.c[mi] = this.args();
        return this.finish(mi);
      }
      return this.qualifiedArrayType(id);
    }
    this.fail();
    return t.node(N_IDENTIFIER, start);
  }

  /** After an identifier: `a.b.C[].class`, `a.b.C[]::new`, else the identifier. */
  private qualifiedArrayType(id: i32): i32 {
    const t = this.t;
    // Look for `( . ident )* [ ]`.
    let i = 0;
    while (this.isAt(i, ".") && this.kindAt(i + 1) === JK_IDENT && !isJavaKeyword(this.inp, this.tokAt(i + 1))) {
      i += 2;
    }
    if (i > 0 && this.isAt(i, "[") && this.isAt(i + 1, "]")) {
      let e = id;
      for (let q = 0; q < i; q += 2) {
        this.next();
        const s = t.node(N_MEMBER_SELECT, t.start[id]);
        t.a[s] = e;
        t.name[s] = this.ident();
        e = this.finish(s);
      }
      const ty = this.bracketsOpt(e);
      if (this.is(".") && this.isAt(1, "class")) {
        this.next();
        const s = t.node(N_MEMBER_SELECT, t.start[id]);
        t.a[s] = ty;
        t.name[s] = this.tokAt(0);
        this.next();
        return this.finish(s);
      }
      return ty;
    }
    // A generic qualified type before `::`: a.b.C<T>::new.
    if (i > 0 && this.isAt(i, "<")) {
      const m = new Mark();
      this.save(m);
      let e = id;
      for (let q = 0; q < i; q += 2) {
        this.next();
        const s = t.node(N_MEMBER_SELECT, t.start[id]);
        t.a[s] = e;
        t.name[s] = this.ident();
        e = this.finish(s);
      }
      const pt = t.node(N_PARAMETERIZED_TYPE, t.start[id]);
      t.a[pt] = e;
      t.b[pt] = this.typeArgs();
      this.finish(pt);
      if (!this.err && this.op2(":", ":")) {
        return pt;
      }
      this.restore(m);
    }
    return id;
  }

  /** `new ...` (with an enclosing instance `encl` for `a.new Inner()`). */
  private creator(encl: i32): i32 {
    const t = this.t;
    const start = encl >= 0 ? t.start[encl] : this.pos();
    this.expect("new");
    let targs = -1;
    if (this.is("<")) {
      targs = this.typeArgs();
    }
    // The type, without dims.
    let ty = -1;
    let annos = -1;
    if (this.is("@")) {
      const am = t.mark();
      while (this.is("@")) {
        t.push(this.annotation());
      }
      annos = t.list(am);
    }
    if (this.isPrimitive(0)) {
      const p = t.node(N_PRIMITIVE_TYPE, this.pos());
      t.name[p] = this.tokAt(0);
      this.next();
      ty = this.finish(p);
    } else {
      ty = this.qualifiedType();
    }
    if (annos >= 0) {
      const at = t.node(N_ANNOTATED_TYPE, t.start[t.items[t.lStart[annos]]]);
      t.a[at] = annos;
      t.b[at] = ty;
      ty = this.finish(at);
      annos = -1;
    }
    if (this.is("[") || this.is("@")) {
      return this.arrayCreator(start, ty, annos);
    }
    const n = t.node(N_NEW_CLASS, start);
    t.a[n] = encl;
    t.b[n] = targs >= 0 ? targs : t.empty();
    t.c[n] = ty;
    t.d[n] = this.args();
    if (this.is("{")) {
      const body = t.node(N_CLASS, this.pos());
      const bm = t.node(N_MODIFIERS, -1);
      t.a[bm] = t.empty();
      t.end[bm] = -1;
      t.a[body] = bm;
      t.b[body] = t.empty();
      t.d[body] = t.empty();
      t.e[body] = t.empty();
      t.g[body] = t.empty();
      t.f[body] = this.classBody(body);
      t.e[n] = this.finish(body);
    }
    return this.finish(n);
  }

  private arrayCreator(start: i32, base: i32, annos0: i32): i32 {
    const t = this.t;
    const n = t.node(N_NEW_ARRAY, start);
    t.d[n] = annos0 >= 0 ? annos0 : t.empty();
    const dm = t.mark();
    let elem = base;
    let sawEmpty = false;
    let first = true;
    const dimAnnoLists: i32[] = [];
    while (!this.err) {
      let annos = -1;
      if (this.is("@")) {
        const am = t.mark();
        while (this.is("@")) {
          t.push(this.annotation());
        }
        annos = t.list(am);
      }
      if (!this.is("[")) {
        break;
      }
      if (this.isAt(1, "]")) {
        this.skip(2);
        if (first) {
          // `new int[] {...}` / `new int[][] {...}`: the first [] is the array's own.
          first = false;
          sawEmpty = true;
          continue;
        }
        const at = t.node(N_ARRAY_TYPE, t.start[base]);
        t.a[at] = elem;
        elem = this.finish(at);
        sawEmpty = true;
        continue;
      }
      if (sawEmpty) {
        this.fail();
        break;
      }
      first = false;
      dimAnnoLists.push(annos);
      this.next();
      t.push(this.expression());
      this.expect("]");
    }
    // The dims list holds the expressions pushed above (after dimAnnoMark).
    const dimsList = t.list(dm);
    t.b[n] = dimsList;
    const em = t.mark();
    for (const l of dimAnnoLists) {
      t.push(l >= 0 ? l : t.empty());
    }
    t.e[n] = t.list(em);
    t.a[n] = elem;
    if (this.is("{")) {
      const init = this.arrayInit(-1, this.pos());
      t.c[n] = t.c[init];
    }
    return this.finish(n);
  }
}

/** The literal kind of a number token. */
const numberKind = (inp: GInput, tok: i32): i32 => {
  const a = inp.tPos[tok];
  const e = inp.tEnd[tok];
  const last = toI32(inp.src[e - 1]);
  const hex = e - a >= 2 && toI32(inp.src[a]) === 48 && (toI32(inp.src[a + 1]) === 120 || toI32(inp.src[a + 1]) === 88);
  if (last === 108 || last === 76) {
    return LIT_LONG;
  }
  if (!hex && (last === 102 || last === 70)) {
    return LIT_FLOAT;
  }
  if (!hex && (last === 100 || last === 68)) {
    return LIT_DOUBLE;
  }
  for (let i = a; i < e; i++) {
    const c = toI32(inp.src[i]);
    if (c === 46 || (!hex && (c === 101 || c === 69)) || (hex && (c === 112 || c === 80))) {
      return LIT_DOUBLE;
    }
  }
  return LIT_INT;
};

const precOf = (op: i32): i32 => {
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
    default:
      return 13;
  }
};

/** Reserved words that cannot be identifiers. */
export const isJavaKeyword = (inp: GInput, t: i32): boolean => {
  const n = inp.tEnd[t] - inp.tPos[t];
  if (n < 2 || n > 12) {
    return false;
  }
  const c = inp.firstByte(t);
  switch (c) {
    case 97: // a
      return inp.is(t, "abstract") || inp.is(t, "assert");
    case 98:
      return inp.is(t, "boolean") || inp.is(t, "break") || inp.is(t, "byte");
    case 99:
      return (
        inp.is(t, "case") ||
        inp.is(t, "catch") ||
        inp.is(t, "char") ||
        inp.is(t, "class") ||
        inp.is(t, "const") ||
        inp.is(t, "continue")
      );
    case 100:
      return inp.is(t, "default") || inp.is(t, "do") || inp.is(t, "double");
    case 101:
      return inp.is(t, "else") || inp.is(t, "enum") || inp.is(t, "extends");
    case 102:
      return inp.is(t, "final") || inp.is(t, "finally") || inp.is(t, "float") || inp.is(t, "for") || inp.is(t, "false");
    case 103:
      return inp.is(t, "goto");
    case 105:
      return (
        inp.is(t, "if") ||
        inp.is(t, "implements") ||
        inp.is(t, "import") ||
        inp.is(t, "instanceof") ||
        inp.is(t, "int") ||
        inp.is(t, "interface")
      );
    case 108:
      return inp.is(t, "long");
    case 110:
      return inp.is(t, "native") || inp.is(t, "new") || inp.is(t, "null");
    case 112:
      return inp.is(t, "package") || inp.is(t, "private") || inp.is(t, "protected") || inp.is(t, "public");
    case 114:
      return inp.is(t, "return");
    case 115:
      return (
        inp.is(t, "short") ||
        inp.is(t, "static") ||
        inp.is(t, "strictfp") ||
        inp.is(t, "super") ||
        inp.is(t, "switch") ||
        inp.is(t, "synchronized")
      );
    case 116:
      return (
        inp.is(t, "this") ||
        inp.is(t, "throw") ||
        inp.is(t, "throws") ||
        inp.is(t, "transient") ||
        inp.is(t, "try") ||
        inp.is(t, "true")
      );
    case 118:
      return inp.is(t, "void") || inp.is(t, "volatile");
    case 119:
      return inp.is(t, "while");
    default:
      return false;
  }
};
