---
name: Upgrade the C++ reference to clang-format 23.1.5
overview: nishfmt's C++ formatter matches clang-format 18.1.3 today; move it to clang-format 23.1.5 (same lib/Format as 23.1.6) with the style unchanged, by porting each decision clang-format changed, so every file that matched under 18 matches under 23.
stages:
  - id: cpp23-spacing
    title: "fix(cpp): match clang-format 23's spacing decisions"
    goal: The spacing categories in the Spacing section match clang-format 23.1.5, with no file regressing.
    verification: npm run build && npm test && npm run lint && bash bench/corpus/cmp.sh dist/nishfmt cpp && test -z "$(grep -vxF -f $TMPDIR/cf23plan/differ-base-23.txt bench/work/out/cpp/differ.txt)"
    todos:
      - id: spacing-setup
        content: Build the 23.1.5 C++ corpus and reproduce the base result of 9835 / 10343 — see Corpus setup
        status: pending
      - id: spacing-fix
        content: Port each spacing decision in src/cpp/classify.ts (lexer.ts, tok.ts where needed) from clang-format 23's TokenAnnotator — see Spacing
        status: pending
      - id: spacing-cases
        content: Add tests/cases/cf23_spacing_<name>.cpp and .expected per fix, and regenerate operator_macro_parameter.expected with 23.1.5 — see Regression cases
        status: pending
  - id: cpp23-breaking
    title: "fix(cpp): match clang-format 23's line-break decisions"
    goal: The line-breaking categories in the Breaking section match clang-format 23.1.5, with no file regressing.
    verification: npm run build && npm test && npm run lint && bash bench/corpus/cmp.sh dist/nishfmt cpp && test -z "$(grep -vxF -f $TMPDIR/cf23plan/differ-base-23.txt bench/work/out/cpp/differ.txt)"
    todos:
      - id: breaking-setup
        content: Build the 23.1.5 C++ corpus and reproduce the base result of 9835 / 10343 — see Corpus setup
        status: pending
      - id: breaking-fix
        content: Port each break decision in src/cpp/annotate.ts and src/cpp/indenter.ts from clang-format 23's TokenAnnotator and ContinuationIndenter — see Breaking
        status: pending
      - id: breaking-cases
        content: Add tests/cases/cf23_breaking_<name>.cpp and .expected per fix — see Regression cases
        status: pending
  - id: cpp23-lines
    title: "fix(cpp): match clang-format 23's line joining, comments and preprocessor handling"
    goal: The unwrapped-line, joining, comment and preprocessor categories in the Lines section match clang-format 23.1.5, with no file regressing.
    verification: npm run build && npm test && npm run lint && bash bench/corpus/cmp.sh dist/nishfmt cpp && test -z "$(grep -vxF -f $TMPDIR/cf23plan/differ-base-23.txt bench/work/out/cpp/differ.txt)"
    todos:
      - id: lines-setup
        content: Build the 23.1.5 C++ corpus and reproduce the base result of 9835 / 10343 — see Corpus setup
        status: pending
      - id: lines-fix
        content: Port each decision in src/cpp/format.ts and src/cpp/parser.ts from clang-format 23's UnwrappedLineParser, UnwrappedLineFormatter and BreakableToken — see Lines
        status: pending
      - id: lines-cases
        content: Add tests/cases/cf23_lines_<name>.cpp and .expected per fix, and regenerate the five existing .expected files listed in Lines with 23.1.5 — see Regression cases
        status: pending
  - id: cpp23-finish
    title: "feat(cpp): match clang-format 23.1.5"
    goal: Every file that matched clang-format 18.1.3 matches 23.1.5, the match rate is at least 99.6%, --width and --indent hold, and every place that names the version says 23.1.5.
    verification: npm run build && npm test && npm run lint && bash bench/corpus/cmp.sh dist/nishfmt cpp && test -z "$(grep -vxF -f $TMPDIR/cf23plan/differ-18.txt bench/work/out/cpp/differ.txt)" && bash $TMPDIR/cf23plan/width-indent.sh
    todos:
      - id: finish-residual
        content: Fix every file still in differ.txt that is not in differ-18.txt, wherever in src/cpp its decision lives — see Finish
        status: pending
      - id: finish-cases
        content: Add tests/cases/cf23_finish_<name>.cpp and .expected per fix, and check every C++ .expected equals clang-format 23.1.5 output — see Regression cases
        status: pending
      - id: finish-width-indent
        content: Run the --width 100 --indent 4 check and fix what regressed — see Finish
        status: pending
      - id: finish-versions
        content: Name clang-format 23.1.5 in README.md, docs/cpp.md, docs/porting.md, docs/benchmarks.md, THIRD_PARTY_NOTICES.md, tests/run.sh, bench/corpus/mk.sh and the src/main.ts help line, with the new corpus numbers — see Version mentions
        status: pending
