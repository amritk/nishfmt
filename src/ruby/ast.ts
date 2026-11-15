// The Ruby AST as the parser gem builds it for RuboCop: nodes with a type,
// children and a source map. Every value the builder and the grammar pass
// around is an i32 handle: its low 4 bits say what it is, the rest index a
// store here.
//
// Modelled on the parser gem 3.3.13.0's AST::Node and Source::Map (MIT
// License, Copyright (c) 2013-2024 parser contributors).

import { rbText } from "./lexer";

// Handle tags.
export const V_NIL: i32 = 0; // the handle 0 is nil
export const VT_NODE: i32 = 1;
export const VT_SYM: i32 = 2;
export const VT_STR: i32 = 3;
export const VT_INT: i32 = 4; // decimal text
export const VT_FLOAT: i32 = 5; // source text
export const VT_RATIONAL: i32 = 6;
export const VT_COMPLEX: i32 = 7;
export const VT_TOKEN: i32 = 8;
export const VT_LIST: i32 = 9;
export const VT_SCALAR: i32 = 10; // a small integer the grammar keeps (context bits, flags)

export const vTag = (h: i32): i32 => h & 15;
export const vIdx = (h: i32): i32 => h >> 4;
export const vMake = (tag: i32, idx: i32): i32 => (idx << 4) | tag;

// Source map fields.
export const F_EXPRESSION: i32 = 0;
export const F_ARGUMENT: i32 = 1;
export const F_ASSIGNMENT: i32 = 2;
export const F_ASSOC: i32 = 3;
export const F_BEGIN: i32 = 4;
export const F_COLON: i32 = 5;
export const F_DOT: i32 = 6;
export const F_DOUBLE_COLON: i32 = 7;
export const F_ELSE: i32 = 8;
export const F_END: i32 = 9;
export const F_HEREDOC_BODY: i32 = 10;
export const F_HEREDOC_END: i32 = 11;
export const F_IN: i32 = 12;
export const F_KEYWORD: i32 = 13;
export const F_NAME: i32 = 14;
export const F_OPERATOR: i32 = 15;
export const F_QUESTION: i32 = 16;
export const F_SELECTOR: i32 = 17;
export const NF: i32 = 18;

const FIELD_NAMES: string = "expression,argument,assignment,assoc,begin,colon,dot,double_colon,else,end,heredoc_body,heredoc_end,in,keyword,name,operator,question,selector";

// Source map classes.
export const M_MAP: i32 = 0;
export const M_COLLECTION: i32 = 1;
export const M_CONDITION: i32 = 2;
export const M_CONSTANT: i32 = 3;
export const M_DEFINITION: i32 = 4;
export const M_FOR: i32 = 5;
export const M_HEREDOC: i32 = 6;
export const M_INDEX: i32 = 7;
export const M_KEYWORD: i32 = 8;
export const M_METHOD_DEFINITION: i32 = 9;
export const M_OBJC_KWARG: i32 = 10;
export const M_OPERATOR: i32 = 11;
export const M_RESCUE_BODY: i32 = 12;
export const M_SEND: i32 = 13;
export const M_TERNARY: i32 = 14;
export const M_VARIABLE: i32 = 15;

export class RbAst {
  pts: i32[];
  // Nodes.
  nNodes: i32 = 0;
  nType: i32[];
  nKids: i32[]; // a list handle's index
  nMap: i32[]; // -1 for none
  // Maps: kind and NF begin/end pairs, -1 when absent.
  nMaps: i32 = 0;
  mKind: i32[];
  mRange: i32[];
  // Strings (symbols, string values, numeric text, token values).
  strs: string[];
  // Tokens: value string index (-1 nil), range.
  tVal: i32[];
  tS: i32[];
  tE: i32[];
  // Lists of handles.
  lists: i32[][];

  constructor(pts: i32[]) {
    this.pts = pts;
    this.nType = [];
    this.nKids = [];
    this.nMap = [];
    this.mKind = [];
    this.mRange = [];
    this.strs = [];
    this.tVal = [];
    this.tS = [];
    this.tE = [];
    this.lists = [];
  }

