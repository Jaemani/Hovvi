import { userInfo } from "node:os";

export function buildAttachManifest({ device, sessionName, lines = 2000 }) {
  const target = escapeTmuxTarget(sessionName);
  const user = userInfo().username;
  return {
    kind: "mosh-tmux",
    version: 1,
    deviceId: device?.id,
    deviceName: device?.name,
    sessionName,
    user,
    methods: [
      {
        name: "mosh",
        priority: 10,
        status: "planned",
        command: [
          "mosh-server",
          "new",
          "-s",
          "-c",
          "256",
          "-l",
          `LANG=${process.env.LANG || "en_US.UTF-8"}`,
          "--",
          "tmux",
          "attach-session",
          "-t",
          target,
        ],
        notes: "Compatibility target for mobile attach. The relay datagram transport must carry the resulting encrypted mosh packets.",
      },
      {
        name: "ssh-tcp-forward",
        priority: 20,
        status: "available",
        command: ["ssh", "-p", "<local-forward-port>", "localhost", "--", "tmux", "attach-session", "-t", target],
        notes: "Development fallback over Hovvi relay TCP forwarding.",
      },
      {
        name: "local-tmux",
        priority: 30,
        status: "available-on-host",
        command: ["tmux", "attach-session", "-t", target],
        notes: "Host-local fallback.",
      },
    ],
    scrollback: {
      source: "tmux.capture-pane",
      command: ["tmux", "capture-pane", "-t", target, "-p", "-S", `-${lines}`],
      lines,
    },
    controlMode: {
      source: "tmux.control-mode",
      command: ["tmux", "-CC", "attach-session", "-t", target],
    },
  };
}

export function escapeTmuxTarget(sessionName) {
  if (!sessionName || typeof sessionName !== "string") throw new Error("sessionName is required.");
  if (/[\r\n\t]/.test(sessionName)) throw new Error("sessionName cannot contain control characters.");
  return sessionName;
}

export function parseMoshConnectLine(line) {
  const match = /^MOSH CONNECT (?<port>\d+) (?<key>[A-Za-z0-9+/=]+)$/m.exec(line.trim());
  if (!match) return null;
  return {
    port: Number(match.groups.port),
    key: match.groups.key,
  };
}
