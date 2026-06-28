#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { iosSimulatorScreenshotMatrixCheck } from "../src/ios-simulator-screenshot-matrix.js";

const options = parseArgs(process.argv.slice(2));
const result = iosSimulatorScreenshotMatrixCheck({
  fixtures: options.fixtures,
  outputDir: options.outputDir,
});

if (options.metadataPath) {
  const metadataPath = path.resolve(options.metadataPath);
  mkdirSync(path.dirname(metadataPath), { recursive: true });
  writeFileSync(metadataPath, `${JSON.stringify(result, null, 2)}\n`);
}

if (options.json) {
  console.log(JSON.stringify(result, null, 2));
} else if (result.status === "captured") {
  console.log(`iOS simulator screenshot matrix ready: ${result.results.length} fixtures`);
} else if (result.status === "failed") {
  console.error(`iOS simulator screenshot matrix failed: ${result.reason}`);
} else {
  console.log(`Skipping iOS simulator screenshot matrix: ${result.reason}`);
}

if (options.requireCaptured && result.status !== "captured") {
  process.exit(1);
}

if (result.status === "failed") {
  process.exit(1);
}

function parseArgs(argv) {
  const flags = new Set(argv);
  const fixturesArg = getValueArg(argv, "--fixtures=");
  return {
    outputDir: getValueArg(argv, "--output-dir="),
    metadataPath: getValueArg(argv, "--metadata="),
    fixtures: fixturesArg
      ? fixturesArg.split(",").map((entry) => entry.trim()).filter(Boolean)
      : undefined,
    json: flags.has("--json"),
    requireCaptured: flags.has("--require-captured"),
  };
}

function getValueArg(argv, prefix) {
  const arg = argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}
