import { Duplex } from "node:stream";
import WebSocket from "ws";
import { validateAttachManifest } from "./attach.js";
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
  let failed = false;

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

  ws.on("close", () => {
    failAll(new Error("relay client disconnected"));
  });
  ws.on("error", (error) => {
    failAll(error);
  });

  ws.send(serialize(envelope("hello", { role: "client", token })));

  function ensureOpen() {
    if (failed || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      throw new Error("relay client is closed");
    }
  }

  function failAll(error, { sendDatagramClose = false } = {}) {
    if (failed) return;
    failed = true;

    for (const [streamId, entry] of pending) {
      pending.delete(streamId);
      streams.delete(streamId);
      entry.stream.destroy();
      entry.reject(error);
    }

    for (const [streamId, stream] of streams) {
      streams.delete(streamId);
      stream.destroy(error);
    }

    for (const waiter of deviceWaiters) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    deviceWaiters.clear();

    for (const [requestId, waiter] of attachWaiters) {
      attachWaiters.delete(requestId);
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }

    for (const [requestId, waiter] of scrollbackWaiters) {
      scrollbackWaiters.delete(requestId);
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }

    for (const [channelId, waiter] of datagramWaiters) {
      datagramWaiters.delete(channelId);
      datagrams.delete(channelId);
      clearTimeout(waiter.timer);
      if (sendDatagramClose) waiter.channel.close();
      else waiter.channel._close(error);
      waiter.reject(error);
    }

    for (const [channelId, channel] of datagrams) {
      datagrams.delete(channelId);
      if (sendDatagramClose) channel.close();
      else channel._close(error);
    }
  }

  const api = {
    devices: () => devices,
    listDevices({ timeoutMs = 3000 } = {}) {
      try {
        ensureOpen();
      } catch (error) {
        return Promise.reject(error);
      }
      if (haveDeviceSnapshot) return Promise.resolve(devices);
      return new Promise((resolve, reject) => {
        const waiter = { resolve, reject, timer: undefined };
        const timer = setTimeout(() => {
          deviceWaiters.delete(waiter);
          reject(new Error("Timed out waiting for relay device snapshot."));
        }, timeoutMs);
        waiter.timer = timer;
        waiter.resolve = (value) => {
          clearTimeout(timer);
          resolve(value);
        };
        deviceWaiters.add(waiter);
        ws.send(serialize(envelope("devices.list")));
      });
    },
    close() {
      failAll(new Error("relay client is closed"), { sendDatagramClose: true });
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
      try {
        ensureOpen();
      } catch (error) {
        return Promise.reject(error);
      }
      const channelId = `dg_${randomId()}`;
      const channel = createDatagramChannel({ ws, channelId, datagrams, maxDatagramBytes });
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
      try {
        ensureOpen();
      } catch (error) {
        return Promise.reject(error);
      }
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
      try {
        ensureOpen();
      } catch (error) {
        return Promise.reject(error);
      }
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
    async prepareMoshDatagramAttach({
      deviceId,
      sessionName = "main",
      lines = 2000,
      create = false,
      timeoutMs = 5000,
      datagramTimeoutMs = 3000,
    }) {
      const manifest = await api.prepareAttach({ deviceId, sessionName, lines, create, timeoutMs });
      const method = selectMoshRelayDatagramMethod(manifest);
      const transport = method.transport;
      const channel = await api.openDatagram({
        deviceId: manifest.deviceId || deviceId,
        label: transport.label,
        remoteHost: transport.remoteHost,
        remotePort: transport.remotePort,
        maxDatagramBytes: transport.maxDatagramBytes,
        timeoutMs: datagramTimeoutMs,
      });
      return { manifest, method, transport, channel };
    },
    fetchScrollback({ deviceId, sessionName = "main", lines = 2000, timeoutMs = 5000 }) {
      try {
        ensureOpen();
      } catch (error) {
        return Promise.reject(error);
      }
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
  return api;
}

function selectMoshRelayDatagramMethod(manifest) {
  validateAttachManifest(manifest);
  const methods = [...(manifest?.methods || [])].sort((left, right) => (left.priority || 0) - (right.priority || 0));
  const method = methods.find((candidate) => {
    return candidate.name === "mosh" && candidate.status === "available" && candidate.transport?.kind === "relay-datagram";
  });
  if (!method) throw new Error("attach manifest does not include an available mosh relay datagram transport");
  const transport = method.transport;
  if (!Number.isInteger(Number(transport.remotePort))) {
    throw new Error("mosh relay datagram transport is missing remotePort");
  }
  if (!/^[A-Za-z0-9+/]{22}$/.test(transport.key || "")) {
    throw new Error("mosh relay datagram transport has an invalid server key");
  }
  return method;
}

function createDatagramChannel({ ws, channelId, datagrams, maxDatagramBytes }) {
  const queue = [];
  const waiters = [];
  const datagramLimit = Number(maxDatagramBytes || 1200);
  let closed = false;

  return {
    channelId,
    send(bytes) {
      if (closed) throw new Error("datagram channel is closed");
      const payload = Buffer.from(bytes);
      if (payload.length > datagramLimit) {
        throw new Error(`datagram exceeds maxDatagramBytes (${payload.length} > ${datagramLimit})`);
      }
      ws.send(
        serialize(
          envelope("datagram.data", {
            channelId,
            data: payload.toString("base64"),
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
