String describe(Object? value) {
  switch (value) {
    case null: return 'null';
    case int x when x > 0: return 'positive';
    case [var first, ...]: return 'list starting with $first';
    case {'kind': String kind}: return kind;
    case Point(:var x, y: 0): return 'on axis $x';
    case (int a, String b) || (String b, int a): return '$a$b';
    default:
  }
  final label = switch (value) { int() => 'int', String s when s.isNotEmpty => s, _ => 'other' };
  if (value case [int a, int b] when a > b) { return 'desc'; } else if (value is String) { return value; } else { return label; }
}

Future<void> loops(List<int> items) async {
  for (var i = 0; i < items.length; i++) { if (items[i] == 0) continue; }
  for (final item in items) print(item);
  await for (final event in stream) { handle(event); }
  outer: while (true) { do { break outer; } while (false); }
  try { risky(); } on FormatException catch (e, stack) { log(e, stack); } catch (_) { rethrow; } finally { cleanup(); }
  assert(items.isNotEmpty, 'items must not be empty');
  var (a, b) = (1, 2); (a, b) = (b, a);
  int local(int x) => x * 2;
  yieldStuff();
}

Iterable<int> gen() sync* { yield 1; yield* other(); }
