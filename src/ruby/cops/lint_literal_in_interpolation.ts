// Lint/LiteralInInterpolation.
//
// Float#to_s is computed from the literal's decimal digits, which is exact
// when the literal has at most 15 significant digits; a longer float literal
// is left alone (no offense) rather than risk a wrong value.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import {
  F_BEGIN,
  F_END,
  M_HEREDOC,
  NT_ARRAY,
  NT_BEGIN,
  NT_DSTR,
  NT_DSYM,
  NT_ERANGE,
  NT_FLOAT,
  NT_HASH,
  NT_INT,
  NT_IRANGE,
  NT_NIL,
  NT_PAIR,
  NT_REGEXP,
  NT_STR,
  NT_SYM,
  NT_XSTR,
  V_NIL,
  rbInspectStr,
} from "../ast";
import { RbCop } from "../cop";
import { rnHeredoc } from "../node";
import { rbReplaceAll } from "../util";
import { RbSource } from "../source";
import { ssxBasicLiteral, ssxFE, ssxFS, ssxHas, ssxIs } from "./style_syntax_help";

/** String#valid_encoding? for UTF-8. */
export const lliValidUtf8 = (s: string): boolean => {
  const k = toI32(s.length);
  let i = 0;
  while (i < k) {
    const c = s.charCodeAt(i);
    if (c < 0x80) {
      i++;
      continue;
    }
    const n = c >= 0xf8 ? 0 : c >= 0xf0 ? 4 : c >= 0xe0 ? 3 : c >= 0xc2 ? 2 : 0;
    if (n === 0 || i + n > k) {
      return false;
    }
    let cp = n === 2 ? c & 0x1f : n === 3 ? c & 0x0f : c & 0x07;
    for (let j = 1; j < n; j++) {
      const d = s.charCodeAt(i + j);
      if (d < 0x80 || d >= 0xc0) {
        return false;
      }
      cp = (cp << 6) | (d & 0x3f);
    }
    if ((n === 3 && cp < 0x800) || (n === 4 && (cp < 0x10000 || cp > 0x10ffff)) || (cp >= 0xd800 && cp <= 0xdfff)) {
      return false;
    }
    i += n;
  }
  return true;
};

/** /\A[[:space:]]*\z/ over a UTF-8 string. */
const lliAllSpace = (s: string): boolean => {
  const k = toI32(s.length);
  let i = 0;
  while (i < k) {
    const c = s.charCodeAt(i);
    if (c === 32 || (c >= 9 && c <= 13)) {
      i++;
      continue;
    }
    const n = c >= 0xf0 ? 4 : c >= 0xe0 ? 3 : c >= 0xc0 ? 2 : 1;
    if (n === 1 || i + n > k) {
      return false;
    }
    let cp = n === 2 ? c & 0x1f : n === 3 ? c & 0x0f : c & 0x07;
    for (let j = 1; j < n; j++) {
      cp = (cp << 6) | (s.charCodeAt(i + j) & 0x3f);
    }
    const sp =
      cp === 0x85 ||
      cp === 0xa0 ||
      cp === 0x1680 ||
      (cp >= 0x2000 && cp <= 0x200a) ||
      cp === 0x2028 ||
      cp === 0x2029 ||
      cp === 0x202f ||
      cp === 0x205f ||
      cp === 0x3000;
    if (!sp) {
      return false;
    }
    i += n;
  }
  return true;
};

/** escape_string_content: a backslash before \ and ", and before # followed by @, { or $. */
const lliEscape = (s: string): string => {
  const out: string[] = [];
  const k = toI32(s.length);
  for (let i = 0; i < k; i++) {
    const c = s.charCodeAt(i);
    if (c === 92 || c === 34) {
      out.push("\\");
    } else if (c === 35 && i + 1 < k) {
      const d = s.charCodeAt(i + 1);
      if (d === 64 || d === 123 || d === 36) {
        out.push("\\");
      }
    }
    out.push(s.substring(i, i + 1));
  }
  return out.join("");
};

/** Integer#to_s of an int node's value (its text is decimal). */
const lliIntText = (t: string): string => {
  let neg = false;
  const ds: string[] = [];
  for (let i = 0; i < toI32(t.length); i++) {
    const c = t.charCodeAt(i);
    if (c === 45) {
      neg = true;
    } else if (c >= 48 && c <= 57) {
      ds.push(t.substring(i, i + 1));
    }
  }
  let s = ds.join("");
  let z = 0;
  while (z + 1 < toI32(s.length) && s.charCodeAt(z) === 48) {
    z++;
  }
  s = s.substring(z, toI32(s.length));
  if (s.length === 0) {
    s = "0";
  }
  return neg && s !== "0" ? `-${s}` : s;
};

