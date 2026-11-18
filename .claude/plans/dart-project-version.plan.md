---
name: Dart 3.14.1 and the language version from the project
overview: Move nishfmt's Dart reference to `dart format` in Dart SDK 3.14.1, and resolve each file's language version, page width and trailing-comma mode the way that `dart format` does (the `// @dart=` comment, then the surrounding `.dart_tool/package_config.json`, then dart_style's newest version; `analysis_options.yaml` for `formatter:`), with corpora and regression cases that prove it byte for byte.
stages:
  - id: sdk-corpora
    title: "build(bench): rebuild the Dart corpora with Dart 3.14.1 and add package and every-version corpora"
    goal: Every Dart corpus is rebuilt against 3.14.1 with nishfmt still at 100 percent, and two new corpora exist (dart5, a package at sdk ^3.8.0; dart6, every language version) for the project-config stage to be judged on
    verification: bash bench/corpus/cmp.sh dist/nishfmt dart (and dart2, dart3, dart4) each print N / N identical against refs built by Dart 3.14.1, with differ.txt empty, and tools/dart/mk5.sh and tools/dart/mk3.sh dart6 build their corpora
    todos:
      - id: confirm-pin
        content: Confirm what changed from 3.14 to 3.14.1 and record the evidence in the PR body — see Stage 1 / What changed
      - id: baseline-314
        content: Build dart, dart2, dart3, dart4 with Dart 3.14.0, run cmp.sh with main's binary, save each differ.txt — see Stage 1 / Baseline
      - id: rebuild-3141
        content: Rebuild the four corpora with Dart 3.14.1, rerun cmp.sh, compare differ.txt and the ref trees with the 3.14.0 run — see Stage 1 / Rebuild
      - id: mk5-package-corpus
        content: Add tools/dart/mk5.sh building dart5, the tall corpus with a ^3.8.0 pubspec and pub-generated package config per repository — see Stage 1 / dart5
      - id: mk3-dart6
        content: Add a dart6 mode to tools/dart/mk3.sh marking files with every language version dart_style accepts — see Stage 1 / dart6
      - id: bench-docs
        content: Update the tool versions in bench/corpus/mk.sh and tools/dart/mk2.sh, mk3.sh, mk5.sh headers to Dart SDK 3.14.1 — see Stage 1 / Docs
  - id: project-config
    title: "feat(dart): take the language version and page width from the project, as dart format 3.14.1 does"
    goal: nishfmt picks each Dart file's language version, page width and trailing-comma mode from the project exactly as dart format 3.14.1 does, leaves a file untouched whenever it cannot establish them exactly, and takes the right side of every version-gated decision
    verification: npm run build && npm test && npm run lint all exit 0, and bash bench/corpus/cmp.sh dist/nishfmt for dart, dart2, dart3, dart4, dart5 and dart6 each print N / N identical against Dart 3.14.1 refs, no file that matched before now differs
    todos:
      - id: config-reader
        content: Add src/dart/config.ts with DtConfigCache — package config discovery, packageOf, analysis_options.yaml with includes, cached per directory — see Stage 2 / Lookup
      - id: wire-format
        content: Pass the resolved version, page width and trailing-comma mode into formatDart in src/dart/run.ts, keeping the @dart comment first — see Stage 2 / Wiring
      - id: version-gates
        content: Audit every language-version branch in dart_style at the SDK pin and the analyzer parse, and fix any side nishfmt gets wrong — see Stage 2 / Version gates
      - id: runner-packages
        content: Extend tests/run.sh and tools/dart/cases.sh to run a case inside a package directory — see Stage 2 / Regression cases
      - id: cases
        content: Add tests/cases/dart/pkg-* package cases for the lookup and one case per version-gated fix — see Stage 2 / Regression cases
      - id: docs
        content: Update README.md, docs/benchmarks.md, docs/porting.md, docs/design.md, THIRD_PARTY_NOTICES.md, tools/dart/NOTES.md and the src/dart module headers — see Stage 2 / Docs
---

# Dart 3.14.1 and the language version from the project

## Context

nishfmt's Dart port matches `dart format` from Dart SDK 3.14 on four corpora (`dart`, `dart2`, `dart3`, `dart4`, [tools/dart/NOTES.md](../../tools/dart/NOTES.md)). Its language version comes only from a `// @dart=x.y` comment ([src/dart/scanner.ts](../../src/dart/scanner.ts), used in [src/dart/run.ts](../../src/dart/run.ts)), else the newest version. Its page width comes only from `// dart format width=N`, else 80. `dart format` also reads the project around the file, so nishfmt and `dart format` disagree on any file inside a package below the newest version, or under an `analysis_options.yaml` that sets `formatter: page_width`.

## What the lead established before planning

These were checked against the 3.14.1 SDK binary and the dart_style sources. Workers re-verify the ones their stage depends on.

| Fact | Evidence |
| --- | --- |
| `dart format --version` in 3.14.1 prints `3.1.14`, the same as 3.14. | Run on `dartsdk-linux-x64-release.zip` 3.14.1. |
| SDK 3.14.0 and 3.14.1 pin the same dart_style commit, `5a9534fad9ff` (`3.1.14-wip` in its pubspec), which is **ten commits before the `v3.1.14` tag**. | `dart_style_rev` in `DEPS` of dart-lang/sdk at `3.14.0` and `3.14.1`. |
| At that pin, `DartVersionHistory._highest3xMinorVersion` is **13**, so the CLI's default (`DartFormatter.latestLanguageVersion`) is 3.13, not 3.14. The pin does not read `analyzer: enable-experiment` from analysis options (that is `92ce2d74`, after the pin). | `git diff 5a9534fad9ff v3.1.14 -- lib`. |
| The language version comes from `ConfigCache.findLanguageVersion` → `findPackageConfig(file.parent)` (package `package_config`) → `config.packageOf(file.absolute.uri).languageVersion`. **`pubspec.yaml` is never read.** No package config, or a file in no package → the newest version. | `lib/src/config_cache.dart`, `lib/src/io.dart` `_createFormatter` at the pin; and empirically: a package with only `pubspec.yaml` `sdk: ^3.6.0` formats in the tall style. |
| A package config that fails to parse prints a warning and falls back to the newest version. | Empirical, invalid JSON in `.dart_tool/package_config.json`. |
| `packageOf` matches the package's `rootUri`, not its `packageUri`: `tool/a.dart` in a package whose `packageUri` is `lib/` still gets the package's version. | Empirical. |
| `formatter: page_width` and `formatter: trailing_commas` are read from the nearest `analysis_options.yaml`, following `include:` (a string or a list, relative or `package:` resolved through the package config, merged by `merge_options.dart`). An unresolvable `package:` include prints a warning and uses the defaults. | `lib/src/analysis_options/*.dart`; empirically, `page_width: 40` is honoured. |
| Version gates in the tall style at the pin are `== 3.7` (`is3Dot7`), `>= 3.10` (only `preserveTrailingCommaAfterEnumValues`, which needs `trailing_commas: preserve`) and `>= 3.13`. Below 3.7 is the short style. | `lib/src/front_end/formatting_style.dart` at the pin. |

## Approach

- **Port `dart format`, not the requested order where they differ.** The requirements asked for a fallback to the `environment: sdk:` lower bound of the nearest `pubspec.yaml`. `dart format` 3.14.1 has no such fallback, and nishfmt's contract is byte-for-byte output. So the lookup is: `// @dart=` comment, then the package config, then the newest version. A pubspec alone changes nothing. (This is the decision the sign-off question asks about.)
- **Untouched rather than guessed.** Following the requirements, nishfmt leaves the file untouched (`formatDart` answers `false`) wherever `dart format` would warn and fall back, or wherever nishfmt's reader cannot parse a file exactly: a package config or `analysis_options.yaml` nishfmt cannot parse, an include it cannot resolve, `trailing_commas: preserve` (not implemented), a `page_width` that is not a positive integer. A pubspec is never read, so it can never make a file untouched.
- **The cache lives in `src/dart/`.** One `DtConfigCache` per process, keyed by directory, as `ConfigCache` is keyed by `file.parent.path`. The walk and the workers in [src/main.ts](../../src/main.ts) stay as they are. `src/main.ts` is outside both stages: if the lookup cannot be done without it, the worker opens a draft PR saying why.
- **Two stages, developed at the same time.** Stage 1 owns the corpus scripts. Stage 2 owns the formatter, the tests and every doc. Stage 2 runs Stage 1's `mk5.sh` and `mk3.sh dart6` from Stage 1's branch to verify itself, without committing them. Stage 2 merges after Stage 1.

## Stage 1 — sdk-corpora

**Owns:** `bench/corpus/**`, `tools/dart/mk2.sh`, `tools/dart/mk3.sh`, `tools/dart/mk5.sh`

### What changed

Download SDK 3.14.0 and 3.14.1 (`https://storage.googleapis.com/dart-archive/channels/stable/release/<v>/sdk/dartsdk-linux-x64-release.zip`). Record `dart format --version` for both, `dart_style_rev` in `DEPS` at both tags (`https://raw.githubusercontent.com/dart-lang/sdk/<tag>/DEPS`), and the diff of `pkg/analyzer`, `pkg/_fe_analyzer_shared` and `pkg/dartdev` between the two tags. Put all of it in the PR body. If the 3.14.1 refs differ from the 3.14.0 refs on any file, **stop**: list the files and the SDK change that causes them in a draft PR. `src/dart/` is Stage 2's, and a port is a re-plan.

### Baseline

`bash bench/corpus/fetch.sh` (Dart repositories only are enough), `npm run build` on main, then `DART=<3.14.0>/bin/dart bash bench/corpus/mk.sh dart`, `tools/dart/mk2.sh`, `tools/dart/mk3.sh dart3`, `tools/dart/mk3.sh dart4`. Run `cmp.sh` on each and keep each `differ.txt` and `ref/` tree aside (outside the checkout).

### Rebuild

Rebuild the same four with `DART=<3.14.1>/bin/dart`, rerun `cmp.sh`, and compare `differ.txt` and `diff -r` of the old and new `ref/` trees. Expected: identical refs, every corpus at N / N, matching NOTES.md's counts (10313, 10313, 8218, 8663).

### dart5

`tools/dart/mk5.sh` builds `$CORPUS/dart5` from `$CORPUS/dart/raw`: each top-level repository directory gets `pubspec.yaml` (`name: <dir name made a valid package name>`, `environment: sdk: ^3.8.0`, no dependencies) and the `.dart_tool/package_config.json` that `dart pub get --offline` writes for it, in both `raw/` and `ref/`. `ref/` is `dart format .` run inside each package directory. `failed.txt` as in mk3.sh. The package files must not count as corpus files: they are identical in `raw/` and `ref/`, but `cmp.sh` counts every file under `ref/`, so either exclude `pubspec.yaml`, `.dart_tool/**` and `pubspec.lock` from the total in `cmp.sh` (owned here) or report the count without them. Say which in the script's header.

### dart6

`tools/dart/mk3.sh dart6`: every file marked `// @dart=x.y` with x.y chosen by `cksum` from every version the pin's `DartVersionHistory.all` accepts (2.12 to 2.19, 3.0 to 3.13), plus 3.14 (one above the pin's newest), so that every gate (below 3.7, 3.7, 3.8 to 3.9, 3.10 to 3.12, 3.13 and on) and every analyzer feature boundary sees files.

