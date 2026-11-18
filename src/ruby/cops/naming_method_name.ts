// Naming/MethodName (detection only; EnforcedStyle: snake_case,
// AllowedPatterns: [], ForbiddenIdentifiers: [__id__, __send__],
// ForbiddenPatterns: []).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_NAME, F_SELECTOR, NT_ALIAS, NT_DEF, NT_DEFS, NT_SEND, NT_STR, NT_SYM, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { nmhClassEmitter, nmhSnakeCase } from "./naming_help";
import { ssxDefName, ssxFE, ssxFS, ssxGlobalConst, ssxHas, ssxOperatorName } from "./style_syntax_help";

/** A sym or str node. */
const nmnSymStr = (src: RbSource, n: i32): boolean =>
  src.a.isNode(n) && (src.a.type(n) === NT_SYM || src.a.type(n) === NT_STR);

/** forbidden_identifier?: without `@` and `$`, `__id__` or `__send__`. */
const nmnForbidden = (name: string): boolean => {
  const out: string[] = [];
  for (let i = 0; i < toI32(name.length); i++) {
    const c = name.charCodeAt(i);
    if (c !== 64 && c !== 36) {
      out.push(name.substring(i, i + 1));
    }
  }
  const s = out.join("");
  return s === "__id__" || s === "__send__";
};

export class CopNamingMethodName {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Naming/MethodName");
  }
  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_DEF || t === NT_DEFS) {
        const name = ssxDefName(src, n);
        if (ssxOperatorName(name)) {
          continue;
        }
        const s = ssxFS(src, n, F_NAME);
        const e = ssxFE(src, n, F_NAME);
        if (nmnForbidden(name)) {
          this.c.offense(s, e);
        } else if (!nmhSnakeCase(name) && !nmhClassEmitter(src, n, name)) {
          this.c.offense(s, e);
        }
      } else if (t === NT_ALIAS) {
        const id = a.kid(n, 0);
        if (a.isNode(id) && a.type(id) === NT_SYM) {
          this.handleName(src, id, a.text(a.kid(id, 0)));
        }
      } else if (t === NT_SEND) {
        this.onSend(src, n);
      }
    }
  }

  private onSend(src: RbSource, n: i32): void {
    const a = src.a;
    const m = a.text(a.kid(n, 1));
    const argc = a.nKid(n) - 2;
    if (m === "define_method" || m === "define_singleton_method") {
      const first = a.kid(n, 2);
      if (argc > 0 && nmnSymStr(src, first)) {
        this.handleName(src, n, a.text(a.kid(first, 0)));
      }
    } else if (m === "new" && ssxGlobalConst(src, a.kid(n, 0), "Struct")) {
      const from = argc > 0 && a.type(a.kid(n, 2)) === NT_STR ? 3 : 2;
      for (let i = from; i < a.nKid(n); i++) {
        const x = a.kid(n, i);
        if (nmnSymStr(src, x)) {
          this.handleName(src, x, a.text(a.kid(x, 0)));
        }
      }
    } else if (m === "define" && ssxGlobalConst(src, a.kid(n, 0), "Data")) {
      for (let i = 2; i < a.nKid(n); i++) {
        const x = a.kid(n, i);
        if (nmnSymStr(src, x)) {
          this.handleName(src, x, a.text(a.kid(x, 0)));
        }
      }
    } else if (m === "alias_method") {
      const first = a.kid(n, 2);
      if (argc === 2 && nmnSymStr(src, first)) {
        this.handleName(src, first, a.text(a.kid(first, 0)));
      }
    } else if (
      (m === "attr" || m === "attr_reader" || m === "attr_writer" || m === "attr_accessor") &&
      a.kid(n, 0) === V_NIL &&
      argc > 0
    ) {
      // handle_attr_accessor
      for (let i = 2; i < a.nKid(n); i++) {
        const x = a.kid(n, i);
        if (!nmnSymStr(src, x)) {
          continue;
        }
        const name = a.text(a.kid(x, 0));
        if (nmnForbidden(name)) {
          const last = a.kid(n, -1);
          this.c.offense(a.exS(last), a.exE(last));
        } else if (!nmhSnakeCase(name)) {
          this.offenseAt(src, n);
        }
      }
    }
  }

  /** handle_method_name. */
  private handleName(src: RbSource, n: i32, name: string): void {
    const a = src.a;
    if (nmnForbidden(name)) {
      // register_forbidden_name: a literal itself, else the call's first argument.
      if (a.type(n) === NT_SYM || a.type(n) === NT_STR) {
        this.c.offense(a.exS(n), a.exE(n));
      } else {
        const first = a.kid(n, 2);
        this.c.offense(a.exS(first), a.exE(first));
      }
    } else if (!ssxOperatorName(name) && !nmhSnakeCase(name)) {
      this.offenseAt(src, n);
    }
  }

  /** check_name's offense at range_position. */
  private offenseAt(src: RbSource, n: i32): void {
    if (ssxHas(src, n, F_SELECTOR)) {
      this.c.offense(ssxFE(src, n, F_SELECTOR) + 1, src.a.exE(n));
    } else {
      this.c.offense(src.a.exS(n), src.a.exE(n));
    }
  }
}
