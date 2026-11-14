int compute(int a, int b, int c) {
  int result = a > b ? (a > c ? a : c) : (b > c ? b : c);
  if (first_condition_that_is_long && second_condition_that_is_long || third_condition_value_here && fourth_one) {
    result += 1;
  }
  std::string message = "a string literal that is long enough " + std::to_string(result) + " and continues past the limit";
  try { risky(); } catch (const std::exception& e) { handle(e); }
  return result;
}
