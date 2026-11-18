// nishfmt formats Rust at max_width 120, with the widths rustfmt derives from
// it (use_small_heuristics = "Default", scaled by 1.2): fn_call_width 72,
// attr_fn_like_width 84, struct_lit_width 22, struct_variant_width 42,
// array_width 72, chain_width 72, single_line_if_else_max_width 60 and
// single_line_let_else_max_width 60. comment_width stays 80.
fn f() {
    let a_variable_with_a_long_name = some_function_name(first_argument, second_argument, third_argument_x);
    let call = function(argument_number_one, argument_number_two, argument_number_three, arg_four);
    let call = function(argument_number_one, argument_number_two, argument_number_three, arg_fourxy);
    let s = Struct { field_one: 1, f2: 2 };
    let s = Struct { field_one: 1, f2: 22 };
    let a = [element_number_one, element_number_two, element_number_three, element_numb_4];
    let a = [element_number_one, element_number_two, element_number_three, element_numbe_4];
    let c = receiver.first_method().second_method().third_method().fourth_method(xx);
    let c = receiver.first_method().second_method().third_method().fourth_method(xxx);
    let v = if condition_value { first_value_here } else { second_value_x };
    let v = if condition_value { first_value_here } else { second_value_xy };
    let Some(value) = some_function_call(arguments_here) else { return };
    let Some(value) = some_function_call(arguments_here_x) else { return };
}

#[some_attribute(first_argument_name, second_argument_name, third_argument_name, fourth_arg)]
#[some_attribute(first_argument_name, second_argument_name, third_argument_name, fourth_argu)]
enum E {
    Variant { field_number_one: u32, field_two: u32 },
    Variant2 { field_number_one: u32, field_two: u32, x: u8 },
}

// A comment line that is longer than eighty columns is kept as written, since wrap_comments is off.
fn g() {}
