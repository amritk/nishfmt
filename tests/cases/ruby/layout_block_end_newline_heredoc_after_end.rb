test {
  foo(<<~EOS).
    Heredoc text.
  EOS
  bar }
x = test {
  foo(<<~EOS) } + bar
    Heredoc text.
  EOS
x = test {
  foo(<<~EOS) } + bar # comment
    Heredoc text.
  EOS
test {
  do_something {
    foo(<<~EOS) } }
      Heredoc text.
    EOS
