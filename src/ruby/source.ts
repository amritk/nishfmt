// RuboCop::AST::ProcessedSource: a parsed Ruby file with its comments, tokens,
// lines and node ancestry, and the rubocop:disable directives in its comments
// (RuboCop::CommentConfig). Positions are code point offsets.
//
// Ported from rubocop-ast 1.52.0 and RuboCop 1.92.3 (MIT License, Copyright
// (c) 2012-24 Bozhidar Batsov).

import { F_HEREDOC_END, M_HEREDOC, NT_BEGIN, RbAst, V_NIL, rbSplitComma, vIdx } from "./ast";
import { rbText } from "./lexer";
import { RB_COP_NAMES } from "./registry";
import { RbParser } from "./parser";
import { fault } from "../core/fault";
import { stableSort } from "../core/sort";

/** The token type RuboCop gives comments (:tCOMMENT). */
export const TK_COMMENT: i32 = -2;

export class RbSource {
  pts: i32[];
  n: i32;
  p: RbParser;
  a: RbAst;
  root: i32;
  valid: boolean;
  lineStarts: i32[];
  // Indexed by node index (vIdx).
  parentOf: i32[];
  pre: i32[];
  commS: i32[];
  commE: i32[];
  tokT: i32[];
  tokV: string[];
  tokS: i32[];
  tokE: i32[];
  // Shared derived data, computed on first use: the tokens sorted by
  // position (sorted_tokens) and processed_source.lines.
  sortDone: boolean = false;
  sortT: i32[];
  sortV: string[];
  sortS: i32[];
  sortE: i32[];
  layDone: boolean = false;
  layS: i32[];
  layE: i32[];
  layPhys: i32 = 0;
  layN: i32 = 0;
  // Directive comments: whether the file has any we cannot interpret.
  unsupportedDirectives: boolean = false;
  // The source mentions `rubocop` (CommentConfig's @no_directives test).
  hasDirectiveText: boolean = false;
  dirNames: string[];
  dirFrom: i32[];
  dirTo: i32[];

  constructor(pts: i32[], path: string) {
    this.pts = pts;
    this.n = toI32(pts.length);
    this.p = new RbParser(pts);
    this.p.st.path = path;
    this.a = this.p.a;
    this.root = this.p.parse();
    this.valid = !this.p.failed;
    this.lineStarts = this.p.st.lineStarts;
    this.parentOf = [];
    this.pre = [];
    this.commS = this.p.lx.commentS;
    this.commE = this.p.lx.commentE;
    this.tokT = this.p.lx.allType;
    this.tokV = this.p.lx.allVal;
    this.tokS = this.p.lx.allS;
    this.tokE = this.p.lx.allE;
    this.sortT = [];
    this.sortV = [];
    this.sortS = [];
    this.sortE = [];
    this.layS = [];
    this.layE = [];
    this.dirNames = [];
    this.dirFrom = [];
    this.dirTo = [];
    if (this.valid && this.root !== V_NIL) {
      for (let i = 0; i < this.a.nNodes; i++) {
        this.parentOf.push(V_NIL);
      }
      this.index(this.root);
    }
    if (this.valid) {
      this.analyzeDirectives();
    }
  }

  sortTokens(): void {
    if (this.sortDone) {
      return;
    }
    this.sortDone = true;
    const tokT = this.tokT;
    const tokV = this.tokV;
    const tokS = this.tokS;
    const tokE = this.tokE;
    const n = toI32(tokT.length);
    const idx: i32[] = [];
    for (let i = 0; i < n; i++) {
      idx.push(i);
    }
    // Stable by start: a later token goes first only when it starts earlier.
    stableSort(idx, (a: i32, b: i32): i32 => {
      if (a >= 0 && a < tokS.length && b >= 0 && b < tokS.length) {
        return tokS[b] < tokS[a] ? 1 : 0;
      }
      fault();
      return 0;
    });
    const sT: i32[] = [];
    const sV: string[] = [];
    const sS: i32[] = [];
    const sE: i32[] = [];
    for (let i = 0; i < idx.length; i++) {
      const o = idx[i];
      if (o < 0 || o >= tokT.length || o >= tokV.length || o >= tokS.length || o >= tokE.length) {
        fault();
        break;
      }
      const t = tokT[o];
      const v = tokV[o];
      const ts = tokS[o];
      const te = tokE[o];
      sT.push(t);
      sV.push(v);
      sS.push(ts);
      sE.push(te);
    }
    this.sortT = sT;
    this.sortV = sV;
    this.sortS = sS;
    this.sortE = sE;
  }

