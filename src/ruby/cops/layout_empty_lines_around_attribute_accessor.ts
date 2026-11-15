// Layout/EmptyLinesAroundAttributeAccessor (AllowAliasSyntax: true,
// AllowedMethods: alias_method, public, protected, private).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_ALIAS, NT_IF, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { RbLayLines, rbLayCommentAtLine, rbLayDirectiveEnabled } from "./layout_empty_help";

/** SendNode#attribute_accessor?: attr_reader/attr_writer/attr_accessor/attr with no receiver and an argument. */
const rbAttrAccAccessor = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  if (!a.isNode(n) || a.type(n) !== NT_SEND || a.kid(n, 0) !== V_NIL || a.nKid(n) < 3) {
    return false;
  }
  const m = a.text(a.kid(n, 1));
  return m === "attr_reader" || m === "attr_writer" || m === "attr_accessor" || m === "attr";
};

export class CopLayoutEmptyLinesAroundAttributeAccessor {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/EmptyLinesAroundAttributeAccessor");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    const L = new RbLayLines(src);
    for (const n of src.pre) {
      if (!rbAttrAccAccessor(src, n)) {
        continue;
      }
      const last = src.line(a.exE(n));
      if (this.nextLineEmpty(L, last)) {
        continue;
      }
      if (this.enableDirective(src, last + 1) && this.nextLineEmpty(L, last + 1)) {
        continue;
      }
      // next_line_node (a root node has no parent: RuboCop raises).
      const par = src.parent(n);
      if (par === V_NIL || a.type(par) === NT_IF) {
        continue;
      }
      let sib = V_NIL;
      for (let i = 0; i < a.nKid(par); i++) {
        if (a.kid(par, i) === n) {
          sib = a.kid(par, i + 1);
        }
      }
      // require_empty_line?
      if (!a.isNode(sib)) {
        continue;
      }
      if (last === src.line(a.exS(sib))) {
        continue;
      }
      if (a.type(sib) === NT_ALIAS) {
        continue;
      }
      if (a.type(sib) === NT_SEND) {
        const m = a.text(a.kid(sib, 1));
        if (rbAttrAccAccessor(src, sib) || m === "alias_method" || m === "public" || m === "protected" || m === "private") {
          continue;
        }
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k === null) {
        continue;
      }
      let rs = L.start(src.line(a.exS(n)));
      let re = L.end(last);
      if (this.enableDirective(src, last + 1)) {
        const cm = rbLayCommentAtLine(src, last + 1);
        rs = src.commS[cm];
        re = src.commE[cm];
      }
      k.insertAfter(rs, re, "\n");
      this.c.commit(k);
    }
  }

  /** next_line_empty?: lines[line] is nil or blank. */
  private nextLineEmpty(L: RbLayLines, line: i32): boolean {
    return !L.has(line) || L.blank(line);
  }

  private enableDirective(src: RbSource, line: i32): boolean {
    const cm = rbLayCommentAtLine(src, line);
    return cm >= 0 && rbLayDirectiveEnabled(src.src(src.commS[cm], src.commE[cm]));
  }
}
