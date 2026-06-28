import Foundation
import HovviMobileCore
import HovviMobileUI

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
try manifestEnvelope.payload.manifest.validateSupportedMoshAttachManifest()

do {
    let unsupportedKindManifest = AttachManifest(
        kind: "ssh-tmux",
        version: 1,
        deviceId: "dev_1",
        deviceName: "Mac",
        sessionName: "main",
        user: "jaeman",
        methods: [],
        scrollback: ScrollbackSource(source: "tmux.capture-pane", command: [], lines: 2000),
        controlMode: ControlModeSource(source: "tmux.control-mode", command: [])
    )
    try unsupportedKindManifest.validateSupportedMoshAttachManifest()
    throw SmokeError("unsupported attach manifest kind should fail")
} catch MoshRelayDatagramSessionError.unsupportedManifestKind(let kind) {
    try require(kind == "ssh-tmux", "unsupported attach manifest kind should be reported")
}

do {
    let unsupportedVersionManifest = AttachManifest(
        kind: "mosh-tmux",
        version: 2,
        deviceId: "dev_1",
        deviceName: "Mac",
        sessionName: "main",
        user: "jaeman",
        methods: [],
        scrollback: ScrollbackSource(source: "tmux.capture-pane", command: [], lines: 2000),
        controlMode: ControlModeSource(source: "tmux.control-mode", command: [])
    )
    try unsupportedVersionManifest.validateSupportedMoshAttachManifest()
    throw SmokeError("unsupported attach manifest version should fail")
} catch MoshRelayDatagramSessionError.unsupportedManifestVersion(let version) {
    try require(version == 2, "unsupported attach manifest version should be reported")
}

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
await fakeRelay.enqueue(frame: .close)
let closedMoshPacket = try await moshSession.receivePacket(timeout: .seconds(1))
try require(closedMoshPacket == nil, "mosh session should surface relay datagram close")
try require(
    await moshSession.connectedChannelId() == nil,
    "mosh session should clear channel after relay datagram close"
)
do {
    _ = try await moshSession.sendPacket(Data([0x06]))
    throw SmokeError("mosh session should reject stale sends after relay datagram close")
} catch MoshRelayDatagramSessionError.notConnected {
}
try await moshSession.close()
try require(await fakeRelay.closedChannelId == nil, "mosh session close should no-op after relay datagram close")

let inboundOversizeRelay = FakeDatagramRelay(expectedMaxDatagramBytes: 2)
let inboundOversizeTransport = AttachTransport(
    kind: moshTransport.kind,
    label: moshTransport.label,
    remoteHost: moshTransport.remoteHost,
    remotePort: moshTransport.remotePort,
    key: moshTransport.key,
    maxDatagramBytes: 2
)
let inboundOversizeSession = try MoshRelayDatagramSession(
    relay: inboundOversizeRelay,
    deviceId: "dev_1",
    transport: inboundOversizeTransport
)
_ = try await inboundOversizeSession.connect()
await inboundOversizeRelay.enqueue(frame: .data(Data([0x01, 0x02, 0x03]), sequence: 13))
do {
    _ = try await inboundOversizeSession.receivePacket(timeout: .seconds(1))
    throw SmokeError("mosh session should reject oversized inbound relay datagrams")
} catch MoshRelayDatagramSessionError.packetTooLarge(let size, let max) {
    try require(size == 3, "oversized inbound datagram should report actual byte count")
    try require(max == 2, "oversized inbound datagram should report configured max")
}
try require(
    await inboundOversizeSession.connectedChannelId() == nil,
    "oversized inbound datagram should clear connected channel"
)
try require(
    await inboundOversizeRelay.closedChannelId == "dg_fake",
    "oversized inbound datagram should close the relay channel"
)

let datagramErrorRelay = FakeDatagramRelay()
let datagramErrorSession = try MoshRelayDatagramSession(
    relay: datagramErrorRelay,
    deviceId: "dev_1",
    transport: moshTransport
)
_ = try await datagramErrorSession.connect()
await datagramErrorRelay.enqueue(
    error: RelayClientError.datagramFailed(DatagramErrorPayload(channelId: "dg_fake", message: "relay closed channel"))
)
do {
    _ = try await datagramErrorSession.receivePacket(timeout: .seconds(1))
    throw SmokeError("mosh session should surface relay datagram errors")
} catch RelayClientError.datagramFailed(let payload) {
    try require(payload.channelId == "dg_fake", "mosh session should preserve relay datagram error channel")
}
try require(
    await datagramErrorSession.connectedChannelId() == nil,
    "mosh session should clear channel after relay datagram error"
)
do {
    _ = try await datagramErrorSession.sendPacket(Data([0x06]))
    throw SmokeError("mosh session should reject stale sends after relay datagram error")
} catch MoshRelayDatagramSessionError.notConnected {
}

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
try require(TerminalInputCommand.text("paste\nblock").bytes == Data("paste\nblock".utf8), "terminal text input should preserve pasted bytes")
try require(TerminalInputCommand.paste("paste\nblock", bracketed: false).bytes == Data("paste\nblock".utf8), "terminal paste input should preserve raw bytes when bracketed paste is disabled")
try require(
    TerminalInputCommand.paste("paste\nblock", bracketed: true).bytes == Data("\u{001B}[200~paste\nblock\u{001B}[201~".utf8),
    "terminal paste input should wrap bytes when bracketed paste is enabled"
)
try require(TerminalInputCommand.userText("echo hi", bracketedPasteEnabled: true) == .text("echo hi"), "terminal user text helper should keep single-line input as text")
try require(TerminalInputCommand.userText("paste\nblock", bracketedPasteEnabled: false) == .paste("paste\nblock", bracketed: false), "terminal user text helper should treat multiline input as paste")
try require(TerminalInputCommand.userText("paste\nblock", bracketedPasteEnabled: true) == .paste("paste\nblock", bracketed: true), "terminal user text helper should preserve bracketed paste mode")
try require(TerminalInputCommand.carriageReturn.bytes == Data([0x0D]), "terminal return input should encode carriage return")
try require(TerminalInputCommand.tab.bytes == Data([0x09]), "terminal tab input should encode HT")
try require(TerminalInputCommand.escape.bytes == Data([0x1B]), "terminal escape input should encode ESC")
try require(TerminalInputCommand.interrupt.bytes == Data([0x03]), "terminal interrupt input should encode Ctrl-C")
try require(TerminalInputCommand.backspace.bytes == Data([0x7F]), "terminal backspace input should encode DEL")
try require(TerminalInputCommand.arrowUp.bytes == Data("\u{001B}[A".utf8), "terminal arrow up should encode CSI A")
try require(TerminalInputCommand.arrowDown.bytes == Data("\u{001B}[B".utf8), "terminal arrow down should encode CSI B")
try require(TerminalInputCommand.arrowRight.bytes == Data("\u{001B}[C".utf8), "terminal arrow right should encode CSI C")
try require(TerminalInputCommand.arrowLeft.bytes == Data("\u{001B}[D".utf8), "terminal arrow left should encode CSI D")
try require(TerminalInputCommand.arrowUp.bytes(applicationCursorKeysMode: true) == Data("\u{001B}OA".utf8), "terminal application arrow up should encode SS3 A")
try require(TerminalInputCommand.arrowDown.bytes(applicationCursorKeysMode: true) == Data("\u{001B}OB".utf8), "terminal application arrow down should encode SS3 B")
try require(TerminalInputCommand.arrowRight.bytes(applicationCursorKeysMode: true) == Data("\u{001B}OC".utf8), "terminal application arrow right should encode SS3 C")
try require(TerminalInputCommand.arrowLeft.bytes(applicationCursorKeysMode: true) == Data("\u{001B}OD".utf8), "terminal application arrow left should encode SS3 D")
try require(TerminalInputCommand.home.bytes == Data("\u{001B}[H".utf8), "terminal home should encode CSI H")
try require(TerminalInputCommand.end.bytes == Data("\u{001B}[F".utf8), "terminal end should encode CSI F")
try require(TerminalInputCommand.pageUp.bytes == Data("\u{001B}[5~".utf8), "terminal page up should encode CSI 5 tilde")
try require(TerminalInputCommand.pageDown.bytes == Data("\u{001B}[6~".utf8), "terminal page down should encode CSI 6 tilde")
try require(TerminalInputCommand.deleteForward.bytes == Data("\u{001B}[3~".utf8), "terminal delete should encode CSI 3 tilde")
try require(AttachShellLifecyclePolicy.shouldRunAttachLoops(phase: .attached), "attach lifecycle should run loops while attached")
try require(AttachShellLifecyclePolicy.shouldRunAttachLoops(phase: .browsing) == false, "attach lifecycle should not run loops while browsing")
try require(AttachShellLifecyclePolicy.shouldRunAttachLoops(phase: .failed) == false, "attach lifecycle should not run loops after failure")
try require(AttachShellLifecyclePolicy.shouldPauseAttachLoops(enteringBackground: true), "attach lifecycle should pause loops in background")
try require(AttachShellLifecyclePolicy.shouldPauseAttachLoops(enteringBackground: false) == false, "attach lifecycle should not pause loops outside background")
try require(
    AttachShellLifecyclePolicy.shouldApplyLoopSnapshot(loopGeneration: 2, currentGeneration: 2),
    "attach lifecycle should apply snapshots from the active loop generation"
)
try require(
    AttachShellLifecyclePolicy.shouldApplyLoopSnapshot(loopGeneration: 1, currentGeneration: 2) == false,
    "attach lifecycle should reject stale receive or tick loop snapshots"
)
try require(
    AttachShellLifecyclePolicy.shouldApplyUserActionSnapshot(actionGeneration: 4, currentGeneration: 4),
    "attach lifecycle should apply snapshots from the active user action generation"
)
try require(
    AttachShellLifecyclePolicy.shouldApplyUserActionSnapshot(actionGeneration: 3, currentGeneration: 4) == false,
    "attach lifecycle should reject stale user action snapshots"
)
try require(
    AttachShellLifecyclePolicy.shouldStartTickLoop(afterApplying: .attached),
    "attach lifecycle should continue ticking after attached snapshots"
)
try require(
    AttachShellLifecyclePolicy.shouldStartTickLoop(afterApplying: .failed) == false,
    "attach lifecycle should not start ticks after failed snapshots"
)
try require(
    AttachShellLifecyclePolicy.shouldStartTickLoop(afterApplying: .browsing) == false,
    "attach lifecycle should not start ticks after browsing snapshots"
)
try require(
    AttachShellLifecyclePolicy.shouldCancelTickLoop(afterApplying: .attached) == false,
    "attach lifecycle should keep ticks after attached snapshots"
)
try require(
    AttachShellLifecyclePolicy.shouldCancelTickLoop(afterApplying: .failed),
    "attach lifecycle should cancel ticks after failed snapshots"
)
try require(
    AttachShellLifecyclePolicy.shouldCancelTickLoop(afterApplying: .browsing),
    "attach lifecycle should cancel ticks after browsing snapshots"
)
try require(
    AttachShellRecoveryPolicy.retryTitle(for: .reattachSession) == "Reattach",
    "attach recovery policy should label session recovery as reattach"
)
try require(
    AttachShellRecoveryPolicy.retryTitle(for: .connectRelay) == "Reconnect",
    "attach recovery policy should label relay recovery as reconnect"
)
try require(
    AttachShellRecoveryPolicy.retryTitle(for: nil) == "Retry",
    "attach recovery policy should keep a generic fallback retry label"
)
try require(
    AttachShellRecoveryPolicy.shouldReattachSession(for: .reattachSession),
    "attach recovery policy should route session recovery to attach"
)
try require(
    AttachShellRecoveryPolicy.shouldReattachSession(for: .connectRelay) == false,
    "attach recovery policy should route relay recovery to connect"
)
try require(
    AttachShellRecoveryPolicy.shouldReattachSession(for: nil) == false,
    "attach recovery policy should route unknown recovery to connect"
)

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

