// Whether a C++ formatting run kept the code. clang-format changes only
// whitespace and comments, splits a long string literal into adjacent ones,
// and sorts #include lines and plain using-declarations; a run that changed
// anything else (dropped a directive's line continuation, say, which takes
// the lines after it out of the macro) is a nishfmt bug, and its output is
// not used. formatCpp prints each run's input and output with cppCodePrint
// and compares the prints.

import { Doc } from "./doc";
import {
  CW_OVERRIDE,
  K_CHAR,
  K_COMMENT,
  K_EOF,
  K_IDENT,
  K_STRING,
  P_HASH,
  P_HASHHASH,
  P_LBRACE,
  P_LPAREN,
  P_COLONCOLON,
  P_COMMA,
  P_LSQUARE,
  P_RBRACE,
  P_RPAREN,
  P_RSQUARE,
  P_SEMI,
  PP_INCLUDE,
} from "./tok";
import { add32 } from "../core/arr";
import { fault } from "../core/fault";
import { stableSort } from "../core/sort";

/** FNV-1a's 64-bit offset basis, 0xcbf29ce484222325. */
const cppFnvOffset = (): u64 => {
  const hi: u64 = 3421674724;
  const lo: u64 = 2216829733;
  return (hi << toU64(32)) | lo;
};

/** FNV-1a's 64-bit prime. */
const cppFnvPrime = (): u64 => 1099511628211;

/** splitmix64's first multiplier, 0xbf58476d1ce4e5b9. */
const cppMixMul = (): u64 => {
  const hi: u64 = 3210233709;
  const lo: u64 = 484763065;
  return (hi << toU64(32)) | lo;
};

/**
 * A fingerprint of a lexed document's code. `seq` hashes the tokens in order
 * but for comments, each marked as code, directive or a directive's `#`, with
 * adjacent string literals joined. #include directives are left out of it and
 * counted as a set, since clang-format sorts them and drops one that repeats
 * another; the using-declarations it sorts, as a multiset.
 */
export class CppCodePrint {
  seq: u64 = 0;
  // The tokens without their directive marks, and whether a `#` stood in
  // code: clang-format may start a line with one, which makes it a
  // directive, and a file with one is not C++ to begin with.
  flat: u64 = 0;
  stray: boolean = false;
  incSum: u64 = 0;
  incMix: u64 = 0;
  nInc: i32 = 0;
  useSum: u64 = 0;
  useMix: u64 = 0;
  nUse: i32 = 0;
  nTok: i32 = 0;
}

/** Whether two prints are of the same code. */
export const cppSameCode = (a: CppCodePrint, b: CppCodePrint): boolean =>
  (a.stray || b.stray ? a.flat === b.flat : a.seq === b.seq) &&
  a.nTok === b.nTok &&
  a.nInc === b.nInc &&
  a.incSum === b.incSum &&
  a.incMix === b.incMix &&
  a.nUse === b.nUse &&
  a.useSum === b.useSum &&
  a.useMix === b.useMix;

const cppFnvByte = (h: u64, b: i32): u64 => (h ^ toU64(b & 255)) * cppFnvPrime();

const cppFnvRange = (h0: u64, src: u8[], a: i32, e: i32): u64 => {
  let h = h0;
  let i = a;
  if (i < 0) {
    i = 0;
  }
  while (i >= 0 && i < e && i < src.length) {
    h = (h ^ toU64(src[i])) * cppFnvPrime();
    i++;
  }
  return h;
};

/** A second hash of a unit's hash, so that a multiset is two sums. */
const cppMix = (h: u64): u64 => {
  let x = h ^ (h >> toU64(29));
  x = x * cppMixMul();
  return x ^ (x >> toU64(32));
};

const cppCmpU64 = (a: u64, b: u64): i32 => (a < b ? -1 : a > b ? 1 : 0);

/** Whether bytes [a, e) of `src` are `w`. */
const cppBytesAre = (src: u8[], a: i32, e: i32, w: string): boolean => {
  const n = toI32(w.length);
  let c = 0;
  for (let j = a; j >= 0 && j < e && j < src.length; j++) {
    if (c >= n || toI32(src[j]) !== toI32(w.charCodeAt(c))) {
      return false;
    }
    c++;
  }
  // (Every byte of [a, e) was read, and matched all of `w`.)
  return c === n && a >= 0 && e <= src.length;
};

