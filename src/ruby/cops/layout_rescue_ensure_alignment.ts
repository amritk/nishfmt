// Layout/RescueEnsureAlignment (with Layout/BeginEndAlignment's start_of_line
// style).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_BEGIN,
  F_DOT,
  F_KEYWORD,
  F_SELECTOR,
  M_SEND,
  NT_BLOCK,
  NT_CLASS,
  NT_CSEND,
  NT_DEF,
  NT_DEFS,
  NT_ENSURE,
  NT_KWBEGIN,
  NT_MODULE,
  NT_NUMBLOCK,
  NT_RESBODY,
  NT_SCLASS,
  NT_SEND,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { rnE, rnHas, rnMethod, rnS } from "../node";
import { RbSource } from "../source";
import { TK_kRESCUE_MOD } from "../tables";
import {
  rmlAccessModifier,
  rmlBlankRange,
  rmlIsAssignment,
  rmlIsBlock,
  rmlSpaces,
  rmlStartLineRange,
} from "./layout_multiline_help";

/** RescueEnsureAlignment#access_modifier? */
const rmlReaAccessModifier = (src: RbSource, n: i32): boolean => {
  if (n === V_NIL) {
    return false;
  }
  const t = src.a.type(n);
  if (t === NT_SEND && rmlAccessModifier(src, n)) {
    return true;
  }
  let name = "";
  if (t === NT_SEND || t === NT_CSEND) {
    name = rnMethod(src, n);
  } else if (t === NT_DEF) {
    name = src.a.text(src.a.kid(n, 0));
  } else if (t === NT_DEFS) {
    name = src.a.text(src.a.kid(n, 1));
  } else {
    return false;
  }
  return name === "public_class_method" || name === "private_class_method";
};

export class CopLayoutRescueEnsureAlignment {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/RescueEnsureAlignment");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const mods = new Set<i32>();
    for (let i = 0; i < toI32(src.tokT.length); i++) {
      if (src.tokT[i] === TK_kRESCUE_MOD) {
        mods.add(src.tokS[i]);
      }
    }
    for (const n of src.pre) {
      const t = src.a.type(n);
      if (t === NT_RESBODY) {
        if (!mods.has(rnS(src, n, F_KEYWORD))) {
          this.check(src, n);
        }
      } else if (t === NT_ENSURE) {
        this.check(src, n);
      }
    }
  }

  private check(src: RbSource, n: i32): void {
    const al = this.alignmentNode(src, n);
    if (al === V_NIL) {
      return;
    }
    const as = rmlStartLineRange(src, al).s;
    const ks = rnS(src, n, F_KEYWORD);
    const kcol = src.column(ks);
    if (src.column(as) === kcol || src.line(as) === src.line(ks)) {
      return;
    }
    const k = this.c.offense(ks, rnE(src, n, F_KEYWORD));
    if (k === null) {
      return;
    }
    if (rmlBlankRange(src, ks - kcol, ks)) {
      k.replace(ks - kcol, ks, rmlSpaces(src.column(as)));
    }
    this.c.commit(k);
  }

  /** alignment_node (V_NIL for none). */
  private alignmentNode(src: RbSource, n: i32): i32 {
    let anc = src.parent(n);
    while (anc !== V_NIL) {
      const t = src.a.type(anc);
      if (
        t === NT_KWBEGIN ||
        t === NT_DEF ||
        t === NT_DEFS ||
        t === NT_CLASS ||
        t === NT_MODULE ||
        t === NT_SCLASS ||
        t === NT_BLOCK ||
        t === NT_NUMBLOCK
      ) {
        break;
      }
      anc = src.parent(anc);
    }
    if (anc === V_NIL || src.a.type(anc) === NT_KWBEGIN) {
      return anc;
    }
    if (rmlIsBlock(src, anc) && this.lineBreakMethod(src, anc, n)) {
      return V_NIL;
    }
    const p = src.parent(anc);
    if (p !== V_NIL && rmlIsAssignment(src, p) && src.line(src.a.exS(anc)) === src.line(src.a.exS(p))) {
      return p;
    }
    const t = src.a.type(anc);
    if ((t === NT_DEF || t === NT_DEFS) && rmlReaAccessModifier(src, p)) {
      return p;
    }
    return anc;
  }

  /** aligned_with_line_break_method? */
  private lineBreakMethod(src: RbSource, blk: i32, n: i32): boolean {
    const sn = src.a.kid(blk, 0);
    const doLine = src.line(rnS(src, blk, F_BEGIN));
    const col = src.column(rnS(src, n, F_KEYWORD));
    let sel = -1;
    if (src.a.mapKind(src.a.map(sn)) === M_SEND) {
      if (rnHas(src, sn, F_DOT)) {
        const d = rnS(src, sn, F_DOT);
        if (src.line(d) === doLine && src.column(d) === col) {
          return true;
        }
      }
      if (rnHas(src, sn, F_SELECTOR)) {
        sel = rnS(src, sn, F_SELECTOR);
      }
    } else {
      sel = src.a.exS(sn);
    }
    return sel >= 0 && src.line(sel) === doLine && src.column(sel) === col;
  }
}
