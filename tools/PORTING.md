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
| Swift | `src/swift` | SwiftFormat 0.64.7, default rules | `/opt/ref/swiftformat stdin --quiet < f` |
| Rust | `src/rust` | rustfmt 1.9.0, default config, edition 2021 | `rustfmt --edition 2021 < f` |
| Dart | `src/dart` | `dart format` (Dart 3.14, tall style) | `dart format < f` |
| C# | `src/csharp` | CSharpier 1.4.0, default options | `csharpier format --write-stdout < f` |

## Nish

nishfmt is written in Nish, a static subset of TypeScript compiled to native
code. **Read `$NISHPKG/docs/AI.md` before writing any** (`NISHPKG` is the nish npm
package, here `/opt/nishpkg/node_modules/nish`). It is the whole language
as rules, with the traps first. The compiler is
`$NISHPKG/../.bin/nish` (`nish file.ts --json` for diagnostics, `--link out`
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
- `src/core/` (`Out`, `growI32`, `utf16Len`, file walking) and
  `src/gdoc/` (google-java-format's Doc engine, used by Java and Kotlin) are
  shared. Don't change them in a way that alters the C++, Java, Kotlin or
  Ruby output.
- Ported code keeps its license: each ported module starts with a comment
  naming the project, version and license, as `src/ruby/run.ts` does:
  - SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick Lockwood)
  - rustfmt 1.9.0 (MIT OR Apache-2.0, Copyright The Rust Project Developers)
  - dart_style (Dart SDK 3.14) (BSD-3-Clause, Copyright the Dart project authors)
  - CSharpier 1.4.0 (MIT License, Copyright (c) 2021 Bela VanderVoort)
  - A parser ported from Roslyn / the Dart analyzer / rustc_parse also
    names its source (MIT / BSD-3-Clause / MIT OR Apache-2.0).
- Sources: SwiftFormat `/opt/ref/swiftformat-src`, rustfmt
  `/opt/ref/rustfmt-src`, dart_style `/work/repos/dart-lang_dart_style`,
  CSharpier `/work/repos/belav_csharpier`.

## Building and checking

```bash
NISH=/opt/nishpkg/node_modules/.bin/nish
$NISH tools/dev/<lang>.ts --link /tmp/<lang>dev     # this language only: seconds
/tmp/<lang>dev file > out                            # prints the result; exit 1 = skipped
diff out <(reference command < file)
NISH=$NISH ./build.sh /tmp/ffk                       # the whole binary: ~2 minutes
bash bench/corpus/cmp.sh /tmp/ffk <lang>             # the corpus gate
```

The corpus for each language is `/work/c/<lang>/raw` (sources from public
repositories, as found), `/work/c/<lang>/ref` (the reference tool's output)
and `/work/c/<lang>/failed.txt` (files the reference rejected, left out).
`bench/corpus/mk.sh` builds it. `cmp.sh` puts the files that differ in
`/work/out/<lang>/differ.txt` and their diffs in `all.diff`; use
`WORK=/work/out-<you>` so two runs don't collide. For quick loops, compare
a sample of files with the dev driver against `ref/`.

Ported formatters are checked file by file: when a file differs, find the
reference tool's code that decides the differing whitespace and port that
decision exactly. Don't add a heuristic that happens to fit the corpus.
Unhandled input is skipped (`false`), never guessed.

## Speed

Measure with `cmp.sh` and with `taskset -c 0 /tmp/ffk -i -q -j 1 <copy of raw>`.
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

Commit in your worktree branch with messages like the existing history
(`feat(nishfmt): ...`, a body saying what and why, a `Measured:` line for
performance changes). End each message with:

    Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_01WUtc12fauWbzRYaAd6snzH

Never push, and never name a model in a commit or in code.
