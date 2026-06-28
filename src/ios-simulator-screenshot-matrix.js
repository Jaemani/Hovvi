import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { iosSimulatorInstallCheck } from "./ios-simulator-install.js";
import { captureInstalledIosSimulatorScreenshot } from "./ios-simulator-screenshot.js";
import { readPngStats } from "./png-image-stats.js";
import { runText } from "./shell.js";

export const IOS_SIMULATOR_SCREENSHOT_FIXTURE_CONTRACT = readFixtureContract();

export const DEFAULT_IOS_SIMULATOR_SCREENSHOT_FIXTURES =
  IOS_SIMULATOR_SCREENSHOT_FIXTURE_CONTRACT.fixtures.map((fixture) => fixture.name);

export const DEFAULT_IOS_SIMULATOR_SCREENSHOT_FIXTURE_EXPECTATIONS = Object.fromEntries(
  IOS_SIMULATOR_SCREENSHOT_FIXTURE_CONTRACT.fixtures.map((fixture) => [
    fixture.name,
    {
      role: fixture.role,
      state: fixture.state,
      requiredSignals: fixture.requiredSignals,
    },
  ])
);

export const IOS_SIMULATOR_SCREENSHOT_MATRIX_ARTIFACT_SCHEMA_VERSION = 2;

export const DEFAULT_IOS_SIMULATOR_SCREENSHOT_ARTIFACT_MINIMUMS = {
  width: 300,
  height: 500,
  byteLength: 1024,
  uniqueColors: 8,
  differentPixels: 512,
  differentPixelRatio: 0.001,
};

export function iosSimulatorScreenshotMatrixCheck({
  fixtures = DEFAULT_IOS_SIMULATOR_SCREENSHOT_FIXTURES,
  outputDir,
  requireDistinctImages = true,
  artifactMinimums = DEFAULT_IOS_SIMULATOR_SCREENSHOT_ARTIFACT_MINIMUMS,
  fixtureExpectations = DEFAULT_IOS_SIMULATOR_SCREENSHOT_FIXTURE_EXPECTATIONS,
  waitMs = 1000,
  installAttempts = 2,
  installRetryWaitMs = 1000,
  installCheckFn = iosSimulatorInstallCheck,
  runTextFn = runText,
  readPngStatsFn = readPngStats,
  waitFn,
} = {}) {
  const install = retryInstallCheck({
    installCheckFn,
    attempts: installAttempts,
    retryWaitMs: installRetryWaitMs,
    waitFn,
  });
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
    fixtureExpectations,
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

function retryInstallCheck({ installCheckFn, attempts, retryWaitMs, waitFn }) {
  const maxAttempts = Math.max(1, Number.isFinite(attempts) ? Math.trunc(attempts) : 1);
  let install;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    install = installCheckFn();
    if (!shouldRetryInstallCheck(install) || attempt === maxAttempts) {
      return install;
    }
    wait(retryWaitMs, waitFn);
  }
  return install;
}

function shouldRetryInstallCheck(install) {
  return install?.status === "skipped" && /xcodebuild is not usable/i.test(install.reason || "");
}

