// ktfmt's KDoc formatter: a `/** ... */` comment is split into paragraphs
// (text, list items, tags, code blocks, tables, quotes), the tags are
// ordered, and each paragraph is re-flowed to fit 100 columns. Only what
// ktfmt's KDocCommentsHelper configures is ported: KDoc comments, greedy
// line breaking, no markup conversion, nested lists indented by 4.
//
// Ported from ktfmt 0.65's kdoc package: KDocFormatter, ParagraphListBuilder,
// Paragraph, Table and Utilities (Apache License 2.0, Copyright (c) Meta
// Platforms, Inc. and affiliates; originally from the kdoc-formatter
// project, Copyright 2022 Google LLC).

import { strUtf16Len } from "../core/arr";
import { K_MAX_WIDTH } from "./options";

const HANGING_INDENT: i32 = 2;
const NESTED_LIST_INDENT: i32 = 4;
const LINE_PREFIX: string = " * ";

// addLines' end conditions.
const UNTIL_HTML_LIST: i32 = 1;
const UNTIL_LIST_ITEM: i32 = 2;

// addPreformatted's end conditions.
const PRE_UNINDENTED: i32 = 0;
const PRE_FENCE: i32 = 1;
const PRE_CLOSE_TAG: i32 = 2;

class KdParagraph {
  content: string = "";
  prev: KdParagraph | null = null;
  next: KdParagraph | null = null;
  separate: boolean = false;
  continuation: boolean = false;
  allowEmpty: boolean = false;
  preformatted: boolean = false;
  block: boolean = false;
  doc: boolean = false;
  quoted: i32 = 0;
  table: boolean = false;
  separator: boolean = false;
  hanging: boolean = false;
  originalIndent: i32 = 0;
  indent: string = "";
  hangingIndent: string = "";

  setHanging(v: boolean): void {
    this.block = true;
    this.hanging = v;
  }

  isEmpty(): boolean {
    return this.content.length === 0;
  }

  /** Paragraph.reflow, with the first line as wide as the rest. */
  reflow(maxLineWidth: i32): string[] {
    const lineWidth = maxLineWidth - kdIndentSize(this.indent);
    const hangingIndentSize = kdIndentSize(this.hangingIndent) - (this.quoted > 0 ? 2 * this.quoted : 0);
    if (kdLen(this.content) < maxLineWidth - hangingIndentSize) {
      return [kdCollapseSpaces(this.content)];
    }
    const words = this.computeWords();
    if (words.length === 1) {
      return [words[0]];
    }
    return this.reflowGreedy(lineWidth, words);
  }

  reflowGreedy(lineWidth: i32, words: string[]): string[] {
    let width = lineWidth;
    if (this.hanging && this.continuation) {
      width -= kdIndentSize(this.hangingIndent);
    }
    const lines: string[] = [];
    let column = 0;
    let sb = "";
    for (let i = 0; i < toI32(words.length); i++) {
      const word = words[i];
      const wl = kdLen(word);
      if (sb.length === 0) {
        sb = word;
        column += wl;
      } else if (column + wl + 1 <= width) {
        sb = `${sb} ${word}`;
        column += wl + 1;
      } else {
        width = lineWidth;
        if (this.hanging) {
          width -= kdIndentSize(this.hangingIndent);
        }
        lines.push(sb);
        sb = word;
        column = wl;
      }
    }
    if (sb.length > 0) {
      lines.push(sb);
    }
    return lines;
  }

  computeWords(): string[] {
    const text = this.content;
    const words = kdSplitWords(text);
    if (words.length === 1) {
      return words;
    }
    const combined: string[] = [];
    let from = 0;
    const end = toI32(words.length);
    while (from < end) {
      const start = from === 0 && (this.quoted > 0 || (this.hanging && !kdIsKDocTag(text))) ? from + 2 : from + 1;
      let to = end;
      for (let i = start; i < end; i++) {
        const next = words[i];
        if (next.startsWith("[") && !next.startsWith("[[")) {
          let j = -1;
          for (let k = i; k < end; k++) {
            if (words[k].indexOf("]") >= 0) {
              j = k;
              break;
            }
          }
          if (j !== -1) {
            if (start === from + 1 && kdCanBreakAt(words[start - 1], words[start])) {
              combined.push(words[from]);
              from = start;
            }
            to = j + 1;
            if (to === end || kdCanBreakAt(words[to - 1], words[to])) {
              break;
            }
          }
        } else if (kdCanBreakAt(words[i - 1], next)) {
          to = i;
          break;
        }
      }
      if (to === from + 1) {
        combined.push(words[from]);
      } else if (to > from) {
        let s = words[from];
        for (let k = from + 1; k < to; k++) {
          s = `${s} ${words[k]}`;
        }
        combined.push(s);
      }
      from = to;
    }
    return combined;
  }
}

/** Paragraph.canBreakAt. */
const kdCanBreakAt = (prev: string, word: string): boolean => {
  if (
    word.startsWith("#") ||
    word.startsWith("```") ||
    kdIsDirectiveMarker(word) ||
    word.startsWith("@") ||
    kdIsTodo(word) ||
    word.startsWith(">")
  ) {
    return false;
  }
  if (prev === "@sample") {
    return false;
  }
  if (!kdIsLetterAt(word, 0)) {
    const ws = `${word} `;
    if ((kdIsListItem(ws) && !kdEqualsIgnoreCase(word, "<li>")) || ws.startsWith("> ")) {
      return false;
    }
  }
  return true;
};

/** ParagraphListBuilder, for a KDoc comment. */
class KdBuilder {
  lines: string[];
  paragraphs: KdParagraph[];
  paragraph: KdParagraph;

  constructor(comment: string) {
    this.paragraphs = [];
    this.paragraph = new KdParagraph();
    let body = comment.startsWith("/**") ? comment.substring(3, toI32(comment.length)) : comment;
    if (body.endsWith("*/")) {
      body = body.substring(0, toI32(body.length) - 2);
    }
    body = kdTrim(body);
    if (comment.indexOf("\n") < 0) {
      this.lines = [`* ${body}`];
    } else {
      this.lines = kdSplitLines(body);
    }
  }

