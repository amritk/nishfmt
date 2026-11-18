// Style edition 2024 in types (types.rs, items.rs): a parenthesized type that
// does not fit goes on its own lines, `impl Trait` bounds are not indented a
// level, one bound with a multi-item generic list is retried on new lines,
// and a return type is laid out from after `-> `.
type A = Box<(dyn FnOnce(FirstArgumentType, SecondArgumentType, ThirdArgumentType) -> ReturnTypeName + Send + 'static)>;

fn f() -> impl Iterator<Item = SomeVeryLongTypeName> + DoubleEndedIterator + ExactSizeIterator + FusedIterator + Send {}

fn g(x: impl SomeTrait<FirstTypeParameter, SecondTypeParameter, ThirdTypeParameter, FourthTypeParam>) {}

fn h<T: SomeTrait<FirstTypeParameter, SecondTypeParameter, ThirdTypeParameter, FourthTypeParam, More>>() {}

fn i() -> Result<HashMap<SomeLongKeyTypeName, Vec<SomeLongValueTypeName>>, Box<dyn std::error::Error>> {}

fn function_with_a_long_name(first_argument: FirstType, second: SecondType) -> Result<SomeLongTypeName, Err> {}

fn j() {
    let k = |first_argument_name, second_argument| -> Result<SomeVeryLongTypeName<WithParams>, AnotherType> { x };
}
