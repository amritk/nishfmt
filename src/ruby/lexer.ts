// The Ruby lexer of the parser gem 3.3.13.0, as RuboCop runs it for Ruby
// 3.3: the Ragel state machines of lexer.rl and lexer-strings.rl (their
// tables in tables.ts, their actions translated here), Lexer::Literal and
// Lexer::StackState. Positions are code point offsets, as the gem's.
//
// Ported from the parser gem 3.3.13.0 (MIT License, Copyright (c) 2013-2024
// parser contributors). The action bodies were translated mechanically from
// the generated lib/parser/lexer-F1.rb and lexer-strings.rb, then by hand.

import { add32, mul32, sub32 } from "../core/arr";
import { fault } from "../core/fault";
import { RbContext, RbStaticEnv } from "./env";
import {
  RL_LEX_EN_EXPR_ARG,
  RL_LEX_EN_EXPR_CMDARG,
  RL_LEX_EN_EXPR_END,
  RL_LEX_EN_EXPR_LABELARG,
  RL_LEX_EN_EXPR_VALUE,
  RL_LEX_EN_INSIDE_STRING,
  RL_LEX_EN_LINE_BEGIN,
  RL_LEX_EOF_TRANS,
  RL_LEX_EOF_TRANS_D,
  RL_LEX_ERROR,
  RL_LEX_FROM_STATE_ACTIONS,
  RL_LEX_FROM_STATE_ACTIONS_D,
  RL_LEX_INDEX_OFFSETS,
  RL_LEX_INDEX_OFFSETS_D,
  RL_LEX_INDICIES,
  RL_LEX_INDICIES_D,
  RL_LEX_KEY_SPANS,
  RL_LEX_KEY_SPANS_D,
  RL_LEX_TO_STATE_ACTIONS,
  RL_LEX_TO_STATE_ACTIONS_D,
  RL_LEX_TRANS_ACTIONS,
  RL_LEX_TRANS_ACTIONS_D,
  RL_LEX_TRANS_KEYS,
  RL_LEX_TRANS_KEYS_D,
  RL_LEX_TRANS_TARGS,
  RL_LEX_TRANS_TARGS_D,
  RS_LEX_ACTIONS,
  RS_LEX_ACTIONS_D,
  RS_LEX_EN_CHARACTER,
  RS_LEX_EN_INTERP_BACKSLASH_DELIMITED,
  RS_LEX_EN_INTERP_BACKSLASH_DELIMITED_WORDS,
  RS_LEX_EN_INTERP_STRING,
  RS_LEX_EN_INTERP_WORDS,
  RS_LEX_EN_PLAIN_BACKSLASH_DELIMITED,
  RS_LEX_EN_PLAIN_BACKSLASH_DELIMITED_WORDS,
  RS_LEX_EN_PLAIN_STRING,
  RS_LEX_EN_PLAIN_WORDS,
  RS_LEX_EN_REGEXP_MODIFIERS,
  RS_LEX_EN_UNKNOWN,
  RS_LEX_EOF_TRANS,
  RS_LEX_EOF_TRANS_D,
  RS_LEX_FROM_STATE_ACTIONS,
  RS_LEX_FROM_STATE_ACTIONS_D,
  RS_LEX_INDEX_OFFSETS,
  RS_LEX_INDEX_OFFSETS_D,
  RS_LEX_INDICIES,
  RS_LEX_INDICIES_D,
  RS_LEX_KEY_SPANS,
  RS_LEX_KEY_SPANS_D,
  RS_LEX_TO_STATE_ACTIONS,
  RS_LEX_TO_STATE_ACTIONS_D,
  RS_LEX_TRANS_ACTIONS,
  RS_LEX_TRANS_ACTIONS_D,
  RS_LEX_TRANS_KEYS,
  RS_LEX_TRANS_KEYS_D,
  RS_LEX_TRANS_TARGS,
  RS_LEX_TRANS_TARGS_D,
  TK_kALIAS,
  TK_kAND,
  TK_kBEGIN,
  TK_kBREAK,
  TK_kCASE,
  TK_kCLASS,
  TK_kDEF,
  TK_kDEFINED,
  TK_kDO,
  TK_kDO_BLOCK,
  TK_kDO_COND,
  TK_kDO_LAMBDA,
  TK_kELSE,
  TK_kELSIF,
  TK_kEND,
  TK_kENSURE,
  TK_kFALSE,
  TK_kFOR,
  TK_kIF,
  TK_kIF_MOD,
  TK_kIN,
  TK_kMODULE,
  TK_kNEXT,
  TK_kNIL,
  TK_kNOT,
  TK_kOR,
  TK_kREDO,
  TK_kRESCUE,
  TK_kRESCUE_MOD,
  TK_kRETRY,
  TK_kRETURN,
  TK_kSELF,
  TK_kSUPER,
  TK_kTHEN,
  TK_kTRUE,
  TK_kUNDEF,
  TK_kUNLESS,
  TK_kUNLESS_MOD,
  TK_kUNTIL,
  TK_kUNTIL_MOD,
  TK_kWHEN,
  TK_kWHILE,
  TK_kWHILE_MOD,
  TK_kYIELD,
  TK_k__ENCODING__,
  TK_k__FILE__,
  TK_k__LINE__,
  TK_klBEGIN,
  TK_klEND,
  TK_tAMPER,
  TK_tAMPER2,
  TK_tANDDOT,
  TK_tANDOP,
  TK_tAREF,
  TK_tASET,
  TK_tASSOC,
  TK_tBACK_REF,
  TK_tBACK_REF2,
  TK_tBANG,
  TK_tBDOT2,
  TK_tBDOT3,
  TK_tCARET,
  TK_tCHARACTER,
  TK_tCMP,
  TK_tCOLON,
  TK_tCOLON2,
  TK_tCOLON3,
  TK_tCOMMA,
  TK_tCONSTANT,
  TK_tCVAR,
  TK_tDIVIDE,
  TK_tDOT,
  TK_tDOT2,
  TK_tDOT3,
  TK_tDSTAR,
  TK_tEH,
  TK_tEQ,
  TK_tEQL,
  TK_tEQQ,
  TK_tFID,
  TK_tFLOAT,
  TK_tGEQ,
  TK_tGT,
  TK_tGVAR,
  TK_tIDENTIFIER,
  TK_tIMAGINARY,
  TK_tINTEGER,
  TK_tIVAR,
  TK_tLABEL,
  TK_tLABEL_END,
  TK_tLAMBDA,
  TK_tLAMBEG,
  TK_tLBRACE,
  TK_tLBRACE_ARG,
  TK_tLBRACK,
  TK_tLBRACK2,
  TK_tLCURLY,
  TK_tLEQ,
  TK_tLPAREN,
  TK_tLPAREN2,
  TK_tLPAREN_ARG,
  TK_tLSHFT,
  TK_tLT,
  TK_tMATCH,
  TK_tMINUS,
  TK_tNEQ,
  TK_tNL,
  TK_tNMATCH,
  TK_tNTH_REF,
  TK_tOP_ASGN,
  TK_tOROP,
  TK_tPERCENT,
  TK_tPIPE,
  TK_tPLUS,
  TK_tPOW,
  TK_tQSYMBOLS_BEG,
  TK_tQWORDS_BEG,
  TK_tRATIONAL,
  TK_tRBRACK,
  TK_tRCURLY,
  TK_tREGEXP_BEG,
  TK_tREGEXP_OPT,
  TK_tRPAREN,
  TK_tRSHFT,
  TK_tSEMI,
  TK_tSPACE,
  TK_tSTAR,
  TK_tSTAR2,
  TK_tSTRING,
  TK_tSTRING_BEG,
  TK_tSTRING_CONTENT,
  TK_tSTRING_DBEG,
  TK_tSTRING_DEND,
  TK_tSTRING_DVAR,
  TK_tSTRING_END,
  TK_tSYMBEG,
  TK_tSYMBOL,
  TK_tSYMBOLS_BEG,
  TK_tTILDE,
  TK_tUMINUS,
  TK_tUNARY_NUM,
  TK_tUPLUS,
  TK_tWORDS_BEG,
  TK_tXSTRING_BEG,
  rbAt,
  rbTablesInit,
} from "./tables";

// Numeric suffix transformations (@num_xfrm).
const XF_integer: i32 = 1;
const XF_rational: i32 = 2;
const XF_imaginary: i32 = 3;
const XF_imaginary_rational: i32 = 4;
const XF_integer_re: i32 = 5;
const XF_integer_if: i32 = 6;
const XF_integer_rescue: i32 = 7;
const XF_float: i32 = 8;
const XF_imaginary_float: i32 = 9;
const XF_float_if: i32 = 10;
const XF_float_rescue: i32 = 11;

// The machines' positions are code point offsets in [-1, pe], pe the source
// length plus 2. The machines take at most 10^9 code points (a longer source
// faults), so a position and its small offsets stay far inside i32, and a
// position read back from a field passes through rbPos, whose range the
// compiler then knows.

/** A position the machines read back: ts, te, tm and the like. */
type RbPos = integer<0, 1073741823>;

/** A fault, and a position past the end of every source, where the machine loops stop. */
const rbPastEnd = (): RbPos => {
  fault();
  return 1073741823;
};

/**
 * `x`, a position a machine reads back, which its actions have set from a
 * position at least 0. Anything else faults and answers 2^30 - 1, past the end
 * of every source, where the machine loops stop.
 */
const rbPos = (x: i32): RbPos => {
  if (x >= 0 && x <= 1073741823) {
    return x;
  }
  return rbPastEnd();
};

/**
 * A machine's position between transitions, [0, pe]. The compiler forgets
 * what it knows of a local at a switch, but not a range type's bounds, so each
 * action case starts with `p = pc`.
 */
type RbAt = integer<0, 1000000002>;

/** `t[i]` of a machine table, or -1 after a fault when `i` is outside it (every entry is at least 0). */
const rbTab = (t: Int32Array, i: i32): i32 => {
  if (i >= 0 && i < t.length) {
    return t[i];
  }
  fault();
  return -1;
};

// Every entry of the machine tables is in [0, 131071] (tables.ts), so the
// masks below keep each entry as it is: they bound the sums for the compiler.

/**
 * The transition a Ragel machine takes from state `cs` on code point `wide`
 * (_trans), or -1 after a fault when an index leaves its table.
 */
const rbTransOf = (
  keys: Int32Array,
  spans: Int32Array,
  offsets: Int32Array,
  indicies: Int32Array,
  cs: i32,
  wide: i32,
): i32 => {
  if (cs < 0 || cs > 1000000 || cs >= spans.length || cs >= offsets.length) {
    fault();
    return -1;
  }
  const slen = spans[cs] & 0x1ffff;
  const inds = offsets[cs] & 0x1ffff;
  let at = inds + slen;
  if (slen > 0) {
    const k = cs + cs;
    if (k >= keys.length) {
      fault();
      return -1;
    }
    const lo = keys[k] & 0x1ffff;
    const k1 = k + 1;
    if (k1 >= keys.length) {
      fault();
      return -1;
    }
    // A code point between two keys is in [0, 131071] too.
    if (wide >= 0 && wide <= 131071) {
      if (lo <= wide && wide <= keys[k1]) {
        at = inds + wide - lo;
      }
    }
  }
  if (at >= 0 && at < indicies.length) {
    return indicies[at];
  }
  fault();
  return -1;
};

/** Whether the action list a state table gives state `cs` holds `action`. */
const rbStateAction = (actions: Int32Array, t: Int32Array, cs: i32, action: i32): boolean => {
  if (cs < 0 || cs >= t.length) {
    fault();
    return false;
  }
  const a = t[cs] & 0x1ffff;
  if (a >= actions.length) {
    fault();
    return false;
  }
  const n = actions[a] & 0x1ffff;
  for (let j = 1; j <= n; j++) {
    const i = a + j;
    if (i >= actions.length) {
      fault();
      return false;
    }
    if (actions[i] === action) {
      return true;
    }
  }
  return false;
};

/** Lexer::StackState: a stack of bits. */
export class RbStackState {
  bits: i32[];
  n: i32 = 0;

  constructor() {
    this.bits = [];
  }

  clear(): void {
    this.n = 0;
  }

  push(bit: boolean): boolean {
    const bits = this.bits;
    const n = this.n;
    if (n >= 0 && n < bits.length) {
      bits[n] = bit ? 1 : 0;
      this.n = n + 1;
    } else if (n === bits.length) {
      bits.push(bit ? 1 : 0);
      this.n = toI32(bits.length);
    } else {
      fault();
    }
    return bit;
  }

  pop(): boolean {
    const bits = this.bits;
    const n = this.n;
    if (n <= 0) {
      if (n < 0) {
        fault();
      }
      return false;
    }
    const i = n - 1;
    if (i >= bits.length) {
      fault();
      return false;
    }
    this.n = i;
    return bits[i] === 1;
  }

  /** (stack >> 1) | (stack & 1): the popped bit is or-ed into the new top. */
  lexpop(): boolean {
    const bits = this.bits;
    const n = this.n;
    if (n <= 0) {
      if (n < 0) {
        fault();
      }
      return false;
    }
    const i = n - 1;
    if (i >= bits.length) {
      fault();
      return false;
    }
    const low = bits[i];
    this.n = i;
    if (i === 0) {
      if (low === 1) {
        this.push(true);
        return true;
      }
      return false;
    }
    const top = i - 1;
    bits[top] = bits[top] | low;
    return bits[top] === 1;
  }

  active(): boolean {
    const bits = this.bits;
    const n = this.n;
    if (n > 0) {
      const i = n - 1;
      if (i < bits.length) {
        return bits[i] === 1;
      }
      fault();
    }
    return false;
  }

  empty(): boolean {
    const bits = this.bits;
    const n = this.n;
    for (let i = 0; i < n && i < bits.length; i++) {
      if (bits[i] === 1) {
        return false;
      }
    }
    if (n > bits.length) {
      fault();
    }
    return true;
  }
}

/** UTF-8 of the code points pts[s, e). */
export const rbText = (pts: i32[], s: i32, e: i32): string => {
  const parts: string[] = [];
  const a = s < 0 ? 0 : s;
  const b = e > toI32(pts.length) ? toI32(pts.length) : e;
  for (let i = a; i >= 0 && i < b && i < pts.length; i++) {
    const c = pts[i];
    // An ASCII code point is its own byte (`& 0xff` as toU8 truncates).
    parts.push(c < 0x80 ? String.fromCharCode(c & 0xff) : rbChr(c));
  }
  return parts.join("");
};

/** The UTF-8 encoding of one code point; each byte as toU8 truncates it. */
export const rbChr = (c: i32): string => {
  if (c < 0x80) {
    return String.fromCharCode(c);
  }
  if (c < 0x800) {
    return String.fromCharCode((0xc0 | (c >> 6)) & 0xff) + String.fromCharCode(0x80 | (c & 0x3f));
  }
  if (c < 0x10000) {
    return (
      String.fromCharCode((0xe0 | (c >> 12)) & 0xff) +
      String.fromCharCode(0x80 | ((c >> 6) & 0x3f)) +
      String.fromCharCode(0x80 | (c & 0x3f))
    );
  }
  return (
    String.fromCharCode((0xf0 | (c >> 18)) & 0xff) +
    String.fromCharCode(0x80 | ((c >> 12) & 0x3f)) +
    String.fromCharCode(0x80 | ((c >> 6) & 0x3f)) +
    String.fromCharCode(0x80 | (c & 0x3f))
  );
};

/** One byte as a (possibly invalid UTF-8) string: Integer#chr. */
const rbByteChr = (c: i32): string => String.fromCharCode(c & 0xff);

/** Lexer::Literal: one string, symbol, regexp, word list or heredoc being lexed. */
export class RbLiteral {
  lexer: RbLexer;
  nesting: i32 = 1;
  str_type: string = "";
  str_s: i32 = 0;
  start_tok: i32 = 0;
  interpolate_: boolean = false;
  start_delim: string = "";
  hasStartDelim: boolean = false;
  end_delim: string = "";
  heredoc_e: i32 = -1;
  indent: boolean = false;
  label_allowed: boolean = false;
  dedent_body: boolean = false;
  dedent_level: i32 = -1;
  interp_braces: i32 = 0;
  space_emitted: boolean = true;
  monolithic: boolean = false;
  buffer: string = "";
  buffer_s: i32 = -1;
  buffer_e: i32 = -1;
  saved_herebody_s: i32 = -1;

  constructor(
    lexer: RbLexer,
    strType: string,
    delimiter: string,
    strS: i32,
    heredocE: i32,
    indent: boolean,
    dedentBody: boolean,
    labelAllowed: boolean,
  ) {
    this.lexer = lexer;
    const tt = rbLiteralType(strType);
    if (tt < 0) {
      lexer.diagError();
    }
    this.str_type = strType;
    this.str_s = strS;
    this.start_tok = tt < 0 ? TK_tSTRING_BEG : tt >> 1;
    this.interpolate_ = (tt & 1) === 1;
    const close = rbCloseDelim(delimiter);
    this.hasStartDelim = close !== "";
    this.start_delim = this.hasStartDelim ? delimiter : "";
    this.end_delim = this.hasStartDelim ? close : delimiter;
    this.heredoc_e = heredocE;
    this.indent = indent;
    this.label_allowed = labelAllowed;
    this.dedent_body = dedentBody;
    this.monolithic = this.start_tok === TK_tSTRING_BEG && (strType === "'" || strType === '"') && !this.heredoc();
    if (this.str_type.startsWith("%")) {
      this.str_type = this.str_type + delimiter;
    }
    this.clearBuffer();
    if (!this.monolithic) {
      this.emitStartTok();
    }
  }

  interpolate(): boolean {
    return this.interpolate_;
  }

  words(): boolean {
    const t = this.start_tok;
    return t === TK_tWORDS_BEG || t === TK_tQWORDS_BEG || t === TK_tSYMBOLS_BEG || t === TK_tQSYMBOLS_BEG;
  }

  regexp(): boolean {
    return this.start_tok === TK_tREGEXP_BEG;
  }

  heredoc(): boolean {
    return this.heredoc_e >= 0;
  }

  plain_heredoc(): boolean {
    return this.heredoc() && !this.dedent_body;
  }

  squiggly_heredoc(): boolean {
    return this.heredoc() && this.dedent_body;
  }

  backslash_delimited(): boolean {
    return this.end_delim === "\\";
  }

  type(): i32 {
    return this.start_tok;
  }

  munge_escape(character: string): boolean {
    if (
      this.words() &&
      (character === " " ||
        character === "\t" ||
        character === "\u000b" ||
        character === "\r" ||
        character === "\u000c" ||
        character === "\n")
    ) {
      return true;
    }
    return character === "\\" || (this.hasStartDelim && character === this.start_delim) || character === this.end_delim;
  }

  /** Answers the type of the token emitted, or -1. */
  nest_and_try_closing(delimiter: string, ts: i32, te: i32, lookahead: string = ""): i32 {
    if (this.hasStartDelim && this.start_delim === delimiter) {
      this.nesting = add32(this.nesting, 1);
    } else if (this.isDelimiter(delimiter)) {
      this.nesting = sub32(this.nesting, 1);
    }
    if (this.nesting === 0) {
      if (this.words()) {
        this.extend_space(ts, ts);
      }
      if (
        lookahead.length > 0 &&
        this.label_allowed &&
        lookahead.charCodeAt(0) === 58 &&
        !(lookahead.length > 1 && lookahead.charCodeAt(1) === 58) &&
        this.start_tok === TK_tSTRING_BEG
      ) {
        this.flush_string();
        this.lexer.emit4(TK_tLABEL_END, this.end_delim, ts, add32(te, 1));
        return TK_tLABEL_END;
      } else if (this.monolithic) {
        this.lexer.emit4(TK_tSTRING, this.buffer, this.str_s, te);
        return TK_tSTRING;
      } else {
        if (!this.heredoc()) {
          this.flush_string();
        }
        this.lexer.emit4(TK_tSTRING_END, this.end_delim, ts, te);
        return TK_tSTRING_END;
      }
    }
    return -1;
  }

  infer_indent_level(line: string): void {
    if (!this.dedent_body) {
      return;
    }
    let level = 0;
    for (let i = 0; i < toI32(line.length); i++) {
      // At most 8 columns a byte: a line this long faults (a level past 2^30).
      if (level < 0 || level > 1073741823) {
        fault();
        return;
      }
      const c = line.charCodeAt(i);
      if (c === 32) {
        level++;
      } else if (c === 9) {
        level += 8 - (level % 8);
      } else {
        if (this.dedent_level < 0 || this.dedent_level > level) {
          this.dedent_level = level;
        }
        break;
      }
    }
  }

  start_interp_brace(): void {
    this.interp_braces = add32(this.interp_braces, 1);
  }

  end_interp_brace_and_try_closing(): boolean {
    this.interp_braces = sub32(this.interp_braces, 1);
    return this.interp_braces === 0;
  }

  extend_string(s: string, ts: i32, te: i32): void {
    if (this.buffer_s < 0) {
      this.buffer_s = ts;
    }
    this.buffer_e = te;
    this.buffer = this.buffer + s;
  }

  flush_string(): void {
    if (this.monolithic) {
      this.emitStartTok();
      this.monolithic = false;
    }
    if (this.buffer.length > 0) {
      this.lexer.emit4(TK_tSTRING_CONTENT, this.buffer, this.buffer_s, this.buffer_e);
      this.clearBuffer();
      this.extend_content();
    }
  }

  extend_content(): void {
    this.space_emitted = false;
  }

  extend_space(ts: i32, te: i32): void {
    this.flush_string();
    if (!this.space_emitted) {
      this.lexer.emit4(TK_tSPACE, "", ts, te);
      this.space_emitted = true;
    }
  }

  supports_line_continuation_via_slash(): boolean {
    return !this.words() && this.interpolate_;
  }

  private isDelimiter(d: string): boolean {
    if (this.heredoc()) {
      if (!d.endsWith(this.end_delim)) {
        return false;
      }
      const k = toI32(d.length) - toI32(this.end_delim.length);
      // Prism (which RuboCop parses with) closes a plain <<X heredoc only at column 0.
      if (k > 0 && !this.indent) {
        return false;
      }
      // k <= d.length, so the second test never ends the loop early.
      for (let i = 0; i < k && i < d.length; i++) {
        const c = d.charCodeAt(i);
        if (c !== 32 && c !== 9) {
          return false;
        }
      }
      return true;
    }
    if (this.indent) {
      return this.end_delim === rbLstrip(d);
    }
    return this.end_delim === d;
  }

  private clearBuffer(): void {
    this.buffer = "";
    this.buffer_s = -1;
    this.buffer_e = -1;
  }

  private emitStartTok(): void {
    const strE = this.heredoc_e >= 0 ? this.heredoc_e : add32(this.str_s, rbLen(this.str_type));
    this.lexer.emit4(this.start_tok, this.str_type, this.str_s, strE);
  }
}

/** Code points in a UTF-8 string. */
const rbLen = (s: string): i32 => {
  let n = 0;
  for (let i = 0; i < toI32(s.length); i++) {
    const c = s.charCodeAt(i);
    // n <= i < s.length, so the second test always holds.
    if ((c < 0x80 || c >= 0xc0) && n < s.length) {
      n++;
    }
  }
  return n;
};

/** String#lstrip (ASCII whitespace and NUL). */
const rbLstrip = (s: string): string => {
  let i = 0;
  while (i < toI32(s.length)) {
    const c = s.charCodeAt(i);
    if (c === 32 || (c >= 9 && c <= 13) || c === 0) {
      i++;
    } else {
      break;
    }
  }
  return s.substring(i, toI32(s.length));
};

