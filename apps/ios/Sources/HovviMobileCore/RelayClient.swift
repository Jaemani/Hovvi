import Foundation

public actor RelayClient {
    public let url: URL
    public let token: String
    public let clientId: String?

    private var task: URLSessionWebSocketTask?
    private var receiveTask: Task<Void, Never>?
    private var latestDevices: [Device]?
    private var deviceWaiters: [UUID: ResponseWaiter<[Device]>] = [:]
    private var attachWaiters: [String: ResponseWaiter<AttachManifest>] = [:]
    private var scrollbackWaiters: [String: ResponseWaiter<ScrollbackResult>] = [:]
    private var forwardReadyWaiters: [String: ResponseWaiter<String>] = [:]
    private var forwardFrameBuffers: [String: [RelayForwardFrame]] = [:]
    private var forwardFrameWaiters: [String: [ForwardFrameWaiter]] = [:]

    public init(url: URL, token: String, clientId: String? = nil) {
        self.url = url
        self.token = token
        self.clientId = clientId
    }

    public func connect(startReceiveLoop: Bool = false) async throws {
        guard task == nil else { return }
        let task = URLSession.shared.webSocketTask(with: url)
        task.resume()
        self.task = task
        if startReceiveLoop {
            startReceiveLoopIfNeeded()
        }
        do {
            try await sendEnvelope(OutgoingRelayMessage.helloEnvelope(token: token, clientId: clientId))
        } catch {
            disconnect()
            throw error
        }
    }

    public func disconnect() {
        receiveTask?.cancel()
        receiveTask = nil
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        failAll(RelayClientError.notConnected)
    }

    public func cachedDevices() -> [Device] {
        latestDevices ?? []
    }

    public func listDevices(timeout: Duration = .seconds(3)) async throws -> [Device] {
        try ensureReceiveLoop()
        let request = OutgoingRelayMessage.devicesListEnvelope()
        let waiterId = UUID()

        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                deviceWaiters[waiterId] = ResponseWaiter(
                    continuation: continuation,
                    timeoutTask: makeTimeoutTask(timeout) { await self.timeoutDeviceWaiter(waiterId) }
                )
                Task {
                    do {
                        try await self.sendEnvelope(request)
                    } catch {
                        self.failDeviceWaiter(waiterId, error: error)
                    }
                }
            }
        } onCancel: {
            Task { await self.failDeviceWaiter(waiterId, error: CancellationError()) }
        }
    }

    public func requestDevices() async throws {
        try await sendEnvelope(OutgoingRelayMessage.devicesListEnvelope())
    }

    public func prepareAttach(
        deviceId: String,
        sessionName: String = "main",
        lines: Int = 2000,
        create: Bool = false
    ) async throws {
        try await sendEnvelope(
            OutgoingRelayMessage.prepareAttachEnvelope(
                deviceId: deviceId,
                sessionName: sessionName,
                lines: lines,
                create: create
            )
        )
    }

    public func prepareAttachManifest(
        deviceId: String,
        sessionName: String = "main",
        lines: Int = 2000,
        create: Bool = false,
        timeout: Duration = .seconds(5)
    ) async throws -> AttachManifest {
        try ensureReceiveLoop()
        let request = OutgoingRelayMessage.prepareAttachEnvelope(
            deviceId: deviceId,
            sessionName: sessionName,
            lines: lines,
            create: create
        )
        return try await withRequestWaiter(
            requestId: request.id,
            timeout: timeout,
            register: { attachWaiters[request.id] = $0 },
            timeoutAction: { await self.failAttachWaiter(request.id, error: RelayClientError.timedOut) },
            cancel: { await self.failAttachWaiter(request.id, error: CancellationError()) },
            send: { try await self.sendEnvelope(request) }
        )
    }

    public func fetchScrollback(deviceId: String, sessionName: String = "main", lines: Int = 2000) async throws {
        try await sendEnvelope(
            OutgoingRelayMessage.fetchScrollbackEnvelope(deviceId: deviceId, sessionName: sessionName, lines: lines)
        )
    }

    public func fetchScrollbackResult(
        deviceId: String,
        sessionName: String = "main",
        lines: Int = 2000,
        timeout: Duration = .seconds(5)
    ) async throws -> ScrollbackResult {
        try ensureReceiveLoop()
        let request = OutgoingRelayMessage.fetchScrollbackEnvelope(
            deviceId: deviceId,
            sessionName: sessionName,
            lines: lines
        )
        return try await withRequestWaiter(
            requestId: request.id,
            timeout: timeout,
            register: { scrollbackWaiters[request.id] = $0 },
            timeoutAction: { await self.failScrollbackWaiter(request.id, error: RelayClientError.timedOut) },
            cancel: { await self.failScrollbackWaiter(request.id, error: CancellationError()) },
            send: { try await self.sendEnvelope(request) }
        )
    }

    public func openForward(
        deviceId: String,
        remoteHost: String? = nil,
        remotePort: Int? = nil,
        timeout: Duration = .seconds(5)
    ) async throws -> String {
        try ensureReceiveLoop()
        let request = OutgoingRelayMessage.forwardOpenEnvelope(
            deviceId: deviceId,
            remoteHost: remoteHost,
            remotePort: remotePort
        )
        return try await withRequestWaiter(
            requestId: request.payload.streamId,
            timeout: timeout,
            register: { forwardReadyWaiters[request.payload.streamId] = $0 },
            timeoutAction: { await self.failForwardReadyWaiter(request.payload.streamId, error: RelayClientError.timedOut) },
            cancel: { await self.failForwardReadyWaiter(request.payload.streamId, error: CancellationError()) },
            send: { try await self.sendEnvelope(request) }
        )
    }

    public func sendForwardData(streamId: String, bytes: Data) async throws {
        try await sendEnvelope(OutgoingRelayMessage.forwardDataEnvelope(streamId: streamId, bytes: bytes))
    }

    public func readForwardFrame(streamId: String, timeout: Duration = .seconds(30)) async throws -> RelayForwardFrame {
        try ensureReceiveLoop()
        if var buffer = forwardFrameBuffers[streamId], buffer.isEmpty == false {
            let frame = buffer.removeFirst()
            forwardFrameBuffers[streamId] = buffer.isEmpty ? nil : buffer
            return frame
        }

        let waiterId = UUID()
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                let waiter = ForwardFrameWaiter(
                    id: waiterId,
                    waiter: ResponseWaiter(
                        continuation: continuation,
                        timeoutTask: makeTimeoutTask(timeout) {
                            await self.failForwardFrameWaiter(
                                streamId: streamId,
                                waiterId: waiterId,
                                error: RelayClientError.timedOut
                            )
                        }
                    )
                )
                forwardFrameWaiters[streamId, default: []].append(waiter)
            }
        } onCancel: {
            Task {
                await self.failForwardFrameWaiter(
                    streamId: streamId,
                    waiterId: waiterId,
                    error: CancellationError()
                )
            }
        }
    }

    public func closeForward(streamId: String) async throws {
        try await sendEnvelope(OutgoingRelayMessage.forwardEndEnvelope(streamId: streamId))
    }

    public func receive() async throws -> IncomingRelayMessage {
        guard receiveTask == nil else { throw RelayClientError.receiveLoopActive }
        return try await receiveFrame()
    }

    private func receiveFrame() async throws -> IncomingRelayMessage {
        guard let task else { throw RelayClientError.notConnected }
        let message = try await task.receive()

        switch message {
        case .data(let data):
            return try decodeIncomingRelayMessage(from: data)
        case .string(let text):
            guard let data = text.data(using: .utf8) else {
                throw RelayClientError.invalidTextFrame
            }
            return try decodeIncomingRelayMessage(from: data)
        @unknown default:
            throw RelayClientError.unsupportedFrame
        }
    }

    private func ensureReceiveLoop() throws {
        guard task != nil else { throw RelayClientError.notConnected }
        startReceiveLoopIfNeeded()
    }

    private func startReceiveLoopIfNeeded() {
        guard receiveTask == nil else { return }
        receiveTask = Task { await self.receiveLoop() }
    }

    private func receiveLoop() async {
        do {
            while !Task.isCancelled {
                route(try await receiveFrame())
            }
        } catch {
            if !Task.isCancelled {
                task = nil
                failAll(error)
            }
        }
        receiveTask = nil
    }

    private func route(_ message: IncomingRelayMessage) {
        switch message {
        case .devicesSnapshot:
            routeDevices(message)
        case .attachReady(let envelope):
            resolveAttachWaiter(envelope.payload.requestId, value: envelope.payload.manifest)
        case .attachError(let envelope):
            if let requestId = envelope.payload.requestId {
                failAttachWaiter(requestId, error: RelayClientError.requestFailed(envelope.payload))
            } else {
                failAll(RelayClientError.requestFailed(envelope.payload))
            }
        case .scrollbackReady(let envelope):
            resolveScrollbackWaiter(
                envelope.payload.requestId,
                value: ScrollbackResult(
                    sessionName: envelope.payload.sessionName,
                    lines: envelope.payload.lines,
                    text: envelope.payload.text
                )
            )
        case .scrollbackError(let envelope):
            if let requestId = envelope.payload.requestId {
                failScrollbackWaiter(requestId, error: RelayClientError.requestFailed(envelope.payload))
            } else {
                failAll(RelayClientError.requestFailed(envelope.payload))
            }
        case .forwardReady(let envelope):
            resolveForwardReadyWaiter(envelope.payload.streamId, value: envelope.payload.streamId)
        case .forwardData(let envelope):
            guard let bytes = envelope.payload.bytes else {
                failForward(streamId: envelope.payload.streamId, error: RelayClientError.invalidBase64Frame)
                return
            }
            routeForwardFrame(streamId: envelope.payload.streamId, frame: .data(bytes))
        case .forwardEnd(let envelope):
            routeForwardFrame(streamId: envelope.payload.streamId, frame: .end)
        case .forwardError(let envelope):
            failForward(streamId: envelope.payload.streamId, error: RelayClientError.forwardFailed(envelope.payload))
        case .relayError(let envelope):
            failAll(RelayClientError.requestFailed(envelope.payload))
        default:
            break
        }
    }

    private func routeDevices(_ message: IncomingRelayMessage) {
        do {
            guard let devices = try RelayResponseMatcher.devices(from: message) else { return }
            latestDevices = devices
            for waiterId in Array(deviceWaiters.keys) {
                resolveDeviceWaiter(waiterId, value: devices)
            }
        } catch {
            failAll(error)
        }
    }

    private func withRequestWaiter<Value: Sendable>(
        requestId: String,
        timeout: Duration,
        register: (ResponseWaiter<Value>) -> Void,
        timeoutAction: @escaping @Sendable () async -> Void,
        cancel: @escaping @Sendable () async -> Void,
        send: @escaping @Sendable () async throws -> Void
    ) async throws -> Value {
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                register(
                    ResponseWaiter(
                        continuation: continuation,
                        timeoutTask: makeTimeoutTask(timeout, action: timeoutAction)
                    )
                )
                Task {
                    do {
                        try await send()
                    } catch {
                        self.failRequest(requestId, error: error)
                    }
                }
            }
        } onCancel: {
            Task { await cancel() }
        }
    }

    private func makeTimeoutTask(_ timeout: Duration, action: @escaping @Sendable () async -> Void) -> Task<Void, Never> {
        Task {
            do {
                try await Task.sleep(for: timeout)
                await action()
            } catch {
            }
        }
    }

    private func resolveDeviceWaiter(_ waiterId: UUID, value: [Device]) {
        guard let waiter = deviceWaiters.removeValue(forKey: waiterId) else { return }
        resolve(waiter, value: value)
    }

    private func timeoutDeviceWaiter(_ waiterId: UUID) {
        failDeviceWaiter(waiterId, error: RelayClientError.timedOut)
    }

    private func failDeviceWaiter(_ waiterId: UUID, error: Error) {
        guard let waiter = deviceWaiters.removeValue(forKey: waiterId) else { return }
        reject(waiter, error: error)
    }

    private func resolveAttachWaiter(_ requestId: String, value: AttachManifest) {
        guard let waiter = attachWaiters.removeValue(forKey: requestId) else { return }
        resolve(waiter, value: value)
    }

    private func failAttachWaiter(_ requestId: String, error: Error) {
        guard let waiter = attachWaiters.removeValue(forKey: requestId) else { return }
        reject(waiter, error: error)
    }

    private func resolveScrollbackWaiter(_ requestId: String, value: ScrollbackResult) {
        guard let waiter = scrollbackWaiters.removeValue(forKey: requestId) else { return }
        resolve(waiter, value: value)
    }

    private func failScrollbackWaiter(_ requestId: String, error: Error) {
        guard let waiter = scrollbackWaiters.removeValue(forKey: requestId) else { return }
        reject(waiter, error: error)
    }

    private func resolveForwardReadyWaiter(_ streamId: String, value: String) {
        guard let waiter = forwardReadyWaiters.removeValue(forKey: streamId) else { return }
        resolve(waiter, value: value)
    }

    private func failForwardReadyWaiter(_ streamId: String, error: Error) {
        guard let waiter = forwardReadyWaiters.removeValue(forKey: streamId) else { return }
        reject(waiter, error: error)
    }

    private func routeForwardFrame(streamId: String, frame: RelayForwardFrame) {
        if var waiters = forwardFrameWaiters[streamId], waiters.isEmpty == false {
            let next = waiters.removeFirst()
            forwardFrameWaiters[streamId] = waiters.isEmpty ? nil : waiters
            resolve(next.waiter, value: frame)
            return
        }
        forwardFrameBuffers[streamId, default: []].append(frame)
    }

    private func failForwardFrameWaiter(streamId: String, waiterId: UUID, error: Error) {
        guard var waiters = forwardFrameWaiters[streamId],
              let index = waiters.firstIndex(where: { $0.id == waiterId }) else {
            return
        }
        let waiter = waiters.remove(at: index)
        forwardFrameWaiters[streamId] = waiters.isEmpty ? nil : waiters
        reject(waiter.waiter, error: error)
    }

    private func failForwardFrameWaiters(streamId: String, error: Error) {
        guard let waiters = forwardFrameWaiters.removeValue(forKey: streamId) else { return }
        for waiter in waiters {
            reject(waiter.waiter, error: error)
        }
        forwardFrameBuffers.removeValue(forKey: streamId)
    }

    private func failForward(streamId: String, error: Error) {
        failForwardReadyWaiter(streamId, error: error)
        failForwardFrameWaiters(streamId: streamId, error: error)
    }

    private func failRequest(_ requestId: String, error: Error) {
        failAttachWaiter(requestId, error: error)
        failScrollbackWaiter(requestId, error: error)
        failForwardReadyWaiter(requestId, error: error)
    }

    private func failAll(_ error: Error) {
        for waiterId in Array(deviceWaiters.keys) {
            failDeviceWaiter(waiterId, error: error)
        }
        for requestId in Array(attachWaiters.keys) {
            failAttachWaiter(requestId, error: error)
        }
        for requestId in Array(scrollbackWaiters.keys) {
            failScrollbackWaiter(requestId, error: error)
        }
        for streamId in Array(forwardReadyWaiters.keys) {
            failForwardReadyWaiter(streamId, error: error)
        }
        for streamId in Array(forwardFrameWaiters.keys) {
            failForwardFrameWaiters(streamId: streamId, error: error)
        }
        forwardFrameBuffers.removeAll()
    }

    private func resolve<Value>(_ waiter: ResponseWaiter<Value>, value: Value) {
        waiter.timeoutTask.cancel()
        waiter.continuation.resume(returning: value)
    }

    private func reject<Value>(_ waiter: ResponseWaiter<Value>, error: Error) {
        waiter.timeoutTask.cancel()
        waiter.continuation.resume(throwing: error)
    }

    private func sendEnvelope<Payload: Codable>(_ envelope: Envelope<Payload>) async throws {
        try await sendRaw(HovviCoding.encodeEnvelope(envelope))
    }

    private func sendRaw(_ data: Data) async throws {
        guard let task else { throw RelayClientError.notConnected }
        try await task.send(.data(data))
    }
}

public enum RelayClientError: Error, Equatable, Sendable {
    case notConnected
    case invalidTextFrame
    case unsupportedFrame
    case receiveLoopActive
    case timedOut
    case requestFailed(RequestErrorPayload)
    case forwardFailed(ForwardErrorPayload)
    case invalidBase64Frame
}

private struct ResponseWaiter<Value: Sendable> {
    let continuation: CheckedContinuation<Value, Error>
    let timeoutTask: Task<Void, Never>
}

private struct ForwardFrameWaiter {
    let id: UUID
    let waiter: ResponseWaiter<RelayForwardFrame>
}