/** m zeros. */
const lliZeros = (m: i32): string => {
  const z: string[] = [];
  for (let j = 0; j < m; j++) {
    z.push("0");
  }
  return z.join("");
};

/** Float#to_s of a decimal float literal, or "" when it has more than 15 significant digits. */
export const lliFloatText = (t: string): string => {
  let neg = false;
  const digits: string[] = [];
  let point = -1;
  let exp = 0;
  let i = 0;
  const k = toI32(t.length);
  if (i < k && (t.charCodeAt(i) === 45 || t.charCodeAt(i) === 43)) {
    neg = t.charCodeAt(i) === 45;
    i++;
  }
  let nd = 0;
  while (i < k) {
    const c = t.charCodeAt(i);
    if (c >= 48 && c <= 57) {
      digits.push(t.substring(i, i + 1));
      nd++;
    } else if (c === 46) {
      point = nd;
    } else if (c === 101 || c === 69) {
      i++;
      let eneg = false;
      if (i < k && (t.charCodeAt(i) === 45 || t.charCodeAt(i) === 43)) {
        eneg = t.charCodeAt(i) === 45;
        i++;
      }
      let e = 0;
      while (i < k) {
        const d = t.charCodeAt(i);
        if (d >= 48 && d <= 57) {
          e = e * 10 + (d - 48);
          if (e > 100000) {
            return "";
          }
        }
        i++;
      }
      exp = eneg ? -e : e;
      break;
    } else if (c !== 95) {
      return "";
    }
    i++;
  }
  if (point < 0) {
    point = nd;
  }
  // The significant digits and the decimal point position (value = 0.DIGITS * 10^decpt).
  let ds = digits.join("");
  let lead = 0;
  while (lead < toI32(ds.length) && ds.charCodeAt(lead) === 48) {
    lead++;
  }
  const decpt = point - lead + exp;
  ds = ds.substring(lead, toI32(ds.length));
  let tail = toI32(ds.length);
  while (tail > 0 && ds.charCodeAt(tail - 1) === 48) {
    tail--;
  }
  ds = ds.substring(0, tail);
  const sign = neg ? "-" : "";
  if (ds.length === 0) {
    return `${sign}0.0`;
  }
  if (ds.length > 15 || decpt > 309 || decpt < -307) {
    return "";
  }
  const n = toI32(ds.length);
  if (decpt > 0 && decpt <= 16) {
    if (decpt >= n) {
      return `${sign}${ds}${lliZeros(decpt - n)}.0`;
    }
    return `${sign}${ds.substring(0, decpt)}.${ds.substring(decpt, n)}`;
  }
  if (decpt <= 0 && decpt > -4) {
    return `${sign}0.${lliZeros(-decpt)}${ds}`;
  }
  const e = decpt - 1;
  const ae = e < 0 ? -e : e;
  const es = ae < 10 ? `0${ae}` : `${ae}`;
  const frac = n > 1 ? ds.substring(1, n) : "0";
  return `${sign}${ds.substring(0, 1)}.${frac}e${e < 0 ? "-" : "+"}${es}`;
};

const lliIdentStart = (c: i32): boolean => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c >= 128;

const lliIdentChar = (c: i32): boolean => lliIdentStart(c) || (c >= 48 && c <= 57);

/** Symbol#inspect. */
export const lliSymInspect = (s: string): string => {
  const ops = " + - * / % ** == === =~ ! != !~ < <= > >= <=> << >> & | ^ ~ +@ -@ [] []= ` ";
  if (s.length > 0 && ops.indexOf(` ${s} `) >= 0) {
    return `:${s}`;
  }
  const k = toI32(s.length);
  let i = 0;
  let kind = 0;
  if (k > 0 && s.charCodeAt(0) === 36) {
    i = 1;
    kind = 2;
  } else if (k > 1 && s.charCodeAt(0) === 64 && s.charCodeAt(1) === 64) {
    i = 2;
    kind = 1;
  } else if (k > 0 && s.charCodeAt(0) === 64) {
    i = 1;
    kind = 1;
  }
  let bare = lliValidUtf8(s) && i < k && lliIdentStart(s.charCodeAt(i));
  if (bare) {
    let j = i + 1;
    while (j < k && lliIdentChar(s.charCodeAt(j))) {
      j++;
    }
    if (j < k) {
      const c = s.charCodeAt(j);
      bare = kind === 0 && j + 1 === k && (c === 63 || c === 33 || c === 61);
    }
  }
  if (bare) {
    return `:${s}`;
  }
  return `:${rbInspectStr(s)}`;
};