  lineContent(line: string): string {
    const trimmed = kdTrim(line);
    if (trimmed.startsWith("* ")) {
      return trimmed.substring(2, toI32(trimmed.length));
    }
    if (trimmed.startsWith("*")) {
      return trimmed.substring(1, toI32(trimmed.length));
    }
    return trimmed;
  }

  closeParagraph(): KdParagraph {
    const p = this.paragraph;
    const text = p.content;
    if (p.preformatted) {
      // as is
    } else if (kdIsKDocTag(text)) {
      p.doc = true;
      p.setHanging(true);
    } else if (kdIsTodo(text)) {
      p.setHanging(true);
    } else if (kdIsListItem(text)) {
      p.setHanging(true);
    } else if (kdIsDirectiveMarker(text)) {
      p.block = true;
      p.preformatted = true;
    }
    if (!p.isEmpty() || p.allowEmpty) {
      this.paragraphs.push(p);
    }
    return p;
  }

  newParagraph(): KdParagraph {
    this.closeParagraph();
    const prev = this.paragraph;
    const p = new KdParagraph();
    this.paragraph = p;
    prev.next = p;
    p.prev = prev;
    return p;
  }

  appendText(s: string): void {
    this.paragraph.content = this.paragraph.content + s;
  }

  /** The scan loop's local newParagraph(i): records the original indent of line `i`. */
  newParagraphAt(i: i32, l: string, withIndent: string, without: string): KdParagraph {
    const p = this.newParagraph();
    if (i >= 0 && i < toI32(this.lines.length)) {
      if (this.lines[i] === l) {
        p.originalIndent = kdLen(withIndent) - kdLen(without);
      } else {
        const line = this.lineContent(this.lines[i]);
        p.originalIndent = kdLen(line) - kdLen(kdTrim(line));
      }
    }
    return p;
  }

  stripTrailingBlankLines(): void {
    while (this.paragraphs.length > 0 && this.paragraphs[this.paragraphs.length - 1].isEmpty()) {
      this.paragraphs.pop();
    }
  }

  until(mode: i32, j: i32, w: string, s: string): boolean {
    if (mode === UNTIL_HTML_LIST) {
      return kdEqualsIgnoreCase(w, "</ul>") || kdEqualsIgnoreCase(w, "</ol>");
    }
    if (mode === UNTIL_LIST_ITEM) {
      const n = toI32(this.lines.length);
      if (kdIsBlank(s) && j < n - 1 && this.lineContent(this.lines[j + 1]).startsWith(" ")) {
        return false;
      }
      return (
        kdIsBlank(s) ||
        kdIsListItem(w) ||
        w.startsWith("> ") ||
        kdIsKDocTag(w) ||
        kdIsTodo(w) ||
        w.startsWith("```") ||
        w.startsWith("<pre>") ||
        kdIsDirectiveMarker(w) ||
        kdIsLine(w, 3) ||
        kdIsHeader(w) ||
        (kdLen(s) > 2 &&
          (kdWsAt(s, 0) === 0 || kdWsAt(s, 1) === 0) &&
          j < n - 1 &&
          kdIsBlank(this.lineContent(this.lines[j - 1])))
      );
    }
    return true;
  }

  /** addLines; `start` is the list item's first line (for its customize step). */
  addLines(i: i32, includeEnd: boolean, mode: i32, start: i32): i32 {
    let j = i;
    const n = toI32(this.lines.length);
    while (j < n) {
      const l = this.lines[j];
      const withIndent = this.lineContent(l);
      const without = kdTrim(withIndent);
      if (!includeEnd) {
        if (j > i && this.until(mode, j, without, withIndent)) {
          this.stripTrailingBlankLines();
          return j;
        }
      }
      let brk = false;
      if (mode === UNTIL_HTML_LIST) {
        brk =
          kdStartsWithIgnoreCase(without, "<li>") ||
          kdStartsWithIgnoreCase(without, "</ul>") ||
          kdStartsWithIgnoreCase(without, "</ol>");
      } else if (mode === UNTIL_LIST_ITEM) {
        brk = kdIsBlank(without);
      }
      if (brk) {
        this.newParagraph();
      }
      if (withIndent.startsWith("> ")) {
        this.appendText(kdCollapseSpaces(without.substring(2, toI32(without.length))));
      } else {
        this.appendText(kdCollapseSpaces(without));
      }
      this.appendText(" ");
      if (mode === UNTIL_HTML_LIST) {
        this.paragraph.block = true;
      } else if (mode === UNTIL_LIST_ITEM) {
        if (kdIsBlank(this.lineContent(this.lines[j])) && j >= start) {
          this.paragraph.setHanging(true);
          this.paragraph.continuation = true;
        }
      }
      if (includeEnd) {
        if (j > i && this.until(mode, j, without, withIndent)) {
          this.stripTrailingBlankLines();
          return j + 1;
        }
      }
      j++;
    }
    this.stripTrailingBlankLines();
    this.newParagraph();
    return j;
  }

  preUntil(mode: i32, s: string): boolean {
    if (mode === PRE_UNINDENTED) {
      return !s.startsWith(" ");
    }
    if (mode === PRE_FENCE) {
      return kdTrimStart(s).startsWith("```");
    }
    return kdIndexOfIgnoreCase(s, "</pre>") >= 0;
  }

  addPreformatted(i: i32, includeStart: boolean, includeEnd: boolean, expectClose: boolean, mode: i32): i32 {
    this.newParagraph();
    let j = i;
    let foundClose = false;
    const n = toI32(this.lines.length);
    while (j < n) {
      const withIndent = this.lineContent(this.lines[j]);
      const done = (includeStart || j > i) && this.preUntil(mode, withIndent);
      if (!includeEnd && done) {
        foundClose = true;
        break;
      }
      j++;
      if (includeEnd && done) {
        foundClose = true;
        break;
      }
    }
    if (!foundClose && expectClose) {
      j = n;
    }
    for (let index = i; index < j; index++) {
      this.appendText(this.lineContent(this.lines[index]));
      this.paragraph.preformatted = true;
      this.paragraph.allowEmpty = true;
      this.newParagraph();
    }
    this.stripTrailingBlankLines();
    this.newParagraph();
    return j;
  }

