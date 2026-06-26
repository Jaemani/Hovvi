import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { planMoshVendor, vendorMosh } from "../scripts/mosh-vendor.js";

test("planMoshVendor excludes mosh-client CLI but keeps STM client boundary files", async () => {
  const checkout = await makeMoshFixture();
  const plan = planMoshVendor({ checkoutPath: checkout, destination: join(checkout, "vendor") });

  assert.equal(plan.files.includes("src/frontend/stmclient.cc"), true);
  assert.equal(plan.files.includes("src/frontend/terminaloverlay.cc"), true);
  assert.equal(plan.files.includes("src/frontend/mosh-client.cc"), false);
  assert.equal(plan.excluded.frontendClient.includes("mosh-client.cc"), true);
});

test("vendorMosh copies planned files and writes a manifest", async () => {
  const checkout = await makeMoshFixture();
  const destination = join(await mkdtemp(join(tmpdir(), "hovvi-mosh-vendor-dest-")), "mosh");
  const result = vendorMosh({ checkoutPath: checkout, destination, clean: true });

  assert.equal(result.copied.includes("COPYING"), true);
  assert.equal(existsSync(join(destination, "COPYING.iOS")), true);
  assert.equal(existsSync(join(destination, "src/frontend/stmclient.h")), true);
  assert.equal(existsSync(join(destination, "src/frontend/mosh-client.cc")), false);
  assert.equal(existsSync(join(destination, "HOVVI_VENDOR_MANIFEST.json")), true);
});

async function makeMoshFixture() {
  const root = await mkdtemp(join(tmpdir(), "hovvi-mosh-vendor-"));
  const files = {
    COPYING: "GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007\n",
    "COPYING.iOS": "The Mosh developers allow otherwise-compliant App Store distribution.\n",
    "ocb-license.html": "Mosh with the iOS waiver is licensed for OCB-related IP.\n",
    "README.md": "# Mosh\n",
    "configure.ac": "AC_INIT([mosh])\n",
    "src/frontend/stmclient.cc": "",
    "src/frontend/stmclient.h": "",
    "src/frontend/terminaloverlay.cc": "",
    "src/frontend/terminaloverlay.h": "",
    "src/frontend/mosh-client.cc": "",
    "src/network/network.cc": "",
    "src/network/network.h": "",
    "src/network/networktransport.h": "",
    "src/network/networktransport-impl.h": "",
    "src/network/transportfragment.cc": "",
    "src/network/transportfragment.h": "",
    "src/network/transportsender.h": "",
    "src/network/transportsender-impl.h": "",
    "src/network/transportstate.h": "",
    "src/network/compressor.cc": "",
    "src/network/compressor.h": "",
    "src/crypto/crypto.cc": "",
    "src/crypto/crypto.h": "",
    "src/crypto/base64.cc": "",
    "src/crypto/base64.h": "",
    "src/crypto/ae.h": "",
    "src/crypto/ocb_internal.cc": "",
    "src/protobufs/transportinstruction.proto": "",
    "src/protobufs/userinput.proto": "",
    "src/protobufs/hostinput.proto": "",
    "src/statesync/completeterminal.cc": "",
    "src/statesync/completeterminal.h": "",
    "src/statesync/user.cc": "",
    "src/statesync/user.h": "",
    "src/terminal/terminal.cc": "",
    "src/terminal/terminal.h": "",
    "src/terminal/parser.cc": "",
    "src/terminal/parser.h": "",
    "src/util/timestamp.cc": "",
    "src/util/timestamp.h": "",
    "src/util/select.cc": "",
    "src/util/select.h": "",
    "src/crypto/Makefile.am": "libmoshcrypto_a_SOURCES = ae.h ocb_internal.cc base64.cc base64.h crypto.cc crypto.h\n",
    "src/network/Makefile.am": "libmoshnetwork_a_SOURCES = network.cc network.h networktransport-impl.h networktransport.h transportfragment.cc transportfragment.h transportsender-impl.h transportsender.h transportstate.h compressor.cc compressor.h\n",
    "src/statesync/Makefile.am": "libmoshstatesync_a_SOURCES = completeterminal.cc completeterminal.h user.cc user.h\n",
    "src/terminal/Makefile.am": "libmoshterminal_a_SOURCES = terminal.cc terminal.h parser.cc parser.h\n",
    "src/protobufs/Makefile.am": "source = userinput.proto hostinput.proto transportinstruction.proto\n",
    "src/util/Makefile.am": "libmoshutil_a_SOURCES = timestamp.cc timestamp.h select.cc select.h\n",
    "src/frontend/Makefile.am": "mosh_client_SOURCES = mosh-client.cc stmclient.cc stmclient.h terminaloverlay.cc terminaloverlay.h\n",
  };
  for (const [path, contents] of Object.entries(files)) {
    const fullPath = join(root, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents);
  }
  return root;
}
