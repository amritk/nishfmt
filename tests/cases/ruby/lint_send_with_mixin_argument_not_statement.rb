# frozen_string_literal: true

[Foo.send(:extend, Bar)]
baz(Foo.send(:include, Bar, Qux), 1)
x = cond ? Foo.send(:include, Bar) : nil
Foo.send(:include, Bar).tap {}
bar if Foo.send(:include, Bar)
private def e = Foo.send(:prepend, Bar)

class Foo
  Foo.send(:include, Bar)
end
