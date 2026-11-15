// Style/AccessorGrouping (EnforcedStyle: grouped).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_BLOCK, NT_CASGN, NT_CLASS, NT_DEF, NT_MODULE, NT_SCLASS, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { rbSpaceBegin } from "../help";
import { RbSource } from "../source";
import { ssxAccessModifier, ssxAttributeAccessor, ssxCommentLine, ssxIs, ssxLineAt, ssxMeth, ssxSiblingIndex } from "./style_syntax_help";

/** previous_line_comment? */
const ssxAgPrevLineComment = (src: RbSource, n: i32): boolean => ssxCommentLine(ssxLineAt(src, src.line(src.a.exS(n)) - 2));

/** groupable_accessor? */
const ssxAgGroupable = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  const i = ssxSiblingIndex(src, n);
  if (i <= 0) {
    return true;
  }
  let prev = a.kid(src.parent(n), i - 1);
  if (prev === V_NIL || !a.isNode(prev)) {
    return true;
  }
  if (a.type(prev) === NT_BLOCK) {
    for (let j = 0; j < a.nKid(prev); j++) {
      const c = a.kid(prev, j);
      if (ssxIs(src, c, NT_SEND)) {
        prev = c;
        break;
      }
    }
  }
  if (!ssxIs(src, prev, NT_SEND)) {
    return true;
  }
  const pl = src.line(a.exS(prev));
  for (let ci = 0; ci < toI32(src.commS.length); ci++) {
    const s = src.commS[ci];
    if (src.line(s) === pl && src.at(s) === 35 && src.at(s + 1) === 58) {
      return false;
    }
  }
  return ssxAttributeAccessor(src, prev) || ssxAccessModifier(src, prev) || src.line(a.exS(n)) - src.line(a.exE(prev)) > 1;
};

/** node_visibility for a send: the nearest bare `private`/`protected`/`public` before it. */
const ssxAgVisibility = (src: RbSource, n: i32): string => {
  const a = src.a;
  const p = src.parent(n);
  const i = ssxSiblingIndex(src, n);
  for (let j = i - 1; j >= 0; j--) {
    const s = a.kid(p, j);
    if (ssxIs(src, s, NT_SEND) && a.kid(s, 0) === V_NIL && a.nKid(s) === 2) {
      const m = ssxMeth(src, s);
      if (m === "private" || m === "protected" || m === "public") {
        return m;
      }
    }
  }
  return "public";
};

/** groupable_sibling_accessor? */
const ssxAgSibling = (src: RbSource, n: i32, sib: i32): boolean =>
  ssxAttributeAccessor(src, sib) &&
  ssxMeth(src, sib) === ssxMeth(src, n) &&
  ssxAgVisibility(src, sib) === ssxAgVisibility(src, n) &&
  ssxAgGroupable(src, sib) &&
  !ssxAgPrevLineComment(src, sib);

/** groupable_sibling_accessors. */
const ssxAgSiblings = (src: RbSource, n: i32): i32[] => {
  const a = src.a;
  const out: i32[] = [];
  const p = src.parent(n);
  for (let j = 0; j < a.nKid(p); j++) {
    const s = a.kid(p, j);
    if (ssxIs(src, s, NT_SEND) && ssxAgSibling(src, n, s)) {
      out.push(s);
    }
  }
  return out;
};

/** skip_for_grouping? */
const ssxAgSkip = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  const p = src.parent(n);
  const i = ssxSiblingIndex(src, n);
  let casgn = false;
  let acc = false;
  for (let j = i + 1; j < a.nKid(p); j++) {
    const s = a.kid(p, j);
    if (ssxIs(src, s, NT_CASGN)) {
      casgn = true;
    }
    if (ssxIs(src, s, NT_SEND) && ssxAgSibling(src, n, s)) {
      acc = true;
    }
  }
  return casgn && acc;
};

export class CopStyleAccessorGrouping {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/AccessorGrouping");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_CLASS && t !== NT_SCLASS && t !== NT_MODULE) {
        continue;
      }
      const body = a.kid(n, -1);
      // class_send_elements
      const elems: i32[] = [];
      if (body === V_NIL || a.type(body) === NT_DEF) {
        continue;
      }
      if (a.type(body) === NT_SEND) {
        elems.push(body);
      } else {
        for (let i = 0; i < a.nKid(body); i++) {
          if (ssxIs(src, a.kid(body, i), NT_SEND)) {
            elems.push(a.kid(body, i));
          }
        }
      }
      for (const m of elems) {
        if (ssxAttributeAccessor(src, m)) {
          this.check(src, m);
        }
      }
    }
  }

  private check(src: RbSource, n: i32): void {
    const a = src.a;
    if (ssxAgPrevLineComment(src, n) || !ssxAgGroupable(src, n)) {
      return;
    }
    if (ssxAgSiblings(src, n).length <= 1) {
      return;
    }
    const k = this.c.offense(a.exS(n), a.exE(n));
    if (k === null) {
      return;
    }
    // preferred_accessors
    let pref = "";
    let has = false;
    if (!ssxAgSkip(src, n)) {
      const accs = ssxAgSiblings(src, n);
      if (n === accs[0] || ssxAgSkip(src, accs[0])) {
        const names: string[] = [];
        for (const x of accs) {
          for (let i = 2; i < a.nKid(x); i++) {
            const s = src.nodeSrc(a.kid(x, i));
            let dup = false;
            for (const y of names) {
              if (y === s) {
                dup = true;
              }
            }
            if (!dup) {
              names.push(s);
            }
          }
        }
        pref = `${ssxMeth(src, n)} ${names.join(", ")}`;
        has = true;
      }
    }
    if (has) {
      k.replace(a.exS(n), a.exE(n), pref);
    } else {
      k.remove(rbSpaceBegin(src, a.exS(n), 1, true, false, false), a.exE(n));
    }
    this.c.commit(k);
  }
}
