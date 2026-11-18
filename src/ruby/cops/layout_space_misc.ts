// Smaller Layout spacing cops: SpaceBeforeBlockBraces,
// SpaceAroundEqualsInParameterDefault, SpaceAfterNot,
// SpaceAroundMethodCallOperator, SpaceAfterColon, SpaceAfterMethodName,
// SpaceInLambdaLiteral and SpaceInsideRangeLiteral (default configuration).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_BEGIN,
  F_DOT,
  F_DOUBLE_COLON,
  F_END,
  F_KEYWORD,
  F_NAME,
  F_OPERATOR,
  F_SELECTOR,
  NT_BLOCK,
  NT_CONST,
  NT_CSEND,
  NT_DEF,
  NT_DEFS,
  NT_ERANGE,
  NT_IRANGE,
  NT_KWOPTARG,
  NT_NUMBLOCK,
  NT_OPTARG,
  NT_PAIR,
  NT_SEND,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { rbSpaceBegin } from "../help";
import { rnE, rnFieldSrc, rnHas, rnMethod, rnS } from "../node";
import { RbSource } from "../source";
import { LspToks, lspIsBlank, lspIsWs, lspSpaceAfter } from "./layout_space_help";

/** RuboCop's operator methods (MethodIdentifierPredicates::OPERATOR_METHODS). */
export const lspOperatorMethod = (m: string): boolean =>
  ",|,^,&,<=>,==,===,=~,>,>=,<,<=,<<,>>,+,-,*,/,%,**,~,+@,-@,!@,~@,[],[]=,!,!=,!~,`,".indexOf(`,${m},`) >= 0;

/** MethodDispatchNode#unary_operation? of a send/csend. */
export const lspUnaryOperation = (src: RbSource, n: i32): boolean => {
  let f = F_SELECTOR;
  if (rnHas(src, n, F_KEYWORD)) {
    f = F_KEYWORD;
  }
  if (!rnHas(src, n, f)) {
    return false;
  }
  return lspOperatorMethod(rnMethod(src, n)) && src.a.exS(n) === rnS(src, n, f);
};

export class CopLayoutSpaceBeforeBlockBraces {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/SpaceBeforeBlockBraces");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_BLOCK && t !== NT_NUMBLOCK) {
        continue;
      }
      if (rnFieldSrc(src, n, F_END) === "end") {
        continue;
      }
      const ls = rnS(src, n, F_BEGIN);
      const le = rnE(src, n, F_BEGIN);
      // Both the empty and the non-empty braces want a space (style space).
      if (rbSpaceBegin(src, ls, 0, true, false, false) !== ls) {
        continue;
      }
      const k = this.c.offense(ls, le);
      if (k !== null) {
        k.insertBefore(ls, le, " ");
        this.c.commit(k);
      }
    }
  }
}

export class CopLayoutSpaceAroundEqualsInParameterDefault {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/SpaceAroundEqualsInParameterDefault");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    const tk = new LspToks(src);
    for (const n of src.pre) {
      if (a.type(n) !== NT_OPTARG) {
        continue;
      }
      const from = tk.withinFrom(a.exS(n));
      const to = tk.withinTo(a.exE(n));
      if (to - from + 1 < 3) {
        continue;
      }
      const argE = tk.e[from];
      if (lspSpaceAfter(src, argE) && lspSpaceAfter(src, tk.e[from + 1])) {
        continue;
      }
      const s = argE;
      const e = tk.s[from + 2];
      const k = this.c.offense(s, e);
      if (k === null) {
        continue;
      }
      // /=\s*(\S+)/
      let rest = "";
      for (let i = s; i < e; i++) {
        if (src.at(i) !== 61) {
          continue;
        }
        let j = i + 1;
        while (j < e && lspIsWs(src.at(j))) {
          j++;
        }
        let q = j;
        while (q < e && !lspIsWs(src.at(q))) {
          q++;
        }
        if (q > j) {
          rest = src.src(j, q);
          break;
        }
      }
      k.replace(s, e, ` = ${rest}`);
      this.c.commit(k);
    }
  }
}

export class CopLayoutSpaceAfterNot {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/SpaceAfterNot");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND || rnMethod(src, n) !== "!") {
        continue;
      }
      const recv = a.kid(n, 0);
      if (recv === V_NIL || !rnHas(src, n, F_SELECTOR) || rnFieldSrc(src, n, F_SELECTOR) !== "!") {
        continue;
      }
      if (a.exS(recv) - a.exS(n) <= 1) {
        continue;
      }
      if (a.isNode(recv) && a.type(recv) === NT_SEND && lspUnaryOperation(src, recv) && rnMethod(src, recv) === "~") {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k !== null) {
        k.remove(rnE(src, n, F_SELECTOR), a.exS(recv));
        this.c.commit(k);
      }
    }
  }
}

