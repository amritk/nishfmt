// parse_pat_fields looks for `..` before a field's attributes, so after them `..`
// is taken for a field name.
fn f() {
    let S { #[cfg(any())] .. } = ();
}
fn  g( ) {}
