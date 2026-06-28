import path from "node:path";
import { iosSimulatorInstallCheck } from "./ios-simulator-install.js";
import { captureInstalledIosSimulatorScreenshot } from "./ios-simulator-screenshot.js";
import { readPngStats } from "./png-image-stats.js";
import { runText } from "./shell.js";

export const DEFAULT_IOS_SIMULATOR_SCREENSHOT_FIXTURES = [
  "browsing",
  "attached-coding-agent",
  "failed-attach",
  "capped-viewport",
];

export const IOS_SIMULATOR_SCREENSHOT_MATRIX_ARTIFACT_SCHEMA_VERSION = 1;

export const DEFAULT_IOS_SIMULATOR_SCREENSHOT_ARTIFACT_MINIMUMS = {
  width: 300,
  height: 500,
  byteLength: 1024,
  uniqueColors: 8,
};

export function iosSimulatorScreenshotMatrixCheck({
  fixtures = DEFAULT_IOS_SIMULATOR_SCREENSHOT_FIXTURES,
  outputDir,
  requireDistinctImages = true,
  artifactMinimums = DEFAULT_IOS_SIMULATOR_SCREENSHOT_ARTIFACT_MINIMUMS,
  waitMs = 1000,
  installCheckFn = iosSimulatorInstallCheck,
  runTextFn = runText,
  readPngStatsFn = readPngStats,
  waitFn,
} = {}) {
  const install = installCheckFn();
  if (install.status !== "installed") {
    return install;
  }

  const results = fixtures.map((fixture) =>
    captureInstalledIosSimulatorScreenshot({
      install,
      fixture,
      outputPath: outputDir
        ? path.join(path.resolve(outputDir), `${safeFixtureName(fixture)}.png`)
        : undefined,
      keepScreenshot: Boolean(outputDir),
      waitMs,
      runTextFn,
      readPngStatsFn,
      waitFn,
    })
  );
  const failures = results.filter((result) => result.status !== "captured");
  const duplicateImageFailures =
    failures.length === 0 && requireDistinctImages ? findDuplicateImageFailures(results) : [];
  const artifact = buildScreenshotMatrixArtifact({
    fixtures,
    results,
    requireDistinctImages,
    minimums: artifactMinimums,
  });
  const artifactFailures =
    failures.length === 0 && duplicateImageFailures.length === 0
      ? findScreenshotMatrixArtifactFailures(artifact)
      : [];
  const failureCount = failures.length + duplicateImageFailures.length;
  const totalFailureCount = failureCount + artifactFailures.length;

  return {
    status: totalFailureCount === 0 ? "captured" : "failed",
    simulator: install.simulator,
    fixtures,
    results,
    artifact,
    duplicateImageFailures,
    artifactFailures,
    failureCount: totalFailureCount,
    reason:
      totalFailureCount === 0
        ? undefined
        : `${totalFailureCount} iOS simulator screenshot fixture assertion(s) failed.`,
  };
}

