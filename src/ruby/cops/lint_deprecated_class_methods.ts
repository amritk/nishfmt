// Lint/DeprecatedClassMethods.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_SELECTOR, NT_CONST, NT_FALSE, NT_SEND, NT_TRUE, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS, ssxGlobalConst, ssxIs, ssxMeth } from "./style_syntax_help";

/** ConstNode#short_name of a receiver ("" when it is not a constant). */
const ldcmShort = (src: RbSource, r: i32): string => (ssxIs(src, r, NT_CONST) ? src.a.text(src.a.kid(r, 1)) : "");

/** PREFERRED_METHODS. */
const ldcmPreferred = (m: string): string => {
  if (m === "clone" || m === "dup") {
    return "to_h";
  }
  if (m === "exists?") {
    return "exist?";
  }
  if (m === "gethostbyaddr") {
    return "Addrinfo#getnameinfo";
  }
  if (m === "gethostbyname") {
    return "Addrinfo.getaddrinfo";
  }
  if (m === "iterator?") {
    return "block_given?";
  }
  return "";
};

export class CopLintDeprecatedClassMethods {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/DeprecatedClassMethods");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIs(src, n, NT_SEND) || !this.deprecated(src, n)) {
        continue;
      }
      const r = a.kid(n, 0);
      const m = ssxMeth(src, n);
      const short = ldcmShort(src, r);
      const dirEnvFile = short === "Dir" || short === "ENV" || short === "File";
      let s = ssxFS(src, n, F_SELECTOR);
      let e = ssxFE(src, n, F_SELECTOR);
      if (short === "Socket" || dirEnvFile) {
        s = a.exS(n);
      } else if (m === "attr") {
        s = a.exS(n);
        e = a.exE(n);
      }
      const k = this.c.offense(s, e);
      if (k === null || short === "Socket") {
        continue;
      }
      if (m === "freeze") {
        k.replace(a.exS(n), a.exE(n), "ENV");
      } else {
        let prefer = ldcmPreferred(m);
        if (m === "attr") {
          const acc = src.nodeSrc(a.kid(n, 3)) === "true" ? "attr_accessor" : "attr_reader";
          prefer = `${acc} ${src.nodeSrc(a.kid(n, 2))}`;
        } else if (dirEnvFile) {
          prefer = prefer.length > 0 ? `${src.nodeSrc(r)}.${prefer}` : "ENV";
        }
        k.replace(s, e, prefer);
      }
      this.c.commit(k);
    }
  }

  /** deprecated_class_method?. */
  private deprecated(src: RbSource, n: i32): boolean {
    const a = src.a;
    const r = a.kid(n, 0);
    const m = ssxMeth(src, n);
    const argc = a.nKid(n) - 2;
    if (ssxGlobalConst(src, r, "ENV")) {
      return argc === 0 && (m === "clone" || m === "dup" || m === "freeze");
    }
    if (ssxGlobalConst(src, r, "File") || ssxGlobalConst(src, r, "Dir")) {
      return m === "exists?" && argc === 1;
    }
    if (ssxGlobalConst(src, r, "Socket")) {
      return m === "gethostbyaddr" || m === "gethostbyname";
    }
    if (r !== V_NIL) {
      return false;
    }
    if (m === "attr") {
      return argc === 2 && (ssxIs(src, a.kid(n, 3), NT_TRUE) || ssxIs(src, a.kid(n, 3), NT_FALSE));
    }
    return m === "iterator?" && argc === 0;
  }
}
