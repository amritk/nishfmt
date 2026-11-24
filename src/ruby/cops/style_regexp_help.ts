// What the regexp cops read of RuboCop's RegexpNode#parsed_tree: the
// regexp_parser gem's scanner (a hand-written equivalent of its Ragel
// machines), the lexer's token splitting, and as much of its parser as
// decides whether a tree is built at all (parse errors give no tree), where
// the escapes are, and which character sets hold what.
//
// Ported from regexp_parser 2.13.4 (MIT License, Copyright (c) 2010-2026
// Ammar Ali) and RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { add32, atI32, sub32 } from "../../core/arr";
import { fault } from "../../core/fault";
import { NT_BEGIN, NT_REGOPT } from "../ast";
import { RbSource } from "../source";
import { rbRxKnownProperty } from "./style_regexp_props";

// Token types.
export const RX_LITERAL: i32 = 1;
export const RX_ESCAPE: i32 = 2;
export const RX_TYPE: i32 = 3;
export const RX_PROPERTY: i32 = 4;
export const RX_NONPROPERTY: i32 = 5;
export const RX_POSIX: i32 = 6;
export const RX_NONPOSIX: i32 = 7;
export const RX_SET: i32 = 8;
export const RX_GROUP: i32 = 9;
export const RX_ASSERTION: i32 = 10;
export const RX_BACKREF: i32 = 11;
export const RX_CONDITIONAL: i32 = 12;
export const RX_META: i32 = 13;
export const RX_ANCHOR: i32 = 14;
export const RX_KEEP: i32 = 15;
export const RX_QUANT: i32 = 16;
export const RX_FREESPACE: i32 = 17;

// Token kinds (the second element of a token) where they matter.
const RK_NONE: i32 = 0;
const RK_OPEN: i32 = 1;
const RK_CLOSE: i32 = 2;
const RK_NEGATE: i32 = 3;
const RK_RANGE: i32 = 4;
const RK_INTERSECTION: i32 = 5;
const RK_CAPTURE: i32 = 6;
const RK_NAMED: i32 = 7;
const RK_OPTIONS: i32 = 8;
const RK_OPTIONS_SWITCH: i32 = 9;
const RK_COMMENT: i32 = 10;
const RK_CONDITION_OPEN: i32 = 11;
const RK_CONDITION: i32 = 12;
const RK_CONDITION_CLOSE: i32 = 13;
const RK_SEPARATOR: i32 = 14;
const RK_ALTERNATION: i32 = 15;
const RK_CODEPOINT_LIST: i32 = 16;
const RK_GROUP_OTHER: i32 = 17;
// backreferences
const RK_NUMBER: i32 = 20;
const RK_NUMBER_REF: i32 = 21;
const RK_NUMBER_REL_REF: i32 = 22;
const RK_NAME_REF: i32 = 23;
const RK_NAME_RECURSION_REF: i32 = 24;
const RK_NUMBER_RECURSION_REF: i32 = 25;
const RK_NAME_CALL: i32 = 26;
const RK_NUMBER_CALL: i32 = 27;
const RK_NUMBER_REL_CALL: i32 = 28;

// Scanner states.
const RS_MAIN: i32 = 0;
const RS_SET: i32 = 1;
const RS_COND: i32 = 2;

const rbRxDigit = (c: i32): boolean => c >= 48 && c <= 57;
const rbRxOctal = (c: i32): boolean => c >= 48 && c <= 55;
const rbRxXdigit = (c: i32): boolean => rbRxDigit(c) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
const rbRxAlnum = (c: i32): boolean => rbRxDigit(c) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
/** Ragel's `space`: \t \n \v \f \r and the space. */
const rbRxSpace = (c: i32): boolean => c === 32 || (c >= 9 && c <= 13);
const rbRxNonprint = (c: i32): boolean => (c >= 1 && c <= 31) || c === 127;
/** meta_char: . \ | { } ( ) [ ] ^ $ ? * + */
const rbRxMeta = (c: i32): boolean =>
  c === 46 ||
  c === 92 ||
  c === 124 ||
  c === 123 ||
  c === 125 ||
  c === 40 ||
  c === 41 ||
  c === 91 ||
  c === 93 ||
  c === 94 ||
  c === 36 ||
  c === 63 ||
  c === 42 ||
  c === 43;
/** Whether `c` is one of the ASCII characters of `chars`. */
const rbRxIn = (c: i32, chars: string): boolean => c >= 0 && c < 128 && chars.indexOf(String.fromCharCode(c)) >= 0;

/** xs[i] = v; a fault outside `xs`. */
const rbRxPut = (xs: i32[], i: i32, v: i32): void => {
  if (i >= 0 && i < xs.length) {
    xs[i] = v;
  } else {
    fault();
  }
};

/** xs.pop() of a stack the parser knows is not empty; a fault when it is. */
const rbRxPop = (xs: i32[]): void => {
  if (xs.length > 0) {
    xs.pop();
  } else {
    fault();
  }
};

/** A code point range as a UTF-8 string. */
export const rbRxStr = (cs: i32[], s: i32, e: i32): string => {
  const out: string[] = [];
  if (s < e && (s < 0 || e > cs.length)) {
    fault();
    return "";
  }
  for (let i = s; i >= 0 && i < e && i < cs.length; i++) {
    const c = cs[i];
    if (c < 0x80) {
      out.push(String.fromCharCode(c));
    } else if (c < 0x800) {
      out.push(String.fromCharCode(0xc0 | (c >> 6)));
      out.push(String.fromCharCode(0x80 | (c & 0x3f)));
    } else if (c < 0x10000) {
      out.push(String.fromCharCode(0xe0 | (c >> 12)));
      out.push(String.fromCharCode(0x80 | ((c >> 6) & 0x3f)));
      out.push(String.fromCharCode(0x80 | (c & 0x3f)));
    } else {
      out.push(String.fromCharCode(0xf0 | (c >> 18)));
      out.push(String.fromCharCode(0x80 | ((c >> 12) & 0x3f)));
      out.push(String.fromCharCode(0x80 | ((c >> 6) & 0x3f)));
      out.push(String.fromCharCode(0x80 | (c & 0x3f)));
    }
  }
  return out.join("");
};

/**
 * The tokens of a regexp source (Regexp::Scanner.scan); `failed` when it raises.
 *
 * Positions are offsets into `cs`, below its length; a regexp of a source
 * file is far below 2^30 code points, so each step checks its position once
 * (a fault, and a failed scan, where that could not hold) and its sums of a
 * position and a few characters stay in i32.
 */
export class RbRxScan {
  cs: i32[];
  n: i32;
  p: i32 = 0;
  state: i32 = 0;
  failed: boolean = false;
  free: boolean = false;
  spFree: boolean[];
  spDepth: i32[];
  groupDepth: i32 = 0;
  setDepth: i32 = 0;
  capCount: i32 = 0;
  condStack: i32[];
  litStart: i32 = -1;
  litEnd: i32 = -1;
  prevT: i32 = 0;
  prevK: i32 = 0;
  // the tokens
  tt: i32[];
  tk: i32[];
  ts: i32[];
  te: i32[];
  // whether the token is inside a character set
  tset: boolean[];

  constructor(cs: i32[], extended: boolean) {
    this.cs = cs;
    this.n = toI32(cs.length);
    this.free = extended;
    this.spFree = [extended];
    this.spDepth = [0];
    this.condStack = [];
    this.tt = [];
    this.tk = [];
    this.ts = [];
    this.te = [];
    this.tset = [];
    this.scan();
  }

  /** A state the scanner's invariants rule out: a fault, and a scan that stops. */
  private bad(): void {
    fault();
    this.failed = true;
  }

