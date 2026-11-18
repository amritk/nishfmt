# Dart port notes

A port of `dart format` as shipped in the Dart SDK 3.14.1: the tall style
with each of its language-versioned variants, the short style used for code
at language 3.6 and older, and the project lookup that picks a file's
language version and page width. The SDK pins dart_style at 5a9534fad9ff
(`3.1.14-wip`, ten commits before the `v3.1.14` tag; its newest language
version is 3.13), and `package_config` 3.0.1-wip and `yaml` 3.2.0-wip at
dart-lang/tools d87eaf7946e7 (`DEPS` at tag 3.14.1). Port from those
revisions: `git clone https://github.com/dart-lang/dart_style && git
checkout 5a9534fad9ff`. The 3.14.0 and 3.14.1 SDKs pin the same dart_style,
and their corpus refs are byte-identical.

## Layout

| File | What |
| --- | --- |
| `src/dart/tokens.ts` | token kinds `T_*`, keywords `K_*` (reserved, built-in, contextual) |
| `src/dart/scanner.ts` | `DtTokens` (struct of arrays, comments per token, line numbers), the scanner, the `// @dart=` header |
| `src/dart/ast.ts` | node kinds `N_*` named after the analyzer's classes; `dtSig` documents each node's fields |
| `src/dart/parser.ts` | a recursive descent parser that follows fasta's decisions (type lookahead with `>>` splitting, `computeType`, record types, patterns, local functions, conditional speculation) and builds the analyzer's AST shapes |
| `src/dart/comments.ts` | `CommentWriter` and `SourceComment` |
| `src/dart/pieces.ts` | every `Piece` subclass as one `DtPiece` with a kind and generic fields; states, shapes, constraints, `allowedChildShapes`, pinning; `DT_STYLE`, the language-versioned switches |
| `src/dart/visitor.ts` | `AstNodeVisitor`, `PieceFactory`, `PieceWriter`, `DelimitedListBuilder`, `SequenceBuilder`, `ChainBuilder`, the ast extensions |
| `src/dart/solver.ts` | `Solver`, `Solution`, `SolutionCache`, `CodeWriter`, each piece's `format()`; the winner is written straight to the output |
| `src/dart/shortvisit.ts` | the short style's `SourceVisitor`, `ArgumentListVisitor` and `CallChainVisitor` |
| `src/dart/short.ts` | the short style's back end: `Chunk`, `ChunkBuilder`, `NestingLevel`, the `Rule` classes, `LineWriter`, `LineSplitter`, `SolveState` and its queue |
| `src/dart/config.ts` | `ConfigCache`: the package config (`findPackageConfig`, the JSON parse and checks, `packageOf`), `analysis_options.yaml` (a YAML subset, includes, `merge`), cached per directory in module storage |
| `src/dart/features.ts` | the newest language feature a file's syntax needs (the analyzer's `flags.dart` release versions), checked against its version after the parse |
| `src/dart/run.ts` | `formatDart`: the project, then the style from the `// @dart=` header or the package's version, `// dart format width=N` |

## Behaviour

- The language version comes from the `// @dart=x.y` comment before the
  first token, else from the file's package in the nearest
  `.dart_tool/package_config.json` (found walking up from the file's
  directory as dart:io writes it; the package whose `rootUri`, not
  `packageUri`, holds the file, the innermost when roots nest), else it is
  3.13, the CLI's default. `pubspec.yaml` is never read. The comment wins for
  the parse as well as the style: `// @dart=3.8` in a 3.6 package parses
  `[?a]`.
- The page width is `// dart format width=N` (tall style only), else
  `formatter: page_width` from the nearest `analysis_options.yaml` (its
  `include:`s, relative or `package:` through the package config, merged
  as `merge_options.dart` does), else 80. The short style takes the
  configured width too.
- Left untouched, where dart format warns and falls back or this reader
  cannot follow the project exactly: a package config that fails any of
  package_config's checks, an include that cannot be read or resolved, YAML
  outside the subset `config.ts` reads (anchors, tags, block or multi-line
  scalars, escapes, tabs, a duplicate key), a `page_width` int that is not
  from 1 to 10^8 (a value that is not an int is ignored, as dart_style's
  `{'page_width': int width}` ignores it), any `trailing_commas` but
  `automate` (`preserve` is not implemented), and syntax of a language
  feature the file's version does not enable (below).
