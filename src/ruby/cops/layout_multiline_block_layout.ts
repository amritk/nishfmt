// Layout/MultilineBlockLayout (with Layout/LineLength's Max: 120).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { add32, sub32 } from "../../core/arr";
import {
  F_BEGIN,
  NT_ARG,
  NT_BEGIN,
  NT_BLOCK,
  NT_BLOCKARG,
  NT_FORWARD_ARG,
  NT_KWARG,
  NT_KWOPTARG,
  NT_KWRESTARG,
  NT_MLHS,
  NT_OPTARG,
  NT_RESTARG,
  NT_SHADOWARG,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { rbAtOff, rbSpaceEnd } from "../help";
import { rnE, rnS } from "../node";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";
import { rmlDescendants, rmlIsBlock, rmlSingleLine, rmlSpaces } from "./layout_multiline_help";

/** argument_type? */
export const rmlArgumentType = (t: i32): boolean =>
  t === NT_ARG ||
  t === NT_OPTARG ||
  t === NT_RESTARG ||
  t === NT_KWARG ||
  t === NT_KWOPTARG ||
  t === NT_KWRESTARG ||
  t === NT_BLOCKARG ||
  t === NT_FORWARD_ARG ||
  t === NT_SHADOWARG;

/** The number of code points of a UTF-8 string. */
export const rmlCharLen = (s: string): i32 => {
  let k = 0;
  const n = toI32(s.length);
  for (let i = 0; i < n; i++) {
    if ((s.charCodeAt(i) & 0xc0) !== 0x80) {
      k = add32(k, 1);
    }
  }
  return k;
};

export class CopLayoutMultilineBlockLayout {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/MultilineBlockLayout");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!rmlIsBlock(src, n) || rmlSingleLine(src, n)) {
        continue;
      }
      if (!this.argsOnBeginningLine(src, n) && !this.lineBreakNecessary(src, n)) {
        const args = a.kid(n, 1);
        const k = this.c.offense(a.exS(args), a.exE(args));
        if (k !== null) {
          this.autocorrect(src, k, n);
          this.c.commit(k);
        }
      }
      const body = a.kid(n, 2);
      if (body !== V_NIL && src.line(rnS(src, n, F_BEGIN)) === src.line(a.exS(body))) {
        const k = this.c.offense(a.exS(body), a.exE(body));
        if (k !== null) {
          this.autocorrect(src, k, n);
          this.c.commit(k);
        }
      }
    }
  }

  private argsOnBeginningLine(src: RbSource, n: i32): boolean {
    const a = src.a;
    if (a.type(n) !== NT_BLOCK) {
      return true;
    }
    const args = a.kid(n, 1);
    if (a.nKid(args) === 0) {
      return true;
    }
    return src.line(rnS(src, n, F_BEGIN)) === src.line(a.exE(args));
  }

  /** line_break_necessary_in_args? */
  private lineBreakNecessary(src: RbSource, n: i32): boolean {
    const a = src.a;
    const s = a.exS(n);
    const le = src.lineEnd(src.line(s));
    const pipes = rbAtOff(src, le, -1) === 124 ? 1 : 3;
    const need = add32(
      add32(add32(src.column(s), pipes), sub32(le, s)),
      rmlCharLen(this.argString(src, n, a.kid(n, 1))),
    );
    return need > 120;
  }

  /** block_arg_string. */
  private argString(src: RbSource, n: i32, args: i32): string {
    const a = src.a;
    const parts: string[] = [];
    for (let i = 0; i < a.nKid(args); i++) {
      const x = a.kid(args, i);
      if (a.type(x) === NT_MLHS) {
        parts.push(`(${this.argString(src, n, x)})`);
      } else {
        parts.push(src.nodeSrc(x));
      }
    }
    let s = parts.join(", ");
    // include_trailing_comma?(node.arguments)
    const top = a.kid(n, 1);
    const ds: i32[] = [];
    rmlDescendants(src, top, ds);
    let cnt = 0;
    for (const d of ds) {
      if (rmlArgumentType(a.type(d))) {
        cnt = add32(cnt, 1);
      }
    }
    if (cnt === 1 && src.nodeSrc(top).indexOf(",") >= 0) {
      s = `${s},`;
    }
    return s;
  }

  private autocorrect(src: RbSource, k: RbRewriter, n: i32): void {
    const a = src.a;
    let ebbLine = -1;
    if (!this.argsOnBeginningLine(src, n)) {
      const args = a.kid(n, 1);
      const ep = rbSpaceEnd(src, a.exE(args), 2, false, false, false);
      k.replace(rnE(src, n, F_BEGIN), ep, ` |${this.argString(src, n, args)}|`);
      ebbLine = src.line(a.exE(args));
    }
    const body = a.kid(n, 2);
    if (body === V_NIL) {
      return;
    }
    if (ebbLine < 0) {
      ebbLine = src.line(rnS(src, n, F_BEGIN));
    }
    if (ebbLine !== src.line(a.exS(body))) {
      return;
    }
    let first = body;
    if (a.type(body) === NT_BEGIN && src.at(a.exS(body)) !== 40) {
      first = a.kid(body, 0);
    }
    k.insertBefore(a.exS(first), a.exE(first), `\n  ${rmlSpaces(src.column(a.exS(n)))}`);
  }
}
