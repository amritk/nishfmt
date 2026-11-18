---
name: Rust formatter on rustfmt 1.10.0, edition 2024, style 2024, width 120
overview: Upgrade the Rust port from rustfmt 1.9.0 (Rust 1.97.0) to rustfmt 1.10.0 (Rust 1.99.1), then make nishfmt format Rust as `rustfmt +1.99.1 --edition 2024 --config style_edition=2024,max_width=120`, with the Rust and rust2 corpus gates at 100% against that reference.
stages:
  - id: rustfmt-1-10
    title: "feat(rust): port rustfmt 1.10.0"
    goal: The port follows rustfmt 1.10.0 (Rust 1.99.1) at today's style, and the corpora and docs name 1.10.0 as the reference
    verification: npm run build && npm test && npm run lint && bash bench/corpus/mk.sh rust && bash bench/corpus/cmp.sh dist/nishfmt rust && bash tools/rust/mk2.sh 4 && bash bench/corpus/cmp.sh dist/nishfmt rust2
    todos:
      - id: v110-reference
        content: Point bench/corpus/mk.sh and tools/rust/mk2.sh at rustfmt 1.10.0 through a RUSTFMT variable that defaults to rustfmt +1.99.1 — see Stage 1, Reference
      - id: v110-baseline
        content: Save the 1.9.0 differ.txt, rebuild rust and rust2 with 1.10.0, and record both counts in the PR body — see Stage 1, Reference
      - id: v110-port
        content: Port every output-affecting change in the rustfmt source diff between the Rust 1.97.0 and 1.99.1 tags into src/rust/, each module keeping its header comment updated to 1.10.0 — see Stage 1, The source diff
      - id: v110-cases
        content: Add tests/cases/rust/v1_10_*.rs regression cases for each ported change, with .expected from rustfmt +1.99.1 --edition 2021 — see Stage 1, Tests
      - id: v110-docs
        content: Update README.md, docs/porting.md, docs/benchmarks.md, docs/languages.md, THIRD_PARTY_NOTICES.md, tools/rust/NOTES.md and the src/main.ts help line from rustfmt 1.9.0 to 1.10.0 — see Stage 1, Docs
  - id: edition-2024-parse
    title: "feat(rust): parse edition 2024"
    goal: The parser and lexer take an edition, and at edition 2024 accept and reject exactly what rustc's 2024 parser does, with the default still edition 2021
    verification: npm run build && npm test && npm run lint && bash bench/corpus/cmp.sh dist/nishfmt rust && the dev-driver edition-2024 gate in Stage 2, Verification, at 100%
    todos:
      - id: ed-config
        content: Add an edition field to RsConfig in src/rust/shape.ts and pass it from src/rust/format.ts to the lexer and parser, default 2021 — see Stage 2, Plumbing
      - id: ed-parse
        content: Port each rustc_lexer and rustc_parse edition-2024 branch into src/rust/lexer.ts and src/rust/parser.ts — see Stage 2, What edition 2024 changes in parsing
      - id: ed-dev-driver
        content: Let tools/dev/rust.ts select edition 2024 with FFEDITION=2024 — see Stage 2, Plumbing
      - id: ed-gate
        content: Bring the dev driver at edition 2024 to 100% against rustfmt --edition 2024 over rust/raw and report the count in the PR body — see Stage 2, Verification
  - id: style-2024
    title: "feat(rust)!: format edition 2024, style 2024, width 120"
    goal: nishfmt formats Rust as rustfmt 1.10.0 does with edition 2024, style_edition 2024 and max_width 120, and every doc says so
    verification: npm run build && npm test && npm run lint && bash bench/corpus/mk.sh rust && bash bench/corpus/cmp.sh dist/nishfmt rust && bash tools/rust/mk2.sh 4 && bash bench/corpus/cmp.sh dist/nishfmt rust2, both at 100%
    todos:
      - id: st-config
        content: Add styleEdition to RsConfig and make run.ts format with edition 2024, style 2024 and rsConfigWithMaxWidth(120) — see Stage 3, Config
      - id: st-version-sort
        content: Port sort.rs version_sort and its use in imports.ts and reorder.ts for style 2024 — see Stage 3, Branch sites
      - id: st-branches
        content: Port every other StyleEdition branch in rustfmt 1.10.0, one by one, with the 2021 path kept — see Stage 3, Branch sites
      - id: st-width
        content: Check every place rustfmt reads max_width or a width derived from it, and every width constant in src/rust/, against the 120 config — see Stage 3, Width
      - id: st-corpus
        content: Rebuild the corpus expectations in mk.sh with the new reference, and rework mk2.sh so its five configs layer on top of the base — see Stage 3, Corpora
      - id: st-cases
        content: Add tests/cases/rust/style2024_*.rs, edition2024_*.rs and width120_*.rs regression cases, and regenerate every existing tests/cases/rust/*.expected with the new reference — see Stage 3, Tests
      - id: st-docs
        content: Update README.md (table row, config text, help block, timings), docs/porting.md, docs/benchmarks.md, docs/languages.md, THIRD_PARTY_NOTICES.md, tools/rust/NOTES.md, the src/main.ts help line and the module headers for the new style — see Stage 3, Docs
---

# Rust formatter on rustfmt 1.10.0, edition 2024, style 2024, width 120

## Context

[src/rust/](../../src/rust/) ports rustfmt 1.9.0 (the rustfmt in Rust 1.97.0, `rustfmt 1.9.0-stable (2d8144b788 2026-07-07)`) at the default config, `--edition 2021`, and is at 7899/7899 on the Rust corpus. The goal is rustfmt 1.10.0 from Rust 1.99.1 (`rustfmt 1.10.0-stable (58cf8f9c35 2026-10-13)`), formatting with:

```toml
edition = "2024"
style_edition = "2024"
max_width = 120
```

The lead measured this on the corpus before slicing (rust/raw, 8349 files, `bench/corpus/mk.sh rust`):

| rustfmt 1.10.0 run | rejects | output vs today's 1.9.0 reference |
| --- | ---: | --- |
| `--edition 2021` | 450 (the same 450) | 0 of 7899 files differ |
| `--edition 2024 --config style_edition=2021` | 28 | 0 of 7899 differ; 422 files newly parse (let chains) |
| `--edition 2024 --config style_edition=2024` | 28 | 3535 of 8321 differ from the line above (import version-sort, macro-call overflow, …) |
| `--edition 2021 --config max_width=120` | 450 | nishfmt with `rsConfigWithMaxWidth(120)` already matches 7899/7899 |
| the target | 28 | 5193 of 7899 differ from today |

So the version bump moves no corpus file, edition-2024 parsing only changes which files parse, width 120 is already parametric, and the work is in style edition 2024.

## Approach

- **Three stages.** Stages 1 and 2 run at once with disjoint files. Stage 3 starts once both have merged, because it changes the same modules as both of them.
- **The reference source is the rustfmt in the Rust release tag, not the rustfmt repository's tag.** The binary is built from `rust-lang/rust` at `1.99.1` (`src/tools/rustfmt`, Cargo version 1.10.0) and `1.97.0` for 1.9.0. Fetch them with a sparse, blobless clone:

  ```bash
  for v in 1.97.0 1.99.1; do mkdir -p $TMPDIR/rustsrc/$v && cd $TMPDIR/rustsrc/$v && git init -q && git remote add origin https://github.com/rust-lang/rust && git sparse-checkout set --no-cone /src/tools/rustfmt/ /compiler/rustc_parse/ /compiler/rustc_lexer/ && git fetch -q --depth 1 --filter=blob:none origin refs/tags/$v && git checkout -q FETCH_HEAD; done
  ```

  [tools/rust/NOTES.md](../../tools/rust/NOTES.md)'s list of places "the binary disagrees with the source" was written against a 1.12.0 source tree. Re-check each item against the 1.99.1 source, and keep the list to what is still true.
- **Setup each session runs once:** `rustup toolchain install 1.99.1 --profile minimal --component rustfmt` (1.97.0 is the image's stable), then `bash bench/corpus/fetch.sh` (or only the `rust` lines of [bench/corpus/repos.txt](../../bench/corpus/repos.txt)), then `bash bench/corpus/mk.sh rust`. The Rust corpus builds in under a minute on 4 cores.
- **Coverage.** This repo has no coverage command. The coverage gate for every stage is the corpus gate at 100% plus a regression case per ported branch. The lead re-runs the corpus gate at each PR's head before merging.
- **`src/main.ts`.** Stages 1 and 3 each change one line of it, the `--help` text for Rust. CLAUDE.md asks for every language's gate after a `src/main.ts` change, but the reference tools for Ruby, Swift, Dart and C# are not installed in these containers. The diff to `src/main.ts` must be that one string literal and nothing else, which the reviewers check. No other language's gate is run.

## Stage 1: port rustfmt 1.10.0

**Owns:** `src/rust/**` except `src/rust/lexer.ts`, `src/rust/parser.ts`, `src/rust/ast.ts`, `src/rust/shape.ts`, `src/rust/format.ts`, `src/rust/run.ts`; `tests/cases/rust/**` except `tests/cases/rust/edition2024_*`; `tools/rust/**`; `bench/corpus/mk.sh`; `src/main.ts`; `README.md`; `docs/**`; `THIRD_PARTY_NOTICES.md`

### Reference

- [bench/corpus/mk.sh](../../bench/corpus/mk.sh) and [tools/rust/mk2.sh](../../tools/rust/mk2.sh) call `${RUSTFMT:-rustfmt +1.99.1}` instead of a bare `rustfmt`, still with `--edition 2021`. Update the tools comment at the top of `mk.sh`.
- Before rebuilding, run today's gate and keep its `bench/work/out/rust/differ.txt` (empty at 7899/7899). Then rebuild rust and rust2 with 1.10.0 and run both gates. Put both counts, before and after, in the PR body.

### The source diff

`diff -ru $TMPDIR/rustsrc/1.97.0/src/tools/rustfmt/src $TMPDIR/rustsrc/1.99.1/src/tools/rustfmt/src` is about 900 changed lines in 27 files, including the new `header.rs` and `range.rs`. The 1.10.0 `CHANGELOG.md` entry lists them. Port each change that affects output at the default config:

- #6457: comments within item headers keep their original whitespace (`header.rs`, `items.rs`);
- #6840: a commented single fn parameter;
- #6871: ranges in patterns that collapsed into invalid code;
- the moves into `range.rs`, and any refactor that changes a decision rather than only moving code.

Changes to unstable syntax only (super let, field representing types, impl restrictions, try blocks, fn delegation, pattern types) and to options nishfmt does not read (`--file-lines`, `hex_literal_case`, `doc_comment_code_block_small_heuristics`) are listed in NOTES.md as not ported, with the reason. A file using such syntax stays skipped: `formatRust` answers false. If a change needs the parser, lexer or AST, which Stage 2 owns, say so in the PR body and leave it out. Do not edit those files.

### Tests

One `tests/cases/rust/v1_10_<name>.rs` per ported change, taken from rustfmt's own `tests/source` and `tests/target` for that PR where it has them, with `.expected` from `rustfmt +1.99.1 --edition 2021`. Each case must fail on today's binary. Every `.expected` must be a fixed point of the reference.

### Docs

Every mention of rustfmt 1.9.0 becomes 1.10.0 (Rust 1.99.1): [README.md](../../README.md), [docs/porting.md](../../docs/porting.md), [docs/benchmarks.md](../../docs/benchmarks.md), [docs/languages.md](../../docs/languages.md), [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md), [tools/rust/NOTES.md](../../tools/rust/NOTES.md), the help line in [src/main.ts](../../src/main.ts), and the `Ported from rustfmt 1.9.0` header of every module this stage owns. The six modules Stage 2 owns keep their 1.9.0 header until Stage 3. The config text stays "default config, edition 2021".

## Stage 2: parse edition 2024

**Owns:** `src/rust/lexer.ts`, `src/rust/parser.ts`, `src/rust/ast.ts`, `src/rust/shape.ts`, `src/rust/format.ts`, `src/rust/run.ts`, `tools/dev/rust.ts`

### Plumbing

- `RsConfig.edition: i32 = 2021` in [src/rust/shape.ts](../../src/rust/shape.ts). [src/rust/format.ts](../../src/rust/format.ts) passes it to the lexer and parser wherever they run, including `rsFormatSnippet` and `rsFormatCodeBlock` for macro bodies.
- [src/rust/run.ts](../../src/rust/run.ts) still formats at edition 2021, so nishfmt's output does not change in this stage.
- [tools/dev/rust.ts](../../tools/dev/rust.ts) sets the edition to 2024 when `FFEDITION=2024`.

### What edition 2024 changes in parsing

Find each place rustc_lexer and rustc_parse in `compiler/` at the 1.99.1 tag branch on the edition (`edition()`, `Edition2024`, `at_least_rust_2024`, `rust_2024`), and port the ones that change whether a file parses or how it parses. At least:

- let chains (`src/rust/parser.ts:4054` already rejects them before 2024);
- `gen` as a reserved keyword;
- reserved guarded string prefixes (`#"…"#`, `##`) in the lexer;
- `unsafe extern` blocks with `safe`/`unsafe` items, and `unsafe(…)` attributes, if the parser treats them differently by edition;
- anything else the grep turns up, such as the `expr_2021` macro fragment and the never type.

Only parse errors count: rustfmt runs no lints, so a 2024 lint that becomes an error after parsing changes nothing. Every new rejection makes `formatRust` answer false, as the existing let-chain error does.

### Verification

rustfmt 1.9.0 (the image's stable, `rustfmt +1.97.0`) is the reference for this stage. rustfmt 1.10.0 and 1.9.0 agree on the corpus at style 2021, and this stage leaves formatting alone, so it is checked independently of Stage 1:

```bash
d=bench/work/corpus/rust; out=$TMPDIR/ed2024; mkdir -p $out
(cd $d/raw && find . -type f) | while read -r f; do
  if rustfmt +1.97.0 --edition 2024 < $d/raw/$f > $out/ref 2>/dev/null; then
    FFEDITION=2024 dist/rustdev $d/raw/$f > $out/got 2>/dev/null && cmp -s $out/got $out/ref && echo same || echo "differ $f"
  else
    FFEDITION=2024 dist/rustdev $d/raw/$f > /dev/null 2>&1 && echo "accepted $f" || echo rejected-both
  fi
done | sort | uniq -c | sort -rn | head
```

Done when every file rustfmt accepts at edition 2024 is identical (about 8321), and every file it rejects is also rejected. The regular `cmp.sh` gate stays 7899/7899. Write the script used into the PR body. Regression cases for edition 2024 land in Stage 3, because `dist/nishfmt` does not format at 2024 until then.

## Stage 3: edition 2024, style 2024, width 120

**Owns:** `src/rust/**`, `tests/cases/rust/**`, `tests/run.sh`, `tools/rust/**`, `tools/dev/rust.ts`, `bench/corpus/mk.sh`, `src/main.ts`, `README.md`, `docs/**`, `THIRD_PARTY_NOTICES.md`

Depends on: `rustfmt-1-10` and `edition-2024-parse`, both merged, for development and merge.

### Config

`RsConfig.styleEdition: i32 = 2021`, and `run.ts` formats with a config built as rustfmt builds it from `edition = "2024"`, `style_edition = "2024"`, `max_width = 120`: the edition 2024, the style edition 2024, and `rsConfigWithMaxWidth(120)` for the `use_small_heuristics = "Default"` widths. Check which options rustfmt 1.10.0 defaults differently at style edition 2024 (`config_option_with_style_edition_default!` in `config/options.rs`; at least `version` becomes `Two`). Port each default that changes output, and nothing else.

### Branch sites

`grep -rnE 'style_edition|StyleEdition|Version::|version_sort|edition\(\)' src/tools/rustfmt/src` at the 1.99.1 tag, leaving out `config/`, `bin/`, `cargo-fmt/`, `git-rustfmt/` and `test/`. The sites are in `chains.rs`, `closures.rs`, `expr.rs`, `imports.rs`, `items.rs`, `macros.rs`, `matches.rs`, `missed_spans.rs`, `overflow.rs`, `patterns.rs`, `reorder.rs`, `sort.rs`, `stmt.rs`, `types.rs`, `utils.rs` and `visitor.rs`, about 50 of them. Port each one as rustfmt decides it, keeping the 2021 path. Branches on `Edition2027` stay on their pre-2027 path. List every site in NOTES.md with the module and function it went to. `version_sort` (`sort.rs`) is new: it becomes `src/rust/sort.ts`, with names prefixed `Rs`.

### Width

`rsConfigWithMaxWidth(120)` already matches rustfmt at width 120 and style 2021 (lead's probe: 7899/7899). Still check every reader of `max_width` and of the derived widths (`fn_call_width`, `attr_fn_like_width`, `struct_lit_width`, `struct_variant_width`, `array_width`, `chain_width`, `single_line_if_else_max_width`, `single_line_let_else_max_width`), and comment widths (`comment_width`, and the width a doc comment or a `macro_rules!` body is formatted at). Look for any literal `100` or other width constant in `src/rust/` that should come from the config.

### Corpora

- `mk.sh` builds `rust/ref` with `$RUSTFMT --edition 2024 --config style_edition=2024,max_width=120`.
- `mk2.sh`'s five configs each become the base plus their own options: every config string starts `style_edition=2024,max_width=120,` and is run with `--edition 2024`. The options after the base override it, so a config that sets `max_width` keeps its own. The second pass, the reference, is the base config. Its header comment says so.
- Both gates at 100%: rust (about 8321 files) and rust2. The PR body gives the counts and says the comparison with the earlier differ.txt is not possible here, because the reference changed for every file.

### Tests

- `style2024_<topic>.rs` for each group of branch sites (version-sorted imports and `mod` items, raw identifiers in sorting, macro-call overflow, let-else, `match` arms, closures with `loop`, types and bounds, items, chains, string and comment handling, …), and `edition2024_<topic>.rs` for let chains and for a file that edition 2024 rejects (a reserved `gen` identifier, a guarded string), which nishfmt must leave untouched. Also `width120_<topic>.rs` for lines of 101 to 120 columns, the derived widths, and comments. Every `.expected` comes from `rustfmt +1.99.1 --edition 2024 --config style_edition=2024,max_width=120` and is a fixed point of it. A file that must be skipped follows the `unbalanced.cpp` pattern in [tests/run.sh](../../tests/run.sh), or adds a Rust equivalent there.
- Every existing `tests/cases/rust/*.expected` is regenerated with the new reference, and its `.rs` re-checked so each case still tests what its name says.

### Docs

[README.md](../../README.md): the Rust row (config, file count, and times measured as [docs/benchmarks.md](../../docs/benchmarks.md#timing) says, with a `Measured:` line in the commit body), the config paragraph, and the `--help` block. Also [docs/porting.md](../../docs/porting.md), [docs/benchmarks.md](../../docs/benchmarks.md) (reference table, corpus results, the rust2 description), [docs/languages.md](../../docs/languages.md), [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md), [tools/rust/NOTES.md](../../tools/rust/NOTES.md) (status table, failed.txt explanation, branch-site list, tests, iterating), the help line in [src/main.ts](../../src/main.ts), and every `src/rust/` module header naming rustfmt 1.10.0. The commit is `feat(rust)!` with a `BREAKING CHANGE:` footer, because every Rust user's output changes.

## Out of scope

- Reading a project's `rustfmt.toml`. nishfmt keeps one fixed style per language.
- Style edition 2027, nightly-only options, and unstable syntax beyond what the 1.10.0 diff changes for files the port already formats.
- Keeping edition 2021 as a selectable style in the CLI. The 2021 code paths stay in the port because rustfmt keeps them.
- The other languages' formatters, `src/core/`, `src/gdoc/`.

## Verification

Each stage: `npm run build`, `npm test`, `npm run lint`, each with its own exit status, and the corpus gates named in its `verification`. The lead re-runs the corpus gate at the PR's head before merging.