export class CopLintLiteralInInterpolation {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Lint/LiteralInInterpolation");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      const t = a.type(n);
      if (!(t === NT_DSTR || t === NT_XSTR || t === NT_DSYM || t === NT_REGEXP)) {
        continue;
      }
      for (let i = 0; i < a.nKid(n); i++) {
        const b = a.kid(n, i);
        if (ssxIs(src, b, NT_BEGIN)) {
          this.onInterpolation(src, b, i);
        }
      }
    }
  }

  private onInterpolation(src: RbSource, b: i32, idx: i32): void {
    const a = src.a;
    if (a.nKid(b) === 0) {
      return;
    }
    const f = a.kid(b, -1);
    if (!this.offending(src, f)) {
      return;
    }
    const v = this.correctable(src, b, f);
    if (v === null) {
      return;
    }
    const k = this.c.offense(a.exS(f), a.exE(f));
    if (k === null) {
      return;
    }
    // follows_literal_interpolation?
    if (idx > 0) {
      const prev = a.kid(src.parent(b), idx - 1);
      if (ssxIs(src, prev, NT_BEGIN) && a.nKid(prev) > 0 && this.offending(src, a.kid(prev, -1))) {
        const pv = this.correctable(src, prev, a.kid(prev, -1));
        if (pv !== null && (pv.length === 0 || pv.endsWith("#"))) {
          return;
        }
      }
    }
    let repl = v;
    if (ssxIs(src, f, NT_STR) && !lliValidUtf8(a.text(a.kid(f, 0)))) {
      repl = this.stripQuotes(src.nodeSrc(f));
    }
    k.replace(a.exS(b), a.exE(b), repl);
    this.c.commit(k);
  }

  private stripQuotes(s0: string): string {
    let s = s0;
    if (s.startsWith('"')) {
      s = s.substring(1, toI32(s.length));
    }
    if (s.endsWith('"')) {
      s = s.substring(0, toI32(s.length) - 1);
    }
    return s;
  }

  /** prints_as_self?. */
  private printsAsSelf(src: RbSource, n: i32): boolean {
    const a = src.a;
    if (!a.isNode(n)) {
      return false;
    }
    if (ssxBasicLiteral(src, n)) {
      return true;
    }
    const t = a.type(n);
    if (!(t === NT_ARRAY || t === NT_HASH || t === NT_PAIR || t === NT_IRANGE || t === NT_ERANGE)) {
      return false;
    }
    // numeric_open_range?: a nil child (a beginless or endless range) needs numeric others.
    let open = false;
    for (let i = 0; i < a.nKid(n); i++) {
      if (a.kid(n, i) === V_NIL) {
        open = true;
      }
    }
    if (open) {
      for (let i = 0; i < a.nKid(n); i++) {
        const ch = a.kid(n, i);
        if (ch !== V_NIL && !ssxIs(src, ch, NT_INT) && !ssxIs(src, ch, NT_FLOAT)) {
          return false;
        }
      }
      return true;
    }
    for (let i = 0; i < a.nKid(n); i++) {
      if (!this.printsAsSelf(src, a.kid(n, i))) {
        return false;
      }
    }
    return true;
  }

  private offending(src: RbSource, n: i32): boolean {
    const a = src.a;
    if (n === V_NIL) {
      return false;
    }
    // special_keyword?
    if ((ssxIs(src, n, NT_STR) && !ssxHas(src, n, F_BEGIN)) || src.nodeSrc(n) === "__LINE__") {
      return false;
    }
    if (!this.printsAsSelf(src, n)) {
      return false;
    }
    const p = src.parent(n);
    const gp = src.parent(p);
    // space_literal? && ends_heredoc_line?
    if (ssxIs(src, n, NT_STR)) {
      const val = a.text(a.kid(n, 0));
      if (lliValidUtf8(val) && lliAllSpace(val) && gp !== V_NIL && a.type(gp) === NT_DSTR && rnHeredoc(src, gp)) {
        const l = src.line(a.exE(n));
        if (src.lineEnd(l) - src.lineStart(l) === src.column(a.exE(p))) {
          return false;
        }
      }
    }
    // array_in_regexp?
    if (ssxIs(src, n, NT_ARRAY) && gp !== V_NIL && a.type(gp) === NT_REGEXP) {
      return false;
    }
    return true;
  }

  /** correctable_value, or null. */
  private correctable(src: RbSource, b: i32, f: i32): string | null {
    const a = src.a;
    const v0 = this.value(src, f);
    if (v0 === null) {
      return null;
    }
    let v = v0;
    // handle_special_regexp_chars
    const p = src.parent(b);
    if (a.type(p) === NT_REGEXP && src.at(ssxFS(src, p, F_BEGIN)) === 47 && v.indexOf("/") >= 0) {
      const out: string[] = [];
      let i = 0;
      const k = toI32(v.length);
      while (i < k) {
        let j = i;
        while (j < k && v.charCodeAt(j) === 92) {
          j++;
        }
        if (j < k && v.charCodeAt(j) === 47) {
          const need = 2 * toI32((j - i + 1) / 4) + 1;
          for (let q = 0; q < need; q++) {
            out.push("\\");
          }
          out.push("/");
          i = j + 1;
        } else if (j > i) {
          out.push(v.substring(i, j));
          i = j;
        } else {
          out.push(v.substring(i, i + 1));
          i++;
        }
      }
      v = out.join("");
    }
    // starts_interpolation_after_hash_sign?
    const nx = src.at(a.exE(b));
    const fst = v.length > 0 ? v.charCodeAt(0) : nx;
    if (
      (fst === 123 || fst === 64 || fst === 36) &&
      src.at(a.exS(b) - 1) === 35 &&
      this.unescapedHashBefore(src, a.exS(b))
    ) {
      return null;
    }
    // escape_trailing_hash_sign
    if ((nx === 123 || nx === 64 || nx === 36) && v.endsWith("#")) {
      let bs = 0;
      let j = toI32(v.length) - 2;
      while (j >= 0 && v.charCodeAt(j) === 92) {
        bs++;
        j--;
      }
      if (bs % 2 === 0) {
        v = `${v.substring(0, toI32(v.length) - 1)}\\#`;
      }
    }
    // in_array_percent_literal?
    const pt = a.type(p);
    if (pt === NT_DSTR || pt === NT_DSYM) {
      const g = src.parent(p);
      if (g !== V_NIL && a.type(g) === NT_ARRAY && ssxHas(src, g, F_BEGIN) && src.at(ssxFS(src, g, F_BEGIN)) === 37) {
        if (v.length === 0) {
          return null;
        }
        for (let i = 0; i < toI32(v.length); i++) {
          const c = v.charCodeAt(i);
          if (c === 32 || (c >= 9 && c <= 13)) {
            return null;
          }
        }
      }
    }
    if (this.breaksDelimiters(src, b, v)) {
      return null;
    }
    return v;
  }

  /** breaks_delimiters?: the value holds a delimiter of the enclosing literal. */
  private breaksDelimiters(src: RbSource, b: i32, v: string): boolean {
    const a = src.a;
    // delimited_literal
    const p = src.parent(b);
    let lit = p;
    const pt = a.type(p);
    if (pt === NT_DSTR || pt === NT_DSYM) {
      const g = src.parent(p);
      if (g !== V_NIL && a.type(g) === NT_ARRAY && ssxHas(src, g, F_BEGIN) && src.at(ssxFS(src, g, F_BEGIN)) === 37) {
        lit = g;
      }
    }
    if (a.mapKind(a.map(lit)) === M_HEREDOC || !ssxHas(src, lit, F_BEGIN) || !ssxHas(src, lit, F_END)) {
      return false;
    }
    const opening = src.at(ssxFE(src, lit, F_BEGIN) - 1);
    const closing = src.at(ssxFS(src, lit, F_END));
    const k = toI32(v.length);
    if (opening !== closing) {
      // !balanced?
      let depth = 0;
      for (let i = 0; i < k; i++) {
        const c = v.charCodeAt(i);
        if (c === opening) {
          depth++;
        }
        if (c === closing) {
          depth--;
        }
        if (depth < 0) {
          return true;
        }
      }
      return depth !== 0;
    }
    // escaped_delimiter?
    if (closing === 34) {
      return false;
    }
    if (closing === 47 && a.type(lit) === NT_REGEXP && src.at(ssxFS(src, lit, F_BEGIN)) === 47) {
      return false;
    }
    for (let i = 0; i < k; i++) {
      if (v.charCodeAt(i) === closing) {
        return true;
      }
    }
    return false;
  }

  /** unescaped_hash_sign?(source[0...pos]): a `#` just before pos after an even run of backslashes. */
  private unescapedHashBefore(src: RbSource, pos: i32): boolean {
    let bs = 0;
    let j = pos - 2;
    while (j >= 0 && src.at(j) === 92) {
      bs++;
      j--;
    }
    return bs % 2 === 0;
  }

  /** autocorrected_value, or null when it cannot be computed. */
  private value(src: RbSource, n: i32): string | null {
    const a = src.a;
    const t = a.type(n);
    if (t === NT_INT) {
      return lliIntText(a.text(a.kid(n, 0)));
    }
    if (t === NT_FLOAT) {
      const s = lliFloatText(a.text(a.kid(n, 0)));
      return s.length === 0 ? null : s;
    }
    if (t === NT_STR) {
      const val = a.text(a.kid(n, 0));
      if (!lliValidUtf8(val)) {
        return this.stripQuotes(src.nodeSrc(n));
      }
      return lliEscape(val);
    }
    if (t === NT_SYM) {
      if (!ssxHas(src, n, F_BEGIN)) {
        return null;
      }
      const s = ssxFE(src, n, F_BEGIN);
      const e = ssxHas(src, n, F_END) ? ssxFS(src, n, F_END) : a.exE(n);
      return rbReplaceAll(src.src(s, e), '"', '\\"');
    }
    if (t === NT_ARRAY) {
      return this.arrayValue(src, n);
    }
    if (t === NT_HASH) {
      return this.floatsKnown(src, n) ? this.hashValue(src, n) : null;
    }
    if (t === NT_NIL) {
      return "";
    }
    return rbReplaceAll(src.nodeSrc(n), '"', '\\"');
  }

  /** Whether every float a hash value prints (through nested hashes) has a known Float#to_s. */
  private floatsKnown(src: RbSource, n: i32): boolean {
    const a = src.a;
    if (a.type(n) === NT_FLOAT) {
      return lliFloatText(a.text(a.kid(n, 0))).length > 0;
    }
    if (a.type(n) === NT_HASH || a.type(n) === NT_PAIR) {
      for (let i = 0; i < a.nKid(n); i++) {
        if (!this.floatsKnown(src, a.kid(n, i))) {
          return false;
        }
      }
    }
    return true;
  }

  /** autocorrected_value_for_array. */
  private arrayValue(src: RbSource, n: i32): string {
    const a = src.a;
    if (!(ssxHas(src, n, F_BEGIN) && src.at(ssxFS(src, n, F_BEGIN)) === 37)) {
      return lliEscape(src.nodeSrc(n));
    }
    // node.values.map { |value| value.value.to_s }.to_s
    const words: string[] = [];
    for (let i = 0; i < a.nKid(n); i++) {
      words.push(rbInspectStr(a.text(a.kid(a.kid(n, i), 0))));
    }
    return lliEscape(`[${words.join(", ")}]`);
  }

  /** autocorrected_value_for_hash. */
  private hashValue(src: RbSource, n: i32): string {
    const a = src.a;
    const parts: string[] = [];
    for (let i = 0; i < a.nKid(n); i++) {
      const p = a.kid(n, i);
      parts.push(`${this.inHash(src, a.kid(p, 0))}=>${this.inHash(src, a.kid(p, 1))}`);
    }
    return `{${parts.join(", ")}}`;
  }

  /** autocorrected_value_in_hash. */
  private inHash(src: RbSource, n: i32): string {
    const a = src.a;
    const t = a.type(n);
    if (t === NT_INT) {
      return lliIntText(a.text(a.kid(n, 0)));
    }
    if (t === NT_FLOAT) {
      const s = lliFloatText(a.text(a.kid(n, 0)));
      return s.length === 0 ? src.nodeSrc(n) : s;
    }
    if (t === NT_STR) {
      return lliEscape(rbInspectStr(a.text(a.kid(n, 0))));
    }
    if (t === NT_SYM) {
      return lliEscape(lliSymInspect(a.text(a.kid(n, 0))));
    }
    if (t === NT_ARRAY) {
      return this.arrayValue(src, n);
    }
    if (t === NT_HASH) {
      return this.hashValue(src, n);
    }
    return rbReplaceAll(src.nodeSrc(n), '"', '\\"');
  }
}
