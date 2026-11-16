import XCTest

class FooTests: XCTestCase {
    var foo: Foo!

    func testA() {
        let value = foo.bar!.value
        XCTAssertEqual(foo.bar!.baz, 1)
        XCTAssertEqual(foo.bar!.baz, 1.0, accuracy: 0.1)
        XCTAssertNil(foo!.bar)
        foo!.bar = baaz
        foo!.doIt()
        let x = (foo as! Bar).quux
        let y = a + b!.c
        let z = !foo!.isEmpty
        let w = try! foo!.bar()
        print("\(foo!.bar)")
        let k = \Foo.[0]!
        if foo!.bar == 1 {}
        let q = foo!.bar ?? 2
        let r = foo! as! Baz
        let s = foo.map { $0! }
        let t = foo[bar!]!
        let u = await foo!.bar
    }

    func testB() async {
        let a = foo!
        call(foo!, bar: baz!.qux)
    }

    func helper() {
        let a = foo!
    }
}
