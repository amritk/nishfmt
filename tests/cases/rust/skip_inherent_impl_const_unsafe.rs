// rustc rejects `unsafe` on an inherent impl (E0197), after `const` too.
const unsafe impl S {}
fn  f( ) {}
