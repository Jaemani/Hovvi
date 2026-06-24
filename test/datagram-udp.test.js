import test from "node:test";
import assert from "node:assert/strict";
import { createSocket } from "node:dgram";
import { createUdpDatagramBridge } from "../src/datagram-udp.js";

test("UDP datagram bridge forwards local UDP replies as relay frames", async () => {
  const server = createSocket("udp4");
  const frames = [];

  server.on("message", (message, rinfo) => {
    server.send(Buffer.concat([Buffer.from("echo:"), message]), rinfo.port, rinfo.address);
  });

  await bind(server);
  const remotePort = server.address().port;
  const bridge = createUdpDatagramBridge({
    channelId: "dg-1",
    remotePort,
    send(type, payload) {
      frames.push({ type, ...payload });
    },
  });

  await waitFor(() => frames.some((frame) => frame.type === "datagram.ready"));
  bridge.sendData(Buffer.from("ping"));
  await waitFor(() => frames.some((frame) => frame.type === "datagram.data"));

  const data = frames.find((frame) => frame.type === "datagram.data");
  assert.equal(Buffer.from(data.data, "base64").toString("utf8"), "echo:ping");

  bridge.close();
  server.close();
});

function bind(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.bind(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

async function waitFor(predicate) {
  const started = Date.now();
  while (Date.now() - started < 1000) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for condition.");
}
