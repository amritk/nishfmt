// Small RuboCop::AST predicates the detection-only Lint cops share
// (Lint/NonLocalExitFromIterator, Lint/SafeNavigationChain,
// Lint/UnreachableLoop, ...): node type sets, nil's methods, the Enumerable
// method names, and a few NodePattern pieces.
//
// Ported from RuboCop 1.92.2 and rubocop-ast 1.51.0 (MIT License, Copyright
// (c) 2012-24 Bozhidar Batsov).

import {
  NT_AND,
  NT_ARRAY,
  NT_BEGIN,
  NT_BLOCK,
  NT_CASE,
  NT_CASGN,
  NT_CASE_MATCH,
  NT_CBASE,
  NT_COMPLEX,
  NT_CONST,
  NT_CSEND,
  NT_CVAR,
  NT_DEF,
  NT_DEFS,
  NT_DSTR,
  NT_DSYM,
  NT_ERANGE,
  NT_FALSE,
  NT_FLOAT,
  NT_FOR,
  NT_GVAR,
  NT_HASH,
  NT_IF,
  NT_INT,
  NT_IRANGE,
  NT_IVAR,
  NT_LVAR,
  NT_NIL,
  NT_NUMBLOCK,
  NT_OR,
  NT_RATIONAL,
  NT_REGEXP,
  NT_REGOPT,
  NT_SEND,
  NT_STR,
  NT_SYM,
  NT_TRUE,
  NT_UNTIL,
  NT_UNTIL_POST,
  NT_WHILE,
  NT_WHILE_POST,
  NT_XSTR,
  V_NIL,
} from "../ast";
import { RbSource } from "../source";
import { LdhDirective, LdhRegistry } from "./lint_directive_help";
import { RX_GROUP, rbRxParsedTree } from "./style_regexp_help";
import { ssxInList } from "./style_syntax_help";

/** The type of h, or -1 when it is not a node. */
export const ldhType = (src: RbSource, h: i32): i32 => (src.a.isNode(h) ? src.a.type(h) : -1);

/** Node#literal? (LITERALS). */
export const ldhLiteral = (src: RbSource, n: i32): boolean => {
  const t = ldhType(src, n);
  return (
    t === NT_STR ||
    t === NT_DSTR ||
    t === NT_XSTR ||
    t === NT_INT ||
    t === NT_FLOAT ||
    t === NT_SYM ||
    t === NT_DSYM ||
    t === NT_ARRAY ||
    t === NT_HASH ||
    t === NT_REGEXP ||
    t === NT_TRUE ||
    t === NT_IRANGE ||
    t === NT_ERANGE ||
    t === NT_COMPLEX ||
    t === NT_RATIONAL ||
    t === NT_REGOPT ||
    t === NT_FALSE ||
    t === NT_NIL
  );
};

/** Node#variable? (ivar gvar cvar lvar). */
export const ldhVariable = (src: RbSource, n: i32): boolean => {
  const t = ldhType(src, n);
  return t === NT_IVAR || t === NT_GVAR || t === NT_CVAR || t === NT_LVAR;
};

/** any_def_type?: def or defs. */
export const ldhAnyDef = (src: RbSource, n: i32): boolean => {
  const t = ldhType(src, n);
  return t === NT_DEF || t === NT_DEFS;
};

/** Node#operator_keyword?: and, or. */
export const ldhOperatorKeyword = (src: RbSource, n: i32): boolean => {
  const t = ldhType(src, n);
  return t === NT_AND || t === NT_OR;
};

/** Node#conditional? (if while until case case_match). */
export const ldhConditional = (src: RbSource, n: i32): boolean => {
  const t = ldhType(src, n);
  return t === NT_IF || t === NT_WHILE || t === NT_UNTIL || t === NT_CASE || t === NT_CASE_MATCH;
};