  layLines(): void {
    if (this.layDone) {
      return;
    }
    this.layDone = true;
    const pts = this.pts;
    const layS: i32[] = [];
    const layE: i32[] = [];
    const k = this.n;
    if (k > 0) {
      layS.push(0);
      // `n` is `pts.length` (the constructor), so the bound only proves it.
      for (let i = 0; i < k && i < pts.length; i++) {
        if (pts[i] === 10) {
          layE.push(i);
          layS.push(i + 1);
        }
      }
      layE.push(k);
    }
    this.layS = layS;
    this.layE = layE;
    const layPhys = toI32(layS.length);
    this.layPhys = layPhys;
    this.layN = layPhys;
    const tokS = this.tokS;
    const lt = toI32(tokS.length) - 1;
    const lastTokLine = lt >= 0 && lt < tokS.length ? this.line(tokS[lt]) : layPhys;
    for (let ix = lastTokLine; ix < layPhys; ix++) {
      if (ix < 0 || ix >= layS.length || ix >= layE.length) {
        fault();
        break;
      }
      const ls = layS[ix];
      const le = layE[ix];
      if (toI64(le) - toI64(ls) === toI64(7) && this.src(ls, le) === "__END__") {
        this.layN = ix;
        break;
      }
    }
  }

  /** Parent links and the pre-order node list (an explicit stack: deep trees). */
  private index(root: i32): void {
    const stack: i32[] = [root];
    const parentOf = this.parentOf;
    while (true) {
      const top = toI32(stack.length) - 1;
      if (top < 0 || top >= stack.length) {
        break;
      }
      const n = stack[top];
      if (stack.length > 0) {
        stack.pop();
      }
      this.pre.push(n);
      const k = this.a.kids(n);
      let i = this.a.len(k);
      while (i > 0) {
        i--;
        const c = this.a.at(k, i);
        if (this.a.isNode(c)) {
          const ci = vIdx(c);
          if (ci < 0 || ci >= parentOf.length) {
            fault();
            return;
          }
          parentOf[ci] = n;
          stack.push(c);
        }
      }
    }
  }

  parent(n: i32): i32 {
    const parentOf = this.parentOf;
    const i = vIdx(n);
    if (i >= 0 && i < parentOf.length) {
      return parentOf[i];
    }
    fault();
    return V_NIL;
  }

  // ---- Text --------------------------------------------------------------------

  src(s: i32, e: i32): string {
    return this.p.lx.textOf(s, e);
  }

  nodeSrc(n: i32): string {
    return this.p.lx.textOf(this.a.exS(n), this.a.exE(n));
  }

  at(i: i32): i32 {
    const pts = this.pts;
    // `n` is `pts.length` (the constructor), so the second bound only proves it.
    return i >= 0 && i < this.n && i < pts.length ? pts[i] : -1;
  }

  /** 1-based line of a position. */
  line(pos: i32): i32 {
    return this.p.st.lineOf(pos);
  }

  /** 0-based column (in characters) of a position. */
  column(pos: i32): i32 {
    const l = this.line(pos);
    const ls = this.lineStarts;
    if (l > 0) {
      const li = l - 1;
      if (li < ls.length) {
        const r = toI64(pos) - toI64(ls[li]);
        if (r >= toI64(-2147483648) && r <= toI64(2147483647)) {
          return toI32(r);
        }
      }
    }
    fault();
    return 0;
  }

  lineCount(): i32 {
    return toI32(this.lineStarts.length);
  }

  /** The start of 1-based line `l`. */
  lineStart(l: i32): i32 {
    const ls = this.lineStarts;
    if (l > 0) {
      const li = l - 1;
      if (li >= 0 && li < ls.length) {
        return ls[li];
      }
    }
    fault();
    return 0;
  }

