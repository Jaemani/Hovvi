import Foundation
import HovviMobileCore

public enum AttachShellPreviewFixtures {
    public static let defaultViewportLineLimit = 12

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
