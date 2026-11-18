// The project around a Dart file, read as `dart format` reads it: the
// language version from the package config around the file, and the page
// width and trailing-comma mode from the nearest analysis_options.yaml.
//
// Ported from dart_style 3.1.14-wip at 5a9534fad9ff, the commit Dart SDK
// 3.14.1 pins: lib/src/config_cache.dart and lib/src/analysis_options/
// (BSD-3-Clause, Copyright the Dart project authors). Also ported, from
// dart-lang/tools at d87eaf7946e7 (the revision SDK 3.14.1's DEPS pins),
// both BSD-3-Clause, Copyright the Dart project authors: package_config
// 3.0.1-wip (findPackageConfig, the package_config.json parse and its
// checks, packageOf and resolve) and yaml 3.2.0-wip (its scalar types and
// the subset of YAML analysis options use).
//
// Wherever dart format would warn and fall back to its defaults, and
// wherever this reader cannot follow a file exactly (YAML or a URI form it
// does not take), the answer is false and the Dart file is left untouched.

/** One file's project settings. */
export class DtFileConfig {
  /** The package's language version, or -1: no package, the newest. */
  verMajor: i32 = -1;
  verMinor: i32 = -1;
  /** `formatter: page_width`, else dart_style's default, 80. */
  pageWidth: i32 = 80;
  /** Why the project could not be read, when it could not. */
  why: string = "";
  constructor() {}
}

// The cache, one per process. Every file is formatted in a region of its
// own, so what outlives a file is module storage: an open-addressed table of
// keys (bytes in DTC_POOL) with four numbers each, and the packages of each
// package config read. Keys start with a tag: `D` a directory's answer
// (keyed, as ConfigCache is, by the file's parent path as written), `C` a
// package config file, `Y` an analysis options file read with a given
// package config. A full table only stops caching; the answers are the same.
const DTC_SLOTS: i32 = 65536;
const DTC_POOL_BYTES: i32 = 8388608;
const DTC_PKGS: i32 = 65536;
const DTC_KOFF = new Int32Array(DTC_SLOTS);
const DTC_KLEN = new Int32Array(DTC_SLOTS);
const DTC_VAL = new Int32Array(DTC_SLOTS * 4);
const DTC_POOL = new Array<u8>(DTC_POOL_BYTES);
// Per package: root, package URI root and name (offset, length in the pool each), major, minor.
const DTC_PKG = new Int32Array(DTC_PKGS * 8);
/** [0] pool bytes used, [1] slots used, [2] packages kept, [3] and [4] the working directory's offset and length + 1 in the pool. */
const DTC_META = new Int32Array(8);

const dtcHash = (k: string): i32 => {
  let h = 5381;
  for (let i = 0; i < toI32(k.length); i++) {
    h = ((h * 33) ^ k.charCodeAt(i)) & 16777215;
  }
  return h & (DTC_SLOTS - 1);
};

/** The slot holding `k`, or -1. */
const dtcFind = (k: string): i32 => {
  const n = toI32(k.length);
  let s = dtcHash(k);
  for (let probe = 0; probe < DTC_SLOTS; probe++) {
    const len = DTC_KLEN[s];
    if (len === 0) {
      return -1;
    }
    if (len === n) {
      const off = DTC_KOFF[s];
      let same = true;
      for (let i = 0; i < n; i++) {
        if (toI32(DTC_POOL[off + i]) !== k.charCodeAt(i)) {
          same = false;
          break;
        }
      }
      if (same) {
        return s;
      }
    }
    s = (s + 1) & (DTC_SLOTS - 1);
  }
  return -1;
};

/** Copies `s` into the pool; its offset, or -1 when the pool is full. */
const dtcKeep = (s: string): i32 => {
  const n = toI32(s.length);
  const off = DTC_META[0];
  if (n > DTC_POOL_BYTES - off) {
    return -1;
  }
  for (let i = 0; i < n; i++) {
    DTC_POOL[off + i] = toU8(s.charCodeAt(i));
  }
  DTC_META[0] = off + n;
  return off;
};

const dtcString = (off: i32, len: i32): string => {
  const b = new Array<u8>(len);
  for (let i = 0; i < len; i++) {
    b[i] = DTC_POOL[off + i];
  }
  return String.fromBytes(b, 0, len);
};

const dtcPut = (k: string, a: i32, b: i32, c: i32, d: i32): void => {
  if (DTC_META[1] >= DTC_SLOTS / 2) {
    return;
  }
  const off = dtcKeep(k);
  if (off < 0) {
    return;
  }
  let s = dtcHash(k);
  while (DTC_KLEN[s] !== 0) {
    s = (s + 1) & (DTC_SLOTS - 1);
  }
  DTC_KOFF[s] = off;
  DTC_KLEN[s] = toI32(k.length);
  DTC_VAL[4 * s] = a;
  DTC_VAL[4 * s + 1] = b;
  DTC_VAL[4 * s + 2] = c;
  DTC_VAL[4 * s + 3] = d;
  DTC_META[1] = DTC_META[1] + 1;
};

// Paths. Two path libraries meet here and they differ: dart:io's
// File.parent and absolute work on the string as written (the package
// config is looked for that way), Uri.file removes dot segments (packageOf
// compares those), and package:path's normalize and dirname (the
// analysis_options.yaml walk) also drop empty segments.

/** FileSystemEntity.parentOf on POSIX: the path up to its last separator run. */
const dtParentOf = (p: string): string => {
  const n = toI32(p.length);
  let pos = -1;
  for (let i = 0; i + 1 < n; i++) {
    if (p.charCodeAt(i) !== 47 && p.charCodeAt(i + 1) === 47) {
      let j = i + 1;
      while (j < n && p.charCodeAt(j) === 47) {
        j++;
      }
      if (j < n) {
        pos = i;
      }
    }
  }
  const rootEnd = n > 0 && p.charCodeAt(0) === 47 ? 0 : -1;
  if (pos > rootEnd) {
    return p.substring(0, pos + 1);
  }
  if (rootEnd > -1) {
    return "/";
  }
  return ".";
};

/** Uri's _removeDotSegments, on an absolute path. */
const dtRemoveDots = (p: string): string => {
  const out: string[] = [];
  let appendSlash = false;
  const n = toI32(p.length);
  let a = 0;
  for (let i = 0; i <= n; i++) {
    if (i < n && p.charCodeAt(i) !== 47) {
      continue;
    }
    const seg = p.substring(a, i);
    a = i + 1;
    appendSlash = false;
    if (seg === "..") {
      if (out.length !== 0) {
        out.pop();
        if (out.length === 0) {
          out.push("");
        }
      }
      appendSlash = true;
    } else if (seg === ".") {
      appendSlash = true;
    } else {
      out.push(seg);
    }
  }
  if (appendSlash) {
    out.push("");
  }
  return out.join("/");
};

/** package:path's normalize of an absolute POSIX path. */
const dtNormalize = (p: string): string => {
  const out: string[] = [];
  const n = toI32(p.length);
  let a = 0;
  for (let i = 0; i <= n; i++) {
    if (i < n && p.charCodeAt(i) !== 47) {
      continue;
    }
    const seg = p.substring(a, i);
    a = i + 1;
    if (seg === "" || seg === ".") {
      continue;
    }
    if (seg === "..") {
      if (out.length !== 0) {
        out.pop();
      }
      continue;
    }
    out.push(seg);
  }
  return `/${out.join("/")}`;
};

