"""Regenerates src/rust/uwidth_table.ts from unicode-width 0.1.14, the crate
rustfmt 1.10.0 measures display width with.

    python3 -I tools/rust/uwidth/mk.py <unicode-width-0.1.14 directory>

The directory is the crate's source, extracted from
https://static.crates.io/crates/unicode-width/unicode-width-0.1.14.crate.
The script reads the lookup tables of its src/tables.rs as data (the cjk
feature off), evaluates lookup_width and the sequence predicates for every
code point as tables.rs does, and writes the runs of code points they treat
alike, each with its packed value width | info << 2 | flags << 18.
"""

import os
import re
import sys

src = open(os.path.join(sys.argv[1], "src", "tables.rs"), encoding="utf-8").read()


def static_body(name):
    """The text of `static NAME ... = ...;` after the `=`."""
    m = re.search(r"static " + name + r"\b[^=]*=(.*?);\n", src, re.S)
    return m.group(1)


def nested_bytes(name):
    """The sub-arrays of a [[u8; N]; M] table, leaving out cjk-only ones."""
    body = static_body(name)
    out = []
    cur = None
    cjk = False
    for line in body.split("\n"):
        t = line.strip()
        if t == '#[cfg(feature = "cjk")]':
            cjk = True
        elif t == "[":
            cur = []
        elif t.startswith("]") and cur is not None:
            if not cjk:
                out.append(cur)
            cur = None
            cjk = False
        elif cur is not None:
            cur.extend(int(x, 16) for x in re.findall(r"0x([0-9A-Fa-f]+)", t))
    return out


def flat_bytes(name):
    return [int(x, 16) for x in re.findall(r"0x([0-9A-Fa-f]+)", static_body(name))]


def pairs(name):
    return [(int(a, 16), int(b, 16)) for a, b in re.findall(r"\(0x([0-9A-Fa-f]+), 0x([0-9A-Fa-f]+)\)", static_body(name))]


ROOT = flat_bytes("WIDTH_ROOT")
MIDDLE = nested_bytes("WIDTH_MIDDLE")
LEAVES = nested_bytes("WIDTH_LEAVES")
EMOJI_LEAVES = nested_bytes("EMOJI_PRESENTATION_LEAVES")
assert len(ROOT) == 256 and len(MIDDLE) == 17 and len(LEAVES) == 157 and len(EMOJI_LEAVES) == 7
assert all(len(m) == 64 for m in MIDDLE) and all(len(lf) == 32 for lf in LEAVES)
NTZW = []
for a, b in re.findall(r"\(\[(0x[^\]]*)\], \[(0x[^\]]*)\]\)", static_body("NON_TRANSPARENT_ZERO_WIDTHS")):
    lo = [int(x, 16) for x in a.split(", ")]
    hi = [int(x, 16) for x in b.split(", ")]
    NTZW.append((lo[0] | lo[1] << 8 | lo[2] << 16, hi[0] | hi[1] << 8 | hi[2] << 16))


def info_const(name):
    return int(re.search(r"const " + name + r": Self = Self\((0b[01]+|\d+)\);", src).group(1), 0)


def leaf_map(fn):
    """The `top_bits => &LEAF` arms of a predicate function."""
    body = re.search(r"pub fn " + fn + r"\(c: char\) -> bool \{(.*?)\n\}", src, re.S).group(1)
    return {int(t, 16): pairs(leaf) for t, leaf in re.findall(r"0x([0-9A-F]+) => &(\w+),", body)}


TEXT_LEAVES = leaf_map("starts_non_ideographic_text_presentation_seq")
MODIFIER_LEAVES = leaf_map("is_emoji_modifier_base")
EMOJI_TOP = {int(t, 16): int(i) for t, i in re.findall(r"0x([0-9A-F]+) => (\d+),", re.search(r"pub fn starts_emoji_presentation_seq.*?\n\}", src, re.S).group(0))}

