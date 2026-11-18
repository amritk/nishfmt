// Lint/UselessElseWithoutRescue: `else` without `rescue`, which the cop reads
// from the parser's :useless_else diagnostic. The cop declares
// `maximum_target_ruby_version 2.5`; even where a `# rubocop:enable` comment
// opts it in, the Ruby 3.3 parser reports that `else` as a syntax error, so a
// file that has one is never inspected and the cop never has an offense. It
// is here so that Lint/RedundantCopDisableDirective knows a directive naming
// it is redundant.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { RbCop } from "../cop";
import { RbSource } from "../source";

export class CopLintUselessElseWithoutRescue {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/UselessElseWithoutRescue");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
  }
}