/** package:path's dirname of a normalized absolute path. */
const dtDirname = (p: string): string => {
  let i = toI32(p.length) - 1;
  while (i > 0 && p.charCodeAt(i) !== 47) {
    i--;
  }
  return i <= 0 ? "/" : p.substring(0, i);
};

/** package:path's join of two parts; also dart:io's FileSystemEntity.absolute, `dtJoin(cwd, p)`, which resolves nothing. */
const dtJoin = (a: string, b: string): string => {
  if (b.startsWith("/")) {
    return b;
  }
  return a.endsWith("/") ? a + b : `${a}/${b}`;
};

/** File.exists: there, and not a directory. */
const dtIsFile = (p: string): boolean => {
  // statMtimeSync answers NaN for a path it cannot stat.
  const m = statMtimeSync(p);
  // biome-ignore lint/suspicious/noSelfCompare: the NaN test Nish documents.
  return m === m && !isDirectorySync(p);
};

// Values: what JSON and YAML read into, and what analysis options merge.

const DTV_NULL: i32 = 0;
const DTV_BOOL: i32 = 1;
const DTV_INT: i32 = 2;
const DTV_FLOAT: i32 = 3;
const DTV_STR: i32 = 4;
const DTV_LIST: i32 = 5;
const DTV_MAP: i32 = 6;

class DtVal {
  kind: i32;
  s: string = "";
  /** A bool's 0 or 1; an int's value, or -1 when it is negative or past 10^9. */
  n: i32 = 0;
  items: DtVal[];
  keys: string[];
  constructor(kind: i32) {
    this.kind = kind;
    this.items = [];
    this.keys = [];
  }
}

const dtValStr = (s: string): DtVal => {
  const v = new DtVal(DTV_STR);
  v.s = s;
  return v;
};

/** A map's value for `key`, or null. */
const dtValGet = (m: DtVal, key: string): DtVal | null => {
  for (let i = 0; i < toI32(m.keys.length); i++) {
    if (m.keys[i] === key) {
      return m.items[i];
    }
  }
  return null;
};

const dtValHas = (m: DtVal, key: string): boolean => dtValGet(m, key) !== null;

/** Valid UTF-8, with no byte-order mark: Dart's UTF-8 decoder would otherwise fail or differ. */
const dtUtf8Ok = (b: u8[], n: i32): boolean => {
  if (n >= 3 && toI32(b[0]) === 0xef && toI32(b[1]) === 0xbb && toI32(b[2]) === 0xbf) {
    return false;
  }
  let i = 0;
  while (i < n) {
    const c = toI32(b[i]);
    if (c < 0x80) {
      i++;
      continue;
    }
    let k = 0;
    let lo = 0x80;
    let hi = 0xbf;
    if (c >= 0xc2 && c <= 0xdf) {
      k = 1;
    } else if (c >= 0xe0 && c <= 0xef) {
      k = 2;
      if (c === 0xe0) {
        lo = 0xa0;
      } else if (c === 0xed) {
        hi = 0x9f;
      }
    } else if (c >= 0xf0 && c <= 0xf4) {
      k = 3;
      if (c === 0xf0) {
        lo = 0x90;
      } else if (c === 0xf4) {
        hi = 0x8f;
      }
    } else {
      return false;
    }
    for (let j = 1; j <= k; j++) {
      if (i + j >= n) {
        return false;
      }
      const d = toI32(b[i + j]);
      if (d < (j === 1 ? lo : 0x80) || d > (j === 1 ? hi : 0xbf)) {
        return false;
      }
    }
    i += k + 1;
  }
  return true;
};

// JSON, as dart:convert decodes it. Only what package_config reads is kept
// apart; anything a strict reading would doubt (a duplicate key, a \u escape
// of a surrogate) fails.

class DtJson {
  b: u8[];
  n: i32;
  p: i32 = 0;
  failed: boolean = false;
  constructor(b: u8[], n: i32) {
    this.b = b;
    this.n = n;
  }

  at(i: i32): i32 {
    return i < this.n ? toI32(this.b[i]) : -1;
  }

  ws(): void {
    while (this.p < this.n) {
      const c = toI32(this.b[this.p]);
      if (c !== 32 && c !== 9 && c !== 10 && c !== 13) {
        return;
      }
      this.p = this.p + 1;
    }
  }

  fail(): DtVal {
    this.failed = true;
    return new DtVal(DTV_NULL);
  }

  value(depth: i32): DtVal {
    if (depth > 64) {
      return this.fail();
    }
    this.ws();
    const c = this.at(this.p);
    if (c === 123) {
      const m = new DtVal(DTV_MAP);
      this.p = this.p + 1;
      this.ws();
      if (this.at(this.p) === 125) {
        this.p = this.p + 1;
        return m;
      }
      while (!this.failed) {
        this.ws();
        if (this.at(this.p) !== 34) {
          return this.fail();
        }
        const k = this.str();
        if (this.failed || dtValHas(m, k)) {
          return this.fail();
        }
        this.ws();
        if (this.at(this.p) !== 58) {
          return this.fail();
        }
        this.p = this.p + 1;
        const v = this.value(depth + 1);
        m.keys.push(k);
        m.items.push(v);
        this.ws();
        const d = this.at(this.p);
        this.p = this.p + 1;
        if (d === 125) {
          return m;
        }
        if (d !== 44) {
          return this.fail();
        }
      }
      return m;
    }
    if (c === 91) {
      const l = new DtVal(DTV_LIST);
      this.p = this.p + 1;
      this.ws();
      if (this.at(this.p) === 93) {
        this.p = this.p + 1;
        return l;
      }
      while (!this.failed) {
        l.items.push(this.value(depth + 1));
        this.ws();
        const d = this.at(this.p);
        this.p = this.p + 1;
        if (d === 93) {
          return l;
        }
        if (d !== 44) {
          return this.fail();
        }
      }
      return l;
    }
    if (c === 34) {
      return dtValStr(this.str());
    }
    if (this.word("true")) {
      const v = new DtVal(DTV_BOOL);
      v.n = 1;
      return v;
    }
    if (this.word("false")) {
      return new DtVal(DTV_BOOL);
    }
    if (this.word("null")) {
      return new DtVal(DTV_NULL);
    }
    return this.num();
  }

  word(w: string): boolean {
    const k = toI32(w.length);
    for (let i = 0; i < k; i++) {
      if (this.at(this.p + i) !== w.charCodeAt(i)) {
        return false;
      }
    }
    this.p = this.p + k;
    return true;
  }

