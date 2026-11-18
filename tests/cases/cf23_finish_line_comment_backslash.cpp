int f() {
  if (a) //no information can be extracted if \
         //only one row or columns in present
    return 1;
  return 0;
}
//#define X(a) \
//inline f(a) {    \
//    E##xm1_t mask;
