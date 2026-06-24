import Foundation

public enum HovviCoding {
    public static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(formatDate(date))
        }
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }()

    public static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)
            if let date = parseDate(value) {
                return date
            }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid ISO8601 date: \(value)")
        }
        return decoder
    }()

    public static func encode<T: Encodable>(_ value: T) throws -> Data {
        try encoder.encode(value)
    }

    public static func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        try decoder.decode(type, from: data)
    }

    public static func encodeEnvelope<Payload: Encodable>(_ envelope: Envelope<Payload>) throws -> Data {
        let payloadData = try encoder.encode(envelope.payload)
        guard var object = try JSONSerialization.jsonObject(with: payloadData) as? [String: Any] else {
            throw HovviProtocolError.invalidPayloadObject
        }

        object["version"] = envelope.version
        object["type"] = envelope.type
        object["id"] = envelope.id
        object["sentAt"] = formatDate(envelope.sentAt)

        return try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    }

    private static func formatDate(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    private static func parseDate(_ value: String) -> Date? {
        let withFractionalSeconds = ISO8601DateFormatter()
        withFractionalSeconds.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFractionalSeconds.date(from: value) {
            return date
        }

        let withoutFractionalSeconds = ISO8601DateFormatter()
        withoutFractionalSeconds.formatOptions = [.withInternetDateTime]
        return withoutFractionalSeconds.date(from: value)
    }
}

public struct RawEnvelope: Codable, Equatable, Sendable {
    public let version: Int
    public let type: String
    public let id: String
    public let sentAt: Date
}

public enum HovviProtocolError: Error, Equatable, Sendable {
    case unsupportedVersion(Int)
    case unexpectedType(expected: String, actual: String)
    case invalidPayloadObject
}

public func decodeEnvelope<Payload: Decodable>(
    _ payloadType: Payload.Type,
    from data: Data,
    expectedType: String
) throws -> Envelope<Payload> {
    let raw = try HovviCoding.decode(RawEnvelope.self, from: data)
    guard raw.version == hovviProtocolVersion else {
        throw HovviProtocolError.unsupportedVersion(raw.version)
    }
    guard raw.type == expectedType else {
        throw HovviProtocolError.unexpectedType(expected: expectedType, actual: raw.type)
    }
    let payload = try HovviCoding.decode(Payload.self, from: data)
    return Envelope(type: raw.type, id: raw.id, sentAt: raw.sentAt, payload: payload)
}
