# fastfmt

A fast C++ formatter written in [Nish](https://github.com/amritk/nish). Its
output aims to match `clang-format`'s LLVM style (the target is
`{BasedOnStyle: LLVM, ColumnLimit: 120}`) byte for byte, many times faster.

This is a rewrite, not a port: its own lexer, parser, classifier and data
layout, written to make the same decisions clang-format makes. Its rules and
penalties were checked against clang-format's behaviour and source as a
reference.

## Build and use

```bash
PATH=/path/to/nish/build/seed/bin:$PATH ./build.sh   # → build/fastfmt
```

```bash
build/fastfmt file.cpp        # prints the formatted file
build/fastfmt -i src/         # rewrites every C++ file under src/ in place
build/fastfmt --check src/    # lists files that would change; exits 1 if any
```

| Option | Meaning |
| --- | --- |
| `-i`, `--write` | rewrite files in place |
| `--check` | list the files that would change; exit status 1 if any would |
| `--width <n>` | column limit (default 120) |
| `--indent <n>` | indent width (default 2) |
| `-j <n>` | worker processes (default: one per core) |
| `-q`, `--quiet` | no summary line |

Directories are walked recursively for `.cpp .cc .cxx .hpp .hh .hxx .h`,
honouring basic `.gitignore` patterns. When the run ends, a summary line is
printed:

```
fastfmt: 30194 files, reformatted 30163, skipped 0; 108.8 MB in 2040 ms (53 MB/s, 4 workers)
```

The formatter leaves some code as written:

- regions between `// fastfmt off` and `// fastfmt on`;
- regions between `// clang-format off` and `// clang-format on`;
- whole files that do not parse, such as files with unbalanced brackets or an
  unterminated literal. These count as skipped.

## Tests and benchmark

```bash
tests/run.sh build/fastfmt
```

The test script checks that each `tests/cases/*.cpp` formats to its
`.expected` file: clang-format 18.1.3's fixed point, its output rerun until it
stops changing (one run is not always stable). It also checks that:

- formatting an `.expected` file leaves it unchanged;
- an unbalanced file is left untouched;
- `// fastfmt off` keeps a region verbatim.

The benchmark compares fastfmt with clang-format on public C++ repositories.
Clone one and run:

```bash
bench/compare-repo.sh build/fastfmt path/to/repo bench/work/repo
```

Both tools format a copy of the repository's C++ sources at the same style
(the repository's own `.clang-format` is ignored); the script reports the
files that come out identical and both tools' times, and lists the files that
differ in `bench/work/repo/differ.txt`.

## Results

Measured on a 4-core cloud container against clang-format 18.1.3. The
reference for each file is clang-format's fixed point: its output on the
repository's original source, rerun until it stops changing (one run is not
always stable; a few files never settle and are left out, as are files
clang-format fails on under a 4 GB memory cap). "Identical" counts files whose
fastfmt output matches that fixed point byte for byte, from one fastfmt run.
clang-format ran one file per process, two at a time; fastfmt ran once over
the whole tree with 4 workers. Peak memory is the largest single process.

| Repository | Files | Identical | clang-format | fastfmt | Peak memory, clang-format | Peak memory, fastfmt |
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

Objective-C headers are left out of the counts (127 `.h` files, in godot,
opencv and protobuf, with `@interface`, `@implementation`, `@protocol`,
`@class` or `@end` lines): clang-format formats them as Objective-C, which
fastfmt does not target. Times and memory are for the whole tree.

On a generated corpus of 30,194 files (108.8 MB) of SDK code, every file
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

fastfmt is a rewrite in Nish, not a port: its own data layout and passes,
written to make the same decisions clang-format makes.

1. **Lexer** (`src/lexer.ts`). Builds token columns in one pass: kind,
   offsets, preceding newlines and whitespace, original column and width.
   Directives and header names are marked, and `>>` is split so templates
   close one bracket at a time.
2. **Parser** (`src/parser.ts`). Cuts the tokens into unwrapped lines with an
   indent level. Lambda bodies, requires-expressions and other blocks inside
   expressions become child lines of their `{`. A comment alone on the line
   under a trailing comment continues it. If a file's brackets do not balance,
   the parse fails and the file is left untouched.
3. **Classifier** (`src/classify.ts`). One forward pass over each line with a
   bracket stack gives each token its role (template bracket, pointer or
   multiplication, unary or binary operator, declaration name, kind of colon)
   and the spacing before it.
4. **Annotator** (`src/annotate.ts`). For every line: widths, forced breaks
   and spacing. For lines that need breaking: the implicit parentheses of
   operator precedence, where a break may go and what it costs, unbreakable
   tails, braced-list column layouts, and per-token flags for the breaker.
5. **Line breaker** (`src/indenter.ts`). A line that fits is written as is.
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
6. **Formatter** (`src/format.ts`). Indentation, blank lines, joining short
   functions and empty blocks, include sorting (a source file's own header
   first), namespace end comments (added or corrected), chained-conditional
   and trailing-comment alignment, line-comment reflow, and writing.

**Parallelism.** Nish refuses file I/O inside threads, so the parent walks
the tree, writes one file list, and spawns itself as `fastfmt --worker` once
per core. Workers claim chunks of the list by creating the chunk's marker
file exclusively; chunks shrink to single files near the end so no worker
finishes long after the others. Each worker reuses one engine (token tables,
search pools, output buffer) for every file it formats.

Set `FFPROF=1` to print per-phase timings and search counts, and `FFDEBUG=1`
to dump each line's annotations.

## What Nish could add

A few features in Nish would make this faster or simpler:

1. **File I/O in `spawn`/`parallelMap` bodies.** Reading and writing a file
   inside a thread is refused today. That is what forces the multi-process
   design, with its list files, re-exec and stats files. Threads would remove
   about 100 lines and the process start-up cost.
2. **Escape analysis that follows fresh objects.** A parallel body that builds
   a fresh object is refused, even when that object never escapes the body:
   - an object whose constructor stores allocations into its fields;
   - an object built by calling methods on a fresh local.

   Accepting these would let each thread own its engine.
3. **The same analysis for `using arena()` scopes.** A function that builds
   an object graph inside an arena scope is refused with "stores an
   allocation into memory". With per-file arenas, the engine would not need
   hand-written `reset` methods to keep memory flat.
