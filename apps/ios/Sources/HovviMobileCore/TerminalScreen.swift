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
    public private(set) var isBracketedPasteModeEnabled: Bool
    public private(set) var isCursorVisible: Bool
    public private(set) var isApplicationCursorKeysModeEnabled: Bool
    public private(set) var isAutoWrapModeEnabled: Bool

    private var cells: [[TerminalCell]]
    private var currentAttributes = TerminalTextAttributes()
    private var scrollRegion: TerminalScrollRegion?
    private var originMode = false
    private var savedCursor: TerminalSavedCursor?
    private var primarySnapshotBeforeAlternate: TerminalScreenSnapshot?
    private var tabStops: Set<Int>
    private var operatingSystemCommandSkipState = TerminalOperatingSystemCommandSkipState.none
    private var characterSet = TerminalCharacterSet.ascii

    public init(columns: Int = 80, rows: Int = 24) {
        self.columns = max(1, columns)
        self.rows = max(1, rows)
        self.cursorColumn = 0
        self.cursorRow = 0
        self.isBracketedPasteModeEnabled = false
        self.isCursorVisible = true
        self.isApplicationCursorKeysModeEnabled = false
        self.isAutoWrapModeEnabled = true
        self.cells = Self.blankCells(columns: self.columns, rows: self.rows)
        self.tabStops = Self.defaultTabStops(columns: self.columns)
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
        let oldDefaultTabStops = Self.defaultTabStops(columns: self.columns)
        self.columns = newColumns
        self.rows = newRows
        self.cells = resized
        if tabStops == oldDefaultTabStops {
            tabStops = Self.defaultTabStops(columns: newColumns)
        } else {
            tabStops = Set(tabStops.filter { $0 < newColumns })
        }
        scrollRegion = scrollRegion?.resized(toRows: newRows)
        savedCursor = savedCursor?.resized(columns: newColumns, rows: newRows)
        cursorRow = min(cursorRow, newRows - 1)
        cursorColumn = min(cursorColumn, newColumns - 1)
    }

    public mutating func apply(_ data: Data) {
        guard let text = String(data: data, encoding: .utf8) else { return }
        apply(text)
    }

    public mutating func apply(_ text: String) {
        guard let parseableText = consumePendingOperatingSystemCommandPrefix(from: text) else { return }
        var parser = TerminalEscapeParser(parseableText)
        while let token = parser.nextToken() {
            switch token {
            case .ignored:
                break
            case .reset:
                reset()
            case .character(let character):
                put(character)
            case .characterSet(let characterSet):
                self.characterSet = characterSet
            case .lineFeed:
                lineFeed()
            case .reverseIndex:
                reverseIndex()
            case .carriageReturn:
                cursorColumn = 0
            case .backspace:
                cursorColumn = max(0, cursorColumn - 1)
            case .horizontalTab:
                horizontalTab()
            case .cursorForwardTab(let count):
                cursorForwardTab(count)
            case .cursorBackwardTab(let count):
                cursorBackwardTab(count)
            case .eraseDisplay(let mode):
                eraseDisplay(mode)
            case .eraseLine(let mode):
                eraseLine(mode)
            case .eraseCharacters(let count):
                eraseCharacters(count)
            case .cursorHome:
                cursorRow = cursorHomeRow
                cursorColumn = 0
            case .cursorPosition(let row, let column):
                let rowBounds = cursorRowBounds
                let targetRow = (originMode ? rowBounds.lowerBound : 0) + row
                cursorRow = min(max(rowBounds.lowerBound, targetRow), rowBounds.upperBound)
                cursorColumn = min(max(0, column), columns - 1)
            case .cursorUp(let count):
                cursorRow = max(cursorRowBounds.lowerBound, cursorRow - count)
            case .cursorDown(let count):
                cursorRow = min(cursorRowBounds.upperBound, cursorRow + count)
            case .cursorForward(let count):
                cursorColumn = min(columns - 1, cursorColumn + count)
            case .cursorBackward(let count):
                cursorColumn = max(0, cursorColumn - count)
            case .cursorNextLine(let count):
                cursorRow = min(cursorRowBounds.upperBound, cursorRow + count)
                cursorColumn = 0
            case .cursorPreviousLine(let count):
                cursorRow = max(cursorRowBounds.lowerBound, cursorRow - count)
                cursorColumn = 0
            case .cursorHorizontalAbsolute(let column):
                cursorColumn = min(max(0, column), columns - 1)
            case .cursorVerticalAbsolute(let row):
                let rowBounds = cursorRowBounds
                let targetRow = (originMode ? rowBounds.lowerBound : 0) + row
                cursorRow = min(max(rowBounds.lowerBound, targetRow), rowBounds.upperBound)
            case .saveCursor:
                saveCursor()
            case .restoreCursor:
                restoreCursor()
            case .insertLines(let count):
                insertLines(count)
            case .deleteLines(let count):
                deleteLines(count)
            case .scrollUp(let count):
                scrollUp(count)
            case .scrollDown(let count):
                scrollDown(count)
            case .insertCharacters(let count):
                insertCharacters(count)
            case .deleteCharacters(let count):
                deleteCharacters(count)
            case .setHorizontalTabStop:
                tabStops.insert(cursorColumn)
            case .clearTabStops(let mode):
                clearTabStops(mode)
            case .sgr(let values):
                applySgr(values)
            case .scrollRegion(let top, let bottom):
                setScrollRegion(top: top, bottom: bottom)
            case .privateModes(let modes, let enabled):
                for mode in modes {
                    applyPrivateMode(mode, enabled: enabled)
                }
            }
        }
        operatingSystemCommandSkipState = parser.operatingSystemCommandSkipState
    }

    private mutating func reset() {
        cursorColumn = 0
        cursorRow = 0
        isBracketedPasteModeEnabled = false
        isCursorVisible = true
        isApplicationCursorKeysModeEnabled = false
        isAutoWrapModeEnabled = true
        cells = Self.blankCells(columns: columns, rows: rows)
        currentAttributes = TerminalTextAttributes()
        scrollRegion = nil
        originMode = false
        savedCursor = nil
        primarySnapshotBeforeAlternate = nil
        tabStops = Self.defaultTabStops(columns: columns)
        operatingSystemCommandSkipState = .none
        characterSet = .ascii
    }

    private mutating func put(_ character: Character) {
        let character = characterSet.mapped(character)
        let width = character.terminalCellWidth
        if width == 0 {
            appendCombiningCharacter(character)
            return
        }
        if width == 2, cursorColumn == columns - 1, isAutoWrapModeEnabled {
            cursorColumn = 0
            lineFeed()
        }
        cells[cursorRow][cursorColumn] = TerminalCell(character: character, attributes: currentAttributes)
        if width == 2, cursorColumn + 1 < columns {
            cells[cursorRow][cursorColumn + 1] = TerminalCell(
                character: " ",
                attributes: currentAttributes,
                isContinuation: true
            )
        }
        advanceCursor(by: width)
    }

    private mutating func appendCombiningCharacter(_ character: Character) {
        guard cursorColumn > 0 else { return }
        let previousColumn = cursorColumn - 1
        guard cells[cursorRow][previousColumn].isContinuation == false else { return }
        let combined = String(cells[cursorRow][previousColumn].character) + String(character)
        let combinedCharacters = Array(combined)
        if combinedCharacters.count == 1, let combinedCharacter = combinedCharacters.first {
            cells[cursorRow][previousColumn].character = combinedCharacter
        }
    }

    private mutating func advanceCursor(by width: Int) {
        cursorColumn += width
        if isAutoWrapModeEnabled == false {
            cursorColumn = min(cursorColumn, columns - 1)
            return
        }
        while cursorColumn >= columns {
            cursorColumn -= columns
            lineFeed()
        }
    }

    private mutating func horizontalTab() {
        guard let nextTabStop = tabStops.sorted().first(where: { $0 > cursorColumn }) else {
            cursorColumn = columns - 1
            return
        }
        cursorColumn = min(nextTabStop, columns - 1)
    }

    private mutating func cursorForwardTab(_ count: Int) {
        for _ in 0..<max(1, count) {
            horizontalTab()
        }
    }

    private mutating func cursorBackwardTab(_ count: Int) {
        for _ in 0..<max(1, count) {
            guard let previousTabStop = tabStops.sorted(by: >).first(where: { $0 < cursorColumn }) else {
                cursorColumn = 0
                return
            }
            cursorColumn = max(0, previousTabStop)
        }
    }

    private mutating func lineFeed() {
        let region = scrollRegion ?? TerminalScrollRegion(top: 0, bottom: rows - 1)
        if cursorRow == region.bottom {
            scrollUp(in: region)
        } else {
            cursorRow = min(rows - 1, cursorRow + 1)
        }
    }

    private mutating func scrollUp(in region: TerminalScrollRegion) {
        guard region.top < region.bottom else {
            cells[region.top] = Self.blankRow(columns: columns)
            return
        }
        for row in region.top..<region.bottom {
            cells[row] = cells[row + 1]
        }
        cells[region.bottom] = Self.blankRow(columns: columns)
    }

    private mutating func reverseIndex() {
        let region = scrollRegion ?? TerminalScrollRegion(top: 0, bottom: rows - 1)
        if cursorRow == region.top {
            scrollDown(in: region)
        } else {
            cursorRow = max(0, cursorRow - 1)
        }
    }

    private mutating func scrollDown(in region: TerminalScrollRegion) {
        guard region.top < region.bottom else {
            cells[region.top] = Self.blankRow(columns: columns)
            return
        }
        for row in stride(from: region.bottom, through: region.top + 1, by: -1) {
            cells[row] = cells[row - 1]
        }
        cells[region.top] = Self.blankRow(columns: columns)
    }

    private mutating func eraseDisplay(_ mode: TerminalEraseMode) {
        switch mode {
        case .toEnd:
            for column in cursorColumn..<columns {
                cells[cursorRow][column] = TerminalCell(attributes: currentAttributes)
            }
            if cursorRow + 1 < rows {
                for row in cursorRow + 1..<rows {
                    cells[row] = Self.blankRow(columns: columns, attributes: currentAttributes)
                }
            }
        case .toStart:
            if cursorRow > 0 {
                for row in 0..<cursorRow {
                    cells[row] = Self.blankRow(columns: columns, attributes: currentAttributes)
                }
            }
            for column in 0...cursorColumn {
                cells[cursorRow][column] = TerminalCell(attributes: currentAttributes)
            }
        case .all:
            cells = Self.blankCells(columns: columns, rows: rows, attributes: currentAttributes)
        }
    }

    private mutating func eraseLine(_ mode: TerminalEraseMode) {
        switch mode {
        case .toEnd:
            for column in cursorColumn..<columns {
                cells[cursorRow][column] = TerminalCell(attributes: currentAttributes)
            }
        case .toStart:
            for column in 0...cursorColumn {
                cells[cursorRow][column] = TerminalCell(attributes: currentAttributes)
            }
        case .all:
            cells[cursorRow] = Self.blankRow(columns: columns, attributes: currentAttributes)
        }
    }

    private mutating func eraseCharacters(_ count: Int) {
        let count = min(max(1, count), columns - cursorColumn)
        guard count > 0 else { return }
        for column in cursorColumn..<cursorColumn + count {
            cells[cursorRow][column] = TerminalCell(attributes: currentAttributes)
        }
    }

    private var cursorHomeRow: Int {
        originMode ? (scrollRegion?.top ?? 0) : 0
    }

    private var cursorRowBounds: ClosedRange<Int> {
        if originMode, let scrollRegion {
            return scrollRegion.top...scrollRegion.bottom
        }
        return 0...(rows - 1)
    }

    private mutating func saveCursor() {
        savedCursor = TerminalSavedCursor(
            column: cursorColumn,
            row: cursorRow,
            attributes: currentAttributes,
            characterSet: characterSet
        )
    }

    private mutating func restoreCursor() {
        guard let savedCursor else { return }
        cursorColumn = min(savedCursor.column, columns - 1)
        cursorRow = min(savedCursor.row, rows - 1)
        currentAttributes = savedCursor.attributes
        characterSet = savedCursor.characterSet
    }

    private mutating func insertLines(_ count: Int) {
        guard let region = activeRegionContainingCursor else { return }
        let count = min(max(1, count), region.bottom - cursorRow + 1)
        for row in stride(from: region.bottom, through: cursorRow + count, by: -1) {
            cells[row] = cells[row - count]
        }
        for row in cursorRow..<cursorRow + count {
            cells[row] = Self.blankRow(columns: columns)
        }
    }

    private mutating func deleteLines(_ count: Int) {
        guard let region = activeRegionContainingCursor else { return }
        let count = min(max(1, count), region.bottom - cursorRow + 1)
        for row in cursorRow...region.bottom {
            let source = row + count
            cells[row] = source <= region.bottom ? cells[source] : Self.blankRow(columns: columns)
        }
    }

    private mutating func scrollUp(_ count: Int) {
        let region = scrollRegion ?? TerminalScrollRegion(top: 0, bottom: rows - 1)
        let count = min(max(1, count), region.bottom - region.top + 1)
        for row in region.top...region.bottom {
            let source = row + count
            cells[row] = source <= region.bottom ? cells[source] : Self.blankRow(columns: columns)
        }
    }

    private mutating func scrollDown(_ count: Int) {
        let region = scrollRegion ?? TerminalScrollRegion(top: 0, bottom: rows - 1)
        let count = min(max(1, count), region.bottom - region.top + 1)
        for row in stride(from: region.bottom, through: region.top, by: -1) {
            let source = row - count
            cells[row] = source >= region.top ? cells[source] : Self.blankRow(columns: columns)
        }
    }

    private var activeRegionContainingCursor: TerminalScrollRegion? {
        let region = scrollRegion ?? TerminalScrollRegion(top: 0, bottom: rows - 1)
        guard cursorRow >= region.top, cursorRow <= region.bottom else { return nil }
        return region
    }

    private mutating func insertCharacters(_ count: Int) {
        let count = min(max(1, count), columns - cursorColumn)
        guard count > 0 else { return }
        for column in stride(from: columns - 1, through: cursorColumn + count, by: -1) {
            cells[cursorRow][column] = cells[cursorRow][column - count]
        }
        for column in cursorColumn..<cursorColumn + count {
            cells[cursorRow][column] = TerminalCell(attributes: currentAttributes)
        }
    }

    private mutating func deleteCharacters(_ count: Int) {
        let count = min(max(1, count), columns - cursorColumn)
        guard count > 0 else { return }
        for column in cursorColumn..<columns {
            let source = column + count
            cells[cursorRow][column] = source < columns ? cells[cursorRow][source] : TerminalCell(attributes: currentAttributes)
        }
    }

    private mutating func clearTabStops(_ mode: TerminalTabClearMode) {
        switch mode {
        case .current:
            tabStops.remove(cursorColumn)
        case .all:
            tabStops.removeAll()
        }
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

    private mutating func setScrollRegion(top: Int?, bottom: Int?) {
        if top == nil, bottom == nil {
            scrollRegion = nil
            cursorRow = cursorHomeRow
            cursorColumn = 0
            return
        }
        let top = top ?? 0
        let bottom = bottom ?? rows - 1
        guard top >= 0, bottom < rows, top < bottom else {
            scrollRegion = nil
            cursorRow = cursorHomeRow
            cursorColumn = 0
            return
        }
        scrollRegion = TerminalScrollRegion(top: top, bottom: bottom)
        cursorRow = cursorHomeRow
        cursorColumn = 0
    }

    private mutating func applyPrivateMode(_ mode: Int, enabled: Bool) {
        switch mode {
        case 47, 1047, 1049:
            if enabled {
                enterAlternateScreen()
            } else {
                exitAlternateScreen()
            }
        case 6:
            originMode = enabled
            cursorRow = cursorHomeRow
            cursorColumn = 0
        case 1:
            isApplicationCursorKeysModeEnabled = enabled
        case 7:
            isAutoWrapModeEnabled = enabled
        case 25:
            isCursorVisible = enabled
        case 2004:
            isBracketedPasteModeEnabled = enabled
        default:
            break
        }
    }

    private mutating func enterAlternateScreen() {
        if primarySnapshotBeforeAlternate == nil {
            primarySnapshotBeforeAlternate = TerminalScreenSnapshot(
                cells: cells,
                cursorColumn: cursorColumn,
                cursorRow: cursorRow,
                attributes: currentAttributes,
                scrollRegion: scrollRegion,
                originMode: originMode,
                savedCursor: savedCursor,
                tabStops: tabStops,
                characterSet: characterSet
            )
        }
        cells = Self.blankCells(columns: columns, rows: rows)
        cursorColumn = 0
        cursorRow = 0
        currentAttributes = TerminalTextAttributes()
        scrollRegion = nil
        originMode = false
        savedCursor = nil
        tabStops = Self.defaultTabStops(columns: columns)
        characterSet = .ascii
    }

    private mutating func exitAlternateScreen() {
        guard let snapshot = primarySnapshotBeforeAlternate else { return }
        cells = Self.resizedCells(snapshot.cells, columns: columns, rows: rows)
        cursorColumn = min(snapshot.cursorColumn, columns - 1)
        cursorRow = min(snapshot.cursorRow, rows - 1)
        currentAttributes = snapshot.attributes
        scrollRegion = snapshot.scrollRegion?.resized(toRows: rows)
        originMode = snapshot.originMode
        savedCursor = snapshot.savedCursor?.resized(columns: columns, rows: rows)
        tabStops = Set(snapshot.tabStops.filter { $0 < columns })
        characterSet = snapshot.characterSet
        primarySnapshotBeforeAlternate = nil
    }

    private static func blankCells(
        columns: Int,
        rows: Int,
        attributes: TerminalTextAttributes = TerminalTextAttributes()
    ) -> [[TerminalCell]] {
        Array(repeating: blankRow(columns: columns, attributes: attributes), count: rows)
    }

    private static func blankRow(
        columns: Int,
        attributes: TerminalTextAttributes = TerminalTextAttributes()
    ) -> [TerminalCell] {
        Array(repeating: TerminalCell(attributes: attributes), count: columns)
    }

    private static func defaultTabStops(columns: Int) -> Set<Int> {
        guard columns > 8 else { return [] }
        return Set(stride(from: 8, to: columns, by: 8))
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

    private mutating func consumePendingOperatingSystemCommandPrefix(from text: String) -> String? {
        guard operatingSystemCommandSkipState != .none else { return text }
        var index = text.startIndex
        if operatingSystemCommandSkipState == .sawEscape {
            guard index < text.endIndex else { return nil }
            if text[index] == "\\" {
                index = text.index(after: index)
                operatingSystemCommandSkipState = .none
                return String(text[index...])
            }
            operatingSystemCommandSkipState = .inside
        }
        while index < text.endIndex {
            guard let scalar = text[index].unicodeScalars.first else {
                index = text.index(after: index)
                continue
            }
            if scalar.value == 0x07 {
                index = text.index(after: index)
                operatingSystemCommandSkipState = .none
                return String(text[index...])
            }
            if scalar.value == 0x9C {
                index = text.index(after: index)
                operatingSystemCommandSkipState = .none
                return String(text[index...])
            }
            if scalar.value == 0x1B {
                index = text.index(after: index)
                guard index < text.endIndex else {
                    operatingSystemCommandSkipState = .sawEscape
                    return nil
                }
                if text[index] == "\\" {
                    index = text.index(after: index)
                    operatingSystemCommandSkipState = .none
                    return String(text[index...])
                }
                continue
            }
            index = text.index(after: index)
        }
        operatingSystemCommandSkipState = .inside
        return nil
    }
}

private enum TerminalToken {
    case ignored
    case reset
    case character(Character)
    case characterSet(TerminalCharacterSet)
    case lineFeed
    case reverseIndex
    case carriageReturn
    case backspace
    case horizontalTab
    case cursorForwardTab(Int)
    case cursorBackwardTab(Int)
    case eraseDisplay(TerminalEraseMode)
    case eraseLine(TerminalEraseMode)
    case eraseCharacters(Int)
    case cursorHome
    case cursorPosition(row: Int, column: Int)
    case cursorUp(Int)
    case cursorDown(Int)
    case cursorForward(Int)
    case cursorBackward(Int)
    case cursorNextLine(Int)
    case cursorPreviousLine(Int)
    case cursorHorizontalAbsolute(Int)
    case cursorVerticalAbsolute(Int)
    case saveCursor
    case restoreCursor
    case insertLines(Int)
    case deleteLines(Int)
    case scrollUp(Int)
    case scrollDown(Int)
    case insertCharacters(Int)
    case deleteCharacters(Int)
    case setHorizontalTabStop
    case clearTabStops(TerminalTabClearMode)
    case sgr([Int])
    case scrollRegion(top: Int?, bottom: Int?)
    case privateModes([Int], enabled: Bool)
}

private struct TerminalEscapeParser {
    private let text: String
    private var index: String.Index
    private var pendingTokens: [TerminalToken] = []
    private(set) var operatingSystemCommandSkipState = TerminalOperatingSystemCommandSkipState.none

    init(_ text: String) {
        self.text = text
        self.index = text.startIndex
    }

    mutating func nextToken() -> TerminalToken? {
        if pendingTokens.isEmpty == false {
            return pendingTokens.removeFirst()
        }
        guard index < text.endIndex else { return nil }
        let character = text[index]
        let scalarValues = character.unicodeScalars.map(\.value)
        if scalarValues == [0x0D, 0x0A] {
            index = text.index(after: index)
            pendingTokens.append(.lineFeed)
            return .carriageReturn
        }
        guard let scalar = text[index].unicodeScalars.first else { return nil }
        switch scalar.value {
        case 0x0A:
            advanceOneScalar()
            return .lineFeed
        case 0x0D:
            advanceOneScalar()
            return .carriageReturn
        case 0x08:
            advanceOneScalar()
            return .backspace
        case 0x09:
            advanceOneScalar()
            return .horizontalTab
        case 0x84:
            advanceOneScalar()
            return .lineFeed
        case 0x85:
            advanceOneScalar()
            pendingTokens.append(.lineFeed)
            return .carriageReturn
        case 0x88:
            advanceOneScalar()
            return .setHorizontalTabStop
        case 0x8D:
            advanceOneScalar()
            return .reverseIndex
        case 0x9B:
            advanceOneScalar()
            return parseControlSequenceIntroducer()
        case 0x9D:
            advanceOneScalar()
            operatingSystemCommandSkipState = consumeOperatingSystemCommand()
            return .ignored
        case 0x1B:
            advanceOneScalar()
            return parseEscape()
        default:
            index = text.index(after: index)
            return .character(character)
        }
    }

    private mutating func parseEscape() -> TerminalToken? {
        guard index < text.endIndex else { return nil }
        if text[index] == "M" {
            index = text.index(after: index)
            return .reverseIndex
        }
        if text[index] == "D" {
            index = text.index(after: index)
            return .lineFeed
        }
        if text[index] == "E" {
            index = text.index(after: index)
            pendingTokens.append(.lineFeed)
            return .carriageReturn
        }
        if text[index] == "H" {
            index = text.index(after: index)
            return .setHorizontalTabStop
        }
        if text[index] == "c" {
            index = text.index(after: index)
            return .reset
        }
        if text[index] == "7" {
            index = text.index(after: index)
            return .saveCursor
        }
        if text[index] == "8" {
            index = text.index(after: index)
            return .restoreCursor
        }
        if text[index] == "(" {
            index = text.index(after: index)
            return parseG0CharacterSet()
        }
        if text[index] == "]" {
            index = text.index(after: index)
            operatingSystemCommandSkipState = consumeOperatingSystemCommand()
            return .ignored
        }
        guard text[index] == "[" else { return nil }
        index = text.index(after: index)
        return parseControlSequenceIntroducer()
    }

    private mutating func parseControlSequenceIntroducer() -> TerminalToken? {
        var parameters = ""
        while index < text.endIndex {
            let character = text[index]
            index = text.index(after: index)
            guard let scalar = character.unicodeScalars.first else { continue }
            if scalar.value >= 0x40, scalar.value <= 0x7E {
                return csiToken(final: scalar, parameters: parameters)
            }
            parameters.append(character)
        }
        return nil
    }

    private mutating func advanceOneScalar() {
        guard let scalarIndex = index.samePosition(in: text.unicodeScalars) else {
            index = text.index(after: index)
            return
        }
        let nextScalarIndex = text.unicodeScalars.index(after: scalarIndex)
        index = nextScalarIndex.samePosition(in: text) ?? text.index(after: index)
    }

    private mutating func consumeOperatingSystemCommand() -> TerminalOperatingSystemCommandSkipState {
        while index < text.endIndex {
            guard let scalar = text[index].unicodeScalars.first else {
                index = text.index(after: index)
                continue
            }
            if scalar.value == 0x07 {
                advanceOneScalar()
                return .none
            }
            if scalar.value == 0x9C {
                advanceOneScalar()
                return .none
            }
            if scalar.value == 0x1B {
                advanceOneScalar()
                guard index < text.endIndex else { return .sawEscape }
                if index < text.endIndex, text[index] == "\\" {
                    index = text.index(after: index)
                    return .none
                }
                continue
            }
            index = text.index(after: index)
        }
        return .inside
    }

    private mutating func parseG0CharacterSet() -> TerminalToken? {
        guard index < text.endIndex else { return .ignored }
        let designator = text[index]
        index = text.index(after: index)
        switch designator {
        case "0":
            return .characterSet(.decSpecialGraphics)
        case "B":
            return .characterSet(.ascii)
        default:
            return .ignored
        }
    }

    private func csiToken(final: UnicodeScalar, parameters: String) -> TerminalToken? {
        let values = parameters
            .split(separator: ";", omittingEmptySubsequences: false)
            .map { Int($0) ?? 0 }
        let first = max(1, values.first ?? 1)

        switch final {
        case "@":
            return .insertCharacters(first)
        case "A":
            return .cursorUp(first)
        case "B":
            return .cursorDown(first)
        case "C":
            return .cursorForward(first)
        case "a":
            return .cursorForward(first)
        case "D":
            return .cursorBackward(first)
        case "E":
            return .cursorNextLine(first)
        case "e":
            return .cursorDown(first)
        case "F":
            return .cursorPreviousLine(first)
        case "G", "`":
            return .cursorHorizontalAbsolute(first - 1)
        case "d":
            return .cursorVerticalAbsolute(first - 1)
        case "H", "f":
            let row = max(1, values.first ?? 1) - 1
            let column = max(1, values.dropFirst().first ?? 1) - 1
            return values.isEmpty ? .cursorHome : .cursorPosition(row: row, column: column)
        case "I":
            return .cursorForwardTab(first)
        case "J":
            return eraseDisplayToken(values: values)
        case "K":
            return eraseLineToken(values: values)
        case "L":
            return .insertLines(first)
        case "M":
            return .deleteLines(first)
        case "P":
            return .deleteCharacters(first)
        case "S":
            return .scrollUp(first)
        case "T":
            return .scrollDown(first)
        case "X":
            return .eraseCharacters(first)
        case "Z":
            return .cursorBackwardTab(first)
        case "g":
            return tabClearToken(values: values)
        case "s":
            return .saveCursor
        case "u":
            return .restoreCursor
        case "m":
            return .sgr(values)
        case "r":
            return scrollRegionToken(parameters: parameters)
        case "h", "l":
            return privateModesToken(parameters: parameters, enabled: final == "h")
        default:
            return nil
        }
    }

    private func scrollRegionToken(parameters: String) -> TerminalToken {
        guard parameters.isEmpty == false else {
            return .scrollRegion(top: nil, bottom: nil)
        }
        let parts = parameters.split(separator: ";", omittingEmptySubsequences: false)
        let top = parts.first.flatMap { Int($0) }.map { max(1, $0) - 1 }
        let bottom = parts.dropFirst().first.flatMap { Int($0) }.map { max(1, $0) - 1 }
        return .scrollRegion(top: top, bottom: bottom)
    }

    private func privateModesToken(parameters: String, enabled: Bool) -> TerminalToken? {
        guard parameters.hasPrefix("?") else { return nil }
        let modes = parameters
            .dropFirst()
            .split(separator: ";")
            .compactMap { Int($0) }
        guard modes.isEmpty == false else { return nil }
        return .privateModes(modes, enabled: enabled)
    }

    private func tabClearToken(values: [Int]) -> TerminalToken? {
        switch values.first ?? 0 {
        case 0:
            return .clearTabStops(.current)
        case 3:
            return .clearTabStops(.all)
        default:
            return nil
        }
    }

    private func eraseDisplayToken(values: [Int]) -> TerminalToken? {
        TerminalEraseMode(rawValue: values.first ?? 0).map { .eraseDisplay($0) }
    }

    private func eraseLineToken(values: [Int]) -> TerminalToken? {
        TerminalEraseMode(rawValue: values.first ?? 0).map { .eraseLine($0) }
    }
}

private enum TerminalOperatingSystemCommandSkipState {
    case none
    case inside
    case sawEscape
}

private enum TerminalCharacterSet: Equatable {
    case ascii
    case decSpecialGraphics

    func mapped(_ character: Character) -> Character {
        guard self == .decSpecialGraphics else { return character }
        switch character {
        case "`":
            return "◆"
        case "a":
            return "▒"
        case "f":
            return "°"
        case "g":
            return "±"
        case "h":
            return "␤"
        case "i":
            return "␋"
        case "j":
            return "┘"
        case "k":
            return "┐"
        case "l":
            return "┌"
        case "m":
            return "└"
        case "n":
            return "┼"
        case "o":
            return "⎺"
        case "p":
            return "⎻"
        case "q":
            return "─"
        case "r":
            return "⎼"
        case "s":
            return "⎽"
        case "t":
            return "├"
        case "u":
            return "┤"
        case "v":
            return "┴"
        case "w":
            return "┬"
        case "x":
            return "│"
        case "y":
            return "≤"
        case "z":
            return "≥"
        case "{":
            return "π"
        case "|":
            return "≠"
        case "}":
            return "£"
        case "~":
            return "·"
        default:
            return character
        }
    }
}

private enum TerminalTabClearMode {
    case current
    case all
}

private enum TerminalEraseMode {
    case toEnd
    case toStart
    case all

    init?(rawValue: Int) {
        switch rawValue {
        case 0:
            self = .toEnd
        case 1:
            self = .toStart
        case 2:
            self = .all
        default:
            return nil
        }
    }
}

private struct TerminalCell: Equatable {
    var character: Character
    var attributes: TerminalTextAttributes
    var isContinuation: Bool

    init(
        character: Character = " ",
        attributes: TerminalTextAttributes = TerminalTextAttributes(),
        isContinuation: Bool = false
    ) {
        self.character = character
        self.attributes = attributes
        self.isContinuation = isContinuation
    }
}

private struct TerminalScreenSnapshot: Equatable {
    var cells: [[TerminalCell]]
    var cursorColumn: Int
    var cursorRow: Int
    var attributes: TerminalTextAttributes
    var scrollRegion: TerminalScrollRegion?
    var originMode: Bool
    var savedCursor: TerminalSavedCursor?
    var tabStops: Set<Int>
    var characterSet: TerminalCharacterSet
}

private struct TerminalSavedCursor: Equatable {
    var column: Int
    var row: Int
    var attributes: TerminalTextAttributes
    var characterSet: TerminalCharacterSet

    func resized(columns: Int, rows: Int) -> TerminalSavedCursor {
        TerminalSavedCursor(
            column: min(column, columns - 1),
            row: min(row, rows - 1),
            attributes: attributes,
            characterSet: characterSet
        )
    }
}

private struct TerminalScrollRegion: Equatable {
    var top: Int
    var bottom: Int

    func resized(toRows rows: Int) -> TerminalScrollRegion? {
        let maxRow = max(0, rows - 1)
        let nextTop = min(top, maxRow)
        let nextBottom = min(bottom, maxRow)
        guard nextTop < nextBottom else { return nil }
        return TerminalScrollRegion(top: nextTop, bottom: nextBottom)
    }
}

private extension Array where Element == TerminalCell {
    func trimmingRightSpaces() -> [TerminalCell] {
        var value = self
        while value.last?.isBlankForTrimming == true {
            value.removeLast()
        }
        return value
    }

    func groupedRuns() -> [TerminalScreenRun] {
        var runs: [TerminalScreenRun] = []
        var text = ""
        var attributes = first?.attributes ?? TerminalTextAttributes()

        for cell in self {
            if cell.isContinuation {
                continue
            }
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

private extension TerminalCell {
    var isBlankForTrimming: Bool {
        isContinuation || character == " "
    }
}

private extension Character {
    var terminalCellWidth: Int {
        let scalars = unicodeScalars
        if scalars.allSatisfy(\.isCombiningMark) {
            return 0
        }
        if scalars.contains(where: \.isWideTerminalScalar) {
            return 2
        }
        return 1
    }
}

private extension UnicodeScalar {
    var isCombiningMark: Bool {
        properties.generalCategory == .nonspacingMark ||
            properties.generalCategory == .enclosingMark ||
            properties.generalCategory == .spacingMark
    }

    var isWideTerminalScalar: Bool {
        switch value {
        case 0x1100...0x115F,
             0x2329...0x232A,
             0x2E80...0xA4CF,
             0xAC00...0xD7A3,
             0xF900...0xFAFF,
             0xFE10...0xFE19,
             0xFE30...0xFE6F,
             0xFF00...0xFF60,
             0xFFE0...0xFFE6,
             0x1F300...0x1FAFF,
             0x20000...0x3FFFD:
            return true
        default:
            return false
        }
    }
}
