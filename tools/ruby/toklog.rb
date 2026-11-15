# Prints the tokens Parser::Ruby33 reads while parsing a file: racc token id,
# range (code point offsets) and value.
require 'parser/ruby33'
class LoggingParser < Parser::Ruby33
  def next_token
    t = super
    type, (value, range) = t
    id = type ? self.class::Racc_arg[10][type] : 0
    if range
      $out << "#{id} #{range.begin_pos}-#{range.end_pos} #{value}\n"
    else
      $out << "0 #{value}\n"
    end
    t
  end
end
$out = +''
src = File.read(ARGV[0], mode: 'rb').force_encoding('UTF-8')
buf = Parser::Source::Buffer.new(ARGV[0], source: src)
p = LoggingParser.new
p.diagnostics.all_errors_are_fatal = false
p.diagnostics.ignore_warnings = true
begin
  p.parse(buf)
rescue => e
  $out << "ERROR #{e.class}\n"
end
print $out
