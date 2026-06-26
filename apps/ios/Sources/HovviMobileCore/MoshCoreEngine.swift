import Foundation

public struct MoshCoreTerminalSize: Equatable, Sendable {
    public let columns: Int
    public let rows: Int

    public init(columns: Int, rows: Int) {
        self.columns = columns
        self.rows = rows
    }
}

public struct MoshCoreFrame: Equatable, Sendable {
    public let terminalOutput: Data
    public let outboundPackets: [Data]
    public let nextTickAfterMs: UInt32?
    public let cleanShutdown: Bool

    public init(
        terminalOutput: Data = Data(),
        outboundPackets: [Data] = [],
        nextTickAfterMs: UInt32? = nil,
        cleanShutdown: Bool = false
    ) {
        self.terminalOutput = terminalOutput
        self.outboundPackets = outboundPackets
        self.nextTickAfterMs = nextTickAfterMs
        self.cleanShutdown = cleanShutdown
    }
}

public struct MoshCoreConfiguration: Equatable, Sendable {
    public let serverKey: MoshServerKey
    public let initialSize: MoshCoreTerminalSize
    public let predictiveEcho: Bool

    public init(serverKey: MoshServerKey, initialSize: MoshCoreTerminalSize, predictiveEcho: Bool = true) {
        self.serverKey = serverKey
        self.initialSize = initialSize
        self.predictiveEcho = predictiveEcho
    }
}

public protocol MoshCoreEngine: Sendable {
    func start(configuration: MoshCoreConfiguration) async throws -> MoshCoreFrame
    func receivePacket(_ packet: MoshRelayDatagramPacket) async throws -> MoshCoreFrame
    func sendUserInput(_ bytes: Data) async throws -> MoshCoreFrame
    func resize(to size: MoshCoreTerminalSize) async throws -> MoshCoreFrame
    func tick(nowMs: UInt64) async throws -> MoshCoreFrame
    func shutdown() async throws -> MoshCoreFrame
}

public enum MoshCoreEngineError: Error, Equatable, Sendable, CustomStringConvertible {
    case unavailable(String)

    public var description: String {
        switch self {
        case .unavailable(let reason):
            return "Mosh core engine is unavailable: \(reason)"
        }
    }
}

public struct UnavailableMoshCoreEngine: MoshCoreEngine {
    public let reason: String

    public init(reason: String = "upstream mosh core has not been linked into this build") {
        self.reason = reason
    }

    public func start(configuration: MoshCoreConfiguration) async throws -> MoshCoreFrame {
        throw MoshCoreEngineError.unavailable(reason)
    }

    public func receivePacket(_ packet: MoshRelayDatagramPacket) async throws -> MoshCoreFrame {
        throw MoshCoreEngineError.unavailable(reason)
    }

    public func sendUserInput(_ bytes: Data) async throws -> MoshCoreFrame {
        throw MoshCoreEngineError.unavailable(reason)
    }

    public func resize(to size: MoshCoreTerminalSize) async throws -> MoshCoreFrame {
        throw MoshCoreEngineError.unavailable(reason)
    }

    public func tick(nowMs: UInt64) async throws -> MoshCoreFrame {
        throw MoshCoreEngineError.unavailable(reason)
    }

    public func shutdown() async throws -> MoshCoreFrame {
        throw MoshCoreEngineError.unavailable(reason)
    }
}
