import Foundation
import HovviMobileCore

let snapshot = DevicesSnapshot(
    devices: [
        Device(
            id: "dev_1",
            name: "Mac",
            platform: "darwin",
            user: "jaeman",
            capabilities: ["tmux.sessions"],
            sessions: [Session(id: "$0", name: "main", kind: "tmux")]
        )
    ]
)

let envelope = Envelope(
    type: "devices.snapshot",
    id: "fixed",
    sentAt: Date(timeIntervalSince1970: 0),
    payload: snapshot
)
let data = try HovviCoding.encodeEnvelope(envelope)
let decoded = try decodeEnvelope(DevicesSnapshot.self, from: data, expectedType: "devices.snapshot")
try require(decoded.version == 1, "protocol version should decode")
try require(decoded.payload.devices.first?.name == "Mac", "device name should decode")
try require(decoded.payload.devices.first?.sessions.first?.name == "main", "session should decode")
let encodedObject = try JSONSerialization.jsonObject(with: data) as? [String: Any]
try require(encodedObject?["payload"] == nil, "wire envelope must be flattened")
try require(encodedObject?["devices"] != nil, "payload fields must be top-level")

let manifestJson = """
{
  "version": 1,
  "type": "session.attach.ready",
  "id": "message-1",
  "sentAt": "2026-06-24T00:00:00Z",
  "requestId": "req-1",
  "manifest": {
    "kind": "mosh-tmux",
    "version": 1,
    "deviceId": "dev_1",
    "deviceName": "Mac",
    "sessionName": "main",
    "user": "jaeman",
    "methods": [
      {
        "name": "mosh",
        "priority": 10,
        "status": "available",
        "command": ["mosh-server", "new"],
        "transport": {
          "kind": "relay-datagram",
          "label": "mosh",
          "remoteHost": "127.0.0.1",
          "remotePort": 60001,
          "key": "MDEyMzQ1Njc4OWFiY2RlZg",
          "maxDatagramBytes": 1200
        }
      }
    ],
    "scrollback": {
      "source": "tmux.capture-pane",
      "command": ["tmux", "capture-pane", "-t", "main", "-p"],
      "lines": 2000
    },
    "controlMode": {
      "source": "tmux.control-mode",
      "command": ["tmux", "-CC", "attach-session", "-t", "main"]
    }
  }
}
"""

let manifestEnvelope = try decodeEnvelope(
    AttachReady.self,
    from: Data(manifestJson.utf8),
    expectedType: "session.attach.ready"
)
try require(manifestEnvelope.payload.requestId == "req-1", "attach request id should decode")
try require(manifestEnvelope.payload.manifest.kind == "mosh-tmux", "attach manifest kind should decode")
try require(manifestEnvelope.payload.manifest.scrollback.lines == 2000, "scrollback lines should decode")
try require(manifestEnvelope.payload.manifest.methods[0].transport?.remotePort == 60001, "mosh transport port should decode")
try require(manifestEnvelope.payload.manifest.methods[0].transport?.key == "MDEyMzQ1Njc4OWFiY2RlZg", "mosh transport key should decode")

do {
    _ = try decodeEnvelope(DevicesSnapshot.self, from: data, expectedType: "other")
    throw SmokeError("unexpected type should fail")
} catch HovviProtocolError.unexpectedType {
}

let hello = try OutgoingRelayMessage.hello(token: "dev", clientId: "ios-1")
let helloObject = try JSONSerialization.jsonObject(with: hello) as? [String: Any]
try require(helloObject?["type"] as? String == "hello", "hello type should encode")
try require(helloObject?["role"] as? String == "client", "hello role should encode")
try require(helloObject?["payload"] == nil, "outgoing relay messages must be flattened")