- The project is read once per directory per process (`D` entries in
  `config.ts`'s table) and each package config and options file once per
  process (`C`, `Y`), as `strace -f -e trace=openat` over dart5 shows.
- 3.6 and older: the short style. 3.7: the tall style's 3.7 variant
  (`DT_STYLE[0]`: AssignPiece3Dot7, the 3.7 infix, chain, for-in and variable
  pieces, collapsible indentation, its own invalidation rule, no eager
  argument splitting). 3.8 - 3.12: the tall style without the 3.13 changes
  (`DT_STYLE[1]` off: pieces bound by page width while formatting rather than
  pinned first, no soft text, the older if-case shapes, infix type tests,
  no block-shaped parameter lists, no directive sections or blank lines
  around mixins and extension types). 3.13 on: the current tall style.
- The parser follows the version where the analyzer's parse differs without
  an error: before 3.0 a `case` holds an expression, and before 3.13 `var`
  and `final` are fine on any parameter. Syntax that an older version lacks
  is parsed, and then the file is left alone (`features.ts`, Version gates).
- Files that do not parse, or that the analyzer would reject in a way
  `dart format` reports, are left alone; so are files where dart_style would
  throw (a short-style rule index from another line, two solve states it
  assumes cannot tie).
- The output uses `\r\n` when the first line break in the file is `\r\n`,
  else `\n`, as `dart format` does.
- `// dart format off` / `on` and `// dart format width=N` are supported (the
  tall style only, as in dart_style).
- Known quirks copied on purpose: `ConstructorPiece.forEachChild` visits the
  redirect twice and never the parameters; `TextPiece` hard newline and total
  characters ignore its comment children; the short style's merged empty
  splits harden their rule.

## Version gates

Every branch dart_style takes on the language version at the pin, and every
analyzer feature enabled by version that changes the parse without an
error, with the nishfmt code that takes it. dart6 (every version from 2.12
to 3.14) and dart5 (a package at 3.8) check them; no side was wrong.

| Gate | Where at the pin | nishfmt | Side at each version |
| --- | --- | --- | --- |
| short style: version ≤ 3.6 (`> latestShortStyleLanguageVersion` is tall) | `DartFormatter.formatSource` | `run.ts`, the `DtsVisitor` branch | short up to 3.6, tall from 3.7 |
| `is3Dot7`: `== 3.7` | `FormattingStyle`, ~40 users in `front_end/` | `DT_STYLE[0]` | 3.7 only |
| `>= 3.13`: soft overflow, page-width pinning, block parameter lists and type tests, directive sections, mixin blank lines, single-element chain targets, representation commas; `< 3.13` if-case guard blocks | `FormattingStyle` | `DT_STYLE[1]` | off 3.7 to 3.12, on from 3.13 and with no version |
| `>= 3.10` trailing comma after enum values | `FormattingStyle`, with `trailing_commas: preserve` only | preserve leaves the file untouched | never reached |
| the default: `DartVersionHistory.latest`, 3.13 | `io.dart` `_createFormatter` | `verMajor` -1 takes every 3.13 side | 3.13; the 3.14.1 analyzer enables no feature at 3.14, so 3.13 and 3.14 parse alike |
| above the newest (a package or comment at 3.14 or 4.0) | no clamp or error | `== 3.7` / `< 13` checks | the 3.13 style, newest parse |
| below 2.12 (a package at 2.9, 0.0) | no clamp or error; null safety stays on (`int?` parses at `@dart=2.9`) | as any version below 3.0 | short style, no patterns |
| patterns, 3.0: before, a `case` holds an expression | analyzer `FeatureSet` | `DtParser.patterns` | expression before 3.0 |
| primary constructors, 3.13: before, `var` and `final` are fine on any parameter; from 3.13 an error | analyzer | `DtParser.primaryCtors` | allowed before 3.13 |

The features that only add syntax are errors at an older version, so dart
format rejects the file; `features.ts` finds the newest one a file uses
and `formatDart` leaves the file untouched when its version is older. Each
row was checked against dart format 3.14.1 at the version below and at the
release, and each has a case in `tests/cases/dart/pkg-gates/`, one
package at the version below (untouched) and one at the release (dart
format's output). Every release input also has a line dart format must
change, so a gate that fired at the release would fail its case:

| Feature (analyzer name) | From | Syntax nishfmt checks |
| --- | --- | --- |
| nonfunction-type-aliases | 2.13 | `typedef T = <not a function type>;` |
| generic-metadata | 2.14 | `@A<T>()` |
| triple-shift | 2.14 | `>>>`, `>>>=`, `operator >>>` |
| constructor-tearoffs | 2.15 | `f<T>` and `List<T>` as expressions, `C.new`, a constructor named `C.new` |
| enhanced-enums | 2.17 | enum type parameters, `with`, `implements`, members, a `;` after the values, arguments on a value |
| super-parameters | 2.17 | `super.x` parameters |
| named-arguments-anywhere | 2.17 | a positional argument after a named one |
| unnamed-libraries | 2.19 | `library;` |
| records | 3.0 | record literals and record types |
| patterns | 3.0 | switch expressions, `case` clauses, pattern declarations, assignments and for parts, every pattern node |
| class-modifiers, sealed-class | 3.0 | `base`, `interface`, `final`, `sealed`, `mixin class`, `base mixin`, on class declarations and aliases |
| inline-class | 3.3 | extension types |
| digit-separators | 3.6 | `_` in a number |
| null-aware-elements | 3.8 | `?e` elements, `?k: ?v` entries |
| dot-shorthands | 3.10 | `.name`, `.name()`, `.new()` |
| primary-constructors | 3.13 | a primary constructor on a class or enum, its `this :` body, `new()`, `class A;`, `enum E;`, `extension type E(int i);` |

Features at 2.12 and before (null safety, extension methods, spreads,
collection `if`, set literals) are on at every version dart format takes.
wildcard-variables (3.7) and private-named-parameters (3.12) have no
syntactic check (`void f(_, _)` and `{this._x}` format at the version
before). On dart6, the files dart format rejects for a feature their
version does not enable went from 1265 of 2372 left untouched to 2372 of
2372 (dart3 1252 to 2019 of 2019, dart4 795 to 1655 of 1655, dart5 1138 to
1747 of 1747).

## Corpora

| Corpus | Files | Rejected | Identical |
| --- | --- | --- | --- |
| `/work/c/dart` | 10334 | 21 | 10313 / 10313 |
| `/work/c/dart2` | 10334 | 21 | 10313 / 10313 |
| `/work/c/dart3` | 10334 | 2116 | 8218 / 8218 |
| `/work/c/dart4` | 10334 | 1671 | 8663 / 8663 |
| `dart5` | 10334 | 1763 | 8571 / 8571 |
| `dart6` | 10334 | 2485 | 7849 / 7849 |

- dart2: the files reformatted first with `--page-width 40`, `--page-width
  120` or `--language-version=3.6` (chosen by `cksum % 3`, `mk2.sh`), plain
  `dart format` as the reference.
- dart3 (`mk3.sh dart3`): every file given a first line `// @dart=2.19` (a
  quarter, by `cksum % 4`) or `// @dart=3.6`, so all of it is short style.
- dart4 (`mk3.sh dart4`): `// @dart=3.7`, `3.8` or `3.12` (`cksum % 3`).
- dart5 (`mk5.sh`): each repository directory a package at `sdk: ^3.8.0`
  with the package config `dart pub get --offline` writes, so the version
  comes from the project; its package files are not counted.
- dart6 (`mk3.sh dart6`): `// @dart=` one of 2.12 to 2.19, 3.0 to 3.14
  (`cksum` over the 23 versions).
- All built with Dart SDK 3.14.1 (`DART=<sdk>/bin/dart`); with main's binary
  before the project lookup, dart5 was 7439 / 8571.
- The rejected files are mostly newer syntax at an old version (primary
  constructors, dot shorthands, records and patterns at 2.19).

## Speed

Measured on the shared 4-core machine (noisy; instruction counts with
valgrind are the steadier measure, see `ir.sh`).

| | dart (tall) | dart3 (short) |
| --- | --- | --- |
| `dart format` | 55.2 s wall (63.7 s user) | 24.4 s |
| `taskset -c 0 dart format` | 59.9 s | |
| `nishfmt -i` (4 cores) | 3.4 s | 3.8 s |
| `taskset -c 0 nishfmt -i -j 1` | 8.8 s | 6.5 s |

Best of two or three runs, with load averages of 7 to 50 from other jobs.

What made it fast, beyond writing it natively:

- writers that only measure during the search, reused per depth, with each
  solution's states in stamped arrays for O(1) lookups (also while binding);
- an expansion binds the preceding expand pieces once, on a base solution,
  instead of once per new solution;
- the winner emitted straight to the output, no intermediate text;
- `>>` splits predicted by the scanner (the parser verifies them), instead
  of shifting every later token per split;
- token arrays sized by estimate, line numbers counted while scanning, code
  text appended as bytes and turned into a string once;
- a fast path for single-line code leaves while measuring.

Remaining profile (every 10th file): `formatInline` with `write` and
`flushWhitespace` is about a quarter of the instructions; it does what
dart_style does (each solution re-measures the tree outside separately
formatted children), so further wins there need a different search. Piece
construction (`DtPieces.make`, small arrays) and the per-character output
copy in `src/core/out.ts` come next. The short style is ported directly
(strings concatenated per chunk, maps for the overlap tests) and has not
been tuned.

## Tools

- `tools/dev/dart.ts`: one-file driver (`FFDEBUG=1` says why a file is left
  alone, `FFDTDUMP=tokens|ast` dumps), and `-prof <list>` for phase times in
  one process (the way to catch state that leaks between files).
- `astdump.dart`, `astcmp.py`, `astcmp.sh`: compare the parser's AST with the
  analyzer's over a directory.
- `sample.sh`: the dev driver against the reference over a corpus.
- `mk2.sh`, `mk3.sh`, `mk5.sh`: build the dart2, dart3, dart4, dart6 and dart5 corpora.
- `ir.sh`: valgrind instruction counts on four heavy files.
- `cases.sh`: checks (and with `--regen` regenerates from `dart format`,
  `$DART`) the cases in `tests/cases/dart`, including the `pkg-*/`
  projects, each run in a scratch copy; a `NAME.untouched` marker (its text
  the reason) means nishfmt must leave `NAME.dart` alone.
