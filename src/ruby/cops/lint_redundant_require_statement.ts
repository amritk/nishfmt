// Lint/RedundantRequireStatement (TargetRubyVersion 3.3).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_END,
  F_KEYWORD,
  F_QUESTION,
  NT_BEGIN,
  NT_BLOCK,
  NT_CASE,
  NT_CASE_MATCH,
  NT_CLASS,
  NT_DEF,
  NT_DEFS,
  NT_ENSURE,
  NT_FOR,
  NT_IF,
  NT_IN_PATTERN,
  NT_KWBEGIN,
  NT_MODULE,
  NT_NUMBLOCK,
  NT_RESBODY,
  NT_RESCUE,
  NT_SCLASS,
  NT_STR,
  NT_UNTIL,
  NT_UNTIL_POST,
  NT_WHEN,
  NT_WHILE,
  NT_WHILE_POST,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { rbSpaceEnd } from "../help";
import { RbSource } from "../source";
import { lalBeginsItsLine } from "./layout_align_help";
import {
  ssxCommand,
  ssxEndless,
  ssxHas,
  ssxInList,
  ssxIs,
  ssxLocIs,
  ssxRescueModifier,
  ssxWholeLinesE,
  ssxWholeLinesS,
} from "./style_syntax_help";

/** redundant_feature? for Ruby 3.3. */
const lrrsRedundant = (f: string): boolean =>
  ssxInList(" enumerator thread rational complex ruby2_keywords fiber set ", f);

/** ModifierNode#modifier_form? of a parent that has it (if/while/until), false for others. */
export const lrrsModifierForm = (src: RbSource, p: i32): boolean => {
  if (p === V_NIL) {
    return false;
  }
  const t = src.a.type(p);
  if (t === NT_IF) {
    return (ssxLocIs(src, p, F_KEYWORD, "if") || ssxLocIs(src, p, F_KEYWORD, "unless")) && !ssxHas(src, p, F_END);
  }
  if (t === NT_WHILE || t === NT_WHILE_POST || t === NT_UNTIL || t === NT_UNTIL_POST) {
    return !ssxHas(src, p, F_END);
  }
  return false;
};

/** value_only_form?: a parent whose children are values, never statements. */
const lrrsValueOnly = (src: RbSource, p: i32): boolean => {
  const t = src.a.type(p);
  if (t === NT_IF) {
    return ssxHas(src, p, F_QUESTION);
  }
  if (t === NT_RESCUE) {
    return ssxRescueModifier(src, src.a.kid(p, 1));
  }
  if (t === NT_RESBODY) {
    return ssxRescueModifier(src, p);
  }
  if (t === NT_DEF || t === NT_DEFS) {
    return ssxEndless(src, p);
  }
  return false;
};

/** The body child of a BODY_PARENT_TYPES node (V_NIL for other types). */
const lrrsBody = (src: RbSource, p: i32): i32 => {
  const a = src.a;
  const t = a.type(p);
  if (t === NT_MODULE || t === NT_SCLASS) {
    return a.kid(p, 1);
  }
  if (t === NT_CLASS || t === NT_DEF || t === NT_BLOCK || t === NT_NUMBLOCK) {
    return a.kid(p, 2);
  }
  if (t === NT_IN_PATTERN || t === NT_FOR || t === NT_RESBODY) {
    return a.kid(p, 2);
  }
  if (t === NT_DEFS) {
    return a.kid(p, 3);
  }
  if (t === NT_WHEN) {
    return a.kid(p, -1);
  }
  return V_NIL;
};

/** statement?: the require stands as a statement of its parent. */
const lrrsStatement = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  const p = src.parent(n);
  if (p === V_NIL) {
    return true;
  }
  if (lrrsValueOnly(src, p)) {
    return false;
  }
  const t = a.type(p);
  if (t === NT_BEGIN || t === NT_KWBEGIN || t === NT_RESCUE || t === NT_ENSURE) {
    return true;
  }
  if (t === NT_IF || t === NT_WHILE || t === NT_UNTIL) {
    return a.kid(p, 0) !== n;
  }
  if (t === NT_CASE || t === NT_CASE_MATCH) {
    return a.kid(p, -1) === n;
  }
  const b = lrrsBody(src, p);
  return b !== V_NIL && b === n;
};

/** RangeHelp#range_for_statement_removal: the start and the end of the range to remove. */
const lrrsStatementRemovalS = (src: RbSource, s: i32, e: i32): i32 =>
  lrrsWholeLine(src, s, e) ? ssxWholeLinesS(src, s) : s;

const lrrsStatementRemovalE = (src: RbSource, s: i32, e: i32): i32 =>
  lrrsWholeLine(src, s, e) ? ssxWholeLinesE(src, e, true) : rbSpaceEnd(src, e, 2, false, false, false);

/** begins_its_line? and the rest of the last line matches /\A\s*(#|\z)/. */
const lrrsWholeLine = (src: RbSource, s: i32, e: i32): boolean => {
  if (!lalBeginsItsLine(src, s)) {
    return false;
  }
  const le = src.lineEnd(src.line(e));
  let i = e;
  while (i < le) {
    const c = src.at(i);
    if (c === 32 || c === 9 || c === 13 || c === 12 || c === 11) {
      i++;
      continue;
    }
    return c === 35;
  }
  return true;
};

export class CopLintRedundantRequireStatement {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/RedundantRequireStatement");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxCommand(src, n, "require") || a.nKid(n) !== 3) {
        continue;
      }
      const s = a.kid(n, 2);
      if (!ssxIs(src, s, NT_STR) || !lrrsRedundant(a.text(a.kid(s, 0))) || !lrrsStatement(src, n)) {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k === null) {
        continue;
      }
      const p = src.parent(n);
      if (lrrsModifierForm(src, p)) {
        k.insertAfter(a.exS(p), a.exE(p), "\nend");
        k.remove(a.exS(n), rbSpaceEnd(src, a.exE(n), 2, true, false, false));
      } else {
        k.remove(lrrsStatementRemovalS(src, a.exS(n), a.exE(n)), lrrsStatementRemovalE(src, a.exS(n), a.exE(n)));
      }
      this.c.commit(k);
    }
  }
}
