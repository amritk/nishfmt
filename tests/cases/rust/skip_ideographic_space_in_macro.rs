// U+3000 is not whitespace to rustc_lexer: an unknown token.
macro_rules! m {
    () => {
        a　b
    };
}
fn  f( ) {}
