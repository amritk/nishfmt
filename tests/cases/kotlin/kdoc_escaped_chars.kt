package p

import foo.Bar
import foo.Baz
import foo.Qux

/**
 * Escaped backticks open no code span: \`[Bar]\` keeps its import.
 *
 * An unescaped one does: `[Baz]` is code.
 *
 * Other punctuation escapes too: \*[Qux]\*.
 */
class A
