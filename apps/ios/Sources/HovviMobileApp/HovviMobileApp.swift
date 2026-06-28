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
                onResize: { controller.resize(to: $0) },
                onRefreshScrollback: { controller.refreshScrollback() }
            )
            .task {
                controller.connect()
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if AttachShellLifecyclePolicy.shouldPauseAttachLoops(enteringBackground: phase == .background) {
                controller.pauseReceiveLoop()
            } else if phase == .active {
                controller.resumeAttachLoopsIfNeeded()
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
    private var userActionGeneration = 0
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
        let generation = beginExclusiveUserAction()
        Task {
            let next = await model.connectAndLoadDevices()
            guard shouldApplyUserAction(generation) else { return }
            snapshot = next
        }
    }

    func selectDevice(_ deviceId: String) {
        guard fixtureSnapshot == nil else { return }
        cancelAttachLoops()
        let generation = beginExclusiveUserAction()
        Task {
            let next = await model.selectDevice(deviceId)
            guard shouldApplyUserAction(generation) else { return }
            snapshot = next
        }
    }

    func selectSession(_ sessionName: String) {
        guard fixtureSnapshot == nil else { return }
        cancelAttachLoops()
        let generation = beginExclusiveUserAction()
        Task {
            let next = await model.selectSession(sessionName)
            guard shouldApplyUserAction(generation) else { return }
            snapshot = next
        }
    }

    func attach() {
        guard fixtureSnapshot == nil else { return }
        cancelAttachLoops()
        let generation = beginExclusiveUserAction()
        Task {
            let next = await model.attach(initialSize: lastResize ?? MoshCoreTerminalSize(columns: 80, rows: 24))
            guard shouldApplyUserAction(generation) else { return }
            snapshot = next
            if next.phase == .attached {
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
        let generation = currentUserActionGeneration()
        Task {
            let next = await model.sendInput(bytes)
            guard shouldApplyUserAction(generation) else { return }
            snapshot = next
            if next.phase == .attached {
                startTickLoop()
            }
        }
    }

    func resize(to size: MoshCoreTerminalSize) {
        guard lastResize != size else { return }
        lastResize = size
        guard fixtureSnapshot == nil else { return }
        guard snapshot.phase == .attached else { return }
        let generation = currentUserActionGeneration()
        Task {
            let next = await model.resize(to: size)
            guard shouldApplyUserAction(generation) else { return }
            snapshot = next
            if next.phase == .attached {
                startTickLoop()
            }
        }
    }

    func refreshScrollback() {
        guard fixtureSnapshot == nil else { return }
        let generation = beginExclusiveUserAction()
        Task {
            let next = await model.refreshScrollback()
            guard shouldApplyUserAction(generation) else { return }
            snapshot = next
        }
    }

    func pauseReceiveLoop() {
        cancelAttachLoops()
    }

    func resumeAttachLoopsIfNeeded() {
        guard fixtureSnapshot == nil else { return }
        guard AttachShellLifecyclePolicy.shouldRunAttachLoops(phase: snapshot.phase) else { return }
        startReceiveLoop()
        startTickLoop()
    }

    private func cancelAttachLoops() {
        attachLoopGeneration += 1
        receiveTask?.cancel()
        receiveTask = nil
        tickTask?.cancel()
        tickTask = nil
    }

    private func beginExclusiveUserAction() -> Int {
        userActionGeneration += 1
        return userActionGeneration
    }

    private func currentUserActionGeneration() -> Int {
        userActionGeneration
    }

    private func shouldApplyUserAction(_ generation: Int) -> Bool {
        AttachShellLifecyclePolicy.shouldApplyUserActionSnapshot(
            actionGeneration: generation,
            currentGeneration: userActionGeneration
        )
    }

    private func startReceiveLoop() {
        guard receiveTask == nil else { return }
        let generation = attachLoopGeneration
        receiveTask = Task { [model] in
            defer {
                Task { @MainActor in
                    if attachLoopGeneration == generation {
                        receiveTask = nil
                    }
                }
            }
            while Task.isCancelled == false {
                let next = await model.receiveNext(timeout: .seconds(30))
                await MainActor.run {
                    guard AttachShellLifecyclePolicy.shouldApplyLoopSnapshot(
                        loopGeneration: generation,
                        currentGeneration: attachLoopGeneration
                    ) else {
                        return
                    }
                    snapshot = next
                    if AttachShellLifecyclePolicy.shouldStartTickLoop(afterApplying: next.phase) {
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
                    guard AttachShellLifecyclePolicy.shouldApplyLoopSnapshot(
                        loopGeneration: generation,
                        currentGeneration: attachLoopGeneration
                    ) else {
                        return
                    }
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
