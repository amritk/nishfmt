// rustfmt's Config (the default configuration, with the width heuristics
// `use_small_heuristics = Default` derives from max_width), Indent and Shape.
//
// Ported from rustfmt 1.9.0 (MIT OR Apache-2.0, Copyright The Rust Project
// Developers): config/, shape.rs.

import { rsRepeat, rsSpaces } from "./str";

export class RsConfig {
  maxWidth: i32 = 100;
  tabSpaces: i32 = 4;
  hardTabs: boolean = false;
  fnCallWidth: i32 = 60;
  attrFnLikeWidth: i32 = 70;
  structLitWidth: i32 = 18;
  structVariantWidth: i32 = 35;
  arrayWidth: i32 = 60;
  chainWidth: i32 = 60;
  singleLineIfElseMaxWidth: i32 = 50;
  singleLineLetElseMaxWidth: i32 = 50;
  shortArrayElementWidthThreshold: i32 = 10;
  commentWidth: i32 = 80;
  // The Rust edition the source is parsed at (rustfmt's `edition`).
  edition: i32 = 2021;
  // The style edition (rustfmt's `style_edition`): the formatting rules of
  // that edition of the Rust Style Guide.
  styleEdition: i32 = 2021;
  constructor() {}
}

const scale = (base: i32, maxWidth: i32): i32 => {
  // WidthHeuristics::scaled: the ratio rounded to 0.1 above the default of 100.
  let ratio: f32 = toF32(1.0);
  if (maxWidth > 100) {
    const r: f32 = toF32(maxWidth) / toF32(100.0);
    ratio = toF32(Math.round(toF64(r * toF32(10.0)))) / toF32(10.0);
  }
  return toI32(Math.round(toF64(toF32(base) * ratio)));
};

/** A config with `max_width` set and the heuristics scaled to it. */
export const rsConfigWithMaxWidth = (maxWidth: i32): RsConfig => {
  const c = new RsConfig();
  c.maxWidth = maxWidth;
  c.fnCallWidth = scale(60, maxWidth);
  c.attrFnLikeWidth = scale(70, maxWidth);
  c.structLitWidth = scale(18, maxWidth);
  c.structVariantWidth = scale(35, maxWidth);
  c.arrayWidth = scale(60, maxWidth);
  c.chainWidth = scale(60, maxWidth);
  c.singleLineIfElseMaxWidth = scale(50, maxWidth);
  c.singleLineLetElseMaxWidth = scale(50, maxWidth);
  return c;
};

/** An indent: a block indent plus a visual alignment. */
export class RsIndent {
  bi: i32;
  al: i32;
  constructor(bi: i32, al: i32) {
    this.bi = bi;
    this.al = al;
  }
}

export const rsIndentFromWidth = (cfg: RsConfig, width: i32): RsIndent => {
  if (cfg.hardTabs) {
    const n = width / cfg.tabSpaces;
    return new RsIndent(cfg.tabSpaces * n, width % cfg.tabSpaces);
  }
  return new RsIndent(width, 0);
};

/** Indent::to_string for block indent `bi` and alignment `al`. */
export const rsIndentStr = (cfg: RsConfig, bi: i32, al: i32): string => {
  if (cfg.hardTabs) {
    return rsRepeat("\t", bi / cfg.tabSpaces) + rsSpaces(al);
  }
  return rsSpaces(bi + al);
};

export const rsIndentStrNl = (cfg: RsConfig, bi: i32, al: i32): string => "\n" + rsIndentStr(cfg, bi, al);

export const INFINITE_SHAPE_WIDTH: i32 = 8096;

export class RsShape {
  width: i32;
  bi: i32; // indent.block_indent
  al: i32; // indent.alignment
  off: i32; // offset
  constructor(width: i32, bi: i32, al: i32, off: i32) {
    this.width = width;
    this.bi = bi;
    this.al = al;
    this.off = off;
  }

  /** indent.width() */
  iw(): i32 {
    return this.bi + this.al;
  }

  withWidth(w: i32): RsShape {
    return new RsShape(w, this.bi, this.al, this.off);
  }

  visualIndent(delta: i32): RsShape {
    const a = this.off + delta;
    return new RsShape(this.width, this.bi, a, a);
  }

  blockIndent(delta: i32): RsShape {
    if (this.al === 0) {
      return new RsShape(this.width, this.bi + delta, 0, 0);
    }
    return new RsShape(this.width, this.bi, this.al + delta, this.al + delta);
  }

  /** block_left: block_indent(delta).sub_width(delta). */
  blockLeft(delta: i32): RsShape | null {
    return this.blockIndent(delta).subWidth(delta);
  }

  addOffset(delta: i32): RsShape {
    return new RsShape(this.width, this.bi, this.al, this.off + delta);
  }

  block(): RsShape {
    return new RsShape(this.width, this.bi, 0, this.off);
  }

  satSubWidth(delta: i32): RsShape {
    const w = this.width - delta;
    return new RsShape(w < 0 ? 0 : w, this.bi, this.al, this.off);
  }

  subWidth(delta: i32): RsShape | null {
    if (delta > this.width) {
      return null;
    }
    return new RsShape(this.width - delta, this.bi, this.al, this.off);
  }

  shrinkLeft(delta: i32): RsShape | null {
    if (delta > this.width) {
      return null;
    }
    return new RsShape(this.width - delta, this.bi, this.al + delta, this.off + delta);
  }

  offsetLeft(delta: i32): RsShape | null {
    if (delta > this.width) {
      return null;
    }
    return new RsShape(this.width - delta, this.bi, this.al, this.off + delta);
  }

  usedWidth(): i32 {
    return this.bi + this.off;
  }

  rhsOverhead(cfg: RsConfig): i32 {
    const r = cfg.maxWidth - (this.usedWidth() + this.width);
    return r < 0 ? 0 : r;
  }

  comment(cfg: RsConfig): RsShape {
    let cw = cfg.commentWidth - this.iw();
    if (cw < 0) {
      cw = 0;
    }
    return new RsShape(this.width < cw ? this.width : cw, this.bi, this.al, this.off);
  }

  /** to_string_with_newline: the indent with its alignment replaced by the offset. */
  strNl(cfg: RsConfig): string {
    return rsIndentStrNl(cfg, this.bi, this.off);
  }

  infiniteWidth(): RsShape {
    return new RsShape(INFINITE_SHAPE_WIDTH, this.bi, this.al, this.off);
  }

  withMaxWidth(cfg: RsConfig): RsShape {
    let w = cfg.maxWidth - this.iw();
    if (w < 0) {
      w = 0;
    }
    return new RsShape(w, this.bi, this.al, this.off);
  }

  /** The indent as a string (indent.to_string). */
  indentStr(cfg: RsConfig): string {
    return rsIndentStr(cfg, this.bi, this.al);
  }

  indentStrNl(cfg: RsConfig): string {
    return rsIndentStrNl(cfg, this.bi, this.al);
  }
}

/** Shape::indented. */
export const rsShapeIndented = (bi: i32, al: i32, cfg: RsConfig): RsShape => {
  let w = cfg.maxWidth - (bi + al);
  if (w < 0) {
    w = 0;
  }
  return new RsShape(w, bi, al, al);
};

/** Shape::legacy. */
export const rsShapeLegacy = (width: i32, bi: i32, al: i32): RsShape => new RsShape(width, bi, al, al);