let explicitBootstrap = AppBootstrapConfig(
    environment: [
        "HOVVI_RELAY_URL": "wss://relay.example.test",
        "HOVVI_RELAY_TOKEN": "hovvi_secret_token_123",
        "HOVVI_CLIENT_ID": "ios-device-1",
    ]
)
try require(explicitBootstrap.relayURL.absoluteString == "wss://relay.example.test", "app bootstrap should read relay URL from environment")
try require(explicitBootstrap.relayToken == "hovvi_secret_token_123", "app bootstrap should read relay token from HOVVI_RELAY_TOKEN")
try require(explicitBootstrap.relayTokenSource == .relayTokenEnvironment, "app bootstrap should record relay token source")
try require(explicitBootstrap.clientId == "ios-device-1", "app bootstrap should read client id from environment")
try require(explicitBootstrap.redactedRelayToken == "hov...123", "app bootstrap should redact relay tokens")
try require(explicitBootstrap.usesDevelopmentDefaultToken == false, "app bootstrap should not mark explicit tokens as development defaults")
let legacyBootstrap = AppBootstrapConfig(environment: ["HOVVI_TOKEN": "legacy_token_456"])
try require(legacyBootstrap.relayToken == "legacy_token_456", "app bootstrap should support legacy token environment")
try require(legacyBootstrap.relayTokenSource == .legacyTokenEnvironment, "app bootstrap should record legacy token source")
let developmentBootstrap = AppBootstrapConfig(environment: [:])
try require(developmentBootstrap.relayURL == AppBootstrapConfig.defaultRelayURL, "app bootstrap should default to local relay URL")
try require(developmentBootstrap.relayToken == AppBootstrapConfig.developmentRelayToken, "app bootstrap should keep explicit development fallback")
try require(developmentBootstrap.relayTokenSource == .developmentDefault, "app bootstrap should record development fallback")
try require(developmentBootstrap.usesDevelopmentDefaultToken, "app bootstrap should expose development fallback use")
try require(developmentBootstrap.validationIssue == nil, "app bootstrap should allow development tokens for the local relay")
let hostedBootstrapWithoutToken = AppBootstrapConfig(environment: ["HOVVI_RELAY_URL": "wss://user:pass@relay.example.test"])
try require(hostedBootstrapWithoutToken.usesDevelopmentDefaultToken, "hosted bootstrap without token should still record development fallback")
try require(hostedBootstrapWithoutToken.validationIssue?.title == "Relay token required", "hosted bootstrap should reject development fallback tokens")
try require(
    hostedBootstrapWithoutToken.validationIssue?.message.contains("user:pass") == false,
    "hosted bootstrap validation should redact relay URL credentials"
)
try require(
    hostedBootstrapWithoutToken.validationIssue?.message.contains("relay.example.test") == true,
    "hosted bootstrap validation should preserve relay host context"
)
try require(
    hostedBootstrapWithoutToken.validationIssue?.message.contains("redacted") == true,
    "hosted bootstrap validation should include a redaction marker"
)
let localExplicitBootstrap = AppBootstrapConfig(environment: ["HOVVI_RELAY_URL": "ws://localhost:8787"])
try require(localExplicitBootstrap.validationIssue == nil, "app bootstrap should allow development fallback on localhost")
let invalidURLBootstrap = AppBootstrapConfig(environment: ["HOVVI_RELAY_URL": "://not-a-url"])
try require(invalidURLBootstrap.relayURLWasInvalid, "app bootstrap should record invalid relay URLs")
try require(invalidURLBootstrap.validationIssue?.title == "Invalid relay URL", "app bootstrap should reject invalid relay URLs")
try require(AppBootstrapConfig.redactToken("dev") == "[redacted]", "short bootstrap tokens should be fully redacted")

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