/** Where a string literal's opening quote is, or -1 for a raw string (or none). */
const cppOpenQuote = (src: u8[], a: i32, e: i32): i32 => {
  for (let i = a; i >= 0 && i < e && i < src.length; i++) {
    const c = toI32(src[i]);
    if (c === 34) {
      return i;
    }
    if (c === 82) {
      // `R"(...)"`: not joined.
      return -1;
    }
  }
  return -1;
};

/** The first token after `t` that is not a comment, or -1. */
const cppNextCode = (d: Doc, t: i32): i32 => {
  const kind = d.kind;
  for (let i = add32(t, 1); i >= 0 && i < d.ntok && i < kind.length; i++) {
    if (kind[i] !== K_COMMENT) {
      return i;
    }
  }
  return -1;
};

/**
 * Whether the `using` at `t` opens a declaration clang-format sorts:
 * `using [typename] [::]a::b;` or with a `,`, as UsingDeclarationsSorter's
 * computeUsingDeclarationLabel reads it. `using namespace`, an alias and
 * `using enum` stay where they are.
 */
const cppSortedUsing = (d: Doc, t: i32): boolean => {
  const kind = d.kind;
  const start = d.start;
  const end = d.end;
  let q = cppNextCode(d, t);
  if (q >= 0 && q < start.length && q < end.length && cppBytesAre(d.src, start[q], end[q], "typename")) {
    q = cppNextCode(d, q);
  }
  if (q >= 0 && q < kind.length && kind[q] === P_COLONCOLON) {
    q = cppNextCode(d, q);
  }
  let named = false;
  // (Identifiers, contextual words among them, as clang-format lexes them.)
  while (q >= 0 && q < kind.length && (kind[q] === K_IDENT || kind[q] >= CW_OVERRIDE)) {
    named = true;
    q = cppNextCode(d, q);
    if (q < 0 || q >= kind.length || kind[q] !== P_COLONCOLON) {
      break;
    }
    q = cppNextCode(d, q);
  }
  return named && q >= 0 && q < kind.length && (kind[q] === P_SEMI || kind[q] === P_COMMA);
};

