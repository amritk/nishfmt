// The language features a file's syntax needs, against its language version.
//
// The analyzer of Dart SDK 3.14.1 (_fe_analyzer_shared's
// experiments/flags.dart, BSD-3-Clause, Copyright the Dart project authors)
// enables each feature from a release version; syntax of a feature the
// file's version does not enable is a syntax error, and dart format rejects
// the file. The parser here takes that syntax at any version, so after the
// parse this walk finds the newest feature the file uses, and formatDart
// leaves the file untouched when it is newer than the file's version.
// (Features released at 2.12 or before are on at every version dart format
// takes: `int?` parses even at `// @dart=2.9`. Patterns and primary
// constructors also change how older code parses; the parser follows those.)

import {
  DtAst,
  dtSig,
  N_ANNOTATION,
  N_ARGUMENT_LIST,
  N_ASSIGNED_VARIABLE_PATTERN,
  N_ASSIGNMENT_EXPRESSION,
  N_BINARY_EXPRESSION,
  N_BLOCK_ENUM_BODY,
  N_CASE_CLAUSE,
  N_CAST_PATTERN,
  N_CLASS_DECLARATION,
  N_CLASS_TYPE_ALIAS,
  N_CONSTANT_PATTERN,
  N_CONSTRUCTOR_DECLARATION,
  N_DECLARED_VARIABLE_PATTERN,
  N_DOT_SHORTHAND_CONSTRUCTOR_INVOCATION,
  N_DOT_SHORTHAND_INVOCATION,
  N_DOT_SHORTHAND_PROPERTY_ACCESS,
  N_EMPTY_CLASS_BODY,
  N_EMPTY_ENUM_BODY,
  N_ENUM_CONSTANT_DECLARATION,
  N_ENUM_DECLARATION,
  N_EXTENSION_TYPE_DECLARATION,
  N_FOR_EACH_PARTS_WITH_PATTERN,
  N_FOR_PARTS_WITH_PATTERN,
  N_FUNCTION_REFERENCE,
  N_GENERIC_FUNCTION_TYPE,
  N_GENERIC_TYPE_ALIAS,
  N_GUARDED_PATTERN,
  N_LIBRARY_DIRECTIVE,
  N_LIST_PATTERN,
  N_LOGICAL_AND_PATTERN,
  N_LOGICAL_OR_PATTERN,
  N_MAP_LITERAL_ENTRY,
  N_MAP_PATTERN,
  N_MAP_PATTERN_ENTRY,
  N_METHOD_DECLARATION,
  N_MIXIN_DECLARATION,
  N_NAME_WITH_TYPE_PARAMETERS,
  N_NAMED_ARGUMENT,
  N_NULL_ASSERT_PATTERN,
  N_NULL_AWARE_ELEMENT,
  N_NULL_CHECK_PATTERN,
  N_OBJECT_PATTERN,
  N_PARENTHESIZED_PATTERN,
  N_PATTERN_ASSIGNMENT,
  N_PATTERN_FIELD,
  N_PATTERN_FIELD_NAME,
  N_PATTERN_VARIABLE_DECLARATION,
  N_PATTERN_VARIABLE_DECLARATION_STATEMENT,
  N_PRIMARY_CONSTRUCTOR_BODY,
  N_PRIMARY_CONSTRUCTOR_DECLARATION,
  N_RECORD_LITERAL,
  N_RECORD_PATTERN,
  N_RECORD_TYPE_ANNOTATION,
  N_RELATIONAL_PATTERN,
  N_REST_PATTERN_ELEMENT,
  N_SIMPLE_IDENTIFIER,
  N_SUPER_FORMAL_PARAMETER,
  N_SWITCH_EXPRESSION,
  N_SWITCH_PATTERN_CASE,
  N_WHEN_CLAUSE,
  N_WILDCARD_PATTERN,
} from "./ast";
import { DtTokens } from "./scanner";
import { K_NEW, T_DOUBLE, T_INT, T_USHR, T_USHR_EQ } from "./tokens";

/** The newest feature a file uses: its version (major * 1000 + minor, 0 for none) and name. */
export class DtFeature {
  ver: i32 = 0;
  name: string = "";
  constructor() {}
}

const dtNeed = (f: DtFeature, ver: i32, name: string): void => {
  if (ver > f.ver) {
    f.ver = ver;
    f.name = name;
  }
};

