// What the Layout alignment and indentation cops share: the Alignment mixin
// (display columns, check_alignment), the AlignmentCorrector (heredoc- and
// string-aware line-by-line indentation changes), CheckAssignment's
// extract_rhs, the MultilineElementIndentation mixin, and the node
// predicates they read (bare access modifiers, macro scope, arguments).
//
// Ported from RuboCop 1.92.3 and rubocop-ast 1.52.0 (MIT License, Copyright
// (c) 2012-24 Bozhidar Batsov). The display width table is generated from
// unicode-display_width 3.3.0 (MIT License, Copyright (c) 2011, 2015-2025 Jan
// Lelis).

import {
  F_BEGIN,
  F_END,
  F_HEREDOC_BODY,
  F_HEREDOC_END,
  F_KEYWORD,
  F_OPERATOR,
  F_SELECTOR,
  NT_AND_ASGN,
  NT_BEGIN,
  NT_BLOCK,
  NT_CASGN,
  NT_CBASE,
  NT_CLASS,
  NT_CONST,
  NT_CSEND,
  NT_CVASGN,
  NT_DEF,
  NT_DEFS,
  NT_DSTR,
  NT_GVASGN,
  NT_IF,
  NT_IVASGN,
  NT_KWBEGIN,
  NT_LVASGN,
  NT_MASGN,
  NT_MODULE,
  NT_NUMBLOCK,
  NT_OP_ASGN,
  NT_OR_ASGN,
  NT_PAIR,
  NT_SCLASS,
  NT_SEND,
  NT_STR,
  NT_XSTR,
  V_NIL,
} from "../ast";
import { add32, atI32, sub32 } from "../../core/arr";
import { fault } from "../../core/fault";
import { RbCop } from "../cop";
import { rnHas, rnHeredoc, rnS, rnE } from "../node";
import { RbRewriter } from "../rewriter";
import { RbSource } from "../source";

