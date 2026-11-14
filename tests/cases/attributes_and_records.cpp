void f() {
  int x = 1 +

#if A
      2;
#else
      3;
#endif
}
template <typename P>
struct negation
    : std::integral_constant<bool, bool(!P::value)> {};
template <typename P1, typename... Ps>
struct conjunction<P1, Ps...> : std::conditional<bool(P1::value), conjunction<Ps...>, P1>::type {};
struct A : B<int>::type {};
struct C : D {};
struct A {
  [[deprecated("x")]]
  static void DoDelete(T &) {}
  [[nodiscard]] int f();
  [[maybe_unused]]
  int x = 1;
};
[[nodiscard]]
int g() { return 1; }
struct A {
  int f() const {
    return 1;
  } // NOLINT
  int g() const {
    return 1;
  }; // x
  int h() const {
    return 1;
  } /* c */
};
template <typename Action>
GTEST_INTERNAL_DEPRECATE_AND_INLINE("Avoid using DoAll() for single actions")
typename std::decay<Action>::type DoAll(Action &&action) {
  return std::forward<Action>(action);
}
