// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "HovviMobileCore",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    products: [
        .library(name: "HovviMobileCore", targets: ["HovviMobileCore"]),
        .executable(name: "HovviMobileCoreSmoke", targets: ["HovviMobileCoreSmoke"])
    ],
    targets: [
        .target(name: "HovviMoshCoreC"),
        .target(name: "HovviMobileCore", dependencies: ["HovviMoshCoreC"]),
        .executableTarget(name: "HovviMobileCoreSmoke", dependencies: ["HovviMobileCore"])
    ]
)
