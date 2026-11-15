// Language-neutral file handling: the directory walk with .gitignore names
// and extensions, and line-ending conversion of a formatted buffer.

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

const readIgnore = (dir: string, into: Ignore): void => {
  const text = readFileSyncOrNull(`${dir}/.gitignore`);
  if (text === null) {
    return;
  }
  let a = 0;
  const n = toI32(text.length);
  for (let i = 0; i <= n; i++) {
    if (i === n || text.charCodeAt(i) === 10) {
      let s = text.substring(a, i);
      a = i + 1;
      while (s.endsWith(" ") || s.endsWith("\r")) {
        s = s.substring(0, toI32(s.length) - 1);
      }
      if (s.length === 0 || s.startsWith("#") || s.startsWith("!")) {
        continue;
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
    }
  }
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
    if (langOf(name) > 0) {
      out.push(p);
    } else if (name.indexOf(".") < 0 || !name.endsWith(".json")) {
      if (isDirectorySync(p)) {
        walk(p, out, ig, langOf);
      }
    }
  }
};


/** Writes each line feed of `out` that has no carriage return before it as CRLF. */
export function toCRLF(out: Out): void {
  let add = 0;
  for (let i = 0; i < out.n; i++) {
    if (out.buf[i] === 10 && (i === 0 || out.buf[i - 1] !== 13)) {
      add++;
    }
  }
  if (add === 0) {
    return;
  }
  const n = out.n;
  out.reserve(add);
  let j = n + add - 1;
  for (let i = n - 1; i >= 0; i--) {
    const b = out.buf[i];
    out.buf[j] = b;
    j--;
    if (b === 10 && (i === 0 || out.buf[i - 1] !== 13)) {
      out.buf[j] = 13;
      j--;
    }
  }
  out.n = n + add;
}

/** Newlines.guessLineSeparator: the first line break in src[0, n), or "\n". */
export const guessSep = (src: u8[], n: i32): string => {
  for (let i = 0; i < n; i++) {
    const c = toI32(src[i]);
    if (c === 13) {
      return i + 1 < n && toI32(src[i + 1]) === 10 ? "\r\n" : "\r";
    }
    if (c === 10) {
      return "\n";
    }
  }
  return "\n";
};
