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

The parser (`src/ruby/parser.ts`) is racc's driver over the tables, with the
grammar's reduce actions translated from the generated ruby33.rb:

    python3 genparser.py $G/ruby33.rb ../../src/ruby/parser.ts

`src/ruby/registry.ts` (the enabled cops in registry order and each one's
`autocorrect_incompatible_with`) and `coporder.txt` (the order `genteam.py`
reads) are read from the RuboCop that is loaded:

    ruby genregistry.rb > ../../src/ruby/registry.ts
    npx biome format --write ../../src/ruby/registry.ts

`src/ruby/builder.ts` (Builders::Default with RuboCop's flags) and
`src/ruby/ast.ts` are hand-written. RuboCop parses TargetRubyVersion 3.3
through Prism's parser-gem translation, so where Prism builds a different
tree the port follows Prism (see the overrides in `genparser.py`).

`rl2ts.py` translates the Ruby of the Ragel actions, `post.py` the idioms it
leaves, and `assemble.py` splices both machines into `lexer_tmpl.ts`.
`astdump.rb` and `toklog.rb` print RuboCop's AST and the parser's tokens, the
references the Ruby front end is compared against.

## Upgrading RuboCop

The upgrade to 1.92.3 (rubocop-ast 1.52.0, regexp_parser 2.13.4,
racc 1.8.1; parser 3.3.13.0 and prism 2.1.0 unchanged) was found by testing
rather than by reading alone:

- Install each stack in its own `GEM_HOME`. `gem install rubocop -v X`
  also pulls the newest rubocop-ast, regexp_parser and racc, and Ruby loads
  the newest; uninstall them and check `rubocop -V`.
- Cut the code blocks the release adds to RuboCop's specs
  (`git diff -U0 vA vB -- spec/rubocop/cop spec/rubocop/cli`, each
  `<<~RUBY` block made only of added lines, with the `^^^` annotation lines
  removed) into one file each, and run both RuboCop versions and nishfmt on
  them with the corpus config. A file the two versions format differently
  and nishfmt does not match is a change to port; the cop it comes from is
  the one whose 1.92.3 code decides the difference. Default config means all
  default cops run on every block, so a spec of a disabled cop can still
  show a change in an enabled one.
- Regenerate `src/ruby/registry.ts` with `genregistry.rb`: a release often
  adds `autocorrect_incompatible_with` pairs, and some changelog fixes are
  nothing else.
- `genexceptions.rb` and `nil.methods` depend on what the RuboCop process
  loads; compare them between the two versions in one environment before
  regenerating, since the committed tables come from another one.
