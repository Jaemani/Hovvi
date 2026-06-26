import Foundation

public let hovviProtocolVersion = 1

public struct Envelope<Payload: Codable> {
    public let version: Int
    public let type: String
    public let id: String
    public let sentAt: Date
    public let payload: Payload

    public init(type: String, id: String = UUID().uuidString, sentAt: Date = Date(), payload: Payload) {
        self.version = hovviProtocolVersion
        self.type = type
        self.id = id
        self.sentAt = sentAt
        self.payload = payload
    }
}

extension Envelope: Equatable where Payload: Equatable {}
extension Envelope: Sendable where Payload: Sendable {}

public struct EmptyPayload: Codable, Equatable, Sendable {
    public init() {}
}

public struct Device: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let name: String?
    public let platform: String?
    public let user: String?
    public let capabilities: [String]
    public let lastSeenAt: Date?
    public let sessions: [Session]

    public init(
        id: String,
        name: String? = nil,
        platform: String? = nil,
        user: String? = nil,
        capabilities: [String] = [],
        lastSeenAt: Date? = nil,
        sessions: [Session] = []
    ) {
        self.id = id
        self.name = name
        self.platform = platform
        self.user = user
        self.capabilities = capabilities
        self.lastSeenAt = lastSeenAt
        self.sessions = sessions
    }
}

public struct Session: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let name: String
    public let kind: String
    public let attached: Bool?
    public let windows: Int?
    public let aiPanes: [Pane]

    public init(id: String, name: String, kind: String, attached: Bool? = nil, windows: Int? = nil, aiPanes: [Pane] = []) {
        self.id = id
        self.name = name
        self.kind = kind
        self.attached = attached
        self.windows = windows
        self.aiPanes = aiPanes
    }
}

public struct Pane: Codable, Equatable, Identifiable, Sendable {
    public var id: String { paneId }
    public let paneId: String
    public let command: String
    public let cwd: String?
    public let title: String?

    public init(paneId: String, command: String, cwd: String? = nil, title: String? = nil) {
        self.paneId = paneId
        self.command = command
        self.cwd = cwd
        self.title = title
    }
}

public struct DevicesSnapshot: Codable, Equatable, Sendable {
    public let devices: [Device]

    public init(devices: [Device]) {
        self.devices = devices
    }
}

public struct AttachReady: Codable, Equatable, Sendable {
    public let requestId: String
    public let manifest: AttachManifest

    public init(requestId: String, manifest: AttachManifest) {
        self.requestId = requestId
        self.manifest = manifest
    }
}

public struct AttachManifest: Codable, Equatable, Sendable {
    public let kind: String
    public let version: Int
    public let deviceId: String?
    public let deviceName: String?
    public let sessionName: String
    public let user: String
    public let methods: [AttachMethod]
    public let scrollback: ScrollbackSource
    public let controlMode: ControlModeSource

    public init(
        kind: String,
        version: Int,
        deviceId: String?,
        deviceName: String?,
        sessionName: String,
        user: String,
        methods: [AttachMethod],
        scrollback: ScrollbackSource,
        controlMode: ControlModeSource
    ) {
        self.kind = kind
        self.version = version
        self.deviceId = deviceId
        self.deviceName = deviceName
        self.sessionName = sessionName
        self.user = user
        self.methods = methods
        self.scrollback = scrollback
        self.controlMode = controlMode
    }
}

public struct AttachMethod: Codable, Equatable, Sendable {
    public let name: String
    public let priority: Int
    public let status: String
    public let command: [String]
    public let transport: AttachTransport?
    public let notes: String?

    public init(
        name: String,
        priority: Int,
        status: String,
        command: [String],
        transport: AttachTransport? = nil,
        notes: String? = nil
    ) {
        self.name = name
        self.priority = priority
        self.status = status
        self.command = command
        self.transport = transport
        self.notes = notes
    }
}

public struct AttachTransport: Codable, Equatable, Sendable {
    public let kind: String
    public let label: String?
    public let remoteHost: String?
    public let remotePort: Int?
    public let key: String?
    public let maxDatagramBytes: Int?

    public init(
        kind: String,
        label: String? = nil,
        remoteHost: String? = nil,
        remotePort: Int? = nil,
        key: String? = nil,
        maxDatagramBytes: Int? = nil
    ) {
        self.kind = kind
        self.label = label
        self.remoteHost = remoteHost
        self.remotePort = remotePort
        self.key = key
        self.maxDatagramBytes = maxDatagramBytes
    }
}

public struct ScrollbackSource: Codable, Equatable, Sendable {
    public let source: String
    public let command: [String]
    public let lines: Int

