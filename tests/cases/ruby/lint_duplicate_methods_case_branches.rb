# frozen_string_literal: true

class A
  case RUBY_VERSION
  when '3'
    def foo; end
  else
    def foo; end # rubocop:disable Lint/DuplicateMethods
  end
end
