class HeaderNoHug {
  void f() {
    for (String s : computeTheListOfThings(arguments, moreArguments).filter(x -> { return x.isEmpty(); })) {}
    try (Resource r = open(() -> { return makeTheResourceWithAVeryLongNameThatWillNotFitOnOneLine(); })) {}
    synchronized (lockFor(key, k -> { return new Object() { int padding = 1111111111; }; })) {}
  }
}
