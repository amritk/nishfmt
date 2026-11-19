// A match guard is checked as an `if` condition is (CondChecker).
fn f() {
    match x {
        y if (let Some(z) = w) => {}
        _ => {}
    }
}
fn  g( ) {}
