// SwiftFormat's `swiftformat:` comment directives: Formatter.processDirectives()
// and the directive names of each rule. Enablement itself (updateEnablement and
// forEachToken's skipping) is in formatter.ts.
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { fault } from "../core/fault";
import { SwFormatter } from "./formatter";
import { SW_COMMENT, SW_LINEBREAK, SW_START, SwTokList } from "./token";

export const SW_DIRECTIVES_OK: i32 = 0;
// A fatal error (an unknown or empty directive): SwiftFormat rejects the file.
export const SW_DIRECTIVES_FATAL: i32 = 1;
// Something this port does not handle (an options directive, non-ASCII rule names).
export const SW_DIRECTIVES_UNSUPPORTED: i32 = 2;

/** Whether any comment holds `swiftformat:` (a directive, or a sort comment). */
export const swHasDirectiveText = (t: SwTokList): boolean => {
  const ks = t.k;
  const ss = t.s;
  if (ss.length < ks.length) {
    fault();
    return false;
  }
  for (let i = 0; i < ks.length && i < ss.length; i++) {
    if (ks[i] === SW_COMMENT && ss[i].indexOf("swiftformat:") >= 0) {
      return true;
    }
  }
  return false;
};

/** Whether any comment holds `swiftformat:sort` (sortDeclarations is not ported). */
export const swHasSortDirective = (t: SwTokList): boolean => {
  const ks = t.k;
  const ss = t.s;
  if (ss.length < ks.length) {
    fault();
    return false;
  }
  for (let i = 0; i < ks.length && i < ss.length; i++) {
    if (ks[i] === SW_COMMENT && ss[i].indexOf("swiftformat:sort") >= 0) {
      return true;
    }
  }
  return false;
};

/** An ASCII string lowercased. */
const swAsciiLowercased = (s: string): string => {
  const parts: string[] = [];
  for (let i = 0; i < toI32(s.length); i++) {
    const d = s.charCodeAt(i);
    parts.push(String.fromCharCode(d >= 65 && d <= 90 ? d + 32 : d));
  }
  return parts.join("");
};

const swIsWordByte = (c: i32): boolean =>
  (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;

/** directiveRuleNames(in:) as " a b " (lowercased words); null when a name is not ASCII. */
const swDirectiveRuleNames = (s: string): string | null => {
  const parts: string[] = [];
  let start = -1;
  const n = toI32(s.length);
  // n is a string length, so i < 2147483647 changes nothing.
  for (let i = 0; i <= n && i < 2147483647; i++) {
    const c = i < n ? s.charCodeAt(i) : 32;
    if (c >= 128) {
      // CharacterSet.alphanumerics and Unicode lowercasing are not ported.
      return null;
    }
    if (swIsWordByte(c)) {
      if (start < 0) {
        start = i;
      }
    } else if (start >= 0) {
      const w = swAsciiLowercased(s.substring(start, i));
      if (parts.indexOf(w) < 0) {
        parts.push(w);
      }
      start = -1;
    }
  }
  return parts.length === 0 ? " " : ` ${parts.join(" ")} `;
};

/** s.components(separatedBy: sep) for a one-byte separator. */
const swComponents = (s: string, sep: i32): string[] => {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < toI32(s.length); i++) {
    if (s.charCodeAt(i) === sep) {
      out.push(s.substring(start, i));
      start = i + 1;
    }
  }
  out.push(s.substring(start));
  return out;
};

