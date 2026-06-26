import Foundation

public struct TerminalScreenLine: Equatable, Identifiable, Sendable {
    public let id: String
    public let row: Int
    public let text: String

    public init(row: Int, text: String) {
        self.id = "screen-\(row)"
        self.row = row
        self.text = text
    }
}

public struct TerminalScreen: Equatable, Sendable {
    public private(set) var columns: Int
    public private(set) var rows: Int
    public private(set) var cursorColumn: Int
    public private(set) var cursorRow: Int

    private var cells: [[Character]]

    public init(columns: Int = 80, rows: Int = 24) {
        self.columns = max(1, columns)
        self.rows = max(1, rows)
        self.cursorColumn = 0
        self.cursorRow = 0
        self.cells = Array(
            repeating: Array(repeating: " ", count: self.columns),
            count: self.rows
        )
    }

    public var visibleLines: [TerminalScreenLine] {
        cells.enumerated().map { row, cells in
            TerminalScreenLine(row: row, text: String(cells).trimmedRight())
        }
    }

    public var hasVisibleText: Bool {
        visibleLines.contains { $0.text.isEmpty == false }
    }

    public mutating func resize(columns: Int, rows: Int) {
        let newColumns = max(1, columns)
        let newRows = max(1, rows)
        var resized = Array(
            repeating: Array(repeating: Character(" "), count: newColumns),
            count: newRows
        )
        for row in 0..<min(self.rows, newRows) {
            for column in 0..<min(self.columns, newColumns) {
                resized[row][column] = cells[row][column]
            }
        }
        self.columns = newColumns
        self.rows = newRows
        self.cells = resized
        cursorRow = min(cursorRow, newRows - 1)
        cursorColumn = min(cursorColumn, newColumns - 1)
    }

    public mutating func apply(_ data: Data) {
        guard let text = String(data: data, encoding: .utf8) else { return }
        apply(text)
    }

    public mutating func apply(_ text: String) {
        var parser = TerminalEscapeParser(text)
        while let token = parser.nextToken() {
            switch token {
            case .character(let character):
                put(character)
            case .lineFeed:
                lineFeed()
            case .carriageReturn:
                cursorColumn = 0
            case .backspace:
                cursorColumn = max(0, cursorColumn - 1)
            case .clearScreen:
                clearScreen()
            case .eraseLine:
                eraseLine()
            case .cursorHome:
                cursorRow = 0
                cursorColumn = 0
            case .cursorPosition(let row, let column):
                cursorRow = min(max(0, row), rows - 1)
                cursorColumn = min(max(0, column), columns - 1)
            case .cursorUp(let count):
                cursorRow = max(0, cursorRow - count)
            case .cursorDown(let count):
                cursorRow = min(rows - 1, cursorRow + count)
            case .cursorForward(let count):
                cursorColumn = min(columns - 1, cursorColumn + count)
            case .cursorBackward(let count):
                cursorColumn = max(0, cursorColumn - count)
            }
        }
    }

    private mutating func put(_ character: Character) {
        cells[cursorRow][cursorColumn] = character
        if cursorColumn == columns - 1 {
            cursorColumn = 0
            lineFeed()
        } else {
            cursorColumn += 1
        }
    }

    private mutating func lineFeed() {
        if cursorRow == rows - 1 {
            cells.removeFirst()
            cells.append(Array(repeating: " ", count: columns))
        } else {
            cursorRow += 1
        }
    }

    private mutating func clearScreen() {
        cells = Array(repeating: Array(repeating: " ", count: columns), count: rows)
        cursorRow = 0
        cursorColumn = 0
    }

    private mutating func eraseLine() {
        cells[cursorRow] = Array(repeating: " ", count: columns)
        cursorColumn = 0
    }
}

private enum TerminalToken {
    case character(Character)
    case lineFeed
    case carriageReturn
    case backspace
    case clearScreen
    case eraseLine
    case cursorHome
    case cursorPosition(row: Int, column: Int)
    case cursorUp(Int)
    case cursorDown(Int)
    case cursorForward(Int)
    case cursorBackward(Int)
}

private struct TerminalEscapeParser {
    private let scalars: [UnicodeScalar]
    private var index = 0

    init(_ text: String) {
        self.scalars = Array(text.unicodeScalars)
    }

    mutating func nextToken() -> TerminalToken? {
        guard index < scalars.count else { return nil }
        let scalar = scalars[index]
        index += 1

        switch scalar.value {
        case 0x0A:
            return .lineFeed
        case 0x0D:
            return .carriageReturn
        case 0x08:
            return .backspace
        case 0x1B:
            return parseEscape()
        default:
            return .character(Character(scalar))
        }
    }

    private mutating func parseEscape() -> TerminalToken? {
        guard index < scalars.count else { return nil }
        guard scalars[index] == "[" else { return nil }
        index += 1

        var parameters = ""
        while index < scalars.count {
            let scalar = scalars[index]
            index += 1
            if scalar.value >= 0x40, scalar.value <= 0x7E {
                return csiToken(final: scalar, parameters: parameters)
            }
            parameters.unicodeScalars.append(scalar)
        }
        return nil
    }

    private func csiToken(final: UnicodeScalar, parameters: String) -> TerminalToken? {
        let values = parameters
            .split(separator: ";", omittingEmptySubsequences: false)
            .map { Int($0) ?? 0 }
        let first = max(1, values.first ?? 1)

        switch final {
        case "A":
            return .cursorUp(first)
        case "B":
            return .cursorDown(first)
        case "C":
            return .cursorForward(first)
        case "D":
            return .cursorBackward(first)
        case "H", "f":
            let row = max(1, values.first ?? 1) - 1
            let column = max(1, values.dropFirst().first ?? 1) - 1
            return values.isEmpty ? .cursorHome : .cursorPosition(row: row, column: column)
        case "J":
            return (values.first ?? 0) == 2 ? .clearScreen : nil
        case "K":
            return .eraseLine
        default:
            return nil
        }
    }
}

private extension String {
    func trimmedRight() -> String {
        var value = self
        while value.last == " " {
            value.removeLast()
        }
        return value
    }
}
