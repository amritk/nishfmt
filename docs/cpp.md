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
- whole files on which a run would change the code, not only its layout
  (`src/cpp/samecode.ts`). Each run that changes a file has its input and its
  output lexed again and compared: the same tokens in the same directives,
  once comments are set aside, adjacent string literals joined, and the
  #include lines (a set: clang-format drops a repeated one) and
  using-declarations (a multiset) taken out of the order, since clang-format
  sorts them. When a `#` stands in code, which clang-format may move to the
  start of a line and so make a directive, the directives are not compared.
  A difference is a nishfmt bug, reported as a formatter fault
  (`tests/cases/cpp/fault_*`). Three guard cases keep what clang-format may
  change accepted, each failing on a one-line mutation that was run:
  `samecode_include_repeated.cpp` (includes counted as a multiset),
  `samecode_using_sorted.cpp` (no using-declaration taken out of the order)
  and `samecode_string_split.cpp` (adjacent string literals not joined).
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
settled output (`ref-settled/`) on 10333 of the 10341 files that settle, and
one `clang-format -i` run on 10297: nishfmt formats a file again until it
stops changing, as a CI check needs, and where clang-format's second run
changes its first, nishfmt gives the second. Its times are in the
[README](../README.md#languages-and-speed). The second corpus
(`bench/corpus/repos2.txt`, 13902 files) matches the settled output on 13859
of the 13901 files that settle, and one run on 13814; both counts and how
they are built are in [Benchmarks](benchmarks.md#c-one-run-and-the-settled-output).

What counts for a project that checks its formatting in CI is whether one
clang-format run leaves nishfmt's output as it is (`bench/corpus/verify.sh`).
It does on every file but 4 of the first corpus and 31 of the second; it
skips 3 files of the first corpus (two never settle, and in opencv's
`hb-algs.hh` a comment leads a directive) and 1 of the second (taskflow's
`ff/parallel_for_internals.hpp`, where formatting would change the code;
see [What it leaves alone](#what-it-leaves-alone)). Each of the 35 is a
decision nishfmt does not make as clang-format does:

| What differs | Files |
| --- | --- |
| a layout that depends on how clang-format's `#if` passes share tokens: a braced list `{{ a, b }}` gets spaces, a block or a constructor's initializer is laid out differently (clang-format's passes over each combination of branches share tokens that keep what an earlier pass set on them) | eigen `Tensor.h`, `TensorRef.h`, `TensorFixedSize.h`, `TensorDimensions.h`, `TensorMap.h` (in taskflow); spdlog `pattern_formatter-inl.h`, `common.h`, `tests/utils.cpp`; duckdb `shared_ptr_ipp.hpp`, `weak_ptr_ipp.hpp`; mbedtls `pk.cpp` (in duckdb); tbb `custom_scheduler.h`, `tbbmalloc/frontend.cpp` (in taskflow) |
| macro bodies and lines clang-format cannot annotate (`SPDLOG_TRY{`, generator macros, assembler-like `.macro` bodies, a `SIMD_ONLY(` argument, a macro-generated block) | spdlog `async_logger-inl.h`, `stopwatch.h`, `fmt/bin_to_hex.h`; eigen `bench/basicbenchmark.cpp`; grpc `iomgr/closure.h`; tbb `perf/time_framework.h`, `flow_graph.h`, `internal/_flow_graph_cache_impl.h`; opencv `mlas/lib/x86_64/FgemmKernelCommon.h`, `core/src/minmax.simd.hpp`, `dnn/.../conv2_kernels.simd.hpp` |
| a long `#define` of nested conditionals, with a block comment that is reflowed over many lines | opencv `carotene/hal/tegra_hal.hpp` |
| line breaking: designated initializers, `<<` chains, a conditional's operand column, lambdas among arguments | bitcoin `test/checkqueue_tests.cpp`; eigen `Tutorial_commainit_02.cpp`, `GlobalFunctions.h`; flatbuffers `src/idl_gen_ts.cpp`; grpc `xds_server_config_fetcher.cc` |
| comments: trailing comment alignment and reflow, a comment's indent beside a preprocessor conditional | eigen `util/XprHelper.h` |
| a string with wide characters | bitcoin `test/cluster_linearize_tests.cpp` |
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

Past a block comment over several lines, the line goes on from where the
comment's last line ends, its lines re-indented by as much as its first
moved (clang-format's breakProtrudingToken). A token after it must start a
line unless that column is left of where the line would start, so a layout
that moves the comment left can be the only one; where none is, the line is
left as written. `tests/cases/block_comment_before_closer_no_layout.cpp`
guards that last part: it passes on main 22b6162 too, and fails when the
column past the comment is taken to be the line's indent, a one-line
mutation that was run.

A chained conditional is aligned as clang-format 23 aligns it: a line that
continues an operand moves with the operand's line, and counts in the width
that limits the alignment, when it is aligned to a token and indented from
the operand's column or right of it. A block comment over several lines
counts its first line there; `tests/cases/conditional_chain_block_comment_first_line.cpp`
guards that: it passes on main 90d343e as well, and fails when the comment
counts its last line instead, a one-line mutation that was run.

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
