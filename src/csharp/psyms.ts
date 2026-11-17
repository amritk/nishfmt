// The preprocessor symbol sets CSharpier reformats a file with: each #if
// group's conditions are solved for a set of defined symbols that makes them
// true (PreprocessorSymbols.cs), the conditions parsed the way
// BooleanExpressionParser.cs parses them.
//
// Ported from CSharpier 1.4.0 (MIT License, Copyright (c) 2021 Bela
// VanderVoort).

// Expression tokens.

import { K_ElifDirectiveTrivia, K_ElseDirectiveTrivia, K_EndIfDirectiveTrivia, K_IfDirectiveTrivia } from "./kinds";
import { CsLexer } from "./lexer";
import { cswCultureCompare } from "./print";

const BT_AND: i32 = 0;
const BT_OR: i32 = 1;
const BT_NOT: i32 = 2;
const BT_VAR: i32 = 3;
const BT_LPAREN: i32 = 4;
const BT_RPAREN: i32 = 5;
const BT_EQ: i32 = 6;
const BT_TRUE: i32 = 7;
const BT_FALSE: i32 = 8;
const BT_NE: i32 = 9;

/** A boolean expression over symbols, as postfix code; `allTrue` for the ones an #else adds. */
class CsBoolExpr {
  params: string[];
  code: i32[]; // token types, BT_VAR followed by the index of its parameter
  allTrue: boolean = false;
  constructor() {
    this.params = [];
    this.code = [];
  }

  paramIndex(name: string): i32 {
    for (let i = 0; i < toI32(this.params.length); i++) {
      if (this.params[i] === name) {
        return i;
      }
    }
    this.params.push(name);
    return toI32(this.params.length) - 1;
  }
}

class CsSymContext {
  parent: CsSymContext | null;
  exprs: CsBoolExpr[];
  constructor(parent: CsSymContext | null) {
    this.exprs = [];
    this.parent = parent;
  }
}

/** The symbol sets; `failed` when a condition does not parse the way CSharpier's parser accepts. */
export class CsSymbolSets {
  sets: string[][];
  keys: string[];
  failed: boolean = false;
  constructor() {
    this.sets = [];
    this.keys = [];
  }
}

const csbIsValueChar = (c: i32): boolean =>
  (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57) || c === 95 || c >= 0x80;

/** BooleanExpressionParser.Parse of src[a, b); null when it would throw. */
const csbParse = (src: u8[], a: i32, b: i32): CsBoolExpr | null => {
  // tokenize
  const types: i32[] = [];
  const vals: string[] = [];
  let x = a;
  while (x < b) {
    const c = toI32(src[x]);
    if (c === 32 || (c >= 9 && c <= 13)) {
      x++;
      continue;
    }
    if (csbIsValueChar(c)) {
      const s = x;
      while (x < b && csbIsValueChar(toI32(src[x]))) {
        x++;
      }
      const v = String.fromBytes(src, s, x);
      if (v === "true") {
        types.push(BT_TRUE);
      } else if (v === "false") {
        types.push(BT_FALSE);
      } else {
        types.push(BT_VAR);
      }
      vals.push(v);
      continue;
    }
    if (c === 40) {
      types.push(BT_LPAREN);
    } else if (c === 41) {
      types.push(BT_RPAREN);
    } else if (c === 38) {
      x++;
      types.push(BT_AND);
    } else if (c === 124) {
      x++;
      types.push(BT_OR);
    } else if (c === 61) {
      x++;
      types.push(BT_EQ);
    } else if (c === 33) {
      if (x + 1 >= b) {
        return null;
      }
      if (toI32(src[x + 1]) === 61) {
        x++;
        types.push(BT_NE);
      } else {
        types.push(BT_NOT);
      }
    } else {
      return null;
    }
    vals.push("");
    x++;
  }
  // shunting yard
  const outT: i32[] = [];
  const outV: string[] = [];
  const opT: i32[] = [];
  for (let i = 0; i < toI32(types.length); i++) {
    const t = types[i];
    if (t === BT_FALSE || t === BT_TRUE || t === BT_VAR) {
      outT.push(t);
      outV.push(vals[i]);
    } else if (t === BT_AND || t === BT_OR || t === BT_EQ || t === BT_NE) {
      while (toI32(opT.length) > 0 && opT[toI32(opT.length) - 1] !== BT_LPAREN) {
        outT.push(opT.pop());
        outV.push("");
      }
      opT.push(t);
    } else if (t === BT_NOT || t === BT_LPAREN) {
      opT.push(t);
    } else {
      while (true) {
        if (toI32(opT.length) === 0) {
          return null;
        }
        if (opT[toI32(opT.length) - 1] === BT_LPAREN) {
          break;
        }
        outT.push(opT.pop());
        outV.push("");
      }
      opT.pop();
    }
  }
  while (toI32(opT.length) > 0) {
    outT.push(opT.pop());
    outV.push("");
  }
  // check that it evaluates (the stack never underflows and ends with a value)
  const e = new CsBoolExpr();
  let depth = 0;
  for (let i = 0; i < toI32(outT.length); i++) {
    const t = outT[i];
    e.code.push(t);
    if (t === BT_VAR) {
      e.code.push(e.paramIndex(outV[i]));
      depth++;
    } else if (t === BT_TRUE || t === BT_FALSE) {
      depth++;
    } else if (t === BT_NOT) {
      if (depth < 1) {
        return null;
      }
    } else if (t === BT_LPAREN) {
      // a parenthesis left on the stack: BuildFunction ignores it
    } else {
      if (depth < 2) {
        return null;
      }
      depth--;
    }
  }
  if (depth < 1) {
    return null;
  }
  return e;
};

