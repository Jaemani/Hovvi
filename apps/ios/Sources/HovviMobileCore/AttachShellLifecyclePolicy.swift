public enum AttachShellLifecyclePolicy {
    public static func shouldRunAttachLoops(phase: AttachShellPhase) -> Bool {
        phase == .attached
    }

    public static func shouldPauseAttachLoops(enteringBackground: Bool) -> Bool {
        enteringBackground
    }
}
