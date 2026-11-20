// The arguments of a call in a condition are parsed without ALLOW_LET.
fn f() {
    if g(let x = y) {}
}
fn  h( ) {}
