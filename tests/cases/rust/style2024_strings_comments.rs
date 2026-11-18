// Style edition 2024 for strings and comments: a string whose lines all end
// in `\` is kept as written whatever its width (expr.rs), a comment after the
// last line of a block stays on that line (visitor.rs close_block), a comment
// on the line of the code before it keeps the block's indent
// (missed_spans.rs), and a block's last expression is formatted as a
// sub-expression (stmt.rs).
fn f() {
    let s = "a string literal that is longer than the maximum width of one hundred and twenty columns, kept as is";
    let t = "first line \
             second line";
    call(a, b) // trailing comment
    // and a second line
}

fn g() {
    let x = 1; // first line of a comment
               // and its second line
    x
}

fn h() -> u32 {
    let y = 2;
    /* on the line */ let z = 3;
    if some_condition_holds { first_value_returned_here } else { second_value_returned }
}

fn ctrl_c() {
    match x {
        _ => {
            log::info!("Skipping installing `Ctrl+C` handler as one was already installed. Please call `gracefully_exit` yourself.");
        }
    }
}

fn last_expr(sort: Sort, ordering: Ordering) -> Ordering {
    if sort.reverse { ordering.reverse() } else { ordering }
}
