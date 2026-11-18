---
name: Upgrade Java to google-java-format 2.0.0
overview: Move nishfmt's Java formatter from google-java-format 1.28 to 2.0.0 (default Google style, cleanups on), porting 2.0.0's new layout engine as a Java-only engine so Kotlin keeps the 1.x Doc engine in src/gdoc unchanged, and bring the Java corpus gate back to 100%.
stages:
  - id: javadoc
    title: "feat(java): format javadoc as google-java-format 2.0.0 does"
    goal: Port every javadoc and comment-rewriting change from 1.28 to 2.0.0 into src/java/javadoc.ts and src/java/comments.ts, so the 23 files whose only difference is javadoc match again.
    verification: npm run build && npm test && npm run lint && bash bench/corpus/cmp.sh dist/nishfmt java, then none of the 23 javadoc-only files is in bench/work/out/java/differ.txt and differ.txt holds no file absent from the main baseline — see Verification
    todos:
      - id: javadoc-baseline
        content: Build the 2.0.0 Java corpus and record main's differ.txt as the baseline — see Setup
        status: pending
      - id: javadoc-port
        content: Port JavadocFormatter, JavadocLexer, JavadocWriter, Token, NestingStack and MarkdownPositions changes (1.29 to 2.0.0) into src/java/javadoc.ts — see Stage javadoc
        status: pending
      - id: javadoc-comments
        content: Port the JavaCommentsHelper changes into src/java/comments.ts — see Stage javadoc
        status: pending
      - id: javadoc-cases
        content: Add one tests/cases/java/javadoc_<name>.java case per ported behaviour, expected from gjf 2.0.0 — see Tests
        status: pending
      - id: javadoc-headers
        content: Update the header comments of src/java/javadoc.ts and src/java/comments.ts to google-java-format 2.0.0 — see Ported-code headers
        status: pending
  - id: layout
    title: "feat(java): upgrade the Java formatter to google-java-format 2.0.0"
    goal: Port 2.0.0's layout engine, visitor, cleanup pass, import, modifier and StringWrapper changes, so the Java gate is 100% against gjf 2.0.0 and the Kotlin gate is unchanged, and update every doc that names the Java reference.
    verification: after merging main (with javadoc merged) — npm run build && npm test && npm run lint, bash bench/corpus/cmp.sh dist/nishfmt java prints N / N identical with an empty differ.txt, and bash bench/corpus/cmp.sh dist/nishfmt kt leaves differ.txt identical to the main baseline — see Verification
    todos:
      - id: layout-baseline
        content: Build the 2.0.0 Java corpus and the Kotlin corpus, and record main's Java and Kotlin differ.txt as baselines — see Setup
        status: pending
      - id: layout-notes
        content: Read the 1.29 to 2.0.0 release notes and write tools/java/NOTES.md with what affects nishfmt — see Release notes
        status: pending
      - id: layout-engine
        content: Port layout/Doc, Docs, LayoutBuilder and LayoutSolver as a Java-only engine under src/java/layout/, with the JavaOutput, Input and Newlines changes it needs — see Stage layout
        status: pending
      - id: layout-visitor
        content: Port the JavaInputAstVisitor, Trees, DimensionHelpers and JavacTokens changes into src/java/visitor.ts and the parser — see Stage layout
        status: pending
      - id: layout-cleanups
        content: Port Cleanups, CleanupPass and CleanupScanner into src/java/cleanups.ts and reorder the pre-format passes in src/java/run.ts to 2.0.0's order — see Stage layout
        status: pending
      - id: layout-imports-modifiers
        content: Port the ImportOrderer, RemoveUnusedImports and ModifierOrderer changes into src/java/imports.ts and src/java/modifiers.ts — see Stage layout
        status: pending
      - id: layout-strings
        content: Port the StringWrapper changes (text blocks in the main pass, escaped backslashes) into src/java/strings.ts and src/java/partial.ts — see Stage layout
        status: pending
      - id: layout-cases
        content: Add one tests/cases/java case per ported behaviour, expected from gjf 2.0.0 — see Tests
        status: pending
      - id: layout-docs
        content: Update README.md, docs/porting.md, docs/benchmarks.md, docs/languages.md, THIRD_PARTY_NOTICES.md, CLAUDE.md, bench/corpus/mk.sh and the src/main.ts help line to 2.0.0 — see Docs
        status: pending
      - id: layout-gate
        content: Merge main after javadoc lands and bring the Java gate to 100% with Kotlin unchanged — see Verification
        status: pending
