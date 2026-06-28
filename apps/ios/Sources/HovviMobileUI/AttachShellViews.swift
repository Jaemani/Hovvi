import Foundation
import HovviMobileCore
import SwiftUI

public enum TerminalSurfaceLineSource: String, Equatable, Sendable {
    case scrollback
    case live
}

public struct TerminalSurfaceLine: Identifiable, Equatable, Sendable {
    public let id: String
    public let source: TerminalSurfaceLineSource
    public let runs: [TerminalScreenRun]
    public let cursorColumn: Int?

    public init(
        id: String,
        source: TerminalSurfaceLineSource,
        runs: [TerminalScreenRun],
        cursorColumn: Int? = nil
    ) {
        self.id = id
        self.source = source
        self.runs = runs
        self.cursorColumn = cursorColumn
    }
}

public struct TerminalSurfaceViewport: Equatable, Sendable {
    public let lines: [TerminalSurfaceLine]
    public let anchorId: String?
    public let isTruncatedAbove: Bool

    public init(lines: [TerminalSurfaceLine], anchorId: String?, isTruncatedAbove: Bool) {
        self.lines = lines
        self.anchorId = anchorId
        self.isTruncatedAbove = isTruncatedAbove
    }
}

public struct SessionStatusBadge: Equatable, Sendable {
    public let text: String
    public let systemImage: String?

    public init(text: String, systemImage: String? = nil) {
        self.text = text
        self.systemImage = systemImage
    }
}

public enum TerminalGeometry {
    public static let cellWidth: Double = 8
    public static let cellHeight: Double = 18
    public static let minimumColumns = 40
    public static let minimumRows = 12

    public static func terminalSize(width: Double, height: Double) -> MoshCoreTerminalSize {
        MoshCoreTerminalSize(
            columns: max(minimumColumns, Int(width / cellWidth)),
            rows: max(minimumRows, Int(height / cellHeight))
        )
    }

    public static func surfaceWidth(columns: Int) -> Double {
        Double(max(minimumColumns, columns)) * cellWidth
    }
}

public enum TerminalAutoFollowPolicy {
    public static func shouldScrollToBottom(
        previousAnchorId: String?,
        nextAnchorId: String?,
        followsLiveOutput: Bool
    ) -> Bool {
        followsLiveOutput && nextAnchorId != nil && previousAnchorId != nextAnchorId
    }
}

public enum SessionPresentation {
    public static func iconName(for session: Session, selected: Bool = false) -> String {
        switch session.kind {
        case "cmux":
            return selected ? "rectangle.3.group.fill" : "rectangle.3.group"
        case "ai-dev":
            return selected ? "sparkles.rectangle.stack.fill" : "sparkles.rectangle.stack"
        default:
            return selected ? "terminal.fill" : "terminal"
        }
    }

    public static func subtitle(for session: Session) -> String {
        badges(for: session).map(\.text).joined(separator: " / ")
    }

    public static func badges(for session: Session) -> [SessionStatusBadge] {
        var badges = [
            SessionStatusBadge(text: kindLabel(for: session.kind), systemImage: kindIconName(for: session.kind))
        ]
        if let windows = session.windows {
            let noun = windows == 1 ? "window" : "windows"
            badges.append(SessionStatusBadge(text: "\(windows) \(noun)", systemImage: "rectangle.split.3x1"))
        }
        if session.attached == true {
            badges.append(SessionStatusBadge(text: "attached", systemImage: "person.crop.circle.badge.checkmark"))
        }
        for command in uniqueAiCommands(for: session) {
            badges.append(SessionStatusBadge(text: command, systemImage: "sparkles"))
        }
        return badges
    }

    private static func kindLabel(for kind: String) -> String {
        switch kind {
        case "tmux":
            return "tmux"
        case "cmux":
            return "cmux"
        case "ai-dev":
            return "AI dev"
        default:
            return kind
        }
    }

    private static func kindIconName(for kind: String) -> String {
        switch kind {
        case "cmux":
            return "rectangle.3.group"
        case "ai-dev":
            return "sparkles.rectangle.stack"
        default:
            return "terminal"
        }
    }

