import SwiftUI

struct MyView: View {
    var body: some View {
        if condition {
            Text("Hello")
        } else {
            EmptyView()
        }
        if other {
            Text("Bye")
        } else {
            EmptyView()
        }
    }
}

struct OtherView: View {
    var body: some View {
        Group {
            Text("foo")
            Text("bar")
        }
    }
}

struct ThirdView: View {
    var content: some View {
        Group {
            Text("foo")
            Text("bar")
        }
    }
}

public extension URL {
    public func queryParameter(_ name: String) -> String { "" }
    public func other(_ name: String) -> String { "" }
    public var x: Int { 1 }
}

class Foo {
    @objc @IBOutlet var label: UILabel!
    @IBAction @objc func goBack() {}
    @objc @NSManaged private var foo: String?
    @objc @IBOutlet var label2: UILabel!
}

func brackets() {
    let a = foo as[String]
    let b = bar [5]
    let c = Foo <Bar> ()
    let d = Foo< Bar, Baz >()
    let e = baz [6]
    let f = Foo <Baz> ()
    let g = Foo< Bar >()
}

typealias Placeholders = Foo & Bar & Baaz
typealias Other = Zed & Alpha & Mid

struct Mods {
    @MainActor
    public
    private(set)
    var foo: Foo
    nonisolated
    func bar() {}
    public
    static
    func baz() {}
}

func enumerated() {
    for (_, item) in items.enumerated() {
        print(item)
    }
    for (_, item) in others.enumerated() {
        print(item)
    }
    foo (bar)
    if (x) {}
    let y = baz (1)
}

/// Doc comment
public
/// Another
func docs() {}

@MainActor
/// Doc
public func docs2() {}
