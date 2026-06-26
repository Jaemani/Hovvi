#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_VENDOR_DIR = "native/mosh-core/vendor/mosh";

export function verifyMoshVendor({ vendorDir = DEFAULT_VENDOR_DIR } = {}) {
  const manifestPath = join(vendorDir, "HOVVI_VENDOR_MANIFEST.json");
  if (!existsSync(manifestPath)) {
    return {
      ok: false,
      vendorDir,
      errors: [`missing manifest: ${manifestPath}`],
    };
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const errors = [];
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  const hashes = manifest.fileHashes || {};
  const listedFiles = new Set(files);

  for (const file of files) {
    const path = join(vendorDir, file);
    if (!existsSync(path)) {
      errors.push(`missing file: ${file}`);
      continue;
    }
    const expectedHash = hashes[file];
    if (!expectedHash) {
      errors.push(`missing hash: ${file}`);
      continue;
    }
    const actualHash = sha256(path);
    if (actualHash !== expectedHash) {
      errors.push(`hash mismatch: ${file}`);
    }
  }

  for (const file of Object.keys(hashes)) {
    if (!listedFiles.has(file)) {
      errors.push(`hash for unlisted file: ${file}`);
    }
  }

  for (const file of listVendorFiles(vendorDir)) {
    if (file === "HOVVI_VENDOR_MANIFEST.json") continue;
    if (!listedFiles.has(file)) {
      errors.push(`unlisted vendored file: ${file}`);
    }
  }

  return {
    ok: errors.length === 0,
    vendorDir,
    upstream: manifest.upstream,
    fileCount: files.length,
    errors,
  };
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function listVendorFiles(root, prefix = "") {
  const entries = readdirSync(join(root, prefix), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const fullPath = join(root, relativePath);
    if (entry.isDirectory()) {
      files.push(...listVendorFiles(root, relativePath));
    } else if (entry.isFile() || statSync(fullPath).isFile()) {
      files.push(relativePath);
    }
  }
  return files.sort();
}

function parseArgs(argv) {
  const vendorIndex = argv.indexOf("--vendor-dir");
  if (vendorIndex !== -1 && !argv[vendorIndex + 1]) {
    throw new Error("Usage: node scripts/mosh-vendor-verify.js [--vendor-dir <path>]");
  }
  return {
    vendorDir: vendorIndex === -1 ? DEFAULT_VENDOR_DIR : argv[vendorIndex + 1],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = verifyMoshVendor(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
