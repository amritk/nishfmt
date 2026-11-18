# Kotlin port notes

`src/kotlin/` ports ktfmt 0.65 in its default (Meta) style, on a lexer and
parser ported from the Kotlin compiler 2.4.10.

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
that does not parse, so the file is skipped, never mis-formatted.

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

## Tests

Each change above has a case in `tests/cases/kotlin/`, its `.expected` from
the 0.65 jar at its defaults, and each fails on the 0.64 port.
