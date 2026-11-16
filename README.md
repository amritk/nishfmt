# fastfmt

A fast C++ formatter written in [Nish](https://github.com/amritk/nish), which also
formats Java, Kotlin, Ruby, C#, Dart, Swift and Rust (see [Other languages](#other-languages)). Its
output aims to match `clang-format`'s LLVM style (the target is
`{BasedOnStyle: LLVM, ColumnLimit: 120}`) byte for byte, many times faster.

This is a rewrite, not a port: its own lexer, parser, classifier and data
layout, written to make the same decisions clang-format makes. Its rules and
penalties were checked against clang-format's behaviour and source as a
reference.

## Other languages

The same binary formats Java, Kotlin, Ruby, C#, Dart, Swift and Rust, each to match one tool's
output byte for byte:

| Language | Files | Matches | Corpus result |
| --- | --- | --- | ---: |
| Java | `.java` | google-java-format 1.28 | 7627 / 7627 |
| Kotlin | `.kt .kts` | ktfmt 0.64 (default style) | 9602 / 9602 |
| C# | `.cs` | CSharpier 1.4.0, default options | 13988 / 13988 |
| Dart | `.dart` | `dart format` (Dart 3.14; tall style, short style below 3.7) | 10313 / 10313 |
| Swift | `.swift` | SwiftFormat 0.64.7, default rules | 6710 / 6710 |
| Rust | `.rs` | rustfmt 1.9.0, default config, edition 2021 | 7899 / 7899 |
| Ruby | RuboCop's default `Include` (`.rb`, `Gemfile`, `.gemspec`, ...) | `rubocop -a` 1.92.2, default config, `TargetRubyVersion: 3.3` | 4239 / 4239 |

