// Layout/SpaceAroundKeyword and Layout/SpaceAroundBlockParameters
// (EnforcedStyleInsidePipes: no_space).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_BEGIN,
  F_ELSE,
  F_END,
  F_KEYWORD,
  F_OPERATOR,
  F_SELECTOR,
  NT_AND,
  NT_BLOCK,
  NT_BREAK,
  NT_CASE,
  NT_CASE_MATCH,
  NT_DEFINED_P,
  NT_ENSURE,
  NT_ERANGE,
  NT_FOR,
  NT_IF,
  NT_IF_GUARD,
  NT_IN_PATTERN,
  NT_IRANGE,
  NT_KWBEGIN,
  NT_MATCH_PATTERN_P,
  NT_MLHS,
  NT_NEXT,
  NT_NUMBLOCK,
  NT_OR,
  NT_POSTEXE,
  NT_PREEXE,
  NT_RESBODY,
  NT_RESCUE,
  NT_RETURN,
  NT_SEND,
  NT_SUPER,
  NT_UNLESS_GUARD,
  NT_UNTIL,
  NT_WHEN,
  NT_WHILE,
  NT_YIELD,
  NT_ZSUPER,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { rbSpaceBegin } from "../help";
import { rnE, rnFieldSrc, rnHas, rnMethod, rnS } from "../node";
import { RbSource } from "../source";
import { lspIsWs } from "./layout_space_help";
import { lspOperatorMethod } from "./layout_space_misc";

// The begin keyword a check accepts: "do", "then" or none.
const LSP_KW_DO: i32 = 0;
const LSP_KW_THEN: i32 = 1;
const LSP_KW_NONE: i32 = 2;

export class CopLayoutSpaceAroundKeyword {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/SpaceAroundKeyword");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_AND || t === NT_OR) {
        const op = rnFieldSrc(src, n, F_OPERATOR);
        if (op === "and" || op === "or") {
          this.checkLoc(src, n, F_OPERATOR, LSP_KW_DO);
        }
      } else if (t === NT_BLOCK || t === NT_NUMBLOCK || t === NT_FOR) {
        this.checkLoc(src, n, F_BEGIN, LSP_KW_DO);
        this.checkLoc(src, n, F_END, LSP_KW_DO);
      } else if (
        t === NT_BREAK ||
        t === NT_ENSURE ||
        t === NT_IF_GUARD ||
        t === NT_IN_PATTERN ||
        t === NT_NEXT ||
        t === NT_POSTEXE ||
        t === NT_PREEXE ||
        t === NT_RESBODY ||
        t === NT_RETURN ||
        t === NT_SUPER ||
        t === NT_ZSUPER ||
        t === NT_UNLESS_GUARD ||
        t === NT_WHEN ||
        t === NT_YIELD ||
        t === NT_DEFINED_P
      ) {
        this.checkLoc(src, n, F_KEYWORD, LSP_KW_DO);
      } else if (t === NT_CASE || t === NT_CASE_MATCH) {
        this.checkLoc(src, n, F_KEYWORD, LSP_KW_DO);
        this.checkLoc(src, n, F_ELSE, LSP_KW_DO);
      } else if (t === NT_IF) {
        this.checkLoc(src, n, F_KEYWORD, LSP_KW_THEN);
        this.checkLoc(src, n, F_ELSE, LSP_KW_THEN);
        this.checkLoc(src, n, F_BEGIN, LSP_KW_THEN);
        this.checkLoc(src, n, F_END, LSP_KW_THEN);
      } else if (t === NT_KWBEGIN) {
        this.checkLoc(src, n, F_BEGIN, LSP_KW_NONE);
        this.checkLoc(src, n, F_END, LSP_KW_NONE);
      } else if (t === NT_MATCH_PATTERN_P) {
        this.checkLoc(src, n, F_OPERATOR, LSP_KW_DO);
      } else if (t === NT_RESCUE) {
        this.checkLoc(src, n, F_ELSE, LSP_KW_DO);
      } else if (t === NT_SEND) {
        // prefix_not?
        if (a.kid(n, 0) !== V_NIL && rnMethod(src, n) === "!" && rnHas(src, n, F_SELECTOR) && rnFieldSrc(src, n, F_SELECTOR) === "not") {
          this.checkLoc(src, n, F_SELECTOR, LSP_KW_DO);
        }
      } else if (t === NT_UNTIL || t === NT_WHILE) {
        this.checkLoc(src, n, F_BEGIN, LSP_KW_DO);
        this.checkLoc(src, n, F_END, LSP_KW_DO);
        this.checkLoc(src, n, F_KEYWORD, LSP_KW_DO);
      }
    }
  }

  private checkLoc(src: RbSource, n: i32, f: i32, kw: i32): void {
    if (!rnHas(src, n, f)) {
      return;
    }
    const s = rnS(src, n, f);
    const e = rnE(src, n, f);
    if (f === F_BEGIN) {
      if (kw === LSP_KW_DO && src.src(s, e) !== "do") {
        return;
      }
      if (kw === LSP_KW_THEN && src.src(s, e) !== "then") {
        return;
      }
      this.checkKeyword(src, n, s, e);
    } else if (f === F_END) {
      if (kw === LSP_KW_DO && !(rnHas(src, n, F_BEGIN) && rnFieldSrc(src, n, F_BEGIN) === "do")) {
        return;
      }
      if (!this.spaceBeforeMissing(src, s)) {
        return;
      }
      this.insert(s, e, true);
    } else {
      this.checkKeyword(src, n, s, e);
    }
  }

  private insert(s: i32, e: i32, before: boolean): void {
    const k = this.c.offense(s, e);
    if (k === null) {
      return;
    }
    if (before) {
      k.insertBefore(s, e, " ");
    } else {
      k.insertAfter(s, e, " ");
    }
    this.c.commit(k);
  }

  private checkKeyword(src: RbSource, n: i32, s: i32, e: i32): void {
    if (this.spaceBeforeMissing(src, s) && !this.precededByOperator(src, n)) {
      this.insert(s, e, true);
    }
    if (!this.spaceAfterMissing(src, s, e)) {
      return;
    }
    // block_brace_with_no_space_style?: SpaceBeforeBlockBraces is the space style.
    this.insert(s, e, false);
  }

  /** /[\s(|{\[;,*=]/ does not match the character before. */
  private spaceBeforeMissing(src: RbSource, s: i32): boolean {
    const pos = s - 1;
    if (pos < 0) {
      return false;
    }
    const c = src.at(pos);
    if (lspIsWs(c)) {
      return false;
    }
    return "(|{[;,*=".indexOf(String.fromCharCode(c)) < 0 || c > 127;
  }

  private spaceAfterMissing(src: RbSource, s: i32, e: i32): boolean {
    const c = src.at(e);
    if (c < 0) {
      return false;
    }
    const kw = src.src(s, e);
    if ((kw === "super" || kw === "yield") && c === 91) {
      return false;
    }
    if (c === 40 && (kw === "break" || kw === "defined?" || kw === "next" || kw === "not" || kw === "rescue" || kw === "super" || kw === "yield")) {
      return false;
    }
    if (c === 38 && src.at(e + 1) === 46) {
      return false;
    }
    if (kw === "super" && c === 58 && src.at(e + 1) === 58) {
      return false;
    }
    if (lspIsWs(c)) {
      return false;
    }
    if (c > 127) {
      return true;
    }
    return ";,#\\)}].".indexOf(String.fromCharCode(c)) < 0;
  }

  private precededByOperator(src: RbSource, n: i32): boolean {
    const a = src.a;
    let p = src.parent(n);
    while (p !== V_NIL) {
      const t = a.type(p);
      if (t === NT_AND || t === NT_OR || t === NT_IRANGE || t === NT_ERANGE) {
        return true;
      }
      if (t !== NT_SEND) {
        return false;
      }
      if (lspOperatorMethod(rnMethod(src, p))) {
        return true;
      }
      p = src.parent(p);
    }
    return false;
  }
}

