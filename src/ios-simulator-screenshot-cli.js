import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export function parseIosSimulatorScreenshotArgs(argv) {
  const args = new Set(argv);
  return {
    fixture: getValueArg(argv, "--fixture="),
    outputPath: getValueArg(argv, "--output="),
    metadataPath: getValueArg(argv, "--metadata="),
    keepScreenshot: args.has("--keep-screenshot"),
    json: args.has("--json"),
    requireCaptured: args.has("--require-captured"),
  };
}

export function writeScreenshotMetadata(metadataPath, result) {
  if (!metadataPath) {
    return;
  }
  const resolvedPath = path.resolve(metadataPath);
  mkdirSync(path.dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, `${JSON.stringify(result, null, 2)}\n`);
}

export function formatScreenshotResult(result) {
  if (result.status === "captured") {
    const lines = [
      `iOS simulator screenshot ready: ${result.image.width}x${result.image.height} ${result.bundleId}`,
    ];
    if (result.screenshot) {
      lines.push(result.screenshot);
    }
    return { stream: "stdout", text: lines.join("\n") };
  }
  if (result.status === "failed") {
    const lines = [`iOS simulator screenshot failed: ${result.reason}`];
    if (result.simctl) {
      lines.push(result.simctl);
    }
    return { stream: "stderr", text: lines.join("\n") };
  }
  return { stream: "stdout", text: `Skipping iOS simulator screenshot: ${result.reason}` };
}

function getValueArg(argv, prefix) {
  const arg = argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}