  /** A JSON number: an int when it has no fraction or exponent. */
  num(): DtVal {
    let neg = false;
    if (this.at(this.p) === 45) {
      neg = true;
      this.p = this.p + 1;
    }
    const ds = this.p;
    if (this.at(this.p) === 48) {
      this.p = this.p + 1;
    } else {
      while (this.at(this.p) >= 48 && this.at(this.p) <= 57) {
        this.p = this.p + 1;
      }
    }
    if (this.p === ds) {
      return this.fail();
    }
    const de = this.p;
    let isInt = true;
    if (this.at(this.p) === 46) {
      isInt = false;
      this.p = this.p + 1;
      const fs = this.p;
      while (this.at(this.p) >= 48 && this.at(this.p) <= 57) {
        this.p = this.p + 1;
      }
      if (this.p === fs) {
        return this.fail();
      }
    }
    if (this.at(this.p) === 101 || this.at(this.p) === 69) {
      isInt = false;
      this.p = this.p + 1;
      if (this.at(this.p) === 43 || this.at(this.p) === 45) {
        this.p = this.p + 1;
      }
      const es = this.p;
      while (this.at(this.p) >= 48 && this.at(this.p) <= 57) {
        this.p = this.p + 1;
      }
      if (this.p === es) {
        return this.fail();
      }
    }
    if (!isInt) {
      return new DtVal(DTV_FLOAT);
    }
    const v = new DtVal(DTV_INT);
    v.n = -1;
    if (!neg && de - ds <= 9) {
      let x = 0;
      for (let i = ds; i < de; i++) {
        x = x * 10 + toI32(this.b[i]) - 48;
      }
      v.n = x;
    }
    return v;
  }

  /** A string at `p` (its opening quote), decoded to UTF-8. */
  str(): string {
    this.p = this.p + 1;
    const out = new Array<u8>(0);
    while (true) {
      const c = this.at(this.p);
      if (c < 0) {
        this.failed = true;
        return "";
      }
      if (c === 34) {
        this.p = this.p + 1;
        break;
      }
      if (c < 32) {
        this.failed = true;
        return "";
      }
      if (c !== 92) {
        out.push(toU8(c));
        this.p = this.p + 1;
        continue;
      }
      const e = this.at(this.p + 1);
      this.p = this.p + 2;
      if (e === 34 || e === 92 || e === 47) {
        out.push(toU8(e));
      } else if (e === 98) {
        out.push(toU8(8));
      } else if (e === 102) {
        out.push(toU8(12));
      } else if (e === 110) {
        out.push(toU8(10));
      } else if (e === 114) {
        out.push(toU8(13));
      } else if (e === 116) {
        out.push(toU8(9));
      } else if (e === 117) {
        let u = 0;
        for (let i = 0; i < 4; i++) {
          const h = this.at(this.p + i);
          let d = -1;
          if (h >= 48 && h <= 57) {
            d = h - 48;
          } else if (h >= 97 && h <= 102) {
            d = h - 87;
          } else if (h >= 65 && h <= 70) {
            d = h - 55;
          }
          if (d < 0) {
            this.failed = true;
            return "";
          }
          u = u * 16 + d;
        }
        this.p = this.p + 4;
        if (u >= 0xd800 && u <= 0xdfff) {
          this.failed = true;
          return "";
        }
        if (u < 0x80) {
          out.push(toU8(u));
        } else if (u < 0x800) {
          out.push(toU8(0xc0 | (u >> 6)));
          out.push(toU8(0x80 | (u & 63)));
        } else {
          out.push(toU8(0xe0 | (u >> 12)));
          out.push(toU8(0x80 | ((u >> 6) & 63)));
          out.push(toU8(0x80 | (u & 63)));
        }
      } else {
        this.failed = true;
        return "";
      }
    }
    return String.fromBytes(out, 0, toI32(out.length));
  }
}

// YAML: the subset analysis options are written in. Block mappings and
// sequences, plain and quoted one-line scalars, one-line flow collections,
// comments and a leading `---`. Anchors, tags, block scalars, multi-line
// scalars, escapes, directives, tabs, complex and non-string keys fail, as
// does anything package:yaml would reject (a duplicate key, a bad indent).

class DtYaml {
  b: u8[];
  n: i32;
  ls: i32[];
  le: i32[];
  /** The line's indent, or -1 for a blank or comment line. */
  ind: i32[];
  cur: i32 = 0;
  /** The end of the last inline value parsed. */
  pos: i32 = 0;
  failed: boolean = false;
  constructor(b: u8[], n: i32) {
    this.b = b;
    this.n = n;
    this.ls = [];
    this.le = [];
    this.ind = [];
  }

  at(i: i32): i32 {
    return i >= 0 && i < this.n ? toI32(this.b[i]) : -1;
  }

  fail(): DtVal {
    this.failed = true;
    return new DtVal(DTV_NULL);
  }

  /** Splits the lines; false when a byte rules the file out. */
  lines(): boolean {
    let a = 0;
    for (let i = 0; i <= this.n; i++) {
      const c = i < this.n ? toI32(this.b[i]) : 10;
      if (c === 13) {
        if (i + 1 >= this.n || toI32(this.b[i + 1]) !== 10) {
          return false;
        }
        continue;
      }
      if (c === 9 || (c < 32 && c !== 10) || c === 127) {
        return false;
      }
      if (c !== 10) {
        continue;
      }
      let e = i;
      if (e > a && toI32(this.b[e - 1]) === 13) {
        e--;
      }
      let k = a;
      while (k < e && toI32(this.b[k]) === 32) {
        k++;
      }
      this.ls.push(a);
      this.le.push(e);
      this.ind.push(k === e || toI32(this.b[k]) === 35 ? -1 : k - a);
      a = i + 1;
    }
    return true;
  }

  next(k: i32): i32 {
    let j = k;
    while (j < toI32(this.ind.length) && this.ind[j] < 0) {
      j++;
    }
    return j < toI32(this.ind.length) ? j : -1;
  }

  /** Whether (line, col) starts a `- ` sequence entry. */
  dash(k: i32, p: i32): boolean {
    return this.at(p) === 45 && (p + 1 === this.le[k] || this.at(p + 1) === 32);
  }

  /** The rest of a line after a value: blank, or a comment after a space. */
  rest(p: i32, e: i32): boolean {
    let i = p;
    while (i < e && this.at(i) === 32) {
      i++;
    }
    return i === e || (this.at(i) === 35 && i > p);
  }

  doc(): DtVal {
    if (!this.lines()) {
      return this.fail();
    }
    let k = this.next(0);
    for (let j = 0; j < toI32(this.ind.length); j++) {
      const a = this.ls[j];
      const e = this.le[j];
      const c = this.at(a);
      if (c === 37) {
        return this.fail();
      }
      if (e - a >= 3 && (c === 45 || c === 46) && this.at(a + 1) === c && this.at(a + 2) === c) {
        if (j !== k || c === 46 || !this.rest(a + 3, e) || (e > a + 3 && this.at(a + 3) !== 32)) {
          return this.fail();
        }
      }
    }
    if (
      k >= 0 &&
      this.ind[k] === 0 &&
      this.at(this.ls[k]) === 45 &&
      this.at(this.ls[k] + 1) === 45 &&
      this.at(this.ls[k] + 2) === 45
    ) {
      k = this.next(k + 1);
    }
    if (k < 0) {
      return new DtVal(DTV_NULL);
    }
    const v = this.block(k, this.ls[k] + this.ind[k], -1);
    if (!this.failed && this.next(this.cur) >= 0) {
      return this.fail();
    }
    return v;
  }

  /** The block node at offset `p` of line `k`, inside a parent indented `parent`. */
  block(k: i32, p: i32, parent: i32): DtVal {
    const col = p - this.ls[k];
    if (this.dash(k, p)) {
      return this.seq(k, col);
    }
    if (this.isKey(k, p)) {
      return this.map(k, col);
    }
    const v = this.inline(p, this.le[k], false);
    if (this.failed || !this.rest(this.pos, this.le[k])) {
      return this.fail();
    }
    this.cur = k + 1;
    const k2 = this.next(this.cur);
    if (k2 >= 0 && this.ind[k2] > parent) {
      return this.fail();
    }
    return v;
  }