  /** The end of 1-based line `l`, before its newline. */
  lineEnd(l: i32): i32 {
    const ls = this.lineStarts;
    if (l < toI32(ls.length)) {
      if (l >= 0) {
        // A line start is a position, never negative.
        const v = ls[l];
        if (v >= 0) {
          return v - 1;
        }
      }
      fault();
      return 0;
    }
    return this.n;
  }

  lineText(l: i32): string {
    return rbText(this.pts, this.lineStart(l), this.lineEnd(l));
  }

  // ---- Comments and tokens -----------------------------------------------------------

  commentCount(): i32 {
    return toI32(this.commS.length);
  }

  /** Whether line `l` holds only comments (CommentConfig#comment_only_line?). */
  commentOnlyLine(l: i32): boolean {
    const tokT = this.tokT;
    const tokS = this.tokS;
    for (let i = 0; i < tokT.length; i++) {
      if (tokT[i] !== TK_COMMENT) {
        if (i >= tokS.length) {
          fault();
          return true;
        }
        if (this.line(tokS[i]) === l) {
          return false;
        }
      }
    }
    return true;
  }

  // ---- Directives (CommentConfig) ------------------------------------------------------

  /** CommentConfig#analyze: the disabled line ranges of every cop. */
  private analyzeDirectives(): void {
    if (!rbHasRubocop(this.pts)) {
      return;
    }
    this.hasDirectiveText = true;
    const all = rbSplitComma(RB_COP_NAMES);
    const index = new Map<string, i32>();
    for (let i = 0; i < toI32(all.length); i++) {
      index.set(all[i], i);
    }
    const nc = toI32(all.length);
    // CopAnalysis per cop: open start line (-1 nil); closed ranges go to dir*.
    // `start` and `all` both hold `nc` entries, and every index below is one
    // of `index`'s values, so the guards that fault cannot fail.
    const start: i32[] = [];
    for (let i = 0; i < nc; i++) {
      start.push(-1);
    }
    const stack: i32[][] = [];
    const commS = this.commS;
    const commE = this.commE;
    for (let ci = 0; ci < commS.length; ci++) {
      const cs = commS[ci];
      if (ci >= commE.length) {
        fault();
        return;
      }
      const text = this.src(cs, commE[ci]);
      if (text.indexOf("rubocop") < 0) {
        continue;
      }
      const d = rbParseDirective(text);
      if (d === null) {
        continue;
      }
      const line = this.line(cs);
      // A line number is at least 1 and below the file's length.
      if (line < 1 || line > 1073741823) {
        fault();
        return;
      }
      const m = d.mode;
      if (m === "push") {
        const snap: i32[] = [];
        for (let i = 0; i < start.length; i++) {
          snap.push(start[i]);
        }
        stack.push(snap);
        const sg = this.signed(d, all, index);
        // The pairs (op, cop index): j runs over the odd slots.
        for (let j = 1; j < sg.length; j++) {
          if ((j & 1) === 0) {
            continue;
          }
          const op = sg[j - 1];
          const ix = sg[j];
          if (ix < 0 || ix >= start.length || ix >= all.length) {
            fault();
            return;
          }
          const st = start[ix];
          if (op === 45 && st < 0) {
            start[ix] = line;
          } else if (op === 43 && st >= 0) {
            start[ix] = -1;
            this.closeAt(all[ix], st, line);
          }
        }
      } else if (m === "pop") {
        const top = toI32(stack.length) - 1;
        if (top >= 0 && top < stack.length) {
          const restored = stack[top];
          if (stack.length > 0) {
            stack.pop();
          }
          for (let i = 0; i < start.length; i++) {
            if (i >= all.length || i >= restored.length) {
              fault();
              return;
            }
            const st = start[i];
            const name = all[i];
            start[i] = restored[i] >= 0 ? line : -1;
            if (st >= 0) {
              this.closeAt(name, st, line - 1);
            }
          }
        }
      } else if (m === "disable-next" || m === "todo-next" || m === "next" || m === "enable-next") {
        const bounds = this.statementScopeAfter(line);
        if (bounds.length < 2) {
          if (bounds.length !== 0) {
            fault();
            return;
          }
          continue;
        }
        const from = bounds[0];
        const to = bounds[1];
        // Both are line numbers, like `line`.
        if (from < 1 || from > 1073741823 || to < 1 || to > 1073741823) {
          fault();
          return;
        }
        if (m === "next") {
          const sg = this.signed(d, all, index);
          for (let j = 1; j < sg.length; j++) {
            if ((j & 1) === 0) {
              continue;
            }
            const ix = sg[j];
            if (ix < 0 || ix >= start.length || ix >= all.length) {
              fault();
              return;
            }
            const name = all[ix];
            const st = start[ix];
            if (sg[j - 1] === 45) {
              this.addRange(name, from, to);
            } else if (st >= 0) {
              start[ix] = to + 1;
              this.closeAt(name, st, from - 1);
            }
          }
        } else {
          for (const name of this.copNames(d, all, index)) {
            const ix = index.get(name) ?? -1;
            if (m === "enable-next") {
              if (ix >= 0) {
                if (ix >= start.length) {
                  fault();
                  return;
                }
                const st = start[ix];
                if (st >= 0) {
                  start[ix] = to + 1;
                  this.closeAt(name, st, from - 1);
                }
              }
            } else {
              this.addRange(name, from, to);
            }
          }
        }
      } else {
        const single = !d.leading || !this.commentOnlyLine(line);
        const disabled = m === "disable" || m === "todo";
        for (const name of this.copNames(d, all, index)) {
          const ix = index.get(name) ?? -1;
          if (single) {
            if (disabled) {
              this.addRange(name, line, line);
            }
            continue;
          }
          if (ix < 0) {
            continue; // a cop this port does not run
          }
          if (ix >= start.length) {
            fault();
            return;
          }
          const st = start[ix];
          start[ix] = disabled ? line : -1;
          if (st >= 0) {
            this.closeAt(name, st, line);
          }
        }
      }
    }
    for (let i = 0; i < start.length; i++) {
      const st = start[i];
      if (st >= 0) {
        if (i >= all.length) {
          fault();
          return;
        }
        this.addRange(all[i], st, 1 << 30);
      }
    }
  }

