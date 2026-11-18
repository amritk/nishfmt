// Style edition 2024 in items (items.rs): an enum variant's attributes get the
// full width (#5801), impl generics are not measured as a block, a fn with no
// params and an overlong signature keeps the `)` on the first line and the
// return type below it, and blank lines between where predicates go.
enum E {
    #[some_attribute(with_arguments, that_fill_the_line, up_to_the_last_col, of_the_width_xx)]
    A,
}

impl<FirstTypeParameterName: SomeTrait, SecondTypeParameterName: AnotherTrait, Third: More> Foo for Bar {}

fn a_function_with_a_very_long_name_that_takes_no_parameters_at_all_and_returns_a_type() -> SomeReturnType {}

fn function_with_a_comment_in_params(first: u32 // the first
) -> u32 {}

fn f<T, U>()
where
    T: Clone,

    U: Copy,
{
}
