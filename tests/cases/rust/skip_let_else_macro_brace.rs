// rustc rejects a let-else initializer ending in a braced macro call
// (InvalidCurlyInLetElse).
fn f() {
    let Some(_) = format_args! {""} else { panic!() };
}
fn  g( ) {}
