# C++

nishfmt's C++ formatter matches `clang-format` 23.1.5 with
`{BasedOnStyle: LLVM, ColumnLimit: 120}` byte for byte (23.1.6 has the same
`clang/lib/Format` and formats identically; PyPI has no 23.1.6 wheel). It is a rewrite, not
a port: its own lexer, parser, classifier and data layout, written to make
the same decisions clang-format makes, with its rules and penalties checked
against clang-format's behaviour and source.

## What it leaves alone

- regions between `// nishfmt off` and `// nishfmt on`, and between
  `// clang-format off` and `// clang-format on`;
- whole files that do not parse, such as files with unbalanced brackets or an
  unterminated literal. These count as skipped.
- Objective-C beyond declarations: a header with literals, `@implementation`
  or method bodies is left untouched.

`--width` and `--indent` change the column limit (120) and indent width (2)
for C++ only; every other language uses its reference tool's defaults.

## Results by repository

Measured on a 4-core cloud container against clang-format 18.1.3, before
the move to 23.1.5, and not measured again since. The
reference for each file is clang-format's fixed point: its output on the
repository's original source, rerun until it stops changing (one run is not
always stable; a few files never settle and are left out, as are files
clang-format fails on under a 4 GB memory cap). "Identical" counts files whose
nishfmt output matches that fixed point byte for byte, from one nishfmt run.
clang-format ran one file per process, two at a time; nishfmt ran once over
the whole tree with 4 workers. Peak memory is the largest single process.

| Repository | Files | Identical | clang-format | nishfmt | Peak memory, clang-format | Peak memory, nishfmt |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| leveldb | 132 | 100.0% | 1.4 s | 0.05 s | 66 MB | 17 MB |
| googletest | 157 | 100.0% | 3.9 s | 0.24 s | 124 MB | 65 MB |
| bitcoin | 1537 | 99.7% | 20.4 s | 0.66 s | 270 MB | 194 MB |
| folly | 2398 | 99.8% | 29.5 s | 0.72 s | 140 MB | 104 MB |
| abseil-cpp | 880 | 99.9% | 12.3 s | 0.43 s | 165 MB | 117 MB |
| protobuf | 1183 | 100.0% | 63.4 s | 2.1 s | 1448 MB | 964 MB |
| rocksdb | 1422 | 100.0% | 63.7 s | 6.8 s | 3732 MB | 1862 MB |
| json | 629 | 99.7% | 40.2 s | 9.4 s | 3770 MB | 2863 MB |
| godot | 7368 | 99.7% | 220.6 s | 10.0 s | 1794 MB | 1933 MB |
| opencv | 3422 | 99.3% | 87.8 s | 10.6 s | 3853 MB | 2577 MB |
| fmt | 73 | 97.3% | 15.0 s | 1.1 s | 3555 MB | 651 MB |
| **all** | **19201** | **99.7%** | | | | |

Objective-C headers are left out of these counts (127 `.h` files, in godot,
opencv and protobuf, with `@interface`, `@implementation`, `@protocol`,
`@class` or `@end` lines). clang-format formats them as Objective-C; nishfmt
now does the same for declarations (`@interface`, `@protocol`, method
declarations and their selector wrapping) and leaves a header with other
Objective-C (literals, `@implementation`, method bodies) untouched. Times
and memory are for the whole tree.

The regression corpus (`bench/corpus`, 10343 files from the same kind of
repositories, each capped at 250 KB, the reference one clang-format 23.1.5
`-i` run) matches on 10298. Of the 45 left, 27 are files on which a second
clang-format run changes its own output; nishfmt gives the settled output
there, as above. Its times are in the [README](../README.md#languages-and-speed).

On a generated corpus of 30,194 files (108.8 MB) of SDK code (measured
against clang-format 18.1.3), every file
matches clang-format's output (2 of its files are still unstable under
clang-format itself), in 2.9 s against clang-format's 23.4 s.

What is left, roughly by size:

- A long tail of single constructs, most of them one file each:
  assembler-like macro bodies, comment sections that span several lines
  and reflow, deeply nested lambdas in braced lists, and rare spacing
  rules.
- Run time and memory are dominated by a few files with conditional
  compilation (each combination of `#if` branches is a formatting pass, as
  in clang-format) and by large lookup tables, which are slow for both
  tools.

## Design

nishfmt is a rewrite in Nish, not a port: its own data layout and passes,
written to make the same decisions clang-format makes.

1. **Lexer** (`src/cpp/lexer.ts`). Builds token columns in one pass: kind,
   offsets, preceding newlines and whitespace, original column and width.
   Directives and header names are marked, and `>>` is split so templates
   close one bracket at a time.
2. **Parser** (`src/cpp/parser.ts`). Cuts the tokens into unwrapped lines with an
   indent level. Lambda bodies, requires-expressions and other blocks inside
   expressions become child lines of their `{`. A comment alone on the line
   under a trailing comment continues it. If a file's brackets do not balance,
   the parse fails and the file is left untouched.
3. **Classifier** (`src/cpp/classify.ts`). One forward pass over each line with a
   bracket stack gives each token its role (template bracket, pointer or
   multiplication, unary or binary operator, declaration name, kind of colon)
   and the spacing before it.
4. **Annotator** (`src/cpp/annotate.ts`). For every line: widths, forced breaks
   and spacing. For lines that need breaking: the implicit parentheses of
   operator precedence, where a break may go and what it costs, unbreakable
   tails, braced-list column layouts, and per-token flags for the breaker.
5. **Line breaker** (`src/cpp/indenter.ts`). A line that fits is written as is.
   Otherwise the breaker runs clang-format's search: states are expanded
   cheapest first, ties going to the state made first, under clang-format's
   rules for where each token goes after a break and what each break costs.
   The search is exact; the speed comes from how it is stored:
   - a state's bracket stack is a chain of shared records, copied only where
     a step changes it, with its hash kept on the top record;
   - the queue is one FIFO bucket per penalty value under a small heap of
     distinct penalties;
   - a state's no-break successor that is sure to be popped next is expanded
     without queueing;
   - a child block's cost is counted only when its state reaches the front of
     the queue;
   - results are cached by line and indent within a file, and by a 64-bit
     hash of everything the search reads across files, so a statement that
     recurs (common in generated code) is searched once.
6. **Formatter** (`src/cpp/format.ts`). Indentation, blank lines, joining short
   functions and empty blocks, include sorting (a source file's own header
   first), namespace end comments (added or corrected), chained-conditional
   and trailing-comment alignment, line-comment reflow, and writing.

**Parallelism.** Nish refuses file I/O inside threads, so the parent walks
the tree, writes one file list, and spawns itself as `nishfmt --worker` once
per core. Workers claim chunks of the list by creating the chunk's marker
file exclusively; chunks shrink to single files near the end so no worker
finishes long after the others. Each worker reuses one engine (token tables,
search pools, output buffer) for every file it formats.

Set `FFPROF=1` to print per-phase timings and search counts, and `FFDEBUG=1`
to dump each line's annotations.
