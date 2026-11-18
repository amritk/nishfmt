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

fn with_retry_and_progress(
    cb: &(dyn Fn(&std::path::Path, &AtomicBool, &mut gix::progress::tree::Item, &mut dyn FnMut(&gix::bstr::BStr)) -> Result<(), crate::sources::git::fetch::Error> + Send + Sync),
) {}

impl Source {
    pub fn with_watcher(mut self, watcher: impl FnMut(async_channel::Sender<AssetSourceEvent>) -> Option<Box<dyn AssetWatcher>> + Send + Sync + 'static) -> Self {}
}

impl<T, U> Expression for Like<T, U>
where
    crate::sql_types::is_nullable::IsSqlTypeNullable<<T as crate::expression::Expression>::SqlType>: crate::sql_types::OneIsNullable<crate::sql_types::is_nullable::IsSqlTypeNullable<<U as crate::expression::Expression>::SqlType>>,
{
}

fn function_with_a_long_name(argument_one: u32, argument_two: u32, three: u64) -> (FirstLongTypeName, SecondLongTypeName, Third) {}

fn h() -> Result<SomeTypeWithAVeryLongName<AndGenericParameters, MoreParameters>, AnotherError<WithParam, MoreParams, X>> {}