  // ---- Values ------------------------------------------------------------------

  str(s: string): i32 {
    this.strs.push(s);
    return toI32(this.strs.length) - 1;
  }

  sym(s: string): i32 {
    return vMake(VT_SYM, this.str(s));
  }

  strVal(s: string): i32 {
    return vMake(VT_STR, this.str(s));
  }

  num(tag: i32, text: string): i32 {
    return vMake(tag, this.str(text));
  }

  scalar(v: i32): i32 {
    return vMake(VT_SCALAR, v);
  }

  scalarOf(h: i32): i32 {
    return vIdx(h);
  }

  /** The text of a symbol, string or number handle. */
  text(h: i32): string {
    return this.strs[vIdx(h)];
  }

  isNode(h: i32): boolean {
    return h !== V_NIL && vTag(h) === VT_NODE;
  }

  // ---- Tokens ------------------------------------------------------------------

  token(value: string, s: i32, e: i32): i32 {
    this.tVal.push(this.str(value));
    this.tS.push(s);
    this.tE.push(e);
    return vMake(VT_TOKEN, toI32(this.tS.length) - 1);
  }

  /** A token whose value is nil (loc(token) is then nil too). */
  nilValueToken(s: i32, e: i32): i32 {
    this.tVal.push(-1);
    this.tS.push(s);
    this.tE.push(e);
    return vMake(VT_TOKEN, toI32(this.tS.length) - 1);
  }

  tokValue(t: i32): string {
    const v = this.tVal[vIdx(t)];
    return v < 0 ? "" : this.strs[v];
  }

  /** Whether loc(token) exists: the token and its value are not nil. */
  hasLoc(t: i32): boolean {
    return t !== V_NIL && vTag(t) === VT_TOKEN && this.tVal[vIdx(t)] >= 0;
  }

  tokS(t: i32): i32 {
    return this.tS[vIdx(t)];
  }

  tokE(t: i32): i32 {
    return this.tE[vIdx(t)];
  }

  // ---- Lists -------------------------------------------------------------------

  list(): i32 {
    const l: i32[] = [];
    this.lists.push(l);
    return vMake(VT_LIST, toI32(this.lists.length) - 1);
  }

  list1(a: i32): i32 {
    const l = this.list();
    this.push(l, a);
    return l;
  }

  list2(a: i32, b: i32): i32 {
    const l = this.list();
    this.push(l, a);
    this.push(l, b);
    return l;
  }

  list3(a: i32, b: i32, c: i32): i32 {
    const l = this.list();
    this.push(l, a);
    this.push(l, b);
    this.push(l, c);
    return l;
  }

  push(l: i32, v: i32): i32 {
    this.lists[vIdx(l)].push(v);
    return l;
  }

  len(l: i32): i32 {
    return l === V_NIL ? 0 : toI32(this.lists[vIdx(l)].length);
  }

  at(l: i32, i: i32): i32 {
    if (vTag(l) !== VT_LIST) {
      return V_NIL;
    }
    const a = this.lists[vIdx(l)];
    const k = i < 0 ? toI32(a.length) + i : i;
    return k >= 0 && k < toI32(a.length) ? a[k] : V_NIL;
  }

  setAt(l: i32, i: i32, v: i32): void {
    this.lists[vIdx(l)][i] = v;
  }

  /** Array#concat: b's items appended to a, which is returned. */
  append(a: i32, b: i32): i32 {
    const k = this.len(b);
    for (let i = 0; i < k; i++) {
      this.push(a, this.at(b, i));
    }
    return a;
  }

  /** A new list with a's items, then b's. */
  concat(a: i32, b: i32): i32 {
    const l = this.list();
    for (let i = 0; i < this.len(a); i++) {
      this.push(l, this.at(a, i));
    }
    for (let i = 0; i < this.len(b); i++) {
      this.push(l, this.at(b, i));
    }
    return l;
  }

