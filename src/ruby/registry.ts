// Cop facts the team needs: RuboCop's registry order (corrections merge in
// it) and autocorrect_incompatible_with. Generated from RuboCop 1.92.2's
// registry with the default configuration.

/** Every enabled cop, in registry order (for rubocop:disable all and departments). */
export const RB_COP_NAMES: string =
  "Bundler/DuplicatedGem,Bundler/DuplicatedGroup,Bundler/GemFilename,Bundler/InsecureProtocolSource,Bundler/OrderedGems,Gemspec/DuplicatedAssignment,Gemspec/OrderedDependencies,Gemspec/RequiredRubyVersion,Gemspec/RubyVersionGlobalsUsage,Layout/AccessModifierIndentation,Layout/ArgumentAlignment,Layout/ArrayAlignment,Layout/AssignmentIndentation,Layout/BeginEndAlignment,Layout/BlockAlignment,Layout/BlockEndNewline,Layout/CaseIndentation,Layout/ClosingHeredocIndentation,Layout/ClosingParenthesisIndentation,Layout/CommentIndentation,Layout/ConditionPosition,Layout/DefEndAlignment,Layout/DotPosition,Layout/ElseAlignment,Layout/EmptyComment,Layout/EmptyLineAfterGuardClause,Layout/EmptyLineAfterMagicComment,Layout/EmptyLineBetweenDefs,Layout/EmptyLinesAroundAccessModifier,Layout/EmptyLinesAroundArguments,Layout/EmptyLinesAroundAttributeAccessor,Layout/EmptyLinesAroundBeginBody,Layout/EmptyLinesAroundBlockBody,Layout/EmptyLinesAroundClassBody,Layout/EmptyLinesAroundExceptionHandlingKeywords,Layout/EmptyLinesAroundMethodBody,Layout/EmptyLinesAroundModuleBody,Layout/EmptyLines,Layout/EndAlignment,Layout/EndOfLine,Layout/ExtraSpacing,Layout/FirstArgumentIndentation,Layout/FirstArrayElementIndentation,Layout/FirstHashElementIndentation,Layout/FirstParameterIndentation,Layout/HashAlignment,Layout/HeredocIndentation,Layout/IndentationConsistency,Layout/IndentationStyle,Layout/IndentationWidth,Layout/InitialIndentation,Layout/LeadingCommentSpace,Layout/LeadingEmptyLines,Layout/LineLength,Layout/MultilineArrayBraceLayout,Layout/MultilineBlockLayout,Layout/MultilineHashBraceLayout,Layout/MultilineMethodCallBraceLayout,Layout/MultilineMethodCallIndentation,Layout/MultilineMethodDefinitionBraceLayout,Layout/MultilineOperationIndentation,Layout/ParameterAlignment,Layout/RescueEnsureAlignment,Layout/SpaceAfterColon,Layout/SpaceAfterComma,Layout/SpaceAfterMethodName,Layout/SpaceAfterNot,Layout/SpaceAfterSemicolon,Layout/SpaceAroundBlockParameters,Layout/SpaceAroundEqualsInParameterDefault,Layout/SpaceAroundKeyword,Layout/SpaceAroundMethodCallOperator,Layout/SpaceAroundOperators,Layout/SpaceBeforeBlockBraces,Layout/SpaceBeforeComma,Layout/SpaceBeforeComment,Layout/SpaceBeforeFirstArg,Layout/SpaceBeforeSemicolon,Layout/SpaceInLambdaLiteral,Layout/SpaceInsideArrayPercentLiteral,Layout/SpaceInsideArrayLiteralBrackets,Layout/SpaceInsideBlockBraces,Layout/SpaceInsideHashLiteralBraces,Layout/SpaceInsideParens,Layout/SpaceInsidePercentLiteralDelimiters,Layout/SpaceInsideRangeLiteral,Layout/SpaceInsideReferenceBrackets,Layout/SpaceInsideStringInterpolation,Layout/TrailingEmptyLines,Layout/TrailingWhitespace,Lint/AmbiguousBlockAssociation,Lint/AmbiguousOperator,Lint/AmbiguousRegexpLiteral,Lint/AssignmentInCondition,Lint/BigDecimalNew,Lint/BinaryOperatorWithIdenticalOperands,Lint/BooleanSymbol,Lint/CircularArgumentReference,Lint/ConstantDefinitionInBlock,Lint/CopDirectiveSyntax,Lint/Debugger,Lint/DeprecatedClassMethods,Lint/DeprecatedOpenSSLConstant,Lint/DisjunctiveAssignmentInConstructor,Lint/DuplicateCaseCondition,Lint/DuplicateElsifCondition,Lint/DuplicateHashKey,Lint/DuplicateMethods,Lint/DuplicateRequire,Lint/DuplicateRescueException,Lint/EachWithObjectArgument,Lint/ElseLayout,Lint/EmptyConditionalBody,Lint/EmptyEnsure,Lint/EmptyExpression,Lint/EmptyFile,Lint/EmptyInterpolation,Lint/EmptyWhen,Lint/EnsureReturn,Lint/ErbNewArguments,Lint/FlipFlop,Lint/FloatComparison,Lint/FloatOutOfRange,Lint/FormatParameterMismatch,Lint/HashCompareByIdentity,Lint/IdentityComparison,Lint/ImplicitStringConcatenation,Lint/IneffectiveAccessModifier,Lint/InheritException,Lint/InterpolationCheck,Lint/LiteralAsCondition,Lint/LiteralInInterpolation,Lint/Loop,Lint/MissingCopEnableDirective,Lint/MissingSuper,Lint/MixedRegexpCaptureTypes,Lint/MultipleComparison,Lint/NestedMethodDefinition,Lint/NestedPercentLiteral,Lint/NextWithoutAccumulator,Lint/NonDeterministicRequireOrder,Lint/NonLocalExitFromIterator,Lint/OrderedMagicComments,Lint/OutOfRangeRegexpRef,Lint/ParenthesesAsGroupedExpression,Lint/PercentStringArray,Lint/PercentSymbolArray,Lint/RaiseException,Lint/RandOne,Lint/RedundantCopDisableDirective,Lint/RedundantCopEnableDirective,Lint/RedundantRequireStatement,Lint/RedundantSafeNavigation,Lint/RedundantSplatExpansion,Lint/RedundantStringCoercion,Lint/RedundantWithIndex,Lint/RedundantWithObject,Lint/RegexpAsCondition,Lint/RequireParentheses,Lint/RescueException,Lint/RescueType,Lint/ReturnInVoidContext,Lint/SafeNavigationConsistency,Lint/SafeNavigationChain,Lint/SafeNavigationWithEmpty,Lint/ScriptPermission,Lint/SelfAssignment,Lint/SendWithMixinArgument,Lint/ShadowedArgument,Lint/ShadowedException,Lint/StructNewOverride,Lint/SuppressedException,Lint/Syntax,Lint/ToJSON,Lint/TopLevelReturnWithArgument,Lint/TrailingCommaInAttributeDeclaration,Lint/UnderscorePrefixedVariableName,Lint/UnifiedInteger,Lint/UnreachableCode,Lint/UnreachableLoop,Lint/UnusedBlockArgument,Lint/UnusedMethodArgument,Lint/UriEscapeUnescape,Lint/UriRegexp,Lint/UselessAccessModifier,Lint/UselessAssignment,Lint/UselessElseWithoutRescue,Lint/UselessMethodDefinition,Lint/UselessSetterCall,Lint/UselessTimes,Lint/Void,Metrics/CyclomaticComplexity,Metrics/AbcSize,Metrics/BlockLength,Metrics/BlockNesting,Metrics/ClassLength,Metrics/MethodLength,Metrics/ModuleLength,Metrics/ParameterLists,Metrics/PerceivedComplexity,Migration/DepartmentName,Naming/AccessorMethodName,Naming/AsciiIdentifiers,Naming/BlockParameterName,Naming/ClassAndModuleCamelCase,Naming/ConstantName,Naming/FileName,Naming/HeredocDelimiterCase,Naming/HeredocDelimiterNaming,Naming/MemoizedInstanceVariableName,Naming/MethodName,Naming/MethodParameterName,Naming/BinaryOperatorParameterName,Naming/PredicatePrefix,Naming/RescuedExceptionsVariableName,Naming/VariableName,Naming/VariableNumber,Security/Eval,Security/JSONLoad,Security/MarshalLoad,Security/Open,Security/YAMLLoad,Style/AccessModifierDeclarations,Style/AccessorGrouping,Style/Alias,Style/AndOr,Style/ArrayJoin,Style/Attr,Style/BarePercentLiterals,Style/BeginBlock,Style/BisectedAttrAccessor,Style/BlockComments,Style/BlockDelimiters,Style/CaseEquality,Style/CaseLikeIf,Style/CharacterLiteral,Style/ClassAndModuleChildren,Style/ClassCheck,Style/ClassEqualityComparison,Style/ClassMethods,Style/ClassVars,Style/ColonMethodCall,Style/ColonMethodDefinition,Style/CombinableLoops,Style/CommandLiteral,Style/CommentAnnotation,Style/CommentedKeyword,Style/ConditionalAssignment,Style/DefWithParentheses,Style/Dir,Style/Documentation,Style/DoubleNegation,Style/EachForSimpleLoop,Style/EachWithObject,Style/EmptyBlockParameter,Style/EmptyCaseCondition,Style/EmptyElse,Style/EmptyLambdaParameter,Style/EmptyLiteral,Style/EmptyMethod,Style/Encoding,Style/EndBlock,Style/EvalWithLocation,Style/EvenOdd,Style/ExpandPathArguments,Style/ExplicitBlockArgument,Style/ExponentialNotation,Style/FloatDivision,Style/For,Style/FormatString,Style/FormatStringToken,Style/FrozenStringLiteralComment,Style/GlobalStdStream,Style/GlobalVars,Style/GuardClause,Style/HashAsLastArrayItem,Style/HashEachMethods,Style/HashLikeCase,Style/HashSyntax,Style/HashTransformKeys,Style/HashTransformValues,Style/IdenticalConditionalBranches,Style/IfInsideElse,Style/IfUnlessModifier,Style/IfUnlessModifierOfIfUnless,Style/IfWithSemicolon,Style/InfiniteLoop,Style/InverseMethods,Style/KeywordParametersOrder,Style/Lambda,Style/LambdaCall,Style/LineEndConcatenation,Style/MethodCallWithoutArgsParentheses,Style/RedundantAssignment,Style/RedundantFetchBlock,Style/RedundantFileExtensionInRequire,Style/RedundantSelfAssignment,Style/SoleNestedConditional,Style/MethodDefParentheses,Style/MinMax,Style/MissingRespondToMissing,Style/MixinGrouping,Style/MixinUsage,Style/ModuleFunction,Style/MultilineBlockChain,Style/MultilineIfThen,Style/MultilineIfModifier,Style/MultilineMemoization,Style/MultilineTernaryOperator,Style/MultilineWhenThen,Style/MultipleComparison,Style/MutableConstant,Style/NegatedIf,Style/NegatedUnless,Style/NegatedWhile,Style/NestedModifier,Style/NestedParenthesizedCalls,Style/NestedTernaryOperator,Style/Next,Style/NilComparison,Style/NonNilCheck,Style/Not,Style/NumericLiterals,Style/NumericLiteralPrefix,Style/NumericPredicate,Style/OneLineConditional,Style/OrAssignment,Style/OptionalArguments,Style/OptionalBooleanParameter,Style/ParallelAssignment,Style/ParenthesesAroundCondition,Style/PercentLiteralDelimiters,Style/PercentQLiterals,Style/PerlBackrefs,Style/PreferredHashMethods,Style/Proc,Style/RaiseArgs,Style/RandomWithOffset,Style/RedundantBegin,Style/RedundantCapitalW,Style/RedundantCondition,Style/RedundantConditional,Style/RedundantException,Style/RedundantFreeze,Style/RedundantInterpolation,Style/RedundantParentheses,Style/RedundantPercentQ,Style/RedundantRegexpCharacterClass,Style/RedundantRegexpEscape,Style/RedundantReturn,Style/RedundantSelf,Style/RedundantSort,Style/RedundantSortBy,Style/RegexpLiteral,Style/RescueModifier,Style/RescueStandardError,Style/SafeNavigation,Style/Sample,Style/SelfAssignment,Style/Semicolon,Style/SignalException,Style/SingleArgumentDig,Style/SingleLineMethods,Style/SlicingWithRange,Style/SpecialGlobalVars,Style/StabbyLambdaParentheses,Style/StderrPuts,Style/StringConcatenation,Style/StringLiterals,Style/StringLiteralsInInterpolation,Style/Strip,Style/StructInheritance,Style/SymbolArray,Style/SymbolLiteral,Style/SymbolProc,Style/TernaryParentheses,Style/TrailingBodyOnClass,Style/TrailingBodyOnMethodDefinition,Style/TrailingBodyOnModule,Style/TrailingCommaInArguments,Style/TrailingCommaInArrayLiteral,Style/TrailingCommaInHashLiteral,Style/TrailingMethodEndStatement,Style/TrailingUnderscoreVariable,Style/TrivialAccessors,Style/UnlessElse,Style/UnpackFirst,Style/VariableInterpolation,Style/WhenThen,Style/WhileUntilDo,Style/WhileUntilModifier,Style/WordArray,Style/YodaCondition,Style/ZeroLengthPredicate";

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
    return (
      b === "Layout/MultilineHashBraceLayout" ||
      b === "Layout/MultilineMethodCallBraceLayout" ||
      b === "Style/ConcatArrayLiterals"
    );
  }
  if (a === "Layout/MultilineBlockLayout") {
    return b === "Style/HashEachMethods" || b === "Style/ItBlockParameter" || b === "Style/Lambda";
  }
  if (a === "Layout/MultilineHashBraceLayout") {
    return (
      b === "Layout/MultilineMethodCallBraceLayout" ||
      b === "Style/HashAsLastArrayItem" ||
      b === "Style/RedundantDoubleSplatHashBraces"
    );
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
    return (
      b === "Style/MethodCallWithArgsParentheses" ||
      b === "Style/ReturnNil" ||
      b === "Style/ReturnNilInPredicateMethodDefinition"
    );
  }
  if (a === "Style/BlockDelimiters") {
    return (
      b === "Layout/SpaceBeforeBlockBraces" ||
      b === "Style/MethodCallWithArgsParentheses" ||
      b === "Style/RedundantBegin"
    );
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
    return (
      b === "Style/HashAsLastArrayItem" ||
      b === "Style/TrailingCommaInArrayLiteral" ||
      b === "Style/TrailingCommaInHashLiteral"
    );
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
