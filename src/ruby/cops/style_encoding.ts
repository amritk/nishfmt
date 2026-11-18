// Style/Encoding.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { RbCop } from "../cop";
import { rbSpaceEnd } from "../help";
import { RbSource } from "../source";
import { rbLitSpaceC } from "./lit_help";
import { RbMagicComment } from "./lit_magic";

/** String#casecmp('utf-8').zero? */
const rbEncIsUtf8 = (s: string): boolean => {
  if (s.length !== 5) {
    return false;
  }
  const w = "utf-8";
  for (let i = 0; i < 5; i++) {
    let c = s.charCodeAt(i);
    if (c >= 65 && c <= 90) {
      c += 32;
    }
    if (c !== w.charCodeAt(i)) {
      return false;
    }
  }
  return true;
};

export class CopStyleEncoding {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/Encoding");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    if (src.n === 0) {
      return;
    }
    for (let l = 1; l <= src.lineCount(); l++) {
      const line = src.lineText(l);
      if (line.startsWith("#!")) {
        continue;
      }
      const m = new RbMagicComment(line);
      if (!m.valid()) {
        break;
      }
      const enc = m.encoding();
      if (enc === null || !rbEncIsUtf8(enc)) {
        continue;
      }
      const s = src.lineStart(l);
      const e = src.lineEnd(l);
      const k = this.c.offense(s, e);
      if (k === null) {
        continue;
      }
      const text = m.withoutEncoding();
      let blank = true;
      for (let i = 0; i < toI32(text.length); i++) {
        if (!rbLitSpaceC(text.charCodeAt(i))) {
          blank = false;
        }
      }
      if (blank) {
        k.remove(s, rbSpaceEnd(src, e, 2, true, false, false));
      } else {
        k.replace(s, e, text);
      }
      this.c.commit(k);
    }
  }
}
