class ForInitComment {
  void f() {
    for (int i = 0, // first
            j = 1; i < j; i++) {}
    for (/* init */ int i = 0; i < 1; i++) {}
  }
}
