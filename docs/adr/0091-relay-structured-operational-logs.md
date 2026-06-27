# ADR 0091: Relay Structured Operational Logs

## Status

Accepted

## Context

Hosted relay operation needs inspectable health, metrics, and structured logs.
Health and metrics endpoints already expose current relay status, but relay
events were not available as a durable machine-readable stream.

The log path must not weaken authentication, audit redaction, or mosh payload
privacy. Relay datagram payloads are encrypted mosh packets and remain opaque to
the relay.

## Decision

`hovvi relay` now accepts `--log <path>` and `HOVVI_RELAY_LOG`. When configured,
the relay writes JSONL operational events for:

- relay listen/close lifecycle
- WebSocket connection acceptance
- auth accept/reject metadata
- agent/client registration and unregistration
- session update and heartbeat metadata
- attach/scrollback route open/offline decisions
- forward/datagram open, close, offline, and stale sweep metadata
- invalid relay message metadata

Events include operational identifiers such as account id, device id, client id,
stream id, channel id, counts, and reasons. Events do not include raw relay
tokens, token hashes, scrollback text, forwarded stream bytes, or datagram
payload bytes.

The existing token/hash sanitizer is reused for the structured log sink.

## Consequences

- Self-hosted and hosted-relay rehearsals can inspect relay behavior without
  packet payload access.
- Audit logs remain separate from operational logs.
- This does not define hosted-retention, pricing, paid plan, or data policy.

## Validation

- `node --test test/relay.test.js`
- `npm run check`
- `npm test`
- `npm run package:boundary-check`
- `npm pack --dry-run --json`
