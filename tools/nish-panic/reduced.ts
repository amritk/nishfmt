// The Rust parser's panic, reduced: a failed parse answers -1 and the caller
// indexes a 64-slot array with it before checking the failure
// (RsParser.parseFn -> parseWhereInto in src/rust/parser.ts). Every build
// panics the same way; see NOTES.md.

const rpParseGenerics = (src: string): i32 => {
  // parseGenerics answers fail(), -1, on a bound it cannot parse.
  return src.length > 0 ? -1 : 0;
};

export const main = (): i32 => {
  const a = new Array<i32>(64);
  const g = rpParseGenerics("<T: T!>");
  // parseWhereInto(g): `this.ast.a[g]` with g = -1.
  return a[g];
};