let scrollbackRequest = try OutgoingRelayMessage.fetchScrollback(deviceId: "dev_1", sessionName: "main", lines: 120)
let scrollbackObject = try JSONSerialization.jsonObject(with: scrollbackRequest) as? [String: Any]
try require(scrollbackObject?["type"] as? String == "session.scrollback.fetch", "scrollback type should encode")
try require(scrollbackObject?["lines"] as? Int == 120, "scrollback lines should encode")

let attachRequestEnvelope = OutgoingRelayMessage.prepareAttachEnvelope(
    deviceId: "dev_1",
    sessionName: "main",
    lines: 80
)
try require(attachRequestEnvelope.id.isEmpty == false, "attach request envelope should expose request id")
try require(attachRequestEnvelope.payload.lines == 80, "attach request envelope should preserve payload")

let incoming = try decodeIncomingRelayMessage(from: Data(manifestJson.utf8))
switch incoming {
case .attachReady(let envelope):
    try require(envelope.payload.manifest.sessionName == "main", "incoming attach manifest should dispatch")
default:
    throw SmokeError("incoming attach manifest dispatched to wrong case")
}

let matchedManifest = try RelayResponseMatcher.attachManifest(requestId: "req-1", from: incoming)
try require(matchedManifest?.sessionName == "main", "attach response matcher should return matching manifest")
let ignoredManifest = try RelayResponseMatcher.attachManifest(requestId: "other", from: incoming)
try require(ignoredManifest == nil, "attach response matcher should ignore other request ids")

let scrollbackJson = """
{
  "version": 1,
  "type": "session.scrollback.ready",
  "id": "message-2",
  "sentAt": "2026-06-24T00:00:00Z",
  "requestId": "scroll-1",
  "sessionName": "main",
  "lines": 2,
  "text": "one\\ntwo"
}
"""
let incomingScrollback = try decodeIncomingRelayMessage(from: Data(scrollbackJson.utf8))
let matchedScrollback = try RelayResponseMatcher.scrollbackResult(requestId: "scroll-1", from: incomingScrollback)
try require(matchedScrollback?.text == "one\ntwo", "scrollback response matcher should return text")

let forwardOpen = try OutgoingRelayMessage.forwardOpen(
    deviceId: "dev_1",
    streamId: "str_1",
    remoteHost: "127.0.0.1",
    remotePort: 22
)
let forwardOpenObject = try JSONSerialization.jsonObject(with: forwardOpen) as? [String: Any]
try require(forwardOpenObject?["type"] as? String == "forward.open", "forward open type should encode")
try require(forwardOpenObject?["streamId"] as? String == "str_1", "forward open stream id should encode")
try require(forwardOpenObject?["remotePort"] as? Int == 22, "forward open remote port should encode")

let forwardData = try OutgoingRelayMessage.forwardData(streamId: "str_1", bytes: Data("ping".utf8))
let incomingForwardData = try decodeIncomingRelayMessage(from: forwardData)
switch incomingForwardData {
case .forwardData(let envelope):
    try require(envelope.payload.bytes == Data("ping".utf8), "forward data should decode base64 bytes")
default:
    throw SmokeError("forward data dispatched to wrong case")
}

let forwardReadyJson = """
{
  "version": 1,
  "type": "forward.ready",
  "id": "message-3",
  "sentAt": "2026-06-24T00:00:00Z",
  "streamId": "str_1"
}
"""
let incomingForwardReady = try decodeIncomingRelayMessage(from: Data(forwardReadyJson.utf8))
let matchedForward = try RelayResponseMatcher.forwardReady(streamId: "str_1", from: incomingForwardReady)
try require(matchedForward == "str_1", "forward ready matcher should return stream id")

let datagramOpen = try OutgoingRelayMessage.datagramOpen(
    deviceId: "dev_1",
    channelId: "dg_1",
    label: "mosh",
    remoteHost: "127.0.0.1",
    remotePort: 60001,
    maxDatagramBytes: 1200
)
let datagramOpenObject = try JSONSerialization.jsonObject(with: datagramOpen) as? [String: Any]
try require(datagramOpenObject?["type"] as? String == "datagram.open", "datagram open type should encode")
try require(datagramOpenObject?["channelId"] as? String == "dg_1", "datagram channel id should encode")
try require(datagramOpenObject?["remotePort"] as? Int == 60001, "datagram remote port should encode")
try require(datagramOpenObject?["maxDatagramBytes"] as? Int == 1200, "datagram max size should encode")

