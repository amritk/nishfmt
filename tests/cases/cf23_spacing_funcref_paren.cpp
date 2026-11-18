void f() {
  static_assert(C<int[10], int(&)[10]>::value);
  const float(&cm)[16] = x;
  const int(*offsets)[2] = a;
  g(sizeof(int(&)[3]), x);
  using F = void(C::*)(int);
}
