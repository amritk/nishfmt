// Style/FormatStringToken (EnforcedStyle: annotated,
// MaxUnannotatedPlaceholdersAllowed: 1, Mode: aggressive, no AllowedMethods
// or AllowedPatterns), with RuboCop::Cop::Utils::FormatString's SEQUENCE
// regexp as a backtracking matcher.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_BEGIN, F_HEREDOC_BODY, M_HEREDOC, NT_DSTR, NT_REGEXP, NT_SEND, NT_STR, NT_XSTR, V_NIL } from "../ast";
import { add32, sub32 } from "../../core/arr";
import { fault } from "../../core/fault";
import { RbCop } from "../cop";
import { rbText } from "../lexer";
import { RbSource } from "../source";
import { sbhMethodName } from "./style_body_help";
import { ssxAstEqual } from "./style_syntax_reparse";
import { ssxFE, ssxFS, ssxHas, ssxIsWord } from "./style_syntax_help";

/** One match of FormatString::SEQUENCE: positions in the contents, captures as [s, e) (-1: not matched). */
export class SbhFstSeq {
  s: i32 = 0;
  e: i32 = 0;
  percent: boolean = false;
  flagsS: i32 = -1;
  flagsE: i32 = -1;
  moreS: i32 = -1;
  moreE: i32 = -1;
  widthS: i32 = -1;
  widthE: i32 = -1;
  precS: i32 = -1;
  precE: i32 = -1;
  nameS: i32 = -1;
  nameE: i32 = -1;
  typeS: i32 = -1;

  constructor() {}
}

/** The SEQUENCE matcher over one string's code points. */
export class SbhFstMatcher {
  t: i32[];

  constructor(t: i32[]) {
    this.t = t;
  }

  at(i: i32): i32 {
    return i >= 0 && i < toI32(this.t.length) ? this.t[i] : -1;
  }

  isDigit(i: i32): boolean {
    const c = this.at(i);
    return c >= 48 && c <= 57;
  }

  /** DIGIT_DOLLAR at p: \d+\$ (end, or -1). */
  digitDollar(p: i32): i32 {
    const t = this.t;
    let q = p;
    while (q >= 0 && q < t.length && t[q] >= 48 && t[q] <= 57) {
      q++;
    }
    if (q > p && this.at(q) === 36) {
      return add32(q, 1);
    }
    return -1;
  }

  /** FLAG* from p: the reachable ends in priority order (greedy); a position already expanded adds nothing new. */
  flagEnds(p: i32, out: i32[]): void {
    const seen = new Set<i32>();
    this.flagEndsFrom(p, out, seen);
  }

  private flagEndsFrom(p: i32, out: i32[], seen: Set<i32>): void {
    if (seen.has(p)) {
      return;
    }
    seen.add(p);
    const c = this.at(p);
    if (c === 32 || c === 35 || c === 48 || c === 43 || c === 45) {
      this.flagEndsFrom(add32(p, 1), out, seen);
    }
    const dd = this.digitDollar(p);
    if (dd >= 0) {
      this.flagEndsFrom(dd, out, seen);
    }
    out.push(p);
  }

  /** NUMBER at p: \d+ | \*(\d+\$)? | \#\{.*?\}, the ends in priority order. */
  numberEnds(p: i32, out: i32[]): void {
    const t = this.t;
    let q = p;
    while (q >= 0 && q < t.length && t[q] >= 48 && t[q] <= 57) {
      q++;
    }
    // A digit run starts at p >= 0, so e > 0.
    for (let e = q; e > p && e > 0; e--) {
      out.push(e);
    }
    const p1 = add32(p, 1);
    if (this.at(p) === 42) {
      const dd = this.digitDollar(p1);
      if (dd >= 0) {
        out.push(dd);
      }
      out.push(p1);
    }
    if (this.at(p) === 35 && this.at(p1) === 123) {
      for (let r = add32(p, 2); r >= 0 && r < t.length && t[r] !== 10; r++) {
        if (t[r] === 125) {
          out.push(r + 1);
        }
      }
    }
  }

  /** WIDTH? at p: the ends, then p (skipped). */
  widthOpt(p: i32): i32[] {
    const out: i32[] = [];
    this.numberEnds(p, out);
    out.push(p);
    return out;
  }

  /** PRECISION? at p: `.` NUMBER?, then p (skipped). */
  precOpt(p: i32): i32[] {
    const out: i32[] = [];
    if (this.at(p) === 46) {
      const p1 = add32(p, 1);
      this.numberEnds(p1, out);
      out.push(p1);
    }
    out.push(p);
    return out;
  }

