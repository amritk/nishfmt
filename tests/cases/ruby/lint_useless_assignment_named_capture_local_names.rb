# frozen_string_literal: true

def m1(s)
  /(?<Foo>\d)/ =~ s
  nil
end

def m2(s)
  /(?<if>\d)/ =~ s
  nil
end

def m3(s)
  /(?<é>\d)/ =~ s
  nil
end

def m4(s)
  /(?<foo>\d)(?<Bar>x)/ =~ s
  nil
end

def m5(s)
  /(?<_x>\d)(?<self>x)/ =~ s
  nil
end
