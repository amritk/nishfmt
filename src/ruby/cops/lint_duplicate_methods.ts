// Lint/DuplicateMethods (no project index, ActiveSupportExtensionsEnabled:
// false; no correction). A fresh cop per file, so only duplicates within the
// file count.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { rbNKid } from "../node";
import { add32, atI32 } from "../../core/arr";
import {
  F_KEYWORD,
  F_NAME,
  NT_ALIAS,
  NT_BEGIN,
  NT_BLOCK,
  NT_CASE,
  NT_CASE_MATCH,
  NT_CASGN,
  NT_CLASS,
  NT_CONST,
  NT_CSEND,
  NT_DEF,
  NT_DEFS,
  NT_ENSURE,
  NT_IF,
  NT_IVASGN,
  NT_LVASGN,
  NT_MODULE,
  NT_NUMBLOCK,
  NT_RESCUE,
  NT_SCLASS,
  NT_SELF,
  NT_SEND,
  NT_STR,
  NT_SYM,
  NT_TRUE,
  V_NIL,
} from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import {
  lbhAncestor,
  lbhAnyConst,
  lbhConstName,
  lbhDefinedModule,
  lbhParentModuleName,
  lbhReceiver,
  lbhSexp,
} from "./lint_batch_help";
import { ssxAttributeAccessor, ssxDefName, ssxFE, ssxFS, ssxIs, ssxMeth } from "./style_syntax_help";

/** {sym str}: a sym or str node. */
const ldmSymStr = (src: RbSource, n: i32): boolean => ssxIs(src, n, NT_SYM) || ssxIs(src, n, NT_STR);

/** humanize_scope's sub(/(?:(?<name>.*)::)#<Class:\k<name>>|#<Class:(?<name>.*)>(?:::)?/, '\k<name>.'). */
const ldmHumanizeSub = (s: string): string => {
  const k = toI32(s.length);
  const mark = "#<Class:";
  for (let p = 0; p < k; p++) {
    // Alternative 1: name `::#<Class:` name `>`, the longest name first.
    for (let len = k - p; len >= 0; len--) {
      const ne = add32(p, len);
      const name = s.substring(p, ne);
      const tail = `::${mark}${name}>`;
      const te = add32(ne, toI32(tail.length));
      if (te <= k && s.substring(ne, te) === tail) {
        return `${s.substring(0, p)}${name}.${s.substring(te, k)}`;
      }
    }
    // Alternative 2: `#<Class:` name `>` with the last `>`, then an optional `::`.
    const p8 = add32(p, 8);
    if (s.substring(p, p8) === mark) {
      let gt = -1;
      for (let q = p8; q >= 0 && q < k; q++) {
        if (s.charCodeAt(q) === 62) {
          gt = q;
        }
      }
      if (gt >= 0) {
        let end = add32(gt, 1);
        if (s.substring(end, add32(end, 2)) === "::") {
          end = add32(end, 2);
        }
        return `${s.substring(0, p)}${s.substring(p8, gt)}.${s.substring(end, k)}`;
      }
    }
  }
  return s;
};

/** humanize_scope. */
const ldmHumanize = (scope: string): string => {
  const s = ldmHumanizeSub(scope);
  return s.endsWith(".") ? s : `${s}#`;
};

/** class_or_module_new_block?: (block (send (const _ {:Class :Module}) :new ...) ...). */
const ldmClassOrModuleNewBlock = (src: RbSource, n: i32, names: string): boolean => {
  if (!ssxIs(src, n, NT_BLOCK)) {
    return false;
  }
  const s = src.a.kid(n, 0);
  return ssxIs(src, s, NT_SEND) && ssxMeth(src, s) === "new" && lbhAnyConst(src, src.a.kid(s, 0), names);
};

/** qualified_name(enclosing, namespace, mod_name); enclosing null is nil. */
const ldmQualifiedName = (src: RbSource, enclosing: string | null, ns: i32, mod: string): string => {
  const nsName = ns === V_NIL ? "" : lbhConstName(src, ns);
  if (enclosing === null || enclosing !== "Object") {
    const enc = enclosing === null ? "" : enclosing;
    return ns !== V_NIL ? `${enc}::${nsName}::${mod}` : `${enc}::${mod}`;
  }
  return ns !== V_NIL ? `${nsName}::${mod}` : mod;
};