export function safeFixtureName(fixture) {
  return String(fixture)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildScreenshotMatrixArtifact({
  fixtures,
  results,
  requireDistinctImages = true,
  minimums = DEFAULT_IOS_SIMULATOR_SCREENSHOT_ARTIFACT_MINIMUMS,
}) {
  const screenshots = results.map((result) => ({
    fixture: result.fixture,
    status: result.status,
    screenshot: result.screenshot,
    sha256: result.image?.sha256,
    byteLength: result.image?.byteLength,
    width: result.image?.width,
    height: result.image?.height,
    pixels: result.image?.pixels,
    uniqueColors: result.image?.uniqueColors,
    nonBlank: result.image?.nonBlank,
  }));
  const capturedScreenshots = screenshots.filter((entry) => entry.status === "captured");
  const hashes = capturedScreenshots
    .map((entry) => entry.sha256)
    .filter((hash) => typeof hash === "string" && hash.length > 0);
  const uniqueHashes = new Set(hashes);

  return {
    schemaVersion: IOS_SIMULATOR_SCREENSHOT_MATRIX_ARTIFACT_SCHEMA_VERSION,
    requireDistinctImages,
    minimums: { ...minimums },
    expectedFixtures: [...fixtures],
    fixtureCount: fixtures.length,
    capturedFixtureCount: capturedScreenshots.length,
    screenshots,
    imageSha256ByFixture: Object.fromEntries(
      capturedScreenshots.map((entry) => [entry.fixture, entry.sha256])
    ),
    allImagesHaveHashes: hashes.length === capturedScreenshots.length,
    uniqueImageCount: uniqueHashes.size,
    allImagesDistinct: uniqueHashes.size === capturedScreenshots.length,
    allImagesNonBlank: capturedScreenshots.every((entry) => entry.nonBlank === true),
    allImagesMeetMinimums: capturedScreenshots.every((entry) =>
      screenshotMeetsMinimums(entry, minimums)
    ),
  };
}

export function findScreenshotMatrixArtifactFailures(artifact) {
  const failures = [];
  if (artifact.schemaVersion !== IOS_SIMULATOR_SCREENSHOT_MATRIX_ARTIFACT_SCHEMA_VERSION) {
    failures.push({
      reason: "iOS simulator screenshot matrix artifact schema version is unsupported.",
      expected: IOS_SIMULATOR_SCREENSHOT_MATRIX_ARTIFACT_SCHEMA_VERSION,
      actual: artifact.schemaVersion,
    });
  }
  if (artifact.capturedFixtureCount !== artifact.fixtureCount) {
    failures.push({
      reason: "iOS simulator screenshot matrix did not capture every expected fixture.",
      expected: artifact.fixtureCount,
      actual: artifact.capturedFixtureCount,
    });
  }
  const seenFixtures = new Set();
  for (const entry of artifact.screenshots) {
    if (!artifact.expectedFixtures.includes(entry.fixture)) {
      failures.push({
        fixture: entry.fixture,
        reason: "iOS simulator screenshot matrix artifact included an unexpected fixture.",
      });
    }
    if (seenFixtures.has(entry.fixture)) {
      failures.push({
        fixture: entry.fixture,
        reason: "iOS simulator screenshot matrix artifact included a duplicate fixture.",
      });
    }
    seenFixtures.add(entry.fixture);
    if (entry.status === "captured" && !entry.sha256) {
      failures.push({
        fixture: entry.fixture,
        reason: "Captured screenshot artifact did not include a PNG SHA-256 hash.",
      });
    }
    if (entry.status === "captured" && entry.nonBlank !== true) {
      failures.push({
        fixture: entry.fixture,
        reason: "Captured screenshot artifact was not marked nonblank.",
      });
    }
    if (entry.status === "captured") {
      for (const failure of findScreenshotMinimumFailures(entry, artifact.minimums)) {
        failures.push(failure);
      }
    }
  }
  for (const fixture of artifact.expectedFixtures) {
    if (!seenFixtures.has(fixture)) {
      failures.push({
        fixture,
        reason: "iOS simulator screenshot matrix artifact omitted an expected fixture.",
      });
    }
  }
  if (!artifact.allImagesHaveHashes) {
    failures.push({
      reason: "Not every captured screenshot artifact included a PNG SHA-256 hash.",
    });
  }
  if (artifact.requireDistinctImages && !artifact.allImagesDistinct) {
    failures.push({
      reason: "Captured screenshot matrix artifact did not contain distinct image hashes.",
    });
  }
  if (!artifact.allImagesNonBlank) {
    failures.push({
      reason: "Captured screenshot matrix artifact included a blank image.",
    });
  }
  if (!artifact.allImagesMeetMinimums) {
    failures.push({
      reason: "Captured screenshot matrix artifact did not meet minimum image quality bounds.",
    });
  }
  return failures;
}

function findScreenshotMinimumFailures(entry, minimums) {
  const failures = [];
  for (const [field, minimum] of Object.entries(minimums ?? {})) {
    if (typeof minimum !== "number") {
      continue;
    }
    const actual = entry[field];
    if (typeof actual !== "number" || actual < minimum) {
      failures.push({
        fixture: entry.fixture,
        field,
        expectedMinimum: minimum,
        actual,
        reason: "Captured screenshot artifact did not meet a minimum image quality bound.",
      });
    }
  }
  return failures;
}

function screenshotMeetsMinimums(entry, minimums) {
  return findScreenshotMinimumFailures(entry, minimums).length === 0;
}

function findDuplicateImageFailures(results) {
  const seen = new Map();
  const failures = [];
  for (const result of results) {
    const hash = result.image?.sha256;
    if (!hash) {
      failures.push({
        fixture: result.fixture,
        reason: "Captured screenshot metadata did not include a PNG SHA-256 hash.",
      });
      continue;
    }
    const previous = seen.get(hash);
    if (previous) {
      failures.push({
        fixture: result.fixture,
        duplicateOf: previous.fixture,
        sha256: hash,
        reason: "Captured screenshot fixture matched a previous fixture image.",
      });
      continue;
    }
    seen.set(hash, result);
  }
  return failures;
}