  /** A copy of l[from, to). */
  slice(l: i32, from: i32, to: i32): i32 {
    const r = this.list();
    for (let i = from; i < to; i++) {
      this.push(r, this.at(l, i));
    }
    return r;
  }

  // ---- Maps --------------------------------------------------------------------

  newMap(kind: i32): i32 {
    const m = this.nMaps;
    this.mKind.push(kind);
    for (let i = 0; i < NF * 2; i++) {
      this.mRange.push(-1);
    }
    this.nMaps = m + 1;
    return m;
  }

  copyMap(m: i32): i32 {
    const c = this.newMap(this.mKind[m]);
    for (let i = 0; i < NF * 2; i++) {
      this.mRange[c * NF * 2 + i] = this.mRange[m * NF * 2 + i];
    }
    return c;
  }

  setF(m: i32, f: i32, s: i32, e: i32): void {
    this.mRange[(m * NF + f) * 2] = s;
    this.mRange[(m * NF + f) * 2 + 1] = e;
  }

  /** Sets field f from token t (nothing when loc(t) is nil). */
  setT(m: i32, f: i32, t: i32): void {
    if (this.hasLoc(t)) {
      this.setF(m, f, this.tokS(t), this.tokE(t));
    }
  }

  fS(m: i32, f: i32): i32 {
    return this.mRange[(m * NF + f) * 2];
  }

  fE(m: i32, f: i32): i32 {
    return this.mRange[(m * NF + f) * 2 + 1];
  }

  has(m: i32, f: i32): boolean {
    return m >= 0 && this.fS(m, f) >= 0;
  }

  // ---- Nodes -------------------------------------------------------------------

  node(type: i32, kids: i32, map: i32): i32 {
    const id = this.nNodes;
    this.nType.push(type);
    this.nKids.push(kids === V_NIL ? vIdx(this.list()) : vIdx(kids));
    this.nMap.push(map);
    this.nNodes = id + 1;
    return vMake(VT_NODE, id);
  }

  type(n: i32): i32 {
    return this.nType[vIdx(n)];
  }

  kids(n: i32): i32 {
    return vMake(VT_LIST, this.nKids[vIdx(n)]);
  }

  kid(n: i32, i: i32): i32 {
    return this.at(this.kids(n), i);
  }

  nKid(n: i32): i32 {
    return this.len(this.kids(n));
  }

  map(n: i32): i32 {
    return this.nMap[vIdx(n)];
  }

  /** node.loc.expression's begin, or -1. */
  exS(n: i32): i32 {
    const m = this.map(n);
    return m < 0 ? -1 : this.fS(m, F_EXPRESSION);
  }

  exE(n: i32): i32 {
    const m = this.map(n);
    return m < 0 ? -1 : this.fE(m, F_EXPRESSION);
  }

  /** Node#updated: a new node, sharing what is not given (-1 type, V_NIL kids, -2 map). */
  updated(n: i32, type: i32, kids: i32, map: i32): i32 {
    return this.node(type < 0 ? this.type(n) : type, kids === V_NIL ? this.copyList(this.kids(n)) : kids, map === -2 ? this.map(n) : map);
  }

  copyList(l: i32): i32 {
    return this.slice(l, 0, this.len(l));
  }

  // ---- Dump ----------------------------------------------------------------------

  /** The reference dumper's format (tools/ruby/astdump.rb). */
  dump(n: i32, depth: i32, out: string[]): void {
    let line = "";
    for (let i = 0; i < depth; i++) {
      line = `${line} `;
    }
    line = line + rbTypeName(this.type(n));
    const m = this.map(n);
    if (m >= 0) {
      const names = rbSplitComma(FIELD_NAMES);
      for (let f = 0; f < NF; f++) {
        if (this.fS(m, f) >= 0) {
          line = `${line} ${names[f]}=${this.fS(m, f)}-${this.fE(m, f)}`;
        }
      }
    }
    const k = this.kids(n);
    for (let i = 0; i < this.len(k); i++) {
      const c = this.at(k, i);
      if (!this.isNode(c)) {
        line = `${line} ${this.inspect(c)}`;
      }
    }
    out.push(line);
    for (let i = 0; i < this.len(k); i++) {
      const c = this.at(k, i);
      if (this.isNode(c)) {
        this.dump(c, depth + 1, out);
      }
    }
  }