    public init(source: String, command: [String], lines: Int) {
        self.source = source
        self.command = command
        self.lines = lines
    }
}

public struct ControlModeSource: Codable, Equatable, Sendable {
    public let source: String
    public let command: [String]

    public init(source: String, command: [String]) {
        self.source = source
        self.command = command
    }
}

public struct ScrollbackReady: Codable, Equatable, Sendable {
    public let requestId: String
    public let sessionName: String
    public let lines: Int
    public let text: String

    public init(requestId: String, sessionName: String, lines: Int, text: String) {
        self.requestId = requestId
        self.sessionName = sessionName
        self.lines = lines
        self.text = text
    }
}

public struct ScrollbackResult: Codable, Equatable, Sendable {
    public let sessionName: String
    public let lines: Int
    public let text: String

    public init(sessionName: String, lines: Int, text: String) {
        self.sessionName = sessionName
        self.lines = lines
        self.text = text
    }
}

public struct ForwardOpenRequest: Codable, Equatable, Sendable {
    public let streamId: String
    public let deviceId: String
    public let remoteHost: String?
    public let remotePort: Int?

    public init(streamId: String, deviceId: String, remoteHost: String? = nil, remotePort: Int? = nil) {
        self.streamId = streamId
        self.deviceId = deviceId
        self.remoteHost = remoteHost
        self.remotePort = remotePort
    }
}

public struct ForwardReady: Codable, Equatable, Sendable {
    public let streamId: String

    public init(streamId: String) {
        self.streamId = streamId
    }
}

public struct ForwardEnd: Codable, Equatable, Sendable {
    public let streamId: String

    public init(streamId: String) {
        self.streamId = streamId
    }
}

public struct ForwardDataFrame: Codable, Equatable, Sendable {
    public let streamId: String
    public let data: String

    public init(streamId: String, data: String) {
        self.streamId = streamId
        self.data = data
    }

    public init(streamId: String, bytes: Data) {
        self.streamId = streamId
        self.data = bytes.base64EncodedString()
    }

    public var bytes: Data? {
        Data(base64Encoded: data)
    }
}

public struct ForwardErrorPayload: Codable, Error, Equatable, Sendable {
    public let streamId: String
    public let message: String?

    public init(streamId: String, message: String? = nil) {
        self.streamId = streamId
        self.message = message
    }
}

public enum RelayForwardFrame: Equatable, Sendable {
    case data(Data)
    case end
}

public struct DatagramOpenRequest: Codable, Equatable, Sendable {
    public let channelId: String
    public let deviceId: String
    public let label: String?
    public let remoteHost: String?
    public let remotePort: Int?
    public let maxDatagramBytes: Int?

    public init(
        channelId: String,
        deviceId: String,
        label: String? = nil,
        remoteHost: String? = nil,
        remotePort: Int? = nil,
        maxDatagramBytes: Int? = nil
    ) {
        self.channelId = channelId
        self.deviceId = deviceId
        self.label = label
        self.remoteHost = remoteHost
        self.remotePort = remotePort
        self.maxDatagramBytes = maxDatagramBytes
    }
}

public struct DatagramReady: Codable, Equatable, Sendable {
    public let channelId: String

    public init(channelId: String) {
        self.channelId = channelId
    }
}

public struct DatagramClose: Codable, Equatable, Sendable {
    public let channelId: String

    public init(channelId: String) {
        self.channelId = channelId
    }
}

public struct DatagramDataFrame: Codable, Equatable, Sendable {
    public let channelId: String
    public let data: String
    public let sequence: Int?

    public init(channelId: String, data: String, sequence: Int? = nil) {
        self.channelId = channelId
        self.data = data
        self.sequence = sequence
    }

    public init(channelId: String, bytes: Data, sequence: Int? = nil) {
        self.channelId = channelId
        self.data = bytes.base64EncodedString()
        self.sequence = sequence
    }

    public var bytes: Data? {
        Data(base64Encoded: data)
    }
}

public struct DatagramErrorPayload: Codable, Error, Equatable, Sendable {
    public let channelId: String
    public let message: String?

    public init(channelId: String, message: String? = nil) {
        self.channelId = channelId
        self.message = message
    }
}

public enum RelayDatagramFrame: Equatable, Sendable {
    case data(Data, sequence: Int?)
    case close
}

public struct RelayError: Codable, Error, Equatable, Sendable {
    public let code: String?
    public let field: String?
    public let message: String

    public init(code: String? = nil, field: String? = nil, message: String) {
        self.code = code
        self.field = field
        self.message = message
    }
}
