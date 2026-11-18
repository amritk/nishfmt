// A line of a macro_rules! body string that ends in Unicode whitespace is
// trailing whitespace to format_snippet (error_on_unformatted is on there),
// so the definition is kept as written.
macro_rules! m {
    () => {
        let  x = "a　
b";
    };
}
fn  f( ) {}
