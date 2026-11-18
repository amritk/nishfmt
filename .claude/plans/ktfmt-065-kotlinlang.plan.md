---
name: Kotlin to ktfmt 0.65 kotlinlang style
overview: Move nishfmt's Kotlin formatter from ktfmt 0.64 default (Meta) style to ktfmt 0.65 --kotlinlang-style, upgrading the ported Kotlin lexer and parser from Kotlin 2.3.20 to 2.4.10 (the version ktfmt 0.65 builds against), in two PRs — the version first, then the style.
stages:
  - id: version
    title: feat(kotlin) — match ktfmt 0.65 and parse as Kotlin 2.4.10
    goal: The Kotlin gate is at 100% against ktfmt 0.65 in its default (Meta) style, on a parser ported from Kotlin 2.4.10, with Java unchanged.
    verification: npm run build && npm test && npm run lint && bash bench/corpus/cmp.sh dist/nishfmt kt (N / N identical against a corpus built by mk.sh kt with the 0.65 jar, default style) && bash bench/corpus/cmp.sh dist/nishfmt java (differ.txt identical to base)
    todos:
      - id: v-baseline
        content: Build the 0.64 kt corpus and save its differ.txt, then rebuild with the 0.65 jar and record the cmp.sh result before any change — see Version, Baseline
        status: pending
      - id: v-compiler
        content: Port the Kotlin 2.3.20 to 2.4.10 parser and KDoc lexer changes into src/kotlin/parser.ts, lexer.ts, types.ts and the KDoc link scan — see Version, Compiler 2.4.10
        status: pending
      - id: v-ktfmt
        content: Port every ktfmt 0.64 to 0.65 change that affects output into src/kotlin/ — see Version, ktfmt 0.65
        status: pending
      - id: v-cases
        content: Add tests/cases/kotlin/ regression cases for each ported change, expected output from the 0.65 jar default style — see Version, Tests
        status: pending
      - id: v-docs
        content: Update version strings in README.md, docs, THIRD_PARTY_NOTICES.md, module headers and mk.sh, and create tools/kotlin/NOTES.md — see Version, Docs
        status: pending
  - id: style
    title: feat(kotlin)! — format Kotlin in ktfmt 0.65 kotlinlang style
    goal: nishfmt formats Kotlin exactly as ktfmt 0.65 --kotlinlang-style, the corpus is rebuilt with that flag, and the Kotlin gate is back at 100% with Java unchanged.
    verification: npm run build && npm test && npm run lint && bash bench/corpus/cmp.sh dist/nishfmt kt (N / N identical against a corpus built by mk.sh kt with the 0.65 jar and --kotlinlang-style) && bash bench/corpus/cmp.sh dist/nishfmt java (differ.txt identical to base)
    todos:
      - id: s-options
        content: Port KOTLINLANG_FORMAT's options (block indent 4, continuation 4, width 100, trailing commas COMPLETE, remove unused imports) into src/kotlin/ as one options record — see Style, Options
        status: pending
      - id: s-branches
        content: Port every place ktfmt 0.65 branches on an option that differs from META_FORMAT, including COMPLETE's redundant-comma removal — see Style, Branches
        status: pending
      - id: s-corpus
        content: Make bench/corpus/mk.sh build the kt reference with --kotlinlang-style and get the gate to N / N — see Style, Corpus
        status: pending
      - id: s-cases
        content: Add tests/cases/kotlin/ cases for each style branch and regenerate the version stage's cases in kotlinlang style — see Style, Tests
        status: pending
      - id: s-docs
        content: Update README.md, docs, the src/main.ts usage line, THIRD_PARTY_NOTICES.md and tools/kotlin/NOTES.md for kotlinlang style, with re-measured Kotlin numbers — see Style, Docs
        status: pending
---

# Kotlin to ktfmt 0.65 kotlinlang style

## Context

[src/kotlin/](../../src/kotlin) ports ktfmt 0.64's default (Meta) style onto a lexer and parser ported from the Kotlin compiler 2.3.20, and matches it on 9602 of 9602 corpus files. Its block indent is a constant 2 ([src/kotlin/visitor.ts:201](../../src/kotlin/visitor.ts)) and its trailing-comma pass only adds commas (Meta's `ONLY_ADD`).

