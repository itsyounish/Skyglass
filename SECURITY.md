# Security Policy

## Credential Handling

skyglass reads cloud credentials using the standard provider SDKs (AWS SDK, Azure SDK, Google Cloud SDK). It relies on whatever credentials are already configured in your environment — environment variables, shared config files, or instance metadata — and requests read-only permissions.

Credentials are never stored, logged, or transmitted. They are used only to make API calls from your local machine to your cloud provider.

## Data Privacy

- All scanned infrastructure data stays local. It is held in memory for the duration of the session and never written to disk unless you explicitly export it.
- There is no telemetry, no analytics, and no external API calls of any kind beyond your own cloud provider endpoints.
- Running `npx skyglass` in demo mode makes zero network requests.

## Recommended IAM Scope

Use a read-only policy scoped to the minimum services you want to visualize. Avoid using root or administrator credentials. The README lists suggested managed policies per provider.

## Supported Versions

Security fixes are applied to the latest release only.

| Version | Supported |
|---------|-----------|
| latest  | Yes       |
| older   | No        |

## Reporting a Vulnerability

Please **do not open a public GitHub issue** for security vulnerabilities.

Report via [GitHub Security Advisories](https://github.com/itsyounish/skyglass/security/advisories/new).

Include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact

You will receive an acknowledgment within 72 hours and a resolution timeline within 7 days.
