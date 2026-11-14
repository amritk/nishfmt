// clang-format off
#include "b.h"
#include "a.h"  // IWYU pragma: export
#include "c.h" // c
class A {
  int  descriptor() {
    return GetDescriptor();
  }
  void f(){}
};
// clang-format on
class B {
  int descriptor() {
    return GetDescriptor();
  }
};
