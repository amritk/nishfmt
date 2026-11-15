// What Lint/RedundantCopEnableDirective and Lint/RedundantCopDisableDirective
// share: RuboCop's cop registry under our configuration (names, departments,
// which cops the configuration disables), DirectiveComment (the parsed
// `# rubocop:disable ...` comment) and the CommentConfig analysis of the
// disabled line ranges, each range keeping the directive that opened it.
//
// The push, pop and *-next directives are analysed as CommentConfig's
// PushPop and DisableNext do.
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { RbSource, TK_COMMENT } from "../source";

/** A line number for -Float::INFINITY / Float::INFINITY. */
export const LDH_NEG_INF: i32 = -1073741824;
export const LDH_INF: i32 = 1073741824;

const ldhIsSpace = (c: i32): boolean => c === 32 || (c >= 9 && c <= 13);

/** Ruby's \w (ASCII). */
const ldhIsWord = (c: i32): boolean => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;

const ldhIsAlpha = (c: i32): boolean => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);

/** Ruby's String#strip. */
export const ldhStrip = (s: string): string => {
  let i = 0;
  let j = toI32(s.length);
  while (i < j && (ldhIsSpace(s.charCodeAt(i)) || s.charCodeAt(i) === 0)) {
    i++;
  }
  while (j > i && (ldhIsSpace(s.charCodeAt(j - 1)) || s.charCodeAt(j - 1) === 0)) {
    j--;
  }
  return s.substring(i, j);
};

/** The cop registry: every cop's name in registration order, and its state under our configuration. */
export class LdhRegistry {
  names: string[];
  // 0 enabled, 1 disabled, 2 pending (so disabled: NewCops is disable).
  state: Map<string, i32>;
  depts: string[];

  constructor() {
    this.names = [];
    this.state = new Map<string, i32>();
    this.depts = ["Bundler", "Gemspec", "Layout", "Lint", "Metrics", "Migration", "Naming", "Security", "Style"];
    const s = ldhRegistryText();
    const k = toI32(s.length);
    let i = 0;
    while (i < k) {
      while (i < k && s.charCodeAt(i) === 32) {
        i++;
      }
      if (i >= k) {
        break;
      }
      let j = i;
      while (j < k && s.charCodeAt(j) !== 32) {
        j++;
      }
      const w = s.substring(i, j);
      const name = w.substring(0, toI32(w.length) - 2);
      const f = w.charCodeAt(toI32(w.length) - 1);
      this.names.push(name);
      this.state.set(name, f === 101 ? 0 : f === 100 ? 1 : 2);
      i = j;
    }
  }

  has(name: string): boolean {
    return this.state.has(name);
  }

  /** Enabled under the configuration. */
  enabled(name: string): boolean {
    const v = this.state.get(name);
    return v !== undefined && v === 0;
  }

  pending(name: string): boolean {
    const v = this.state.get(name);
    return v !== undefined && v === 2;
  }

  /** Registry#department?. */
  isDept(name: string): boolean {
    for (const d of this.depts) {
      if (d === name) {
        return true;
      }
    }
    return false;
  }

  /** Registry#names_for_department. */
  namesForDept(d: string): string[] {
    const out: string[] = [];
    const pre = `${d}/`;
    for (const n of this.names) {
      if (n.startsWith(pre) && n.indexOf("/", toI32(pre.length)) < 0) {
        out.push(n);
      }
    }
    return out;
  }

  /** Registry#disabled_names: the cops the configuration does not enable. */
  disabledNames(): string[] {
    const out: string[] = [];
    for (const n of this.names) {
      if (!this.enabled(n)) {
        out.push(n);
      }
    }
    return out;
  }

  /** Registry.qualified_cop_name(name.strip, path, correct_namespace: false). */
  qualified(name0: string): string {
    const name = ldhStrip(name0);
    if (this.has(name) || name.indexOf("/") >= 0) {
      return name;
    }
    let found = "";
    let count = 0;
    for (const d of this.depts) {
      const q = `${d}/${name}`;
      if (this.has(q)) {
        found = q;
        count++;
      }
    }
    return count === 1 ? found : name;
  }
}

const LDH_MODES: string = " disable-next enable-next todo-next disable enable next todo push pop ";

/** One comment as a DirectiveComment. */
export class LdhDirective {
  ci: i32;
  cs: i32;
  ce: i32;
  line: i32;
  // Whether DIRECTIVE_COMMENT_REGEXP matched (and was kept).
  ok: boolean = false;
  // The match, as source positions.
  ms: i32 = 0;
  me: i32 = 0;
  mode: string = "";
  hasCops: boolean = false;
  cops: string = "";

  constructor(src: RbSource, ci: i32) {
    this.ci = ci;
    this.cs = src.commS[ci];
    this.ce = src.commE[ci];
    this.line = src.line(this.cs);
    for (let i = this.cs; i < this.ce; i++) {
      if (src.at(i) === 35 && this.matchAt(src, i)) {
        // A pre_match of `#` and blanks (`# # rubocop:...`) rejects the directive.
        let rej = i > this.cs && src.at(this.cs) === 35;
        for (let j = this.cs + 1; j < i && rej; j++) {
          if (!ldhIsSpace(src.at(j))) {
            rej = false;
          }
        }
        if (rej) {
          this.ok = false;
          this.mode = "";
          this.hasCops = false;
          this.cops = "";
        }
        return;
      }
    }
  }

  private skipWs(src: RbSource, p0: i32): i32 {
    let p = p0;
    while (p < this.ce && ldhIsSpace(src.at(p))) {
      p++;
    }
    return p;
  }

  /** The end of a COP_NAME_PATTERN match at p, or -1. */
  private name(src: RbSource, p: i32): i32 {
    let q = this.seg(src, p);
    if (q < 0) {
      return -1;
    }
    while (q < this.ce && src.at(q) === 47) {
      const r = this.seg(src, q + 1);
      if (r < 0) {
        break;
      }
      q = r;
    }
    return q;
  }

