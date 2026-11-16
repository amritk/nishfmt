# Dart port notes

A port of `dart format` as shipped in the Dart SDK 3.14 (dart_style 3.1.14,
the tall style, page width 80). Reference sources: dart_style v3.1.14 in
`/opt/ref/dart_style`, the analyzer and `_fe_analyzer_shared` it depends on
in `~/.pub-cache` (from `dart pub get` in `/work/repos/dart-lang_dart_style`).

## Layout

| File | What |
| --- | --- |
| `src/dart/tokens.ts` | token kinds `T_*`, keywords `K_*` (reserved, built-in, contextual) |
| `src/dart/scanner.ts` | `DtTokens` (struct of arrays, comments per token, line numbers), the scanner, the `// @dart=` header |
| `src/dart/ast.ts` | node kinds `N_*` named after the analyzer's classes; `dtSig` documents each node's fields |
| `src/dart/parser.ts` | a recursive descent parser that follows fasta's decisions (type lookahead with `>>` splitting, `computeType`, record types, patterns, local functions, conditional speculation) and builds the analyzer's AST shapes |
| `src/dart/comments.ts` | `CommentWriter` and `SourceComment` |
| `src/dart/pieces.ts` | every `Piece` subclass as one `DtPiece` with a kind and generic fields; states, shapes, constraints, `allowedChildShapes`, pinning |
| `src/dart/visitor.ts` | `AstNodeVisitor`, `PieceFactory`, `PieceWriter`, `DelimitedListBuilder`, `SequenceBuilder`, `ChainBuilder`, the ast extensions |
| `src/dart/solver.ts` | `Solver`, `Solution`, `SolutionCache`, `CodeWriter`, each piece's `format()`; the winner is written straight to the output |
| `src/dart/run.ts` | `formatDart`, version check, `// dart format width=N` |

## Behaviour

- Only the tall style at language version 3.13 and later is ported (all of
  the style flags in `lib/src/front_end/` for >= 3.13 are fixed on). A file
  whose `// @dart=x.y` header is older than 3.13 is left alone (`formatDart`
  answers false). The short style (< 3.7, `lib/src/short/`, about 9k lines)
  and the 3.7 - 3.12 tall variants are not ported.
- Files that do not parse, or that the analyzer would reject in a way
  `dart format` reports (for instance `var`/`final` on a parameter outside a
  primary constructor), are left alone.
- The output uses `\r\n` when the first line break in the file is `\r\n`, else `\n`, as `dart format` does.
- `// dart format off` / `on` and `// dart format width=N` are supported.
- Known quirks copied on purpose: `ConstructorPiece.forEachChild` visits the
  redirect twice and never the parameters; `TextPiece` hard newline and total
  characters ignore its comment children.

## Corpus

`/work/c/dart`: 10334 files, 21 that `dart format` rejects (failed.txt).
`/work/c/dart2`: the same files reformatted first with `--page-width 40`,
`--page-width 120` or `--language-version=3.6` (chosen per file by
`cksum % 3`, see `mk2.sh`), with the plain `dart format` output as reference.

`cmp.sh` results (both corpora): 10310 / 10313 identical. The three left are
files with an old `// @dart=` header (fonts.pb.dart at 3.3, two pigeon mocks
at 2.19 in dart; fonts.pb.dart, one mock and flutter_module_books/api.dart at
2.12 in dart2), which need the short style. Six corpus files are skipped for
their version in all; the other three are already formatted.

Note: `bench/corpus/mk.sh` writes the dart `failed.txt` entries without the
leading `./` that `cmp.sh` expects; the corpus data here was fixed by hand.

## Speed

Measured on the shared 4-core machine (noisy; instruction counts with
valgrind are the steadier measure, see `ir.sh`).

- `dart format` over dart/raw: about 60 s wall, 65 s user.
- fastfmt: see the final numbers in the commit log and the hand-off report.
  With the driver's malloc tunables a single core takes about 9.5 s
  (scan 0.4, parse 0.4, pieces 1.7, solve 5.4, output 1.3).

What made it fast, beyond writing it natively:

- writers that only measure during the search, reused per depth, with each
  solution's states in stamped arrays for O(1) lookups (also while binding);
- the winner emitted straight to the output, no intermediate text;
- `>>` splits predicted by the scanner (the parser verifies them), instead
  of shifting every later token per split;
- token arrays sized by estimate, line numbers counted while scanning, code
  text appended as bytes and turned into a string once;
- a fast path for single-line code leaves while measuring.

Remaining profile (every 10th file): `formatInline` and `bind` are about a
quarter of the instructions; they do what dart_style does (each solution
re-measures the tree outside separately formatted children), so further
wins there need a different search, not the same one faster. Piece
construction (`DtPieces.make`, small arrays) and the per-character output
copy in `src/core/out.ts` are next.

## Tools

- `tools/dev/dart.ts`: one-file driver (`FFDEBUG=1` says why a file is left
  alone, `FFDTDUMP=tokens|ast` dumps), and `-prof <list>` for phase times.
- `astdump.dart`, `astcmp.py`, `astcmp.sh`: compare the parser's AST with the
  analyzer's over a directory.
- `sample.sh`: the dev driver against the reference over a corpus.
- `mk2.sh`: builds the dart2 corpus.
- `ir.sh`: valgrind instruction counts on four heavy files.
- `cases.sh`: checks (and with `--regen` regenerates from `dart format`) the
  cases in `tests/cases/dart`.
