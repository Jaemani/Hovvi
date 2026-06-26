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
                onRetry: { controller.connect() },
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
    private var receiveTask: Task<Void, Never>?
    private var lastResize: MoshCoreTerminalSize?

    init(environment: [String: String] = ProcessInfo.processInfo.environment) {
        let config = HovviAppConfig(environment: environment)
        let relay = RelayClient(url: config.relayURL, token: config.relayToken, clientId: config.clientId)
        self.model = AttachShellModel(relay: relay)
    }

    func connect() {
        receiveTask?.cancel()
        receiveTask = nil
        Task {
            snapshot = await model.connectAndLoadDevices()
        }
    }

    func selectDevice(_ deviceId: String) {
        Task {
            snapshot = await model.selectDevice(deviceId)
        }
    }

    func selectSession(_ sessionName: String) {
        Task {
            snapshot = await model.selectSession(sessionName)
        }
    }

    func attach() {
        receiveTask?.cancel()
        receiveTask = nil
        Task {
            snapshot = await model.attach(initialSize: lastResize ?? MoshCoreTerminalSize(columns: 80, rows: 24))
            if snapshot.phase == .attached {
                startReceiveLoop()
            }
        }
    }

    func sendInput(_ text: String) {
        Task {
            snapshot = await model.sendInput(Data(text.utf8))
        }
    }

    func resize(to size: MoshCoreTerminalSize) {
        guard lastResize != size else { return }
        lastResize = size
        guard snapshot.phase == .attached else { return }
        Task {
            snapshot = await model.resize(to: size)
        }
    }

    func pauseReceiveLoop() {
        receiveTask?.cancel()
        receiveTask = nil
    }

    private func startReceiveLoop() {
        receiveTask = Task { [model] in
            while Task.isCancelled == false {
                let next = await model.receiveNext(timeout: .seconds(30))
                await MainActor.run {
                    snapshot = next
                }
                if next.phase != .attached {
                    break
                }
            }
        }
    }
}

struct HovviAppConfig: Equatable {
    let relayURL: URL
    let relayToken: String
    let clientId: String

    init(environment: [String: String]) {
        let relayURLString = environment["HOVVI_RELAY_URL"] ?? "ws://127.0.0.1:8787"
        self.relayURL = URL(string: relayURLString) ?? URL(string: "ws://127.0.0.1:8787")!
        self.relayToken = environment["HOVVI_RELAY_TOKEN"] ?? environment["HOVVI_TOKEN"] ?? "dev"
        self.clientId = environment["HOVVI_CLIENT_ID"] ?? "ios-alpha"
    }
}
