// The structural parser: tokens to unwrapped lines.
//
// An unwrapped line is what the formatter lays out on its own: a statement, a declaration,
// a block's opening line, its closing `}`. A lambda's body is a list of child
// lines hung on its `{`, so the lambda stays inside the statement that holds
// it. Preprocessor branches are not forked: every directive is a line of its
// own and the code around it is parsed straight through.

import { Doc } from "./doc";
import { requiresIsClause } from "./classify";
import {
  isIdentKind,
  P_HASHHASH,
  KW_NOEXCEPT,
  P_LESSLESSEQUAL,
  P_GREATERGREATEREQUAL,
  P_CARETEQUAL,
  P_PIPEEQUAL,
  P_AMPEQUAL,
  P_PERCENTEQUAL,
  P_SLASHEQUAL,
  P_STAREQUAL,
  P_MINUSEQUAL,
  P_PLUSEQUAL,
  P_LESSLESS,
  P_PERCENT,
  P_SLASH,
  P_ARROWSTAR,
  P_PERIODSTAR,
  BK_BLOCK,
  BK_BRACED_INIT,
  BK_UNKNOWN,
  isSimpleTypeKind,
  isWordKind,
  K_COMMENT,
  K_EOF,
  K_IDENT,
  KW_ASM,
  K_STRING,
  KW_CASE,
  KW_CATCH,
  KW_CLASS,
  KW_CONSTEXPR,
  KW_DEFAULT,
  KW_DELETE,
  KW_DO,
  KW_ELSE,
  KW_ENUM,
  KW_EXTERN,
  KW_FOR,
  KW_IF,
  KW_INLINE,
  KW_NAMESPACE,
  KW_NEW,
  KW_OPERATOR,
  KW_PRIVATE,
  KW_PROTECTED,
  KW_PUBLIC,
  KW_STRUCT,
  KW_SWITCH,
  KW_TRY,
  KW_UNION,
  KW_WHILE,
  KW_ALIGNAS,
  KW_ATTRIBUTE,
  KW_BREAK,
  KW_TYPEDEF,
  K_NUMBER,
  K_CHAR,
  LT_IMPORT,
  LT_OTHER,
  LT_PREPROCESSOR,
  P_ARROW,
  P_COLON,
  P_COLONCOLON,
  P_COMMA,
  P_ELLIPSIS,
  P_EQUAL,
  P_GREATER,
  P_HASH,
  P_LBRACE,
  P_LESS,
  P_LPAREN,
  P_LSQUARE,
  P_PERIOD,
  P_QUESTION,
  P_RBRACE,
  P_RPAREN,
  P_RSQUARE,
  P_SEMI,
  KW_AUTO,
  KW_TRUE,
  KW_FALSE,
  KW_TYPENAME,
  KW_CONSTEVAL,
  KW_MUTABLE,
  KW_STATIC,
  KW_CONST,
  KW_VOLATILE,
  P_AMP,
  P_AMPAMP,
  P_STAR,
  PP_INCLUDE,
  PP_NONE,
  TT_CLASS_LBRACE,
  TT_CONTROL_STATEMENT_LBRACE,
  TT_ELSE_LBRACE,
  TT_ENUM_LBRACE,
  TT_FUNCTION_LBRACE,
  TT_BLOCK_LITERAL_LBRACE,
  TT_DO_WHILE,
  TT_INLINE_ASM_BRACE,
  TT_LAMBDA_LBRACE,
  TT_LAMBDA_LSQUARE,
  TT_NAMESPACE_LBRACE,
  TT_STRUCT_LBRACE,
  TT_UNION_LBRACE,
  TT_CASE_LABEL_COLON,
  TT_UNKNOWN,
  TT_LAMBDA_ARROW,
  binPrecedence,
  PREC_COMMA,
  KW_REQUIRES,
  P_PIPEPIPE,
  P_EXCLAIM,
  KW_RETURN,
  KW_TEMPLATE,
  PP_DEFINE,
  P_CARET,
  P_TILDE,
  P_EQUALEQUAL,
  P_EXCLAIMEQUAL,
  P_GREATEREQUAL,
  P_LESSEQUAL,
  P_MINUS,
  P_MINUSMINUS,
  P_AT,
  P_PIPE,
  P_PLUS,
  P_PLUSPLUS,
} from "./tok";

export class Parser {
  macro: i32 = -1; // the directive whose body is being parsed, or -1
  eofLine: i32 = -1; // the last line a statement ended at the end of the input
  macroBodyStart: i32 = 0; // the first line of the macro body being parsed
  inUnbraced: boolean = false; // parsing an unbraced control body's statement
  unbracedLevel: i32 = 0; // unbraced if/else/loop bodies the parse is inside (clang-format's UnbracedBodyLevel)
  inRequiresExpr: boolean = false; // parsing a requires expression's body
  compoundReqs: i32[]; // the `{` of each compound requirement (clang-format's TT_CompoundRequirementLBrace)
  objcDepth: i32 = 0; // inside an Objective-C @interface/@protocol body (parseObjCUntilAtEnd)
  // Per line list (index: its parent `{` + 1, 0 for the top): the last line
  // that is no directive, and the line before it in the list (-1: none).
  codeTail: i32[];
  codeTailPrev: i32[];
  d: Doc;
  pos: i32 = 0;
  first: i32 = -1;
  last: i32 = -1;
  level: i32 = 0;
  lineLevel: i32 = 0;
  linePP: i32 = 0;
  mustDecl: boolean = true;
  listParent: i32 = -1; // the `{` collecting child lines, or -1 for the top
  rbraceOpen: i32 = -1; // line index of the block a `}` line closes
  macroList: i32 = -2; // the list a macro body's own lines go to

  constructor(d: Doc) {
    this.d = d;
    this.codeTail = new Array<i32>(0);
    this.codeTailPrev = new Array<i32>(0);
    this.compoundReqs = new Array<i32>(0);
  }

  cur(): i32 {
    // Inside a macro body, the end of the directive ends the input.
    if (this.macro >= 0 && this.d.ppId[this.pos] !== this.macro) {
      return K_EOF;
    }
    return this.d.kind[this.pos];
  }

  /** The kind of the token `k` places after `pos`, skipping comments. */
  peek(k: i32): i32 {
    let i = this.pos;
    let left = k;
    while (true) {
      i++;
      if (i >= this.d.ntok) {
        return K_EOF;
      }
      const kk = this.d.kind[i];
      if (kk === K_COMMENT) {
        continue;
      }
      left--;
      if (left === 0) {
        return kk;
      }
    }
  }

  /** The index of the next non-comment token after `i`. */
  nextNonComment(i: i32): i32 {
    let j = i + 1;
    while (j < this.d.ntok - 1 && this.d.kind[j] === K_COMMENT) {
      j++;
    }
    return j;
  }

  /** Appends the current token to the line being built. */
  push(): void {
    const d = this.d;
    const t = this.pos;
    if (this.first < 0) {
      this.first = t;
      this.lineLevel = this.level;
      this.linePP = d.inPP[t];
      d.prv[t] = -1;
    } else {
      d.nxt[this.last] = t;
      d.prv[t] = this.last;
    }
    d.nxt[t] = -1;
    this.last = t;
    if (this.pos < d.ntok - 1) {
      this.pos = this.pos + 1;
    }
  }

  /** Ends the line being built, taking trailing comments on the same line. */
  addLine(): void {
    const d = this.d;
    if (this.first < 0) {
      return;
    }
    while (d.kind[this.pos] === K_COMMENT && d.nl[this.pos] === 0 && this.pos < d.ntok - 1) {
      this.push();
    }
    this.finishLine(LT_OTHER);
  }

  finishLine(type: i32): void {
    const d = this.d;
    const l = d.nline;
    d.growLines(l);
    d.lFirst[l] = this.first;
    d.lLast[l] = this.last;
    d.lLevel[l] = this.lineLevel;
    d.lPP[l] = this.linePP;
    d.lType[l] = type;
    d.lMustDecl[l] = this.mustDecl ? 1 : 0;
    d.lMightFn[l] = 0;
    d.lMultiVar[l] = 0;
    d.lSibling[l] = -1;
    // A macro body's line is indented from the margin even inside a block
    // (clang-format moves directives out of the line being built).
    d.lAbs[l] = this.macro >= 0 && this.listParent === this.macroList ? 1 : 0;
    d.lInlineCmt[l] = 0;
    d.lParent[l] = this.listParent;
    d.lOpen[l] = -1;
    d.lNamespace[l] = 0;
    d.lInvalid[l] = 0;
    d.lInClass[l] = 0;
    d.lRetWrap[l] = 0;
    d.lDefCode[l] = 0;
    d.lObjC[l] = 0;
    if (d.kind[this.first] === P_RBRACE) {
      d.lOpen[l] = this.rbraceOpen;
    }
    if (this.linePP === 0 && d.kind[this.first] !== K_COMMENT) {
      const li = this.listParent + 1;
      if (toI32(this.codeTail.length) <= li) {
        const n = (li > d.ntok ? li : d.ntok) + 2;
        this.codeTail = growFill(this.codeTail, n);
        this.codeTailPrev = growFill(this.codeTailPrev, n);
      }
      this.codeTail[li] = l;
      this.codeTailPrev[li] = this.listParent < 0 ? d.topTail : d.childTail[this.listParent];
    }
    if (this.listParent < 0) {
      if (d.topTail < 0) {
        d.topHead = l;
      } else {
        d.lSibling[d.topTail] = l;
      }
      d.topTail = l;
    } else {
      const p = this.listParent;
      if (d.childTail[p] < 0) {
        d.childHead[p] = l;
      } else {
        d.lSibling[d.childTail[p]] = l;
      }
      d.childTail[p] = l;
      d.childCount[p] = d.childCount[p] + 1;
    }
    d.nline = l + 1;
    this.first = -1;
    this.last = -1;
  }

  /** Parses the whole file. */
  parseFile(): void {
    this.parseLevel(false);
    this.addLine();
  }

  /** Parses structural elements until EOF or (in a block) a `}`. */
  parseLevel(inBlock: boolean): void {
    let switchLabel = false;
    while (true) {
      const k = this.cur();
      // clang-format's SwitchLabelEncountered: the first label of a macro
      // body at level 1 takes the body a level deeper.
      if (!switchLabel && (k === KW_CASE || (k === KW_DEFAULT && this.peek(1) === P_COLON))) {
        if (this.macro >= 0 && this.level === 1) {
          this.level = this.level + 1;
        }
        switchLabel = true;
      }
      if (k === K_EOF) {
        // An unclosed block ends with the file, as clang-format reads it.
        return;
      }
      if (k === P_RBRACE) {
        if (inBlock) {
          return;
        }
        // A stray `}`: a line of its own, as clang-format reads it.
        this.rbraceOpen = -1;
        this.push();
        this.addLine();
        continue;
      }
      this.parseStructuralElement();
    }
  }

  /** Emits each comment that starts a line as a line of its own. */
  flushComments(): boolean {
    const d = this.d;
    let any = false;
    while (this.cur() === K_COMMENT && this.first < 0 && this.continuesTrailingComment()) {
      // An own-line comment under a trailing comment continues it: same line.
      const prevLine = this.pendingLine(true);
      const t = this.pos;
      const last = d.lLast[prevLine];
      d.nxt[last] = t;
      d.prv[t] = last;
      d.nxt[t] = -1;
      d.lLast[prevLine] = t;
      if (this.pos < d.ntok - 1) {
        this.pos = this.pos + 1;
      }
      any = true;
    }
    while (this.cur() === K_COMMENT && this.first < 0) {
      // `/* x */ code` on one line belongs to the code.
      const n = this.pos + 1;
      if (
        d.at(d.start[this.pos] + 1) === 42 &&
        n < d.ntok &&
        d.nl[n] === 0 &&
        d.kind[n] !== K_COMMENT &&
        d.kind[n] !== K_EOF
      ) {
        break;
      }
      this.push();
      // A comment followed by more on its own line keeps them.
      while (d.kind[this.pos] === K_COMMENT && d.nl[this.pos] === 0 && this.pos < d.ntok - 1) {
        this.push();
      }
      this.finishLine(LT_OTHER);
      any = true;
    }
    return any;
  }

  /**
   * flushComments for own-line comments read before a directive: clang-format
   * 23's readToken flushes them at the line's level less the unbraced bodies
   * it is inside (UnbracedBodyLevel), braces and child blocks included.
   */
  flushDirectiveComments(): boolean {
    const save = this.level;
    this.level = this.level > this.unbracedLevel ? this.level - this.unbracedLevel : 0;
    const any = this.flushComments();
    this.level = save;
    return any;
  }

  /**
   * clang-format's distributeComments: among the comments between two code
   * tokens, the first after the first that sits at the next token's column,
   * and every comment after it, starts a new section. Whether comment `t` is
   * one of those.
   */
  alignedWithNext(t: i32): boolean {
    const d = this.d;
    let s0 = t;
    while (s0 > 0 && d.kind[s0 - 1] === K_COMMENT) {
      s0--;
    }
    let n = t;
    while (n < d.ntok - 1 && d.kind[n] === K_COMMENT) {
      n++;
    }
    if (d.kind[n] === K_EOF) {
      return false;
    }
    const nc = d.origCol(n);
    for (let i = s0 + 1; i < n && i <= t; i++) {
      if (d.origCol(i) === nc) {
        return true;
      }
    }
    return false;
  }

