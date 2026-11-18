# frozen_string_literal: true

a = 'Hello' + <<~TEXT # rubocop:disable Style/StringConcatenation
  world
TEXT
b = (<<~TEXT) + 'x' # rubocop:disable Style/StringConcatenation
  world
TEXT
c = 'foo' + <<~STR.strip + 'bar' # rubocop:disable Style/StringConcatenation
  text
STR
d = 'foo' + bar # rubocop:disable Style/StringConcatenation
puts a, b, c, d
