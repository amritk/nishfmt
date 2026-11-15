// The parser state the Ruby lexer reads: the context flags the grammar sets
// (Parser::Context) and the declared local variables (Parser::StaticEnvironment).
//
// Ported from the parser gem 3.3.13.0 (MIT License, Copyright (c) 2013-2024
// parser contributors).

export class RbContext {
  in_defined: boolean = false;
  in_kwarg: boolean = false;
  in_argdef: boolean = false;
  in_def: boolean = false;
  in_class: boolean = false;
  in_block: boolean = false;
  in_lambda: boolean = false;
  cant_return: boolean = false;

  /** The flags as a bit set (Context#dup, restored with setBits). */
  bits(): i32 {
    return (
      (this.in_defined ? 1 : 0) |
      (this.in_kwarg ? 2 : 0) |
      (this.in_argdef ? 4 : 0) |
      (this.in_def ? 8 : 0) |
      (this.in_class ? 16 : 0) |
      (this.in_block ? 32 : 0) |
      (this.in_lambda ? 64 : 0) |
      (this.cant_return ? 128 : 0)
    );
  }

  setBits(b: i32): void {
    this.in_defined = (b & 1) !== 0;
    this.in_kwarg = (b & 2) !== 0;
    this.in_argdef = (b & 4) !== 0;
    this.in_def = (b & 8) !== 0;
    this.in_class = (b & 16) !== 0;
    this.in_block = (b & 32) !== 0;
    this.in_lambda = (b & 64) !== 0;
    this.cant_return = (b & 128) !== 0;
  }

  reset(): void {
    this.setBits(0);
  }

  /** Context#in_dynamic_block? */
  inDynamicBlock(): boolean {
    return this.in_block || this.in_lambda;
  }
}

// The markers StaticEnvironment keeps among the variable names.
export const SE_FORWARD_ARGS: string = "\u0001FORWARD_ARGS";
export const SE_RESTARG_CURRENT: string = "\u0001RESTARG_IN_CURRENT_SCOPE";
export const SE_RESTARG_INHERITED: string = "\u0001RESTARG_INHERITED";
export const SE_KWRESTARG_CURRENT: string = "\u0001KWRESTARG_IN_CURRENT_SCOPE";
export const SE_KWRESTARG_INHERITED: string = "\u0001KWRESTARG_INHERITED";
export const SE_BLOCKARG_CURRENT: string = "\u0001BLOCKARG_IN_CURRENT_SCOPE";
export const SE_BLOCKARG_INHERITED: string = "\u0001BLOCKARG_INHERITED";

/** StaticEnvironment: the declared local variables of the current scope. */
export class RbStaticEnv {
  vars: string[];
  stack: string[][];

  constructor() {
    this.vars = [];
    this.stack = [];
  }

  reset(): void {
    this.vars = [];
    this.stack = [];
  }

  extendStatic(): void {
    this.stack.push(this.vars);
    this.vars = [];
  }

  extendDynamic(): void {
    this.stack.push(this.vars);
    const next: string[] = [];
    for (const v of this.vars) {
      if (v === SE_BLOCKARG_CURRENT) {
        next.push(SE_BLOCKARG_INHERITED);
      } else if (v === SE_RESTARG_CURRENT) {
        next.push(SE_RESTARG_INHERITED);
      } else if (v === SE_KWRESTARG_CURRENT) {
        next.push(SE_KWRESTARG_INHERITED);
      } else {
        next.push(v);
      }
    }
    this.vars = next;
  }

  unextend(): void {
    const k = toI32(this.stack.length);
    if (k > 0) {
      this.vars = this.stack[k - 1];
      this.stack.pop();
    } else {
      this.vars = [];
    }
  }

  declare(name: string): void {
    if (!this.declared(name)) {
      this.vars.push(name);
    }
  }

  declared(name: string): boolean {
    for (const v of this.vars) {
      if (v === name) {
        return true;
      }
    }
    return false;
  }

  /** Whether an enclosing scope holds `name` (parent_has_anonymous_*). */
  parentHas(name: string): boolean {
    for (const s of this.stack) {
      for (const v of s) {
        if (v === name) {
          return true;
        }
      }
    }
    return false;
  }

  empty(): boolean {
    return this.stack.length === 0;
  }
}
