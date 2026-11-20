// A `let` in parentheses is not part of a let chain (CondChecker).
fn f() {
    while 1 == 5 && (let None = None) {}
}
fn  g( ) {}
