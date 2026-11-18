# frozen_string_literal: true

a = <<-'sql"x'
  foo
sql"x
b = <<-'SQL"x'
  foo
  SQL"x
puts a, b
