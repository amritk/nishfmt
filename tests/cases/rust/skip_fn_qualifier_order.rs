// rustc parses fn qualifiers in one order, `const async unsafe extern fn`
// (parse_fn_front_matter): `async` after `unsafe` is an error.
unsafe async fn foo() {}
fn  f( ) {}