var terminalScreen = TerminalScreen(columns: 8, rows: 3)
terminalScreen.apply("hello")
try require(terminalScreen.visibleLines.map(\.text) == ["hello", "", ""], "terminal screen should write printable text")
terminalScreen.apply("\rHELLO\r\nworld")
try require(terminalScreen.visibleLines.map(\.text) == ["HELLO", "world", ""], "terminal screen should handle carriage return and newline")
terminalScreen.apply("\u{001B}[1;3HZ")
try require(terminalScreen.visibleLines[0].text == "HEZLO", "terminal screen should move cursor with CSI row column")
terminalScreen.apply("\u{001B}[2EX")
try require(
    terminalScreen.cursorRow == 2 && terminalScreen.cursorColumn == 1 && terminalScreen.visibleLines[2].text == "X",
    "terminal screen CSI E should move to the next line and reset column"
)
terminalScreen.apply("\u{001B}[FY")
try require(
    terminalScreen.cursorRow == 1 && terminalScreen.cursorColumn == 1 && terminalScreen.visibleLines[1].text == "Yorld",
    "terminal screen CSI F should move to the previous line and reset column"
)
terminalScreen.apply("\u{001B}[5GZ")
try require(terminalScreen.visibleLines[1].text == "YorlZ", "terminal screen CSI G should move to an absolute column")
terminalScreen.apply("\u{001B}[2J\u{001B}[Hclear")
try require(terminalScreen.visibleLines.map(\.text) == ["clear", "", ""], "terminal screen should clear screen")
terminalScreen.apply("\u{001B}[2K\u{001B}[Hline")
try require(terminalScreen.visibleLines[0].text == "line", "terminal screen should erase the current line")
terminalScreen.resize(columns: 4, rows: 2)
try require(terminalScreen.visibleLines.map(\.text) == ["line", ""], "terminal screen resize should preserve visible cells")
var autoWrapScreen = TerminalScreen(columns: 4, rows: 2)
try require(autoWrapScreen.isAutoWrapModeEnabled, "terminal screen should enable autowrap by default")
autoWrapScreen.apply("abcdE")
try require(autoWrapScreen.visibleLines.map(\.text) == ["abcd", "E"], "terminal screen should autowrap printable text by default")
var disabledAutoWrapScreen = TerminalScreen(columns: 4, rows: 2)
disabledAutoWrapScreen.apply("\u{001B}[?7labcdE")
try require(disabledAutoWrapScreen.isAutoWrapModeEnabled == false, "terminal screen should disable autowrap on CSI ?7 l")
try require(disabledAutoWrapScreen.visibleLines.map(\.text) == ["abcE", ""], "terminal screen should overwrite the last column while autowrap is disabled")
try require(disabledAutoWrapScreen.cursorRow == 0 && disabledAutoWrapScreen.cursorColumn == 3, "terminal screen should clamp cursor at the right edge while autowrap is disabled")
disabledAutoWrapScreen.apply("\u{001B}[?7hF")
try require(disabledAutoWrapScreen.isAutoWrapModeEnabled, "terminal screen should enable autowrap on CSI ?7 h")
try require(disabledAutoWrapScreen.visibleLines.map(\.text) == ["abcF", ""], "terminal screen should write at the edge before the next autowrap")
disabledAutoWrapScreen.apply("G")
try require(disabledAutoWrapScreen.visibleLines.map(\.text) == ["abcF", "G"], "terminal screen should resume autowrap after re-enabling mode")
var resetScreen = TerminalScreen(columns: 8, rows: 2)
resetScreen.apply("text\u{001B}[?25l\u{001B}[?1h\u{001B}[?7l\u{001B}[?2004h\u{001B}[31mred\u{001B}(0q\u{001B}H")
resetScreen.apply("\u{001B}c")
try require(resetScreen.visibleLines.map(\.text) == ["", ""], "terminal RIS should clear the live screen")
try require(resetScreen.cursorRow == 0 && resetScreen.cursorColumn == 0, "terminal RIS should home the cursor")
try require(resetScreen.isCursorVisible, "terminal RIS should restore visible cursor mode")
try require(resetScreen.isApplicationCursorKeysModeEnabled == false, "terminal RIS should disable application cursor keys")
try require(resetScreen.isAutoWrapModeEnabled, "terminal RIS should restore autowrap mode")
try require(resetScreen.isBracketedPasteModeEnabled == false, "terminal RIS should disable bracketed paste mode")
resetScreen.apply("q")
try require(resetScreen.visibleLines[0].text == "q", "terminal RIS should restore ASCII character set")
var wideScreen = TerminalScreen(columns: 4, rows: 2)
wideScreen.apply("한a👍b")
try require(wideScreen.visibleLines.map(\.text) == ["한a", "👍b"], "terminal screen should advance wide graphemes by two cells")
var combiningScreen = TerminalScreen(columns: 8, rows: 1)
combiningScreen.apply("e\u{0301}x")
try require(combiningScreen.visibleLines[0].text == "e\u{0301}x", "terminal screen should attach combining marks to the previous cell")
var oscBelScreen = TerminalScreen(columns: 16, rows: 1)
oscBelScreen.apply("before\u{001B}]0;tmux title\u{0007}after")
try require(
    oscBelScreen.visibleLines[0].text == "beforeafter",
    "terminal screen should skip OSC sequences terminated by BEL"
)
var oscStScreen = TerminalScreen(columns: 16, rows: 1)
oscStScreen.apply("left\u{001B}]1337;SetBadgeFormat=ignored\u{001B}\\right")
try require(
    oscStScreen.visibleLines[0].text == "leftright",
    "terminal screen should skip OSC sequences terminated by ST"
)
var splitOscBelScreen = TerminalScreen(columns: 16, rows: 1)
splitOscBelScreen.apply("a\u{001B}]0;split title")
splitOscBelScreen.apply(" still metadata\u{0007}b")
try require(
    splitOscBelScreen.visibleLines[0].text == "ab",
    "terminal screen should keep skipping split OSC sequences until BEL"
)
var splitOscStScreen = TerminalScreen(columns: 16, rows: 1)
splitOscStScreen.apply("x\u{001B}]1337;split\u{001B}")
splitOscStScreen.apply("\\y")
try require(
    splitOscStScreen.visibleLines[0].text == "xy",
    "terminal screen should keep skipping split OSC sequences until ST"
)
var c1ControlScreen = TerminalScreen(columns: 16, rows: 1)
c1ControlScreen.apply("abc\u{009B}1;1HZ")
try require(
    c1ControlScreen.visibleLines[0].text == "Zbc",
    "terminal screen should parse C1 CSI sequences without printing control bytes"
)
var indexControlScreen = TerminalScreen(columns: 8, rows: 3)
indexControlScreen.apply("one\u{001B}Dtwo\u{001B}Ethree")
try require(
    indexControlScreen.visibleLines.map(\.text) == ["one", "   two", "three"],
    "terminal screen should parse ESC D index and ESC E next-line controls"
)
var c1IndexControlScreen = TerminalScreen(columns: 8, rows: 3)
c1IndexControlScreen.apply("one\u{0084}two\u{0085}three")
try require(
    c1IndexControlScreen.visibleLines.map(\.text) == ["one", "   two", "three"],
    "terminal screen should parse C1 IND and NEL controls"
)
var c1ReverseIndexScreen = TerminalScreen(columns: 8, rows: 3)
c1ReverseIndexScreen.apply("\u{001B}[1;1Htop\u{001B}[2;1Hmid\u{001B}[3;1Hbot\u{001B}[1;3r\u{001B}[1;1H\u{008D}")
try require(
    c1ReverseIndexScreen.visibleLines.map(\.text) == ["", "top", "mid"],
    "terminal screen should parse C1 RI as reverse index inside the active scroll region"
)
var c1HorizontalTabSetScreen = TerminalScreen(columns: 12, rows: 1)
c1HorizontalTabSetScreen.apply("\u{001B}[1;4H\u{0088}\u{001B}[1;1Ha\tb")
try require(
    c1HorizontalTabSetScreen.visibleLines[0].text == "a  b",
    "terminal screen should parse C1 HTS as a horizontal tab stop"
)
var c1OscScreen = TerminalScreen(columns: 16, rows: 1)
c1OscScreen.apply("a\u{009D}0;c1 title\u{009C}b")
try require(
    c1OscScreen.visibleLines[0].text == "ab",
    "terminal screen should skip C1 OSC sequences terminated by C1 ST"
)
var splitC1OscScreen = TerminalScreen(columns: 16, rows: 1)
splitC1OscScreen.apply("x\u{009D}0;split")
splitC1OscScreen.apply(" metadata\u{009C}y")
try require(
    splitC1OscScreen.visibleLines[0].text == "xy",
    "terminal screen should keep skipping split C1 OSC sequences until C1 ST"
)
var asciiCharsetScreen = TerminalScreen(columns: 16, rows: 1)
asciiCharsetScreen.apply("a\u{001B}(Bb")
try require(
    asciiCharsetScreen.visibleLines[0].text == "ab",
    "terminal screen should consume ASCII charset designation without printing control bytes"
)
var decLineDrawingScreen = TerminalScreen(columns: 16, rows: 1)
decLineDrawingScreen.apply("\u{001B}(0lqkxmj\u{001B}(B!")
try require(
    decLineDrawingScreen.visibleLines[0].text == "┌─┐│└┘!",
    "terminal screen should map DEC special graphics line drawing characters"
)
var cursorRenderScreen = TerminalScreen(columns: 8, rows: 1)
try require(cursorRenderScreen.isCursorVisible, "terminal cursor should be visible by default")
cursorRenderScreen.apply("ab")
try require(cursorRenderScreen.visibleLines[0].text == "ab", "terminal cursor tracking should not change visible text")
cursorRenderScreen.apply("\u{001B}[?25l")
try require(cursorRenderScreen.isCursorVisible == false, "terminal screen should hide cursor on CSI ?25 l")
try require(
    cursorRenderScreen.visibleLines[0].text == "ab",
    "terminal hidden cursor should not change visible text"
)
cursorRenderScreen.apply("\u{001B}[?25h")
try require(cursorRenderScreen.isCursorVisible, "terminal screen should show cursor on CSI ?25 h")
try require(
    cursorRenderScreen.visibleLines[0].text == "ab",
    "terminal shown cursor should not change visible text"
)
var bracketedPasteModeScreen = TerminalScreen(columns: 8, rows: 1)
bracketedPasteModeScreen.apply("\u{001B}[?2004h")
try require(bracketedPasteModeScreen.isBracketedPasteModeEnabled, "terminal screen should enable bracketed paste mode")
bracketedPasteModeScreen.apply("\u{001B}[?2004l")
try require(bracketedPasteModeScreen.isBracketedPasteModeEnabled == false, "terminal screen should disable bracketed paste mode")
var applicationCursorKeysModeScreen = TerminalScreen(columns: 8, rows: 1)
applicationCursorKeysModeScreen.apply("\u{001B}[?1h")
try require(applicationCursorKeysModeScreen.isApplicationCursorKeysModeEnabled, "terminal screen should enable application cursor keys mode")
applicationCursorKeysModeScreen.apply("\u{001B}[?1l")
try require(applicationCursorKeysModeScreen.isApplicationCursorKeysModeEnabled == false, "terminal screen should disable application cursor keys mode")
var attributedScreen = TerminalScreen(columns: 24, rows: 2)
attributedScreen.apply("plain \u{001B}[1;31mbold-red\u{001B}[0m normal")
let attributedRuns = attributedScreen.visibleLines[0].runs
try require(attributedRuns.map(\.text) == ["plain ", "bold-red", " normal"], "terminal screen should split SGR runs")
try require(attributedRuns[1].attributes.bold, "terminal screen should preserve bold SGR")
try require(attributedRuns[1].attributes.foreground == .red, "terminal screen should preserve foreground SGR")
try require(attributedRuns[2].attributes == TerminalTextAttributes(), "terminal screen should reset SGR attributes")
var extendedColorScreen = TerminalScreen(columns: 32, rows: 2)
extendedColorScreen.apply("\u{001B}[38;5;202mindexed\u{001B}[38;2;12;34;56mtruecolor\u{001B}[39mplain")
let extendedColorRuns = extendedColorScreen.visibleLines[0].runs
try require(extendedColorRuns.map(\.text) == ["indexed", "truecolor", "plain"], "terminal screen should split extended color SGR runs")
try require(extendedColorRuns[0].attributes.foreground == .indexed(202), "terminal screen should preserve 256-color foreground SGR")
try require(extendedColorRuns[1].attributes.foreground == .rgb(red: 12, green: 34, blue: 56), "terminal screen should preserve truecolor foreground SGR")
try require(extendedColorRuns[2].attributes.foreground == nil, "terminal screen should reset extended foreground SGR")
var backgroundColorScreen = TerminalScreen(columns: 40, rows: 2)
backgroundColorScreen.apply("\u{001B}[44mblue-bg\u{001B}[48;5;22mindexed-bg\u{001B}[48;2;1;2;3mtrue-bg\u{001B}[49mplain")
let backgroundColorRuns = backgroundColorScreen.visibleLines[0].runs
try require(backgroundColorRuns.map(\.text) == ["blue-bg", "indexed-bg", "true-bg", "plain"], "terminal screen should split background color SGR runs")
try require(backgroundColorRuns[0].attributes.background == .blue, "terminal screen should preserve standard background SGR")
try require(backgroundColorRuns[1].attributes.background == .indexed(22), "terminal screen should preserve 256-color background SGR")
try require(backgroundColorRuns[2].attributes.background == .rgb(red: 1, green: 2, blue: 3), "terminal screen should preserve truecolor background SGR")
try require(backgroundColorRuns[3].attributes.background == nil, "terminal screen should reset background SGR")
var inverseScreen = TerminalScreen(columns: 20, rows: 1)
inverseScreen.apply("\u{001B}[7minverse\u{001B}[27mplain")
let inverseRuns = inverseScreen.visibleLines[0].runs
try require(inverseRuns.map(\.text) == ["inverse", "plain"], "terminal screen should split inverse SGR runs")
try require(inverseRuns[0].attributes.inverse, "terminal screen should preserve inverse SGR")
try require(inverseRuns[1].attributes.inverse == false, "terminal screen should reset inverse SGR")
var scrollRegionScreen = TerminalScreen(columns: 8, rows: 5)
scrollRegionScreen.apply("\u{001B}[1;1Htop")
scrollRegionScreen.apply("\u{001B}[2;1Hone")
scrollRegionScreen.apply("\u{001B}[3;1Htwo")
scrollRegionScreen.apply("\u{001B}[4;1Hthree")
scrollRegionScreen.apply("\u{001B}[5;1Hbottom")
scrollRegionScreen.apply("\u{001B}[2;4r\u{001B}[4;1H\u{001B}[2Knew\n")
try require(
    scrollRegionScreen.visibleLines.map(\.text) == ["top", "two", "new", "", "bottom"],
    "terminal screen should scroll only inside the active scroll region"
)
var reverseIndexScreen = TerminalScreen(columns: 8, rows: 5)
reverseIndexScreen.apply("\u{001B}[1;1Htop")
reverseIndexScreen.apply("\u{001B}[2;1Hone")
reverseIndexScreen.apply("\u{001B}[3;1Htwo")
reverseIndexScreen.apply("\u{001B}[4;1Hthree")
reverseIndexScreen.apply("\u{001B}[5;1Hbottom")
reverseIndexScreen.apply("\u{001B}[2;4r\u{001B}[2;1H\u{001B}M")
try require(
    reverseIndexScreen.visibleLines.map(\.text) == ["top", "", "one", "two", "bottom"],
    "terminal screen should reverse-scroll only inside the active scroll region"
)
var reverseIndexMoveScreen = TerminalScreen(columns: 8, rows: 5)
reverseIndexMoveScreen.apply("\u{001B}[3;1Htwo\u{001B}M")
try require(
    reverseIndexMoveScreen.cursorRow == 1 && reverseIndexMoveScreen.visibleLines[2].text == "two",
    "terminal screen reverse index away from the margin should move the cursor without scrolling"
)
var originModeScreen = TerminalScreen(columns: 10, rows: 5)
originModeScreen.apply("\u{001B}[2;4r\u{001B}[?6h\u{001B}[1;1Horigin")
try require(
    originModeScreen.cursorRow == 1 && originModeScreen.visibleLines.map(\.text) == ["", "origin", "", "", ""],
    "terminal screen origin mode should address rows relative to the scroll region"
)
originModeScreen.apply("\u{001B}[5B")
try require(originModeScreen.cursorRow == 3, "terminal screen origin mode should clamp cursor down to the bottom margin")
originModeScreen.apply("\u{001B}[10E")
try require(originModeScreen.cursorRow == 3 && originModeScreen.cursorColumn == 0, "terminal screen origin mode should clamp CSI E to the bottom margin")
originModeScreen.apply("\u{001B}[10F")
try require(originModeScreen.cursorRow == 1 && originModeScreen.cursorColumn == 0, "terminal screen origin mode should clamp CSI F to the top margin")
originModeScreen.apply("\u{001B}[2;4H\u{001B}[2aX\u{001B}[2eY\u{001B}[1d")
try require(
    originModeScreen.cursorRow == 1 && originModeScreen.cursorColumn == 7,
    "terminal screen CSI d should move only the row and preserve the current column"
)
originModeScreen.apply("Z")
try require(
    originModeScreen.visibleLines.map(\.text) == ["", "origin Z", "     X", "      Y", ""],
    "terminal screen should support CSI a/e/d cursor movement aliases inside origin mode"
)
originModeScreen.apply("\u{001B}[?6l\u{001B}[1;1Htop")
try require(
    originModeScreen.cursorRow == 0 && originModeScreen.visibleLines[0].text == "top",
    "terminal screen should restore absolute row addressing when origin mode is disabled"
)
var savedCursorScreen = TerminalScreen(columns: 12, rows: 3)
savedCursorScreen.apply("\u{001B}[2;3H\u{001B}[31m\u{001B}7\u{001B}[1;1Hplain\u{001B}[0m\u{001B}8X")
try require(
    savedCursorScreen.cursorRow == 1 && savedCursorScreen.cursorColumn == 3,
    "terminal screen should restore DEC saved cursor position"
)
try require(
    savedCursorScreen.visibleLines.map(\.text) == ["plain", "  X", ""],
    "terminal screen should write at the restored DEC cursor position"
)
try require(
    savedCursorScreen.visibleLines[1].runs.last?.attributes.foreground == .red,
    "terminal screen should restore DEC saved cursor attributes"
)
var savedCharacterSetScreen = TerminalScreen(columns: 12, rows: 1)
savedCharacterSetScreen.apply("\u{001B}(0 \u{001B}7\u{001B}(B\rq\u{001B}8q")
try require(
    savedCharacterSetScreen.visibleLines[0].text == "q─",
    "terminal screen should restore DEC saved cursor character set"
)
var csiSavedCursorScreen = TerminalScreen(columns: 12, rows: 3)
csiSavedCursorScreen.apply("\u{001B}[3;4H\u{001B}[1m\u{001B}[s\u{001B}[1;1Htop\u{001B}[0m\u{001B}[uB")
try require(
    csiSavedCursorScreen.cursorRow == 2 && csiSavedCursorScreen.cursorColumn == 4,
    "terminal screen should restore CSI saved cursor position"
)
try require(
    csiSavedCursorScreen.visibleLines[2].runs.last?.attributes.bold == true,
    "terminal screen should restore CSI saved cursor attributes"
)
var csiSavedCharacterSetScreen = TerminalScreen(columns: 12, rows: 1)
csiSavedCharacterSetScreen.apply("\u{001B}(0 \u{001B}[s\u{001B}(B\rq\u{001B}[uq")
try require(
    csiSavedCharacterSetScreen.visibleLines[0].text == "q─",
    "terminal screen should restore CSI saved cursor character set"
)
var lineEditScreen = TerminalScreen(columns: 10, rows: 6)
lineEditScreen.apply("\u{001B}[1;1Htop")
lineEditScreen.apply("\u{001B}[2;1Hone")
lineEditScreen.apply("\u{001B}[3;1Htwo")
lineEditScreen.apply("\u{001B}[4;1Hthree")
lineEditScreen.apply("\u{001B}[5;1Hfour")
lineEditScreen.apply("\u{001B}[6;1Hbottom")
lineEditScreen.apply("\u{001B}[2;5r\u{001B}[3;1H\u{001B}[2L")
try require(
    lineEditScreen.visibleLines.map(\.text) == ["top", "one", "", "", "two", "bottom"],
    "terminal screen should insert blank lines inside the active scroll region"
)
lineEditScreen.apply("\u{001B}[3;1H\u{001B}[2M")
try require(
    lineEditScreen.visibleLines.map(\.text) == ["top", "one", "two", "", "", "bottom"],
    "terminal screen should delete lines inside the active scroll region"
)
lineEditScreen.apply("\u{001B}[1;1H\u{001B}[L")
try require(
    lineEditScreen.visibleLines.map(\.text) == ["top", "one", "two", "", "", "bottom"],
    "terminal screen should ignore line insert outside the active scroll region"
)
var scrollScreen = TerminalScreen(columns: 8, rows: 5)
scrollScreen.apply("one\r\ntwo\r\nthree\r\nfour\r\nfive")
scrollScreen.apply("\u{001B}[2S")
try require(
    scrollScreen.visibleLines.map(\.text) == ["three", "four", "five", "", ""],
    "terminal screen CSI S should scroll the active region up"
)
scrollScreen.apply("\u{001B}[T")
try require(
    scrollScreen.visibleLines.map(\.text) == ["", "three", "four", "five", ""],
    "terminal screen CSI T should scroll the active region down"
)
var boundedScrollScreen = TerminalScreen(columns: 8, rows: 5)
boundedScrollScreen.apply("top\r\none\r\ntwo\r\nthree\r\nbottom")
boundedScrollScreen.apply("\u{001B}[2;4r\u{001B}[S")
try require(
    boundedScrollScreen.visibleLines.map(\.text) == ["top", "two", "three", "", "bottom"],
    "terminal screen CSI S should scroll only inside the active scroll region"
)
boundedScrollScreen.apply("\u{001B}[T")
try require(
    boundedScrollScreen.visibleLines.map(\.text) == ["top", "", "two", "three", "bottom"],
    "terminal screen CSI T should scroll down only inside the active scroll region"
)
var characterEditScreen = TerminalScreen(columns: 8, rows: 2)
characterEditScreen.apply("abcdef")
characterEditScreen.apply("\u{001B}[1;3H\u{001B}[2@")
try require(
    characterEditScreen.visibleLines.map(\.text) == ["ab  cdef", ""],
    "terminal screen should insert blank characters at the cursor"
)
characterEditScreen.apply("\u{001B}[1;3H\u{001B}[3P")
try require(
    characterEditScreen.visibleLines.map(\.text) == ["abdef", ""],
    "terminal screen should delete characters at the cursor"
)
var attributedCharacterEditScreen = TerminalScreen(columns: 8, rows: 1)
attributedCharacterEditScreen.apply("ab\u{001B}[31m\u{001B}[1;2H\u{001B}[@")
try require(
    attributedCharacterEditScreen.visibleLines[0].runs.map(\.text) == ["a", " ", "b"],
    "terminal screen inserted blanks should remain visible before shifted text"
)
try require(
    attributedCharacterEditScreen.visibleLines[0].runs[1].attributes.foreground == .red,
    "terminal screen inserted blanks should use the current attributes"
)
var tabStopScreen = TerminalScreen(columns: 18, rows: 2)
tabStopScreen.apply("a\tb")
try require(
    tabStopScreen.visibleLines[0].text == "a       b",
    "terminal screen should advance horizontal tab to the next default tab stop"
)
tabStopScreen.apply("\u{001B}[2;5H\u{001B}H\u{001B}[2;1Hc\td")
try require(
    tabStopScreen.visibleLines[1].text == "c   d",
    "terminal screen should honor ESC H custom tab stops"
)
tabStopScreen.apply("\u{001B}[2;5H\u{001B}[g\u{001B}[2;1H\u{001B}[2Ke\tf")
try require(
    tabStopScreen.visibleLines[1].text == "e       f",
    "terminal screen should clear the tab stop at the cursor with CSI g"
)
var clearedTabStopScreen = TerminalScreen(columns: 18, rows: 2)
clearedTabStopScreen.apply("a\u{001B}[3g\tb")
try require(
    clearedTabStopScreen.visibleLines[0].text == "a                b",
    "terminal screen should clear all tab stops with CSI 3 g"
)
var cursorTabScreen = TerminalScreen(columns: 20, rows: 1)
cursorTabScreen.apply("a\u{001B}[2Ib")
try require(
    cursorTabScreen.visibleLines[0].text == "a               b",
    "terminal screen CSI I should advance by repeated tab stops"
)
cursorTabScreen.apply("\u{001B}[1;10H\u{001B}[Zx")
try require(
    cursorTabScreen.visibleLines[0].text == "a       x       b",
    "terminal screen CSI Z should move backward to the previous tab stop"
)
var eraseCharacterScreen = TerminalScreen(columns: 8, rows: 1)
eraseCharacterScreen.apply("abcdef")
eraseCharacterScreen.apply("\u{001B}[31m\u{001B}[1;3H\u{001B}[2X")
try require(
    eraseCharacterScreen.visibleLines[0].runs.map(\.text) == ["ab", "  ", "ef"],
    "terminal screen should erase characters at the cursor without shifting text"
)
try require(
    eraseCharacterScreen.visibleLines[0].runs[1].attributes.foreground == .red,
    "terminal screen erased characters should use the current attributes"
)
var eraseModeScreen = TerminalScreen(columns: 8, rows: 3)
eraseModeScreen.apply("abcdef")
eraseModeScreen.apply("\u{001B}[1;3H\u{001B}[K")
try require(
    eraseModeScreen.visibleLines.map(\.text) == ["ab", "", ""],
    "terminal screen CSI K should erase from cursor to end of line"
)
eraseModeScreen.apply("\u{001B}[1;1Habcdef")
eraseModeScreen.apply("\u{001B}[1;4H\u{001B}[1K")
try require(
    eraseModeScreen.visibleLines.map(\.text) == ["    ef", "", ""],
    "terminal screen CSI 1 K should erase from line start through cursor"
)
eraseModeScreen.apply("\u{001B}[1;1Habcdef")
eraseModeScreen.apply("\u{001B}[1;4H\u{001B}[2K")
try require(
    eraseModeScreen.visibleLines.map(\.text) == ["", "", ""],
    "terminal screen CSI 2 K should erase the entire current line"
)
eraseModeScreen.apply("\u{001B}[1;1Hone")
eraseModeScreen.apply("\u{001B}[2;1Htwoxy")
eraseModeScreen.apply("\u{001B}[3;1Hthree")
eraseModeScreen.apply("\u{001B}[2;3H\u{001B}[J")
try require(
    eraseModeScreen.visibleLines.map(\.text) == ["one", "tw", ""],
    "terminal screen CSI J should erase from cursor to end of display"
)
eraseModeScreen.apply("\u{001B}[1;1Hone")
eraseModeScreen.apply("\u{001B}[2;1Htwoxy")
eraseModeScreen.apply("\u{001B}[3;1Hthree")
eraseModeScreen.apply("\u{001B}[2;3H\u{001B}[1J")
try require(
    eraseModeScreen.visibleLines.map(\.text) == ["", "   xy", "three"],
    "terminal screen CSI 1 J should erase from display start through cursor"
)
eraseModeScreen.apply("\u{001B}[2J")
try require(
    eraseModeScreen.visibleLines.map(\.text) == ["", "", ""],
    "terminal screen CSI 2 J should erase the entire display"
)
var alternateScreen = TerminalScreen(columns: 10, rows: 2)
alternateScreen.apply("primary")
alternateScreen.apply("\u{001B}[?1049halt")
try require(alternateScreen.isAlternateScreenActive, "terminal screen should enter alternate screen")
try require(alternateScreen.visibleLines.map(\.text) == ["alt", ""], "alternate screen should start with a blank surface")
alternateScreen.resize(columns: 8, rows: 2)
alternateScreen.apply("\u{001B}[?1049l")
try require(alternateScreen.isAlternateScreenActive == false, "terminal screen should exit alternate screen")
try require(alternateScreen.visibleLines.map(\.text) == ["primary", ""], "terminal screen should restore primary screen after alternate exit")

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

