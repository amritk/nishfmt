// The Swift entry point: SwiftFormat's applyRules over one file with the
// default rules and options. A file the tokenizer rejects, or one a rule
// this port does not handle would change, is left alone.
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { fault } from "../core/fault";
import { Out } from "../core/out";
import { SwFormatter } from "./formatter";
import { swRunRule } from "./dispatch";
import { swRuleName, SW_RULE_COUNT, SW_RULE_INDENT, SW_RULE_TRAILING_SPACE, swRuleRunsOnce } from "./rules";
import { SW_COMMENT, SW_ERROR, SW_OP, SwTokList } from "./token";
import { swTokenize, swValidUtf8 } from "./tokenizer";
import { swUniIsUncertain, swUniResetUncertain } from "./unicode";
import {
  SW_DIRECTIVES_OK,
  swHasDirectiveText,
  swHasSortDirective,
  swProcessDirectives,
  swRuleDirectiveNames,
  swRuleHonoursDirectives,
} from "./directives";

/** One file's Swift state; a fresh one formats each file, in a region of its own. */
export class SwiftEngine {
  debug: boolean = false;
  // FFSWONLY: run only this rule (as `--rules name`), for comparing one rule with the reference.
  only: string = "";
  // FFSWDIRALL: treat every rule as honouring directives (for testing a rule's directive support).
  dirAll: boolean = false;
  constructor() {
    this.dirAll = getenv("FFSWDIRALL") !== null;
    const only = getenv("FFSWONLY");
    if (only !== null) {
      this.only = only;
    }
  }
}

const swSameTokens = (a: SwTokList, b: SwTokList): boolean => {
  const n = a.count();
  if (n !== b.count()) {
    return false;
  }
  const ak = a.k;
  const aa = a.a;
  const as = a.s;
  const bk = b.k;
  const ba = b.a;
  const bs = b.s;
  if (ak.length < n || aa.length < n || as.length < n || bk.length < n || ba.length < n || bs.length < n) {
    fault();
    return false;
  }
  for (
    let i = 0;
    i < n && i < ak.length && i < aa.length && i < as.length && i < bk.length && i < ba.length && i < bs.length;
    i++
  ) {
    if (ak[i] !== bk[i] || aa[i] !== ba[i] || as[i] !== bs[i]) {
      return false;
    }
  }
  return true;
};

/** parsingError: an error token, or a conflict marker. */
const swHasParsingError = (t: SwTokList): boolean => {
  const ks = t.k;
  const ss = t.s;
  if (ss.length < ks.length) {
    fault();
    return false;
  }
  for (let i = 0; i < ks.length && i < ss.length; i++) {
    const k = ks[i];
    if (k === SW_ERROR) {
      return true;
    }
    if (k === SW_OP) {
      const s = ss[i];
      if (s.startsWith("<<<<<") || s.startsWith("=====") || s.startsWith(">>>>>")) {
        return true;
      }
    }
  }
  return false;
};

/** applyRules: answers the formatted tokens, or null when the file cannot be formatted. */
const swApplyRules = (e: SwiftEngine, path: string, tokens0: SwTokList, directives: boolean): SwTokList | null => {
  // The rules, in order; the first pass runs trailingSpace and indent first.
  const names: string[] = [];
  for (let r = 0; r < SW_RULE_COUNT; r++) {
    names.push(swRuleName(r));
  }
  const ordered: i32[] = [];
  for (let r = 0; r < SW_RULE_COUNT && r < names.length; r++) {
    if (e.only.length !== 0 && names[r] !== e.only) {
      continue;
    }
    ordered.push(r);
  }
  let rules: i32[] = [];
  if (ordered.indexOf(SW_RULE_INDENT) >= 0) {
    if (ordered.indexOf(SW_RULE_TRAILING_SPACE) >= 0) {
      rules.push(SW_RULE_TRAILING_SPACE);
    }
    rules.push(SW_RULE_INDENT);
  }
  for (const r of ordered) {
    rules.push(r);
  }
  let tokens = tokens0;
  for (let iteration = 0; iteration < 10; iteration++) {
    const f = new SwFormatter(tokens.copy());
    f.path = path;
    f.only = e.only;
    if (directives && swProcessDirectives(f) !== SW_DIRECTIVES_OK) {
      if (e.debug) {
        console.error(`${path}: swiftformat directives that are not handled`);
      }
      return null;
    }
    for (const r of rules) {
      if (r < 0 || r >= names.length) {
        fault();
        return null;
      }
      f.rule = names[r];
      f.ruleDisabled = false;
      f.disabled = false;
      if (f.hasDirectives()) {
        f.ruleNames = swRuleDirectiveNames(f.rule);
        if (!e.dirAll && f.anyDirectiveApplies() && !swRuleHonoursDirectives(f.rule)) {
          if (e.debug) {
            console.error(`${path}: a directive names ${f.rule}, which does not honour directives yet`);
          }
          return null;
        }
      }
      if (!swRunRule(f, r)) {
        if (e.debug) {
          console.error(`${path}: rule ${f.rule} is not handled here`);
        }
        return null;
      }
      const errors = f.errors;
      if (errors.length > 0) {
        if (e.debug) {
          console.error(`${path}: ${errors[0]}`);
        }
        return null;
      }
    }
    if (swSameTokens(tokens, f.t)) {
      return tokens;
    }
    tokens = f.t;
    if (iteration === 0) {
      const next: i32[] = [];
      for (const r of ordered) {
        if (!swRuleRunsOnce(r)) {
          next.push(r);
        }
      }
      rules = next;
    }
  }
  if (e.debug) {
    console.error(`${path}: failed to terminate`);
  }
  return null;
};

/** Formats `src[0, n)` into `out` as SwiftFormat does; answers false when the file cannot be formatted. */
export const formatSwift = (e: SwiftEngine, path: string, src: u8[], n: i32, out: Out): boolean => {
  if (!swValidUtf8(src, n)) {
    if (e.debug) {
      console.error(`${path}: not UTF-8`);
    }
    return false;
  }
  const tokens = swTokenize(src, n);
  if (swHasParsingError(tokens)) {
    if (e.debug) {
      console.error(`${path}: parsing error`);
    }
    return false;
  }
  const directives = swHasDirectiveText(tokens);
  if (directives && swHasSortDirective(tokens) && (e.only.length === 0 || e.only === "sortDeclarations")) {
    if (e.debug) {
      console.error(`${path}: swiftformat:sort comments (sortDeclarations is not ported)`);
    }
    return false;
  }
  swUniResetUncertain();
  const res = swApplyRules(e, path, tokens, directives);
  if (res === null) {
    return false;
  }
  if (swUniIsUncertain()) {
    // A character count or case test met a code point whose properties may differ in
    // SwiftFormat's Unicode version.
    if (e.debug) {
      console.error(`${path}: Unicode data this port is unsure of`);
    }
    return false;
  }
  const count = res.count();
  const rs = res.s;
  if (rs.length < count) {
    fault();
    return false;
  }
  out.n = 0;
  for (let i = 0; i < count && i < rs.length; i++) {
    out.str(rs[i]);
  }
  return true;
};

export const isSwiftName = (name: string): boolean => name.endsWith(".swift");