---

## Context

nishfmt's Java formatter ([src/java/](../../src/java)) ports google-java-format 1.28 and matches it on 7,627 / 7,627 corpus files. Kotlin ([src/kotlin/](../../src/kotlin)) ports ktfmt 0.64, which runs on google-java-format's 1.x Doc engine; nishfmt ports that engine once, in [src/gdoc/engine.ts](../../src/gdoc/engine.ts), and both languages use it.

google-java-format 2.0.0 (30 Oct 2026) **replaces the layout engine** for Java: a new package `com.google.googlejavaformat.layout` (`Doc`, `Docs`, `LayoutBuilder`, `LayoutSolver`, about 1,900 lines) builds a new Doc tree from the visitor's ops and lays it out greedily in one pass (Wadler's `be`/`better`). The old `Doc`, `DocBuilder` and `OpsBuilder` are still shipped but no longer used to format Java. It also turns on a new `--cleanup` pass by default and changes javadoc, StringWrapper and imports. The full source diff from 1.28.0 to 2.0.0 is about 12,500 lines.

Measured on the base SHA (`275573b`), today's `dist/nishfmt` against a corpus rebuilt with the 2.0.0 jar: **7,157 / 7,627 identical**. The 470 files that differ:

| Cause | Files | Stage |
| --- | --- | --- |
| A sole lambda argument stays on the call's line (#19), and comments inside it re-wrap at the new indent | 435 | layout |
| Javadoc only | 23 | javadoc |
| Cleanups (`@Foo()` to `@Foo`, redundant `;`, `(x) ->` to `x ->`) | 12 (2 also have lambda changes) | layout |
| Comment indentation after an enum constant | 2 | layout |

