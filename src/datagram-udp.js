import { createSocket } from "node:dgram";

export function createUdpDatagramBridge({
  channelId,
  remoteHost = "127.0.0.1",
  remotePort,
  maxDatagramBytes = 65507,
  send,
  socket = createSocket("udp4"),
}) {
  if (!channelId) throw new Error("channelId is required.");
  if (!remotePort) throw new Error("remotePort is required.");
  if (!Number.isInteger(Number(maxDatagramBytes)) || Number(maxDatagramBytes) < 1 || Number(maxDatagramBytes) > 65507) {
    throw new Error("maxDatagramBytes must be an integer between 1 and 65507.");
  }

  let closed = false;
  const datagramLimit = Number(maxDatagramBytes);

  socket.on("message", (chunk) => {
    send("datagram.data", {
      channelId,
      data: Buffer.from(chunk).toString("base64"),
    });
  });
  socket.on("error", (error) => {
    send("datagram.error", { channelId, message: error.message });
    close();
  });

  socket.connect(Number(remotePort), remoteHost, () => {
    send("datagram.ready", { channelId });
  });

  function sendData(bytes) {
    if (closed) return false;
    if (bytes.length > datagramLimit) {
      send("datagram.error", {
        channelId,
        message: `datagram exceeds maxDatagramBytes (${bytes.length} > ${datagramLimit})`,
      });
      return false;
    }
    socket.send(bytes);
    return true;
  }

  function close() {
    if (closed) return;
    closed = true;
    socket.close();
  }

  return {
    sendData,
    close,
  };
}