  private at(i: i32): i32 {
    const cs = this.cs;
    // `n` is `cs.length` (the constructor).
    return i >= 0 && i < this.n && i < cs.length ? cs[i] : -1;
  }

  /** cs[i] where the scanner knows `i` is a position; -1 after bad() otherwise. */
  private cp(i: i32): i32 {
    const cs = this.cs;
    if (i >= 0 && i < cs.length) {
      return cs[i];
    }
    this.bad();
    return -1;
  }

  /** Whether the innermost open conditional was opened at group depth `v`. */
  private condTopIs(v: i32): boolean {
    const st = this.condStack;
    const t = toI32(st.length) - 1;
    return t >= 0 && t < st.length && st[t] === v;
  }

  private push(t: i32, k: i32, s: i32, e: i32): void {
    this.tt.push(t);
    this.tk.push(k);
    this.ts.push(s);
    this.te.push(e);
    this.tset.push(this.setDepth > 0);
    this.prevT = t;
    this.prevK = k;
  }

  private flush(): void {
    if (this.litStart >= 0) {
      const s = this.litStart;
      this.litStart = -1;
      this.push(RX_LITERAL, RK_NONE, s, this.litEnd);
    }
  }

  private emit(t: i32, k: i32, s: i32, e: i32): void {
    this.flush();
    this.push(t, k, s, e);
  }

  private append(s: i32, e: i32): void {
    if (this.litStart < 0) {
      this.litStart = s;
    }
    this.litEnd = e;
  }

  private scan(): void {
    while (this.p < this.n && !this.failed) {
      if (this.state === RS_SET) {
        this.setStep();
      } else if (this.state === RS_COND) {
        this.condStep();
      } else {
        this.mainStep();
      }
    }
    if (this.failed) {
      return;
    }
    if (this.groupDepth > 0 || this.setDepth > 0) {
      this.failed = true;
      return;
    }
    this.flush();
  }

  private afterEscape(): void {
    this.state = this.setDepth > 0 ? RS_SET : RS_MAIN;
  }

  // ---- main ------------------------------------------------------------------

  private mainStep(): void {
    const p = this.p;
    const cs = this.cs;
    const n = toI32(cs.length);
    // The scan loop runs while p < n: a position of the regexp, which is far below 2^30.
    if (p < 0 || p >= n || p > 1073741823 || n > 1073741823) {
      this.bad();
      return;
    }
    const c = cs[p];
    if (c === 46) {
      this.emit(RX_META, RK_NONE, p, p + 1);
      this.p = p + 1;
    } else if (c === 124) {
      if (this.condTopIs(this.groupDepth)) {
        this.emit(RX_CONDITIONAL, RK_SEPARATOR, p, p + 1);
      } else {
        this.emit(RX_META, RK_ALTERNATION, p, p + 1);
      }
      this.p = p + 1;
    } else if (c === 94 || c === 36) {
      this.emit(RX_ANCHOR, RK_NONE, p, p + 1);
      this.p = p + 1;
    } else if (c === 93 || c === 125) {
      this.append(p, p + 1);
      this.p = p + 1;
    } else if (c === 91) {
      this.setDepth = add32(this.setDepth, 1);
      this.emit(RX_SET, RK_OPEN, p, p + 1);
      this.p = p + 1;
      this.state = RS_SET;
    } else if (c === 40) {
      this.paren();
    } else if (c === 41) {
      // The depth this `)` closes, and the depth after it.
      const gd = this.groupDepth;
      const nd = sub32(gd, 1);
      this.groupDepth = nd;
      const cst = this.condStack;
      if (this.condTopIs(gd)) {
        if (cst.length > 0) {
          cst.pop();
        }
        this.emit(RX_CONDITIONAL, RK_CLOSE, p, p + 1);
      } else if (nd >= 0) {
        const spFree = this.spFree;
        const spDepth = this.spDepth;
        // spFree and spDepth grow together: the top entry and the one below it.
        const sl = toI32(spFree.length);
        if (sl > 1) {
          const top = sl - 1;
          const below = sl - 2;
          if (top < spFree.length && top < spDepth.length && spDepth[top] === gd) {
            const restored = spFree[below];
            if (spFree.length > 0) {
              spFree.pop();
            }
            if (spDepth.length > 0) {
              spDepth.pop();
            }
            this.free = restored;
          }
        }
        this.emit(RX_GROUP, RK_CLOSE, p, p + 1);
      } else {
        this.failed = true;
        return;
      }
      this.p = p + 1;
    } else if (c === 63 || c === 42 || c === 43) {
      const d = this.at(p + 1);
      let l = 1;
      if (d === 63 || d === 43) {
        l = 2;
      }
      this.emit(RX_QUANT, RK_NONE, p, p + l);
      this.p = p + l;
    } else if (c === 123) {
      const l = this.interval(p);
      if (l > 0) {
        const e = add32(p, l);
        this.emit(RX_QUANT, RK_NONE, p, e);
        this.p = e;
      } else {
        this.append(p, p + 1);
        this.p = p + 1;
      }
    } else if (c === 92) {
      this.backslashMain(p);
    } else if (c === 35) {
      if (this.free) {
        let e = p + 1;
        // `n` is `cs.length`.
        while (e >= 0 && e < cs.length && cs[e] !== 10) {
          e++;
        }
        if (e >= 0 && e < cs.length) {
          e++;
        }
        this.emit(RX_FREESPACE, RK_COMMENT, p, e);
        this.p = e;
      } else {
        this.append(p, p + 1);
        this.p = p + 1;
      }
    } else if (c === 0) {
      this.failed = true;
    } else {
      // space+ | (ascii_print -- space)+ | ascii_nonprint+ | utf8_multibyte+
      // `at` answers -1 past the end, which no run takes, so each run stays
      // below the length (under 2^30): the bound on the counts adds nothing.
      let ls = 0;
      while (ls < 1073741824 && rbRxSpace(this.at(p + ls))) {
        ls++;
      }
      let ln = 0;
      while (ln < 1073741824 && rbRxNonprint(this.at(p + ln))) {
        ln++;
      }
      if (ls > 0 && ls >= ln) {
        const e = add32(p, ls);
        if (this.free) {
          this.emit(RX_FREESPACE, RK_NONE, p, e);
        } else {
          this.append(p, e);
        }
        this.p = e;
        return;
      }
      let l = ln;
      if (l === 0 && c >= 0x80) {
        while (l < 1073741824 && this.at(p + l) >= 0x80) {
          l++;
        }
      } else if (l === 0) {
        while (l < 1073741824) {
          const d = this.at(p + l);
          if (d < 33 || d > 126 || rbRxMeta(d) || d === 35) {
            break;
          }
          l++;
        }
      }
      const e = add32(p, l);
      this.append(p, e);
      this.p = e;
    }
  }

  /** quantifier_interval at `p` (`{`): its length, or 0. */
  private interval(p: i32): i32 {
    const cs = this.cs;
    const n = toI32(cs.length);
    // A position of the regexp, which is far below 2^30.
    if (p < 0 || p >= n || p > 1073741823 || n > 1073741823) {
      this.bad();
      return 0;
    }
    // `at` answers -1 from `n` on, which is no digit: `i < n` adds nothing.
    // Only whether a and b are 0 counts.
    let i = p + 1;
    let a = 0;
    while (i < n && rbRxDigit(this.at(i))) {
      i++;
      a = 1;
    }
    let b = 0;
    let comma = false;
    if (i < n && this.at(i) === 44) {
      comma = true;
      i++;
      while (i < n && rbRxDigit(this.at(i))) {
        i++;
        b = 1;
      }
    }
    if (i < 0 || i >= n || this.at(i) !== 125) {
      return 0;
    }
    if (a === 0 && (!comma || b === 0)) {
      return 0;
    }
    return i + 1 - p;
  }

