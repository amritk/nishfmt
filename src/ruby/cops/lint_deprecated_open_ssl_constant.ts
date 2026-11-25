// Lint/DeprecatedOpenSSLConstant.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { rbNKid } from "../node";
import {
  F_DOT,
  F_DOUBLE_COLON,
  F_NAME,
  F_SELECTOR,
  NT_CONST,
  NT_CVAR,
  NT_GVAR,
  NT_IVAR,
  NT_LVAR,
  NT_SEND,
  NT_STR,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS, ssxGlobalConst, ssxIs, ssxIsCall, ssxMeth } from "./style_syntax_help";

/** String#downcase (ASCII). */
const ldocDown = (s: string): string => {
  const out: string[] = [];
  for (let i = 0; i < toI32(s.length); i++) {
    const c = s.charCodeAt(i);
    out.push(c >= 65 && c <= 90 ? String.fromCharCode(c + 32) : s.substring(i, i + 1));
  }
  return out.join("");
};

/** String#upcase (ASCII). */
const ldocUp = (s: string): string => {
  const out: string[] = [];
  for (let i = 0; i < toI32(s.length); i++) {
    const c = s.charCodeAt(i);
    out.push(c >= 97 && c <= 122 ? String.fromCharCode(c - 32) : s.substring(i, i + 1));
  }
  return out.join("");
};

/** String#split('-') (trailing empty fields dropped). */
const ldocSplit = (s: string, out: string[]): void => {
  const parts: string[] = [];
  let st = 0;
  const k = toI32(s.length);
  for (let i = 0; i < k; i++) {
    if (s.charCodeAt(i) === 45) {
      parts.push(s.substring(st, i));
      st = i + 1;
    }
  }
  parts.push(s.substring(st, k));
  while (parts.length > 0) {
    const pl = toI32(parts.length);
    if (pl < 1 || parts[pl - 1].length !== 0) {
      break;
    }
    parts.pop();
  }
  for (const p of parts) {
    out.push(p);
  }
};

const ldocNoArg = (s: string): boolean => s === "BF" || s === "DES" || s === "IDEA" || s === "RC4";

export class CopLintDeprecatedOpenSSLConstant {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/DeprecatedOpenSSLConstant");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (!ssxIs(src, n, NT_SEND)) {
        continue;
      }
      const m = ssxMeth(src, n);
      if (m !== "new" && m !== "digest") {
        continue;
      }
      let skip = false;
      for (let i = 2; i < a.nKid(n); i++) {
        const x = a.kid(n, i);
        const t = a.type(x);
        if (t === NT_IVAR || t === NT_GVAR || t === NT_CVAR || t === NT_LVAR || ssxIsCall(src, x) || t === NT_CONST) {
          skip = true;
        }
      }
      const r = a.kid(n, 0);
      if (skip || !ssxIs(src, r, NT_CONST) || a.text(a.kid(r, 1)) === "Digest") {
        continue;
      }
      // algorithm_const
      const ns = a.kid(r, 0);
      if (!ssxIs(src, ns, NT_CONST)) {
        continue;
      }
      const cls = a.text(a.kid(ns, 1));
      if (!(cls === "Cipher" || cls === "Digest") || !ssxGlobalConst(src, a.kid(ns, 0), "OpenSSL")) {
        continue;
      }
      const repl = this.replacementArgs(src, n, r);
      if (repl === null) {
        continue;
      }
      const k = this.c.offense(a.exS(n), a.exE(n));
      if (k === null) {
        continue;
      }
      k.remove(ssxFS(src, r, F_DOUBLE_COLON), ssxFE(src, r, F_DOUBLE_COLON));
      k.remove(ssxFS(src, r, F_NAME), ssxFE(src, r, F_NAME));
      k.replace(
        ssxFE(src, n, F_DOT),
        a.exE(n),
        `${src.src(ssxFS(src, n, F_SELECTOR), ssxFE(src, n, F_SELECTOR))}(${repl})`,
      );
      this.c.commit(k);
    }
  }

  /** replacement_args, or null where RuboCop raises. */
  private replacementArgs(src: RbSource, n: i32, x: i32): string | null {
    const a = src.a;
    const argc = rbNKid(src, n) - 2;
    if (src.nodeSrc(x) === "OpenSSL::Cipher::Cipher") {
      return argc > 0 ? src.nodeSrc(a.kid(n, 2)) : null;
    }
    const klass = src.nodeSrc(a.kid(x, 0));
    let name = src.src(ssxFS(src, x, F_NAME), ssxFE(src, x, F_NAME));
    if (klass === "OpenSSL::Cipher" && !ldocNoArg(name)) {
      // name.scan(/.{3}/).join('-'): whole groups of three characters
      const groups: string[] = [];
      const nl = toI32(name.length);
      for (let i = 0; i <= nl - 3; i += 3) {
        groups.push(name.substring(i, i + 3));
      }
      name = groups.join("-");
    }
    if (klass !== "OpenSSL::Cipher") {
      const parts: string[] = [`'${name}'`];
      for (let i = 2; i < a.nKid(n); i++) {
        parts.push(src.nodeSrc(a.kid(n, i)));
      }
      return parts.join(", ");
    }
    // build_cipher_arguments
    const algo: string[] = [];
    ldocSplit(ldocDown(name), algo);
    if (algo.length === 0) {
      return null;
    }
    const sizeMode: string[] = [];
    for (let i = 2; i < a.nKid(n); i++) {
      const arg = a.kid(n, i);
      const v = ssxIs(src, arg, NT_STR) ? a.text(a.kid(arg, 0)) : src.nodeSrc(arg);
      const kept: string[] = [];
      for (let j = 0; j < toI32(v.length); j++) {
        const c = v.charCodeAt(j);
        if (c !== 58 && c !== 39) {
          kept.push(v.substring(j, j + 1));
        }
      }
      const parts: string[] = [];
      ldocSplit(kept.join(""), parts);
      for (const p of parts) {
        sizeMode.push(ldocDown(p));
      }
    }
    // algo is not empty (checked above).
    const a0 = algo.length > 0 ? algo[0] : "";
    if (ldocNoArg(ldocUp(a0)) && argc === 0) {
      return `'${a0}'`;
    }
    const all: string[] = [];
    for (const p of algo) {
      all.push(p);
    }
    for (const p of sizeMode) {
      all.push(p);
    }
    if (sizeMode.length === 0) {
      all.push("cbc");
    }
    const take: string[] = [];
    for (let i = 0; i < toI32(all.length) && i < 3; i++) {
      take.push(all[i]);
    }
    return `'${take.join("-")}'`;
  }
}
