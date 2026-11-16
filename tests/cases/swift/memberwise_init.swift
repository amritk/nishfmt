struct A {
    let x: Int
    var y: String = ""

    // a comment
    init(x: Int) {
        self.x = x
    }
}

struct B {
    private let x: Int
    private init(x: Int) {
        self.x = x
    }
    func foo() {}
}

struct C<Content: View>: View {
    let content: Content
    let handler: () -> Void

    init(@ViewBuilder content: () -> Content, handler: @escaping () -> Void) {
        self.content = content()
        self.handler = handler
    }

    var body: some View { content }
}

struct D {
    let x: Int
    /// Doc
    init(x: Int) {
        self.x = x
    }
}

struct E {
    let x: Int
    init(x: Int = 1) { self.x = x }
}

struct F {
    let x: Int; let y: Int
    init(x: Int, y: Int) { self.x = x; self.y = y }
}
struct G {
    @Environment(\.foo) private var foo
    private var a: Int
    let b: [String: Int]
    fileprivate init(a: Int, b: [String:Int]) {
        self.a = a
        self.b = b
    }
}
struct H {
    var a: Int
    @inlinable init(a: Int) { self.a = a }
}
struct I {
    var a: Int
    init?(a: Int) { self.a = a }
}
struct J<T> {
    var a: T
    var b: () -> T
    init(a: T, @Builder b: @escaping () -> T) {
        self.b = b
        self.a = a
    }
}
struct K<T> {
    var a: T
    var b: () -> T
    init(a: T, @Builder b: @escaping () -> T) {
        self.a = a
        self.b = b
    }
}
struct L {
    private var a: Int
    private init(a: Int) {
        self.a = a
    }
}