export class CopLintDuplicateMethods {
  c: RbCop;
  defs: Set<string>;
  scopes: Set<string>;

  constructor() {
    this.c = new RbCop("Lint/DuplicateMethods");
    this.defs = new Set<string>();
    this.scopes = new Set<string>();
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    this.defs = new Set<string>();
    this.scopes = new Set<string>();
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (t === NT_DEF) {
        if (!this.insideIf(src, n)) {
          this.foundInstanceMethod(src, n, ssxDefName(src, n));
        }
      } else if (t === NT_DEFS) {
        if (this.insideIf(src, n)) {
          continue;
        }
        const r = a.kid(n, 0);
        if (ssxIs(src, r, NT_CONST)) {
          this.foundMethod(src, n, `${this.lookupConstant(src, n, a.text(a.kid(r, 1)))}.${ssxDefName(src, n)}`, null);
        } else if (ssxIs(src, r, NT_SELF)) {
          this.checkSelfReceiver(src, n, ssxDefName(src, n));
        }
      } else if (t === NT_ALIAS) {
        const nm = a.kid(n, 0);
        const og = a.kid(n, 1);
        if (!ssxIs(src, nm, NT_SYM) || !ssxIs(src, og, NT_SYM)) {
          continue;
        }
        const name = a.text(a.kid(nm, 0));
        if (name === a.text(a.kid(og, 0)) || this.insideIf(src, n)) {
          continue;
        }
        this.foundInstanceMethod(src, n, name);
      } else if (t === NT_SEND) {
        this.onSend(src, n);
      }
    }
  }

  /** inside_condition?: an if, case or case_match ancestor. */
  private insideIf(src: RbSource, n: i32): boolean {
    return (
      lbhAncestor(src, n, NT_IF) !== V_NIL ||
      lbhAncestor(src, n, NT_CASE) !== V_NIL ||
      lbhAncestor(src, n, NT_CASE_MATCH) !== V_NIL
    );
  }

  private onSend(src: RbSource, n: i32): void {
    const a = src.a;
    if (a.kid(n, 0) !== V_NIL) {
      return;
    }
    const m = ssxMeth(src, n);
    const argc = rbNKid(src, n) - 2;
    // alias_method?: (send nil? :alias_method (sym $_name) (sym $_original_name))
    if (m === "alias_method" && argc === 2 && ssxIs(src, a.kid(n, 2), NT_SYM) && ssxIs(src, a.kid(n, 3), NT_SYM)) {
      const name = a.text(a.kid(a.kid(n, 2), 0));
      if (name === a.text(a.kid(a.kid(n, 3), 0)) || this.insideIf(src, n)) {
        return;
      }
      this.foundInstanceMethod(src, n, name);
      return;
    }
    if (ssxAttributeAccessor(src, n)) {
      this.onAttr(src, n, m);
      return;
    }
    // delegator?
    if ((m === "def_delegator" || m === "def_instance_delegator") && (argc === 2 || argc === 3)) {
      let ok = true;
      for (let i = 2; i < a.nKid(n); i++) {
        if (!ldmSymStr(src, a.kid(n, i))) {
          ok = false;
        }
      }
      if (ok) {
        if (!this.insideIf(src, n)) {
          this.foundInstanceMethod(src, n, a.text(a.kid(a.kid(n, -1), 0)));
        }
        return;
      }
    }
    // delegators?
    if ((m === "def_delegators" || m === "def_instance_delegators") && argc >= 2) {
      let ok = true;
      for (let i = 2; i < a.nKid(n); i++) {
        if (!ldmSymStr(src, a.kid(n, i))) {
          ok = false;
        }
      }
      if (ok) {
        if (this.insideIf(src, n)) {
          return;
        }
        for (let i = 3; i < a.nKid(n); i++) {
          this.foundInstanceMethod(src, n, a.text(a.kid(a.kid(n, i), 0)));
        }
      }
    }
  }

  private onAttr(src: RbSource, n: i32, m: string): void {
    const a = src.a;
    const args: i32[] = [];
    for (let i = 2; i < a.nKid(n); i++) {
      args.push(a.kid(n, i));
    }
    let readable = false;
    let writable = false;
    let use = args;
    if (m === "attr") {
      writable = args.length === 2 && ssxIs(src, args[1], NT_TRUE);
      readable = true;
      const first: i32[] = [atI32(args, 0)];
      use = first;
    } else if (m === "attr_reader") {
      readable = true;
    } else if (m === "attr_writer") {
      writable = true;
    } else {
      readable = true;
      writable = true;
    }
    for (const arg of use) {
      if (!ssxIs(src, arg, NT_SYM)) {
        continue;
      }
      const name = a.text(a.kid(arg, 0));
      if (readable) {
        this.foundInstanceMethod(src, n, name);
      }
      if (writable) {
        this.foundInstanceMethod(src, n, `${name}=`);
      }
    }
  }

  private checkSelfReceiver(src: RbSource, n: i32, name: string): void {
    const enclosing = lbhParentModuleName(src, n);
    if (enclosing !== null) {
      this.foundMethod(src, n, `${enclosing}.${name}`, null);
      return;
    }
    const anon = this.anonymousClassBlock(src, n);
    if (anon !== V_NIL) {
      const scope = ldmQualifiedName(src, lbhParentModuleName(src, anon), V_NIL, "Object");
      this.foundMethod(src, n, `${scope}.${name}`, this.anonScopeId(src, anon));
    }
  }

  private foundInstanceMethod(src: RbSource, n: i32, name: string): void {
    const scope = lbhParentModuleName(src, n);
    if (scope !== null) {
      this.foundMethod(src, n, `${ldmHumanize(scope)}${name}`, null);
      return;
    }
    const anon = this.anonymousClassBlock(src, n);
    if (anon !== V_NIL) {
      const base = ldmQualifiedName(src, lbhParentModuleName(src, anon), V_NIL, "Object");
      const sc = lbhAncestor(src, n, NT_SCLASS) !== V_NIL ? `#<Class:${base}>` : base;
      this.foundMethod(src, n, `${ldmHumanize(sc)}${name}`, this.anonScopeId(src, anon));
      return;
    }
    // found_sclass_method
    const sing = lbhAncestor(src, n, NT_SCLASS);
    if (sing === V_NIL) {
      return;
    }
    const recv = src.a.kid(sing, 0);
    if (!ssxIs(src, recv, NT_SEND)) {
      return;
    }
    this.foundMethod(src, n, `${ssxMeth(src, recv)}.${name}`, null);
  }

  /** anonymous_class_block (V_NIL: none). */
  private anonymousClassBlock(src: RbSource, n: i32): i32 {
    const a = src.a;
    const first = lbhAncestor(src, n, NT_BLOCK);
    if (first === V_NIL || !ldmClassOrModuleNewBlock(src, first, "Class,Module")) {
      return V_NIL;
    }
    const fp = src.parent(first);
    if (fp !== V_NIL && a.type(fp) === NT_LVASGN) {
      return V_NIL;
    }
    let p = src.parent(n);
    while (p !== V_NIL) {
      if (a.type(p) === NT_SCLASS && !ssxIs(src, a.kid(p, 0), NT_SELF)) {
        return V_NIL;
      }
      p = src.parent(p);
    }
    return first;
  }

  /** anon_block_scope_id (null: nil). */
  private anonScopeId(src: RbSource, anon: i32): string | null {
    const a = src.a;
    const parent = src.parent(anon);
    if (parent === V_NIL) {
      return null;
    }
    const t = a.type(parent);
    const isCall = t === NT_SEND || t === NT_CSEND;
    if (
      !(
        t === NT_BLOCK ||
        t === NT_NUMBLOCK ||
        t === NT_BEGIN ||
        isCall ||
        t === NT_CASGN ||
        t === NT_IVASGN ||
        t === NT_DEF ||
        t === NT_DEFS
      )
    ) {
      return null;
    }
    // scope_receiver: none for a Class.new block under a call; else named_receiver.
    if (!(ldmClassOrModuleNewBlock(src, anon, "Class") && isCall)) {
      const recv = lbhReceiver(src, parent);
      if (recv !== V_NIL && !ldmClassOrModuleNewBlock(src, recv, "Class,Module")) {
        return `${src.nodeSrc(recv)}.${this.methodName(src, parent)}`;
      }
    }
    const pp = src.parent(parent);
    if (t !== NT_BEGIN || (pp !== V_NIL && (a.type(pp) === NT_BLOCK || a.type(pp) === NT_NUMBLOCK))) {
      return `@${src.line(a.exS(anon))}:${a.exS(anon)}`;
    }
    return null;
  }

  /** method_name of the parent kinds anon_block_scope_id accepts. */
  private methodName(src: RbSource, n: i32): string {
    const a = src.a;
    const t = a.type(n);
    if (t === NT_SEND || t === NT_CSEND) {
      return ssxMeth(src, n);
    }
    if (t === NT_DEF || t === NT_DEFS) {
      return ssxDefName(src, n);
    }
    if (t === NT_BLOCK || t === NT_NUMBLOCK) {
      return this.methodName(src, a.kid(n, 0));
    }
    return "";
  }

  /** lookup_constant: the qualified name, or the node's sexp when no ancestor defines it. */
  private lookupConstant(src: RbSource, n: i32, constName: string): string {
    const a = src.a;
    let p = src.parent(n);
    while (p !== V_NIL) {
      const t = a.type(p);
      if (t === NT_CLASS || t === NT_MODULE || t === NT_CASGN) {
        const dm = lbhDefinedModule(src, p);
        let ns = dm.length > 0 ? dm[0] : V_NIL;
        let mod = dm.length > 0 ? a.text(atI32(dm, 1)) : "";
        let has = dm.length > 0;
        while (true) {
          if (has && mod === constName) {
            return ldmQualifiedName(src, lbhParentModuleName(src, p), ns, mod);
          }
          if (ns === V_NIL) {
            break;
          }
          // namespace, mod_name = *namespace
          if (ssxIs(src, ns, NT_CONST)) {
            const next = a.kid(ns, 0);
            mod = a.text(a.kid(ns, 1));
            has = true;
            ns = next;
          } else {
            ns = V_NIL;
            has = false;
          }
        }
      }
      p = src.parent(p);
    }
    // each_ancestor returns the node itself: its to_s.
    return lbhSexp(src, n);
  }

  /** found_method. */
  private foundMethod(src: RbSource, n: i32, methodName: string, scopeId: string | null): void {
    const a = src.a;
    let key = methodName;
    let p = src.parent(n);
    while (p !== V_NIL) {
      const t = a.type(p);
      if (t === NT_DEF || t === NT_DEFS) {
        key = `${ssxDefName(src, p)}.${methodName}`;
        break;
      }
      p = src.parent(p);
    }
    if (scopeId !== null) {
      key = `${key}@${scopeId}`;
    }
    let scope = "";
    p = src.parent(n);
    while (p !== V_NIL) {
      const t = a.type(p);
      if (t === NT_RESCUE) {
        scope = "rescue";
        break;
      }
      if (t === NT_ENSURE) {
        scope = "ensure";
        break;
      }
      p = src.parent(p);
    }
    if (!this.defs.has(key)) {
      this.defs.add(key);
      return;
    }
    const sk = `${scope}\n${key}`;
    if (scope.length > 0 && !this.scopes.has(sk)) {
      this.scopes.add(sk);
      return;
    }
    const t = a.type(n);
    if (t === NT_DEF || t === NT_DEFS) {
      this.c.offense(ssxFS(src, n, F_KEYWORD), ssxFE(src, n, F_NAME));
    } else {
      this.c.offense(a.exS(n), a.exE(n));
    }
  }
}
