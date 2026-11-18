---
name: C# output in CRLF, against CSharpier 1.4.0
overview: Make nishfmt's C# formatter always write CRLF line endings, porting CSharpier 1.4.0's endOfLine handling (end_of_line = crlf from the user's .editorconfig) exactly, and rebuild the cs and cs2 corpus expectations with that .editorconfig. CSharpier 1.4.0 is still the newest release (checked 2026-11-18), so there is no version port.
stages:
  - id: crlf
    title: 'feat(csharp)!: write CRLF line endings, as CSharpier does with end_of_line = crlf'
    goal: nishfmt's C# output uses CRLF for every line break, byte for byte as CSharpier 1.4.0 with the run's .editorconfig, on the cs and cs2 corpora and on new regression cases
    verification: npm run build && npm test && npm run lint && bash bench/corpus/cmp.sh dist/nishfmt cs && test ! -s bench/work/out/cs/differ.txt && bash bench/corpus/cmp.sh dist/nishfmt cs2 && test ! -s bench/work/out/cs2/differ.txt
    todos:
      - id: baseline
        content: Install .NET 10 and CSharpier 1.4.0, build the default-options cs and cs2 corpora, and save their differ.txt as the baseline before any change — see Baseline
        status: pending
      - id: corpus-editorconfig
        content: Make bench/corpus/mk.sh cs format ref/ under the run's .editorconfig, and make tools/csharp/mkcs2.sh layer its per-directory configs on top of it — see Corpus tooling
        status: pending
      - id: port-eol
        content: Port CSharpier's endOfLine handling into src/csharp so every line break comes out CRLF — see Porting endOfLine
        status: pending
      - id: regression-cases
        content: Add tests/cases/csharp cases for CRLF inside string literals and comments, and for mixed CRLF/LF/CR input, and convert the existing C# expected files to CRLF — see Tests
        status: pending
      - id: gate
        content: Get cs and cs2 to 100% with an empty differ.txt, and check every baseline file still matches — see Verification
        status: pending
      - id: docs
        content: Update README.md, docs/porting.md, docs/benchmarks.md, THIRD_PARTY_NOTICES.md, tools/csharp/NOTES.md and the src/csharp header comments — see Docs
        status: pending
---

## Context

nishfmt's C# formatter ([src/csharp/](src/csharp/)) matches CSharpier 1.4.0 at its default options. The default `endOfLine` is `auto`: [src/csharp/run.ts](src/csharp/run.ts) takes the first line break's ending (`eolCr`) and passes it to `csPrintTree` and the `CsPrinter` in [src/csharp/doc.ts](src/csharp/doc.ts) (`appendEol`). The corpora are built from Linux clones, so in practice the output is LF.

The requested style is CSharpier's defaults with this `.editorconfig`:

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

Only `end_of_line` differs from CSharpier's defaults (`insert_final_newline` is not something CSharpier reads; the others are its defaults). So nishfmt's C# output becomes CRLF always, whatever the input's endings.

**Version.** The CSharpier releases page and NuGet both list 1.4.0 (11 Nov 2026) as the newest release. The `1.5.3-beta1` git tag is not a published release. Requirement 1 therefore needs no port, only the baseline below. The PR body says which version was used: 1.4.0.

## Approach

- **Hard-coded CRLF, no config reading.** nishfmt reads no `.csharpierrc` or `.editorconfig` for any language ([README.md](README.md) says so). C# output is fixed to the style above, the same way every other language is fixed to its reference's default. `eolCr` becomes constant `true` at the point where `run.ts` now detects it, and the detection loop goes. Every downstream use of `eolCr` keeps its parameter, because the code is a port of `context.LineEnding`.
- **Breaking change.** Output for LF files changes, so the commit and PR title are `feat(csharp)!:` with a `BREAKING CHANGE:` footer (the user chose this at sign-off). Before 1.0 that is a minor bump.
- **Port the decisions, not the effect.** CSharpier 1.4.0 decides line endings in `PrinterOptions.GetLineEnding`, `CSharpFormatter` (`LineEnding` on the printing context), `DocPrinter` (`Doc.HardLine`, `LiteralLine`, trims), `Token.cs` (`lineSeparators = ["\r\n", "\r", "\n"]`, which splits literal text and trivia into lines), `CSharpierIgnore.cs` (`WhiteSpaceLineEndingsRegex` replaced with `context.LineEnding`) and `SeparatedSyntaxList.cs` (unformatted code appended with `context.LineEnding`). Read each one at tag 1.4.0 (`git clone --depth 1 --branch 1.4.0 https://github.com/belav/csharpier`) and check that the matching nishfmt code makes the same decision. The current port was written and tested against LF output, so a path that wrote `\n` directly, or kept a source line break as it was, has never been caught.

## Stage crlf

**Owns:** `src/csharp/**`, `tests/cases/csharp/**`, `.gitattributes` (new), `bench/corpus/mk.sh`, `tools/csharp/**`, `README.md`, `docs/porting.md`, `docs/benchmarks.md`, `docs/languages.md`, `THIRD_PARTY_NOTICES.md`

One stage, one PR. The CRLF port, the corpus tooling and the docs form one chain: the port can't pass its gate until the tooling builds CRLF expectations, and the docs need the gate's numbers. Splitting the chain would only make each later piece wait for the earlier one to merge.

## Baseline

1. Install the reference tool: `.NET 10` with `curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 10.0 --install-dir $HOME/.dotnet`, then `dotnet tool install -g csharpier --version 1.4.0`, with `DOTNET_ROOT=$HOME/.dotnet` and `$HOME/.dotnet:$HOME/.dotnet/tools` on `PATH`. Both were checked in a cloud container: they install in a few minutes.
2. `bash bench/corpus/fetch.sh` (only the `cs` rows are needed; filter `repos.txt` locally rather than editing it, or run the whole thing), then `bash bench/corpus/mk.sh cs` and `bash tools/csharp/mkcs2.sh` **at the base commit**, with the default options.
3. `npm run build`, then `bash bench/corpus/cmp.sh dist/nishfmt cs` and `bash bench/corpus/cmp.sh dist/nishfmt cs2`. Save both `differ.txt` files and the count lines outside the checkout (`$TMPDIR`). Expect 13988 / 13988 on both, as [docs/benchmarks.md](docs/benchmarks.md) records. If that is not what you get, stop and say so in the PR: the baseline is the thing every later number is compared against.

## Corpus tooling

- [bench/corpus/mk.sh](bench/corpus/mk.sh), `cs` case: write the `.editorconfig` above to `$d/.editorconfig` (the corpus directory, the parent of `ref/`) before `csharpier format .` runs in `ref/`. CSharpier looks for config files upwards from each file, so this applies to every file. Keep it out of `raw/` and `ref/` themselves: [bench/corpus/cmp.sh](bench/corpus/cmp.sh) counts every file under `ref/`. Check that the repositories' own `.editorconfig`/`.csharpierrc` files do not reach `ref/` (`mk.sh` only copies `*.cs` files) and that nothing above `$d` can be picked up (the `.editorconfig` has `root = true`).
- [tools/csharp/mkcs2.sh](tools/csharp/mkcs2.sh): put the same root `.editorconfig` at `$d/.editorconfig` for both passes. Pass 1 then layers its odd options on top of it. Turn each `.csharpierrc` into a non-root `.editorconfig` with a `[*.cs]` section (`max_line_length = 40` / `150`, `indent_style = tab`, `indent_size = 2`), so it merges with the root one instead of replacing it. First confirm in CSharpier 1.4.0's config resolution (`Src/CSharpier.Cli/Options/`) that a `.csharpierrc` replaces `.editorconfig` settings rather than merging with them, and that nested `.editorconfig` sections merge. Write down what you found in [tools/csharp/NOTES.md](tools/csharp/NOTES.md). Pass 1 therefore writes CRLF, so `cs2/raw` is CRLF input and `cs/raw` is LF input, and both directions are gated. Pass 2 runs with only the root `.editorconfig`. Keep the "config left in ref" check, pointed at the per-directory files only.
- Rebuild both corpora with the new scripts. A `failed.txt` that changes is worth one line in the PR body.

## Porting endOfLine

In [src/csharp/run.ts](src/csharp/run.ts), replace the first-line-break detection with the constant CRLF that `end_of_line = crlf` gives `GetLineEnding`. Then go through every place a line break reaches the output, compare it with CSharpier's code, and port the difference, with the regression case that fails without it:

| What | CSharpier 1.4.0 | Check in nishfmt |
| --- | --- | --- |
| hard lines, literal lines, trailing-whitespace trims | `DocPrinter` | [src/csharp/doc.ts](src/csharp/doc.ts) `appendEol` and its callers, and any direct `byte(10)` |
| verbatim `@"…"`, raw `"""…"""` and interpolated (`$@"…"`, `$"""…"""`) string literals that span lines | `Token.cs` splits the token text on `\r\n`, `\r`, `\n` | [src/csharp/print.ts](src/csharp/print.ts), [src/csharp/lexer.ts](src/csharp/lexer.ts) |
| multi-line `/* */` and `///` comments, `#region` text, preprocessor lines, disabled text | `Token.cs` trivia printing | [src/csharp/print.ts](src/csharp/print.ts) |
| `csharpier-ignore` nodes and ranges | `CSharpierIgnore.cs` `WhiteSpaceLineEndingsRegex` | [src/csharp/print.ts](src/csharp/print.ts) CSharpierIgnore |
| unformatted list items | `SeparatedSyntaxList.cs` | [src/csharp/print.ts](src/csharp/print.ts) SeparatedSyntaxList |
| the symbol-set reprints | `CSharpFormatter` reformats the formatted code | [src/csharp/run.ts](src/csharp/run.ts): the reprint parses CRLF output now |

Every case has to be checked against `csharpier format` with the `.editorconfig` above, byte for byte (`od -c`). A bare `\r` that is not followed by `\n` is in the regression cases, because Roslyn's lexer and `lineSeparators` treat it as a line break. If CSharpier keeps a line break unconverted anywhere (a string literal's value is not something a formatter may change, so check this rather than assume either way), nishfmt keeps it too. If a case cannot be matched exactly, `formatCSharp` answers `false` for it, and the PR says which case and why.

