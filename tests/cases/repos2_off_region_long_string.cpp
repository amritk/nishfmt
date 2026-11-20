ADD_CASES(TC_ConsoleOut,
          {
              // keeping these lines long improves readability, so:
              // clang-format off
    {"^[-]+$", MR_Next},
      {"^BM_Counters_Tabular/repeats:2/threads:1 %console_report [ ]*%hrfloat [ ]*%hrfloat [ ]*%hrfloat [ ]*%hrfloat [ ]*%hrfloat [ ]*%hrfloat$", MR_Next},
            {"^BM_Counters_Tabular/repeats:2/threads:1_stddev %console_report [ ]*%hrfloat [ ]*%hrfloat [ ]*%hrfloat [ ]*%hrfloat [ ]*%hrfloat [ ]*%hrfloat$", MR_Next},
              // clang-format on
          });
int  main( ){return 0;}
