#define M1(b) (assert((b)->m & R), 1)
#define M2(b) (f((b)->m & R), 1)
#define M3(b) (assert(b->m & R), 1)
#define M4(b) assert((b)->m & R)
void g() { (assert((b)->m & R), 1); }
void h() { assert((b)->m & R); }
void k() { foo((b)->m & R); }