  /**
   * Whether the comment at the current position, alone on the next line,
   * continues the trailing line comment that ends the previous line: it
   * starts right of the previous line's first token.
   */
  continuesTrailingComment(): boolean {
    const d = this.d;
    const t = this.pos;
    if (d.nl[t] !== 1 || d.unesc[t] !== 1 || d.at(d.start[t] + 1) !== 47 || d.inPP[t] === 1) {
      return false;
    }
    if (this.alignedWithNext(t)) {
      return false;
    }
    const prevLine = this.pendingLine(false);
    if (prevLine < 0 || d.lPP[prevLine] === 1) {
      return false;
    }
    const last = d.lLast[prevLine];
    const f = d.lFirst[prevLine];
    if (last === f || d.kind[last] !== K_COMMENT || d.at(d.start[last] + 1) !== 47 || d.kind[f] === K_COMMENT) {
      return false;
    }
    // The min column token: a `{` before a line comment, else the last token starting a source line.
    let minTok = f;
    for (let q = f; q >= 0; q = d.nxt[q]) {
      const n = d.nxt[q];
      if (n >= 0 && d.kind[q] === P_LBRACE && d.kind[n] === K_COMMENT && d.at(d.start[n] + 1) === 47) {
        minTok = q;
        break;
      }
      if (q !== f && d.nl[q] > 0) {
        minTok = q;
      }
    }
    const isLine = d.kind[minTok] === K_COMMENT && d.at(d.start[minTok] + 1) === 47;
    return d.origCol(t) >= d.origCol(minTok) + (isLine ? 0 : 1);
  }

  /**
   * The line a comment read now is distributed against (clang-format's
   * pending Line): the list's last line, or, when directive lines end the
   * list, the line they were read after (clang-format adds directives read
   * while a line is pending after that line). With `move`, those directive
   * lines are put before it, as directives inside a statement are, so the
   * comment can join it.
   */
  pendingLine(move: boolean): i32 {
    const d = this.d;
    const tail = this.listParent < 0 ? d.topTail : d.childTail[this.listParent];
    if (tail < 0 || d.lPP[tail] !== 1 || this.macro >= 0) {
      return tail;
    }
    const li = this.listParent + 1;
    if (li >= toI32(this.codeTail.length) || this.codeTail[li] < 0) {
      return tail;
    }
    const l = this.codeTail[li];
    // (Only directive lines and the comment lines flushed before them may
    // follow it, read right after its last token.)
    for (let x = d.lSibling[l]; x >= 0; x = d.lSibling[x]) {
      if (d.lPP[x] !== 1 && !this.commentOnly(x)) {
        return tail;
      }
    }
    let q = d.lLast[l] + 1;
    while (
      q < this.pos &&
      (d.kind[q] === K_COMMENT || d.inPP[q] === 1 || (d.kind[q] === P_HASH && d.ppKind[q] !== PP_NONE))
    ) {
      q++;
    }
    if (q !== this.pos || d.kind[d.lLast[l]] !== K_COMMENT) {
      return tail;
    }
    if (!move) {
      return l;
    }
    const before = this.codeTailPrev[li];
    const dHead = d.lSibling[l];
    for (let x = dHead; x >= 0; x = d.lSibling[x]) {
      if (d.lPP[x] !== 1) {
        // Parked with the directives: clang-format flushed them there.
        d.lInlineCmt[x] = 1;
      }
    }
    if (before < 0) {
      if (this.listParent < 0) {
        d.topHead = dHead;
      } else {
        d.childHead[this.listParent] = dHead;
      }
    } else {
      d.lSibling[before] = dHead;
    }
    d.lSibling[tail] = l;
    d.lSibling[l] = -1;
    if (this.listParent < 0) {
      d.topTail = l;
    } else {
      d.childTail[this.listParent] = l;
    }
    this.codeTailPrev[li] = tail;
    return l;
  }

  /** Whether line `x` holds comments only. */
  commentOnly(x: i32): boolean {
    const d = this.d;
    for (let t = d.lFirst[x]; t >= 0; t = d.nxt[t]) {
      if (d.kind[t] !== K_COMMENT) {
        return false;
      }
    }
    return true;
  }

  /** A preprocessor directive: every token of it is one line. */
  parsePP(): void {
    const d = this.d;
    // A directive in the middle of a statement ends the statement's line.
    this.addLine();
    const hash = this.pos;
    if (d.ppKind[hash] === PP_DEFINE && this.macro < 0 && d.len(hash + 1) === 6 && d.at(d.start[hash + 1]) === 100) {
      this.parseDefine(hash);
      return;
    }
    const isInclude = d.ppKind[hash] === PP_INCLUDE;
    this.push();
    while (d.inPP[this.pos] === 1 && d.kind[this.pos] !== K_EOF && d.ppKind[this.pos] === PP_NONE) {
      this.push();
    }
    this.finishLine(isInclude ? LT_IMPORT : LT_PREPROCESSOR);
  }

  /**
   * `#define NAME(params) body`: the head is a line of its own and the body
   * is parsed as code, one indent in, as clang-format formats a macro.
   */
  parseDefine(hash: i32): void {
    const d = this.d;
    this.push(); // #
    this.push(); // define
    if (d.ppId[this.pos] === hash && isWordKind(d.kind[this.pos])) {
      this.push();
      if (d.ppId[this.pos] === hash && d.kind[this.pos] === P_LPAREN && d.ws[this.pos] === 0) {
        let depth = 0;
        while (d.ppId[this.pos] === hash) {
          const k = d.kind[this.pos];
          if (k === P_LPAREN) {
            depth++;
          } else if (k === P_RPAREN) {
            depth--;
          }
          this.push();
          if (depth === 0) {
            break;
          }
        }
      }
    }
    // Comments on the head's own line join it (clang-format's
    // distributeComments); one after an escaped newline starts the body.
    while (d.ppId[this.pos] === hash && d.kind[this.pos] === K_COMMENT && d.nl[this.pos] === 0) {
      this.push();
    }
    this.finishLine(LT_PREPROCESSOR);
    d.lDefCode[d.nline - 1] = 1;
    if (d.ppId[this.pos] !== hash) {
      return;
    }
    const saveLevel = this.level;
    const saveDecl = this.mustDecl;
    this.level = 1;
    this.macro = hash;
    const saveBodyStart = this.macroBodyStart;
    this.macroBodyStart = this.d.nline;
    const saveList = this.macroList;
    this.macroList = this.listParent;
    // clang-format parses a macro body with MustBeDeclaration off.
    this.mustDecl = false;
    this.parseLevel(false);
    this.addLine();
    this.macroBodyStart = saveBodyStart;
    this.macroList = saveList;
    this.macro = -1;
    this.level = saveLevel;
    this.mustDecl = saveDecl;
  }

  parseStructuralElement(): void {
    const d = this.d;
    // In a child block, own-line comments before a directive are read while
    // the line before them is pending: clang-format flushes them with the
    // directives, out of the block, indented by their level alone.
    if (this.first < 0 && this.listParent >= 0 && this.macro < 0 && this.commentsThenDirective()) {
      const l0 = d.nline;
      const any = this.flushDirectiveComments();
      for (let l = l0; l < d.nline; l++) {
        if (d.lParent[l] === this.listParent && d.kind[d.lFirst[l]] === K_COMMENT) {
          d.lAbs[l] = 1;
        }
      }
      if (any) {
        return;
      }
    }
    if (this.first < 0 && (this.commentsThenDirective() ? this.flushDirectiveComments() : this.flushComments())) {
      return;
    }
    // `/* c */ if (...)`: clang-format adds the comments to the line and
    // dispatches on the statement's keyword.
    if (this.first < 0 && this.cur() === K_COMMENT) {
      let i = this.pos;
      while (i < d.ntok - 1 && d.kind[i] === K_COMMENT && (i === this.pos || d.nl[i] === 0)) {
        i++;
      }
      const ki = d.kind[i];
      if (
        d.nl[i] === 0 &&
        (ki === KW_IF || ki === KW_WHILE || ki === KW_FOR || ki === KW_SWITCH || ki === KW_DO || ki === KW_TRY)
      ) {
        while (this.pos < i) {
          this.push();
        }
      }
    }
    // `asm { ... }`: the block is a line of its own, and what follows it
    // is read as the rest of the statement.
    if (this.isAsmWord(this.pos) && this.cur() !== K_EOF && d.kind[this.pos + 1] === P_LBRACE) {
      this.parseAsmBlock();
      if (this.cur() === P_RBRACE || this.cur() === K_EOF) {
        return;
      }
      this.parseStatement();
      return;
    }
    // clang-format's handleCppAttributes: simple `[[...]]` attributes at
    // the start are read before the statement is told apart.
    let attrOnly = false;
    while (this.first < 0 || attrOnly) {
      if (!(this.cur() === P_LSQUARE && this.peek(1) === P_LSQUARE)) {
        break;
      }
      let i = this.pos + 2;
      while (i < d.ntok - 1 && d.kind[i] !== P_RSQUARE) {
        i++;
      }
      if (d.kind[i] !== P_RSQUARE || d.kind[i + 1] !== P_RSQUARE || d.kind[i + 2] === P_SEMI) {
        break;
      }
      while (this.pos <= i + 1) {
        this.push();
      }
      attrOnly = true;
    }
    const k = this.cur();
    if (k === P_HASH && d.ppKind[this.pos] !== PP_NONE) {
      this.parsePP();
      return;
    }
    switch (k) {
      case KW_NAMESPACE:
        this.parseNamespace();
        return;
      case KW_INLINE:
        if (this.peek(1) === KW_NAMESPACE) {
          this.push();
          this.parseNamespace();
          return;
        }
        break;
      case KW_PUBLIC:
      case KW_PROTECTED:
      case KW_PRIVATE:
        if (this.peek(1) === P_COLON) {
          this.push();
          this.push();
          this.addLine();
          return;
        }
        // Qt: `public slots:`, `private Q_SLOTS:`.
        if (this.peek(2) === P_COLON && isQtWord(d, this.nextNonComment(this.pos), false)) {
          this.push();
          this.push();
          this.push();
          this.addLine();
          return;
        }
        // Anything but a variable's use: the specifier is a line of its own
        // (C++/CX `public ref class`).
        if (this.peek(1) !== P_COLONCOLON && !isOperatorAfterVar(this.peek(1))) {
          this.push();
          this.addLine();
          return;
        }
        break;
      case K_IDENT:
        // clang-format's default ForEachMacros: a loop.
        if (isForEachMacro(d, this.pos)) {
          this.parseLoop();
          return;
        }
        // Qt: `signals:`, `Q_SIGNALS:`, `slots:`, `Q_SLOTS:` on their own.
        if (this.peek(1) === P_COLON && isQtWord(d, this.pos, true)) {
          this.push();
          this.push();
          this.addLine();
          return;
        }
        // A goto label in code: one level out, like a case label. (In a
        // macro body, not on its first line: clang-format's
        // `!Line->InMacroBody || CurrentLines->size() > 1`.)
        if (
          (this.first < 0 || attrOnly) &&
          !this.mustDecl &&
          this.peek(1) === P_COLON &&
          (this.macro < 0 || this.d.nline > this.macroBodyStart)
        ) {
          this.parseCaseLabel();
          return;
        }
        break;
      case KW_CASE:
        this.parseCaseLabel();
        return;
      case KW_DEFAULT:
        if (this.peek(1) === P_COLON) {
          this.parseCaseLabel();
          return;
        }
        break;
      case KW_IF:
        this.parseIf();
        return;
      case KW_FOR:
      case KW_WHILE:
        this.parseLoop();
        return;
      case KW_DO:
        this.parseDo();
        return;
      case KW_SWITCH:
        this.parseSwitch();
        return;
      case KW_TRY:
        this.parseTry();
        return;
      case KW_EXTERN:
        if (this.peek(1) === K_STRING && this.peek(2) === P_LBRACE) {
          this.push();
          this.push();
          this.parseBlock(0, true, TT_UNKNOWN);
          this.addLine();
          return;
        }
        break;
      case P_LBRACE:
        // clang-format tries a braced list first: `{a};` (not in a requires expression).
        if (!this.inRequiresExpr && d.bk[this.pos] === BK_UNKNOWN) {
          this.calculateBraceTypes();
        }
        if (!this.inRequiresExpr && d.bk[this.pos] === BK_BRACED_INIT) {
          this.parseStatement();
          return;
        }
        // A block statement (clang-format 23's TT_BlockLBrace), or in a
        // requires expression a compound requirement.
        if (this.inRequiresExpr) {
          this.compoundReqs.push(this.pos);
        }
        this.parseBlock(1, this.mustDecl, TT_UNKNOWN);
        // A requires expression's compound requirement: `{ e } noexcept -> C<T>;`.
        if (this.cur() === KW_NOEXCEPT) {
          this.push();
        }
        if (this.cur() === P_ARROW) {
          this.parseStatement();
          return;
        }
        this.addLine();
        return;
      case P_SEMI:
        this.push();
        this.addLine();
        return;
      default:
        break;
    }
    this.parseStatement();
  }

