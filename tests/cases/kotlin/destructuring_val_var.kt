fun f(d: Data, pairs: List<Pair<Int, Int>>) {
  (val first, var second) = d
  @Suppress("UNUSED_VARIABLE") val (a, b) = d
  @A @B val (c) = d
  for ((val x, val y) in pairs) println(x + y)
}
