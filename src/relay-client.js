import { Duplex } from "node:stream";
import WebSocket from "ws";
import { envelope, parseEnvelope, randomId, serialize } from "./protocol.js";

export async function createClient({ relayUrl, token }) {
  const ws = new WebSocket(relayUrl);
  const pending = new Map();
  const streams = new Map();
  const datagramWaiters = new Map();
  const datagrams = new Map();
  const deviceWaiters = new Set();
  const attachWaiters = new Map();
  const scrollbackWaiters = new Map();
  let devices = [];
  let haveDeviceSnapshot = false;

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
      haveDeviceSnapshot = true;
      for (const waiter of deviceWaiters) waiter.resolve(devices);
      deviceWaiters.clear();
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

    if (message.type === "session.attach.ready" || message.type === "session.attach.error") {
      const waiter = attachWaiters.get(message.requestId);
      if (!waiter) return;
      attachWaiters.delete(message.requestId);
      clearTimeout(waiter.timer);
      if (message.type === "session.attach.error") {
        waiter.reject(new Error(message.message || "attach prepare failed"));
      } else {
        waiter.resolve(message.manifest);
      }
      return;
    }

    if (message.type === "session.scrollback.ready" || message.type === "session.scrollback.error") {
      const waiter = scrollbackWaiters.get(message.requestId);
      if (!waiter) return;
      scrollbackWaiters.delete(message.requestId);
      clearTimeout(waiter.timer);
      if (message.type === "session.scrollback.error") {
        waiter.reject(new Error(message.message || "scrollback fetch failed"));
      } else {
        waiter.resolve({
          sessionName: message.sessionName,
          lines: message.lines,
          text: message.text,
        });
      }
      return;
    }

    if (message.type === "datagram.ready") {
      const waiter = datagramWaiters.get(message.channelId);
      if (!waiter) return;
      datagramWaiters.delete(message.channelId);
      clearTimeout(waiter.timer);
      waiter.resolve(waiter.channel);
      return;
    }

    if (message.type === "datagram.error") {
      const error = new Error(message.message || "datagram failed");
      const waiter = datagramWaiters.get(message.channelId);
      if (waiter) {
        datagramWaiters.delete(message.channelId);
        datagrams.delete(message.channelId);
        clearTimeout(waiter.timer);
        waiter.reject(error);
        return;
      }
      const channel = datagrams.get(message.channelId);
      if (channel) {
        datagrams.delete(message.channelId);
        channel._close(error);
      }
      return;
    }

    if (message.type === "datagram.data") {
      const channel = datagrams.get(message.channelId);
      if (channel) channel._push(Buffer.from(message.data || "", "base64"));
      return;
    }

    if (message.type === "datagram.close") {
      const channel = datagrams.get(message.channelId);
      if (channel) {
        datagrams.delete(message.channelId);
        channel._close();
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
    listDevices({ timeoutMs = 3000 } = {}) {
      if (haveDeviceSnapshot) return Promise.resolve(devices);
      return new Promise((resolve, reject) => {
        const waiter = { resolve, reject };
        const timer = setTimeout(() => {
          deviceWaiters.delete(waiter);
          reject(new Error("Timed out waiting for relay device snapshot."));
        }, timeoutMs);
        waiter.resolve = (value) => {
          clearTimeout(timer);
          resolve(value);
        };
        deviceWaiters.add(waiter);
        ws.send(serialize(envelope("devices.list")));
      });
    },
    close() {
      for (const channel of datagrams.values()) channel.close();
      for (const [channelId, waiter] of datagramWaiters) {
        clearTimeout(waiter.timer);
        waiter.channel._close(new Error("relay client is closed"));
        datagrams.delete(channelId);
        waiter.reject(new Error("relay client is closed"));
      }
      datagramWaiters.clear();
      ws.close();
    },
    openDatagram({
      deviceId,
      remoteHost = "127.0.0.1",
      remotePort,
      label = "mosh",
      maxDatagramBytes = 1200,
      timeoutMs = 3000,
    }) {
      const channelId = `dg_${randomId()}`;
      const channel = createDatagramChannel({ ws, channelId, datagrams });
      datagrams.set(channelId, channel);
      const promise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          datagramWaiters.delete(channelId);
          datagrams.delete(channelId);
          channel._close(new Error("Timed out waiting for datagram channel."));
          reject(new Error("Timed out waiting for datagram channel."));
        }, timeoutMs);
        datagramWaiters.set(channelId, { resolve, reject, timer, channel });
      });
      ws.send(
        serialize(
          envelope("datagram.open", {
            channelId,
            deviceId,
            label,
            remoteHost,
            remotePort,
            maxDatagramBytes,
          }),
        ),
      );
      return promise;
    },
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
    prepareAttach({ deviceId, sessionName = "main", lines = 2000, create = false, timeoutMs = 5000 }) {
      const request = envelope("session.attach.prepare", {
        deviceId,
        sessionName,
        lines,
        create,
      });
      const promise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          attachWaiters.delete(request.id);
          reject(new Error("Timed out waiting for attach manifest."));
        }, timeoutMs);
        attachWaiters.set(request.id, { resolve, reject, timer });
      });
      ws.send(serialize(request));
      return promise;
    },
    fetchScrollback({ deviceId, sessionName = "main", lines = 2000, timeoutMs = 5000 }) {
      const request = envelope("session.scrollback.fetch", {
        deviceId,
        sessionName,
        lines,
      });
      const promise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          scrollbackWaiters.delete(request.id);
          reject(new Error("Timed out waiting for scrollback."));
        }, timeoutMs);
        scrollbackWaiters.set(request.id, { resolve, reject, timer });
      });
      ws.send(serialize(request));
      return promise;
    },
  };
}

function createDatagramChannel({ ws, channelId, datagrams }) {
  const queue = [];
  const waiters = [];
  let closed = false;

  return {
    channelId,
    send(bytes) {
      if (closed) throw new Error("datagram channel is closed");
      ws.send(
        serialize(
          envelope("datagram.data", {
            channelId,
            data: Buffer.from(bytes).toString("base64"),
          }),
        ),
      );
    },
    nextMessage({ timeoutMs = 3000 } = {}) {
      if (queue.length > 0) return Promise.resolve(queue.shift());
      if (closed) return Promise.reject(new Error("datagram channel is closed"));
      return new Promise((resolve, reject) => {
        const waiter = { resolve, reject };
        waiter.timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("Timed out waiting for datagram message."));
        }, timeoutMs);
        waiters.push(waiter);
      });
    },
    close() {
      if (closed) return;
      closed = true;
      datagrams.delete(channelId);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(serialize(envelope("datagram.close", { channelId })));
      }
      rejectWaiters(waiters, new Error("datagram channel is closed"));
    },
    _push(bytes) {
      if (closed) return;
      const waiter = waiters.shift();
      if (waiter) {
        clearTimeout(waiter.timer);
        waiter.resolve(bytes);
      } else {
        queue.push(bytes);
      }
    },
    _close(error = new Error("datagram channel is closed")) {
      if (closed) return;
      closed = true;
      rejectWaiters(waiters, error);
    },
  };
}

function rejectWaiters(waiters, error) {
  for (const waiter of waiters.splice(0)) {
    clearTimeout(waiter.timer);
    waiter.reject(error);
  }
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
