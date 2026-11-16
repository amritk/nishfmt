#!/usr/bin/env python3
"""Grapheme-count oracle test: builds files whose indentation depends on String.count of
string literals, formats them with swiftformat and the dev driver, and reports differences."""
import os, random, subprocess, sys, unicodedata

out = os.environ.get('FFWORK', '/tmp/swift2') + '/gc'
os.makedirs(out, exist_ok=True)
rnd = random.Random(int(sys.argv[1]) if len(sys.argv) > 1 else 1)

def ok(cp):
    if 0xD800 <= cp <= 0xDFFF:
        return False
    c = chr(cp)
    cat = unicodedata.category(c)
    if cat in ('Cn', 'Cc', 'Zl', 'Zp', 'Cs') or unicodedata.combining(c) == 9:
        return False
    if c in '"\\':
        return False
    return True

cps = [cp for cp in range(0x80, 0x110000) if ok(cp) and not (0xE000 <= cp <= 0xF8FF) and not (0xF0000 <= cp)]
# interesting classes for combinations
marks = [cp for cp in cps if unicodedata.category(chr(cp)) in ('Mn', 'Mc', 'Me')]
special = [0x200D, 0x200C, 0x0600, 0x0601, 0x110BD, 0x1F1E6, 0x1F1FA, 0x1F1F8, 0x1F468, 0x1F469, 0x2764, 0xFE0F,
           0x1F3FB, 0x1100, 0x1161, 0x11A8, 0xAC00, 0xAC01, 0x0E33, 0x0E31, 0x0D4E, 0x00A9, 0x00AD, 0x0D, 0x0A]
special = [c for c in special if c not in (0x0D, 0x0A)]
pool = marks[:: max(1, len(marks) // 400)] + special * 8 + [ord(c) for c in 'ab'] * 20 + cps[:: max(1, len(cps) // 400)]

tests = []
if 'single' in sys.argv:
    for cp in cps:
        tests.append('a' + chr(cp) + 'a')
for _ in range(int(os.environ.get('NPAIRS', '3000'))):
    k = rnd.randint(2, 5)
    tests.append(''.join(chr(rnd.choice(pool)) for _ in range(k)))

per = 1500
bad = 0
nfiles = 0
for start in range(0, len(tests), per):
    chunk = tests[start:start + per]
    lines = []
    for i, t in enumerate(chunk):
        lines.append('let s%d = "%s"; foo(a,\nb)' % (i, t))
    path = os.path.join(out, 'g%d.swift' % nfiles)
    data = ('\n'.join(lines) + '\n').encode('utf-8')
    open(path, 'wb').write(data)
    ref = subprocess.run(['/opt/ref/swiftformat', 'stdin', '--quiet'], input=data, capture_output=True)
    dev = subprocess.run([os.environ.get('FFDEV', '/tmp/swift2/dev'), path], capture_output=True, env=dict(os.environ, FFDEBUG='1'))
    nfiles += 1
    if ref.returncode != 0:
        print('REF FAIL', path)
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
            if r[j] != d[j] and shown < 10:
                print('DIFF', path, j, repr(chunk[j // 2]), [hex(ord(c)) for c in chunk[j // 2]], len(r[j]) - len(r[j].lstrip()), len(d[j]) - len(d[j].lstrip()))
                shown += 1
print('files', nfiles, 'bad', bad)