// Code point ranges whose Unicode::DisplayWidth (no emoji support, ambiguous
// width 1) is not 1: "first-last:width" in hex, comma-separated.
const LAL_WIDTHS: string =
  "0-0:0,5-5:0,7-8:0,a-f:0,300-36f:0,483-489:0,591-5bd:0,5bf-5bf:0,5c1-5c2:0,5c4-5c5:0,5c7-5c9:0,605-605:0,610-61a:0,61c-61c:0,64b-65f:0,670-670:0,6d6-6dd:0,6df-6e4:0,6e7-6e8:0,6ea-6ed:0,70f-70f:0,711-711:0,730-74a:0,7a6-7b0:0,7eb-7f3:0,7fd-7fd:0,816-819:0,81b-823:0,825-827:0,829-82d:0,859-85b:0,897-89f:0,8ca-902:0,93a-93a:0,93c-93c:0,941-948:0,94d-94d:0,951-957:0,962-963:0,981-981:0,9bc-9bc:0,9c1-9c4:0,9cd-9cd:0,9e2-9e3:0,9fe-9fe:0,a01-a02:0,a3c-a3c:0,a41-a42:0,a47-a48:0,a4b-a4d:0,a51-a51:0,a70-a71:0,a75-a75:0,a81-a82:0,abc-abc:0,ac1-ac5:0,ac7-ac8:0,acd-acd:0,ae2-ae3:0,afa-aff:0,b01-b01:0,b3c-b3c:0,b3f-b3f:0,b41-b44:0,b4d-b4d:0,b53-b56:0,b62-b63:0,b82-b82:0,bc0-bc0:0,bcd-bcd:0,c00-c00:0,c04-c04:0,c3c-c3c:0,c3e-c40:0,c46-c48:0,c4a-c4d:0,c55-c56:0,c62-c63:0,c81-c81:0,cbc-cbc:0,cbf-cbf:0,cc6-cc6:0,ccc-ccd:0,ce2-ce3:0,d00-d01:0,d3b-d3c:0,d41-d44:0,d4d-d4d:0,d62-d63:0,d81-d81:0,dca-dca:0,dd2-dd4:0,dd6-dd6:0,e31-e31:0,e34-e3a:0,e47-e4e:0,eb1-eb1:0,eb4-ebc:0,ec8-ece:0,f18-f19:0,f35-f35:0,f37-f37:0,f39-f39:0,f71-f7e:0,f80-f84:0,f86-f87:0,f8d-f97:0,f99-fbc:0,fc6-fc6:0,102d-1030:0,1032-1037:0,1039-103a:0,103d-103e:0,1058-1059:0,105e-1060:0,1071-1074:0,1082-1082:0,1085-1086:0,108d-108d:0,109d-109d:0,1100-115e:2,115f-11ff:0,135d-135f:0,1712-1714:0,1732-1733:0,1752-1753:0,1772-1773:0,17b4-17b5:0,17b7-17bd:0,17c6-17c6:0,17c9-17d3:0,17dd-17dd:0,180b-180f:0,1885-1886:0,18a9-18a9:0,1920-1922:0,1927-1928:0,1932-1932:0,1939-193b:0,1a17-1a18:0,1a1b-1a1b:0,1a56-1a56:0,1a58-1a5e:0,1a60-1a60:0,1a62-1a62:0,1a65-1a6c:0,1a73-1a7c:0,1a7f-1a7f:0,1ab0-1b03:0,1b34-1b34:0,1b36-1b3a:0,1b3c-1b3c:0,1b42-1b42:0,1b6b-1b73:0,1b80-1b81:0,1ba2-1ba5:0,1ba8-1ba9:0,1bab-1bad:0,1be6-1be6:0,1be8-1be9:0,1bed-1bed:0,1bef-1bf1:0,1c2c-1c33:0,1c36-1c37:0,1cd0-1cd2:0,1cd4-1ce0:0,1ce2-1ce8:0,1ced-1ced:0,1cf4-1cf4:0,1cf8-1cf9:0,1dc0-1dff:0,200b-200f:0,2028-202e:0,2060-206f:0,20d0-20ff:0,231a-231b:2,2329-232a:2,23e9-23ec:2,23f0-23f0:2,23f3-23f3:2,25fd-25fe:2,2614-2615:2,2630-2637:2,2648-2653:2,267f-267f:2,268a-268f:2,2693-2693:2,26a1-26a1:2,26aa-26ab:2,26bd-26be:2,26c4-26c5:2,26ce-26ce:2,26d4-26d4:2,26ea-26ea:2,26f2-26f3:2,26f5-26f5:2,26fa-26fa:2,26fd-26fd:2,2705-2705:2,270a-270b:2,2728-2728:2,274c-274c:2,274e-274e:2,2753-2755:2,2757-2757:2,2795-2797:2,27b0-27b0:2,27bf-27bf:2,2b1b-2b1c:2,2b50-2b50:2,2b55-2b55:2,2cef-2cf1:0,2d7f-2d7f:0,2de0-2dff:0,2e3a-2e3a:2,2e3b-2e3b:3,2e80-2e99:2,2e9b-2fdf:2,2ff0-3029:2,302a-302d:0,302e-303e:2,3041-3096:2,3099-309a:0,309b-30ff:2,3105-312f:2,3131-3163:2,3164-3164:0,3165-31e5:2,31ef-3247:2,3250-a4cf:2,a66f-a672:0,a674-a67d:0,a69e-a69f:0,a6f0-a6f1:0,a802-a802:0,a806-a806:0,a80b-a80b:0,a825-a826:0,a82c-a82c:0,a8c4-a8c5:0,a8e0-a8f1:0,a8ff-a8ff:0,a926-a92d:0,a947-a951:0,a960-a97f:2,a980-a982:0,a9b3-a9b3:0,a9b6-a9b9:0,a9bc-a9bd:0,a9e5-a9e5:0,aa29-aa2e:0,aa31-aa32:0,aa35-aa36:0,aa43-aa43:0,aa4c-aa4c:0,aa7c-aa7c:0,aab0-aab0:0,aab2-aab4:0,aab7-aab8:0,aabe-aabf:0,aac1-aac1:0,aaec-aaed:0,aaf6-aaf6:0,abe5-abe5:0,abe8-abe8:0,abed-abed:0,ac00-d7af:2,d7b0-d7ff:0,f900-faff:2,fb1e-fb1e:0,fe00-fe0f:0,fe10-fe1f:2,fe20-fe2f:0,fe30-fe52:2,fe54-fe66:2,fe68-fe6b:2,feff-feff:0,ff01-ff60:2,ffa0-ffa0:0,ffe0-ffe6:2,fff0-fffb:0,101fd-101fd:0,102e0-102e0:0,10376-1037a:0,10a01-10a03:0,10a05-10a06:0,10a0c-10a0f:0,10a38-10a3a:0,10a3f-10a3f:0,10ae5-10ae6:0,10d24-10d27:0,10d69-10d6d:0,10eab-10eac:0,10ecb-10ecf:0,10ef0-10eff:0,10f46-10f50:0,10f82-10f85:0,11001-11001:0,11038-11046:0,11070-11070:0,11073-11074:0,1107f-11081:0,110b3-110b6:0,110b9-110ba:0,110bd-110bd:0,110c2-110c2:0,110cd-110cd:0,11100-11102:0,11127-1112b:0,1112d-11134:0,11173-11173:0,11180-11181:0,111b6-111be:0,111c9-111cc:0,111cf-111cf:0,1122f-11231:0,11234-11234:0,11236-11237:0,1123e-1123e:0,11241-11241:0,112df-112df:0,112e3-112ea:0,11300-11301:0,1133b-1133c:0,11340-11340:0,11366-1136c:0,11370-1137f:0,113bb-113c0:0,113ce-113ce:0,113d0-113d0:0,113d2-113d2:0,113e1-113e2:0,11438-1143f:0,11442-11444:0,11446-11446:0,1145e-1145e:0,114b3-114b8:0,114ba-114ba:0,114bf-114c0:0,114c2-114c3:0,115b2-115b5:0,115bc-115bd:0,115bf-115c0:0,115dc-115dd:0,11633-1163a:0,1163d-1163d:0,1163f-11640:0,116ab-116ab:0,116ad-116ad:0,116b0-116b5:0,116b7-116b7:0,1171d-1171d:0,1171f-1171f:0,11722-11725:0,11727-1172b:0,1182f-11837:0,11839-1183a:0,1193b-1193c:0,1193e-1193e:0,11943-11943:0,119d4-119d7:0,119da-119db:0,119e0-119e0:0,11a01-11a0a:0,11a33-11a38:0,11a3b-11a3e:0,11a47-11a47:0,11a51-11a56:0,11a59-11a5b:0,11a8a-11a96:0,11a98-11a99:0,11b60-11b60:0,11b62-11b64:0,11b66-11b66:0,11c30-11c36:0,11c38-11c3d:0,11c3f-11c3f:0,11c92-11ca7:0,11caa-11cb0:0,11cb2-11cb3:0,11cb5-11cb6:0,11d31-11d36:0,11d3a-11d3a:0,11d3c-11d3d:0,11d3f-11d45:0,11d47-11d47:0,11d90-11d91:0,11d95-11d95:0,11d97-11d97:0,11df0-11df0:0,11ef3-11ef4:0,11f00-11f01:0,11f36-11f3a:0,11f40-11f40:0,11f42-11f42:0,11f5a-11f5a:0,13430-13440:0,13447-1345f:0,1611e-16129:0,1612d-1612f:0,16af0-16af4:0,16b30-16b36:0,16f4f-16f4f:0,16f8f-16f92:0,16fe0-16fe3:2,16fe4-16fe4:0,16ff0-18cdf:2,18cff-18d2f:2,18d80-19fff:2,1aff0-1aff3:2,1aff5-1affb:2,1affd-1affe:2,1b000-1b12f:2,1b132-1b132:2,1b150-1b152:2,1b155-1b155:2,1b164-1b168:2,1b170-1b2ff:2,1bc9d-1bc9e:0,1bca0-1bcaf:0,1cf00-1cf4f:0,1d127-1d128:0,1d167-1d169:0,1d173-1d182:0,1d185-1d18b:0,1d1aa-1d1ad:0,1d242-1d244:0,1d25b-1d25c:0,1d300-1d376:2,1da00-1da36:0,1da3b-1da6c:0,1da75-1da75:0,1da84-1da84:0,1da9b-1da9f:0,1daa1-1daaf:0,1e000-1e006:0,1e008-1e018:0,1e01b-1e021:0,1e023-1e024:0,1e026-1e02a:0,1e08f-1e08f:0,1e130-1e136:0,1e2ae-1e2ae:0,1e2ec-1e2ef:0,1e4ec-1e4ef:0,1e5ee-1e5ef:0,1e6e3-1e6e3:0,1e6e6-1e6e6:0,1e6ee-1e6ef:0,1e6f5-1e6f5:0,1e8d0-1e8df:0,1e944-1e94a:0,1f004-1f004:2,1f0cf-1f0cf:2,1f18e-1f18e:2,1f191-1f19a:2,1f1ae-1f1ae:2,1f200-1f320:2,1f32d-1f335:2,1f337-1f37c:2,1f37e-1f393:2,1f3a0-1f3ca:2,1f3cf-1f3d3:2,1f3e0-1f3f0:2,1f3f4-1f3f4:2,1f3f8-1f43e:2,1f440-1f440:2,1f442-1f4fc:2,1f4ff-1f53d:2,1f54b-1f54e:2,1f550-1f567:2,1f57a-1f57a:2,1f595-1f596:2,1f5a4-1f5a4:2,1f5fb-1f64f:2,1f680-1f6c5:2,1f6cc-1f6cc:2,1f6d0-1f6d2:2,1f6d5-1f6d9:2,1f6dc-1f6df:2,1f6eb-1f6ec:2,1f6f4-1f6fc:2,1f7da-1f7da:2,1f7e0-1f7f0:2,1f90c-1f93a:2,1f93c-1f945:2,1f947-1f9ff:2,1fa70-1fac6:2,1fac8-1fac8:2,1facc-1fadd:2,1fadf-1faeb:2,1faef-1faff:2,20000-3ffff:2,e0000-effff:0";

