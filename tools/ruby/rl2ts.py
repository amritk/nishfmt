# Translates a Ragel-generated Ruby lexer `advance` method (parser gem) into
# TypeScript for Nish: Ruby blocks to braces, @fields to this., symbols to
# token constants, version checks folded for Ruby 3.3. What it cannot
# translate it leaves marked with /*RB*/ for hand fixing.
import re, sys
VERSION = 33

def fold_version(s):
    def ver(m):
        vs = [int(x) for x in re.findall(r'\d+', m.group(1))]
        return 'true' if VERSION in vs else 'false'
    s = re.sub(r'version\?\(([\d,\s]+)\)', ver, s)
    s = re.sub(r'@version\s*(>=|<=|<|>|==)\s*(\d+)', lambda m: 'true' if eval(f'{VERSION} {m.group(1)} {m.group(2)}') else 'false', s)
    return s

def strlit(s):
    # '...'.freeze and '...' -> "..."
    s = re.sub(r"'((?:[^'\\]|\\.)*)'\.freeze", lambda m: '"' + m.group(1).replace('"', '\\"') + '"', s)
    s = re.sub(r"'((?:[^'\\]|\\.)*)'", lambda m: '"' + m.group(1).replace('"', '\\"') + '"', s)
    return s

def expr(s):
    s = fold_version(s)
    s = strlit(s)
    s = s.replace('.freeze', '')
    s = re.sub(r'@(\w+)', r'this.\1', s)
    # emit by arity
    def em(m):
        args = split_args(m.group(2))
        name = m.group(1)
        if name == 'emit':
            return 'this.emit%d(%s)' % (len(args), ', '.join(args))
        return 'this.%s(%s)' % (name, ', '.join(args))
    s = rewrite_emits(s)
    s = re.sub(r'\bemit_table\(', 'this.emit_table(', s)
    s = re.sub(r':([tk][A-Za-z_0-9]+)', r'TK_\1', s)
    s = re.sub(r'\btok\(([^()]*)\)', lambda m: 'this.tok2(%s)' % m.group(1) if ',' in m.group(1) else 'this.tok2(%s, this.te)' % m.group(1), s)
    s = re.sub(r'\btok\b(?!\()', 'this.tok2(this.ts, this.te)', s)
    s = re.sub(r'\brange\(', 'this.range(', s)
    for f in ['numeric_literal_int', 'on_newline', 'arg_or_cmdarg', 'stack_pop', 'e_lbrace', 'emit_do',
              'emit_comment_from_range', 'emit_comment', 'emit_global_var', 'emit_class_var', 'emit_instance_var',
              'emit_rbrace_rparen_rbrack', 'emit_colon_with_digits', 'emit_singleton_class', 'check_ambiguous_slash']:
        s = re.sub(r'(?<![\w.])' + f + r'\b(?!\()', 'this.' + f + '()', s)
        s = re.sub(r'(?<![\w.])' + f + r'\(', 'this.' + f + '(', s)
    s = re.sub(r'\bnil\b', 'RB_NULL', s)
    s = re.sub(r'\bunless\b', 'if !', s)
    s = s.replace('.nil?', ' === RB_NULL')
    s = re.sub(r'\band\b', '&&', s)
    s = re.sub(r'\bor\b', '||', s)
    s = re.sub(r'\bnot\b', '!', s)
    return s

def scan_call(s, i):
    """The end of the parenthesised arguments starting at s[i] == '(' (quotes respected)."""
    depth = 0
    j = i
    while j < len(s):
        c = s[j]
        if c == '"':
            j += 1
            while j < len(s) and s[j] != '"':
                if s[j] == '\\': j += 1
                j += 1
        elif c == '(':
            depth += 1
        elif c == ')':
            depth -= 1
            if depth == 0:
                return j
        j += 1
    return -1

def rewrite_emits(s):
    out = ''
    i = 0
    for m in list(re.finditer(r'(?<![\w.])emit\(', s)):
        a = m.start()
        if a < i: continue
        b = scan_call(s, m.end() - 1)
        if b < 0: continue
        args = split_args(s[m.end():b])
        out += s[i:a] + 'this.emit%d(%s)' % (len(args), ', '.join(args))
        i = b + 1
    return out + s[i:]

def split_args(a):
    out, depth, cur, q = [], 0, '', False
    k = 0
    while k < len(a):
        ch = a[k]
        if ch == '"':
            q = not q
        elif ch == '\\' and q:
            cur += ch + a[k + 1]; k += 2; continue
        elif not q and ch in '([{': depth += 1
        elif not q and ch in ')]}': depth -= 1
        if ch == ',' and depth == 0 and not q:
            out.append(cur.strip()); cur = ''
        else:
            cur += ch
        k += 1
    if cur.strip(): out.append(cur.strip())
    return out

