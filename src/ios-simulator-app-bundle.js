import { chmodSync, copyFileSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { iosSimulatorBuildCheck } from "./ios-simulator-build.js";

export function iosSimulatorAppBundleCheck({
  keepBundle = false,
  buildCheckFn = (options) => iosSimulatorBuildCheck(options),
  tempDirFn = () => mkdtempSync(path.join(tmpdir(), "hovvi-ios-app-")),
} = {}) {
  const build = buildCheckFn({ keepDerivedData: true });
  if (build.status !== "built") {
    return build;
  }

  const artifactPath = build.artifact;
  if (!artifactPath || path.isAbsolute(artifactPath) === false) {
    cleanupDerivedData(build);
    return {
      status: "failed",
      reason: "iOS simulator build did not return an absolute artifact path for bundling.",
      build,
    };
  }

  if (artifactPath.endsWith(".app")) {
    cleanupDerivedData(build);
    return {
      status: "bundled",
      simulator: build.simulator,
      appBundle: artifactPath,
      prebundled: true,
    };
  }

  const bundleRoot = tempDirFn();
  const appBundle = path.join(bundleRoot, "HovviMobileApp.app");
  try {
    mkdirSync(appBundle, { recursive: true });
    const executablePath = path.join(appBundle, "HovviMobileApp");
    copyFileSync(artifactPath, executablePath);
    chmodSync(executablePath, statSync(artifactPath).mode | 0o111);
    writeFileSync(path.join(appBundle, "Info.plist"), simulatorInfoPlist(), "utf8");
    writeFileSync(path.join(appBundle, "PkgInfo"), "APPL????", "utf8");

    const response = {
      status: "bundled",
      simulator: build.simulator,
      appBundle: keepBundle ? appBundle : path.basename(appBundle),
      bundleRoot: keepBundle ? bundleRoot : undefined,
    };
    cleanupDerivedData(build);
    if (!keepBundle) {
      rmSync(bundleRoot, { recursive: true, force: true });
    }
    return response;
  } catch (error) {
    cleanupDerivedData(build);
    if (!keepBundle) {
      rmSync(bundleRoot, { recursive: true, force: true });
    }
    return {
      status: "failed",
      reason: `Could not create iOS simulator app bundle: ${error.message}`,
      build,
      bundleRoot: keepBundle ? bundleRoot : undefined,
    };
  }
}

function cleanupDerivedData(build) {
  if (build.derivedDataPath) {
    rmSync(build.derivedDataPath, { recursive: true, force: true });
  }
}

function simulatorInfoPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>Hovvi</string>
  <key>CFBundleExecutable</key>
  <string>HovviMobileApp</string>
  <key>CFBundleIdentifier</key>
  <string>app.hovvi.mobile.alpha</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>Hovvi</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleSupportedPlatforms</key>
  <array>
    <string>iPhoneSimulator</string>
  </array>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSRequiresIPhoneOS</key>
  <true/>
  <key>MinimumOSVersion</key>
  <string>17.0</string>
  <key>UIDeviceFamily</key>
  <array>
    <integer>1</integer>
    <integer>2</integer>
  </array>
</dict>
</plist>
`;
}
