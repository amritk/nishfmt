// A debugging dump of the Rust AST: one node per line, indented by depth.

import { RsAst } from "./ast";
import { RsTokens } from "./lexer";
import { add32, atI32, bytesText } from "../core/arr";

const rsDumpNode = (ast: RsAst, t: RsTokens, n: i32, depth: i32, out: string[]): void => {
  if (n < 0) {
    return;
  }
  let pad = "";
  for (let i = 0; i < depth; i++) {
    pad = pad + "  ";
  }
  const lo = atI32(ast.lo, n);
  const hi = atI32(ast.hi, n) < lo ? lo : atI32(ast.hi, n);
  let text = bytesText(t.src, lo, hi);
  if (text.length > 40) {
    text = text.substring(0, 40) + "...";
  }
  let clean = "";
  for (let i = 0; i < toI32(text.length); i++) {
    const c = text.charCodeAt(i);
    clean = clean + (c === 10 ? "\\n" : String.fromCharCode(c));
  }
  out.push(
    `${pad}${atI32(ast.kind, n)} [${lo},${hi}) fl=${atI32(ast.fl, n)} x=${atI32(ast.x, n)} d=${atI32(ast.d, n)} ${clean}`,
  );
  for (let i = 0; i < atI32(ast.atn, n); i++) {
    out.push(`${pad}  @attr`);
    rsDumpNode(ast, t, ast.attr(n, i), add32(depth, 2), out);
  }
  const fields = [atI32(ast.a, n), atI32(ast.b, n), atI32(ast.c, n), atI32(ast.e, n)];
  const names = ["a", "b", "c", "e"];
  for (let f = 0; f < fields.length && f < names.length; f++) {
    const fv = fields[f];
    const name = names[f];
    if (atI32(ast.kind, n) !== 4 && fv >= 0 && fv < ast.n) {
      out.push(`${pad}  .${name}`);
      rsDumpNode(ast, t, fv, add32(depth, 2), out);
    }
  }
  for (let i = 0; i < atI32(ast.ln, n); i++) {
    rsDumpNode(ast, t, ast.kid(n, i), add32(depth, 1), out);
  }
};

export const rsDump = (ast: RsAst, t: RsTokens, root: i32): string => {
  const out: string[] = [];
  rsDumpNode(ast, t, root, 0, out);
  return out.join("\n") + "\n";
};