  /** A group name `<...>` or `'...'` at `i` (name optional): its length, or 0. */
  private groupName(i: i32): i32 {
    const o = this.at(i);
    if (o !== 60 && o !== 39) {
      return 0;
    }
    // `at` gave a character, so `i` is a position.
    const cs = this.cs;
    const n = toI32(cs.length);
    // A position of the regexp, which is far below 2^30.
    if (i < 0 || i >= n || i > 1073741823 || n > 1073741823) {
      this.bad();
      return 0;
    }
    const close = o === 60 ? 62 : 39;
    let j = i + 1;
    const f = this.at(j);
    if (f === close) {
      return 2;
    }
    if (f < 0 || (o === 60 ? rbRxIn(f, "!=0123456789->") : rbRxIn(f, "0123456789-'"))) {
      return 0;
    }
    while (j >= 0 && j < n && cs[j] !== close) {
      j++;
    }
    if (j >= 0 && j < n) {
      return j + 1 - i;
    }
    return 0;
  }

  /** group_ref_body / the body of \k and \g at `i`: its length, or 0. */
  private refBody(i: i32): i32 {
    const o = this.at(i);
    if (o !== 60 && o !== 39) {
      return 0;
    }
    // `at` gave a character, so `i` is a position.
    const cs = this.cs;
    const n = toI32(cs.length);
    // A position of the regexp, which is far below 2^30.
    if (i < 0 || i >= n || i > 1073741823 || n > 1073741823) {
      this.bad();
      return 0;
    }
    const close = o === 60 ? 62 : 39;
    // the longest of: name? level?, number level?
    const i1 = i + 1;
    let j = i1;
    // `n` is `cs.length`.
    while (j >= 0 && j < cs.length && cs[j] !== close) {
      j++;
    }
    if (j < 0 || j >= cs.length) {
      return 0;
    }
    const f = this.at(i1);
    let ok = j === i1;
    if (!ok && !(o === 60 ? rbRxIn(f, "!=0123456789->") : rbRxIn(f, "0123456789-'"))) {
      ok = true; // a name (whose tail may hold a level)
    }
    if (!ok) {
      // -?[0-9]+ ([+-][0-9]+)?, or a bare level [+-][0-9]+
      // (`at` answers -1 from `n` on, so `k < n` adds nothing; only d > 0 counts)
      let k = i1;
      if (this.at(k) === 45 || this.at(k) === 43) {
        k++;
      }
      let d = 0;
      while (k < n && rbRxDigit(this.at(k))) {
        k++;
        d = 1;
      }
      if (d > 0 && k < n && (this.at(k) === 43 || this.at(k) === 45)) {
        k++;
        let d2 = 0;
        while (k < n && rbRxDigit(this.at(k))) {
          k++;
          d2 = 1;
        }
        if (d2 === 0) {
          d = 0;
        }
      }
      ok = d > 0 && k === j;
    }
    if (ok) {
      return j + 1 - i;
    }
    return 0;
  }

  /** `(` in main. */
  private paren(): void {
    const p = this.p;
    const cs = this.cs;
    const n = toI32(cs.length);
    // A position of the regexp, which is far below 2^30.
    if (p < 0 || p >= n || p > 1073741823 || n > 1073741823) {
      this.bad();
      return;
    }
    const q = this.at(p + 1) === 63;
    // candidate lengths, in the order of the scanner's patterns
    let lCond = 0;
    let lComment = 0;
    let lOpts = 0;
    let lAssert = 0;
    let lType = 0;
    if (q) {
      const c2 = this.at(p + 2);
      if (c2 === 40) {
        lCond = 3;
      }
      if (c2 === 35) {
        let j = p + 3;
        // `n` is `cs.length`.
        while (j >= 0 && j < cs.length && cs[j] !== 41) {
          j++;
        }
        if (j >= 0 && j < cs.length) {
          lComment = j + 1 - p;
        }
      }
      let j = p + 2;
      while (j >= 0 && j < cs.length && !rbRxIn(cs[j], "!#'():<=>~")) {
        j++;
      }
      lOpts = sub32(j, p);
      if (j > p + 2 && this.at(j) === 58) {
        lOpts = add32(lOpts, 1);
      }
      if (c2 === 61 || c2 === 33) {
        lAssert = 3;
      } else if (c2 === 60 && (this.at(p + 3) === 61 || this.at(p + 3) === 33)) {
        lAssert = 4;
      }
      if (c2 === 62 || c2 === 58 || c2 === 126) {
        lType = 3;
      } else if (c2 === 60 || c2 === 39) {
        const g = this.groupName(p + 2);
        if (g > 0) {
          lType = add32(2, g);
        }
      }
    }
    let best = 1;
    let which = 5;
    const ls: i32[] = [lCond, lComment, lOpts, lAssert, lType];
    for (let i = 0; i < 5 && i < ls.length; i++) {
      if (ls[i] > best || (ls[i] === best && ls[i] > 1 && i < which)) {
        best = ls[i];
        which = i;
      }
    }
    // every pattern here shares the `(` that opens a group
    this.groupDepth = add32(this.groupDepth, 1);
    const e = add32(p, best);
    if (which === 0) {
      this.condStack.push(this.groupDepth);
      this.emit(RX_CONDITIONAL, RK_OPEN, p, p + 2);
      this.emit(RX_CONDITIONAL, RK_CONDITION_OPEN, p + 2, p + 3);
      this.p = e;
      this.state = RS_COND;
      return;
    }
    if (which === 1) {
      this.groupDepth = sub32(this.groupDepth, 1);
      this.emit(RX_GROUP, RK_COMMENT, p, e);
      this.p = e;
      return;
    }
    if (which === 2) {
      // text[2..-1] =~ /([^\-mixdau:]|^$)|-.*([dau])/ raises
      if (e === p + 2) {
        this.failed = true;
        return;
      }
      let dash = false;
      for (let i = p + 2; i < e; i++) {
        const c = this.cp(i);
        if (!rbRxIn(c, "-mixdau:")) {
          this.failed = true;
          return;
        }
        if (c === 45) {
          dash = true;
        } else if (dash && rbRxIn(c, "dau")) {
          this.failed = true;
          return;
        }
      }
      this.options(p, e);
      this.p = e;
      return;
    }
    if (which === 3) {
      this.emit(RX_ASSERTION, RK_GROUP_OTHER, p, e);
      this.p = e;
      return;
    }
    if (which === 4) {
      if (best === 4 && (this.at(p + 2) === 60 || this.at(p + 2) === 39)) {
        // (?<> or (?'': the name is empty
        this.failed = true;
        return;
      }
      this.emit(RX_GROUP, this.at(p + 2) === 60 || this.at(p + 2) === 39 ? RK_NAMED : RK_GROUP_OTHER, p, e);
      this.p = e;
      return;
    }
    this.capCount = add32(this.capCount, 1);
    this.emit(RX_GROUP, RK_CAPTURE, p, p + 1);
    this.p = p + 1;
  }

  /** emit_options for `(?...` at [p, e). */
  private options(p: i32, e: i32): void {
    const cs = this.cs;
    const n = toI32(cs.length);
    // A position of the regexp, which is far below 2^30.
    if (p < 0 || p >= n || p > 1073741823 || n > 1073741823) {
      this.bad();
      return;
    }
    // /\(\?([mixdau]*)(-(?:[mix]*))*(:)?/
    let i = p + 2;
    let posX = false;
    while (i < e) {
      const c = this.cp(i);
      if (!rbRxIn(c, "mixdau")) {
        break;
      }
      if (c === 120) {
        posX = true;
      }
      i++;
    }
    let negX = false;
    let hasNeg = false;
    while (i < e && this.cp(i) === 45) {
      hasNeg = true;
      negX = false;
      i++;
      while (i < e) {
        const c = this.cp(i);
        if (!rbRxIn(c, "mix")) {
          break;
        }
        if (c === 120) {
          negX = true;
        }
        i++;
      }
    }
    const local = i < e && this.cp(i) === 58;
    if (posX) {
      this.free = true;
    }
    if (hasNeg && negX) {
      this.free = false;
    }
    if (local) {
      this.spFree.push(this.free);
      this.spDepth.push(this.groupDepth);
      this.emit(RX_GROUP, RK_OPTIONS, p, e);
    } else {
      const sf = this.spFree;
      const top = toI32(sf.length) - 1;
      if (top >= 0 && top < sf.length) {
        sf[top] = this.free;
      } else {
        this.bad();
      }
      this.emit(RX_GROUP, RK_OPTIONS_SWITCH, p, e);
    }
  }

