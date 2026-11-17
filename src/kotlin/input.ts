// ktfmt's Tokenizer and KotlinInput: the toks google-java-format's engine
// consumes, read off the PSI tree. Every leaf is a token, except that a
// comment is a comment tok, a whole string template is one token, and
// whitespace splits into newlines and runs of spaces (tabs are dropped).
//
// Ported from ktfmt's Tokenizer, KotlinInput and KotlinTok (Apache License
// 2.0, Copyright (c) Meta Platforms, Inc. and affiliates).

import {
  GInput,
  TF_BLOCK_COMMENT,
  TF_JAVADOC,
  TF_LINE_COMMENT,
  TF_NEWLINE,
  TF_PARAM_COMMENT,
  TF_SPACES,
  TF_TOKEN,
  TF_TOMB,
} from "../gdoc/input";
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
export const kIsPsiChild = (tr: KTree, c: i32): boolean => tr.leaf[c] === 0 || tr.type[c] === T_DOC_COMMENT;

/** Fills `inp` with the toks of the tree under `root`. */
export const tokenizeKotlin = (inp: GInput, tr: KTree, root: i32, src: u8[], n: i32): void => {
  inp.reset(src, n);
  kVisitTok(inp, tr, root);
  inp.addEof(n, 0);
  inp.buildTokens();
};

const kVisitTok = (inp: GInput, tr: KTree, node: i32): void => {
  const ty = tr.type[node];
  const a = tr.start[node];
  const b = tr.end[node];
  if (kIsComment(ty)) {
    kAddComment(inp, tr, node);
    return;
  }
  if (ty === N_STRING_TEMPLATE) {
    inp.addTok(a, b, kHasTrailingSpace(inp.src, a, b) ? TF_TOKEN | TF_TOMB : TF_TOKEN, ty, 0);
    return;
  }
  if (tr.leaf[node] === 1) {
    if (ty === T_WHITE_SPACE) {
      kAddWhitespace(inp, a, b);
    } else {
      inp.addTok(a, b, TF_TOKEN, ty, 0);
    }
    return;
  }
  for (let c = tr.first[node]; c >= 0; c = tr.next[c]) {
    kVisitTok(inp, tr, c);
  }
};

/** Whether a space ends a line inside the template (WhitespaceTombstones' " ($)"). */
const kHasTrailingSpace = (src: u8[], a: i32, b: i32): boolean => {
  for (let i = a; i + 1 < b; i++) {
    if (toI32(src[i]) === 32 && toI32(src[i + 1]) === 10) {
      return true;
    }
  }
  return false;
};

const kAddComment = (inp: GInput, tr: KTree, node: i32): void => {
  const src = inp.src;
  const a = tr.start[node];
  const b = tr.end[node];
  const c1 = b - a >= 2 ? toI32(src[a + 1]) : 0;
  let f = 0;
  const slash = b - a >= 2 && toI32(src[a]) === 47;
  if (slash && c1 === 47) {
    f = TF_LINE_COMMENT;
  } else if (slash && c1 === 42) {
    f = TF_BLOCK_COMMENT;
    if (b - a >= 3 && toI32(src[a + 2]) === 42 && inp.width(a, b) > 4) {
      f |= TF_JAVADOC;
    }
    if (kIsParamComment(src, a, b)) {
      f |= TF_PARAM_COMMENT;
    }
    // A block comment alone in a lambda's body is a token, so the visitor
    // can place it.
    const p = tr.parent[node];
    if (
      p >= 0 &&
      tr.type[p] === N_BLOCK &&
      tr.parent[p] >= 0 &&
      tr.type[tr.parent[p]] === N_FUNCTION_LITERAL &&
      !kHasPsiChildren(tr, p)
    ) {
      f = TF_TOKEN;
    }
  }
  inp.addTok(a, b, f, tr.type[node], 0);
};

const kHasPsiChildren = (tr: KTree, p: i32): boolean => {
  for (let c = tr.first[p]; c >= 0; c = tr.next[c]) {
    if (kIsPsiChild(tr, c)) {
      return true;
    }
  }
  return false;
};

/** KotlinInput.kIsParamComment: `/\*[A-Za-z0-9\s_\-]+=\s*\*\/`. */
const kIsParamComment = (src: u8[], a: i32, b: i32): boolean => {
  if (b - a < 5 || toI32(src[b - 2]) !== 42 || toI32(src[b - 1]) !== 47) {
    return false;
  }
  let i = a + 2;
  const e = b - 2;
  let names = 0;
  while (i < e) {
    const c = toI32(src[i]);
    if (
      (c >= 65 && c <= 90) ||
      (c >= 97 && c <= 122) ||
      (c >= 48 && c <= 57) ||
      c === 95 ||
      c === 45 ||
      kIsJavaSpace(c)
    ) {
      names++;
      i++;
    } else {
      break;
    }
  }
  // Backtrack: the name class includes whitespace, the `=` must follow it.
  if (names === 0 || i >= e || toI32(src[i]) !== 61) {
    return false;
  }
  i++;
  while (i < e && kIsJavaSpace(toI32(src[i]))) {
    i++;
  }
  return i === e;
};

const kIsJavaSpace = (c: i32): boolean => c === 32 || c === 9 || c === 10 || c === 11 || c === 12 || c === 13;

/** Whitespace split by `\R|( )+`: newlines and space runs become toks, tabs vanish. */
const kAddWhitespace = (inp: GInput, a: i32, b: i32): void => {
  const src = inp.src;
  let i = a;
  while (i < b) {
    const c = toI32(src[i]);
    if (c === 10) {
      inp.addTok(i, i + 1, TF_NEWLINE, T_WHITE_SPACE, 0);
      i++;
    } else if (c === 13) {
      const e = i + 1 < b && toI32(src[i + 1]) === 10 ? i + 2 : i + 1;
      inp.addTok(i, e, TF_NEWLINE, T_WHITE_SPACE, 0);
      i = e;
    } else if (c === 32) {
      let e = i + 1;
      while (e < b && toI32(src[e]) === 32) {
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
