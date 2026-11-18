---
title: Close the remaining javac 21 parse-time gaps (Java)
slug: javac-21-parse-gaps
base: main @ e32d0ff
stages:
  - id: parse-gaps
    title: "fix(java): skip the remaining files javac 21 rejects at parse time"
    goal: >-
      Every input listed below matches gjf 2.0.0 (JDK 21) byte for byte, or is
      left untouched where gjf fails, by porting javac 21's checks at their
      JavacParser sites in src/java/parser.ts.
    verification: "npm run build && npm test && npm run lint && bash bench/corpus/cmp.sh dist/nishfmt java"
    todos:
      - "Restricted word (var, yield, record, sealed, permits) as a constructor-like member name (`var() {}`) in a class body and in a record body: javac's unannotatedType restricted-type check on the would-be return type. One skip_javac_* case for the class body and one for the record body."
      - "Misplaced sealed / non-sealed: a local sealed (and non-sealed) class; sealed on a field, a method, a constructor and an annotation type; non-sealed on a record; a repeated modifier (`sealed sealed`, `non-sealed non-sealed`). Port javac's check at its site (modifiersOpt's repeated-modifier error, and the flag checks that reject these at parse time on JDK 21). Verify against gjf which of these gjf actually rejects before writing each case; a shape gjf formats is a javac_* case with .expected, not a skip."
      - "`yield ;` (yield with no expression): skip_javac_* case."
      - "`@X var[].class` (annotated restricted name before `[].class`): skip_javac_* case."
      - "`@A String[]::new` (annotated array type before `::`): skip_javac_* case."
      - "`record f() { return null; }` (record as a method's return type, parsed as a malformed record header): skip_javac_* case."
      - "Reverse direction: `int[].class.foo(2)` is skipped by main's binary although gjf formats it. Make it format; javac_* case with .expected from gjf."
      - "Make tests/cases/java/skip_import_module_package.java reach a module-import rejection rather than the import-contiguity skip: find which check skips it today, change the case input (or the code) so the module-import rejection is what fires, and show it by a run where the contiguity skip alone would not skip it."
      - "Each new case fails on main's (e32d0ff) binary and passes on the branch; record the base-binary run in the PR body. Probe each new rejection with near-miss inputs gjf formats (and confirm nishfmt still formats them identically)."
---

# Close the remaining javac 21 parse-time gaps

Follow-up to #40 (run #38). In each listed shape, gjf 2.0.0 on JDK 21 rejects
the file at parse time and nishfmt formats it; in one shape the reverse.

## Stage: parse-gaps

**Owns:** `src/java/**`, `tests/cases/java/**`

All the checks belong to `src/java/parser.ts` (at the JavacParser site each
one ports, as #40 did), so the work is one stage: every shape touches the same
file, and splitting it would only serialize PRs behind merge-order edges.
`src/java/modifiers.ts` is in scope if the modifier checks belong there.

Gate notes:
- There is no coverage command in this repo. The gate is: each new case fails
  on main's binary first, `npm test`, `npm run lint`, and the Java corpus
  gate at 7627 / 7627 with `differ.txt` identical to main's run (empty).
- Reference: gjf 2.0.0 all-deps jar from Maven Central on JDK 21. Build only
  the Java corpus: run `bench/corpus/fetch.sh` on a `repos.txt` filtered to
  `java` lines, then `bench/corpus/mk.sh java`, then `cmp.sh`.
- Skip cases are `tests/cases/java/skip_<name>.java` with no `.expected`.
