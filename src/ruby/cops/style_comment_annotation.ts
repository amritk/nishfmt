// Style/CommentAnnotation (Keywords: TODO FIXME OPTIMIZE HACK REVIEW NOTE,
// RequireColon: true).
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { rbAtOff } from "../help";
import { add32, atI32, sub32 } from "../../core/arr";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxIsSpace, ssxIsWord } from "./style_syntax_help";

/** ASCII upcase of one code point. */
const sbhCaUp = (c: i32): i32 => (c >= 97 && c <= 122 ? c - 32 : c);

/** A word character for \b in a UTF-8 regexp: ASCII \w, or a non-ASCII character outside the common punctuation blocks. */
const sbhCaWordChar = (c: i32): boolean => {
  if (c < 0x80) {
    return ssxIsWord(c);
  }
  if (
    (c >= 0x2000 && c <= 0x206f) ||
    (c >= 0x3000 && c <= 0x303f) ||
    (c >= 0xff00 && c <= 0xff0f) ||
    c === 0xa0 ||
    (c >= 0xa1 && c <= 0xbf && c !== 0xaa && c !== 0xb5 && c !== 0xba)
  ) {
    return false;
  }
  return true;
};

/** The keyword (upper case) matching case-insensitively at p, followed by \b ("" for none). */
const sbhCaKeyword = (src: RbSource, p: i32, end: i32): string => {
  const kws = ["OPTIMIZE", "REVIEW", "FIXME", "TODO", "HACK", "NOTE"];
  for (const kw of kws) {
    const k = toI32(kw.length);
    if (toI64(p) + toI64(k) > toI64(end)) {
      continue;
    }
    let ok = true;
    for (let i = 0; i < k; i++) {
      if (sbhCaUp(rbAtOff(src, p, i)) !== kw.charCodeAt(i)) {
        ok = false;
        break;
      }
    }
    if (!ok) {
      continue;
    }
    if (toI64(p) + toI64(k) < toI64(end) && sbhCaWordChar(rbAtOff(src, p, k))) {
      continue;
    }
    return kw;
  }
  return "";
};

/** Style/CommentAnnotation. */
export class CopStyleCommentAnnotation {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/CommentAnnotation");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const commS = src.commS;
    const commE = src.commE;
    const nc = toI32(commS.length);
    for (let i = 0; i < nc && i < commS.length && i < commE.length; i++) {
      const cs = commS[i];
      const ce = commE[i];
      const line = src.line(cs);
      const first = i === 0 || toI64(src.line(atI32(commS, i - 1))) < toI64(line) - toI64(1);
      let inline = false;
      if (!first) {
        // comment_line? on the comment's first line: /^\s*#/
        let p = src.lineStart(line);
        const le = src.lineEnd(line);
        while (p < le && ssxIsSpace(src.at(p))) {
          p++;
        }
        inline = !(p < le && src.at(p) === 35);
      }
      if (!first && !inline) {
        continue;
      }
      this.check(src, cs, ce);
    }
  }

  /** AnnotationComment over the comment [cs, ce): the first match of /^(# ?)(\bKW\b)(\s*:)?(\s+)?(\S+)?/i. */
  private check(src: RbSource, cs: i32, ce: i32): void {
    for (let st = cs; st < ce; st++) {
      if (st > cs && rbAtOff(src, st, -1) !== 10) {
        continue;
      }
      if (src.at(st) !== 35) {
        continue;
      }
      // (# ?) is greedy: try "# " first, then "#".
      let kp = -1;
      let kw = "";
      if (st + 1 < ce && src.at(st + 1) === 32) {
        kw = sbhCaKeyword(src, add32(st, 2), ce);
        if (kw.length > 0) {
          kp = add32(st, 2);
        }
      }
      if (kp < 0) {
        kw = sbhCaKeyword(src, st + 1, ce);
        if (kw.length > 0) {
          kp = st + 1;
        }
      }
      if (kp < 0) {
        continue;
      }
      this.annotation(src, cs, ce, kp, kw, add32(cs, sub32(kp, st)));
      return;
    }
  }

  /** The annotation whose keyword is at kp; its bounds start at `start` (comment begin + margin length). */
  private annotation(src: RbSource, cs: i32, ce: i32, kp: i32, kw: string, start: i32): void {
    let p = add32(kp, toI32(kw.length));
    // (\s*:)?
    let q = p;
    while (q < ce && ssxIsSpace(src.at(q))) {
      q++;
    }
    let colon = false;
    if (q < ce && src.at(q) === 58) {
      colon = true;
      p = q + 1;
    }
    // (\s+)?
    const spS = p;
    while (p < ce && ssxIsSpace(src.at(p))) {
      p++;
    }
    const space = p > spS;
    // (\S+)?
    const note = p < ce && !ssxIsSpace(src.at(p));
    // annotation?: keyword_appearance? && !just_keyword_of_sentence?
    if (!colon && !space) {
      return;
    }
    let upper = true;
    let capitalized = true;
    for (let i = 0; i < toI32(kw.length); i++) {
      const c = rbAtOff(src, kp, i);
      if (c >= 97 && c <= 122) {
        upper = false;
        if (i === 0) {
          capitalized = false;
        }
      } else if (i > 0) {
        capitalized = false;
      }
    }
    if (capitalized && !colon && space && note) {
      return;
    }
    // correct?(colon: true)
    if (space && note && upper && colon) {
      return;
    }
    const end = add32(start, sub32(p, kp));
    const k = this.c.offense(start, end);
    if (k === null) {
      return;
    }
    if (note) {
      k.replace(start, end, `${kw}: `);
    }
    this.c.commit(k);
  }
}
