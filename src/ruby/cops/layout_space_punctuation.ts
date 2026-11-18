// The Layout cops about the space around commas, semicolons and comments:
// SpaceAfterComma, SpaceAfterSemicolon (SpaceAfterPunctuation over the tokens
// in emission order), SpaceBeforeComma, SpaceBeforeSemicolon
// (SpaceBeforePunctuation over the sorted tokens) and SpaceBeforeComment.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { RbCop } from "../cop";
import { RbSource, TK_COMMENT } from "../source";
import {
  TK_tCOMMA,
  TK_tLAMBEG,
  TK_tLCURLY,
  TK_tPIPE,
  TK_tRBRACK,
  TK_tRPAREN,
  TK_tSEMI,
  TK_tSTRING_DEND,
} from "../tables";
import { LspToks } from "./layout_space_help";

/** SpaceAfterPunctuation#each_missing_space over the raw tokens (`semi`: the semicolon cop). */
const lspAfterPunctuation = (cop: RbCop, src: RbSource, semi: boolean): void => {
  const n = toI32(src.tokT.length);
  for (let i = 0; i + 1 < n; i++) {
    const t1 = src.tokT[i];
    const t2 = src.tokT[i + 1];
    if (semi) {
      if (t1 !== TK_tSEMI) {
        continue;
      }
    } else if (t1 !== TK_tCOMMA || t2 === TK_tSEMI) {
      continue;
    }
    const s1 = src.tokS[i];
    const s2 = src.tokS[i + 1];
    if (src.line(s1) !== src.line(s2) || src.column(s2) !== src.column(s1) + 1) {
      continue;
    }
    if (semi && t2 === TK_tSEMI) {
      continue;
    }
    // space_required_before? (the rcurly style is space for both cops)
    if (t2 === TK_tRPAREN || t2 === TK_tRBRACK || t2 === TK_tPIPE || t2 === TK_tSTRING_DEND) {
      continue;
    }
    const e1 = src.tokE[i];
    const k = cop.offense(s1, e1);
    if (k !== null) {
      k.replace(s1, e1, `${src.src(s1, e1)} `);
      cop.commit(k);
    }
  }
};

/** SpaceBeforePunctuation#each_missing_space over the sorted tokens. */
const lspBeforePunctuation = (cop: RbCop, src: RbSource, kind: i32): void => {
  const tk = new LspToks(src);
  for (let i = 0; i + 1 < tk.n; i++) {
    if (tk.t[i + 1] !== kind) {
      continue;
    }
    const e1 = tk.e[i];
    const s2 = tk.s[i + 1];
    if (src.line(tk.s[i]) !== src.line(s2) || s2 <= e1) {
      continue;
    }
    // space_required_after?: SpaceInsideBlockBraces is the space style.
    if (tk.t[i] === TK_tLCURLY || tk.t[i] === TK_tLAMBEG) {
      continue;
    }
    const k = cop.offense(e1, s2);
    if (k !== null) {
      k.remove(e1, s2);
      cop.commit(k);
    }
  }
};

export class CopLayoutSpaceAfterComma {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/SpaceAfterComma");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    lspAfterPunctuation(this.c, src, false);
  }
}

export class CopLayoutSpaceAfterSemicolon {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/SpaceAfterSemicolon");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    lspAfterPunctuation(this.c, src, true);
  }
}

export class CopLayoutSpaceBeforeComma {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/SpaceBeforeComma");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    lspBeforePunctuation(this.c, src, TK_tCOMMA);
  }
}

export class CopLayoutSpaceBeforeSemicolon {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/SpaceBeforeSemicolon");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    lspBeforePunctuation(this.c, src, TK_tSEMI);
  }
}

export class CopLayoutSpaceBeforeComment {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Layout/SpaceBeforeComment");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const tk = new LspToks(src);
    for (let i = 0; i + 1 < tk.n; i++) {
      if (tk.t[i + 1] !== TK_COMMENT) {
        continue;
      }
      const s2 = tk.s[i + 1];
      if (src.line(tk.s[i]) !== src.line(s2) || tk.e[i] !== s2) {
        continue;
      }
      const k = this.c.offense(s2, tk.e[i + 1]);
      if (k !== null) {
        k.insertBefore(s2, tk.e[i + 1], " ");
        this.c.commit(k);
      }
    }
  }
}
