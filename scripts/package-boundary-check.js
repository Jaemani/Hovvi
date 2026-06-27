#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const FORBIDDEN_PREFIXES = [
  {
    prefix: "native/mosh-core/vendor/",
    reason: "vendored upstream mosh GPL source",
  },
  {
    prefix: "native/mosh-core/build/",
    reason: "native build artifacts may include GPL-linked objects",
  },
  {
    prefix: "apps/ios/.build/",
    reason: "Swift build artifacts",
  },
];

const FORBIDDEN_NATIVE_SUFFIXES = [
  ".a",
  ".dylib",
  ".o",
  ".so",
];

const FORBIDDEN_NATIVE_BASENAMES = [
  "hovvi_mosh_core_upstream.cc",
  "hovvi_mosh_core_upstream.mm",
  "hovvi_mosh_core_upstream.cpp",
];

export function checkPackageBoundary({ files }) {
  const errors = [];
  const forbiddenFiles = [];

  for (const file of files) {
    const violation = packageBoundaryViolation(file);
    if (!violation) continue;
    forbiddenFiles.push({ path: file, reason: violation });
    errors.push(`forbidden package file: ${file} (${violation})`);
  }

  return {
    ok: errors.length === 0,
    fileCount: files.length,
    forbiddenFiles,
    errors,
  };
}

export function packageFilesFromNpmPack({ cwd = process.cwd() } = {}) {
  const output = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd,
    encoding: "utf8",
  });
  const packs = JSON.parse(output);
  return packs.flatMap((pack) => pack.files.map((file) => file.path));
}

function packageBoundaryViolation(file) {
  for (const rule of FORBIDDEN_PREFIXES) {
    if (file.startsWith(rule.prefix)) return rule.reason;
  }

  if (file.startsWith("native/mosh-core/")) {
    if (FORBIDDEN_NATIVE_SUFFIXES.some((suffix) => file.endsWith(suffix))) {
      return "native binary or object artifact";
    }

    const basename = file.split("/").pop();
    if (FORBIDDEN_NATIVE_BASENAMES.includes(basename)) {
      return "GPL-linked upstream C ABI implementation source";
    }
  }

  return null;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const files = packageFilesFromNpmPack();
    const result = checkPackageBoundary({ files });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
