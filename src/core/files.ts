// Language-neutral file handling: the directory walk with .gitignore names
// and extensions, and line-ending conversion of a formatted buffer.

import { fault } from "./fault";
import { Out } from "./out";

/** Patterns from one .gitignore: plain names, `dir/`, `/name`, `*.ext`. */
export class Ignore {
  names: string[];
  exts: string[];
  constructor() {
    this.names = [];
    this.exts = [];
  }
}

/** Adds one line of a .gitignore to `into`, when it is a pattern the walk reads. */
const ignoreLine = (line: string, into: Ignore): void => {
  let s = line;
  while (s.endsWith(" ") || s.endsWith("\r")) {
    s = s.substring(0, toI32(s.length) - 1);
  }
  if (s.length === 0 || s.startsWith("#") || s.startsWith("!")) {
    return;
  }
  if (s.startsWith("/")) {
    s = s.substring(1);
  }
  if (s.endsWith("/")) {
    s = s.substring(0, toI32(s.length) - 1);
  }
  if (s.startsWith("*.") && s.indexOf("/") < 0) {
    into.exts.push(s.substring(1));
  } else if (s.indexOf("*") < 0 && s.indexOf("/") < 0) {
    into.names.push(s);
  }
};

const readIgnore = (dir: string, into: Ignore): void => {
  const read = readFileSyncOrNull(`${dir}/.gitignore`);
  if (read === null) {
    return;
  }
  const text: string = read;
  let a = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      ignoreLine(text.substring(a, i), into);
      a = i + 1;
    }
  }
  ignoreLine(text.substring(a, toI32(text.length)), into);
};

const ignored = (name: string, ig: Ignore): boolean => {
  for (const x of ig.names) {
    if (x === name) {
      return true;
    }
  }
  for (const e of ig.exts) {
    if (name.endsWith(e)) {
      return true;
    }
  }
  return false;
};

export const walk = (dir: string, out: string[], parent: Ignore, langOf: (name: string) => i32): void => {
  const names = readdirSync(dir);
  if (names === null) {
    return;
  }
  const ig = new Ignore();
  for (const x of parent.names) {
    ig.names.push(x);
  }
  for (const x of parent.exts) {
    ig.exts.push(x);
  }
  readIgnore(dir, ig);
  for (const name of names) {
    if (name.startsWith(".") || ignored(name, ig)) {
      continue;
    }
    const p = `${dir}/${name}`;
    // A source name is pushed without a stat: formatFiles walks it when it
    // turns out to be a directory. Any other name may be a directory, whatever
    // its extension (kotest has a package directory `io.kotest.assertions.json`).
    if (langOf(name) > 0) {
      out.push(p);
    } else if (isDirectorySync(p)) {
      walk(p, out, ig, langOf);
    }
  }
};

/** Writes each line feed of `out` that has no carriage return before it as CRLF. */
export function toCRLF(out: Out): void {
  const n = out.n;
  if (n < 0 || n > out.buf.length) {
    fault();
    return;
  }
  let add = 0;
  for (let i = 0; i < n; i++) {
    const buf = out.buf;
    if (i < buf.length && buf[i] === 10) {
      const p = i - 1;
      if (i === 0 || (p >= 0 && p < buf.length && buf[p] !== 13)) {
        // At most one a byte, so `add <= i < n` and the sum fits.
        if (add < i + 1) {
          add++;
        } else {
          fault();
          return;
        }
      }
    }
  }
  if (add === 0) {
    return;
  }
  const total64 = toI64(n) + toI64(add);
  if (total64 > toI64(2147483647)) {
    fault();
    return;
  }
  const total = toI32(total64);
  out.reserve(add);
  const buf = out.buf;
  // `total >= add >= 1`, so the u32 difference is the true one.
  let j = toI32(toU32(total) - 1);
  for (let i = n - 1; i >= 0; i--) {
    if (i >= buf.length || j < 0 || j >= buf.length) {
      fault();
      return;
    }
    const b = buf[i];
    buf[j] = b;
    j--;
    if (b === 10) {
      const p = i - 1;
      if (i === 0 || (p >= 0 && p < buf.length && buf[p] !== 13)) {
        if (j < 0 || j >= buf.length) {
          fault();
          return;
        }
        buf[j] = 13;
        j--;
      }
    }
  }
  out.n = total;
}

/** Newlines.guessLineSeparator: the first line break in src[0, n), or "\n". */
export const guessSep = (src: u8[], n: i32): string => {
  for (let i = 0; i < n; i++) {
    if (i >= src.length) {
      fault();
      return "\n";
    }
    const c = toI32(src[i]);
    if (c === 13) {
      const p = i + 1;
      if (p < n) {
        if (p >= src.length) {
          fault();
          return "\n";
        }
        return toI32(src[p]) === 10 ? "\r\n" : "\r";
      }
      return "\r";
    }
    if (c === 10) {
      return "\n";
    }
  }
  return "\n";
};
