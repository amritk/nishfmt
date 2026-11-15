# Assembles src/ruby/lexer.ts from lexer_tmpl.ts and the translated actions.
import os, re
T = os.path.dirname(os.path.abspath(__file__)) + '/'
OUT = os.path.join(T, '../../src/ruby/lexer.ts')

def switch_block(text, header):
    a = text.index(header)
    depth = 0
    i = a
    while True:
        c = text[i]
        if c == '{': depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return text[a:i + 1]
        elif c == '"':
            i += 1
            while text[i] != '"':
                if text[i] == '\\': i += 1
                i += 1
        i += 1

COMMON = [
    (r'this\.emit4\(TK_tNL, -1,', 'this.emit4(TK_tNL, "",'),
    (r'this\.(?:st\(\)|strings)\.pushLiteral\(((?:[^,()]+|\([^()]*\))(?:, (?:[^,()]+|\([^()]*\))){3,})\)', r'this.strings.pushLiteralFull(\1)'),
    (r'^/\*RB\*/ this\.emit4\(\(this\.source_buffer\.slice\(this\.ts, 1\) =~ /\[A-Z\]/\) \? TK_tCONSTANT : TK_tIDENTIFIER, ident, this\.ts, this\.te - 2\);$', 'this.emit4(this.at(this.ts) >= 65 && this.at(this.ts) <= 90 ? TK_tCONSTANT : TK_tIDENTIFIER, ident, this.ts, this.te - 2);'),
    (r'this\.this\.', 'this.'),
    (r'this\.emit3\(TK_tNL, this\.te - 1, this\.te\)', 'this.emit4(TK_tNL, "", this.te, this.te)'),
    (r'^raise "bug";$', 'this.diagError();'),
    (r'PUNCTUATION_BEGIN', '2'), (r'KEYWORDS_BEGIN', '4'), (r'\bPUNCTUATION\b', '1'), (r'\bKEYWORDS\b', '3'),
    (r'this\.stack\[ this\.top\] =  this\.cs;', 'this.stackPush(this.cs);'),
    (r'^this\.top\+= 1;$', ''),
    (r'this\.emit_global_var\(\)', 'this.emitGlobalVarHere()'),
    (r'this\.emit_class_var\(\)', 'this.emit_class_var(this.ts, this.te)'),
    (r'this\.emit_instance_var\(\)', 'this.emit_instance_var(this.ts, this.te)'),
    (r'this\.emit_do\(\)', 'this.emit_do(false)'),
    (r'this\.emit_colon_with_digits\(p, tm, diag_msg\)', 'this.emit_colon_with_digits(p, tm)'),
    (r'this\.lexer\.class\.lex_en_(\w+)', lambda m: 'RL_LEX_EN_' + m.group(1).upper()),
    (r'(?:self|klass)\.class\.lex_en_(\w+)', lambda m: 'RS_LEX_EN_' + m.group(1).upper()),
]
MAIN = [
    (r'this\.tok2\(this\.ts, this\.te\) =~ /\\A_\[1-9\]\\z/', 'rbIsNumberedParam(this.tok2(this.ts, this.te))'),
    (r'^/\*RB\*/ emit\(\(this\.source_buffer\.slice\(this\.ts, 1\) =~ /\[A-Z\]/\) \? TK_tCONSTANT : TK_tIDENTIFIER, ident, this\.ts, this\.te - 2\);$', 'this.emit4(this.at(this.ts) >= 65 && this.at(this.ts) <= 90 ? TK_tCONSTANT : TK_tIDENTIFIER, ident, this.ts, this.te - 2);'),
    (r'^/\*RB\*/ this\.tok2\(this\.ts, heredoc_e\) =~ .*$', '{ const hd = rbHeredocOpener(this.tok2(this.ts, heredoc_e)); indent = hd.indent; dedent_body = hd.dedent; type = hd.type; delimiter = hd.delimiter; }'),
    (r'^/\*RB\*/ (indent|dedent_body|type|delimiter) .*\$\d.*$', ''),
    (r'delimiter\.end_with\?\("\\n"\)', lambda m: 'delimiter.endsWith("\\n")'),
    (r'delimiter\.count\("\\n"\) > 0', lambda m: '(delimiter.indexOf("\\n") >= 0)'),
    (r'delimiter\.count\("\\r"\) > 0', lambda m: '(delimiter.indexOf("\\r") >= 0)'),
    (r'delimiter = delimiter\.rstrip', 'delimiter = rbRstrip(delimiter)'),
    (r'gvar_name\.start_with\?\("\$0"\) && gvar_name\.length > 2', 'gvar_name.startsWith("$0") && gvar_name.length > 2'),
    (r'^diag_msg = :\w+;$', ''),
    
    (r'klass\.lex_en_(\w+)', lambda m: 'RL_LEX_EN_' + m.group(1).upper()),
    (r'self\.class\.lex_en_(\w+)', lambda m: 'RL_LEX_EN_' + m.group(1).upper()),
]
STR_LATE = [
    (r'^if \(\(state = this\.pop_literal\(\)\)\) \{$', 'state = this.pop_literal(); if (state >= 0) {'),
    (r'unknown_options\.any\(\)', 'unknown_options'),
    (r'this\.emit(\d)\(', r'this.lexer.emit\1('),
    (r'^escape = ESCAPE_WHITESPACE.*$', ''),
    (r'^if \(\(!current_literal\.heredoc\(\) && \(token = current_literal\.nest_and_try_closing\((.*)\)\)\)\) \{$', r'token = -1; if (!current_literal.heredoc()) { token = current_literal.nest_and_try_closing(\1); } if (token >= 0) {'),
    (r'^if \(\(current_literal\.nest_and_try_closing\((.*)\)\)\) \{$', r'if (current_literal.nest_and_try_closing(\1) >= 0) {'),
]
STR_METHODS = ['unicode_points', 'unescape_char', 'read_post_meta_or_ctrl_char', 'slash_c_char', 'slash_m_char',
               'encode_escaped_char', 'check_invalid_escapes', 'extend_interp_var', 'extend_interp_code',
               'emit_interp_var', 'extend_interp_digit_var', 'pop_literal', 'emit_character_constant',
               'extend_string_escaped', 'extend_string_eol_check_eof', 'extend_string_eol_heredoc_line',
               'extend_string_eol_heredoc_intertwined', 'extend_string_eol_words', 'extend_string_slice_end',
               'extend_string_for_token_range', 'continue_lexing']
