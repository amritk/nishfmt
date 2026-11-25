// The fault flag: how a formatter gives up on a file from deep inside, where
// it cannot hand a failure back up.
//
// Every module but src/main.ts is held to no panic (package.json's
// `nish.noPanic`), so an index, a signed sum or a division the compiler cannot
// prove safe carries a guard. Where a guard's other branch is a state the
// formatter's own invariants rule out, the branch calls `fault()` and leaves
// with a neutral value. That value is never output: main.ts clears the flag
// before each file and treats a file whose formatter faulted as one it could
// not format, as it treated a panic, and leaves the file untouched.
//
// A guard's other branch inside a loop must leave the loop, so a neutral value
// can never keep it turning.

/** Set while the file being formatted has faulted: one slot, 0 or 1. */
const FAULT = new Int32Array(1);

const faultFill = (flag: Int32Array, v: i32): void => {
  for (let i = 0; i < flag.length; i++) {
    flag[i] = v;
  }
};

const faultRead = (flag: Int32Array): i32 => (flag.length > 0 ? flag[0] : 1);

/** Marks the file being formatted as one the formatter cannot format. */
export const fault = (): void => {
  faultFill(FAULT, 1);
};

/** Clears the flag before a file is formatted. */
export const faultReset = (): void => {
  faultFill(FAULT, 0);
};

/** Whether the file being formatted has faulted since `faultReset`. */
export const faulted = (): boolean => faultRead(FAULT) !== 0;
