# Rust port notes

rustfmt 1.9.0, default configuration, `--edition 2021` (style edition 2021),
as `rustfmt --edition 2021 < file` formats one file.

## Status

| Corpus | Identical (cmp.sh) | Skipped by the port |
| --- | --- | --- |
| `/work/c/rust` (sources as found) | 7899 / 7899 | 0 |
| `/work/c/rust2` (sources reformatted first, see below) | 7899 / 7899 | 0 |
| rustfmt's own `tests/source` and `tests/target` inputs (dev driver) | 1850 / 1850 | 53 |
| the same, given the rust2 treatment | 1839 / 1839 | 51 |
| the crates in `~/.cargo/registry/src` | 3306 / 3306 | 0 |
| the same, given the rust2 treatment | 3306 / 3306 | 0 |
| a third of `rust/raw` with every line's indentation removed | 2647 / 2647 | 0 |

Both corpora leave out the 450 files rustfmt itself rejects (`failed.txt`),
mostly for edition 2024 syntax such as let chains, an error under
`--edition 2021`.

`rust2` is built by `tools/rust/mk2.sh`: each file of `rust/raw` is first
formatted with one of five non-default rustfmt configurations (narrow and
wide `max_width`, hard tabs, 2/3/8-space indents, `Max`/`Off` heuristics,
vertical params, leading match pipes, CRLF, no import reordering, …) and the
reference is then the default rustfmt run over that. Raw files there are
far from their formatted form, so far more of the formatter is exercised
than on `rust` (where 81% of the files are already formatted).

The third set is every `.rs` under `/opt/ref/rustfmt-src/tests/{source,target}`
that the reference binary formats at the default config through stdin (the
`// rustfmt-*` option comments there are ignored outside rustfmt's test
harness). It is full of rare syntax and comment placements; the 53 skipped
files use syntax the parser does not take (unstable features such as
`super let`, `mut ref`, pin sugar, postfix match, guard patterns, unsafe
fields/binders, `final`/`impl` restrictions), macros 2.0, or
`rustfmt::skip::macros`/`attributes`.

## The reference is the 1.9.0 binary, not the source at hand

`/opt/ref/rustfmt-src` is rustfmt **1.12.0**; the reference binary is
1.9.0. The 1.10–1.12 entries of its `CHANGELOG.md` list what changed, and
where the binary disagrees with the source the port follows the binary:

- trait impls print `impl const Tr for T` (inherent: `const impl S`);
- an associated type alias prints `default` before its visibility, and an
  opaque (`impl Trait`) type alias in an impl drops its visibility;
- unnamed params (`fn(i32)`, a foreign fn's `...`) drop their attributes;
- a fn pointer type looks for its parameter list from the start of the
  whole type (so a `(` in a `for<#[attr] 'a>` binder is taken for it);
- a struct pattern field's missing-comment span runs up to the pattern, so
  `ident:` is duplicated after a comment between attribute and field;
- loop bodies drop their inner attributes;
- parentheses are added before `.method()` only, not before `.field`/`.await`;
- nested parentheses are removed even when they carry attributes (dropped);
- empty generic args are dropped inside macros too;
- generic const items are kept as written;
- `macro_rules! /* c */ name` loses the comment;
- `for  await` (not exactly one space) panics, so such files are skipped;
- light_rewrite_comment keeps the whitespace char before a leading `*`
  (none when the `*` is at column 0) instead of inserting a space;
- CharClasses takes any `r#` for a raw-string prefix, and the closing quote
  of a raw string without `#`s is normal code;
- an enum whose variant list fails is pushed as header, then the body's
  snippet on a new line at the (still raised) variant indent; generics that
  fail there panic (the file is skipped).

## Speed

All on the shared 4-core machine at low load (other jobs make it noisy;
under load fastfmt took 2.6–3.9 s on 4 cores), the 8349 files of
`/work/c/rust/raw` (108 MB). The stdin row is from an earlier, busier run.

| | 4 cores | 1 core (`taskset -c 0`, fastfmt `-j 1`) |
| --- | --- | --- |
| fastfmt (`-i -q` on a copy of raw) | 1.35 s | 5.0–5.2 s |
| rustfmt, 100 files per process (`xargs -n 100`) | 7.6 s | 29.1 s |
| rustfmt, one file per process through stdin | 148 s | 442 s |

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

- `macro` (macros 2.0) definitions with a body.
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

- Unicode: identifier classes and whitespace are ASCII plus the common
  Unicode whitespace code points; widths use `src/core/uwidth.ts`.
- `replace_names` treats non-ASCII bytes as alphanumeric.

## Tests

`tests/cases/rust/*.rs` with `*.expected` from `rustfmt --edition 2021`:
macro_rules bodies, macro arguments rustc rejects or recovers from, a
frontmatter after a shebang, raw-ident mod order, long attribute literals,
where clauses that grow the AST arrays, and the 1.9.0 behaviors above
(`binary_quirks`). Every `.expected` is a fixed point of the reference. `tests/run.sh` only runs the
top-level C++ cases; these need a Rust loop (format each `.rs`, compare
with `.expected`, and check each `.expected` is left unchanged).

## Iterating

```bash
NISH=/opt/nishpkg/node_modules/.bin/nish
$NISH tools/dev/rust.ts --no-warn-performance --json --link /tmp/rustdev
FFDEBUG=1 /tmp/rustdev file.rs     # reason on stderr when skipped
FFDUMP=1 /tmp/rustdev file.rs      # the AST
FFPARSE=1 /tmp/rustdev file.rs     # parse only
/tmp/rustdev a.rs b.rs ...         # format all, print nothing (profiling)
$NISH tools/dev/rust.ts -g --profile debug --link /tmp/rustdbg   # gdb backtraces
```

`valgrind --tool=callgrind /tmp/rustprof <files>` on a `-g` speed build
gives usable profiles.