  scan(indentSize: i32): KdParagraph[] {
    let i = 0;
    const n = toI32(this.lines.length);
    while (i < n) {
      const l = this.lines[i];
      i++;
      const withIndent = this.lineContent(l);
      const without = kdTrim(withIndent);
      const indentOf = kdLen(withIndent) - kdLen(without);
      const prevP = this.paragraph.prev;
      if (
        withIndent.startsWith("    ") &&
        (i === 1 || kdIsBlank(this.lineContent(this.lines[i - 2]))) &&
        (prevP === null || indentOf >= prevP.originalIndent + 4)
      ) {
        i = this.addPreformatted(i - 1, false, false, false, PRE_UNINDENTED);
      } else if (without.startsWith("-") && kdContainsOnly(without, "-| ")) {
        const p = this.newParagraphAt(i - 1, l, withIndent, without);
        this.appendText(without);
        this.newParagraphAt(i, l, withIndent, without).block = true;
        if (
          kdIsLine(withIndent, 3) &&
          (i < 2 || kdIsBlank(this.lineContent(this.lines[i - 2]))) &&
          (i > n - 1 || kdIsBlank(this.lineContent(this.lines[i])))
        ) {
          p.separator = true;
        }
      } else if (without.startsWith("=") && kdContainsOnly(without, "= ")) {
        this.newParagraphAt(i - 1, l, withIndent, without).block = true;
        this.appendText(without);
        this.newParagraphAt(i, l, withIndent, without).block = true;
      } else if (without.startsWith("#") && kdFirstNonHashIsSpace(without)) {
        this.newParagraphAt(i - 1, l, withIndent, without).block = true;
        this.appendText(without);
        this.newParagraphAt(i, l, withIndent, without).block = true;
      } else if (without.startsWith("*") && kdContainsOnly(without, "* ")) {
        this.newParagraphAt(i - 1, l, withIndent, without).block = true;
        this.appendText(without);
        this.newParagraphAt(i, l, withIndent, without).block = true;
      } else if (without.startsWith("```")) {
        i = this.addPreformatted(i - 1, false, true, true, PRE_FENCE);
      } else if (kdStartsWithIgnoreCase(without, "<pre>")) {
        i = this.addPreformatted(i - 1, true, true, true, PRE_CLOSE_TAG);
      } else if (without.startsWith("> ")) {
        const hadBlankLine = this.paragraph.isEmpty() && this.paragraph.separate;
        i--;
        let prevDepth = 0;
        let isFirst = true;
        while (i < n) {
          const qTrimmed = kdTrim(this.lineContent(this.lines[i]));
          if (
            kdIsBlank(qTrimmed) ||
            kdIsKDocTag(qTrimmed) ||
            kdIsTodo(qTrimmed) ||
            kdIsDirectiveMarker(qTrimmed) ||
            kdIsHeader(qTrimmed)
          ) {
            break;
          }
          if (!qTrimmed.startsWith("> ") && kdIsListItem(qTrimmed)) {
            break;
          }
          let depth = prevDepth;
          let inner = qTrimmed;
          if (qTrimmed.startsWith("> ")) {
            let d = 0;
            let s = qTrimmed;
            while (s.startsWith("> ")) {
              d++;
              s = kdTrimStart(s.substring(2, toI32(s.length)));
            }
            depth = d;
            inner = s;
          }
          const needsBreak = !isFirst && (depth !== prevDepth || kdIsListItem(inner));
          if (isFirst || needsBreak) {
            const p = this.newParagraphAt(i, l, withIndent, without);
            if (isFirst && hadBlankLine) {
              p.separate = true;
            }
            p.quoted = depth;
            p.block = false;
          }
          this.appendText(kdCollapseSpaces(inner));
          this.appendText(" ");
          prevDepth = depth;
          isFirst = false;
          i++;
        }
        this.newParagraphAt(i, l, withIndent, without);
      } else if (kdEqualsIgnoreCase(without, "<ul>") || kdEqualsIgnoreCase(without, "<ol>")) {
        this.newParagraphAt(i - 1, l, withIndent, without).block = true;
        this.appendText(without);
        this.newParagraphAt(i, l, withIndent, without).setHanging(true);
        i = this.addLines(i, true, UNTIL_HTML_LIST, 0);
        this.newParagraphAt(i, l, withIndent, without);
      } else if (kdIsListItem(without) || kdIsKDocTag(without) || kdIsTodo(without)) {
        const hadBlankLine = this.paragraph.isEmpty() && this.paragraph.separate && kdIsListItem(without);
        i--;
        this.newParagraphAt(i, l, withIndent, without).setHanging(true);
        if (hadBlankLine) {
          this.paragraph.separate = true;
        }
        const start = i;
        i = this.addLines(i, false, UNTIL_LIST_ITEM, start);
        while (i < n && kdTrim(this.lineContent(this.lines[i])).startsWith("```")) {
          i = this.addPreformatted(i, false, true, true, PRE_FENCE);
          if (i >= n) {
            break;
          }
          const nextLine = this.lineContent(this.lines[i]);
          const nextTrimmed = kdTrim(nextLine);
          let isContinuation = false;
          if (kdIsBlank(nextTrimmed)) {
            isContinuation = i + 1 < n && this.lineContent(this.lines[i + 1]).startsWith(" ");
          } else {
            isContinuation =
              nextLine.startsWith(" ") &&
              !kdIsListItem(nextTrimmed) &&
              !nextTrimmed.startsWith("> ") &&
              !kdIsKDocTag(nextTrimmed) &&
              !kdIsTodo(nextTrimmed) &&
              !kdIsDirectiveMarker(nextTrimmed) &&
              !kdIsLine(nextTrimmed, 3) &&
              !kdIsHeader(nextTrimmed);
          }
          if (!isContinuation) {
            break;
          }
          const cp = this.newParagraphAt(i, l, withIndent, without);
          cp.setHanging(true);
          cp.continuation = true;
          i = this.addLines(i, false, UNTIL_LIST_ITEM, start);
        }
        this.newParagraphAt(i, l, withIndent, without);
      } else if (without.length === 0) {
        this.newParagraphAt(i, l, withIndent, without).separate = true;
      } else if (kdIsDirectiveMarker(without)) {
        this.newParagraphAt(i - 1, l, withIndent, without);
        this.appendText(without);
        this.newParagraphAt(i, l, withIndent, without).block = true;
      } else {
        if (without.indexOf("|") >= 0 && this.paragraph.isEmpty() && (i < 2 || this.lines[i - 2].indexOf("---") < 0)) {
          const t = new KdTable();
          const nextRow = t.read(this, i - 1);
          if (nextRow >= 0) {
            const content = t.format(K_MAX_WIDTH - indentSize - 3);
            for (let index = 0; index < toI32(content.length); index++) {
              this.appendText(content[index]);
              this.paragraph.separate = index === 0;
              this.paragraph.block = true;
              this.paragraph.table = true;
              this.newParagraphAt(-1, l, withIndent, without);
            }
            i = nextRow;
            this.newParagraphAt(i, l, withIndent, without);
            continue;
          }
        }
        if (without.startsWith("<") && kdIsBlockTag(without)) {
          this.newParagraphAt(i - 1, l, withIndent, without).block = true;
          if (kdEqualsIgnoreCase(without, "<p>") || kdEqualsIgnoreCase(without, "<p/>")) {
            this.appendText(without);
            this.newParagraphAt(i, l, withIndent, without).block = true;
            continue;
          } else if (
            kdEndsWithIgnoreCase(without, "</h1>") ||
            kdEndsWithIgnoreCase(without, "</h2>") ||
            kdEndsWithIgnoreCase(without, "</h3>") ||
            kdEndsWithIgnoreCase(without, "</h4>")
          ) {
            this.appendText(kdCollapseSpaces(without));
            this.newParagraphAt(i, l, withIndent, without).block = true;
            continue;
          }
        }
        i = this.addPlainText(i, without, 0);
      }
    }
    this.closeParagraph();
    this.arrange();
    return this.paragraphs;
  }

