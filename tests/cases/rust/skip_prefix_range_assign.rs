// A prefix range is a whole expression: no assignment may follow it
// (parse_expr_assoc_after_attrs).
fn f() {
    ..z = 2;
}
fn  g( ) {}
