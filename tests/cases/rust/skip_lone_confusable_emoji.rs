// An emoji alone that rustc substitutes as a confusable (heavy minus) is an
// error; as part of a longer invalid identifier it is accepted.
fn  f( ) { m!(a ➖ b); }
