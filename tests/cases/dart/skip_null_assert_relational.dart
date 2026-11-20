// `<b>` after `!` followed by an identifier is not type arguments, and
// `a! < b > c` chains relational operators, which the analyzer rejects.
f(a, b, c) => a!  <  b > c;
