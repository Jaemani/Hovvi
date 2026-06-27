import test from "node:test";
import assert from "node:assert/strict";
import { checkPackageBoundary } from "../scripts/package-boundary-check.js";

test("package boundary accepts shipped MIT scaffold and Hovvi-owned adapter files", () => {
  const result = checkPackageBoundary({
    files: [
      "native/mosh-core/include/hovvi_mosh_core.h",
      "native/mosh-core/src/hovvi_mosh_core_unavailable.c",
      "native/mosh-core/adapter/hovvi_packet_io.h",
      "native/mosh-core/tests/abi_smoke.c",
      "docs/adr/0004-packaging.md",
      "src/cli.js",
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("package boundary rejects vendored mosh source and native build artifacts", () => {
  const result = checkPackageBoundary({
    files: [
      "native/mosh-core/vendor/mosh/COPYING",
      "native/mosh-core/vendor/mosh/src/crypto/crypto.cc",
      "native/mosh-core/build/upstream/libhovvi_mosh_core_upstream.a",
      "native/mosh-core/src/hovvi_mosh_core_upstream.cc",
      "apps/ios/.build/debug/HovviMobileApp",
    ],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    "forbidden package file: native/mosh-core/vendor/mosh/COPYING (vendored upstream mosh GPL source)",
    "forbidden package file: native/mosh-core/vendor/mosh/src/crypto/crypto.cc (vendored upstream mosh GPL source)",
    "forbidden package file: native/mosh-core/build/upstream/libhovvi_mosh_core_upstream.a (native build artifacts may include GPL-linked objects)",
    "forbidden package file: native/mosh-core/src/hovvi_mosh_core_upstream.cc (GPL-linked upstream C ABI implementation source)",
    "forbidden package file: apps/ios/.build/debug/HovviMobileApp (Swift build artifacts)",
  ]);
});
