// The Layout cops about the space around commas, semicolons and comments:
// SpaceAfterComma, SpaceAfterSemicolon (SpaceAfterPunctuation over the tokens
// in emission order), SpaceBeforeComma, SpaceBeforeSemicolon
// (SpaceBeforePunctuation over the sorted tokens) and SpaceBeforeComment.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { add32, atI32 } from "../../core/arr";
import { fault } from "../../core/fault";
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
  const tokT = src.tokT;
  const tokS = src.tokS;
  const n = toI32(tokT.length);
  for (let i = 0; i < n && i + 1 < tokT.length; i++) {
    const t1 = tokT[i];
    const t2 = tokT[i + 1];
    if (semi) {
      if (t1 !== TK_tSEMI) {
        continue;
      }
    } else if (t1 !== TK_tCOMMA || t2 === TK_tSEMI) {
      continue;
    }
    // Every token has a start.
    if (i + 1 >= tokS.length) {
      fault();
      return;
    }
    const s1 = tokS[i];
    const s2 = tokS[i + 1];
    if (src.line(s1) !== src.line(s2) || src.column(s2) !== add32(src.column(s1), 1)) {
      continue;
    }
    if (semi && t2 === TK_tSEMI) {
      continue;
    }
    // space_required_before? (the rcurly style is space for both cops)
    if (t2 === TK_tRPAREN || t2 === TK_tRBRACK || t2 === TK_tPIPE || t2 === TK_tSTRING_DEND) {
      continue;
    }
    const e1 = atI32(src.tokE, i);
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
  const tt = tk.t;
  const ts = tk.s;
  const te = tk.e;
  for (let i = 0; i < tk.n && i + 1 < tk.n; i++) {
    // The sorted arrays hold tk.n tokens each.
    if (i + 1 >= tt.length || i + 1 >= ts.length || i + 1 >= te.length) {
      fault();
      return;
    }
    if (tt[i + 1] !== kind) {
      continue;
    }
    const t1 = tt[i];
    const e1 = te[i];
    const s1 = ts[i];
    const s2 = ts[i + 1];
    if (src.line(s1) !== src.line(s2) || s2 <= e1) {
      continue;
    }
    // space_required_after?: SpaceInsideBlockBraces is the space style.
    if (t1 === TK_tLCURLY || t1 === TK_tLAMBEG) {
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
    const tt = tk.t;
    const ts = tk.s;
    const te = tk.e;
    for (let i = 0; i < tk.n && i + 1 < tk.n; i++) {
      // The sorted arrays hold tk.n tokens each.
      if (i + 1 >= tt.length || i + 1 >= ts.length || i + 1 >= te.length) {
        fault();
        return;
      }
      if (tt[i + 1] !== TK_COMMENT) {
        continue;
      }
      const s1 = ts[i];
      const e1 = te[i];
      const s2 = ts[i + 1];
      const e2 = te[i + 1];
      if (src.line(s1) !== src.line(s2) || e1 !== s2) {
        continue;
      }
      const k = this.c.offense(s2, e2);
      if (k !== null) {
        k.insertBefore(s2, e2, " ");
        this.c.commit(k);
      }
    }
  }
}
