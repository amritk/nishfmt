import Foundation

// swiftformat:enable redundantSelf
class Foo {
    var bar = 1
    func a() {
        print(self.bar) // swiftformat:disable:this redundantSelf
        print(self.bar)
        // swiftformat:disable:next redundantSelf, trailingCommas
        print(self.bar)
        print(self.bar) /* swiftformat:disable redundantSelf */ ; print(self.bar)
        print(self.bar)
        // swiftformat:enable redundantSelf
        print(self.bar)
        let x = [
            1,
            2 // swiftformat:disable:this trailingCommas
        ]
        let y = [
            1,
            2
        ]
        print(self.bar)
        // swiftformat:disable:previous redundantSelf
        if (x == y) { print( 1 ) }
        // swiftformat:disable all
        if (x == y) { print( 1 ) }
        // swiftformat:enable all
        if (x == y) { print( 1 ) }
        // swiftformat:disable RedundantParens spaceInsideParens
        if (x == y) { print( 1 ) }
        // swiftformat:enable redundantparens -- because
        if (x == y) { print( 1 ) }
        let s = """
          hello \(self.bar)
          // swiftformat:disable:next redundantSelf
          world
        """
        print(self.bar)
    }
}
// swiftformat:disable:next indent
      let z = 1
    let w = 2
