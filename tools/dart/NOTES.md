# Dart port notes

A port of `dart format` as shipped in the Dart SDK 3.14 (dart_style 3.1.14,
page width 80): the tall style with each of its language-versioned
variants, and the short style used for code at language 3.6 and older.
Reference sources: dart_style v3.1.14 in `/opt/ref/dart_style`, the analyzer
and `_fe_analyzer_shared` it depends on in `~/.pub-cache` (from `dart pub
get` in `/work/repos/dart-lang_dart_style`).

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
| `src/dart/run.ts` | `formatDart`: picks the style from the `// @dart=` header, `// dart format width=N` |

## Behaviour

- The language version comes from the `// @dart=x.y` comment before the
  first token, else it is 3.14 (the CLI's default; dart format would also
  look at the package config, which the corpora do not have).
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
  is still accepted, but such files are ones `dart format` rejects.
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

## Corpora

| Corpus | Files | Rejected | Identical |
| --- | --- | --- | --- |
| `/work/c/dart` | 10334 | 21 | 10313 / 10313 |
| `/work/c/dart2` | 10334 | 21 | 10313 / 10313 |
| `/work/c/dart3` | 10334 | 2116 | 8218 / 8218 |
| `/work/c/dart4` | 10334 | 1671 | 8663 / 8663 |

- dart2: the files reformatted first with `--page-width 40`, `--page-width
  120` or `--language-version=3.6` (chosen by `cksum % 3`, `mk2.sh`), plain
  `dart format` as the reference.
- dart3 (`mk3.sh dart3`): every file given a first line `// @dart=2.19` (a
  quarter, by `cksum % 4`) or `// @dart=3.6`, so all of it is short style.
- dart4 (`mk3.sh dart4`): `// @dart=3.7`, `3.8` or `3.12` (`cksum % 3`).
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
- `mk2.sh`, `mk3.sh`: build the dart2, dart3 and dart4 corpora.
- `ir.sh`: valgrind instruction counts on four heavy files.
- `cases.sh`: checks (and with `--regen` regenerates from `dart format`) the
  cases in `tests/cases/dart`.
