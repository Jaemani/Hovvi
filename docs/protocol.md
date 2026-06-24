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
    "methods": [],
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
