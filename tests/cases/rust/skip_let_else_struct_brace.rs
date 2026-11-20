// rustc rejects a let-else initializer ending in `}` (InvalidCurlyInLetElse).
fn f() {
    let S { x } = S { x: 1 } else { panic!() };
}
fn  g( ) {}
