void expressions() {
  var sum = firstOperandWithLongName + secondOperandWithLongName * thirdOperandWithLongName - fourth;
  var cond = someCondition && anotherCondition || yetAnotherCondition && theLastConditionInTheChain;
  var pick = isItTrue ? valueWhenTrueWithAVeryLongName : valueWhenFalseThatIsAlsoQuiteLongToo;
  var nestedPick = a ? b : c ? d : e;
  final widget = Container(padding: EdgeInsets.all(8), child: Column(children: [Text('Hello'), Text('World')]));
  final list = [1, 2, 3, if (flag) 4 else 5, for (var i in items) i * 2, ...others, ...?maybe];
  final map = {'key': 'value', 'another': [1, 2, 3], if (x) 'x': x};
  final set = <int>{1, 2, 3};
  final result = items.where((item) => item.isValid).map((item) => item.value).toList();
  builder..add(1)..add(2)..build();
  object.method().another.property.yetAnotherMethodCall(argumentNumberOne, argumentNumberTwo);
  final s = 'Interpolation of $name and ${person.fullName.toUpperCase()} in a string';
  final long = 'This is a long string that has been split across '
      'multiple lines by the author on purpose.';
  final multi = '''
multi-line
  string ${value}
''';
  final f = (int a, int b) => a + b;
  final g = (String text) {
    print(text);
  };
  callback(() {
    doSomething();
  });
  test('description of the test', () async {
    expect(await compute(), equals(42));
  });
  x ??= y; z = -(-w); n = i++ + --j; b = !c; bits = a << 2 | b >> 1 & ~c;
  final casted = value as String; final ok = value is! int;
  final r = (1, 'two', named: 3.0); final (int a, String b, named: double c) = r;
  var t = const Duration(seconds: 1); var u = new Object();
  throw StateError('bad');
}