function wait(ms, waitFn) {
  const duration = Math.max(0, Number.isFinite(ms) ? Math.trunc(ms) : 0);
  if (typeof waitFn === "function") {
    waitFn(duration);
    return;
  }
  if (duration > 0) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, duration);
  }
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
  fixtureExpectations = DEFAULT_IOS_SIMULATOR_SCREENSHOT_FIXTURE_EXPECTATIONS,
}) {
  const expectedFixtureExpectations = Object.fromEntries(
    fixtures.map((fixture) => [fixture, normalizeFixtureExpectation(fixtureExpectations[fixture])])
  );
  const screenshots = results.map((result) => ({
    fixture: result.fixture,
    status: result.status,
    expectation: normalizeFixtureExpectation(fixtureExpectations[result.fixture]),
    screenshot: result.screenshot,
    sha256: result.image?.sha256,
    byteLength: result.image?.byteLength,
    width: result.image?.width,
    height: result.image?.height,
    pixels: result.image?.pixels,
    differentPixels: result.image?.differentPixels,
    differentPixelRatio: pixelRatio(result.image?.differentPixels, result.image?.pixels),
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
    fixtureContract: {
      schemaVersion: IOS_SIMULATOR_SCREENSHOT_FIXTURE_CONTRACT.schemaVersion,
      sha256: IOS_SIMULATOR_SCREENSHOT_FIXTURE_CONTRACT.sha256,
      fixtureCount: IOS_SIMULATOR_SCREENSHOT_FIXTURE_CONTRACT.fixtures.length,
    },
    expectedFixtures: [...fixtures],
    fixtureExpectations: expectedFixtureExpectations,
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
    allFixturesHaveExpectations: fixtures.every((fixture) =>
      fixtureExpectationComplete(expectedFixtureExpectations[fixture])
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
  if (artifact.fixtureContract?.schemaVersion !== IOS_SIMULATOR_SCREENSHOT_FIXTURE_CONTRACT.schemaVersion) {
    failures.push({
      reason: "iOS simulator screenshot matrix artifact fixture contract schema version drifted.",
      expected: IOS_SIMULATOR_SCREENSHOT_FIXTURE_CONTRACT.schemaVersion,
      actual: artifact.fixtureContract?.schemaVersion,
    });
  }
  if (artifact.fixtureContract?.sha256 !== IOS_SIMULATOR_SCREENSHOT_FIXTURE_CONTRACT.sha256) {
    failures.push({
      reason: "iOS simulator screenshot matrix artifact fixture contract hash drifted.",
      expected: IOS_SIMULATOR_SCREENSHOT_FIXTURE_CONTRACT.sha256,
      actual: artifact.fixtureContract?.sha256,
    });
  }
  if (artifact.fixtureContract?.fixtureCount !== IOS_SIMULATOR_SCREENSHOT_FIXTURE_CONTRACT.fixtures.length) {
    failures.push({
      reason: "iOS simulator screenshot matrix artifact fixture contract count drifted.",
      expected: IOS_SIMULATOR_SCREENSHOT_FIXTURE_CONTRACT.fixtures.length,
      actual: artifact.fixtureContract?.fixtureCount,
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
  const expectedFixtureExpectations = artifact.fixtureExpectations ?? {};
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
    const expectedExpectation = expectedFixtureExpectations[entry.fixture];
    if (!fixtureExpectationComplete(expectedExpectation)) {
      failures.push({
        fixture: entry.fixture,
        reason: "iOS simulator screenshot matrix fixture did not define semantic expectations.",
      });
    } else if (!fixtureExpectationsEqual(entry.expectation, expectedExpectation)) {
      failures.push({
        fixture: entry.fixture,
        expected: expectedExpectation,
        actual: entry.expectation,
        reason: "iOS simulator screenshot matrix fixture semantic expectation drifted.",
      });
    }
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
    if (!fixtureExpectationComplete(expectedFixtureExpectations[fixture])) {
      failures.push({
        fixture,
        reason: "iOS simulator screenshot matrix expected fixture omitted semantic expectations.",
      });
    }
  }
  if (!artifact.allFixturesHaveExpectations) {
    failures.push({
      reason:
        "iOS simulator screenshot matrix artifact did not define semantic expectations for every fixture.",
    });
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

function normalizeFixtureExpectation(expectation) {
  if (!expectation || typeof expectation !== "object") {
    return undefined;
  }
  const requiredSignals = Array.isArray(expectation.requiredSignals)
    ? [...expectation.requiredSignals].map((signal) => String(signal)).sort()
    : [];
  return {
    role: typeof expectation.role === "string" ? expectation.role : undefined,
    state: typeof expectation.state === "string" ? expectation.state : undefined,
    requiredSignals,
  };
}

function fixtureExpectationComplete(expectation) {
  return (
    expectation &&
    typeof expectation.role === "string" &&
    expectation.role.length > 0 &&
    typeof expectation.state === "string" &&
    expectation.state.length > 0 &&
    Array.isArray(expectation.requiredSignals) &&
    expectation.requiredSignals.length > 0 &&
    expectation.requiredSignals.every((signal) => typeof signal === "string" && signal.length > 0)
  );
}

function fixtureExpectationsEqual(actual, expected) {
  if (!fixtureExpectationComplete(actual) || !fixtureExpectationComplete(expected)) {
    return false;
  }
  return (
    actual.role === expected.role &&
    actual.state === expected.state &&
    actual.requiredSignals.length === expected.requiredSignals.length &&
    actual.requiredSignals.every((signal, index) => signal === expected.requiredSignals[index])
  );
}

function pixelRatio(count, total) {
  if (typeof count !== "number" || typeof total !== "number" || total <= 0) {
    return undefined;
  }
  return count / total;
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

function readFixtureContract() {
  const contractPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../docs/ios-screenshot-fixtures.json"
  );
  const text = readFileSync(contractPath, "utf8");
  const contract = JSON.parse(text);
  if (!Array.isArray(contract.fixtures) || contract.fixtures.length === 0) {
    throw new Error("iOS screenshot fixture contract must define fixtures.");
  }
  return {
    schemaVersion: contract.schemaVersion,
    sha256: createHash("sha256").update(text).digest("hex"),
    fixtures: contract.fixtures.map((fixture) => ({
      name: String(fixture.name),
      role: String(fixture.role),
      state: String(fixture.state),
      requiredSignals: Array.isArray(fixture.requiredSignals)
        ? fixture.requiredSignals.map((signal) => String(signal)).sort()
        : [],
    })),
  };
}
