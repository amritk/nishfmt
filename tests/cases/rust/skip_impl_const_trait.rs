// rustc 1.99 rejects a trait impl whose trait is not a path: `impl const Tr`
// is the bare trait object `const Tr`, so rustfmt fails and nishfmt leaves
// the file as it is, comments and all.
impl   const /* c */ Tr for   T {}
