# clang-format 18 -> 23 regressions: root-cause categories (C++ formatter, nishfmt)

Regressed files: 472 (in differ23, not in differ18). Diff groups (zero-context hunks of nish-out vs clang-format-23): 1107. Singleton groups: 12 in 11 files.
Method: `diff -U0` per file (out23/cpp/out vs corpus23/cpp/ref), grouped by pattern rules (scratchpad/classify_all.py, stats.py), hand-checked; triggers confirmed in isolation with both binaries (scratchpad/snip/*.cpp). clang-format source attributions are INFERRED (no LLVM tree available), treat as pointers.
"only" = files whose every diff group belongs to this category alone (fix it => file matches, assuming the nish port reproduces the decision exactly).

| id | description | files | only | groups | nishfmt module | clang-format source |
|---|---|---|---|---|---|---|
| shift-literal-break-kept | `<<` chain: a source newline before `<<` between two string-literal operands is kept (18 joined them) | 113 | 101 | 222 | annotate (+indenter) | TokenAnnotator::mustBreakBefore (`<<` between string literals, honours Right.NewlinesBefore) [inferred] |
| standalone-block-split | bare block `{ stmt; }` / `{}` (not owned by if/for/while/case) is no longer merged onto one line; also inside macro bodies | 59 | 47 | 140 | format (short-block join) | UnwrappedLineFormatter::tryMergeSimpleBlock (bare `{` line) [inferred] |
| trailing-return-break | trailing return type: break goes before `->` instead of inside the parameter list (functions, deduction guides, lambdas) | 59 | 54 | 146 | indenter/annotate (penalty) | TokenAnnotator::splitPenalty / canBreakBefore for TT_TrailingReturnArrow [inferred] |
| braced-init-space-after-name | `T x {}` / `struct S x {..}` loses the space before `{` (also indentation of the list body, and `{}` merge for multi-line `x {\n}`) | 33 | 26 | 91 | classify | TokenAnnotator::spaceRequiredBefore, BK_BracedInit after declarator name (SpaceBeforeCpp11BracedList=false) [inferred] |
| comment-indent-adjacent-pp | comment next to a preprocessor line keeps its SOURCE indentation instead of being re-indented to column 0 / code level | 25 | 21 | 42 | format (comment indentation) | UnwrappedLineParser comment/PP-branch handling (parseComments/flushComments, PPBranchLevel) [inferred] |
| funcref-paren-space | space before `(&)` / `(*)` of function-reference/array-ref/function-pointer declarators: `int(&)[N]` -> `int (&)[N]` | 23 | 19 | 43 | classify | TokenAnnotator::spaceRequiredBetween (TT_FunctionTypeLParen / array-or-func-ptr declarator) [inferred] |
| decl-after-pp-guarded-attribute | declaration after `#endif` that closes a PP-guarded attribute: 18 broke after the return type (or left the line unformatted / Allman brace), 23 formats normally | 18 | 13 | 25 | format/parser (line after #endif) | UnwrappedLineParser (line after #endif following an attribute treated as continuation in 18) / ContinuationIndenter::mustBreak [inferred] |
| braced-list-one-per-line | long braced list (>~20 items, or items that wrap / carry trailing comments) goes one element per line instead of bin-packed/columns | 15 | 13 | 34 | indenter (CommaSeparatedList) | CommaSeparatedList::formatAfterToken / ContinuationIndenter + BinPackLongBracedList (clang-format 21 option) [inferred] |
| macro-body-braced-list | `#define X { a, b }` body is a braced list: `{a, b}` on the #define line, no inner spaces (and no `{`-own-line for trailing-comma lists) | 15 | 11 | 31 | parser (macro body) + classify | UnwrappedLineParser::tryToParseBracedList for #define bodies; TokenAnnotator braced-list spacing [inferred] |
| cast-unary-operand-space | C cast followed by unary operand: `(T) *p`, `(T) &x`, `(T) -1`, `(T) +x`, `(T) reinterpret_cast<..>` -> no space after `)` | 13 | 12 | 15 | classify | TokenAnnotator::determineIsCast / spaceRequiredBetween after cast rparen [inferred] |
| SINGLETON | no shared pattern (see list) | 11 | 8 | 12 | - | - |
| space-before-scope-op | source `X ::y` (space before `::`) is normalised to `X::y` | 10 | 7 | 44 | classify | TokenAnnotator::spaceRequiredBefore (tok::coloncolon after identifier) [inferred] |
| indent-reset-after-unterminated-macro | macro invocation without `;` (HB_AUTO_RETURN(..), InspectableClass(..), C++/CX `public :`) no longer swallows the next declaration: indentation resets | 9 | 2 | 17 | parser | UnwrappedLineParser::parseStructuralElement / isMacro invocation detection [inferred] |
| ptr-qualifier-macro-space | `T * MACRO` pointer-qualifier macro (absl_nonnull, FAR, ...): `*MACRO` in template args/casts, `* MACRO *MACRO` for nested pointers | 9 | 9 | 15 | classify | TokenAnnotator::spaceRequiredBetween / isPointerOrReference + attribute-macro heuristics [inferred] |
| doxygen-comment-reflow | comment reflow breaks before doxygen/LaTeX commands (`\f[`, `\f]`, `\f$`, `\note`, `\end{..}`) | 8 | 7 | 32 | format (comment reflow) | BreakableBlockComment / BreakableLineComment reflow split (doxygen command start) [inferred] |
| empty-body-semicolon-space | `f() : a(b){};` / `~A() override{};` -> space before `{` kept: `) {};` | 8 | 8 | 11 | classify | TokenAnnotator::spaceRequiredBefore (l_brace after r_paren/override) [inferred] |
| class-attr-break | `class [[nodiscard]]` / `class MACRO [[attr]] Name` : no forced break after the attribute, `template <..> class ...` merged onto one line | 7 | 4 | 8 | annotate | TokenAnnotator (class head attribute handling; BreakTemplateDeclarations / ClassHeadName) [inferred] |
| label-then-block-break | label followed by block: `lbl: {}` -> `lbl:\n  {\n  }` (also cascades re-indent of following code) | 6 | 1 | 9 | format/annotate | UnwrappedLineParser::parseLabel (block after label no longer attached) / unwrapped line split [inferred] |
| operator-macro-param-ref-space | `operator co_await(Self&& self)` and macro-named operators (`operator OP(R& a)`): `T &&x` / `T &a` spacing | 6 | 5 | 9 | classify | TokenAnnotator::determineStarAmpUsage after `operator` + identifier [inferred] |
| ternary-chain-alignment | nested `?:` chains (inside parens / with trailing comment): column alignment of continuation `?`/`:` | 6 | 4 | 15 | indenter | ContinuationIndenter::getNewLineColumn for conditional operator (TT_ConditionalExpr / ColonPos / QuestionColumn) [inferred] |
| assign-break | break after `=` vs inside RHS: enumerator `X = A | B | C` and `auto x = call(...)` pick the other break | 5 | 3 | 6 | indenter (penalties) | PenaltyBreakAssignment / ContinuationIndenter::mustBreak for enumerators [inferred] |
| cppcx-handle-declarations | C++/CX (`^` handles, `property T ^ name { get }`) declarations in opencv winrt samples | 5 | 1 | 10 | parser/annotate | TokenAnnotator/UnwrappedLineParser C++/CLI handling [inferred] |
| indent-misc-after-macro-or-pp | indentation-only diffs of lines following macro definitions / #if (heterogeneous: TEST_CASES(X), gmock name(...) {, type_traits.hpp, SafeAssert.h) | 5 | 4 | 7 | format/parser | unknown (needs per-case isolation) |
| break-before-name-after-decl-macro | decl `extern "C" MACRO ret name(...)` too long: break after the MACRO (23) instead of between return type and name (18) | 4 | 4 | 4 | annotate/indenter | ContinuationIndenter / TokenAnnotator::splitPenalty (PenaltyReturnTypeOnItsOwnLine vs unknown-macro prefix) [inferred] |
| comment-star-prefix-space | reflowed block-comment line starting with `*Word` gets `* Word` | 4 | 4 | 5 | format (comment reflow) | BreakableBlockComment::adjustWhitespace / getReflowSplit [inferred] |
| line-comment-space-after-slashes | `//text` / `//#define x \` line comments (and `//` + backslash continuation) get `// ` inserted / re-aligned | 4 | 2 | 8 | format (comment) | BreakableLineComment (SpacesInLineCommentPrefix) with escaped newline [inferred] |
| macro-call-paren-break | `MACRO(args)(params)` : `(` of the second call stays attached (18 broke before it) | 4 | 4 | 9 | annotate | TokenAnnotator::canBreakBefore / mustBreakBefore for `)(` of macro-generated declarator [inferred] |
| pp-warning-space | `#warning("..")` -> `#warning ("..")` | 4 | 4 | 4 | classify | TokenAnnotator::spaceRequiredBefore (pp keyword followed by `(`) [inferred] |
| template-template-param-break | `template <template <..., class> class Impl>`: break after `template <` instead of before `class Impl` | 4 | 4 | 4 | annotate | TokenAnnotator::splitPenalty for template-template parameter `class` keyword [inferred] |
| angle-bracket-ternary-misparse | `a < b ? c : d > (e)` is parsed as a template argument list by 23 (`iv<0 ? .. : iv>(int64) X`) and `T<expr ? a : b, K>(...)` template call is recognised | 3 | 1 | 4 | parser (annotate) | TokenAnnotator::parseAngle (allows `?:` inside angles) [inferred] |
| closing-brace-list-indent | closing `};` of braced list placed after `= // comment` + `{` on next line: indent goes to the statement level | 3 | 2 | 3 | indenter | ContinuationIndenter::moveStateToNextToken / closing brace of braced list [inferred] |
| rvalue-ref-pack-space | `Args && ...` -> `Args &&...` in requires/template args | 3 | 2 | 4 | classify | TokenAnnotator::spaceRequiredBetween (ellipsis after && in expression/template arg) [inferred] |
| va-args-arg-break | macro call ending in `##__VA_ARGS__`: break moves one argument earlier | 3 | 2 | 4 | annotate/indenter | TokenAnnotator::splitPenalty (`##` / token paste operand glue) [inferred] |
| inline-block-comment-attach | argument-name comment `/*name=*/arg` : no break between comment and argument; following lambda arg is joined | 2 | 1 | 2 | annotate/indenter | TokenAnnotator::mustBreakBefore/canBreakBefore after block comment (TT_BlockComment arg) [inferred] |
| label-in-macro-body-break | `label: stmt;` inside a #define body: break after the label, no space before `:` | 2 | 1 | 2 | format/annotate | UnwrappedLineParser::parseLabel inside PP body [inferred] |
| lambda-trailing-return-indent | lambda trailing return type `-> T<...> {` continuation gets +8 instead of +4 indent | 2 | 2 | 10 | indenter | ContinuationIndenter (lambda trailing-return continuation indent) [inferred] |
| macro-asm-token-space | `vld3.8` / `SSE4.2` : no space inserted before `.digit` token in macro args / #pragma | 2 | 2 | 10 | classify | TokenAnnotator::spaceRequiredBefore (period/numeric literal glue) [inferred] |
| arrow-space-after-paren | `f(x)->decltype(..)` in macro body: space around trailing `->` | 1 | 0 | 3 | classify | TokenAnnotator::spaceRequiredBetween for TT_TrailingReturnArrow in macro [inferred] |
| attribute-between-type-and-name-break | `void __attribute__((..)) name(` in macro: break after the attribute, name at statement indent | 1 | 0 | 19 | indenter | TokenAnnotator::splitPenalty (TT_AttributeParen before function name) [inferred] |
| braced-list-after-assign-comment | `= // c\n {` list on continuation line: `{// c` and +1 indent of elements | 1 | 1 | 1 | indenter | ContinuationIndenter braced list after `=` break [inferred] |
| braced-temp-arrow | `decltype(it{}->first)` : `{}` temp followed by `->` is a member access, 18 spaced it like trailing return | 1 | 1 | 1 | classify | TokenAnnotator (TT_TrailingReturnArrow detection after braced init) [inferred] |
| decl-break-before-trailing-line-comment | `static const char *const name[] = // NOLINT(..)`: break position moves from before `*const` to before `name` | 1 | 0 | 3 | indenter | ContinuationIndenter::mustBreak/penalties with trailing line comment [inferred] |
| decl-return-type-ref-break | `FOLLY_NOINLINE Type<..> &\nNAME() {` : break after `&` return type, name not indented | 1 | 1 | 2 | indenter | ContinuationIndenter (declarator name after return-type break) [inferred] |
| include-sort-in-unterminated-comment | #includes inside an unterminated `/*` comment: 18 sorts them, 23 does not | 1 | 1 | 2 | format (include sort) | tooling::HeaderIncludes / sortCppIncludes (comment-aware scan) [inferred] |
| indent-in-pp-branch-body | indentation of code inside `#elif`/`#else` branches in a function body (conv2_kernels.simd.hpp) | 1 | 1 | 4 | format/parser | UnwrappedLineParser PP-branch level restore [inferred] |
| macro-lambda-struct-va-args-unformatted | macro body containing lambda with `struct T {};` and `##__VA_ARGS__`: 23 leaves the body lines (and their `\` columns) untouched | 1 | 0 | 10 | format (macro body / escaped-newline alignment) | WhitespaceManager::alignEscapedNewlines / unformatted-line handling [inferred] |
| placement-new-space | `::new(ptr) T` -> `::new (ptr) T` inside noexcept(...) | 1 | 1 | 2 | classify | TokenAnnotator::spaceRequiredBetween (kw_new with leading `::`) [inferred] |
| record-attr-macro-split | `struct __align__(8) name { ... };` is no longer treated as a function with short body (not merged to one line) | 1 | 1 | 7 | format/parser | UnwrappedLineParser::parseRecord / tryMergeSimpleBlock (attribute macro with parens before record name) [inferred] |
| template-close-space | `test_##name##3 < type > ()` -> `< type>()` | 1 | 1 | 2 | classify | TokenAnnotator::spaceRequiredBefore (template closer after pasted identifier) [inferred] |

Files touched by 2+ categories: 49; single-category files: 423.

## Per-category detail

### shift-literal-break-kept

- `<<` chain: a source newline before `<<` between two string-literal operands is kept (18 joined them)
- files 113, only-category files 101, groups 222; module: annotate (+indenter); clang-format: TokenAnnotator::mustBreakBefore (`<<` between string literals, honours Right.NewlinesBefore) [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
void f() {
  CHECK(!x) << "must be called "
            << "at most once";
}
```
```
--18
void f() { CHECK(!x) << "must be called " << "at most once"; }
--23
void f() {
  CHECK(!x) << "must be called "
            << "at most once";
}
```

Group locations (file:line in nish output): abseil_abseil-cpp/absl/base/internal/endian_test.cc:125, abseil_abseil-cpp/absl/container/linked_hash_set_test.cc:518, abseil_abseil-cpp/absl/hash/hash_test.cc:972, abseil_abseil-cpp/absl/strings/internal/generic_printer_test.cc:298, facebook_folly/folly/Benchmark.cpp:990, facebook_folly/folly/Benchmark.cpp:1006, facebook_folly/folly/Benchmark.cpp:1030, facebook_folly/folly/Singleton.cpp:191, facebook_folly/folly/Singleton.cpp:250, facebook_folly/folly/cli/test/ArgsTest.cpp:83, facebook_folly/folly/cli/test/ArgsTest.cpp:88, facebook_folly/folly/concurrency/container/test/RelaxedConcurrentPriorityQueueTest.cpp:986 ...

Files (113; * = only this category):
  - abseil_abseil-cpp/absl/base/internal/endian_test.cc *
  - abseil_abseil-cpp/absl/container/linked_hash_set_test.cc *
  - abseil_abseil-cpp/absl/hash/hash_test.cc *
  - abseil_abseil-cpp/absl/strings/internal/generic_printer_test.cc *
  - facebook_folly/folly/Benchmark.cpp *
  - facebook_folly/folly/Singleton.cpp *
  - facebook_folly/folly/cli/test/ArgsTest.cpp  [also: braced-list-one-per-line]
  - facebook_folly/folly/concurrency/container/test/RelaxedConcurrentPriorityQueueTest.cpp *
  - facebook_folly/folly/concurrency/test/DynamicBoundedQueueTest.cpp *
  - facebook_folly/folly/concurrency/test/UnboundedQueueTest.cpp *
  - facebook_folly/folly/coro/AsyncPipe.h *
  - facebook_folly/folly/coro/Task.h *
  - facebook_folly/folly/coro/test/SharedPromiseTest.cpp *
  - facebook_folly/folly/crypto/detail/MathOperation_AVX2.cpp *
  - facebook_folly/folly/crypto/detail/MathOperation_SSE2.cpp *
  - facebook_folly/folly/debugging/symbolizer/SignalHandler.cpp  [also: braced-init-space-after-name]
  - facebook_folly/folly/debugging/symbolizer/test/FramePointerUnwinderTest.cpp  [also: braced-init-space-after-name]
  - facebook_folly/folly/debugging/symbolizer/test/StackTraceLargeBenchmark.cpp *
  - facebook_folly/folly/detail/BenchmarkAdaptive.cpp *
  - facebook_folly/folly/detail/PerfScoped.cpp *
  - facebook_folly/folly/detail/UniqueInstance.cpp *
  - facebook_folly/folly/executors/thread_factory/PriorityThreadFactory.cpp *
  - facebook_folly/folly/hash/test/ChecksumTest.cpp *
  - facebook_folly/folly/io/async/AsyncIoUringSocket.cpp  [also: braced-init-space-after-name]
  - facebook_folly/folly/io/async/AsyncSSLSocket.cpp *
  - facebook_folly/folly/io/async/AsyncServerSocket.cpp  [also: braced-init-space-after-name]
  - facebook_folly/folly/io/async/AsyncSocket.cpp  [also: braced-init-space-after-name]
  - facebook_folly/folly/io/async/AsyncUDPServerSocket.h *
  - facebook_folly/folly/io/async/AsyncUDPSocket.cpp *
  - facebook_folly/folly/io/async/EventBase.cpp  [also: braced-init-space-after-name]
  - facebook_folly/folly/io/async/IoUringBackend.cpp  [also: braced-init-space-after-name]
  - facebook_folly/folly/io/async/TimeoutManager.cpp *
  - facebook_folly/folly/io/async/test/TimeUtil.cpp *
  - facebook_folly/folly/result/detail/rich_exception_ptr_storage.cpp *
  - facebook_folly/folly/test/IPAddressTest.cpp *
  - facebook_rocksdb/db/blob/db_blob_index_test.cc *
  - facebook_rocksdb/db/compaction/compaction_job.cc *
  - facebook_rocksdb/db/event_helpers.cc *
  - facebook_rocksdb/db/flush_job.cc *
  - facebook_rocksdb/db/version_edit_test.cc *
  - facebook_rocksdb/db/wal_iterator_impl.cc *
  - facebook_rocksdb/db_stress_tool/multi_ops_txns_stress.cc *
  - facebook_rocksdb/db_stress_tool/no_batched_ops_stress.cc *
  - facebook_rocksdb/options/cf_options.cc *
  - facebook_rocksdb/table/sst_file_dumper.cc *
  - facebook_rocksdb/util/autovector_test.cc *
  - facebook_rocksdb/util/filter_bench.cc *
  - facebook_rocksdb/util/io_dispatcher_test.cc *
  - facebook_rocksdb/utilities/cache_dump_load_impl.cc *
  - google_googletest/googlemock/include/gmock/gmock-spec-builders.h *
  - google_googletest/googlemock/test/gmock-actions_test.cc *
  - google_googletest/googlemock/test/gmock-spec-builders_test.cc *
  - google_googletest/googletest/include/gtest/gtest_pred_impl.h *
  - google_googletest/googletest/include/gtest/internal/gtest-param-util.h *
  - google_googletest/googletest/src/gtest-death-test.cc *
  - google_googletest/googletest/src/gtest-port.cc *
  - google_googletest/googletest/test/googletest-catch-exceptions-test_.cc *
  - google_googletest/googletest/test/googletest-death-test_ex_test.cc *
  - google_googletest/googletest/test/googletest-output-test_.cc *
  - google_googletest/googletest/test/googletest-param-test-test.cc *
  - google_googletest/googletest/test/gtest_stress_test.cc *
  - opencv_opencv/3rdparty/protobuf/src/google/protobuf/generated_message_reflection.cc *
  - opencv_opencv/3rdparty/protobuf/src/google/protobuf/map_field.h *
  - opencv_opencv/3rdparty/protobuf/src/google/protobuf/message.cc  [also: decl-after-pp-guarded-attribute]
  - opencv_opencv/3rdparty/protobuf/src/google/protobuf/reflection_ops.cc *
  - opencv_opencv/3rdparty/protobuf/src/google/protobuf/stubs/strutil.cc  [also: label-in-macro-body-break]
  - opencv_opencv/3rdparty/protobuf/src/google/protobuf/text_format.cc *
  - opencv_opencv/3rdparty/protobuf/src/google/protobuf/wire_format_lite.cc *
  - opencv_opencv/apps/camera-enumerate/camera_enumerate.cpp *
  - opencv_opencv/modules/core/src/lda.cpp *
  - opencv_opencv/modules/core/test/test_dxt.cpp *
  - opencv_opencv/modules/core/test/test_utils.cpp *
  - opencv_opencv/modules/dnn/perf/perf_convolution.cpp *
  - opencv_opencv/modules/dnn/perf/perf_convolution1d.cpp *
  - opencv_opencv/modules/dnn/perf/perf_convolution3d.cpp *
  - opencv_opencv/modules/dnn/src/layers/lrn_layer.cpp *
  - opencv_opencv/modules/dnn/src/net_impl.cpp *
  - opencv_opencv/modules/dnn/src/ocl4dnn/src/ocl4dnn_conv_spatial.cpp *
  - opencv_opencv/modules/geometry/test/test_solvepnp_ransac.cpp *
  - opencv_opencv/modules/imgcodecs/src/grfmt_tiff.cpp *
  - opencv_opencv/modules/imgproc/test/test_resize_bitexact.cpp *
  - opencv_opencv/modules/objdetect/test/test_chesscorners.cpp *
  - opencv_opencv/modules/photo/src/ccm/ccm.cpp *
  - opencv_opencv/modules/ts/src/cuda_test.cpp *
  - opencv_opencv/modules/videoio/src/cap_mfx_writer.cpp *
  - opencv_opencv/samples/cpp/asift.cpp *
  - opencv_opencv/samples/cpp/image_alignment.cpp *
  - opencv_opencv/samples/cpp/tutorial_code/calib3d/camera_calibration/camera_calibration.cpp *
  - opencv_opencv/samples/cpp/tutorial_code/core/mat_mask_operations/mat_mask_operations.cpp *
  - opencv_opencv/samples/cpp/tutorial_code/core/mat_the_basic_image_container/mat_the_basic_image_container.cpp *
  - opencv_opencv/samples/cpp/tutorial_code/gpu/gpu-basics-similarity/gpu-basics-similarity.cpp *
  - opencv_opencv/samples/cpp/tutorial_code/videoio/video-input-psnr-ssim/video-input-psnr-ssim.cpp *
  - opencv_opencv/samples/dnn/face_detect.cpp *
  - opencv_opencv/samples/ptcloud/splats.cpp *
  - opencv_opencv/samples/tapi/clahe.cpp *
  - opencv_opencv/samples/tapi/dense_optical_flow.cpp *
  - protocolbuffers_protobuf/python/google/protobuf/pyext/descriptor_database.cc *
  - protocolbuffers_protobuf/src/google/protobuf/compiler/command_line_interface.cc *
  - protocolbuffers_protobuf/src/google/protobuf/compiler/objectivec/extension.cc *
  - protocolbuffers_protobuf/src/google/protobuf/compiler/objectivec/names.cc *
  - protocolbuffers_protobuf/src/google/protobuf/compiler/objectivec/tf_decode_data.cc *
  - protocolbuffers_protobuf/src/google/protobuf/compiler/parser.cc *
  - protocolbuffers_protobuf/src/google/protobuf/compiler/ruby/ruby_generator.cc *
  - protocolbuffers_protobuf/src/google/protobuf/generated_message_reflection.cc *
  - protocolbuffers_protobuf/src/google/protobuf/map_field.h  [also: class-attr-break]
  - protocolbuffers_protobuf/src/google/protobuf/reflection_ops.cc *
  - protocolbuffers_protobuf/src/google/protobuf/text_format.cc *
  - protocolbuffers_protobuf/src/google/protobuf/util/field_comparator.cc *
  - protocolbuffers_protobuf/src/google/protobuf/util/field_mask_util.cc *
  - protocolbuffers_protobuf/src/google/protobuf/util/message_differencer.cc  [also: space-before-scope-op]
  - protocolbuffers_protobuf/upb/json/fuzz_test.cc *
  - protocolbuffers_protobuf/upb/message/internal/compare_unknown_test.cc *
  - protocolbuffers_protobuf/upb/reflection/internal/def_builder_test.cc *

### standalone-block-split

- bare block `{ stmt; }` / `{}` (not owned by if/for/while/case) is no longer merged onto one line; also inside macro bodies
- files 59, only-category files 47, groups 140; module: format (short-block join); clang-format: UnwrappedLineFormatter::tryMergeSimpleBlock (bare `{` line) [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
void f() {
  { x(); }
  { }
  switch (k) {
  default:
    {}
  }
}
```
```
--18
void f() {
  { x(); }
  {}
  switch (k) {
  default: {
  }
  }
}
--23
void f() {
  {
    x();
  }
  {
  }
  switch (k) {
  default: {
  }
  }
}
```

Group locations (file:line in nish output): abseil_abseil-cpp/absl/container/btree_benchmark.cc:409, abseil_abseil-cpp/absl/container/inlined_vector_test.cc:1722, abseil_abseil-cpp/absl/container/inlined_vector_test.cc:1728, abseil_abseil-cpp/absl/debugging/leak_check_fail_test.cc:36, abseil_abseil-cpp/absl/random/internal/explicit_seed_seq_test.cc:35, abseil_abseil-cpp/absl/random/internal/explicit_seed_seq_test.cc:42, abseil_abseil-cpp/absl/random/internal/salted_seed_seq_test.cc:39, abseil_abseil-cpp/absl/random/internal/salted_seed_seq_test.cc:46, abseil_abseil-cpp/absl/strings/internal/str_format/convert_test.cc:790, abseil_abseil-cpp/absl/strings/str_join_test.cc:379, abseil_abseil-cpp/absl/synchronization/mutex_test.cc:2258, facebook_folly/folly/channels/test/ChannelTest.cpp:155 ...

Files (59; * = only this category):
  - abseil_abseil-cpp/absl/container/btree_benchmark.cc *
  - abseil_abseil-cpp/absl/container/inlined_vector_test.cc *
  - abseil_abseil-cpp/absl/debugging/leak_check_fail_test.cc *
  - abseil_abseil-cpp/absl/random/internal/explicit_seed_seq_test.cc *
  - abseil_abseil-cpp/absl/random/internal/salted_seed_seq_test.cc *
  - abseil_abseil-cpp/absl/strings/internal/str_format/convert_test.cc *
  - abseil_abseil-cpp/absl/strings/str_join_test.cc *
  - abseil_abseil-cpp/absl/synchronization/mutex_test.cc  [also: braced-list-one-per-line]
  - facebook_folly/folly/channels/test/ChannelTest.cpp *
  - facebook_folly/folly/channels/test/MergeTest.cpp *
  - facebook_folly/folly/channels/test/MultiplexChannelTest.cpp *
  - facebook_folly/folly/compression/test/CompressionContextPoolTest.cpp *
  - facebook_folly/folly/container/test/small_vector_test.cpp *
  - facebook_folly/folly/coro/test/AsyncPipeTest.cpp  [also: assign-break]
  - facebook_folly/folly/coro/test/PromiseTest.cpp *
  - facebook_folly/folly/futures/test/FutureTest.cpp *
  - facebook_folly/folly/futures/test/PromiseTest.cpp *
  - facebook_folly/folly/futures/test/SemiFutureTest.cpp *
  - facebook_folly/folly/futures/test/ThenCompileTest.cpp *
  - facebook_folly/folly/init/test/InitSilenceTest.cpp *
  - facebook_folly/folly/io/test/IOBufTest.cpp *
  - facebook_folly/folly/logging/test/AsyncLogWriterTest.cpp *
  - facebook_folly/folly/synchronization/test/HazptrTcTest.cpp *
  - facebook_folly/folly/synchronization/test/HazptrTest.cpp *
  - facebook_folly/folly/synchronization/test/RcuBench.cpp *
  - facebook_folly/folly/synchronization/test/RcuTest.cpp *
  - facebook_folly/folly/test/FileLockTest.cpp *
  - facebook_folly/folly/test/ObserverContainerTest.cpp *
  - facebook_rocksdb/db/db_wal_test.cc *
  - facebook_rocksdb/db/db_with_timestamp_basic_test.cc *
  - facebook_rocksdb/db/experimental.cc *
  - facebook_rocksdb/db/perf_context_test.cc *
  - facebook_rocksdb/table/cleanable_test.cc *
  - facebook_rocksdb/test_util/sync_point.h *
  - facebook_rocksdb/utilities/transactions/lock/range/range_tree/lib/portability/toku_pthread.h  [also: macro-body-braced-list]
  - google_googletest/googlemock/include/gmock/gmock-more-actions.h  [also: indent-misc-after-macro-or-pp]
  - google_googletest/googlemock/test/gmock-function-mocker_test.cc *
  - google_googletest/googletest/test/googletest-port-test.cc *
  - opencv_opencv/3rdparty/harfbuzz/src/hb-number-parser.hh  [also: label-then-block-break]
  - opencv_opencv/3rdparty/harfbuzz/src/hb-object.hh *
  - opencv_opencv/3rdparty/harfbuzz/src/hb-ot-shaper-indic-machine.hh  [also: label-then-block-break]
  - opencv_opencv/3rdparty/harfbuzz/src/hb-ot-shaper-khmer-machine.hh  [also: label-then-block-break]
  - opencv_opencv/3rdparty/harfbuzz/src/hb-ot-shaper-myanmar-machine.hh  [also: label-then-block-break]
  - opencv_opencv/3rdparty/harfbuzz/src/hb-ot-shaper-use-machine.hh  [also: label-then-block-break]
  - opencv_opencv/3rdparty/ittnotify/src/ittnotify/ittnotify_config.h  [also: macro-body-braced-list]
  - opencv_opencv/3rdparty/zlib-ng/deflate.h *
  - opencv_opencv/3rdparty/zlib/deflate.h *
  - opencv_opencv/modules/core/include/opencv2/core/private.hpp *
  - opencv_opencv/modules/core/include/opencv2/core/utils/tls.hpp *
  - opencv_opencv/modules/core/src/parallel_impl.cpp  [also: decl-after-pp-guarded-attribute]
  - opencv_opencv/modules/core/src/trace.cpp *
  - opencv_opencv/modules/core/test/test_ptr.cpp *
  - opencv_opencv/modules/dnn/src/int8layers/conv2_int8_kernels.simd.hpp *
  - opencv_opencv/modules/dnn/src/layers/elementwise_layers.cpp *
  - opencv_opencv/modules/dnn/src/layers/mvn_layer.cpp *
  - opencv_opencv/modules/features/3rdparty/annoy/annoylib.h  [also: comment-indent-adjacent-pp]
  - opencv_opencv/modules/highgui/src/window.cpp *
  - opencv_opencv/modules/imgproc/test/test_canny.cpp *
  - opencv_opencv/modules/photo/src/inpaint.cpp *

### trailing-return-break

- trailing return type: break goes before `->` instead of inside the parameter list (functions, deduction guides, lambdas)
- files 59, only-category files 54, groups 146; module: indenter/annotate (penalty); clang-format: TokenAnnotator::splitPenalty / canBreakBefore for TT_TrailingReturnArrow [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
static auto transfer_impl(Alloc *alloc, slot_type *new_slot, slot_type *old_slot, Rank2) -> decltype(P::transfer(alloc, new_slot, old_slot)) { return 1; }
F14NodeMap(std::initializer_list<std::pair<Key, Mapped>>, std::size_t, Alloc) -> F14NodeMap<Key, Mapped, f14::DefaultHasher<Key>, f14::DefaultKeyEqual<Key>, Alloc>;
```
```
--18
static auto transfer_impl(Alloc *alloc, slot_type *new_slot, slot_type *old_slot,
                          Rank2) -> decltype(P::transfer(alloc, new_slot, old_slot)) {
  return 1;
}
F14NodeMap(std::initializer_list<std::pair<Key, Mapped>>, std::size_t,
           Alloc) -> F14NodeMap<Key, Mapped, f14::DefaultHasher<Key>, f14::DefaultKeyEqual<Key>, Alloc>;
--23
static auto transfer_impl(Alloc *alloc, slot_type *new_slot, slot_type *old_slot, Rank2)
    -> decltype(P::transfer(alloc, new_slot, old_slot)) {
  return 1;
}
F14NodeMap(std::initializer_list<std::pair<Key, Mapped>>, std::size_t, Alloc)
    -> F14NodeMap<Key, Mapped, f14::DefaultHasher<Key>, f14::DefaultKeyEqual<Key>, Alloc>;
```

Group locations (file:line in nish output): abseil_abseil-cpp/absl/container/internal/common_policy_traits.h:102, abseil_abseil-cpp/absl/container/internal/container_memory.h:156, abseil_abseil-cpp/absl/container/internal/container_memory.h:165, abseil_abseil-cpp/absl/container/internal/container_memory.h:217, abseil_abseil-cpp/absl/container/internal/container_memory.h:250, abseil_abseil-cpp/absl/container/internal/container_memory.h:261, abseil_abseil-cpp/absl/container/internal/raw_hash_set_benchmark.cc:149, abseil_abseil-cpp/absl/container/internal/raw_hash_set_benchmark.cc:738, abseil_abseil-cpp/absl/container/internal/raw_hash_set_benchmark.cc:752, abseil_abseil-cpp/absl/container/internal/raw_hash_set_test.cc:1056, abseil_abseil-cpp/absl/functional/function_ref.h:207, abseil_abseil-cpp/absl/log/internal/container.h:270 ...

Files (59; * = only this category):
  - abseil_abseil-cpp/absl/container/internal/common_policy_traits.h *
  - abseil_abseil-cpp/absl/container/internal/container_memory.h *
  - abseil_abseil-cpp/absl/container/internal/raw_hash_set_benchmark.cc *
  - abseil_abseil-cpp/absl/container/internal/raw_hash_set_test.cc *
  - abseil_abseil-cpp/absl/functional/function_ref.h *
  - abseil_abseil-cpp/absl/log/internal/container.h *
  - abseil_abseil-cpp/absl/random/distributions_test.cc *
  - abseil_abseil-cpp/absl/random/mocking_bit_gen.h *
  - abseil_abseil-cpp/absl/types/span.h *
  - facebook_folly/folly/FmtUtility.h *
  - facebook_folly/folly/Indirect.h *
  - facebook_folly/folly/Poly.h *
  - facebook_folly/folly/Range.h *
  - facebook_folly/folly/ScopeGuard.h  [also: rvalue-ref-pack-space]
  - facebook_folly/folly/String.h *
  - facebook_folly/folly/Subprocess.h *
  - facebook_folly/folly/algorithm/simd/detail/Traits.h *
  - facebook_folly/folly/compression/QuotientMultiSet-inl.h *
  - facebook_folly/folly/container/F14Map.h *
  - facebook_folly/folly/container/F14Set.h *
  - facebook_folly/folly/container/FBVector.h *
  - facebook_folly/folly/container/Hive.h *
  - facebook_folly/folly/container/MapUtil.h *
  - facebook_folly/folly/container/small_vector.h *
  - facebook_folly/folly/container/sorted_vector_types.h *
  - facebook_folly/folly/container/test/F14FancyPointerTest.cpp *
  - facebook_folly/folly/coro/BlockingWait.h *
  - facebook_folly/folly/coro/Collect-inl.h *
  - facebook_folly/folly/coro/Collect.h *
  - facebook_folly/folly/detail/tuple.h *
  - facebook_folly/folly/executors/CPUThreadPoolExecutor.cpp *
  - facebook_folly/folly/fibers/async/Async.h *
  - facebook_folly/folly/functional/ApplyTuple.h *
  - facebook_folly/folly/functional/Invoke.h *
  - facebook_folly/folly/futures/Future-inl.h *
  - facebook_folly/folly/futures/Future.h *
  - facebook_folly/folly/gen/Combine-inl.h *
  - facebook_folly/folly/gen/Core-inl.h *
  - facebook_folly/folly/io/async/EventUtil.h  [also: arrow-space-after-paren]
  - facebook_folly/folly/lang/Ordering.h *
  - facebook_folly/folly/lang/PropagateConst.h *
  - facebook_folly/folly/lang/SafeClosure.h *
  - facebook_folly/folly/lang/bind/NamedToStorage.h *
  - facebook_folly/folly/logging/ObjectToString.h *
  - facebook_folly/folly/result/rich_exception_ptr.h  [also: class-attr-break]
  - facebook_folly/folly/stats/QuantileEstimator-inl.h *
  - fmtlib_fmt/include/fmt/core.h *
  - fmtlib_fmt/include/fmt/format.h  [also: decl-after-pp-guarded-attribute]
  - fmtlib_fmt/include/fmt/ranges.h *
  - fmtlib_fmt/include/fmt/xchar.h *
  - google_googletest/googlemock/include/gmock/gmock-matchers.h *
  - nlohmann_json/include/nlohmann/detail/conversions/from_json.hpp *
  - nlohmann_json/include/nlohmann/detail/conversions/to_json.hpp *
  - nlohmann_json/include/nlohmann/detail/input/input_adapters.hpp *
  - nlohmann_json/include/nlohmann/detail/json_pointer.hpp *
  - opencv_opencv/3rdparty/harfbuzz/src/hb-iter.hh  [also: indent-reset-after-unterminated-macro]
  - protocolbuffers_protobuf/hpb/extension.h *
  - protocolbuffers_protobuf/src/google/protobuf/io/printer.h *
  - protocolbuffers_protobuf/src/google/protobuf/testing/protobuf_test.h *

### braced-init-space-after-name

- `T x {}` / `struct S x {..}` loses the space before `{` (also indentation of the list body, and `{}` merge for multi-line `x {\n}`)
- files 33, only-category files 26, groups 91; module: classify; clang-format: TokenAnnotator::spaceRequiredBefore, BK_BracedInit after declarator name (SpaceBeforeCpp11BracedList=false) [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
void f() {
  struct stat sbuf {};
  struct linger sl {
    .l_onoff = 0, .l_linger = 0,
  };
}
```
```
--18
void f() {
  struct stat sbuf {};
  struct linger sl {
    .l_onoff = 0, .l_linger = 0,
  };
}
--23
void f() {
  struct stat sbuf{};
  struct linger sl{
      .l_onoff = 0,
      .l_linger = 0,
  };
}
```

Group locations (file:line in nish output): abseil_abseil-cpp/absl/debugging/stacktrace_test.cc:389, facebook_folly/folly/debugging/symbolizer/SignalHandler.cpp:663, facebook_folly/folly/debugging/symbolizer/detail/SignalSafeLibc.h:109, facebook_folly/folly/debugging/symbolizer/test/ElfTest.cpp:502, facebook_folly/folly/debugging/symbolizer/test/ElfTest.cpp:509, facebook_folly/folly/debugging/symbolizer/test/FramePointerUnwinderTest.cpp:248, facebook_folly/folly/debugging/symbolizer/test/FramePointerUnwinderTest.cpp:253, facebook_folly/folly/debugging/symbolizer/test/SignalSafeLibcWarmUp.cpp:39, facebook_folly/folly/debugging/symbolizer/test/StackTraceTest.cpp:616, facebook_folly/folly/debugging/symbolizer/test/StackTraceTest.cpp:619, facebook_folly/folly/io/async/AsyncIoUringSocket.cpp:236, facebook_folly/folly/io/async/AsyncServerSocket.cpp:436 ...

Files (33; * = only this category):
  - abseil_abseil-cpp/absl/debugging/stacktrace_test.cc *
  - facebook_folly/folly/debugging/symbolizer/SignalHandler.cpp  [also: shift-literal-break-kept]
  - facebook_folly/folly/debugging/symbolizer/detail/SignalSafeLibc.h *
  - facebook_folly/folly/debugging/symbolizer/test/ElfTest.cpp *
  - facebook_folly/folly/debugging/symbolizer/test/FramePointerUnwinderTest.cpp  [also: shift-literal-break-kept]
  - facebook_folly/folly/debugging/symbolizer/test/SignalSafeLibcWarmUp.cpp *
  - facebook_folly/folly/debugging/symbolizer/test/StackTraceTest.cpp *
  - facebook_folly/folly/io/async/AsyncIoUringSocket.cpp  [also: shift-literal-break-kept]
  - facebook_folly/folly/io/async/AsyncServerSocket.cpp  [also: shift-literal-break-kept]
  - facebook_folly/folly/io/async/AsyncSocket.cpp  [also: shift-literal-break-kept]
  - facebook_folly/folly/io/async/EpollBackend.cpp *
  - facebook_folly/folly/io/async/EventBase.cpp  [also: shift-literal-break-kept]
  - facebook_folly/folly/io/async/EventBasePoller.cpp *
  - facebook_folly/folly/io/async/IoUringBackend.cpp  [also: shift-literal-break-kept]
  - facebook_folly/folly/io/async/IoUringDynamicProvidedBufferRing.cpp *
  - facebook_folly/folly/io/async/IoUringOptions.h *
  - facebook_folly/folly/io/async/IoUringProvidedBufferRing.cpp *
  - facebook_folly/folly/io/async/IoUringRecv.cpp *
  - facebook_folly/folly/io/async/IoUringSend.cpp *
  - facebook_folly/folly/io/async/IoUringZeroCopyBufferPool.cpp *
  - facebook_folly/folly/io/async/test/AsyncIoUringSocketTest.cpp *
  - facebook_folly/folly/io/async/test/AsyncUDPSocketTest.cpp *
  - facebook_folly/folly/io/async/test/AsyncUDPSocketZeroCopyTest.cpp *
  - facebook_folly/folly/io/async/test/IoUringBackendTest.cpp *
  - facebook_folly/folly/io/async/test/IoUringProvidedBufferRingBenchmark.cpp *
  - facebook_folly/folly/system/MemoryMapping.cpp *
  - facebook_folly/folly/system/test/MemoryMappingTest.cpp *
  - facebook_folly/folly/test/SocketAddressTestHelper.cpp *
  - facebook_rocksdb/env/fs_posix.cc *
  - facebook_rocksdb/env/io_posix.cc *
  - opencv_opencv/modules/highgui/src/window_wayland.cpp *
  - opencv_opencv/modules/imgcodecs/src/grfmt_spng.cpp *
  - protocolbuffers_protobuf/src/google/protobuf/io/zero_copy_stream_unittest.cc *

### comment-indent-adjacent-pp

- comment next to a preprocessor line keeps its SOURCE indentation instead of being re-indented to column 0 / code level
- files 25, only-category files 21, groups 42; module: format (comment indentation); clang-format: UnwrappedLineParser comment/PP-branch handling (parseComments/flushComments, PPBranchLevel) [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
#if A
  // n
#else
  #if B
    #include <e.h>
    // c1
    #define X 1
  #endif
#endif
```
```
--18
#if A
// n
#else
#if B
#include <e.h>
// c1
#define X 1
#endif
#endif
--23
#if A
// n
#else
#if B
#include <e.h>
    // c1
#define X 1
#endif
#endif
```

Group locations (file:line in nish output): abseil_abseil-cpp/absl/container/internal/raw_hash_set.h:3392, nlohmann_json/include/nlohmann/detail/input/simd_scan.hpp:79, nlohmann_json/include/nlohmann/detail/view/macro_scope.hpp:31, nlohmann_json/include/nlohmann/detail/view/macro_scope.hpp:65, nlohmann_json/include/nlohmann/detail/view/simd.hpp:75, opencv_opencv/3rdparty/harfbuzz/src/hb-font.hh:487, opencv_opencv/3rdparty/harfbuzz/src/hb-ot-shape.cc:132, opencv_opencv/3rdparty/harfbuzz/src/hb-ot-shape.cc:201, opencv_opencv/3rdparty/harfbuzz/src/hb-ot-tag.cc:305, opencv_opencv/3rdparty/include/vulkan/vk_platform.h:45, opencv_opencv/3rdparty/include/vulkan/vk_platform.h:53, opencv_opencv/3rdparty/zlib-ng/match_tpl.h:134 ...

Files (25; * = only this category):
  - abseil_abseil-cpp/absl/container/internal/raw_hash_set.h  [also: angle-bracket-ternary-misparse, ternary-chain-alignment]
  - nlohmann_json/include/nlohmann/detail/input/simd_scan.hpp  [also: decl-after-pp-guarded-attribute]
  - nlohmann_json/include/nlohmann/detail/view/macro_scope.hpp *
  - nlohmann_json/include/nlohmann/detail/view/simd.hpp *
  - opencv_opencv/3rdparty/harfbuzz/src/hb-font.hh *
  - opencv_opencv/3rdparty/harfbuzz/src/hb-ot-shape.cc *
  - opencv_opencv/3rdparty/harfbuzz/src/hb-ot-tag.cc *
  - opencv_opencv/3rdparty/include/vulkan/vk_platform.h *
  - opencv_opencv/3rdparty/zlib-ng/match_tpl.h *
  - opencv_opencv/hal/ipp/src/deriv_ipp.cpp *
  - opencv_opencv/modules/core/include/opencv2/core/cuda/datamov_utils.hpp *
  - opencv_opencv/modules/core/include/opencv2/core/fast_math.hpp  [also: SINGLETON]
  - opencv_opencv/modules/core/include/opencv2/core/hal/intrin_vsx.hpp *
  - opencv_opencv/modules/core/src/gl_core_3_1.hpp *
  - opencv_opencv/modules/core/src/parallel.cpp *
  - opencv_opencv/modules/features/3rdparty/annoy/annoylib.h  [also: standalone-block-split]
  - opencv_opencv/modules/flann/include/opencv2/flann/random.h *
  - opencv_opencv/modules/highgui/src/window_gtk.cpp *
  - opencv_opencv/modules/stereo/src/stereobm.cpp *
  - opencv_opencv/modules/video/src/tracking/detail/tracking_online_mil.cpp *
  - opencv_opencv/modules/videoio/src/cap_ffmpeg_hw.hpp *
  - opencv_opencv/modules/videoio/src/cap_ffmpeg_impl.hpp *
  - opencv_opencv/samples/winrt_universal/VideoCaptureXAML/video_capture_xaml/video_capture_xaml.Shared/main.cpp *
  - protocolbuffers_protobuf/src/google/protobuf/parse_context.h *
  - protocolbuffers_protobuf/src/google/protobuf/testing/file.cc *

### funcref-paren-space

- space before `(&)` / `(*)` of function-reference/array-ref/function-pointer declarators: `int(&)[N]` -> `int (&)[N]`
- files 23, only-category files 19, groups 43; module: classify; clang-format: TokenAnnotator::spaceRequiredBetween (TT_FunctionTypeLParen / array-or-func-ptr declarator) [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
void f() {
  static_assert(C<int[10], int(&)[10]>::value);
  const float(&cm)[16] = x;
  const int(*offsets)[2] = a;
}
```
```
--18
void f() {
  static_assert(C<int[10], int(&)[10]>::value);
  const float(&cm)[16] = x;
  const int(*offsets)[2] = a;
}
--23
void f() {
  static_assert(C<int[10], int (&)[10]>::value);
  const float (&cm)[16] = x;
  const int (*offsets)[2] = a;
}
```

Group locations (file:line in nish output): abseil_abseil-cpp/absl/algorithm/container_test.cc:2789, abseil_abseil-cpp/absl/algorithm/container_test.cc:2829, abseil_abseil-cpp/absl/algorithm/container_test.cc:2832, abseil_abseil-cpp/absl/algorithm/container_test.cc:2856, abseil_abseil-cpp/absl/algorithm/container_test.cc:2859, abseil_abseil-cpp/absl/meta/type_traits_test.cc:116, abseil_abseil-cpp/absl/meta/type_traits_test.cc:119, abseil_abseil-cpp/absl/status/status_macros_test.cc:413, facebook_folly/folly/ClockGettimeWrappers.cpp:70, facebook_folly/folly/lang/bind/test/BindTest.cpp:101, facebook_folly/folly/lang/bind/test/BindTest.cpp:105, facebook_folly/folly/lang/bind/test/NamedTest.cpp:83 ...

Files (23; * = only this category):
  - abseil_abseil-cpp/absl/algorithm/container_test.cc *
  - abseil_abseil-cpp/absl/meta/type_traits_test.cc *
  - abseil_abseil-cpp/absl/status/status_macros_test.cc *
  - facebook_folly/folly/ClockGettimeWrappers.cpp *
  - facebook_folly/folly/lang/bind/test/BindTest.cpp *
  - facebook_folly/folly/lang/bind/test/NamedTest.cpp *
  - facebook_folly/folly/lang/test/ToAsciiBench.cpp *
  - facebook_folly/folly/test/OverloadTest.cpp *
  - facebook_rocksdb/options/options_settable_test.cc *
  - fmtlib_fmt/test/core-test.cc *
  - google_googletest/googlemock/test/gmock-matchers-containers_test.cc *
  - google_googletest/googlemock/test/gmock-matchers-misc_test.cc *
  - google_googletest/googlemock/test/gmock-more-actions_test.cc  [also: SINGLETON]
  - nlohmann_json/tests/src/unit-type_traits.cpp *
  - opencv_opencv/hal/carotene/src/saturate_cast.hpp *
  - opencv_opencv/modules/core/include/opencv2/core/operations.hpp  [also: operator-macro-param-ref-space]
  - opencv_opencv/modules/features/src/fast_score.cpp  [also: ternary-chain-alignment]
  - opencv_opencv/modules/geometry/src/rho.cpp *
  - opencv_opencv/modules/objdetect/src/mcc/checker_detector.cpp  [also: line-comment-space-after-slashes]
  - opencv_opencv/modules/ptcloud/src/color_tsdf_functions.cpp *
  - opencv_opencv/modules/ptcloud/src/odometry_functions.cpp *
  - opencv_opencv/modules/ptcloud/src/tsdf_functions.cpp *
  - protocolbuffers_protobuf/upb/message/internal/message.h *

### decl-after-pp-guarded-attribute

- declaration after `#endif` that closes a PP-guarded attribute: 18 broke after the return type (or left the line unformatted / Allman brace), 23 formats normally
- files 18, only-category files 13, groups 25; module: format/parser (line after #endif); clang-format: UnwrappedLineParser (line after #endif following an attribute treated as continuation in 18) / ContinuationIndenter::mustBreak [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
#if defined(X)
__attribute__((noreturn))
#endif
static void wrapped_abort() {
  abort();
}
#if X
__attribute__((a))
#endif
int merge32s(const int** src, int* dst, int cn ) { return 1; }
```
```
--18
#if defined(X)
__attribute__((noreturn))
#endif
static void
wrapped_abort() {
  abort();
}
#if X
__attribute__((a))
#endif
int merge32s(const int** src, int* dst, int cn ) {
  return 1;
}
--23
#if defined(X)
__attribute__((noreturn))
#endif
static void wrapped_abort() {
  abort();
}
#if X
__attribute__((a))
#endif
int merge32s(const int **src, int *dst, int cn) {
  return 1;
}
```

Group locations (file:line in nish output): abseil_abseil-cpp/absl/base/macros.h:63, facebook_folly/folly/init/Init.cpp:51, facebook_folly/folly/lang/Exception.cpp:454, facebook_rocksdb/util/coding.h:328, facebook_rocksdb/util/coding.h:346, facebook_rocksdb/util/crc32c_arm64.cc:119, fmtlib_fmt/include/fmt/format.h:449, nlohmann_json/include/nlohmann/detail/input/simd_scan.hpp:145, opencv_opencv/3rdparty/harfbuzz/src/hb-open-type.hh:530, opencv_opencv/3rdparty/harfbuzz/src/hb-open-type.hh:1612, opencv_opencv/3rdparty/harfbuzz/src/hb-ot-layout-gsubgpos.hh:380, opencv_opencv/3rdparty/harfbuzz/src/hb-ot-layout-gsubgpos.hh:1154 ...

Files (18; * = only this category):
  - abseil_abseil-cpp/absl/base/macros.h *
  - facebook_folly/folly/init/Init.cpp *
  - facebook_folly/folly/lang/Exception.cpp *
  - facebook_rocksdb/util/coding.h *
  - facebook_rocksdb/util/crc32c_arm64.cc *
  - fmtlib_fmt/include/fmt/format.h  [also: trailing-return-break]
  - nlohmann_json/include/nlohmann/detail/input/simd_scan.hpp  [also: comment-indent-adjacent-pp]
  - opencv_opencv/3rdparty/harfbuzz/src/hb-open-type.hh *
  - opencv_opencv/3rdparty/harfbuzz/src/hb-ot-layout-gsubgpos.hh *
  - opencv_opencv/3rdparty/harfbuzz/src/hb-sanitize.hh  [also: indent-reset-after-unterminated-macro]
  - opencv_opencv/3rdparty/protobuf/src/google/protobuf/io/coded_stream.h *
  - opencv_opencv/3rdparty/protobuf/src/google/protobuf/message.cc  [also: shift-literal-break-kept]
  - opencv_opencv/hal/riscv-rvv/src/core/merge.cpp *
  - opencv_opencv/modules/core/src/alloc.cpp *
  - opencv_opencv/modules/core/src/parallel_impl.cpp  [also: standalone-block-split]
  - opencv_opencv/modules/dnn/src/layers/dequantizelinear_layer.cpp *
  - opencv_opencv/modules/dnn/src/layers/quantlizelinear_layer.cpp *
  - protocolbuffers_protobuf/src/google/protobuf/io/coded_stream.h *

### braced-list-one-per-line

- long braced list (>~20 items, or items that wrap / carry trailing comments) goes one element per line instead of bin-packed/columns
- files 15, only-category files 13, groups 34; module: indenter (CommaSeparatedList); clang-format: CommaSeparatedList::formatAfterToken / ContinuationIndenter + BinPackLongBracedList (clang-format 21 option) [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
const T kValues[] = {
    std::numeric_limits<T>::max(),
    std::numeric_limits<T>::epsilon(),
    std::nextafter(std::numeric_limits<T>::min(),
                   T(1)), // min + epsilon
    std::numeric_limits<T>::min(),        // smallest normal
};
```
```
--18
const T kValues[] = {
    std::numeric_limits<T>::max(), std::numeric_limits<T>::epsilon(),
    std::nextafter(std::numeric_limits<T>::min(),
                   T(1)),          // min + epsilon
    std::numeric_limits<T>::min(), // smallest normal
};
--23
const T kValues[] = {
    std::numeric_limits<T>::max(),
    std::numeric_limits<T>::epsilon(),
    std::nextafter(std::numeric_limits<T>::min(),
                   T(1)),          // min + epsilon
    std::numeric_limits<T>::min(), // smallest normal
};
```

Group locations (file:line in nish output): abseil_abseil-cpp/absl/random/beta_distribution_test.cc:82, abseil_abseil-cpp/absl/random/beta_distribution_test.cc:97, abseil_abseil-cpp/absl/random/exponential_distribution_test.cc:69, abseil_abseil-cpp/absl/random/exponential_distribution_test.cc:72, abseil_abseil-cpp/absl/random/gaussian_distribution_test.cc:68, abseil_abseil-cpp/absl/random/gaussian_distribution_test.cc:70, abseil_abseil-cpp/absl/random/poisson_distribution_test.cc:88, abseil_abseil-cpp/absl/random/poisson_distribution_test.cc:94, abseil_abseil-cpp/absl/random/poisson_distribution_test.cc:96, abseil_abseil-cpp/absl/synchronization/mutex_test.cc:1714, abseil_abseil-cpp/absl/synchronization/mutex_test.cc:1753, facebook_folly/folly/algorithm/test/StableRadixSortTest.cpp:210 ...

Files (15; * = only this category):
  - abseil_abseil-cpp/absl/random/beta_distribution_test.cc *
  - abseil_abseil-cpp/absl/random/exponential_distribution_test.cc *
  - abseil_abseil-cpp/absl/random/gaussian_distribution_test.cc *
  - abseil_abseil-cpp/absl/random/poisson_distribution_test.cc *
  - abseil_abseil-cpp/absl/synchronization/mutex_test.cc  [also: standalone-block-split]
  - facebook_folly/folly/algorithm/test/StableRadixSortTest.cpp *
  - facebook_folly/folly/cli/test/ArgsTest.cpp  [also: shift-literal-break-kept]
  - facebook_folly/folly/concurrency/memory/test/AtomicReadMostlyMainPtrTest.cpp *
  - facebook_rocksdb/table/block_based/block_cache.cc *
  - facebook_rocksdb/utilities/trie_index/trie_index_test.cc *
  - nlohmann_json/tests/src/unit-bson.cpp *
  - opencv_opencv/3rdparty/harfbuzz/src/hb-unicode.cc *
  - opencv_opencv/3rdparty/zlib-ng/arch/generic/chunk_permute_table.h *
  - opencv_opencv/hal/riscv-rvv/src/core/exp.cpp *
  - opencv_opencv/hal/riscv-rvv/src/core/log.cpp *

### macro-body-braced-list

- `#define X { a, b }` body is a braced list: `{a, b}` on the #define line, no inner spaces (and no `{`-own-line for trailing-comma lists)
- files 15, only-category files 11, groups 31; module: parser (macro body) + classify; clang-format: UnwrappedLineParser::tryToParseBracedList for #define bodies; TokenAnnotator braced-list spacing [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
#define ITT_MAGIC \
  { 0xED, 0xAB, 0xAB }
#define Z_ONCE_INIT \
  { ATOMIC_FLAG_INIT, 0 }
```
```
--18
#define ITT_MAGIC                                                                                                      \
  { 0xED, 0xAB, 0xAB }
#define Z_ONCE_INIT                                                                                                    \
  { ATOMIC_FLAG_INIT, 0 }
--23
#define ITT_MAGIC {0xED, 0xAB, 0xAB}
#define Z_ONCE_INIT {ATOMIC_FLAG_INIT, 0}
```

Group locations (file:line in nish output): abseil_abseil-cpp/absl/strings/numbers.cc:1280, facebook_folly/folly/cli/ProgramOptions.cpp:213, facebook_folly/folly/lang/SafeAssert.cpp:56, facebook_rocksdb/utilities/transactions/lock/range/range_tree/lib/portability/toku_pthread.h:97, facebook_rocksdb/utilities/transactions/lock/range/range_tree/lib/portability/toku_pthread.h:100, facebook_rocksdb/utilities/transactions/lock/range/range_tree/lib/portability/toku_pthread.h:132, facebook_rocksdb/utilities/transactions/lock/range/range_tree/lib/portability/toku_pthread.h:137, facebook_rocksdb/utilities/transactions/lock/range/range_tree/lib/portability/toku_pthread.h:146, facebook_rocksdb/utilities/transactions/lock/range/range_tree/lib/portability/toku_pthread.h:151, facebook_rocksdb/utilities/transactions/lock/range/range_tree/lib/portability/toku_pthread.h:163, facebook_rocksdb/utilities/transactions/lock/range/range_tree/lib/portability/toku_pthread.h:168, facebook_rocksdb/utilities/transactions/lock/range/range_tree/lib/portability/toku_pthread.h:177 ...

Files (15; * = only this category):
  - abseil_abseil-cpp/absl/strings/numbers.cc *
  - facebook_folly/folly/cli/ProgramOptions.cpp *
  - facebook_folly/folly/lang/SafeAssert.cpp *
  - facebook_rocksdb/utilities/transactions/lock/range/range_tree/lib/portability/toku_pthread.h  [also: standalone-block-split]
  - opencv_opencv/3rdparty/harfbuzz/src/hb-buffer.h *
  - opencv_opencv/3rdparty/harfbuzz/src/hb-draw.h *
  - opencv_opencv/3rdparty/harfbuzz/src/hb-geometry.hh *
  - opencv_opencv/3rdparty/ittnotify/src/ittnotify/ittnotify_config.h  [also: standalone-block-split]
  - opencv_opencv/3rdparty/zlib/zutil.h *
  - opencv_opencv/hal/carotene/src/channels_combine.cpp *
  - opencv_opencv/modules/core/include/opencv2/core/hal/intrin_rvv071.hpp  [also: line-comment-space-after-slashes]
  - opencv_opencv/modules/core/include/opencv2/core/hal/msa_macros.h  [also: attribute-between-type-and-name-break, cast-unary-operand-space]
  - opencv_opencv/modules/core/src/cuda_info.cpp *
  - protocolbuffers_protobuf/python/google/protobuf/pyext/extension_dict.cc *
  - protocolbuffers_protobuf/upb/base/string_view.h *

### cast-unary-operand-space

- C cast followed by unary operand: `(T) *p`, `(T) &x`, `(T) -1`, `(T) +x`, `(T) reinterpret_cast<..>` -> no space after `)`
- files 13, only-category files 12, groups 15; module: classify; clang-format: TokenAnnotator::determineIsCast / spaceRequiredBetween after cast rparen [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
#define kUpb_Map_Begin ((size_t) - 1)
void f() {
  x = (int64_t) + font->x_scale * 4;
  y = (uint8_t) * this;
  z = (size_t) & (((data_t *)0)->u1);
  w = (int32_t) reinterpret_cast<uintptr_t>(arg);
}
```
```
--18
#define kUpb_Map_Begin ((size_t) - 1)
void f() {
  x = (int64_t) + font->x_scale * 4;
  y = (uint8_t) * this;
  z = (size_t) & (((data_t *)0)->u1);
  w = (int32_t) reinterpret_cast<uintptr_t>(arg);
}
--23
#define kUpb_Map_Begin ((size_t)-1)
void f() {
  x = (int64_t)+font->x_scale * 4;
  y = (uint8_t)*this;
  z = (size_t)&(((data_t *)0)->u1);
  w = (int32_t)reinterpret_cast<uintptr_t>(arg);
}
```

Group locations (file:line in nish output): facebook_folly/folly/portability/test/PThreadTest.cpp:34, nlohmann_json/include/nlohmann/thirdparty/hedley/hedley.hpp:1654, opencv_opencv/3rdparty/harfbuzz/src/OT/Layout/GPOS/ValueFormat.hh:68, opencv_opencv/3rdparty/harfbuzz/src/hb-cff-interp-common.hh:434, opencv_opencv/3rdparty/harfbuzz/src/hb-ot-shape-fallback.cc:507, opencv_opencv/modules/core/include/opencv2/core/hal/msa_macros.h:775, opencv_opencv/modules/core/include/opencv2/core/hal/msa_macros.h:785, opencv_opencv/modules/core/src/persistence.cpp:1179, opencv_opencv/modules/core/test/test_io.cpp:522, opencv_opencv/modules/imgproc/src/smooth.simd.hpp:1484, opencv_opencv/modules/imgproc/src/smooth.simd.hpp:1487, protocolbuffers_protobuf/upb/message/internal/iterator.h:22 ...

Files (13; * = only this category):
  - facebook_folly/folly/portability/test/PThreadTest.cpp *
  - nlohmann_json/include/nlohmann/thirdparty/hedley/hedley.hpp *
  - opencv_opencv/3rdparty/harfbuzz/src/OT/Layout/GPOS/ValueFormat.hh *
  - opencv_opencv/3rdparty/harfbuzz/src/hb-cff-interp-common.hh *
  - opencv_opencv/3rdparty/harfbuzz/src/hb-ot-shape-fallback.cc *
  - opencv_opencv/modules/core/include/opencv2/core/hal/msa_macros.h  [also: attribute-between-type-and-name-break, macro-body-braced-list]
  - opencv_opencv/modules/core/src/persistence.cpp *
  - opencv_opencv/modules/core/test/test_io.cpp *
  - opencv_opencv/modules/imgproc/src/smooth.simd.hpp *
  - protocolbuffers_protobuf/upb/message/internal/iterator.h *
  - protocolbuffers_protobuf/upb/message/map.h *
  - protocolbuffers_protobuf/upb/mini_table/internal/field.h *
  - protocolbuffers_protobuf/upb/wire/internal/decoder.h *

### SINGLETON

- no shared pattern (see list)
- files 11, only-category files 8, groups 12; module: -; clang-format: -

(no isolated snippet; see group examples)

Group locations (file:line in nish output): google_googletest/googlemock/test/gmock-more-actions_test.cc:739, google_googletest/googletest/include/gtest/internal/gtest-internal.h:1235, opencv_opencv/3rdparty/include/opencl/1.2/CL/cl_platform.h:462, opencv_opencv/3rdparty/protobuf/src/google/protobuf/message.h:1071, opencv_opencv/modules/core/include/opencv2/core/fast_math.hpp:170, opencv_opencv/modules/core/include/opencv2/core/mat.hpp:669, opencv_opencv/modules/videoio/test/test_gstreamer.cpp:198, opencv_opencv/samples/cpp/tutorial_code/calib3d/real_time_pose_estimation/src/main_registration.cpp:28, opencv_opencv/samples/winrt/ImageManipulations/common/suspensionmanager.cpp:409, protocolbuffers_protobuf/conformance/binary_json_conformance_suite.cc:1878, protocolbuffers_protobuf/upb/port/overflow.h:83, protocolbuffers_protobuf/upb/port/overflow.h:90

Files (11; * = only this category):
  - google_googletest/googlemock/test/gmock-more-actions_test.cc  [also: funcref-paren-space]
  - google_googletest/googletest/include/gtest/internal/gtest-internal.h *
  - opencv_opencv/3rdparty/include/opencl/1.2/CL/cl_platform.h *
  - opencv_opencv/3rdparty/protobuf/src/google/protobuf/message.h *
  - opencv_opencv/modules/core/include/opencv2/core/fast_math.hpp  [also: comment-indent-adjacent-pp]
  - opencv_opencv/modules/core/include/opencv2/core/mat.hpp *
  - opencv_opencv/modules/videoio/test/test_gstreamer.cpp *
  - opencv_opencv/samples/cpp/tutorial_code/calib3d/real_time_pose_estimation/src/main_registration.cpp *
  - opencv_opencv/samples/winrt/ImageManipulations/common/suspensionmanager.cpp  [also: cppcx-handle-declarations, indent-reset-after-unterminated-macro]
  - protocolbuffers_protobuf/conformance/binary_json_conformance_suite.cc *
  - protocolbuffers_protobuf/upb/port/overflow.h *

### space-before-scope-op

- source `X ::y` (space before `::`) is normalised to `X::y`
- files 10, only-category files 7, groups 44; module: classify; clang-format: TokenAnnotator::spaceRequiredBefore (tok::coloncolon after identifier) [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
void f() {
  const softfloat x = softfloat ::inf();
  a = V ::ASPRT;
}
```
```
--18
void f() {
  const softfloat x = softfloat ::inf();
  a = V ::ASPRT;
}
--23
void f() {
  const softfloat x = softfloat::inf();
  a = V::ASPRT;
}
```

Group locations (file:line in nish output): opencv_opencv/modules/calib/src/multiview_calibration.cpp:808, opencv_opencv/modules/core/perf/opencl/perf_arithm.cpp:1081, opencv_opencv/modules/core/perf/perf_arithm.cpp:823, opencv_opencv/modules/core/test/ocl/test_arithm.cpp:1603, opencv_opencv/modules/geometry/src/usac/ransac_solvers.cpp:490, opencv_opencv/modules/geometry/src/usac/ransac_solvers.cpp:785, opencv_opencv/modules/geometry/src/usac/ransac_solvers.cpp:922, opencv_opencv/modules/geometry/src/usac/ransac_solvers.cpp:1216, opencv_opencv/modules/geometry/src/usac/ransac_solvers.cpp:1218, opencv_opencv/modules/geometry/src/usac/ransac_solvers.cpp:1281, opencv_opencv/modules/geometry/src/usac/ransac_solvers.cpp:1286, opencv_opencv/modules/geometry/src/usac/ransac_solvers.cpp:1294 ...

Files (10; * = only this category):
  - opencv_opencv/modules/calib/src/multiview_calibration.cpp *
  - opencv_opencv/modules/core/perf/opencl/perf_arithm.cpp *
  - opencv_opencv/modules/core/perf/perf_arithm.cpp *
  - opencv_opencv/modules/core/test/ocl/test_arithm.cpp *
  - opencv_opencv/modules/geometry/src/usac/ransac_solvers.cpp  [also: angle-bracket-ternary-misparse]
  - opencv_opencv/modules/geometry/test/test_usac.cpp *
  - opencv_opencv/modules/imgproc/test/test_cvtyuv.cpp *
  - protocolbuffers_protobuf/src/google/protobuf/compiler/cpp/tools/analyze_profile_proto.cc  [also: inline-block-comment-attach]
  - protocolbuffers_protobuf/src/google/protobuf/compiler/parser_unittest.cc *
  - protocolbuffers_protobuf/src/google/protobuf/util/message_differencer.cc  [also: shift-literal-break-kept]

### indent-reset-after-unterminated-macro

- macro invocation without `;` (HB_AUTO_RETURN(..), InspectableClass(..), C++/CX `public :`) no longer swallows the next declaration: indentation resets
- files 9, only-category files 2, groups 17; module: parser; clang-format: UnwrappedLineParser::parseStructuralElement / isMacro invocation detection [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
struct S {
 private:
  template <typename T, typename... Ts>
  auto _dispatch(const T &obj, hb_priority<1>, Ts &&...ds) HB_AUTO_RETURN(obj.sanitize(this, std::forward<Ts>(ds)...))

  template <typename T, typename... Ts>
  auto _dispatch(const T &obj, hb_priority<0>, Ts &&...ds) HB_AUTO_RETURN(default_return_value())
 public:
  int x;
};
```
```
--18
struct S {
private:
  template <typename T, typename... Ts>
  auto _dispatch(const T &obj, hb_priority<1>, Ts &&...ds) HB_AUTO_RETURN(obj.sanitize(this, std::forward<Ts>(ds)...))

      template <typename T, typename... Ts>
      auto _dispatch(const T &obj, hb_priority<0>, Ts &&...ds) HB_AUTO_RETURN(default_return_value()) public : int x;
};
--23
struct S {
private:
template <typename T, typename... Ts>
auto _dispatch(const T &obj, hb_priority<1>, Ts &&...ds) HB_AUTO_RETURN(obj.sanitize(this, std::forward<Ts>(ds)...))

    template <typename T, typename... Ts>
    auto _dispatch(const T &obj, hb_priority<0>, Ts &&...ds) HB_AUTO_RETURN(default_return_value()) public : int x;
};
```

Group locations (file:line in nish output): opencv_opencv/3rdparty/harfbuzz/src/hb-iter.hh:218, opencv_opencv/3rdparty/harfbuzz/src/hb-iter.hh:221, opencv_opencv/3rdparty/harfbuzz/src/hb-iter.hh:224, opencv_opencv/3rdparty/harfbuzz/src/hb-iter.hh:226, opencv_opencv/3rdparty/harfbuzz/src/hb-ot-layout.cc:2223, opencv_opencv/3rdparty/harfbuzz/src/hb-ot-layout.cc:2317, opencv_opencv/3rdparty/harfbuzz/src/hb-sanitize.hh:141, opencv_opencv/3rdparty/harfbuzz/src/hb-sanitize.hh:149, opencv_opencv/3rdparty/harfbuzz/src/hb-subset.hh:44, opencv_opencv/3rdparty/harfbuzz/src/hb-subset.hh:52, opencv_opencv/modules/videoio/src/cap_winrt/MediaSink.hpp:36, opencv_opencv/modules/videoio/src/cap_winrt/MediaSink.hpp:38 ...

Files (9; * = only this category):
  - opencv_opencv/3rdparty/harfbuzz/src/hb-iter.hh  [also: trailing-return-break]
  - opencv_opencv/3rdparty/harfbuzz/src/hb-ot-layout.cc  [also: class-attr-break]
  - opencv_opencv/3rdparty/harfbuzz/src/hb-sanitize.hh  [also: decl-after-pp-guarded-attribute]
  - opencv_opencv/3rdparty/harfbuzz/src/hb-subset.hh *
  - opencv_opencv/modules/videoio/src/cap_winrt/MediaSink.hpp  [also: cppcx-handle-declarations]
  - opencv_opencv/samples/winrt/ImageManipulations/Constants.h  [also: cppcx-handle-declarations]
  - opencv_opencv/samples/winrt/ImageManipulations/MediaExtensions/OcvTransform/OcvTransform.h *
  - opencv_opencv/samples/winrt/ImageManipulations/common/LayoutAwarePage.h  [also: cppcx-handle-declarations]
  - opencv_opencv/samples/winrt/ImageManipulations/common/suspensionmanager.cpp  [also: SINGLETON, cppcx-handle-declarations]

### ptr-qualifier-macro-space

- `T * MACRO` pointer-qualifier macro (absl_nonnull, FAR, ...): `*MACRO` in template args/casts, `* MACRO *MACRO` for nested pointers
- files 9, only-category files 9, groups 15; module: classify; clang-format: TokenAnnotator::spaceRequiredBetween / isPointerOrReference + attribute-macro heuristics [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
using T = std::pair<const char * absl_nonnull, int>;
auto *s = reinterpret_cast<uint64_t * ABSL_RESTRICT>(p);
void f(const FieldDescriptor *PROTOBUF_NULLABLE *PROTOBUF_NONNULL a);
```
```
--18
using T = std::pair<const char * absl_nonnull, int>;
auto *s = reinterpret_cast<uint64_t * ABSL_RESTRICT>(p);
void f(const FieldDescriptor *PROTOBUF_NULLABLE *PROTOBUF_NONNULL a);
--23
using T = std::pair<const char *absl_nonnull, int>;
auto *s = reinterpret_cast<uint64_t *ABSL_RESTRICT>(p);
void f(const FieldDescriptor * PROTOBUF_NULLABLE * PROTOBUF_NONNULL a);
```

Group locations (file:line in nish output): abseil_abseil-cpp/absl/base/nullability_test.cc:44, abseil_abseil-cpp/absl/base/nullability_test.cc:50, abseil_abseil-cpp/absl/log/internal/check_op.h:70, abseil_abseil-cpp/absl/log/internal/check_op.h:77, abseil_abseil-cpp/absl/log/internal/check_op.h:84, abseil_abseil-cpp/absl/log/internal/check_op.h:91, abseil_abseil-cpp/absl/log/internal/check_op.h:119, abseil_abseil-cpp/absl/log/internal/check_op.h:130, abseil_abseil-cpp/absl/random/internal/randen_slow.cc:354, opencv_opencv/3rdparty/zlib/inftrees.h:56, opencv_opencv/3rdparty/zlib/zlib.h:1101, protocolbuffers_protobuf/src/google/protobuf/any.cc:41 ...

Files (9; * = only this category):
  - abseil_abseil-cpp/absl/base/nullability_test.cc *
  - abseil_abseil-cpp/absl/log/internal/check_op.h *
  - abseil_abseil-cpp/absl/random/internal/randen_slow.cc *
  - opencv_opencv/3rdparty/zlib/inftrees.h *
  - opencv_opencv/3rdparty/zlib/zlib.h *
  - protocolbuffers_protobuf/src/google/protobuf/any.cc *
  - protocolbuffers_protobuf/src/google/protobuf/any.h *
  - protocolbuffers_protobuf/src/google/protobuf/descriptor_database.cc *
  - protocolbuffers_protobuf/src/google/protobuf/descriptor_database.h *

### doxygen-comment-reflow

- comment reflow breaks before doxygen/LaTeX commands (`\f[`, `\f]`, `\f$`, `\note`, `\end{..}`)
- files 8, only-category files 7, groups 32; module: format (comment reflow); clang-format: BreakableBlockComment / BreakableLineComment reflow split (doxygen command start) [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
/**
 { \frac{\|\texttt{src1}-\texttt{src2}\|_{L_2} }{\|\texttt{src2}\|_{L_2}} }{if  \(\texttt{normType} = \texttt{NORM_RELATIVE | NORM_L2}\) }
 \f]
 */
int x;
```
```
--18
/**
 { \frac{\|\texttt{src1}-\texttt{src2}\|_{L_2} }{\|\texttt{src2}\|_{L_2}} }{if  \(\texttt{normType} =
 \texttt{NORM_RELATIVE | NORM_L2}\) } \f]
 */
int x;
--23
/**
 { \frac{\|\texttt{src1}-\texttt{src2}\|_{L_2} }{\|\texttt{src2}\|_{L_2}} }{if  \(\texttt{normType} =
 \texttt{NORM_RELATIVE | NORM_L2}\) }
 \f]
 */
int x;
```

Group locations (file:line in nish output): opencv_opencv/modules/calib/include/opencv2/calib.hpp:144, opencv_opencv/modules/calib/include/opencv2/calib.hpp:204, opencv_opencv/modules/calib/include/opencv2/calib.hpp:379, opencv_opencv/modules/calib/include/opencv2/calib.hpp:404, opencv_opencv/modules/calib/include/opencv2/calib.hpp:417, opencv_opencv/modules/calib/include/opencv2/calib.hpp:1182, opencv_opencv/modules/calib/include/opencv2/calib.hpp:1201, opencv_opencv/modules/calib/include/opencv2/calib.hpp:1329, opencv_opencv/modules/calib/include/opencv2/calib.hpp:1348, opencv_opencv/modules/core/include/opencv2/core/base.hpp:100, opencv_opencv/modules/core/include/opencv2/core/base.hpp:109, opencv_opencv/modules/core/include/opencv2/core/base.hpp:117 ...

Files (8; * = only this category):
  - opencv_opencv/modules/calib/include/opencv2/calib.hpp  [also: assign-break]
  - opencv_opencv/modules/core/include/opencv2/core.hpp *
  - opencv_opencv/modules/core/include/opencv2/core/base.hpp *
  - opencv_opencv/modules/core/include/opencv2/core/dualquaternion.hpp *
  - opencv_opencv/modules/core/include/opencv2/core/hal/intrin_cpp.hpp *
  - opencv_opencv/modules/core/include/opencv2/core/quaternion.hpp *
  - opencv_opencv/modules/geometry/include/opencv2/geometry/2d.hpp *
  - opencv_opencv/modules/imgproc/include/opencv2/imgproc.hpp *

### empty-body-semicolon-space

- `f() : a(b){};` / `~A() override{};` -> space before `{` kept: `) {};`
- files 8, only-category files 8, groups 11; module: classify; clang-format: TokenAnnotator::spaceRequiredBefore (l_brace after r_paren/override) [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
struct A {
  A(int code) : kCode_(code){};
  ~A() override{};
};
```
```
--18
struct A {
  A(int code) : kCode_(code){};
  ~A() override{};
};
--23
struct A {
  A(int code) : kCode_(code) {};
  ~A() override {};
};
```

Group locations (file:line in nish output): facebook_rocksdb/java/rocksjni/kv_helper.h:83, facebook_rocksdb/java/rocksjni/kv_helper.h:168, facebook_rocksdb/java/rocksjni/kv_helper.h:174, opencv_opencv/3rdparty/harfbuzz/src/hb-set.hh:170, opencv_opencv/modules/dnn/src/ie_ngraph.hpp:126, opencv_opencv/modules/highgui/src/window_QT.h:414, opencv_opencv/modules/photo/src/ccm/illumobserver.cpp:13, opencv_opencv/modules/ptcloud/include/opencv2/ptcloud/detail/submap.hpp:28, protocolbuffers_protobuf/python/google/protobuf/pyext/message_module.cc:37, protocolbuffers_protobuf/python/google/protobuf/pyext/message_module.cc:39, protocolbuffers_protobuf/src/google/protobuf/compiler/objectivec/message.cc:132

Files (8; * = only this category):
  - facebook_rocksdb/java/rocksjni/kv_helper.h *
  - opencv_opencv/3rdparty/harfbuzz/src/hb-set.hh *
  - opencv_opencv/modules/dnn/src/ie_ngraph.hpp *
  - opencv_opencv/modules/highgui/src/window_QT.h *
  - opencv_opencv/modules/photo/src/ccm/illumobserver.cpp *
  - opencv_opencv/modules/ptcloud/include/opencv2/ptcloud/detail/submap.hpp *
  - protocolbuffers_protobuf/python/google/protobuf/pyext/message_module.cc *
  - protocolbuffers_protobuf/src/google/protobuf/compiler/objectivec/message.cc *

### class-attr-break

- `class [[nodiscard]]` / `class MACRO [[attr]] Name` : no forced break after the attribute, `template <..> class ...` merged onto one line
- files 7, only-category files 4, groups 8; module: annotate; clang-format: TokenAnnotator (class head attribute handling; BreakTemplateDeclarations / ClassHeadName) [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
class [[nodiscard]]
rich final : public B {};
template <typename T>
class [[nodiscard]]
now_task final : public detail::now_task_with_executor_base<T> {};
```
```
--18
class [[nodiscard]]
rich final : public B {};
template <typename T>
class [[nodiscard]]
now_task final : public detail::now_task_with_executor_base<T> {};
--23
class [[nodiscard]] rich final : public B {};
template <typename T> class [[nodiscard]] now_task final : public detail::now_task_with_executor_base<T> {};
```

Group locations (file:line in nish output): facebook_folly/folly/coro/safe/NowTask.h:77, facebook_folly/folly/result/result.h:522, facebook_folly/folly/result/rich_exception_ptr.h:989, google_googletest/googletest/include/gtest/gtest-matchers.h:499, opencv_opencv/3rdparty/harfbuzz/src/hb-ot-layout.cc:2266, protocolbuffers_protobuf/src/google/protobuf/map_field.h:966, protocolbuffers_protobuf/src/google/protobuf/repeated_field_proxy.h:304, protocolbuffers_protobuf/src/google/protobuf/repeated_field_proxy.h:319

Files (7; * = only this category):
  - facebook_folly/folly/coro/safe/NowTask.h *
  - facebook_folly/folly/result/result.h *
  - facebook_folly/folly/result/rich_exception_ptr.h  [also: trailing-return-break]
  - google_googletest/googletest/include/gtest/gtest-matchers.h *
  - opencv_opencv/3rdparty/harfbuzz/src/hb-ot-layout.cc  [also: indent-reset-after-unterminated-macro]
  - protocolbuffers_protobuf/src/google/protobuf/map_field.h  [also: shift-literal-break-kept]
  - protocolbuffers_protobuf/src/google/protobuf/repeated_field_proxy.h *

### label-then-block-break

- label followed by block: `lbl: {}` -> `lbl:\n  {\n  }` (also cascades re-indent of following code)
- files 6, only-category files 1, groups 9; module: format/annotate; clang-format: UnwrappedLineParser::parseLabel (block after label no longer attached) / unwrapped line split [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
void f() {
  _test_eof: {}
  _out: {}
}
```
```
--18
void f() {
_test_eof: {}
_out: {}
}
--23
void f() {
_test_eof:
  {
  }
_out:
  {
  }
}
```

Group locations (file:line in nish output): opencv_opencv/3rdparty/harfbuzz/src/hb-number-parser.hh:152, opencv_opencv/3rdparty/harfbuzz/src/hb-ot-shaper-indic-machine.hh:684, opencv_opencv/3rdparty/harfbuzz/src/hb-ot-shaper-indic.cc:1113, opencv_opencv/3rdparty/harfbuzz/src/hb-ot-shaper-indic.cc:1123, opencv_opencv/3rdparty/harfbuzz/src/hb-ot-shaper-indic.cc:1125, opencv_opencv/3rdparty/harfbuzz/src/hb-ot-shaper-indic.cc:1153, opencv_opencv/3rdparty/harfbuzz/src/hb-ot-shaper-khmer-machine.hh:312, opencv_opencv/3rdparty/harfbuzz/src/hb-ot-shaper-myanmar-machine.hh:393, opencv_opencv/3rdparty/harfbuzz/src/hb-ot-shaper-use-machine.hh:685

Files (6; * = only this category):
  - opencv_opencv/3rdparty/harfbuzz/src/hb-number-parser.hh  [also: standalone-block-split]
  - opencv_opencv/3rdparty/harfbuzz/src/hb-ot-shaper-indic-machine.hh  [also: standalone-block-split]
  - opencv_opencv/3rdparty/harfbuzz/src/hb-ot-shaper-indic.cc *
  - opencv_opencv/3rdparty/harfbuzz/src/hb-ot-shaper-khmer-machine.hh  [also: standalone-block-split]
  - opencv_opencv/3rdparty/harfbuzz/src/hb-ot-shaper-myanmar-machine.hh  [also: standalone-block-split]
  - opencv_opencv/3rdparty/harfbuzz/src/hb-ot-shaper-use-machine.hh  [also: standalone-block-split]

### operator-macro-param-ref-space

- `operator co_await(Self&& self)` and macro-named operators (`operator OP(R& a)`): `T &&x` / `T &a` spacing
- files 6, only-category files 5, groups 9; module: classify; clang-format: TokenAnnotator::determineStarAmpUsage after `operator` + identifier [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
struct S {
  friend ResultAwaiter<T2> operator co_await(Self&& self) { return 1; }
  template <typename A> A &operator OP(A& a, const B& b) { return a; }
};
```
```
--18
struct S {
  friend ResultAwaiter<T2> operator co_await(Self && self) { return 1; }
  template <typename A> A &operator OP(A & a, const B & b) { return a; }
};
--23
struct S {
  friend ResultAwaiter<T2> operator co_await(Self &&self) { return 1; }
  template <typename A> A &operator OP(A &a, const B &b) { return a; }
};
```

Group locations (file:line in nish output): facebook_folly/folly/coro/ValueOrError.h:114, facebook_folly/folly/coro/ValueOrError.h:137, facebook_folly/folly/coro/ViaIfAsync.h:732, facebook_folly/folly/fibers/Baton.h:299, opencv_opencv/3rdparty/protobuf/src/google/protobuf/stubs/int128.h:201, opencv_opencv/modules/core/include/opencv2/core/hal/intrin_legacy_ops.h:31, opencv_opencv/modules/core/include/opencv2/core/operations.hpp:237, opencv_opencv/modules/core/include/opencv2/core/operations.hpp:253, opencv_opencv/modules/core/include/opencv2/core/operations.hpp:257

Files (6; * = only this category):
  - facebook_folly/folly/coro/ValueOrError.h *
  - facebook_folly/folly/coro/ViaIfAsync.h *
  - facebook_folly/folly/fibers/Baton.h *
  - opencv_opencv/3rdparty/protobuf/src/google/protobuf/stubs/int128.h *
  - opencv_opencv/modules/core/include/opencv2/core/hal/intrin_legacy_ops.h *
  - opencv_opencv/modules/core/include/opencv2/core/operations.hpp  [also: funcref-paren-space]

### ternary-chain-alignment

- nested `?:` chains (inside parens / with trailing comment): column alignment of continuation `?`/`:`
- files 6, only-category files 4, groups 15; module: indenter; clang-format: ContinuationIndenter::getNewLineColumn for conditional operator (TT_ConditionalExpr / ColonPos / QuestionColumn) [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
int f() {
  x = ddepth == CV_16U ? (
      sdepth == CV_8U ? cvt8u16s : // same as cvt8u16u
      sdepth == CV_8S ? cvt8s16u :
      0) :
      ddepth == CV_8F_E4M3FNUZ ? (
      0) :
      0;
}
```
```
--18
int f() {
  x = ddepth == CV_16U           ? (sdepth == CV_8U ? cvt8u16s : // same as cvt8u16u
                              sdepth == CV_8S ? cvt8s16u
                                                        : 0)
      : ddepth == CV_8F_E4M3FNUZ ? (0)
                                 : 0;
}
--23
int f() {
  x = ddepth == CV_16U           ? (sdepth == CV_8U ? cvt8u16s : // same as cvt8u16u
                                        sdepth == CV_8S ? cvt8s16u
                                                        : 0)
      : ddepth == CV_8F_E4M3FNUZ ? (0)
                                 : 0;
}
```

Group locations (file:line in nish output): abseil_abseil-cpp/absl/container/internal/raw_hash_set.h:3760, nlohmann_json/include/nlohmann/json_view.hpp:1452, opencv_opencv/modules/core/src/convert.simd.hpp:608, opencv_opencv/modules/core/src/convert.simd.hpp:640, opencv_opencv/modules/core/src/convert.simd.hpp:643, opencv_opencv/modules/core/src/convert.simd.hpp:747, opencv_opencv/modules/core/src/convert.simd.hpp:754, opencv_opencv/modules/core/src/convert.simd.hpp:757, opencv_opencv/modules/core/src/convert.simd.hpp:799, opencv_opencv/modules/core/src/convert.simd.hpp:803, opencv_opencv/modules/core/src/convert.simd.hpp:805, opencv_opencv/modules/core/src/convert.simd.hpp:818 ...

Files (6; * = only this category):
  - abseil_abseil-cpp/absl/container/internal/raw_hash_set.h  [also: angle-bracket-ternary-misparse, comment-indent-adjacent-pp]
  - nlohmann_json/include/nlohmann/json_view.hpp *
  - opencv_opencv/modules/core/src/convert.simd.hpp *
  - opencv_opencv/modules/core/src/convert_scale.simd.hpp *
  - opencv_opencv/modules/features/src/fast_score.cpp  [also: funcref-paren-space]
  - opencv_opencv/modules/imgcodecs/src/grfmt_exr.cpp *

### assign-break

- break after `=` vs inside RHS: enumerator `X = A | B | C` and `auto x = call(...)` pick the other break
- files 5, only-category files 3, groups 6; module: indenter (penalties); clang-format: PenaltyBreakAssignment / ContinuationIndenter::mustBreak for enumerators [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
enum E {
  HB_OT_LAYOUT_GLYPH_PROPS_PRESERVE = HB_OT_LAYOUT_GLYPH_PROPS_SUBSTITUTED | HB_OT_LAYOUT_GLYPH_PROPS_LIGATED | HB_OT_LAYOUT_GLYPH_PROPS_MULTIPLIED
};
```
```
--18
enum E {
  HB_OT_LAYOUT_GLYPH_PROPS_PRESERVE =
      HB_OT_LAYOUT_GLYPH_PROPS_SUBSTITUTED | HB_OT_LAYOUT_GLYPH_PROPS_LIGATED | HB_OT_LAYOUT_GLYPH_PROPS_MULTIPLIED
};
--23
enum E {
  HB_OT_LAYOUT_GLYPH_PROPS_PRESERVE = HB_OT_LAYOUT_GLYPH_PROPS_SUBSTITUTED | HB_OT_LAYOUT_GLYPH_PROPS_LIGATED |
  HB_OT_LAYOUT_GLYPH_PROPS_MULTIPLIED
};
```

Group locations (file:line in nish output): facebook_folly/folly/coro/test/AsyncPipeTest.cpp:220, facebook_folly/folly/coro/test/AsyncPipeTest.cpp:270, nlohmann_json/include/nlohmann/detail/output/output_adapters.hpp:242, opencv_opencv/3rdparty/harfbuzz/src/hb-ot-layout.hh:74, opencv_opencv/modules/calib/include/opencv2/calib.hpp:545, opencv_opencv/modules/videoio/include/opencv2/videoio.hpp:821

Files (5; * = only this category):
  - facebook_folly/folly/coro/test/AsyncPipeTest.cpp  [also: standalone-block-split]
  - nlohmann_json/include/nlohmann/detail/output/output_adapters.hpp *
  - opencv_opencv/3rdparty/harfbuzz/src/hb-ot-layout.hh *
  - opencv_opencv/modules/calib/include/opencv2/calib.hpp  [also: doxygen-comment-reflow]
  - opencv_opencv/modules/videoio/include/opencv2/videoio.hpp *

### cppcx-handle-declarations

- C++/CX (`^` handles, `property T ^ name { get }`) declarations in opencv winrt samples
- files 5, only-category files 1, groups 10; module: parser/annotate; clang-format: TokenAnnotator/UnwrappedLineParser C++/CLI handling [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
ref class C {
public:
  property Platform::String ^ FEATURE_NAME { Platform::String ^ get() { return ref new Platform::String(L"OpenCV Image Manipulations sample"); } }
  void NotifyUser(Platform::String ^ strMessage, NotifyType type);
};
```
```
--18
ref class C {
public:
  property Platform::String ^ FEATURE_NAME {
    Platform::String ^ get() { return ref new Platform::String(L"OpenCV Image Manipulations sample"); }
  } void NotifyUser(Platform::String ^ strMessage, NotifyType type);
};
--23
ref class C {
public:
  property Platform::String ^ FEATURE_NAME {
    Platform::String ^ get() { return ref new Platform::String(L"OpenCV Image Manipulations sample"); }
  }
  void NotifyUser(Platform::String ^ strMessage, NotifyType type);
};
```

Group locations (file:line in nish output): opencv_opencv/modules/videoio/src/cap_winrt/MediaSink.hpp:40, opencv_opencv/samples/winrt/ImageManipulations/Constants.h:23, opencv_opencv/samples/winrt/ImageManipulations/Constants.h:28, opencv_opencv/samples/winrt/ImageManipulations/MainPage.xaml.h:58, opencv_opencv/samples/winrt/ImageManipulations/MainPage.xaml.h:64, opencv_opencv/samples/winrt/ImageManipulations/common/LayoutAwarePage.h:44, opencv_opencv/samples/winrt/ImageManipulations/common/LayoutAwarePage.h:52, opencv_opencv/samples/winrt/ImageManipulations/common/suspensionmanager.cpp:63, opencv_opencv/samples/winrt/ImageManipulations/common/suspensionmanager.cpp:385, opencv_opencv/samples/winrt/ImageManipulations/common/suspensionmanager.cpp:392

Files (5; * = only this category):
  - opencv_opencv/modules/videoio/src/cap_winrt/MediaSink.hpp  [also: indent-reset-after-unterminated-macro]
  - opencv_opencv/samples/winrt/ImageManipulations/Constants.h  [also: indent-reset-after-unterminated-macro]
  - opencv_opencv/samples/winrt/ImageManipulations/MainPage.xaml.h *
  - opencv_opencv/samples/winrt/ImageManipulations/common/LayoutAwarePage.h  [also: indent-reset-after-unterminated-macro]
  - opencv_opencv/samples/winrt/ImageManipulations/common/suspensionmanager.cpp  [also: SINGLETON, indent-reset-after-unterminated-macro]

### indent-misc-after-macro-or-pp

- indentation-only diffs of lines following macro definitions / #if (heterogeneous: TEST_CASES(X), gmock name(...) {, type_traits.hpp, SafeAssert.h)
- files 5, only-category files 4, groups 7; module: format/parser; clang-format: unknown (needs per-case isolation)

(no isolated snippet; see group examples)

Group locations (file:line in nish output): facebook_folly/folly/hash/test/MurmurHashTest.cpp:61, facebook_folly/folly/hash/test/MurmurHashTest.cpp:63, facebook_folly/folly/lang/SafeAssert.h:118, google_googletest/googlemock/include/gmock/gmock-more-actions.h:409, google_googletest/googlemock/include/gmock/gmock-more-actions.h:438, google_googletest/googletest/include/gtest/gtest-param-test.h:533, opencv_opencv/modules/core/include/opencv2/core/cuda/type_traits.hpp:60

Files (5; * = only this category):
  - facebook_folly/folly/hash/test/MurmurHashTest.cpp *
  - facebook_folly/folly/lang/SafeAssert.h *
  - google_googletest/googlemock/include/gmock/gmock-more-actions.h  [also: standalone-block-split]
  - google_googletest/googletest/include/gtest/gtest-param-test.h *
  - opencv_opencv/modules/core/include/opencv2/core/cuda/type_traits.hpp *

### break-before-name-after-decl-macro

- decl `extern "C" MACRO ret name(...)` too long: break after the MACRO (23) instead of between return type and name (18)
- files 4, only-category files 4, groups 4; module: annotate/indenter; clang-format: ContinuationIndenter / TokenAnnotator::splitPenalty (PenaltyReturnTypeOnItsOwnLine vs unknown-macro prefix) [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
void g() {}
#if X
extern "C" FOLLY_KEEP size_t
check_folly_simd_stdfind_vector_finder_find_first_of_json_str(
    std::string_view const haystack) {
  return 1;
}
#endif
```
```
--18
void g() {}
#if X
extern "C" FOLLY_KEEP size_t
check_folly_simd_stdfind_vector_finder_find_first_of_json_str(std::string_view const haystack) {
  return 1;
}
#endif
--23
void g() {}
#if X
extern "C" FOLLY_KEEP
    size_t check_folly_simd_stdfind_vector_finder_find_first_of_json_str(std::string_view const haystack) {
  return 1;
}
#endif
```

Group locations (file:line in nish output): facebook_folly/folly/algorithm/simd/test/find_first_of_bench.cpp:149, facebook_folly/folly/hash/Hash.h:541, opencv_opencv/3rdparty/include/opencl/1.2/CL/cl_egl.h:96, opencv_opencv/3rdparty/include/opencl/1.2/CL/cl_gl_ext.h:60

Files (4; * = only this category):
  - facebook_folly/folly/algorithm/simd/test/find_first_of_bench.cpp *
  - facebook_folly/folly/hash/Hash.h *
  - opencv_opencv/3rdparty/include/opencl/1.2/CL/cl_egl.h *
  - opencv_opencv/3rdparty/include/opencl/1.2/CL/cl_gl_ext.h *

### comment-star-prefix-space

- reflowed block-comment line starting with `*Word` gets `* Word`
- files 4, only-category files 4, groups 5; module: format (comment reflow); clang-format: BreakableBlockComment::adjustWhitespace / getReflowSplit [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
/**
 * Defined by [OpenType Design-Variation Axis Tag Registry](https://docs.microsoft.com/en-us/typography/opentype/spec/dvaraxisreg).
 **/
int x;
```
```
--18
/**
 * Defined by [OpenType Design-Variation Axis Tag
 *Registry](https://docs.microsoft.com/en-us/typography/opentype/spec/dvaraxisreg).
 **/
int x;
--23
/**
 * Defined by [OpenType Design-Variation Axis Tag
 * Registry](https://docs.microsoft.com/en-us/typography/opentype/spec/dvaraxisreg).
 **/
int x;
```

Group locations (file:line in nish output): opencv_opencv/3rdparty/harfbuzz/src/hb-common.cc:794, opencv_opencv/3rdparty/harfbuzz/src/hb-style.h:59, opencv_opencv/3rdparty/harfbuzz/src/hb-unicode.h:125, opencv_opencv/modules/dnn/include/opencv2/dnn/all_layers.hpp:462, opencv_opencv/modules/dnn/include/opencv2/dnn/all_layers.hpp:467

Files (4; * = only this category):
  - opencv_opencv/3rdparty/harfbuzz/src/hb-common.cc *
  - opencv_opencv/3rdparty/harfbuzz/src/hb-style.h *
  - opencv_opencv/3rdparty/harfbuzz/src/hb-unicode.h *
  - opencv_opencv/modules/dnn/include/opencv2/dnn/all_layers.hpp *

### line-comment-space-after-slashes

- `//text` / `//#define x \` line comments (and `//` + backslash continuation) get `// ` inserted / re-aligned
- files 4, only-category files 2, groups 8; module: format (comment); clang-format: BreakableLineComment (SpacesInLineCommentPrefix) with escaped newline [inferred]

(no isolated snippet; see group examples)

Group locations (file:line in nish output): opencv_opencv/modules/core/include/opencv2/core/hal/intrin_rvv071.hpp:606, opencv_opencv/modules/core/include/opencv2/core/hal/intrin_rvv071.hpp:1917, opencv_opencv/modules/core/include/opencv2/core/hal/intrin_rvv071.hpp:1919, opencv_opencv/modules/dnn/test/test_ie_models.cpp:67, opencv_opencv/modules/dnn/test/test_ie_models.cpp:87, opencv_opencv/modules/objdetect/src/mcc/checker_detector.cpp:757, opencv_opencv/modules/photo/include/opencv2/photo/ccm.hpp:37, opencv_opencv/modules/photo/include/opencv2/photo/ccm.hpp:44

Files (4; * = only this category):
  - opencv_opencv/modules/core/include/opencv2/core/hal/intrin_rvv071.hpp  [also: macro-body-braced-list]
  - opencv_opencv/modules/dnn/test/test_ie_models.cpp *
  - opencv_opencv/modules/objdetect/src/mcc/checker_detector.cpp  [also: funcref-paren-space]
  - opencv_opencv/modules/photo/include/opencv2/photo/ccm.hpp *

### macro-call-paren-break

- `MACRO(args)(params)` : `(` of the second call stays attached (18 broke before it)
- files 4, only-category files 4, groups 9; module: annotate; clang-format: TokenAnnotator::canBreakBefore / mustBreakBefore for `)(` of macro-generated declarator [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
DEFINE_SYNC_AND_ASYNC(void, ExternalTableReaderAdapter<Mode>::MultiGet)(
    const SliceTransform* prefix_extractor, bool /*skip_filters*/) {
  return;
}
```
```
--18
DEFINE_SYNC_AND_ASYNC(void, ExternalTableReaderAdapter<Mode>::MultiGet)
(const SliceTransform *prefix_extractor, bool /*skip_filters*/) {
  return;
}
--23
DEFINE_SYNC_AND_ASYNC(void, ExternalTableReaderAdapter<Mode>::MultiGet)(const SliceTransform *prefix_extractor,
                                                                        bool /*skip_filters*/) {
  return;
}
```

Group locations (file:line in nish output): facebook_rocksdb/table/block_based/block_based_table_reader_sync_and_async.h:25, facebook_rocksdb/table/block_based/block_based_table_reader_sync_and_async.h:64, facebook_rocksdb/table/block_based/block_based_table_reader_sync_and_async.h:214, facebook_rocksdb/table/block_based/block_based_table_reader_sync_and_async.h:289, facebook_rocksdb/table/block_based/block_based_table_reader_sync_and_async.h:395, facebook_rocksdb/table/external_table_reader_sync_and_async.h:17, facebook_rocksdb/table/external_table_reader_sync_and_async.h:82, opencv_opencv/modules/geometry/src/usac/dls_solver.cpp:170, opencv_opencv/modules/geometry/src/usac/essential_solver.cpp:391

Files (4; * = only this category):
  - facebook_rocksdb/table/block_based/block_based_table_reader_sync_and_async.h *
  - facebook_rocksdb/table/external_table_reader_sync_and_async.h *
  - opencv_opencv/modules/geometry/src/usac/dls_solver.cpp *
  - opencv_opencv/modules/geometry/src/usac/essential_solver.cpp *

### pp-warning-space

- `#warning("..")` -> `#warning ("..")`
- files 4, only-category files 4, groups 4; module: classify; clang-format: TokenAnnotator::spaceRequiredBefore (pp keyword followed by `(`) [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
#warning("OPENCV: check configuration")
```
```
--18
#warning("OPENCV: check configuration")
--23
#warning ("OPENCV: check configuration")
```

Group locations (file:line in nish output): opencv_opencv/modules/core/src/opencl/runtime/opencl_clblas.cpp:86, opencv_opencv/modules/core/src/opencl/runtime/opencl_clfft.cpp:86, opencv_opencv/modules/core/src/opencl/runtime/opencl_core.cpp:234, opencv_opencv/modules/dnn/src/op_inf_engine.hpp:27

Files (4; * = only this category):
  - opencv_opencv/modules/core/src/opencl/runtime/opencl_clblas.cpp *
  - opencv_opencv/modules/core/src/opencl/runtime/opencl_clfft.cpp *
  - opencv_opencv/modules/core/src/opencl/runtime/opencl_core.cpp *
  - opencv_opencv/modules/dnn/src/op_inf_engine.hpp *

### template-template-param-break

- `template <template <..., class> class Impl>`: break after `template <` instead of before `class Impl`
- files 4, only-category files 4, groups 4; module: annotate; clang-format: TokenAnnotator::splitPenalty for template-template parameter `class` keyword [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
template <template <typename, typename, uint8_t, typename, typename, typename, template <typename> class, class>
          class Impl>
struct S {};
```
```
--18
template <template <typename, typename, uint8_t, typename, typename, typename, template <typename> class, class>
          class Impl>
struct S {};
--23
template <
    template <typename, typename, uint8_t, typename, typename, typename, template <typename> class, class> class Impl>
struct S {};
```

Group locations (file:line in nish output): facebook_folly/folly/concurrency/ConcurrentHashMap.h:127, facebook_folly/folly/concurrency/detail/ConcurrentHashMap-detail.h:1631, facebook_folly/folly/concurrency/test/ConcurrentHashMapStressTest.cpp:33, facebook_folly/folly/concurrency/test/ConcurrentHashMapTest.cpp:42

Files (4; * = only this category):
  - facebook_folly/folly/concurrency/ConcurrentHashMap.h *
  - facebook_folly/folly/concurrency/detail/ConcurrentHashMap-detail.h *
  - facebook_folly/folly/concurrency/test/ConcurrentHashMapStressTest.cpp *
  - facebook_folly/folly/concurrency/test/ConcurrentHashMapTest.cpp *

### angle-bracket-ternary-misparse

- `a < b ? c : d > (e)` is parsed as a template argument list by 23 (`iv<0 ? .. : iv>(int64) X`) and `T<expr ? a : b, K>(...)` template call is recognised
- files 3, only-category files 1, groups 4; module: parser (annotate); clang-format: TokenAnnotator::parseAngle (allows `?:` inside angles) [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
int f(int iv) { return iv < 0 ? 0u : iv > (int64)UINT_MAX ? UINT_MAX : (unsigned)iv; }
```
```
--18
int f(int iv) { return iv < 0 ? 0u : iv > (int64)UINT_MAX ? UINT_MAX : (unsigned)iv; }
--23
int f(int iv) { return iv<0 ? 0u : iv>(int64) UINT_MAX ? UINT_MAX : (unsigned)iv; }
```

Group locations (file:line in nish output): abseil_abseil-cpp/absl/container/internal/raw_hash_set.h:3760, opencv_opencv/modules/core/include/opencv2/core/saturate.hpp:198, opencv_opencv/modules/core/include/opencv2/core/saturate.hpp:202, opencv_opencv/modules/geometry/src/usac/ransac_solvers.cpp:1216

Files (3; * = only this category):
  - abseil_abseil-cpp/absl/container/internal/raw_hash_set.h  [also: comment-indent-adjacent-pp, ternary-chain-alignment]
  - opencv_opencv/modules/core/include/opencv2/core/saturate.hpp *
  - opencv_opencv/modules/geometry/src/usac/ransac_solvers.cpp  [also: space-before-scope-op]

### closing-brace-list-indent

- closing `};` of braced list placed after `= // comment` + `{` on next line: indent goes to the statement level
- files 3, only-category files 2, groups 3; module: indenter; clang-format: ContinuationIndenter::moveStateToNextToken / closing brace of braced list [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
void f() {
    const char* const inputs[] = // NOLINT(cppcoreguidelines-avoid-c-arrays,hicpp-avoid-c-arrays,modernize-avoid-c-arrays)
    {
        "[1,]", "[,1]", R"({"a":1,})",
    };
}
```
```
--18
void f() {
  const char *const inputs[] = // NOLINT(cppcoreguidelines-avoid-c-arrays,hicpp-avoid-c-arrays,modernize-avoid-c-arrays)
      {
          "[1,]",
          "[,1]",
          R"({"a":1,})",
      };
}
--23
void f() {
  const char *const inputs[] = // NOLINT(cppcoreguidelines-avoid-c-arrays,hicpp-avoid-c-arrays,modernize-avoid-c-arrays)
      {
          "[1,]",
          "[,1]",
          R"({"a":1,})",
  };
}
```

Group locations (file:line in nish output): nlohmann_json/tests/src/unit-contiguous_parser.cpp:422, nlohmann_json/tests/src/unit-diagnostics-optimized.cpp:51, opencv_opencv/modules/core/test/test_math.cpp:3241

Files (3; * = only this category):
  - nlohmann_json/tests/src/unit-contiguous_parser.cpp  [also: decl-break-before-trailing-line-comment]
  - nlohmann_json/tests/src/unit-diagnostics-optimized.cpp *
  - opencv_opencv/modules/core/test/test_math.cpp *

### rvalue-ref-pack-space

- `Args && ...` -> `Args &&...` in requires/template args
- files 3, only-category files 2, groups 4; module: classify; clang-format: TokenAnnotator::spaceRequiredBetween (ellipsis after && in expression/template arg) [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
template <typename... Args>
  requires(std::is_constructible<T, Args && ...>::value)
void f();
```
```
--18
template <typename... Args>
  requires(std::is_constructible<T, Args && ...>::value)
void f();
--23
template <typename... Args>
  requires(std::is_constructible<T, Args &&...>::value)
void f();
```

Group locations (file:line in nish output): facebook_folly/folly/Replaceable.h:220, facebook_folly/folly/Replaceable.h:227, facebook_folly/folly/ScopeGuard.h:284, facebook_folly/folly/concurrency/ThreadCachedSynchronized.h:117

Files (3; * = only this category):
  - facebook_folly/folly/Replaceable.h *
  - facebook_folly/folly/ScopeGuard.h  [also: trailing-return-break]
  - facebook_folly/folly/concurrency/ThreadCachedSynchronized.h *

### va-args-arg-break

- macro call ending in `##__VA_ARGS__`: break moves one argument earlier
- files 3, only-category files 2, groups 4; module: annotate/indenter; clang-format: TokenAnnotator::splitPenalty (`##` / token paste operand glue) [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
#define FB_LOG(logger, level, filename, linenumber, functionName, FORMAT, fmt, arg1, ...) \
  FB_LOG_RAW_IMPL(logger, level, filename, linenumber, functionName, ::folly::LogStreamProcessor::FORMAT, fmt, arg1, ##__VA_ARGS__)
```
```
--18
#define FB_LOG(logger, level, filename, linenumber, functionName, FORMAT, fmt, arg1, ...)                              \
  FB_LOG_RAW_IMPL(logger, level, filename, linenumber, functionName, ::folly::LogStreamProcessor::FORMAT, fmt, arg1,   \
                  ##__VA_ARGS__)
--23
#define FB_LOG(logger, level, filename, linenumber, functionName, FORMAT, fmt, arg1, ...)                              \
  FB_LOG_RAW_IMPL(logger, level, filename, linenumber, functionName, ::folly::LogStreamProcessor::FORMAT, fmt,         \
                  arg1, ##__VA_ARGS__)
```

Group locations (file:line in nish output): facebook_folly/folly/logging/Logger.h:72, facebook_folly/folly/logging/xlog.h:519, facebook_rocksdb/logging/logging.h:30, facebook_rocksdb/logging/logging.h:44

Files (3; * = only this category):
  - facebook_folly/folly/logging/Logger.h *
  - facebook_folly/folly/logging/xlog.h  [also: macro-lambda-struct-va-args-unformatted]
  - facebook_rocksdb/logging/logging.h *

### inline-block-comment-attach

- argument-name comment `/*name=*/arg` : no break between comment and argument; following lambda arg is joined
- files 2, only-category files 1, groups 2; module: annotate/indenter; clang-format: TokenAnnotator::mustBreakBefore/canBreakBefore after block comment (TT_BlockComment arg) [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
void f() {
  const auto results = RunInParallel(
      /*num_runs=*/paths.size(),
      [&paths, &root](size_t i) {
        return 1;
      },
      /*do_work=*/
      AnalyzeProfileProto(substream, path, options));
}
```
```
--18
void f() {
  const auto results = RunInParallel(
      /*num_runs=*/
      paths.size(),
      [&paths, &root](size_t i) { return 1; },
      /*do_work=*/
      AnalyzeProfileProto(substream, path, options));
}
--23
void f() {
  const auto results = RunInParallel(
      /*num_runs=*/paths.size(), [&paths, &root](size_t i) { return 1; },
      /*do_work=*/
      AnalyzeProfileProto(substream, path, options));
}
```

Group locations (file:line in nish output): protocolbuffers_protobuf/src/google/protobuf/arenaz_sampler.cc:47, protocolbuffers_protobuf/src/google/protobuf/compiler/cpp/tools/analyze_profile_proto.cc:564

Files (2; * = only this category):
  - protocolbuffers_protobuf/src/google/protobuf/arenaz_sampler.cc *
  - protocolbuffers_protobuf/src/google/protobuf/compiler/cpp/tools/analyze_profile_proto.cc  [also: space-before-scope-op]

### label-in-macro-body-break

- `label: stmt;` inside a #define body: break after the label, no space before `:`
- files 2, only-category files 1, groups 2; module: format/annotate; clang-format: UnwrappedLineParser::parseLabel inside PP body [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
#define GET_INPUT(label, remain) \
  label:                         \
    --szsrc;                     \
    ch = *src++;
```
```
--18
#define GET_INPUT(label, remain)                                                                                       \
  label : --szsrc;                                                                                                     \
  ch = *src++;
--23
#define GET_INPUT(label, remain)                                                                                       \
  label:                                                                                                               \
  --szsrc;                                                                                                             \
  ch = *src++;
```

Group locations (file:line in nish output): abseil_abseil-cpp/absl/strings/escaping.cc:651, opencv_opencv/3rdparty/protobuf/src/google/protobuf/stubs/strutil.cc:1717

Files (2; * = only this category):
  - abseil_abseil-cpp/absl/strings/escaping.cc *
  - opencv_opencv/3rdparty/protobuf/src/google/protobuf/stubs/strutil.cc  [also: shift-literal-break-kept]

### lambda-trailing-return-indent

- lambda trailing return type `-> T<...> {` continuation gets +8 instead of +4 indent
- files 2, only-category files 2, groups 10; module: indenter; clang-format: ContinuationIndenter (lambda trailing-return continuation indent) [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
void f() {
  auto transformedReceiver = resumableTransform(
      [receiver = std::move(untransformedReceiver)](
          std::vector<std::string> initializeArg) mutable
          -> folly::coro::Task<
              std::pair<std::vector<std::string>, Receiver<int>>> {
        co_return 1;
      });
}
```
```
--18
void f() {
  auto transformedReceiver =
      resumableTransform([receiver = std::move(untransformedReceiver)](std::vector<std::string> initializeArg) mutable
                         -> folly::coro::Task<std::pair<std::vector<std::string>, Receiver<int>>> { co_return 1; });
}
--23
void f() {
  auto transformedReceiver =
      resumableTransform([receiver = std::move(untransformedReceiver)](std::vector<std::string> initializeArg) mutable
                             -> folly::coro::Task<std::pair<std::vector<std::string>, Receiver<int>>> { co_return 1; });
}
```

Group locations (file:line in nish output): facebook_folly/folly/channels/test/ProducerTest.cpp:94, facebook_folly/folly/channels/test/TransformTest.cpp:477, facebook_folly/folly/channels/test/TransformTest.cpp:511, facebook_folly/folly/channels/test/TransformTest.cpp:545, facebook_folly/folly/channels/test/TransformTest.cpp:574, facebook_folly/folly/channels/test/TransformTest.cpp:621, facebook_folly/folly/channels/test/TransformTest.cpp:650, facebook_folly/folly/channels/test/TransformTest.cpp:694, facebook_folly/folly/channels/test/TransformTest.cpp:732, facebook_folly/folly/channels/test/TransformTest.cpp:751

Files (2; * = only this category):
  - facebook_folly/folly/channels/test/ProducerTest.cpp *
  - facebook_folly/folly/channels/test/TransformTest.cpp *

### macro-asm-token-space

- `vld3.8` / `SSE4.2` : no space inserted before `.digit` token in macro args / #pragma
- files 2, only-category files 2, groups 10; module: classify; clang-format: TokenAnnotator::spaceRequiredBefore (period/numeric literal glue) [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
void f() {
  X(vld3.8 {d0 - d2}, d0)
}
#pragma optimization_parameter target_arch = SSE4.2
```
```
--18
void f() { X(vld3 .8 {d0 - d2}, d0) }
#pragma optimization_parameter target_arch = SSE4 .2
--23
void f() { X(vld3.8 {d0 - d2}, d0) }
#pragma optimization_parameter target_arch = SSE4.2
```

Group locations (file:line in nish output): opencv_opencv/hal/carotene/src/colorconvert.cpp:1694, opencv_opencv/hal/carotene/src/colorconvert.cpp:1740, opencv_opencv/hal/carotene/src/colorconvert.cpp:1785, opencv_opencv/hal/carotene/src/colorconvert.cpp:1831, opencv_opencv/hal/carotene/src/colorconvert.cpp:2039, opencv_opencv/hal/carotene/src/colorconvert.cpp:2077, opencv_opencv/hal/carotene/src/colorconvert.cpp:2115, opencv_opencv/hal/carotene/src/colorconvert.cpp:2153, opencv_opencv/modules/imgproc/src/resize.sse4_1.cpp:62, opencv_opencv/modules/imgproc/src/resize.sse4_1.cpp:116

Files (2; * = only this category):
  - opencv_opencv/hal/carotene/src/colorconvert.cpp *
  - opencv_opencv/modules/imgproc/src/resize.sse4_1.cpp *

### arrow-space-after-paren

- `f(x)->decltype(..)` in macro body: space around trailing `->`
- files 1, only-category files 0, groups 3; module: classify; clang-format: TokenAnnotator::spaceRequiredBetween for TT_TrailingReturnArrow in macro [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
#define M(name) \
  inline auto f_##name(struct event *ev)->decltype(g(ev->name)) { return 1; }
```
```
--18
#define M(name)                                                                                                        \
  inline auto f_##name(struct event *ev)->decltype(g(ev->name)) { return 1; }
--23
#define M(name)                                                                                                        \
  inline auto f_##name(struct event *ev) -> decltype(g(ev->name)) { return 1; }
```

Group locations (file:line in nish output): facebook_folly/folly/io/async/EventUtil.h:33, facebook_folly/folly/io/async/EventUtil.h:36, facebook_folly/folly/io/async/EventUtil.h:42

Files (1; * = only this category):
  - facebook_folly/folly/io/async/EventUtil.h  [also: trailing-return-break]

### attribute-between-type-and-name-break

- `void __attribute__((..)) name(` in macro: break after the attribute, name at statement indent
- files 1, only-category files 0, groups 19; module: indenter; clang-format: TokenAnnotator::splitPenalty (TT_AttributeParen before function name) [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
#define M(suffix) \
  __extension__ extern __inline void __attribute__((__always_inline__, __gnu_inline__, __artificial__)) msa_st2q_##suffix(_Tp *ptr, const _Tpv a, const _Tpv b) { \
  }
```
```
--18
#define M(suffix)                                                                                                      \
  __extension__ extern __inline void                                                                                   \
      __attribute__((__always_inline__, __gnu_inline__, __artificial__)) msa_st2q_##suffix(_Tp *ptr, const _Tpv a,     \
                                                                                           const _Tpv b) {}
--23
#define M(suffix)                                                                                                      \
  __extension__ extern __inline void __attribute__((__always_inline__, __gnu_inline__, __artificial__))                \
  msa_st2q_##suffix(_Tp *ptr, const _Tpv a, const _Tpv b) {}
```

Group locations (file:line in nish output): opencv_opencv/modules/core/include/opencv2/core/hal/msa_macros.h:1258, opencv_opencv/modules/core/include/opencv2/core/hal/msa_macros.h:1266, opencv_opencv/modules/core/include/opencv2/core/hal/msa_macros.h:1286, opencv_opencv/modules/core/include/opencv2/core/hal/msa_macros.h:1301, opencv_opencv/modules/core/include/opencv2/core/hal/msa_macros.h:1321, opencv_opencv/modules/core/include/opencv2/core/hal/msa_macros.h:1336, opencv_opencv/modules/core/include/opencv2/core/hal/msa_macros.h:1355, opencv_opencv/modules/core/include/opencv2/core/hal/msa_macros.h:1374, opencv_opencv/modules/core/include/opencv2/core/hal/msa_macros.h:1391, opencv_opencv/modules/core/include/opencv2/core/hal/msa_macros.h:1406, opencv_opencv/modules/core/include/opencv2/core/hal/msa_macros.h:1426, opencv_opencv/modules/core/include/opencv2/core/hal/msa_macros.h:1441 ...

Files (1; * = only this category):
  - opencv_opencv/modules/core/include/opencv2/core/hal/msa_macros.h  [also: cast-unary-operand-space, macro-body-braced-list]

### braced-list-after-assign-comment

- `= // c\n {` list on continuation line: `{// c` and +1 indent of elements
- files 1, only-category files 1, groups 1; module: indenter; clang-format: ContinuationIndenter braced list after `=` break [inferred]

(no isolated snippet; see group examples)

Group locations (file:line in nish output): facebook_rocksdb/table/block_based/block_based_table_factory.cc:215

Files (1; * = only this category):
  - facebook_rocksdb/table/block_based/block_based_table_factory.cc *

### braced-temp-arrow

- `decltype(it{}->first)` : `{}` temp followed by `->` is a member access, 18 spaced it like trailing return
- files 1, only-category files 1, groups 1; module: classify; clang-format: TokenAnnotator (TT_TrailingReturnArrow detection after braced init) [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
static_assert(std::is_same<decltype(it{}->first), int>::value);
```
```
--18
static_assert(std::is_same<decltype(it {} -> first), int>::value);
--23
static_assert(std::is_same<decltype(it{}->first), int>::value);
```

Group locations (file:line in nish output): facebook_folly/folly/container/test/IteratorTest.cpp:801

Files (1; * = only this category):
  - facebook_folly/folly/container/test/IteratorTest.cpp *

### decl-break-before-trailing-line-comment

- `static const char *const name[] = // NOLINT(..)`: break position moves from before `*const` to before `name`
- files 1, only-category files 0, groups 3; module: indenter; clang-format: ContinuationIndenter::mustBreak/penalties with trailing line comment [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
void f() {
        static const char* const choices[] = // NOLINT(cppcoreguidelines-avoid-c-arrays,hicpp-avoid-c-arrays,modernize-avoid-c-arrays)
        {
            "a", "b",
        };
}
```
```
--18
void f() {
  static const char
      *const choices[] = // NOLINT(cppcoreguidelines-avoid-c-arrays,hicpp-avoid-c-arrays,modernize-avoid-c-arrays)
      {
          "a",
          "b",
      };
}
--23
void f() {
  static const char *const
      choices[] = // NOLINT(cppcoreguidelines-avoid-c-arrays,hicpp-avoid-c-arrays,modernize-avoid-c-arrays)
      {
          "a",
          "b",
  };
}
```

Group locations (file:line in nish output): nlohmann_json/tests/src/unit-contiguous_parser.cpp:211, nlohmann_json/tests/src/unit-contiguous_parser.cpp:267, nlohmann_json/tests/src/unit-contiguous_parser.cpp:377

Files (1; * = only this category):
  - nlohmann_json/tests/src/unit-contiguous_parser.cpp  [also: closing-brace-list-indent]

### decl-return-type-ref-break

- `FOLLY_NOINLINE Type<..> &\nNAME() {` : break after `&` return type, name not indented
- files 1, only-category files 1, groups 2; module: indenter; clang-format: ContinuationIndenter (declarator name after return-type break) [inferred]

(no isolated snippet; see group examples)

Group locations (file:line in nish output): facebook_folly/folly/settings/Settings.h:230, facebook_folly/folly/settings/Settings.h:282

Files (1; * = only this category):
  - facebook_folly/folly/settings/Settings.h *

### include-sort-in-unterminated-comment

- #includes inside an unterminated `/*` comment: 18 sorts them, 23 does not
- files 1, only-category files 1, groups 2; module: format (include sort); clang-format: tooling::HeaderIncludes / sortCppIncludes (comment-aware scan) [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
/*
#include <cmath>
#include <algorithm>
```
```
--18
/*
#include <algorithm>
#include <cmath>
--23
/*
#include <cmath>
#include <algorithm>
```

Group locations (file:line in nish output): opencv_opencv/modules/core/src/downhill_simplex.cpp:85, opencv_opencv/modules/core/src/downhill_simplex.cpp:88

Files (1; * = only this category):
  - opencv_opencv/modules/core/src/downhill_simplex.cpp *

### indent-in-pp-branch-body

- indentation of code inside `#elif`/`#else` branches in a function body (conv2_kernels.simd.hpp)
- files 1, only-category files 1, groups 4; module: format/parser; clang-format: UnwrappedLineParser PP-branch level restore [inferred]

(no isolated snippet; see group examples)

Group locations (file:line in nish output): opencv_opencv/modules/dnn/src/layers/cpu_kernels/conv2_kernels.simd.hpp:2723, opencv_opencv/modules/dnn/src/layers/cpu_kernels/conv2_kernels.simd.hpp:2731, opencv_opencv/modules/dnn/src/layers/cpu_kernels/conv2_kernels.simd.hpp:2740, opencv_opencv/modules/dnn/src/layers/cpu_kernels/conv2_kernels.simd.hpp:2746

Files (1; * = only this category):
  - opencv_opencv/modules/dnn/src/layers/cpu_kernels/conv2_kernels.simd.hpp *

### macro-lambda-struct-va-args-unformatted

- macro body containing lambda with `struct T {};` and `##__VA_ARGS__`: 23 leaves the body lines (and their `\` columns) untouched
- files 1, only-category files 0, groups 10; module: format (macro body / escaped-newline alignment); clang-format: WhitespaceManager::alignEscapedNewlines / unformatted-line handling [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
#define M(a) \
  XLOG_IF(                          \
      [&] {                         \
        struct T {}; \
      }(),                          \
      ##__VA_ARGS__)
```
```
--18
#define M(a)                                                                                                           \
  XLOG_IF(                                                                                                             \
      [&] {                                                                                                            \
        struct T {};                                                                                                   \
      }(),                                                                                                             \
      ##__VA_ARGS__)
--23
#define M(a)                                                                                                           \
  XLOG_IF(                          \
      [&] {                         \
        struct T {}; \
      }(),                          \
      ##__VA_ARGS__)
```

Group locations (file:line in nish output): facebook_folly/folly/logging/xlog.h:115, facebook_folly/folly/logging/xlog.h:131, facebook_folly/folly/logging/xlog.h:148, facebook_folly/folly/logging/xlog.h:224, facebook_folly/folly/logging/xlog.h:255, facebook_folly/folly/logging/xlog.h:271, facebook_folly/folly/logging/xlog.h:335, facebook_folly/folly/logging/xlog.h:374, facebook_folly/folly/logging/xlog.h:389, facebook_folly/folly/logging/xlog.h:417

Files (1; * = only this category):
  - facebook_folly/folly/logging/xlog.h  [also: va-args-arg-break]

### placement-new-space

- `::new(ptr) T` -> `::new (ptr) T` inside noexcept(...)
- files 1, only-category files 1, groups 2; module: classify; clang-format: TokenAnnotator::spaceRequiredBetween (kw_new with leading `::`) [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
void f() noexcept(noexcept(::new(static_cast<void *>(p)) T(args...)));
```
```
--18
void f() noexcept(noexcept(::new(static_cast<void *>(p)) T(args...)));
--23
void f() noexcept(noexcept(::new (static_cast<void *>(p)) T(args...)));
```

Group locations (file:line in nish output): nlohmann_json/tests/src/unit-allocator.cpp:463, nlohmann_json/tests/src/unit-allocator.cpp:903

Files (1; * = only this category):
  - nlohmann_json/tests/src/unit-allocator.cpp *

### record-attr-macro-split

- `struct __align__(8) name { ... };` is no longer treated as a function with short body (not merged to one line)
- files 1, only-category files 1, groups 7; module: format/parser; clang-format: UnwrappedLineParser::parseRecord / tryMergeSimpleBlock (attribute macro with parens before record name) [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
struct __align__(8) uchar8 { uchar a0, a1; };
```
```
--18
struct __align__(8) uchar8 { uchar a0, a1; };
--23
struct __align__(8) uchar8 {
  uchar a0, a1;
};
```

Group locations (file:line in nish output): opencv_opencv/modules/core/include/opencv2/core/cuda/vec_traits.hpp:63, opencv_opencv/modules/core/include/opencv2/core/cuda/vec_traits.hpp:69, opencv_opencv/modules/core/include/opencv2/core/cuda/vec_traits.hpp:75, opencv_opencv/modules/core/include/opencv2/core/cuda/vec_traits.hpp:81, opencv_opencv/modules/core/include/opencv2/core/cuda/vec_traits.hpp:87, opencv_opencv/modules/core/include/opencv2/core/cuda/vec_traits.hpp:93, opencv_opencv/modules/core/include/opencv2/core/cuda/vec_traits.hpp:99

Files (1; * = only this category):
  - opencv_opencv/modules/core/include/opencv2/core/cuda/vec_traits.hpp *

### template-close-space

- `test_##name##3 < type > ()` -> `< type>()`
- files 1, only-category files 1, groups 2; module: classify; clang-format: TokenAnnotator::spaceRequiredBefore (template closer after pasted identifier) [inferred]

Input / clang-format 18 / clang-format 23 (confirmed):
```cpp
// input
#define G(name, type) test_##name##3 < type > ();
```
```
--18
#define G(name, type) test_##name##3 < type > ();
--23
#define G(name, type) test_##name##3 < type>();
```

Group locations (file:line in nish output): facebook_folly/folly/test/stl_tests/StlVectorTest.cpp:812, facebook_folly/folly/test/stl_tests/StlVectorTest.cpp:820

Files (1; * = only this category):
  - facebook_folly/folly/test/stl_tests/StlVectorTest.cpp *

## Files with 2+ categories

- abseil_abseil-cpp/absl/container/internal/raw_hash_set.h: angle-bracket-ternary-misparse, comment-indent-adjacent-pp, ternary-chain-alignment
- abseil_abseil-cpp/absl/synchronization/mutex_test.cc: braced-list-one-per-line, standalone-block-split
- facebook_folly/folly/ScopeGuard.h: rvalue-ref-pack-space, trailing-return-break
- facebook_folly/folly/cli/test/ArgsTest.cpp: braced-list-one-per-line, shift-literal-break-kept
- facebook_folly/folly/coro/test/AsyncPipeTest.cpp: assign-break, standalone-block-split
- facebook_folly/folly/debugging/symbolizer/SignalHandler.cpp: braced-init-space-after-name, shift-literal-break-kept
- facebook_folly/folly/debugging/symbolizer/test/FramePointerUnwinderTest.cpp: braced-init-space-after-name, shift-literal-break-kept
- facebook_folly/folly/io/async/AsyncIoUringSocket.cpp: braced-init-space-after-name, shift-literal-break-kept
- facebook_folly/folly/io/async/AsyncServerSocket.cpp: braced-init-space-after-name, shift-literal-break-kept
- facebook_folly/folly/io/async/AsyncSocket.cpp: braced-init-space-after-name, shift-literal-break-kept
- facebook_folly/folly/io/async/EventBase.cpp: braced-init-space-after-name, shift-literal-break-kept
- facebook_folly/folly/io/async/EventUtil.h: arrow-space-after-paren, trailing-return-break
- facebook_folly/folly/io/async/IoUringBackend.cpp: braced-init-space-after-name, shift-literal-break-kept
- facebook_folly/folly/logging/xlog.h: macro-lambda-struct-va-args-unformatted, va-args-arg-break
- facebook_folly/folly/result/rich_exception_ptr.h: class-attr-break, trailing-return-break
- facebook_rocksdb/utilities/transactions/lock/range/range_tree/lib/portability/toku_pthread.h: macro-body-braced-list, standalone-block-split
- fmtlib_fmt/include/fmt/format.h: decl-after-pp-guarded-attribute, trailing-return-break
- google_googletest/googlemock/include/gmock/gmock-more-actions.h: indent-misc-after-macro-or-pp, standalone-block-split
- google_googletest/googlemock/test/gmock-more-actions_test.cc: SINGLETON, funcref-paren-space
- nlohmann_json/include/nlohmann/detail/input/simd_scan.hpp: comment-indent-adjacent-pp, decl-after-pp-guarded-attribute
- nlohmann_json/tests/src/unit-contiguous_parser.cpp: closing-brace-list-indent, decl-break-before-trailing-line-comment
- opencv_opencv/3rdparty/harfbuzz/src/hb-iter.hh: indent-reset-after-unterminated-macro, trailing-return-break
- opencv_opencv/3rdparty/harfbuzz/src/hb-number-parser.hh: label-then-block-break, standalone-block-split
- opencv_opencv/3rdparty/harfbuzz/src/hb-ot-layout.cc: class-attr-break, indent-reset-after-unterminated-macro
- opencv_opencv/3rdparty/harfbuzz/src/hb-ot-shaper-indic-machine.hh: label-then-block-break, standalone-block-split
- opencv_opencv/3rdparty/harfbuzz/src/hb-ot-shaper-khmer-machine.hh: label-then-block-break, standalone-block-split
- opencv_opencv/3rdparty/harfbuzz/src/hb-ot-shaper-myanmar-machine.hh: label-then-block-break, standalone-block-split
- opencv_opencv/3rdparty/harfbuzz/src/hb-ot-shaper-use-machine.hh: label-then-block-break, standalone-block-split
- opencv_opencv/3rdparty/harfbuzz/src/hb-sanitize.hh: decl-after-pp-guarded-attribute, indent-reset-after-unterminated-macro
- opencv_opencv/3rdparty/ittnotify/src/ittnotify/ittnotify_config.h: macro-body-braced-list, standalone-block-split
- opencv_opencv/3rdparty/protobuf/src/google/protobuf/message.cc: decl-after-pp-guarded-attribute, shift-literal-break-kept
- opencv_opencv/3rdparty/protobuf/src/google/protobuf/stubs/strutil.cc: label-in-macro-body-break, shift-literal-break-kept
- opencv_opencv/modules/calib/include/opencv2/calib.hpp: assign-break, doxygen-comment-reflow
- opencv_opencv/modules/core/include/opencv2/core/fast_math.hpp: SINGLETON, comment-indent-adjacent-pp
- opencv_opencv/modules/core/include/opencv2/core/hal/intrin_rvv071.hpp: line-comment-space-after-slashes, macro-body-braced-list
- opencv_opencv/modules/core/include/opencv2/core/hal/msa_macros.h: attribute-between-type-and-name-break, cast-unary-operand-space, macro-body-braced-list
- opencv_opencv/modules/core/include/opencv2/core/operations.hpp: funcref-paren-space, operator-macro-param-ref-space
- opencv_opencv/modules/core/src/parallel_impl.cpp: decl-after-pp-guarded-attribute, standalone-block-split
- opencv_opencv/modules/features/3rdparty/annoy/annoylib.h: comment-indent-adjacent-pp, standalone-block-split
- opencv_opencv/modules/features/src/fast_score.cpp: funcref-paren-space, ternary-chain-alignment
- opencv_opencv/modules/geometry/src/usac/ransac_solvers.cpp: angle-bracket-ternary-misparse, space-before-scope-op
- opencv_opencv/modules/objdetect/src/mcc/checker_detector.cpp: funcref-paren-space, line-comment-space-after-slashes
- opencv_opencv/modules/videoio/src/cap_winrt/MediaSink.hpp: cppcx-handle-declarations, indent-reset-after-unterminated-macro
- opencv_opencv/samples/winrt/ImageManipulations/Constants.h: cppcx-handle-declarations, indent-reset-after-unterminated-macro
- opencv_opencv/samples/winrt/ImageManipulations/common/LayoutAwarePage.h: cppcx-handle-declarations, indent-reset-after-unterminated-macro
- opencv_opencv/samples/winrt/ImageManipulations/common/suspensionmanager.cpp: SINGLETON, cppcx-handle-declarations, indent-reset-after-unterminated-macro
- protocolbuffers_protobuf/src/google/protobuf/compiler/cpp/tools/analyze_profile_proto.cc: inline-block-comment-attach, space-before-scope-op
- protocolbuffers_protobuf/src/google/protobuf/map_field.h: class-attr-break, shift-literal-break-kept
- protocolbuffers_protobuf/src/google/protobuf/util/message_differencer.cc: shift-literal-break-kept, space-before-scope-op
