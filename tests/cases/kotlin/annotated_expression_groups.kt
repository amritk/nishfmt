fun foo() {
  @[A B] @C println("Hello, world!")

  @C @[Suppress("DEPRECATION") OptIn(ExperimentalContextReceivers::class)] println("Hello, world!")
}
