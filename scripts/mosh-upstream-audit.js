#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

export const CORE_GROUPS = [
  {
    name: "crypto",
    makefile: "src/crypto/Makefile.am",
    library: "libmoshcrypto.a",
    role: "AES-OCB session crypto, printable mosh server key parsing, base64, nonce handling.",
  },
  {
    name: "network",
    makefile: "src/network/Makefile.am",
    library: "libmoshnetwork.a",
    role: "SSP packet transport, retransmit/ack logic, fragmentation, compression.",
    boundary: "Replace socket send/recv with Hovvi relay datagram IO.",
  },
  {
    name: "statesync",
    makefile: "src/statesync/Makefile.am",
    library: "libmoshstatesync.a",
    role: "User input stream and complete terminal state synchronization.",
  },
  {
    name: "terminal",
    makefile: "src/terminal/Makefile.am",
    library: "libmoshterminal.a",
    role: "Terminal parser, framebuffer, display diff, resize and input semantics.",
  },
  {
    name: "protobufs",
    makefile: "src/protobufs/Makefile.am",
    library: "libmoshprotos.a",
    sourcesVariable: "source",
    role: "Protocol buffer schemas for user input, host output, and transport instructions.",
    boundary: "Generated .pb.cc/.pb.h files must be reproducible from .proto inputs.",
  },
  {
    name: "util",
    makefile: "src/util/Makefile.am",
    library: "libmoshutil.a",
    role: "Timestamp, select, locale, pty compatibility, and assertion helpers.",
  },
  {
    name: "frontend-client",
    makefile: "src/frontend/Makefile.am",
    sourcesVariable: "mosh_client_SOURCES",
    role: "STM client and overlay logic; CLI and terminal-driver code need platform adapter review.",
    boundary: "Do not expose mosh-client CLI or direct UDP socket UI loop to mobile app code.",
  },
];

export const REQUIRED_FILES = [
  "COPYING",
  "COPYING.iOS",
  "ocb-license.html",
  "README.md",
  "configure.ac",
  "src/frontend/stmclient.cc",
  "src/frontend/stmclient.h",
  "src/frontend/terminaloverlay.cc",
  "src/frontend/terminaloverlay.h",
  "src/network/network.cc",
  "src/network/network.h",
  "src/network/networktransport.h",
  "src/network/networktransport-impl.h",
  "src/crypto/crypto.cc",
  "src/crypto/crypto.h",
  "src/crypto/ae.h",
  "src/crypto/ocb_internal.cc",
  "src/crypto/ocb_openssl.cc",
  "src/protobufs/transportinstruction.proto",
  "src/protobufs/userinput.proto",
  "src/protobufs/hostinput.proto",
];

export function auditMoshCheckout(checkoutPath) {
  const commit = readGitCommit(checkoutPath);
  const missingFiles = REQUIRED_FILES.filter((file) => !existsSync(join(checkoutPath, file)));
  const licenseFiles = readLicenseFiles(checkoutPath);

  return {
    upstream: {
      repository: "https://github.com/mobile-shell/mosh",
      commit,
      checkoutPath,
    },
    decision: {
      preferredPath: "wrap-upstream-core",
      adapterBoundary: "Hovvi replaces mosh-client UDP/socket IO with relay datagram IO while preserving mosh crypto and SSP semantics.",
      vendoringStatus: "not-vendored",
    },
    license: {
      family: "GPL-3.0-or-later with OpenSSL exception and COPYING.iOS App Store waiver",
      copyingPresent: Boolean(licenseFiles.copying),
      copyingIosPresent: Boolean(licenseFiles.copyingIos),
      ocbGrantPresent: Boolean(licenseFiles.ocb),
      copyingIosMentionsAppStore: /App Store/.test(licenseFiles.copyingIos || ""),
      copyingMentionsGPLv3: /GNU GENERAL PUBLIC LICENSE\s+Version 3/.test(licenseFiles.copying || ""),
      ocbMentionsMoshWaiver: /Mosh.*iOS\s+waiver/s.test(licenseFiles.ocb || ""),
      requiredAction: "Before distribution, publish corresponding source and license text for any binary linked with upstream mosh-derived code.",
    },
    requiredFiles: REQUIRED_FILES.map((file) => ({
      path: file,
      present: existsSync(join(checkoutPath, file)),
    })),
    missingFiles,
    coreGroups: CORE_GROUPS.map((group) => describeCoreGroup(checkoutPath, group)),
  };
}

export function summarizeAudit(audit) {
  return {
    ok: audit.missingFiles.length === 0
      && audit.license.copyingPresent
      && audit.license.copyingIosPresent
      && audit.license.ocbGrantPresent
      && audit.license.copyingIosMentionsAppStore
      && audit.license.copyingMentionsGPLv3
      && audit.license.ocbMentionsMoshWaiver,
    missingFiles: audit.missingFiles,
    commit: audit.upstream.commit,
    coreGroups: audit.coreGroups.map((group) => ({
      name: group.name,
      sourceCount: group.sources.length,
      missing: group.missing,
    })),
  };
}

function describeCoreGroup(checkoutPath, group) {
  const makefilePath = join(checkoutPath, group.makefile);
  const makefile = existsSync(makefilePath) ? readFileSync(makefilePath, "utf8") : "";
  const sources = extractSources(makefile, group.sourcesVariable);
  return {
    ...group,
    makefile: group.makefile,
    sources,
    missing: existsSync(makefilePath) ? [] : [group.makefile],
  };
}

function extractSources(makefile, variableName) {
  const sources = new Set();
  if (!makefile) return [];
  const targetVariable = variableName ? `${variableName}\\s*=` : "SOURCES\\s*=";
  const regex = new RegExp(`(?:^|\\n)(?:[^\\n=]*_)?${targetVariable}([\\s\\S]*?)(?=\\n\\S|$)`, "g");
  for (const match of makefile.matchAll(regex)) {
    const lines = match[1]
      .replace(/\\\n/g, " ")
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => !item.startsWith("$("));
    for (const item of lines) {
      if (/\.(cc|h|proto|hpp)$/.test(item)) sources.add(item);
    }
  }
  return [...sources].sort();
}

function readLicenseFiles(checkoutPath) {
  return {
    copying: readOptional(join(checkoutPath, "COPYING")),
    copyingIos: readOptional(join(checkoutPath, "COPYING.iOS")),
    ocb: readOptional(join(checkoutPath, "ocb-license.html")),
  };
}

function readOptional(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

function readGitCommit(checkoutPath) {
  try {
    return execFileSync("git", ["-C", checkoutPath, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const checkoutIndex = argv.indexOf("--checkout");
  if (checkoutIndex === -1 || !argv[checkoutIndex + 1]) {
    throw new Error("Usage: node scripts/mosh-upstream-audit.js --checkout <path> [--summary]");
  }
  return {
    checkoutPath: argv[checkoutIndex + 1],
    summary: argv.includes("--summary"),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { checkoutPath, summary } = parseArgs(process.argv.slice(2));
    const audit = auditMoshCheckout(checkoutPath);
    const output = summary ? summarizeAudit(audit) : audit;
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    if (audit.missingFiles.length > 0) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
