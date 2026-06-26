import Foundation
import HovviMoshCoreC

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
    case invalidArgument(String)
    case cryptoError(String)
    case protocolError(String)
    case internalError(String)

    public var description: String {
        switch self {
        case .unavailable(let reason):
            return "Mosh core engine is unavailable: \(reason)"
        case .invalidArgument(let reason):
            return "Mosh core engine rejected invalid input: \(reason)"
        case .cryptoError(let reason):
            return "Mosh core engine crypto error: \(reason)"
        case .protocolError(let reason):
            return "Mosh core engine protocol error: \(reason)"
        case .internalError(let reason):
            return "Mosh core engine internal error: \(reason)"
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

public final class CAbiMoshCoreEngine: MoshCoreEngine, @unchecked Sendable {
    private var core: OpaquePointer?

    public init() {}

    deinit {
        if let core {
            hovvi_mosh_core_destroy(core)
        }
    }

    public func start(configuration: MoshCoreConfiguration) async throws -> MoshCoreFrame {
        if core != nil {
            return MoshCoreFrame()
        }

        var createdCore: OpaquePointer?
        let status = configuration.serverKey.rawValue.withCString { key in
            hovvi_mosh_core_create(
                key,
                hovvi_mosh_terminal_size_t(
                    columns: UInt32(configuration.initialSize.columns),
                    rows: UInt32(configuration.initialSize.rows)
                ),
                &createdCore
            )
        }
        try throwIfNeeded(status, context: "create")
        core = createdCore
        return MoshCoreFrame()
    }

    public func receivePacket(_ packet: MoshRelayDatagramPacket) async throws -> MoshCoreFrame {
        try withCore { core in
            try packet.bytes.withUnsafeBytes { bytes in
                var frame = hovvi_mosh_frame_t()
                let status = hovvi_mosh_core_receive_packet(
                    core,
                    hovvi_mosh_bytes_t(data: bytes.bindMemory(to: UInt8.self).baseAddress, len: packet.bytes.count),
                    &frame
                )
                return try convert(status: status, frame: &frame, context: "receive")
            }
        }
    }

    public func sendUserInput(_ bytes: Data) async throws -> MoshCoreFrame {
        try withCore { core in
            try bytes.withUnsafeBytes { raw in
                var frame = hovvi_mosh_frame_t()
                let status = hovvi_mosh_core_send_user_input(
                    core,
                    hovvi_mosh_bytes_t(data: raw.bindMemory(to: UInt8.self).baseAddress, len: bytes.count),
                    &frame
                )
                return try convert(status: status, frame: &frame, context: "input")
            }
        }
    }

    public func resize(to size: MoshCoreTerminalSize) async throws -> MoshCoreFrame {
        try withCore { core in
            var frame = hovvi_mosh_frame_t()
            let status = hovvi_mosh_core_resize(
                core,
                hovvi_mosh_terminal_size_t(columns: UInt32(size.columns), rows: UInt32(size.rows)),
                &frame
            )
            return try convert(status: status, frame: &frame, context: "resize")
        }
    }

    public func tick(nowMs: UInt64) async throws -> MoshCoreFrame {
        try withCore { core in
            var frame = hovvi_mosh_frame_t()
            let status = hovvi_mosh_core_tick(core, nowMs, &frame)
            return try convert(status: status, frame: &frame, context: "tick")
        }
    }

    public func shutdown() async throws -> MoshCoreFrame {
        try withCore { core in
            var frame = hovvi_mosh_frame_t()
            let status = hovvi_mosh_core_shutdown(core, &frame)
            return try convert(status: status, frame: &frame, context: "shutdown")
        }
    }

    private func withCore<T>(_ body: (OpaquePointer) throws -> T) throws -> T {
        guard let core else {
            throw MoshCoreEngineError.unavailable("core has not been created")
        }
        return try body(core)
    }
}

private func convert(
    status: hovvi_mosh_status_t,
    frame: inout hovvi_mosh_frame_t,
    context: String
) throws -> MoshCoreFrame {
    defer { hovvi_mosh_frame_free(&frame) }
    try throwIfNeeded(status, context: context)

    let terminalOutput = data(from: frame.terminal_output)
    var outboundPackets: [Data] = []
    if let packets = frame.outbound_packets {
        for index in 0..<frame.outbound_packet_count {
            outboundPackets.append(data(from: packets[index]))
        }
    }

    return MoshCoreFrame(
        terminalOutput: terminalOutput,
        outboundPackets: outboundPackets,
        nextTickAfterMs: frame.next_tick_ms == 0 ? nil : frame.next_tick_ms,
        cleanShutdown: frame.clean_shutdown != 0
    )
}

private func data(from bytes: hovvi_mosh_bytes_t) -> Data {
    guard let pointer = bytes.data, bytes.len > 0 else {
        return Data()
    }
    return Data(bytes: pointer, count: bytes.len)
}

private func throwIfNeeded(_ status: hovvi_mosh_status_t, context: String) throws {
    if status == HOVVI_MOSH_OK {
        return
    }
    let name = String(cString: hovvi_mosh_status_name(status))
    switch status {
    case HOVVI_MOSH_INVALID_ARGUMENT:
        throw MoshCoreEngineError.invalidArgument("\(context): \(name)")
    case HOVVI_MOSH_CRYPTO_ERROR:
        throw MoshCoreEngineError.cryptoError("\(context): \(name)")
    case HOVVI_MOSH_PROTOCOL_ERROR:
        throw MoshCoreEngineError.protocolError("\(context): \(name)")
    case HOVVI_MOSH_UNAVAILABLE:
        throw MoshCoreEngineError.unavailable("\(context): \(name)")
    default:
        throw MoshCoreEngineError.internalError("\(context): \(name)")
    }
}