  /** CopAnalysis#close(line): the open range up to `line`, unless the line precedes it. */
  private closeAt(name: string, from: i32, line: i32): void {
    if (line >= from) {
      this.addRange(name, from, line);
    }
  }

  private addRange(name: string, from: i32, to: i32): void {
    this.dirNames.push(name);
    this.dirFrom.push(from);
    this.dirTo.push(to);
  }

  /** DirectiveComment#cop_names: departments and `all` expanded, names qualified. */
  private copNames(d: RbDirective, all: string[], index: Map<string, i32>): string[] {
    const out: string[] = [];
    if (d.cops === "all") {
      for (const n of all) {
        if (n !== "Lint/RedundantCopDisableDirective" && n !== "Lint/Syntax") {
          out.push(n);
        }
      }
      return out;
    }
    for (const raw of rbSplitCopList(d.cops)) {
      if (raw.indexOf("/") < 0 && rbIsDepartment(raw)) {
        for (const n of all) {
          if (
            n.startsWith(`${raw}/`) &&
            !(raw === "Lint" && (n === "Lint/RedundantCopDisableDirective" || n === "Lint/Syntax"))
          ) {
            out.push(n);
          }
        }
        continue;
      }
      const q = rbQualify(rbStrip(raw), all, index);
      if (q !== "Lint/Syntax") {
        out.push(q);
      }
    }
    return out;
  }

