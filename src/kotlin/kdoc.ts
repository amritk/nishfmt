// ktfmt's KDoc formatter (to be ported): for now, the comment as written.

/** KDocFormatter.reformatComment for a comment starting at `column0`. */
export const formatKDoc = (text: string, column0: i32, maxWidth: i32): string => {
  if (column0 < 0 || maxWidth < 0) {
    return "";
  }
  return text;
};
