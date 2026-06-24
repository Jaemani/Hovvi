import Foundation

public actor RelayClient {
    public let url: URL
    public let token: String
    public let clientId: String?

    private var task: URLSessionWebSocketTask?

    public init(url: URL, token: String, clientId: String? = nil) {
        self.url = url
        self.token = token
        self.clientId = clientId
    }

    public func connect() async throws {
        guard task == nil else { return }
        let task = URLSession.shared.webSocketTask(with: url)
        task.resume()
        self.task = task
        try await sendRaw(OutgoingRelayMessage.hello(token: token, clientId: clientId))
    }

    public func disconnect() {
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
    }

    public func requestDevices() async throws {
        try await sendRaw(OutgoingRelayMessage.devicesList())
    }

    public func prepareAttach(
        deviceId: String,
        sessionName: String = "main",
        lines: Int = 2000,
        create: Bool = false
    ) async throws {
        try await sendRaw(
            OutgoingRelayMessage.prepareAttach(
                deviceId: deviceId,
                sessionName: sessionName,
                lines: lines,
                create: create
            )
        )
    }

    public func fetchScrollback(deviceId: String, sessionName: String = "main", lines: Int = 2000) async throws {
        try await sendRaw(
            OutgoingRelayMessage.fetchScrollback(deviceId: deviceId, sessionName: sessionName, lines: lines)
        )
    }

    public func receive() async throws -> IncomingRelayMessage {
        guard let task else { throw RelayClientError.notConnected }
        let message = try await task.receive()

        switch message {
        case .data(let data):
            return try decodeIncomingRelayMessage(from: data)
        case .string(let text):
            guard let data = text.data(using: .utf8) else {
                throw RelayClientError.invalidTextFrame
            }
            return try decodeIncomingRelayMessage(from: data)
        @unknown default:
            throw RelayClientError.unsupportedFrame
        }
    }

    private func sendRaw(_ data: Data) async throws {
        guard let task else { throw RelayClientError.notConnected }
        try await task.send(.data(data))
    }
}

public enum RelayClientError: Error, Equatable {
    case notConnected
    case invalidTextFrame
    case unsupportedFrame
}
