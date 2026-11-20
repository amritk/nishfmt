// After `as T` or `is T`, a `<` that does not begin type arguments is the
// less-than operator (flutter's perf_tests.dart).
f(Map data, x, y) {
  if (data['frame_count'] as int<5) {}
  return x is int<5||x as p.T<y||(x as List<int>)<=5;
}
g(x) => x as Function<5;
h(x, y) => x as List<int><=5||x is List<int><y||x as Map<K, V><y||x as List<List<int>><5;
