// Lint/StructNewOverride (no correction): a `Struct.new` member named like
// one of Struct's own methods.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_SEND, NT_STR, NT_SYM } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ldhType } from "./lint_detect_help";
import { ssxGlobalConst, ssxInList, ssxMeth } from "./style_syntax_help";

/** STRUCT_METHOD_NAMES. */
const LSNO_METHODS: string =
  " ! != !~ <=> == === [] []= __id__ __send__ all? any? chain chunk chunk_while class clone collect collect_concat compact count cycle deconstruct deconstruct_keys define_singleton_method detect dig display drop drop_while dup each each_cons each_entry each_pair each_slice each_with_index each_with_object entries enum_for eql? equal? extend filter filter_map find find_all find_index first flat_map freeze frozen? grep grep_v group_by hash include? inject inspect instance_eval instance_exec instance_of? instance_variable_defined? instance_variable_get instance_variable_set instance_variables is_a? itself kind_of? lazy length map max max_by member? members method methods min min_by minmax minmax_by nil? none? object_id one? partition private_methods protected_methods public_method public_methods public_send reduce reject remove_instance_variable respond_to? reverse_each select send singleton_class singleton_method singleton_methods size slice_after slice_before slice_when sort sort_by sum take take_while tally tap then to_a to_enum to_h to_s to_set uniq values values_at yield_self zip ";

export class CopLintStructNewOverride {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/StructNewOverride");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) !== NT_SEND || ssxMeth(src, n) !== "new" || !ssxGlobalConst(src, a.kid(n, 0), "Struct")) {
        continue;
      }
      for (let i = 2; i < a.nKid(n); i++) {
        const arg = a.kid(n, i);
        const t = ldhType(src, arg);
        if (i === 2 && t === NT_STR) {
          continue;
        }
        if (t !== NT_SYM && t !== NT_STR) {
          continue;
        }
        const name = a.text(a.kid(arg, 0));
        if (name.indexOf(" ") < 0 && ssxInList(LSNO_METHODS, name)) {
          this.c.offense(a.exS(arg), a.exE(arg));
        }
      }
    }
  }
}
