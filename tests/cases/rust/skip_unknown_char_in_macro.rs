// A char that neither starts an identifier nor is an emoji is an unknown
// token, an error inside macro arguments too.
fn  f( ) { m!(a → b); }
