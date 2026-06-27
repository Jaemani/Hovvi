import Foundation
import HovviMobileCore
import HovviMobileUI
import SwiftUI

@main
struct HovviMobileApp: App {
    @StateObject private var controller = HovviAppController()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            HovviAttachShellView(
                snapshot: controller.snapshot,
                onConnect: { controller.connect() },
                onSelectDevice: { controller.selectDevice($0) },
                onSelectSession: { controller.selectSession($0) },
                onAttach: { controller.attach() },
                onRetry: { controller.retry() },
                onSendInput: { controller.sendInput($0) },
                onResize: { controller.resize(to: $0) }
            )
            .task {
                controller.connect()
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background {
                controller.pauseReceiveLoop()
            }
        }
    }
}

@MainActor
final class HovviAppController: ObservableObject {
    @Published private(set) var snapshot = AttachShellSnapshot()

    private let model: AttachShellModel
    private let fixtureSnapshot: AttachShellSnapshot?
    private var receiveTask: Task<Void, Never>?
    private var tickTask: Task<Void, Never>?
    private var attachLoopGeneration = 0
    private var lastResize: MoshCoreTerminalSize?

    init(environment: [String: String] = ProcessInfo.processInfo.environment) {
        self.fixtureSnapshot = AttachShellPreviewFixtures.snapshot(
            named: environment[AttachShellPreviewFixtures.environmentKey]
        )
        let config = AppBootstrapConfig(environment: environment)
        let relay = RelayClient(url: config.relayURL, token: config.relayToken, clientId: config.clientId)
        self.model = AttachShellModel(relay: relay)
        if let fixtureSnapshot {
            self.snapshot = fixtureSnapshot
        }
    }

    func connect() {
        if let fixtureSnapshot {
            snapshot = fixtureSnapshot
            return
        }
        cancelAttachLoops()
        Task {
            snapshot = await model.connectAndLoadDevices()
        }
    }

    func selectDevice(_ deviceId: String) {
        guard fixtureSnapshot == nil else { return }
        Task {
            snapshot = await model.selectDevice(deviceId)
        }
    }

    func selectSession(_ sessionName: String) {
        guard fixtureSnapshot == nil else { return }
        Task {
            snapshot = await model.selectSession(sessionName)
        }
    }

    func attach() {
        guard fixtureSnapshot == nil else { return }
        cancelAttachLoops()
        Task {
            snapshot = await model.attach(initialSize: lastResize ?? MoshCoreTerminalSize(columns: 80, rows: 24))
            if snapshot.phase == .attached {
                startReceiveLoop()
                startTickLoop()
            }
        }
    }

    func retry() {
        guard fixtureSnapshot == nil else { return }
        switch snapshot.recoveryAction {
        case .reattachSession:
            attach()
        case .connectRelay, nil:
            connect()
        }
    }

    func sendInput(_ bytes: Data) {
        guard fixtureSnapshot == nil else { return }
        Task {
            snapshot = await model.sendInput(bytes)
            if snapshot.phase == .attached {
                startTickLoop()
            }
        }
    }

    func resize(to size: MoshCoreTerminalSize) {
        guard lastResize != size else { return }
        lastResize = size
        guard fixtureSnapshot == nil else { return }
        guard snapshot.phase == .attached else { return }
        Task {
            snapshot = await model.resize(to: size)
            if snapshot.phase == .attached {
                startTickLoop()
            }
        }
    }

    func pauseReceiveLoop() {
        cancelAttachLoops()
    }

    private func cancelAttachLoops() {
        attachLoopGeneration += 1
        receiveTask?.cancel()
        receiveTask = nil
        tickTask?.cancel()
        tickTask = nil
    }

    private func startReceiveLoop() {
        receiveTask = Task { [model] in
            while Task.isCancelled == false {
                let next = await model.receiveNext(timeout: .seconds(30))
                await MainActor.run {
                    snapshot = next
                    if next.phase == .attached {
                        startTickLoop()
                    }
                }
                if next.phase != .attached {
                    break
                }
            }
        }
    }

    private func startTickLoop() {
        guard tickTask == nil else { return }
        let generation = attachLoopGeneration
        tickTask = Task { [model] in
            defer {
                Task { @MainActor in
                    if attachLoopGeneration == generation {
                        tickTask = nil
                    }
                }
            }
            while Task.isCancelled == false {
                let current = await model.currentSnapshot()
                guard current.phase == .attached else { break }
                let delayMs = current.nextTickAfterMs ?? 250
                do {
                    try await Task.sleep(for: .milliseconds(Int(delayMs)))
                } catch {
                    break
                }
                if Task.isCancelled {
                    break
                }
                let next = await model.tick(nowMs: Self.currentMoshTimeMs())
                await MainActor.run {
                    snapshot = next
                }
                if next.phase != .attached {
                    break
                }
            }
        }
    }

    nonisolated private static func currentMoshTimeMs() -> UInt64 {
        UInt64(Date().timeIntervalSince1970 * 1000)
    }
}
