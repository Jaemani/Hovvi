import { spawn, spawnSync } from "node:child_process";

export function commandExists(command) {
  const escaped = command.replaceAll("'", "'\\''");
  const result = spawnSync("sh", ["-lc", `command -v '${escaped}'`], {
    encoding: "utf8",
  });
  return result.status === 0;
}

export function run(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: options.timeout ?? 5000,
    killSignal: options.killSignal ?? "SIGKILL",
    env: options.env ?? process.env,
    cwd: options.cwd,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error,
  };
}

export function execFile(command, args = [], options = {}) {
  const child = spawn(command, args, {
    stdio: options.stdio || ["ignore", "pipe", "pipe"],
    env: options.env || process.env,
  });
  return child;
}

export function runText(command, args = [], options = {}) {
  const result = run(command, args, options);
  const text = `${result.stdout}${result.stderr}`.trim();
  return { ...result, text };
}
