import Foundation

public protocol AttachShellRelaying: RelayDatagramTransporting {
    func connect(startReceiveLoop: Bool) async throws
    func listDevices(timeout: Duration) async throws -> [Device]
    func prepareAttachManifest(
        deviceId: String,
        sessionName: String,
        lines: Int,
        create: Bool,
        timeout: Duration
    ) async throws -> AttachManifest
    func fetchScrollbackResult(
        deviceId: String,
        sessionName: String,
        lines: Int,
        timeout: Duration
    ) async throws -> ScrollbackResult
}

extension RelayClient: AttachShellRelaying {}

public enum AttachShellPhase: String, Codable, Equatable, Sendable {
    case disconnected
    case connecting
    case browsing
    case attaching
    case attached
    case failed
}

public enum AttachShellRecoveryAction: String, Codable, Equatable, Sendable {
    case connectRelay
    case reattachSession
}

public struct AttachShellError: Codable, Equatable, Sendable, CustomStringConvertible {
    public let title: String
    public let message: String
    public let recoverable: Bool

    public init(title: String, message: String, recoverable: Bool = true) {
        self.title = title
        self.message = AttachShellError.redact(message)
        self.recoverable = recoverable
    }

    public var description: String {
        "\(title): \(message)"
    }

    private static func redact(_ message: String) -> String {
        message.replacing(
            /[A-Za-z0-9+\/]{22}/,
            with: "[redacted-mosh-key]"
        )
    }
}

public struct AttachShellSnapshot: Equatable, Sendable {
    public let phase: AttachShellPhase
    public let devices: [Device]
    public let selectedDeviceId: String?
    public let selectedSessionName: String?
    public let manifest: AttachManifest?
    public let scrollback: ScrollbackBuffer?
    public let terminalScreen: TerminalScreen?
    public let terminalOutput: Data
    public let nextTickAfterMs: UInt32?
    public let cleanShutdown: Bool
    public let error: AttachShellError?
    public let recoveryAction: AttachShellRecoveryAction?

    public init(
        phase: AttachShellPhase = .disconnected,
        devices: [Device] = [],
        selectedDeviceId: String? = nil,
        selectedSessionName: String? = nil,
        manifest: AttachManifest? = nil,
        scrollback: ScrollbackBuffer? = nil,
        terminalScreen: TerminalScreen? = nil,
        terminalOutput: Data = Data(),
        nextTickAfterMs: UInt32? = nil,
        cleanShutdown: Bool = false,
        error: AttachShellError? = nil,
        recoveryAction: AttachShellRecoveryAction? = nil
    ) {
        self.phase = phase
        self.devices = devices
        self.selectedDeviceId = selectedDeviceId
        self.selectedSessionName = selectedSessionName
        self.manifest = manifest
        self.scrollback = scrollback
        self.terminalScreen = terminalScreen
        self.terminalOutput = terminalOutput
        self.nextTickAfterMs = nextTickAfterMs
        self.cleanShutdown = cleanShutdown
        self.error = error
        self.recoveryAction = recoveryAction
    }
}

