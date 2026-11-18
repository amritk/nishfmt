// rustc 1.99 parses `impl const S` as an impl of the type `const S`, which
// rustfmt 1.10.0 keeps as written; nishfmt leaves the file untouched.
impl const S {}