### Docs

The `mk.sh`, `mk2.sh`, `mk3.sh` and `mk5.sh` header comments name Dart SDK 3.14.1 and say what each corpus holds. [docs/benchmarks.md](../../docs/benchmarks.md) is Stage 2's, because Stage 2 merges last and has the final numbers; this stage puts the corpus counts and the rebuild commands in its PR body for Stage 2 to copy.

## Stage 2 — project-config

**Owns:** `src/dart/**`, `tests/run.sh`, `tests/cases/dart/**`, `tools/dart/cases.sh`, `tools/dart/NOTES.md`, `tools/dev/dart.ts`, `README.md`, `docs/benchmarks.md`, `docs/porting.md`, `docs/design.md`, `THIRD_PARTY_NOTICES.md`

### Lookup

New `src/dart/config.ts`, a port of `ConfigCache` at the SDK pin and the parts of `package_config` and `yaml` it relies on (versions from the SDK's `DEPS` at 3.14.1; name each in the module header and in THIRD_PARTY_NOTICES.md):

```ts
// One per process; answers for every file in a directory from one walk.
export class DtConfigCache {
  // false: the project could not be read exactly; leave the file untouched.
  resolve(path: string, r: DtFileConfig): boolean
}
export class DtFileConfig {
  verMajor: i32 = -1; verMinor: i32 = -1; // -1: no package, use the newest
  pageWidth: i32 = -1;                    // -1: none configured
}
```

- Absolute path as Dart's `File.absolute` makes it (lexical, no symlink resolution); parents up to the root.
- Package config: the discovery `findPackageConfig` performs at the pinned `package_config` (read which files it tries and in what order, including whether it still reads `.packages` and whether it stops at a `pubspec.yaml`), JSON parsing, `rootUri` relative to the config file or absolute `file:` URIs, and `packageOf`'s rule when roots nest.
- `analysis_options.yaml`: the nearest one walking up; a YAML reader for the block mappings, sequences, scalars and comments these files use; anything else → untouched. `include:` and the merge as in `analysis_options_file.dart` and `merge_options.dart`.
- Cache per directory (version and options separately, as `ConfigCache` does), so a directory's pubspec, config and options are read once per process.

### Wiring

[src/dart/run.ts](../../src/dart/run.ts): `formatDart` asks the cache first; a `false` answer returns `false`. The `// @dart=` comment overrides the package version; `// dart format width=N` overrides the configured width, which overrides 80. Each existing version check (`toks.verMajor`/`verMinor` at run.ts lines 50–102) reads the resolved version instead of the scanner's alone. No package → the pin's newest (3.13); check whether 3.13 and nishfmt's current "newest" differ anywhere, parse included.

### Version gates

List every branch the pin takes on the language version (`formatting_style.dart`, `is3Dot7` users, `DartVersionHistory`, the short style's entry, any clamp or error for a version above the newest or below 2.12) and every feature the analyzer enables by version that changes the parse without an error. For each, name the nishfmt code that takes it and the side it takes at each version a package config can now produce. Put the table in NOTES.md. Fix any wrong side, each fix with a regression case. dart6 is the check.

### Regression cases

`tests/run.sh` gains package cases: each directory `tests/cases/dart/pkg-<name>/` is copied to a temporary directory and nishfmt runs inside it on every `*.dart` file with a sibling `*.expected`; a case may also expect "left untouched" (an `<name>.untouched` marker, say). The `.expected` files come from `dart format` 3.14.1 run in the copied package (`tools/dart/cases.sh --regen` does this). Cover at least:

| Case | Expect |
| --- | --- |
| package config at 3.6 | short style |
| package config at 3.8, file under `lib/` and under `tool/` | 3.8 tall style |
| `pubspec.yaml` with `sdk: ^3.6.0`, no `.dart_tool` | newest style (pubspec ignored) |
| `// @dart=3.6` in a 3.13 package | short style |
| nested packages | the innermost package's version |
| `formatter: page_width: 40`, directly and through an `include:` | width 40 |
| `// dart format width=100` under `page_width: 40` | width 100 |
| invalid package config JSON | untouched |
| `trailing_commas: preserve` | untouched |
| unresolvable `package:` include | untouched |

### Docs

README.md (the Dart row: Dart 3.14.1 and the project lookup), [docs/benchmarks.md](../../docs/benchmarks.md) (Dart SDK 3.14.1 and the pin in the reference table, dart5 and dart6 in the harder-corpora table, every Dart corpus's count in the results), [docs/porting.md](../../docs/porting.md) (where a port reads its project config), [docs/design.md](../../docs/design.md) (only if the walk changes), THIRD_PARTY_NOTICES.md (dart_style version, `package_config`, `yaml`), [tools/dart/NOTES.md](../../tools/dart/NOTES.md) (Behaviour, the version-gate table, the dart5 and dart6 rows), and the `Ported from dart_style (Dart SDK 3.14)` header in every `src/dart/*.ts` naming 3.14.1 and the pin.

## Out of scope

- `trailing_commas: preserve` formatting (those files are left untouched).
- `analyzer: enable-experiment` (not read at the SDK pin).
- A `--language-version` or `--page-width` flag on nishfmt.
- Any change to `src/main.ts`, `src/core/`, `src/gdoc/` or another language.

## Verification

| Stage | Commands |
| --- | --- |
| sdk-corpora | `npm run build`; `bash bench/corpus/cmp.sh dist/nishfmt dart`, `dart2`, `dart3`, `dart4` against 3.14.1 refs, each N / N; `tools/dart/mk5.sh` and `tools/dart/mk3.sh dart6` complete |
| project-config | `npm run build`, `npm test`, `npm run lint` exit 0; cmp.sh for dart, dart2, dart3, dart4, dart5, dart6 each N / N against 3.14.1 refs; `differ.txt` empty everywhere |