  /** `\` in main. */
  private backslashMain(p: i32): void {
    const cs = this.cs;
    const n = toI32(cs.length);
    // A position of the regexp, which is far below 2^30.
    if (p < 0 || p >= n || p > 1073741823 || n > 1073741823) {
      this.bad();
      return;
    }
    const d = this.at(p + 1);
    if (d === 75) {
      this.emit(RX_KEEP, RK_NONE, p, p + 2);
      this.p = p + 2;
      return;
    }
    if (rbRxIn(d, "AbBzZG")) {
      this.emit(RX_ANCHOR, RK_NONE, p, p + 2);
      this.p = p + 2;
      return;
    }
    if (d === 107 || d === 103) {
      const l = this.refBody(p + 2);
      if (l > 0) {
        const e = add32(p + 2, l);
        const k = d === 107 ? this.refKind(p, e) : this.callKind(p, e);
        if (k < 0) {
          this.failed = true;
          return;
        }
        this.emit(RX_BACKREF, k, p, e);
        this.p = e;
        return;
      }
    }
    this.escape(p);
  }

  /** The text of [s, e) without the `\k<` and `>`: the body of a reference. */
  private refInner(s: i32, e: i32): i32[] {
    const out: i32[] = [];
    const lo = add32(s, 3);
    const hi = sub32(e, 1);
    for (let i = lo; i < hi; i++) {
      out.push(this.cp(i));
    }
    return out;
  }

  /** The \k reference kinds (scanner.rl's regexps on the text), or -1. */
  private refKind(s: i32, e: i32): i32 {
    const b = this.refInner(s, e);
    const n = toI32(b.length);
    if (n === 0 || !(b.length > 0)) {
      return -1;
    }
    const b0 = b[0];
    let nl = false;
    for (let i = 1; i < n; i++) {
      if (b[i] === 10) {
        nl = true;
      }
    }
    // /^\\k(.)[^0-9\-][^+\-]*['>]$/
    if (!rbRxDigit(b0) && b0 !== 45) {
      let plain = true;
      for (let i = 1; i < n; i++) {
        if (b[i] === 43 || b[i] === 45) {
          plain = false;
        }
      }
      if (plain) {
        return RK_NAME_REF;
      }
    }
    // /^\\k(.)0*[1-9]\d*['>]$/ and /^\\k(.)-0*[1-9]\d*['>]$/
    const st = b0 === 45 ? 1 : 0;
    let allD = n > st;
    let nonzero = false;
    for (let i = st; i >= 0 && i < n; i++) {
      if (!rbRxDigit(b[i])) {
        allD = false;
      } else if (b[i] !== 48) {
        nonzero = true;
      }
    }
    if (allD && nonzero) {
      return st === 0 ? RK_NUMBER_REF : RK_NUMBER_REL_REF;
    }
    // a trailing level [+\-]\d+
    let j = n - 1;
    while (j >= 0 && j < n && rbRxDigit(b[j])) {
      j--;
    }
    if (j >= 0 && j < n - 1) {
      const bj = b[j];
      if (bj === 43 || bj === 45) {
        // /^\\k(.)[^0-9\-].*[+\-]\d+['>]$/
        if (j >= 1 && !rbRxDigit(b0) && b0 !== 45 && !nl) {
          return RK_NAME_RECURSION_REF;
        }
        // /^\\k(.)-?0*[1-9]\d*[+\-]\d+['>]$/
        const s2 = b0 === 45 ? 1 : 0;
        let ok = j > s2;
        let nz = false;
        for (let i = s2; i >= 0 && i < j && i < n; i++) {
          if (!rbRxDigit(b[i])) {
            ok = false;
          } else if (b[i] !== 48) {
            nz = true;
          }
        }
        if (ok && nz) {
          return RK_NUMBER_RECURSION_REF;
        }
      }
    }
    return -1;
  }

  /** The \g call kinds, or -1. */
  private callKind(s: i32, e: i32): i32 {
    const b = this.refInner(s, e);
    const n = toI32(b.length);
    if (n === 0 || !(b.length > 0)) {
      return -1;
    }
    const b0 = b[0];
    // /^\\g(.)[^0-9+\-].*['>]$/
    if (!rbRxDigit(b0) && b0 !== 43 && b0 !== 45) {
      let nl = false;
      for (const c of b) {
        if (c === 10) {
          nl = true;
        }
      }
      if (!nl) {
        return RK_NAME_CALL;
      }
    }
    // /^\\g(.)(?:0|0*[1-9]\d*)['>]$/
    let allD = true;
    let nz = false;
    for (const c of b) {
      if (!rbRxDigit(c)) {
        allD = false;
      } else if (c !== 48) {
        nz = true;
      }
    }
    if (allD && (nz || n === 1)) {
      return RK_NUMBER_CALL;
    }
    // /^\\g(.)[+-]0*[1-9]\d*/
    if (b0 === 43 || b0 === 45) {
      let i = 1;
      while (i < n && b[i] === 48) {
        i++;
      }
      if (i < n && b[i] >= 49 && b[i] <= 57) {
        return RK_NUMBER_REL_CALL;
      }
    }
    return -1;
  }

  // ---- escapes ---------------------------------------------------------------