    private static func uniqueAiCommands(for session: Session) -> [String] {
        var seen = Set<String>()
        var labels: [String] = []
        for pane in session.aiPanes {
            let label = commandLabel(pane.command)
            if seen.insert(label).inserted {
                labels.append(label)
            }
        }
        return labels
    }

    private static func commandLabel(_ command: String) -> String {
        let executable = command.split(separator: "/").last.map(String.init) ?? command
        switch executable {
        case "claude":
            return "Claude Code"
        case "codex":
            return "Codex"
        case "gemini":
            return "Gemini"
        case "aider":
            return "aider"
        case "cursor-agent":
            return "Cursor Agent"
        default:
            return executable
        }
    }
}

public enum TerminalSurfaceProjection {
    public static let defaultViewportLineLimit = 5000

    public static func lines(for snapshot: AttachShellSnapshot) -> [TerminalSurfaceLine] {
        let scrollbackLines = (snapshot.scrollback?.visibleLines ?? []).map {
            TerminalSurfaceLine(
                id: "scrollback-\($0.id)",
                source: .scrollback,
                runs: [TerminalScreenRun(text: $0.text)]
            )
        }
        guard let screen = snapshot.terminalScreen else {
            return scrollbackLines
        }
        if screen.hasVisibleText == false && (screen.isCursorVisible == false || snapshot.terminalOutput.isEmpty) {
            return scrollbackLines
        }
        let screenLines = screen.visibleLines.map {
            TerminalSurfaceLine(
                id: "live-\($0.id)",
                source: .live,
                runs: $0.runs,
                cursorColumn: screen.isCursorVisible && $0.row == screen.cursorRow ? screen.cursorColumn : nil
            )
        }
        return scrollbackLines + screenLines
    }

    public static func viewport(
        for snapshot: AttachShellSnapshot,
        maxRows: Int? = nil
    ) -> TerminalSurfaceViewport {
        viewport(
            lines: lines(for: snapshot),
            maxRows: maxRows ?? snapshot.terminalViewportLineLimit ?? defaultViewportLineLimit
        )
    }

    public static func viewport(lines: [TerminalSurfaceLine], maxRows: Int) -> TerminalSurfaceViewport {
        let boundedMaxRows = max(1, maxRows)
        let visibleLines = lines.count > boundedMaxRows ? Array(lines.suffix(boundedMaxRows)) : lines
        return TerminalSurfaceViewport(
            lines: visibleLines,
            anchorId: visibleLines.last?.id,
            isTruncatedAbove: visibleLines.count < lines.count
        )
    }
}

@MainActor
public struct HovviAttachShellView: View {
    public let snapshot: AttachShellSnapshot
    public let onConnect: () -> Void
    public let onSelectDevice: (String) -> Void
    public let onSelectSession: (String) -> Void
    public let onAttach: () -> Void
    public let onRetry: () -> Void
    public let onSendInput: (Data) -> Void
    public let onResize: (MoshCoreTerminalSize) -> Void
    public let onRefreshScrollback: () -> Void

    public init(
        snapshot: AttachShellSnapshot,
        onConnect: @escaping () -> Void = {},
        onSelectDevice: @escaping (String) -> Void = { _ in },
        onSelectSession: @escaping (String) -> Void = { _ in },
        onAttach: @escaping () -> Void = {},
        onRetry: @escaping () -> Void = {},
        onSendInput: @escaping (Data) -> Void = { _ in },
        onResize: @escaping (MoshCoreTerminalSize) -> Void = { _ in },
        onRefreshScrollback: @escaping () -> Void = {}
    ) {
        self.snapshot = snapshot
        self.onConnect = onConnect
        self.onSelectDevice = onSelectDevice
        self.onSelectSession = onSelectSession
        self.onAttach = onAttach
        self.onRetry = onRetry
        self.onSendInput = onSendInput
        self.onResize = onResize
        self.onRefreshScrollback = onRefreshScrollback
    }

    public var body: some View {
        NavigationSplitView {
            DeviceSidebar(
                snapshot: snapshot,
                onConnect: onConnect,
                onSelectDevice: onSelectDevice,
                onSelectSession: onSelectSession,
                onAttach: onAttach,
                onRetry: onRetry
            )
        } detail: {
            TerminalDetail(
                snapshot: snapshot,
                onSendInput: onSendInput,
                onResize: onResize,
                onRefreshScrollback: onRefreshScrollback
            )
        }
    }
}

