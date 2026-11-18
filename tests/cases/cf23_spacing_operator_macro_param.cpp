struct S {
  friend ResultAwaiter<T2> operator co_await(Self&& self) { return 1; }
  template <typename A> A &operator OP(A& a, const B& b) { return a; }
};
