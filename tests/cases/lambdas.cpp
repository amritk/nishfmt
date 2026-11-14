void use() {
  std::sort(v.begin(), v.end(), [](const Item &a, const Item &b) { return a.key < b.key; });
  run([&]() {
    step_one();
    step_two();
  });
  auto add = [](int a, int b) { return a + b; };
}
