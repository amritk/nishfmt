# Porting a formatter to nishfmt

How a new language gets into nishfmt. The Kotlin port (ktfmt) and the Ruby
port (RuboCop) are the worked examples: read `src/kotlin/run.ts` and
`src/ruby/run.ts` before you start.

## The goal

Byte-for-byte the reference tool's output at its default settings, on every
file of the corpus the reference tool accepts. After that comes speed: faster
than the reference tool and any native reimplementation, on 1 core and 4.
Where the two goals pull apart, matching wins, then speed.

| Language | Directory | Reference | One file, through stdin |
| --- | --- | --- | --- |
| C++ | `src/cpp` | clang-format 18, `{BasedOnStyle: LLVM, ColumnLimit: 120}` | `clang-format --style='{BasedOnStyle: LLVM, ColumnLimit: 120}' < f` |
| Java | `src/java` | google-java-format 1.28 | `java -jar $GJF - < f` |
| Kotlin | `src/kotlin` | ktfmt 0.64, default style | `java -jar $KTFMT - < f` |
| Ruby | `src/ruby` | `rubocop -a` 1.92.2, `TargetRubyVersion: 3.3` | `bench/corpus/mk.sh` shows the invocation |
| Swift | `src/swift` | SwiftFormat 0.64.7, default rules | `swiftformat stdin --quiet < f` |
| Rust | `src/rust` | rustfmt 1.9.0, default config, edition 2021 | `rustfmt --edition 2021 < f` |
| Dart | `src/dart` | `dart format` (Dart 3.14.1) | `dart format < f` (outside a package; inside one, `dart format -o show f` reads its project) |
| C# | `src/csharp` | CSharpier 1.4.0, default options | `csharpier format --write-stdout < f` |

A new language takes a directory of its own, a prefix for its names (below),
a corpus (`bench/corpus/repos.txt` and a case in `mk.sh`) and a row in the
README's table.

## Nish

nishfmt is written in Nish, a static subset of TypeScript compiled to native
code. **Read `.nish/docs/AI.md` before writing any** (`scripts/fetch-nish.sh`
installs the pinned compiler, docs included, into `.nish/`). It is the whole language
as rules, with the traps first. The compiler is
`.nish/bin/nish` (`nish file.ts --json` for diagnostics, `--link out`
for a binary). The traps that cost the most in earlier ports:

- No `as`, no regex, no `split`/`lastIndexOf`, no inheritance, no closures
  that assign their caller's locals. Function-typed parameters only on
  top-level functions. Default parameters must be literals. Module-level
  `const`s are primitives only, except module storage
  (`const X = new Int32Array(N)`), which persists across calls.
- Strings are UTF-8 bytes: `s.length` is bytes, `charCodeAt` is a byte.
  Work on `u8[]` source buffers and `i32` offsets, not on strings.
- **Every global function and class name must be unique across the whole
  program**, not only within its module. Prefix everything with the
  language: `Sw` (Swift), `Rs` (Rust), `Dt` (Dart), `Cs` (C#); for
  example `SwToken`, `rsParseExpr`, `DtPiece`, `csPrintNode`.
- Results, not exceptions: a function that can fail answers a flag or a
  sentinel. A file the port cannot handle makes `formatX` answer `false`
  (nishfmt then leaves it untouched and counts it as skipped). That is always
  better than wrong output.

## Where the code goes

- `src/<lang>/run.ts` holds `XEngine`, `formatX(e, path, src, n, out)` and
  `isXName`, already wired into `src/main.ts`. Keep those three signatures.
  Put everything else in more modules under `src/<lang>/`.
- Each file is formatted with a fresh engine in a region of its own
  (`runJob` in `src/main.ts`), so allocate freely per file. The region is
  freed afterwards.
- A port that reads the project around a file (Dart's package config and
  `analysis_options.yaml`, `src/dart/config.ts`) reads it from its
  `format<Lang>`, by the file's path, and caches what it learns in module
  storage (fixed numeric arrays), the only state that outlives a file's
  region: one cache per worker process, keyed by directory. A project file
  the port cannot read exactly leaves the file untouched.
- `src/core/` (`Out`, `growI32`, `utf16Len`, file walking) and
  `src/gdoc/` (google-java-format's Doc engine, used by Java and Kotlin) are
  shared. Don't change them in a way that alters the C++, Java, Kotlin or
  Ruby output.
- Ported code keeps its license: each ported module starts with a comment
  naming the project, version and license, as `src/ruby/run.ts` does:
  - SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick Lockwood)
  - rustfmt 1.9.0 (MIT OR Apache-2.0, Copyright The Rust Project Developers)
  - dart_style 3.1.14-wip at 5a9534fad9ff, the commit Dart SDK 3.14.1 pins (BSD-3-Clause, Copyright the Dart project authors)
  - CSharpier 1.4.0 (MIT License, Copyright (c) 2021 Bela VanderVoort)
  - A parser ported from Roslyn / the Dart analyzer / rustc_parse also
    names its source (MIT / BSD-3-Clause / MIT OR Apache-2.0).
- Port from the reference tool's source at the version in the table: clone
  it at that tag. The rustfmt port found that a source tree of another
  version differs in about 15 places (`tools/rust/NOTES.md`).

## Building and checking

```bash
.nish/bin/nish tools/dev/<lang>.ts --link dist/<lang>dev   # this language only: seconds
dist/<lang>dev file > out                                   # prints the result; exit 1 = skipped
diff out <(reference command < file)
npm run build                                               # the whole binary: ~2 minutes
bash bench/corpus/cmp.sh dist/nishfmt <lang>                # the corpus gate
```

The corpus for each language is `bench/work/corpus/<lang>/raw` (sources
from public repositories, as found), `ref/` (the reference tool's output)
and `failed.txt` (files the reference rejected, left out);
[Benchmarks](benchmarks.md) says how to build it. `cmp.sh` puts the files
that differ in `bench/work/out/<lang>/differ.txt` and their diffs in
`all.diff`; set `WORK` to a directory of your own so two runs don't collide. For quick loops, compare
a sample of files with the dev driver against `ref/`.

Ported formatters are checked file by file: when a file differs, find the
reference tool's code that decides the differing whitespace and port that
decision exactly. Don't add a heuristic that happens to fit the corpus.
Unhandled input is skipped (`false`), never guessed.

## Speed

Measure with `cmp.sh` and with `taskset -c 0 dist/nishfmt -i -q -j 1 <copy of raw>`.
What made the earlier ports fast:

- Struct-of-arrays: tokens and nodes as indices into parallel `i32[]`
  arrays (`src/kotlin/builder.ts` `KTree`), not an object per token.
- Compare bytes, not strings: keyword tests on the source bytes, or a
  keyword id assigned once by the lexer.
- Size arrays from the file length up front, so they never grow.
- No reparse or second pass when the first pass can answer.

## Tests

Add regression cases under `tests/cases/<lang>/`: `name.<ext>` and
`name.expected`, where the expected file is the reference tool's output.
`tests/run.sh` checks every case and that formatting each expected file
leaves it unchanged.

## Commits

Conventional commits, as [CLAUDE.md](../CLAUDE.md) says: `feat(<lang>): ...`
with a body saying what and why, and a `Measured:` line for a performance
change.