  seq(line: i32, col: i32): DtVal {
    const l = new DtVal(DTV_LIST);
    let k = line;
    while (!this.failed) {
      const p = this.ls[k] + col;
      let r = p + 1;
      while (r < this.le[k] && this.at(r) === 32) {
        r++;
      }
      if (r === this.le[k] || this.at(r) === 35) {
        this.cur = k + 1;
        const k2 = this.next(this.cur);
        if (k2 >= 0 && this.ind[k2] > col) {
          l.items.push(this.block(k2, this.ls[k2] + this.ind[k2], col));
        } else {
          l.items.push(new DtVal(DTV_NULL));
        }
      } else {
        l.items.push(this.block(k, r, col));
      }
      if (this.failed) {
        break;
      }
      k = this.next(this.cur);
      if (k < 0 || this.ind[k] < col) {
        break;
      }
      if (this.ind[k] > col) {
        return this.fail();
      }
      if (!this.dash(k, this.ls[k] + col)) {
        break;
      }
    }
    return l;
  }

  map(line: i32, col: i32): DtVal {
    const m = new DtVal(DTV_MAP);
    let k = line;
    let p = this.ls[k] + col;
    while (!this.failed) {
      const key = this.key(p, this.le[k]);
      if (this.failed) {
        break;
      }
      if (dtValHas(m, key)) {
        return this.fail();
      }
      let r = this.pos;
      while (r < this.le[k] && this.at(r) === 32) {
        r++;
      }
      let v = new DtVal(DTV_NULL);
      if (r === this.le[k] || this.at(r) === 35) {
        this.cur = k + 1;
        const k2 = this.next(this.cur);
        if (k2 >= 0 && this.ind[k2] > col) {
          v = this.block(k2, this.ls[k2] + this.ind[k2], col);
        } else if (k2 >= 0 && this.ind[k2] === col && this.dash(k2, this.ls[k2] + col)) {
          v = this.seq(k2, col);
        }
      } else {
        if (this.dash(k, r)) {
          return this.fail();
        }
        v = this.inline(r, this.le[k], false);
        if (this.failed || !this.rest(this.pos, this.le[k])) {
          return this.fail();
        }
        this.cur = k + 1;
        const k2 = this.next(this.cur);
        if (k2 >= 0 && this.ind[k2] > col) {
          return this.fail();
        }
      }
      if (this.failed) {
        break;
      }
      m.keys.push(key);
      m.items.push(v);
      k = this.next(this.cur);
      if (k < 0 || this.ind[k] < col) {
        break;
      }
      if (this.ind[k] > col) {
        return this.fail();
      }
      p = this.ls[k] + col;
      if (this.dash(k, p)) {
        break;
      }
    }
    return m;
  }

  /** Whether a mapping key starts at `p` of line `k`. */
  isKey(k: i32, p: i32): boolean {
    const e = this.le[k];
    const c = this.at(p);
    if (c === 34 || c === 39) {
      let i = p + 1;
      while (i < e) {
        const d = this.at(i);
        if (d === c) {
          if (c === 39 && this.at(i + 1) === 39) {
            i += 2;
            continue;
          }
          break;
        }
        i++;
      }
      if (i >= e) {
        return false;
      }
      i++;
      while (i < e && this.at(i) === 32) {
        i++;
      }
      return this.at(i) === 58 && (i + 1 === e || this.at(i + 1) === 32);
    }
    if (c === 91 || c === 123) {
      return false;
    }
    for (let i = p; i < e; i++) {
      const d = this.at(i);
      if (d === 58 && (i + 1 === e || this.at(i + 1) === 32)) {
        return true;
      }
      if (d === 35 && i > p && this.at(i - 1) === 32) {
        return false;
      }
    }
    return false;
  }

  /** The string key at `p`, leaving `pos` after its colon. */
  key(p: i32, e: i32): string {
    const c = this.at(p);
    if (c === 34 || c === 39) {
      const v = this.inline(p, e, false);
      let i = this.pos;
      while (i < e && this.at(i) === 32) {
        i++;
      }
      if (this.failed || this.at(i) !== 58) {
        this.failed = true;
        return "";
      }
      this.pos = i + 1;
      return v.s;
    }
    let i = p;
    while (i < e && !(this.at(i) === 58 && (i + 1 === e || this.at(i + 1) === 32))) {
      i++;
    }
    let j = i;
    while (j > p && this.at(j - 1) === 32) {
      j--;
    }
    if (i >= e || j === p || !this.plainStart(p, e, false)) {
      this.failed = true;
      return "";
    }
    const v = dtYamlPlain(String.fromBytes(this.b, p, j));
    if (v.kind !== DTV_STR) {
      this.failed = true;
      return "";
    }
    this.pos = i + 1;
    return v.s;
  }

  /** Whether a plain scalar may start at `p`. */
  plainStart(p: i32, e: i32, flow: boolean): boolean {
    const c = this.at(p);
    if (
      c === 38 ||
      c === 42 ||
      c === 33 ||
      c === 124 ||
      c === 62 ||
      c === 37 ||
      c === 64 ||
      c === 96 ||
      c === 44 ||
      c === 91 ||
      c === 93 ||
      c === 123 ||
      c === 125 ||
      c === 35 ||
      c === 34 ||
      c === 39
    ) {
      return false;
    }
    if (c === 45 || c === 63 || c === 58) {
      const d = p + 1 < e ? this.at(p + 1) : -1;
      if (d === -1 || d === 32 || (flow && (d === 44 || d === 93 || d === 125 || d === 91 || d === 123))) {
        return false;
      }
    }
    return true;
  }

  /** A one-line scalar or flow collection at `p`, leaving `pos` after it. */
  inline(p: i32, e: i32, flow: boolean): DtVal {
    const c = this.at(p);
    if (c === 34) {
      let i = p + 1;
      while (i < e && this.at(i) !== 34) {
        if (this.at(i) === 92) {
          return this.fail();
        }
        i++;
      }
      if (i >= e) {
        return this.fail();
      }
      this.pos = i + 1;
      return dtValStr(String.fromBytes(this.b, p + 1, i));
    }
    if (c === 39) {
      const out = new Array<u8>(0);
      let i = p + 1;
      while (true) {
        if (i >= e) {
          return this.fail();
        }
        const d = this.at(i);
        if (d === 39) {
          if (i + 1 < e && this.at(i + 1) === 39) {
            out.push(toU8(39));
            i += 2;
            continue;
          }
          break;
        }
        out.push(toU8(d));
        i++;
      }
      this.pos = i + 1;
      return dtValStr(String.fromBytes(out, 0, toI32(out.length)));
    }
    if (c === 91 || c === 123) {
      return this.flowColl(p, e, 0);
    }
    if (!this.plainStart(p, e, flow)) {
      return this.fail();
    }
    let i = p;
    while (i < e) {
      const d = this.at(i);
      if (d === 58 && (i + 1 === e || this.at(i + 1) === 32 || (flow && this.at(i + 1) === 44))) {
        if (!flow) {
          return this.fail();
        }
        break;
      }
      if (d === 35 && this.at(i - 1) === 32) {
        if (flow) {
          return this.fail();
        }
        break;
      }
      if (flow && (d === 44 || d === 91 || d === 93 || d === 123 || d === 125)) {
        break;
      }
      i++;
    }
    let j = i;
    while (j > p && this.at(j - 1) === 32) {
      j--;
    }
    this.pos = j;
    const v = dtYamlPlain(String.fromBytes(this.b, p, j));
    if (v.kind < 0) {
      return this.fail();
    }
    return v;
  }

