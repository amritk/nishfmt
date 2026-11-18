class Registry {
  companion {
    val instances = mutableListOf<Registry>()
      fun register(r: Registry) { instances.add(r) }
  }

  val name = "registry"
}
