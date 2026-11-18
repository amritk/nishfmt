// A no-break space is not whitespace to rustc_lexer: an unknown token,
// an error even inside a macro_rules! body.
macro_rules! m {
    () => {
        let  x = 1; 
    };
}
fn  f( ) {}