Against the reference tools and the Rust reimplementations, on a 4-core
container (identical = byte for byte with the reference tool's output):

| Kotlin, 9602 files | Identical | 4 cores | 1 core |
| --- | ---: | ---: | ---: |
| ktfmt 0.64 (JVM) | reference | 92.9 s | |
| ktrs 0.5.1 | 9602 | 2.43 s | 8.96 s |
| fastfmt | 9602 | 2.03 s | 7.02 s |

| C#, 13992 files (164 MB) | Identical | 4 cores | 1 core |
| --- | ---: | ---: | ---: |
| CSharpier 1.4.0 (.NET 10, `--no-cache`) | reference | 63.0 s | 122.7 s |
| fastfmt | 13988 | 3.10 s | 6.63 s |

The C# side ports CSharpier's whole pipeline onto a Roslyn-shaped syntax tree
of its own: the lexer with Roslyn's trivia, the parser (C# 14), every node
printer, Prettier's Doc printer, member chains, using and modifier sorting,
`csharpier-ignore`, generated-code detection and the reprint for each set of
preprocessor symbols. The corpus is Newtonsoft.Json, AutoMapper, MediatR,
Polly, Serilog, Dapper, NUnit, xUnit, CSharpier, Humanizer,
CleanArchitecture, EF Core, NLog, RestSharp and FluentValidation; a second
corpus of the same files first formatted with other widths and indents
(`cs2`) also matches on all 13988. The 4 files CSharpier refuses are left
out. There is no native reimplementation of CSharpier to compare with.

| Dart, 10313 files (tall style) | Identical | 4 cores | 1 core |
| --- | ---: | ---: | ---: |
| `dart format` 3.14 | reference | 55.2 s | 59.9 s |
| fastfmt | 10313 | 3.08 s | 8.50 s |

| Dart, 8218 files (short style) | Identical | 4 cores | 1 core |
| --- | ---: | ---: | ---: |
| `dart format` 3.14 | reference | 25.4 s | 25.6 s |
| fastfmt | 8218 | 3.76 s | 6.27 s |

The Dart side ports dart_style whole: a scanner and parser to the
analyzer's AST shapes; the tall style's piece builder, solver and cost
model, with the variants `dart format` 3.14 still keeps for language
versions 3.7, 3.8 to 3.12 and 3.13 on; and the short style used below 3.7
(source visitor, chunk builder, rules and line splitter). The version comes
from the file's `// @dart=` comment, else 3.14; fastfmt does not read
package configs for it. The corpus is flutter/packages, flutter/samples,
riverpod, bloc, http, getx, flame, dart_style, shelf, dio and test, plus
`dart2`, the same files first formatted at other widths (10313 / 10313),
`dart3`, the same files marked `// @dart=2.19` or `3.6` for the short style
(8218 / 8218), and `dart4`, marked `3.7`, `3.8` or `3.12` (8663 / 8663).
Files the reference rejects at their version are left out.

| Rust, 8349 files (108 MB) | Identical | 4 cores | 1 core |
| --- | ---: | ---: | ---: |
| rustfmt 1.9.0, 100 files a process | reference | 7.6 s | 29.1 s |
| fastfmt | 7899 | 1.35 s | 5.0 s |

The Rust side ports rustfmt 1.9.0 onto a lexer and parser modelled on
rustc_parse (a struct-of-arrays AST with rustc's spans): its items,
expressions, chains, patterns, types, comments, imports and macros, with
`macro_rules!` bodies formatted as rustfmt does by default. rustfmt is
itself native, so it is the only comparison. The corpus is cargo, tokio,
serde, ripgrep, clap, hyper, alacritty, diesel, bevy, regex, fd, bat and
nushell; the 450 files rustfmt
rejects under edition 2021 (mostly let chains) are left out. `rust2`, the
same files first formatted with five other rustfmt configs, also matches on
all 7899, as do the 3306 crates of a cargo registry and rustfmt's own test
inputs. Macros 2.0 bodies and `rustfmt::skip::macros` are not ported; such
files are left unchanged.

| Swift, 6710 files | Identical | 4 cores | 1 core |
| --- | ---: | ---: | ---: |
| SwiftFormat 0.64.7 | reference | 131.7 s | 262.5 s |
| fastfmt | 6710 | 10.2 s | 29.4 s |

The Swift side ports SwiftFormat's tokenizer, its Formatter and helpers,
the rule loop and every default rule, `swiftformat:` directive comments
(`disable`, `enable`, `:next`, `:previous`, `:this`), and Swift's grapheme
counting and Unicode case data where SwiftFormat's decisions depend on them.
Directives that set options or sort declarations, and code points whose
Unicode data may differ from SwiftFormat's, make fastfmt skip the file and
leave it as it is; no corpus file needs that. The corpus
is swift-nio, Alamofire, Vapor, the Composable Architecture, RxSwift,
Kingfisher, SnapKit, SwiftLint, swift-argument-parser, swift-collections,
Moya, swift-format, SourceKitten and the Kickstarter iOS app. The
reference tools' times are from the porting runs, on the same busy machine.

The Java and Kotlin corpora are the sources of public repositories as found
(`bench/corpus/repos.txt` lists them; `bench/corpus/mk.sh` rebuilds a corpus
and `cmp.sh` compares against it). Times are the best of three on a busy
4-core container, so they compare tools with each other rather than measure
the machine.

| Ruby, `rubocop -a` | 739 files | 1500 files | 2000 files | 739 files, 4 cores | 1 core |
| --- | ---: | ---: | ---: | ---: | ---: |
| RuboCop 1.92.2 | reference | reference | reference | 102 s (`--parallel`) | 115 s |
| rbcop 0.1.4 | 739 | 1500 | 2000 | 2.59 s | 8.53 s |
| nitrocop 0.0.1-pre12 | 124 | 354 | 499 | 73.5 s | |
| fastfmt | 739 | 1500 | 2000 | 1.17 s | 4.34 s |

The Ruby side ports RuboCop's whole pipeline: the parser gem's lexer, racc
grammar and AST builder (following Prism, which RuboCop parses Ruby 3.3 with,
where the two differ), the TreeRewriter and corrector merging, rubocop
directive comments, the inspect-correct loop and every cop RuboCop enables by
default (393; the ones that never correct under `-a` run once, so that
Lint/RedundantCopDisableDirective can judge directives). The Ruby corpus is
three samples of Rails, Discourse, Homebrew, RuboCop, the parser gem, Jekyll,
Sinatra, Devise and rspec-core (739, 1500 and 2000 files). `tools/ruby/README.md`
lists the generators.

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

Objective-C headers are left out of these counts (127 `.h` files, in godot,
opencv and protobuf, with `@interface`, `@implementation`, `@protocol`,
`@class` or `@end` lines). clang-format formats them as Objective-C; fastfmt
now does the same for declarations (`@interface`, `@protocol`, method
declarations and their selector wrapping) and leaves a header with other
Objective-C (literals, `@implementation`, method bodies) untouched. Times
and memory are for the whole tree.

The regression corpus (`bench/corpus`, 10344 files from the same kind of
repositories, each capped at 250 KB, the reference one `clang-format -i`
run) matches on 10306. Of the 38 left, 26 are files on which a second
clang-format run changes its own output; fastfmt gives the settled output
there, as above.

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
