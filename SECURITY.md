# Security Policy

## Credential Handling

skyglass reads cloud credentials using the standard provider SDKs (AWS SDK, Azure SDK, Google Cloud SDK). It relies on whatever credentials are already configured in your environment — environment variables, shared config files, or instance metadata — and requests read-only permissions.

Credentials are never stored, logged, or transmitted. They are used only to make API calls from your local machine to your cloud provider.

## Data Privacy

- All scanned infrastructure data stays local. It is held in memory for the duration of the session and never written to disk unless you explicitly export it.
- There is no telemetry and no analytics. Skyglass makes no network calls beyond two categories:
  - **Your own cloud provider endpoints**, for read-only scans (when not in demo mode).
  - **The public `raw.githubusercontent.com/tf2d2/icons` CDN**, to fetch official AWS / Azure / GCP service-icon SVGs on first load. These requests contain no cloud data &mdash; only the icon filename is in the URL. If your environment blocks GitHub, icons fall back to local SVGs and scanning still works.

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

Report via [GitHub Security Advisories](https://github.com/itsyounish/Skyglass/security/advisories/new).

Include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact

You will receive an acknowledgment within 72 hours and a resolution timeline within 7 days.
