---
name: Remaining gaps — repos2 corpus, parser gaps, C++ long tail, Nish panic
overview: Add a second pinned corpus (repos2) and measure C++ against clang-format's settled output, then close the Rust, Dart, Swift and C++ gaps found on it, and reduce the release-build panic to a report for the Nish project. Six stages, one PR each; the Nish stage is a draft PR that is never merged.
stages:
  - id: bench-corpus2
    title: build(bench) — add a second pinned corpus and measure C++ against clang-format's settled output
    goal: repos2.txt and REPOLIST-aware fetch.sh and mk.sh build corpus2; RuboCop runs under UTF-8; cmp.sh cpp reports one-run and settled counts on both corpora; docs say which number is which
    verification: npm run lint && bash -n bench/corpus/fetch.sh bench/corpus/mk.sh bench/corpus/cmp.sh && test "$(wc -l < bench/corpus/repos2.txt)" -eq 81
    todos:
      - id: repos2-list
        content: Create bench/corpus/repos2.txt with the 81 pinned lines — see Bench corpus2
      - id: repolist-env
        content: Make fetch.sh and mk.sh read the list from REPOLIST, default repos.txt — see Bench corpus2
      - id: rubocop-utf8
        content: Run RuboCop under LANG=C.UTF-8 in mk.sh rb — see Bench corpus2
      - id: cpp-settled
        content: Make mk.sh cpp write ref-settled/ and unsettled.txt, and cmp.sh cpp report both counts — see C++ settled measurement
      - id: unstable-nine
        content: List and classify the repos2 files where clang-format is unstable and nishfmt matches neither run — see C++ settled measurement
      - id: bench-docs
        content: Document repos2 and the two C++ counts in docs/benchmarks.md, docs/cpp.md and README.md, and move every pointer to repos.txt — see Bench corpus2
  - id: rust-syntax
    title: fix(rust) — parse the syntax rustfmt formats but nishfmt skips
    goal: Each listed rust-analyzer input formats exactly as rustfmt 1.10.0 does, or stays skipped and is listed in tools/rust/NOTES.md with the reason, with rustc_parse's nearby rejections ported
    verification: npm run build && npm test && npm run lint && bash bench/corpus/cmp.sh dist/nishfmt rust && bash bench/corpus/cmp.sh dist/nishfmt rust2
    todos:
      - id: rust-tuple-index-dot
        content: Parse a tuple index followed by a dot and a space (x.0. await) — see Rust syntax
      - id: rust-paren-bounds
        content: Parse parenthesised bounds in a dyn or impl type — see Rust syntax
      - id: rust-generic-args
        content: Parse associated item constraints with generic args (Item<T> Bound, Item<T> = Item) — see Rust syntax
      - id: rust-super-let
        content: Parse super let — see Rust syntax
      - id: rust-fn-sugar-path
        content: Parse Fn::(i32) -> () and parenthesised-args path segments — see Rust syntax
      - id: rust-field-modifiers
        content: Parse unsafe and mut(...) field modifiers — see Rust syntax
      - id: rust-rtn
        content: Parse return type notation method::(..) in where clauses — see Rust syntax
      - id: rust-unsafe-static
        content: Parse pub unsafe static in an unsafe extern block — see Rust syntax
      - id: rust-bare-dyn
        content: Parse a bare dyn type (&dyn) — see Rust syntax
      - id: rust-gen-blocks
        content: Port gen blocks — see Rust syntax
      - id: rust-macro2
        content: Port macros 2.0 (macro m { ... }) — see Rust syntax
      - id: rust-const-async-bound
        content: Port for<'a> [const] async Trait bounds, or record why it stays skipped while the compiler panics — see Rust syntax
  - id: dart-parser
    title: fix(dart) — parse three Flutter forms dart format accepts
    goal: perf_tests.dart, ui_test.dart and app.dart from flutter at the repos2 commit format exactly as dart format 3.14.1 does, with the analyzer parser's nearby rejections ported
    verification: npm run build && npm test && npm run lint && for c in dart dart2 dart3 dart4 dart5 dart6; do bash bench/corpus/cmp.sh dist/nishfmt $c || exit 1; done
    todos:
      - id: dart-as-less-than
        content: Treat less-than after an as-type as the operator — see Dart parser
      - id: dart-unnamed-fn-param
        content: Accept a function-typed parameter with no name in an external declaration — see Dart parser
      - id: dart-null-assert-typeargs
        content: Accept explicit type arguments on a call after a null assertion — see Dart parser
  - id: swift-keycap
    title: fix(swift) — format keycap emoji in comments, or record why not
    goal: swift-syntax's Syntax+Assertions.swift matches SwiftFormat 0.64.7, or tools/swift/NOTES.md proves why the port cannot match digit FE0F 20E3
    verification: npm run build && npm test && npm run lint && bash bench/corpus/cmp.sh dist/nishfmt swift
    todos:
      - id: swift-keycap-rule
        content: Find the rule whose Unicode check refuses the file and settle digit FE0F 20E3 against the oracle — see Swift keycap
      - id: swift-keycap-tables
        content: Extend the Unicode tables and add a case, or document the skip in tools/swift/NOTES.md — see Swift keycap
  - id: nish-panic
    title: test(rust) — reduce the release-build panic for the Nish project
    goal: A minimal Nish program that panics only in the speed profile, with the flags that do and do not reproduce it and a draft issue for amritk/nish, on a draft PR that is never merged
    verification: bash tools/nish-panic/repro.sh
    todos:
      - id: nish-unsafe-audit
        content: Audit every nish unsafe use in src/ and the length-64 arrays on the panic path — see Nish panic
      - id: nish-reduce
        content: Reduce the panic to the smallest program and record each profile's output — see Nish panic
      - id: nish-issue-draft
        content: Write the draft issue and any proposed workaround in the PR body — see Nish panic
  - id: cpp-long-tail
    title: fix(cpp) — close the long tail on the repos2 corpus
    goal: The repos2 C++ differences shrink, by category largest first, each fix porting clang/lib/Format's decision at llvmorg-23.1.5, with no file newly differing on either corpus
    verification: npm run build && npm test && npm run lint && bash bench/corpus/cmp.sh dist/nishfmt cpp && CORPUS=bench/work/corpus2 WORK=bench/work/out2 bash bench/corpus/cmp.sh dist/nishfmt cpp
    todos:
      - id: cpp-classify
        content: Diff and classify every differing repos2 file, using the settled measurement — see C++ long tail
      - id: cpp-fix-categories
        content: Fix the categories largest first, one commit each with a failing case — see C++ long tail
      - id: cpp-docs
        content: Update the counts in docs/cpp.md and docs/benchmarks.md — see C++ long tail
