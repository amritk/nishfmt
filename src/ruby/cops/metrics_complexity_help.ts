// The MethodComplexity mixin (on_def/on_block with define_method, under the
// default AllowedMethods: [] and AllowedPatterns: []) and the three scores it
// feeds: CyclomaticComplexity's and PerceivedComplexity's complexity_score_for
// and Utils::AbcSizeCalculator.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_ELSE,
  F_OPERATOR,
  NT_AND,
  NT_AND_ASGN,
  NT_ARG,
  NT_ARRAY,
  NT_BLOCK,
  NT_BLOCK_PASS,
  NT_BLOCKARG,
  NT_CASE,
  NT_CASE_MATCH,
  NT_CASGN,
  NT_COMPLEX,
  NT_CONST,
  NT_CSEND,
  NT_CVASGN,
  NT_DEF,
  NT_DEFINED_P,
  NT_DEFS,
  NT_DSTR,
  NT_DSYM,
  NT_ERANGE,
  NT_FALSE,
  NT_FLOAT,
  NT_FOR,
  NT_FORWARD_ARG,
  NT_GVASGN,
  NT_HASH,
  NT_IF,
  NT_IN_PATTERN,
  NT_INT,
  NT_IRANGE,
  NT_IVASGN,
  NT_KWARG,
  NT_KWOPTARG,
  NT_KWRESTARG,
  NT_LAMBDA,
  NT_LVASGN,
  NT_MASGN,
  NT_MLHS,
  NT_NIL,
  NT_NUMBLOCK,
  NT_OP_ASGN,
  NT_OPTARG,
  NT_OR,
  NT_OR_ASGN,
  NT_RATIONAL,
  NT_REGEXP,
  NT_REGOPT,
  NT_RESCUE,
  NT_RESTARG,
  NT_SEND,
  NT_SHADOWARG,
  NT_SPLAT,
  NT_STR,
  NT_SUPER,
  NT_SYM,
  NT_TRUE,
  NT_UNTIL,
  NT_WHEN,
  NT_WHILE,
  NT_XSTR,
  NT_YIELD,
  NT_ZSUPER,
  V_NIL,
} from "../ast";
import { RbSource } from "../source";
import { MtxCsend, mtxBody, mtxDefineMethodName, mtxIterating } from "./metrics_help";
import { scnElsif } from "./style_cond_help";

/**
 * The nodes MethodComplexity checks, in walk order: every def/defs (none is
 * allowed by default) and every block on `define_method(:name)`.
 */
export const mcxTargets = (src: RbSource): i32[] => {
  const out: i32[] = [];
  for (const n of src.pre) {
    const t = src.a.type(n);
    if (t === NT_DEF || t === NT_DEFS) {
      out.push(n);
    } else if ((t === NT_BLOCK || t === NT_NUMBLOCK) && mtxDefineMethodName(src, n) !== null) {
      out.push(n);
    }
  }
  return out;
};

/** The target's body (check_complexity returns without one). */
export const mcxBody = (src: RbSource, n: i32): i32 => mtxBody(src, n);

/** CyclomaticComplexity::COUNTED_NODES (also AbcSizeCalculator's CONDITION_NODES). */
const mcxCycloCounted = (t: i32): boolean =>
  t === NT_IF ||
  t === NT_WHILE ||
  t === NT_UNTIL ||
  t === NT_FOR ||
  t === NT_CSEND ||
  t === NT_BLOCK ||
  t === NT_BLOCK_PASS ||
  t === NT_RESCUE ||
  t === NT_WHEN ||
  t === NT_IN_PATTERN ||
  t === NT_AND ||
  t === NT_OR ||
  t === NT_OR_ASGN ||
  t === NT_AND_ASGN;

/** PerceivedComplexity::COUNTED_NODES: without when/in_pattern, with case/case_match. */
const mcxPerceivedCounted = (t: i32): boolean =>
  (mcxCycloCounted(t) && t !== NT_WHEN && t !== NT_IN_PATTERN) || t === NT_CASE || t === NT_CASE_MATCH;

