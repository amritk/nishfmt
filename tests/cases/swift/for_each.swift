func foo() {
    strings.forEach {
        print($0)
    }
    allItems.forEach {
        print($0)
    }
    boxen.forEach {
        print($0)
    }
    matrices.forEach {
        print($0)
    }
    people.forEach {
        print($0)
    }
    data.forEach {
        print($0)
    }
    classes.forEach {
        print($0)
    }
    foos.reversed().forEach {
        print($0)
        return
    }
    foo.bar.forEach({ item in
        print(item)
    })
    dict.forEach { key, value in
        print(key, value)
    }
    dict.forEach { (key: String, value: Int) in
        print(key, value)
    }
    items.forEach {
        print($0, $1)
    }
    items.forEach {
        for x in $0 {
            return
        }
    }
    items.forEach {
        print("$1 \($0)")
    }
    let x = items.forEach {
        print($0)
    }
    try items.forEach {
        print($0)
    }
    (items).forEach {
        print($0)
    }
    items.map { $0 }.forEach {
        print($0)
    }
    elements.forEach {
        let item = $0
        let element = $0
        print(value)
    }
    lazies.forEach {
        print($0)
    }
    in.forEach {
        print($0)
    }
    items.forEach { _ in
        print("x")
    }
    items.forEach { () in
        print("x")
    }
    items.forEach { [weak self] in
        print($0)
    }
    unsafe items.forEach {
        print($0)
    }
    sheep.forEach {
        print($0)
    }
}
