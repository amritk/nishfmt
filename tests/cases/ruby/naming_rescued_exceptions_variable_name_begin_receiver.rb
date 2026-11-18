# frozen_string_literal: true

begin
  something
rescue StandardError => e1
end::Foo = e1

begin
  something
rescue StandardError => e1
end.foo
bar(e1)

begin
  something
rescue StandardError => e1
end.foo { e1 }
