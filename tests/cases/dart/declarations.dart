library my.lib;
import 'package:flutter/material.dart';
import 'dart:async' ;
import 'src/thing.dart' as thing show Thing, OtherThing hide Hidden;
export 'src/a.dart';
part 'b.dart';

/// A documented class.
@immutable
abstract class Shape<T extends num> extends Base with Mixin implements Comparable<Shape>, Other {
  static const int sides = 0, corners = 1;
  final String name; late final double area;
  Shape(this.name, {required this.area, int? weight}) : assert(area >= 0), super(name.length);
  Shape.named(String name) : this(name, area: 0);
  factory Shape.circle(double r) = Circle;
  const Shape.unit() : name = 'unit', area = 1;
  double get perimeter => 0; set perimeter(double value) { _p = value; }
  bool operator ==(Object other) => other is Shape && other.name == name;
  @override int get hashCode => name.hashCode;
  T compute<R extends T>(R Function(T value, {int? index}) transform, [T? initial]) { return transform(initial!); }
  external void nativeThing();
}

sealed class Result {} final class Ok extends Result {} base mixin class Mx {}
mixin Mixin on Base { void mix() {} }
extension StringX on String { bool get isBlank => trim().isEmpty; }
extension type const Meters(double value) implements double { Meters operator +(Meters o) => Meters(value + o.value); }
enum Color { red, green, blue }
enum Planet implements Comparable<Planet> { mercury(mass: 3.3e23, radius: 2.4e6), venus(mass: 4.8e24, radius: 6.0e6);
  const Planet({required this.mass, required this.radius});
  final double mass; final double radius;
  int compareTo(Planet other) => mass.compareTo(other.mass);
}
typedef Callback = void Function(int value, String label);
typedef void OldStyle(int x);
class Alias = Base with Mixin;
int topLevel = 1; final List<Map<String, List<int>>> nested = <Map<String, List<int>>>[];
void main(List<String> args) async { await run(args); }
