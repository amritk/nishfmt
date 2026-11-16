// Dumps the analyzer's AST for Dart files, one node per line, so fastfmt's
// Dart parser can be compared with it (tools/dart/astcmp.sh).
//
//   dart run --packages=<dart_style>/.dart_tool/package_config.json \
//       tools/dart/astdump.dart file.dart...
//
// Each line is `<depth> <Type> <begin> <end>`, offsets in UTF-16 units of the
// first and past-the-last token. A file with syntax errors prints `ERROR`.
import 'dart:io';

import 'package:analyzer/dart/analysis/features.dart';
import 'package:collection/collection.dart';
import 'package:analyzer/dart/analysis/utilities.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/diagnostic/diagnostic.dart';
import 'package:analyzer/error/error.dart';
import 'package:pub_semver/pub_semver.dart';

void main(List<String> args) {
  var featureSet = FeatureSet.fromEnableFlags2(
    sdkLanguageVersion: Version(3, 14, 0),
    flags: const [],
  );
  for (var path in args) {
    var text = File(path).readAsStringSync();
    var result = parseString(
      content: text,
      featureSet: featureSet,
      path: path,
      throwIfDiagnostics: false,
    );
    var out = StringBuffer();
    out.writeln('FILE $path');
    var errors = result.errors.where(
      (e) => e.diagnosticCode.type == DiagnosticType.SYNTACTIC_ERROR,
    );
    if (errors.isNotEmpty) {
      out.writeln('ERROR');
      stdout.write(out);
      continue;
    }
    void walk(AstNode node, int depth) {
      if (node is Comment || node is CommentReference) return;
      var name = node.runtimeType.toString();
      if (name.endsWith('Impl')) name = name.substring(0, name.length - 4);
      var begin = node.beginToken;
      // Skip a leading doc comment, as fastfmt's nodes begin at code.
      if (node is AnnotatedNode) {
        begin = node.metadata.isNotEmpty
            ? node.metadata.first.beginToken
            : node.firstTokenAfterCommentAndMetadata;
      }
      out.writeln('$depth $name ${begin.offset} ${node.endToken.end}');
      var children = [
        for (var child in node.childEntities)
          if (child is AstNode && child is! ImportPrefixReference) child,
      ];
      mergeSort(children, compare: (a, b) => a.offset.compareTo(b.offset));
      for (var child in children) {
        walk(child, depth + 1);
      }
    }

    walk(result.unit, 0);
    stdout.write(out);
  }
}
