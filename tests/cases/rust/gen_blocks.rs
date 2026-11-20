fn f() {
    gen { yield ""; };
    gen move { yield ""; };
    async  gen  move  {};
    let x = gen { yield 1 };
    gen { yield 1 }.into_iter();
    foo(gen { yield aaaaaaaaaaaaaaaaaaaaaaaaaaaaa; yield bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; });
    let x = #[a] gen { 1 };
    let x = gen { #![a] 1 };
}
