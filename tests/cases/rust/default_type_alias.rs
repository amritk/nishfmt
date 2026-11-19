// rustfmt 1.10.0 prints `default` on an impl's associated type only, and lays the
// type out before adding it (so the first line may pass max_width); an item, a trait
// item and a foreign item lose it (rewrite_type_alias).
impl<T> Trait for Wrapper<T> {
    default type Output = SomeLongTypeName<AnotherQuiteLongTypeName, YetAnotherVeryLongTypeName, FinalTypeNameHereXYZabcd>;
}
trait Tr {
    default   type  T = Bar;
    default type U<A>: Clone where A: Copy;
}
default type Free = u8;
extern "C" {
    default type Foreign;
}
