# Java port notes

google-java-format 2.0.0, default (Google) style, run on JDK 21, as
`java -jar google-java-format-2.0.0-all-deps.jar - < file` formats one file.
Its CLI calls `Formatter.formatSource(input, ranges, removeUnusedImports,
sortImports, reflowLongStrings)` with all three on and the whole file as the
range, and 2.0.0 also turns `--cleanup` on by default.

## Status

| Corpus | Identical (cmp.sh) |
| --- | --- |
| `bench/work/corpus/java`, rebuilt with 2.0.0, on main before the upgrade (1.28 port) | 7157 / 7627 |
| the same, after the layout changes, before the javadoc port merged | 7604 / 7627 (the 23 left are javadoc only) |
| the same, with both | 7627 / 7627 |

The 4 files google-java-format rejects (`failed.txt`) are left out. The
corpus was rebuilt with `GJF=.../google-java-format-2.0.0-all-deps.jar bash
bench/corpus/mk.sh java` on OpenJDK 21.0.13; the 1.28 corpus is not kept.

## What 1.29 to 2.0.0 changed, and what nishfmt does with it

From the release notes, checked against the source diff of 1.28.0 and 2.0.0:

- **1.29**: JDK 21 is the minimum to run the formatter; no formatting
  changes. JDK 21 matters, though: javac 21 rejects a stray `;` before an
  import ("extraneous semicolon") and an import after a type, so the parser
  does too, and the visitor no longer handles them (2.0.0 dropped that code).