---

# Remaining gaps

## Context

Source: the seven prompts in `remaining-prompts.md` (the four queued task cards are out of scope). [CLAUDE.md](../../CLAUDE.md) is the definition of done for every stage: build, `npm test`, `npm run lint`, the corpus gate for each language touched, a regression case that fails on the base binary with an input that differs from its `.expected`, skip cases as `skip_<name>.<ext>`, the reference's rejections ported with any new acceptance, and conventional commits.

There is no coverage tool in this repository. The coverage gate of the run is replaced by CLAUDE.md's: a failing-on-base regression case for every fix, and the corpus gates, which CI cannot run.

## Approach

| Stage | Prompt | Starts | Merge after |
| --- | --- | --- | --- |
| bench-corpus2 | 1 and 6 | now | — |
| rust-syntax | 2 | now | — |
| dart-parser | 3 | now | — |
| nish-panic | 7 | now | never merged (draft) |
| swift-keycap | 4 | when a slot frees | — |
| cpp-long-tail | 5 | after bench-corpus2 merges | bench-corpus2 |

Prompts 1 and 6 are one stage: 6 needs 1's `REPOLIST` support to start and both edit `bench/corpus/` and the same docs. Prompt 5 needs both, so it starts once that stage merges.

**Reference tools are not installed in a worker's container.** Each stage installs the ones its gate needs, into `$HOME/ref` or another path outside the checkout, at the exact versions in [docs/benchmarks.md](../../docs/benchmarks.md), "Reference tools". Reached from this environment: clang-format 23.1.5 (`pip install clang-format==23.1.5`), rustfmt (`rustup toolchain install 1.99.1 --component rustfmt`), the Dart SDK 3.14.1 zip from storage.googleapis.com, SwiftFormat 0.64.7 (`swiftformat_linux.zip` from its GitHub release), RuboCop 1.92.3 (`gem install rubocop -v 1.92.3`), google-java-format and CSharpier from Maven Central and NuGet. A corpus is built once per stage, under `bench/work/` (git-ignored), with `bash bench/corpus/fetch.sh` and `mk.sh` before any change, so `differ.txt` from the base binary exists to compare against.

## Bench corpus2

Prompt 1, verbatim requirements:

