// RuboCop::AST::ProcessedSource: a parsed Ruby file with its comments, tokens,
// lines and node ancestry, and the rubocop:disable directives in its comments
// (RuboCop::CommentConfig). Positions are code point offsets.
//
// Ported from rubocop-ast 1.51.0 and RuboCop 1.92.2 (MIT License, Copyright
// (c) 2012-24 Bozhidar Batsov).

import { RbAst, V_NIL, vIdx } from "./ast";
import { rbText } from "./lexer";
import { RbParser } from "./parser";

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
  // Directive comments: whether the file has any we cannot interpret.
  unsupportedDirectives: boolean = false;
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

  /** Parent links and the pre-order node list (an explicit stack: deep trees). */
  private index(root: i32): void {
    const stack: i32[] = [root];
    while (stack.length > 0) {
      const n = stack[stack.length - 1];
      stack.pop();
      this.pre.push(n);
      const k = this.a.kids(n);
      const m = this.a.len(k);
      for (let i = m - 1; i >= 0; i--) {
        const c = this.a.at(k, i);
        if (this.a.isNode(c)) {
          this.parentOf[vIdx(c)] = n;
          stack.push(c);
        }
      }
    }
  }

  parent(n: i32): i32 {
    return this.parentOf[vIdx(n)];
  }

  // ---- Text --------------------------------------------------------------------

  src(s: i32, e: i32): string {
    return rbText(this.pts, s, e);
  }

  nodeSrc(n: i32): string {
    return rbText(this.pts, this.a.exS(n), this.a.exE(n));
  }

  at(i: i32): i32 {
    return i >= 0 && i < this.n ? this.pts[i] : -1;
  }

  /** 1-based line of a position. */
  line(pos: i32): i32 {
    return this.p.st.lineOf(pos);
  }

  /** 0-based column (in characters) of a position. */
  column(pos: i32): i32 {
    return pos - this.lineStarts[this.line(pos) - 1];
  }

  lineCount(): i32 {
    return toI32(this.lineStarts.length);
  }

  /** The start of 1-based line `l`. */
  lineStart(l: i32): i32 {
    return this.lineStarts[l - 1];
  }

  /** The end of 1-based line `l`, before its newline. */
  lineEnd(l: i32): i32 {
    if (l < toI32(this.lineStarts.length)) {
      return this.lineStarts[l] - 1;
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
    for (let i = 0; i < toI32(this.tokT.length); i++) {
      if (this.tokT[i] !== TK_COMMENT && this.line(this.tokS[i]) === l) {
        return false;
      }
    }
    return true;
  }

  // ---- Directives ---------------------------------------------------------------------

  /** The disabled line ranges, per cop, department or "all" (CommentConfig#analyze). */
  private analyzeDirectives(): void {
    // Open disables: name -> start line.
    const openNames: string[] = [];
    const openFrom: i32[] = [];
    for (let ci = 0; ci < toI32(this.commS.length); ci++) {
      const s = this.commS[ci];
      const text = this.src(s, this.commE[ci]);
      const at = text.indexOf("rubocop");
      if (at < 0) {
        continue;
      }
      const d = rbParseDirective(text);
      if (d === null) {
        continue;
      }
      if (d.mode === 3) {
        this.unsupportedDirectives = true;
        return;
      }
      const line = this.line(s);
      const single = !d.leading || !this.commentOnlyLine(line);
      for (const name of d.names) {
        if (single) {
          if (d.mode === 1) {
            this.addRange(name, line, line);
          }
          continue;
        }
        // close
        let k = -1;
        for (let j = 0; j < toI32(openNames.length); j++) {
          if (openNames[j] === name) {
            k = j;
          }
        }
        if (k >= 0) {
          if (openFrom[k] >= 0) {
            this.addRange(name, openFrom[k], line);
          }
          openFrom[k] = d.mode === 1 ? line : -1;
        } else if (d.mode === 1) {
          openNames.push(name);
          openFrom.push(line);
        }
      }
    }
    for (let j = 0; j < toI32(openNames.length); j++) {
      if (openFrom[j] >= 0) {
        this.addRange(openNames[j], openFrom[j], 1 << 30);
      }
    }
  }

  private addRange(name: string, from: i32, to: i32): void {
    this.dirNames.push(name);
    this.dirFrom.push(from);
    this.dirTo.push(to);
  }

  /** cop_enabled_at_lines? for a cop name such as "Style/StringLiterals". */
  copEnabledAt(cop: string, first: i32, last: i32): boolean {
    const k = toI32(this.dirNames.length);
    if (k === 0) {
      return true;
    }
    const slash = cop.indexOf("/");
    const dept = slash >= 0 ? cop.substring(0, slash) : cop;
    for (let i = 0; i < k; i++) {
      const nm = this.dirNames[i];
      if (nm === cop || nm === dept || nm === "all") {
        if (this.dirTo[i] >= first && this.dirFrom[i] <= last) {
          return false;
        }
      }
    }
    return true;
  }
}