public actor AttachShellModel {
    private let relay: any AttachShellRelaying
    private let makeEngine: @Sendable () -> any MoshCoreEngine
    private var attachSession: MoshAttachSession?
    private var snapshot = AttachShellSnapshot()

    public init(
        relay: any AttachShellRelaying,
        makeEngine: @escaping @Sendable () -> any MoshCoreEngine = { CAbiMoshCoreEngine() }
    ) {
        self.relay = relay
        self.makeEngine = makeEngine
    }

    public func currentSnapshot() -> AttachShellSnapshot {
        snapshot
    }

    @discardableResult
    public func connectAndLoadDevices(timeout: Duration = .seconds(3)) async -> AttachShellSnapshot {
        update(phase: .connecting, error: nil)
        do {
            try await relay.connect(startReceiveLoop: true)
            let devices = try await relay.listDevices(timeout: timeout)
            snapshot = AttachShellSnapshot(
                phase: .browsing,
                devices: devices,
                selectedDeviceId: snapshot.selectedDeviceId,
                selectedSessionName: snapshot.selectedSessionName
            )
        } catch {
            fail(title: "Could not connect to relay", error: error, recoveryAction: .connectRelay)
        }
        return snapshot
    }

    @discardableResult
    public func selectDevice(_ deviceId: String) -> AttachShellSnapshot {
        let selectedSession = snapshot.devices
            .first(where: { $0.id == deviceId })?
            .sessions
            .first?
            .name
        snapshot = AttachShellSnapshot(
            phase: snapshot.phase == .disconnected ? .disconnected : .browsing,
            devices: snapshot.devices,
            selectedDeviceId: deviceId,
            selectedSessionName: selectedSession
        )
        return snapshot
    }

    @discardableResult
    public func selectSession(_ sessionName: String) -> AttachShellSnapshot {
        snapshot = AttachShellSnapshot(
            phase: snapshot.phase == .disconnected ? .disconnected : .browsing,
            devices: snapshot.devices,
            selectedDeviceId: snapshot.selectedDeviceId,
            selectedSessionName: sessionName
        )
        return snapshot
    }

    @discardableResult
    public func attach(
        lines: Int = 2000,
        create: Bool = false,
        initialSize: MoshCoreTerminalSize = MoshCoreTerminalSize(columns: 80, rows: 24),
        timeout: Duration = .seconds(5)
    ) async -> AttachShellSnapshot {
        guard let deviceId = snapshot.selectedDeviceId else {
            fail(title: "Choose a Mac", message: "Select a connected Mac before attaching.", recoveryAction: .connectRelay)
            return snapshot
        }
        let sessionName = snapshot.selectedSessionName ?? "main"
        update(phase: .attaching, selectedDeviceId: deviceId, selectedSessionName: sessionName, error: nil)

        do {
            let scrollback = try await relay.fetchScrollbackResult(
                deviceId: deviceId,
                sessionName: sessionName,
                lines: lines,
                timeout: timeout
            )
            let manifest = try await relay.prepareAttachManifest(
                deviceId: deviceId,
                sessionName: sessionName,
                lines: lines,
                create: create,
                timeout: timeout
            )
            let datagramSession = try MoshRelayDatagramSession(relay: relay, manifest: manifest)
            let session = MoshAttachSession(datagramSession: datagramSession, engine: makeEngine())
            attachSession = session
            let frame = try await session.connect(initialSize: initialSize, timeout: timeout)
            let buffer = ScrollbackBuffer(result: scrollback)
            var screen = TerminalScreen(columns: initialSize.columns, rows: initialSize.rows)
            screen.apply(frame.terminalOutput)
            snapshot = AttachShellSnapshot(
                phase: .attached,
                devices: snapshot.devices,
                selectedDeviceId: deviceId,
                selectedSessionName: sessionName,
                manifest: manifest,
                scrollback: buffer,
                terminalScreen: screen,
                terminalOutput: frame.terminalOutput,
                nextTickAfterMs: frame.nextTickAfterMs,
                cleanShutdown: frame.cleanShutdown
            )
        } catch {
            attachSession = nil
            fail(title: "Could not attach session", error: error, recoveryAction: .reattachSession)
        }
        return snapshot
    }

    @discardableResult
    public func sendInput(_ bytes: Data) async -> AttachShellSnapshot {
        guard let attachSession else {
            fail(title: "No active terminal", message: "Attach to a session before sending input.", recoveryAction: .reattachSession)
            return snapshot
        }
        do {
            apply(try await attachSession.sendUserInput(bytes))
        } catch {
            try? await attachSession.closeTransport()
            self.attachSession = nil
            fail(title: "Could not send input", error: error, recoveryAction: .reattachSession)
        }
        return snapshot
    }

    @discardableResult
    public func resize(to size: MoshCoreTerminalSize) async -> AttachShellSnapshot {
        guard let attachSession else {
            fail(title: "No active terminal", message: "Attach to a session before resizing.", recoveryAction: .reattachSession)
            return snapshot
        }
        do {
            var screen = snapshot.terminalScreen ?? TerminalScreen(columns: size.columns, rows: size.rows)
            screen.resize(columns: size.columns, rows: size.rows)
            apply(try await attachSession.resize(to: size), terminalScreen: screen)
        } catch {
            try? await attachSession.closeTransport()
            self.attachSession = nil
            fail(title: "Could not resize terminal", error: error, recoveryAction: .reattachSession)
        }
        return snapshot
    }

    @discardableResult
    public func receiveNext(timeout: Duration = .seconds(30)) async -> AttachShellSnapshot {
        guard let attachSession else {
            fail(title: "No active terminal", message: "Attach to a session before reading output.", recoveryAction: .reattachSession)
            return snapshot
        }
        do {
            if let frame = try await attachSession.receiveNext(timeout: timeout) {
                apply(frame)
            }
        } catch {
            try? await attachSession.closeTransport()
            self.attachSession = nil
            fail(title: "Terminal connection interrupted", error: error, recoveryAction: .reattachSession)
        }
        return snapshot
    }

    @discardableResult
    public func tick(nowMs: UInt64) async -> AttachShellSnapshot {
        guard let attachSession else {
            return snapshot
        }
        do {
            apply(try await attachSession.tick(nowMs: nowMs))
        } catch {
            try? await attachSession.closeTransport()
            self.attachSession = nil
            fail(title: "Terminal timer failed", error: error, recoveryAction: .reattachSession)
        }
        return snapshot
    }

    @discardableResult
    public func shutdown() async -> AttachShellSnapshot {
        guard let attachSession else {
            return snapshot
        }
        do {
            apply(try await attachSession.shutdown())
            self.attachSession = nil
            update(phase: .browsing)
        } catch {
            try? await attachSession.closeTransport()
            self.attachSession = nil
            fail(title: "Could not close terminal", error: error, recoveryAction: .reattachSession)
        }
        return snapshot
    }

    private func apply(_ frame: MoshAttachFrame, terminalScreen existingScreen: TerminalScreen? = nil) {
        var terminalScreen = existingScreen ?? snapshot.terminalScreen
        if frame.terminalOutput.isEmpty == false {
            if terminalScreen == nil {
                terminalScreen = TerminalScreen()
            }
            terminalScreen?.apply(frame.terminalOutput)
        }
        snapshot = AttachShellSnapshot(
            phase: snapshot.phase,
            devices: snapshot.devices,
            selectedDeviceId: snapshot.selectedDeviceId,
            selectedSessionName: snapshot.selectedSessionName,
            manifest: snapshot.manifest,
            scrollback: snapshot.scrollback,
            terminalScreen: terminalScreen,
            terminalOutput: frame.terminalOutput,
            nextTickAfterMs: frame.nextTickAfterMs,
            cleanShutdown: frame.cleanShutdown,
            error: nil,
            recoveryAction: nil
        )
    }

    private func update(
        phase: AttachShellPhase? = nil,
        selectedDeviceId: String? = nil,
        selectedSessionName: String? = nil,
        error: AttachShellError? = nil,
        recoveryAction: AttachShellRecoveryAction? = nil
    ) {
        snapshot = AttachShellSnapshot(
            phase: phase ?? snapshot.phase,
            devices: snapshot.devices,
            selectedDeviceId: selectedDeviceId ?? snapshot.selectedDeviceId,
            selectedSessionName: selectedSessionName ?? snapshot.selectedSessionName,
            manifest: snapshot.manifest,
            scrollback: snapshot.scrollback,
            terminalScreen: snapshot.terminalScreen,
            terminalOutput: snapshot.terminalOutput,
            nextTickAfterMs: snapshot.nextTickAfterMs,
            cleanShutdown: snapshot.cleanShutdown,
            error: error,
            recoveryAction: recoveryAction
        )
    }

    private func fail(title: String, error: Error, recoveryAction: AttachShellRecoveryAction?) {
        fail(title: title, message: String(describing: error), recoveryAction: recoveryAction)
    }

    private func fail(title: String, message: String, recoveryAction: AttachShellRecoveryAction?) {
        snapshot = AttachShellSnapshot(
            phase: .failed,
            devices: snapshot.devices,
            selectedDeviceId: snapshot.selectedDeviceId,
            selectedSessionName: snapshot.selectedSessionName,
            manifest: snapshot.manifest,
            scrollback: snapshot.scrollback,
            terminalScreen: snapshot.terminalScreen,
            terminalOutput: snapshot.terminalOutput,
            nextTickAfterMs: snapshot.nextTickAfterMs,
            cleanShutdown: snapshot.cleanShutdown,
            error: AttachShellError(title: title, message: message),
            recoveryAction: recoveryAction
        )
    }
}
