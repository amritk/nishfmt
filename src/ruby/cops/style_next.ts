// Style/Next (EnforcedStyle: skip_modifier_ifs, MinBodyLength: 3,
// AllowConsecutiveConditionals: false).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_BEGIN,
  F_END,
  F_HEREDOC_BODY,
  F_KEYWORD,
  NT_BEGIN,
  NT_BLOCK,
  NT_BREAK,
  NT_FOR,
  NT_IF,
  NT_NUMBLOCK,
  NT_RETURN,
  NT_UNTIL,
  NT_WHILE,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";
import {
  scnEachStr,
  scnElse,
  scnElseBranch,
  scnHeredoc,
  scnIfBranch,
  scnInverseKeyword,
  scnModifier,
  scnSpaces,
  scnTernary,
} from "./style_cond_help";
import { ssxFE, ssxFS, ssxHas, ssxIsCall, ssxIsSpace, ssxMeth } from "./style_syntax_help";

const SNX_ENUM: string =
  " collect collect_concat detect downto each find find_all find_index inject loop map! map reduce reject reject! reverse_each select select! times upto ";

export class CopStyleNext {
  c: RbCop;
  reindented: Map<i32, i32>;

  constructor() {
    this.c = new RbCop("Style/Next");
    this.reindented = new Map<i32, i32>();
  }

  run(src: RbSource): void {
    this.c.begin(src);
    this.reindented = new Map<i32, i32>();
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_BLOCK || t === NT_NUMBLOCK) {
        const s = a.kid(n, 0);
        if (!ssxIsCall(src, s)) {
          continue;
        }
        const m = ssxMeth(src, s);
        if (SNX_ENUM.indexOf(` ${m} `) < 0 && !m.startsWith("each_")) {
          continue;
        }
        this.check(src, a.kid(n, 2));
      } else if (t === NT_WHILE || t === NT_UNTIL) {
        this.check(src, a.kid(n, 1));
      } else if (t === NT_FOR) {
        this.check(src, a.kid(n, 2));
      }
    }
  }

  private check(src: RbSource, body: i32): void {
    const a = src.a;
    if (body === V_NIL || !a.isNode(body)) {
      return;
    }
    if (!(this.simpleIf(src, body) || (a.type(body) === NT_BEGIN && this.simpleIf(src, a.kid(body, -1))))) {
      return;
    }
    // offense_node: the body's last child when it is an if, else the body.
    const last = a.nKid(body) > 0 ? a.kid(body, -1) : V_NIL;
    const node = last !== V_NIL && a.isNode(last) && a.type(last) === NT_IF ? last : body;
    const k = this.c.offense(a.exS(node), a.exE(a.kid(node, 0)));
    if (k === null) {
      return;
    }
    if (scnModifier(src, node)) {
      let b = scnIfBranch(src, node);
      if (b === V_NIL) {
        b = scnElseBranch(src, node);
      }
      const code = `next ${scnInverseKeyword(src, node)} ${src.nodeSrc(a.kid(node, 0))}\n${scnSpaces(src.column(a.exS(node)))}`;
      k.insertBefore(a.exS(node), a.exE(node), code);
      k.remove(a.exE(b), a.exE(node));
    } else {
      this.autocorrectBlock(src, node, k);
    }
    this.c.commit(k);
  }

  /** simple_if_without_break? */
  private simpleIf(src: RbSource, n: i32): boolean {
    const a = src.a;
    if (n === V_NIL || !a.isNode(n) || a.type(n) !== NT_IF || scnTernary(src, n) || scnElse(src, n)) {
      return false;
    }
    for (let i = 0; i < a.nKid(n); i++) {
      const c = a.kid(n, i);
      if (c !== V_NIL && a.isNode(c) && a.type(c) === NT_IF && scnElse(src, c)) {
        return false;
      }
    }
    if (scnModifier(src, n)) {
      return false;
    }
    if (src.line(ssxFS(src, n, F_END)) - src.line(ssxFS(src, n, F_KEYWORD)) <= 3) {
      return false;
    }
    const ib = scnIfBranch(src, n);
    if (ib !== V_NIL && (a.type(ib) === NT_BREAK || a.type(ib) === NT_RETURN)) {
      return false;
    }
    return true;
  }

  private autocorrectBlock(src: RbSource, n: i32, k: RbRewriter): void {
    const a = src.a;
    const cond = a.kid(n, 0);
    k.insertBefore(a.exS(n), a.exE(n), `next ${scnInverseKeyword(src, n)} ${src.nodeSrc(cond)}`);
    const ce = ssxHas(src, n, F_BEGIN) ? ssxFE(src, n, F_BEGIN) : a.exE(cond);
    k.remove(a.exS(n), ce);
    // end_range
    const es = ssxFS(src, n, F_END);
    const ee = ssxFE(src, n, F_END);
    let bs = es - src.column(es);
    const le = src.lineEnd(src.line(ee));
    let ws = true;
    for (let p = ee; p < le; p++) {
      if (!ssxIsSpace(src.at(p))) {
        ws = false;
      }
    }
    if (ws) {
      bs -= 1;
    }
    k.remove(bs, ee);
    // reindentable_lines
    const skip = new Set<i32>();
    for (const s of scnEachStr(src, n)) {
      let rs = -1;
      let re = -1;
      if (scnHeredoc(src, s)) {
        rs = ssxFS(src, s, F_HEREDOC_BODY);
        re = ssxFE(src, s, F_HEREDOC_BODY);
      } else if (ssxHas(src, s, F_BEGIN) && ssxHas(src, s, F_END)) {
        rs = ssxFE(src, s, F_BEGIN);
        re = ssxFS(src, s, F_END);
      }
      if (rs < 0) {
        continue;
      }
      for (let l = src.line(rs); l <= src.line(re); l++) {
        const ls = src.lineStart(l);
        if (rs <= ls && ls < re) {
          skip.add(l);
        }
      }
    }
    const lines: i32[] = [];
    for (let l = src.line(a.exS(n)) + 1; l < src.line(es); l++) {
      if (skip.has(l)) {
        continue;
      }
      let blank = true;
      for (let p = src.lineStart(l); p < src.lineEnd(l); p++) {
        if (!ssxIsSpace(src.at(p))) {
          blank = false;
        }
      }
      if (!blank) {
        lines.push(l);
      }
    }
    if (lines.length === 0) {
      return;
    }
    const target = this.firstNonWs(src, src.line(a.exS(cond)));
    let actual = -1;
    for (const l of lines) {
      const c = this.firstNonWs(src, l);
      if (actual < 0 || c < actual) {
        actual = c;
      }
    }
    const delta = actual - target;
    for (const l of lines) {
      const prev = this.reindented.get(l) ?? 0;
      const adj = delta + prev;
      this.reindented.set(l, adj);
      if (adj > 0) {
        const ls = src.lineStart(l);
        k.remove(ls, ls + adj);
      }
    }
  }

  private firstNonWs(src: RbSource, l: i32): i32 {
    const ls = src.lineStart(l);
    let p = ls;
    while (p < src.lineEnd(l) && ssxIsSpace(src.at(p))) {
      p++;
    }
    return p - ls;
  }
}