/** processDirectives(): fills the formatter's directive arrays; answers SW_DIRECTIVES_OK or why not. */
export const swProcessDirectives = (f: SwFormatter): i32 => {
  let line = 1;
  let lineIndex = 0;
  let tokenIndex = 0;
  const n = f.count();
  for (let i = 0; i < n; i++) {
    const k = f.k(i);
    if (k === SW_LINEBREAK) {
      // A linebreak's aux is its line number, below the token count: the sum is exact.
      line = toI32(toU32(f.a(i)) + 1);
      lineIndex = i;
      tokenIndex = 0;
      continue;
    }
    if (k === SW_START && f.s(i) === "//") {
      tokenIndex = 0;
      continue;
    }
    if (k === SW_START && f.s(i) === "/*") {
      // 0 <= lineIndex <= i: the u32 difference is exact.
      tokenIndex = toI32(toU32(i) - toU32(lineIndex));
      continue;
    }
    if (k !== SW_COMMENT) {
      continue;
    }
    const body = f.s(i);
    const at = body.indexOf("swiftformat:");
    if (at < 0) {
      continue;
    }
    // at < body.length: the u32 sum is exact.
    const comment = body.substring(toI32(toU32(at) + 12));
    const words = swComponents(comment, 32);
    if (words.length < 1) {
      fault();
      return SW_DIRECTIVES_UNSUPPORTED;
    }
    const parts = swComponents(words[0], 58);
    const rest: string[] = [];
    for (let w = 1; w < toI32(words.length); w++) {
      rest.push(words[w]);
    }
    parts.push(rest.join(" "));
    if (parts.length < 2) {
      fault();
      return SW_DIRECTIVES_UNSUPPORTED;
    }
    const directive = parts[0];
    const first = parts[1];
    if (directive.length === 0) {
      return SW_DIRECTIVES_FATAL;
    }
    let p = 1;
    let toggle = true;
    // Line numbers stay near the token count: the u32 sums are exact.
    if (first === "next") {
      line = toI32(toU32(line) + 1);
      tokenIndex = 0;
      toggle = false;
      p = 2;
    } else if (first === "previous") {
      line = toI32(toU32(line) - 1);
      tokenIndex = 0;
      toggle = false;
      p = 2;
    } else if (first === "this") {
      tokenIndex = 0;
      toggle = false;
      p = 2;
    }
    const argParts: string[] = [];
    for (let q = p; q < toI32(parts.length); q++) {
      argParts.push(parts[q]);
    }
    const args = argParts.join(":");
    let type = 0;
    if (directive === "options") {
      // Options directives change formatting options; only the defaults are ported.
      return SW_DIRECTIVES_UNSUPPORTED;
    } else if (directive === "disable") {
      type = 1;
    } else if (directive === "enable") {
      type = 0;
    } else if (directive === "sort") {
      continue;
    } else {
      return SW_DIRECTIVES_FATAL;
    }
    const names = swDirectiveRuleNames(args);
    if (names === null) {
      return SW_DIRECTIVES_UNSUPPORTED;
    }
    f.dirType.push(type);
    f.dirToggle.push(toggle);
    f.dirLine.push(line);
    f.dirIndex.push(tokenIndex);
    f.dirNames.push(names);
  }
  return SW_DIRECTIVES_OK;
};

/** FormatRules.directiveNames(for:) as " a b ": the lowercased name and the names renamed to it. */
export const swRuleDirectiveNames = (rule: string): string => {
  const lower = swAsciiLowercased(rule);
  let old = "";
  if (rule === "privateSwiftUIDynamicProperties") {
    old = "privatestatevariables ";
  } else if (rule === "redundantVariable") {
    old = "redundantproperty ";
  } else if (rule === "sortImports") {
    old = "sortedimports ";
  } else if (rule === "sortSwitchCases") {
    old = "sortedswitchcases ";
  } else if (rule === "modifierOrder") {
    old = "specifiers ";
  } else if (rule === "noForceTryInTests") {
    old = "throwingtests ";
  }
  return ` ${lower} ${old}`;
};

// Every ported rule follows SwiftFormat's enablement (forEachToken skipping, parseDeclarations,
// parseImports, isEnabled and updateEnablement calls), checked by inserting disable/enable,
// disable:next and disable:this directives (naming the rule, and `all`) near the lines each rule
// changes in corpus files and comparing with swiftformat. A rule listed here would make a file
// whose directives name it skip instead.
const SW_DIRECTIVE_UNSAFE_RULES: string = " ";

export const swRuleHonoursDirectives = (rule: string): boolean => SW_DIRECTIVE_UNSAFE_RULES.indexOf(` ${rule} `) < 0;
