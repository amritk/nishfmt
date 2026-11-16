// A debugging dump of the Rust AST: one node per line, indented by depth.

import { RsAst } from "./ast";
import { RsTokens } from "./lexer";

const dumpNode = (ast: RsAst, t: RsTokens, n: i32, depth: i32, out: string[]): void => {
  if (n < 0) {
    return;
  }
  let pad = "";
  for (let i = 0; i < depth; i++) {
    pad = pad + "  ";
  }
  const lo = ast.lo[n];
  const hi = ast.hi[n] < lo ? lo : ast.hi[n];
  let text = String.fromBytes(t.src, lo, hi);
  if (text.length > 40) {
    text = text.substring(0, 40) + "...";
  }
  let clean = "";
  for (let i = 0; i < toI32(text.length); i++) {
    const c = text.charCodeAt(i);
    clean = clean + (c === 10 ? "\\n" : String.fromCharCode(c));
  }
  out.push(`${pad}${ast.kind[n]} [${lo},${hi}) fl=${ast.fl[n]} x=${ast.x[n]} d=${ast.d[n]} ${clean}`);
  for (let i = 0; i < ast.atn[n]; i++) {
    out.push(`${pad}  @attr`);
    dumpNode(ast, t, ast.attr(n, i), depth + 2, out);
  }
  const fields = [ast.a[n], ast.b[n], ast.c[n], ast.e[n]];
  const names = ["a", "b", "c", "e"];
  for (let f = 0; f < 4; f++) {
    if (ast.kind[n] !== 4 && fields[f] >= 0 && fields[f] < ast.n) {
      out.push(`${pad}  .${names[f]}`);
      dumpNode(ast, t, fields[f], depth + 2, out);
    }
  }
  for (let i = 0; i < ast.ln[n]; i++) {
    dumpNode(ast, t, ast.kid(n, i), depth + 1, out);
  }
};

export const rsDump = (ast: RsAst, t: RsTokens, root: i32): string => {
  const out: string[] = [];
  dumpNode(ast, t, root, 0, out);
  return out.join("\n") + "\n";
};
