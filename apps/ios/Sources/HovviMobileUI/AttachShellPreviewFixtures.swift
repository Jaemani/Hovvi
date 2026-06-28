import Foundation
import HovviMobileCore

public enum AttachShellPreviewFixtures {
    public static let defaultViewportLineLimit = 12
    public static let environmentKey = "HOVVI_IOS_SNAPSHOT_FIXTURE"

    public static let devices = [
        Device(
            id: "macbook-pro",
            name: "MacBook Pro",
            platform: "darwin",
            user: "jaeman",
            capabilities: ["tmux.sessions", "mosh.relay-datagram", "ai.session.detect"],
            sessions: [
                Session(
                    id: "tmux-main",
                    name: "main",
                    kind: "ai-dev",
                    attached: true,
                    windows: 3,
                    aiPanes: [
                        Pane(paneId: "%12", command: "claude", cwd: "~/Codes/Hovvi", title: "Claude Code"),
                        Pane(paneId: "%15", command: "codex", cwd: "~/Codes/Hovvi", title: "Codex")
                    ]
                ),
                Session(
                    id: "cmux-dev",
                    name: "cmux-dev",
                    kind: "cmux",
                    attached: false,
                    windows: 2,
                    aiPanes: [
                        Pane(paneId: "%18", command: "/opt/homebrew/bin/codex", cwd: "~/Codes/Hovvi", title: "Codex")
                    ]
                ),
                Session(id: "tmux-build", name: "build", kind: "tmux", attached: false, windows: 1)
            ]
        )
    ]

    public static var browsing: AttachShellSnapshot {
        AttachShellSnapshot(
            phase: .browsing,
            devices: devices,
            selectedDeviceId: devices[0].id,
            selectedSessionName: devices[0].sessions[0].name
        )
    }

    public static var attachedCodingAgent: AttachShellSnapshot {
        var screen = TerminalScreen(columns: 80, rows: 24)
        screen.apply("\u{001B}[32mclaude\u{001B}[0m editing apps/ios/Sources/HovviMobileUI/AttachShellViews.swift\r\n")
        screen.apply("codex waiting for approval: run native relay attach smoke\r\n")
        screen.apply("\u{001B}[33mstatus\u{001B}[0m tests running")

        return AttachShellSnapshot(
            phase: .attached,
            devices: devices,
            selectedDeviceId: devices[0].id,
            selectedSessionName: devices[0].sessions[0].name,
            manifest: attachManifest,
            scrollback: scrollback,
            terminalScreen: screen,
            terminalOutput: Data("status tests running".utf8),
            nextTickAfterMs: 250
        )
    }

    public static var failedAttach: AttachShellSnapshot {
        AttachShellSnapshot(
            phase: .failed,
            devices: devices,
            selectedDeviceId: devices[0].id,
            selectedSessionName: devices[0].sessions[0].name,
            scrollback: scrollback,
            terminalScreen: attachedCodingAgent.terminalScreen,
            error: AttachShellError(
                title: "Terminal connection interrupted",
                message: "relay datagram channel closed before the next mosh frame"
            ),
            recoveryAction: .reattachSession
        )
    }

    public static var cappedViewport: AttachShellSnapshot {
        let attached = attachedCodingAgent
        var screen = TerminalScreen(columns: 80, rows: 8)
        for row in 1...8 {
            screen.apply("cap row \(row): mobile viewport validation")
            if row < 8 {
                screen.apply("\r\n")
            }
        }
        return AttachShellSnapshot(
            phase: attached.phase,
            devices: cappedDevices,
            selectedDeviceId: attached.selectedDeviceId,
            selectedSessionName: "mobile-cap",
            manifest: attached.manifest,
            scrollback: cappedScrollback,
            terminalScreen: screen,
            terminalOutput: Data("cap row 8: mobile viewport validation".utf8),
            terminalViewportLineLimit: 8,
            nextTickAfterMs: attached.nextTickAfterMs,
            cleanShutdown: attached.cleanShutdown,
            error: attached.error,
            recoveryAction: attached.recoveryAction
        )
    }

    public static func snapshot(named name: String?) -> AttachShellSnapshot? {
        switch name?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "browsing":
            return browsing
        case "attached-coding-agent":
            return attachedCodingAgent
        case "failed-attach":
            return failedAttach
        case "capped-viewport":
            return cappedViewport
        default:
            return nil
        }
    }

    public static func terminalViewport(maxRows: Int = defaultViewportLineLimit) -> TerminalSurfaceViewport {
        TerminalSurfaceProjection.viewport(for: attachedCodingAgent, maxRows: maxRows)
    }

    private static var scrollback: ScrollbackBuffer {
        ScrollbackBuffer(
            sessionName: "main",
            text: (1...20)
                .map { "history \($0): tmux pane output before relay attach" }
                .joined(separator: "\n")
        )
    }

    private static var cappedScrollback: ScrollbackBuffer {
        ScrollbackBuffer(
            sessionName: "main",
            text: (1...20)
                .map { "capped history \($0): hidden above mobile viewport" }
                .joined(separator: "\n")
        )
    }

    private static var cappedDevices: [Device] {
        [
            Device(
                id: devices[0].id,
                name: devices[0].name,
                platform: devices[0].platform,
                user: devices[0].user,
                capabilities: devices[0].capabilities,
                sessions: [
                    Session(
                        id: "tmux-mobile-cap",
                        name: "mobile-cap",
                        kind: "ai-dev",
                        attached: true,
                        windows: 1,
                        aiPanes: [
                            Pane(paneId: "%20", command: "codex", cwd: "~/Codes/Hovvi", title: "Codex")
                        ]
                    ),
                ] + devices[0].sessions
            )
        ]
    }

    private static var attachManifest: AttachManifest {
        AttachManifest(
            kind: "mosh-tmux",
            version: 1,
            deviceId: devices[0].id,
            deviceName: devices[0].name,
            sessionName: devices[0].sessions[0].name,
            user: devices[0].user ?? "jaeman",
            methods: [
                AttachMethod(
                    name: "mosh",
                    priority: 10,
                    status: "available",
                    command: ["mosh-server", "new"],
                    transport: AttachTransport(
                        kind: "relay-datagram",
                        label: "mosh",
                        remoteHost: "127.0.0.1",
                        remotePort: 60001,
                        key: "MDEyMzQ1Njc4OWFiY2RlZg",
                        maxDatagramBytes: 1200
                    )
                )
            ],
            scrollback: ScrollbackSource(
                source: "tmux.capture-pane",
                command: ["tmux", "capture-pane", "-t", "main", "-p"],
                lines: 2000
            ),
            controlMode: ControlModeSource(
                source: "tmux.control-mode",
                command: ["tmux", "-CC", "attach-session", "-t", "main"]
            )
        )
    }
}
