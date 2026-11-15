// Cop facts the team needs: RuboCop's registry order (corrections merge in
// it) and autocorrect_incompatible_with. Generated from RuboCop 1.92.2's
// registry with the default configuration.

/** Whether two cops' corrections are never merged in one pass. */
export const rbIncompatible = (a: string, b: string): boolean => rbIncompatibleWith(a, b) || rbIncompatibleWith(b, a);

const rbIncompatibleWith = (a: string, b: string): boolean => {
  if (a === "Layout/EmptyLineBetweenDefs") {
    return b === "Layout/EmptyLines";
  }
  if (a === "Layout/ExtraSpacing") {
    return b === "Layout/RedundantLineBreak" || b === "Style/SelfAssignment";
  }
  if (a === "Layout/FirstArgumentIndentation") {
    return b === "Layout/ArgumentAlignment" || b === "Layout/HashAlignment";
  }
  if (a === "Layout/LineLength") {
    return b === "Style/MethodCallWithArgsParentheses" || b === "Style/MethodDefParentheses";
  }
  if (a === "Layout/MultilineArrayBraceLayout") {
    return b === "Layout/MultilineHashBraceLayout" || b === "Layout/MultilineMethodCallBraceLayout" || b === "Style/ConcatArrayLiterals";
  }
  if (a === "Layout/MultilineBlockLayout") {
    return b === "Style/HashEachMethods" || b === "Style/ItBlockParameter" || b === "Style/Lambda";
  }
  if (a === "Layout/MultilineHashBraceLayout") {
    return b === "Layout/MultilineMethodCallBraceLayout" || b === "Style/HashAsLastArrayItem" || b === "Style/RedundantDoubleSplatHashBraces";
  }
  if (a === "Layout/MultilineMethodCallBraceLayout") {
    return b === "Style/MethodCallWithArgsParentheses";
  }
  if (a === "Layout/MultilineMethodDefinitionBraceLayout") {
    return b === "Style/MultilineMethodSignature";
  }
  if (a === "Layout/SpaceAroundOperators") {
    return b === "Style/SelfAssignment";
  }
  if (a === "Layout/SpaceBeforeBlockBraces") {
    return b === "Style/BlockDelimiters" || b === "Style/SymbolProc";
  }
  if (a === "Layout/SpaceBeforeFirstArg") {
    return b === "Style/MethodCallWithArgsParentheses";
  }
  if (a === "Layout/SpaceInsideBlockBraces") {
    return b === "Layout/BlockAlignment" || b === "Style/BlockDelimiters";
  }
  if (a === "Lint/AmbiguousOperator") {
    return b === "Naming/BlockForwarding" || b === "Style/ArgumentsForwarding";
  }
  if (a === "Lint/UnusedMethodArgument") {
    return b === "Style/ExplicitBlockArgument";
  }
  if (a === "Style/AccessModifierDeclarations") {
    return b === "Style/EndlessMethod" || b === "Style/SingleLineMethods";
  }
  if (a === "Style/AndOr") {
    return b === "Style/MethodCallWithArgsParentheses" || b === "Style/ReturnNil" || b === "Style/ReturnNilInPredicateMethodDefinition";
  }
  if (a === "Style/BlockDelimiters") {
    return b === "Layout/SpaceBeforeBlockBraces" || b === "Style/MethodCallWithArgsParentheses" || b === "Style/RedundantBegin";
  }
  if (a === "Style/CaseLikeIf") {
    return b === "Style/IfInsideElse";
  }
  if (a === "Style/ClassAndModuleChildren") {
    return b === "Style/DataInheritance" || b === "Style/StructInheritance";
  }
  if (a === "Style/ColonMethodCall") {
    return b === "Style/RedundantSelf";
  }
  if (a === "Style/CombinableLoops") {
    return b === "Layout/BlockEndNewline" || b === "Layout/RedundantLineBreak";
  }
  if (a === "Style/ConditionalAssignment") {
    return b === "Style/MethodCallWithArgsParentheses";
  }
  if (a === "Style/ExplicitBlockArgument") {
    return b === "Lint/UnusedMethodArgument" || b === "Style/LambdaCall" || b === "Style/TrailingCommaInArguments";
  }
  if (a === "Style/For") {
    return b === "Style/RedundantBegin" || b === "Style/ItBlockParameter";
  }
  if (a === "Style/GuardClause") {
    return b === "Style/MissingElse";
  }
  if (a === "Style/HashAsLastArrayItem") {
    return b === "Layout/MultilineArrayBraceLayout" || b === "Style/TrailingCommaInArrayLiteral";
  }
  if (a === "Style/HashSyntax") {
    return b === "Style/MethodCallWithArgsParentheses" || b === "Style/SuperWithArgsParentheses";
  }
  if (a === "Style/IfUnlessModifier") {
    return b === "Style/Next" || b === "Style/SoleNestedConditional";
  }
  if (a === "Style/IfUnlessModifierOfIfUnless") {
    return b === "Style/SoleNestedConditional";
  }
  if (a === "Style/InverseMethods") {
    return b === "Style/Not" || b === "Style/SymbolProc";
  }
  if (a === "Style/Lambda") {
    return b === "Style/SymbolProc";
  }
  if (a === "Style/LineEndConcatenation") {
    return b === "Style/RedundantInterpolation";
  }
  if (a === "Style/SoleNestedConditional") {
    return b === "Style/NegatedIf" || b === "Style/NegatedUnless";
  }
  if (a === "Style/MethodDefParentheses") {
    return b === "Style/ArgumentsForwarding";
  }
  if (a === "Style/MutableConstant") {
    return b === "Style/HashAsLastArrayItem" || b === "Style/TrailingCommaInArrayLiteral" || b === "Style/TrailingCommaInHashLiteral";
  }
  if (a === "Style/NestedParenthesizedCalls") {
    return b === "Style/MethodCallWithArgsParentheses";
  }
  if (a === "Style/Next") {
    return b === "Style/SafeNavigation";
  }
  if (a === "Style/RedundantBegin") {
    return b === "Style/BlockDelimiters";
  }
  if (a === "Style/RedundantInterpolation") {
    return b === "Style/LineEndConcatenation";
  }
  if (a === "Style/RedundantRegexpEscape") {
    return b === "Style/RegexpLiteral";
  }
  if (a === "Style/RedundantSelf") {
    return b === "Style/ColonMethodCall" || b === "Layout/DotPosition";
  }
  if (a === "Style/RescueModifier") {
    return b === "Style/MethodCallWithArgsParentheses";
  }
  if (a === "Style/SelfAssignment") {
    return b === "Layout/SpaceAroundOperators";
  }
  if (a === "Style/Semicolon") {
    return b === "Style/SingleLineMethods";
  }
  if (a === "Style/StructInheritance") {
    return b === "Style/MethodCallWithArgsParentheses";
  }
  if (a === "Style/SymbolProc") {
    return b === "Layout/SpaceBeforeBlockBraces" || b === "Style/TrailingCommaInArguments";
  }
  if (a === "Style/TrailingCommaInArguments") {
    return b === "Layout/HeredocArgumentClosingParenthesis";
  }
  return false;
};