  addPlainText(i: i32, text: string, braceBalance: i32): i32 {
    const s = kdCollapseSpaces(text);
    this.appendText(s);
    this.appendText(" ");
    const n = toI32(this.lines.length);
    if (braceBalance > 0) {
      if (s.indexOf("}") < 0 && i < n) {
        const next = kdTrim(this.lineContent(this.lines[i]));
        if (kdIsBlank(next) || next.startsWith("```")) {
          return i;
        }
        return this.addPlainText(i + 1, next, 1);
      }
    }
    const index = s.indexOf("{@");
    if (index >= 0) {
      if (kdIndexOfFrom(s, "}", index) < 0 && i < n) {
        const next = kdTrim(this.lineContent(this.lines[i]));
        if (kdIsBlank(next) || next.startsWith("```")) {
          return i;
        }
        return this.addPlainText(i + 1, next, 1);
      }
    }
    return i;
  }

  arrange(): void {
    if (this.paragraphs.length === 0) {
      return;
    }
    this.sortDocTags();
    this.adjustParagraphSeparators();
    this.adjustIndentation();
    this.removeBlankParagraphs();
    this.stripTrailingBlankLines();
  }

  sortDocTags(): void {
    const ps = this.paragraphs;
    const np = toI32(ps.length);
    let anyDoc = false;
    let firstNonPriority = -1;
    for (let k = 0; k < np; k++) {
      if (ps[k].doc) {
        anyDoc = true;
        if (firstNonPriority < 0 && !ps[k].content.startsWith("@sample")) {
          firstNonPriority = k;
        }
      }
    }
    if (!anyDoc) {
      return;
    }
    // Units: a doc tag with the paragraphs after it (TODOs stand alone).
    const unitStart: i32[] = [];
    const unitItems: i32[][] = [];
    let tagUnit = -1;
    for (let k = 0; k < np; k++) {
      const p = ps[k];
      if (p.doc) {
        unitItems.push([]);
        unitStart.push(k);
        tagUnit = toI32(unitItems.length) - 1;
      }
      if (tagUnit >= 0 && !kdIsTodo(p.content)) {
        unitItems[tagUnit].push(k);
      } else {
        unitItems.push([k]);
        unitStart.push(k);
      }
    }
    const order: i32[] = [];
    for (let u = 0; u < toI32(unitItems.length); u++) {
      order.push(u);
    }
    const fnp = firstNonPriority;
    order.sort((a: i32, b: i32): i32 => {
      const o1 = unitItems[a][0];
      const o2 = unitItems[b][0];
      const p1 = ps[o1];
      const p2 = ps[o2];
      const isPriority1 = p1.doc && p1.content.startsWith("@sample") && o1 < fnp;
      const isPriority2 = p2.doc && p2.content.startsWith("@sample") && o2 < fnp;
      const t1 = kdIsTodo(p1.content);
      const t2 = kdIsTodo(p2.content);
      if (t1 !== t2) {
        return t1 ? 1 : -1;
      }
      if (p1.doc === p2.doc) {
        if (p1.doc) {
          const r1 = kdDocTagRank(p1.content, isPriority1);
          const r2 = kdDocTagRank(p2.content, isPriority2);
          if (r1 !== r2) {
            return r1 - r2;
          }
        }
        return o1 - o2;
      }
      return p1.doc ? 1 : -1;
    });
    const sorted: KdParagraph[] = [];
    for (let q = 0; q < toI32(order.length); q++) {
      const items = unitItems[order[q]];
      for (let k = 0; k < toI32(items.length); k++) {
        sorted.push(ps[items[k]]);
      }
    }
    let prev: KdParagraph | null = null;
    this.paragraphs = [];
    for (let k = 0; k < toI32(sorted.length); k++) {
      const p = sorted[k];
      this.paragraphs.push(p);
      if (prev !== null) {
        prev.next = p;
      }
      p.prev = prev;
      prev = p;
    }
  }