The change stays inside `src/csharp/`. Do not touch [src/main.ts](src/main.ts), `src/core/` or `src/gdoc/`. If you think you must, stop and say why in the PR: it would put every language's gate on this PR.

## Tests

- New cases in `tests/cases/csharp/`, each `.expected` taken from `csharpier format` 1.4.0 with the `.editorconfig` above:
  - `crlf_strings.cs`: multi-line verbatim, raw, interpolated verbatim and interpolated raw strings, with LF inside the literals in an otherwise LF file.
  - `crlf_mixed.cs`: one file mixing CRLF, LF and a bare CR, across code, multi-line comments, `///` docs, `#if`/`#region` lines, disabled text, a `csharpier-ignore` region and string literals.
  - `crlf_input.cs`: an all-CRLF file, which has to stay CRLF and be idempotent.
- Re-take the three existing `.expected` files ([tests/cases/csharp/](tests/cases/csharp/)) from CSharpier with the `.editorconfig`. They become CRLF.
- Byte-exact CRLF files need a [.gitattributes](.gitattributes) entry (`tests/cases/csharp/* -text`) so that no checkout with `core.autocrlf` rewrites them. Check that [tests/run.sh](tests/run.sh) compares bytes (`cmp -s`) and that its idempotence check still holds on CRLF expected files.
- Each new case must fail on the base binary. Say so in the PR body, with the command.