---

# Upgrade the C++ reference to clang-format 23.1.5

## Context

[src/cpp](src/cpp) is a rewrite, not a port, that makes clang-format's decisions for `{BasedOnStyle: LLVM, ColumnLimit: 120}`. Against clang-format 18.1.3 the C++ corpus is 10,305 of 10,343 identical (the 38 left are [differ-18.txt](.claude/plans/clang-format-23/differ-18.txt)). Against 23.1.5 the same binary gets **9,835 of 10,343**: 487 reference files changed, and **472 files that matched under 18 no longer match** ([regressed.txt](.claude/plans/clang-format-23/regressed.txt)). Six of the 47 C++ regression cases also change under 23.

**Why 23.1.5.** PyPI has no 23.1.6 wheel. Between the `llvmorg-23.1.5` and `llvmorg-23.1.6` tags nothing changed under `clang/lib/Format`, `clang/include/clang/Format`, `clang/tools/clang-format`, `clang/lib/Lex` or `clang/lib/Basic` (`git diff --stat` is empty), so 23.1.5 formats identically. The docs say 23.1.5 and note that.

**Root causes.** [categories.md](.claude/plans/clang-format-23/categories.md) groups every differing hunk of the 472 files into 49 categories, with a 18/23 snippet confirmed on both binaries and the per-category file list. Its clang-format source attributions are inferred, not read: they are pointers, and the worker reads clang-format 23's source (`git fetch --depth 1 https://github.com/llvm/llvm-project llvmorg-23.1.5`, `clang/lib/Format/`) to find the code that decides each one and ports that decision. 423 of the 472 files have one category; 49 have two or three.

## Approach

- **Port the decision, not the corpus.** For each category, find the clang-format 23 function that decides the whitespace (TokenAnnotator::spaceRequiredBetween, mustBreakBefore, splitPenalty, ContinuationIndenter, UnwrappedLineFormatter::tryMerge*, UnwrappedLineParser, BreakableToken, WhitespaceManager) and the change since 18 (`git log llvmorg-18.1.3..llvmorg-23.1.5 -- clang/lib/Format/<file>` helps), and make nishfmt make it. A fix that makes a category's files match by a pattern the reference does not use is wrong even if the count goes up.
- **Never guess.** A construct a fix cannot handle exactly makes `formatCpp` answer `false` rather than emit wrong output (CLAUDE.md).
- **Three stages by module, then one that finishes.** The three fix stages own disjoint files so they run at once. A category whose decision lives in a file another stage owns is left alone and named in the PR body; `cpp23-finish` owns all of `src/cpp` and picks up whatever is left, including the singletons and the categories that span modules.
- **No regressions, file by file.** Each fix stage's gate is that its `differ.txt` is a subset of the base's ([differ-base-23.txt](.claude/plans/clang-format-23/differ-base-23.txt), 508 files): a file the base matches must still match. The finish stage's gate is a subset of [differ-18.txt](.claude/plans/clang-format-23/differ-18.txt).

## Corpus setup

Every stage, once, from the repo root. `bench/work/` is gitignored. Fetch the plan's data directory first:

```bash
mkdir -p $TMPDIR/cf23plan && git fetch origin feature/clang-format-23/plan
for f in categories.md differ-18.txt differ-base-23.txt regressed.txt width-indent.sh; do git show origin/feature/clang-format-23/plan:.claude/plans/clang-format-23/$f > $TMPDIR/cf23plan/$f; done
```

Then the C++ repositories only, clang-format 23.1.5, and the reference (about 5 minutes on 4 cores):

```bash
mkdir -p $TMPDIR/cf && cp bench/corpus/fetch.sh $TMPDIR/cf/ && grep '^cpp ' bench/corpus/repos.txt > $TMPDIR/cf/repos.txt
REPOS=$PWD/bench/work/repos bash $TMPDIR/cf/fetch.sh
python3 -m venv $TMPDIR/cf23 && $TMPDIR/cf23/bin/pip install -q clang-format==23.1.5
mkdir -p $TMPDIR/cfbin && ln -sf $TMPDIR/cf23/bin/clang-format $TMPDIR/cfbin/clang-format
PATH=$TMPDIR/cfbin:$PATH bash bench/corpus/mk.sh cpp     # must print: cpp: 10343 files, reference failed on 0
npm run build && bash bench/corpus/cmp.sh dist/nishfmt cpp  # on the base: cpp: 9835 / 10343 identical
```

