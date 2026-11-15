// ktfmt's KDocCommentsHelper: how a comment is re-indented for the column
// the layout puts it at. KDoc goes through the KDoc formatter first; the
// rest is the re-indentation google-java-format does, without its
// parameter-comment rewrite.
//
// Ported from ktfmt's KDocCommentsHelper (Apache License 2.0, Copyright (c)
// Meta Platforms, Inc. and affiliates).

import { indentJavadoc, indentLineComments, javadocShaped, preserveIndentation, splitLines, trimTrailing } from "../gdoc/comments";
import { GEngine } from "../gdoc/engine";
import { TF_COMMENT, TF_JAVADOC, TF_LINE_COMMENT } from "../gdoc/input";
import { formatKDoc } from "./kdoc";

/** KDocCommentsHelper.rewrite, as the engine's comment rewriter. */
export const rewriteKotlinComment = (g: GEngine, tok: i32, maxWidth: i32, column0: i32): string => {
  const inp = g.inp;
  const f = inp.tFlags[tok];
  let text = inp.text(tok);
  if ((f & TF_COMMENT) === 0) {
    return text;
  }
  if ((f & TF_JAVADOC) !== 0) {
    text = formatKDoc(text, column0, maxWidth);
  }
  const raw = splitLines(text);
  const lines: string[] = [];
  for (const l of raw) {
    lines.push(trimTrailing(l));
  }
  if ((f & TF_LINE_COMMENT) !== 0) {
    return indentLineComments(lines, column0);
  }
  return javadocShaped(lines) ? indentJavadoc(lines, column0) : preserveIndentation(lines, column0);
};
