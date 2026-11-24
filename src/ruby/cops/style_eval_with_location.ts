// Style/EvalWithLocation.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { atI32, sub32 } from "../../core/arr";
import { F_HEREDOC_BODY, NT_CVAR, NT_DSTR, NT_GVAR, NT_INT, NT_IVAR, NT_LVAR, NT_SEND, NT_STR, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxArgs, ssxGlobalConst, ssxHas, ssxFS, ssxIs, ssxMeth } from "./style_syntax_help";

/** special_line_keyword?: an int written `__LINE__`. */
const ssxEwlLineKw = (src: RbSource, n: i32): boolean => ssxIs(src, n, NT_INT) && src.nodeSrc(n) === "__LINE__";

/** (int %v) */
const ssxEwlIntIs = (src: RbSource, n: i32, v: i32): boolean =>
  ssxIs(src, n, NT_INT) && src.a.text(src.a.kid(n, 0)) === `${v}`;

/** expected_line. */
const ssxEwlExpected = (diff: i32): string => {
  if (diff === 0) {
    return "__LINE__";
  }
  return `__LINE__ ${diff > 0 ? "+" : "-"} ${diff > 0 ? toI64(diff) : -toI64(diff)}`;
};

/** string_first_line. */
const ssxEwlStringFirstLine = (src: RbSource, code: i32): i32 =>
  ssxHas(src, code, F_HEREDOC_BODY) ? src.line(ssxFS(src, code, F_HEREDOC_BODY)) : src.line(src.a.exS(code));

export class CopStyleEvalWithLocation {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/EvalWithLocation");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND) {
        continue;
      }
      const m = ssxMeth(src, n);
      if (m !== "eval" && m !== "class_eval" && m !== "module_eval" && m !== "instance_eval") {
        continue;
      }
      if (m === "eval") {
        const r = a.kid(n, 0);
        if (r !== V_NIL && !ssxGlobalConst(src, r, "Kernel")) {
          continue;
        }
      }
      const args = ssxArgs(src, n);
      if (args.length === 0) {
        continue;
      }
      const code = atI32(args, 0);
      if (!ssxIs(src, code, NT_STR) && !ssxIs(src, code, NT_DSTR)) {
        continue;
      }
      let base = 1;
      if (m === "eval") {
        base = 2;
      }
      const file = base < args.length ? atI32(args, base) : V_NIL;
      const line = base + 1 < args.length ? atI32(args, base + 1) : V_NIL;
      const last = atI32(args, toI32(args.length) - 1);
      if (line !== V_NIL) {
        this.checkFile(src, file);
        this.checkLine(src, last, code);
      } else if (file !== V_NIL) {
        this.checkFile(src, file);
        const k = this.c.offense(a.exS(n), a.exE(n));
        if (k !== null) {
          const diff = sub32(ssxEwlStringFirstLine(src, code), src.line(a.exS(last)));
          k.insertAfter(a.exE(last), a.exE(last), `, ${ssxEwlExpected(diff)}`);
          this.c.commit(k);
        }
      } else {
        const k = this.c.offense(a.exS(n), a.exE(n));
        if (k === null) {
          continue;
        }
        if (m === "eval" && args.length < 2) {
          continue;
        }
        const diff = sub32(ssxEwlStringFirstLine(src, code), src.line(a.exS(last)));
        k.insertAfter(a.exE(last), a.exE(last), `, __FILE__, ${ssxEwlExpected(diff)}`);
        this.c.commit(k);
      }
    }
  }

  private checkFile(src: RbSource, file: i32): void {
    const a = src.a;
    if (ssxIs(src, file, NT_STR) && src.nodeSrc(file) === "__FILE__") {
      return;
    }
    const k = this.c.offense(a.exS(file), a.exE(file));
    if (k !== null) {
      k.replace(a.exS(file), a.exE(file), "__FILE__");
      this.c.commit(k);
    }
  }

  private checkLine(src: RbSource, ln: i32, code: i32): void {
    const a = src.a;
    const t = a.type(ln);
    if (t === NT_LVAR || t === NT_IVAR || t === NT_CVAR || t === NT_GVAR) {
      return;
    }
    if (t === NT_SEND && ssxMeth(src, ln) !== "+") {
      return;
    }
    const diff = sub32(ssxEwlStringFirstLine(src, code), src.line(a.exS(ln)));
    if (diff === 0) {
      if (ssxEwlLineKw(src, ln)) {
        return;
      }
    } else {
      const sign = diff > 0 ? "+" : "-";
      const abs = diff > 0 ? diff : sub32(0, diff);
      // line_with_offset?
      if (t === NT_SEND && a.nKid(ln) === 3 && ssxMeth(src, ln) === sign) {
        const l = a.kid(ln, 0);
        const r = a.kid(ln, 2);
        if ((ssxEwlLineKw(src, l) && ssxEwlIntIs(src, r, abs)) || (ssxEwlIntIs(src, l, abs) && ssxEwlLineKw(src, r))) {
          return;
        }
      }
    }
    const k = this.c.offense(a.exS(ln), a.exE(ln));
    if (k !== null) {
      k.replace(a.exS(ln), a.exE(ln), ssxEwlExpected(diff));
      this.c.commit(k);
    }
  }
}
