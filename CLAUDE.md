# Project rules

nishfmt is one native formatter for C++, Java, Kotlin, Ruby, Swift, Rust,
Dart and C#, each matching one reference tool byte for byte. It is written in
[Nish](https://github.com/amritk/nish), a static subset of TypeScript
compiled ahead of time to a native binary, `dist/nishfmt`. The compiler is
pinned in `.nish-version` (read by `scripts/fetch-nish.sh` and by
amritk/workflows' setup-nish) and lives in `.nish/`. Before writing Nish,
read `.nish/docs/AI.md` (the language as rules, traps first), then
[docs/porting.md](docs/porting.md).

| Command | What it does |
| --- | --- |
| `bash scripts/fetch-nish.sh` | install the pinned compiler into `.nish/` |
| `npm run build` | compile `src/main.ts` to `dist/nishfmt` (about two minutes) |
| `npm test` | every regression case in `tests/cases/`, against `dist/nishfmt` |
| `npm run lint` | biome, over the sources and scripts |
| `.nish/bin/nish tools/dev/<lang>.ts --link dist/<lang>dev` | one language's formatter alone, in seconds |
| `bash bench/corpus/cmp.sh dist/nishfmt <lang>` | the corpus gate for one language ([docs/benchmarks.md](docs/benchmarks.md)) |

## Layout

- `src/main.ts` is the binary: argument parsing, the walk, the worker
  processes and the batches ([docs/design.md](docs/design.md)).
- `src/<lang>/` is one language: `run.ts` holds `<Lang>Engine`,
  `format<Lang>(e, path, src, n, out)` and `is<Lang>Name`, and the rest of
  the directory is that formatter. `src/core/` (output buffer, file walk,
  UTF-16 lengths) and `src/gdoc/` (google-java-format 1.x's Doc engine,
  which Kotlin uses, and the token input and comment helpers Java and Kotlin
  share) are shared. Java runs google-java-format 2.0.0's layout engine, in
  `src/java/layout/`.
- `tests/cases/*.cpp` and `tests/cases/<lang>/<name>.<ext>` are regression
  cases, each with `<name>.expected`, the reference tool's output.
- `bench/corpus/` builds and checks the corpora; `tools/<lang>/` holds each
  port's generators, oracles and `NOTES.md`; `tools/dev/` the one-language
  drivers.

## Writing Nish

- **Every global function and class name is unique across the program.**
  Prefix a language's names: `Sw` (Swift), `Rs` (Rust), `Dt` (Dart), `Cs`
  (C#), and so on.
- **No `as`, no regex, no `split`/`lastIndexOf`, no inheritance.** Strings are
  UTF-8 bytes; work on `u8[]` buffers and `i32` offsets.
- **Results, not exceptions.** A file a formatter cannot handle exactly makes
  `format<Lang>` answer `false`, and nishfmt leaves the file untouched.
  Never guess: wrong output is worse than a skipped file.
- **Run the compiler rather than guess.** When unsure whether something
  compiles or what it does, `.nish/bin/nish run <file>` answers in seconds.

## Ported code

Every formatter but C++ is ported from its reference tool, and each ported
module starts with a comment naming the project, its version and its
license. Keep it when you change the module, add it to a new one, and add a
newly ported project to [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
Port the reference's decision exactly: when a file differs, find the code
that decides the differing whitespace and port that, rather than a heuristic
that happens to fit the corpus.

## Definition of done

Before pushing: `npm run build`, `npm test`, `npm run lint`, and the corpus
gate (`bench/corpus/cmp.sh`) for every language the change touches. A change
to `src/main.ts`, `src/core/` or `src/gdoc/` touches every language that uses
it, so run every gate. A file that matched its reference before must still
match: compare `differ.txt` with the run before the change, not only the
count. **CI** (`.github/workflows/ci.yml`) builds, lints, runs the
regression cases and smoke-runs the binary on every push; it cannot run the
corpus gates, which need the reference tools.

**Read a check's exit status, never its piped tail.** `npm run lint | tail`
reports success when lint fails. Run it bare, or check `$?` / `PIPESTATUS`.

**A fix lands with a regression case** in `tests/cases/` that fails without
it, its `.expected` file taken from the reference tool. The case's input must
differ from its `.expected`: nishfmt writes a skipped file back verbatim, so
an already-formatted input passes whether the file was formatted or skipped,
and cannot catch a formatter that wrongly gives up.

**An upgrade's "no case needed" claim is tested, not argued.** A ported
upstream change that cannot alter the reference tool's output under
nishfmt's fixed settings needs no regression case, but the PR says so with
the distinguishing inputs tried against main's binary and the reference.
"Already matching" needs the same: an input run on main's binary, not only
the upstream spec examples.

**A performance change says what it measured**: a `Measured:` line in the
commit body, before and after, on the same machine.

**Moving where a fact lives moves every pointer to it in the same change.**
Grep the docs, `CLAUDE.md` and source comments for the old location.

## Releasing

Releases are cut by [release-please](https://github.com/googleapis/release-please),
through the reusable workflows in [amritk/workflows](https://github.com/amritk/workflows)
that `.github/workflows/release.yml` calls, pinned by commit:

1. Every push to `main` updates one open **release PR**. It bumps
   `package.json`, `package-lock.json`, `NISHFMT_VERSION` in `src/main.ts`
   (the line marked `x-release-please-version`), the `nishfmt --version`
   output in `README.md` (between `x-release-please-start-version` and
   `x-release-please-end`) and `CHANGELOG.md`, from the conventional commits
   since the last release. Never edit the version or the changelog by hand.
2. Merging the release PR tags `v<version>`, creates the GitHub release, and
   starts `release.yml` on the tag.
3. That run builds `dist/nishfmt` on Linux and macOS, x86_64 and arm64,
   checks each binary's `--version`, and attaches the tarballs with
   `SHA256SUMS` and signed build provenance to the release. It then
   publishes `@amritk/nishfmt` (a launcher) and one
   `@amritk/nishfmt-<target>` package per target to npm, through trusted
   publishing from the `npm` environment. A package's first publish needs an
   `NPM_TOKEN` secret in that environment, since trusted publishing cannot
   create a package.

The release PR is opened with `GITHUB_TOKEN`, so CI does not run on it by
itself; close and reopen it to run the checks before merging.

Two repository settings make this work: **Settings, Actions, General,
Workflow permissions** must allow GitHub Actions to create pull requests
(release-please opens the release PR with `GITHUB_TOKEN`), and the first
release is 0.1.0 (`initial-version`), with the changelog starting at the
rename to nishfmt (`bootstrap-sha`).

## Commits and PRs

Commits and PR titles are conventional, `type(scope): imperative subject`:

```
fix(swift): keep a trailing comment on a wrapped argument

What changed, and why this way.
```

- **type**: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`,
  `ci`, `chore`, `style` or `revert`. `pr-title.yml` checks the PR title,
  which a squash merge lands. release-please reads the type to pick the next
  version (`fix` a patch, `feat` a minor, `!` or a `BREAKING CHANGE` footer a
  major, which is a minor before 1.0), and `feat`, `fix`, `perf`, `refactor`
  and `revert` reach the changelog.
- **scope** (optional): the language (`cpp`, `java`, `kotlin`, `ruby`,
  `swift`, `rust`, `dart`, `csharp`) or the area (`cli`, `core`, `gdoc`,
  `bench`).
