# frozen_string_literal: true

foo(obj.sort # rubocop:disable Style/RedundantSort
  .first, bar)
foo(obj.sort # rubocop:disable Style/RedundantSort
  .first)
