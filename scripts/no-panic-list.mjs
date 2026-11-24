// Keeps package.json's `nish.noPanic` equal to every module under src/ but
// src/main.ts, the one module that may keep a panic site: the std calls no
// proof removes (a region, writeBytes, an array's slice for a file write, an
// append that exits on failure) and the worker-crash test hook.
//
//   node scripts/no-panic-list.mjs          check, exit 1 when the list is stale
//   node scripts/no-panic-list.mjs --write  rewrite the list
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const OUTSIDE = new Set(["src/main.ts"]);

const modules = [];
const walk = (dir) => {
  for (const name of readdirSync(join(root, dir)).sort()) {
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) {
      walk(rel);
    } else if (name.endsWith(".ts") && !OUTSIDE.has(rel)) {
      modules.push(rel);
    }
  }
};
walk("src");
modules.sort();

const path = join(root, "package.json");
const pkg = JSON.parse(readFileSync(path, "utf8"));
const have = JSON.stringify(pkg.nish?.noPanic ?? []);
const want = JSON.stringify(modules);
if (process.argv.includes("--write")) {
  pkg.nish = { ...(pkg.nish ?? {}), noPanic: modules };
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`package.json: noPanic lists ${modules.length} modules`);
} else if (have !== want) {
  const listed = new Set(pkg.nish?.noPanic ?? []);
  for (const m of modules) {
    if (!listed.has(m)) console.error(`missing from nish.noPanic: ${m}`);
  }
  for (const m of listed) {
    if (!modules.includes(m)) console.error(`in nish.noPanic but not a module: ${m}`);
  }
  console.error("run: node scripts/no-panic-list.mjs --write");
  process.exit(1);
} else {
  console.log(`nish.noPanic lists all ${modules.length} modules but src/main.ts`);
}
