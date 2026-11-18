// ktfmt's KotlinInputAstVisitor: walks the PSI tree and emits the layout
// ops google-java-format's engine turns into text. Each `visitX` is the
// method of the same name; the PSI accessors it calls (`receiverExpression`,
// `typeReference`, ...) are the helpers at the end, read off the tree the
// way the Kotlin PSI classes compute them.
//
// Ported from ktfmt's KotlinInputAstVisitor (Apache License 2.0, Copyright
// (c) Meta Platforms, Inc. and affiliates).

import { GEngine, BL_NO, BL_PRESERVE, BL_YES, FORCED, INDEPENDENT, UNIFIED } from "../gdoc/engine";
import { KTree } from "./builder";
import { kIsComment, kIsPsiChild } from "./input";
import {
  N_ANNOTATED_EXPRESSION,
  N_ANNOTATION,
  N_ANNOTATION_ENTRY,
  N_ANNOTATION_TARGET,
  N_ARRAY_ACCESS_EXPRESSION,
  N_BACKING_FIELD,
  N_BINARY_EXPRESSION,
  N_BINARY_WITH_TYPE,
  N_BLOCK,
  N_BODY,
  N_BOOLEAN_CONSTANT,
  N_BREAK,
  N_CALLABLE_REFERENCE_EXPRESSION,
  N_CALL_EXPRESSION,
  N_CATCH,
  N_CHARACTER_CONSTANT,
  N_CLASS,
  N_CLASS_BODY,
  N_CLASS_INITIALIZER,
  N_CLASS_LITERAL_EXPRESSION,
  N_COLLECTION_LITERAL_EXPRESSION,
  N_CONDITION,
  N_CONSTRUCTOR_CALLEE,
  N_CONSTRUCTOR_DELEGATION_CALL,
  N_CONSTRUCTOR_DELEGATION_REFERENCE,
  N_CONTEXT_PARAMETER_LIST,
  N_CONTEXT_RECEIVER,
  N_CONTEXT_RECEIVER_LIST,
  N_CONTINUE,
  N_DELEGATED_SUPER_TYPE_ENTRY,
  N_DESTRUCTURING_DECLARATION,
  N_DESTRUCTURING_DECLARATION_ENTRY,
  N_DOT_QUALIFIED_EXPRESSION,
  N_DO_WHILE,
  N_DYNAMIC_TYPE,
  N_ELSE,
  N_ENUM_ENTRY,
  N_ENUM_ENTRY_SUPERCLASS_REFERENCE_EXPRESSION,
  N_FILE_ANNOTATION_LIST,
  N_FINALLY,
  N_FLOAT_CONSTANT,
  N_FOR,
  N_FUN,
  N_FUNCTION_LITERAL,
  N_FUNCTION_TYPE,
  N_FUNCTION_TYPE_RECEIVER,
  N_IF,
  N_IMPORT_ALIAS,
  N_IMPORT_DIRECTIVE,
  N_IMPORT_LIST,
  N_INDICES,
  N_INITIALIZER_LIST,
  N_INTEGER_CONSTANT,
  N_INTERSECTION_TYPE,
  N_IS_EXPRESSION,
  N_KT_FILE,
  N_LABEL,
  N_LABELED_EXPRESSION,
  N_LABEL_QUALIFIER,
  N_LAMBDA_ARGUMENT,
  N_LAMBDA_EXPRESSION,
  N_LOOP_RANGE,
  N_MODIFIER_LIST,
  N_NULL,
  N_NULLABLE_TYPE,
  N_OBJECT_DECLARATION,
  N_OBJECT_LITERAL,
  N_OPERATION_REFERENCE,
  N_PACKAGE_DIRECTIVE,
  N_PARENTHESIZED,
  N_POSTFIX_EXPRESSION,
  N_PREFIX_EXPRESSION,
  N_PRIMARY_CONSTRUCTOR,
  N_PROPERTY,
  N_PROPERTY_ACCESSOR,
  N_PROPERTY_DELEGATE,
  N_REFERENCE_EXPRESSION,
  N_RETURN,
  N_SAFE_ACCESS_EXPRESSION,
  N_SCRIPT,
  N_SCRIPT_INITIALIZER,
  N_SECONDARY_CONSTRUCTOR,
  N_STRING_TEMPLATE,
  N_SUPER_EXPRESSION,
  N_SUPER_TYPE_CALL_ENTRY,
  N_SUPER_TYPE_ENTRY,
  N_SUPER_TYPE_LIST,
  N_THEN,
  N_THIS_EXPRESSION,
  N_THROW,
  N_TRY,
  N_TYPEALIAS,
  N_TYPE_ARGUMENT_LIST,
  N_TYPE_CONSTRAINT,
  N_TYPE_CONSTRAINT_LIST,
  N_TYPE_PARAMETER,
  N_TYPE_PARAMETER_LIST,
  N_TYPE_PROJECTION,
  N_TYPE_REFERENCE,
  N_USER_TYPE,
  N_VALUE_ARGUMENT,
  N_VALUE_ARGUMENT_LIST,
  N_VALUE_ARGUMENT_NAME,
  N_VALUE_PARAMETER,
  N_VALUE_PARAMETER_LIST,
  N_WHEN,
  N_WHEN_CONDITION_EXPRESSION,
  N_WHEN_CONDITION_IN_RANGE,
  N_WHEN_CONDITION_IS_PATTERN,
  N_WHEN_ENTRY,
  N_WHEN_ENTRY_GUARD,
  N_WHILE,
  T_ARROW,
  T_AT,
  T_BLOCK_COMMENT,
  T_BY_KEYWORD,
  T_CLASS_KEYWORD,
  T_COLON,
  T_COLONCOLON,
  T_COMMA,
  T_CONSTRUCTOR_KEYWORD,
  T_DIVEQ,
  T_DOC_COMMENT,
  T_DOT,
  T_ELSE_KEYWORD,
  T_ELVIS,
  T_ENUM_KEYWORD,
  T_EOL_COMMENT,
  T_EQ,
  T_FIELD_KEYWORD,
  T_GET_KEYWORD,
  T_GT,
  T_IDENTIFIER,
  T_INTERFACE_KEYWORD,
  T_LBRACKET,
  T_LPAR,
  T_MINUSEQ,
  T_MUL,
  T_MULTEQ,
  T_NOT_IN,
  T_NOT_IS,
  T_OBJECT_KEYWORD,
  T_PACKAGE_KEYWORD,
  T_PERCEQ,
  T_PLUSEQ,
  T_QUEST,
  T_RANGE,
  T_RANGE_UNTIL,
  T_RBRACKET,
  T_RPAR,
  T_SAFE_ACCESS,
  T_SET_KEYWORD,
  T_THIS_KEYWORD,
  T_VAL_KEYWORD,
  T_VAR_KEYWORD,
  T_WHITE_SPACE,
  T_IN_KEYWORD,
  T_OUT_KEYWORD,
  ktIsModifierKeyword,
} from "./types";

const CONTINUATION: i32 = 4;

export class KVisitor {
  g: GEngine;
  t: KTree;
  src: u8[];
  ZERO: i32 = 0;
  blockIndent: i32 = 0;
  expressionBreakIndent: i32 = 0;
  blockPlusExpressionBreakIndent: i32 = 0;
  doubleExpressionBreakIndent: i32 = 0;
  expressionBreakNegativeIndent: i32 = 0;
  inImport: boolean = false;
  // Scratch lists in use (allocated per call for now).
  nLists: i32 = 0;

  constructor(g: GEngine, t: KTree) {
    this.g = g;
    this.t = t;
    this.src = new Array<u8>(0);
  }

  reset(src: u8[]): void {
    const g = this.g;
    this.src = src;
    this.ZERO = g.constIndent(0);
    this.blockIndent = g.constIndent(2);
    this.expressionBreakIndent = g.constIndent(CONTINUATION);
    this.blockPlusExpressionBreakIndent = g.constIndent(2 + CONTINUATION);
    this.doubleExpressionBreakIndent = g.constIndent(2 * CONTINUATION);
    this.expressionBreakNegativeIndent = g.constIndent(-CONTINUATION);
    this.inImport = false;
    this.nLists = 0;
  }

  // ---- Builder shorthands ----------------------------------------------------

  tok(s: string): void {
    this.g.token(s, true, this.ZERO, -1);
  }

  tokInd(s: string, plusIndentCommentsBefore: i32): void {
    this.g.token(s, true, plusIndentCommentsBefore, -1);
  }

  /** builder.token(node.text): the next token, whose text is the node's. */
  tokN(n: i32): void {
    this.g.tokBytes(this.t.start[n], this.t.end[n], this.ZERO);
  }

  open(ind: i32): void {
    this.g.open(ind);
  }

  close(): void {
    this.g.close();
  }

  space(): void {
    this.g.space();
  }

  brk(fill: i32, flat: string, ind: i32): void {
    this.g.breakOp(fill, flat, ind, -1);
  }

  brkTag(fill: i32, flat: string, ind: i32, tag: i32): void {
    this.g.breakOp(fill, flat, ind, tag);
  }

  forced(): void {
    this.g.forcedBreak();
  }

  sync(n: i32): void {
    this.g.sync(this.t.start[n]);
  }

  /** A scratch list; release with `pop`. */
  push(): i32[] {
    this.nLists = this.nLists + 1;
    const l: i32[] = [];
    return l;
  }

  pop(): void {
    this.nLists = this.nLists - 1;
  }

  // ---- Dispatch --------------------------------------------------------------

