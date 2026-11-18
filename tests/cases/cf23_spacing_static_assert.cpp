static_assert(overload(&H::w)(H(), 1) == 5);
static_assert(f(a * b));
static_assert(a * b == c);
static_assert(x, f(a * b));
static_assert(N<int> - 1);
static_assert(A<B> c, "x");
static_assert(std::is_same<int, T>::value, "x");
void g() { static_assert(f(a * b)); }
