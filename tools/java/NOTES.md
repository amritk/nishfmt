# Java port notes

google-java-format 2.0.0, default (Google) style, as
`java -jar google-java-format-2.0.0-all-deps.jar - < file` formats one file.
Its CLI runs `formatSource(input, ranges, removeUnusedImports, sortImports,
reflowLongStrings)` with all three on, and in 2.0.0 also `--cleanup`, which
is on by default.

(Work in progress: the status, gate counts and module map are filled in as
the upgrade from 1.28 lands.)
