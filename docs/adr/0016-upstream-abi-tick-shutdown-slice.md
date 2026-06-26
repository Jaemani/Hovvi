# ADR 0016: Upstream ABI Tick and Shutdown Slice

## Status

Accepted

## Context

ADR 0015 connected upstream terminal and user-input state behind the C ABI.
`hovvi_mosh_core_tick` and `hovvi_mosh_core_shutdown` still reported
`HOVVI_MOSH_UNAVAILABLE`, so Swift/mobile code could not exercise the ABI timer
or clean-shutdown contract.

Upstream `Network::Transport` and `TransportSender` contain the full ack,
retransmission, shutdown retry, and send-interval behavior, but still depend on
socket-backed `Network::Connection`. Hovvi should not fake full transport
semantics in the ABI before the relay-backed connection/harness milestone.

## Decision

Add a smaller upstream-backed timer slice:

- user input and resize register upstream terminal input frames with
  `Terminal::Complete::register_input_frame`
- frames return `next_tick_ms` from `Terminal::Complete::wait_time`
- `hovvi_mosh_core_tick` calls `Terminal::Complete::set_echo_ack`, refreshes the
  terminal output when needed, preserves the next tick contract, and returns
  `HOVVI_MOSH_OK`
- `hovvi_mosh_core_shutdown` marks the current repository-only ABI slice cleanly
  shut down and returns `clean_shutdown`

## Rationale

This makes the C ABI timer and shutdown paths real enough for mobile integration
smokes without inventing a parallel transport algorithm. Full retransmission,
ack packet emission, prediction timing, and shutdown retries must come from the
upstream transport path once the relay-backed connection seam exists.

## Consequences

- The upstream ABI smoke now verifies scheduled ticks after repeated input,
  successful tick processing, clean shutdown, and stable tick behavior after
  shutdown.
- The shipped MIT scaffold remains unchanged.
- The next native milestone is still the relay-backed transport/harness work
  that can exercise full upstream transport semantics against `mosh-server`.
