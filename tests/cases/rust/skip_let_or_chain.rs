// A `let` under `||` is an error (CondChecker, OrInLetChain).
fn f() {
    if let Some(x) = y || z {}
}
fn  g( ) {}
