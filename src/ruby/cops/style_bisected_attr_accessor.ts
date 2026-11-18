// Style/BisectedAttrAccessor.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { NT_BEGIN, NT_CLASS, NT_DEF, NT_MODULE, NT_SCLASS, NT_SEND, V_NIL } from "../ast";
import { RbCop } from "../cop";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";
import { rmlSpaces } from "./layout_multiline_help";
import { sbhMethodName } from "./style_body_help";
import { ssxWholeLinesE, ssxWholeLinesS } from "./style_syntax_help";

/** BisectedAttrAccessor::Macro. */
class SbhBaMacro {
  node: i32;
  // attrs: source => node (Hash#to_h: the first key position, the last value).
  names: string[];
  nodes: i32[];
  bisection: i32[];
  visibility: string;

  constructor(src: RbSource, node: i32) {
    this.node = node;
    this.names = [];
    this.nodes = [];
    this.bisection = [];
    for (let i = 2; i < src.a.nKid(node); i++) {
      const at = src.a.kid(node, i);
      const s = src.nodeSrc(at);
      let found = -1;
      for (let j = 0; j < toI32(this.names.length); j++) {
        if (this.names[j] === s) {
          found = j;
        }
      }
      if (found >= 0) {
        this.nodes[found] = at;
      } else {
        this.names.push(s);
        this.nodes.push(at);
      }
    }
    // node_visibility (a send): the last visibility block among the left siblings, else public.
    this.visibility = "public";
    const p = src.parent(node);
    if (p !== V_NIL) {
      let vis = "";
      for (let i = 0; i < src.a.nKid(p); i++) {
        const c = src.a.kid(p, i);
        if (c === node) {
          break;
        }
        if (src.a.isNode(c) && src.a.type(c) === NT_SEND && src.a.kid(c, 0) === V_NIL && src.a.nKid(c) === 2) {
          const m = sbhMethodName(src, c);
          if (m === "private" || m === "protected" || m === "public") {
            vis = m;
          }
        }
      }
      if (vis.length > 0) {
        this.visibility = vis;
      }
    }
  }

  reader(src: RbSource): boolean {
    const m = sbhMethodName(src, this.node);
    return m === "attr_reader" || m === "attr";
  }

  writer(src: RbSource): boolean {
    return sbhMethodName(src, this.node) === "attr_writer";
  }

  bisectedNames(src: RbSource): string[] {
    const out: string[] = [];
    for (const b of this.bisection) {
      out.push(src.nodeSrc(b));
    }
    return out;
  }

  /** attr_names - bisected_names. */
  rest(src: RbSource): string[] {
    const bn = this.bisectedNames(src);
    const out: string[] = [];
    for (const n of this.names) {
      let inB = false;
      for (const b of bn) {
        if (b === n) {
          inB = true;
        }
      }
      if (!inB) {
        out.push(n);
      }
    }
    return out;
  }
}

/** Style/BisectedAttrAccessor. */
export class CopStyleBisectedAttrAccessor {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/BisectedAttrAccessor");
  }

  run(src: RbSource): void {
    this.c.begin(src);
    const a = src.a;
    const classes: i32[] = [];
    const rewrite: SbhBaMacro[][] = [];
    for (const n of src.pre) {
      const t = a.type(n);
      if (t !== NT_CLASS && t !== NT_SCLASS && t !== NT_MODULE) {
        continue;
      }
      classes.push(n);
      const set: SbhBaMacro[] = [];
      rewrite.push(set);
      // find_macros
      const body = a.kid(n, -1);
      if (body === V_NIL || !a.isNode(body) || a.type(body) === NT_DEF) {
        continue;
      }
      const sends: i32[] = [];
      if (a.type(body) === NT_SEND) {
        sends.push(body);
      } else {
        for (let i = 0; i < a.nKid(body); i++) {
          const c = a.kid(body, i);
          if (a.isNode(c) && a.type(c) === NT_SEND) {
            sends.push(c);
          }
        }
      }
      const vis: string[] = [];
      const groups: SbhBaMacro[][] = [];
      for (const s of sends) {
        const m = sbhMethodName(src, s);
        if (m !== "attr_reader" && m !== "attr_writer" && m !== "attr") {
          continue;
        }
        const mac = new SbhBaMacro(src, s);
        let g = -1;
        for (let j = 0; j < toI32(vis.length); j++) {
          if (vis[j] === mac.visibility) {
            g = j;
          }
        }
        if (g < 0) {
          vis.push(mac.visibility);
          const fresh: SbhBaMacro[] = [];
          groups.push(fresh);
          g = toI32(vis.length) - 1;
        }
        groups[g].push(mac);
      }
      for (const macros of groups) {
        // find_bisection: reader names & writer names
        const rn: string[] = [];
        const wn: string[] = [];
        for (const m of macros) {
          for (const x of m.names) {
            if (m.reader(src)) {
              rn.push(x);
            } else {
              wn.push(x);
            }
          }
        }
        const bis: string[] = [];
        for (const x of rn) {
          let inW = false;
          for (const y of wn) {
            if (y === x) {
              inW = true;
            }
          }
          let dup = false;
          for (const y of bis) {
            if (y === x) {
              dup = true;
            }
          }
          if (inW && !dup) {
            bis.push(x);
          }
        }
        if (bis.length === 0) {
          continue;
        }
        for (const m of macros) {
          // bisect: attrs.slice(*names).values, in the order of the names.
          const sel: i32[] = [];
          for (const x of bis) {
            for (let j = 0; j < toI32(m.names.length); j++) {
              if (m.names[j] === x) {
                sel.push(m.nodes[j]);
              }
            }
          }
          m.bisection = sel;
          if (sel.length === 0) {
            continue;
          }
          set.push(m);
          for (const at of sel) {
            this.c.note(a.exS(at), a.exE(at));
          }
        }
      }
    }
    // after_class, in post-order (inner classes end first).
    const order: i32[] = [];
    for (let i = 0; i < toI32(classes.length); i++) {
      order.push(i);
    }
    for (let i = 1; i < toI32(order.length); i++) {
      let j = i;
      while (j > 0 && a.exE(classes[order[j - 1]]) > a.exE(classes[order[j]])) {
        const tmp = order[j - 1];
        order[j - 1] = order[j];
        order[j] = tmp;
        j--;
      }
    }
    for (const ci of order) {
      for (const m of rewrite[ci]) {
        const node = m.node;
        const rs = ssxWholeLinesS(src, a.exS(node));
        const re = ssxWholeLinesE(src, a.exE(node), true);
        const k = new RbRewriter(src.n);
        const ind = rmlSpaces(src.column(a.exS(node)));
        const rest = m.rest(src);
        if (m.writer(src)) {
          if (rest.length === 0) {
            k.remove(rs, re);
          } else {
            k.replace(a.exS(node), a.exE(node), `attr_writer ${rest.join(", ")}`);
          }
        } else {
          const acc = `attr_accessor ${m.bisectedNames(src).join(", ")}\n`;
          if (rest.length === 0) {
            k.replace(rs, re, `${ind}${acc}`);
          } else {
            k.insertBefore(a.exS(node), a.exE(node), acc);
            k.replace(a.exS(node), a.exE(node), `${ind}attr_reader ${rest.join(", ")}`);
          }
        }
        this.c.commit(k);
      }
    }
  }
}
