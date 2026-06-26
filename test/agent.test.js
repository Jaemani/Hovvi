import test from "node:test";
import assert from "node:assert/strict";
import { buildDeviceCapabilities } from "../src/agent.js";

test("buildDeviceCapabilities includes cmux only when installed", () => {
  assert.deepEqual(
    buildDeviceCapabilities({ commandExistsFn: () => false }),
    ["tmux.sessions", "tmux.capture", "tcp.forward", "mosh.compat.target", "mosh.relay-datagram"],
  );

  assert.deepEqual(
    buildDeviceCapabilities({ commandExistsFn: (command) => command === "cmux" }),
    ["tmux.sessions", "tmux.capture", "tcp.forward", "mosh.compat.target", "mosh.relay-datagram", "cmux.sessions"],
  );
});