export class CopLayoutSpaceAroundBlockParameters {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/SpaceAroundBlockParameters");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_BLOCK) {
        continue;
      }
      const args = a.kid(n, 1);
      if (!a.isNode(args) || a.nKid(args) === 0) {
        continue;
      }
      if (!rnHas(src, args, F_BEGIN) || !rnHas(src, args, F_END)) {
        continue;
      }
      const os = rnS(src, args, F_BEGIN);
      const oe = rnE(src, args, F_BEGIN);
      const cs = rnS(src, args, F_END);
      const ce = rnE(src, args, F_END);
      // check_inside_pipes unless checked_by_space_inside_parens?
      if (src.src(os, oe) !== "(") {
        const first = a.kid(args, 0);
        const last = a.kid(args, -1);
        this.checkNoSpace(src, oe, a.exS(first));
        this.checkNoSpace(src, this.lastEndInsidePipes(src, args, a.exE(last)), cs);
      }
      // check_after_closing_pipe
      const body = a.kid(n, 2);
      if (body !== V_NIL && ce === a.exS(body)) {
        const k = this.c.offense(cs, ce);
        if (k !== null) {
          k.insertAfter(ce, ce, " ");
          this.c.commit(k);
        }
      }
      for (let i = 0; i < a.nKid(args); i++) {
        this.checkArg(src, a.kid(args, i));
      }
    }
  }

  private lastEndInsidePipes(src: RbSource, args: i32, pos: i32): i32 {
    const e = src.a.exE(args);
    for (let i = pos; i < e; i++) {
      if (src.at(i) === 44) {
        return i + 1;
      }
    }
    return pos;
  }

  private checkArg(src: RbSource, arg: i32): void {
    const a = src.a;
    if (a.type(arg) === NT_MLHS) {
      for (let i = 0; i < a.nKid(arg); i++) {
        this.checkArg(src, a.kid(arg, i));
      }
    }
    const s = a.exS(arg);
    this.checkNoSpace(src, rbSpaceBegin(src, s, 1, true, false, false), s - 1);
  }

  private checkNoSpace(src: RbSource, s: i32, e: i32): void {
    if (s >= e) {
      return;
    }
    for (let i = s; i < e; i++) {
      if (src.at(i) === 10) {
        return;
      }
    }
    const k = this.c.offense(s, e);
    if (k !== null) {
      k.remove(s, e);
      this.c.commit(k);
    }
  }
}
