// rustc rejects a let-else initializer ending in `}` (InvalidCurlyInLetElse).
fn f() {
    let Some(_) = match x { _ => Some(1) } else { panic!() };
}
fn  g( ) {}
