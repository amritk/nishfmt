# frozen_string_literal: true

# rubocop:disable Style/BarePercentLiterals
puts %Q(\"hi\")
puts %Q("hi\")
puts %Q(\\"hi\\")
puts %Q(a\\\"b)
# rubocop:enable Style/BarePercentLiterals
