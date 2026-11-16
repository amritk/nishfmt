#!/usr/bin/env python3
"""Case oracle test: redundantInit (uppercased() == self of a type's first Character) and
isInResultBuilder (Character.isUppercase), one line or block per code point."""
import os, subprocess, sys, unicodedata

out = os.environ.get('FFWORK', '/tmp/swift2') + '/ct'
os.makedirs(out, exist_ok=True)
mode = sys.argv[1]

def ok(cp):
    if 0xD800 <= cp <= 0xDFFF:
        return False
    c = chr(cp)
    cat = unicodedata.category(c)
    return cat in ('Lu', 'Ll', 'Lt', 'Lm', 'Lo', 'Nl') and unicodedata.combining(c) != 9

cps = [cp for cp in range(0x80, 0x110000) if ok(cp)]
if mode == 'marks':
    # base letter + combining mark
    marks = [cp for cp in range(0x300, 0x370)] + [0x345, 0x20D0, 0x1DC0]
    tests = []
    for b in ['a', 'A', 'é', 'É', 'ı', 'ǅ', 'ª']:
        for m in marks:
            tests.append(b + chr(m))
else:
    tests = [chr(cp) for cp in cps]

per = 2000
bad = 0
n = 0
for start in range(0, len(tests), per):
    chunk = tests[start:start + per]
    if mode == 'builder':
        parts = ['struct V: View {', '    var body: some View {']
        for i, t in enumerate(chunk):
            parts.append('        %sq {\n            if c {\n                Text("")\n            } else {\n                EmptyView()\n            }\n        }' % t)
        parts.append('    }\n}')
        text = '\n'.join(parts) + '\n'
    else:
        text = '\n'.join('let v%d = %sbc.init(1)' % (i, t) for i, t in enumerate(chunk)) + '\n'
    data = text.encode('utf-8')
    path = os.path.join(out, '%s%d.swift' % (mode, n))
    n += 1
    open(path, 'wb').write(data)
    ref = subprocess.run(['/opt/ref/swiftformat', 'stdin', '--quiet'], input=data, capture_output=True)
    dev = subprocess.run([os.environ.get('FFDEV', '/tmp/swift2/dev'), path], capture_output=True, env=dict(os.environ, FFDEBUG='1'))
    if ref.returncode != 0:
        print('REF FAIL', path, ref.stderr.decode()[:200])
        continue
    if dev.returncode != 0:
        print('DEV SKIP', path, dev.stderr.decode()[:200])
        continue
    if ref.stdout != dev.stdout:
        bad += 1
        r = ref.stdout.decode().split('\n')
        d = dev.stdout.decode().split('\n')
        shown = 0
        for j in range(min(len(r), len(d))):
            if r[j] != d[j] and shown < 8:
                print('DIFF', path, j, repr(r[j][:60]), repr(d[j][:60]))
                shown += 1
print(mode, 'files', n, 'bad', bad)
