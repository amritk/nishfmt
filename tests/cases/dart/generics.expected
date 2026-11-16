typedef Json = Map<String, List<Map<String, Object?>>>;
typedef Nested<T> = List<List<List<T>>>;
final Map<String, List<int>> table = <String, List<int>>{};
List<Future<Map<int, String>>> futures = [];
int shifts(int a, int b) {
  var x = a >> b;
  var y = a >>> 2;
  x >>= 1;
  y >>>= 1;
  final ok = a < b && b >> 1 > 0;
  final cmp = a < b || x >= y;
  final both = foo<int, List<int>>(a) + (a >> 2);
  print(a < b, x < y >> 2);
  if (x is Map<String, List<int>>) print(x);
  return (x as List<List<int>>).length + y;
}