/** Ruby's /\s/. */
export const lalIsWs = (c: i32): boolean => c === 32 || (c >= 9 && c <= 13);

/** String#lstrip's whitespace (/\s/ and NUL). */
export const lalIsStripWs = (c: i32): boolean => c === 0 || c === 32 || (c >= 9 && c <= 13);

const lalHex = (s: string, from: i32, to: i32): i32 => {
  let v = 0;
  let i = from;
  while (i >= 0 && i < to && i < s.length) {
    const c = s.charCodeAt(i) & 0xff;
    const d = c <= 57 ? c - 48 : c - 87;
    const r = toI64(v) * toI64(16) + toI64(d);
    if (r < toI64(-2147483648) || r > toI64(2147483647)) {
      fault();
      return 0;
    }
    v = toI32(r);
    i++;
  }
  // [from, to) lies in the table text.
  if (i < to) {
    fault();
    return 0;
  }
  return v;
};

/** Unicode::DisplayWidth.of for single code points (the width of a string is their sum). */
export class LalWidth {
  lo: i32[];
  hi: i32[];
  w: i32[];
  ready: boolean = false;

  constructor() {
    this.lo = [];
    this.hi = [];
    this.w = [];
  }

  private load(): void {
    this.ready = true;
    const s = LAL_WIDTHS;
    const n = toI32(s.length);
    let p = 0;
    while (p < n) {
      const dash = s.indexOf("-", p);
      const colon = s.indexOf(":", dash);
      let comma = s.indexOf(",", colon);
      if (comma < 0) {
        comma = n;
      }
      this.lo.push(lalHex(s, p, dash));
      this.hi.push(lalHex(s, add32(dash, 1), colon));
      this.w.push(lalHex(s, add32(colon, 1), comma));
      if (comma >= n) {
        break;
      }
      p = comma + 1;
    }
  }

