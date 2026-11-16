class A {
public:

    A()
        : n(0)
#if X
          , m(1)
#endif
    {
        g();
    }
private:
    int n;
};
class C {
  int x;
  C() : x(0)
#ifdef Y
  , y(0)
#endif
  {}
public:
  int y;
};