let datagramData = try OutgoingRelayMessage.datagramData(channelId: "dg_1", bytes: Data("pong".utf8), sequence: 7)
let incomingDatagramData = try decodeIncomingRelayMessage(from: datagramData)
switch incomingDatagramData {
case .datagramData(let envelope):
    try require(envelope.payload.bytes == Data("pong".utf8), "datagram data should decode base64 bytes")
    try require(envelope.payload.sequence == 7, "datagram sequence should decode")
default:
    throw SmokeError("datagram data dispatched to wrong case")
}

let datagramReadyJson = """
{
  "version": 1,
  "type": "datagram.ready",
  "id": "message-4",
  "sentAt": "2026-06-24T00:00:00Z",
  "channelId": "dg_1"
}
"""
let incomingDatagramReady = try decodeIncomingRelayMessage(from: Data(datagramReadyJson.utf8))
let matchedDatagram = try RelayResponseMatcher.datagramReady(channelId: "dg_1", from: incomingDatagramReady)
try require(matchedDatagram == "dg_1", "datagram ready matcher should return channel id")

let moshTransport = try manifestEnvelope.payload.manifest.preferredMoshRelayDatagramTransport()
try require(moshTransport.remoteHost == "127.0.0.1", "mosh transport should select relay datagram host")
try require(MoshServerKey.isValid(moshTransport.key ?? ""), "mosh transport should expose valid server key")
let fakeRelay = FakeDatagramRelay()
let moshSession = try MoshRelayDatagramSession(
    relay: fakeRelay,
    deviceId: "dev_1",
    transport: moshTransport
)
let openedMoshChannel = try await moshSession.connect()
try require(openedMoshChannel == "dg_fake", "mosh session should open relay datagram channel")
let firstMoshSequence = try await moshSession.sendPacket(Data([0x01, 0x02, 0x03]))
try require(firstMoshSequence == 0, "mosh session should sequence outgoing relay packets")
try require(
    await fakeRelay.sentDatagrams == [SentDatagram(channelId: "dg_fake", bytes: Data([0x01, 0x02, 0x03]), sequence: 0)],
    "fake relay should record sent mosh packet bytes"
)
await fakeRelay.enqueue(frame: .data(Data([0x04, 0x05]), sequence: 12))
let receivedMoshPacket = try await moshSession.receivePacket(timeout: .seconds(1))
try require(receivedMoshPacket?.bytes == Data([0x04, 0x05]), "mosh session should receive relay datagram packet")
try require(receivedMoshPacket?.relaySequence == 12, "mosh session should preserve relay sequence")
try await moshSession.close()
try require(await fakeRelay.closedChannelId == "dg_fake", "mosh session should close relay datagram channel")

let attachRelay = FakeDatagramRelay()
let attachDatagramSession = try MoshRelayDatagramSession(
    relay: attachRelay,
    deviceId: "dev_1",
    transport: moshTransport
)
let attachEngine = FakeMoshCoreEngine()
let attachSession = MoshAttachSession(datagramSession: attachDatagramSession, engine: attachEngine)

let connectedFrame = try await attachSession.connect(initialSize: MoshCoreTerminalSize(columns: 100, rows: 30))
try require(connectedFrame.packetsSent == 1, "attach connect should flush startup packet")
try require(connectedFrame.nextTickAfterMs == 10, "attach connect should surface next tick")
try require(
    await attachEngine.events.first == "start:100x30:\(moshTransport.key ?? "")",
    "attach connect should start core with manifest key and terminal size"
)
try require(
    await attachRelay.sentDatagrams == [SentDatagram(channelId: "dg_fake", bytes: Data([0xA0]), sequence: 0)],
    "attach connect should send core startup packet through relay"
)