  of(cp: i32): i32 {
    if (cp >= 16 && cp < 0x300) {
      return 1;
    }
    if (!this.ready) {
      this.load();
    }
    const los = this.lo;
    const his = this.hi;
    const ws = this.w;
    let lo = 0;
    let hi = toI32(los.length);
    while (lo >= 0 && lo < hi) {
      // 0 <= lo < hi <= length, so the u32 sum is exact.
      const mid = toI32((toU32(lo) + toU32(hi)) >> toU32(1));
      // load pushes lo, hi and w together.
      if (mid < 0 || mid >= his.length) {
        fault();
        return 1;
      }
      if (his[mid] < cp) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    if (lo >= 0 && lo < los.length && los[lo] <= cp) {
      if (lo >= ws.length) {
        fault();
        return 1;
      }
      return ws[lo];
    }
    return 1;
  }
}

// ---- Lines ---------------------------------------------------------------------

/** The start of the line holding `pos`. */
export const lalLineStartOf = (src: RbSource, pos: i32): i32 => src.lineStart(src.line(pos));

/** `source_line =~ /\S/` of 1-based line `l`: the column of its first non-space, or -1 (nil). */
export const lalFirstNonWs = (src: RbSource, l: i32): i32 => {
  const s = src.lineStart(l);
  const e = src.lineEnd(l);
  const pts = src.pts;
  let p = s;
  while (p >= 0 && p < e && p < pts.length) {
    if (!lalIsWs(pts[p])) {
      return sub32(p, s);
    }
    p++;
  }
  // A line lies in the source.
  if (p < e) {
    fault();
  }
  return -1;
};

/** ProcessedSource#line_indentation: the length of the line's leading /\s*\/. */
export const lalLineIndentation = (src: RbSource, l: i32): i32 => {
  const s = src.lineStart(l);
  const e = src.lineEnd(l);
  const pts = src.pts;
  let p = s;
  while (p >= 0 && p < e && p < pts.length && lalIsWs(pts[p])) {
    p++;
  }
  // A line lies in the source.
  if (p < e && (p < 0 || p >= pts.length)) {
    fault();
    return 0;
  }
  return sub32(p, s);
};

/** String#blank? of 1-based line `l`. */
export const lalLineBlank = (src: RbSource, l: i32): boolean => {
  const e = src.lineEnd(l);
  const pts = src.pts;
  let p = src.lineStart(l);
  while (p >= 0 && p < e && p < pts.length) {
    if (!lalIsStripWs(pts[p])) {
      return false;
    }
    p++;
  }
  // A line lies in the source.
  if (p < e) {
    fault();
  }
  return true;
};

/** Util#begins_its_line? of a range starting at `pos`. */
export const lalBeginsItsLine = (src: RbSource, pos: i32): boolean =>
  lalFirstNonWs(src, src.line(pos)) === src.column(pos);

/** Whether a node begins its line. */
export const lalNodeBeginsLine = (src: RbSource, n: i32): boolean => lalBeginsItsLine(src, src.a.exS(n));

/** RangeHelp#effective_column: the column, less a byte order mark on line 1. */
export const lalEffCol = (src: RbSource, pos: i32): i32 => {
  const c = src.column(pos);
  if (src.line(pos) === 1 && src.n > 0 && atI32(src.pts, 0) === 0xfeff) {
    return sub32(c, 1);
  }
  return c;
};

/** Node#first_line / last_line. */
export const lalFirstLine = (src: RbSource, n: i32): i32 => src.line(src.a.exS(n));
export const lalLastLine = (src: RbSource, n: i32): i32 => src.line(src.a.exE(n));
export const lalSingleLine = (src: RbSource, n: i32): boolean => lalFirstLine(src, n) === lalLastLine(src, n);

// ---- Node predicates -----------------------------------------------------------

export const lalIsType = (src: RbSource, n: i32, t: i32): boolean => src.a.isNode(n) && src.a.type(n) === t;

export const lalIsCall = (src: RbSource, n: i32): boolean =>
  src.a.isNode(n) && (src.a.type(n) === NT_SEND || src.a.type(n) === NT_CSEND);

export const lalIsBlockType = (src: RbSource, n: i32): boolean =>
  src.a.isNode(n) && (src.a.type(n) === NT_BLOCK || src.a.type(n) === NT_NUMBLOCK);

/** Node#assignment? of a non-send node (the EQUALS and SHORTHAND assignment types). */
export const lalAsgnType = (t: i32): boolean =>
  t === NT_LVASGN ||
  t === NT_IVASGN ||
  t === NT_CVASGN ||
  t === NT_GVASGN ||
  t === NT_CASGN ||
  t === NT_MASGN ||
  t === NT_OP_ASGN ||
  t === NT_OR_ASGN ||
  t === NT_AND_ASGN;

/** Node#assignment? (MethodDispatchNode#assignment? = setter_method? for calls). */
export const lalAssignment = (src: RbSource, n: i32): boolean => {
  if (!src.a.isNode(n)) {
    return false;
  }
  const t = src.a.type(n);
  if (t === NT_SEND || t === NT_CSEND) {
    return rnHas(src, n, F_OPERATOR);
  }
  return lalAsgnType(t);
};

/** The arguments of a send/csend/super/yield, or a def's/defs' parameters (`arguments`). */
export const lalArgs = (src: RbSource, n: i32): i32[] => {
  const a = src.a;
  const out: i32[] = [];
  const t = a.type(n);
  let from = 0;
  let node = n;
  if (t === NT_SEND || t === NT_CSEND) {
    from = 2;
  } else if (t === NT_DEF) {
    node = a.kid(n, 1);
  } else if (t === NT_DEFS) {
    node = a.kid(n, 2);
  }
  if (node === V_NIL) {
    return out;
  }
  for (let i = from; i < a.nKid(node); i++) {
    out.push(a.kid(node, i));
  }
  return out;
};

/** The method name of a call ("" for super/yield). */
export const lalMethod = (src: RbSource, n: i32): string => {
  const t = src.a.type(n);
  if (t === NT_SEND || t === NT_CSEND) {
    return src.a.text(src.a.kid(n, 1));
  }
  return "";
};

/** MethodIdentifierPredicates::OPERATOR_METHODS. */
export const lalOperatorMethod = (m: string): boolean =>
  ",|,^,&,<=>,==,===,=~,>,>=,<,<=,<<,>>,+,-,*,/,%,**,~,+@,-@,!@,~@,[],[]=,!,!=,!~,`,".indexOf(`,${m},`) >= 0;

/** MethodDispatchNode#selector: loc.keyword or loc.selector (field id; -1 when absent). */
export const lalSelectorField = (src: RbSource, n: i32): i32 => {
  if (rnHas(src, n, F_KEYWORD)) {
    return F_KEYWORD;
  }
  if (rnHas(src, n, F_SELECTOR)) {
    return F_SELECTOR;
  }
  return -1;
};

/** MethodDispatchNode#operator_method? (a call's method name). */
export const lalIsOperatorCall = (src: RbSource, n: i32): boolean =>
  lalIsCall(src, n) && lalOperatorMethod(lalMethod(src, n));

/** MethodDispatchNode#binary_operation?. */
export const lalBinaryOperation = (src: RbSource, n: i32): boolean => {
  const f = lalSelectorField(src, n);
  if (f < 0) {
    return false;
  }
  return lalIsOperatorCall(src, n) && src.a.exS(n) !== rnS(src, n, f);
};

/** global_const?(names): (const {nil? cbase} name). */
const lalGlobalConst = (src: RbSource, n: i32, names: string): boolean => {
  const a = src.a;
  if (!lalIsType(src, n, NT_CONST)) {
    return false;
  }
  const scope = a.kid(n, 0);
  if (scope !== V_NIL && !lalIsType(src, scope, NT_CBASE)) {
    return false;
  }
  return `,${names},`.indexOf(`,${a.text(a.kid(n, 1))},`) >= 0;
};

/** The send part of class_constructor?. */
const lalCtorSend = (src: RbSource, n: i32): boolean => {
  if (!lalIsType(src, n, NT_SEND)) {
    return false;
  }
  const m = src.a.text(src.a.kid(n, 1));
  const r = src.a.kid(n, 0);
  return (
    (m === "new" && lalGlobalConst(src, r, "Class,Module,Struct")) || (m === "define" && lalGlobalConst(src, r, "Data"))
  );
};

/** MethodDispatchNode#in_macro_scope?. */
export const lalMacroScope = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  const p = src.parent(n);
  if (p === V_NIL) {
    return true;
  }
  const t = a.type(p);
  if (t === NT_SCLASS || t === NT_CLASS || t === NT_MODULE) {
    return true;
  }
  if (lalCtorSend(src, p) || (lalIsBlockType(src, p) && lalCtorSend(src, a.kid(p, 0)))) {
    return true;
  }
  let wrapper = t === NT_KWBEGIN || t === NT_BEGIN || lalIsBlockType(src, p);
  if (t === NT_IF && a.kid(p, 0) !== n) {
    wrapper = true;
  }
  return wrapper && lalMacroScope(src, p);
};

