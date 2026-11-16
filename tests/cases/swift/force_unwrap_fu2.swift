import Testing

struct FooTests {
    @Test func a() {
        let value = foo.bar!.value
        #expect(foo!.bar == 1)
        let x = try #require(foo!.bar)
        let y = a + b!.c * d!
        let z = !foo!.isEmpty
        let q = (foo as! Bar).quux!.x
        let r = foo!.bar is Baz
        let s = foo!.bar as Baz
        let longer = foo
            .bar!
            .baz
        let c = c!
            (d!).e
    }

    @Test("name") func b() async throws {
        let a = foo!.bar
        let b = await foo!.bar
    }
}
