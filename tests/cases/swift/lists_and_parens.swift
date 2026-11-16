let values = [
    1,
    2,
    3
]

let point = Point(
    x: 1,
    y: 2,
)

if (values.count > 2) {
    print("many")
}

guard let first = values.first else { return }
guard let last = values.last else { return }

let a: Int = 5
let b = String.init("text")
if 5 == a { print(b) }

for (key, value) in dictionary {
    print(key)
}

switch value {
case let (x, y): print(x, y)
default: break
}
