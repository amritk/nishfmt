// The Layout cops about the space inside brackets and interpolations:
// SpaceInsideArrayLiteralBrackets, SpaceInsideReferenceBrackets and
// SpaceInsideStringInterpolation (all EnforcedStyle: no_space, with
// no_space empty brackets), on the SurroundingSpace mixin.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_BEGIN,
  F_SELECTOR,
  NT_ARRAY,
  NT_ARRAY_PATTERN,
  NT_BEGIN,
  NT_CONST_PATTERN,
  NT_DSTR,
  NT_DSYM,
  NT_REGEXP,
  NT_SEND,
  NT_XSTR,
  V_NIL,
} from "../ast";
import { add32, atI32, sub32 } from "../../core/arr";
import { fault } from "../../core/fault";
import { RbCop } from "../cop";
import { rnFieldSrc, rnHas, rnMethod, rnS } from "../node";
import { RbSource, TK_COMMENT } from "../source";
import { TK_tLBRACK, TK_tLBRACK2, TK_tRBRACK } from "../tables";
import { LspIgnored, LspToks, lspEmptyOffenses, lspIsWs, lspNoSpaceOffenses } from "./layout_space_help";

/** Node#single_line? (the expression). */
const lspSingleLine = (src: RbSource, n: i32): boolean => src.line(src.a.exS(n)) === src.line(src.a.exE(n));

export class CopLayoutSpaceInsideArrayLiteralBrackets {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/SpaceInsideArrayLiteralBrackets");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    const tk = new LspToks(src);
    const ign = new LspIgnored();
    for (const n0 of src.pre) {
      const t = a.type(n0);
      if (t !== NT_ARRAY && t !== NT_ARRAY_PATTERN) {
        continue;
      }
      if (t === NT_ARRAY && !(rnHas(src, n0, F_BEGIN) && rnFieldSrc(src, n0, F_BEGIN) === "[")) {
        continue;
      }
      // find_node_with_brackets
      let n = n0;
      let p = src.parent(n0);
      while (p !== V_NIL) {
        if (a.type(p) === NT_CONST_PATTERN) {
          n = p;
          break;
        }
        p = src.parent(p);
      }
      const from = tk.withinFrom(a.exS(n));
      const to = tk.withinTo(a.exE(n));
      const tt = tk.t;
      let li = -1;
      let ri = -1;
      for (let i = from; i <= to; i++) {
        // withinFrom and withinTo answer token indexes.
        if (i < 0 || i >= tt.length) {
          fault();
          return;
        }
        if (tt[i] === TK_tLBRACK || tt[i] === TK_tLBRACK2) {
          li = i;
          break;
        }
      }
      for (let i = to; i >= from; i--) {
        if (i < 0 || i >= tt.length) {
          fault();
          return;
        }
        if (tt[i] === TK_tRBRACK) {
          ri = i;
          break;
        }
      }
      if (li < 0 || ri < 0) {
        continue;
      }
      if (li === ri - 1) {
        lspEmptyOffenses(this.c, atI32(tk.s, li), atI32(tk.e, li), atI32(tk.s, ri), atI32(tk.e, ri));
        continue;
      }
      let endOk = false;
      if (!lspSingleLine(src, n)) {
        // end_has_own_line?
        const rs = atI32(tk.s, ri);
        const ls = src.lineStart(src.line(rs));
        endOk = true;
        for (let i = ls; i < rs; i++) {
          if (!lspIsWs(src.at(i))) {
            endOk = false;
            break;
          }
        }
      }
      const startOk = li < to && atI32(tk.t, li + 1) === TK_COMMENT;
      lspNoSpaceOffenses(
        this.c,
        ign,
        src,
        n,
        atI32(tk.s, li),
        atI32(tk.e, li),
        atI32(tk.s, ri),
        atI32(tk.e, ri),
        startOk,
        endOk,
      );
    }
  }
}

export class CopLayoutSpaceInsideReferenceBrackets {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/SpaceInsideReferenceBrackets");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    const tk = new LspToks(src);
    const ign = new LspIgnored();
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND) {
        continue;
      }
      const m = rnMethod(src, n);
      if (m !== "[]" && m !== "[]=") {
        continue;
      }
      if (!rnHas(src, n, F_SELECTOR)) {
        continue;
      }
      const from = tk.withinFrom(a.exS(n));
      const to = tk.withinTo(a.exE(n));
      const bpos = rnS(src, n, F_SELECTOR);
      const tt = tk.t;
      const ts = tk.s;
      let li = -1;
      for (let i = from; i <= to; i++) {
        // withinFrom and withinTo answer token indexes.
        if (i < 0 || i >= tt.length || i >= ts.length) {
          fault();
          return;
        }
        if (tt[i] === TK_tLBRACK2 && ts[i] === bpos) {
          li = i;
          break;
        }
      }
      if (li < 0) {
        continue;
      }
      // closing_bracket
      let ri = -1;
      let depth = 0;
      for (let i = li; i <= to; i++) {
        if (i < 0 || i >= tt.length) {
          fault();
          return;
        }
        if (tt[i] === TK_tLBRACK || tt[i] === TK_tLBRACK2) {
          depth = add32(depth, 1);
        }
        if (tt[i] === TK_tRBRACK) {
          depth = sub32(depth, 1);
          if (depth === 0) {
            ri = i;
            break;
          }
        }
      }
      if (ri < 0) {
        continue;
      }
      if (li === ri - 1) {
        lspEmptyOffenses(this.c, atI32(tk.s, li), atI32(tk.e, li), atI32(tk.s, ri), atI32(tk.e, ri));
        continue;
      }
      if (!lspSingleLine(src, n)) {
        continue;
      }
      lspNoSpaceOffenses(
        this.c,
        ign,
        src,
        n,
        atI32(tk.s, li),
        atI32(tk.e, li),
        atI32(tk.s, ri),
        atI32(tk.e, ri),
        false,
        false,
      );
    }
  }
}

export class CopLayoutSpaceInsideStringInterpolation {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/SpaceInsideStringInterpolation");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    const tk = new LspToks(src);
    const ign = new LspIgnored();
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_DSTR && t !== NT_XSTR && t !== NT_DSYM && t !== NT_REGEXP) {
        continue;
      }
      for (let ci = 0; ci < a.nKid(n); ci++) {
        const b = a.kid(n, ci);
        if (!a.isNode(b) || a.type(b) !== NT_BEGIN) {
          continue;
        }
        if (!lspSingleLine(src, b)) {
          continue;
        }
        const li = tk.firstIdx(a.exS(b));
        const ri = tk.lastIdx(a.exE(b));
        if (li < 0 || ri < 0) {
          continue;
        }
        if (li === ri - 1) {
          continue;
        }
        lspNoSpaceOffenses(
          this.c,
          ign,
          src,
          b,
          atI32(tk.s, li),
          atI32(tk.e, li),
          atI32(tk.s, ri),
          atI32(tk.e, ri),
          false,
          false,
        );
      }
    }
  }
}
