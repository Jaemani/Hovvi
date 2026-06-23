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
let data = try HovviCoding.encode(envelope)
let decoded = try decodeEnvelope(DevicesSnapshot.self, from: data, expectedType: "devices.snapshot")
try require(decoded.version == 1, "protocol version should decode")
try require(decoded.payload.devices.first?.name == "Mac", "device name should decode")
try require(decoded.payload.devices.first?.sessions.first?.name == "main", "session should decode")

let manifestJson = """
{
  "version": 1,
  "type": "session.attach.ready",
  "id": "message-1",
  "sentAt": "2026-06-24T00:00:00Z",
  "payload": {
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
        "status": "planned",
        "command": ["mosh-server", "new"]
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
    AttachManifest.self,
    from: Data(manifestJson.utf8),
    expectedType: "session.attach.ready"
)
try require(manifestEnvelope.payload.kind == "mosh-tmux", "attach manifest kind should decode")
try require(manifestEnvelope.payload.scrollback.lines == 2000, "scrollback lines should decode")

do {
    _ = try decodeEnvelope(DevicesSnapshot.self, from: data, expectedType: "other")
    throw SmokeError("unexpected type should fail")
} catch HovviProtocolError.unexpectedType {
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
