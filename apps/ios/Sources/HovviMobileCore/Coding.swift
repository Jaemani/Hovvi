import Foundation

public enum HovviCoding {
    public static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }()

    public static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()

    public static func encode<T: Encodable>(_ value: T) throws -> Data {
        try encoder.encode(value)
    }

    public static func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        try decoder.decode(type, from: data)
    }
}

public struct RawEnvelope: Codable, Equatable {
    public let version: Int
    public let type: String
    public let id: String
    public let sentAt: Date
}

public enum HovviProtocolError: Error, Equatable {
    case unsupportedVersion(Int)
    case unexpectedType(expected: String, actual: String)
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
    return try HovviCoding.decode(Envelope<Payload>.self, from: data)
}
