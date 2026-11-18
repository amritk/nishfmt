# frozen_string_literal: true

def foo; def bar = baz qux; end
def a; yield b; end
x = [def c; yield d; end]
y = (def e; super f; end)
z = def g; yield h; end
foo(def i; yield j; end)
if k
  def l; yield m; end
end
def q; def r; 3; end; end
def s; [def t; end]; end
puts x, y, z
