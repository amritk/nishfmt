---
name: Upgrade the Ruby formatter to RuboCop 1.92.3
overview: Move nishfmt's Ruby port from RuboCop 1.92.2 (rubocop-ast 1.51.0, regexp_parser 2.13.1, racc 1.7.3) to RuboCop 1.92.3 (rubocop-ast 1.52.0, regexp_parser 2.13.4, racc 1.8.1), porting every upstream change that alters what the default-enabled autocorrecting cops do or how source parses, with the Ruby corpus gate at 100% and no regressions.
stages:
  - id: upgrade
    title: "feat(ruby): match RuboCop 1.92.3"
    goal: The Ruby formatter matches rubocop -a 1.92.3 (default config, TargetRubyVersion 3.3) on every file of the rebuilt corpus, and every version pointer names the new stack.
    verification: npm run build && npm test && npm run lint && bash bench/corpus/cmp.sh dist/nishfmt rb
    todos:
      - id: baseline
        content: Install RuboCop 1.92.2 with its old dependency set, build the rb corpus and save its differ.txt as the baseline — see Baseline and rebuild
      - id: rebuild
        content: Install RuboCop 1.92.3 with the four pinned versions, rebuild the rb corpus with bench/corpus/mk.sh rb and run the gate — see Baseline and rebuild
      - id: upstream-diff
        content: Read the four changelogs and source diffs and list every change to a default-enabled autocorrecting cop or to parsing, in the PR body — see Upstream changes
      - id: port
        content: Port each listed change into src/ruby/ and src/ruby/cops/, each with a regression case under tests/cases/ruby/ — see Porting
      - id: residual
        content: For each corpus file still differing, find the upstream code deciding the whitespace and port it, with a regression case — see Porting
      - id: pointers
        content: Update every version pointer — README.md, docs/porting.md, docs/benchmarks.md, bench/corpus/mk.sh, THIRD_PARTY_NOTICES.md, tools/ruby/README.md, the src/main.ts help line and every ported module header — see Version pointers
---

## Context

[src/ruby/](src/ruby/) is a port of RuboCop 1.92.2, rubocop-ast 1.51.0, regexp_parser and the parser gem 3.3.13.0 driven by racc 1.7.3's LALR loop ([src/ruby/parser.ts](src/ruby/parser.ts)). The gate today is 100% of 1,998 files. `gem install rubocop -v 1.92.3` resolves rubocop-ast 1.52.0, regexp_parser 2.13.4 and racc 1.8.1. The style is unchanged: `rubocop -a`, default config, `TargetRubyVersion: 3.3`.

## Approach

One stage, one PR. The work is a chain (baseline, rebuild, diff, port, fix residuals, update numbers) where every step needs the corpus the step before built, and the docs need the final measured numbers, so splitting it buys no parallelism.

**Owns:** `src/ruby/**`, `tests/cases/ruby/**`, `tools/ruby/**`, `README.md`, `docs/porting.md`, `docs/benchmarks.md`, `bench/corpus/mk.sh`, `THIRD_PARTY_NOTICES.md`, `src/main.ts` (the one Ruby help line only)

## Baseline and rebuild

- Clone only the `rb` rows of [bench/corpus/repos.txt](bench/corpus/repos.txt), at their pinned commits, the way [bench/corpus/fetch.sh](bench/corpus/fetch.sh) does.
- Baseline: `gem install rubocop -v 1.92.2` with rubocop-ast 1.51.0, regexp_parser 2.13.1, racc 1.7.3 (pin each explicitly so nothing floats); `bash bench/corpus/mk.sh rb`; `npm run build`; `bash bench/corpus/cmp.sh dist/nishfmt rb`; copy `bench/work/out/rb/differ.txt` to `$TMPDIR/differ-1.92.2.txt`. Record the identical count and the file count.
- Rebuild: uninstall the 1.92.2 set (or use a separate `GEM_HOME`) so exactly one RuboCop is on PATH; install rubocop 1.92.3, rubocop-ast 1.52.0, regexp_parser 2.13.4, racc 1.8.1. Record `gem list` for rubocop, rubocop-ast, parser, regexp_parser, racc, unicode-display_width. If the parser gem version differs from 3.3.13.0, say so in the PR body and treat its diff as in scope. Rebuild the corpus and run the gate on the unchanged binary.
- The PR body shows both gate lines (1.92.2 baseline, 1.92.3 final) and the baseline differ list. The final differ list is empty; until it is, `comm -23 final baseline` (a file that matched before and differs now) must print nothing.

