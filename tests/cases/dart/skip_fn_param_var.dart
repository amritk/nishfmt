// @dart=3.12
// `final` or `var` on a function-typed parameter is an error outside a
// primary constructor (the analyzer's functionTypedParameterVar).
void f(final void Function(int a)) {}
void g(var  h(int a)) {}
