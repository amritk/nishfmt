// The Swift entry point: SwiftFormat's applyRules over one file with the
// default rules and options. A file the tokenizer rejects, or one a rule
// this port does not handle would change, is left alone.
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { Out } from "../core/out";
import { SwFormatter } from "./formatter";
import { swRunRule } from "./dispatch";
import { swRuleName, SW_RULE_COUNT, SW_RULE_INDENT, SW_RULE_TRAILING_SPACE, swRuleRunsOnce } from "./rules";
import { SW_COMMENT, SW_ERROR, SW_OP, SwTokList } from "./token";
import { swTokenize, swValidUtf8 } from "./tokenizer";

/** One file's Swift state; a fresh one formats each file, in a region of its own. */
export class SwiftEngine {
  debug: boolean = false;
  // FFSWONLY: run only this rule (as `--rules name`), for comparing one rule with the reference.
  only: string = "";
  constructor() {
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
  for (let i = 0; i < n; i++) {
    if (a.k[i] !== b.k[i] || a.a[i] !== b.a[i] || a.s[i] !== b.s[i]) {
      return false;
    }
  }
  return true;
};

/** parsingError: an error token, or a conflict marker. */
const swHasParsingError = (t: SwTokList): boolean => {
  for (let i = 0; i < t.count(); i++) {
    const k = t.k[i];
    if (k === SW_ERROR) {
      return true;
    }
    if (k === SW_OP) {
      const s = t.s[i];
      if (s.startsWith("<<<<<") || s.startsWith("=====") || s.startsWith(">>>>>")) {
        return true;
      }
    }
  }
  return false;
};

/** Whether a comment holds a `swiftformat:` directive (not handled yet). */
const swHasDirectives = (t: SwTokList): boolean => {
  for (let i = 0; i < t.count(); i++) {
    if (t.k[i] === SW_COMMENT && t.s[i].indexOf("swiftformat:") >= 0) {
      return true;
    }
  }
  return false;
};

/** applyRules: answers the formatted tokens, or null when the file cannot be formatted. */
const swApplyRules = (e: SwiftEngine, path: string, tokens0: SwTokList): SwTokList | null => {
  // The rules, in order; the first pass runs trailingSpace and indent first.
  const ordered: i32[] = [];
  for (let r = 0; r < SW_RULE_COUNT; r++) {
    if (e.only.length !== 0 && swRuleName(r) !== e.only) {
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
    for (const r of rules) {
      f.rule = swRuleName(r);
      f.ruleDisabled = false;
      if (!swRunRule(f, r)) {
        if (e.debug) {
          console.error(`${path}: rule ${f.rule} is not handled here`);
        }
        return null;
      }
      if (f.errors.length !== 0) {
        if (e.debug) {
          console.error(`${path}: ${f.errors[0]}`);
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
  if (swHasDirectives(tokens)) {
    if (e.debug) {
      console.error(`${path}: swiftformat directives are not handled yet`);
    }
    return false;
  }
  const res = swApplyRules(e, path, tokens);
  if (res === null) {
    return false;
  }
  out.n = 0;
  for (let i = 0; i < res.count(); i++) {
    out.str(res.s[i]);
  }
  return true;
};

export const isSwiftName = (name: string): boolean => name.endsWith(".swift");