  sp(i: i32, e: i32): i32 {
    let j = i;
    while (j < e && this.at(j) === 32) {
      j++;
    }
    return j;
  }

  /** A `[...]` or `{...}` closed on its line. */
  flowColl(p: i32, e: i32, depth: i32): DtVal {
    if (depth > 32) {
      return this.fail();
    }
    const isMap = this.at(p) === 123;
    const close = isMap ? 125 : 93;
    const v = new DtVal(isMap ? DTV_MAP : DTV_LIST);
    let i = this.sp(p + 1, e);
    if (this.at(i) === close) {
      this.pos = i + 1;
      return v;
    }
    while (!this.failed) {
      let key = "";
      if (isMap) {
        const kv = this.flowItem(i, e, depth);
        if (this.failed || kv.kind !== DTV_STR || dtValHas(v, kv.s)) {
          return this.fail();
        }
        key = kv.s;
        i = this.sp(this.pos, e);
        if (this.at(i) !== 58 || this.at(i + 1) !== 32) {
          return this.fail();
        }
        i = this.sp(i + 1, e);
      }
      const item = this.flowItem(i, e, depth);
      if (this.failed) {
        break;
      }
      i = this.sp(this.pos, e);
      if (!isMap && this.at(i) === 58) {
        return this.fail();
      }
      if (isMap) {
        v.keys.push(key);
      }
      v.items.push(item);
      const d = this.at(i);
      if (d === close) {
        this.pos = i + 1;
        return v;
      }
      if (d !== 44) {
        return this.fail();
      }
      i = this.sp(i + 1, e);
      if (this.at(i) === close || i >= e) {
        return this.fail();
      }
    }
    return v;
  }

  flowItem(i: i32, e: i32, depth: i32): DtVal {
    const c = this.at(i);
    if (i >= e) {
      return this.fail();
    }
    if (c === 91 || c === 123) {
      return this.flowColl(i, e, depth + 1);
    }
    return this.inline(i, e, true);
  }
}

/** A plain scalar's value, as package:yaml's loader types it; kind -1 when this reader is unsure. */
const dtYamlPlain = (s: string): DtVal => {
  const n = toI32(s.length);
  if (s === "~" || s === "null" || s === "Null" || s === "NULL") {
    return new DtVal(DTV_NULL);
  }
  if (s === "true" || s === "True" || s === "TRUE") {
    const v = new DtVal(DTV_BOOL);
    v.n = 1;
    return v;
  }
  if (s === "false" || s === "False" || s === "FALSE") {
    return new DtVal(DTV_BOOL);
  }
  const c0 = s.charCodeAt(0);
  const c1 = n > 1 ? s.charCodeAt(1) : -1;
  const digit0 = c0 >= 48 && c0 <= 57;
  const sign0 = c0 === 43 || c0 === 45;
  const digit1 = c1 >= 48 && c1 <= 57;
  if (digit0 || (sign0 && digit1)) {
    if (c0 === 48 && c1 === 120) {
      // int.tryParse("0x..."), else a string.
      return dtYamlRadix(s, 2, 16);
    }
    if (c0 === 48 && c1 === 111) {
      // int.tryParse(rest, radix: 8), which would also take a sign: not followed.
      const d = n > 2 ? s.charCodeAt(2) : -1;
      if (d === 43 || d === 45) {
        return new DtVal(-1);
      }
      return dtYamlRadix(s, 2, 8);
    }
    // int.tryParse(radix: 10), else double.tryParse, else a string.
    let i = sign0 ? 1 : 0;
    while (i < n - 1 && s.charCodeAt(i) === 48) {
      i++;
    }
    const ds = i;
    while (i < n && s.charCodeAt(i) >= 48 && s.charCodeAt(i) <= 57) {
      i++;
    }
    if (i === n) {
      const digits = n - ds;
      const max = c0 === 45 ? "9223372036854775808" : "9223372036854775807";
      if (digits > 19 || (digits === 19 && dtDigitsAbove(s, ds, max))) {
        // Past a 64-bit int: double.tryParse takes it.
        return new DtVal(DTV_FLOAT);
      }
      const v = new DtVal(DTV_INT);
      v.n = -1;
      if (c0 !== 45 && digits <= 9) {
        let x = 0;
        for (let j = ds; j < n; j++) {
          x = x * 10 + s.charCodeAt(j) - 48;
        }
        v.n = x;
      }
      return v;
    }
    return dtYamlFloat(s) ? new DtVal(DTV_FLOAT) : dtValStr(s);
  }
  if ((c0 === 46 && digit1) || (sign0 && c1 === 46)) {
    if (s === "+.inf" || s === "+.Inf" || s === "+.INF" || s === "-.inf" || s === "-.Inf" || s === "-.INF") {
      return new DtVal(DTV_FLOAT);
    }
    return dtYamlFloat(s) ? new DtVal(DTV_FLOAT) : dtValStr(s);
  }
  if (n === 4 && c0 === 46) {
    if (s === ".inf" || s === ".Inf" || s === ".INF" || s === ".nan" || s === ".NaN" || s === ".NAN") {
      return new DtVal(DTV_FLOAT);
    }
  }
  return dtValStr(s);
};

/** Whether the 19 digits of `s` from `ds` are above `max`, 19 digits too. */
const dtDigitsAbove = (s: string, ds: i32, max: string): boolean => {
  for (let i = 0; i < 19; i++) {
    const a = s.charCodeAt(ds + i);
    const b = max.charCodeAt(i);
    if (a !== b) {
      return a > b;
    }
  }
  return false;
};

/** int.tryParse of the digits after `s`'s prefix in `radix` (16 or 8): an int, a string when they are not digits, unsure past 64 bits. */
const dtYamlRadix = (s: string, from: i32, radix: i32): DtVal => {
  const n = toI32(s.length);
  if (n === from) {
    return dtValStr(s);
  }
  let x = 0;
  let big = false;
  let i = from;
  while (i < n - 1 && s.charCodeAt(i) === 48) {
    i++;
  }
  const ds = i;
  for (let j = from; j < n; j++) {
    const c = s.charCodeAt(j);
    let d = -1;
    if (c >= 48 && c <= 57) {
      d = c - 48;
    } else if (radix === 16 && c >= 97 && c <= 102) {
      d = c - 87;
    } else if (radix === 16 && c >= 65 && c <= 70) {
      d = c - 55;
    }
    if (d < 0 || d >= radix) {
      return dtValStr(s);
    }
    if (j >= ds && !big) {
      if (x >= 100000000) {
        big = true;
      } else {
        x = x * radix + d;
      }
    }
  }
  if ((radix === 16 && n - ds > 15) || (radix === 8 && n - ds > 20)) {
    return new DtVal(-1);
  }
  const v = new DtVal(DTV_INT);
  v.n = big ? -1 : x;
  return v;
};