  /** The +/- arguments of push and next, each cop name expanded and qualified. */
  private signed(d: RbDirective, all: string[], index: Map<string, i32>): i32[] {
    const res: i32[] = [];
    const ops: i32[] = [];
    const idx: i32[] = [];
    let p = 0;
    const t = d.cops;
    const k = toI32(t.length);
    // `+` operations first, then `-` (the Hash keeps first-seen order).
    let firstOp = 0;
    while (p >= 0 && p < k) {
      while (p >= 0 && p < k && rbIsWsByte(t.charCodeAt(p))) {
        p++;
      }
      let q = p;
      while (q >= 0 && q < k && !rbIsWsByte(t.charCodeAt(q))) {
        q++;
      }
      if (q > p && p >= 0 && p < k) {
        const op = t.charCodeAt(p);
        if (op === 43 || op === 45) {
          if (firstOp === 0) {
            firstOp = op;
          }
          const name = t.substring(p + 1, q);
          const names: string[] = [];
          if (name.indexOf("/") < 0 && rbIsDepartment(name)) {
            for (const n of all) {
              if (n.startsWith(`${name}/`)) {
                names.push(n);
              }
            }
          } else {
            names.push(rbQualify(name, all, index));
          }
          for (const n of names) {
            if (index.has(n)) {
              ops.push(op);
              idx.push(index.get(n) ?? -1);
            }
          }
        }
      }
      p = q;
    }
    // resolved_cops.each: the first-seen operation's cops, then the other's.
    const order: i32[] = firstOp === 45 ? [45, 43] : [43, 45];
    for (const o of order) {
      // `ops` and `idx` grow together.
      for (let i = 0; i < ops.length && i < idx.length; i++) {
        if (ops[i] === o) {
          const v = idx[i];
          res.push(o);
          res.push(v);
        }
      }
    }
    return res;
  }

  /** DisableNext#statement_scope_after: [first, last] lines, or [] when detached. */
  statementScopeAfter(line: i32): i32[] {
    const none: i32[] = [];
    if (!this.commentOnlyLine(line)) {
      return none;
    }
    // attached_code_line
    let code = -1;
    const nl = this.lineCount();
    let l = line;
    while (l < nl) {
      const prev = l;
      l++;
      if (!this.commentOnlyLine(l)) {
        code = l;
        break;
      }
      if (rbBlankText(this.lineText(prev))) {
        return none;
      }
    }
    if (code < 0) {
      return none;
    }
    // statement_bounds_at: the node starting on the line that ends last.
    let best = V_NIL;
    let bestLast = -1;
    for (const n of this.pre) {
      if (this.a.type(n) !== NT_BEGIN && this.line(this.a.exS(n)) === code) {
        const last = this.line(this.a.exE(n));
        if (last > bestLast) {
          best = n;
          bestLast = last;
        }
      }
    }
    if (best === V_NIL) {
      return [code, code];
    }
    // statement_end_line: the last line of any node in it, heredoc bodies included.
    let end = bestLast;
    const stack: i32[] = [best];
    while (true) {
      const top = toI32(stack.length) - 1;
      if (top < 0 || top >= stack.length) {
        break;
      }
      const n = stack[top];
      if (stack.length > 0) {
        stack.pop();
      }
      const m = this.a.map(n);
      const e = this.a.mapKind(m) === M_HEREDOC ? this.line(this.a.fS(m, F_HEREDOC_END)) : this.line(this.a.exE(n));
      if (e > end) {
        end = e;
      }
      for (let i = 0; i < this.a.nKid(n); i++) {
        const c = this.a.kid(n, i);
        if (this.a.isNode(c)) {
          stack.push(c);
        }
      }
    }
    return [code, end];
  }

  /** cop_enabled_at_lines? for a cop name such as "Style/StringLiterals". */
  copEnabledAt(cop: string, first: i32, last: i32): boolean {
    const names = this.dirNames;
    const dirTo = this.dirTo;
    const dirFrom = this.dirFrom;
    // The three grow together (addRange).
    for (let i = 0; i < names.length && i < dirTo.length && i < dirFrom.length; i++) {
      if (names[i] === cop && dirTo[i] >= first && dirFrom[i] <= last) {
        return false;
      }
    }
    return true;
  }
}

/** A directive comment: its mode, the cop names text, and whether it opens the comment. */
class RbDirective {
  mode: string;
  cops: string;
  leading: boolean;

  constructor(mode: string, cops: string, leading: boolean) {
    this.mode = mode;
    this.cops = cops;
    this.leading = leading;
  }
}

