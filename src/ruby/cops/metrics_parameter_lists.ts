// Metrics/ParameterLists (detection only; Max: 5, CountKeywordArgs: true,
// MaxOptionalParameters: 3).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_ARGS, NT_BLOCK, NT_BLOCKARG, NT_CSEND, NT_DEF, NT_DEFS, NT_NUMBLOCK, NT_OPTARG, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxGlobalConst } from "./style_syntax_help";

/** MethodIdentifierPredicates#method?(:initialize) of a def, defs or block. */
const mplInitialize = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  const t = a.type(n);
  if (t === NT_DEF) {
    return a.text(a.kid(n, 0)) === "initialize";
  }
  if (t === NT_DEFS) {
    return a.text(a.kid(n, 1)) === "initialize";
  }
  if (t === NT_BLOCK || t === NT_NUMBLOCK) {
    const s = a.kid(n, 0);
    return a.isNode(s) && (a.type(s) === NT_SEND || a.type(s) === NT_CSEND) && a.text(a.kid(s, 1)) === "initialize";
  }
  return false;
};

/** struct_new_or_data_define_block?: `(block {Struct.new(...) Data.define(...)} (args) ...)`. */
const mplStructBlock = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  if (n === V_NIL || a.type(n) !== NT_BLOCK) {
    return false;
  }
  const s = a.kid(n, 0);
  const args = a.kid(n, 1);
  if (!a.isNode(s) || a.type(s) !== NT_SEND || !a.isNode(args) || a.type(args) !== NT_ARGS || a.nKid(args) !== 0) {
    return false;
  }
  const m = a.text(a.kid(s, 1));
  const r = a.kid(s, 0);
  return (m === "new" && ssxGlobalConst(src, r, "Struct")) || (m === "define" && ssxGlobalConst(src, r, "Data"));
};

/** lambda_or_proc?: `lambda { }`, `proc { }`, `Proc.new { }` (not a stabby lambda). */
const mplLambdaOrProc = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  const t = a.type(n);
  if (t !== NT_BLOCK && t !== NT_NUMBLOCK) {
    return false;
  }
  const s = a.kid(n, 0);
  if (!a.isNode(s) || a.type(s) !== NT_SEND) {
    return false;
  }
  const r = a.kid(s, 0);
  const m = a.text(a.kid(s, 1));
  if (r === V_NIL && m === "lambda" && a.nKid(s) === 2) {
    return true;
  }
  if (t !== NT_BLOCK) {
    return false;
  }
  return (r === V_NIL && m === "proc" && a.nKid(s) === 2) || (m === "new" && a.nKid(s) === 2 && ssxGlobalConst(src, r, "Proc"));
};

export class CopMetricsParameterLists {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Metrics/ParameterLists");
  }
  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_DEF || t === NT_DEFS) {
        const args = a.kid(n, t === NT_DEF ? 1 : 2);
        let opt = 0;
        for (let i = 0; i < a.nKid(args); i++) {
          if (a.type(a.kid(args, i)) === NT_OPTARG) {
            opt++;
          }
        }
        if (opt > 3) {
          this.c.offense(a.exS(n), a.exE(n));
        }
      } else if (t === NT_ARGS) {
        const parent = src.parent(n);
        if (parent !== V_NIL && mplInitialize(src, parent) && mplStructBlock(src, src.parent(parent))) {
          continue;
        }
        let count = 0;
        for (let i = 0; i < a.nKid(n); i++) {
          if (a.type(a.kid(n, i)) !== NT_BLOCKARG) {
            count++;
          }
        }
        if (count <= 5 || (parent !== V_NIL && mplLambdaOrProc(src, parent))) {
          continue;
        }
        this.c.offense(a.exS(n), a.exE(n));
      }
    }
  }
}
