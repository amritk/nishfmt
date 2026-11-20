// A shorthand struct pattern field is an identifier, not a reserved word
// (parse_pat_field).
fn f() {
    let S { fn } = ();
}
fn  g( ) {}
