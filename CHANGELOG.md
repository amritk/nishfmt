# Changelog

## [0.2.1](https://github.com/amritk/nishfmt/compare/v0.2.0...v0.2.1) (2026-11-28)


### Bug Fixes

* **cpp:** align chained conditionals with clang-format 23's IndentedFrom and AlignedTo ([#73](https://github.com/amritk/nishfmt/issues/73)) ([22b6162](https://github.com/amritk/nishfmt/commit/22b61625288d231e8432966acd14293f1156a05b))
* **cpp:** end an unfinished statement before the comments that precede its `}` ([#72](https://github.com/amritk/nishfmt/issues/72)) ([90d343e](https://github.com/amritk/nishfmt/commit/90d343ebb50cede83c8292fcb7c0252de92eb5b6))
* **cpp:** format until a clang-format check passes, and never change code ([#69](https://github.com/amritk/nishfmt/issues/69)) ([0d353f0](https://github.com/amritk/nishfmt/commit/0d353f04ccc03eec97fb0b7c282cf1c2f5c67dbd))
* **cpp:** go on past a multi-line block comment from where its last line ends ([#74](https://github.com/amritk/nishfmt/issues/74)) ([b19475c](https://github.com/amritk/nishfmt/commit/b19475ca89246a1c76bc35cd0a6337b67b375d3d))
* **cpp:** match clang-format on four macro, directive and K&R forms ([#71](https://github.com/amritk/nishfmt/issues/71)) ([12409f0](https://github.com/amritk/nishfmt/commit/12409f038045c1537ea149b404fc414c27dde8c6))


### Performance

* build Linux with a trained profile, and match clang-format on three C++ decisions ([#75](https://github.com/amritk/nishfmt/issues/75)) ([1d71c89](https://github.com/amritk/nishfmt/commit/1d71c8922521ea50afe39b937a44897e386fff04))

## [0.2.0](https://github.com/amritk/nishfmt/compare/v0.1.0...v0.2.0) (2026-11-25)


### ⚠ BREAKING CHANGES

* **rust:** Rust files are now formatted at edition 2024, style edition 2024 and max_width 120 instead of rustfmt's defaults at edition 2021, so most Rust files format differently.
* **kotlin:** format Kotlin in ktfmt 0.65 kotlinlang style ([#23](https://github.com/amritk/nishfmt/issues/23))
* **csharp:** C# output is now CRLF, whatever the input's line endings.

### Features

* **cpp:** match clang-format 23.1.5 ([#36](https://github.com/amritk/nishfmt/issues/36)) ([f5676dd](https://github.com/amritk/nishfmt/commit/f5676dd9a806a3f7e57f7472258467e273affb0d))
* **csharp:** write CRLF line endings, as CSharpier does with end_of_line = crlf ([#14](https://github.com/amritk/nishfmt/issues/14)) ([3f0e44d](https://github.com/amritk/nishfmt/commit/3f0e44d6934868f22baf3da9635b5d24094d63f2))
* **dart:** take the language version and page width from the project, as dart format 3.14.1 does ([#20](https://github.com/amritk/nishfmt/issues/20)) ([8e81927](https://github.com/amritk/nishfmt/commit/8e819279668f1c0235470e8376282a04ba94c4dd))
* **java:** format javadoc as google-java-format 2.0.0 does ([#17](https://github.com/amritk/nishfmt/issues/17)) ([a3c6749](https://github.com/amritk/nishfmt/commit/a3c67490996f52b18354899c6128e0acd6325928))
* **java:** upgrade the Java formatter to google-java-format 2.0.0 ([#22](https://github.com/amritk/nishfmt/issues/22)) ([cc30ff0](https://github.com/amritk/nishfmt/commit/cc30ff0aedb7d61d79fa393d4a9f6f1812d5b7ac))
* **kotlin:** format Kotlin in ktfmt 0.65 kotlinlang style ([#23](https://github.com/amritk/nishfmt/issues/23)) ([e78c46c](https://github.com/amritk/nishfmt/commit/e78c46cfd551532b41f0d11e60af7c170390fea3))
* **kotlin:** match ktfmt 0.65 and parse as Kotlin 2.4.10 ([#19](https://github.com/amritk/nishfmt/issues/19)) ([4ded8fb](https://github.com/amritk/nishfmt/commit/4ded8fb148e4b67e3c15de11f8b93531c944430c))
* **ruby:** match RuboCop 1.92.3 ([#21](https://github.com/amritk/nishfmt/issues/21)) ([58ca39b](https://github.com/amritk/nishfmt/commit/58ca39bcbd57b01a0f443c2e4d75bdecbc0a908c))
* **rust:** format edition 2024, style 2024, width 120 ([#30](https://github.com/amritk/nishfmt/issues/30)) ([6738223](https://github.com/amritk/nishfmt/commit/67382237308ec84dcb7c84b622a8ec2a12e41044))
* **rust:** parse edition 2024 ([#16](https://github.com/amritk/nishfmt/issues/16)) ([f2cb86f](https://github.com/amritk/nishfmt/commit/f2cb86fcb1361d84e3be6c0b53948f7a85b2be12))
* **rust:** port rustfmt 1.10.0 ([#15](https://github.com/amritk/nishfmt/issues/15)) ([7bc5811](https://github.com/amritk/nishfmt/commit/7bc581148243e06f528dbf3349abe88f20fd4cfc))


### Bug Fixes

* build on nish 0.45.1 with every module but main.ts held to no panic ([#66](https://github.com/amritk/nishfmt/issues/66)) ([81caec7](https://github.com/amritk/nishfmt/commit/81caec7d68653e85387ae472e24e4d4cce2c2cf2))
* **cli:** finish a dead worker's files and skip the file it crashed on ([#48](https://github.com/amritk/nishfmt/issues/48)) ([acba60d](https://github.com/amritk/nishfmt/commit/acba60d0049e8e13d464cd844f18ad2935ef36ee))
* **cli:** report a faulted file as a formatter fault, not as one that does not parse ([#67](https://github.com/amritk/nishfmt/issues/67)) ([4329447](https://github.com/amritk/nishfmt/commit/43294477972a63e60a5903757ba7705e0a4ffb80))
* **core:** walk directories whose names end in .json ([#49](https://github.com/amritk/nishfmt/issues/49)) ([606ac2e](https://github.com/amritk/nishfmt/commit/606ac2ec0bce36d1a767c139362f3c128b7eba25))
* **cpp:** close the long tail on the repos2 corpus ([#60](https://github.com/amritk/nishfmt/issues/60)) ([0d672fc](https://github.com/amritk/nishfmt/commit/0d672fc065c8df1d2b7017bc9c768b0214388746))
* **cpp:** end a raw string only at its full delimiter ([#50](https://github.com/amritk/nishfmt/issues/50)) ([42a489f](https://github.com/amritk/nishfmt/commit/42a489ffb0322bb097f636422953697c0b0aba87))
* **cpp:** match clang-format 23's line joining, comments and preprocessor handling ([#33](https://github.com/amritk/nishfmt/issues/33)) ([0728412](https://github.com/amritk/nishfmt/commit/0728412eccc51a9d79f986eb3b2fec2c5635bfcc))
* **cpp:** match clang-format 23's line-break decisions ([#32](https://github.com/amritk/nishfmt/issues/32)) ([b819574](https://github.com/amritk/nishfmt/commit/b819574fb25848f710d9d03176d359f50f765de0))
* **cpp:** match clang-format 23's spacing decisions ([#31](https://github.com/amritk/nishfmt/issues/31)) ([009e6db](https://github.com/amritk/nishfmt/commit/009e6db3e51e038c880c39c156a1fbc7e682fc1a))
* **cpp:** match clang-format on deeply nested lambdas ([#68](https://github.com/amritk/nishfmt/issues/68)) ([837caeb](https://github.com/amritk/nishfmt/commit/837caeb7b36d270e996332810ccd135fda82ad44))
* **cpp:** match clang-format on the long-tail forms main shared ([#65](https://github.com/amritk/nishfmt/issues/65)) ([4c04ffe](https://github.com/amritk/nishfmt/commit/4c04ffeb8657db78c0a96acb9303915e3c5d8941))
* **cpp:** reset the annotation columns between files ([#64](https://github.com/amritk/nishfmt/issues/64)) ([5966b2c](https://github.com/amritk/nishfmt/commit/5966b2ccd2054348ea17ff30ce07dc32784bea8b))
* **dart:** parse three Flutter forms dart format accepts ([#55](https://github.com/amritk/nishfmt/issues/55)) ([d4cb130](https://github.com/amritk/nishfmt/commit/d4cb1307c4067986590d7636dbab30a009e74675))
* **java:** close the javac 21 parse-time gaps left after [#43](https://github.com/amritk/nishfmt/issues/43) ([#46](https://github.com/amritk/nishfmt/issues/46)) ([860d2d8](https://github.com/amritk/nishfmt/commit/860d2d8c49416b8730f73b5641f6342f4190d6db))
* **java:** skip a lambda parameter list parenthesised again ([#63](https://github.com/amritk/nishfmt/issues/63)) ([533f491](https://github.com/amritk/nishfmt/commit/533f491efa2b38251d63e46e94e13c2c7bb953c5))
* **java:** skip files javac 21 rejects at parse time (restricted names, permits, yield calls) ([#40](https://github.com/amritk/nishfmt/issues/40)) ([e32d0ff](https://github.com/amritk/nishfmt/commit/e32d0ff927a63f76b6f43741047bb8b5bc3b76ec))
* **java:** skip the remaining files javac 21 rejects at parse time ([#43](https://github.com/amritk/nishfmt/issues/43)) ([cffbbb3](https://github.com/amritk/nishfmt/commit/cffbbb3bd09d93908b8165efb02d0aa7f1f29bf0))
* **rust:** parse a binary operator's right side without STMT_EXPR ([#53](https://github.com/amritk/nishfmt/issues/53)) ([d8aad31](https://github.com/amritk/nishfmt/commit/d8aad310ad9bafcf4b6012028999e82a67ba0be5))
* **rust:** parse the syntax rustfmt formats but nishfmt skips ([#57](https://github.com/amritk/nishfmt/issues/57)) ([3b9c6a3](https://github.com/amritk/nishfmt/commit/3b9c6a3f8f4a53934dd8051fba56981fbca69231))
* **rust:** skip the forms rustc's parser rejects, and drop `default` outside impls ([#51](https://github.com/amritk/nishfmt/issues/51)) ([931b88f](https://github.com/amritk/nishfmt/commit/931b88fda1f78a658e9f9640e1bb6a9bcc5758d2))
* **swift:** read only the comment prefix SwiftFormat reads for Unicode checks ([#58](https://github.com/amritk/nishfmt/issues/58)) ([05c7bb5](https://github.com/amritk/nishfmt/commit/05c7bb5bb4db95c55bb0b13ba689bbd95c7ebf45))

## 0.1.0 (2026-11-17)


### Features

* **cli:** add --version and say which files are skipped ([c8dbf65](https://github.com/amritk/nishfmt/commit/c8dbf6589fd69f61d4f71c5e9723f8f1f8a2cddd))


### Refactors

* rename fastfmt to nishfmt ([416ce52](https://github.com/amritk/nishfmt/commit/416ce521e0d9d3a7904ac309953aedfde9534d58))