Use `$TMPDIR/cf23/bin/clang-format` for every `.expected` file. Leave `CORPUS` and `WORK` at their defaults (`cmp.sh` breaks on relative overrides). Keep `$TMPDIR/cf23plan` out of the checkout.

## Spacing

**Owns:** `src/cpp/classify.ts`, `src/cpp/lexer.ts`, `src/cpp/tok.ts`, `tests/cases/cf23_spacing_*`, `tests/cases/operator_macro_parameter.expected`

| category | files |
| --- | ---: |
| braced-init-space-after-name (`T x {}` → `T x{}`) | 33 |
| funcref-paren-space (`int(&)[N]` → `int (&)[N]`) | 23 |
| cast-unary-operand-space (`(T) *p` → `(T)*p`) | 13 |
| space-before-scope-op (`X ::y` → `X::y`) | 10 |
| ptr-qualifier-macro-space (`T * absl_nonnull` → `T *absl_nonnull`) | 9 |
| empty-body-semicolon-space (`){};` → `) {};`) | 8 |
| operator-macro-param-ref-space (`operator OP(R& a)`) | 6 |
| pp-warning-space (`#warning (`) | 4 |
| rvalue-ref-pack-space (`Args &&...`) | 3 |
| macro-asm-token-space (`vld3.8`) | 2 |
| arrow-space-after-paren, braced-temp-arrow, template-close-space, placement-new-space | 1 each |

The classify half of macro-body-braced-list (`{a, b}` spacing in a `#define` body) belongs here only if the parser half in Lines is not needed for it; otherwise leave it to `cpp23-lines` or `cpp23-finish`.

## Breaking

**Owns:** `src/cpp/annotate.ts`, `src/cpp/indenter.ts`, `src/cpp/doc.ts`, `tests/cases/cf23_breaking_*`

| category | files |
| --- | ---: |
| shift-literal-break-kept (source newline before `<<` between string literals is kept) | 113 |
| trailing-return-break (break before `->`, not in the parameter list) | 59 |
| braced-list-one-per-line | 15 |
| class-attr-break | 7 |
| ternary-chain-alignment | 6 |
| assign-break | 5 |
| break-before-name-after-decl-macro, template-template-param-break, macro-call-paren-break | 4 each |
| va-args-arg-break, closing-brace-list-indent | 3 each |
| inline-block-comment-attach, lambda-trailing-return-indent | 2 each |
| attribute-between-type-and-name-break, decl-break-before-trailing-line-comment, decl-return-type-ref-break, braced-list-after-assign-comment | 1 each |

## Lines

**Owns:** `src/cpp/format.ts`, `src/cpp/parser.ts`, `src/cpp/run.ts`, `tests/cases/cf23_lines_*`, `tests/cases/attributes_and_records.expected`, `tests/cases/blocks_and_comment_levels.expected`, `tests/cases/blocks_operators_annotations.expected`, `tests/cases/macro_statements.expected`, `tests/cases/statements_and_requires.expected`

| category | files |
| --- | ---: |
| standalone-block-split (bare `{ stmt; }` and `{}` no longer merged) | 59 |
| comment-indent-adjacent-pp | 25 |
| decl-after-pp-guarded-attribute | 18 |
| macro-body-braced-list (parser half) | 15 |
| indent-reset-after-unterminated-macro | 9 |
| doxygen-comment-reflow | 8 |
| label-then-block-break | 6 |
| indent-misc-after-macro-or-pp, cppcx-handle-declarations | 5 each |
| comment-star-prefix-space, line-comment-space-after-slashes | 4 each |
| angle-bracket-ternary-misparse | 3 |
| label-in-macro-body-break | 2 |
| record-attr-macro-split, include-sort-in-unterminated-comment, indent-in-pp-branch-body, macro-lambda-struct-va-args-unformatted | 1 each |

The five existing cases change under 23: `attributes_and_records` (`}  // NOLINT` → `} // NOLINT` after a merged body), `blocks_and_comment_levels` (comment indentation), and `blocks_operators_annotations`, `macro_statements`, `statements_and_requires` (standalone blocks). If one of them turns out to be decided in a file this stage does not own, say so in the PR body and leave it to `cpp23-finish`.

