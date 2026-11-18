# Notes for cpp23-finish

Written by the lead after #31, #32 and #33 merged (main @ 0728412).

## Where main stands

- `cmp.sh dist/nishfmt cpp` on main + all three (lead's run): **10219 / 10343**, no file that matched on the base differs.
- **90 files** that matched clang-format 18.1.3 still differ: [residual-after-fix-stages.txt](residual-after-fix-stages.txt). opencv 36, folly 36, protobuf 7, rocksdb 6, googletest 2, abseil 2, json 1.
- 4 of the 38 files in `differ-18.txt` now match as well (format-inl.h, ittnotify.h, intrin_neon.hpp, intrin_sse.hpp).
- `npm test`: 370 / 370.

## Categories the fix stages left, and the clang-format 23 code their PR bodies say decides them

These are the workers' findings from reading `clang/lib/Format` at llvmorg-23.1.5; check each against the source before porting.

From #31 (spacing), decided outside classify.ts:
- braced-init-space-after-name (33 files): `UnwrappedLineParser::parseRecord`'s `IsListInitialization` (`struct stat sbuf {}` is a braced init) — parser.ts parseRecord; the spacing follows the brace kind.
- empty-body-semicolon-space (8): `calculateBraceTypes` no longer treats `{}` before `;` as a braced list — parser.ts.
- pp-warning-space (4): 23 sets `TT_AfterPPDirective` on the first token after `#warning`/`#error`; nishfmt hard-codes no space before `(` in format.ts `emitMessage` / `longMessage`.
- braced-temp-arrow (1): `calculateBraceTypes` makes `{}` before `->` a braced list (done in #33), and the `}` before a requirement's `->` must be `BK_Block` for the trailing-return arrow rule (classify.ts).
- template-close-space (1): 23's rewritten `parseAngle` (`SeenTernaryOperator`/`MaybeAngles`), shared with angle-bracket-ternary-misparse.
- non-blocking review leftovers in classify.ts: the doc comment `/** The token before \`t\`, comments skipped, or -1. */` is separated from `prevCode` by `isPossibleMacro`; `isTypeName`'s length/suffix prefilter duplicates an invariant of its 14-name list.

From #32 (breaking), decided outside annotate.ts/indenter.ts:
- class-attr-break (7): the name after `class [[attr]]` is `TT_ClassHeadName` (parseRecord), not `TT_StartOfName`, so `AfterLastAttribute->MustBreakBefore` is not set — nishfmt sets that break in classify.ts ~2068-2093.
- assign-break (5): an enumerator's `=` is `TT_EnumEqual` (`consumeToken`, `Scopes.back() == ST_Enum`), not a binary operator — a new token type (classify.ts/tok.ts, parser.ts). output_adapters.hpp (`(std::max)(...)`) unresolved.
- ternary-chain-alignment (6): WhitespaceManager's `AlignedTo`/`IndentedFromColumn` (format.ts alignChainedConditionals, classify.ts); json_view.hpp is the parseAngle case.
- macro-call-paren-break (4): `parseStructuralElement` no longer makes `MACRO(args)` its own line when the next token is `(` (`FunctionLike && FormatTok->isNot(tok::l_paren)`) — parser.ts.
- break-before-name-after-decl-macro (4): only reproduces when a function definition precedes the `#if`/`#else` — cross-line state.
- braced-list-after-assign-comment (1) and arenaz_sampler.cc: 23 gives a `{` after `=` `BK_BracedInit` for every non-JS language — parser.ts ~2780 `eqList`.
- decl-return-type-ref-break (1, Settings.h): `isFunctionDeclarationName` skips `## identifier` pairs after the name (classify.ts).
- attribute-between-type-and-name-break (1, msa_macros.h): not isolated.

From #33 (lines), decided outside format.ts/parser.ts:
- decl-after-pp-guarded-attribute (18): TokenAnnotator `mustBreakAfterAttributes(ABS_Leave)` sets `MustBreakBefore` and `ReturnTypeWrapped`; ContinuationIndenter's break before the function name honours `ReturnTypeWrapped` (annotate.ts, indenter.ts). #32 fixed 15 of these through another path; check what is left.
- line-comment-space-after-slashes (4): `FormatTokenLexer::getNextToken` truncates a `// ... \` comment at the backslash when the next line starts with `//` (lexer.ts).
- indent-misc-after-macro-or-pp (4): continuation-indent differences (indenter.ts).
- cppcx-handle-declarations (4), angle-bracket-ternary-misparse (3), indent-in-pp-branch-body (1), macro-lambda-struct-va-args-unformatted (1): not ported; need isolation.

## tests/cases/attributes_and_records

clang-format 23.1.5 is not a fixed point on `attributes_and_records.cpp`: one run gives `int f() const { return 1; } // NOLINT`, a second run gives `}  // NOLINT` again. The second run equals the current `.expected`. Keep it: `tests/run.sh` requires each `.expected` to be stable, and docs/cpp.md already counts files whose clang-format output does not settle. Acceptance criterion 4 is read as "each `.expected` is clang-format 23.1.5's settled output for its `.cpp`". If you find another case like it, do the same and name it in the PR body.