/** A directive comment: mode 1 disable/todo, 2 enable, 3 a form not handled (push, pop, next). */
class RbDirective {
  mode: i32;
  names: string[];
  leading: boolean;

  constructor(mode: i32, names: string[], leading: boolean) {
    this.mode = mode;
    this.names = names;
    this.leading = leading;
  }
}

const rbIsSpace = (c: i32): boolean => c === 32 || c === 9;

/** DirectiveComment's DIRECTIVE_COMMENT_REGEXP: `# rubocop : disable A/B, C`. */
const rbParseDirective = (text: string): RbDirective | null => {
  const k = toI32(text.length);
  // Find "#" then optional spaces then "rubocop".
  let i = text.indexOf("rubocop");
  while (i >= 0) {
    let j = i - 1;
    while (j >= 0 && rbIsSpace(text.charCodeAt(j))) {
      j--;
    }
    if (j >= 0 && text.charCodeAt(j) === 35) {
      break;
    }
    const nx = text.substring(i + 7, k).indexOf("rubocop");
    i = nx < 0 ? -1 : i + 7 + nx;
  }
  if (i < 0) {
    return null;
  }
  let hash = i - 1;
  while (hash >= 0 && rbIsSpace(text.charCodeAt(hash))) {
    hash--;
  }
  const leading = hash === 0;
  let p = i + 7;
  while (p < k && rbIsSpace(text.charCodeAt(p))) {
    p++;
  }
  if (p >= k || text.charCodeAt(p) !== 58) {
    return null;
  }
  p++;
  while (p < k && rbIsSpace(text.charCodeAt(p))) {
    p++;
  }
  // MODES_PATTERN followed by \b: the longest mode the text starts with.
  const modes = ["disable-next", "enable-next", "todo-next", "disable", "enable", "todo", "push", "pop", "next"];
  let mode = 0;
  let w = p;
  for (const m of modes) {
    const mk = toI32(m.length);
    if (text.substring(p, p + mk) === m) {
      const c = p + mk < k ? text.charCodeAt(p + mk) : 32;
      const wordc = (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57) || c === 95;
      if (!wordc) {
        w = p + mk;
        mode = m === "disable" || m === "todo" ? 1 : m === "enable" ? 2 : 3;
        break;
      }
    }
  }
  if (mode === 0) {
    return null;
  }
  // Names: [A-Za-z/_0-9]+ separated by commas.
  const names: string[] = [];
  p = w;
  while (p < k) {
    while (p < k && rbIsSpace(text.charCodeAt(p))) {
      p++;
    }
    let q = p;
    while (q < k) {
      const c = text.charCodeAt(q);
      if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 47 || c === 95) {
        q++;
      } else {
        break;
      }
    }
    if (q === p) {
      break;
    }
    names.push(text.substring(p, q));
    p = q;
    while (p < k && rbIsSpace(text.charCodeAt(p))) {
      p++;
    }
    if (p < k && text.charCodeAt(p) === 44) {
      p++;
      continue;
    }
    break;
  }
  if (names.length === 0) {
    return mode === 3 ? new RbDirective(3, names, leading) : null;
  }
  return new RbDirective(mode, names, leading);
};