## Finish

Starts after `cpp23-spacing`, `cpp23-breaking` and `cpp23-lines` have merged (or escalated), from the default branch.

**Owns:** `src/cpp/**`, `tests/cases/cf23_finish_*`, `tests/cases/*.expected`, `tests/run.sh`, `bench/corpus/mk.sh`, `README.md`, `docs/cpp.md`, `docs/porting.md`, `docs/benchmarks.md`, `THIRD_PARTY_NOTICES.md`, `src/main.ts`

- **Residual.** Every file in `differ.txt` that is not in `differ-18.txt`: the categories the fix stages left (each of their PR bodies names them), the files with two or three categories, and the 12 singletons. If one cannot be matched exactly, the PR is a draft that names it; do not fit it.
- **Every C++ `.expected` is 23.1.5's.** For each `tests/cases/*.cpp` with an `.expected`, `$TMPDIR/cf23/bin/clang-format --style='{BasedOnStyle: LLVM, ColumnLimit: 120}' --assume-filename=x.cpp < f.cpp` equals the `.expected`.
- **--width and --indent.** `width-indent.sh` formats leveldb, googletest and abseil-cpp (1,167 files) with `nishfmt --width 100 --indent 4` and with clang-format 23.1.5 `{BasedOnStyle: LLVM, ColumnLimit: 100, IndentWidth: 4}`, and fails if more than 4 files differ (4 is the 18.1.3 baseline; 23.1.5 on the base binary gives 65).
- **Match rate.** The final `cmp.sh` prints at least 10,302 of 10,343 identical (99.6%).

## Version mentions

Every place that names clang-format 18 as the reference, in `cpp23-finish`:

| file | line today |
| --- | --- |
| [README.md](README.md) | the languages table row (version and `99.6% of 10,344`, from the new count), and the help output under "Usage" |
| [docs/cpp.md](docs/cpp.md) | "matches `clang-format` 18", "against clang-format 18.1.3", the corpus count paragraph (10344 / 10306 / 38 / 26) |
| [docs/benchmarks.md](docs/benchmarks.md) | the reference-tools row and the C++ corpus-results row |
| [docs/porting.md](docs/porting.md) | the C++ row |
| [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) | the C++ row |
| [tests/run.sh](tests/run.sh), [bench/corpus/mk.sh](bench/corpus/mk.sh) | header comments |
| [src/main.ts](src/main.ts) | the `--help` line `clang-format 18, LLVM style` (string only) |

**The src/main.ts gate (decided at sign-off).** CLAUDE.md asks every language's corpus gate for a change to `src/main.ts`. For this one string literal, the maintainer chose build, `npm test`, `npm run lint`, CI's smoke run and the C++ gate only: no code path any other language takes changes. Change nothing in `src/main.ts` but that string, and say in the PR body that the other seven gates were not run, and why.

Where the exact version is pinned (benchmarks.md, cpp.md), say 23.1.5 and that 23.1.6 has the same `lib/Format` and formats identically. The per-repository table in docs/cpp.md (bitcoin, godot and others not in the corpus) was measured against 18.1.3: label it so rather than restate numbers that were not re-measured. `src/cpp` has no comment naming the version today; check again after the fix stages.

## Regression cases

Per CLAUDE.md, every fix lands with a case that fails without it. One case per category fixed: `tests/cases/cf23_<stage>_<category>.cpp`, a minimal input, and `<same>.expected` from `$TMPDIR/cf23/bin/clang-format --style='{BasedOnStyle: LLVM, ColumnLimit: 120}'`. Show in the PR body that each fails on the base binary. `tests/run.sh` also checks that formatting the `.expected` leaves it unchanged.

## Out of scope

- Supporting clang-format 18 and 23 side by side (a version switch).
- Other languages, `src/gdoc`, `src/core`, and any change to `src/main.ts` beyond the help string.
- Re-measuring the per-repository table in docs/cpp.md.
- The 38 files that already differed under 18, except where a fix happens to settle one.

## Verification

Each stage's `verification` line, from the repo root after Corpus setup. CI (`.github/workflows/ci.yml`) runs lint, build, `npm test` and a smoke run; it cannot run the corpus gate, so the worker runs `cmp.sh` itself and pastes its output line and the `differ.txt` check into the PR body.
