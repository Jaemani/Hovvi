import Foundation

public enum TerminalInputCommand: Equatable, Sendable {
    case text(String)
    case paste(String, bracketed: Bool)
    case carriageReturn
    case tab
    case escape
    case interrupt
    case backspace

    public var bytes: Data {
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
        }
    }
}