let inputFrame = try await attachSession.sendUserInput(Data("hi".utf8))
try require(inputFrame.terminalOutput == Data("local".utf8), "attach input should surface local terminal output")
try require(inputFrame.packetsSent == 1, "attach input should flush input packet")

await attachRelay.enqueue(frame: .data(Data([0xB0]), sequence: 9))
let remoteFrame = try await attachSession.receiveNext(timeout: .seconds(1))
try require(remoteFrame?.terminalOutput == Data("remote".utf8), "attach receive should apply remote packet to core")
try require(remoteFrame?.packetsSent == 1, "attach receive should flush acknowledgement packet")

let resizeFrame = try await attachSession.resize(to: MoshCoreTerminalSize(columns: 120, rows: 40))
try require(resizeFrame.packetsSent == 1, "attach resize should flush resize packet")

let tickFrame = try await attachSession.tick(nowMs: 42)
try require(tickFrame.nextTickAfterMs == 20, "attach tick should surface next tick")

let shutdownFrame = try await attachSession.shutdown()
try require(shutdownFrame.cleanShutdown, "attach shutdown should surface clean shutdown")
try require(await attachRelay.closedChannelId == "dg_fake", "attach shutdown should close datagram session")
try require(
    await attachRelay.sentDatagrams.map(\.bytes) == [
        Data([0xA0]),
        Data([0xA1]),
        Data([0xA2]),
        Data([120, 40]),
        Data([0xA3]),
        Data([0xA4])
    ],
    "attach session should preserve outbound packet order"
)
try require(
    await attachRelay.sentDatagrams.map(\.sequence) == [0, 1, 2, 3, 4, 5],
    "attach session should preserve relay sequence order"
)

let unavailableMoshCore = UnavailableMoshCoreEngine(reason: "smoke")
do {
    _ = try await unavailableMoshCore.start(
        configuration: MoshCoreConfiguration(
            serverKey: MoshServerKey(rawValue: moshTransport.key ?? "")!,
            initialSize: MoshCoreTerminalSize(columns: 80, rows: 24)
        )
    )
    throw SmokeError("unavailable mosh core should fail")
} catch MoshCoreEngineError.unavailable(let reason) {
    try require(reason == "smoke", "unavailable mosh core should expose reason")
}
do {
    _ = try await unavailableMoshCore.tick(nowMs: 42)
    throw SmokeError("unavailable mosh core tick should fail")
} catch MoshCoreEngineError.unavailable(let reason) {
    try require(reason == "smoke", "unavailable mosh core tick should expose reason")
}
let emptyMoshCoreFrame = MoshCoreFrame()
try require(emptyMoshCoreFrame.nextTickAfterMs == nil, "empty mosh core frame should not schedule tick")
try require(emptyMoshCoreFrame.cleanShutdown == false, "empty mosh core frame should not signal shutdown")

let cAbiUnavailableEngine = CAbiMoshCoreEngine()
do {
    _ = try await cAbiUnavailableEngine.start(
        configuration: MoshCoreConfiguration(
            serverKey: MoshServerKey(rawValue: moshTransport.key ?? "")!,
            initialSize: MoshCoreTerminalSize(columns: 80, rows: 24)
        )
    )
    throw SmokeError("C ABI scaffold should report unavailable create")
} catch MoshCoreEngineError.unavailable(let reason) {
    try require(reason == "create: unavailable", "C ABI scaffold should map unavailable status")
}
do {
    _ = try await cAbiUnavailableEngine.receivePacket(MoshRelayDatagramPacket(bytes: Data([0x01])))
    throw SmokeError("C ABI receive before create should fail")
} catch MoshCoreEngineError.unavailable(let reason) {
    try require(reason == "core has not been created", "C ABI receive should require created core")
}
do {
    _ = try await CAbiMoshCoreEngine().start(
        configuration: MoshCoreConfiguration(
            serverKey: MoshServerKey(rawValue: moshTransport.key ?? "")!,
            initialSize: MoshCoreTerminalSize(columns: 0, rows: 24)
        )
    )
    throw SmokeError("C ABI invalid terminal size should fail")
} catch MoshCoreEngineError.invalidArgument(let reason) {
    try require(reason == "create: invalid_argument", "C ABI scaffold should map invalid argument status")
}