/** MethodDispatchNode#bare_access_modifier? (also checks the node is a send). */
export const lalBareAccessModifier = (src: RbSource, n: i32): boolean => {
  const a = src.a;
  if (!lalIsType(src, n, NT_SEND) || a.kid(n, 0) !== V_NIL || a.nKid(n) !== 2) {
    return false;
  }
  const m = a.text(a.kid(n, 1));
  if (m !== "public" && m !== "protected" && m !== "private" && m !== "module_function") {
    return false;
  }
  return lalMacroScope(src, n);
};

/** Util#parentheses?: loc.end is `)`. */
export const lalParentheses = (src: RbSource, n: i32): boolean => {
  if (!rnHas(src, n, F_END)) {
    return false;
  }
  const e = rnS(src, n, F_END);
  return rnE(src, n, F_END) === add32(e, 1) && src.at(e) === 41;
};

/** CheckAssignment#extract_rhs (V_NIL for none). */
export const lalExtractRhs = (src: RbSource, n: i32): i32 => {
  const a = src.a;
  const t = a.type(n);
  if (t === NT_SEND || t === NT_CSEND) {
    const k = a.nKid(n);
    return k > 2 ? a.kid(n, k - 1) : V_NIL;
  }
  if (t === NT_LVASGN || t === NT_IVASGN || t === NT_CVASGN || t === NT_GVASGN) {
    return a.kid(n, 1);
  }
  if (t === NT_CASGN || t === NT_OP_ASGN) {
    return a.kid(n, 2);
  }
  if (t === NT_MASGN || t === NT_OR_ASGN || t === NT_AND_ASGN) {
    return a.kid(n, 1);
  }
  return V_NIL;
};

