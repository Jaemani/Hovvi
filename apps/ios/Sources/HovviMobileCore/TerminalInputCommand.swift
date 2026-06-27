import Foundation

public enum TerminalInputCommand: Equatable, Sendable {
    case text(String)
    case paste(String, bracketed: Bool)
    case carriageReturn
    case tab
    case escape
    case interrupt
    case backspace
    case arrowUp
    case arrowDown
    case arrowRight
    case arrowLeft
    case home
    case end
    case pageUp
    case pageDown
    case deleteForward

    public static func userText(_ text: String, bracketedPasteEnabled: Bool) -> TerminalInputCommand {
        if text.contains(where: \.isNewline) {
            return .paste(text, bracketed: bracketedPasteEnabled)
        }
        return .text(text)
    }

    public var bytes: Data {
        bytes(applicationCursorKeysMode: false)
    }

    public func bytes(applicationCursorKeysMode: Bool) -> Data {
        switch self {
        case .text(let text):
            return Data(text.utf8)
        case .paste(let text, bracketed: false):
            return Data(text.utf8)
        case .paste(let text, bracketed: true):
            return Data("\u{001B}[200~\(text)\u{001B}[201~".utf8)
        case .carriageReturn:
            return Data([0x0D])
        case .tab:
            return Data([0x09])
        case .escape:
            return Data([0x1B])
        case .interrupt:
            return Data([0x03])
        case .backspace:
            return Data([0x7F])
        case .arrowUp:
            return Data((applicationCursorKeysMode ? "\u{001B}OA" : "\u{001B}[A").utf8)
        case .arrowDown:
            return Data((applicationCursorKeysMode ? "\u{001B}OB" : "\u{001B}[B").utf8)
        case .arrowRight:
            return Data((applicationCursorKeysMode ? "\u{001B}OC" : "\u{001B}[C").utf8)
        case .arrowLeft:
            return Data((applicationCursorKeysMode ? "\u{001B}OD" : "\u{001B}[D").utf8)
        case .home:
            return Data("\u{001B}[H".utf8)
        case .end:
            return Data("\u{001B}[F".utf8)
        case .pageUp:
            return Data("\u{001B}[5~".utf8)
        case .pageDown:
            return Data("\u{001B}[6~".utf8)
        case .deleteForward:
            return Data("\u{001B}[3~".utf8)
        }
    }
}
