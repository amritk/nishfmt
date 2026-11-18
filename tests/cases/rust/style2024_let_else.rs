// Style edition 2024 measures a let-else from `let`, leaving out the
// attributes and comments before it (items.rs, #5901): with them the short
// else block below would not fit on the line.
fn f() {
    #[cfg(feature = "some_feature_name")]
    let Some(v) = opt else { return };
    /* a comment before the let statement */ let Some(x) = y else { return };
    #[allow(unused)] #[allow(dead_code)] let Ok(v) = res else { return };
    let Some(value) = compute_the_value_from_somewhere(first_argument) else { return };
}
