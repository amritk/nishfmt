// Style/HashSyntax (EnforcedStyle: ruby19, EnforcedShorthandSyntax: either).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_OPERATOR, F_SELECTOR, NT_DSYM, NT_HASH, NT_RETURN, NT_SYM, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { rbSpaceEnd } from "../help";
import { rnBraces, rnE, rnHas, rnIsArgument, rnPairs, rnS } from "../node";
import { RbSource } from "../source";

/** acceptable_19_syntax_symbol? of a key's source without its colon. */
const rbAcceptable19 = (name: string): boolean => {
  const k = toI32(name.length);
  if (k === 0) {
    return false;
  }
  // /\A[_a-z]\w*[?!]?\z/i
  const c0 = name.charCodeAt(0);
  let plain = c0 === 95 || (c0 >= 97 && c0 <= 122) || (c0 >= 65 && c0 <= 90);
  if (plain) {
    for (let i = 1; i < k; i++) {
      const c = name.charCodeAt(i);
      const w = c === 95 || (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57);
      if (!w && !(i === k - 1 && (c === 63 || c === 33))) {
        plain = false;
        break;
      }
    }
  }
  if (plain) {
    return true;
  }
  return (name.startsWith("'") && name.endsWith("'")) || (name.startsWith('"') && name.endsWith('"'));
};

export class CopStyleHashSyntax {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/HashSyntax");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_HASH) {
        continue;
      }
      const pairs = rnPairs(src, n);
      if (pairs.length === 0) {
        continue;
      }
      // ruby19_check: only when every key is a symbol the 1.9 syntax can write.
      let all = true;
      for (const p of pairs) {
        const key = a.kid(p, 0);
        const kt = a.type(key);
        if (kt !== NT_SYM && kt !== NT_DSYM) {
          all = false;
          break;
        }
        let ks = src.nodeSrc(key);
        if (ks.startsWith(":")) {
          ks = ks.substring(1, toI32(ks.length));
        }
        if (!rbAcceptable19(ks)) {
          all = false;
          break;
        }
      }
      if (!all) {
        continue;
      }
      for (const p of pairs) {
        const os = rnS(src, p, F_OPERATOR);
        const oe = rnE(src, p, F_OPERATOR);
        if (oe - os !== 2) {
          continue; // a colon pair
        }
        const k = this.c.offense(a.exS(p), oe);
        if (k === null) {
          continue;
        }
        // autocorrect_ruby19
        const key = a.kid(p, 0);
        const ks = a.exS(key);
        const re = rbSpaceEnd(src, oe, 2, true, false, false);
        const keySrc = src.nodeSrc(key);
        let space = "";
        const par = src.parent(n);
        if (rnIsArgument(src, n) && rnHas(src, par, F_SELECTOR) && a.exS(n) === rnE(src, par, F_SELECTOR)) {
          space = " ";
        }
        if (keySrc.startsWith(":") && keySrc.indexOf("\n") < 0) {
          k.replace(ks, re, `${space}${keySrc.substring(1, toI32(keySrc.length))}: `);
        } else {
          k.replace(ks, re, src.src(ks, re));
        }
        if (par !== V_NIL && a.type(par) === NT_RETURN && !rnBraces(src, n) && p === pairs[0]) {
          k.wrap(a.exS(n), a.exE(n), "{", "}");
        }
        this.c.commit(k);
      }
    }
  }
}