  inspect(h: i32): string {
    if (h === V_NIL) {
      return "nil";
    }
    const t = vTag(h);
    if (t === VT_SYM) {
      return rbInspectSym(this.text(h));
    }
    if (t === VT_STR) {
      return rbInspectStr(this.text(h));
    }
    if (t === VT_INT) {
      return this.text(h);
    }
    if (t === VT_FLOAT) {
      return rbFloatInspect(this.text(h));
    }
    if (t === VT_RATIONAL) {
      return `(${this.text(h)})`;
    }
    if (t === VT_COMPLEX) {
      return `(${this.text(h)})`;
    }
    if (t === VT_SCALAR) {
      return `${vIdx(h)}`;
    }
    return "?";
  }

  /** The source of the code points [s, e). */
  source(s: i32, e: i32): string {
    return rbText(this.pts, s, e);
  }
}

/** `s` split at commas. */
export const rbSplitComma = (s: string): string[] => {
  const out: string[] = [];
  let a = 0;
  for (let i = 0; i <= toI32(s.length); i++) {
    if (i === toI32(s.length) || s.charCodeAt(i) === 44) {
      out.push(s.substring(a, i));
      a = i + 1;
    }
  }
  return out;
};

/** Symbol#inspect. */
export const rbInspectSym = (s: string): string => {
  if (rbPlainSymbol(s)) {
    return `:${s}`;
  }
  return `:${rbInspectStr(s)}`;
};