/** Whether a node is one CheckAssignment's callbacks visit (on_send and the assignments). */
export const lalCheckAsgnType = (t: i32): boolean => t === NT_SEND || lalAsgnType(t);

/** Util#first_part_of_call_chain. */
export const lalFirstPartOfCallChain = (src: RbSource, n0: i32): i32 => {
  let n = n0;
  while (n !== V_NIL && src.a.isNode(n)) {
    if (lalIsCall(src, n)) {
      n = src.a.kid(n, 0);
    } else if (lalIsBlockType(src, n)) {
      n = src.a.kid(n, 0);
    } else {
      break;
    }
  }
  return n;
};

/** Whether `inner` [s, e) lies within `outer` (Alignment#within?). */
export const lalWithin = (s: i32, e: i32, os: i32, oe: i32): boolean => s >= os && e <= oe;

/** ignore_node / ignored_node? / part_of_ignored_node?. */
export class LalIgnored {
  nodes: i32[];

  constructor() {
    this.nodes = [];
  }

  reset(): void {
    const none: i32[] = [];
    this.nodes = none;
  }

  add(n: i32): void {
    this.nodes.push(n);
  }

  has(n: i32): boolean {
    for (const x of this.nodes) {
      if (x === n) {
        return true;
      }
    }
    return false;
  }

  /** part_of_ignored_node?: within the range of a node ignored earlier. */
  partOf(src: RbSource, n: i32): boolean {
    const s = src.a.exS(n);
    const e = src.a.exE(n);
    for (const x of this.nodes) {
      if (src.a.exS(x) <= s && e <= src.a.exE(x)) {
        return true;
      }
    }
    return false;
  }
}

// ---- Alignment and AlignmentCorrector -----------------------------------------------

/** The Alignment mixin and the AlignmentCorrector, for one source. */
export class LalAligner {
  src: RbSource | null = null;
  wid: LalWidth;
  // AlignmentCorrector#source_string_ranges (computed on first use).
  globS: i32[];
  globE: i32[];
  globReady: boolean = false;
  // The =begin/=end comments.
  docS: i32[];
  docE: i32[];
  // each_bad_alignment's results: the item and its column delta.
  badItems: i32[];
  badDeltas: i32[];

  constructor() {
    this.wid = new LalWidth();
    this.globS = [];
    this.globE = [];
    this.docS = [];
    this.docE = [];
    this.badItems = [];
    this.badDeltas = [];
  }

  begin(src: RbSource): void {
    this.src = src;
    const none: i32[] = [];
    this.globS = none;
    const none2: i32[] = [];
    this.globE = none2;
    this.globReady = false;
    const d1: i32[] = [];
    const d2: i32[] = [];
    for (let i = 0; i < toI32(src.commS.length); i++) {
      const s = src.commS[i];
      if (src.at(s) === 61) {
        d1.push(s);
        d2.push(atI32(src.commE, i));
      }
    }
    this.docS = d1;
    this.docE = d2;
  }

  /** Alignment#display_column of a range starting at `pos`. */
  dispCol(src: RbSource, pos: i32): i32 {
    const ls = lalLineStartOf(src, pos);
    const pts = src.pts;
    let w = 0;
    let p = ls;
    while (p >= 0 && p < pos && p < pts.length) {
      w = add32(w, this.wid.of(pts[p]));
      p++;
    }
    // pos lies in the source.
    if (p < pos) {
      fault();
      return 0;
    }
    return w;
  }

  /**
   * Alignment#each_bad_alignment: the items that begin their line, each on a
   * later line than the one before, and are off `base` (in badItems/badDeltas).
   */
  eachBad(src: RbSource, items: i32[], base: i32): void {
    const bi: i32[] = [];
    const bd: i32[] = [];
    let prev = -1;
    for (const cur of items) {
      const s = src.a.exS(cur);
      const l = src.line(s);
      if (l > prev && lalBeginsItsLine(src, s)) {
        const d = sub32(base, this.dispCol(src, s));
        if (d !== 0) {
          bi.push(cur);
          bd.push(d);
        }
      }
      prev = l;
    }
    this.badItems = bi;
    this.badDeltas = bd;
  }

  /**
   * Alignment#check_alignment with the AlignmentCorrector as autocorrect:
   * `base` < 0 (with `hasBase` false) takes the first item's display column.
   */
  check(cop: RbCop, src: RbSource, items: i32[], base0: i32, hasBase: boolean): void {
    const n = toI32(items.length);
    if (n <= 0) {
      return;
    }
    const base = hasBase ? base0 : this.dispCol(src, src.a.exS(atI32(items, 0)));
    this.eachBad(src, items, base);
    const bi = this.badItems;
    const bd = this.badDeltas;
    for (let i = 0; i < toI32(bi.length); i++) {
      // eachBad pushes an item and its delta together.
      if (i >= bd.length) {
        fault();
        return;
      }
      this.register(cop, src, bi[i], bd[i]);
    }
  }

