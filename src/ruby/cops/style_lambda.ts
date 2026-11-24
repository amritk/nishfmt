// Style/Lambda (EnforcedStyle: line_count_dependent), with
// LambdaLiteralToMethodCorrector.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { rbAtOff } from "../help";
import {
  F_BEGIN,
  F_END,
  F_KEYWORD,
  F_SELECTOR,
  NT_AND,
  NT_ARRAY_PATTERN,
  NT_ARRAY_PATTERN_WITH_TAIL,
  NT_BEGIN,
  NT_BLOCK,
  NT_CONST_PATTERN,
  NT_ENSURE,
  NT_ERANGE,
  NT_FIND_PATTERN,
  NT_HASH_PATTERN,
  NT_IF,
  NT_IN_PATTERN,
  NT_IRANGE,
  NT_KWOPTARG,
  NT_MATCH_ALT,
  NT_MATCH_AS,
  NT_MATCH_PATTERN,
  NT_MATCH_PATTERN_P,
  NT_NUMBLOCK,
  NT_OPTARG,
  NT_OR,
  NT_PAIR,
  NT_RESBODY,
  NT_RESCUE,
  NT_SEND,
  NT_SHADOWARG,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { TK_kRESCUE_MOD } from "../tables";
import {
  ssxFE,
  ssxFS,
  ssxHas,
  ssxInPattern,
  ssxIs,
  ssxIsCall,
  ssxIsSpace,
  ssxLocIs,
  ssxMeth,
  ssxOperatorName,
  ssxRescueModifier,
  ssxSiblingIndex,
} from "./style_syntax_help";

/** arg_to_unparenthesized_call? */
const ssxLambdaArgToUnparenthesizedCall = (src: RbSource, block: i32): boolean => {
  let cur = block;
  let par = src.parent(cur);
  if (par !== V_NIL && src.a.type(par) === NT_PAIR) {
    cur = src.parent(par);
    par = src.parent(cur);
  }
  if (par === V_NIL || src.a.type(par) !== NT_SEND) {
    return false;
  }
  if (ssxLocIs(src, par, F_BEGIN, "(")) {
    return false;
  }
  return ssxSiblingIndex(src, cur) > 1;
};

/** replace_delimiters?: a do-end lambda literal that is an argument of a call without parentheses. */
const ssxLambdaReplaceDelimiters = (src: RbSource, block: i32): boolean =>
  !ssxLocIs(src, block, F_END, "}") && ssxLambdaArgToUnparenthesizedCall(src, block);

/** operator_expression? */
const ssxLambdaOperatorExpression = (src: RbSource, n: i32): boolean => {
  const t = src.a.type(n);
  if (t === NT_IRANGE || t === NT_ERANGE || t === NT_IF || t === NT_AND || t === NT_OR) {
    return true;
  }
  if (!ssxIsCall(src, n)) {
    return false;
  }
  const m = ssxMeth(src, n);
  return ssxOperatorName(m) && m !== "[]";
};

/** lambda_arg_string (literal: the corrector's argument_source for each regular argument). */
const ssxLambdaArgString = (src: RbSource, args: i32, literalCorrector: boolean): string => {
  const a = src.a;
  const regular: string[] = [];
  const shadow: string[] = [];
  for (let i = 0; i < a.nKid(args); i++) {
    const arg = a.kid(args, i);
    if (a.type(arg) === NT_SHADOWARG) {
      shadow.push(src.nodeSrc(arg));
      continue;
    }
    let s = src.nodeSrc(arg);
    if (literalCorrector && (a.type(arg) === NT_OPTARG || a.type(arg) === NT_KWOPTARG)) {
      const dv = a.kid(arg, 1);
      if (ssxLambdaOperatorExpression(src, dv)) {
        s = `${src.src(a.exS(arg), a.exS(dv))}(${src.nodeSrc(dv)})`;
      }
    }
    regular.push(s);
  }
  let out = regular.join(", ");
  if (shadow.length > 0) {
    out = `${out}; ${shadow.join(", ")}`;
  }
  return out;
};

export class CopStyleLambda {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/Lambda");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_BLOCK && t !== NT_NUMBLOCK) {
        continue;
      }
      const send = a.kid(n, 0);
      if (ssxMeth(src, send) !== "lambda") {
        continue;
      }
      const selector = src.nodeSrc(send);
      const multi = src.line(ssxFS(src, n, F_BEGIN)) !== src.line(ssxFS(src, n, F_END));
      if (selector !== (multi ? "->" : "lambda")) {
        continue;
      }
      const literal = selector === "->";
      // uncorrectable_lambda_literal?
      if (literal) {
        if (ssxInPattern(src, n)) {
          continue;
        }
        const body = a.kid(n, 2);
        let rescueOrEnsure = false;
        if (body !== V_NIL) {
          if (a.type(body) === NT_ENSURE) {
            rescueOrEnsure = true;
          } else if (a.type(body) === NT_RESCUE) {
            let first = V_NIL;
            for (let i = 1; i < a.nKid(body); i++) {
              if (ssxIs(src, a.kid(body, i), NT_RESBODY)) {
                first = a.kid(body, i);
                break;
              }
            }
            rescueOrEnsure = !ssxRescueModifier(src, first);
          }
        }
        if (rescueOrEnsure && ssxLambdaReplaceDelimiters(src, n)) {
          continue;
        }
      }
      const k = this.c.offense(a.exS(send), a.exE(send));
      if (k === null) {
        continue;
      }
      const bs = ssxFS(src, n, F_BEGIN);
      const be = ssxFE(src, n, F_BEGIN);
      const args = t === NT_BLOCK ? a.kid(n, 1) : V_NIL;
      const hasArgs = args !== V_NIL && a.nKid(args) > 0;
      if (!literal) {
        // autocorrect_method_to_literal
        k.replace(a.exS(send), a.exE(send), "->");
        if (hasArgs) {
          k.insertAfter(a.exE(send), a.exE(send), `(${ssxLambdaArgString(src, args, false)})`);
          k.remove(be, ssxFE(src, args, F_END));
        }
        this.c.commit(k);
        continue;
      }
      // LambdaLiteralToMethodCorrector#call
      if (hasArgs && !ssxLocIs(src, args, F_BEGIN, "(")) {
        const as = a.exS(args);
        k.remove(a.exE(send), as);
        const ws = a.exE(args);
        if (toI64(bs) - toI64(ws) > toI64(1)) {
          k.replace(ws, bs, " ");
        }
      }
      if (t === NT_BLOCK) {
        const selEnd = ssxFE(src, send, F_SELECTOR);
        const argsEnd = ssxHas(src, args, F_END) ? ssxFE(src, args, F_END) : -2;
        const argsBegin = ssxHas(src, args, F_BEGIN) ? ssxFS(src, args, F_BEGIN) : -2;
        if ((bs === argsEnd && selEnd === argsBegin) || bs === selEnd) {
          k.insertBefore(bs, bs, " ");
        }
        if (a.exS(args) >= 0) {
          k.remove(a.exS(args), a.exE(args));
        }
      }
      k.replace(a.exS(send), a.exE(send), "lambda");
      if (ssxLambdaReplaceDelimiters(src, n)) {
        if (!ssxIsSpace(rbAtOff(src, bs, 2))) {
          k.insertAfter(bs, be, " ");
        }
        k.replace(bs, be, "{");
        k.replace(ssxFS(src, n, F_END), ssxFE(src, n, F_END), "}");
      }
      if (hasArgs) {
        k.insertAfter(bs, be, ` |${ssxLambdaArgString(src, args, true)}|`);
      }
      this.c.commit(k);
    }
  }
}
