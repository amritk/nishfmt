// Style/RegexpLiteral (EnforcedStyle: slashes, AllowInnerSlashes: false).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { rbByteAt } from "../util";
import { rbAtOff } from "../help";
import { add32, sub32 } from "../../core/arr";
import { F_BEGIN, F_END, F_OPERATOR, NT_CSEND, NT_REGEXP, NT_REGOPT, NT_SEND, NT_STR, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { rnE, rnS } from "../node";
import { RbSource } from "../source";
import { rbLitParenthesized, rbLitSpaceC } from "./lit_help";

/** The str children of a regexp. */
const rbRlStrKids = (src: RbSource, n: i32): i32[] => {
  const out: i32[] = [];
  const a = src.a;
  for (let i = 0; i < a.nKid(n); i++) {
    const c = a.kid(n, i);
    if (a.isNode(c) && a.type(c) === NT_STR) {
      out.push(c);
    }
  }
  return out;
};

/** node_body: the str children's sources joined. */
const rbRlBody = (src: RbSource, n: i32): string => {
  const parts: string[] = [];
  for (const c of rbRlStrKids(src, n)) {
    parts.push(src.nodeSrc(c));
  }
  return parts.join("");
};

/** RegexpNode#content: the str children's values joined. */
const rbRlContent = (src: RbSource, n: i32): string => {
  const parts: string[] = [];
  for (const c of rbRlStrKids(src, n)) {
    parts.push(src.a.text(src.a.kid(c, 0)));
  }
  return parts.join("");
};

/** RegexpNode#extended?: the regopt has `x`. */
export const rbRlExtended = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  const ro = a.kid(n, -1);
  if (!a.isNode(ro) || a.type(ro) !== NT_REGOPT) {
    return false;
  }
  for (let i = 0; i < a.nKid(ro); i++) {
    if (a.text(a.kid(ro, i)) === "x") {
      return true;
    }
  }
  return false;
};

const RB_RL_OPERATORS: string = " | ^ & <=> == === =~ > >= < <= << >> + - * / % ** ~ +@ -@ !@ ~@ [] []= ! != !~ ` ";

export class CopStyleRegexpLiteral {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/RegexpLiteral");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_REGEXP) {
        continue;
      }
      const slash = src.src(rnS(src, n, F_BEGIN), rnE(src, n, F_BEGIN)) === "/";
      const body = rbRlBody(src, n);
      if (slash && this.delimitersConflict(body)) {
        continue;
      }
      const containsSlash = body.indexOf("/") >= 0;
      if (slash) {
        if (!containsSlash) {
          continue;
        }
      } else if (containsSlash || this.allowedOmitParentheses(src, n)) {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k === null) {
        continue;
      }
      // correct_delimiters
      const bs = rnS(src, n, F_BEGIN);
      const be = rnE(src, n, F_BEGIN);
      const es = rnS(src, n, F_END);
      const ee = rnE(src, n, F_END);
      k.replace(bs, be, slash ? "%r{" : "/");
      k.replace(es, ee, slash ? "}" : "/");
      // correct_inner_slashes: `\/` becomes `/` (to %r), `/` becomes `\/` (to slashes).
      for (const s of rbRlStrKids(src, n)) {
        const ss = a.exS(s);
        const se = a.exE(s);
        for (let i = ss; i < se; i++) {
          if (slash) {
            if (src.at(i) === 92 && i + 1 < se && src.at(i + 1) === 47) {
              k.replace(i, add32(i, 2), "/");
            }
          } else if (src.at(i) === 47) {
            k.replace(i, i + 1, "\\/");
          }
        }
      }
      // correct_escaped_delimiters
      if (!slash) {
        const d = rbAtOff(src, be, -1);
        const keep = "$*+.?^|()[]{}<>";
        let keeps = d === 47;
        for (let i = 0; i < toI32(keep.length); i++) {
          if (keep.charCodeAt(i) === d) {
            keeps = true;
          }
        }
        if (!keeps) {
          const ext = rbRlExtended(src, n);
          for (const s of rbRlStrKids(src, n)) {
            const ss = a.exS(s);
            const se = a.exE(s);
            let i = ss;
            while (i < se) {
              if (src.at(i) !== 92) {
                i++;
                continue;
              }
              if (i + 1 < se && src.at(i + 1) === d) {
                let repl = src.src(i + 1, add32(i, 2));
                const nx = toI64(i) + toI64(2) < toI64(se) ? rbAtOff(src, i, 2) : -1;
                if (d === 35 && (nx === 123 || nx === 64 || nx === 36)) {
                  repl = ext ? "#\\" : "\\#";
                }
                k.replace(i, add32(i, 2), repl);
              }
              // i + 2, or past se (which ends the loop all the same).
              const nxt = toI64(i) + toI64(2);
              i = nxt >= toI64(se) ? se : toI32(nxt);
            }
          }
        }
      }
      this.c.commit(k);
    }
  }

  /** percent_r_delimiters_conflict? with `{}`: the body's braces (outside `\.` escapes) do not balance. */
  private delimitersConflict(body: string): boolean {
    let depth = 0;
    const n = toI32(body.length);
    let i = 0;
    while (i >= 0 && i < n) {
      const c = body.charCodeAt(i);
      if (c === 92 && i + 1 < n && body.charCodeAt(i + 1) !== 10) {
        // `\\.` (one character, not a newline): skip it whole.
        const nxt = toI64(i) + toI64(1) + toI64(rbRlCharLen(body, i + 1));
        i = nxt >= toI64(n) ? n : toI32(nxt);
        continue;
      }
      if (c === 123) {
        depth = add32(depth, 1);
      } else if (c === 125) {
        depth = sub32(depth, 1);
        if (depth < 0) {
          return true;
        }
      }
      i++;
    }
    return depth !== 0;
  }

  /** allowed_omit_parentheses_with_percent_r_literal? (MethodCallWithArgsParentheses: require_parentheses). */
  private allowedOmitParentheses(src: RbSource, n: i32): boolean {
    const a = src.a;
    const p = src.parent(n);
    if (p === V_NIL || (a.type(p) !== NT_SEND && a.type(p) !== NT_CSEND)) {
      return false;
    }
    const content = rbRlContent(src, n);
    if (content.startsWith(" ") || content.startsWith("=")) {
      return true;
    }
    if (a.kid(p, 2) !== n) {
      return false;
    }
    if (rbLitParenthesized(src, p)) {
      return false;
    }
    const m = a.text(a.kid(p, 1));
    if (RB_RL_OPERATORS.indexOf(` ${m} `) >= 0) {
      return false;
    }
    if (src.a.has(src.a.map(p), F_OPERATOR)) {
      return false;
    }
    return toI32(content.length) > 0 && rbLitSpaceC(content.charCodeAt(0));
  }
}

/** The byte length of the UTF-8 character at byte `i`. */
const rbRlCharLen = (s: string, i: i32): i32 => {
  const c = rbByteAt(s, i);
  if (c < 0x80) {
    return 1;
  }
  if (c >= 0xf0) {
    return 4;
  }
  if (c >= 0xe0) {
    return 3;
  }
  return 2;
};
