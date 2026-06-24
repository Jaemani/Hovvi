import Foundation

public struct ScrollbackLine: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let index: Int
    public let text: String

    public init(index: Int, text: String) {
        self.id = "line-\(index)"
        self.index = index
        self.text = text
    }
}

public struct ScrollbackBuffer: Equatable, Sendable {
    public private(set) var sessionName: String
    public let maxLines: Int
    public private(set) var lines: [ScrollbackLine]

    private var nextIndex: Int
    private var pendingFragment: String

    public init(sessionName: String, text: String = "", maxLines: Int = 50000) {
        self.sessionName = sessionName
        self.maxLines = Swift.max(1, maxLines)
        self.lines = []
        self.nextIndex = 0
        self.pendingFragment = ""
        appendSnapshot(text)
    }

    public init(result: ScrollbackResult, maxLines: Int = 50000) {
        self.init(sessionName: result.sessionName, text: result.text, maxLines: maxLines)
    }

    public var pendingText: String {
        pendingFragment
    }

    public var isEmpty: Bool {
        lines.isEmpty && pendingFragment.isEmpty
    }

    public var visibleLines: [ScrollbackLine] {
        guard pendingFragment.isEmpty == false else { return lines }
        let retainedCount = Swift.max(0, maxLines - 1)
        let retainedLines = lines.count > retainedCount ? Array(lines.suffix(retainedCount)) : lines
        return retainedLines + [ScrollbackLine(index: nextIndex, text: pendingFragment)]
    }

    public mutating func replace(with result: ScrollbackResult) {
        sessionName = result.sessionName
        lines.removeAll(keepingCapacity: true)
        nextIndex = 0
        pendingFragment = ""
        appendSnapshot(result.text)
    }

    public mutating func appendPlainText(_ text: String) {
        appendStreamingText(text)
    }

    private mutating func appendSnapshot(_ text: String) {
        let normalized = normalizeLineEndings(text)
        var snapshotLines = normalized.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        if normalized.hasSuffix("\n") {
            snapshotLines.removeLast()
        }
        for line in snapshotLines {
            appendCompleteLine(line)
        }
        pendingFragment = ""
        trimIfNeeded()
    }

    private mutating func appendStreamingText(_ text: String) {
        let normalized = normalizeLineEndings(text)
        guard normalized.isEmpty == false else { return }

        let parts = normalized.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        guard parts.isEmpty == false else { return }

        if parts.count == 1 && normalized.hasSuffix("\n") == false {
            pendingFragment += parts[0]
            return
        }

        var completeLines = parts
        if normalized.hasSuffix("\n") {
            completeLines.removeLast()
            pendingFragment += completeLines.removeFirst()
            appendCompleteLine(pendingFragment)
            pendingFragment = ""
        } else {
            pendingFragment += completeLines.removeFirst()
            appendCompleteLine(pendingFragment)
            pendingFragment = completeLines.removeLast()
        }

        for line in completeLines {
            appendCompleteLine(line)
        }
        trimIfNeeded()
    }

    private mutating func appendCompleteLine(_ text: String) {
        lines.append(ScrollbackLine(index: nextIndex, text: text))
        nextIndex += 1
    }

    private mutating func trimIfNeeded() {
        guard maxLines > 0, lines.count > maxLines else { return }
        lines.removeFirst(lines.count - maxLines)
    }

    private func normalizeLineEndings(_ text: String) -> String {
        text.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
    }
}