export class CopLayoutSpaceAroundMethodCallOperator {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/SpaceAroundMethodCallOperator");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_SEND || t === NT_CSEND) {
        if (!rnHas(src, n, F_DOT)) {
          continue;
        }
        const dot = rnFieldSrc(src, n, F_DOT);
        if (dot !== "." && dot !== "&.") {
          continue;
        }
        this.check(src, a.exE(a.kid(n, 0)), rnS(src, n, F_DOT));
        let sel = -1;
        if (rnHas(src, n, F_SELECTOR)) {
          sel = rnS(src, n, F_SELECTOR);
        } else if (rnMethod(src, n) === "call" && rnHas(src, n, F_BEGIN)) {
          sel = rnS(src, n, F_BEGIN);
        }
        if (sel >= 0) {
          this.check(src, rnE(src, n, F_DOT), sel);
        }
      } else if (t === NT_CONST && rnHas(src, n, F_DOUBLE_COLON)) {
        this.check(src, rnE(src, n, F_DOUBLE_COLON), rnS(src, n, F_NAME));
      }
    }
  }

  private check(src: RbSource, s: i32, e: i32): void {
    if (e <= s) {
      return;
    }
    for (let i = s; i < e; i++) {
      if (!lspIsBlank(src.at(i))) {
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

export class CopLayoutSpaceAfterColon {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/SpaceAfterColon");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      let s = -1;
      if (t === NT_PAIR) {
        if (!rnHas(src, n, F_OPERATOR) || rnFieldSrc(src, n, F_OPERATOR) !== ":") {
          continue;
        }
        if (src.nodeSrc(n).endsWith(":")) {
          continue; // value_omission?
        }
        s = rnS(src, n, F_OPERATOR);
      } else if (t === NT_KWOPTARG) {
        s = rnE(src, n, F_NAME);
      } else {
        continue;
      }
      if (lspIsWs(src.at(s + 1))) {
        continue;
      }
      const k = this.c.offense(s, s + 1);
      if (k !== null) {
        k.insertAfter(s, s + 1, " ");
        this.c.commit(k);
      }
    }
  }
}

export class CopLayoutSpaceAfterMethodName {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/SpaceAfterMethodName");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_DEF && t !== NT_DEFS) {
        continue;
      }
      const args = a.kid(n, t === NT_DEF ? 1 : 2);
      if (!a.isNode(args) || !rnHas(src, args, F_BEGIN) || rnFieldSrc(src, args, F_BEGIN) !== "(") {
        continue;
      }
      const b = a.exS(args);
      if (src.at(b - 1) !== 32) {
        continue;
      }
      const k = this.c.offense(b - 1, b);
      if (k !== null) {
        k.remove(b - 1, b);
        this.c.commit(k);
      }
    }
  }
}

export class CopLayoutSpaceInLambdaLiteral {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/SpaceInLambdaLiteral");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND || rnMethod(src, n) !== "lambda" || src.nodeSrc(n) !== "->") {
        continue;
      }
      const p = src.parent(n);
      if (p === V_NIL || a.type(p) !== NT_BLOCK || a.kid(p, 0) !== n) {
        continue;
      }
      const args = a.kid(p, 1);
      if (!a.isNode(args) || a.nKid(args) === 0) {
        continue;
      }
      const s = a.exE(n);
      const e = a.exS(args);
      if (e <= s) {
        continue;
      }
      const k = this.c.offense(s, e);
      if (k !== null) {
        k.remove(s, e);
        this.c.commit(k);
      }
    }
  }
}

export class CopLayoutSpaceInsideRangeLiteral {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/SpaceInsideRangeLiteral");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_IRANGE && t !== NT_ERANGE) {
        continue;
      }
      const os = rnS(src, n, F_OPERATOR);
      const oe = rnE(src, n, F_OPERATOR);
      const ss: i32[] = [];
      const se: i32[] = [];
      const b = a.kid(n, 0);
      if (b !== V_NIL) {
        this.ws(src, a.exE(b), os, ss, se);
      }
      const e = a.kid(n, 1);
      if (e !== V_NIL) {
        this.ws(src, oe, a.exS(e), ss, se);
      }
      let all = true;
      for (let i = 0; i < toI32(ss.length); i++) {
        if (!(ss[i] === oe && src.at(ss[i]) === 10)) {
          all = false;
        }
      }
      if (all) {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k !== null) {
        for (let i = 0; i < toI32(ss.length); i++) {
          k.remove(ss[i], se[i]);
        }
        this.c.commit(k);
      }
    }
  }

  /** whitespace_range: [s, e) when it is all whitespace. */
  private ws(src: RbSource, s: i32, e: i32, ss: i32[], se: i32[]): void {
    if (e <= s) {
      return;
    }
    for (let i = s; i < e; i++) {
      if (!lspIsWs(src.at(i))) {
        return;
      }
    }
    ss.push(s);
    se.push(e);
  }
}