  /**
   * Parses a block whose `{` is the current token: the `{` ends the line
   * being built, the body is parsed `addLevel` deeper, and the `}` starts the
   * next line, which the caller completes.
   */
  /** Whether token `t` is `asm`, `_asm`, `__asm` or `__asm__` (clang-format's kw_asm). */
  isAsmWord(t: i32): boolean {
    const d = this.d;
    if (d.kind[t] === KW_ASM) {
      return true;
    }
    if (d.kind[t] !== K_IDENT) {
      return false;
    }
    return d.is(t, "_asm") || d.is(t, "__asm") || d.is(t, "__asm__");
  }

  /**
   * Parses `asm { ... }` (the current token is the keyword): clang-format
   * finalizes everything up to the first `}`, which ends the line.
   */
  parseAsmBlock(): void {
    const d = this.d;
    this.push();
    d.type[this.pos] = TT_INLINE_ASM_BRACE;
    d.final[this.pos] = 1;
    this.push();
    while (true) {
      const k = this.cur();
      if (k === K_EOF) {
        return;
      }
      if (k === P_RBRACE) {
        d.type[this.pos] = TT_INLINE_ASM_BRACE;
        d.final[this.pos] = 1;
        this.push();
        this.addLine();
        return;
      }
      if (k === P_HASH && d.ppKind[this.pos] !== PP_NONE) {
        this.parsePPInline();
        continue;
      }
      // (Comments are not: clang-format reads them aside.)
      if (k !== K_COMMENT) {
        d.asmFin[this.pos] = 1;
      }
      this.push();
    }
  }

  parseBlock(addLevel: i32, mustDecl: boolean, lbraceType: i32): void {
    const d = this.d;
    const lb = this.pos;
    d.bk[lb] = BK_BLOCK;
    if (lbraceType !== TT_UNKNOWN) {
      d.type[lb] = lbraceType;
      d.final[lb] = 1;
    }
    this.push();
    this.addLine();
    const openLine = d.nline - 1;
    const saveLevel = this.level;
    const saveDecl = this.mustDecl;
    // A block's own labels are not in an unbraced body.
    const saveUnbraced = this.inUnbraced;
    this.inUnbraced = false;
    this.level = saveLevel + addLevel;
    this.mustDecl = mustDecl;
    this.parseLevel(true);
    this.addLine();
    this.level = saveLevel;
    this.inUnbraced = saveUnbraced;
    this.mustDecl = saveDecl;
    if (this.cur() !== P_RBRACE) {
      // Unclosed at the end of the file.
      return;
    }
    d.bk[this.pos] = BK_BLOCK;
    d.match[lb] = this.pos;
    d.match[this.pos] = lb;
    this.rbraceOpen = openLine;
    this.push();
    // clang-format's parseBlock takes a `;` right after the `}` (records
    // handle their own trailing tokens).
    if (
      this.cur() === P_SEMI &&
      lbraceType !== TT_CLASS_LBRACE &&
      lbraceType !== TT_STRUCT_LBRACE &&
      lbraceType !== TT_UNION_LBRACE
    ) {
      this.push();
    }
  }

  parseNamespace(): void {
    const d = this.d;
    this.push(); // namespace
    while (true) {
      const k = this.cur();
      if (k === P_LBRACE || k === P_SEMI || k === K_EOF || k === P_RBRACE) {
        break;
      }
      // clang-format reads a namespace's name from words, `::`, `inline`
      // and attributes only: anything else (`fL##x`) ends it, and the rest
      // is a statement with an ordinary block.
      if (k === P_HASHHASH || k === P_HASH) {
        this.parseStatement();
        return;
      }
      this.push();
    }
    if (this.cur() === P_LBRACE) {
      const startLine = d.nline;
      this.parseBlock(0, true, TT_NAMESPACE_LBRACE);
      d.lNamespace[startLine] = 1;
      if (this.cur() === P_SEMI) {
        this.push();
      }
      this.addLine();
    } else {
      if (this.cur() === P_SEMI) {
        this.push();
      }
      this.addLine();
    }
  }

  parseCaseLabel(): void {
    const d = this.d;
    const saveLevel = this.level;
    const unbraced = this.inUnbraced;
    // clang-format's parseLabel: one level out, but not to 0 inside a directive.
    if (this.level > 1 || (this.macro < 0 && this.level > 0)) {
      this.level = this.level - 1;
    }
    // (A label read into a line already started takes that line out too.)
    if (this.first >= 0 && this.d.kind[this.first] !== P_RBRACE) {
      this.lineLevel = this.level;
    }
    // `case expr :` (a `::` is not the label's colon). clang-format's
    // parseCaseLabel stops at the first `:`, even a `?:` one in parentheses.
    while (true) {
      const k = this.cur();
      if (k === K_EOF || k === P_SEMI || k === P_RBRACE || k === P_LBRACE) {
        break;
      }
      if (k === P_COLON) {
        d.type[this.pos] = TT_CASE_LABEL_COLON;
        d.final[this.pos] = 1;
        this.push();
        break;
      }
      this.push();
    }
    // Comments on the label's line stay on it; directive lines between the
    // label and a block are read past.
    let q = this.pos;
    while (d.kind[q] === K_COMMENT && d.nl[q] === 0) {
      q++;
    }
    let r = q;
    while (d.kind[r] === K_COMMENT) {
      r++;
    }
    if ((d.kind[q] === P_HASH && d.ppKind[q] !== PP_NONE) || d.kind[r] === P_LBRACE) {
      while (d.kind[this.pos] === K_COMMENT && d.nl[this.pos] === 0) {
        this.push();
      }
      // So are line comments continuing the last one's section (clang-format
      // reads them into the line): the block then still follows the label.
      const minCol = this.first >= 0 ? d.origCol(this.first) + 1 : 0;
      while (
        d.kind[this.pos] === K_COMMENT &&
        d.nl[this.pos] === 1 &&
        d.at(d.start[this.pos] + 1) === 47 &&
        this.last >= 0 &&
        d.kind[this.last] === K_COMMENT &&
        d.at(d.start[this.last] + 1) === 47 &&
        d.origCol(this.pos) >= minCol
      ) {
        this.push();
      }
    }
    while (d.kind[this.pos] === P_HASH && d.ppKind[this.pos] !== PP_NONE && this.macro < 0) {
      this.parsePPInline();
    }
    if (this.cur() === P_LBRACE) {
      this.parseBlock(1, false, TT_UNKNOWN);
      let b = this.pos;
      while (d.kind[b] === P_HASH && d.ppKind[b] !== PP_NONE) {
        b++;
        while (d.ppId[b] === d.ppId[b - 1] && d.inPP[b] === 1 && d.kind[b] !== K_EOF && d.ppKind[b] === PP_NONE) {
          b++;
        }
      }
      if (d.kind[b] === KW_BREAK && this.macro < 0) {
        while (d.kind[this.pos] === P_HASH && d.ppKind[this.pos] !== PP_NONE) {
          this.parsePPInline();
        }
      }
      if (this.cur() === KW_BREAK) {
        this.parseStatement();
        // Comments before a directive are read with the `break;`, at the
        // label's level (past any directives that come first).
        let q = this.pos;
        while (d.kind[q] === P_HASH && d.ppKind[q] !== PP_NONE) {
          q++;
          while (d.ppId[q] === d.ppId[q - 1] && d.inPP[q] === 1 && d.kind[q] !== K_EOF && d.ppKind[q] === PP_NONE) {
            q++;
          }
        }
        if (q !== this.pos && d.kind[q] === K_COMMENT && this.macro < 0) {
          let r = q;
          while (d.kind[r] === K_COMMENT) {
            r++;
          }
          if (d.kind[r] === P_HASH && d.ppKind[r] !== PP_NONE) {
            while (this.pos < q) {
              this.parsePPInline();
            }
          }
        }
        if (this.commentsThenDirective()) {
          this.flushDirectiveComments();
        }
        this.level = saveLevel;
        return;
      }
    } else if (this.cur() === P_SEMI) {
      // `label:;`
      this.push();
    } else if (this.cur() === K_COMMENT && this.macro < 0) {
      // `label:` then comments then `;`: clang-format's parseLabel takes the
      // `;`, and the comments before it, into the label's line.
      let q = this.pos;
      while (q < d.ntok - 1 && d.kind[q] === K_COMMENT) {
        q++;
      }
      if (d.kind[q] === P_SEMI) {
        while (this.pos <= q) {
          this.push();
        }
      }
    }
    const braced = this.first >= 0 && d.kind[this.first] === P_RBRACE;
    this.addLine();
    // Comments read past the block's `}` before a directive are flushed at
    // the `}`'s level, as clang-format reads them while consuming the brace.
    if (braced && this.commentsThenDirective()) {
      this.flushDirectiveComments();
    }
    this.level = saveLevel;
    // clang-format's parseLabel parses the statement after the label itself,
    // at the label's own level: inside an unbraced body that is the body's.
    // (A label after it does the same: `case 0: default: stmt;`.)
    if (unbraced && this.cur() !== P_LBRACE && this.cur() !== P_RBRACE && this.cur() !== K_EOF) {
      this.parseStructuralElement();
    }
  }

  /** The body of an if/for/while: a block, or one statement a level deeper. */
  parseControlBody(): void {
    // `if (x) // comment` then `{` on the next line: the comment trails the
    // control line and the block is still its body.
    const d = this.d;
    if (d.kind[this.pos] === K_COMMENT && (d.nl[this.pos] === 0 || this.macro < 0)) {
      let i = this.pos;
      while (i < d.ntok - 1 && d.kind[i] === K_COMMENT) {
        i++;
      }
      // (So do own-line comments: clang-format reads them with the `{`.)
      if (d.kind[i] === P_LBRACE) {
        while (d.kind[this.pos] === K_COMMENT) {
          this.push();
        }
      } else if (d.kind[i] === P_HASH && d.ppKind[i] !== PP_NONE && this.macro < 0) {
        // `if (x) // comment` then a directive: the comment trails the line.
        while (d.kind[this.pos] === K_COMMENT && d.nl[this.pos] === 0) {
          this.push();
        }
      }
    }
    // Directive lines before the body are read past, as clang-format reads
    // tokens: the body is still the statement after them.
    while (d.kind[this.pos] === P_HASH && d.ppKind[this.pos] !== PP_NONE && this.macro < 0) {
      this.parsePPInline();
    }
    if (this.cur() === P_LBRACE) {
      this.parseBlock(1, false, TT_CONTROL_STATEMENT_LBRACE);
      return;
    }
    this.addLine();
    // Own-line comments, then a directive, before the body: clang-format
    // flushes the comments at the control line's level, reads past the
    // directive, and the body is still the statement after it.
    if (this.macro < 0 && this.commentsThenDirective()) {
      this.flushDirectiveComments();
      while (d.kind[this.pos] === P_HASH && d.ppKind[this.pos] !== PP_NONE) {
        this.parsePPInline();
      }
    }
    this.level = this.level + 1;
    const before = d.nline;
    this.eofLine = -1;
    this.bodyComments();
    const wasUnbraced = this.inUnbraced;
    this.inUnbraced = true;
    this.unbracedLevel = this.unbracedLevel + 1;
    this.parseStructuralElement();
    this.inUnbraced = wasUnbraced;
    // A body still open at the end of the input (a macro body without `;`)
    // is added after the level is restored: clang-format's parseUnbracedBody.
    if (this.eofLine >= before && this.eofLine === d.nline - 1) {
      d.lLevel[this.eofLine] = this.level - 1;
    }
    // Comments between the body and a directive are read ahead inside the
    // body: flushed at its level less the unbraced bodies, this one included.
    if (this.first < 0 && this.commentsThenDirective()) {
      this.flushDirectiveComments();
    } else if (this.first < 0 && this.macro < 0 && this.directivesCommentsDirective()) {
      // Directives, then comments, then a directive: all read ahead with the
      // body's last token, as above.
      while (d.kind[this.pos] === P_HASH && d.ppKind[this.pos] !== PP_NONE) {
        this.parsePPInline();
      }
      this.flushDirectiveComments();
    }
    this.unbracedLevel = this.unbracedLevel - 1;
    this.level = this.level - 1;
  }

  /** Whether directives, then own-line comments, then a directive come next. */
  directivesCommentsDirective(): boolean {
    const d = this.d;
    let i = this.pos;
    if (d.kind[i] !== P_HASH || d.ppKind[i] === PP_NONE) {
      return false;
    }
    while (i < d.ntok - 1 && ((d.kind[i] === P_HASH && d.ppKind[i] !== PP_NONE) || d.inPP[i] === 1)) {
      i++;
    }
    if (d.kind[i] !== K_COMMENT || d.nl[i] === 0) {
      return false;
    }
    while (i < d.ntok - 1 && d.kind[i] === K_COMMENT) {
      i++;
    }
    return d.kind[i] === P_HASH && d.ppKind[i] !== PP_NONE;
  }