/** `[+-]? (d+ (. d*)? | . d+) ([eE] [+-]? d+)?`, which double.tryParse takes. */
const dtYamlFloat = (s: string): boolean => {
  const n = toI32(s.length);
  let i = 0;
  if (i < n && (s.charCodeAt(i) === 43 || s.charCodeAt(i) === 45)) {
    i++;
  }
  const a = i;
  while (i < n && s.charCodeAt(i) >= 48 && s.charCodeAt(i) <= 57) {
    i++;
  }
  let digits = i - a;
  if (i < n && s.charCodeAt(i) === 46) {
    i++;
    const f = i;
    while (i < n && s.charCodeAt(i) >= 48 && s.charCodeAt(i) <= 57) {
      i++;
    }
    digits += i - f;
  }
  if (digits === 0) {
    return false;
  }
  if (i < n && (s.charCodeAt(i) === 101 || s.charCodeAt(i) === 69)) {
    i++;
    if (i < n && (s.charCodeAt(i) === 43 || s.charCodeAt(i) === 45)) {
      i++;
    }
    const x = i;
    while (i < n && s.charCodeAt(i) >= 48 && s.charCodeAt(i) <= 57) {
      i++;
    }
    if (i === x) {
      return false;
    }
  }
  return i === n;
};

// merge_options.dart.

/** Whether every item (a list's elements, a map's values) is of `kind`: isAllStrings, isToBools. */
const dtAllKind = (v: DtVal, kind: i32): boolean => {
  for (const x of v.items) {
    if (x.kind !== kind) {
      return false;
    }
  }
  return true;
};

const dtPromote = (l: DtVal): DtVal => {
  const m = new DtVal(DTV_MAP);
  for (const x of l.items) {
    if (!dtValHas(m, x.s)) {
      const t = new DtVal(DTV_BOOL);
      t.n = 1;
      m.keys.push(x.s);
      m.items.push(t);
    }
  }
  return m;
};

const dtMerge = (d: DtVal, o: DtVal): DtVal => {
  if (d.kind === DTV_LIST && dtAllKind(d, DTV_STR) && o.kind === DTV_MAP && dtAllKind(o, DTV_BOOL)) {
    return dtMerge(dtPromote(d), o);
  }
  if (d.kind === DTV_MAP && dtAllKind(d, DTV_BOOL) && o.kind === DTV_LIST && dtAllKind(o, DTV_STR)) {
    return dtMerge(d, dtPromote(o));
  }
  if (d.kind === DTV_MAP && o.kind === DTV_MAP) {
    const m = new DtVal(DTV_MAP);
    for (let i = 0; i < toI32(d.keys.length); i++) {
      m.keys.push(d.keys[i]);
      m.items.push(d.items[i]);
    }
    for (let i = 0; i < toI32(o.keys.length); i++) {
      let at = -1;
      for (let j = 0; j < toI32(m.keys.length); j++) {
        if (m.keys[j] === o.keys[i]) {
          at = j;
          break;
        }
      }
      if (at >= 0) {
        m.items[at] = dtMerge(m.items[at], o.items[i]);
      } else {
        m.keys.push(o.keys[i]);
        m.items.push(o.items[i]);
      }
    }
    return m;
  }
  if (d.kind === DTV_LIST && o.kind === DTV_LIST) {
    // Only a list's kind and whether it is all strings reach the formatter.
    const l = new DtVal(DTV_LIST);
    for (const x of d.items) {
      l.items.push(x);
    }
    for (const x of o.items) {
      l.items.push(x);
    }
    return l;
  }
  if (o.kind === DTV_NULL) {
    return d;
  }
  return o;
};

// package_config.

class DtPkgs {
  /** Normalized paths, each ending in `/`. */
  roots: string[];
  purs: string[];
  names: string[];
  maj: i32[];
  min: i32[];
  constructor() {
    this.roots = [];
    this.purs = [];
    this.names = [];
    this.maj = [];
    this.min = [];
  }
}

/** Characters a URI reference may hold here: no escapes, queries, fragments or colons. */
const dtUriSafe = (s: string): boolean => {
  for (let i = 0; i < toI32(s.length); i++) {
    const c = s.charCodeAt(i);
    const ok =
      (c >= 97 && c <= 122) ||
      (c >= 65 && c <= 90) ||
      (c >= 48 && c <= 57) ||
      c === 45 ||
      c === 46 ||
      c === 95 ||
      c === 126 ||
      c === 47 ||
      c === 43;
    if (!ok) {
      return false;
    }
  }
  return true;
};

/** checkPackageName: only these characters, and not only dots. */
const dtPackageName = (s: string): boolean => {
  let nonDot = false;
  for (let i = 0; i < toI32(s.length); i++) {
    const c = s.charCodeAt(i);
    const ok =
      (c >= 97 && c <= 122) ||
      (c >= 65 && c <= 90) ||
      (c >= 48 && c <= 57) ||
      c === 33 ||
      c === 36 ||
      (c >= 38 && c <= 46) ||
      c === 59 ||
      c === 61 ||
      c === 64 ||
      c === 95 ||
      c === 126;
    if (!ok) {
      return false;
    }
    if (c !== 46) {
      nonDot = true;
    }
  }
  return nonDot;
};

/** A URI reference (rootUri, packageUri) resolved on a directory path ending in `/`; "" when not taken. */
const dtResolveRef = (base: string, ref: string): string => {
  if (ref.startsWith("file:///")) {
    const rest = ref.substring(7);
    return dtUriSafe(rest) ? dtRemoveDots(rest) : "";
  }
  if (!dtUriSafe(ref) || ref.startsWith("//")) {
    return "";
  }
  if (ref.startsWith("/")) {
    return dtRemoveDots(ref);
  }
  if (ref.length === 0) {
    return base;
  }
  return dtRemoveDots(base + ref);
};

const dtSlash = (p: string): string => (p.endsWith("/") ? p : `${p}/`);

/** parseLanguageVersion: `major.minor`, decimal, no leading zeros; false on an error it reports. */
const dtLanguageVersion = (s: string, out: i32[]): boolean => {
  const n = toI32(s.length);
  let i = 0;
  for (let part = 0; part < 2; part++) {
    const a = i;
    let v = 0;
    while (i < n && s.charCodeAt(i) >= 48 && s.charCodeAt(i) <= 57) {
      v = v * 10 + s.charCodeAt(i) - 48;
      if (v > 100000000) {
        return false;
      }
      i++;
    }
    if (i === a || (s.charCodeAt(a) === 48 && i > a + 1)) {
      return false;
    }
    out[part] = v;
    if (part === 0) {
      if (i >= n || s.charCodeAt(i) !== 46) {
        return false;
      }
      i++;
    }
  }
  return i === n;
};

