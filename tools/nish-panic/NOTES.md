# The Rust "release-build panic"

`bash tools/nish-panic/repro.sh` rebuilds everything below and exits 0 when
each outcome is still the one recorded here (about 40 seconds).

## What was reported

nish 0.42.0's speed build (`npm run build`, -O3 with LTO) panics with
`index out of range: 18446744073709551615 >= 64` on

```
fn f<T: Clone,,>() {}
fn f<T: Clone,, U:, V>() {}
fn foo<T: T![], T: T!, T: T!{}>() -> Box<T! + T!{}> {}
fn foo<T: for<'a> [const] async Trait>() {}
```

and was reported to skip them cleanly under `--profile debug`, `-g` and
`--emit-ts` with Node. The suspicion was a miscompile in the speed profile.

## What happens (69be496 and main at 42a489f, nish 0.42.0)

It is not a compiler bug. Neither of the report's observations reproduces:
the debug build panics as the speed build does, and replacing the
unchecked accesses in `src/core/out.ts` and `src/core/uwidth.ts` cannot
matter, since neither is on the path (see "Unsafe uses"). Every build panics the same way on the last three
inputs, with the same message:

| build of `tools/dev/rust.ts` | `fn f<T: Clone,,>() {}` | the other three |
| --- | --- | --- |
| `--profile speed` (also `dist/nishfmt`) | exit 1, skipped | exit 1, panic |
| `--profile size` | exit 1, skipped | exit 1, panic |
| `--profile debug` | exit 1, skipped | exit 1, panic |
| `-g` | exit 1, skipped | exit 1, panic |
| `--emit-ts`, Node 22.23.5 | exit 1, skipped | exit 1, panic |

The first input no longer panics on main in any build: `parseGenerics`
answers its node (2) for it, not -1.

The panic is nishfmt's own, a checked index doing its job. gdb on the `-g`
build, breaking on `nish_panic_index`:

```
#0  nish_panic_index (idx=18446744073709551615, len=64) at runtime.c:780
#1  RsParser.parseWhereInto (...) at ./src/rust/parser.ts:1601
#2  RsParser.parseFn (this=..., lo=0) at ./src/rust/parser.ts:1340
```

`parseGenerics` (src/rust/parser.ts:1489) answers `this.fail()`, -1, when
its list does not end at `>`. `parseFn` stores it and calls
`parseWhereInto(g)` without checking `this.failed`, and `parseWhereInto`
reads `this.ast.a[g]` with g = -1. The 64 is `RsAst`'s minimum capacity
(src/rust/ast.ts:287); a larger file's AST names a larger length.
`--emit-panics` lists that read as an unproven index panic
(`src/rust/parser.ts`, line 1601, column 18).

Every caller of `parseWhereInto` takes `g` from `parseGenerics`, so the same
panic is reached through `enum`, `trait`, a trait alias and `type` as well as
`fn` (repro.sh's in4 to in6). `struct`, `union` and `impl` with the same
bound (`<T: T!>`) skip cleanly.

## Unsafe uses

Of the nine modules that import `nish:unsafe` (`uncheckedGet`,
`uncheckedSet`, and `wrappingAdd` in `src/cpp/indenter.ts` alone), the Rust
formatter reaches only `src/core/out.ts`, whose writes happen after parsing.
The panic fires in the parser, before any output, so no unchecked access is
on its path. `src/rust/` uses its own `src/rust/uwidth.ts`, not
`src/core/uwidth.ts`.

## The reduced program

`reduced.ts` is the pattern alone: a "parse" answers -1 and the caller
indexes a 64-slot array with it. It panics identically under speed, size,
debug, `-g` and `--emit-ts` with Node, which is the behaviour nish
documents (AI.md: the TypeScript build "must print the same and exit the
same, a panic included").

## Proposed workaround (not landed here)

In `RsParser.parseWhereInto`, return when `g < 0` (the parser has already
failed). repro.sh builds a copy with that guard: all seven inputs then skip
cleanly with exit 1. The fix belongs in `src/rust/`, with skip cases under
`tests/cases/rust/`, in a Rust stage.