  /** Alignment#check_alignment's registration of one bad item. */
  register(cop: RbCop, src: RbSource, cur: i32, delta: i32): void {
    const s = src.a.exS(cur);
    const e = src.a.exE(cur);
    if (this.withinOffense(cop, s, e)) {
      cop.offense(s, e);
      return;
    }
    const k = cop.offense(s, e);
    if (k !== null) {
      this.correct(src, k, s, e, delta, cur);
      cop.commit(k);
    }
  }

  /** `@current_offenses&.any? { |o| within?(expr, o.location) }`. */
  withinOffense(cop: RbCop, s: i32, e: i32): boolean {
    const offE = cop.offE;
    for (let i = 0; i < toI32(cop.offS.length); i++) {
      // Every offense has a start and an end.
      if (i >= offE.length) {
        fault();
        return false;
      }
      if (lalWithin(s, e, cop.offS[i], offE[i])) {
        return true;
      }
    }
    return false;
  }

  /** AlignmentCorrector#inside_string_range of one string node, pushed onto the lists. */
  private strRange(src: RbSource, n: i32, os: i32[], oe: i32[]): void {
    const t = src.a.type(n);
    if (t !== NT_STR && t !== NT_DSTR && t !== NT_XSTR) {
      return;
    }
    if (rnHeredoc(src, n)) {
      os.push(rnS(src, n, F_HEREDOC_BODY));
      oe.push(rnE(src, n, F_HEREDOC_END));
    } else if (rnHas(src, n, F_BEGIN) && rnHas(src, n, F_END)) {
      os.push(rnE(src, n, F_BEGIN));
      oe.push(rnS(src, n, F_END));
    }
  }

  /** string_ranges(node): every string in the subtree, pre-order. */
  stringRanges(src: RbSource, root: i32, os: i32[], oe: i32[]): void {
    const a = src.a;
    const stack: i32[] = [root];
    while (stack.length > 0) {
      const sn = toI32(stack.length);
      if (sn <= 0) {
        break;
      }
      const n = stack[sn - 1];
      if (stack.length > 0) {
        stack.pop();
      }
      this.strRange(src, n, os, oe);
      for (let i = sub32(a.nKid(n), 1); i >= 0; i--) {
        const c = a.kid(n, i);
        if (a.isNode(c)) {
          stack.push(c);
        }
      }
    }
  }

  /**
   * AlignmentCorrector.correct: shift every line of [s, e) by `delta`
   * columns, skipping lines that begin inside a string or heredoc. `node`
   * is the node the range comes from, or V_NIL for a bare range.
   */
  correct(src: RbSource, k: RbRewriter, s: i32, e: i32, delta: i32, node: i32): void {
    const docS = this.docS;
    const docE = this.docE;
    for (let i = 0; i < toI32(docS.length); i++) {
      // begin pushes a start and an end together.
      if (i >= docE.length) {
        fault();
        return;
      }
      if (lalWithin(docS[i], docE[i], s, e)) {
        return;
      }
    }
    let ts: i32[] = [];
    let te: i32[] = [];
    if (node !== V_NIL) {
      this.stringRanges(src, node, ts, te);
    } else {
      if (!this.globReady) {
        this.globReady = true;
        if (src.root !== V_NIL) {
          this.stringRanges(src, src.root, this.globS, this.globE);
        }
      }
      ts = this.globS;
      te = this.globE;
    }
    // each_line(expr)
    let lbp = s;
    while (lbp < e) {
      this.correctLine(src, k, lbp, delta, ts, te);
      const pts = src.pts;
      let p = lbp;
      while (p >= 0 && p < e && p < pts.length && pts[p] !== 10) {
        p++;
      }
      if (p >= e) {
        break;
      }
      // The range lies in the source.
      if (p < 0 || p >= pts.length) {
        fault();
        return;
      }
      lbp = p + 1;
    }
  }

  /** AlignmentCorrector#autocorrect_line. */
  private correctLine(src: RbSource, k: RbRewriter, lbp: i32, delta: i32, ts: i32[], te: i32[]): void {
    let rs = lbp;
    let re = lbp;
    if (delta < 0) {
      const ad = sub32(0, delta);
      if (src.at(lbp) === 32) {
        re = add32(lbp, ad);
      } else {
        rs = sub32(lbp, ad);
      }
    }
    for (let i = 0; i < toI32(ts.length); i++) {
      // stringRanges pushes a start and an end together.
      if (i >= te.length) {
        fault();
        return;
      }
      if (lalWithin(rs, re, ts[i], te[i])) {
        return;
      }
    }
    if (delta > 0 && src.at(rs) !== 10) {
      const sp: string[] = [];
      for (let i = 0; i < delta; i++) {
        sp.push(" ");
      }
      k.insertBefore(rs, re, sp.join(""));
      return;
    }
    if (re > rs && rs >= 0 && re <= src.n) {
      const pts = src.pts;
      for (let p = rs; p >= 0 && p < re; p++) {
        // re <= src.n, the length of pts.
        if (p >= pts.length) {
          fault();
          return;
        }
        const c = pts[p];
        if (c !== 32 && c !== 9) {
          return;
        }
      }
      k.remove(rs, re);
    }
  }
}