let shellRelay = FakeAttachShellRelay(
    devices: snapshot.devices,
    manifest: manifestEnvelope.payload.manifest,
    scrollback: ScrollbackResult(sessionName: "main", lines: 2, text: "before\n")
)
let shell = AttachShellModel(relay: shellRelay) {
    FakeMoshCoreEngine()
}

var shellSnapshot = await shell.connectAndLoadDevices(timeout: Duration.seconds(1))
try require(shellSnapshot.phase == AttachShellPhase.browsing, "attach shell should enter browsing phase after loading devices")
try require(shellSnapshot.devices.first?.id == "dev_1", "attach shell should expose relay devices")

shellSnapshot = await shell.selectDevice("dev_1")
try require(shellSnapshot.selectedDeviceId == "dev_1", "attach shell should select device")
try require(shellSnapshot.selectedSessionName == "main", "attach shell should default to first session")
shellSnapshot = await shell.selectSession("main")
try require(shellSnapshot.selectedSessionName == "main", "attach shell should select session")
shellSnapshot = await shell.selectSession("missing")
try require(shellSnapshot.phase == AttachShellPhase.failed, "attach shell should reject missing sessions")
try require(shellSnapshot.recoveryAction == .connectRelay, "missing session should recommend refreshing relay state")
try require(shellSnapshot.selectedDeviceId == "dev_1", "missing session should preserve selected device")
try require(shellSnapshot.selectedSessionName == "main", "missing session should preserve previous valid session")
shellSnapshot = await shell.selectDevice("missing")
try require(shellSnapshot.phase == AttachShellPhase.failed, "attach shell should reject missing devices")
try require(shellSnapshot.recoveryAction == .connectRelay, "missing device should recommend reconnecting relay state")
try require(shellSnapshot.selectedDeviceId == "dev_1", "missing device should preserve previous valid device")
shellSnapshot = await shell.selectDevice("dev_1")
shellSnapshot = await shell.selectSession("main")
try require(shellSnapshot.phase == AttachShellPhase.browsing, "valid selection should recover browsing phase after stale selection errors")

