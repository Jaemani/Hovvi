import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_IOS_SIMULATOR_SCREENSHOT_FIXTURES,
  IOS_SIMULATOR_SCREENSHOT_MATRIX_ARTIFACT_SCHEMA_VERSION,
  buildScreenshotMatrixArtifact,
  findScreenshotMatrixArtifactFailures,
  iosSimulatorScreenshotMatrixCheck,
  safeFixtureName,
} from "../src/ios-simulator-screenshot-matrix.js";
import { HOVVI_IOS_BUNDLE_ID } from "../src/ios-simulator-launch.js";

test("iOS simulator screenshot matrix skips when install check skips", () => {
  const result = iosSimulatorScreenshotMatrixCheck({
    installCheckFn: () => ({ status: "skipped", reason: "no simulator" }),
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "no simulator");
});

test("iOS simulator screenshot matrix reuses install and captures all fixtures", () => {
  const calls = [];
  let installCount = 0;
  const result = iosSimulatorScreenshotMatrixCheck({
    fixtures: ["browsing", "attached-coding-agent", "failed-attach", "capped-viewport"],
    outputDir: "/tmp/hovvi-ios-shot-matrix",
    waitMs: 0,
    waitFn: () => {},
    installCheckFn() {
      installCount += 1;
      return {
        status: "installed",
        simulator: { name: "iPhone 17", udid: "SIM-1" },
      };
    },
    readPngStatsFn(filePath) {
      assert.match(filePath, /\/tmp\/hovvi-ios-shot-matrix\/.+\.png$/);
      const fixture = filePath.match(/\/([^/]+)\.png$/)?.[1] ?? "unknown";
      return {
        byteLength: 4096,
        sha256: `hash-${fixture}`,
        width: 1179,
        height: 2556,
        pixels: 3013524,
        uniqueColors: 64,
        nonBlank: true,
      };
    },
    runTextFn(command, args, options) {
      calls.push({ command, args, options });
      return ok(args[1] === "launch" ? `${HOVVI_IOS_BUNDLE_ID}: 1234` : "");
    },
  });

  assert.equal(result.status, "captured");
  assert.equal(installCount, 1);
  assert.deepEqual(result.fixtures, [
    "browsing",
    "attached-coding-agent",
    "failed-attach",
    "capped-viewport",
  ]);
  assert.deepEqual(
    result.results.map((entry) => entry.screenshot),
    [
      "/tmp/hovvi-ios-shot-matrix/browsing.png",
      "/tmp/hovvi-ios-shot-matrix/attached-coding-agent.png",
      "/tmp/hovvi-ios-shot-matrix/failed-attach.png",
      "/tmp/hovvi-ios-shot-matrix/capped-viewport.png",
    ]
  );
  assert.equal(
    result.artifact.schemaVersion,
    IOS_SIMULATOR_SCREENSHOT_MATRIX_ARTIFACT_SCHEMA_VERSION
  );
  assert.deepEqual(result.artifact.expectedFixtures, [
    "browsing",
    "attached-coding-agent",
    "failed-attach",
    "capped-viewport",
  ]);
  assert.equal(result.artifact.fixtureCount, 4);
  assert.equal(result.artifact.capturedFixtureCount, 4);
  assert.equal(result.artifact.allImagesHaveHashes, true);
  assert.equal(result.artifact.allImagesDistinct, true);
  assert.equal(result.artifact.allImagesNonBlank, true);
  assert.deepEqual(result.artifact.imageSha256ByFixture, {
    browsing: "hash-browsing",
    "attached-coding-agent": "hash-attached-coding-agent",
    "failed-attach": "hash-failed-attach",
    "capped-viewport": "hash-capped-viewport",
  });
  assert.deepEqual(
    calls
      .filter((call) => call.args[1] === "launch")
      .map((call) => call.options.env.SIMCTL_CHILD_HOVVI_IOS_SNAPSHOT_FIXTURE),
    ["browsing", "attached-coding-agent", "failed-attach", "capped-viewport"]
  );
});

test("iOS simulator screenshot matrix reports fixture failures", () => {
  const result = iosSimulatorScreenshotMatrixCheck({
    fixtures: ["browsing", "failed-attach"],
    outputDir: "/tmp/hovvi-ios-shot-matrix-failure",
    waitMs: 0,
    waitFn: () => {},
    installCheckFn: () => ({
      status: "installed",
      simulator: { name: "iPhone 17", udid: "SIM-1" },
    }),
    readPngStatsFn(filePath) {
      return {
        width: 1,
        height: 1,
        pixels: 1,
        uniqueColors: 1,
        nonBlank: filePath.includes("browsing"),
      };
    },
    runTextFn: () => ok(""),
  });

  assert.equal(result.status, "failed");
  assert.equal(result.failureCount, 1);
  assert.match(result.reason, /1 iOS simulator screenshot fixture/);
});

test("iOS simulator screenshot matrix rejects duplicate fixture images", () => {
  const result = iosSimulatorScreenshotMatrixCheck({
    fixtures: ["browsing", "failed-attach"],
    outputDir: "/tmp/hovvi-ios-shot-matrix-duplicate",
    waitMs: 0,
    waitFn: () => {},
    installCheckFn: () => ({
      status: "installed",
      simulator: { name: "iPhone 17", udid: "SIM-1" },
    }),
    readPngStatsFn: () => ({
      byteLength: 4096,
      sha256: "same-image",
      width: 1179,
      height: 2556,
      pixels: 3013524,
      uniqueColors: 64,
      nonBlank: true,
    }),
    runTextFn: () => ok(""),
  });

  assert.equal(result.status, "failed");
  assert.equal(result.failureCount, 1);
  assert.deepEqual(result.duplicateImageFailures, [
    {
      fixture: "failed-attach",
      duplicateOf: "browsing",
      sha256: "same-image",
      reason: "Captured screenshot fixture matched a previous fixture image.",
    },
  ]);
  assert.match(result.reason, /fixture assertion/);
});

test("iOS simulator screenshot matrix artifact verifier rejects missing or weak metadata", () => {
  const artifact = buildScreenshotMatrixArtifact({
    fixtures: ["browsing", "failed-attach"],
    results: [
      {
        status: "captured",
        fixture: "browsing",
        screenshot: "/tmp/browsing.png",
        image: {
          byteLength: 4096,
          sha256: "same-image",
          width: 1179,
          height: 2556,
          pixels: 3013524,
          uniqueColors: 64,
          nonBlank: true,
        },
      },
      {
        status: "captured",
        fixture: "failed-attach",
        screenshot: "/tmp/failed-attach.png",
        image: {
          byteLength: 4096,
          sha256: "same-image",
          width: 1179,
          height: 2556,
          pixels: 3013524,
          uniqueColors: 1,
          nonBlank: false,
        },
      },
    ],
  });

  assert.equal(artifact.fixtureCount, 2);
  assert.equal(artifact.capturedFixtureCount, 2);
  assert.equal(artifact.uniqueImageCount, 1);
  assert.equal(artifact.allImagesDistinct, false);
  assert.equal(artifact.allImagesNonBlank, false);
  assert.deepEqual(
    findScreenshotMatrixArtifactFailures(artifact).map((entry) => entry.reason),
    [
      "Captured screenshot artifact was not marked nonblank.",
      "Captured screenshot matrix artifact did not contain distinct image hashes.",
      "Captured screenshot matrix artifact included a blank image.",
    ]
  );
});

test("iOS simulator screenshot matrix artifact verifier rejects fixture drift", () => {
  const failures = findScreenshotMatrixArtifactFailures({
    schemaVersion: IOS_SIMULATOR_SCREENSHOT_MATRIX_ARTIFACT_SCHEMA_VERSION,
    requireDistinctImages: true,
    expectedFixtures: ["browsing", "failed-attach"],
    fixtureCount: 2,
    capturedFixtureCount: 2,
    screenshots: [
      {
        fixture: "browsing",
        status: "captured",
        sha256: "hash-browsing",
        nonBlank: true,
      },
      {
        fixture: "unexpected",
        status: "captured",
        sha256: "hash-unexpected",
        nonBlank: true,
      },
    ],
    imageSha256ByFixture: {
      browsing: "hash-browsing",
      unexpected: "hash-unexpected",
    },
    allImagesHaveHashes: true,
    uniqueImageCount: 2,
    allImagesDistinct: true,
    allImagesNonBlank: true,
  });

  assert.deepEqual(
    failures.map((entry) => entry.reason),
    [
      "iOS simulator screenshot matrix artifact included an unexpected fixture.",
      "iOS simulator screenshot matrix artifact omitted an expected fixture.",
    ]
  );
});

test("iOS simulator screenshot matrix fixture names are stable", () => {
  assert.deepEqual(DEFAULT_IOS_SIMULATOR_SCREENSHOT_FIXTURES, [
    "browsing",
    "attached-coding-agent",
    "failed-attach",
    "capped-viewport",
  ]);
  assert.equal(safeFixtureName(" Failed Attach "), "failed-attach");
  assert.equal(safeFixtureName("A/B:C"), "a-b-c");
});

function ok(text) {
  return {
    ok: true,
    status: 0,
    stdout: text,
    stderr: "",
    text,
  };
}
