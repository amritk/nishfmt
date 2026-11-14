#pragma warning(disable:4800)
#pragma   omp parallel for  schedule(static,1)
#line   300   "x.y"
#pragma GCC diagnostic ignored "-Wfoo"
#pragma once
#undef   FOO
#pragma comment(lib,"x.lib")
#ifdef  X
#endif   // X
#pragma pack(push,1)
namespace {
class ClassUniqueToAlwaysTrue {};
}
namespace a {
int x;
}
namespace b {
void f() {}
}
namespace c {
auto l = [] {
  return 1;
};
}
void f() {
  __try { return (object->*method)(); }
  __except(GTestShouldProcessSEH(GetExceptionCode())) {
    return 0;
  }
  __try {
    x();
  } __finally {
    y();
  }
}
