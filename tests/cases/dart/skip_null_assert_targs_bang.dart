// `!` after type arguments does not follow method type arguments, so
// `a!<int>!(1)` chains relational operators, which the analyzer rejects.
f(a) => a!<int>!( 1 );