/** Parses a package_config.json whose path (dot segments removed) is `file`; null when dart format would report an error. */
const dtParsePackageConfig = (file: string, b: u8[], n: i32): DtPkgs | null => {
  if (!dtUtf8Ok(b, n)) {
    return null;
  }
  const j = new DtJson(b, n);
  const top = j.value(0);
  j.ws();
  if (j.failed || j.p !== n || top.kind !== DTV_MAP) {
    return null;
  }
  const ver = dtValGet(top, "configVersion");
  const list = dtValGet(top, "packages");
  if (ver === null || ver.kind !== DTV_INT || ver.n !== 2 || list === null || list.kind !== DTV_LIST) {
    return null;
  }
  const base = dtDirname(file);
  const baseDir = dtSlash(base);
  const ps = new DtPkgs();
  for (const e of list.items) {
    if (e.kind !== DTV_MAP) {
      return null;
    }
    const name = dtValGet(e, "name");
    const root = dtValGet(e, "rootUri");
    const pu = dtValGet(e, "packageUri");
    const lv = dtValGet(e, "languageVersion");
    if (name === null || name.kind !== DTV_STR || root === null || root.kind !== DTV_STR) {
      return null;
    }
    if ((pu !== null && pu.kind !== DTV_STR) || (lv !== null && lv.kind !== DTV_STR)) {
      return null;
    }
    if (!dtPackageName(name.s)) {
      return null;
    }
    const r = dtResolveRef(baseDir, root.s);
    if (r.length === 0) {
      return null;
    }
    const rootPath = dtSlash(r);
    let pur = rootPath;
    if (pu !== null) {
      if (pu.s.startsWith("/") || pu.s.startsWith("file:")) {
        return null;
      }
      const q = dtResolveRef(rootPath, pu.s);
      if (q.length === 0) {
        return null;
      }
      pur = dtSlash(q);
      if (!pur.startsWith(rootPath)) {
        return null;
      }
    }
    const v: i32[] = [-1, -1];
    if (lv !== null && !dtLanguageVersion(lv.s, v)) {
      return null;
    }
    ps.roots.push(rootPath);
    ps.purs.push(pur);
    ps.names.push(name.s);
    ps.maj.push(v[0]);
    ps.min.push(v[1]);
  }
  // SimplePackageConfig's checks: unique names, and TriePackageTree.add's
  // conflicts (the same root; a package whose root holds the package URI
  // root of a package around it).
  const k = toI32(ps.roots.length);
  for (let a = 0; a < k; a++) {
    for (let c = 0; c < k; c++) {
      if (a === c) {
        continue;
      }
      if (a < c && (ps.names[a] === ps.names[c] || ps.roots[a] === ps.roots[c])) {
        return null;
      }
      const outer = ps.roots[a];
      const inner = ps.roots[c];
      if (inner.length > outer.length && inner.startsWith(outer) && ps.purs[a].startsWith(inner)) {
        return null;
      }
    }
  }
  return ps;
};

/** The package config read from `file` (a `.dart_tool/package_config.json` that exists), from the cache when it was read before. */
const dtPackageConfig = (file: string): DtPkgs | null => {
  const key = `C${file}`;
  const s = dtcFind(key);
  if (s >= 0) {
    if (DTC_VAL[4 * s] !== 1) {
      return null;
    }
    const ps = new DtPkgs();
    for (let i = DTC_VAL[4 * s + 1]; i < DTC_VAL[4 * s + 1] + DTC_VAL[4 * s + 2]; i++) {
      ps.roots.push(dtcString(DTC_PKG[8 * i], DTC_PKG[8 * i + 1]));
      ps.purs.push(dtcString(DTC_PKG[8 * i + 2], DTC_PKG[8 * i + 3]));
      ps.names.push(dtcString(DTC_PKG[8 * i + 4], DTC_PKG[8 * i + 5]));
      ps.maj.push(DTC_PKG[8 * i + 6]);
      ps.min.push(DTC_PKG[8 * i + 7]);
    }
    return ps;
  }
  const read = readFileBytesSync(file);
  if (read === null) {
    dtcPut(key, 2, 0, 0, 0);
    return null;
  }
  const ps = dtParsePackageConfig(file, read, toI32(read.length));
  if (ps === null) {
    dtcPut(key, 2, 0, 0, 0);
    return null;
  }
  const count = toI32(ps.roots.length);
  const first = DTC_META[2];
  if (count <= DTC_PKGS - first) {
    let kept = true;
    for (let i = 0; i < count; i++) {
      const r = dtcKeep(ps.roots[i]);
      const u = dtcKeep(ps.purs[i]);
      const m = dtcKeep(ps.names[i]);
      if (r < 0 || u < 0 || m < 0) {
        kept = false;
        break;
      }
      const at = 8 * (first + i);
      DTC_PKG[at] = r;
      DTC_PKG[at + 1] = toI32(ps.roots[i].length);
      DTC_PKG[at + 2] = u;
      DTC_PKG[at + 3] = toI32(ps.purs[i].length);
      DTC_PKG[at + 4] = m;
      DTC_PKG[at + 5] = toI32(ps.names[i].length);
      DTC_PKG[at + 6] = ps.maj[i];
      DTC_PKG[at + 7] = ps.min[i];
    }
    if (kept) {
      DTC_META[2] = first + count;
      dtcPut(key, 1, first, count, 0);
    }
  }
  return ps;
};

/** TriePackageTree.packageOf: the package of a file URI's path, or -1. */
const dtPackageOf = (ps: DtPkgs, file: string): i32 => {
  let potential = -1;
  const n = toI32(file.length);
  for (let i = 0; i < n; i++) {
    if (file.charCodeAt(i) !== 47) {
      continue;
    }
    const dir = file.substring(0, i + 1);
    for (let k = 0; k < toI32(ps.roots.length); k++) {
      if (ps.roots[k] !== dir) {
        continue;
      }
      if (ps.purs[k] === ps.roots[k] || file.startsWith(ps.purs[k])) {
        return k;
      }
      potential = k;
    }
  }
  return potential;
};

/** findPackageConfig(file.parent): the nearest `.dart_tool/package_config.json`, as dart:io walks; "" when there is none. */
const dtFindPackageConfig = (dir: string, cwd: string): string => {
  let d = dtJoin(cwd, dir);
  if (!isDirectorySync(d)) {
    return "";
  }
  while (true) {
    const f = dtJoin(d, ".dart_tool/package_config.json");
    if (dtIsFile(f)) {
      return f;
    }
    const up = dtParentOf(d);
    if (up === d) {
      return "";
    }
    d = up;
  }
};

// analysis_options_file.dart.

class DtOptions {
  failed: boolean = false;
  why: string = "";
  /** The package config for `package:` includes, or null. */
  pkgs: DtPkgs | null = null;
  constructor() {}
}

const dtOptFail = (o: DtOptions, why: string): DtVal => {
  o.failed = true;
  o.why = why;
  return new DtVal(DTV_MAP);
};

