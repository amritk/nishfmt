import UIKit
import Foundation

class Counter {
    private(set) var count: Int = 0
    var name: String? = nil

    func increment(by step: Int, label: String) {
        self.count += step
        let total = self.count
        print( total )
    }

    func reset() {
        DispatchQueue.main.async(execute: {
            self.count = 0
        })
    }

    func describe() -> String {
        let text = "Counter \(self.count)"
        return text
    }
}
