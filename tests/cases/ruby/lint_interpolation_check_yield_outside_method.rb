# frozen_string_literal: true

foo 'x#{yield}y' # rubocop:disable Lint/InterpolationCheck
def bar
  baz 'x#{yield}y' # rubocop:disable Lint/InterpolationCheck
end
