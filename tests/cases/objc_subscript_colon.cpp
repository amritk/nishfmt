void f() {
  x[a.b : c];
  x[a : b] = 1;
  g(x[a : b], 2);
  x[a ? b : c];
  int v[] = {[1 : 2] = 3};
}
