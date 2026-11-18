# frozen_string_literal: true

foo(require('a'), require('a')) # rubocop:disable Lint/DuplicateRequire
require 'b'
require 'b' # rubocop:disable Lint/DuplicateRequire