  visit(n: i32): void {
    if (n < 0) {
      return;
    }
    const t = this.t;
    const ty = t.type[n];
    if (t.leaf[n] === 1) {
      return;
    }
    switch (ty) {
      case N_FUN:
        this.visitNamedFunction(n);
        return;
      case N_TYPE_REFERENCE:
        this.visitTypeReference(n);
        return;
      case N_DYNAMIC_TYPE:
        this.tok("dynamic");
        return;
      case N_NULLABLE_TYPE:
        this.visitNullableType(n);
        return;
      case N_USER_TYPE:
        this.visitUserType(n);
        return;
      case N_INTERSECTION_TYPE:
        this.visitIntersectionType(n);
        return;
      case N_TYPE_ARGUMENT_LIST:
        this.visitTypeArgumentList(n);
        return;
      case N_TYPE_PROJECTION:
        this.visitTypeProjection(n);
        return;
      case N_PROPERTY:
        this.visitProperty(n);
        return;
      case N_DOT_QUALIFIED_EXPRESSION:
      case N_SAFE_ACCESS_EXPRESSION:
        this.visitQualifiedExpression(n);
        return;
      case N_CALL_EXPRESSION:
        this.sync(n);
        this.visitCallElement(
          this.calleeOf(n),
          this.child(n, N_TYPE_ARGUMENT_LIST),
          this.child(n, N_VALUE_ARGUMENT_LIST),
          n,
          this.expressionBreakIndent,
          this.ZERO,
          this.ZERO,
        );
        return;
      case N_VALUE_ARGUMENT_LIST:
        this.visitValueArgumentListInternal(n);
        return;
      case N_LAMBDA_EXPRESSION:
        this.visitLambdaExpressionInternal(n, -1);
        return;
      case N_THIS_EXPRESSION:
        this.sync(n);
        this.tok("this");
        this.visit(this.targetLabel(n));
        return;
      case N_REFERENCE_EXPRESSION:
      case N_OPERATION_REFERENCE:
      case N_ENUM_ENTRY_SUPERCLASS_REFERENCE_EXPRESSION:
      case N_LABEL:
        this.visitSimpleNameExpression(n);
        return;
      case N_VALUE_PARAMETER_LIST:
        this.visitEachCommaSeparated(
          this.kidsOf(n, N_VALUE_PARAMETER),
          this.trailingCommaOfParams(n),
          false,
          true,
          null,
          null,
          true,
          true,
        );
        this.pop();
        return;
      case N_VALUE_ARGUMENT:
      case N_LAMBDA_ARGUMENT:
        this.visitArgumentInternal(n, true, -1);
        return;
      case N_RETURN:
        this.visitReturnExpression(n);
        return;
      case N_BINARY_EXPRESSION:
        this.visitBinaryExpression(n);
        return;
      case N_POSTFIX_EXPRESSION:
        this.visitPostfixExpression(n);
        return;
      case N_PREFIX_EXPRESSION:
        this.visitPrefixExpression(n);
        return;
      case N_LABELED_EXPRESSION:
        this.sync(n);
        this.visit(this.child(n, N_LABEL_QUALIFIER));
        if (this.ty(this.firstExpr(n)) !== N_LAMBDA_EXPRESSION) {
          this.space();
        }
        this.visit(this.firstExpr(n));
        return;
      case N_CLASS:
      case N_OBJECT_DECLARATION:
        this.visitClassOrObject(n);
        return;
      case N_ENUM_ENTRY:
        this.visitEnumEntry(n);
        return;
      case N_PRIMARY_CONSTRUCTOR:
        this.visitPrimaryConstructor(n);
        return;
      case N_SECONDARY_CONSTRUCTOR:
        this.visitSecondaryConstructor(n);
        return;
      case N_CONSTRUCTOR_DELEGATION_CALL:
        this.visitConstructorDelegationCall(n);
        return;
      case N_CLASS_INITIALIZER:
        this.sync(n);
        this.tok("init");
        this.space();
        this.visit(this.child(n, N_BLOCK));
        return;
      case N_NULL:
      case N_BOOLEAN_CONSTANT:
      case N_FLOAT_CONSTANT:
      case N_CHARACTER_CONSTANT:
      case N_INTEGER_CONSTANT:
        this.sync(n);
        this.tokN(n);
        return;
      case N_PARENTHESIZED:
        this.sync(n);
        this.tok("(");
        this.visit(this.firstExpr(n));
        this.tok(")");
        return;
      case N_PACKAGE_DIRECTIVE:
        this.visitPackageDirective(n);
        return;
      case N_IMPORT_LIST:
        this.sync(n);
        for (let c = this.t.first[n]; c >= 0; c = this.t.next[c]) {
          if (this.t.type[c] === N_IMPORT_DIRECTIVE) {
            this.visit(c);
          }
        }
        return;
      case N_IMPORT_DIRECTIVE:
        this.visitImportDirective(n);
        return;
      case N_CONTEXT_RECEIVER_LIST:
      case N_CONTEXT_PARAMETER_LIST:
        this.handleContextReceiverList(n);
        this.forced();
        return;
      case N_MODIFIER_LIST:
        this.visitModifierList(n);
        return;
      case N_ANNOTATED_EXPRESSION:
        this.visitAnnotatedExpression(n);
        return;
      case N_ANNOTATION:
        this.visitAnnotation(n);
        return;
      case N_ANNOTATION_TARGET:
        this.tokN(this.t.first[n]);
        return;
      case N_ANNOTATION_ENTRY:
        this.visitAnnotationEntry(n);
        return;
      case N_FILE_ANNOTATION_LIST:
        for (let c = this.t.first[n]; c >= 0; c = this.t.next[c]) {
          if (this.t.leaf[c] === 1) {
            continue;
          }
          this.visit(c);
          this.forced();
        }
        return;
      case N_SUPER_TYPE_LIST:
        this.sync(n);
        this.open(this.expressionBreakIndent);
        this.visitEachCommaSeparated(this.superTypeEntries(n), false, true, true, null, null, true, true);
        this.pop();
        this.close();
        return;
      case N_SUPER_TYPE_CALL_ENTRY:
        this.sync(n);
        this.visitCallElement(
          this.child(n, N_CONSTRUCTOR_CALLEE),
          -1,
          this.child(n, N_VALUE_ARGUMENT_LIST),
          -1,
          this.expressionBreakIndent,
          this.ZERO,
          this.ZERO,
        );
        return;
      case N_DELEGATED_SUPER_TYPE_ENTRY:
        this.sync(n);
        this.visit(this.child(n, N_TYPE_REFERENCE));
        this.space();
        this.tok("by");
        this.space();
        this.visit(this.firstExpr(n));
        return;
      case N_WHEN:
        this.visitWhenExpression(n);
        return;
      case N_CLASS_BODY:
        this.visitClassBody(n);
        return;
      case N_BLOCK:
        this.sync(n);
        this.emitBracedBlock(n, false);
        return;
      case N_WHEN_CONDITION_EXPRESSION:
        this.sync(n);
        this.visit(this.firstExpr(n));
        return;
      case N_WHEN_CONDITION_IS_PATTERN:
        this.sync(n);
        this.tok(this.child(n, T_NOT_IS) >= 0 ? "!is" : "is");
        this.space();
        this.visit(this.child(n, N_TYPE_REFERENCE));
        return;
      case N_WHEN_CONDITION_IN_RANGE: {
        this.sync(n);
        const f = this.t.first[n];
        const neg = f >= 0 && this.child(f, T_NOT_IN) >= 0;
        this.tok(neg ? "!in" : "in");
        this.space();
        this.visit(this.exprAfter(n, f));
        return;
      }
      case N_IF:
        this.visitIfExpression(n);
        return;
      case N_ARRAY_ACCESS_EXPRESSION:
        this.sync(n);
        if (this.isQualified(this.firstExpr(n))) {
          this.emitQualifiedExpression(n);
        } else {
          this.visit(this.firstExpr(n));
          this.visitArrayAccessBrackets(n);
        }
        return;
      case N_DESTRUCTURING_DECLARATION:
        this.visitDestructuringDeclaration(n);
        return;
      case N_DESTRUCTURING_DECLARATION_ENTRY: {
        this.sync(n);
        const id = this.child(n, T_IDENTIFIER);
        this.declareOne(
          false,
          this.child(n, N_MODIFIER_LIST),
          this.valOrVar(n),
          -1,
          -1,
          id,
          this.typeRefAfterColon(n),
          -1,
          this.exprAfterTok(n, T_EQ),
          -1,
          -1,
        );
        return;
      }
      case N_STRING_TEMPLATE:
        this.sync(n);
        this.tokN(n);
        return;
      case N_SUPER_EXPRESSION:
        this.sync(n);
        this.tok("super");
        if (this.child(n, N_TYPE_REFERENCE) >= 0) {
          this.tok("<");
          this.visit(this.child(n, N_TYPE_REFERENCE));
          this.tok(">");
        }
        this.visit(this.child(n, N_LABEL_QUALIFIER));
        return;
      case N_TYPE_PARAMETER_LIST:
        this.sync(n);
        this.open(this.expressionBreakIndent);
        this.visitEachCommaSeparated(
          this.kidsOf(n, N_TYPE_PARAMETER),
          this.trailingCommaBefore(n, T_GT),
          false,
          true,
          "<",
          ">",
          true,
          true,
        );
        this.pop();
        this.close();
        return;
      case N_TYPE_PARAMETER:
        this.visitTypeParameter(n);
        return;
      case N_TYPE_CONSTRAINT_LIST:
        this.open(this.expressionBreakIndent);
        this.brk(INDEPENDENT, " ", this.ZERO);
        this.tok("where");
        this.open(this.expressionBreakIndent);
        this.brk(UNIFIED, " ", this.ZERO);
        this.sync(n);
        this.visitEachCommaSeparated(this.kidsOf(n, N_TYPE_CONSTRAINT), false, false, true, null, null, true, true);
        this.pop();
        this.close();
        this.close();
        return;
      case N_TYPE_CONSTRAINT:
        this.sync(n);
        this.visit(this.child(n, N_REFERENCE_EXPRESSION));
        this.space();
        this.tok(":");
        this.space();
        this.visit(this.child(n, N_TYPE_REFERENCE));
        return;
      case N_FOR:
        this.visitForExpression(n);
        return;
      case N_WHILE:
        this.sync(n);
        this.emitKeywordWithCondition("while", this.containerExpr(n, N_CONDITION), true);
        this.space();
        this.visit(this.containerExpr(n, N_BODY));
        return;
      case N_DO_WHILE: {
        this.sync(n);
        this.tok("do");
        this.space();
        const body = this.containerExpr(n, N_BODY);
        if (body >= 0) {
          this.visit(body);
          this.space();
        }
        this.emitKeywordWithCondition("while", this.containerExpr(n, N_CONDITION), true);
        return;
      }
      case N_BREAK:
        this.sync(n);
        this.tok("break");
        this.visit(this.child(n, N_LABEL_QUALIFIER));
        return;
      case N_CONTINUE:
        this.sync(n);
        this.tok("continue");
        this.visit(this.child(n, N_LABEL_QUALIFIER));
        return;
      case N_VALUE_PARAMETER:
        this.visitParameter(n);
        return;
      case N_CALLABLE_REFERENCE_EXPRESSION:
        this.visitCallableReferenceExpression(n);
        return;
      case N_CLASS_LITERAL_EXPRESSION: {
        this.sync(n);
        const recv = this.firstExpr(n);
        if (this.ty(recv) === N_CALL_EXPRESSION) {
          this.visitCallElement(
            this.calleeOf(recv),
            this.child(recv, N_TYPE_ARGUMENT_LIST),
            this.child(recv, N_VALUE_ARGUMENT_LIST),
            recv,
            this.expressionBreakIndent,
            this.ZERO,
            this.ZERO,
          );
        } else {
          this.visit(recv);
        }
        this.tok("::");
        this.tok("class");
        return;
      }
      case N_FUNCTION_TYPE:
        this.visitFunctionType(n);
        return;
      case N_IS_EXPRESSION:
        this.visitIsExpression(n);
        return;
      case N_BINARY_WITH_TYPE:
        this.visitBinaryWithTypeRHSExpression(n);
        return;
      case N_COLLECTION_LITERAL_EXPRESSION:
        this.sync(n);
        this.open(this.expressionBreakIndent);
        this.visitEachCommaSeparated(
          this.exprKids(n),
          this.trailingCommaBefore(n, T_RBRACKET),
          false,
          true,
          "[",
          "]",
          true,
          true,
        );
        this.pop();
        this.close();
        return;
      case N_TRY:
        this.sync(n);
        this.tok("try");
        this.space();
        this.visit(this.child(n, N_BLOCK));
        for (let c = this.t.first[n]; c >= 0; c = this.t.next[c]) {
          if (this.t.type[c] === N_CATCH) {
            this.visitCatchSection(c);
          }
        }
        this.visit(this.child(n, N_FINALLY));
        return;
      case N_FINALLY:
        this.sync(n);
        this.space();
        this.tok("finally");
        this.space();
        this.visit(this.child(n, N_BLOCK));
        return;
      case N_THROW:
        this.sync(n);
        this.tok("throw");
        this.space();
        this.visit(this.firstExpr(n));
        return;
      case N_TYPEALIAS:
        this.visitTypeAlias(n);
        return;
      case N_KT_FILE:
        this.visitKtFile(n);
        return;
      case N_SCRIPT:
        this.visitScript(n);
        return;
      default:
        break;
    }
    // KtTreeVisitorVoid.visitElement: the children.
    for (let c = t.first[n]; c >= 0; c = t.next[c]) {
      if (t.leaf[c] === 0) {
        this.visit(c);
      }
    }
  }

  // ---- Declarations ----------------------------------------------------------

  visitNamedFunction(n: i32): void {
    this.sync(n);
    this.open(this.ZERO);
    const body = this.firstExpr(n);
    this.visitFunctionLikeExpression(
      this.child(n, N_MODIFIER_LIST),
      "fun",
      this.child(n, N_TYPE_PARAMETER_LIST),
      this.receiverTypeRef(n, true),
      this.child(n, T_IDENTIFIER),
      this.child(n, N_VALUE_PARAMETER_LIST),
      this.child(n, N_TYPE_CONSTRAINT_LIST),
      body,
      this.funReturnType(n),
      true,
    );
    this.close();
  }

  /** visitFunctionLikeExpression; `name` is a node (or -1), `forceName` whether a name exists. */
  visitFunctionLikeExpression(
    modifierList: i32,
    keyword: string | null,
    typeParameters: i32,
    receiverTypeReference: i32,
    name: i32,
    parameterList: i32,
    typeConstraintList: i32,
    bodyExpression: i32,
    typeOrDelegationCall: i32,
    named: boolean,
  ): void {
    const forceTrailingBreak = named && name >= 0;
    if (forceTrailingBreak) {
      this.open(this.ZERO);
    }
    if (modifierList >= 0) {
      this.visitModifierList(modifierList);
    }
    if (keyword !== null) {
      this.tok(keyword);
    }
    if (typeParameters >= 0) {
      this.space();
      this.open(this.ZERO);
      this.visit(typeParameters);
      this.close();
    }
    if (name >= 0 || receiverTypeReference >= 0) {
      this.space();
    }
    this.open(this.ZERO);
    if (receiverTypeReference >= 0) {
      this.visit(receiverTypeReference);
      this.brk(INDEPENDENT, "", this.expressionBreakIndent);
      this.tok(".");
    }
    if (name >= 0) {
      this.tokN(name);
    }
    this.close();
    if (parameterList >= 0 && this.hasEmptyParens(parameterList)) {
      this.open(this.ZERO);
      this.tok("(");
      this.tok(")");
      if (typeOrDelegationCall >= 0) {
        this.open(this.ZERO);
        if (this.ty(typeOrDelegationCall) === N_CONSTRUCTOR_DELEGATION_CALL) {
          this.space();
        }
        this.tok(":");
        this.brk(INDEPENDENT, " ", this.expressionBreakIndent);
        this.open(this.expressionBreakIndent);
        this.visit(typeOrDelegationCall);
        this.close();
        this.close();
      }
      this.close();
    } else {
      this.open(this.expressionBreakIndent);
      if (parameterList >= 0) {
        this.visitEachCommaSeparated(
          this.paramsOf(parameterList),
          this.trailingCommaOfParams(parameterList),
          false,
          true,
          "(",
          ")",
          true,
          true,
        );
        this.pop();
      }
      if (typeOrDelegationCall >= 0) {
        this.open(this.ZERO);
        if (this.ty(typeOrDelegationCall) === N_CONSTRUCTOR_DELEGATION_CALL) {
          this.space();
        }
        this.tok(":");
        this.space();
        this.open(this.expressionBreakNegativeIndent);
        this.visit(typeOrDelegationCall);
        this.close();
        this.close();
      }
      this.close();
    }
    if (typeConstraintList >= 0) {
      this.visit(typeConstraintList);
    }
    if (bodyExpression >= 0 && this.ty(bodyExpression) === N_BLOCK) {
      this.space();
      this.visit(bodyExpression);
    } else if (bodyExpression >= 0) {
      this.space();
      this.open(this.ZERO);
      this.tok("=");
      if (this.isLambdaOrScopingFunction(bodyExpression)) {
        this.visitLambdaOrScopingFunction(bodyExpression, true);
      } else if (this.isChainedScopingFunction(bodyExpression)) {
        this.visitChainedScopingFunction(bodyExpression, true);
      } else {
        this.open(this.expressionBreakIndent);
        this.brk(INDEPENDENT, " ", this.ZERO);
        this.open(this.ZERO);
        this.visit(bodyExpression);
        this.close();
        this.close();
      }
      this.close();
    }
    this.g.guessToken(";");
    if (forceTrailingBreak) {
      this.close();
      this.forced();
    }
  }