  /** `[A-Za-z]\w+` at p: its end, or -1. */
  private seg(src: RbSource, p: i32): i32 {
    if (p >= this.ce || !ldhIsAlpha(src.at(p)) || p + 1 >= this.ce || !ldhIsWord(src.at(p + 1))) {
      return -1;
    }
    let q = p + 2;
    while (q < this.ce && ldhIsWord(src.at(q))) {
      q++;
    }
    return q;
  }

  /** DIRECTIVE_COMMENT_REGEXP at position i (a `#`). */
  private matchAt(src: RbSource, i: i32): boolean {
    let p = this.skipWs(src, i + 1);
    if (src.src(p, p + 7) !== "rubocop" || p + 7 > this.ce) {
      return false;
    }
    p = this.skipWs(src, p + 7);
    if (p >= this.ce || src.at(p) !== 58) {
      return false;
    }
    p = this.skipWs(src, p + 1);
    let mode = "";
    let k = 1;
    const ml = toI32(LDH_MODES.length);
    while (k < ml) {
      const sp = LDH_MODES.indexOf(" ", k);
      const m = LDH_MODES.substring(k, sp);
      const mlen = toI32(m.length);
      k = sp + 1;
      if (p + mlen > this.ce || src.src(p, p + mlen) !== m) {
        continue;
      }
      // \b: the next character is not a word character.
      const nc = src.at(p + mlen);
      if (p + mlen < this.ce && (ldhIsWord(nc) || nc >= 128)) {
        continue;
      }
      mode = m;
      break;
    }
    if (mode.length === 0) {
      return false;
    }
    this.ok = true;
    this.ms = i;
    this.mode = mode;
    p += toI32(mode.length);
    this.me = p;
    const q = this.skipWs(src, p);
    if (q === p) {
      return true;
    }
    // \s+ (all | names)
    if (src.src(q, q + 3) === "all" && q + 3 <= this.ce) {
      this.hasCops = true;
      this.cops = "all";
      this.me = q + 3;
      return true;
    }
    let e = this.name(src, q);
    if (e >= 0) {
      while (true) {
        let r = e;
        while (r < this.ce && ldhIsSpace(src.at(r))) {
          r++;
        }
        if (r >= this.ce || src.at(r) !== 44) {
          break;
        }
        r = this.skipWs(src, r + 1);
        const e2 = this.name(src, r);
        if (e2 < 0) {
          break;
        }
        e = e2;
      }
      this.hasCops = true;
      this.cops = src.src(q, e);
      this.me = e;
      return true;
    }
    // \s+ [+-]name (\s+ [+-]name)*
    const c = src.at(q);
    if ((c === 43 || c === 45) && this.name(src, q + 1) >= 0) {
      let e3 = this.name(src, q + 1);
      while (true) {
        const r = this.skipWs(src, e3);
        if (r === e3 || r >= this.ce) {
          break;
        }
        const c2 = src.at(r);
        if (!(c2 === 43 || c2 === 45)) {
          break;
        }
        const e4 = this.name(src, r + 1);
        if (e4 < 0) {
          break;
        }
        e3 = e4;
      }
      this.hasCops = true;
      this.cops = src.src(q, e3);
      this.me = e3;
    }
    return true;
  }

  /** single_line?: the comment does not start with the directive. */
  singleLine(): boolean {
    return !this.ok || this.ms !== this.cs;
  }

  disabled(): boolean {
    return this.mode === "disable" || this.mode === "todo" || this.disableNext();
  }

  disableNext(): boolean {
    return this.mode === "disable-next" || this.mode === "todo-next";
  }

  enabled(): boolean {
    return this.mode === "enable" || this.mode === "enable-next";
  }

  /** push?, pop?, disable-next?, next? or enable-next? (CommentConfig#self_closing_directive?). */
  selfClosing(): boolean {
    return this.mode === "push" || this.mode === "pop" || this.disableNext() || this.mode === "next" || this.mode === "enable-next";
  }

  allCops(): boolean {
    return this.hasCops && this.cops === "all";
  }

  enabledAll(): boolean {
    return !this.disabled() && this.allCops();
  }

  disabledAll(): boolean {
    return this.disabled() && this.allCops();
  }

  /** raw_cop_names: (cops || '').split(/,\s*\/). */
  rawCopNames(): string[] {
    const out: string[] = [];
    const s = this.cops;
    const k = toI32(s.length);
    let i = 0;
    let start = 0;
    while (i < k) {
      if (s.charCodeAt(i) === 44) {
        out.push(s.substring(start, i));
        i++;
        while (i < k && ldhIsSpace(s.charCodeAt(i))) {
          i++;
        }
        start = i;
      } else {
        i++;
      }
    }
    out.push(s.substring(start, k));
    // split drops trailing empty strings
    while (out.length > 0 && out[out.length - 1].length === 0) {
      out.pop();
    }
    return out;
  }

  /** cop_names: every cop for `all`, departments expanded, Lint/Syntax left out. */
  copNames(reg: LdhRegistry): string[] {
    const out: string[] = [];
    if (this.allCops()) {
      for (const n of reg.names) {
        if (n !== "Lint/RedundantCopDisableDirective" && n !== "Lint/Syntax") {
          out.push(n);
        }
      }
      return out;
    }
    for (const n of this.rawCopNames()) {
      if (reg.isDept(n)) {
        for (const m of reg.namesForDept(n)) {
          if (n === "Lint" && m === "Lint/RedundantCopDisableDirective") {
            continue;
          }
          if (m !== "Lint/Syntax") {
            out.push(m);
          }
        }
      } else if (n !== "Lint/Syntax") {
        out.push(n);
      }
    }
    return out;
  }

