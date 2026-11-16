// The default rules in SwiftFormat's order (FormatRule.index: by name, then
// moved after the rules each one names in orderAfter).
//
// Ported from SwiftFormat 0.64.7 (MIT License, Copyright (c) 2016 Nick
// Lockwood).

import { SwFormatter } from "./formatter";
import {
  swRuleConsecutiveBlankLines,
  swRuleConsecutiveSpaces,
  swRuleLinebreakAtEndOfFile,
  swRuleLinebreaks,
  swRuleTrailingSpace,
} from "./rules_space";
import { swRuleIndent } from "./rule_indent";

const SW_RULE_NAMES: string =
  "andOperator anyObjectProtocol applicationMain assertionFailures blankLineAfterImports blankLinesAroundMark blankLinesAtEndOfScope blankLinesAtStartOfScope blankLinesBetweenChainedFunctions blankLinesBetweenImports blankLinesBetweenScopes braces consecutiveBlankLines consecutiveSpaces duplicateImports emptyBraces enumNamespaces environmentEntry extensionAccessControl extensionAttributes fileHeader docComments docCommentsBeforeModifiers fileMacro genericExtensions headerFileName hoistAwait hoistPatternLet hoistTry initCoderUnavailable leadingDelimiters linebreakAtEndOfFile linebreaks modifierOrder modifiersOnSameLine nestedIf noForceTryInTests numberFormatting opaqueGenericParameters preferForLoop preferKeyPath redundantAsync redundantBackticks redundantBreak consistentSwitchCaseSpacing redundantEmptyView redundantEquatable redundantExtensionACL redundantFileprivate redundantGet redundantInternal redundantLet redundantLetError redundantNilInit redundantObjc redundantParens redundantPattern redundantPublic redundantRawValues redundantReturn conditionalAssignment redundantClosure redundantSelf redundantOptionalBinding redundantStaticSelf redundantSwiftUIGroup contentBuilder redundantType redundantInit redundantMemberwiseInit redundantTypedThrows redundantVariable redundantVoidReturnType repeatedGuard semicolons simplifyGenericConstraints sortDeclarations sortImports sortTypealiases spaceAroundBraces spaceAroundBrackets spaceAroundComments spaceAroundGenerics spaceAroundOperators spaceAroundParens spaceInsideBraces spaceInsideBrackets spaceInsideComments spaceInsideGenerics spaceInsideParens strongOutlets strongifiedSelf swiftTestingTestCaseNames redundantSwiftTestingSuite todos trailingClosures trailingCommas typeSugar unusedArguments redundantEnumerated noForceUnwrapInTests redundantThrows void wrap wrapArguments trailingSpace indent wrapAttributes wrapFunctionBodies wrapIfExpressionBodies wrapIfStatementBodies wrapLoopBodies wrapMultilineStatementBraces elseOnSameLine wrapPropertyBodies wrapSingleLineComments yodaConditions";

export const SW_RULE_COUNT: i32 = 117;

