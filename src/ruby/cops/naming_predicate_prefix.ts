// Naming/PredicatePrefix (detection only; NamePrefix and ForbiddenPrefixes:
// [is_, has_, have_, does_], AllowedMethods: [is_a?], MethodDefinitionMacros:
// [define_method, define_singleton_method], UseSorbetSigs: false, Exclude:
// spec/**/*; without a project index, overrides_inherited_method? is false).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_NAME, NT_DEF, NT_DEFS, NT_SEND, NT_SYM, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxDefName, ssxFE, ssxFS } from "./style_syntax_help";

/** Exclude `spec/**\/*` (relative to the working directory; `*` and `**` skip dot names). */
const nppExcluded = (path0: string): boolean => {
  let path = path0;
  while (path.startsWith("./")) {
    path = path.substring(2, toI32(path.length));
  }
  if (!path.startsWith("spec/") || path.length <= 5) {
    return false;
  }
  let a = 5;
  for (let i = 5; i <= toI32(path.length); i++) {
    if (i < toI32(path.length) && path.charCodeAt(i) !== 47) {
      continue;
    }
    if (i > a && path.charCodeAt(a) === 46) {
      return false;
    }
    a = i + 1;
  }
  return true;
};

/** expected_name: the prefix dropped (every prefix is forbidden), with a `?`. */
const nppExpected = (name: string, prefix: string): string => {
  const i = name.indexOf(prefix);
  const s = i >= 0 ? `${name.substring(0, i)}${name.substring(i + toI32(prefix.length), toI32(name.length))}` : name;
  return name.endsWith("?") ? s : `${s}?`;
};

/** allowed_method_name? */
const nppAllowed = (name: string, prefix: string): boolean => {
  const k = toI32(prefix.length);
  // /^prefix[^0-9]/ (at the start, given start_with?)
  const matches = name.startsWith(prefix) && toI32(name.length) > k && !(name.charCodeAt(k) >= 48 && name.charCodeAt(k) <= 57);
  return !matches || name === nppExpected(name, prefix) || name.endsWith("=") || name === "is_a?";
};

/** NamePrefix. */
const nppPrefixes = (): string[] => ["is_", "has_", "have_", "does_"];

export class CopNamingPredicatePrefix {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Naming/PredicatePrefix");
  }
  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    if (nppExcluded(src.p.st.path)) {
      return;
    }
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_DEF || t === NT_DEFS) {
        const name = ssxDefName(src, n);
        for (const p of nppPrefixes()) {
          if (!nppAllowed(name, p)) {
            this.c.offense(ssxFS(src, n, F_NAME), ssxFE(src, n, F_NAME));
          }
        }
      } else if (t === NT_SEND && a.kid(n, 0) === V_NIL && a.nKid(n) >= 3) {
        const m = a.text(a.kid(n, 1));
        const first = a.kid(n, 2);
        if ((m !== "define_method" && m !== "define_singleton_method") || !a.isNode(first) || a.type(first) !== NT_SYM) {
          continue;
        }
        const name = a.text(a.kid(first, 0));
        for (const p of nppPrefixes()) {
          if (!nppAllowed(name, p)) {
            this.c.offense(a.exS(first), a.exE(first));
          }
        }
      }
    }
  }
}
