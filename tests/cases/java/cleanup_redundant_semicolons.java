package p;

import java.util.List;;

class CleanupRedundantSemicolons {
  List<String> list;;
  ;
  void f() {
    ; ;
    int a = 1;;
    switch (a) {
      case 1: ;
        break;
      default:
    }
    class Local {};
    for (;;) ;
  }
};
enum E { A, B; ; }