/** Literal::TYPES: (token << 1) | interpolate, or -1. */
const rbLiteralType = (t: string): i32 => {
  if (t === "'" || t === "<<'" || t === "%q") {
    return TK_tSTRING_BEG << 1;
  }
  if (t === '"' || t === '<<"' || t === "%" || t === "%Q") {
    return (TK_tSTRING_BEG << 1) | 1;
  }
  if (t === "%w") {
    return TK_tQWORDS_BEG << 1;
  }
  if (t === "%W") {
    return (TK_tWORDS_BEG << 1) | 1;
  }
  if (t === "%i") {
    return TK_tQSYMBOLS_BEG << 1;
  }
  if (t === "%I") {
    return (TK_tSYMBOLS_BEG << 1) | 1;
  }
  if (t === ":'" || t === "%s") {
    return TK_tSYMBEG << 1;
  }
  if (t === ':"') {
    return (TK_tSYMBEG << 1) | 1;
  }
  if (t === "/" || t === "%r") {
    return (TK_tREGEXP_BEG << 1) | 1;
  }
  if (t === "%x" || t === "`" || t === "<<`") {
    return (TK_tXSTRING_BEG << 1) | 1;
  }
  return -1;
};

/** Literal::DELIMITERS: the closing bracket, or "" for a symmetric delimiter. */
const rbCloseDelim = (d: string): string => {
  if (d === "(") {
    return ")";
  }
  if (d === "[") {
    return "]";
  }
  if (d === "{") {
    return "}";
  }
  if (d === "<") {
    return ">";
  }
  return "";
};

/** Parser::LexerStrings: the machines for the inside of literals. */
export class RbStrings {
  lexer: RbLexer;
  pts: i32[];
  cs: i32 = 0;
  ts: i32 = -1;
  te: i32 = -1;
  act: i32 = 0;
  literals: RbLiteral[];
  escape_s: i32 = -1;
  escape: string = "";
  hasEscape: boolean = false;
  herebody_s: i32 = -1;
  dedent_level_: i32 = -1;
  rootState: i32 = 0;
  newline_s: i32 = -1;

  constructor(lexer: RbLexer) {
    this.lexer = lexer;
    this.pts = lexer.source_pts;
    this.literals = [];
    this.cs = RS_LEX_EN_UNKNOWN;
  }

  readCharacterConstant(p: i32): RbPos {
    this.cs = RS_LEX_EN_CHARACTER;
    return this.advance(p);
  }

  pushLiteral(strType: string, delimiter: string, strS: i32): void {
    this.pushLiteralFull(strType, delimiter, strS, -1, false, false, false);
  }

  pushLiteralFull(
    strType: string,
    delimiter: string,
    strS: i32,
    heredocE: i32,
    indent: boolean,
    dedentBody: boolean,
    labelAllowed: boolean = false,
  ): void {
    const lit = new RbLiteral(this.lexer, strType, delimiter, strS, heredocE, indent, dedentBody, labelAllowed);
    this.literals.push(lit);
    this.cs = this.nextStateFor(lit);
  }

  nextStateFor(l: RbLiteral): i32 {
    if (l.words() && l.backslash_delimited()) {
      return l.interpolate() ? RS_LEX_EN_INTERP_BACKSLASH_DELIMITED_WORDS : RS_LEX_EN_PLAIN_BACKSLASH_DELIMITED_WORDS;
    }
    if (l.words()) {
      return l.interpolate() ? RS_LEX_EN_INTERP_WORDS : RS_LEX_EN_PLAIN_WORDS;
    }
    if (l.backslash_delimited()) {
      return l.interpolate() ? RS_LEX_EN_INTERP_BACKSLASH_DELIMITED : RS_LEX_EN_PLAIN_BACKSLASH_DELIMITED;
    }
    return l.interpolate() ? RS_LEX_EN_INTERP_STRING : RS_LEX_EN_PLAIN_STRING;
  }

  continue_lexing(l: RbLiteral): void {
    this.cs = this.nextStateFor(l);
  }

  literal(): RbLiteral | null {
    const n = toI32(this.literals.length);
    return n > 0 ? this.literals[n - 1] : null;
  }

  /** The current literal (the machines only run inside one). */
  lit(): RbLiteral {
    const lits = this.literals;
    const n = toI32(lits.length);
    if (n > 0) {
      return lits[n - 1];
    }
    fault();
    return new RbLiteral(this.lexer, "'", "'", 0, -1, false, false, false);
  }

  /** pop_literal: answers the next state of this machine, or -1 for none. */
  pop_literal(): i32 {
    if (this.literals.length === 0) {
      return -1;
    }
    const old = this.lit();
    const lits = this.literals;
    if (lits.length > 0) {
      lits.pop();
    }
    this.dedent_level_ = old.dedent_level;
    if (old.type() === TK_tREGEXP_BEG) {
      this.rootState = RL_LEX_EN_INSIDE_STRING;
      return RS_LEX_EN_REGEXP_MODIFIERS;
    }
    this.rootState = RL_LEX_EN_EXPR_END;
    return -1;
  }

  closeInterp(p: i32): boolean {
    const l = this.literal();
    if (l !== null && l.end_interp_brace_and_try_closing()) {
      this.lexer.emit4(TK_tSTRING_DEND, "}", sub32(p, 1), p);
      if (l.saved_herebody_s >= 0) {
        this.herebody_s = l.saved_herebody_s;
      }
      this.continue_lexing(l);
      return true;
    }
    return false;
  }

  dedentLevel(): i32 {
    const d = this.dedent_level_;
    this.dedent_level_ = -1;
    return d;
  }

  on_newline(p: i32): RbPos {
    const hs = this.herebody_s;
    if (hs >= 0) {
      this.herebody_s = -1;
      return rbPos(hs);
    }
    return rbPos(p);
  }

  eof_codepoint(point: i32): boolean {
    return point === 0x04 || point === 0x1a || point === 0x00;
  }

  tok2(s: i32, e: i32): string {
    return this.lexer.textOf(s, e);
  }

  emit_invalid_escapes(): boolean {
    const l = this.literal();
    return l === null || !l.regexp();
  }

  extend_string_escaped(): void {
    const l = this.lit();
    const escaped = this.tok2(this.escape_s, rbPos(this.escape_s) + 1);
    if (l.munge_escape(escaped)) {
      if (l.regexp() && rbIsRegexpMeta(escaped)) {
        l.extend_string(this.tok2(this.ts, this.te), this.ts, this.te);
      } else {
        l.extend_string(escaped, this.ts, this.te);
      }
    } else if (l.squiggly_heredoc() && escaped === "\n") {
      l.extend_string(this.tok2(this.ts, this.te), this.ts, this.te);
    } else if (l.supports_line_continuation_via_slash() && escaped === "\n") {
      l.extend_string(rbRemoveBackslashNewlines(this.tok2(this.ts, this.te)), this.ts, this.te);
    } else if (l.regexp() && (escaped === "c" || escaped === "C" || escaped === "m" || escaped === "M")) {
      l.extend_string(this.escape, this.ts, this.te);
    } else if (l.regexp()) {
      l.extend_string(rbRemoveBackslashNewlines(this.tok2(this.ts, this.te)), this.ts, this.te);
    } else {
      l.extend_string(this.hasEscape ? this.escape : this.tok2(this.ts, this.te), this.ts, this.te);
    }
  }

  extend_interp_code(l: RbLiteral): void {
    l.flush_string();
    l.extend_content();
    this.lexer.emit4(TK_tSTRING_DBEG, "#{", this.ts, this.te);
    if (l.heredoc()) {
      l.saved_herebody_s = this.herebody_s;
      this.herebody_s = -1;
    }
    l.start_interp_brace();
    this.lexer.command_start = true;
  }

  extend_interp_digit_var(): void {
    this.lit().extend_string(this.tok2(this.ts, this.te), this.ts, this.te);
  }

  extend_string_eol_check_eof(l: RbLiteral, pe: i32): void {
    if (this.te === pe) {
      this.lexer.diagError();
      this.lexer.fatal = true;
    }
    if (l.str_s < 0) {
      this.lexer.diagError();
    }
  }

  /** The heredoc line, without carriage returns before its end. */
  extend_string_eol_heredoc_line(): string {
    let line = this.tok2(this.herebody_s, this.ts);
    let k = toI32(line.length);
    while (k > 0 && line.charCodeAt(k - 1) === 13) {
      k--;
    }
    if (k < toI32(line.length)) {
      line = line.substring(0, k);
    }
    return line;
  }

  extend_string_eol_heredoc_intertwined(p: i32): RbPos {
    const hs = this.herebody_s;
    if (hs >= 0) {
      this.herebody_s = -1;
      return rbPos(hs - 1);
    }
    return rbPos(p);
  }

  extend_string_eol_words(l: RbLiteral, p: i32): void {
    const pts = this.pts;
    if (p < 0) {
      fault();
      return;
    }
    const c = p < pts.length ? pts[p] : 0;
    if (l.words() && !this.eof_codepoint(c)) {
      l.extend_space(this.ts, this.te);
    } else {
      l.extend_string(this.tok2(this.ts, this.te), this.ts, this.te);
      l.flush_string();
    }
  }

  extend_string_slice_end(lookahead: string): string {
    if (!this.lexer.cond.active()) {
      return this.tok2(this.te, rbPos(this.te) + 2);
    }
    return lookahead;
  }

  extend_string_for_token_range(l: RbLiteral, s: string): void {
    l.extend_string(s, this.ts, this.te);
  }

  unescape_char(p: i32): void {
    const pts = this.pts;
    if (p < 1 || p > pts.length) {
      fault();
      return;
    }
    const cp = pts[p - 1];
    if (cp === 117 || cp === 85) {
      this.lexer.diagError();
      this.lexer.fatal = true;
    }
    const e = rbEscapeOf(cp);
    if (e.length > 0) {
      this.escape = e;
    } else {
      this.escape = this.tok2(p - 1, p);
    }
    this.hasEscape = true;
  }

  unicode_points(p: i32): void {
    this.escape = "";
    this.hasEscape = true;
    // ([0-9a-fA-F]+)|([ \t]+) over the code points between the braces.
    const pts = this.pts;
    let i = rbPos(this.escape_s) + 2;
    const e = rbPos(p) - 1;
    if (e > pts.length) {
      fault();
      return;
    }
    while (i >= 0 && i < e && i < pts.length) {
      const c = pts[i];
      if (c === 32 || c === 9) {
        i++;
        continue;
      }
      let v = 0;
      const s = i;
      while (i >= 0 && i < e && i < pts.length) {
        const d = rbHexDigit(pts[i]);
        if (d < 0) {
          break;
        }
        // v is never negative: past 0x10ffff it stays 0x110000.
        if (v >= 0 && v <= 0x10ffff) {
          // v < 2^21 and d < 16: v * 16 + d.
          v = (v << 4) | d;
          if (v > 0x10ffff) {
            v = 0x110000;
          }
        } else {
          v = 0x110000;
        }
        i++;
      }
      if (i === s) {
        i = s + 1;
        continue;
      }
      if (v >= 0x110000 || (v & -2048) === 0xd800) {
        this.lexer.diagError();
        break;
      }
      this.escape = this.escape + rbChr(v);
    }
  }

  read_post_meta_or_ctrl_char(p: i32): void {
    const pts = this.pts;
    if (p < 1 || p > pts.length) {
      fault();
      return;
    }
    const o = pts[p - 1];
    this.escape = this.tok2(p - 1, p);
    this.hasEscape = true;
    if ((o >= 0 && o <= 8) || (o >= 14 && o <= 31)) {
      this.lexer.diagError();
      this.lexer.fatal = true;
    }
  }

  extend_interp_var(l: RbLiteral): i32 {
    l.flush_string();
    l.extend_content();
    this.lexer.emit4(TK_tSTRING_DVAR, "", this.ts, rbPos(this.ts) + 1);
    return this.ts;
  }

  emit_interp_var(kind: i32): void {
    if (kind === 1) {
      this.lexer.emit_class_var(rbPos(this.ts) + 1, this.te);
    } else if (kind === 2) {
      this.lexer.emit_instance_var(rbPos(this.ts) + 1, this.te);
    } else if (kind === 3) {
      this.lexer.emit_global_var(rbPos(this.ts) + 1, this.te);
    }
  }

  encode_escaped_char(p: i32): void {
    this.escape = rbByteChr(rbParseInt(this.tok2(sub32(p, 2), p), 16));
    this.hasEscape = true;
  }

  slash_c_char(): void {
    const e = this.escape;
    if (e.length > 0) {
      this.escape = rbByteChr(e.charCodeAt(0) & 0x9f);
      this.hasEscape = true;
    } else {
      fault();
    }
  }

  slash_m_char(): void {
    const e = this.escape;
    if (e.length > 0) {
      this.escape = rbByteChr(e.charCodeAt(0) | 0x80);
      this.hasEscape = true;
    } else {
      fault();
    }
  }

  emit_character_constant(): void {
    const v = this.hasEscape ? this.escape : this.tok2(rbPos(this.ts) + 1, this.te);
    this.lexer.emit4(TK_tCHARACTER, v, this.ts, this.te);
  }

  check_invalid_escapes(p: i32): void {
    if (this.emit_invalid_escapes()) {
      this.lexer.diagError();
      this.lexer.fatal = true;
    }
    if (p < 0) {
      this.lexer.diagError();
    }
  }

