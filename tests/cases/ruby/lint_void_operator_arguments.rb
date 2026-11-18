# frozen_string_literal: true

def m1
  a.+(b, c)
  a.==(key: value)
  a.+(**options)
  a.+(b,)
  a.+(*args)
  a.+(&block)
  a.+({ key: value })
  a.+(b)
  a.-@
  a.+
  -a
  nil
end

def m2(...)
  a.+(...)
  nil
end

def m3(*)
  a.+(*)
  nil
end

def m4
  "#{foo}"
  [1, "#{bar}"]
  :"a#{b}"
  [1, (2)]
  { a: (1) }
  1..(2)
  "x"
  nil
end