var scrollbackBuffer = ScrollbackBuffer(
    result: ScrollbackResult(sessionName: "main", lines: 2, text: "one\ntwo\n"),
    maxLines: 3
)
try require(scrollbackBuffer.lines.count == 2, "scrollback buffer should ignore trailing snapshot newline")
try require(scrollbackBuffer.visibleLines.map(\.text) == ["one", "two"], "scrollback buffer should expose snapshot lines")
scrollbackBuffer.appendPlainText("three")
try require(scrollbackBuffer.pendingText == "three", "scrollback buffer should keep incomplete streaming line pending")
try require(scrollbackBuffer.visibleLines.map(\.text) == ["one", "two", "three"], "visible lines should include pending text")
let pendingId = scrollbackBuffer.visibleLines.last?.id
scrollbackBuffer.appendPlainText(" plus\nfour\nfive\n")
try require(scrollbackBuffer.lines.map(\.text) == ["three plus", "four", "five"], "scrollback buffer should trim oldest lines")
try require(scrollbackBuffer.lines.first?.id == pendingId, "pending line id should stay stable when completed")
scrollbackBuffer.replace(with: ScrollbackResult(sessionName: "other", lines: 1, text: "fresh"))
try require(scrollbackBuffer.sessionName == "other", "scrollback buffer replace should update session name")
try require(scrollbackBuffer.lines.map(\.text) == ["fresh"], "scrollback buffer replace should reset content")
var tinyScrollbackBuffer = ScrollbackBuffer(sessionName: "main", text: "a\nb\n", maxLines: 2)
tinyScrollbackBuffer.appendPlainText("c")
try require(tinyScrollbackBuffer.visibleLines.map(\.text) == ["b", "c"], "visible lines should cap pending text")

let relayClient = RelayClient(url: URL(string: "ws://127.0.0.1:8787")!, token: "dev", clientId: "ios-smoke")
do {
    try await relayClient.fetchScrollback(deviceId: "dev_1", sessionName: "main", lines: 20)
    throw SmokeError("send before connect should fail")
} catch RelayClientError.notConnected {
}

do {
    _ = try await relayClient.fetchScrollbackResult(deviceId: "dev_1", sessionName: "main", lines: 20)
    throw SmokeError("high-level scrollback before connect should fail")
} catch RelayClientError.notConnected {
}

do {
    _ = try await relayClient.listDevices()
    throw SmokeError("device list before connect should fail")
} catch RelayClientError.notConnected {
}

do {
    _ = try await relayClient.openForward(deviceId: "dev_1")
    throw SmokeError("forward open before connect should fail")
} catch RelayClientError.notConnected {
}

do {
    _ = try await relayClient.readForwardFrame(streamId: "str_1")
    throw SmokeError("forward frame read before connect should fail")
} catch RelayClientError.notConnected {
}

do {
    _ = try await relayClient.openDatagram(deviceId: "dev_1")
    throw SmokeError("datagram open before connect should fail")
} catch RelayClientError.notConnected {
}

do {
    _ = try await relayClient.readDatagramFrame(channelId: "dg_1")
    throw SmokeError("datagram frame read before connect should fail")
} catch RelayClientError.notConnected {
}

do {
    _ = try await relayClient.receive()
    throw SmokeError("receive before connect should fail")
} catch RelayClientError.notConnected {
}

print("HovviMobileCore smoke passed")

struct SmokeError: Error, CustomStringConvertible {
    let description: String