  /**
   * Own-line comments before an unbraced body take the body's level and the
   * body is still the statement after them.
   */
  bodyComments(): void {
    const d = this.d;
    if (this.first >= 0 || d.kind[this.pos] !== K_COMMENT || this.commentsThenDirective()) {
      return;
    }
    let i = this.pos;
    while (i < d.ntok - 1 && d.kind[i] === K_COMMENT) {
      i++;
    }
    if (d.kind[i] === K_EOF || d.kind[i] === P_RBRACE) {
      return;
    }
    this.flushComments();
  }

  /**
   * A simple `[[...]]` attribute after a control statement's condition or
   * `else` stays on its line (clang-format's handleAttributes).
   */
  handleAttributes(): void {
    const d = this.d;
    if (this.cur() !== P_LSQUARE || this.peek(1) !== P_LSQUARE) {
      return;
    }
    let i = this.pos + 2;
    while (i < d.ntok - 1 && d.kind[i] !== P_RSQUARE && d.kind[i] !== K_EOF) {
      i++;
    }
    if (d.kind[i] !== P_RSQUARE || d.kind[i + 1] !== P_RSQUARE || d.kind[i + 2] === P_SEMI) {
      return;
    }
    while (this.pos <= i + 1) {
      this.push();
    }
  }

  /** Whether directive lines, then (after any comments) `else`, come next. */
  directivesThenElse(): boolean {
    const d = this.d;
    let i = this.pos;
    if (d.kind[i] !== P_HASH || d.ppKind[i] === PP_NONE) {
      return false;
    }
    while (i < d.ntok - 1 && ((d.kind[i] === P_HASH && d.ppKind[i] !== PP_NONE) || d.inPP[i] === 1)) {
      i++;
    }
    while (i < d.ntok - 1 && d.kind[i] === K_COMMENT) {
      i++;
    }
    return d.kind[i] === KW_ELSE;
  }

  /** Whether own-line comments, then a directive, come next. */
  commentsThenDirective(): boolean {
    const d = this.d;
    let i = this.pos;
    if (d.kind[i] !== K_COMMENT || d.nl[i] === 0) {
      return false;
    }
    while (i < d.ntok - 1 && d.kind[i] === K_COMMENT) {
      i++;
    }
    return d.kind[i] === P_HASH && d.ppKind[i] !== PP_NONE;
  }

  parseIf(): void {
    this.push(); // if
    if (this.cur() === KW_CONSTEXPR || this.cur() === P_EXCLAIM_SENTINEL) {
      this.push();
    } else if (this.cur() === K_IDENT && this.peek(1) === P_LPAREN) {
      // `if MACRO (cond)`: clang-format reads past one word.
      this.push();
    }
    if (this.cur() === P_LPAREN) {
      this.parseParens();
    }
    this.handleAttributes();
    this.parseControlBody();
    const d = this.d;
    // Braced: the body's `}` has started the line being built.
    const braced = this.first >= 0 && d.kind[this.first] === P_RBRACE;
    // Directives between the body and `else` are read past, as clang-format
    // reads tokens: the else still belongs to this if.
    if (this.macro < 0 && this.directivesThenElse()) {
      while (d.kind[this.pos] === P_HASH && d.ppKind[this.pos] !== PP_NONE) {
        this.parsePPInline();
      }
    }
    // Comments between the body and `else`: clang-format looks past them.
    if (d.kind[this.pos] === K_COMMENT) {
      let i = this.pos;
      while (i < d.ntok - 1 && d.kind[i] === K_COMMENT) {
        i++;
      }
      if (d.kind[i] === KW_ELSE) {
        if (braced) {
          // They join the `}` line.
          while (d.kind[this.pos] === K_COMMENT) {
            this.push();
          }
        } else {
          this.flushComments();
        }
      }
    }
    if (this.cur() === KW_ELSE) {
      if (!braced) {
        this.addLine();
      }
      this.push(); // else
      // `else // comment` then `{` on the next line: the comment trails the
      // else line and the block is still its body.
      // So does one before directives and then `if` (`else // x` `#endif`
      // `if`): clang-format reads past the directives into `else if`.
      // (Own-line comments before a `{` are read with it too.)
      let ownLine = false;
      if (d.kind[this.pos] === K_COMMENT && d.nl[this.pos] > 0 && this.macro < 0) {
        let i = this.pos;
        while (i < d.ntok - 1 && d.kind[i] === K_COMMENT) {
          i++;
        }
        ownLine = d.kind[i] === P_LBRACE;
      }
      if (d.kind[this.pos] === K_COMMENT && (d.nl[this.pos] === 0 || ownLine)) {
        let i = this.pos;
        while (i < d.ntok - 1 && d.kind[i] === K_COMMENT) {
          i++;
        }
        let j = i;
        if (this.macro < 0) {
          while (j < d.ntok - 1 && ((d.kind[j] === P_HASH && d.ppKind[j] !== PP_NONE) || d.inPP[j] === 1)) {
            j++;
          }
        }
        if (d.kind[i] === P_LBRACE || (j > i && d.kind[j] === KW_IF)) {
          while (d.kind[this.pos] === K_COMMENT) {
            this.push();
          }
        }
      }
      while (d.kind[this.pos] === P_HASH && d.ppKind[this.pos] !== PP_NONE && this.macro < 0) {
        this.parsePPInline();
      }
      this.handleAttributes();
      if (this.cur() === KW_IF) {
        this.parseIf();
        return;
      }
      if (this.cur() === P_LBRACE) {
        this.parseBlock(1, false, TT_ELSE_LBRACE);
        this.addLine();
        return;
      }
      this.addLine();
      this.level = this.level + 1;
      this.bodyComments();
      const wasUnbraced = this.inUnbraced;
      this.inUnbraced = true;
      this.unbracedLevel = this.unbracedLevel + 1;
      this.parseStructuralElement();
      this.inUnbraced = wasUnbraced;
      // A body still open at the end of the input (a macro's last line) is
      // added at its own level: clang-format's parseUnbracedBody(CheckEOF),
      // so no enclosing body moves it.
      if (this.first >= 0 && this.cur() === K_EOF) {
        this.addLine();
      }
      if (this.eofLine >= 0 && this.eofLine === d.nline - 1) {
        this.eofLine = -1;
      }
      // Comments between the body and a directive: as after any control
      // statement's body (parseControlBody).
      if (this.first < 0 && this.commentsThenDirective()) {
        this.flushDirectiveComments();
      } else if (this.first < 0 && this.macro < 0 && this.directivesCommentsDirective()) {
        while (d.kind[this.pos] === P_HASH && d.ppKind[this.pos] !== PP_NONE) {
          this.parsePPInline();
        }
        this.flushDirectiveComments();
      }
      this.unbracedLevel = this.unbracedLevel - 1;
      this.level = this.level - 1;
      return;
    }
    this.addLine();
  }

  parseLoop(): void {
    this.push();
    if (this.cur() === P_LPAREN) {
      this.parseParens();
    }
    this.handleAttributes();
    this.parseControlBody();
    this.addLine();
  }

  parseDo(): void {
    this.push(); // do
    const braced = this.cur() === P_LBRACE;
    this.parseControlBody();
    if (!braced) {
      this.addLine();
    }
    // `} // c` then `while (...)`: the comment trails the `}` line, which
    // the while still goes on.
    if (
      braced &&
      this.cur() === K_COMMENT &&
      this.d.nl[this.pos] === 0 &&
      this.d.kind[this.nextNonComment(this.pos)] === KW_WHILE
    ) {
      while (this.cur() === K_COMMENT) {
        this.push();
      }
    }
    // (Directives before the `while` are read past, as clang-format reads
    // tokens.)
    if (braced && this.macro < 0 && this.cur() === P_HASH && this.d.ppKind[this.pos] !== PP_NONE) {
      const d = this.d;
      let i = this.pos;
      while (i < d.ntok - 1 && ((d.kind[i] === P_HASH && d.ppKind[i] !== PP_NONE) || d.inPP[i] === 1)) {
        i++;
      }
      if (d.kind[i] === KW_WHILE) {
        while (d.kind[this.pos] === P_HASH && d.ppKind[this.pos] !== PP_NONE) {
          this.parsePPInline();
        }
      }
    }
    if (this.cur() === KW_WHILE) {
      this.d.type[this.pos] = TT_DO_WHILE;
      this.d.final[this.pos] = 1;
      this.push();
      if (this.cur() === P_LPAREN) {
        this.parseParens();
      }
      if (this.cur() === P_SEMI) {
        this.push();
      }
    }
    this.addLine();
  }

  parseSwitch(): void {
    this.push();
    if (this.cur() === P_LPAREN) {
      this.parseParens();
    }
    this.commentsBeforeBrace();
    if (this.cur() === P_LBRACE) {
      this.parseBlock(1, false, TT_CONTROL_STATEMENT_LBRACE);
      this.addLine();
      return;
    }
    // `switch (x) case 0: ...`: an unbraced body, one level deeper.
    this.addLine();
    if (this.cur() === K_EOF || this.cur() === P_RBRACE) {
      return;
    }
    this.level = this.level + 1;
    const wasUnbraced = this.inUnbraced;
    this.inUnbraced = true;
    this.parseStructuralElement();
    this.inUnbraced = wasUnbraced;
    this.level = this.level - 1;
  }

  /**
   * `try // comment` with the `{` below it: the same-line comments trail
   * the line and the `{` is still its block (clang-format looks past them).
   */
  commentsBeforeBrace(): void {
    const d = this.d;
    let q = this.pos;
    while (d.kind[q] === K_COMMENT && q < d.ntok - 1) {
      q++;
    }
    if (q !== this.pos && d.kind[q] === P_LBRACE) {
      while (d.kind[this.pos] === K_COMMENT && d.nl[this.pos] === 0) {
        this.push();
      }
    }
  }

  parseTry(): void {
    this.push(); // try
    this.commentsBeforeBrace();
    if (this.cur() === P_LBRACE) {
      this.parseBlock(1, false, TT_CONTROL_STATEMENT_LBRACE);
    }
    while (true) {
      // Directives before a `catch` are read past, as clang-format reads tokens.
      if (this.macro < 0 && this.cur() === P_HASH && this.d.ppKind[this.pos] !== PP_NONE) {
        const d = this.d;
        let i = this.pos;
        while (i < d.ntok - 1 && ((d.kind[i] === P_HASH && d.ppKind[i] !== PP_NONE) || d.inPP[i] === 1)) {
          i++;
        }
        if (d.kind[i] !== KW_CATCH) {
          break;
        }
        while (d.kind[this.pos] === P_HASH && d.ppKind[this.pos] !== PP_NONE) {
          this.parsePPInline();
        }
      }
      if (this.cur() !== KW_CATCH) {
        break;
      }
      this.push();
      // `catch /* x */ (...)`: comments before the parameter stay on the line.
      while (
        this.cur() === K_COMMENT &&
        this.d.nl[this.pos] === 0 &&
        this.d.kind[this.nextNonComment(this.pos)] === P_LPAREN
      ) {
        this.push();
      }
      if (this.cur() === P_LPAREN) {
        this.parseParens();
      }
      this.commentsBeforeBrace();
      if (this.cur() === P_LBRACE) {
        this.parseBlock(1, false, TT_CONTROL_STATEMENT_LBRACE);
      }
    }
    this.addLine();
  }

  /**
   * A function-try-block, `f() try : x(1) { ... } catch (...) { ... }`:
   * clang-format reads it as a try statement on the declaration's line.
   */
  parseFunctionTry(): void {
    const d = this.d;
    this.push(); // try
    if (this.cur() === P_COLON) {
      this.push();
      while (true) {
        const k = this.cur();
        if (k === K_EOF || k === P_SEMI) {
          break;
        }
        if (k === P_LPAREN) {
          this.parseParens();
          continue;
        }
        if (k === P_LBRACE) {
          const lk = this.last >= 0 ? d.kind[this.last] : -1;
          if (lk === K_IDENT || lk === P_GREATER) {
            this.parseBracedList();
            continue;
          }
          break;
        }
        this.push();
      }
    }
    if (this.cur() === P_LBRACE) {
      this.parseBlock(1, false, TT_UNKNOWN);
    }
    while (this.cur() === KW_CATCH) {
      this.push();
      if (this.cur() === P_LPAREN) {
        this.parseParens();
      }
      if (this.cur() === P_LBRACE) {
        this.parseBlock(1, false, TT_CONTROL_STATEMENT_LBRACE);
      }
    }
    this.addLine();
  }

  /** Parses `( ... )` into the current line, with any lambdas or lists. */
  parseParens(): void {
    const d = this.d;
    const open = this.pos;
    this.push();
    while (true) {
      const k = this.cur();
      if (k === K_EOF) {
        // Unclosed: clang-format leaves the paren unmatched.
        return;
      }
      if (k === P_RPAREN) {
        d.match[open] = this.pos;
        d.match[this.pos] = open;
        this.push();
        return;
      }
      if (k === P_RBRACE) {
        // A `}` inside parentheses ends them unmatched, as in clang-format.
        return;
      }
      if (k === P_HASH && d.ppKind[this.pos] !== PP_NONE) {
        this.parsePPInline();
        continue;
      }
      this.parseExprToken();
    }
  }

