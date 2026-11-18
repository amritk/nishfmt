// Layout/HeredocIndentation (Layout/LineLength's AllowHeredoc: true, so no
// line is too long; no ActiveSupport extensions).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_HEREDOC_BODY, F_HEREDOC_END } from "../ast";
import { RbCop } from "../cop";
import { rnE, rnS } from "../node";
import { RbSource } from "../source";
import { rmlBlankRange, rmlIsHeredoc, rmlLineIndentation, rmlSpaces } from "./layout_multiline_help";
import { lspIsWs } from "./layout_space_help";

/** Heredoc#indent_level of the text [s, e): the least leading whitespace of its non-blank lines. */
export const rmlHdIndentLevel = (src: RbSource, s: i32, e: i32): i32 => {
  let best = -1;
  let i = s;
  while (i < e) {
    let j = i;
    while (j < e && src.at(j) !== 10 && lspIsWs(src.at(j))) {
      j++;
    }
    const blank = j < e && src.at(j) === 10;
    if (!blank && (best < 0 || j - i < best)) {
      best = j - i;
    }
    while (j < e && src.at(j) !== 10) {
      j++;
    }
    i = j + 1;
  }
  return best < 0 ? 0 : best;
};

/** /[^\S\r\n]/ */
const rmlHdHspace = (c: i32): boolean => c === 32 || c === 9 || c === 11 || c === 12;

export class CopLayoutHeredocIndentation {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/HeredocIndentation");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    const offS: i32[] = [];
    const offE: i32[] = [];
    for (const n of src.pre) {
      if (!rmlIsHeredoc(src, n)) {
        continue;
      }
      const bs = rnS(src, n, F_HEREDOC_BODY);
      const be = rnE(src, n, F_HEREDOC_BODY);
      if (rmlBlankRange(src, bs, be)) {
        continue;
      }
      const bodyIndent = rmlHdIndentLevel(src, bs, be);
      const ns = a.exS(n);
      const ty = src.at(ns + 2);
      const squiggly = ty === 126;
      const base = rmlLineIndentation(src, src.line(ns));
      if (squiggly) {
        if (base + 2 === bodyIndent) {
          continue;
        }
      } else if (bodyIndent !== 0) {
        continue;
      }
      // within_offending_heredoc?
      let within = false;
      for (let i = 0; i < toI32(offS.length); i++) {
        if (offS[i] <= ns && a.exE(n) <= offE[i]) {
          within = true;
        }
      }
      if (within) {
        continue;
      }
      offS.push(bs);
      offE.push(be);
      const k = this.c.offense(bs, be);
      if (k === null) {
        continue;
      }
      if (squiggly) {
        k.replace(bs, be, this.indentedBody(src, bs, be, bodyIndent, base + 2));
        const es = rnS(src, n, F_HEREDOC_END);
        const ee = rnE(src, n, F_HEREDOC_END);
        const endIndent = rmlHdIndentLevel(src, es, ee);
        if (endIndent < base) {
          k.replace(es, ee, `${rmlSpaces(base)}${src.src(es + endIndent, ee)}`);
        } else {
          k.replace(es, ee, src.src(es, ee));
        }
      } else {
        const text = src.nodeSrc(n);
        const cut = ty === 45 ? 3 : 2;
        k.replace(ns, a.exE(n), `<<~${text.substring(cut, toI32(text.length))}`);
      }
      this.c.commit(k);
    }
  }

  /** indented_body: body.gsub(/^[^\S\r\n]{from}/, ' ' * to). */
  private indentedBody(src: RbSource, s: i32, e: i32, from: i32, to: i32): string {
    const parts: string[] = [];
    const ind = rmlSpaces(to);
    let i = s;
    while (i < e) {
      let ok = true;
      for (let j = 0; j < from; j++) {
        if (i + j >= e || !rmlHdHspace(src.at(i + j))) {
          ok = false;
          break;
        }
      }
      let j = i;
      if (ok) {
        parts.push(ind);
        j = i + from;
      }
      let k = j;
      while (k < e && src.at(k) !== 10) {
        k++;
      }
      if (k < e) {
        k++;
      }
      parts.push(src.src(j, k));
      i = k;
    }
    return parts.join("");
  }
}