await shellRelay.setDevices([
    Device(
        id: "dev_1",
        name: "Mac",
        platform: "darwin",
        user: "jaeman",
        capabilities: ["tmux.sessions"],
        sessions: [Session(id: "$1", name: "build", kind: "tmux")]
    )
])
shellSnapshot = await shell.connectAndLoadDevices(timeout: Duration.seconds(1))
try require(shellSnapshot.selectedDeviceId == "dev_1", "attach shell should keep selected device after reload")
try require(shellSnapshot.selectedSessionName == "build", "attach shell should replace stale selected session after reload")
await shellRelay.setDevices([
    Device(
        id: "dev_2",
        name: "Mac Studio",
        platform: "darwin",
        user: "jaeman",
        capabilities: ["tmux.sessions"],
        sessions: [Session(id: "$2", name: "main", kind: "tmux")]
    )
])
shellSnapshot = await shell.connectAndLoadDevices(timeout: Duration.seconds(1))
try require(shellSnapshot.selectedDeviceId == nil, "attach shell should clear stale selected device after reload")
try require(shellSnapshot.selectedSessionName == nil, "attach shell should clear stale selected session after reload")
await shellRelay.setDevices(snapshot.devices)
shellSnapshot = await shell.connectAndLoadDevices(timeout: Duration.seconds(1))
shellSnapshot = await shell.selectDevice("dev_1")
shellSnapshot = await shell.selectSession("main")

shellSnapshot = await shell.attach(
    lines: 40,
    initialSize: MoshCoreTerminalSize(columns: 90, rows: 25),
    timeout: Duration.seconds(1)
)
try require(shellSnapshot.phase == AttachShellPhase.attached, "attach shell should enter attached phase")
try require(shellSnapshot.manifest?.sessionName == "main", "attach shell should keep attach manifest")
try require((shellSnapshot.scrollback?.visibleLines.map { $0.text } ?? []) == ["before"], "attach shell should load tmux scrollback")
try require(await shellRelay.connectCalled, "attach shell should connect relay")
try require(await shellRelay.scrollbackRequests == ["dev_1:main:40"], "attach shell should fetch selected scrollback")
try require(await shellRelay.attachRequests == ["dev_1:main:40:false"], "attach shell should prepare selected attach")
try require(
    await shellRelay.sentDatagrams == [SentDatagram(channelId: "dg_shell", bytes: Data([0xA0]), sequence: 0)],
    "attach shell should send startup mosh packet through relay"
)
let scrollbackOnlySurface = TerminalSurfaceProjection.lines(for: shellSnapshot)
try require(scrollbackOnlySurface.map(\.id) == ["scrollback-line-0"], "terminal surface should expose scrollback-only rows before live output")
try require(scrollbackOnlySurface.map(\.source) == [.scrollback], "terminal surface should mark scrollback-only rows")

shellSnapshot = await shell.sendInput(Data("hi".utf8))
try require((shellSnapshot.scrollback?.visibleLines.map { $0.text } ?? []) == ["before"], "attach shell should keep live output out of tmux scrollback")
try require(shellSnapshot.terminalScreen?.visibleLines.first?.text == "local", "attach shell should update live terminal screen")
try require(shellSnapshot.terminalOutput == Data("local".utf8), "attach shell should expose latest terminal output")
await shellRelay.setScrollback(ScrollbackResult(sessionName: "main", lines: 2, text: "newer\nhistory\n"))
shellSnapshot = await shell.refreshScrollback(lines: 2, timeout: Duration.seconds(1))
try require(shellSnapshot.phase == AttachShellPhase.attached, "attach shell scrollback refresh should keep attached phase")
try require(
    shellSnapshot.scrollback?.visibleLines.map(\.text) == ["newer", "history"],
    "attach shell scrollback refresh should replace tmux-native history"
)
try require(
    shellSnapshot.terminalScreen?.visibleLines.first?.text == "local",
    "attach shell scrollback refresh should not mutate the live terminal screen"
)
try require(
    await shellRelay.scrollbackRequests == ["dev_1:main:40", "dev_1:main:2"],
    "attach shell scrollback refresh should fetch selected session history"
)
await shellRelay.setScrollbackFailure(SmokeError("scrollback token=secret-token"))
shellSnapshot = await shell.refreshScrollback(lines: 2, timeout: Duration.seconds(1))
try require(shellSnapshot.phase == AttachShellPhase.attached, "attach shell scrollback refresh failure should preserve attached phase")
try require(shellSnapshot.error?.title == "Could not refresh scrollback", "attach shell scrollback refresh failure should surface a user-facing error")
try require(
    shellSnapshot.error?.message.contains("secret-token") == false,
    "attach shell scrollback refresh failure should redact token text"
)
try require(
    shellSnapshot.terminalScreen?.visibleLines.first?.text == "local",
    "attach shell scrollback refresh failure should keep the live terminal screen"
)
await shellRelay.setScrollbackFailure(nil)
let composedSurface = TerminalSurfaceProjection.lines(for: shellSnapshot)
try require(
    composedSurface.map(\.id).prefix(3) == ["scrollback-line-0", "scrollback-line-1", "live-screen-0"],
    "terminal surface should compose scrollback rows before live screen rows"
)
try require(
    composedSurface.map(\.source).prefix(3) == [.scrollback, .scrollback, .live],
    "terminal surface should keep row sources distinct"
)
try require(
    composedSurface[2].runs.map(\.text).joined() == "local",
    "terminal surface live row should preserve terminal screen runs"
)
try require(
    composedSurface[0].cursorColumn == nil,
    "terminal surface should never project cursors onto scrollback rows"
)
try require(
    composedSurface[2].cursorColumn == 5,
    "terminal surface should project the visible cursor column on the live cursor row"
)
var hiddenCursorScreen = TerminalScreen(columns: 8, rows: 2)
hiddenCursorScreen.apply("ab")
hiddenCursorScreen.apply("\u{001B}[?25l")
let hiddenCursorSnapshot = AttachShellSnapshot(
    phase: .attached,
    terminalScreen: hiddenCursorScreen
)
try require(
    TerminalSurfaceProjection.lines(for: hiddenCursorSnapshot).allSatisfy { $0.cursorColumn == nil },
    "terminal surface should suppress cursor projection when DEC cursor visibility is hidden"
)
let blankCursorSnapshot = AttachShellSnapshot(
    phase: .attached,
    terminalScreen: TerminalScreen(columns: 8, rows: 2),
    terminalOutput: Data("\u{001B}[2J".utf8)
)
let blankCursorSurface = TerminalSurfaceProjection.lines(for: blankCursorSnapshot)
try require(
    blankCursorSurface.map(\.id) == ["live-screen-0", "live-screen-1"],
    "terminal surface should project blank live rows when only the visible cursor exists"
)
try require(
    blankCursorSurface[0].cursorColumn == 0,
    "terminal surface should project cursor position on blank live screens"
)
let cappedViewport = TerminalSurfaceProjection.viewport(lines: composedSurface, maxRows: 1)
try require(cappedViewport.lines.map(\.id) == ["live-screen-24"], "terminal surface viewport should keep the newest rows when capped")
try require(cappedViewport.anchorId == "live-screen-24", "terminal surface viewport should anchor to the newest visible row")
try require(cappedViewport.isTruncatedAbove, "terminal surface viewport should report when older rows are hidden")
let minimumViewport = TerminalSurfaceProjection.viewport(lines: composedSurface, maxRows: 0)
try require(minimumViewport.lines.count == 1, "terminal surface viewport should keep at least one row")
let compactTerminalSize = TerminalGeometry.terminalSize(width: 120, height: 90)
try require(compactTerminalSize.columns == 40, "terminal geometry should enforce minimum columns")
try require(compactTerminalSize.rows == 12, "terminal geometry should enforce minimum rows")
let fittedTerminalSize = TerminalGeometry.terminalSize(width: 960, height: 540)
try require(fittedTerminalSize.columns == 120, "terminal geometry should calculate columns from surface width")
try require(fittedTerminalSize.rows == 30, "terminal geometry should calculate rows from surface height")
try require(TerminalGeometry.surfaceWidth(columns: 20) == 320, "terminal surface width should enforce minimum columns")
try require(TerminalGeometry.surfaceWidth(columns: 120) == 960, "terminal surface width should scale with terminal columns")
try require(
    TerminalAutoFollowPolicy.shouldScrollToBottom(
        previousAnchorId: "live-screen-23",
        nextAnchorId: "live-screen-24",
        followsLiveOutput: true
    ),
    "terminal auto-follow should scroll when following live output and anchor advances"
)
try require(
    TerminalAutoFollowPolicy.shouldScrollToBottom(
        previousAnchorId: "live-screen-23",
        nextAnchorId: "live-screen-24",
        followsLiveOutput: false
    ) == false,
    "terminal auto-follow should not scroll while the user holds scrollback"
)
try require(
    TerminalAutoFollowPolicy.shouldScrollToBottom(
        previousAnchorId: "live-screen-24",
        nextAnchorId: "live-screen-24",
        followsLiveOutput: true
    ) == false,
    "terminal auto-follow should ignore unchanged anchors"
)
try require(
    TerminalAutoFollowPolicy.shouldScrollToBottom(
        previousAnchorId: "live-screen-24",
        nextAnchorId: nil,
        followsLiveOutput: true
    ) == false,
    "terminal auto-follow should ignore empty viewports"
)

