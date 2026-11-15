# Dumps the AST RuboCop sees for each file: one node per line, indented by
# depth, "type" then each source-map range as key=begin-end (character
# offsets), then non-node children (inspected).
require 'rubocop'

def dump(node, depth, out)
  out << ' ' * depth << node.type.to_s
  loc = node.location
  if loc
    keys = [:expression] + (loc.instance_variables.map { |v| v.to_s.delete("@").to_sym } - [:expression, :node]).sort
    keys.each do |k|
      next unless loc.respond_to?(k)
      r = loc.public_send(k)
      next unless r.is_a?(Parser::Source::Range)
      out << " #{k}=#{r.begin_pos}-#{r.end_pos}"
    end
  end
  node.children.each do |c|
    out << ' ' << c.inspect unless c.is_a?(Parser::AST::Node)
  end
  out << "\n"
  node.children.each { |c| dump(c, depth + 1, out) if c.is_a?(Parser::AST::Node) }
end

def dump_file(path)
  src = File.read(path, mode: 'rb').force_encoding('UTF-8')
  ps = RuboCop::AST::ProcessedSource.new(src, 3.3, path)
  out = +''
  if !ps.valid_syntax?
    out << "ERROR\n"
  elsif ps.ast
    dump(ps.ast, 0, out)
  else
    out << "EMPTY\n"
  end
  ps.comments.each { |c| out << "comment #{c.location.expression.begin_pos}-#{c.location.expression.end_pos}\n" }
  out
end

if ARGV[0] == '-batch'
  File.readlines(ARGV[1], chomp: true).each do |p|
    o = File.join(ARGV[2], p + '.ast')
    FileUtils.mkdir_p(File.dirname(o))
    File.write(o, (dump_file(p) rescue "CRASH #{$!.class}\n"))
  end
else
  print dump_file(ARGV[0])
end
