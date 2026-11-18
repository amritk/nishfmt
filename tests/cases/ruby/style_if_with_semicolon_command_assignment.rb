# frozen_string_literal: true

if cond; @x = foo a else @y ||= bar b end
if cond; @x += foo a else Y = @z = bar b end
if cond; obj.x = foo a else obj[k] = bar b end
if cond; @a = foo c rescue nil else @d = 1, 2 end
if cond; @a = super b else @b = x == y end
if cond; @a = list.map { |v| v } else @b = defined? c end
if cond; @a = list.each_slice 2 do |v| v end else @b = c.d e end
if cond; obj.x = 1 else obj.y = 2 end