/** Node#loop_keyword? (while until for while_post until_post). */
export const ldhLoopKeyword = (src: RbSource, n: i32): boolean => {
  const t = ldhType(src, n);
  return t === NT_WHILE || t === NT_UNTIL || t === NT_FOR || t === NT_WHILE_POST || t === NT_UNTIL_POST;
};

/** The nearest any_def ancestor of n, or V_NIL. */
export const ldhAncestorDef = (src: RbSource, n: i32): i32 => {
  let p = src.parent(n);
  while (p !== V_NIL) {
    if (ldhAnyDef(src, p)) {
      return p;
    }
    p = src.parent(p);
  }
  return V_NIL;
};

/** The nearest any_block ancestor of n, or V_NIL. */
export const ldhAncestorBlock = (src: RbSource, n: i32): i32 => {
  let p = src.parent(n);
  while (p !== V_NIL) {
    const t = src.a.type(p);
    if (t === NT_BLOCK || t === NT_NUMBLOCK) {
      return p;
    }
    p = src.parent(p);
  }
  return V_NIL;
};

/** `nil.methods` in RuboCop 1.92.2's process (Ruby 3.3.6, json and psych loaded). */
const LDH_NIL_METHODS: string =
  " ! != !~ & <=> == === =~ ^ __id__ __send__ class clone define_singleton_method display dup enum_for eql? equal? extend freeze frozen? hash inspect instance_eval instance_exec instance_of? instance_variable_defined? instance_variable_get instance_variable_set instance_variables is_a? itself kind_of? method methods nil? object_id private_methods protected_methods public_method public_methods public_send rationalize remove_instance_variable respond_to? send singleton_class singleton_method singleton_methods tap then to_a to_c to_enum to_f to_h to_i to_json to_r to_s to_yaml yield_self | ";

/** Whether m is one of nil's methods. */
export const ldhNilMethod = (m: string): boolean => m.indexOf(" ") < 0 && ssxInList(LDH_NIL_METHODS, m);

/** ENUMERABLE_METHODS (Enumerable.instance_methods + [:each]). */
const LDH_ENUMERABLE: string =
  " all? any? chain chunk chunk_while collect collect_concat compact count cycle detect drop drop_while each each_cons each_entry each_slice each_with_index each_with_object entries filter filter_map find find_all find_index first flat_map grep grep_v group_by include? inject lazy map max max_by member? min min_by minmax minmax_by none? one? partition reduce reject reverse_each select slice_after slice_before slice_when sort sort_by sum take take_while tally to_a to_h to_set uniq zip ";

/** ENUMERATOR_METHODS. */
const LDH_ENUMERATOR: string =
  " collect collect_concat detect downto each find find_all find_index inject loop map! map reduce reject reject! reverse_each select select! times upto ";

/** MethodIdentifierPredicates#enumerable_method?. */
export const ldhEnumerableMethod = (m: string): boolean => ssxInList(LDH_ENUMERABLE, m);

/** MethodIdentifierPredicates#enumerator_method?. */
export const ldhEnumeratorMethod = (m: string): boolean => ssxInList(LDH_ENUMERATOR, m) || m.startsWith("each_");

/** `(const {nil? cbase} :Name)` or nil? (no receiver): the Kernel-or-bare receivers of a flow command. */
export const ldhNilOrKernel = (src: RbSource, r: i32): boolean => {
  if (r === V_NIL) {
    return true;
  }
  if (ldhType(src, r) !== NT_CONST) {
    return false;
  }
  const ns = src.a.kid(r, 0);
  return (ns === V_NIL || ldhType(src, ns) === NT_CBASE) && src.a.text(src.a.kid(r, 1)) === "Kernel";
};

/** A send (not csend) node. */
export const ldhIsSend = (src: RbSource, n: i32): boolean => ldhType(src, n) === NT_SEND;

/** A csend node. */
export const ldhIsCsend = (src: RbSource, n: i32): boolean => ldhType(src, n) === NT_CSEND;

/** The comparison operators (Node::COMPARISON_OPERATORS). */
export const ldhComparison = (m: string): boolean => m === "==" || m === "===" || m === "!=" || m === "<=" || m === ">=" || m === ">" || m === "<";

