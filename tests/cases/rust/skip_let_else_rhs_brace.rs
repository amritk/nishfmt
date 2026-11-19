// The `}` that ends a let-else initializer is found through binary operators
// (classify::expr_trailing_brace).
fn f() {
    let Some(_) = 1 + if a { 2 } else { 3 } else { panic!() };
}
fn  g( ) {}