/** readAnalysisOptions: the options at `path` with their includes merged in. */
const dtReadOptions = (o: DtOptions, path: string, depth: i32): DtVal => {
  if (depth > 16) {
    return dtOptFail(o, `${path}: includes nest too deep`);
  }
  const read = readFileBytesSync(path);
  if (read === null) {
    return dtOptFail(o, `cannot read ${path}`);
  }
  const b = read;
  const n = toI32(read.length);
  if (!dtUtf8Ok(b, n)) {
    return dtOptFail(o, `${path}: not UTF-8`);
  }
  const y = new DtYaml(b, n);
  const doc = y.doc();
  if (y.failed) {
    return dtOptFail(o, `${path}: YAML this reader does not take`);
  }
  if (doc.kind !== DTV_MAP) {
    return new DtVal(DTV_MAP);
  }
  let options = new DtVal(DTV_MAP);
  let inc: DtVal | null = null;
  for (let i = 0; i < toI32(doc.keys.length); i++) {
    if (doc.keys[i] === "include" && doc.items[i].kind !== DTV_NULL) {
      inc = doc.items[i];
      continue;
    }
    options.keys.push(doc.keys[i]);
    options.items.push(doc.items[i]);
  }
  if (inc === null) {
    return doc;
  }
  const dir = dtDirname(dtNormalize(path));
  if (inc.kind === DTV_STR) {
    const io = dtInclude(o, dir, path, inc.s, depth);
    if (o.failed) {
      return io;
    }
    options = dtMerge(io, options);
  } else if (inc.kind === DTV_LIST) {
    let merged = new DtVal(DTV_MAP);
    for (const x of inc.items) {
      if (x.kind !== DTV_STR) {
        return dtOptFail(o, `${path}: an include that is not a string`);
      }
      const io = dtInclude(o, dir, path, x.s, depth);
      if (o.failed) {
        return io;
      }
      merged = dtMerge(merged, io);
    }
    options = dtMerge(merged, options);
  } else {
    return dtOptFail(o, `${path}: an include that is not a string`);
  }
  return options;
};

/** optionsFromInclude. */
const dtInclude = (o: DtOptions, dir: string, from: string, inc: string, depth: i32): DtVal => {
  let target = inc;
  if (inc.startsWith("package:")) {
    const rest = inc.substring(8);
    let slash = -1;
    for (let i = 0; i < toI32(rest.length); i++) {
      if (rest.charCodeAt(i) === 47) {
        slash = i;
        break;
      }
    }
    if (slash <= 0 || !dtUriSafe(rest) || !dtPackageName(rest.substring(0, slash))) {
      return dtOptFail(o, `${from}: include ${inc} not taken`);
    }
    const sub = rest.substring(slash + 1);
    if (sub.length === 0 || sub.startsWith("/") || dtRemoveDots(`/${sub}`) !== `/${sub}`) {
      return dtOptFail(o, `${from}: include ${inc} not taken`);
    }
    const ps = o.pkgs;
    if (ps === null) {
      return dtOptFail(o, `${from}: include ${inc} cannot be resolved`);
    }
    const name = rest.substring(0, slash);
    let k = -1;
    for (let i = 0; i < toI32(ps.names.length); i++) {
      if (ps.names[i] === name) {
        k = i;
        break;
      }
    }
    if (k < 0) {
      return dtOptFail(o, `${from}: include ${inc} cannot be resolved`);
    }
    target = ps.purs[k] + sub;
  } else {
    for (let i = 0; i < toI32(inc.length); i++) {
      if (inc.charCodeAt(i) === 58) {
        return dtOptFail(o, `${from}: include ${inc} not taken`);
      }
    }
  }
  return dtReadOptions(o, dtJoin(dir, target), depth + 1);
};

/**
 * Answers the project settings for the Dart file at `path` into `r`, or
 * false when dart format would warn and fall back, or this reader cannot
 * follow the project exactly.
 */
export const dtConfigFor = (path: string, r: DtFileConfig): boolean => {
  const dir = dtParentOf(path);
  const key = `D${dir}`;
  const s = dtcFind(key);
  if (s >= 0) {
    r.verMajor = DTC_VAL[4 * s + 1];
    r.verMinor = DTC_VAL[4 * s + 2];
    r.pageWidth = DTC_VAL[4 * s + 3];
    if (DTC_VAL[4 * s] !== 1) {
      r.why = "the project could not be read (see the first file in this directory)";
      return false;
    }
    return true;
  }
  const ok = dtConfigRead(path, dir, r);
  dtcPut(key, ok ? 1 : 2, r.verMajor, r.verMinor, r.pageWidth);
  return ok;
};

/** The working directory (getcwd, as Directory.current), read once per process. */
const dtCwd = (): string => {
  if (DTC_META[4] > 0) {
    return dtcString(DTC_META[3], DTC_META[4] - 1);
  }
  const cwd = realpathSync(".");
  if (cwd === null) {
    return "";
  }
  const off = dtcKeep(cwd);
  if (off >= 0) {
    DTC_META[3] = off;
    DTC_META[4] = toI32(cwd.length) + 1;
  }
  return cwd;
};

const dtConfigRead = (path: string, dir: string, r: DtFileConfig): boolean => {
  const cwd = dtCwd();
  if (cwd.length === 0) {
    r.why = "no working directory";
    return false;
  }
  // ConfigCache.findLanguageVersion.
  const cfgFile = dtFindPackageConfig(dir, cwd);
  let ps: DtPkgs | null = null;
  let cfgKey = "";
  if (cfgFile.length !== 0) {
    cfgKey = dtRemoveDots(cfgFile);
    ps = dtPackageConfig(cfgKey);
    if (ps === null) {
      r.why = `${cfgFile}: a package config dart format would report`;
      return false;
    }
    const k = dtPackageOf(ps, dtRemoveDots(dtJoin(cwd, path)));
    if (k >= 0) {
      r.verMajor = ps.maj[k];
      r.verMinor = ps.min[k];
    }
  }
  // ConfigCache._findFormatterOptions: findAnalysisOptions from the file up.
  let d = dtDirname(dtNormalize(dtJoin(cwd, path)));
  while (true) {
    const f = dtJoin(d, "analysis_options.yaml");
    if (dtIsFile(f)) {
      return dtOptionsFor(f, cfgKey, ps, r);
    }
    const up = dtDirname(d);
    if (up === d) {
      return true;
    }
    d = up;
  }
};

/** The formatter options in the analysis options file `f`, read with the package config `cfgKey`, from the cache when read before. */
const dtOptionsFor = (f: string, cfgKey: string, ps: DtPkgs | null, r: DtFileConfig): boolean => {
  const key = `Y${f}\n${cfgKey}`;
  const s = dtcFind(key);
  if (s >= 0) {
    r.pageWidth = DTC_VAL[4 * s + 1];
    if (DTC_VAL[4 * s] !== 1) {
      r.why = `${f}: options this reader does not take`;
      return false;
    }
    return true;
  }
  const o = new DtOptions();
  o.pkgs = ps;
  const opts = dtReadOptions(o, f, 0);
  let ok = !o.failed;
  r.why = o.why;
  const fm: DtVal | null = ok ? dtValGet(opts, "formatter") : null;
  if (fm !== null && fm.kind === DTV_MAP) {
    const w = dtValGet(fm, "page_width");
    // dart_style takes `{'page_width': int width}` and ignores any other value.
    if (w !== null && w.kind === DTV_INT) {
      if (w.n > 0 && w.n <= 100000000) {
        r.pageWidth = w.n;
      } else {
        // 0, a negative width or one past 10^8: not followed.
        ok = false;
        r.why = `${f}: a page_width int that is not from 1 to 10^8`;
      }
    }
    const tc = dtValGet(fm, "trailing_commas");
    if (tc !== null && !(tc.kind === DTV_STR && tc.s === "automate")) {
      ok = false;
      r.why = `${f}: trailing_commas other than automate`;
    }
  }
  dtcPut(key, ok ? 1 : 2, r.pageWidth, 0, 0);
  return ok;
};
