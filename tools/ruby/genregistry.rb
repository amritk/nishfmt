# Generate src/ruby/registry.ts: the enabled cops in RuboCop's registry order
# and each one's autocorrect_incompatible_with, read from the RuboCop that is
# loaded, with the default configuration and TargetRubyVersion 3.3. Biome
# then formats the file:
#
#     ruby tools/ruby/genregistry.rb > src/ruby/registry.ts
#     npx biome format --write src/ruby/registry.ts
require "rubocop"
require "tmpdir"

config = Dir.mktmpdir do |dir|
  path = File.join(dir, ".rubocop.yml")
  File.write(path, "AllCops:\n  TargetRubyVersion: 3.3\n")
  RuboCop::ConfigLoader.configuration_from_file(path)
end
enabled = RuboCop::Cop::Registry.global.enabled(config)
major, minor, patch = RuboCop::Version::STRING.split(".")

puts <<~TS
  // Cop facts the team needs: RuboCop's registry order (corrections merge in
  // it) and autocorrect_incompatible_with. Generated from RuboCop #{major}.#{minor}.#{patch}'s
  // registry with the default configuration by tools/ruby/genregistry.rb.

  /** Every enabled cop, in registry order (for rubocop:disable all and departments). */
  export const RB_COP_NAMES: string =
    "#{enabled.map(&:cop_name).join(",")}";

  /** Whether two cops' corrections are never merged in one pass. */
  export const rbIncompatible = (a: string, b: string): boolean => rbIncompatibleWith(a, b) || rbIncompatibleWith(b, a);

  const rbIncompatibleWith = (a: string, b: string): boolean => {
TS
enabled.each do |cop|
  others = cop.autocorrect_incompatible_with.map(&:cop_name)
  next if others.empty?

  puts "  if (a === \"#{cop.cop_name}\") {"
  puts "    return #{others.map { |o| "b === \"#{o}\"" }.join(" || ")};"
  puts "  }"
end
puts "  return false;"
puts "};"