  adjustParagraphSeparators(): void {
    let prev: KdParagraph | null = null;
    for (let k = 0; k < toI32(this.paragraphs.length); k++) {
      const p = this.paragraphs[k];
      const text = p.content;
      let sep = false;
      if (prev === null) {
        sep = false;
      } else if (p.preformatted && prev.preformatted) {
        sep = false;
      } else if (p.table) {
        sep = p.separate && (!prev.block || kdIsKDocTag(prev.content) || prev.table);
      } else if (p.separator || prev.separator) {
        sep = true;
      } else if (kdIsLine(text, 1) || kdIsLine(prev.content, 1)) {
        sep = false;
      } else if (p.separate) {
        sep = true;
      } else if (p.doc) {
        sep = !prev.doc;
      } else if (kdIsDirectiveMarker(text)) {
        sep = false;
      } else if (kdIsTodo(text) && !kdIsTodo(prev.content)) {
        sep = true;
      } else if (kdIsHeader(text)) {
        sep = true;
      } else if (p.preformatted) {
        sep =
          !prev.preformatted &&
          !kdStartsWithIgnoreCase(text, "<pre") &&
          (!kdTrimStart(text).startsWith("```") || !kdIsExpectingMore(prev.content));
      } else if (prev.preformatted && kdStartsWithIgnoreCase(prev.content, "</pre>")) {
        sep = false;
      } else if (p.continuation) {
        sep = true;
      } else if (p.hanging) {
        sep = false;
      } else if (p.quoted > 0) {
        sep = prev.quoted > 0 && p.quoted === prev.quoted;
      } else if (kdStartsWithIgnoreCase(text, "<p>") || kdStartsWithIgnoreCase(text, "<p/>")) {
        sep = true;
      } else {
        sep = !p.block && !p.isEmpty();
      }
      p.separate = sep;
      if (p.hanging) {
        if (p.doc || kdStartsWithIgnoreCase(text, "<li>") || kdIsTodo(text)) {
          p.hangingIndent = kdSpaces(HANGING_INDENT);
        } else if (p.continuation && p.prev !== null) {
          let source = p.prev;
          while (source !== null && (source.preformatted || source.isEmpty()) && source.prev !== null) {
            source = source.prev;
          }
          if (source !== null) {
            p.hangingIndent = source.hangingIndent;
          }
          p.content = kdTrimStart(p.content);
        } else {
          p.hangingIndent = kdSpaces(kdLen(kdBeforeSpace(text)) + 1);
        }
      }
      prev = p;
    }
  }

  adjustIndentation(): void {
    const ps = this.paragraphs;
    const np = toI32(ps.length);
    const firstIndent = ps[0].originalIndent;
    if (firstIndent > 0) {
      for (let k = 0; k < np; k++) {
        if (ps[k].originalIndent <= firstIndent) {
          ps[k].originalIndent = 0;
        }
      }
    }
    let inList = ps[0].hanging;
    let startIndent = 0;
    const levels: i32[] = [];
    for (let k = 1; k < np; k++) {
      const p = ps[k];
      if (!inList) {
        if (p.hanging) {
          inList = true;
          startIndent = p.originalIndent;
        }
      } else if (!p.hanging) {
        inList = false;
      } else if (p.originalIndent === startIndent) {
        p.originalIndent = 0;
      } else if (p.originalIndent > 0 && levels.indexOf(p.originalIndent) < 0) {
        levels.push(p.originalIndent);
      }
    }
    if (levels.length === 0) {
      return;
    }
    levels.sort((a: i32, b: i32): i32 => a - b);
    for (let k = 0; k < np; k++) {
      const p = ps[k];
      if (p.originalIndent > 0) {
        const idx = levels.indexOf(p.originalIndent);
        if (idx < 0) {
          continue;
        }
        p.originalIndent = (idx + 1) * NESTED_LIST_INDENT;
        p.indent = kdSpaces(p.originalIndent);
      }
    }
  }

  removeBlankParagraphs(): void {
    for (let k = toI32(this.paragraphs.length) - 2; k >= 0; k--) {
      const ps = this.paragraphs;
      const p = ps[k];
      if (p.isEmpty() && (!p.preformatted || k === toI32(ps.length) - 1)) {
        if (p.separate && k + 1 < toI32(ps.length)) {
          ps[k + 1].separate = true;
        }
        const rest: KdParagraph[] = [];
        for (let q = 0; q < toI32(ps.length); q++) {
          if (q !== k) {
            rest.push(ps[q]);
          }
        }
        this.paragraphs = rest;
        if (k > 0) {
          rest[k - 1].next = null;
        }
      }
    }
  }
}

const kdDocTagRank = (tag: string, isPriority: boolean): i32 => {
  if (isPriority) {
    return -1;
  }
  if (tag.startsWith("@param") || tag.startsWith("@property")) {
    return 0;
  }
  if (tag.startsWith("@return")) {
    return 1;
  }
  if (tag.startsWith("@constructor")) {
    return 2;
  }
  if (tag.startsWith("@receiver")) {
    return 3;
  }
  if (tag.startsWith("@throws")) {
    return 4;
  }
  if (tag.startsWith("@exception")) {
    return 5;
  }
  if (tag.startsWith("@sample")) {
    return 6;
  }
  if (tag.startsWith("@see")) {
    return 7;
  }
  if (tag.startsWith("@author")) {
    return 8;
  }
  if (tag.startsWith("@since")) {
    return 9;
  }
  if (tag.startsWith("@suppress")) {
    return 10;
  }
  if (tag.startsWith("@deprecated")) {
    return 11;
  }
  return 100;
};

const kdIsBlockTag = (s: string): boolean =>
  kdStartsWithIgnoreCase(s, "<p>") ||
  kdStartsWithIgnoreCase(s, "<p/>") ||
  kdStartsWithIgnoreCase(s, "<h1") ||
  kdStartsWithIgnoreCase(s, "<h2") ||
  kdStartsWithIgnoreCase(s, "<h3") ||
  kdStartsWithIgnoreCase(s, "<h4") ||
  kdStartsWithIgnoreCase(s, "<table") ||
  kdStartsWithIgnoreCase(s, "<tr") ||
  kdStartsWithIgnoreCase(s, "<caption") ||
  kdStartsWithIgnoreCase(s, "<td") ||
  kdStartsWithIgnoreCase(s, "<div");

// ---- Table -------------------------------------------------------------------

const AL_LEFT: i32 = 0;
const AL_RIGHT: i32 = 1;
const AL_CENTER: i32 = 2;

class KdTable {
  widths: i32[];
  rows: string[][];
  align: i32[];

  constructor() {
    this.widths = [];
    this.rows = [];
    this.align = [];
  }

