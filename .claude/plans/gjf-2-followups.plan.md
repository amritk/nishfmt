---
name: gjf 2.0.0 follow-ups (#34, #28)
overview: Close the gaps left by the google-java-format 2.0.0 upgrade — real skip assertions for Java, the missing comment-indentation cases, ported-module headers and one gdoc credit (#34) — then port javac 21's remaining parse-time rejections and stop skipping three valid inputs (#28).
stages:
  - id: java-skip-cases-and-credits
    title: Java skip cases, missing regression cases, headers and credits (#34)
    goal: Java skip cases assert the skip; 2.0.0's try-resource and multi-catch comment indentation is pinned; lexer.ts and src/gdoc/ credit one consistent version.
    verification: npm run build && npm test && npm run lint && bash bench/corpus/cmp.sh dist/nishfmt java && bash bench/corpus/cmp.sh dist/nishfmt kt (7627/7627, Kotlin differ.txt identical to base)
    todos:
      - id: java-skip-harness
        content: Add a tests/cases/java/skip_*.java loop to tests/run.sh asserting the skip message and an unchanged file — see Skip cases
        status: pending
      - id: convert-22-skips
        content: Convert #22's skip cases whose .expected equals the input to skip_*.java — see Skip cases
        status: pending
      - id: try-catch-comment-cases
        content: Add try-resource and multi-catch comment cases from #34's probe, failing on 275573b — see Comment cases
        status: pending
      - id: controls
        content: Make text_block_no_break_spaces and var_variable_name fail on 275573b, or mark them as controls — see Comment cases
        status: pending
      - id: headers-and-credits
        content: Give src/java/lexer.ts a ported-module header; make src/gdoc/*.ts, THIRD_PARTY_NOTICES.md and tools/kotlin/NOTES.md credit one version — see Headers and credits
        status: pending
  - id: javac-parse-rejections
    title: javac 21's remaining parse-time rejections (#28)
    goal: Every #28 probe gjf 2.0.0 rejects is skipped and left untouched; the three valid probes are formatted as gjf formats them.
    verification: npm run build && npm test && npm run lint && bash bench/corpus/cmp.sh dist/nishfmt java (7627/7627, differ.txt identical to base)
    todos:
      - id: restricted-type-names
        content: Reject var, yield, record, sealed, permits as declared type names and type parameters, at javac's typeName() sites only — see javac rejections
        status: pending
      - id: yield-call
        content: Reject an unqualified yield(...) call (isInvalidUnqualifiedMethodIdentifier) — see javac rejections
        status: pending
      - id: var-lambda-brackets
        content: Reject `(var x[]) ->` — see javac rejections
        status: pending
      - id: permits-without-sealed
        content: Reject a permits clause on a class or interface that is not sealed — see javac rejections
        status: pending
      - id: valid-restricted-sites
        content: Stop applying the restricted-name check in qualidentList (permits) and bracketsSuffix (IDENT [] before .class or ::) — see javac rejections
        status: pending
---

# gjf 2.0.0 follow-ups

## Context

Run #11 upgraded Java to google-java-format 2.0.0 (#17, #22). Its acceptance left [#34](https://github.com/amritk/nishfmt/issues/34) (regression coverage, headers, credits) and [#28](https://github.com/amritk/nishfmt/issues/28) (inputs javac 21 rejects that nishfmt formats, and three valid inputs nishfmt skips). Base: `origin/main` at c25a474. The gates: Java 7627 / 7627, Kotlin 9602 / 9602.

## Approach

- **Skip cases assert the skip.** CLAUDE.md says a case's input must differ from its `.expected`, because a skipped file is written back verbatim. A skipped file's `.expected` would be its input, so it would pass whether the file was skipped or formatted unchanged. Java gets the form Rust already has: `tests/cases/java/skip_<name>.java`, with no `.expected`, which `tests/run.sh` checks for `nishfmt: skipped <path>`, a byte-identical file, and a clean `--check`. A skip case fails on a binary that formats the file, so it can fail on main.
- **Stage 2 depends on stage 1** for development as well as merge: its cases use the skip harness stage 1 adds.

## Stage 1: Java skip cases, missing regression cases, headers and credits (#34)

**Owns:** `tests/run.sh`, `tests/cases/java/**` except `tests/cases/java/*javac_*`, `src/java/lexer.ts` (header only), `src/gdoc/*.ts` (headers only), `THIRD_PARTY_NOTICES.md`, `tools/java/NOTES.md`, `tools/kotlin/NOTES.md`

### Skip cases

`tests/run.sh`: a loop over `tests/cases/java/skip_*.java`, modelled on the `rust/skip_*.rs` loop. Every #22 case whose `.expected` equals its input and that gjf 2.0.0 rejects (`implicit_rejects_*`, `import_module_package`, the `var_*` rejections, `semicolon_before_import` and any others found by `cmp`) becomes `skip_<name>.java` with its `.expected` removed. A case whose `.expected` equals its input but that gjf accepts is a formatted control, not a skip: leave it, and list it in the PR.

### Comment cases

From #34's probe: one case for `try (` with a comment after the paren, one for `catch (` with a multi-catch. Inputs not formatted (so input ≠ `.expected`), `.expected` from gjf 2.0.0 on JDK 21. Each must fail on 275573b's binary and on no later one where 2.0.0 already matched. `text_block_no_break_spaces` and `var_variable_name`: change the input so it fails on 275573b, or add a one-line comment in `tools/java/NOTES.md` listing them as controls.

### Headers and credits

- `src/java/lexer.ts`: ported-module header (google-java-format 2.0.0's JavaInput tokenizer, Apache-2.0, Copyright 2015 Google Inc.). `parser.ts` and `ast.ts` are javac-shaped, not ports of a gjf class: record that decision in `tools/java/NOTES.md`, and give them a header only if they port javac code.
- `src/gdoc/`: compare gjf 1.28 and 2.0.0's `JavaCommentsHelper`, `JavaInput`, `Input`, `OpsBuilder`, `DocBuilder`, `Doc` for the parts gdoc ports. State one version the same way in every `src/gdoc/*.ts` header, `THIRD_PARTY_NOTICES.md` and `tools/kotlin/NOTES.md`, with what Kotlin (ktfmt 0.65's bundled 1.23.0) and Java (2.0.0) run.

## Stage 2: javac 21's remaining parse-time rejections (#28)

**Owns:** `src/java/parser.ts`, `tests/cases/java/*javac_*`, and `tools/java/NOTES.md` once stage 1 has merged


In `src/java/parser.ts`, port javac 21's `JavacParser` checks at the same sites: `typeName()` (class, interface, enum, record, annotation names, type parameters), `isInvalidUnqualifiedMethodIdentifier` (unqualified `yield(`), the `var` lambda parameter with brackets, and `permits` without `sealed`. A rejection makes `formatJava` answer `false`. The restricted-name check must not run in `qualidentList` (the `permits` list) or `bracketsSuffix`. Each of #28's 14 probes becomes a case: the 11 rejected as `skip_javac_<name>.java`, the 3 valid as `javac_<name>.java` with `.expected` from gjf.

## Out of scope

Formatting changes to valid Java beyond #28's three probes; Kotlin behaviour; any other language.

## Tests

`tests/cases/java/`; mirror `tests/cases/rust/skip_*.rs`. Each new case is run against the base binary (c25a474, and 275573b for the comment cases) and fails there.

## Verification

`npm run build`, `npm test`, `npm run lint`, run bare. Java gate and, for stage 1 (it edits `src/gdoc/`), the Kotlin gate, with `differ.txt` compared to the base run.
