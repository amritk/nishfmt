// Style edition 2024 leaves the lines of a string inside a comment as they
// are when a separately formatted block is put back (utils.rs
// indent_next_line, trim_left_preserve_layout): a macro_rules! body, and
// a block comment with bare lines, re-indented by its least indented line.
macro_rules! m {
    () => {
        /* a "string
in a comment" */
        x
    };
}

macro_rules! n {
    ($e:expr) => {
        /* "first
            second" */
        let v = $e;
    };
}

fn f() {
            /* a "first
   second" third
      x */
    let a = 1;
}

fn g() {
    let b = 2;
        /*
          not a star "a string
     inside" here
            end */
}

fn h() {
            /* a "first
   middle
   second" third
      x */
    let a = 1;
}