  /** Table.getTable: reads the table at line `start`; answers the line after it, or -1. */
  read(b: KdBuilder, start: i32): i32 {
    const lines = b.lines;
    const n = toI32(lines.length);
    if (start > n - 2) {
      return -1;
    }
    const headerLine = b.lineContent(lines[start]);
    const separatorLine = b.lineContent(lines[start + 1]);
    const barCount = kdCountSeparators(headerLine);
    if (!kdIsHeaderDivider(barCount, kdTrim(separatorLine))) {
      return -1;
    }
    const header = kdGetRow(headerLine);
    const dividerRow = kdGetRow(separatorLine);
    this.rows.push(header);
    let i = start + 2;
    while (i < n) {
      const line = b.lineContent(lines[i]);
      if (line.indexOf("|") < 0) {
        break;
      }
      this.rows.push(kdGetRow(line));
      i++;
    }
    // A leading empty cell in every row (a line starting with `|`) goes.
    let allBlank = true;
    for (let r = 0; r <= toI32(this.rows.length); r++) {
      const row = r < toI32(this.rows.length) ? this.rows[r] : dividerRow;
      if (row.length === 0 || !kdIsBlank(row[0])) {
        allBlank = false;
        break;
      }
    }
    let divider = dividerRow;
    if (allBlank) {
      for (let r = 0; r < toI32(this.rows.length); r++) {
        this.rows[r] = this.rows[r].slice(1, toI32(this.rows[r].length));
      }
      divider = dividerRow.slice(1, toI32(dividerRow.length));
    }
    const columns = toI32(divider.length);
    let maxColumns = 0;
    for (let r = 0; r < toI32(this.rows.length); r++) {
      if (toI32(this.rows[r].length) > maxColumns) {
        maxColumns = toI32(this.rows[r].length);
      }
    }
    for (let c = 0; c < maxColumns; c++) {
      this.widths.push(3);
    }
    for (let r = 0; r < toI32(this.rows.length); r++) {
      const row = this.rows[r];
      for (let c = 0; c < toI32(row.length); c++) {
        const w = kdLen(row[c]);
        if (w > this.widths[c]) {
          this.widths[c] = w;
        }
      }
      for (let c = toI32(row.length); c < columns; c++) {
        row.push("");
      }
    }
    for (let c = 0; c < toI32(divider.length); c++) {
      const cell = divider[c];
      this.align.push(cell.endsWith(":") ? (cell.startsWith(":-") ? AL_CENTER : AL_RIGHT) : AL_LEFT);
    }
    for (let c = toI32(this.align.length); c < maxColumns; c++) {
      this.align.push(AL_LEFT);
    }
    return i;
  }

  format(maxWidth: i32): string[] {
    let tableMaxWidth = 2;
    for (let c = 0; c < toI32(this.widths.length); c++) {
      tableMaxWidth += this.widths[c] + 2;
    }
    const pad = tableMaxWidth <= maxWidth;
    const lines: string[] = [];
    for (let r = 0; r < toI32(this.rows.length); r++) {
      const row = this.rows[r];
      let sb = "";
      for (let c = 0; c < toI32(row.length); c++) {
        sb = `${sb}|`;
        if (pad) {
          sb = `${sb} `;
        }
        const cell = row[c];
        const width = this.widths[c];
        const cl = kdLen(cell);
        let s = "";
        if (this.align[c] === AL_CENTER && r > 0) {
          const inner = kdSpaces(cl + kdIntDiv(width - cl, 2) - cl) + cell;
          s = inner + kdSpaces(width - kdLen(inner));
        } else if (this.align[c] === AL_RIGHT && r > 0) {
          s = kdSpaces(width - cl) + cell;
        } else {
          s = cell + kdSpaces(width - cl);
        }
        sb = sb + s;
        if (pad) {
          sb = `${sb} `;
        }
      }
      lines.push(`${sb}|`);
      if (r === 0) {
        let d = "";
        for (let c = 0; c < toI32(row.length); c++) {
          d = `${d}|`;
          let width = this.widths[c];
          if (this.align[c] !== AL_LEFT) {
            width--;
            if (this.align[c] === AL_CENTER) {
              d = `${d}:`;
              width--;
            }
          }
          if (pad) {
            d = `${d}-`;
          }
          for (let k = 0; k < width; k++) {
            d = `${d}-`;
          }
          if (pad) {
            d = `${d}-`;
          }
          if (this.align[c] !== AL_LEFT) {
            d = `${d}:`;
          }
        }
        lines.push(`${d}|`);
      }
    }
    return lines;
  }
}

/** Kotlin's Int division (truncating toward zero). */
const kdIntDiv = (a: i32, b: i32): i32 => (a >= 0 ? (a - (a % b)) / b : -((-a - (-a % b)) / b));

const kdIsHeaderDivider = (barCount: i32, s: string): boolean => {
  let i = 0;
  let count = 0;
  const n = toI32(s.length);
  while (i < n) {
    const c = s.charCodeAt(i);
    i++;
    if (c === 92) {
      i++;
    } else if (c === 124) {
      count++;
    } else if (kdWsAt(s, i - 1) > 0 || c === 58) {
      continue;
    } else if (
      c === 45 &&
      (kdStartsWithAt(s, "--", i) ||
        kdStartsWithAt(s, "-:", i) ||
        (i > 1 && kdStartsWithAt(s, ":-:", i - 2)) ||
        (i > 1 && kdStartsWithAt(s, ":--", i - 2)))
    ) {
      while (i < n && s.charCodeAt(i) === 45) {
        i++;
      }
    } else {
      return false;
    }
  }
  return barCount === count;
};

const kdGetRow = (s: string): string[] => {
  const cells: string[] = [];
  let i = 0;
  let end = 0;
  const n = toI32(s.length);
  while (end < n) {
    const c = s.charCodeAt(end);
    if (c === 92) {
      end++;
    } else if (c === 124) {
      if (end > 0) {
        cells.push(kdTrim(s.substring(i, end)));
      }
      i = end + 1;
    }
    end++;
  }
  if (end > i) {
    const cell = kdTrim(s.substring(i, n < end ? n : end));
    if (cell.length > 0) {
      cells.push(cell);
    }
  }
  return cells;
};

const kdCountSeparators = (s: string): i32 => {
  let i = 0;
  let count = 0;
  const n = toI32(s.length);
  while (i < n) {
    const c = s.charCodeAt(i);
    if (c === 124) {
      count++;
    } else if (c === 92) {
      i++;
    }
    i++;
  }
  return count;
};

// ---- KDocFormatter -------------------------------------------------------------

