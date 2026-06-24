# Security Policy

Hovvi handles remote development sessions and should be treated as security-sensitive.

## Supported Versions

Only the latest published npm version is supported while the project is pre-1.0.

## Reporting a Vulnerability

Do not open a public issue for vulnerabilities.

Use GitHub private vulnerability reporting for `Jaemani/Hovvi`, or contact the maintainer through the GitHub profile if private reporting is unavailable.

## Current Security Model

- The Mac agent uses outbound relay connections only.
- The relay should not require inbound ports on the Mac.
- Development relay tokens are acceptable for local testing only.
- Hosted deployments must use scoped, revocable, expiring device credentials before public use.
- Terminal data should remain encrypted above the relay layer or end-to-end before production hosted relay use.
- Local config files are written atomically and forced to `0600` because they may contain GitHub or relay tokens.