  /** escape_sequence after the backslash at `b`. */
  private escape(b: i32): void {
    const cs = this.cs;
    const n = toI32(cs.length);
    // A position of the regexp, which is far below 2^30.
    if (b < 0 || b >= n || b > 1073741823 || n > 1073741823) {
      this.bad();
      return;
    }
    const q = b + 1;
    // `n` is `cs.length`.
    if (q >= n || q >= cs.length) {
      this.failed = true;
      return;
    }
    const c = cs[q];
    if (c >= 49 && c <= 57) {
      // [1-9][0-9]* (`at` answers -1 from `n` on, which is no digit)
      let e = q + 1;
      while (e < n && rbRxDigit(this.at(e))) {
        e++;
      }
      const nd = sub32(e, q);
      // The value of the first nine digits: below 10^9.
      let v = 0;
      for (let i = q; i < e && i < q + 9; i++) {
        if (v < 0 || v > 214748339) {
          this.bad();
          return;
        }
        v = v * 10 + ((this.cp(i) & 0xff) - 48);
      }
      let allOct = nd >= 2;
      for (let i = q; i < e; i++) {
        if (!rbRxOctal(this.cp(i))) {
          allOct = false;
        }
      }
      if (nd === 1 || (nd <= 9 && v <= this.capCount)) {
        this.emit(RX_BACKREF, RK_NUMBER, b, e);
      } else if (allOct) {
        this.emit(RX_ESCAPE, RK_NONE, b, e);
      } else {
        this.emit(RX_ESCAPE, RK_NONE, b, b + 2);
        this.emit(RX_LITERAL, RK_NONE, b + 2, e);
      }
      this.p = e;
      this.afterEscape();
      return;
    }
    if (c === 48) {
      let e = q + 1;
      while (e < q + 3 && rbRxOctal(this.at(e))) {
        e++;
      }
      this.emitEscape(b, e, RK_NONE);
      return;
    }
    if (rbRxMeta(c) || rbRxIn(c, "abefnrtv")) {
      this.emitEscape(b, q + 1, RK_NONE);
      return;
    }
    if (c === 117) {
      // codepoint_sequence
      if (this.at(q + 1) === 123) {
        let i = q + 2;
        while (true) {
          // `at` answers -1 from `n` on, which is no hex digit or space.
          let h = 0;
          while (h < 7 && i < n && rbRxXdigit(this.at(i))) {
            i++;
            h++;
          }
          if (h === 0 || h > 6) {
            this.failed = true;
            return;
          }
          if (this.at(i) === 125) {
            this.emitEscape(b, add32(i, 1), RK_CODEPOINT_LIST);
            return;
          }
          if (i >= n || !rbRxSpace(this.at(i))) {
            this.failed = true;
            return;
          }
          i++;
        }
      }
      for (let i = 1; i <= 4; i++) {
        if (!rbRxXdigit(this.at(q + i))) {
          this.failed = true;
          return;
        }
      }
      this.emitEscape(b, q + 5, RK_NONE);
      return;
    }
    if (c === 120) {
      // high_hex_sequence (split into \xHH escapes: RuboCop's encoding is BINARY), hex_sequence
      const h1 = this.at(q + 1);
      if (rbRxIn(h1, "89ABCDEFabcdef") && rbRxXdigit(this.at(q + 2))) {
        let s = b;
        let e = q + 3;
        while (true) {
          this.emit(RX_ESCAPE, RK_NONE, s, e);
          // `at` answers -1 from `n` on, which is no `\`.
          if (
            e < n &&
            this.at(e) === 92 &&
            this.at(e + 1) === 120 &&
            rbRxIn(this.at(e + 2), "89ABCDEFabcdef") &&
            rbRxXdigit(this.at(e + 3))
          ) {
            s = e;
            e += 4;
            continue;
          }
          break;
        }
        this.p = e;
        this.afterEscape();
        return;
      }
      if (rbRxXdigit(h1)) {
        let e = q + 2;
        if (rbRxXdigit(this.at(q + 2))) {
          e = q + 3;
        }
        this.emitEscape(b, e, RK_NONE);
        return;
      }
      this.failed = true;
      return;
    }
    if (c === 99 || c === 67 || c === 77) {
      // control_sequence ('c' | 'C-') (\M-)? \? any; meta_sequence 'M-' (\ ('c' | 'C-'))? \? any
      // `i` moves at most 6 past q + 1, a few past a position below 2^30.
      let i = q + 1;
      if (c === 67 || c === 77) {
        if (this.at(i) !== 45) {
          this.failed = true;
          return;
        }
        i = add32(i, 1);
      }
      if (c === 77) {
        if (this.at(i) === 92 && this.at(add32(i, 1)) === 99) {
          i = add32(i, 2);
        } else if (this.at(i) === 92 && this.at(add32(i, 1)) === 67 && this.at(add32(i, 2)) === 45) {
          i = add32(i, 3);
        }
      } else if (this.at(i) === 92 && this.at(add32(i, 1)) === 77 && this.at(add32(i, 2)) === 45) {
        i = add32(i, 3);
      }
      // `\`? any: the longest
      if (this.at(i) === 92) {
        if (add32(i, 1) >= n) {
          this.failed = true;
          return;
        }
        i = add32(i, 2);
      } else if (i < n) {
        i += 1;
      } else {
        this.failed = true;
        return;
      }
      // emit_meta_control_sequence: the input's last byte must be ASCII
      const last = toI32(cs.length) - 1;
      if (last < 0 || last >= cs.length) {
        this.bad();
        return;
      }
      if (cs[last] >= 0x80) {
        this.failed = true;
        return;
      }
      this.emitEscape(b, i, RK_NONE);
      return;
    }
    if (rbRxIn(c, "dDhHsSwWRX")) {
      this.emit(RX_TYPE, RK_NONE, b, q + 1);
      this.p = q + 1;
      this.afterEscape();
      return;
    }
    if (c === 112 || c === 80) {
      this.property(b);
      return;
    }
    if (rbRxIn(c, "dDhHsSwWRXAbBzZGabefnrtvKCMcux")) {
      this.failed = true;
      return;
    }
    this.emitEscape(b, q + 1, RK_NONE);
  }

  private emitEscape(b: i32, e: i32, k: i32): void {
    this.emit(RX_ESCAPE, k, b, e);
    this.p = e;
    this.afterEscape();
  }

  /** unicode_property after `\` at `b` (`p` or `P` at b + 1). */
  private property(b: i32): void {
    const cs = this.cs;
    const n = toI32(cs.length);
    // A position of the regexp, which is far below 2^30.
    if (b < 0 || b >= n || b > 1073741823 || n > 1073741823) {
      this.bad();
      return;
    }
    const q = b + 1;
    if (this.at(q + 1) === 123) {
      let i = q + 2;
      if (this.at(i) === 94) {
        i++;
      }
      const s = i;
      // `n` is `cs.length`.
      while (i >= 0 && i < n && i < cs.length) {
        const c = cs[i];
        if (!(rbRxAlnum(c) || rbRxSpace(c) || rbRxIn(c, "_-.="))) {
          break;
        }
        i++;
      }
      if (i >= n) {
        // premature end inside the property
        this.failed = true;
        return;
      }
      if (i > s && this.cp(i) === 125) {
        // name = text[3..-2].gsub(/[\^\s_\-]/, '').downcase
        const nm: i32[] = [];
        for (let j = q + 2; j < i; j++) {
          const c = this.cp(j);
          if (c === 94 || rbRxSpace(c) || c === 95 || c === 45) {
            continue;
          }
          if (c >= 65 && c <= 90) {
            nm.push(c + 32);
          } else {
            nm.push(c);
          }
        }
        if (!rbRxKnownProperty(rbRxStr(nm, 0, toI32(nm.length)))) {
          this.failed = true;
          return;
        }
        const neg = (this.cp(q) === 80) !== (this.at(q + 2) === 94);
        const e = add32(i, 1);
        this.emit(neg ? RX_NONPROPERTY : RX_PROPERTY, RK_NONE, b, e);
        this.p = e;
        this.afterEscape();
        return;
      }
    }
    this.emitEscape(b, q + 1, RK_NONE);
  }

  // ---- character sets --------------------------------------------------------

