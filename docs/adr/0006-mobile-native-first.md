# ADR 0006: Native-First Mobile Client

## Status

Accepted

## Decision

Hovvi mobile starts native-first: Swift/SwiftUI for iOS alpha, Kotlin/Compose for Android after the iOS attach path stabilizes.

Flutter is acceptable for non-terminal product surfaces such as onboarding, session lists, settings, and account screens, but it is not the v1 choice for the core terminal attach experience.

## Rationale

Hovvi's quality bar depends on terminal rendering, keyboard behavior, scrollback, reconnect semantics, mosh-compatible transport, background constraints, and later possible Network Extension or VPN/P2P work. These are platform-sensitive areas where native APIs and native debugging are the most reliable path.

Flutter can call platform code through platform channels and bind native code through Dart FFI, but using Flutter as the terminal shell still leaves the hardest parts in native code while adding a framework boundary in the most latency-sensitive path.

## Consequences

- iOS alpha should be a native app.
- Terminal, mosh transport, tmux scrollback, and background/network lifecycle code stay native or in a shared compiled core.
- Shared protocol definitions can still be generated for Swift/Kotlin/Dart later.
- Flutter remains a possible future shell if the terminal core is fully isolated and benchmarked.
