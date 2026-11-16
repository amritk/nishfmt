// Behaviors of the rustfmt 1.9.0 binary that later rustfmt sources changed.
impl const Bar for () {}
impl const S {}

impl Bar {
    pub type Iter<'a> = impl Iterator<Item = u8> + 'a;
}

type A = fn(a: u8, #[cfg(x)] b: u16, #[cfg(y)] i32);
type FnNo = for<#[cfg_attr(FALSE, unknown)] 'a> fn();

pub const SORT<T:Copy+'static>:  &[T]= const { 4};

macro_rules! /* c */ foo {
    () => {};
}

fn f() {
    let a = (#[allow(arithmetic_overflow)]
        (1u8 + 255u8));
    m!(log<>, Vec::<>::new());
    || 1.. .method();
    while x {
        #![allow(clippy::indexing_slicing)]
        y();
    }
    let y = X { a: 1_000, b: 1_000, .. };
}

/*
* A comment whose stars start the line.
*/
fn g() {}
