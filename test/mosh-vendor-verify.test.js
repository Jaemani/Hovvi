import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { verifyMoshVendor } from "../scripts/mosh-vendor-verify.js";

test("verifyMoshVendor accepts manifest hashes", async () => {
  const vendorDir = await makeVendorFixture({ fileContents: "ok\n" });
  const result = verifyMoshVendor({ vendorDir });

  assert.equal(result.ok, true);
  assert.equal(result.fileCount, 1);
  assert.deepEqual(result.errors, []);
});

test("verifyMoshVendor reports hash mismatches", async () => {
  const vendorDir = await makeVendorFixture({ fileContents: "ok\n" });
  writeFileSync(join(vendorDir, "COPYING"), "changed\n");

  const result = verifyMoshVendor({ vendorDir });
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, ["hash mismatch: COPYING"]);
});

test("verifyMoshVendor reports files not recorded in the manifest", async () => {
  const vendorDir = await makeVendorFixture({ fileContents: "ok\n" });
  const extraPath = join(vendorDir, "src/network/unplanned.cc");
  mkdirSync(dirname(extraPath), { recursive: true });
  writeFileSync(extraPath, "extra\n");

  const result = verifyMoshVendor({ vendorDir });
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, ["unlisted vendored file: src/network/unplanned.cc"]);
});

async function makeVendorFixture({ fileContents }) {
  const vendorDir = await mkdtemp(join(tmpdir(), "hovvi-mosh-vendor-verify-"));
  writeFileSync(join(vendorDir, "COPYING"), fileContents);
  const manifest = {
    upstream: {
      repository: "https://github.com/mobile-shell/mosh",
      commit: "fixture",
    },
    files: ["COPYING"],
    fileHashes: {
      COPYING: sha256(Buffer.from(fileContents)),
    },
  };
  const manifestPath = join(vendorDir, "HOVVI_VENDOR_MANIFEST.json");
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return vendorDir;
}

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}