let previewSnapshot = AttachShellPreviewFixtures.attachedCodingAgent
try require(previewSnapshot.phase == .attached, "preview fixture should model an attached terminal")
try require(previewSnapshot.devices.first?.sessions.first?.aiPanes.map(\.command) == ["claude", "codex"], "preview fixture should expose detected AI panes")
try require(previewSnapshot.selectedDeviceId == "macbook-pro", "preview fixture should select the Mac")
try require(previewSnapshot.selectedSessionName == "main", "preview fixture should select the tmux session")
guard let previewSessions = previewSnapshot.devices.first?.sessions else {
    throw SmokeError("preview fixture should expose sessions")
}
try require(
    SessionPresentation.iconName(for: previewSessions[0], selected: true) == "sparkles.rectangle.stack.fill",
    "session presentation should use AI icon for selected AI dev sessions"
)
try require(
    SessionPresentation.subtitle(for: previewSessions[0]) == "AI dev / 3 windows / attached / Claude Code / Codex",
    "session presentation should summarize AI coding sessions"
)
try require(
    SessionPresentation.iconName(for: previewSessions[1]) == "rectangle.3.group",
    "session presentation should use cmux icon for cmux sessions"
)
try require(
    SessionPresentation.subtitle(for: previewSessions[1]) == "cmux / 2 windows / Codex",
    "session presentation should summarize cmux sessions with detected AI panes"
)
try require(
    SessionPresentation.subtitle(for: previewSessions[2]) == "tmux / 1 window",
    "session presentation should summarize plain tmux sessions"
)
guard let previewManifest = previewSnapshot.manifest else {
    throw SmokeError("preview fixture should carry an attach manifest")
}
let previewTransport = try previewManifest.preferredMoshRelayDatagramTransport()
try require(previewTransport.label == "mosh", "preview fixture should carry a mosh relay datagram manifest")
let previewSurface = TerminalSurfaceProjection.lines(for: previewSnapshot)
try require(previewSurface.contains { $0.source == .scrollback }, "preview fixture should include tmux-native scrollback rows")
try require(previewSurface.contains { $0.source == .live }, "preview fixture should include live terminal rows")
let previewViewport = AttachShellPreviewFixtures.terminalViewport(maxRows: 8)
try require(previewViewport.lines.count == 8, "preview fixture viewport should honor the requested render cap")
try require(previewViewport.lines.allSatisfy { $0.source == .live }, "preview fixture capped viewport should show newest live rows")
try require(previewViewport.anchorId == previewViewport.lines.last?.id, "preview fixture viewport should expose a bottom anchor")
try require(previewViewport.isTruncatedAbove, "preview fixture viewport should report hidden older rows")
let cappedPreview = AttachShellPreviewFixtures.cappedViewport
try require(cappedPreview.terminalViewportLineLimit == 8, "capped preview fixture should carry a render cap")
try require(cappedPreview.selectedSessionName == "mobile-cap", "capped preview fixture should carry visible session metadata")
let cappedPreviewViewport = TerminalSurfaceProjection.viewport(for: cappedPreview)
try require(cappedPreviewViewport.lines.count == 8, "capped preview fixture should apply its render cap through default projection")
try require(cappedPreviewViewport.lines.allSatisfy { $0.source == .live }, "capped preview fixture should render live rows after cap")
try require(
    cappedPreviewViewport.lines.contains { $0.runs.contains { $0.text.contains("cap row 8") } },
    "capped preview fixture should expose cap-specific live content for simulator screenshots"
)
try require(AttachShellPreviewFixtures.failedAttach.recoveryAction == .reattachSession, "preview fixture should cover reattach recovery UI")
try require(
    AttachShellPreviewFixtures.snapshot(named: "attached-coding-agent") == previewSnapshot,
    "preview fixture selector should expose attached coding-agent state for simulator screenshots"
)
try require(
    AttachShellPreviewFixtures.snapshot(named: " BROWSING ")?.phase == .browsing,
    "preview fixture selector should trim and normalize fixture names"
)
try require(
    AttachShellPreviewFixtures.snapshot(named: "failed-attach")?.recoveryAction == .reattachSession,
    "preview fixture selector should expose failed reattach state"
)
try require(
    AttachShellPreviewFixtures.snapshot(named: "capped-viewport")?.terminalViewportLineLimit == 8,
    "preview fixture selector should expose capped viewport state"
)
try require(
    AttachShellPreviewFixtures.snapshot(named: "unknown") == nil,
    "preview fixture selector should ignore unknown fixtures instead of changing app behavior"
)
let screenshotContract = try loadScreenshotFixtureContract()
try require(
    screenshotContract.fixtures.map(\.name) == AttachShellPreviewFixtures.fixtureNames,
    "screenshot fixture contract should match Swift fixture order"
)
for fixture in screenshotContract.fixtures {
    guard let snapshot = AttachShellPreviewFixtures.snapshot(named: fixture.name) else {
        throw SmokeError("screenshot fixture contract referenced missing Swift fixture \(fixture.name)")
    }
    guard let swiftExpectation = AttachShellPreviewFixtures.expectation(named: fixture.name) else {
        throw SmokeError("Swift fixture \(fixture.name) should expose semantic expectations")
    }
    try require(
        swiftExpectation == ScreenshotFixtureExpectation(
            role: fixture.role,
            state: fixture.state,
            requiredSignals: fixture.requiredSignals
        ),
        "Swift screenshot fixture expectation should match repository contract for \(fixture.name)"
    )
    try require(
        snapshot.phase.rawValue == fixture.state,
        "Swift screenshot fixture phase should match repository contract for \(fixture.name)"
    )
    let signals = AttachShellPreviewFixtures.semanticSignals(for: snapshot)
    for signal in fixture.requiredSignals {
        try require(
            signals.contains(signal),
            "Swift screenshot fixture \(fixture.name) should expose semantic signal \(signal)"
        )
    }
}

await shellRelay.enqueue(frame: RelayDatagramFrame.data(Data([0xB0]), sequence: 9))
shellSnapshot = await shell.receiveNext(timeout: Duration.seconds(1))
try require(
    (shellSnapshot.scrollback?.visibleLines.map { $0.text } ?? []) == ["newer", "history"],
    "attach shell should keep remote live output out of tmux scrollback"
)
try require(
    shellSnapshot.terminalScreen?.visibleLines.first?.text == "localremote",
    "attach shell should merge remote output into the live terminal screen"
)

shellSnapshot = await shell.resize(to: MoshCoreTerminalSize(columns: 120, rows: 40))
try require(shellSnapshot.phase == AttachShellPhase.attached, "attach shell resize should keep attached phase")
let resizeDatagramCount = await shellRelay.sentDatagrams.count
shellSnapshot = await shell.resize(to: MoshCoreTerminalSize(columns: 120, rows: 40))
try require(
    await shellRelay.sentDatagrams.count == resizeDatagramCount,
    "attach shell should not send duplicate resize packets for an unchanged size"
)
shellSnapshot = await shell.tick(nowMs: 43)
try require(shellSnapshot.nextTickAfterMs == 20, "attach shell tick should surface next scheduled tick")
try require(
    await shellRelay.sentDatagrams.map(\.bytes).contains(Data([0xA3])),
    "attach shell tick should flush core tick packets through relay datagrams"
)

let cleanShutdownRelay = FakeAttachShellRelay(
    devices: snapshot.devices,
    manifest: manifestEnvelope.payload.manifest,
    scrollback: ScrollbackResult(sessionName: "main", lines: 1, text: "history\n")
)
let cleanShutdownShell = AttachShellModel(relay: cleanShutdownRelay) {
    CleanShutdownReceiveMoshCoreEngine()
}
var cleanShutdownSnapshot = await cleanShutdownShell.connectAndLoadDevices(timeout: Duration.seconds(1))
cleanShutdownSnapshot = await cleanShutdownShell.selectDevice("dev_1")
cleanShutdownSnapshot = await cleanShutdownShell.attach(
    lines: 20,
    initialSize: MoshCoreTerminalSize(columns: 80, rows: 24),
    timeout: Duration.seconds(1)
)
try require(cleanShutdownSnapshot.phase == AttachShellPhase.attached, "clean shutdown shell should attach before remote shutdown")
await cleanShutdownRelay.enqueue(frame: RelayDatagramFrame.data(Data([0xC0]), sequence: 11))
cleanShutdownSnapshot = await cleanShutdownShell.receiveNext(timeout: Duration.seconds(1))
try require(cleanShutdownSnapshot.phase == AttachShellPhase.browsing, "attach shell should leave attached phase after remote clean shutdown")
try require(cleanShutdownSnapshot.cleanShutdown, "attach shell should expose remote clean shutdown")
try require(cleanShutdownSnapshot.nextTickAfterMs == nil, "remote clean shutdown should clear pending mosh ticks")
try require(
    cleanShutdownSnapshot.terminalScreen?.visibleLines.first?.text == "bye",
    "attach shell should preserve terminal output from the clean shutdown frame"
)
try require(
    await cleanShutdownRelay.closedChannelIds == ["dg_shell"],
    "attach shell should close relay datagram after remote clean shutdown"
)
cleanShutdownSnapshot = await cleanShutdownShell.sendInput(Data("stale".utf8))
try require(cleanShutdownSnapshot.phase == AttachShellPhase.failed, "attach shell should detach mosh session after remote clean shutdown")
try require(cleanShutdownSnapshot.error?.title == "No active terminal", "clean shutdown should prevent stale input from using closed transport")

shellSnapshot = await shell.shutdown()
try require(shellSnapshot.phase == AttachShellPhase.browsing, "attach shell shutdown should return to browsing")
try require(shellSnapshot.cleanShutdown, "attach shell should expose clean shutdown")
try require(shellSnapshot.nextTickAfterMs == nil, "attach shell shutdown should clear pending mosh ticks")
try require(await shellRelay.closedChannelId == "dg_shell", "attach shell shutdown should close relay datagram")

let cleanupRelay = FakeAttachShellRelay(
    devices: snapshot.devices,
    manifest: manifestEnvelope.payload.manifest,
    scrollback: ScrollbackResult(sessionName: "main", lines: 1, text: "history\n")
)
let cleanupShell = AttachShellModel(relay: cleanupRelay) {
    FakeMoshCoreEngine()
}
var cleanupSnapshot = await cleanupShell.connectAndLoadDevices(timeout: Duration.seconds(1))
cleanupSnapshot = await cleanupShell.selectDevice("dev_1")
cleanupSnapshot = await cleanupShell.attach(
    lines: 20,
    initialSize: MoshCoreTerminalSize(columns: 80, rows: 24),
    timeout: Duration.seconds(1)
)
try require(cleanupSnapshot.phase == AttachShellPhase.attached, "cleanup shell should attach before reconnect")
cleanupSnapshot = await cleanupShell.connectAndLoadDevices(timeout: Duration.seconds(1))
try require(cleanupSnapshot.phase == AttachShellPhase.browsing, "cleanup shell reconnect should return to browsing")
try require(
    await cleanupRelay.closedChannelIds == ["dg_shell"],
    "attach shell reconnect should close stale relay datagram transport"
)
cleanupSnapshot = await cleanupShell.sendInput(Data("stale".utf8))
try require(cleanupSnapshot.phase == AttachShellPhase.failed, "attach shell reconnect should detach stale mosh session")
try require(cleanupSnapshot.error?.title == "No active terminal", "stale input after reconnect should fail before mosh input")
cleanupSnapshot = await cleanupShell.selectDevice("dev_1")
cleanupSnapshot = await cleanupShell.attach(
    lines: 20,
    initialSize: MoshCoreTerminalSize(columns: 80, rows: 24),
    timeout: Duration.seconds(1)
)
try require(cleanupSnapshot.phase == AttachShellPhase.attached, "cleanup shell should attach after reconnect")
let reattachCloseCount = await cleanupRelay.closedChannelIds.count
cleanupSnapshot = await cleanupShell.attach(
    lines: 20,
    initialSize: MoshCoreTerminalSize(columns: 80, rows: 24),
    timeout: Duration.seconds(1)
)
try require(cleanupSnapshot.phase == AttachShellPhase.attached, "attach shell should support explicit reattach")
try require(
    await cleanupRelay.closedChannelIds.count == reattachCloseCount + 1,
    "attach shell reattach should close previous relay datagram transport"
)
_ = await cleanupShell.shutdown()