    init(_ description: String) {
        self.description = description
    }
}

func require(_ condition: Bool, _ message: String) throws {
    if !condition {
        throw SmokeError(message)
    }
}

struct SentDatagram: Equatable, Sendable {
    let channelId: String
    let bytes: Data
    let sequence: Int?
}

actor FakeDatagramRelay: RelayDatagramTransporting {
    private(set) var closedChannelId: String?
    private(set) var sentDatagrams: [SentDatagram] = []
    private var frames: [RelayDatagramFrame] = []

    func openDatagram(
        deviceId: String,
        label: String?,
        remoteHost: String?,
        remotePort: Int?,
        maxDatagramBytes: Int?,
        timeout: Duration
    ) async throws -> String {
        try require(deviceId == "dev_1", "fake relay should receive device id")
        try require(label == "mosh", "fake relay should receive mosh label")
        try require(remoteHost == "127.0.0.1", "fake relay should receive local mosh host")
        try require(remotePort == 60001, "fake relay should receive mosh server port")
        try require(maxDatagramBytes == 1200, "fake relay should receive max datagram size")
        return "dg_fake"
    }

    func sendDatagram(channelId: String, bytes: Data, sequence: Int?) async throws {
        try require(channelId == "dg_fake", "fake relay should receive mosh channel id")
        sentDatagrams.append(SentDatagram(channelId: channelId, bytes: bytes, sequence: sequence))
    }

    func readDatagramFrame(channelId: String, timeout: Duration) async throws -> RelayDatagramFrame {
        try require(channelId == "dg_fake", "fake relay should read from mosh channel")
        guard frames.isEmpty == false else {
            throw SmokeError("fake relay has no datagram frame")
        }
        return frames.removeFirst()
    }

    func closeDatagram(channelId: String) async throws {
        closedChannelId = channelId
    }

    func enqueue(frame: RelayDatagramFrame) {
        frames.append(frame)
    }
}

actor FakeMoshCoreEngine: MoshCoreEngine {
    private(set) var events: [String] = []

    func start(configuration: MoshCoreConfiguration) async throws -> MoshCoreFrame {
        events.append(
            "start:\(configuration.initialSize.columns)x\(configuration.initialSize.rows):\(configuration.serverKey.rawValue)"
        )
        return MoshCoreFrame(outboundPackets: [Data([0xA0])], nextTickAfterMs: 10)
    }

    func receivePacket(_ packet: MoshRelayDatagramPacket) async throws -> MoshCoreFrame {
        events.append("receive:\(packet.bytes.map(String.init).joined(separator: ",")):\(packet.relaySequence ?? -1)")
        try require(packet.bytes == Data([0xB0]), "fake core should receive remote relay packet")
        try require(packet.relaySequence == 9, "fake core should receive relay sequence")
        return MoshCoreFrame(terminalOutput: Data("remote".utf8), outboundPackets: [Data([0xA2])])
    }

    func sendUserInput(_ bytes: Data) async throws -> MoshCoreFrame {
        events.append("input:\(String(decoding: bytes, as: UTF8.self))")
        return MoshCoreFrame(terminalOutput: Data("local".utf8), outboundPackets: [Data([0xA1])])
    }

    func resize(to size: MoshCoreTerminalSize) async throws -> MoshCoreFrame {
        events.append("resize:\(size.columns)x\(size.rows)")
        return MoshCoreFrame(outboundPackets: [Data([UInt8(size.columns), UInt8(size.rows)])])
    }

    func tick(nowMs: UInt64) async throws -> MoshCoreFrame {
        events.append("tick:\(nowMs)")
        return MoshCoreFrame(outboundPackets: [Data([0xA3])], nextTickAfterMs: 20)
    }

    func shutdown() async throws -> MoshCoreFrame {
        events.append("shutdown")
        return MoshCoreFrame(outboundPackets: [Data([0xA4])], cleanShutdown: true)
    }
}
