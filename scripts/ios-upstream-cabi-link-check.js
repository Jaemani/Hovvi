import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nativeDir = path.join(repoRoot, "native", "mosh-core");
const upstreamLib = path.join(nativeDir, "build", "upstream", "libhovvi_mosh_core_upstream.a");
const header = path.join(nativeDir, "include", "hovvi_mosh_core.h");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: options.stdio || "pipe",
    encoding: "utf8",
    env: options.env || process.env,
  });
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${command} ${args.join(" ")} failed${detail ? `\n${detail}` : ""}`);
  }
  return typeof result.stdout === "string" ? result.stdout.trim() : "";
}

function optionalOutput(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "pipe",
    encoding: "utf8",
    env: options.env || process.env,
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function shellWords(value) {
  return value.trim().split(/\s+/).filter(Boolean);
}

run("make", ["-C", nativeDir, "upstream-lib"], { stdio: "inherit" });

const protobufPrefix = optionalOutput("brew", ["--prefix", "protobuf"]);
const abseilPrefix = optionalOutput("brew", ["--prefix", "abseil"]);
const pkgConfigPath = [
  protobufPrefix && path.join(protobufPrefix, "lib", "pkgconfig"),
  abseilPrefix && path.join(abseilPrefix, "lib", "pkgconfig"),
  process.env.PKG_CONFIG_PATH,
]
  .filter(Boolean)
  .join(":");
const env = { ...process.env, PKG_CONFIG_PATH: pkgConfigPath };
let protobufLibs = shellWords(optionalOutput("pkg-config", ["--libs", "protobuf-lite"], { env }));
if (protobufLibs.length === 0) {
  protobufLibs = [
    ...(protobufPrefix ? [`-L${path.join(protobufPrefix, "lib")}`] : []),
    "-lprotobuf-lite",
  ];
}

const tempDir = mkdtempSync(path.join(tmpdir(), "hovvi-ios-upstream-cabi-"));
try {
  writeFileSync(
    path.join(tempDir, "module.modulemap"),
    `module HovviMoshCoreC [system] {\n  header "${header}"\n  export *\n}\n`,
  );
  const swiftSource = path.join(tempDir, "check.swift");
  writeFileSync(
    swiftSource,
    `import HovviMoshCoreC

func require(_ condition: Bool, _ message: String) {
    if !condition {
        fatalError(message)
    }
}

var core: OpaquePointer?
let size = hovvi_mosh_terminal_size_t(columns: 80, rows: 24)
let invalid = hovvi_mosh_core_create("short", size, &core)
require(invalid == HOVVI_MOSH_INVALID_ARGUMENT, "short key should be invalid")
require(core == nil, "invalid create should not set core")

let created = hovvi_mosh_core_create("AAAAAAAAAAAAAAAAAAAAAA", size, &core)
require(created == HOVVI_MOSH_OK, "valid key should create upstream core")
require(core != nil, "valid create should set core")

var frame = hovvi_mosh_frame_t()
let shutdown = hovvi_mosh_core_shutdown(core, &frame)
require(shutdown == HOVVI_MOSH_OK, "shutdown should succeed")
require(frame.clean_shutdown == 1, "shutdown should mark clean")
hovvi_mosh_frame_free(&frame)
hovvi_mosh_core_destroy(core)

print("swift upstream C ABI link check passed")
`,
  );

  const binary = path.join(tempDir, "check");
  run("swiftc", [
    "-I",
    tempDir,
    swiftSource,
    upstreamLib,
    ...protobufLibs,
    "-lz",
    "-lcurses",
    "-lc++",
    "-o",
    binary,
  ]);
  run(binary, [], { stdio: "inherit" });
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
