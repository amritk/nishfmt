void f() {
#if A
  a();
#else
  b();
  // c
  #define X 1
#endif
}