const rbIsWsByte = (c: i32): boolean => c === 32 || c === 9 || c === 10 || c === 11 || c === 12 || c === 13;
const rbIsWordByte = (c: i32): boolean =>
  (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57) || c === 95;
const rbIsAlpha = (c: i32): boolean => (c >= 97 && c <= 122) || (c >= 65 && c <= 90);

const rbBlankText = (s: string): boolean => {
  for (let i = 0; i < toI32(s.length); i++) {
    if (!rbIsWsByte(s.charCodeAt(i))) {
      return false;
    }
  }
  return true;
};

const rbStrip = (s: string): string => {
  let a = 0;
  let b = toI32(s.length);
  while (a < b && rbIsWsByte(s.charCodeAt(a))) {
    a++;
  }
  while (b > a && b > 0 && rbIsWsByte(s.charCodeAt(b - 1))) {
    b--;
  }
  return s.substring(a, b);
};

const rbHasRubocop = (pts: i32[]): boolean => {
  const n = toI32(pts.length);
  for (let i = 0; i < n - 6; i++) {
    if (
      pts[i] === 114 &&
      pts[i + 1] === 117 &&
      pts[i + 2] === 98 &&
      pts[i + 3] === 111 &&
      pts[i + 4] === 99 &&
      pts[i + 5] === 111 &&
      pts[i + 6] === 112
    ) {
      return true;
    }
  }
  return false;
};

const rbIsDepartment = (s: string): boolean =>
  s === "Bundler" ||
  s === "Gemspec" ||
  s === "Layout" ||
  s === "Lint" ||
  s === "Metrics" ||
  s === "Migration" ||
  s === "Naming" ||
  s === "Security" ||
  s === "Style";

/** Registry.qualified_cop_name: an unqualified name gets its only department. */
const rbQualify = (name: string, all: string[], index: Map<string, i32>): string => {
  if (index.has(name) || name.indexOf("/") >= 0) {
    return name;
  }
  let found = "";
  let count = 0;
  for (const n of all) {
    if (n.endsWith(`/${name}`)) {
      found = n;
      // Only whether exactly one matches counts.
      if (count < 2) {
        count++;
      }
    }
  }
  return count === 1 ? found : name;
};

/** raw_cop_names: the cops text split at commas and the spaces after them. */
const rbSplitCopList = (s: string): string[] => {
  const out: string[] = [];
  let a = 0;
  const k = toI32(s.length);
  let i = 0;
  while (i < k) {
    if (s.charCodeAt(i) === 44) {
      out.push(s.substring(a, i));
      i++;
      while (i < k && rbIsWsByte(s.charCodeAt(i))) {
        i++;
      }
      a = i;
      continue;
    }
    i++;
  }
  if (a < k) {
    out.push(s.substring(a, k));
  }
  return out;
};

/** COP_NAME_PATTERN at p: ([A-Za-z]\w+/)*[A-Za-z]\w+; the end, or -1. */
const rbMatchCopName = (t: string, p: i32): i32 => {
  const k = toI32(t.length);
  let q = p;
  let lastEnd = -1;
  while (q >= 0 && q < k && rbIsAlpha(t.charCodeAt(q))) {
    let r = q + 1;
    while (r >= 0 && r < k && rbIsWordByte(t.charCodeAt(r))) {
      r++;
    }
    if (r - q < 2) {
      break;
    }
    lastEnd = r;
    if (r >= 0 && r < k && t.charCodeAt(r) === 47) {
      q = r + 1;
      continue;
    }
    break;
  }
  return lastEnd;
};

/** COPS_PATTERN at p: `all`, or names separated by \s*,\s*; the end, or -1. */
const rbMatchCops = (t: string, p: i32): i32 => {
  const k = toI32(t.length);
  // A shorter (clamped) substring cannot be "all".
  if (p >= 0 && p <= k - 3 && t.substring(p, p + 3) === "all") {
    return p + 3;
  }
  let e = rbMatchCopName(t, p);
  if (e < 0) {
    return -1;
  }
  while (true) {
    let q = e;
    while (q >= 0 && q < k && rbIsWsByte(t.charCodeAt(q))) {
      q++;
    }
    if (q < 0 || q >= k || t.charCodeAt(q) !== 44) {
      return e;
    }
    q++;
    while (q >= 0 && q < k && rbIsWsByte(t.charCodeAt(q))) {
      q++;
    }
    const e2 = rbMatchCopName(t, q);
    if (e2 < 0) {
      return e;
    }
    e = e2;
  }
};