/** The expression's value with its parameters set from the bits of `combo`. */
const csbEval = (e: CsBoolExpr, combo: i32): boolean => {
  if (e.allTrue) {
    const n = toI32(e.params.length);
    for (let i = 0; i < n; i++) {
      if ((combo & (1 << i)) === 0) {
        return false;
      }
    }
    return true;
  }
  const st: boolean[] = [];
  let i = 0;
  const code = e.code;
  while (i < toI32(code.length)) {
    const t = code[i];
    i++;
    if (t === BT_VAR) {
      st.push((combo & (1 << code[i])) !== 0);
      i++;
    } else if (t === BT_TRUE) {
      st.push(true);
    } else if (t === BT_FALSE) {
      st.push(false);
    } else if (t === BT_NOT) {
      st.push(!st.pop());
    } else if (t === BT_AND) {
      const r = st.pop();
      const l = st.pop();
      st.push(l && r);
    } else if (t === BT_OR) {
      const r = st.pop();
      const l = st.pop();
      st.push(l || r);
    } else if (t === BT_EQ) {
      const r = st.pop();
      const l = st.pop();
      st.push(l === r);
    } else if (t === BT_NE) {
      const r = st.pop();
      const l = st.pop();
      st.push(l !== r);
    }
  }
  return st.pop();
};

/** The value with parameters named by `names` set from the bits of `combo` (names a superset of e's). */
const csbEvalNamed = (e: CsBoolExpr, names: string[], combo: i32): boolean => {
  let own = 0;
  for (let i = 0; i < toI32(e.params.length); i++) {
    for (let j = 0; j < toI32(names.length); j++) {
      if (names[j] === e.params[i]) {
        if ((combo & (1 << j)) !== 0) {
          own = own | (1 << i);
        }
        break;
      }
    }
  }
  return csbEval(e, own);
};

const csbSortStrings = (xs: string[]): void => {
  const n = toI32(xs.length);
  for (let i = 1; i < n; i++) {
    const v = xs[i];
    let j = i - 1;
    while (j >= 0 && csbCompare(xs[j], v) > 0) {
      xs[j + 1] = xs[j];
      j--;
    }
    xs[j + 1] = v;
  }
};

const csbCompare = (a: string, b: string): i32 => {
  const ab = csbBytes(a);
  const bb = csbBytes(b);
  return cswCultureCompare(ab, 0, toI32(ab.length), bb, 0, toI32(bb.length), false);
};

const csbBytes = (s: string): u8[] => {
  const n = toI32(s.length);
  const out = new Array<u8>(n);
  for (let i = 0; i < n; i++) {
    out[i] = toU8(s.charCodeAt(i));
  }
  return out;
};