  /** A directive inside an expression: parked as a line of its own. */
  parsePPInline(): void {
    const d = this.d;
    if (this.first >= 0 && this.macro < 0 && this.linePP === 0 && d.nl[this.pos] > 0) {
      this.parkCommentsBeforeDirective();
    }
    const saveFirst = this.first;
    const saveLast = this.last;
    const saveLevel = this.lineLevel;
    const savePP = this.linePP;
    this.first = -1;
    this.last = -1;
    const hash = this.pos;
    // A #define inside a statement still has its body parsed as code.
    if (d.ppKind[hash] === PP_DEFINE && this.macro < 0 && d.len(hash + 1) === 6 && d.at(d.start[hash + 1]) === 100) {
      const saveRb = this.rbraceOpen;
      this.parseDefine(hash);
      this.rbraceOpen = saveRb;
      this.first = saveFirst;
      this.last = saveLast;
      this.lineLevel = saveLevel;
      this.linePP = savePP;
      if (this.last >= 0) {
        d.nxt[this.last] = -1;
      }
      return;
    }
    const isInclude = d.ppKind[hash] === PP_INCLUDE;
    this.push();
    while (d.inPP[this.pos] === 1 && d.kind[this.pos] !== K_EOF && d.ppKind[this.pos] === PP_NONE) {
      this.push();
    }
    this.finishLine(isInclude ? LT_IMPORT : LT_PREPROCESSOR);
    this.first = saveFirst;
    this.last = saveLast;
    this.lineLevel = saveLevel;
    this.linePP = savePP;
    if (this.last >= 0) {
      d.nxt[this.last] = -1;
    }
  }

  /**
   * clang-format's distributeComments before a directive inside a statement:
   * the comments that start a line and do not continue a trailing comment's
   * section leave the statement for lines of their own, at its level.
   */
  parkCommentsBeforeDirective(): void {
    const d = this.d;
    let c = this.last;
    while (c >= 0 && c !== this.first && d.kind[c] === K_COMMENT) {
      c = d.prv[c];
    }
    if (c < 0 || d.kind[c] === K_COMMENT) {
      return;
    }
    let split = -1;
    for (let q = d.nxt[c]; q >= 0; q = d.nxt[q]) {
      if (d.nl[q] === 0) {
        continue;
      }
      const p = d.prv[q];
      const lineCmt = d.at(d.start[q] + 1) === 47 && d.kind[p] === K_COMMENT && d.at(d.start[p] + 1) === 47;
      if (!(lineCmt && d.nl[q] === 1 && d.col[q] === d.col[p])) {
        split = q;
        break;
      }
    }
    if (split < 0) {
      return;
    }
    const saveLevel = this.lineLevel;
    const saveFirst = this.first;
    const keep = d.prv[split];
    d.nxt[keep] = -1;
    let lf = -1;
    let ll = -1;
    for (let q = split; q >= 0; ) {
      const nq = d.nxt[q];
      if (lf < 0 || d.nl[q] > 0) {
        if (lf >= 0) {
          this.parkCommentLine(lf, ll, saveLevel);
        }
        lf = q;
        d.prv[q] = -1;
      } else {
        d.nxt[ll] = q;
        d.prv[q] = ll;
      }
      d.nxt[q] = -1;
      ll = q;
      q = nq;
    }
    if (lf >= 0) {
      this.parkCommentLine(lf, ll, saveLevel);
    }
    this.first = saveFirst;
    this.last = keep;
    this.lineLevel = saveLevel;
    this.linePP = 0;
  }

  /** Finishes comments `f`..`l` as a parked line at `level`. */
  parkCommentLine(f: i32, l: i32, level: i32): void {
    this.first = f;
    this.last = l;
    this.lineLevel = level;
    this.linePP = 0;
    this.finishLine(LT_OTHER);
    this.d.lInlineCmt[this.d.nline - 1] = 1;
  }

  /** One token of an expression, descending into brackets it opens. */
  parseExprToken(): void {
    const d = this.d;
    const k = this.cur();
    // A directive is never part of the line (clang-format reads it aside).
    if (k === P_HASH && d.ppKind[this.pos] !== PP_NONE && this.macro < 0) {
      this.parsePPInline();
      return;
    }
    if (k === P_LPAREN) {
      this.parseParens();
      return;
    }
    if (k === P_LSQUARE) {
      if (this.tryParseLambda()) {
        return;
      }
      this.parseSquare();
      return;
    }
    if (k === P_LBRACE) {
      if (this.isBlockLiteralBrace()) {
        // `^(T x) { ... }` or `^{ ... }`: a block literal's body.
        d.bk[this.pos] = BK_BLOCK;
        d.type[this.pos] = TT_BLOCK_LITERAL_LBRACE;
        d.final[this.pos] = 1;
        this.parseChildBlock();
        return;
      }
      if (this.isRequiresExpressionBrace()) {
        // `requires { ... }` inside an expression (a requires clause's).
        d.bk[this.pos] = BK_BLOCK;
        this.parseRequiresBody();
        return;
      }
      if (d.bk[this.pos] === BK_UNKNOWN) {
        this.calculateBraceTypes();
      }
      if (d.bk[this.pos] === BK_BLOCK) {
        // A block inside an expression (a statement expression or a lambda
        // the scan above could not see): parse it as child lines.
        this.parseChildBlock();
        return;
      }
      this.parseBracedList();
      return;
    }
    this.push();
  }

  parseSquare(): void {
    const d = this.d;
    const open = this.pos;
    this.push();
    while (true) {
      const k = this.cur();
      if (k === K_EOF || k === P_RBRACE || k === P_SEMI) {
        // Unclosed: clang-format leaves the bracket unmatched.
        return;
      }
      if (k === P_RSQUARE) {
        d.match[open] = this.pos;
        d.match[this.pos] = open;
        this.push();
        return;
      }
      if (k === P_RPAREN) {
        return;
      }
      if (k === P_HASH && d.ppKind[this.pos] !== PP_NONE) {
        this.parsePPInline();
        continue;
      }
      this.parseExprToken();
    }
  }

  /** Parses a braced list whose `{` is the current token. */
  parseBracedList(): void {
    const d = this.d;
    const open = this.pos;
    d.bk[open] = BK_BRACED_INIT;
    this.push();
    while (true) {
      const k = this.cur();
      if (k === K_EOF) {
        // Unclosed at the end of the file.
        return;
      }
      if (k === P_RBRACE) {
        // clang-format's parseBracedList gives the `{` its kind, never the
        // `}`: one the brace scan found a block, or never reached, still
        // breaks before an own-line comment after it.
        if (d.bk[this.pos] !== BK_BRACED_INIT) {
          d.eqList[this.pos] = 1;
        }
        d.bk[this.pos] = BK_BRACED_INIT;
        d.match[open] = this.pos;
        d.match[this.pos] = open;
        this.push();
        return;
      }
      if (k === P_LBRACE) {
        d.bk[this.pos] = BK_BRACED_INIT;
        this.parseBracedList();
        continue;
      }
      if (k === P_HASH && d.ppKind[this.pos] !== PP_NONE) {
        this.parsePPInline();
        continue;
      }
      if (k === P_SEMI) {
        // Not a list after all; let the statement end here.
        this.push();
        continue;
      }
      this.parseExprToken();
    }
  }

  /** The body of a lambda (or a block in an expression): child lines. */
  parseChildBlock(): void {
    const d = this.d;
    const lb = this.pos;
    d.bk[lb] = BK_BLOCK;
    this.push();
    // A comment on the `{` line stays in the parent line, and the block's
    // lines hang off the last token there, as clang-format reads it.
    let tail = lb;
    while (this.pos < d.ntok - 1 && d.kind[this.pos] === K_COMMENT && d.nl[this.pos] === 0) {
      tail = this.pos;
      this.push();
    }
    const saveFirst = this.first;
    const saveLast = this.last;
    const saveLineLevel = this.lineLevel;
    const saveLinePP = this.linePP;
    const saveLevel = this.level;
    const saveDecl = this.mustDecl;
    const saveParent = this.listParent;
    this.first = -1;
    this.last = -1;
    this.listParent = tail;
    this.level = saveLineLevel + 1;
    this.mustDecl = false;
    if (this.commentsThenDirective()) {
      // clang-format reads past `{` before it enters the block: own-line
      // comments before a directive are flushed at the parent line's level,
      // as lines of their own outside the block.
      this.level = saveLineLevel;
      const l0 = d.nline;
      this.flushDirectiveComments();
      for (let l = l0; l < d.nline; l++) {
        d.lAbs[l] = 1;
      }
      this.level = saveLineLevel + 1;
    }
    this.parseLevel(true);
    this.addLine();
    this.listParent = saveParent;
    this.level = saveLevel;
    this.mustDecl = saveDecl;
    this.first = saveFirst;
    this.last = saveLast;
    this.lineLevel = saveLineLevel;
    this.linePP = saveLinePP;
    if (this.cur() !== P_RBRACE) {
      // Unclosed at the end of the file.
      return;
    }
    d.bk[this.pos] = BK_BLOCK;
    d.match[lb] = this.pos;
    d.match[this.pos] = lb;
    // Re-link: the `}` follows the `{` (or its comment) in the parent line.
    d.nxt[tail] = -1;
    this.last = tail;
    this.push();
  }

  /** Recognises `[captures](params) specifiers { body }` at `[`. */
  tryParseLambda(): boolean {
    const d = this.d;
    const lsq = this.pos;
    const prev = this.last;
    if (prev >= 0) {
      const pk = d.kind[prev];
      if (
        pk === K_IDENT ||
        pk >= 200 ||
        pk === KW_OPERATOR ||
        pk === KW_NEW ||
        pk === KW_DELETE ||
        pk === P_LSQUARE ||
        pk === P_RPAREN ||
        pk === P_RSQUARE ||
        (pk === P_RBRACE && d.bk[prev] !== BK_BLOCK) ||
        isSimpleTypeKind(pk) ||
        pk === K_NUMBER ||
        pk === K_STRING ||
        pk === K_CHAR
      ) {
        return false;
      }
    }
    if (this.peek(1) === P_LSQUARE) {
      return false; // an attribute
    }
    // `auto [a, b]`, `const auto &[a, b]`: a structured binding.
    let q = prev;
    while (
      q >= 0 &&
      (d.kind[q] === KW_CONST ||
        d.kind[q] === KW_VOLATILE ||
        d.kind[q] === P_AMP ||
        d.kind[q] === P_AMPAMP ||
        d.kind[q] === K_COMMENT)
    ) {
      q = d.prv[q];
    }
    if (q >= 0 && d.kind[q] === KW_AUTO) {
      return false;
    }
    // Find the matching `]`, then what follows it.
    let i = lsq + 1;
    let depth = 1;
    // (A macro body ends at its directive's end: clang-format's token
    // source answers eof there.)
    while (i < d.ntok - 1 && !(this.macro >= 0 && d.ppId[i] !== this.macro)) {
      const k = d.kind[i];
      if (k === P_LSQUARE || k === P_LPAREN || k === P_LBRACE) {
        depth++;
      } else if (k === P_RSQUARE || k === P_RPAREN || k === P_RBRACE) {
        depth--;
        if (depth === 0) {
          break;
        }
      } else if (k === P_SEMI && depth === 1) {
        return false;
      }
      i++;
    }
    if (d.kind[i] !== P_RSQUARE) {
      return false;
    }
    const rsq = i;
    // Scan the declarator up to the body's `{`.
    let j = this.nextNonComment(rsq);
    let pdepth = 0;
    let seenArrow = false;
    while (j < d.ntok - 1) {
      if (this.macro >= 0 && d.ppId[j] !== this.macro) {
        return false;
      }
      const k = d.kind[j];
      if (k === P_LBRACE && pdepth === 0) {
        break;
      }
      if (k === P_LSQUARE && pdepth === 0) {
        // `[] [[noreturn]] (...)`: an attribute.
        j = this.skipBracket(j);
        continue;
      }
      if (k === P_LPAREN) {
        // clang-format's parseParens: anything balanced, braces too.
        j = this.skipBracket(j);
        continue;
      }
      if (k === P_LESS) {
        pdepth++;
      } else if (k === P_GREATER) {
        pdepth--;
      } else if (pdepth === 0) {
        if (k === P_ARROW) {
          seenArrow = true;
        } else if (
          seenArrow &&
          (k === KW_TRUE ||
            k === KW_FALSE ||
            k === P_PLUS ||
            k === P_MINUS ||
            k === P_EXCLAIM ||
            k === P_TILDE ||
            k === P_SLASH ||
            k === P_PERCENT ||
            k === P_LESSLESS ||
            k === P_PIPE ||
            k === P_PIPEPIPE ||
            k === P_CARET ||
            k === P_EQUALEQUAL ||
            k === P_EXCLAIMEQUAL ||
            k === P_GREATEREQUAL ||
            k === P_LESSEQUAL ||
            k === P_QUESTION ||
            k === P_COLON)
        ) {
          // (clang-format's tryToParseLambda takes operators after the arrow:
          // a template argument's arithmetic, or C++/CX's `^`.)
        } else if (
          !(
            lambdaWord(k) ||
            k === K_NUMBER ||
            k === P_COLONCOLON ||
            k === P_AMP ||
            k === P_AMPAMP ||
            k === P_STAR ||
            k === P_COMMA ||
            k === P_ELLIPSIS
          )
        ) {
          return false;
        }
      } else if (k === P_SEMI || k === P_LBRACE || k === P_RBRACE) {
        return false;
      }
      j++;
    }
    if (d.kind[j] !== P_LBRACE) {
      return false;
    }
    d.type[lsq] = TT_LAMBDA_LSQUARE;
    d.final[lsq] = 1;
    // Introducer, then declarator, into the line.
    this.push();
    while (this.pos < rsq) {
      this.parseExprToken();
    }
    d.match[lsq] = this.pos;
    d.match[this.pos] = lsq;
    this.push(); // ]
    while (this.pos < j) {
      if (this.cur() === P_ARROW) {
        d.type[this.pos] = TT_LAMBDA_ARROW;
        d.final[this.pos] = 1;
      }
      this.parseExprToken();
    }
    d.type[this.pos] = TT_LAMBDA_LBRACE;
    d.final[this.pos] = 1;
    this.parseChildBlock();
    return true;
  }