/** PUSH_POP_ARGS_PATTERN at p: [+-]name(\s+[+-]name)*; the end, or -1. */
const rbMatchSigned = (t: string, p: i32): i32 => {
  const k = toI32(t.length);
  if (p < 0 || p >= k) {
    return -1;
  }
  const c = t.charCodeAt(p);
  if (c !== 43 && c !== 45) {
    return -1;
  }
  let e = rbMatchCopName(t, p + 1);
  if (e < 0) {
    return -1;
  }
  while (true) {
    let q = e;
    while (q >= 0 && q < k && rbIsWsByte(t.charCodeAt(q))) {
      q++;
    }
    if (q === e || q < 0 || q >= k) {
      return e;
    }
    const d = t.charCodeAt(q);
    if (d !== 43 && d !== 45) {
      return e;
    }
    const e2 = rbMatchCopName(t, q + 1);
    if (e2 < 0) {
      return e;
    }
    e = e2;
  }
};

const RB_DIRECTIVE_MODES: string = "disable-next,enable-next,todo-next,disable,enable,todo,push,pop,next";

/** DIRECTIVE_COMMENT_REGEXP matched at the first `#` where it matches (null: none, or `##` prefix). */
const rbParseDirective = (text: string): RbDirective | null => {
  const k = toI32(text.length);
  // A comment of a source file is far shorter.
  if (k > 1073741823) {
    fault();
    return null;
  }
  const modes = rbSplitComma(RB_DIRECTIVE_MODES);
  for (let h = 0; h < k; h++) {
    if (text.charCodeAt(h) !== 35) {
      continue;
    }
    let p = h + 1;
    while (p < k && rbIsWsByte(text.charCodeAt(p))) {
      p++;
    }
    // A shorter (clamped) substring cannot be "rubocop".
    if (p < 0 || p > k - 7 || text.substring(p, p + 7) !== "rubocop") {
      continue;
    }
    p += 7;
    while (p < k && rbIsWsByte(text.charCodeAt(p))) {
      p++;
    }
    if (p >= k || text.charCodeAt(p) !== 58) {
      continue;
    }
    p++;
    while (p < k && rbIsWsByte(text.charCodeAt(p))) {
      p++;
    }
    let mode = "";
    let modeEnd = p;
    for (const m of modes) {
      const mk = toI32(m.length);
      // A shorter (clamped) substring cannot be `m`.
      if (p >= 0 && p <= k && mk >= 0 && mk <= 64 && mk <= k - p) {
        const pe = p + mk;
        if (text.substring(p, pe) === m && !(pe < k && rbIsWordByte(text.charCodeAt(pe)))) {
          mode = m;
          modeEnd = pe;
          break;
        }
      }
    }
    if (mode.length === 0) {
      continue;
    }
    // pre_match =~ /\A#\s*\z/: a `#` (and spaces) before the match voids it.
    let pre = h - 1;
    while (pre >= 0 && rbIsWsByte(text.charCodeAt(pre))) {
      pre--;
    }
    if (h > 0 && text.length > 0 && text.charCodeAt(0) === 35 && pre === 0) {
      return null;
    }
    p = modeEnd;
    let cops = "";
    let q = p;
    while (q >= 0 && q < k && rbIsWsByte(text.charCodeAt(q))) {
      q++;
    }
    if (q > p) {
      const e = rbMatchCops(text, q);
      if (e >= 0) {
        cops = text.substring(q, e);
      } else {
        const e2 = rbMatchSigned(text, q);
        if (e2 >= 0) {
          cops = text.substring(q, e2);
        }
      }
    }
    return new RbDirective(mode, cops, h === 0);
  }
  return null;
};
