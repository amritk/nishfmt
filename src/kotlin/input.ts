// ktfmt's Tokenizer and KotlinInput: the toks google-java-format's engine
// consumes, read off the PSI tree. Every leaf is a token, except that a
// comment is a comment tok, a whole string template is one token, and
// whitespace splits into newlines and runs of spaces (tabs are dropped).
//
// Ported from ktfmt 0.65's Tokenizer, KotlinInput and KotlinTok (Apache License
// 2.0, Copyright (c) Meta Platforms, Inc. and affiliates).

import {
  GInput,
  TF_BLOCK_COMMENT,
  TF_JAVADOC,
  TF_LINE_COMMENT,
  TF_NEWLINE,
  TF_OTHER_COMMENT,
  TF_PARAM_COMMENT,
  TF_SPACES,
  TF_TOKEN,
  TF_TOMB,
} from "../gdoc/input";
import { atI32 } from "../core/arr";
import { fault } from "../core/fault";
import { KTree } from "./builder";
import {
  N_BLOCK,
  N_FUNCTION_LITERAL,
  N_STRING_TEMPLATE,
  T_BLOCK_COMMENT,
  T_DOC_COMMENT,
  T_EOL_COMMENT,
  T_SHEBANG_COMMENT,
  T_WHITE_SPACE,
} from "./types";

/** Whether a node is a PsiComment. */
export const kIsComment = (t: i32): boolean =>
  t === T_EOL_COMMENT || t === T_BLOCK_COMMENT || t === T_DOC_COMMENT || t === T_SHEBANG_COMMENT;

/** Whether `getChildren()` lists the node: composites, and KDoc (a lazily parsed composite). */
export const kIsPsiChild = (tr: KTree, c: i32): boolean => {
  const leaf = tr.leaf;
  const type = tr.type;
  if (c >= 0 && c < leaf.length && c < type.length) {
    return leaf[c] === 0 || type[c] === T_DOC_COMMENT;
  }
  fault();
  return false;
};

/**
 * Fills `inp` with the toks of the tree under `root`; answers false when a
 * comment opens with `/*` and does not close (Tokenizer's "Unclosed
 * comment", for scripts and files alike).
 */
export const tokenizeKotlin = (inp: GInput, tr: KTree, root: i32, src: u8[], n: i32): boolean => {
  const tn = tr.n;
  const type = tr.type;
  const start = tr.start;
  const end = tr.end;
  for (let i = 0; i < tn; i++) {
    if (i >= type.length || i >= start.length || i >= end.length) {
      fault();
      return false;
    }
    if (kIsComment(type[i]) && kIsUnclosed(src, start[i], end[i])) {
      return false;
    }
  }
  inp.reset(src, n);
  kVisitTok(inp, tr, root);
  inp.addEof(n, 0);
  inp.buildTokens();
  return true;
};

// Whether src[a, b) starts with a slash and a star and does not end with a
// star and a slash.
const kIsUnclosed = (src: u8[], a: i32, b: i32): boolean => {
  // A comment's range lies in the source, which the lexer keeps below 2^30
  // bytes.
  if (a < 0 || a > 1073741823 || b < 0 || b > src.length) {
    fault();
    return false;
  }
  return (
    a + 1 < b &&
    toI32(src[a]) === 47 &&
    toI32(src[a + 1]) === 42 &&
    !(b >= 2 && toI32(src[b - 2]) === 42 && toI32(src[b - 1]) === 47)
  );
};

const kVisitTok = (inp: GInput, tr: KTree, node: i32): void => {
  const types = tr.type;
  const starts = tr.start;
  const ends = tr.end;
  const leafs = tr.leaf;
  const firsts = tr.first;
  if (
    node < 0 ||
    node >= types.length ||
    node >= starts.length ||
    node >= ends.length ||
    node >= leafs.length ||
    node >= firsts.length
  ) {
    fault();
    return;
  }
  const ty = types[node];
  const a = starts[node];
  const b = ends[node];
  const leaf = leafs[node];
  let c = firsts[node];
  if (kIsComment(ty)) {
    kAddComment(inp, tr, node);
    return;
  }
  if (ty === N_STRING_TEMPLATE) {
    inp.addTok(a, b, kHasTrailingSpace(inp.src, a, b) ? TF_TOKEN | TF_TOMB : TF_TOKEN, ty, 0);
    return;
  }
  if (leaf === 1) {
    if (ty === T_WHITE_SPACE) {
      kAddWhitespace(inp, a, b);
    } else {
      inp.addTok(a, b, TF_TOKEN, ty, 0);
    }
    return;
  }
  while (c >= 0) {
    kVisitTok(inp, tr, c);
    const next = tr.next;
    if (c >= next.length) {
      fault();
      return;
    }
    c = next[c];
  }
};

/** Whether a space ends a line inside the template (WhitespaceTombstones' " ($)"). */
const kHasTrailingSpace = (src: u8[], a: i32, b: i32): boolean => {
  // A node's range lies in the source, which the lexer keeps below 2^30 bytes.
  if (a < 0 || a > 1073741823 || b > src.length) {
    fault();
    return false;
  }
  // A space at j - 1 before a newline at j.
  for (let j = a + 1; j < b; j++) {
    if (toI32(src[j]) === 10 && toI32(src[j - 1]) === 32) {
      return true;
    }
  }
  return false;
};

