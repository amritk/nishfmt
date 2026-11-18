void f() {
  if (x)
    while (y) {
      a();
      // c
#if X
      b();
#endif
    }
  if (y)
    for (;;)
      // d
#if B
      q();
#endif
  if (x)
    [] {
      a();
      // e
#if X
      b();
#endif
    }();
}
void g() {
  if (x)
    // c
#if A
    foo();
#else
    bar();
#endif
  if (y)
    for (;;)
      baz();
      // d
#if B
  q();
#endif
  while (z)
    if (w) r();
    // e
#define K 1
  s();
}
