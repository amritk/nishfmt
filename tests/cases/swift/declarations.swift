public struct Constants {
    static let maximum = 10
    static let minimum = 1
}

extension Foo {
    @MainActor func first() {}
    @MainActor func second() {}
}

fileprivate let shared = Constants()

final public class Model : NSObject {
    var title: String?   = nil
    override public init() {
        super.init()
    }

    public func load(completion: @escaping (Bool) -> Void) {
        if isReady {
            if isValid {
                completion(true)
            }
        } else {
            if isLoading {
                completion(false)
            }
        }
    }
}
