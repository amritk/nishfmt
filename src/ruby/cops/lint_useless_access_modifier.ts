// Lint/UselessAccessModifier (ContextCreatingMethods: [],
// MethodCreatingMethods: [], ActiveSupportExtensionsEnabled: false).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  NT_BEGIN,
  NT_BLOCK,
  NT_CLASS,
  NT_DEF,
  NT_DEFS,
  NT_MODULE,
  NT_NUMBLOCK,
  NT_SCLASS,
  NT_SEND,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import {
  ssxClassConstructor,
  ssxIs,
  ssxIsAnyBlock,
  ssxMacro,
  ssxMeth,
  ssxWholeLinesE,
  ssxWholeLinesS,
} from "./style_syntax_help";

/** SendNode#bare_access_modifier?. */
const luamBare = (src: RbSource, n: i32): boolean => {
  if (!ssxMacro(src, n) || src.a.nKid(n) !== 2) {
    return false;
  }
  const m = ssxMeth(src, n);
  return m === "public" || m === "protected" || m === "private" || m === "module_function";
};

/** The cop's access_modifier?. */
const luamAccessModifier = (src: RbSource, n: i32): boolean =>
  luamBare(src, n) || ssxMeth(src, n) === "private_class_method";

/** method_definition?: a def, an attr macro or define_method (with or without a block). */
const luamMethodDefinition = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  if (ssxIs(src, n, NT_DEF)) {
    return true;
  }
  if (ssxIs(src, n, NT_SEND) && a.kid(n, 0) === V_NIL) {
    const m = ssxMeth(src, n);
    if (m === "attr" || m === "attr_reader" || m === "attr_writer" || m === "attr_accessor" || m === "define_method") {
      return true;
    }
  }
  if (ssxIsAnyBlock(src, n)) {
    const s = a.kid(n, 0);
    return ssxIs(src, s, NT_SEND) && a.kid(s, 0) === V_NIL && ssxMeth(src, s) === "define_method";
  }
  return false;
};

/** eval_call?: a class_eval/instance_eval block or a class constructor. */
const luamEvalCall = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  if (ssxIsAnyBlock(src, n)) {
    const s = a.kid(n, 0);
    if (ssxIs(src, s, NT_SEND) && a.nKid(s) === 2) {
      const m = ssxMeth(src, s);
      if (m === "class_eval" || m === "instance_eval") {
        return true;
      }
    }
  }
  return ssxClassConstructor(src, n);
};

export class CopLintUselessAccessModifier {
  c: RbCop;
  // check_child_nodes' state: the current visibility ("" for nil) and the unused modifier.
  curVis: string = "";
  unused: i32 = 0;

  constructor() {
    this.c = new RbCop("Lint/UselessAccessModifier");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_CLASS || t === NT_MODULE || t === NT_SCLASS) {
        this.checkNode(src, a.kid(n, -1));
      } else if (t === NT_BLOCK || t === NT_NUMBLOCK) {
        if (luamEvalCall(src, n)) {
          this.checkNode(src, a.kid(n, 2));
        }
      } else if (t === NT_BEGIN && src.parent(n) === V_NIL) {
        for (let i = 0; i < a.nKid(n); i++) {
          const ch = a.kid(n, i);
          if (!ssxIs(src, ch, NT_SEND) || !luamAccessModifier(src, ch)) {
            continue;
          }
          // check_send_node(child, child.method_name, true)
          if (luamBare(src, ch) || a.nKid(ch) === 2) {
            this.flag(src, ch);
          }
        }
      }
    }
  }

  private flag(src: RbSource, n: i32): void {
    const a = src.a;
    const k = this.c.offense(a.exS(n), a.exE(n));
    if (k !== null) {
      k.remove(ssxWholeLinesS(src, a.exS(n)), ssxWholeLinesE(src, a.exE(n), true));
      this.c.commit(k);
    }
  }

  private checkNode(src: RbSource, n: i32): void {
    if (n === V_NIL) {
      return;
    }
    if (src.a.type(n) === NT_BEGIN) {
      this.checkScope(src, n);
    } else if (ssxIs(src, n, NT_SEND) && luamBare(src, n)) {
      this.flag(src, n);
    }
  }

  private checkScope(src: RbSource, n: i32): void {
    this.curVis = "public";
    this.unused = V_NIL;
    this.checkChildNodes(src, n);
    if (this.unused !== V_NIL) {
      this.flag(src, this.unused);
    }
  }

  private checkChildNodes(src: RbSource, n: i32): void {
    const a = src.a;
    for (let i = 0; i < a.nKid(n); i++) {
      const ch = a.kid(n, i);
      if (!a.isNode(ch)) {
        continue;
      }
      const t = a.type(ch);
      if (t === NT_SEND && luamAccessModifier(src, ch)) {
        this.checkSendNode(src, ch);
      } else if (luamMethodDefinition(src, ch)) {
        this.unused = V_NIL;
      } else if (t === NT_MODULE || t === NT_CLASS || t === NT_SCLASS || luamEvalCall(src, ch)) {
        const cv = this.curVis;
        const un = this.unused;
        this.checkScope(src, ch);
        this.curVis = cv;
        this.unused = un;
      } else if (t !== NT_DEFS) {
        this.checkChildNodes(src, ch);
      }
    }
  }

  private checkSendNode(src: RbSource, n: i32): void {
    if (luamBare(src, n)) {
      const nv = ssxMeth(src, n);
      if (nv === this.curVis) {
        this.flag(src, n);
      } else {
        if (this.unused !== V_NIL) {
          this.flag(src, this.unused);
        }
        this.unused = n;
      }
      this.curVis = nv;
    } else if (src.a.nKid(n) === 2) {
      // private_class_method without arguments
      this.flag(src, n);
    } else {
      // check_send_node returns nil: both values become nil.
      this.curVis = "";
      this.unused = V_NIL;
    }
  }
}
