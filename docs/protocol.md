# Hovvi Relay Protocol

Hovvi relay messages are JSON envelopes with protocol metadata and message-specific fields in the same top-level object.

Do not wrap message-specific data in a `payload` object.

## Envelope

Every message includes:

```json
{
  "version": 1,
  "type": "devices.snapshot",
  "id": "message-id",
  "sentAt": "2026-06-24T00:00:00.000Z"
}
```

Message-specific fields are added next to those keys.

## Examples

`devices.snapshot`:

```json
{
  "version": 1,
  "type": "devices.snapshot",
  "id": "message-id",
  "sentAt": "2026-06-24T00:00:00.000Z",
  "devices": [
    {
      "id": "dev_1",
      "name": "Mac",
      "platform": "darwin",
      "capabilities": ["tmux.sessions"],
      "sessions": [
        {
          "id": "$0",
          "name": "main",
          "kind": "tmux"
        }
      ]
    }
  ]
}
```

`session.attach.ready`:

```json
{
  "version": 1,
  "type": "session.attach.ready",
  "id": "message-id",
  "sentAt": "2026-06-24T00:00:00.000Z",
  "requestId": "request-id",
  "manifest": {
    "kind": "mosh-tmux",
    "version": 1,
    "sessionName": "main",
    "user": "jaeman",
    "methods": [
      {
        "name": "mosh",
        "priority": 10,
        "status": "available",
"command": ["mosh-server", "new", "-i", "127.0.0.1", "-c", "256", "-l", "LANG=en_US.UTF-8", "--", "tmux", "attach-session", "-t", "main"],
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
```

`session.scrollback.ready`:

```json
{
  "version": 1,
  "type": "session.scrollback.ready",
  "id": "message-id",
  "sentAt": "2026-06-24T00:00:00.000Z",
  "requestId": "request-id",
  "sessionName": "main",
  "lines": 2000,
  "text": "..."
}
```

`forward.open`:

```json
{
  "version": 1,
  "type": "forward.open",
  "id": "message-id",
  "sentAt": "2026-06-24T00:00:00.000Z",
  "streamId": "str_1",
  "deviceId": "dev_1",
  "remoteHost": "127.0.0.1",
  "remotePort": 22
}
```

`forward.data`:

```json
{
  "version": 1,
  "type": "forward.data",
  "id": "message-id",
  "sentAt": "2026-06-24T00:00:00.000Z",
  "streamId": "str_1",
  "data": "cGluZw=="
}
```

`forward.end`:

```json
{
  "version": 1,
  "type": "forward.end",
  "id": "message-id",
  "sentAt": "2026-06-24T00:00:00.000Z",
  "streamId": "str_1"
}
```

`datagram.open`:

```json
{
  "version": 1,
  "type": "datagram.open",
  "id": "message-id",
  "sentAt": "2026-06-24T00:00:00.000Z",
  "channelId": "dg_1",
  "deviceId": "dev_1",
  "label": "mosh",
  "remoteHost": "127.0.0.1",
  "remotePort": 60001,
  "maxDatagramBytes": 1200
}
```

`datagram.data`:

```json
{
  "version": 1,
  "type": "datagram.data",
  "id": "message-id",
  "sentAt": "2026-06-24T00:00:00.000Z",
  "channelId": "dg_1",
  "sequence": 1,
  "data": "cGluZw=="
}
```

`datagram.close`:

```json
{
  "version": 1,
  "type": "datagram.close",
  "id": "message-id",
  "sentAt": "2026-06-24T00:00:00.000Z",
  "channelId": "dg_1"
}
```

## Mosh Relay Datagram Boundary

Hovvi-started `mosh-server` instances bind to `127.0.0.1` because the Mac agent
owns the local UDP bridge and the relay carries encrypted datagrams outward.

For attach manifests with a `mosh` method and `relay-datagram` transport, mobile clients open a `datagram.open` channel using the manifest's `deviceId`, `remoteHost`, `remotePort`, `label`, and `maxDatagramBytes`.

The datagram payload is an opaque mosh packet. Hovvi relay and agent code must not decrypt, parse, coalesce, or reorder mosh's inner AES-OCB/SSP payload. The optional `sequence` field is relay-level diagnostics and ordering metadata only; mosh packet validity is still determined by mosh's own nonce, authentication tag, and state synchronization rules.

The `key` value is the printable mosh server AES key returned by `MOSH CONNECT`: 22 base64 characters with no `=` padding.

The JavaScript relay client exposes this boundary as
`openDatagram({ deviceId, remoteHost, remotePort, label, maxDatagramBytes })`.
The returned channel supports `send(bytes)`, `nextMessage({ timeoutMs })`, and
`close()`. `send(bytes)` rejects payloads larger than `maxDatagramBytes` before
serializing or sending a `datagram.data` envelope. `datagram.error` rejects
pending opens or pending reads and `datagram.close` marks the channel closed.
The relay and client must release channel state after either peer closes.

The relay also enforces each channel's `maxDatagramBytes` against inbound
`datagram.data` messages from either peer. Oversized data is not forwarded; the
sender receives `datagram.error`, the peer receives `datagram.close`, and the
relay releases the channel.

For attach flows, the JavaScript relay client also exposes
`prepareMoshDatagramAttach(...)`. It requests an attach manifest, selects the
highest-priority available `mosh` method with `relay-datagram` transport,
validates that the manifest is supported v1 `mosh-tmux`, validates `remotePort`
and the printable mosh server key, opens the datagram channel, and returns
`{ manifest, method, transport, channel }`.

The current attach manifest schema is versioned independently from the relay
envelope. Mobile and JavaScript clients must reject unknown attach manifest
`kind` or `version` values instead of silently treating them as compatible.

## Validation

Relay input is schema-validated before routing. Invalid messages return:

```json
{
  "version": 1,
  "type": "error",
  "id": "message-id",
  "sentAt": "2026-06-24T00:00:00.000Z",
  "code": "invalid_message",
  "field": "data",
  "message": "data must be base64"
}
```
