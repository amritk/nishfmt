// Style/MultilineIfModifier.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, F_END, F_HEREDOC_BODY, F_HEREDOC_END, NT_IF, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";
import { LalIgnored } from "./layout_align_help";
import { scnChomp, scnEachStr, scnHeredoc, scnIfBranch, scnKeyword, scnModifier, scnSpaces, scnWholeE, scnWholeS } from "./style_cond_help";
import { ssxFE, ssxFS, ssxHas, ssxIsSpace } from "./style_syntax_help";

export class CopStyleMultilineIfModifier {
  c: RbCop;
  ign: LalIgnored;

  constructor() {
    this.c = new RbCop("Style/MultilineIfModifier");
    this.ign = new LalIgnored();
  }

  run(src: RbSource): void {
    this.c.begin(src);
    this.ign.reset();
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_IF || this.ign.partOf(src, n)) {
        continue;
      }
      const body = scnIfBranch(src, n);
      if (!scnModifier(src, n) || body === V_NIL || src.line(a.exS(body)) === src.line(a.exE(body))) {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k !== null) {
        this.autocorrect(src, n, body, k);
        this.c.commit(k);
      }
      this.ign.add(n);
    }
  }

  private autocorrect(src: RbSource, n: i32, body: i32, k: RbRewriter): void {
    const a = src.a;
    const ch = this.heredocAfter(src, a.kid(n, 0), n, k);
    const bh = this.heredocAfter(src, body, n, k);
    const col = src.column(a.exS(n));
    const lines: string[] = [];
    lines.push(`${scnKeyword(src, n)} ${src.nodeSrc(a.kid(n, 0))}`);
    if (ch !== null) {
      lines.push(ch);
    }
    lines.push(this.indentedBody(src, body, col));
    if (bh !== null) {
      lines.push(bh);
    }
    lines.push(`${scnSpaces(col)}end`);
    k.replace(a.exS(n), a.exE(n), lines.join("\n"));
  }

  /** heredoc_after: removes the heredoc lines of `part` below the node and gives their text (chomped). */
  private heredocAfter(src: RbSource, part: i32, n: i32, k: RbRewriter): string | null {
    let s = -1;
    let e = -1;
    const last = src.line(src.a.exE(n));
    for (const h of scnEachStr(src, part)) {
      if (!scnHeredoc(src, h)) {
        continue;
      }
      const hs = ssxFS(src, h, F_HEREDOC_BODY);
      const he = ssxFE(src, h, F_HEREDOC_END);
      if (src.line(hs) <= last) {
        continue;
      }
      if (s < 0 || hs < s) {
        s = hs;
      }
      if (he > e) {
        e = he;
      }
    }
    if (s < 0) {
      return null;
    }
    const ws = scnWholeS(src, s);
    const we = scnWholeE(src, e, true);
    k.remove(ws, we);
    return scnChomp(src.src(ws, we));
  }

  /** indented_body. */
  private indentedBody(src: RbSource, body: i32, col: i32): string {
    const a = src.a;
    const verbatim = new Set<i32>();
    for (const s of scnEachStr(src, body)) {
      if (scnHeredoc(src, s)) {
        if (!src.nodeSrc(s).startsWith("<<~")) {
          for (let l = src.line(ssxFS(src, s, F_HEREDOC_BODY)); l <= src.line(ssxFS(src, s, F_HEREDOC_END)); l++) {
            verbatim.add(l);
          }
        }
      } else if (ssxHas(src, s, F_BEGIN) && ssxHas(src, s, F_END)) {
        for (let l = src.line(a.exS(s)) + 1; l <= src.line(a.exE(s)); l++) {
          verbatim.add(l);
        }
      }
    }
    const text = `${scnSpaces(col)}${src.nodeSrc(body)}`;
    const ind = scnSpaces(col + 2);
    const out: string[] = [];
    let p = 0;
    let lineNo = src.line(a.exS(body));
    const k = toI32(text.length);
    while (p < k) {
      let q = text.indexOf("\n", p);
      q = q < 0 ? k : q + 1;
      const line = text.substring(p, q);
      if (line === "\n" || verbatim.has(lineNo)) {
        out.push(line);
      } else {
        // line.sub(/^\s{col}/, indentation)
        let m = 0;
        while (m < col && m < toI32(line.length) && ssxIsSpace(line.charCodeAt(m))) {
          m++;
        }
        if (m === col) {
          out.push(`${ind}${line.substring(col, toI32(line.length))}`);
        } else {
          out.push(line);
        }
      }
      p = q;
      lineNo++;
    }
    return out.join("");
  }
}