  /**
   * Decides, for the `{` at `pos` and the braces nested in it, whether each
   * opens a block or a braced list, from what follows its closing `}`.
   */
  calculateBraceTypes(expectClassBody: boolean = false): void {
    const d = this.d;
    const stack = new Array<i32>(0);
    const prevs = new Array<i32>(0);
    let tok = this.pos;
    let prevTok = this.last;
    while (true) {
      let next = tok + 1;
      while (next < d.ntok - 1 && d.kind[next] === K_COMMENT) {
        next++;
      }
      // Skip directives: clang-format skips the rest of the directive's first
      // line only, so the lines a `\` continues are scanned as code.
      while (next < d.ntok - 1 && d.kind[next] === P_HASH && d.ppKind[next] !== PP_NONE && this.macro < 0) {
        next = next + 2;
        while (next < d.ntok - 1 && (d.kind[next] === K_COMMENT || d.nl[next] === 0)) {
          next++;
        }
        while (next < d.ntok - 1 && d.kind[next] === K_COMMENT) {
          next++;
        }
      }
      // (Inside a macro body, the whole directive is skipped.)
      while (this.macro >= 0 && next < d.ntok - 1 && d.kind[next] === P_HASH && d.ppKind[next] !== PP_NONE) {
        next++;
        while (
          next < d.ntok - 1 &&
          (d.kind[next] === K_COMMENT || (d.inPP[next] === 1 && d.ppKind[next] === PP_NONE))
        ) {
          next++;
        }
      }
      const k = d.kind[tok];
      if (k === P_LBRACE) {
        if (d.bk[tok] === BK_UNKNOWN || tok !== this.pos) {
          d.bk[tok] = BK_UNKNOWN;
        }
        stack.push(tok);
        prevs.push(prevTok);
      } else if (k === P_RBRACE) {
        if (stack.length !== 0) {
          const top = stack[stack.length - 1];
          const topPrev = prevs[prevs.length - 1];
          if (d.bk[top] === BK_UNKNOWN) {
            // Inside a macro body the directive's end reads as the end of the
            // file (on clang-format's later runs, not after a trailing comment).
            const trailing = tok + 1 < d.ntok && d.kind[tok + 1] === K_COMMENT && d.nl[tok + 1] === 0;
            const nk = this.macro >= 0 && d.ppId[next] !== this.macro && !trailing ? K_EOF : d.kind[next];
            let braced = false;
            if (nk === P_LPAREN) {
              braced = true;
            }
            if (
              nk === P_COMMA ||
              nk === P_PERIOD ||
              nk === P_COLON ||
              nk === P_RPAREN ||
              nk === P_RSQUARE ||
              nk === P_ELLIPSIS
            ) {
              braced = true;
            }
            if (nk === P_LBRACE && topPrev >= 0 && (d.kind[topPrev] === K_IDENT || d.kind[topPrev] === P_GREATER)) {
              braced = true;
            }
            if (
              nk === K_IDENT &&
              !(
                prevTok >= 0 &&
                (d.kind[prevTok] === P_SEMI || d.kind[prevTok] === P_RBRACE || d.kind[prevTok] === P_LBRACE)
              )
            ) {
              braced = true;
            }
            if (nk === P_SEMI && stack.length !== 1) {
              braced = true;
            }
            if (nk === P_SEMI && stack.length === 1 && !expectClassBody) {
              braced = true;
            }
            if (binPrecedence(nk) > PREC_COMMA || nk === P_QUESTION) {
              braced = true;
            }
            if (nk === P_LSQUARE) {
              // A subscript may follow a braced list; `[[` starts an attribute after a block.
              let n2 = next + 1;
              while (n2 < d.ntok - 1 && d.kind[n2] === K_COMMENT) {
                n2++;
              }
              braced = d.kind[n2] !== P_LSQUARE;
            }
            const v = braced ? BK_BRACED_INIT : BK_BLOCK;
            d.bk[tok] = v;
            d.bk[top] = v;
          }
          stack.pop();
          prevs.pop();
        }
      } else if (k === P_SEMI || k === KW_IF || k === KW_WHILE || k === KW_FOR || k === KW_SWITCH || k === KW_TRY) {
        if (stack.length !== 0 && d.bk[stack[stack.length - 1]] === BK_UNKNOWN) {
          d.bk[stack[stack.length - 1]] = BK_BLOCK;
        }
      }
      // (So do the tokens another #if pass sees after this one, or after
      // the comments and directives skipped to the next.)
      if (stack.length !== 0 && d.bk[stack[stack.length - 1]] === BK_UNKNOWN) {
        for (let q = tok; q < next; q++) {
          if (d.hidSemi[q] === 1) {
            d.bk[stack[stack.length - 1]] = BK_BLOCK;
            break;
          }
        }
      }
      prevTok = tok;
      tok = next;
      // (A macro body ends at its directive's end.)
      if (d.kind[tok] === K_EOF || stack.length === 0 || (this.macro >= 0 && d.ppId[tok] !== this.macro)) {
        break;
      }
    }
    for (const t of stack) {
      if (d.bk[t] === BK_UNKNOWN) {
        d.bk[t] = BK_BLOCK;
      }
    }
  }

  /** Whether `[pos, ...)` reaches a `{` before a `;` (a record body). */
  /**
   * Whether the `class`/`struct`/`union` at the current token opens a body,
   * by clang-format's parseRecord: names, `::`, attributes and macro
   * arguments, then a base list or template arguments, then `{`.
   */
  classHasBody(): boolean {
    const d = this.d;
    const n = d.ntok - 1;
    let i = this.nextNonComment(this.pos);
    while (i < n) {
      // A directive between the keyword and the name is read past.
      if (d.kind[i] === P_HASH && d.ppKind[i] !== PP_NONE && d.ppId[i] === i) {
        let j = i + 1;
        while (j < n && d.ppId[j] === i) {
          j++;
        }
        i = d.kind[j] === K_COMMENT ? this.nextNonComment(j) : j;
        continue;
      }
      const k = d.kind[i];
      if (k === P_LSQUARE && d.kind[this.nextNonComment(i)] === P_LSQUARE) {
        // `[[attribute]]`
        i = this.skipBracket(i);
        continue;
      }
      // `final` is an identifier to clang-format.
      if (
        !(
          isIdentKind(k) ||
          k === P_COLONCOLON ||
          k === P_HASHHASH ||
          k === KW_ALIGNAS ||
          k === P_LSQUARE ||
          k === KW_ATTRIBUTE
        )
      ) {
        break;
      }
      const prev = i;
      i = this.nextNonComment(i);
      // Macros may sit between the keyword and the name.
      if (!this.isNonMacroIdent(prev) && i < n && d.kind[i] === P_LPAREN) {
        i = this.skipBracket(i);
      }
    }
    if (i < n && (d.kind[i] === P_COLON || d.kind[i] === P_LESS)) {
      let angle = 0;
      let prev = -1;
      while (i < n) {
        const k = d.kind[i];
        if (k === P_LESS) {
          angle++;
        } else if (k === P_GREATER) {
          angle--;
        }
        if (angle === 0 && k === P_LPAREN && prev >= 0 && this.isNonMacroIdent(prev)) {
          break;
        }
        if (k === P_LBRACE || k === P_SEMI) {
          break;
        }
        prev = i;
        i = this.nextNonComment(i);
      }
    }
    return i < n && d.kind[i] === P_LBRACE;
  }

  /** Whether token `t` is an identifier with a lower-case letter (not a macro name). */
  isNonMacroIdent(t: i32): boolean {
    const d = this.d;
    if (!isIdentKind(d.kind[t])) {
      return false;
    }
    for (let i = d.start[t]; i < d.end[t]; i++) {
      const c = d.at(i);
      if (c >= 97 && c <= 122) {
        return true;
      }
    }
    return false;
  }

  /** The token after the bracket group opening at `t`, or the end. */
  skipBracket(t: i32): i32 {
    const d = this.d;
    let depth = 0;
    let i = t;
    while (i < d.ntok - 1) {
      const k = d.kind[i];
      if (k === P_LPAREN || k === P_LSQUARE || k === P_LBRACE) {
        depth++;
      } else if (k === P_RPAREN || k === P_RSQUARE || k === P_RBRACE) {
        depth--;
        if (depth === 0) {
          return this.nextNonComment(i);
        }
      }
      i++;
    }
    return d.ntok - 1;
  }

  enumHasBody(): boolean {
    // clang-format's parseEnum: names, `::`, `<>`, `,`, `?` and macro
    // parentheses may come before the `{`; two names in a row make an
    // elaborated return type (`enum E Cls::f() {`), not an enum.
    const d = this.d;
    const n = d.ntok - 1;
    let i = this.nextNonComment(this.pos);
    if (i < n && (d.kind[i] === KW_CLASS || d.kind[i] === KW_STRUCT)) {
      i = this.nextNonComment(i);
    }
    while (i < n && d.kind[i] === P_LSQUARE) {
      i = this.skipBracket(i);
    }
    while (i < n) {
      const k = d.kind[i];
      // (Directive lines are read aside.)
      if (k === P_HASH && d.ppKind[i] !== PP_NONE && this.macro < 0) {
        i++;
        while (i < n && d.ppId[i] === d.ppId[i - 1] && d.inPP[i] === 1 && d.ppKind[i] === PP_NONE) {
          i++;
        }
        if (d.kind[i] === K_COMMENT) {
          i = this.nextNonComment(i);
        }
        continue;
      }
      if (
        !(
          isWordKind(k) ||
          k === P_COLON ||
          k === P_COLONCOLON ||
          k === P_LESS ||
          k === P_GREATER ||
          k === P_COMMA ||
          k === P_QUESTION ||
          k === P_LSQUARE
        )
      ) {
        break;
      }
      i = this.nextNonComment(i);
      if (i < n && d.kind[i] === P_LPAREN) {
        i = this.skipBracket(i);
      }
      if (i < n && d.kind[i] === K_IDENT) {
        i = this.nextNonComment(i);
        if (i < n && d.kind[i] === K_IDENT) {
          return false;
        }
      }
    }
    return i < n && d.kind[i] === P_LBRACE;
  }

  /**
   * Whether the identifier at `t` has no lower-case letter, clang-format's
   * test for a macro name (`_` passes, as in an X-macro body).
   */
  allCaps(t: i32): boolean {
    const d = this.d;
    for (let i = d.start[t]; i < d.end[t]; i++) {
      const c = d.at(i);
      if (c >= 97 && c <= 122) {
        return false;
      }
    }
    return true;
  }

  /** Whether token `t` can start a new line. */
  canStartNewLine(t: i32): boolean {
    return tokenCanStartNewLine(this.d, t);
  }

  /** `template <...>`: its parameters, where `class` names no record. */
  parseTemplateParams(): void {
    this.push(); // template
    let depth = 0;
    while (true) {
      const k = this.cur();
      if (k === K_EOF || k === P_SEMI || k === P_LBRACE || k === P_RBRACE) {
        return;
      }
      if (k === P_LPAREN) {
        this.parseParens();
        continue;
      }
      // A directive between the parameters: parked as a line of its own.
      if (k === P_HASH && this.d.ppKind[this.pos] !== PP_NONE) {
        this.parsePPInline();
        continue;
      }
      if (k === P_LESS) {
        depth++;
      } else if (k === P_GREATER) {
        depth--;
      }
      this.push();
      if (depth <= 0) {
        return;
      }
    }
  }