  /** in_directive_department?. */
  inDirectiveDepartment(reg: LdhRegistry, cop: string): boolean {
    for (const n of this.rawCopNames()) {
      if (reg.isDept(n) && cop.startsWith(n)) {
        return true;
      }
    }
    return false;
  }

  /** overridden_by_department?. */
  overriddenByDepartment(reg: LdhRegistry, cop: string): boolean {
    if (!this.inDirectiveDepartment(reg, cop)) {
      return false;
    }
    for (const n of this.rawCopNames()) {
      if (n === cop) {
        return true;
      }
    }
    return false;
  }

  /** directive_count. */
  directiveCount(): i32 {
    if (this.mode === "push" || this.mode === "next") {
      let k = 0;
      for (const w of ldhWords(this.cops)) {
        if (w.startsWith("+") || w.startsWith("-")) {
          k++;
        }
      }
      return k;
    }
    return toI32(this.rawCopNames().length);
  }

  /** match?(names): the same set of cop names. */
  matchNames(reg: LdhRegistry, names: string[]): boolean {
    const x = ldhUniqSorted(this.copNames(reg));
    const y = ldhUniqSorted(names);
    if (x.length !== y.length) {
      return false;
    }
    for (let i = 0; i < toI32(x.length); i++) {
      if (x[i] !== y[i]) {
        return false;
      }
    }
    return true;
  }

  /** range_with_reason's end: the comment's end when `--` follows the directive. */
  reasonEnd(src: RbSource): i32 {
    let p = this.me;
    while (p < this.ce && ldhIsSpace(src.at(p))) {
      p++;
    }
    if (p + 1 < this.ce && src.at(p) === 45 && src.at(p + 1) === 45) {
      return this.ce;
    }
    return this.me;
  }
}

/** String#split on whitespace. */
export const ldhWords = (s: string): string[] => {
  const out: string[] = [];
  const k = toI32(s.length);
  let i = 0;
  while (i < k) {
    while (i < k && ldhIsSpace(s.charCodeAt(i))) {
      i++;
    }
    if (i >= k) {
      break;
    }
    let j = i;
    while (j < k && !ldhIsSpace(s.charCodeAt(j))) {
      j++;
    }
    out.push(s.substring(i, j));
    i = j;
  }
  return out;
};

/** String#<=>: byte order, then length. */
export const ldhCompare = (a: string, b: string): i32 => {
  const n = a.length < b.length ? toI32(a.length) : toI32(b.length);
  for (let i = 0; i < n; i++) {
    const d = a.charCodeAt(i) - b.charCodeAt(i);
    if (d !== 0) {
      return d;
    }
  }
  return toI32(a.length) - toI32(b.length);
};

/** names.uniq.sort (byte order). */
export const ldhUniqSorted = (names: string[]): string[] => {
  const out: string[] = [];
  for (const n of names) {
    let seen = false;
    for (const x of out) {
      if (x === n) {
        seen = true;
      }
    }
    if (!seen) {
      out.push(n);
    }
  }
  out.sort((a: string, b: string): i32 => ldhCompare(a, b));
  return out;
};

/** A cop's analysis (CopAnalysis): its closed ranges and the open one. */
export class LdhAnalysis {
  name: string;
  rb: i32[];
  re: i32[];
  // The directive (comment index) of each range; -1 for the configuration's.
  rd: i32[];
  open: boolean = false;
  start: i32 = 0;
  startDir: i32 = -1;

  constructor(name: string) {
    this.name = name;
    this.rb = [];
    this.re = [];
    this.rd = [];
  }

  /** close(line), in place. */
  close(line: i32): void {
    if (!this.open || line < this.start) {
      return;
    }
    this.rb.push(this.start);
    this.re.push(line);
    this.rd.push(this.startDir);
  }
}

/** CommentConfig over one source. */
export class LdhConfig {
  src: RbSource;
  reg: LdhRegistry;
  dirs: LdhDirective[];
  codeLines: Set<i32>;
  noDirectives: boolean;
  // cop_disabled_line_ranges, in hash order.
  cops: LdhAnalysis[];
  index: Map<string, i32>;

  constructor(src: RbSource, reg: LdhRegistry) {
    this.src = src;
    this.reg = reg;
    this.dirs = [];
    this.codeLines = new Set<i32>();
    this.cops = [];
    this.index = new Map<string, i32>();
    let has = false;
    for (let i = 0; i + 7 <= src.n && !has; i++) {
      if (src.at(i) === 114 && src.src(i, i + 7) === "rubocop") {
        has = true;
      }
    }
    this.noDirectives = !has;
    for (let i = 0; i < toI32(src.tokT.length); i++) {
      if (src.tokT[i] !== TK_COMMENT) {
        this.codeLines.add(src.line(src.tokS[i]));
      }
    }
    if (!this.noDirectives) {
      for (let ci = 0; ci < toI32(src.commS.length); ci++) {
        this.dirs.push(new LdhDirective(src, ci));
      }
    }
  }

  /** comment_only_line?. */
  commentOnlyLine(l: i32): boolean {
    return !this.codeLines.has(l);
  }

  private analysis(name: string): LdhAnalysis {
    const k = this.index.get(name);
    if (k !== undefined) {
      return this.cops[k];
    }
    const an = new LdhAnalysis(name);
    this.index.set(name, toI32(this.cops.length));
    this.cops.push(an);
    return an;
  }

