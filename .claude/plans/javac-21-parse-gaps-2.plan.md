---
name: Close the javac 21 parse-time gaps left after #43
overview: Make nishfmt's Java parser take javac 21's decision, at its JavacParser site, on five expression and statement shapes, so a file gjf 2.0.0 rejects is skipped and a file it formats is formatted byte for byte. Follow-up to the javac-21-parse-gaps run (#42, #43).
stages:
  - id: javac-gaps
    title: "fix(java): close the javac 21 parse-time gaps left after #43"
    goal: Every shape in the Shapes table matches gjf 2.0.0 on JDK 21, or is left untouched where gjf fails, with the Java corpus gate unchanged
    verification: npm run build && npm test && npm run lint && bash tests/run.sh <cffbbb3 binary> fails on every new case && bash bench/corpus/cmp.sh dist/nishfmt java prints 7627 / 7627 with differ.txt empty
    todos:
      - id: reject-annotated-inner-ctor-ref
        content: Reject an annotation after the dot of a type-annotated qualified method or constructor reference in src/java/parser.ts — see Shapes 1
        status: pending
      - id: reject-static-local-class
        content: Reject a static local class, interface, enum or record in src/java/parser.ts block statements — see Shapes 2
        status: pending
      - id: accept-ctor-call-type-args
        content: Parse and lay out explicit constructor calls with type arguments in src/java — see Shapes 3
        status: pending
      - id: accept-annotated-dim-ctor-ref
        content: Parse and lay out an array constructor reference with annotated dimensions in src/java — see Shapes 4
        status: pending
      - id: pin-qualified-annotated-mref-skip
        content: Keep the leading-annotation qualified method reference skipped, for gjf's reason — see Shapes 5
        status: pending
      - id: regression-cases
        content: Add one skip_javac_* or javac_* case per shape in tests/cases/java, each failing on cffbbb3's binary — see Cases
        status: pending
---

# Close the javac 21 parse-time gaps left after #43

Base: `main` at `cffbbb3` (#43). The previous run is #42; #44 is open on
whether a case that pins a regression introduced inside the same PR counts as
failing on the base. Until #44 is settled, **every new case fails on cffbbb3's
binary**.

## Why one stage

All five shapes are decided in `src/java/parser.ts`, and the three that gjf
formats also need the visitor and layout in `src/java/`. Split stages would
share that file, so they would be a serial chain with no parallelism. One PR.

## Shapes

Probed on 2026-11-18 with gjf 2.0.0 all-deps on JDK 21 and cffbbb3's
`dist/nishfmt`. "base" is cffbbb3's result.

| # | Input (inside a method or constructor body) | gjf 2.0.0 | base | wanted |
|---|---|---|---|---|
| 1 | `Object o = @A Outer.@B Inner::new;` | fails, `<identifier> expected` | formats | skip |
| 1 | `Object o = @A Outer.@B Inner::m;` | fails, `<identifier> expected` | formats | skip |
| 2 | `static class B {}` in a block | fails, `illegal start of expression` | formats | skip |
| 2 | `static interface B {}`, `static enum B { X }`, `static record B() {}`, `final static class B {}` | fails, same | formats | skip |
| 3 | `<String>this(1);` in a constructor | formats | skips | gjf's output |
| 3 | `<String>super();` in a constructor | formats | skips | gjf's output |
| 4 | `Object o = String @A []::new;` | formats | skips | gjf's output |
| 4 | `Object o = String @A [] @B []::new;` | formats | skips | gjf's output |
| 5 | `Object r = @Foo java.lang.String::length;` | fails, `did not generate token "@"` | skips | skip (already) |

Already right on base, and to stay right (probe them after the change):
`Outer.@B Inner::new` and `@A Outer.Inner::new` (skipped, gjf fails);
`o.<String>super();`, `int @A []::new`, `@C String @A []::new`,
`@Foo String::length`, `@Foo List<String>::size` (formatted, match gjf);
`@Foo java.util.ArrayList::new` and `java.lang.@Foo String::length` (skipped,
gjf fails).

1. **Annotated inner constructor or method reference.** javac's term3 reads
   the leading type annotations and then the qualified name; an annotation
   after a `.` there is `<identifier> expected`. The base already rejects the
   unannotated-lead form, so find why the leading-annotation path does not and
   port javac's check at that site.
2. **Static local class.** javac's blockStatement does not take `static` as a
   local-declaration modifier, so it falls through to an expression and fails
   with "illegal start of expression". Port that rejection for every local
   type kind and for `static` after another modifier.
3. **Explicit constructor call with type arguments.** javac's term3 at
   `case LT` in expression mode reads `typeArgumentsOpt` and then `this` or
   `super` with arguments. Parse it and lay it out as gjf's visitor does
   (`visitMethodInvocation` with type arguments).
4. **Annotated dimensions on an array constructor reference.** javac's
   bracketsOpt takes type annotations before each `[]`, and the reference
   then ends in `::new`. Parse them and lay them out as gjf does.
5. **Leading annotation on a qualified method reference.** javac parses it;
   gjf's formatter fails after parsing ("did not generate token"), so the file
   must stay skipped. The base already skips it, so no case can fail on
   cffbbb3's binary. Make sure the shapes 1 and 4 changes do not start
   formatting it, and say in the PR that it is covered by probe rather than a
   case (the requirement listed it as gjf-formatted; gjf 2.0.0 fails on it).

Before relying on javac alone for a skip, run gjf: its ModifierOrderer and
other pre-parse passes can turn a javac rejection into an accepted file (a
local `final sealed class`, in #43).

## Cases

One case per shape, in `tests/cases/java/`, inputs not already formatted:
`skip_javac_annotated_inner_ctor_ref.java` (shape 1, both lines),
`skip_javac_static_local_class.java` (shape 2), `javac_ctor_call_type_args`
(shape 3, `.java` + `.expected`), `javac_annotated_dim_ctor_ref` (shape 4,
`.java` + `.expected`). Each `.expected` is gjf 2.0.0's output. Run each new
case against cffbbb3's binary and confirm it fails there before committing.

## Gates

`npm run build`, `npm test`, `npm run lint` (bare, exit status read), and
`bash bench/corpus/cmp.sh dist/nishfmt java` at 7627 / 7627 with `differ.txt`
empty, as before. The Java corpus is built from `bench/corpus/fetch.sh` on a
`repos.txt` filtered to `java` lines, then `GJF=<jar> bash bench/corpus/mk.sh
java`. Build one nish binary at a time: several at once can run a 16 GB
container out of memory. There is no coverage command in this repo; the
coverage gate is replaced by every new case failing on the base binary.

**Owns:** `src/java/**`, `tests/cases/java/**`, `tools/java/NOTES.md`
