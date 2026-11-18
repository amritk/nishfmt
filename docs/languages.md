# Languages

How each formatter other than C++ is built, what its corpus is, and what it
leaves alone. C++ has a page of its own, [C++](cpp.md). The numbers are in
the [README](../README.md#languages-and-speed); [Benchmarks](benchmarks.md)
says how to reproduce them.

## Java

The Java side ports google-java-format 1.28: a lexer and parser shaped like
javac's tree, its visitor and Doc engine (`src/gdoc/`, shared with Kotlin),
import ordering and removal, the javadoc formatter, long-string wrapping
and the partial reformat google-java-format runs after it, modifier
ordering and text blocks. The corpus is the Java sources of public
repositories as found (`bench/corpus/repos.txt`), 7627 files once the 4
google-java-format rejects are left out.

## Kotlin

The Kotlin side ports ktfmt 0.64's default style onto a lexer and parser
ported from the Kotlin compiler (PSI-shaped, with the IntelliJ platform's
builder): ktfmt's visitor, the shared Doc engine, KDoc formatting, import
sorting with the removal of unused imports, multiline string handling and
trailing commas. ktrs 0.5.1, the Rust reimplementation of ktfmt, also
matches ktfmt on all 9602 corpus files, and nishfmt is faster than it on 1
core and 4.

## C#

The C# side ports CSharpier's whole pipeline onto a Roslyn-shaped syntax tree
of its own: the lexer with Roslyn's trivia, the parser (C# 14), every node
printer, Prettier's Doc printer, member chains, using and modifier sorting,
`csharpier-ignore`, generated-code detection and the reprint for each set of
preprocessor symbols. Its output is CRLF, as CSharpier writes with
`end_of_line = crlf` (the [README](../README.md#settings) gives the style).
The corpus is Newtonsoft.Json, AutoMapper, MediatR,
Polly, Serilog, Dapper, NUnit, xUnit, CSharpier, Humanizer,
CleanArchitecture, EF Core, NLog, RestSharp and FluentValidation; a second
corpus of the same files first formatted with other widths and indents
(`cs2`, so CRLF input where `cs` is mostly LF) also matches on all 13988. The 4 files CSharpier refuses are left
out.

## Dart

The Dart side ports dart_style whole: a scanner and parser to the
analyzer's AST shapes; the tall style's piece builder, solver and cost
model, with the variants `dart format` 3.14 still keeps for language
versions 3.7, 3.8 to 3.12 and 3.13 on; and the short style used below 3.7
(source visitor, chunk builder, rules and line splitter). The version comes
from the file's `// @dart=` comment, else 3.14; nishfmt does not read
package configs for it. The corpus is flutter/packages, flutter/samples,
riverpod, bloc, http, getx, flame, dart_style, shelf, dio and test, plus
`dart2`, the same files first formatted at other widths (10313 / 10313),
`dart3`, the same files marked `// @dart=2.19` or `3.6` for the short style
(8218 / 8218), and `dart4`, marked `3.7`, `3.8` or `3.12` (8663 / 8663).
Files the reference rejects at their version are left out.

## Rust

The Rust side ports rustfmt 1.9.0 onto a lexer and parser modelled on
rustc_parse (a struct-of-arrays AST with rustc's spans): its items,
expressions, chains, patterns, types, comments, imports and macros, with
`macro_rules!` bodies formatted as rustfmt does by default. The corpus is cargo, tokio,
serde, ripgrep, clap, hyper, alacritty, diesel, bevy, regex, fd, bat and
nushell; the 450 files rustfmt
rejects under edition 2021 (mostly let chains) are left out. `rust2`, the
same files first formatted with five other rustfmt configs, also matches on
all 7899, as do the 3306 crates of a cargo registry and rustfmt's own test
inputs. Macros 2.0 bodies and `rustfmt::skip::macros` are not ported; such
files are left unchanged.

## Swift

The Swift side ports SwiftFormat's tokenizer, its Formatter and helpers,
the rule loop and every default rule, `swiftformat:` directive comments
(`disable`, `enable`, `:next`, `:previous`, `:this`), and Swift's grapheme
counting and Unicode case data where SwiftFormat's decisions depend on them.
Directives that set options or sort declarations, and code points whose
Unicode data may differ from SwiftFormat's, make nishfmt skip the file and
leave it as it is; no corpus file needs that. The corpus
is swift-nio, Alamofire, Vapor, the Composable Architecture, RxSwift,
Kingfisher, SnapKit, SwiftLint, swift-argument-parser, swift-collections,
Moya, swift-format, SourceKitten and the Kickstarter iOS app.

## Ruby

The Ruby side ports RuboCop's whole pipeline: the parser gem's lexer, racc
grammar and AST builder (following Prism, which RuboCop parses Ruby 3.3 with,
where the two differ), the TreeRewriter and corrector merging, rubocop
directive comments, the inspect-correct loop and every cop RuboCop enables by
default (393; the ones that never correct under `-a` run once, so that
Lint/RedundantCopDisableDirective can judge directives). The Ruby corpus is
a 2000-file sample of Rails, Discourse, Homebrew, RuboCop, the parser gem,
Jekyll, Sinatra, Devise and rspec-core, less the one file RuboCop rejects;
earlier samples of 739 and 1500 files matched on every file as well.
[`tools/ruby/README.md`](../tools/ruby/README.md) lists the generators.