  /** The +/- arguments of a push or next: `+` ops first when written first (Hash order). */
  private signed(d: LdhDirective, outOps: i32[], outAns: LdhAnalysis[]): void {
    const ops: i32[] = [];
    const names: string[] = [];
    for (const w of ldhWords(d.cops)) {
      const op = w.length > 0 ? w.charCodeAt(0) : 0;
      if (op !== 43 && op !== 45) {
        continue;
      }
      const nm = w.substring(1, toI32(w.length));
      const expanded = this.reg.isDept(nm) ? this.reg.namesForDept(nm) : [nm];
      for (const x of expanded) {
        ops.push(op);
        names.push(this.reg.qualified(x));
      }
    }
    const first = ops.length > 0 ? ops[0] : 43;
    const order: i32[] = first === 45 ? [45, 43] : [43, 45];
    for (const o of order) {
      for (let i = 0; i < toI32(ops.length); i++) {
        if (ops[i] === o) {
          outOps.push(o);
          outAns.push(this.analysis(names[i]));
        }
      }
    }
  }

  /** analyze_cop. */
  private analyzeCop(an: LdhAnalysis, line: i32, single: boolean, disabled: boolean, dir: i32): void {
    if (single) {
      if (disabled) {
        an.rb.push(line);
        an.re.push(line);
        an.rd.push(dir);
      }
    } else if (disabled) {
      an.close(line);
      an.open = true;
      an.start = line;
      an.startDir = dir;
    } else {
      an.close(line);
      an.open = false;
    }
  }

  /** CommentConfig#analyze: the disabled line ranges of every cop named. */
  analyze(): void {
    if (this.noDirectives) {
      return;
    }
    // inject_disabled_cops_directives
    for (const n of this.reg.disabledNames()) {
      this.analyzeCop(this.analysis(n), LDH_NEG_INF, false, true, -1);
    }
    const stack: i32[][] = [];
    for (const d of this.dirs) {
      if (d.mode === "push") {
        // restore point: open, start and directive of every analysis so far
        const snap: i32[] = [];
        for (const an of this.cops) {
          snap.push(an.open ? an.start : LDH_NEG_INF - 1);
          snap.push(an.startDir);
        }
        stack.push(snap);
        const ops: i32[] = [];
        const ans: LdhAnalysis[] = [];
        this.signed(d, ops, ans);
        for (let i = 0; i < toI32(ops.length); i++) {
          const an = ans[i];
          if (ops[i] === 45 && !an.open) {
            an.open = true;
            an.start = d.line;
            an.startDir = d.ci;
          } else if (ops[i] === 43 && an.open) {
            an.close(d.line);
            an.open = false;
          }
        }
        continue;
      }
      if (d.mode === "pop") {
        if (stack.length > 0) {
          const snap = stack[stack.length - 1];
          stack.pop();
          for (let i = 0; i < toI32(this.cops.length); i++) {
            const an = this.cops[i];
            an.close(d.line - 1);
            const had = 2 * i < toI32(snap.length) && snap[2 * i] !== LDH_NEG_INF - 1;
            an.open = had;
            if (had) {
              an.start = d.line;
              an.startDir = snap[2 * i + 1];
            }
          }
        }
        continue;
      }
      if (d.mode === "disable-next" || d.mode === "todo-next" || d.mode === "enable-next" || d.mode === "next") {
        const b = this.src.statementScopeAfter(d.line);
        if (b.length === 0) {
          continue;
        }
        const from = b[0];
        const to = b[1];
        if (d.mode === "next") {
          const ops: i32[] = [];
          const ans: LdhAnalysis[] = [];
          this.signed(d, ops, ans);
          for (let i = 0; i < toI32(ops.length); i++) {
            const an = ans[i];
            if (ops[i] === 45) {
              an.rb.push(from);
              an.re.push(to);
              an.rd.push(d.ci);
            } else if (an.open) {
              an.close(from - 1);
              an.start = to + 1;
            }
          }
        } else {
          for (const n of d.copNames(this.reg)) {
            const an = this.analysis(this.reg.qualified(n));
            if (d.mode === "enable-next") {
              if (an.open) {
                an.close(from - 1);
                an.start = to + 1;
              }
            } else {
              an.rb.push(from);
              an.re.push(to);
              an.rd.push(d.ci);
            }
          }
        }
        continue;
      }
      if (d.selfClosing()) {
        continue;
      }
      const single = !this.commentOnlyLine(d.line) || d.singleLine();
      for (const n of d.copNames(this.reg)) {
        this.analyzeCop(this.analysis(this.reg.qualified(n)), d.line, single, d.disabled(), d.ci);
      }
    }
    for (const an of this.cops) {
      an.close(LDH_INF);
    }
  }
}

