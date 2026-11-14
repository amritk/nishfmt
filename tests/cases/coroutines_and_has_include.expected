#if __has_include(<sys/mman.h>)
#include <sys/mman.h>
#elif __has_include(<arm/cpu_capabilities_public.h>) && defined(X)
#endif
#if defined(__has_include)
#endif
Task<int> f() {
  co_yield []() -> Task<void> { co_return; }();
  co_await (x);
  co_return *p;
  auto r = co_await g();
}
void f() {
  auto g = [&]() -> folly::coro::Generator<folly::coro::Task<void> &&> { co_yield x; };
  static_cast<const Bitfield &&>(b);
  foo<int &&>();
  bar<A, B &&>(x);
}