1. `bench/corpus/repos2.txt`, same `<lang> <owner/name> <commit>` format, exactly the 81 lines in the prompt (cpp ×9, java ×8, kt ×10, rb ×8, swift ×11, rust ×9, dart ×8, cs ×9 — copy them from the prompt, do not retype).
2. `fetch.sh` and `mk.sh` take the list from `$REPOLIST` (default `bench/corpus/repos.txt`), so `REPOLIST=bench/corpus/repos2.txt CORPUS=bench/work/corpus2 REPOS=bench/work/repos2 bash bench/corpus/mk.sh <lang>` builds the second corpus. `cmp.sh` already honours `$CORPUS` and `$WORK`.
3. `mk.sh rb` exports `LANG=C.UTF-8` before RuboCop (mastodon's `app/helpers/languages_helper.rb`: under US-ASCII Style/WordArray writes escapes; under UTF-8 it writes `%w[Amharic አማርኛ]`, which nishfmt matches).
4. [docs/benchmarks.md](../../docs/benchmarks.md) ("Building a corpus", "Corpus results") gains a repos2 table: measured on 2026-11-19 at main 9444d49, accepted / identical — C++ 13902 / 13796, Java 11914 / 11914, Kotlin 6219 / 6199, Swift 2140 / 2139, Rust 3606 / 3578, Dart 10675 / 10672, C# 18673 / 18673, Ruby 2000 / 2000. Rebuild and re-measure where the reference tool can be installed; where it cannot, keep the given number and say so in the PR body.
5. Grep docs, README.md and CLAUDE.md for `repos.txt` and update each mention (known: [docs/languages.md](../../docs/languages.md), [docs/porting.md](../../docs/porting.md), [tools/kotlin/NOTES.md](../../tools/kotlin/NOTES.md), the comments in `fetch.sh` and `mk.sh`).

## C++ settled measurement

Prompt 6. The C++ reference is one `clang-format -i` run, and clang-format 23.1.5 is not idempotent everywhere (main corpus: 27 of 36 differing files change on a second run; repos2: 32 of 106, nishfmt gives the settled output on 23 of them).

- `mk.sh cpp` also writes `ref-settled/` (clang-format rerun on its own output until it stops changing, at most 5 runs) and `unsettled.txt` (files that never settle).
- `cmp.sh` reports both counts for cpp: "identical to one run" and "identical to the settled output". README and docs/benchmarks.md say which number is which. The formatter does not change.
- What README's "Identical" column means was decided by the maintainer at sign-off: **it keeps its meaning, identical to one `clang-format -i` run**, and a note beside it gives the count identical to the settled output. docs/benchmarks.md gives both.
- List the files on repos2 where clang-format is unstable and nishfmt matches neither its first nor its second run (the prompt counts 9), classified like the stable differences, in docs/cpp.md. They are real gaps for cpp-long-tail.
- Run both C++ gates to confirm the new numbers.

**Owns:** `bench/corpus/**`, `docs/benchmarks.md`, `docs/cpp.md`, `docs/languages.md`, `docs/porting.md`, `README.md`, `CLAUDE.md`, `tools/kotlin/NOTES.md`

## Rust syntax

Prompt 2. All inputs come from rust-analyzer at aa198229289901e5718e7c0a8d4115638cc1900c (`crates/parser/test_data/parser/{inline/ok,ok}`, `crates/syntax/test_data/parser/validation`). rustfmt 1.10.0 (`rustfmt +1.99.1 --edition 2024 --config style_edition=2024,max_width=120 < f.rs`) accepts each; nishfmt skips it ("parse failed" under `FFDEBUG=1 dist/rustdev f.rs`, built with `.nish/bin/nish tools/dev/rust.ts --link dist/rustdev`):

- `x.0. await;`, `x.0. bar;`, `x.0. call();`
- `let _: Box<(?Sized) + (for<'a> Trait<'a>) + (Copy)>;`
- `type GenericArgs = Foo<Item<T>, Item::<T>, Item<T>: Bound, Item::<T>: Bound, Item<T> = Item, Item::<T> = Item>;`
- `fn f() { let x: i32 = 92; super let y; super::foo; }`
- `type F = Box<Fn::(i32) -> ()>;` and `type F = Start::(Middle) -> (Middle)::End;`
- `struct S { a: i32, b: f32, unsafe c: u8 }` and `struct Foo { mut(super) unsafe i: i32 }`
- `method::(..): Send,` in a where clause
- `pub unsafe static IMPORTANT_BYTES: [u8; 256];` in an `unsafe extern` block
- `fn f(_: &dyn) {}`
- `gen { yield ""; };` (listed as not ported in tools/rust/NOTES.md)
- `macro m { ($i:ident) => {} }` ("unsupported: macro 2.0"; also in NOTES.md)
- `fn foo<T: for<'a> [const] async Trait>() {}` — panics the release binary today (stage nish-panic). If the port changes the path so it formats in the release binary, it lands with a case; if it still panics, it stays as is and NOTES.md says why.

For each: first check what rustfmt 1.10.0 prints. Where rustfmt leaves the item as written, port that; where it formats it, port the rustfmt code that does (keep module headers naming rustfmt 1.10.0). Port rustc_parse at Rust 1.99.1 for the parser, with its rejections of nearby invalid forms, probed against rustfmt's exit status. A form that cannot be matched exactly stays skipped and is listed in NOTES.md. Gates: `rust` and `rust2` (`differ.txt` must not gain files), plus the repos2 Rust corpus once it can be built (it needs bench-corpus2's `REPOLIST`; until then, clone rust-analyzer at the pinned commit by hand and run nishfmt and rustfmt over its `.rs` files).

