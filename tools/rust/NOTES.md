# Rust port notes

rustfmt 1.10.0 (the rustfmt of Rust 1.99.1, `rustfmt 1.10.0-stable (58cf8f9c35
2026-10-13)`) with `edition = "2024"`, `style_edition = "2024"` and
`max_width = 120`, everything else at its default, as
`rustfmt +1.99.1 --edition 2024 --config style_edition=2024,max_width=120 < file`
formats one file. (`--edition 2024` alone implies style edition 2024.)

`RsConfig` (`shape.ts`) carries `edition`, `styleEdition` and the widths
`rsConfigWithMaxWidth` derives from `max_width`; `run.ts` sets them, and the
dev driver takes `FFEDITION`, `FFSTYLE` and `FFWIDTH` to try others. The
style edition 2021 paths stay in the port, as rustfmt keeps them.

## Status

The first two rows are against the configuration above. The others were
measured against rustfmt 1.9.0 at the default configuration and edition
2021, before the move to edition 2024, and have not been re-run.

| Corpus | Identical (cmp.sh) | Skipped by the port |
| --- | --- | --- |
| `bench/work/corpus/rust` (sources as found) | 8321 / 8321 | 0 |
| `bench/work/corpus/rust2` (sources reformatted first, see below) | 8321 / 8321 | 0 |
| rustfmt's own `tests/source` and `tests/target` inputs (dev driver) | 1850 / 1850 | 53 |
| the same, given the rust2 treatment | 1839 / 1839 | 51 |
| the crates in `~/.cargo/registry/src` | 3306 / 3306 | 0 |
| the same, given the rust2 treatment | 3306 / 3306 | 0 |
| a third of `rust/raw` with every line's indentation removed | 2647 / 2647 | 0 |

Both corpora leave out the 28 files rustfmt itself rejects (`failed.txt`):
unstable syntax rustc's parser does not take, `gen` used as an identifier
(reserved in 2024), and the trailing whitespace rustfmt leaves on a
frontmatter fence (`format_lines`). nishfmt leaves every one of them
untouched; `cmp.sh` does not look at them, so check it with
`nishfmt --check` over each path in `failed.txt`.

`rust2` is built by `tools/rust/mk2.sh`: each file of `rust/raw` is first
formatted with one of five non-default rustfmt configurations (narrow and
wide `max_width`, hard tabs, 2/3/8-space indents, `Max`/`Off` heuristics,
vertical params, leading match pipes, CRLF, no import reordering, …) and the
reference is then the default rustfmt run over that. Raw files there are
far from their formatted form, so far more of the formatter is exercised
than on `rust`. Each of the five configurations is the base
(`style_edition=2024,max_width=120`) followed by its own options, which
override it, and every run is at `--edition 2024`.

