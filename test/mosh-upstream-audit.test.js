import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { auditMoshCheckout, summarizeAudit } from "../scripts/mosh-upstream-audit.js";

test("mosh upstream audit reports license signals and core groups", async () => {
  const checkout = await makeMoshFixture();
  const audit = auditMoshCheckout(checkout);
  const summary = summarizeAudit(audit);

  assert.equal(audit.license.copyingMentionsGPLv3, true);
  assert.equal(audit.license.copyingIosMentionsAppStore, true);
  assert.equal(audit.license.ocbMentionsMoshWaiver, true);
  assert.equal(summary.ok, true);
  assert.equal(summary.coreGroups.find((group) => group.name === "network").sourceCount, 2);
  assert.deepEqual(audit.missingFiles, []);
});

test("mosh upstream audit records missing required files", async () => {
  const checkout = await makeMoshFixture({ omit: ["src/network/network.cc"] });
  const audit = auditMoshCheckout(checkout);
  const summary = summarizeAudit(audit);

  assert.equal(summary.ok, false);
  assert.deepEqual(audit.missingFiles, ["src/network/network.cc"]);
});

async function makeMoshFixture({ omit = [] } = {}) {
  const root = await mkdtemp(join(tmpdir(), "hovvi-mosh-audit-"));
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
    "src/network/network.cc": "",
    "src/network/network.h": "",
    "src/network/networktransport.h": "",
    "src/network/networktransport-impl.h": "",
    "src/crypto/crypto.cc": "",
    "src/crypto/crypto.h": "",
    "src/protobufs/transportinstruction.proto": "",
    "src/protobufs/userinput.proto": "",
    "src/protobufs/hostinput.proto": "",
    "src/crypto/Makefile.am": "libmoshcrypto_a_SOURCES = crypto.cc crypto.h base64.cc base64.h\n",
    "src/network/Makefile.am": "libmoshnetwork_a_SOURCES = network.cc network.h\n",
    "src/statesync/Makefile.am": "libmoshstatesync_a_SOURCES = completeterminal.cc completeterminal.h user.cc user.h\n",
    "src/terminal/Makefile.am": "libmoshterminal_a_SOURCES = terminal.cc terminal.h parser.cc parser.h\n",
    "src/protobufs/Makefile.am": "source = userinput.proto hostinput.proto transportinstruction.proto\n",
    "src/util/Makefile.am": "libmoshutil_a_SOURCES = timestamp.cc timestamp.h select.cc select.h\n",
    "src/frontend/Makefile.am": "mosh_client_SOURCES = mosh-client.cc stmclient.cc stmclient.h terminaloverlay.cc terminaloverlay.h\n",
  };
  for (const [path, contents] of Object.entries(files)) {
    if (omit.includes(path)) continue;
    const fullPath = join(root, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents);
  }
  return root;
}
