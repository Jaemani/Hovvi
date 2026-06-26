# ADR 0009: Native Upstream Crypto Smoke

## Status

Accepted

## Context

ADR 0008 chose an upstream-mosh-first core. The repository now vendors an audited mosh snapshot under `native/mosh-core/vendor/mosh`, but the shipped C ABI still returns `HOVVI_MOSH_UNAVAILABLE` until the real adapter is ready.

The next integration risk is whether Hovvi can compile and execute upstream mosh crypto code without mutating the vendored tree. Mosh's Autoconf output normally supplies `src/include/config.h`, and the crypto Makefile chooses between `ocb_internal.cc` and `ocb_openssl.cc` through `USE_AES_OCB_FROM_OPENSSL`.

## Decision

Add a separate `upstream-check` target that compiles a narrow AES-OCB crypto smoke from the vendored upstream source.

The target:

- copies a Hovvi-owned Apple CommonCrypto config shim into `build/upstream/include`
- compiles vendored `base64.cc`, `crypto.cc`, and `ocb_internal.cc`
- runs a session encrypt/decrypt round trip through upstream `Crypto::Session`
- keeps `make check` focused on the shipped unavailable ABI scaffold

CI runs both checks, but the npm package artifact continues to exclude `native/mosh-core/vendor/mosh`.

## Rationale

This makes the first GPL-linked native check explicit and isolated. It proves that the audited source snapshot contains the crypto implementation files needed by the future adapter, while avoiding a premature change to Swift-facing behavior or npm distribution contents.

Using `ocb_internal.cc` with Apple CommonCrypto matches the Apple-platform path that is most relevant to iOS/macOS builds. `ocb_openssl.cc` is still vendored and hashed so an OpenSSL build can be added later without changing the upstream snapshot selection.

## Consequences

- `native:upstream-check` is a development/CI check, not a shipped package feature.
- The vendor manifest now includes both `src/crypto/ocb_internal.cc` and `src/crypto/ocb_openssl.cc`.
- Future protobuf/network/terminal adapter work should add additional deep checks without folding GPL-linked code into the current MIT npm artifact.
