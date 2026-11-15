// Lint/Debugger (the default DebuggerMethods and DebuggerRequires; no
// correction).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_BLOCK, NT_CSEND, NT_KWBEGIN, NT_NUMBLOCK, NT_PAIR, NT_SEND, NT_STR, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { lbhConstName, lbhGlobalConst, lbhLiteral, lbhReceiver } from "./lint_batch_help";
import { ssxIs, ssxMeth } from "./style_syntax_help";

/** DebuggerMethods, flattened. */
const LDBG_METHODS: string =
  ",binding.irb,Kernel.binding.irb,byebug,remote_byebug,Kernel.byebug,Kernel.remote_byebug," +
  "page.save_and_open_page,page.save_and_open_screenshot,page.save_page,page.save_screenshot," +
  "save_and_open_page,save_and_open_screenshot,save_page,save_screenshot,binding.b,binding.break," +
  "Kernel.binding.b,Kernel.binding.break,binding.pry,binding.remote_pry,binding.pry_remote," +
  "Kernel.binding.pry,Kernel.binding.remote_pry,Kernel.binding.pry_remote,Pry.rescue,pry,debugger," +
  "Kernel.debugger,jard,binding.console,";

/** debugger_method_names: the last segment of each. */
const LDBG_NAMES: string = ",irb,byebug,remote_byebug,save_and_open_page,save_and_open_screenshot,save_page,save_screenshot,b,break,pry,remote_pry,pry_remote,rescue,debugger,jard,console,";

/** Whether n is a call (send or csend). */
const ldbgCall = (src: RbSource, n: i32): boolean => ssxIs(src, n, NT_SEND) || ssxIs(src, n, NT_CSEND);

export class CopLintDebugger {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/Debugger");
  }

  // fastfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND) {
        continue;
      }
      if (!this.debuggerMethod(src, n) && !this.debuggerRequire(src, n)) {
        continue;
      }
      if (this.assumedUsageContext(src, n)) {
        continue;
      }
      this.c.offense(a.exS(n), a.exE(n));
    }
  }

  private debuggerMethod(src: RbSource, n: i32): boolean {
    const m = ssxMeth(src, n);
    if (LDBG_NAMES.indexOf(`,${m},`) < 0) {
      return false;
    }
    return LDBG_METHODS.indexOf(`,${this.chainedName(src, n)},`) >= 0;
  }

  private chainedName(src: RbSource, n: i32): string {
    const a = src.a;
    let name = ssxMeth(src, n);
    let r = a.kid(n, 0);
    while (r !== V_NIL) {
      const part = ssxIs(src, r, NT_SEND) ? ssxMeth(src, r) : lbhConstName(src, r);
      name = `${part}.${name}`;
      r = lbhReceiver(src, r);
    }
    return name;
  }

  private debuggerRequire(src: RbSource, n: i32): boolean {
    const a = src.a;
    if (ssxMeth(src, n) !== "require" || a.nKid(n) !== 3) {
      return false;
    }
    const arg = a.kid(n, 2);
    if (!ssxIs(src, arg, NT_STR)) {
      return false;
    }
    const v = a.text(a.kid(arg, 0));
    return v === "debug/open" || v === "debug/start";
  }

  private assumedUsageContext(src: RbSource, n: i32): boolean {
    const a = src.a;
    if (a.nKid(n) !== 2) {
      return false;
    }
    let anyCall = false;
    let p = src.parent(n);
    while (p !== V_NIL) {
      if (ldbgCall(src, p)) {
        anyCall = true;
      }
      p = src.parent(p);
    }
    if (!anyCall) {
      return false;
    }
    // assumed_argument?: the parent is a call, a literal or a pair.
    const par = src.parent(n);
    if (ldbgCall(src, par) || lbhLiteral(src, par) || ssxIs(src, par, NT_PAIR)) {
      return true;
    }
    p = src.parent(n);
    while (p !== V_NIL) {
      const t = a.type(p);
      if (t === NT_BLOCK || t === NT_NUMBLOCK || t === NT_KWBEGIN || this.lambdaOrProc(src, p)) {
        return false;
      }
      p = src.parent(p);
    }
    return true;
  }

  /** lambda_or_proc? on a non-block node: (send #global_const?(:Proc) :new). */
  private lambdaOrProc(src: RbSource, n: i32): boolean {
    return ssxIs(src, n, NT_SEND) && src.a.nKid(n) === 2 && ssxMeth(src, n) === "new" && lbhGlobalConst(src, src.a.kid(n, 0), "Proc");
  }
}

