// At style edition 2024 a comment group after a block's last line starts on
// that line, and the rest of the group is rewritten from the next line with
// its leading whitespace (visitor.rs close_block): rustfmt leaves a line of
// spaces before `/* a block` and then rejects its own output.
fn f() {
    call(a, b) // trailing comment
    /* a block
    comment */ }
