// ktfmt's FormattingOptions, at the one style nishfmt formats Kotlin in:
// Formatter.KOTLINLANG_FORMAT, what `--kotlinlang-style` selects.
//
// Ported from ktfmt 0.65's Formatter and FormattingOptions (Apache License
// 2.0, Copyright (c) Meta Platforms, Inc. and affiliates).
//
// KOTLINLANG_FORMAT is FormattingOptions(blockIndent = 4,
// continuationIndent = 4), so every other field keeps its default:
// maxWidth 100, trailingCommaManagementStrategy COMPLETE,
// removeUnusedImports true, preserveLambdaBreaks true. META_FORMAT, ktfmt's
// default style, differs in blockIndent (2) and in ONLY_ADD, which keeps the
// trailing commas COMPLETE removes. tools/kotlin/NOTES.md lists where each
// option is read.

/** maxWidth: the column limit, for code and for KDoc. */
export const K_MAX_WIDTH: i32 = 100;

/** blockIndent: the indent of a block's contents. */
export const K_BLOCK_INDENT: i32 = 4;

/** continuationIndent: the indent of a line broken inside an expression. */
export const K_CONTINUATION_INDENT: i32 = 4;

/**
 * trailingCommaManagementStrategy.removeRedundantTrailingCommas: COMPLETE
 * drops every managed list's trailing comma before the layout, and the comma
 * pass after it puts one back where the list is on more than one line.
 */
export const K_REMOVE_REDUNDANT_TRAILING_COMMAS: boolean = true;