  /** The machine; answers the new position, with rootState the lexer's next state. */
  advance(p0: i32): RbPos {
    let p = p0;
    const pts = this.pts;
    const n = toI32(pts.length);
    if (n > 1000000000) {
      return rbPastEnd();
    }
    const pe = n + 2;
    const eof = pe;
    let q: RbPos = 0;
    let current_literal: RbLiteral =
      this.literals.length > 0 ? this.lit() : new RbLiteral(this.lexer, "'", "'", 0, -1, false, false, false);
    let string = "";
    let lookahead = "";
    let token = -1;
    let line = "";
    let interp_var_kind = 0;
    let unknown_options = false;
    let state = -1;
    let _trans = 0;
    let _wide = 0;
    let _trigger_goto = false;
    let _goto_level = 0;
    const _resume = 10;
    const _eof_trans = 15;
    const _again = 20;
    const _test_eof = 30;
    const _out = 40;
    while (true) {
      _trigger_goto = false;
      if (_goto_level >= _out) {
        break;
      }
      if (_goto_level <= 0) {
        if (p === pe) {
          _goto_level = _test_eof;
          continue;
        }
        if (this.cs === 0) {
          _goto_level = _out;
          continue;
        }
      }
      if (_goto_level <= _resume) {
        // A transition starts at p in [0, pe]: an action leaves p at least -1, and _again adds 1.
        if (p < 0 || p > pe) {
          return rbPastEnd();
        }
        if (rbStateAction(RS_LEX_ACTIONS_D, RS_LEX_FROM_STATE_ACTIONS_D, this.cs, 24)) {
          this.ts = p;
        }
        _wide = 0;
        if (p < pts.length) {
          _wide = pts[p];
        }
        _trans = rbTransOf(
          RS_LEX_TRANS_KEYS_D,
          RS_LEX_KEY_SPANS_D,
          RS_LEX_INDEX_OFFSETS_D,
          RS_LEX_INDICIES_D,
          this.cs,
          _wide,
        );
      }
      if (_goto_level <= _eof_trans) {
        const target = rbTab(RS_LEX_TRANS_TARGS_D, _trans);
        const actsAt = rbTab(RS_LEX_TRANS_ACTIONS_D, _trans);
        if (target < 0 || actsAt < 0) {
          return rbPastEnd();
        }
        this.cs = target;
        if (actsAt !== 0) {
          const acts = actsAt & 0x1ffff;
          const nactsAt = rbTab(RS_LEX_ACTIONS_D, acts);
          if (nactsAt < 0) {
            return rbPastEnd();
          }
          const nacts = nactsAt & 0x1ffff;
          actsLoop: for (let j = 0; j < nacts; j++) {
            if (p < 0 || p > pe) {
              return rbPastEnd();
            }
            const pc: RbAt = p;
            switch (rbTab(RS_LEX_ACTIONS_D, acts + 1 + j)) {
              case 0: {
                p = pc;
                this.newline_s = p;
                break;
              }
              case 1: {
                p = pc;
                this.unicode_points(p);
                break;
              }
              case 2: {
                p = pc;
                this.unescape_char(p);
                break;
              }
              case 3: {
                this.lexer.diagFatal();
                break;
              }
              case 4: {
                p = pc;
                this.read_post_meta_or_ctrl_char(p);
                break;
              }
              case 5: {
                this.slash_c_char();
                break;
              }
              case 6: {
                this.slash_m_char();
                break;
              }
              case 7: {
                p = pc;
                this.encode_escaped_char(p);
                break;
              }
              case 8: {
                this.escape = "\x7f";
                this.hasEscape = true;
                break;
              }
              case 9: {
                p = pc;
                this.encode_escaped_char(p);
                break;
              }
              case 10: {
                p = pc;
                this.escape = rbByteChr(rbParseInt(this.tok2(this.escape_s, p), 8) % 256);
                this.hasEscape = true;
                break;
              }
              case 11: {
                p = pc;
                this.escape = rbByteChr(rbParseInt(this.tok2(rbPos(this.escape_s) + 1, p), 16));
                this.hasEscape = true;
                break;
              }
              case 12: {
                this.lexer.diagFatal();
                break;
              }
              case 13: {
                p = pc;
                this.escape = rbChr(rbParseInt(this.tok2(rbPos(this.escape_s) + 1, p), 16));
                this.hasEscape = true;
                break;
              }
              case 14: {
                p = pc;
                this.check_invalid_escapes(p);
                break;
              }
              case 15: {
                p = pc;
                this.check_invalid_escapes(p);
                break;
              }
              case 16: {
                this.lexer.diagFatal();
                break;
              }
              case 17: {
                this.lexer.diagFatal();
                break;
              }
              case 18: {
                p = pc;
                this.escape_s = p;
                this.hasEscape = false;
                break;
              }
              case 19: {
                interp_var_kind = 3;
                break;
              }
              case 20: {
                interp_var_kind = 1;
                break;
              }
              case 21: {
                interp_var_kind = 2;
                break;
              }
              case 22: {
                this.hasEscape = false;
                break;
              }
              case 25: {
                p = pc;
                this.te = p + 1;
                break;
              }
              case 26: {
                p = pc;
                this.te = p + 1;
                current_literal = this.lit();
                this.extend_interp_code(current_literal);
                this.rootState = RL_LEX_EN_EXPR_VALUE;
                p += 1;
                _trigger_goto = true;
                _goto_level = _out;
                break actsLoop;
              }
              case 27: {
                p = pc;
                this.te = p + 1;
                current_literal = this.lit();
                this.extend_string_eol_check_eof(current_literal, pe);
                if (current_literal.heredoc()) {
                  line = this.extend_string_eol_heredoc_line();
                  if (current_literal.nest_and_try_closing(line, this.herebody_s, this.ts) >= 0) {
                    this.herebody_s = this.te;
                    q = rbPos(current_literal.heredoc_e);
                    p = q - 1;
                    this.cs = this.pop_literal();
                    p += 1;
                    _trigger_goto = true;
                    _goto_level = _out;
                    break actsLoop;
                  } else {
                    current_literal.infer_indent_level(line);
                    this.herebody_s = this.te;
                  }
                } else {
                  if (current_literal.nest_and_try_closing(this.tok2(this.ts, this.te), this.ts, this.te) >= 0) {
                    this.cs = this.pop_literal();
                    p += 1;
                    _trigger_goto = true;
                    _goto_level = _out;
                    break actsLoop;
                  }
                  q = this.extend_string_eol_heredoc_intertwined(p);
                  p = q;
                }
                this.extend_string_eol_words(current_literal, p);
                break;
              }
              case 28: {
                p = pc;
                this.te = p + 1;
                string = this.tok2(this.ts, this.te);
                lookahead = this.extend_string_slice_end(lookahead);
                current_literal = this.lit();
                token = -1;
                if (!current_literal.heredoc()) {
                  token = current_literal.nest_and_try_closing(string, this.ts, this.te, lookahead);
                }
                if (token >= 0) {
                  if (token === TK_tLABEL_END) {
                    // The p += 1 past the colon, and the p += 1 of every fbreak.
                    p += 2;
                    this.pop_literal();
                    this.rootState = RL_LEX_EN_EXPR_LABELARG;
                  } else {
                    p += 1;
                    state = this.pop_literal();
                    if (state >= 0) {
                      this.cs = state;
                    }
                  }
                  _trigger_goto = true;
                  _goto_level = _out;
                  break actsLoop;
                } else {
                  this.extend_string_for_token_range(current_literal, string);
                }
                break;
              }
              case 29: {
                p = pc;
                this.te = p;
                p = p - 1;
                this.extend_interp_digit_var();
                break;
              }
              case 30: {
                p = pc;
                this.te = p;
                p = p - 1;
                current_literal = this.lit();
                this.extend_interp_var(current_literal);
                this.emit_interp_var(interp_var_kind);
                break;
              }
              case 31: {
                p = pc;
                this.te = p;
                p = p - 1;
                this.extend_string_escaped();
                break;
              }
              case 32: {
                p = pc;
                this.te = p;
                p = p - 1;
                this.lit().extend_space(this.ts, this.te);
                break;
              }
              case 33: {
                p = pc;
                this.te = p;
                p = p - 1;
                string = this.tok2(this.ts, this.te);
                lookahead = this.extend_string_slice_end(lookahead);
                current_literal = this.lit();
                token = -1;
                if (!current_literal.heredoc()) {
                  token = current_literal.nest_and_try_closing(string, this.ts, this.te, lookahead);
                }
                if (token >= 0) {
                  if (token === TK_tLABEL_END) {
                    // The p += 1 past the colon, and the p += 1 of every fbreak.
                    p += 2;
                    this.pop_literal();
                    this.rootState = RL_LEX_EN_EXPR_LABELARG;
                  } else {
                    p += 1;
                    state = this.pop_literal();
                    if (state >= 0) {
                      this.cs = state;
                    }
                  }
                  _trigger_goto = true;
                  _goto_level = _out;
                  break actsLoop;
                } else {
                  this.extend_string_for_token_range(current_literal, string);
                }
                break;
              }
              case 34: {
                q = rbPos(this.te);
                p = q - 1;
                this.extend_string_escaped();
                break;
              }
              case 35: {
                q = rbPos(this.te);
                p = q - 1;
                string = this.tok2(this.ts, this.te);
                lookahead = this.extend_string_slice_end(lookahead);
                current_literal = this.lit();
                token = -1;
                if (!current_literal.heredoc()) {
                  token = current_literal.nest_and_try_closing(string, this.ts, this.te, lookahead);
                }
                if (token >= 0) {
                  if (token === TK_tLABEL_END) {
                    // The p += 1 past the colon, and the p += 1 of every fbreak.
                    p += 2;
                    this.pop_literal();
                    this.rootState = RL_LEX_EN_EXPR_LABELARG;
                  } else {
                    p += 1;
                    state = this.pop_literal();
                    if (state >= 0) {
                      this.cs = state;
                    }
                  }
                  _trigger_goto = true;
                  _goto_level = _out;
                  break actsLoop;
                } else {
                  this.extend_string_for_token_range(current_literal, string);
                }
                break;
              }
              case 36: {
                p = pc;
                this.te = p + 1;
                current_literal = this.lit();
                this.extend_interp_code(current_literal);
                this.rootState = RL_LEX_EN_EXPR_VALUE;
                p += 1;
                _trigger_goto = true;
                _goto_level = _out;
                break actsLoop;
              }
              case 37: {
                p = pc;
                this.te = p + 1;
                current_literal = this.lit();
                this.extend_string_eol_check_eof(current_literal, pe);
                if (current_literal.heredoc()) {
                  line = this.extend_string_eol_heredoc_line();
                  if (current_literal.nest_and_try_closing(line, this.herebody_s, this.ts) >= 0) {
                    this.herebody_s = this.te;
                    q = rbPos(current_literal.heredoc_e);
                    p = q - 1;
                    this.cs = this.pop_literal();
                    p += 1;
                    _trigger_goto = true;
                    _goto_level = _out;
                    break actsLoop;
                  } else {
                    current_literal.infer_indent_level(line);
                    this.herebody_s = this.te;
                  }
                } else {
                  if (current_literal.nest_and_try_closing(this.tok2(this.ts, this.te), this.ts, this.te) >= 0) {
                    this.cs = this.pop_literal();
                    p += 1;
                    _trigger_goto = true;
                    _goto_level = _out;
                    break actsLoop;
                  }
                  q = this.extend_string_eol_heredoc_intertwined(p);
                  p = q;
                }
                this.extend_string_eol_words(current_literal, p);
                break;
              }
              case 38: {
                p = pc;
                this.te = p + 1;
                string = this.tok2(this.ts, this.te);
                lookahead = this.extend_string_slice_end(lookahead);
                current_literal = this.lit();
                token = -1;
                if (!current_literal.heredoc()) {
                  token = current_literal.nest_and_try_closing(string, this.ts, this.te, lookahead);
                }
                if (token >= 0) {
                  if (token === TK_tLABEL_END) {
                    // The p += 1 past the colon, and the p += 1 of every fbreak.
                    p += 2;
                    this.pop_literal();
                    this.rootState = RL_LEX_EN_EXPR_LABELARG;
                  } else {
                    p += 1;
                    state = this.pop_literal();
                    if (state >= 0) {
                      this.cs = state;
                    }
                  }
                  _trigger_goto = true;
                  _goto_level = _out;
                  break actsLoop;
                } else {
                  this.extend_string_for_token_range(current_literal, string);
                }
                break;
              }
              case 39: {
                p = pc;
                this.te = p;
                p = p - 1;
                this.extend_interp_digit_var();
                break;
              }
              case 40: {
                p = pc;
                this.te = p;
                p = p - 1;
                current_literal = this.lit();
                this.extend_interp_var(current_literal);
                this.emit_interp_var(interp_var_kind);
                break;
              }
              case 41: {
                p = pc;
                this.te = p;
                p = p - 1;
                this.extend_string_escaped();
                break;
              }
              case 42: {
                p = pc;
                this.te = p;
                p = p - 1;
                string = this.tok2(this.ts, this.te);
                lookahead = this.extend_string_slice_end(lookahead);
                current_literal = this.lit();
                token = -1;
                if (!current_literal.heredoc()) {
                  token = current_literal.nest_and_try_closing(string, this.ts, this.te, lookahead);
                }
                if (token >= 0) {
                  if (token === TK_tLABEL_END) {
                    // The p += 1 past the colon, and the p += 1 of every fbreak.
                    p += 2;
                    this.pop_literal();
                    this.rootState = RL_LEX_EN_EXPR_LABELARG;
                  } else {
                    p += 1;
                    state = this.pop_literal();
                    if (state >= 0) {
                      this.cs = state;
                    }
                  }
                  _trigger_goto = true;
                  _goto_level = _out;
                  break actsLoop;
                } else {
                  this.extend_string_for_token_range(current_literal, string);
                }
                break;
              }
              case 43: {
                q = rbPos(this.te);
                p = q - 1;
                this.extend_string_escaped();
                break;
              }
              case 44: {
                q = rbPos(this.te);
                p = q - 1;
                string = this.tok2(this.ts, this.te);
                lookahead = this.extend_string_slice_end(lookahead);
                current_literal = this.lit();
                token = -1;
                if (!current_literal.heredoc()) {
                  token = current_literal.nest_and_try_closing(string, this.ts, this.te, lookahead);
                }
                if (token >= 0) {
                  if (token === TK_tLABEL_END) {
                    // The p += 1 past the colon, and the p += 1 of every fbreak.
                    p += 2;
                    this.pop_literal();
                    this.rootState = RL_LEX_EN_EXPR_LABELARG;
                  } else {
                    p += 1;
                    state = this.pop_literal();
                    if (state >= 0) {
                      this.cs = state;
                    }
                  }
                  _trigger_goto = true;
                  _goto_level = _out;
                  break actsLoop;
                } else {
                  this.extend_string_for_token_range(current_literal, string);
                }
                break;
              }
              case 45: {
                p = pc;
                this.te = p + 1;
                this.extend_string_escaped();
                break;
              }
              case 46: {
                p = pc;
                this.te = p + 1;
                current_literal = this.lit();
                this.extend_string_eol_check_eof(current_literal, pe);
                if (current_literal.heredoc()) {
                  line = this.extend_string_eol_heredoc_line();
                  if (current_literal.nest_and_try_closing(line, this.herebody_s, this.ts) >= 0) {
                    this.herebody_s = this.te;
                    q = rbPos(current_literal.heredoc_e);
                    p = q - 1;
                    this.cs = this.pop_literal();
                    p += 1;
                    _trigger_goto = true;
                    _goto_level = _out;
                    break actsLoop;
                  } else {
                    current_literal.infer_indent_level(line);
                    this.herebody_s = this.te;
                  }
                } else {
                  if (current_literal.nest_and_try_closing(this.tok2(this.ts, this.te), this.ts, this.te) >= 0) {
                    this.cs = this.pop_literal();
                    p += 1;
                    _trigger_goto = true;
                    _goto_level = _out;
                    break actsLoop;
                  }
                  q = this.extend_string_eol_heredoc_intertwined(p);
                  p = q;
                }
                this.extend_string_eol_words(current_literal, p);
                break;
              }
              case 47: {
                p = pc;
                this.te = p + 1;
                string = this.tok2(this.ts, this.te);
                lookahead = this.extend_string_slice_end(lookahead);
                current_literal = this.lit();
                token = -1;
                if (!current_literal.heredoc()) {
                  token = current_literal.nest_and_try_closing(string, this.ts, this.te, lookahead);
                }
                if (token >= 0) {
                  if (token === TK_tLABEL_END) {
                    // The p += 1 past the colon, and the p += 1 of every fbreak.
                    p += 2;
                    this.pop_literal();
                    this.rootState = RL_LEX_EN_EXPR_LABELARG;
                  } else {
                    p += 1;
                    state = this.pop_literal();
                    if (state >= 0) {
                      this.cs = state;
                    }
                  }
                  _trigger_goto = true;
                  _goto_level = _out;
                  break actsLoop;
                } else {
                  this.extend_string_for_token_range(current_literal, string);
                }
                break;
              }
              case 48: {
                p = pc;
                this.te = p;
                p = p - 1;
                this.lit().extend_space(this.ts, this.te);
                break;
              }
              case 49: {
                p = pc;
                this.te = p;
                p = p - 1;
                string = this.tok2(this.ts, this.te);
                lookahead = this.extend_string_slice_end(lookahead);
                current_literal = this.lit();
                token = -1;
                if (!current_literal.heredoc()) {
                  token = current_literal.nest_and_try_closing(string, this.ts, this.te, lookahead);
                }
                if (token >= 0) {
                  if (token === TK_tLABEL_END) {
                    // The p += 1 past the colon, and the p += 1 of every fbreak.
                    p += 2;
                    this.pop_literal();
                    this.rootState = RL_LEX_EN_EXPR_LABELARG;
                  } else {
                    p += 1;
                    state = this.pop_literal();
                    if (state >= 0) {
                      this.cs = state;
                    }
                  }
                  _trigger_goto = true;
                  _goto_level = _out;
                  break actsLoop;
                } else {
                  this.extend_string_for_token_range(current_literal, string);
                }
                break;
              }
              case 50: {
                p = pc;
                this.te = p + 1;
                current_literal = this.lit();
                this.extend_string_eol_check_eof(current_literal, pe);
                if (current_literal.heredoc()) {
                  line = this.extend_string_eol_heredoc_line();
                  if (current_literal.nest_and_try_closing(line, this.herebody_s, this.ts) >= 0) {
                    this.herebody_s = this.te;
                    q = rbPos(current_literal.heredoc_e);
                    p = q - 1;
                    this.cs = this.pop_literal();
                    p += 1;
                    _trigger_goto = true;
                    _goto_level = _out;
                    break actsLoop;
                  } else {
                    current_literal.infer_indent_level(line);
                    this.herebody_s = this.te;
                  }
                } else {
                  if (current_literal.nest_and_try_closing(this.tok2(this.ts, this.te), this.ts, this.te) >= 0) {
                    this.cs = this.pop_literal();
                    p += 1;
                    _trigger_goto = true;
                    _goto_level = _out;
                    break actsLoop;
                  }
                  q = this.extend_string_eol_heredoc_intertwined(p);
                  p = q;
                }
                this.extend_string_eol_words(current_literal, p);
                break;
              }
              case 51: {
                p = pc;
                this.te = p + 1;
                this.extend_string_escaped();
                break;
              }
              case 52: {
                p = pc;
                this.te = p + 1;
                current_literal = this.lit();
                this.extend_string_eol_check_eof(current_literal, pe);
                if (current_literal.heredoc()) {
                  line = this.extend_string_eol_heredoc_line();
                  if (current_literal.nest_and_try_closing(line, this.herebody_s, this.ts) >= 0) {
                    this.herebody_s = this.te;
                    q = rbPos(current_literal.heredoc_e);
                    p = q - 1;
                    this.cs = this.pop_literal();
                    p += 1;
                    _trigger_goto = true;
                    _goto_level = _out;
                    break actsLoop;
                  } else {
                    current_literal.infer_indent_level(line);
                    this.herebody_s = this.te;
                  }
                } else {
                  if (current_literal.nest_and_try_closing(this.tok2(this.ts, this.te), this.ts, this.te) >= 0) {
                    this.cs = this.pop_literal();
                    p += 1;
                    _trigger_goto = true;
                    _goto_level = _out;
                    break actsLoop;
                  }
                  q = this.extend_string_eol_heredoc_intertwined(p);
                  p = q;
                }
                this.extend_string_eol_words(current_literal, p);
                break;
              }
              case 53: {
                p = pc;
                this.te = p + 1;
                string = this.tok2(this.ts, this.te);
                lookahead = this.extend_string_slice_end(lookahead);
                current_literal = this.lit();
                token = -1;
                if (!current_literal.heredoc()) {
                  token = current_literal.nest_and_try_closing(string, this.ts, this.te, lookahead);
                }
                if (token >= 0) {
                  if (token === TK_tLABEL_END) {
                    // The p += 1 past the colon, and the p += 1 of every fbreak.
                    p += 2;
                    this.pop_literal();
                    this.rootState = RL_LEX_EN_EXPR_LABELARG;
                  } else {
                    p += 1;
                    state = this.pop_literal();
                    if (state >= 0) {
                      this.cs = state;
                    }
                  }
                  _trigger_goto = true;
                  _goto_level = _out;
                  break actsLoop;
                } else {
                  this.extend_string_for_token_range(current_literal, string);
                }
                break;
              }
              case 54: {
                p = pc;
                this.te = p;
                p = p - 1;
                string = this.tok2(this.ts, this.te);
                lookahead = this.extend_string_slice_end(lookahead);
                current_literal = this.lit();
                token = -1;
                if (!current_literal.heredoc()) {
                  token = current_literal.nest_and_try_closing(string, this.ts, this.te, lookahead);
                }
                if (token >= 0) {
                  if (token === TK_tLABEL_END) {
                    // The p += 1 past the colon, and the p += 1 of every fbreak.
                    p += 2;
                    this.pop_literal();
                    this.rootState = RL_LEX_EN_EXPR_LABELARG;
                  } else {
                    p += 1;
                    state = this.pop_literal();
                    if (state >= 0) {
                      this.cs = state;
                    }
                  }
                  _trigger_goto = true;
                  _goto_level = _out;
                  break actsLoop;
                } else {
                  this.extend_string_for_token_range(current_literal, string);
                }
                break;
              }
              case 55: {
                p = pc;
                this.te = p + 1;
                current_literal = this.lit();
                this.extend_interp_code(current_literal);
                this.rootState = RL_LEX_EN_EXPR_VALUE;
                p += 1;
                _trigger_goto = true;
                _goto_level = _out;
                break actsLoop;
              }
              case 56: {
                p = pc;
                this.te = p + 1;
                current_literal = this.lit();
                this.extend_string_eol_check_eof(current_literal, pe);
                if (current_literal.heredoc()) {
                  line = this.extend_string_eol_heredoc_line();
                  if (current_literal.nest_and_try_closing(line, this.herebody_s, this.ts) >= 0) {
                    this.herebody_s = this.te;
                    q = rbPos(current_literal.heredoc_e);
                    p = q - 1;
                    this.cs = this.pop_literal();
                    p += 1;
                    _trigger_goto = true;
                    _goto_level = _out;
                    break actsLoop;
                  } else {
                    current_literal.infer_indent_level(line);
                    this.herebody_s = this.te;
                  }
                } else {
                  if (current_literal.nest_and_try_closing(this.tok2(this.ts, this.te), this.ts, this.te) >= 0) {
                    this.cs = this.pop_literal();
                    p += 1;
                    _trigger_goto = true;
                    _goto_level = _out;
                    break actsLoop;
                  }
                  q = this.extend_string_eol_heredoc_intertwined(p);
                  p = q;
                }
                this.extend_string_eol_words(current_literal, p);
                break;
              }
              case 57: {
                p = pc;
                this.te = p + 1;
                string = this.tok2(this.ts, this.te);
                lookahead = this.extend_string_slice_end(lookahead);
                current_literal = this.lit();
                token = -1;
                if (!current_literal.heredoc()) {
                  token = current_literal.nest_and_try_closing(string, this.ts, this.te, lookahead);
                }
                if (token >= 0) {
                  if (token === TK_tLABEL_END) {
                    // The p += 1 past the colon, and the p += 1 of every fbreak.
                    p += 2;
                    this.pop_literal();
                    this.rootState = RL_LEX_EN_EXPR_LABELARG;
                  } else {
                    p += 1;
                    state = this.pop_literal();
                    if (state >= 0) {
                      this.cs = state;
                    }
                  }
                  _trigger_goto = true;
                  _goto_level = _out;
                  break actsLoop;
                } else {
                  this.extend_string_for_token_range(current_literal, string);
                }
                break;
              }
              case 58: {
                p = pc;
                this.te = p;
                p = p - 1;
                this.extend_interp_digit_var();
                break;
              }
              case 59: {
                p = pc;
                this.te = p;
                p = p - 1;
                current_literal = this.lit();
                this.extend_interp_var(current_literal);
                this.emit_interp_var(interp_var_kind);
                break;
              }
              case 60: {
                p = pc;
                this.te = p;
                p = p - 1;
                string = this.tok2(this.ts, this.te);
                lookahead = this.extend_string_slice_end(lookahead);
                current_literal = this.lit();
                token = -1;
                if (!current_literal.heredoc()) {
                  token = current_literal.nest_and_try_closing(string, this.ts, this.te, lookahead);
                }
                if (token >= 0) {
                  if (token === TK_tLABEL_END) {
                    // The p += 1 past the colon, and the p += 1 of every fbreak.
                    p += 2;
                    this.pop_literal();
                    this.rootState = RL_LEX_EN_EXPR_LABELARG;
                  } else {
                    p += 1;
                    state = this.pop_literal();
                    if (state >= 0) {
                      this.cs = state;
                    }
                  }
                  _trigger_goto = true;
                  _goto_level = _out;
                  break actsLoop;
                } else {
                  this.extend_string_for_token_range(current_literal, string);
                }
                break;
              }
              case 61: {
                q = rbPos(this.te);
                p = q - 1;
                string = this.tok2(this.ts, this.te);
                lookahead = this.extend_string_slice_end(lookahead);
                current_literal = this.lit();
                token = -1;
                if (!current_literal.heredoc()) {
                  token = current_literal.nest_and_try_closing(string, this.ts, this.te, lookahead);
                }
                if (token >= 0) {
                  if (token === TK_tLABEL_END) {
                    // The p += 1 past the colon, and the p += 1 of every fbreak.
                    p += 2;
                    this.pop_literal();
                    this.rootState = RL_LEX_EN_EXPR_LABELARG;
                  } else {
                    p += 1;
                    state = this.pop_literal();
                    if (state >= 0) {
                      this.cs = state;
                    }
                  }
                  _trigger_goto = true;
                  _goto_level = _out;
                  break actsLoop;
                } else {
                  this.extend_string_for_token_range(current_literal, string);
                }
                break;
              }
              case 62: {
                p = pc;
                this.te = p + 1;
                current_literal = this.lit();
                this.extend_string_eol_check_eof(current_literal, pe);
                if (current_literal.heredoc()) {
                  line = this.extend_string_eol_heredoc_line();
                  if (current_literal.nest_and_try_closing(line, this.herebody_s, this.ts) >= 0) {
                    this.herebody_s = this.te;
                    q = rbPos(current_literal.heredoc_e);
                    p = q - 1;
                    this.cs = this.pop_literal();
                    p += 1;
                    _trigger_goto = true;
                    _goto_level = _out;
                    break actsLoop;
                  } else {
                    current_literal.infer_indent_level(line);
                    this.herebody_s = this.te;
                  }
                } else {
                  if (current_literal.nest_and_try_closing(this.tok2(this.ts, this.te), this.ts, this.te) >= 0) {
                    this.cs = this.pop_literal();
                    p += 1;
                    _trigger_goto = true;
                    _goto_level = _out;
                    break actsLoop;
                  }
                  q = this.extend_string_eol_heredoc_intertwined(p);
                  p = q;
                }
                this.extend_string_eol_words(current_literal, p);
                break;
              }
              case 63: {
                p = pc;
                this.te = p + 1;
                string = this.tok2(this.ts, this.te);
                lookahead = this.extend_string_slice_end(lookahead);
                current_literal = this.lit();
                token = -1;
                if (!current_literal.heredoc()) {
                  token = current_literal.nest_and_try_closing(string, this.ts, this.te, lookahead);
                }
                if (token >= 0) {
                  if (token === TK_tLABEL_END) {
                    // The p += 1 past the colon, and the p += 1 of every fbreak.
                    p += 2;
                    this.pop_literal();
                    this.rootState = RL_LEX_EN_EXPR_LABELARG;
                  } else {
                    p += 1;
                    state = this.pop_literal();
                    if (state >= 0) {
                      this.cs = state;
                    }
                  }
                  _trigger_goto = true;
                  _goto_level = _out;
                  break actsLoop;
                } else {
                  this.extend_string_for_token_range(current_literal, string);
                }
                break;
              }
              case 64: {
                p = pc;
                this.te = p + 1;
                current_literal = this.lit();
                this.extend_interp_code(current_literal);
                this.rootState = RL_LEX_EN_EXPR_VALUE;
                p += 1;
                _trigger_goto = true;
                _goto_level = _out;
                break actsLoop;
              }
              case 65: {
                p = pc;
                this.te = p + 1;
                current_literal = this.lit();
                this.extend_string_eol_check_eof(current_literal, pe);
                if (current_literal.heredoc()) {
                  line = this.extend_string_eol_heredoc_line();
                  if (current_literal.nest_and_try_closing(line, this.herebody_s, this.ts) >= 0) {
                    this.herebody_s = this.te;
                    q = rbPos(current_literal.heredoc_e);
                    p = q - 1;
                    this.cs = this.pop_literal();
                    p += 1;
                    _trigger_goto = true;
                    _goto_level = _out;
                    break actsLoop;
                  } else {
                    current_literal.infer_indent_level(line);
                    this.herebody_s = this.te;
                  }
                } else {
                  if (current_literal.nest_and_try_closing(this.tok2(this.ts, this.te), this.ts, this.te) >= 0) {
                    this.cs = this.pop_literal();
                    p += 1;
                    _trigger_goto = true;
                    _goto_level = _out;
                    break actsLoop;
                  }
                  q = this.extend_string_eol_heredoc_intertwined(p);
                  p = q;
                }
                this.extend_string_eol_words(current_literal, p);
                break;
              }
              case 66: {
                p = pc;
                this.te = p + 1;
                string = this.tok2(this.ts, this.te);
                lookahead = this.extend_string_slice_end(lookahead);
                current_literal = this.lit();
                token = -1;
                if (!current_literal.heredoc()) {
                  token = current_literal.nest_and_try_closing(string, this.ts, this.te, lookahead);
                }
                if (token >= 0) {
                  if (token === TK_tLABEL_END) {
                    // The p += 1 past the colon, and the p += 1 of every fbreak.
                    p += 2;
                    this.pop_literal();
                    this.rootState = RL_LEX_EN_EXPR_LABELARG;
                  } else {
                    p += 1;
                    state = this.pop_literal();
                    if (state >= 0) {
                      this.cs = state;
                    }
                  }
                  _trigger_goto = true;
                  _goto_level = _out;
                  break actsLoop;
                } else {
                  this.extend_string_for_token_range(current_literal, string);
                }
                break;
              }
              case 67: {
                p = pc;
                this.te = p;
                p = p - 1;
                this.extend_interp_digit_var();
                break;
              }
              case 68: {
                p = pc;
                this.te = p;
                p = p - 1;
                current_literal = this.lit();
                this.extend_interp_var(current_literal);
                this.emit_interp_var(interp_var_kind);
                break;
              }
              case 69: {
                p = pc;
                this.te = p;
                p = p - 1;
                this.lit().extend_space(this.ts, this.te);
                break;
              }
              case 70: {
                p = pc;
                this.te = p;
                p = p - 1;
                string = this.tok2(this.ts, this.te);
                lookahead = this.extend_string_slice_end(lookahead);
                current_literal = this.lit();
                token = -1;
                if (!current_literal.heredoc()) {
                  token = current_literal.nest_and_try_closing(string, this.ts, this.te, lookahead);
                }
                if (token >= 0) {
                  if (token === TK_tLABEL_END) {
                    // The p += 1 past the colon, and the p += 1 of every fbreak.
                    p += 2;
                    this.pop_literal();
                    this.rootState = RL_LEX_EN_EXPR_LABELARG;
                  } else {
                    p += 1;
                    state = this.pop_literal();
                    if (state >= 0) {
                      this.cs = state;
                    }
                  }
                  _trigger_goto = true;
                  _goto_level = _out;
                  break actsLoop;
                } else {
                  this.extend_string_for_token_range(current_literal, string);
                }
                break;
              }
              case 71: {
                q = rbPos(this.te);
                p = q - 1;
                string = this.tok2(this.ts, this.te);
                lookahead = this.extend_string_slice_end(lookahead);
                current_literal = this.lit();
                token = -1;
                if (!current_literal.heredoc()) {
                  token = current_literal.nest_and_try_closing(string, this.ts, this.te, lookahead);
                }
                if (token >= 0) {
                  if (token === TK_tLABEL_END) {
                    // The p += 1 past the colon, and the p += 1 of every fbreak.
                    p += 2;
                    this.pop_literal();
                    this.rootState = RL_LEX_EN_EXPR_LABELARG;
                  } else {
                    p += 1;
                    state = this.pop_literal();
                    if (state >= 0) {
                      this.cs = state;
                    }
                  }
                  _trigger_goto = true;
                  _goto_level = _out;
                  break actsLoop;
                } else {
                  this.extend_string_for_token_range(current_literal, string);
                }
                break;
              }
              case 72: {
                p = pc;
                this.te = p + 1;
                current_literal = this.lit();
                this.extend_string_eol_check_eof(current_literal, pe);
                if (current_literal.heredoc()) {
                  line = this.extend_string_eol_heredoc_line();
                  if (current_literal.nest_and_try_closing(line, this.herebody_s, this.ts) >= 0) {
                    this.herebody_s = this.te;
                    q = rbPos(current_literal.heredoc_e);
                    p = q - 1;
                    this.cs = this.pop_literal();
                    p += 1;
                    _trigger_goto = true;
                    _goto_level = _out;
                    break actsLoop;
                  } else {
                    current_literal.infer_indent_level(line);
                    this.herebody_s = this.te;
                  }
                } else {
                  if (current_literal.nest_and_try_closing(this.tok2(this.ts, this.te), this.ts, this.te) >= 0) {
                    this.cs = this.pop_literal();
                    p += 1;
                    _trigger_goto = true;
                    _goto_level = _out;
                    break actsLoop;
                  }
                  q = this.extend_string_eol_heredoc_intertwined(p);
                  p = q;
                }
                this.extend_string_eol_words(current_literal, p);
                break;
              }
              case 73: {
                p = pc;
                this.te = p + 1;
                string = this.tok2(this.ts, this.te);
                lookahead = this.extend_string_slice_end(lookahead);
                current_literal = this.lit();
                token = -1;
                if (!current_literal.heredoc()) {
                  token = current_literal.nest_and_try_closing(string, this.ts, this.te, lookahead);
                }
                if (token >= 0) {
                  if (token === TK_tLABEL_END) {
                    // The p += 1 past the colon, and the p += 1 of every fbreak.
                    p += 2;
                    this.pop_literal();
                    this.rootState = RL_LEX_EN_EXPR_LABELARG;
                  } else {
                    p += 1;
                    state = this.pop_literal();
                    if (state >= 0) {
                      this.cs = state;
                    }
                  }
                  _trigger_goto = true;
                  _goto_level = _out;
                  break actsLoop;
                } else {
                  this.extend_string_for_token_range(current_literal, string);
                }
                break;
              }
              case 74: {
                p = pc;
                this.te = p;
                p = p - 1;
                this.lit().extend_space(this.ts, this.te);
                break;
              }
              case 75: {
                p = pc;
                this.te = p + 1;
                this.lexer.emit4(TK_tREGEXP_OPT, this.tok2(this.ts, rbPos(this.te) - 1), this.ts, rbPos(this.te) - 1);
                p = p - 1;
                this.rootState = RL_LEX_EN_EXPR_END;
                p += 1;
                _trigger_goto = true;
                _goto_level = _out;
                break actsLoop;
              }
              case 76: {
                p = pc;
                this.te = p;
                p = p - 1;
                unknown_options = rbUnknownRegexpOptions(this.tok2(this.ts, this.te));
                if (unknown_options) {
                  this.lexer.diagError();
                }
                this.lexer.emit4(TK_tREGEXP_OPT, this.tok2(this.ts, this.te), this.ts, this.te);
                this.rootState = RL_LEX_EN_EXPR_END;
                p += 1;
                _trigger_goto = true;
                _goto_level = _out;
                break actsLoop;
              }
              case 77: {
                p = pc;
                this.te = p + 1;
                /* warning */
                q = rbPos(this.ts);
                p = q - 1;
                this.rootState = RL_LEX_EN_EXPR_END;
                p += 1;
                _trigger_goto = true;
                _goto_level = _out;
                break actsLoop;
              }
              case 78: {
                p = pc;
                this.te = p;
                p = p - 1;
                this.emit_character_constant();
                this.rootState = RL_LEX_EN_EXPR_END;
                p += 1;
                _trigger_goto = true;
                _goto_level = _out;
                break actsLoop;
              }
              case 79: {
                p = pc;
                this.te = p;
                p = p - 1;
                q = rbPos(this.ts);
                p = q - 1;
                this.rootState = RL_LEX_EN_EXPR_END;
                p += 1;
                _trigger_goto = true;
                _goto_level = _out;
                break actsLoop;
              }
              case 80: {
                q = rbPos(this.te);
                p = q - 1;
                this.emit_character_constant();
                this.rootState = RL_LEX_EN_EXPR_END;
                p += 1;
                _trigger_goto = true;
                _goto_level = _out;
                break actsLoop;
              }
              case 81: {
                p = pc;
                this.te = p + 1;
                this.lexer.diagError();
                break;
              }
            }
            if (_trigger_goto || this.lexer.fatal) {
              break;
            }
          }
          if (this.lexer.fatal) {
            return rbPos(p);
          }
          if (_trigger_goto) {
            continue;
          }
        }
      }
      if (_goto_level <= _again) {
        if (rbStateAction(RS_LEX_ACTIONS_D, RS_LEX_TO_STATE_ACTIONS_D, this.cs, 23)) {
          this.ts = -1;
        }
        if (this.cs === 0) {
          _goto_level = _out;
          continue;
        }
        // Only a fault's past-the-end position reaches the bound.
        if (p >= 1073741823) {
          return rbPastEnd();
        }
        p += 1;
        if (p !== pe) {
          _goto_level = _resume;
          continue;
        }
      }
      if (_goto_level <= _test_eof) {
        if (p === eof) {
          const eofTrans = rbTab(RS_LEX_EOF_TRANS_D, this.cs);
          if (eofTrans > 0) {
            _trans = eofTrans - 1;
            _goto_level = _eof_trans;
            continue;
          }
        }
      }
      if (_goto_level <= _out) {
        break;
      }
    }
    return rbPos(p);
  }
}