  emitBracedBlock(n: i32, classBody: boolean): void {
    this.g.token("{", true, this.blockIndent, this.blockIndent);
    const statements = this.psiChildren(n);
    if (statements.length > 0) {
      this.open(this.blockIndent);
      this.forced();
      this.g.blankLineWanted(BL_PRESERVE);
      if (classBody) {
        this.emitClassBodyChildren(n, statements);
      } else {
        this.visitStatements(statements);
      }
      this.close();
      this.forced();
      this.g.blankLineWanted(BL_NO);
    }
    this.pop();
    this.tokInd("}", this.blockIndent);
  }

  visitStatement(s: i32): void {
    this.open(this.ZERO);
    this.visit(s);
    this.close();
    this.g.guessToken(";");
  }

  visitStatements(statements: i32[]): void {
    let first = true;
    this.g.guessToken(";");
    for (let i = 0; i < toI32(statements.length); i++) {
      this.forced();
      if (!first) {
        this.g.blankLineWanted(BL_PRESERVE);
      }
      first = false;
      this.visitStatement(statements[i]);
    }
  }

  visitProperty(n: i32): void {
    this.sync(n);
    this.open(this.ZERO);
    const valVar = this.valOrVar(n);
    this.declareOne(
      true,
      this.child(n, N_MODIFIER_LIST),
      valVar,
      this.child(n, N_TYPE_PARAMETER_LIST),
      this.receiverTypeRef(n, false),
      this.child(n, T_IDENTIFIER),
      this.typeRefAfterColon(n),
      this.child(n, N_TYPE_CONSTRAINT_LIST),
      this.exprAfterTok(n, T_EQ),
      this.child(n, N_PROPERTY_DELEGATE),
      n,
    );
    this.close();
    this.g.guessToken(";");
    const p = this.t.parent[n];
    if (p < 0 || this.t.type[p] !== N_WHEN) {
      this.forced();
    }
  }

  /** declareOne; `owner` is the property whose accessors and backing field follow, or -1. */
  declareOne(
    isField: boolean,
    modifiers: i32,
    valOrVarKeyword: i32,
    typeParameters: i32,
    receiver: i32,
    name: i32,
    type: i32,
    typeConstraintList: i32,
    initializer: i32,
    delegate: i32,
    owner: i32,
  ): void {
    const verticalAnnotationBreak = this.g.genSym();
    if (isField) {
      this.g.blankLineWantedIf(verticalAnnotationBreak);
    }
    this.visit(modifiers);
    this.open(this.ZERO);
    this.open(this.ZERO);
    if (valOrVarKeyword >= 0) {
      this.tokN(valOrVarKeyword);
      this.space();
    }
    if (typeParameters >= 0) {
      this.visit(typeParameters);
      this.space();
    }
    if (name >= 0) {
      if (receiver >= 0) {
        this.visit(receiver);
        this.tok(".");
      }
      this.tokN(name);
    }
    this.close();
    if (name >= 0) {
      this.open(this.expressionBreakIndent);
    }
    if (type >= 0) {
      if (name >= 0) {
        this.tok(":");
        this.brk(UNIFIED, " ", this.ZERO);
      }
      this.visit(type);
    }
    if (name >= 0) {
      this.close();
    }
    if (typeConstraintList >= 0) {
      this.visit(typeConstraintList);
      this.space();
    }
    if (delegate >= 0) {
      this.space();
      this.tok("by");
      const delegateExpr = this.firstExpr(delegate);
      if (this.isLambdaOrScopingFunction(delegateExpr)) {
        this.space();
        this.visit(delegate);
      } else if (delegateExpr >= 0 && this.isChainedScopingFunction(delegateExpr)) {
        this.visitChainedScopingFunction(delegateExpr, true);
      } else {
        this.brk(UNIFIED, " ", this.expressionBreakIndent);
        this.open(this.expressionBreakIndent);
        this.g.fence();
        this.visit(delegate);
        this.close();
      }
    } else if (initializer >= 0) {
      this.space();
      this.tok("=");
      this.emitInitializer(initializer);
    }
    this.close();
    if (owner >= 0) {
      // The backing field and accessors, in source order.
      let any = false;
      for (let c = this.t.first[owner]; c >= 0; c = this.t.next[c]) {
        const ct = this.t.type[c];
        if (ct !== N_PROPERTY_ACCESSOR && ct !== N_BACKING_FIELD) {
          continue;
        }
        if (!any) {
          this.open(this.blockIndent);
          any = true;
        }
        this.forced();
        this.g.guessToken(";");
        if (ct === N_PROPERTY_ACCESSOR) {
          this.open(this.ZERO);
          const body = this.firstExpr(c);
          const kw = this.child(c, T_GET_KEYWORD) >= 0 ? this.child(c, T_GET_KEYWORD) : this.child(c, T_SET_KEYWORD);
          this.visitFunctionLikeExpression(
            this.child(c, N_MODIFIER_LIST),
            this.textOf(kw),
            -1,
            -1,
            -1,
            body >= 0 ? this.child(c, N_VALUE_PARAMETER_LIST) : -1,
            -1,
            body,
            this.child(c, N_TYPE_REFERENCE),
            false,
          );
          this.close();
        } else {
          this.emitBackingField(c);
        }
      }
      if (any) {
        this.close();
      }
    }
    this.g.guessToken(";");
    if (isField) {
      this.g.blankLineWantedIf(verticalAnnotationBreak);
    }
  }

  /** The `= initializer` tail shared by properties and backing fields (after the `=`). */
  emitInitializer(initializer: i32): void {
    if (this.isLambdaOrScopingFunction(initializer)) {
      this.visitLambdaOrScopingFunction(initializer, true);
    } else if (this.isChainedScopingFunction(initializer)) {
      this.visitChainedScopingFunction(initializer, true);
    } else {
      this.brk(UNIFIED, " ", this.expressionBreakIndent);
      this.open(this.expressionBreakIndent);
      this.g.fence();
      this.visit(initializer);
      this.close();
    }
  }

  emitBackingField(n: i32): void {
    this.sync(n);
    this.open(this.ZERO);
    this.open(this.ZERO);
    this.tokN(this.child(n, T_FIELD_KEYWORD));
    this.close();
    const type = this.child(n, N_TYPE_REFERENCE);
    if (type >= 0) {
      this.open(this.expressionBreakIndent);
      this.tok(":");
      this.brk(UNIFIED, " ", this.ZERO);
      this.visit(type);
      this.close();
    }
    const initializer = this.exprAfterTok(n, T_EQ);
    if (initializer >= 0) {
      this.space();
      this.tok("=");
      this.emitInitializer(initializer);
    }
    this.close();
  }

  visitClassOrObject(n: i32): void {
    this.sync(n);
    const modifierList = this.child(n, N_MODIFIER_LIST);
    this.open(this.ZERO);
    if (modifierList >= 0) {
      this.visitModifierList(modifierList);
    }
    let kw = -1;
    for (let c = this.t.first[n]; c >= 0; c = this.t.next[c]) {
      const ct = this.t.type[c];
      if (ct === T_CLASS_KEYWORD || ct === T_INTERFACE_KEYWORD || ct === T_OBJECT_KEYWORD) {
        kw = c;
        break;
      }
    }
    if (kw >= 0) {
      this.tokN(kw);
    }
    const name = this.child(n, T_IDENTIFIER);
    if (name >= 0) {
      this.space();
      this.tokN(name);
      this.visit(this.child(n, N_TYPE_PARAMETER_LIST));
    }
    this.visit(this.child(n, N_PRIMARY_CONSTRUCTOR));
    const superTypes = this.child(n, N_SUPER_TYPE_LIST);
    if (superTypes >= 0) {
      this.space();
      this.open(this.ZERO);
      this.tok(":");
      this.brk(UNIFIED, " ", this.expressionBreakIndent);
      this.visit(superTypes);
      this.close();
    }
    const tcl = this.child(n, N_TYPE_CONSTRAINT_LIST);
    const body = this.child(n, N_CLASS_BODY);
    if (tcl >= 0) {
      if (superTypes >= 0) {
        let last = -1;
        for (let c = this.t.first[superTypes]; c >= 0; c = this.t.next[c]) {
          const ct = this.t.type[c];
          if (ct === N_SUPER_TYPE_ENTRY || ct === N_SUPER_TYPE_CALL_ENTRY || ct === N_DELEGATED_SUPER_TYPE_ENTRY) {
            last = c;
          }
        }
        if (last >= 0 && this.t.type[last] === N_DELEGATED_SUPER_TYPE_ENTRY) {
          this.g.forcedBreakInd(this.expressionBreakIndent);
        }
      }
      this.visit(tcl);
      this.space();
    } else if (body >= 0) {
      this.space();
    }
    this.visit(body);
    this.close();
    if (name >= 0) {
      this.forced();
    }
  }

  visitPrimaryConstructor(n: i32): void {
    this.sync(n);
    this.open(this.ZERO);
    const hasKw = this.child(n, T_CONSTRUCTOR_KEYWORD) >= 0;
    if (hasKw) {
      this.brk(UNIFIED, " ", this.ZERO);
    }
    this.visitFunctionLikeExpression(
      this.child(n, N_MODIFIER_LIST),
      hasKw ? "constructor" : null,
      -1,
      -1,
      -1,
      this.child(n, N_VALUE_PARAMETER_LIST),
      -1,
      -1,
      -1,
      false,
    );
    this.close();
  }

  visitSecondaryConstructor(n: i32): void {
    this.sync(n);
    this.open(this.ZERO);
    const call = this.child(n, N_CONSTRUCTOR_DELEGATION_CALL);
    let explicit = -1;
    if (call >= 0) {
      const ref = this.child(call, N_CONSTRUCTOR_DELEGATION_REFERENCE);
      if (ref >= 0 && this.t.end[ref] > this.t.start[ref]) {
        explicit = call;
      }
    }
    this.visitFunctionLikeExpression(
      this.child(n, N_MODIFIER_LIST),
      "constructor",
      -1,
      -1,
      -1,
      this.child(n, N_VALUE_PARAMETER_LIST),
      -1,
      this.firstExpr(n),
      explicit,
      false,
    );
    this.close();
  }

  visitConstructorDelegationCall(n: i32): void {
    this.open(this.ZERO);
    const ref = this.child(n, N_CONSTRUCTOR_DELEGATION_REFERENCE);
    this.tok(ref >= 0 && this.child(ref, T_THIS_KEYWORD) >= 0 ? "this" : "super");
    this.visitCallElement(
      -1,
      this.child(n, N_TYPE_ARGUMENT_LIST),
      this.child(n, N_VALUE_ARGUMENT_LIST),
      n,
      this.expressionBreakIndent,
      this.ZERO,
      this.ZERO,
    );
    this.close();
  }

  visitEnumEntry(n: i32): void {
    this.sync(n);
    this.open(this.ZERO);
    this.visit(this.child(n, N_MODIFIER_LIST));
    this.tokN(this.child(n, T_IDENTIFIER));
    const il = this.child(n, N_INITIALIZER_LIST);
    if (il >= 0) {
      for (let c = this.t.first[il]; c >= 0; c = this.t.next[c]) {
        if (this.t.leaf[c] === 0) {
          this.visit(c);
        }
      }
    }
    const body = this.child(n, N_CLASS_BODY);
    if (body >= 0) {
      this.space();
      this.visit(body);
    }
    this.close();
  }

  visitTypeAlias(n: i32): void {
    this.sync(n);
    this.open(this.ZERO);
    this.visit(this.child(n, N_MODIFIER_LIST));
    this.tok("typealias");
    this.space();
    this.tokN(this.child(n, T_IDENTIFIER));
    this.visit(this.child(n, N_TYPE_PARAMETER_LIST));
    this.space();
    this.tok("=");
    this.brk(INDEPENDENT, " ", this.expressionBreakIndent);
    this.open(this.expressionBreakIndent);
    this.visit(this.child(n, N_TYPE_REFERENCE));
    this.visit(this.child(n, N_TYPE_CONSTRAINT_LIST));
    this.g.guessToken(";");
    this.close();
    this.forced();
    this.close();
  }

  visitClassBody(n: i32): void {
    this.sync(n);
    this.emitBracedBlock(n, true);
  }

