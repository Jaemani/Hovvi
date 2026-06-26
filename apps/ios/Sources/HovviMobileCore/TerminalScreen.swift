import Foundation

public struct TerminalScreenLine: Equatable, Identifiable, Sendable {
    public let id: String
    public let row: Int
    public let text: String
    public let runs: [TerminalScreenRun]

    public init(row: Int, text: String, runs: [TerminalScreenRun]) {
        self.id = "screen-\(row)"
        self.row = row
        self.text = text
        self.runs = runs
    }
}

public struct TerminalScreenRun: Equatable, Sendable {
    public let text: String
    public let attributes: TerminalTextAttributes

    public init(text: String, attributes: TerminalTextAttributes = TerminalTextAttributes()) {
        self.text = text
        self.attributes = attributes
    }
}

public struct TerminalTextAttributes: Equatable, Sendable {
    public var bold: Bool
    public var italic: Bool
    public var underline: Bool
    public var inverse: Bool
    public var foreground: TerminalAnsiColor?

    public init(
        bold: Bool = false,
        italic: Bool = false,
        underline: Bool = false,
        inverse: Bool = false,
        foreground: TerminalAnsiColor? = nil
    ) {
        self.bold = bold
        self.italic = italic
        self.underline = underline
        self.inverse = inverse
        self.foreground = foreground
    }
}

public enum TerminalAnsiColor: Int, Equatable, Sendable {
    case black = 0
    case red = 1
    case green = 2
    case yellow = 3
    case blue = 4
    case magenta = 5
    case cyan = 6
    case white = 7
    case brightBlack = 8
    case brightRed = 9
    case brightGreen = 10
    case brightYellow = 11
    case brightBlue = 12
    case brightMagenta = 13
    case brightCyan = 14
    case brightWhite = 15
}

public struct TerminalScreen: Equatable, Sendable {
    public private(set) var columns: Int
    public private(set) var rows: Int
    public private(set) var cursorColumn: Int
    public private(set) var cursorRow: Int

    private var cells: [[TerminalCell]]
    private var currentAttributes = TerminalTextAttributes()

    public init(columns: Int = 80, rows: Int = 24) {
        self.columns = max(1, columns)
        self.rows = max(1, rows)
        self.cursorColumn = 0
        self.cursorRow = 0
        self.cells = Self.blankCells(columns: self.columns, rows: self.rows)
    }

    public var visibleLines: [TerminalScreenLine] {
        cells.enumerated().map { row, cells in
            let runs = cells.trimmingRightSpaces().groupedRuns()
            return TerminalScreenLine(
                row: row,
                text: runs.map(\.text).joined(),
                runs: runs
            )
        }
    }

    public var hasVisibleText: Bool {
        visibleLines.contains { $0.text.isEmpty == false }
    }

    public mutating func resize(columns: Int, rows: Int) {
        let newColumns = max(1, columns)
        let newRows = max(1, rows)
        var resized = Self.blankCells(columns: newColumns, rows: newRows)
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
            case .sgr(let values):
                applySgr(values)
            }
        }
    }

    private mutating func put(_ character: Character) {
        cells[cursorRow][cursorColumn] = TerminalCell(character: character, attributes: currentAttributes)
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
            cells.append(Self.blankRow(columns: columns))
        } else {
            cursorRow += 1
        }
    }

    private mutating func clearScreen() {
        cells = Self.blankCells(columns: columns, rows: rows)
        cursorRow = 0
        cursorColumn = 0
    }

    private mutating func eraseLine() {
        cells[cursorRow] = Self.blankRow(columns: columns)
        cursorColumn = 0
    }

    private mutating func applySgr(_ values: [Int]) {
        let values = values.isEmpty ? [0] : values
        for value in values {
            switch value {
            case 0:
                currentAttributes = TerminalTextAttributes()
            case 1:
                currentAttributes.bold = true
            case 3:
                currentAttributes.italic = true
            case 4:
                currentAttributes.underline = true
            case 7:
                currentAttributes.inverse = true
            case 22:
                currentAttributes.bold = false
            case 23:
                currentAttributes.italic = false
            case 24:
                currentAttributes.underline = false
            case 27:
                currentAttributes.inverse = false
            case 30...37:
                currentAttributes.foreground = TerminalAnsiColor(rawValue: value - 30)
            case 39:
                currentAttributes.foreground = nil
            case 90...97:
                currentAttributes.foreground = TerminalAnsiColor(rawValue: value - 90 + 8)
            default:
                continue
            }
        }
    }

    private static func blankCells(columns: Int, rows: Int) -> [[TerminalCell]] {
        Array(repeating: blankRow(columns: columns), count: rows)
    }

    private static func blankRow(columns: Int) -> [TerminalCell] {
        Array(repeating: TerminalCell(), count: columns)
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
    case sgr([Int])
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
        case "m":
            return .sgr(values)
        default:
            return nil
        }
    }
}

private struct TerminalCell: Equatable {
    var character: Character
    var attributes: TerminalTextAttributes

    init(character: Character = " ", attributes: TerminalTextAttributes = TerminalTextAttributes()) {
        self.character = character
        self.attributes = attributes
    }
}

private extension Array where Element == TerminalCell {
    func trimmingRightSpaces() -> [TerminalCell] {
        var value = self
        while value.last?.character == " " {
            value.removeLast()
        }
        return value
    }

    func groupedRuns() -> [TerminalScreenRun] {
        var runs: [TerminalScreenRun] = []
        var text = ""
        var attributes = first?.attributes ?? TerminalTextAttributes()

        for cell in self {
            if cell.attributes == attributes {
                text.append(cell.character)
            } else {
                if text.isEmpty == false {
                    runs.append(TerminalScreenRun(text: text, attributes: attributes))
                }
                attributes = cell.attributes
                text = String(cell.character)
            }
        }

        if text.isEmpty == false {
            runs.append(TerminalScreenRun(text: text, attributes: attributes))
        }
        return runs
    }
}