The target is `java -jar ktfmt-0.65-with-dependencies.jar --kotlinlang-style <file>`, from <https://github.com/facebook/ktfmt/releases/download/v0.65/ktfmt-0.65-with-dependencies.jar> (Maven Central stops at 0.64).

Facts read for this plan, at ktfmt tag `v0.65` (`adee029c`):

- **Kotlin compiler: 2.4.10.** `gradle/libs.versions.toml` has `kotlin = "2.4.10"` (0.64 had `"2.3.20"`). nishfmt follows 2.4.10, not the newest Kotlin (2.4.21), because it has to parse as the ktfmt it copies does.
- **Doc engine unchanged.** ktfmt still depends on google-java-format 1.23.0, so `src/gdoc/` should not need to change.
- **Package rename.** ktfmt sources moved from `com.facebook.ktfmt` (`core/src/main/java/com/facebook/ktfmt/`) to `org.jetbrains.kotlinx.ktfmt` (`core/src/main/kotlin/org/jetbrains/kotlinx/ktfmt/`), and the visitor was split from one `KotlinInputAstVisitor.kt` into `format/visitor/*.kt`. Most of the 8174/3295-line diff is that move, so the port has to diff behaviour, not files.
- **`format/visitor/kotlinlang/`** (`KotlinLangInputAstVisitor`) is used only behind the undocumented `--experimental-engine` flag (`Formatter.kt:180`). `--kotlinlang-style` does not reach it. It is out of scope.

## Approach

Two stages, merged in order. `style` cannot start until `version` merges, because the kotlinlang corpus is ktfmt 0.65's output and both stages edit the same files. They stay two PRs anyway, because `version` is worth merging alone (nishfmt at 100% of ktfmt 0.65) if `style` stalls, and the requirements put the version first.

The merge gate adds one check CI cannot run: the lead rebuilds the corpus at the PR's head and runs `bash bench/corpus/cmp.sh dist/nishfmt kt` and `... java`. The kt result must be N / N, and Java's `differ.txt` must be byte-identical to the one at base `275573b`.

## Version

**Owns:** `src/kotlin/**`, `src/gdoc/**`, `tests/cases/kotlin/**`, `tools/kotlin/**`, `tools/dev/kotlin.ts`, `bench/corpus/mk.sh`, `README.md`, `docs/porting.md`, `docs/benchmarks.md`, `docs/languages.md`, `THIRD_PARTY_NOTICES.md`

### Baseline

1. Fetch only the kt and java repositories from [bench/corpus/repos.txt](../../bench/corpus/repos.txt), not all 90 (see Verification).
2. `KTFMT=<0.64 jar> bash bench/corpus/mk.sh kt`, build base, `bash bench/corpus/cmp.sh dist/nishfmt kt` → expect 9602 / 9602. Save `bench/work/out/kt/differ.txt` as the 0.64 baseline (outside the checkout).
3. `KTFMT=<0.65 jar> bash bench/corpus/mk.sh kt`, rerun `cmp.sh`, and put the count in the PR body as the starting point. The differing files are the work list.
4. Build the Java corpus once (`GJF=<google-java-format 1.28.0 all-deps jar from Maven Central>`) and save its `differ.txt` at base.

### Compiler 2.4.10

`git diff v2.3.20 v2.4.10` in JetBrains/kotlin, over `compiler/psi/parser/src` and `compiler/psi/psi-api/src/org/jetbrains/kotlin/{KtNodeTypes.java,lexer/}`, touches five files. `Kotlin.flex` and `KotlinExpressionParsing.java` do not change.

