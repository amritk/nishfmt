{ key: if something
  work
else
  raise 'error'
end }
do_something(if something
  work
else
  raise 'error'
end)
foo ? bar : if something
  work
else
  raise 'error'
end
[if something
  work
else
  raise 'error'
end]
foo rescue if something
  work
else
  raise 'error'
end
condition && if something
  raise 'error'
else
  work
end