@MainActor
public struct DeviceSidebar: View {
    public let snapshot: AttachShellSnapshot
    public let onConnect: () -> Void
    public let onSelectDevice: (String) -> Void
    public let onSelectSession: (String) -> Void
    public let onAttach: () -> Void
    public let onRetry: () -> Void

    public init(
        snapshot: AttachShellSnapshot,
        onConnect: @escaping () -> Void = {},
        onSelectDevice: @escaping (String) -> Void = { _ in },
        onSelectSession: @escaping (String) -> Void = { _ in },
        onAttach: @escaping () -> Void = {},
        onRetry: @escaping () -> Void = {}
    ) {
        self.snapshot = snapshot
        self.onConnect = onConnect
        self.onSelectDevice = onSelectDevice
        self.onSelectSession = onSelectSession
        self.onAttach = onAttach
        self.onRetry = onRetry
    }

    public var body: some View {
        List {
            Section {
                statusRow
                if let error = snapshot.error {
                    ErrorBanner(error: error, actionTitle: retryTitle, onRetry: onRetry)
                        .listRowInsets(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12))
                }
            }

            Section("Macs") {
                if snapshot.devices.isEmpty {
                    ContentUnavailableView("No Macs", systemImage: "desktopcomputer", description: Text("Connect a relay and agent to continue."))
                } else {
                    ForEach(snapshot.devices) { device in
                        Button {
                            onSelectDevice(device.id)
                        } label: {
                            DeviceRow(device: device, selected: snapshot.selectedDeviceId == device.id)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            if let selectedDevice {
                Section("Sessions") {
                    if selectedDevice.sessions.isEmpty {
                        ContentUnavailableView("No Sessions", systemImage: "terminal", description: Text("Start a tmux session on the Mac."))
                    } else {
                        ForEach(selectedDevice.sessions) { session in
                            Button {
                                onSelectSession(session.name)
                            } label: {
                                SessionRow(session: session, selected: snapshot.selectedSessionName == session.name)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }

            Section {
                Button(action: onAttach) {
                    Label(attachTitle, systemImage: "terminal")
                }
                .disabled(snapshot.selectedDeviceId == nil || snapshot.phase == .attaching || snapshot.phase == .connecting)
            }
        }
        .navigationTitle("Hovvi")
    }

    private var selectedDevice: Device? {
        snapshot.devices.first { $0.id == snapshot.selectedDeviceId }
    }

    private var attachTitle: String {
        switch snapshot.phase {
        case .attaching:
            "Attaching..."
        case .attached:
            "Reattach"
        default:
            "Attach"
        }
    }

    @ViewBuilder
    private var statusRow: some View {
        switch snapshot.phase {
        case .disconnected:
            Button(action: onConnect) {
                Label("Connect Relay", systemImage: "bolt.horizontal")
            }
        case .connecting:
            Label("Connecting", systemImage: "hourglass")
        case .browsing:
            Label("Ready", systemImage: "checkmark.circle")
        case .attaching:
            Label("Attaching", systemImage: "hourglass")
        case .attached:
            Label("Attached", systemImage: "checkmark.circle.fill")
        case .failed:
            Button(action: onRetry) {
                Label(retryTitle, systemImage: "arrow.clockwise")
            }
        }
    }

    private var retryTitle: String {
        AttachShellRecoveryPolicy.retryTitle(for: snapshot.recoveryAction)
    }
}

@MainActor
public struct DeviceRow: View {
    public let device: Device
    public let selected: Bool

    public init(device: Device, selected: Bool = false) {
        self.device = device
        self.selected = selected
    }

    public var body: some View {
        HStack(spacing: 12) {
            Image(systemName: selected ? "desktopcomputer.trianglebadge.exclamationmark" : "desktopcomputer")
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(device.name ?? device.id)
                    .font(.headline)
                    .lineLimit(1)
                Text(deviceSubtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()
            Text("\(device.sessions.count)")
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
        }
        .contentShape(Rectangle())
    }

    private var deviceSubtitle: String {
        [device.user, device.platform].compactMap { $0 }.joined(separator: " / ")
    }
}

@MainActor
public struct SessionRow: View {
    public let session: Session
    public let selected: Bool

    public init(session: Session, selected: Bool = false) {
        self.session = session
        self.selected = selected
    }

    public var body: some View {
        HStack(spacing: 12) {
            Image(systemName: SessionPresentation.iconName(for: session, selected: selected))
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(session.name)
                    .font(.headline)
                    .lineLimit(1)
                SessionBadgesView(badges: SessionPresentation.badges(for: session))
            }
            Spacer()
            if session.aiPanes.isEmpty == false {
                Image(systemName: "sparkles")
                    .foregroundStyle(.secondary)
            }
        }
        .contentShape(Rectangle())
    }
}

@MainActor
private struct SessionBadgesView: View {
    let badges: [SessionStatusBadge]

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 6) {
                ForEach(Array(badges.enumerated()), id: \.offset) { item in
                    SessionBadgeView(badge: item.element)
                }
            }
            Text(badges.map(\.text).joined(separator: " / "))
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
    }
}

@MainActor
private struct SessionBadgeView: View {
    let badge: SessionStatusBadge

    var body: some View {
        HStack(spacing: 3) {
            if let systemImage = badge.systemImage {
                Image(systemName: systemImage)
            }
            Text(badge.text)
        }
        .font(.caption2)
        .foregroundStyle(.secondary)
        .lineLimit(1)
    }
}

@MainActor
public struct TerminalDetail: View {
    public let snapshot: AttachShellSnapshot
    public let onSendInput: (Data) -> Void
    public let onResize: (MoshCoreTerminalSize) -> Void
    public let onRefreshScrollback: () -> Void
    @State private var inputText = ""

    public init(
        snapshot: AttachShellSnapshot,
        onSendInput: @escaping (Data) -> Void = { _ in },
        onResize: @escaping (MoshCoreTerminalSize) -> Void = { _ in },
        onRefreshScrollback: @escaping () -> Void = {}
    ) {
        self.snapshot = snapshot
        self.onSendInput = onSendInput
        self.onResize = onResize
        self.onRefreshScrollback = onRefreshScrollback
    }

    public var body: some View {
        VStack(spacing: 0) {
            TerminalSurfaceView(
                snapshot: snapshot,
                onResize: onResize,
                onRefreshScrollback: onRefreshScrollback
            )
            Divider()
            VStack(spacing: 8) {
                TextField("Input", text: $inputText, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .disabled(snapshot.phase != .attached)
                    .onSubmit(sendInput)
                HStack(spacing: 8) {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            terminalKeyButton(.arrowUp, systemImage: "arrow.up")
                            terminalKeyButton(.arrowDown, systemImage: "arrow.down")
                            terminalKeyButton(.arrowLeft, systemImage: "arrow.left")
                            terminalKeyButton(.arrowRight, systemImage: "arrow.right")
                            terminalKeyButton(.home, systemImage: "arrow.up.left")
                            terminalKeyButton(.end, systemImage: "arrow.down.right")
                            terminalKeyButton(.pageUp, systemImage: "arrow.up.to.line")
                            terminalKeyButton(.pageDown, systemImage: "arrow.down.to.line")
                            terminalKeyButton(.escape, systemImage: "escape")
                            terminalKeyButton(.tab, systemImage: "arrow.right.to.line")
                            terminalKeyButton(.interrupt, systemImage: "xmark.octagon")
                            terminalKeyButton(.backspace, systemImage: "delete.left")
                            terminalKeyButton(.deleteForward, systemImage: "delete.right")
                        }
                    }
                    Spacer(minLength: 8)
                    terminalKeyButton(.carriageReturn, systemImage: "return")
                    Button(action: sendInput) {
                        Image(systemName: "paperplane.fill")
                    }
                    .disabled(snapshot.phase != .attached || inputText.isEmpty)
                    .buttonStyle(.borderedProminent)
                }
            }
            .padding(12)
        }
        .navigationTitle(snapshot.selectedSessionName ?? "Terminal")
    }

    private func sendInput() {
        guard inputText.isEmpty == false else { return }
        let command = TerminalInputCommand.userText(
            inputText,
            bracketedPasteEnabled: snapshot.terminalScreen?.isBracketedPasteModeEnabled ?? false
        )
        onSendInput(command.bytes)
        inputText = ""
    }

    private func sendCommand(_ command: TerminalInputCommand) {
        onSendInput(command.bytes(
            applicationCursorKeysMode: snapshot.terminalScreen?.isApplicationCursorKeysModeEnabled ?? false
        ))
    }

    private func terminalKeyButton(_ command: TerminalInputCommand, systemImage: String) -> some View {
        Button {
            sendCommand(command)
        } label: {
            Image(systemName: systemImage)
        }
        .disabled(snapshot.phase != .attached)
        .buttonStyle(.bordered)
    }
}

@MainActor
public struct TerminalSurfaceView: View {
    public let snapshot: AttachShellSnapshot
    public let onResize: (MoshCoreTerminalSize) -> Void
    public let onRefreshScrollback: () -> Void
    @State private var followsLiveOutput = true

    public init(
        snapshot: AttachShellSnapshot,
        onResize: @escaping (MoshCoreTerminalSize) -> Void = { _ in },
        onRefreshScrollback: @escaping () -> Void = {}
    ) {
        self.snapshot = snapshot
        self.onResize = onResize
        self.onRefreshScrollback = onRefreshScrollback
    }

    public var body: some View {
        ScrollViewReader { proxy in
            VStack(spacing: 0) {
                if shouldShowToolbar {
                    HStack {
                        Spacer()
                        Button(action: onRefreshScrollback) {
                            Image(systemName: "arrow.clockwise")
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .disabled(snapshot.selectedDeviceId == nil || snapshot.selectedSessionName == nil)
                        Button {
                            followsLiveOutput.toggle()
                        } label: {
                            Image(systemName: followsLiveOutput ? "arrow.down.to.line.compact" : "pause.fill")
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .help(followsLiveOutput ? "Follow live output" : "Hold scroll position")
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
                    Divider()
                }
                ScrollView([.vertical, .horizontal]) {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(viewport.lines) { line in
                            TerminalSurfaceLineView(line: line)
                                .font(.system(.body, design: .monospaced))
                                .textSelection(.enabled)
                                .frame(
                                    minWidth: TerminalGeometry.surfaceWidth(
                                        columns: snapshot.terminalScreen?.columns ?? TerminalGeometry.minimumColumns
                                    ),
                                    alignment: .leading
                                )
                                .id(line.id)
                        }
                    }
                    .padding(12)
                }
                .background(Color.black.opacity(0.03))
                .overlay {
                    if viewport.lines.isEmpty {
                        ContentUnavailableView("No Output", systemImage: "terminal", description: Text(emptyDescription))
                    }
                }
                .onGeometryChange(for: CGSize.self) { proxy in
                    proxy.size
                } action: { size in
                    onResize(TerminalGeometry.terminalSize(width: size.width, height: size.height))
                }
            }
            .onChange(of: viewport.anchorId) { previousId, id in
                guard TerminalAutoFollowPolicy.shouldScrollToBottom(
                    previousAnchorId: previousId,
                    nextAnchorId: id,
                    followsLiveOutput: followsLiveOutput
                ) else { return }
                withAnimation(.easeOut(duration: 0.15)) {
                    proxy.scrollTo(id, anchor: .bottom)
                }
            }
            .onChange(of: snapshot.phase) { _, phase in
                if phase != .attached {
                    followsLiveOutput = true
                }
            }
        }
    }

    private var viewport: TerminalSurfaceViewport {
        TerminalSurfaceProjection.viewport(for: snapshot)
    }

    private var shouldShowToolbar: Bool {
        viewport.lines.isEmpty == false || snapshot.phase == .attached
    }

    private var emptyDescription: String {
        switch snapshot.phase {
        case .attached:
            "Waiting for terminal output."
        case .attaching:
            "Opening terminal session."
        default:
            "Pick a Mac and session to attach."
        }
    }
}

private struct TerminalSurfaceLineView: View {
    let line: TerminalSurfaceLine

    var body: some View {
        ZStack(alignment: .topLeading) {
            if let cursorColumn = line.cursorColumn {
                Rectangle()
                    .fill(Color.primary.opacity(0.22))
                    .frame(width: TerminalGeometry.cellWidth, height: TerminalGeometry.cellHeight)
                    .offset(x: Double(cursorColumn) * TerminalGeometry.cellWidth)
                    .allowsHitTesting(false)
            }
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                if line.runs.isEmpty {
                    Text(" ")
                } else {
                    ForEach(Array(line.runs.enumerated()), id: \.offset) { item in
                        item.element.runView
                    }
                }
            }
            .lineLimit(1)
            .fixedSize(horizontal: true, vertical: false)
        }
    }
}

private extension TerminalScreenRun {
    @ViewBuilder
    var runView: some View {
        let text = styledText
        if let color = effectiveBackgroundColor {
            text.background(color)
        } else {
            text
        }
    }

    var styledText: Text {
        var text = Text(self.text.isEmpty ? " " : self.text)
        if attributes.bold {
            text = text.bold()
        }
        if attributes.italic {
            text = text.italic()
        }
        if attributes.underline {
            text = text.underline()
        }
        if let color = effectiveForegroundColor {
            text = text.foregroundColor(color)
        }
        return text
    }

    var effectiveForegroundColor: Color? {
        if attributes.inverse {
            return attributes.background?.swiftUIColor ?? .white
        }
        return attributes.foreground?.swiftUIColor
    }

    var effectiveBackgroundColor: Color? {
        if attributes.inverse {
            return attributes.foreground?.swiftUIColor ?? .black
        }
        return attributes.background?.swiftUIColor
    }
}

private extension TerminalAnsiColor {
    var swiftUIColor: Color {
        switch self {
        case .black:
            return .black
        case .red:
            return .red
        case .green:
            return .green
        case .yellow:
            return .yellow
        case .blue:
            return .blue
        case .magenta:
            return .purple
        case .cyan:
            return .cyan
        case .white:
            return .primary
        case .brightBlack:
            return .secondary
        case .brightRed:
            return .red
        case .brightGreen:
            return .green
        case .brightYellow:
            return .yellow
        case .brightBlue:
            return .blue
        case .brightMagenta:
            return .purple
        case .brightCyan:
            return .cyan
        case .brightWhite:
            return .primary
        case .indexed(let index):
            return Self.xterm256Color(index)
        case .rgb(let red, let green, let blue):
            return Color(
                red: Double(red) / 255.0,
                green: Double(green) / 255.0,
                blue: Double(blue) / 255.0
            )
        }
    }

    private static func xterm256Color(_ index: UInt8) -> Color {
        let value = Int(index)
        switch value {
        case 0:
            return .black
        case 1:
            return .red
        case 2:
            return .green
        case 3:
            return .yellow
        case 4:
            return .blue
        case 5:
            return .purple
        case 6:
            return .cyan
        case 7:
            return .primary
        case 8:
            return .secondary
        case 9:
            return .red
        case 10:
            return .green
        case 11:
            return .yellow
        case 12:
            return .blue
        case 13:
            return .purple
        case 14:
            return .cyan
        case 15:
            return .primary
        case 16...231:
            let offset = value - 16
            let red = colorCubeComponent(offset / 36)
            let green = colorCubeComponent((offset / 6) % 6)
            let blue = colorCubeComponent(offset % 6)
            return Color(red: red, green: green, blue: blue)
        default:
            let level = Double(8 + (value - 232) * 10) / 255.0
            return Color(red: level, green: level, blue: level)
        }
    }

    private static func colorCubeComponent(_ value: Int) -> Double {
        if value == 0 {
            return 0
        }
        return Double(55 + value * 40) / 255.0
    }
}

@MainActor
public struct ErrorBanner: View {
    public let error: AttachShellError
    public let actionTitle: String
    public let onRetry: () -> Void

    public init(error: AttachShellError, actionTitle: String = "Retry", onRetry: @escaping () -> Void = {}) {
        self.error = error
        self.actionTitle = actionTitle
        self.onRetry = onRetry
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(error.title, systemImage: "exclamationmark.triangle")
                .font(.headline)
            Text(error.message)
                .font(.caption)
                .foregroundStyle(.secondary)
                .textSelection(.enabled)
            if error.recoverable {
                Button(action: onRetry) {
                    Label(actionTitle, systemImage: "arrow.clockwise")
                }
                .buttonStyle(.bordered)
            }
        }
    }
}
