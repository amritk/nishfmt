def func
  if condition
    foo
  else
    raise(<<~MESSAGE)
      text
    MESSAGE
  end; bar
end

def func
  if condition
    foo
  else
    raise(<<~MESSAGE)
      text
    MESSAGE
  end if other_condition
end
