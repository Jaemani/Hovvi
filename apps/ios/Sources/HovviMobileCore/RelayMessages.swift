import Foundation

public struct HelloPayload: Codable, Equatable, Sendable {
    public let role: String
    public let token: String
    public let clientId: String?

    public init(role: String = "client", token: String, clientId: String? = nil) {
        self.role = role
        self.token = token
        self.clientId = clientId
    }
}

public struct PrepareAttachRequest: Codable, Equatable, Sendable {
    public let deviceId: String
    public let sessionName: String
    public let lines: Int
    public let create: Bool

    public init(deviceId: String, sessionName: String = "main", lines: Int = 2000, create: Bool = false) {
        self.deviceId = deviceId
        self.sessionName = sessionName
        self.lines = lines
        self.create = create
    }
}

public struct FetchScrollbackRequest: Codable, Equatable, Sendable {
    public let deviceId: String
    public let sessionName: String
    public let lines: Int

    public init(deviceId: String, sessionName: String = "main", lines: Int = 2000) {
        self.deviceId = deviceId
        self.sessionName = sessionName
        self.lines = lines
    }
}

public struct RequestErrorPayload: Codable, Error, Equatable, Sendable {
    public let requestId: String?
    public let code: String?
    public let field: String?
    public let message: String

    public init(requestId: String? = nil, code: String? = nil, field: String? = nil, message: String) {
        self.requestId = requestId
        self.code = code
        self.field = field
        self.message = message
    }
}

public enum IncomingRelayMessage: Equatable, Sendable {
    case helloOK(RawEnvelope)
    case devicesSnapshot(Envelope<DevicesSnapshot>)
    case attachReady(Envelope<AttachReady>)
    case attachError(Envelope<RequestErrorPayload>)
    case scrollbackReady(Envelope<ScrollbackReady>)
    case scrollbackError(Envelope<RequestErrorPayload>)
    case relayError(Envelope<RequestErrorPayload>)
    case unknown(RawEnvelope)
}

public enum OutgoingRelayMessage {
    public static func helloEnvelope(token: String, clientId: String? = nil) -> Envelope<HelloPayload> {
        Envelope(type: "hello", payload: HelloPayload(token: token, clientId: clientId))
    }

    public static func hello(token: String, clientId: String? = nil) throws -> Data {
        try HovviCoding.encodeEnvelope(helloEnvelope(token: token, clientId: clientId))
    }

    public static func devicesListEnvelope() -> Envelope<EmptyPayload> {
        Envelope(type: "devices.list", payload: EmptyPayload())
    }

    public static func devicesList() throws -> Data {
        try HovviCoding.encodeEnvelope(devicesListEnvelope())
    }

    public static func prepareAttachEnvelope(
        deviceId: String,
        sessionName: String = "main",
        lines: Int = 2000,
        create: Bool = false
    ) -> Envelope<PrepareAttachRequest> {
        Envelope(
            type: "session.attach.prepare",
            payload: PrepareAttachRequest(deviceId: deviceId, sessionName: sessionName, lines: lines, create: create)
        )
    }

    public static func prepareAttach(
        deviceId: String,
        sessionName: String = "main",
        lines: Int = 2000,
        create: Bool = false
    ) throws -> Data {
        try HovviCoding.encodeEnvelope(
            prepareAttachEnvelope(deviceId: deviceId, sessionName: sessionName, lines: lines, create: create)
        )
    }

    public static func fetchScrollbackEnvelope(
        deviceId: String,
        sessionName: String = "main",
        lines: Int = 2000
    ) -> Envelope<FetchScrollbackRequest> {
        Envelope(
            type: "session.scrollback.fetch",
            payload: FetchScrollbackRequest(deviceId: deviceId, sessionName: sessionName, lines: lines)
        )
    }

    public static func fetchScrollback(deviceId: String, sessionName: String = "main", lines: Int = 2000) throws -> Data {
        try HovviCoding.encodeEnvelope(
            fetchScrollbackEnvelope(deviceId: deviceId, sessionName: sessionName, lines: lines)
        )
    }
}

public func decodeIncomingRelayMessage(from data: Data) throws -> IncomingRelayMessage {
    let raw = try HovviCoding.decode(RawEnvelope.self, from: data)
    guard raw.version == hovviProtocolVersion else {
        throw HovviProtocolError.unsupportedVersion(raw.version)
    }

    switch raw.type {
    case "hello.ok":
        return .helloOK(raw)
    case "devices.snapshot":
        return .devicesSnapshot(try decodeEnvelope(DevicesSnapshot.self, from: data, expectedType: raw.type))
    case "session.attach.ready":
        return .attachReady(try decodeEnvelope(AttachReady.self, from: data, expectedType: raw.type))
    case "session.attach.error":
        return .attachError(try decodeEnvelope(RequestErrorPayload.self, from: data, expectedType: raw.type))
    case "session.scrollback.ready":
        return .scrollbackReady(try decodeEnvelope(ScrollbackReady.self, from: data, expectedType: raw.type))
    case "session.scrollback.error":
        return .scrollbackError(try decodeEnvelope(RequestErrorPayload.self, from: data, expectedType: raw.type))
    case "error":
        return .relayError(try decodeEnvelope(RequestErrorPayload.self, from: data, expectedType: raw.type))
    default:
        return .unknown(raw)
    }
}
