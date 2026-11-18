# frozen_string_literal: true

def m(a = begin
  foo bar
end, b: begin
  foo bar
end)
  a + b
end

do_something @var ||= begin
  foo bar
end

case x
when @var = begin
  foo bar
end
  1
end

@a = @b = begin
  foo bar
end

do_something(@x = @var = begin
  foo bar
end)

@memo ||= begin
  foo if bar &&
         baz
end

[
  begin
    foo
  end, 1
]

values = [
  begin
    foo # comment
  end, 2
]
puts values

if cond
  @c = begin
    foo bar
  end
end