- **1.30**: `import module` (#1213). javac 21 does not parse it (`'.'
  expected`), so a file with one fails in google-java-format's first pass;
  nishfmt's parser rejects it too and leaves the file alone. ImportOrderer's
  third group (static, module, normal) and RemoveUnusedImports' skipping of
  module imports are therefore not ported.
- **1.31, 1.33**: no formatting changes. **1.32**: AOSP style for Eclipse.
- **1.34**: instance main methods (JEP 512). javac 21 parses a file of
  top-level fields and methods as an implicitly declared class (JEP 445,
  preview, which google-java-format enables): the parser builds it
  (`FL_IMPLICIT`) and the visitor writes its members without braces
  (`visitImplicitClass`). A package declaration in such a file is an error.
- **1.35**: JDK 27 EA support; nothing for JDK 21.
- **1.36, 1.37**: Markdown (`///`) javadoc. On JDK 21 `///` is a line
  comment, not javadoc (`Runtime.version().feature() >= 23` guards both
  JavaInput.isJavadocComment and the visitor's javadoc positions), so the
  visitor records no Markdown javadoc positions. 1.37 adds `--max-line-length`
  and `--style`, which nishfmt does not take.
- **2.0.0**:
  - A new layout engine (`layout.Doc`, `Docs`, `LayoutBuilder`,
    `LayoutSolver`): greedy, one pass, with choices for hugging. Ported as
    `src/java/layout/engine.ts` (`JlEngine`). The 1.x engine still ships and
    ktfmt (0.65 now) still runs on it, so `src/gdoc/engine.ts` stays as it was.
    With the 1.28 visitor's ops the new engine gives the same output on the
    whole corpus; what changed is what the 2.0.0 visitor asks of it.
  - A sole lambda argument stays on the call's line (#19): `addArguments`
    opens a huggable level, the lambda marks its hug point after `->`, and
    `doNotHug` keeps a block lambda from hugging when its call stays on a
    chain's first line with dereferences after it, or the call has an
    anonymous class body. Statement headers (`if`, `while`, `for`, `switch`,
    `synchronized`, `try` resources) carry header marks, so nothing hugs on
    a header's first line.
  - Comment indentation after `assert`, enum constants, `for` initializers,
    `try` resources, multi-catch and type arguments: comment fences in the
    visitor (`fence()`), which keep a comment inside the level it is in.
  - Text blocks are indented in the main pass (`visitTextBlock`, `Doc.Lines`)
    rather than by StringWrapper.
  - `--cleanup`, on by default (#762): `src/java/cleanups.ts` ports
    CleanupScanner (redundant semicolons, `@Foo()`, `(x) ->`). The passes run
    in `Cleanups.enabledPasses` order: remove unused imports, AST cleanups,
    reorder modifiers, sort imports; 1.28 sorted imports first. Each later
    pass reads the text the one before left. Edit's range mapping and the
    re-indentation of statements outside the range (`reindent`) do nothing
    for a whole-file range, so they are not ported.
  - StringWrapper: an escaped backslash is no longer a split point
    (#1186, #1253, #1439), a run of escaped newlines ends the piece before
    it, and columns count a tab as one (`visualLength` without tabs).
  - The visitor also: takes a token for a modifier only when the
    declaration's modifiers hold it (`isModifier(token, flags)`), treats
    `logVarargs` chains as log statements, adds partial-format marks before
    the closing brace of enums, switches and modules, and writes `var`
    before considering a type's dimensions.
  - Value classes (JEP 401) and the `value` modifier: javac 21 rejects them
    (`value` is not a `Modifier` on JDK 21), so nishfmt leaves such files
    alone.
  - JavaOutput's `touchesEof` token range never happens for StringWrapper's
    string-literal ranges, so it is not ported.
  - Javadoc: see below.

Flags nishfmt does not use: `--max-line-length`, `--style`/`--aosp`,
`--cleanup=false`, `--lines`/`--offset`, `--skip-*`.

## Javadoc

From the javadoc port (#17), in `src/java/javadoc.ts` and `src/java/comments.ts`:

- **JavadocFormatter**: `classicCommentText` runs before lexing. It strips
  `/**`, and `*/` with any stars just before it (`/** foo **/` becomes
  `/** foo */`, #67). It strips each continuation line's leading `*`; a
  line with no star loses only the shortest common prefix, so `<pre>{@code}`
  lines without a `*` keep their relative indentation. Then it strips the
  leading whitespace every line shares (`jdClassicCommentText`,
  `jdStripCommonLeadingWhitespace`).
- **JavadocLexer**: `NEWLINE_PATTERN` is `[ \t]*\n`, since the stars are
  gone. Contexts (pre, code, table, snippet, brace, inline tag) are a
  `NestingStack`; a close tag pops back to its context, so
  `<pre><code>…</pre>` now lexes and is formatted. A word hyphenated across
  one line break is joined (`thread-\nsafe`), except before `and` or `or`.
- **JavadocWriter**: requested whitespace is dropped until something
  significant is written (no blank line before a leading `<ul>` or `<pre>`);
  a list item's continuation lines indent by the width of its tag as
  written; `<blockquote>` takes a blank line outside and a newline inside;
  a multi-line HTML comment is written line by line after ` * `; the MOE
  strip markers count as significant output.
- **JavaCommentsHelper**: no change to default-style output on JDK 21. When
  the hyphen join needs `Character.isLetterOrDigit` of a BMP character
  beyond Latin-1, `formatJavadoc` answers null and the file is skipped.
- **Markdown (`///`) javadoc** is not ported: on JDK 21 `///` is a line
  comment, and the Markdown path also needs a CommonMark parser. If the
  reference moves to JDK 23 or later, it needs a CommonMark port, and the
  visitor must record the Markdown javadoc positions.

## Where each class went

| google-java-format 2.0.0 | nishfmt |
| --- | --- |
| `layout/{Doc,Docs,LayoutBuilder,LayoutSolver}`, `OpsBuilder`, `Indent`, `Output.BreakTag`, `JavaOutput` | `src/java/layout/engine.ts` |
| `JavaInputAstVisitor`, `DimensionHelpers`, `TypeNameClassifier` | `src/java/visitor.ts` |
| `JavacTokens`, `JavaInput`, javac's parser | `src/java/lexer.ts`, `src/java/parser.ts`, `src/java/ast.ts`, `src/gdoc/input.ts` |
| `Cleanups`, `CleanupPass`, `CleanupScanner`, `Edit`, `Formatter` | `src/java/cleanups.ts`, `src/java/run.ts` |
| `ImportOrderer`, `RemoveUnusedImports` | `src/java/imports.ts` |
| `ModifierOrderer` | `src/java/modifiers.ts` |
| `StringWrapper` | `src/java/strings.ts`, `src/java/partial.ts` |
| `javadoc/*`, `JavaCommentsHelper` | `src/java/javadoc.ts`, `src/java/comments.ts`, `src/gdoc/comments.ts` |

`src/java/lexer.ts` is a port of `JavaInput`'s and `JavacTokens`'
tokenization and carries their header. `src/java/parser.ts` and
`src/java/ast.ts` are not ports and carry no ported-module header: they are
nishfmt's own recursive-descent parser and tree, built to give the javac tree
shapes the visitor reads and to make javac's parse decisions, without
translating javac's code. `src/gdoc/` credits google-java-format 1.28.0; why
that holds for Java's 2.0.0 is in
[tools/kotlin/NOTES.md](../kotlin/NOTES.md#srcgdocs-version).

## Working on it

```bash
.nish/bin/nish tools/dev/java.ts --allow-panics --link dist/javadev   # the Java formatter alone, in seconds
dist/javadev file.java | diff - <(java -jar $GJF - < file.java)
```

`FFDEBUG=1` makes the driver say why it skipped a file (a lex or parse
error, imports not contiguous, a layout failure).

## Regression cases

`tests/cases/java/<name>.java` formats to `<name>.expected`, gjf 2.0.0's
output on JDK 21. `tests/cases/java/skip_<name>.java` is a file gjf 2.0.0
rejects: it has no `.expected`, and `tests/run.sh` checks that `-i` reports it
skipped and leaves it byte for byte as it is.

`var_variable_name` is a control: it passes on 275573b (the 1.28 port) as
well and pins no 2.0.0 change. It has `var` as a parameter and variable name,
which javac 21 allows, so the restricted-type-name rejections must not skip
it.

`empty_file`, `javadoc_leading_block` and `javadoc_moe_strip` are files gjf
2.0.0 accepts and leaves as they are, so their `.expected` is their input and
they pass whether nishfmt formats them or skips them.

`javac_*` and `skip_javac_*` pin javac 21's parse-time rejections (#28),
ported at JavacParser's own sites in `src/java/parser.ts`: `typeName()` for
declared class, interface, enum, record, annotation and type parameter names;
`permitsClause` (a class or interface that is not `sealed`) and its
`qualidentList`, which takes names, so `permits var` is valid but `permits
B<T>` and `permits @A B` are not; `isInvalidUnqualifiedMethodIdentifier` for
`yield(1)` (`this.yield(1)` and `A.yield(1)` are calls); the explicit lambda
parameter check on `var x[]`; and `variableDeclaratorRest` for `var x[]` and
`var x = 1, y = 2`, which crashed the visitor before. A type in expression
position (`var[].class`, `record[]::new`) has no restricted-name check, as in
javac's term3. Most rejections set the parser's `rejected` flag rather than
failing at once, because javac reports them and parses on, and a lookahead
that parses past them must still succeed.

Expressions follow term3's modes. After an expression's leading type
annotations the type is read in EXPR mode, so `@A Outer.@B Inner::new` is
"<identifier> expected" (`hasDotAnnotation`), and on an array type (`@A
String[]::new`) gjf fails ("did not generate token"); `@Foo
java.lang.String::length` fails the same way and stays skipped. Type
arguments before `this(...)` or `super(...)` make an explicit constructor
call, and before anything else an illegal start; after `o.` they take
`super` but not `this`. Type arguments read in EXPR mode (a call's, a method
reference's, a creator's) are types, never a wildcard or `<>`
(`exprTypeArgs`), and a name in a type or an expression is never `_`
(`refIdent`), which javac allows only in declarations and patterns. After
an identifier only dims take annotations, `String @A []::new`, and
bracketsSuffix rejects an annotated dim on a class literal. `isUnboundMemberRef` decides whether `<`
after a name starts a method reference's type: its type arguments must close
before `.`, `[` or `::`, so `List<String> @A []::new` is a less-than. And
blockStatement has no case for `static`: a local `static class` or `static
int x` is an illegal start of expression, also after ModifierOrderer turns
`final static` into `static final` (`abstract static class` and `@A static
class` stay legal).

Four of #43's cases are guards (#44): they pass on e32d0ff and pin the
boundary the change moved, not the fix. `javac_near_miss_statements` holds
inputs gjf formats next to the new rejections (`sealed` and `non` as names,
`non - sealed`, a local `abstract sealed class`, array declarations, an
annotated method reference, arrow cases). A binary that over-rejects skips
it and fails: dropping `k === N_ASSIGNMENT ||` from `checkExprStat` in
`src/java/parser.ts` does. `skip_javac_primitive_array_class_statement`,
`skip_javac_primitive_2d_array_class_statement` and
`skip_javac_primitive_array_ctor_ref_statement` are the bare statements
`int[].class;`, `int[][].class;` and `int[]::new;`, which gjf rejects ("not
a statement"). e32d0ff skipped them only because `isLocalVarDecl` took them
for declarations. #43's first head, 9e7e7ad, made
`javac_primitive_array_class_literal_statement` (`int[].class.foo(2);`)
format and, by #42's record, formatted these too. Dropping `this.rejected =
true;` from `checkExprStat` formats all three, which these cases catch.
