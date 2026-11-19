// rustc rejects `&&` or `||` at the top of a let-else initializer
// (InvalidExpressionInLetElse).
fn f() {
    let true = a && b else { return };
}
fn  g( ) {}
