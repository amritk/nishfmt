# nishfmt

nishfmt is not a formatter for Nish code. It is one fast native formatter for
C++, Java, Kotlin, Ruby, Swift, Rust, Dart and C#, written in Nish. For each
language it matches one reference formatter byte for byte (clang-format,
google-java-format, ktfmt, RuboCop, SwiftFormat, rustfmt, `dart format` and
CSharpier), and it is 4 to 76 times faster than that formatter, depending on
the language and the number of cores. It uses each tool's default settings
(for Kotlin, ktfmt's `--kotlinlang-style`; for C#, CRLF line endings) and
reads no style configuration, except the language version and page width
Dart takes from the project; see [Settings](#settings).

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
| C++ | clang-format 23.1.5, `{BasedOnStyle: LLVM, ColumnLimit: 120}` | 99.7% of 10,343 | 87.0 s / 212.9 s | **7.07 s / 28.9 s** |
| Java | google-java-format 2.0.0 | 100% of 7,627 | 32.1 s / 113.6 s | **1.66 s / 6.10 s** |
| Kotlin | ktfmt 0.65, `--kotlinlang-style` | 100% of 9,602 | 89.5 s / not run | **2.00 s / 7.48 s** |
| C# | CSharpier 1.4.0, default options except `end_of_line = crlf` | 100% of 13,988 | 63.0 s / 122.7 s | **3.10 s / 6.63 s** |
| Dart, tall style | `dart format` 3.14.1 | 100% of 10,313 | 55.2 s / 59.9 s | **3.08 s / 8.50 s** |
| Dart, short style (below 3.7) | `dart format` 3.14.1 | 100% of 8,218 | 25.4 s / 25.6 s | **3.76 s / 6.27 s** |
| Swift | SwiftFormat 0.64.7, default rules | 100% of 6,710 | 131.7 s / 262.5 s | **10.2 s / 29.4 s** |
| Rust | rustfmt 1.10.0, edition 2024, `style_edition = "2024"`, `max_width = 120` | 100% of 8,321 | 19.8 s / 45.6 s | **1.89 s / 7.06 s** |
| Ruby | `rubocop -a` 1.92.3, default config, `TargetRubyVersion: 3.3` | 100% of 1,999 | 303.9 s / 289.6 s | **4.00 s / 12.7 s** |

- **Identical** is the share of the corpus files the reference tool accepts
  that nishfmt formats byte for byte as it does; the exact counts, and those
  on a second corpus of other repositories, are in
  [Benchmarks](docs/benchmarks.md#corpus-results). For C++ the reference is
  one `clang-format -i` run, which is not always stable: against
  clang-format's settled output (its own output rerun until it stops
  changing) nishfmt matches 10,319 of the 10,341 files that settle
  ([Benchmarks](docs/benchmarks.md#c-one-run-and-the-settled-output)).
  Times cover the whole corpus directory, including the few files the
  reference rejects.
- One core is `taskset -c 0`, with `-j 1` for nishfmt. nishfmt's times are
  the best of three. The C++ and Ruby rows were measured together on an
  otherwise idle machine, the reference tools one run each; the Java row
  alone on another idle machine, with google-java-format on JDK 21; the
  others during porting on a busier shared machine, so compare within a row.
  The C# times predate the change to CRLF output and were taken on the LF
  corpus. The C++ times were taken against clang-format 18.1.3 on the
  10,344-file corpus, before the move to 23.1.5, and not measured again.
- How the reference tools ran: clang-format 50 files a process; one
  google-java-format JVM over all files; CSharpier on .NET 10 with
  `--no-cache`; rustfmt 100 files a process; RuboCop with `--parallel` on 4
  cores; ktfmt with `--kotlinlang-style`, 300 files a process, 4 at a time,
  as `mk.sh` runs it, and not on one core. The Kotlin row was re-measured on
  a 4-core container for the move to kotlinlang style.
- nishfmt picks the language from the file name: `.cpp .cc .cxx .hpp .hh
  .hxx .h`, `.java`, `.kt .kts`, `.cs`, `.dart`, `.swift`, `.rs`, and
  RuboCop's default `Include` for Ruby (`.rb`, `Gemfile`, `.gemspec`, ...).

[Benchmarks](docs/benchmarks.md) says how each corpus was built and how to
rerun every number.

## Settings

nishfmt formats each language the way its reference tool does at one fixed
setting: the tool's defaults, except for Kotlin, which follows ktfmt's
`--kotlinlang-style` rather than its default (Meta) style, and C#, below.
It reads no style configuration:
`.clang-format`, `rustfmt.toml`, `.rubocop.yml`, `.swiftformat`,
`.csharpierrc` and `.editorconfig` are all ignored. The one exception is
Dart, whose language version and page width `dart format` takes from the
project (below).

- **Java, Swift:** the tool's defaults: google-java-format's Google
  style and SwiftFormat's default rules. google-java-format 2.0.0 runs as on
  JDK 21, with its cleanups on (redundant semicolons, `@Foo()`, `(x) ->`);
  there `///` is a line comment, not Markdown javadoc (that needs JDK 23).
- **Kotlin:** ktfmt's `--kotlinlang-style` (`Formatter.KOTLINLANG_FORMAT`,
  the [Kotlin coding conventions](https://kotlinlang.org/docs/coding-conventions.html)):
  4-space blocks, 4-space continuations, 100 columns, and trailing commas
  managed in full, removed where a list fits on one line and added where it
  does not. There is no option for ktfmt's default (Meta) or Google style.
- **Rust:** rustfmt with three settings, as
  `rustfmt --edition 2024 --config style_edition=2024,max_width=120`
  formats (everything else, such as the width heuristics derived from
  `max_width`, at its default):

  ```toml
  edition = "2024"
  style_edition = "2024"
  max_width = 120
  ```
- **C#:** CSharpier's default options, except that every line break is CRLF
  whatever the input's line endings are, as CSharpier writes under this
  `.editorconfig`:

  ```ini
  root = true
  [*]
  indent_style = space
  [*.cs]
  indent_size = 4
  tab_width = 4
  end_of_line = crlf
  insert_final_newline = true
  ```

  Only `end_of_line` differs from CSharpier's defaults. Line breaks that
  CSharpier copies from the source as they are (disabled `#if` text, an
  interpolated string whose holes span lines) keep their endings.
- **Dart:** `dart format`'s defaults, and the project around each file as
  `dart format` reads it: the language version, which picks the style, comes
  from the file's `// @dart=` comment, else its package in the nearest
  `.dart_tool/package_config.json`, else 3.13 (the newest dart_style knows);
  `pubspec.yaml` is not read. The page width comes from `// dart format
  width=N` (tall style), else `formatter: page_width` in the nearest
  `analysis_options.yaml` (with its includes), else 80. Where `dart format`
  would warn and fall back or reject the file (syntax its language version
  does not enable), or a project file is beyond nishfmt's reader, or
  `trailing_commas: preserve` is set, the file is left untouched.
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
  C++ (.cpp .cc .cxx .hpp .hh .hxx .h)  clang-format 23.1.5, LLVM style
  Java (.java)                        google-java-format 2.0.0
  Kotlin (.kt .kts)                   ktfmt 0.65, kotlinlang style
  Ruby (.rb, Gemfile, .gemspec, ...)  rubocop -a 1.92.3
  Swift (.swift)                      SwiftFormat 0.64.7
  Rust (.rs)                          rustfmt 1.10.0, edition 2024, max_width 120
  Dart (.dart)                        dart format 3.14.1
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
