import { createSocket } from "node:dgram";

export function createUdpDatagramBridge({
  channelId,
  remoteHost = "127.0.0.1",
  remotePort,
  send,
  socket = createSocket("udp4"),
}) {
  if (!channelId) throw new Error("channelId is required.");
  if (!remotePort) throw new Error("remotePort is required.");

  let closed = false;

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
    if (closed) return;
    socket.send(bytes);
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