/** GetSymbols: the true parameters of the first combination that makes e true, sorted. */
const csbSymbols = (e: CsBoolExpr): string[] => {
  const n = toI32(e.params.length);
  const out: string[] = [];
  if (n > 20) {
    return out;
  }
  const total = 1 << n;
  for (let combo = 0; combo < total; combo++) {
    if (csbEval(e, combo)) {
      for (let i = 0; i < n; i++) {
        if ((combo & (1 << i)) !== 0) {
          out.push(e.params[i]);
        }
      }
      csbSortStrings(out);
      return out;
    }
  }
  return out;
};

/** PreprocessorSymbols.GetSets over the directives of a lexed file. */
export const csSymbolSets = (lx: CsLexer): CsSymbolSets => {
  const r = new CsSymbolSets();
  if (!lx.hasDirectives) {
    return r;
  }
  const root = new CsSymContext(new CsSymContext(null));
  let cur = root;
  const src = lx.src;
  for (let i = 0; i < lx.ntr; i++) {
    const k = lx.trKind[i];
    if (k === K_IfDirectiveTrivia || k === K_ElifDirectiveTrivia) {
      if (k === K_IfDirectiveTrivia) {
        cur = new CsSymContext(cur);
      }
      const a = lx.trAux[i];
      let b = lx.trTextEnd[i];
      for (let j = a; j < b; j++) {
        if (toI32(src[j]) === 47) {
          if (j > a) {
            b = j;
          }
          break;
        }
      }
      const e = csbParse(src, a, b);
      if (e === null) {
        r.failed = true;
        return r;
      }
      cur.exprs.push(e);
    } else if (k === K_ElseDirectiveTrivia) {
      const all: string[] = [];
      for (let j = 0; j < toI32(cur.exprs.length); j++) {
        const ps = cur.exprs[j].params;
        for (let m = 0; m < toI32(ps.length); m++) {
          let seen = false;
          for (let q = 0; q < toI32(all.length); q++) {
            if (all[q] === ps[m]) {
              seen = true;
            }
          }
          if (!seen) {
            all.push(ps[m]);
          }
        }
      }
      const n = toI32(all.length);
      if (n > 20) {
        continue;
      }
      let found = -1;
      for (let combo = 0; combo < 1 << n && found < 0; combo++) {
        let allFalse = true;
        for (let j = 0; j < toI32(cur.exprs.length); j++) {
          if (csbEvalNamed(cur.exprs[j], all, combo)) {
            allFalse = false;
            break;
          }
        }
        if (allFalse) {
          found = combo;
        }
      }
      if (found < 0) {
        continue;
      }
      const e = new CsBoolExpr();
      e.allTrue = true;
      for (let j = n - 1; j >= 0; j--) {
        if ((found & (1 << j)) !== 0) {
          e.params.push(all[j]);
        }
      }
      cur.exprs.push(e);
    } else if (k === K_EndIfDirectiveTrivia) {
      const parent = cur.parent;
      if (parent === null) {
        r.failed = true;
        return r;
      }
      let parentSymbols: string[] = [];
      if (toI32(parent.exprs.length) !== 0) {
        parentSymbols = csbSymbols(parent.exprs[toI32(parent.exprs.length) - 1]);
      }
      for (let j = 0; j < toI32(cur.exprs.length); j++) {
        const own = csbSymbols(cur.exprs[j]);
        const set: string[] = [];
        for (let m = 0; m < toI32(own.length) + toI32(parentSymbols.length); m++) {
          const s = m < toI32(own.length) ? own[m] : parentSymbols[m - toI32(own.length)];
          let seen = false;
          for (let q = 0; q < toI32(set.length); q++) {
            if (set[q] === s) {
              seen = true;
            }
          }
          if (!seen) {
            set.push(s);
          }
        }
        if (toI32(set.length) <= 0) {
          continue;
        }
        let key = "";
        for (let m = 0; m < toI32(set.length); m++) {
          key = m === 0 ? set[m] : key + "," + set[m];
        }
        let known = false;
        for (let q = 0; q < toI32(r.keys.length); q++) {
          if (r.keys[q] === key) {
            known = true;
          }
        }
        if (!known) {
          r.sets.push(set);
          r.keys.push(key);
        }
      }
      cur = parent;
    }
  }
  return r;
};
