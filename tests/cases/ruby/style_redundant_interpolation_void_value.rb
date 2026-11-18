# frozen_string_literal: true

def m
  puts "#{42 => var; x}" # rubocop:disable Style/RedundantInterpolation
  puts "#{return; foo}" # rubocop:disable Style/RedundantInterpolation
  puts "#{return if foo}" # rubocop:disable Style/RedundantInterpolation
  puts "#{foo ? return : return}" # rubocop:disable Style/RedundantInterpolation
  puts "#{begin
    return foo
  rescue
    bar
  end}" # rubocop:disable Style/RedundantInterpolation
  puts "#{begin
    return foo
  rescue
    return bar
  end}" # rubocop:disable Style/RedundantInterpolation
  puts "#{begin
    foo
  ensure
    return bar
  end}" # rubocop:disable Style/RedundantInterpolation
  puts "#{begin
    return foo
  rescue
    bar
  else
    return baz
  end}" # rubocop:disable Style/RedundantInterpolation
end
