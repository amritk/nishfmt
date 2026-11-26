#define M(x) \
  do { \
    x = 1; \
    /* a.			      */ \
    f("a	b", x); \
  } while (0)
