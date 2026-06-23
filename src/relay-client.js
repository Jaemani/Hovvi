import { Duplex } from "node:stream";
import WebSocket from "ws";
import { envelope, parseEnvelope, randomId, serialize } from "./protocol.js";

export async function createClient({ relayUrl, token }) {
  const ws = new WebSocket(relayUrl);
  const pending = new Map();
  const streams = new Map();
  let devices = [];

  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });

  ws.on("message", (data) => {
    let message;
    try {
      message = parseEnvelope(data);
    } catch {
      return;
    }

    if (message.type === "devices.snapshot") {
      devices = message.devices || [];
      return;
    }

    if (message.type === "forward.ready") {
      const entry = pending.get(message.streamId);
      if (entry) {
        pending.delete(message.streamId);
        entry.resolve(entry.stream);
      }
      return;
    }

    if (message.type === "forward.error") {
      const entry = pending.get(message.streamId);
      if (entry) {
        pending.delete(message.streamId);
        entry.reject(new Error(message.message || "forward failed"));
        return;
      }
      const stream = streams.get(message.streamId);
      if (stream) stream.destroy(new Error(message.message || "forward failed"));
      return;
    }

    if (message.type === "forward.data") {
      const stream = streams.get(message.streamId);
      if (stream) stream.push(Buffer.from(message.data || "", "base64"));
      return;
    }

    if (message.type === "forward.end") {
      const stream = streams.get(message.streamId);
      if (stream) {
        stream.push(null);
        streams.delete(message.streamId);
      }
    }
  });

  ws.send(serialize(envelope("hello", { role: "client", token })));

  return {
    devices: () => devices,
    openForward({ deviceId, remoteHost, remotePort }) {
      const streamId = `str_${randomId()}`;
      const stream = createRelayDuplex({ ws, streamId });
      streams.set(streamId, stream);
      const promise = new Promise((resolve, reject) => {
        pending.set(streamId, { resolve, reject, stream });
      });
      ws.send(
        serialize(
          envelope("forward.open", {
            streamId,
            deviceId,
            remoteHost,
            remotePort,
          }),
        ),
      );
      return promise;
    },
  };
}

function createRelayDuplex({ ws, streamId }) {
  return new Duplex({
    read() {},
    write(chunk, _encoding, callback) {
      ws.send(
        serialize(
          envelope("forward.data", {
            streamId,
            data: Buffer.from(chunk).toString("base64"),
          }),
        ),
        callback,
      );
    },
    final(callback) {
      ws.send(serialize(envelope("forward.end", { streamId })), callback);
    },
    destroy(error, callback) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(serialize(envelope("forward.end", { streamId })));
      }
      callback(error);
    },
  });
}
