// Style edition 2024 in match expressions (matches.rs): inner attributes are
// written at the arms' indent, the comment after `=>` is found by the last
// uncommented `=>`, and a `return`/`break`/`continue` body that is wrapped in
// a block gets its semicolon.
fn f(x: u32) -> u32 {
    match x {
        #![allow(unused_attributes, clippy::some_very_long_lint_name_here, clippy::another_long_lint_name)]
        0 => 1,
        _ => 2,
    }
}

fn g(x: u32) {
    loop {
        match x {
            1 => /* goes => there */ 3,
            2 if matches!(x, 2 => 3) => // after the arrow
                4,
            _ => return some_function_with_a_long_name(first_argument_here, second_argument, third_arg_long),
        };
        match x {
            _ => break some_function_with_a_long_name(first_argument_here, second_argument, third_argument_long),
        }
    }
}
