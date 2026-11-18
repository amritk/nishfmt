void f() {
  CHECK(!x) << "must be called "
            << "at most once";
  LOG(INFO) << "joined " << "here";
  std::cout << "line\n"
            << "kept\n" << "too";
  out << "a\n" << "b";
}
