import Foundation

public enum RelayResponseMatcher {
    public static func devices(from message: IncomingRelayMessage) throws -> [Device]? {
        switch message {
        case .devicesSnapshot(let envelope):
            return envelope.payload.devices
        case .relayError(let envelope):
            throw RelayClientError.requestFailed(envelope.payload)
        default:
            return nil
        }
    }

    public static func attachManifest(requestId: String, from message: IncomingRelayMessage) throws -> AttachManifest? {
        switch message {
        case .attachReady(let envelope) where envelope.payload.requestId == requestId:
            return envelope.payload.manifest
        case .attachError(let envelope) where envelope.payload.requestId == requestId:
            throw RelayClientError.requestFailed(envelope.payload)
        case .relayError(let envelope):
            throw RelayClientError.requestFailed(envelope.payload)
        default:
            return nil
        }
    }

    public static func scrollbackResult(requestId: String, from message: IncomingRelayMessage) throws -> ScrollbackResult? {
        switch message {
        case .scrollbackReady(let envelope) where envelope.payload.requestId == requestId:
            return ScrollbackResult(
                sessionName: envelope.payload.sessionName,
                lines: envelope.payload.lines,
                text: envelope.payload.text
            )
        case .scrollbackError(let envelope) where envelope.payload.requestId == requestId:
            throw RelayClientError.requestFailed(envelope.payload)
        case .relayError(let envelope):
            throw RelayClientError.requestFailed(envelope.payload)
        default:
            return nil
        }
    }
}