/** The newest language feature the syntax under `unit` needs, into `f`. */
export const dtFeatures = (a: DtAst, t: DtTokens, unit: i32, f: DtFeature): void => {
  // digit-separators (3.6): an underscore in a number.
  for (let i = 0; i < t.count; i++) {
    if (t.kind[i] === T_INT || t.kind[i] === T_DOUBLE) {
      for (let j = t.start[i]; j < t.end[i]; j++) {
        if (toI32(t.src[j]) === 95) {
          dtNeed(f, 3006, "digit-separators");
          break;
        }
      }
    }
  }
  dtFeatureNode(a, t, unit, -1, f);
};

const dtIsPattern = (k: i32): boolean =>
  k === N_CASE_CLAUSE ||
  k === N_SWITCH_EXPRESSION ||
  k === N_SWITCH_PATTERN_CASE ||
  k === N_GUARDED_PATTERN ||
  k === N_WHEN_CLAUSE ||
  k === N_PATTERN_ASSIGNMENT ||
  k === N_PATTERN_VARIABLE_DECLARATION ||
  k === N_PATTERN_VARIABLE_DECLARATION_STATEMENT ||
  k === N_FOR_PARTS_WITH_PATTERN ||
  k === N_FOR_EACH_PARTS_WITH_PATTERN ||
  k === N_CONSTANT_PATTERN ||
  k === N_DECLARED_VARIABLE_PATTERN ||
  k === N_ASSIGNED_VARIABLE_PATTERN ||
  k === N_WILDCARD_PATTERN ||
  k === N_LIST_PATTERN ||
  k === N_MAP_PATTERN ||
  k === N_MAP_PATTERN_ENTRY ||
  k === N_RECORD_PATTERN ||
  k === N_PATTERN_FIELD ||
  k === N_PATTERN_FIELD_NAME ||
  k === N_OBJECT_PATTERN ||
  k === N_PARENTHESIZED_PATTERN ||
  k === N_LOGICAL_OR_PATTERN ||
  k === N_LOGICAL_AND_PATTERN ||
  k === N_RELATIONAL_PATTERN ||
  k === N_CAST_PATTERN ||
  k === N_NULL_CHECK_PATTERN ||
  k === N_NULL_ASSERT_PATTERN ||
  k === N_REST_PATTERN_ELEMENT;