def join_continuations(lines):
    out = []
    buf = ''
    for raw in lines:
        st = raw.strip()
        if st.startswith('#'):
            if not buf:
                out.append(raw)
            continue
        st = re.sub(r'\s+#\s[^"\']*$', '', st)
        st = re.sub(r'^(else|end)\s+#.*$', r'\1', st)
        cur = st if not buf and re.match(r'^(else|end)$', st) else None
        cur = cur if cur is not None else (buf + ' ' + st).strip() if buf else raw.rstrip()
        if re.search(r'(&&|\|\||,|\(|\+)\s*$', st) and not st.startswith('when '):
            buf = cur.strip()
            continue
        buf = ''
        out.append(cur)
    if buf:
        out.append(buf)
    return out

def translate(lines):
    lines = join_continuations(lines)
    out = []
    stack = []  # 'block' | 'if' | 'case' | 'when' | 'while'
    for raw in lines:
        line = raw.rstrip()
        st = line.strip()
        if not st or st.startswith('#'):
            continue
        # strip trailing comments (not inside strings; rough)
        st = re.sub(r'\s+#\s[^"\']*$', '', st)
        # split multiple statements joined with ';'
        parts = [p.strip() for p in re.split(r';(?=(?:[^"\']*["\'][^"\']*["\'])*[^"\']*$)', st) if p.strip()]
        for part in parts:
            out.extend(stmt(part, stack))
    return out

def stmt(st, stack):
    o = []
    # trailing 'end' after statement on same line: "foo 		end"
    m = re.match(r'^(.*\S)\s+end$', st)
    if m and not re.match(r'^(if|unless|while|case|elsif|when)\b', m.group(1)) and m.group(1) not in ('begin',):
        o.extend(stmt(m.group(1), stack)); o.extend(stmt('end', stack)); return o
    m = re.match(r'^begin\s+(.*)$', st)
    if m:
        o.extend(stmt('begin', stack)); o.extend(stmt(m.group(1), stack)); return o
    if st == 'begin':
        stack.append('block'); return ['{']
    if st == 'end':
        k = stack.pop() if stack else '?'
        if k == 'when':
            k2 = stack.pop() if stack else '?'
            return ['break;', '}', '}'] if k2 == 'case' else ['}']
        if k == 'case':
            return ['}']
        return ['}']
    if st == 'else':
        if stack and stack[-1] == 'when':
            return ['break;', '}', 'default: {']
        return ['} else {']
    m = re.match(r'^elsif\s+(.*?)(\s+then)?$', st)
    if m:
        return ['} else if (%s) {' % expr(m.group(1))]
    m = re.match(r'^(if|unless)\s+(.*?)(\s+then)?$', st)
    if m:
        stack.append('if')
        c = expr(m.group(2))
        return ['if (%s(%s)) {' % ('!' if m.group(1) == 'unless' else '', c)]
    m = re.match(r'^while\s+(.*)$', st)
    if m:
        stack.append('while')
        return ['while (%s) {' % expr(m.group(1))]
    m = re.match(r'^case\s+(.*)$', st)
    if m:
        stack.append('case')
        return ['switch (%s) {' % expr(m.group(1))]
    m = re.match(r'^when\s+(.*?)(\s+then)?$', st)
    if m:
        pre = []
        if stack and stack[-1] == 'when':
            stack.pop(); pre = ['break;', '}']
        stack.append('when')
        vals = [v.strip() for v in m.group(1).split(',')]
        return pre + [' '.join('case %s:' % expr(v) for v in vals) + ' {']
    if st == 'next':
        return ['continue;']
    if st == 'break':
        return ['break;']
    m = re.match(r'^p, next_state = this\.strings\.(\w+)\((.*)\)$', expr(st))
    s = expr(st)
    if re.search(r'=~|\$\d|\.chr|\[\s*-?\d+\s*\.\.|\.call|\.to_i|Float\(|\.each|\.any\?|\.last|\.push |\.pop$|\.empty\?|\|\|=|, \w+ = |^\w+, \w+', s):
        return ['/*RB*/ ' + s + ';']
    if re.match(r'^(diagnostic)\b', s):
        return ['this.' + s.replace('diagnostic ', 'diagnostic(', 1) + ');']
    return [s + ';']

if __name__ == '__main__':
    src = open(sys.argv[1]).read().splitlines()
    for l in translate(src):
        print(l)