  /** Whether the current `{` opens a block literal's body: after `^` or `^(...)`. */
  isBlockLiteralBrace(): boolean {
    const d = this.d;
    let r = this.last;
    if (r < 0) {
      return false;
    }
    if (d.kind[r] === P_RPAREN && d.match[r] >= 0) {
      r = d.prv[d.match[r]];
    }
    // (`^void(...) {`: a return type before the parameters.)
    if (
      r >= 0 &&
      (d.kind[r] === K_IDENT || isSimpleTypeKind(d.kind[r])) &&
      d.prv[r] >= 0 &&
      d.kind[d.prv[r]] === P_CARET
    ) {
      r = d.prv[r];
    }
    if (r < 0 || d.kind[r] !== P_CARET) {
      return false;
    }
    // A prefix `^` only: `a ^ (b) {` is no block.
    const p = d.prv[r];
    if (p < 0) {
      return true;
    }
    const pk = d.kind[p];
    return (
      pk === P_LPAREN ||
      pk === P_COMMA ||
      pk === P_EQUAL ||
      pk === P_LBRACE ||
      pk === P_LSQUARE ||
      pk === P_COLON ||
      pk === P_QUESTION ||
      pk === KW_RETURN ||
      pk === P_SEMI
    );
  }

  /** Whether the current `{` opens a requires-expression's body. */
  /** A requires expression's `{ ... }`: its requirements are never braced lists. */
  parseRequiresBody(): void {
    const was = this.inRequiresExpr;
    this.inRequiresExpr = true;
    this.parseChildBlock();
    this.inRequiresExpr = was;
  }

  isRequiresExpressionBrace(): boolean {
    const d = this.d;
    let r = this.last;
    if (r < 0) {
      return false;
    }
    if (d.kind[r] === P_RPAREN && d.match[r] >= 0) {
      r = d.prv[d.match[r]];
    }
    if (r < 0 || d.kind[r] !== KW_REQUIRES || d.prv[r] < 0) {
      return false;
    }
    return !requiresIsClause(d, r);
  }

  /** Whether token `x` is past the input being parsed: the end, or beyond the macro body. */
  outsideBody(x: i32): boolean {
    const d = this.d;
    return d.kind[x] === K_EOF || (this.macro >= 0 && d.ppId[x] !== this.macro);
  }

  /**
   * clang-format's `@` in parseStructuralElement: pushes the `@`, then
   * parses `@interface`, `@implementation` and `@protocol` with their bodies,
   * `@optional`/`@required` and the access specifiers as lines of their own.
   * Answers true when the statement is done; false to go on with it.
   */
  parseObjCAt(): boolean {
    const d = this.d;
    this.push();
    if (this.cur() === P_LBRACE) {
      // `@{...}`: a dictionary literal (formatted as a braced list here).
      d.objcOther = true;
      this.parseBracedList();
      return false;
    }
    const t = this.pos;
    if (
      this.cur() !== K_IDENT &&
      this.cur() !== KW_PUBLIC &&
      this.cur() !== KW_PROTECTED &&
      this.cur() !== KW_PRIVATE
    ) {
      if (this.cur() !== K_STRING && this.cur() !== KW_CLASS) {
        d.objcOther = true;
      }
      return false;
    }
    if (d.is(t, "interface") || d.is(t, "implementation")) {
      if (d.is(t, "implementation")) {
        d.objcOther = true;
      }
      this.parseObjCInterface();
      return true;
    }
    if (d.is(t, "protocol")) {
      if (this.peek(1) === P_LPAREN) {
        // `@protocol(Foo)`: an expression.
        d.objcOther = true;
        return false;
      }
      this.parseObjCProtocol();
      return true;
    }
    if (d.is(t, "end")) {
      // Handled by the body's loop.
      return this.objcDepth > 0;
    }
    if (d.is(t, "optional") || d.is(t, "required")) {
      this.push();
      this.addLine();
      return true;
    }
    if (d.kind[t] === KW_PUBLIC || d.kind[t] === KW_PROTECTED || d.kind[t] === KW_PRIVATE || d.is(t, "package")) {
      // clang-format's parseAccessSpecifier.
      this.push();
      if (this.cur() === P_COLON) {
        this.push();
      }
      this.addLine();
      return true;
    }
    if (!(d.is(t, "property") || d.is(t, "class"))) {
      d.objcOther = true;
    }
    return false;
  }

  /** clang-format's parseObjCInterfaceOrImplementation, at the keyword. */
  parseObjCInterface(): void {
    this.push();
    this.push(); // the name
    if (this.cur() === P_LESS) {
      this.parseObjCGenerics();
    }
    if (this.cur() === P_COLON) {
      this.push();
      this.push(); // the base class
      if (this.cur() === P_LESS) {
        this.parseObjCGenerics();
      }
    } else if (this.cur() === P_LPAREN) {
      // A category.
      this.parseParens();
    }
    if (this.cur() === P_LESS) {
      this.parseObjCProtocolList();
    }
    const lineFirst = this.first;
    const l0 = this.d.nline;
    if (this.cur() === P_LBRACE) {
      // Instance variables: the `}` gets a line of its own.
      this.parseBlock(1, true, TT_UNKNOWN);
    }
    this.addLine();
    this.markObjCDecl(l0, lineFirst);
    this.parseObjCUntilAtEnd();
  }

  /** Marks line `l` as clang-format's LT_ObjCDecl when it starts with the `@` at `first`. */
  markObjCDecl(l: i32, first: i32): void {
    const d = this.d;
    if (l >= 0 && l < d.nline && d.lFirst[l] === first && d.kind[first] === P_AT) {
      d.lObjC[l] = 2;
    }
  }

  /** Whether the tokens from `pos` are `@end`. */
  atObjCEnd(): boolean {
    return this.cur() === P_AT && this.d.kind[this.pos + 1] === K_IDENT && this.d.is(this.pos + 1, "end");
  }

  /** clang-format's parseObjCLightweightGenerics, at the `<`. */
  parseObjCGenerics(): void {
    let open = 1;
    this.push();
    while (true) {
      const k = this.cur();
      if (k === K_EOF || k === P_SEMI || k === P_LBRACE || this.atObjCEnd()) {
        break;
      }
      if (k === P_LESS) {
        open++;
      } else if (k === P_GREATER) {
        open--;
        if (open === 0) {
          break;
        }
      }
      this.push();
    }
    if (this.cur() !== K_EOF) {
      this.push();
    }
  }

  /** clang-format's parseObjCProtocolList, at the `<`. */
  parseObjCProtocolList(): void {
    this.push();
    while (true) {
      const k = this.cur();
      if (k === K_EOF || k === P_SEMI || k === P_LBRACE || this.atObjCEnd()) {
        return;
      }
      if (k === P_GREATER) {
        break;
      }
      this.push();
    }
    this.push();
  }

  /** clang-format's parseObjCProtocol (its declaration form), at the keyword. */
  parseObjCProtocol(): void {
    this.push();
    this.push(); // the name
    if (this.cur() === P_LESS) {
      this.parseObjCProtocolList();
    }
    const lineFirst = this.first;
    const l0 = this.d.nline;
    if (this.cur() === P_SEMI) {
      this.push();
      this.addLine();
      this.markObjCDecl(l0, lineFirst);
      return;
    }
    this.addLine();
    this.markObjCDecl(l0, lineFirst);
    this.parseObjCUntilAtEnd();
  }

  /** clang-format's parseObjCUntilAtEnd: an @interface or @protocol body. */
  parseObjCUntilAtEnd(): void {
    const d = this.d;
    this.objcDepth = this.objcDepth + 1;
    while (true) {
      const k = this.cur();
      if (k === K_EOF) {
        break;
      }
      if (this.first < 0 && k === K_COMMENT) {
        this.parseStructuralElement();
        continue;
      }
      if (this.atObjCEnd()) {
        this.push();
        this.push();
        this.addLine();
        break;
      }
      if (k === P_LBRACE) {
        this.parseBlock(1, false, TT_UNKNOWN);
        this.addLine();
        continue;
      }
      if (k === P_RBRACE) {
        this.push();
        this.addLine();
        continue;
      }
      if ((k === P_MINUS || k === P_PLUS) && this.first < 0) {
        this.push();
        this.parseObjCMethod();
        continue;
      }
      this.parseStructuralElement();
    }
    this.objcDepth = this.objcDepth - 1;
    d.objcSeen = true;
  }

  /** clang-format's parseObjCMethod, past the `-` or `+`: a declaration up to its `;`. */
  parseObjCMethod(): void {
    const d = this.d;
    while (true) {
      const k = this.cur();
      if (k === P_SEMI) {
        this.push();
        break;
      }
      if (k === K_EOF || k === P_LBRACE || k === P_RBRACE || this.atObjCEnd()) {
        // A method body (or no end): not formatted here.
        d.objcOther = true;
        break;
      }
      if (k === P_HASH && d.ppKind[this.pos] !== PP_NONE) {
        this.parsePPInline();
        continue;
      }
      this.push();
    }
    this.addLine();
    d.lObjC[d.nline - 1] = 1;
  }

  /** A statement or declaration, up to its `;` or its body. */
  parseStatement(): void {
    const d = this.d;
    // A free-standing macro on a line of its own (FOO_BEGIN, FOO(x)).
    const startTok = this.pos;
    if (this.first < 0 && d.kind[startTok] === K_IDENT && this.allCaps(startTok)) {
      const n = d.end[startTok] - d.start[startTok];
      this.push();
      let functionLike = false;
      // (Comments are read past: `MACRO // c` then `(...)` on the next line
      // takes those parentheses for its arguments.)
      let pq = this.pos;
      while (pq < d.ntok - 1 && d.kind[pq] === K_COMMENT) {
        pq++;
      }
      if (pq > this.pos && d.kind[pq] === P_LPAREN && this.macro < 0) {
        while (this.pos < pq) {
          this.push();
        }
      }
      if (this.cur() === P_LPAREN) {
        functionLike = true;
        this.parseParens();
      }
      // Followed by a newline: comments on the macro's own line trail it, so
      // the first comment on a later line (or the next token) decides.
      let q = this.pos;
      while (q < d.ntok - 1 && d.kind[q] === K_COMMENT && d.nl[q] === 0) {
        q++;
      }
      let nt = q;
      while (nt < d.ntok - 1 && d.kind[nt] === K_COMMENT) {
        nt++;
      }
      // (Directives in between are read past: the token after them decides.)
      if (this.macro < 0) {
        while (nt < d.ntok - 1 && d.kind[nt] === P_HASH && d.ppKind[nt] !== PP_NONE) {
          nt++;
          while (nt < d.ntok - 1 && d.inPP[nt] === 1 && d.ppKind[nt] === PP_NONE) {
            nt++;
          }
          while (nt < d.ntok - 1 && d.kind[nt] === K_COMMENT) {
            nt++;
          }
        }
      }
      // (Comments before the end are lines of their own after the macro;
      // tokens past a macro body's end are not in it at all. A comment
      // trailing the macro on its line makes it no line of its own: it joins
      // clang-format's line, which OneTokenSoFar then finds is not one token.)
      const atEnd = this.outsideBody(q) || (nt === q && this.outsideBody(nt));
      // (For `MACRO(...)` OneTokenSoFar is asked before the parentheses.)
      const trailed = q !== this.pos && !atEnd && !functionLike;
      if ((n >= 5 || functionLike) && d.nl[q] > 0 && this.canStartNewLine(nt) && !atEnd && !trailed) {
        while (d.kind[this.pos] === K_COMMENT && d.nl[this.pos] === 0) {
          this.push();
        }
        this.addLine();
        return;
      }
    }
    while (true) {
      const k = this.cur();
      if (k === K_EOF) {
        this.eofLine = this.d.nline;
        this.addLine();
        return;
      }
      if (k === P_SEMI) {
        this.push();
        this.addLine();
        return;
      }
      if (k === P_RBRACE) {
        this.addLine();
        return;
      }
      if (k === P_HASH && d.ppKind[this.pos] !== PP_NONE) {
        this.parsePPInline();
        continue;
      }
      if (k === KW_TEMPLATE && d.kind[this.pos + 1] === P_LESS) {
        this.parseTemplateParams();
        continue;
      }
      if (k === P_AT && this.macro < 0) {
        if (this.parseObjCAt()) {
          return;
        }
        continue;
      }
      // `typedef NS_ENUM(T, Name) {...}` and its kin: an enum.
      if (k === KW_TYPEDEF && d.kind[this.pos + 1] === K_IDENT && isNSEnumMacro(d, this.pos + 1)) {
        this.push();
        this.parseEnum();
        return;
      }
      if (k === KW_CLASS || k === KW_STRUCT || k === KW_UNION) {
        // `enum class X` is an enum.
        if (this.last >= 0 && d.kind[this.last] === KW_ENUM) {
          this.push();
          continue;
        }
        if (this.classHasBody()) {
          this.parseRecord();
          return;
        }
        this.push();
        continue;
      }
      if (k === KW_ENUM) {
        if (this.enumHasBody()) {
          this.parseEnum();
          return;
        }
        this.push();
        continue;
      }
      if (k === P_EQUAL) {
        this.push();
        // (Comments between are read with the `{`.)
        let q = this.pos;
        while (q < d.ntok - 1 && d.kind[q] === K_COMMENT) {
          q++;
        }
        if (q > this.pos && d.kind[q] === P_LBRACE) {
          while (this.pos < q) {
            this.push();
          }
        }
        if (this.cur() === P_LBRACE) {
          // clang-format reads this `{` past without working out its kind.
          if (d.bk[this.pos] === BK_UNKNOWN) {
            d.eqList[this.pos] = 1;
          }
          this.parseBracedList();
        }
        continue;
      }
      if (k === KW_TRY && this.last >= 0) {
        this.parseFunctionTry();
        return;
      }
      if (k === P_CARET && !(this.last >= 0 && d.kind[this.last] === KW_OPERATOR)) {
        // clang-format's statement loop reads `^ type (args) { ... }` as a
        // block literal, whatever comes before the `^` (but `operator`).
        // (After an operand the `^` is binary: the body is a plain child
        // block, not an Objective-C block literal's.)
        const bp = this.last;
        const bk = bp >= 0 ? d.kind[bp] : P_SEMI;
        const typed = !(
          bp < 0 ||
          bk === P_LPAREN ||
          bk === P_COMMA ||
          bk === P_EQUAL ||
          bk === P_LBRACE ||
          bk === P_LSQUARE ||
          bk === P_COLON ||
          bk === P_QUESTION ||
          bk === KW_RETURN ||
          bk === P_SEMI
        );
        this.push();
        if (this.cur() === K_IDENT || isSimpleTypeKind(this.cur())) {
          this.push();
          while (this.cur() === P_STAR) {
            this.push();
          }
        }
        if (this.cur() === P_LPAREN) {
          this.parseParens();
        }
        if (this.cur() === P_LBRACE) {
          d.bk[this.pos] = BK_BLOCK;
          if (!typed) {
            d.type[this.pos] = TT_BLOCK_LITERAL_LBRACE;
            d.final[this.pos] = 1;
          }
          this.parseChildBlock();
        }
        continue;
      }
      // `MACRO /* c */` then `case x:`: clang-format's statement loop reads
      // the case label into the same line.
      if (k === KW_CASE && this.first >= 0) {
        this.parseCaseLabel();
        return;
      }
      if (k === P_LBRACE) {
        // (clang-format's statement loop parses `requires {` at the
        // `requires`: a requires expression, its body a block whatever
        // follows it.)
        if (this.isRequiresExpressionBrace()) {
          d.bk[this.pos] = BK_BLOCK;
          this.parseRequiresBody();
          continue;
        }
        if (d.bk[this.pos] === BK_UNKNOWN) {
          this.calculateBraceTypes();
        }
        if (d.bk[this.pos] === BK_BRACED_INIT) {
          this.parseBracedList();
          continue;
        }
        // A function body.
        this.parseBlock(1, false, TT_FUNCTION_LBRACE);
        if (this.cur() === P_SEMI) {
          this.push();
        }
        this.addLine();
        return;
      }
      this.parseExprToken();
    }
  }