const kAddComment = (inp: GInput, tr: KTree, node: i32): void => {
  const src = inp.src;
  const a = atI32(tr.start, node);
  const b = atI32(tr.end, node);
  // A comment's range lies in the source, which the lexer keeps below 2^30
  // bytes.
  if (a < 0 || a > 1073741823 || b < 0 || b > src.length) {
    fault();
    return;
  }
  const c1 = a + 1 < b ? toI32(src[a + 1]) : 0;
  let f = 0;
  const slash = a + 1 < b && toI32(src[a]) === 47;
  if (slash && c1 === 47) {
    f = TF_LINE_COMMENT;
  } else if (slash && c1 === 42) {
    f = TF_BLOCK_COMMENT;
    if (a + 2 < b && toI32(src[a + 2]) === 42 && inp.width(a, b) > 4) {
      f |= TF_JAVADOC;
    }
    if (kIsParamComment(src, a, b)) {
      f |= TF_PARAM_COMMENT;
    }
    // A block comment alone in a lambda's body is a token, so the visitor
    // can place it.
    const p = atI32(tr.parent, node);
    if (
      p >= 0 &&
      atI32(tr.type, p) === N_BLOCK &&
      atI32(tr.parent, p) >= 0 &&
      atI32(tr.type, atI32(tr.parent, p)) === N_FUNCTION_LITERAL &&
      !kHasPsiChildren(tr, p)
    ) {
      f = TF_TOKEN;
    }
  }
  // KotlinTok.isComment: a shebang is a comment too, so it stays in the output.
  const ty = atI32(tr.type, node);
  if (ty === T_SHEBANG_COMMENT) {
    f = TF_OTHER_COMMENT;
  }
  inp.addTok(a, b, f, ty, 0);
};

const kHasPsiChildren = (tr: KTree, p: i32): boolean => {
  let c = atI32(tr.first, p);
  while (c >= 0) {
    if (kIsPsiChild(tr, c)) {
      return true;
    }
    const next = tr.next;
    if (c >= next.length) {
      fault();
      return false;
    }
    c = next[c];
  }
  return false;
};

/** KotlinInput.kIsParamComment: `/\*[A-Za-z0-9\s_\-]+=\s*\*\/`. */
const kIsParamComment = (src: u8[], a: i32, b: i32): boolean => {
  // A comment's range lies in the source, which the lexer keeps below 2^30
  // bytes.
  if (a < 0 || a > 1073741823 || b < 0 || b > src.length) {
    fault();
    return false;
  }
  if (b - a < 5 || b < 2 || toI32(src[b - 2]) !== 42 || toI32(src[b - 1]) !== 47) {
    return false;
  }
  let i = a + 2;
  const e = b - 2;
  let names = 0;
  while (i >= 0 && i < e && i < src.length) {
    const c = toI32(src[i]);
    if (
      (c >= 65 && c <= 90) ||
      (c >= 97 && c <= 122) ||
      (c >= 48 && c <= 57) ||
      c === 95 ||
      c === 45 ||
      kIsJavaSpace(c)
    ) {
      names = 1;
      i++;
    } else {
      break;
    }
  }
  // Backtrack: the name class includes whitespace, the `=` must follow it.
  if (names === 0 || i < 0 || i >= e || i >= src.length || toI32(src[i]) !== 61) {
    return false;
  }
  i++;
  while (i < e && i < src.length && kIsJavaSpace(toI32(src[i]))) {
    i++;
  }
  return i === e;
};

const kIsJavaSpace = (c: i32): boolean => c === 32 || c === 9 || c === 10 || c === 11 || c === 12 || c === 13;

/** Whitespace split by `\R|( )+`: newlines and space runs become toks, tabs vanish. */
const kAddWhitespace = (inp: GInput, a: i32, b: i32): void => {
  const src = inp.src;
  // A node's range lies in the source.
  if (a < 0 || b > src.length) {
    fault();
    return;
  }
  let i = a;
  while (i < b) {
    // addTok forgets src's length, not the range check above.
    if (i < 0 || i >= src.length) {
      fault();
      return;
    }
    const c = toI32(src[i]);
    if (c === 10) {
      inp.addTok(i, i + 1, TF_NEWLINE, T_WHITE_SPACE, 0);
      i++;
    } else if (c === 13) {
      const e = i + 1 < b && i + 1 < src.length && toI32(src[i + 1]) === 10 ? i + 2 : i + 1;
      inp.addTok(i, e, TF_NEWLINE, T_WHITE_SPACE, 0);
      i = e;
    } else if (c === 32) {
      let e = i + 1;
      while (e < b && e < src.length && toI32(src[e]) === 32) {
        e++;
      }
      inp.addTok(i, e, TF_SPACES, T_WHITE_SPACE, 0);
      i = e;
    } else if (c === 11 || c === 12) {
      inp.addTok(i, i + 1, 0, T_WHITE_SPACE, 0);
      i++;
    } else {
      i++;
    }
  }
};