  private setStep(): void {
    const p = this.p;
    const cs = this.cs;
    const n = toI32(cs.length);
    // The scan loop runs while p < n: a position of the regexp, which is far below 2^30.
    if (p < 0 || p >= n || p > 1073741823 || n > 1073741823) {
      this.bad();
      return;
    }
    const c = cs[p];
    const d = this.at(p + 1);
    if (c === 93) {
      this.setDepth = sub32(this.setDepth, 1);
      this.emit(RX_SET, RK_CLOSE, p, p + 1);
      this.p = p + 1;
      this.state = this.setDepth > 0 ? RS_SET : RS_MAIN;
      return;
    }
    if (c === 45) {
      if (d === 93) {
        this.emit(RX_LITERAL, RK_NONE, p, p + 1);
        this.setDepth = sub32(this.setDepth, 1);
        this.emit(RX_SET, RK_CLOSE, p + 1, p + 2);
        this.p = p + 2;
        this.state = this.setDepth > 0 ? RS_SET : RS_MAIN;
        return;
      }
      if (d === 38 && this.at(p + 2) === 38) {
        this.emit(RX_LITERAL, RK_NONE, p, p + 1);
        this.emit(RX_SET, RK_INTERSECTION, p + 1, p + 3);
        this.p = p + 3;
        return;
      }
      if (this.prevT === RX_SET) {
        this.emit(RX_LITERAL, RK_NONE, p, p + 1);
      } else {
        this.emit(RX_SET, RK_RANGE, p, p + 1);
      }
      this.p = p + 1;
      return;
    }
    if (c === 94) {
      this.emit(this.prevK === RK_OPEN ? RX_SET : RX_LITERAL, this.prevK === RK_OPEN ? RK_NEGATE : RK_NONE, p, p + 1);
      this.p = p + 1;
      return;
    }
    if (c === 38 && d === 38) {
      this.emit(RX_SET, RK_INTERSECTION, p, p + 2);
      this.p = p + 2;
      return;
    }
    if (c === 92) {
      if (d < 0) {
        this.failed = true;
        return;
      }
      if (rbRxOctal(d)) {
        let e = p + 2;
        while (e < p + 4 && rbRxOctal(this.at(e))) {
          e++;
        }
        this.emitEscape(p, e, RK_NONE);
        return;
      }
      if (rbRxIn(d, "\\[]abefnrtvpPCMcuxdDhHsSwW")) {
        this.escape(p);
        return;
      }
      this.emitEscape(p, p + 2, RK_NONE);
      return;
    }
    if (c === 91) {
      // class_posix: [: ^? [^\[\]]* :]
      if (d === 58) {
        let j = p + 2;
        // `n` is `cs.length`.
        while (j >= 0 && j < n && j < cs.length && cs[j] !== 91 && cs[j] !== 93) {
          j++;
        }
        if (j >= 0 && j < n && j < cs.length && cs[j] === 93 && j - 1 >= p + 2) {
          const jm = j - 1;
          if (jm < cs.length && cs[jm] === 58) {
            let s = p + 2;
            let t = RX_POSIX;
            if (this.cp(s) === 94) {
              s++;
              t = RX_NONPOSIX;
            }
            const name = rbRxStr(cs, s, jm);
            if (
              ",alnum,alpha,ascii,blank,cntrl,digit,graph,lower,print,punct,space,upper,word,xdigit,".indexOf(
                `,${name},`,
              ) < 0
            ) {
              this.failed = true;
              return;
            }
            this.emit(t, RK_NONE, p, j + 1);
            this.p = j + 1;
            return;
          }
        }
      }
      this.setDepth = add32(this.setDepth, 1);
      this.emit(RX_SET, RK_OPEN, p, p + 1);
      this.p = p + 1;
      return;
    }
    this.emit(RX_LITERAL, RK_NONE, p, p + 1);
    this.p = p + 1;
  }

  // ---- conditions ------------------------------------------------------------

  private condStep(): void {
    const p = this.p;
    const cs = this.cs;
    const n = toI32(cs.length);
    // A position of the regexp, which is far below 2^30.
    if (p < 0 || p >= n || p > 1073741823 || n > 1073741823) {
      this.bad();
      return;
    }
    let l = this.groupName(p);
    if (l === 0) {
      // `at` answers -1 from `n` on, which is no digit; only d > 0 counts.
      let i = p;
      if (this.at(i) === 45) {
        i++;
      }
      let d = 0;
      while (i < n && rbRxDigit(this.at(i))) {
        i++;
        d = 1;
      }
      if (d > 0) {
        l = sub32(i, p);
      }
    }
    const end = add32(p, l);
    if (l > 0 && this.at(end) === 41) {
      let nonzero = false;
      for (let i = p; i < end; i++) {
        if (this.cp(i) !== 48) {
          nonzero = true;
        }
      }
      if (!nonzero) {
        this.failed = true;
        return;
      }
      const after = add32(end, 1);
      this.emit(RX_CONDITIONAL, RK_CONDITION, p, end);
      this.emit(RX_CONDITIONAL, RK_CONDITION_CLOSE, end, after);
      this.p = after;
      return;
    }
    this.state = RS_MAIN;
  }
}

/** A character set of the tree. */
export class RbRxSet {
  // its begin, and the end of loc.body, in the scanned string
  s: i32;
  bodyE: i32;
  count: i32 = 0;
  negative: boolean = false;
  intersected: boolean = false;
  rangeOpen: boolean = false;
  // its first expression: a token index, or -1 for a set (a nested set, a range, an intersection)
  first: i32 = -2;

  constructor(s: i32) {
    this.s = s;
    this.bodyE = s;
  }
}

/** What the cops read of a regexp's parsed_tree (null: no tree). */
export class RbRxTree {
  // the scanned string (RegexpNode#with_interpolations_blanked)
  cs: i32[];
  sc: RbRxScan;
  // tokens after the lexer (positions shifted where it splits a codepoint list)
  tt: i32[];
  tk: i32[];
  ts: i32[];
  te: i32[];
  tset: boolean[];
  // texts that differ from the scanned string (a split codepoint list), else ""
  tx: string[];
  // the scanner token each token comes from
  src: i32[];
  sets: RbRxSet[];
  failed: boolean = false;

  constructor(cs: i32[], extended: boolean) {
    this.cs = cs;
    this.sc = new RbRxScan(cs, extended);
    this.src = [];
    this.tt = [];
    this.tk = [];
    this.ts = [];
    this.te = [];
    this.tset = [];
    this.tx = [];
    this.sets = [];
    if (this.sc.failed) {
      this.failed = true;
      return;
    }
    this.lex();
    this.parse();
  }

  /** The text of token `i`. */
  text(i: i32): string {
    const tx = this.tx;
    if (i < 0 || i >= tx.length) {
      fault();
      return "";
    }
    const t = tx[i];
    if (t.length > 0) {
      return t;
    }
    // Every token comes from a scanner token (add).
    const srcs = this.src;
    const sts = this.sc.ts;
    const ste = this.sc.te;
    if (i >= srcs.length) {
      fault();
      return "";
    }
    const j = srcs[i];
    if (j < 0 || j >= sts.length || j >= ste.length) {
      fault();
      return "";
    }
    return rbRxStr(this.cs, sts[j], ste[j]);
  }

  private add(j: i32, s: i32, e: i32, tx: string): void {
    const stt = this.sc.tt;
    const stk = this.sc.tk;
    const sset = this.sc.tset;
    // The scanner's arrays grow together, and `j` is one of its tokens.
    if (j < 0 || j >= stt.length || j >= stk.length || j >= sset.length) {
      fault();
      return;
    }
    const t = stt[j];
    const k = stk[j];
    const inSet = sset[j];
    this.tt.push(t);
    this.tk.push(k);
    this.ts.push(s);
    this.te.push(e);
    this.tset.push(inSet);
    this.tx.push(tx);
    this.src.push(j);
  }

  /** Drops the last token (each of the token arrays holds it). */
  private dropLast(): void {
    const tt = this.tt;
    const tk = this.tk;
    const ts = this.ts;
    const te = this.te;
    const tset = this.tset;
    const tx = this.tx;
    const srcs = this.src;
    if (tt.length > 0) {
      tt.pop();
    }
    if (tk.length > 0) {
      tk.pop();
    }
    if (ts.length > 0) {
      ts.pop();
    }
    if (te.length > 0) {
      te.pop();
    }
    if (tset.length > 0) {
      tset.pop();
    }
    if (tx.length > 0) {
      tx.pop();
    }
    if (srcs.length > 0) {
      srcs.pop();
    }
  }

