# frozen_string_literal: true

a = %W(a\ b tab\there#{x} q"#{y})
b = %I(a\ b tab\there#{x} q"#{y})
c = %I(a\ b#{x}"q c)
d = %W(#@foo bar a\ b)
e = %I(#@foo bar a\ b)
puts a, b, c, d, e
