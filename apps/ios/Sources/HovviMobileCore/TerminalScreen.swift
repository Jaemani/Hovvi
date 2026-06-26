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
    public var background: TerminalAnsiColor?

    public init(
        bold: Bool = false,
        italic: Bool = false,
        underline: Bool = false,
        inverse: Bool = false,
        foreground: TerminalAnsiColor? = nil,
        background: TerminalAnsiColor? = nil
    ) {
        self.bold = bold
        self.italic = italic
        self.underline = underline
        self.inverse = inverse
        self.foreground = foreground
        self.background = background
    }
}

public enum TerminalAnsiColor: Equatable, Sendable {
    case black
    case red
    case green
    case yellow
    case blue
    case magenta
    case cyan
    case white
    case brightBlack
    case brightRed
    case brightGreen
    case brightYellow
    case brightBlue
    case brightMagenta
    case brightCyan
    case brightWhite
    case indexed(UInt8)
    case rgb(red: UInt8, green: UInt8, blue: UInt8)
}

private extension TerminalAnsiColor {
    init?(standardIndex: Int) {
        switch standardIndex {
        case 0:
            self = .black
        case 1:
            self = .red
        case 2:
            self = .green
        case 3:
            self = .yellow
        case 4:
            self = .blue
        case 5:
            self = .magenta
        case 6:
            self = .cyan
        case 7:
            self = .white
        case 8:
            self = .brightBlack
        case 9:
            self = .brightRed
        case 10:
            self = .brightGreen
        case 11:
            self = .brightYellow
        case 12:
            self = .brightBlue
        case 13:
            self = .brightMagenta
        case 14:
            self = .brightCyan
        case 15:
            self = .brightWhite
        default:
            return nil
        }
    }
}

public struct TerminalScreen: Equatable, Sendable {
    public private(set) var columns: Int
    public private(set) var rows: Int
    public private(set) var cursorColumn: Int
    public private(set) var cursorRow: Int

    private var cells: [[TerminalCell]]
    private var currentAttributes = TerminalTextAttributes()
    private var primarySnapshotBeforeAlternate: TerminalScreenSnapshot?

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

    public var isAlternateScreenActive: Bool {
        primarySnapshotBeforeAlternate != nil
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
            case .alternateScreen(let enabled):
                if enabled {
                    enterAlternateScreen()
                } else {
                    exitAlternateScreen()
                }
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
        var index = 0
        while index < values.count {
            let value = values[index]
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
                currentAttributes.foreground = TerminalAnsiColor(standardIndex: value - 30)
            case 40...47:
                currentAttributes.background = TerminalAnsiColor(standardIndex: value - 40)
            case 39:
                currentAttributes.foreground = nil
            case 38:
                if applyExtendedColorSgr(values, index: &index, target: .foreground) {
                    continue
                }
            case 48:
                if applyExtendedColorSgr(values, index: &index, target: .background) {
                    continue
                }
            case 49:
                currentAttributes.background = nil
            case 90...97:
                currentAttributes.foreground = TerminalAnsiColor(standardIndex: value - 90 + 8)
            case 100...107:
                currentAttributes.background = TerminalAnsiColor(standardIndex: value - 100 + 8)
            default:
                break
            }
            index += 1
        }
    }

    private mutating func applyExtendedColorSgr(
        _ values: [Int],
        index: inout Int,
        target: TerminalColorAttributeTarget
    ) -> Bool {
        guard index + 1 < values.count else { return false }
        switch values[index + 1] {
        case 5:
            guard index + 2 < values.count else { return false }
            setColor(.indexed(UInt8(clamping: values[index + 2])), for: target)
            index += 3
            return true
        case 2:
            guard index + 4 < values.count else { return false }
            setColor(
                .rgb(
                    red: UInt8(clamping: values[index + 2]),
                    green: UInt8(clamping: values[index + 3]),
                    blue: UInt8(clamping: values[index + 4])
                ),
                for: target
            )
            index += 5
            return true
        default:
            return false
        }
    }

    private mutating func setColor(_ color: TerminalAnsiColor, for target: TerminalColorAttributeTarget) {
        switch target {
        case .foreground:
            currentAttributes.foreground = color
        case .background:
            currentAttributes.background = color
        }
    }

    private enum TerminalColorAttributeTarget {
        case foreground
        case background
    }

    private mutating func enterAlternateScreen() {
        if primarySnapshotBeforeAlternate == nil {
            primarySnapshotBeforeAlternate = TerminalScreenSnapshot(
                cells: cells,
                cursorColumn: cursorColumn,
                cursorRow: cursorRow,
                attributes: currentAttributes
            )
        }
        cells = Self.blankCells(columns: columns, rows: rows)
        cursorColumn = 0
        cursorRow = 0
        currentAttributes = TerminalTextAttributes()
    }

    private mutating func exitAlternateScreen() {
        guard let snapshot = primarySnapshotBeforeAlternate else { return }
        cells = Self.resizedCells(snapshot.cells, columns: columns, rows: rows)
        cursorColumn = min(snapshot.cursorColumn, columns - 1)
        cursorRow = min(snapshot.cursorRow, rows - 1)
        currentAttributes = snapshot.attributes
        primarySnapshotBeforeAlternate = nil
    }

    private static func blankCells(columns: Int, rows: Int) -> [[TerminalCell]] {
        Array(repeating: blankRow(columns: columns), count: rows)
    }

    private static func blankRow(columns: Int) -> [TerminalCell] {
        Array(repeating: TerminalCell(), count: columns)
    }

    private static func resizedCells(_ cells: [[TerminalCell]], columns: Int, rows: Int) -> [[TerminalCell]] {
        var resized = blankCells(columns: columns, rows: rows)
        for row in 0..<min(cells.count, rows) {
            for column in 0..<min(cells[row].count, columns) {
                resized[row][column] = cells[row][column]
            }
        }
        return resized
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
    case alternateScreen(Bool)
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
        case "h", "l":
            guard isAlternateScreenParameters(parameters) else { return nil }
            return .alternateScreen(final == "h")
        default:
            return nil
        }
    }

    private func isAlternateScreenParameters(_ parameters: String) -> Bool {
        guard parameters.hasPrefix("?") else { return false }
        let modes = parameters
            .dropFirst()
            .split(separator: ";")
            .compactMap { Int($0) }
        return modes.contains(47) || modes.contains(1047) || modes.contains(1049)
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

private struct TerminalScreenSnapshot: Equatable {
    var cells: [[TerminalCell]]
    var cursorColumn: Int
    var cursorRow: Int
    var attributes: TerminalTextAttributes
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