let attachStartFailureRelay = FakeAttachShellRelay(
    devices: snapshot.devices,
    manifest: manifestEnvelope.payload.manifest,
    scrollback: ScrollbackResult(sessionName: "main", lines: 1, text: "history\n")
)
let attachStartFailureShell = AttachShellModel(relay: attachStartFailureRelay) {
    StartFailureMoshCoreEngine()
}
var attachStartFailureSnapshot = await attachStartFailureShell.connectAndLoadDevices(timeout: Duration.seconds(1))
attachStartFailureSnapshot = await attachStartFailureShell.selectDevice("dev_1")
attachStartFailureSnapshot = await attachStartFailureShell.attach(
    lines: 20,
    initialSize: MoshCoreTerminalSize(columns: 80, rows: 24),
    timeout: Duration.seconds(1)
)
try require(attachStartFailureSnapshot.phase == AttachShellPhase.failed, "attach start failure should surface failed state")
try require(
    attachStartFailureSnapshot.error?.title == "Could not attach session",
    "attach start failure should keep attach recovery error title"
)
try require(
    await attachStartFailureRelay.closedChannelIds == ["dg_shell"],
    "attach start failure after datagram open should close the relay datagram"
)
attachStartFailureSnapshot = await attachStartFailureShell.sendInput(Data("stale".utf8))
try require(
    attachStartFailureSnapshot.error?.title == "No active terminal",
    "attach start failure should not leave an active mosh session"
)

let selectionCleanupRelay = FakeAttachShellRelay(
    devices: [
        Device(
            id: "dev_1",
            name: "Mac",
            platform: "darwin",
            user: "jaeman",
            capabilities: ["tmux.sessions"],
            sessions: [
                Session(id: "$0", name: "main", kind: "tmux"),
                Session(id: "$1", name: "build", kind: "tmux")
            ]
        )
    ],
    manifest: manifestEnvelope.payload.manifest,
    scrollback: ScrollbackResult(sessionName: "main", lines: 1, text: "history\n")
)
let selectionCleanupShell = AttachShellModel(relay: selectionCleanupRelay) {
    FakeMoshCoreEngine()
}
var selectionCleanupSnapshot = await selectionCleanupShell.connectAndLoadDevices(timeout: Duration.seconds(1))
selectionCleanupSnapshot = await selectionCleanupShell.selectDevice("dev_1")
selectionCleanupSnapshot = await selectionCleanupShell.attach(
    lines: 20,
    initialSize: MoshCoreTerminalSize(columns: 80, rows: 24),
    timeout: Duration.seconds(1)
)
try require(selectionCleanupSnapshot.phase == AttachShellPhase.attached, "selection cleanup shell should attach before session selection")
let sameSessionCloseCount = await selectionCleanupRelay.closedChannelIds.count
selectionCleanupSnapshot = await selectionCleanupShell.selectSession("main")
try require(selectionCleanupSnapshot.phase == AttachShellPhase.attached, "selecting the attached session should keep the terminal attached")
try require(
    await selectionCleanupRelay.closedChannelIds.count == sameSessionCloseCount,
    "selecting the attached session should not close the relay datagram"
)
selectionCleanupSnapshot = await selectionCleanupShell.selectSession("build")
try require(selectionCleanupSnapshot.phase == AttachShellPhase.browsing, "selecting another session should leave attached mode")
try require(selectionCleanupSnapshot.selectedSessionName == "build", "selecting another session should update selection")
try require(
    await selectionCleanupRelay.closedChannelIds == ["dg_shell"],
    "selecting another session should close the stale relay datagram"
)
selectionCleanupSnapshot = await selectionCleanupShell.sendInput(Data("stale".utf8))
try require(selectionCleanupSnapshot.phase == AttachShellPhase.failed, "selection cleanup should detach stale mosh session")
try require(selectionCleanupSnapshot.error?.title == "No active terminal", "selection cleanup should prevent stale input")

let interruptedRelay = FakeAttachShellRelay(
    devices: snapshot.devices,
    manifest: manifestEnvelope.payload.manifest,
    scrollback: ScrollbackResult(sessionName: "main", lines: 1, text: "history\n")
)
let interruptedShell = AttachShellModel(relay: interruptedRelay) {
    FakeMoshCoreEngine()
}
var interruptedSnapshot = await interruptedShell.connectAndLoadDevices(timeout: Duration.seconds(1))
interruptedSnapshot = await interruptedShell.selectDevice("dev_1")
interruptedSnapshot = await interruptedShell.attach(
    lines: 20,
    initialSize: MoshCoreTerminalSize(columns: 80, rows: 24),
    timeout: Duration.seconds(1)
)
interruptedSnapshot = await interruptedShell.sendInput(Data("hi".utf8))
try require(interruptedSnapshot.phase == AttachShellPhase.attached, "interrupted shell fixture should attach before failure")
interruptedSnapshot = await interruptedShell.receiveNext(timeout: Duration.seconds(1))
try require(interruptedSnapshot.phase == AttachShellPhase.failed, "attach shell should fail when live receive is interrupted")
try require(interruptedSnapshot.recoveryAction == .reattachSession, "attach shell interruption should recommend reattach")
try require(interruptedSnapshot.nextTickAfterMs == nil, "interrupted attach should clear pending mosh ticks")
try require(interruptedSnapshot.selectedDeviceId == "dev_1", "attach shell failure should preserve selected device")
try require(interruptedSnapshot.selectedSessionName == "main", "attach shell failure should preserve selected session")
try require(
    interruptedSnapshot.scrollback?.visibleLines.map(\.text) == ["history"],
    "attach shell failure should preserve tmux scrollback"
)
try require(
    interruptedSnapshot.terminalScreen?.visibleLines.first?.text == "local",
    "attach shell failure should preserve the last live terminal screen"
)
try require(await interruptedRelay.closedChannelId == "dg_shell", "attach shell failure should close the relay datagram")

let relayClosedRelay = FakeAttachShellRelay(
    devices: snapshot.devices,
    manifest: manifestEnvelope.payload.manifest,
    scrollback: ScrollbackResult(sessionName: "main", lines: 1, text: "history\n")
)
let relayClosedShell = AttachShellModel(relay: relayClosedRelay) {
    FakeMoshCoreEngine()
}
var relayClosedSnapshot = await relayClosedShell.connectAndLoadDevices(timeout: Duration.seconds(1))
relayClosedSnapshot = await relayClosedShell.selectDevice("dev_1")
relayClosedSnapshot = await relayClosedShell.attach(
    lines: 20,
    initialSize: MoshCoreTerminalSize(columns: 80, rows: 24),
    timeout: Duration.seconds(1)
)
relayClosedSnapshot = await relayClosedShell.sendInput(Data("hi".utf8))
try require(relayClosedSnapshot.phase == AttachShellPhase.attached, "relay close shell should attach before close")
await relayClosedRelay.enqueue(frame: .close)
relayClosedSnapshot = await relayClosedShell.receiveNext(timeout: Duration.seconds(1))
try require(relayClosedSnapshot.phase == AttachShellPhase.failed, "attach shell should fail when relay datagram closes")
try require(relayClosedSnapshot.nextTickAfterMs == nil, "relay datagram close should clear pending mosh ticks")
try require(
    relayClosedSnapshot.error?.title == "Terminal connection interrupted",
    "relay datagram close should surface terminal interruption"
)
try require(
    relayClosedSnapshot.error?.message.contains("clean shutdown") == true,
    "relay datagram close should distinguish unclean close from mosh shutdown"
)
try require(relayClosedSnapshot.recoveryAction == .reattachSession, "relay datagram close should recommend reattach")
try require(
    relayClosedSnapshot.terminalScreen?.visibleLines.first?.text == "local",
    "relay datagram close should preserve last live terminal screen"
)
try require(
    await relayClosedRelay.closedChannelIds.isEmpty,
    "relay datagram close should not send a duplicate close for an already closed channel"
)
relayClosedSnapshot = await relayClosedShell.sendInput(Data("stale".utf8))
try require(relayClosedSnapshot.phase == AttachShellPhase.failed, "relay datagram close should detach stale mosh session")
try require(relayClosedSnapshot.error?.title == "No active terminal", "relay datagram close should prevent stale input")

let viewportRelay = FakeAttachShellRelay(
    devices: snapshot.devices,
    manifest: manifestEnvelope.payload.manifest,
    scrollback: ScrollbackResult(sessionName: "main", lines: 1, text: "history\n")
)
let viewportShell = AttachShellModel(
    relay: viewportRelay,
    makeEngine: { FakeMoshCoreEngine() },
    initialSnapshot: AttachShellSnapshot(
        phase: .browsing,
        devices: snapshot.devices,
        selectedDeviceId: "dev_1",
        selectedSessionName: "main",
        terminalViewportLineLimit: 6
    )
)
var viewportSnapshot = await viewportShell.connectAndLoadDevices(timeout: Duration.seconds(1))
try require(viewportSnapshot.terminalViewportLineLimit == 6, "connect should preserve terminal viewport cap")
viewportSnapshot = await viewportShell.selectDevice("dev_1")
try require(viewportSnapshot.terminalViewportLineLimit == 6, "device selection should preserve terminal viewport cap")
viewportSnapshot = await viewportShell.selectSession("main")
try require(viewportSnapshot.terminalViewportLineLimit == 6, "session selection should preserve terminal viewport cap")
viewportSnapshot = await viewportShell.attach(
    lines: 20,
    initialSize: MoshCoreTerminalSize(columns: 80, rows: 24),
    timeout: Duration.seconds(1)
)
try require(viewportSnapshot.terminalViewportLineLimit == 6, "attach should preserve terminal viewport cap")
viewportSnapshot = await viewportShell.sendInput(Data("hi".utf8))
try require(viewportSnapshot.terminalViewportLineLimit == 6, "input should preserve terminal viewport cap")
await viewportRelay.enqueue(frame: .close)
viewportSnapshot = await viewportShell.receiveNext(timeout: Duration.seconds(1))
try require(viewportSnapshot.phase == .failed, "viewport shell should fail after relay datagram close")
try require(viewportSnapshot.terminalViewportLineLimit == 6, "failure should preserve terminal viewport cap")
viewportSnapshot = await viewportShell.sendInput(Data("stale".utf8))
try require(viewportSnapshot.terminalViewportLineLimit == 6, "stale input error should preserve terminal viewport cap")

