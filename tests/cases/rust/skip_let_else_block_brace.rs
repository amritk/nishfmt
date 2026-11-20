// rustc rejects a let-else initializer ending in `}` (InvalidCurlyInLetElse).
fn f() {
    let Some(_) = {Some(1)} else { panic!() };
}
fn  g( ) {}
