public enum AttachShellLifecyclePolicy {
    public static func shouldRunAttachLoops(phase: AttachShellPhase) -> Bool {
        phase == .attached
    }

    public static func shouldPauseAttachLoops(enteringBackground: Bool) -> Bool {
        enteringBackground
    }

    public static func shouldApplyLoopSnapshot(
        loopGeneration: Int,
        currentGeneration: Int
    ) -> Bool {
        loopGeneration == currentGeneration
    }

    public static func shouldApplyUserActionSnapshot(
        actionGeneration: Int,
        currentGeneration: Int
    ) -> Bool {
        actionGeneration == currentGeneration
    }

    public static func shouldStartTickLoop(afterApplying phase: AttachShellPhase) -> Bool {
        shouldRunAttachLoops(phase: phase)
    }

    public static func shouldCancelTickLoop(afterApplying phase: AttachShellPhase) -> Bool {
        shouldRunAttachLoops(phase: phase) == false
    }
}
