// Style/GlobalVars (AllowedVariables: []; detection only: no correction).
//
// Ported from RuboCop 1.92.2 (MIT License, Copyright (c) 2012-24 Bozhidar
// Batsov).

import { F_NAME, NT_GVAR, NT_GVASGN } from "../ast";
import { RbCop } from "../cop";
import { RbSource } from "../source";
import { ssxFE, ssxFS, ssxInList, ssxIs } from "./style_syntax_help";

// GlobalVars::BUILT_IN_VARS.
const RB_GLOBAL_VARS_BUILTIN: string =
  ' $: $LOAD_PATH $" $LOADED_FEATURES $0 $PROGRAM_NAME $! $ERROR_INFO $@ $ERROR_POSITION' +
  " $; $FS $FIELD_SEPARATOR $, $OFS $OUTPUT_FIELD_SEPARATOR $/ $RS $INPUT_RECORD_SEPARATOR" +
  " $\\ $ORS $OUTPUT_RECORD_SEPARATOR $. $NR $INPUT_LINE_NUMBER $_ $LAST_READ_LINE" +
  " $> $DEFAULT_OUTPUT $< $DEFAULT_INPUT $$ $PID $PROCESS_ID $? $CHILD_STATUS $~ $LAST_MATCH_INFO" +
  " $= $IGNORECASE $* $ARGV $& $MATCH $` $PREMATCH $' $POSTMATCH $+ $LAST_PAREN_MATCH" +
  " $stdin $stdout $stderr $DEBUG $FILENAME $VERBOSE $SAFE" +
  " $-0 $-a $-d $-F $-i $-I $-l $-p $-v $-w $CLASSPATH $JRUBY_VERSION $JRUBY_REVISION $ENV_JAVA ";

export class CopStyleGlobalVars {
  c: RbCop;

  constructor() {
    this.c = new RbCop("Style/GlobalVars");
  }

  // nishfmt: detect-only

  run(src: RbSource): void {
    this.c.begin(src);
    for (const n of src.pre) {
      if (!ssxIs(src, n, NT_GVAR) && !ssxIs(src, n, NT_GVASGN)) {
        continue;
      }
      if (ssxInList(RB_GLOBAL_VARS_BUILTIN, src.a.text(src.a.kid(n, 0)))) {
        continue;
      }
      this.c.offense(ssxFS(src, n, F_NAME), ssxFE(src, n, F_NAME));
    }
  }
}
