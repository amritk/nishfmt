# Porting a formatter to nishfmt

How a new language gets into nishfmt. The Kotlin port (ktfmt) and the Ruby
port (RuboCop) are the worked examples: read `src/kotlin/run.ts` and
`src/ruby/run.ts` before you start.

## The goal

Byte-for-byte the reference tool's output at its default settings (or the
one fixed style the table names), on every
file of the corpus the reference tool accepts. After that comes speed: faster
than the reference tool and any native reimplementation, on 1 core and 4.
Where the two goals pull apart, matching wins, then speed.

| Language | Directory | Reference | One file, through stdin |
| --- | --- | --- | --- |
| C++ | `src/cpp` | clang-format 23.1.5, `{BasedOnStyle: LLVM, ColumnLimit: 120}` | `clang-format --style='{BasedOnStyle: LLVM, ColumnLimit: 120}' < f` |
| Java | `src/java` | google-java-format 2.0.0 (on JDK 21) | `java -jar $GJF - < f` |
| Kotlin | `src/kotlin` | ktfmt 0.65, `--kotlinlang-style` | `java -jar $KTFMT --kotlinlang-style - < f` parses as a script, so only for `.kts`; a `.kt` file goes by name, `java -jar $KTFMT --kotlinlang-style f` (in place) |
| Ruby | `src/ruby` | `rubocop -a` 1.92.3, `TargetRubyVersion: 3.3` | `bench/corpus/mk.sh` shows the invocation |
| Swift | `src/swift` | SwiftFormat 0.64.7, default rules | `swiftformat stdin --quiet < f` |
| Rust | `src/rust` | rustfmt 1.10.0, edition 2024, style edition 2024, `max_width = 120` | `rustfmt +1.99.1 --edition 2024 --config style_edition=2024,max_width=120 < f` |
| Dart | `src/dart` | `dart format` (Dart 3.14.1) | `dart format < f` (outside a package; inside one, `dart format -o show f` reads its project) |
| C# | `src/csharp` | CSharpier 1.4.0, default options except `end_of_line = crlf` | `csharpier format --write-stdout < f`, run below the `.editorconfig` that `mk.sh cs` writes ([README](../README.md#settings)) |

A new language takes a directory of its own, a prefix for its names (below),
a corpus (its repositories in `bench/corpus/repos.txt` and `repos2.txt`, and
a case in `mk.sh`) and a row in the README's table.

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

## No panics

Every module but `src/main.ts` is in package.json's `nish.noPanic`, so the
build refuses any index, signed `+ - *`, `/`, `%`, `pop()` or `new Array(n)`
the compiler cannot prove safe (NL2457), and any call into a std function
that can panic (NL2458). `nish:unsafe` is not used. A new module joins the
list with `node scripts/no-panic-list.mjs --write`: a module the list leaves
out would build unchecked, so CI runs the script and fails on a stale list.

To see every site while you work, build the language's driver with
`--allow-panics --emit-panics p.json` and read the sites that are neither
`proven` nor `allowed`.

Fix a site in this order:

1. **Prove it.** A proven site loses its runtime check, so this is also the
   fast path. Hoist one range check before a loop and keep `i < xs.length`
   in the loop condition.
2. **Guard it and call `fault()`** (`src/core/fault.ts`) on the branch the
   code's invariants rule out, then leave with a neutral value. A faulted
   file is skipped, as a panicking one was. Never answer a made-up value
   without `fault()`. Inside a loop, the branch must leave the loop.
3. **Use a helper** from `src/core/arr.ts` or `src/core/sort.ts`:
   - `newI32s` and its siblings replace `new Array<T>(n)`.
   - `copyU8s` replaces `.set`.
   - `sliceU8s` and its siblings replace array `.slice`.
   - `bytesText` replaces `String.fromBytes`. It builds the string a byte at
     a time, so keep it off hot paths: cut `substring`s from a text the
     caller made once instead (Rust and Dart take the file's text from
     `main.ts` this way).
   - `stableSort` replaces `.sort`.
   - `atI32` and `add32` are a guarded read and a guarded sum.

What the 0.45.1 prover credits, learned the hard way:

- **Guards on fields are not credited.** Copy `this.xs` and `this.n` to
  locals, test the locals, then index.
- **Any call forgets array lengths**, `push` included. Read what you need
  before the call, or test again after it.
- **Module constants and hex literals are not credited as bounds.** Write
  decimal literals.
- **Negative lower bounds are not credited.** `x > -5` proves nothing.
- **Facts are dropped** at a `switch` case, at a join after branches, and in
  a closure's captured arrays.
- **Ternaries are not bounded.** `n += c ? 2 : 1` is unproven.
- **Masks bound a value.** After `x & 0xff`, `x` is in range.
- **`charCodeAt` results are unbounded**: mask them before doing arithmetic.
- **When both operands are known non-negative**, `toI32(toU32(a) + toU32(b))`
  is exact. Say why in a comment. An i64 sum with a range test also works.
- **`new Array<T>(n)` is proven only for a literal, constant or `u16`
  length.** A ranged `integer<0, N>` length is not, whatever the message
  says. So the helpers allocate up to 65,535 elements with `toU16`, and
  `push` past that.
- **A field typed `integer<0, N>` does bound the indexes it guards.**
- **Module storage is proven only through a function parameter** typed
  `Int32Array`. Indexed directly, it never is.
- **Proofs can depend on callers.** A small probe whose caller passes
  constants proves more than the real program does, so judge by the real
  build.

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
  `src/gdoc/` (google-java-format 1.x's Doc engine, which Kotlin uses, and
  the token input and comment helpers Java and Kotlin share) are shared;
  Java has 2.0.0's layout engine of its own in `src/java/layout/`. Don't
  change them in a way that alters the C++, Java, Kotlin or Ruby output.
- Ported code keeps its license: each ported module starts with a comment
  naming the project, version and license, as `src/ruby/run.ts` does:
  - SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick Lockwood)
  - rustfmt 1.10.0 (MIT OR Apache-2.0, Copyright The Rust Project Developers)
  - unicode-width 0.1.14, rustfmt's width measure (MIT OR Apache-2.0, Copyright The Rust Project Developers)
  - dart_style 3.1.14-wip at 5a9534fad9ff, the commit Dart SDK 3.14.1 pins (BSD-3-Clause, Copyright the Dart project authors)
  - CSharpier 1.4.0 (MIT License, Copyright (c) 2021 Bela VanderVoort)
  - A parser ported from Roslyn / the Dart analyzer / rustc_parse also
    names its source (MIT / BSD-3-Clause / MIT OR Apache-2.0).
- Port from the reference tool's source at the version in the table: clone
  it at that tag. rustfmt's is the `src/tools/rustfmt` of the Rust release
  that ships the binary (`tools/rust/NOTES.md`), not a rustfmt repository
  tag.

## Building and checking

```bash
.nish/bin/nish tools/dev/<lang>.ts --allow-panics --link dist/<lang>dev   # this language only: seconds
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