/** A string of `n` spaces. */
export const lalSpaces = (n: i32): string => {
  const sp: string[] = [];
  for (let i = 0; i < n; i++) {
    sp.push(" ");
  }
  return sp.join("");
};

// ---- MultilineElementIndentation ----------------------------------------------------

/**
 * MultilineElementIndentation#indent_base's column: `lb` is the left brace
 * (bracket, parenthesis) position, `first` the first element (V_NIL for
 * nil), `lp` the left parenthesis of the call (-1 for nil); `special` is the
 * special_inside_parentheses style.
 */
export const lalIndentBase = (src: RbSource, lb: i32, first: i32, lp: i32, special: boolean): i32 => {
  const a = src.a;
  // hash_pair_where_value_beginning_with
  let pair = V_NIL;
  if (first !== V_NIL) {
    const fp = src.parent(first);
    if (fp !== V_NIL && rnHas(src, fp, F_BEGIN) && rnS(src, fp, F_BEGIN) === lb) {
      const gp = src.parent(fp);
      if (gp !== V_NIL && a.type(gp) === NT_PAIR) {
        pair = gp;
      }
    }
  }
  if (pair !== V_NIL && lalFirstLine(src, a.kid(pair, 0)) === lalFirstLine(src, a.kid(pair, 1))) {
    // right_sibling_begins_on_subsequent_line?
    const h = src.parent(pair);
    let sib = V_NIL;
    if (h !== V_NIL) {
      for (let i = 0; i < a.nKid(h) && i + 1 < a.nKid(h); i++) {
        if (a.kid(h, i) === pair) {
          sib = a.kid(h, i + 1);
        }
      }
    }
    if (sib !== V_NIL && a.isNode(sib) && lalLastLine(src, pair) < lalFirstLine(src, sib)) {
      return src.column(a.exS(pair));
    }
  }
  if (lp >= 0 && special) {
    return add32(src.column(lp), 1);
  }
  return lalFirstNonWs(src, src.line(lb));
};

/** Cop::Util#on_node(type, arg, :send): the nodes of type `t` in `arg`'s subtree, not entering sends. */
export const lalOnNode = (src: RbSource, t: i32, arg: i32, out: i32[]): void => {
  const a = src.a;
  if (!a.isNode(arg)) {
    return;
  }
  const stack: i32[] = [arg];
  while (stack.length > 0) {
    const sn = toI32(stack.length);
    if (sn <= 0) {
      break;
    }
    const n = stack[sn - 1];
    if (stack.length > 0) {
      stack.pop();
    }
    const nt = a.type(n);
    if (nt === t) {
      out.push(n);
    }
    if (nt === NT_SEND) {
      continue;
    }
    for (let i = sub32(a.nKid(n), 1); i >= 0; i--) {
      const c = a.kid(n, i);
      if (a.isNode(c)) {
        stack.push(c);
      }
    }
  }
};

/**
 * MultilineElementIndentation#each_argument_node: the `t` nodes of a call's
 * arguments whose left brace is on the line of the call's left parenthesis.
 */
export const lalEachArgumentNode = (src: RbSource, call: i32, t: i32): i32[] => {
  const out: i32[] = [];
  if (!rnHas(src, call, F_BEGIN)) {
    return out;
  }
  const lpl = src.line(rnS(src, call, F_BEGIN));
  for (const arg of lalArgs(src, call)) {
    const found: i32[] = [];
    lalOnNode(src, t, arg, found);
    for (const n of found) {
      if (rnHas(src, n, F_BEGIN) && src.line(rnS(src, n, F_BEGIN)) === lpl) {
        out.push(n);
      }
    }
  }
  return out;
};

/** MultilineElementIndentation#check_first with the AlignmentCorrector on the element node. */
export const lalCheckFirst = (
  cop: RbCop,
  al: LalAligner,
  src: RbSource,
  first: i32,
  lb: i32,
  lp: i32,
  special: boolean,
  offset: i32,
): void => {
  const s = src.a.exS(first);
  const e = src.a.exE(first);
  const expected = add32(add32(lalIndentBase(src, lb, first, lp, special), 2), offset);
  const delta = sub32(expected, src.column(s));
  if (delta === 0) {
    return;
  }
  const k = cop.offense(s, e);
  if (k !== null) {
    al.correct(src, k, s, e, delta, first);
    cop.commit(k);
  }
};

/** check_right_bracket / check_right_brace: `rb` is the closing token's position. */
export const lalCheckRight = (
  cop: RbCop,
  al: LalAligner,
  src: RbSource,
  rb: i32,
  first: i32,
  lb: i32,
  lp: i32,
  special: boolean,
): void => {
  const ls = lalLineStartOf(src, rb);
  const pts = src.pts;
  let p = ls;
  while (p >= 0 && p < rb && p < pts.length) {
    if (!lalIsWs(pts[p])) {
      return;
    }
    p++;
  }
  // rb lies in the source.
  if (p < rb) {
    fault();
    return;
  }
  const expected = lalIndentBase(src, lb, first, lp, special);
  const delta = sub32(expected, src.column(rb));
  if (delta === 0) {
    return;
  }
  const rb1 = add32(rb, 1);
  const k = cop.offense(rb, rb1);
  if (k !== null) {
    al.correct(src, k, rb, rb1, delta, V_NIL);
    cop.commit(k);
  }
};
