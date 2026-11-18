// rustfmt 1.10.0 formats range patterns as range expressions (range.rs), so a
// bound ending in `.` keeps a space before the delimiter (rust-lang/rustfmt#6871).
fn main() {
    let x = 0.5;

    match x {
        1. .. => println!("{x} >= 1"),
        _ => println!("{x} < 1"),
    }
}

fn f() {
    match x {
        1. ..=2. => {}
        1. ..  => {}
        0.0..=1. => {}
        ..=1. => {}
        -1. ..=2. => {}
        1 ... 2 => {}
        A ..= B => {}
        [1. .., x] => {}
        _ => {}
    }
    match x {
        Self::AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA..=Self::BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB => {}
        _ => {}
    }
    match x {
        ..=Self::BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB => {}
        _ => {}
    }
}
