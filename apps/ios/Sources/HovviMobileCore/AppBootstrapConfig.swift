import Foundation

public enum AppBootstrapCredentialSource: String, Equatable, Sendable {
    case relayTokenEnvironment = "HOVVI_RELAY_TOKEN"
    case legacyTokenEnvironment = "HOVVI_TOKEN"
    case developmentDefault = "development-default"
}

public struct AppBootstrapConfig: Equatable, Sendable {
    public static let defaultRelayURL = URL(string: "ws://127.0.0.1:8787")!
    public static let defaultClientId = "ios-alpha"
    public static let developmentRelayToken = "dev"

    public let relayURL: URL
    public let relayToken: String
    public let relayTokenSource: AppBootstrapCredentialSource
    public let clientId: String

    public init(
        relayURL: URL = Self.defaultRelayURL,
        relayToken: String = Self.developmentRelayToken,
        relayTokenSource: AppBootstrapCredentialSource = .developmentDefault,
        clientId: String = Self.defaultClientId
    ) {
        self.relayURL = relayURL
        self.relayToken = relayToken
        self.relayTokenSource = relayTokenSource
        self.clientId = clientId
    }

    public init(environment: [String: String]) {
        let relayURLString = environment["HOVVI_RELAY_URL"] ?? Self.defaultRelayURL.absoluteString
        self.relayURL = URL(string: relayURLString) ?? Self.defaultRelayURL
        self.clientId = environment["HOVVI_CLIENT_ID"] ?? Self.defaultClientId

        if let token = environment["HOVVI_RELAY_TOKEN"], token.isEmpty == false {
            self.relayToken = token
            self.relayTokenSource = .relayTokenEnvironment
        } else if let token = environment["HOVVI_TOKEN"], token.isEmpty == false {
            self.relayToken = token
            self.relayTokenSource = .legacyTokenEnvironment
        } else {
            self.relayToken = Self.developmentRelayToken
            self.relayTokenSource = .developmentDefault
        }
    }

    public var usesDevelopmentDefaultToken: Bool {
        relayTokenSource == .developmentDefault
    }

    public var redactedRelayToken: String {
        Self.redactToken(relayToken)
    }

    public static func redactToken(_ token: String) -> String {
        guard token.isEmpty == false else { return "[empty]" }
        if token.count <= 6 {
            return "[redacted]"
        }
        return "\(token.prefix(3))...\(token.suffix(3))"
    }
}