/** A hex digit's value, or -1 (each mask keeps the value as it is and bounds it). */
const rbHexDigit = (c: i32): integer<-1, 15> => {
  if (c >= 48 && c <= 57) {
    const d = (c - 48) & 15;
    return d;
  }
  if (c >= 97 && c <= 102) {
    const d = (c - 87) & 15;
    return d;
  }
  if (c >= 65 && c <= 70) {
    const d = (c - 55) & 15;
    return d;
  }
  return -1;
};

/** String#to_i(base) for small values (escapes). */
const rbParseInt = (s: string, base: i32): i32 => {
  let v = 0;
  for (let i = 0; i < toI32(s.length); i++) {
    const d = rbHexDigit(s.charCodeAt(i));
    if (d < 0 || d >= base) {
      break;
    }
    v = add32(mul32(v, base), d);
  }
  return v;
};

/** LexerStrings::ESCAPES, or "". */
const rbEscapeOf = (c: i32): string => {
  switch (c) {
    case 97:
      return "\u0007";
    case 98:
      return "\b";
    case 101:
      return "\u001b";
    case 102:
      return "\f";
    case 110:
      return "\n";
    case 114:
      return "\r";
    case 115:
      return " ";
    case 116:
      return "\t";
    case 118:
      return "\u000b";
    case 92:
      return "\\";
    default:
      return "";
  }
};

const rbIsRegexpMeta = (s: string): boolean => s.length === 1 && "\\$()*+.<>?[]^{|}".indexOf(s) >= 0;

/** String#gsub("\\\n", ""). */
const rbRemoveBackslashNewlines = (s: string): string => {
  let out = "";
  let a = 0;
  const n = toI32(s.length);
  for (let i = 0; i >= 0 && i < s.length; i++) {
    const j = i + 1;
    if (j < s.length && s.charCodeAt(i) === 92 && s.charCodeAt(j) === 10) {
      out = out + s.substring(a, i);
      a = j + 1;
      i = j;
    }
  }
  return a === 0 ? s : out + s.substring(a, n);
};

/** Parser::Lexer. */
export class RbLexer {
  source_pts: i32[];
  // The source as UTF-8 and the byte offset of every code point (n + 1 of
  // them), which an ASCII source (ascii) leaves empty: its offsets are the
  // code point offsets.
  text: string;
  boff: i32[];
  ascii: boolean = true;
  cs: i32 = 0;
  p: i32 = 0;
  ts: i32 = -1;
  te: i32 = -1;
  act: i32 = 0;
  stack: i32[];
  top: i32 = 0;
  eq_begin_s: i32 = -1;
  sharp_s: i32 = -1;
  newline_s: i32 = -1;
  num_base: i32 = 0;
  num_digits_s: i32 = -1;
  num_suffix_s: i32 = -1;
  num_xfrm: i32 = 0;
  paren_nest: i32 = 0;
  lambdaArr: i32[];
  nLambda: i32 = 0;
  command_start: boolean = true;
  cs_before_block_comment: i32 = 0;
  strings_: RbStrings | null = null;
  cond: RbStackState;
  cmdarg: RbStackState;
  cond_stack: RbStackState[];
  cmdarg_stack: RbStackState[];
  static_env: RbStaticEnv;
  ctx: RbContext;
  failed: boolean = false;
  fatal: boolean = false;
  // The token queue.
  qType: i32[];
  qVal: string[];
  qS: i32[];
  qE: i32[];
  qHead: i32 = 0;
  qTail: i32 = 0;
  // The token advance answered last.
  tokVal: string = "";
  tokS: i32 = 0;
  tokE: i32 = 0;
  // Comments (start, end).
  commentS: i32[];
  commentE: i32[];
  // Every token, for RuboCop's token list.
  allType: i32[];
  allVal: string[];
  allS: i32[];
  allE: i32[];

  constructor(pts: i32[], env: RbStaticEnv, ctx: RbContext) {
    rbTablesInit();
    const boff: i32[] = [];
    const parts: string[] = [];
    let ascii = true;
    let nb = 0;
    for (let i = 0; i >= 0 && i < pts.length; i++) {
      const c = pts[i];
      // A source past 2^30 bytes faults (the machines take at most 10^9 code points).
      if (nb < 0 || nb > 1073741823) {
        fault();
        break;
      }
      if (c < 0x80) {
        if (!ascii) {
          boff.push(nb);
        }
        parts.push(String.fromCharCode(c & 0xff));
        nb = nb + 1;
      } else {
        if (ascii) {
          // The offsets so far, each code point one byte.
          ascii = false;
          for (let k = 0; k < i; k++) {
            boff.push(k);
          }
        }
        boff.push(nb);
        parts.push(rbChr(c));
        if (c < 0x800) {
          nb = nb + 2;
        } else if (c < 0x10000) {
          nb = nb + 3;
        } else {
          nb = nb + 4;
        }
      }
    }
    if (!ascii) {
      boff.push(nb);
    }
    this.boff = boff;
    this.ascii = ascii;
    this.text = parts.join("");
    this.source_pts = pts;
    this.static_env = env;
    this.ctx = ctx;
    this.stack = [];
    this.lambdaArr = [];
    this.cs = RL_LEX_EN_LINE_BEGIN;
    this.cs_before_block_comment = RL_LEX_EN_LINE_BEGIN;
    this.cond = new RbStackState();
    this.cmdarg = new RbStackState();
    this.cond_stack = [];
    this.cmdarg_stack = [];
    this.qType = [];
    this.qVal = [];
    this.qS = [];
    this.qE = [];
    this.commentS = [];
    this.commentE = [];
    this.allType = [];
    this.allVal = [];
    this.allS = [];
    this.allE = [];
    if (pts.length > 0 && pts[0] === 0xfeff) {
      this.p = 1;
    }
  }

  /** The string machines (made on first use: they keep this lexer). */
  st(): RbStrings {
    const s = this.strings_;
    if (s !== null) {
      return s;
    }
    const made = new RbStrings(this);
    this.strings_ = made;
    return made;
  }

  diagError(): void {
    this.failed = true;
  }

  diagFatal(): void {
    this.failed = true;
    this.fatal = true;
  }

  /** The token a fatal diagnostic leaves: end of input. */
  fatalToken(): i32 {
    this.tokVal = "";
    return 0;
  }

  /** After a fault: end of input. */
  faultToken(): i32 {
    fault();
    return this.fatalToken();
  }

  setState(s: i32): void {
    this.cs = s;
  }

  push_cmdarg(): void {
    this.cmdarg_stack.push(this.cmdarg);
    this.cmdarg = new RbStackState();
  }

  pop_cmdarg(): void {
    const st = this.cmdarg_stack;
    const k = toI32(st.length);
    if (k > 0 && st.length > 0) {
      const top = st[k - 1];
      st.pop();
      this.cmdarg = top;
    } else {
      this.cmdarg = new RbStackState();
    }
  }

  push_cond(): void {
    this.cond_stack.push(this.cond);
    this.cond = new RbStackState();
  }

  pop_cond(): void {
    const st = this.cond_stack;
    const k = toI32(st.length);
    if (k > 0 && st.length > 0) {
      const top = st[k - 1];
      st.pop();
      this.cond = top;
    } else {
      this.cond = new RbStackState();
    }
  }

  dedent_level(): i32 {
    return this.st().dedentLevel();
  }

  declared(name: string): boolean {
    return this.static_env.declared(name);
  }

  lambdaLast(): i32 {
    const arr = this.lambdaArr;
    const n = this.nLambda;
    if (n <= 0) {
      return -1;
    }
    const i = n - 1;
    if (i < arr.length) {
      return arr[i];
    }
    fault();
    return -1;
  }

  lambdaPush(v: i32): void {
    const arr = this.lambdaArr;
    const n = this.nLambda;
    if (n >= 0 && n < arr.length) {
      arr[n] = v;
      this.nLambda = n + 1;
    } else if (n === arr.length) {
      arr.push(v);
      this.nLambda = toI32(arr.length);
    } else {
      fault();
    }
  }

  /** fret: the state on top of the call stack (0, the error state, after a fault). */
  stack_pop(): i32 {
    const st = this.stack;
    const top = this.top;
    if (top > 0 && top <= st.length) {
      const i = top - 1;
      this.top = i;
      return st[i];
    }
    fault();
    return 0;
  }

  stackPush(v: i32): void {
    const st = this.stack;
    const top = this.top;
    if (top >= 0 && top < st.length) {
      st[top] = v;
      this.top = top + 1;
    } else if (top === st.length) {
      st.push(v);
      this.top = toI32(st.length);
    } else {
      fault();
    }
  }

  tok2(s: i32, e: i32): string {
    return this.textOf(s, e);
  }

  /** The source text of the code points [s, e), clamped to the source. */
  textOf(s0: i32, e0: i32): string {
    const n = toI32(this.source_pts.length);
    let s = s0;
    if (s < 0) {
      s = 0;
    } else if (s > n) {
      s = n;
    }
    let e = e0;
    if (e > n) {
      e = n;
    } else if (e < s) {
      e = s;
    }
    if (this.ascii) {
      return this.text.substring(s, e);
    }
    const boff = this.boff;
    // boff holds n + 1 offsets, and 0 <= s <= e <= n.
    if (s >= 0 && e >= 0 && s < boff.length && e < boff.length) {
      return this.text.substring(boff[s], boff[e]);
    }
    fault();
    return "";
  }

  /** Whether the code points [s, e) are the ASCII string `t`. */
  tokIs(s: i32, e: i32, t: string): boolean {
    const len = toI32(t.length);
    if (sub32(e, s) !== len) {
      return false;
    }
    const pts = this.source_pts;
    let k = s;
    for (let i = 0; i < t.length; i++) {
      if (k < 0 || k >= pts.length) {
        // [s, e) leaves the source: the code point read outside it.
        fault();
        return false;
      }
      if (pts[k] !== t.charCodeAt(i)) {
        return false;
      }
      k++;
    }
    return true;
  }

  at(i: i32): i32 {
    return i >= 0 && i < toI32(this.source_pts.length) ? this.source_pts[i] : 0;
  }

  emit4(type: i32, value: string, s: i32, e: i32): void {
    this.qType.push(type);
    this.qVal.push(value);
    this.qS.push(s);
    this.qE.push(e);
    // qTail counts the pushes, as the queue's length.
    this.qTail = toI32(this.qType.length);
    this.allType.push(type);
    this.allVal.push(value);
    this.allS.push(s);
    this.allE.push(e);
  }

  emit1(type: i32): void {
    this.emit4(type, this.tok2(this.ts, this.te), this.ts, this.te);
  }

  emit2(type: i32, value: string): void {
    this.emit4(type, value, this.ts, this.te);
  }

  emit3(type: i32, value: string, s: i32): void {
    this.emit4(type, value, s, this.te);
  }

  emit_table(table: i32): void {
    this.emitTable(table, this.ts, this.te);
  }

  emitTable(table: i32, s: i32, e: i32): void {
    const v = this.tok2(s, e);
    this.emit4(rbTableToken(table, v), v, s, e);
  }

  emit_do(doBlock: boolean): void {
    if (this.cond.active()) {
      this.emit2(TK_kDO_COND, "do");
    } else if (this.cmdarg.active() || doBlock) {
      this.emit2(TK_kDO_BLOCK, "do");
    } else {
      this.emit2(TK_kDO, "do");
    }
  }

  arg_or_cmdarg(cmdState: boolean): i32 {
    return cmdState ? RL_LEX_EN_EXPR_CMDARG : RL_LEX_EN_EXPR_ARG;
  }

  emit_comment(s: i32, e: i32): void {
    this.commentS.push(s);
    this.commentE.push(e);
    this.allType.push(-2);
    this.allVal.push(this.tok2(s, e));
    this.allS.push(s);
    this.allE.push(e);
  }

  emit_comment_from_range(p: i32, pe: i32): void {
    this.emit_comment(this.sharp_s, p === pe ? sub32(p, 2) : p);
  }

  e_lbrace(): void {
    this.cond.push(false);
    this.cmdarg.push(false);
    const l = this.st().literal();
    if (l !== null) {
      l.start_interp_brace();
    }
  }

  numeric_literal_int(): string {
    const digits = this.tok2(this.num_digits_s, this.num_suffix_s);
    if (digits.endsWith("_")) {
      this.diagError();
    } else if (digits.length === 0) {
      this.diagError();
    } else if (this.num_base === 8 && (digits.indexOf("8") >= 0 || digits.indexOf("9") >= 0)) {
      this.diagError();
    }
    return digits;
  }

  on_newline(p: i32): RbPos {
    return this.st().on_newline(p);
  }

  check_ambiguous_slash(tm: i32): void {
    if (tm < -1) {
      this.diagError();
    }
  }

  emit_global_var(ts: i32, te: i32): void {
    const t = this.tok2(ts, te);
    if (rbIsNthRef(t)) {
      this.emit4(TK_tNTH_REF, t.substring(1, toI32(t.length)), ts, te);
    } else if (t.length === 2 && (t === "$&" || t === "$`" || t === "$'" || t === "$+")) {
      this.emit4(TK_tBACK_REF, t, ts, te);
    } else {
      this.emit4(TK_tGVAR, t, ts, te);
    }
  }

  emitGlobalVarHere(): void {
    this.emit_global_var(this.ts, this.te);
  }

  emit_class_var(ts: i32, te: i32): void {
    const t = this.tok2(ts, te);
    if (t.length > 2 && t.charCodeAt(2) >= 48 && t.charCodeAt(2) <= 57) {
      this.diagError();
    }
    this.emit4(TK_tCVAR, t, ts, te);
  }

  emit_instance_var(ts: i32, te: i32): void {
    const t = this.tok2(ts, te);
    if (t.length > 1 && t.charCodeAt(1) >= 48 && t.charCodeAt(1) <= 57) {
      this.diagError();
    }
    this.emit4(TK_tIVAR, t, ts, te);
  }

  emit_rbrace_rparen_rbrack(): void {
    this.emit_table(1);
    this.cond.pop();
    this.cmdarg.pop();
  }

  emit_colon_with_digits(p: i32, tm: i32): i32 {
    if (tm >= -1) {
      this.diagError();
    }
    return p;
  }

  emit_singleton_class(): void {
    this.emit4(TK_kCLASS, "class", this.ts, rbPos(this.ts) + 5);
    this.emit4(TK_tLSHFT, "<<", rbPos(this.te) - 2, this.te);
  }

  /** The value of an integer literal's digits in `base`, in decimal. */
  intValue(digits: string, base: i32): string {
    return rbToDecimal(digits, base);
  }

  /** @num_xfrm.call(value, p). */
  numXfrm(value: string, p: i32): RbPos {
    const x = this.num_xfrm;
    if (x === XF_integer) {
      this.emit2(TK_tINTEGER, value);
      return rbPos(p);
    }
    if (x === XF_rational) {
      this.emit2(TK_tRATIONAL, `r:${value}`);
      return rbPos(p);
    }
    if (x === XF_imaginary) {
      this.emit2(TK_tIMAGINARY, `i:${value}`);
      return rbPos(p);
    }
    if (x === XF_imaginary_rational) {
      this.emit2(TK_tIMAGINARY, `ir:${value}`);
      return rbPos(p);
    }
    if (x === XF_integer_re || x === XF_integer_if) {
      this.emit4(TK_tINTEGER, value, this.ts, rbPos(this.te) - 2);
      return rbPos(sub32(p, 2));
    }
    if (x === XF_integer_rescue) {
      this.emit4(TK_tINTEGER, value, this.ts, rbPos(this.te) - 6);
      return rbPos(sub32(p, 6));
    }
    if (x === XF_float) {
      this.emit2(TK_tFLOAT, value);
      return rbPos(p);
    }
    if (x === XF_imaginary_float) {
      this.emit2(TK_tIMAGINARY, `if:${value}`);
      return rbPos(p);
    }
    if (x === XF_float_if) {
      this.emit4(TK_tFLOAT, value, this.ts, rbPos(this.te) - 2);
      return rbPos(sub32(p, 2));
    }
    if (x === XF_float_rescue) {
      this.emit4(TK_tFLOAT, value, this.ts, rbPos(this.te) - 6);
      return rbPos(sub32(p, 6));
    }
    return rbPos(p);
  }

