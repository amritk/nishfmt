// rustc rejects an `else` after a loop (recover_loop_else).
fn f() {
    let _ = while true {} else { 1 };
}
fn  g( ) {}
