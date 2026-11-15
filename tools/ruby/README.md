# Ruby parser generators

`src/ruby/tables.ts` and `src/ruby/lexer.ts` are generated from the parser gem
3.3.13.0 (MIT License), whose lexer and parser are themselves generated (Ragel
and racc). To regenerate:

    python3 gentables.py ../../src/ruby/tables.ts
    G=<parser gem>/lib/parser
    # The lexers' `advance` methods, cut from the generated sources:
    sed -n '/^  def advance$/,/^  def version?/p' $G/lexer-F1.rb > advance.rb
    sed -n '/^  def advance(p)$/,/^  def read_character_constant/p' $G/lexer-strings.rb > sadvance.rb
    python3 post.py advance.rb 'switch (_lex_trans_actions[_trans]) {' > main_actions.ts
    python3 post.py sadvance.rb 'switch (_lex_actions[_acts - 1]) {' > str_actions.ts
    python3 assemble.py

`rl2ts.py` translates the Ruby of the Ragel actions, `post.py` the idioms it
leaves, and `assemble.py` splices both machines into `lexer_tmpl.ts`.
`astdump.rb` and `toklog.rb` print RuboCop's AST and the parser's tokens, the
references the Ruby front end is compared against.
