# frozen_string_literal: true

[def foo; yield baz; end]
puts(!def qux; super baz; end)
@x = def quux; yield baz; end
class Foo
  def grault; super baz; end
end
def outer; def inner = bar baz; end
