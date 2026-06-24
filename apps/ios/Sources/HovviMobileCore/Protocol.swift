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

public struct EmptyPayload: Codable, Equatable {
    public init() {}
}

public struct Device: Codable, Equatable, Identifiable {
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

public struct Session: Codable, Equatable, Identifiable {
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

public struct Pane: Codable, Equatable, Identifiable {
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

public struct DevicesSnapshot: Codable, Equatable {
    public let devices: [Device]

    public init(devices: [Device]) {
        self.devices = devices
    }
}

public struct AttachReady: Codable, Equatable {
    public let requestId: String
    public let manifest: AttachManifest

    public init(requestId: String, manifest: AttachManifest) {
        self.requestId = requestId
        self.manifest = manifest
    }
}

public struct AttachManifest: Codable, Equatable {
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

public struct AttachMethod: Codable, Equatable {
    public let name: String
    public let priority: Int
    public let status: String
    public let command: [String]
    public let notes: String?

    public init(name: String, priority: Int, status: String, command: [String], notes: String? = nil) {
        self.name = name
        self.priority = priority
        self.status = status
        self.command = command
        self.notes = notes
    }
}

public struct ScrollbackSource: Codable, Equatable {
    public let source: String
    public let command: [String]
    public let lines: Int

    public init(source: String, command: [String], lines: Int) {
        self.source = source
        self.command = command
        self.lines = lines
    }
}

public struct ControlModeSource: Codable, Equatable {
    public let source: String
    public let command: [String]

    public init(source: String, command: [String]) {
        self.source = source
        self.command = command
    }
}

public struct ScrollbackReady: Codable, Equatable {
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

public struct ScrollbackResult: Codable, Equatable {
    public let sessionName: String
    public let lines: Int
    public let text: String

    public init(sessionName: String, lines: Int, text: String) {
        self.sessionName = sessionName
        self.lines = lines
        self.text = text
    }
}

public struct RelayError: Codable, Error, Equatable {
    public let code: String?
    public let field: String?
    public let message: String

    public init(code: String? = nil, field: String? = nil, message: String) {
        self.code = code
        self.field = field
        self.message = message
    }
}
