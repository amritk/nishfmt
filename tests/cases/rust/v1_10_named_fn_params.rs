// rustc 1.99 parses the inputs of parenthesized generic args as params with
// an optional name (`Fn(a: u32)`, named_fn_trait_parameters, gated after
// parsing), and rustfmt formats them as params.
type A = Box<dyn Fn(a: u32,   b:T) -> u8>;
fn f(x: impl FnOnce(first_argument_name: FirstType, second_argument_name: SecondType, third: Third) -> R) {}
m!(field(material_bindings_index: MaterialBindingId, material_bindings_index, set_material_bindings_index, x));