STR = [
    (r'this\.diagFatal\(\);', 'this.lexer.diagFatal();'),
    (r'this\.diagError\(\);', 'this.lexer.diagError();'),
    (r'this\.root_lexer_state', 'this.rootState'),
    (r'^this\.escape\s*=\s*-1;$', 'this.hasEscape = false;'),
    (r'^unknown_options = this\.tok2\(this\.ts, this\.te\)\.scan\(/\[\^imxouesn\]/\);$', 'unknown_options = rbUnknownRegexpOptions(this.tok2(this.ts, this.te));'),
    (r'unknown_options\.any\(\)', 'unknown_options'),
    (r'^if \(\(!current_literal\.heredoc\(\) && \(token = current_literal\.nest_and_try_closing\((.*)\)\)\)\) \{$', r'token = -1; if (!current_literal.heredoc()) { token = current_literal.nest_and_try_closing(\1); } if (token >= 0) {'),
    (r'\.(extend_space|extend_string) (this\.[\w()]+(?:\([^)]*\))?, this\.\w+, this\.\w+|this\.\w+, this\.\w+);', r'.\1(\2);'),
    (r'/\*RB\*/ this\.escape = encode_escape\(this\.tok2\(this\.escape_s, p\)\.to_i\(8\) % 0x100\);', 'this.escape = rbByteChr(rbParseInt(this.tok2(this.escape_s, p), 8) % 256); this.hasEscape = true;'),
    (r'/\*RB\*/ this\.escape = encode_escape\(this\.tok2\(this\.escape_s \+ 1, p\)\.to_i\(16\)\);', 'this.escape = rbByteChr(rbParseInt(this.tok2(this.escape_s + 1, p), 16)); this.hasEscape = true;'),
    (r'/\*RB\*/ this\.escape = this\.tok2\(this\.escape_s \+ 1, p\)\.to_i\(16\)\.chr\(Encoding::UTF_8\);', 'this.escape = rbChr(rbParseInt(this.tok2(this.escape_s + 1, p), 16)); this.hasEscape = true;'),
    (r'interp_var_kind = :gvar', 'interp_var_kind = 3'), (r'interp_var_kind = :cvar', 'interp_var_kind = 1'), (r'interp_var_kind = :ivar', 'interp_var_kind = 2'),
    (r'^this\.escape = -1;$', 'this.hasEscape = false;'),
    (r'^this\.escape = ("[^"]*");$', r'this.escape = \1; this.hasEscape = true;'),
    (r'(?<![\w.])literal\b', 'this.lit()'),
    (r'\.(\w+)\?', r'.\1()'),
    (r'(?<![\w.])source_pts\b', 'pts'),
]

def drop_unreachable(block):
    """Drops statements after an unconditional jump within the same block
    (a plain block, or an if/else chain whose every branch jumps)."""
    out = []
    stack = []
    cur = {'kind': 'plain', 'term': False, 'chain': True}
    for l in block.splitlines():
        st = l.strip()
        opens = st.endswith('{') and not st.startswith('}')
        if st.startswith('}'):
            done = cur
            cur = stack.pop() if stack else {'kind': 'plain', 'term': False, 'chain': True}
            if st.endswith('{'):
                # } else { / } else if (...) {
                chain = done.get('chain', True) and done['term']
                stack.append(cur)
                cur = {'kind': 'else' if st == '} else {' else 'elif', 'term': False, 'chain': chain}
                out.append(l)
                continue
            if done['kind'] == 'plain' and done['term']:
                cur['term'] = True
            elif done['kind'] == 'else' and done['term'] and done['chain']:
                cur['term'] = True
            out.append(l)
            continue
        if cur['term'] and st:
            continue  # unreachable
        out.append(l)
        if opens:
            stack.append(cur)
            kind = 'plain' if st == '{' else ('case' if st.startswith('case ') or st.startswith('default:') else ('if' if st.startswith('if ') else 'ctrl'))
            cur = {'kind': kind, 'term': False, 'chain': True}
            continue
        if re.match(r'^(continue;|break \w+;|return\b.*;)$', st):
            cur['term'] = True
        elif st == 'break;' and cur['kind'] == 'case':
            cur['term'] = True
    return '\n'.join(out)

