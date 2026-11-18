// Style edition 2024 in macro calls and macro_rules! (overflow.rs, macros.rs):
// `trace!` is a special-case macro, a method chain as the last macro arg is
// kept on one line when it overflows, macro args are not forced onto one line
// inside a macro, and a block-bodied branch reserves " => {{".
fn f() {
    trace!("a format string that is long enough to need wrapping {} {}", first_argument_value, second_argument_value);
    debug!("a format string that is long enough to need wrapping {} {}", first_argument_value, second_argument_value);
    assert_eq!(value, some_object.with_a_method().and_another_one().and_yet_another_one().and_finally_the_last_one());
    foo(value, some_object.with_a_method().and_another_one().and_yet_another_one().and_finally_the_last_one());
}

mod tests {
    fn t() {
        assert!(RegexMatcherBuilder::new().line_terminator(Some(b'\n')).build(r"a\nz").is_err());
        assert_eq!(
            exact([
                "abefij", "abefkl", "abghij", "abghkl", "cdefij", "cdefkl",
                "cdghij", "cdghkl",
            ]),
            e(r"(ab|cd)(ef|gh)(ij|kl)")
        );
    }
}

macro_rules! m {
    () => {
        vec![aaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbb, cccccccccccccccccccccc, dddddddddddddddddddddd, eeeeeee]
    };
}

macro_rules! long_branch {
    ($aaaaaaaaaaaaaaaaaaaaaaaaaaaaa:expr, $bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:ident, $ccccccccccccccccc:tt) => {{
        $aaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    }};
}
