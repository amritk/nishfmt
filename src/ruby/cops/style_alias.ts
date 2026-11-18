// Style/Alias (EnforcedStyle: prefer_alias).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_KEYWORD,
  F_SELECTOR,
  NT_ALIAS,
  NT_CLASS,
  NT_DEF,
  NT_DEFS,
  NT_DSYM,
  NT_GVAR,
  NT_MODULE,
  NT_SEND,
  NT_SYM,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import {
  ssxArgs,
  ssxArgument,
  ssxAssignment,
  ssxCommand,
  ssxFE,
  ssxFS,
  ssxIdentLike,
  ssxIs,
  ssxIsAnyBlock,
  ssxMeth,
} from "./style_syntax_help";

/** scope_type: 0 lexical, 1 dynamic, 2 instance_eval. */
const ssxAliasScope = (src: RbSource, n0: i32): i32 => {
  let n = n0;
  let p = src.parent(n);
  while (p !== V_NIL) {
    const t = src.a.type(p);
    if (t === NT_CLASS || t === NT_MODULE) {
      return 0;
    }
    if (t === NT_DEF || t === NT_DEFS) {
      return 1;
    }
    if (ssxIsAnyBlock(src, p)) {
      return ssxMeth(src, src.a.kid(p, 0)) === "instance_eval" ? 2 : 1;
    }
    n = p;
    p = src.parent(n);
  }
  return 0;
};

/** The symbol's value (sym nodes only). */
const ssxAliasValue = (src: RbSource, n: i32): string => src.a.text(src.a.kid(n, 0));

/** bareword?: the source does not start with `:`, or a dsym. */
const ssxAliasBareword = (src: RbSource, n: i32): boolean => !src.nodeSrc(n).startsWith(":") || ssxIs(src, n, NT_DSYM);

/** bareword_symbol? */
const ssxAliasBarewordSymbol = (src: RbSource, n: i32): boolean => {
  if (!ssxIs(src, n, NT_SYM)) {
    return false;
  }
  const v = ssxAliasValue(src, n);
  if (ssxIdentLike(v, "?!=")) {
    return true;
  }
  const s = src.nodeSrc(n);
  return !s.startsWith(':"') && !s.startsWith(":'") && !v.startsWith("@") && !v.startsWith("$");
};

/** identifier: `:value` for a bareword symbol, else the source. */
const ssxAliasIdentifier = (src: RbSource, n: i32): string =>
  ssxAliasBarewordSymbol(src, n) ? `:${ssxAliasValue(src, n)}` : src.nodeSrc(n);

export class CopStyleAlias {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/Alias");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_SEND) {
        this.onSend(src, n);
      } else if (t === NT_ALIAS) {
        this.onAlias(src, n);
      }
    }
  }

  private onSend(src: RbSource, n: i32): void {
    const a = src.a;
    if (!ssxCommand(src, n, "alias_method")) {
      return;
    }
    if (ssxAliasScope(src, n) === 1) {
      return;
    }
    const args = ssxArgs(src, n);
    for (const x of args) {
      if (!ssxIs(src, x, NT_SYM)) {
        return;
      }
    }
    if (args.length !== 2) {
      return;
    }
    if (ssxArgument(src, n) || ssxAssignment(src, src.parent(n))) {
      return;
    }
    const k = this.c.offense(ssxFS(src, n, F_SELECTOR), ssxFE(src, n, F_SELECTOR));
    if (k !== null) {
      k.replace(a.exS(n), a.exE(n), `alias ${ssxAliasIdentifier(src, args[0])} ${ssxAliasIdentifier(src, args[1])}`);
      this.c.commit(k);
    }
  }

  private onAlias(src: RbSource, n: i32): void {
    const a = src.a;
    // alias_method_possible?
    const scope = ssxAliasScope(src, n);
    if (scope === 2) {
      return;
    }
    const nw = a.kid(n, 0);
    const old = a.kid(n, 1);
    if (ssxIs(src, nw, NT_GVAR) || ssxIs(src, old, NT_GVAR)) {
      return;
    }
    let p = src.parent(n);
    while (p !== V_NIL) {
      if (a.type(p) === NT_DEF) {
        return;
      }
      p = src.parent(p);
    }
    if (scope === 1) {
      const k = this.c.offense(ssxFS(src, n, F_KEYWORD), ssxFE(src, n, F_KEYWORD));
      if (k !== null) {
        k.replace(a.exS(n), a.exE(n), `alias_method ${ssxAliasIdentifier(src, nw)}, ${ssxAliasIdentifier(src, old)}`);
        this.c.commit(k);
      }
      return;
    }
    if (
      ssxAliasBareword(src, nw) ||
      !ssxAliasBarewordSymbol(src, nw) ||
      ssxAliasBareword(src, old) ||
      !ssxAliasBarewordSymbol(src, old)
    ) {
      return;
    }
    const k = this.c.offense(a.exS(nw), a.exE(old));
    if (k !== null) {
      k.replace(a.exS(nw), a.exE(nw), ssxAliasValue(src, nw));
      k.replace(a.exS(old), a.exE(old), ssxAliasValue(src, old));
      this.c.commit(k);
    }
  }
}
