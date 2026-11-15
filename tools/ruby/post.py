# Post-processing for rl2ts output: the Ruby idioms of the actions.
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rl2ts import translate

RULES = [
    (r'!this\.static_env\.RB_NULL\? && ', ''),
    (r'this\.static_env\.declared\?\(', 'this.declared('),
    (r'this\.tok2\(([^()]*)\) == "([^"]*)"', r'this.tokIs(\1, "\2")'),
    (r'this\.lambda_stack\.last', 'this.lambdaLast()'),
    (r'this\.lambda_stack\.any\?', '(this.nLambda > 0)'),
    (r'/\*RB\*/ this\.lambda_stack\.pop;', 'this.nLambda = this.nLambda - 1;'),
    (r'/\*RB\*/ this\.lambda_stack\.push this\.paren_nest;', 'this.lambdaPush(this.paren_nest);'),
    (r'this\.(cond|cmdarg)\.active\?', r'this.\1.active()'),
    (r'this\.context\.(in_\w+)', r'this.ctx.\1'),
    (r'this\.strings\.push_literal\(', 'this.strings.pushLiteral('),
    (r'this\.strings\.close_interp_on_current_literal\(', 'this.strings.closeInterp('),
    (r'this\.strings\.herebody_s', 'this.strings.herebody_s'),
    (r'this\.token_queue\.empty\?', '(this.qHead === this.qTail)'),
    (r'this\.token_queue\.any\?', '(this.qHead !== this.qTail)'),
    (r'/\*RB\*/ this\.emit4\(TK_tINTEGER, digits\.to_i\(this\.num_base\), this\.ts, this\.num_suffix_s\);', 'this.emit4(TK_tINTEGER, this.intValue(digits, this.num_base), this.ts, this.num_suffix_s);'),
    (r'/\*RB\*/ p = this\.num_xfrm\.call\(digits\.to_i\(this\.num_base\), p\);', 'p = this.numXfrm(this.intValue(digits, this.num_base), p);'),
    (r'/\*RB\*/ this\.emit4\(TK_tFLOAT, Float\(digits\), this\.ts, this\.num_suffix_s\);', 'this.emit4(TK_tFLOAT, digits, this.ts, this.num_suffix_s);'),
    (r'/\*RB\*/ p = this\.num_xfrm\.call\(digits, p\);', 'p = this.numXfrm(digits, p);'),
    (r'this\.num_xfrm = this\.emit_(\w+)', r'this.num_xfrm = XF_\1'),
    (r'/\*RB\*/ this\.emit4\(TK_tINTEGER, this\.tok2\(this\.ts, this\.te - 1\)\.to_i, this\.ts, this\.te - 1\);', 'this.emit4(TK_tINTEGER, this.intValue(this.tok2(this.ts, this.te - 1), 10), this.ts, this.te - 1);'),
    (r'this\.emit4\(TK_tFLOAT, this\.tok2\(this\.ts, this\.te - 1\)\.to_f, this\.ts, this\.te - 1\)', 'this.emit4(TK_tFLOAT, this.tok2(this.ts, this.te - 1), this.ts, this.te - 1)'),
    (r'/\*RB\*/ type, delimiter = this\.tok2\(this\.ts, this\.te\), this\.tok2\(this\.ts, this\.te\)\[-1\]\.chr;', 'type = this.tok2(this.ts, this.te); delimiter = this.tok2(this.te - 1, this.te);'),
    (r'/\*RB\*/ type, delimiter = this\.tok2\(this\.ts, this\.te\)\[0\.\.-2\], this\.tok2\(this\.ts, this\.te\)\[-1\]\.chr;', 'type = this.tok2(this.ts, this.te - 1); delimiter = this.tok2(this.te - 1, this.te);'),
    (r'/\*RB\*/ type, delimiter = this\.source_buffer\.slice\(this\.ts, 1\)\.chr, this\.tok2\(this\.ts, this\.te\)\[-1\]\.chr;', 'type = this.tok2(this.ts, this.ts + 1); delimiter = this.tok2(this.te - 1, this.te);'),
    (r'/\*RB\*/ type = delimiter = this\.tok2\(this\.ts, this\.te\)\[0\]\.chr;', 'type = this.tok2(this.ts, this.ts + 1); delimiter = type;'),
    (r'/\*RB\*/ this\.strings\.herebody_s \|\|= new_herebody_s;', 'if (this.strings.herebody_s < 0) { this.strings.herebody_s = new_herebody_s; }'),
    (r'/\*RB\*/ p, next_state = this\.strings\.advance\(p\);', 'p = this.strings.advance(p); next_state = this.strings.rootState;'),
    (r'/\*RB\*/ p, next_state = this\.strings\.read_character_constant\(this\.ts\);', 'p = this.strings.readCharacterConstant(this.ts); next_state = this.strings.rootState;'),
    (r'RB_NULL', '-1'),
    (r' == ', ' === '), (r' != ', ' !== '),
]

def post(lines):
    out = []
    for l in lines:
        for a, b in RULES:
            l = re.sub(a, b, l)
        # diagnostics: errors/fatal fail the parse, warnings are dropped
        m = re.match(r'^(/\*RB\*/ )?(this\.)?diagnostic\(?\s*:(\w+)', l)
        if m:
            sev = m.group(3)
            l = {'error': 'this.diagError();', 'fatal': 'this.diagFatal();'}.get(sev, '/* warning */')
        out.append(l)
    return out

def section(path, start_marker):
    src = open(path).read().splitlines()
    tr = post(translate(src))
    txt = '\n'.join(tr)
    a = txt.index(start_marker)
    return txt[a:]

if __name__ == '__main__':
    print(section(sys.argv[1], sys.argv[2]))