let viewportCleanShutdownRelay = FakeAttachShellRelay(
    devices: snapshot.devices,
    manifest: manifestEnvelope.payload.manifest,
    scrollback: ScrollbackResult(sessionName: "main", lines: 1, text: "history\n")
)
let viewportCleanShutdownShell = AttachShellModel(
    relay: viewportCleanShutdownRelay,
    makeEngine: { CleanShutdownReceiveMoshCoreEngine() },
    initialSnapshot: AttachShellSnapshot(
        phase: .browsing,
        devices: snapshot.devices,
        selectedDeviceId: "dev_1",
        selectedSessionName: "main",
        terminalViewportLineLimit: 6
    )
)
var viewportCleanShutdownSnapshot = await viewportCleanShutdownShell.attach(
    lines: 20,
    initialSize: MoshCoreTerminalSize(columns: 80, rows: 24),
    timeout: Duration.seconds(1)
)
try require(
    viewportCleanShutdownSnapshot.terminalViewportLineLimit == 6,
    "clean-shutdown fixture attach should preserve terminal viewport cap"
)
await viewportCleanShutdownRelay.enqueue(frame: RelayDatagramFrame.data(Data([0xC0]), sequence: 11))
viewportCleanShutdownSnapshot = await viewportCleanShutdownShell.receiveNext(timeout: Duration.seconds(1))
try require(viewportCleanShutdownSnapshot.phase == .browsing, "clean shutdown should leave attached mode")
try require(viewportCleanShutdownSnapshot.cleanShutdown, "clean shutdown should remain explicit")
try require(viewportCleanShutdownSnapshot.nextTickAfterMs == nil, "clean shutdown should clear pending mosh ticks")
try require(
    viewportCleanShutdownSnapshot.terminalViewportLineLimit == 6,
    "clean shutdown should preserve terminal viewport cap"
)

let attachShellView = HovviAttachShellView(snapshot: shellSnapshot)
let terminalSurfaceView = TerminalSurfaceView(snapshot: shellSnapshot)
let deviceSidebar = DeviceSidebar(snapshot: shellSnapshot)
try require(
    String(describing: type(of: attachShellView)).contains("HovviAttachShellView"),
    "SwiftUI attach shell view should instantiate"
)
try require(
    String(describing: type(of: terminalSurfaceView)).contains("TerminalSurfaceView"),
    "SwiftUI terminal surface view should instantiate"
)
try require(
    String(describing: type(of: deviceSidebar)).contains("DeviceSidebar"),
    "SwiftUI device sidebar should instantiate"
)

let redactedShellError = AttachShellError(
    title: "Secret",
    message: "mosh key MDEyMzQ1Njc4OWFiY2RlZg must not be shown"
)
try require(
    redactedShellError.message.contains("MDEyMzQ1Njc4OWFiY2RlZg") == false,
    "attach shell errors should redact mosh keys"
)
let secretShellError = AttachShellError(
    title: "Relay",
    message: "relay=wss://user:pass@relay.example.test/path token=relay-secret Authorization: Bearer bearer-secret HOVVI_RELAY_TOKEN=env-secret"
)
try require(secretShellError.message.contains("user:pass") == false, "attach shell errors should redact relay URL credentials")
try require(secretShellError.message.contains("relay-secret") == false, "attach shell errors should redact inline tokens")
try require(secretShellError.message.contains("bearer-secret") == false, "attach shell errors should redact bearer tokens")
try require(secretShellError.message.contains("env-secret") == false, "attach shell errors should redact relay environment tokens")
try require(
    secretShellError.message.contains("wss://%5Bredacted%5D:%5Bredacted%5D@relay.example.test/path"),
    "attach shell errors should preserve redacted relay URL context"
)

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

enum FakeDatagramRelayReadResult: Sendable {
    case frame(RelayDatagramFrame)
    case error(RelayClientError)
}

actor FakeDatagramRelay: RelayDatagramTransporting {
    private let expectedMaxDatagramBytes: Int
    private(set) var closedChannelId: String?
    private(set) var sentDatagrams: [SentDatagram] = []
    private var readResults: [FakeDatagramRelayReadResult] = []

    init(expectedMaxDatagramBytes: Int = 1200) {
        self.expectedMaxDatagramBytes = expectedMaxDatagramBytes
    }

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
        try require(maxDatagramBytes == expectedMaxDatagramBytes, "fake relay should receive max datagram size")
        return "dg_fake"
    }

    func sendDatagram(channelId: String, bytes: Data, sequence: Int?) async throws {
        try require(channelId == "dg_fake", "fake relay should receive mosh channel id")
        sentDatagrams.append(SentDatagram(channelId: channelId, bytes: bytes, sequence: sequence))
    }

    func readDatagramFrame(channelId: String, timeout: Duration) async throws -> RelayDatagramFrame {
        try require(channelId == "dg_fake", "fake relay should read from mosh channel")
        guard readResults.isEmpty == false else {
            throw SmokeError("fake relay has no datagram frame")
        }
        switch readResults.removeFirst() {
        case .frame(let frame):
            return frame
        case .error(let error):
            throw error
        }
    }

    func closeDatagram(channelId: String) async throws {
        closedChannelId = channelId
    }

    func enqueue(frame: RelayDatagramFrame) {
        readResults.append(.frame(frame))
    }

    func enqueue(error: RelayClientError) {
        readResults.append(.error(error))
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

actor CleanShutdownReceiveMoshCoreEngine: MoshCoreEngine {
    func start(configuration: MoshCoreConfiguration) async throws -> MoshCoreFrame {
        MoshCoreFrame(outboundPackets: [Data([0xA0])], nextTickAfterMs: 10)
    }

    func receivePacket(_ packet: MoshRelayDatagramPacket) async throws -> MoshCoreFrame {
        try require(packet.bytes == Data([0xC0]), "clean shutdown fake core should receive remote packet")
        try require(packet.relaySequence == 11, "clean shutdown fake core should preserve relay sequence")
        return MoshCoreFrame(terminalOutput: Data("bye".utf8), cleanShutdown: true)
    }

    func sendUserInput(_ bytes: Data) async throws -> MoshCoreFrame {
        throw SmokeError("clean shutdown fake core should not receive stale input")
    }

    func resize(to size: MoshCoreTerminalSize) async throws -> MoshCoreFrame {
        throw SmokeError("clean shutdown fake core should not resize")
    }

    func tick(nowMs: UInt64) async throws -> MoshCoreFrame {
        throw SmokeError("clean shutdown fake core should not tick")
    }

    func shutdown() async throws -> MoshCoreFrame {
        MoshCoreFrame(cleanShutdown: true)
    }
}

actor StartFailureMoshCoreEngine: MoshCoreEngine {
    func start(configuration: MoshCoreConfiguration) async throws -> MoshCoreFrame {
        throw SmokeError("native mosh start failed")
    }

    func receivePacket(_ packet: MoshRelayDatagramPacket) async throws -> MoshCoreFrame {
        throw SmokeError("start failure fake core should not receive packets")
    }

    func sendUserInput(_ bytes: Data) async throws -> MoshCoreFrame {
        throw SmokeError("start failure fake core should not receive input")
    }

    func resize(to size: MoshCoreTerminalSize) async throws -> MoshCoreFrame {
        throw SmokeError("start failure fake core should not resize")
    }

    func tick(nowMs: UInt64) async throws -> MoshCoreFrame {
        throw SmokeError("start failure fake core should not tick")
    }

    func shutdown() async throws -> MoshCoreFrame {
        throw SmokeError("start failure fake core should not shutdown")
    }
}

actor FakeAttachShellRelay: AttachShellRelaying {
    private var devices: [Device]
    private let manifest: AttachManifest
    private var scrollback: ScrollbackResult
    private var scrollbackFailure: (any Error)?
    private var frames: [RelayDatagramFrame] = []
    private(set) var connectCalled = false
    private(set) var scrollbackRequests: [String] = []
    private(set) var attachRequests: [String] = []
    private(set) var sentDatagrams: [SentDatagram] = []
    private(set) var closedChannelIds: [String] = []
    var closedChannelId: String? {
        closedChannelIds.last
    }

    init(devices: [Device], manifest: AttachManifest, scrollback: ScrollbackResult) {
        self.devices = devices
        self.manifest = manifest
        self.scrollback = scrollback
    }

    func connect(startReceiveLoop: Bool) async throws {
        try require(startReceiveLoop, "attach shell relay should start receive loop")
        connectCalled = true
    }

    func listDevices(timeout: Duration) async throws -> [Device] {
        devices
    }

    func setDevices(_ devices: [Device]) {
        self.devices = devices
    }

    func setScrollback(_ scrollback: ScrollbackResult) {
        self.scrollback = scrollback
    }

    func setScrollbackFailure(_ error: (any Error)?) {
        self.scrollbackFailure = error
    }

    func prepareAttachManifest(
        deviceId: String,
        sessionName: String,
        lines: Int,
        create: Bool,
        timeout: Duration
    ) async throws -> AttachManifest {
        attachRequests.append("\(deviceId):\(sessionName):\(lines):\(create)")
        return manifest
    }

    func fetchScrollbackResult(
        deviceId: String,
        sessionName: String,
        lines: Int,
        timeout: Duration
    ) async throws -> ScrollbackResult {
        scrollbackRequests.append("\(deviceId):\(sessionName):\(lines)")
        if let scrollbackFailure {
            throw scrollbackFailure
        }
        return scrollback
    }

    func openDatagram(
        deviceId: String,
        label: String?,
        remoteHost: String?,
        remotePort: Int?,
        maxDatagramBytes: Int?,
        timeout: Duration
    ) async throws -> String {
        try require(deviceId == "dev_1", "attach shell relay should open selected device datagram")
        try require(label == "mosh", "attach shell relay should open mosh datagram")
        return "dg_shell"
    }

    func sendDatagram(channelId: String, bytes: Data, sequence: Int?) async throws {
        try require(channelId == "dg_shell", "attach shell relay should send to opened datagram")
        sentDatagrams.append(SentDatagram(channelId: channelId, bytes: bytes, sequence: sequence))
    }

    func readDatagramFrame(channelId: String, timeout: Duration) async throws -> RelayDatagramFrame {
        try require(channelId == "dg_shell", "attach shell relay should read from opened datagram")
        guard frames.isEmpty == false else {
            throw SmokeError("attach shell relay has no datagram frame")
        }
        return frames.removeFirst()
    }

    func closeDatagram(channelId: String) async throws {
        closedChannelIds.append(channelId)
    }

    func enqueue(frame: RelayDatagramFrame) {
        frames.append(frame)
    }
}

struct ScreenshotFixtureContract: Decodable {
    let schemaVersion: Int
    let fixtures: [ScreenshotFixtureContractEntry]
}

struct ScreenshotFixtureContractEntry: Decodable {
    let name: String
    let role: String
    let state: String
    let requiredSignals: [String]
}

func loadScreenshotFixtureContract() throws -> ScreenshotFixtureContract {
    let fileManager = FileManager.default
    let currentDirectory = fileManager.currentDirectoryPath
    let candidates = [
        "docs/ios-screenshot-fixtures.json",
        "../../docs/ios-screenshot-fixtures.json"
    ].map {
        URL(fileURLWithPath: $0, relativeTo: URL(fileURLWithPath: currentDirectory, isDirectory: true))
            .standardizedFileURL
    }

    for candidate in candidates where fileManager.fileExists(atPath: candidate.path) {
        let data = try Data(contentsOf: candidate)
        let contract = try JSONDecoder().decode(ScreenshotFixtureContract.self, from: data)
        try require(contract.schemaVersion == 1, "screenshot fixture contract schema version should be supported")
        return contract
    }

    throw SmokeError("could not find docs/ios-screenshot-fixtures.json from \(currentDirectory)")
}