**Owns:** `src/rust/**`, `tests/cases/rust/**`, `tools/rust/**`, `THIRD_PARTY_NOTICES.md`

## Dart parser

Prompt 3. Three files from flutter/flutter at ed20d2e43d4821441036e79cec77739d4bd11984, formatted by `dart format` 3.14.1, skipped by nishfmt (`FFDEBUG=1 dist/dartdev <file>`, built with `.nish/bin/nish tools/dev/dart.ts --link dist/dartdev`):

- `dev/devicelab/lib/tasks/perf_tests.dart` — "parse: expected type" on `if (data['frame_count'] as int < 5) {`: after `as int`, `<` is less-than.
- `engine/src/flutter/lib/ui/fixtures/ui_test.dart` — "parse: expected parameter name" on `external void _encodeImage(Image i, int format, void Function(Uint8List result, String? error));`.
- `packages/flutter/lib/src/widgets/app.dart` — "parse: chained equality or relational operator" on `widget.pageRouteBuilder!<dynamic>(settings, pageContentBuilder)`.

Port package:_fe_analyzer_shared's decisions (the version dart_style 3.1.14-wip at Dart SDK 3.14.1 uses), keep each module's header, port the parser's rejections of nearby invalid forms and probe them against `dart format`'s exit status. Gates: `dart`, `dart2`…`dart6` (docs/benchmarks.md), no file newly in `differ.txt`.

**Owns:** `src/dart/**`, `tests/cases/dart/**`, `tools/dart/**`

## Swift keycap

Prompt 4. apple/swift-syntax's `Sources/_SwiftSyntaxTestSupport/Syntax+Assertions.swift` (at 60f0e15f908575c7ba83053b8d12ccd055cb73aa) is skipped with "Unicode data this port is unsure of" (`FFDEBUG=1 dist/swiftdev <file>`). SwiftFormat 0.64.7 formats it (re-indents function bodies). Its only non-ASCII is keycap emoji in doc comments: digit, U+FE0F (Mn), U+20E3 (Me).

Find which rule's Unicode check refuses it (tools/swift/NOTES.md, "Unicode": `SW_UNI_UNCERTAIN`, `swUniCheckPrefix`, `swUniJoinsPrevious`) and settle exactly how Swift's String grapheme breaking (as SwiftFormat 0.64.7 compiled with its toolchain sees it) treats digit + FE0F + 20E3 there, with `tools/swift/oracle_graphemes.py` or the oracle NOTES.md describes. If the port can be proven to match for these scalars, extend its tables so the file formats, with a case; otherwise leave it skipped and say why in NOTES.md (no code change then, and the PR is docs-only). Gate: `swift`, no file newly in `differ.txt`.

**Owns:** `src/swift/**`, `tests/cases/swift/**`, `tools/swift/**`

## Nish panic

Prompt 7. The release build (nish 0.42.0, `npm run build`, speed profile, -O3 with LTO) panics with `index out of range: 18446744073709551615 >= 64` on:

```
fn f<T: Clone,,>() {}
fn f<T: Clone,, U:, V>() {}
fn foo<T: T![], T: T!, T: T!{}>() -> Box<T! + T!{}> {}
fn foo<T: for<'a> [const] async Trait>() {}
```

It skips them cleanly (exit 1, no panic) under `--emit-ts` with Node, `--profile debug`, `-g` at the default profile, and with `src/core/out.ts` and `src/core/uwidth.ts`'s `uncheckedGet`/`uncheckedSet` replaced by checked indexing. Repro: `.nish/bin/nish tools/dev/rust.ts --link /tmp/rustdev && printf 'fn f<T: Clone,,>() {}\n' > m.rs && /tmp/rustdev m.rs`.

