import Foundation
import HovviMobileCore
import SwiftUI

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

    public init(
        snapshot: AttachShellSnapshot,
        onConnect: @escaping () -> Void = {},
        onSelectDevice: @escaping (String) -> Void = { _ in },
        onSelectSession: @escaping (String) -> Void = { _ in },
        onAttach: @escaping () -> Void = {},
        onRetry: @escaping () -> Void = {},
        onSendInput: @escaping (Data) -> Void = { _ in },
        onResize: @escaping (MoshCoreTerminalSize) -> Void = { _ in }
    ) {
        self.snapshot = snapshot
        self.onConnect = onConnect
        self.onSelectDevice = onSelectDevice
        self.onSelectSession = onSelectSession
        self.onAttach = onAttach
        self.onRetry = onRetry
        self.onSendInput = onSendInput
        self.onResize = onResize
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
                onResize: onResize
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
                    ErrorBanner(error: error, onRetry: onRetry)
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
                Label("Retry", systemImage: "arrow.clockwise")
            }
        }
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
            Image(systemName: selected ? "terminal.fill" : "terminal")
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(session.name)
                    .font(.headline)
                    .lineLimit(1)
                Text(sessionKindText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()
            if session.aiPanes.isEmpty == false {
                Image(systemName: "sparkles")
                    .foregroundStyle(.secondary)
            }
        }
        .contentShape(Rectangle())
    }

    private var sessionKindText: String {
        var parts = [session.kind]
        if let windows = session.windows {
            parts.append("\(windows) windows")
        }
        if session.aiPanes.isEmpty == false {
            parts.append(session.aiPanes.map(\.command).joined(separator: ", "))
        }
        return parts.joined(separator: " / ")
    }
}

@MainActor
public struct TerminalDetail: View {
    public let snapshot: AttachShellSnapshot
    public let onSendInput: (Data) -> Void
    public let onResize: (MoshCoreTerminalSize) -> Void
    @State private var inputText = ""

    public init(
        snapshot: AttachShellSnapshot,
        onSendInput: @escaping (Data) -> Void = { _ in },
        onResize: @escaping (MoshCoreTerminalSize) -> Void = { _ in }
    ) {
        self.snapshot = snapshot
        self.onSendInput = onSendInput
        self.onResize = onResize
    }

    public var body: some View {
        VStack(spacing: 0) {
            TerminalSurfaceView(snapshot: snapshot)
            Divider()
            VStack(spacing: 8) {
                TextField("Input", text: $inputText, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .disabled(snapshot.phase != .attached)
                    .onSubmit(sendInput)
                HStack(spacing: 8) {
                    terminalKeyButton(.escape, systemImage: "escape")
                    terminalKeyButton(.tab, systemImage: "arrow.right.to.line")
                    terminalKeyButton(.interrupt, systemImage: "xmark.octagon")
                    terminalKeyButton(.backspace, systemImage: "delete.left")
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
        .onGeometryChange(for: CGSize.self) { proxy in
            proxy.size
        } action: { size in
            let columns = max(40, Int(size.width / 8))
            let rows = max(12, Int(size.height / 18))
            onResize(MoshCoreTerminalSize(columns: columns, rows: rows))
        }
    }

    private func sendInput() {
        guard inputText.isEmpty == false else { return }
        let command: TerminalInputCommand
        if inputText.contains(where: \.isNewline) {
            command = .paste(inputText, bracketed: snapshot.terminalScreen?.isBracketedPasteModeEnabled ?? false)
        } else {
            command = .text(inputText)
        }
        onSendInput(command.bytes)
        inputText = ""
    }

    private func sendCommand(_ command: TerminalInputCommand) {
        onSendInput(command.bytes)
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

    public init(snapshot: AttachShellSnapshot) {
        self.snapshot = snapshot
    }

    public var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(lines) { line in
                        TerminalSurfaceLineView(line: line)
                            .font(.system(.body, design: .monospaced))
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .id(line.id)
                    }
                }
                .padding(12)
            }
            .background(Color.black.opacity(0.03))
            .onChange(of: lines.last?.id) { _, id in
                guard let id else { return }
                withAnimation(.easeOut(duration: 0.15)) {
                    proxy.scrollTo(id, anchor: .bottom)
                }
            }
            .overlay {
                if lines.isEmpty {
                    ContentUnavailableView("No Output", systemImage: "terminal", description: Text(emptyDescription))
                }
            }
        }
    }

    private var lines: [TerminalSurfaceLine] {
        if let screen = snapshot.terminalScreen, screen.hasVisibleText {
            return screen.visibleLines.map { TerminalSurfaceLine(id: $0.id, runs: $0.runs) }
        }
        return (snapshot.scrollback?.visibleLines ?? []).map {
            TerminalSurfaceLine(id: $0.id, runs: [TerminalScreenRun(text: $0.text)])
        }
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

private struct TerminalSurfaceLine: Identifiable, Equatable {
    let id: String
    let runs: [TerminalScreenRun]
}

private struct TerminalSurfaceLineView: View {
    let line: TerminalSurfaceLine

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            if line.runs.isEmpty {
                Text(" ")
            } else {
                ForEach(Array(line.runs.enumerated()), id: \.offset) { item in
                    item.element.runView
                }
            }
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
    public let onRetry: () -> Void

    public init(error: AttachShellError, onRetry: @escaping () -> Void = {}) {
        self.error = error
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
                    Label("Retry", systemImage: "arrow.clockwise")
                }
                .buttonStyle(.bordered)
            }
        }
    }
}
