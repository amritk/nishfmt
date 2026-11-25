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
- whole files with a `#` that only comments precede on its line, outside a
  directive (`/* c */ #define X`, or a comment line escaped onto a
  directive): clang-format takes it for a directive and keeps the comment
  with it, which nishfmt does not lay out (`tests/cases/cpp/skip_comment_*`).
  A `#` after code on the line is not a directive to either, and is
  formatted; `tests/cases/hash_after_code_and_comment.cpp` guards that, and
  fails on a lexer that skips every `#` not first on its line.
- whole files whose output still changes when formatted again after eight
  runs ("does not settle"): no output passes a clang-format check.
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

The regression corpus (`bench/corpus/repos.txt`, 10343 files from the same
kind of repositories, each capped at 250 KB) matches clang-format 23.1.5's
settled output (`ref-settled/`) on 10331 of the 10341 files that settle, and
one `clang-format -i` run on 10295: nishfmt formats a file again until it
stops changing, as a CI check needs, and where clang-format's second run
changes its first, nishfmt gives the second. Its times are in the
[README](../README.md#languages-and-speed). The second corpus
(`bench/corpus/repos2.txt`, 13902 files) matches the settled output on 13853
of the 13901 files that settle, and one run on 13809; both counts and how
they are built are in [Benchmarks](benchmarks.md#c-one-run-and-the-settled-output).

What counts for a project that checks its formatting in CI is whether one
clang-format run leaves nishfmt's output as it is (`bench/corpus/verify.sh`).
It does on every file but 6 of the first corpus and 38 of the second; the
first corpus's two files that never settle are skipped. Each of these is a
decision nishfmt does not make as clang-format does:

| What differs | Files |
| --- | --- |
| a layout that depends on how clang-format's `#if` passes share tokens: a braced list `{{ a, b }}` gets spaces, a block or a constructor's initializer is laid out differently (clang-format's passes over each combination of branches share tokens that keep what an earlier pass set on them) | eigen `Tensor.h`, `TensorRef.h`, `TensorFixedSize.h`, `TensorDimensions.h`, `TensorMap.h` (in taskflow); spdlog `pattern_formatter-inl.h`, `common.h`, `tests/utils.cpp`; duckdb `shared_ptr_ipp.hpp`, `weak_ptr_ipp.hpp`; mbedtls `pk.cpp` (in duckdb); tbb `custom_scheduler.h`, `tbbmalloc/frontend.cpp` (in taskflow) |
| macro bodies and lines clang-format cannot annotate (`SPDLOG_TRY{`, generator macros, assembler-like `.macro` bodies, a `SIMD_ONLY(` argument, a macro-generated block) | spdlog `async_logger-inl.h`, `stopwatch.h`, `fmt/bin_to_hex.h`; eigen `lapack/lapack_common.h`, `bench/basicbenchmark.cpp`; grpc `iomgr/closure.h`; tbb `perf/time_framework.h`, `flow_graph.h`, `internal/_flow_graph_cache_impl.h`; lodepng `lodepng.cpp` (in tbb); opencv `mlas/lib/x86_64/FgemmKernelCommon.h`, `core/src/minmax.simd.hpp`, `dnn/.../conv2_kernels.simd.hpp` |
| a chained conditional's alignment: clang-format 23 counts a continuation line aligned to an operand (`AlignedTo`) in the width that limits the alignment, and nishfmt only the operand's own line | opencv `imgcodecs/src/grfmt_exr.cpp`; opencv `carotene/hal/tegra_hal.hpp` (a long `#define` of nested conditionals); eigen `ProductEvaluators.h` |
| line breaking: designated initializers, `<<` chains, a conditional's operand column, lambdas among arguments | bitcoin `test/checkqueue_tests.cpp`, `test/fuzz/package_eval.cpp`; eigen `Tutorial_commainit_02.cpp`, `GlobalFunctions.h`; flatbuffers `src/idl_gen_ts.cpp`; grpc `xds_server_config_fetcher.cc` |
| comments: trailing comment alignment and reflow, a block comment holding a line comment inside a condition, a comment's indent beside a preprocessor conditional | eigen `util/XprHelper.h`; tbb `rml/include/rml_base.h`; jemalloc `internal/rb.h` (in duckdb); opencv `dnn/src/graph_const_fold.cpp` |
| spacing: `&&#a` (a stringized operand), a string with a tab or wide characters | eigen `test/main.h`; bitcoin `test/cluster_linearize_tests.cpp` |
| `__asm` statements | tbb `tbb/scheduler.cpp`, `machine/msvc_ia32_common.h` (in taskflow) |
| not C++: a gnuplot script named `.hh` | eigen `bench/btl/data/gnuplot_common_settings.hh` |

Some forms next to the fixed ones still differ, on both corpora's sources
and on main alike:

- a subscript holding a `:` and followed by `(`, `x[a:b](c)`: clang-format
  makes the bracket a message and then unknown again, keeping its colons a
  message's; nishfmt skips the file;
- a `switch` initializer's empty body, `switch (T * p{q}; *p) {}`, which
  clang-format keeps on one line;
- a stray `// clang-format on` keeps the blank lines before it
  (computeNewlines), where nishfmt collapses them;
- `}  /* blk */` then `// c1` under a namespace: `// c1` goes to column 0;
- a `#pragma mark` line past the limit with a `.` in it: its `#pragma   mark`
  spacing is normalized, where clang-format, finding no layout, keeps it.

On a generated corpus of 30,194 files (108.8 MB) of SDK code (measured
against clang-format 18.1.3), every file
matches clang-format's output (2 of its files are still unstable under
clang-format itself), in 2.9 s against clang-format's 23.4 s.

What is left, roughly by size:

- A long tail of single constructs, most of them one file each (the table
  above): assembler-like macro bodies, comment sections that span several
  lines and reflow, and rare spacing rules.
- Run time and memory are dominated by a few files with conditional
  compilation (each combination of `#if` branches is a formatting pass, as
  in clang-format) and by large lookup tables, which are slow for both
  tools. A file the first run changes takes a second run, to show that it
  has settled: about three quarters more time on a tree of unformatted
  sources, and none on one already formatted.

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
finishes long after the others. A worker formats C++ files in batches of up
to 32 files or 1 MB, each in a region of its own with one engine (token
tables, search pools) the batch's files share and the region frees. The
engine clears the annotation columns before each file (`Annot.clear`), and
each search depth keeps a seen table of its own, so no file reads what the
one before it left and a fresh engine formats a file as a warm one does;
`tests/cases/worker/` runs files through one worker in turn to hold that.

Set `FFPROF=1` to print per-phase timings and search counts, and `FFDEBUG=1`
to dump each line's annotations.
