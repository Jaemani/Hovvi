import Foundation

public enum AppBootstrapCredentialSource: String, Equatable, Sendable {
    case relayTokenEnvironment = "HOVVI_RELAY_TOKEN"
    case legacyTokenEnvironment = "HOVVI_TOKEN"
    case developmentDefault = "development-default"
}

public struct AppBootstrapIssue: Equatable, Sendable {
    public let title: String
    public let message: String

    public init(title: String, message: String) {
        self.title = title
        self.message = message
    }
}

public struct AppBootstrapConfig: Equatable, Sendable {
    public static let defaultRelayURL = URL(string: "ws://127.0.0.1:8787")!
    public static let defaultClientId = "ios-alpha"
    public static let developmentRelayToken = "dev"

    public let relayURL: URL
    public let relayToken: String
    public let relayTokenSource: AppBootstrapCredentialSource
    public let clientId: String
    public let relayURLWasInvalid: Bool

    public init(
        relayURL: URL = Self.defaultRelayURL,
        relayToken: String = Self.developmentRelayToken,
        relayTokenSource: AppBootstrapCredentialSource = .developmentDefault,
        clientId: String = Self.defaultClientId,
        relayURLWasInvalid: Bool = false
    ) {
        self.relayURL = relayURL
        self.relayToken = relayToken
        self.relayTokenSource = relayTokenSource
        self.clientId = clientId
        self.relayURLWasInvalid = relayURLWasInvalid
    }

    public init(environment: [String: String]) {
        let relayURLString = environment["HOVVI_RELAY_URL"] ?? Self.defaultRelayURL.absoluteString
        if let relayURL = URL(string: relayURLString), Self.isValidRelayURL(relayURL) {
            self.relayURL = relayURL
            self.relayURLWasInvalid = false
        } else {
            self.relayURL = Self.defaultRelayURL
            self.relayURLWasInvalid = true
        }
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

    public var validationIssue: AppBootstrapIssue? {
        if relayURLWasInvalid {
            return AppBootstrapIssue(
                title: "Invalid relay URL",
                message: "HOVVI_RELAY_URL is invalid. Fix the relay URL before connecting."
            )
        }
        if usesDevelopmentDefaultToken && Self.isLocalRelayURL(relayURL) == false {
            return AppBootstrapIssue(
                title: "Relay token required",
                message: "Set HOVVI_RELAY_TOKEN before connecting to \(Self.redactURLCredentials(relayURL.absoluteString)). Development default tokens are allowed only for local relays."
            )
        }
        return nil
    }

    public static func redactToken(_ token: String) -> String {
        guard token.isEmpty == false else { return "[empty]" }
        if token.count <= 6 {
            return "[redacted]"
        }
        return "\(token.prefix(3))...\(token.suffix(3))"
    }

    public static func isLocalRelayURL(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else {
            return false
        }
        return host == "localhost" || host == "127.0.0.1" || host == "::1"
    }

    public static func isValidRelayURL(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased(), scheme == "ws" || scheme == "wss" else {
            return false
        }
        guard let host = url.host, host.isEmpty == false else {
            return false
        }
        return true
    }

    public static func redactURLCredentials(_ rawURL: String) -> String {
        guard var components = URLComponents(string: rawURL) else {
            return rawURL.replacing(/:\/\/[^@\s]+@/, with: "://[redacted]@")
        }
        if components.user != nil {
            components.user = "[redacted]"
        }
        if components.password != nil {
            components.password = "[redacted]"
        }
        return components.string ?? rawURL
    }
}