  /** visitClassBody's children callback. */
  emitClassBodyChildren(body: i32, children: i32[]): void {
    const t = this.t;
    const members = this.push();
    for (let i = 0; i < toI32(children.length); i++) {
      if (t.type[children[i]] !== N_ENUM_ENTRY) {
        members.push(children[i]);
      }
    }
    const clazz = t.parent[body];
    const isEnum = clazz >= 0 && t.type[clazz] === N_CLASS && this.hasModifier(clazz, T_ENUM_KEYWORD);
    if (isEnum) {
      this.open(this.ZERO);
      this.brk(UNIFIED, "", this.ZERO);
      for (let i = 0; i < toI32(children.length); i++) {
        if (t.type[children[i]] !== N_ENUM_ENTRY) {
          continue;
        }
        this.visit(children[i]);
        if (this.g.peekIs(",")) {
          this.tok(",");
          this.forced();
        }
      }
      this.close();
      this.g.guessToken(";");
      if (members.length > 0) {
        this.forced();
        this.g.blankLineWanted(BL_YES);
      }
    }
    let prev = -1;
    for (let i = 0; i < toI32(members.length); i++) {
      const curr = members[i];
      let bl = BL_YES;
      if (prev < 0) {
        bl = BL_PRESERVE;
      } else if (t.type[prev] !== N_PROPERTY) {
        bl = BL_YES;
      } else if (this.child(prev, N_PROPERTY_ACCESSOR) >= 0) {
        bl = BL_YES;
      } else if (t.type[curr] === N_PROPERTY) {
        bl = BL_PRESERVE;
      }
      this.g.blankLineWanted(bl);
      this.open(this.ZERO);
      this.visit(curr);
      this.close();
      this.g.guessToken(";");
      this.forced();
      prev = curr;
    }
    this.pop();
  }

  visitTypeParameter(n: i32): void {
    this.sync(n);
    this.visit(this.child(n, N_MODIFIER_LIST));
    const id = this.child(n, T_IDENTIFIER);
    if (id >= 0) {
      this.tokN(id);
    } else {
      this.tok("");
    }
    const bound = this.child(n, N_TYPE_REFERENCE);
    if (bound >= 0) {
      this.space();
      this.tok(":");
      this.space();
      this.visit(bound);
    }
  }

  visitParameter(n: i32): void {
    this.sync(n);
    this.open(this.ZERO);
    const dd = this.child(n, N_DESTRUCTURING_DECLARATION);
    const typeReference = this.child(n, N_TYPE_REFERENCE);
    if (dd >= 0) {
      this.open(this.ZERO);
      this.visit(dd);
      if (typeReference >= 0) {
        this.tok(":");
        this.space();
        this.visit(typeReference);
      }
      this.close();
    } else {
      this.declareOne(
        false,
        this.child(n, N_MODIFIER_LIST),
        this.valOrVar(n),
        -1,
        -1,
        this.child(n, T_IDENTIFIER),
        typeReference,
        -1,
        this.exprAfterTok(n, T_EQ),
        -1,
        -1,
      );
    }
    this.close();
  }

  visitDestructuringDeclaration(n: i32): void {
    this.sync(n);
    // A destructuring declaration's only modifiers are annotations, each
    // block on lines of their own.
    const mods = this.child(n, N_MODIFIER_LIST);
    if (mods >= 0) {
      this.visitModifierList(mods);
      this.forced();
    }
    const vv = this.valOrVar(n);
    if (vv >= 0) {
      this.tokN(vv);
      this.space();
    }
    const rpar = this.child(n, T_RPAR) >= 0 ? this.child(n, T_RPAR) : this.child(n, T_RBRACKET);
    const hasTrailingComma = rpar >= 0 && this.prevIsComma(rpar);
    const lp = this.child(n, T_LPAR) >= 0 ? this.child(n, T_LPAR) : this.child(n, T_LBRACKET);
    this.open(this.ZERO);
    if (lp >= 0) {
      this.tokN(lp);
    } else {
      this.tok("(");
    }
    this.brk(UNIFIED, "", this.expressionBreakIndent);
    this.open(this.expressionBreakIndent);
    this.visitEachCommaSeparated(
      this.kidsOf(n, N_DESTRUCTURING_DECLARATION_ENTRY),
      hasTrailingComma,
      true,
      true,
      null,
      null,
      true,
      true,
    );
    this.pop();
    this.close();
    this.close();
    if (rpar >= 0) {
      this.tokN(rpar);
    } else {
      this.tok(")");
    }
    const initializer = this.exprAfterTok(n, T_EQ);
    if (initializer >= 0) {
      this.space();
      this.tok("=");
      if (hasTrailingComma) {
        this.space();
      } else {
        this.brk(INDEPENDENT, " ", this.expressionBreakIndent);
      }
      if (!hasTrailingComma) {
        this.open(this.expressionBreakIndent);
      }
      this.visit(initializer);
      if (!hasTrailingComma) {
        this.close();
      }
    }
  }

  // ---- Types -----------------------------------------------------------------

  visitTypeReference(n: i32): void {
    this.sync(n);
    const t = this.t;
    let typeElement = -1;
    let modifierList = -1;
    for (let c = t.first[n]; c >= 0; c = t.next[c]) {
      const ct = t.type[c];
      if (ct === N_MODIFIER_LIST && modifierList < 0) {
        modifierList = c;
      } else if (typeElement < 0 && kIsTypeElement(ct)) {
        typeElement = c;
      }
    }
    for (let c = t.first[n]; c >= 0; c = t.next[c]) {
      const ct = t.type[c];
      if (c === modifierList) {
        this.visit(c);
      } else if (c === typeElement) {
        this.visit(c);
      } else if (ct === T_LPAR) {
        this.tok("(");
      } else if (ct === T_RPAR) {
        this.tok(")");
      }
    }
  }

  visitNullableType(n: i32): void {
    this.sync(n);
    this.visitTypeReference(n);
    this.tok("?");
  }

  visitUserType(n: i32): void {
    this.sync(n);
    const q = this.child(n, N_USER_TYPE);
    if (q >= 0) {
      this.visit(q);
      this.tok(".");
    }
    this.visit(this.child(n, N_REFERENCE_EXPRESSION));
    const tal = this.child(n, N_TYPE_ARGUMENT_LIST);
    if (tal >= 0) {
      this.open(this.expressionBreakIndent);
      this.visit(tal);
      this.close();
    }
  }

  visitIntersectionType(n: i32): void {
    this.sync(n);
    const l = this.child(n, N_TYPE_REFERENCE);
    this.visit(l);
    this.space();
    this.tok("&");
    this.space();
    this.visit(this.childAfter(l, N_TYPE_REFERENCE));
  }

  visitTypeArgumentList(n: i32): void {
    this.sync(n);
    this.visitEachCommaSeparated(
      this.kidsOf(n, N_TYPE_PROJECTION),
      this.trailingCommaBefore(n, T_GT),
      false,
      true,
      "<",
      ">",
      true,
      true,
    );
    this.pop();
  }

  visitTypeProjection(n: i32): void {
    this.sync(n);
    const tr = this.child(n, N_TYPE_REFERENCE);
    if (this.child(n, T_MUL) >= 0) {
      this.tok("*");
      return;
    }
    const ml = this.child(n, N_MODIFIER_LIST);
    if (ml >= 0 && this.child(ml, T_IN_KEYWORD) >= 0) {
      this.tok("in");
      this.space();
      this.visit(tr);
    } else if (ml >= 0 && this.child(ml, T_OUT_KEYWORD) >= 0) {
      this.tok("out");
      this.space();
      this.visit(tr);
    } else {
      this.visit(tr);
    }
  }

  visitFunctionType(n: i32): void {
    this.sync(n);
    const crl =
      this.child(n, N_CONTEXT_RECEIVER_LIST) >= 0
        ? this.child(n, N_CONTEXT_RECEIVER_LIST)
        : this.child(n, N_CONTEXT_PARAMETER_LIST);
    if (crl >= 0) {
      this.handleContextReceiverList(crl);
      this.space();
    }
    const recv = this.child(n, N_FUNCTION_TYPE_RECEIVER);
    if (recv >= 0) {
      this.visit(recv);
      this.tok(".");
    }
    this.open(this.expressionBreakIndent);
    const pl = this.child(n, N_VALUE_PARAMETER_LIST);
    if (pl >= 0) {
      this.visitEachCommaSeparated(this.paramsOf(pl), this.trailingCommaOfParams(pl), true, true, "(", ")", true, true);
      this.pop();
    }
    this.close();
    this.space();
    this.tok("->");
    this.space();
    this.open(this.expressionBreakIndent);
    this.visit(this.child(n, N_TYPE_REFERENCE));
    this.close();
  }

  // ---- Expressions -----------------------------------------------------------

  visitQualifiedExpression(n: i32): void {
    this.sync(n);
    const receiver = this.firstExpr(n);
    const rt = this.ty(receiver);
    if (this.inImport) {
      this.visit(receiver);
      const sel = this.selectorOf(n);
      if (sel >= 0) {
        this.tok(".");
        this.visit(sel);
      }
    } else if (rt === N_STRING_TEMPLATE) {
      this.open(this.expressionBreakIndent);
      this.visit(receiver);
      this.brk(UNIFIED, "", this.ZERO);
      this.tokN(this.opSign(n));
      this.visit(this.selectorOf(n));
      this.close();
    } else if (rt === N_WHEN) {
      this.open(this.ZERO);
      this.visit(receiver);
      this.tokN(this.opSign(n));
      this.visit(this.selectorOf(n));
      this.close();
    } else if (
      this.isChainedScopingFunction(n) &&
      this.isMultilineScopingFunction(this.chainRoot(n)) &&
      !this.chainedSelectorsHaveValueArguments(n)
    ) {
      this.visitChainedScopingFunction(n, false);
    } else {
      this.emitQualifiedExpression(n);
    }
  }

  emitQualifiedExpression(n: i32): void {
    const parts = this.breakIntoParts(n);
    const np = toI32(parts.length);
    let lambdas = 0;
    for (let i = 0; i < np; i++) {
      if (this.isLambdaPart(parts[i])) {
        lambdas++;
      }
    }
    const useBlockLikeLambdaStyle = this.isLambdaPart(parts[np - 1]) && lambdas === 1;
    // computeGroupingInfo: opens per part (low bits) and close flags.
    const opens = this.push();
    const closes = this.push();
    for (let i = 0; i < np; i++) {
      opens.push(0);
      closes.push(0);
    }
    let lastIndexToOpen = 0;
    for (let i = 0; i < np; i++) {
      const part = parts[i];
      const pt = this.ty(part);
      if (this.isQualified(part)) {
        const recv = this.firstExpr(part);
        const previous = this.isQualified(recv) ? this.selectorOf(recv) : recv;
        const current = this.selectorOf(part);
        if (lastIndexToOpen === 0 && this.shouldGroupPartWithPrevious(np, part, i, previous, current)) {
          opens[0] = opens[0] + 1;
          closes[i] = 1;
        } else {
          lastIndexToOpen = i;
        }
      } else if (pt === N_ARRAY_ACCESS_EXPRESSION || pt === N_POSTFIX_EXPRESSION) {
        opens[lastIndexToOpen] = opens[lastIndexToOpen] + 1;
      }
    }
    if (useBlockLikeLambdaStyle) {
      opens[0] = opens[0] + 1;
    }
    this.open(this.expressionBreakIndent);
    const nameTag = this.g.genSym();
    for (let i = 0; i < np; i++) {
      const e = parts[i];
      const et = this.ty(e);
      if (this.isQualified(e)) {
        this.brkTag(UNIFIED, "", this.ZERO, nameTag);
      }
      for (let k = 0; k < opens[i]; k++) {
        this.open(this.ZERO);
      }
      if (this.isQualified(e)) {
        this.tokN(this.opSign(e));
        const sel = this.selectorOf(e);
        if (this.ty(sel) !== N_CALL_EXPRESSION) {
          this.visit(sel);
          if (closes[i] === 1) {
            this.close();
          }
        } else {
          this.visit(this.calleeOf(sel));
          if (closes[i] === 1) {
            this.close();
          }
          const isTrailingLambda = useBlockLikeLambdaStyle && i === np - 1;
          if (isTrailingLambda) {
            this.close();
          }
          const argsIndentElse = i === np - 1 ? this.ZERO : this.expressionBreakIndent;
          const lambdaIndentElse = isTrailingLambda ? this.expressionBreakNegativeIndent : this.ZERO;
          const negativeLambdaIndentElse = isTrailingLambda ? this.expressionBreakIndent : this.ZERO;
          this.visitCallElement(
            -1,
            this.child(sel, N_TYPE_ARGUMENT_LIST),
            this.child(sel, N_VALUE_ARGUMENT_LIST),
            sel,
            this.g.ifIndent(nameTag, this.expressionBreakIndent, argsIndentElse),
            this.g.ifIndent(nameTag, this.ZERO, lambdaIndentElse),
            this.g.ifIndent(nameTag, this.ZERO, negativeLambdaIndentElse),
          );
        }
      } else if (et === N_ARRAY_ACCESS_EXPRESSION) {
        this.visitArrayAccessBrackets(e);
        this.close();
      } else if (et === N_POSTFIX_EXPRESSION) {
        this.tokN(this.child(e, N_OPERATION_REFERENCE));
        this.close();
      } else {
        this.visit(e);
      }
    }
    this.close();
    this.pop();
    this.pop();
    this.pop();
  }

