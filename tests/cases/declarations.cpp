BENCHMARK(BM_StressTest)->Range(2048, 1048576);
auto f(int x) -> int;
auto g() const noexcept -> decltype(x);
template <typename T> auto h(T t) -> std::enable_if_t<true, T>;
auto operator->() const -> pointer;
int k() { auto l = [](int x) -> int { return x; }; }
template <class T> A(T) -> A<T>;
struct S { auto m() -> int { return 1; } };
x = y->z;
class A : public QObject {
  Q_OBJECT
public:
  A();
private Q_SLOTS:
  void textChanged();
public slots:
  void f();
signals:
  void changed();
Q_SIGNALS:
  void other();
private:
  int x;
};