/** Prints the code of `d`, already lexed, into `p`. */
export const cppCodePrint = (d: Doc, p: CppCodePrint): void => {
  const src = d.src;
  const kind = d.kind;
  const start = d.start;
  const end = d.end;
  const inPP = d.inPP;
  const ppId = d.ppId;
  const ppKind = d.ppKind;
  const ntok = d.ntok;
  if (
    ntok > kind.length ||
    ntok > start.length ||
    ntok > end.length ||
    ntok > inPP.length ||
    ntok > ppId.length ||
    ntok > ppKind.length
  ) {
    fault();
    return;
  }
  let seq = cppFnvOffset();
  let flat = cppFnvOffset();
  let stray = false;
  let unit = cppFnvOffset();
  const incs: u64[] = [];
  let incSum = toU64(0);
  let incMix = toU64(0);
  let useSum = toU64(0);
  let useMix = toU64(0);
  let nInc = 0;
  let nUse = 0;
  let nTok = 0;
  let inInclude = false;
  let inUsing = false;
  let depth = 0;
  // A string literal written without its closing quote, which the next
  // one may continue; `pendPP` is whether it was in a directive.
  let pend = false;
  let pendPP = false;
  let last = -1; // the last token that is not a comment
  for (let t = 0; t < ntok && t < kind.length && t < start.length && t < end.length; t++) {
    const k = kind[t];
    if (k === K_EOF) {
      break;
    }
    if (k === K_COMMENT) {
      continue;
    }
    const pp = t < inPP.length && inPP[t] === 1;
    const opens = pp && t < ppId.length && ppId[t] === t;
    const a = start[t];
    const e = end[t];
    const isStr = k === K_STRING;
    const q = isStr ? cppOpenQuote(src, a, e) : -1;
    const joins = pend && isStr && q >= 0 && pendPP === pp && !opens;
    if (pend && !joins) {
      if (inInclude || inUsing) {
        unit = cppFnvByte(unit, 34);
      } else {
        seq = cppFnvByte(seq, 34);
        flat = cppFnvByte(flat, 34);
      }
      pend = false;
    }
    // An #include ends where its directive does.
    if (inInclude && (!pp || opens)) {
      incs.push(unit);
      inInclude = false;
    }
    if (opens && t < ppKind.length && ppKind[t] === PP_INCLUDE) {
      inInclude = true;
      unit = cppFnvOffset();
    }
    // A using-declaration, which clang-format may move among its neighbours.
    if (!inInclude && !inUsing && !pp && cppBytesAre(src, a, e, "using")) {
      let starts = last < 0;
      if (last >= 0 && last < kind.length && last < inPP.length) {
        const lk = kind[last];
        // (`using` only starts a declaration, but in `[[using ns: a]]` and
        // a `for (using T = U; ...)` init-statement, which stay in place.)
        starts = inPP[last] === 1 || !(lk === P_LSQUARE || lk === P_LPAREN);
      }
      if (starts && cppSortedUsing(d, t)) {
        inUsing = true;
        depth = 0;
        unit = cppFnvOffset();
      }
    }
    // (A string's pieces count once, and the includes and using-declarations
    // count in their sets.)
    if (!joins && !inInclude && !inUsing && nTok < 2147483647) {
      nTok++;
    }
    if (!pp && (k === P_HASH || k === P_HASHHASH)) {
      stray = true;
    }
    let h = inInclude || inUsing ? unit : seq;
    let hf = flat;
    let from = a;
    if (joins) {
      // The continuation of the string before: from after its opening quote.
      from = add32(q, 1);
    } else {
      h = cppFnvByte(h, opens ? 3 : pp ? 2 : 1);
      hf = cppFnvByte(hf, 1);
    }
    let to = e;
    // A literal that ends in its closing quote leaves it for the next to
    // continue (a suffix, `"s"_sv`, ends it here).
    let closes = false;
    if (isStr && q >= 0 && e > 0 && e <= src.length) {
      const z = e - 1;
      closes = z > q && z < src.length && toI32(src[z]) === 34;
      if (closes) {
        to = z;
      }
    }
    if (closes) {
      pend = true;
      pendPP = pp;
    } else if (k === K_CHAR || isStr) {
      pend = false;
    }
    h = cppFnvRange(h, src, from, to);
    if (inInclude || inUsing) {
      unit = h;
    } else {
      seq = h;
      flat = cppFnvRange(hf, src, from, to);
    }
    if (inUsing) {
      if (k === P_LPAREN || k === P_LBRACE || k === P_LSQUARE) {
        if (depth < 2147483647) {
          depth++;
        }
      } else if ((k === P_RPAREN || k === P_RBRACE || k === P_RSQUARE) && depth > 0) {
        depth--;
      } else if (k === P_SEMI && depth === 0) {
        if (pend) {
          unit = cppFnvByte(unit, 34);
          pend = false;
        }
        useSum = useSum + unit;
        useMix = useMix + cppMix(unit);
        if (nUse < 2147483647) {
          nUse++;
        }
        inUsing = false;
      }
    }
    last = t;
  }
  if (pend) {
    if (inInclude || inUsing) {
      unit = cppFnvByte(unit, 34);
    } else {
      seq = cppFnvByte(seq, 34);
      flat = cppFnvByte(flat, 34);
    }
  }
  if (inInclude) {
    incs.push(unit);
  }
  // The includes as a set: sorted, each distinct one once.
  stableSort(incs, cppCmpU64);
  let prevInc = cppFnvOffset();
  for (let i = 0; i < incs.length; i++) {
    const x = incs[i];
    if (i === 0 || x !== prevInc) {
      incSum = incSum + x;
      incMix = incMix + cppMix(x);
      if (nInc < 2147483647) {
        nInc++;
      }
    }
    prevInc = x;
  }
  if (inUsing) {
    // (A statement the file ends inside: in the order it came.)
    seq = cppFnvByte(seq ^ unit, 4);
    flat = cppFnvByte(flat ^ unit, 4);
  }
  p.seq = seq;
  p.flat = flat;
  p.stray = stray;
  p.incSum = incSum;
  p.incMix = incMix;
  p.nInc = nInc;
  p.useSum = useSum;
  p.useMix = useMix;
  p.nUse = nUse;
  p.nTok = nTok;
};
