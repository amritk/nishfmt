// A raw string delimiter of 17 bytes is not one: clang lexes an unknown token.
int   a=1;
const char*s=R"0123456789abcdefg(x)0123456789abcdefg";
int   b=2;
