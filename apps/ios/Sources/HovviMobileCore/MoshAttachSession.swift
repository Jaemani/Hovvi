import Foundation

public struct MoshAttachFrame: Equatable, Sendable {
    public let terminalOutput: Data
    public let packetsSent: Int
    public let nextTickAfterMs: UInt32?
    public let cleanShutdown: Bool

    public init(
        terminalOutput: Data = Data(),
        packetsSent: Int = 0,
        nextTickAfterMs: UInt32? = nil,
        cleanShutdown: Bool = false
    ) {
        self.terminalOutput = terminalOutput
        self.packetsSent = packetsSent
        self.nextTickAfterMs = nextTickAfterMs
        self.cleanShutdown = cleanShutdown
    }
}

public actor MoshAttachSession {
    public let datagramSession: MoshRelayDatagramSession
    private let engine: any MoshCoreEngine

    public init(datagramSession: MoshRelayDatagramSession, engine: any MoshCoreEngine) {
        self.datagramSession = datagramSession
        self.engine = engine
    }

    @discardableResult
    public func connect(
        initialSize: MoshCoreTerminalSize = MoshCoreTerminalSize(columns: 80, rows: 24),
        timeout: Duration = .seconds(5)
    ) async throws -> MoshAttachFrame {
        _ = try await datagramSession.connect(timeout: timeout)
        let frame = try await engine.start(
            configuration: MoshCoreConfiguration(
                serverKey: datagramSession.validatedServerKey,
                initialSize: initialSize
            )
        )
        return try await flush(frame)
    }

    @discardableResult
    public func sendUserInput(_ bytes: Data) async throws -> MoshAttachFrame {
        let frame = try await engine.sendUserInput(bytes)
        return try await flush(frame)
    }

    @discardableResult
    public func resize(to size: MoshCoreTerminalSize) async throws -> MoshAttachFrame {
        let frame = try await engine.resize(to: size)
        return try await flush(frame)
    }

    @discardableResult
    public func tick(nowMs: UInt64) async throws -> MoshAttachFrame {
        let frame = try await engine.tick(nowMs: nowMs)
        return try await flush(frame)
    }

    public func receiveNext(timeout: Duration = .seconds(30)) async throws -> MoshAttachFrame? {
        guard let packet = try await datagramSession.receivePacket(timeout: timeout) else {
            return nil
        }
        let frame = try await engine.receivePacket(packet)
        return try await flush(frame)
    }

    @discardableResult
    public func shutdown() async throws -> MoshAttachFrame {
        let shutdownFrame = try await engine.shutdown()
        let frame = try await flush(shutdownFrame)
        try await datagramSession.close()
        return frame
    }

    private func flush(_ frame: MoshCoreFrame) async throws -> MoshAttachFrame {
        var packetsSent = 0
        for packet in frame.outboundPackets {
            _ = try await datagramSession.sendPacket(packet)
            packetsSent += 1
        }
        return MoshAttachFrame(
            terminalOutput: frame.terminalOutput,
            packetsSent: packetsSent,
            nextTickAfterMs: frame.nextTickAfterMs,
            cleanShutdown: frame.cleanShutdown
        )
    }
}