  /** Regexp::Lexer: splits a codepoint list a quantifier follows, shifting what comes after. */
  private lex(): void {
    const sc = this.sc;
    const stt = sc.tt;
    const sts = sc.ts;
    const ste = sc.te;
    let shift = 0;
    for (let j = 0; j < stt.length; j++) {
      const k = toI32(this.tt.length);
      if (stt[j] === RX_QUANT && k > 0) {
        // The token arrays grow together.
        const km = k - 1;
        const tk = this.tk;
        if (km >= tk.length) {
          fault();
          return;
        }
        if (tk[km] === RK_CODEPOINT_LIST) {
          const t = this.text(km);
          const tl = toI32(t.length);
          // lead, _, tail = text.rpartition(' ')
          let sp = -1;
          for (let i = tl - 1; i >= 0 && i < tl; i--) {
            if (t.charCodeAt(i) === 32) {
              sp = i;
              break;
            }
          }
          if (sp > 0 && sp < tl) {
            const lead = t.substring(0, sp);
            const tail = t.substring(sp + 1, tl);
            const ts = this.ts;
            const te = this.te;
            const srcs = this.src;
            if (km >= ts.length || km >= te.length || km >= srcs.length) {
              fault();
              return;
            }
            const s0 = ts[km];
            const e0 = te[km];
            const j0 = srcs[km];
            this.dropLast();
            this.add(j0, s0, sub32(e0, toI32(tail.length)), `${lead}}`);
            this.add(j0, add32(add32(s0, toI32(lead.length)), 1), add32(e0, 3), `\\u{${tail}`);
            shift = add32(shift, 3);
          }
        }
      }
      if (j >= sts.length || j >= ste.length) {
        fault();
        return;
      }
      this.add(j, add32(sts[j], shift), add32(ste[j], shift), "");
    }
  }

  /** The set `si`; a fault and a stand-in when it is not one. */
  private setAt(si: i32): RbRxSet {
    const sets = this.sets;
    if (si >= 0 && si < sets.length) {
      return sets[si];
    }
    fault();
    return new RbRxSet(0);
  }

  /** Regexp::Parser, as far as it raises, and the character sets. */
  private parse(): void {
    // quantifier targets: per open container, the kind of its last expression
    // (0 none, 1 an expression, 2 an option switch) and the set it is, if any
    // (the three stacks grow and shrink together, so `top` indexes each)
    const lastKind: i32[] = [0];
    const lastSet: i32[] = [-1];
    const decoLen: i32[] = [0];
    // conditionals: the container depth of each, and its branch count
    const condDepth: i32[] = [];
    const condBranches: i32[] = [];
    // open character sets (indexes into this.sets)
    const openSets: i32[] = [];
    // captures: numbers of unnamed ones, names of named ones
    const capNums: i32[] = [];
    const capNames: string[] = [];
    let total = 0;
    const refNums: i32[] = [];
    const refNames: string[] = [];
    const refIsName: boolean[] = [];
    const tt = this.tt;
    const tk = this.tk;
    const ts = this.ts;
    const te = this.te;
    const nt = toI32(tt.length);
    for (let i = 0; i < nt; i++) {
      // The token arrays grow together (add) and parse changes none of them.
      if (i < 0 || i >= tt.length || i >= tk.length || i >= ts.length || i >= te.length) {
        fault();
        return;
      }
      const t = tt[i];
      const k = tk[i];
      const tsi = ts[i];
      const tei = te[i];
      const top = toI32(lastKind.length) - 1;
      const osTop = toI32(openSets.length) - 1;
      if (osTop >= 0 && !(t === RX_SET && k === RK_OPEN)) {
        const si = atI32(openSets, osTop);
        const st = this.setAt(si);
        if (t === RX_SET && k === RK_CLOSE) {
          st.bodyE = tei;
          if (openSets.length > 0) {
            openSets.pop();
          }
          if (openSets.length === 0) {
            rbRxPut(lastKind, top, 1);
            rbRxPut(lastSet, top, si);
            rbRxPut(decoLen, top, 0);
          }
        } else if (t === RX_SET && k === RK_NEGATE) {
          st.negative = true;
        } else if (t === RX_SET && k === RK_RANGE) {
          if (st.count === 0) {
            st.count = 1;
          }
          if (st.count === 1 && !st.intersected) {
            st.first = -1;
          }
          st.rangeOpen = true;
        } else if (t === RX_SET && k === RK_INTERSECTION) {
          st.intersected = true;
          st.count = 1;
          st.first = -1;
          st.rangeOpen = false;
        } else {
          this.setItem(st, i);
        }
        continue;
      }
      if (t === RX_SET && k === RK_OPEN) {
        const st = new RbRxSet(tsi);
        if (osTop >= 0) {
          this.setItem(this.setAt(atI32(openSets, osTop)), -1);
        }
        this.sets.push(st);
        openSets.push(toI32(this.sets.length) - 1);
        continue;
      }
      if (t === RX_QUANT) {
        if (atI32(lastKind, top) !== 1) {
          this.failed = true;
          return;
        }
        const ls = atI32(lastSet, top);
        if (ls >= 0) {
          // loc.body: the set and the decorations before its quantifier
          const st = this.setAt(ls);
          st.bodyE = add32(st.bodyE, atI32(decoLen, top));
        }
        rbRxPut(lastSet, top, -1);
        rbRxPut(decoLen, top, 0);
        continue;
      }
      if (t === RX_FREESPACE || (t === RX_GROUP && k === RK_COMMENT)) {
        rbRxPut(decoLen, top, add32(atI32(decoLen, top), sub32(tei, tsi)));
        continue;
      }
      if (t === RX_META && k === RK_ALTERNATION) {
        rbRxPut(lastKind, top, 0);
        rbRxPut(lastSet, top, -1);
        rbRxPut(decoLen, top, 0);
        continue;
      }
      if (t === RX_CONDITIONAL) {
        const cl = toI32(condDepth.length);
        if (k === RK_OPEN) {
          rbRxPut(lastKind, top, 1);
          rbRxPut(lastSet, top, -1);
          rbRxPut(decoLen, top, 0);
          lastKind.push(-1);
          lastSet.push(-1);
          decoLen.push(0);
          condDepth.push(add32(top, 1));
          condBranches.push(0);
        } else if (k === RK_CONDITION || k === RK_SEPARATOR) {
          const cm = cl - 1;
          if (cl === 0 || atI32(condBranches, cm) === 2) {
            this.failed = true;
            return;
          }
          rbRxPut(condBranches, cm, add32(atI32(condBranches, cm), 1));
          const cd = atI32(condDepth, cm);
          rbRxPut(lastKind, cd, 0);
          rbRxPut(lastSet, cd, -1);
          if (k === RK_CONDITION) {
            this.reference(this.condRef(i), refNums, refNames, refIsName);
          }
        } else if (k === RK_CLOSE) {
          if (cl === 0) {
            this.failed = true;
            return;
          }
          rbRxPop(condDepth);
          rbRxPop(condBranches);
          rbRxPop(lastKind);
          rbRxPop(lastSet);
          rbRxPop(decoLen);
        }
        continue;
      }
      // an expression added to the current container
      if (atI32(lastKind, top) === -1) {
        // a conditional without a branch: `expressions.last << exp` on nil
        this.failed = true;
        return;
      }
      if (t === RX_GROUP && k === RK_CLOSE) {
        if (top === 0) {
          this.failed = true;
          return;
        }
        rbRxPop(lastKind);
        rbRxPop(lastSet);
        rbRxPop(decoLen);
        continue;
      }
      rbRxPut(lastKind, top, t === RX_GROUP && k === RK_OPTIONS_SWITCH ? 2 : 1);
      rbRxPut(lastSet, top, -1);
      rbRxPut(decoLen, top, 0);
      if (t === RX_GROUP || t === RX_ASSERTION) {
        if (k === RK_CAPTURE || k === RK_NAMED) {
          total = add32(total, 1);
          if (k === RK_CAPTURE) {
            capNums.push(total);
          } else {
            capNames.push(this.groupNameOf(i));
          }
        }
        lastKind.push(0);
        lastSet.push(-1);
        decoLen.push(0);
        continue;
      }
      if (t === RX_BACKREF) {
        if (!this.backref(i, total, refNums, refNames, refIsName)) {
          this.failed = true;
          return;
        }
      }
    }
    // assign_referenced_expressions (the three ref arrays grow together)
    for (let r = 0; r < refIsName.length && r < refNames.length && r < refNums.length; r++) {
      const rn = refNames[r];
      const rv = refNums[r];
      let found = false;
      if (refIsName[r]) {
        for (const nm of capNames) {
          if (nm === rn) {
            found = true;
          }
        }
      } else if (rv === 0) {
        found = true;
      } else {
        for (const v of capNums) {
          if (v === rv) {
            found = true;
          }
        }
      }
      if (!found) {
        this.failed = true;
        return;
      }
    }
  }

