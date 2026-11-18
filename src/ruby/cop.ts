// What every cop shares (RuboCop::Cop::Base): its name, the corrector its
// corrections collect in, and add_offense's rules — one offense per range,
// none on lines a rubocop:disable directive covers.
//
// Ported from RuboCop 1.92.3 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { RbRewriter } from "./rewriter";
import { RbSource } from "./source";

export class RbCop {
  name: string;
  rw: RbRewriter;
  seen: Set<i64>;
  // Offense ranges in the order they were added (for cops that read them back).
  offS: i32[];
  offE: i32[];
  src: RbSource | null = null;

  constructor(name: string) {
    this.name = name;
    this.rw = new RbRewriter(0);
    this.seen = new Set<i64>();
    this.offS = [];
    this.offE = [];
  }

  /** begin_investigation. */
  begin(src: RbSource): void {
    this.src = src;
    this.rw = new RbRewriter(src.n);
    this.seen = new Set<i64>();
    this.offS = [];
    this.offE = [];
  }

  /**
   * add_offense: a fresh corrector for this offense's correction, or null
   * when the range already has an offense or the cop is disabled there.
   * The cop fills the corrector and hands it to `commit`.
   */
  offense(s: i32, e: i32): RbRewriter | null {
    const key = (toI64(s) << 32) | toI64(e);
    if (this.seen.has(key)) {
      return null;
    }
    this.seen.add(key);
    this.offS.push(s);
    this.offE.push(e);
    const src = this.src;
    if (src === null) {
      return null;
    }
    if (!src.copEnabledAt(this.name, src.line(s), src.line(e))) {
      return null;
    }
    return new RbRewriter(src.n);
  }

  /** Whether add_offense would record an offense at [s, e) (no correction asked). */
  note(s: i32, e: i32): boolean {
    const key = (toI64(s) << 32) | toI64(e);
    if (this.seen.has(key)) {
      return false;
    }
    this.seen.add(key);
    this.offS.push(s);
    this.offE.push(e);
    return true;
  }

  /** apply_correction: the offense's corrector merged into the cop's (all or nothing). */
  commit(c: RbRewriter): void {
    this.rw.merge(c);
  }
}