1. Confirm the panic is the compiler's: grep `src/` for every nish:unsafe use (`uncheckedGet`, `uncheckedSet`, `wrapping*`), show each cannot go out of range on these inputs, and list panic sites with `nish tools/dev/rust.ts --emit-panics panics.json` to find length-64 arrays on this path.
2. Reduce it to the smallest Nish program that panics only in the speed profile. Record the nish version, the program, the flags that do and do not reproduce it, and each one's output.
3. Commit the reduced program and a `repro.sh` that builds it each way and prints each outcome, under `tools/nish-panic/`. Open the PR as a **draft that is never merged**; its body is the draft issue for amritk/nish. Filing it is the user's call, asked at close-out. Propose a nishfmt-side workaround in the body if one is needed, but land none.

**Owns:** `tools/nish-panic/**`

## C++ long tail

Prompt 5. Starts after bench-corpus2 merges. On repos2 (`REPOLIST=bench/corpus/repos2.txt REPOS=bench/work/repos2 bash bench/corpus/fetch.sh`, then `… CORPUS=bench/work/corpus2 bash bench/corpus/mk.sh cpp`, then `CORPUS=bench/work/corpus2 WORK=bench/work/out2 bash bench/corpus/cmp.sh dist/nishfmt cpp`), 74 files are stable under clang-format 23.1.5 `{BasedOnStyle: LLVM, ColumnLimit: 120}` and differ in nishfmt, plus the unstable files bench-corpus2 lists as matching neither run. Categories seen:

- pointer spacing in an if-initializer: `if (const Chainstate * cs{...})` → `const Chainstate *cs{` (bitcoin src/rpc/blockchain.cpp)
- `static_cast<Opt &> (*this)(...)` → `static_cast<Opt &>(*this)` (Catch2 catch_clara.cpp, third_party/clara.hpp)
- macro-wrapped function bodies, `SPDLOG_TRY{ ... }` (spdlog async_logger-inl.h and others)
- comment reflow and indentation: eigen enum trailing comments and `/** ... */ // FIXME` (taskflow eigen Constants.h), a comment before `// clang-format off` (flatbuffers src/idl_gen_text.cpp), `//clang-format on` and a trailing `// CHECK_H_` (benchmark src/check.h), `//bool(...)` continuation lines (eigen)
- spaces before `;` after a string literal ending in a tab (duckdb holistic_functions.hpp)
- Objective-C message sends in a .cpp (`[ns_window.contentView setWantsLayer:YES]`, imgui backends/imgui_impl_wgpu.cpp) and ObjC headers in grpc and tbb
- the rest, mostly taskflow's vendored eigen and tbb and duckdb's third_party: diff each to classify

Largest category first. For each, find the clang/lib/Format code at llvmorg-23.1.5 that decides the differing whitespace and port that decision, not a heuristic. Where nishfmt cannot match a construct, it leaves the file untouched. Each fix lands with a `tests/cases/` case that fails on the base binary. Gate: both C++ corpora, no file newly in either `differ.txt`. Update the counts in docs/cpp.md and docs/benchmarks.md. One `fix(cpp)` commit per category inside the PR.

**Owns:** `src/cpp/**`, `tests/cases/*.cpp`, `tests/cases/*.expected`, `docs/cpp.md`, `docs/benchmarks.md`

## Out of scope

- The four queued task cards: the `*.json` directory walk, surviving a worker panic, C++ raw strings with a `""` delimiter, the Rust inputs rustc rejects (and `default type`).
- Filing anything on amritk/nish — the user decides at close-out.
- `src/main.ts`, `src/core/`, `src/gdoc/`: no stage owns them. A stage that finds it needs one stops and says so in its PR.
- Refreshing the repos2 Rust, Dart and Swift counts after their fixes — docs/benchmarks.md belongs to bench-corpus2 and then cpp-long-tail; the close-out lists the refresh.

## Verification

Every stage: `npm run build`, `npm test`, `npm run lint` (exit status read bare), and its language's corpus gates against `differ.txt` from the base binary. Targeted while iterating: `.nish/bin/nish tools/dev/<lang>.ts --link dist/<lang>dev` and the language's `tests/cases/<lang>/` cases by hand. CI's `check` job runs lint, build, `npm test` and a smoke run on every push; the corpus gates are the worker's own.
