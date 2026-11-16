// Branch bodies are formatted as snippets; `$(...)` in a body keeps the whole definition.
macro_rules! square {
    ($x:expr) => {
        $x   *   $x
    }
}

macro_rules! pair {
    ($a:expr, $b:expr) => {{ let a = $a; let b = $b; (a,b) }};
    () => {}
}

macro_rules! message {
    ($($tt:tt)*) => {
        if crate::messages::messages() {
            eprintln_locked!($($tt)*);
        }
    }
}

macro_rules! early {
    ($e:expr) => {
        if $e { return   }
    };
}

macro_rules! empty {}