  /** breakIntoParts (a scratch list; the caller pops it). */
  breakIntoParts(n: i32): i32[] {
    const parts = this.push();
    let node = n;
    while (node >= 0) {
      parts.push(node);
      const nt = this.ty(node);
      if (this.isQualified(node) || nt === N_ARRAY_ACCESS_EXPRESSION || nt === N_POSTFIX_EXPRESSION) {
        node = this.firstExpr(node);
      } else {
        node = -1;
      }
    }
    kReverse(parts);
    return parts;
  }

  /** PsiUtils' KtExpression.isLambda: a call (or a qualified call) with a trailing lambda. */
  isLambdaPart(e: i32): boolean {
    let call = e;
    if (this.isQualified(e)) {
      call = this.selectorOf(e);
    }
    return this.ty(call) === N_CALL_EXPRESSION && this.child(call, N_LAMBDA_ARGUMENT) >= 0;
  }

  shouldGroupPartWithPrevious(np: i32, part: i32, index: i32, previous: i32, current: i32): boolean {
    if (index === 1 && this.textLen(previous) < CONTINUATION) {
      return true;
    }
    const pt = this.ty(previous);
    if (pt === N_SUPER_EXPRESSION || pt === N_THIS_EXPRESSION) {
      return true;
    }
    const ct = this.ty(current);
    const dot = this.ty(part) === N_DOT_QUALIFIED_EXPRESSION;
    if (kIsSimpleName(pt) && kIsSimpleName(ct) && dot) {
      return true;
    }
    if (this.firstIsUpper(current) && kIsSimpleName(ct) && dot) {
      return true;
    }
    if (ct === N_CALL_EXPRESSION && pt !== N_CALL_EXPRESSION && this.firstIsUpper(previous)) {
      return true;
    }
    return ct === N_CALL_EXPRESSION && pt !== N_CALL_EXPRESSION && index === np - 1;
  }

  /**
   * visitCallElement. `callNode` holds the lambda arguments (a call or
   * delegation call), or -1 for none.
   */
  visitCallElement(
    callee: i32,
    typeArgumentList: i32,
    argumentList: i32,
    callNode: i32,
    argumentsIndent: i32,
    lambdaIndent: i32,
    negativeLambdaIndent: i32,
  ): void {
    this.open(lambdaIndent);
    let brokeBeforeBrace = -1;
    this.open(negativeLambdaIndent);
    this.visit(callee);
    this.open(argumentsIndent);
    this.open(this.ZERO);
    this.visit(typeArgumentList);
    this.close();
    if (argumentList >= 0) {
      brokeBeforeBrace = this.visitValueArgumentListInternal(argumentList);
    }
    this.close();
    this.close();
    if (callNode >= 0) {
      const lam = this.child(callNode, N_LAMBDA_ARGUMENT);
      if (lam >= 0) {
        if (this.childAfter(lam, N_LAMBDA_ARGUMENT) >= 0) {
          this.g.fail("Maximum one trailing lambda is allowed");
        }
        this.space();
        this.visitArgumentInternal(lam, false, brokeBeforeBrace);
      }
    }
    this.close();
  }

  /** Answers the name tag, or -1. */
  visitValueArgumentListInternal(n: i32): i32 {
    this.sync(n);
    const args = this.kidsOf(n, N_VALUE_ARGUMENT);
    const single =
      args.length === 1 &&
      this.ty(this.firstExpr(args[0])) === N_LAMBDA_EXPRESSION &&
      this.child(args[0], N_VALUE_ARGUMENT_NAME) < 0;
    const hasTrailingComma = this.trailingCommaBefore(n, T_RPAR);
    const hasEmptyParens = this.hasEmptyParens(n);
    let wrapInBlock = false;
    let breakBeforePostfix = false;
    let leadingBreak = false;
    let breakAfterPrefix = false;
    if (single) {
      wrapInBlock = true;
      breakBeforePostfix = false;
      leadingBreak = !hasEmptyParens && hasTrailingComma;
      breakAfterPrefix = false;
    } else {
      wrapInBlock = false;
      breakBeforePostfix = !hasEmptyParens;
      leadingBreak = !hasEmptyParens;
      breakAfterPrefix = !hasEmptyParens;
    }
    const tag = this.visitEachCommaSeparated(
      args,
      hasTrailingComma,
      wrapInBlock,
      leadingBreak,
      "(",
      ")",
      breakAfterPrefix,
      breakBeforePostfix,
    );
    this.pop();
    return tag;
  }

  visitLambdaExpressionInternal(n: i32, brokeBeforeBrace: i32): void {
    this.sync(n);
    const fl = this.child(n, N_FUNCTION_LITERAL);
    const vpl = this.child(fl, N_VALUE_PARAMETER_LIST);
    const valueParams = vpl >= 0 ? this.kidsOf(vpl, N_VALUE_PARAMETER) : this.push();
    const hasParams = valueParams.length > 0;
    const body = this.child(fl, N_BLOCK);
    const statements = this.psiChildren(body);
    const hasStatements = statements.length > 0;
    let hasComments = false;
    for (let c = this.t.first[body]; c >= 0; c = this.t.next[c]) {
      if (kIsComment(this.t.type[c])) {
        hasComments = true;
      }
    }
    const hasArrow = this.child(fl, T_ARROW) >= 0;
    const g = this.g;
    const bracePlusBlockIndent =
      brokeBeforeBrace < 0
        ? this.blockIndent
        : g.ifIndent(brokeBeforeBrace, this.blockPlusExpressionBreakIndent, this.blockIndent);
    const bracePlusExpressionIndent =
      brokeBeforeBrace < 0
        ? this.expressionBreakIndent
        : g.ifIndent(brokeBeforeBrace, this.doubleExpressionBreakIndent, this.expressionBreakIndent);
    const bracePlusZeroIndent =
      brokeBeforeBrace < 0 ? this.ZERO : g.ifIndent(brokeBeforeBrace, this.expressionBreakIndent, this.ZERO);
    this.tok("{");
    if (hasParams || hasArrow) {
      this.space();
      this.open(bracePlusExpressionIndent);
      this.visitEachCommaSeparated(valueParams, false, true, true, null, null, true, true);
      this.close();
      this.open(bracePlusBlockIndent);
      if (vpl >= 0 && this.trailingCommaOfParams(vpl)) {
        this.tok(",");
        this.forced();
      } else if (hasParams) {
        this.brk(INDEPENDENT, " ", this.ZERO);
      }
      this.tok("->");
      this.close();
    }
    if (hasParams || hasArrow || hasStatements || hasComments) {
      this.brk(UNIFIED, " ", bracePlusZeroIndent);
    }
    if (hasStatements) {
      this.brk(UNIFIED, "", bracePlusBlockIndent);
      this.open(bracePlusBlockIndent);
      g.blankLineWanted(BL_NO);
      const shouldForceMultiline = this.hasSourceNewlineInLambdaBody(n);
      const f = this.t.first[body];
      const startsWithComment = f >= 0 && kIsComment(this.t.type[f]);
      if (
        !shouldForceMultiline &&
        statements.length === 1 &&
        this.ty(statements[0]) !== N_RETURN &&
        !startsWithComment
      ) {
        this.visitStatement(statements[0]);
      } else {
        this.visitStatements(statements);
      }
      this.brk(UNIFIED, " ", bracePlusZeroIndent);
      this.close();
    } else if (hasComments) {
      const blockComments = this.push();
      for (let c = this.t.first[body]; c >= 0; c = this.t.next[c]) {
        const ct = this.t.type[c];
        if (ct === T_BLOCK_COMMENT || ct === T_DOC_COMMENT) {
          blockComments.push(c);
        }
      }
      this.brk(UNIFIED, "", bracePlusBlockIndent);
      this.open(bracePlusBlockIndent);
      g.fence();
      g.blankLineWanted(BL_NO);
      for (let i = 0; i < toI32(blockComments.length); i++) {
        if (i > 0) {
          this.forced();
        }
        this.tokN(blockComments[i]);
      }
      this.brk(UNIFIED, " ", bracePlusZeroIndent);
      this.close();
      this.pop();
    }
    if (hasParams || hasArrow || hasStatements || hasComments) {
      this.brk(UNIFIED, "", bracePlusZeroIndent);
    }
    this.open(bracePlusZeroIndent);
    g.fence();
    this.tokInd("}", this.blockIndent);
    this.close();
    this.pop();
    this.pop();
  }

  visitSimpleNameExpression(n: i32): void {
    this.sync(n);
    if (this.ty(n) === N_LABEL) {
      const id = this.child(n, T_IDENTIFIER);
      if (toI32(this.src[this.t.start[n]]) === 64) {
        this.tok("@");
        this.tokN(id);
      } else {
        this.tokN(id);
        this.tok("@");
      }
      return;
    }
    if (this.t.end[n] > this.t.start[n]) {
      this.tokN(n);
    }
  }

  /** visitEachCommaSeparated; answers the name tag, or -1. */
  visitEachCommaSeparated(
    list: i32[],
    hasTrailingComma: boolean,
    wrapInBlock: boolean,
    leadingBreak: boolean,
    prefix: string | null,
    postfix: string | null,
    breakAfterPrefix: boolean,
    breakBeforePostfix: boolean,
  ): i32 {
    const breakAfterLastElement = hasTrailingComma || (postfix !== null && breakBeforePostfix);
    const nameTag = breakAfterLastElement ? -1 : this.g.genSym();
    if (prefix !== null) {
      this.tok(prefix);
      if (breakAfterPrefix) {
        this.brkTag(UNIFIED, "", this.ZERO, nameTag);
      }
    }
    const breakType = hasTrailingComma ? FORCED : UNIFIED;
    const indent = leadingBreak ? this.ZERO : this.expressionBreakNegativeIndent;
    if (wrapInBlock) {
      this.open(indent);
    }
    if (leadingBreak) {
      this.brk(breakType, "", this.ZERO);
    }
    for (let i = 0; i < toI32(list.length); i++) {
      if (i > 0) {
        this.tok(",");
        this.brk(breakType, " ", this.ZERO);
      }
      this.visit(list[i]);
    }
    if (hasTrailingComma) {
      this.tok(",");
      this.brk(breakType, " ", this.ZERO);
    }
    if (wrapInBlock) {
      this.close();
    }
    if (breakAfterLastElement) {
      this.brk(breakType, "", this.expressionBreakNegativeIndent);
    }
    if (postfix !== null) {
      if (breakAfterLastElement) {
        this.open(this.expressionBreakNegativeIndent);
        this.g.fence();
        this.tokInd(postfix, this.expressionBreakIndent);
        this.close();
      } else {
        this.tok(postfix);
      }
    }
    return nameTag;
  }

  visitArgumentInternal(n: i32, wrapInBlock: boolean, brokeBeforeBrace: i32): void {
    this.sync(n);
    const argName = this.child(n, N_VALUE_ARGUMENT_NAME);
    const expr = this.firstExpr(n);
    const hasArgName = argName >= 0;
    const isLambda = this.ty(expr) === N_LAMBDA_EXPRESSION;
    if (hasArgName) {
      this.visit(argName);
      this.space();
      this.tok("=");
      if (isLambda) {
        this.space();
      }
    }
    const indent = hasArgName && !isLambda ? this.expressionBreakIndent : this.ZERO;
    if (wrapInBlock) {
      this.open(indent);
    }
    if (hasArgName && !isLambda) {
      this.brk(INDEPENDENT, " ", this.ZERO);
    }
    if (this.child(n, T_MUL) >= 0) {
      this.tok("*");
    }
    if (isLambda) {
      this.visitLambdaExpressionInternal(expr, brokeBeforeBrace);
    } else {
      this.visit(expr);
    }
    if (wrapInBlock) {
      this.close();
    }
  }

  visitReturnExpression(n: i32): void {
    this.sync(n);
    this.tok("return");
    this.visit(this.targetLabel(n));
    const e = this.firstExpr(n);
    if (e >= 0) {
      this.space();
      this.visit(e);
    }
    this.g.guessToken(";");
  }

  visitBinaryExpression(n: i32): void {
    this.sync(n);
    const op = this.opToken(n);
    const right0 = this.binaryRight(n);
    if (kIsAssignment(op) && this.isLambdaOrScopingFunction(right0)) {
      this.visit(this.binaryLeft(n));
      this.space();
      this.tokN(this.child(n, N_OPERATION_REFERENCE));
      this.visitLambdaOrScopingFunction(right0, true);
      return;
    }
    const parts = this.push();
    let current = n;
    while (current >= 0 && this.ty(current) === N_BINARY_EXPRESSION && this.opToken(current) === op) {
      parts.push(current);
      current = this.binaryLeft(current);
    }
    kReverse(parts);
    const leftMost = parts[0];
    this.visit(this.binaryLeft(leftMost));
    for (let i = 0; i < toI32(parts.length); i++) {
      const le = parts[i];
      const isFirst = i === 0;
      const opRef = this.child(le, N_OPERATION_REFERENCE);
      const lop = this.opToken(le);
      if (lop === T_RANGE || lop === T_RANGE_UNTIL) {
        if (isFirst) {
          this.open(this.expressionBreakIndent);
        }
        this.tokN(opRef);
      } else if (lop === T_ELVIS) {
        if (isFirst) {
          this.open(this.expressionBreakIndent);
        }
        this.brk(UNIFIED, " ", this.ZERO);
        this.tokN(opRef);
        this.space();
      } else {
        this.space();
        if (isFirst) {
          this.open(this.expressionBreakIndent);
        }
        this.tokN(opRef);
        this.brk(this.hasLineBreakingCommentBefore(opRef) ? INDEPENDENT : UNIFIED, " ", this.ZERO);
      }
      this.visit(this.binaryRight(le));
    }
    this.close();
    this.pop();
  }