/** The text of the registry: `Name:f` words, f being e (enabled), d (disabled) or p (pending). */
const ldhRegistryText = (): string =>
  " Bundler/DuplicatedGem:e Bundler/DuplicatedGroup:e Bundler/GemComment:d Bundler/GemFilename:e " +
  "Bundler/GemVersion:d Bundler/InsecureProtocolSource:e Bundler/OrderedGems:e " +
  "Gemspec/AddRuntimeDependency:p Gemspec/AttributeAssignment:p Gemspec/DependencyVersion:d " +
  "Gemspec/DeprecatedAttributeAssignment:p Gemspec/DevelopmentDependencies:p " +
  "Gemspec/DuplicatedAssignment:e Gemspec/OrderedDependencies:e Gemspec/RequireMFA:p " +
  "Gemspec/RequiredRubyVersion:e Gemspec/RubyVersionGlobalsUsage:e Layout/AccessModifierIndentation:e " +
  "Layout/ArgumentAlignment:e Layout/ArrayAlignment:e Layout/AssignmentIndentation:e " +
  "Layout/BeginEndAlignment:e Layout/BlockAlignment:e Layout/BlockEndNewline:e Layout/CaseIndentation:e " +
  "Layout/ClassStructure:d Layout/ClosingHeredocIndentation:e Layout/ClosingParenthesisIndentation:e " +
  "Layout/CommentIndentation:e Layout/ConditionPosition:e Layout/DefEndAlignment:e Layout/DotPosition:e " +
  "Layout/ElseAlignment:e Layout/EmptyComment:e Layout/EmptyLineAfterGuardClause:e " +
  "Layout/EmptyLineAfterMagicComment:e Layout/EmptyLineAfterMultilineCondition:d " +
  "Layout/EmptyLineBetweenDefs:e Layout/EmptyLinesAfterModuleInclusion:p " +
  "Layout/EmptyLinesAroundAccessModifier:e Layout/EmptyLinesAroundArguments:e " +
  "Layout/EmptyLinesAroundAttributeAccessor:e Layout/EmptyLinesAroundBeginBody:e " +
  "Layout/EmptyLinesAroundBlockBody:e Layout/EmptyLinesAroundClassBody:e " +
  "Layout/EmptyLinesAroundExceptionHandlingKeywords:e Layout/EmptyLinesAroundMethodBody:e " +
  "Layout/EmptyLinesAroundModuleBody:e Layout/EmptyLines:e Layout/EndAlignment:e Layout/EndOfLine:e " +
  "Layout/ExtraSpacing:e Layout/FirstArgumentIndentation:e Layout/FirstArrayElementIndentation:e " +
  "Layout/FirstArrayElementLineBreak:d Layout/FirstHashElementIndentation:e " +
  "Layout/FirstHashElementLineBreak:d Layout/FirstMethodArgumentLineBreak:d " +
  "Layout/FirstMethodParameterLineBreak:d Layout/FirstParameterIndentation:e Layout/HashAlignment:e " +
  "Layout/HeredocArgumentClosingParenthesis:d Layout/HeredocIndentation:e " +
  "Layout/IndentationConsistency:e Layout/IndentationStyle:e Layout/IndentationWidth:e " +
  "Layout/InitialIndentation:e Layout/LeadingCommentSpace:e Layout/LeadingEmptyLines:e " +
  "Layout/LineContinuationLeadingSpace:p Layout/LineContinuationSpacing:p " +
  "Layout/LineEndStringConcatenationIndentation:p Layout/LineLength:e " +
  "Layout/MultilineArrayBraceLayout:e Layout/MultilineArrayLineBreaks:d " +
  "Layout/MultilineAssignmentLayout:d Layout/MultilineBlockLayout:e Layout/MultilineHashBraceLayout:e " +
  "Layout/MultilineHashKeyLineBreaks:d Layout/MultilineMethodArgumentLineBreaks:d " +
  "Layout/MultilineMethodCallBraceLayout:e Layout/MultilineMethodCallIndentation:e " +
  "Layout/MultilineMethodDefinitionBraceLayout:e Layout/MultilineMethodParameterLineBreaks:d " +
  "Layout/MultilineOperationIndentation:e Layout/ParameterAlignment:e Layout/RedundantLineBreak:d " +
  "Layout/RescueEnsureAlignment:e Layout/SingleLineBlockChain:d Layout/SpaceAfterColon:e " +
  "Layout/SpaceAfterComma:e Layout/SpaceAfterMethodName:e Layout/SpaceAfterNot:e " +
  "Layout/SpaceAfterSemicolon:e Layout/SpaceAroundBlockParameters:e " +
  "Layout/SpaceAroundEqualsInParameterDefault:e Layout/SpaceAroundKeyword:e " +
  "Layout/SpaceAroundMethodCallOperator:e Layout/SpaceAroundOperators:e Layout/SpaceBeforeBlockBraces:e " +
  "Layout/SpaceBeforeBrackets:p Layout/SpaceBeforeComma:e Layout/SpaceBeforeComment:e " +
  "Layout/SpaceBeforeFirstArg:e Layout/SpaceBeforeSemicolon:e Layout/SpaceInLambdaLiteral:e " +
  "Layout/SpaceInsideArrayPercentLiteral:e Layout/SpaceInsideArrayLiteralBrackets:e " +
  "Layout/SpaceInsideBlockBraces:e Layout/SpaceInsideHashLiteralBraces:e Layout/SpaceInsideParens:e " +
  "Layout/SpaceInsidePercentLiteralDelimiters:e Layout/SpaceInsideRangeLiteral:e " +
  "Layout/SpaceInsideReferenceBrackets:e Layout/SpaceInsideStringInterpolation:e " +
  "Layout/TrailingEmptyLines:e Layout/TrailingWhitespace:e Lint/AmbiguousAssignment:p " +
  "Lint/AmbiguousBlockAssociation:e Lint/AmbiguousOperator:e Lint/AmbiguousOperatorPrecedence:p " +
  "Lint/AmbiguousRange:p Lint/AmbiguousRegexpLiteral:e Lint/ArgumentMismatch:p " +
  "Lint/ArrayLiteralInRegexp:p Lint/AssignmentInCondition:e Lint/BigDecimalNew:e " +
  "Lint/BinaryOperatorWithIdenticalOperands:e Lint/BooleanSymbol:e Lint/CircularArgumentReference:e " +
  "Lint/ConstantDefinitionInBlock:e Lint/ConstantOverwrittenInRescue:p Lint/ConstantReassignment:p " +
  "Lint/ConstantResolution:d Lint/CopDirectiveSyntax:e Lint/DataDefineOverride:p Lint/Debugger:e " +
  "Lint/DeprecatedClassMethods:e Lint/DeprecatedConstants:p Lint/DeprecatedOpenSSLConstant:e " +
  "Lint/DeprecatedReference:p Lint/DisjunctiveAssignmentInConstructor:e Lint/DuplicateBranch:p " +
  "Lint/DuplicateCaseCondition:e Lint/DuplicateElsifCondition:e Lint/DuplicateHashKey:e " +
  "Lint/DuplicateMagicComment:p Lint/DuplicateMatchPattern:p Lint/DuplicateMethods:e " +
  "Lint/DuplicateRegexpCharacterClassElement:p Lint/DuplicateRequire:e Lint/DuplicateRescueException:e " +
  "Lint/DuplicateSetElement:p Lint/EachWithObjectArgument:e Lint/ElseLayout:e Lint/EmptyBlock:p " +
  "Lint/EmptyClass:p Lint/EmptyConditionalBody:e Lint/EmptyEnsure:e Lint/EmptyExpression:e " +
  "Lint/EmptyFile:e Lint/EmptyInPattern:p Lint/EmptyInterpolation:e Lint/EmptyWhen:e " +
  "Lint/EnsureReturn:e Lint/SharedMutableDefault:p Lint/ErbNewArguments:e Lint/FlipFlop:e " +
  "Lint/FloatComparison:e Lint/FloatOutOfRange:e Lint/FormatParameterMismatch:e " +
  "Lint/HashCompareByIdentity:e Lint/HashNewWithKeywordArgumentsAsDefault:p " +
  "Lint/HeredocMethodCallPosition:d Lint/IdentityComparison:e Lint/ImplicitStringConcatenation:e " +
  "Lint/IncompatibleIoSelectWithFiberScheduler:p Lint/IneffectiveAccessModifier:e " +
  "Lint/InheritException:e Lint/InterpolationCheck:e Lint/ItWithoutArgumentsInBlock:p " +
  "Lint/LambdaWithoutLiteralBlock:p Lint/LiteralAsCondition:e Lint/LiteralAssignmentInCondition:p " +
  "Lint/LiteralInInterpolation:e Lint/Loop:e Lint/MisplacedMagicComment:p " +
  "Lint/MissingCopEnableDirective:e Lint/MissingSuper:e Lint/MixedCaseRange:p " +
  "Lint/MixedRegexpCaptureTypes:e Lint/MultipleComparison:e Lint/NameTypo:p " +
  "Lint/NestedMethodDefinition:e Lint/NestedPercentLiteral:e Lint/NextWithoutAccumulator:e " +
  "Lint/NoReturnInBeginEndBlocks:p Lint/NonAtomicFileOperation:p Lint/NonDeterministicRequireOrder:e " +
  "Lint/NonLocalExitFromIterator:e Lint/NumberConversion:d Lint/NumberedParameterAssignment:p " +
  "Lint/NumericOperationWithConstantResult:p Lint/OrAssignmentToConstant:p Lint/OrderedMagicComments:e " +
  "Lint/OutOfRangeRegexpRef:e Lint/ParenthesesAsGroupedExpression:e Lint/PercentStringArray:e " +
  "Lint/PercentSymbolArray:e Lint/RaiseException:e Lint/RandOne:e Lint/RedundantCopDisableDirective:e " +
  "Lint/RedundantCopEnableDirective:e Lint/RedundantDirGlobSort:p Lint/RedundantRegexpQuantifiers:p " +
  "Lint/RedundantRequireStatement:e Lint/RedundantSafeNavigation:e Lint/RedundantSplatExpansion:e " +
  "Lint/RedundantStringCoercion:e Lint/RedundantTypeConversion:p Lint/RedundantWithIndex:e " +
  "Lint/RedundantWithObject:e Lint/RefinementImportMethods:p Lint/RegexpAsCondition:e " +
  "Lint/RequireParentheses:e Lint/RequireRangeParentheses:p Lint/RequireRelativeSelfPath:p " +
  "Lint/RescueException:e Lint/RescueType:e Lint/ReturnInVoidContext:e Lint/SafeNavigationConsistency:e " +
  "Lint/SafeNavigationChain:e Lint/SafeNavigationWithEmpty:e Lint/ScriptPermission:e " +
  "Lint/SelfAssignment:e Lint/SendWithMixinArgument:e Lint/ShadowedArgument:e Lint/ShadowedException:e " +
  "Lint/ShadowingOuterLocalVariable:d Lint/StructNewOverride:e Lint/SuperArgumentMismatch:p " +
  "Lint/SuppressedException:e Lint/SuppressedExceptionInNumberConversion:p Lint/SymbolConversion:p " +
  "Lint/Syntax:e Lint/ToEnumArguments:p Lint/ToJSON:e Lint/TopLevelReturnWithArgument:e " +
  "Lint/TrailingCommaInAttributeDeclaration:e Lint/TripleQuotes:p Lint/UnderscorePrefixedVariableName:e " +
  "Lint/UnescapedBracketInRegexp:p Lint/UnexpectedBlockArity:p Lint/UnifiedInteger:e " +
  "Lint/UnmodifiedReduceAccumulator:p Lint/UnreachableCode:e Lint/UnreachableLoop:e " +
  "Lint/UnreachablePatternBranch:p Lint/UnusedBlockArgument:e Lint/UnusedMethodArgument:e " +
  "Lint/UnusedPrivateMethod:d Lint/UriEscapeUnescape:e Lint/UriRegexp:e Lint/UselessAccessModifier:e " +
  "Lint/UselessAssignment:e Lint/UselessConstantScoping:p Lint/UselessDefaultValueArgument:p " +
  "Lint/UselessDefined:p Lint/UselessElseWithoutRescue:e Lint/UselessMethodDefinition:e " +
  "Lint/UselessNumericOperation:p Lint/UselessOr:p Lint/UselessRescue:p Lint/UselessRuby2Keywords:p " +
  "Lint/UselessSetterCall:e Lint/UselessTimes:e Lint/Void:e Metrics/CyclomaticComplexity:e " +
  "Metrics/AbcSize:e Metrics/BlockLength:e Metrics/BlockNesting:e Metrics/ClassLength:e " +
  "Metrics/CollectionLiteralLength:p Metrics/MethodLength:e Metrics/ModuleLength:e " +
  "Metrics/ParameterLists:e Metrics/PerceivedComplexity:e Migration/DepartmentName:e " +
  "Naming/AccessorMethodName:e Naming/AsciiIdentifiers:e Naming/BlockForwarding:p " +
  "Naming/BlockParameterName:e Naming/ClassAndModuleCamelCase:e Naming/ConstantName:e Naming/FileName:e " +
  "Naming/HeredocDelimiterCase:e Naming/HeredocDelimiterNaming:e Naming/InclusiveLanguage:d " +
  "Naming/MemoizedInstanceVariableName:e Naming/MethodName:e Naming/MethodParameterName:e " +
  "Naming/BinaryOperatorParameterName:e Naming/PredicateMethod:p Naming/PredicatePrefix:e " +
  "Naming/RescuedExceptionsVariableName:e Naming/VariableName:e Naming/VariableNumber:e " +
  "Security/CompoundHash:p Security/Eval:e Security/IoMethods:p Security/JSONLoad:e " +
  "Security/MarshalLoad:e Security/Open:e Security/YAMLLoad:e Style/AccessModifierDeclarations:e " +
  "Style/AccessorGrouping:e Style/Alias:e Style/AmbiguousEndlessMethodDefinition:p Style/AndOr:e " +
  "Style/ArgumentsForwarding:p Style/ArrayCoercion:d Style/ArrayFirstLast:d Style/ArrayIntersect:p " +
  "Style/ArrayIntersectWithSingleElement:p Style/ArrayJoin:e Style/AsciiComments:d Style/Attr:e " +
  "Style/AutoResourceCleanup:d Style/BarePercentLiterals:e Style/BeginBlock:e " +
  "Style/BisectedAttrAccessor:e Style/BitwisePredicate:p Style/BlockComments:e Style/BlockDelimiters:e " +
  "Style/CaseEquality:e Style/CaseLikeIf:e Style/CharacterLiteral:e Style/ClassAndModuleChildren:e " +
  "Style/ClassCheck:e Style/ClassEqualityComparison:e Style/ClassMethods:e " +
  "Style/ClassMethodsDefinitions:d Style/ClassVars:e Style/CollectionCompact:p " +
  "Style/CollectionMethods:d Style/CollectionQuerying:p Style/ColonMethodCall:e " +
  "Style/ColonMethodDefinition:e Style/CombinableDefined:p Style/CombinableLoops:e " +
  "Style/CommandLiteral:e Style/CommentAnnotation:e Style/CommentedKeyword:e Style/ComparableBetween:p " +
  "Style/ComparableClamp:p Style/ConcatArrayLiterals:p Style/ConditionalAssignment:e " +
  "Style/ConstantVisibility:d Style/Copyright:d Style/DataInheritance:p Style/DateTime:d " +
  "Style/DefWithParentheses:e Style/DigChain:p Style/Dir:e Style/DirEmpty:p Style/DirectiveScope:p " +
  "Style/DisableCopsWithinSourceCodeDirective:d Style/DocumentationMethod:d Style/Documentation:e " +
  "Style/DocumentDynamicEvalDefinition:p Style/DoubleNegation:e Style/EachForSimpleLoop:e " +
  "Style/EachWithObject:e Style/EmptyBlockParameter:e Style/EmptyCaseCondition:e " +
  "Style/EmptyClassDefinition:p Style/EmptyElse:e Style/EmptyHeredoc:p Style/EmptyLambdaParameter:e " +
  "Style/EmptyLiteral:e Style/EmptyMethod:e Style/EmptyStringInsideInterpolation:p " +
  "Style/EndlessMethod:p Style/Encoding:e Style/EndBlock:e Style/EnvHome:p Style/EvalWithLocation:e " +
  "Style/EvenOdd:e Style/ExactRegexpMatch:p Style/ExpandPathArguments:e Style/ExplicitBlockArgument:e " +
  "Style/ExponentialNotation:e Style/FetchEnvVar:p Style/FileEmpty:p Style/FileNull:p Style/FileOpen:p " +
  "Style/FileRead:p Style/FileTouch:p Style/FileWrite:p Style/FloatDivision:e Style/For:e " +
  "Style/FormatString:e Style/FormatStringToken:e Style/FrozenStringLiteralComment:e " +
  "Style/GlobalStdStream:e Style/GlobalVars:e Style/GuardClause:e Style/HashAsLastArrayItem:e " +
  "Style/HashConversion:p Style/HashEachMethods:e Style/HashExcept:p Style/HashFetchChain:p " +
  "Style/HashLikeCase:e Style/HashLookupMethod:d Style/HashSlice:p Style/HashSyntax:e " +
  "Style/HashTransformKeys:e Style/HashTransformValues:e Style/IdenticalConditionalBranches:e " +
  "Style/IfInsideElse:e Style/IfUnlessModifier:e Style/IfUnlessModifierOfIfUnless:e " +
  "Style/IfWithBooleanLiteralBranches:p Style/IfWithSemicolon:e Style/ImplicitRuntimeError:d " +
  "Style/InPatternThen:p Style/InfiniteLoop:e Style/ReduceToHash:p Style/InverseMethods:e " +
  "Style/InlineComment:d Style/InvertibleUnlessCondition:d Style/IpAddresses:d Style/ItAssignment:p " +
  "Style/ItBlockParameter:p Style/KeywordArgumentsMerging:p Style/KeywordParametersOrder:e " +
  "Style/Lambda:e Style/LambdaCall:e Style/LineEndConcatenation:e Style/MagicCommentFormat:p " +
  "Style/MapIntoArray:p Style/MapJoin:p Style/MapToHash:p Style/MapToSet:p " +
  "Style/MethodCallWithoutArgsParentheses:e Style/MethodCallWithArgsParentheses:d " +
  "Style/MinMaxComparison:p Style/ModuleMemberExistenceCheck:p Style/MultilineInPatternThen:p " +
  "Style/NumberedParameters:p Style/OneClassPerFile:p Style/OpenStructUse:p Style/OperatorMethodCall:p " +
  "Style/PartitionInsteadOfDoubleSelect:p Style/RedundantArrayConstructor:p " +
  "Style/RedundantArrayFlatten:p Style/RedundantAssignment:e Style/RedundantConstantBase:p " +
  "Style/RedundantCurrentDirectoryInPath:p Style/RedundantDoubleSplatHashBraces:p Style/RedundantEach:p " +
  "Style/RedundantFetchBlock:e Style/RedundantFileExtensionInRequire:e Style/RedundantFilterChain:p " +
  "Style/RedundantFormat:p Style/RedundantHeredocDelimiterQuotes:p Style/RedundantInitialize:p " +
  "Style/RedundantInterpolationUnfreeze:p Style/RedundantLineContinuation:p Style/RedundantMinMaxBy:p " +
  "Style/RedundantRegexpArgument:p Style/RedundantRegexpConstructor:p Style/RedundantSelfAssignment:e " +
  "Style/RedundantSelfAssignmentBranch:p Style/RedundantStructKeywordInit:d Style/RequireOrder:d " +
  "Style/ReverseFind:p Style/SafeNavigationChainLength:p Style/SingleLineDoEndBlock:p " +
  "Style/SoleNestedConditional:e Style/StaticClass:d Style/MapCompactWithConditionalBlock:p " +
  "Style/MethodCalledOnDoEndBlock:d Style/MethodDefParentheses:e Style/MinMax:e Style/MissingElse:d " +
  "Style/MissingRespondToMissing:e Style/MixinGrouping:e Style/MixinUsage:e Style/ModuleFunction:e " +
  "Style/MultilineBlockChain:e Style/MultilineIfThen:e Style/MultilineIfModifier:e " +
  "Style/MultilineMethodSignature:d Style/MultilineMemoization:e Style/MultilineTernaryOperator:e " +
  "Style/MultilineWhenThen:e Style/MultipleComparison:e Style/MutableConstant:e Style/NegatedIf:e " +
  "Style/NegatedIfElseCondition:p Style/NegatedUnless:e Style/NegatedWhile:e Style/NegativeArrayIndex:p " +
  "Style/NestedFileDirname:p Style/NestedModifier:e Style/NestedParenthesizedCalls:e " +
  "Style/NestedTernaryOperator:e Style/Next:e Style/NilComparison:e Style/NilLambda:p " +
  "Style/NonNilCheck:e Style/Not:e Style/NumberedParametersLimit:p Style/NumericLiterals:e " +
  "Style/NumericLiteralPrefix:e Style/NumericPredicate:e Style/ObjectThen:p Style/OneLineConditional:e " +
  "Style/OrAssignment:e Style/OptionHash:d Style/OptionalArguments:e Style/OptionalBooleanParameter:e " +
  "Style/ParallelAssignment:e Style/ParenthesesAroundCondition:e Style/PercentLiteralDelimiters:e " +
  "Style/PercentQLiterals:e Style/PerlBackrefs:e Style/PredicateWithKind:p Style/PreferredHashMethods:e " +
  "Style/Proc:e Style/QuotedSymbols:p Style/RaiseArgs:e Style/RandomWithOffset:e " +
  "Style/RedundantArgument:p Style/RedundantBegin:e Style/RedundantCapitalW:e " +
  "Style/RedundantCondition:e Style/RedundantConditional:e Style/RedundantException:e " +
  "Style/RedundantFreeze:e Style/RedundantInterpolation:e Style/RedundantParentheses:e " +
  "Style/RedundantPercentQ:e Style/RedundantRegexpCharacterClass:e Style/RedundantRegexpEscape:e " +
  "Style/RedundantReturn:e Style/RedundantSelf:e Style/RedundantSort:e Style/RedundantSortBy:e " +
  "Style/RedundantStringEscape:p Style/RegexpLiteral:e Style/RescueModifier:e " +
  "Style/RescueStandardError:e Style/ReturnNil:d Style/ReturnNilInPredicateMethodDefinition:p " +
  "Style/SafeNavigation:e Style/Sample:e Style/SelectByKind:p Style/SelectByRange:p " +
  "Style/SelectByRegexp:p Style/SelfAssignment:e Style/Semicolon:e Style/Send:d " +
  "Style/SendWithLiteralMethodName:p Style/SignalException:e Style/SingleArgumentDig:e " +
  "Style/SingleLineBlockParams:d Style/SingleLineMethods:e Style/SlicingWithRange:e " +
  "Style/SpecialGlobalVars:e Style/StabbyLambdaParentheses:e Style/StderrPuts:e Style/StringChars:p " +
  "Style/StringConcatenation:e Style/StringHashKeys:d Style/StringLiterals:e " +
  "Style/StringLiteralsInInterpolation:e Style/StringMethods:d Style/Strip:e Style/StructInheritance:e " +
  "Style/SuperArguments:p Style/SuperWithArgsParentheses:p Style/SwapValues:p Style/SymbolArray:e " +
  "Style/SymbolLiteral:e Style/SymbolProc:e Style/TallyMethod:p Style/TernaryParentheses:e " +
  "Style/TimeNow:p Style/TopLevelMethodDefinition:d Style/TrailingBodyOnClass:e " +
  "Style/TrailingBodyOnMethodDefinition:e Style/TrailingBodyOnModule:e Style/TrailingCommaInArguments:e " +
  "Style/TrailingCommaInArrayLiteral:e Style/TrailingCommaInBlockArgs:d " +
  "Style/TrailingCommaInHashLiteral:e Style/TrailingMethodEndStatement:e " +
  "Style/TrailingUnderscoreVariable:e Style/TrivialAccessors:e Style/UnlessElse:e " +
  "Style/UnlessLogicalOperators:d Style/UnpackFirst:e Style/VariableInterpolation:e Style/WhenThen:e " +
  "Style/WhileUntilDo:e Style/WhileUntilModifier:e Style/WordArray:e Style/YAMLFileRead:p " +
  "Style/YodaCondition:e Style/YodaExpression:d Style/ZeroLengthPredicate:e ";
