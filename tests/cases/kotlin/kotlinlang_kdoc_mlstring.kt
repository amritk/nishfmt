class Outer {
  class Inner {
    /**
     * A KDoc paragraph long enough that it has to be reflowed to fit the line once it sits under two blocks of four spaces each.
     *
     * @param x the value, described at a length that also needs a second line when indented this far in.
     */
    fun f(x: Int) {
      val s = """
          first
            second
          """.trimIndent()
      val m = """
          |one
          |two
          """.trimMargin()
      if (x > 0) {
        val t = """
            a
            b""".trimIndent()
        println(s + m + t)
      }
    }
  }
}