/** MethodIdentifierPredicates#assignment_method?: not a comparison, ends with `=`. */
export const ldhAssignmentMethod = (m: string): boolean => !ldhComparison(m) && m.endsWith("=");

/** RegexpNode#interpolation?: a `begin` child. */
export const ldhInterpolation = (src: RbSource, n: i32): boolean => {
  for (let i = 0; i < src.a.nKid(n); i++) {
    if (ldhType(src, src.a.kid(n, i)) === NT_BEGIN) {
      return true;
    }
  }
  return false;
};

/**
 * each_capture(named: true).count and each_capture(named: false).count of a
 * regexp node, as [named, numbered]; [0, 0] when regexp_parser builds no tree.
 */
export const ldhCaptures = (src: RbSource, n: i32): i32[] => {
  const out: i32[] = [0, 0];
  const tree = rbRxParsedTree(src, n);
  if (tree === null) {
    return out;
  }
  for (let i = 0; i < toI32(tree.tt.length); i++) {
    if (tree.tt[i] !== RX_GROUP) {
      continue;
    }
    const t = tree.text(i);
    if (t === "(") {
      out[1] = out[1] + 1;
    } else if (t.startsWith("(?<") || t.startsWith("(?'")) {
      // Group::Named (a lookbehind is an assertion token, not a group)
      out[0] = out[0] + 1;
    }
  }
  return out;
};

/** Node#const_name of a const or casgn ("" when it has none). */
export const ldhConstName = (src: RbSource, n: i32): string => {
  const t = ldhType(src, n);
  if (t !== NT_CONST && t !== NT_CASGN) {
    return "";
  }
  const ns = src.a.kid(n, 0);
  const short = src.a.text(src.a.kid(n, 1));
  if (ns !== V_NIL && ldhType(src, ns) !== NT_CBASE) {
    // "#{namespace.const_name}::Name" (a namespace without one interpolates as "")
    return `${ldhConstName(src, ns)}::${short}`;
  }
  return short;
};

/** The whitespace-separated words of s (String#split). */
const ldhSplitWs = (s: string): string[] => {
  const out: string[] = [];
  let b = -1;
  for (let i = 0; i <= toI32(s.length); i++) {
    const c = i < toI32(s.length) ? s.charCodeAt(i) : 32;
    const ws = c === 32 || (c >= 9 && c <= 13);
    if (ws && b >= 0) {
      out.push(s.substring(b, i));
      b = -1;
    } else if (!ws && b < 0) {
      b = i;
    }
  }
  return out;
};

/**
 * CommentConfig#cop_opted_in?: a directive comment opts the cop in for this
 * file (`# rubocop:enable Name`, `enable-next`, or `+Name` in a push/next).
 * The Team then runs the cop whatever its configuration or
 * TargetRubyVersion support says (Team#roundup_relevant_cops).
 */
export const ldhOptedIn = (src: RbSource, reg: LdhRegistry, cop: string): boolean => {
  for (let ci = 0; ci < toI32(src.commS.length); ci++) {
    const d = new LdhDirective(src, ci);
    if (!d.ok || !d.hasCops) {
      continue;
    }
    if (d.mode === "push" || d.mode === "next") {
      // signed_args.fetch('+', []), each expanded and qualified
      for (const spec of ldhSplitWs(d.cops)) {
        if (!spec.startsWith("+")) {
          continue;
        }
        const name = spec.substring(1, toI32(spec.length));
        const names: string[] = reg.isDept(name) ? reg.namesForDept(name) : [name];
        for (const n of names) {
          if (reg.qualified(n) === cop) {
            return true;
          }
        }
      }
      continue;
    }
    if (!d.enabled() || d.allCops()) {
      continue;
    }
    const names = d.mode === "enable-next" ? d.copNames(reg) : d.rawCopNames();
    for (const n of names) {
      if (n === cop) {
        return true;
      }
    }
  }
  return false;
};