// Rule ids (positions in SW_RULE_NAMES).
export const SW_RULE_AND_OPERATOR: i32 = 0;
export const SW_RULE_ANY_OBJECT_PROTOCOL: i32 = 1;
export const SW_RULE_APPLICATION_MAIN: i32 = 2;
export const SW_RULE_ASSERTION_FAILURES: i32 = 3;
export const SW_RULE_BLANK_LINE_AFTER_IMPORTS: i32 = 4;
export const SW_RULE_BLANK_LINES_AROUND_MARK: i32 = 5;
export const SW_RULE_BLANK_LINES_AT_END_OF_SCOPE: i32 = 6;
export const SW_RULE_BLANK_LINES_AT_START_OF_SCOPE: i32 = 7;
export const SW_RULE_BLANK_LINES_BETWEEN_CHAINED_FUNCTIONS: i32 = 8;
export const SW_RULE_BLANK_LINES_BETWEEN_IMPORTS: i32 = 9;
export const SW_RULE_BLANK_LINES_BETWEEN_SCOPES: i32 = 10;
export const SW_RULE_BRACES: i32 = 11;
export const SW_RULE_CONSECUTIVE_BLANK_LINES: i32 = 12;
export const SW_RULE_CONSECUTIVE_SPACES: i32 = 13;
export const SW_RULE_DUPLICATE_IMPORTS: i32 = 14;
export const SW_RULE_EMPTY_BRACES: i32 = 15;
export const SW_RULE_ENUM_NAMESPACES: i32 = 16;
export const SW_RULE_ENVIRONMENT_ENTRY: i32 = 17;
export const SW_RULE_EXTENSION_ACCESS_CONTROL: i32 = 18;
export const SW_RULE_EXTENSION_ATTRIBUTES: i32 = 19;
export const SW_RULE_FILE_HEADER: i32 = 20;
export const SW_RULE_DOC_COMMENTS: i32 = 21;
export const SW_RULE_DOC_COMMENTS_BEFORE_MODIFIERS: i32 = 22;
export const SW_RULE_FILE_MACRO: i32 = 23;
export const SW_RULE_GENERIC_EXTENSIONS: i32 = 24;
export const SW_RULE_HEADER_FILE_NAME: i32 = 25;
export const SW_RULE_HOIST_AWAIT: i32 = 26;
export const SW_RULE_HOIST_PATTERN_LET: i32 = 27;
export const SW_RULE_HOIST_TRY: i32 = 28;
export const SW_RULE_INIT_CODER_UNAVAILABLE: i32 = 29;
export const SW_RULE_LEADING_DELIMITERS: i32 = 30;
export const SW_RULE_LINEBREAK_AT_END_OF_FILE: i32 = 31;
export const SW_RULE_LINEBREAKS: i32 = 32;
export const SW_RULE_MODIFIER_ORDER: i32 = 33;
export const SW_RULE_MODIFIERS_ON_SAME_LINE: i32 = 34;
export const SW_RULE_NESTED_IF: i32 = 35;
export const SW_RULE_NO_FORCE_TRY_IN_TESTS: i32 = 36;
export const SW_RULE_NUMBER_FORMATTING: i32 = 37;
export const SW_RULE_OPAQUE_GENERIC_PARAMETERS: i32 = 38;
export const SW_RULE_PREFER_FOR_LOOP: i32 = 39;
export const SW_RULE_PREFER_KEY_PATH: i32 = 40;
export const SW_RULE_REDUNDANT_ASYNC: i32 = 41;
export const SW_RULE_REDUNDANT_BACKTICKS: i32 = 42;
export const SW_RULE_REDUNDANT_BREAK: i32 = 43;
export const SW_RULE_CONSISTENT_SWITCH_CASE_SPACING: i32 = 44;
export const SW_RULE_REDUNDANT_EMPTY_VIEW: i32 = 45;
export const SW_RULE_REDUNDANT_EQUATABLE: i32 = 46;
export const SW_RULE_REDUNDANT_EXTENSION_A_C_L: i32 = 47;
export const SW_RULE_REDUNDANT_FILEPRIVATE: i32 = 48;
export const SW_RULE_REDUNDANT_GET: i32 = 49;
export const SW_RULE_REDUNDANT_INTERNAL: i32 = 50;
export const SW_RULE_REDUNDANT_LET: i32 = 51;
export const SW_RULE_REDUNDANT_LET_ERROR: i32 = 52;
export const SW_RULE_REDUNDANT_NIL_INIT: i32 = 53;
export const SW_RULE_REDUNDANT_OBJC: i32 = 54;
export const SW_RULE_REDUNDANT_PARENS: i32 = 55;
export const SW_RULE_REDUNDANT_PATTERN: i32 = 56;
export const SW_RULE_REDUNDANT_PUBLIC: i32 = 57;
export const SW_RULE_REDUNDANT_RAW_VALUES: i32 = 58;
export const SW_RULE_REDUNDANT_RETURN: i32 = 59;
export const SW_RULE_CONDITIONAL_ASSIGNMENT: i32 = 60;
export const SW_RULE_REDUNDANT_CLOSURE: i32 = 61;
export const SW_RULE_REDUNDANT_SELF: i32 = 62;
export const SW_RULE_REDUNDANT_OPTIONAL_BINDING: i32 = 63;
export const SW_RULE_REDUNDANT_STATIC_SELF: i32 = 64;
export const SW_RULE_REDUNDANT_SWIFT_U_I_GROUP: i32 = 65;
export const SW_RULE_CONTENT_BUILDER: i32 = 66;
export const SW_RULE_REDUNDANT_TYPE: i32 = 67;
export const SW_RULE_REDUNDANT_INIT: i32 = 68;
export const SW_RULE_REDUNDANT_MEMBERWISE_INIT: i32 = 69;
export const SW_RULE_REDUNDANT_TYPED_THROWS: i32 = 70;
export const SW_RULE_REDUNDANT_VARIABLE: i32 = 71;
export const SW_RULE_REDUNDANT_VOID_RETURN_TYPE: i32 = 72;
export const SW_RULE_REPEATED_GUARD: i32 = 73;
export const SW_RULE_SEMICOLONS: i32 = 74;
export const SW_RULE_SIMPLIFY_GENERIC_CONSTRAINTS: i32 = 75;
export const SW_RULE_SORT_DECLARATIONS: i32 = 76;
export const SW_RULE_SORT_IMPORTS: i32 = 77;
export const SW_RULE_SORT_TYPEALIASES: i32 = 78;
export const SW_RULE_SPACE_AROUND_BRACES: i32 = 79;
export const SW_RULE_SPACE_AROUND_BRACKETS: i32 = 80;
export const SW_RULE_SPACE_AROUND_COMMENTS: i32 = 81;
export const SW_RULE_SPACE_AROUND_GENERICS: i32 = 82;
export const SW_RULE_SPACE_AROUND_OPERATORS: i32 = 83;
export const SW_RULE_SPACE_AROUND_PARENS: i32 = 84;
export const SW_RULE_SPACE_INSIDE_BRACES: i32 = 85;
export const SW_RULE_SPACE_INSIDE_BRACKETS: i32 = 86;
export const SW_RULE_SPACE_INSIDE_COMMENTS: i32 = 87;
export const SW_RULE_SPACE_INSIDE_GENERICS: i32 = 88;
export const SW_RULE_SPACE_INSIDE_PARENS: i32 = 89;
export const SW_RULE_STRONG_OUTLETS: i32 = 90;
export const SW_RULE_STRONGIFIED_SELF: i32 = 91;
export const SW_RULE_SWIFT_TESTING_TEST_CASE_NAMES: i32 = 92;
export const SW_RULE_REDUNDANT_SWIFT_TESTING_SUITE: i32 = 93;
export const SW_RULE_TODOS: i32 = 94;
export const SW_RULE_TRAILING_CLOSURES: i32 = 95;
export const SW_RULE_TRAILING_COMMAS: i32 = 96;
export const SW_RULE_TYPE_SUGAR: i32 = 97;
export const SW_RULE_UNUSED_ARGUMENTS: i32 = 98;
export const SW_RULE_REDUNDANT_ENUMERATED: i32 = 99;
export const SW_RULE_NO_FORCE_UNWRAP_IN_TESTS: i32 = 100;
export const SW_RULE_REDUNDANT_THROWS: i32 = 101;
export const SW_RULE_VOID: i32 = 102;
export const SW_RULE_WRAP: i32 = 103;
export const SW_RULE_WRAP_ARGUMENTS: i32 = 104;
export const SW_RULE_TRAILING_SPACE: i32 = 105;
export const SW_RULE_INDENT: i32 = 106;
export const SW_RULE_WRAP_ATTRIBUTES: i32 = 107;
export const SW_RULE_WRAP_FUNCTION_BODIES: i32 = 108;
export const SW_RULE_WRAP_IF_EXPRESSION_BODIES: i32 = 109;
export const SW_RULE_WRAP_IF_STATEMENT_BODIES: i32 = 110;
export const SW_RULE_WRAP_LOOP_BODIES: i32 = 111;
export const SW_RULE_WRAP_MULTILINE_STATEMENT_BRACES: i32 = 112;
export const SW_RULE_ELSE_ON_SAME_LINE: i32 = 113;
export const SW_RULE_WRAP_PROPERTY_BODIES: i32 = 114;
export const SW_RULE_WRAP_SINGLE_LINE_COMMENTS: i32 = 115;
export const SW_RULE_YODA_CONDITIONS: i32 = 116;