## Docs

- [README.md](README.md): the C# row and the style section say "CSharpier 1.4.0, default options except `end_of_line = crlf`", and give the `.editorconfig`. Update the C# file count and times if the corpus changed.
- [docs/porting.md](docs/porting.md): the C# row in the reference table, plus the `--write-stdout` command with the `.editorconfig`.
- [docs/benchmarks.md](docs/benchmarks.md): the reference-tools row, a sentence on the `.editorconfig` that `mk.sh cs` writes, the `cs2` row (configs layered on it), and the C# corpus result.
- [docs/languages.md](docs/languages.md): the C# paragraph's corpus counts and its description of the style.
- `src/main.ts` keeps its `--help` line (`CSharpier 1.4.0`), which stays true. Editing it would put every language's gate on this PR.
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md): the version stays 1.4.0. Add any CSharpier file newly ported to the table if the table lists files, and otherwise leave it.
- [tools/csharp/NOTES.md](tools/csharp/NOTES.md): the target line (end of line crlf), the "Known differences" list (end of line is no longer one), the config-resolution finding, the line-ending details that matter for byte equality, and a new corpus row.
- Header comments: every `src/csharp/*.ts` module that ports a CSharpier file keeps its `After CSharpier 1.4.0 (MIT License, …)` line. Add the CSharpier files a module now ports (for example `PrinterOptions.cs` `GetLineEnding`) to its list.
- Grep for every other pointer to the old behaviour: `grep -rn -i 'end of line\|endOfLine\|auto' docs README.md CLAUDE.md src/csharp tools/csharp`.

## Out of scope

- Reading `.editorconfig` or `.csharpierrc` at run time, or a line-ending option.
- Any other language, `src/main.ts`, `src/core/`, `src/gdoc/`.
- A CSharpier version change (1.4.0 is the newest release).
- UTF-16 input, which is still refused.

## Verification

Run each bare and read its exit status (CLAUDE.md):

```bash
npm run build
npm test
npm run lint
bash bench/corpus/cmp.sh dist/nishfmt cs && test ! -s bench/work/out/cs/differ.txt
bash bench/corpus/cmp.sh dist/nishfmt cs2 && test ! -s bench/work/out/cs2/differ.txt
```

`cmp.sh` exits 0 even when files differ, so the gate is the empty `differ.txt` and an `N / N identical` count line. Both count lines, with the baseline's, go in the PR body. Every file that matched in the baseline must still match: with both `differ.txt` files empty, that holds by construction. Also run `tools/csharp/testfiles.sh` against CSharpier's own tests (they assume LF, so record the new pass count and do not chase it).
