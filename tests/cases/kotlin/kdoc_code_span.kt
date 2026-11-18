package p

import foo.Bar
import foo.Baz
import foo.Qux
import foo.Quux
import foo.Corge

/**
 * Uses `[Bar]` in a code span, and [Baz] as a link.
 *
 * ````
 * ```
 * [Qux] inside a four-backtick fence
 * ```
 * ````
 *
 * ~~~~
 * [Quux] inside a tilde fence
 * ~~~~
 *
 * A ``code span with ` and [Corge]`` ends here.
 */
class A
