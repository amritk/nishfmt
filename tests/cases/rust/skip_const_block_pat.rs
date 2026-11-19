// rustc rejects a const block in a pattern (parse_const_block).
fn f() {
    let const { 15 } = ();
}
fn  g( ) {}
