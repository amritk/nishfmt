// Lint/NonDeterministicRequireOrder (unsafe; detection only): an unsorted
// `Dir.glob` / `Dir[]` loop that requires each file. The cop declares
// `maximum_target_ruby_version 2.7`, so under TargetRubyVersion 3.3 the Team
// runs it only in a file whose directive comments opt it in (a
// `# rubocop:enable Lint/NonDeterministicRequireOrder`).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_ARG, NT_ARGS, NT_BLOCK, NT_BLOCK_PASS, NT_LVAR, NT_NUMBLOCK, NT_SEND, NT_SYM, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ldhOptedIn, ldhType } from "./lint_detect_help";
import { LdhRegistry } from "./lint_directive_help";
import { scnEachNode } from "./style_cond_help";
import { ssxGlobalConst, ssxMeth } from "./style_syntax_help";

/** `(send (const {nil? cbase} :Dir) :glob ...)`. */
const lndroDirGlob = (src: RbSource, n: i32): boolean =>
  ldhType(src, n) === NT_SEND && ssxMeth(src, n) === "glob" && ssxGlobalConst(src, src.a.kid(n, 0), "Dir");

/** `(send (send (const {nil? cbase} :Dir) {:[] :glob} ...) :each ...)` with `rest` extra children. */
const lndroDirEach = (src: RbSource, n: i32, rest: i32): boolean => {
  if (ldhType(src, n) !== NT_SEND || ssxMeth(src, n) !== "each" || src.a.nKid(n) !== 2 + rest) {
    return false;
  }
  const r = src.a.kid(n, 0);
  const m = ssxMeth(src, r);
  return ldhType(src, r) === NT_SEND && (m === "[]" || m === "glob") && ssxGlobalConst(src, src.a.kid(r, 0), "Dir");
};

/** method_require?: `(block-pass (send nil? :method (sym {:require :require_relative})))`. */
const lndroMethodRequire = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  if (ldhType(src, n) !== NT_BLOCK_PASS) {
    return false;
  }
  const s = a.kid(n, 0);
  if (ldhType(src, s) !== NT_SEND || a.kid(s, 0) !== V_NIL || ssxMeth(src, s) !== "method" || a.nKid(s) !== 3) {
    return false;
  }
  const y = a.kid(s, 2);
  const v = ldhType(src, y) === NT_SYM ? a.text(a.kid(y, 0)) : "";
  return v === "require" || v === "require_relative";
};

/** var_is_required?: `(send nil? {:require :require_relative} (lvar name))` at or under n. */
const lndroRequired = (src: RbSource, n: i32, name: string): boolean => {
  const a = src.a;
  for (const s of scnEachNode(src, n, NT_SEND)) {
    const m = ssxMeth(src, s);
    if (a.kid(s, 0) !== V_NIL || (m !== "require" && m !== "require_relative") || a.nKid(s) !== 3) {
      continue;
    }
    const x = a.kid(s, 2);
    if (ldhType(src, x) === NT_LVAR && a.text(a.kid(x, 0)) === name) {
      return true;
    }
  }
  return false;
};

export class CopLintNonDeterministicRequireOrder {
  c: RbCop;
  reg: LdhRegistry | null = null;

  constructor() {
    this.c = new RbCop("Lint/NonDeterministicRequireOrder");
  }

  // nishfmt: detect-only

  private registry(): LdhRegistry {
    const r = this.reg;
    if (r !== null) {
      return r;
    }
    const nr = new LdhRegistry();
    this.reg = nr;
    return nr;
  }

  run(src: RbSource): void {
    this.c.begin(src);
    if (src.commS.length === 0 || !ldhOptedIn(src, this.registry(), "Lint/NonDeterministicRequireOrder")) {
      return;
    }
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_BLOCK || t === NT_NUMBLOCK) {
        const body = a.kid(n, 2);
        const s = a.kid(n, 0);
        if (body === V_NIL || !(lndroDirGlob(src, s) || lndroDirEach(src, s, 0))) {
          continue;
        }
        if (t === NT_BLOCK) {
          // loop_variable: (args (arg $_))
          const args = a.kid(n, 1);
          if (ldhType(src, args) !== NT_ARGS || a.nKid(args) !== 1 || ldhType(src, a.kid(args, 0)) !== NT_ARG) {
            continue;
          }
          if (!lndroRequired(src, body, a.text(a.kid(a.kid(args, 0), 0)))) {
            continue;
          }
          this.c.offense(a.exS(s), a.exE(s));
        } else {
          const k = parseInt(a.text(a.kid(n, 1)));
          for (let i = 1; i <= k; i++) {
            if (lndroRequired(src, body, `_${i}`)) {
              this.c.offense(a.exS(s), a.exE(s));
            }
          }
        }
      } else if (t === NT_BLOCK_PASS && lndroMethodRequire(src, n)) {
        const p = src.parent(n);
        if (p === V_NIL || a.kid(p, -1) !== n) {
          continue;
        }
        if (lndroDirGlob(src, p) || lndroDirEach(src, p, 1)) {
          this.c.offense(a.exS(p), a.exE(p));
        }
      }
    }
  }
}