/** KDocFormatter.reformatComment for a KDoc comment starting at `column0`. */
export const formatKDoc = (comment: string, column0: i32, maxWidth: i32): string => {
  const indent = kdSpaces(column0);
  const indentSize = column0;
  const b = new KdBuilder(comment);
  const paragraphs = b.scan(indentSize);
  const lineSeparator = `\n${indent}${LINE_PREFIX}`;
  if (paragraphs.length <= 1) {
    const trimmed = paragraphs.length > 0 ? kdTrim(paragraphs[0].content) : "";
    let width = maxWidth - column0 - 7;
    if (width > maxWidth) {
      width = maxWidth;
    }
    if (kdLen(trimmed) <= width) {
      return `/** ${trimmed} */`;
    }
  }
  let sb = `/**${lineSeparator}`;
  for (let k = 0; k < toI32(paragraphs.length); k++) {
    const p = paragraphs[k];
    if (p.separate) {
      sb = kdStripTrailingSpace(sb);
      sb = sb + lineSeparator;
    }
    if (p.preformatted || p.table) {
      sb = kdStripTrailingSpace(sb + p.content) + lineSeparator;
      continue;
    }
    const lineWithoutIndent = maxWidth - toI32(LINE_PREFIX.length);
    const quoteAdjustment = p.quoted > 0 ? 2 * p.quoted : 0;
    let mlw = lineWithoutIndent - indentSize;
    if (maxWidth < mlw) {
      mlw = maxWidth;
    }
    mlw -= quoteAdjustment;
    const lines = p.reflow(mlw);
    let first = true;
    for (let q = 0; q < toI32(lines.length); q++) {
      const line = lines[q];
      sb = sb + p.indent;
      if (first && !p.continuation) {
        first = false;
      } else {
        sb = sb + p.hangingIndent;
      }
      for (let d = 0; d < p.quoted; d++) {
        sb = `${sb}> `;
      }
      if (line.length === 0) {
        sb = kdStripTrailingSpace(sb);
      } else {
        sb = sb + line;
      }
      sb = sb + lineSeparator;
    }
  }
  if (sb.endsWith("* ")) {
    sb = sb.substring(0, toI32(sb.length) - 2);
  }
  return `${sb}*/`;
};

const kdStripTrailingSpace = (sb: string): string => (sb.endsWith("* ") ? sb.substring(0, toI32(sb.length) - 1) : sb);

// ---- Utilities -------------------------------------------------------------------

/** UTF-16 length. */
const kdLen = (s: string): i32 => strUtf16Len(s);

const kdSpaces = (k: i32): string => {
  let s = "";
  for (let i = 0; i < k; i++) {
    s = `${s} `;
  }
  return s;
};

/** getIndentSize: a tab counts 8. */
const kdIndentSize = (s: string): i32 => {
  let n = 0;
  for (let i = 0; i < toI32(s.length); i++) {
    n += s.charCodeAt(i) === 9 ? 8 : 1;
  }
  return n;
};

/** The byte length of the Char.isWhitespace character at byte `i`, or 0. */
const kdWsAt = (s: string, i: i32): i32 => {
  const n = toI32(s.length);
  if (i >= n) {
    return 0;
  }
  const c = s.charCodeAt(i);
  if (c === 32 || (c >= 9 && c <= 13) || (c >= 0x1c && c <= 0x1f)) {
    return 1;
  }
  if (c === 0xc2 && i + 1 < n) {
    const d = s.charCodeAt(i + 1);
    return d === 0xa0 || d === 0x85 ? 2 : 0;
  }
  if (c === 0xe1 && i + 2 < n && s.charCodeAt(i + 1) === 0x9a && s.charCodeAt(i + 2) === 0x80) {
    return 3;
  }
  if (c === 0xe2 && i + 2 < n) {
    const d = s.charCodeAt(i + 1);
    const f = s.charCodeAt(i + 2);
    if (d === 0x80 && ((f >= 0x80 && f <= 0x8a) || f === 0xa8 || f === 0xa9 || f === 0xaf)) {
      return 3;
    }
    if (d === 0x81 && f === 0x9f) {
      return 3;
    }
  }
  if (c === 0xe3 && i + 2 < n && s.charCodeAt(i + 1) === 0x80 && s.charCodeAt(i + 2) === 0x80) {
    return 3;
  }
  return 0;
};

/** Whether the byte at `i` ends a whitespace character (for trimming from the end). */
const kdWsEndingAt = (s: string, e: i32): i32 => {
  for (let k = 1; k <= 3 && e - k >= 0; k++) {
    const w = kdWsAt(s, e - k);
    if (w === k) {
      return k;
    }
  }
  return 0;
};

const kdTrimStart = (s: string): string => {
  let a = 0;
  while (a < toI32(s.length) && kdWsAt(s, a) > 0) {
    a += kdWsAt(s, a);
  }
  return a === 0 ? s : s.substring(a, toI32(s.length));
};

const kdTrimEnd = (s: string): string => {
  let b = toI32(s.length);
  while (b > 0) {
    const w = kdWsEndingAt(s, b);
    if (w === 0) {
      break;
    }
    b -= w;
  }
  return b === toI32(s.length) ? s : s.substring(0, b);
};

const kdTrim = (s: string): string => kdTrimEnd(kdTrimStart(s));

const kdIsBlank = (s: string): boolean => kdTrimStart(s).length === 0;

const kdSplitLines = (s: string): string[] => {
  const out: string[] = [];
  let a = 0;
  for (let i = 0; i < toI32(s.length); i++) {
    if (s.charCodeAt(i) === 10) {
      out.push(s.substring(a, i));
      a = i + 1;
    }
  }
  out.push(s.substring(a, toI32(s.length)));
  return out;
};

/** text.split(Regex("\\s+")).filter { it.isNotBlank() }.map { it.trim() }. */
const kdSplitWords = (s: string): string[] => {
  const out: string[] = [];
  let a = 0;
  const n = toI32(s.length);
  let i = 0;
  while (i <= n) {
    const c = i < n ? s.charCodeAt(i) : 32;
    if (c === 32 || (c >= 9 && c <= 13)) {
      if (i > a) {
        const w = kdTrim(s.substring(a, i));
        if (w.length > 0) {
          out.push(w);
        }
      }
      a = i + 1;
    }
    i++;
  }
  return out;
};