/** Whether a symbol prints without quotes. */
const rbPlainSymbol = (s: string): boolean => {
  const k = toI32(s.length);
  if (k === 0) {
    return false;
  }
  const ops = rbSplitComma("|,^,&,<=>,==,===,=~,>,>=,<,<=,+,-,*,/,%,**,~,+@,-@,[],[]=,<<,>>,!,!=,!~,`");
  for (const o of ops) {
    if (o === s) {
      return true;
    }
  }
  let i = 0;
  if (s.charCodeAt(0) === 36) {
    // $globals
    i = 1;
    if (k === 2 && "~*$?!@/\\;,.=:<>\"&`'+0123456789".indexOf(s.substring(1, 2)) >= 0) {
      return true;
    }
  } else if (s.charCodeAt(0) === 64) {
    i = k > 1 && s.charCodeAt(1) === 64 ? 2 : 1;
  }
  if (i >= k) {
    return false;
  }
  const c0 = s.charCodeAt(i);
  if (!((c0 >= 65 && c0 <= 90) || (c0 >= 97 && c0 <= 122) || c0 === 95 || c0 >= 0x80)) {
    return false;
  }
  for (let j = i + 1; j < k; j++) {
    const c = s.charCodeAt(j);
    const word = (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c >= 0x80 || (c >= 48 && c <= 57);
    if (!word) {
      // A trailing ?, ! or = on a method name.
      return j === k - 1 && i === 0 && (c === 63 || c === 33 || c === 61);
    }
  }
  return true;
};

/** String#inspect (UTF-8). */
export const rbInspectStr = (s: string): string => {
  let out = '"';
  const k = toI32(s.length);
  let i = 0;
  while (i < k) {
    const c = s.charCodeAt(i);
    if (c === 34) {
      out = `${out}\\"`;
    } else if (c === 92) {
      out = `${out}\\\\`;
    } else if (c === 10) {
      out = `${out}\\n`;
    } else if (c === 9) {
      out = `${out}\\t`;
    } else if (c === 13) {
      out = `${out}\\r`;
    } else if (c === 12) {
      out = `${out}\\f`;
    } else if (c === 11) {
      out = `${out}\\v`;
    } else if (c === 8) {
      out = `${out}\\b`;
    } else if (c === 7) {
      out = `${out}\\a`;
    } else if (c === 27) {
      out = `${out}\\e`;
    } else if (c === 35 && i + 1 < k && (s.charCodeAt(i + 1) === 123 || s.charCodeAt(i + 1) === 36 || s.charCodeAt(i + 1) === 64)) {
      out = `${out}\\#`;
    } else if (c < 32 || c === 127) {
      out = `${out}\\x${rbHex2(c)}`;
    } else if (c < 0x80) {
      out = out + s.substring(i, i + 1);
    } else {
      // A whole UTF-8 sequence, or \x escapes for invalid bytes.
      const n = c >= 0xf0 ? 4 : c >= 0xe0 ? 3 : c >= 0xc0 ? 2 : 1;
      let ok = n > 1 && i + n <= k;
      for (let j = 1; ok && j < n; j++) {
        const d = s.charCodeAt(i + j);
        if (d < 0x80 || d >= 0xc0) {
          ok = false;
        }
      }
      if (ok) {
        out = out + s.substring(i, i + n);
        i += n;
        continue;
      }
      out = `${out}\\x${rbHex2(c)}`;
    }
    i++;
  }
  return `${out}"`;
};

const rbHex2 = (c: i32): string => {
  const h = "0123456789ABCDEF";
  return h.substring((c >> 4) & 15, ((c >> 4) & 15) + 1) + h.substring(c & 15, (c & 15) + 1);
};

/** Float#inspect of a float literal's text: the shortest digits that round-trip, in Ruby's layout. */
export const rbFloatInspect = (t: string): string => {
  let neg = false;
  let lit = "";
  for (let i = 0; i < toI32(t.length); i++) {
    const c = t.charCodeAt(i);
    if (c === 45 && i === 0) {
      neg = true;
    } else if (c !== 95) {
      lit = lit + t.substring(i, i + 1);
    }
  }
  const js = `${parseFloat(lit)}`;
  // Split the JavaScript form into digits and the decimal point's position.
  let m = js;
  let e = 0;
  const ei = js.indexOf("e");
  if (ei >= 0) {
    m = js.substring(0, ei);
    e = toI32(parseFloat(js.substring(js.charCodeAt(ei + 1) === 43 ? ei + 2 : ei + 1, toI32(js.length))));
  }
  const dot = m.indexOf(".");
  let digits = dot < 0 ? m : m.substring(0, dot) + m.substring(dot + 1, toI32(m.length));
  let decpt = (dot < 0 ? toI32(m.length) : dot) + e;
  while (digits.length > 0 && digits.charCodeAt(0) === 48) {
    digits = digits.substring(1, toI32(digits.length));
    decpt--;
  }
  while (digits.length > 0 && digits.charCodeAt(toI32(digits.length) - 1) === 48) {
    digits = digits.substring(0, toI32(digits.length) - 1);
  }
  const sign = neg ? "-" : "";
  const nd = toI32(digits.length);
  if (nd === 0) {
    return `${sign}0.0`;
  }
  if (decpt > -4 && decpt <= 15) {
    if (decpt <= 0) {
      let z = "";
      for (let i = 0; i < -decpt; i++) {
        z = `${z}0`;
      }
      return `${sign}0.${z}${digits}`;
    }
    if (decpt >= nd) {
      let z = "";
      for (let i = nd; i < decpt; i++) {
        z = `${z}0`;
      }
      return `${sign}${digits}${z}.0`;
    }
    return `${sign}${digits.substring(0, decpt)}.${digits.substring(decpt, nd)}`;
  }
  const x = decpt - 1;
  const ax = x < 0 ? -x : x;
  const frac = nd > 1 ? digits.substring(1, nd) : "0";
  return `${sign}${digits.substring(0, 1)}.${frac}e${x < 0 ? "-" : "+"}${ax < 10 ? "0" : ""}${ax}`;
};

// Node types.
export const NT___ENCODING__: i32 = 0;
export const NT___FILE__: i32 = 1;
export const NT___LINE__: i32 = 2;
export const NT_ALIAS: i32 = 3;
export const NT_AND: i32 = 4;
export const NT_AND_ASGN: i32 = 5;
export const NT_ARG: i32 = 6;
export const NT_ARG_EXPR: i32 = 7;
export const NT_ARGS: i32 = 8;
export const NT_ARRAY: i32 = 9;
export const NT_ARRAY_PATTERN: i32 = 10;
export const NT_ARRAY_PATTERN_WITH_TAIL: i32 = 11;
export const NT_BACK_REF: i32 = 12;
export const NT_BEGIN: i32 = 13;
export const NT_BLOCK: i32 = 14;
export const NT_BLOCK_PASS: i32 = 15;
export const NT_BLOCKARG: i32 = 16;
export const NT_BLOCKARG_EXPR: i32 = 17;
export const NT_BREAK: i32 = 18;
export const NT_CASE: i32 = 19;
export const NT_CASE_MATCH: i32 = 20;
export const NT_CASGN: i32 = 21;
export const NT_CBASE: i32 = 22;
export const NT_CLASS: i32 = 23;
export const NT_COMPLEX: i32 = 24;
export const NT_CONST: i32 = 25;
export const NT_CONST_PATTERN: i32 = 26;
export const NT_CSEND: i32 = 27;
export const NT_CVAR: i32 = 28;
export const NT_CVASGN: i32 = 29;
export const NT_DEF: i32 = 30;
export const NT_DEFINED_P: i32 = 31;
export const NT_DEFS: i32 = 32;
export const NT_DSTR: i32 = 33;
export const NT_DSYM: i32 = 34;
export const NT_EFLIPFLOP: i32 = 35;
export const NT_EMPTY_ELSE: i32 = 36;
export const NT_ENSURE: i32 = 37;
export const NT_ERANGE: i32 = 38;
export const NT_FALSE: i32 = 39;
export const NT_FIND_PATTERN: i32 = 40;
export const NT_FLOAT: i32 = 41;
export const NT_FOR: i32 = 42;
export const NT_FORWARD_ARG: i32 = 43;
export const NT_FORWARD_ARGS: i32 = 44;
export const NT_FORWARDED_ARGS: i32 = 45;
export const NT_FORWARDED_KWRESTARG: i32 = 46;
export const NT_FORWARDED_RESTARG: i32 = 47;
export const NT_GVAR: i32 = 48;
export const NT_GVASGN: i32 = 49;
export const NT_HASH: i32 = 50;
export const NT_HASH_PATTERN: i32 = 51;
export const NT_IDENT: i32 = 52;
export const NT_IF: i32 = 53;
export const NT_IF_GUARD: i32 = 54;
export const NT_IFLIPFLOP: i32 = 55;
export const NT_IN_MATCH: i32 = 56;
export const NT_IN_PATTERN: i32 = 57;
export const NT_INDEX: i32 = 58;
export const NT_INDEXASGN: i32 = 59;
export const NT_INT: i32 = 60;
export const NT_IRANGE: i32 = 61;
export const NT_IVAR: i32 = 62;
export const NT_IVASGN: i32 = 63;
export const NT_KWARG: i32 = 64;
export const NT_KWARGS: i32 = 65;
export const NT_KWBEGIN: i32 = 66;
export const NT_KWNILARG: i32 = 67;
export const NT_KWOPTARG: i32 = 68;
export const NT_KWRESTARG: i32 = 69;
export const NT_KWSPLAT: i32 = 70;
export const NT_LAMBDA: i32 = 71;
export const NT_LVAR: i32 = 72;
export const NT_LVASGN: i32 = 73;
export const NT_MASGN: i32 = 74;
export const NT_MATCH_ALT: i32 = 75;
export const NT_MATCH_AS: i32 = 76;
export const NT_MATCH_CURRENT_LINE: i32 = 77;
export const NT_MATCH_NIL_PATTERN: i32 = 78;
export const NT_MATCH_PATTERN: i32 = 79;
export const NT_MATCH_PATTERN_P: i32 = 80;
export const NT_MATCH_REST: i32 = 81;
export const NT_MATCH_VAR: i32 = 82;
export const NT_MATCH_WITH_LVASGN: i32 = 83;
export const NT_MATCH_WITH_TRAILING_COMMA: i32 = 84;
export const NT_MLHS: i32 = 85;
export const NT_MODULE: i32 = 86;
export const NT_NEXT: i32 = 87;
export const NT_NIL: i32 = 88;
export const NT_NOT: i32 = 89;
export const NT_NTH_REF: i32 = 90;
export const NT_NUMARGS: i32 = 91;
export const NT_NUMBLOCK: i32 = 92;
export const NT_OBJC_KWARG: i32 = 93;
export const NT_OBJC_RESTARG: i32 = 94;
export const NT_OBJC_VARARGS: i32 = 95;
export const NT_OP_ASGN: i32 = 96;
export const NT_OPTARG: i32 = 97;
export const NT_OR: i32 = 98;
export const NT_OR_ASGN: i32 = 99;
export const NT_PAIR: i32 = 100;
export const NT_PIN: i32 = 101;
export const NT_POSTEXE: i32 = 102;
export const NT_PREEXE: i32 = 103;
export const NT_PROCARG0: i32 = 104;
export const NT_RATIONAL: i32 = 105;
export const NT_REDO: i32 = 106;
export const NT_REGEXP: i32 = 107;
export const NT_REGOPT: i32 = 108;
export const NT_RESBODY: i32 = 109;
export const NT_RESCUE: i32 = 110;
export const NT_RESTARG: i32 = 111;
export const NT_RESTARG_EXPR: i32 = 112;
export const NT_RETRY: i32 = 113;
export const NT_RETURN: i32 = 114;
export const NT_SCLASS: i32 = 115;
export const NT_SELF: i32 = 116;
export const NT_SEND: i32 = 117;
export const NT_SHADOWARG: i32 = 118;
export const NT_SPLAT: i32 = 119;
export const NT_STR: i32 = 120;
export const NT_SUPER: i32 = 121;
export const NT_SYM: i32 = 122;
export const NT_TRUE: i32 = 123;
export const NT_UNDEF: i32 = 124;
export const NT_UNLESS_GUARD: i32 = 125;
export const NT_UNTIL: i32 = 126;
export const NT_UNTIL_POST: i32 = 127;
export const NT_WHEN: i32 = 128;
export const NT_WHILE: i32 = 129;
export const NT_WHILE_POST: i32 = 130;
export const NT_XSTR: i32 = 131;
export const NT_YIELD: i32 = 132;
export const NT_ZSUPER: i32 = 133;

/** The type name of a node type. */
export const rbTypeName = (t: i32): string => {
  switch (t) {
    case 0:
      return "__ENCODING__";
    case 1:
      return "__FILE__";
    case 2:
      return "__LINE__";
    case 3:
      return "alias";
    case 4:
      return "and";
    case 5:
      return "and_asgn";
    case 6:
      return "arg";
    case 7:
      return "arg_expr";
    case 8:
      return "args";
    case 9:
      return "array";
    case 10:
      return "array_pattern";
    case 11:
      return "array_pattern_with_tail";
    case 12:
      return "back_ref";
    case 13:
      return "begin";
    case 14:
      return "block";
    case 15:
      return "block_pass";
    case 16:
      return "blockarg";
    case 17:
      return "blockarg_expr";
    case 18:
      return "break";
    case 19:
      return "case";
    case 20:
      return "case_match";
    case 21:
      return "casgn";
    case 22:
      return "cbase";
    case 23:
      return "class";
    case 24:
      return "complex";
    case 25:
      return "const";
    case 26:
      return "const_pattern";
    case 27:
      return "csend";
    case 28:
      return "cvar";
    case 29:
      return "cvasgn";
    case 30:
      return "def";
    case 31:
      return "defined?";
    case 32:
      return "defs";
    case 33:
      return "dstr";
    case 34:
      return "dsym";
    case 35:
      return "eflipflop";
    case 36:
      return "empty_else";
    case 37:
      return "ensure";
    case 38:
      return "erange";
    case 39:
      return "false";
    case 40:
      return "find_pattern";
    case 41:
      return "float";
    case 42:
      return "for";
    case 43:
      return "forward_arg";
    case 44:
      return "forward_args";
    case 45:
      return "forwarded_args";
    case 46:
      return "forwarded_kwrestarg";
    case 47:
      return "forwarded_restarg";
    case 48:
      return "gvar";
    case 49:
      return "gvasgn";
    case 50:
      return "hash";
    case 51:
      return "hash_pattern";
    case 52:
      return "ident";
    case 53:
      return "if";
    case 54:
      return "if_guard";
    case 55:
      return "iflipflop";
    case 56:
      return "in_match";
    case 57:
      return "in_pattern";
    case 58:
      return "index";
    case 59:
      return "indexasgn";
    case 60:
      return "int";
    case 61:
      return "irange";
    case 62:
      return "ivar";
    case 63:
      return "ivasgn";
    case 64:
      return "kwarg";
    case 65:
      return "kwargs";
    case 66:
      return "kwbegin";
    case 67:
      return "kwnilarg";
    case 68:
      return "kwoptarg";
    case 69:
      return "kwrestarg";
    case 70:
      return "kwsplat";
    case 71:
      return "lambda";
    case 72:
      return "lvar";
    case 73:
      return "lvasgn";
    case 74:
      return "masgn";
    case 75:
      return "match_alt";
    case 76:
      return "match_as";
    case 77:
      return "match_current_line";
    case 78:
      return "match_nil_pattern";
    case 79:
      return "match_pattern";
    case 80:
      return "match_pattern_p";
    case 81:
      return "match_rest";
    case 82:
      return "match_var";
    case 83:
      return "match_with_lvasgn";
    case 84:
      return "match_with_trailing_comma";
    case 85:
      return "mlhs";
    case 86:
      return "module";
    case 87:
      return "next";
    case 88:
      return "nil";
    case 89:
      return "not";
    case 90:
      return "nth_ref";
    case 91:
      return "numargs";
    case 92:
      return "numblock";
    case 93:
      return "objc_kwarg";
    case 94:
      return "objc_restarg";
    case 95:
      return "objc_varargs";
    case 96:
      return "op_asgn";
    case 97:
      return "optarg";
    case 98:
      return "or";
    case 99:
      return "or_asgn";
    case 100:
      return "pair";
    case 101:
      return "pin";
    case 102:
      return "postexe";
    case 103:
      return "preexe";
    case 104:
      return "procarg0";
    case 105:
      return "rational";
    case 106:
      return "redo";
    case 107:
      return "regexp";
    case 108:
      return "regopt";
    case 109:
      return "resbody";
    case 110:
      return "rescue";
    case 111:
      return "restarg";
    case 112:
      return "restarg_expr";
    case 113:
      return "retry";
    case 114:
      return "return";
    case 115:
      return "sclass";
    case 116:
      return "self";
    case 117:
      return "send";
    case 118:
      return "shadowarg";
    case 119:
      return "splat";
    case 120:
      return "str";
    case 121:
      return "super";
    case 122:
      return "sym";
    case 123:
      return "true";
    case 124:
      return "undef";
    case 125:
      return "unless_guard";
    case 126:
      return "until";
    case 127:
      return "until_post";
    case 128:
      return "when";
    case 129:
      return "while";
    case 130:
      return "while_post";
    case 131:
      return "xstr";
    case 132:
      return "yield";
    case 133:
      return "zsuper";
    default:
      return "?";
  }
};
