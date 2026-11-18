// Lint/IneffectiveAccessModifier (no correction).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_KEYWORD, NT_BEGIN, NT_CLASS, NT_DEFS, NT_KWBEGIN, NT_MODULE, NT_SEND, NT_SYM, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxDefName, ssxDescendants, ssxFE, ssxFS, ssxIs, ssxMacro, ssxMeth } from "./style_syntax_help";

export class CopLintIneffectiveAccessModifier {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/IneffectiveAccessModifier");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_CLASS && t !== NT_MODULE) {
        continue;
      }
      const body = t === NT_CLASS ? a.kid(n, 2) : a.kid(n, 1);
      if (!ssxIs(src, body, NT_BEGIN)) {
        continue;
      }
      const none: string[] = [];
      this.walk(src, body, none, false, V_NIL);
    }
  }

  /** ineffective_modifier(node, ignored_methods, modifier). */
  private walk(src: RbSource, node: i32, ignored0: string[], have0: boolean, modifier0: i32): void {
    const a = src.a;
    let ignored = ignored0;
    let have = have0;
    let modifier = modifier0;
    for (let i = 0; i < a.nKid(node); i++) {
      const ch = a.kid(node, i);
      if (!a.isNode(ch)) {
        continue;
      }
      const t = a.type(ch);
      if (t === NT_SEND) {
        if (this.accessModifier(src, ch)) {
          modifier = ch;
        }
      } else if (t === NT_DEFS) {
        if (!have) {
          ignored = this.privateClassMethodNames(src, node);
          have = true;
        }
        if (this.correctVisibility(src, ch, modifier, ignored)) {
          continue;
        }
        this.c.offense(ssxFS(src, ch, F_KEYWORD), ssxFE(src, ch, F_KEYWORD));
      } else if (t === NT_KWBEGIN) {
        if (!have) {
          ignored = this.privateClassMethodNames(src, node);
          have = true;
        }
        this.walk(src, ch, ignored, have, modifier);
      }
    }
  }

  /** bare_access_modifier? && !method?(:module_function). */
  private accessModifier(src: RbSource, n: i32): boolean {
    if (!ssxMacro(src, n) || src.a.nKid(n) !== 2) {
      return false;
    }
    const m = ssxMeth(src, n);
    return m === "public" || m === "protected" || m === "private";
  }

  private correctVisibility(src: RbSource, n: i32, modifier: i32, ignored: string[]): boolean {
    if (modifier === V_NIL || ssxMeth(src, modifier) === "public") {
      return true;
    }
    const name = ssxDefName(src, n);
    for (const x of ignored) {
      if (x === name) {
        return true;
      }
    }
    return false;
  }

  /** The symbol arguments of every `private_class_method` call in node (node included). */
  private privateClassMethodNames(src: RbSource, node: i32): string[] {
    const a = src.a;
    const out: string[] = [];
    const all: i32[] = [node];
    for (const d of ssxDescendants(src, node)) {
      all.push(d);
    }
    for (const s of all) {
      if (!ssxIs(src, s, NT_SEND) || a.kid(s, 0) !== V_NIL || ssxMeth(src, s) !== "private_class_method") {
        continue;
      }
      for (let i = 2; i < a.nKid(s); i++) {
        const arg = a.kid(s, i);
        // basic_literal? values; only symbols can equal a method name.
        if (ssxIs(src, arg, NT_SYM)) {
          out.push(a.text(a.kid(arg, 0)));
        }
      }
    }
    return out;
  }
}
