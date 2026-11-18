// Layout/EmptyLinesAroundAccessModifier (EnforcedStyle: around).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  NT_BEGIN,
  NT_BLOCK,
  NT_CBASE,
  NT_CLASS,
  NT_CONST,
  NT_IF,
  NT_KWBEGIN,
  NT_MODULE,
  NT_NUMBLOCK,
  NT_SCLASS,
  NT_SEND,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { RbLayLines } from "./layout_empty_help";

const rbAccModBlockType = (t: i32): boolean => t === NT_BLOCK || t === NT_NUMBLOCK;

/** global_const?(names): (const {nil? cbase} name). */
const rbAccModGlobalConst = (src: RbSource, n: i32, names: string): boolean => {
  const a = src.a;
  if (!a.isNode(n) || a.type(n) !== NT_CONST) {
    return false;
  }
  const scope = a.kid(n, 0);
  if (scope !== V_NIL && !(a.isNode(scope) && a.type(scope) === NT_CBASE)) {
    return false;
  }
  return `,${names},`.indexOf(`,${a.text(a.kid(n, 1))},`) >= 0;
};

/** The send part of class_constructor?: Class/Module/Struct.new or Data.define. */
const rbAccModCtorSend = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  if (!a.isNode(n) || a.type(n) !== NT_SEND) {
    return false;
  }
  const m = a.text(a.kid(n, 1));
  const r = a.kid(n, 0);
  return (
    (m === "new" && rbAccModGlobalConst(src, r, "Class,Module,Struct")) ||
    (m === "define" && rbAccModGlobalConst(src, r, "Data"))
  );
};

/** MethodDispatchNode#in_macro_scope?. */
const rbAccModMacroScope = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  const p = src.parent(n);
  if (p === V_NIL) {
    return true;
  }
  const t = a.type(p);
  if (t === NT_SCLASS || t === NT_CLASS || t === NT_MODULE) {
    return true;
  }
  if (rbAccModCtorSend(src, p) || (rbAccModBlockType(t) && rbAccModCtorSend(src, a.kid(p, 0)))) {
    return true;
  }
  let wrapper = t === NT_KWBEGIN || t === NT_BEGIN || rbAccModBlockType(t);
  if (t === NT_IF && a.kid(p, 0) !== n) {
    wrapper = true;
  }
  return wrapper && rbAccModMacroScope(src, p);
};

export class CopLayoutEmptyLinesAroundAccessModifier {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/EmptyLinesAroundAccessModifier");
  }

  // The cop's instance variables, set as the walk reaches classes and blocks (0: nil).
  classFirst: i32 = 0;
  classLast: i32 = 0;
  blockLine: i32 = 0;
  // RuboCop raised in this node's callback (nil.blank?, nil.block_type?).
  crash: boolean = false;

  run(src: RbSource): void {
    this.c.begin(src);
    this.classFirst = 0;
    this.classLast = 0;
    this.blockLine = 0;
    const a = src.a;
    const L = new RbLayLines(src);
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_CLASS) {
        const sup = a.kid(n, 1);
        this.classFirst = src.line(a.exS(sup !== V_NIL ? sup : n));
        this.classLast = src.line(a.exE(n));
      } else if (t === NT_MODULE) {
        this.classFirst = src.line(a.exS(n));
        this.classLast = src.line(a.exE(n));
      } else if (t === NT_SCLASS) {
        this.classFirst = src.line(a.exS(a.kid(n, 0)));
        this.classLast = src.line(a.exE(n));
      } else if (rbAccModBlockType(t)) {
        this.blockLine = src.line(a.exS(n));
      } else if (t === NT_SEND) {
        this.crash = false;
        this.onSend(src, L, n);
      }
    }
  }

  private onSend(src: RbSource, L: RbLayLines, node: i32): void {
    const a = src.a;
    // bare_access_modifier? && !block_literal?
    if (a.kid(node, 0) !== V_NIL || a.nKid(node) !== 2) {
      return;
    }
    const m = a.text(a.kid(node, 1));
    if (m !== "public" && m !== "protected" && m !== "private" && m !== "module_function") {
      return;
    }
    if (!rbAccModMacroScope(src, node)) {
      return;
    }
    const par = src.parent(node);
    if (par !== V_NIL && rbAccModBlockType(a.type(par)) && a.kid(par, 0) === node) {
      return;
    }
    // same_line?(node, node.right_sibling)
    const first = src.line(a.exS(node));
    const last = src.line(a.exE(node));
    if (par !== V_NIL) {
      for (let i = 0; i < a.nKid(par); i++) {
        if (a.kid(par, i) === node) {
          const sib = a.kid(par, i + 1);
          if (a.isNode(sib) && src.line(a.exS(sib)) === first) {
            return;
          }
        }
      }
    }
    // expected_empty_lines?: empty_lines_around?
    const prevEmpty = this.previousLineEmpty(L, first);
    if (prevEmpty && this.nextLineEmpty(L, last)) {
      return;
    }
    if (this.crash) {
      return;
    }
    const k = this.c.offense(a.exS(node), a.exE(node));
    if (k === null) {
      return;
    }
    const rs = L.start(first);
    const re = L.end(last);
    // should_insert_line_before?
    if (!prevEmpty) {
      if (par === V_NIL) {
        return;
      }
      let before = true;
      if (this.insideBlock(src, node) && a.type(par) === NT_BEGIN) {
        before = a.kid(par, 0) !== node;
      }
      if (before) {
        k.insertBefore(rs, re, "\n");
      }
    }
    // correct_next_line_if_denied_style: should_insert_line_after?
    if (par === V_NIL) {
      return;
    }
    let after = true;
    if (this.insideBlock(src, node)) {
      after = a.kid(par, -1) !== node;
    }
    if (after) {
      const ne = this.nextLineEmpty(L, last);
      if (this.crash) {
        return;
      }
      if (!ne) {
        k.insertAfter(rs, re, "\n");
      }
    }
    this.c.commit(k);
  }

  /** inside_block?: the parent (or the begin's parent) is a block. */
  private insideBlock(src: RbSource, node: i32): boolean {
    const a = src.a;
    const par = src.parent(node);
    if (a.type(par) === NT_BLOCK) {
      return true;
    }
    if (a.type(par) !== NT_BEGIN) {
      return false;
    }
    const gp = src.parent(par);
    return gp !== V_NIL && a.type(gp) === NT_BLOCK;
  }

  /** previous_line_empty?: the nearest earlier non-comment line is blank (or a body starts above). */
  private previousLineEmpty(L: RbLayLines, sendLine: i32): boolean {
    // processed_source[0..(send_line - 2)]: a negative end counts from the end.
    let hi = sendLine - 2;
    if (hi < 0) {
      hi += L.n;
    }
    if (hi >= L.n) {
      hi = L.n - 1;
    }
    let found = -1;
    for (let i = hi; i >= 0; i--) {
      if (!L.commentLine(i)) {
        found = i;
        break;
      }
    }
    if (found < 0) {
      return true;
    }
    if (this.blockLine !== 0 && sendLine === this.blockLine + 1) {
      return true;
    }
    if (this.classFirst !== 0 && sendLine === this.classFirst + 1) {
      return true;
    }
    return L.blank(found);
  }

  /** next_line_empty?: the body ends after the line, or the next line is blank. */
  private nextLineEmpty(L: RbLayLines, lastSendLine: i32): boolean {
    if (this.classLast !== 0 && lastSendLine === this.classLast - 1) {
      return true;
    }
    if (!L.has(lastSendLine)) {
      this.crash = true;
      return false;
    }
    return L.blank(lastSendLine);
  }
}
