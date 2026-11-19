// rustc rejects a const block in a pattern, a range end included (parse_pat_range_end).
fn f() {
    match x {
        0..const { 5 } => {}
        _ => {}
    }
}
fn  g( ) {}
