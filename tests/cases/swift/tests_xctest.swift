import XCTest

final class ParserTests: XCTestCase {
    func testParse() async throws {
        let value = try! Parser().parse("1")
        XCTAssertEqual(value, 1)
    }

    func testEmpty() throws {
        XCTAssertTrue(true)
    }
}