/** Node#literal? */
export const mcxLiteral = (t: i32): boolean =>
  t === NT_STR ||
  t === NT_DSTR ||
  t === NT_XSTR ||
  t === NT_INT ||
  t === NT_FLOAT ||
  t === NT_SYM ||
  t === NT_DSYM ||
  t === NT_ARRAY ||
  t === NT_HASH ||
  t === NT_REGEXP ||
  t === NT_TRUE ||
  t === NT_IRANGE ||
  t === NT_ERANGE ||
  t === NT_COMPLEX ||
  t === NT_RATIONAL ||
  t === NT_REGOPT ||
  t === NT_FALSE ||
  t === NT_NIL;

/** CyclomaticComplexity#complexity_score_for. */
const mcxCycloScore = (src: RbSource, cs: MtxCsend, n: i32): i32 => {
  if (mtxIterating(src, n) === 0) {
    return 0;
  }
  if (src.a.type(n) === NT_CSEND && cs.discount(src, n)) {
    return 0;
  }
  return 1;
};

/** PerceivedComplexity#complexity_score_for. */
const mcxPerceivedScore = (src: RbSource, cs: MtxCsend, n: i32): i32 => {
  const a = src.a;
  const t = a.type(n);
  if (t === NT_CASE) {
    const k = a.nKid(n);
    const nb = k - 2 + (a.kid(n, k - 1) !== V_NIL ? 1 : 0);
    if (a.kid(n, 0) === V_NIL) {
      return nb;
    }
    // ((nb * 0.2) + 0.8).round, in tenths (never a half).
    return (2 * nb + 8 + 5) / 10;
  }
  if (t === NT_CASE_MATCH) {
    const k = a.nKid(n);
    let tenths = 0;
    for (let i = 1; i < k - 1; i++) {
      const br = a.kid(n, i);
      const pat = a.kid(br, 0);
      const simple = a.kid(br, 1) === V_NIL && a.isNode(pat) && (mcxLiteral(a.type(pat)) || a.type(pat) === NT_CONST);
      tenths += simple ? 2 : 10;
    }
    if (a.kid(n, k - 1) !== V_NIL) {
      tenths += 2;
    }
    return (tenths + 5) / 10;
  }
  if (t === NT_IF) {
    return a.has(a.map(n), F_ELSE) && !scnElsif(src, n) ? 2 : 1;
  }
  return mcxCycloScore(src, cs, n);
};

/** MethodComplexity#complexity for Cyclomatic (perceived false) or Perceived (true). */
export const mcxComplexity = (src: RbSource, body: i32, perceived: boolean): i32 => {
  const cs = new MtxCsend();
  let score = 1;
  const stack: i32[] = [body];
  while (stack.length > 0) {
    const n = stack[stack.length - 1];
    stack.pop();
    const t = src.a.type(n);
    if (t === NT_LVASGN) {
      cs.resetOn(src, n);
    } else if (perceived ? mcxPerceivedCounted(t) : mcxCycloCounted(t)) {
      score += perceived ? mcxPerceivedScore(src, cs, n) : mcxCycloScore(src, cs, n);
    }
    for (let i = src.a.nKid(n) - 1; i >= 0; i--) {
      const k = src.a.kid(n, i);
      if (src.a.isNode(k)) {
        stack.push(k);
      }
    }
  }
  return score;
};

// ---- AbcSizeCalculator --------------------------------------------------------------

/** Whether a node responds to setter_method? (includes MethodDispatchNode). */
const mcxDispatch = (t: i32): boolean =>
  t === NT_SEND || t === NT_CSEND || t === NT_SUPER || t === NT_ZSUPER || t === NT_YIELD || t === NT_DEFINED_P || t === NT_LAMBDA;

/** Node#argument_type? */
const mcxArgType = (t: i32): boolean =>
  t === NT_ARG ||
  t === NT_OPTARG ||
  t === NT_RESTARG ||
  t === NT_KWARG ||
  t === NT_KWOPTARG ||
  t === NT_KWRESTARG ||
  t === NT_BLOCKARG ||
  t === NT_FORWARD_ARG ||
  t === NT_SHADOWARG;

