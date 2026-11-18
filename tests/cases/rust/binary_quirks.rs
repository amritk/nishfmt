// Behaviors of rustfmt 1.10.0 that look like bugs, kept by the port.

impl Bar {
    pub type Iter<'a> = impl Iterator<Item = u8> + 'a;
}

type FnNo = for<#[cfg_attr(FALSE, unknown)] 'a> fn();

pub const SORT<T:Copy+'static>:  &[T]= const { 4};

fn f() {
    let a = (#[allow(arithmetic_overflow)]
        (1u8 + 255u8));
    m!(log<>, Vec::<>::new());
    || 1.. .method();
    while x {
        #![allow(clippy::indexing_slicing)]
        y();
    }
    let y = X { a: 1_000, b: 1_000, c: 1_000, .. };
}

/*
* A comment whose stars start the line.
*/
fn g() {}
