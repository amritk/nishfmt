// Lint/CopDirectiveSyntax. Its one correction (merging several directives on
// a line into one) is safe, so it runs under `rubocop -a` too.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { add32, atI32 } from "../../core/arr";
import { fault } from "../../core/fault";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { LdhDirective, LdhRegistry, ldhStrip, ldhWords } from "./lint_directive_help";

/** Ruby's \s (and String#strip's set, NUL aside). */
const lcdsSpace = (c: i32): boolean => c === 32 || (c >= 9 && c <= 13);

/** Ruby's \w, with non-ASCII counted as a word character for \b. */
const lcdsWord = (c: i32): boolean =>
  (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c >= 128;

/** The modes, longest first (MODES_PATTERN). */
const LCDS_MODES: string = " disable-next enable-next todo-next disable enable next todo push pop ";

/** The mode matched at p followed by \b, or "". */
const lcdsModeAt = (src: RbSource, p: i32, e: i32): string => {
  let k = 1;
  const ml = toI32(LCDS_MODES.length);
  while (k < ml) {
    const sp = LCDS_MODES.indexOf(" ", k);
    const m = LCDS_MODES.substring(k, sp);
    // LCDS_MODES ends in a space, so sp lies in it.
    if (sp < 0 || sp >= ml) {
      fault();
      return "";
    }
    k = sp + 1;
    const n = toI32(m.length);
    const pn = add32(p, n);
    if (pn > e || src.src(p, pn) !== m) {
      continue;
    }
    if (pn < e && lcdsWord(src.at(pn))) {
      continue;
    }
    return m;
  }
  return "";
};

/** Badge.camel_case. */
const lcdsCamel = (part: string): string => {
  if (part === "rspec") {
    return "RSpec";
  }
  const out: string[] = [];
  const k = toI32(part.length);
  let i = 0;
  while (i < k) {
    const c = part.charCodeAt(i);
    if (i === 0 && c >= 97 && c <= 122) {
      out.push(String.fromCharCode(c - 32));
      i++;
      continue;
    }
    if (c === 95 && i + 1 < k && part.charCodeAt(i + 1) >= 97 && part.charCodeAt(i + 1) <= 122) {
      out.push(String.fromCharCode(part.charCodeAt(i + 1) - 32));
      i += 2;
      continue;
    }
    out.push(part.substring(i, i + 1));
    i++;
  }
  return out.join("");
};

/** DidYouMean::Levenshtein.distance. */
const lcdsLevenshtein = (x: string, y: string): i32 => {
  const n = toI32(x.length);
  const m = toI32(y.length);
  // Both loops run to their length inclusive.
  if (n >= 2147483647 || m >= 2147483647) {
    fault();
    return 0;
  }
  let prev: i32[] = [];
  for (let j = 0; j <= m; j++) {
    prev.push(j);
  }
  for (let i = 1; i <= n; i++) {
    const cur: i32[] = [i];
    const xi = i - 1;
    if (xi < 0 || xi >= x.length) {
      fault();
      return 0;
    }
    const xc = x.charCodeAt(xi);
    for (let j = 1; j <= m; j++) {
      // prev holds m + 1 entries and cur j.
      const jm = j - 1;
      if (jm < 0 || jm >= y.length || j >= prev.length || jm >= prev.length || jm >= cur.length) {
        fault();
        return 0;
      }
      const cost = xc === y.charCodeAt(jm) ? 0 : 1;
      const pj = prev[j];
      const pjm = prev[jm];
      const cjm = cur[jm];
      let v = add32(pj, 1);
      const c1 = add32(cjm, 1);
      if (c1 < v) {
        v = c1;
      }
      const c2 = add32(pjm, cost);
      if (c2 < v) {
        v = c2;
      }
      cur.push(v);
    }
    prev = cur;
  }
  return atI32(prev, m);
};

/** ASCII downcase. */
const lcdsDown = (s: string): string => {
  const out: string[] = [];
  for (let i = 0; i < toI32(s.length); i++) {
    const c = s.charCodeAt(i);
    out.push(c >= 65 && c <= 90 ? String.fromCharCode(c + 32) : s.substring(i, i + 1));
  }
  return out.join("");
};

/** One DIRECTIVE_COMMENT_REGEXP match in a comment. */
class LcdsMatch {
  s: i32;
  e: i32;
  mode: string;
  // match[2]: the COPS_PATTERN capture ("" when none).
  cops: string;

  constructor(s: i32, e: i32, mode: string, cops: string) {
    this.s = s;
    this.e = e;
    this.mode = mode;
    this.cops = cops;
  }
}

export class CopLintCopDirectiveSyntax {
  c: RbCop;
  reg: LdhRegistry;

  constructor() {
    this.c = new RbCop("Lint/CopDirectiveSyntax");
    this.reg = new LdhRegistry();
  }

  run(src: RbSource): void {
    this.c.begin(src);
    for (let ci = 0; ci < toI32(src.commS.length); ci++) {
      const cs = src.commS[ci];
      const ce = atI32(src.commE, ci);
      if (this.startWithMarker(src, cs, ce)) {
        if (!this.checkDirective(src, ci)) {
          // An ambiguous cop name raised: the investigation stops.
          return;
        }
      } else if (this.nearMiss(src, cs, ce)) {
        this.c.offense(cs, ce);
      }
    }
  }

  /** The end of DIRECTIVE_MARKER_REGEXP (#\s*rubocop\s*:\s*) at p, or -1. */
  private marker(src: RbSource, p0: i32, ce: i32): i32 {
    if (src.at(p0) !== 35) {
      return -1;
    }
    let p = add32(p0, 1);
    while (p < ce && lcdsSpace(src.at(p))) {
      p++;
    }
    const p7 = add32(p, 7);
    if (p7 > ce || src.src(p, p7) !== "rubocop") {
      return -1;
    }
    p = p7;
    while (p < ce && lcdsSpace(src.at(p))) {
      p++;
    }
    if (p >= ce || src.at(p) !== 58) {
      return -1;
    }
    p++;
    while (p < ce && lcdsSpace(src.at(p))) {
      p++;
    }
    return p;
  }

  private startWithMarker(src: RbSource, cs: i32, ce: i32): boolean {
    return this.marker(src, cs, ce) >= 0;
  }

  /** near_miss_keyword: \A#+\s*keyword\s*:\s*mode\b, the keyword not rubocop but close to it. */
  private nearMiss(src: RbSource, cs: i32, ce: i32): boolean {
    let p = cs;
    if (src.at(p) !== 35) {
      return false;
    }
    while (p < ce && src.at(p) === 35) {
      p++;
    }
    while (p < ce && lcdsSpace(src.at(p))) {
      p++;
    }
    const c0 = src.at(p);
    if (!((c0 >= 65 && c0 <= 90) || (c0 >= 97 && c0 <= 122))) {
      return false;
    }
    const ks = p;
    while (p < ce && ((lcdsWord(src.at(p)) && src.at(p) < 128) || src.at(p) === 45)) {
      p++;
    }
    const kw = src.src(ks, p);
    while (p < ce && lcdsSpace(src.at(p))) {
      p++;
    }
    if (p >= ce || src.at(p) !== 58) {
      return false;
    }
    p++;
    while (p < ce && lcdsSpace(src.at(p))) {
      p++;
    }
    if (lcdsModeAt(src, p, ce).length === 0) {
      return false;
    }
    if (kw === "rubocop") {
      return false;
    }
    const d = lcdsDown(kw);
    return d === "rubocop" || lcdsLevenshtein(d, "rubocop") <= 2;
  }

  /** Every DIRECTIVE_COMMENT_REGEXP match in the comment (String#scan). */
  private scan(src: RbSource, ci: i32): LcdsMatch[] {
    const out: LcdsMatch[] = [];
    const ce = atI32(src.commE, ci);
    let i = atI32(src.commS, ci);
    while (i < ce) {
      if (src.at(i) === 35) {
        const d = new LdhDirective(src, ci);
        if (d.matchAt(src, i)) {
          const cops = d.hasCops && !d.cops.startsWith("+") && !d.cops.startsWith("-") ? d.cops : "";
          out.push(new LcdsMatch(i, d.me, d.mode, cops));
          i = d.me > i ? d.me : i + 1;
          continue;
        }
      }
      i++;
    }
    return out;
  }

  /** Whether [s, e) holds a non-space character. */
  private hasNonSpace(src: RbSource, s: i32, e: i32): boolean {
    for (let i = s; i < e; i++) {
      if (!lcdsSpace(src.at(i)) && src.at(i) !== 0) {
        return true;
      }
    }
    return false;
  }

  /** check_directive; false when an ambiguous cop name stops the cop. */
  private checkDirective(src: RbSource, ci: i32): boolean {
    const cs = atI32(src.commS, ci);
    const ce = atI32(src.commE, ci);
    const d = new LdhDirective(src, ci);
    const reason = d.ok && this.reasonOf(src, d, ce);
    // multiple_directives
    const all = this.scan(src, ci);
    const ms: LcdsMatch[] = [];
    for (let i = 0; i < toI32(all.length); i++) {
      if (i === 0 || !reason || !this.hasNonSpace(src, all[i].e, ce)) {
        ms.push(all[i]);
      }
    }
    if (ms.length > 1) {
      const k = this.c.offense(cs, ce);
      if (k !== null) {
        const text = this.merged(src, ms, ce);
        if (text.length > 0) {
          k.replace(cs, ce, text);
          this.c.commit(k);
        }
      }
      return true;
    }
    if (this.malformed(src, d, cs, ce)) {
      this.c.offense(cs, ce);
      return true;
    }
    const nextMode =
      d.mode === "disable-next" || d.mode === "todo-next" || d.mode === "enable-next" || d.mode === "next";
    if (nextMode && !src.commentOnlyLine(d.line)) {
      this.c.offense(cs, ce);
      return true;
    }
    const u = this.unknownCopName(d);
    if (u === 2) {
      return false;
    }
    if (u === 1) {
      this.c.offense(cs, ce);
    }
    return true;
  }

  /** DirectiveComment#reason is set: `--` and some text after the directive. */
  private reasonOf(src: RbSource, d: LdhDirective, ce: i32): boolean {
    let p = d.me;
    while (p < ce && (lcdsSpace(src.at(p)) || src.at(p) === 0)) {
      p++;
    }
    const p1 = add32(p, 1);
    if (p1 >= ce || src.at(p) !== 45 || src.at(p1) !== 45) {
      return false;
    }
    return ldhStrip(src.src(add32(p, 2), ce)).length > 0;
  }

  /** malformed? (the comment starts with the marker). */
  private malformed(src: RbSource, d: LdhDirective, cs: i32, ce: i32): boolean {
    if (!d.ok) {
      return true;
    }
    // missing_cop_name?: \A marker mode \b \s* \z
    if (d.mode !== "push" && d.mode !== "pop") {
      const p = this.marker(src, cs, ce);
      const m = lcdsModeAt(src, p, ce);
      if (m.length > 0 && !this.hasNonSpace(src, add32(p, toI32(m.length)), ce)) {
        return true;
      }
    }
    // invalid_signed_args?
    if (d.mode === "pop") {
      if (d.hasCops && d.cops.length > 0) {
        return true;
      }
    } else if ((d.mode === "push" || d.mode === "next") && d.hasCops) {
      for (const w of ldhWords(d.cops)) {
        if (!w.startsWith("+") && !w.startsWith("-")) {
          return true;
        }
      }
    }
    let p = d.me;
    while (p < ce && (lcdsSpace(src.at(p)) || src.at(p) === 0)) {
      p++;
    }
    if (p >= ce) {
      return false;
    }
    return !(p + 1 < ce && src.at(p) === 45 && src.at(p + 1) === 45);
  }

  /** unknown_cop_name: 0 none, 1 an unknown name, 2 an ambiguous name raised first. */
  private unknownCopName(d: LdhDirective): i32 {
    if (d.mode === "pop" || (d.hasCops && d.cops === "all")) {
      return 0;
    }
    const names: string[] = [];
    if (d.mode === "push" || d.mode === "next") {
      if (d.hasCops) {
        // signed_args.values.flatten: grouped by operator, in first-seen order.
        let first = 0;
        for (const w of ldhWords(d.cops)) {
          if (first === 0 && w.length > 0 && (w.startsWith("+") || w.startsWith("-"))) {
            first = w.charCodeAt(0);
          }
        }
        const order: i32[] = first === 45 ? [45, 43] : [43, 45];
        for (const o of order) {
          for (const w of ldhWords(d.cops)) {
            if (w.length > 0 && w.charCodeAt(0) === o) {
              names.push(w.substring(1, toI32(w.length)));
            }
          }
        }
      }
    } else if (d.hasCops) {
      for (const n of d.rawCopNames()) {
        names.push(n);
      }
    }
    for (const name of names) {
      if (this.reg.isDept(name)) {
        continue;
      }
      const q = this.qualified(name);
      if (q === null) {
        return 2;
      }
      if (!this.reg.has(q) && !this.reg.isDept(q)) {
        return 1;
      }
    }
    return 0;
  }

  /** Registry#qualified_cop_name(name, nil, warn: false); null when it raises AmbiguousCopName. */
  private qualified(name: string): string | null {
    const parts: string[] = [];
    let st = 0;
    const k = toI32(name.length);
    // The loop runs to the length inclusive.
    if (k >= 2147483647) {
      fault();
      return null;
    }
    for (let i = 0; i <= k; i++) {
      if (i >= k || name.charCodeAt(i) === 47) {
        parts.push(lcdsCamel(name.substring(st, i)));
        st = i + 1;
      }
    }
    // i === k pushed the last part.
    const pn = toI32(parts.length);
    if (pn <= 0) {
      fault();
      return null;
    }
    const cop = parts[pn - 1];
    if (parts.length > 1) {
      const dept: string[] = [];
      for (let i = 0; i < pn && i + 1 < pn && i < parts.length; i++) {
        dept.push(parts[i]);
      }
      if (this.reg.has(`${dept.join("/")}/${cop}`)) {
        return name;
      }
    }
    let found = "";
    let count = 0;
    for (const dp of this.reg.depts) {
      const cand = `${dp}/${cop}`;
      if (this.reg.has(cand)) {
        found = cand;
        // Only none, one or more than one matters.
        if (count < 2) {
          count++;
        }
      }
    }
    if (count > 1) {
      return null;
    }
    return count === 1 ? found : name;
  }

  /** merge_directives' replacement ("" when the directives are not merged). */
  private merged(src: RbSource, ms: LcdsMatch[], ce: i32): string {
    // directives_adjacent?
    for (let i = 0; i < toI32(ms.length); i++) {
      const to = i + 1 < toI32(ms.length) ? ms[i + 1].s : ce;
      if (this.hasNonSpace(src, ms[i].e, to)) {
        return "";
      }
    }
    // merged_mode
    const modes: string[] = [];
    for (const m of ms) {
      let seen = false;
      for (const x of modes) {
        if (x === m.mode) {
          seen = true;
        }
      }
      if (!seen) {
        modes.push(m.mode);
      }
    }
    let onlyDisable = true;
    for (const m of modes) {
      if (m !== "disable" && m !== "todo") {
        onlyDisable = false;
      }
    }
    if (modes.length !== 1 && !onlyDisable) {
      return "";
    }
    // merged_cops
    const cops: string[] = [];
    for (const m of ms) {
      let st = 0;
      const s = m.cops;
      const k = toI32(s.length);
      // The loop runs to the length inclusive.
      if (k >= 2147483647) {
        fault();
        return "";
      }
      for (let i = 0; i <= k; i++) {
        if (i >= k || s.charCodeAt(i) === 44) {
          const nm = ldhStrip(s.substring(st, i));
          st = i + 1;
          if (nm.length === 0) {
            continue;
          }
          let seen = false;
          for (const x of cops) {
            if (x === nm) {
              seen = true;
            }
          }
          if (!seen) {
            cops.push(nm);
          }
        }
      }
    }
    if (cops.length === 0) {
      return "";
    }
    for (const x of cops) {
      if (x === "all") {
        return "";
      }
    }
    // Every match has a mode, and cops come from a match.
    if (modes.length > 0) {
      return `# rubocop:${modes[0]} ${cops.join(", ")}`;
    }
    fault();
    return "";
  }
}
