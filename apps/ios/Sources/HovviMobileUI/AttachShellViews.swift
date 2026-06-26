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
    public let onSendInput: (String) -> Void
    public let onResize: (MoshCoreTerminalSize) -> Void

    public init(
        snapshot: AttachShellSnapshot,
        onConnect: @escaping () -> Void = {},
        onSelectDevice: @escaping (String) -> Void = { _ in },
        onSelectSession: @escaping (String) -> Void = { _ in },
        onAttach: @escaping () -> Void = {},
        onRetry: @escaping () -> Void = {},
        onSendInput: @escaping (String) -> Void = { _ in },
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
    public let onSendInput: (String) -> Void
    public let onResize: (MoshCoreTerminalSize) -> Void
    @State private var inputText = ""

    public init(
        snapshot: AttachShellSnapshot,
        onSendInput: @escaping (String) -> Void = { _ in },
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
            HStack(spacing: 8) {
                TextField("Input", text: $inputText, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .disabled(snapshot.phase != .attached)
                    .onSubmit(sendInput)
                Button(action: sendInput) {
                    Image(systemName: "paperplane.fill")
                }
                .disabled(snapshot.phase != .attached || inputText.isEmpty)
                .buttonStyle(.borderedProminent)
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
        onSendInput(inputText)
        inputText = ""
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
                        Text(line.text.isEmpty ? " " : line.text)
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
            return screen.visibleLines.map { TerminalSurfaceLine(id: $0.id, text: $0.text) }
        }
        return (snapshot.scrollback?.visibleLines ?? []).map { TerminalSurfaceLine(id: $0.id, text: $0.text) }
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
    let text: String
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
