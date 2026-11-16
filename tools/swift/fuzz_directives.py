#!/usr/bin/env python3
"""fuzz.py RULE N FILELIST [SEED]: inserts swiftformat directives naming RULE near the lines
RULE changes, in up to N corpus files, and compares the dev driver (FFSWDIRALL=1) with swiftformat.
Prints MISMATCH lines with the variant path; summary at end."""
import os, random, subprocess, sys, difflib

rule = sys.argv[1]
nmax = int(sys.argv[2])
files = [l.rstrip('\n') for l in open(sys.argv[3]) if l.strip()]
seed = int(sys.argv[4]) if len(sys.argv) > 4 else 1
rnd = random.Random(seed)
raw = '/work/c/swift/raw'
out = os.environ.get('FFWORK', '/tmp/swift2') + '/fz/' + rule
os.makedirs(out, exist_ok=True)
REF = '/opt/ref/swiftformat'
env = dict(os.environ, FFSWDIRALL='1')

def ref_fmt(data, rules=None, path=None):
    args = [REF, 'stdin', '--quiet']
    if path:
        args += ['--stdin-path', path]
    if rules:
        args += ['--rules', rules]
    p = subprocess.run(args, input=data, capture_output=True)
    return p.returncode, p.stdout

def dev_fmt(path):
    p = subprocess.run([os.environ.get('FFDEV', '/tmp/swift2/dev'), path], capture_output=True, env=env)
    return p.returncode, p.stdout, p.stderr

ok = skip = bad = refail = tried = 0
rnd.shuffle(files)
for f in files:
    if tried >= nmax:
        break
    src = open(os.path.join(raw, f), 'rb').read()
    rc, one = ref_fmt(src, rule)
    if rc != 0 or one == src:
        continue
    tried += 1
    a = src.decode('utf-8', 'surrogateescape').split('\n')
    b = one.decode('utf-8', 'surrogateescape').split('\n')
    changed = []
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if tag != 'equal':
            changed.append(i1)
    variants = []
    lname = os.environ.get('LNAME', rule)
    for k in range(int(os.environ.get('NV', '4'))):
        L = rnd.choice(changed)
        lines = list(a)
        kind = k % 4
        if kind == 0:
            L2 = min(len(lines), L + rnd.randint(0, 30))
            lines.insert(L2, '// swiftformat:enable ' + lname)
            lines.insert(max(0, L - rnd.randint(0, 5)), '// swiftformat:disable ' + lname)
        elif kind == 1:
            lines.insert(max(0, L - rnd.randint(0, 1)), '    // swiftformat:disable:next ' + lname)
        elif kind == 2:
            if L < len(lines):
                lines[L] = lines[L] + ' // swiftformat:disable:this ' + lname
        else:
            lines.insert(max(0, L - rnd.randint(0, 40)), '/* swiftformat:disable ' + lname + ' */')
        variants.append('\n'.join(lines))
    for v, text in enumerate(variants):
        data = text.encode('utf-8', 'surrogateescape')
        d = os.path.join(out, '%d_%d' % (tried, v))
        os.makedirs(d, exist_ok=True)
        path = os.path.join(d, os.path.basename(f))
        open(path, 'wb').write(data)
        rc, expect = ref_fmt(data, None, path)
        if rc != 0:
            refail += 1
            continue
        drc, got, err = dev_fmt(path)
        if drc != 0:
            skip += 1
            if os.environ.get('SHOWSKIP'):
                print('SKIP', path, f, err.decode()[:200].strip())
            continue
        if got == expect:
            ok += 1
        else:
            bad += 1
            open(path + '.ref', 'wb').write(expect)
            open(path + '.out', 'wb').write(got)
            print('MISMATCH', path, f)
print('rule=%s files=%d ok=%d skip=%d mismatch=%d reffail=%d' % (rule, tried, ok, skip, bad, refail))