const kdStartsWithAt = (s: string, p: string, i: i32): boolean => {
  const k = toI32(p.length);
  if (i < 0 || i + k > toI32(s.length)) {
    return false;
  }
  for (let j = 0; j < k; j++) {
    if (s.charCodeAt(i + j) !== p.charCodeAt(j)) {
      return false;
    }
  }
  return true;
};

const kdLower = (c: i32): i32 => (c >= 65 && c <= 90 ? c + 32 : c);

const kdStartsWithIgnoreCaseAt = (s: string, p: string, i: i32): boolean => {
  const k = toI32(p.length);
  if (i < 0 || i + k > toI32(s.length)) {
    return false;
  }
  for (let j = 0; j < k; j++) {
    if (kdLower(s.charCodeAt(i + j)) !== kdLower(p.charCodeAt(j))) {
      return false;
    }
  }
  return true;
};

const kdStartsWithIgnoreCase = (s: string, p: string): boolean => kdStartsWithIgnoreCaseAt(s, p, 0);

const kdEndsWithIgnoreCase = (s: string, p: string): boolean =>
  kdStartsWithIgnoreCaseAt(s, p, toI32(s.length) - toI32(p.length));

const kdEqualsIgnoreCase = (s: string, p: string): boolean =>
  s.length === p.length && kdStartsWithIgnoreCaseAt(s, p, 0);

const kdIndexOfIgnoreCase = (s: string, p: string): i32 => {
  for (let i = 0; i + toI32(p.length) <= toI32(s.length); i++) {
    if (kdStartsWithIgnoreCaseAt(s, p, i)) {
      return i;
    }
  }
  return -1;
};

const kdIndexOfFrom = (s: string, p: string, from: i32): i32 => {
  for (let i = from; i + toI32(p.length) <= toI32(s.length); i++) {
    if (kdStartsWithAt(s, p, i)) {
      return i;
    }
  }
  return -1;
};

/** The text before the first space (the whole text when there is none). */
const kdBeforeSpace = (s: string): string => {
  const i = s.indexOf(" ");
  return i >= 0 ? s.substring(0, i) : s;
};

const kdContainsOnly = (s: string, chars: string): boolean => {
  for (let i = 0; i < toI32(s.length); i++) {
    if (chars.indexOf(s.substring(i, i + 1)) < 0) {
      return false;
    }
  }
  return true;
};

const kdFirstNonHashIsSpace = (s: string): boolean => {
  for (let i = 0; i < toI32(s.length); i++) {
    if (s.charCodeAt(i) !== 35) {
      return s.charCodeAt(i) === 32;
    }
  }
  return false;
};

/** String.collapseSpaces: runs of spaces become one, trailing whitespace goes. */
const kdCollapseSpaces = (s: string): string => {
  if (s.indexOf("  ") < 0) {
    return kdTrimEnd(s);
  }
  let out = "";
  let a = 0;
  const n = toI32(s.length);
  for (let i = 1; i < n; i++) {
    if (s.charCodeAt(i) === 32 && s.charCodeAt(i - 1) === 32) {
      out = out + s.substring(a, i);
      a = i + 1;
    }
  }
  out = out + s.substring(a, n);
  return kdTrimEnd(out);
};

const kdIsDigit = (c: i32): boolean => c >= 48 && c <= 57;

/** Char.isLetter at byte `i` (non-ASCII letters approximated by their lead byte). */
const kdIsLetterAt = (s: string, i: i32): boolean => {
  if (i >= toI32(s.length)) {
    return false;
  }
  const c = s.charCodeAt(i);
  if (c < 0x80) {
    return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
  }
  if (c === 0xe2 || c === 0xe3) {
    return false; // punctuation, symbols and CJK punctuation
  }
  return c >= 0xc3;
};

/** String.isListItem. */
const kdIsListItem = (s: string): boolean => {
  if (s.startsWith("- ") || s.startsWith("* ") || s.startsWith("+ ") || kdStartsWithIgnoreCase(s, "<li>")) {
    return true;
  }
  // ^\d+([.)])
  let i = 0;
  while (i < toI32(s.length) && kdIsDigit(s.charCodeAt(i))) {
    i++;
  }
  return (
    i > 0 && i + 1 < toI32(s.length) && (s.charCodeAt(i) === 46 || s.charCodeAt(i) === 41) && s.charCodeAt(i + 1) === 32
  );
};

const kdIsTodo = (s: string): boolean => s.startsWith("TODO:") || s.startsWith("TODO(");

const kdIsHeader = (s: string): boolean => s.startsWith("#") || kdStartsWithIgnoreCase(s, "<h");

const kdIsDirectiveMarker = (s: string): boolean => s.startsWith("<!--") || s.startsWith("-->");

const kdIsExpectingMore = (s: string): boolean => {
  const t = kdTrimEnd(s);
  if (t.length === 0) {
    return false;
  }
  const c = t.charCodeAt(toI32(t.length) - 1);
  return c === 58 || c === 44;
};

/** String.isLine: a run of at least `minCount` dashes (or underscores) and spaces. */
const kdIsLine = (s: string, minCount: i32): boolean => {
  if (s.startsWith("-") && kdContainsOnly(s, "- ")) {
    return kdCount(s, 45) >= minCount;
  }
  if (s.startsWith("_") && kdContainsOnly(s, "_ ")) {
    return kdCount(s, 95) >= minCount;
  }
  return false;
};

const kdCount = (s: string, c: i32): i32 => {
  let k = 0;
  for (let i = 0; i < toI32(s.length); i++) {
    if (s.charCodeAt(i) === c) {
      k++;
    }
  }
  return k;
};

/** String.isKDocTag. */
const kdIsKDocTag = (s: string): boolean => {
  if (!s.startsWith("@") || s.length <= 1) {
    return false;
  }
  for (let i = 1; i < toI32(s.length); i++) {
    const c = s.charCodeAt(i);
    if (kdWsAt(s, i) > 0) {
      return i > 2;
    }
    const lowerLetter = c >= 97 && c <= 122;
    if (!lowerLetter) {
      if (c === 91 && (s.startsWith("@param") || s.startsWith("@property"))) {
        return true;
      }
      if (i === 1 && c >= 65 && c <= 90) {
        return true;
      }
      return false;
    }
  }
  return true;
};