  hasLineBreakingCommentBefore(e: i32): boolean {
    const t = this.t;
    let prev = t.prev[e];
    while (prev >= 0 && t.type[prev] === T_WHITE_SPACE) {
      prev = t.prev[prev];
    }
    if (prev < 0 || !kIsComment(t.type[prev])) {
      return false;
    }
    if (t.type[prev] === T_EOL_COMMENT) {
      return true;
    }
    const before = t.prev[prev];
    return before >= 0 && t.type[before] === T_WHITE_SPACE && this.containsNewline(before);
  }

  visitPostfixExpression(n: i32): void {
    this.sync(n);
    this.open(this.ZERO);
    const base = this.firstExpr(n);
    const opRef = this.child(n, N_OPERATION_REFERENCE);
    this.visit(base);
    if (this.ty(base) === N_POSTFIX_EXPRESSION) {
      const bop = this.child(base, N_OPERATION_REFERENCE);
      if (this.src[this.t.end[bop] - 1] === this.src[this.t.start[opRef]]) {
        this.space();
      }
    }
    this.tokN(opRef);
    this.close();
  }

  visitPrefixExpression(n: i32): void {
    this.sync(n);
    this.open(this.ZERO);
    const opRef = this.child(n, N_OPERATION_REFERENCE);
    const base = this.exprAfter(n, opRef);
    this.tokN(opRef);
    if (this.ty(base) === N_PREFIX_EXPRESSION) {
      const bop = this.child(base, N_OPERATION_REFERENCE);
      if (this.src[this.t.end[opRef] - 1] === this.src[this.t.start[bop]]) {
        this.space();
      }
    }
    this.visit(base);
    this.close();
  }

  isLambdaOrScopingFunction(e: i32): boolean {
    if (e < 0) {
      return false;
    }
    const t = this.t;
    let prev = t.prev[e];
    while (prev >= 0 && t.type[prev] === T_WHITE_SPACE) {
      prev = t.prev[prev];
    }
    if (prev >= 0 && t.type[prev] === T_EOL_COMMENT) {
      return false;
    }
    let carry = e;
    if (this.isQualified(carry) && kIsSimpleName(this.ty(this.firstExpr(carry)))) {
      carry = this.selectorOf(carry);
    }
    if (this.ty(carry) === N_CALL_EXPRESSION) {
      const val = this.child(carry, N_VALUE_ARGUMENT_LIST);
      const lam = this.child(carry, N_LAMBDA_ARGUMENT);
      const tal = this.child(carry, N_TYPE_ARGUMENT_LIST);
      if ((val < 0 || this.child(val, T_LPAR) < 0) && lam >= 0 && (tal < 0 || this.child(tal, N_TYPE_PROJECTION) < 0)) {
        carry = this.firstExpr(lam);
      } else {
        return false;
      }
    }
    if (this.ty(carry) === N_LABELED_EXPRESSION) {
      carry = this.firstExpr(carry);
    }
    return this.ty(carry) === N_LAMBDA_EXPRESSION;
  }

  isChainedScopingFunction(e: i32): boolean {
    if (!this.isQualified(e)) {
      return false;
    }
    return this.isLambdaOrScopingFunction(this.chainRoot(e));
  }

  chainRoot(e: i32): i32 {
    let root = e;
    while (this.isQualified(root)) {
      root = this.firstExpr(root);
    }
    return root;
  }

  chainedSelectorsHaveValueArguments(e: i32): boolean {
    let current = e;
    while (this.isQualified(current)) {
      const sel = this.selectorOf(current);
      if (this.ty(sel) === N_CALL_EXPRESSION) {
        const val = this.child(sel, N_VALUE_ARGUMENT_LIST);
        if (val >= 0 && this.child(val, N_VALUE_ARGUMENT) >= 0) {
          return true;
        }
      }
      current = this.firstExpr(current);
    }
    return false;
  }

  visitChainedScopingFunction(e: i32, emitLeadingBreak: boolean): void {
    const parts = this.breakIntoParts(e);
    const root = parts[0];
    const forceBreakBeforeChain = this.isMultilineScopingFunction(root);
    this.visitLambdaOrScopingFunction(root, emitLeadingBreak);
    this.open(this.expressionBreakIndent);
    for (let i = 1; i < toI32(parts.length); i++) {
      const part = parts[i];
      if (forceBreakBeforeChain) {
        this.forced();
      } else {
        this.brk(UNIFIED, "", this.ZERO);
      }
      this.tokN(this.opSign(part));
      const sel = this.selectorOf(part);
      if (this.ty(sel) === N_CALL_EXPRESSION) {
        this.visit(this.calleeOf(sel));
        this.visitCallElement(
          -1,
          this.child(sel, N_TYPE_ARGUMENT_LIST),
          this.child(sel, N_VALUE_ARGUMENT_LIST),
          sel,
          this.expressionBreakIndent,
          this.ZERO,
          this.ZERO,
        );
      } else {
        this.visit(sel);
      }
    }
    this.close();
    this.pop();
  }

  isMultilineScopingFunction(e: i32): boolean {
    let carry = e;
    if (this.isQualified(carry) && kIsSimpleName(this.ty(this.firstExpr(carry)))) {
      carry = this.selectorOf(carry);
    }
    if (this.ty(carry) === N_CALL_EXPRESSION) {
      const lam = this.child(carry, N_LAMBDA_ARGUMENT);
      carry = lam >= 0 ? this.firstExpr(lam) : -1;
    }
    if (this.ty(carry) === N_LABELED_EXPRESSION) {
      carry = this.firstExpr(carry);
    }
    if (this.ty(carry) === N_LAMBDA_EXPRESSION) {
      return this.hasSourceNewlineInLambdaBody(carry);
    }
    return false;
  }

  hasSourceNewlineInLambdaBody(lambda: i32): boolean {
    const fl = this.child(lambda, N_FUNCTION_LITERAL);
    for (let c = this.t.first[fl]; c >= 0; c = this.t.next[c]) {
      if (this.t.type[c] === T_WHITE_SPACE && this.containsNewline(c)) {
        return true;
      }
    }
    return false;
  }

  visitLambdaOrScopingFunction(e: i32, emitLeadingBreak: boolean): void {
    const breakToExpr = this.g.genSym();
    this.brkTag(INDEPENDENT, emitLeadingBreak ? " " : "", this.expressionBreakIndent, breakToExpr);
    let carry = e;
    if (this.isQualified(carry) && kIsSimpleName(this.ty(this.firstExpr(carry)))) {
      this.visit(this.firstExpr(carry));
      this.tokN(this.opSign(carry));
      carry = this.selectorOf(carry);
    }
    if (this.ty(carry) === N_CALL_EXPRESSION) {
      this.visit(this.calleeOf(carry));
      this.space();
      carry = this.firstExpr(this.child(carry, N_LAMBDA_ARGUMENT));
    }
    if (this.ty(carry) === N_LABELED_EXPRESSION) {
      this.visit(this.child(carry, N_LABEL_QUALIFIER));
      carry = this.firstExpr(carry);
    }
    if (this.ty(carry) === N_LAMBDA_EXPRESSION) {
      this.visitLambdaExpressionInternal(carry, breakToExpr);
      return;
    }
    this.g.fail("not a lambda or scoping function");
  }

  visitPackageDirective(n: i32): void {
    this.sync(n);
    if (this.child(n, T_PACKAGE_KEYWORD) < 0) {
      return;
    }
    this.tok("package");
    this.space();
    const names = this.push();
    this.collectNames(this.firstExpr(n), names);
    for (let i = 0; i < toI32(names.length); i++) {
      if (i > 0) {
        this.tok(".");
      }
      const id = this.t.first[names[i]];
      this.tokN(id);
    }
    this.pop();
    this.g.guessToken(";");
    this.forced();
  }

  collectNames(e: i32, out: i32[]): void {
    if (e < 0) {
      return;
    }
    if (this.ty(e) === N_DOT_QUALIFIED_EXPRESSION) {
      for (let c = this.t.first[e]; c >= 0; c = this.t.next[c]) {
        if (this.t.leaf[c] === 0) {
          this.collectNames(c, out);
        }
      }
    } else if (this.ty(e) === N_REFERENCE_EXPRESSION) {
      out.push(e);
    }
  }

  visitImportDirective(n: i32): void {
    this.sync(n);
    this.tok("import");
    this.space();
    const ref = this.firstExpr(n);
    if (ref >= 0) {
      this.inImport = true;
      this.visit(ref);
      this.inImport = false;
    }
    if (this.child(n, T_MUL) >= 0) {
      this.tok(".");
      this.tok("*");
    }
    const alias = this.child(n, N_IMPORT_ALIAS);
    if (alias >= 0) {
      const id = this.child(alias, T_IDENTIFIER);
      if (id >= 0) {
        this.space();
        this.tok("as");
        this.space();
        this.tokN(id);
      }
    }
    this.g.guessToken(";");
    this.forced();
  }

  handleContextReceiverList(n: i32): void {
    this.sync(n);
    this.tok("context");
    let list = this.kidsOf(n, N_VALUE_PARAMETER);
    if (list.length === 0) {
      this.pop();
      list = this.kidsOf(n, N_CONTEXT_RECEIVER);
    }
    this.visitEachCommaSeparated(list, false, true, true, "(", ")", false, false);
    this.pop();
  }

  visitModifierList(n: i32): void {
    this.sync(n);
    let onlyAnnotationsSoFar = true;
    for (let c = this.t.first[n]; c >= 0; c = this.t.next[c]) {
      const ct = this.t.type[c];
      if (ct === T_WHITE_SPACE) {
        continue;
      }
      if (ct === N_CONTEXT_RECEIVER_LIST || ct === N_CONTEXT_PARAMETER_LIST) {
        this.handleContextReceiverList(c);
        this.forced();
        continue;
      }
      if (ktIsModifierKeyword(ct)) {
        onlyAnnotationsSoFar = false;
        this.tokN(c);
      } else {
        this.visit(c);
      }
      if (onlyAnnotationsSoFar) {
        this.brk(UNIFIED, " ", this.ZERO);
      } else {
        this.space();
      }
    }
  }

  visitAnnotatedExpression(n: i32): void {
    this.sync(n);
    this.open(this.ZERO);
    const base = this.firstExpr(n);
    this.open(this.ZERO);
    let first = true;
    for (let c = this.t.first[n]; c >= 0; c = this.t.next[c]) {
      const ct = this.t.type[c];
      if (ct === N_ANNOTATION_ENTRY) {
        if (!first) {
          this.brk(UNIFIED, " ", this.ZERO);
        }
        first = false;
        this.visit(c);
      } else if (ct === N_ANNOTATION) {
        for (let d = this.t.first[c]; d >= 0; d = this.t.next[d]) {
          if (this.t.type[d] === N_ANNOTATION_ENTRY) {
            if (!first) {
              this.brk(UNIFIED, " ", this.ZERO);
            }
            first = false;
            this.visit(d);
          }
        }
      }
    }
    this.close();
    const bt = this.ty(base);
    const p = this.t.parent[n];
    if ((bt === N_BINARY_EXPRESSION || bt === N_BINARY_WITH_TYPE) && p >= 0 && this.t.type[p] === N_BLOCK) {
      this.forced();
    } else if (bt === N_LAMBDA_EXPRESSION) {
      this.space();
    } else if (bt === N_RETURN) {
      this.forced();
    } else {
      this.brk(UNIFIED, " ", this.ZERO);
    }
    this.visit(base);
    this.close();
  }

  visitAnnotation(n: i32): void {
    this.sync(n);
    this.open(this.ZERO);
    this.tok("@");
    const target = this.child(n, N_ANNOTATION_TARGET);
    if (target >= 0) {
      this.visit(target);
      this.tok(":");
    }
    this.open(this.expressionBreakIndent);
    this.tok("[");
    this.open(this.ZERO);
    this.brk(UNIFIED, "", this.ZERO);
    let first = true;
    for (let c = this.t.first[n]; c >= 0; c = this.t.next[c]) {
      if (this.t.type[c] !== N_ANNOTATION_ENTRY) {
        continue;
      }
      if (!first) {
        this.brk(UNIFIED, " ", this.ZERO);
      }
      first = false;
      this.visit(c);
    }
    this.close();
    this.close();
    this.tok("]");
    this.close();
    this.forced();
  }

  visitAnnotationEntry(n: i32): void {
    this.sync(n);
    if (this.child(n, T_AT) >= 0) {
      this.tok("@");
    }
    const target = this.child(n, N_ANNOTATION_TARGET);
    if (target >= 0) {
      this.visit(target);
      this.tok(":");
    }
    this.visitCallElement(
      this.child(n, N_CONSTRUCTOR_CALLEE),
      -1,
      this.child(n, N_VALUE_ARGUMENT_LIST),
      -1,
      this.expressionBreakIndent,
      this.ZERO,
      this.ZERO,
    );
  }

