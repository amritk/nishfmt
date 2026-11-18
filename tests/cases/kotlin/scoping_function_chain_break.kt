fun test() {
  scope {
    val foo =
      runCatching { someFunction(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, cccccccc) }.getOrNull()
  }
}
