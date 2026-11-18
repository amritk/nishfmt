void f() {
        static const char* const choices[] = // NOLINT(cppcoreguidelines-avoid-c-arrays,hicpp-avoid-c-arrays,modernize-avoid-c-arrays)
        {
            "a", "b",
        };
  const char* const borderMap[] = { "BORDER_CONSTANT", "BORDER_REPLICATE", "BORDER_REFLECT", "BORDER_WRAP", "BORDER_REFLECT_101" }, * const btype = borderMap[borderType & ~BORDER_ISOLATED];
}
