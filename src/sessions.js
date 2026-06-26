import { spawn } from "node:child_process";
import { commandExists, runText } from "./shell.js";

const AI_COMMANDS = new Set(["claude", "codex", "gemini", "aider", "cursor-agent"]);
const CMUX_COMMANDS = new Set(["cmux"]);

export async function listSessions() {
  if (!commandExists("tmux")) return [];
  const sessions = listTmuxSessions();
  const panes = listTmuxPanes();
  const panesBySession = new Map();
  for (const pane of panes) {
    const list = panesBySession.get(pane.sessionName) || [];
    list.push(pane);
    panesBySession.set(pane.sessionName, list);
  }

  return sessions.map((session) => {
    const sessionPanes = panesBySession.get(session.name) || [];
    const aiPanes = sessionPanes.filter((pane) => isAiCommand(pane.command));
    const cmuxPanes = sessionPanes.filter((pane) => isCmuxCommand(pane.command));
    return {
      ...session,
      panes: sessionPanes,
      aiPanes,
      cmuxPanes,
      kind: classifySession({ aiPanes, cmuxPanes }),
    };
  });
}

export function listTmuxSessions() {
  const format = "#{session_id}\t#{session_name}\t#{session_attached}\t#{session_windows}\t#{session_created}\t#{session_activity}";
  const result = runText("tmux", ["list-sessions", "-F", format]);
  if (!result.ok) return [];
  return result.stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map(parseTmuxSessionLine);
}

export function listTmuxPanes() {
  const format =
    "#{session_name}\t#{window_name}\t#{pane_id}\t#{pane_current_command}\t#{pane_current_path}\t#{pane_title}";
  const result = runText("tmux", ["list-panes", "-a", "-F", format]);
  if (!result.ok) return [];
  return result.stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map(parseTmuxPaneLine);
}

export function parseTmuxSessionLine(line) {
  const [id, name, attached, windows, created, activity] = line.split("\t");
  return {
    id,
    name,
    attached: attached === "1",
    windows: Number(windows),
    createdAt: Number(created),
    lastActivityAt: Number(activity),
  };
}

export function parseTmuxPaneLine(line) {
  const [sessionName, windowName, paneId, command, cwd, title] = line.split("\t");
  return {
    sessionName,
    windowName,
    paneId,
    command,
    cwd,
    title,
    ai: isAiCommand(command),
    cmux: isCmuxCommand(command),
  };
}

export function isAiCommand(command = "") {
  const normalized = command.toLowerCase().split(/[\\/]/).at(-1);
  return AI_COMMANDS.has(normalized);
}

export function isCmuxCommand(command = "") {
  const normalized = command.toLowerCase().split(/[\\/]/).at(-1);
  return CMUX_COMMANDS.has(normalized);
}

export function classifySession({ aiPanes = [], cmuxPanes = [] } = {}) {
  if (cmuxPanes.length > 0) return "cmux";
  if (aiPanes.length > 0) return "ai-dev";
  return "tmux";
}

export async function ensureTmuxSession(sessionName = "main") {
  if (!commandExists("tmux")) throw new Error("tmux is required. Install with `brew install tmux`.");
  if (hasTmuxSession(sessionName)) return;
  const created = runText("tmux", ["new-session", "-d", "-s", sessionName]);
  if (!created.ok) throw new Error(created.text || `Failed to create tmux session ${sessionName}.`);
}

export function hasTmuxSession(sessionName = "main") {
  if (!commandExists("tmux")) throw new Error("tmux is required. Install with `brew install tmux`.");
  return runText("tmux", ["has-session", "-t", sessionName]).ok;
}

export function attachTmux(sessionName = "main") {
  if (!commandExists("tmux")) throw new Error("tmux is required. Install with `brew install tmux`.");
  const child = spawn("tmux", ["attach-session", "-t", sessionName], { stdio: "inherit" });
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) reject(new Error(`tmux exited with signal ${signal}`));
      else if (code === 0) resolve();
      else reject(new Error(`tmux exited with code ${code}`));
    });
  });
}

export async function captureTmuxScrollback(sessionName = "main", lines = 2000) {
  if (!commandExists("tmux")) throw new Error("tmux is required. Install with `brew install tmux`.");
  const result = runText("tmux", ["capture-pane", "-t", sessionName, "-p", "-S", `-${lines}`]);
  if (!result.ok) throw new Error(result.text || `Failed to capture tmux session ${sessionName}.`);
  return result.stdout;
}