  /** `class|struct|union Name ... { members } declarators ;` */
  parseRecord(): void {
    const d = this.d;
    const kw = this.cur();
    this.push();
    let baseOrArgs = false; // past a `:` or `<`: clang-format's base-clause loop
    while (true) {
      const k = this.cur();
      if (k === P_COLON || k === P_LESS) {
        baseOrArgs = true;
      }
      if (k === P_LBRACE) {
        if (!baseOrArgs) {
          break;
        }
        // clang-format's parseRecord: a braced list (`B<T{}>`) is read past.
        // (Its kind is found here, expecting a class body.)
        d.bk[this.pos] = BK_UNKNOWN;
        this.calculateBraceTypes(true);
        if (d.bk[this.pos] !== BK_BRACED_INIT) {
          break;
        }
        this.parseBracedList();
        continue;
      }
      if (k === K_EOF || k === P_SEMI) {
        break;
      }
      if (k === P_LPAREN) {
        this.parseParens();
        continue;
      }
      if (k === P_LSQUARE) {
        this.parseSquare();
        continue;
      }
      if (k === P_HASH && d.ppKind[this.pos] !== PP_NONE) {
        this.parsePPInline();
        continue;
      }
      this.push();
    }
    if (this.cur() !== P_LBRACE) {
      this.addLine();
      return;
    }
    const tt = kw === KW_CLASS ? TT_CLASS_LBRACE : kw === KW_STRUCT ? TT_STRUCT_LBRACE : TT_UNION_LBRACE;
    this.parseBlock(1, true, tt);
    // `} name, *p;`
    while (true) {
      const k = this.cur();
      if (k === P_SEMI) {
        this.push();
        break;
      }
      const afterEq = this.last >= 0 && d.kind[this.last] === P_EQUAL;
      // Directive lines before the declarators are read past (`}` `#endif`
      // `*GC;`): the declarators continue the record's line.
      if (k === P_HASH && d.ppKind[this.pos] !== PP_NONE && this.macro < 0) {
        let i = this.pos;
        while (i < d.ntok - 1 && ((d.kind[i] === P_HASH && d.ppKind[i] !== PP_NONE) || d.inPP[i] === 1)) {
          i++;
        }
        const ki = d.kind[i];
        if (ki !== K_IDENT && ki !== P_STAR && ki !== P_SEMI) {
          break;
        }
        while (d.kind[this.pos] === P_HASH && d.ppKind[this.pos] !== PP_NONE) {
          this.parsePPInline();
        }
        continue;
      }
      // (After `=` the initializer goes on, whatever line it starts on.)
      if (
        k === K_EOF ||
        k === P_RBRACE ||
        (d.nl[this.pos] > 0 && !afterEq && k !== K_IDENT && k !== P_STAR && k !== P_EQUAL)
      ) {
        break;
      }
      if (k === P_LBRACE) {
        // `} name = {...};` (clang-format: a braced list after `=`) or `} name{...};`.
        if (afterEq) {
          if (d.bk[this.pos] === BK_UNKNOWN) {
            d.eqList[this.pos] = 1;
          }
          d.bk[this.pos] = BK_BRACED_INIT;
        } else if (d.bk[this.pos] === BK_UNKNOWN) {
          this.calculateBraceTypes();
        }
        if (d.bk[this.pos] === BK_BLOCK) {
          break;
        }
        this.parseBracedList();
        continue;
      }
      this.parseExprToken();
    }
    this.addLine();
  }

  /** `enum [class] Name [: type] { list };` — the list stays in the line. */
  parseEnum(): void {
    const d = this.d;
    while (this.cur() !== P_LBRACE && this.cur() !== K_EOF) {
      if (this.cur() === P_HASH && d.ppKind[this.pos] !== PP_NONE && this.macro < 0) {
        this.parsePPInline();
        continue;
      }
      this.push();
    }
    if (this.cur() !== P_LBRACE) {
      this.addLine();
      return;
    }
    const lb = this.pos;
    d.type[lb] = TT_ENUM_LBRACE;
    d.final[lb] = 1;
    this.parseBracedList();
    d.bk[lb] = BK_BLOCK;
    const rb = d.match[lb];
    if (rb >= 0) {
      d.bk[rb] = BK_BLOCK;
    }
    while (this.cur() !== P_SEMI && this.cur() !== K_EOF && this.cur() !== P_RBRACE) {
      this.parseExprToken();
    }
    if (this.cur() === P_SEMI) {
      this.push();
    }
    this.addLine();
  }
}

// Unused placeholder kind; keeps `if constexpr` handling readable above.
const P_EXCLAIM_SENTINEL: i32 = -1000;

/**
 * The words clang-format's tryToParseLambda reads between a lambda's `]`
 * and its `{`: names, simple types and a few keywords. Any other keyword
 * (`public`, `__attribute__`) means no lambda.
 */
const lambdaWord = (k: i32): boolean => {
  if (isIdentKind(k) || isSimpleTypeKind(k)) {
    return true;
  }
  switch (k) {
    case KW_AUTO:
    case KW_CLASS:
    case KW_TEMPLATE:
    case KW_TYPENAME:
    case KW_CONST:
    case KW_CONSTEXPR:
    case KW_CONSTEVAL:
    case KW_MUTABLE:
    case KW_NOEXCEPT:
    case KW_STATIC:
    case KW_REQUIRES:
      return true;
    default:
      return false;
  }
};

/** Whether token `t` is Qt's `slots`/`Q_SLOTS` (or, with `signals`, also `signals`/`Q_SIGNALS`). */
export function isQtWord(d: Doc, t: i32, signals: boolean): boolean {
  if (d.kind[t] !== K_IDENT) {
    return false;
  }
  return d.is(t, "slots") || d.is(t, "Q_SLOTS") || (signals && (d.is(t, "signals") || d.is(t, "Q_SIGNALS")));
}

/** Whether kind `k` can follow a variable's name (clang-format's isCOperatorFollowingVar). */
export const isOperatorAfterVar = (k: i32): boolean => {
  switch (k) {
    case P_AMPAMP:
    case P_AMPEQUAL:
    case P_ARROW:
    case P_CARET:
    case P_CARETEQUAL:
    case P_COMMA:
    case P_ELLIPSIS:
    case P_EQUAL:
    case P_EQUALEQUAL:
    case P_EXCLAIM:
    case P_EXCLAIMEQUAL:
    case P_GREATER:
    case P_GREATEREQUAL:
    case P_GREATERGREATEREQUAL:
    case P_LPAREN:
    case P_LSQUARE:
    case P_LESS:
    case P_LESSEQUAL:
    case P_LESSLESS:
    case P_LESSLESSEQUAL:
    case P_MINUS:
    case P_MINUSEQUAL:
    case P_MINUSMINUS:
    case P_PERCENT:
    case P_PERCENTEQUAL:
    case P_PERIOD:
    case P_PIPE:
    case P_PIPEEQUAL:
    case P_PIPEPIPE:
    case P_PLUS:
    case P_PLUSEQUAL:
    case P_PLUSPLUS:
    case P_QUESTION:
    case P_RBRACE:
    case P_RPAREN:
    case P_RSQUARE:
    case P_SEMI:
    case P_SLASH:
    case P_SLASHEQUAL:
    case P_STAR:
    case P_STAREQUAL:
      return true;
    default:
      return false;
  }
};

/**
 * Whether token `t` is one of clang-format's default ForEachMacros
 * (`foreach`, `Q_FOREACH`, `BOOST_FOREACH`), and not the name a `#define`
 * gives.
 */
export const isForEachMacro = (d: Doc, t: i32): boolean => {
  if (d.kind[t] !== K_IDENT) {
    return false;
  }
  const n = d.end[t] - d.start[t];
  if (n !== 7 && n !== 9 && n !== 13) {
    return false;
  }
  if (!d.is(t, "foreach") && !d.is(t, "Q_FOREACH") && !d.is(t, "BOOST_FOREACH")) {
    return false;
  }
  const p = d.prv[t];
  return !(p >= 0 && d.prv[p] >= 0 && d.kind[d.prv[p]] === P_HASH && d.ppKind[d.prv[p]] === PP_DEFINE);
};

/** Whether token `t` can start a new line (clang-format's tokenCanStartNewLine). */
export const tokenCanStartNewLine = (d: Doc, t: i32): boolean => {
  // clang-format's tokenCanStartNewLine.
  switch (d.kind[t]) {
    case P_SEMI:
    case P_LBRACE:
    case P_PERIOD:
    case P_PERIODSTAR:
    case P_ARROW:
    case P_ARROWSTAR:
    case P_LESS:
    case P_GREATER:
    case P_SLASH:
    case P_PERCENT:
    case P_LESSLESS:
    case P_EQUAL:
    case P_PLUSEQUAL:
    case P_MINUSEQUAL:
    case P_STAREQUAL:
    case P_SLASHEQUAL:
    case P_PERCENTEQUAL:
    case P_AMPEQUAL:
    case P_PIPEEQUAL:
    case P_CARETEQUAL:
    case P_GREATERGREATEREQUAL:
    case P_LESSLESSEQUAL:
    case P_COLON:
    case KW_NOEXCEPT:
      return false;
    default:
      return true;
  }
};

/** clang-format's typedef enum macros: NS_ENUM, NS_OPTIONS, CF_ENUM, CF_OPTIONS, CF_CLOSED_ENUM, NS_CLOSED_ENUM. */
const isNSEnumMacro = (d: Doc, t: i32): boolean =>
  d.is(t, "NS_ENUM") ||
  d.is(t, "NS_OPTIONS") ||
  d.is(t, "CF_ENUM") ||
  d.is(t, "CF_OPTIONS") ||
  d.is(t, "CF_CLOSED_ENUM") ||
  d.is(t, "NS_CLOSED_ENUM");

/** `xs` grown to `n` entries, the new ones -1. */
const growFill = (xs: i32[], n: i32): i32[] => {
  const ys = new Array<i32>(n);
  ys.fill(-1);
  for (let i = 0; i < toI32(xs.length); i++) {
    ys[i] = xs[i];
  }
  return ys;
};
