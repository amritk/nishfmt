# Kotlin port notes

`src/kotlin/` ports ktfmt 0.65 in its kotlinlang style (`--kotlinlang-style`,
`Formatter.KOTLINLANG_FORMAT`), on a lexer and parser ported from the Kotlin
compiler 2.4.10. It first ported 0.65 in the default (Meta) style; the
sections below on 0.65's changes were measured in that style, and
[Kotlinlang style](#kotlinlang-style) says what moving to kotlinlang changed.

## Versions

- **ktfmt 0.65** is tag `v0.65` (`adee029c`) of
  <https://github.com/facebook/ktfmt>. Its jar is only on the GitHub release,
  <https://github.com/facebook/ktfmt/releases/download/v0.65/ktfmt-0.65-with-dependencies.jar>;
  Maven Central stops at 0.64. 0.65 moved the sources from
  `com.facebook.ktfmt` to `org.jetbrains.kotlinx.ktfmt` and split
  `KotlinInputAstVisitor.kt` into `format/visitor/*Formatter.kt`, so most of
  the 0.64 to 0.65 diff is a move; the port follows behaviour, not files.
  `format/visitor/kotlinlang/` runs only behind the undocumented
  `--experimental-engine` flag and is not ported.
- **Kotlin 2.4.10**, not the newest Kotlin, because it is the version ktfmt
  0.65 builds against (`gradle/libs.versions.toml`: `kotlin = "2.4.10"`;
  0.64 had `"2.3.20"`). nishfmt has to parse as the ktfmt it copies does.
  Both compiler versions build with IntelliJ SDK 251.27812.49, so the
  `PsiBuilderImpl` behind `builder.ts` is unchanged.
- google-java-format stays 1.23.0 under ktfmt 0.65, so `src/gdoc/` keeps its
  engine; the one addition is a tok flag for a comment that is neither `//`
  nor `/*` (the shebang), which Java never sets.

### `src/gdoc/`'s version

`src/gdoc/` is credited to google-java-format 1.28.0, the sources it was
ported from, in each module's header and in THIRD_PARTY_NOTICES.md. Kotlin
runs it as ktfmt 0.65's bundled 1.23.0, and Java uses its token input and
comment helpers under 2.0.0 (Java's layout is `src/java/layout/`). Diffing
the three versions' sources for what `src/gdoc/` ports:

| `src/gdoc/` | Ports | 1.23.0 to 1.28.0 | 1.28.0 to 2.0.0 |
| --- | --- | --- | --- |
| `engine.ts` | `OpsBuilder`, `DocBuilder`, `Doc`, `Indent`, `Output`, `JavaOutput`, `CommentsHelper`, `Newlines` | comments and formatting only | the engine is rewritten as 2.0.0's `layout/`, which Java runs (`src/java/layout/`); what Java still takes from `engine.ts` (its constants, the failure flag, `CommentsHelper.reformatParameterComment`, an identifier test) is unchanged, and `Newlines` only gains methods |
| `input.ts` | `Input`, `InputOutput`, `JavaInput`'s toks | only how javac's diagnostics are read | none in these classes' toks; `JavaInput`'s javadoc test (`///` only on JDK 23 or newer) is in `src/java/lexer.ts` and its range formatting in `src/java/partial.ts`, both credited to 2.0.0 |
| `comments.ts` | `JavaCommentsHelper`'s line-comment, block-comment and javadoc re-indentation, `Newlines` | none in these helpers (1.28.0 trims `//` lines at both ends, in `src/java/comments.ts`) | the `noinspection` / `$NON-NLS-n$` test is split in two with the same result; widths and indents come from options whose defaults are the old constants; Markdown javadoc positions, empty on JDK 21 |

So under nishfmt's fixed settings (Google style, 100 columns, JDK 21) the
ported parts give the same output in all three versions, and one credit,
1.28.0, holds for both languages.

## Corpus

The corpus is the kt repositories of `bench/corpus/repos.txt`, 9604 files,
of which the reference rejects 2 (with 0.64 and with 0.65).

| | ktfmt 0.64 reference | ktfmt 0.65 reference |
| --- | ---: | ---: |
| nishfmt at the 0.64 port | 9602 / 9602 | 7547 / 9602 |
| nishfmt at the 0.65 port | | 9602 / 9602 |

ktfmt 0.65's own test cases (`core/src/test/resources/cases/**/*.input`,
540 files, each formatted with the 0.65 jar at its defaults, `.kts` where
the case says `FILE_TYPE SCRIPT`) are a second check: 537 match, and
nishfmt skips the other 3. One is a `.kt` file with a top-level statement,
which ktfmt 0.65 rejects too. The other two are enum entries ending in
`;` with nothing after it (`enum class A { X; }`), which nishfmt rejected
before this port as well: the passes around the pretty printer leave text
that does not parse, so the file is skipped, never mis-formatted. That was
true of the Meta-style port only: in kotlinlang style the trailing-comma
pass reads the `;` as dropped, and nishfmt formats `enum class A { X; }` as
`enum class A {\n    X,\n}`, as `ktfmt --kotlinlang-style` does.

## What 0.65 changed, and where it is ported

From the Kotlin compiler, 2.3.20 to 2.4.10:

| Upstream | nishfmt |
| --- | --- |
| `KotlinParsing.parseMemberDeclaration`: `companion {` parses as `parseCompanionBlock()`, a class body under `COMPANION_BLOCK` (`KtNodeTypes`) | `parser.ts` `parseCompanionBlock`, `types.ts` `N_COMPANION_BLOCK`. ktfmt has no formatter for `KtCompanionBlock`, so `KtTreeVisitorVoid` visits its modifier list and class body, as the visitor's default case does |
| `KotlinParsing`: `COMMA_RPAR_COLON_EQ_SET` becomes `COMMA_RPAR_RBRACKET_COLON_EQ_SET` in the destructuring-entry modifier recovery | `parser.ts` |
| `KDoc.flex`, `_KDocLexer.java`, `KDocLexer.java`: fences of three or more backticks or tildes, closed only by the same character and length; fences start only at the start of a line; backtick runs open code spans (`CODE_SPAN_TEXT`), so a link inside one is no link; a backslash escapes any ASCII punctuation | `kdoclinks.ts`, the KDoc links that keep an import used |

From ktfmt, 0.64 to 0.65:

| Upstream | nishfmt |
| --- | --- |
| `KotlinCode`, `Parser.parse` (ad4a256): the file's extension picks the parse, `.kt` a regular file (`parseFile`), anything else, standard input included, a script; 0.64 parsed everything as a script | `run.ts` `e.script`, `parser.ts` `parseFile`, `parseTopLevelDeclaration` |
| `FileFormatter.formatFile` (169ba5c): files and scripts share one loop, a forced break and `shouldPreserveLineBreak` before each child (preserve after nothing and between properties, none after a `context(...)` initializer, a blank line otherwise) | `visitor.ts` `formatFile` |
| `Formatter`, `KotlinTok.isComment` (e79ee63): the shebang is no longer cut off and put back; it is a comment tok of the parsed file, so its trailing spaces go and a blank line after it is kept before a comment | `run.ts`, `input.ts`, `gdoc/input.ts` `TF_OTHER_COMMENT` |
| `TrailingCommas` (#461, be9edc1): a comma is added to a one-item list that is on more than one line | `passes.ts` |
| `Formatter.prettyPrintAndManageTrailingCommas` (#636, fa27680): the layout runs again while the trailing-comma pass adds commas | `run.ts` |
| `CallFormatter.formatChainedScopingFunction` (#640, 2bb150d): the break before each chained selector is outside its block, at the lambda's level | `visitor.ts` `visitChainedScopingFunction` |
| `DeclarationFormatter.formatDestructuringDeclarationEntry` (#637, beabfde): an entry's own `val`/`var` | `visitor.ts` |
| `DeclarationFormatter.formatDestructuringDeclaration` (3e1dfeb): annotations on a destructuring declaration, then a forced break | `visitor.ts` `visitDestructuringDeclaration` |
| `TypeFormatter.formatType` (6fb59be): every modifier list of a type, inside and outside its parentheses | `visitor.ts` `visitTypeReference` |
| `AnnotationFormatter` (b7a6bde): an annotated expression's top-level `@[A B]` groups and `@C` entries, in order | `visitor.ts` `visitAnnotatedExpression` |

The block-like call formatting of a95ec2e was reverted before the release
(e11fc40, dba5965) and changes nothing. 874c483 removed dead tabular
alignment code. `FormattingOptions` gained only `experimentalEngine`.

## Kotlinlang style

`--kotlinlang-style` selects `Formatter.KOTLINLANG_FORMAT`, which is
`FormattingOptions(blockIndent = 4, continuationIndent = 4)` with every other
field at its default. nishfmt formats Kotlin only in this style, and has no
flag for Meta or Google style. The options live in `src/kotlin/options.ts`.

| Option | META_FORMAT | KOTLINLANG_FORMAT |
| --- | --- | --- |
| `maxWidth` | 100 | 100 |
| `blockIndent` | 2 | **4** |
| `continuationIndent` | 4 | 4 |
| `trailingCommaManagementStrategy` | `ONLY_ADD` | **`COMPLETE`** |
| `removeUnusedImports` | true | true |
| `preserveLambdaBreaks` | true | true |

Every read of an option on the path `--kotlinlang-style` takes (`format/`
and `kdoc/` at v0.65, not `format/visitor/kotlinlang/`, which only
`--experimental-engine` reaches), from
`grep -rn 'options\.\|blockIndent\|continuationIndent\|manageTrailingCommas\|removeRedundantTrailingCommas'`:

| Upstream | Styles differ? | nishfmt |
| --- | --- | --- |
| `FormatterState`: `blockIndent = Indentation.Const(options.blockIndent)`, read through `helpers.kt:109` everywhere a block opens: class, function and accessor bodies, `{` and `}` tokens, `ControlFlowExpressionFormatter.kt:102-107` (`when`), `DeclarationFormatter.kt:532` (property accessors), `:682-695` (`emitBracedBlock`), `CallFormatter.kt:267` (a lambda's `}`) | yes, 2 against 4 | `visitor.ts` `KVisitor.blockIndent`, from `K_BLOCK_INDENT` |
| `CallFormatter.kt:240`: a lambda's body indent `Indentation.If(brokeBeforeBrace, blockIndent + expressionBreakIndent, blockIndent)` | yes, through `blockIndent` | `visitor.ts` `blockPlusExpressionBreakIndent`, `K_BLOCK_INDENT + K_CONTINUATION_INDENT` |
| `FormatterState`: `expressionBreakIndent = Indentation.Const(options.continuationIndent)`, and its negations and doubles | no, 4 in both | `K_CONTINUATION_INDENT` |
| `RedundantElementManager.kt:52`: `trailingCommaManagementStrategy.removeRedundantTrailingCommas` runs `TrailingCommas.Detector`, which drops the trailing comma of every managed list (value arguments and parameters, lambda parameters, type arguments and parameters, collection literals, `when` entries, enum entries) before the layout | yes: true for `COMPLETE`, false for `ONLY_ADD` | `passes.ts` `detectTrailingCommas` and `managedTrailingComma`, in `dropRedundant` and the combined passes (which mark the dropped commas so the comma pass reads the tree as if they were gone) |
| `RedundantElementManager.kt:97` (`addRedundantElements`), `ListFormatter.kt:155-218`, `ExpressionFormatter.kt:373`, `ControlFlowExpressionFormatter.kt:344`, `helpers.kt:566`: `manageTrailingCommas`, which is `strategy != NONE` | no, true in both | unchanged: the comma pass still adds a comma to a list on more than one line, and the visitor never wraps lists in a block |
| `RedundantElementManager.kt:39`: `removeUnusedImports` | no, true in both | unchanged |
| `CallFormatter.kt:311`: `preserveLambdaBreaks` | no, true in both | unchanged |
| `Formatter.kt:101,123`: `MultilineStringFormatter(options.continuationIndent)` | no, 4 in both | `mlstring.ts`, from `K_CONTINUATION_INDENT` |
| `GroupInfo.kt:31-122`: `computeGroups(continuationIndent)`, a short first part groups with the next when shorter than the continuation indent | no, 4 in both | `visitor.ts`, from `K_CONTINUATION_INDENT` |
| `Formatter.kt:156,166`: `KDocCommentsHelper(lineSeparator, options.maxWidth)` and `computeBreaks(..., options.maxWidth, ...)` | no, 100 in both | `run.ts` sets the engine's `maxWidth`, `kdoc.ts` its table width, from `K_MAX_WIDTH` |
| `kdoc/KDocWriter.kt:58`: `KDocWriter(blockIndentCount, ...)` | no: nothing constructs a `KDocWriter` | not ported |
| `kdoc/*`: the `KDocFormattingOptions` reads (`convertMarkup`, `collapseSpaces`, `hangingIndent`, ...) | no: `KDocCommentsHelper` builds the same `KDocFormattingOptions` from `maxWidth` alone in every style | unchanged |
| `Formatter.kt:162,180`: `debuggingPrintOpsAfterFormatting`, `useExperimentalEngine` | no, false in both | not ported |

Because `COMPLETE` drops a trailing comma before the layout, a list that
fits on one line loses it, and the visitor no longer forces it onto one item
per line (`forceMultiline = trailingComma != null`); the comma pass after the
layout puts the comma back where the list still breaks. An enum's `;` after
its last entry is a redundant semicolon in both styles, so `A, B,;` becomes
`A, B,` on lines of their own.

### Corpus

The kt repositories of `bench/corpus/repos.txt` again, the reference built
by `mk.sh kt` with `--kotlinlang-style`: 9604 files, of which the
reference rejects 2.

| | ktfmt 0.65, kotlinlang reference |
| --- | ---: |
| nishfmt at the Meta port (main at 4ded8fb) | 734 / 9602 |
| nishfmt in kotlinlang style | 9602 / 9602 |

## Tests

Each change above has a case in `tests/cases/kotlin/`. Every `.expected`
comes from the 0.65 jar with `--kotlinlang-style`, including the cases the
Meta port added, which were regenerated; `trailing_comma_relayout.kt` got a
new input, whose comma pushes the line to 101 columns at 4-space indent. The
`kotlinlang_*` cases cover the style: block indent in classes, functions,
accessors, control flow and `when`; a lambda's body indent after a break
before its brace; trailing commas removed from lists that fit, of every
managed kind; commas kept or put back on lists that break; and KDoc and
multiline strings under 4-space blocks. Each fails on the Meta port. The
`unclosed_*.kts` cases keep their input as expected: ktfmt rejects them in
every style.
