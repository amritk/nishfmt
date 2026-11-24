// Migration/DepartmentName.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { faulted } from "../../core/fault";
import { rbAtOff } from "../help";
import { add32 } from "../../core/arr";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { LdhRegistry, ldhStrip } from "./lint_directive_help";

/** ConfigObsoletion.legacy_cop_names, in order. */
const MDN_LEGACY: string =
  " Layout/AlignArguments Layout/AlignArray Layout/AlignHash Layout/AlignParameters Layout/IndentArray Layout/IndentAssignment" +
  " Layout/IndentFirstArgument Layout/IndentFirstArrayElement Layout/IndentFirstHashElement Layout/IndentFirstParameter" +
  " Layout/IndentHash Layout/IndentHeredoc Layout/LeadingBlankLines Layout/Tab Layout/TrailingBlankLines Lint/BlockAlignment" +
  " Lint/DefEndAlignment Lint/DuplicatedKey Lint/EndAlignment Lint/EndInMethod Lint/Eval Lint/HandleExceptions Lint/MultipleCompare" +
  " Lint/StringConversionInInterpolation Lint/UnneededCopDisableDirective Lint/UnneededCopEnableDirective" +
  " Lint/UnneededRequireStatement Lint/UnneededSplatExpansion Metrics/LineLength Naming/PredicateName" +
  " Naming/UncommunicativeBlockParamName Naming/UncommunicativeMethodParamName Style/AccessorMethodName Style/AsciiIdentifiers" +
  " Style/ClassAndModuleCamelCase Style/ConstantName Style/DeprecatedHashMethods Style/FileName Style/FlipFlop" +
  " Style/MethodCallParentheses Style/MethodName Style/OpMethod Style/PredicateName Style/SingleSpaceBeforeFirstArg" +
  " Style/UnneededCapitalW Style/UnneededCondition Style/UnneededInterpolation Style/UnneededPercentQ Style/UnneededSort" +
  " Style/VariableName Style/VariableNumber Gemspec/DateAssignment Layout/SpaceAfterControlKeyword" +
  " Layout/SpaceBeforeModifierKeyword Lint/InvalidCharacterLiteral Lint/RescueWithoutErrorClass Lint/SpaceBeforeFirstArg" +
  " Lint/UselessComparison Style/BracesAroundHashParameters Style/DoubleCopDisableDirective Style/MethodMissingSuper" +
  " Style/SpaceAfterControlKeyword Style/SpaceBeforeModifierKeyword Style/TrailingComma Style/TrailingCommaInLiteral" +
  " Style/MethodMissing Performance/* Rails/* ";

const mdnWord = (c: i32): boolean => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;

const mdnAlpha = (c: i32): boolean => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);

/** /[A-Za-z]+\/[A-Za-z]+|all/ anywhere in s. */
const mdnCopsToken = (s: string): boolean => {
  if (s.indexOf("all") >= 0) {
    return true;
  }
  const k = toI32(s.length);
  for (let i = 1; i < k - 1; i++) {
    if (s.charCodeAt(i) === 47 && mdnAlpha(s.charCodeAt(i - 1)) && mdnAlpha(s.charCodeAt(i + 1))) {
      return true;
    }
  }
  return false;
};

/** The legacy cop name whose cop part is `name`, or "". */
const mdnLegacy = (name: string): string => {
  let i = 1;
  const k = toI32(MDN_LEGACY.length);
  while (i < k) {
    const sp = MDN_LEGACY.indexOf(" ", i);
    const full = MDN_LEGACY.substring(i, sp);
    const sl = full.indexOf("/");
    if (full.substring(add32(sl, 1), toI32(full.length)) === name) {
      return full;
    }
    i = add32(sp, 1);
    if (faulted()) {
      return "";
    }
  }
  return "";
};

export class CopMigrationDepartmentName {
  c: RbCop;

  // The registry, built on first use and kept across files.
  reg: LdhRegistry | null = null;

  constructor() {
    this.c = new RbCop("Migration/DepartmentName");
  }

  private registry(): LdhRegistry {
    const r = this.reg;
    if (r !== null) {
      return r;
    }
    const nr = new LdhRegistry();
    this.reg = nr;
    return nr;
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const commS = src.commS;
    const commE = src.commE;
    // src.at answers -1 outside [0, sn), which no test below matches.
    const sn = src.n;
    for (let ci = 0; ci < commS.length && ci < commE.length; ci++) {
      const cs = commS[ci];
      const ce = commE[ci];
      // DISABLE_COMMENT_FORMAT: /\A(# *rubocop *: *((dis|en)able|todo) +)(.*)/
      let p = cs;
      if (p >= sn || src.at(p) !== 35) {
        continue;
      }
      p++;
      while (p < sn && src.at(p) === 32) {
        p++;
      }
      if (src.src(p, add32(p, 7)) !== "rubocop") {
        continue;
      }
      p = add32(p, 7);
      while (p < sn && src.at(p) === 32) {
        p++;
      }
      if (p >= sn || src.at(p) !== 58) {
        continue;
      }
      p++;
      while (p < sn && src.at(p) === 32) {
        p++;
      }
      let ml = 0;
      if (src.src(p, add32(p, 7)) === "disable") {
        ml = 7;
      } else if (src.src(p, add32(p, 6)) === "enable") {
        ml = 6;
      } else if (src.src(p, add32(p, 4)) === "todo") {
        ml = 4;
      }
      if (ml === 0 || rbAtOff(src, p, ml) !== 32) {
        continue;
      }
      p = add32(p, ml);
      while (p < sn && src.at(p) === 32) {
        p++;
      }
      if (p > ce) {
        continue;
      }
      // $4.scan(/[^,]+|\W+/)
      let off = p;
      while (off < ce) {
        let q = off;
        if (src.at(q) !== 44) {
          while (q < ce && src.at(q) !== 44) {
            q++;
          }
        } else {
          while (q < ce && !mdnWord(src.at(q))) {
            q++;
          }
        }
        const name = src.src(off, q);
        const trimmed = ldhStrip(name);
        let valid = false;
        for (let i = 0; i < toI32(trimmed.length); i++) {
          if (!mdnWord(trimmed.charCodeAt(i))) {
            valid = true;
          }
        }
        if (!valid) {
          const r = this.registry();
          valid = mdnCopsToken(trimmed) || r.isDept(trimmed);
          if (!valid) {
            this.checkCopName(src, r, trimmed, off);
          }
        }
        let bad = false;
        for (let i = off; i < q; i++) {
          const c = src.at(i);
          if (!(mdnAlpha(c) || c === 47 || c === 44 || c === 32)) {
            bad = true;
          }
        }
        if (bad) {
          break;
        }
        off = q;
      }
    }
  }

  private checkCopName(src: RbSource, reg: LdhRegistry, name: string, start: i32): void {
    const e = add32(start, toI32(name.length));
    const k = this.c.offense(start, e);
    if (k === null) {
      return;
    }
    const cop = src.src(start, e);
    let q = "";
    if (reg.has(cop)) {
      q = cop;
    } else {
      let count = 0;
      for (const d of reg.depts) {
        if (reg.has(`${d}/${cop}`)) {
          q = `${d}/${cop}`;
          count = add32(count, 1);
        }
      }
      if (count > 1) {
        // AmbiguousCopName is raised.
        return;
      }
      if (count === 0) {
        q = cop;
      }
    }
    if (q.indexOf("/") < 0) {
      q = mdnLegacy(cop);
    }
    if (q.length === 0) {
      // replace(range, nil) raises.
      return;
    }
    k.replace(start, e, q);
    this.c.commit(k);
  }
}
