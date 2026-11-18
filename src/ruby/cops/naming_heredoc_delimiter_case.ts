// Naming/HeredocDelimiterCase (EnforcedStyle: uppercase).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_HEREDOC_BODY, F_HEREDOC_END, NT_DSTR, NT_STR, NT_XSTR } from "../ast";
import { RbCop } from "../cop";
import { rnHeredoc } from "../node";
import { RbSource } from "../source";
import { ssxFE, ssxFS } from "./style_syntax_help";

/** String#upcase (ASCII letters). */
const nhdcUpcase = (s: string): string => {
  const out: string[] = [];
  for (let i = 0; i < toI32(s.length); i++) {
    const c = s.charCodeAt(i);
    out.push(c >= 97 && c <= 122 ? String.fromCharCode(c - 32) : s.substring(i, i + 1));
  }
  return out.join("");
};

/** Heredoc#delimiter_string: OPENING_DELIMITER's second capture. */
export const nhdcDelimiter = (s: string): string => {
  const i = s.indexOf("<<");
  if (i < 0) {
    return "";
  }
  let p = i + 2;
  const k = toI32(s.length);
  if (p < k && (s.charCodeAt(p) === 126 || s.charCodeAt(p) === 45)) {
    p++;
  }
  if (p < k && (s.charCodeAt(p) === 39 || s.charCodeAt(p) === 34 || s.charCodeAt(p) === 96)) {
    p++;
  }
  let q = p;
  while (q < k && s.charCodeAt(q) !== 39 && s.charCodeAt(q) !== 34 && s.charCodeAt(q) !== 96) {
    q++;
  }
  return s.substring(p, q);
};

const nhdcWs = (c: i32): boolean => c === 0 || c === 32 || (c >= 9 && c <= 13);

/** String#strip (ASCII whitespace and NUL). */
const nhdcStrip = (s: string): string => {
  let i = 0;
  let j = toI32(s.length);
  while (i < j && nhdcWs(s.charCodeAt(i))) {
    i++;
  }
  while (j > i && nhdcWs(s.charCodeAt(j - 1))) {
    j--;
  }
  return s.substring(i, j);
};

export class CopNamingHeredocDelimiterCase {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Naming/HeredocDelimiterCase");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (!(t === NT_STR || t === NT_DSTR || t === NT_XSTR) || !rnHeredoc(src, n)) {
        continue;
      }
      const expr = src.nodeSrc(n);
      const delim = nhdcDelimiter(expr);
      const up = nhdcUpcase(delim);
      if (delim === up) {
        continue;
      }
      // corrected_delimiter_in_body?
      const body = src.src(ssxFS(src, n, F_HEREDOC_BODY), ssxFE(src, n, F_HEREDOC_BODY));
      let inBody = false;
      let st = 0;
      const bk = toI32(body.length);
      while (st < bk && !inBody) {
        let nl = body.indexOf("\n", st);
        nl = nl < 0 ? bk : nl + 1;
        if (nhdcStrip(body.substring(st, nl)) === up) {
          inBody = true;
        }
        st = nl;
      }
      if (inBody) {
        continue;
      }
      const hs = ssxFS(src, n, F_HEREDOC_END);
      const he = ssxFE(src, n, F_HEREDOC_END);
      const k = this.c.offense(hs, he);
      if (k !== null) {
        k.replace(a.exS(n), a.exE(n), nhdcUpcase(expr));
        k.replace(hs, he, up);
        this.c.commit(k);
      }
    }
  }
}
