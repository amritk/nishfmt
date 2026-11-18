class TryResourceComment {
  void f() {
    try (
// res comment
    R r = open(); S s = open()) {}
  }
}
