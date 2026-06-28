import Foundation

public protocol RelayDatagramTransporting: Sendable {
    func openDatagram(
        deviceId: String,
        label: String?,
        remoteHost: String?,
        remotePort: Int?,
        maxDatagramBytes: Int?,
        timeout: Duration
    ) async throws -> String

    func sendDatagram(channelId: String, bytes: Data, sequence: Int?) async throws
    func readDatagramFrame(channelId: String, timeout: Duration) async throws -> RelayDatagramFrame
    func closeDatagram(channelId: String) async throws
}

extension RelayClient: RelayDatagramTransporting {}

public struct MoshRelayDatagramPacket: Equatable, Sendable {
    public let bytes: Data
    public let relaySequence: Int?

    public init(bytes: Data, relaySequence: Int? = nil) {
        self.bytes = bytes
        self.relaySequence = relaySequence
    }
}

public struct MoshServerKey: Equatable, Sendable, RawRepresentable {
    public static let encodedLength = 22

    public let rawValue: String

    public init?(rawValue: String) {
        guard Self.isValid(rawValue) else { return nil }
        self.rawValue = rawValue
    }

    public static func isValid(_ value: String) -> Bool {
        guard value.utf8.count == encodedLength else { return false }
        return value.utf8.allSatisfy { byte in
            (byte >= 65 && byte <= 90)
                || (byte >= 97 && byte <= 122)
                || (byte >= 48 && byte <= 57)
                || byte == 43
                || byte == 47
        }
    }
}

public let hovviAttachManifestKind = "mosh-tmux"
public let hovviAttachManifestVersion = 1

public enum MoshRelayDatagramSessionError: Error, Equatable, Sendable, CustomStringConvertible {
    case unsupportedManifestKind(String)
    case unsupportedManifestVersion(Int)
    case missingDeviceId
    case noRelayDatagramTransport
    case unsupportedTransportKind(String)
    case missingRemotePort
    case missingServerKey
    case invalidServerKey
    case invalidMaxDatagramBytes(Int)
    case notConnected
    case packetTooLarge(size: Int, max: Int)
    case closed

    public var description: String {
        switch self {
        case .unsupportedManifestKind(let kind):
            return "Unsupported attach manifest kind: \(kind)."
        case .unsupportedManifestVersion(let version):
            return "Unsupported attach manifest version: \(version)."
        case .missingDeviceId:
            return "Attach manifest does not include a device id."
        case .noRelayDatagramTransport:
            return "Attach manifest does not include an available mosh relay datagram transport."
        case .unsupportedTransportKind(let kind):
            return "Unsupported mosh transport kind: \(kind)."
        case .missingRemotePort:
            return "Mosh relay datagram transport is missing a remote UDP port."
        case .missingServerKey:
            return "Mosh relay datagram transport is missing the mosh server key."
        case .invalidServerKey:
            return "Mosh relay datagram transport has an invalid mosh server key."
        case .invalidMaxDatagramBytes(let value):
            return "Invalid max datagram size: \(value)."
        case .notConnected:
            return "Mosh relay datagram session is not connected."
        case .packetTooLarge(let size, let max):
            return "Mosh packet is too large for relay datagram transport: \(size) > \(max)."
        case .closed:
            return "Mosh relay datagram session has been closed."
        }
    }
}

public extension AttachManifest {
    func validateSupportedMoshAttachManifest() throws {
        guard kind == hovviAttachManifestKind else {
            throw MoshRelayDatagramSessionError.unsupportedManifestKind(kind)
        }
        guard version == hovviAttachManifestVersion else {
            throw MoshRelayDatagramSessionError.unsupportedManifestVersion(version)
        }
    }

    func preferredMoshRelayDatagramTransport() throws -> AttachTransport {
        try validateSupportedMoshAttachManifest()
        let candidates = methods
            .filter { $0.name == "mosh" && $0.status == "available" }
            .sorted { $0.priority < $1.priority }

        for method in candidates {
            guard let transport = method.transport else { continue }
            if transport.kind == "relay-datagram" {
                return transport
            }
        }

        throw MoshRelayDatagramSessionError.noRelayDatagramTransport
    }
}

