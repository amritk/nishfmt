# Benchmarks and corpora

Every number in the [README](../README.md#languages-and-speed) comes from a
corpus: the sources of public repositories as found, the reference tool's
output for each file, and the list of files the reference rejects. This page
says how to rebuild them and rerun the comparisons.

## Reference tools

| Language | Tool | Version | `mk.sh` finds it as |
| --- | --- | --- | --- |
| C++ | clang-format | 18.1.3 | `clang-format` on PATH |
| Java | google-java-format | 1.28.0, all-dependencies jar | `$GJF` |
| Kotlin | ktfmt | 0.65, with-dependencies jar (from the GitHub release; Maven Central stops at 0.64), run with `--kotlinlang-style` | `$KTFMT` |
| Ruby | RuboCop | 1.92.3 | `rubocop` on PATH |
| Swift | SwiftFormat | 0.64.7 | `$SWIFTFORMAT`, else `swiftformat` |
| Rust | rustfmt | 1.9.0 | `rustfmt` on PATH |
| Dart | `dart format` | Dart SDK 3.14.1 (dart_style 3.1.14-wip at 5a9534fad9ff) | `$DART`, else `dart` |
| C# | CSharpier | 1.4.0 | `$CSHARPIER`, else `csharpier` |

## Building a corpus

```bash
bash bench/corpus/fetch.sh        # clone every repository at its pinned commit
bash bench/corpus/mk.sh java      # raw/, ref/ and failed.txt for one language
```

`bench/corpus/repos.txt` lists each repository as `<lang> <owner/name>
<commit>`; `fetch.sh` clones each at that commit into `bench/work/repos`
(or `$REPOS`), so a corpus rebuilt anywhere holds the same files. `mk.sh`
writes `bench/work/corpus/<lang>` (or `$CORPUS/<lang>`):

- `raw/`, the sources as found (C++ files over 250 KB and Ruby beyond a
  2000-file sample are left out, as are hidden directories);
- `ref/`, the reference tool's output at its default settings (for Kotlin,
  ktfmt's `--kotlinlang-style`; for C#, the
  [README](../README.md#settings)'s `.editorconfig`, which `mk.sh cs` writes
  above `ref/` with an empty `.git`; see `tools/csharp/NOTES.md`);
- `failed.txt`, the files the reference rejected, which every comparison
  leaves out.

The harder corpora are built from a language's `raw/`:

| Corpus | Script | What it holds |
| --- | --- | --- |
| `rust2` | `tools/rust/mk2.sh` | each file first formatted with one of five non-default rustfmt configs |
| `dart2` | `tools/dart/mk2.sh` | each file first formatted at width 40 or 120, or in the short style |
| `dart3` | `tools/dart/mk3.sh dart3` | each file marked `// @dart=2.19` or `3.6`, for the short style |
| `dart4` | `tools/dart/mk3.sh dart4` | each file marked `3.7`, `3.8` or `3.12`, for the older tall styles |
| `dart5` | `tools/dart/mk5.sh` | each repository a package at `sdk: ^3.8.0` with the package config `dart pub get` writes, so the version comes from the project |
| `dart6` | `tools/dart/mk3.sh dart6` | each file marked with one of every version from 2.12 to 3.14 |
| `cs2` | `tools/csharp/mkcs2.sh` | each directory first formatted with non-default CSharpier options, layered on the `cs` style's `.editorconfig` |

## Corpus results

Files the reference tool accepts, and how many of them nishfmt formats byte
for byte as it does, on the corpora the README's table is measured on:

| Corpus | Files | Identical |
| --- | ---: | ---: |
| C++ | 10344 | 10306 |
| Java | 7627 | 7627 |
| Kotlin | 9602 | 9602 |
| C# | 13988 | 13988 |
| Dart, tall style | 10313 | 10313 |
| Dart, short style (below 3.7) | 8218 | 8218 |
| Dart, `dart2` (other widths and styles first) | 10313 | 10313 |
| Dart, `dart4` (3.7, 3.8, 3.12) | 8663 | 8663 |
| Dart, `dart5` (a package at 3.8) | 8571 | 8571 |
| Dart, `dart6` (every version) | 7849 | 7849 |
| Swift | 6710 | 6710 |
| Rust | 7899 | 7899 |
| Ruby | 1999 | 1999 |

The 38 C++ files left are described in [C++](cpp.md#results-by-repository).

## Comparing

```bash
npm run build
bash bench/corpus/cmp.sh dist/nishfmt java
```

`cmp.sh` formats a copy of `raw/` with `nishfmt -i -q`, compares it with
`ref/`, and prints the identical count and the wall time. The files that
differ are in `bench/work/out/<lang>/differ.txt` (or `$WORK/<lang>`) and
their diffs in `all.diff`. Every change to a formatter is checked against
every corpus: a file that matched before must still match.

## Timing

The README's times are for formatting the whole of `raw/` in place, on a
fresh copy each run:

- **4 cores**: `nishfmt -i -q <dir>`, one worker per core.
- **1 core**: `taskset -c 0 nishfmt -i -q -j 1 <dir>`.
- nishfmt's time is the best of three; each reference tool's is one run (they
  take minutes). clang-format ran 50 files a process; google-java-format as
  one JVM over all the files; ktfmt with `--kotlinlang-style`, 300 files a
  process, 4 at a time, as `mk.sh` runs it; RuboCop with `--parallel` on 4 cores; rustfmt
  100 files a process; CSharpier on .NET 10 with `--no-cache`.

## Rust reimplementations

RuboCop has a Rust reimplementation that also matches it on the whole
corpus. nishfmt is faster than it, on 4 cores and on 1:

| Language | Files | Reimplementation, 4 cores / 1 core | nishfmt, 4 cores / 1 core |
| --- | ---: | ---: | ---: |
| Ruby | 1998 | rbcop 0.1.4: 6.55 s / 20.4 s | 4.00 s / 12.7 s |

ktrs 0.5.1, a Rust reimplementation of ktfmt, had a Kotlin row here, measured
against ktfmt 0.64 in its default (Meta) style; it was not re-measured against
the kotlinlang corpus, so the row is gone.

The Ruby times here and in the README were measured under the previous RuboCop, when
the corpus counted 1998 files; rebuilt at the same commits it now counts 1999
(see Corpus results), and the times were not re-measured.

nitrocop, another Rust reimplementation of RuboCop, matched on fewer than a
quarter of the files of an earlier sample and is left out. rustfmt is itself
native.

## C++ against a repository

```bash
bench/compare-repo.sh dist/nishfmt path/to/repo bench/work/repo
```

Both tools format a copy of the repository's C++ sources at
`{BasedOnStyle: LLVM, ColumnLimit: 120}` (the repository's own
`.clang-format` is ignored). The script reports the files that come out
identical and both tools' times, and lists the files that differ in
`bench/work/repo/differ.txt`. [C++](cpp.md) has the results by repository.
