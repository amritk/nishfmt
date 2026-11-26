# Benchmarks and corpora

Every number in the [README](../README.md#languages-and-speed) comes from a
corpus: the sources of public repositories as found, the reference tool's
output for each file, and the list of files the reference rejects. This page
says how to rebuild them and rerun the comparisons.

## Reference tools

| Language | Tool | Version | `mk.sh` finds it as |
| --- | --- | --- | --- |
| C++ | clang-format | 23.1.5 (23.1.6 has the same `clang/lib/Format` and formats identically; PyPI has no 23.1.6 wheel) | `clang-format` on PATH |
| Java | google-java-format | 2.0.0, all-dependencies jar, on JDK 21 | `$GJF` |
| Kotlin | ktfmt | 0.65, with-dependencies jar (from the GitHub release; Maven Central stops at 0.64), run with `--kotlinlang-style` | `$KTFMT` |
| Ruby | RuboCop | 1.92.3 | `rubocop` on PATH |
| Swift | SwiftFormat | 0.64.7 | `$SWIFTFORMAT`, else `swiftformat` |
| Rust | rustfmt | 1.10.0 (Rust 1.99.1) | `$RUSTFMT`, else `rustfmt +1.99.1` |
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
  ktfmt's `--kotlinlang-style`; for Rust, nishfmt's style:
  `--edition 2024 --config style_edition=2024,max_width=120`; for C#, the
  [README](../README.md#settings)'s `.editorconfig`, which `mk.sh cs` writes
  above `ref/` with an empty `.git`; see `tools/csharp/NOTES.md`);
- `failed.txt`, the files the reference rejected, which every comparison
  leaves out;
- for C++ only, `ref-settled/`, each file of `ref/` formatted again until
  clang-format leaves it unchanged (at most five more runs), and
  `unsettled.txt`, the files still changing after the fifth, and
  `settle-failed.txt`, the files clang-format rejects on a rerun (see
  [C++: one run and the settled output](#c-one-run-and-the-settled-output)).

Both scripts read the repository list from `$REPOLIST`, by default
`bench/corpus/repos.txt`. `bench/corpus/repos2.txt` pins a second corpus,
other repositories of the same languages, built and compared the same way:

```bash
export REPOLIST=bench/corpus/repos2.txt REPOS=bench/work/repos2 CORPUS=bench/work/corpus2
bash bench/corpus/fetch.sh
bash bench/corpus/mk.sh java
WORK=bench/work/out2 bash bench/corpus/cmp.sh dist/nishfmt java
```

`mk.sh rb` runs RuboCop under `LC_ALL=C.UTF-8`: under US-ASCII, Style/WordArray
writes the non-ASCII words of a `%w[]` array as escapes.

The harder corpora are built from a language's `raw/`:

| Corpus | Script | What it holds |
| --- | --- | --- |
| `rust2` | `tools/rust/mk2.sh` | each file first formatted with one of five non-default rustfmt configs, each layered on the Rust style (edition 2024, `style_edition=2024,max_width=120`) |
| `dart2` | `tools/dart/mk2.sh` | each file first formatted at width 40 or 120, or in the short style |
| `dart3` | `tools/dart/mk3.sh dart3` | each file marked `// @dart=2.19` or `3.6`, for the short style |
| `dart4` | `tools/dart/mk3.sh dart4` | each file marked `3.7`, `3.8` or `3.12`, for the older tall styles |
| `dart5` | `tools/dart/mk5.sh` | each repository a package at `sdk: ^3.8.0` with the package config `dart pub get` writes, so the version comes from the project |
| `dart6` | `tools/dart/mk3.sh dart6` | each file marked with one of every version from 2.12 to 3.14 |
| `cs2` | `tools/csharp/mkcs2.sh` | each directory first formatted with non-default CSharpier options, layered on the `cs` style's `.editorconfig` |

## Corpus results

Files the reference tool accepts, and how many of them nishfmt formats byte
for byte as it does, on the corpora the README's table is measured on
(`repos.txt`). For C++, "Identical" is against clang-format's settled output,
of the 10341 files that settle; against one `clang-format -i` run it is 10297
of 10343 ([below](#c-one-run-and-the-settled-output)).

| Corpus | Files | Identical |
| --- | ---: | ---: |
| C++ | 10341 | 10333 |
| Java | 7627 | 7627 |
| Kotlin | 9602 | 9602 |
| C# | 13988 | 13988 |
| Dart, tall style | 10313 | 10313 |
| Dart, short style (below 3.7) | 8218 | 8218 |
| Dart, `dart2` (other widths and styles first) | 10313 | 10313 |
| Dart, `dart4` (3.7, 3.8, 3.12) | 8663 | 8663 |
| Dart, `dart5` (a package at 3.8) | 8571 | 8571 |
| Dart, `dart6` (every version) | 7849 | 7849 |
| Swift | 6707 | 6707 |
| Rust | 8321 | 8321 |
| Rust, `rust2` (other configs first) | 8321 | 8321 |
| Ruby | 1999 | 1999 |

The 8 C++ files left are described in [C++](cpp.md#results-by-repository).
Swift counts 6707 files where it counted 6710: rebuilt at the same commits on
2026-11-25, SwiftFormat 0.64.7 rejects 5 of the 6712 files, not 2.

On the second corpus, `repos2.txt`, every language measured on 2026-11-20
at main 0d672fc, except C++, measured again on 2026-11-26 (against the
settled output, of the 13901 files that settle; against one run, 13817 of
13902):

| Corpus | Files | Identical |
| --- | ---: | ---: |
| C++ | 13901 | 13862 |
| Java | 11914 | 11914 |
| Kotlin | 6219 | 6219 |
| C# | 18673 | 18673 |
| Dart, tall style | 10675 | 10675 |
| Swift | 2140 | 2140 |
| Rust | 3606 | 3606 |
| Ruby | 2000 | 2000 |

The README's table stays on the first corpus; the second is a check that
the ports hold on code they were not developed against. Only C++ has files
left, described in [C++](cpp.md#results-by-repository).

### C++: one run and the settled output

clang-format 23.1.5 is not idempotent on every file: run again on its own
output, it changes 39 files of the first corpus and 53 of the second. A CI
check runs it once on the committed file (`clang-format --dry-run --Werror`)
and fails when anything changes, so a file clang-format has just formatted
can fail it. `ref/` holds one `clang-format -i` run; `ref-settled/` holds the
output rerun until it stops changing, which is what passes the check, and
`cmp.sh cpp` reports both. nishfmt formats a C++ file again until a run
leaves it as it is, so its reference is the settled output. A file that never
settles, or that clang-format rejects on a rerun, has no settled output and
is left out of the settled count; nishfmt skips a file whose output still
changes after eight runs ("does not settle").

| Corpus | Files | Identical to the settled output | Identical to one run | Never settle |
| --- | ---: | ---: | ---: | ---: |
| `repos.txt` | 10343 | 10333 of 10341 | 10297 | 2 |
| `repos2.txt` | 13902 | 13862 of 13901 | 13817 | 1 |

Every file that matches one run and not the settled output is one where
clang-format's second run changes its first; nishfmt gives the second.

`bench/corpus/verify.sh`, after `cmp.sh <nishfmt> cpp`, runs that check on
nishfmt's output: clang-format once on each file, failing those it would
change. It fails 4 files of the first corpus and 28 of the second. nishfmt
skips 3 files of the first corpus, the 2 that never settle and one whose
formatting would change its code, and 1 of the second, that one's kind
([C++](cpp.md#what-it-leaves-alone)). Ten files of the second corpus
differ from the settled output and pass the check all the same, a layout
clang-format leaves as it is too.
[C++](cpp.md#results-by-repository) lists the files that fail it.

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
fresh copy each run, as `bench/corpus/time.sh` measures them:

```bash
bash bench/corpus/time.sh dist/nishfmt cpp     # or java, kt, rb, swift, rust, dart, cs, dart3
```

- **4 cores**: `nishfmt -i -q <dir>`, one worker per core.
- **1 core**: `taskset -c 0 nishfmt -i -q -j 1 <dir>`.
- nishfmt's time is the median of five runs on each side, interleaved, with
  the range beside it; each reference tool's is one run on each side (they
  take minutes; `REF=0` skips them). clang-format runs 50 files a process;
  google-java-format as one JVM over all the files; ktfmt with
  `--kotlinlang-style`, 300 files a process; rustfmt 100 files a process;
  RuboCop with `--parallel`; SwiftFormat, `dart format` and CSharpier (on
  .NET 10, with `--no-cache`) over the directory. On one core every one of
  them runs under `taskset -c 0`, one process at a time.

## Rust reimplementations

RuboCop has a Rust reimplementation that also matches it on the whole
corpus. nishfmt is faster than it, on 4 cores and on 1:

| Language | Files | Reimplementation, 4 cores / 1 core | nishfmt, 4 cores / 1 core |
| --- | ---: | ---: | ---: |
| Ruby | 1998 | rbcop 0.1.4: 6.55 s / 20.4 s | 4.00 s / 12.7 s |

ktrs 0.5.1, a Rust reimplementation of ktfmt, had a Kotlin row here, measured
against ktfmt 0.64 in its default (Meta) style; it was not re-measured against
the kotlinlang corpus, so the row is gone.

The Ruby times here were measured under the previous RuboCop, when the
corpus counted 1998 files, on another machine; rebuilt at the same commits it
now counts 1999 (see Corpus results). The README's Ruby row was measured
again on 2026-11-25; rbcop was not, so compare this table only within itself.

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