public actor MoshRelayDatagramSession {
    public let deviceId: String
    public let serverKey: String
    public let validatedServerKey: MoshServerKey
    public let remoteHost: String
    public let remotePort: Int
    public let label: String
    public let maxDatagramBytes: Int

    private let relay: any RelayDatagramTransporting
    private var channelId: String?
    private var nextRelaySequence = 0

    public init(relay: any RelayDatagramTransporting, manifest: AttachManifest) throws {
        try manifest.validateSupportedMoshAttachManifest()
        guard let deviceId = manifest.deviceId else {
            throw MoshRelayDatagramSessionError.missingDeviceId
        }
        try self.init(
            relay: relay,
            deviceId: deviceId,
            transport: manifest.preferredMoshRelayDatagramTransport()
        )
    }

    public init(relay: any RelayDatagramTransporting, deviceId: String, transport: AttachTransport) throws {
        guard transport.kind == "relay-datagram" else {
            throw MoshRelayDatagramSessionError.unsupportedTransportKind(transport.kind)
        }
        guard let remotePort = transport.remotePort else {
            throw MoshRelayDatagramSessionError.missingRemotePort
        }
        guard let serverKey = transport.key, serverKey.isEmpty == false else {
            throw MoshRelayDatagramSessionError.missingServerKey
        }
        guard let validatedServerKey = MoshServerKey(rawValue: serverKey) else {
            throw MoshRelayDatagramSessionError.invalidServerKey
        }

        let maxDatagramBytes = transport.maxDatagramBytes ?? 1200
        guard maxDatagramBytes > 0 else {
            throw MoshRelayDatagramSessionError.invalidMaxDatagramBytes(maxDatagramBytes)
        }

        self.relay = relay
        self.deviceId = deviceId
        self.serverKey = validatedServerKey.rawValue
        self.validatedServerKey = validatedServerKey
        self.remoteHost = transport.remoteHost ?? "127.0.0.1"
        self.remotePort = remotePort
        self.label = transport.label ?? "mosh"
        self.maxDatagramBytes = maxDatagramBytes
    }

    public func connectedChannelId() -> String? {
        channelId
    }

    @discardableResult
    public func connect(timeout: Duration = .seconds(5)) async throws -> String {
        if let channelId {
            return channelId
        }

        let openedChannelId = try await relay.openDatagram(
            deviceId: deviceId,
            label: label,
            remoteHost: remoteHost,
            remotePort: remotePort,
            maxDatagramBytes: maxDatagramBytes,
            timeout: timeout
        )
        channelId = openedChannelId
        return openedChannelId
    }

    @discardableResult
    public func sendPacket(_ bytes: Data) async throws -> Int {
        guard let channelId else {
            throw MoshRelayDatagramSessionError.notConnected
        }
        guard bytes.count <= maxDatagramBytes else {
            throw MoshRelayDatagramSessionError.packetTooLarge(size: bytes.count, max: maxDatagramBytes)
        }

        let sequence = nextRelaySequence
        nextRelaySequence += 1
        try await relay.sendDatagram(channelId: channelId, bytes: bytes, sequence: sequence)
        return sequence
    }

    public func receivePacket(timeout: Duration = .seconds(30)) async throws -> MoshRelayDatagramPacket? {
        guard let channelId else {
            throw MoshRelayDatagramSessionError.notConnected
        }

        do {
            switch try await relay.readDatagramFrame(channelId: channelId, timeout: timeout) {
            case .data(let bytes, let sequence):
                guard bytes.count <= maxDatagramBytes else {
                    self.channelId = nil
                    try? await relay.closeDatagram(channelId: channelId)
                    throw MoshRelayDatagramSessionError.packetTooLarge(size: bytes.count, max: maxDatagramBytes)
                }
                return MoshRelayDatagramPacket(bytes: bytes, relaySequence: sequence)
            case .close:
                self.channelId = nil
                return nil
            }
        } catch let error as RelayClientError {
            if case .datagramFailed = error {
                self.channelId = nil
            }
            throw error
        }
    }

    public func close() async throws {
        guard let channelId else { return }
        self.channelId = nil
        try await relay.closeDatagram(channelId: channelId)
    }
}