/** capturing_variable?: a name not starting with `_` (false for none). */
const mcxCapturing = (src: RbSource, n: i32): boolean => {
  if (src.a.nKid(n) === 0) {
    return false;
  }
  const h = src.a.kid(n, 0);
  if (h === V_NIL) {
    return false;
  }
  const name = src.a.text(h);
  return !(name.length > 0 && name.charCodeAt(0) === 95);
};

/** MlhsNode#assignments into out. */
const mcxMlhsAssignments = (src: RbSource, mlhs: i32, out: i32[]): void => {
  for (let i = 0; i < src.a.nKid(mlhs); i++) {
    const k = src.a.kid(mlhs, i);
    if (!src.a.isNode(k)) {
      continue;
    }
    const t = src.a.type(k);
    if (t === NT_SPLAT) {
      const first = src.a.kid(k, 0);
      out.push(src.a.isNode(first) ? first : k);
    } else if (t === NT_MLHS) {
      mcxMlhsAssignments(src, k, out);
    } else {
      out.push(k);
    }
  }
};

/** The calculator's state for one method body. */
export class McxAbc {
  asg: i32 = 0;
  br: i32 = 0;
  cond: i32 = 0;
  cs: MtxCsend;

  constructor() {
    this.cs = new MtxCsend();
  }

  /** AbcSizeCalculator#calculate: A² + B² + C² (the cop compares its root, rounded, with Max). */
  run(src: RbSource, body: i32): i32 {
    this.visit(src, body);
    return this.asg * this.asg + this.br * this.br + this.cond * this.cond;
  }

  /** visit_depth_last: children first. */
  private visit(src: RbSource, n: i32): void {
    for (let i = 0; i < src.a.nKid(n); i++) {
      const k = src.a.kid(n, i);
      if (src.a.isNode(k)) {
        this.visit(src, k);
      }
    }
    this.calc(src, n);
  }

  private calc(src: RbSource, n: i32): void {
    if (this.assignment(src, n)) {
      this.asg = this.asg + 1;
    }
    const t = src.a.type(n);
    if (t === NT_SEND || t === NT_CSEND || t === NT_YIELD) {
      // evaluate_branch_nodes
      const m = t === NT_YIELD ? "yield" : src.a.text(src.a.kid(n, 1));
      if (m === "==" || m === "===" || m === "!=" || m === "<=" || m === ">=" || m === ">" || m === "<") {
        this.cond = this.cond + 1;
      } else {
        this.br = this.br + 1;
        if (t === NT_CSEND && !this.cs.discount(src, n)) {
          this.cond = this.cond + 1;
        }
      }
    } else if (mtxIterating(src, n) !== 0 && mcxCycloCounted(t)) {
      // evaluate_condition_node (else_branch?: an if with a literal `else`)
      const m = src.a.map(n);
      if (t === NT_IF && src.a.has(m, F_ELSE) && src.src(src.a.fS(m, F_ELSE), src.a.fE(m, F_ELSE)) === "else") {
        this.cond = this.cond + 1;
      }
      this.cond = this.cond + 1;
    }
  }

  private assignment(src: RbSource, n: i32): boolean {
    const a = src.a;
    const t = a.type(n);
    if (t === NT_MASGN || t === NT_OP_ASGN || t === NT_OR_ASGN || t === NT_AND_ASGN) {
      // compound_assignment
      const kids: i32[] = [];
      if (t === NT_MASGN) {
        mcxMlhsAssignments(src, a.kid(n, 0), kids);
      } else {
        for (let i = 0; i < a.nKid(n); i++) {
          const k = a.kid(n, i);
          if (a.isNode(k)) {
            kids.push(k);
          }
        }
      }
      for (const k of kids) {
        if (mcxDispatch(a.type(k)) && !a.has(a.map(k), F_OPERATOR)) {
          this.asg = this.asg + 1;
        }
      }
      return false;
    }
    if (t === NT_FOR) {
      return true;
    }
    if (mcxDispatch(t) && a.has(a.map(n), F_OPERATOR)) {
      return true;
    }
    if (t === NT_LVASGN) {
      this.cs.resetOn(src, n);
      return mcxCapturing(src, n);
    }
    if (t === NT_IVASGN || t === NT_CVASGN || t === NT_GVASGN || t === NT_CASGN) {
      return true;
    }
    return mcxArgType(t) && mcxCapturing(src, n);
  }
}
