// rustc rejects an `else` after a loop (recover_loop_else).
fn f() {
    let _ = for _ in 0..10 {} else { 1 };
}
fn  g( ) {}