/** The name of rule `r`. */
export const swRuleName = (r: i32): string => {
  let start = 0;
  let k = 0;
  const n = toI32(SW_RULE_NAMES.length);
  for (let i = 0; i <= n; i++) {
    if (i === n || SW_RULE_NAMES.charCodeAt(i) === 32) {
      if (k === r) {
        return SW_RULE_NAMES.substring(start, i);
      }
      k++;
      start = i + 1;
    }
  }
  return "";
};

/** runOnceOnly. */
export const swRuleRunsOnce = (r: i32): boolean => r === SW_RULE_FILE_HEADER || r === SW_RULE_HEADER_FILE_NAME;

/** Applies rule `r`; answers false when the rule is not ported and might change the file. */
export const swRunRule = (f: SwFormatter, r: i32): boolean => {
  switch (r) {
    case SW_RULE_CONSECUTIVE_BLANK_LINES:
      swRuleConsecutiveBlankLines(f);
      return true;
    case SW_RULE_CONSECUTIVE_SPACES:
      swRuleConsecutiveSpaces(f);
      return true;
    case SW_RULE_FILE_HEADER:
      // fileHeader is `ignore` by default.
      return true;
    case SW_RULE_LINEBREAK_AT_END_OF_FILE:
      swRuleLinebreakAtEndOfFile(f);
      return true;
    case SW_RULE_LINEBREAKS:
      swRuleLinebreaks(f);
      return true;
    case SW_RULE_INDENT:
      return swRuleIndent(f);
    case SW_RULE_TRAILING_SPACE:
      swRuleTrailingSpace(f);
      return true;
    default:
      return false;
  }
};