## Upstream changes

Read, for each pair, the CHANGELOG and the source diff of the released gems (`gem fetch` both versions and diff the unpacked trees, or the tags on GitHub): rubocop 1.92.2..1.92.3, rubocop-ast 1.51.0..1.52.0, regexp_parser 2.13.1..2.13.4, racc 1.7.3..1.8.1. In the PR body, list every change with one of: ported (file), no effect (why: cop disabled by default, not autocorrecting, no `-a`-safe correction, Ruby-side only), or already matching. Include `config/default.yml` changes: a cop newly enabled, disabled or with a changed default parameter is in scope; regenerate [src/ruby/registry.ts](src/ruby/registry.ts) and [tools/ruby/coporder.txt](tools/ruby/coporder.txt) with the generators in [tools/ruby/](tools/ruby/) when the cop set or order changed.

## Porting

- Port the reference's decision exactly (CLAUDE.md, Ported code). A file the port cannot handle exactly makes `formatRuby` answer `false`; never guess.
- Every fix lands with a case `tests/cases/ruby/<name>.rb` and `<name>.expected`, the expected taken from `rubocop -a` 1.92.3 with the corpus config, that fails without the fix. Cases are run by [tests/run.sh](tests/run.sh) (the `cases/*/*` loop).
- Residual differences after the listed changes are ported: for each, find the cop or parser code that decides the differing whitespace and port that, not a heuristic that fits the corpus.
- The gate ends at 100% of the rebuilt corpus (minus `failed.txt`), and every file identical under 1.92.2 is identical under 1.92.3.

## Version pointers

- Prose and tables: [README.md](README.md) (the table row with re-measured times on the same machine as the other columns, the files count, and the `--help` excerpt), [docs/porting.md](docs/porting.md), [docs/benchmarks.md](docs/benchmarks.md) (version table and Ruby counts), the comment in [bench/corpus/mk.sh](bench/corpus/mk.sh), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) (RuboCop, rubocop-ast, regexp_parser, racc versions where listed).
- [tools/ruby/README.md](tools/ruby/README.md) is the Ruby notes file (there is no `tools/ruby/NOTES.md`); add the upgrade's notes there, and update the version mentions in [tools/ruby/genexceptions.rb](tools/ruby/genexceptions.rb) and [tools/ruby/genteam.py](tools/ruby/genteam.py).
- The `rubocop -a 1.92.2` help line at [src/main.ts:116](src/main.ts) — this one string and nothing else in `src/main.ts`.
- Every `Ported from …` header in `src/ruby/**` naming 1.92.2, rubocop-ast 1.51.0, regexp_parser 2.13.1 or racc 1.7.3. Afterwards `grep -rn '1\.92\.2\|1\.51\.0\|2\.13\.1\|racc 1\.7\.3' --exclude-dir=.git --exclude=CHANGELOG.md .` prints nothing.
- Never touch `package.json`, `CHANGELOG.md` or `NISHFMT_VERSION` (release-please owns them).

## Out of scope

Config-file support; cops off by default; any language but Ruby; any change to `src/main.ts` beyond the help string, `src/core/`, `src/gdoc/`.

## Verification

```bash
npm run build && npm test && npm run lint
bash bench/corpus/cmp.sh dist/nishfmt rb
```

Fast loop: `.nish/bin/nish tools/dev/ruby.ts --link dist/rubydev`, then `bash bench/corpus/cmp.sh dist/rubydev rb`.
