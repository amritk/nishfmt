# nishfmt

nishfmt is not a formatter for Nish code. It is one fast native formatter for
C++, Java, Kotlin, Ruby, Swift, Rust, Dart and C#, written in Nish. For each
language it matches one reference formatter byte for byte (clang-format,
google-java-format, ktfmt, RuboCop, SwiftFormat, rustfmt, `dart format` and
CSharpier), and it is 4 to 76 times faster than that formatter, depending on
the language and the number of cores. It uses each tool's default settings
and reads no configuration files; see [Settings](#settings).

nishfmt is written in [Nish](https://github.com/amritk/nish), a static subset
of TypeScript compiled ahead of time to a native binary. Each formatter
except C++ is a port of its reference tool, translated into Nish; the C++
formatter is a rewrite that makes clang-format's decisions. A file nishfmt
cannot format exactly as the reference tool would is left untouched.

## Languages and speed

Times are for formatting each corpus in place, on a 4-core container and
pinned to one core:

| Language | Matches | Identical | Reference tool, 4 cores / 1 core | nishfmt, 4 cores / 1 core |
| --- | --- | ---: | ---: | ---: |
| C++ | clang-format 18, `{BasedOnStyle: LLVM, ColumnLimit: 120}` | 99.6% of 10,344 | 87.0 s / 212.9 s | **7.07 s / 28.9 s** |
| Java | google-java-format 1.28 | 100% of 7,627 | 75.2 s / 252.9 s | **2.17 s / 8.64 s** |
| Kotlin | ktfmt 0.64, default style | 100% of 9,602 | 92.9 s / not run | **2.03 s / 7.02 s** |
| C# | CSharpier 1.4.0, default options | 100% of 13,988 | 63.0 s / 122.7 s | **3.10 s / 6.63 s** |
| Dart, tall style | `dart format` 3.14 | 100% of 10,313 | 55.2 s / 59.9 s | **3.08 s / 8.50 s** |
| Dart, short style (below 3.7) | `dart format` 3.14 | 100% of 8,218 | 25.4 s / 25.6 s | **3.76 s / 6.27 s** |
| Swift | SwiftFormat 0.64.7, default rules | 100% of 6,710 | 131.7 s / 262.5 s | **10.2 s / 29.4 s** |
| Rust | rustfmt 1.9.0, default config, edition 2021 | 100% of 7,899 | 7.6 s / 29.1 s | **1.35 s / 5.0 s** |
| Ruby | `rubocop -a` 1.92.2, default config, `TargetRubyVersion: 3.3` | 100% of 1,998 | 303.9 s / 289.6 s | **4.00 s / 12.7 s** |

- **Identical** is the share of the corpus files the reference tool accepts
  that nishfmt formats byte for byte as it does; the exact counts are in
  [Benchmarks](docs/benchmarks.md#corpus-results). Times cover the whole
  corpus directory, including the few files the reference rejects.
- One core is `taskset -c 0`, with `-j 1` for nishfmt. nishfmt's times are
  the best of three. The C++, Java and Ruby rows were measured together on
  an otherwise idle machine, the reference tools one run each; the others
  during porting on a busier shared machine, so compare within a row.
- How the reference tools ran: clang-format 50 files a process; one
  google-java-format JVM over all files; CSharpier on .NET 10 with
  `--no-cache`; rustfmt 100 files a process; RuboCop with `--parallel` on 4
  cores. ktfmt was not run on one core.
- nishfmt picks the language from the file name: `.cpp .cc .cxx .hpp .hh
  .hxx .h`, `.java`, `.kt .kts`, `.cs`, `.dart`, `.swift`, `.rs`, and
  RuboCop's default `Include` for Ruby (`.rb`, `Gemfile`, `.gemspec`, ...).

[Benchmarks](docs/benchmarks.md) says how each corpus was built and how to
rerun every number.

## Settings

nishfmt formats each language the way its reference tool does at that
tool's default settings, and only those. It reads no configuration file:
`.clang-format`, `rustfmt.toml`, `.rubocop.yml`, `.swiftformat`,
`.csharpierrc`, `.editorconfig` and `analysis_options.yaml` are all ignored,
so a file comes out the same in any repository.

- **Java, Kotlin, C#, Swift, Rust:** the tool's defaults: google-java-format's
  Google style, ktfmt's default style, CSharpier's default options,
  SwiftFormat's default rules, and rustfmt's default config with edition 2021.
- **Dart:** `dart format`'s defaults. The language version, which picks the
  style, comes from a file's `// @dart=` comment, else 3.14; package configs
  are not read.
- **Ruby:** `rubocop -a`: every cop RuboCop enables by default, with its safe
  corrections only, targeting Ruby 3.3.
- **C++:** the one exception. clang-format's own default is LLVM style at 80
  columns; nishfmt uses LLVM style at 120, and `--width` and `--indent`
  change the column limit and indent width.

A project whose own configuration changes its formatter's output will see
nishfmt differ from that formatter there.

## Install

Each [release](https://github.com/amritk/nishfmt/releases) attaches a
prebuilt binary for Linux and macOS (x86_64 and arm64), with `SHA256SUMS` and
signed build provenance: unpack it and put `bin/nishfmt` on your `PATH`.
Releases are also published to npm, which installs the binary for your
machine:

```bash
npm install -g @amritk/nishfmt
```

There is no release yet; until there is, build from source.

To build from source you need clang and lld from LLVM 15 or newer (CI uses
18) and Node 22 for the scripts:

```bash
bash scripts/fetch-nish.sh   # the pinned Nish compiler, into .nish/
npm ci
npm run build                # dist/nishfmt
```

## Usage

```bash
nishfmt file.cpp        # print the formatted file
nishfmt -i src/         # rewrite every supported file under src/ in place
nishfmt --check src/    # list the files that would change; exit 1 if any
```

<!-- x-release-please-start-version -->
```text
$ nishfmt --version
nishfmt 0.1.0
```
<!-- x-release-please-end -->

```text
$ nishfmt --help
usage: nishfmt [options] <file-or-dir>...

Formats each file to match its language's reference formatter:
  C++ (.cpp .cc .cxx .hpp .hh .hxx .h)  clang-format 18, LLVM style
  Java (.java)                        google-java-format 1.28
  Kotlin (.kt .kts)                   ktfmt 0.64
  Ruby (.rb, Gemfile, .gemspec, ...)  rubocop -a 1.92.2
  Swift (.swift)                      SwiftFormat 0.64.7
  Rust (.rs)                          rustfmt 1.9.0, edition 2021
  Dart (.dart)                        dart format 3.14
  C# (.cs)                            CSharpier 1.4.0

A single file with no mode prints the result to stdout.

  -i, --write     rewrite files in place
  --check         list files that would change; exit 1 if any
  --width <n>     C++ column limit (default 120)
  --indent <n>    C++ indent width (default 2)
  -j <n>          worker processes (default: one per core)
  -q, --quiet     no summary
  -h, --help      this text
  -v, --version   print the version

A file nishfmt cannot format exactly as the reference tool would (one that
does not parse, say) is left untouched and counted as skipped. In C++, a
`// nishfmt off` ... `// nishfmt on` region is left as written.
```

Directories are walked recursively, skipping hidden entries and honouring
basic `.gitignore` patterns. Each run ends with a summary line:

```text
nishfmt: 30194 files, reformatted 30163, skipped 0; 108.8 MB in 2040 ms (53 MB/s, 4 workers)
```

## Documentation

- [C++](docs/cpp.md): results by repository, and how the formatter works
- [Languages](docs/languages.md): how each port is built and what its corpus is
- [Benchmarks](docs/benchmarks.md): the corpora, the reference tools and the timings
- [Design](docs/design.md): the command line, the workers and memory
- [Porting a formatter](docs/porting.md): how a language gets into nishfmt

## Develop

`npm test` runs the regression cases in `tests/cases/`: each formats to its
`.expected` file, the reference tool's output, and formatting the expected
file leaves it unchanged. `npm run lint` runs biome, and the corpus gates in
[Benchmarks](docs/benchmarks.md) check every language against its reference.
The rules for working in this repository are in [CLAUDE.md](CLAUDE.md).

## License

MIT. The ported formatters keep their projects' licenses; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