  /** An item added to a set: a token, or -1 for a nested set. */
  private setItem(st: RbRxSet, i: i32): void {
    if (st.rangeOpen) {
      st.rangeOpen = false;
      return;
    }
    if (st.intersected) {
      return;
    }
    st.count = add32(st.count, 1);
    if (st.count === 1) {
      st.first = i;
    }
  }

  /** The name of a named group `(?<name>` / `(?'name'`. */
  private groupNameOf(i: i32): string {
    const t = this.text(i);
    return t.substring(3, toI32(t.length) - 1);
  }

  /** text[/-?\d+/].to_i */
  private firstNumber(t: string): i32 {
    const n = toI32(t.length);
    // A token's text is far shorter.
    if (n > 1073741823) {
      fault();
      return 0;
    }
    for (let i = 0; i < n; i++) {
      const c = t.charCodeAt(i);
      if (rbRxDigit(c)) {
        let v = 0;
        let j = i;
        while (j < n && rbRxDigit(t.charCodeAt(j)) && j < i + 9) {
          // At most nine digits (each a byte from 48 to 57): below 10^9.
          if (v < 0 || v > 214748339) {
            fault();
            return 0;
          }
          v = v * 10 + ((t.charCodeAt(j) & 0xff) - 48);
          j++;
        }
        if (v < 0) {
          fault();
          return 0;
        }
        if (i > 0 && t.charCodeAt(i - 1) === 45) {
          return -v;
        }
        return v;
      }
    }
    return 0;
  }

  /** A backreference's referenced group; false when the parser raises at once. */
  private backref(i: i32, total: i32, nums: i32[], names: string[], isName: boolean[]): boolean {
    const tk = this.tk;
    if (i < 0 || i >= tk.length) {
      fault();
      return false;
    }
    const k = tk[i];
    const t = this.text(i);
    const inner = t.substring(3, toI32(t.length) - 1);
    if (k === RK_NAME_REF || k === RK_NAME_CALL) {
      nums.push(0);
      names.push(inner);
      isName.push(true);
      return true;
    }
    if (k === RK_NAME_RECURSION_REF) {
      // text[3..-2].split(/(?=[+-])/).first
      let e = 0;
      while (e < toI32(inner.length) && inner.charCodeAt(e) !== 43 && inner.charCodeAt(e) !== 45) {
        e++;
      }
      nums.push(0);
      names.push(inner.substring(0, e));
      isName.push(true);
      return true;
    }
    const num = this.firstNumber(t);
    let ref = num;
    if (k === RK_NUMBER_REL_REF || k === RK_NUMBER_REL_CALL) {
      ref = add32(add32(num, total), num < 0 ? 1 : 0);
      if (ref <= 0) {
        return false;
      }
    } else if (k === RK_NUMBER_RECURSION_REF) {
      // @number = text[3..-2].split(/(?=[+-])/).first.to_i
      let e = 1;
      while (e < toI32(inner.length) && inner.charCodeAt(e) !== 43 && inner.charCodeAt(e) !== 45) {
        e++;
      }
      const head = inner.substring(0, e);
      const hn = this.firstNumber(head);
      // /[<'][+-]/: a relative number
      if (inner.startsWith("-") || inner.startsWith("+")) {
        ref = add32(add32(hn, total), hn < 0 ? 1 : 0);
        if (ref <= 0) {
          return false;
        }
      } else {
        ref = hn;
      }
    }
    nums.push(ref);
    names.push("");
    isName.push(false);
    return true;
  }

  /** A condition's reference: its text without quotes and brackets, a number when all digits. */
  private condRef(i: i32): string {
    return this.text(i);
  }

  private reference(r: string, nums: i32[], names: string[], isName: boolean[]): void {
    const n = toI32(r.length);
    let digits = n > 0;
    let inner = r;
    if (n >= 2 && r.length > 1 && (r.charCodeAt(0) === 60 || r.charCodeAt(0) === 39)) {
      inner = r.substring(1, n - 1);
    }
    for (let j = 0; j < toI32(inner.length); j++) {
      if (!rbRxDigit(inner.charCodeAt(j))) {
        digits = false;
      }
    }
    if (digits && inner.length > 0) {
      // Integer(ref): a leading 0 reads octal
      let v = 0;
      const oct = inner.length > 1 && inner.charCodeAt(0) === 48;
      let base = 10;
      if (oct) {
        base = 8;
      }
      for (let j = 0; j < toI32(inner.length) && j < 9; j++) {
        // At most nine digits (each a byte from 48 to 57): below 10^9.
        if (v < 0 || v > 214748339) {
          fault();
          return;
        }
        v = v * base + ((inner.charCodeAt(j) & 0xff) - 48);
      }
      nums.push(v);
      names.push("");
      isName.push(false);
    } else {
      nums.push(0);
      names.push(inner);
      isName.push(true);
    }
  }
}

/** RegexpNode#with_interpolations_blanked: the children's sources, interpolations as spaces. */
export const rbRxBlanked = (src: RbSource, n: i32): i32[] => {
  const a = src.a;
  const out: i32[] = [];
  // Every child but the last (the options).
  const nk = a.nKid(n);
  for (let i = 0; i < nk; i++) {
    if (i + 1 >= nk) {
      break;
    }
    const c = a.kid(n, i);
    if (!a.isNode(c)) {
      continue;
    }
    const s = a.exS(c);
    const e = a.exE(c);
    const blank = a.type(c) === NT_BEGIN;
    for (let j = s; j < e; j++) {
      out.push(blank ? 32 : src.at(j));
    }
  }
  return out;
};

/** RegexpNode#parsed_tree, or null where regexp_parser raises. */
export const rbRxParsedTree = (src: RbSource, n: i32): RbRxTree | null => {
  const a = src.a;
  const ro = a.kid(n, -1);
  let ext = false;
  if (a.isNode(ro) && a.type(ro) === NT_REGOPT) {
    for (let i = 0; i < a.nKid(ro); i++) {
      const o = a.text(a.kid(ro, i));
      if (o === "x") {
        ext = true;
      }
      // RegexpNode#options: OPTIONS.fetch raises (and leaves no tree) on another flag, e.g. `s`
      if (o !== "x" && o !== "i" && o !== "m" && o !== "n" && o !== "u" && o !== "o") {
        return null;
      }
    }
  }
  const t = new RbRxTree(rbRxBlanked(src, n), ext);
  return t.failed ? null : t;
};

/** Whether token `i` is a codepoint list of two or more codepoints. */
export const rbRxMultipleCodepoints = (tr: RbRxTree, i: i32): boolean => {
  const tk = tr.tk;
  if (i < 0 || i >= tk.length) {
    fault();
    return false;
  }
  if (tk[i] !== RK_CODEPOINT_LIST) {
    return false;
  }
  // text.scan(/\h+/).count
  const t = tr.text(i);
  let k = 0;
  let inRun = false;
  for (let j = 0; j < toI32(t.length); j++) {
    const x = rbRxXdigit(t.charCodeAt(j));
    // Only whether there are two counts.
    if (x && !inRun && k < 2) {
      k++;
    }
    inRun = x;
  }
  return k >= 2;
};
