void f() {
  if (T * p{q}; p) {
    g(p);
  }
  if (a * b; c) {
    g(b);
  }
  if (T & r{q}; r) {
    g(r);
  }
  if constexpr (T * p{q}; p) {
    g(p);
  }
  if (x * y > 0) {
    g(x);
  }
}