  visitWhenExpression(n: i32): void {
    this.sync(n);
    this.open(this.ZERO);
    this.emitKeywordWithCondition("when", this.whenSubject(n), true);
    this.space();
    this.g.token("{", true, this.blockIndent, this.blockIndent);
    let index = 0;
    for (let e = this.t.first[n]; e >= 0; e = this.t.next[e]) {
      if (this.t.type[e] !== N_WHEN_ENTRY) {
        continue;
      }
      this.open(this.blockIndent);
      if (index !== 0) {
        this.g.blankLineWanted(BL_PRESERVE);
      }
      this.forced();
      this.open(this.ZERO);
      if (this.child(e, T_ELSE_KEYWORD) >= 0) {
        this.tok("else");
      } else {
        let last = -1;
        for (let c = this.t.first[e]; c >= 0; c = this.t.next[c]) {
          if (kIsWhenCondition(this.t.type[c])) {
            last = c;
          }
        }
        for (let c = this.t.first[e]; c >= 0; c = this.t.next[c]) {
          if (!kIsWhenCondition(this.t.type[c])) {
            continue;
          }
          this.visit(c);
          this.g.guessToken(",");
          if (c !== last) {
            this.forced();
          }
        }
      }
      const guard = this.child(e, N_WHEN_ENTRY_GUARD);
      if (guard >= 0) {
        this.space();
        this.emitKeywordWithCondition("if", this.firstExpr(guard), false);
      }
      this.close();
      const whenExpression = this.firstExpr(e);
      const arrow = this.child(e, T_ARROW);
      if (arrow >= 0 && this.prevIsComma(arrow)) {
        this.forced();
      } else {
        this.space();
      }
      this.tok("->");
      const wt = this.ty(whenExpression);
      if (wt === N_BLOCK || wt === N_LAMBDA_EXPRESSION) {
        this.space();
        this.visit(whenExpression);
      } else {
        this.open(this.expressionBreakIndent);
        this.brk(INDEPENDENT, " ", this.ZERO);
        this.visit(whenExpression);
        this.close();
      }
      this.g.guessToken(";");
      this.close();
      this.forced();
      index++;
    }
    this.tok("}");
    this.close();
  }

  visitIfExpression(n: i32): void {
    this.sync(n);
    this.open(this.ZERO);
    this.emitKeywordWithCondition("if", this.containerExpr(n, N_CONDITION), true);
    const then = this.containerExpr(n, N_THEN);
    const thenBlock = this.ty(then) === N_BLOCK;
    if (thenBlock) {
      this.space();
      this.open(this.ZERO);
      this.visit(then);
      this.close();
    } else {
      this.brk(INDEPENDENT, " ", this.expressionBreakIndent);
      this.open(this.expressionBreakIndent);
      this.g.fence();
      this.visit(then);
      this.close();
    }
    if (this.child(n, T_ELSE_KEYWORD) >= 0) {
      if (thenBlock) {
        this.space();
      } else {
        this.brk(UNIFIED, " ", this.ZERO);
      }
      this.open(this.ZERO);
      this.tok("else");
      const els = this.containerExpr(n, N_ELSE);
      const et = this.ty(els);
      if (et === N_BLOCK || et === N_IF) {
        this.space();
        this.open(this.ZERO);
        this.visit(els);
        this.close();
      } else {
        this.brk(INDEPENDENT, " ", this.expressionBreakIndent);
        this.open(this.expressionBreakIndent);
        this.visit(els);
        this.close();
      }
      this.close();
    }
    this.close();
  }

  visitArrayAccessBrackets(n: i32): void {
    const ind = this.child(n, N_INDICES);
    this.open(this.ZERO);
    this.tok("[");
    this.brk(UNIFIED, "", this.expressionBreakIndent);
    this.open(this.expressionBreakIndent);
    const rb = ind >= 0 ? this.child(ind, T_RBRACKET) : -1;
    this.visitEachCommaSeparated(
      ind >= 0 ? this.exprKids(ind) : this.push(),
      rb >= 0 && this.prevIsComma(rb),
      true,
      true,
      null,
      null,
      true,
      true,
    );
    this.pop();
    this.close();
    this.close();
    this.tok("]");
  }

  visitForExpression(n: i32): void {
    this.sync(n);
    this.open(this.ZERO);
    this.tok("for");
    this.space();
    this.tok("(");
    this.visit(
      this.child(n, N_VALUE_PARAMETER) >= 0
        ? this.child(n, N_VALUE_PARAMETER)
        : this.child(n, N_DESTRUCTURING_DECLARATION),
    );
    this.space();
    this.tok("in");
    this.open(this.ZERO);
    this.brk(UNIFIED, " ", this.expressionBreakIndent);
    this.open(this.expressionBreakIndent);
    this.visit(this.containerExpr(n, N_LOOP_RANGE));
    this.close();
    this.close();
    this.tok(")");
    this.space();
    this.visit(this.containerExpr(n, N_BODY));
    this.close();
  }

  visitCallableReferenceExpression(n: i32): void {
    this.sync(n);
    const cc = this.child(n, T_COLONCOLON);
    let recv = -1;
    let quest = false;
    for (let c = this.t.first[n]; c >= 0 && c !== cc; c = this.t.next[c]) {
      if (recv < 0 && kIsExpr(this.t.type[c])) {
        recv = c;
      }
      if (this.t.type[c] === T_QUEST) {
        quest = true;
      }
    }
    this.visit(recv);
    if (quest) {
      this.tok("?");
    }
    this.open(this.expressionBreakIndent);
    this.tok("::");
    this.brk(INDEPENDENT, "", this.ZERO);
    this.visit(this.exprAfter(n, cc));
    this.close();
  }

  visitIsExpression(n: i32): void {
    this.sync(n);
    const left = this.firstExpr(n);
    const openBefore = !this.isQualified(left);
    if (openBefore) {
      this.open(this.ZERO);
    }
    this.visit(left);
    if (!openBefore) {
      this.open(this.ZERO);
    }
    const p = this.t.parent[n];
    const pt = p >= 0 ? this.t.type[p] : -1;
    if (pt === N_VALUE_ARGUMENT || pt === N_PARENTHESIZED || kIsContainerNode(pt)) {
      this.brk(UNIFIED, " ", this.expressionBreakIndent);
    } else {
      this.space();
    }
    this.visit(this.child(n, N_OPERATION_REFERENCE));
    this.brk(INDEPENDENT, " ", this.expressionBreakIndent);
    this.open(this.expressionBreakIndent);
    this.visit(this.child(n, N_TYPE_REFERENCE));
    this.close();
    this.close();
  }

  visitBinaryWithTypeRHSExpression(n: i32): void {
    this.sync(n);
    const left = this.firstExpr(n);
    const openBefore = !this.isQualified(left);
    if (openBefore) {
      this.open(this.ZERO);
    }
    this.visit(left);
    if (!openBefore) {
      this.open(this.ZERO);
    }
    this.brk(UNIFIED, " ", this.expressionBreakIndent);
    this.visit(this.child(n, N_OPERATION_REFERENCE));
    this.brk(INDEPENDENT, " ", this.expressionBreakIndent);
    this.open(this.expressionBreakIndent);
    this.visit(this.child(n, N_TYPE_REFERENCE));
    this.close();
    this.close();
  }

  visitCatchSection(n: i32): void {
    this.sync(n);
    this.space();
    this.tok("catch");
    this.space();
    this.open(this.ZERO);
    this.tok("(");
    this.open(this.expressionBreakIndent);
    this.brk(UNIFIED, "", this.ZERO);
    const pl = this.child(n, N_VALUE_PARAMETER_LIST);
    this.visit(pl >= 0 ? this.child(pl, N_VALUE_PARAMETER) : -1);
    this.g.guessToken(",");
    this.close();
    this.close();
    this.tok(")");
    this.space();
    this.visit(this.child(n, N_BLOCK));
  }

  visitKtFile(n: i32): void {
    const t = this.t;
    const il = this.child(n, N_IMPORT_LIST);
    const importListEmpty = il < 0 || this.isBlank(il);
    let isFirst = true;
    for (let c = t.first[n]; c >= 0; c = t.next[c]) {
      if (this.isBlank(c)) {
        continue;
      }
      if (isFirst) {
        this.g.blankLineWanted(BL_NO);
      } else if (kIsComment(t.type[c])) {
        continue;
      } else if (t.type[c] === N_SCRIPT && importListEmpty) {
        this.g.blankLineWanted(BL_PRESERVE);
      } else {
        this.g.blankLineWanted(BL_YES);
      }
      this.visit(c);
      isFirst = false;
    }
  }

  visitScript(n: i32): void {
    const t = this.t;
    let lastChildHadBlankLineBefore = false;
    let lastChildIsContextReceiver = false;
    let first = true;
    const block = this.child(n, N_BLOCK);
    for (let c = t.first[block]; c >= 0; c = t.next[c]) {
      if (!kIsPsiChild(t, c) || this.isBlank(c)) {
        continue;
      }
      this.forced();
      const childGetsBlankLineBefore = t.type[c] !== N_PROPERTY;
      if (first) {
        this.g.blankLineWanted(BL_PRESERVE);
      } else if (lastChildIsContextReceiver) {
        this.g.blankLineWanted(BL_NO);
      } else if (!kIsComment(t.type[c]) && (childGetsBlankLineBefore || lastChildHadBlankLineBefore)) {
        this.g.blankLineWanted(BL_YES);
      }
      this.visit(c);
      this.g.guessToken(";");
      lastChildHadBlankLineBefore = childGetsBlankLineBefore;
      lastChildIsContextReceiver = false;
      if (t.type[c] === N_SCRIPT_INITIALIZER) {
        const a = t.first[c];
        const b = a >= 0 ? t.first[a] : -1;
        const d = b >= 0 ? t.first[b] : -1;
        lastChildIsContextReceiver = d >= 0 && this.textIs(d, "context");
      }
      first = false;
    }
  }

  emitKeywordWithCondition(keyword: string, condition: i32, parens: boolean): void {
    if (condition < 0) {
      this.tok(keyword);
      return;
    }
    this.open(this.ZERO);
    this.tok(keyword);
    this.space();
    if (parens) {
      this.tok("(");
    }
    this.open(this.expressionBreakIndent);
    this.brk(UNIFIED, "", this.ZERO);
    this.visit(condition);
    this.brk(UNIFIED, "", this.expressionBreakNegativeIndent);
    this.close();
    this.close();
    if (parens) {
      this.tok(")");
    }
  }

  // ---- PSI accessors ---------------------------------------------------------

  ty(n: i32): i32 {
    return n >= 0 ? this.t.type[n] : -1;
  }

  /** The first child of type `type`, or -1. */
  child(n: i32, type: i32): i32 {
    if (n < 0) {
      return -1;
    }
    for (let c = this.t.first[n]; c >= 0; c = this.t.next[c]) {
      if (this.t.type[c] === type) {
        return c;
      }
    }
    return -1;
  }

  /** The next sibling after `c` of type `type`, or -1. */
  childAfter(c: i32, type: i32): i32 {
    if (c < 0) {
      return -1;
    }
    for (let d = this.t.next[c]; d >= 0; d = this.t.next[d]) {
      if (this.t.type[d] === type) {
        return d;
      }
    }
    return -1;
  }

  /** findChildByClass(KtExpression). */
  firstExpr(n: i32): i32 {
    if (n < 0) {
      return -1;
    }
    for (let c = this.t.first[n]; c >= 0; c = this.t.next[c]) {
      if (kIsExpr(this.t.type[c])) {
        return c;
      }
    }
    return -1;
  }

  /** The first expression sibling after `c`. */
  exprAfter(n: i32, c: i32): i32 {
    if (c < 0) {
      return -1;
    }
    for (let d = this.t.next[c]; d >= 0; d = this.t.next[d]) {
      if (kIsExpr(this.t.type[d])) {
        return d;
      }
    }
    return -1;
  }

  /** PsiTreeUtil.getNextSiblingOfType(findChildByType(tok), KtExpression). */
  exprAfterTok(n: i32, tok: i32): i32 {
    return this.exprAfter(n, this.child(n, tok));
  }

  /** A KtContainerNode child's expression. */
  containerExpr(n: i32, container: i32): i32 {
    return this.firstExpr(this.child(n, container));
  }

  /** The children of type `type` (a scratch list; pop it). */
  kidsOf(n: i32, type: i32): i32[] {
    const l = this.push();
    if (n < 0) {
      return l;
    }
    for (let c = this.t.first[n]; c >= 0; c = this.t.next[c]) {
      if (this.t.type[c] === type) {
        l.push(c);
      }
    }
    return l;
  }

  /** The expression children (a scratch list; pop it). */
  exprKids(n: i32): i32[] {
    const l = this.push();
    for (let c = this.t.first[n]; c >= 0; c = this.t.next[c]) {
      if (kIsExpr(this.t.type[c])) {
        l.push(c);
      }
    }
    return l;
  }

  paramsOf(pl: i32): i32[] {
    return this.kidsOf(pl, N_VALUE_PARAMETER);
  }

  superTypeEntries(n: i32): i32[] {
    const l = this.push();
    for (let c = this.t.first[n]; c >= 0; c = this.t.next[c]) {
      const ct = this.t.type[c];
      if (ct === N_SUPER_TYPE_ENTRY || ct === N_SUPER_TYPE_CALL_ENTRY || ct === N_DELEGATED_SUPER_TYPE_ENTRY) {
        l.push(c);
      }
    }
    return l;
  }