const dtFeatureNode = (a: DtAst, t: DtTokens, node: i32, parent: i32, f: DtFeature): void => {
  const k = a.kind[node];
  const pk = parent >= 0 ? a.kind[parent] : -1;
  if (dtIsPattern(k)) {
    dtNeed(f, 3000, "patterns");
  } else if (k === N_RECORD_LITERAL || k === N_RECORD_TYPE_ANNOTATION) {
    dtNeed(f, 3000, "records");
  } else if (k === N_GENERIC_TYPE_ALIAS) {
    // typedef T = <a type that is not a function type>;
    const ty = a.f(node, 5);
    if (ty >= 0 && a.kind[ty] !== N_GENERIC_FUNCTION_TYPE) {
      dtNeed(f, 2013, "nonfunction-type-aliases");
    }
  } else if (k === N_ANNOTATION) {
    if (a.f(node, 2) >= 0) {
      dtNeed(f, 2014, "generic-metadata");
    }
  } else if (k === N_BINARY_EXPRESSION || k === N_ASSIGNMENT_EXPRESSION) {
    const op = t.kind[a.f(node, 1)];
    if (op === T_USHR || op === T_USHR_EQ) {
      dtNeed(f, 2014, "triple-shift");
    }
  } else if (k === N_METHOD_DECLARATION) {
    const name = a.f(node, 6);
    if (a.f(node, 5) >= 0 && name >= 0 && t.kind[name] === T_USHR) {
      dtNeed(f, 2014, "triple-shift");
    }
  } else if (k === N_FUNCTION_REFERENCE) {
    dtNeed(f, 2015, "constructor-tearoffs");
  } else if (k === N_SIMPLE_IDENTIFIER) {
    // `C.new`, `C.new()`, a constructor named `C.new`.
    if (t.kw[a.f(node, 0)] === K_NEW) {
      dtNeed(f, 2015, "constructor-tearoffs");
    }
  } else if (k === N_SUPER_FORMAL_PARAMETER) {
    dtNeed(f, 2017, "super-parameters");
  } else if (k === N_ARGUMENT_LIST) {
    const l = a.f(node, 1);
    let named = false;
    for (let j = 0; l > 0 && j < a.len(l); j++) {
      if (a.kind[a.at(l, j)] === N_NAMED_ARGUMENT) {
        named = true;
      } else if (named) {
        dtNeed(f, 2017, "named-arguments-anywhere");
        break;
      }
    }
  } else if (k === N_ENUM_DECLARATION) {
    const np = a.f(node, 2);
    if (
      (np >= 0 && a.kind[np] === N_NAME_WITH_TYPE_PARAMETERS && a.f(np, 1) >= 0) ||
      a.f(node, 3) >= 0 ||
      a.f(node, 4) >= 0
    ) {
      dtNeed(f, 2017, "enhanced-enums");
    }
  } else if (k === N_BLOCK_ENUM_BODY) {
    const members = a.f(node, 3);
    if (a.f(node, 2) >= 0 || (members > 0 && a.len(members) > 0)) {
      dtNeed(f, 2017, "enhanced-enums");
    }
  } else if (k === N_ENUM_CONSTANT_DECLARATION) {
    if (a.f(node, 2) >= 0) {
      dtNeed(f, 2017, "enhanced-enums");
    }
  } else if (k === N_LIBRARY_DIRECTIVE) {
    if (a.f(node, 2) < 0) {
      dtNeed(f, 2019, "unnamed-libraries");
    }
  } else if (k === N_CLASS_DECLARATION || k === N_CLASS_TYPE_ALIAS) {
    // base, interface, final, sealed, mixin class.
    for (let i = 2; i <= 6; i++) {
      if (a.f(node, i) >= 0) {
        dtNeed(f, 3000, i === 5 ? "sealed-class" : "class-modifiers");
      }
    }
  } else if (k === N_MIXIN_DECLARATION) {
    if (a.f(node, 1) >= 0) {
      dtNeed(f, 3000, "class-modifiers");
    }
  } else if (k === N_EXTENSION_TYPE_DECLARATION) {
    dtNeed(f, 3003, "inline-class");
  } else if (k === N_NULL_AWARE_ELEMENT) {
    dtNeed(f, 3008, "null-aware-elements");
  } else if (k === N_MAP_LITERAL_ENTRY) {
    if (a.f(node, 0) >= 0 || a.f(node, 3) >= 0) {
      dtNeed(f, 3008, "null-aware-elements");
    }
  } else if (
    k === N_DOT_SHORTHAND_INVOCATION ||
    k === N_DOT_SHORTHAND_PROPERTY_ACCESS ||
    k === N_DOT_SHORTHAND_CONSTRUCTOR_INVOCATION
  ) {
    dtNeed(f, 3010, "dot-shorthands");
  } else if (k === N_PRIMARY_CONSTRUCTOR_DECLARATION) {
    // An extension type's representation is older than primary constructors.
    if (pk !== N_EXTENSION_TYPE_DECLARATION) {
      dtNeed(f, 3013, "primary-constructors");
    }
  } else if (k === N_PRIMARY_CONSTRUCTOR_BODY || k === N_EMPTY_CLASS_BODY || k === N_EMPTY_ENUM_BODY) {
    dtNeed(f, 3013, "primary-constructors");
  } else if (k === N_CONSTRUCTOR_DECLARATION) {
    // `new()` and `factory new()`: a constructor declared without its class's name.
    if (a.f(node, 4) >= 0) {
      dtNeed(f, 3013, "primary-constructors");
    }
    // `C.new()`: the unnamed constructor written out.
    const name = a.f(node, 7);
    if (name >= 0 && t.kw[name] === K_NEW) {
      dtNeed(f, 2015, "constructor-tearoffs");
    }
  }
  const sig = dtSig(k);
  for (let i = 0; i < toI32(sig.length); i++) {
    const c = sig.charCodeAt(i);
    const v = a.f(node, i);
    if (c === 78 && v >= 0) {
      dtFeatureNode(a, t, v, node, f);
    } else if (c === 76 && v > 0) {
      for (let j = 0; j < a.len(v); j++) {
        dtFeatureNode(a, t, a.at(v, j), node, f);
      }
    }
  }
};