def apply(block, rules):
    out = []
    for l in block.splitlines():
        for a, b in rules:
            l = re.sub(a, b, l)
        out.append(l)
    return '\n'.join(out)

main = open(T + 'main_actions.ts').read()
mainsw = switch_block(main, 'switch (_lex_trans_actions[_trans]) {')
mainsw = mainsw.replace('switch (_lex_trans_actions[_trans]) {', 'switch (rbAt(RL_LEX_TRANS_ACTIONS, _trans)) {', 1)
mainsw = apply(mainsw, COMMON + MAIN).replace('this.strings.', 'this.st().')
st = open(T + 'str_actions.ts').read()
b = st.index('while (_nacts > 0) {')
strsw = switch_block(st[b:], 'switch (_lex_actions[_acts - 1]) {')
strsw = strsw.replace('switch (_lex_actions[_acts - 1]) {', 'switch (rbAt(RS_LEX_ACTIONS, _acts - 1)) {', 1)
strsw = apply(strsw, COMMON + STR)
for m in STR_METHODS:
    strsw = re.sub(r'(?<![\w.])' + m + r'\b(?!\()', 'this.' + m + '()', strsw)
    strsw = re.sub(r'(?<![\w.])' + m + r'\(', 'this.' + m + '(', strsw)
strsw = apply(strsw, STR_LATE)
strsw = re.sub(r'(_trigger_goto = true;\n_goto_level = \w+;\n)break;', r'\1break actsLoop;', strsw)
strsw = strsw.replace('token[0] ===', 'token ===')
strsw = drop_unreachable(strsw)
mainsw = drop_unreachable(mainsw)
for m in STR_METHODS:
    strsw = re.sub(r'(?<![\w.])' + m + r'\b(?!\()', 'this.' + m + '()', strsw)
    strsw = re.sub(r'(?<![\w.])' + m + r'\(', 'this.' + m + '(', strsw)

tmpl = open(T + 'lexer_tmpl.ts').read()
tmpl = tmpl.replace('/*@MAIN_ACTIONS@*/', mainsw).replace('/*@STR_ACTIONS@*/', strsw)

kw = 'class module def undef begin end then elsif else ensure case when for break next redo retry in do return yield super self nil true false and or not alias __FILE__ __LINE__ __ENCODING__'.split()
lines = ['/** The keyword token of `v` (KEYWORDS without the modifier forms), or -1. */', 'const rbKeyword = (v: string): i32 => {']
for k in kw:
    lines.append(f'  if (v === "{k}") return TK_k{k.upper()};')
lines += ['  return -1;', '};']
tmpl = tmpl.replace('/*@KEYWORDS@*/', '\n'.join(lines))
punct = {'=':'tEQL','&':'tAMPER2','|':'tPIPE','!':'tBANG','^':'tCARET','+':'tPLUS','-':'tMINUS','*':'tSTAR2','/':'tDIVIDE','%':'tPERCENT','~':'tTILDE',',':'tCOMMA',';':'tSEMI','.':'tDOT','..':'tDOT2','...':'tDOT3','[':'tLBRACK2',']':'tRBRACK','(':'tLPAREN2',')':'tRPAREN','?':'tEH',':':'tCOLON','&&':'tANDOP','||':'tOROP','-@':'tUMINUS','+@':'tUPLUS','~@':'tTILDE','**':'tPOW','->':'tLAMBDA','=~':'tMATCH','!~':'tNMATCH','==':'tEQ','!=':'tNEQ','>':'tGT','>>':'tRSHFT','>=':'tGEQ','<':'tLT','<<':'tLSHFT','<=':'tLEQ','=>':'tASSOC','::':'tCOLON2','===':'tEQQ','<=>':'tCMP','[]':'tAREF','[]=':'tASET','{':'tLCURLY','}':'tRCURLY','`':'tBACK_REF2','!@':'tBANG','&.':'tANDDOT'}
lines = ['/** PUNCTUATION, or -1. */', 'const rbPunct = (v: string): i32 => {']
for k, v in punct.items():
    lines.append('  if (v === %s) return TK_%s;' % ('"' + k.replace('\\', '\\\\') + '"' if k != '`' else '"`"', v))
lines += ['  return -1;', '};']
tmpl = tmpl.replace('/*@PUNCT@*/', '\n'.join(lines))
toks = sorted(set(re.findall(r'\bTK_\w+', tmpl)))
tmpl = tmpl.replace('  /*@TOKENS@*/\n', ''.join(f'  {t},\n' for t in toks))
open(OUT, 'w').write(tmpl)
print('tokens', len(toks), 'lines', tmpl.count('\n'))