  /** getChildren(): composite children and KDoc (a scratch list; pop it). */
  psiChildren(n: i32): i32[] {
    const l = this.push();
    if (n < 0) {
      return l;
    }
    for (let c = this.t.first[n]; c >= 0; c = this.t.next[c]) {
      if (kIsPsiChild(this.t, c)) {
        l.push(c);
      }
    }
    return l;
  }

  isQualified(n: i32): boolean {
    const t = this.ty(n);
    return t === N_DOT_QUALIFIED_EXPRESSION || t === N_SAFE_ACCESS_EXPRESSION;
  }

  /** The `.` or `?.` of a qualified expression. */
  opSign(n: i32): i32 {
    const d = this.child(n, T_DOT);
    return d >= 0 ? d : this.child(n, T_SAFE_ACCESS);
  }

  selectorOf(n: i32): i32 {
    return this.exprAfter(n, this.opSign(n));
  }

  calleeOf(call: i32): i32 {
    return this.firstExpr(call);
  }

  /** The LABEL of a `this`/`return` target. */
  targetLabel(n: i32): i32 {
    return this.child(this.child(n, N_LABEL_QUALIFIER), N_LABEL);
  }

  /** The type of the operation reference's token. */
  opToken(n: i32): i32 {
    const r = this.child(n, N_OPERATION_REFERENCE);
    return r >= 0 && this.t.first[r] >= 0 ? this.t.type[this.t.first[r]] : -1;
  }

  binaryLeft(n: i32): i32 {
    const r = this.child(n, N_OPERATION_REFERENCE);
    for (let c = this.t.prev[r]; c >= 0; c = this.t.prev[c]) {
      if (kIsExpr(this.t.type[c])) {
        return c;
      }
    }
    return -1;
  }

  binaryRight(n: i32): i32 {
    return this.exprAfter(n, this.child(n, N_OPERATION_REFERENCE));
  }

  whenSubject(n: i32): i32 {
    const lp = this.child(n, T_LPAR);
    if (lp < 0) {
      return -1;
    }
    for (let c = this.t.next[lp]; c >= 0; c = this.t.next[c]) {
      const ct = this.t.type[c];
      if (ct === T_RPAR) {
        return -1;
      }
      if (kIsExpr(ct)) {
        return c;
      }
    }
    return -1;
  }

  valOrVar(n: i32): i32 {
    for (let c = this.t.first[n]; c >= 0; c = this.t.next[c]) {
      const ct = this.t.type[c];
      if (ct === T_VAL_KEYWORD || ct === T_VAR_KEYWORD) {
        return c;
      }
    }
    return -1;
  }

  /** The receiver type: the first type reference before `:` (and, for functions, before `(`). */
  receiverTypeRef(n: i32, fun: boolean): i32 {
    for (let c = this.t.first[n]; c >= 0; c = this.t.next[c]) {
      const ct = this.t.type[c];
      if (ct === T_COLON || (fun && ct === T_LPAR)) {
        return -1;
      }
      if (fun && ct === N_VALUE_PARAMETER_LIST) {
        return -1;
      }
      if (ct === N_TYPE_REFERENCE) {
        return c;
      }
    }
    return -1;
  }

  /** TypeRefHelpers.getTypeReference: the first type reference after the first `:`. */
  typeRefAfterColon(n: i32): i32 {
    const colon = this.child(n, T_COLON);
    return colon >= 0 ? this.childAfter(colon, N_TYPE_REFERENCE) : -1;
  }

  /** KtNamedFunction.getTypeReference. */
  funReturnType(n: i32): i32 {
    return this.typeRefAfterColon(n);
  }

  hasModifier(n: i32, kw: i32): boolean {
    return this.child(this.child(n, N_MODIFIER_LIST), kw) >= 0;
  }

  /** hasEmptyParens: `(` then `)` with only whitespace between. */
  hasEmptyParens(list: i32): boolean {
    const lp = this.child(list, T_LPAR);
    if (lp < 0 || this.child(list, T_RPAR) < 0) {
      return false;
    }
    let c = this.t.next[lp];
    while (c >= 0 && this.t.type[c] === T_WHITE_SPACE) {
      c = this.t.next[c];
    }
    return c >= 0 && this.t.type[c] === T_RPAR;
  }

  /** getTrailingCommaByClosingElement of the list's closing `close` token. */
  trailingCommaBefore(list: i32, close: i32): boolean {
    let last = -1;
    for (let c = this.t.first[list]; c >= 0; c = this.t.next[c]) {
      if (this.t.type[c] === close) {
        last = c;
      }
    }
    return last >= 0 && this.prevIsComma(last);
  }

  /** Whether the sibling before `c`, past whitespace and comments, is a comma. */
  prevIsComma(c: i32): boolean {
    let p = this.t.prev[c];
    while (p >= 0 && (this.t.type[p] === T_WHITE_SPACE || kIsComment(this.t.type[p]))) {
      p = this.t.prev[p];
    }
    return p >= 0 && this.t.type[p] === T_COMMA;
  }

  /** KtParameterList.getTrailingComma. */
  trailingCommaOfParams(pl: i32): boolean {
    const p = this.t.parent[pl];
    if (p >= 0 && this.t.type[p] === N_FUNCTION_LITERAL) {
      let last = this.t.last[pl];
      if (last >= 0 && kIsComment(this.t.type[last])) {
        last = this.t.prev[last];
        while (last >= 0 && (this.t.type[last] === T_WHITE_SPACE || kIsComment(this.t.type[last]))) {
          last = this.t.prev[last];
        }
      }
      return last >= 0 && this.t.type[last] === T_COMMA;
    }
    return this.trailingCommaBefore(pl, T_RPAR);
  }

  // ---- Text ------------------------------------------------------------------

  textOf(n: i32): string {
    return String.fromBytes(this.src, this.t.start[n], this.t.end[n]);
  }

  textIs(n: i32, s: string): boolean {
    const a = this.t.start[n];
    const k = toI32(s.length);
    if (this.t.end[n] - a !== k) {
      return false;
    }
    for (let i = 0; i < k; i++) {
      if (toI32(this.src[a + i]) !== s.charCodeAt(i)) {
        return false;
      }
    }
    return true;
  }

  /** The node's text length in UTF-16 units. */
  textLen(n: i32): i32 {
    let len = 0;
    for (let i = this.t.start[n]; i < this.t.end[n]; i++) {
      const c = toI32(this.src[i]);
      if (c < 0x80 || c >= 0xc0) {
        len += c >= 0xf0 ? 2 : 1;
      }
    }
    return len;
  }

  isBlank(n: i32): boolean {
    for (let i = this.t.start[n]; i < this.t.end[n]; i++) {
      const c = toI32(this.src[i]);
      if (c !== 32 && c !== 9 && c !== 10 && c !== 13 && c !== 12 && c !== 11) {
        return false;
      }
    }
    return true;
  }

  containsNewline(n: i32): boolean {
    for (let i = this.t.start[n]; i < this.t.end[n]; i++) {
      if (toI32(this.src[i]) === 10) {
        return true;
      }
    }
    return false;
  }

  /** Whether the node's text starts with an uppercase letter (Char.isUpperCase). */
  firstIsUpper(n: i32): boolean {
    if (n < 0 || this.t.end[n] <= this.t.start[n]) {
      return false;
    }
    const a = this.t.start[n];
    const c = toI32(this.src[a]);
    if (c < 0x80) {
      return c >= 65 && c <= 90;
    }
    return kIsUpperCodePoint(kDecodeAt(this.src, a, this.t.end[n]));
  }
}

const kReverse = (a: i32[]): void => {
  let i = 0;
  let j = toI32(a.length) - 1;
  while (i < j) {
    const x = a[i];
    a[i] = a[j];
    a[j] = x;
    i++;
    j--;
  }
};

/** The code point at `a`. */
const kDecodeAt = (src: u8[], a: i32, e: i32): i32 => {
  const c = toI32(src[a]);
  if (c < 0xe0 && a + 1 < e) {
    return ((c & 0x1f) << 6) | (toI32(src[a + 1]) & 0x3f);
  }
  if (c < 0xf0 && a + 2 < e) {
    return ((c & 0x0f) << 12) | ((toI32(src[a + 1]) & 0x3f) << 6) | (toI32(src[a + 2]) & 0x3f);
  }
  if (a + 3 < e) {
    return (
      ((c & 0x07) << 18) |
      ((toI32(src[a + 1]) & 0x3f) << 12) |
      ((toI32(src[a + 2]) & 0x3f) << 6) |
      (toI32(src[a + 3]) & 0x3f)
    );
  }
  return c;
};

/** Uppercase letters outside ASCII, for the scripts identifiers use in practice. */
const kIsUpperCodePoint = (cp: i32): boolean => {
  if (cp >= 0xc0 && cp <= 0xde && cp !== 0xd7) {
    return true;
  }
  if (cp >= 0x100 && cp <= 0x17f) {
    return (cp & 1) === 0 && cp !== 0x138;
  }
  if (cp >= 0x391 && cp <= 0x3ab && cp !== 0x3a2) {
    return true;
  }
  if (cp >= 0x400 && cp <= 0x42f) {
    return true;
  }
  return false;
};

const kIsSimpleName = (t: i32): boolean =>
  t === N_REFERENCE_EXPRESSION ||
  t === N_OPERATION_REFERENCE ||
  t === N_LABEL ||
  t === N_ENUM_ENTRY_SUPERCLASS_REFERENCE_EXPRESSION;

const kIsAssignment = (op: i32): boolean =>
  op === T_EQ || op === T_PLUSEQ || op === T_MINUSEQ || op === T_MULTEQ || op === T_DIVEQ || op === T_PERCEQ;

const kIsWhenCondition = (t: i32): boolean =>
  t === N_WHEN_CONDITION_EXPRESSION || t === N_WHEN_CONDITION_IS_PATTERN || t === N_WHEN_CONDITION_IN_RANGE;

const kIsContainerNode = (t: i32): boolean =>
  t === N_CONDITION ||
  t === N_THEN ||
  t === N_ELSE ||
  t === N_LOOP_RANGE ||
  t === N_BODY ||
  t === N_INDICES ||
  t === N_LABEL_QUALIFIER;

const kIsTypeElement = (t: i32): boolean =>
  t === N_USER_TYPE ||
  t === N_NULLABLE_TYPE ||
  t === N_FUNCTION_TYPE ||
  t === N_DYNAMIC_TYPE ||
  t === N_INTERSECTION_TYPE;

/** Whether nodes of this type are KtExpressions. */
export const kIsExpr = (t: i32): boolean => {
  switch (t) {
    case N_FUN:
    case N_PROPERTY:
    case N_CLASS:
    case N_OBJECT_DECLARATION:
    case N_TYPEALIAS:
    case N_DESTRUCTURING_DECLARATION:
    case N_DESTRUCTURING_DECLARATION_ENTRY:
    case N_ENUM_ENTRY:
    case N_CLASS_INITIALIZER:
    case N_SCRIPT_INITIALIZER:
    case N_SECONDARY_CONSTRUCTOR:
    case N_PRIMARY_CONSTRUCTOR:
    case N_VALUE_PARAMETER:
    case N_TYPE_PARAMETER:
    case N_PROPERTY_ACCESSOR:
    case N_BACKING_FIELD:
    case N_SCRIPT:
    case N_NULL:
    case N_BOOLEAN_CONSTANT:
    case N_FLOAT_CONSTANT:
    case N_CHARACTER_CONSTANT:
    case N_INTEGER_CONSTANT:
    case N_STRING_TEMPLATE:
    case N_PARENTHESIZED:
    case N_RETURN:
    case N_THROW:
    case N_CONTINUE:
    case N_BREAK:
    case N_IF:
    case N_TRY:
    case N_FOR:
    case N_WHILE:
    case N_DO_WHILE:
    case N_BLOCK:
    case N_LAMBDA_EXPRESSION:
    case N_FUNCTION_LITERAL:
    case N_ANNOTATED_EXPRESSION:
    case N_REFERENCE_EXPRESSION:
    case N_ENUM_ENTRY_SUPERCLASS_REFERENCE_EXPRESSION:
    case N_OPERATION_REFERENCE:
    case N_LABEL:
    case N_THIS_EXPRESSION:
    case N_SUPER_EXPRESSION:
    case N_BINARY_EXPRESSION:
    case N_BINARY_WITH_TYPE:
    case N_IS_EXPRESSION:
    case N_PREFIX_EXPRESSION:
    case N_POSTFIX_EXPRESSION:
    case N_LABELED_EXPRESSION:
    case N_CALL_EXPRESSION:
    case N_ARRAY_ACCESS_EXPRESSION:
    case N_DOT_QUALIFIED_EXPRESSION:
    case N_CALLABLE_REFERENCE_EXPRESSION:
    case N_CLASS_LITERAL_EXPRESSION:
    case N_SAFE_ACCESS_EXPRESSION:
    case N_OBJECT_LITERAL:
    case N_WHEN:
    case N_COLLECTION_LITERAL_EXPRESSION:
    case N_CONSTRUCTOR_CALLEE:
    case N_CONSTRUCTOR_DELEGATION_REFERENCE:
      return true;
    default:
      return false;
  }
};