The baselines are on the plan branch: [gjf-2/differ-java-main.txt](gjf-2/differ-java-main.txt) (main's 470 differing files) and [gjf-2/javadoc-only.txt](gjf-2/javadoc-only.txt) (the 23).

## Approach

- **The new engine is Java-only.** ktfmt 0.64 still runs on the 1.x Doc engine, so porting 2.0.0's engine into `src/gdoc/engine.ts` would break Kotlin. The new engine goes in a new `src/java/layout/` directory with `Jl`-prefixed names. `src/gdoc/engine.ts` stays as it is. The shared token input (`src/gdoc/input.ts`, `src/gdoc/comments.ts`) may change only where 2.0.0's `Input`/`Newlines`/`CommentsHelper` changes require it, and only if the Kotlin gate stays identical. If Java needs input behaviour Kotlin must not get, it goes in `src/java/`.
- **Port the decision, not the corpus.** Every change is ported from the 2.0.0 source, read against 1.28.0, even where the corpus shows no difference (for example `import module`, value classes, the new pass order). Source jars: `google-java-format-{1.28.0,2.0.0}-sources.jar` on Maven Central, or tags `v1.28.0` and `v2.0.0` of google/google-java-format.
- **Two stages, not more.** Javadoc is its own module and its 23 files verify on their own. Everything else meets in `src/java/run.ts` (the pre-format pass order and the engine and StringWrapper flow both change there), so splitting cleanups from layout would make two workers edit one file.
- **Merge order:** javadoc first, then layout. Layout merges main once javadoc lands, and only then can the Java gate reach 100%.

## Setup

Both stages, before changing anything:

```bash
mkdir -p "$TMPDIR/ref" && cd "$TMPDIR/ref"
B=https://repo1.maven.org/maven2/com/google/googlejavaformat/google-java-format
curl -fLO $B/2.0.0/google-java-format-2.0.0-all-deps.jar
curl -fLO $B/2.0.0/google-java-format-2.0.0-sources.jar
curl -fLO $B/1.28.0/google-java-format-1.28.0-sources.jar
curl -fLO https://repo1.maven.org/maven2/com/facebook/ktfmt/0.64/ktfmt-0.64-with-dependencies.jar   # layout only
export GJF=$TMPDIR/ref/google-java-format-2.0.0-all-deps.jar KTFMT=$TMPDIR/ref/ktfmt-0.64-with-dependencies.jar
cd - && bash bench/corpus/fetch.sh
bash bench/corpus/mk.sh java          # layout also: bash bench/corpus/mk.sh kt
npm run build && bash bench/corpus/cmp.sh dist/nishfmt java
cp bench/work/out/java/differ.txt "$TMPDIR/differ-java-main.txt"   # layout also saves kt's
git fetch origin feature/gjf-2/plan
git show origin/feature/gjf-2/plan:.claude/plans/gjf-2/javadoc-only.txt > "$TMPDIR/javadoc-only.txt"
```

JDK 21 is installed in the container and is what 2.0.0 needs (its manifest says `Java-Version: 21`; the minimum has been 21 since 1.29). The main baseline should list the same 470 files as `gjf-2/differ-java-main.txt`; if it does not, stop and say so in the PR.

## Release notes

Release notes for 1.29.0 to 2.0.0 are at https://github.com/google/google-java-format/releases. What a first read found, to confirm and record in a new `tools/java/NOTES.md`:

- 1.29: JDK 21 is the minimum to run the formatter. No formatting changes.
- 1.30: `import module` support. 1.34: instance main methods (JEP 512). 2.0.0: value classes and records (JEP 401).
- 1.36 to 1.37: Markdown (`///`) javadoc improvements, list items and blank lines.
- 2.0.0: new layout engine; a sole lambda argument stays on the call's line (#19); text blocks indented in the main pass; comment indentation fixed after `assert`, enum constants, `for` initializers, `try` resources, multi-catch and type arguments; `--cleanup` on by default (redundant semicolons, `@Foo()`, `(x) ->`); javadoc strips trailing asterisks before `*/` (#67), keeps relative indentation in `<pre>{@code}` without leading `*`, joins hyphenated words; StringWrapper no longer splits escaped backslashes (#1186, #1253, #1439).
- Flags nishfmt does not use but should note: `--max-line-length`, `--style`, `--cleanup=false`.

NOTES.md also says how the corpus was rebuilt, the before and after gate counts, and which modules port which 2.0.0 classes. The javadoc worker puts its porting notes in its PR body; the layout worker folds them into NOTES.md after merging main.

## Stage javadoc

| 2.0.0 source | nishfmt |
| --- | --- |
| `java/javadoc/{JavadocFormatter,JavadocLexer,JavadocWriter,Token,NestingStack,MarkdownPositions}.java` | [src/java/javadoc.ts](../../src/java/javadoc.ts) |
| `java/JavaCommentsHelper.java` | [src/java/comments.ts](../../src/java/comments.ts) |

Diff each against 1.28.0 and port every change that can alter output: trailing `*` before `*/`, `<pre>{@code}` relative indentation, hyphenated-word joining, `<blockquote>` blank lines (seen in the corpus), and the Markdown `///` changes from 1.36 to 1.37. Owns: `src/java/javadoc.ts`, `src/java/comments.ts`, `tests/cases/java/javadoc_*`. A javadoc change that needs a file outside these goes in the PR body for the layout stage, not into this diff.

## Stage layout

| 2.0.0 source | nishfmt |
| --- | --- |
| `layout/{Doc,Docs,LayoutBuilder,LayoutSolver}.java`, with the changes to `JavaOutput`, `Input`, `Newlines`, `CommentsHelper`, `Indent`, `Output` it needs | new `src/java/layout/` (`Jl` prefix) |
| `java/JavaInputAstVisitor.java`, `Trees`, `DimensionHelpers`, `JavacTokens`, `JavaInput` | [src/java/visitor.ts](../../src/java/visitor.ts), [parser.ts](../../src/java/parser.ts), [ast.ts](../../src/java/ast.ts), [lexer.ts](../../src/java/lexer.ts) |
| `java/{Cleanups,CleanupPass,CleanupScanner,Edit}.java`, `Formatter` | new `src/java/cleanups.ts`, [src/java/run.ts](../../src/java/run.ts) |
| `java/{ImportOrderer,RemoveUnusedImports}.java` | [src/java/imports.ts](../../src/java/imports.ts) |
| `java/ModifierOrderer.java` | [src/java/modifiers.ts](../../src/java/modifiers.ts) |
| `java/StringWrapper.java` | [src/java/strings.ts](../../src/java/strings.ts), [partial.ts](../../src/java/partial.ts) |

- `Formatter.java` runs the pre-format passes in a new order (`Cleanups.enabledPasses`): remove unused imports, AST cleanups, reorder modifiers, sort imports. 1.28 sorted imports first. `run.ts` follows 2.0.0's order and its per-pass reparse.
- `JavaEngine` keeps the `GInput` it shares with the parser and swaps `GEngine` for the new engine. Kotlin's use of `GEngine` does not change.
- Language support in the range (`import module`, instance main methods, value classes) is ported in the parser and visitor. A construct nishfmt cannot format exactly still answers `false`.
- A new `tools/dev/java.ts` driver (like [tools/dev/kotlin.ts](../../tools/dev/kotlin.ts)) is allowed, for fast builds.

Owns: `src/java/**` except `src/java/javadoc.ts` and `src/java/comments.ts`; `src/gdoc/input.ts`, `src/gdoc/comments.ts` (Kotlin gate must stay identical; `src/gdoc/engine.ts` is not owned); `src/main.ts` (the help line only); `tests/cases/java/*` except `tests/cases/java/javadoc_*`; `tools/java/**`; `tools/dev/java.ts`; `README.md`, `CLAUDE.md`, `THIRD_PARTY_NOTICES.md`, `docs/porting.md`, `docs/benchmarks.md`, `docs/languages.md`, `bench/corpus/mk.sh` (the header comment only).

## Ported-code headers

Every ported module names its project, version and license in its first comment (CLAUDE.md, Ported code). Each stage updates the headers of the modules it owns from 1.28 to 2.0.0, and new modules get one. `src/gdoc/engine.ts` keeps naming google-java-format 1.x's Doc engine, because that is what Kotlin runs; its header says so.

## Docs

| File | Change |
| --- | --- |
| [README.md](../../README.md) | Java row: google-java-format 2.0.0, the new file count and times, measured on this machine; the `--help` block |
| [docs/porting.md](../../docs/porting.md) | the Java row, and the `src/gdoc/` line: the Doc engine is now Kotlin's, Java has its own under `src/java/layout/` |
| [docs/benchmarks.md](../../docs/benchmarks.md) | `2.0.0, all-dependencies jar`; JDK 21 |
| [docs/languages.md](../../docs/languages.md) | the Java paragraph |
| [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) | Java row to 2.0.0, with 2.0.0's copyright years; `src/gdoc/` stays credited to google-java-format 1.x for Kotlin |
| [CLAUDE.md](../../CLAUDE.md) | the Layout bullet that says `src/gdoc/` is shared by Java and Kotlin |
| [bench/corpus/mk.sh](../../bench/corpus/mk.sh) | header comment: google-java-format 2.0.0 |
| [src/main.ts](../../src/main.ts) | the `--help` line `google-java-format 1.28` |

**`src/main.ts` (decided at sign-off):** the change there is the one `--help` string. CLAUDE.md says a change to `src/main.ts` touches every language; for this string-only change the human chose to run only the Java and Kotlin gates. The PR body shows `git diff main -- src/main.ts` changing exactly that line and states the exception.

Grep for every other `1.28` and `google-java-format` mention in docs, CLAUDE.md and source comments, and fix the ones about the Java reference.

## Out of scope

- AOSP style, `--max-line-length`, `--cleanup=false`, `--lines`/`--offset`: nishfmt runs the default CLI only.
- Upgrading ktfmt, or changing `src/gdoc/engine.ts` and any Kotlin output.
- Performance work. The README's Java times are re-measured, not optimised.

## Tests

One case per ported behaviour (CLAUDE.md, "A fix lands with a regression case"): `tests/cases/java/<name>.java` with `<name>.expected` from `java -jar $GJF - < <name>.java`, and the case must fail on main's binary. At least: a sole lambda argument, a comment inside it, comment indentation after an enum constant, each cleanup (empty annotation parentheses, redundant semicolon, single lambda parameter parentheses), the pass-order change, a text block, a string with an escaped backslash reflowed, and each javadoc change. [tests/cases/java/partial_reformat.java](../../tests/cases/java/partial_reformat.java) is unchanged under 2.0.0 and must still pass.

## Verification

Each stage, on its head:

```bash
npm run build && npm test && npm run lint
bash bench/corpus/cmp.sh dist/nishfmt java
```

javadoc: also

```bash
! grep -qxFf "$TMPDIR/javadoc-only.txt" bench/work/out/java/differ.txt            # the 23 now match
test -z "$(comm -13 <(sort "$TMPDIR/differ-java-main.txt") <(sort bench/work/out/java/differ.txt))"   # nothing new differs
```

layout, after merging main with javadoc in: `cmp.sh … java` prints `N / N identical` and `bench/work/out/java/differ.txt` is empty, and

```bash
bash bench/corpus/cmp.sh dist/nishfmt kt && cmp bench/work/out/kt/differ.txt "$TMPDIR/differ-kt-main.txt"
```

The PR body quotes each gate line before and after. CI does not run the corpus gates (they need the reference tools); the lead re-runs them at the PR's head before merging.