  /** Lexer#advance: the next token's type (0 at the end), its value and range in tokVal, tokS, tokE. */
  advance(): i32 {
    if (this.qHead !== this.qTail) {
      return this.shift();
    }
    const pts = this.source_pts;
    const n = toI32(pts.length);
    if (n > 1000000000) {
      return this.faultToken();
    }
    const pe = n + 2;
    let p = this.p;
    let q: RbPos = 0;
    let eof = pe;
    let cmd_state = this.command_start;
    this.command_start = false;
    let tm = 0;
    let digits = "";
    let type = "";
    let delimiter = "";
    let heredoc_e = 0;
    let new_herebody_s = 0;
    let ident_tok = "";
    let ident_ts = 0;
    let ident_te = 0;
    let gvar_name = "";
    let ident = "";
    let next_state = 0;
    let followed_by_nl = false;
    let nl_emitted = false;
    let dots_te = 0;
    let indent = false;
    let dedent_body = false;
    let _trans = 0;
    let _wide = 0;
    let _goto_level = 0;
    const _resume = 10;
    const _eof_trans = 15;
    const _again = 20;
    const _test_eof = 30;
    const _out = 40;
    while (true) {
      if (_goto_level >= _out) {
        break;
      }
      if (_goto_level <= 0) {
        if (p === pe) {
          _goto_level = _test_eof;
          continue;
        }
        if (this.cs === 0) {
          _goto_level = _out;
          continue;
        }
      }
      if (_goto_level <= _resume) {
        // A transition starts at p in [0, pe]: an action leaves p at least -1, and _again adds 1.
        if (p < 0 || p > pe) {
          return this.faultToken();
        }
        if (rbTab(RL_LEX_FROM_STATE_ACTIONS_D, this.cs) === 85) {
          this.ts = p;
        }
        _wide = 0;
        if (p < pts.length) {
          _wide = pts[p];
        }
        _trans = rbTransOf(
          RL_LEX_TRANS_KEYS_D,
          RL_LEX_KEY_SPANS_D,
          RL_LEX_INDEX_OFFSETS_D,
          RL_LEX_INDICIES_D,
          this.cs,
          _wide,
        );
      }
      if (_goto_level <= _eof_trans) {
        const target = rbTab(RL_LEX_TRANS_TARGS_D, _trans);
        const action = rbTab(RL_LEX_TRANS_ACTIONS_D, _trans);
        if (target < 0 || action < 0) {
          return this.faultToken();
        }
        this.cs = target;
        if (action !== 0) {
          if (p < 0 || p > pe) {
            return this.faultToken();
          }
          const pc: RbAt = p;
          switch (action) {
            case 14: {
              p = pc;
              this.newline_s = p;
              break;
            }
            case 15: {
              p = pc;
              q = this.on_newline(p);
              p = q;
              break;
            }
            case 45: {
              p = pc;
              this.sharp_s = p - 1;
              break;
            }
            case 49: {
              p = pc;
              this.emit_comment_from_range(p, pe);
              break;
            }
            case 190: {
              p = pc;
              tm = p;
              break;
            }
            case 22: {
              p = pc;
              tm = p;
              break;
            }
            case 24: {
              p = pc;
              tm = p;
              break;
            }
            case 26: {
              p = pc;
              tm = p;
              break;
            }
            case 56: {
              p = pc;
              heredoc_e = p;
              break;
            }
            case 229: {
              p = pc;
              tm = p - 1;
              break;
            }
            case 232: {
              p = pc;
              tm = p - 2;
              break;
            }
            case 244: {
              p = pc;
              tm = p;
              break;
            }
            case 188: {
              ident_tok = this.tok2(this.ts, this.te);
              ident_ts = this.ts;
              ident_te = this.te;
              break;
            }
            case 331: {
              p = pc;
              this.num_base = 16;
              this.num_digits_s = p;
              break;
            }
            case 325: {
              p = pc;
              this.num_base = 10;
              this.num_digits_s = p;
              break;
            }
            case 328: {
              p = pc;
              this.num_base = 8;
              this.num_digits_s = p;
              break;
            }
            case 322: {
              p = pc;
              this.num_base = 2;
              this.num_digits_s = p;
              break;
            }
            case 337: {
              this.num_base = 10;
              this.num_digits_s = this.ts;
              break;
            }
            case 299: {
              this.num_base = 8;
              this.num_digits_s = this.ts;
              break;
            }
            case 314: {
              p = pc;
              this.num_suffix_s = p;
              break;
            }
            case 307: {
              p = pc;
              this.num_suffix_s = p;
              break;
            }
            case 304: {
              p = pc;
              this.num_suffix_s = p;
              break;
            }
            case 74: {
              p = pc;
              tm = p;
              break;
            }
            case 65: {
              p = pc;
              this.te = p + 1;
              break;
            }
            case 1: {
              p = pc;
              this.te = p + 1;
              this.emitGlobalVarHere();
              this.cs = this.stack_pop();
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 87: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.emitGlobalVarHere();
              this.cs = this.stack_pop();
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 89: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.emit_class_var(this.ts, this.te);
              this.cs = this.stack_pop();
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 88: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.emit_instance_var(this.ts, this.te);
              this.cs = this.stack_pop();
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 110: {
              p = pc;
              this.te = p + 1;
              this.emit_table(4);
              this.cs = 247;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 96: {
              p = pc;
              this.te = p + 1;
              this.emit1(TK_tIDENTIFIER);
              this.cs = 247;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 3: {
              p = pc;
              this.te = p + 1;
              q = rbPos(this.ts);
              p = q - 1;
              this.cs = 516;
              this.stackPush(this.cs);

              this.cs = 129;
              _goto_level = _again;
              continue;
            }
            case 93: {
              p = pc;
              this.te = p + 1;
              this.emit_table(1);
              this.cs = 247;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 105: {
              p = pc;
              this.te = p + 1;
              p = p - 2;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 5: {
              p = pc;
              this.te = p + 1;
              if (false) {
                type = this.tok2(this.ts, rbPos(this.te) - 1);
                delimiter = this.tok2(rbPos(this.te) - 1, this.te);
                this.st().pushLiteral(type, delimiter, this.ts);
                this.cs = 128;
                _goto_level = _again;
                continue;
              } else {
                q = rbPos(this.ts);
                p = q - 1;
                this.cs = 516;
                _goto_level = _again;
                continue;
              }
            }
            case 92: {
              p = pc;
              this.te = p + 1;
              p = p - 1;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 91: {
              p = pc;
              this.te = p + 1;
              p = p - 1;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 109: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.emit_table(4);
              this.cs = 247;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 106: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.emit1(TK_tCONSTANT);
              this.cs = 247;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 108: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.emit1(TK_tIDENTIFIER);
              this.cs = 247;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 103: {
              p = pc;
              this.te = p;
              p = p - 1;
              q = rbPos(this.ts);
              p = q - 1;
              this.cs = 516;
              this.stackPush(this.cs);

              this.cs = 129;
              _goto_level = _again;
              continue;
            }
            case 99: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.emit_table(1);
              this.cs = 247;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 104: {
              p = pc;
              this.te = p;
              p = p - 2;
              this.cs = 345;
              _goto_level = _again;
              continue;
            }
            case 97: {
              p = pc;
              this.te = p;
              p = p - 1;
              break;
            }
            case 102: {
              p = pc;
              this.te = p;
              p = p - 2;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 4: {
              q = rbPos(this.te);
              p = q - 1;
              this.emit_table(1);
              this.cs = 247;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 2: {
              q = rbPos(this.te);
              p = q - 1;
              p = q - 2;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 95: {
              switch (this.act) {
                case 4: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit_table(4);
                  this.cs = 247;
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 5: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit1(TK_tCONSTANT);
                  this.cs = 247;
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 6: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit1(TK_tIDENTIFIER);
                  this.cs = 247;
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
              }
              break;
            }
            case 7: {
              p = pc;
              this.te = p + 1;
              this.emit4(TK_tLABEL, this.tok2(this.ts, rbPos(this.te) - 2), this.ts, rbPos(this.te) - 1);
              p = p - 1;
              this.cs = 501;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 8: {
              p = pc;
              this.te = p + 1;
              if (true && this.ctx.in_argdef) {
                this.emit2(TK_tBDOT3, "...");
                this.cs = 516;
                p += 1;
                _goto_level = _out;
                continue;
              } else {
                p -= 3;
                this.cs = 516;
                _goto_level = _again;
                continue;
              }
            }
            case 112: {
              p = pc;
              this.te = p + 1;
              p = p - 1;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 111: {
              p = pc;
              this.te = p + 1;
              p = p - 1;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 114: {
              p = pc;
              this.te = p;
              p = p - 1;
              break;
            }
            case 113: {
              p = pc;
              this.te = p;
              p = p - 2;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 6: {
              q = rbPos(this.te);
              p = q - 1;
              p = q - 2;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 120: {
              p = pc;
              this.te = p + 1;
              this.emit_table(1);
              this.cs = 276;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 119: {
              p = pc;
              this.te = p + 1;
              p = p - 1;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 118: {
              p = pc;
              this.te = p + 1;
              p = p - 1;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 130: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.emit1(TK_tCONSTANT);
              this.cs = this.arg_or_cmdarg(cmd_state);
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 121: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.emit1(TK_tIDENTIFIER);
              this.cs = this.arg_or_cmdarg(cmd_state);
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 126: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.emit_table(1);
              this.cs = 276;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 124: {
              p = pc;
              this.te = p;
              p = p - 1;
              break;
            }
            case 129: {
              p = pc;
              this.te = p;
              p = p - 2;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 153: {
              p = pc;
              this.te = p + 1;
              q = rbPos(this.ts);
              p = q - 1;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 136: {
              p = pc;
              this.te = p + 1;
              this.check_ambiguous_slash(tm);
              q = rbPos(tm);
              p = q - 1;
              this.cs = 345;
              _goto_level = _again;
              continue;
            }
            case 142: {
              p = pc;
              this.te = p + 1;
              p = p - 2;
              this.cs = 345;
              _goto_level = _again;
              continue;
            }
            case 10: {
              p = pc;
              this.te = p + 1;
              q = rbPos(this.ts);
              p = q - 1;
              this.cs = 345;
              _goto_level = _again;
              continue;
            }
            case 144: {
              p = pc;
              this.te = p + 1;
              q = rbPos(tm);
              p = q - 1;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 25: {
              p = pc;
              this.te = p + 1;
              q = rbPos(this.ts);
              p = q - 1;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 131: {
              p = pc;
              this.te = p + 1;
              p = p - 1;
              this.cs = 345;
              _goto_level = _again;
              continue;
            }
            case 132: {
              p = pc;
              this.te = p + 1;
              p = p - 1;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 143: {
              p = pc;
              this.te = p;
              p = p - 2;
              this.cs = 345;
              _goto_level = _again;
              continue;
            }
            case 139: {
              p = pc;
              this.te = p;
              p = p - 1;
              /* warning */
              q = rbPos(tm);
              p = q - 1;
              this.cs = 345;
              _goto_level = _again;
              continue;
            }
            case 141: {
              p = pc;
              this.te = p;
              p = p - 2;
              this.cs = 345;
              _goto_level = _again;
              continue;
            }
            case 135: {
              p = pc;
              this.te = p;
              p = p - 1;
              q = rbPos(this.ts);
              p = q - 1;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 134: {
              p = pc;
              this.te = p;
              p = p - 1;
              break;
            }
            case 152: {
              p = pc;
              this.te = p;
              p = p - 2;
              this.cs = 345;
              _goto_level = _again;
              continue;
            }
            case 11: {
              q = rbPos(this.te);
              p = q - 1;
              break;
            }
            case 27: {
              q = rbPos(this.te);
              p = q - 1;
              p = q - 2;
              this.cs = 345;
              _goto_level = _again;
              continue;
            }
            case 9: {
              switch (this.act) {
                case 33: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.check_ambiguous_slash(tm);
                  q = rbPos(tm);
                  p = q - 1;
                  this.cs = 345;
                  _goto_level = _again;
                  continue;
                }
                case 34: {
                  q = rbPos(this.te);
                  p = q - 1;
                  /* warning */
                  q = rbPos(tm);
                  p = q - 1;
                  this.cs = 345;
                  _goto_level = _again;
                  continue;
                }
                case 39: {
                  q = rbPos(this.te);
                  p = q - 1;
                  q = rbPos(this.ts);
                  p = q - 1;
                  this.cs = 516;
                  _goto_level = _again;
                  continue;
                }
                default: {
                  q = rbPos(this.te);
                  p = q - 1;
                  break;
                }
              }
              break;
            }
            case 29: {
              p = pc;
              this.te = p + 1;
              q = rbPos(this.ts);
              p = q - 1;
              this.cs = 276;
              _goto_level = _again;
              continue;
            }
            case 157: {
              p = pc;
              this.te = p + 1;
              p = p - 1;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 158: {
              p = pc;
              this.te = p;
              p = p - 1;
              q = rbPos(this.ts);
              p = q - 1;
              this.cs = 276;
              _goto_level = _again;
              continue;
            }
            case 30: {
              q = rbPos(this.te);
              p = q - 1;
              q = rbPos(this.ts);
              p = q - 1;
              this.cs = 276;
              _goto_level = _again;
              continue;
            }
            case 28: {
              switch (this.act) {
                case 46: {
                  q = rbPos(this.te);
                  p = q - 1;
                  if (this.cond.active()) {
                    this.emit4(TK_kDO_COND, "do", rbPos(this.te) - 2, this.te);
                  } else {
                    this.emit4(TK_kDO, "do", rbPos(this.te) - 2, this.te);
                  }
                  this.cs = 508;
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 47: {
                  q = rbPos(this.te);
                  p = q - 1;
                  q = rbPos(this.ts);
                  p = q - 1;
                  this.cs = 276;
                  _goto_level = _again;
                  continue;
                }
              }
              break;
            }
            case 168: {
              p = pc;
              this.te = p + 1;
              this.emit_do(true);
              this.cs = 508;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 161: {
              p = pc;
              this.te = p + 1;
              p = p - 1;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 162: {
              p = pc;
              this.te = p + 1;
              p = p - 1;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 163: {
              p = pc;
              this.te = p;
              p = p - 1;
              break;
            }
            case 166: {
              p = pc;
              this.te = p;
              p = p - 2;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 172: {
              p = pc;
              this.te = p + 1;
              p = p - 1;
              this.cs = 345;
              _goto_level = _again;
              continue;
            }
            case 171: {
              p = pc;
              this.te = p + 1;
              p = p - 1;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 180: {
              p = pc;
              this.te = p;
              p = p - 1;
              q = rbPos(this.ts);
              p = q - 1;
              this.cs = 345;
              _goto_level = _again;
              continue;
            }
            case 174: {
              p = pc;
              this.te = p;
              p = p - 1;
              break;
            }
            case 178: {
              p = pc;
              this.te = p;
              p = p - 2;
              this.cs = 345;
              _goto_level = _again;
              continue;
            }
            case 173: {
              switch (this.act) {
                case 54: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit_table(3);
                  this.cs = 345;
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 55: {
                  q = rbPos(this.te);
                  p = q - 1;
                  q = rbPos(this.ts);
                  p = q - 1;
                  this.cs = 345;
                  _goto_level = _again;
                  continue;
                }
              }
              break;
            }
            case 42: {
              p = pc;
              this.te = p + 1;
              this.emit4(TK_tUNARY_NUM, this.tok2(this.ts, rbPos(this.ts) + 1), this.ts, rbPos(this.ts) + 1);
              p = p - 1;
              this.cs = 516;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 214: {
              p = pc;
              this.te = p + 1;
              type = this.tok2(this.ts, rbPos(this.ts) + 1);
              delimiter = type;
              this.st().pushLiteral(type, delimiter, this.ts);
              p = p - 1;
              this.cs = 128;
              _goto_level = _again;
              continue;
            }
            case 206: {
              p = pc;
              this.te = p + 1;
              type = this.tok2(this.ts, rbPos(this.ts) + 1);
              delimiter = this.tok2(rbPos(this.te) - 1, this.te);
              this.st().pushLiteral(type, delimiter, this.ts);
              this.cs = 128;
              _goto_level = _again;
              continue;
            }
            case 40: {
              p = pc;
              this.te = p + 1;
              type = this.tok2(this.ts, rbPos(this.te) - 1);
              delimiter = this.tok2(rbPos(this.te) - 1, this.te);
              this.st().pushLiteral(type, delimiter, this.ts);
              this.cs = 128;
              _goto_level = _again;
              continue;
            }
            case 227: {
              p = pc;
              this.te = p + 1;
              p = p - 2;
              this.emit4(TK_tSYMBEG, this.tok2(this.ts, rbPos(this.ts) + 1), this.ts, rbPos(this.ts) + 1);
              this.cs = 134;
              _goto_level = _again;
              continue;
            }
            case 215: {
              p = pc;
              this.te = p + 1;
              type = this.tok2(this.ts, this.te);
              delimiter = this.tok2(rbPos(this.te) - 1, this.te);
              this.st().pushLiteral(type, delimiter, this.ts);
              this.cs = 128;
              _goto_level = _again;
              continue;
            }
            case 226: {
              p = pc;
              this.te = p + 1;
              this.emit2(TK_tSYMBOL, this.tok2(rbPos(this.ts) + 1, rbPos(this.ts) + 2));
              this.cs = 516;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 54: {
              p = pc;
              this.te = p + 1;
              gvar_name = this.tok2(rbPos(this.ts) + 1, this.te);
              if (true && gvar_name.startsWith("$0") && gvar_name.length > 2) {
                this.diagError();
              }
              this.emit3(TK_tSYMBOL, gvar_name, this.ts);
              this.cs = 516;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 236: {
              p = pc;
              this.te = p + 1;
              q = this.st().readCharacterConstant(this.ts);
              p = q;
              next_state = this.st().rootState;
              p = p - 1;
              if (this.qHead === this.qTail) {
                this.cs = next_state;
                _goto_level = _again;
                continue;
              } else {
                this.cs = next_state;
                p += 1;
                _goto_level = _out;
                continue;
              }
            }
            case 237: {
              p = pc;
              this.te = p + 1;
              this.diagFatal();
              break;
            }
            case 216: {
              p = pc;
              this.te = p + 1;
              this.emit_table(2);
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 37: {
              p = pc;
              this.te = p + 1;
              p = p - 1;
              if (false) {
                ident = this.tok2(this.ts, rbPos(this.te) - 2);
                this.emit4(
                  this.at(this.ts) >= 65 && this.at(this.ts) <= 90 ? TK_tCONSTANT : TK_tIDENTIFIER,
                  ident,
                  this.ts,
                  rbPos(this.te) - 2,
                );
                p = pc - 2;
                if (this.declared(ident)) {
                  this.cs = 516;
                } else {
                  this.cs = this.arg_or_cmdarg(cmd_state);
                }
              } else {
                this.emit4(TK_tLABEL, this.tok2(this.ts, rbPos(this.te) - 2), this.ts, rbPos(this.te) - 1);
                this.cs = 501;
              }
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 34: {
              p = pc;
              this.te = p + 1;
              this.emit4(TK_tIDENTIFIER, ident_tok, ident_ts, ident_te);
              q = rbPos(ident_te);
              p = q - 1;
              if (this.declared(ident_tok) && false) {
                this.cs = 247;
              } else {
                this.cs = 307;
              }
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 200: {
              p = pc;
              this.te = p + 1;
              q = rbPos(this.ts);
              p = q - 1;
              this.cs_before_block_comment = this.cs;
              this.cs = 710;
              _goto_level = _again;
              continue;
            }
            case 41: {
              p = pc;
              this.te = p + 1;
              q = rbPos(this.ts);
              p = q - 1;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 183: {
              p = pc;
              this.te = p + 1;
              p = p - 1;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 210: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.emit4(TK_tUNARY_NUM, this.tok2(this.ts, rbPos(this.ts) + 1), this.ts, rbPos(this.ts) + 1);
              p = pc - 2;
              this.cs = 516;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 209: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.emit2(TK_tSTAR, "*");
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 205: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.diagFatal();
              break;
            }
            case 234: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.diagError();
              break;
            }
            case 217: {
              p = pc;
              this.te = p;
              p = p - 1;
              gvar_name = this.tok2(rbPos(this.ts) + 1, this.te);
              if (true && gvar_name.startsWith("$0") && gvar_name.length > 2) {
                this.diagError();
              }
              this.emit3(TK_tSYMBOL, gvar_name, this.ts);
              this.cs = 516;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 230: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.emit_colon_with_digits(p, tm);
              this.cs = 516;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 235: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.diagFatal();
              break;
            }
            case 207: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.emit_table(2);
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 211: {
              p = pc;
              this.te = p;
              p = p - 1;
              if (true) {
                this.emit1(TK_tBDOT2);
              } else {
                this.emit1(TK_tDOT2);
              }
              this.cs = 345;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 212: {
              p = pc;
              this.te = p;
              p = p - 1;
              followed_by_nl = rbPos(this.te) - 1 === this.newline_s;
              nl_emitted = false;
              dots_te = followed_by_nl ? rbPos(this.te) - 1 : this.te;
              if (true) {
                if (this.nLambda > 0 && add32(this.lambdaLast(), 1) === this.paren_nest) {
                  this.emit4(TK_tDOT3, "...", this.ts, dots_te);
                } else {
                  this.emit4(TK_tBDOT3, "...", this.ts, dots_te);
                  if (true && followed_by_nl && this.ctx.in_argdef) {
                    this.emit4(TK_tNL, "", this.te, this.te);
                    nl_emitted = true;
                  }
                }
              } else if (true) {
                this.emit4(TK_tBDOT3, "...", this.ts, dots_te);
              } else {
                this.emit4(TK_tDOT3, "...", this.ts, dots_te);
              }
              if (followed_by_nl && !nl_emitted) {
                p = pc - 2;
              }
              this.cs = 345;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 187: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.emit1(TK_tIDENTIFIER);
              if (this.declared(this.tok2(this.ts, this.te))) {
                this.cs = 247;
                p += 1;
                _goto_level = _out;
                continue;
              } else if (true && rbIsNumberedParam(this.tok2(this.ts, this.te))) {
                this.cs = 247;
                p += 1;
                _goto_level = _out;
                continue;
              } else {
                this.cs = this.arg_or_cmdarg(cmd_state);
                p += 1;
                _goto_level = _out;
                continue;
              }
            }
            case 197: {
              p = pc;
              this.te = p;
              p = p - 1;
              break;
            }
            case 199: {
              p = pc;
              this.te = p;
              p = p - 1;
              q = rbPos(this.ts);
              p = q - 1;
              this.cs_before_block_comment = this.cs;
              this.cs = 710;
              _goto_level = _again;
              continue;
            }
            case 202: {
              p = pc;
              this.te = p;
              p = p - 1;
              q = rbPos(this.ts);
              p = q - 1;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 39: {
              q = rbPos(this.te);
              p = q - 1;
              this.diagFatal();
              break;
            }
            case 58: {
              q = rbPos(this.te);
              p = q - 1;
              this.diagError();
              break;
            }
            case 33: {
              q = rbPos(this.te);
              p = q - 1;
              this.emit1(TK_tIDENTIFIER);
              if (this.declared(this.tok2(this.ts, this.te))) {
                this.cs = 247;
                p += 1;
                _goto_level = _out;
                continue;
              } else if (true && rbIsNumberedParam(this.tok2(this.ts, this.te))) {
                this.cs = 247;
                p += 1;
                _goto_level = _out;
                continue;
              } else {
                this.cs = this.arg_or_cmdarg(cmd_state);
                p += 1;
                _goto_level = _out;
                continue;
              }
            }
            case 38: {
              q = rbPos(this.te);
              p = q - 1;
              break;
            }
            case 53: {
              q = rbPos(this.te);
              p = q - 1;
              q = rbPos(this.ts);
              p = q - 1;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 36: {
              switch (this.act) {
                case 60: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit4(TK_tUNARY_NUM, this.tok2(this.ts, rbPos(this.ts) + 1), this.ts, rbPos(this.ts) + 1);
                  p = q - 2;
                  this.cs = 516;
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 67: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.diagError();
                  break;
                }
                case 76: {
                  q = rbPos(this.te);
                  p = q - 1;
                  if (true) {
                    this.emit4(TK_tPIPE, this.tok2(this.ts, rbPos(this.ts) + 1), this.ts, rbPos(this.ts) + 1);
                    p = q - 2;
                    this.cs = 345;
                    p += 1;
                    _goto_level = _out;
                    continue;
                  } else {
                    p = q - 3;
                    this.cs = 516;
                    _goto_level = _again;
                    continue;
                  }
                }
                case 80: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit_table(2);
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 81: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit4(TK_kRESCUE, "rescue", this.ts, tm);
                  q = rbPos(tm);
                  p = q - 1;
                  this.cs = 321;
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 82: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit_table(4);
                  this.command_start = true;
                  this.cs = 508;
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 86: {
                  q = rbPos(this.te);
                  p = q - 1;
                  q = rbPos(this.ts);
                  p = q - 1;
                  this.cs = 516;
                  _goto_level = _again;
                  continue;
                }
                case 87: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit1(TK_tIDENTIFIER);
                  if (this.declared(this.tok2(this.ts, this.te))) {
                    this.cs = 247;
                    p += 1;
                    _goto_level = _out;
                    continue;
                  } else if (true && rbIsNumberedParam(this.tok2(this.ts, this.te))) {
                    this.cs = 247;
                    p += 1;
                    _goto_level = _out;
                    continue;
                  } else {
                    this.cs = this.arg_or_cmdarg(cmd_state);
                    p += 1;
                    _goto_level = _out;
                    continue;
                  }
                }
                case 91: {
                  q = rbPos(this.te);
                  p = q - 1;
                  q = rbPos(this.ts);
                  p = q - 1;
                  this.cs = 516;
                  _goto_level = _again;
                  continue;
                }
              }
              break;
            }
            case 247: {
              p = pc;
              this.te = p + 1;
              p = p - 1;
              this.cs = 345;
              _goto_level = _again;
              continue;
            }
            case 248: {
              p = pc;
              this.te = p + 1;
              p = p - 1;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 249: {
              p = pc;
              this.te = p;
              p = p - 1;
              break;
            }
            case 253: {
              p = pc;
              this.te = p;
              p = p - 2;
              this.cs = 345;
              _goto_level = _again;
              continue;
            }
            case 61: {
              p = pc;
              this.te = p + 1;
              q = rbPos(this.ts);
              p = q - 1;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 257: {
              p = pc;
              this.te = p + 1;
              this.st().pushLiteral(this.tok2(this.ts, this.te), this.tok2(this.ts, this.te), this.ts);
              this.cs = 128;
              _goto_level = _again;
              continue;
            }
            case 256: {
              p = pc;
              this.te = p + 1;
              p = p - 1;
              this.cs = 345;
              _goto_level = _again;
              continue;
            }
            case 255: {
              p = pc;
              this.te = p + 1;
              p = p - 1;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 259: {
              p = pc;
              this.te = p;
              p = p - 1;
              break;
            }
            case 258: {
              p = pc;
              this.te = p;
              p = p - 2;
              this.cs = 345;
              _goto_level = _again;
              continue;
            }
            case 60: {
              q = rbPos(this.te);
              p = q - 1;
              p = q - 2;
              this.cs = 345;
              _goto_level = _again;
              continue;
            }
            case 292: {
              p = pc;
              this.te = p + 1;
              this.emit4(TK_tLAMBDA, "->", this.ts, rbPos(this.ts) + 2);
              this.lambdaPush(this.paren_nest);
              this.cs = 247;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 71: {
              p = pc;
              this.te = p + 1;
              this.emit_singleton_class();
              this.cs = 508;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 267: {
              p = pc;
              this.te = p + 1;
              type = this.tok2(this.ts, this.te);
              delimiter = this.tok2(rbPos(this.te) - 1, this.te);
              this.st().pushLiteralFull(type, delimiter, this.ts, -1, false, false, true);
              this.cs = 128;
              _goto_level = _again;
              continue;
            }
            case 63: {
              p = pc;
              this.te = p + 1;
              q = rbPos(this.ts);
              p = q - 1;
              this.stackPush(this.cs);

              this.cs = 129;
              _goto_level = _again;
              continue;
            }
            case 288: {
              p = pc;
              this.te = p + 1;
              this.emit_table(1);
              this.cs = 255;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 341: {
              p = pc;
              this.te = p + 1;
              this.emit_table(1);
              this.cs = 508;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 281: {
              p = pc;
              this.te = p + 1;
              this.emit_table(1);
              this.cs = 508;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 286: {
              p = pc;
              this.te = p + 1;
              this.emit2(TK_tOP_ASGN, this.tok2(this.ts, rbPos(this.te) - 1));
              this.cs = 345;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 272: {
              p = pc;
              this.te = p + 1;
              this.emit2(TK_tEH, "?");
              this.cs = 508;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 269: {
              p = pc;
              this.te = p + 1;
              this.emit_table(1);
              this.cs = 345;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 271: {
              p = pc;
              this.te = p + 1;
              this.emit2(TK_tSEMI, ";");
              this.command_start = true;
              this.cs = 508;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 346: {
              p = pc;
              this.te = p + 1;
              this.diagError();
              p = p - 1;
              break;
            }
            case 266: {
              p = pc;
              this.te = p + 1;
              this.diagFatal();
              break;
            }
            case 265: {
              p = pc;
              this.te = p + 1;
              p = p - 1;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 357: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.emit_table(3);
              this.cs = 134;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 355: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.emit_singleton_class();
              this.cs = 508;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 354: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.emit_table(3);
              this.command_start = true;
              this.cs = 508;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 296: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.diagError();
              break;
            }
            case 343: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.emit1(TK_tCONSTANT);
              this.cs = this.arg_or_cmdarg(cmd_state);
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 285: {
              p = pc;
              this.te = p;
              p = p - 1;
              q = rbPos(this.ts);
              p = q - 1;
              this.stackPush(this.cs);

              this.cs = 129;
              _goto_level = _again;
              continue;
            }
            case 293: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.emit_table(1);
              this.cs = 255;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 349: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.emit1(TK_tIDENTIFIER);
              if (this.declared(this.tok2(this.ts, this.te))) {
                this.cs = 247;
                p += 1;
                _goto_level = _out;
                continue;
              } else if (true && rbIsNumberedParam(this.tok2(this.ts, this.te))) {
                this.cs = 247;
                p += 1;
                _goto_level = _out;
                continue;
              } else {
                this.cs = this.arg_or_cmdarg(cmd_state);
                p += 1;
                _goto_level = _out;
                continue;
              }
            }
            case 291: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.emit_table(1);
              this.cs = 508;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 287: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.emit_table(1);
              this.cs = 508;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 280: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.emit_table(1);
              this.cs = 345;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 294: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.emit_table(1);
              this.cs = 345;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 278: {
              p = pc;
              this.te = p;
              p = p - 1;
              break;
            }
            case 284: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.diagFatal();
              break;
            }
            case 69: {
              q = rbPos(this.te);
              p = q - 1;
              digits = this.numeric_literal_int();
              if (false) {
                this.emit4(TK_tINTEGER, this.intValue(digits, this.num_base), this.ts, this.num_suffix_s);
                q = rbPos(this.num_suffix_s);
                p = q - 1;
              } else {
                q = this.numXfrm(this.intValue(digits, this.num_base), p);
                p = q;
              }
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 64: {
              q = rbPos(this.te);
              p = q - 1;
              this.diagError();
              break;
            }
            case 68: {
              q = rbPos(this.te);
              p = q - 1;
              digits = this.tok2(this.ts, this.num_suffix_s);
              if (false) {
                this.emit4(TK_tFLOAT, digits, this.ts, this.num_suffix_s);
                q = rbPos(this.num_suffix_s);
                p = q - 1;
              } else {
                q = this.numXfrm(digits, p);
                p = q;
              }
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 62: {
              q = rbPos(this.te);
              p = q - 1;
              this.diagFatal();
              break;
            }
            case 66: {
              switch (this.act) {
                case 104: {
                  q = rbPos(this.te);
                  p = q - 1;
                  if (this.lambdaLast() === this.paren_nest) {
                    this.nLambda = sub32(this.nLambda, 1);
                    if (this.tokIs(this.ts, this.te, "{")) {
                      this.emit2(TK_tLAMBEG, "{");
                    } else {
                      this.emit2(TK_kDO_LAMBDA, "do");
                    }
                  } else {
                    if (this.tokIs(this.ts, this.te, "{")) {
                      this.emit2(TK_tLCURLY, "{");
                    } else {
                      this.emit_do(false);
                    }
                  }
                  if (this.tokIs(this.ts, this.te, "{")) {
                    this.paren_nest = add32(this.paren_nest, 1);
                  }
                  this.command_start = true;
                  this.cs = 508;
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 105: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit_table(3);
                  this.cs = 134;
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 106: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit_singleton_class();
                  this.cs = 508;
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 107: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit_table(3);
                  this.cs = 345;
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 108: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit_table(3);
                  this.command_start = true;
                  this.cs = 508;
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 109: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit_table(3);
                  this.cs = 321;
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 110: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit_table(3);
                  if (false && this.tokIs(this.ts, this.te, "!")) {
                    this.cs = 345;
                    p += 1;
                    _goto_level = _out;
                    continue;
                  } else {
                    this.cs = 276;
                    p += 1;
                    _goto_level = _out;
                    continue;
                  }
                }
                case 111: {
                  q = rbPos(this.te);
                  p = q - 1;
                  if (false) {
                    this.emit1(TK_tIDENTIFIER);
                    if (!this.declared(this.tok2(this.ts, this.te))) {
                      this.cs = this.arg_or_cmdarg(cmd_state);
                    }
                  } else {
                    this.emit2(TK_k__ENCODING__, "__ENCODING__");
                  }
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 112: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit_table(3);
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 113: {
                  q = rbPos(this.te);
                  p = q - 1;
                  digits = this.numeric_literal_int();
                  if (false) {
                    this.emit4(TK_tINTEGER, this.intValue(digits, this.num_base), this.ts, this.num_suffix_s);
                    q = rbPos(this.num_suffix_s);
                    p = q - 1;
                  } else {
                    q = this.numXfrm(this.intValue(digits, this.num_base), p);
                    p = q;
                  }
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 115: {
                  q = rbPos(this.te);
                  p = q - 1;
                  if (false) {
                    this.diagError();
                  } else {
                    this.emit4(
                      TK_tINTEGER,
                      this.intValue(this.tok2(this.ts, rbPos(this.te) - 1), 10),
                      this.ts,
                      rbPos(this.te) - 1,
                    );
                    p = q - 2;
                    p += 1;
                    _goto_level = _out;
                    continue;
                  }
                  break;
                }
                case 116: {
                  q = rbPos(this.te);
                  p = q - 1;
                  if (false) {
                    this.diagError();
                  } else {
                    this.emit4(TK_tFLOAT, this.tok2(this.ts, rbPos(this.te) - 1), this.ts, rbPos(this.te) - 1);
                    p = q - 2;
                    p += 1;
                    _goto_level = _out;
                    continue;
                  }
                  break;
                }
                case 117: {
                  q = rbPos(this.te);
                  p = q - 1;
                  digits = this.tok2(this.ts, this.num_suffix_s);
                  if (false) {
                    this.emit4(TK_tFLOAT, digits, this.ts, this.num_suffix_s);
                    q = rbPos(this.num_suffix_s);
                    p = q - 1;
                  } else {
                    q = this.numXfrm(digits, p);
                    p = q;
                  }
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 119: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit1(TK_tCONSTANT);
                  this.cs = this.arg_or_cmdarg(cmd_state);
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 123: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit1(TK_tIDENTIFIER);
                  if (this.declared(this.tok2(this.ts, this.te))) {
                    this.cs = 247;
                    p += 1;
                    _goto_level = _out;
                    continue;
                  } else if (true && rbIsNumberedParam(this.tok2(this.ts, this.te))) {
                    this.cs = 247;
                    p += 1;
                    _goto_level = _out;
                    continue;
                  } else {
                    this.cs = this.arg_or_cmdarg(cmd_state);
                    p += 1;
                    _goto_level = _out;
                    continue;
                  }
                }
                case 124: {
                  q = rbPos(this.te);
                  p = q - 1;
                  if (tm === this.te) {
                    this.emit1(TK_tFID);
                  } else {
                    this.emit4(TK_tIDENTIFIER, this.tok2(this.ts, tm), this.ts, tm);
                    q = rbPos(tm);
                    p = q - 1;
                  }
                  this.cs = 276;
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 126: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit_table(1);
                  this.cs = 508;
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 127: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit_table(1);
                  this.cs = 345;
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
              }
              break;
            }
            case 368: {
              p = pc;
              this.te = p + 1;
              this.emit4(TK_tNL, "", this.newline_s, rbPos(this.newline_s) + 1);
              if (false) {
                p = p - 1;
                this.cs = 710;
                p += 1;
                _goto_level = _out;
                continue;
              } else {
                this.emit1(TK_tBDOT3);
                this.cs = 345;
                p += 1;
                _goto_level = _out;
                continue;
              }
            }
            case 80: {
              p = pc;
              this.te = p + 1;
              q = rbPos(tm);
              p = q - 1;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 362: {
              p = pc;
              this.te = p + 1;
              this.emit4(TK_tNL, "", this.newline_s, rbPos(this.newline_s) + 1);
              p = p - 1;
              this.cs = 710;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 365: {
              p = pc;
              this.te = p;
              p = p - 1;
              if (false) {
                this.emit4(TK_tNL, "", this.newline_s, rbPos(this.newline_s) + 1);
                p = pc - 2;
                this.cs = 710;
                p += 1;
                _goto_level = _out;
                continue;
              }
              break;
            }
            case 367: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.emit4(TK_tNL, "", this.newline_s, rbPos(this.newline_s) + 1);
              if (false) {
                p = pc - 2;
                this.cs = 710;
                p += 1;
                _goto_level = _out;
                continue;
              } else {
                this.emit1(TK_tBDOT2);
                this.cs = 345;
                p += 1;
                _goto_level = _out;
                continue;
              }
            }
            case 366: {
              p = pc;
              this.te = p;
              p = p - 1;
              q = rbPos(tm);
              p = q - 1;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 364: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.emit4(TK_tNL, "", this.newline_s, rbPos(this.newline_s) + 1);
              p = pc - 2;
              this.cs = 710;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 75: {
              q = rbPos(this.te);
              p = q - 1;
              if (false) {
                this.emit4(TK_tNL, "", this.newline_s, rbPos(this.newline_s) + 1);
                p = q - 2;
                this.cs = 710;
                p += 1;
                _goto_level = _out;
                continue;
              }
              break;
            }
            case 72: {
              q = rbPos(this.te);
              p = q - 1;
              this.emit4(TK_tNL, "", this.newline_s, rbPos(this.newline_s) + 1);
              p = q - 2;
              this.cs = 710;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 76: {
              switch (this.act) {
                case 140: {
                  q = rbPos(this.te);
                  p = q - 1;
                  if (false) {
                    this.emit4(TK_tNL, "", this.newline_s, rbPos(this.newline_s) + 1);
                    p = q - 2;
                    this.cs = 710;
                    p += 1;
                    _goto_level = _out;
                    continue;
                  }
                  break;
                }
                case 144: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit4(TK_tNL, "", this.newline_s, rbPos(this.newline_s) + 1);
                  p = q - 2;
                  this.cs = 710;
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
              }
              break;
            }
            case 371: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.emit_comment(this.eq_begin_s, this.te);
              this.cs = this.cs_before_block_comment;
              _goto_level = _again;
              continue;
            }
            case 370: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.diagFatal();
              break;
            }
            case 381: {
              p = pc;
              this.te = p + 1;
              this.eq_begin_s = this.ts;
              this.cs = 704;
              _goto_level = _again;
              continue;
            }
            case 82: {
              p = pc;
              this.te = p + 1;
              p = pe - 3;
              break;
            }
            case 373: {
              p = pc;
              this.te = p + 1;
              cmd_state = true;
              p = p - 1;
              this.cs = 508;
              _goto_level = _again;
              continue;
            }
            case 374: {
              p = pc;
              this.te = p + 1;
              p = p - 1;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 375: {
              p = pc;
              this.te = p;
              p = p - 1;
              break;
            }
            case 380: {
              p = pc;
              this.te = p;
              p = p - 1;
              this.eq_begin_s = this.ts;
              this.cs = 704;
              _goto_level = _again;
              continue;
            }
            case 379: {
              p = pc;
              this.te = p;
              p = p - 1;
              cmd_state = true;
              p = pc - 2;
              this.cs = 508;
              _goto_level = _again;
              continue;
            }
            case 81: {
              q = rbPos(this.te);
              p = q - 1;
              cmd_state = true;
              p = q - 2;
              this.cs = 508;
              _goto_level = _again;
              continue;
            }
            case 86: {
              p = pc;
              this.te = p + 1;
              q = this.st().advance(p);
              p = q;
              next_state = this.st().rootState;
              p = p - 1;
              this.cs = next_state;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 52: {
              p = pc;
              this.newline_s = p;
              this.emit_comment_from_range(p, pe);
              break;
            }
            case 154: {
              p = pc;
              this.newline_s = p;
              this.te = p + 1;
              q = rbPos(this.ts);
              p = q - 1;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 145: {
              p = pc;
              this.newline_s = p;
              this.te = p + 1;
              q = rbPos(tm);
              p = q - 1;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 137: {
              p = pc;
              this.newline_s = p;
              this.te = p + 1;
              q = rbPos(this.ts);
              p = q - 1;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 213: {
              p = pc;
              this.newline_s = p;
              this.te = p + 1;
              followed_by_nl = rbPos(this.te) - 1 === this.newline_s;
              nl_emitted = false;
              dots_te = followed_by_nl ? rbPos(this.te) - 1 : this.te;
              if (true) {
                if (this.nLambda > 0 && add32(this.lambdaLast(), 1) === this.paren_nest) {
                  this.emit4(TK_tDOT3, "...", this.ts, dots_te);
                } else {
                  this.emit4(TK_tBDOT3, "...", this.ts, dots_te);
                  if (true && followed_by_nl && this.ctx.in_argdef) {
                    this.emit4(TK_tNL, "", this.te, this.te);
                    nl_emitted = true;
                  }
                }
              } else if (true) {
                this.emit4(TK_tBDOT3, "...", this.ts, dots_te);
              } else {
                this.emit4(TK_tDOT3, "...", this.ts, dots_te);
              }
              if (followed_by_nl && !nl_emitted) {
                p = p - 1;
              }
              this.cs = 345;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 201: {
              p = pc;
              this.newline_s = p;
              this.te = p + 1;
              q = rbPos(this.ts);
              p = q - 1;
              this.cs_before_block_comment = this.cs;
              this.cs = 710;
              _goto_level = _again;
              continue;
            }
            case 295: {
              p = pc;
              this.newline_s = p;
              this.te = p + 1;
              if (this.paren_nest === 0) {
                /* warning */
              }
              this.emit4(TK_tDOT3, "...", this.ts, rbPos(this.te) - 1);
              p = p - 1;
              this.cs = 345;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 372: {
              p = pc;
              this.newline_s = p;
              this.te = p + 1;
              this.emit_comment(this.eq_begin_s, this.te);
              this.cs = this.cs_before_block_comment;
              _goto_level = _again;
              continue;
            }
            case 369: {
              p = pc;
              this.newline_s = p;
              this.te = p + 1;
              break;
            }
            case 382: {
              p = pc;
              this.newline_s = p;
              this.te = p + 1;
              this.eq_begin_s = this.ts;
              this.cs = 704;
              _goto_level = _again;
              continue;
            }
            case 83: {
              p = pc;
              this.newline_s = p;
              this.te = p + 1;
              p = pe - 3;
              break;
            }
            case 317: {
              p = pc;
              this.num_xfrm = XF_rational;
              this.te = p;
              p = p - 1;
              digits = this.numeric_literal_int();
              if (false) {
                this.emit4(TK_tINTEGER, this.intValue(digits, this.num_base), this.ts, this.num_suffix_s);
                q = rbPos(this.num_suffix_s);
                p = q - 1;
              } else {
                q = this.numXfrm(this.intValue(digits, this.num_base), p);
                p = q;
              }
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 315: {
              p = pc;
              this.num_xfrm = XF_imaginary;
              this.te = p;
              p = p - 1;
              digits = this.numeric_literal_int();
              if (false) {
                this.emit4(TK_tINTEGER, this.intValue(digits, this.num_base), this.ts, this.num_suffix_s);
                q = rbPos(this.num_suffix_s);
                p = q - 1;
              } else {
                q = this.numXfrm(this.intValue(digits, this.num_base), p);
                p = q;
              }
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 320: {
              p = pc;
              this.num_xfrm = XF_imaginary_rational;
              this.te = p;
              p = p - 1;
              digits = this.numeric_literal_int();
              if (false) {
                this.emit4(TK_tINTEGER, this.intValue(digits, this.num_base), this.ts, this.num_suffix_s);
                q = rbPos(this.num_suffix_s);
                p = q - 1;
              } else {
                q = this.numXfrm(this.intValue(digits, this.num_base), p);
                p = q;
              }
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 318: {
              p = pc;
              this.num_xfrm = XF_integer_re;
              this.te = p;
              p = p - 1;
              digits = this.numeric_literal_int();
              if (false) {
                this.emit4(TK_tINTEGER, this.intValue(digits, this.num_base), this.ts, this.num_suffix_s);
                q = rbPos(this.num_suffix_s);
                p = q - 1;
              } else {
                q = this.numXfrm(this.intValue(digits, this.num_base), p);
                p = q;
              }
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 316: {
              p = pc;
              this.num_xfrm = XF_integer_if;
              this.te = p;
              p = p - 1;
              digits = this.numeric_literal_int();
              if (false) {
                this.emit4(TK_tINTEGER, this.intValue(digits, this.num_base), this.ts, this.num_suffix_s);
                q = rbPos(this.num_suffix_s);
                p = q - 1;
              } else {
                q = this.numXfrm(this.intValue(digits, this.num_base), p);
                p = q;
              }
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 319: {
              p = pc;
              this.num_xfrm = XF_integer_rescue;
              this.te = p;
              p = p - 1;
              digits = this.numeric_literal_int();
              if (false) {
                this.emit4(TK_tINTEGER, this.intValue(digits, this.num_base), this.ts, this.num_suffix_s);
                q = rbPos(this.num_suffix_s);
                p = q - 1;
              } else {
                q = this.numXfrm(this.intValue(digits, this.num_base), p);
                p = q;
              }
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 308: {
              p = pc;
              this.num_xfrm = XF_imaginary_float;
              this.te = p;
              p = p - 1;
              digits = this.tok2(this.ts, this.num_suffix_s);
              if (false) {
                this.emit4(TK_tFLOAT, digits, this.ts, this.num_suffix_s);
                q = rbPos(this.num_suffix_s);
                p = q - 1;
              } else {
                q = this.numXfrm(digits, p);
                p = q;
              }
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 309: {
              p = pc;
              this.num_xfrm = XF_float_if;
              this.te = p;
              p = p - 1;
              digits = this.tok2(this.ts, this.num_suffix_s);
              if (false) {
                this.emit4(TK_tFLOAT, digits, this.ts, this.num_suffix_s);
                q = rbPos(this.num_suffix_s);
                p = q - 1;
              } else {
                q = this.numXfrm(digits, p);
                p = q;
              }
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 310: {
              p = pc;
              this.num_xfrm = XF_rational;
              this.te = p;
              p = p - 1;
              digits = this.tok2(this.ts, this.num_suffix_s);
              if (false) {
                this.emit4(TK_tFLOAT, digits, this.ts, this.num_suffix_s);
                q = rbPos(this.num_suffix_s);
                p = q - 1;
              } else {
                q = this.numXfrm(digits, p);
                p = q;
              }
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 312: {
              p = pc;
              this.num_xfrm = XF_imaginary_rational;
              this.te = p;
              p = p - 1;
              digits = this.tok2(this.ts, this.num_suffix_s);
              if (false) {
                this.emit4(TK_tFLOAT, digits, this.ts, this.num_suffix_s);
                q = rbPos(this.num_suffix_s);
                p = q - 1;
              } else {
                q = this.numXfrm(digits, p);
                p = q;
              }
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 311: {
              p = pc;
              this.num_xfrm = XF_float_rescue;
              this.te = p;
              p = p - 1;
              digits = this.tok2(this.ts, this.num_suffix_s);
              if (false) {
                this.emit4(TK_tFLOAT, digits, this.ts, this.num_suffix_s);
                q = rbPos(this.num_suffix_s);
                p = q - 1;
              } else {
                q = this.numXfrm(digits, p);
                p = q;
              }
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 147: {
              p = pc;
              this.e_lbrace();
              this.te = p;
              p = p - 1;
              if (this.lambdaLast() === this.paren_nest) {
                this.nLambda = sub32(this.nLambda, 1);
                this.emit4(TK_tLAMBEG, "{", rbPos(this.te) - 1, this.te);
              } else {
                this.emit4(TK_tLCURLY, "{", rbPos(this.te) - 1, this.te);
              }
              this.command_start = true;
              this.paren_nest = add32(this.paren_nest, 1);
              this.cs = 508;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 169: {
              p = pc;
              this.e_lbrace();
              this.te = p;
              p = p - 1;
              if (this.lambdaLast() === this.paren_nest) {
                this.nLambda = sub32(this.nLambda, 1);
                this.emit2(TK_tLAMBEG, "{");
              } else {
                this.emit2(TK_tLBRACE_ARG, "{");
              }
              this.paren_nest = add32(this.paren_nest, 1);
              this.command_start = true;
              this.cs = 508;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 245: {
              p = pc;
              this.e_lbrace();
              this.te = p;
              p = p - 1;
              if (this.lambdaLast() === this.paren_nest) {
                this.nLambda = sub32(this.nLambda, 1);
                this.command_start = true;
                this.emit2(TK_tLAMBEG, "{");
              } else {
                this.emit2(TK_tLBRACE, "{");
              }
              this.paren_nest = add32(this.paren_nest, 1);
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 360: {
              p = pc;
              this.e_lbrace();
              this.te = p;
              p = p - 1;
              if (this.lambdaLast() === this.paren_nest) {
                this.nLambda = sub32(this.nLambda, 1);
                if (this.tokIs(this.ts, this.te, "{")) {
                  this.emit2(TK_tLAMBEG, "{");
                } else {
                  this.emit2(TK_kDO_LAMBDA, "do");
                }
              } else {
                if (this.tokIs(this.ts, this.te, "{")) {
                  this.emit2(TK_tLCURLY, "{");
                } else {
                  this.emit_do(false);
                }
              }
              if (this.tokIs(this.ts, this.te, "{")) {
                this.paren_nest = add32(this.paren_nest, 1);
              }
              this.command_start = true;
              this.cs = 508;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 361: {
              p = pc;
              if (this.st().closeInterp(p)) {
                p = p - 1;
                this.cs = 128;
                p += 1;
                _goto_level = _out;
                continue;
              }
              this.paren_nest = sub32(this.paren_nest, 1);
              this.te = p;
              p = p - 1;
              this.emit_rbrace_rparen_rbrack();
              if (this.tokIs(this.ts, this.te, "}") || this.tokIs(this.ts, this.te, "]")) {
                if (true) {
                  this.cs = 516;
                } else {
                  this.cs = 313;
                }
              } else {
              }
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 43: {
              p = pc;
              q = this.on_newline(p);
              p = q;
              this.newline_s = p;
              break;
            }
            case 16: {
              p = pc;
              q = this.on_newline(p);
              p = q;
              tm = p;
              break;
            }
            case 18: {
              p = pc;
              q = this.on_newline(p);
              p = q;
              tm = p;
              break;
            }
            case 20: {
              p = pc;
              q = this.on_newline(p);
              p = q;
              tm = p;
              break;
            }
            case 98: {
              p = pc;
              q = this.on_newline(p);
              p = q;
              this.te = p;
              p = p - 1;
              break;
            }
            case 117: {
              p = pc;
              q = this.on_newline(p);
              p = q;
              this.te = p;
              p = p - 1;
              break;
            }
            case 125: {
              p = pc;
              q = this.on_newline(p);
              p = q;
              this.te = p;
              p = p - 1;
              break;
            }
            case 19: {
              p = pc;
              q = this.on_newline(p);
              p = q;
              this.te = p + 1;
              q = rbPos(this.ts);
              p = q - 1;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 156: {
              p = pc;
              q = this.on_newline(p);
              p = q;
              this.te = p;
              p = p - 1;
              break;
            }
            case 148: {
              p = pc;
              q = this.on_newline(p);
              p = q;
              this.te = p;
              p = p - 2;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 167: {
              p = pc;
              q = this.on_newline(p);
              p = q;
              this.te = p;
              p = p - 1;
              break;
            }
            case 179: {
              p = pc;
              q = this.on_newline(p);
              p = q;
              this.te = p;
              p = p - 1;
              break;
            }
            case 175: {
              p = pc;
              q = this.on_newline(p);
              p = q;
              this.te = p;
              p = p - 2;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 44: {
              p = pc;
              q = this.on_newline(p);
              p = q;
              this.te = p + 1;
              this.emit4(TK_tUNARY_NUM, this.tok2(this.ts, rbPos(this.ts) + 1), this.ts, rbPos(this.ts) + 1);
              p = p - 1;
              this.cs = 516;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 35: {
              p = pc;
              q = this.on_newline(p);
              p = q;
              this.te = p + 1;
              this.emit4(TK_tIDENTIFIER, ident_tok, ident_ts, ident_te);
              q = rbPos(ident_te);
              p = q - 1;
              if (this.declared(ident_tok) && false) {
                this.cs = 247;
              } else {
                this.cs = 307;
              }
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 198: {
              p = pc;
              q = this.on_newline(p);
              p = q;
              this.te = p;
              p = p - 1;
              break;
            }
            case 254: {
              p = pc;
              q = this.on_newline(p);
              p = q;
              this.te = p;
              p = p - 1;
              break;
            }
            case 250: {
              p = pc;
              q = this.on_newline(p);
              p = q;
              this.te = p;
              p = p - 1;
              if (this.ctx.in_kwarg) {
                p = q - 2;
                this.cs = 516;
                _goto_level = _again;
                continue;
              } else {
                this.cs = 710;
                _goto_level = _again;
                continue;
              }
            }
            case 263: {
              p = pc;
              q = this.on_newline(p);
              p = q;
              this.te = p;
              p = p - 1;
              break;
            }
            case 260: {
              p = pc;
              q = this.on_newline(p);
              p = q;
              this.te = p;
              p = p - 1;
              this.cs = 710;
              _goto_level = _again;
              continue;
            }
            case 347: {
              p = pc;
              q = this.on_newline(p);
              p = q;
              this.te = p;
              p = p - 1;
              break;
            }
            case 279: {
              p = pc;
              q = this.on_newline(p);
              p = q;
              this.te = p;
              p = p - 1;
              this.cs = 696;
              _goto_level = _again;
              continue;
            }
            case 376: {
              p = pc;
              q = this.on_newline(p);
              p = q;
              this.te = p;
              p = p - 1;
              break;
            }
            case 46: {
              p = pc;
              this.sharp_s = p - 1;
              this.emit_comment_from_range(p, pe);
              break;
            }
            case 50: {
              p = pc;
              this.emit_comment_from_range(p, pe);
              this.newline_s = p;
              break;
            }
            case 101: {
              p = pc;
              this.emit_comment_from_range(p, pe);
              this.te = p;
              p = p - 1;
              break;
            }
            case 116: {
              p = pc;
              this.emit_comment_from_range(p, pe);
              this.te = p;
              p = p - 1;
              break;
            }
            case 128: {
              p = pc;
              this.emit_comment_from_range(p, pe);
              this.te = p;
              p = p - 1;
              break;
            }
            case 150: {
              p = pc;
              this.emit_comment_from_range(p, pe);
              this.te = p;
              p = p - 1;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 165: {
              p = pc;
              this.emit_comment_from_range(p, pe);
              this.te = p;
              p = p - 1;
              break;
            }
            case 177: {
              p = pc;
              this.emit_comment_from_range(p, pe);
              this.te = p;
              p = p - 1;
              break;
            }
            case 204: {
              p = pc;
              this.emit_comment_from_range(p, pe);
              this.te = p;
              p = p - 1;
              break;
            }
            case 252: {
              p = pc;
              this.emit_comment_from_range(p, pe);
              this.te = p;
              p = p - 1;
              break;
            }
            case 262: {
              p = pc;
              this.emit_comment_from_range(p, pe);
              this.te = p;
              p = p - 1;
              break;
            }
            case 283: {
              p = pc;
              this.emit_comment_from_range(p, pe);
              this.te = p;
              p = p - 1;
              break;
            }
            case 378: {
              p = pc;
              this.emit_comment_from_range(p, pe);
              this.te = p;
              p = p - 1;
              break;
            }
            case 122: {
              p = pc;
              tm = p;
              this.te = p;
              p = p - 1;
              this.emit4(TK_tFID, this.tok2(this.ts, tm), this.ts, tm);
              this.cs = this.arg_or_cmdarg(cmd_state);
              q = rbPos(tm);
              p = q - 1;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 218: {
              p = pc;
              tm = p;
              this.te = p;
              p = p - 1;
              this.emit4(TK_tSYMBOL, this.tok2(rbPos(this.ts) + 1, tm), this.ts, tm);
              q = rbPos(tm);
              p = q - 1;
              this.cs = 516;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 189: {
              p = pc;
              tm = p;
              this.te = p;
              p = p - 1;
              q = rbPos(this.ts);
              p = q - 1;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 276: {
              p = pc;
              tm = p;
              switch (this.act) {
                case 104: {
                  q = rbPos(this.te);
                  p = q - 1;
                  if (this.lambdaLast() === this.paren_nest) {
                    this.nLambda = sub32(this.nLambda, 1);
                    if (this.tokIs(this.ts, this.te, "{")) {
                      this.emit2(TK_tLAMBEG, "{");
                    } else {
                      this.emit2(TK_kDO_LAMBDA, "do");
                    }
                  } else {
                    if (this.tokIs(this.ts, this.te, "{")) {
                      this.emit2(TK_tLCURLY, "{");
                    } else {
                      this.emit_do(false);
                    }
                  }
                  if (this.tokIs(this.ts, this.te, "{")) {
                    this.paren_nest = add32(this.paren_nest, 1);
                  }
                  this.command_start = true;
                  this.cs = 508;
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 105: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit_table(3);
                  this.cs = 134;
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 106: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit_singleton_class();
                  this.cs = 508;
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 107: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit_table(3);
                  this.cs = 345;
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 108: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit_table(3);
                  this.command_start = true;
                  this.cs = 508;
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 109: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit_table(3);
                  this.cs = 321;
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 110: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit_table(3);
                  if (false && this.tokIs(this.ts, this.te, "!")) {
                    this.cs = 345;
                    p += 1;
                    _goto_level = _out;
                    continue;
                  } else {
                    this.cs = 276;
                    p += 1;
                    _goto_level = _out;
                    continue;
                  }
                }
                case 111: {
                  q = rbPos(this.te);
                  p = q - 1;
                  if (false) {
                    this.emit1(TK_tIDENTIFIER);
                    if (!this.declared(this.tok2(this.ts, this.te))) {
                      this.cs = this.arg_or_cmdarg(cmd_state);
                    }
                  } else {
                    this.emit2(TK_k__ENCODING__, "__ENCODING__");
                  }
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 112: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit_table(3);
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 113: {
                  q = rbPos(this.te);
                  p = q - 1;
                  digits = this.numeric_literal_int();
                  if (false) {
                    this.emit4(TK_tINTEGER, this.intValue(digits, this.num_base), this.ts, this.num_suffix_s);
                    q = rbPos(this.num_suffix_s);
                    p = q - 1;
                  } else {
                    q = this.numXfrm(this.intValue(digits, this.num_base), p);
                    p = q;
                  }
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 115: {
                  q = rbPos(this.te);
                  p = q - 1;
                  if (false) {
                    this.diagError();
                  } else {
                    this.emit4(
                      TK_tINTEGER,
                      this.intValue(this.tok2(this.ts, rbPos(this.te) - 1), 10),
                      this.ts,
                      rbPos(this.te) - 1,
                    );
                    p = q - 2;
                    p += 1;
                    _goto_level = _out;
                    continue;
                  }
                  break;
                }
                case 116: {
                  q = rbPos(this.te);
                  p = q - 1;
                  if (false) {
                    this.diagError();
                  } else {
                    this.emit4(TK_tFLOAT, this.tok2(this.ts, rbPos(this.te) - 1), this.ts, rbPos(this.te) - 1);
                    p = q - 2;
                    p += 1;
                    _goto_level = _out;
                    continue;
                  }
                  break;
                }
                case 117: {
                  q = rbPos(this.te);
                  p = q - 1;
                  digits = this.tok2(this.ts, this.num_suffix_s);
                  if (false) {
                    this.emit4(TK_tFLOAT, digits, this.ts, this.num_suffix_s);
                    q = rbPos(this.num_suffix_s);
                    p = q - 1;
                  } else {
                    q = this.numXfrm(digits, p);
                    p = q;
                  }
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 119: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit1(TK_tCONSTANT);
                  this.cs = this.arg_or_cmdarg(cmd_state);
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 123: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit1(TK_tIDENTIFIER);
                  if (this.declared(this.tok2(this.ts, this.te))) {
                    this.cs = 247;
                    p += 1;
                    _goto_level = _out;
                    continue;
                  } else if (true && rbIsNumberedParam(this.tok2(this.ts, this.te))) {
                    this.cs = 247;
                    p += 1;
                    _goto_level = _out;
                    continue;
                  } else {
                    this.cs = this.arg_or_cmdarg(cmd_state);
                    p += 1;
                    _goto_level = _out;
                    continue;
                  }
                }
                case 124: {
                  q = rbPos(this.te);
                  p = q - 1;
                  if (tm === this.te) {
                    this.emit1(TK_tFID);
                  } else {
                    this.emit4(TK_tIDENTIFIER, this.tok2(this.ts, tm), this.ts, tm);
                    q = rbPos(tm);
                    p = q - 1;
                  }
                  this.cs = 276;
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 126: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit_table(1);
                  this.cs = 508;
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 127: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit_table(1);
                  this.cs = 345;
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
              }
              break;
            }
            case 123: {
              p = pc;
              tm = p - 2;
              this.te = p;
              p = p - 1;
              this.emit4(TK_tFID, this.tok2(this.ts, tm), this.ts, tm);
              this.cs = this.arg_or_cmdarg(cmd_state);
              q = rbPos(tm);
              p = q - 1;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 219: {
              p = pc;
              tm = p - 2;
              this.te = p;
              p = p - 1;
              this.emit4(TK_tSYMBOL, this.tok2(rbPos(this.ts) + 1, tm), this.ts, tm);
              q = rbPos(tm);
              p = q - 1;
              this.cs = 516;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 191: {
              p = pc;
              tm = p - 2;
              this.te = p;
              p = p - 1;
              q = rbPos(this.ts);
              p = q - 1;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 277: {
              p = pc;
              tm = p - 2;
              this.te = p;
              p = p - 1;
              if (tm === this.te) {
                this.emit1(TK_tFID);
              } else {
                this.emit4(TK_tIDENTIFIER, this.tok2(this.ts, tm), this.ts, tm);
                q = rbPos(tm);
                p = q - 1;
              }
              this.cs = 276;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 220: {
              p = pc;
              tm = p;
              this.te = p;
              p = p - 1;
              this.emit4(TK_tSYMBOL, this.tok2(rbPos(this.ts) + 1, tm), this.ts, tm);
              q = rbPos(tm);
              p = q - 1;
              this.cs = 516;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 192: {
              p = pc;
              tm = p;
              this.te = p;
              p = p - 1;
              q = rbPos(this.ts);
              p = q - 1;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 221: {
              p = pc;
              tm = p - 2;
              this.te = p;
              p = p - 1;
              this.emit4(TK_tSYMBOL, this.tok2(rbPos(this.ts) + 1, tm), this.ts, tm);
              q = rbPos(tm);
              p = q - 1;
              this.cs = 516;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 193: {
              p = pc;
              tm = p - 2;
              this.te = p;
              p = p - 1;
              q = rbPos(this.ts);
              p = q - 1;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 225: {
              p = pc;
              tm = p - 2;
              this.te = p;
              p = p - 1;
              this.emit4(TK_tSYMBOL, this.tok2(rbPos(this.ts) + 1, tm), this.ts, tm);
              q = rbPos(tm);
              p = q - 1;
              this.cs = 516;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 196: {
              p = pc;
              tm = p - 2;
              this.te = p;
              p = p - 1;
              q = rbPos(this.ts);
              p = q - 1;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 224: {
              p = pc;
              tm = p - 2;
              this.te = p;
              p = p - 1;
              this.emit4(TK_tSYMBOL, this.tok2(rbPos(this.ts) + 1, tm), this.ts, tm);
              q = rbPos(tm);
              p = q - 1;
              this.cs = 516;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 195: {
              p = pc;
              tm = p - 2;
              switch (this.act) {
                case 60: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit4(TK_tUNARY_NUM, this.tok2(this.ts, rbPos(this.ts) + 1), this.ts, rbPos(this.ts) + 1);
                  p = q - 2;
                  this.cs = 516;
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 67: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.diagError();
                  break;
                }
                case 76: {
                  q = rbPos(this.te);
                  p = q - 1;
                  if (true) {
                    this.emit4(TK_tPIPE, this.tok2(this.ts, rbPos(this.ts) + 1), this.ts, rbPos(this.ts) + 1);
                    p = q - 2;
                    this.cs = 345;
                    p += 1;
                    _goto_level = _out;
                    continue;
                  } else {
                    p = q - 3;
                    this.cs = 516;
                    _goto_level = _again;
                    continue;
                  }
                }
                case 80: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit_table(2);
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 81: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit4(TK_kRESCUE, "rescue", this.ts, tm);
                  q = rbPos(tm);
                  p = q - 1;
                  this.cs = 321;
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 82: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit_table(4);
                  this.command_start = true;
                  this.cs = 508;
                  p += 1;
                  _goto_level = _out;
                  continue;
                }
                case 86: {
                  q = rbPos(this.te);
                  p = q - 1;
                  q = rbPos(this.ts);
                  p = q - 1;
                  this.cs = 516;
                  _goto_level = _again;
                  continue;
                }
                case 87: {
                  q = rbPos(this.te);
                  p = q - 1;
                  this.emit1(TK_tIDENTIFIER);
                  if (this.declared(this.tok2(this.ts, this.te))) {
                    this.cs = 247;
                    p += 1;
                    _goto_level = _out;
                    continue;
                  } else if (true && rbIsNumberedParam(this.tok2(this.ts, this.te))) {
                    this.cs = 247;
                    p += 1;
                    _goto_level = _out;
                    continue;
                  } else {
                    this.cs = this.arg_or_cmdarg(cmd_state);
                    p += 1;
                    _goto_level = _out;
                    continue;
                  }
                }
                case 91: {
                  q = rbPos(this.te);
                  p = q - 1;
                  q = rbPos(this.ts);
                  p = q - 1;
                  this.cs = 516;
                  _goto_level = _again;
                  continue;
                }
              }
              break;
            }
            case 222: {
              p = pc;
              tm = p - 3;
              this.te = p;
              p = p - 1;
              this.emit4(TK_tSYMBOL, this.tok2(rbPos(this.ts) + 1, tm), this.ts, tm);
              q = rbPos(tm);
              p = q - 1;
              this.cs = 516;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 194: {
              p = pc;
              tm = p - 3;
              this.te = p;
              p = p - 1;
              q = rbPos(this.ts);
              p = q - 1;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 223: {
              p = pc;
              tm = p - 2;
              this.te = p;
              p = p - 1;
              this.emit4(TK_tSYMBOL, this.tok2(rbPos(this.ts) + 1, tm), this.ts, tm);
              q = rbPos(tm);
              p = q - 1;
              this.cs = 516;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 342: {
              p = pc;
              tm = p - 2;
              this.te = p;
              p = p - 1;
              this.emit4(TK_tCONSTANT, this.tok2(this.ts, tm), this.ts, tm);
              q = rbPos(tm);
              p = q - 1;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 146: {
              p = pc;
              this.cond.push(false);
              this.cmdarg.push(false);
              this.paren_nest = add32(this.paren_nest, 1);
              this.te = p;
              p = p - 1;
              this.emit4(TK_tLBRACK, "[", rbPos(this.te) - 1, this.te);
              this.cs = 345;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 238: {
              p = pc;
              this.cond.push(false);
              this.cmdarg.push(false);
              this.paren_nest = add32(this.paren_nest, 1);
              this.te = p;
              p = p - 1;
              this.emit2(TK_tLBRACK, "[");
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 345: {
              p = pc;
              this.cond.push(false);
              this.cmdarg.push(false);
              this.paren_nest = add32(this.paren_nest, 1);
              this.te = p;
              p = p - 1;
              this.emit2(TK_tLBRACK2, "[");
              this.cs = 345;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 348: {
              p = pc;
              this.paren_nest = sub32(this.paren_nest, 1);
              this.te = p;
              p = p - 1;
              this.emit_rbrace_rparen_rbrack();
              if (this.tokIs(this.ts, this.te, "}") || this.tokIs(this.ts, this.te, "]")) {
                if (true) {
                  this.cs = 516;
                } else {
                  this.cs = 313;
                }
              } else {
              }
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 138: {
              p = pc;
              this.cond.push(false);
              this.cmdarg.push(false);
              this.paren_nest = add32(this.paren_nest, 1);
              if (false) {
                this.command_start = true;
              }
              this.te = p;
              p = p - 1;
              if (false) {
                this.emit4(TK_tLPAREN2, "(", rbPos(this.te) - 1, this.te);
                this.cs = 508;
                p += 1;
                _goto_level = _out;
                continue;
              } else {
                this.emit4(TK_tLPAREN_ARG, "(", rbPos(this.te) - 1, this.te);
                this.cs = 345;
                p += 1;
                _goto_level = _out;
                continue;
              }
            }
            case 151: {
              p = pc;
              this.cond.push(false);
              this.cmdarg.push(false);
              this.paren_nest = add32(this.paren_nest, 1);
              if (false) {
                this.command_start = true;
              }
              this.te = p;
              p = p - 1;
              this.emit2(TK_tLPAREN2, "(");
              this.cs = 345;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 159: {
              p = pc;
              this.cond.push(false);
              this.cmdarg.push(false);
              this.paren_nest = add32(this.paren_nest, 1);
              if (false) {
                this.command_start = true;
              }
              this.te = p;
              p = p - 1;
              this.emit4(TK_tLPAREN_ARG, "(", rbPos(this.te) - 1, this.te);
              if (false) {
                this.cs = 508;
                p += 1;
                _goto_level = _out;
                continue;
              } else {
                this.cs = 345;
                p += 1;
                _goto_level = _out;
                continue;
              }
            }
            case 208: {
              p = pc;
              this.cond.push(false);
              this.cmdarg.push(false);
              this.paren_nest = add32(this.paren_nest, 1);
              if (false) {
                this.command_start = true;
              }
              this.te = p;
              p = p - 1;
              this.emit2(TK_tLPAREN, "(");
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 289: {
              p = pc;
              this.cond.push(false);
              this.cmdarg.push(false);
              this.paren_nest = add32(this.paren_nest, 1);
              if (false) {
                this.command_start = true;
              }
              this.te = p;
              p = p - 1;
              this.emit_table(1);
              this.cs = 345;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 290: {
              p = pc;
              this.paren_nest = sub32(this.paren_nest, 1);
              this.te = p;
              p = p - 1;
              this.emit_rbrace_rparen_rbrack();
              if (this.tokIs(this.ts, this.te, "}") || this.tokIs(this.ts, this.te, "]")) {
                if (true) {
                  this.cs = 516;
                } else {
                  this.cs = 313;
                }
              } else {
              }
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 57: {
              p = pc;
              heredoc_e = p;
              this.newline_s = p;
              break;
            }
            case 233: {
              p = pc;
              new_herebody_s = p;
              this.te = p;
              p = p - 1;
              {
                const hd = rbHeredocOpener(this.tok2(this.ts, heredoc_e));
                indent = hd.indent;
                dedent_body = hd.dedent;
                type = hd.type;
                delimiter = hd.delimiter;
              }

              if (true) {
                if (delimiter.indexOf("\n") >= 0 || delimiter.indexOf("\r") >= 0) {
                  this.diagError();
                }
              } else if (true) {
                if (delimiter.indexOf("\n") >= 0) {
                  if (delimiter.endsWith("\n")) {
                    /* warning */
                    delimiter = rbRstrip(delimiter);
                  } else {
                    this.diagFatal();
                  }
                }
              }
              if (dedent_body && false) {
                this.emit4(TK_tLSHFT, "<<", this.ts, rbPos(this.ts) + 2);
                q = rbPos(this.ts);
                p = q + 1;
                this.cs = 345;
                p += 1;
                _goto_level = _out;
                continue;
              } else {
                this.st().pushLiteralFull(type, delimiter, this.ts, heredoc_e, indent, dedent_body);
                if (this.st().herebody_s < 0) {
                  this.st().herebody_s = new_herebody_s;
                }
                q = rbPos(this.st().herebody_s);
                p = q - 1;
                this.cs = 128;
              }
              break;
            }
            case 228: {
              p = pc;
              tm = p - 1;
              this.te = p;
              p = p - 1;
              this.emit_colon_with_digits(p, tm);
              this.cs = 516;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 231: {
              p = pc;
              tm = p - 2;
              this.te = p;
              p = p - 1;
              this.emit_colon_with_digits(p, tm);
              this.cs = 516;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 241: {
              p = pc;
              tm = p;
              this.te = p;
              p = p - 1;
              this.emit4(TK_kRESCUE, "rescue", this.ts, tm);
              q = rbPos(tm);
              p = q - 1;
              this.cs = 321;
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 332: {
              p = pc;
              this.num_base = 16;
              this.num_digits_s = p;
              this.num_suffix_s = p;
              break;
            }
            case 326: {
              p = pc;
              this.num_base = 10;
              this.num_digits_s = p;
              this.num_suffix_s = p;
              break;
            }
            case 329: {
              p = pc;
              this.num_base = 8;
              this.num_digits_s = p;
              this.num_suffix_s = p;
              break;
            }
            case 323: {
              p = pc;
              this.num_base = 2;
              this.num_digits_s = p;
              this.num_suffix_s = p;
              break;
            }
            case 338: {
              p = pc;
              this.num_base = 10;
              this.num_digits_s = this.ts;
              this.num_suffix_s = p;
              break;
            }
            case 301: {
              p = pc;
              this.num_base = 8;
              this.num_digits_s = this.ts;
              this.num_suffix_s = p;
              break;
            }
            case 339: {
              p = pc;
              this.num_suffix_s = p;
              this.num_xfrm = XF_integer;
              break;
            }
            case 184: {
              p = pc;
              this.te = p + 1;
              this.newline_s = p;
              break;
            }
            case 305: {
              p = pc;
              this.te = p + 1;
              this.num_suffix_s = p;
              break;
            }
            case 107: {
              p = pc;
              this.te = p + 1;
              this.act = 4;
              break;
            }
            case 94: {
              p = pc;
              this.te = p + 1;
              this.act = 5;
              break;
            }
            case 90: {
              p = pc;
              this.te = p + 1;
              this.act = 6;
              break;
            }
            case 12: {
              p = pc;
              this.te = p + 1;
              this.act = 33;
              break;
            }
            case 140: {
              p = pc;
              this.te = p + 1;
              this.act = 34;
              break;
            }
            case 13: {
              p = pc;
              this.te = p + 1;
              this.act = 39;
              break;
            }
            case 133: {
              p = pc;
              this.te = p + 1;
              this.act = 40;
              break;
            }
            case 160: {
              p = pc;
              this.te = p + 1;
              this.act = 46;
              break;
            }
            case 31: {
              p = pc;
              this.te = p + 1;
              this.act = 47;
              break;
            }
            case 181: {
              p = pc;
              this.te = p + 1;
              this.act = 54;
              break;
            }
            case 170: {
              p = pc;
              this.te = p + 1;
              this.act = 55;
              break;
            }
            case 55: {
              p = pc;
              this.te = p + 1;
              this.act = 67;
              break;
            }
            case 246: {
              p = pc;
              this.te = p + 1;
              this.act = 76;
              break;
            }
            case 185: {
              p = pc;
              this.te = p + 1;
              this.act = 80;
              break;
            }
            case 240: {
              p = pc;
              this.te = p + 1;
              this.act = 81;
              break;
            }
            case 239: {
              p = pc;
              this.te = p + 1;
              this.act = 82;
              break;
            }
            case 59: {
              p = pc;
              this.te = p + 1;
              this.act = 86;
              break;
            }
            case 182: {
              p = pc;
              this.te = p + 1;
              this.act = 87;
              break;
            }
            case 186: {
              p = pc;
              this.te = p + 1;
              this.act = 91;
              break;
            }
            case 356: {
              p = pc;
              this.te = p + 1;
              this.act = 104;
              break;
            }
            case 351: {
              p = pc;
              this.te = p + 1;
              this.act = 105;
              break;
            }
            case 359: {
              p = pc;
              this.te = p + 1;
              this.act = 107;
              break;
            }
            case 352: {
              p = pc;
              this.te = p + 1;
              this.act = 108;
              break;
            }
            case 353: {
              p = pc;
              this.te = p + 1;
              this.act = 109;
              break;
            }
            case 358: {
              p = pc;
              this.te = p + 1;
              this.act = 110;
              break;
            }
            case 350: {
              p = pc;
              this.te = p + 1;
              this.act = 111;
              break;
            }
            case 344: {
              p = pc;
              this.te = p + 1;
              this.act = 112;
              break;
            }
            case 270: {
              p = pc;
              this.te = p + 1;
              this.act = 113;
              break;
            }
            case 303: {
              p = pc;
              this.te = p + 1;
              this.act = 116;
              break;
            }
            case 67: {
              p = pc;
              this.te = p + 1;
              this.act = 117;
              break;
            }
            case 273: {
              p = pc;
              this.te = p + 1;
              this.act = 119;
              break;
            }
            case 264: {
              p = pc;
              this.te = p + 1;
              this.act = 123;
              break;
            }
            case 275: {
              p = pc;
              this.te = p + 1;
              this.act = 124;
              break;
            }
            case 268: {
              p = pc;
              this.te = p + 1;
              this.act = 126;
              break;
            }
            case 274: {
              p = pc;
              this.te = p + 1;
              this.act = 127;
              break;
            }
            case 73: {
              p = pc;
              this.te = p + 1;
              this.act = 140;
              break;
            }
            case 363: {
              p = pc;
              this.te = p + 1;
              this.act = 144;
              break;
            }
            case 47: {
              p = pc;
              this.sharp_s = p - 1;
              this.emit_comment_from_range(p, pe);
              this.newline_s = p;
              break;
            }
            case 100: {
              p = pc;
              this.sharp_s = p - 1;
              this.emit_comment_from_range(p, pe);
              this.te = p;
              p = p - 1;
              break;
            }
            case 115: {
              p = pc;
              this.sharp_s = p - 1;
              this.emit_comment_from_range(p, pe);
              this.te = p;
              p = p - 1;
              break;
            }
            case 127: {
              p = pc;
              this.sharp_s = p - 1;
              this.emit_comment_from_range(p, pe);
              this.te = p;
              p = p - 1;
              break;
            }
            case 149: {
              p = pc;
              this.sharp_s = p - 1;
              this.emit_comment_from_range(p, pe);
              this.te = p;
              p = p - 1;
              this.cs = 516;
              _goto_level = _again;
              continue;
            }
            case 164: {
              p = pc;
              this.sharp_s = p - 1;
              this.emit_comment_from_range(p, pe);
              this.te = p;
              p = p - 1;
              break;
            }
            case 176: {
              p = pc;
              this.sharp_s = p - 1;
              this.emit_comment_from_range(p, pe);
              this.te = p;
              p = p - 1;
              break;
            }
            case 203: {
              p = pc;
              this.sharp_s = p - 1;
              this.emit_comment_from_range(p, pe);
              this.te = p;
              p = p - 1;
              break;
            }
            case 251: {
              p = pc;
              this.sharp_s = p - 1;
              this.emit_comment_from_range(p, pe);
              this.te = p;
              p = p - 1;
              break;
            }
            case 261: {
              p = pc;
              this.sharp_s = p - 1;
              this.emit_comment_from_range(p, pe);
              this.te = p;
              p = p - 1;
              break;
            }
            case 282: {
              p = pc;
              this.sharp_s = p - 1;
              this.emit_comment_from_range(p, pe);
              this.te = p;
              p = p - 1;
              break;
            }
            case 377: {
              p = pc;
              this.sharp_s = p - 1;
              this.emit_comment_from_range(p, pe);
              this.te = p;
              p = p - 1;
              break;
            }
            case 334: {
              p = pc;
              this.num_base = 10;
              this.num_digits_s = this.ts;
              this.num_suffix_s = p;
              this.num_xfrm = XF_integer;
              break;
            }
            case 298: {
              p = pc;
              this.num_base = 8;
              this.num_digits_s = this.ts;
              this.num_suffix_s = p;
              this.num_xfrm = XF_integer;
              break;
            }
            case 313: {
              p = pc;
              this.num_suffix_s = p;
              this.num_xfrm = XF_integer;
              this.te = p;
              p = p - 1;
              digits = this.numeric_literal_int();
              if (false) {
                this.emit4(TK_tINTEGER, this.intValue(digits, this.num_base), this.ts, this.num_suffix_s);
                q = rbPos(this.num_suffix_s);
                p = q - 1;
              } else {
                q = this.numXfrm(this.intValue(digits, this.num_base), p);
                p = q;
              }
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 306: {
              p = pc;
              this.num_suffix_s = p;
              this.num_xfrm = XF_float;
              this.te = p;
              p = p - 1;
              digits = this.tok2(this.ts, this.num_suffix_s);
              if (false) {
                this.emit4(TK_tFLOAT, digits, this.ts, this.num_suffix_s);
                q = rbPos(this.num_suffix_s);
                p = q - 1;
              } else {
                q = this.numXfrm(digits, p);
                p = q;
              }
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 302: {
              p = pc;
              this.num_suffix_s = p;
              this.num_xfrm = XF_float;
              this.te = p;
              p = p - 1;
              digits = this.tok2(this.ts, this.num_suffix_s);
              if (false) {
                this.emit4(TK_tFLOAT, digits, this.ts, this.num_suffix_s);
                q = rbPos(this.num_suffix_s);
                p = q - 1;
              } else {
                q = this.numXfrm(digits, p);
                p = q;
              }
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 155: {
              p = pc;
              this.te = p + 1;
              this.newline_s = p;
              this.act = 40;
              break;
            }
            case 21: {
              p = pc;
              this.te = p + 1;
              q = this.on_newline(p);
              p = q;
              this.act = 39;
              break;
            }
            case 32: {
              p = pc;
              this.te = p + 1;
              q = this.on_newline(p);
              p = q;
              this.act = 47;
              break;
            }
            case 79: {
              p = pc;
              this.te = p + 1;
              q = this.on_newline(p);
              p = q;
              this.act = 140;
              break;
            }
            case 51: {
              p = pc;
              this.te = p + 1;
              this.emit_comment_from_range(p, pe);
              this.act = 60;
              break;
            }
            case 70: {
              p = pc;
              this.te = p + 1;
              this.emit_comment_from_range(p, pe);
              this.act = 106;
              break;
            }
            case 78: {
              p = pc;
              this.te = p + 1;
              this.emit_comment_from_range(p, pe);
              this.act = 140;
              break;
            }
            case 23: {
              p = pc;
              this.te = p + 1;
              tm = p;
              this.act = 34;
              break;
            }
            case 243: {
              p = pc;
              this.te = p + 1;
              tm = p;
              this.act = 86;
              break;
            }
            case 242: {
              p = pc;
              this.te = p + 1;
              tm = p;
              this.act = 87;
              break;
            }
            case 335: {
              p = pc;
              this.te = p + 1;
              this.num_base = 10;
              this.num_digits_s = this.ts;
              this.act = 113;
              break;
            }
            case 330: {
              p = pc;
              this.num_base = 16;
              this.num_digits_s = p;
              this.num_suffix_s = p;
              this.num_xfrm = XF_integer;
              this.te = p;
              p = p - 1;
              digits = this.numeric_literal_int();
              if (false) {
                this.emit4(TK_tINTEGER, this.intValue(digits, this.num_base), this.ts, this.num_suffix_s);
                q = rbPos(this.num_suffix_s);
                p = q - 1;
              } else {
                q = this.numXfrm(this.intValue(digits, this.num_base), p);
                p = q;
              }
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 324: {
              p = pc;
              this.num_base = 10;
              this.num_digits_s = p;
              this.num_suffix_s = p;
              this.num_xfrm = XF_integer;
              this.te = p;
              p = p - 1;
              digits = this.numeric_literal_int();
              if (false) {
                this.emit4(TK_tINTEGER, this.intValue(digits, this.num_base), this.ts, this.num_suffix_s);
                q = rbPos(this.num_suffix_s);
                p = q - 1;
              } else {
                q = this.numXfrm(this.intValue(digits, this.num_base), p);
                p = q;
              }
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 327: {
              p = pc;
              this.num_base = 8;
              this.num_digits_s = p;
              this.num_suffix_s = p;
              this.num_xfrm = XF_integer;
              this.te = p;
              p = p - 1;
              digits = this.numeric_literal_int();
              if (false) {
                this.emit4(TK_tINTEGER, this.intValue(digits, this.num_base), this.ts, this.num_suffix_s);
                q = rbPos(this.num_suffix_s);
                p = q - 1;
              } else {
                q = this.numXfrm(this.intValue(digits, this.num_base), p);
                p = q;
              }
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 321: {
              p = pc;
              this.num_base = 2;
              this.num_digits_s = p;
              this.num_suffix_s = p;
              this.num_xfrm = XF_integer;
              this.te = p;
              p = p - 1;
              digits = this.numeric_literal_int();
              if (false) {
                this.emit4(TK_tINTEGER, this.intValue(digits, this.num_base), this.ts, this.num_suffix_s);
                q = rbPos(this.num_suffix_s);
                p = q - 1;
              } else {
                q = this.numXfrm(this.intValue(digits, this.num_base), p);
                p = q;
              }
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 333: {
              p = pc;
              this.num_base = 10;
              this.num_digits_s = this.ts;
              this.num_suffix_s = p;
              this.num_xfrm = XF_integer;
              this.te = p;
              p = p - 1;
              digits = this.numeric_literal_int();
              if (false) {
                this.emit4(TK_tINTEGER, this.intValue(digits, this.num_base), this.ts, this.num_suffix_s);
                q = rbPos(this.num_suffix_s);
                p = q - 1;
              } else {
                q = this.numXfrm(this.intValue(digits, this.num_base), p);
                p = q;
              }
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 297: {
              p = pc;
              this.num_base = 8;
              this.num_digits_s = this.ts;
              this.num_suffix_s = p;
              this.num_xfrm = XF_integer;
              this.te = p;
              p = p - 1;
              digits = this.numeric_literal_int();
              if (false) {
                this.emit4(TK_tINTEGER, this.intValue(digits, this.num_base), this.ts, this.num_suffix_s);
                q = rbPos(this.num_suffix_s);
                p = q - 1;
              } else {
                q = this.numXfrm(this.intValue(digits, this.num_base), p);
                p = q;
              }
              p += 1;
              _goto_level = _out;
              continue;
            }
            case 17: {
              p = pc;
              this.te = p + 1;
              q = this.on_newline(p);
              p = q;
              tm = p;
              this.act = 34;
              break;
            }
            case 48: {
              p = pc;
              this.te = p + 1;
              this.sharp_s = p - 1;
              this.emit_comment_from_range(p, pe);
              this.act = 60;
              break;
            }
            case 77: {
              p = pc;
              this.te = p + 1;
              this.sharp_s = p - 1;
              this.emit_comment_from_range(p, pe);
              this.act = 140;
              break;
            }
            case 340: {
              p = pc;
              this.te = p + 1;
              this.num_suffix_s = p;
              this.num_xfrm = XF_integer;
              this.act = 115;
              break;
            }
            case 336: {
              p = pc;
              this.te = p + 1;
              this.num_base = 10;
              this.num_digits_s = this.ts;
              this.num_suffix_s = p;
              this.num_xfrm = XF_integer;
              this.act = 115;
              break;
            }
            case 300: {
              p = pc;
              this.te = p + 1;
              this.num_base = 8;
              this.num_digits_s = this.ts;
              this.num_suffix_s = p;
              this.num_xfrm = XF_integer;
              this.act = 115;
              break;
            }
          }
          if (this.fatal) {
            return this.fatalToken();
          }
        }
      }
      if (_goto_level <= _again) {
        if (rbTab(RL_LEX_TO_STATE_ACTIONS_D, this.cs) === 84) {
          this.ts = -1;
        }
        if (this.cs === 0) {
          _goto_level = _out;
          continue;
        }
        // Only a fault's past-the-end position reaches the bound.
        if (p >= 1073741823) {
          return this.faultToken();
        }
        p += 1;
        if (p !== pe) {
          _goto_level = _resume;
          continue;
        }
      }
      if (_goto_level <= _test_eof) {
        if (p === eof) {
          const eofTrans = rbTab(RL_LEX_EOF_TRANS_D, this.cs);
          if (eofTrans > 0) {
            _trans = eofTrans - 1;
            _goto_level = _eof_trans;
            continue;
          }
        }
      }
      if (_goto_level <= _out) {
        break;
      }
    }
    this.p = p;
    if (this.qHead !== this.qTail) {
      return this.shift();
    }
    if (this.cs === RL_LEX_ERROR) {
      this.failed = true;
      this.tokVal = "$error";
      this.tokS = sub32(p, 1);
      this.tokE = p;
      return 0;
    }
    eof = toI32(pts.length);
    this.tokVal = "$eof";
    this.tokS = eof;
    this.tokE = eof;
    return 0;
  }

  private shift(): i32 {
    const i = this.qHead;
    const qType = this.qType;
    const qVal = this.qVal;
    const qS = this.qS;
    const qE = this.qE;
    if (i < 0 || i >= qType.length || i >= qVal.length || i >= qS.length || i >= qE.length) {
      fault();
      return 0;
    }
    this.qHead = i + 1;
    this.tokVal = qVal[i];
    this.tokS = qS[i];
    this.tokE = qE[i];
    return qType[i];
  }
}

/** PUNCTUATION (1), PUNCTUATION_BEGIN (2), KEYWORDS (3) and KEYWORDS_BEGIN (4). */
const rbTableToken = (table: i32, v: string): i32 => {
  if (table === 2) {
    if (v === "&") return TK_tAMPER;
    if (v === "*") return TK_tSTAR;
    if (v === "**") return TK_tDSTAR;
    if (v === "+") return TK_tUPLUS;
    if (v === "-") return TK_tUMINUS;
    if (v === "::") return TK_tCOLON3;
    if (v === "(") return TK_tLPAREN;
    if (v === "{") return TK_tLBRACE;
    if (v === "[") return TK_tLBRACK;
    return -1;
  }
  if (table === 3 || table === 4) {
    if (v === "if") return table === 3 ? TK_kIF_MOD : TK_kIF;
    if (v === "unless") return table === 3 ? TK_kUNLESS_MOD : TK_kUNLESS;
    if (v === "while") return table === 3 ? TK_kWHILE_MOD : TK_kWHILE;
    if (v === "until") return table === 3 ? TK_kUNTIL_MOD : TK_kUNTIL;
    if (v === "rescue") return table === 3 ? TK_kRESCUE_MOD : TK_kRESCUE;
    if (v === "defined?") return TK_kDEFINED;
    if (v === "BEGIN") return TK_klBEGIN;
    if (v === "END") return TK_klEND;
    return rbKeyword(v);
  }
  return rbPunct(v);
};

/** The keyword token of `v` (KEYWORDS without the modifier forms), or -1. */
const rbKeyword = (v: string): i32 => {
  if (v === "class") return TK_kCLASS;
  if (v === "module") return TK_kMODULE;
  if (v === "def") return TK_kDEF;
  if (v === "undef") return TK_kUNDEF;
  if (v === "begin") return TK_kBEGIN;
  if (v === "end") return TK_kEND;
  if (v === "then") return TK_kTHEN;
  if (v === "elsif") return TK_kELSIF;
  if (v === "else") return TK_kELSE;
  if (v === "ensure") return TK_kENSURE;
  if (v === "case") return TK_kCASE;
  if (v === "when") return TK_kWHEN;
  if (v === "for") return TK_kFOR;
  if (v === "break") return TK_kBREAK;
  if (v === "next") return TK_kNEXT;
  if (v === "redo") return TK_kREDO;
  if (v === "retry") return TK_kRETRY;
  if (v === "in") return TK_kIN;
  if (v === "do") return TK_kDO;
  if (v === "return") return TK_kRETURN;
  if (v === "yield") return TK_kYIELD;
  if (v === "super") return TK_kSUPER;
  if (v === "self") return TK_kSELF;
  if (v === "nil") return TK_kNIL;
  if (v === "true") return TK_kTRUE;
  if (v === "false") return TK_kFALSE;
  if (v === "and") return TK_kAND;
  if (v === "or") return TK_kOR;
  if (v === "not") return TK_kNOT;
  if (v === "alias") return TK_kALIAS;
  if (v === "__FILE__") return TK_k__FILE__;
  if (v === "__LINE__") return TK_k__LINE__;
  if (v === "__ENCODING__") return TK_k__ENCODING__;
  return -1;
};

/** PUNCTUATION, or -1. */
const rbPunct = (v: string): i32 => {
  if (v === "=") return TK_tEQL;
  if (v === "&") return TK_tAMPER2;
  if (v === "|") return TK_tPIPE;
  if (v === "!") return TK_tBANG;
  if (v === "^") return TK_tCARET;
  if (v === "+") return TK_tPLUS;
  if (v === "-") return TK_tMINUS;
  if (v === "*") return TK_tSTAR2;
  if (v === "/") return TK_tDIVIDE;
  if (v === "%") return TK_tPERCENT;
  if (v === "~") return TK_tTILDE;
  if (v === ",") return TK_tCOMMA;
  if (v === ";") return TK_tSEMI;
  if (v === ".") return TK_tDOT;
  if (v === "..") return TK_tDOT2;
  if (v === "...") return TK_tDOT3;
  if (v === "[") return TK_tLBRACK2;
  if (v === "]") return TK_tRBRACK;
  if (v === "(") return TK_tLPAREN2;
  if (v === ")") return TK_tRPAREN;
  if (v === "?") return TK_tEH;
  if (v === ":") return TK_tCOLON;
  if (v === "&&") return TK_tANDOP;
  if (v === "||") return TK_tOROP;
  if (v === "-@") return TK_tUMINUS;
  if (v === "+@") return TK_tUPLUS;
  if (v === "~@") return TK_tTILDE;
  if (v === "**") return TK_tPOW;
  if (v === "->") return TK_tLAMBDA;
  if (v === "=~") return TK_tMATCH;
  if (v === "!~") return TK_tNMATCH;
  if (v === "==") return TK_tEQ;
  if (v === "!=") return TK_tNEQ;
  if (v === ">") return TK_tGT;
  if (v === ">>") return TK_tRSHFT;
  if (v === ">=") return TK_tGEQ;
  if (v === "<") return TK_tLT;
  if (v === "<<") return TK_tLSHFT;
  if (v === "<=") return TK_tLEQ;
  if (v === "=>") return TK_tASSOC;
  if (v === "::") return TK_tCOLON2;
  if (v === "===") return TK_tEQQ;
  if (v === "<=>") return TK_tCMP;
  if (v === "[]") return TK_tAREF;
  if (v === "[]=") return TK_tASET;
  if (v === "{") return TK_tLCURLY;
  if (v === "}") return TK_tRCURLY;
  if (v === "`") return TK_tBACK_REF2;
  if (v === "!@") return TK_tBANG;
  if (v === "&.") return TK_tANDDOT;
  return -1;
};

class RbHeredoc {
  indent: boolean = false;
  dedent: boolean = false;
  type: string = "";
  delimiter: string = "";
}

/** `/^<<(-?)(~?)(["'`]?)(.*)\3$/m` over a heredoc opener. */
const rbHeredocOpener = (t: string): RbHeredoc => {
  const h = new RbHeredoc();
  let i = 2;
  let dash = false;
  if (i < toI32(t.length) && t.charCodeAt(i) === 45) {
    dash = true;
    i++;
  }
  if (i < toI32(t.length) && t.charCodeAt(i) === 126) {
    h.dedent = true;
    i++;
  }
  h.indent = dash || h.dedent;
  let q = "";
  if (i < toI32(t.length)) {
    const c = t.charCodeAt(i);
    if (c === 34 || c === 39 || c === 96) {
      q = t.substring(i, i + 1);
    }
  }
  if (q.length > 0 && i < toI32(t.length) - 1 && t.endsWith(q)) {
    h.delimiter = t.substring(i + 1, toI32(t.length) - 1);
  } else {
    q = "";
    h.delimiter = t.substring(i, toI32(t.length));
  }
  h.type = q.length === 0 ? '<<"' : `<<${q}`;
  return h;
};

/** `_1`..`_9`. */
const rbIsNumberedParam = (t: string): boolean =>
  t.length === 2 && t.charCodeAt(0) === 95 && t.charCodeAt(1) >= 49 && t.charCodeAt(1) <= 57;

/** Whether a regexp's options include one Ruby does not know. */
const rbUnknownRegexpOptions = (t: string): boolean => {
  for (let i = 0; i < toI32(t.length); i++) {
    if ("imxouesn".indexOf(t.substring(i, i + 1)) < 0) {
      return true;
    }
  }
  return false;
};

/** String#rstrip. */
const rbRstrip = (s: string): string => {
  let k = toI32(s.length);
  while (k > 0) {
    const c = s.charCodeAt(k - 1);
    if (c === 32 || (c >= 9 && c <= 13) || c === 0) {
      k--;
    } else {
      break;
    }
  }
  return s.substring(0, k);
};

/** `$1`..`$n` (not `$0`). */
const rbIsNthRef = (t: string): boolean => {
  if (t.length < 2 || t.charCodeAt(1) < 49 || t.charCodeAt(1) > 57) {
    return false;
  }
  for (let i = 2; i < toI32(t.length); i++) {
    if (t.charCodeAt(i) < 48 || t.charCodeAt(i) > 57) {
      return false;
    }
  }
  return true;
};

/** String#to_i(base) of a literal's digits (with `_`), as a decimal string. */
const rbToDecimal = (s: string, base: i32): string => {
  // Little-endian base 10^4 limbs.
  const limbs: i32[] = [0];
  for (let i = 0; i < toI32(s.length); i++) {
    const c = s.charCodeAt(i);
    if (c === 95) {
      continue;
    }
    const d = rbHexDigit(c);
    if (d < 0 || d >= base) {
      break;
    }
    let carry = d;
    for (let k = 0; k < toI32(limbs.length); k++) {
      // A limb is below 10^4, base at most 16 and carry at most 16.
      const l = limbs[k];
      if (l < 0 || l > 9999 || base < 0 || base > 16 || carry < 0 || carry > 65535) {
        fault();
        return "";
      }
      const v = l * base + carry;
      limbs[k] = v % 10000;
      carry = (v - (v % 10000)) / 10000;
    }
    while (carry > 0) {
      const c = carry;
      limbs.push(c % 10000);
      carry = (c - (c % 10000)) / 10000;
    }
  }
  const nl = toI32(limbs.length);
  if (nl === 0) {
    fault();
    return "";
  }
  let out = `${limbs[nl - 1]}`;
  for (let k = nl - 2; k >= 0 && k < limbs.length; k--) {
    const v = limbs[k];
    out = out + (v < 10 ? "000" : v < 100 ? "00" : v < 1000 ? "0" : "") + `${v}`;
  }
  return out;
};
