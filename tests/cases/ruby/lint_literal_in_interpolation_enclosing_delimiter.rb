# frozen_string_literal: true

puts %r{foo#{'{'}bar}
puts %(foo#{')'}bar)
puts `foo#{'`'}bar`
puts %W[foo#{']'}bar]
puts %/foo#{'/'}bar/
puts %Q"foo#{'"'}bar"
