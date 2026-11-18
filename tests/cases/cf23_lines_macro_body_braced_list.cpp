#define ITT_MAGIC \
  { 0xED, 0xAB, 0xAB }
#define Z_ONCE_INIT \
  { ATOMIC_FLAG_INIT, 0 }
#define M(x) { x, 1 }
#define B { a(); }
#define E {}
#define L { x: }
#define N { {a} }
#define Y \
  { a, b } /* d */
#define X { 1, 2 } // c