| Upstream change | nishfmt |
| --- | --- |
| `KotlinParsing.parseMemberDeclaration` — `companion` directly followed by `{` parses as `parseCompanionBlock()`, a class body, node `COMPANION_BLOCK` | [src/kotlin/parser.ts](../../src/kotlin/parser.ts), [src/kotlin/types.ts](../../src/kotlin/types.ts). Then check what ktfmt 0.65 prints for it, and port that too, even if it is ktfmt's fallback (or a rejection, which means `formatKotlin` answers `false`) |
| `COMMA_RPAR_COLON_EQ_SET` → `COMMA_RPAR_RBRACKET_COLON_EQ_SET` in destructuring-entry modifier recovery | [src/kotlin/parser.ts](../../src/kotlin/parser.ts) |
| `KDoc.flex` / `_KDocLexer.java` / `KDocLexer.java` — fences of any length ≥3 of `` ` `` or `~`, closing on the same char and length; new code-span states; escaped chars; `CODE_SPAN_TEXT` merged like `TEXT` | Wherever nishfmt ports the KDoc lexer: the unused-import scan of KDoc links ([src/kotlin/kdoclinks.ts](../../src/kotlin/kdoclinks.ts)) and anything else that consumes KDoc tokens |

Also check that the IntelliJ platform builder (`PsiBuilderImpl`) ported in [src/kotlin/builder.ts](../../src/kotlin/builder.ts) is unchanged in the platform version Kotlin 2.4.10 bundles, and update the module headers' version lines.

### ktfmt 0.65

From the 0.65 `CHANGELOG.md`, the changes that can affect output are below. The worker diffs the old monolithic visitor against the new split files for anything else that changes output, and ports that too.

- A trailing comma is added when a single parameter is formatted onto its own line (facebook/ktfmt#461).
- A managed trailing comma that pushes a line over the max width re-runs the layout, so the line breaks on the first pass (facebook/ktfmt#636).
- A scoping-function lambda with a chained call (`runCatching { ... }.getOrNull()`) that breaks on width breaks the chained call onto its own line with the lambda, on the first pass (Kotlin/ktfmt#640).
- `val`/`var` in destructuring entries are supported (facebook/ktfmt#637).
- The parser tells scripts from regular files by the file's extension (`.kts` vs `.kt`) — check that [src/kotlin/run.ts](../../src/kotlin/run.ts) uses the path the same way.
- `preserveLambdaBreaks` and anything else in `FormattingOptions` whose default or use changed.

Partial formatting (`--lines`, `--offset`), the IntelliJ plugin, GraalVM native image and `--stdin-name` do not change whole-file output, so they are out of scope.

### Tests

One case per ported change in `tests/cases/kotlin/<name>.kt` with `<name>.expected` from `java -jar ktfmt-0.65.jar <file>` (default style), each failing on the base binary. There is no `tests/cases/kotlin/` yet. [tests/run.sh](../../tests/run.sh) picks the directory up by itself.

### Docs

This stage changes only the versions, from ktfmt 0.64 to 0.65 and Kotlin 2.3.20 to 2.4.10: [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md), the module header comments, [bench/corpus/mk.sh](../../bench/corpus/mk.sh)'s comment, the `docs/benchmarks.md` tool table, `docs/porting.md`, `docs/languages.md` and README. Create `tools/kotlin/NOTES.md`, which does not exist yet. It records the two versions and why 2.4.10, the corpus baseline counts, and what each ported change was. `src/main.ts`'s usage line waits for `style`, so this stage does not touch every language.

## Style

**Owns:** the same globs as `version`, plus `src/main.ts` (the Kotlin usage line only).

### Options

At v0.65, `Formatter.kt`:

| | META_FORMAT (today) | KOTLINLANG_FORMAT (target) |
| --- | --- | --- |
| maxWidth | 100 | 100 |
| blockIndent | 2 | **4** |
| continuationIndent | 4 | 4 |
| trailingCommaManagementStrategy | ONLY_ADD | **COMPLETE** (adds, and removes redundant ones) |
| removeUnusedImports | true | true |
| preserveLambdaBreaks | true | true |

Port these values into one options record that the Kotlin engine reads, replacing the constants in `visitor.ts`, so every branch below reads the same value. nishfmt formats only kotlinlang style, with no flag for Meta.

### Branches

Every use of an option in ktfmt 0.65's main path (`format/`, `kdoc/`, not `visitor/kotlinlang/`), found with `grep -rn 'options\.\|blockIndent\|continuationIndent\|manageTrailingCommas\|removeRedundantTrailingCommas'`. Port each one that META and KOTLINLANG answer differently:

- `FormatterState` — `blockIndent` and every derived indent (`blockIndent + expressionBreakIndent` in `CallFormatter.kt:240`, the `}` tokens, `ControlFlowExpressionFormatter.kt:102-107`, `DeclarationFormatter.kt:532,682-695`).
- `RedundantElementManager.kt:52` — `removeRedundantTrailingCommas`, true only for COMPLETE. With it, trailing commas in lists that fit on one line are removed. Today's pass only adds them.
- `manageTrailingCommas` call sites (`ListFormatter.kt:155-218`, `ExpressionFormatter.kt:373`, `ControlFlowExpressionFormatter.kt:344`, `helpers.kt:566`). These are true for both styles, so confirm they are unchanged and say so in NOTES.md.
- `KDocWriter`, `MultilineStringFormatter(continuationIndent)` and `GroupInfo`'s `continuationIndent` — confirm each against the table.

Do not approximate this by changing the indent alone. Each branch either gets ported or gets a line in NOTES.md saying why it answers the same in both styles.

### Corpus

Add `--kotlinlang-style` to both `java -jar "$KTFMT"` calls in [bench/corpus/mk.sh](../../bench/corpus/mk.sh). Rebuild, then get `cmp.sh dist/nishfmt kt` to N / N, where N is the new file count less `failed.txt`.

### Tests

Add one `tests/cases/kotlin/` case per branch: block indent in a class, a function and control flow; the lambda `blockIndent + expressionBreakIndent` indent; redundant trailing-comma removal on a list that fits; a comma kept on a list that breaks; KDoc and multiline strings inside 4-space blocks. Each `.expected` comes from `--kotlinlang-style`, and each fails on the `version` binary. Regenerate the `version` stage's cases with `--kotlinlang-style`, because the style is now kotlinlang.

### Docs

- The README speed table's Kotlin row and settings section. The row reads "ktfmt 0.65, `--kotlinlang-style`", re-measured on the same 4-core container as both tools' times. The settings section no longer claims ktfmt's default style.
- The `src/main.ts` usage line becomes `ktfmt 0.65, kotlinlang style`.
- `docs/benchmarks.md`: the corpus results, the timing, and the ktrs row. Re-measure ktrs against the kotlinlang corpus, or drop the row, saying it was measured against 0.64 Meta style. Never keep a number nobody measured.
- `docs/porting.md`, `docs/languages.md`, `THIRD_PARTY_NOTICES.md` and `tools/kotlin/NOTES.md`, including the branch table above.

The PR title carries `!`, because every Kotlin file's output changes. Before 1.0, release-please treats that as a minor bump.

## Out of scope

- A Meta- or Google-style option in nishfmt. kotlinlang is the only Kotlin style.
- ktfmt's `--experimental-engine` (`format/visitor/kotlinlang/`), partial formatting, EditorConfig, and the IntelliJ plugin.
- Kotlin newer than 2.4.10.
- Any change to C++, Ruby, Swift, Rust, Dart or C#. A change to `src/gdoc/` must leave Java's `differ.txt` identical.
- CHANGELOG.md and version numbers, which belong to release-please.

## Verification

Run these in a worker container. The SessionStart hook installs nish, LLVM 18 and biome. Add `.nish/bin` to PATH if the hook's env file did not.

```bash
S=$TMPDIR/jars; mkdir -p $S
curl -sSL -o $S/ktfmt-0.65.jar https://github.com/facebook/ktfmt/releases/download/v0.65/ktfmt-0.65-with-dependencies.jar
curl -sSL -o $S/ktfmt-0.64.jar https://repo1.maven.org/maven2/com/facebook/ktfmt/0.64/ktfmt-0.64-with-dependencies.jar
curl -sSL -o $S/gjf-1.28.jar https://repo1.maven.org/maven2/com/google/googlejavaformat/google-java-format/1.28.0/google-java-format-1.28.0-all-deps.jar
# only the kt and java repositories, at their pinned commits
grep -E '^(kt|java) ' bench/corpus/repos.txt > $S/repos.txt   # then run fetch.sh's clone loop over that file, or clone each at its commit with depth 1
npm run build && npm test && npm run lint
KTFMT=$S/ktfmt-0.65.jar bash bench/corpus/mk.sh kt && bash bench/corpus/cmp.sh dist/nishfmt kt
GJF=$S/gjf-1.28.jar bash bench/corpus/mk.sh java && bash bench/corpus/cmp.sh dist/nishfmt java
```

Read each command's exit status, never a piped tail (CLAUDE.md).
