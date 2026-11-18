// Style/CommentedKeyword (its correction is unsafe: detection only).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { RbCop } from "../cop";
import { RbSource } from "../source";
import { sbhDirectiveComment } from "./style_body_help";
import { ssxIsSpace, ssxIsWord } from "./style_syntax_help";

/** The index after leading `\s*` from i. */
const rbCkwSkipSpace = (s: string, i0: i32): i32 => {
  let i = i0;
  while (i < toI32(s.length) && ssxIsSpace(s.charCodeAt(i))) {
    i++;
  }
  return i;
};

/** /^\s*<kw>\s/ on one line. */
const rbCkwKeywordLine = (line: string, kw: string): boolean => {
  const i = rbCkwSkipSpace(line, 0);
  const k = toI32(kw.length);
  return line.substring(i, i + k) === kw && i + k < toI32(line.length) && ssxIsSpace(line.charCodeAt(i + k));
};

/** /#\s*<word>/ anywhere. */
const rbCkwHashThen = (s: string, word: string): boolean => {
  for (let p = 0; p < toI32(s.length); p++) {
    if (s.charCodeAt(p) !== 35) {
      continue;
    }
    const q = rbCkwSkipSpace(s, p + 1);
    if (s.substring(q, q + toI32(word.length)) === word) {
      return true;
    }
  }
  return false;
};

/** The end of `(\w|::)+` from i (i itself when none). */
const rbCkwNameRun = (s: string, i0: i32): i32 => {
  let i = i0;
  const k = toI32(s.length);
  while (i < k) {
    if (ssxIsWord(s.charCodeAt(i))) {
      i++;
    } else if (s.charCodeAt(i) === 58 && i + 1 < k && s.charCodeAt(i + 1) === 58) {
      i += 2;
    } else {
      break;
    }
  }
  return i;
};

/** SUBCLASS_DEFINITION: /\A\s*class\s+(\w|::)+\s*<\s*(\w|::)+/. */
const rbCkwSubclass = (s: string): boolean => {
  let i = rbCkwSkipSpace(s, 0);
  if (s.substring(i, i + 5) !== "class") {
    return false;
  }
  i += 5;
  const j = rbCkwSkipSpace(s, i);
  if (j === i) {
    return false;
  }
  // (\w|::)+ backtracks, but `\s*<` after it only fits at the run's end.
  const e = rbCkwNameRun(s, j);
  if (e === j) {
    return false;
  }
  i = rbCkwSkipSpace(s, e);
  if (i >= toI32(s.length) || s.charCodeAt(i) !== 60) {
    return false;
  }
  i = rbCkwSkipSpace(s, i + 1);
  return rbCkwNameRun(s, i) > i;
};

/** METHOD_OR_END_DEFINITIONS: /\A\s*(def\s|end)/. */
const rbCkwDefOrEnd = (s: string): boolean => {
  const i = rbCkwSkipSpace(s, 0);
  if (s.substring(i, i + 3) === "end") {
    return true;
  }
  return s.substring(i, i + 3) === "def" && i + 3 < toI32(s.length) && ssxIsSpace(s.charCodeAt(i + 3));
};

/** comment.text.start_with?(/#\[.+\]/). */
const rbCkwRbsBracket = (t: string): boolean => {
  if (!t.startsWith("#[")) {
    return false;
  }
  for (let i = 3; i < toI32(t.length); i++) {
    if (t.charCodeAt(i) === 93) {
      return true;
    }
  }
  return false;
};

/** STEEP_REGEXP: /#\ssteep:ignore(\s|\z)/. */
const rbCkwSteep = (t: string): boolean => {
  const k = toI32(t.length);
  for (let p = 0; p + 1 < k; p++) {
    if (t.charCodeAt(p) !== 35 || !ssxIsSpace(t.charCodeAt(p + 1))) {
      continue;
    }
    const q = p + 2;
    if (t.substring(q, q + 12) === "steep:ignore" && (q + 12 === k || ssxIsSpace(t.charCodeAt(q + 12)))) {
      return true;
    }
  }
  return false;
};

export class CopStyleCommentedKeyword {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/CommentedKeyword");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    for (let i = 0; i < toI32(src.commS.length); i++) {
      const s = src.commS[i];
      const e = src.commE[i];
      const line = src.lineText(src.line(s));
      const text = src.src(s, e);
      // rbs_inline_annotation?
      if (rbCkwSubclass(line)) {
        if (rbCkwRbsBracket(text)) {
          continue;
        }
      } else if (rbCkwDefOrEnd(line)) {
        if (text.startsWith("#:")) {
          continue;
        }
      }
      if (rbCkwSteep(text)) {
        continue;
      }
      const kws = ["begin", "class", "def", "end", "module"];
      let kw = false;
      for (const w of kws) {
        if (rbCkwKeywordLine(line, w)) {
          kw = true;
        }
      }
      if (!kw) {
        continue;
      }
      if (rbCkwHashThen(line, ":nodoc:") || rbCkwHashThen(line, ":yields:") || sbhDirectiveComment(line)) {
        continue;
      }
      // REGEXP /(?<keyword>\S+).*#/: some `#` after a non-space run.
      this.c.offense(s, e);
    }
  }
}
