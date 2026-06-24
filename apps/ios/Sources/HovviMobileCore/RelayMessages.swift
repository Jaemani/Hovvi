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
    case forwardReady(Envelope<ForwardReady>)
    case forwardData(Envelope<ForwardDataFrame>)
    case forwardEnd(Envelope<ForwardEnd>)
    case forwardError(Envelope<ForwardErrorPayload>)
    case datagramReady(Envelope<DatagramReady>)
    case datagramData(Envelope<DatagramDataFrame>)
    case datagramClose(Envelope<DatagramClose>)
    case datagramError(Envelope<DatagramErrorPayload>)
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

    public static func forwardOpenEnvelope(
        deviceId: String,
        streamId: String = makeStreamId(),
        remoteHost: String? = nil,
        remotePort: Int? = nil
    ) -> Envelope<ForwardOpenRequest> {
        Envelope(
            type: "forward.open",
            payload: ForwardOpenRequest(
                streamId: streamId,
                deviceId: deviceId,
                remoteHost: remoteHost,
                remotePort: remotePort
            )
        )
    }

    public static func forwardOpen(
        deviceId: String,
        streamId: String = makeStreamId(),
        remoteHost: String? = nil,
        remotePort: Int? = nil
    ) throws -> Data {
        try HovviCoding.encodeEnvelope(
            forwardOpenEnvelope(deviceId: deviceId, streamId: streamId, remoteHost: remoteHost, remotePort: remotePort)
        )
    }

    public static func forwardDataEnvelope(streamId: String, bytes: Data) -> Envelope<ForwardDataFrame> {
        Envelope(type: "forward.data", payload: ForwardDataFrame(streamId: streamId, bytes: bytes))
    }

    public static func forwardData(streamId: String, bytes: Data) throws -> Data {
        try HovviCoding.encodeEnvelope(forwardDataEnvelope(streamId: streamId, bytes: bytes))
    }

    public static func forwardEndEnvelope(streamId: String) -> Envelope<ForwardEnd> {
        Envelope(type: "forward.end", payload: ForwardEnd(streamId: streamId))
    }

    public static func forwardEnd(streamId: String) throws -> Data {
        try HovviCoding.encodeEnvelope(forwardEndEnvelope(streamId: streamId))
    }

    public static func datagramOpenEnvelope(
        deviceId: String,
        channelId: String = makeDatagramChannelId(),
        label: String? = nil,
        maxDatagramBytes: Int? = nil
    ) -> Envelope<DatagramOpenRequest> {
        Envelope(
            type: "datagram.open",
            payload: DatagramOpenRequest(
                channelId: channelId,
                deviceId: deviceId,
                label: label,
                maxDatagramBytes: maxDatagramBytes
            )
        )
    }

    public static func datagramOpen(
        deviceId: String,
        channelId: String = makeDatagramChannelId(),
        label: String? = nil,
        maxDatagramBytes: Int? = nil
    ) throws -> Data {
        try HovviCoding.encodeEnvelope(
            datagramOpenEnvelope(
                deviceId: deviceId,
                channelId: channelId,
                label: label,
                maxDatagramBytes: maxDatagramBytes
            )
        )
    }

    public static func datagramDataEnvelope(
        channelId: String,
        bytes: Data,
        sequence: Int? = nil
    ) -> Envelope<DatagramDataFrame> {
        Envelope(type: "datagram.data", payload: DatagramDataFrame(channelId: channelId, bytes: bytes, sequence: sequence))
    }

    public static func datagramData(channelId: String, bytes: Data, sequence: Int? = nil) throws -> Data {
        try HovviCoding.encodeEnvelope(datagramDataEnvelope(channelId: channelId, bytes: bytes, sequence: sequence))
    }

    public static func datagramCloseEnvelope(channelId: String) -> Envelope<DatagramClose> {
        Envelope(type: "datagram.close", payload: DatagramClose(channelId: channelId))
    }

    public static func datagramClose(channelId: String) throws -> Data {
        try HovviCoding.encodeEnvelope(datagramCloseEnvelope(channelId: channelId))
    }

    public static func makeStreamId() -> String {
        "str_" + UUID().uuidString.replacingOccurrences(of: "-", with: "")
    }

    public static func makeDatagramChannelId() -> String {
        "dg_" + UUID().uuidString.replacingOccurrences(of: "-", with: "")
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
    case "forward.ready":
        return .forwardReady(try decodeEnvelope(ForwardReady.self, from: data, expectedType: raw.type))
    case "forward.data":
        return .forwardData(try decodeEnvelope(ForwardDataFrame.self, from: data, expectedType: raw.type))
    case "forward.end":
        return .forwardEnd(try decodeEnvelope(ForwardEnd.self, from: data, expectedType: raw.type))
    case "forward.error":
        return .forwardError(try decodeEnvelope(ForwardErrorPayload.self, from: data, expectedType: raw.type))
    case "datagram.ready":
        return .datagramReady(try decodeEnvelope(DatagramReady.self, from: data, expectedType: raw.type))
    case "datagram.data":
        return .datagramData(try decodeEnvelope(DatagramDataFrame.self, from: data, expectedType: raw.type))
    case "datagram.close":
        return .datagramClose(try decodeEnvelope(DatagramClose.self, from: data, expectedType: raw.type))
    case "datagram.error":
        return .datagramError(try decodeEnvelope(DatagramErrorPayload.self, from: data, expectedType: raw.type))
    case "error":
        return .relayError(try decodeEnvelope(RequestErrorPayload.self, from: data, expectedType: raw.type))
    default:
        return .unknown(raw)
    }
}
