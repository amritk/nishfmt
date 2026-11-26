#include <a.h>/*c*/
#import <b.h>/*d*/
#define A( /*c*/ x) x
#define B(/*c*/) 1
#if defined( /*c*/ X) || (/*d*/ Y)
#pragma omp parallel for(/*c*/ x)
#endif