The third set is every `.rs` under `/opt/ref/rustfmt-src/tests/{source,target}`
that the reference binary formats at the default config through stdin (the
`// rustfmt-*` option comments there are ignored outside rustfmt's test
harness). It is full of rare syntax and comment placements; the 53 skipped
files use syntax the parser does not take (unstable features such as
`mut ref`, pin sugar, postfix match, guard patterns, unsafe binders,
`final`/`impl` restrictions), or `rustfmt::skip::macros`/`attributes`.
(`super let`, unsafe fields and macros 2.0 were among them when this was
measured; they are ported now, see "Unstable syntax from rust-analyzer's
parser tests".)

## The reference source

The binary is built from `src/tools/rustfmt` at the Rust release tag (1.99.1
for rustfmt 1.10.0), not from a tag of the rustfmt repository; port from that
tree. A sparse, blobless clone fetches it with the parser:

```bash
v=1.99.1; mkdir -p $TMPDIR/rustsrc/$v && cd $TMPDIR/rustsrc/$v && git init -q &&
  git remote add origin https://github.com/rust-lang/rust &&
  git sparse-checkout set --no-cone /src/tools/rustfmt/ /compiler/rustc_parse/ /compiler/rustc_lexer/ &&
  git fetch -q --depth 1 --filter=blob:none origin refs/tags/$v && git checkout -q FETCH_HEAD
```

Behaviors of rustfmt 1.10.0 that look like bugs, which the port keeps
(`binary_quirks`; later rustfmt sources change several of them):

- only an impl's associated type alias prints `default`, before its
  visibility and added after the rest is laid out (so its first line can
  pass `max_width`); a free, trait or foreign type alias drops it
  (`default_type_alias`); an opaque (`impl Trait`) type alias in an impl
  drops its visibility;
- a fn pointer type looks for its parameter list from the start of the
  whole type (so a `(` in a `for<#[attr] 'a>` binder is taken for it);
- a fn pointer type's list item for an unnamed param starts at its type, so
  a block comment after the param's attributes makes them a pre-comment
  too and they are printed twice (`fn(#[a] /* c */ i32)`; the output is
  not a fixed point, so `tests/run.sh` cannot hold it as a case);
- a struct pattern field's missing-comment span runs up to the pattern, so
  `ident:` is duplicated after a comment between attribute and field;
- loop bodies drop their inner attributes;
- parentheses are added before `.method()` only, not before `.field`/`.await`;
- nested parentheses are removed even when they carry attributes (dropped);
- empty generic args are dropped inside macros too;
- generic const items are kept as written;
- `for  await` (not exactly one space) panics, so such files are skipped;
- light_rewrite_comment keeps the whitespace char before a leading `*`
  (none when the `*` is at column 0) instead of inserting a space;
- CharClasses takes any `r#` for a raw-string prefix, and the closing quote
  of a raw string without `#`s is normal code;
- an enum whose variant list fails is pushed as header, then the body's
  snippet on a new line at the (still raised) variant indent; generics that
  fail there panic (the file is skipped).

## rustfmt 1.10.0

The source diff from Rust 1.97.0 (rustfmt 1.9.0) to 1.99.1, and where each
change that reaches the default config went (`tests/cases/rust/v1_10_*`):

- rustc 1.99 reads `const` and `unsafe` only before `impl`
  (`check_impl_frontmatter`, then `const` then `unsafe`): `impl const S` is
  an impl of the bare trait object type `const S` (`parseTyCommon`, whose
  rewrite drops a comment after `const`, as rustfmt does), a trait impl
  whose trait is not a plain path is an error (`impl const Tr for T`), and
  `const unsafe impl` and `const impl !Tr` are trait impls: `parser.ts`
  `parseImpl` and the item dispatch (`v1_10_inherent_impl_const`,
  `skip_impl_const_trait`);
- rustc 1.99 parses the inputs of parenthesized generic args as params with
  an optional name (`Fn(a: u32)`, feature-gated after parsing), and rustfmt
  formats them as params: `parser.ts` `parseParenArgs`, `types.ts`
  `formatFunctionType` (`v1_10_named_fn_params`);
- range patterns are formatted by `range.rs` `rewrite_range`, as range
  expressions are (#6871): `expr.ts` `rsRewriteRange`, from `patterns.ts`;
- a trait impl's `const` comes before `unsafe` and `impl`
  (`const impl Tr for T`): `items.ts` `formatImplRefAndType`;
- an unnamed param keeps its attributes (`fn(#[a] i32)`): `items.ts`
  `rsRewriteParam`, with the list item starting where `Spanned` puts it
  (`types.ts`, `rsParamSpannedLo`);
- `macro_rules!` headers keep a comment before the name as written
  (`header.rs`, #6457): `macros.ts` `rsRewriteMacroDef`.

Not ported, and why:

- The long-return-type fix (#6835) is style edition 2027 only. (#6840, a
  commented single fn parameter, is in the style edition 2024 path of
  `rewrite_fn_base`, ported below.)
- Unstable syntax: field representing types, `impl` restrictions, fn
  delegation, pattern types, direct const args,
  `cfg_select!` (formatted on nightly only). Such files stay skipped. Try
  blocks are formatted: the `expr.rs` try-block arms are the same in 1.9.0
  and 1.10.0, so the forms the parser takes need no change.
- Options nishfmt does not read: `--file-lines` (the `missed_spans.rs`,
  `visitor.rs` and `formatting.rs` changes), `hex_literal_case` (now
  stable, default `Preserve`), `doc_comment_code_block_small_heuristics`,
  and `string.rs`'s whitespace test, which `rewrite_string` uses only for
  `format_strings` and `wrap_comments`.
- `modules.rs` skipping a missing out-of-line module with a custom
  attribute: formatting through stdin resolves no modules.

## Unstable syntax from rust-analyzer's parser tests

rust-analyzer's parser tests at aa198229289901e5718e7c0a8d4115638cc1900c
(`crates/parser/test_data/parser/{inline/ok,ok}`,
`crates/syntax/test_data/parser/validation`) hold syntax rustfmt formats and
the port skipped. Each is ported from rustc_parse at 1.99.1 with its nearby
rejections (probed against rustfmt's exit status) and rustfmt 1.10.0's
rewrite:

| Syntax | rustc_parse / rustfmt | Port | Cases |
| --- | --- | --- | --- |
| `x.0. await`, `x.1e2` | `break_up_float`'s TrailingDot and Single; `mk_expr_tuple_field_access` rejects a suffix | `parser.ts` `parseDotSuffix` | `tuple_index_float`, `skip_tuple_index_suffix`, `skip_tuple_index_float_suffix` |
| `Box<(?Sized) + Copy>` | `parse_ty_tuple_or_parens`: a parenthesized bare trait object of one bound goes on with its bounds, and the parens are not the bound's (rustfmt drops them) | `parseTyCommon` | `paren_bounds` |
| `(Trait)` bounds, `[const]` | `parse_generic_bound` (a parenthesized lifetime, `use<..>` or nested parens is an error), `parse_bound_constness`, PolarityAndModifiers; `BoundConstness::as_str` prints `~const` as `[const]` | `parseBound`, `types.ts` `rewritePolyTraitRef` | `paren_bounds`, `tilde_const_bound`, `const_async_bound`, `skip_paren_lifetime_type`, `skip_paren_lifetime_bound`, `skip_nested_paren_bound`, `skip_const_maybe_bound`, `skip_paren_use_bound` |
| `&dyn` | `is_explicit_dyn_type`: from 2018 `dyn` always starts a trait object, whose bounds may be empty (rustfmt prints `dyn `) | `parseTyCommon` | `paren_bounds` |
| `Item<T>: Bound`, `Item::<T> = Item`, `S<'static + Trait>` | `parse_angle_arg` / `get_ident_from_generic_arg`; `parse_generic_arg`'s lifetime check | `parseGenericArg` | `generic_arg_constraints` |
| `Fn::(i32) -> ()`, `method::(..): Send`, `foo::(x)` | `parse_path_segment`: `::(` in any but a module path; a return type after `(..)` is an error | `parsePathSegments`, `parseParenArgs` | `fn_sugar_path` |
| `super let` | `parse_stmt_without_recovery`, `Local::rewrite` (which drops a comment between the keywords) | `parseFullStmt`, `items.ts` `rsRewriteLocal` | `super_let` |
| `unsafe c: u8`, `mut(super) i: i32` | `parse_field_def`, `parse_mut_restriction`, `parse_unsafe_field` (not `safe`, which the port took); `rewrite_struct_field_prefix` | `parseRecordBody`, `parseTupleBody`, `items.ts` `structFieldPrefix` | `field_modifiers`, `skip_safe_field` |
| `pub unsafe static` | `parse_global_static_front_matter`, also as a statement (`safe static` is not one) | `parseItemKind`, `isItemStartForStmt` | `unsafe_static`, `skip_safe_static_stmt` |
| `gen {}`, `async gen move {}` | `parse_gen_block`, `is_gen_block`; `ExprKind::Gen`'s rewrite, which drops a `use` capture clause; `is_simple_block` gets `expr.attrs`, so an attribute keeps the block multi-line (async blocks too) | `parseGenBlock`, `expr.ts` | `gen_blocks`, `async_block_attrs` |
| `macro m($i:ident) {}`, `macro m { .. }` | `parse_item_decl_macro` (params and body become one branch); `rewrite_macro_def`'s header, single-branch form and separator-less branches; `MacroParser` needs every token tree in a branch | `macros.ts` `rsRewriteMacroDef` | `macros2`, `macro_rules_trailing_tokens` |

`fn foo<T: for<'a> [const] async Trait>() {}` panicked the binary: the
`index out of range: 18446744073709551615 >= 64` was the parser's, not the
compiler's. When `parseGenerics` fails it answers -1, and `parseWhereInto`
indexed the AST with it (reached from fns, enums, traits, trait aliases and
type aliases). `parseWhereInto` now returns when the parse has failed, so
such a file is skipped (`skip_generics_double_comma_params`,
`skip_generics_macro_bounds`, which panic on the base binary), and the
`[const]` bound itself now parses and formats (`const_async_bound`).

Guard cases (they pass on the base binary):

- `skip_safe_static_stmt`: `safe static` in a block is a path expression in
  rustc, not an item; it fails on the intermediate head that also made
  `safe static` an item start in `isItemStartForStmt`.

Two rust-analyzer inputs rustc rejects are still taken, as before this
change (written back unchanged, not reported skipped):
`const_param_default_path.rs` (`struct A<const N: i32 = i32::MAX>;`, an
unbraced path as a const param default) and `0038_endless_inclusive_range.rs`
(`0..=;`).

## Edition 2024

Parsing (rustc_lexer, rustc_parse at 1.99.1): `gen` is reserved, guarded
string prefixes (`#"`, `##`) are lexing errors, and let chains parse in `if`
and `while` conditions; before 2024 a let chain there is an error. Let
chains in match guards parse at every edition
(`expect_match_arm_guard_cond`, `LetChainsPolicy::AlwaysAllowed`).

Formatting: `pairs.rs` `rewrite_all_pairs` writes a `&&` chain holding a
`let` one operand per line unless it is exactly `ident_or_bool && let …`
(`let_chain_count`, `can_rewrite_let_chain_single_line`): `pairs.ts`
`rsRewriteAllPairs` (`edition2024_let_chains`). A global path (`::a`) is
not an ident there: rustc gives it a `{{root}}` segment.

`gen` blocks and `async gen` blocks (the unstable gen_blocks, which rustc
parses at 2024) are ported (`gen_blocks`). Not ported (the file is
skipped): `gen fn` and `async gen fn`.

## Style edition 2024

Every `StyleEdition` branch of rustfmt 1.10.0 outside `config/`, and where
it went. Branches on `Edition2027` keep their pre-2027 path; the
`config_option_with_style_edition_default!` defaults that change at 2024
are `style_edition` itself and `version` (Two), which no formatting code
reads.

| rustfmt | What changes at 2024 | Port | Case |
| --- | --- | --- | --- |
| `sort.rs` `version_sort`; `imports.rs` `Ord for UseSegment` | imports sort by version sort, raw identifiers by name | `sort.ts` `rsVersionSort`; `imports.ts` `cmpSeg` | `style2024_version_sort` |
| `reorder.rs` `compare_items` | (`mod` and `extern crate` keep the plain order until 2027) | `reorder.ts` | `style2024_version_sort` |
| `matches.rs` `rewrite_match` | inner attributes at the arms' indent | `matches.ts` `rsRewriteMatch` | `style2024_match` |
| `matches.rs` `rewrite_match_body` | arrow comment after the last uncommented `=>`; `;` after a wrapped `return`/`break`/`continue` body | `matches.ts` `rewriteMatchBody`, `combineNextLine` | `style2024_match` |
| `utils.rs` `trim_left_preserve_layout`, `indent_next_line` | lines of a string inside a comment are not re-indented | `comment.ts` `rsTrimLeftPreserveLayout`, `rsIndentNextLine` | `style2024_commented_strings` |
| `macros.rs` `MacroBranch::rewrite` | a block-bodied branch reserves ` => {{` (6) | `macros.ts` `rewriteBranch` | `style2024_macros` |
| `overflow.rs` `special_cases` | `trace!` is a special-case macro | `overflow.ts` `specialCaseArgs` | `style2024_macros` |
| `overflow.rs` `try_overflow_last_item` | a method chain as a macro's last arg is forced onto one line | `overflow.ts` `tryOverflowLastItem` | `style2024_macros` |
| `overflow.rs` `wrap_items` | args inside a macro are not forced onto one line | `overflow.ts` `wrapItems` | `style2024_macros` |
| `visitor.rs` `close_block` | a comment after a block's last line stays on that line | `visitor.ts` `closeBlock` | `style2024_strings_comments` |
| `missed_spans.rs` `process_comment` | a comment on the line of the code before it keeps the block indent | `visitor.ts` `processComment` | `style2024_strings_comments` |
| `chains.rs` `ChainItem::rewrite` | no space in `x.0.1` | `chains.ts` | `style2024_chains` |
| `closures.rs` `is_block_closure_forced_inner` | a `loop` body forces a block | `closures.ts` `forcedInner` | `style2024_closures` |
| `patterns.rs` `Pat::rewrite` | a slice pattern is an overflowable list | `patterns.ts` `rsRewritePat` | `style2024_patterns` |
| `patterns.rs` `is_short_pattern_inner` | (unchanged until 2027) | | |
| `types.rs` `Ty::rewrite` | a paren type that does not fit is broken; `impl Trait` bounds are joined without the extra indent | `types.ts` `rsRewriteTy` | `style2024_types` |
| `types.rs` `join_bounds_inner` | one bound with a multi-item list is retried on new lines | `types.ts` `joinBounds` | `style2024_types` |
| `stmt.rs` `Stmt::rewrite` | a block's last expression is a sub-expression | `expr.ts` `rsFormatStmt` | `style2024_strings_comments` |
| `expr.rs` `rewrite_string_lit` | a string whose lines all end in `\` is kept as written | `expr.ts` `rsRewriteLiteralTok` | `style2024_strings_comments` |
| `items.rs` `Local::rewrite` | a let-else is measured from `let` (#5901) | `items.ts` `rsRewriteLocal` | `style2024_let_else` |
| `items.rs` `format_variant` | variant attributes get the full width (#5801) | `items.ts` `formatVariant` | `style2024_items` |
| `items.rs` `format_impl_ref_and_type` | impl generics are not shaped as a block | `items.ts` `formatImplRefAndType` | `style2024_items` |
| `items.rs` `FnRetTy::rewrite` | the return type is shaped after `-> ` | `items.ts` `rsRewriteFnRetTy` | `style2024_types` |
| `items.rs` `rewrite_fn_base` | the `)` and return type of an overlong param-less fn (#6840); the return type indent | `items.ts` `rewriteFnBase` | `style2024_items` |
| `items.rs` `rewrite_bounds_on_where_clause` | blank lines between predicates go | `items.ts` `rewriteWhereClause` | `style2024_items` |

Each case fails when its branch is put back on the 2021 path, except three
branches no input can show at this configuration, ported all the same:

- the version sort of an alias (`a as b`, `self as b`): `Ord for UseTree`
  returns a segment's order only when the segments also differ with their
  aliases removed, so an alias never decides;
- the 6-column ` => {{` reserve of a block-bodied `macro_rules!` branch: it
  differs from 5 only when the shape is 5 wide, and with 4-space indents at
  width 120 a shape is a multiple of 4 wide;
- `FnRetTy::rewrite`'s shape after `-> ` (`offset_left` for `Shape::legacy`):
  types break at `shape.block()`, which drops the alignment the two differ in.

## Speed

The 8349 files of `bench/work/corpus/rust/raw` (108 MB) at nishfmt's style,
on a shared 4-core machine; nishfmt the best of three, rustfmt one run.

| | 4 cores | 1 core (`taskset -c 0`, nishfmt `-j 1`) |
| --- | --- | --- |
| nishfmt (`-i -q` on a copy of raw) | 1.89 s | 7.06 s |
| rustfmt, 100 files per process (`xargs -n 100`) | 19.8 s | 45.6 s |

The same machine ran the edition 2021 binary at 1.51 s / 5.23 s. At the
old configuration (`FFEDITION=2021 FFSTYLE=2021 FFWIDTH=100`) the dev driver
is within 2% of it; the rest is the configuration, chiefly the 422 files
with let chains that now parse and are formatted.

rustfmt given file arguments also formats each file's out-of-line modules,
so the batch numbers include some repeated work; stdin per file is the
reference's own definition but pays a process start per file.

What mattered, in order: no quadratic string building (`write_list`,
`trim_tries`, macro-definition helpers append into a byte buffer);
`find_uncommented` and `CommentCodeSlices` scan the source bytes lazily and
stop where rustfmt's iterators stop, instead of classifying whole snippets;
memoized code point widths; line lookups by table; keyword matching by first
byte.

## Layout

- `lexer.ts`, `parser.ts`, `ast.ts`: rustc_lexer / rustc_parse into a
  struct-of-arrays AST with rustc's spans (an item's span starts after its
  outer attributes, a param's before them, …). The parser fails wherever rustc
  reports an error, including the errors rustc recovers from (chained
  comparisons, `...` ranges, let chains before 2024, bad frontmatter), since
  rustfmt treats any reported error as a parse failure — and, for macro
  arguments, as "not an expression".
- `visitor.ts` (visitor.rs, missed_spans.rs), `items.ts`, `expr.ts`,
  `chains.ts`, `closures.ts`, `matches.ts`, `patterns.ts`, `types.ts`,
  `pairs.ts`, `overflow.ts`, `lists.ts`, `comment.ts`, `attr.ts`,
  `imports.ts`, `reorder.ts`, `macros.ts`, `shape.ts`, `utils.ts`, `str.ts`:
  the rustfmt modules of the same names, following its control flow and Shape
  arithmetic. Rewrites answer `string | null` like rustfmt's `Option<String>`.
- `format.ts`: `rsFormatSource` formats a whole source (a file, or a
  snippet); `rsFormatSnippet` / `rsFormatCodeBlock` are rustfmt's
  `format_snippet` / `format_code_block`, used for `macro_rules!` bodies.
- `run.ts`: normalizes CRLF and a BOM away (rustc does), then formats.

## Details worth knowing

- **Array growth.** `ast.a[n] = this.parseX()` reads `ast.a` before the call;
  if the call adds nodes and the arrays grow, the store goes to the old
  array. Every store whose right-hand side may add nodes is hoisted into a
  temp (`gvN`). Keep it that way in new parser code.
- **format_macro_bodies is on by default** (rustfmt's config table says
  `false` in the stability column; the default is `true`). Each branch body
  is renamed (`$x` → `zx`), formatted as a snippet at the reduced width, then
  as a code block inside `fn main`, and must pass format_snippet's checks
  (no macro failure, no lost comment, no trailing whitespace outside skipped
  lines). A branch that fails keeps the whole definition as written.
  `$(` in a body always fails (replace_names).
- **is_macro_def** reaches only the top-level visitor of a macro body and the
  contexts it makes; visitors made for nested blocks start with it off, so
  `return` gets its `;` there (rustfmt does the same).
- **skipped_range** is kept per visitor (source line of the start, *output*
  line count of the visitor's buffer for the end, as rustfmt computes it),
  merged from block visitors only, and is consulted by macro-body indentation
  and the trailing-whitespace check.
- **macro_rewrite_failure** propagates the way rustfmt's `with_context` and
  `FmtVisitor::drop` do (statements, impls, traits, macros, nested visitors);
  fn signatures and other `get_context()` rewrites do not propagate.
- Newline style Auto looks at rustc's normalized source, so output is always
  LF, even for CRLF input.
- `lazy_static!` is formatted as rustfmt formats it; a parse failure falls
  back to ordinary macro handling, a formatting failure is a macro failure.
  `cfg_select!` is only special on nightly, so it is not here.

## Not ported (the file is skipped: `formatRust` answers false)

None of these occur in the two corpora.

- The rest of rust-analyzer's parser tests at aa198229 that rustfmt formats
  (`final` assoc fns, `impl` restrictions, `try bikeshed` blocks, `type
  const` items, `do yeet`) and `gen fn`: unstable syntax the parser does not
  take.

- Foreign items other than fns, statics, type aliases and macro calls.
- Match arms without a body (never-pattern arms), `mut ref` bindings,
  where-clause equality predicates.
- Expression, pattern and type kinds the dispatchers do not know
  (`rewrite of node kind`, `expr kind`, `pattern kind`, `type kind`).
- `#[rustfmt::skip::macros(...)]` / `#[rustfmt::skip::attributes(...)]`
  (the skip context); `#[rustfmt::skip]` is handled, including as an inner
  attribute of a block or a fn body.

## Known differences

None on the corpora. Approximations that could show elsewhere:

- Unicode is taken from the crates rustc and rustfmt use, through tables
  generated from their sources (read as data, never compiled):
  identifiers are rustc_lexer's (XID_Start / XID_Continue from
  unicode-ident 1.0.24, emoji from unicode-properties 0.1.4, rustc_parse's
  confusables; `uident_table.ts`, `tools/rust/uident/mk.py`), whitespace its
  Pattern_White_Space, and widths unicode-width 0.1.14's (`uwidth.ts`,
  `tools/rust/uwidth/mk.py`). A non-ASCII char outside literals and comments
  that rustc_lexer makes an Unknown token, or a lone confusable emoji, fails
  the lex, as rustc reports it.
- `replace_names` treats non-ASCII bytes as alphanumeric.

## Tests

`tests/cases/rust/*.rs` with `*.expected` from
`rustfmt +1.99.1 --edition 2024 --config style_edition=2024,max_width=120`:
macro_rules bodies, macro arguments rustc rejects or recovers from, a
frontmatter after a shebang, raw-ident mod order, long attribute literals,
where clauses that grow the AST arrays, the rustfmt 1.10.0 behaviors
above (`binary_quirks`), the 1.10.0 changes (`v1_10_*`), each style
edition 2024 branch group (`style2024_*`), let chains
(`edition2024_let_chains`), the widths max_width 120 derives
(`width120_lines`) and display width (`unicode_width`). Every `.expected`
is a fixed point of the reference; `tests/run.sh` formats each `.rs` and
each `.expected` and compares (`unicode_idents` and
`macro_unicode_trailing_ws` cover the Unicode tables). Each `skip_*.rs` (no
`.expected`) is a file
the reference rejects, which nishfmt must report skipped and leave byte for
byte as it is.

## Iterating

```bash
NISH=.nish/bin/nish
$NISH tools/dev/rust.ts --no-warn-performance --link /tmp/rustdev
FFDEBUG=1 /tmp/rustdev file.rs     # reason on stderr when skipped
FFSTYLE=2021 FFEDITION=2021 FFWIDTH=100 /tmp/rustdev file.rs   # another config
FFDUMP=1 /tmp/rustdev file.rs      # the AST
FFPARSE=1 /tmp/rustdev file.rs     # parse only
/tmp/rustdev a.rs b.rs ...         # format all, print nothing (profiling)
$NISH tools/dev/rust.ts -g --profile debug --link /tmp/rustdbg   # gdb backtraces
```

`valgrind --tool=callgrind /tmp/rustprof <files>` on a `-g` speed build
gives usable profiles.
