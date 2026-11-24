// google-java-format's JavaCommentsHelper: how a comment is re-indented for
// the column the layout puts it at. Javadoc goes through the javadoc
// formatter; line comments get a space after `//` and are wrapped at 100
// columns; block comments keep their relative indentation. 2.0.0's
// Markdown (`///`) javadoc never reaches here: the reference treats `///` as
// javadoc only on JDK 23 or newer, and the corpus runs it on JDK 21.
//
// Ported from google-java-format 2.0.0 (Apache License 2.0, Copyright 2015 Google Inc.).

import { GEngine, reformatParameterComment } from "../gdoc/engine";
import { TF_COMMENT, TF_JAVADOC, TF_LINE_COMMENT } from "../gdoc/input";
import {
  indentJavadoc,
  indentLineComments,
  javadocShaped,
  preserveIndentation,
  splitLines,
  trimBoth,
  trimTrailing,
} from "../gdoc/comments";
import { formatJavadoc } from "./javadoc";
import { fault } from "../core/fault";

/** JavaCommentsHelper.rewrite, as the engine's comment rewriter. */
export const rewriteJavaComment = (g: GEngine, tok: i32, maxWidth: i32, column0: i32): string => {
  const inp = g.inp;
  const flags = inp.tFlags;
  if (tok < 0 || tok >= flags.length) {
    fault();
    return "";
  }
  const f = flags[tok];
  let text = inp.text(tok);
  if ((f & TF_COMMENT) === 0) {
    return text;
  }
  if ((f & TF_JAVADOC) !== 0) {
    const j = formatJavadoc(text, column0);
    if (j === null) {
      g.fail("javadoc this port cannot format exactly");
      return text;
    }
    text = j;
  }
  const raw = splitLines(text);
  const lines: string[] = [];
  const slash = (f & TF_LINE_COMMENT) !== 0;
  for (const l of raw) {
    lines.push(slash ? trimBoth(l) : trimTrailing(l));
  }
  if (slash) {
    return indentLineComments(lines, column0);
  }
  const p = reformatParameterComment(inp, tok);
  if (p !== null) {
    return p;
  }
  return javadocShaped(lines) ? indentJavadoc(lines, column0) : preserveIndentation(lines, column0);
};