  /** \w+ then `close` from p (the end past `close`, or -1). */
  word(p: i32, close: i32): i32 {
    // p follows an opening character of t.
    if (p < 0) {
      fault();
      return -1;
    }
    const t = this.t;
    let q = p;
    while (q >= 0 && q < t.length && ssxIsWord(t[q])) {
      q++;
    }
    if (q > p && this.at(q) === close) {
      return add32(q, 1);
    }
    return -1;
  }

  /** NAME at p: <\w+> (end, or -1). */
  name(p: i32): i32 {
    return this.at(p) === 60 ? this.word(add32(p, 1), 62) : -1;
  }

  /** TEMPLATE_NAME at p: (?<!\#)\{\w+\} (end, or -1). */
  template(p: i32): i32 {
    if (this.at(p) !== 123 || this.at(sub32(p, 1)) === 35) {
      return -1;
    }
    return this.word(add32(p, 1), 125);
  }

  isType(p: i32): boolean {
    const c = this.at(p);
    return c >= 0 && c < 128 && "bBdiouxXeEfgGaAcps".indexOf(String.fromCharCode(c)) >= 0;
  }

  /** SEQUENCE at i (t[i] is `%`), or null. */
  match(i: i32): SbhFstSeq | null {
    const r = new SbhFstSeq();
    r.s = i;
    const i1 = add32(i, 1);
    if (this.at(i1) === 37) {
      r.e = add32(i, 2);
      r.percent = true;
      return r;
    }
    const flags: i32[] = [];
    this.flagEnds(i1, flags);
    for (const f of flags) {
      r.flagsS = i1;
      r.flagsE = f;
      // A1: WIDTH? PRECISION? NAME? TYPE
      for (const w of this.widthOpt(f)) {
        for (const p of this.precOpt(w)) {
          const nm = this.name(p);
          const nms: i32[] = nm >= 0 ? [nm, p] : [p];
          for (const n of nms) {
            if (this.isType(n)) {
              this.setWidth(r, f, w);
              this.setPrec(r, w, p);
              r.nameS = n === p ? -1 : add32(p, 1);
              r.nameE = n === p ? -1 : sub32(n, 1);
              r.typeS = n;
              r.e = add32(n, 1);
              return r;
            }
          }
        }
      }
      // A2: WIDTH? NAME PRECISION? TYPE
      for (const w of this.widthOpt(f)) {
        const nm = this.name(w);
        if (nm < 0) {
          continue;
        }
        for (const p of this.precOpt(nm)) {
          if (this.isType(p)) {
            this.setWidth(r, f, w);
            this.setPrec(r, nm, p);
            r.nameS = add32(w, 1);
            r.nameE = sub32(nm, 1);
            r.typeS = p;
            r.e = add32(p, 1);
            return r;
          }
        }
      }
      // A3: NAME FLAG* WIDTH? PRECISION? TYPE
      const nm3 = this.name(f);
      if (nm3 >= 0) {
        const more: i32[] = [];
        this.flagEnds(nm3, more);
        for (const mf of more) {
          for (const w of this.widthOpt(mf)) {
            for (const p of this.precOpt(w)) {
              if (this.isType(p)) {
                r.nameS = add32(f, 1);
                r.nameE = sub32(nm3, 1);
                r.moreS = nm3;
                r.moreE = mf;
                this.setWidth(r, mf, w);
                this.setPrec(r, w, p);
                r.typeS = p;
                r.e = add32(p, 1);
                return r;
              }
            }
          }
        }
      }
      // B: WIDTH? PRECISION? TEMPLATE_NAME
      for (const w of this.widthOpt(f)) {
        for (const p of this.precOpt(w)) {
          const te = this.template(p);
          if (te >= 0) {
            this.setWidth(r, f, w);
            this.setPrec(r, w, p);
            r.nameS = add32(p, 1);
            r.nameE = sub32(te, 1);
            r.typeS = -1;
            r.e = te;
            return r;
          }
        }
      }
    }
    return null;
  }

  private setWidth(r: SbhFstSeq, from: i32, to: i32): void {
    r.widthS = to > from ? from : -1;
    r.widthE = to > from ? to : -1;
  }

  /** The precision capture: after the `.` of [from, to) (none when skipped). */
  private setPrec(r: SbhFstSeq, from: i32, to: i32): void {
    r.precS = to > from ? add32(from, 1) : -1;
    r.precE = to > from ? to : -1;
  }

  /** String#scan(SEQUENCE). */
  scan(): SbhFstSeq[] {
    const out: SbhFstSeq[] = [];
    const t = this.t;
    let j = 0;
    const n = toI32(t.length);
    while (j < n) {
      // A match ends past its start, inside t.
      if (j < 0 || j >= t.length) {
        fault();
        return out;
      }
      if (t[j] === 37) {
        const m = this.match(j);
        if (m !== null) {
          out.push(m);
          j = m.e;
          continue;
        }
      }
      j++;
    }
    return out;
  }