# lookup_width's match for the packed width 3 (non-cjk), in order.
SPECIAL = [
    (0x0A, 0x0A, 1, "LINE_FEED"),
    (0x5DC, 0x5DC, 1, "HEBREW_LETTER_LAMED"),
    (0x622, 0x882, 1, "JOINING_GROUP_ALEF"),
    (0x1780, 0x17AF, 1, "KHMER_COENG_ELIGIBLE_LETTER"),
    (0x17D8, 0x17D8, 3, "DEFAULT"),
    (0x1A10, 0x1A10, 1, "BUGINESE_LETTER_YA"),
    (0x2D31, 0x2D6F, 1, "TIFINAGH_CONSONANT"),
    (0xA4FC, 0xA4FD, 1, "LISU_TONE_LETTER_MYA_NA_JEU"),
    (0xFE0E, 0xFE0E, 0, "VARIATION_SELECTOR_15"),
    (0xFE0F, 0xFE0F, 0, "VARIATION_SELECTOR_16"),
    (0x10C03, 0x10C03, 1, "OLD_TURKIC_LETTER_ORKHON_I"),
    (0x1F1E6, 0x1F1FF, 1, "REGIONAL_INDICATOR"),
    (0x1F3FB, 0x1F3FF, 2, "EMOJI_MODIFIER"),
]
# The match arms must be the ones tables.rs has.
for lo, hi, w, name in SPECIAL:
    arm = "'\\u{%X}'" % lo if lo == hi else "'\\u{%X}'..='\\u{%X}'" % (lo, hi)
    assert (arm + " => (%d, WidthInfo::%s)" % (w, name)) in src, arm
assert "_ => (2, WidthInfo::EMOJI_PRESENTATION)," in src


def lookup_width(cp):
    t1 = ROOT[cp >> 13]
    t2 = MIDDLE[t1][cp >> 7 & 0x3F]
    w = LEAVES[t2][cp >> 2 & 0x1F] >> (2 * (cp & 3)) & 3
    if w < 3:
        return w, 0
    for lo, hi, sw, name in SPECIAL:
        if lo <= cp <= hi:
            return sw, info_const(name)
    return 2, info_const("EMOJI_PRESENTATION")


LIGATURE_TRANSPARENT = [(0x34F, 0x34F), (0x17B4, 0x17B5), (0x180B, 0x180D), (0x180F, 0x180F), (0x200D, 0x200D), (0xFE00, 0xFE0F), (0xE0100, 0xE01EF)]
assert "matches!(c, '\\u{34F}' | '\\u{17B4}'..='\\u{17B5}' | '\\u{180B}'..='\\u{180D}' | '\\u{180F}' | '\\u{200D}' | '\\u{FE00}'..='\\u{FE0F}' | '\\u{E0100}'..='\\u{E01EF}')" in src


def in_leaf(leaves, cp):
    leaf = leaves.get(cp >> 8)
    return leaf is not None and any(a <= (cp & 0xFF) <= b for a, b in leaf)


def flags(cp, w):
    f = 0
    if w == 0 and not any(a <= cp <= b for a, b in NTZW):
        f |= 1
    if any(a <= cp <= b for a, b in LIGATURE_TRANSPARENT):
        f |= 2
    i = EMOJI_TOP.get(cp >> 10)
    if i is not None and (EMOJI_LEAVES[i][(cp >> 3) & 0x7F] >> (cp & 7)) & 1:
        f |= 4
    if in_leaf(TEXT_LEAVES, cp):
        f |= 8
    if in_leaf(MODIFIER_LEAVES, cp):
        f |= 16
    return f


runs = []
prev = -1
for cp in range(0x110000):
    if 0xD800 <= cp <= 0xDFFF:
        v = 0
    else:
        w, info = lookup_width(cp)
        v = w | info << 2 | flags(cp, w) << 18
    if v != prev:
        runs.append("%06x%06x" % (cp, v))
        prev = v

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "src", "rust", "uwidth_table.ts")
with open(out, "w") as f:
    f.write("// Generated by tools/rust/uwidth/mk.py from unicode-width 0.1.14 (MIT OR\n")
    f.write("// Apache-2.0, Copyright The Rust Project Developers); do not edit.\n")
    f.write("//\n")
    f.write("// Runs of code points: 6 hex digits of the run's first code point, then\n")
    f.write("// 6 of the packed value width | info << 2 | flags << 18 (see uwidth.ts).\n\n")
    f.write("export const RS_UWIDTH_RUNS: string =\n")
    for i in range(0, len(runs), 8):
        end = ";\n" if i + 8 >= len(runs) else " +\n"
        f.write('  "' + "".join(runs[i : i + 8]) + '"' + end)
print("uwidth_table.ts: %d runs" % len(runs))
