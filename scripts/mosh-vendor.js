#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { auditMoshCheckout, CORE_GROUPS, REQUIRED_FILES, summarizeAudit } from "./mosh-upstream-audit.js";

const DEFAULT_DESTINATION = "native/mosh-core/vendor/mosh";
const LICENSE_FILES = ["COPYING", "COPYING.iOS", "ocb-license.html"];
const FRONTEND_INCLUDE = new Set(["stmclient.cc", "stmclient.h", "terminaloverlay.cc", "terminaloverlay.h"]);

export function planMoshVendor({ checkoutPath, destination = DEFAULT_DESTINATION } = {}) {
  if (!checkoutPath) throw new Error("checkoutPath is required.");
  const audit = auditMoshCheckout(checkoutPath);
  const summary = summarizeAudit(audit);
  if (!summary.ok) {
    throw new Error(`Cannot vendor mosh checkout; audit failed: ${JSON.stringify(summary)}`);
  }

  const files = new Set([...LICENSE_FILES, "README.md", "configure.ac"]);
  for (const required of REQUIRED_FILES) files.add(required);
  for (const group of audit.coreGroups) {
    files.add(group.makefile);
    const sourceDir = dirname(group.makefile);
    for (const source of group.sources) {
      if (group.name === "frontend-client" && !FRONTEND_INCLUDE.has(source)) continue;
      files.add(join(sourceDir, source));
    }
  }

  return {
    checkoutPath,
    destination,
    upstream: audit.upstream,
    license: audit.license,
    files: [...files].sort(),
    excluded: {
      frontendClient: ["mosh-client.cc"],
      reason: "CLI, termios, signal, and direct socket loop are reference-only for the mobile core boundary.",
    },
  };
}

export function vendorMosh({ checkoutPath, destination = DEFAULT_DESTINATION, clean = false, dryRun = false } = {}) {
  const plan = planMoshVendor({ checkoutPath, destination });
  if (dryRun) return { ...plan, copied: [] };

  if (clean && existsSync(destination)) {
    rmSync(destination, { recursive: true, force: true });
  }
  mkdirSync(destination, { recursive: true });

  for (const file of plan.files) {
    const source = join(checkoutPath, file);
    const target = join(destination, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
  }

  writeFileSync(
    join(destination, "HOVVI_VENDOR_MANIFEST.json"),
    `${JSON.stringify(
      {
        generatedBy: "scripts/mosh-vendor.js",
        upstream: plan.upstream,
        license: plan.license,
        files: plan.files,
        excluded: plan.excluded,
      },
      null,
      2,
    )}\n`,
  );

  return { ...plan, copied: plan.files.map((file) => relative(destination, join(destination, file))) };
}

function parseArgs(argv) {
  const checkoutIndex = argv.indexOf("--checkout");
  if (checkoutIndex === -1 || !argv[checkoutIndex + 1]) {
    throw new Error("Usage: node scripts/mosh-vendor.js --checkout <path> [--destination <path>] [--clean] [--dry-run]");
  }
  const destinationIndex = argv.indexOf("--destination");
  return {
    checkoutPath: argv[checkoutIndex + 1],
    destination: destinationIndex === -1 ? DEFAULT_DESTINATION : argv[destinationIndex + 1],
    clean: argv.includes("--clean"),
    dryRun: argv.includes("--dry-run"),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = vendorMosh(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