  text(s: i32, e: i32): string {
    return s < 0 ? "" : rbText(this.t, s, e);
  }

  /** FormatSequence#style: annotated, template or unannotated. */
  style(r: SbhFstSeq): string {
    if (r.nameS < 0) {
      return "unannotated";
    }
    const t = this.t;
    let lt = false;
    let br = false;
    for (let i = r.s; i < r.e; i++) {
      // A match lies in t.
      if (i < 0 || i >= t.length) {
        fault();
        return "unannotated";
      }
      if (t[i] === 60) {
        lt = true;
      }
      if (t[i] === 123) {
        br = true;
      }
    }
    if (lt) {
      return "annotated";
    }
    return br ? "template" : "unannotated";
  }
}

/** Style/FormatStringToken. */
export class CopStyleFormatStringToken {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/FormatStringToken");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    for (const n of src.pre) {
      if (a.type(n) === NT_STR) {
        this.onStr(src, n);
      }
    }
  }

  /** format_string_in_typical_context? */
  private typical(src: RbSource, n: i32): boolean {
    const a = src.a;
    const p = src.parent(n);
    if (p === V_NIL || a.type(p) !== NT_SEND) {
      return false;
    }
    const m = sbhMethodName(src, p);
    if ((m === "format" || m === "sprintf" || m === "printf") && a.nKid(p) >= 3 && ssxAstEqual(a, a.kid(p, 2), a, n)) {
      return true;
    }
    return m === "%" && a.nKid(p) === 3 && ssxAstEqual(a, a.kid(p, 0), a, n);
  }

  private onStr(src: RbSource, n: i32): void {
    const a = src.a;
    // format_string_token?
    if (a.text(a.kid(n, 0)).indexOf("%") < 0) {
      return;
    }
    let p = src.parent(n);
    while (p !== V_NIL) {
      if (a.type(p) === NT_XSTR || a.type(p) === NT_REGEXP) {
        return;
      }
      p = src.parent(p);
    }
    if (src.nodeSrc(n) === "__FILE__") {
      return;
    }
    // str_contents
    let cs = a.exS(n);
    let ce = a.exE(n);
    if (a.mapKind(a.map(n)) === M_HEREDOC) {
      cs = ssxFS(src, n, F_HEREDOC_BODY);
      ce = ssxFE(src, n, F_HEREDOC_BODY);
    } else if (ssxHas(src, n, F_BEGIN)) {
      cs = add32(cs, 1);
      ce = sub32(ce, 1);
    }
    const pts: i32[] = [];
    const spts = src.pts;
    for (let i = cs; i < ce; i++) {
      // The string's contents lie in the source.
      if (i < 0 || i >= spts.length) {
        fault();
        return;
      }
      pts.push(spts[i]);
    }
    const mt = new SbhFstMatcher(pts);
    const typical = this.typical(src, n);
    const det: SbhFstSeq[] = [];
    const styles: string[] = [];
    for (const sq of mt.scan()) {
      if (sq.percent) {
        continue;
      }
      const st = mt.style(sq);
      if (st === "unannotated" && !typical) {
        continue;
      }
      det.push(sq);
      styles.push(st);
    }
    if (det.length === 0) {
      return;
    }
    // allowed_unannotated?
    let allUn = true;
    for (const st of styles) {
      if (st !== "unannotated") {
        allUn = false;
      }
    }
    if (allUn && det.length <= 1) {
      return;
    }
    // format_string_context?
    let ctx = typical;
    if (!ctx) {
      let q = src.parent(n);
      while (q !== V_NIL) {
        if (a.type(q) === NT_DSTR && this.typical(src, q)) {
          ctx = true;
          break;
        }
        q = src.parent(q);
      }
    }
    for (let i = 0; i < toI32(det.length); i++) {
      const sq = det[i];
      // det and styles grow together.
      if (i >= styles.length) {
        fault();
        return;
      }
      const style = styles[i];
      if (style === "annotated") {
        continue;
      }
      const ts = add32(cs, sq.s);
      const te = add32(cs, sq.e);
      const k = this.c.offense(ts, te);
      if (k === null) {
        continue;
      }
      if (ctx && sq.nameS >= 0) {
        const type = style === "template" ? "s" : mt.text(sq.typeS, add32(sq.typeS, 1));
        const flags = `${mt.text(sq.flagsS, sq.flagsE)}${mt.text(sq.moreS, sq.moreE)}`;
        k.replace(
          ts,
          te,
          `%<${mt.text(sq.nameS, sq.nameE)}>${flags}${mt.text(sq.widthS, sq.widthE)}${mt.text(sq.precS, sq.precE)}${type}`,
        );
      }
      this.c.commit(k);
    }
  }
}
